import { runMigrations } from "../src/db/migrate.js";

const applied = runMigrations();
if (applied.length === 0) {
  console.log("Nenhuma migração pendente.");
} else {
  console.log("Migrações aplicadas:", applied.join(", "));
}
