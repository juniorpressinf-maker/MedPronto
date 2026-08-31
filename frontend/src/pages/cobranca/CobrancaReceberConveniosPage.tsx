import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { DataIsoInput } from "../../components/DataIsoInput";
import {
  ApiError,
  api,
  type CobrancaConvenio,
  type RelatorioFaturamentoConvenio,
} from "../../lib/api";
import { cobrancaReturnPath, linkCobrancaConta } from "../../lib/cobrancaContaNav";
import { formatBRL, formatDataBr, hojeIso, labelHoraConta } from "../../lib/cobrancaFormat";
import { useMessageBox } from "../../lib/messageBoxContext";

function inicioMesIso(): string {
  const hoje = hojeIso();
  return `${hoje.slice(0, 8)}01`;
}

type NavState = { de?: string; ate?: string; convenioId?: string };

export function CobrancaReceberConveniosPage() {
  const location = useLocation();
  const nav = (location.state ?? {}) as NavState;
  const msg = useMessageBox();
  const [de, setDe] = useState(nav.de ?? inicioMesIso());
  const [ate, setAte] = useState(nav.ate ?? hojeIso());
  const [convenioId, setConvenioId] = useState(nav.convenioId ?? "");
  const [convenios, setConvenios] = useState<CobrancaConvenio[]>([]);
  const [relatorio, setRelatorio] = useState<RelatorioFaturamentoConvenio | null>(null);
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dataRecebimento, setDataRecebimento] = useState(hojeIso());
  const [observacao, setObservacao] = useState("");

  useEffect(() => {
    void api
      .cobrancaConveniosList(false)
      .then((lista) => setConvenios(lista.filter((c) => c.tipo === "operadora" && c.ativo === 1)))
      .catch(() => undefined);
  }, []);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const dados = await api.cobrancaPendentesRepasseGet(
        de,
        ate,
        convenioId ? Number(convenioId) : undefined,
      );
      setRelatorio(dados);
      setSelecionados(new Set(dados.grupos.flatMap((g) => g.contas.map((c) => c.conta_id))));
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }, [de, ate, convenioId, msg]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const todosIds = useMemo(
    () => relatorio?.grupos.flatMap((g) => g.contas.map((c) => c.conta_id)) ?? [],
    [relatorio],
  );

  const totalSelecionado = useMemo(() => {
    if (!relatorio) return 0;
    let total = 0;
    for (const g of relatorio.grupos) {
      for (const c of g.contas) {
        if (selecionados.has(c.conta_id)) total += c.total_liquido_centavos;
      }
    }
    return total;
  }, [relatorio, selecionados]);

  const toggleConta = (contaId: number) => {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(contaId)) next.delete(contaId);
      else next.add(contaId);
      return next;
    });
  };

  const marcarTodos = (marcar: boolean) => {
    setSelecionados(marcar ? new Set(todosIds) : new Set());
  };

  const registrarLote = async () => {
    if (selecionados.size === 0) {
      void msg.error("Selecione ao menos uma conta");
      return;
    }
    const ok = await msg.confirm({
      title: "Registrar recebimento do convênio?",
      message: `${selecionados.size} conta(s) · ${formatBRL(totalSelecionado)}\nData do crédito: ${formatDataBr(dataRecebimento)}`,
      confirmLabel: "Registrar",
    });
    if (!ok) return;

    setBusy(true);
    try {
      const res = await api.cobrancaReceberConvenioLote({
        conta_ids: [...selecionados],
        data_recebimento: dataRecebimento,
        observacao: observacao.trim() || undefined,
      });
      if (res.erros.length > 0) {
        void msg.warning(
          `${res.ok} conta(s) baixada(s). ${res.erros.length} falha(s): ${res.erros.map((e) => `#${e.conta_id}`).join(", ")}`,
        );
      }
      await carregar();
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro ao registrar");
    } finally {
      setBusy(false);
    }
  };

  const returnPath = cobrancaReturnPath("/cobranca/receber-convenios", {});

  return (
    <div className="space-y-4">
      <div className="est-card p-4 max-w-4xl">
        <h2 className="m-0 text-base font-semibold">Receber convênios</h2>
        <p className="mt-2 mb-0 text-sm text-[var(--text-2)]">
          Registre o repasse após o convênio pagar. Contas com status{" "}
          <strong>aguardando repasse</strong> passam para <strong>pago</strong>.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 items-end">
        <label className="text-sm flex items-center gap-2">
          <span className="font-medium">De</span>
          <DataIsoInput value={de} onValueChange={setDe} />
        </label>
        <label className="text-sm flex items-center gap-2">
          <span className="font-medium">Até</span>
          <DataIsoInput value={ate} onValueChange={setAte} />
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
      </div>

      {loading && !relatorio ? (
        <p className="text-sm text-[var(--muted)] m-0">Carregando…</p>
      ) : relatorio ? (
        <>
          <p className="text-sm text-[var(--muted)] m-0">
            {relatorio.qtd_contas} pendente(s) · Total{" "}
            <strong>{formatBRL(relatorio.total_liquido_centavos)}</strong>
            {relatorio.convenio_nome ? ` · ${relatorio.convenio_nome}` : " · todas as operadoras"}
          </p>

          {relatorio.grupos.length === 0 ? (
            <p className="text-sm m-0">Nenhuma conta aguardando repasse no período.</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2 items-center">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => marcarTodos(true)}
                >
                  Marcar todos
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => marcarTodos(false)}
                >
                  Desmarcar todos
                </button>
                <span className="text-sm text-[var(--muted)]">
                  {selecionados.size} selecionada(s) · {formatBRL(totalSelecionado)}
                </span>
              </div>

              {relatorio.grupos.map((grupo) => (
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
                          <th className="w-10">
                            <span className="sr-only">Selecionar</span>
                          </th>
                          <th>Data</th>
                          <th>Hora</th>
                          <th>Paciente</th>
                          <th>Procedimentos</th>
                          <th>Guia</th>
                          <th className="text-right">Valor</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {grupo.contas.map((c) => (
                          <tr key={c.conta_id}>
                            <td>
                              <input
                                type="checkbox"
                                checked={selecionados.has(c.conta_id)}
                                onChange={() => toggleConta(c.conta_id)}
                                aria-label={`Selecionar conta de ${c.paciente_nome}`}
                              />
                            </td>
                            <td className="whitespace-nowrap">{formatDataBr(c.data)}</td>
                            <td className="whitespace-nowrap">{labelHoraConta(c.agendamento_hora)}</td>
                            <td>{c.paciente_nome}</td>
                            <td className="text-sm max-w-[14rem]">
                              {c.itens.length === 0 ? (
                                <span className="text-[var(--muted)]">—</span>
                              ) : (
                                c.itens.map((i) => (
                                  <span
                                    key={`${c.conta_id}-${i.procedimento_nome}`}
                                    className="block"
                                  >
                                    {i.procedimento_nome}
                                    {i.quantidade > 1 ? ` ×${i.quantidade}` : ""}
                                  </span>
                                ))
                              )}
                            </td>
                            <td className="text-sm">{c.numero_guia?.trim() || "—"}</td>
                            <td className="text-right font-medium whitespace-nowrap">
                              {formatBRL(c.total_liquido_centavos)}
                            </td>
                            <td className="text-right">
                              <Link
                                to={linkCobrancaConta(c.conta_id, returnPath, "Voltar")}
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
              ))}

              <div className="est-card p-4 max-w-xl space-y-3">
                <p className="m-0 text-sm font-medium">Baixa em lote</p>
                <label className="text-sm block">
                  <span className="font-medium block mb-1">Data do crédito *</span>
                  <input
                    type="date"
                    className="legacy-input"
                    value={dataRecebimento}
                    onChange={(e) => setDataRecebimento(e.target.value)}
                    disabled={busy}
                  />
                </label>
                <label className="text-sm block">
                  <span className="font-medium block mb-1">Observação</span>
                  <input
                    type="text"
                    className="legacy-input w-full"
                    maxLength={500}
                    placeholder="Ex.: Repasse mar/2026 — NF 123"
                    value={observacao}
                    onChange={(e) => setObservacao(e.target.value)}
                    disabled={busy}
                  />
                </label>
                <p className="m-0 text-xs text-[var(--muted)]">
                  Forma: repasse convênio (não entra no caixa da recepção).
                </p>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy || selecionados.size === 0}
                  onClick={() => void registrarLote()}
                >
                  {busy ? "Registrando…" : "Registrar recebimento selecionados"}
                </button>
              </div>
            </>
          )}
        </>
      ) : null}
    </div>
  );
}
