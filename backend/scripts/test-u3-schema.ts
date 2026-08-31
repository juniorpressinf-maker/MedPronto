/**
 * Aceite U3 — todo agendamento tem ≥1 procedimento N:N e convenio_id.
 */
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import { runMigrations } from "../src/db/migrate.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(__dirname, "../../data/medpronto.db");

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`FALHOU: ${msg}`);
}

function main(): void {
  runMigrations();
  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");

  const orfaos = db
    .prepare(
      `SELECT COUNT(*) AS n FROM agendamentos a
       WHERE NOT EXISTS (
         SELECT 1 FROM agendamento_procedimentos ap WHERE ap.agendamento_id = a.id
       )`,
    )
    .get() as { n: number };
  assert(orfaos.n === 0, `agendamentos sem N:N: ${orfaos.n}`);

  const semConv = db
    .prepare(
      `SELECT COUNT(*) AS n FROM agendamentos WHERE convenio_id IS NULL`,
    )
    .get() as { n: number };
  assert(semConv.n === 0, `agendamentos sem convenio_id: ${semConv.n}`);

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

  if (!paciente || !medico || !procConsulta || !procAso) {
    db.close();
    console.log("U3 aceite: clinic vazia ou sem seed — schema e backfill OK.");
    return;
  }

  const dataTeste = "2099-08-20";
  db.prepare(`DELETE FROM agendamentos WHERE data = ?`).run(dataTeste);

  const ins = db
    .prepare(
      `INSERT INTO agendamentos
       (paciente_id, medico_id, data, hora, tipo_atendimento, status)
       VALUES (?, ?, ?, '08:00', 'consulta', 'agendado')`,
    )
    .run(paciente.id, medico.id, dataTeste);
  const agId = Number(ins.lastInsertRowid);

  const nn = db
    .prepare(
      `SELECT procedimento_id, origem FROM agendamento_procedimentos WHERE agendamento_id = ?`,
    )
    .all(agId) as { procedimento_id: number; origem: string }[];
  assert(nn.length === 1, "INSERT antigo gera 1 linha N:N");
  assert(nn[0]?.origem === "agenda", "origem agenda");

  const ag = db
    .prepare(
      `SELECT convenio_id, procedimento_id FROM agendamentos WHERE id = ?`,
    )
    .get(agId) as { convenio_id: number; procedimento_id: number };
  assert(ag.convenio_id === 1, "convenio_id Particular por omissão");
  assert(ag.procedimento_id === nn[0]?.procedimento_id, "espelho = primeiro N:N");

  let mixBloqueado = false;
  try {
    db.prepare(
      `INSERT INTO agendamento_procedimentos (agendamento_id, procedimento_id, ordem, origem)
       VALUES (?, ?, 1, 'secretaria')`,
    ).run(agId, procAso.id);
  } catch (e) {
    mixBloqueado =
      e instanceof Error && e.message.includes("Não misture consulta e ASO");
  }
  assert(mixBloqueado, "bloqueia prontuario + aso no mesmo horário");

  let minBloqueado = false;
  try {
    db.prepare(
      `DELETE FROM agendamento_procedimentos WHERE agendamento_id = ?`,
    ).run(agId);
  } catch (e) {
    minBloqueado =
      e instanceof Error &&
      e.message.includes("pelo menos um procedimento");
  }
  assert(minBloqueado, "bloqueia apagar o último procedimento");

  db.prepare(`DELETE FROM agendamentos WHERE id = ?`).run(agId);
  const restou = db
    .prepare(
      `SELECT COUNT(*) AS n FROM agendamento_procedimentos WHERE agendamento_id = ?`,
    )
    .get(agId) as { n: number };
  assert(restou.n === 0, "CASCADE apaga N:N junto com o horário");

  db.close();
  console.log("U3 aceite: todos os testes passaram.");
}

main();
