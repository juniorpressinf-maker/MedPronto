/**
 * Aceite M8′ — vínculo admissional ↔ item de cobrança.
 */
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import { runMigrations } from "../src/db/migrate.js";
import {
  abrirConta,
  adicionarItemConta,
  atualizarItemConta,
  listarAdmissionaisSugeridosConta,
  obterContaDetalhe,
} from "../src/services/cobrancaContas.js";

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
    .prepare(`SELECT id FROM usuarios WHERE perfil = 'medico' AND ativo = 1 LIMIT 1`)
    .get() as { id: number } | undefined;
  const procAdm = db
    .prepare(`SELECT id FROM procedimentos WHERE nome = 'Admissional' AND ativo = 1`)
    .get() as { id: number } | undefined;
  assert(!!paciente && !!medico && !!procAdm, "precisa paciente, médico e procedimento Admissional");

  const dataTeste = "2099-06-15";
  db.prepare(`DELETE FROM conta_itens WHERE conta_id IN (
    SELECT id FROM contas_atendimento WHERE data = ?
  )`).run(dataTeste);
  db.prepare(`DELETE FROM contas_atendimento WHERE data = ?`).run(dataTeste);
  db.prepare(`DELETE FROM admissionais WHERE substr(created_at, 1, 10) = ?`).run(dataTeste);

  const insAdm = db
    .prepare(
      `INSERT INTO admissionais (paciente_id, medico_id, status, conclusao, dados_json, created_at, finalizado_em)
       VALUES (?, ?, 'finalizado', 'apto', '{}', ?, ?)`,
    )
    .run(paciente!.id, medico!.id, `${dataTeste} 10:00:00`, `${dataTeste} 11:00:00`);
  const admissionalId = Number(insAdm.lastInsertRowid);

  const conta = abrirConta(
    { paciente_id: paciente!.id, data: dataTeste, convenio_id: 1 },
    1,
    db,
  );
  adicionarItemConta(
    conta.id,
    { procedimento_id: procAdm!.id, status: "previsto" },
    1,
    db,
  );
  const itemId = obterContaDetalhe(conta.id, db).itens[0]?.id;
  assert(!!itemId, "item Admissional criado");

  const sugeridos = listarAdmissionaisSugeridosConta(conta.id, itemId, db);
  assert(sugeridos.some((s) => s.id === admissionalId && s.elegivel), "sugere admissional do dia");

  atualizarItemConta(conta.id, itemId!, { admissional_id: admissionalId }, db);
  const item = obterContaDetalhe(conta.id, db).itens[0];
  assert(item?.admissional_id === admissionalId, "vinculado ao item");
  assert(item?.admissional_conclusao === "apto", "metadados do admissional");

  let duplicou = false;
  const conta2 = abrirConta(
    { paciente_id: paciente!.id, data: "2099-06-16", convenio_id: 1 },
    1,
    db,
  );
  adicionarItemConta(
    conta2.id,
    { procedimento_id: procAdm!.id, status: "previsto" },
    1,
    db,
  );
  const item2Id = obterContaDetalhe(conta2.id, db).itens[0]?.id;
  try {
    atualizarItemConta(conta2.id, item2Id!, { admissional_id: admissionalId }, db);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/já vinculado/i.test(msg)) duplicou = true;
    else throw e;
  }
  assert(duplicou, "impede admissional em dois itens");

  db.close();
  console.log("M8′ aceite: todos os testes passaram.");
}

main();
