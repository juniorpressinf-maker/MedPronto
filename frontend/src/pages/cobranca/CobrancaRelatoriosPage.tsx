import { FileText, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DataIsoInput } from "../../components/DataIsoInput";
import { ApiError, api, type CobrancaRelatorio } from "../../lib/api";
import { formatBRL, formatDataBr, hojeIso, labelFormaPagamento } from "../../lib/cobrancaFormat";
import { useMessageBox } from "../../lib/messageBoxContext";
import { CobrancaFaturamentoConvenioPanel } from "./CobrancaFaturamentoConvenioPanel";

function inicioMesIso(): string {
  const hoje = hojeIso();
  return `${hoje.slice(0, 8)}01`;
}

type Aba = "resumo" | "faturamento";

function RelatorioResumoPanel({
  de,
  ate,
  onDeChange,
  onAteChange,
}: {
  de: string;
  ate: string;
  onDeChange: (v: string) => void;
  onAteChange: (v: string) => void;
}) {
  const msg = useMessageBox();
  const [relatorio, setRelatorio] = useState<CobrancaRelatorio | null>(null);
  const [loading, setLoading] = useState(true);
  const [exportando, setExportando] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      setRelatorio(await api.cobrancaRelatorioGet(de, ate));
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro ao carregar relatório");
    } finally {
      setLoading(false);
    }
  }, [de, ate, msg]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const totalAFaturarTabela = useMemo(() => {
    if (!relatorio) return 0;
    return relatorio.por_convenio
      .filter((c) => c.convenio_tipo === "operadora")
      .reduce((s, c) => s + c.a_faturar_centavos, 0);
  }, [relatorio]);

  const exportarPdf = async () => {
    if (!relatorio) return;
    setExportando(true);
    try {
      await api.cobrancaRelatorioPdf(relatorio.de, relatorio.ate);
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro ao gerar PDF");
    } finally {
      setExportando(false);
    }
  };

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
      </div>

      {loading && !relatorio ? (
        <p className="text-sm text-[var(--muted)] m-0">Carregando…</p>
      ) : relatorio ? (
        <>
          <p className="text-sm text-[var(--muted)] m-0">
            Visão gerencial do período {formatDataBr(relatorio.de)} a {formatDataBr(relatorio.ate)}.
          </p>

          <div className="dup-resumo-grid dup-resumo-grid--dash">
            <div className="dup-resumo-card dup-resumo--paga dup-resumo-card--com-datas">
              <div className="dup-resumo-card__corpo">
                <div className="dup-resumo-card__label">Particular recebido</div>
                <div className="dup-resumo-card__valor">
                  {formatBRL(relatorio.resumo.arrecadado_centavos)}
                </div>
              </div>
            </div>
            <div className="dup-resumo-card dup-resumo--paga dup-resumo-card--com-datas">
              <div className="dup-resumo-card__corpo">
                <div className="dup-resumo-card__label">Convênio recebido</div>
                <div className="dup-resumo-card__valor">
                  {formatBRL(relatorio.resumo.recebido_convenio_centavos ?? 0)}
                </div>
              </div>
            </div>
            <div className="dup-resumo-card dup-resumo--futura dup-resumo-card--com-datas">
              <div className="dup-resumo-card__corpo">
                <div className="dup-resumo-card__label">Convênio a faturar</div>
                <div className="dup-resumo-card__valor">
                  {formatBRL(relatorio.resumo.a_faturar_centavos)}
                </div>
              </div>
            </div>
            <div className="dup-resumo-card dup-resumo--hoje dup-resumo-card--com-datas">
              <div className="dup-resumo-card__corpo">
                <div className="dup-resumo-card__label">Contas no período</div>
                <div className="dup-resumo-card__valor">{relatorio.resumo.contas_periodo}</div>
              </div>
            </div>
            <div className="dup-resumo-card dup-resumo--aberto dup-resumo-card--com-datas">
              <div className="dup-resumo-card__corpo">
                <div className="dup-resumo-card__label">Contas fechadas</div>
                <div className="dup-resumo-card__valor">{relatorio.resumo.contas_fechadas}</div>
              </div>
            </div>
          </div>

          <section>
            <h4 className="m-0 text-sm font-semibold mb-2">Por forma de pagamento</h4>
            {relatorio.por_forma.length === 0 ? (
              <p className="text-sm text-[var(--muted)] m-0">Nenhum pagamento particular no período.</p>
            ) : (
              <div className="dup-table-wrap">
                <table className="data-table data-table--compact">
                  <thead>
                    <tr>
                      <th>Forma</th>
                      <th className="text-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {relatorio.por_forma.map((f) => (
                      <tr key={f.forma}>
                        <td>{labelFormaPagamento(f.forma)}</td>
                        <td className="text-right font-semibold whitespace-nowrap">
                          {formatBRL(f.valor_centavos)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section>
            <h4 className="m-0 text-sm font-semibold mb-2">Por convênio (totais)</h4>
            {relatorio.por_convenio.length === 0 ? (
              <p className="text-sm text-[var(--muted)] m-0">Nenhuma conta no período.</p>
            ) : (
              <div className="dup-table-wrap">
                <table className="data-table data-table--compact">
                  <thead>
                    <tr>
                      <th>Convênio</th>
                      <th className="text-right">Contas</th>
                      <th className="text-right">Total itens</th>
                      <th className="text-right">Recebido</th>
                      <th className="text-right">A faturar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {relatorio.por_convenio.map((c) => (
                      <tr key={c.convenio_id ?? "part"}>
                        <td>{c.convenio_nome}</td>
                        <td className="text-right">{c.atendimentos}</td>
                        <td className="text-right whitespace-nowrap">
                          {formatBRL(c.total_itens_centavos)}
                        </td>
                        <td className="text-right whitespace-nowrap">
                          {formatBRL(c.arrecadado_centavos)}
                        </td>
                        <td className="text-right whitespace-nowrap">
                          {c.convenio_tipo === "operadora"
                            ? formatBRL(c.a_faturar_centavos)
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {totalAFaturarTabela > 0 ? (
                    <tfoot>
                      <tr>
                        <td colSpan={4} className="text-right font-semibold">
                          Total operadoras a faturar
                        </td>
                        <td className="text-right font-bold whitespace-nowrap">
                          {formatBRL(totalAFaturarTabela)}
                        </td>
                      </tr>
                    </tfoot>
                  ) : null}
                </table>
              </div>
            )}
          </section>

          <section>
            <h4 className="m-0 text-sm font-semibold mb-2">Por procedimento</h4>
            {relatorio.por_procedimento.length === 0 ? (
              <p className="text-sm text-[var(--muted)] m-0">Nenhum item no período.</p>
            ) : (
              <div className="dup-table-wrap">
                <table className="data-table data-table--compact">
                  <thead>
                    <tr>
                      <th>Procedimento</th>
                      <th className="text-right">Qtd</th>
                      <th className="text-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {relatorio.por_procedimento.map((p) => (
                      <tr key={p.procedimento_id}>
                        <td>{p.procedimento_nome}</td>
                        <td className="text-right">{p.quantidade}</td>
                        <td className="text-right font-semibold whitespace-nowrap">
                          {formatBRL(p.valor_centavos)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}

export function CobrancaRelatoriosPage() {
  const [aba, setAba] = useState<Aba>("faturamento");
  const [de, setDe] = useState(inicioMesIso);
  const [ate, setAte] = useState(hojeIso);

  return (
    <div className="est-card est-card--page flex flex-col min-h-0 w-full max-w-5xl">
      <div className="px-4 pt-4 border-b border-[var(--border)]">
        <h3 className="m-0 text-base font-semibold mb-3">Relatórios</h3>
        <nav className="flex flex-wrap gap-1 pb-0">
          <button
            type="button"
            className={`cc-aba cobranca-subnav__aba ${aba === "faturamento" ? "cc-aba--ativa" : ""}`}
            onClick={() => setAba("faturamento")}
          >
            Faturamento convênio
          </button>
          <button
            type="button"
            className={`cc-aba cobranca-subnav__aba ${aba === "resumo" ? "cc-aba--ativa" : ""}`}
            onClick={() => setAba("resumo")}
          >
            Resumo gerencial
          </button>
        </nav>
      </div>

      <div className="est-card--page__area scroll-interno scroll-interno--flex flex-1 min-h-0 p-4">
        {aba === "faturamento" ? (
          <CobrancaFaturamentoConvenioPanel
            de={de}
            ate={ate}
            onDeChange={setDe}
            onAteChange={setAte}
          />
        ) : (
          <RelatorioResumoPanel de={de} ate={ate} onDeChange={setDe} onAteChange={setAte} />
        )}
      </div>
    </div>
  );
}
