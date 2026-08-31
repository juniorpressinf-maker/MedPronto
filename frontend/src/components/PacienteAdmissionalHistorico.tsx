import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ApiError,
  api,
  type AdmissionalConclusao,
  type AdmissionalHistoricoItem,
} from "../lib/api";
import { useAuth } from "../lib/authContext";
import { useMessageBox } from "../lib/messageBoxContext";
import {
  classeBadgeStatusAgendamento,
  labelStatusAgendamento,
} from "../lib/agendamentoStatus";
import { ordenarAsoHistoricoPorFamilia } from "../lib/historicoOrdem";
import { temModulo } from "../lib/permissoes";
import {
  ASO_TITULO,
  ASO_TITULO_CURTO,
} from "../lib/tipoAtendimento";
import { AdmissionalExameVinculo } from "./AdmissionalExameVinculo";
import { AdmissionalRetificarDialog } from "./AdmissionalRetificarDialog";
import "../admissional-aso.css";

type Props = {
  pacienteId: number;
  pacienteNome: string;
  /** Sem título próprio (ex.: aba no cadastro do paciente). */
  ocultarCabecalho?: boolean;
};

const CONCLUSAO_LABEL: Record<AdmissionalConclusao, string> = {
  apto: "Apto",
  inapto: "Inapto",
  apto_com_restricao: "Apto com restrição",
};

function formatDataBr(iso: string): string {
  const d = iso.trim();
  const parte = d.slice(0, 10);
  const [y, m, day] = parte.split("-");
  if (y && m && day) return `${day}/${m}/${y}`;
  return d;
}

function dataExibicao(item: AdmissionalHistoricoItem): string {
  return formatDataBr(item.finalizado_em ?? item.created_at);
}

function retificacaoAberta(item: AdmissionalHistoricoItem): boolean {
  return (
    Boolean(item.retificacao_de_id) &&
    !Number(item.retificacao_finalizada) &&
    item.status === "em_preenchimento"
  );
}

function celulaAsoNumero(item: AdmissionalHistoricoItem) {
  if (item.retificacao_de_id) {
    return (
      <div className="historico-celula-prontuario">
        <span className="historico-pront-num" title="ASO original">
          {item.retificacao_de_id}
        </span>
        <span className="historico-pront-sep">/</span>
        <span
          className="historico-pront-num historico-pront-num--retificacao"
          title="Retificação"
        >
          {item.id}
        </span>
        <div className="historico-badge-retificacao">Retificação</div>
      </div>
    );
  }
  return <span className="historico-pront-num">{item.id}</span>;
}

