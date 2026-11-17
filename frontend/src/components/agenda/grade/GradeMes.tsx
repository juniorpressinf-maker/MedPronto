import { Lock } from "lucide-react";
import type { Bloqueio } from "../../../lib/agendaNova/api";
import { dataBr, ehFimDeSemana, mesmoMes, rotuloDia } from "../../../lib/agendaNova/semana";
import { nomeFeriado } from "../../../lib/agendaNova/feriados";

const CABECALHO = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

type Props = {
  /** 42 dias (6 semanas, começando na segunda) */
  dias: string[];
  /** dia de referência (define qual é o mês exibido) */
  mesRef: string;
  /** data → agendamentos ativos (sem cancelados / não veio) */
  ativosPorDia: Map<string, number>;
  bloqueios: Bloqueio[];
  hoje: string;
  onDia: (data: string) => void;
};

/** Visão do mês (A5): quantos pacientes por dia; clicar no dia abre a visão Dia. */
export function GradeMes({ dias, mesRef, ativosPorDia, bloqueios, hoje, onDia }: Props) {
  return (
    <div className="agn-mes" role="grid" aria-label="Calendário do mês">
      {CABECALHO.map((c, i) => (
        <div key={c} role="columnheader" className={`agn-mes__cab ${i >= 5 ? "agn-mes__cab--fds" : ""}`}>
          {c}
        </div>
      ))}
      {dias.map((d) => {
        const ativos = ativosPorDia.get(d) ?? 0;
        const bloqs = bloqueios.filter((b) => b.data_inicio <= d && d <= b.data_fim);
        const diaTodo = bloqs.some((b) => b.hora_inicio === "00:00" && b.hora_fim === "24:00");
        const fora = !mesmoMes(d, mesRef);
        const r = rotuloDia(d);
        const feriado = nomeFeriado(d);
        const descricao =
          `${r.longo}, ${dataBr(d)}${feriado ? ` (feriado: ${feriado})` : ""}: ` +
          (ativos ? `${ativos} paciente${ativos === 1 ? "" : "s"}` : "nenhum paciente") +
          (bloqs.length ? (diaTodo ? ", dia bloqueado" : ", tem horário bloqueado") : "");
        return (
          <button
            key={d}
            type="button"
            role="gridcell"
            className={[
              "agn-mes__dia",
              fora && "agn-mes__dia--fora",
              d === hoje && "agn-mes__dia--hoje",
              d < hoje && "agn-mes__dia--passado",
              ehFimDeSemana(d) && "agn-mes__dia--fds",
              feriado && "agn-mes__dia--feriado",
              diaTodo && "agn-mes__dia--bloqueado",
            ]
              .filter(Boolean)
              .join(" ")}
            aria-label={descricao}
            title={`${descricao}. Clique para abrir o dia.`}
            onClick={() => onDia(d)}
          >
            <span className="agn-mes__num">{r.numero}</span>
            {feriado ? <span className="agn-mes__feriado">{feriado}</span> : null}
            {bloqs.length > 0 && (
              <Lock className="agn-mes__cadeado" aria-hidden />
            )}
            {ativos > 0 && (
              <span className="agn-mes__qtd">
                {ativos} <span className="agn-mes__qtd-rot">paciente{ativos === 1 ? "" : "s"}</span>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
