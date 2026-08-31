import { useCallback, useEffect, useState } from "react";
import { AtendimentoCardTitulo } from "./AtendimentoCardTitulo";
import { VoltarButton } from "./VoltarButton";
import { ApiError, api, type CobrancaContaDetalhe, type CobrancaProcedimento } from "../lib/api";
import { labelStatusCobranca } from "../lib/cobrancaFormat";
import {
  adicionarItemComConfirmacaoDuplicata,
  UserCancelledError,
} from "../lib/cobrancaItemAdd";
import { useMessageBox } from "../lib/messageBoxContext";

type Props = {
  prontuarioId: number;
  pacienteNome: string;
  mostrarValores: boolean;
  somenteLeitura?: boolean;
  onVoltar: () => void;
};

export function AtendimentoCobrancaPanel({
  prontuarioId,
  pacienteNome,
  mostrarValores,
  somenteLeitura = false,
  onVoltar,
}: Props) {
  const msg = useMessageBox();
  const [conta, setConta] = useState<CobrancaContaDetalhe | null>(null);
  const [semConta, setSemConta] = useState(false);
  const [procedimentos, setProcedimentos] = useState<CobrancaProcedimento[]>([]);
  const [procId, setProcId] = useState("");
  const [observacao, setObservacao] = useState("");
  const [loading, setLoading] = useState(true);
  const [incluindo, setIncluindo] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    setSemConta(false);
    try {
      const [c, procs] = await Promise.all([
        api.cobrancaContaPorProntuario(prontuarioId),
        api.cobrancaProcedimentosList(undefined, false),
      ]);
      setConta(c);
      setProcedimentos(procs.filter((p) => p.ativo === 1));
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        setConta(null);
        setSemConta(true);
        try {
          const procs = await api.cobrancaProcedimentosList(undefined, false);
          setProcedimentos(procs.filter((p) => p.ativo === 1));
        } catch {
          setProcedimentos([]);
        }
      } else {
        await msg.error(e instanceof Error ? e.message : "Erro ao carregar cobrança");
      }
    } finally {
      setLoading(false);
    }
  }, [prontuarioId, msg]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const incluir = async () => {
    if (!conta || !procId) return;
    setIncluindo(true);
    try {
      const atualizada = await adicionarItemComConfirmacaoDuplicata(
        msg.confirm,
        conta.id,
        {
          procedimento_id: Number(procId),
          observacao: observacao.trim() || undefined,
        },
        {
          conta,
          procedimentoNome: procedimentos.find((p) => p.id === Number(procId))?.nome,
        },
      );
      setConta(atualizada);
      setProcId("");
      setObservacao("");
    } catch (e) {
      if (e instanceof UserCancelledError) return;
      await msg.error(e instanceof Error ? e.message : "Erro ao solicitar procedimento");
    } finally {
      setIncluindo(false);
    }
  };

  const itensVisiveis = (conta?.itens ?? []).filter((i) => i.status !== "cancelado");

  return (
    <div className="prontuario-secao space-y-4">
      <AtendimentoCardTitulo
        titulo="Procedimentos / cobrança"
        pacienteNome={pacienteNome}
      />

      {loading ? (
        <p className="text-sm text-[var(--muted)]">Carregando…</p>
      ) : semConta ? (
        <p className="text-sm" role="status">
          Conta ainda não aberta na recepção. Peça check-in para incluir procedimentos
          na cobrança.
        </p>
      ) : conta ? (
        <>
          <p className="text-sm text-[var(--muted)]">
            Solicite procedimentos para a recepção registrar valores e pagamento.
            {!mostrarValores ? " Valores não são exibidos no perfil médico." : null}
          </p>

          <div className="overflow-x-auto">
            <table className="legacy-table w-full text-sm">
              <thead>
                <tr>
                  <th>Procedimento</th>
                  <th>Status</th>
                  <th>Resultado</th>
                  {mostrarValores ? <th className="text-right">Valor</th> : null}
                  <th>Obs.</th>
                </tr>
              </thead>
              <tbody>
                {itensVisiveis.length === 0 ? (
                  <tr>
                    <td colSpan={mostrarValores ? 5 : 4} className="text-[var(--muted)]">
                      Nenhum procedimento na conta.
                    </td>
                  </tr>
                ) : (
                  itensVisiveis.map((item) => (
                    <tr key={item.id}>
                      <td>{item.procedimento_nome ?? "—"}</td>
                      <td>{labelStatusCobranca(item.status)}</td>
                      <td>
                        {item.exame_anexo_id ? (
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm p-0 min-h-0 border-0 bg-transparent underline"
                            onClick={() =>
                              void api.exameArquivo(item.exame_anexo_id!).catch((e) =>
                                msg.error(
                                  e instanceof ApiError ? e.message : "Erro ao abrir",
                                ),
                              )
                            }
                          >
                            {item.exame_nome ?? "Ver PDF"}
                          </button>
                        ) : (
                          "—"
                        )}
                      </td>
                      {mostrarValores ? (
                        <td className="text-right">
                          {((item.valor_centavos * item.quantidade) / 100).toLocaleString(
                            "pt-BR",
                            { style: "currency", currency: "BRL" },
                          )}
                        </td>
                      ) : null}
                      <td>{item.observacao?.trim() || "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {!somenteLeitura ? (
            <div className="flex flex-wrap items-end gap-2 pt-2 border-t border-[var(--border)]">
              <label className="flex flex-col gap-1 text-sm min-w-[14rem]">
                <span className="font-medium">Procedimento</span>
                <select
                  className="legacy-input"
                  value={procId}
                  disabled={incluindo}
                  onChange={(e) => setProcId(e.target.value)}
                >
                  <option value="">Selecione…</option>
                  {procedimentos.map((p) => (
                    <option key={p.id} value={String(p.id)}>
                      {p.nome}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm flex-1 min-w-[12rem]">
                <span className="font-medium">Observação (opcional)</span>
                <input
                  type="text"
                  className="legacy-input"
                  maxLength={500}
                  value={observacao}
                  disabled={incluindo}
                  onChange={(e) => setObservacao(e.target.value)}
                />
              </label>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={!procId || incluindo}
                onClick={() => void incluir()}
              >
                {incluindo ? "Incluindo…" : "Solicitar"}
              </button>
            </div>
          ) : null}
        </>
      ) : null}

      <div className="pt-2">
        <VoltarButton className="btn btn-primary btn-sm" onClick={onVoltar}>
          Voltar ao prontuário
        </VoltarButton>
      </div>
    </div>
  );

}
