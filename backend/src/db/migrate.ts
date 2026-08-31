import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import { config } from "../config.js";
import { getDb } from "./index.js";

function resolveMigrationsDir(): string {
  const root = process.env.MEDPRONTO_ROOT?.trim();
  if (root) {
    return path.join(root, "database");
  }
  return path.join(config.rootDir, "database");
}

function ensureMigrationsTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );
  `);
}

function appliedMigrations(db: Database.Database): Set<string> {
  const rows = db
    .prepare("SELECT name FROM schema_migrations ORDER BY id")
    .all() as { name: string }[];
  return new Set(rows.map((r) => r.name));
}

function tableHasColumn(
  db: Database.Database,
  table: string,
  column: string,
): boolean {
  const safeTable = table.replace(/[^a-zA-Z0-9_]/g, "");
  const rows = db
    .prepare(`PRAGMA table_info(${safeTable})`)
    .all() as { name: string }[];
  return rows.some((r) => r.name === column);
}

/** Ignora ADD COLUMN quando a coluna já veio no 001_init (instalação nova). */
function sqlIdempotentAddColumn(db: Database.Database, sql: string): string {
  return sql.replace(
    /ALTER\s+TABLE\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+ADD\s+COLUMN\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+([^;]+);/gi,
    (match, table: string, column: string) => {
      if (tableHasColumn(db, table, column)) {
        return `-- skip ${table}.${column} (ja existe)\n`;
      }
      return match;
    },
  );
}

export function runMigrations(): string[] {
  const db = getDb();
  ensureMigrationsTable(db);

  const migrationsDir = resolveMigrationsDir();
  if (!fs.existsSync(migrationsDir)) {
    console.warn(
      `[migrate] Pasta de migracoes nao encontrada: ${migrationsDir}`,
    );
    return [];
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const done = appliedMigrations(db);
  const applied: string[] = [];

  for (const file of files) {
    if (done.has(file)) continue;
    const sql = sqlIdempotentAddColumn(
      db,
      fs.readFileSync(path.join(migrationsDir, file), "utf8"),
    );
    db.exec(sql);
    db.prepare("INSERT INTO schema_migrations (name) VALUES (?)").run(file);
    applied.push(file);
  }

  return applied;
}
