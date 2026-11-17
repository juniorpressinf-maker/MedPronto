/**
 * Agenda Nova — geometria da grade (puro, sem React).
 *
 * - posição vertical em minutos desde o início da faixa;
 * - cards que se sobrepõem no mesmo dia ficam LADO A LADO (estilo Google Agenda):
 *   agrupa em "blocos" de sobreposição transitiva e distribui em colunas.
 * - horários vagos = grade do horário padrão − agendados ativos − bloqueios − passado.
 */
import { horaParaMinutos } from "./horario";

export type IntervaloMin = { ini: number; fim: number };

export type ItemPosicionado<T> = {
  item: T;
  /** minutos desde o início da faixa */
  topo: number;
  altura: number;
  /** coluna dentro do bloco (0..colunas-1) */
  coluna: number;
  colunas: number;
};

const ALTURA_MINIMA_MIN = 15;

/** Semiaberto: encostar (10:00–10:30 e 10:30–11:00) não sobrepõe. */
export function cruzam(a: IntervaloMin, b: IntervaloMin): boolean {
  return a.ini < b.fim && b.ini < a.fim;
}

/**
 * Posiciona itens de UM dia. `intervalo(item)` devolve minutos absolutos do dia.
 * Itens são recortados na faixa; altura mínima garante card clicável.
 */
export function posicionarDia<T>(
  itens: T[],
  intervalo: (item: T) => IntervaloMin,
  faixa: IntervaloMin,
): ItemPosicionado<T>[] {
  const ordenados = itens
    .map((item) => {
      const r = intervalo(item);
      const ini = Math.max(r.ini, faixa.ini);
      const fim = Math.max(ini + ALTURA_MINIMA_MIN, Math.min(r.fim, faixa.fim));
      return { item, ini, fim };
    })
    .sort((a, b) => a.ini - b.ini || b.fim - a.fim);

  const saida: ItemPosicionado<T>[] = [];
  let bloco: { item: T; ini: number; fim: number; coluna: number }[] = [];
  let fimBloco = -Infinity;

  const fecharBloco = () => {
    const colunas = bloco.reduce((m, b) => Math.max(m, b.coluna + 1), 1);
    for (const b of bloco) {
      saida.push({ item: b.item, topo: b.ini - faixa.ini, altura: b.fim - b.ini, coluna: b.coluna, colunas });
    }
    bloco = [];
  };

  for (const atual of ordenados) {
    if (bloco.length && atual.ini >= fimBloco) {
      fecharBloco();
      fimBloco = -Infinity;
    }
    // Menor coluna livre (cujo último ocupante já terminou).
    const fimPorColuna: number[] = [];
    for (const b of bloco) fimPorColuna[b.coluna] = Math.max(fimPorColuna[b.coluna] ?? -Infinity, b.fim);
    let coluna = 0;
    while (fimPorColuna[coluna] !== undefined && fimPorColuna[coluna]! > atual.ini) coluna++;
    bloco.push({ ...atual, coluna });
    fimBloco = Math.max(fimBloco, atual.fim);
  }
  if (bloco.length) fecharBloco();
  return saida;
}

/** Faixa em minutos a partir de 'HH:MM' ('24:00' permitido no fim). */
export function faixaMinutos(f: { inicio: string; fim: string }): IntervaloMin {
  return { ini: horaParaMinutos(f.inicio), fim: horaParaMinutos(f.fim) };
}

export function minutosParaHora(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

/** Linhas da grade (início de cada intervalo) dentro da faixa. */
export function linhasDaGrade(faixa: IntervaloMin, passo: number): number[] {
  const out: number[] = [];
  for (let m = faixa.ini; m < faixa.fim; m += passo) out.push(m);
  return out;
}

/** Arredonda para baixo no passo da grade, a partir do início da faixa. */
export function encaixarNoPasso(min: number, faixaIni: number, passo: number): number {
  return faixaIni + Math.floor((min - faixaIni) / passo) * passo;
}

/**
 * Horários vagos de UM dia: cada slot do horário padrão que não cruza agendado
 * ativo nem bloqueio, e que ainda não passou (se for hoje).
 */
export function horariosVagos(params: {
  padrao: IntervaloMin;
  passo: number;
  ocupados: IntervaloMin[];
  bloqueios: IntervaloMin[];
  /** minutos de agora, se o dia for hoje; null para outros dias */
  agoraMin: number | null;
  /** dia já passou inteiro */
  passado: boolean;
}): IntervaloMin[] {
  if (params.passado) return [];
  const out: IntervaloMin[] = [];
  for (let ini = params.padrao.ini; ini + params.passo <= params.padrao.fim; ini += params.passo) {
    const slot = { ini, fim: ini + params.passo };
    if (params.agoraMin !== null && ini < params.agoraMin) continue;
    if (params.ocupados.some((o) => cruzam(slot, o))) continue;
    if (params.bloqueios.some((b) => cruzam(slot, b))) continue;
    out.push(slot);
  }
  return out;
}
