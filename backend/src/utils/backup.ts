import AdmZip from "adm-zip";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";

const projectRoot = path.dirname(config.dataDir);
const DATA_DIR = config.dataDir;
const TMP_DIR = path.join(DATA_DIR, "tmp");
const BACKUPS_DIR = path.join(DATA_DIR, "backups");
export const RESTORE_PENDING = path.join(projectRoot, "data_restore_pending");

const LEGACY_DATA_DIR = path.join(projectRoot, "backend", "data");

const MARKER_FILE = "__medpronto_backup__.json";
const MARKER_VERSION = 1;
const DB_NAME = "medpronto.db";

export const RESTORE_EXIT_CODE = 42;

export const MSG_ZIP_CAMINHO_INVALIDO =
  "Backup inválido: caminho de arquivo não permitido.";
export const MSG_ZIP_ENTRADA_INESPERADA =
  "Backup inválido: arquivo inesperado no ZIP.";

function normalizarEntradaZip(entryName: string): string {
  return String(entryName ?? "").replace(/\\/g, "/");
}

/** Rejeita zip-slip: `..`, caminho absoluto, null byte. */
export function assertEntradaZipSegura(entryName: string): void {
  const nome = normalizarEntradaZip(entryName);
  if (!nome || nome.includes("\0")) {
    throw new Error(MSG_ZIP_CAMINHO_INVALIDO);
  }
  if (
    path.isAbsolute(nome) ||
    path.win32.isAbsolute(nome) ||
    nome.startsWith("/") ||
    /^[a-zA-Z]:/.test(nome)
  ) {
    throw new Error(MSG_ZIP_CAMINHO_INVALIDO);
  }
  const partes = nome.split("/");
  if (partes.some((p) => p === "..")) {
    throw new Error(MSG_ZIP_CAMINHO_INVALIDO);
  }
}

function entradaZipEsperada(entryName: string): boolean {
  const nome = normalizarEntradaZip(entryName).replace(/\/+$/, "");
  if (!nome) return false;
  if (nome === MARKER_FILE || nome === DB_NAME) return true;
  if (nome === "uploads" || nome.startsWith("uploads/")) return true;
  if (nome === "auth" || nome.startsWith("auth/")) return true;
  return false;
}

export function assertEntradasZipSeguras(entries: string[]): void {
  for (const e of entries) {
    assertEntradaZipSegura(e);
    if (!entradaZipEsperada(e)) {
      throw new Error(MSG_ZIP_ENTRADA_INESPERADA);
    }
  }
}

function destinoDentroDaRaiz(root: string, entryName: string): string {
  const dest = path.resolve(root, normalizarEntradaZip(entryName));
  const rel = path.relative(root, dest);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(MSG_ZIP_CAMINHO_INVALIDO);
  }
  return dest;
}

function extrairZipSeguro(zip: AdmZip, destRoot: string): void {
  const root = path.resolve(destRoot);
  fs.mkdirSync(root, { recursive: true });
  for (const entry of zip.getEntries()) {
    const nome = normalizarEntradaZip(entry.entryName);
    assertEntradaZipSegura(nome);
    if (!entradaZipEsperada(nome)) {
      throw new Error(MSG_ZIP_ENTRADA_INESPERADA);
    }
    const ehDir =
      Boolean((entry as { isDirectory?: boolean }).isDirectory) ||
      nome.endsWith("/");
    if (ehDir) {
      fs.mkdirSync(destinoDentroDaRaiz(root, nome), { recursive: true });
      continue;
    }
    const destFile = destinoDentroDaRaiz(root, nome);
    fs.mkdirSync(path.dirname(destFile), { recursive: true });
    fs.writeFileSync(destFile, entry.getData());
  }
}

fs.mkdirSync(TMP_DIR, { recursive: true });
fs.mkdirSync(BACKUPS_DIR, { recursive: true });

function addFolderSafe(zip: AdmZip, localPath: string, zipPrefix: string) {
  function walk(dir: string, prefix: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(full, rel);
      } else if (entry.isFile()) {
        try {
          zip.addFile(rel, fs.readFileSync(full));
        } catch {
          /* ignore */
        }
      }
    }
  }
  walk(localPath, zipPrefix);
}

