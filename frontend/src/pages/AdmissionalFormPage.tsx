import { useCallback, useEffect, useState } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import { AdmissionalExameVinculo } from "../components/AdmissionalExameVinculo";
import { AdmissionalRetificarDialog } from "../components/AdmissionalRetificarDialog";
import { FichaCamposCorpo } from "../components/FichaCamposCorpo";
import { FichaPdfFundoCorpo } from "../components/FichaPdfFundoCorpo";
import { PageHeader } from "../components/PageHeader";
import { VoltarButton } from "../components/VoltarButton";
import {
  ApiError,
  api,
  type AdmissionalConclusao,
  type AdmissionalDados,
  type AdmissionalRow,
  type FichaTemplate,
} from "../lib/api";
import { camposCorpoAso } from "../lib/asoModelo";
import type { FichaCampoDef } from "../lib/fichaTipos";
import {
  ASO_ACIDENTES,
  ASO_EXAMES,
  ASO_FISICOS,
  ASO_NR35,
  ASO_QUIMICOS,
  ASO_TEXTO_LEGAL,
  ASO_TIPOS_ATESTADO,
} from "../lib/admissionalAso";
import { useAuth } from "../lib/authContext";
import { useClinicaBranding } from "../lib/clinicaBrandingContext";
import { useMessageBox } from "../lib/messageBoxContext";
import { temModulo } from "../lib/permissoes";
import { isSafeAppPath } from "../lib/appPath";
import { ASO_TITULO } from "../lib/tipoAtendimento";
import { upperPrompt } from "../lib/upperPrompt";
import "../prontuario-papel.css";
import "../admissional-aso.css";

const CONCLUSAO_LABEL: Record<AdmissionalConclusao, string> = {
  apto: "Apto",
  inapto: "Inapto",
  apto_com_restricao: "Apto com restrição",
};

const CONCLUSOES: { value: AdmissionalConclusao; label: string }[] = [
  { value: "apto", label: "Apto" },
  { value: "inapto", label: "Inapto" },
  { value: "apto_com_restricao", label: "Apto com restrição" },
];

