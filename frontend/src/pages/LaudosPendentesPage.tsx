import { useCallback, useEffect, useState } from "react";
import { FinalizarExameDialog } from "../components/FinalizarExameDialog";
import { PageHeader } from "../components/PageHeader";
import { ApiError, api, type ExamePendente } from "../lib/api";
import { formatDataBr } from "../lib/cobrancaFormat";
import { corMedicoAgenda } from "../lib/corMedicoAgenda";
import { useMessageBox } from "../lib/messageBoxContext";

/** Exames de horários finalizados que ainda não têm laudo (últimos 180 dias). */
export function LaudosPendentesPage() {
  const msg = useMessageBox();
  const [lista, setLista] = useState<ExamePendente[] | null>(null);
  const [abrindo, setAbrindo] = useState<number | null>(null);

  const carregar = useCallback(async () => {
    try {
      const { pendentes } = await api.agendamentosExamesPendentes();
      setLista(pendentes);
    } catch (e) {
      setLista([]);
      void msg.error(e instanceof ApiError ? e.message : "Erro ao carregar laudos pendentes");
    }
  }, [msg]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  return (
    <div className="page-stack">
      <PageHeader
        title="Laudos pendentes"
        subtitle="Exames de atendimentos finalizados sem resultado anexado (últimos 180 dias)"
      />
      <div className="p-4">
        {lista == null ? (
          <p className="text-sm text-[var(--muted)]">Carregando…</p>
        ) : lista.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Nenhum laudo pendente.</p>
        ) : (
          <div className="dup-table-wrap min-w-0">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Hora</th>
                  <th>Paciente</th>
                  <th>Médico</th>
                  <th>Exames sem laudo</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lista.map((p) => (
                  <tr key={p.agendamento_id}>
                    <td>{formatDataBr(p.data)}</td>
                    <td>{p.hora}</td>
                    <td className="font-medium">{p.paciente_nome}</td>
                    <td style={{ color: corMedicoAgenda(p.medico_id) }}>{p.medico_nome}</td>
                    <td>{p.exames.join(", ")}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        title="Anexar ou vincular o laudo de cada exame deste atendimento"
                        onClick={() => setAbrindo(p.agendamento_id)}
                      >
                        Anexar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {abrindo != null ? (
        <FinalizarExameDialog
          agendamentoId={abrindo}
          onClose={() => {
            setAbrindo(null);
            void carregar();
          }}
        />
      ) : null}
    </div>
  );
}
