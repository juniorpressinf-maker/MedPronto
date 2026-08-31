import type { Database } from "better-sqlite3";
import { getDb } from "../db/index.js";
import { ASO_TITULO_CURTO } from "../admissional/labels.js";
import { CONVENIO_PARTICULAR_ID } from "./cobrancaCadastros.js";
import { nomeExameParaExibicao } from "../utils/examesStorage.js";

export const FORMAS_PAGAMENTO = [
  "pix",
  "credito",
  "debito",
  "dinheiro",
  "transferencia",
] as const;

export type FormaPagamento = (typeof FORMAS_PAGAMENTO)[number];

export type ContaPagamentoRow = {
  id: number;
  conta_id: number;
  forma: FormaPagamento | "repasse_convenio" | string;
  valor_centavos: number;
  registrado_em: string;
  registrado_por: number | null;
  observacao: string | null;
};

export function carregarPagamentos(
  contaId: number,
  db: Database = getDb(),
): ContaPagamentoRow[] {
  return db
    .prepare(
      `SELECT id, conta_id, forma, valor_centavos, registrado_em, registrado_por, observacao
       FROM conta_pagamentos WHERE conta_id = ? ORDER BY id`,
    )
    .all(contaId) as ContaPagamentoRow[];
}

export function totalPagoCentavos(pagamentos: ContaPagamentoRow[]): number {
  return pagamentos.reduce((s, p) => s + p.valor_centavos, 0);
}

export const STATUS_CONTA_EDITAVEL = ["em_aberto"] as const;

export const STATUS_CONTA_VALIDOS = [
  "em_aberto",
  "aguardando_pagamento",
  "pago",
  "parcialmente_pago",
  "a_faturar_convenio",
  "isento",
  "cancelada",
] as const;

export const STATUS_ITEM_COBRAVEL = ["previsto", "solicitado", "realizado"] as const;

export const STATUS_ITEM_VALIDOS = [
  "previsto",
  "solicitado",
  "realizado",
  "cancelado",
] as const;

export type ContaItemStatus =
  | "previsto"
  | "solicitado"
  | "realizado"
  | "cancelado";

export type ContaItemRow = {
  id: number;
  conta_id: number;
  procedimento_id: number | null;
  executado_por: number | null;
  status: ContaItemStatus;
  valor_centavos: number;
  quantidade: number;
  solicitado_por: number | null;
  solicitado_em: string | null;
  realizado_em: string | null;
  observacao: string | null;
  exame_anexo_id?: number | null;
  exame_nome?: string | null;
  admissional_id?: number | null;
  admissional_status?: string | null;
  admissional_conclusao?: string | null;
  admissional_medico_nome?: string | null;
  procedimento_nome?: string;
  procedimento_codigo?: string | null;
  procedimento_modo_clinico?: "prontuario" | "aso" | "nenhum" | null;
};

export type ContaRow = {
  id: number;
  paciente_id: number;
  data: string;
  convenio_id: number | null;
  agendamento_id: number | null;
  prontuario_id: number | null;
  status: string;
  observacao: string | null;
  valor_desconto_centavos: number;
  motivo_desconto: string | null;
  fechada_em: string | null;
  fechada_por: number | null;
  created_at: string;
  created_by: number | null;
  paciente_nome?: string;
  convenio_nome?: string;
  agendamento_hora?: string | null;
  procedimentos_nomes?: string | null;
};

/** Nomes dos itens ativos da conta `c`, na ordem de inclusão. */
export const SQL_CONTA_PROCEDIMENTOS_NOMES = `(
  SELECT GROUP_CONCAT(x.nome, ', ')
  FROM (
    SELECT pr.nome AS nome
    FROM conta_itens ci
    JOIN procedimentos pr ON pr.id = ci.procedimento_id
    WHERE ci.conta_id = c.id AND ci.status != 'cancelado'
    ORDER BY ci.id
  ) x
)`;

export type ContaConvenioGuiaRow = {
  conta_id: number;
  numero_guia: string | null;
  senha: string | null;
  autorizacao: string | null;
  data_envio: string | null;
  observacao: string | null;
};

