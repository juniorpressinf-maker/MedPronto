import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { DataIsoInput } from "../../components/DataIsoInput";
import { ApiError, api, type CobrancaCaixaDoDia } from "../../lib/api";
import { isDataIsoValida } from "../../lib/dataIso";
import { cobrancaReturnPath, linkCobrancaConta } from "../../lib/cobrancaContaNav";
import {
  classeBotaoContaAgendamento,
  formatBRL,
  formatDataBr,
  hojeIso,
  labelBotaoContaAgendamento,
  labelFormaPagamento,
  labelHoraConta,
  labelStatusCobranca,
} from "../../lib/cobrancaFormat";
import { useMessageBox } from "../../lib/messageBoxContext";

export function CobrancaCaixaPage() {
  const msg = useMessageBox();
  const [searchParams] = useSearchParams();
  const dataUrl = searchParams.get("data");
  const dataInicial =
    dataUrl && isDataIsoValida(dataUrl) ? dataUrl : hojeIso();
  const [data, setData] = useState(dataInicial);
  const [caixa, setCaixa] = useState<CobrancaCaixaDoDia | null>(null);
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      setCaixa(await api.cobrancaCaixaGet(data));
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro ao carregar caixa");
    } finally {
      setLoading(false);
    }
  }, [data, msg]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    const d = searchParams.get("data");
    if (d && isDataIsoValida(d) && d !== data) {
      setData(d);
    }
  }, [searchParams, data]);

  const returnPath = cobrancaReturnPath("/cobranca/caixa", { data });

  return (
    <div className="est-card est-card--page cobranca-dia-card flex flex-col min-h-0 w-full">
      <div className="toolbar cad-toolbar px-4 pt-4 flex-wrap gap-2">
        <h3 className="m-0 text-base font-semibold flex-1">Caixa do dia</h3>
        <label className="text-sm flex items-center gap-2">
          <span className="font-medium">Data</span>
          <DataIsoInput value={data} onValueChange={setData} />
        </label>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => void carregar()}>
          <RefreshCw className={`inline h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden />
        </button>
      </div>

      <div className="est-card--page__area scroll-interno scroll-interno--flex flex-1 min-h-0 p-4 space-y-4">
        {loading && !caixa ? (
          <p className="text-sm text-[var(--muted)] m-0">Carregando…</p>
        ) : caixa ? (
          <>
            <div className="dup-resumo-grid dup-resumo-grid--dash">
              <div className="dup-resumo-card dup-resumo--aberto dup-resumo-card--com-datas">
                <div className="dup-resumo-card__corpo">
                  <div className="dup-resumo-card__label">Em aberto</div>
                  <div className="dup-resumo-card__valor">{caixa.totais.em_aberto}</div>
                </div>
              </div>
              <div className="dup-resumo-card dup-resumo--vencida dup-resumo-card--com-datas">
                <div className="dup-resumo-card__corpo">
                  <div className="dup-resumo-card__label">Saldo pendente</div>
                  <div className="dup-resumo-card__valor">
                    {formatBRL(caixa.totais.saldo_pendente_centavos)}
                  </div>
                </div>
              </div>
              <div className="dup-resumo-card dup-resumo--paga dup-resumo-card--com-datas">
                <div className="dup-resumo-card__corpo">
                  <div className="dup-resumo-card__label">Arrecadado</div>
                  <div className="dup-resumo-card__valor">
                    {formatBRL(caixa.totais.arrecadado_centavos)}
                  </div>
                </div>
              </div>
              <div className="dup-resumo-card dup-resumo--hoje dup-resumo-card--com-datas">
                <div className="dup-resumo-card__corpo">
                  <div className="dup-resumo-card__label">Fechadas</div>
                  <div className="dup-resumo-card__valor">{caixa.totais.fechadas}</div>
                </div>
              </div>
              <div className="dup-resumo-card dup-resumo--futura dup-resumo-card--com-datas">
                <div className="dup-resumo-card__corpo">
                  <div className="dup-resumo-card__label">A faturar convênio</div>
                  <div className="dup-resumo-card__valor">
                    {caixa.totais.a_faturar_qtd} · {formatBRL(caixa.totais.a_faturar_centavos)}
                  </div>
                </div>
              </div>
            </div>

            {caixa.por_forma.length > 0 ? (
              <section>
                <h4 className="m-0 text-sm font-semibold mb-2">Totais por forma de pagamento</h4>
                <div className="dup-table-wrap">
                  <table className="data-table data-table--compact">
                    <thead>
                      <tr>
                        <th>Forma</th>
                        <th className="text-right">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {caixa.por_forma.map((f) => (
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
              </section>
            ) : null}

            <section>
              <h4 className="m-0 text-sm font-semibold mb-2">
                Contas de {formatDataBr(caixa.data)}
              </h4>
              {caixa.contas.length === 0 ? (
                <p className="text-sm text-[var(--muted)] m-0">
                  Nenhuma conta em {formatDataBr(data)}.
                </p>
              ) : (
                <div className="dup-table-wrap">
                  <table className="data-table cobranca-dia-table">
                    <thead>
                      <tr>
                        <th className="cobranca-dia-hora">Hora</th>
                        <th className="cobranca-dia-nome">Paciente</th>
                        <th className="cobranca-dia-procs">Procedimentos</th>
                        <th className="cobranca-dia-conv">Convênio</th>
                        <th className="cobranca-dia-status">Status</th>
                        <th className="cobranca-dia-num text-right">Líquido</th>
                        <th className="cobranca-dia-num text-right">Pago</th>
                        <th className="cobranca-dia-num text-right">Saldo</th>
                        <th className="cobranca-dia-acao" />
                      </tr>
                    </thead>
                    <tbody>
                      {caixa.contas.map((c) => (
                        <tr
                          key={c.id}
                          className={c.qtd_itens === 0 ? "bg-amber-50" : undefined}
                        >
                          <td className="cobranca-dia-hora">
                            {labelHoraConta(c.agendamento_hora)}
                          </td>
                          <td className="cobranca-dia-nome">
                            {c.paciente_nome}
                            {c.qtd_itens === 0 ? (
                              <span className="block text-xs text-amber-900">
                                Sem procedimentos
                              </span>
                            ) : null}
                          </td>
                          <td className="cobranca-dia-procs text-sm">
                            <span className="cobranca-dia-procs__txt">
                              {c.procedimentos_nomes?.trim() || (
                                <span className="text-[var(--muted)]">—</span>
                              )}
                            </span>
                          </td>
                          <td className="cobranca-dia-conv">{c.convenio_nome ?? "—"}</td>
                          <td className="cobranca-dia-status">
                            {labelStatusCobranca(c.status)}
                          </td>
                          <td className="cobranca-dia-num text-right">
                            {formatBRL(c.total_liquido_centavos)}
                          </td>
                          <td className="cobranca-dia-num text-right">
                            {formatBRL(c.total_pago_centavos)}
                          </td>
                          <td
                            className={`cobranca-dia-num text-right font-medium ${
                              c.saldo_pendente_centavos > 0 ? "text-amber-800" : ""
                            }`}
                          >
                            {formatBRL(c.saldo_pendente_centavos)}
                          </td>
                          <td className="cobranca-dia-acao">
                            <Link
                              to={linkCobrancaConta(c.id, returnPath, "Voltar ao caixa")}
                              className={classeBotaoContaAgendamento(c.status, "no-underline")}
                            >
                              {labelBotaoContaAgendamento(c.status)}
                            </Link>
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
    </div>
  );
}
