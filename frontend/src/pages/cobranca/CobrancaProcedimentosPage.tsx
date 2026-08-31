import { Plus, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ApiError, api, type CobrancaProcedimento } from "../../lib/api";
import { useMessageBox } from "../../lib/messageBoxContext";
import {
  MODO_CLINICO_AJUDA,
  MODO_CLINICO_LABEL,
  MODOS_CLINICOS,
  type ModoClinico,
} from "../../lib/modoClinico";

const FORM_VAZIO = {
  codigo: "",
  nome: "",
  orientacoes_paciente: "",
  modo_clinico: "nenhum" as ModoClinico,
};

function ultimoAtivoDoModo(
  lista: CobrancaProcedimento[],
  modo: ModoClinico,
): boolean {
  if (modo === "nenhum") return false;
  return lista.filter((p) => p.ativo && p.modo_clinico === modo).length <= 1;
}

export function CobrancaProcedimentosPage() {
  const msg = useMessageBox();
  const [lista, setLista] = useState<CobrancaProcedimento[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [form, setForm] = useState(FORM_VAZIO);
  const [editId, setEditId] = useState<number | null>(null);
  const [editPreparo, setEditPreparo] = useState("");

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      setLista(await api.cobrancaProcedimentosList(q, true));
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }, [msg, q]);

  useEffect(() => {
    const t = window.setTimeout(() => void carregar(), 200);
    return () => window.clearTimeout(t);
  }, [carregar]);

  const incluir = async () => {
    if (!form.nome.trim()) return;
    try {
      await api.cobrancaProcedimentoCreate({
        codigo: form.codigo.trim() || undefined,
        nome: form.nome.trim(),
        orientacoes_paciente: form.orientacoes_paciente.trim() || undefined,
        modo_clinico: form.modo_clinico,
      });
      setForm(FORM_VAZIO);
      void msg.success("Procedimento incluído.");
      await carregar();
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro ao incluir");
    }
  };

  const abrirEdicaoPreparo = (p: CobrancaProcedimento) => {
    setEditId(p.id);
    setEditPreparo(p.orientacoes_paciente ?? "");
  };

  const salvarPreparo = async (id: number) => {
    try {
      await api.cobrancaProcedimentoUpdate(id, {
        orientacoes_paciente: editPreparo.trim() || null,
      });
      setEditId(null);
      void msg.success("Orientações salvas.");
      await carregar();
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro ao salvar");
    }
  };

  const salvarModo = async (p: CobrancaProcedimento, modo: ModoClinico) => {
    if (modo === p.modo_clinico) return;
    try {
      await api.cobrancaProcedimentoUpdate(p.id, { modo_clinico: modo });
      void msg.success("Modo clínico salvo.");
      await carregar();
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro ao salvar modo");
      await carregar();
    }
  };

  const desativar = async (p: CobrancaProcedimento) => {
    const ok = await msg.confirm({
      title: "Desativar procedimento?",
      message: `"${p.nome}" deixará de aparecer em novos lançamentos.`,
      confirmLabel: "Desativar",
    });
    if (!ok) return;
    try {
      await api.cobrancaProcedimentoDelete(p.id);
      void msg.success("Desativado.");
      await carregar();
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro");
    }
  };

  return (
    <div className="est-card est-card--page flex flex-col min-h-0 max-w-6xl">
      <div className="toolbar cad-toolbar px-4 pt-4 gap-2">
        <h3 className="m-0 text-base font-semibold">Procedimentos</h3>
        <input
          className="legacy-input max-w-xs"
          value={q}
          onChange={(e) => setQ(e.target.value.toUpperCase())}
          placeholder="Buscar…"
        />
        <button type="button" className="btn btn-secondary btn-sm ml-auto" onClick={() => void carregar()}>
          <RefreshCw className="inline h-4 w-4" aria-hidden />
        </button>
      </div>

      <div className="p-4 border-b border-[var(--border)]">
        <div className="grid gap-2 sm:grid-cols-4 items-end">
          <label className="text-sm">
            <span className="font-medium block mb-1">Código</span>
            <input
              className="legacy-input w-full"
              value={form.codigo}
              onChange={(e) => setForm((f) => ({ ...f, codigo: e.target.value.toUpperCase() }))}
            />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="font-medium block mb-1">Nome *</span>
            <input
              className="legacy-input w-full"
              value={form.nome}
              onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value.toUpperCase() }))}
              placeholder="Ex.: ENDOSCOPIA"
            />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="font-medium block mb-1">Modo clínico *</span>
            <select
              className="legacy-input w-full"
              value={form.modo_clinico}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  modo_clinico: e.target.value as ModoClinico,
                }))
              }
            >
              {MODOS_CLINICOS.map((m) => (
                <option key={m} value={m}>
                  {MODO_CLINICO_LABEL[m]}
                </option>
              ))}
            </select>
            <span className="text-xs text-[var(--muted)] block mt-1">
              {MODO_CLINICO_AJUDA[form.modo_clinico]}
            </span>
          </label>
          <label className="text-sm sm:col-span-4">
            <span className="font-medium block mb-1">
              Orientações ao paciente (WhatsApp)
            </span>
            <textarea
              className="legacy-input w-full min-h-[3.5rem]"
              value={form.orientacoes_paciente}
              onChange={(e) =>
                setForm((f) => ({ ...f, orientacoes_paciente: e.target.value }))
              }
              placeholder="Ex.: Jejum de 8 horas. Trazer pedido e documento."
            />
            <span className="text-xs text-[var(--muted)] block mt-1">
              No Zap aparece em maiúsculas, separado por exame, com uma linha em
              branco entre cada um (ex.: ENDOSCOPIA = jejum de 12 horas).
            </span>
          </label>
          <button type="button" className="btn btn-primary sm:col-span-4 w-fit" onClick={() => void incluir()}>
            <Plus className="inline h-4 w-4 mr-1" aria-hidden />
            Incluir procedimento
          </button>
        </div>
      </div>

      <div className="est-card--page__area scroll-interno scroll-interno--flex flex-1 min-h-0 px-4 pb-4">
        {loading ? (
          <p className="py-4 text-sm text-[var(--muted)]">Carregando…</p>
        ) : (
          <div className="dup-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Nome</th>
                  <th>Modo clínico</th>
                  <th>Orientações</th>
                  <th>Ativo</th>
                  <th className="text-right pr-5">Ações</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((p) => {
                  const bloqueiaUltimo = ultimoAtivoDoModo(lista, p.modo_clinico);
                  return (
                  <tr key={p.id} className={p.ativo ? "" : "opacity-60"}>
                    <td className="font-mono text-sm">{p.codigo ?? "—"}</td>
                    <td>{p.nome}</td>
                    <td>
                      {p.ativo ? (
                        <select
                          className="legacy-input max-w-[14rem]"
                          value={p.modo_clinico ?? "nenhum"}
                          onChange={(e) =>
                            void salvarModo(p, e.target.value as ModoClinico)
                          }
                        >
                          {MODOS_CLINICOS.map((m) => (
                            <option
                              key={m}
                              value={m}
                              disabled={bloqueiaUltimo && m !== p.modo_clinico}
                            >
                              {MODO_CLINICO_LABEL[m]}
                            </option>
                          ))}
                        </select>
                      ) : (
                        MODO_CLINICO_LABEL[p.modo_clinico] ?? p.modo_clinico
                      )}
                    </td>
                    <td className="text-sm max-w-[16rem] whitespace-normal">
                      {editId === p.id ? (
                        <div className="space-y-1">
                          <textarea
                            className="legacy-input w-full min-h-[3.5rem]"
                            value={editPreparo}
                            onChange={(e) => setEditPreparo(e.target.value)}
                          />
                          <div className="flex gap-1">
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              onClick={() => void salvarPreparo(p.id)}
                            >
                              Salvar
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => setEditId(null)}
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <span className="text-[var(--muted)]">
                          {p.orientacoes_paciente?.trim()
                            ? p.orientacoes_paciente
                            : "—"}
                        </span>
                      )}
                    </td>
                    <td>{p.ativo ? "Sim" : "Não"}</td>
                    <td className="text-right whitespace-nowrap pr-5">
                      {p.ativo ? (
                        <div className="inline-flex justify-end gap-1">
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => abrirEdicaoPreparo(p)}
                          >
                            Orientações
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            disabled={bloqueiaUltimo}
                            title={
                              bloqueiaUltimo
                                ? "Último procedimento ativo deste modo clínico"
                                : undefined
                            }
                            onClick={() => void desativar(p)}
                          >
                            Desativar
                          </button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
