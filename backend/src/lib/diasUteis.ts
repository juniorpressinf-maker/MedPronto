/** Sábado, domingo e feriados nacionais (Brasil) — espelho de frontend/lib/diasEspeciais.ts */

function parseIso(iso: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.slice(0, 10));
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return { y, m: mo, d };
}

function isoFromParts(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function isoFromDate(dt: Date): string {
  return isoFromParts(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
}

function parseIsoLocal(iso: string): Date {
  const p = parseIso(iso);
  if (!p) return new Date(NaN);
  return new Date(p.y, p.m - 1, p.d, 12, 0, 0, 0);
}

function pascoaAno(ano: number): Date {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(ano, mes - 1, dia, 12, 0, 0, 0);
}

function addDias(base: Date, dias: number): Date {
  const dt = new Date(base);
  dt.setDate(dt.getDate() + dias);
  return dt;
}

const FERIADOS_FIXOS: ReadonlyArray<{ m: number; d: number }> = [
  { m: 1, d: 1 },
  { m: 4, d: 21 },
  { m: 5, d: 1 },
  { m: 9, d: 7 },
  { m: 10, d: 12 },
  { m: 11, d: 2 },
  { m: 11, d: 15 },
  { m: 11, d: 20 },
  { m: 12, d: 25 },
];

const feriadosMoveisCache = new Map<number, Set<string>>();

function feriadosMoveisAno(ano: number): Set<string> {
  let set = feriadosMoveisCache.get(ano);
  if (!set) {
    const pascoa = pascoaAno(ano);
    set = new Set([
      isoFromDate(addDias(pascoa, -48)),
      isoFromDate(addDias(pascoa, -47)),
      isoFromDate(addDias(pascoa, -2)),
      isoFromDate(addDias(pascoa, 60)),
    ]);
    feriadosMoveisCache.set(ano, set);
  }
  return set;
}

export function isFimDeSemana(iso: string): boolean {
  const dia = parseIsoLocal(iso).getDay();
  return dia === 0 || dia === 6;
}

export function isFeriadoBr(iso: string): boolean {
  const parts = parseIso(iso);
  if (!parts) return false;
  for (const f of FERIADOS_FIXOS) {
    if (f.m === parts.m && f.d === parts.d) return true;
  }
  return feriadosMoveisAno(parts.y).has(iso.slice(0, 10));
}

export function isDiaNaoUtil(iso: string): boolean {
  return isFimDeSemana(iso) || isFeriadoBr(iso);
}

/** Último dia útil imediatamente antes da data (ex.: consulta segunda → disparo sexta). */
export function diaUtilAnterior(dataConsulta: string): string {
  const dt = parseIsoLocal(dataConsulta);
  dt.setDate(dt.getDate() - 1);
  while (isDiaNaoUtil(isoFromDate(dt))) {
    dt.setDate(dt.getDate() - 1);
  }
  return isoFromDate(dt);
}

export function calcularDiaDisparoConfirmacao(dataConsulta: string): string {
  return diaUtilAnterior(dataConsulta);
}

export function addDiasIso(iso: string, dias: number): string {
  const dt = parseIsoLocal(iso);
  dt.setDate(dt.getDate() + dias);
  return isoFromDate(dt);
}

export function hojeIsoLocal(): string {
  const d = new Date();
  return isoFromParts(d.getFullYear(), d.getMonth() + 1, d.getDate());
}
