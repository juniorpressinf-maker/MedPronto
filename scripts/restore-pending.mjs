import { aplicarRestauracaoPendente } from "../backend/dist/utils/backup.js";
import { runMigrations } from "../backend/dist/db/migrate.js";

try {
  if (aplicarRestauracaoPendente()) {
    const applied = runMigrations();
    if (applied.length > 0) {
      console.log("[restore-pending] Migrações após restore:", applied.join(", "));
    }
    console.log("[restore-pending] Restauração aplicada antes do servidor subir.");
  }
} catch (err) {
  console.error("[restore-pending] Falha:", err);
  process.exit(1);
}
