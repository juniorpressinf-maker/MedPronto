import { api, ApiError, type CobrancaContaDetalhe, type CobrancaItemStatus } from "./api";

const STATUS_ITEM_ATIVOS = new Set<CobrancaItemStatus>([
  "previsto",
  "solicitado",
  "realizado",
]);

export class UserCancelledError extends Error {
  constructor() {
    super("Operação cancelada");
    this.name = "UserCancelledError";
  }
}

type ConfirmFn = (options: {
  title: string;
  message: string;
  confirmLabel?: string;
}) => Promise<boolean>;

export function contaTemProcedimentoAtivo(
  conta: CobrancaContaDetalhe,
  procedimentoId: number,
): boolean {
  return conta.itens.some(
    (i) =>
      i.procedimento_id === procedimentoId &&
      STATUS_ITEM_ATIVOS.has(i.status),
  );
}

type ItemAddBody = {
  procedimento_id: number;
  quantidade?: number;
  status?: CobrancaItemStatus;
  observacao?: string;
  confirmar_duplicata?: boolean;
};

async function confirmarDuplicata(
  confirm: ConfirmFn,
  nome: string,
): Promise<boolean> {
  return confirm({
    title: "Procedimento duplicado",
    message: `"${nome}" já consta nesta conta. Deseja incluir outra vez?`,
    confirmLabel: "Incluir mesmo assim",
  });
}

export async function adicionarItemComConfirmacaoDuplicata(
  confirm: ConfirmFn,
  contaId: number,
  body: ItemAddBody,
  opts?: { conta?: CobrancaContaDetalhe; procedimentoNome?: string },
): Promise<CobrancaContaDetalhe> {
  const { conta, procedimentoNome } = opts ?? {};

  if (conta && contaTemProcedimentoAtivo(conta, body.procedimento_id)) {
    const nome =
      procedimentoNome ??
      conta.itens.find((i) => i.procedimento_id === body.procedimento_id)
        ?.procedimento_nome ??
      "este procedimento";
    const ok = await confirmarDuplicata(confirm, nome);
    if (!ok) throw new UserCancelledError();
    return api.cobrancaContaItemAdd(contaId, {
      ...body,
      confirmar_duplicata: true,
    });
  }

  try {
    return await api.cobrancaContaItemAdd(contaId, body);
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) {
      const data = e.data as
        | { codigo?: string; procedimento_nome?: string }
        | undefined;
      if (data?.codigo === "procedimento_duplicado") {
        const nome = data.procedimento_nome ?? "este procedimento";
        const ok = await confirmarDuplicata(confirm, nome);
        if (!ok) throw new UserCancelledError();
        return api.cobrancaContaItemAdd(contaId, {
          ...body,
          confirmar_duplicata: true,
        });
      }
    }
    throw e;
  }
}
