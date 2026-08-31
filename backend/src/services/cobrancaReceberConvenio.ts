import type { Database } from "better-sqlite3";
import { getDb } from "../db/index.js";
import { logAcesso } from "./logAcesso.js";
import {
  obterContaDetalhe,
  type ContaDetalhe,
  type ContaRow,
} from "./cobrancaContas.js";
import { CONVENIO_PARTICULAR_ID } from "./cobrancaCadastros.js";
import {
  type FaturamentoConvenioConta,
  type FaturamentoConvenioGrupo,
  type RelatorioFaturamentoConvenio,
} from "./cobrancaFaturamentoConvenio.js";

export const FORMA_REPASSE_CONVENIO = "repasse_convenio" as const;

const SQL_LIQUIDO_CONTA = `MAX(0,
  COALESCE((
    SELECT SUM(ci.valor_centavos * ci.quantidade)
    FROM conta_itens ci
    WHERE ci.conta_id = c.id
      AND ci.status IN ('previsto', 'solicitado', 'realizado')
  ), 0) - COALESCE(c.valor_desconto_centavos, 0)
)`;

function assertPeriodo(de: string, ate: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(de) || !/^\d{4}-\d{2}-\d{2}$/.test(ate)) {
    throw new Error("Período inválido (use AAAA-MM-DD)");
  }
  if (de > ate) throw new Error("Data inicial não pode ser posterior à final");
}

function assertDataRecebimento(data: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    throw new Error("Data de recebimento inválida (use AAAA-MM-DD)");
  }
}

function registradoEmFromData(dataRecebimento: string): string {
  return `${dataRecebimento} 12:00:00`;
}

function getContaRow(contaId: number, db: Database): ContaRow {
  const conta = db
    .prepare(`SELECT * FROM contas_atendimento WHERE id = ?`)
    .get(contaId) as ContaRow | undefined;
  if (!conta) throw new Error("Conta não encontrada");
  return conta;
}

function assertContaPendenteRepasse(conta: ContaRow, db: Database): void {
  if (conta.status !== "a_faturar_convenio") {
    throw new Error("Só contas aguardando repasse do convênio podem receber baixa");
  }
  if (!conta.convenio_id || conta.convenio_id === CONVENIO_PARTICULAR_ID) {
    throw new Error("Conta não é de convênio operadora");
  }
  const conv = db
    .prepare(`SELECT tipo FROM convenios WHERE id = ?`)
    .get(conta.convenio_id) as { tipo: string } | undefined;
  if (conv?.tipo !== "operadora") {
    throw new Error("Conta não é de convênio operadora");
  }
}

export function obterPendentesRepasseConvenio(
  de: string,
  ate: string,
  convenioId?: number | null,
  db: Database = getDb(),
): RelatorioFaturamentoConvenio {
  assertPeriodo(de, ate);

  let convenioNome: string | null = null;
  if (convenioId != null) {
    const conv = db
      .prepare(`SELECT id, nome, tipo FROM convenios WHERE id = ? AND ativo = 1`)
      .get(convenioId) as { id: number; nome: string; tipo: string } | undefined;
    if (!conv) throw new Error("Convênio inválido");
    if (conv.tipo !== "operadora") {
      throw new Error("Selecione um convênio operadora");
    }
    convenioNome = conv.nome;
  }

  const filtroConv = convenioId != null ? "AND c.convenio_id = ?" : "";
  const params: (string | number)[] = [de, ate];
  if (convenioId != null) params.push(convenioId);

  const contasRaw = db
    .prepare(
      `SELECT c.id AS conta_id, c.data, c.status,
              ag.hora AS agendamento_hora,
              p.nome AS paciente_nome,
              c.convenio_id, cv.nome AS convenio_nome,
              g.numero_guia, g.senha, g.autorizacao,
              ${SQL_LIQUIDO_CONTA} AS total_liquido_centavos
       FROM contas_atendimento c
       JOIN pacientes p ON p.id = c.paciente_id
       JOIN convenios cv ON cv.id = c.convenio_id
       LEFT JOIN agendamentos ag ON ag.id = c.agendamento_id
       LEFT JOIN conta_convenio_guia g ON g.conta_id = c.id
       WHERE c.data >= ? AND c.data <= ?
         AND c.status = 'a_faturar_convenio'
         AND cv.tipo = 'operadora'
         ${filtroConv}
       ORDER BY cv.nome, c.data,
                CASE WHEN ag.hora IS NULL OR TRIM(ag.hora) = '' THEN 1 ELSE 0 END,
                ag.hora, p.nome COLLATE NOCASE, c.id`,
    )
    .all(...params) as {
    conta_id: number;
    data: string;
    status: string;
    agendamento_hora: string | null;
    paciente_nome: string;
    convenio_id: number;
    convenio_nome: string;
    numero_guia: string | null;
    senha: string | null;
    autorizacao: string | null;
    total_liquido_centavos: number;
  }[];

  const contaIds = contasRaw.map((c) => c.conta_id);
  const itensPorConta = new Map<number, FaturamentoConvenioConta["itens"]>();

  if (contaIds.length > 0) {
    const placeholders = contaIds.map(() => "?").join(",");
    const itens = db
      .prepare(
        `SELECT ci.conta_id,
                COALESCE(pr.nome, '—') AS procedimento_nome,
                ci.quantidade, ci.valor_centavos
         FROM conta_itens ci
         LEFT JOIN procedimentos pr ON pr.id = ci.procedimento_id
         WHERE ci.conta_id IN (${placeholders})
           AND ci.status IN ('previsto', 'solicitado', 'realizado')
         ORDER BY ci.id`,
      )
      .all(...contaIds) as {
      conta_id: number;
      procedimento_nome: string;
      quantidade: number;
      valor_centavos: number;
    }[];

    for (const it of itens) {
      const lista = itensPorConta.get(it.conta_id) ?? [];
      lista.push({
        procedimento_nome: it.procedimento_nome,
        quantidade: it.quantidade,
        valor_centavos: it.valor_centavos,
        subtotal_centavos: it.valor_centavos * it.quantidade,
      });
      itensPorConta.set(it.conta_id, lista);
    }
  }

  const mapGrupos = new Map<number, FaturamentoConvenioGrupo>();

  for (const row of contasRaw) {
    const conta: FaturamentoConvenioConta = {
      conta_id: row.conta_id,
      data: row.data,
      agendamento_hora: row.agendamento_hora ?? null,
      paciente_nome: row.paciente_nome,
      status: row.status,
      numero_guia: row.numero_guia,
      senha: row.senha,
      autorizacao: row.autorizacao,
      total_liquido_centavos: row.total_liquido_centavos,
      itens: itensPorConta.get(row.conta_id) ?? [],
    };

    let grupo = mapGrupos.get(row.convenio_id);
    if (!grupo) {
      grupo = {
        convenio_id: row.convenio_id,
        convenio_nome: row.convenio_nome,
        contas: [],
        total_liquido_centavos: 0,
      };
      mapGrupos.set(row.convenio_id, grupo);
    }
    grupo.contas.push(conta);
    grupo.total_liquido_centavos += conta.total_liquido_centavos;
  }

  const grupos = [...mapGrupos.values()].sort((a, b) =>
    a.convenio_nome.localeCompare(b.convenio_nome, "pt-BR"),
  );

  return {
    de,
    ate,
    convenio_id: convenioId ?? null,
    convenio_nome: convenioNome,
    grupos,
    qtd_contas: contasRaw.length,
    total_liquido_centavos: grupos.reduce((s, g) => s + g.total_liquido_centavos, 0),
  };
}

