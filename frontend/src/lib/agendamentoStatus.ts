export const AGENDAMENTO_STATUS_LABEL: Record<string, string> = {
  agendado: "Agendado",
  presente: "Presente",
  em_atendimento: "Em atendimento",
  finalizado: "Finalizado",
  nao_compareceu: "Não veio",
  cancelado: "Cancelado",
  em_preenchimento: "Em preenchimento",
};

const STATUS_CONHECIDOS = new Set(Object.keys(AGENDAMENTO_STATUS_LABEL));

export function labelStatusAgendamento(status: string): string {
  return AGENDAMENTO_STATUS_LABEL[status] ?? status;
}

export function slugStatusAgendamento(status: string): string {
  return STATUS_CONHECIDOS.has(status) ? status : "agendado";
}

export function classeBadgeStatusAgendamento(status: string): string {
  return `historico-status-badge historico-status-badge--${slugStatusAgendamento(status)}`;
}

export function classeLinhaStatusAgendamento(status: string): string {
  return `historico-linha--${slugStatusAgendamento(status)}`;
}
