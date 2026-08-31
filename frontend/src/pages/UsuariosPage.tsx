import { Plus, RefreshCw, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { VoltarButton } from "../components/VoltarButton";
import {
  ApiError,
  api,
  type Perfil,
  type UsuarioRow,
} from "../lib/api";
import { permissoesPadraoDoPerfil } from "../lib/permissoesDefaults";
import { LOGIN_NAO_EMAIL_MSG, loginPareceEmail } from "../lib/login";
import { isFormDirty, snapshotForm } from "../lib/formDirty";
import { useFocusFirstField } from "../lib/useFocusFirstField";
import { useMessageBox } from "../lib/messageBoxContext";
import { SortableTh, useTableSort } from "../lib/useTableSort";
import { useTableRowNavScroll } from "../lib/useTableRowNavScroll";

type ModuloOpt = { codigo: string; label: string };

const PERFIL_LABEL: Record<Perfil, string> = {
  admin: "Administrador",
  medico: "Médico",
  secretaria: "Secretaria",
};

type UsuarioFormState = {
  nome: string;
  login: string;
  senha: string;
  perfil: Perfil;
  crm: string;
  permissoes: string[];
  ativo: boolean;
};

function emptyUsuarioForm(
  perfil: Perfil = "secretaria",
  modulosDisponiveis?: string[],
): UsuarioFormState {
  return {
    nome: "",
    login: "",
    senha: "",
    perfil,
    crm: "",
    permissoes: permissoesPadraoDoPerfil(perfil, modulosDisponiveis),
    ativo: true,
  };
}

function snapshotUsuarioForm(f: UsuarioFormState) {
  return snapshotForm(f);
}

function sugerirLoginDeNome(nome: string): string {
  const base = nome
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .split(/\s+/)[0] ?? "";
  return base.replace(/[^a-z0-9._-]/g, "").slice(0, 30);
}

function loginPareceSenha(login: string): boolean {
  return /^\d+$/.test(login);
}

export function UsuariosPage() {
  const msg = useMessageBox();
  const [rows, setRows] = useState<UsuarioRow[]>([]);
  const [modulos, setModulos] = useState<ModuloOpt[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"list" | "form">("list");
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<UsuarioFormState>(() => emptyUsuarioForm());
  const [baseline, setBaseline] = useState(() => snapshotUsuarioForm(emptyUsuarioForm()));

  const {
    scrollRef: tableScrollRef,
    focusRowId,
    rowRef: focusRowRef,
    clearFocus: clearRowNavFocus,
    handleRowClick,
    handleRowKeyDown,
  } = useTableRowNavScroll<number>();

  const comparators = useMemo(
    () => ({
      nome: (a: UsuarioRow, b: UsuarioRow) =>
        a.nome.localeCompare(b.nome, "pt-BR") || a.id - b.id,
      login: (a: UsuarioRow, b: UsuarioRow) =>
        a.login.localeCompare(b.login, "pt-BR") || a.id - b.id,
      perfil: (a: UsuarioRow, b: UsuarioRow) =>
        a.perfil.localeCompare(b.perfil, "pt-BR") || a.id - b.id,
      ativo: (a: UsuarioRow, b: UsuarioRow) =>
        Number(a.ativo) - Number(b.ativo) || a.id - b.id,
    }),
    [],
  );

  const { sortCol, sortDir, sortedRows, toggleSort } = useTableSort(
    rows,
    comparators,
  );
  const listRowIds = useMemo(() => sortedRows.map((r) => r.id), [sortedRows]);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const [users, mods] = await Promise.all([
        api.usuariosList(),
        api.usuariosModulos(),
      ]);
      const term = q.trim().toLowerCase();
      setRows(
        term
          ? users.filter(
              (u) =>
                u.nome.toLowerCase().includes(term) ||
                u.login.toLowerCase().includes(term),
            )
          : users,
      );
      setModulos(mods.modulos);
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro ao listar");
    } finally {
      setLoading(false);
    }
  }, [msg, q]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useFocusFirstField([mode, loading], { enabled: !loading });

  const formDirty = useMemo(
    () => mode === "form" && isFormDirty(snapshotUsuarioForm(form), baseline),
    [mode, form, baseline],
  );

  const abrirNovo = (perfil: Perfil = "secretaria") => {
    setEditId(null);
    const next = emptyUsuarioForm(
      perfil,
      modulos.map((m) => m.codigo),
    );
    setForm(next);
    setBaseline(snapshotUsuarioForm(next));
    setMode("form");
    clearRowNavFocus();
  };

  const abrirEditar = async (id: number) => {
    try {
      const u = await api.usuarioGet(id);
      setEditId(id);
      const next: UsuarioFormState = {
        nome: u.nome,
        login: u.login,
        senha: "",
        perfil: u.perfil,
        crm: u.crm ?? "",
        permissoes: u.permissoes,
        ativo: Boolean(u.ativo),
      };
      setForm(next);
      setBaseline(snapshotUsuarioForm(next));
      setMode("form");
      clearRowNavFocus();
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro");
    }
  };

  const toggleModulo = (codigo: string) => {
    setForm((f) => ({
      ...f,
      permissoes: f.permissoes.includes(codigo)
        ? f.permissoes.filter((m) => m !== codigo)
        : [...f.permissoes, codigo],
    }));
  };

  const onPerfilChange = (perfil: Perfil) => {
    const disponiveis = modulos.map((m) => m.codigo);
    setForm((f) => ({
      ...f,
      perfil,
      permissoes: permissoesPadraoDoPerfil(perfil, disponiveis),
    }));
  };

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const loginNorm = form.login.trim().toLowerCase();
      const senhaNorm = form.senha;
      const body = {
        nome: form.nome.trim(),
        login: loginNorm,
        perfil: form.perfil,
        crm: form.crm.trim() || undefined,
        permissoes: form.permissoes,
        ativo: form.ativo,
        ...(senhaNorm ? { senha: senhaNorm } : {}),
      };
      if (editId) {
        await api.usuarioSave(body, editId);
        void msg.success(
          senhaNorm
            ? `Usuário atualizado. Entrar com login «${loginNorm}» e a nova senha.`
            : `Usuário atualizado. Login de acesso: «${loginNorm}».`,
        );
        setMode("list");
        setEditId(null);
      } else {
        if (!senhaNorm || senhaNorm.length < 6) {
          void msg.warning("Senha mínima 6 caracteres");
          setSaving(false);
          return;
        }
        if (loginNorm === senhaNorm) {
          void msg.warning(
            "Login e senha iguais. O login é o usuário de entrada (ex.: paula), não repita a senha no campo Login.",
          );
          setSaving(false);
          return;
        }
        if (loginPareceEmail(loginNorm)) {
          void msg.warning(LOGIN_NAO_EMAIL_MSG);
          setSaving(false);
          return;
        }
        if (loginPareceSenha(loginNorm)) {
          void msg.warning(
            "Login não pode ser só números — parece senha no campo errado. Use um nome (ex.: paula).",
          );
          setSaving(false);
          return;
        }
        await api.usuarioSave({ ...body, senha: senhaNorm });
        void msg.success(
          `Usuário criado. Na tela Entrar use login «${loginNorm}» e a senha definida (não use o nome completo).`,
        );
        setMode("list");
        setEditId(null);
      }
      await carregar();
    } catch (err) {
      void msg.error(err instanceof ApiError ? err.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const voltarLista = () => {
    setMode("list");
    setEditId(null);
    clearRowNavFocus();
  };

  const formTitle = editId ? "Alteracao — Usuarios" : "Inclusao — Usuarios";

  return (
    <div className="page-stack flex-1 min-h-0 overflow-hidden">
      <PageHeader
        title={mode === "form" ? formTitle : "Usuarios"}
        subtitle={mode === "list" ? "Permissoes por modulo" : undefined}
      />

      <div className="page-stack flex-1 min-h-0 overflow-hidden px-4 pb-4">
        <div className="est-card est-card--page flex flex-col min-h-0 overflow-hidden flex-1 p-4">
          {mode === "list" ? (
            <div className="flex flex-col min-h-0 overflow-hidden flex-1 space-y-4">
              <div className="toolbar cad-toolbar">
                <div className="toolbar-search">
                  <Search className="toolbar-search__icon" />
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value.toUpperCase())}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        clearRowNavFocus();
                        void carregar();
                      }
                    }}
                    placeholder="Buscar nome ou login — Enter"
                    className="legacy-input"
                  />
                </div>
              </div>

              <div className="dup-painel-scroll scroll-interno scroll-interno--flex flex-1 min-h-0">
                <div className="dup-painel-interno">
                  <div className="dup-acoes-bar">
                    <button
                      type="button"
                      onClick={() => abrirNovo()}
                      className="btn btn-secondary btn-novo-compact"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Novo
                    </button>
                    <button
                      type="button"
                      onClick={() => void carregar()}
                      className="btn btn-primary btn-sm"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Atualizar
                    </button>
                    <span className="dup-acoes-bar__hint text-sm text-slate-600">
                      1 clique: ↑↓ navegar registros — ←→ rolar colunas — 2 cliques: alterar
                    </span>
                  </div>
                  <div
                    ref={tableScrollRef}
                    className="dup-table-wrap dup-table-wrap--scroll-y panel panel-table"
                  >
                    <table className="data-table">
                      <thead>
                        <tr>
                          <SortableTh
                            col="nome"
                            label="Nome"
                            sortCol={sortCol}
                            sortDir={sortDir}
                            onSort={toggleSort}
                          />
                          <SortableTh
                            col="login"
                            label="Login"
                            sortCol={sortCol}
                            sortDir={sortDir}
                            onSort={toggleSort}
                          />
                          <SortableTh
                            col="perfil"
                            label="Perfil"
                            sortCol={sortCol}
                            sortDir={sortDir}
                            onSort={toggleSort}
                          />
                          <SortableTh
                            col="ativo"
                            label="Ativo"
                            sortCol={sortCol}
                            sortDir={sortDir}
                            onSort={toggleSort}
                          />
                          <th className="data-table__actions">Acoes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {loading && (
                          <tr>
                            <td colSpan={5} className="data-table__empty">
                              Carregando…
                            </td>
                          </tr>
                        )}
                        {!loading && sortedRows.length === 0 && (
                          <tr>
                            <td colSpan={5} className="data-table__empty">
                              Nenhum usuario
                            </td>
                          </tr>
                        )}
                        {!loading &&
                          sortedRows.map((row) => {
                            const isNav = focusRowId === row.id;
                            return (
                              <tr
                                key={row.id}
                                ref={isNav ? focusRowRef : undefined}
                                tabIndex={isNav ? 0 : -1}
                                title="1 clique: ↑↓ navegar — 2 cliques: alterar"
                                className={`row-clickable${isNav ? " row-nav-focus" : ""}`}
                                onClick={(ev) =>
                                  handleRowClick(row.id, ev, (id) => {
                                    void abrirEditar(id);
                                  })
                                }
                                onKeyDown={(ev) =>
                                  handleRowKeyDown(ev, row.id, listRowIds, (id) => {
                                    void abrirEditar(id);
                                  })
                                }
                              >
                                <td>{row.nome}</td>
                                <td>{row.login}</td>
                                <td>{PERFIL_LABEL[row.perfil] ?? row.perfil}</td>
                                <td>{row.ativo ? "Sim" : "Não"}</td>
                                <td className="data-table__actions" />
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <form
              onSubmit={(e) => void salvar(e)}
              className="scroll-interno p-4 space-y-4 max-w-2xl"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block space-y-1 sm:col-span-2">
                  <span className="text-sm font-medium">Nome *</span>
                  <input
                    className="legacy-input w-full"
                    value={form.nome}
                    onChange={(e) => {
                      const nome = e.target.value.toUpperCase();
                      setForm((f) => {
                        const sugestao = sugerirLoginDeNome(nome);
                        const loginAuto =
                          !editId &&
                          (!f.login || f.login === sugerirLoginDeNome(f.nome));
                        return {
                          ...f,
                          nome,
                          login: loginAuto ? sugestao : f.login,
                        };
                      });
                    }}
                    required
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-sm font-medium">Login *</span>
                  <input
                    className="legacy-input w-full"
                    value={form.login}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        login: e.target.value.toLowerCase().replace(/\s+/g, ""),
                      })
                    }
                    autoComplete="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    placeholder="ex.: maria (usado na tela Entrar)"
                    required
                    disabled={!!editId}
                  />
                  <span className="block text-xs text-[var(--muted)]">
                    Usuário da tela Entrar — preenchido automaticamente pelo nome; pode
                    ajustar. Não use a senha aqui.
                  </span>
                </label>
                <label className="block space-y-1">
                  <span className="text-sm font-medium">
                    {editId
                      ? "Nova senha (deixe em branco para manter a atual)"
                      : "Senha *"}
                  </span>
                  <input
                    type="password"
                    className="legacy-input w-full"
                    value={form.senha}
                    onChange={(e) => setForm({ ...form, senha: e.target.value })}
                    required={!editId}
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-sm font-medium">Perfil *</span>
                  <select
                    className="legacy-input w-full"
                    value={form.perfil}
                    onChange={(e) =>
                      onPerfilChange(e.target.value as Perfil)
                    }
                  >
                    <option value="secretaria">Secretaria</option>
                    <option value="medico">Médico</option>
                    <option value="admin">Administrador</option>
                  </select>
                </label>
                {form.perfil === "medico" ? (
                  <label className="block space-y-1">
                    <span className="text-sm font-medium">CRM</span>
                    <input
                      className="legacy-input w-full"
                      value={form.crm}
                      onChange={(e) => setForm({ ...form, crm: e.target.value })}
                    />
                  </label>
                ) : null}
                <fieldset className="sm:col-span-2 border border-[var(--border)] rounded-lg p-3">
                  <legend className="text-sm font-medium px-1">
                    Modulos permitidos
                  </legend>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                    {modulos.map((m) => (
                      <label
                        key={m.codigo}
                        className="flex items-center gap-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={form.permissoes.includes(m.codigo)}
                          onChange={() => toggleModulo(m.codigo)}
                        />
                        {m.label}
                      </label>
                    ))}
                  </div>
                </fieldset>
              </div>
              {editId ? (
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.ativo}
                    onChange={(e) =>
                      setForm({ ...form, ativo: e.target.checked })
                    }
                  />
                  <span className="text-sm">Ativo</span>
                </label>
              ) : null}
              <div className="form-actions">
                <VoltarButton type="button" onClick={voltarLista}>
                  Voltar
                </VoltarButton>
                <div className="form-actions__direita">
                  <button
                    type="submit"
                    disabled={saving || !formDirty}
                    className="btn btn-primary agenda-big-action"
                  >
                    {saving
                      ? "Salvando…"
                      : editId
                        ? "Salvar alterações"
                        : "Salvar"}
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
