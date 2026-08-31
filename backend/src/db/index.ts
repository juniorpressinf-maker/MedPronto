import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { config } from "../config.js";

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
    db = new Database(config.dbPath);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
  }
  return db;
}

export function closeDb(): void {
  if (db) {
    try {
      db.pragma("wal_checkpoint(TRUNCATE)");
    } catch {
      /* ignore */
    }
    db.close();
    db = null;
  }
  limparWalAoLado(config.dbPath);
}

function limparWalAoLado(dbPath: string) {
  for (const extra of ["-wal", "-shm"]) {
    try {
      fs.unlinkSync(dbPath + extra);
    } catch {
      /* ignore */
    }
  }
}

export function dbHealth(): { ok: boolean; path: string } {
  try {
    const database = getDb();
    database.prepare("SELECT 1 AS ok").get();
    return { ok: true, path: config.dbPath };
  } catch {
    return { ok: false, path: config.dbPath };
  }
}
