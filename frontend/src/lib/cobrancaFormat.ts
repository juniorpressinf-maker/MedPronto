function hojeIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function formatDataBr(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

export function formatBRL(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export { hojeIso };

export function somarItensConta(
  itens: { status: string; valor_centavos: number; quantidade: number }[],
): number {
  return itens
    .filter((i) => i.status !== "cancelado")
    .reduce((s, i) => s + i.valor_centavos * i.quantidade, 0);
}

export function somarPagamentosConta(
  pagamentos: { valor_centavos: number }[] | undefined,
): number {
  return (pagamentos ?? []).reduce((s, p) => s + p.valor_centavos, 0);
}

const STATUS_LABEL: Record<string, string> = {
  em_aberto: "Em aberto",
  aguardando_pagamento: "Aguardando pagamento",
  pago: "Pago",
  parcialmente_pago: "Parcialmente pago",
  a_faturar_convenio: "A faturar convênio",
  isento: "Isento",
  cancelada: "Cancelada",
  previsto: "Previsto",
  solicitado: "Solicitado",
  realizado: "Realizado",
  cancelado: "Cancelado",
};

export function labelHoraConta(hora?: string | null): string {
  const t = hora?.trim();
  if (!t) return "Avulso";
  return t.slice(0, 5);
}

export function labelStatusCobranca(status: string): string {
  return STATUS_LABEL[status] ?? status;
}

export function contaCobrancaEmAberto(status?: string | null): boolean {
  return !status || status === "em_aberto";
}

export function labelBadgeContaAgendamento(status?: string | null): string {
  if (contaCobrancaEmAberto(status)) return "Conta em aberto";
  return labelStatusCobranca(status!);
}

export function labelBotaoContaAgendamento(status?: string | null): string {
  if (contaCobrancaEmAberto(status)) return "Conta";
  switch (status) {
    case "pago":
      return "Conta paga";
    case "a_faturar_convenio":
      return "A faturar";
    case "isento":
      return "Isento";
    case "parcialmente_pago":
      return "Parcial";
    case "aguardando_pagamento":
      return "Aguardando";
    default:
      return labelStatusCobranca(status!);
  }
}

export function classeBadgeContaAgendamento(status?: string | null): string {
  if (contaCobrancaEmAberto(status)) return "text-green-800";
  if (status === "pago") return "text-green-700";
  if (status === "a_faturar_convenio") return "text-blue-800";
  if (status === "isento") return "text-[var(--muted)]";
  return "text-[var(--text-2)]";
}

export function itemProcedimentoEhAdmissional(item: {
  procedimento_modo_clinico?: string | null;
}): boolean {
  return item.procedimento_modo_clinico === "aso";
}

/** Resultado PDF (Vincular / Anexar) só em exame auxiliar. */
export function itemProcedimentoTemResultadoExame(item: {
  procedimento_modo_clinico?: string | null;
}): boolean {
  return item.procedimento_modo_clinico === "nenhum";
}

/** Botão de cobrança na agenda/fila/caixa — verde quando pago. */
export function classeBotaoContaAgendamento(
  status?: string | null,
  extra?: string,
  compact = true,
): string {
  const variant = status === "pago" ? "btn-cobranca-paga" : "btn-secondary";
  return ["btn", compact ? "btn-sm" : null, variant, extra]
    .filter(Boolean)
    .join(" ");
}

const FORMA_PAGAMENTO_LABEL: Record<string, string> = {
  pix: "PIX",
  credito: "Cartão crédito",
  debito: "Cartão débito",
  dinheiro: "Dinheiro",
  repasse_convenio: "Repasse convênio",
};

export function labelFormaPagamento(forma: string): string {
  return FORMA_PAGAMENTO_LABEL[forma] ?? forma;
}
