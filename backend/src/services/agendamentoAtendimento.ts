import type { Database } from "better-sqlite3";
import { getDb } from "../db/index.js";
import { hojeIsoLocal } from "../lib/diasUteis.js";
import type { ModoClinico } from "./cobrancaCadastros.js";
import {
  adicionarItemConta,
  atualizarConta,
  buscarContaPorAgendamento,
  procedimentoAtivoNaConta,
} from "./cobrancaContas.js";

export type TipoAtendimentoDerivado = "consulta" | "admissional" | "exame";

export type AgendamentoProcedimentoApi = {
  id: number;
  nome: string;
  modo_clinico: ModoClinico;
  ordem: number;
};

type ProcCarregado = {
  id: number;
  nome: string;
  codigo: string | null;
  modo_clinico: ModoClinico;
  ativo: number;
  orientacoes_paciente: string | null;
};

const STATUS_AGENDA_BLOQUEADO = new Set(["cancelado", "nao_compareceu"]);

export class AgendamentoAtendimentoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgendamentoAtendimentoError";
  }
}

export const MSG_SLOT_PACIENTE_MEDICO_DUPLICADO =
  "Este paciente já está agendado com este médico neste horário. Inclua outro procedimento no mesmo agendamento, ou escolha outro horário.";

export function isErroSlotPacienteMedicoDuplicado(e: unknown): boolean {
  const err = e as { code?: string; message?: string };
  if (err.message?.includes("idx_agendamentos_slot_paciente_medico")) {
    return true;
  }
  if (err.code !== "SQLITE_CONSTRAINT_UNIQUE" && err.code !== "SQLITE_CONSTRAINT") {
    return false;
  }
  const msg = err.message ?? "";
  return (
    msg.includes("paciente_id") &&
    msg.includes("medico_id") &&
    msg.includes("hora")
  );
}

/** Um paciente não ocupa o mesmo horário com o mesmo médico duas vezes. */
export function assertSlotPacienteMedicoLivre(
  params: {
    paciente_id: number;
    medico_id: number;
    data: string;
    hora: string;
    ignorarId?: number;
  },
  db: Database = getDb(),
): void {
  const row = db
    .prepare(
      `SELECT id FROM agendamentos
       WHERE paciente_id = ? AND medico_id = ? AND data = ? AND hora = ?
         AND status NOT IN ('cancelado', 'nao_compareceu')
         AND id != ?
       LIMIT 1`,
    )
    .get(
      params.paciente_id,
      params.medico_id,
      params.data,
      params.hora,
      params.ignorarId ?? 0,
    ) as { id: number } | undefined;
  if (row) {
    throw new AgendamentoAtendimentoError(MSG_SLOT_PACIENTE_MEDICO_DUPLICADO);
  }
}

/** Contrato U5: tipo/procedimento_id/eh_retorno não entram mais no POST. */
export function assertContratoAgendamentoNovo(body: unknown): void {
  if (!body || typeof body !== "object") return;
  const o = body as Record<string, unknown>;
  if ("tipo_atendimento" in o) {
    throw new AgendamentoAtendimentoError(
      "Não envie tipo_atendimento. Informe os procedimentos.",
    );
  }
  if ("procedimento_id" in o) {
    throw new AgendamentoAtendimentoError(
      "Use procedimento_ids (lista). O campo procedimento_id isolado não é mais aceito.",
    );
  }
  if ("eh_retorno" in o) {
    throw new AgendamentoAtendimentoError(
      "O retorno vem do procedimento Consulta retorno na lista, não de um campo separado.",
    );
  }
}

