import type { Database } from "better-sqlite3";
import { getDb } from "../db/index.js";
import { hojeIsoLocal } from "../lib/diasUteis.js";
import { abrirConta, adicionarItemConta } from "./cobrancaContas.js";

/**
 * Auditoria 26/11 [4] — ASO avulso (sem horário) entra na cobrança sozinho.
 * Usa a conta avulsa do paciente no dia (ou abre uma) e lança o procedimento de ASO
 * já vinculado ao atestado. Antes dependia de alguém abrir a conta à mão.
 *
 * Não lança se: o ASO já está em algum item; a conta avulsa do dia já foi fechada
 * (aí o ASO aparece como sugestão ao reabrir/abrir conta); não há procedimento de ASO ativo.
 */
export function lancarAsoAvulsoNaConta(
  admissionalId: number,
  usuarioId: number,
  db: Database = getDb(),
): { conta_id: number | null; motivo?: string } {
  const aso = db
    .prepare(
      `SELECT id, paciente_id, agendamento_id, retificacao_de_id FROM admissionais WHERE id = ?`,
    )
    .get(admissionalId) as
    | { id: number; paciente_id: number; agendamento_id: number | null; retificacao_de_id: number | null }
    | undefined;
  if (!aso || aso.agendamento_id != null || aso.retificacao_de_id != null) {
    return { conta_id: null, motivo: "nao_avulso" };
  }

  const jaCobrado = db
    .prepare(
      `SELECT ci.conta_id FROM conta_itens ci
       WHERE ci.admissional_id = ? AND ci.status != 'cancelado' LIMIT 1`,
    )
    .get(admissionalId) as { conta_id: number } | undefined;
  if (jaCobrado) return { conta_id: jaCobrado.conta_id };

  const proc = db
    .prepare(
      `SELECT id FROM procedimentos WHERE modo_clinico = 'aso' AND ativo = 1 ORDER BY id LIMIT 1`,
    )
    .get() as { id: number } | undefined;
  if (!proc) return { conta_id: null, motivo: "sem_procedimento_aso" };

  // abrirConta sem horário devolve a conta avulsa do dia se já existir.
  const conta = abrirConta({ paciente_id: aso.paciente_id, data: hojeIsoLocal() }, usuarioId, db);
  if (conta.status !== "em_aberto" || conta.fechada_em) {
    return { conta_id: null, motivo: "conta_do_dia_fechada" };
  }

  adicionarItemConta(
    conta.id,
    {
      procedimento_id: proc.id,
      status: "solicitado",
      admissional_id: aso.id,
      confirmar_duplicata: true,
    },
    usuarioId,
    db,
  );
  return { conta_id: conta.id };
}
