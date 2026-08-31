import { useState } from "react";
import { ApiError, api } from "../lib/api";
import { useMessageBox } from "../lib/messageBoxContext";

type Alvo = {
  id: number;
  medico_nome?: string | null;
  dataLabel: string;
};

type Props = {
  item: Alvo;
  onClose: () => void;
  onCriado: (admissionalId: number) => void;
};

function idRetificacaoAberta(e: unknown): number | null {
  if (!(e instanceof ApiError) || e.status !== 409) return null;
  const id = (e.data as { admissional_id?: unknown } | undefined)?.admissional_id;
  return typeof id === "number" && id > 0 ? id : null;
}

export function AdmissionalRetificarDialog({ item, onClose, onCriado }: Props) {
  const msg = useMessageBox();
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);

  const confirmar = async () => {
    if (motivo.trim().length < 3) {
      void msg.warning("Informe o motivo da retificação (mínimo 3 caracteres).");
      return;
    }
    setSalvando(true);
    try {
      const row = await api.admissionalRetificar(item.id, motivo.trim());
      onCriado(row.id);
    } catch (e) {
      const existente = idRetificacaoAberta(e);
      if (existente) {
        void msg.warning("Já existe retificação em andamento — abrindo a folha.");
        onClose();
        onCriado(existente);
        return;
      }
      void msg.error(e instanceof ApiError ? e.message : "Erro ao retificar");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="modal panel exame-anexar-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="aso-retificar-titulo"
        onClick={(ev) => ev.stopPropagation()}
      >
        <h2 id="aso-retificar-titulo" className="modal__title">
          Retificar ASO
        </h2>
        <p className="modal__text">
          ASO nº {item.id} — {item.dataLabel}
          {item.medico_nome ? ` — ${item.medico_nome}` : ""}.
        </p>
        <p className="modal__text m-0 mb-3">
          O atestado original permanece. Será criada uma folha nova para corrigir
          checklist e conclusão.
        </p>
        <div className="backup-restore-passo">
          <div className="backup-restore-passo__num">1</div>
          <div className="backup-restore-passo__corpo">
            <p className="backup-restore-passo__titulo">Motivo da retificação</p>
            <p className="backup-restore-passo__hint">
              Texto de auditoria. A correção clínica é feita na folha seguinte.
            </p>
            <label className="exame-anexar-descricao" htmlFor="aso-retificacao-motivo">
              <span className="exame-anexar-descricao__rotulo">
                Campo de texto — digite aqui
              </span>
              <textarea
                id="aso-retificacao-motivo"
                className="legacy-input exame-anexar-descricao__input exame-anexar-descricao__textarea"
                rows={4}
                maxLength={2000}
                value={motivo}
                onChange={(ev) => setMotivo(ev.target.value)}
                placeholder="Ex.: CORREÇÃO DE CONCLUSÃO, COMPLEMENTO DE RISCOS…"
              />
            </label>
          </div>
        </div>
        <div className="backup-restore-passo mt-3">
          <div className="backup-restore-passo__num">2</div>
          <div className="backup-restore-passo__corpo">
            <p className="backup-restore-passo__titulo">Corrigir no ASO</p>
            <p className="backup-restore-passo__hint">
              Ao confirmar, abre a folha nova com cópia do original. Imprima o PDF
              da retificação depois de finalizar.
            </p>
            <button
              type="button"
              className="btn btn-primary agenda-big-action"
              disabled={salvando || motivo.trim().length < 3}
              onClick={() => void confirmar()}
            >
              {salvando ? "Criando…" : "Criar retificação e editar"}
            </button>
          </div>
        </div>
        <div className="modal__actions mt-4">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

export { idRetificacaoAberta };
