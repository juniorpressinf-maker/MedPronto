/**
 * Aceite M10′ — faturamento detalhado por convênio.
 */
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import { runMigrations } from "../src/db/migrate.js";
import {
  abrirConta,
  adicionarItemConta,
  obterContaDetalhe,
} from "../src/services/cobrancaContas.js";
import { fecharConta } from "../src/services/cobrancaPagamentos.js";
import { salvarGuiaConvenio } from "../src/services/cobrancaContas.js";
import { obterFaturamentoConvenio } from "../src/services/cobrancaFaturamentoConvenio.js";

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
  const proc = db
    .prepare(`SELECT id FROM procedimentos WHERE ativo = 1 ORDER BY id LIMIT 1`)
    .get() as { id: number } | undefined;
  let conv = db
    .prepare(`SELECT id, nome FROM convenios WHERE tipo = 'operadora' AND ativo = 1 LIMIT 1`)
    .get() as { id: number; nome: string } | undefined;
  if (!conv) {
    const ins = db
      .prepare(`INSERT INTO convenios (nome, tipo, ativo) VALUES ('Teste Op M10p', 'operadora', 1)`)
      .run();
    conv = { id: Number(ins.lastInsertRowid), nome: "Teste Op M10p" };
  }
  assert(!!paciente && !!proc && !!conv, "precisa paciente, proc e operadora");

  const dataTeste = "2099-09-01";
  db.prepare(`DELETE FROM conta_convenio_guia WHERE conta_id IN (
    SELECT id FROM contas_atendimento WHERE data = ?
  )`).run(dataTeste);
  db.prepare(`DELETE FROM conta_itens WHERE conta_id IN (
    SELECT id FROM contas_atendimento WHERE data = ?
  )`).run(dataTeste);
  db.prepare(`DELETE FROM contas_atendimento WHERE data = ?`).run(dataTeste);

  const conta = abrirConta(
    { paciente_id: paciente!.id, data: dataTeste, convenio_id: conv!.id },
    1,
    db,
  );
  adicionarItemConta(
    conta.id,
    { procedimento_id: proc!.id, status: "previsto" },
    1,
    db,
  );
  salvarGuiaConvenio(
    conta.id,
    { numero_guia: "GUIA-999", senha: "ABC" },
    db,
  );
  fecharConta(conta.id, { modo: "convenio" }, 1, db);

  const todos = obterFaturamentoConvenio(dataTeste, dataTeste, null, db);
  assert(todos.qtd_contas >= 1, "lista contas operadora");
  assert(
    todos.grupos.some((g) => g.convenio_id === conv!.id && g.contas.length >= 1),
    "agrupa por convênio",
  );
  const c0 = todos.grupos.find((g) => g.convenio_id === conv!.id)?.contas[0];
  assert(c0?.numero_guia === "GUIA-999", "inclui guia");
  assert(c0?.itens.length >= 1, "inclui itens");

  const filtrado = obterFaturamentoConvenio(dataTeste, dataTeste, conv!.id, db);
  assert(filtrado.convenio_id === conv!.id, "filtro por convênio");
  assert(filtrado.grupos.length === 1, "um grupo no filtro");

  let rejeitouParticular = false;
  try {
    obterFaturamentoConvenio(dataTeste, dataTeste, 1, db);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/operadora/i.test(msg)) rejeitouParticular = true;
    else throw e;
  }
  assert(rejeitouParticular, "rejeita filtro particular");

  db.close();
  console.log("M10′ aceite: todos os testes passaram.");
}

main();
