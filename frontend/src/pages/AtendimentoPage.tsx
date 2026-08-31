import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { AtendimentoCobrancaPanel } from "../components/AtendimentoCobrancaPanel";
import { AtendimentoAtestadoPanel } from "../components/AtendimentoAtestadoPanel";
import { AtendimentoExamesPanel } from "../components/AtendimentoExamesPanel";
import { AtendimentoHistoricoPanel } from "../components/AtendimentoHistoricoPanel";
import { PacienteAtendimentoHistorico } from "../components/PacienteAtendimentoHistorico";
import { AtendimentoPedidoPanel } from "../components/AtendimentoPedidoPanel";
import { AtendimentoReceitaPanel } from "../components/AtendimentoReceitaPanel";
import { FichaCamposCorpo } from "../components/FichaCamposCorpo";
import { FichaPdfFundoCorpo } from "../components/FichaPdfFundoCorpo";
import { PageHeader } from "../components/PageHeader";
import { ApiError, api, type FichaTemplate, type ProntuarioDetalhe } from "../lib/api";
import { useClinicaBranding } from "../lib/clinicaBrandingContext";
import { useMessageBox } from "../lib/messageBoxContext";
import { temModulo } from "../lib/permissoes";
import { useAuth } from "../lib/authContext";
import {
  normalizarDadosEntrada,
  payloadProntuarioSave,
  syncProntuarioFromDados,
} from "../lib/prontuarioDados";
import { normalizarProntuarioDetalhe } from "../lib/prontuarioPaciente";
import { useFocusFirstField } from "../lib/useFocusFirstField";
import { VoltarButton } from "../components/VoltarButton";
import { ImprimirDocumentosLoteButton } from "../components/ImprimirDocumentosLoteButton";
import { isSafeAppPath } from "../lib/appPath";
import "../prontuario-papel.css";
import "../ficha-pdf-fundo.css";

type Aba = "ficha" | "receita" | "atestado" | "pedido" | "exames" | "atendimentos" | "historico" | "cobranca";

type AtendimentoLocationState = {
  abaInicial?: Aba;
  retificacaoOrigem?: { prontuarioId: number; aba: Aba };
  fromAgenda?: boolean;
  fromFila?: boolean;
  returnTo?: string;
};

function rotaVoltarAtendimento(
  state: AtendimentoLocationState | null,
): string {
  if (state?.returnTo && isSafeAppPath(state.returnTo)) return state.returnTo;
  if (state?.fromAgenda) return "/agenda";
  return "/medico/fila";
}

function labelVoltarAtendimento(state: AtendimentoLocationState | null): string {
  return state?.fromAgenda ? "Voltar à agenda" : "Voltar p/ Sala de Espera";
}

