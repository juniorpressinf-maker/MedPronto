/**
 * Aceite U11 — {preparo} junta N procedimentos; ASO entra no disparo;
 * segundo Zap só se hoje < data.
 */
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import { runMigrations } from "../src/db/migrate.js";
import { calcularDiaDisparoConfirmacao, hojeIsoLocal } from "../src/lib/diasUteis.js";
import { gravarProcedimentosExtras } from "../src/services/agendamentoAtendimento.js";
import {
  concatenarPreparosAgendamento,
  formatarTemplate,
  limparPreparosVencidos,
  listarAgendamentosParaDisparoNoDia,
  marcarPreparosEnviados,
  processarPreparosPendentesAgendamento,
  TEMPLATE_PADRAO,
} from "../src/services/whatsappService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(__dirname, "../../data/medpronto.db");

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`FALHOU: ${msg}`);
}

async function main(): Promise<void> {
  runMigrations();
  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");

  const paciente = db
    .prepare(`SELECT id, telefone FROM pacientes ORDER BY id LIMIT 1`)
    .get() as { id: number; telefone: string | null } | undefined;
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
  const procUltra = db
    .prepare(
      `SELECT id FROM procedimentos WHERE nome LIKE '%ULTRA%' AND ativo = 1 LIMIT 1`,
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

  const dataTeste = "2099-09-01";
  db.prepare(`DELETE FROM log_whatsapp WHERE agendamento_id IN (
    SELECT id FROM agendamentos WHERE data = ?
  )`).run(dataTeste);
  db.prepare(`DELETE FROM agendamentos WHERE data = ?`).run(dataTeste);

  const telAntes = paciente!.telefone;
  db.prepare(`UPDATE pacientes SET telefone = '11988887777' WHERE id = ?`).run(
    paciente!.id,
  );

  db.prepare(
    `UPDATE procedimentos SET orientacoes_paciente = 'jejum consulta' WHERE id = ?`,
  ).run(procConsulta!.id);
  db.prepare(
    `UPDATE procedimentos SET orientacoes_paciente = 'jejum endoscopia' WHERE id = ?`,
  ).run(procEndo!.id);
  if (procUltra) {
    db.prepare(
      `UPDATE procedimentos SET orientacoes_paciente = 'jejum ultrassom' WHERE id = ?`,
    ).run(procUltra.id);
  }

  const agMix = Number(
    db
      .prepare(
        `INSERT INTO agendamentos
         (paciente_id, medico_id, data, hora, tipo_atendimento, status,
          procedimento_id, convenio_id, confirmacao_enviada)
         VALUES (?, ?, ?, '08:00', 'consulta', 'agendado', ?, 1, 0)`,
      )
      .run(paciente!.id, medico!.id, dataTeste, procConsulta!.id).lastInsertRowid,
  );
  gravarProcedimentosExtras(agMix, [procConsulta!.id, procEndo!.id], db);

  const concat = concatenarPreparosAgendamento(agMix, db);
  assert(concat.includes("CONSULTA = jejum consulta"), "bloco consulta");
  assert(concat.includes("ENDOSCOPIA = jejum endoscopia"), "bloco endoscopia");
  assert(concat.includes("\n\n"), "linha em branco entre exames");
  const msg = formatarTemplate(TEMPLATE_PADRAO, {
    nome: "Ana",
    data: "01/09/2099",
    hora: "08:00",
    medico: "Dr Teste",
    preparo: concat,
  });
  assert(msg.includes("CONSULTA ="), "template leva nome do exame");
  assert(msg.includes("ENDOSCOPIA ="), "template leva endoscopia");

  const diaDisparoAso = calcularDiaDisparoConfirmacao(dataTeste);
  const agAso = Number(
    db
      .prepare(
        `INSERT INTO agendamentos
         (paciente_id, medico_id, data, hora, tipo_atendimento, status,
          procedimento_id, convenio_id, confirmacao_enviada)
         VALUES (?, ?, ?, '10:00', 'admissional', 'agendado', ?, 1, 0)`,
      )
      .run(paciente!.id, medico!.id, dataTeste, procAso!.id).lastInsertRowid,
  );
  const disparo = listarAgendamentosParaDisparoNoDia(diaDisparoAso, db);
  assert(
    disparo.some((a) => a.id === agAso),
    "ASO entra na lista de disparo",
  );

  db.prepare(
    `UPDATE agendamentos SET confirmacao_enviada = 1 WHERE id = ?`,
  ).run(agMix);
  marcarPreparosEnviados(agMix, db);
  const nMarcados = (
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM agendamento_procedimentos
         WHERE agendamento_id = ? AND preparo_enviado = 1`,
      )
      .get(agMix) as { n: number }
  ).n;
  assert(nMarcados === 2, "confirmação marca todos os preparos");

  if (procUltra) {
    db.prepare(
      `INSERT INTO agendamento_procedimentos
       (agendamento_id, procedimento_id, ordem, origem, preparo_enviado)
       VALUES (?, ?, 2, 'secretaria', 0)`,
    ).run(agMix, procUltra.id);
  } else {
    db.prepare(
      `UPDATE agendamento_procedimentos SET preparo_enviado = 0
       WHERE agendamento_id = ? AND procedimento_id = ?`,
    ).run(agMix, procEndo!.id);
  }
  const soNovo = concatenarPreparosAgendamento(agMix, db, true);
  assert(soNovo.length > 0, "há preparo pendente");
  assert(!soNovo.includes("jejum consulta"), "segundo recado só o item novo");

  const hoje = hojeIsoLocal();
  db.prepare(`UPDATE agendamentos SET data = ?, hora = '23:50' WHERE id = ?`).run(
    hoje,
    agMix,
  );
  const rMesmoDia = await processarPreparosPendentesAgendamento(agMix, db);
  assert(rMesmoDia.enviado === false, "no dia não envia extra");
  assert(rMesmoDia.motivo === "mesmo_dia_ou_passado", "motivo mesmo dia");
  const pendentesDepois = concatenarPreparosAgendamento(agMix, db, true);
  assert(pendentesDepois === "", "marca sem enviar no dia");

  limparPreparosVencidos(hoje, db);

  db.prepare(`UPDATE pacientes SET telefone = ? WHERE id = ?`).run(
    telAntes,
    paciente!.id,
  );

  db.close();
  console.log("U11 aceite: todos os testes passaram.");
}

void main();
