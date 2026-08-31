import type Database from "better-sqlite3";
import { prepararCpfParaGravacao } from "../utils/cpf.js";

export class CpfDuplicadoError extends Error {
  constructor(
    message = "Já existe paciente cadastrado com este CPF",
  ) {
    super(message);
    this.name = "CpfDuplicadoError";
  }
}

export function resolverCpfPaciente(
  valor: string | null | undefined,
): { cpf: string | null } {
  const { cpf, erro } = prepararCpfParaGravacao(valor);
  if (erro) {
    const err = new Error(erro);
    err.name = "CpfInvalidoError";
    throw err;
  }
  return { cpf };
}

export function assertCpfUnico(
  db: Database.Database,
  cpf: string | null,
  excludeId?: number,
): void {
  if (!cpf) return;
  const row = db
    .prepare(
      `SELECT id, nome FROM pacientes
       WHERE cpf = ? AND (? IS NULL OR id != ?)
       LIMIT 1`,
    )
    .get(cpf, excludeId ?? null, excludeId ?? null) as
    | { id: number; nome: string }
    | undefined;
  if (row) {
    throw new CpfDuplicadoError(
      `Já existe paciente cadastrado com este CPF (${row.nome.trim()})`,
    );
  }
}
