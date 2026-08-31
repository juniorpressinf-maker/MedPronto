import { randomInt } from "node:crypto";
import { hashPassword } from "./crypto.js";
import { getDb } from "../db/index.js";

const CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const QTD_INICIAL = 8;
const TAMANHO = 8;

function gerarTextoCodigo(): string {
  let s = "";
  for (let i = 0; i < TAMANHO; i++) {
    s += CHARSET[randomInt(CHARSET.length)];
  }
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

export function gerarPoolSenhasDesbloqueio(): void {
  const db = getDb();
  const existente = db
    .prepare("SELECT COUNT(*) AS n FROM senhas_desbloqueio")
    .get() as { n: number };
  if (Number(existente?.n ?? 0) > 0) return;

  const insert = db.prepare(
    `INSERT INTO senhas_desbloqueio (codigo, codigo_hash, codigo_salt)
     VALUES (?, ?, ?)`,
  );

  for (let i = 0; i < QTD_INICIAL; i++) {
    const codigo = gerarTextoCodigo();
    const { hash, salt } = hashPassword(codigo.replace(/-/g, ""));
    insert.run(codigo, hash, salt);
  }
}

export function reservarSenhaDesbloqueio(): string | null {
  const row = getDb()
    .prepare(
      `SELECT id, codigo FROM senhas_desbloqueio
       WHERE usado = 0 ORDER BY id LIMIT 1`,
    )
    .get() as { id: number; codigo: string } | undefined;

  if (!row) return null;

  getDb()
    .prepare(
      `UPDATE senhas_desbloqueio SET usado = 1, usado_em = datetime('now', 'localtime')
       WHERE id = ?`,
    )
    .run(row.id);

  return row.codigo;
}
