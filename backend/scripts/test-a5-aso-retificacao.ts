/**
 * Aceite A5 — retificação de ASO: folha nova, original intacto,
 * agendamento_id NULL, unicidade do horário preservada.
 * Tudo em transação + ROLLBACK (não grava na clínica).
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

function indexExists(db: Database.Database, name: string): boolean {
  const row = db
    .prepare(
      `SELECT 1 AS ok FROM sqlite_master WHERE type = 'index' AND name = ?`,
    )
    .get(name) as { ok: number } | undefined;
  return Boolean(row);
}

function main(): void {
  runMigrations();
  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");

  assert(
    indexExists(db, "idx_admissionais_agendamento_unique"),
    "índice único por horário precisa existir",
  );
  assert(
    indexExists(db, "idx_admissionais_retificacao_aberta"),
    "índice de uma retificação aberta por original precisa existir",
  );

  const paciente = db
    .prepare(`SELECT id FROM pacientes ORDER BY id LIMIT 1`)
    .get() as { id: number } | undefined;
  const medico = db
    .prepare(
      `SELECT id FROM usuarios WHERE perfil IN ('medico', 'admin') AND ativo = 1 LIMIT 1`,
    )
    .get() as { id: number } | undefined;
  assert(!!paciente && !!medico, "precisa de paciente e médico no banco");

  const antes = (
    db.prepare(`SELECT COUNT(*) AS n FROM admissionais`).get() as { n: number }
  ).n;

  const ocupado = db
    .prepare(
      `SELECT agendamento_id, paciente_id, medico_id FROM admissionais
       WHERE agendamento_id IS NOT NULL AND status != 'cancelado'
       LIMIT 1`,
    )
    .get() as
    | { agendamento_id: number; paciente_id: number; medico_id: number }
    | undefined;

  db.exec("BEGIN");
  try {
    const origId = Number(
      db
        .prepare(
          `INSERT INTO admissionais (
            paciente_id, agendamento_id, medico_id, status, conclusao,
            dados_json, retificacao_finalizada
          ) VALUES (?, NULL, ?, 'finalizado', 'apto', '{}', 0)`,
        )
        .run(paciente.id, medico.id).lastInsertRowid,
    );

    const childId = Number(
      db
        .prepare(
          `INSERT INTO admissionais (
            paciente_id, agendamento_id, medico_id, status, conclusao,
            dados_json, exame_anexo_id, retificacao_de_id, motivo_retificacao,
            retificacao_finalizada
          ) VALUES (?, NULL, ?, 'em_preenchimento', 'apto', '{}', NULL, ?, ?, 0)`,
        )
        .run(paciente.id, medico.id, origId, "CORREÇÃO DE TESTE A5").lastInsertRowid,
    );

    const orig = db
      .prepare(
        `SELECT status, agendamento_id, retificacao_de_id FROM admissionais WHERE id = ?`,
      )
      .get(origId) as {
        status: string;
        agendamento_id: number | null;
        retificacao_de_id: number | null;
      };
    const child = db
      .prepare(
        `SELECT status, agendamento_id, retificacao_de_id, retificacao_finalizada
         FROM admissionais WHERE id = ?`,
      )
      .get(childId) as {
        status: string;
        agendamento_id: number | null;
        retificacao_de_id: number | null;
        retificacao_finalizada: number;
      };

    assert(orig.status === "finalizado", "original precisa permanecer finalizado");
    assert(orig.agendamento_id == null, "original walk-in sem horário");
    assert(orig.retificacao_de_id == null, "original não é retificação");
    assert(child.agendamento_id == null, "retificação não herda horário");
    assert(child.retificacao_de_id === origId, "folha ligada ao original");
    assert(child.status === "em_preenchimento", "retificação abre editável");
    assert(!Number(child.retificacao_finalizada), "retificação ainda aberta");

    assertThrows(() => {
      db.prepare(
        `INSERT INTO admissionais (
          paciente_id, agendamento_id, medico_id, status, conclusao,
          dados_json, retificacao_de_id, motivo_retificacao, retificacao_finalizada
        ) VALUES (?, NULL, ?, 'em_preenchimento', 'apto', '{}', ?, 'SEGUNDA', 0)`,
      ).run(paciente.id, medico.id, origId);
    }, "UNIQUE");

    const agLivre = db
      .prepare(
        `SELECT a.id FROM agendamentos a
         WHERE a.paciente_id = ? AND a.medico_id = ?
           AND NOT EXISTS (
             SELECT 1 FROM admissionais ad
             WHERE ad.agendamento_id = a.id AND ad.status != 'cancelado'
           )
         LIMIT 1`,
      )
      .get(paciente.id, medico.id) as { id: number } | undefined;
    if (agLivre) {
      assertThrows(() => {
        db.prepare(
          `INSERT INTO admissionais (
            paciente_id, agendamento_id, medico_id, status, conclusao,
            dados_json, retificacao_de_id, motivo_retificacao, retificacao_finalizada
          ) VALUES (?, ?, ?, 'em_preenchimento', 'apto', '{}', ?, 'COM HORARIO', 0)`,
        ).run(paciente.id, agLivre.id, medico.id, origId);
      }, "Retificação de ASO inconsistente");
    }

    if (ocupado) {
      assertThrows(() => {
        db.prepare(
          `INSERT INTO admissionais (
            paciente_id, agendamento_id, medico_id, status, conclusao, dados_json
          ) VALUES (?, ?, ?, 'em_preenchimento', 'apto', '{}')`,
        ).run(ocupado.paciente_id, ocupado.agendamento_id, ocupado.medico_id);
      }, "UNIQUE");
    }

    db.exec("ROLLBACK");
  } catch (e) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* já revertido */
    }
    db.close();
    throw e;
  }

  const depois = (
    db.prepare(`SELECT COUNT(*) AS n FROM admissionais`).get() as { n: number }
  ).n;
  assert(antes === depois, "ROLLBACK precisa não deixar ASO de teste");
  db.close();
  console.log("A5 retificação ASO: ok");
}

main();
