/**
 * Aceite U6 — check-in ASO e consulta+exame; erro de cobrança não deixa presente.
 */
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import { runMigrations } from "../src/db/migrate.js";
import { executarContaNoCheckin } from "../src/services/cobrancaCheckin.js";
import { gravarProcedimentosExtras } from "../src/services/agendamentoAtendimento.js";
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
  const procAso = db
    .prepare(
      `SELECT id FROM procedimentos WHERE modo_clinico = 'aso' AND ativo = 1 LIMIT 1`,
    )
    .get() as { id: number } | undefined;
  assert(
    !!paciente && !!medico && !!procConsulta && !!procEndo && !!procAso,
    "precisa paciente, médico, Consulta, Endoscopia e ASO",
  );

  const dataTeste = "2099-08-24";
  db.prepare(`DELETE FROM conta_itens WHERE conta_id IN (
    SELECT id FROM contas_atendimento WHERE data = ?
  )`).run(dataTeste);
  db.prepare(`DELETE FROM contas_atendimento WHERE data = ?`).run(dataTeste);
  db.prepare(`DELETE FROM agendamentos WHERE data = ?`).run(dataTeste);

  const agAso = Number(
    db
      .prepare(
        `INSERT INTO agendamentos
         (paciente_id, medico_id, data, hora, tipo_atendimento, status,
          procedimento_id, convenio_id)
         VALUES (?, ?, ?, '08:00', 'admissional', 'agendado', ?, 1)`,
      )
      .run(paciente!.id, medico!.id, dataTeste, procAso!.id).lastInsertRowid,
  );
  db.prepare(
    `UPDATE agendamentos SET status = 'presente' WHERE id = ?`,
  ).run(agAso);
  const rAso = executarContaNoCheckin(agAso, 1, db);
  const cAso = obterContaDetalhe(rAso.conta_id, db);
  assert(cAso.agendamento_id === agAso, "conta ASO do horário");
  assert(
    cAso.itens.some(
      (i) => i.procedimento_id === procAso!.id && i.status === "previsto",
    ),
    "ASO cria item previsto",
  );

  const agMix = Number(
    db
      .prepare(
        `INSERT INTO agendamentos
         (paciente_id, medico_id, data, hora, tipo_atendimento, status,
          procedimento_id, convenio_id)
         VALUES (?, ?, ?, '10:00', 'consulta', 'agendado', ?, 1)`,
      )
      .run(paciente!.id, medico!.id, dataTeste, procConsulta!.id).lastInsertRowid,
  );
  gravarProcedimentosExtras(agMix, [procConsulta!.id, procEndo!.id], db);
  db.prepare(
    `UPDATE agendamentos SET status = 'presente' WHERE id = ?`,
  ).run(agMix);
  const rMix = executarContaNoCheckin(agMix, 1, db);
  const cMix = obterContaDetalhe(rMix.conta_id, db);
  const previstos = cMix.itens.filter((i) => i.status === "previsto");
  assert(previstos.length === 2, "consulta + ultrassom → dois previstos");
  assert(
    previstos.some((i) => i.procedimento_id === procConsulta!.id),
    "item Consulta",
  );
  assert(
    previstos.some((i) => i.procedimento_id === procEndo!.id),
    "item Endoscopia",
  );

  const agAbort = Number(
    db
      .prepare(
        `INSERT INTO agendamentos
         (paciente_id, medico_id, data, hora, tipo_atendimento, status,
          procedimento_id, convenio_id)
         VALUES (?, ?, ?, '16:00', 'consulta', 'agendado', ?, 1)`,
      )
      .run(paciente!.id, medico!.id, dataTeste, procConsulta!.id).lastInsertRowid,
  );
  let abortou = false;
  try {
    db.transaction(() => {
      db.prepare(
        `UPDATE agendamentos SET status = 'presente' WHERE id = ?`,
      ).run(agAbort);
      executarContaNoCheckin(999999001, 1, db);
    })();
  } catch {
    abortou = true;
  }
  assert(abortou, "erro de cobrança aborta a transação");
  const st = db
    .prepare(`SELECT status FROM agendamentos WHERE id = ?`)
    .get(agAbort) as { status: string };
  assert(st.status === "agendado", "não fica presente sem conta");

  db.close();
  console.log("U6 aceite: todos os testes passaram.");
}

main();
