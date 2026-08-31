/** Sábado, domingo e feriados nacionais (Brasil) para aviso na agenda. */

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

/** Algoritmo de Meeus/Jones/Butcher (Gregoriano) — domingo de Páscoa. */
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

const FERIADOS_FIXOS: ReadonlyArray<{ m: number; d: number; nome: string }> = [
  { m: 1, d: 1, nome: "feriado nacional (Confraternização Universal)" },
  { m: 4, d: 21, nome: "feriado nacional (Tiradentes)" },
  { m: 5, d: 1, nome: "feriado nacional (Dia do Trabalho)" },
  { m: 9, d: 7, nome: "feriado nacional (Independência)" },
  { m: 10, d: 12, nome: "feriado nacional (Nossa Senhora Aparecida)" },
  { m: 11, d: 2, nome: "feriado nacional (Finados)" },
  { m: 11, d: 15, nome: "feriado nacional (Proclamação da República)" },
  { m: 11, d: 20, nome: "feriado nacional (Consciência Negra)" },
  { m: 12, d: 25, nome: "feriado nacional (Natal)" },
];

function feriadosMoveisAno(ano: number): Map<string, string> {
  const pascoa = pascoaAno(ano);
  return new Map<string, string>([
    [isoFromDate(addDias(pascoa, -48)), "feriado (Carnaval — segunda-feira)"],
    [isoFromDate(addDias(pascoa, -47)), "feriado (Carnaval — terça-feira)"],
    [isoFromDate(addDias(pascoa, -2)), "feriado (Sexta-feira Santa)"],
    [isoFromDate(addDias(pascoa, 60)), "feriado (Corpus Christi)"],
  ]);
}

const feriadosMoveisCache = new Map<number, Map<string, string>>();

function mapaFeriadosMoveis(ano: number): Map<string, string> {
  let map = feriadosMoveisCache.get(ano);
  if (!map) {
    map = feriadosMoveisAno(ano);
    feriadosMoveisCache.set(ano, map);
  }
  return map;
}

export function isFimDeSemana(iso: string): boolean {
  const dt = new Date(`${iso.slice(0, 10)}T12:00:00`);
  const dia = dt.getDay();
  return dia === 0 || dia === 6;
}

export function nomeFeriadoBr(iso: string): string | null {
  const parts = parseIso(iso);
  if (!parts) return null;

  for (const f of FERIADOS_FIXOS) {
    if (f.m === parts.m && f.d === parts.d) return f.nome;
  }

  return mapaFeriadosMoveis(parts.y).get(iso.slice(0, 10)) ?? null;
}

/** Texto para aviso antes de agendar; null se dia útil comum. */
export function motivoDiaNaoUtil(iso: string): string | null {
  const feriado = nomeFeriadoBr(iso);
  if (feriado) return feriado;

  const dt = new Date(`${iso.slice(0, 10)}T12:00:00`);
  const dia = dt.getDay();
  if (dia === 6) return "sábado";
  if (dia === 0) return "domingo";

  return null;
}

export function isDiaNaoUtil(iso: string): boolean {
  return motivoDiaNaoUtil(iso) !== null;
}
