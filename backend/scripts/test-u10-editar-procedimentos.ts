/**
 * Aceite U10 — secretária inclui/remove procedimentos depois do agendar;
 * lista do horário e conta em_aberto ficam iguais; realizado não sai.
 */
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import { runMigrations } from "../src/db/migrate.js";
import { sincronizarProcedimentosAgendamento } from "../src/services/agendamentoAtendimento.js";
import { executarContaNoCheckin } from "../src/services/cobrancaCheckin.js";
import { obterContaDetalhe } from "../src/services/cobrancaContas.js";

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

  const dataTeste = "2099-08-26";
  db.prepare(`DELETE FROM conta_itens WHERE conta_id IN (
    SELECT id FROM contas_atendimento WHERE data = ?
  )`).run(dataTeste);
  db.prepare(`DELETE FROM contas_atendimento WHERE data = ?`).run(dataTeste);
  db.prepare(`DELETE FROM agendamentos WHERE data = ?`).run(dataTeste);

  const agId = Number(
    db
      .prepare(
        `INSERT INTO agendamentos
         (paciente_id, medico_id, data, hora, tipo_atendimento, status,
          procedimento_id, convenio_id, confirmacao_enviada)
         VALUES (?, ?, ?, '09:00', 'consulta', 'agendado', ?, 1, 1)`,
      )
      .run(paciente!.id, medico!.id, dataTeste, procConsulta!.id).lastInsertRowid,
  );

  db.prepare(
    `UPDATE procedimentos SET orientacoes_paciente = 'jejum 8h' WHERE id = ?`,
  ).run(procEndo!.id);

  const add = sincronizarProcedimentosAgendamento(
    {
      agendamentoId: agId,
      procedimentoIds: [procConsulta!.id, procEndo!.id],
      usuarioId: 1,
      origemNovos: "secretaria",
    },
    db,
  );
  assert(add.tipo === "consulta", "continua consulta");
  const nnDepoisAdd = db
    .prepare(
      `SELECT procedimento_id FROM agendamento_procedimentos
       WHERE agendamento_id = ? ORDER BY ordem`,
    )
    .all(agId) as { procedimento_id: number }[];
  assert(nnDepoisAdd.length === 2, "N:N com consulta + exame");
  const flag = db
    .prepare(
      `SELECT whatsapp_preparo_pendente FROM agendamentos WHERE id = ?`,
    )
    .get(agId) as { whatsapp_preparo_pendente: number };
  assert(flag.whatsapp_preparo_pendente === 1, "prepara segundo Zap (hoje < data)");

  db.prepare(`UPDATE agendamentos SET status = 'presente' WHERE id = ?`).run(
    agId,
  );
  const check = executarContaNoCheckin(agId, 1, db);
  const conta = obterContaDetalhe(check.conta_id, db);
  assert(
    conta.itens.filter((i) => i.status === "previsto").length === 2,
    "conta com os dois previstos",
  );

  sincronizarProcedimentosAgendamento(
    {
      agendamentoId: agId,
      procedimentoIds: [procConsulta!.id],
      usuarioId: 1,
    },
    db,
  );
  const contaAposRemover = obterContaDetalhe(check.conta_id, db);
  const endo = contaAposRemover.itens.find(
    (i) => i.procedimento_id === procEndo!.id,
  );
  assert(endo?.status === "cancelado", "remover previsto cancela o item");
  const nnApos = db
    .prepare(
      `SELECT COUNT(*) AS n FROM agendamento_procedimentos WHERE agendamento_id = ?`,
    )
    .get(agId) as { n: number };
  assert(nnApos.n === 1, "exame saiu do horário");

  sincronizarProcedimentosAgendamento(
    {
      agendamentoId: agId,
      procedimentoIds: [procConsulta!.id, procEndo!.id],
      usuarioId: 1,
    },
    db,
  );
  const itemConsulta = obterContaDetalhe(check.conta_id, db).itens.find(
    (i) => i.procedimento_id === procConsulta!.id && i.status !== "cancelado",
  );
  assert(!!itemConsulta, "item consulta ativo");
  db.prepare(`UPDATE conta_itens SET status = 'realizado' WHERE id = ?`).run(
    itemConsulta!.id,
  );
  assertThrows(
    () =>
      sincronizarProcedimentosAgendamento(
        {
          agendamentoId: agId,
          procedimentoIds: [procEndo!.id],
          usuarioId: 1,
        },
        db,
      ),
    "já realizado",
  );

  db.prepare(
    `UPDATE contas_atendimento SET status = 'pago', fechada_em = datetime('now')
     WHERE id = ?`,
  ).run(check.conta_id);
  assertThrows(
    () =>
      sincronizarProcedimentosAgendamento(
        {
          agendamentoId: agId,
          procedimentoIds: [procConsulta!.id, procEndo!.id],
          usuarioId: 1,
        },
        db,
      ),
    "Reabra a conta",
  );

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
  assertThrows(
    () =>
      sincronizarProcedimentosAgendamento(
        {
          agendamentoId: agMix,
          procedimentoIds: [procConsulta!.id, procAso!.id],
          usuarioId: 1,
        },
        db,
      ),
    "Não misture",
  );

  db.close();
  console.log("U10 aceite: todos os testes passaram.");
}

main();