export function receberConvenio(
  contaId: number,
  dados: {
    data_recebimento?: string;
    valor_centavos?: number;
    observacao?: string;
  },
  usuarioId: number,
  db: Database = getDb(),
): ContaDetalhe {
  return db.transaction(() => {
    const conta = getContaRow(contaId, db);
    assertContaPendenteRepasse(conta, db);

    const detalhe = obterContaDetalhe(contaId, db);
    const valor =
      dados.valor_centavos != null
        ? dados.valor_centavos
        : detalhe.total_liquido_centavos;
    if (!Number.isInteger(valor) || valor <= 0) {
      throw new Error("Valor recebido deve ser positivo");
    }

    const dataRecebimento =
      dados.data_recebimento?.trim() ||
      new Date().toISOString().slice(0, 10);
    assertDataRecebimento(dataRecebimento);
    const registradoEm = registradoEmFromData(dataRecebimento);

    db.prepare(
      `INSERT INTO conta_pagamentos (conta_id, forma, valor_centavos, registrado_em, registrado_por, observacao)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      contaId,
      FORMA_REPASSE_CONVENIO,
      valor,
      registradoEm,
      usuarioId,
      dados.observacao?.trim() || null,
    );

    db.prepare(
      `UPDATE contas_atendimento SET status = 'pago' WHERE id = ?`,
    ).run(contaId);

    logAcesso({
      usuarioId,
      pacienteId: conta.paciente_id,
      acao: "cobranca_baixa_convenio",
      detalhe: `conta=${contaId} valor=${valor} data=${dataRecebimento}`,
    });

    return obterContaDetalhe(contaId, db);
  })();
}

export type ReceberConvenioLoteResultado = {
  ok: number;
  erros: { conta_id: number; erro: string }[];
};

export function receberConvenioLote(
  dados: {
    conta_ids: number[];
    data_recebimento: string;
    observacao?: string;
  },
  usuarioId: number,
  db: Database = getDb(),
): ReceberConvenioLoteResultado {
  const ids = [...new Set(dados.conta_ids)].filter((id) => id > 0);
  if (ids.length === 0) throw new Error("Selecione ao menos uma conta");

  assertDataRecebimento(dados.data_recebimento);

  const resultado: ReceberConvenioLoteResultado = { ok: 0, erros: [] };

  for (const contaId of ids) {
    try {
      receberConvenio(
        contaId,
        {
          data_recebimento: dados.data_recebimento,
          observacao: dados.observacao,
        },
        usuarioId,
        db,
      );
      resultado.ok++;
    } catch (e) {
      resultado.erros.push({
        conta_id: contaId,
        erro: e instanceof Error ? e.message : "Erro",
      });
    }
  }

  if (resultado.ok === 0) {
    throw new Error(
      resultado.erros[0]?.erro ?? "Nenhuma conta foi baixada",
    );
  }

  return resultado;
}
