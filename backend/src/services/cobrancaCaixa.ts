import type { Database } from "better-sqlite3";
import { getDb } from "../db/index.js";
import { listarContas, obterContaDetalhe } from "./cobrancaContas.js";

export type CaixaContaResumo = {
  id: number;
  paciente_id: number;
  paciente_nome: string;
  convenio_nome: string | null;
  agendamento_id: number | null;
  agendamento_hora: string | null;
  procedimentos_nomes: string;
  status: string;
  qtd_itens: number;
  total_itens_centavos: number;
  total_liquido_centavos: number;
  total_pago_centavos: number;
  saldo_pendente_centavos: number;
};

export type CaixaDoDia = {
  data: string;
  totais: {
    contas: number;
    em_aberto: number;
    aguardando_pagamento: number;
    fechadas: number;
    arrecadado_centavos: number;
    a_faturar_qtd: number;
    a_faturar_centavos: number;
    saldo_pendente_centavos: number;
  };
  por_forma: { forma: string; valor_centavos: number }[];
  contas: CaixaContaResumo[];
};

const STATUS_FECHADO = new Set([
  "pago",
  "parcialmente_pago",
  "a_faturar_convenio",
  "isento",
]);

export function obterCaixaDoDia(
  data: string,
  db: Database = getDb(),
): CaixaDoDia {
  const contasRaw = listarContas(data, undefined, db);
  const contas: CaixaContaResumo[] = [];
  let emAberto = 0;
  let aguardando = 0;
  let fechadas = 0;
  let arrecadado = 0;
  let aFaturarQtd = 0;
  let aFaturar = 0;
  let saldoPendente = 0;

  for (const c of contasRaw) {
    const det = obterContaDetalhe(c.id, db);
    contas.push({
      id: det.id,
      paciente_id: det.paciente_id,
      paciente_nome: det.paciente_nome ?? "—",
      convenio_nome: det.convenio_nome ?? null,
      agendamento_id: det.agendamento_id ?? null,
      agendamento_hora: det.agendamento_hora ?? c.agendamento_hora ?? null,
      procedimentos_nomes: (det.procedimentos_nomes ?? c.procedimentos_nomes ?? "").trim(),
      status: det.status,
      qtd_itens: c.qtd_itens,
      total_itens_centavos: det.total_itens_centavos,
      total_liquido_centavos: det.total_liquido_centavos,
      total_pago_centavos: det.total_pago_centavos,
      saldo_pendente_centavos: det.saldo_pendente_centavos,
    });

    if (det.status === "em_aberto") {
      emAberto++;
      saldoPendente += det.saldo_pendente_centavos;
    } else if (det.status === "aguardando_pagamento") {
      aguardando++;
      saldoPendente += det.saldo_pendente_centavos;
    } else if (STATUS_FECHADO.has(det.status)) {
      fechadas++;
    }

    arrecadado += det.total_pago_centavos;
    if (det.status === "a_faturar_convenio") {
      aFaturarQtd++;
      aFaturar += det.total_liquido_centavos;
    }
  }

  const porForma = db
    .prepare(
      `SELECT p.forma, COALESCE(SUM(p.valor_centavos), 0) AS valor_centavos
       FROM conta_pagamentos p
       JOIN contas_atendimento c ON c.id = p.conta_id
       WHERE c.data = ? AND c.status != 'cancelada'
       GROUP BY p.forma
       ORDER BY valor_centavos DESC`,
    )
    .all(data) as { forma: string; valor_centavos: number }[];

  return {
    data,
    totais: {
      contas: contas.length,
      em_aberto: emAberto,
      aguardando_pagamento: aguardando,
      fechadas,
      arrecadado_centavos: arrecadado,
      a_faturar_qtd: aFaturarQtd,
      a_faturar_centavos: aFaturar,
      saldo_pendente_centavos: saldoPendente,
    },
    por_forma: porForma,
    contas,
  };
}
