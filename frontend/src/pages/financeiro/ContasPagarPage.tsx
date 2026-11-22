import { HandCoins, Plus, RefreshCw, RotateCcw, Search, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DataIsoInput } from "../../components/DataIsoInput";
import { PageHeader } from "../../components/PageHeader";
import "../../financeiro.css";
import { ApiError } from "../../lib/api";
import {
  apiFin,
  brl,
  dataBr,
  FORMAS_PAGAR,
  gerarParcelas,
  hojeIso,
  labelFormaPagar,
  paraCentavos,
  paraTexto,
  SITUACAO_LABEL,
  somarDias,
  type CategoriaCaixa,
  type ContaPagar,
  type Fornecedor,
  type TotaisContasPagar,
} from "../../lib/financeiro";
import { useMessageBox } from "../../lib/messageBoxContext";
import { SortableTh, useTableSort } from "../../lib/useTableSort";

type Filtro = "" | "abertas" | "vencida" | "hoje" | "a_vencer" | "semana" | "paga";

type Form = {
  id?: number;
  fornecedor_nome: string;
  categoria_id: string;
  descricao: string;
  documento: string;
  valor: string;
  vencimento: string;
  forma_prevista: string;
  linha_pagamento: string;
  observacao: string;
  modo: "unica" | "parcelas" | "repetir";
  qtd: string;
};

const FORM_VAZIO: Form = {
  fornecedor_nome: "",
  categoria_id: "",
  descricao: "",
  documento: "",
  valor: "",
  vencimento: hojeIso(),
  forma_prevista: "",
  linha_pagamento: "",
  observacao: "",
  modo: "unica",
  qtd: "2",
};

function msgErro(e: unknown, padrao: string): string {
  return e instanceof ApiError ? e.message : padrao;
}

const txt = (a: string, b: string) => a.localeCompare(b, "pt-BR", { sensitivity: "base" });
const ORDEM_SITUACAO: Record<string, number> = { vencida: 0, hoje: 1, a_vencer: 2, paga: 3 };
const COMPARADORES: Record<string, (a: ContaPagar, b: ContaPagar) => number> = {
  venc: (a, b) => txt(a.vencimento, b.vencimento),
  fornecedor: (a, b) => txt(a.fornecedor_nome, b.fornecedor_nome),
  descricao: (a, b) => txt(a.descricao, b.descricao),
  categoria: (a, b) => txt(a.categoria_nome, b.categoria_nome),
  valor: (a, b) => a.valor_centavos - b.valor_centavos,
  situacao: (a, b) => (ORDEM_SITUACAO[a.situacao] ?? 9) - (ORDEM_SITUACAO[b.situacao] ?? 9),
  pago: (a, b) => txt(a.data_pagamento ?? "", b.data_pagamento ?? ""),
};

