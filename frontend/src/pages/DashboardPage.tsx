import {
  Calendar,
  CalendarRange,
  LayoutDashboard,
  RefreshCw,
  Stethoscope,
  Users,
  Wallet,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { DataIsoInput } from "../components/DataIsoInput";
import { useAuth } from "../lib/authContext";
import { ApiError, api, type DashboardResponse } from "../lib/api";
import { labelFormaPagamento } from "../lib/cobrancaFormat";
import { useMessageBox } from "../lib/messageBoxContext";

function hojeIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function inicioMesIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function formatDataBr(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function formatBRL(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

type KpiCardProps = {
  label: string;
  valor: string | number;
  hint?: string;
  className?: string;
};

function KpiCard({ label, valor, hint, className = "" }: KpiCardProps) {
  return (
    <div className={`dup-resumo-card dup-resumo-card--com-datas ${className}`}>
      <div className="dup-resumo-card__corpo">
        <div className="dup-resumo-card__label">{label}</div>
        <div className="dup-resumo-card__valor">{valor}</div>
        {hint ? (
          <div className="dup-resumo-card__qtd text-xs opacity-90">{hint}</div>
        ) : null}
      </div>
    </div>
  );
}

function BarraRanking({ valor, max }: { valor: number; max: number }) {
  const pct = max > 0 ? Math.round((valor / max) * 100) : 0;
  return (
    <div className="dash-rank-bar" aria-hidden>
      <div className="dash-rank-bar__fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function DashboardPage() {
  const msg = useMessageBox();
  const { me } = useAuth();
  const [de, setDe] = useState(inicioMesIso);
  const [ate, setAte] = useState(hojeIso);
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.dashboard(de, ate);
      setData(r);
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro ao carregar dashboard");
    } finally {
      setLoading(false);
    }
  }, [de, ate, msg]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const maxMedico = useMemo(
    () => Math.max(...(data?.clinico.por_medico.map((m) => m.finalizados) ?? [0]), 1),
    [data],
  );
  const maxTipo = useMemo(
    () => Math.max(...(data?.clinico.por_tipo.map((t) => t.total) ?? [0]), 1),
    [data],
  );
  const maxConvAtend = useMemo(
    () =>
      Math.max(
        ...(data?.financeiro?.por_convenio.map((c) => c.atendimentos) ?? [0]),
        1,
      ),
    [data],
  );
  const maxConvArrec = useMemo(
    () =>
      Math.max(
        ...(data?.financeiro?.por_convenio.map((c) => c.arrecadado_centavos) ??
          [0]),
        1,
      ),
    [data],
  );

  const maxProcQtd = useMemo(
    () =>
      Math.max(
        ...(data?.financeiro?.top_procedimentos.map((p) => p.quantidade) ?? [0]),
        1,
      ),
    [data],
  );
  const maxFormaValor = useMemo(
    () =>
      Math.max(
        ...(data?.financeiro?.por_forma.map((f) => f.valor_centavos) ?? [0]),
        1,
      ),
    [data],
  );

  const totalAtendConvenio = useMemo(
    () =>
      (data?.financeiro?.por_convenio ?? []).reduce(
        (acc, c) => acc + c.atendimentos,
        0,
      ),
    [data],
  );
  const totalArrecConvenio = useMemo(
    () =>
      (data?.financeiro?.por_convenio ?? []).reduce(
        (acc, c) => acc + c.arrecadado_centavos,
        0,
      ),
    [data],
  );
  const totalRecebForma = useMemo(
    () =>
      (data?.financeiro?.por_forma ?? []).reduce(
        (acc, f) => acc + f.valor_centavos,
        0,
      ),
    [data],
  );

  const subtitulo =
    me?.perfil === "medico"
      ? "Visão do seu período — atendimentos e indicadores"
      : "Visão clínica e financeira da clínica";

  return (
    <div className="page-stack flex-1 min-h-0 overflow-hidden">
      <PageHeader title="Dashboard" subtitle={subtitulo} />
      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4 space-y-4">
        <div className="est-card est-card--painel p-4">
          <div className="flex flex-wrap items-end gap-3 justify-between">
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-sm block">
                <span className="font-medium flex items-center gap-1.5 mb-1">
                  <CalendarRange className="h-4 w-4" aria-hidden />
                  Início
                </span>
                <DataIsoInput
                  value={de}
                  max={ate}
                  onValueChange={setDe}
                />
              </label>
              <label className="text-sm block">
                <span className="font-medium mb-1 block">Fim</span>
                <DataIsoInput
                  value={ate}
                  min={de}
                  onValueChange={setAte}
                />
              </label>
              <button
                type="button"
                className="btn btn-primary"
                disabled={loading}
                onClick={() => void carregar()}
              >
                <RefreshCw
                  className={`inline h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`}
                  aria-hidden
                />
                Atualizar
              </button>
            </div>
            {data ? (
              <p className="text-sm text-[var(--muted)] m-0">
                Período: {formatDataBr(data.periodo.de)} —{" "}
                {formatDataBr(data.periodo.ate)}
              </p>
            ) : null}
          </div>
        </div>

        {loading && !data ? (
          <p className="text-sm text-[var(--muted)]">Carregando indicadores…</p>
        ) : data ? (
          <>
            <section className="dash-bloco est-card" aria-labelledby="dash-agenda">
              <h2 id="dash-agenda" className="dash-secao-titulo">
                <Calendar className="h-5 w-5" aria-hidden />
                Agenda — hoje
              </h2>
              <div className="dup-resumo-grid dup-resumo-grid--dash">
                <KpiCard
                  className="dup-resumo--hoje"
                  label="Agendamentos hoje"
                  valor={data.clinico.hoje.agendamentos}
                />
                <KpiCard
                  className="dup-resumo--paga"
                  label="Finalizados hoje"
                  valor={data.clinico.hoje.finalizados}
                />
                <KpiCard
                  className="dup-resumo--aberto"
                  label="Na sala de espera"
                  valor={data.clinico.hoje.na_fila}
                  hint="Presentes + em atendimento"
                />
              </div>
            </section>

            <section className="dash-bloco est-card" aria-labelledby="dash-clinico">
              <h2 id="dash-clinico" className="dash-secao-titulo">
                <LayoutDashboard className="h-5 w-5" aria-hidden />
                Clínico — período
              </h2>
              <div className="dup-resumo-grid dup-resumo-grid--dash">
                <KpiCard
                  className="dup-resumo--todos"
                  label="Agendamentos"
                  valor={data.clinico.totais.agendamentos}
                />
                <KpiCard
                  className="dup-resumo--paga"
                  label="Atendimentos finalizados"
                  valor={data.clinico.totais.finalizados}
                />
                <KpiCard
                  className="dup-resumo--aberto"
                  label="Aguardando / na fila"
                  valor={
                    data.clinico.totais.presentes +
                    data.clinico.totais.em_atendimento
                  }
                  hint={`${data.clinico.totais.agendados} ainda agendados`}
                />
                <KpiCard
                  className="dup-resumo--vencida"
                  label="Não compareceu"
                  valor={data.clinico.totais.nao_compareceu}
                />
                <KpiCard
                  className="dup-resumo--futura"
                  label="Taxa de comparecimento"
                  valor={
                    data.clinico.totais.taxa_comparecimento != null
                      ? `${data.clinico.totais.taxa_comparecimento}%`
                      : "—"
                  }
                  hint="Finalizados ÷ (finalizados + faltas)"
                />
                <KpiCard
                  className="dup-resumo--todos"
                  label="Pacientes novos"
                  valor={data.clinico.totais.pacientes_novos}
                  hint="Cadastros no período"
                />
                <KpiCard
                  className="dup-resumo--hoje"
                  label="Prontuários"
                  valor={data.clinico.totais.prontuarios}
                />
                <KpiCard
                  className="dup-resumo--futura"
                  label="Admissionais"
                  valor={data.clinico.totais.admissionais}
                />
                {data.clinico.whatsapp ? (
                  <KpiCard
                    className="dup-resumo--paga"
                    label="WhatsApp enviados"
                    valor={data.clinico.whatsapp.enviados}
                    hint={
                      data.clinico.whatsapp.erros > 0
                        ? `${data.clinico.whatsapp.erros} erro(s)`
                        : "Confirmações no período"
                    }
                  />
                ) : null}
              </div>

              <div className="dash-paineis-grid">
                <div className="est-card dash-painel-card min-h-0">
                  <h3 className="dash-painel-titulo">
                    <Stethoscope className="h-4 w-4" aria-hidden />
                    Médicos — atendimentos finalizados
                  </h3>
                  {data.clinico.por_medico.length === 0 ? (
                    <p className="text-sm text-[var(--muted)] mt-3">
                      Nenhum atendimento no período.
                    </p>
                  ) : (
                    <div className="dup-table-wrap mt-3 scroll-interno scroll-interno--md">
                      <table className="data-table dash-rank-table">
                        <thead>
                          <tr>
                            <th>Médico</th>
                            <th className="text-right w-16">Fin.</th>
                            <th className="text-right w-16">Total</th>
                            <th className="dash-rank-col-bar" aria-hidden />
                          </tr>
                        </thead>
                        <tbody>
                          {data.clinico.por_medico.map((m) => (
                            <tr key={m.medico_id}>
                              <td>{m.medico_nome}</td>
                              <td className="text-right font-semibold">
                                {m.finalizados}
                              </td>
                              <td className="text-right text-[var(--muted)]">
                                {m.total}
                              </td>
                              <td>
                                <BarraRanking
                                  valor={m.finalizados}
                                  max={maxMedico}
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="est-card dash-painel-card min-h-0">
                  <h3 className="dash-painel-titulo">
                    <Users className="h-4 w-4" aria-hidden />
                    Procedimentos
                  </h3>
                  {data.clinico.por_tipo.length === 0 ? (
                    <p className="text-sm text-[var(--muted)] mt-3">
                      Sem movimentação no período.
                    </p>
                  ) : (
                    <div className="dup-table-wrap mt-3">
                      <table className="data-table dash-rank-table">
                        <thead>
                          <tr>
                            <th>Procedimento</th>
                            <th className="text-right w-20">Qtd</th>
                            <th className="dash-rank-col-bar" aria-hidden />
                          </tr>
                        </thead>
                        <tbody>
                          {data.clinico.por_tipo.map((t) => (
                            <tr key={t.tipo}>
                              <td>{t.label}</td>
                              <td className="text-right font-semibold">
                                {t.total}
                              </td>
                              <td>
                                <BarraRanking valor={t.total} max={maxTipo} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </section>

            {data.cobranca_disponivel ? (
              <section className="dash-bloco est-card" aria-labelledby="dash-financeiro">
                <h2 id="dash-financeiro" className="dash-secao-titulo">
                  <Wallet className="h-5 w-5" aria-hidden />
                  Financeiro — período
                </h2>
                {data.financeiro ? (
                  <>
                    <div className="dup-resumo-grid dup-resumo-grid--dash">
                      <KpiCard
                        className="dup-resumo--paga"
                        label="Arrecadado"
                        valor={formatBRL(data.financeiro.arrecadado_centavos)}
                        hint="Pagamentos registrados"
                      />
                      <KpiCard
                        className="dup-resumo--aberto"
                        label="Contas em aberto"
                        valor={data.financeiro.contas_abertas}
                        hint="Cada horário é uma conta"
                      />
                      <KpiCard
                        className="dup-resumo--hoje"
                        label="Contas fechadas"
                        valor={data.financeiro.contas_fechadas}
                        hint="Contas, não pacientes"
                      />
                      <KpiCard
                        className="dup-resumo--futura"
                        label="A faturar (convênio)"
                        valor={formatBRL(data.financeiro.a_faturar_centavos)}
                        hint="Operadoras — sem recebimento em caixa"
                      />
                    </div>

                    <div className="dash-paineis-grid">
                      <div className="est-card dash-painel-card">
                        <h3 className="dash-painel-titulo">
                          Top 10 procedimentos (cobrança)
                        </h3>
                        {!data.financeiro.top_procedimentos.length ? (
                          <p className="text-sm text-[var(--muted)] mt-3">
                            Nenhum item de cobrança no período.
                          </p>
                        ) : (
                          <div className="dup-table-wrap mt-3 scroll-interno scroll-interno--md">
                            <table className="data-table dash-rank-table">
                              <thead>
                                <tr>
                                  <th>Procedimento</th>
                                  <th className="text-right w-16">Qtd</th>
                                  <th className="dash-rank-col-bar" aria-hidden />
                                </tr>
                              </thead>
                              <tbody>
                                {data.financeiro.top_procedimentos.map((p) => (
                                  <tr key={p.procedimento_id}>
                                    <td>{p.procedimento_nome}</td>
                                    <td className="text-right font-semibold">
                                      {p.quantidade}
                                    </td>
                                    <td>
                                      <BarraRanking
                                        valor={p.quantidade}
                                        max={maxProcQtd}
                                      />
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>

                      <div className="est-card dash-painel-card">
                        <h3 className="dash-painel-titulo">
                          <span>Contas por convênio</span>
                          <span className="dash-painel-titulo__total">
                            {totalAtendConvenio}
                          </span>
                        </h3>
                        {data.financeiro.por_convenio.length === 0 ? (
                          <p className="text-sm text-[var(--muted)] mt-3">
                            Nenhuma conta no período. Cadastros e fechamentos
                            em Cobrança (M1+).
                          </p>
                        ) : (
                          <div className="dup-table-wrap mt-3 scroll-interno scroll-interno--md">
                            <table className="data-table dash-rank-table">
                              <thead>
                                <tr>
                                  <th>Convênio</th>
                                  <th className="text-right w-16">Qtd</th>
                                  <th className="dash-rank-col-bar" aria-hidden />
                                </tr>
                              </thead>
                              <tbody>
                                {data.financeiro.por_convenio.map((c) => (
                                  <tr
                                    key={c.convenio_id ?? `c-${c.convenio_nome}`}
                                  >
                                    <td>{c.convenio_nome}</td>
                                    <td className="text-right font-semibold">
                                      {c.atendimentos}
                                    </td>
                                    <td>
                                      <BarraRanking
                                        valor={c.atendimentos}
                                        max={maxConvAtend}
                                      />
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>

                      <div className="est-card dash-painel-card">
                        <h3 className="dash-painel-titulo">
                          <span>Arrecadado</span>
                          <span className="dash-painel-titulo__total">
                            {formatBRL(totalArrecConvenio)}
                          </span>
                        </h3>
                        {data.financeiro.por_convenio.every(
                          (c) => c.arrecadado_centavos === 0,
                        ) ? (
                          <p className="text-sm text-[var(--muted)] mt-3">
                            Nenhum pagamento registrado no período.
                          </p>
                        ) : (
                          <div className="dup-table-wrap mt-3 scroll-interno scroll-interno--md">
                            <table className="data-table dash-rank-table">
                              <thead>
                                <tr>
                                  <th>Convênio</th>
                                  <th className="text-right">Valor</th>
                                  <th className="dash-rank-col-bar" aria-hidden />
                                </tr>
                              </thead>
                              <tbody>
                                {data.financeiro.por_convenio
                                  .filter((c) => c.arrecadado_centavos > 0)
                                  .map((c) => (
                                    <tr
                                      key={`a-${c.convenio_id ?? c.convenio_nome}`}
                                    >
                                      <td>{c.convenio_nome}</td>
                                      <td className="text-right font-semibold whitespace-nowrap">
                                        {formatBRL(c.arrecadado_centavos)}
                                      </td>
                                      <td>
                                        <BarraRanking
                                          valor={c.arrecadado_centavos}
                                          max={maxConvArrec}
                                        />
                                      </td>
                                    </tr>
                                  ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>

                      <div className="est-card dash-painel-card">
                        <h3 className="dash-painel-titulo">
                          <span>Recebimentos</span>
                          <span className="dash-painel-titulo__total">
                            {formatBRL(totalRecebForma)}
                          </span>
                        </h3>
                        {data.financeiro.por_forma.length === 0 ? (
                          <p className="text-sm text-[var(--muted)] mt-3">
                            Nenhum pagamento registrado no período.
                          </p>
                        ) : (
                          <div className="dup-table-wrap mt-3 scroll-interno scroll-interno--md">
                            <table className="data-table dash-rank-table">
                              <thead>
                                <tr>
                                  <th>Forma</th>
                                  <th className="text-right">Valor</th>
                                  <th className="dash-rank-col-bar" aria-hidden />
                                </tr>
                              </thead>
                              <tbody>
                                {data.financeiro.por_forma.map((f) => (
                                  <tr key={f.forma}>
                                    <td>{labelFormaPagamento(f.forma)}</td>
                                    <td className="text-right font-semibold whitespace-nowrap">
                                      {formatBRL(f.valor_centavos)}
                                    </td>
                                    <td>
                                      <BarraRanking
                                        valor={f.valor_centavos}
                                        max={maxFormaValor}
                                      />
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                ) : null}
              </section>
            ) : (
              <section className="dash-bloco est-card">
                <h2 className="dash-secao-titulo">
                  <Wallet className="h-5 w-5" aria-hidden />
                  Financeiro — período
                </h2>
                <p className="text-sm text-[var(--text-2)] m-0 border-l-4 border-[var(--muted)] pl-3">
                  Indicadores financeiros (convênio, arrecadação, caixa)
                  aparecem na edição <strong>Clínico + Cobrança</strong>, após
                  cadastro de contas e pagamentos.
                </p>
              </section>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
