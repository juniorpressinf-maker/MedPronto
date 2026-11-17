/**
 * Agenda Nova — datas da grade (puro, sem React). Datas 'AAAA-MM-DD' em horário local.
 * Semana começa na segunda-feira (como no iMedicina).
 */

const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const DIAS_CURTOS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const DIAS_LONGOS = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];

function data(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, m! - 1, d!, 12); // meio-dia: imune a horário de verão
}

function iso(dt: Date): string {
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

export function hojeIso(): string {
  return iso(new Date());
}

export function somarDias(d: string, n: number): string {
  const dt = data(d);
  dt.setDate(dt.getDate() + n);
  return iso(dt);
}

export function diaDaSemana(d: string): number {
  return data(d).getDay();
}

/** Segunda-feira da semana de `d`. */
export function inicioDaSemana(d: string): string {
  return somarDias(d, -((diaDaSemana(d) + 6) % 7));
}

/** Segunda a domingo. */
export function diasDaSemana(d: string): string[] {
  const seg = inicioDaSemana(d);
  return Array.from({ length: 7 }, (_, i) => somarDias(seg, i));
}

export function ehFimDeSemana(d: string): boolean {
  const w = diaDaSemana(d);
  return w === 0 || w === 6;
}

export function rotuloDia(d: string): { curto: string; longo: string; numero: number } {
  const dt = data(d);
  return { curto: DIAS_CURTOS[dt.getDay()]!, longo: DIAS_LONGOS[dt.getDay()]!, numero: dt.getDate() };
}

/** "9–15 nov 2026", "29 set – 5 out 2026", "29 dez 2025 – 4 jan 2026". */
export function rotuloPeriodo(de: string, ate: string): string {
  const a = data(de);
  const b = data(ate);
  const mA = MESES_CURTOS[a.getMonth()]!;
  const mB = MESES_CURTOS[b.getMonth()]!;
  if (a.getFullYear() !== b.getFullYear()) {
    return `${a.getDate()} ${mA} ${a.getFullYear()} – ${b.getDate()} ${mB} ${b.getFullYear()}`;
  }
  if (a.getMonth() !== b.getMonth()) return `${a.getDate()} ${mA} – ${b.getDate()} ${mB} ${b.getFullYear()}`;
  if (de === ate) return `${rotuloDia(de).longo}, ${a.getDate()} ${mA} ${a.getFullYear()}`;
  return `${a.getDate()}–${b.getDate()} ${mA} ${b.getFullYear()}`;
}

export function dataBr(d: string): string {
  const [y, m, dia] = d.split("-");
  return `${dia}/${m}/${y}`;
}

// ---------------------------------------------------------------- Mês (A5)

const MESES_LONGOS = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

export function inicioDoMes(d: string): string {
  return `${d.slice(0, 7)}-01`;
}

/** Mesmo dia em outro mês; se não existir (31/03 → fev), cai no último dia. */
export function somarMeses(d: string, n: number): string {
  const [y, m, dia] = d.split("-").map(Number);
  const alvo = new Date(y!, m! - 1 + n, 1, 12);
  const ultimo = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
  alvo.setDate(Math.min(dia!, ultimo));
  return iso(alvo);
}

/** 6 semanas (42 dias) a partir da segunda-feira da semana do dia 1º — calendário fixo. */
export function diasDaGradeMes(d: string): string[] {
  const seg = inicioDaSemana(inicioDoMes(d));
  return Array.from({ length: 42 }, (_, i) => somarDias(seg, i));
}

export function mesmoMes(a: string, b: string): boolean {
  return a.slice(0, 7) === b.slice(0, 7);
}

/** "novembro de 2026" */
export function rotuloMes(d: string): string {
  const [y, m] = d.split("-").map(Number);
  return `${MESES_LONGOS[m! - 1]} de ${y}`;
}
