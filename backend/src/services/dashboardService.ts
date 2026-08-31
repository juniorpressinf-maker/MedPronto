import type { Database } from "better-sqlite3";
import { getDb } from "../db/index.js";

export type DashboardPeriodo = { de: string; ate: string };

export type DashboardMedicoRow = {
  medico_id: number;
  medico_nome: string;
  total: number;
  finalizados: number;
};

export type DashboardTipoRow = {
  tipo: string;
  label: string;
  total: number;
};

export type DashboardConvenioRow = {
  convenio_id: number | null;
  convenio_nome: string;
  atendimentos: number;
  arrecadado_centavos: number;
  a_faturar_centavos: number;
};

export type DashboardProcedimentoRow = {
  procedimento_id: number;
  procedimento_nome: string;
  quantidade: number;
  faturado_centavos: number;
};

export type DashboardPayload = {
  periodo: DashboardPeriodo;
  cobranca_disponivel: boolean;
  clinico: {
    totais: {
      agendamentos: number;
      finalizados: number;
      presentes: number;
      em_atendimento: number;
      agendados: number;
      nao_compareceu: number;
      cancelados: number;
      pacientes_novos: number;
      admissionais: number;
      prontuarios: number;
      taxa_comparecimento: number | null;
    };
    hoje: {
      agendamentos: number;
      finalizados: number;
      na_fila: number;
    };
    por_medico: DashboardMedicoRow[];
    por_tipo: DashboardTipoRow[];
    whatsapp: { enviados: number; erros: number } | null;
  };
  financeiro: {
    arrecadado_centavos: number;
    contas_fechadas: number;
    contas_abertas: number;
    a_faturar_centavos: number;
    por_convenio: DashboardConvenioRow[];
    por_forma: { forma: string; valor_centavos: number }[];
    top_procedimentos: DashboardProcedimentoRow[];
  } | null;
};

function hojeIsoLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function inicioMesIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export function periodoPadraoDashboard(): DashboardPeriodo {
  return { de: inicioMesIso(), ate: hojeIsoLocal() };
}

export function validarPeriodo(
  de?: string,
  ate?: string,
): DashboardPeriodo | { erro: string } {
  const padrao = periodoPadraoDashboard();
  const deVal = /^\d{4}-\d{2}-\d{2}$/.test(de ?? "") ? de! : padrao.de;
  const ateVal = /^\d{4}-\d{2}-\d{2}$/.test(ate ?? "") ? ate! : padrao.ate;
  if (deVal > ateVal) return { erro: "Data inicial não pode ser posterior à final" };
  const diff =
    (new Date(`${ateVal}T12:00:00`).getTime() -
      new Date(`${deVal}T12:00:00`).getTime()) /
    86400000;
  if (diff > 366) return { erro: "Período máximo de 366 dias" };
  return { de: deVal, ate: ateVal };
}

function tabelaExiste(db: Database, nome: string): boolean {
  const row = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(nome) as { name: string } | undefined;
  return Boolean(row);
}

function contagemPorStatus(
  db: Database,
  de: string,
  ate: string,
  medicoId?: number,
): Record<string, number> {
  const filtroMedico = medicoId ? " AND medico_id = ?" : "";
  const params = medicoId ? [de, ate, medicoId] : [de, ate];
  const rows = db
    .prepare(
      `SELECT status, COUNT(*) AS qtd
       FROM agendamentos
       WHERE data >= ? AND data <= ?${filtroMedico}
       GROUP BY status`,
    )
    .all(...params) as { status: string; qtd: number }[];
  const out: Record<string, number> = {};
  for (const r of rows) out[r.status] = r.qtd;
  return out;
}

