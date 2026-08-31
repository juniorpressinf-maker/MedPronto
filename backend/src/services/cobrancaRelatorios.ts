import type { Database } from "better-sqlite3";
import { getDb } from "../db/index.js";

export type CobrancaRelatorioResumo = {
  /** Pagamentos de contas particular no período (data do pagamento). */
  arrecadado_centavos: number;
  /** Repasse de convênio recebido no período (data do crédito). */
  recebido_convenio_centavos: number;
  /** Líquido de contas operadora em aberto ou a faturar (data da conta). */
  a_faturar_centavos: number;
  contas_periodo: number;
  contas_fechadas: number;
};

export type CobrancaRelatorioPorForma = {
  forma: string;
  valor_centavos: number;
};

export type CobrancaRelatorioPorConvenio = {
  convenio_id: number | null;
  convenio_nome: string;
  convenio_tipo: string;
  atendimentos: number;
  total_itens_centavos: number;
  arrecadado_centavos: number;
  a_faturar_centavos: number;
};

export type CobrancaRelatorioPorProcedimento = {
  procedimento_id: number;
  procedimento_nome: string;
  quantidade: number;
  valor_centavos: number;
};

export type CobrancaRelatorio = {
  de: string;
  ate: string;
  resumo: CobrancaRelatorioResumo;
  por_forma: CobrancaRelatorioPorForma[];
  por_convenio: CobrancaRelatorioPorConvenio[];
  por_procedimento: CobrancaRelatorioPorProcedimento[];
};

/** Líquido cobrável da conta (itens ativos − desconto). */
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

