/**
 * Aceite M3 — check-in abre conta com item previsto.
 */
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import { runMigrations } from "../src/db/migrate.js";
import { executarContaNoCheckin } from "../src/services/cobrancaCheckin.js";
import { obterContaDetalhe } from "../src/services/cobrancaContas.js";

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
  const medico = db
    .prepare(`SELECT id FROM usuarios WHERE perfil = 'medico' AND ativo = 1 LIMIT 1`)
    .get() as { id: number } | undefined;
  assert(!!paciente && !!medico, "precisa paciente e médico");

  const dataTeste = "2099-02-10";
  db.prepare(`DELETE FROM conta_itens WHERE conta_id IN (
    SELECT id FROM contas_atendimento WHERE data = ?
  )`).run(dataTeste);
  db.prepare(`DELETE FROM contas_atendimento WHERE data = ?`).run(dataTeste);
  db.prepare(`DELETE FROM agendamentos WHERE data = ?`).run(dataTeste);

  const ins = db
    .prepare(
      `INSERT INTO agendamentos
       (paciente_id, medico_id, data, hora, tipo_atendimento, status, eh_retorno)
       VALUES (?, ?, ?, '09:00', 'consulta', 'presente', 0)`,
    )
    .run(paciente!.id, medico!.id, dataTeste);
  const agId = Number(ins.lastInsertRowid);

  const r1 = executarContaNoCheckin(agId, 1, db);
  assert(!!r1?.conta_id, "conta criada no check-in");

  const conta = obterContaDetalhe(r1!.conta_id, db);
  assert(conta.itens.length === 1, "um item previsto");
  assert(conta.itens[0]?.status === "previsto", "status previsto");
  assert(conta.itens[0]?.procedimento_nome === "Consulta", "procedimento Consulta");

  const insRet = db
    .prepare(
      `INSERT INTO agendamentos
       (paciente_id, medico_id, data, hora, tipo_atendimento, status, eh_retorno)
       VALUES (?, ?, '2099-02-11', '10:00', 'consulta', 'presente', 1)`,
    )
    .run(paciente!.id, medico!.id);
  const agRetId = Number(insRet.lastInsertRowid);
  const r2 = executarContaNoCheckin(agRetId, 1, db);
  const contaRet = obterContaDetalhe(r2!.conta_id, db);
  assert(
    contaRet.itens[0]?.procedimento_nome === "Consulta retorno",
    "retorno usa Consulta retorno",
  );

  const dup = executarContaNoCheckin(agId, 1, db);
  assert(dup?.conta_id === r1!.conta_id, "segundo check-in reutiliza conta");
  const contaDup = obterContaDetalhe(r1!.conta_id, db);
  assert(contaDup.itens.length === 1, "sem duplicar item");

  const procEndo = db
    .prepare(`SELECT id FROM procedimentos WHERE nome = 'Endoscopia' AND ativo = 1`)
    .get() as { id: number } | undefined;
  assert(!!procEndo, "procedimento Endoscopia no seed");

  const insEndo = db
    .prepare(
      `INSERT INTO agendamentos
       (paciente_id, medico_id, data, hora, tipo_atendimento, status, eh_retorno, procedimento_id)
       VALUES (?, ?, '2099-02-12', '11:00', 'consulta', 'presente', 0, ?)`,
    )
    .run(paciente!.id, medico!.id, procEndo!.id);
  const agEndoId = Number(insEndo.lastInsertRowid);
  const rEndo = executarContaNoCheckin(agEndoId, 1, db);
  const contaEndo = obterContaDetalhe(rEndo!.conta_id, db);
  assert(
    contaEndo.itens[0]?.procedimento_nome === "Endoscopia",
    "procedimento previsto Endoscopia no check-in",
  );

  db.close();
  console.log("M3 aceite: todos os testes passaram.");
}

main();
