/**
 * Aceite AM0 — destino separado, default por destino, travas SQL.
 * Transação + ROLLBACK (não grava na clínica).
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

function main(): void {
  runMigrations();
  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");

  const destCol = db
    .prepare(`PRAGMA table_info(fichas_template)`)
    .all() as { name: string }[];
  assert(
    destCol.some((c) => c.name === "destino"),
    "coluna destino em fichas_template",
  );

  const defConsulta = db
    .prepare(
      `SELECT id FROM fichas_template
       WHERE eh_default = 1 AND medico_id IS NULL AND destino = 'prontuario'`,
    )
    .get() as { id: number } | undefined;
  const defAso = db
    .prepare(
      `SELECT id FROM fichas_template
       WHERE eh_default = 1 AND medico_id IS NULL AND destino = 'aso'`,
    )
    .get() as { id: number } | undefined;
  assert(!!defConsulta, "default consulta (prontuario)");
  assert(!!defAso, "seed ASO — padrão clínica");
  assert(defConsulta!.id !== defAso!.id, "defaults de destinos diferentes");

  const asoNaListaProntuario = db
    .prepare(
      `SELECT COUNT(*) AS n FROM fichas_template
       WHERE destino = 'aso' AND destino = 'prontuario'`,
    )
    .get() as { n: number };
  assert(asoNaListaProntuario.n === 0, "nenhum template nos dois destinos");

  const paciente = db
    .prepare(`SELECT id FROM pacientes ORDER BY id LIMIT 1`)
    .get() as { id: number } | undefined;
  const medico = db
    .prepare(
      `SELECT id FROM usuarios WHERE perfil IN ('medico', 'admin') AND ativo = 1 LIMIT 1`,
    )
    .get() as { id: number } | undefined;
  assert(!!paciente && !!medico, "precisa de paciente e médico");

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
  assert(!!procConsulta && !!procAso, "seed de procedimentos");

  const antesAg = (
    db.prepare(`SELECT COUNT(*) AS n FROM agendamentos`).get() as { n: number }
  ).n;
  const antesTpl = (
    db.prepare(`SELECT COUNT(*) AS n FROM fichas_template`).get() as { n: number }
  ).n;

  db.exec("BEGIN");
  try {
    db.prepare(
      `UPDATE fichas_template SET eh_default = 0
       WHERE medico_id IS NULL AND eh_default = 1 AND destino = 'aso'`,
    ).run();
    db.prepare(`UPDATE fichas_template SET eh_default = 1 WHERE id = ?`).run(
      defAso!.id,
    );
    const consultaDepois = db
      .prepare(
        `SELECT id FROM fichas_template
         WHERE eh_default = 1 AND medico_id IS NULL AND destino = 'prontuario'`,
      )
      .get() as { id: number };
    assert(
      consultaDepois.id === defConsulta!.id,
      "marcar padrão ASO não pode zerar default da consulta",
    );

    assertThrows(() => {
      db.prepare(
        `INSERT INTO agendamentos (
          paciente_id, medico_id, data, hora, tipo_atendimento, status,
          procedimento_id, convenio_id, aso_template_id
        ) VALUES (?, ?, '2099-12-31', '23:51', 'consulta', 'agendado', ?, 1, ?)`,
      ).run(paciente!.id, medico!.id, procConsulta!.id, defAso!.id);
    }, "Modelo ASO inconsistente");

    assertThrows(() => {
      db.prepare(
        `INSERT INTO agendamentos (
          paciente_id, medico_id, data, hora, tipo_atendimento, status,
          procedimento_id, convenio_id, ficha_template_id
        ) VALUES (?, ?, '2099-12-31', '23:52', 'admissional', 'agendado', ?, 1, ?)`,
      ).run(paciente!.id, medico!.id, procAso!.id, defConsulta!.id);
    }, "Ficha clínica inconsistente");

    assertThrows(() => {
      db.prepare(
        `INSERT INTO agendamentos (
          paciente_id, medico_id, data, hora, tipo_atendimento, status,
          procedimento_id, convenio_id, aso_template_id
        ) VALUES (?, ?, '2099-12-31', '23:53', 'admissional', 'agendado', ?, 1, ?)`,
      ).run(paciente!.id, medico!.id, procAso!.id, defConsulta!.id);
    }, "Modelo ASO inconsistente");

    const agOk = Number(
      db
        .prepare(
          `INSERT INTO agendamentos (
            paciente_id, medico_id, data, hora, tipo_atendimento, status,
            procedimento_id, convenio_id, aso_template_id
          ) VALUES (?, ?, '2099-12-31', '23:54', 'admissional', 'agendado', ?, 1, ?)`,
        )
        .run(paciente!.id, medico!.id, procAso!.id, defAso!.id).lastInsertRowid,
    );
    assert(agOk > 0, "ASO com modelo aso deve gravar");

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

  const depoisAg = (
    db.prepare(`SELECT COUNT(*) AS n FROM agendamentos`).get() as { n: number }
  ).n;
  const depoisTpl = (
    db.prepare(`SELECT COUNT(*) AS n FROM fichas_template`).get() as { n: number }
  ).n;
  assert(antesAg === depoisAg, "ROLLBACK não pode deixar horário de teste");
  assert(antesTpl === depoisTpl, "ROLLBACK não pode deixar template de teste");

  const consultaFinal = db
    .prepare(
      `SELECT id FROM fichas_template
       WHERE eh_default = 1 AND medico_id IS NULL AND destino = 'prontuario'`,
    )
    .get() as { id: number };
  assert(
    consultaFinal.id === defConsulta!.id,
    "default consulta intacto após o teste",
  );

  db.close();
  console.log("AM0 modelos ASO: ok");
}

main();