export function montarDashboard(
  de: string,
  ate: string,
  medicoId?: number,
  db: Database = getDb(),
): DashboardPayload {
  const cobrancaDisponivel = tabelaExiste(db, "contas_atendimento");

  const filtroMedico = medicoId ? " AND a.medico_id = ?" : "";
  const params2 = medicoId ? [de, ate, medicoId] : [de, ate];
  const hoje = hojeIsoLocal();
  const paramsHoje = medicoId ? [hoje, medicoId] : [hoje];

  const status = contagemPorStatus(db, de, ate, medicoId);
  const agendamentos = Object.values(status).reduce((s, n) => s + n, 0);
  const finalizados = status.finalizado ?? 0;
  const naoCompareceu = status.nao_compareceu ?? 0;
  const denominador = finalizados + naoCompareceu;
  const taxaComparecimento =
    denominador > 0 ? Math.round((finalizados / denominador) * 1000) / 10 : null;

  const pacientesNovos = (
    db
      .prepare(
        `SELECT COUNT(*) AS qtd FROM pacientes
         WHERE date(created_at) >= date(?) AND date(created_at) <= date(?)`,
      )
      .get(de, ate) as { qtd: number }
  ).qtd;

  let admissionais = 0;
  if (tabelaExiste(db, "admissionais")) {
    admissionais = (
      db
        .prepare(
          `SELECT COUNT(*) AS qtd FROM admissionais
           WHERE date(created_at) >= date(?) AND date(created_at) <= date(?)
             AND retificacao_de_id IS NULL`,
        )
        .get(de, ate) as { qtd: number }
    ).qtd;
  }

  const prontuarios = (
    db
      .prepare(
        `SELECT COUNT(*) AS qtd FROM prontuarios
         WHERE date(data_atendimento) >= date(?) AND date(data_atendimento) <= date(?)${medicoId ? " AND medico_id = ?" : ""}`,
      )
      .get(...(medicoId ? [de, ate, medicoId] : [de, ate])) as { qtd: number }
  ).qtd;

  const hojeStatus = contagemPorStatus(db, hoje, hoje, medicoId);
  const hojeTotal = Object.values(hojeStatus).reduce((s, n) => s + n, 0);

  const porMedico = db
    .prepare(
      `SELECT u.id AS medico_id, u.nome AS medico_nome,
              COUNT(*) AS total,
              SUM(CASE WHEN a.status = 'finalizado' THEN 1 ELSE 0 END) AS finalizados
       FROM agendamentos a
       JOIN usuarios u ON u.id = a.medico_id
       WHERE a.data >= ? AND a.data <= ?${filtroMedico}
       GROUP BY u.id
       ORDER BY finalizados DESC, total DESC
       LIMIT 15`,
    )
    .all(...params2) as DashboardMedicoRow[];

  const porTipoRaw = db
    .prepare(
      `SELECT CAST(p.id AS TEXT) AS tipo, p.nome AS label, COUNT(*) AS total
       FROM agendamento_procedimentos ap
       JOIN procedimentos p ON p.id = ap.procedimento_id
       JOIN agendamentos a ON a.id = ap.agendamento_id
       WHERE a.data >= ? AND a.data <= ?
         AND a.status NOT IN ('cancelado')${filtroMedico}
       GROUP BY p.id
       ORDER BY total DESC
       LIMIT 15`,
    )
    .all(...params2) as { tipo: string; label: string; total: number }[];

  const porTipo: DashboardTipoRow[] = porTipoRaw.map((r) => ({
    tipo: r.tipo,
    label: r.label,
    total: r.total,
  }));

  let whatsapp: { enviados: number; erros: number } | null = null;
  if (tabelaExiste(db, "log_whatsapp")) {
    const wa = db
      .prepare(
        `SELECT
           SUM(CASE WHEN status = 'enviado' THEN 1 ELSE 0 END) AS enviados,
           SUM(CASE WHEN status = 'erro' THEN 1 ELSE 0 END) AS erros
         FROM log_whatsapp
         WHERE date(created_at) >= date(?) AND date(created_at) <= date(?)`,
      )
      .get(de, ate) as { enviados: number | null; erros: number | null };
    whatsapp = {
      enviados: wa.enviados ?? 0,
      erros: wa.erros ?? 0,
    };
  }

  let financeiro: DashboardPayload["financeiro"] = null;
  if (cobrancaDisponivel) {
    const contasAbertas = (
      db
        .prepare(
          `SELECT COUNT(*) AS qtd FROM contas_atendimento
           WHERE data >= ? AND data <= ? AND status = 'em_aberto'`,
        )
        .get(de, ate) as { qtd: number }
    ).qtd;

    const contasFechadas = (
      db
        .prepare(
          `SELECT COUNT(*) AS qtd FROM contas_atendimento
           WHERE data >= ? AND data <= ? AND status != 'cancelada' AND status != 'em_aberto'`,
        )
        .get(de, ate) as { qtd: number }
    ).qtd;

    const arrecadado = (
      db
        .prepare(
          `SELECT COALESCE(SUM(p.valor_centavos), 0) AS total
           FROM conta_pagamentos p
           WHERE date(p.registrado_em) >= date(?) AND date(p.registrado_em) <= date(?)`,
        )
        .get(de, ate) as { total: number }
    ).total;

    const aFaturar = (
      db
        .prepare(
          `SELECT COALESCE(SUM(tl), 0) AS total FROM (
             SELECT MAX(0,
               COALESCE((
                 SELECT SUM(ci.valor_centavos * ci.quantidade)
                 FROM conta_itens ci
                 WHERE ci.conta_id = c.id AND ci.status != 'cancelado'
               ), 0) - COALESCE(c.valor_desconto_centavos, 0)
             ) AS tl
             FROM contas_atendimento c
             JOIN convenios cv ON cv.id = c.convenio_id
             WHERE c.data >= ? AND c.data <= ?
               AND c.status = 'a_faturar_convenio'
               AND cv.tipo = 'operadora'
           )`,
        )
        .get(de, ate) as { total: number }
    ).total;

    const aFaturarPorConv = db
      .prepare(
        `SELECT c.convenio_id,
                cv.nome AS convenio_nome,
                COALESCE(SUM(
                  MAX(0,
                    COALESCE((
                      SELECT SUM(ci.valor_centavos * ci.quantidade)
                      FROM conta_itens ci
                      WHERE ci.conta_id = c.id AND ci.status != 'cancelado'
                    ), 0) - COALESCE(c.valor_desconto_centavos, 0)
                  )
                ), 0) AS a_faturar_centavos
         FROM contas_atendimento c
         JOIN convenios cv ON cv.id = c.convenio_id
         WHERE c.data >= ? AND c.data <= ?
           AND c.status = 'a_faturar_convenio'
           AND cv.tipo = 'operadora'
         GROUP BY c.convenio_id
         ORDER BY a_faturar_centavos DESC
         LIMIT 15`,
      )
      .all(de, ate) as {
      convenio_id: number;
      convenio_nome: string;
      a_faturar_centavos: number;
    }[];

    const atendPorConv = db
      .prepare(
        `SELECT c.convenio_id,
                COALESCE(cv.nome, 'Particular') AS convenio_nome,
                COUNT(DISTINCT c.id) AS atendimentos
         FROM contas_atendimento c
         LEFT JOIN convenios cv ON cv.id = c.convenio_id
         WHERE c.data >= ? AND c.data <= ?
           AND c.status != 'cancelada'
         GROUP BY c.convenio_id
         ORDER BY atendimentos DESC
         LIMIT 15`,
      )
      .all(de, ate) as {
      convenio_id: number | null;
      convenio_nome: string;
      atendimentos: number;
    }[];

    const arrecPorConv = db
      .prepare(
        `SELECT c.convenio_id,
                COALESCE(cv.nome, 'Particular') AS convenio_nome,
                COALESCE(SUM(p.valor_centavos), 0) AS arrecadado_centavos
         FROM conta_pagamentos p
         JOIN contas_atendimento c ON c.id = p.conta_id
         LEFT JOIN convenios cv ON cv.id = c.convenio_id
         WHERE date(p.registrado_em) >= date(?) AND date(p.registrado_em) <= date(?)
         GROUP BY c.convenio_id
         ORDER BY arrecadado_centavos DESC
         LIMIT 15`,
      )
      .all(de, ate) as {
      convenio_id: number | null;
      convenio_nome: string;
      arrecadado_centavos: number;
    }[];

    const mapConv = new Map<number | null, DashboardConvenioRow>();
    for (const r of atendPorConv) {
      mapConv.set(r.convenio_id, {
        convenio_id: r.convenio_id,
        convenio_nome: r.convenio_nome,
        atendimentos: r.atendimentos,
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
          convenio_nome: r.convenio_nome,
          atendimentos: 0,
          arrecadado_centavos: r.arrecadado_centavos,
          a_faturar_centavos: 0,
        });
      }
    }
    for (const r of aFaturarPorConv) {
      const prev = mapConv.get(r.convenio_id);
      if (prev) {
        prev.a_faturar_centavos = r.a_faturar_centavos;
      } else {
        mapConv.set(r.convenio_id, {
          convenio_id: r.convenio_id,
          convenio_nome: r.convenio_nome,
          atendimentos: 0,
          arrecadado_centavos: 0,
          a_faturar_centavos: r.a_faturar_centavos,
        });
      }
    }
    const porConvenio = [...mapConv.values()].sort(
      (a, b) =>
        b.a_faturar_centavos - a.a_faturar_centavos ||
        b.arrecadado_centavos - a.arrecadado_centavos ||
        b.atendimentos - a.atendimentos,
    );

    const porForma = db
      .prepare(
        `SELECT p.forma, COALESCE(SUM(p.valor_centavos), 0) AS valor_centavos
         FROM conta_pagamentos p
         WHERE date(p.registrado_em) >= date(?) AND date(p.registrado_em) <= date(?)
         GROUP BY p.forma
         ORDER BY valor_centavos DESC`,
      )
      .all(de, ate) as { forma: string; valor_centavos: number }[];

    const topProcedimentos = db
      .prepare(
        `SELECT p.id AS procedimento_id,
                p.nome AS procedimento_nome,
                COALESCE(SUM(ci.quantidade), 0) AS quantidade,
                COALESCE(SUM(ci.valor_centavos * ci.quantidade), 0) AS faturado_centavos
         FROM conta_itens ci
         JOIN procedimentos p ON p.id = ci.procedimento_id
         JOIN contas_atendimento c ON c.id = ci.conta_id
         WHERE c.data >= ? AND c.data <= ?
           AND ci.status IN ('previsto', 'solicitado', 'realizado')
         GROUP BY p.id
         ORDER BY quantidade DESC, faturado_centavos DESC
         LIMIT 10`,
      )
      .all(de, ate) as DashboardProcedimentoRow[];

    financeiro = {
      arrecadado_centavos: arrecadado,
      contas_fechadas: contasFechadas,
      contas_abertas: contasAbertas,
      a_faturar_centavos: aFaturar,
      por_convenio: porConvenio,
      por_forma: porForma,
      top_procedimentos: topProcedimentos,
    };
  }

  return {
    periodo: { de, ate },
    cobranca_disponivel: cobrancaDisponivel,
    clinico: {
      totais: {
        agendamentos,
        finalizados,
        presentes: status.presente ?? 0,
        em_atendimento: status.em_atendimento ?? 0,
        agendados: status.agendado ?? 0,
        nao_compareceu: naoCompareceu,
        cancelados: status.cancelado ?? 0,
        pacientes_novos: pacientesNovos,
        admissionais,
        prontuarios,
        taxa_comparecimento: taxaComparecimento,
      },
      hoje: {
        agendamentos: hojeTotal,
        finalizados: hojeStatus.finalizado ?? 0,
        na_fila: (hojeStatus.presente ?? 0) + (hojeStatus.em_atendimento ?? 0),
      },
      por_medico: porMedico,
      por_tipo: porTipo,
      whatsapp,
    },
    financeiro,
  };
}
