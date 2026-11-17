/**
 * Agenda Nova — configuração: tipos de agendamento, agenda do médico
 * (cor, intervalo, modo, expediente) e bloqueios. Tabelas da migração 046.
 */
import type { Database } from "better-sqlite3";
import { getDb } from "../db/index.js";
import { AgendaErro, traduzirErroSqlite } from "./agendaErro.js";
import { horaFimValida, horaParaMinutos, horaValida } from "./agendaHorario.js";

// ---------------------------------------------------------------------------
// Tipos de agendamento
// ---------------------------------------------------------------------------

export type TipoAtendimento = "consulta" | "admissional" | "exame";

export type AgendamentoTipo = {
  id: number;
  codigo: string | null;
  nome: string;
  cor: string;
  duracao_minutos: number;
  tipo_atendimento: TipoAtendimento;
  eh_retorno: 0 | 1;
  eh_encaixe: 0 | 1;
  ativo: 0 | 1;
  ordem: number;
};

const COLUNAS_TIPO = `id, codigo, nome, cor, duracao_minutos, tipo_atendimento,
  eh_retorno, eh_encaixe, ativo, ordem`;

export function listarTipos(
  opts: { incluirInativos?: boolean } = {},
  db: Database = getDb(),
): AgendamentoTipo[] {
  return db
    .prepare(
      `SELECT ${COLUNAS_TIPO} FROM agendamento_tipos
       ${opts.incluirInativos ? "" : "WHERE ativo = 1"}
       ORDER BY ordem, nome COLLATE NOCASE`,
    )
    .all() as AgendamentoTipo[];
}

export function obterTipo(id: number, db: Database = getDb()): AgendamentoTipo | undefined {
  return db
    .prepare(`SELECT ${COLUNAS_TIPO} FROM agendamento_tipos WHERE id = ?`)
    .get(id) as AgendamentoTipo | undefined;
}

export type TipoEntrada = {
  nome: string;
  cor: string;
  duracao_minutos: number;
  tipo_atendimento: TipoAtendimento;
  eh_retorno: boolean;
  eh_encaixe: boolean;
  ordem?: number;
};

