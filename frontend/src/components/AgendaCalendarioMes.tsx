import { motivoDiaNaoUtil } from "../lib/diasEspeciais";
import {
  celulasDoMes,
  isoNaMesmaSemana,
  segundaIsoDaSemana,
  type CelulaAgendaMes,
} from "../lib/agendaCalendario";

export type AgendaDiaResumo = {
  total: number;
  ativos: number;
};

const DOWS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

type Props = {
  mes: string;
  hoje: string;
  selecionado?: string;
  semanaFiltro: string;
  porData: Record<string, AgendaDiaResumo>;
  onEscolherDia: (iso: string) => void;
  onAlternarSemana: (segundaIso: string) => void;
};

function classeCelula(
  c: CelulaAgendaMes,
  hoje: string,
  selecionado: string | undefined,
  ativos: number,
  naSemanaAtual: boolean,
  semanaFiltrada: boolean,
): string {
  const partes = ["agenda-mes__dia"];
  if (c.foraDoMes) partes.push("agenda-mes__dia--fora");
  if (naSemanaAtual) partes.push("agenda-mes__dia--semana");
  if (semanaFiltrada) partes.push("agenda-mes__dia--filtro");
  if (c.iso === hoje) partes.push("agenda-mes__dia--hoje");
  if (selecionado && c.iso === selecionado) partes.push("agenda-mes__dia--sel");
  const motivo = motivoDiaNaoUtil(c.iso);
  if (motivo) partes.push("agenda-mes__dia--especial");
  if (ativos > 0) partes.push("agenda-mes__dia--ocupado");
  return partes.join(" ");
}

export function AgendaCalendarioMes({
  mes,
  hoje,
  selecionado,
  semanaFiltro,
  porData,
  onEscolherDia,
  onAlternarSemana,
}: Props) {
  const cells = celulasDoMes(mes);
  const semanas: CelulaAgendaMes[][] = [];
  for (let i = 0; i < 6; i++) {
    semanas.push(cells.slice(i * 7, i * 7 + 7));
  }
  const filtroAtivo = Boolean(semanaFiltro);

  return (
    <div className="agenda-mes__grade" role="grid" aria-label="Calendário da agenda">
      <div className="agenda-mes__dows" role="row">
        <span className="agenda-mes__dow-mark" aria-hidden="true" />
        {DOWS.map((d) => (
          <div key={d} className="agenda-mes__dow" role="columnheader">
            {d}
          </div>
        ))}
      </div>
      <div className="agenda-mes__semanas">
        {semanas.map((semana) => {
          const segunda = segundaIsoDaSemana(semana[0]!.iso);
          const naSemanaAtual = semana.some((c) => isoNaMesmaSemana(c.iso, hoje));
          const marcada = semanaFiltro === segunda;
          const apagada = filtroAtivo && !marcada;
          return (
            <div
              key={segunda}
              className={[
                "agenda-mes__semana",
                naSemanaAtual ? "agenda-mes__semana--atual" : "",
                marcada ? "agenda-mes__semana--marcada" : "",
                apagada ? "agenda-mes__semana--apagada" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              role="row"
            >
              <label className="agenda-mes__semana-mark">
                <input
                  type="checkbox"
                  checked={marcada}
                  onChange={() => onAlternarSemana(segunda)}
                  aria-label={`Filtrar totais da semana ${segunda}`}
                />
                <span className="agenda-mes__semana-mark-ui" aria-hidden="true" />
              </label>
              {semana.map((c) => {
                const resumo = porData[c.iso];
                const ativos = resumo?.ativos ?? 0;
                const motivo = motivoDiaNaoUtil(c.iso);
                const ehHoje = c.iso === hoje;
                const label = [
                  c.iso,
                  ehHoje ? "hoje" : "",
                  naSemanaAtual ? "semana atual" : "",
                  ativos > 0 ? `${ativos} agendamento(s)` : "sem agenda",
                  motivo ?? "",
                ]
                  .filter(Boolean)
                  .join(" — ");
                return (
                  <button
                    key={c.iso}
                    type="button"
                    role="gridcell"
                    className={classeCelula(
                      c,
                      hoje,
                      selecionado,
                      ativos,
                      naSemanaAtual,
                      marcada,
                    )}
                    onClick={() => onEscolherDia(c.iso)}
                    aria-label={label}
                    aria-current={ehHoje ? "date" : undefined}
                    title={motivo ?? undefined}
                  >
                    <span className="agenda-mes__num-linha">
                      <span className="agenda-mes__num">{c.dia}</span>
                      {ehHoje ? (
                        <span className="agenda-mes__hoje-tag">Hoje</span>
                      ) : null}
                    </span>
                    {ativos > 0 ? (
                      <span className="agenda-mes__qtd">{ativos}</span>
                    ) : (
                      <span className="agenda-mes__qtd agenda-mes__qtd--vazia" />
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