function formatDataBr(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function formatPacienteNasc(iso: string | null | undefined): string {
  if (!iso?.trim()) return "—";
  return formatDataBr(iso);
}

function calcularRetornoAte(dataAtendimento: string, dias: number): string {
  const base = dataAtendimento.trim().slice(0, 10);
  const d = new Date(`${base}T12:00:00`);
  d.setDate(d.getDate() + dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function campoPaciente(valor: string | null | undefined): string {
  const v = valor?.trim();
  return v ? v : "—";
}

function retificacaoEmAndamento(pr: ProntuarioDetalhe): boolean {
  return Boolean(pr.retificacao_de_id) && !pr.retificacao_finalizada;
}

function navegarOrigemRetificacao(
  navigate: ReturnType<typeof useNavigate>,
  origem: AtendimentoLocationState["retificacaoOrigem"],
  pr: ProntuarioDetalhe,
  voltarPara: string = "/medico/fila",
) {
  if (origem) {
    navigate(`/medico/atendimento/${origem.prontuarioId}`, {
      replace: true,
      state: { abaInicial: origem.aba },
    });
    return;
  }
  if (pr.retificacao_de_id) {
    navigate(`/medico/atendimento/${pr.retificacao_de_id}`, {
      replace: true,
      state: { abaInicial: "historico" },
    });
    return;
  }
  navigate(voltarPara, { replace: true });
}

export function AtendimentoPage() {
  const { id } = useParams<{ id: string }>();
  const prontuarioId = Number(id);
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = (location.state as AtendimentoLocationState | null) ?? null;
  const msg = useMessageBox();
  const { permissoes } = useAuth();
  const { branding } = useClinicaBranding();
  const [pr, setPr] = useState<ProntuarioDetalhe | null>(null);
  const [saving, setSaving] = useState(false);
  const [aba, setAba] = useState<Aba>("ficha");
  const [abasVisitadas, setAbasVisitadas] = useState<Set<Aba>>(
    () => new Set(["ficha"]),
  );
  const [fichasOpcoes, setFichasOpcoes] = useState<FichaTemplate[]>([]);
  const [trocandoFicha, setTrocandoFicha] = useState(false);

  const podeReceita = temModulo(permissoes, "receituario");
  const podeDocumentos = temModulo(permissoes, "documentos");
  const podeProntuario = temModulo(permissoes, [
    "prontuario_ler",
    "prontuario_escrever",
  ]);
  const podeEscrever = temModulo(permissoes, "prontuario_escrever");
  const podeCobrancaAtendimento = temModulo(permissoes, [
    "cobranca_solicitar",
    "cobranca",
  ]);
  const mostrarValoresCobranca = temModulo(permissoes, "cobranca");

  const marcarConsultaEncerrada = useCallback(() => {
    setPr((prev) => (prev ? { ...prev, consulta_encerrada: true } : prev));
  }, []);

  const tratarErroEdicao = useCallback(
    (e: unknown, fallback: string) => {
      if (e instanceof ApiError && e.status === 409) {
        void msg.warning(e.message);
        marcarConsultaEncerrada();
        return;
      }
      void msg.error(e instanceof ApiError ? e.message : fallback);
    },
    [marcarConsultaEncerrada, msg],
  );

  const irParaAba = (id: Aba) => {
    setAbasVisitadas((prev) => new Set(prev).add(id));
    setAba(id);
  };

  const carregar = useCallback(async () => {
    try {
      const data = await api.prontuarioGet(prontuarioId);
      setPr(normalizarProntuarioDetalhe(data));
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro ao carregar");
    }
  }, [prontuarioId, msg]);

  useEffect(() => {
    setPr(null);
    if (prontuarioId) void carregar();
  }, [prontuarioId, carregar]);

  useEffect(() => {
    const inicial = locationState?.abaInicial;
    if (inicial) {
      setAba(inicial);
      setAbasVisitadas(new Set(["ficha", inicial]));
      return;
    }
    setAba("ficha");
    setAbasVisitadas(new Set(["ficha"]));
  }, [prontuarioId, locationState?.abaInicial]);

  useEffect(() => {
    if (!pr?.medico_id) {
      setFichasOpcoes([]);
      return;
    }
    void api
      .fichasTemplateDisponiveis(pr.medico_id)
      .then((r) => setFichasOpcoes(r.fichas))
      .catch(() => setFichasOpcoes([]));
  }, [pr?.medico_id]);

  useFocusFirstField([aba, pr?.id], { enabled: Boolean(pr) });

  const finalizar = async () => {
    if (!pr) return;
    const ehRetificacao = Boolean(pr.retificacao_de_id);
    const emAndamento = retificacaoEmAndamento(pr);
    setSaving(true);
    try {
      await api.prontuarioSave(prontuarioId, payloadProntuarioSave(pr));
      if (ehRetificacao) {
        if (emAndamento) {
          await api.prontuarioFinalizar(prontuarioId);
        }
        void msg.success(
          emAndamento
            ? "Retificação salva — consulta original preservada no histórico"
            : "Retificação atualizada",
        );
        navegarOrigemRetificacao(
          navigate,
          locationState?.retificacaoOrigem,
          pr,
          rotaVoltarAtendimento(locationState),
        );
      } else {
        await api.prontuarioFinalizar(prontuarioId);
        void msg.success("Atendimento finalizado");
        navigate(rotaVoltarAtendimento(locationState), { replace: true });
      }
    } catch (e) {
      tratarErroEdicao(e, "Erro ao finalizar");
    } finally {
      setSaving(false);
    }
  };

  const desistirRetificacao = async () => {
    if (!pr?.retificacao_de_id || !retificacaoEmAndamento(pr)) return;
    const ok = await msg.confirm({
      title: "Desistir da retificação?",
      message:
        "A retificação em andamento será removida. A consulta original (prontuário nº " +
        pr.retificacao_de_id +
        ") permanece intacta.",
      confirmLabel: "Sim, desistir",
      cancelLabel: "Continuar editando",
    });
    if (!ok) return;
    setSaving(true);
    try {
      await api.prontuarioCancelarRetificacao(prontuarioId);
      navegarOrigemRetificacao(
        navigate,
        locationState?.retificacaoOrigem,
        pr,
        rotaVoltarAtendimento(locationState),
      );
    } catch (e) {
      tratarErroEdicao(e, "Erro ao cancelar retificação");
    } finally {
      setSaving(false);
    }
  };

  const voltarOrigem = async () => {
    if (pr && retificacaoEmAndamento(pr)) {
      await desistirRetificacao();
      return;
    }
    if (pr?.retificacao_de_id) {
      navegarOrigemRetificacao(
        navigate,
        locationState?.retificacaoOrigem,
        pr,
        rotaVoltarAtendimento(locationState),
      );
      return;
    }
    navigate(rotaVoltarAtendimento(locationState));
  };

  if (!pr) {
    return (
      <div className="p-8 text-center text-[var(--muted)]">Carregando prontuário…</div>
    );
  }

  const ehRetificacao = Boolean(pr.retificacao_de_id);
  const emAndamento = retificacaoEmAndamento(pr);
  const somenteLeitura = Boolean(pr.consulta_encerrada) || !podeEscrever;

  const fichaCampos = pr.ficha_campos ?? [];
  const fichaDados = pr.dados_json ?? {};
  const fichaModo = pr.ficha_modo ?? "secoes";
  const fichaPosicoes = pr.ficha_campos_posicao ?? [];
  const fichaTemplateId = pr.ficha_template_id ?? null;
  const retornoCampo = fichaCampos.find((c) => c.tipo === "retorno");
  const retornoDias =
    retornoCampo != null && typeof fichaDados[retornoCampo.id] === "number"
      ? (fichaDados[retornoCampo.id] as number)
      : (pr.retorno_dias ?? null);
  const retornoAtePreview =
    retornoDias != null && pr.data_atendimento
      ? calcularRetornoAte(pr.data_atendimento, retornoDias)
      : null;

  const tituloDocumento =
    pr.ficha_titulo_documento?.trim() ||
    (pr.retificacao_de_id ? "Retificação de evolução" : "Prontuário médico");

  const handleDadosChange = (dados: Record<string, unknown>) => {
    const normalizados = normalizarDadosEntrada(dados, fichaCampos);
    setPr((prev) =>
      prev ? syncProntuarioFromDados(prev, normalizados, fichaCampos) : prev,
    );
  };

  const podeTrocarFicha = Boolean(
    pr.agendamento_id && !somenteLeitura && !ehRetificacao,
  );

  const trocarFicha = async (valor: string) => {
    if (!pr.agendamento_id) return;
    const fichaId = valor === "" ? null : Number(valor);
    const atual = pr.ficha_template_id ?? null;
    if (fichaId === atual) return;
    setTrocandoFicha(true);
    try {
      await api.agendamentoFicha(pr.agendamento_id, fichaId);
      await carregar();
    } catch (e) {
      tratarErroEdicao(e, "Erro ao trocar ficha");
    } finally {
      setTrocandoFicha(false);
    }
  };

  const abas: { id: Aba; label: string; show: boolean }[] = [
    {
      id: "ficha",
      label: ehRetificacao ? "Retificação" : "Prontuário",
      show: true,
    },
    { id: "exames", label: "Exames anexados", show: podeProntuario },
    { id: "atendimentos", label: "Atendimentos", show: true },
    { id: "historico", label: "Histórico", show: podeProntuario },
    { id: "receita", label: "Receita", show: podeReceita },
    { id: "atestado", label: "Atestado", show: podeDocumentos },
    { id: "pedido", label: "Pedido exame", show: podeDocumentos },
    {
      id: "cobranca",
      label: "Procedimentos",
      show: podeCobrancaAtendimento,
    },
  ];

  return (
    <div className="page-stack flex-1 min-h-0 overflow-hidden">
      <PageHeader
        title={ehRetificacao ? "Retificação" : "Atendimento"}
        subtitle={
          ehRetificacao
            ? `${pr.paciente_nome ?? ""} — pront. nº ${pr.id} corrige nº ${pr.retificacao_de_id}`
            : (pr.paciente_nome ?? "")
        }
      />
      {emAndamento ? (
        <div className="atendimento-modo atendimento-modo--retificacao px-4">
          Nova folha de correção · a consulta original (nº {pr.retificacao_de_id}) não
          é apagada
        </div>
      ) : somenteLeitura ? (
        <div className="atendimento-modo atendimento-modo--leitura px-4" role="status">
          Consulta finalizada — somente leitura. Prontuário, receita, atestado, pedido de
          exame e vínculos de exames anexados não podem ser alterados. Para corrigir dados
          clínicos, use <strong>Retificar</strong> no histórico.
        </div>
      ) : null}
      <div className="px-4 form-actions form-actions--toolbar border-b border-[var(--border)] pb-2 shrink-0">
        <VoltarButton
          className="btn btn-primary btn-sm"
          onClick={() => void voltarOrigem()}
        >
          {labelVoltarAtendimento(locationState)}
        </VoltarButton>
        <div className="form-actions__direita">
        {abas
          .filter((t) => t.show && t.id !== aba)
          .map((t) => (
            <button
              key={t.id}
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => irParaAba(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      {podeTrocarFicha && aba === "ficha" ? (
        <div className="px-4 pb-2 shrink-0">
          <label className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">Ficha clínica:</span>
            <select
              className="legacy-input min-w-[14rem]"
              disabled={trocandoFicha}
              value={
                pr.ficha_template_id != null ? String(pr.ficha_template_id) : ""
              }
              onChange={(e) => void trocarFicha(e.target.value)}
            >
              <option value="">Padrão da clínica</option>
              {fichasOpcoes.map((f) => (
                <option key={f.id} value={String(f.id)}>
                  {f.nome}
                  {f.eh_default ? " (padrão)" : ""}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}
      <div className="atendimento-prontuario-view scroll-interno flex-1 min-h-0 p-4 bg-[#e8e4dc]">
        {aba === "ficha" ? (
          <div className="prontuario-folha mx-auto w-full max-w-4xl">
              <header className="prontuario-topo">
                <div className="prontuario-topo__esquerda">
                  {branding?.logo ? (
                    <img
                      src={branding.logo}
                      alt=""
                      className="prontuario-topo__logo"
                    />
                  ) : null}
                  <div>
                    <div className="prontuario-topo__medico-nome">
                      {pr.medico_nome}
                      {pr.medico_crm ? ` — ${pr.medico_crm}` : ""}
                    </div>
                    {branding?.nome ? (
                      <div className="prontuario-topo__medico-info">{branding.nome}</div>
                    ) : null}
                  </div>
                </div>
                <div className="prontuario-topo__caixa">
                  <div className="prontuario-topo__caixa-linha">
                    <span>Pront. nº:</span>
                    <span className="prontuario-topo__caixa-valor">{pr.id}</span>
                  </div>
                  {pr.retificacao_de_id ? (
                    <div className="prontuario-topo__caixa-linha">
                      <span>Corrige nº:</span>
                      <span className="prontuario-topo__caixa-valor">
                        {pr.retificacao_de_id}
                      </span>
                    </div>
                  ) : null}
                  <div className="prontuario-topo__caixa-linha">
                    <span>Data:</span>
                    <span className="prontuario-topo__caixa-valor">
                      {formatDataBr(
                        pr.data_atendimento ?? new Date().toISOString().slice(0, 10),
                      )}
                    </span>
                  </div>
                </div>
              </header>

              <h2 className="prontuario-titulo-documento">{tituloDocumento}</h2>

              {emAndamento ? (
                <div className="prontuario-retificacao-aviso" role="status">
                  <p className="prontuario-retificacao-aviso__titulo">
                    Nova folha (pront. nº {pr.id}) ligada à consulta original nº{" "}
                    <strong>{pr.retificacao_de_id}</strong>
                  </p>
                  <p className="prontuario-retificacao-aviso__diagrama">
                    Consulta original nº {pr.retificacao_de_id} permanece no histórico
                    → esta retificação nº {pr.id} guarda a versão corrigida.
                  </p>
                  {pr.motivo_retificacao?.trim() ? (
                    <p className="prontuario-retificacao-aviso__motivo">
                      <strong>Motivo:</strong> {pr.motivo_retificacao.trim()}
                    </p>
                  ) : null}
                  <p className="prontuario-retificacao-aviso__hint">
                    Digite os dados corretos nos campos abaixo (queixa, anamnese,
                    exame físico, CID, conduta…) e use os botões no final da folha.
                    Para outra aba (Receita, Histórico…) pode trocar acima — nada é
                    gravado até salvar.
                  </p>
                </div>
              ) : null}

              <section className="prontuario-identificacao">
                <div className="prontuario-linha">
                  <span className="prontuario-linha__rotulo">Nome:</span>
                  <input
                    type="text"
                    readOnly
                    tabIndex={-1}
                    className="prontuario-linha__valor prontuario-linha__input"
                    value={campoPaciente(pr.paciente_nome)}
                  />
                  <span className="prontuario-linha__rotulo">nasc.:</span>
                  <input
                    type="text"
                    readOnly
                    tabIndex={-1}
                    className="prontuario-linha__valor prontuario-linha__valor--curto prontuario-linha__input"
                    value={formatPacienteNasc(pr.paciente_nasc)}
                  />
                </div>
                <div className="prontuario-linha">
                  <span className="prontuario-linha__rotulo">CPF:</span>
                  <input
                    type="text"
                    readOnly
                    tabIndex={-1}
                    className="prontuario-linha__valor prontuario-linha__input"
                    value={campoPaciente(pr.paciente_cpf)}
                  />
                  <span className="prontuario-linha__rotulo">Tel.:</span>
                  <input
                    type="text"
                    readOnly
                    tabIndex={-1}
                    className="prontuario-linha__valor prontuario-linha__valor--telefone prontuario-linha__input"
                    value={campoPaciente(pr.paciente_telefone)}
                  />
                </div>
                <div className="prontuario-linha">
                  <span className="prontuario-linha__rotulo">E-mail:</span>
                  <input
                    type="text"
                    readOnly
                    tabIndex={-1}
                    className="prontuario-linha__valor prontuario-linha__input"
                    value={campoPaciente(pr.paciente_email)}
                  />
                </div>
                {pr.alergias?.trim() ? (
                  <div className="prontuario-alerta-alergia">{pr.alergias.trim()}</div>
                ) : null}
                {pr.medicacoes_uso?.trim() ? (
                  <div className="prontuario-alerta prontuario-alerta--medicacao">
                    {pr.medicacoes_uso.trim()}
                  </div>
                ) : null}
                {pr.observacoes_clinicas?.trim() ? (
                  <div className="prontuario-linha prontuario-linha--obs">
                    <span className="prontuario-linha__rotulo">Obs. clínicas:</span>
                    <span className="prontuario-linha__valor">
                      {pr.observacoes_clinicas.trim()}
                    </span>
                  </div>
                ) : null}
              </section>

              {fichaModo === "pdf_fundo" && fichaTemplateId ? (
                <FichaPdfFundoCorpo
                  fichaId={fichaTemplateId}
                  campos={fichaCampos}
                  posicoes={fichaPosicoes}
                  dados={fichaDados}
                  readOnly={somenteLeitura}
                  onDadosChange={somenteLeitura ? undefined : handleDadosChange}
                />
              ) : (
                <FichaCamposCorpo
                  campos={fichaCampos}
                  readOnly={somenteLeitura}
                  dados={fichaDados}
                  onDadosChange={somenteLeitura ? undefined : handleDadosChange}
                />
              )}

              {retornoCampo && retornoAtePreview ? (
                <section className="prontuario-secao">
                  <p className="prontuario-retorno__ate">
                    Válido até <strong>{formatDataBr(retornoAtePreview)}</strong>
                    {pr.retorno_ate && pr.retorno_ate !== retornoAtePreview
                      ? ` (salvo: ${formatDataBr(pr.retorno_ate)})`
                      : null}
                  </p>
                </section>
              ) : null}

              {!somenteLeitura ? (
              <footer className="prontuario-acoes">
                <button
                  type="button"
                  className="btn btn-primary agenda-big-action"
                  disabled={saving}
                  onClick={() => void finalizar()}
                >
                  {saving
                    ? "Salvando…"
                    : ehRetificacao
                      ? "Salvar retificação"
                      : "Finalizar"}
                </button>
                {emAndamento ? (
                  <button
                    type="button"
                    className="btn btn-secondary agenda-big-action"
                    disabled={saving}
                    onClick={() => void desistirRetificacao()}
                  >
                    Desistir da retificação
                  </button>
                ) : null}
              </footer>
              ) : null}

              {somenteLeitura && aba === "ficha" && podeProntuario ? (
                <footer className="prontuario-acoes flex flex-wrap gap-2">
                  <ImprimirDocumentosLoteButton prontuarioId={prontuarioId} />
                  <button
                    type="button"
                    className="btn btn-secondary agenda-big-action"
                    onClick={() => {
                      void api.consultaPdf(prontuarioId).catch((e) =>
                        tratarErroEdicao(e, "Erro ao gerar PDF da consulta"),
                      );
                    }}
                  >
                    Só consulta (PDF)
                  </button>
                </footer>
              ) : null}
          </div>
        ) : (
          <div className="prontuario-folha mx-auto w-full prontuario-folha--fill min-h-0">
          {abasVisitadas.has("receita") && podeReceita && aba === "receita" ? (
            <div className="flex flex-col flex-1 min-h-0 h-full">
              <AtendimentoReceitaPanel
                key={prontuarioId}
                prontuarioId={prontuarioId}
                pacienteNome={pr.paciente_nome ?? ""}
                somenteLeitura={somenteLeitura}
                onConsultaEncerrada={marcarConsultaEncerrada}
                onVoltar={() => irParaAba("ficha")}
              />
            </div>
          ) : null}

          {abasVisitadas.has("atestado") && podeDocumentos && aba === "atestado" ? (
              <AtendimentoAtestadoPanel
                key={prontuarioId}
                prontuarioId={prontuarioId}
                pacienteNome={pr.paciente_nome ?? ""}
                somenteLeitura={somenteLeitura}
                onConsultaEncerrada={marcarConsultaEncerrada}
                cidInicial={{
                  codigo: pr.cid_codigo ?? "",
                  descricao: pr.cid_descricao ?? "",
                }}
              onVoltar={() => irParaAba("ficha")}
            />
          ) : null}

          {abasVisitadas.has("pedido") && podeDocumentos && aba === "pedido" ? (
              <AtendimentoPedidoPanel
                key={prontuarioId}
                prontuarioId={prontuarioId}
                pacienteNome={pr.paciente_nome ?? ""}
                somenteLeitura={somenteLeitura}
                onConsultaEncerrada={marcarConsultaEncerrada}
                onVoltar={() => irParaAba("ficha")}
              />
          ) : null}

          {abasVisitadas.has("exames") && podeProntuario && aba === "exames" ? (
            <AtendimentoExamesPanel
              pacienteId={pr.paciente_id}
              pacienteNome={pr.paciente_nome ?? ""}
              prontuarioId={prontuarioId}
              podeVincular={podeEscrever}
              somenteLeitura={somenteLeitura}
              onConsultaEncerrada={marcarConsultaEncerrada}
            />
          ) : null}

          {abasVisitadas.has("atendimentos") && aba === "atendimentos" ? (
            <PacienteAtendimentoHistorico pacienteId={pr.paciente_id} />
          ) : null}

          {abasVisitadas.has("historico") && podeProntuario && aba === "historico" ? (
            <AtendimentoHistoricoPanel
              pacienteId={pr.paciente_id}
              pacienteNome={pr.paciente_nome ?? ""}
              prontuarioAtualId={prontuarioId}
              consultaAtual={
                emAndamento
                  ? {
                      id: pr.id,
                      data_atendimento: pr.data_atendimento ?? "",
                      retificacao_de_id: pr.retificacao_de_id ?? null,
                      motivo_retificacao: pr.motivo_retificacao ?? null,
                      queixa_principal: pr.queixa_principal ?? null,
                    }
                  : undefined
              }
              podeRetificar={podeEscrever}
            />
          ) : null}

          {abasVisitadas.has("cobranca") &&
          podeCobrancaAtendimento &&
          aba === "cobranca" ? (
            <AtendimentoCobrancaPanel
              key={prontuarioId}
              prontuarioId={prontuarioId}
              pacienteNome={pr.paciente_nome ?? ""}
              mostrarValores={mostrarValoresCobranca}
              somenteLeitura={somenteLeitura}
              onVoltar={() => irParaAba("ficha")}
            />
          ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
