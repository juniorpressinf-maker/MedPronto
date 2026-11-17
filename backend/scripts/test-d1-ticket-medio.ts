/**
 * Aceite D1 — ticket médio e comparativo com período anterior no dashboard.
 * Somente leitura: não grava nada no banco.
 */
import "./lib/exigirCopia.js"; // trava: nunca no banco real (rodar via npm run test:*)
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import {
  kpisPeriodo,
  montarDashboard,
  periodoAnterior,
} from "../src/services/dashboardService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DATABASE_PATH || path.resolve(__dirname, "../../data/medpronto.db");

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`FALHOU: ${msg}`);
}

function main(): void {
  // 1) Período anterior: mesma duração, termina na véspera de `de`.
  const p1 = periodoAnterior("2026-11-01", "2026-11-15");
  assert(p1.de === "2026-10-17" && p1.ate === "2026-10-31", `período anterior 01–15/11 → ${JSON.stringify(p1)}`);
  const p2 = periodoAnterior("2026-03-01", "2026-03-01");
  assert(p2.de === "2026-02-28" && p2.ate === "2026-02-28", `período de 1 dia → ${JSON.stringify(p2)}`);
  const p3 = periodoAnterior("2026-01-01", "2026-01-31");
  assert(p3.de === "2025-12-01" && p3.ate === "2025-12-31", `janeiro → ${JSON.stringify(p3)}`);

  // 2) KPIs no banco real (somente leitura).
  const db = new Database(dbPath, { readonly: true });
  const de = "2025-01-01";
  const ate = "2025-12-31";
  const k = kpisPeriodo(db, de, ate);
  if (k.faturado_centavos != null && k.contas_validas != null) {
    const esperado = k.contas_validas > 0 ? Math.round(k.faturado_centavos / k.contas_validas) : null;
    assert(k.ticket_medio_centavos === esperado, `ticket = faturado ÷ contas (${k.ticket_medio_centavos} vs ${esperado})`);
  }

  // 3) Dashboard expõe comparativo coerente com kpisPeriodo do período anterior.
  const dash = montarDashboard("2026-01-01", "2026-01-31", undefined, db);
  assert(dash.comparativo.periodo_anterior.de === "2025-12-01", "comparativo.periodo_anterior.de");
  const ant = kpisPeriodo(db, "2025-12-01", "2025-12-31");
  assert(dash.comparativo.anterior.finalizados === ant.finalizados, "comparativo.finalizados");
  assert(dash.comparativo.anterior.ticket_medio_centavos === ant.ticket_medio_centavos, "comparativo.ticket");
  if (dash.financeiro) {
    const atual = kpisPeriodo(db, "2026-01-01", "2026-01-31");
    assert(dash.financeiro.ticket_medio_centavos === atual.ticket_medio_centavos, "financeiro.ticket_medio");
    assert(dash.financeiro.faturado_centavos === atual.faturado_centavos, "financeiro.faturado");
  }
  db.close();

  console.log("OK — D1 ticket médio + comparativo");
}

main();
