export const MODOS_CLINICOS = ["prontuario", "aso", "nenhum"] as const;

export type ModoClinico = (typeof MODOS_CLINICOS)[number];

export const MODO_CLINICO_LABEL: Record<ModoClinico, string> = {
  prontuario: "Abre prontuário",
  aso: "Abre ASO",
  nenhum: "Sem ficha clínica",
};

export const MODO_CLINICO_AJUDA: Record<ModoClinico, string> = {
  prontuario: "O horário abre o prontuário. Continua sendo um procedimento.",
  aso: "O horário abre o ASO. Continua sendo um procedimento.",
  nenhum: "Só cobrança e anexo. Não abre ficha clínica.",
};

export function isModoClinico(v: string): v is ModoClinico {
  return (MODOS_CLINICOS as readonly string[]).includes(v);
}