export function criarTipo(dados: TipoEntrada, db: Database = getDb()): AgendamentoTipo {
  try {
    const ordem =
      dados.ordem ??
      ((db.prepare(`SELECT COALESCE(MAX(ordem), 0) + 1 FROM agendamento_tipos`).pluck().get() as number));
    const info = db
      .prepare(
        `INSERT INTO agendamento_tipos
           (nome, cor, duracao_minutos, tipo_atendimento, eh_retorno, eh_encaixe, ordem)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        dados.nome.trim(),
        dados.cor.toUpperCase(),
        dados.duracao_minutos,
        dados.tipo_atendimento,
        dados.eh_retorno ? 1 : 0,
        dados.eh_encaixe ? 1 : 0,
        ordem,
      );
    return obterTipo(Number(info.lastInsertRowid), db)!;
  } catch (e) {
    traduzirErroSqlite(e);
  }
}

export type TipoAlteracao = Partial<TipoEntrada> & { ativo?: boolean };

export function atualizarTipo(
  id: number,
  dados: TipoAlteracao,
  db: Database = getDb(),
): AgendamentoTipo {
  const atual = obterTipo(id, db);
  if (!atual) throw new AgendaErro("Tipo de agendamento não encontrado", 404, "nao_encontrado");

  // Lista fechada de colunas: nada vindo do cliente vira SQL.
  const sets: string[] = [];
  const params: unknown[] = [];
  const set = (col: string, v: unknown) => {
    sets.push(`${col} = ?`);
    params.push(v);
  };
  if (dados.nome !== undefined) set("nome", dados.nome.trim());
  if (dados.cor !== undefined) set("cor", dados.cor.toUpperCase());
  if (dados.duracao_minutos !== undefined) set("duracao_minutos", dados.duracao_minutos);
  if (dados.tipo_atendimento !== undefined) set("tipo_atendimento", dados.tipo_atendimento);
  if (dados.eh_retorno !== undefined) set("eh_retorno", dados.eh_retorno ? 1 : 0);
  if (dados.eh_encaixe !== undefined) set("eh_encaixe", dados.eh_encaixe ? 1 : 0);
  if (dados.ordem !== undefined) set("ordem", dados.ordem);
  if (dados.ativo !== undefined) set("ativo", dados.ativo ? 1 : 0);
  if (sets.length === 0) return atual;

  // Mudar o significado de um tipo em uso deixaria agendamentos incoerentes.
  const mudaSignificado =
    (dados.tipo_atendimento !== undefined && dados.tipo_atendimento !== atual.tipo_atendimento) ||
    (dados.eh_retorno !== undefined && Number(dados.eh_retorno) !== atual.eh_retorno) ||
    (dados.eh_encaixe !== undefined && Number(dados.eh_encaixe) !== atual.eh_encaixe);
  if (mudaSignificado && atual.codigo === null && tipoEmUso(id, db)) {
    throw new AgendaErro(
      "Tipo em uso: não é possível mudar atendimento, retorno ou encaixe. Crie um tipo novo.",
      409,
      "conflito",
    );
  }

  sets.push(`updated_at = datetime('now', 'localtime')`);
  try {
    db.prepare(`UPDATE agendamento_tipos SET ${sets.join(", ")} WHERE id = ?`).run(...params, id);
  } catch (e) {
    traduzirErroSqlite(e);
  }
  return obterTipo(id, db)!;
}

export function excluirTipo(id: number, db: Database = getDb()): void {
  if (!obterTipo(id, db)) {
    throw new AgendaErro("Tipo de agendamento não encontrado", 404, "nao_encontrado");
  }
  try {
    db.prepare(`DELETE FROM agendamento_tipos WHERE id = ?`).run(id);
  } catch (e) {
    traduzirErroSqlite(e); // triggers: sistema / em uso
  }
}

function tipoEmUso(id: number, db: Database): boolean {
  return !!db.prepare(`SELECT 1 FROM agendamentos WHERE agendamento_tipo_id = ? LIMIT 1`).get(id);
}

// ---------------------------------------------------------------------------
// Agenda do médico
// ---------------------------------------------------------------------------

export type ModoAgenda = "horario" | "chegada";

export type Turno = { dia_semana: number; inicio: string; fim: string };

export type ConfigMedico = {
  medico_id: number;
  nome: string;
  ativo: 0 | 1;
  cor: string;
  intervalo_minutos: number;
  modo: ModoAgenda;
  expediente: (Turno & { id: number })[];
};

/** Cor neutra só para o caso (não esperado) de médico sem linha em medico_agenda. */
const COR_PADRAO = "#64748B";

export function listarConfigMedicos(
  opts: { medicoIds?: number[]; incluirInativos?: boolean } = {},
  db: Database = getDb(),
): ConfigMedico[] {
  const where = [`u.perfil = 'medico'`];
  const params: unknown[] = [];
  if (!opts.incluirInativos) where.push(`u.ativo = 1`);
  if (opts.medicoIds?.length) {
    where.push(`u.id IN (${opts.medicoIds.map(() => "?").join(",")})`);
    params.push(...opts.medicoIds);
  }
  const medicos = db
    .prepare(
      `SELECT u.id AS medico_id, u.nome, u.ativo,
              COALESCE(m.cor, '${COR_PADRAO}') AS cor,
              COALESCE(m.intervalo_minutos, 30) AS intervalo_minutos,
              COALESCE(m.modo, 'chegada') AS modo
       FROM usuarios u
       LEFT JOIN medico_agenda m ON m.medico_id = u.id
       WHERE ${where.join(" AND ")}
       ORDER BY u.nome COLLATE NOCASE`,
    )
    .all(...params) as Omit<ConfigMedico, "expediente">[];
  if (medicos.length === 0) return [];

  const ids = medicos.map((m) => m.medico_id);
  const turnos = db
    .prepare(
      `SELECT id, medico_id, dia_semana, inicio, fim FROM medico_expediente
       WHERE medico_id IN (${ids.map(() => "?").join(",")})
       ORDER BY dia_semana, inicio`,
    )
    .all(...ids) as (Turno & { id: number; medico_id: number })[];
  const porMedico = new Map<number, (Turno & { id: number })[]>();
  for (const { medico_id, ...t } of turnos) {
    const arr = porMedico.get(medico_id) ?? [];
    arr.push(t);
    porMedico.set(medico_id, arr);
  }
  return medicos.map((m) => ({ ...m, expediente: porMedico.get(m.medico_id) ?? [] }));
}

export type ConfigMedicoEntrada = {
  intervalo_minutos?: number;
  modo?: ModoAgenda;
  /** Quando presente, substitui o expediente inteiro. */
  expediente?: Turno[];
};

export function salvarConfigMedico(
  medicoId: number,
  dados: ConfigMedicoEntrada,
  db: Database = getDb(),
): ConfigMedico {
  const medico = db
    .prepare(`SELECT id FROM usuarios WHERE id = ? AND perfil = 'medico'`)
    .get(medicoId);
  if (!medico) throw new AgendaErro("Médico não encontrado", 404, "nao_encontrado");

  try {
    db.transaction(() => {
      db.prepare(
        `INSERT OR IGNORE INTO medico_agenda (medico_id, cor) VALUES (?, ?)`,
      ).run(medicoId, COR_PADRAO);

      const sets: string[] = [];
      const params: unknown[] = [];
      if (dados.intervalo_minutos !== undefined) {
        sets.push("intervalo_minutos = ?");
        params.push(dados.intervalo_minutos);
      }
      if (dados.modo !== undefined) {
        sets.push("modo = ?");
        params.push(dados.modo);
      }
      if (sets.length) {
        sets.push(`updated_at = datetime('now', 'localtime')`);
        db.prepare(`UPDATE medico_agenda SET ${sets.join(", ")} WHERE medico_id = ?`).run(
          ...params,
          medicoId,
        );
      }

      if (dados.expediente !== undefined) {
        db.prepare(`DELETE FROM medico_expediente WHERE medico_id = ?`).run(medicoId);
        const ins = db.prepare(
          `INSERT INTO medico_expediente (medico_id, dia_semana, inicio, fim) VALUES (?, ?, ?, ?)`,
        );
        for (const t of dados.expediente) ins.run(medicoId, t.dia_semana, t.inicio, t.fim);
      }

      const final = db
        .prepare(
          `SELECT m.modo, (SELECT COUNT(*) FROM medico_expediente e WHERE e.medico_id = m.medico_id) AS turnos
           FROM medico_agenda m WHERE m.medico_id = ?`,
        )
        .get(medicoId) as { modo: ModoAgenda; turnos: number };
      if (final.modo === "horario" && final.turnos === 0) {
        throw new AgendaErro("Agenda por horário precisa de pelo menos um turno de expediente");
      }
    })();
  } catch (e) {
    traduzirErroSqlite(e);
  }
  return listarConfigMedicos({ medicoIds: [medicoId], incluirInativos: true }, db)[0]!;
}

// ---------------------------------------------------------------------------
// Bloqueios
// ---------------------------------------------------------------------------

export type Bloqueio = {
  id: number;
  medico_id: number | null;
  medico_nome: string | null;
  data_inicio: string;
  data_fim: string;
  hora_inicio: string;
  hora_fim: string;
  motivo: string | null;
  criado_por: number | null;
  criado_por_nome: string | null;
  created_at: string;
};

const SELECT_BLOQUEIO = `
  SELECT b.id, b.medico_id, um.nome AS medico_nome, b.data_inicio, b.data_fim,
         b.hora_inicio, b.hora_fim, b.motivo, b.criado_por, uc.nome AS criado_por_nome,
         b.created_at
  FROM agenda_bloqueios b
  LEFT JOIN usuarios um ON um.id = b.medico_id
  LEFT JOIN usuarios uc ON uc.id = b.criado_por`;

/** Bloqueios que tocam o período. Com médicos informados, inclui os da clínica toda. */
export function listarBloqueios(
  filtro: { de: string; ate: string; medicoIds?: number[] },
  db: Database = getDb(),
): Bloqueio[] {
  const where = [`b.data_inicio <= ?`, `b.data_fim >= ?`];
  const params: unknown[] = [filtro.ate, filtro.de];
  if (filtro.medicoIds?.length) {
    where.push(`(b.medico_id IS NULL OR b.medico_id IN (${filtro.medicoIds.map(() => "?").join(",")}))`);
    params.push(...filtro.medicoIds);
  }
  return db
    .prepare(`${SELECT_BLOQUEIO} WHERE ${where.join(" AND ")} ORDER BY b.data_inicio, b.hora_inicio, b.id`)
    .all(...params) as Bloqueio[];
}

export function obterBloqueio(id: number, db: Database = getDb()): Bloqueio | undefined {
  return db.prepare(`${SELECT_BLOQUEIO} WHERE b.id = ?`).get(id) as Bloqueio | undefined;
}

export type BloqueioEntrada = {
  medico_id: number | null;
  data_inicio: string;
  data_fim: string;
  hora_inicio: string;
  hora_fim: string;
  motivo?: string | null;
};

/**
 * Cria o bloqueio. Agendamentos ativos que caem nele NÃO são mexidos: voltam
 * em `agendamentos_afetados` para a tela avisar (remarcar é decisão humana).
 */
export function criarBloqueio(
  dados: BloqueioEntrada,
  criadoPor: number,
  db: Database = getDb(),
): { bloqueio: Bloqueio; agendamentos_afetados: number } {
  let id: number;
  try {
    const info = db
      .prepare(
        `INSERT INTO agenda_bloqueios (medico_id, data_inicio, data_fim, hora_inicio, hora_fim, motivo, criado_por)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        dados.medico_id,
        dados.data_inicio,
        dados.data_fim,
        dados.hora_inicio,
        dados.hora_fim,
        dados.motivo?.trim() || null,
        criadoPor,
      );
    id = Number(info.lastInsertRowid);
  } catch (e) {
    traduzirErroSqlite(e);
  }
  return {
    bloqueio: obterBloqueio(id, db)!,
    agendamentos_afetados: contarAgendamentosNoBloqueio(dados, db),
  };
}

