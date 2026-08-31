/**
 * Aceite U4 — uma conta por horário; walk-in no mesmo dia é outra conta.
 */
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import { runMigrations } from "../src/db/migrate.js";
import { executarContaNoCheckin, enriquecerAgendamentoComConta } from "../src/services/cobrancaCheckin.js";
import {
  abrirConta,
  obterContaDetalhe,
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

  let convOp = db
    .prepare(
      `SELECT id FROM convenios WHERE tipo = 'operadora' AND ativo = 1 LIMIT 1`,
    )
    .get() as { id: number } | undefined;
  if (!convOp) {
    const insConv = db
      .prepare(
        `INSERT INTO convenios (nome, tipo, ativo) VALUES ('U4 Operadora', 'operadora', 1)`,
      )
      .run();
    convOp = { id: Number(insConv.lastInsertRowid) };
  }

  const dataTeste = "2099-08-21";
  db.prepare(`DELETE FROM conta_itens WHERE conta_id IN (
    SELECT id FROM contas_atendimento WHERE data = ?
  )`).run(dataTeste);
  db.prepare(`DELETE FROM contas_atendimento WHERE data = ?`).run(dataTeste);
  db.prepare(`DELETE FROM agendamentos WHERE data = ?`).run(dataTeste);

  const agManha = Number(
    db
      .prepare(
        `INSERT INTO agendamentos
         (paciente_id, medico_id, data, hora, tipo_atendimento, status, procedimento_id, convenio_id)
         VALUES (?, ?, ?, '10:00', 'consulta', 'presente', ?, ?)`,
      )
      .run(paciente!.id, medico!.id, dataTeste, procConsulta!.id, convOp.id)
      .lastInsertRowid,
  );
  const agTarde = Number(
    db
      .prepare(
        `INSERT INTO agendamentos
         (paciente_id, medico_id, data, hora, tipo_atendimento, status, procedimento_id, convenio_id)
         VALUES (?, ?, ?, '14:00', 'consulta', 'presente', ?, 1)`,
      )
      .run(paciente!.id, medico!.id, dataTeste, procEndo!.id).lastInsertRowid,
  );

  const r1 = executarContaNoCheckin(agManha, 1, db);
  const r2 = executarContaNoCheckin(agTarde, 1, db);
  assert(r1.conta_id !== r2.conta_id, "dois horários → duas contas");

  const c1 = obterContaDetalhe(r1.conta_id, db);
  const c2 = obterContaDetalhe(r2.conta_id, db);
  assert(c1.agendamento_id === agManha, "conta manhã ligada ao 10:00");
  assert(c2.agendamento_id === agTarde, "conta tarde ligada ao 14:00");
  assert(c1.convenio_id === convOp.id, "convênio do horário na conta da manhã");
  assert(c2.convenio_id === 1, "Particular no ultrassom da tarde");
  assert(
    c1.itens.some((i) => i.procedimento_id === procConsulta!.id),
    "item Consulta só na manhã",
  );
  assert(
    !c1.itens.some((i) => i.procedimento_id === procEndo!.id),
    "Endoscopia não entra na conta das 10:00",
  );
  assert(
    c2.itens.some((i) => i.procedimento_id === procEndo!.id),
    "item Endoscopia na tarde",
  );

  const walkin = abrirConta(
    { paciente_id: paciente!.id, data: dataTeste, convenio_id: 1 },
    1,
    db,
  );
  assert(walkin.agendamento_id == null, "walk-in sem horário");
  assert(
    walkin.id !== c1.id && walkin.id !== c2.id,
    "walk-in é a terceira conta do dia",
  );

  const enriq = enriquecerAgendamentoComConta({ id: agTarde }, db);
  assert(enriq.conta_id === c2.id, "agenda aponta a conta daquele horário");

  const dataAso = "2099-08-22";
  db.prepare(`DELETE FROM conta_itens WHERE conta_id IN (
    SELECT id FROM contas_atendimento WHERE data = ?
  )`).run(dataAso);
  db.prepare(`DELETE FROM contas_atendimento WHERE data = ?`).run(dataAso);
  db.prepare(`DELETE FROM agendamentos WHERE data = ?`).run(dataAso);
  const agAso = Number(
    db
      .prepare(
        `INSERT INTO agendamentos
         (paciente_id, medico_id, data, hora, tipo_atendimento, status, procedimento_id, convenio_id)
         VALUES (?, ?, ?, '09:00', 'admissional', 'presente', ?, 1)`,
      )
      .run(paciente!.id, medico!.id, dataAso, procAso!.id).lastInsertRowid,
  );
  const rAso = executarContaNoCheckin(agAso, 1, db);
  const cAso = obterContaDetalhe(rAso.conta_id, db);
  assert(
    cAso.itens.some((i) => i.procedimento_id === procAso!.id),
    "ASO abre conta com o procedimento",
  );

  db.close();
  console.log("U4 aceite: todos os testes passaram.");
}

main();
