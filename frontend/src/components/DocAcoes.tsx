import { Printer } from "lucide-react";
import { VoltarButton } from "./VoltarButton";

/**
 * Rodapé da receita e do pedido de exames (igual ao Clinicar):
 * "Voltar ao prontuário" à esquerda; à direita o estado do salvamento automático
 * ("✓ Salvo às…") e Imprimir. Não há botão Salvar: o documento grava sozinho e
 * Imprimir grava antes se houver alteração.
 */
export function DocAcoes(props: {
  indicador: string | null;
  saving: boolean;
  onVoltar: () => void;
  onImprimir: () => void;
}) {
  return (
    <div className="doc-acoes">
      <VoltarButton onClick={props.onVoltar}>Voltar ao prontuário</VoltarButton>
      <span className="doc-acoes__status" role="status">
        {props.saving ? "Salvando…" : (props.indicador ?? "")}
      </span>
      <button
        type="button"
        className="btn btn-primary"
        title="Gera a folha para imprimir ou salvar em PDF"
        onClick={props.onImprimir}
      >
        <Printer className="h-4 w-4" /> Imprimir
      </button>
    </div>
  );
}
