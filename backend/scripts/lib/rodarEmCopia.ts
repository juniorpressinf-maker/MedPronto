/**
 * Executor dos testes de aceite numa CÓPIA do banco.
 *
 *   tsx scripts/lib/rodarEmCopia.ts scripts/test-u13-integridade.ts [outros...]
 *
 * Para CADA teste: copia data/medpronto.db (API de backup, segura com o app aberto),
 * roda o teste num processo separado com DATABASE_PATH apontando para a cópia e
 * apaga a cópia no fim. Uma cópia por teste: um teste não suja o outro.
 * Com vários testes, mostra um resumo e sai com erro se algum falhar.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prepararBancoCopia, removerBancoCopia } from "./bancoCopia.js";

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

async function main(): Promise<void> {
  // --todos: todos os scripts/test-*.ts (o cmd.exe do Windows não expande curingas).
  const testes = process.argv.includes("--todos")
    ? fs
        .readdirSync(path.join(backendDir, "scripts"))
        .filter((f) => /^test-.*\.ts$/.test(f))
        .sort()
        .map((f) => path.join("scripts", f))
    : process.argv.slice(2);
  if (!testes.length) {
    console.error("Uso: tsx scripts/lib/rodarEmCopia.ts scripts/test-xxx.ts [...]");
    process.exit(2);
  }

  const resultado: { teste: string; ok: boolean }[] = [];
  for (const teste of testes) {
    const nome = path.basename(teste, ".ts");
    const copia = await prepararBancoCopia(nome.replace(/^test-/, ""));
    try {
      if (testes.length > 1) console.log(`\n=== ${nome}`);
      const r = spawnSync(process.execPath, ["--import", "tsx", teste], {
        cwd: backendDir,
        stdio: "inherit",
        env: { ...process.env, DATABASE_PATH: copia },
      });
      resultado.push({ teste: nome, ok: r.status === 0 });
    } finally {
      removerBancoCopia(copia);
    }
  }

  if (testes.length > 1) {
    console.log("\n=== Resumo");
    for (const r of resultado) console.log(`${r.ok ? "OK    " : "FALHOU"}  ${r.teste}`);
    const falhas = resultado.filter((r) => !r.ok).length;
    console.log(`${resultado.length - falhas}/${resultado.length} passaram.`);
  }
  if (resultado.some((r) => !r.ok)) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
