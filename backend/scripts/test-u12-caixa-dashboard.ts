/**
 * Aceite U12 — dois horários no mesmo dia = duas linhas no caixa;
 * totais somam as duas; dashboard conta contas, não pacientes.
 */
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import { runMigrations } from "../src/db/migrate.js";
import { gravarProcedimentosExtras } from "../src/services/agendamentoAtendimento.js";
import { obterCaixaDoDia } from "../src/services/cobrancaCaixa.js";
import { executarContaNoCheckin } from "../src/services/cobrancaCheckin.js";
import { listarContas } from "../src/services/cobrancaContas.js";
import { montarDashboard } from "../src/services/dashboardService.js";
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
  const medico = db
    .prepare(
      `SELECT id FROM usuarios WHERE perfil = 'medico' AND ativo = 1 LIMIT 1`,
    )
    .get() as { id: number } | undefined;
  const procConsulta = db
    .prepare(
      `SELECT id FROM procedimentos WHERE nome = 'Consulta' AND ativo = 1`,
    )
    .get() as { id: number } | undefined;
  const procEndo = db
    .prepare(
      `SELECT id FROM procedimentos WHERE nome = 'Endoscopia' AND ativo = 1`,
    )
    .get() as { id: number } | undefined;
  assert(
    !!paciente && !!medico && !!procConsulta && !!procEndo,
    "precisa paciente, médico, Consulta e Endoscopia",
  );

  const dataTeste = "2099-08-27";
  db.prepare(`DELETE FROM conta_pagamentos WHERE conta_id IN (
    SELECT id FROM contas_atendimento WHERE data = ?
  )`).run(dataTeste);
  db.prepare(`DELETE FROM conta_itens WHERE conta_id IN (
    SELECT id FROM contas_atendimento WHERE data = ?
  )`).run(dataTeste);
  db.prepare(`DELETE FROM contas_atendimento WHERE data = ?`).run(dataTeste);
  db.prepare(`DELETE FROM agendamentos WHERE data = ?`).run(dataTeste);

  const agManha = Number(
    db
      .prepare(
        `INSERT INTO agendamentos
         (paciente_id, medico_id, data, hora, tipo_atendimento, status,
          procedimento_id, convenio_id)
         VALUES (?, ?, ?, '10:00', 'consulta', 'presente', ?, 1)`,
      )
      .run(paciente!.id, medico!.id, dataTeste, procConsulta!.id).lastInsertRowid,
  );
  gravarProcedimentosExtras(agManha, [procConsulta!.id], db);

  const agTarde = Number(
    db
      .prepare(
        `INSERT INTO agendamentos
         (paciente_id, medico_id, data, hora, tipo_atendimento, status,
          procedimento_id, convenio_id)
         VALUES (?, ?, ?, '14:00', 'consulta', 'presente', ?, 1)`,
      )
      .run(paciente!.id, medico!.id, dataTeste, procEndo!.id).lastInsertRowid,
  );
  gravarProcedimentosExtras(agTarde, [procEndo!.id], db);

  executarContaNoCheckin(agManha, 1, db);
  executarContaNoCheckin(agTarde, 1, db);

  const lista = listarContas(dataTeste, undefined, db);
  assert(lista.length === 2, "contas do dia: duas linhas (não uma por paciente)");
  const horas = new Set(lista.map((c) => (c.agendamento_hora ?? "").slice(0, 5)));
  assert(horas.has("10:00") && horas.has("14:00"), "hora de cada horário na lista");
  assert(
    lista.some((c) => (c.procedimentos_nomes ?? "").includes("Consulta")),
    "procedimentos da manhã na lista",
  );
  assert(
    lista.some((c) => (c.procedimentos_nomes ?? "").includes("Endoscopia")),
    "procedimentos da tarde na lista",
  );

  const caixa = obterCaixaDoDia(dataTeste, db);
  assert(caixa.contas.length === 2, "caixa: duas linhas");
  assert(caixa.totais.contas === 2, "totais.contas = 2");
  assert(caixa.totais.em_aberto === 2, "duas em aberto");
  const somaSaldos = caixa.contas.reduce((s, c) => s + c.saldo_pendente_centavos, 0);
  assert(
    caixa.totais.saldo_pendente_centavos === somaSaldos,
    "totais somam as duas contas",
  );
  assert(
    caixa.contas.every((c) => c.paciente_id === paciente!.id),
    "mesmo paciente nas duas linhas",
  );
  assert(
    new Set(caixa.contas.map((c) => c.id)).size === 2,
    "ids de conta distintos",
  );

  const dash = montarDashboard(dataTeste, dataTeste, undefined, db);
  assert(dash.financeiro != null, "dashboard com financeiro");
  assert(
    dash.financeiro!.contas_abertas === 2,
    `dashboard contas_abertas = contas (2), não pacientes; veio ${dash.financeiro!.contas_abertas}`,
  );
  const atendConv = dash.financeiro!.por_convenio.reduce(
    (s, r) => s + r.atendimentos,
    0,
  );
  assert(atendConv === 2, "ranking por convênio soma 2 contas");

  const rel = obterRelatorioCobranca(dataTeste, dataTeste, db);
  assert(rel.resumo.contas_periodo === 2, "relatório: 2 contas no período");
  const relAtend = rel.por_convenio.reduce((s, r) => s + r.atendimentos, 0);
  assert(relAtend === 2, "relatório por convênio conta contas, não pacientes");

  db.close();
  console.log("U12 aceite: todos os testes passaram.");
}

main();
