import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const dbPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../data/medpronto.db");
const db = new Database(dbPath);
const data = "2026-07-05";

const rows = db
  .prepare(
    `SELECT c.id, c.paciente_id, p.nome, c.agendamento_id, c.status, cv.nome as convenio,
            c.created_at, c.fechada_em
     FROM contas_atendimento c
     JOIN pacientes p ON p.id = c.paciente_id
     LEFT JOIN convenios cv ON cv.id = c.convenio_id
     WHERE c.data = ?`,
  )
  .all(data);

console.log(JSON.stringify(rows, null, 2));

for (const c of rows as { id: number; agendamento_id: number | null }[]) {
  if (c.agendamento_id) {
    const ag = db
      .prepare(
        `SELECT id, status, tipo_atendimento, procedimento_id, eh_retorno FROM agendamentos WHERE id = ?`,
      )
      .get(c.agendamento_id);
    console.log(`agendamento conta ${c.id}:`, ag);
  }
}

db.close();