export type ContaDetalhe = ContaRow & {
  itens: ContaItemRow[];
  pagamentos: ContaPagamentoRow[];
  convenio_guia: ContaConvenioGuiaRow | null;
  total_itens_centavos: number;
  total_liquido_centavos: number;
  total_pago_centavos: number;
  saldo_pendente_centavos: number;
};

export class ProcedimentoDuplicadoError extends Error {
  readonly codigo = "procedimento_duplicado" as const;
  readonly procedimento_nome: string;

  constructor(procedimentoNome: string) {
    super(`"${procedimentoNome}" já consta nesta conta`);
    this.name = "ProcedimentoDuplicadoError";
    this.procedimento_nome = procedimentoNome;
  }
}

/** Item cobrável com o mesmo procedimento (previsto, solicitado ou realizado). */
export function procedimentoAtivoNaConta(
  contaId: number,
  procedimentoId: number,
  db: Database = getDb(),
): boolean {
  const row = db
    .prepare(
      `SELECT 1 FROM conta_itens
       WHERE conta_id = ? AND procedimento_id = ?
         AND status IN ('previsto', 'solicitado', 'realizado')
       LIMIT 1`,
    )
    .get(contaId, procedimentoId);
  return !!row;
}

function hojeIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function obterPrecoProcedimento(
  procedimentoId: number,
  convenioId: number,
  db: Database = getDb(),
): number {
  const row = db
    .prepare(
      `SELECT valor_centavos FROM procedimento_precos
       WHERE procedimento_id = ? AND convenio_id = ?`,
    )
    .get(procedimentoId, convenioId) as { valor_centavos: number } | undefined;
  return row?.valor_centavos ?? 0;
}

export function calcularTotalItens(itens: ContaItemRow[]): number {
  return itens
    .filter((i) =>
      (STATUS_ITEM_COBRAVEL as readonly string[]).includes(i.status),
    )
    .reduce((s, i) => s + i.valor_centavos * i.quantidade, 0);
}

