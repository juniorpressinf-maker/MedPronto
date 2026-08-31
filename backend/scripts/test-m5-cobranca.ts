/**
 * Aceite M5 — pagamentos, desconto e fechamento de conta.
 */
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import { runMigrations } from "../src/db/migrate.js";
import { abrirConta, adicionarItemConta, obterContaDetalhe } from "../src/services/cobrancaContas.js";
import {
  aplicarDesconto,
  fecharConta,
  registrarPagamento,
} from "../src/services/cobrancaPagamentos.js";

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

  const dataTeste = "2099-03-01";
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

  let detalhe = obterContaDetalhe(conta.id, db);
  const totalLiquido = detalhe.total_liquido_centavos;
  assert(totalLiquido > 0, "conta com valor");

  const metade = Math.floor(totalLiquido / 2);
  registrarPagamento(
    conta.id,
    { forma: "pix", valor_centavos: metade },
    1,
    db,
  );
  detalhe = obterContaDetalhe(conta.id, db);
  assert(detalhe.total_pago_centavos === metade, "pagamento parcial");
  assert(detalhe.saldo_pendente_centavos === totalLiquido - metade, "saldo após parcial");
  assert(detalhe.status === "em_aberto", "conta aberta após parcial");

  let erroFechamento = false;
  try {
    fecharConta(conta.id, { modo: "normal" }, 1, db);
  } catch {
    erroFechamento = true;
  }
  assert(erroFechamento, "bloqueia fechar com saldo");

  registrarPagamento(
    conta.id,
    { forma: "dinheiro", valor_centavos: detalhe.saldo_pendente_centavos },
    1,
    db,
  );
  detalhe = fecharConta(conta.id, { modo: "normal" }, 1, db);
  assert(detalhe.status === "pago", "conta paga após complemento");

  const dataDesconto = "2099-03-02";
  db.prepare(`DELETE FROM conta_pagamentos WHERE conta_id IN (
    SELECT id FROM contas_atendimento WHERE data = ?
  )`).run(dataDesconto);
  db.prepare(`DELETE FROM conta_itens WHERE conta_id IN (
    SELECT id FROM contas_atendimento WHERE data = ?
  )`).run(dataDesconto);
  db.prepare(`DELETE FROM contas_atendimento WHERE data = ?`).run(dataDesconto);

  const conta2 = abrirConta(
    { paciente_id: paciente!.id, data: dataDesconto, convenio_id: 1 },
    1,
    db,
  );
  adicionarItemConta(
    conta2.id,
    { procedimento_id: proc!.id, status: "solicitado" },
    1,
    db,
  );
  const antes = obterContaDetalhe(conta2.id, db);
  const desconto = 500;
  let erroMotivo = false;
  try {
    aplicarDesconto(
      conta2.id,
      { valor_desconto_centavos: desconto, motivo_desconto: null },
      1,
      db,
    );
  } catch {
    erroMotivo = true;
  }
  assert(erroMotivo, "desconto exige motivo");

  const comDesconto = aplicarDesconto(
    conta2.id,
    { valor_desconto_centavos: desconto, motivo_desconto: "Cortesia teste" },
    1,
    db,
  );
  assert(
    comDesconto.total_liquido_centavos === antes.total_itens_centavos - desconto,
    "total líquido com desconto",
  );

  const logDesconto = db
    .prepare(`SELECT 1 FROM log_acesso WHERE acao = 'cobranca_desconto' AND detalhe LIKE ?`)
    .get(`%conta=${conta2.id}%`);
  assert(!!logDesconto, "auditoria desconto");

  const dataIsento = "2099-03-03";
  db.prepare(`DELETE FROM conta_itens WHERE conta_id IN (
    SELECT id FROM contas_atendimento WHERE data = ?
  )`).run(dataIsento);
  db.prepare(`DELETE FROM contas_atendimento WHERE data = ?`).run(dataIsento);

  const conta3 = abrirConta(
    { paciente_id: paciente!.id, data: dataIsento, convenio_id: 1 },
    1,
    db,
  );
  adicionarItemConta(
    conta3.id,
    { procedimento_id: proc!.id, status: "solicitado" },
    1,
    db,
  );
  const isenta = fecharConta(
    conta3.id,
    { modo: "isento", motivo: "Cortesia administrativa" },
    1,
    db,
  );
  assert(isenta.status === "isento", "isenção");
  assert(isenta.total_pago_centavos === 0, "isenção sem pagamento");

  const dataVazia = "2099-03-03";
  db.prepare(`DELETE FROM conta_itens WHERE conta_id IN (
    SELECT id FROM contas_atendimento WHERE data = ?
  )`).run(dataVazia);
  db.prepare(`DELETE FROM contas_atendimento WHERE data = ?`).run(dataVazia);
  const contaVazia = abrirConta(
    { paciente_id: paciente!.id, data: dataVazia, convenio_id: 1 },
    1,
    db,
  );
  let bloqueouVazia = false;
  try {
    fecharConta(contaVazia.id, { modo: "normal" }, 1, db);
  } catch (e) {
    bloqueouVazia =
      e instanceof Error &&
      e.message.includes("pelo menos um procedimento");
  }
  assert(bloqueouVazia, "bloqueia fechar conta sem itens");

  db.close();
  console.log("M5 aceite: OK");
}

main();
