import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { AtendimentoCardTitulo } from "./AtendimentoCardTitulo";
import { useNavigate } from "react-router-dom";
import {
  ApiError,
  api,
  type HistoricoExameClinicoItem,
  type ProntuarioHistoricoItem,
} from "../lib/api";
import { FichaCamposCorpo } from "./FichaCamposCorpo";
import { FichaPdfFundoCorpo } from "./FichaPdfFundoCorpo";
import { ImprimirDocumentosLoteButton } from "./ImprimirDocumentosLoteButton";
import {
  camposHistoricoComConteudo,
  parseDadosJson,
} from "../lib/prontuarioDados";
import { normalizarProntuarioDetalhe } from "../lib/prontuarioPaciente";
import { useAuth } from "../lib/authContext";
import { montarTimelineHistoricoClinico } from "../lib/historicoOrdem";
import { useMessageBox } from "../lib/messageBoxContext";
import { temModulo } from "../lib/permissoes";

function temDoc(valor: number | boolean | undefined): boolean {
  return valor === true || valor === 1;
}

type Props = {
  pacienteId: number;
  pacienteNome: string;
  /** Prontuário da consulta aberta (excluído da lista). 0 = mostrar todos. */
  prontuarioAtualId?: number;
  consultaAtual?: {
    id: number;
    data_atendimento: string;
    retificacao_de_id: number | null;
    motivo_retificacao: string | null;
    queixa_principal: string | null;
  };
  podeRetificar: boolean;
  /** Sem título do card (ex.: embutido em abas do cadastro do paciente). */
  ocultarCabecalho?: boolean;
};

