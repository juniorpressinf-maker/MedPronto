import { FileText, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { DataIsoInput } from "../../components/DataIsoInput";
import {
  ApiError,
  api,
  type CobrancaConvenio,
  type RelatorioFaturamentoConvenio,
} from "../../lib/api";
import { cobrancaReturnPath, linkCobrancaConta } from "../../lib/cobrancaContaNav";
import { formatBRL, formatDataBr, labelHoraConta, labelStatusCobranca } from "../../lib/cobrancaFormat";
import { useMessageBox } from "../../lib/messageBoxContext";

type Props = {
  de: string;
  ate: string;
  onDeChange: (v: string) => void;
  onAteChange: (v: string) => void;
};

export function CobrancaFaturamentoConvenioPanel({ de, ate, onDeChange, onAteChange }: Props) {
  const msg = useMessageBox();
  const [convenioId, setConvenioId] = useState("");
  const [convenios, setConvenios] = useState<CobrancaConvenio[]>([]);
  const [relatorio, setRelatorio] = useState<RelatorioFaturamentoConvenio | null>(null);
  const [loading, setLoading] = useState(true);
  const [exportando, setExportando] = useState(false);

  useEffect(() => {
    void api
      .cobrancaConveniosList(false)
      .then((lista) => setConvenios(lista.filter((c) => c.tipo === "operadora" && c.ativo === 1)))
      .catch(() => undefined);
  }, []);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      setRelatorio(
        await api.cobrancaFaturamentoConvenioGet(
          de,
          ate,
          convenioId ? Number(convenioId) : undefined,
        ),
      );
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }, [de, ate, convenioId, msg]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const exportarPdf = async () => {
    if (!relatorio) return;
    setExportando(true);
    try {
      await api.cobrancaFaturamentoConvenioPdf(
        de,
        ate,
        convenioId ? Number(convenioId) : undefined,
      );
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro ao gerar PDF");
    } finally {
      setExportando(false);
    }
  };

  const returnPath = cobrancaReturnPath("/cobranca/relatorios", {});

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-end">
        <label className="text-sm flex items-center gap-2">
          <span className="font-medium">De</span>
          <DataIsoInput value={de} onValueChange={onDeChange} />
        </label>
        <label className="text-sm flex items-center gap-2">
          <span className="font-medium">Até</span>
          <DataIsoInput value={ate} onValueChange={onAteChange} />
        </label>
        <label className="text-sm flex flex-col gap-1 min-w-[12rem]">
          <span className="font-medium">Convênio</span>
          <select
            className="legacy-input"
            value={convenioId}
            onChange={(e) => setConvenioId(e.target.value)}
          >
            <option value="">Todos (operadoras)</option>
            {convenios.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={loading}
          onClick={() => void carregar()}
          aria-label="Atualizar"
        >
          <RefreshCw className={`inline h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden />
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm inline-flex items-center gap-1"
          disabled={!relatorio || loading || exportando}
          onClick={() => void exportarPdf()}
        >
          <FileText className="h-4 w-4" aria-hidden />
          {exportando ? "Gerando…" : "Exportar PDF"}
        </button>
        <Link
          to="/cobranca/receber-convenios"
          className="btn btn-secondary btn-sm no-underline"
          state={{ de, ate, convenioId }}
        >
          Receber convênios
        </Link>
      </div>

      {loading && !relatorio ? (
        <p className="text-sm text-[var(--muted)] m-0">Carregando…</p>
      ) : relatorio ? (
        <>
          <p className="text-sm text-[var(--muted)] m-0">
            {relatorio.qtd_contas} atendimento(s) · Total{" "}
            <strong>{formatBRL(relatorio.total_liquido_centavos)}</strong>
            {relatorio.convenio_nome ? ` · ${relatorio.convenio_nome}` : " · todas as operadoras"}
          </p>

          {relatorio.grupos.length === 0 ? (
            <p className="text-sm m-0">Nenhuma conta de convênio no período.</p>
          ) : (
            relatorio.grupos.map((grupo) => (
              <section key={grupo.convenio_id} className="space-y-2">
                <h4 className="m-0 text-sm font-semibold flex flex-wrap gap-x-2 items-baseline">
                  <span>{grupo.convenio_nome}</span>
                  <span className="font-normal text-[var(--muted)]">
                    {grupo.contas.length} conta(s) · {formatBRL(grupo.total_liquido_centavos)}
                  </span>
                </h4>
                <div className="dup-table-wrap">
                  <table className="data-table data-table--compact">
                    <thead>
                      <tr>
                        <th>Data</th>
                        <th>Hora</th>
                        <th>Paciente</th>
                        <th>Procedimentos</th>
                        <th>Guia</th>
                        <th>Status</th>
                        <th className="text-right">Valor</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {grupo.contas.map((c) => (
                        <tr key={c.conta_id}>
                          <td className="whitespace-nowrap">{formatDataBr(c.data)}</td>
                          <td className="whitespace-nowrap">{labelHoraConta(c.agendamento_hora)}</td>
                          <td>{c.paciente_nome}</td>
                          <td className="text-sm max-w-[14rem]">
                            {c.itens.length === 0 ? (
                              <span className="text-[var(--muted)]">—</span>
                            ) : (
                              c.itens.map((i) => (
                                <span key={`${c.conta_id}-${i.procedimento_nome}`} className="block">
                                  {i.procedimento_nome}
                                  {i.quantidade > 1 ? ` ×${i.quantidade}` : ""}
                                </span>
                              ))
                            )}
                          </td>
                          <td className="text-sm">
                            {c.numero_guia?.trim() || "—"}
                            {c.senha ? (
                              <span className="block text-[var(--muted)] text-xs">
                                Senha: {c.senha}
                              </span>
                            ) : null}
                          </td>
                          <td className="text-sm whitespace-nowrap">
                            {labelStatusCobranca(c.status)}
                          </td>
                          <td className="text-right font-medium whitespace-nowrap">
                            {formatBRL(c.total_liquido_centavos)}
                          </td>
                          <td className="text-right">
                            <Link
                              to={linkCobrancaConta(c.conta_id, returnPath, "Voltar ao relatório")}
                              className="btn btn-secondary btn-sm text-xs no-underline"
                            >
                              Conta
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))
          )}
        </>
      ) : null}
    </div>
  );
}
