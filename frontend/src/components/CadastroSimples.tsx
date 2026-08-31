import { Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { VoltarButton } from "./VoltarButton";
import { ApiError, api } from "../lib/api";
import {
  applyPickToForm,
  peekCadastroReturn,
  takeCadastroReturn,
} from "../lib/cadastroReturn";
import { useMessageBox } from "../lib/messageBoxContext";
import { isFormDirty, snapshotForm } from "../lib/formDirty";
import { validarCpfOpcional } from "../lib/cpf";
import { validarEmailOpcional, validarTelefoneOpcional } from "../lib/validacoes";
import { focusFirstField } from "../lib/focusFirstField";
import { loadScreenState, saveScreenState } from "../lib/screenState";
import { useFocusFirstField } from "../lib/useFocusFirstField";
import { SortableTh, useTableSort } from "../lib/useTableSort";
import { useTableRowNavScroll } from "../lib/useTableRowNavScroll";
import { PageHeader } from "./PageHeader";

type CadastroScreenState = {
  mode: "list" | "form";
  q: string;
  editId: number | null;
  form: Record<string, string>;
  ativo: boolean;
  focusRowId: number | null;
  scrollTop: number;
};

export type CadastroField = {
  key: string;
  label: string;
  type?: "text" | "tel" | "email" | "textarea" | "date" | "password";
  required?: boolean;
  /** Obrigatório só na inclusão (ex.: senha na edição pode ficar em branco). */
  requiredOnCreate?: boolean;
  /** Rótulo alternativo no modo alteração. */
  labelWhenEdit?: string;
  /** Texto de ajuda abaixo do campo (inclusão). */
  hint?: string;
  /** Texto de ajuda no modo alteração. */
  hintWhenEdit?: string;
  /** Campo somente leitura ao alterar registro existente. */
  readOnlyOnEdit?: boolean;
  maxLength?: number;
  placeholder?: string;
  colSpan?: 1 | 2 | 3 | 4;
  rows?: number;
};

type Row = { id: number; ativo?: number; [key: string]: unknown };

type Props = {
  title: string;
  subtitle?: string;
  resource: string;
  fields: CadastroField[];
  listColumns: { key: string; label: string; render?: (row: Row) => string }[];
  emptyLabel?: string;
  searchPlaceholder?: string;
  /** Codigo automatico (somente leitura na inclusao) */
  autoCodigo?: boolean | { key?: string; label?: string };
  /** Exibe coluna e checkbox Ativo (cadastros do Agenda) */
  showAtivo?: boolean;
  /** Texto do botao voltar quando ha retorno de outra tela */
  voltarRetornoLabel?: string;
  /** Botao Agendar na lista (ex.: pacientes → agenda do dia) */
  onAgendar?: (row: Row) => void;
  /** Botao Anexar exame na lista (secretaria) */
  onAnexarExame?: (row: Row) => void;
  /** Recarrega a lista quando o número muda (ex.: após anexar exame) */
  listRefreshTick?: number;
  /** Conteúdo extra no formulário de edição (ex.: histórico admissional) */
  formExtra?: (ctx: { editId: number; form: Record<string, string> }) => ReactNode;
  /** `full` — card ocupa toda a área (edição com painéis extras); `fit` — card estreito; `wide` — card largo, formulário em mais colunas */
  formCardLayout?: "fit" | "full" | "wide";
  /** Colunas do grid do formulário (padrão 2) */
  formGridCols?: 2 | 3 | 4;
};

const emptyForm = (fields: CadastroField[]) =>
  Object.fromEntries(fields.map((f) => [f.key, ""])) as Record<string, string>;

function fieldUsesUppercase(f: CadastroField) {
  return f.type !== "email" && f.type !== "tel" && f.type !== "date";
}

function formatFieldValue(
  f: CadastroField | undefined,
  value: unknown,
  key?: string,
) {
  if (value == null || String(value).trim() === "") return "—";
  if (key === "codigo") return String(value).trim();
  if (f && fieldUsesUppercase(f)) return String(value).trim().toUpperCase();
  return String(value).trim();
}

export function CadastroSimples({
  title,
  subtitle,
  resource,
  fields,
  listColumns,
  emptyLabel = "Nenhum registro",
  searchPlaceholder = "Buscar codigo ou nome — Enter",
  autoCodigo = false,
  showAtivo = false,
  voltarRetornoLabel = "Voltar",
  onAgendar,
  onAnexarExame,
  listRefreshTick = 0,
  formExtra,
  formCardLayout = "fit",
  formGridCols = 2,
}: Props) {
  const codigoKey =
    autoCodigo === true
      ? "codigo"
      : autoCodigo && typeof autoCodigo === "object"
        ? (autoCodigo.key ?? "codigo")
        : null;
  const codigoLabel =
    autoCodigo && typeof autoCodigo === "object"
      ? (autoCodigo.label ?? "Código")
      : "Código";

  const screenScope = `cadastro:${resource}`;
  const savedRef = useRef(loadScreenState<CadastroScreenState>(screenScope));
  const pendingScroll = useRef(savedRef.current?.scrollTop ?? 0);
  const pendingFocus = useRef<number | null>(savedRef.current?.focusRowId ?? null);

  const navigate = useNavigate();
  const msg = useMessageBox();
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState(() => savedRef.current?.q ?? "");
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"list" | "form">(
    () => savedRef.current?.mode ?? "list",
  );
  const [editId, setEditId] = useState<number | null>(
    () => savedRef.current?.editId ?? null,
  );
  const [form, setForm] = useState<Record<string, string>>(
    () => savedRef.current?.form ?? emptyForm(fields),
  );
  const [ativo, setAtivo] = useState(() => savedRef.current?.ativo ?? true);
  const [baseline, setBaseline] = useState("");
  const [saving, setSaving] = useState(false);
  const {
    scrollRef: tableScrollRef,
    focusRowId,
    rowRef: focusRowRef,
    clearFocus: clearRowNavFocus,
    focusRow,
    handleRowClick,
    handleRowKeyDown,
  } = useTableRowNavScroll<number>();

  const fieldByKey = useMemo(
    () => Object.fromEntries(fields.map((f) => [f.key, f])),
    [fields],
  );

  const snapshotCadastro = (f: Record<string, string>, a: boolean) =>
    snapshotForm({ form: f, ativo: a });

  const formDirty = useMemo(
    () => mode === "form" && isFormDirty(snapshotCadastro(form, ativo), baseline),
    [mode, form, ativo, baseline],
  );

  const tableColSpan =
    listColumns.length + (showAtivo ? 1 : 0) + (onAgendar ? 1 : 0) + (onAnexarExame ? 1 : 0) + 1;

  const comparators = useMemo(() => {
    const c: Record<string, (a: Row, b: Row) => number> = {};
    if (showAtivo) {
      c.ativo = (a, b) => (a.ativo ?? 1) - (b.ativo ?? 1) || a.id - b.id;
    }
    for (const col of listColumns) {
      c[col.key] = (a, b) => {
        const va = col.render ? col.render(a) : String(a[col.key] ?? "");
        const vb = col.render ? col.render(b) : String(b[col.key] ?? "");
        return va.localeCompare(vb, "pt-BR", { numeric: true }) || a.id - b.id;
      };
    }
    return c;
  }, [listColumns, showAtivo]);

  const { sortCol, sortDir, sortedRows, toggleSort } = useTableSort(rows, comparators);
  const listRowIds = useMemo(() => sortedRows.map((r) => r.id), [sortedRows]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.list<Row>(resource, q.trim() || undefined);
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }, [resource, q, msg]);

  useEffect(() => {
    void load();
  }, [load, listRefreshTick]);

  useFocusFirstField([mode, loading], { enabled: !loading });

  useEffect(() => {
    saveScreenState<CadastroScreenState>(screenScope, {
      mode,
      q,
      editId,
      form,
      ativo,
      focusRowId,
      scrollTop: tableScrollRef.current?.scrollTop ?? 0,
    });
  }, [screenScope, mode, q, editId, form, ativo, focusRowId, tableScrollRef]);

  useEffect(() => {
    if (loading || mode !== "list") return;
    const el = tableScrollRef.current;
    if (el && pendingScroll.current > 0) {
      el.scrollTop = pendingScroll.current;
      pendingScroll.current = 0;
    }
    if (pendingFocus.current != null) {
      focusRow(pendingFocus.current);
      pendingFocus.current = null;
    }
  }, [loading, mode, sortedRows, focusRow, tableScrollRef]);

  const onTableScroll = () => {
    const top = tableScrollRef.current?.scrollTop ?? 0;
    const cur = loadScreenState<CadastroScreenState>(screenScope);
    if (cur) saveScreenState(screenScope, { ...cur, scrollTop: top });
  };

  const fetchProximoCodigo = useCallback(async () => {
    if (!codigoKey) return "";
    try {
      const { code } = await api.nextCode(resource);
      return code;
    } catch {
      return "";
    }
  }, [codigoKey, resource]);

  const focusFirstFieldLocal = () => {
    requestAnimationFrame(() => focusFirstField());
  };

  const resetFormInclusao = useCallback(async () => {
    const next = emptyForm(fields);
    if (codigoKey) next[codigoKey] = await fetchProximoCodigo();
    setForm(next);
    setAtivo(true);
    setBaseline(snapshotCadastro(next, true));
    focusFirstFieldLocal();
  }, [fields, codigoKey, fetchProximoCodigo]);

  const openNew = () => {
    setEditId(null);
    setMode("form");
    clearRowNavFocus();
    void resetFormInclusao();
  };

  useEffect(() => {
    if (peekCadastroReturn(resource)) {
      openNew();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- inclusao ao voltar de outra tela
  }, [resource]);

  const openEdit = (row: Row) => {
    setEditId(row.id);
    const next = emptyForm(fields);
    if (codigoKey) next[codigoKey] = String(row[codigoKey] ?? "");
    for (const f of fields) {
      if (f.type === "password") {
        next[f.key] = "";
        continue;
      }
      const raw = String(row[f.key] ?? "");
      next[f.key] = fieldUsesUppercase(f) ? raw.toUpperCase() : raw;
    }
    setForm(next);
    const nextAtivo = row.ativo !== 0;
    setAtivo(nextAtivo);
    setBaseline(snapshotCadastro(next, nextAtivo));
    setMode("form");
    clearRowNavFocus();
  };

  const setField = (key: string, value: string) => {
    const f = fieldByKey[key];
    const next = f && fieldUsesUppercase(f) ? value.toUpperCase() : value;
    setForm((s) => ({ ...s, [key]: next }));
  };

  const normalizeBody = () => {
    const body: Record<string, unknown> = {};
    if (showAtivo) body.ativo = ativo;
    if (codigoKey && editId == null) {
      body[codigoKey] = form[codigoKey]?.trim() ?? "";
    }
    for (const f of fields) {
      if (f.readOnlyOnEdit && editId != null) continue;
      const raw = form[f.key] ?? "";
      const trimmed = fieldUsesUppercase(f) ? raw.trim().toUpperCase() : raw.trim();
      if (f.type === "password" && editId != null && !trimmed) continue;
      body[f.key] = trimmed;
    }
    return body;
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    for (const f of fields) {
      const label = editId && f.labelWhenEdit ? f.labelWhenEdit : f.label;
      if (f.required && !form[f.key]?.trim()) {
        void msg.warning(`Informe ${label}`);
        return;
      }
      if (!editId && f.requiredOnCreate && !form[f.key]?.trim()) {
        void msg.warning(`Informe ${label}`);
        return;
      }
      if (f.key === "cpf") {
        const cpfErro = validarCpfOpcional(form[f.key] ?? "");
        if (cpfErro) {
          void msg.warning(cpfErro);
          return;
        }
      }
      if (f.type === "email" || f.key === "email") {
        const emailErro = validarEmailOpcional(form[f.key] ?? "");
        if (emailErro) {
          void msg.warning(emailErro);
          return;
        }
      }
      if (f.type === "tel" || f.key === "telefone") {
        const telErro = validarTelefoneOpcional(form[f.key] ?? "");
        if (telErro) {
          void msg.warning(telErro);
          return;
        }
      }
    }
    const body = normalizeBody();
    setSaving(true);
    try {
      if (editId) {
        await api.update(resource, editId, body);
        setMode("list");
        setEditId(null);
      } else {
        const created = await api.create<Row>(resource, body);
        const ret = takeCadastroReturn(resource);
        if (ret) {
          applyPickToForm(ret.formScope, ret.pickField, created.id);
          navigate(ret.returnPath);
          return;
        }
        if (resource === "medicos") {
          const loginUsado = String(created.login ?? body.login ?? "")
            .trim()
            .toLowerCase();
          void msg.success(
            loginUsado
              ? `Médico cadastrado. Usuário de acesso: «${loginUsado}». Anote a senha informada — por segurança ela não pode ser consultada depois.`
              : "Médico cadastrado.",
          );
        }
        await resetFormInclusao();
      }
      await load();
    } catch (err) {
      void msg.error(err instanceof ApiError ? err.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: Row, ev?: React.MouseEvent) => {
    ev?.stopPropagation();
    const labelKey = fields[0]?.key ?? "nome";
    const label = formatFieldValue(fieldByKey[labelKey], row[labelKey], labelKey);
    const ok = await msg.confirm(`Excluir "${label}"?`);
    if (!ok) return;
    try {
      await api.remove(resource, row.id);
      void msg.success("Registro excluído");
      await load();
    } catch (err) {
      void msg.error(err instanceof ApiError ? err.message : "Erro ao excluir");
    }
  };

  const backToList = () => {
    setMode("list");
    setEditId(null);
    clearRowNavFocus();
  };

  const voltarFormulario = () => {
    const ret = peekCadastroReturn(resource);
    if (ret) {
      takeCadastroReturn(resource);
      navigate(ret.returnPath);
      return;
    }
    backToList();
  };

  const renderCell = (row: Row, col: (typeof listColumns)[number]) => {
    if (col.render) return col.render(row);
    return formatFieldValue(fieldByKey[col.key], row[col.key], col.key);
  };

  const formTitle = editId ? `Alteracao — ${title}` : `Inclusao — ${title}`;
  const formFullCard = formCardLayout === "full";
  const formWideCard = formCardLayout === "wide";
  const formComExtra = Boolean(editId && formExtra);
  /** Wide + histórico: precisa do layout com scroll (igual full), senão o extra some cortado. */
  const formComScrollExtra = formFullCard || (formWideCard && formComExtra);
  const gridColsClass =
    formGridCols === 4
      ? "sm:grid-cols-4"
      : formGridCols === 3
        ? "sm:grid-cols-3"
        : "sm:grid-cols-2";
  const colSpanClass = (span: CadastroField["colSpan"]) => {
    if (span === 4) return " sm:col-span-4";
    if (span === 3) return " sm:col-span-3";
    if (span === 2) return " sm:col-span-2";
    return "";
  };

  const camposFormulario = (
    <>
      <div className={`grid gap-3 ${gridColsClass}`}>
        {codigoKey && (
          <label className="block space-y-1">
            <span className="text-sm font-medium">{codigoLabel}</span>
            <input
              type="text"
              value={form[codigoKey] ?? ""}
              readOnly
              disabled
              className="legacy-input w-full opacity-80 cursor-not-allowed"
              title="Código gerado automaticamente"
            />
          </label>
        )}
        {fields.map((f) => {
          const label = editId && f.labelWhenEdit ? f.labelWhenEdit : f.label;
          const hint = editId && f.hintWhenEdit ? f.hintWhenEdit : f.hint;
          const showRequired = f.required || (!editId && f.requiredOnCreate);
          const readOnly = !!editId && !!f.readOnlyOnEdit;
          return (
            <label
              key={f.key}
              className={`block space-y-1${colSpanClass(f.colSpan)}`}
            >
              <span className="text-sm font-medium">
                {label}
                {showRequired ? " *" : ""}
              </span>
              {f.type === "textarea" ? (
                <textarea
                  value={form[f.key]}
                  onChange={(e) => setField(f.key, e.target.value)}
                  maxLength={f.maxLength}
                  rows={f.rows ?? 3}
                  placeholder={f.placeholder}
                  className="legacy-input w-full"
                  readOnly={readOnly}
                  disabled={readOnly}
                />
              ) : (
                <input
                  type={f.type ?? "text"}
                  value={form[f.key]}
                  onChange={(e) => setField(f.key, e.target.value)}
                  maxLength={f.maxLength}
                  placeholder={f.placeholder}
                  className="legacy-input w-full"
                  readOnly={readOnly}
                  disabled={readOnly}
                  autoComplete={
                    f.type === "password"
                      ? editId
                        ? "new-password"
                        : "new-password"
                      : undefined
                  }
                />
              )}
              {hint ? (
                <span className="block text-xs leading-snug text-[var(--muted)]">
                  {hint}
                </span>
              ) : null}
            </label>
          );
        })}
      </div>
      {showAtivo ? (
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={ativo}
            onChange={(e) => setAtivo(e.target.checked)}
          />
          <span className="text-sm">Ativo</span>
        </label>
      ) : null}
    </>
  );

  const acoesFormulario = (
    <div className="cadastro-form-acoes">
      <VoltarButton type="button" onClick={voltarFormulario}>
        {peekCadastroReturn(resource) ? voltarRetornoLabel : "Voltar"}
      </VoltarButton>
      <div className="form-actions__direita">
        <button
          type="submit"
          disabled={saving || !formDirty}
          className="btn btn-primary agenda-big-action"
        >
          {saving ? "Salvando…" : editId ? "Salvar alterações" : "Salvar"}
        </button>
      </div>
    </div>
  );

  return (
    <div className="page-stack flex-1 min-h-0 overflow-hidden">
      <PageHeader
        title={mode === "form" ? formTitle : title}
        subtitle={mode === "list" ? subtitle : undefined}
      />

      <div className="page-stack flex-1 min-h-0 overflow-hidden px-4 pb-4">
        <div
          className={
            mode === "list" || formFullCard
              ? "est-card est-card--page flex flex-col min-h-0 overflow-hidden flex-1 p-4"
              : formWideCard && formComExtra
                ? "est-card est-card--page est-card--page--form-wide est-card--page--form-with-extra flex flex-col min-h-0 overflow-hidden flex-1 p-4"
              : formWideCard
                ? "est-card est-card--page est-card--page--form-wide flex flex-col p-4"
                : "est-card est-card--page est-card--page--form-fit flex flex-col overflow-hidden p-4"
          }
        >
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
                        pendingScroll.current = 0;
                        pendingFocus.current = null;
                        void load();
                      }
                    }}
                    placeholder={searchPlaceholder}
                    className="legacy-input"
                  />
                </div>
              </div>

              <div className="dup-painel-scroll scroll-interno scroll-interno--flex flex-1 min-h-0">
                <div className="dup-painel-interno">
                  <div className="dup-acoes-bar">
                    <button
                      type="button"
                      onClick={openNew}
                      className="btn btn-secondary btn-novo-compact"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Novo
                    </button>
                    <button
                      type="button"
                      onClick={() => void load()}
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
                    onScroll={onTableScroll}
                    className="dup-table-wrap dup-table-wrap--scroll-y panel panel-table"
                  >
                    <table className="data-table">
                      <thead>
                        <tr>
                          {listColumns.map((c) => (
                            <SortableTh
                              key={c.key}
                              col={c.key}
                              label={c.label}
                              sortCol={sortCol}
                              sortDir={sortDir}
                              onSort={toggleSort}
                              numeric={c.key === "codigo"}
                            />
                          ))}
                          {showAtivo ? (
                            <SortableTh
                              col="ativo"
                              label="Ativo"
                              sortCol={sortCol}
                              sortDir={sortDir}
                              onSort={toggleSort}
                            />
                          ) : null}
                          {onAgendar ? (
                            <th className="data-table__actions">Agenda</th>
                          ) : null}
                          {onAnexarExame ? (
                            <th className="data-table__actions">Exames</th>
                          ) : null}
                          <th className="data-table__actions">Acoes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {loading && (
                          <tr>
                            <td
                              colSpan={tableColSpan}
                              className="data-table__empty"
                            >
                              Carregando…
                            </td>
                          </tr>
                        )}
                        {!loading && sortedRows.length === 0 && emptyLabel.trim() ? (
                          <tr>
                            <td
                              colSpan={tableColSpan}
                              className="data-table__empty"
                            >
                              {emptyLabel}
                            </td>
                          </tr>
                        ) : null}
                        {!loading &&
                          sortedRows.map((row) => {
                            const isNav = focusRowId === row.id;
                            const examesQtd = Number(row.exames_qtd) || 0;
                            return (
                              <tr
                                key={row.id}
                                ref={isNav ? focusRowRef : undefined}
                                tabIndex={isNav ? 0 : -1}
                                title="1 clique: ↑↓ navegar — 2 cliques: alterar"
                                className={`row-clickable${isNav ? " row-nav-focus" : ""}`}
                                onClick={(ev) =>
                                  handleRowClick(row.id, ev, (id) => {
                                    const r = sortedRows.find((x) => x.id === id);
                                    if (r) openEdit(r);
                                  })
                                }
                                onKeyDown={(ev) =>
                                  handleRowKeyDown(ev, row.id, listRowIds, (id) => {
                                    const r = sortedRows.find((x) => x.id === id);
                                    if (r) openEdit(r);
                                  })
                                }
                              >
                                {listColumns.map((c) => (
                                  <td key={c.key}>{renderCell(row, c)}</td>
                                ))}
                                {showAtivo ? (
                                  <td>{row.ativo === 0 ? "Não" : "Sim"}</td>
                                ) : null}
                                {onAgendar ? (
                                  <td className="data-table__actions">
                                    <button
                                      type="button"
                                      className="btn btn-primary btn-sm"
                                      title="Agendar consulta"
                                      onClick={(ev) => {
                                        ev.stopPropagation();
                                        onAgendar(row);
                                      }}
                                    >
                                      Agendar
                                    </button>
                                  </td>
                                ) : null}
                                {onAnexarExame ? (
                                  <td className="data-table__actions">
                                    <button
                                      type="button"
                                      className={`btn btn-sm ${examesQtd > 0 ? "btn-secondary" : "btn-primary"}`}
                                      title={
                                        examesQtd > 0
                                          ? `${examesQtd} exame(s) neste paciente. Clique para ver ou anexar outro.`
                                          : "Anexar exame (PDF ou imagem)"
                                      }
                                      onClick={(ev) => {
                                        ev.stopPropagation();
                                        onAnexarExame(row);
                                      }}
                                    >
                                      {examesQtd > 0
                                        ? `${examesQtd} ${examesQtd === 1 ? "exame" : "exames"}`
                                        : "Anexar exame"}
                                    </button>
                                  </td>
                                ) : null}
                                <td className="data-table__actions">
                                  <button
                                    type="button"
                                    onClick={(ev) => void remove(row, ev)}
                                    className="icon-btn icon-btn--danger"
                                    title="Exclusao"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          ) : formComScrollExtra ? (
            <form
              onSubmit={(e) => void save(e)}
              className="cadastro-form cadastro-form--full flex flex-col flex-1 min-h-0 overflow-hidden w-full"
            >
              <div
                className={
                  formComExtra
                    ? "cadastro-form__corpo cadastro-form__corpo--split est-card--page__area scroll-interno flex-1 min-h-0"
                    : "est-card--page__area scroll-interno flex-1 min-h-0 p-4 space-y-4"
                }
              >
                {formComExtra ? (
                  <>
                    <div className="cadastro-form__campos space-y-4">{camposFormulario}</div>
                    <div className="cadastro-form__extra">
                      {formExtra!({ editId: editId!, form })}
                    </div>
                  </>
                ) : (
                  camposFormulario
                )}
              </div>
              <footer className="cadastro-form__rodape shrink-0">{acoesFormulario}</footer>
            </form>
          ) : (
            <form
              onSubmit={(e) => void save(e)}
              className="space-y-4 w-full"
            >
              {camposFormulario}
              {formComExtra ? formExtra!({ editId: editId!, form }) : null}
              {acoesFormulario}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