export function contarItensCobraveis(contaId: number, db: Database = getDb()): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM conta_itens
       WHERE conta_id = ? AND status IN ('previsto', 'solicitado', 'realizado')`,
    )
    .get(contaId) as { n: number };
  return row.n;
}

export function assertContaTemItensCobraveis(contaId: number, db: Database = getDb()): void {
  if (contarItensCobraveis(contaId, db) === 0) {
    throw new Error(
      "Inclua pelo menos um procedimento na conta antes de fechar ou receber",
    );
  }
}

function assertContaEditavel(conta: ContaRow): void {
  if (!(STATUS_CONTA_EDITAVEL as readonly string[]).includes(conta.status)) {
    throw new Error("Conta fechada ou não editável");
  }
  if (conta.fechada_em) {
    throw new Error("Conta fechada ou não editável");
  }
}

/** Valida vínculos opcionais da conta com o paciente (I4). */
export function assertVinculoContaPaciente(
  pacienteId: number,
  opts: {
    prontuario_id?: number | null;
    agendamento_id?: number | null;
  },
  db: Database,
): void {
  if (opts.prontuario_id) {
    const pr = db
      .prepare(`SELECT paciente_id FROM prontuarios WHERE id = ?`)
      .get(opts.prontuario_id) as { paciente_id: number } | undefined;
    if (!pr || pr.paciente_id !== pacienteId) {
      throw new Error("Prontuário inconsistente com paciente da conta");
    }
  }
  if (opts.agendamento_id) {
    const ag = db
      .prepare(`SELECT paciente_id FROM agendamentos WHERE id = ?`)
      .get(opts.agendamento_id) as { paciente_id: number } | undefined;
    if (!ag || ag.paciente_id !== pacienteId) {
      throw new Error("Agendamento inconsistente com paciente da conta");
    }
  }
}

function assertAdmissionalDisponivelItem(
  itemId: number,
  admissionalId: number,
  db: Database,
): void {
  const row = db
    .prepare(
      `SELECT id FROM conta_itens
       WHERE admissional_id = ? AND status != 'cancelado' AND id != ?
       LIMIT 1`,
    )
    .get(admissionalId, itemId);
  if (row) {
    throw new Error(`${ASO_TITULO_CURTO} já vinculado a outro item de cobrança`);
  }
}

function assertAdmissionalDaConta(
  contaId: number,
  admissionalId: number,
  db: Database,
): void {
  const aso = db
    .prepare(
      `SELECT a.paciente_id, a.retificacao_de_id, c.paciente_id AS conta_paciente_id
       FROM admissionais a
       JOIN contas_atendimento c ON c.id = ?
       WHERE a.id = ?`,
    )
    .get(contaId, admissionalId) as
    | {
        paciente_id: number;
        retificacao_de_id: number | null;
        conta_paciente_id: number;
      }
    | undefined;
  if (!aso || aso.paciente_id !== aso.conta_paciente_id) {
    throw new Error(`${ASO_TITULO_CURTO} inconsistente com paciente da conta`);
  }
  if (aso.retificacao_de_id) {
    throw new Error(
      `Retificação de ${ASO_TITULO_CURTO} não se vincula à cobrança — o item permanece no atestado original`,
    );
  }
}

export function sugerirConvenioPaciente(
  pacienteId: number,
  db: Database = getDb(),
): number {
  const doHorario = db
    .prepare(
      `SELECT convenio_id FROM agendamentos
       WHERE paciente_id = ? AND convenio_id IS NOT NULL
       ORDER BY data DESC, id DESC LIMIT 1`,
    )
    .get(pacienteId) as { convenio_id: number } | undefined;
  if (doHorario?.convenio_id) return doHorario.convenio_id;
  const daConta = db
    .prepare(
      `SELECT convenio_id FROM contas_atendimento
       WHERE paciente_id = ? AND convenio_id IS NOT NULL
       ORDER BY created_at DESC LIMIT 1`,
    )
    .get(pacienteId) as { convenio_id: number } | undefined;
  return daConta?.convenio_id ?? CONVENIO_PARTICULAR_ID;
}

/** Walk-in: conta ativa sem horário. Não serve para check-in de agendamento. */
export function buscarContaPorPacienteData(
  pacienteId: number,
  data: string,
  db: Database = getDb(),
): ContaRow | undefined {
  return db
    .prepare(
      `SELECT * FROM contas_atendimento
       WHERE paciente_id = ? AND data = ? AND agendamento_id IS NULL
         AND status != 'cancelada'`,
    )
    .get(pacienteId, data) as ContaRow | undefined;
}

export function buscarContaPorAgendamento(
  agendamentoId: number,
  db: Database = getDb(),
): ContaRow | undefined {
  return db
    .prepare(
      `SELECT * FROM contas_atendimento
       WHERE agendamento_id = ? AND status != 'cancelada'`,
    )
    .get(agendamentoId) as ContaRow | undefined;
}

export function listarContas(
  data: string,
  pacienteId?: number,
  db: Database = getDb(),
): (ContaRow & { qtd_itens: number; total_itens_centavos: number })[] {
  let sql = `
    SELECT c.*, p.nome AS paciente_nome, cv.nome AS convenio_nome,
           ag.hora AS agendamento_hora,
           ${SQL_CONTA_PROCEDIMENTOS_NOMES} AS procedimentos_nomes,
           (SELECT COUNT(*) FROM conta_itens ci
            WHERE ci.conta_id = c.id AND ci.status != 'cancelado') AS qtd_itens
    FROM contas_atendimento c
    JOIN pacientes p ON p.id = c.paciente_id
    LEFT JOIN convenios cv ON cv.id = c.convenio_id
    LEFT JOIN agendamentos ag ON ag.id = c.agendamento_id
    WHERE c.data = ? AND c.status != 'cancelada'`;
  const params: unknown[] = [data];
  if (pacienteId) {
    sql += ` AND c.paciente_id = ?`;
    params.push(pacienteId);
  }
  sql += ` ORDER BY CASE WHEN ag.hora IS NULL OR TRIM(ag.hora) = '' THEN 1 ELSE 0 END,
                  ag.hora, p.nome COLLATE NOCASE, c.id`;
  const rows = db.prepare(sql).all(...params) as (ContaRow & {
    qtd_itens: number;
  })[];
  return rows.map((r) => {
    const itens = db
      .prepare(
        `SELECT id, conta_id, procedimento_id, executado_por, status,
                valor_centavos, quantidade, solicitado_por, solicitado_em,
                realizado_em, observacao
         FROM conta_itens WHERE conta_id = ?`,
      )
      .all(r.id) as ContaItemRow[];
    return {
      ...r,
      total_itens_centavos: calcularTotalItens(itens),
    };
  });
}

function carregarItens(contaId: number, db: Database): ContaItemRow[] {
  const rows = db
    .prepare(
      `SELECT ci.id, ci.conta_id, ci.procedimento_id, ci.executado_por, ci.status,
              ci.valor_centavos, ci.quantidade, ci.solicitado_por, ci.solicitado_em,
              ci.realizado_em, ci.observacao, ci.exame_anexo_id, ci.admissional_id,
              pr.nome AS procedimento_nome, pr.codigo AS procedimento_codigo,
              pr.modo_clinico AS procedimento_modo_clinico,
              ea.descricao AS exame_descricao, ea.arquivo_path AS exame_arquivo_path,
              ad.status AS admissional_status, ad.conclusao AS admissional_conclusao,
              um.nome AS admissional_medico_nome
       FROM conta_itens ci
       LEFT JOIN procedimentos pr ON pr.id = ci.procedimento_id
       LEFT JOIN exames_anexos ea ON ea.id = ci.exame_anexo_id
       LEFT JOIN admissionais ad ON ad.id = ci.admissional_id
       LEFT JOIN usuarios um ON um.id = ad.medico_id
       WHERE ci.conta_id = ?
       ORDER BY ci.id`,
    )
    .all(contaId) as (ContaItemRow & {
      exame_descricao?: string | null;
      exame_arquivo_path?: string | null;
      admissional_status?: string | null;
      admissional_conclusao?: string | null;
      admissional_medico_nome?: string | null;
    })[];

  return rows.map((r) => {
    const {
      exame_descricao,
      exame_arquivo_path,
      admissional_status,
      admissional_conclusao,
      admissional_medico_nome,
      ...item
    } = r;
    let exame_nome: string | null = null;
    if (item.exame_anexo_id) {
      const desc = exame_descricao?.trim();
      exame_nome =
        desc ||
        (exame_arquivo_path
          ? nomeExameParaExibicao(exame_arquivo_path)
          : `Exame #${item.exame_anexo_id}`);
    }
    return {
      ...item,
      exame_nome,
      admissional_status: admissional_status ?? null,
      admissional_conclusao: admissional_conclusao ?? null,
      admissional_medico_nome: admissional_medico_nome ?? null,
    };
  });
}

