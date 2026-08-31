/**
 * Aceite U9 — abre clínico pelo modo do procedimento, não pelo tipo.
 */
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import { runMigrations } from "../src/db/migrate.js";
import {
  assertHorarioAbreAso,
  assertHorarioAbreProntuario,
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
    "precisa paciente, médico, procedimento prontuário, ASO e exame",
  );

  const dataTeste = "2099-08-25";
  db.prepare(`DELETE FROM agendamentos WHERE data = ?`).run(dataTeste);

  const ins = (
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
           VALUES (?, ?, ?, ?, ?, 'presente', ?, 1)`,
        )
        .run(paciente!.id, medico!.id, dataTeste, hora, tipo, procId)
        .lastInsertRowid,
    );

  const agAso = ins("10:00", "admissional", procAso!.id);
  assertThrows(
    () => assertHorarioAbreProntuario(agAso, db),
    "procedimento de ASO",
  );
  assertHorarioAbreAso(agAso, db);

  const agCons = ins("10:15", "consulta", procConsulta!.id);
  assertThrows(
    () => assertHorarioAbreAso(agCons, db),
    "procedimento de consulta",
  );
  assertHorarioAbreProntuario(agCons, db);

  const agEx = ins("10:30", "exame", procExame!.id);
  assertThrows(
    () => assertHorarioAbreProntuario(agEx, db),
    "não tem procedimento de consulta",
  );
  assertThrows(
    () => assertHorarioAbreAso(agEx, db),
    "não tem procedimento de ASO",
  );

  db.prepare(`DELETE FROM agendamentos WHERE data = ?`).run(dataTeste);
  console.log("U9 OK");
}

main();
