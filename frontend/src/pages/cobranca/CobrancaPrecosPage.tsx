import { Save } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ApiError,
  api,
  type CobrancaMatrizPrecos,
} from "../../lib/api";
import { useMessageBox } from "../../lib/messageBoxContext";

function centavosParaReais(c: number): string {
  return (c / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function reaisParaCentavos(s: string): number {
  const limpo = s.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number.parseFloat(limpo);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

function chavePreco(procId: number, convId: number): string {
  return `${procId}:${convId}`;
}

export function CobrancaPrecosPage() {
  const msg = useMessageBox();
  const [matriz, setMatriz] = useState<CobrancaMatrizPrecos | null>(null);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const m = await api.cobrancaPrecosGet();
      setMatriz(m);
      const map: Record<string, string> = {};
      for (const p of m.precos) {
        map[chavePreco(p.procedimento_id, p.convenio_id)] = centavosParaReais(
          p.valor_centavos,
        );
      }
      setValores(map);
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }, [msg]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const alterados = useMemo(() => {
    if (!matriz) return [];
    const out: {
      procedimento_id: number;
      convenio_id: number;
      valor_centavos: number;
    }[] = [];
    for (const proc of matriz.procedimentos) {
      for (const conv of matriz.convenios) {
        const k = chavePreco(proc.id, conv.id);
        const atual = matriz.precos.find(
          (p) => p.procedimento_id === proc.id && p.convenio_id === conv.id,
        );
        const cent = reaisParaCentavos(valores[k] ?? "0,00");
        if ((atual?.valor_centavos ?? 0) !== cent) {
          out.push({
            procedimento_id: proc.id,
            convenio_id: conv.id,
            valor_centavos: cent,
          });
        }
      }
    }
    return out;
  }, [matriz, valores]);

  const salvar = async () => {
    if (alterados.length === 0) {
      void msg.info("Nenhuma alteração para salvar.");
      return;
    }
    setSaving(true);
    try {
      const m = await api.cobrancaPrecosSave(alterados);
      setMatriz(m);
      const map: Record<string, string> = {};
      for (const p of m.precos) {
        map[chavePreco(p.procedimento_id, p.convenio_id)] = centavosParaReais(
          p.valor_centavos,
        );
      }
      setValores(map);
      void msg.success("Preços salvos.");
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !matriz) {
    return <p className="text-sm text-[var(--muted)] pt-2">Carregando tabela…</p>;
  }

  return (
    <div className="est-card est-card--page flex flex-col min-h-0 w-full max-w-none">
      <div className="toolbar cad-toolbar px-4 pt-4 flex-wrap gap-2">
        <h3 className="m-0 text-base font-semibold flex-1 min-w-[12rem]">
          Tabela de preços
        </h3>
        <span className="text-sm text-[var(--muted)]">
          {alterados.length > 0 ? `${alterados.length} alteração(ões)` : "Sem alterações"}
        </span>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={saving || alterados.length === 0}
          onClick={() => void salvar()}
        >
          <Save className="inline h-4 w-4 mr-1" aria-hidden />
          {saving ? "Salvando…" : "Salvar preços"}
        </button>
      </div>

      <p className="px-4 m-0 text-xs text-[var(--muted)]">
        Valores em reais (R$) por procedimento e convênio. Novos convênios e
        procedimentos ganham linha/coluna automaticamente.
      </p>

      <div className="est-card--page__area scroll-interno scroll-interno--flex flex-1 min-h-0 p-4 pt-2">
        <div className="dup-table-wrap overflow-x-auto">
          <table className="data-table cobranca-precos-grid">
            <thead>
              <tr>
                <th className="sticky left-0 bg-white z-[1] min-w-[10rem]">
                  Procedimento
                </th>
                {matriz.convenios.map((c) => (
                  <th key={c.id} className="text-center min-w-[7rem] whitespace-nowrap">
                    {c.nome}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matriz.procedimentos.map((proc) => (
                <tr key={proc.id}>
                  <td className="sticky left-0 bg-white z-[1] font-medium">
                    <div>{proc.nome}</div>
                    {proc.codigo ? (
                      <div className="text-xs text-[var(--muted)] font-mono">
                        {proc.codigo}
                      </div>
                    ) : null}
                  </td>
                  {matriz.convenios.map((conv) => {
                    const k = chavePreco(proc.id, conv.id);
                    return (
                      <td key={conv.id} className="p-1">
                        <input
                          type="text"
                          inputMode="decimal"
                          className="legacy-input w-full text-right text-sm cobranca-preco-input"
                          value={valores[k] ?? "0,00"}
                          onFocus={(e) => e.currentTarget.select()}
                          onMouseUp={(e) => e.preventDefault()}
                          onChange={(e) =>
                            setValores((v) => ({ ...v, [k]: e.target.value }))
                          }
                          onBlur={() => {
                            const c = reaisParaCentavos(valores[k] ?? "0");
                            setValores((v) => ({
                              ...v,
                              [k]: centavosParaReais(c),
                            }));
                          }}
                          aria-label={`${proc.nome} — ${conv.nome}`}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
