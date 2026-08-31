/** Cores estáveis por médico — legíveis no fundo pergaminho da agenda. */
const PALETA = [
  "#1a4d7a",
  "#7a1a4d",
  "#2d6a2d",
  "#8b4513",
  "#5c2d91",
  "#c45c00",
  "#006d6d",
  "#8b1a1a",
  "#4a4a8b",
  "#6b4423",
] as const;

export function corMedicoAgenda(medicoId: number): string {
  const idx = Math.abs(medicoId) % PALETA.length;
  return PALETA[idx];
}
