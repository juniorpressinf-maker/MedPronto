/** Financeiro (molde CliniCar): contas a pagar e caixa — API, tipos e utilidades. */
import { request } from "./api";
import { hojeIso } from "./cobrancaFormat";

export { hojeIso };

// ------------------------------------------------------------------ formatação

export function brl(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function dataBr(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
}

/** "12,50" / "12.50" / "1.234,50" / "R$ 10" → centavos. Vazio = 0; texto inválido = NaN. */
export function paraCentavos(texto: string): number {
  const t = String(texto ?? "").trim().replace(/\s/g, "").replace(/^R\$/i, "");
  if (t === "") return 0;
  const norm = t.includes(",")
    ? t.replace(/\./g, "").replace(",", ".")
    : /^\d{1,3}(\.\d{3})+$/.test(t)
      ? t.replace(/\./g, "")
      : t;
  if (!/^\d+(\.\d{0,2})?$/.test(norm)) return Number.NaN;
  return Math.round(Number(norm) * 100);
}

export function paraTexto(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Formas para pagar fornecedor: as da cobrança + boleto e débito automático. */
export const FORMAS_PAGAR: { id: string; label: string }[] = [
  { id: "dinheiro", label: "Dinheiro" },
  { id: "pix", label: "PIX" },
  { id: "debito", label: "Cartão débito" },
  { id: "credito", label: "Cartão crédito" },
  { id: "transferencia", label: "Transferência" },
  { id: "boleto", label: "Boleto" },
  { id: "debito_automatico", label: "Débito automático" },
];

const FORMA_LABEL_EXTRA: Record<string, string> = { repasse_convenio: "Repasse convênio" };

export function labelFormaPagar(id: string | null | undefined): string {
  if (!id || id === "—") return "—";
  return FORMAS_PAGAR.find((f) => f.id === id)?.label ?? FORMA_LABEL_EXTRA[id] ?? id;
}

export function inicioMes(iso = hojeIso()): string {
  return `${iso.slice(0, 7)}-01`;
}

export function fimMes(iso = hojeIso()): string {
  const [a, m] = iso.split("-").map(Number) as [number, number];
  const ult = new Date(a, m, 0).getDate();
  return `${iso.slice(0, 7)}-${String(ult).padStart(2, "0")}`;
}

/** Mesmo dia nos meses seguintes (31 → último dia do mês curto). Igual ao servidor. */
export function somarMeses(iso: string, n: number): string {
  const [a, m, d] = iso.split("-").map(Number) as [number, number, number];
  const alvo = new Date(a, m - 1 + n, 1);
  const ultimo = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
  return `${alvo.getFullYear()}-${String(alvo.getMonth() + 1).padStart(2, "0")}-${String(Math.min(d, ultimo)).padStart(2, "0")}`;
}

export function somarDias(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Divide o total em N parcelas mensais (centavos que sobram vão na 1ª). */
export function gerarParcelas(totalCentavos: number, n: number, primeiroVenc: string) {
  const base = Math.floor(totalCentavos / n);
  const sobra = totalCentavos - base * n;
  return Array.from({ length: n }, (_, i) => ({
    valor_centavos: base + (i === 0 ? sobra : 0),
    vencimento: somarMeses(primeiroVenc, i),
  }));
}

export const SITUACAO_LABEL: Record<string, string> = {
  paga: "Paga",
  vencida: "Vencida",
  hoje: "Vence hoje",
  a_vencer: "A vencer",
};

// ------------------------------------------------------------------ tipos

export type SituacaoContaPagar = "paga" | "vencida" | "hoje" | "a_vencer";

export type ContaPagar = {
  id: number;
  fornecedor_id: number;
  fornecedor_nome: string;
  categoria_id: number;
  categoria_nome: string;
  descricao: string;
  documento: string;
  valor_centavos: number;
  vencimento: string;
  forma_prevista: string | null;
  linha_pagamento: string;
  observacao: string;
  status: "aberta" | "paga";
  situacao: SituacaoContaPagar;
  lote_id: string | null;
  parcela_seq: number | null;
  parcela_total: number | null;
  repete_id: string | null;
  repete_seq: number | null;
  repete_total: number | null;
  pagamento_id: number | null;
  data_pagamento: string | null;
  valor_pago_centavos: number | null;
  juros_centavos: number | null;
  desconto_centavos: number | null;
  forma_paga: string | null;
};

export type ContaPagarSalvar = {
  fornecedor_id?: number;
  fornecedor_nome?: string;
  categoria_id: number;
  descricao?: string;
  documento?: string;
  valor_centavos: number;
  vencimento: string;
  forma_prevista?: string | null;
  linha_pagamento?: string;
  observacao?: string;
};

type TotalQtd = { qtd: number; valor_centavos: number };
export type TotaisContasPagar = {
  abertas: TotalQtd;
  vencidas: TotalQtd;
  hoje: TotalQtd;
  a_vencer: TotalQtd;
  semana: TotalQtd;
  pagas_mes: TotalQtd;
};

export type Fornecedor = { id: number; nome: string; documento: string | null; telefone: string | null; ativo: number };

export type CategoriaCaixa = { id: number; nome: string; natureza: "entrada" | "saida"; ativo: number };

export type MovimentoCaixa = {
  chave: string;
  id: number;
  data: string;
  natureza: "entrada" | "saida";
  categoria_nome: string;
  valor_centavos: number;
  descricao: string | null;
  forma: string | null;
  origem: "cobranca" | "conta_pagar" | "manual" | "outro";
  manual: number;
  conta_atendimento_id: number | null;
  usuario_nome: string | null;
  created_at: string;
};

export type ResumoCaixa = {
  de: string;
  ate: string;
  movimentos: MovimentoCaixa[];
  entradas_centavos: number;
  saidas_centavos: number;
  saldo_centavos: number;
  saldo_anterior_centavos: number;
  por_forma: { forma: string; entradas_centavos: number; saidas_centavos: number }[];
  por_categoria: { categoria: string; natureza: string; valor_centavos: number }[];
};

// ------------------------------------------------------------------ API

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const apiFin = {
  contasPagar: (f: { q?: string; situacao?: string; de?: string; ate?: string; categoria_id?: number } = {}) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(f)) if (v !== undefined && v !== "") sp.set(k, String(v));
    return request<{ rows: ContaPagar[]; totais: TotaisContasPagar }>(`/contas-pagar?${sp.toString()}`);
  },
  contaPagarCriar: (
    body: ContaPagarSalvar & { parcelas?: { valor_centavos: number; vencimento: string }[]; repetir_meses?: number },
  ) => request<ContaPagar[]>("/contas-pagar", json("POST", body)),
  contaPagarAlterar: (id: number, body: ContaPagarSalvar) =>
    request<ContaPagar>(`/contas-pagar/${id}`, json("PUT", body)),
  contaPagarExcluir: (id: number) => request<{ ok: true }>(`/contas-pagar/${id}`, json("DELETE")),
  contasPagarQuitar: (body: {
    ids: number[];
    data_pagamento: string;
    forma: string;
    juros_centavos?: number;
    desconto_centavos?: number;
    observacao?: string;
  }) => request<ContaPagar[]>("/contas-pagar/quitar", json("POST", body)),
  contaPagarEstornar: (id: number, motivo?: string) =>
    request<ContaPagar>(`/contas-pagar/${id}/estornar`, json("POST", { motivo })),
  fornecedores: () => request<Fornecedor[]>("/contas-pagar/fornecedores"),

  caixaCategorias: () => request<CategoriaCaixa[]>("/caixa/categorias"),
  caixaCriarCategoria: (nome: string, natureza: "entrada" | "saida") =>
    request<CategoriaCaixa>("/caixa/categorias", json("POST", { nome, natureza })),
  caixa: (de: string, ate: string) => request<ResumoCaixa>(`/caixa?de=${de}&ate=${ate}`),
  caixaLancar: (body: {
    natureza: "entrada" | "saida";
    categoria_id: number;
    valor_centavos: number;
    data: string;
    descricao: string;
    forma?: string;
  }) => request<{ id: number }>("/caixa/lancamentos", json("POST", body)),
  caixaExcluirLancamento: (id: number) => request<{ ok: true }>(`/caixa/lancamentos/${id}`, json("DELETE")),
};
