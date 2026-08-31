import type { Request } from "express";
import { getDb } from "../db/index.js";

function httpError(message: string, status: number): Error {
  const err = new Error(message);
  (err as Error & { status: number }).status = status;
  return err;
}

/** Médico já atendeu ou tem agendamento com o paciente. */
export function medicoAtendePaciente(
  medicoId: number,
  pacienteId: number,
): boolean {
  const db = getDb();
  const checks = [
    `SELECT 1 FROM prontuarios WHERE medico_id = ? AND paciente_id = ? LIMIT 1`,
    `SELECT 1 FROM admissionais WHERE medico_id = ? AND paciente_id = ? LIMIT 1`,
    `SELECT 1 FROM agendamentos WHERE medico_id = ? AND paciente_id = ? LIMIT 1`,
  ];
  return checks.some((sql) =>
    Boolean(db.prepare(sql).get(medicoId, pacienteId)),
  );
}

/**
 * Impede médico de ler/gravar dados clínicos de paciente sem vínculo.
 * Admin e secretaria não passam por aqui (cadastro / exames administrativos).
 */
export function assertMedicoVinculoPaciente(
  req: Request,
  pacienteId: number,
): void {
  if (req.usuario!.perfil !== "medico") return;
  if (!medicoAtendePaciente(req.usuario!.id, pacienteId)) {
    throw httpError("Sem vínculo clínico com este paciente", 403);
  }
}

export function assertProntuarioDoPaciente(
  prontuarioId: number,
  pacienteId: number,
): void {
  const pr = getDb()
    .prepare(`SELECT paciente_id FROM prontuarios WHERE id = ?`)
    .get(prontuarioId) as { paciente_id: number } | undefined;
  if (!pr) {
    throw httpError("Prontuário não encontrado", 404);
  }
  if (pr.paciente_id !== pacienteId) {
    throw httpError("Prontuário não pertence a este paciente", 400);
  }
}

export function assertExameDoPaciente(
  exameId: number,
  pacienteId: number,
): { paciente_id: number; prontuario_id: number | null } {
  const row = getDb()
    .prepare(`SELECT paciente_id, prontuario_id FROM exames_anexos WHERE id = ?`)
    .get(exameId) as
    | { paciente_id: number; prontuario_id: number | null }
    | undefined;
  if (!row) {
    throw httpError("Exame não encontrado", 404);
  }
  if (row.paciente_id !== pacienteId) {
    throw httpError("Exame não pertence a este paciente", 400);
  }
  return row;
}
