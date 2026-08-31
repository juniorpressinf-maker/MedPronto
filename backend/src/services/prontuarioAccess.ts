import type { Request } from "express";
import { getDb } from "../db/index.js";

export type ProntuarioRow = {
  id: number;
  paciente_id: number;
  agendamento_id: number | null;
  medico_id: number;
  data_atendimento: string;
};

export function getProntuarioOrThrow(
  prontuarioId: number,
  req: Request,
): ProntuarioRow {
  const row = getDb()
    .prepare(`SELECT id, paciente_id, agendamento_id, medico_id, data_atendimento FROM prontuarios WHERE id = ?`)
    .get(prontuarioId) as ProntuarioRow | undefined;
  if (!row) {
    const err = new Error("Prontuário não encontrado");
    (err as Error & { status: number }).status = 404;
    throw err;
  }
  if (
    req.usuario!.perfil === "medico" &&
    row.medico_id !== req.usuario!.id
  ) {
    const err = new Error("Prontuário de outro médico");
    (err as Error & { status: number }).status = 403;
    throw err;
  }
  return row;
}

export function getDocumentoContext(prontuarioId: number) {
  return getDb()
    .prepare(
      `SELECT pr.*, p.nome AS paciente_nome, p.data_nasc AS paciente_nasc, p.cpf AS paciente_cpf,
              u.nome AS medico_nome, u.crm AS medico_crm,
              c.nome AS clinica_nome, c.telefone AS clinica_telefone, c.endereco AS clinica_endereco,
              c.logo_path AS clinica_logo
       FROM prontuarios pr
       JOIN pacientes p ON p.id = pr.paciente_id
       JOIN usuarios u ON u.id = pr.medico_id
       LEFT JOIN clinica c ON c.id = 1
       WHERE pr.id = ?`,
    )
    .get(prontuarioId) as
    | {
        id: number;
        paciente_nome: string;
        paciente_nasc: string | null;
        paciente_cpf: string | null;
        medico_nome: string;
        medico_crm: string | null;
        clinica_nome: string | null;
        clinica_telefone: string | null;
        clinica_endereco: string | null;
        clinica_logo: string | null;
        data_atendimento: string;
      }
    | undefined;
}
