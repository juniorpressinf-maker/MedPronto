import { RefreshCw, Search, Shield } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DataIsoInput } from "../components/DataIsoInput";
import { PageHeader } from "../components/PageHeader";
import { ApiError, api, type AuditoriaItem } from "../lib/api";
import { useMessageBox } from "../lib/messageBoxContext";
import { SortableTh, useTableSort } from "../lib/useTableSort";

import { ASO_TITULO_CURTO } from "../lib/tipoAtendimento";

const ACAO_LABEL: Record<string, string> = {
  acesso_negado: "Acesso negado",
  admissional_finalizado: `${ASO_TITULO_CURTO} finalizado`,
  agendamento_criado: "Agendamento criado",
  agendamento_status: "Status do agendamento",
  atendimento_aberto: "Atendimento aberto",
  atendimento_finalizado: "Atendimento finalizado",
  auditoria_consultada: "Auditoria consultada",
  documentos_lote_pdf: "Documentos em lote (PDF)",
  backup_restaurado: "Backup restaurado",
  exame_anexado: "Exame anexado",
  exame_aberto: "Exame aberto",
  exame_atualizado: "Exame atualizado",
  exames_listados: "Exames listados",
  licenca_contra_senha: "Contra-senha aplicada",
  licenca_instalada: "Licença instalada",
  licenca_removida: "Licença removida",
  login_falhou: "Login falhou",
  login_ok: "Login",
  prontuario_historico_lido: "Histórico lido",
  paciente_atendimentos_lido: "Histórico de atendimento lido",
  prontuario_lido: "Prontuário lido",
  prontuario_retificado: "Retificação criada",
  retificacao_cancelada: "Retificação cancelada",
  admissional_retificado: "ASO retificado",
  admissional_retificacao_cancelada: "Retificação de ASO cancelada",
};

function fmtAcao(acao: string): string {
  return ACAO_LABEL[acao] ?? acao.replaceAll("_", " ");
}

function fmtDataHora(iso: string): string {
  try {
    return new Date(iso.replace(" ", "T")).toLocaleString("pt-BR");
  } catch {
    return iso;
  }
}

