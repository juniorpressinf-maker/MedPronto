/**
 * Agenda Nova — utilitários puros de hora e data (sem banco).
 *
 * Convenções (iguais às da migração 046):
 *   - data: 'AAAA-MM-DD'
 *   - hora: 'HH:MM' de 00:00 a 23:59; fim de intervalo pode ser '24:00'
 *   - dia_semana: 0 = domingo … 6 = sábado
 */

const RE_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const RE_HORA_FIM = /^(([01]\d|2[0-3]):[0-5]\d|24:00)$/;
const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;

export const MINUTOS_DIA = 24 * 60;

export function horaValida(h: string): boolean {
  return RE_HORA.test(h);
}

export function horaFimValida(h: string): boolean {
  return RE_HORA_FIM.test(h);
}

/** Data ISO existente no calendário (rejeita 2026-02-31). */
export function dataValida(d: string): boolean {
  if (!RE_DATA.test(d)) return false;
  const [y, m, dia] = d.split("-").map(Number);
  const dt = new Date(y!, m! - 1, dia!);
  return dt.getFullYear() === y && dt.getMonth() === m! - 1 && dt.getDate() === dia;
}

export function horaParaMinutos(h: string): number {
  const [hh, mm] = h.split(":").map(Number);
  return hh! * 60 + mm!;
}

export function minutosParaHora(min: number): string {
  if (!Number.isInteger(min) || min < 0 || min > MINUTOS_DIA) {
    throw new RangeError(`Minutos fora do dia: ${min}`);
  }
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

/** Fim do horário (pode ser '24:00'); null se passar da meia-noite. */
export function horaFim(hora: string, duracaoMinutos: number): string | null {
  const fim = horaParaMinutos(hora) + duracaoMinutos;
  return fim > MINUTOS_DIA ? null : minutosParaHora(fim);
}

/** Intervalos semiabertos [a1, a2) e [b1, b2) se cruzam? (encostar não conta) */
export function intervalosSeCruzam(a1: number, a2: number, b1: number, b2: number): boolean {
  return a1 < b2 && b1 < a2;
}

function dataLocal(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, m! - 1, d!, 12, 0, 0); // meio-dia: imune a horário de verão
}

function isoDe(dt: Date): string {
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

export function diaSemana(iso: string): number {
  return dataLocal(iso).getDay();
}

export function somarDias(iso: string, dias: number): string {
  const dt = dataLocal(iso);
  dt.setDate(dt.getDate() + dias);
  return isoDe(dt);
}

/** Datas de `de` a `ate`, inclusive. */
export function listarDatas(de: string, ate: string): string[] {
  const out: string[] = [];
  for (let d = de; d <= ate; d = somarDias(d, 1)) out.push(d);
  return out;
}

/** Quantidade de dias de `de` a `ate`, inclusive (0 se ate < de). */
export function diasNoPeriodo(de: string, ate: string): number {
  if (ate < de) return 0;
  return Math.round((dataLocal(ate).getTime() - dataLocal(de).getTime()) / 86_400_000) + 1;
}

export function agoraLocal(): { data: string; minutos: number } {
  const d = new Date();
  return { data: isoDe(d), minutos: d.getHours() * 60 + d.getMinutes() };
}
