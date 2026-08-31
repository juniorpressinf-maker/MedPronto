/**
 * Aceite M6 — caixa do dia com contas e saldo pendente.
 */
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import { runMigrations } from "../src/db/migrate.js";
import { obterCaixaDoDia } from "../src/services/cobrancaCaixa.js";
import {
  abrirConta,
  adicionarItemConta,
} from "../src/services/cobrancaContas.js";
import { registrarPagamento } from "../src/services/cobrancaPagamentos.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(__dirname, "../../data/medpronto.db");

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`FALHOU: ${msg}`);
}

function main(): void {
  runMigrations();
  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");

  const paciente = db
    .prepare(`SELECT id FROM pacientes ORDER BY id LIMIT 1`)
    .get() as { id: number } | undefined;
  const proc = db
    .prepare(`SELECT id FROM procedimentos WHERE ativo = 1 ORDER BY id LIMIT 1`)
    .get() as { id: number } | undefined;
  assert(!!paciente && !!proc, "precisa paciente e procedimento");

  const dataTeste = "2099-04-01";
  db.prepare(`DELETE FROM conta_pagamentos WHERE conta_id IN (
    SELECT id FROM contas_atendimento WHERE data = ?
  )`).run(dataTeste);
  db.prepare(`DELETE FROM conta_itens WHERE conta_id IN (
    SELECT id FROM contas_atendimento WHERE data = ?
  )`).run(dataTeste);
  db.prepare(`DELETE FROM contas_atendimento WHERE data = ?`).run(dataTeste);

  const conta = abrirConta(
    { paciente_id: paciente!.id, data: dataTeste, convenio_id: 1 },
    1,
    db,
  );
  adicionarItemConta(
    conta.id,
    { procedimento_id: proc!.id, status: "solicitado" },
    1,
    db,
  );

  let caixa = obterCaixaDoDia(dataTeste, db);
  assert(caixa.contas.length === 1, "uma conta no dia");
  assert(caixa.totais.em_aberto === 1, "conta em aberto");
  assert(caixa.totais.saldo_pendente_centavos > 0, "saldo pendente");

  const saldo = caixa.contas[0]!.saldo_pendente_centavos;
  const metade = Math.floor(saldo / 2);
  registrarPagamento(
    conta.id,
    { forma: "pix", valor_centavos: metade },
    1,
    db,
  );

  caixa = obterCaixaDoDia(dataTeste, db);
  assert(caixa.totais.saldo_pendente_centavos === saldo - metade, "saldo após parcial");
  assert(caixa.por_forma.length === 1, "forma pix");
  assert(caixa.por_forma[0]?.forma === "pix", "pagamento pix");

  db.close();
  console.log("M6 aceite: OK");
}

main();