function formatDataBr(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function celulaProntuario(item: ProntuarioHistoricoItem) {
  if (item.retificacao_de_id) {
    return (
      <div className="historico-celula-prontuario">
        <span className="historico-pront-num" title="Consulta original">
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

function formatHoraCurta(hora: string): string {
  const t = hora.trim();
  return t.length >= 5 ? t.slice(0, 5) : t;
}

function nomesProcedimentosExame(item: HistoricoExameClinicoItem): string {
  const nomes = item.procedimentos.map((p) => p.nome.trim()).filter(Boolean);
  return nomes.length ? nomes.join(", ") : "Exame";
}

function textoCampo(valor: string | null | undefined): string | null {
  const t = valor?.trim();
  return t ? t : null;
}

function HistoricoDetalheCorpo({
  item,
  podeProntuario,
  podeReceita,
  podeDocumentos,
  onPdfErro,
}: {
  item: ProntuarioHistoricoItem;
  podeProntuario: boolean;
  podeReceita: boolean;
  podeDocumentos: boolean;
  onPdfErro: (e: unknown) => void;
}) {
  const motivo = textoCampo(item.motivo_retificacao);
  const campos = item.ficha_campos ?? [];
  const dados = parseDadosJson(item.dados_json);
  const camposPreenchidos = camposHistoricoComConteudo(campos, dados);
  const usaFichaDinamica = camposPreenchidos.length > 0;
  const fichaModo = item.ficha_modo ?? "secoes";
  const fichaTemplateId = item.ficha_template_id ?? null;

  const cid =
    item.cid_codigo?.trim()
      ? `${item.cid_codigo.trim()}${item.cid_descricao?.trim() ? ` — ${item.cid_descricao.trim()}` : ""}`
      : null;

  const retorno =
    item.retorno_dias != null
      ? item.retorno_ate?.trim()
        ? `${item.retorno_dias} dias (até ${formatDataBr(item.retorno_ate)})`
        : `${item.retorno_dias} dias`
      : null;

  const camposLegado: { label: string; valor: string | null }[] = [
    { label: "Queixa principal", valor: textoCampo(item.queixa_principal) },
    { label: "Anamnese", valor: textoCampo(item.anamnese) },
    { label: "Exame físico", valor: textoCampo(item.exame_fisico) },
    { label: "Hipótese diagnóstica", valor: textoCampo(item.hipotese_diagnostica) },
    { label: "CID", valor: cid },
    { label: "Conduta", valor: textoCampo(item.conduta) },
    { label: "Plano", valor: textoCampo(item.plano) },
    { label: "Retorno", valor: retorno },
  ];

  const preenchidosLegado = camposLegado.filter((c) => c.valor);

  const temConsultaPdf = usaFichaDinamica || preenchidosLegado.length > 0;
  const docs = [
    temConsultaPdf && podeProntuario
      ? { label: "Consulta PDF", fn: () => api.consultaPdf(item.id) }
      : null,
    temDoc(item.tem_receita) && podeReceita
      ? { label: "Receita PDF", fn: () => api.receitaPdf(item.id) }
      : null,
    temDoc(item.tem_pedido_exame) && podeDocumentos
      ? { label: "Pedido de exame PDF", fn: () => api.pedidoExamePdf(item.id) }
      : null,
    temDoc(item.tem_atestado) && podeDocumentos
      ? { label: "Atestado PDF", fn: () => api.atestadoPdf(item.id) }
      : null,
  ].filter(Boolean) as { label: string; fn: () => Promise<void> }[];

  return (
    <div className="historico-detalhe">
      {item.retificacao_de_id ? (
        <p className="historico-detalhe__meta">
          <strong>Retificação</strong> · pront. {item.retificacao_de_id} / {item.id}
          {motivo ? ` · Motivo: ${motivo}` : ""}
        </p>
      ) : null}
      {usaFichaDinamica ? (
        <>
          {item.ficha_titulo_documento ? (
            <p className="historico-detalhe__meta">{item.ficha_titulo_documento}</p>
          ) : null}
          <div className="historico-detalhe__folha">
            {fichaModo === "pdf_fundo" && fichaTemplateId ? (
              <FichaPdfFundoCorpo
                fichaId={fichaTemplateId}
                campos={camposPreenchidos}
                posicoes={item.ficha_campos_posicao ?? []}
                dados={dados}
                readOnly
              />
            ) : (
              <FichaCamposCorpo
                campos={camposPreenchidos}
                dados={dados}
                readOnly
              />
            )}
          </div>
        </>
      ) : preenchidosLegado.length === 0 ? (
        <p className="historico-detalhe__vazio text-[var(--muted)]">
          Nenhum dado clínico registrado neste prontuário.
        </p>
      ) : (
        <dl className="historico-detalhe__lista">
          {preenchidosLegado.map((campo) => (
            <div key={campo.label} className="historico-detalhe__item">
              <dt>{campo.label}</dt>
              <dd>{campo.valor}</dd>
            </div>
          ))}
        </dl>
      )}
      {docs.length > 0 ? (
        <div className="historico-detalhe__docs flex flex-wrap gap-2 mt-3">
          <ImprimirDocumentosLoteButton
            prontuarioId={item.id}
            className="btn btn-primary btn-sm"
            label="Imprimir todos"
          />
          {docs.map((doc) => (
            <button
              key={doc.label}
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => void doc.fn().catch(onPdfErro)}
            >
              {doc.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function AtendimentoHistoricoPanel({
  pacienteId,
  pacienteNome,
  prontuarioAtualId = 0,
  consultaAtual,
  podeRetificar,
  ocultarCabecalho = false,
}: Props) {
  const msg = useMessageBox();
  const navigate = useNavigate();
  const { permissoes } = useAuth();
  const podeProntuario = temModulo(permissoes, [
    "prontuario_ler",
    "prontuario_escrever",
  ]);
  const podeReceita = temModulo(permissoes, "receituario");
  const podeDocumentos = temModulo(permissoes, "documentos");
  const [itens, setItens] = useState<ProntuarioHistoricoItem[]>([]);
  const [exames, setExames] = useState<HistoricoExameClinicoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandidoId, setExpandidoId] = useState<number | null>(null);
  const [retificarItem, setRetificarItem] = useState<ProntuarioHistoricoItem | null>(
    null,
  );
  const [motivo, setMotivo] = useState("");
  const [retificando, setRetificando] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const [prontRes, exameRes] = await Promise.allSettled([
        api.prontuarioHistorico(pacienteId),
        api.historicoExamesClinicos(pacienteId),
      ]);

      if (prontRes.status === "rejected") {
        throw prontRes.reason;
      }
      setItens(
        prontRes.value
          .filter((r) => !prontuarioAtualId || r.id !== prontuarioAtualId)
          .map((r) => normalizarProntuarioDetalhe(r) as ProntuarioHistoricoItem),
      );

      if (exameRes.status === "fulfilled") {
        setExames(exameRes.value);
      } else {
        setExames([]);
        const e = exameRes.reason;
        void msg.error(
          e instanceof ApiError
            ? `Exames do histórico: ${e.message}`
            : "Não foi possível carregar exames do histórico",
        );
      }
    } catch (e) {
      void msg.error(
        e instanceof ApiError ? e.message : "Erro ao carregar histórico",
      );
    } finally {
      setLoading(false);
    }
  }, [pacienteId, prontuarioAtualId, msg]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const timeline = useMemo(
    () => montarTimelineHistoricoClinico(itens, exames, consultaAtual),
    [itens, exames, consultaAtual],
  );

  const confirmarRetificacao = async () => {
    if (!retificarItem) return;
    const texto = motivo.trim();
    if (texto.length < 3) {
      void msg.warning("Informe o motivo da retificação (mínimo 3 caracteres).");
      return;
    }
    setRetificando(true);
    try {
      const { prontuario } = await api.prontuarioRetificar(
        retificarItem.id,
        texto,
      );
      setRetificarItem(null);
      setMotivo("");
      navigate(`/medico/atendimento/${prontuario.id}`, {
        replace: true,
        state: {
          retificacaoOrigem: {
            prontuarioId: prontuarioAtualId,
            aba: "historico",
          },
        },
      });
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro ao retificar");
    } finally {
      setRetificando(false);
    }
  };

  if (loading) {
    return (
      <div className="prontuario-lista-panel p-8 text-center text-[var(--muted)]">
        Carregando histórico…
      </div>
    );
  }

  return (
    <>
      <div className="prontuario-lista-panel">
      {ocultarCabecalho ? null : (
        <AtendimentoCardTitulo
          titulo="Histórico clínico"
          pacienteNome={pacienteNome}
        />
      )}
      <p className="historico-legenda text-[var(--muted)]">
        Consultas (com retificações agrupadas) e exames realizados no horário
        só-exame. Exames aparecem mesmo sem laudo PDF.
      </p>
      {consultaAtual?.retificacao_de_id ? (
        <div className="historico-retificacao-andamento" role="status">
          <p className="historico-retificacao-andamento__titulo">
            Retificação em andamento — prontuário nº {consultaAtual.id}
          </p>
          <p>
            Corrigindo o prontuário nº <strong>{consultaAtual.retificacao_de_id}</strong>
            {consultaAtual.motivo_retificacao?.trim() ? (
              <>
                {" "}
                · Motivo: <em>{consultaAtual.motivo_retificacao.trim()}</em>
              </>
            ) : null}
          </p>
          <p className="historico-retificacao-andamento__hint">
            O texto do modal foi só o <strong>motivo</strong> (auditoria). Os dados
            clínicos corrigidos ficam na aba <strong>Retificação</strong> — edite lá e
            clique <strong>Salvar retificação</strong>.
          </p>
        </div>
      ) : null}
      {timeline.length === 0 ? (
        <p className="text-[var(--muted)] px-2">
          Nenhuma consulta nem exame anterior registrado para este paciente.
        </p>
      ) : (
        <div className="prontuario-lista-wrap">
          <table className="data-table prontuario-lista-table prontuario-lista-table--historico">
            <thead>
              <tr>
                <th>Data</th>
                <th>Tipo / nº</th>
                <th>Médico</th>
                <th>CID</th>
                <th>Resumo</th>
                <th className="data-table__actions">Ações</th>
              </tr>
            </thead>
            <tbody>
              {timeline.map((entrada) => {
                if (entrada.kind === "exame") {
                  const ex = entrada.item;
                  const hora = formatHoraCurta(ex.hora);
                  const classes = [
                    "historico-row-exame",
                    entrada.inicioGrupo ? "historico-row-grupo-inicio" : "",
                  ]
                    .filter(Boolean)
                    .join(" ");
                  return (
                    <tr key={entrada.key} className={classes}>
                      <td>
                        {formatDataBr(ex.data)}
                        {hora ? (
                          <span className="historico-hora-exame"> · {hora}</span>
                        ) : null}
                      </td>
                      <td>
                        <span className="fila-tipo-badge fila-tipo-badge--exame">
                          Exame
                        </span>
                      </td>
                      <td>{ex.medico_nome}</td>
                      <td>—</td>
                      <td>
                        <div className="historico-celula-exame">
                          <div>{nomesProcedimentosExame(ex)}</div>
                          {ex.anexos.length === 0 ? (
                            <span className="text-[var(--muted)] text-xs">
                              Sem laudo anexado
                            </span>
                          ) : (
                            <div className="historico-exame-anexos">
                              {ex.anexos.map((a) => (
                                <button
                                  key={a.exame_anexo_id}
                                  type="button"
                                  className="btn btn-secondary btn-sm p-0 min-h-0 border-0 bg-transparent underline"
                                  onClick={() =>
                                    void api.exameArquivo(a.exame_anexo_id).catch((e) =>
                                      msg.error(
                                        e instanceof ApiError
                                          ? e.message
                                          : "Erro ao abrir PDF",
                                      ),
                                    )
                                  }
                                >
                                  {a.exame_nome}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="data-table__actions">
                        <span className="text-[var(--muted)] text-xs">—</span>
                      </td>
                    </tr>
                  );
                }

                const item = entrada.item;
                const expandido = expandidoId === item.id;
                const cid =
                  item.cid_codigo?.trim()
                    ? `${item.cid_codigo}${item.cid_descricao ? ` — ${item.cid_descricao}` : ""}`
                    : "—";
                const classes = [
                  item.retificacao_de_id ? "historico-row-retificacao" : "",
                  entrada.inicioGrupo ? "historico-row-grupo-inicio" : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <Fragment key={entrada.key}>
                    <tr className={classes || undefined}>
                      <td>{formatDataBr(item.data_atendimento)}</td>
                      <td>{celulaProntuario(item)}</td>
                      <td>{item.medico_nome}</td>
                      <td>{cid}</td>
                      <td>
                        {item.retificacao_de_id ? (
                          <div className="historico-celula-retificacao">
                            {item.motivo_retificacao?.trim() ? (
                              <div>
                                <strong>Motivo:</strong>{" "}
                                {item.motivo_retificacao.trim()}
                              </div>
                            ) : null}
                            {item.queixa_principal?.trim() ? (
                              <div>
                                <strong>Queixa corrigida:</strong>{" "}
                                {item.queixa_principal.trim()}
                              </div>
                            ) : (
                              <span className="text-[var(--muted)]">
                                Queixa ainda não preenchida na retificação
                              </span>
                            )}
                          </div>
                        ) : (
                          item.queixa_principal?.trim() || "—"
                        )}
                      </td>
                      <td className="data-table__actions">
                        <div className="prontuario-lista-acoes">
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() =>
                            setExpandidoId(expandido ? null : item.id)
                          }
                        >
                          {expandido ? "Ocultar" : "Detalhes"}
                        </button>
                        {podeRetificar && !item.retificacao_de_id ? (
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => {
                              setRetificarItem(item);
                              setMotivo("");
                            }}
                          >
                            Retificar
                          </button>
                        ) : null}
                        </div>
                      </td>
                    </tr>
                    {expandido ? (
                      <tr key={`${item.id}-det`} className="historico-detalhe-row">
                        <td colSpan={6}>
                          <HistoricoDetalheCorpo
                            item={item}
                            podeProntuario={podeProntuario}
                            podeReceita={podeReceita}
                            podeDocumentos={podeDocumentos}
                            onPdfErro={(e) =>
                              void msg.error(
                                e instanceof ApiError ? e.message : "Erro ao abrir PDF",
                              )
                            }
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
      )}
      </div>

      {retificarItem ? (
        <div
          className="modal-overlay"
          role="presentation"
          onClick={() => setRetificarItem(null)}
        >
          <div
            className="modal panel exame-anexar-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="retificar-titulo"
            onClick={(ev) => ev.stopPropagation()}
          >
            <h2 id="retificar-titulo" className="modal__title">
              Retificar consulta
            </h2>
            <p className="modal__text">
              Prontuário nº {retificarItem.id} — {formatDataBr(retificarItem.data_atendimento)} —{" "}
              {retificarItem.medico_nome}.
            </p>
            <p className="modal__text m-0 mb-3">
              Passo 1: informe o motivo. Passo 2: corrija os campos no prontuário.
            </p>

            <div className="backup-restore-passo">
              <div className="backup-restore-passo__num">1</div>
              <div className="backup-restore-passo__corpo">
                <p className="backup-restore-passo__titulo">Motivo da retificação</p>
                <p className="backup-restore-passo__hint">
                  Este texto é só o <strong>motivo</strong> (auditoria). Não substitui
                  queixa, anamnese nem CID — isso você corrige no prontuário depois.
                </p>
                <label
                  className="exame-anexar-descricao"
                  htmlFor="retificacao-motivo-input"
                >
                  <span className="exame-anexar-descricao__rotulo">
                    Campo de texto — digite aqui
                  </span>
                  <textarea
                    id="retificacao-motivo-input"
                    className="legacy-input exame-anexar-descricao__input exame-anexar-descricao__textarea"
                    rows={4}
                    maxLength={2000}
                    value={motivo}
                    onChange={(ev) => setMotivo(ev.target.value)}
                    placeholder="Ex.: CORREÇÃO DE CID, COMPLEMENTO DE ANAMNESE…"
                  />
                </label>
              </div>
            </div>

            <div className="backup-restore-passo mt-3">
              <div className="backup-restore-passo__num">2</div>
              <div className="backup-restore-passo__corpo">
                <p className="backup-restore-passo__titulo">Corrigir no prontuário</p>
                <p className="backup-restore-passo__hint">
                  Ao confirmar, abriremos o prontuário com cópia da consulta original.
                  Lá você edita queixa, anamnese, exame físico, CID e conduta — e
                  finaliza.
                </p>
                <button
                  type="button"
                  className="btn btn-primary agenda-big-action"
                  disabled={retificando || motivo.trim().length < 3}
                  onClick={() => void confirmarRetificacao()}
                >
                  {retificando ? "Criando…" : "Criar retificação e editar"}
                </button>
              </div>
            </div>

            <div className="modal__actions mt-3">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setRetificarItem(null)}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
