/**
 * Agenda Nova — transições de status oferecidas no painel (espelha TRANSICOES de
 * backend/src/routes/agendamentos.ts). O backend continua sendo quem valida
 * (inclui permissões: em_atendimento/finalizado exigem a fila do médico).
 */
export const TRANSICOES: Record<string, string[]> = {
  agendado: ["presente", "cancelado", "nao_compareceu"],
  presente: ["em_atendimento", "agendado", "cancelado", "nao_compareceu"],
  em_atendimento: ["finalizado", "presente"],
  finalizado: [],
  nao_compareceu: ["agendado"],
  cancelado: ["agendado"],
};

/** Rótulos de AÇÃO (o que acontece ao escolher), diferentes do rótulo do estado. */
export const ACAO_STATUS: Record<string, string> = {
  agendado: "Voltar para agendado",
  presente: "Chegou (check-in)",
  em_atendimento: "Iniciar atendimento",
  finalizado: "Finalizar",
  nao_compareceu: "Não veio",
  cancelado: "Cancelar agendamento",
};

export function proximosStatus(atual: string): string[] {
  return TRANSICOES[atual] ?? [];
}

/** Só horário em 'agendado' pode ter data/hora/médico alterados (regra do backend). */
export function podeRemarcar(status: string): boolean {
  return status === "agendado";
}
