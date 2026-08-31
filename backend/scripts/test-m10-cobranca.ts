/**
 * Aceite M10 — relatórios de cobrança por período.
 */
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import { runMigrations } from "../src/db/migrate.js";
import {
  abrirConta,
  adicionarItemConta,
  obterContaDetalhe,
} from "../src/services/cobrancaContas.js";
import { registrarPagamento } from "../src/services/cobrancaPagamentos.js";
import { obterRelatorioCobranca } from "../src/services/cobrancaRelatorios.js";

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
    .prepare(`SELECT id, nome FROM procedimentos WHERE ativo = 1 ORDER BY id LIMIT 1`)
    .get() as { id: number; nome: string } | undefined;
  assert(!!paciente && !!proc, "precisa paciente e procedimento");

  const dataTeste = "2099-08-01";
  db.prepare(`DELETE FROM conta_convenio_guia WHERE conta_id IN (
    SELECT id FROM contas_atendimento WHERE data = ?
  )`).run(dataTeste);
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
    { procedimento_id: proc!.id, status: "previsto" },
    1,
    db,
  );
  const total = obterContaDetalhe(conta.id, db).total_liquido_centavos;
  assert(total > 0, "conta com valor");
  registrarPagamento(conta.id, { forma: "pix", valor_centavos: total }, 1, db);
  db.prepare(
    `UPDATE conta_pagamentos SET registrado_em = ? WHERE conta_id = ?`,
  ).run(`${dataTeste} 12:00:00`, conta.id);

  const rel = obterRelatorioCobranca(dataTeste, dataTeste, db);
  assert(rel.resumo.contas_periodo >= 1, "conta no período");
  assert(rel.resumo.arrecadado_centavos >= total, "arrecadado no período");
  assert(
    rel.por_procedimento.some((p) => p.procedimento_id === proc!.id),
    "por procedimento",
  );
  assert(rel.por_forma.some((f) => f.forma === "pix"), "por forma");
  assert(
    rel.por_convenio.some((c) => c.convenio_id === 1 && c.atendimentos >= 1),
    "por convênio",
  );

  let periodoInvalido = false;
  try {
    obterRelatorioCobranca("2099-08-02", "2099-08-01", db);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/posterior/i.test(msg)) periodoInvalido = true;
    else throw e;
  }
  assert(periodoInvalido, "rejeita período invertido");

  let convOperadora = db
    .prepare(`SELECT id FROM convenios WHERE tipo = 'operadora' AND ativo = 1 LIMIT 1`)
    .get() as { id: number } | undefined;
  if (!convOperadora) {
    const ins = db
      .prepare(`INSERT INTO convenios (nome, tipo, ativo) VALUES ('Teste Operadora M10b', 'operadora', 1)`)
      .run();
    convOperadora = { id: Number(ins.lastInsertRowid) };
  }
  const dataOp = "2099-08-02";
  db.prepare(`DELETE FROM conta_itens WHERE conta_id IN (
    SELECT id FROM contas_atendimento WHERE data = ?
  )`).run(dataOp);
  db.prepare(`DELETE FROM contas_atendimento WHERE data = ?`).run(dataOp);
  const contaOp = abrirConta(
    { paciente_id: paciente!.id, data: dataOp, convenio_id: convOperadora!.id },
    1,
    db,
  );
  adicionarItemConta(
    contaOp.id,
    { procedimento_id: proc!.id, status: "previsto" },
    1,
    db,
  );
  const liquidoOp = obterContaDetalhe(contaOp.id, db).total_liquido_centavos;
  const relOp = obterRelatorioCobranca(dataOp, dataOp, db);
  assert(relOp.resumo.a_faturar_centavos >= liquidoOp, "convênio em aberto entra no card");
  assert(
    relOp.por_convenio.some(
      (c) => c.convenio_id === convOperadora!.id && c.a_faturar_centavos >= liquidoOp,
    ),
    "convênio em aberto na tabela",
  );

  db.close();
  console.log("M10 aceite: todos os testes passaram.");
}

main();