export function AuditoriaPage() {
  const msg = useMessageBox();
  const [itens, setItens] = useState<AuditoriaItem[]>([]);
  const [total, setTotal] = useState(0);
  const [acoes, setAcoes] = useState<{ acao: string; n: number }[]>([]);
  const [q, setQ] = useState("");
  const [acao, setAcao] = useState("");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [loading, setLoading] = useState(true);

  const comparators = useMemo(
    () => ({
      created_at: (a: AuditoriaItem, b: AuditoriaItem) =>
        b.created_at.localeCompare(a.created_at) || b.id - a.id,
      acao: (a: AuditoriaItem, b: AuditoriaItem) =>
        a.acao.localeCompare(b.acao, "pt-BR") || b.id - a.id,
      usuario_nome: (a: AuditoriaItem, b: AuditoriaItem) =>
        (a.usuario_nome ?? "").localeCompare(b.usuario_nome ?? "", "pt-BR") ||
        b.id - a.id,
      paciente_nome: (a: AuditoriaItem, b: AuditoriaItem) =>
        (a.paciente_nome ?? "").localeCompare(b.paciente_nome ?? "", "pt-BR") ||
        b.id - a.id,
    }),
    [],
  );

  const { sortCol, sortDir, sortedRows, toggleSort } = useTableSort(
    itens,
    comparators,
  );

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const [lista, acoesResp] = await Promise.all([
        api.auditoriaList({ q, acao, de, ate }),
        acoes.length ? Promise.resolve({ acoes }) : api.auditoriaAcoes(),
      ]);
      setItens(lista.itens);
      setTotal(lista.total);
      if (!acoes.length) setAcoes(acoesResp.acoes);
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro ao carregar auditoria");
    } finally {
      setLoading(false);
    }
  }, [q, acao, de, ate, acoes.length, msg]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  return (
    <div className="page-stack flex-1 min-h-0 overflow-hidden">
      <PageHeader
        title="Auditoria"
        subtitle="Registro de acessos clínicos e tentativas negadas — Fase 4"
        actions={
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => void carregar()}
            disabled={loading}
          >
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </button>
        }
      />
      <div className="page-stack flex-1 min-h-0 overflow-hidden px-4 pb-4">
        <div className="est-card est-card--page flex flex-col min-h-0 overflow-hidden flex-1">
          <div className="toolbar toolbar--cadastro px-4 py-3 border-b border-[var(--border)] flex flex-wrap gap-3 items-end">
            <label className="toolbar-search flex-1 min-w-[12rem]">
              <Search className="h-4 w-4 shrink-0 opacity-60" />
              <input
                className="legacy-input w-full"
                placeholder="Buscar usuário, paciente, ação ou detalhe — Enter"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void carregar();
                }}
              />
            </label>
            <label className="block space-y-1 min-w-[10rem]">
              <span className="text-xs font-medium text-[var(--muted)]">Ação</span>
              <select
                className="legacy-input w-full"
                value={acao}
                onChange={(e) => setAcao(e.target.value)}
              >
                <option value="">Todas</option>
                {acoes.map((a) => (
                  <option key={a.acao} value={a.acao}>
                    {fmtAcao(a.acao)} ({a.n})
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-[var(--muted)]">De</span>
              <DataIsoInput allowEmpty value={de} onValueChange={setDe} />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-[var(--muted)]">Até</span>
              <DataIsoInput allowEmpty value={ate} onValueChange={setAte} />
            </label>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => void carregar()}
            >
              Filtrar
            </button>
          </div>
          <div className="est-card--page__area scroll-interno min-h-0 flex-1">
            <div className="dup-table-wrap">
              <div className="data-table-scroll">
                <table className="data-table w-full">
                  <thead>
                    <tr>
                      <SortableTh
                        label="Data/hora"
                        col="created_at"
                        sortCol={sortCol}
                        sortDir={sortDir}
                        onSort={toggleSort}
                      />
                      <SortableTh
                        label="Ação"
                        col="acao"
                        sortCol={sortCol}
                        sortDir={sortDir}
                        onSort={toggleSort}
                      />
                      <SortableTh
                        label="Usuário"
                        col="usuario_nome"
                        sortCol={sortCol}
                        sortDir={sortDir}
                        onSort={toggleSort}
                      />
                      <SortableTh
                        label="Paciente"
                        col="paciente_nome"
                        sortCol={sortCol}
                        sortDir={sortDir}
                        onSort={toggleSort}
                      />
                      <th>Detalhe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={5} className="text-center py-8 text-[var(--muted)]">
                          Carregando…
                        </td>
                      </tr>
                    ) : sortedRows.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-center py-8 text-[var(--muted)]">
                          Nenhum registro encontrado.
                        </td>
                      </tr>
                    ) : (
                      sortedRows.map((row) => (
                        <tr key={row.id}>
                          <td className="whitespace-nowrap">{fmtDataHora(row.created_at)}</td>
                          <td>{fmtAcao(row.acao)}</td>
                          <td>
                            {row.usuario_nome ?? "—"}
                            {row.usuario_login ? (
                              <span className="block text-xs text-[var(--muted)]">
                                {row.usuario_login}
                              </span>
                            ) : null}
                          </td>
                          <td>{row.paciente_nome ?? "—"}</td>
                          <td className="max-w-xs truncate" title={row.detalhe ?? ""}>
                            {row.detalhe ?? "—"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div className="px-4 py-2 border-t border-[var(--border)] text-sm text-[var(--muted)] flex items-center gap-2">
            <Shield className="h-4 w-4 shrink-0" />
            {total} registro{total === 1 ? "" : "s"}
            {total > itens.length ? ` — exibindo ${itens.length}` : ""}
          </div>
        </div>
      </div>
    </div>
  );
}
