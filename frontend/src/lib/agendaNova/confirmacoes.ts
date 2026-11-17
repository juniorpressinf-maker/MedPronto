/**
 * Agenda Nova — quando o servidor responde 409 pedindo confirmação, qual pergunta
 * mostrar e qual campo reenviar. Puro (testável). Ver docs/PROJETO_AGENDA_NOVA.md.
 *
 *   409 error='retorno_vigente'      → ignorar_aviso_retorno  (prazo de retorno ativo; marcar como consulta nova?)
 *   409 codigo='retorno_confirmar'   → confirmar_retorno      (sem consulta prévia / prazo vencido)
 *   409 codigo='horario_bloqueado'   → ignorar_bloqueio
 *   409 codigo='conta_fechada'       → reabrir_conta          (conta já recebida: reabrir e incluir)
 *   409 codigo='dia_especial'        → confirmar_dia_especial (sábado, domingo, feriado, fora do expediente)
 */
export type CampoConfirmacao =
  | "ignorar_aviso_retorno"
  | "confirmar_retorno"
  | "ignorar_bloqueio"
  | "reabrir_conta"
  | "confirmar_dia_especial";

export type Confirmacao = {
  campo: CampoConfirmacao;
  titulo: string;
  mensagem: string;
  botao: string;
};

type Corpo = { error?: string; codigo?: string; mensagem?: string };

/**
 * Executa a chamada; se o servidor pedir confirmação (409), pergunta e repete
 * com o campo confirmado. Devolve false se o usuário desistir. Outros erros sobem.
 */
export async function comConfirmacoes(
  chamar: (confirmados: Partial<Record<CampoConfirmacao, boolean>>) => Promise<unknown>,
  perguntar: (c: Confirmacao) => Promise<boolean>,
): Promise<boolean> {
  const confirmados: Partial<Record<CampoConfirmacao, boolean>> = {};
  for (;;) {
    try {
      await chamar({ ...confirmados });
      return true;
    } catch (e) {
      const err = e as { status?: number; data?: unknown };
      const c = confirmacaoPedida(err.status ?? 0, err.data, confirmados);
      if (!c) throw e;
      if (!(await perguntar(c))) return false;
      confirmados[c.campo] = true;
    }
  }
}

export function confirmacaoPedida(
  status: number,
  dados: unknown,
  jaConfirmados: Partial<Record<CampoConfirmacao, boolean>>,
): Confirmacao | null {
  if (status !== 409 || !dados || typeof dados !== "object") return null;
  const d = dados as Corpo;

  if (d.error === "retorno_vigente" && !jaConfirmados.ignorar_aviso_retorno) {
    return {
      campo: "ignorar_aviso_retorno",
      titulo: "Paciente em prazo de retorno",
      mensagem: `${d.mensagem ?? "O paciente ainda está no prazo de retorno."}\n\nMarcar como consulta nova mesmo assim? (Para retorno, escolha o procedimento "Consulta retorno".)`,
      botao: "Marcar consulta nova",
    };
  }
  if (d.codigo === "retorno_confirmar" && !jaConfirmados.confirmar_retorno) {
    return {
      campo: "confirmar_retorno",
      titulo: "Retorno sem consulta vigente",
      mensagem: d.mensagem ?? d.error ?? "Agendar o retorno mesmo assim?",
      botao: "Agendar retorno",
    };
  }
  if (d.codigo === "conta_fechada" && !jaConfirmados.reabrir_conta) {
    return {
      campo: "reabrir_conta",
      titulo: "Conta já recebida",
      mensagem:
        "A conta deste atendimento já foi recebida.\n\nReabrir a conta e incluir a alteração? Os pagamentos feitos continuam valendo; a diferença fica pendente para receber no caixa.",
      botao: "Reabrir e incluir",
    };
  }
  if (d.codigo === "horario_bloqueado" && !jaConfirmados.ignorar_bloqueio) {
    return {
      campo: "ignorar_bloqueio",
      titulo: "Horário bloqueado",
      mensagem: "Este horário está bloqueado na agenda. Agendar mesmo assim?",
      botao: "Agendar mesmo assim",
    };
  }
  if (d.codigo === "dia_especial" && !jaConfirmados.confirmar_dia_especial) {
    return {
      campo: "confirmar_dia_especial",
      titulo: "Dia fora do normal",
      mensagem: `${d.mensagem ?? "Este dia não é dia útil normal."}\n\nMarcar mesmo assim?`,
      botao: "Marcar mesmo assim",
    };
  }
  return null;
}