export type AdmissionalSugeridoConta = {
  id: number;
  status: string;
  conclusao: string | null;
  medico_nome: string;
  created_at: string;
  finalizado_em: string | null;
  vinculado_item_id: number | null;
  elegivel: boolean;
};

/** M8′ — admissionais do paciente na data da conta para vincular ao item. */
export function listarAdmissionaisSugeridosConta(
  contaId: number,
  itemId?: number,
  db: Database = getDb(),
): AdmissionalSugeridoConta[] {
  const conta = db
    .prepare(`SELECT paciente_id, data FROM contas_atendimento WHERE id = ?`)
    .get(contaId) as { paciente_id: number; data: string } | undefined;
  if (!conta) throw new Error("Conta não encontrada");

  const rows = db
    .prepare(
      `SELECT a.id, a.status, a.conclusao, a.created_at, a.finalizado_em,
              u.nome AS medico_nome,
              (SELECT ci.id FROM conta_itens ci
               WHERE ci.admissional_id = a.id AND ci.status != 'cancelado'
               LIMIT 1) AS vinculado_item_id
       FROM admissionais a
       JOIN usuarios u ON u.id = a.medico_id
       WHERE a.paciente_id = ?
         AND a.status != 'cancelado'
         AND a.retificacao_de_id IS NULL
         AND (
           substr(a.created_at, 1, 10) = ?
           OR substr(IFNULL(a.finalizado_em, ''), 1, 10) = ?
         )
       ORDER BY a.id DESC`,
    )
    .all(conta.paciente_id, conta.data, conta.data) as {
      id: number;
      status: string;
      conclusao: string | null;
      created_at: string;
      finalizado_em: string | null;
      medico_nome: string;
      vinculado_item_id: number | null;
    }[];

  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    conclusao: r.conclusao,
    medico_nome: r.medico_nome,
    created_at: r.created_at,
    finalizado_em: r.finalizado_em,
    vinculado_item_id: r.vinculado_item_id,
    elegivel:
      r.vinculado_item_id == null ||
      (itemId != null && r.vinculado_item_id === itemId),
  }));
}

