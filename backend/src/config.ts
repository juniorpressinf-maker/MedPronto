import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");
dotenv.config({ path: path.join(rootDir, ".env") });

/** Caminhos do .env sao relativos a raiz do projeto (nao ao cwd do Node). */
function resolveProjectPath(
  value: string | undefined,
  fallback: string,
): string {
  const chosen = value?.trim() || fallback;
  return path.isAbsolute(chosen) ? chosen : path.join(rootDir, chosen);
}

export const config = {
  rootDir,
  port: Number(process.env.PORT ?? 3021),
  host: process.env.HOST ?? "0.0.0.0",
  isProduction: process.env.NODE_ENV === "production",
  frontendDist: path.join(rootDir, "frontend", "dist"),
  /** Bloqueio de licença — ativar na fase final com ENFORCE_LICENSE=true */
  enforceLicense: process.env.ENFORCE_LICENSE === "true",
  corsOrigin:
    process.env.CORS_ORIGIN ??
    (process.env.NODE_ENV === "production"
      ? `http://127.0.0.1:${process.env.PORT ?? 3021}`
      : "http://localhost:5176"),
  dataDir: resolveProjectPath(process.env.DATA_DIR, "data"),
  dbPath: resolveProjectPath(
    process.env.DATABASE_PATH,
    path.join("data", "medpronto.db"),
  ),
  cid10Path: resolveProjectPath(
    process.env.CID10_PATH,
    path.join("backend", "data", "cid10.json"),
  ),
};
