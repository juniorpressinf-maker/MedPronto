import type { ReactNode } from "react";
import {
  FichaFolhaLayout,
  FichaFolhaPage,
  FichaFolhaToolbar,
  FichaFolhaViewport,
} from "./FichaFolhaLayout";
import { FichaCamposCorpo, type FichaPreviewDados } from "./FichaCamposCorpo";
import type { FichaCampoDef } from "../lib/fichaTipos";
import { VoltarButton } from "./VoltarButton";

type Props = {
  titulo: string;
  subtituloFicha?: string;
  nomeFicha?: string;
  campos: FichaCampoDef[];
  readOnly?: boolean;
  dados?: FichaPreviewDados;
  onDadosChange?: (dados: FichaPreviewDados) => void;
  pageTitle?: string;
  pageSubtitle?: string;
  onVoltar?: () => void;
  toolbarExtra?: ReactNode;
};

export function FichaPreview({
  titulo,
  subtituloFicha,
  nomeFicha,
  campos,
  readOnly = true,
  dados,
  onDadosChange,
  pageTitle = "Pré-visualização",
  pageSubtitle,
  onVoltar,
  toolbarExtra,
}: Props) {
  return (
    <FichaFolhaPage
      title={pageTitle}
      subtitle={pageSubtitle ?? nomeFicha ?? subtituloFicha}
      toolbar={
        <FichaFolhaToolbar>
          {onVoltar ? <VoltarButton onClick={onVoltar}>Voltar</VoltarButton> : null}
          {toolbarExtra ? <div className="form-actions__direita">{toolbarExtra}</div> : null}
        </FichaFolhaToolbar>
      }
    >
      <FichaFolhaViewport>
        <FichaFolhaLayout
          tituloDocumento={titulo}
          subtituloFicha={nomeFicha ?? subtituloFicha}
          caixaRotulo="Prévia"
          caixaValor="—"
          identificacaoExemplo
          aviso="Pré-visualização — os dados do paciente serão preenchidos automaticamente no atendimento."
        >
          <FichaCamposCorpo
            campos={campos}
            readOnly={readOnly}
            dados={dados}
            onDadosChange={onDadosChange}
          />
        </FichaFolhaLayout>
      </FichaFolhaViewport>
    </FichaFolhaPage>
  );
}

export { FichaCamposCorpo, FichaFolhaLayout, FichaFolhaViewport, FichaFolhaToolbar, FichaFolhaPage };
export type { FichaPreviewDados };
