import { Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import { ContaItemExameVinculo } from "../../components/ContaItemExameVinculo";
import { ContaItemAdmissionalVinculo } from "../../components/ContaItemAdmissionalVinculo";
import { VoltarButton } from "../../components/VoltarButton";
import { ASO_TITULO_CURTO } from "../../lib/tipoAtendimento";
import {
  ApiError,
  api,
  type CobrancaContaDetalhe,
  type CobrancaConvenio,
  type CobrancaFormaPagamento,
  type CobrancaProcedimento,
  type CobrancaItemStatus,
} from "../../lib/api";
import { useAuth } from "../../lib/authContext";
import {
  formatBRL,
  formatDataBr,
  hojeIso,
  labelFormaPagamento,
  labelHoraConta,
  labelStatusCobranca,
  itemProcedimentoEhAdmissional,
  itemProcedimentoTemResultadoExame,
  somarItensConta,
  somarPagamentosConta,
} from "../../lib/cobrancaFormat";
import { parseCobrancaContaNav, navigateBackFromConta } from "../../lib/cobrancaContaNav";
import {
  adicionarItemComConfirmacaoDuplicata,
  UserCancelledError,
} from "../../lib/cobrancaItemAdd";
import { useMessageBox } from "../../lib/messageBoxContext";
import { temModulo } from "../../lib/permissoes";

const STATUS_ITEM_OPCOES: CobrancaItemStatus[] = [
  "previsto",
  "solicitado",
  "realizado",
];

const FORMAS_PAGAMENTO: CobrancaFormaPagamento[] = [
  "pix",
  "credito",
  "debito",
  "dinheiro",
  "transferencia",
];

function reaisParaCentavos(valor: string): number | null {
  const n = Number(valor.replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export function CobrancaContaPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const contaId = Number(id);
  const { returnTo, returnLabel } = parseCobrancaContaNav(location.state, contaId);
  const { me, permissoes } = useAuth();
  const msg = useMessageBox();
  const [conta, setConta] = useState<CobrancaContaDetalhe | null>(null);
  const [convenios, setConvenios] = useState<CobrancaConvenio[]>([]);
  const [procedimentos, setProcedimentos] = useState<CobrancaProcedimento[]>([]);
  const [procSelectKey, setProcSelectKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [formaPagamento, setFormaPagamento] = useState<CobrancaFormaPagamento>("pix");
  const [descontoReais, setDescontoReais] = useState("0");
  const [motivoDesconto, setMotivoDesconto] = useState("");
  const [numeroGuia, setNumeroGuia] = useState("");
  const [senhaGuia, setSenhaGuia] = useState("");
  const [autorizacaoGuia, setAutorizacaoGuia] = useState("");
  const [dataEnvioGuia, setDataEnvioGuia] = useState("");
  const [obsGuia, setObsGuia] = useState("");
  const [dataRecebimentoConvenio, setDataRecebimentoConvenio] = useState(hojeIso());
  const [obsRecebimentoConvenio, setObsRecebimentoConvenio] = useState("");

  const carregar = useCallback(async () => {
    if (!contaId) return;
    setLoading(true);
    try {
      const detalhe = await api.cobrancaContaGet(contaId);
      setConta(detalhe);
      if (detalhe.status !== "em_aberto") {
        setDescontoReais((detalhe.valor_desconto_centavos / 100).toFixed(2));
        setMotivoDesconto(detalhe.motivo_desconto ?? "");
      }
      const g = detalhe.convenio_guia;
      setNumeroGuia(g?.numero_guia ?? "");
      setSenhaGuia(g?.senha ?? "");
      setAutorizacaoGuia(g?.autorizacao ?? "");
      setDataEnvioGuia(g?.data_envio ?? "");
      setObsGuia(g?.observacao ?? "");
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Conta não encontrada");
    } finally {
      setLoading(false);
    }
  }, [contaId, msg]);

  useEffect(() => {
    void carregar();
    void api.cobrancaConveniosList(false).then(setConvenios).catch(() => undefined);
    void api.cobrancaProcedimentosList(undefined, false).then(setProcedimentos).catch(() => undefined);
  }, [carregar]);

  const editavel = conta?.status === "em_aberto";
  const itensAtivos = conta?.itens.filter((i) => i.status !== "cancelado") ?? [];
  const temItemAdmissional = itensAtivos.some(itemProcedimentoEhAdmissional);
  const temItemExame = itensAtivos.some(itemProcedimentoTemResultadoExame);
  const convenioAtual = convenios.find((c) => c.id === conta?.convenio_id);
  const ehOperadora = convenioAtual?.tipo === "operadora";
  const exigeGuiaOperadora = ehOperadora && convenioAtual.exige_guia !== 0;
  const ehAdmin = me?.perfil === "admin";
  const podeBaixaConvenio = temModulo(permissoes, "cobranca_relatorios");
  const aguardandoRepasse = conta?.status === "a_faturar_convenio";

  const descontoCentavos = reaisParaCentavos(descontoReais) ?? 0;

  const totalItensCentavos = useMemo(() => {
    if (!conta) return 0;
    if (Number.isFinite(conta.total_itens_centavos)) {
      return conta.total_itens_centavos;
    }
    return somarItensConta(itensAtivos);
  }, [conta, itensAtivos]);

  const totalPagoCentavos = useMemo(() => {
    if (!conta) return 0;
    if (Number.isFinite(conta.total_pago_centavos)) {
      return conta.total_pago_centavos;
    }
    return somarPagamentosConta(conta.pagamentos);
  }, [conta]);

  const totalLiquidoExibido = useMemo(() => {
    const desconto = editavel ? descontoCentavos : (conta?.valor_desconto_centavos ?? 0);
    return Math.max(0, totalItensCentavos - desconto);
  }, [conta, descontoCentavos, editavel, totalItensCentavos]);

  const valorReceberCentavos = useMemo(
    () => Math.max(0, totalLiquidoExibido - totalPagoCentavos),
    [totalLiquidoExibido, totalPagoCentavos],
  );

  const mudarConvenio = async (convenioId: number) => {
    if (!conta || conta.convenio_id === convenioId) return;
    const ok = await msg.confirm({
      title: "Alterar convênio?",
      message:
        "Os valores dos itens não cancelados serão recalculados pela tabela de preços.",
      confirmLabel: "Alterar",
    });
    if (!ok) return;
    setBusy(true);
    try {
      setConta(await api.cobrancaContaUpdate(conta.id, { convenio_id: convenioId }));
      void msg.success("Convênio atualizado.");
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro");
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

  const receberConta = async () => {
    if (!conta) return;
    if (descontoCentavos > totalItensCentavos) {
      void msg.error("Desconto não pode ser maior que o total dos itens");
      return;
    }
    if (descontoCentavos > 0 && !motivoDesconto.trim()) {
      void msg.error("Informe o motivo do desconto");
      return;
    }
    if (valorReceberCentavos > 0 && !formaPagamento) {
      void msg.error("Selecione a forma de pagamento");
      return;
    }
    const ok = await msg.confirm({
      title: "Receber conta?",
      message:
        valorReceberCentavos > 0
          ? `Confirmar recebimento de ${formatBRL(valorReceberCentavos)} via ${labelFormaPagamento(formaPagamento)}?`
          : "Confirmar fechamento da conta sem valor a receber?",
      confirmLabel: "Receber conta",
    });
    if (!ok) return;
    setBusy(true);
    try {
      setConta(
        await api.cobrancaContaReceber(conta.id, {
          valor_desconto_centavos: descontoCentavos,
          motivo_desconto: descontoCentavos > 0 ? motivoDesconto : null,
          forma: valorReceberCentavos > 0 ? formaPagamento : undefined,
        }),
      );
      navigateBackFromConta(navigate, returnTo, conta.id);
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro ao receber conta");
    } finally {
      setBusy(false);
    }
  };

  const faturarConvenio = async () => {
    if (!conta) return;
    if (exigeGuiaOperadora && !numeroGuia.trim()) {
      void msg.error("Informe o número da guia");
      return;
    }
    const ok = await msg.confirm({
      title: exigeGuiaOperadora ? "Faturar convênio?" : "Encerrar para faturamento mensal?",
      message: exigeGuiaOperadora
        ? "A conta será fechada como a faturar, sem pagamento em dinheiro."
        : "A conta entra no relatório mensal do convênio. Não é necessário número de guia por atendimento.",
      confirmLabel: exigeGuiaOperadora ? "Faturar" : "Encerrar",
    });
    if (!ok) return;
    setBusy(true);
    try {
      setConta(
        await api.cobrancaContaFechar(conta.id, {
          modo: "convenio",
          convenio_guia: exigeGuiaOperadora
            ? {
                numero_guia: numeroGuia.trim(),
                senha: senhaGuia.trim() || null,
                autorizacao: autorizacaoGuia.trim() || null,
                data_envio: dataEnvioGuia.trim() || null,
                observacao: obsGuia.trim() || null,
              }
            : {
                observacao: obsGuia.trim() || null,
              },
        }),
      );
      navigateBackFromConta(navigate, returnTo, conta.id);
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro ao faturar");
    } finally {
      setBusy(false);
    }
  };

  const receberConvenioConta = async () => {
    if (!conta) return;
    const ok = await msg.confirm({
      title: "Registrar recebimento do convênio?",
      message: `Valor: ${formatBRL(totalLiquidoExibido)}\nData do crédito: ${formatDataBr(dataRecebimentoConvenio)}`,
      confirmLabel: "Registrar",
    });
    if (!ok) return;
    setBusy(true);
    try {
      setConta(
        await api.cobrancaContaReceberConvenio(conta.id, {
          data_recebimento: dataRecebimentoConvenio,
          observacao: obsRecebimentoConvenio.trim() || undefined,
        }),
      );
      navigateBackFromConta(navigate, returnTo, conta.id);
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro ao registrar recebimento");
    } finally {
      setBusy(false);
    }
  };

  const reabrirConta = async () => {
    if (!conta) return;
    const ok = await msg.confirm({
      title: "Reabrir conta?",
      message: "A conta voltará ao status em aberto.",
      confirmLabel: "Reabrir",
    });
    if (!ok) return;
    setBusy(true);
    try {
      setConta(await api.cobrancaContaReabrir(conta.id));
      setDescontoReais("0");
      setMotivoDesconto("");
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro ao reabrir");
    } finally {
      setBusy(false);
    }
  };

  if (loading || !conta) {
    return <p className="text-sm text-[var(--muted)] pt-2">Carregando conta…</p>;
  }

  const descontoExibido = editavel ? descontoCentavos : (conta?.valor_desconto_centavos ?? 0);

  return (
    <div className="cobranca-conta-page w-full max-w-6xl min-w-0 space-y-4 pt-2 pb-8">
      <VoltarButton
        className="btn btn-secondary btn-sm"
        onClick={() => navigateBackFromConta(navigate, returnTo, conta.id)}
      >
        {returnLabel}
      </VoltarButton>

      <div className="est-card p-4">
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <h3 className="m-0 text-lg font-semibold">{conta.paciente_nome}</h3>
            <p className="text-sm text-[var(--muted)] m-0 mt-1">
              {formatDataBr(conta.data)}
              {conta.agendamento_id
                ? ` · ${labelHoraConta(conta.agendamento_hora)}`
                : " · Avulso"}
              {" · "}
              {labelStatusCobranca(conta.status)}
            </p>
          </div>
          <label className="text-sm min-w-[12rem] max-w-xs flex-1">
            <span className="font-medium">Convênio</span>
            <select
              className="legacy-input w-full mt-1"
              disabled={!editavel || busy}
              value={conta.convenio_id ?? ""}
              onChange={(e) => void mudarConvenio(Number(e.target.value))}
            >
              {convenios.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </label>
          {!editavel ? (
            <div className="text-right">
              <div className="text-sm text-[var(--muted)]">Total recebido</div>
              <div className="text-xl font-bold text-green-800">
                {formatBRL(totalPagoCentavos)}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="est-card p-0 min-w-0">
        <div className="px-4 pt-4 flex flex-wrap items-end gap-2 border-b border-[var(--border)] pb-3">
          <h4 className="m-0 font-semibold flex-1">Itens de cobrança</h4>
          {editavel ? (
            <select
              key={procSelectKey}
              className="legacy-input min-w-[12rem]"
              disabled={busy}
              defaultValue=""
              onChange={(e) => {
                const pid = e.target.value ? Number(e.target.value) : 0;
                if (pid) void incluirItem(pid);
              }}
            >
              <option value="">Adicionar procedimento…</option>
              {procedimentos
                .filter((p) => {
                  if (!conta.agendamento_id) return true;
                  return !itensAtivos.some((i) => i.procedimento_id === p.id);
                })
                .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          ) : null}
        </div>

        <div className="p-4 min-w-0">
          {itensAtivos.length === 0 ? (
            <p className="text-sm text-amber-900 m-0">
              Nenhum procedimento na conta. Inclua itens antes de receber ou faturar — o valor
              vem dos procedimentos, não só do convênio.
            </p>
          ) : (
            <div className="dup-table-wrap min-w-0">
              <table className="data-table cobranca-conta-itens">
                <thead>
                  <tr>
                    <th>Procedimento</th>
                    <th>Status</th>
                    {temItemExame ? <th>Resultado</th> : null}
                    {temItemAdmissional ? <th>{ASO_TITULO_CURTO}</th> : null}
                    <th className="text-right cobranca-conta-num">Qtd</th>
                    <th className="text-right cobranca-conta-num">Valor</th>
                    <th className="text-right cobranca-conta-num">Subtotal</th>
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
                      {temItemExame ? (
                        <td>
                          {itemProcedimentoTemResultadoExame(item) ? (
                            <ContaItemExameVinculo
                              contaId={conta.id}
                              itemId={item.id}
                              pacienteId={conta.paciente_id}
                              pacienteNome={conta.paciente_nome ?? ""}
                              exameAnexoId={item.exame_anexo_id ?? null}
                              exameNome={item.exame_nome ?? null}
                              editavel={editavel}
                              onContaAtualizada={setConta}
                              compact
                            />
                          ) : (
                            <span className="text-xs text-[var(--muted)]">—</span>
                          )}
                        </td>
                      ) : null}
                      {temItemAdmissional ? (
                        <td>
                          {itemProcedimentoEhAdmissional(item) ? (
                            <ContaItemAdmissionalVinculo
                              contaId={conta.id}
                              itemId={item.id}
                              admissionalId={item.admissional_id ?? null}
                              admissionalStatus={item.admissional_status ?? null}
                              admissionalConclusao={item.admissional_conclusao ?? null}
                              admissionalMedicoNome={item.admissional_medico_nome ?? null}
                              editavel={editavel}
                              onContaAtualizada={setConta}
                              compact
                            />
                          ) : (
                            <span className="text-[var(--muted)]">—</span>
                          )}
                        </td>
                      ) : null}
                      <td className="text-right cobranca-conta-num">{item.quantidade}</td>
                      <td className="text-right cobranca-conta-num">
                        {formatBRL(item.valor_centavos)}
                      </td>
                      <td className="text-right font-medium cobranca-conta-num">
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
                <tfoot>
                  <tr>
                    <td colSpan={5} className="text-right font-semibold">
                      Total itens
                    </td>
                    <td className="text-right font-bold">
                      {formatBRL(totalItensCentavos)}
                    </td>
                    {editavel ? <td /> : null}
                  </tr>
                  {descontoExibido > 0 ? (
                    <tr>
                      <td colSpan={5} className="text-right text-[var(--muted)]">
                        Desconto
                      </td>
                      <td className="text-right text-red-700">
                        − {formatBRL(descontoExibido)}
                      </td>
                      {editavel ? <td /> : null}
                    </tr>
                  ) : null}
                  <tr>
                    <td colSpan={5} className="text-right font-semibold">
                      Total líquido
                    </td>
                    <td className="text-right font-bold text-green-800">
                      {formatBRL(totalLiquidoExibido)}
                    </td>
                    {editavel ? <td /> : null}
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {editavel ? (
            <div className="mt-4 pt-4 border-t border-[var(--border)] space-y-3">
              <p className="text-sm font-medium m-0">Pagamento na recepção</p>
              {ehOperadora ? (
                <p className="text-sm text-[var(--muted)] m-0">
                  Se o paciente paga à vista (ex.: desconto da prefeitura), registre o
                  desconto e receba aqui. A conta fecha como paga. Se for faturar o
                  convênio, use o bloco abaixo.
                </p>
              ) : null}
              <div className="flex flex-wrap justify-end gap-x-6 gap-y-2 text-sm mb-1">
                <span>
                  <span className="text-[var(--muted)]">Total líquido </span>
                  <strong className="text-green-800">{formatBRL(totalLiquidoExibido)}</strong>
                </span>
                <span>
                  <span className="text-[var(--muted)]">Valor a receber </span>
                  <strong className="text-green-800 text-base">
                    {formatBRL(valorReceberCentavos)}
                  </strong>
                </span>
              </div>
              <div className="flex flex-wrap gap-3 items-end">
                <label className="text-sm">
                  <span className="font-medium block mb-1">Desconto (R$)</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="legacy-input w-28"
                    disabled={busy}
                    value={descontoReais}
                    onChange={(e) => setDescontoReais(e.target.value)}
                  />
                </label>
                <label className="text-sm flex-1 min-w-[10rem]">
                  <span className="font-medium block mb-1">Motivo do desconto</span>
                  <input
                    type="text"
                    className="legacy-input w-full"
                    disabled={busy}
                    placeholder={descontoCentavos > 0 ? "Obrigatório" : "Opcional"}
                    value={motivoDesconto}
                    onChange={(e) => setMotivoDesconto(e.target.value)}
                  />
                </label>
                {valorReceberCentavos > 0 ? (
                  <label className="text-sm">
                    <span className="font-medium block mb-1">Forma de pagamento</span>
                    <select
                      className="legacy-input"
                      disabled={busy}
                      value={formaPagamento}
                      onChange={(e) =>
                        setFormaPagamento(e.target.value as CobrancaFormaPagamento)
                      }
                    >
                      {FORMAS_PAGAMENTO.map((f) => (
                        <option key={f} value={f}>
                          {labelFormaPagamento(f)}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || itensAtivos.length === 0}
                onClick={() => void receberConta()}
              >
                Receber conta
              </button>
            </div>
          ) : null}

          {editavel && ehOperadora ? (
            <div className="mt-4 pt-4 border-t border-[var(--border)] space-y-3">
              <p className="text-sm font-medium m-0">
                {exigeGuiaOperadora
                  ? "Ou faturar o convênio"
                  : "Ou encaminhar para faturamento mensal"}
              </p>
              {!exigeGuiaOperadora ? (
                <p className="text-sm text-[var(--muted)] m-0">
                  Use só se o paciente não pagar na recepção. A conta entra no relatório
                  mensal do convênio, sem número de guia por atendimento.
                </p>
              ) : null}
              {exigeGuiaOperadora ? (
                <div className="flex flex-wrap gap-3 items-end">
                  <label className="text-sm">
                    <span className="font-medium block mb-1">Nº guia *</span>
                    <input
                      type="text"
                      className="legacy-input w-36"
                      maxLength={100}
                      disabled={busy}
                      value={numeroGuia}
                      onChange={(e) => setNumeroGuia(e.target.value)}
                    />
                  </label>
                  <label className="text-sm">
                    <span className="font-medium block mb-1">Senha</span>
                    <input
                      type="text"
                      className="legacy-input w-28"
                      maxLength={100}
                      disabled={busy}
                      value={senhaGuia}
                      onChange={(e) => setSenhaGuia(e.target.value)}
                    />
                  </label>
                  <label className="text-sm">
                    <span className="font-medium block mb-1">Autorização</span>
                    <input
                      type="text"
                      className="legacy-input w-32"
                      maxLength={100}
                      disabled={busy}
                      value={autorizacaoGuia}
                      onChange={(e) => setAutorizacaoGuia(e.target.value)}
                    />
                  </label>
                  <label className="text-sm">
                    <span className="font-medium block mb-1">Data envio</span>
                    <input
                      type="date"
                      className="legacy-input"
                      disabled={busy}
                      value={dataEnvioGuia}
                      onChange={(e) => setDataEnvioGuia(e.target.value)}
                    />
                  </label>
                  <label className="text-sm flex-1 min-w-[10rem]">
                    <span className="font-medium block mb-1">Observação</span>
                    <input
                      type="text"
                      className="legacy-input w-full"
                      maxLength={500}
                      disabled={busy}
                      value={obsGuia}
                      onChange={(e) => setObsGuia(e.target.value)}
                    />
                  </label>
                </div>
              ) : (
                <label className="text-sm block max-w-xl">
                  <span className="font-medium block mb-1">Observação (opcional)</span>
                  <input
                    type="text"
                    className="legacy-input w-full"
                    maxLength={500}
                    disabled={busy}
                    placeholder="Ex.: folha de autorização da prefeitura"
                    value={obsGuia}
                    onChange={(e) => setObsGuia(e.target.value)}
                  />
                </label>
              )}
              <button
                type="button"
                className="btn btn-secondary"
                disabled={
                  busy ||
                  itensAtivos.length === 0 ||
                  (exigeGuiaOperadora && !numeroGuia.trim())
                }
                onClick={() => void faturarConvenio()}
              >
                {exigeGuiaOperadora ? "Faturar convênio" : "Encerrar para faturamento mensal"}
              </button>
            </div>
          ) : null}

          {!editavel && aguardandoRepasse && ehOperadora && podeBaixaConvenio ? (
            <div className="mt-4 pt-4 border-t border-[var(--border)] space-y-3">
              <p className="text-sm font-medium m-0">Recebimento do convênio</p>
              <p className="text-sm text-[var(--muted)] m-0">
                Registre quando o repasse cair na conta (etapa financeira, após o faturamento).
              </p>
              <div className="flex flex-wrap gap-3 items-end">
                <label className="text-sm">
                  <span className="font-medium block mb-1">Data do crédito *</span>
                  <input
                    type="date"
                    className="legacy-input"
                    disabled={busy}
                    value={dataRecebimentoConvenio}
                    onChange={(e) => setDataRecebimentoConvenio(e.target.value)}
                  />
                </label>
                <label className="text-sm flex-1 min-w-[12rem]">
                  <span className="font-medium block mb-1">Observação</span>
                  <input
                    type="text"
                    className="legacy-input w-full"
                    maxLength={500}
                    disabled={busy}
                    placeholder="Ex.: Repasse mar/2026"
                    value={obsRecebimentoConvenio}
                    onChange={(e) => setObsRecebimentoConvenio(e.target.value)}
                  />
                </label>
              </div>
              <p className="text-sm m-0">
                Valor: <strong>{formatBRL(totalLiquidoExibido)}</strong> · Repasse convênio
              </p>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={() => void receberConvenioConta()}
              >
                Registrar recebimento do convênio
              </button>
            </div>
          ) : null}

          {!editavel && ehOperadora && (conta.convenio_guia?.numero_guia || conta.convenio_guia?.observacao) ? (
            <div className="mt-4 pt-4 border-t border-[var(--border)] space-y-1 text-sm">
              <p className="font-medium m-0">
                {conta.convenio_guia?.numero_guia ? "Guia convênio" : "Faturamento mensal"}
              </p>
              {conta.convenio_guia?.numero_guia ? (
                <p className="m-0">
                  <span className="text-[var(--muted)]">Nº guia </span>
                  {conta.convenio_guia.numero_guia}
                </p>
              ) : null}
              {conta.convenio_guia.senha ? (
                <p className="m-0">
                  <span className="text-[var(--muted)]">Senha </span>
                  {conta.convenio_guia.senha}
                </p>
              ) : null}
              {conta.convenio_guia.autorizacao ? (
                <p className="m-0">
                  <span className="text-[var(--muted)]">Autorização </span>
                  {conta.convenio_guia.autorizacao}
                </p>
              ) : null}
              {conta.convenio_guia.data_envio ? (
                <p className="m-0">
                  <span className="text-[var(--muted)]">Data envio </span>
                  {formatDataBr(conta.convenio_guia.data_envio)}
                </p>
              ) : null}
              {conta.convenio_guia.observacao ? (
                <p className="m-0 text-[var(--muted)]">{conta.convenio_guia.observacao}</p>
              ) : null}
            </div>
          ) : null}

          {!editavel && conta.pagamentos.length > 0 ? (
            <div className="mt-4 pt-4 border-t border-[var(--border)]">
              <p className="text-sm font-medium m-0 mb-2">Pagamentos</p>
              <div className="dup-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Forma</th>
                      <th className="text-right">Valor</th>
                      <th>Registrado em</th>
                    </tr>
                  </thead>
                  <tbody>
                    {conta.pagamentos.map((p) => (
                      <tr key={p.id}>
                        <td>{labelFormaPagamento(p.forma)}</td>
                        <td className="text-right font-medium">{formatBRL(p.valor_centavos)}</td>
                        <td className="text-sm text-[var(--muted)]">{p.registrado_em}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {conta.motivo_desconto ? (
                <p className="text-sm text-[var(--muted)] m-0 mt-2">
                  Desconto: {formatBRL(conta.valor_desconto_centavos)} — {conta.motivo_desconto}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {!editavel && ehAdmin ? (
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy || conta.status === "cancelada"}
          onClick={() => void reabrirConta()}
        >
          Reabrir conta (admin)
        </button>
      ) : null}
    </div>
  );
}
