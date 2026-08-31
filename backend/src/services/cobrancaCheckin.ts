import type { Database } from "better-sqlite3";
import { getDb } from "../db/index.js";
import {
  abrirConta,
  adicionarItemConta,
  buscarContaPorAgendamento,
  procedimentoAtivoNaConta,
} from "./cobrancaContas.js";

type AgendamentoCheckin = {
  id: number;
  paciente_id: number;
  data: string;
  convenio_id: number | null;
  status: string;
};

function listarProcedimentoIdsCheckin(
  agendamentoId: number,
  db: Database,
): number[] {
  const rows = db
    .prepare(
      `SELECT ap.procedimento_id, p.id AS proc_existe, p.ativo
       FROM agendamento_procedimentos ap
       LEFT JOIN procedimentos p ON p.id = ap.procedimento_id
       WHERE ap.agendamento_id = ?
       ORDER BY ap.ordem, ap.id`,
    )
    .all(agendamentoId) as {
      procedimento_id: number;
      proc_existe: number | null;
      ativo: number | null;
    }[];
  if (rows.length === 0) {
    throw new Error("Agendamento precisa de pelo menos um procedimento");
  }
  if (rows.some((r) => r.proc_existe == null || r.ativo !== 1)) {
    throw new Error("Procedimento do horário não encontrado ou inativo");
  }
  return rows.map((r) => r.procedimento_id);
}

function garantirItemPrevisto(
  contaId: number,
  procedimentoId: number,
  usuarioId: number,
  db: Database,
): void {
  if (procedimentoAtivoNaConta(contaId, procedimentoId, db)) return;
  adicionarItemConta(
    contaId,
    { procedimento_id: procedimentoId, status: "previsto" },
    usuarioId,
    db,
  );
}

/**
 * U6 — check-in (`presente` ou create com checkin): conta do horário + itens N:N.
 * Não reutiliza walk-in. Falha aborta a transação do status (agendamentos.ts).
 */
export function executarContaNoCheckin(
  agendamentoId: number,
  usuarioId: number,
  db: Database = getDb(),
): { conta_id: number } {
  const ag = db
    .prepare(
      `SELECT id, paciente_id, data, convenio_id, status
       FROM agendamentos WHERE id = ?`,
    )
    .get(agendamentoId) as AgendamentoCheckin | undefined;
  if (!ag) throw new Error("Agendamento não encontrado");

  const procedimentoIds = listarProcedimentoIdsCheckin(ag.id, db);

  const existente = buscarContaPorAgendamento(ag.id, db);
  let contaId: number;

  if (existente) {
    contaId = existente.id;
  } else {
    const conta = abrirConta(
      {
        paciente_id: ag.paciente_id,
        data: ag.data,
        agendamento_id: ag.id,
        convenio_id: ag.convenio_id ?? undefined,
      },
      usuarioId,
      db,
    );
    contaId = conta.id;
  }

  const ligada = buscarContaPorAgendamento(ag.id, db);
  if (!ligada || ligada.id !== contaId) {
    throw new Error("Check-in sem conta deste horário");
  }

  for (const procedimentoId of procedimentoIds) {
    garantirItemPrevisto(contaId, procedimentoId, usuarioId, db);
  }
  return { conta_id: contaId };
}

export function obterContaIdAgendamento(
  agendamentoId: number,
  db: Database = getDb(),
): number | null {
  return obterContaResumoAgendamento(agendamentoId, db)?.id ?? null;
}

export function obterContaResumoAgendamento(
  agendamentoId: number,
  db: Database = getDb(),
): { id: number; status: string } | null {
  const row = buscarContaPorAgendamento(agendamentoId, db);
  return row ? { id: row.id, status: row.status } : null;
}

export function enriquecerAgendamentoComConta<T extends { id: number }>(
  row: T,
  db: Database = getDb(),
): T & { conta_id: number | null; conta_status: string | null } {
  const conta = obterContaResumoAgendamento(row.id, db);
  return {
    ...row,
    conta_id: conta?.id ?? null,
    conta_status: conta?.status ?? null,
  };
}
