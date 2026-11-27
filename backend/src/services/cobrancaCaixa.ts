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
  /** Formas usadas nesta conta, com o total de cada uma. */
  formas: { forma: string; valor_centavos: number }[];
};

/** Auditoria 26/11 [5]: conta em aberto de dia anterior (paciente saiu sem pagar/fechar). */
export type CaixaPendenteAnterior = {
  id: number;
  data: string;
  paciente_id: number;
  paciente_nome: string;
  convenio_nome: string | null;
  agendamento_hora: string | null;
  agendamento_status: string | null;
  procedimentos_nomes: string;
  saldo_pendente_centavos: number;
  sem_preco: boolean;
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
  /** Contas ainda em aberto de dias anteriores — não podem sumir da recepção. */
  pendentes_anteriores: CaixaPendenteAnterior[];
  /** Pagamentos registrados neste dia em contas de OUTRA data (entram no arrecadado do dia). */
  recebidos_outros_dias: CaixaRecebidoOutroDia[];
};

export type CaixaRecebidoOutroDia = {
  pagamento_id: number;
  conta_id: number;
  conta_data: string;
  paciente_nome: string;
  forma: string;
  valor_centavos: number;
};

export function listarPendentesAnteriores(
  data: string,
  db: Database = getDb(),
): CaixaPendenteAnterior[] {
  const ids = db
    .prepare(
      `SELECT c.id FROM contas_atendimento c
       WHERE c.data < ? AND c.status = 'em_aberto'
         AND EXISTS (
           SELECT 1 FROM conta_itens ci
           WHERE ci.conta_id = c.id AND ci.status IN ('previsto', 'solicitado', 'realizado')
         )
       ORDER BY c.data DESC, c.id DESC
       LIMIT 200`,
    )
    .all(data) as { id: number }[];
  return ids.map(({ id }) => {
    const det = obterContaDetalhe(id, db);
    return {
      id: det.id,
      data: det.data,
      paciente_id: det.paciente_id,
      paciente_nome: det.paciente_nome ?? "—",
      convenio_nome: det.convenio_nome ?? null,
      agendamento_hora: det.agendamento_hora ?? null,
      agendamento_status: det.agendamento_status ?? null,
      procedimentos_nomes: (det.procedimentos_nomes ?? "").trim(),
      saldo_pendente_centavos: det.saldo_pendente_centavos,
      sem_preco: det.procedimentos_sem_preco.length > 0,
    };
  });
}

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
      // Formas iguais somadas (crédito + crédito = "Crédito R$ total").
      formas: Object.entries(
        det.pagamentos.reduce<Record<string, number>>((acc, p) => {
          acc[p.forma] = (acc[p.forma] ?? 0) + p.valor_centavos;
          return acc;
        }, {}),
      ).map(([forma, valor_centavos]) => ({ forma, valor_centavos })),
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

    if (det.status === "a_faturar_convenio") {
      aFaturarQtd++;
      aFaturar += det.total_liquido_centavos;
    }
  }

  // Auditoria 26/11 [6]: dinheiro do dia = pagamentos REGISTRADOS no dia (mesmo critério do
  // Caixa do Financeiro, relatórios e dashboard). Antes somava pela data da conta e a
  // conferência não batia quando se pagava hoje uma conta de outro dia.
  const porForma = db
    .prepare(
      `SELECT p.forma, COALESCE(SUM(p.valor_centavos), 0) AS valor_centavos
       FROM conta_pagamentos p
       JOIN contas_atendimento c ON c.id = p.conta_id
       WHERE date(p.registrado_em) = ? AND c.status != 'cancelada'
       GROUP BY p.forma
       ORDER BY valor_centavos DESC`,
    )
    .all(data) as { forma: string; valor_centavos: number }[];
  arrecadado = porForma.reduce((t, f) => t + f.valor_centavos, 0);

  const recebidosOutrosDias = db
    .prepare(
      `SELECT p.id AS pagamento_id, c.id AS conta_id, c.data AS conta_data,
              pac.nome AS paciente_nome, p.forma, p.valor_centavos
       FROM conta_pagamentos p
       JOIN contas_atendimento c ON c.id = p.conta_id
       JOIN pacientes pac ON pac.id = c.paciente_id
       WHERE date(p.registrado_em) = ? AND c.data != ? AND c.status != 'cancelada'
       ORDER BY p.registrado_em, p.id`,
    )
    .all(data, data) as CaixaRecebidoOutroDia[];

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
    pendentes_anteriores: listarPendentesAnteriores(data, db),
    recebidos_outros_dias: recebidosOutrosDias,
  };
}
