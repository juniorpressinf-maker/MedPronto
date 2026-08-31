import {
  aplicarRestauracaoPendente,
  corrigirRestauracaoLegada,
} from "./utils/backup.js";

declare global {
  var __medprontoBootstrapDone: boolean | undefined;
}

/** Restore ANTES de abrir o banco — padrão d:\agenda. */
if (!globalThis.__medprontoBootstrapDone) {
  globalThis.__medprontoBootstrapDone = true;
  try {
    if (aplicarRestauracaoPendente()) {
      console.log("[bootstrap] Restauração pendente aplicada com sucesso.");
    } else if (corrigirRestauracaoLegada()) {
      console.log(
        "[bootstrap] Restauração legada corrigida (backend/data -> data/).",
      );
    }
  } catch (err) {
    console.error("[bootstrap] Erro aplicando restauração pendente:", err);
    process.exit(1);
  }
}

await import("./main.js");
