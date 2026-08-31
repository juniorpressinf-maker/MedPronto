/**
 * Cria consulta de demonstracao para hoje (opcional).
 * Medicos devem estar cadastrados em Agenda → Medicos (nome + CRM).
 */
import { createUser } from "../src/auth/users.js";
import { getDb } from "../src/db/index.js";
import { garantirUsuariosOperacionais } from "../src/services/usuariosPadrao.js";

function hojeLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function garantirMedicoTeste(db: ReturnType<typeof getDb>): { id: number } {
  const existente = db
    .prepare(
      `SELECT id FROM usuarios WHERE perfil = 'medico' AND ativo = 1 ORDER BY id LIMIT 1`,
    )
    .get() as { id: number } | undefined;
  if (existente) return existente;

  const user = createUser("dr.teste", "medico123", "medico", "Dr. Teste");
  db.prepare(`UPDATE usuarios SET crm = ? WHERE id = ?`).run("CRM 12345 MG", user.id);
  console.log("Medico de teste criado — login: dr.teste, senha: medico123, CRM 12345 MG");
  return { id: user.id };
}

function main() {
  garantirUsuariosOperacionais();
  const db = getDb();

  const medico = garantirMedicoTeste(db);

  let paciente = db
    .prepare(`SELECT id FROM pacientes ORDER BY id LIMIT 1`)
    .get() as { id: number } | undefined;
  if (!paciente) {
    const info = db
      .prepare(`INSERT INTO pacientes (nome, telefone) VALUES (?, ?)`)
      .run("Paciente Teste", "33999999999");
    paciente = { id: Number(info.lastInsertRowid) };
  }

  const data = hojeLocal();
  const existente = db
    .prepare(`SELECT id, status FROM agendamentos WHERE data = ? AND paciente_id = ?`)
    .get(data, paciente.id) as { id: number; status: string } | undefined;

  let agendamentoId: number;
  if (existente) {
    agendamentoId = existente.id;
    if (existente.status === "agendado") {
      db.prepare(
        `UPDATE agendamentos SET status = 'presente', updated_at = datetime('now', 'localtime') WHERE id = ?`,
      ).run(agendamentoId);
    }
  } else {
    const info = db
      .prepare(
        `INSERT INTO agendamentos (paciente_id, medico_id, data, hora, status)
         VALUES (?, ?, ?, '09:30', 'presente')`,
      )
      .run(paciente.id, medico.id, data);
    agendamentoId = Number(info.lastInsertRowid);
  }

  console.log("=== MedPronto — consulta de teste ===");
  console.log("");
  console.log("Secretaria (se criada): login secretaria, senha sec123");
  console.log("Medico de teste: login dr.teste, senha medico123");
  console.log("");
  console.log(`Consulta hoje (${data}): #${agendamentoId} — presente na fila`);
  console.log("Entre como medico e abra Atendimento → Fila do dia → Atender");
}

main();
