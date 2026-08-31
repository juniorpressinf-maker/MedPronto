/**
 * Aceite M4 — médico solicita procedimento na consulta.
 */
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import { runMigrations } from "../src/db/migrate.js";
import { executarContaNoCheckin } from "../src/services/cobrancaCheckin.js";
import {
  adicionarItemConta,
  obterContaDetalhe,
  obterContaPorProntuario,
  sanitizarContaParaSolicitante,
} from "../src/services/cobrancaContas.js";

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
  const eletro = db
    .prepare(`SELECT id FROM procedimentos WHERE nome = 'Eletro' AND ativo = 1`)
    .get() as { id: number } | undefined;
  assert(!!paciente && !!medico && !!eletro, "precisa paciente, médico e Eletro");

  const dataTeste = "2099-04-01";
  db.prepare(`DELETE FROM conta_pagamentos WHERE conta_id IN (
    SELECT id FROM contas_atendimento WHERE data = ?
  )`).run(dataTeste);
  db.prepare(`DELETE FROM conta_convenio_guia WHERE conta_id IN (
    SELECT id FROM contas_atendimento WHERE data = ?
  )`).run(dataTeste);
  db.prepare(`DELETE FROM conta_itens WHERE conta_id IN (
    SELECT id FROM contas_atendimento WHERE data = ?
  )`).run(dataTeste);
  db.prepare(`DELETE FROM contas_atendimento WHERE data = ?`).run(dataTeste);
  db.prepare(`DELETE FROM prontuarios WHERE data_atendimento LIKE ?`).run(
    `${dataTeste}%`,
  );
  db.prepare(`DELETE FROM agendamentos WHERE data = ?`).run(dataTeste);

  const insAg = db
    .prepare(
      `INSERT INTO agendamentos
       (paciente_id, medico_id, data, hora, tipo_atendimento, status, eh_retorno)
       VALUES (?, ?, ?, '09:00', 'consulta', 'presente', 0)`,
    )
    .run(paciente!.id, medico!.id, dataTeste);
  const agId = Number(insAg.lastInsertRowid);

  const insPr = db
    .prepare(
      `INSERT INTO prontuarios (paciente_id, agendamento_id, medico_id, data_atendimento)
       VALUES (?, ?, ?, ?)`,
    )
    .run(paciente!.id, agId, medico!.id, `${dataTeste} 09:00:00`);
  const prId = Number(insPr.lastInsertRowid);

  const checkin = executarContaNoCheckin(agId, 1, db);
  assert(!!checkin?.conta_id, "conta aberta no check-in");

  const porPront = obterContaPorProntuario(prId, db);
  assert(!!porPront, "conta localizada pelo prontuário");
  assert(porPront!.id === checkin!.conta_id, "mesma conta do check-in");

  adicionarItemConta(
    porPront!.id,
    { procedimento_id: eletro!.id, status: "solicitado", observacao: "Na consulta" },
    medico!.id,
    db,
  );

  const conta = obterContaDetalhe(porPront!.id, db);
  const itemEletro = conta.itens.find(
    (i) => i.procedimento_id === eletro!.id && i.status === "solicitado",
  );
  assert(!!itemEletro, "item Eletro solicitado");
  assert(itemEletro!.solicitado_por === medico!.id, "solicitado pelo médico");
  assert(itemEletro!.observacao === "Na consulta", "observação gravada");

  const sanitizada = sanitizarContaParaSolicitante(conta);
  assert(sanitizada.total_liquido_centavos === 0, "médico não vê totais");
  assert(sanitizada.itens.every((i) => i.valor_centavos === 0), "médico não vê valores");
  assert(sanitizada.pagamentos.length === 0, "médico não vê pagamentos");

  db.close();
  console.log("M4 aceite: todos os testes passaram.");
}

main();
