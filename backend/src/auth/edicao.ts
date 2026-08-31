import { getDb } from "../db/index.js";

/**
 * Valor legado em `app_meta.edicao`. U14: não há SKU; licença não escolhe edição.
 * Constante só para bases antigas e o no-op do instalador.
 */
const EDICAO_UNICA = "clinico_cobranca";

/** Licença não escolhe SKU. Campo `ed` no token é ignorado (nunca rebaixa). */
export function syncEdicaoFromLicense(_ed?: string | null): void {
  getDb()
    .prepare(
      `INSERT INTO app_meta (chave, valor) VALUES ('edicao', ?)
       ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`,
    )
    .run(EDICAO_UNICA);
}
