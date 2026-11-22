import { ArrowDownCircle, ArrowUpCircle, ChevronLeft, ChevronRight, Printer, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { DataIsoInput } from "../../components/DataIsoInput";
import { PageHeader } from "../../components/PageHeader";
import "../../financeiro.css";
import { ApiError } from "../../lib/api";
import { useAuth } from "../../lib/authContext";
import { cobrancaReturnPath, linkCobrancaConta } from "../../lib/cobrancaContaNav";
import {
  apiFin,
  brl,
  dataBr,
  fimMes,
  FORMAS_PAGAR,
  hojeIso,
  inicioMes,
  labelFormaPagar,
  paraCentavos,
  somarDias,
  type CategoriaCaixa,
  type MovimentoCaixa,
  type ResumoCaixa,
} from "../../lib/financeiro";
import { useMessageBox } from "../../lib/messageBoxContext";
import { temModulo } from "../../lib/permissoes";

const ORIGEM: Record<MovimentoCaixa["origem"], string> = {
  cobranca: "Cobrança",
  conta_pagar: "Conta a pagar",
  manual: "Manual",
  outro: "Sistema",
};

/** Caixa (molde CliniCar): entradas e saídas do período, saldo e lançamentos manuais. */
export function CaixaPage() {
  const msg = useMessageBox();
  const { permissoes } = useAuth();
  const podeCobranca = temModulo(permissoes, "cobranca");
  const [de, setDe] = useState(hojeIso());
  const [ate, setAte] = useState(hojeIso());
  const [r, setR] = useState<ResumoCaixa | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [categorias, setCategorias] = useState<CategoriaCaixa[]>([]);
  const [lancando, setLancando] = useState<"entrada" | "saida" | null>(null);

  const carregar = useCallback(async () => {
    if (!de || !ate) return;
    setCarregando(true);
    try {
      setR(await apiFin.caixa(de, ate));
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro ao carregar o caixa");
    } finally {
      setCarregando(false);
    }
  }, [de, ate, msg]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    apiFin.caixaCategorias().then(setCategorias).catch(() => undefined);
  }, []);

  const mes = de === inicioMes(de) && ate === fimMes(de);
  const periodo = (d: string, a: string) => {
    setDe(d);
    setAte(a);
  };
  /** Cada data tem as suas setas: anda um dia só naquela data (de nunca passa de até). */
  const andarDe = (n: number) => {
    const d = somarDias(de, n);
    setDe(d);
    if (d > ate) setAte(d);
  };
  const andarAte = (n: number) => {
    const a = somarDias(ate, n);
    setAte(a);
    if (a < de) setDe(a);
  };

  const excluir = async (m: MovimentoCaixa) => {
    const ok = await msg.confirm({
      title: "Excluir lançamento",
      message: `Excluir o lançamento manual "${m.descricao}" de ${brl(m.valor_centavos)}?`,
      confirmLabel: "Excluir",
    });
    if (!ok) return;
    try {
      await apiFin.caixaExcluirLancamento(m.id);
      await carregar();
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro ao excluir");
    }
  };

  const titulo =
    de === ate
      ? `Caixa de ${dataBr(de)}`
      : mes
        ? `Caixa de ${de.slice(5, 7)}/${de.slice(0, 4)}`
        : `Caixa de ${dataBr(de)} a ${dataBr(ate)}`;
  const returnPath = cobrancaReturnPath("/financeiro/caixa", {});

  return (
    <div className="page-stack flex-1 min-h-0 overflow-hidden fin-caixa">
      <PageHeader
        title="Caixa"
        subtitle="Entradas da cobrança, saídas das contas pagas e lançamentos manuais (suprimento, sangria…)."
      />
      <div className="fin-pagina__corpo">
        <div className="fin-barra no-print">
          <span className="fin-periodo">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => andarDe(-1)} title="Data inicial: dia anterior">
              <ChevronLeft size={16} />
            </button>
            <DataIsoInput value={de} onValueChange={setDe} />
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => andarDe(1)} title="Data inicial: próximo dia">
              <ChevronRight size={16} />
            </button>
            até
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => andarAte(-1)} title="Data final: dia anterior">
              <ChevronLeft size={16} />
            </button>
            <DataIsoInput value={ate} onValueChange={setAte} />
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => andarAte(1)} title="Data final: próximo dia">
              <ChevronRight size={16} />
            </button>
          </span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => periodo(hojeIso(), hojeIso())}>
            Hoje
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => periodo(inicioMes(), fimMes())}>
            Este mês
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void carregar()} title="Atualizar">
            <RefreshCw size={16} className={carregando ? "animate-spin" : ""} />
          </button>
          <span className="fin-barra__acoes">
            <button type="button" className="btn btn-cobranca-paga" onClick={() => setLancando("entrada")}>
              <ArrowDownCircle size={16} className="inline" /> Entrada
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setLancando("saida")}>
              <ArrowUpCircle size={16} className="inline" /> Saída
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => window.print()}>
              <Printer size={16} className="inline" /> Imprimir
            </button>
          </span>
        </div>

        <h2 className="fin-caixa__titulo">{titulo}</h2>
        {r ? (
          <>
            <div className="fin-cards fin-cards--caixa">
              <div className="fin-card fin-card--neutro">
                <span className="fin-card__rotulo">Saldo anterior</span>
                <strong className="fin-card__valor">{brl(r.saldo_anterior_centavos)}</strong>
              </div>
              <div className="fin-card fin-card--paga">
                <span className="fin-card__rotulo">Entradas</span>
                <strong className="fin-card__valor">{brl(r.entradas_centavos)}</strong>
              </div>
              <div className="fin-card fin-card--vencida">
                <span className="fin-card__rotulo">Saídas</span>
                <strong className="fin-card__valor">{brl(r.saidas_centavos)}</strong>
              </div>
              <div className={`fin-card ${r.saldo_centavos >= 0 ? "fin-card--aberto" : "fin-card--vencida"}`}>
                <span className="fin-card__rotulo">Saldo do período</span>
                <strong className="fin-card__valor">{brl(r.saldo_centavos)}</strong>
              </div>
              <div className="fin-card fin-card--semana">
                <span className="fin-card__rotulo">Saldo final</span>
                <strong className="fin-card__valor">{brl(r.saldo_anterior_centavos + r.saldo_centavos)}</strong>
              </div>
            </div>

            <div className="fin-caixa__grid">
              <div className="panel-table">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Descrição</th>
                      <th>Categoria</th>
                      <th>Forma</th>
                      <th>Origem</th>
                      <th className="text-right">Entrada</th>
                      <th className="text-right">Saída</th>
                      <th className="no-print" />
                    </tr>
                  </thead>
                  <tbody>
                    {r.movimentos.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="text-center text-[var(--muted)]">
                          Nenhum movimento no período.
                        </td>
                      </tr>
                    ) : null}
                    {r.movimentos.map((m) => (
                      <tr key={m.chave}>
                        <td>{dataBr(m.data)}</td>
                        <td>
                          {m.origem === "cobranca" && m.conta_atendimento_id && podeCobranca ? (
                            <Link to={linkCobrancaConta(m.conta_atendimento_id, returnPath, "Voltar ao caixa")}>
                              {m.descricao || "—"}
                            </Link>
                          ) : (
                            m.descricao || "—"
                          )}
                          {m.usuario_nome ? <div className="fin-doc">{m.usuario_nome}</div> : null}
                        </td>
                        <td>{m.categoria_nome}</td>
                        <td>{labelFormaPagar(m.forma)}</td>
                        <td>
                          <span className={`fin-origem fin-origem--${m.origem}`}>{ORIGEM[m.origem]}</span>
                        </td>
                        <td className="text-right fin-entrada">{m.natureza === "entrada" ? brl(m.valor_centavos) : ""}</td>
                        <td className="text-right fin-saida">{m.natureza === "saida" ? brl(m.valor_centavos) : ""}</td>
                        <td className="no-print">
                          {m.manual ? (
                            <button
                              type="button"
                              className="btn btn-sm btn-secondary"
                              title="Excluir lançamento manual"
                              onClick={() => void excluir(m)}
                            >
                              <Trash2 size={14} />
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {r.movimentos.length ? (
                    <tfoot>
                      <tr>
                        <td colSpan={5} className="text-right font-semibold">
                          Totais
                        </td>
                        <td className="text-right fin-entrada font-semibold">{brl(r.entradas_centavos)}</td>
                        <td className="text-right fin-saida font-semibold">{brl(r.saidas_centavos)}</td>
                        <td className="no-print" />
                      </tr>
                    </tfoot>
                  ) : null}
                </table>
              </div>

              <aside className="fin-resumos">
                <section>
                  <h3>Por forma</h3>
                  {r.por_forma.length === 0 ? <p className="fin-dica">—</p> : null}
                  {r.por_forma.map((f) => (
                    <div key={f.forma} className="fin-resumo-linha">
                      <span>{f.forma === "—" ? "Sem forma" : labelFormaPagar(f.forma)}</span>
                      <span className="fin-entrada">{f.entradas_centavos ? brl(f.entradas_centavos) : ""}</span>
                      <span className="fin-saida">{f.saidas_centavos ? brl(f.saidas_centavos) : ""}</span>
                    </div>
                  ))}
                </section>
                <section>
                  <h3>Por categoria</h3>
                  {r.por_categoria.length === 0 ? <p className="fin-dica">—</p> : null}
                  {r.por_categoria.map((c) => (
                    <div key={`${c.natureza}${c.categoria}`} className="fin-resumo-linha fin-resumo-linha--2">
                      <span>{c.categoria}</span>
                      <span className={c.natureza === "entrada" ? "fin-entrada" : "fin-saida"}>
                        {c.natureza === "saida" ? "− " : ""}
                        {brl(c.valor_centavos)}
                      </span>
                    </div>
                  ))}
                </section>
              </aside>
            </div>
          </>
        ) : (
          <p className="text-sm text-[var(--muted)]">Carregando…</p>
        )}
      </div>

      {lancando ? (
        <LancamentoDialog
          natureza={lancando}
          categorias={categorias.filter((c) => c.natureza === lancando && c.ativo)}
          onFechar={() => setLancando(null)}
          onCategoriaCriada={(c) => setCategorias((cs) => [...cs, c])}
          onSalvo={async () => {
            setLancando(null);
            await carregar();
          }}
        />
      ) : null}
    </div>
  );
}

function LancamentoDialog({
  natureza,
  categorias,
  onFechar,
  onCategoriaCriada,
  onSalvo,
}: {
  natureza: "entrada" | "saida";
  categorias: CategoriaCaixa[];
  onFechar: () => void;
  onCategoriaCriada: (c: CategoriaCaixa) => void;
  onSalvo: () => Promise<void>;
}) {
  const [data, setData] = useState(hojeIso());
  const [categoriaId, setCategoriaId] = useState(categorias[0] ? String(categorias[0].id) : "");
  const [valor, setValor] = useState("");
  const [descricao, setDescricao] = useState("");
  const [forma, setForma] = useState("dinheiro");
  const [novaCat, setNovaCat] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onFechar();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onFechar]);

  const criarCategoria = async () => {
    if (!novaCat.trim()) return;
    try {
      const c = await apiFin.caixaCriarCategoria(novaCat.trim(), natureza);
      onCategoriaCriada(c);
      setCategoriaId(String(c.id));
      setNovaCat("");
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Erro ao criar a categoria");
    }
  };

  const salvar = async () => {
    const c = paraCentavos(valor);
    if (!(c > 0)) return setErro("Informe o valor.");
    if (!categoriaId) return setErro("Escolha a categoria.");
    if (!descricao.trim()) return setErro("Informe a descrição.");
    setSalvando(true);
    setErro(null);
    try {
      await apiFin.caixaLancar({ natureza, categoria_id: Number(categoriaId), valor_centavos: c, data, descricao, forma });
      await onSalvo();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Erro ao lançar");
      setSalvando(false);
    }
  };

  return (
    <div className="modal-overlay" role="presentation" onClick={onFechar}>
      <div className="modal panel fin-pagar" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal__title">{natureza === "entrada" ? "Lançar entrada" : "Lançar saída"}</h2>
        <div className="fin-pagar__grid">
          <label>
            Data
            <input type="date" className="legacy-input" value={data} onChange={(e) => setData(e.target.value)} />
          </label>
          <label>
            Valor (R$)
            <input
              className="legacy-input text-right"
              inputMode="decimal"
              placeholder="0,00"
              value={valor}
              autoFocus
              onChange={(e) => setValor(e.target.value)}
            />
          </label>
          <label>
            Categoria
            <select className="legacy-input" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
              <option value="">Selecione</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
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
          <label className="fin-pagar__obs">
            Descrição
            <input
              className="legacy-input"
              value={descricao}
              placeholder={natureza === "entrada" ? "Ex.: TROCO INICIAL, APORTE" : "Ex.: CAFÉ, ESTACIONAMENTO, SANGRIA"}
              onChange={(e) => setDescricao(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && void salvar()}
            />
          </label>
          <label className="fin-pagar__obs">
            Nova categoria (opcional)
            <span className="flex gap-2">
              <input className="legacy-input flex-1" value={novaCat} onChange={(e) => setNovaCat(e.target.value)} />
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => void criarCategoria()}>
                Criar
              </button>
            </span>
          </label>
        </div>
        {erro ? <p className="text-sm text-red-700">{erro}</p> : null}
        <div className="modal__actions mt-3">
          <button type="button" className="btn btn-secondary" onClick={onFechar}>
            Cancelar
          </button>
          <button
            type="button"
            className={`btn ${natureza === "entrada" ? "btn-cobranca-paga" : "btn-primary"}`}
            disabled={salvando}
            onClick={() => void salvar()}
          >
            Lançar
          </button>
        </div>
      </div>
    </div>
  );
}
