/**

 * Aceite M9 — guia convênio manual e fechamento a_faturar_convenio.

 */

import Database from "better-sqlite3";

import path from "path";

import { fileURLToPath } from "url";

import { runMigrations } from "../src/db/migrate.js";

import {

  abrirConta,

  adicionarItemConta,

  obterContaDetalhe,

  ProcedimentoDuplicadoError,

  salvarGuiaConvenio,

} from "../src/services/cobrancaContas.js";

import { fecharConta } from "../src/services/cobrancaPagamentos.js";



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

  let convOperadora = db

    .prepare(`SELECT id FROM convenios WHERE tipo = 'operadora' AND ativo = 1 LIMIT 1`)

    .get() as { id: number } | undefined;

  if (!convOperadora) {

    const ins = db

      .prepare(`INSERT INTO convenios (nome, tipo, ativo) VALUES ('Teste Operadora M9', 'operadora', 1)`)

      .run();

    convOperadora = { id: Number(ins.lastInsertRowid) };

  }

  assert(!!paciente && !!proc && !!convOperadora, "precisa paciente, procedimento e convênio operadora");



  const dataTeste = "2099-07-01";

  db.prepare(`DELETE FROM conta_convenio_guia WHERE conta_id IN (

    SELECT id FROM contas_atendimento WHERE data = ?

  )`).run(dataTeste);

  db.prepare(`DELETE FROM conta_itens WHERE conta_id IN (

    SELECT id FROM contas_atendimento WHERE data = ?

  )`).run(dataTeste);

  db.prepare(`DELETE FROM contas_atendimento WHERE data = ?`).run(dataTeste);



  const conta = abrirConta(

    { paciente_id: paciente!.id, data: dataTeste, convenio_id: convOperadora!.id },

    1,

    db,

  );

  adicionarItemConta(

    conta.id,

    { procedimento_id: proc!.id, status: "previsto" },

    1,

    db,

  );



  let bloqueouSemGuia = false;

  try {

    fecharConta(conta.id, { modo: "convenio" }, 1, db);

  } catch (e) {

    const msg = e instanceof Error ? e.message : String(e);

    if (/guia/i.test(msg)) bloqueouSemGuia = true;

    else throw e;

  }

  assert(bloqueouSemGuia, "exige número da guia para fechar convênio");



  let duplicou = false;

  try {

    adicionarItemConta(

      conta.id,

      { procedimento_id: proc!.id, status: "solicitado" },

      1,

      db,

    );

  } catch (e) {

    if (e instanceof ProcedimentoDuplicadoError) duplicou = true;

    else throw e;

  }

  assert(duplicou, "bloqueia duplicata sem confirmar");



  adicionarItemConta(

    conta.id,

    { procedimento_id: proc!.id, status: "solicitado", confirmar_duplicata: true },

    1,

    db,

  );

  assert(

    obterContaDetalhe(conta.id, db).itens.filter((i) => i.status !== "cancelado").length === 2,

    "permite duplicata com confirmar_duplicata",

  );



  salvarGuiaConvenio(

    conta.id,

    { numero_guia: "GUIA-12345", senha: "SENHA1", autorizacao: "AUT-99" },

    db,

  );

  const fechada = fecharConta(

    conta.id,

    { modo: "convenio" },

    1,

    db,

  );

  assert(fechada.status === "a_faturar_convenio", "fecha como a faturar");

  assert(

    fechada.convenio_guia?.numero_guia === "GUIA-12345",

    "guia persistida na conta fechada",

  );



  db.close();

  console.log("M9 aceite: todos os testes passaram.");

}



main();

