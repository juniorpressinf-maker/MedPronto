import { createUser } from "../auth/users.js";
import { getDb } from "../db/index.js";

const SECRETARIA_LOGIN = "secretaria";
const SECRETARIA_SENHA = "sec123";

function countPerfil(perfil: string): number {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS n FROM usuarios WHERE perfil = ? AND ativo = 1`,
    )
    .get(perfil) as { n: number };
  return Number(row?.n ?? 0);
}

function loginExists(login: string): boolean {
  const row = getDb()
    .prepare(`SELECT 1 FROM usuarios WHERE login = ? COLLATE NOCASE`)
    .get(login);
  return Boolean(row);
}

function createSecretariaPadrao(): void {
  if (countPerfil("secretaria") > 0) return;
  const login = loginExists(SECRETARIA_LOGIN) ? "recepcao" : SECRETARIA_LOGIN;
  createUser(login, SECRETARIA_SENHA, "secretaria", "Secretaria");
  console.log(
    `[MedPronto] Usuario secretaria criado — login: ${login}, senha: ${SECRETARIA_SENHA}`,
  );
}

/** Secretaria padrao apos a clinica estar configurada. Medicos devem ser cadastrados em Agenda → Medicos. */
export function garantirUsuariosOperacionais(): void {
  const clinica = getDb()
    .prepare(`SELECT id FROM clinica LIMIT 1`)
    .get() as { id: number } | undefined;
  if (!clinica) return;

  createSecretariaPadrao();
}

export const USUARIOS_PADRAO = {
  secretaria: { login: SECRETARIA_LOGIN, senha: SECRETARIA_SENHA },
} as const;