function carregarProcedimentos(
  ids: number[],
  db: Database,
): ProcCarregado[] {
  if (ids.length === 0) {
    throw new AgendamentoAtendimentoError("Informe pelo menos um procedimento");
  }
  const uniq = new Set(ids);
  if (uniq.size !== ids.length) {
    throw new AgendamentoAtendimentoError("Procedimento repetido na lista");
  }
  const ph = ids.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT id, nome, codigo, modo_clinico, ativo, orientacoes_paciente
       FROM procedimentos WHERE id IN (${ph})`,
    )
    .all(...ids) as ProcCarregado[];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ordered: ProcCarregado[] = [];
  for (const id of ids) {
    const p = byId.get(id);
    if (!p) {
      throw new AgendamentoAtendimentoError("Procedimento não encontrado");
    }
    if (!p.ativo) {
      throw new AgendamentoAtendimentoError(
        `Procedimento inativo: ${p.nome}`,
      );
    }
    ordered.push(p);
  }
  return ordered;
}

export function validarListaProcedimentos(
  ids: number[],
  db: Database = getDb(),
): ProcCarregado[] {
  const procs = carregarProcedimentos(ids, db);
  const temProntuario = procs.some((p) => p.modo_clinico === "prontuario");
  const temAso = procs.some((p) => p.modo_clinico === "aso");
  if (temProntuario && temAso) {
    throw new AgendamentoAtendimentoError(
      "Não misture consulta e ASO no mesmo horário",
    );
  }
  return procs;
}

export function derivarTipoAtendimento(
  procs: { modo_clinico: ModoClinico }[],
): TipoAtendimentoDerivado {
  if (procs.some((p) => p.modo_clinico === "prontuario")) return "consulta";
  if (procs.some((p) => p.modo_clinico === "aso")) return "admissional";
  return "exame";
}

export function listaTemConsultaRetorno(
  procs: { codigo: string | null; nome: string }[],
): boolean {
  return procs.some(
    (p) => p.codigo === "RET" || p.nome === "Consulta retorno",
  );
}

export function assertConvenioAtivo(
  convenioId: number,
  db: Database = getDb(),
): void {
  const row = db
    .prepare(`SELECT id FROM convenios WHERE id = ? AND ativo = 1`)
    .get(convenioId);
  if (!row) {
    throw new AgendamentoAtendimentoError(
      "Convênio obrigatório e precisa estar ativo",
    );
  }
}

export function listarProcedimentosDoAgendamento(
  agendamentoId: number,
  db: Database = getDb(),
): AgendamentoProcedimentoApi[] {
  return db
    .prepare(
      `SELECT p.id, p.nome, p.modo_clinico, ap.ordem
       FROM agendamento_procedimentos ap
       JOIN procedimentos p ON p.id = ap.procedimento_id
       WHERE ap.agendamento_id = ?
       ORDER BY ap.ordem, ap.id`,
    )
    .all(agendamentoId) as AgendamentoProcedimentoApi[];
}

export function anexarProcedimentosAgendamentos<T extends { id: number }>(
  rows: T[],
  db: Database = getDb(),
): (T & { procedimentos: AgendamentoProcedimentoApi[] })[] {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const ph = ids.map(() => "?").join(",");
  const lista = db
    .prepare(
      `SELECT ap.agendamento_id, p.id, p.nome, p.modo_clinico, ap.ordem
       FROM agendamento_procedimentos ap
       JOIN procedimentos p ON p.id = ap.procedimento_id
       WHERE ap.agendamento_id IN (${ph})
       ORDER BY ap.agendamento_id, ap.ordem, ap.id`,
    )
    .all(...ids) as (AgendamentoProcedimentoApi & { agendamento_id: number })[];
  const map = new Map<number, AgendamentoProcedimentoApi[]>();
  for (const row of lista) {
    const { agendamento_id, ...proc } = row;
    const arr = map.get(agendamento_id) ?? [];
    arr.push(proc);
    map.set(agendamento_id, arr);
  }
  return rows.map((r) => ({
    ...r,
    procedimentos: map.get(r.id) ?? [],
  }));
}

export function horarioTemModo(
  agendamentoId: number,
  modo: ModoClinico,
  db: Database = getDb(),
): boolean {
  return listarProcedimentosDoAgendamento(agendamentoId, db).some(
    (p) => p.modo_clinico === modo,
  );
}

/** Horário só com exames (`modo_clinico = nenhum`): sem prontuário e sem ASO. */
export function horarioSoExame(
  agendamentoId: number,
  db: Database = getDb(),
): boolean {
  const procs = listarProcedimentosDoAgendamento(agendamentoId, db);
  if (procs.length > 0) {
    return procs.every(
      (p) => p.modo_clinico !== "prontuario" && p.modo_clinico !== "aso",
    );
  }
  const ag = db
    .prepare(`SELECT tipo_atendimento FROM agendamentos WHERE id = ?`)
    .get(agendamentoId) as { tipo_atendimento?: string } | undefined;
  return ag?.tipo_atendimento === "exame";
}

export function assertHorarioAbreProntuario(
  agendamentoId: number,
  db: Database = getDb(),
): void {
  const procs = listarProcedimentosDoAgendamento(agendamentoId, db);
  if (procs.some((p) => p.modo_clinico === "aso")) {
    throw new AgendamentoAtendimentoError(
      "Este horário tem procedimento de ASO. Abra o ASO, não o prontuário.",
    );
  }
  if (!procs.some((p) => p.modo_clinico === "prontuario")) {
    throw new AgendamentoAtendimentoError(
      "Este horário não tem procedimento de consulta. Não abre prontuário.",
    );
  }
}

export function assertHorarioAbreAso(
  agendamentoId: number,
  db: Database = getDb(),
): void {
  const procs = listarProcedimentosDoAgendamento(agendamentoId, db);
  if (procs.some((p) => p.modo_clinico === "prontuario")) {
    throw new AgendamentoAtendimentoError(
      "Este horário tem procedimento de consulta. Abra o prontuário, não o ASO.",
    );
  }
  if (!procs.some((p) => p.modo_clinico === "aso")) {
    throw new AgendamentoAtendimentoError(
      "Este horário não tem procedimento de ASO. Não abre ficha ocupacional.",
    );
  }
}

function wrapErroNn(e: unknown): never {
  if (e instanceof AgendamentoAtendimentoError) throw e;
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("pelo menos um procedimento")) {
    throw new AgendamentoAtendimentoError(
      "Informe pelo menos um procedimento",
    );
  }
  if (msg.includes("Não misture")) {
    throw new AgendamentoAtendimentoError(
      "Não misture consulta e ASO no mesmo horário",
    );
  }
  throw e instanceof Error ? e : new Error(String(e));
}

function itensImpedemRemocao(
  contaId: number,
  procedimentoId: number,
  db: Database,
): { realizado: boolean; nome: string } {
  const rows = db
    .prepare(
      `SELECT ci.status, p.nome
       FROM conta_itens ci
       JOIN procedimentos p ON p.id = ci.procedimento_id
       WHERE ci.conta_id = ? AND ci.procedimento_id = ?
         AND ci.status IN ('previsto', 'solicitado', 'realizado')`,
    )
    .all(contaId, procedimentoId) as { status: string; nome: string }[];
  const realizado = rows.some((r) => r.status === "realizado");
  return { realizado, nome: rows[0]?.nome ?? "procedimento" };
}

function cancelarItensDoProcedimento(
  contaId: number,
  procedimentoId: number,
  db: Database,
): void {
  db.prepare(
    `UPDATE conta_itens SET status = 'cancelado'
     WHERE conta_id = ? AND procedimento_id = ?
       AND status IN ('previsto', 'solicitado')`,
  ).run(contaId, procedimentoId);
}

function aplicarDiffNn(
  agendamentoId: number,
  ids: number[],
  origemNovos: "agenda" | "secretaria" | "medico",
  db: Database,
): { added: number[]; removed: number[] } {
  const atuais = db
    .prepare(
      `SELECT id, procedimento_id FROM agendamento_procedimentos
       WHERE agendamento_id = ? ORDER BY ordem, id`,
    )
    .all(agendamentoId) as { id: number; procedimento_id: number }[];
  const keep = new Set(ids);
  const atuaisSet = new Set(atuais.map((r) => r.procedimento_id));
  const added = ids.filter((id) => !atuaisSet.has(id));
  const removed = atuais
    .filter((r) => !keep.has(r.procedimento_id))
    .map((r) => r.procedimento_id);

  const ins = db.prepare(
    `INSERT INTO agendamento_procedimentos (agendamento_id, procedimento_id, ordem, origem)
     VALUES (?, ?, ?, ?)`,
  );
  ids.forEach((pid, ordem) => {
    if (!atuaisSet.has(pid)) {
      ins.run(agendamentoId, pid, ordem, origemNovos);
    } else {
      db.prepare(
        `UPDATE agendamento_procedimentos SET ordem = ? WHERE agendamento_id = ? AND procedimento_id = ?`,
      ).run(ordem, agendamentoId, pid);
    }
  });

  for (const pid of removed) {
    db.prepare(
      `DELETE FROM agendamento_procedimentos
       WHERE agendamento_id = ? AND procedimento_id = ?`,
    ).run(agendamentoId, pid);
  }

  return { added, removed };
}

/** Depois do INSERT do horário (o trigger já cria a 1ª linha N:N). */
export function gravarProcedimentosExtras(
  agendamentoId: number,
  ids: number[],
  db: Database = getDb(),
): void {
  if (ids.length <= 1) return;
  const ins = db.prepare(
    `INSERT INTO agendamento_procedimentos (agendamento_id, procedimento_id, ordem, origem)
     VALUES (?, ?, ?, 'agenda')`,
  );
  ids.forEach((pid, ordem) => {
    if (ordem === 0) return;
    ins.run(agendamentoId, pid, ordem);
  });
}

export function sincronizarProcedimentosAgendamento(
  params: {
    agendamentoId: number;
    procedimentoIds: number[];
    convenioId?: number;
    origemNovos?: "agenda" | "secretaria" | "medico";
    usuarioId: number;
  },
  db: Database = getDb(),
): {
  tipo: TipoAtendimentoDerivado;
  eh_retorno: boolean;
  procedimento_id: number;
  whatsapp_preparo_pendente: boolean;
} {
  const origemNovos = params.origemNovos ?? "secretaria";
  const run = db.transaction(() => {
    const ag = db
      .prepare(
        `SELECT id, data, status, convenio_id, confirmacao_enviada,
                ficha_template_id, whatsapp_preparo_pendente
         FROM agendamentos WHERE id = ?`,
      )
      .get(params.agendamentoId) as
      | {
          id: number;
          data: string;
          status: string;
          convenio_id: number;
          confirmacao_enviada: number;
          ficha_template_id: number | null;
          whatsapp_preparo_pendente: number;
        }
      | undefined;
    if (!ag) {
      throw new AgendamentoAtendimentoError("Agendamento não encontrado");
    }
    if (STATUS_AGENDA_BLOQUEADO.has(ag.status)) {
      throw new AgendamentoAtendimentoError(
        "Não é possível alterar procedimentos de um horário cancelado ou em que o paciente não veio",
      );
    }

    const conta = buscarContaPorAgendamento(params.agendamentoId, db);
    if (conta && conta.status !== "em_aberto") {
      throw new AgendamentoAtendimentoError(
        "Reabra a conta para alterar procedimentos ou convênio",
      );
    }

    const procs = validarListaProcedimentos(params.procedimentoIds, db);
    const convenioId = params.convenioId ?? ag.convenio_id;
    if (params.convenioId != null) {
      assertConvenioAtivo(params.convenioId, db);
    }

    const atuaisIds = listarProcedimentosDoAgendamento(
      params.agendamentoId,
      db,
    ).map((p) => p.id);
    const keep = new Set(params.procedimentoIds);
    const removed = atuaisIds.filter((id) => !keep.has(id));

    if (conta) {
      for (const pid of removed) {
        const bloqueio = itensImpedemRemocao(conta.id, pid, db);
        if (bloqueio.realizado) {
          throw new AgendamentoAtendimentoError(
            `Não é possível remover ${bloqueio.nome}: item já realizado`,
          );
        }
      }
    }

    let added: number[] = [];
    try {
      const diff = aplicarDiffNn(
        params.agendamentoId,
        params.procedimentoIds,
        origemNovos,
        db,
      );
      added = diff.added;
    } catch (e) {
      wrapErroNn(e);
    }

    if (conta) {
      for (const pid of removed) {
        cancelarItensDoProcedimento(conta.id, pid, db);
      }
      for (const pid of added) {
        if (procedimentoAtivoNaConta(conta.id, pid, db)) continue;
        adicionarItemConta(
          conta.id,
          { procedimento_id: pid, status: "previsto" },
          params.usuarioId,
          db,
        );
      }
    }

    const tipo = derivarTipoAtendimento(procs);
    const eh_retorno = listaTemConsultaRetorno(procs);
    // Espelho procedimento_id: trigger 034 ainda sincroniza a coluna; não dropar aqui.
    db.prepare(
      `UPDATE agendamentos
       SET procedimento_id = ?, tipo_atendimento = ?, eh_retorno = ?,
           convenio_id = ?,
           ficha_template_id = CASE WHEN ? = 'consulta' THEN ficha_template_id ELSE NULL END,
           aso_template_id = CASE WHEN ? = 'admissional' THEN aso_template_id ELSE NULL END,
           updated_at = datetime('now', 'localtime')
       WHERE id = ?`,
    ).run(
      params.procedimentoIds[0],
      tipo,
      eh_retorno ? 1 : 0,
      convenioId,
      tipo,
      tipo,
      params.agendamentoId,
    );

    if (conta && params.convenioId != null && params.convenioId !== conta.convenio_id) {
      atualizarConta(conta.id, { convenio_id: params.convenioId }, db);
    }

    const novosComPreparo = procs.filter(
      (p) =>
        added.includes(p.id) && String(p.orientacoes_paciente ?? "").trim() !== "",
    );
    let pendente = ag.whatsapp_preparo_pendente === 1;
    if (
      ag.confirmacao_enviada === 1 &&
      novosComPreparo.length > 0 &&
      hojeIsoLocal() < ag.data
    ) {
      db.prepare(
        `UPDATE agendamentos SET whatsapp_preparo_pendente = 1 WHERE id = ?`,
      ).run(params.agendamentoId);
      pendente = true;
    }

    return {
      tipo,
      eh_retorno,
      procedimento_id: params.procedimentoIds[0]!,
      whatsapp_preparo_pendente: pendente,
    };
  });

  return run();
}

/** @deprecated Use sincronizarProcedimentosAgendamento (U10). */
export function substituirProcedimentosAgendamento(
  agendamentoId: number,
  ids: number[],
  origem: "agenda" | "secretaria" | "medico",
  db: Database = getDb(),
): {
  tipo: TipoAtendimentoDerivado;
  eh_retorno: boolean;
  procedimento_id: number;
} {
  const r = sincronizarProcedimentosAgendamento(
    {
      agendamentoId,
      procedimentoIds: ids,
      origemNovos: origem,
      usuarioId: 1,
    },
    db,
  );
  return {
    tipo: r.tipo,
    eh_retorno: r.eh_retorno,
    procedimento_id: r.procedimento_id,
  };
}
