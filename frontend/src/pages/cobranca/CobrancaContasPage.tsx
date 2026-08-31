import { Plus, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { DataIsoInput } from "../../components/DataIsoInput";
import {
  ApiError,
  api,
  type CobrancaContaDetalhe,
  type CobrancaContaResumo,
  type CobrancaConvenio,
  type CobrancaItemStatus,
  type CobrancaProcedimento,
  type Paciente,
} from "../../lib/api";
import { cobrancaReturnPath, linkCobrancaConta } from "../../lib/cobrancaContaNav";
import { isDataIsoValida } from "../../lib/dataIso";
import {
  setCadastroReturn,
  takeCadastroReturn,
} from "../../lib/cadastroReturn";
import { loadScreenState } from "../../lib/screenState";
import { formatBRL, formatDataBr, hojeIso, labelHoraConta, labelStatusCobranca } from "../../lib/cobrancaFormat";
import {
  adicionarItemComConfirmacaoDuplicata,
  UserCancelledError,
} from "../../lib/cobrancaItemAdd";
import { useMessageBox } from "../../lib/messageBoxContext";

const ABRIR_CONTA_SCOPE = "cobranca:abrir-conta";

const STATUS_ITEM_OPCOES: CobrancaItemStatus[] = [
  "previsto",
  "solicitado",
  "realizado",
];

export function CobrancaContasPage() {
  const msg = useMessageBox();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const dataUrl = searchParams.get("data");
  const dataInicial =
    dataUrl && isDataIsoValida(dataUrl) ? dataUrl : hojeIso();
  const [data, setData] = useState(dataInicial);
  const [lista, setLista] = useState<CobrancaContaResumo[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState(false);
  const [pacientes, setPacientes] = useState<Paciente[]>([]);
  const [convenios, setConvenios] = useState<CobrancaConvenio[]>([]);
  const [procedimentos, setProcedimentos] = useState<CobrancaProcedimento[]>([]);
  const [selPaciente, setSelPaciente] = useState("");
  const [selConvenio, setSelConvenio] = useState<number | "">("");
  const [conta, setConta] = useState<CobrancaContaDetalhe | null>(null);
  const [procSelectKey, setProcSelectKey] = useState(0);
  const [abrindo, setAbrindo] = useState(false);
  const [busy, setBusy] = useState(false);
  const abrirSeq = useRef(0);
  const selConvenioRef = useRef(selConvenio);
  selConvenioRef.current = selConvenio;

  const cobrancaReturn = cobrancaReturnPath("/cobranca/contas", { data });

  useEffect(() => {
    const d = searchParams.get("data");
    if (d && isDataIsoValida(d) && d !== data) {
      setData(d);
    }
  }, [searchParams, data]);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      setLista(await api.cobrancaContasList(data));
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }, [data, msg]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    const ret = takeCadastroReturn("pacientes");
    if (!ret || ret.returnPath !== "/cobranca/contas") return;
    const saved = loadScreenState<{ paciente_id?: string }>(ABRIR_CONTA_SCOPE);
    if (saved?.paciente_id) {
      setSelPaciente(saved.paciente_id);
    }
    setDialog(true);
  }, []);

  useEffect(() => {
    if (!dialog) return;
    void api.pacientesList().then(setPacientes).catch(() => undefined);
    void api.cobrancaConveniosList(false).then(setConvenios).catch(() => undefined);
    void api.cobrancaProcedimentosList(undefined, false).then(setProcedimentos).catch(() => undefined);
  }, [dialog]);

  useEffect(() => {
    if (!dialog || !selPaciente) {
      setConta(null);
      return;
    }

    const seq = ++abrirSeq.current;
    setAbrindo(true);
    void api
      .cobrancaContaAbrir({
        paciente_id: Number(selPaciente),
        data,
        convenio_id: selConvenioRef.current
          ? Number(selConvenioRef.current)
          : undefined,
      })
      .then((c) => {
        if (abrirSeq.current !== seq) return;
        setConta(c);
        setSelConvenio(c.convenio_id ?? "");
      })
      .catch((e) => {
        if (abrirSeq.current !== seq) return;
        setConta(null);
        void msg.error(e instanceof ApiError ? e.message : "Erro ao abrir conta");
      })
      .finally(() => {
        if (abrirSeq.current === seq) setAbrindo(false);
      });
  }, [dialog, selPaciente, data, msg]);

  const fecharDialog = () => {
    abrirSeq.current += 1;
    setDialog(false);
    setSelPaciente("");
    setSelConvenio("");
    setConta(null);
    setProcSelectKey((k) => k + 1);
    void carregar();
  };

  const irNovoPaciente = () => {
    setCadastroReturn({
      returnPath: "/cobranca/contas",
      pickField: "paciente_id",
      formScope: ABRIR_CONTA_SCOPE,
      resource: "pacientes",
    });
    navigate("/pacientes");
  };

  const mudarConvenio = async (convenioId: number | "") => {
    if (!convenioId) {
      setSelConvenio("");
      return;
    }
    if (!conta) {
      setSelConvenio(convenioId);
      return;
    }
    if (conta.convenio_id === convenioId) {
      setSelConvenio(convenioId);
      return;
    }
    const ok = await msg.confirm({
      title: "Alterar convênio?",
      message:
        "Os valores dos itens não cancelados serão recalculados pela tabela de preços.",
      confirmLabel: "Alterar",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const atualizada = await api.cobrancaContaUpdate(conta.id, {
        convenio_id: convenioId,
      });
      setConta(atualizada);
      setSelConvenio(atualizada.convenio_id ?? "");
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro ao alterar convênio");
    } finally {
      setBusy(false);
    }
  };

  const incluirItem = async (procedimentoId: number) => {
    if (!conta) return;
    setBusy(true);
    try {
      if (conta.agendamento_id) {
        setConta(
          await api.cobrancaContaItemAdd(conta.id, {
            procedimento_id: procedimentoId,
            status: "previsto",
          }),
        );
      } else {
        setConta(
          await adicionarItemComConfirmacaoDuplicata(
            msg.confirm,
            conta.id,
            { procedimento_id: procedimentoId, status: "solicitado" },
            {
              conta,
              procedimentoNome: procedimentos.find((p) => p.id === procedimentoId)?.nome,
            },
          ),
        );
      }
      setProcSelectKey((k) => k + 1);
    } catch (e) {
      if (e instanceof UserCancelledError) return;
      void msg.error(e instanceof ApiError ? e.message : "Erro ao incluir");
    } finally {
      setBusy(false);
    }
  };

  const removerItem = async (itemId: number) => {
    if (!conta) return;
    const ok = await msg.confirm({
      title: "Remover item?",
      message: "O item será removido da cobrança desta conta.",
      confirmLabel: "Remover",
    });
    if (!ok) return;
    setBusy(true);
    try {
      setConta(await api.cobrancaContaItemCancelar(conta.id, itemId));
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro ao remover");
    } finally {
      setBusy(false);
    }
  };

  const mudarStatusItem = async (itemId: number, status: CobrancaItemStatus) => {
    if (!conta) return;
    setBusy(true);
    try {
      setConta(await api.cobrancaContaItemPatch(conta.id, itemId, { status }));
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro");
    } finally {
      setBusy(false);
    }
  };

  const editavel = conta?.status === "em_aberto";
  const itensAtivos = conta?.itens.filter((i) => i.status !== "cancelado") ?? [];

  return (
    <div className="est-card est-card--page cobranca-dia-card flex flex-col min-h-0 w-full">
      <div className="toolbar cad-toolbar px-4 pt-4 flex-wrap gap-2">
        <h3 className="m-0 text-base font-semibold flex-1">Contas do dia</h3>
        <label className="text-sm flex items-center gap-2">
          <span className="font-medium">Data</span>
          <DataIsoInput value={data} onValueChange={setData} />
        </label>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => void carregar()}>
          <RefreshCw className="inline h-4 w-4" aria-hidden />
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setDialog(true)}>
          <Plus className="inline h-4 w-4 mr-1" aria-hidden />
          Abrir conta
        </button>
      </div>

      <div className="est-card--page__area scroll-interno scroll-interno--flex flex-1 min-h-0">
        {loading ? (
          <p className="p-4 text-sm text-[var(--muted)]">Carregando…</p>
        ) : lista.length === 0 ? (
          <p className="p-4 text-sm text-[var(--muted)]">
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
                  <th className="cobranca-dia-num text-right">Itens</th>
                  <th className="cobranca-dia-num text-right">Total</th>
                  <th className="cobranca-dia-acao" />
                </tr>
              </thead>
              <tbody>
                {lista.map((c) => (
                  <tr key={c.id}>
                    <td className="cobranca-dia-hora">{labelHoraConta(c.agendamento_hora)}</td>
                    <td className="cobranca-dia-nome">{c.paciente_nome}</td>
                    <td className="cobranca-dia-procs text-sm">
                      <span className="cobranca-dia-procs__txt">
                        {c.procedimentos_nomes?.trim() || (
                          <span className="text-[var(--muted)]">—</span>
                        )}
                      </span>
                    </td>
                    <td className="cobranca-dia-conv">{c.convenio_nome ?? "—"}</td>
                    <td className="cobranca-dia-status">{labelStatusCobranca(c.status)}</td>
                    <td className="cobranca-dia-num text-right">{c.qtd_itens}</td>
                    <td className="cobranca-dia-num text-right font-semibold">
                      {formatBRL(c.total_itens_centavos)}
                    </td>
                    <td className="cobranca-dia-acao">
                      <Link
                        to={linkCobrancaConta(c.id, cobrancaReturn, "Voltar às contas")}
                        className="btn btn-secondary btn-sm no-underline"
                      >
                        Abrir
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {dialog ? (
        <div
          className="modal-overlay"
          role="presentation"
          onClick={fecharDialog}
        >
          <div
            className="modal panel fk-picker-modal cobranca-abrir-conta-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cobranca-abrir-conta-titulo"
            onClick={(ev) => ev.stopPropagation()}
          >
            <h2 id="cobranca-abrir-conta-titulo" className="modal__title m-0 text-center">
              Abrir conta do atendimento
            </h2>
            <p className="modal__hint text-center">
              Data: <strong>{formatDataBr(data)}</strong> — conta avulsa (sem horário na agenda).
              Cada horário do dia já tem a própria conta.
            </p>

            <div className="cobranca-abrir-conta-modal__grid">
              <label className="agenda-dia-field agenda-dia-campo cobranca-abrir-conta-modal__paciente">
                <span className="text-sm font-medium block mb-1">Paciente</span>
                <div className="cobranca-abrir-conta-modal__paciente-row">
                  <select
                    className="legacy-input w-full"
                    value={selPaciente}
                    onChange={(e) => setSelPaciente(e.target.value)}
                    disabled={busy}
                    autoFocus
                  >
                    <option value="">Selecione…</option>
                    {pacientes.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nome}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn btn-secondary btn-novo-compact cobranca-abrir-conta-modal__novo-btn"
                    onClick={irNovoPaciente}
                  >
                    +Novo
                  </button>
                </div>
              </label>

              <label className="agenda-dia-field agenda-dia-campo">
                <span className="text-sm font-medium block mb-1">Convênio</span>
                <select
                  className="legacy-input w-full"
                  value={selConvenio}
                  disabled={!selPaciente || abrindo || busy}
                  onChange={(e) =>
                    void mudarConvenio(e.target.value ? Number(e.target.value) : "")
                  }
                >
                  <option value="">Último usado / Particular</option>
                  {convenios.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </label>

              <div className="cobranca-abrir-conta-modal__resumo cobranca-abrir-conta-modal__resumo--total">
                <span className="text-xs uppercase tracking-wide text-[var(--muted)]">
                  Total
                </span>
                <strong className="text-lg text-green-800">
                  {conta ? formatBRL(conta.total_liquido_centavos) : "—"}
                </strong>
              </div>
            </div>

            {selPaciente ? (
              <section className="cobranca-abrir-conta-modal__itens" aria-label="Itens de cobrança">
                <div className="cobranca-abrir-conta-modal__itens-head">
                  <h3 className="m-0 text-sm font-semibold">Itens de cobrança</h3>
                  {editavel ? (
                    <select
                      key={procSelectKey}
                      className="legacy-input cobranca-abrir-conta-modal__proc-select"
                      disabled={abrindo || busy || !conta}
                      defaultValue=""
                      onChange={(e) => {
                        const id = e.target.value ? Number(e.target.value) : 0;
                        if (id) void incluirItem(id);
                      }}
                    >
                      <option value="">Adicionar procedimento…</option>
                      {procedimentos.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nome}
                        </option>
                      ))}
                    </select>
                  ) : null}
                </div>

                <div className="cobranca-abrir-conta-modal__itens-body">
                  {abrindo ? (
                    <p className="text-sm text-[var(--muted)] m-0 p-2">Abrindo conta…</p>
                  ) : !conta ? (
                    <p className="text-sm text-[var(--muted)] m-0 p-2">
                      Não foi possível abrir a conta.
                    </p>
                  ) : itensAtivos.length === 0 ? (
                    <p className="text-sm text-[var(--muted)] m-0 p-2">
                      Nenhum item ainda. Selecione um procedimento acima.
                    </p>
                  ) : (
                    <div className="dup-table-wrap">
                      <table className="data-table data-table--compact">
                        <thead>
                          <tr>
                            <th>Procedimento</th>
                            <th>Status</th>
                            <th className="text-right">Qtd</th>
                            <th className="text-right">Valor</th>
                            <th className="text-right">Subtotal</th>
                            {editavel ? <th className="w-10" aria-label="Ações" /> : null}
                          </tr>
                        </thead>
                        <tbody>
                          {itensAtivos.map((item) => (
                            <tr key={item.id}>
                              <td>{item.procedimento_nome ?? "—"}</td>
                              <td>
                                {editavel ? (
                                  <select
                                    className="legacy-input text-sm py-0.5"
                                    value={item.status}
                                    disabled={busy}
                                    onChange={(e) =>
                                      void mudarStatusItem(
                                        item.id,
                                        e.target.value as CobrancaItemStatus,
                                      )
                                    }
                                  >
                                    {STATUS_ITEM_OPCOES.map((s) => (
                                      <option key={s} value={s}>
                                        {labelStatusCobranca(s)}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  labelStatusCobranca(item.status)
                                )}
                              </td>
                              <td className="text-right">{item.quantidade}</td>
                              <td className="text-right whitespace-nowrap">
                                {formatBRL(item.valor_centavos)}
                              </td>
                              <td className="text-right font-medium whitespace-nowrap">
                                {formatBRL(item.valor_centavos * item.quantidade)}
                              </td>
                              {editavel ? (
                                <td className="text-right">
                                  <button
                                    type="button"
                                    className="btn btn-secondary btn-sm px-2"
                                    disabled={busy}
                                    aria-label={`Remover ${item.procedimento_nome ?? "item"}`}
                                    title="Remover item"
                                    onClick={() => void removerItem(item.id)}
                                  >
                                    <Trash2 className="h-4 w-4" aria-hidden />
                                  </button>
                                </td>
                              ) : null}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </section>
            ) : (
              <p className="text-sm text-[var(--muted)] text-center m-0 mb-2">
                Selecione o paciente para incluir os itens da cobrança.
              </p>
            )}

            <div className="modal__actions fk-picker-modal__footer cobranca-abrir-conta-modal__footer">
              <button type="button" className="btn btn-secondary" onClick={fecharDialog}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!conta || abrindo}
                onClick={fecharDialog}
              >
                Concluir
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
