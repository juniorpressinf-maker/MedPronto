import { useCallback, useEffect, useState } from "react";
import { ApiError, api } from "../lib/api";
import { useMessageBox } from "../lib/messageBoxContext";

type Props = {
  prontuarioId: number;
  className?: string;
  label?: string;
  disabled?: boolean;
};

export function ImprimirDocumentosLoteButton({
  prontuarioId,
  className = "btn btn-primary agenda-big-action",
  label = "Imprimir todos (PDF)",
  disabled = false,
}: Props) {
  const msg = useMessageBox();
  const [qtd, setQtd] = useState<number | null>(null);
  const [gerando, setGerando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const { documentos } = await api.documentosLoteList(prontuarioId);
      setQtd(documentos.length);
    } catch {
      setQtd(0);
    }
  }, [prontuarioId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (qtd === 0) return null;

  const imprimir = async () => {
    setGerando(true);
    try {
      await api.documentosLotePdf(prontuarioId);
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro ao gerar PDF em lote");
    } finally {
      setGerando(false);
    }
  };

  return (
    <button
      type="button"
      className={className}
      disabled={disabled || gerando || qtd == null || qtd === 0}
      onClick={() => void imprimir()}
      title={
        qtd && qtd > 1
          ? `Mescla ${qtd} documentos em um único PDF`
          : "Abre o PDF disponível desta consulta"
      }
    >
      {gerando ? "Gerando PDF…" : label}
      {qtd != null && qtd > 1 ? ` (${qtd})` : ""}
    </button>
  );
}
