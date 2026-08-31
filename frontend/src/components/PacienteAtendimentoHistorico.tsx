import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  api,
  type PacienteAtendimentoHistoricoItem,
} from "../lib/api";
import {
  classeBadgeStatusAgendamento,
  classeLinhaStatusAgendamento,
  labelStatusAgendamento,
} from "../lib/agendamentoStatus";
import { useMessageBox } from "../lib/messageBoxContext";
import "../admissional-aso.css";

type Props = {
  pacienteId: number;
};

function formatDataBr(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function formatHora(hora: string): string {
  const t = hora.trim();
  return t.length >= 5 ? t.slice(0, 5) : t || "—";
}

function nomesProcedimento(item: PacienteAtendimentoHistoricoItem): string {
  const nomes = (item.procedimentos ?? [])
    .map((p) => p.nome.trim())
    .filter(Boolean);
  if (nomes.length) return nomes.join(", ");
  const unico = item.procedimento_nome?.trim();
  return unico || "—";
}

export function PacienteAtendimentoHistorico({ pacienteId }: Props) {
  const msg = useMessageBox();
  const [itens, setItens] = useState<PacienteAtendimentoHistoricoItem[]>([]);
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await api.agendamentosHistoricoPaciente(pacienteId);
      setItens(rows);
    } catch (e) {
      void msg.error(
        e instanceof ApiError
          ? e.message
          : "Erro ao carregar histórico de atendimento",
      );
    } finally {
      setLoading(false);
    }
  }, [pacienteId, msg]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  return (
    <section
      className="paciente-admissional-historico"
      aria-label="Histórico de atendimento"
    >
      <div className="paciente-admissional-historico__corpo">
        {loading ? (
          <p className="data-table__empty m-0">Carregando atendimentos…</p>
        ) : itens.length === 0 ? (
          <p className="data-table__empty m-0">
            Nenhum atendimento registrado para este paciente.
          </p>
        ) : (
          <div className="dup-table-wrap dup-table-wrap--scroll-y panel panel-table paciente-admissional-historico__tabela">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Horário</th>
                  <th>Médico</th>
                  <th>Procedimento</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((item) => (
                  <tr
                    key={item.id}
                    className={classeLinhaStatusAgendamento(item.status)}
                  >
                    <td>{formatDataBr(item.data)}</td>
                    <td>{formatHora(item.hora)}</td>
                    <td>{item.medico_nome?.trim() || "—"}</td>
                    <td>{nomesProcedimento(item)}</td>
                    <td>
                      <span className={classeBadgeStatusAgendamento(item.status)}>
                        {labelStatusAgendamento(item.status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
