import { getDb } from "../db/index.js";
import { hashPassword, randomSecret, verifyPassword } from "./crypto.js";
import { aplicarPermissoesPadrao } from "./modulos.js";

export type Perfil = "admin" | "medico" | "secretaria";

export interface Usuario {
  id: number;
  nome: string;
  login: string;
  perfil: Perfil;
  ativo: boolean;
  crm: string | null;
  created_at: string;
}

export function countUsers(): number {
  const row = getDb()
    .prepare("SELECT COUNT(*) AS n FROM usuarios")
    .get() as { n: number };
  return Number(row?.n ?? 0);
}

export function createUser(
  login: string,
  senha: string,
  perfil: Perfil = "secretaria",
  nome?: string,
): Usuario {
  const loginNorm = login.trim().toLowerCase();
  const { hash, salt } = hashPassword(senha);
  const info = getDb()
    .prepare(
      `INSERT INTO usuarios (nome, login, senha_hash, senha_salt, perfil)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(nome?.trim() || loginNorm, loginNorm, hash, salt, perfil);
  const id = Number(info.lastInsertRowid);
  aplicarPermissoesPadrao(id, perfil);
  return getDb()
    .prepare(
      "SELECT id, nome, login, perfil, ativo, crm, created_at FROM usuarios WHERE id = ?",
    )
    .get(info.lastInsertRowid) as Usuario;
}

export function findUserByLogin(login: string) {
  return (
    (getDb()
      .prepare(
        `SELECT id, nome, login, senha_hash, senha_salt, perfil, ativo, crm
         FROM usuarios WHERE login = ? COLLATE NOCASE`,
      )
      .get(login.trim().toLowerCase()) as
      | {
          id: number;
          nome: string;
          login: string;
          senha_hash: string;
          senha_salt: string;
          perfil: Perfil;
          ativo: number;
          crm: string | null;
        }
      | undefined) ?? null
  );
}

export function usuarioEstaAtivo(id: number): boolean {
  if (!Number.isFinite(id) || id <= 0) return false;
  const row = getDb()
    .prepare(`SELECT ativo FROM usuarios WHERE id = ?`)
    .get(id) as { ativo: number } | undefined;
  return row?.ativo === 1;
}

export function authenticateUser(login: string, senha: string) {
  const user = findUserByLogin(login);
  if (!user || !user.ativo) return null;
  const ok = verifyPassword(senha, user.senha_salt, user.senha_hash);
  if (!ok) return null;
  return {
    id: user.id,
    username: user.login,
    nome: user.nome,
    perfil: user.perfil,
  };
}

export function updateUserPassword(login: string, senha: string): boolean {
  const user = findUserByLogin(login);
  if (!user || !user.ativo) return false;
  const { hash, salt } = hashPassword(senha);
  getDb()
    .prepare(
      `UPDATE usuarios SET senha_hash = ?, senha_salt = ?,
       updated_at = datetime('now', 'localtime') WHERE id = ?`,
    )
    .run(hash, salt, user.id);
  return true;
}

export function getSessionSecret(): string {
  const row = getDb()
    .prepare("SELECT secret FROM sessoes_secret WHERE id = 1")
    .get() as { secret: string } | undefined;
  if (row) return row.secret;
  const s = randomSecret();
  getDb()
    .prepare(
      `INSERT INTO sessoes_secret (id, secret) VALUES (1, ?)
       ON CONFLICT(id) DO UPDATE SET secret = excluded.secret, updated_at = datetime('now', 'localtime')`,
    )
    .run(s);
  return s;
}
