import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";

export const EXAMES_MAX_BYTES = 15 * 1024 * 1024;

export const EXAMES_EXT = [".pdf", ".jpg", ".jpeg", ".png", ".webp"] as const;

export function examesPacienteDir(pacienteId: number): string {
  return path.join(config.dataDir, "uploads", "exames", String(pacienteId));
}

export function sanitizeExameFileName(name: string): string {
  const base = path.basename(name).replace(/[^a-zA-Z0-9._-]/g, "_");
  return base.slice(0, 80) || "arquivo";
}

/** Nome do paciente no arquivo — ASCII, sem acentos, legível na pasta. */
export function sanitizePacienteSlug(nome: string, maxLen = 36): string {
  const s = nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLen);
  return s || "PACIENTE";
}

/** Tipo do exame a partir da descrição ou do nome original. */
export function sanitizeTipoSlug(
  descricao: string | null | undefined,
  originalStem: string,
  maxLen = 32,
): string {
  const raw = (descricao?.trim() || originalStem).slice(0, maxLen);
  const s = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLen);
  return s || "EXAME";
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Nome do arquivo no disco — sempre único pelo id no prefixo.
 *
 * Padrão: `{id}_{PACIENTE}_{AAAAMMDD-HHmm}_{TIPO}_{arquivo-original.ext}`
 *
 * Ex.: dois hemogramas no mesmo dia:
 *   44_MARIA-SANTOS_20250627-1430_HEMOGRAMA_hemograma.pdf
 *   45_MARIA-SANTOS_20250627-1615_HEMOGRAMA-CONTROLE_hemograma.pdf
 */
export function buildExameFileName(opts: {
  id: number;
  pacienteNome: string;
  descricao: string | null;
  originalName: string;
  dataUpload?: Date;
}): string {
  const ext = path.extname(opts.originalName).toLowerCase();
  const extOk = (EXAMES_EXT as readonly string[]).includes(ext) ? ext : ".pdf";
  const stem = path.basename(opts.originalName, path.extname(opts.originalName));
  const paciente = sanitizePacienteSlug(opts.pacienteNome);
  const d = opts.dataUpload ?? new Date();
  const stamp = `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}`;
  const tipo = sanitizeTipoSlug(opts.descricao, stem);
  const original = sanitizeExameFileName(stem + extOk);

  const composed = `${opts.id}_${paciente}_${stamp}_${tipo}_${original}`;
  if (composed.length <= 200) return composed;

  const maxOriginal = Math.max(12, 200 - composed.length + original.length);
  const originalCurto = sanitizeExameFileName(
    stem.slice(0, maxOriginal - extOk.length) + extOk,
  );
  return `${opts.id}_${paciente}_${stamp}_${tipo}_${originalCurto}`;
}

/** Remove só o prefixo numérico `{id}_` para exibição. */
export function nomeExameParaExibicao(arquivoPath: string): string {
  const base = path.basename(arquivoPath);
  const m = /^(\d+)_(.+)$/.exec(base);
  return m ? m[2] : base;
}

export function extensaoPermitida(name: string): boolean {
  const ext = path.extname(name).toLowerCase();
  return (EXAMES_EXT as readonly string[]).includes(ext);
}

export function mimePermitido(mime: string): boolean {
  const ok = new Set([
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
  ]);
  return ok.has(mime.toLowerCase());
}

/** Caminho relativo a dataDir gravado no banco. */
export function relPathExame(pacienteId: number, fileName: string): string {
  return path.join("uploads", "exames", String(pacienteId), fileName);
}

export function resolveExamePath(relativePath: string): string | null {
  const abs = path.resolve(config.dataDir, relativePath);
  const base = path.resolve(config.dataDir, "uploads", "exames");
  if (!abs.startsWith(base + path.sep) && abs !== base) return null;
  return abs;
}

/** Garante que o arquivo no disco está na pasta do paciente informado. */
export function resolveExamePathForPaciente(
  relativePath: string,
  pacienteId: number,
): string | null {
  const abs = resolveExamePath(relativePath);
  if (!abs) return null;
  const dirPaciente = path.resolve(examesPacienteDir(pacienteId));
  if (!abs.startsWith(dirPaciente + path.sep)) return null;
  return abs;
}

export function garantirDirExames(pacienteId: number): string {
  const dir = examesPacienteDir(pacienteId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function contentTypeExame(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}