/** Contas a pagar (molde CliniCar): cards de situação, quitação em lote, parcelas e repetição mensal. */
export function ContasPagarPage() {
  const msg = useMessageBox();
  const [rows, setRows] = useState<ContaPagar[]>([]);
  const [totais, setTotais] = useState<TotaisContasPagar | null>(null);
  const [categorias, setCategorias] = useState<CategoriaCaixa[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [filtro, setFiltro] = useState<Filtro>("abertas");
  const [busca, setBusca] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [marcadas, setMarcadas] = useState<Set<number>>(new Set());
  const [form, setForm] = useState<Form | null>(null);
  const [pagando, setPagando] = useState<ContaPagar[] | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const semana = filtro === "semana";
      const r = await apiFin.contasPagar({
        q: buscaAplicada || undefined,
        situacao: semana ? "abertas" : filtro || undefined,
        de: semana ? hojeIso() : de || undefined,
        ate: semana ? somarDias(hojeIso(), 7) : ate || undefined,
      });
      setRows(r.rows);
      setTotais(r.totais);
      setMarcadas(new Set());
    } catch (e) {
      void msg.error(msgErro(e, "Erro ao carregar as contas"));
    } finally {
      setCarregando(false);
    }
  }, [filtro, buscaAplicada, de, ate, msg]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    apiFin.caixaCategorias().then(setCategorias).catch(() => undefined);
    apiFin.fornecedores().then(setFornecedores).catch(() => undefined);
  }, []);

  const catSaida = categorias.filter((c) => c.natureza === "saida" && c.ativo);
  const { sortCol, sortDir, sortedRows, toggleSort } = useTableSort(rows, COMPARADORES);

  const selecionadas = rows.filter((r) => marcadas.has(r.id));
  const abertasSel = selecionadas.filter((r) => r.status === "aberta");
  const pagaSel = selecionadas.length === 1 && selecionadas[0]!.status === "paga" ? selecionadas[0]! : null;
  const totalSel = selecionadas.reduce((t, r) => t + r.valor_centavos, 0);

  const alternarMarca = (id: number) =>
    setMarcadas((m) => {
      const n = new Set(m);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const abrirAlterar = (c: ContaPagar) => {
    if (c.status === "paga") {
      void msg.info("Conta paga não pode ser alterada. Estorne o pagamento para mexer nela.");
      return;
    }
    setForm({
      id: c.id,
      fornecedor_nome: c.fornecedor_nome,
      categoria_id: String(c.categoria_id),
      descricao: c.descricao,
      documento: c.documento,
      valor: paraTexto(c.valor_centavos),
      vencimento: c.vencimento,
      forma_prevista: c.forma_prevista ?? "",
      linha_pagamento: c.linha_pagamento,
      observacao: c.observacao,
      modo: "unica",
      qtd: "2",
    });
  };

  const excluir = async () => {
    if (abertasSel.length === 0) return;
    const ok = await msg.confirm({
      title: "Excluir",
      message:
        abertasSel.length === 1
          ? `Excluir a conta de ${abertasSel[0]!.fornecedor_nome} (${brl(abertasSel[0]!.valor_centavos)})?`
          : `Excluir ${abertasSel.length} contas em aberto (${brl(abertasSel.reduce((t, r) => t + r.valor_centavos, 0))})?`,
      confirmLabel: "Excluir",
    });
    if (!ok) return;
    try {
      for (const c of abertasSel) await apiFin.contaPagarExcluir(c.id);
      await carregar();
    } catch (e) {
      void msg.error(msgErro(e, "Erro ao excluir"));
    }
  };

  const estornar = async () => {
    if (!pagaSel) return;
    const ok = await msg.confirm({
      title: "Estornar pagamento",
      message: `Estornar o pagamento de ${brl(pagaSel.valor_pago_centavos ?? pagaSel.valor_centavos)} (${labelFormaPagar(pagaSel.forma_paga)})? A conta volta a ficar em aberto e o caixa recebe a entrada do estorno.`,
      confirmLabel: "Estornar",
    });
    if (!ok) return;
    try {
      await apiFin.contaPagarEstornar(pagaSel.id);
      await carregar();
    } catch (e) {
      void msg.error(msgErro(e, "Erro ao estornar"));
    }
  };

  const cards: { id: Filtro; rotulo: string; qtd: number; valor: number; classe: string }[] = totais
    ? [
        { id: "abertas", rotulo: "Em aberto", ...q(totais.abertas), classe: "fin-card--aberto" },
        { id: "vencida", rotulo: "Vencidas", ...q(totais.vencidas), classe: "fin-card--vencida" },
        { id: "hoje", rotulo: "Vencem hoje", ...q(totais.hoje), classe: "fin-card--hoje" },
        { id: "semana", rotulo: "Próximos 7 dias", ...q(totais.semana), classe: "fin-card--semana" },
        { id: "paga", rotulo: "Pagas no mês", ...q(totais.pagas_mes), classe: "fin-card--paga" },
      ]
    : [];

  return (
    <div className="page-stack flex-1 min-h-0 overflow-hidden">
      <PageHeader
        title="Contas a pagar"
        subtitle="Fornecedores e despesas da clínica. Pagar aqui lança a saída no Caixa."
      />
      <div className="fin-pagina__corpo">
        <div className="fin-cards">
          {cards.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`fin-card ${c.classe}${filtro === c.id ? " fin-card--ativo" : ""}`}
              onClick={() => {
                setFiltro(c.id);
                setDe("");
                setAte("");
              }}
            >
              <span className="fin-card__rotulo">{c.rotulo}</span>
              <strong className="fin-card__valor">{brl(c.valor)}</strong>
              <span className="fin-card__qtd">{c.qtd} conta(s)</span>
            </button>
          ))}
          <button
            type="button"
            className={`fin-card fin-card--todas${filtro === "" ? " fin-card--ativo" : ""}`}
            onClick={() => setFiltro("")}
          >
            <span className="fin-card__rotulo">Todas</span>
            <span className="fin-card__qtd">abertas e pagas</span>
          </button>
        </div>

        <div className="fin-barra">
          <label className="fin-busca">
            <Search size={16} aria-hidden />
            <input
              className="legacy-input"
              placeholder="Fornecedor, descrição ou documento… (Enter)"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && setBuscaAplicada(busca.trim())}
            />
          </label>
          {filtro !== "semana" ? (
            <span className="fin-periodo">
              {filtro === "paga" ? "Pago de" : "Vence de"}
              <DataIsoInput value={de} onValueChange={setDe} allowEmpty />
              até
              <DataIsoInput value={ate} onValueChange={setAte} allowEmpty />
            </span>
          ) : null}
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void carregar()} title="Atualizar">
            <RefreshCw size={16} className={carregando ? "animate-spin" : ""} />
          </button>
          <span className="fin-barra__acoes">
            <button type="button" className="btn btn-primary" onClick={() => setForm({ ...FORM_VAZIO, vencimento: hojeIso() })}>
              <Plus size={16} className="inline" /> Incluir
            </button>
            <button
              type="button"
              className="btn btn-cobranca-paga"
              disabled={abertasSel.length === 0}
              onClick={() => setPagando(abertasSel)}
            >
              <HandCoins size={16} className="inline" /> Pagar{abertasSel.length > 1 ? ` (${abertasSel.length})` : ""}
            </button>
            <button type="button" className="btn btn-secondary" disabled={abertasSel.length === 0} onClick={() => void excluir()}>
              <Trash2 size={16} className="inline" /> Excluir
            </button>
            <button type="button" className="btn btn-secondary" disabled={!pagaSel} onClick={() => void estornar()}>
              <RotateCcw size={16} className="inline" /> Estornar
            </button>
          </span>
        </div>
        {selecionadas.length > 0 ? (
          <p className="fin-selecao">
            {selecionadas.length} marcada(s) · {brl(totalSel)}
            <button type="button" className="fin-link" onClick={() => setMarcadas(new Set())}>
              limpar
            </button>
          </p>
        ) : null}

        <div className="panel-table">
          <table className="data-table fin-tabela">
            <thead>
              <tr>
                <th className="fin-tabela__check">
                  <input
                    type="checkbox"
                    aria-label="Marcar todas"
                    checked={rows.length > 0 && marcadas.size === rows.length}
                    onChange={(e) => setMarcadas(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())}
                  />
                </th>
                {(
                  [
                    ["venc", "Vencimento"],
                    ["fornecedor", "Fornecedor"],
                    ["descricao", "Descrição"],
                    ["categoria", "Categoria"],
                    ["valor", "Valor"],
                    ["situacao", "Situação"],
                    ["pago", "Pago em"],
                  ] as const
                ).map(([k, t]) => (
                  <SortableTh
                    key={k}
                    col={k}
                    label={t}
                    sortCol={sortCol}
                    sortDir={sortDir}
                    onSort={toggleSort}
                    numeric={k === "valor"}
                    className={k === "valor" ? "text-right" : undefined}
                  />
                ))}
                <th>Forma</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center text-[var(--muted)]">
                    {carregando ? "Carregando…" : "Nenhuma conta."}
                  </td>
                </tr>
              ) : null}
              {sortedRows.map((c) => (
                <tr
                  key={c.id}
                  className={`fin-linha--${c.situacao}${marcadas.has(c.id) ? " fin-linha--marcada" : ""}`}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest("input,button,a")) return;
                    alternarMarca(c.id);
                  }}
                  onDoubleClick={() => abrirAlterar(c)}
                >
                  <td className="fin-tabela__check">
                    <input type="checkbox" checked={marcadas.has(c.id)} onChange={() => alternarMarca(c.id)} />
                  </td>
                  <td>{dataBr(c.vencimento)}</td>
                  <td className="font-medium">{c.fornecedor_nome}</td>
                  <td>
                    {c.descricao || "—"}
                    {c.parcela_seq ? (
                      <span className="fin-tag">
                        {c.parcela_seq}/{c.parcela_total}
                      </span>
                    ) : null}
                    {c.repete_seq ? (
                      <span className="fin-tag fin-tag--repete">
                        mês {c.repete_seq}/{c.repete_total}
                      </span>
                    ) : null}
                    {c.documento ? <span className="fin-doc">doc {c.documento}</span> : null}
                  </td>
                  <td>{c.categoria_nome}</td>
                  <td className="text-right">
                    {brl(c.valor_centavos)}
                    {c.valor_pago_centavos != null && c.valor_pago_centavos !== c.valor_centavos ? (
                      <div className="fin-doc">pago {brl(c.valor_pago_centavos)}</div>
                    ) : null}
                  </td>
                  <td>
                    <span className={`fin-selo fin-selo--${c.situacao}`}>{SITUACAO_LABEL[c.situacao]}</span>
                  </td>
                  <td>{dataBr(c.data_pagamento)}</td>
                  <td>{labelFormaPagar(c.status === "paga" ? c.forma_paga : c.forma_prevista)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="fin-dica mt-2">Clique marca a linha · dois cliques alteram · marque várias para pagar de uma vez.</p>
      </div>

      {form ? (
        <ContaDialog
          inicial={form}
          categorias={catSaida}
          fornecedores={fornecedores}
          onFechar={() => setForm(null)}
          onSalvo={async () => {
            setForm(null);
            apiFin.fornecedores().then(setFornecedores).catch(() => undefined);
            await carregar();
          }}
        />
      ) : null}

      {pagando ? (
        <PagarDialog
          contas={pagando}
          onFechar={() => setPagando(null)}
          onPago={async () => {
            setPagando(null);
            await carregar();
          }}
        />
      ) : null}
    </div>
  );
}