export function PacienteAdmissionalHistorico({
  pacienteId,
  pacienteNome,
  ocultarCabecalho = false,
}: Props) {
  const navigate = useNavigate();
  const msg = useMessageBox();
  const { permissoes } = useAuth();
  const podeAdmissional = temModulo(permissoes, "admissional");
  const podeListar = temModulo(permissoes, ["admissional", "admissional_agenda"]);
  const podeVincularExame = temModulo(permissoes, ["admissional", "exames_anexos"]);
  const [itens, setItens] = useState<AdmissionalHistoricoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandidoId, setExpandidoId] = useState<number | null>(null);
  const [retificarItem, setRetificarItem] = useState<AdmissionalHistoricoItem | null>(
    null,
  );

  const carregar = useCallback(async () => {
    if (!podeListar) return;
    setLoading(true);
    try {
      const rows = await api.admissionalHistoricoPaciente(pacienteId);
      setItens(rows);
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro ao carregar admissionais");
    } finally {
      setLoading(false);
    }
  }, [pacienteId, podeListar, msg]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const itensOrdenados = useMemo(() => ordenarAsoHistoricoPorFamilia(itens), [itens]);

  const abertaPorOrigem = useMemo(() => {
    const mapa = new Map<number, AdmissionalHistoricoItem>();
    for (const row of itens) {
      if (retificacaoAberta(row) && row.retificacao_de_id) {
        mapa.set(row.retificacao_de_id, row);
      }
    }
    return mapa;
  }, [itens]);

  const abrirFolha = (id: number) => {
    navigate(`/admissional/${id}`, { state: { fromPaciente: true } });
  };

  if (!podeListar) return null;

  return (
    <section
      className="paciente-admissional-historico"
      aria-labelledby={ocultarCabecalho ? undefined : "paciente-aso-titulo"}
      aria-label={ocultarCabecalho ? ASO_TITULO : undefined}
    >
      {ocultarCabecalho ? null : (
        <header className="paciente-admissional-historico__cabecalho">
          <h3 id="paciente-aso-titulo" className="paciente-admissional-historico__titulo">
            {ASO_TITULO}
          </h3>
          <p className="paciente-admissional-historico__subtitulo m-0">
            Histórico de <strong>{pacienteNome}</strong> — metadados apenas (sem prontuário de
            consulta).
          </p>
        </header>
      )}

      <div className="paciente-admissional-historico__corpo">
        {loading ? (
          <p className="data-table__empty m-0">Carregando admissionais…</p>
        ) : itens.length === 0 ? (
          <p className="data-table__empty m-0">
            Nenhum {ASO_TITULO_CURTO} registrado para este paciente.
          </p>
        ) : (
          <>
            <p className="historico-legenda text-[var(--muted)]">
              Agrupado por atestado: <strong>original</strong> seguido das{" "}
              <strong>retificações</strong>. O original nunca é apagado.
            </p>
            <div className="dup-table-wrap dup-table-wrap--scroll-y panel panel-table paciente-admissional-historico__tabela">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>ASO nº</th>
                  <th>Médico</th>
                  <th>Status</th>
                  <th>Conclusão</th>
                  <th className="data-table__actions">Ações</th>
                </tr>
              </thead>
              <tbody>
                {itensOrdenados.map((item, idx) => {
                  const finalizado = item.status === "finalizado";
                  const expandido = expandidoId === item.id;
                  const aberta = abertaPorOrigem.get(item.id);
                  const classes = [
                    `historico-linha--${item.status}`,
                    item.retificacao_de_id ? "historico-row-retificacao" : "",
                    !item.retificacao_de_id && idx > 0
                      ? "historico-row-grupo-inicio"
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ");
                  return (
                    <Fragment key={item.id}>
                      <tr className={classes || undefined}>
                        <td>{dataExibicao(item)}</td>
                        <td>{celulaAsoNumero(item)}</td>
                        <td>
                          {item.medico_nome}
                          {item.medico_crm ? ` — ${item.medico_crm}` : ""}
                        </td>
                        <td>
                          <span className={classeBadgeStatusAgendamento(item.status)}>
                            {labelStatusAgendamento(item.status)}
                          </span>
                          {retificacaoAberta(item) ? (
                            <div className="historico-badge-retificacao">Em andamento</div>
                          ) : null}
                        </td>
                        <td>
                          {item.retificacao_de_id ? (
                            <div className="historico-celula-retificacao">
                              {item.motivo_retificacao?.trim() ? (
                                <div>
                                  <strong>Motivo:</strong>{" "}
                                  {item.motivo_retificacao.trim()}
                                </div>
                              ) : null}
                              <div>
                                {item.conclusao
                                  ? CONCLUSAO_LABEL[item.conclusao]
                                  : "—"}
                              </div>
                            </div>
                          ) : (
                            <>
                              {item.conclusao ? CONCLUSAO_LABEL[item.conclusao] : "—"}
                              {item.conclusao === "apto_com_restricao" &&
                              item.restricoes_texto?.trim() ? (
                                <span
                                  className="block text-xs text-[var(--muted)] mt-0.5"
                                  title={item.restricoes_texto}
                                >
                                  {item.restricoes_texto.slice(0, 60)}
                                  {item.restricoes_texto.length > 60 ? "…" : ""}
                                </span>
                              ) : null}
                            </>
                          )}
                        </td>
                        <td className="data-table__actions">
                          <div className="paciente-admissional-historico__acoes flex flex-nowrap gap-2 justify-end">
                            {podeAdmissional ? (
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => abrirFolha(item.id)}
                              >
                                Ver
                              </button>
                            ) : null}
                            {finalizado && item.conclusao && podeAdmissional ? (
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() =>
                                  void api.admissionalPdf(item.id).catch((e) =>
                                    msg.error(
                                      e instanceof ApiError
                                        ? e.message
                                        : "Erro ao gerar PDF",
                                    ),
                                  )
                                }
                              >
                                PDF
                              </button>
                            ) : null}
                            {podeAdmissional &&
                            !item.retificacao_de_id &&
                            finalizado ? (
                              aberta ? (
                                <button
                                  type="button"
                                  className="btn btn-primary btn-sm"
                                  onClick={() => abrirFolha(aberta.id)}
                                >
                                  Continuar
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="btn btn-primary btn-sm"
                                  onClick={() => setRetificarItem(item)}
                                >
                                  Retificar
                                </button>
                              )
                            ) : null}
                            {podeVincularExame ? (
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() =>
                                  setExpandidoId(expandido ? null : item.id)
                                }
                              >
                                {item.exame_anexo_id ? "Exame" : "Vincular"}
                              </button>
                            ) : item.exame_anexo_id ? (
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() =>
                                  void api
                                    .exameArquivo(item.exame_anexo_id!)
                                    .catch((e) =>
                                      msg.error(
                                        e instanceof ApiError
                                          ? e.message
                                          : "Erro ao abrir exame",
                                      ),
                                    )
                                }
                              >
                                Exame
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                      {expandido && podeVincularExame ? (
                        <tr className="historico-detalhe-row">
                          <td colSpan={6}>
                            <AdmissionalExameVinculo
                              admissionalId={item.id}
                              pacienteId={pacienteId}
                              exameAnexoId={item.exame_anexo_id}
                              exameNome={item.exame_nome_arquivo}
                              onAtualizado={(atualizado) => {
                                setItens((prev) =>
                                  prev.map((x) =>
                                    x.id === atualizado.id ? atualizado : x,
                                  ),
                                );
                              }}
                            />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
            </div>
          </>
        )}
      </div>

      {retificarItem ? (
        <AdmissionalRetificarDialog
          item={{
            id: retificarItem.id,
            medico_nome: retificarItem.medico_nome,
            dataLabel: dataExibicao(retificarItem),
          }}
          onClose={() => setRetificarItem(null)}
          onCriado={(id) => {
            setRetificarItem(null);
            abrirFolha(id);
          }}
        />
      ) : null}
    </section>
  );
}
