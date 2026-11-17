import type { IntervaloMin } from "../../../lib/agendaNova/layoutGrade";
import { minutosParaHora } from "../../../lib/agendaNova/layoutGrade";
import { dataBr, rotuloDia } from "../../../lib/agendaNova/semana";

type Props = {
  medicoNome: string;
  vagosPorDia: { data: string; vagos: IntervaloMin[] }[];
  onEscolher: (data: string, hora: string) => void;
  onFechar: () => void;
};

/** "Ver horários vagos": slots livres do horário padrão nos dias visíveis. */
export function VagosDialog({ medicoNome, vagosPorDia, onEscolher, onFechar }: Props) {
  const comVagos = vagosPorDia.filter((d) => d.vagos.length > 0);
  return (
    <div className="modal-overlay" role="presentation" onClick={onFechar}>
      <div
        className="modal panel agn-vagos"
        role="dialog"
        aria-modal="true"
        aria-labelledby="agn-vagos-titulo"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") onFechar();
        }}
      >
        <h2 id="agn-vagos-titulo" className="modal__title">
          Horários vagos — {medicoNome}
        </h2>
        {comVagos.length === 0 ? (
          <p className="modal__text">Nenhum horário vago no período.</p>
        ) : (
          <div className="agn-vagos__lista">
            {comVagos.map((d) => (
              <section key={d.data}>
                <h3 className="agn-vagos__dia">
                  {rotuloDia(d.data).longo}, {dataBr(d.data)}
                </h3>
                <div className="agn-vagos__horas">
                  {d.vagos.map((v) => {
                    const hora = minutosParaHora(v.ini);
                    return (
                      <button
                        key={v.ini}
                        type="button"
                        className="agn-vagos__hora"
                        autoFocus={d === comVagos[0] && v === d.vagos[0]}
                        onClick={() => onEscolher(d.data, hora)}
                      >
                        {hora}
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
        <div className="modal__actions agn-vagos__rodape">
          <button type="button" className="btn btn-secondary" onClick={onFechar}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
