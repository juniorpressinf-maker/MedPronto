// Projeto Agenda Nova — A7: regressão de TODOS os testes de aceite do backend,
// cada um numa CÓPIA NOVA de data/medpronto.db (o banco real nunca é tocado).
//
// Uso (a partir de d:\MedPronto, com o Node portátil no PATH):
//   node scripts/test-a7-regressao.mjs            -> todos (exceto os de fora)
//   node scripts/test-a7-regressao.mjs u6 c1      -> só esses
//
// Lê a lista de "test:*" de backend/package.json. Código de saída 0 = todos passaram.

import { spawnSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const bancoReal = path.join(raiz, "data", "medpronto.db");
const tsx = path.join(raiz, "node_modules", "tsx", "dist", "cli.mjs");

/** Fora da regressão: mexe em arquivos de backup (.zip), não no banco. */
const FORA = new Set(["s1"]);

const pkg = JSON.parse(readFileSync(path.join(raiz, "backend", "package.json"), "utf8"));
const todos = Object.entries(pkg.scripts)
  .filter(([nome, cmd]) => nome.startsWith("test:") && /^tsx scripts\//.test(cmd))
  .map(([nome, cmd]) => ({ id: nome.slice(5), arquivo: cmd.replace(/^tsx /, "") }));

const pedidos = process.argv.slice(2);
const lista = pedidos.length
  ? todos.filter((t) => pedidos.includes(t.id))
  : todos.filter((t) => !FORA.has(t.id));
if (pedidos.length && lista.length !== pedidos.length) {
  const conhecidos = new Set(todos.map((t) => t.id));
  console.error(`Teste desconhecido: ${pedidos.filter((p) => !conhecidos.has(p)).join(", ")}`);
  process.exit(2);
}

async function copiarBanco(id) {
  const destino = path.join(os.tmpdir(), `medpronto-a7-${id}-${process.pid}-${Date.now()}.db`);
  const origem = new Database(bancoReal, { readonly: true, fileMustExist: true });
  try {
    await origem.backup(destino); // seguro com WAL e com o MedPronto aberto
  } finally {
    origem.close();
  }
  return destino;
}

function apagar(arquivo) {
  for (const suf of ["", "-wal", "-shm"]) {
    try {
      rmSync(arquivo + suf, { force: true });
    } catch {
      /* arquivo preso: o Windows limpa o %TEMP% depois */
    }
  }
}

const resultados = [];
for (const t of lista) {
  const copia = await copiarBanco(t.id);
  const inicio = Date.now();
  const r = spawnSync(process.execPath, [tsx, t.arquivo], {
    cwd: path.join(raiz, "backend"),
    env: { ...process.env, DATABASE_PATH: copia },
    encoding: "utf8",
    timeout: 5 * 60_000,
  });
  apagar(copia);
  const ok = r.status === 0;
  const saida = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim().split(/\r?\n/).filter((l) => !/injected env|dotenvx/.test(l));
  resultados.push({ ...t, ok, segundos: ((Date.now() - inicio) / 1000).toFixed(1), saida });
  console.log(`${ok ? "OK    " : "FALHOU"} ${t.id.padEnd(18)} ${resultados.at(-1).segundos}s  ${ok ? (saida.at(-1) ?? "") : ""}`);
  if (!ok) for (const l of saida.slice(-12)) console.log(`         │ ${l}`);
}

const falhas = resultados.filter((r) => !r.ok);
console.log(`\n${resultados.length - falhas.length}/${resultados.length} passaram${falhas.length ? ` — falharam: ${falhas.map((f) => f.id).join(", ")}` : ""}.`);
console.log("Banco real não foi tocado (cada teste rodou numa cópia, apagada em seguida).");
process.exitCode = falhas.length ? 1 : 0;
