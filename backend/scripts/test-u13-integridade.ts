/**
 * Aceite U13 — triggers de vínculo horário↔conta e suíte dos casos da unificação.
 */
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import { runMigrations } from "../src/db/migrate.js";
import { hojeIsoLocal } from "../src/lib/diasUteis.js";
import {
  assertContratoAgendamentoNovo,
  gravarProcedimentosExtras,
  sincronizarProcedimentosAgendamento,
  validarListaProcedimentos,
} from "../src/services/agendamentoAtendimento.js";
import { executarContaNoCheckin } from "../src/services/cobrancaCheckin.js";
import {
  abrirConta,
  obterContaDetalhe,
} from "../src/services/cobrancaContas.js";
import {
  concatenarPreparosAgendamento,
  marcarPreparosEnviados,
  processarPreparosPendentesAgendamento,
} from "../src/services/whatsappService.js";

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

async function main(): Promise<void> {
  runMigrations();
  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");

  const paciente = db
    .prepare(`SELECT id FROM pacientes ORDER BY id LIMIT 1`)
    .get() as { id: number } | undefined;
  const outroPaciente = db
    .prepare(`SELECT id FROM pacientes WHERE id != ? ORDER BY id LIMIT 1`)
    .get(paciente?.id ?? 0) as { id: number } | undefined;
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
    convOp = {
      id: Number(
        db
          .prepare(
            `INSERT INTO convenios (nome, tipo, ativo) VALUES ('U13 Operadora', 'operadora', 1)`,
          )
          .run().lastInsertRowid,
      ),
    };
  }

  const dataTeste = "2099-08-28";
  db.prepare(`DELETE FROM conta_pagamentos WHERE conta_id IN (
    SELECT id FROM contas_atendimento WHERE data = ?
  )`).run(dataTeste);
  db.prepare(`DELETE FROM conta_itens WHERE conta_id IN (
    SELECT id FROM contas_atendimento WHERE data = ?
  )`).run(dataTeste);
  db.prepare(`DELETE FROM contas_atendimento WHERE data = ?`).run(dataTeste);
  db.prepare(`DELETE FROM agendamentos WHERE data = ?`).run(dataTeste);

  assertThrows(
    () => assertContratoAgendamentoNovo({ tipo_atendimento: "consulta" }),
    "Não envie tipo_atendimento",
  );
  assertThrows(
    () => validarListaProcedimentos([procConsulta!.id, procAso!.id], db),
    "Não misture",
  );

  const agManha = Number(
    db
      .prepare(
        `INSERT INTO agendamentos
         (paciente_id, medico_id, data, hora, tipo_atendimento, status,
          procedimento_id, convenio_id)
         VALUES (?, ?, ?, '10:00', 'consulta', 'presente', ?, ?)`,
      )
      .run(paciente!.id, medico!.id, dataTeste, procConsulta!.id, convOp.id)
      .lastInsertRowid,
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

  const r1 = executarContaNoCheckin(agManha, 1, db);
  const r2 = executarContaNoCheckin(agTarde, 1, db);
  assert(r1.conta_id !== r2.conta_id, "dois horários, dois convênios → duas contas");
  const c1 = obterContaDetalhe(r1.conta_id, db);
  const c2 = obterContaDetalhe(r2.conta_id, db);
  assert(c1.convenio_id === convOp.id, "convênio da manhã");
  assert(c2.convenio_id === 1, "Particular na tarde");
  assert(
    c1.itens.some((i) => i.procedimento_id === procConsulta!.id),
    "item consulta na manhã",
  );

  const walkin = abrirConta(
    { paciente_id: paciente!.id, data: dataTeste, convenio_id: 1 },
    1,
    db,
  );
  assert(walkin.agendamento_id == null, "walk-in sem horário");
  assert(
    walkin.id !== c1.id && walkin.id !== c2.id,
    "walk-in + horário = contas distintas",
  );

  const dataAso = "2099-08-29";
  db.prepare(`DELETE FROM conta_itens WHERE conta_id IN (
    SELECT id FROM contas_atendimento WHERE data = ?
  )`).run(dataAso);
  db.prepare(`DELETE FROM contas_atendimento WHERE data = ?`).run(dataAso);
  db.prepare(`DELETE FROM agendamentos WHERE data = ?`).run(dataAso);
  const agAso = Number(
    db
      .prepare(
        `INSERT INTO agendamentos
         (paciente_id, medico_id, data, hora, tipo_atendimento, status,
          procedimento_id, convenio_id)
         VALUES (?, ?, ?, '09:00', 'admissional', 'presente', ?, 1)`,
      )
      .run(paciente!.id, medico!.id, dataAso, procAso!.id).lastInsertRowid,
  );
  gravarProcedimentosExtras(agAso, [procAso!.id], db);
  const rAso = executarContaNoCheckin(agAso, 1, db);
  const cAso = obterContaDetalhe(rAso.conta_id, db);
  assert(
    cAso.itens.some((i) => i.procedimento_id === procAso!.id),
    "check-in ASO cria conta + item",
  );
  assert(cAso.agendamento_id === agAso, "conta ASO do horário");

  db.prepare(
    `UPDATE agendamentos SET status = 'finalizado' WHERE id = ?`,
  ).run(agTarde);
  const contaFinalizado = obterContaDetalhe(r2.conta_id, db);
  assert(contaFinalizado.id === r2.conta_id, "API da conta 200 sem prontuário");

  const agMix = Number(
    db
      .prepare(
        `INSERT INTO agendamentos
         (paciente_id, medico_id, data, hora, tipo_atendimento, status,
          procedimento_id, convenio_id)
         VALUES (?, ?, ?, '11:00', 'consulta', 'agendado', ?, 1)`,
      )
      .run(paciente!.id, medico!.id, dataTeste, procConsulta!.id).lastInsertRowid,
  );
  gravarProcedimentosExtras(agMix, [procConsulta!.id], db);
  assertThrows(
    () =>
      db
        .prepare(
          `INSERT INTO agendamento_procedimentos
           (agendamento_id, procedimento_id, ordem, origem)
           VALUES (?, ?, 1, 'secretaria')`,
        )
        .run(agMix, procAso!.id),
    "Não misture",
  );

  if (outroPaciente) {
    assertThrows(
      () =>
        db
          .prepare(
            `INSERT INTO contas_atendimento
             (paciente_id, data, convenio_id, agendamento_id, status, created_by)
             VALUES (?, ?, ?, ?, 'em_aberto', 1)`,
          )
          .run(outroPaciente.id, dataTeste, convOp.id, agManha),
      "mesmo paciente e data",
    );
  }
  assertThrows(
    () =>
      db
        .prepare(
          `INSERT INTO contas_atendimento
           (paciente_id, data, convenio_id, agendamento_id, status, created_by)
           VALUES (?, '2099-01-01', ?, ?, 'em_aberto', 1)`,
        )
        .run(paciente!.id, convOp.id, agManha),
    "mesmo paciente e data",
  );

  const apManha = db
    .prepare(
      `SELECT id FROM agendamento_procedimentos WHERE agendamento_id = ? LIMIT 1`,
    )
    .get(agManha) as { id: number };
  assertThrows(
    () =>
      db
        .prepare(
          `INSERT INTO conta_itens
           (conta_id, procedimento_id, status, valor_centavos, quantidade,
            agendamento_procedimento_id)
           VALUES (?, ?, 'previsto', 0, 1, ?)`,
        )
        .run(walkin.id, procConsulta!.id, apManha.id),
    "mesmo horário da conta",
  );

  db.prepare(`UPDATE contas_atendimento SET convenio_id = 1 WHERE id = ?`).run(
    r1.conta_id,
  );
  const convAg = db
    .prepare(`SELECT convenio_id FROM agendamentos WHERE id = ?`)
    .get(agManha) as { convenio_id: number };
  assert(convAg.convenio_id === 1, "convênio do horário acompanha conta em_aberto");

  const agEdit = Number(
    db
      .prepare(
        `INSERT INTO agendamentos
         (paciente_id, medico_id, data, hora, tipo_atendimento, status,
          procedimento_id, convenio_id)
         VALUES (?, ?, ?, '16:00', 'consulta', 'presente', ?, 1)`,
      )
      .run(paciente!.id, medico!.id, dataTeste, procConsulta!.id).lastInsertRowid,
  );
  gravarProcedimentosExtras(agEdit, [procConsulta!.id], db);
  const checkEdit = executarContaNoCheckin(agEdit, 1, db);
  db.prepare(
    `UPDATE conta_itens SET status = 'realizado' WHERE conta_id = ?`,
  ).run(checkEdit.conta_id);
  assertThrows(
    () =>
      sincronizarProcedimentosAgendamento(
        {
          agendamentoId: agEdit,
          procedimentoIds: [procEndo!.id],
          usuarioId: 1,
        },
        db,
      ),
    "já realizado",
  );

  const dataFutura = "2099-09-15";
  db.prepare(`DELETE FROM log_whatsapp WHERE agendamento_id IN (
    SELECT id FROM agendamentos WHERE data = ?
  )`).run(dataFutura);
  db.prepare(`DELETE FROM agendamentos WHERE data = ?`).run(dataFutura);
  const agZap = Number(
    db
      .prepare(
        `INSERT INTO agendamentos
         (paciente_id, medico_id, data, hora, tipo_atendimento, status,
          procedimento_id, convenio_id, confirmacao_enviada)
         VALUES (?, ?, ?, '08:00', 'consulta', 'agendado', ?, 1, 1)`,
      )
      .run(paciente!.id, medico!.id, dataFutura, procConsulta!.id)
      .lastInsertRowid,
  );
  gravarProcedimentosExtras(agZap, [procConsulta!.id], db);
  db.prepare(
    `UPDATE procedimentos SET orientacoes_paciente = 'jejum u13' WHERE id = ?`,
  ).run(procEndo!.id);
  marcarPreparosEnviados(agZap, db);
  db.prepare(
    `INSERT INTO agendamento_procedimentos
     (agendamento_id, procedimento_id, ordem, origem, preparo_enviado)
     VALUES (?, ?, 1, 'secretaria', 0)`,
  ).run(agZap, procEndo!.id);
  const pendente = concatenarPreparosAgendamento(agZap, db, true);
  assert(pendente.includes("jejum u13"), "preparo novo pendente");
  assert(hojeIsoLocal() < dataFutura, "hoje < data do Zap extra");

  const logsAntes = (
    db
      .prepare(`SELECT COUNT(*) AS n FROM log_whatsapp WHERE agendamento_id = ?`)
      .get(agZap) as { n: number }
  ).n;
  try {
    const rFuturo = await processarPreparosPendentesAgendamento(agZap, db);
    assert(rFuturo.enviado === true, "extra enviado se WhatsApp ok");
  } catch {
    const logsDepois = (
      db
        .prepare(
          `SELECT COUNT(*) AS n FROM log_whatsapp WHERE agendamento_id = ?`,
        )
        .get(agZap) as { n: number }
    ).n;
    assert(logsDepois > logsAntes, "log_whatsapp extra se hoje < data");
  }

  db.prepare(
    `UPDATE agendamento_procedimentos SET preparo_enviado = 0
     WHERE agendamento_id = ? AND procedimento_id = ?`,
  ).run(agZap, procEndo!.id);
  const hoje = hojeIsoLocal();
  db.prepare(`UPDATE agendamentos SET data = ?, hora = '23:55' WHERE id = ?`).run(
    hoje,
    agZap,
  );
  const logsNoDia = (
    db
      .prepare(`SELECT COUNT(*) AS n FROM log_whatsapp WHERE agendamento_id = ?`)
      .get(agZap) as { n: number }
  ).n;
  const rHoje = await processarPreparosPendentesAgendamento(agZap, db);
  assert(rHoje.enviado === false, "no dia não envia extra");
  assert(rHoje.motivo === "mesmo_dia_ou_passado", "motivo mesmo dia");
  const logsDepoisDia = (
    db
      .prepare(`SELECT COUNT(*) AS n FROM log_whatsapp WHERE agendamento_id = ?`)
      .get(agZap) as { n: number }
  ).n;
  assert(logsDepoisDia === logsNoDia, "nenhum log extra no dia do atendimento");

  db.close();
  console.log("U13 aceite: todos os testes passaram.");
}

void main();
