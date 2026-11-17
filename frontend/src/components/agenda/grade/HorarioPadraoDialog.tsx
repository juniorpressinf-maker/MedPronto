import { useState } from "react";
import { ApiError } from "../../../lib/api";
import { agendaNovaApi, type HorarioPadrao } from "../../../lib/agendaNova/api";
import { INTERVALOS_MINUTOS } from "../../../lib/agendaNova/horario";
import { useMessageBox } from "../../../lib/messageBoxContext";

type Props = {
  atual: HorarioPadrao;
  onFechar: () => void;
  onSalvo: (h: HorarioPadrao) => void;
};

/** Botão ⚙ da agenda: horário padrão único da clínica (início, fim, intervalo). */
export function HorarioPadraoDialog({ atual, onFechar, onSalvo }: Props) {
  const msg = useMessageBox();
  const [inicio, setInicio] = useState(atual.inicio);
  const [fim, setFim] = useState(atual.fim);
  const [intervalo, setIntervalo] = useState(atual.intervalo_minutos);
  const [salvando, setSalvando] = useState(false);
  const erro = !inicio || !fim ? "Preencha início e fim." : inicio >= fim ? "O fim precisa ser depois do início." : null;

  const salvar = async () => {
    if (erro) return;
    setSalvando(true);
    try {
      onSalvo(await agendaNovaApi.horarioPadraoSalvar({ inicio, fim, intervalo_minutos: intervalo }));
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro ao salvar");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="modal-overlay" role="presentation" onClick={onFechar}>
      <div
        className="modal panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="agn-padrao-titulo"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") onFechar();
        }}
      >
        <h2 id="agn-padrao-titulo" className="modal__title">
          Horário padrão da agenda
        </h2>
        <p className="modal__text">
          Vale para todos os médicos. Na hora de marcar, o início e o fim de cada agendamento podem ser mudados.
        </p>
        <div className="grid grid-cols-3 gap-3 mt-2">
          <label className="text-sm">
            <span className="font-medium block mb-1">Início do dia</span>
            <input type="time" step={300} className="legacy-input w-full" value={inicio} autoFocus onChange={(e) => setInicio(e.target.value)} />
          </label>
          <label className="text-sm">
            <span className="font-medium block mb-1">Fim do dia</span>
            <input type="time" step={300} className="legacy-input w-full" value={fim} onChange={(e) => setFim(e.target.value)} />
          </label>
          <label className="text-sm">
            <span className="font-medium block mb-1">Intervalo</span>
            <select className="legacy-input w-full" value={intervalo} onChange={(e) => setIntervalo(Number(e.target.value))}>
              {INTERVALOS_MINUTOS.map((n) => (
                <option key={n} value={n}>
                  {n} min
                </option>
              ))}
            </select>
          </label>
        </div>
        {erro && (
          <p className="text-sm text-[var(--danger)] mt-2 mb-0" role="alert">
            {erro}
          </p>
        )}
        <div className="modal__actions">
          <button type="button" className="btn btn-secondary" onClick={onFechar}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" disabled={!!erro || salvando} onClick={() => void salvar()}>
            {salvando ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}
