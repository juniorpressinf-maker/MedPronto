import { corMedicoAgenda } from "../lib/corMedicoAgenda";

export type AgendaMesMedicoResumo = {
  medico_id: number;
  medico_nome: string;
  agendamentos: number;
  pacientes: number;
};

type Props = {
  titulo: string;
  subtitulo: string;
  loading: boolean;
  medicos: AgendaMesMedicoResumo[];
  medicoFiltro: number | "";
  onEscolherMedico: (id: number | "") => void;
};

export function AgendaMesMedicosCard({
  titulo,
  subtitulo,
  loading,
  medicos,
  medicoFiltro,
  onEscolherMedico,
}: Props) {
  const totalPac = medicos.reduce((n, m) => n + Number(m.pacientes || 0), 0);
  const totalAg = medicos.reduce((n, m) => n + Number(m.agendamentos || 0), 0);

  return (
    <aside className="agenda-mes-side" aria-label={`${titulo} ${subtitulo}`}>
      <header className="agenda-mes-side__topo">
        <h3 className="agenda-mes-side__titulo">{titulo}</h3>
        <p className="agenda-mes-side__sub">{subtitulo}</p>
        <div className="agenda-mes-side__kpis">
          <div>
            <span className="agenda-mes-side__kpi-n">{loading ? "…" : totalPac}</span>
            <span className="agenda-mes-side__kpi-l">Pacientes</span>
          </div>
          <div>
            <span className="agenda-mes-side__kpi-n">{loading ? "…" : totalAg}</span>
            <span className="agenda-mes-side__kpi-l">Procedimentos</span>
          </div>
        </div>
      </header>
      {loading ? (
        <p className="agenda-mes-side__vazio">Carregando…</p>
      ) : medicos.length === 0 ? (
        <p className="agenda-mes-side__vazio">Nenhuma marcação neste período.</p>
      ) : (
        <ul className="agenda-mes-side__lista">
          {medicos.map((m) => {
            const ativo = medicoFiltro === m.medico_id;
            const pac = Number(m.pacientes) || 0;
            const ag = Number(m.agendamentos) || 0;
            return (
              <li key={m.medico_id}>
                <button
                  type="button"
                  className={`agenda-mes-side__row${ativo ? " agenda-mes-side__row--ativo" : ""}`}
                  onClick={() => onEscolherMedico(ativo ? "" : m.medico_id)}
                  style={{ borderLeftColor: corMedicoAgenda(m.medico_id) }}
                >
                  <span className="agenda-mes-side__nome">{m.medico_nome}</span>
                  <span className="agenda-mes-side__nums">
                    <span>
                      <strong>{pac}</strong> {pac === 1 ? "paciente" : "pacientes"}
                    </span>
                    <span>
                      <strong>{ag}</strong> {ag === 1 ? "procedimento" : "procedimentos"}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