export function obterRelatorioCobranca(
  de: string,
  ate: string,
  db: Database = getDb(),
): CobrancaRelatorio {
  assertPeriodo(de, ate);

  const contasPeriodo = (
    db
      .prepare(
        `SELECT COUNT(*) AS qtd FROM contas_atendimento
         WHERE data >= ? AND data <= ? AND status != 'cancelada'`,
      )
      .get(de, ate) as { qtd: number }
  ).qtd;

  const contasFechadas = (
    db
      .prepare(
        `SELECT COUNT(*) AS qtd FROM contas_atendimento
         WHERE data >= ? AND data <= ?
           AND status NOT IN ('em_aberto', 'cancelada')`,
      )
      .get(de, ate) as { qtd: number }
  ).qtd;

  const arrecadado = (
    db
      .prepare(
        `SELECT COALESCE(SUM(p.valor_centavos), 0) AS total
         FROM conta_pagamentos p
         JOIN contas_atendimento c ON c.id = p.conta_id
         JOIN convenios cv ON cv.id = c.convenio_id
         WHERE c.status != 'cancelada'
           AND cv.tipo = 'particular'
           AND date(p.registrado_em) >= date(?)
           AND date(p.registrado_em) <= date(?)`,
      )
      .get(de, ate) as { total: number }
  ).total;

  const recebidoConvenio = (
    db
      .prepare(
        `SELECT COALESCE(SUM(p.valor_centavos), 0) AS total
         FROM conta_pagamentos p
         JOIN contas_atendimento c ON c.id = p.conta_id
         WHERE c.status != 'cancelada'
           AND p.forma = 'repasse_convenio'
           AND date(p.registrado_em) >= date(?)
           AND date(p.registrado_em) <= date(?)`,
      )
      .get(de, ate) as { total: number }
  ).total;

  const aFaturar = (
    db
      .prepare(
        `SELECT COALESCE(SUM(${SQL_LIQUIDO_CONTA}), 0) AS total
         FROM contas_atendimento c
         JOIN convenios cv ON cv.id = c.convenio_id
         WHERE c.data >= ? AND c.data <= ?
           AND c.status != 'cancelada'
           AND cv.tipo = 'operadora'
           AND c.status IN ('em_aberto', 'a_faturar_convenio')`,
      )
      .get(de, ate) as { total: number }
  ).total;

  const porForma = db
    .prepare(
      `SELECT p.forma, COALESCE(SUM(p.valor_centavos), 0) AS valor_centavos
       FROM conta_pagamentos p
       JOIN contas_atendimento c ON c.id = p.conta_id
       JOIN convenios cv ON cv.id = c.convenio_id
       WHERE c.status != 'cancelada'
         AND cv.tipo = 'particular'
         AND date(p.registrado_em) >= date(?)
         AND date(p.registrado_em) <= date(?)
       GROUP BY p.forma
       ORDER BY valor_centavos DESC`,
    )
    .all(de, ate) as CobrancaRelatorioPorForma[];

  const atendPorConv = db
    .prepare(
      `SELECT c.convenio_id,
              COALESCE(cv.nome, 'Particular') AS convenio_nome,
              COALESCE(cv.tipo, 'particular') AS convenio_tipo,
              COUNT(DISTINCT c.id) AS atendimentos,
              COALESCE(SUM(
                COALESCE((
                  SELECT SUM(ci.valor_centavos * ci.quantidade)
                  FROM conta_itens ci
                  WHERE ci.conta_id = c.id
                    AND ci.status IN ('previsto', 'solicitado', 'realizado')
                ), 0)
              ), 0) AS total_itens_centavos
       FROM contas_atendimento c
       LEFT JOIN convenios cv ON cv.id = c.convenio_id
       WHERE c.data >= ? AND c.data <= ? AND c.status != 'cancelada'
       GROUP BY c.convenio_id
       ORDER BY atendimentos DESC`,
    )
    .all(de, ate) as {
    convenio_id: number | null;
    convenio_nome: string;
    convenio_tipo: string;
    atendimentos: number;
    total_itens_centavos: number;
  }[];

  const arrecPorConv = db
    .prepare(
      `SELECT c.convenio_id,
              COALESCE(SUM(p.valor_centavos), 0) AS arrecadado_centavos
       FROM conta_pagamentos p
       JOIN contas_atendimento c ON c.id = p.conta_id
       JOIN convenios cv ON cv.id = c.convenio_id
       WHERE c.status != 'cancelada'
         AND (
           (cv.tipo = 'particular' AND p.forma != 'repasse_convenio')
           OR (cv.tipo = 'operadora' AND p.forma = 'repasse_convenio')
         )
         AND date(p.registrado_em) >= date(?)
         AND date(p.registrado_em) <= date(?)
       GROUP BY c.convenio_id`,
    )
    .all(de, ate) as {
    convenio_id: number | null;
    arrecadado_centavos: number;
  }[];

  const aFaturarPorConv = db
    .prepare(
      `SELECT c.convenio_id,
              COALESCE(cv.nome, '—') AS convenio_nome,
              COALESCE(SUM(${SQL_LIQUIDO_CONTA}), 0) AS a_faturar_centavos
       FROM contas_atendimento c
       JOIN convenios cv ON cv.id = c.convenio_id
       WHERE c.data >= ? AND c.data <= ?
         AND c.status != 'cancelada'
         AND cv.tipo = 'operadora'
         AND c.status IN ('em_aberto', 'a_faturar_convenio')
       GROUP BY c.convenio_id`,
    )
    .all(de, ate) as {
    convenio_id: number | null;
    convenio_nome: string;
    a_faturar_centavos: number;
  }[];

  const mapConv = new Map<number | null, CobrancaRelatorioPorConvenio>();
  for (const r of atendPorConv) {
    mapConv.set(r.convenio_id, {
      convenio_id: r.convenio_id,
      convenio_nome: r.convenio_nome,
      convenio_tipo: r.convenio_tipo,
      atendimentos: r.atendimentos,
      total_itens_centavos: r.total_itens_centavos,
      arrecadado_centavos: 0,
      a_faturar_centavos: 0,
    });
  }
  for (const r of arrecPorConv) {
    const prev = mapConv.get(r.convenio_id);
    if (prev) {
      prev.arrecadado_centavos = r.arrecadado_centavos;
    } else {
      mapConv.set(r.convenio_id, {
        convenio_id: r.convenio_id,
        convenio_nome: "Particular",
        convenio_tipo: "particular",
        atendimentos: 0,
        total_itens_centavos: 0,
        arrecadado_centavos: r.arrecadado_centavos,
        a_faturar_centavos: 0,
      });
    }
  }
  for (const r of aFaturarPorConv) {
    const prev = mapConv.get(r.convenio_id);
    if (prev) {
      prev.a_faturar_centavos = r.a_faturar_centavos;
      if (prev.convenio_nome === "—") prev.convenio_nome = r.convenio_nome;
      prev.convenio_tipo = "operadora";
    } else {
      mapConv.set(r.convenio_id, {
        convenio_id: r.convenio_id,
        convenio_nome: r.convenio_nome,
        convenio_tipo: "operadora",
        atendimentos: 0,
        total_itens_centavos: 0,
        arrecadado_centavos: 0,
        a_faturar_centavos: r.a_faturar_centavos,
      });
    }
  }

  const porConvenio = [...mapConv.values()].sort(
    (a, b) =>
      b.total_itens_centavos - a.total_itens_centavos ||
      b.atendimentos - a.atendimentos,
  );

  const porProcedimento = db
    .prepare(
      `SELECT ci.procedimento_id,
              COALESCE(p.nome, '—') AS procedimento_nome,
              COALESCE(SUM(ci.quantidade), 0) AS quantidade,
              COALESCE(SUM(ci.valor_centavos * ci.quantidade), 0) AS valor_centavos
       FROM conta_itens ci
       JOIN contas_atendimento c ON c.id = ci.conta_id
       LEFT JOIN procedimentos p ON p.id = ci.procedimento_id
       WHERE c.data >= ? AND c.data <= ?
         AND c.status != 'cancelada'
         AND ci.status IN ('previsto', 'solicitado', 'realizado')
       GROUP BY ci.procedimento_id
       ORDER BY valor_centavos DESC`,
    )
    .all(de, ate) as CobrancaRelatorioPorProcedimento[];

  return {
    de,
    ate,
    resumo: {
      arrecadado_centavos: arrecadado,
      recebido_convenio_centavos: recebidoConvenio,
      a_faturar_centavos: aFaturar,
      contas_periodo: contasPeriodo,
      contas_fechadas: contasFechadas,
    },
    por_forma: porForma,
    por_convenio: porConvenio,
    por_procedimento: porProcedimento,
  };
}