export async function criarBackup(opts: { incluirUploads?: boolean } = {}) {
  const incluirUploads = opts.incluirUploads !== false;
  const stamp = new Date()
    .toISOString()
    .replace(/[:T]/g, "-")
    .replace(/\..+$/, "");
  const nome = `medpronto-backup-${stamp}.zip`;
  const zipPath = path.join(BACKUPS_DIR, nome);
  const dbCopyPath = path.join(TMP_DIR, `medpronto-${Date.now()}.db`);

  const { getDb } = await import("../db/index.js");
  const db = getDb();
  await db.backup(dbCopyPath);

  const conteudo: string[] = [];

  try {
    const zip = new AdmZip();

    zip.addFile(
      MARKER_FILE,
      Buffer.from(
        JSON.stringify(
          {
            version: MARKER_VERSION,
            app: "medpronto",
            criado_em: new Date().toISOString(),
            inclui: { uploads: incluirUploads },
          },
          null,
          2,
        ),
      ),
    );

    zip.addLocalFile(dbCopyPath, "", DB_NAME);
    conteudo.push(DB_NAME);

    if (incluirUploads) {
      const uploadsDir = path.join(DATA_DIR, "uploads");
      if (fs.existsSync(uploadsDir) && fs.readdirSync(uploadsDir).length > 0) {
        addFolderSafe(zip, uploadsDir, "uploads");
        conteudo.push("uploads/");
      }
    }

    const authDir = path.join(DATA_DIR, "auth");
    if (fs.existsSync(authDir) && fs.readdirSync(authDir).length > 0) {
      addFolderSafe(zip, authDir, "auth");
      conteudo.push("auth/");
    }

    zip.writeZip(zipPath);
  } finally {
    try {
      fs.unlinkSync(dbCopyPath);
    } catch {
      /* ignore */
    }
  }

  const tamanho = fs.statSync(zipPath).size;
  return { path: zipPath, nome, tamanho, conteudo };
}

export function inspecionarBackup(zipPath: string) {
  if (!fs.existsSync(zipPath)) {
    throw new Error("Arquivo de backup não encontrado.");
  }
  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries().map((e) => e.entryName);
  assertEntradasZipSeguras(entries);

  if (!entries.includes(DB_NAME)) {
    throw new Error(`Backup inválido: não contém ${DB_NAME}.`);
  }

  let marker: Record<string, unknown> | null = null;
  if (entries.includes(MARKER_FILE)) {
    try {
      marker = JSON.parse(zip.readAsText(MARKER_FILE)) as Record<string, unknown>;
    } catch {
      marker = null;
    }
  }

  const temUploads = entries.some((e) => e.startsWith("uploads/"));
  return { marker, temUploads, entries };
}

export function agendarRestauracao(zipPath: string) {
  const info = inspecionarBackup(zipPath);

  if (fs.existsSync(RESTORE_PENDING)) {
    fs.rmSync(RESTORE_PENDING, { recursive: true, force: true });
  }
  fs.mkdirSync(RESTORE_PENDING, { recursive: true });

  const zip = new AdmZip(zipPath);
  extrairZipSeguro(zip, RESTORE_PENDING);

  return {
    conteudo: [DB_NAME, info.temUploads ? "uploads/" : null].filter(Boolean) as string[],
    pendingDir: RESTORE_PENDING,
  };
}

export const ULTIMA_RESTAURACAO_FILE = path.join(DATA_DIR, "ULTIMA_RESTAURACAO.txt");

export function getUltimaRestauracao(): string | null {
  try {
    if (!fs.existsSync(ULTIMA_RESTAURACAO_FILE)) return null;
    const text = fs.readFileSync(ULTIMA_RESTAURACAO_FILE, "utf8");
    const line = text.split(/\r?\n/).find((l) => l.startsWith("Restauracao aplicada em "));
    return line?.replace("Restauracao aplicada em ", "").trim() ?? null;
  } catch {
    return null;
  }
}

export function finalizarDbRestaurado() {
  const dbPath = path.join(DATA_DIR, DB_NAME);
  limparWalDb();
  const db = new Database(dbPath);
  try {
    db.pragma("foreign_keys = ON");
    const check = db.pragma("integrity_check", { simple: true }) as string;
    if (check !== "ok") {
      throw new Error(`Banco restaurado corrompido: ${check}`);
    }
    db.prepare("DELETE FROM sessoes_secret").run();
  } finally {
    db.close();
  }
  limparWalDb();
}