export function excluirBloqueio(id: number, db: Database = getDb()): void {
  const r = db.prepare(`DELETE FROM agenda_bloqueios WHERE id = ?`).run(id);
  if (r.changes === 0) throw new AgendaErro("Bloqueio não encontrado", 404, "nao_encontrado");
}

/** Expressão SQL: minutos desde 00:00 de uma coluna 'HH:MM'. */
export function sqlMinutos(col: string): string {
  return `(CAST(substr(${col}, 1, 2) AS INTEGER) * 60 + CAST(substr(${col}, 4, 2) AS INTEGER))`;
}

function contarAgendamentosNoBloqueio(b: BloqueioEntrada, db: Database): number {
  const params: unknown[] = [
    b.data_inicio,
    b.data_fim,
    horaParaMinutos(b.hora_fim),
    horaParaMinutos(b.hora_inicio),
  ];
  let sql = `
    SELECT COUNT(*) FROM agendamentos a
    WHERE a.data BETWEEN ? AND ?
      AND a.status NOT IN ('cancelado', 'nao_compareceu')
      AND ${sqlMinutos("a.hora")} < ?
      AND ? < ${sqlMinutos("a.hora")} + a.duracao_minutos`;
  if (b.medico_id != null) {
    sql += ` AND a.medico_id = ?`;
    params.push(b.medico_id);
  }
  return db.prepare(sql).pluck().get(...params) as number;
}