export function sincronizarPrecosItensConta(
  contaId: number,
  convenioId: number,
  db: Database = getDb(),
): void {
  const itens = db
    .prepare(
      `SELECT id, procedimento_id FROM conta_itens
       WHERE conta_id = ? AND status != 'cancelado' AND procedimento_id IS NOT NULL`,
    )
    .all(contaId) as { id: number; procedimento_id: number }[];

  const upd = db.prepare(
    `UPDATE conta_itens SET valor_centavos = ? WHERE id = ?`,
  );
  for (const item of itens) {
    upd.run(obterPrecoProcedimento(item.procedimento_id, convenioId, db), item.id);
  }
}

export function obterContaDetalhe(
  contaId: number,
  db: Database = getDb(),
): ContaDetalhe {
  const conta = db
    .prepare(
      `SELECT c.*, p.nome AS paciente_nome, cv.nome AS convenio_nome,
              ag.hora AS agendamento_hora,
              ${SQL_CONTA_PROCEDIMENTOS_NOMES} AS procedimentos_nomes
       FROM contas_atendimento c
       JOIN pacientes p ON p.id = c.paciente_id
       LEFT JOIN convenios cv ON cv.id = c.convenio_id
       LEFT JOIN agendamentos ag ON ag.id = c.agendamento_id
       WHERE c.id = ?`,
    )
    .get(contaId) as ContaRow | undefined;
  if (!conta) throw new Error("Conta não encontrada");

  if (conta.status === "em_aberto" && !conta.fechada_em) {
    const convenioId = conta.convenio_id ?? CONVENIO_PARTICULAR_ID;
    sincronizarPrecosItensConta(contaId, convenioId, db);
  }

  const itens = carregarItens(contaId, db);
  const pagamentos = carregarPagamentos(contaId, db);
  const totalItens = calcularTotalItens(itens);
  const totalLiquido = Math.max(0, totalItens - (conta.valor_desconto_centavos ?? 0));
  const totalPago = totalPagoCentavos(pagamentos);
  return {
    ...conta,
    itens,
    pagamentos,
    convenio_guia: carregarGuiaConvenio(contaId, db),
    total_itens_centavos: totalItens,
    total_liquido_centavos: totalLiquido,
    total_pago_centavos: totalPago,
    saldo_pendente_centavos: Math.max(0, totalLiquido - totalPago),
  };
}

export function carregarGuiaConvenio(
  contaId: number,
  db: Database = getDb(),
): ContaConvenioGuiaRow | null {
  const row = db
    .prepare(
      `SELECT conta_id, numero_guia, senha, autorizacao, data_envio, observacao
       FROM conta_convenio_guia WHERE conta_id = ?`,
    )
    .get(contaId) as ContaConvenioGuiaRow | undefined;
  return row ?? null;
}

