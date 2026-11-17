/**
 * Testes que NÃO tocam o banco real: copia data/medpronto.db para %TEMP%,
 * aponta DATABASE_PATH para a cópia e apaga tudo no fim.
 *
 * IMPORTANTE: chamar prepararBancoCopia() ANTES de importar qualquer módulo de
 * ../src (config.ts lê DATABASE_PATH na importação). Use import() dinâmico.
 */
import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
export const BANCO_REAL = path.join(raiz, "data", "medpronto.db");

export async function prepararBancoCopia(prefixo: string): Promise<string> {
  if (!fs.existsSync(BANCO_REAL)) throw new Error(`Banco não encontrado: ${BANCO_REAL}`);
  const copia = path.join(os.tmpdir(), `medpronto-${prefixo}-${process.pid}-${Date.now()}.db`);
  const origem = new Database(BANCO_REAL, { readonly: true, fileMustExist: true });
  try {
    await origem.backup(copia); // API de backup: segura com WAL e com o app aberto
  } finally {
    origem.close();
  }
  process.env.DATABASE_PATH = copia;
  return copia;
}

export function removerBancoCopia(copia: string): void {
  for (const suf of ["", "-wal", "-shm"]) {
    try {
      fs.rmSync(copia + suf, { force: true });
    } catch (e) {
      console.warn(`Aviso: não consegui apagar ${copia + suf}: ${e instanceof Error ? e.message : e}`);
    }
  }
}

export function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FALHOU: ${msg}`);
}

export function assertThrows(fn: () => void, fragmento: string): void {
  try {
    fn();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    assert(msg.includes(fragmento), `erro "${msg}" não contém "${fragmento}"`);
    return;
  }
  throw new Error(`FALHOU: esperava erro contendo "${fragmento}"`);
}
