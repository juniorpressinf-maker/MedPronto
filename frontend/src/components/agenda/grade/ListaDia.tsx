import { Check } from "lucide-react";
import type { AgendamentoGrade, AgendamentoTipo } from "../../../lib/agendaNova/api";
import { classeBadgeStatusAgendamento, labelStatusAgendamento } from "../../../lib/agendamentoStatus";
import { corDoCard } from "./CardAgendamento";

type Props = {
  agendamentos: AgendamentoGrade[];
  tipos: AgendamentoTipo[];
  onCard: (ag: AgendamentoGrade) => void;
};

/** Visão Lista ("modo chegada"): agendamentos do dia em ordem de horário. */
export function ListaDia({ agendamentos, tipos, onCard }: Props) {
  if (agendamentos.length === 0) {
    return <p className="p-6 text-sm text-[var(--muted)]">Nenhum agendamento neste dia.</p>;
  }
  return (
    <div className="dup-table-wrap">
      <table className="data-table agn-lista">
        <thead>
          <tr>
            <th>Horário</th>
            <th>Paciente</th>
            <th>Procedimentos</th>
            <th>Convênio</th>
            <th>Situação</th>
          </tr>
        </thead>
        <tbody>
          {agendamentos.map((a) => (
            <tr
              key={a.id}
              className={`cursor-pointer ${a.status === "cancelado" || a.status === "nao_compareceu" ? "opacity-60" : ""}`}
              tabIndex={0}
              onClick={() => onCard(a)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onCard(a);
              }}
            >
              <td className="whitespace-nowrap">
                <span className="agn-faixa-lista" style={{ background: corDoCard(a, tipos) }} aria-hidden />
                {a.hora}–{a.hora_fim}
              </td>
              <td>
                {a.paciente_nome}
                {a.confirmacao_respondida ? (
                  <Check className="inline h-4 w-4 ml-1 text-green-700" aria-label="confirmado" />
                ) : null}
                {a.eh_encaixe ? <span className="agn-selo-lista">encaixe</span> : null}
              </td>
              <td>{a.procedimentos.map((p) => p.nome).join(", ") || "—"}</td>
              <td>{a.convenio_nome ?? "—"}</td>
              <td>
                <span className={classeBadgeStatusAgendamento(a.status)}>{labelStatusAgendamento(a.status)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
