/**
 * Trava dos testes de aceite antigos: NUNCA rodar contra o banco real.
 *
 * Deve ser o PRIMEIRO import do teste (ESM avalia os imports em ordem, então
 * isto roda antes de qualquer módulo de ../src abrir o banco).
 * Os scripts `npm run test:*` passam por scripts/lib/rodarEmCopia.ts, que cria
 * uma cópia nova de data/medpronto.db e aponta DATABASE_PATH para ela.
 */
import path from "node:path";
import { BANCO_REAL } from "./bancoCopia.js";

const alvo = process.env.DATABASE_PATH;
if (!alvo || path.resolve(alvo).toLowerCase() === path.resolve(BANCO_REAL).toLowerCase()) {
  console.error(
    "BLOQUEADO: este teste grava no banco e só roda numa cópia.\n" +
      "Use o script npm (ex.: npm run test:u13 -w backend) — ele cria e apaga a cópia sozinho.",
  );
  process.exit(1);
}
