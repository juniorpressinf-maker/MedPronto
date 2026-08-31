/**
 * Aceite U5 — contrato de agendamento: procedimentos + convênio; sem tipo no body.
 */
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import { runMigrations } from "../src/db/migrate.js";
import {
  assertContratoAgendamentoNovo,
  derivarTipoAtendimento,
  gravarProcedimentosExtras,
  listarProcedimentosDoAgendamento,
  validarListaProcedimentos,
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

  assertThrows(
    () => assertContratoAgendamentoNovo({ tipo_atendimento: "consulta" }),
    "Não envie tipo_atendimento",
  );
  assertThrows(
    () => assertContratoAgendamentoNovo({ procedimento_id: 1 }),
    "procedimento_ids",
  );

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
  const procEndo = db
    .prepare(
      `SELECT id FROM procedimentos WHERE nome = 'Endoscopia' AND ativo = 1`,
    )
    .get() as { id: number } | undefined;
  assert(!!procConsulta && !!procAso && !!procEndo, "seed de procedimentos");

  const soAso = validarListaProcedimentos([procAso.id], db);
  assert(derivarTipoAtendimento(soAso) === "admissional", "ASO deriva admissional");

  assertThrows(
    () => validarListaProcedimentos([procConsulta.id, procAso.id], db),
    "Não misture",
  );

  const paciente = db
    .prepare(`SELECT id FROM pacientes ORDER BY id LIMIT 1`)
    .get() as { id: number } | undefined;
  const medico = db
    .prepare(
      `SELECT id FROM usuarios WHERE perfil = 'medico' AND ativo = 1 LIMIT 1`,
    )
    .get() as { id: number } | undefined;
  assert(!!paciente && !!medico, "precisa paciente e médico");

  const dataTeste = "2099-08-23";
  db.prepare(`DELETE FROM agendamentos WHERE data = ?`).run(dataTeste);

  const agId = Number(
    db
      .prepare(
        `INSERT INTO agendamentos
         (paciente_id, medico_id, data, hora, tipo_atendimento, status,
          procedimento_id, convenio_id)
         VALUES (?, ?, ?, '15:00', 'consulta', 'agendado', ?, 1)`,
      )
      .run(paciente!.id, medico!.id, dataTeste, procConsulta!.id).lastInsertRowid,
  );
  gravarProcedimentosExtras(agId, [procConsulta!.id, procEndo!.id], db);
  const lista = listarProcedimentosDoAgendamento(agId, db);
  assert(lista.length === 2, "consulta + exame no mesmo horário");
  assert(lista[0]?.id === procConsulta!.id, "ordem: consulta primeiro");
  assert(lista[1]?.id === procEndo!.id, "ordem: exame segundo");

  db.close();
  console.log("U5 aceite: todos os testes passaram.");
}

main();
