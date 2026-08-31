import type { Paciente } from "./api";

export const MSG_PACIENTE_AGENDA_INCOMPLETO =
  "Paciente precisa ter telefone e data de nascimento cadastrados para agendar.";

export function pacienteProntoParaAgendar(
  p: Pick<Paciente, "telefone" | "data_nasc">,
): boolean {
  return Boolean(p.telefone?.trim() && p.data_nasc?.trim());
}
