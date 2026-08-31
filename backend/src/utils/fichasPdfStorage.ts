import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";

export const FICHA_PDF_MAX_BYTES = 15 * 1024 * 1024;

export function dirFichaPdf(fichaId: number): string {
  return path.join(config.dataDir, "uploads", "fichas", String(fichaId));
}

export function relPathFichaPdf(fichaId: number): string {
  return path.join("uploads", "fichas", String(fichaId), "referencia.pdf");
}

export function absPathFichaPdf(fichaId: number): string {
  return path.join(config.dataDir, relPathFichaPdf(fichaId));
}

export function garantirDirFichaPdf(fichaId: number): string {
  const dir = dirFichaPdf(fichaId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function resolveFichaPdfPath(
  rel: string | null | undefined,
  fichaId: number,
): string | null {
  if (!rel?.trim()) return null;
  const abs = path.isAbsolute(rel)
    ? rel
    : path.resolve(config.dataDir, rel);
  const base = path.resolve(dirFichaPdf(fichaId));
  if (!abs.startsWith(base)) return null;
  return abs;
}

export function pdfPermitido(nome: string, mime: string): boolean {
  const lower = nome.toLowerCase();
  if (lower.endsWith(".pdf")) return true;
  return mime === "application/pdf";
}
