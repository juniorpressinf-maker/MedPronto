/**
 * Aceite M11 — baixa do recebimento do convênio (repasse).
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
import { fecharConta } from "../src/services/cobrancaPagamentos.js";
import {
  obterPendentesRepasseConvenio,
  receberConvenio,
  receberConvenioLote,
  FORMA_REPASSE_CONVENIO,
} from "../src/services/cobrancaReceberConvenio.js";
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
    .prepare(`SELECT id FROM procedimentos WHERE ativo = 1 ORDER BY id LIMIT 1`)
    .get() as { id: number } | undefined;
  let conv = db
    .prepare(`SELECT id FROM convenios WHERE tipo = 'operadora' AND ativo = 1 LIMIT 1`)
    .get() as { id: number } | undefined;
  if (!conv) {
    const ins = db
      .prepare(`INSERT INTO convenios (nome, tipo, ativo, exige_guia) VALUES ('Teste M11', 'operadora', 1, 0)`)
      .run();
    conv = { id: Number(ins.lastInsertRowid) };
  } else {
    db.prepare(`UPDATE convenios SET exige_guia = 0 WHERE id = ?`).run(conv.id);
  }
  assert(!!paciente && !!proc && !!conv, "precisa paciente, proc e operadora");

  const dataConta = "2099-10-15";
  const dataCredito = "2099-11-05";
  db.prepare(`DELETE FROM conta_pagamentos WHERE conta_id IN (
    SELECT id FROM contas_atendimento WHERE data = ?
  )`).run(dataConta);
  db.prepare(`DELETE FROM conta_convenio_guia WHERE conta_id IN (
    SELECT id FROM contas_atendimento WHERE data = ?
  )`).run(dataConta);
  db.prepare(`DELETE FROM conta_itens WHERE conta_id IN (
    SELECT id FROM contas_atendimento WHERE data = ?
  )`).run(dataConta);
  db.prepare(`DELETE FROM contas_atendimento WHERE data = ?`).run(dataConta);

  const antes = obterRelatorioCobranca(dataConta, dataConta, db);
  const aFaturarAntes = antes.resumo.a_faturar_centavos;

  const conta = abrirConta(
    { paciente_id: paciente!.id, data: dataConta, convenio_id: conv!.id },
    1,
    db,
  );
  adicionarItemConta(
    conta.id,
    { procedimento_id: proc!.id, status: "realizado" },
    1,
    db,
  );
  fecharConta(conta.id, { modo: "convenio" }, 1, db);

  const depoisFechar = obterRelatorioCobranca(dataConta, dataConta, db);
  assert(
    depoisFechar.resumo.a_faturar_centavos > aFaturarAntes,
    "a faturar aumentou após fechar convênio",
  );

  const pendente = obterContaDetalhe(conta.id, db);
  assert(pendente.status === "a_faturar_convenio", "fechada aguardando repasse");

  const lista = obterPendentesRepasseConvenio(dataConta, dataConta, conv!.id, db);
  assert(lista.qtd_contas === 1, "lista pendente repasse");
  assert(
    lista.grupos[0]?.contas.some((c) => c.conta_id === conta.id),
    "conta na lista",
  );

  const baixada = receberConvenio(
    conta.id,
    { data_recebimento: dataCredito, observacao: "Repasse teste" },
    1,
    db,
  );
  assert(baixada.status === "pago", "status pago após baixa");
  assert(baixada.pagamentos.length === 1, "um pagamento");
  assert(baixada.pagamentos[0]!.forma === FORMA_REPASSE_CONVENIO, "forma repasse");
  assert(baixada.pagamentos[0]!.valor_centavos > 0, "valor positivo");

  const listaDepois = obterPendentesRepasseConvenio(dataConta, dataConta, conv!.id, db);
  assert(listaDepois.qtd_contas === 0, "sumiu da lista pendente");

  const relConta = obterRelatorioCobranca(dataConta, dataConta, db);
  assert(
    relConta.resumo.a_faturar_centavos < depoisFechar.resumo.a_faturar_centavos,
    "a faturar diminuiu após baixa",
  );

  const relCredito = obterRelatorioCobranca(dataCredito, dataCredito, db);
  assert(
    relCredito.resumo.recebido_convenio_centavos >= baixada.total_liquido_centavos,
    "recebido convênio no período do crédito",
  );

  // lote com segunda conta (outro dia — mesmo paciente/data reutiliza conta fechada)
  const dataConta2 = "2099-10-16";
  db.prepare(`DELETE FROM conta_pagamentos WHERE conta_id IN (
    SELECT id FROM contas_atendimento WHERE data = ?
  )`).run(dataConta2);
  db.prepare(`DELETE FROM conta_itens WHERE conta_id IN (
    SELECT id FROM contas_atendimento WHERE data = ?
  )`).run(dataConta2);
  db.prepare(`DELETE FROM contas_atendimento WHERE data = ?`).run(dataConta2);

  const conta2 = abrirConta(
    { paciente_id: paciente!.id, data: dataConta2, convenio_id: conv!.id },
    1,
    db,
  );
  adicionarItemConta(conta2.id, { procedimento_id: proc!.id, status: "realizado" }, 1, db);
  fecharConta(conta2.id, { modo: "convenio" }, 1, db);

  const lote = receberConvenioLote(
    { conta_ids: [conta2.id], data_recebimento: dataCredito },
    1,
    db,
  );
  assert(lote.ok === 1, "lote ok");

  let rejeitouEmAberto = false;
  try {
    receberConvenio(conta2.id, { data_recebimento: dataCredito }, 1, db);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/repasse|fechada|pago/i.test(msg)) rejeitouEmAberto = true;
    else throw e;
  }
  assert(rejeitouEmAberto, "não baixa conta já paga");

  db.close();
  console.log("M11 aceite: todos os testes passaram.");
}

main();