function q(t: { qtd: number; valor_centavos: number }) {
  return { qtd: t.qtd, valor: t.valor_centavos };
}

function useEscFecha(onFechar: () => void) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onFechar();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onFechar]);
}

/** Inclusão / alteração de conta a pagar: conta única, parcelada ou repetida todo mês. */
function ContaDialog({
  inicial,
  categorias,
  fornecedores,
  onFechar,
  onSalvo,
}: {
  inicial: Form;
  categorias: CategoriaCaixa[];
  fornecedores: Fornecedor[];
  onFechar: () => void;
  onSalvo: () => Promise<void>;
}) {
  const [form, setForm] = useState<Form>(inicial);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  useEscFecha(onFechar);

  const qtd = Number(form.qtd) || 0;
  const valor = paraCentavos(form.valor);
  const previa =
    !form.id && form.modo === "parcelas" && qtd >= 2 && qtd <= 60 && valor > 0
      ? gerarParcelas(valor, qtd, form.vencimento)
      : null;

  const salvar = async () => {
    if (!form.categoria_id) return setErro("Escolha a categoria.");
    if (!(valor > 0)) return setErro("Informe o valor.");
    if (!form.vencimento) return setErro("Informe o vencimento.");
    if (form.modo !== "unica" && !(qtd >= 2 && qtd <= (form.modo === "parcelas" ? 60 : 24))) {
      return setErro(form.modo === "parcelas" ? "Parcelas: de 2 a 60." : "Repetir: de 2 a 24 meses.");
    }
    const body = {
      fornecedor_nome: form.fornecedor_nome,
      categoria_id: Number(form.categoria_id),
      descricao: form.descricao,
      documento: form.documento,
      valor_centavos: valor,
      vencimento: form.vencimento,
      forma_prevista: form.forma_prevista || null,
      linha_pagamento: form.linha_pagamento,
      observacao: form.observacao,
    };
    setSalvando(true);
    setErro(null);
    try {
      if (form.id) await apiFin.contaPagarAlterar(form.id, body);
      else if (form.modo === "parcelas")
        await apiFin.contaPagarCriar({ ...body, parcelas: gerarParcelas(valor, qtd, form.vencimento) });
      else if (form.modo === "repetir") await apiFin.contaPagarCriar({ ...body, repetir_meses: qtd });
      else await apiFin.contaPagarCriar(body);
      await onSalvo();
    } catch (e) {
      setErro(msgErro(e, "Erro ao salvar"));
      setSalvando(false);
    }
  };

  return (
    <div className="modal-overlay" role="presentation">
      <div className="modal panel fin-form" role="dialog" aria-modal="true">
        <h2 className="modal__title">{form.id ? "Alterar conta a pagar" : "Incluir conta a pagar"}</h2>
        <form
          autoComplete="off"
          onSubmit={(e) => {
            e.preventDefault();
            void salvar();
          }}
        >
          <div className="fin-form__grid">
            <label className="fin-form__span2">
              Fornecedor
              <input
                className="legacy-input"
                list="fin-fornecedores"
                value={form.fornecedor_nome}
                placeholder="Vazio = DIVERSOS (digite um novo para cadastrar)"
                autoFocus
                onChange={(e) => setForm({ ...form, fornecedor_nome: e.target.value.toUpperCase() })}
              />
              <datalist id="fin-fornecedores">
                {fornecedores.map((f) => (
                  <option key={f.id} value={f.nome} />
                ))}
              </datalist>
            </label>
            <label>
              Categoria *
              <select
                className="legacy-input"
                value={form.categoria_id}
                onChange={(e) => setForm({ ...form, categoria_id: e.target.value })}
              >
                <option value="">Selecione</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Documento / NF
              <input
                className="legacy-input"
                value={form.documento}
                onChange={(e) => setForm({ ...form, documento: e.target.value })}
              />
            </label>
            <label className="fin-form__span4">
              Descrição
              <input
                className="legacy-input"
                value={form.descricao}
                placeholder="Ex.: ALUGUEL DA SALA, MATERIAL DE ESCRITÓRIO"
                onChange={(e) => setForm({ ...form, descricao: e.target.value.toUpperCase() })}
              />
            </label>
            <label>
              {form.modo === "parcelas" && !form.id ? "Valor total (R$) *" : "Valor (R$) *"}
              <input
                className="legacy-input text-right"
                inputMode="decimal"
                value={form.valor}
                placeholder="0,00"
                onChange={(e) => setForm({ ...form, valor: e.target.value })}
                onBlur={() => {
                  const c = paraCentavos(form.valor);
                  if (c > 0) setForm((f) => ({ ...f, valor: paraTexto(c) }));
                }}
              />
            </label>
            <label>
              {form.modo === "unica" || form.id ? "Vencimento *" : "1º vencimento *"}
              <input
                type="date"
                className="legacy-input"
                value={form.vencimento}
                onChange={(e) => setForm({ ...form, vencimento: e.target.value })}
              />
            </label>
            <label>
              Forma prevista
              <select
                className="legacy-input"
                value={form.forma_prevista}
                onChange={(e) => setForm({ ...form, forma_prevista: e.target.value })}
              >
                <option value="">—</option>
                {FORMAS_PAGAR.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
            {!form.id ? (
              <label>
                Lançamento
                <select
                  className="legacy-input"
                  value={form.modo}
                  onChange={(e) => setForm({ ...form, modo: e.target.value as Form["modo"] })}
                >
                  <option value="unica">Conta única</option>
                  <option value="parcelas">Parcelado (divide o total)</option>
                  <option value="repetir">Repetir todo mês (aluguel, luz)</option>
                </select>
              </label>
            ) : (
              <span />
            )}
            {!form.id && form.modo !== "unica" ? (
              <label>
                {form.modo === "parcelas" ? "Parcelas (2 a 60)" : "Meses (2 a 24)"}
                <input
                  type="number"
                  min={2}
                  max={form.modo === "parcelas" ? 60 : 24}
                  className="legacy-input"
                  value={form.qtd}
                  onChange={(e) => setForm({ ...form, qtd: e.target.value })}
                />
              </label>
            ) : null}
            {form.forma_prevista === "boleto" ? (
              <label className="fin-form__span4">
                Linha digitável / código de barras
                <input
                  className="legacy-input"
                  value={form.linha_pagamento}
                  onChange={(e) => setForm({ ...form, linha_pagamento: e.target.value })}
                />
              </label>
            ) : null}
            <label className="fin-form__span4">
              Observação
              <input
                className="legacy-input"
                value={form.observacao}
                onChange={(e) => setForm({ ...form, observacao: e.target.value })}
              />
            </label>
            {previa ? (
              <div className="fin-form__span4 fin-previa">
                {previa.map((p, i) => (
                  <span key={i}>
                    {i + 1}/{previa.length} · {dataBr(p.vencimento)} · <b>{brl(p.valor_centavos)}</b>
                  </span>
                ))}
              </div>
            ) : null}
            {!form.id && form.modo === "repetir" && qtd >= 2 && valor > 0 ? (
              <p className="fin-form__span4 fin-dica">
                Gera {qtd} contas de {brl(valor)}, uma por mês. Cada mês é uma conta própria: pagar ou excluir uma não
                mexe nas outras.
              </p>
            ) : null}
          </div>
          {erro ? <p className="mt-2 text-sm text-red-700">{erro}</p> : null}
          <div className="modal__actions mt-3">
            <button type="button" className="btn btn-secondary" onClick={onFechar}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={salvando}>
              {salvando ? "Salvando…" : form.id ? "Salvar alterações" : "Salvar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** Quitação: uma conta (com juros/desconto) ou várias de uma vez. */
function PagarDialog({
  contas,
  onFechar,
  onPago,
}: {
  contas: ContaPagar[];
  onFechar: () => void;
  onPago: () => Promise<void>;
}) {
  const uma = contas.length === 1 ? contas[0]! : null;
  const [dataPg, setDataPg] = useState(hojeIso());
  const [forma, setForma] = useState(uma?.forma_prevista || "pix");
  const [juros, setJuros] = useState("");
  const [desconto, setDesconto] = useState("");
  const [obs, setObs] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  useEscFecha(onFechar);

  const base = useMemo(() => contas.reduce((t, c) => t + c.valor_centavos, 0), [contas]);
  const j = uma ? paraCentavos(juros) : 0;
  const d = uma ? paraCentavos(desconto) : 0;
  const total = base + (j || 0) - (d || 0);

  const confirmar = async () => {
    if (Number.isNaN(j) || Number.isNaN(d)) return setErro("Juros ou desconto inválido.");
    if (total <= 0) return setErro("O desconto não pode zerar o pagamento.");
    setSalvando(true);
    setErro(null);
    try {
      await apiFin.contasPagarQuitar({
        ids: contas.map((c) => c.id),
        data_pagamento: dataPg,
        forma,
        juros_centavos: j,
        desconto_centavos: d,
        observacao: obs || undefined,
      });
      await onPago();
    } catch (e) {
      setErro(msgErro(e, "Erro ao pagar"));
      setSalvando(false);
    }
  };

  return (
    <div className="modal-overlay" role="presentation" onClick={onFechar}>
      <div className="modal panel fin-pagar" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal__title">{uma ? "Pagar conta" : `Pagar ${contas.length} contas`}</h2>
        {uma ? (
          <p className="m-0 mb-3">
            <b>{uma.fornecedor_nome}</b>
            {uma.descricao ? ` — ${uma.descricao}` : ""} · vence {dataBr(uma.vencimento)}
          </p>
        ) : (
          <ul className="fin-pagar__lista">
            {contas.map((c) => (
              <li key={c.id}>
                <span>
                  {dataBr(c.vencimento)} · {c.fornecedor_nome}
                  {c.descricao ? ` — ${c.descricao}` : ""}
                </span>
                <b>{brl(c.valor_centavos)}</b>
              </li>
            ))}
          </ul>
        )}
        <div className="fin-pagar__grid">
          <label>
            Data do pagamento
            <input type="date" className="legacy-input" value={dataPg} onChange={(e) => setDataPg(e.target.value)} />
          </label>
          <label>
            Forma
            <select className="legacy-input" value={forma} onChange={(e) => setForma(e.target.value)}>
              {FORMAS_PAGAR.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
          {uma ? (
            <>
              <label>
                Juros / multa (R$)
                <input
                  className="legacy-input text-right"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={juros}
                  onChange={(e) => setJuros(e.target.value)}
                />
              </label>
              <label>
                Desconto (R$)
                <input
                  className="legacy-input text-right"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={desconto}
                  onChange={(e) => setDesconto(e.target.value)}
                />
              </label>
            </>
          ) : null}
          <label className="fin-pagar__obs">
            Observação
            <input className="legacy-input" value={obs} onChange={(e) => setObs(e.target.value)} />
          </label>
        </div>
        <div className="fin-pagar__total">
          <span>Total a pagar</span>
          <strong>{brl(Math.max(0, Number.isNaN(total) ? 0 : total))}</strong>
        </div>
        {!uma ? <p className="fin-dica">Juros e desconto só quando paga uma conta por vez.</p> : null}
        {erro ? <p className="text-sm text-red-700">{erro}</p> : null}
        <div className="modal__actions mt-3">
          <button type="button" className="btn btn-secondary" onClick={onFechar}>
            Cancelar
          </button>
          <button type="button" className="btn btn-cobranca-paga" disabled={salvando} onClick={() => void confirmar()} autoFocus>
            Confirmar pagamento
          </button>
        </div>
      </div>
    </div>
  );
}