// ---------------------------------------------------------------------------
// Horário padrão único da agenda (decisão do cliente 13/11/2026 — migração 047)
// Ajustado pelo botão ⚙ da agenda. Na marcação, início/fim podem ser mudados.
// ---------------------------------------------------------------------------

export const INTERVALOS_AGENDA = [5, 10, 15, 20, 30, 60] as const;

export type HorarioPadrao = { inicio: string; fim: string; intervalo_minutos: number };

const HORARIO_PADRAO_FABRICA: HorarioPadrao = { inicio: "07:00", fim: "19:00", intervalo_minutos: 30 };

const CHAVES_HORARIO = {
  inicio: "agenda_hora_inicio",
  fim: "agenda_hora_fim",
  intervalo_minutos: "agenda_intervalo_minutos",
} as const;

/** Lê de app_meta; valor ausente ou corrompido cai no padrão de fábrica (07–19 / 30). */
export function obterHorarioPadrao(db: Database = getDb()): HorarioPadrao {
  const linhas = db
    .prepare(`SELECT chave, valor FROM app_meta WHERE chave IN (?, ?, ?)`)
    .all(CHAVES_HORARIO.inicio, CHAVES_HORARIO.fim, CHAVES_HORARIO.intervalo_minutos) as {
    chave: string;
    valor: string;
  }[];
  const v = new Map(linhas.map((l) => [l.chave, l.valor]));
  const inicio = v.get(CHAVES_HORARIO.inicio) ?? "";
  const fim = v.get(CHAVES_HORARIO.fim) ?? "";
  const intervalo = Number(v.get(CHAVES_HORARIO.intervalo_minutos));
  const ok =
    horaValida(inicio) &&
    horaFimValida(fim) &&
    inicio < fim &&
    (INTERVALOS_AGENDA as readonly number[]).includes(intervalo);
  return ok ? { inicio, fim, intervalo_minutos: intervalo } : { ...HORARIO_PADRAO_FABRICA };
}

export function salvarHorarioPadrao(h: HorarioPadrao, db: Database = getDb()): HorarioPadrao {
  if (!horaValida(h.inicio) || !horaFimValida(h.fim)) {
    throw new AgendaErro("Horário no formato HH:MM");
  }
  if (h.inicio >= h.fim) throw new AgendaErro("O fim do dia precisa ser depois do início");
  if (!(INTERVALOS_AGENDA as readonly number[]).includes(h.intervalo_minutos)) {
    throw new AgendaErro("Intervalo: 5, 10, 15, 20, 30 ou 60 minutos");
  }
  const up = db.prepare(
    `INSERT INTO app_meta (chave, valor) VALUES (?, ?)
     ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`,
  );
  db.transaction(() => {
    up.run(CHAVES_HORARIO.inicio, h.inicio);
    up.run(CHAVES_HORARIO.fim, h.fim);
    up.run(CHAVES_HORARIO.intervalo_minutos, String(h.intervalo_minutos));
  })();
  return obterHorarioPadrao(db);
}
