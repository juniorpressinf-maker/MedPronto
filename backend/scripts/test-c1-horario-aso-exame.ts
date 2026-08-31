/**
 * Aceite C1 — um horário não mistura prontuário e ASO; só-exame não abre ficha.
 * Transação + ROLLBACK (não grava na clínica).
 */
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import { runMigrations } from "../src/db/migrate.js";
import {
  assertHorarioAbreAso,
  horarioSoExame,
} from "../src/services/agendamentoAtendimento.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(__dirname, "../../data/medpronto.db");

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`FALHOU: ${msg}`);
}

function assertThrows(fn: () => void, fragment: string): void {
  try {
    fn();
    throw new Error(`FALHOU: esperava erro contendo "${fragment}"`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.startsWith("FALHOU:")) throw e;
    assert(msg.includes(fragment), `erro "${msg}" não contém "${fragment}"`);
  }
}

function main(): void {
  runMigrations();
  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");

  const trig = db
    .prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'trigger' AND name = 'trg_admissional_sem_prontuario_ins'`,
    )
    .get() as { name: string } | undefined;
  assert(!!trig, "trigger 044 trg_admissional_sem_prontuario_ins");

  const paciente = db
    .prepare(`SELECT id FROM pacientes ORDER BY id LIMIT 1`)
    .get() as { id: number } | undefined;
  const medico = db
    .prepare(
      `SELECT id FROM usuarios WHERE perfil IN ('medico', 'admin') AND ativo = 1 LIMIT 1`,
    )
    .get() as { id: number } | undefined;
  const procConsulta = db
    .prepare(
      `SELECT id FROM procedimentos WHERE modo_clinico = 'prontuario' AND ativo = 1 LIMIT 1`,
    )
    .get() as { id: number } | undefined;
  const procAso = db
    .prepare(
      `SELECT id FROM procedimentos WHERE modo_clinico = 'aso' AND ativo = 1 LIMIT 1`,
    )
    .get() as { id: number } | undefined;
  const procExame = db
    .prepare(
      `SELECT id FROM procedimentos WHERE modo_clinico = 'nenhum' AND ativo = 1 LIMIT 1`,
    )
    .get() as { id: number } | undefined;
  assert(
    !!paciente && !!medico && !!procConsulta && !!procAso && !!procExame,
    "precisa paciente, médico, consulta, ASO e exame",
  );

  db.prepare(
    `DELETE FROM agendamentos WHERE data = '2099-12-31' AND hora IN ('23:40', '23:41', '23:42')`,
  ).run();

  const antesAg = (
    db.prepare(`SELECT COUNT(*) AS n FROM agendamentos`).get() as { n: number }
  ).n;
  const antesPr = (
    db.prepare(`SELECT COUNT(*) AS n FROM prontuarios`).get() as { n: number }
  ).n;
  const antesAd = (
    db.prepare(`SELECT COUNT(*) AS n FROM admissionais`).get() as { n: number }
  ).n;

  db.exec("BEGIN");
  try {
    const insAg = (
      hora: string,
      tipo: string,
      procId: number,
    ): number =>
      Number(
        db
          .prepare(
            `INSERT INTO agendamentos
             (paciente_id, medico_id, data, hora, tipo_atendimento, status,
              procedimento_id, convenio_id)
             VALUES (?, ?, '2099-12-31', ?, ?, 'presente', ?, 1)`,
          )
          .run(paciente!.id, medico!.id, hora, tipo, procId).lastInsertRowid,
      );

    const agCons = insAg("23:40", "consulta", procConsulta!.id);
    const agAso = insAg("23:41", "admissional", procAso!.id);
    const agEx = insAg("23:42", "exame", procExame!.id);

    assert(horarioSoExame(agEx, db), "horário só exame");
    assert(!horarioSoExame(agCons, db), "consulta não é só exame");
    assert(!horarioSoExame(agAso, db), "ASO não é só exame");

    assertThrows(
      () => assertHorarioAbreAso(agCons, db),
      "procedimento de consulta",
    );
    assertThrows(
      () => assertHorarioAbreAso(agEx, db),
      "não tem procedimento de ASO",
    );

    db.prepare(
      `INSERT INTO prontuarios (paciente_id, agendamento_id, medico_id)
       VALUES (?, ?, ?)`,
    ).run(paciente!.id, agCons, medico!.id);

    assertThrows(() => {
      db.prepare(
        `INSERT INTO admissionais (paciente_id, agendamento_id, medico_id, dados_json)
         VALUES (?, ?, ?, '{}')`,
      ).run(paciente!.id, agCons, medico!.id);
    }, "Não misture consulta e ASO no mesmo horário");

    db.prepare(
      `INSERT INTO admissionais (paciente_id, agendamento_id, medico_id, dados_json)
       VALUES (?, ?, ?, '{}')`,
    ).run(paciente!.id, agAso, medico!.id);

    assertThrows(() => {
      db.prepare(
        `INSERT INTO prontuarios (paciente_id, agendamento_id, medico_id)
         VALUES (?, ?, ?)`,
      ).run(paciente!.id, agAso, medico!.id);
    }, "Não misture consulta e ASO no mesmo horário");

    const walkIn = Number(
      db
        .prepare(
          `INSERT INTO admissionais (paciente_id, medico_id, dados_json)
           VALUES (?, ?, '{}')`,
        )
        .run(paciente!.id, medico!.id).lastInsertRowid,
    );
    assert(walkIn > 0, "ASO sem horário (walk-in) continua válido");

    const retif = Number(
      db
        .prepare(
          `INSERT INTO admissionais (paciente_id, medico_id, dados_json, agendamento_id)
           VALUES (?, ?, '{}', NULL)`,
        )
        .run(paciente!.id, medico!.id).lastInsertRowid,
    );
    assert(retif > 0, "ASO de retificação com agendamento_id NULL");

    db.exec("ROLLBACK");
  } catch (e) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* já revertido */
    }
    db.close();
    throw e;
  }

  const depoisAg = (
    db.prepare(`SELECT COUNT(*) AS n FROM agendamentos`).get() as { n: number }
  ).n;
  const depoisPr = (
    db.prepare(`SELECT COUNT(*) AS n FROM prontuarios`).get() as { n: number }
  ).n;
  const depoisAd = (
    db.prepare(`SELECT COUNT(*) AS n FROM admissionais`).get() as { n: number }
  ).n;
  assert(antesAg === depoisAg, "ROLLBACK não pode deixar horário de teste");
  assert(antesPr === depoisPr, "ROLLBACK não pode deixar prontuário de teste");
  assert(antesAd === depoisAd, "ROLLBACK não pode deixar ASO de teste");

  db.close();
  console.log("C1 horário prontuário×ASO e só-exame: ok");
}

main();
