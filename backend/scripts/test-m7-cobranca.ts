/**
 * Aceite M7 — anexo de exame no item de cobrança.
 */
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import { runMigrations } from "../src/db/migrate.js";
import {
  abrirConta,
  adicionarItemConta,
  atualizarItemConta,
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
  const eletro = db
    .prepare(`SELECT id FROM procedimentos WHERE nome = 'Eletro' AND ativo = 1`)
    .get() as { id: number } | undefined;
  assert(!!paciente && !!eletro, "precisa paciente e Eletro");

  const dataTeste = "2099-05-01";
  db.prepare(`DELETE FROM conta_itens WHERE conta_id IN (
    SELECT id FROM contas_atendimento WHERE data = ?
  )`).run(dataTeste);
  db.prepare(`DELETE FROM conta_pagamentos WHERE conta_id IN (
    SELECT id FROM contas_atendimento WHERE data = ?
  )`).run(dataTeste);
  db.prepare(`DELETE FROM conta_convenio_guia WHERE conta_id IN (
    SELECT id FROM contas_atendimento WHERE data = ?
  )`).run(dataTeste);
  db.prepare(`DELETE FROM contas_atendimento WHERE data = ?`).run(dataTeste);

  const conta = abrirConta(
    { paciente_id: paciente!.id, data: dataTeste, convenio_id: 1 },
    1,
    db,
  );
  adicionarItemConta(
    conta.id,
    { procedimento_id: eletro!.id, status: "realizado" },
    1,
    db,
  );
  const itemId = obterContaDetalhe(conta.id, db).itens[0]?.id;
  assert(!!itemId, "item criado");

  const insEx = db
    .prepare(
      `INSERT INTO exames_anexos
       (paciente_id, paciente_nome, prontuario_id, descricao, arquivo_path, uploaded_by)
       VALUES (?, (SELECT nome FROM pacientes WHERE id = ?), NULL, ?, ?, 1)`,
    )
    .run(
      paciente!.id,
      paciente!.id,
      "ELETRO TESTE M7",
      `${paciente!.id}/teste-m7.pdf`,
    );
  const exameId = Number(insEx.lastInsertRowid);

  atualizarItemConta(conta.id, itemId!, { exame_anexo_id: exameId }, db);
  const detalhe = obterContaDetalhe(conta.id, db);
  const item = detalhe.itens.find((i) => i.id === itemId);
  assert(item?.exame_anexo_id === exameId, "exame vinculado ao item");
  assert(item?.exame_nome === "ELETRO TESTE M7", "nome do exame na conta");

  let rejeitouOutroPaciente = false;
  const outroPac = db
    .prepare(`SELECT id FROM pacientes WHERE id != ? LIMIT 1`)
    .get(paciente!.id) as { id: number } | undefined;
  if (outroPac) {
    const outroEx = db
      .prepare(
        `INSERT INTO exames_anexos
         (paciente_id, paciente_nome, prontuario_id, descricao, arquivo_path, uploaded_by)
         VALUES (?, (SELECT nome FROM pacientes WHERE id = ?), NULL, 'OUTRO', 'x.pdf', 1)`,
      )
      .run(outroPac.id, outroPac.id);
    const outroExId = Number(outroEx.lastInsertRowid);
    try {
      atualizarItemConta(
        conta.id,
        itemId!,
        { exame_anexo_id: outroExId },
        db,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/inconsistente|Exame anexo/i.test(msg)) rejeitouOutroPaciente = true;
      else throw e;
    } finally {
      db.prepare(`DELETE FROM exames_anexos WHERE id = ?`).run(outroExId);
    }
  }
  assert(rejeitouOutroPaciente, "rejeita exame de outro paciente");

  db.prepare(`DELETE FROM exames_anexos WHERE id = ?`).run(exameId);
  db.close();
  console.log("M7 aceite: todos os testes passaram.");
}

main();
