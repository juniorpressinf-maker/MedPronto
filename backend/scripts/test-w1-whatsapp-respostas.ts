/**
 * W1 — respostas do paciente no WhatsApp: SIM confirma; "não posso" sinaliza recusa (sem cancelar);
 * outra resposta fica visível. Roda numa CÓPIA do banco (DATABASE_PATH, via test:regressao).
 */
import "./lib/exigirCopia.js"; // trava: nunca no banco real (rodar via npm run test:*)
import Database from "better-sqlite3";
import os from "node:os";
import path from "node:path";
import { limparResiduos2099 } from "./lib/limparResiduos2099.js";

let n = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FALHOU: ${msg}`);
  n++;
}

if (!process.env.DATABASE_PATH) {
  const copia = path.join(os.tmpdir(), `w1-${Date.now()}.db`);
  const real = new Database(path.resolve("../data/medpronto.db"), { readonly: true });
  await real.backup(copia);
  real.close();
  process.env.DATABASE_PATH = copia;
}

const { runMigrations } = await import("../src/db/migrate.js");
const { getDb } = await import("../src/db/index.js");
const { registrarRespostaPaciente, ehRecusa, ehConfirmacao } = await import("../src/services/whatsappRespostas.js");

runMigrations();
const db = getDb();
limparResiduos2099(db);

assert(ehConfirmacao("Sim, confirmo") && !ehRecusa("Sim, confirmo"), "sim = confirma");
assert(ehRecusa("não posso ir") && ehRecusa("Nao") && ehRecusa("quero remarcar") && ehRecusa("pode cancelar"), "recusas");
assert(!ehRecusa("que horas é?") && !ehConfirmacao("que horas é?"), "pergunta = outra");

const med = db.prepare(`SELECT id FROM usuarios WHERE perfil = 'medico' LIMIT 1`).get() as { id: number };
const proc = db.prepare(`SELECT id FROM procedimentos WHERE ativo = 1 ORDER BY id LIMIT 1`).get() as { id: number };
const pac = Number(
  db.prepare(`INSERT INTO pacientes (nome, data_nasc, telefone) VALUES ('TESTE W1', '1990-01-01', '(31) 99876-5432')`).run()
    .lastInsertRowid,
);
const novoAg = (hora: string) =>
  Number(
    db
      .prepare(
        `INSERT INTO agendamentos (paciente_id, medico_id, data, hora, tipo_atendimento, status, procedimento_id, confirmacao_enviada)
         VALUES (?, ?, '2099-10-10', ?, 'consulta', 'agendado', ?, 1)`,
      )
      .run(pac, med.id, hora, proc.id).lastInsertRowid,
  );
const ag = (id: number) =>
  db
    .prepare(
      `SELECT status, confirmacao_respondida, whatsapp_ultima_resposta, whatsapp_resposta_tipo FROM agendamentos WHERE id = ?`,
    )
    .get(id) as { status: string; confirmacao_respondida: number; whatsapp_ultima_resposta: string; whatsapp_resposta_tipo: string };

const hoje = "2099-01-01";
const a1 = novoAg("09:00");
let r = registrarRespostaPaciente("5531998765432", "não posso ir", hoje, db);
assert(r.tipo === "recusou", `recusou: ${r.tipo}`);
assert(ag(a1).status === "agendado", "recusa NÃO cancela");
assert(ag(a1).whatsapp_resposta_tipo === "recusou" && ag(a1).whatsapp_ultima_resposta === "não posso ir", "recusa gravada");

r = registrarRespostaPaciente("553198765432", "que horas é?", hoje, db); // sem o 9º dígito
assert(r.tipo === "outra" && ag(a1).whatsapp_resposta_tipo === "outra", "outra resposta gravada");
assert(ag(a1).confirmacao_respondida === 0, "outra não confirma");

r = registrarRespostaPaciente("5531998765432", "Sim", hoje, db);
assert(r.tipo === "confirmou" && ag(a1).confirmacao_respondida === 1, "sim confirma depois");

console.log(`W1 OK — ${n} verificações (sim confirma; não sinaliza sem cancelar; outra visível).`);
