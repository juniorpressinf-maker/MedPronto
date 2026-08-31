/**
 * Zera a base para cliente novo: remove medpronto.db e recria schema.
 * Uso: node scripts/zerar-base.mjs
 * Rode parar.bat antes.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = process.env.DATA_DIR ?? path.join(root, "data");
const dbPath = process.env.DATABASE_PATH ?? path.join(dataDir, "medpronto.db");
const uploadsDir = path.join(dataDir, "uploads");

function rmIfExists(p) {
  if (fs.existsSync(p)) {
    fs.rmSync(p, { force: true });
    console.log("  removido:", p);
  }
}

function rmDirIfExists(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
    console.log("  removido:", dir);
  }
}

function npmCmd() {
  const portable = path.join(root, "node", "npm.cmd");
  if (process.platform === "win32" && fs.existsSync(portable)) return portable;
  if (process.platform === "win32") return "npm.cmd";
  const portableSh = path.join(root, "node", "bin", "npm");
  if (fs.existsSync(portableSh)) return portableSh;
  return "npm";
}

console.log("Zerando base do MedPronto (cliente novo)...\n");

for (const ext of ["", "-wal", "-shm"]) {
  rmIfExists(dbPath + ext);
}

rmDirIfExists(uploadsDir);
rmDirIfExists(path.join(root, "data_restore_pending"));

fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(uploadsDir, { recursive: true });

console.log("\nRecriando schema...");
const env = {
  ...process.env,
  DATABASE_PATH: dbPath,
  DATA_DIR: dataDir,
};
const nodeDir =
  process.platform === "win32"
    ? path.join(root, "node")
    : path.join(root, "node", "bin");
const pathEnv = fs.existsSync(nodeDir)
  ? `${nodeDir}${path.delimiter}${env.PATH ?? ""}`
  : env.PATH;

const r = spawnSync(npmCmd(), ["run", "db:migrate"], {
  cwd: root,
  stdio: "inherit",
  env: { ...env, PATH: pathEnv },
  shell: process.platform === "win32",
});

if (r.status !== 0) {
  console.error("\nErro ao rodar migracoes.");
  process.exit(r.status ?? 1);
}

console.log("\nPronto. Abra o MedPronto e siga o assistente inicial (admin + clínica).");
console.log("Banco:", dbPath);
