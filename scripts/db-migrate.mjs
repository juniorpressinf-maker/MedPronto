import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const distMigrate = path.join(root, "backend", "dist", "db", "migrate.js");

if (!existsSync(distMigrate)) {
  console.error(
    "[migrate] backend/dist/db/migrate.js nao encontrado. Compile o backend e tente de novo.",
  );
  process.exit(1);
}

const { runMigrations } = await import(pathToFileURL(distMigrate).href);

try {
  const applied = runMigrations();
  if (applied.length === 0) {
    console.log("Nenhuma migracao pendente.");
  } else {
    console.log("Migracoes aplicadas:", applied.join(", "));
  }
} catch (err) {
  console.error("[migrate] ERRO:", err instanceof Error ? err.message : err);
  process.exit(1);
}
