/**
 * Feriados nacionais (Brasil) com nome — espelho de backend/src/lib/diasUteis.ts.
 * Puro, sem React. Datas 'AAAA-MM-DD'.
 */

const FIXOS: ReadonlyArray<{ m: number; d: number; nome: string }> = [
  { m: 1, d: 1, nome: "Confraternização Universal" },
  { m: 4, d: 21, nome: "Tiradentes" },
  { m: 5, d: 1, nome: "Dia do Trabalho" },
  { m: 9, d: 7, nome: "Independência" },
  { m: 10, d: 12, nome: "N. Sra. Aparecida" },
  { m: 11, d: 2, nome: "Finados" },
  { m: 11, d: 15, nome: "Proclamação da República" },
  { m: 11, d: 20, nome: "Consciência Negra" },
  { m: 12, d: 25, nome: "Natal" },
];

function iso(dt: Date): string {
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function pascoa(ano: number): Date {
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
  return new Date(ano, mes - 1, dia, 12);
}

const moveisCache = new Map<number, Map<string, string>>();

function moveis(ano: number): Map<string, string> {
  let mapa = moveisCache.get(ano);
  if (!mapa) {
    const p = pascoa(ano);
    const mais = (n: number) => {
      const dt = new Date(p);
      dt.setDate(dt.getDate() + n);
      return iso(dt);
    };
    mapa = new Map([
      [mais(-48), "Carnaval"],
      [mais(-47), "Carnaval"],
      [mais(-2), "Sexta-feira Santa"],
      [mais(60), "Corpus Christi"],
    ]);
    moveisCache.set(ano, mapa);
  }
  return mapa;
}

/** Nome do feriado nacional na data, ou null. */
export function nomeFeriado(d: string): string | null {
  const [y, m, dia] = d.split("-").map(Number);
  if (!y || !m || !dia) return null;
  const fixo = FIXOS.find((f) => f.m === m && f.d === dia);
  if (fixo) return fixo.nome;
  return moveis(y).get(d.slice(0, 10)) ?? null;
}