export function salvarGuiaConvenio(
  contaId: number,
  dados: {
    numero_guia?: string | null;
    senha?: string | null;
    autorizacao?: string | null;
    data_envio?: string | null;
    observacao?: string | null;
  },
  db: Database = getDb(),
): ContaConvenioGuiaRow {
  const conta = db
    .prepare(`SELECT id, status FROM contas_atendimento WHERE id = ?`)
    .get(contaId) as { id: number; status: string } | undefined;
  if (!conta) throw new Error("Conta não encontrada");
  if (conta.status !== "em_aberto") {
    throw new Error("Guia só pode ser editada em conta em aberto");
  }

  const existente = carregarGuiaConvenio(contaId, db);
  const merged: Omit<ContaConvenioGuiaRow, "conta_id"> = {
    numero_guia:
      dados.numero_guia !== undefined
        ? dados.numero_guia?.trim() || null
        : (existente?.numero_guia ?? null),
    senha:
      dados.senha !== undefined
        ? dados.senha?.trim() || null
        : (existente?.senha ?? null),
    autorizacao:
      dados.autorizacao !== undefined
        ? dados.autorizacao?.trim() || null
        : (existente?.autorizacao ?? null),
    data_envio:
      dados.data_envio !== undefined
        ? dados.data_envio?.trim() || null
        : (existente?.data_envio ?? null),
    observacao:
      dados.observacao !== undefined
        ? dados.observacao?.trim() || null
        : (existente?.observacao ?? null),
  };

  if (existente) {
    db.prepare(
      `UPDATE conta_convenio_guia
       SET numero_guia = ?, senha = ?, autorizacao = ?, data_envio = ?, observacao = ?
       WHERE conta_id = ?`,
    ).run(
      merged.numero_guia,
      merged.senha,
      merged.autorizacao,
      merged.data_envio,
      merged.observacao,
      contaId,
    );
  } else {
    db.prepare(
      `INSERT INTO conta_convenio_guia
       (conta_id, numero_guia, senha, autorizacao, data_envio, observacao)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      contaId,
      merged.numero_guia,
      merged.senha,
      merged.autorizacao,
      merged.data_envio,
      merged.observacao,
    );
  }

  return carregarGuiaConvenio(contaId, db)!;
}

/** M4 — oculta valores financeiros para perfil só com cobranca_solicitar. */
export function sanitizarContaParaSolicitante(conta: ContaDetalhe): ContaDetalhe {
  return {
    ...conta,
    valor_desconto_centavos: 0,
    motivo_desconto: null,
    pagamentos: [],
    total_itens_centavos: 0,
    total_liquido_centavos: 0,
    total_pago_centavos: 0,
    saldo_pendente_centavos: 0,
    itens: conta.itens.map((i) => ({ ...i, valor_centavos: 0 })),
  };
}

/** M4 — localiza conta da consulta pelo prontuário (check-in M3). */
export function obterContaPorProntuario(
  prontuarioId: number,
  db: Database = getDb(),
): ContaDetalhe | null {
  const pr = db
    .prepare(
      `SELECT id, paciente_id, data_atendimento, agendamento_id
       FROM prontuarios WHERE id = ?`,
    )
    .get(prontuarioId) as
    | {
        id: number;
        paciente_id: number;
        data_atendimento: string;
        agendamento_id: number | null;
      }
    | undefined;
  if (!pr) throw new Error("Prontuário não encontrado");

  let contaRow: ContaRow | undefined;
  if (pr.agendamento_id) {
    contaRow = buscarContaPorAgendamento(pr.agendamento_id, db);
  }
  if (!contaRow) {
    contaRow = db
      .prepare(
        `SELECT * FROM contas_atendimento
         WHERE prontuario_id = ? AND status != 'cancelada'`,
      )
      .get(pr.id) as ContaRow | undefined;
  }

  if (!contaRow) return null;

  db.prepare(
    `UPDATE contas_atendimento SET prontuario_id = ?
     WHERE id = ? AND prontuario_id IS NULL`,
  ).run(prontuarioId, contaRow.id);

  return obterContaDetalhe(contaRow.id, db);
}

export function abrirConta(
  dados: {
    paciente_id: number;
    data?: string;
    convenio_id?: number;
    agendamento_id?: number;
    prontuario_id?: number;
    observacao?: string;
  },
  usuarioId: number,
  db: Database = getDb(),
): ContaDetalhe {
  const paciente = db
    .prepare(`SELECT id FROM pacientes WHERE id = ?`)
    .get(dados.paciente_id);
  if (!paciente) throw new Error("Paciente não encontrado");

  assertVinculoContaPaciente(
    dados.paciente_id,
    {
      agendamento_id: dados.agendamento_id,
      prontuario_id: dados.prontuario_id,
    },
    db,
  );

  let data = dados.data?.trim() || hojeIso();
  let convenioId =
    dados.convenio_id ?? sugerirConvenioPaciente(dados.paciente_id, db);

  if (dados.agendamento_id) {
    const ja = buscarContaPorAgendamento(dados.agendamento_id, db);
    if (ja) {
      throw new Error("Já existe conta para este horário");
    }
    const ag = db
      .prepare(
        `SELECT id, paciente_id, data, convenio_id FROM agendamentos WHERE id = ?`,
      )
      .get(dados.agendamento_id) as
      | {
          id: number;
          paciente_id: number;
          data: string;
          convenio_id: number | null;
        }
      | undefined;
    if (!ag) throw new Error("Agendamento não encontrado");
    data = ag.data;
    if (dados.convenio_id == null && ag.convenio_id != null) {
      convenioId = ag.convenio_id;
    }
  } else {
    const walkin = buscarContaPorPacienteData(dados.paciente_id, data, db);
    if (walkin) {
      return obterContaDetalhe(walkin.id, db);
    }
  }

  const conv = db
    .prepare(`SELECT id FROM convenios WHERE id = ? AND ativo = 1`)
    .get(convenioId);
  if (!conv) throw new Error("Convênio inválido");

  const info = db
    .prepare(
      `INSERT INTO contas_atendimento
       (paciente_id, data, convenio_id, agendamento_id, prontuario_id, status, observacao, created_by)
       VALUES (?, ?, ?, ?, ?, 'em_aberto', ?, ?)`,
    )
    .run(
      dados.paciente_id,
      data,
      convenioId,
      dados.agendamento_id ?? null,
      dados.prontuario_id ?? null,
      dados.observacao?.trim() || null,
      usuarioId,
    );

  return obterContaDetalhe(Number(info.lastInsertRowid), db);
}

export function atualizarConta(
  contaId: number,
  dados: {
    convenio_id?: number;
    observacao?: string | null;
    paciente_id?: never;
    data?: never;
    agendamento_id?: never;
    prontuario_id?: never;
  },
  db: Database = getDb(),
): ContaDetalhe {
  const conta = db
    .prepare(`SELECT * FROM contas_atendimento WHERE id = ?`)
    .get(contaId) as ContaRow | undefined;
  if (!conta) throw new Error("Conta não encontrada");
  assertContaEditavel(conta);

  if (dados.convenio_id !== undefined && dados.convenio_id !== conta.convenio_id) {
    const conv = db
      .prepare(`SELECT id FROM convenios WHERE id = ? AND ativo = 1`)
      .get(dados.convenio_id);
    if (!conv) throw new Error("Convênio inválido");
    db.prepare(`UPDATE contas_atendimento SET convenio_id = ? WHERE id = ?`).run(
      dados.convenio_id,
      contaId,
    );
    sincronizarPrecosItensConta(contaId, dados.convenio_id, db);
  }

  if (dados.observacao !== undefined) {
    db.prepare(`UPDATE contas_atendimento SET observacao = ? WHERE id = ?`).run(
      dados.observacao?.trim() || null,
      contaId,
    );
  }

  return obterContaDetalhe(contaId, db);
}

export function adicionarItemConta(
  contaId: number,
  dados: {
    procedimento_id: number;
    quantidade?: number;
    status?: ContaItemStatus;
    observacao?: string;
    admissional_id?: number;
    confirmar_duplicata?: boolean;
  },
  usuarioId: number,
  db: Database = getDb(),
): ContaDetalhe {
  const conta = db
    .prepare(`SELECT * FROM contas_atendimento WHERE id = ?`)
    .get(contaId) as ContaRow | undefined;
  if (!conta) throw new Error("Conta não encontrada");
  assertContaEditavel(conta);

  const proc = db
    .prepare(`SELECT id FROM procedimentos WHERE id = ? AND ativo = 1`)
    .get(dados.procedimento_id);
  if (!proc) throw new Error("Procedimento inválido");

  if (dados.admissional_id) {
    assertAdmissionalDaConta(contaId, dados.admissional_id, db);
  }

  if (
    !dados.confirmar_duplicata &&
    procedimentoAtivoNaConta(contaId, dados.procedimento_id, db)
  ) {
    const procNome = db
      .prepare(`SELECT nome FROM procedimentos WHERE id = ?`)
      .get(dados.procedimento_id) as { nome: string } | undefined;
    throw new ProcedimentoDuplicadoError(procNome?.nome ?? "Procedimento");
  }

  const convenioId = conta.convenio_id ?? CONVENIO_PARTICULAR_ID;
  const valor = obterPrecoProcedimento(dados.procedimento_id, convenioId, db);
  const qtd = dados.quantidade && dados.quantidade > 0 ? dados.quantidade : 1;
  const status = dados.status ?? "solicitado";
  const agora = new Date().toISOString().slice(0, 19).replace("T", " ");

  let apId: number | null = null;
  if (conta.agendamento_id) {
    const ap = db
      .prepare(
        `SELECT id FROM agendamento_procedimentos
         WHERE agendamento_id = ? AND procedimento_id = ?
         ORDER BY ordem, id LIMIT 1`,
      )
      .get(conta.agendamento_id, dados.procedimento_id) as { id: number } | undefined;
    apId = ap?.id ?? null;
  }

  db.prepare(
    `INSERT INTO conta_itens
     (conta_id, procedimento_id, status, valor_centavos, quantidade,
      solicitado_por, solicitado_em, observacao, admissional_id,
      agendamento_procedimento_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    contaId,
    dados.procedimento_id,
    status,
    valor,
    qtd,
    usuarioId,
    agora,
    dados.observacao?.trim() || null,
    dados.admissional_id ?? null,
    apId,
  );

  return obterContaDetalhe(contaId, db);
}

function assertExameAnexoDaConta(
  contaId: number,
  exameAnexoId: number,
  db: Database,
): void {
  const ok = db
    .prepare(
      `SELECT 1 FROM contas_atendimento c
       JOIN exames_anexos e ON e.id = ?
       WHERE c.id = ? AND e.paciente_id = c.paciente_id`,
    )
    .get(exameAnexoId, contaId);
  if (!ok) {
    throw new Error("Exame anexo inconsistente com paciente da conta");
  }
}

export function atualizarItemConta(
  contaId: number,
  itemId: number,
  dados: {
    status?: ContaItemStatus;
    observacao?: string | null;
    exame_anexo_id?: number | null;
    admissional_id?: number | null;
  },
  db: Database = getDb(),
): ContaDetalhe {
  const conta = db
    .prepare(`SELECT * FROM contas_atendimento WHERE id = ?`)
    .get(contaId) as ContaRow | undefined;
  if (!conta) throw new Error("Conta não encontrada");
  assertContaEditavel(conta);

  const item = db
    .prepare(`SELECT * FROM conta_itens WHERE id = ? AND conta_id = ?`)
    .get(itemId, contaId) as ContaItemRow | undefined;
  if (!item) throw new Error("Item não encontrado");

  if (dados.status) {
    const agora = new Date().toISOString().slice(0, 19).replace("T", " ");
    const realizadoEm =
      dados.status === "realizado" ? agora : item.realizado_em;
    db.prepare(
      `UPDATE conta_itens SET status = ?, realizado_em = ? WHERE id = ?`,
    ).run(dados.status, realizadoEm, itemId);
  }

  if (dados.observacao !== undefined) {
    db.prepare(`UPDATE conta_itens SET observacao = ? WHERE id = ?`).run(
      dados.observacao?.trim() || null,
      itemId,
    );
  }

  if (dados.exame_anexo_id !== undefined) {
    if (dados.exame_anexo_id != null) {
      assertExameAnexoDaConta(contaId, dados.exame_anexo_id, db);
    }
    db.prepare(`UPDATE conta_itens SET exame_anexo_id = ? WHERE id = ?`).run(
      dados.exame_anexo_id,
      itemId,
    );
  }

  if (dados.admissional_id !== undefined) {
    if (dados.admissional_id != null) {
      assertAdmissionalDaConta(contaId, dados.admissional_id, db);
      assertAdmissionalDisponivelItem(itemId, dados.admissional_id, db);
    }
    db.prepare(`UPDATE conta_itens SET admissional_id = ? WHERE id = ?`).run(
      dados.admissional_id,
      itemId,
    );
  }

  return obterContaDetalhe(contaId, db);
}

export function cancelarItemConta(
  contaId: number,
  itemId: number,
  db: Database = getDb(),
): ContaDetalhe {
  return atualizarItemConta(contaId, itemId, { status: "cancelado" }, db);
}