export function aplicarRestauracaoPendente() {
  if (!fs.existsSync(RESTORE_PENDING)) return false;

  const pendingDb = path.join(RESTORE_PENDING, DB_NAME);
  if (!fs.existsSync(pendingDb)) {
    fs.rmSync(RESTORE_PENDING, { recursive: true, force: true });
    throw new Error(`Restauracao invalida: backup sem ${DB_NAME}`);
  }

  const stamp = new Date()
    .toISOString()
    .replace(/[:T]/g, "-")
    .replace(/\..+$/, "");
  const safety = path.join(projectRoot, `data_pre_restore_${stamp}`);

  if (fs.existsSync(DATA_DIR)) {
    try {
      fs.cpSync(DATA_DIR, safety, { recursive: true, errorOnExist: false });
    } catch (err) {
      console.warn(
        "[restore] backup de seguranca incompleto (continuando):",
        err instanceof Error ? err.message : err,
      );
    }

    for (const entry of fs.readdirSync(DATA_DIR)) {
      if (entry === "medpronto.log") continue;
      const p = path.join(DATA_DIR, entry);
      try {
        fs.rmSync(p, { recursive: true, force: true });
      } catch (e) {
        console.warn(
          `[restore] nao removeu ${entry} (em uso):`,
          e instanceof Error ? e.message : e,
        );
      }
    }
  } else {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  try {
    fs.cpSync(RESTORE_PENDING, DATA_DIR, { recursive: true });
    fs.rmSync(RESTORE_PENDING, { recursive: true, force: true });
  } catch (err) {
    console.error(
      "[restore] falhou ao copiar pending->data:",
      err instanceof Error ? err.message : err,
    );
    throw err;
  }

  fs.mkdirSync(path.join(DATA_DIR, "uploads"), { recursive: true });
  fs.mkdirSync(TMP_DIR, { recursive: true });
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });

  const aplicadaEm = new Date().toISOString();
  fs.writeFileSync(
    ULTIMA_RESTAURACAO_FILE,
    `Restauracao aplicada em ${aplicadaEm}\n` +
      `Copia anterior em: ${safety}\n` +
      `Voce pode apagar essa pasta apos confirmar que esta tudo certo.\n`,
  );

  finalizarDbRestaurado();

  console.log(`[restore] restauracao aplicada. backup de seguranca em: ${safety}`);
  return true;
}

function sleepMs(ms: number) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    /* aguarda lock no Windows */
  }
}

function limparWalDb() {
  const dbPath = path.join(DATA_DIR, DB_NAME);
  for (let i = 0; i < 8; i++) {
    let pending = false;
    for (const extra of ["-wal", "-shm"]) {
      try {
        fs.unlinkSync(dbPath + extra);
      } catch {
        pending = true;
      }
    }
    if (!pending) break;
    sleepMs(200);
  }
}

export function corrigirRestauracaoLegada() {
  const markerLegado = path.join(LEGACY_DATA_DIR, "ULTIMA_RESTAURACAO.txt");
  if (!fs.existsSync(markerLegado)) return false;

  const srcDb = path.join(LEGACY_DATA_DIR, DB_NAME);
  if (!fs.existsSync(srcDb)) return false;

  fs.mkdirSync(DATA_DIR, { recursive: true });
  limparWalDb();
  fs.cpSync(srcDb, path.join(DATA_DIR, DB_NAME));

  const srcUploads = path.join(LEGACY_DATA_DIR, "uploads");
  if (fs.existsSync(srcUploads)) {
    fs.cpSync(srcUploads, path.join(DATA_DIR, "uploads"), {
      recursive: true,
      errorOnExist: false,
    });
  }

  fs.cpSync(markerLegado, path.join(DATA_DIR, "ULTIMA_RESTAURACAO.txt"));
  console.log("[restore] corrigida copia legada de backend/data para data/");
  return true;
}

export function listarBackupsLocais(limit = 20) {
  if (!fs.existsSync(BACKUPS_DIR)) return [];
  return fs
    .readdirSync(BACKUPS_DIR)
    .filter((f) => f.endsWith(".zip"))
    .map((nome) => {
      const p = path.join(BACKUPS_DIR, nome);
      const st = fs.statSync(p);
      return {
        nome,
        tamanho: st.size,
        criado_em: st.mtime.toISOString(),
      };
    })
    .sort((a, b) => b.criado_em.localeCompare(a.criado_em))
    .slice(0, limit);
}
