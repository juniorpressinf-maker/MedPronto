import { Plus, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ApiError, api, type CobrancaConvenio } from "../../lib/api";
import { useMessageBox } from "../../lib/messageBoxContext";

const TIPO_LABEL = { particular: "Particular", operadora: "Operadora" } as const;

export function CobrancaConveniosPage() {
  const msg = useMessageBox();
  const [lista, setLista] = useState<CobrancaConvenio[]>([]);
  const [loading, setLoading] = useState(true);
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<"operadora">("operadora");
  const [exigeGuia, setExigeGuia] = useState(true);
  const [editId, setEditId] = useState<number | null>(null);
  const [editNome, setEditNome] = useState("");
  const [editExigeGuia, setEditExigeGuia] = useState(true);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      setLista(await api.cobrancaConveniosList(true));
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }, [msg]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const incluir = async () => {
    if (!nome.trim()) return;
    try {
      await api.cobrancaConvenioCreate({ nome: nome.trim(), tipo, exige_guia: exigeGuia });
      setNome("");
      setExigeGuia(true);
      void msg.success("Convênio incluído.");
      await carregar();
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro ao incluir");
    }
  };

  const salvarEdicao = async (id: number) => {
    try {
      await api.cobrancaConvenioUpdate(id, {
        nome: editNome.trim(),
        exige_guia: editExigeGuia,
      });
      setEditId(null);
      void msg.success("Salvo.");
      await carregar();
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro ao salvar");
    }
  };

  const alternarAtivo = async (c: CobrancaConvenio) => {
    if (c.id === 1) {
      void msg.warning("Particular não pode ser desativado.");
      return;
    }
    try {
      await api.cobrancaConvenioUpdate(c.id, { ativo: c.ativo ? 0 : 1 });
      await carregar();
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro");
    }
  };

  return (
    <div className="est-card est-card--page flex flex-col min-h-0 max-w-4xl">
      <div className="toolbar cad-toolbar px-4 pt-4">
        <h3 className="m-0 text-base font-semibold flex-1">Convênios</h3>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => void carregar()}>
          <RefreshCw className="inline h-4 w-4" aria-hidden />
        </button>
      </div>

      <div className="p-4 border-b border-[var(--border)]">
        <div className="flex flex-wrap gap-2 items-end">
          <label className="text-sm flex-1 min-w-[12rem]">
            <span className="font-medium block mb-1">Nome</span>
            <input
              className="legacy-input w-full"
              value={nome}
              onChange={(e) => setNome(e.target.value.toUpperCase())}
              placeholder="Ex.: UNIMED"
            />
          </label>
          <label className="text-sm">
            <span className="font-medium block mb-1">Tipo</span>
            <select
              className="legacy-input"
              value={tipo}
              onChange={() => setTipo("operadora")}
            >
              <option value="operadora">Operadora</option>
            </select>
          </label>
          <label className="text-sm flex items-center gap-2 pb-1">
            <input
              type="checkbox"
              checked={exigeGuia}
              onChange={(e) => setExigeGuia(e.target.checked)}
            />
            <span>Exige guia por atendimento</span>
          </label>
          <button type="button" className="btn btn-primary" onClick={() => void incluir()}>
            <Plus className="inline h-4 w-4 mr-1" aria-hidden />
            Incluir
          </button>
        </div>
      </div>

      <div className="est-card--page__area scroll-interno scroll-interno--flex flex-1 min-h-0">
        {loading ? (
          <p className="p-4 text-sm text-[var(--muted)]">Carregando…</p>
        ) : (
          <div className="dup-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Tipo</th>
                  <th>Guia/atend.</th>
                  <th>Ativo</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lista.map((c) => (
                  <tr key={c.id} className={c.ativo ? "" : "opacity-60"}>
                    <td>
                      {editId === c.id ? (
                        <input
                          className="legacy-input w-full"
                          value={editNome}
                          onChange={(e) => setEditNome(e.target.value.toUpperCase())}
                        />
                      ) : (
                        c.nome
                      )}
                    </td>
                    <td>{TIPO_LABEL[c.tipo]}</td>
                    <td>
                      {c.tipo === "particular" ? (
                        "—"
                      ) : editId === c.id ? (
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={editExigeGuia}
                            onChange={(e) => setEditExigeGuia(e.target.checked)}
                          />
                          Exige guia
                        </label>
                      ) : c.exige_guia ? (
                        "Sim"
                      ) : (
                        "Repasse mensal"
                      )}
                    </td>
                    <td>{c.ativo ? "Sim" : "Não"}</td>
                    <td className="text-right whitespace-nowrap">
                      {editId === c.id ? (
                        <>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm mr-1"
                            onClick={() => void salvarEdicao(c.id)}
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
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm mr-1"
                            onClick={() => {
                              setEditId(c.id);
                              setEditNome(c.nome);
                              setEditExigeGuia(c.exige_guia !== 0);
                            }}
                          >
                            Editar
                          </button>
                          {c.id !== 1 ? (
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => void alternarAtivo(c)}
                            >
                              {c.ativo ? "Desativar" : "Ativar"}
                            </button>
                          ) : null}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
