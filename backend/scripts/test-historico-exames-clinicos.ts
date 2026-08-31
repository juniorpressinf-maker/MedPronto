/**
 * Histórico clínico de exames: só horário só-exame finalizado;
 * consulta+exame no mesmo slot NÃO gera linha de exame; anexo M7 opcional.
 * Transação + ROLLBACK.
 */
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import { runMigrations } from "../src/db/migrate.js";
import { horarioSoExame } from "../src/services/agendamentoAtendimento.js";
import { listarHistoricoExamesClinicos } from "../src/services/historicoClinicoExames.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(__dirname, "../../data/medpronto.db");

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`FALHOU: ${msg}`);
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
      `SELECT id FROM usuarios WHERE perfil IN ('medico', 'admin') AND ativo = 1 LIMIT 1`,
    )
    .get() as { id: number } | undefined;
  const procConsulta = db
    .prepare(
      `SELECT id FROM procedimentos WHERE modo_clinico = 'prontuario' AND ativo = 1 LIMIT 1`,
    )
    .get() as { id: number } | undefined;
  const procExame = db
    .prepare(
      `SELECT id, nome FROM procedimentos WHERE modo_clinico = 'nenhum' AND ativo = 1 LIMIT 1`,
    )
    .get() as { id: number; nome: string } | undefined;
  assert(
    !!paciente && !!medico && !!procConsulta && !!procExame,
    "precisa paciente, médico, consulta e exame",
  );

  db.prepare(
    `DELETE FROM agendamento_procedimentos WHERE agendamento_id IN (
       SELECT id FROM agendamentos WHERE data = '2099-11-30'
         AND hora IN ('22:10', '22:11', '22:12')
     )`,
  ).run();
  db.prepare(
    `DELETE FROM agendamentos WHERE data = '2099-11-30' AND hora IN ('22:10', '22:11', '22:12')`,
  ).run();

  db.exec("BEGIN");
  try {
    /** Trigger 034 cria a linha N:N a partir de procedimento_id. */
    const insAg = (
      hora: string,
      tipo: string,
      procId: number,
      status: string,
    ): number =>
      Number(
        db
          .prepare(
            `INSERT INTO agendamentos
             (paciente_id, medico_id, data, hora, tipo_atendimento, status,
              procedimento_id, convenio_id)
             VALUES (?, ?, '2099-11-30', ?, ?, ?, ?, 1)`,
          )
          .run(paciente!.id, medico!.id, hora, tipo, status, procId)
          .lastInsertRowid,
      );

    const soExameFinalizado = insAg("22:10", "exame", procExame!.id, "finalizado");
    const soExamePresente = insAg("22:11", "exame", procExame!.id, "presente");
    const consultaComExame = insAg(
      "22:12",
      "consulta",
      procConsulta!.id,
      "finalizado",
    );
    db.prepare(
      `INSERT INTO agendamento_procedimentos (agendamento_id, procedimento_id, ordem)
       VALUES (?, ?, 1)`,
    ).run(consultaComExame, procExame!.id);

    assert(horarioSoExame(soExameFinalizado, db), "22:10 é só-exame");
    assert(horarioSoExame(soExamePresente, db), "22:11 é só-exame");
    assert(!horarioSoExame(consultaComExame, db), "consulta+exame não é só-exame");

    const lista = listarHistoricoExamesClinicos(paciente!.id, {}, db);
    const ids = new Set(lista.map((i) => i.agendamento_id));

    assert(ids.has(soExameFinalizado), "só-exame finalizado entra no histórico");
    assert(!ids.has(soExamePresente), "só-exame presente NÃO entra");
    assert(!ids.has(consultaComExame), "exame no slot de consulta NÃO vira linha própria");

    const item = lista.find((i) => i.agendamento_id === soExameFinalizado)!;
    assert(item.anexos.length === 0, "sem PDF → anexos vazios");
    assert(
      item.procedimentos.some((p) => p.id === procExame!.id),
      "procedimento do horário presente",
    );

    const filtradoMedico = listarHistoricoExamesClinicos(
      paciente!.id,
      { medicoId: medico!.id },
      db,
    );
    assert(
      filtradoMedico.some((i) => i.agendamento_id === soExameFinalizado),
      "filtro por médico do horário",
    );
    const outroMedico = listarHistoricoExamesClinicos(
      paciente!.id,
      { medicoId: medico!.id + 999999 },
      db,
    );
    assert(
      !outroMedico.some((i) => i.agendamento_id === soExameFinalizado),
      "outro médico não vê o episódio",
    );

    console.log("OK test-historico-exames-clinicos");
  } finally {
    db.exec("ROLLBACK");
    db.close();
  }
}

main();
