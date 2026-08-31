import { type ReactNode } from "react";
import { VoltarButton } from "./VoltarButton";
type Props = {
  saving?: boolean;
  /** Consulta finalizada — prontuário e documentos em somente leitura */
  somenteLeitura?: boolean;
  /** Oculta Salvar (consulta encerrada) */
  hideSave?: boolean;
  saveLabel?: string;
  savingLabel?: string;
  onBack?: () => void;
  backLabel?: string;
  /** Desabilita Salvar explicitamente */
  saveDisabled?: boolean;
  /** false = nada alterado — Salvar fica desabilitado */
  dirty?: boolean;
  /** true = registro já persistido — oculta Salvar se !dirty */
  saved?: boolean;
  /** Se informado, Salvar vira botão (não submit) — útil fora de &lt;form&gt; */
  onSave?: () => void;
  children?: ReactNode;
};

/** Voltar à esquerda; Salvar e demais ações à direita */
export function FormActions({
  saving = false,
  somenteLeitura = false,
  hideSave = false,
  saveLabel = "Salvar",
  savingLabel = "Salvando…",
  onBack,
  backLabel = "Voltar",
  saveDisabled = false,
  dirty = true,
  saved,
  onSave,
  children,
}: Props) {
  const showSave =
    !somenteLeitura &&
    !hideSave &&
    (saved === undefined ? true : dirty || !saved);
  const saveBtn = (
    <button
      type={onSave ? "button" : "submit"}
      disabled={saving || saveDisabled || !dirty}
      className="btn btn-primary agenda-big-action"
      onClick={onSave}
    >
      {saving ? savingLabel : saveLabel}
    </button>
  );

  return (
    <div className="form-actions">
      {onBack ? (
        <VoltarButton onClick={onBack}>{backLabel}</VoltarButton>
      ) : null}
      <div className="form-actions__direita">
        {children}
        {showSave ? saveBtn : null}
      </div>
    </div>
  );
}
