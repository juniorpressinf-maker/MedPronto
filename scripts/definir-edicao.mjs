/**
 * U14 — no-op: o produto é sempre clínico + cobrança.
 * Uso: node scripts/definir-edicao.mjs
 *      node scripts/definir-edicao.mjs --ler
 * Argumentos de edição antigos (`clinico`, `clinico_cobranca`) são ignorados.
 */
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const EDICAO_UNICA = "clinico_cobranca";
const arg = String(process.argv[2] ?? "").trim();
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dbPath = process.env.MEDPRONTO_DB_PATH ?? path.join(root, "data", "medpronto.db");

if (!fs.existsSync(dbPath)) {
  if (arg === "--ler") {
    process.stdout.write(EDICAO_UNICA);
    process.exit(0);
  }
  console.error("Banco não encontrado:", dbPath);
  process.exit(1);
}

const db = new Database(dbPath);

if (arg === "--ler") {
  process.stdout.write(EDICAO_UNICA);
  db.close();
  process.exit(0);
}

db.prepare(
  `INSERT INTO app_meta (chave, valor) VALUES ('edicao', ?)
   ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`,
).run(EDICAO_UNICA);

console.log("Produto único (clínico + cobrança).");
db.close();
