/**
 * Aceite C5 — conta_itens congelados se a conta não está em_aberto.
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

  const trig = db
    .prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'trigger' AND name = 'trg_conta_item_conta_aberta_ins'`,
    )
    .get() as { name: string } | undefined;
  assert(!!trig, "trigger 045 trg_conta_item_conta_aberta_ins");

  const paciente = db
    .prepare(`SELECT id FROM pacientes ORDER BY id LIMIT 1`)
    .get() as { id: number } | undefined;
  const proc = db
    .prepare(`SELECT id FROM procedimentos WHERE ativo = 1 LIMIT 1`)
    .get() as { id: number } | undefined;
  assert(!!paciente && !!proc, "precisa paciente e procedimento");

  const antesContas = (
    db.prepare(`SELECT COUNT(*) AS n FROM contas_atendimento`).get() as {
      n: number;
    }
  ).n;
  const antesItens = (
    db.prepare(`SELECT COUNT(*) AS n FROM conta_itens`).get() as { n: number }
  ).n;

  db.exec("BEGIN");
  try {
    const contaId = Number(
      db
        .prepare(
          `INSERT INTO contas_atendimento (paciente_id, data, convenio_id, status)
           VALUES (?, '2099-12-30', 1, 'em_aberto')`,
        )
        .run(paciente!.id).lastInsertRowid,
    );

    const itemId = Number(
      db
        .prepare(
          `INSERT INTO conta_itens
           (conta_id, procedimento_id, status, valor_centavos, quantidade)
           VALUES (?, ?, 'previsto', 100, 1)`,
        )
        .run(contaId, proc!.id).lastInsertRowid,
    );
    assert(itemId > 0, "item em conta aberta deve gravar");

    db.prepare(
      `UPDATE conta_itens SET observacao = 'ok' WHERE id = ?`,
    ).run(itemId);

    db.prepare(
      `UPDATE contas_atendimento
       SET status = 'pago', fechada_em = datetime('now') WHERE id = ?`,
    ).run(contaId);

    assertThrows(() => {
      db.prepare(
        `INSERT INTO conta_itens
         (conta_id, procedimento_id, status, valor_centavos, quantidade)
         VALUES (?, ?, 'previsto', 0, 1)`,
      ).run(contaId, proc!.id);
    }, "não está em aberto");

    assertThrows(() => {
      db.prepare(`UPDATE conta_itens SET observacao = 'x' WHERE id = ?`).run(
        itemId,
      );
    }, "não está em aberto");

    assertThrows(() => {
      db.prepare(`DELETE FROM conta_itens WHERE id = ?`).run(itemId);
    }, "não está em aberto");

    db.prepare(
      `UPDATE contas_atendimento
       SET status = 'em_aberto', fechada_em = NULL WHERE id = ?`,
    ).run(contaId);

    db.prepare(`UPDATE conta_itens SET observacao = 'reaberta' WHERE id = ?`).run(
      itemId,
    );
    const obs = db
      .prepare(`SELECT observacao FROM conta_itens WHERE id = ?`)
      .get(itemId) as { observacao: string };
    assert(obs.observacao === "reaberta", "item volta a editar após reabrir");

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

  const depoisContas = (
    db.prepare(`SELECT COUNT(*) AS n FROM contas_atendimento`).get() as {
      n: number;
    }
  ).n;
  const depoisItens = (
    db.prepare(`SELECT COUNT(*) AS n FROM conta_itens`).get() as { n: number }
  ).n;
  assert(antesContas === depoisContas, "ROLLBACK não pode deixar conta de teste");
  assert(antesItens === depoisItens, "ROLLBACK não pode deixar item de teste");

  db.close();
  console.log("C5 conta_itens em conta fechada: ok");
}

main();
