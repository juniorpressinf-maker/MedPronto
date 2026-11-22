import { Copy, Percent, RotateCcw, Save, Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ApiError,
  api,
  type CobrancaMatrizPrecos,
} from "../../lib/api";
import { useMessageBox } from "../../lib/messageBoxContext";
import "./cobranca-precos.css";

/**
 * Tabela de preços em grade (procedimento × convênio), no molde do CliniCar:
 * teclado de planilha, célula vazia = sem preço, reajuste e cópia de coluna em lote.
 */

const chave = (procId: number, convId: number) => `${procId}:${convId}`;

function fmt(c: number) {
  return (c / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** "" → null (sem preço); texto inválido → NaN. */
function ler(texto: string): number | null {
  const s = texto.trim().replace(/\s/g, "").replace(/^R\$/i, "");
  if (s === "") return null;
  const normal = s.includes(",")
    ? s.replace(/\./g, "").replace(",", ".")
    : /^\d{1,3}(\.\d{3})+$/.test(s)
      ? s.replace(/\./g, "")
      : s;
  if (!/^\d+(\.\d{0,2})?$/.test(normal)) return Number.NaN;
  return Math.round(Number(normal) * 100);
}

function arredondar(c: number, passo: number) {
  return passo <= 1 ? Math.round(c) : Math.round(c / passo) * passo;
}

export function CobrancaPrecosPage() {
  const mb = useMessageBox();
  const [matriz, setMatriz] = useState<CobrancaMatrizPrecos | null>(null);
  const [loading, setLoading] = useState(true);
  const [edicoes, setEdicoes] = useState<Record<string, string>>({});
  const [busca, setBusca] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [lote, setLote] = useState<"reajuste" | "copia" | null>(null);
  const [reajCol, setReajCol] = useState("todas");
  const [reajPct, setReajPct] = useState("");
  const [reajPasso, setReajPasso] = useState("1");
  const [copDe, setCopDe] = useState("");
  const [copPara, setCopPara] = useState("");
  const [copPct, setCopPct] = useState("");
  const [copSoVazias, setCopSoVazias] = useState(true);
  const tabelaRef = useRef<HTMLTableElement>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      setMatriz(await api.cobrancaPrecosGet());
    } catch (e) {
      setMsg({ tipo: "erro", texto: e instanceof ApiError ? e.message : "Erro ao carregar" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const colunas = useMemo(
    () =>
      (matriz?.convenios ?? [])
        .filter((c) => c.ativo !== 0)
        .sort((a, b) =>
          a.tipo === b.tipo
            ? a.nome.localeCompare(b.nome, "pt-BR")
            : a.tipo === "particular"
              ? -1
              : 1,
        ),
    [matriz],
  );

  const base = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of matriz?.precos ?? []) m[chave(p.procedimento_id, p.convenio_id)] = p.valor_centavos;
    return m;
  }, [matriz]);

  /** Valor atual da célula (com a edição, se houver). undefined = texto inválido. */
  const valorAtual = useCallback(
    (k: string): number | null | undefined => {
      if (k in edicoes) {
        const v = ler(edicoes[k]);
        return Number.isNaN(v) ? undefined : v;
      }
      return base[k] ?? null;
    },
    [edicoes, base],
  );

  const alterados = useMemo(() => {
    const out: { procedimento_id: number; convenio_id: number; valor_centavos: number | null }[] = [];
    let invalidos = 0;
    for (const k of Object.keys(edicoes)) {
      const v = valorAtual(k);
      if (v === undefined) {
        invalidos += 1;
        continue;
      }
      if (v !== (base[k] ?? null)) {
        const [p, c] = k.split(":").map(Number);
        out.push({ procedimento_id: p, convenio_id: c, valor_centavos: v });
      }
    }
    return { itens: out, invalidos };
  }, [edicoes, valorAtual, base]);

  const sujo = alterados.itens.length > 0 || alterados.invalidos > 0;
  useEffect(() => {
    if (!sujo) return;
    const aviso = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, [sujo]);

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (matriz?.procedimentos ?? [])
      .filter((p) => p.ativo !== 0)
      .filter(
        (p) =>
          !q ||
          p.nome.toLowerCase().includes(q) ||
          (p.codigo ?? "").toLowerCase().includes(q),
      )
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [matriz, busca]);

  const editar = (k: string, texto: string) => {
    setMsg(null);
    setEdicoes((e) => ({ ...e, [k]: texto }));
  };

  const desfazerCelula = (k: string) =>
    setEdicoes((e) => {
      const resto = { ...e };
      delete resto[k];
      return resto;
    });

  const focar = (r: number, c: number) => {
    const alvo = tabelaRef.current?.querySelector<HTMLInputElement>(
      `input[data-r="${r}"][data-c="${c}"]`,
    );
    if (alvo) {
      alvo.focus();
      alvo.select();
    }
  };

  const teclas = (e: React.KeyboardEvent<HTMLInputElement>, r: number, c: number, k: string) => {
    const el = e.currentTarget;
    const noInicio = el.selectionStart === 0 && el.selectionEnd === 0;
    const noFim = el.selectionStart === el.value.length && el.selectionEnd === el.value.length;
    const tudo = el.selectionStart === 0 && el.selectionEnd === el.value.length;
    if (e.key === "Enter" || e.key === "ArrowDown") {
      e.preventDefault();
      focar(e.shiftKey && e.key === "Enter" ? r - 1 : r + 1, c);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focar(r - 1, c);
    } else if (e.key === "ArrowRight" && (noFim || tudo)) {
      e.preventDefault();
      focar(r, c + 1);
    } else if (e.key === "ArrowLeft" && (noInicio || tudo)) {
      e.preventDefault();
      focar(r, c - 1);
    } else if (e.key === "Escape") {
      e.preventDefault();
      desfazerCelula(k);
    }
  };

  const salvar = async () => {
    if (alterados.invalidos > 0) {
      setMsg({ tipo: "erro", texto: "Há valores inválidos (em vermelho). Corrija antes de salvar." });
      return;
    }
    if (alterados.itens.length === 0) {
      setMsg({ tipo: "ok", texto: "Nenhuma alteração para salvar." });
      return;
    }
    setSalvando(true);
    try {
      const qtd = alterados.itens.length;
      const m = await api.cobrancaPrecosSave(alterados.itens);
      setMatriz(m);
      setEdicoes({});
      setMsg({ tipo: "ok", texto: `Preços salvos: ${qtd} alteração(ões) gravada(s).` });
    } catch (err) {
      setMsg({ tipo: "erro", texto: err instanceof ApiError ? err.message : "Erro ao salvar" });
    } finally {
      setSalvando(false);
    }
  };

  // Ctrl+S salva enquanto a tabela está aberta.
  const salvarRef = useRef(salvar);
  salvarRef.current = salvar;
  useEffect(() => {
    const atalho = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void salvarRef.current();
      }
    };
    window.addEventListener("keydown", atalho);
    return () => window.removeEventListener("keydown", atalho);
  }, []);

  const descartar = async () => {
    if (sujo && !(await mb.confirm("Descartar todas as alterações não salvas?"))) return;
    setEdicoes({});
    setMsg(null);
  };

  const aplicarReajuste = () => {
    const pct = Number(reajPct.replace(",", "."));
    if (!Number.isFinite(pct) || pct === 0) {
      setMsg({ tipo: "erro", texto: "Informe o percentual do reajuste (ex.: 10 ou -5)." });
      return;
    }
    const passo = Number(reajPasso);
    const cols = reajCol === "todas" ? colunas : colunas.filter((c) => String(c.id) === reajCol);
    const novas: Record<string, string> = {};
    let n = 0;
    for (const p of visiveis) {
      for (const c of cols) {
        const k = chave(p.id, c.id);
        const v = valorAtual(k);
        if (v == null) continue;
        novas[k] = fmt(arredondar(v * (1 + pct / 100), passo));
        n += 1;
      }
    }
    setEdicoes((e) => ({ ...e, ...novas }));
    setMsg({ tipo: "ok", texto: `Reajuste aplicado em ${n} célula(s). Confira e clique em Salvar preços.` });
    setLote(null);
  };

  const aplicarCopia = () => {
    if (!copDe || !copPara || copDe === copPara) {
      setMsg({ tipo: "erro", texto: "Escolha a coluna de origem e uma de destino diferente." });
      return;
    }
    const pct = copPct.trim() ? Number(copPct.replace(",", ".")) : 0;
    if (!Number.isFinite(pct)) {
      setMsg({ tipo: "erro", texto: "Ajuste inválido." });
      return;
    }
    const novas: Record<string, string> = {};
    let n = 0;
    for (const p of visiveis) {
      const origem = valorAtual(chave(p.id, Number(copDe)));
      if (origem == null) continue;
      const kDest = chave(p.id, Number(copPara));
      if (copSoVazias && valorAtual(kDest) != null) continue;
      novas[kDest] = fmt(Math.round(origem * (1 + pct / 100)));
      n += 1;
    }
    setEdicoes((e) => ({ ...e, ...novas }));
    setMsg({ tipo: "ok", texto: `${n} valor(es) copiado(s). Confira e clique em Salvar preços.` });
    setLote(null);
  };

  if (loading || !matriz) {
    return <p className="text-sm text-[var(--muted)] pt-2">Carregando tabela…</p>;
  }

  return (
    <div className="est-card est-card--page flex flex-col min-h-0 w-full max-w-none tp">
      <div className="toolbar cad-toolbar tp-barra">
        <label className="tp-busca">
          <Search className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
          <input
            value={busca}
            placeholder="FILTRAR PROCEDIMENTO OU CÓDIGO..."
            onChange={(e) => setBusca(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setBusca("")}
          />
          {busca ? (
            <button type="button" className="tp-busca__limpar" title="Limpar" onClick={() => setBusca("")}>
              <X className="h-4 w-4" aria-hidden />
            </button>
          ) : null}
        </label>
        <button
          type="button"
          className={`btn${lote === "reajuste" ? " btn-primary" : ""}`}
          onClick={() => setLote(lote === "reajuste" ? null : "reajuste")}
        >
          <Percent className="h-4 w-4" aria-hidden />
          Reajuste
        </button>
        <button
          type="button"
          className={`btn${lote === "copia" ? " btn-primary" : ""}`}
          onClick={() => {
            setCopDe("");
            setCopPara("");
            setLote(lote === "copia" ? null : "copia");
          }}
        >
          <Copy className="h-4 w-4" aria-hidden />
          Copiar coluna
        </button>
        <span className="tp-contador">
          {alterados.itens.length > 0 ? `${alterados.itens.length} alteração(ões)` : "Sem alterações"}
          {alterados.invalidos > 0 ? ` · ${alterados.invalidos} inválido(s)` : ""}
        </span>
        <button type="button" className="btn" disabled={!sujo || salvando} onClick={() => void descartar()}>
          <RotateCcw className="h-4 w-4" aria-hidden />
          Descartar
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!sujo || salvando}
          onClick={() => void salvar()}
          title="Ctrl+S"
        >
          <Save className="h-4 w-4" aria-hidden />
          {salvando ? "Salvando…" : "Salvar preços"}
        </button>
      </div>

      {lote === "reajuste" ? (
        <div className="tp-lote">
          <label>
            Coluna
            <select className="legacy-input" value={reajCol} onChange={(e) => setReajCol(e.target.value)}>
              <option value="todas">Todas</option>
              {colunas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </label>
          <label>
            Percentual (%)
            <input
              className="legacy-input"
              placeholder="10 ou -5"
              value={reajPct}
              onChange={(e) => setReajPct(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && aplicarReajuste()}
            />
          </label>
          <label>
            Arredondar para
            <select className="legacy-input" value={reajPasso} onChange={(e) => setReajPasso(e.target.value)}>
              <option value="1">centavos</option>
              <option value="50">R$ 0,50</option>
              <option value="100">R$ 1,00</option>
              <option value="500">R$ 5,00</option>
            </select>
          </label>
          <button type="button" className="btn btn-primary" onClick={aplicarReajuste}>
            Aplicar
          </button>
          <span className="tp-lote__dica">
            Vale para os procedimentos que estão na tela (use o filtro para reajustar só alguns). Células vazias não mudam.
          </span>
        </div>
      ) : null}

      {lote === "copia" ? (
        <div className="tp-lote">
          <label>
            De
            <select
              className="legacy-input"
              value={copDe}
              onChange={(e) => {
                setCopDe(e.target.value);
                if (e.target.value === copPara) setCopPara("");
              }}
            >
              <option value="">Selecione</option>
              {colunas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </label>
          <label>
            Para
            <select className="legacy-input" value={copPara} onChange={(e) => setCopPara(e.target.value)}>
              <option value="">Selecione</option>
              {colunas.filter((c) => String(c.id) !== copDe).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </label>
          <label>
            Ajuste (%)
            <input
              className="legacy-input"
              placeholder="0, -10…"
              value={copPct}
              onChange={(e) => setCopPct(e.target.value)}
            />
          </label>
          <label className="tp-lote__check">
            <input type="checkbox" checked={copSoVazias} onChange={(e) => setCopSoVazias(e.target.checked)} />
            Só onde o destino está vazio
          </label>
          <button type="button" className="btn btn-primary" onClick={aplicarCopia}>
            Copiar
          </button>
        </div>
      ) : null}

      {msg ? (
        <p className={`tp-msg ${msg.tipo === "erro" ? "tp-msg--erro" : "tp-msg--ok"}`}>{msg.texto}</p>
      ) : null}

      {colunas.length === 0 ? (
        <p className="tp-msg">Cadastre um convênio ativo para montar a tabela.</p>
      ) : (
        <div className="dup-table-wrap tp-wrap">
          <table className="data-table tp-tabela" ref={tabelaRef}>
            <thead>
              <tr>
                <th className="tp-proc">Procedimento</th>
                {colunas.map((c) => (
                  <th key={c.id} className="tp-col">
                    {c.nome}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visiveis.length === 0 ? (
                <tr>
                  <td colSpan={colunas.length + 1}>Nenhum procedimento encontrado.</td>
                </tr>
              ) : (
                visiveis.map((p, linha) => (
                  <tr key={p.id}>
                    <td className="tp-proc">
                      <div className="tp-proc__nome">{p.nome}</div>
                      {p.codigo ? <div className="tp-proc__cod">{p.codigo}</div> : null}
                    </td>
                    {colunas.map((c, ci) => {
                      const k = chave(p.id, c.id);
                      const editado = k in edicoes;
                      const v = valorAtual(k);
                      const invalido = v === undefined;
                      const mudou = editado && !invalido && v !== (base[k] ?? null);
                      const texto = editado ? edicoes[k] : base[k] != null ? fmt(base[k]) : "";
                      return (
                        <td
                          key={c.id}
                          className={`tp-cel${mudou ? " tp-cel--mudou" : ""}${invalido ? " tp-cel--erro" : ""}`}
                          title={
                            mudou
                              ? `Antes: ${base[k] != null ? `R$ ${fmt(base[k])}` : "sem preço"} (Esc desfaz)`
                              : undefined
                          }
                        >
                          <input
                            data-r={linha}
                            data-c={ci}
                            inputMode="decimal"
                            autoComplete="off"
                            className="tp-input"
                            value={texto}
                            placeholder="—"
                            aria-label={`${p.nome} — ${c.nome}`}
                            onFocus={(e) => e.currentTarget.select()}
                            onMouseUp={(e) => e.preventDefault()}
                            onChange={(e) => editar(k, e.target.value)}
                            onKeyDown={(e) => teclas(e, linha, ci, k)}
                            onBlur={() => {
                              if (!editado) return;
                              const lido = ler(edicoes[k]);
                              if (lido === null && base[k] == null) desfazerCelula(k);
                              else if (lido != null && !Number.isNaN(lido)) {
                                if (lido === base[k]) desfazerCelula(k);
                                else setEdicoes((e) => ({ ...e, [k]: fmt(lido) }));
                              }
                            }}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
      <p className="tp-legenda">
        Valores em R$. <strong>Vazio</strong> = sem preço · <strong>0</strong> = gratuito ·{" "}
        <span className="tp-legenda__amarelo">amarelo</span> = alterado (Esc desfaz a célula). Teclado:
        Enter/↓ desce, ↑ sobe, ←/→ troca de coluna, Ctrl+S salva.
      </p>
    </div>
  );
}
