import type { ModoClinico } from "./modoClinico";

/** Nome exibido para o módulo clínico admissional */
export const ASO_TITULO = "ASO - Atestado de Saúde Ocupacional";
export const ASO_TITULO_CURTO = "ASO";

/**
 * Coluna interna `agendamentos.tipo_atendimento` (derivada do procedimento).
 * A UI usa `modo_clinico` da lista N:N, não este tipo.
 */
export type TipoAtendimento = "consulta" | "admissional" | "exame";

export function tipoDerivadoDoModoClinico(
  modo?: ModoClinico | string | null,
): TipoAtendimento {
  if (modo === "aso") return "admissional";
  if (modo === "nenhum") return "exame";
  return "consulta";
}

/** Rótulo único: tudo na agenda é procedimento. */
export function labelTipoAtendimento(
  _tipo?: TipoAtendimento | string | null,
): string {
  return "Procedimento";
}

export function labelTipoAtendimentoBadge(
  _tipo?: TipoAtendimento | string | null,
): string {
  return "Procedimento";
}

export function badgeClassTipoAtendimento(
  tipo?: TipoAtendimento | string | null,
): string {
  const t = tipo ?? "consulta";
  if (t === "admissional") return "fila-tipo-badge fila-tipo-badge--admissional";
  if (t === "exame") return "fila-tipo-badge fila-tipo-badge--exame";
  return "fila-tipo-badge fila-tipo-badge--consulta";
}
