import { useCallback, useEffect, useState } from "react";
import { FlaskConical, Pill, Plus, Search } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { ApiError, api, type ItemCatalogo, type TipoCatalogo } from "../lib/api";
import { useMessageBox } from "../lib/messageBoxContext";

const ORIGEM: Record<ItemCatalogo["origem"], string> = {
  oficial: "Lista oficial",
  clinica: "Cadastrado na clínica",
  uso: "Digitado em atendimento",
};

/** Nomes sugeridos na receita e no pedido de exames (Cadastros → Medicamentos/Exames). */
export function CatalogoNomesPage() {
  const msg = useMessageBox();
  const [tipo, setTipo] = useState<TipoCatalogo>("medicamento");
  const [q, setQ] = useState("");
  const [itens, setItens] = useState<ItemCatalogo[]>([]);
  const [carregando, setCarregando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      setItens((await api.catalogoListar(tipo, q.trim())).itens);
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro ao carregar");
    } finally {
      setCarregando(false);
    }
  }, [tipo, q, msg]);

  // Busca enquanto digita (espera curta).
  useEffect(() => {
    const t = setTimeout(() => void carregar(), 250);
    return () => clearTimeout(t);
  }, [carregar]);

  const rotulo = tipo === "medicamento" ? "medicamento" : "exame";

  const incluir = async () => {
    const nome = await msg.prompt({
      title: `Incluir ${rotulo}`,
      message: `Nome do ${rotulo} (aparece nas sugestões ao digitar).`,
      inputLabel: "Nome",
      valorInicial: q.trim().toUpperCase(),
      minLength: 2,
      maxLength: 200,
      confirmLabel: "Incluir",
    });
    if (!nome) return;
    try {
      await api.catalogoSalvar(tipo, nome, true);
      void msg.success(`${nome.toUpperCase()} incluído`);
      void carregar();
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro ao incluir");
    }
  };

  const renomear = async (item: ItemCatalogo) => {
    if (item.id == null) return;
    const nome = await msg.prompt({
      title: `Corrigir nome`,
      message: "Receitas e pedidos já feitos não mudam — só a sugestão.",
      inputLabel: "Nome",
      valorInicial: item.nome,
      minLength: 2,
      maxLength: 200,
      confirmLabel: "Salvar",
    });
    if (!nome || nome === item.nome) return;
    try {
      await api.catalogoAtualizar(tipo, item.id, { nome });
      void carregar();
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro ao salvar");
    }
  };

  const alternarAtivo = async (item: ItemCatalogo) => {
    try {
      if (item.id == null) await api.catalogoSalvar(tipo, item.nome, !item.ativo);
      else await api.catalogoAtualizar(tipo, item.id, { ativo: !item.ativo });
      void carregar();
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro ao salvar");
    }
  };

  return (
    <div className="page-stack flex-1 min-h-0 overflow-hidden">
      <PageHeader
        title="Medicamentos/Exames"
        subtitle="Nomes sugeridos ao digitar na receita e no pedido de exames (ANVISA / TUSS + o que a clínica usa)"
        actions={
          <button type="button" className="btn btn-primary btn-sm" onClick={() => void incluir()}>
            <Plus className="h-4 w-4" />
            Incluir {rotulo}
          </button>
        }
      />
      <div className="page-stack flex-1 min-h-0 overflow-hidden px-4 pb-4">
        {/* Pastas suspensas: a aba ativa "encaixa" no cartão abaixo. */}
        <nav className="pasta-abas" role="tablist" aria-label="Tipo de cadastro">
          {(["medicamento", "exame"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tipo === t}
              className={`pasta-aba${tipo === t ? " pasta-aba--ativa" : ""}`}
              onClick={() => setTipo(t)}
            >
              {t === "medicamento" ? <Pill className="h-4 w-4" /> : <FlaskConical className="h-4 w-4" />}
              {t === "medicamento" ? "Medicamentos" : "Exames"}
            </button>
          ))}
        </nav>
        <div className="est-card est-card--page pasta-conteudo flex flex-col min-h-0 overflow-hidden flex-1">
          <div className="toolbar toolbar--cadastro px-4 py-3 border-b border-[var(--border)] flex flex-wrap gap-3 items-end">
            <label className="toolbar-search flex-1 min-w-[12rem]">
              <Search className="h-4 w-4 shrink-0 opacity-60" />
              <input
                className="legacy-input w-full"
                placeholder={`Buscar ${rotulo}…`}
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </label>
          </div>
          <div className="est-card--page__area scroll-interno min-h-0 flex-1">
            <div className="dup-table-wrap">
              <div className="data-table-scroll">
                <table className="data-table w-full">
                  <thead>
                    <tr>
                      <th>Nome</th>
                      <th>Origem</th>
                      <th>Usos</th>
                      <th>Situação</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {itens.map((item) => (
                      <tr key={`${item.id ?? "u"}-${item.nome}`} className={item.ativo ? "" : "opacity-60"}>
                        <td>{item.nome}</td>
                        <td>{ORIGEM[item.origem]}</td>
                        <td>{item.usos || "—"}</td>
                        <td>{item.ativo ? "Sugerido" : "Desativado"}</td>
                        <td className="whitespace-nowrap text-right">
                          {item.id != null ? (
                            <button type="button" className="btn btn-secondary btn-sm mr-2" onClick={() => void renomear(item)}>
                              Corrigir
                            </button>
                          ) : null}
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void alternarAtivo(item)}>
                            {item.ativo ? "Desativar" : "Ativar"}
                          </button>
                        </td>
                      </tr>
                    ))}
                    {!itens.length && !carregando ? (
                      <tr>
                        <td colSpan={5} className="text-center text-[var(--muted)] py-6">
                          Nenhum {rotulo} encontrado.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <p className="px-4 py-2 text-xs text-[var(--muted)] border-t border-[var(--border)] mb-0">
            Mostra até 100 itens — digite para filtrar. Os mais usados aparecem primeiro.
          </p>
        </div>
      </div>
    </div>
  );
}
