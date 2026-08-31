/**
 * Aceite S1 — ZIP de restore sem zip-slip; usuarios.ativo no request.
 */
import AdmZip from "adm-zip";
import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runMigrations } from "../src/db/migrate.js";
import { usuarioEstaAtivo } from "../src/auth/users.js";
import {
  assertEntradaZipSegura,
  assertEntradasZipSeguras,
  inspecionarBackup,
} from "../src/utils/backup.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(__dirname, "../../data/medpronto.db");

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`FALHOU: ${msg}`);
}

function assertThrows(fn: () => void, ...fragments: string[]): void {
  try {
    fn();
    throw new Error(`FALHOU: esperava erro contendo "${fragments.join("|")}"`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.startsWith("FALHOU:")) throw e;
    assert(
      fragments.some((f) => msg.includes(f)),
      `erro "${msg}" não contém ${fragments.join(" | ")}`,
    );
  }
}

function zipCom(entries: Record<string, string>, dest: string): void {
  const zip = new AdmZip();
  for (const [nome, corpo] of Object.entries(entries)) {
    zip.addFile(nome, Buffer.from(corpo));
  }
  zip.writeZip(dest);
}

function main(): void {
  runMigrations();

  assertThrows(() => assertEntradaZipSegura("../evil.txt"), "não permitido");
  assertThrows(
    () => assertEntradaZipSegura("uploads/../../etc/passwd"),
    "não permitido",
  );
  assertThrows(() => assertEntradaZipSegura("C:/Windows/win.ini"), "não permitido");
  assertThrows(() => assertEntradaZipSegura("/etc/passwd"), "não permitido");
  assertThrows(
    () => assertEntradasZipSeguras(["medpronto.db", "malware.exe"]),
    "inesperado",
  );
  assertEntradaZipSegura("medpronto.db");
  assertEntradaZipSegura("uploads/laudo.pdf");
  assertEntradaZipSegura("auth/secret.key");
  assertEntradasZipSeguras([
    "medpronto.db",
    "__medpronto_backup__.json",
    "uploads/a.pdf",
  ]);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "medpronto-s1-"));
  try {
    const okZip = path.join(dir, "ok.zip");
    zipCom({ "medpronto.db": "sqlite-fake" }, okZip);
    const info = inspecionarBackup(okZip);
    assert(info.entries.includes("medpronto.db"), "ZIP válido tem o banco");

    const slipZip = path.join(dir, "slip.zip");
    zipCom(
      { "medpronto.db": "sqlite-fake", "../evil.txt": "pwned" },
      slipZip,
    );
    assertThrows(
      () => inspecionarBackup(slipZip),
      "não permitido",
      "inesperado",
    );

    const nestedSlip = path.join(dir, "nested.zip");
    zipCom(
      {
        "medpronto.db": "sqlite-fake",
        "uploads/../../outside.txt": "pwned",
      },
      nestedSlip,
    );
    assertThrows(
      () => inspecionarBackup(nestedSlip),
      "não permitido",
      "inesperado",
    );

    const extraZip = path.join(dir, "extra.zip");
    zipCom(
      { "medpronto.db": "sqlite-fake", "script.vbs": "msgbox" },
      extraZip,
    );
    assertThrows(() => inspecionarBackup(extraZip), "inesperado");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  assert(!usuarioEstaAtivo(0), "id 0 inativo");
  assert(!usuarioEstaAtivo(-1), "id negativo inativo");

  const db = new Database(dbPath, { readonly: true });
  const ativo = db
    .prepare(`SELECT id FROM usuarios WHERE ativo = 1 ORDER BY id LIMIT 1`)
    .get() as { id: number } | undefined;
  db.close();
  assert(!!ativo, "precisa de um usuário ativo no banco");
  assert(usuarioEstaAtivo(ativo!.id), "usuário ativo do banco precisa passar");

  console.log("S1 ZIP restore + usuario.ativo: ok");
}

main();