function formatDataBr(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

type AdmissionalLocationState = {
  fromFila?: boolean;
  fromAgenda?: boolean;
  fromPaciente?: boolean;
  returnTo?: string;
};

function rotaVoltarAdmissional(
  state: AdmissionalLocationState | null,
): string {
  if (state?.returnTo && isSafeAppPath(state.returnTo)) return state.returnTo;
  if (state?.fromFila) return "/medico/fila";
  if (state?.fromPaciente) return "/pacientes";
  return "/agenda";
}

function labelVoltarAdmissional(state: AdmissionalLocationState | null): string {
  if (state?.fromFila) return "Voltar p/ Sala de Espera";
  if (state?.fromPaciente) return "Voltar ao paciente";
  return "Voltar à agenda";
}

function retificacaoEmAndamento(row: AdmissionalRow): boolean {
  return Boolean(row.retificacao_de_id) && !Number(row.retificacao_finalizada);
}

export function AdmissionalFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const navState = (location.state as AdmissionalLocationState | null) ?? null;
  const voltarPara = rotaVoltarAdmissional(navState);
  const voltarLabel = labelVoltarAdmissional(navState);
  const { permissoes } = useAuth();
  const { branding } = useClinicaBranding();
  const msg = useMessageBox();
  const podeEditar = temModulo(permissoes, "admissional");
  const podeVincularExame = temModulo(permissoes, ["admissional", "exames_anexos"]);
  const admissionalId = Number(id);

  const [row, setRow] = useState<AdmissionalRow | null>(null);
  const [dados, setDados] = useState<AdmissionalDados | null>(null);
  const [dadosModelo, setDadosModelo] = useState<Record<string, unknown> | null>(
    null,
  );
  const [conclusao, setConclusao] = useState<AdmissionalConclusao | "">("");
  const [restricoes, setRestricoes] = useState("");
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [retificarAberto, setRetificarAberto] = useState(false);
  const [modelosAso, setModelosAso] = useState<FichaTemplate[]>([]);
  const [trocandoModelo, setTrocandoModelo] = useState(false);

  const finalizado = row?.status === "finalizado";
  const somenteLeitura = finalizado || !podeEditar;
  const ehRetificacao = Boolean(row?.retificacao_de_id);
  const emAndamento = row ? retificacaoEmAndamento(row) : false;

  const irParaFolha = useCallback(
    (id: number) => {
      navigate(`/admissional/${id}`, { replace: true, state: navState });
    },
    [navigate, navState],
  );

  const aplicarLinha = useCallback((r: AdmissionalRow) => {
    setRow(r);
    if (r.aso_legado === false && r.aso_campos?.length) {
      setDados(null);
      setDadosModelo((r.dados as Record<string, unknown>) ?? {});
    } else {
      setDadosModelo(null);
      setDados((r.dados as AdmissionalDados) ?? null);
    }
    setConclusao(r.conclusao ?? "");
    setRestricoes(r.restricoes_texto ?? "");
  }, []);

  useEffect(() => {
    setRetificarAberto(false);
  }, [admissionalId]);

  useEffect(() => {
    if (!Number.isFinite(admissionalId)) return;
    setLoading(true);
    api
      .admissionalGet(admissionalId)
      .then(aplicarLinha)
      .catch((e) => {
        void msg.error(e instanceof ApiError ? e.message : "Erro ao carregar");
        navigate(voltarPara);
      })
      .finally(() => setLoading(false));
  }, [admissionalId, aplicarLinha, msg, navigate, voltarPara]);

  useEffect(() => {
    if (!row?.medico_id || somenteLeitura || ehRetificacao) {
      setModelosAso([]);
      return;
    }
    void api
      .fichasTemplateDisponiveis(row.medico_id, "aso")
      .then((r) => setModelosAso(r.fichas))
      .catch(() => setModelosAso([]));
  }, [row?.medico_id, somenteLeitura, ehRetificacao]);

  const patchDados = (partial: Partial<AdmissionalDados>) => {
    if (!dados || somenteLeitura) return;
    setDados({ ...dados, ...partial });
  };

  const toggleMap = (
    map: Record<string, boolean>,
    key: string,
  ): Record<string, boolean> => ({
    ...map,
    [key]: !map[key],
  });

  const finalizar = useCallback(async () => {
    const payloadDados = dadosModelo ?? dados;
    if (!payloadDados || !row || somenteLeitura) return;
    if (!conclusao) {
      void msg.warning("Selecione a conclusão (Apto / Inapto) antes de finalizar");
      return;
    }
    if (conclusao === "apto_com_restricao" && !restricoes.trim()) {
      void msg.warning("Descreva as restrições");
      return;
    }
    const ehRet = Boolean(row.retificacao_de_id);
    const ok = await msg.confirm({
      title: ehRet ? "Salvar retificação?" : "Finalizar ASO?",
      message: ehRet
        ? `O atestado original (nº ${row.retificacao_de_id}) permanece intacto. Esta folha nº ${row.id} fica gravada como correção.`
        : "Após finalizar, este atestado não poderá ser editado. Correções usam retificação (folha nova).",
    });
    if (!ok) return;

    setSalvando(true);
    try {
      const updated = await api.admissionalFinalizar(row.id, {
        conclusao,
        restricoes_texto: restricoes.trim() || undefined,
        dados: payloadDados,
      });
      setRow(updated);
      setDados(
        updated.aso_legado === false
          ? null
          : ((updated.dados as AdmissionalDados) ?? null),
      );
      setDadosModelo(
        updated.aso_legado === false
          ? ((updated.dados as Record<string, unknown>) ?? {})
          : null,
      );
      void msg.success(
        updated.retificacao_de_id
          ? "Retificação salva — ASO original preservado"
          : "ASO finalizado",
      );

      const imprimir = await msg.confirm({
        title: "Imprimir PDF?",
        message: "Deseja abrir o PDF do atestado para impressão?",
        confirmLabel: "Imprimir",
        cancelLabel: "Agora não",
      });
      if (imprimir) {
        try {
          await api.admissionalPdf(updated.id);
        } catch (e) {
          void msg.error(
            e instanceof ApiError ? e.message : "Erro ao gerar PDF",
          );
        }
      }

      if (updated.retificacao_de_id) {
        irParaFolha(updated.retificacao_de_id);
      } else {
        navigate(voltarPara, { replace: true });
      }
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro ao finalizar");
    } finally {
      setSalvando(false);
    }
  }, [conclusao, dados, dadosModelo, irParaFolha, msg, navigate, restricoes, row, somenteLeitura, voltarPara]);

  const desistirRetificacao = useCallback(async () => {
    if (!row?.retificacao_de_id || !retificacaoEmAndamento(row)) return;
    const ok = await msg.confirm({
      title: "Desistir da retificação?",
      message:
        "A retificação em andamento será removida. O ASO original (nº " +
        row.retificacao_de_id +
        ") permanece intacto.",
      confirmLabel: "Sim, desistir",
      cancelLabel: "Continuar editando",
    });
    if (!ok) return;
    setSalvando(true);
    try {
      const r = await api.admissionalCancelarRetificacao(row.id);
      irParaFolha(r.admissional_origem_id);
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro ao cancelar retificação");
    } finally {
      setSalvando(false);
    }
  }, [irParaFolha, msg, row]);

  const voltar = useCallback(async () => {
    if (row && retificacaoEmAndamento(row)) {
      await desistirRetificacao();
      return;
    }
    if (row?.retificacao_de_id) {
      irParaFolha(row.retificacao_de_id);
      return;
    }
    navigate(voltarPara);
  }, [desistirRetificacao, irParaFolha, navigate, row, voltarPara]);

  const imprimirPdf = useCallback(async () => {
    if (!row || row.status !== "finalizado") return;
    try {
      await api.admissionalPdf(row.id);
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro ao gerar PDF");
    }
  }, [msg, row]);

  const trocarModelo = useCallback(
    async (valor: string) => {
      if (!row || somenteLeitura || row.retificacao_de_id) return;
      const templateId = Number(valor);
      if (!templateId || templateId === row.aso_template_id) return;
      const modelo = modelosAso.find((m) => m.id === templateId);
      if (!modelo || modelo.destino !== "aso") {
        void msg.error(
          "Este modelo é ficha de consulta, não de ASO. Crie o papel em Configurações → Modelos ASO.",
        );
        return;
      }
      const legado = row.aso_legado !== false && !row.aso_template_id;
      const ok = await msg.confirm({
        title: legado ? "Usar um modelo de ASO?" : "Trocar modelo ASO?",
        message: legado
          ? "O papel antigo (Med Center) será substituído pelo modelo escolhido. Os campos do miolo são esvaziados; a conclusão já preenchida permanece."
          : "Os campos do miolo serão esvaziados. A conclusão já preenchida permanece.",
      });
      if (!ok) return;
      setTrocandoModelo(true);
      try {
        const updated = await api.admissionalModelo(row.id, templateId);
        aplicarLinha(updated);
      } catch (e) {
        void msg.error(e instanceof ApiError ? e.message : "Erro ao trocar modelo");
      } finally {
        setTrocandoModelo(false);
      }
    },
    [aplicarLinha, modelosAso, msg, row, somenteLeitura],
  );

  if (loading || !row) {
    return (
      <div className="flex flex-1 items-center justify-center text-[var(--muted)]">
        Carregando…
      </div>
    );
  }

  if (!dados && !dadosModelo && podeEditar) {
    return (
      <div className="flex flex-1 items-center justify-center text-[var(--muted)] p-4 text-center">
        Não foi possível carregar o formulário admissional.
      </div>
    );
  }

  const dataExame = row.finalizado_em ?? row.created_at;
  const usaModelo = Boolean(row.aso_campos?.length);
  const camposModelo = (row.aso_campos ?? []) as FichaCampoDef[];

  if (!dados && !dadosModelo) {
    return (
      <div className="page-stack flex-1 min-h-0 overflow-hidden">
        <PageHeader
          title={ehRetificacao ? "Retificação de ASO" : ASO_TITULO}
          subtitle={
            ehRetificacao
              ? `${row.paciente_nome ?? ""} — ASO nº ${row.id} corrige nº ${row.retificacao_de_id}`
              : (row.paciente_nome ?? "")
          }
        />
        <div className="atendimento-modo atendimento-modo--leitura px-4" role="status">
          Resumo admissional — sem acesso ao formulário clínico detalhado.
        </div>
        <div className="px-4 form-actions form-actions--toolbar border-b border-[var(--border)] pb-2 shrink-0">
          <VoltarButton
            className="btn btn-primary btn-sm"
            onClick={() => void voltar()}
          >
            {voltarLabel}
          </VoltarButton>
          {finalizado && row.conclusao ? (
            <div className="form-actions__direita">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => void imprimirPdf()}
            >
              Imprimir PDF
            </button>
            </div>
          ) : null}
        </div>
        <div className="scroll-interno flex-1 min-h-0 p-4">
          <div className="panel max-w-2xl mx-auto p-6 space-y-3">
            <p className="m-0">
              <strong>ASO nº:</strong> {row.id}
            </p>
            {row.retificacao_de_id ? (
              <p className="m-0">
                <strong>Retifica o ASO nº:</strong> {row.retificacao_de_id}
              </p>
            ) : null}
            {row.motivo_retificacao?.trim() ? (
              <p className="m-0">
                <strong>Motivo:</strong> {row.motivo_retificacao.trim()}
              </p>
            ) : null}
            <p className="m-0">
              <strong>Data:</strong> {formatDataBr(dataExame)}
            </p>
            <p className="m-0">
              <strong>Médico:</strong> {row.medico_nome}
              {row.medico_crm ? ` — ${row.medico_crm}` : ""}
            </p>
            <p className="m-0">
              <strong>Status:</strong>{" "}
              {finalizado ? "Finalizado" : row.status === "cancelado" ? "Cancelado" : "Em preenchimento"}
            </p>
            <p className="m-0">
              <strong>Conclusão:</strong>{" "}
              {row.conclusao ? CONCLUSAO_LABEL[row.conclusao] : "—"}
            </p>
            {row.conclusao === "apto_com_restricao" && row.restricoes_texto ? (
              <p className="m-0">
                <strong>Restrições:</strong> {row.restricoes_texto}
              </p>
            ) : null}
            {row.exame_anexo_id ? (
              <p className="m-0">
                <strong>Exame vinculado:</strong>{" "}
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() =>
                    void api.exameArquivo(row.exame_anexo_id!).catch((e) =>
                      msg.error(
                        e instanceof ApiError ? e.message : "Erro ao abrir exame",
                      ),
                    )
                  }
                >
                  {row.exame_nome_arquivo ?? `Exame #${row.exame_anexo_id}`}
                </button>
              </p>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-stack flex-1 min-h-0 overflow-hidden">
      <PageHeader
        title={ehRetificacao ? "Retificação de ASO" : "Atestado de Saúde Ocupacional"}
        subtitle={
          ehRetificacao
            ? `${row.paciente_nome ?? ""} — ASO nº ${row.id} corrige nº ${row.retificacao_de_id}`
            : (row.paciente_nome ?? "")
        }
      />
      {emAndamento ? (
        <div className="atendimento-modo atendimento-modo--retificacao px-4">
          Nova folha de correção · o ASO original (nº {row.retificacao_de_id}) não é
          apagado
        </div>
      ) : somenteLeitura ? (
        <div className="atendimento-modo atendimento-modo--leitura px-4" role="status">
          {finalizado
            ? ehRetificacao
              ? "Retificação salva — somente leitura. O original permanece no histórico."
              : "ASO finalizado — somente leitura. Para corrigir, use Retificar."
            : "Somente leitura (sem permissão de edição)."}
        </div>
      ) : null}
      <div className="px-4 form-actions form-actions--toolbar border-b border-[var(--border)] pb-2 shrink-0">
        <VoltarButton
          className="btn btn-primary btn-sm"
          onClick={() => void voltar()}
        >
          {voltarLabel}
        </VoltarButton>
        {finalizado ? (
          <div className="form-actions__direita">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => void imprimirPdf()}
          >
            Imprimir PDF
          </button>
          </div>
        ) : null}
      </div>
      {!somenteLeitura && !ehRetificacao ? (
        <div className="px-4 pb-2 shrink-0">
          <label className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">Modelo ASO:</span>
            <select
              className="legacy-input min-w-[14rem]"
              disabled={trocandoModelo || modelosAso.length === 0}
              value={row.aso_template_id ? String(row.aso_template_id) : ""}
              onChange={(e) => void trocarModelo(e.target.value)}
            >
              {!row.aso_template_id ? (
                <option value="">Formulário antigo (Med Center)</option>
              ) : null}
              {modelosAso.map((m) => (
                <option key={m.id} value={String(m.id)}>
                  {m.nome}
                  {m.eh_default ? " (padrão)" : ""}
                  {m.medico_nome ? ` — ${m.medico_nome}` : ""}
                </option>
              ))}
            </select>
            {modelosAso.length === 0 ? (
              <span className="text-[var(--muted)]">
                Nenhum modelo ativo. Crie em Configurações → Modelos ASO.
              </span>
            ) : !row.aso_template_id ? (
              <span className="text-[var(--muted)]">
                Escolha o modelo para este atendimento.
              </span>
            ) : null}
          </label>
        </div>
      ) : null}

      <div className="atendimento-prontuario-view scroll-interno flex-1 min-h-0 p-4 bg-[#e8e4dc]">
        <div className="prontuario-folha mx-auto w-full max-w-4xl aso-form">
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
                  {branding?.nome ?? "Clínica"}
                </div>
                {branding?.cnpj_cpf ? (
                  <div className="prontuario-topo__medico-info">
                    CNPJ: {branding.cnpj_cpf}
                  </div>
                ) : null}
              </div>
            </div>
            <div className="prontuario-topo__caixa">
              <div className="prontuario-topo__caixa-linha">
                <span>ASO nº:</span>
                <span className="prontuario-topo__caixa-valor">{row.id}</span>
              </div>
              {row.retificacao_de_id ? (
                <div className="prontuario-topo__caixa-linha">
                  <span>Corrige nº:</span>
                  <span className="prontuario-topo__caixa-valor">
                    {row.retificacao_de_id}
                  </span>
                </div>
              ) : null}
              <div className="prontuario-topo__caixa-linha">
                <span>Data:</span>
                <span className="prontuario-topo__caixa-valor">
                  {formatDataBr(dataExame)}
                </span>
              </div>
            </div>
          </header>

          <h2 className="aso-form__titulo">
            {ehRetificacao
              ? "Retificação — Atestado de Saúde Ocupacional"
              : "Atestado de Saúde Ocupacional"}
          </h2>

          {emAndamento ? (
            <div className="prontuario-retificacao-aviso" role="status">
              <p className="prontuario-retificacao-aviso__titulo">
                Nova folha (ASO nº {row.id}) ligada ao atestado original nº{" "}
                <strong>{row.retificacao_de_id}</strong>
              </p>
              <p className="prontuario-retificacao-aviso__diagrama">
                O ASO original nº {row.retificacao_de_id} permanece no histórico → esta
                retificação nº {row.id} guarda a versão corrigida.
              </p>
              {row.motivo_retificacao?.trim() ? (
                <p className="prontuario-retificacao-aviso__motivo">
                  <strong>Motivo:</strong> {row.motivo_retificacao.trim()}
                </p>
              ) : null}
              <p className="prontuario-retificacao-aviso__hint">
                Corrija checklist e conclusão abaixo. Ao terminar, clique em{" "}
                <strong>Salvar retificação</strong>.
              </p>
            </div>
          ) : ehRetificacao && finalizado ? (
            <div className="prontuario-retificacao-aviso" role="status">
              <p className="prontuario-retificacao-aviso__titulo">
                Retificação do ASO nº {row.retificacao_de_id}
              </p>
              {row.motivo_retificacao?.trim() ? (
                <p className="prontuario-retificacao-aviso__motivo">
                  <strong>Motivo:</strong> {row.motivo_retificacao.trim()}
                </p>
              ) : null}
            </div>
          ) : null}

          {usaModelo && dadosModelo ? (
            row.aso_modo === "pdf_fundo" && row.aso_template_id ? (
              <FichaPdfFundoCorpo
                fichaId={row.aso_template_id}
                campos={camposCorpoAso(camposModelo)}
                posicoes={row.aso_campos_posicao ?? []}
                dados={dadosModelo}
                readOnly={somenteLeitura}
                onDadosChange={somenteLeitura ? undefined : setDadosModelo}
              />
            ) : (
              <FichaCamposCorpo
                campos={camposCorpoAso(camposModelo)}
                dados={dadosModelo}
                readOnly={somenteLeitura}
                onDadosChange={somenteLeitura ? undefined : setDadosModelo}
              />
            )
          ) : null}

          {dados && !usaModelo ? (
          <>
          <div className="aso-form__linha">
            <label>
              <span className="aso-form__rotulo">Nome da Empresa</span>
              <input
                type="text"
                className="prontuario-admissional-input"
                value={dados.empresa}
                disabled={somenteLeitura}
                onChange={(e) =>
                  patchDados({ empresa: upperPrompt(e.target.value) })
                }
              />
            </label>
          </div>

          <div className="aso-form__linha">
            <label>
              <span className="aso-form__rotulo">Nome do Funcionário</span>
              <div className="aso-form__funcionario">{row.paciente_nome}</div>
            </label>
            <label className="aso-form__linha--fixa">
              <span className="aso-form__rotulo">CPF</span>
              <div className="aso-form__funcionario">{row.paciente_cpf ?? "—"}</div>
            </label>
          </div>

          <div className="aso-form__linha">
            <label>
              <span className="aso-form__rotulo">C.I.</span>
              <input
                type="text"
                className="prontuario-admissional-input"
                value={dados.ci}
                disabled={somenteLeitura}
                onChange={(e) => patchDados({ ci: upperPrompt(e.target.value) })}
              />
            </label>
            <label>
              <span className="aso-form__rotulo">Função</span>
              <input
                type="text"
                className="prontuario-admissional-input"
                value={dados.funcao}
                disabled={somenteLeitura}
                onChange={(e) =>
                  patchDados({ funcao: upperPrompt(e.target.value) })
                }
              />
            </label>
          </div>

          <section className="aso-form__secao">
            <div className="aso-form__secao-titulo">Tipo de atestado</div>
            <div className="aso-form__radios">
              {ASO_TIPOS_ATESTADO.map((t) => (
                <label key={t.id} className="aso-form__radio">
                  <input
                    type="radio"
                    name="tipo_atestado"
                    checked={dados.tipo_atestado === t.id}
                    disabled={somenteLeitura}
                    onChange={() => patchDados({ tipo_atestado: t.id })}
                  />
                  {t.label}
                </label>
              ))}
            </div>
          </section>

          <section className="aso-form__secao">
            <div className="aso-form__secao-titulo">Riscos Ocupacionais</div>
            <textarea
              className="prontuario-secao__area aso-form__area"
              value={dados.riscos_texto}
              disabled={somenteLeitura}
              onChange={(e) =>
                patchDados({ riscos_texto: upperPrompt(e.target.value) })
              }
              rows={3}
              placeholder="Descreva os riscos ocupacionais…"
            />

            <div className="aso-form__secao-titulo mt-3">Químicos</div>
            <div className="aso-form__checks aso-form__checks--compact">
              {ASO_QUIMICOS.map((item) => (
                <label key={item.id} className="aso-form__check">
                  <input
                    type="checkbox"
                    checked={Boolean(dados.quimicos[item.id])}
                    disabled={somenteLeitura}
                    onChange={() =>
                      patchDados({ quimicos: toggleMap(dados.quimicos, item.id) })
                    }
                  />
                  {item.label}
                </label>
              ))}
            </div>

            <div className="aso-form__secao-titulo mt-3">Físicos</div>
            <div className="aso-form__checks">
              {ASO_FISICOS.map((item) => (
                <label key={item.id} className="aso-form__check">
                  <input
                    type="checkbox"
                    checked={Boolean(dados.fisicos[item.id])}
                    disabled={somenteLeitura}
                    onChange={() =>
                      patchDados({ fisicos: toggleMap(dados.fisicos, item.id) })
                    }
                  />
                  {item.label}
                </label>
              ))}
            </div>

            <div className="aso-form__checks mt-2">
              <label className="aso-form__check">
                <input
                  type="checkbox"
                  checked={dados.biologicos}
                  disabled={somenteLeitura}
                  onChange={() => patchDados({ biologicos: !dados.biologicos })}
                />
                Biológicos
              </label>
              <label className="aso-form__check">
                <input
                  type="checkbox"
                  checked={dados.ergonomicos}
                  disabled={somenteLeitura}
                  onChange={() => patchDados({ ergonomicos: !dados.ergonomicos })}
                />
                Ergonômicos
              </label>
            </div>

            <div className="aso-form__secao-titulo mt-3">Acidentes</div>
            <div className="aso-form__checks">
              {ASO_ACIDENTES.map((item) => (
                <label key={item.id} className="aso-form__check">
                  <input
                    type="checkbox"
                    checked={Boolean(dados.acidentes[item.id])}
                    disabled={somenteLeitura}
                    onChange={() =>
                      patchDados({
                        acidentes: toggleMap(dados.acidentes, item.id),
                      })
                    }
                  />
                  {item.label}
                </label>
              ))}
            </div>

            <label className="block mt-2">
              <span className="aso-form__rotulo">Outros riscos</span>
              <input
                type="text"
                className="prontuario-admissional-input w-full"
                value={dados.riscos_outros}
                disabled={somenteLeitura}
                onChange={(e) =>
                  patchDados({ riscos_outros: upperPrompt(e.target.value) })
                }
              />
            </label>
          </section>

          <section className="aso-form__secao">
            <div className="aso-form__secao-titulo">Exames Realizados</div>
            <div className="aso-form__exames">
              {ASO_EXAMES.map((ex) => {
                const ev = dados.exames[ex.id] ?? { realizado: false, data: "" };
                return (
                  <div key={ex.id} className="aso-form__exame-linha">
                    <label className="aso-form__check">
                      <input
                        type="checkbox"
                        checked={ev.realizado}
                        disabled={somenteLeitura}
                        onChange={() =>
                          patchDados({
                            exames: {
                              ...dados.exames,
                              [ex.id]: { ...ev, realizado: !ev.realizado },
                            },
                          })
                        }
                      />
                      {ex.label}
                    </label>
                    <input
                      type="text"
                      className="prontuario-admissional-input aso-form__exame-data"
                      placeholder="dd/mm/aaaa"
                      value={ev.data}
                      disabled={somenteLeitura || !ev.realizado}
                      onChange={(e) =>
                        patchDados({
                          exames: {
                            ...dados.exames,
                            [ex.id]: { ...ev, data: e.target.value },
                          },
                        })
                      }
                    />
                  </div>
                );
              })}
            </div>
            <label className="block mt-2">
              <span className="aso-form__rotulo">Outros exames</span>
              <input
                type="text"
                className="prontuario-admissional-input w-full"
                value={dados.exames_outros}
                disabled={somenteLeitura}
                onChange={(e) =>
                  patchDados({ exames_outros: upperPrompt(e.target.value) })
                }
              />
            </label>
          </section>
          </>
          ) : null}

          <p className="aso-form__legal">{ASO_TEXTO_LEGAL}</p>

          <section className="aso-form__secao">
            <div className="aso-form__secao-titulo">Conclusão</div>
            <div className="prontuario-admissional-conclusao">
              {CONCLUSOES.map((c) => (
                <label
                  key={c.value}
                  className="prontuario-admissional-conclusao__opcao"
                >
                  <input
                    type="radio"
                    name="conclusao"
                    value={c.value}
                    checked={conclusao === c.value}
                    disabled={somenteLeitura}
                    onChange={() => setConclusao(c.value)}
                  />
                  {c.label}
                </label>
              ))}
            </div>
            {conclusao === "apto_com_restricao" ? (
              <div className="mt-2">
                <label className="aso-form__rotulo">Restrições</label>
                <textarea
                  className="prontuario-secao__area w-full"
                  value={restricoes}
                  disabled={somenteLeitura}
                  onChange={(e) => setRestricoes(upperPrompt(e.target.value))}
                  rows={3}
                />
              </div>
            ) : null}
          </section>

          {dados && !usaModelo ? (
          <>
          <section className="aso-form__secao">
            <div className="aso-form__secao-titulo">NR 35 — trabalho em altura</div>
            <div className="aso-form__radios">
              {ASO_NR35.map((n) => (
                <label key={n.id} className="aso-form__radio">
                  <input
                    type="radio"
                    name="nr35"
                    checked={dados.nr35 === n.id}
                    disabled={somenteLeitura}
                    onChange={() => patchDados({ nr35: n.id })}
                  />
                  {n.label}
                </label>
              ))}
            </div>
          </section>

          <section className="aso-form__secao">
            <label className="aso-form__rotulo">Observações</label>
            <textarea
              className="prontuario-secao__area aso-form__area"
              value={dados.observacoes}
              disabled={somenteLeitura}
              onChange={(e) =>
                patchDados({ observacoes: upperPrompt(e.target.value) })
              }
              rows={3}
            />
          </section>
          </>
          ) : null}

          <div className="mt-6 text-center text-sm text-[var(--muted)]">
            <p>Médico examinador: {row.medico_nome}{row.medico_crm ? ` — ${row.medico_crm}` : ""}</p>
            <p className="mt-4">Recebi a segunda via do atestado — ASSINATURA: _______________________</p>
          </div>

          {podeVincularExame ? (
            <section className="aso-form__secao mt-6">
              <div className="aso-form__secao-titulo">Exame anexado (PDF externo)</div>
              <AdmissionalExameVinculo
                admissionalId={row.id}
                pacienteId={row.paciente_id}
                exameAnexoId={row.exame_anexo_id}
                exameNome={row.exame_nome_arquivo ?? null}
                onAtualizado={(item) => {
                  setRow((prev) =>
                    prev
                      ? {
                          ...prev,
                          exame_anexo_id: item.exame_anexo_id,
                          exame_descricao: item.exame_descricao,
                          exame_nome_arquivo: item.exame_nome_arquivo,
                        }
                      : prev,
                  );
                }}
              />
            </section>
          ) : null}

          {!somenteLeitura ? (
            <footer className="prontuario-acoes">
              <button
                type="button"
                className="btn btn-primary agenda-big-action"
                disabled={salvando}
                onClick={() => void finalizar()}
              >
                {salvando
                  ? ehRetificacao
                    ? "Salvando…"
                    : "Finalizando…"
                  : ehRetificacao
                    ? "Salvar retificação"
                    : "Finalizar ASO"}
              </button>
              {emAndamento ? (
                <button
                  type="button"
                  className="btn btn-secondary agenda-big-action"
                  disabled={salvando}
                  onClick={() => void desistirRetificacao()}
                >
                  Desistir da retificação
                </button>
              ) : null}
            </footer>
          ) : finalizado ? (
            <footer className="prontuario-acoes">
              <button
                type="button"
                className="btn btn-primary agenda-big-action"
                onClick={() => void imprimirPdf()}
              >
                Imprimir PDF
              </button>
              {podeEditar && !ehRetificacao ? (
                <button
                  type="button"
                  className="btn btn-secondary agenda-big-action"
                  onClick={() => setRetificarAberto(true)}
                >
                  Retificar
                </button>
              ) : null}
            </footer>
          ) : null}
        </div>
      </div>
      {retificarAberto && row ? (
        <AdmissionalRetificarDialog
          item={{
            id: row.id,
            medico_nome: row.medico_nome,
            dataLabel: formatDataBr(dataExame),
          }}
          onClose={() => setRetificarAberto(false)}
          onCriado={(id) => {
            setRetificarAberto(false);
            irParaFolha(id);
          }}
        />
      ) : null}
    </div>
  );
}
