/**
 * Remove usuarios e clinica para repetir o primeiro acesso (setup).
 * Uso: node scripts/reset-acesso.mjs
 */
import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dbPath = process.env.DATABASE_PATH ?? path.join(root, "data", "medpronto.db");

const db = new Database(dbPath);
db.exec(`
  DELETE FROM usuarios;
  DELETE FROM sessoes_secret;
  DELETE FROM clinica;
  DELETE FROM senhas_desbloqueio;
  DELETE FROM recuperacao_senha_codigos;
`);
db.close();
console.log("Acesso reiniciado. Abra o app e crie o administrador novamente.");
console.log("Banco:", dbPath);
