import {
  ArrowDown,
  ArrowUp,
  Copy,
  Eye,
  Pencil,
  Plus,
  Star,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FichaCamposCorpo } from "../components/FichaCamposCorpo";
import { FichaPdfFundoCorpo } from "../components/FichaPdfFundoCorpo";
import { FichaPdfReferenciaPanel } from "../components/FichaPdfReferenciaPanel";
import {
  FichaFolhaLayout,
  FichaFolhaPage,
  FichaFolhaToolbar,
  FichaFolhaViewport,
} from "../components/FichaFolhaLayout";
import { FichaPreview } from "../components/FichaPreview";
import { PageHeader } from "../components/PageHeader";
import { VoltarButton } from "../components/VoltarButton";
import { ApiError, api, type FichaTemplate } from "../lib/api";
import { useAuth } from "../lib/authContext";
import {
  FICHA_TIPO_LABELS,
  FICHA_TIPOS_CAMPO,
  moverCampo,
  camposEmOrdem,
  novoCampo,
  reordenarCampos,
  rotuloCampo,
  validarCamposLocal,
  camposParaApi,
  opcoesFromTexto,
  aplicarTipoCampo,
  normalizarCamposEditor,
  normalizarCampoEditor,
  OPCOES_MARCADORES_PADRAO,
  defaultPosicoes,
  type FichaCampoDef,
  type FichaCampoPosicao,
  type FichaCampoTipo,
} from "../lib/fichaTipos";
import { isFormDirty, snapshotForm } from "../lib/formDirty";
import { temModulo } from "../lib/permissoes";
import { useMessageBox } from "../lib/messageBoxContext";
import { isCampoTravadoAso, validarCamposAsoLocal, garantirCamposTravadosAso } from "../lib/asoModelo";
import "../prontuario-papel.css";
import "../admissional-aso.css";
import "../ficha-folha.css";
import "../ficha-pdf-fundo.css";

type Mode = "list" | "origem" | "edit" | "preview";
type Escopo = "todas" | "clinica" | "minhas";

type FichaModo = "secoes" | "pdf_fundo";

type FichaForm = {
  nome: string;
  titulo_documento: string;
  campos: FichaCampoDef[];
  ativo: boolean;
  ehClinica: boolean;
  modo: FichaModo;
  campos_posicao: FichaCampoPosicao[];
  temPdf: boolean;
  pdf_revisado: boolean;
};

function fichaToForm(
  f: FichaTemplate,
  forcarClinica?: boolean,
  destino?: "prontuario" | "aso",
): FichaForm {
  let campos = normalizarCamposEditor(
    camposEmOrdem(
      f.campos.map((c) => ({ ...c, tipo: c.tipo as FichaCampoTipo })),
    ),
  );
  if ((destino ?? f.destino) === "aso") {
    campos = normalizarCamposEditor(garantirCamposTravadosAso(campos));
  }
  const temPdf = Boolean(f.pdf_referencia_path?.trim());
  return {
    nome: f.nome,
    titulo_documento: f.titulo_documento,
    campos,
    ativo: f.ativo,
    ehClinica: forcarClinica ?? f.medico_id == null,
    modo: f.modo === "pdf_fundo" ? "pdf_fundo" : "secoes",
    campos_posicao:
      f.campos_posicao?.length ? f.campos_posicao : defaultPosicoes(campos),
    temPdf,
    pdf_revisado: temPdf && f.ativo,
  };
}

function emptyFormFromTemplate(
  base: FichaTemplate,
  destino?: "prontuario" | "aso",
): FichaForm {
  let campos = normalizarCamposEditor(
    camposEmOrdem(
      base.campos.map((c) => ({ ...c, tipo: c.tipo as FichaCampoTipo })),
    ),
  );
  if ((destino ?? base.destino) === "aso") {
    campos = normalizarCamposEditor(garantirCamposTravadosAso(campos));
  }
  return {
    nome: "",
    titulo_documento: base.titulo_documento,
    campos,
    ativo: true,
    ehClinica: false,
    modo: "secoes",
    campos_posicao: defaultPosicoes(campos),
    temPdf: false,
    pdf_revisado: false,
  };
}

function snapshotFichaForm(f: FichaForm) {
  return snapshotForm(f);
}

export function FichasClinicasPage({
  destino = "prontuario",
}: {
  destino?: "prontuario" | "aso";
}) {
  const msg = useMessageBox();
  const { permissoes, me } = useAuth();
  const podeConfig = temModulo(permissoes, "fichas_config");
  const isAso = destino === "aso";
  const ui = isAso
    ? {
        title: "Modelos ASO",
        subtitle: "Formulários de atestado ocupacional reutilizáveis",
        nova: "Novo modelo",
        novaTitle: "Novo modelo ASO",
        origemSub: "Escolha como começar",
        origemTitulo: "Novo modelo de ASO",
        origemAvisoPessoal:
          "Novo modelo pessoal: você pode partir do padrão da clínica ou duplicar qualquer modelo visível — a cópia ficará em Minhas.",
        origemAvisoClinica:
          "Escolha a origem. O resultado será um papel de ASO igual ao preenchimento.",
        padraoH3: "A partir do template padrão",
        padraoNome: "ASO — padrão clínica",
        duplicarH3: "Duplicar modelo existente",
        duplicarRotulo: "Modelo origem",
        item: "modelo",
        vazio: "Nenhum modelo ASO encontrado.",
        previa: "Prévia ao vivo — folha de ASO",
      }
    : {
        title: "Fichas clínicas",
        subtitle: "Formulários de consulta reutilizáveis",
        nova: "Nova ficha",
        novaTitle: "Nova ficha",
        origemSub: "Escolha como começar",
        origemTitulo: "Nova ficha clínica",
        origemAvisoPessoal:
          "Nova ficha pessoal: você pode partir do padrão da clínica ou duplicar qualquer ficha visível — a cópia ficará em Minhas.",
        origemAvisoClinica:
          "Escolha a origem do formulário. O resultado será uma folha de consulta igual ao atendimento.",
        padraoH3: "A partir do template padrão",
        padraoNome: "Consulta — clínica geral",
        duplicarH3: "Duplicar ficha existente",
        duplicarRotulo: "Ficha origem",
        item: "ficha",
        vazio: "Nenhuma ficha encontrada.",
        previa: "Prévia ao vivo — folha de consulta",
      };
  const tiposEditor = (
    isAso
      ? FICHA_TIPOS_CAMPO.filter((t) => t !== "cid" && t !== "retorno")
      : FICHA_TIPOS_CAMPO.filter((t) => t !== "escolha")
  ) as FichaCampoTipo[];

  const [mode, setMode] = useState<Mode>("list");
  const [escopo, setEscopo] = useState<Escopo>(podeConfig ? "todas" : "minhas");
  const [fichas, setFichas] = useState<FichaTemplate[]>([]);
  const [fichasOrigem, setFichasOrigem] = useState<FichaTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [previewFicha, setPreviewFicha] = useState<FichaForm | null>(null);
  const [previewFromEdit, setPreviewFromEdit] = useState(false);
  const [form, setForm] = useState<FichaForm>(() => ({
    nome: "",
    titulo_documento:
      destino === "aso"
        ? "Atestado de Saúde Ocupacional"
        : "Prontuário de consulta",
    campos: [],
    ativo: true,
    ehClinica: podeConfig,
    modo: "secoes",
    campos_posicao: [],
    temPdf: false,
    pdf_revisado: false,
  }));
  const [baseline, setBaseline] = useState(() => snapshotFichaForm(form));
  const [dupOrigemId, setDupOrigemId] = useState<number | "">("");
  const [pdfOrigemFile, setPdfOrigemFile] = useState<File | null>(null);
  const [enviandoPdf, setEnviandoPdf] = useState(false);

  const fichaPadrao = useMemo(
    () =>
      fichasOrigem.find((f) => f.eh_default && f.medico_id == null) ??
      fichasOrigem.find((f) => f.medico_id == null) ??
      fichasOrigem[0],
    [fichasOrigem],
  );

  const criandoPessoal = escopo === "minhas" || !podeConfig;

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.fichasTemplateList({ escopo, destino });
      setFichas(data.fichas);
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro ao carregar fichas");
    } finally {
      setLoading(false);
    }
  }, [msg, escopo, destino]);

  useEffect(() => {
    if (mode === "list" || mode === "origem") void carregar();
  }, [carregar, mode]);

  function podeEditar(f: FichaTemplate): boolean {
    if (f.medico_id == null) return podeConfig;
    return podeConfig || f.medico_id === me?.id;
  }

  async function voltarLista(force = false) {
    if (
      !force &&
      (mode === "edit" || mode === "preview") &&
      isFormDirty(form, baseline)
    ) {
      const ok = await msg.confirm({
        message: "Descartar alterações não salvas?",
      });
      if (!ok) return;
    }
    setMode("list");
    setEditId(null);
    setPreviewFicha(null);
  }

  function abrirOrigem() {
    void (async () => {
      try {
        const data = await api.fichasTemplateList({
          escopo: podeConfig ? "todas" : "minhas",
          destino,
        });
        setFichasOrigem(data.fichas);
        const padrao =
          data.fichas.find((f) => f.eh_default && f.medico_id == null) ??
          data.fichas[0];
        setDupOrigemId(padrao?.id ?? "");
      } catch (e) {
        setFichasOrigem(fichas);
        setDupOrigemId(fichaPadrao?.id ?? "");
        void msg.error(
          e instanceof ApiError ? e.message : "Erro ao carregar fichas para nova ficha",
        );
      }
      setMode("origem");
    })();
  }

  async function iniciarDoPadrao() {
    if (!fichaPadrao) {
      void msg.warning("Nenhuma ficha padrão encontrada");
      return;
    }
    const f = emptyFormFromTemplate(fichaPadrao, destino);
    f.nome = criandoPessoal
      ? isAso
        ? "Meu modelo ASO"
        : "Minha ficha"
      : isAso
        ? "Novo modelo ASO — clínica"
        : "Nova ficha — clínica";
    f.ehClinica = podeConfig && !criandoPessoal;
    setForm(f);
    setBaseline(snapshotFichaForm(f));
    setEditId(null);
    setMode("edit");
  }

  async function iniciarDuplicar() {
    if (dupOrigemId === "") {
      void msg.warning("Escolha uma ficha para duplicar");
      return;
    }
    try {
      const copia = await api.fichasTemplateDuplicar(Number(dupOrigemId), {
        pessoal: criandoPessoal || !podeConfig,
      });
      const f = fichaToForm(copia, undefined, destino);
      setForm(f);
      setBaseline(snapshotFichaForm(f));
      setEditId(copia.id);
      setMode("edit");
      void msg.success("Ficha duplicada — ajuste e salve");
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro ao duplicar");
    }
  }

  async function iniciarDoPdf() {
    if (!pdfOrigemFile) {
      void msg.warning("Selecione um arquivo PDF");
      return;
    }
    if (!fichaPadrao) {
      void msg.warning("Nenhuma ficha padrão encontrada");
      return;
    }
    setEnviandoPdf(true);
    try {
      const base = emptyFormFromTemplate(fichaPadrao, destino);
      base.nome = criandoPessoal
        ? isAso
          ? "Meu modelo ASO — PDF"
          : "Minha ficha — PDF"
        : isAso
          ? "Novo modelo ASO — PDF"
          : "Nova ficha — PDF";
      base.ehClinica = podeConfig && !criandoPessoal;
      base.ativo = false;
      const uploaded = await api.fichasTemplateCreateFromPdf(
        {
          nome: base.nome,
          titulo_documento: base.titulo_documento,
          campos: reordenarCampos(camposParaApi(camposEmOrdem(base.campos))),
          medico_id: base.ehClinica && podeConfig ? null : me?.id ?? null,
          modo: "secoes",
          destino,
        },
        pdfOrigemFile,
      );
      const f = fichaToForm(uploaded, undefined, destino);
      f.pdf_revisado = false;
      setForm(f);
      setBaseline(snapshotFichaForm(f));
      setEditId(uploaded.id);
      setPdfOrigemFile(null);
      setMode("edit");
      void msg.success("PDF enviado — revise os campos e confirme antes de ativar");
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro ao enviar PDF");
    } finally {
      setEnviandoPdf(false);
    }
  }

  async function enviarPdfEdicao(file: File) {
    if (editId == null) return;
    setEnviandoPdf(true);
    try {
      const uploaded = await api.fichasTemplateUploadPdf(editId, file);
      const f = fichaToForm(uploaded, undefined, destino);
      f.pdf_revisado = false;
      setForm((prev) => ({
        ...f,
        nome: prev.nome || f.nome,
        titulo_documento: prev.titulo_documento || f.titulo_documento,
        campos: prev.campos.length ? prev.campos : f.campos,
        campos_posicao: prev.campos_posicao.length
          ? prev.campos_posicao
          : f.campos_posicao,
      }));
      void msg.success("PDF atualizado — revise antes de ativar");
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro ao enviar PDF");
    } finally {
      setEnviandoPdf(false);
    }
  }

  function abrirEditar(f: FichaTemplate) {
    const data = fichaToForm(f, undefined, destino);
    setForm(data);
    setBaseline(snapshotFichaForm(data));
    setEditId(f.id);
    setMode("edit");
  }

  function abrirPreview(f: FichaTemplate | FichaForm, fromEdit = false) {
    const data =
      "campos" in f && !("eh_default" in f)
        ? f
        : fichaToForm(f as FichaTemplate, undefined, destino);
    setPreviewFicha(data);
    setPreviewFromEdit(fromEdit);
    setMode("preview");
  }

  async function salvar() {
    const camposSalvar = isAso
      ? normalizarCamposEditor(garantirCamposTravadosAso(form.campos))
      : form.campos;
    const errLocal = validarCamposLocal(camposSalvar);
    if (errLocal) {
      void msg.warning(errLocal);
      return;
    }
    if (isAso) {
      const errAso = validarCamposAsoLocal(camposSalvar);
      if (errAso) {
        void msg.warning(errAso);
        return;
      }
    }
    if (!form.nome.trim()) {
      void msg.warning("Informe o nome da ficha");
      return;
    }
    if (!form.titulo_documento.trim()) {
      void msg.warning("Informe o título do documento");
      return;
    }
    if (form.temPdf && form.ativo && !form.pdf_revisado) {
      void msg.warning('Marque "Revisado e confirmo" antes de ativar a ficha com PDF');
      return;
    }

    const ativoFinal =
      form.temPdf && form.pdf_revisado ? true : form.ativo;

    setSaving(true);
    try {
      const body = {
        nome: form.nome.trim(),
        titulo_documento: form.titulo_documento.trim(),
        campos: reordenarCampos(camposParaApi(camposEmOrdem(camposSalvar))),
        ativo: ativoFinal,
        medico_id: form.ehClinica && podeConfig ? null : me?.id ?? null,
        modo: form.modo,
        campos_posicao:
          form.modo === "pdf_fundo" ? form.campos_posicao : undefined,
        pdf_revisado: form.temPdf ? form.pdf_revisado || ativoFinal : undefined,
        destino,
      };

      let saved: FichaTemplate;
      if (editId == null) {
        saved = await api.fichasTemplateCreate(body);
        setEditId(saved.id);
      } else {
        saved = await api.fichasTemplateUpdate(editId, body);
      }

      const next = fichaToForm(saved, undefined, destino);
      setForm(next);
      setBaseline(snapshotFichaForm(next));
      setEditId(saved.id);
      void msg.success(`Ficha "${saved.nome}" salva`);
      try {
        await carregar();
      } catch {
        /* lista atualiza ao voltar */
      }
      setMode("list");
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function alternarAtivo(f: FichaTemplate) {
    const acao = f.ativo ? "inativar" : "ativar";
    const ok = await msg.confirm({ message: `Confirma ${acao} "${f.nome}"?` });
    if (!ok) return;
    try {
      await api.fichasTemplatePatch(f.id, { ativo: !f.ativo });
      void msg.success(
        f.ativo
          ? "Ficha inativada"
          : f.pdf_referencia_path
            ? "Ficha ativada — já pode ser escolhida na agenda"
            : "Ficha ativada",
      );
      await carregar();
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : `Erro ao ${acao}`);
    }
  }

  async function marcarDefault(f: FichaTemplate) {
    const ok = await msg.confirm({
      message: `Marcar "${f.nome}" como ficha padrão da clínica?`,
    });
    if (!ok) return;
    try {
      await api.fichasTemplateDefault(f.id);
      void msg.success("Ficha padrão atualizada");
      await carregar();
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro ao definir padrão");
    }
  }

  async function apagarFicha(f: FichaTemplate) {
    if (!f.pode_apagar) return;
    const ok = await msg.confirm({
      title: "Apagar ficha?",
      message: `Remover "${f.nome}" permanentemente? Só é possível se nunca foi usada em consulta ou agenda.`,
      confirmLabel: "Apagar",
      cancelLabel: "Cancelar",
    });
    if (!ok) return;
    try {
      await api.fichasTemplateDelete(f.id);
      void msg.success("Ficha apagada");
      if (editId === f.id) void voltarLista(true);
      await carregar();
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro ao apagar");
    }
  }

  function atualizarCampo(index: number, patch: Partial<FichaCampoDef>) {
    setForm((prev) => {
      const sorted = camposEmOrdem(prev.campos);
      const campos = [...sorted];
      campos[index] = normalizarCampoEditor({ ...campos[index], ...patch });
      return { ...prev, campos: camposEmOrdem(campos) };
    });
  }

  function atualizarPosicao(campoId: string, patch: Partial<FichaCampoPosicao>) {
    setForm((prev) => {
      const pos = [...prev.campos_posicao];
      const idx = pos.findIndex((p) => p.campo_id === campoId);
      if (idx >= 0) {
        pos[idx] = { ...pos[idx], ...patch };
      } else {
        pos.push({
          campo_id: campoId,
          x_pct: 5,
          y_pct: 8,
          largura_pct: 90,
          altura_pct: 10,
          ...patch,
        });
      }
      return { ...prev, campos_posicao: pos };
    });
  }

  function removerCampo(index: number) {
    setForm((prev) => {
      const sorted = camposEmOrdem(prev.campos);
      const removido = sorted[index];
      if (isAso && removido && isCampoTravadoAso(removido.id)) return prev;
      const campos = reordenarCampos(sorted.filter((_, i) => i !== index));
      return {
        ...prev,
        campos,
        campos_posicao: prev.campos_posicao.filter(
          (p) => p.campo_id !== removido?.id,
        ),
      };
    });
  }

  function adicionarCampo(tipo: FichaCampoTipo) {
    setForm((prev) => {
      const base = camposEmOrdem(prev.campos);
      const novo = normalizarCampoEditor(novoCampo(tipo, base.length + 1, base));
      const campos = reordenarCampos([...base, novo]);
      const posicoes = [...prev.campos_posicao];
      const [padrao] = defaultPosicoes([novo]);
      if (padrao) posicoes.push(padrao);
      return { ...prev, campos, campos_posicao: posicoes };
    });
  }

  const camposEditor = useMemo(
    () => camposEmOrdem(form.campos),
    [form.campos],
  );

  const previewCamposKey = camposEditor
    .map((c) =>
      c.tipo === "marcadores" || c.tipo === "escolha"
        ? `${c.id}:${c.ordem}:${c.opcoes?.join("|") ?? ""}`
        : `${c.id}:${c.ordem}`,
    )
    .join(";");

  if (mode === "preview" && previewFicha) {
    if (
      previewFromEdit &&
      editId != null &&
      previewFicha.modo === "pdf_fundo" &&
      previewFicha.temPdf
    ) {
      return (
        <FichaFolhaPage
          title="Pré-visualização"
          subtitle={previewFicha.nome || "Nova ficha"}
          toolbar={
            <FichaFolhaToolbar>
              <VoltarButton
                className="btn btn-primary btn-sm"
                onClick={() => {
                  setPreviewFicha(null);
                  setMode("edit");
                }}
              >
                Voltar
              </VoltarButton>
            </FichaFolhaToolbar>
          }
        >
          <FichaFolhaViewport>
            <FichaPdfFundoCorpo
              fichaId={editId}
              campos={camposEmOrdem(previewFicha.campos)}
              posicoes={previewFicha.campos_posicao}
              dados={{}}
              readOnly={false}
            />
          </FichaFolhaViewport>
        </FichaFolhaPage>
      );
    }
    return (
      <FichaPreview
        titulo={previewFicha.titulo_documento}
        nomeFicha={previewFicha.nome}
        campos={previewFicha.campos}
        readOnly={false}
        pageTitle="Pré-visualização"
        pageSubtitle={previewFicha.nome || "Nova ficha"}
        onVoltar={() => {
          setPreviewFicha(null);
          setMode(previewFromEdit ? "edit" : "list");
        }}
      />
    );
  }

  if (mode === "origem") {
    return (
      <FichaFolhaPage
        title={ui.novaTitle}
        subtitle={ui.origemSub}
        toolbar={
          <FichaFolhaToolbar>
            <VoltarButton className="btn btn-primary btn-sm" onClick={() => setMode("list")}>
              Voltar
            </VoltarButton>
          </FichaFolhaToolbar>
        }
      >
        <FichaFolhaViewport>
          <FichaFolhaLayout
            tituloDocumento={ui.origemTitulo}
            caixaRotulo="Autoria"
            caixaValor="—"
            aviso={
              criandoPessoal
                ? ui.origemAvisoPessoal
                : ui.origemAvisoClinica
            }
          >
            <div className="ficha-folha__origem">
              <div className="ficha-folha__origem-bloco">
                <h3>{ui.padraoH3}</h3>
                <p>
                  Copia os campos de{" "}
                  <strong>{fichaPadrao?.nome ?? ui.padraoNome}</strong>.
                </p>
                <button
                  type="button"
                  className="ficha-folha__origem-acao"
                  onClick={() => void iniciarDoPadrao()}
                >
                  Usar template padrão
                </button>
              </div>
              <div className="ficha-folha__origem-bloco">
                <h3>{ui.duplicarH3}</h3>
                <div className="ficha-folha__origem-linha">
                  <label>
                    <span className="aso-form__rotulo">{ui.duplicarRotulo}</span>
                    <select
                      className="prontuario-admissional-input"
                      value={dupOrigemId}
                      onChange={(e) =>
                        setDupOrigemId(e.target.value === "" ? "" : Number(e.target.value))
                      }
                    >
                      <option value="">Selecione…</option>
                      {fichasOrigem.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.nome}
                          {f.medico_nome ? ` (${f.medico_nome})` : " (Clínica)"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="ficha-folha__origem-acao"
                    onClick={() => void iniciarDuplicar()}
                  >
                    <Copy size={16} aria-hidden />
                    Duplicar
                  </button>
                </div>
              </div>
              <div className="ficha-folha__origem-bloco">
                <h3>A partir de PDF do consultório</h3>
                <p>
                  Envie o formulário em PDF. Você revisará os campos ao lado do
                  documento antes de ativar.
                </p>
                <div className="ficha-folha__origem-linha">
                  <label>
                    <span className="aso-form__rotulo">Arquivo PDF</span>
                    <input
                      type="file"
                      accept="application/pdf,.pdf"
                      className="prontuario-admissional-input"
                      onChange={(e) =>
                        setPdfOrigemFile(e.target.files?.[0] ?? null)
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="ficha-folha__origem-acao"
                    disabled={!pdfOrigemFile || enviandoPdf}
                    onClick={() => void iniciarDoPdf()}
                  >
                    {enviandoPdf ? "Enviando…" : "Continuar com PDF"}
                  </button>
                </div>
              </div>
            </div>
          </FichaFolhaLayout>
        </FichaFolhaViewport>
      </FichaFolhaPage>
    );
  }

  if (mode === "edit") {
    return (
      <FichaFolhaPage
        title={
          editId == null
            ? isAso
              ? "Novo modelo"
              : "Nova ficha"
            : isAso
              ? "Editar modelo"
              : "Editar ficha"
        }
        subtitle={form.nome || "Monte o formulário na folha"}
        toolbar={
          <FichaFolhaToolbar>
            <VoltarButton className="btn btn-primary btn-sm" onClick={() => void voltarLista()}>
              Voltar
            </VoltarButton>
            <div className="form-actions__direita">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => abrirPreview(form, true)}
            >
              <Eye size={16} aria-hidden />
              Pré-visualizar
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={saving}
              onClick={() => void salvar()}
            >
              {saving ? "Salvando…" : "Salvar"}
            </button>
            </div>
          </FichaFolhaToolbar>
        }
      >
        <FichaFolhaViewport>
          <div className="ficha-editor-split">
            <aside className="ficha-editor-split__config" aria-label="Montar campos">
              <h3 className="ficha-editor-split__titulo">Montar formulário</h3>

              <div className="ficha-folha__meta ficha-folha__meta--painel">
                <label className="ficha-editor-campo">
                  <span className="aso-form__rotulo">Nome da ficha (biblioteca)</span>
                  <input
                    type="text"
                    className="prontuario-admissional-input"
                    value={form.nome}
                    onChange={(e) => setForm((p) => ({ ...p, nome: e.target.value }))}
                    placeholder="Ex.: Gastro — consulta"
                  />
                </label>
                <label className="ficha-editor-campo">
                  <span className="aso-form__rotulo">Título impresso na folha</span>
                  <input
                    type="text"
                    className="prontuario-admissional-input"
                    value={form.titulo_documento}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, titulo_documento: e.target.value }))
                    }
                  />
                </label>
                <div className="ficha-folha__meta-opcoes">
                  {podeConfig ? (
                    <label>
                      <input
                        type="checkbox"
                        checked={form.ehClinica}
                        onChange={(e) =>
                          setForm((p) => ({ ...p, ehClinica: e.target.checked }))
                        }
                      />
                      Ficha da clínica
                    </label>
                  ) : null}
                  <label>
                    <input
                      type="checkbox"
                      checked={form.ativo}
                      onChange={(e) => setForm((p) => ({ ...p, ativo: e.target.checked }))}
                    />
                    Ativa
                  </label>
                </div>
                {form.temPdf ? (
                  <>
                    <label className="ficha-editor-campo">
                      <span className="aso-form__rotulo">Modo de exibição</span>
                      <select
                        className="prontuario-admissional-input w-full"
                        value={form.modo}
                        onChange={(e) => {
                          const modo = e.target.value as FichaModo;
                          setForm((p) => ({
                            ...p,
                            modo,
                            campos_posicao:
                              modo === "pdf_fundo" && !p.campos_posicao.length
                                ? defaultPosicoes(camposEmOrdem(p.campos))
                                : p.campos_posicao,
                          }));
                        }}
                      >
                        <option value="secoes">Seções (PDF ao lado na edição)</option>
                        <option value="pdf_fundo">PDF de fundo com campos posicionados</option>
                      </select>
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={form.pdf_revisado}
                        onChange={(e) => {
                          const revisado = e.target.checked;
                          setForm((p) => ({
                            ...p,
                            pdf_revisado: revisado,
                            ativo: revisado ? true : p.ativo,
                          }));
                        }}
                      />
                      Revisado e confirmo
                    </label>
                    <p className="text-sm text-[var(--muted)]">
                      Ao confirmar a revisão, a ficha é ativada e passa a aparecer na
                      agenda e no atendimento.
                    </p>
                    {!form.ativo ? (
                      <p className="ficha-folha__aviso text-sm">
                        Ficha inativa — não aparece na marcação de consulta.
                      </p>
                    ) : null}
                  </>
                ) : editId != null ? (
                  <label className="ficha-editor-campo">
                    <span className="aso-form__rotulo">PDF de referência (opcional)</span>
                    <input
                      type="file"
                      accept="application/pdf,.pdf"
                      className="prontuario-admissional-input"
                      disabled={enviandoPdf}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void enviarPdfEdicao(file);
                        e.target.value = "";
                      }}
                    />
                  </label>
                ) : null}
              </div>

              <div className="ficha-folha__editor-secao ficha-folha__editor-secao--painel">
                <h4 className="ficha-folha__editor-secao-titulo">Campos</h4>
                {camposEditor.length === 0 ? (
                  <p className="ficha-folha__aviso">Adicione campos abaixo.</p>
                ) : (
                  camposEditor.map((c, i) => (
                    <div key={c.id} className="ficha-folha__campo-editor">
                      <div className="ficha-folha__campo-editor-toolbar">
                        <span className="ficha-folha__campo-num">#{i + 1}</span>
                        <input
                          type="text"
                          value={c.label}
                          aria-label="Rótulo"
                          disabled={isAso && isCampoTravadoAso(c.id)}
                          onChange={(e) => atualizarCampo(i, { label: e.target.value })}
                        />
                        <select
                          value={c.tipo}
                          aria-label="Tipo"
                          disabled={isAso && isCampoTravadoAso(c.id)}
                        onChange={(e) =>
                          atualizarCampo(i, aplicarTipoCampo(c, e.target.value as FichaCampoTipo))
                        }
                        >
                          {tiposEditor.map((t) => (
                            <option key={t} value={t}>
                              {FICHA_TIPO_LABELS[t]}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="ficha-folha__campo-editor-btn"
                          title="Subir"
                          disabled={i === 0}
                          onClick={() =>
                            setForm((p) => ({ ...p, campos: moverCampo(p.campos, i, -1) }))
                          }
                        >
                          <ArrowUp size={14} />
                        </button>
                        <button
                          type="button"
                          className="ficha-folha__campo-editor-btn"
                          title="Descer"
                          disabled={i === camposEditor.length - 1}
                          onClick={() =>
                            setForm((p) => ({ ...p, campos: moverCampo(p.campos, i, 1) }))
                          }
                        >
                          <ArrowDown size={14} />
                        </button>
                        <button
                          type="button"
                          className="ficha-folha__campo-editor-btn"
                          title="Remover"
                          disabled={isAso && isCampoTravadoAso(c.id)}
                          onClick={() => removerCampo(i)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      {form.modo === "pdf_fundo" && form.temPdf ? (
                        <div className="ficha-folha__posicao-grid mt-2">
                          {(["x_pct", "y_pct", "largura_pct", "altura_pct"] as const).map(
                            (chave) => {
                              const pos = form.campos_posicao.find(
                                (p) => p.campo_id === c.id,
                              );
                              const labels: Record<typeof chave, string> = {
                                x_pct: "X %",
                                y_pct: "Y %",
                                largura_pct: "Larg. %",
                                altura_pct: "Alt. %",
                              };
                              return (
                                <label key={chave} className="ficha-editor-campo">
                                  <span className="aso-form__rotulo">{labels[chave]}</span>
                                  <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    step={0.5}
                                    className="prontuario-admissional-input"
                                    value={pos?.[chave] ?? 0}
                                    onChange={(e) =>
                                      atualizarPosicao(c.id, {
                                        [chave]: Number(e.target.value),
                                      })
                                    }
                                  />
                                </label>
                              );
                            },
                          )}
                        </div>
                      ) : null}
                      {c.tipo === "marcadores" || c.tipo === "escolha" ? (
                        <label className="ficha-editor-campo mt-2">
                          <span className="aso-form__rotulo">
                            {c.tipo === "escolha"
                              ? "Opções (Enter = nova linha). Nos campos travados, use os ids fixos."
                              : "Opções (Enter = nova linha / novo marcador)"}
                          </span>
                          <textarea
                            className="prontuario-admissional-input w-full min-h-[5rem]"
                            value={c.opcoesTexto ?? ""}
                            disabled={isAso && isCampoTravadoAso(c.id)}
                            placeholder={"DM\nHAS\nDLP\nTabagismo"}
                            onChange={(e) => {
                              const raw = e.target.value;
                              const parsed = opcoesFromTexto(raw);
                              atualizarCampo(i, {
                                opcoesTexto: raw,
                                opcoes:
                                  parsed.length > 0
                                    ? parsed
                                    : [...OPCOES_MARCADORES_PADRAO],
                              });
                            }}
                          />
                        </label>
                      ) : null}
                      {c.tipo === "busca" ? (
                        <label className="ficha-editor-campo mt-2">
                          <span className="aso-form__rotulo">Placeholder da busca</span>
                          <input
                            type="text"
                            className="prontuario-admissional-input w-full"
                            value={c.placeholder ?? ""}
                            onChange={(e) =>
                              atualizarCampo(i, { placeholder: e.target.value || undefined })
                            }
                          />
                        </label>
                      ) : null}
                    </div>
                  ))
                )}
                <p className="ficha-editor-add-label">Incluir campo:</p>
                <div className="ficha-folha__add-campos">
                  {tiposEditor.map((t) => (
                    <button key={t} type="button" onClick={() => adicionarCampo(t)}>
                      + {FICHA_TIPO_LABELS[t]}
                    </button>
                  ))}
                </div>
              </div>
            </aside>

            <div className="ficha-editor-split__preview" aria-label="Prévia do layout">
              <p className="ficha-editor-split__preview-legenda">
                {form.temPdf && editId != null
                  ? "Prévia ao vivo — PDF de referência"
                    : ui.previa}
              </p>
              {form.temPdf && editId != null ? (
                <div className="ficha-folha__pdf-editor">
                  <FichaPdfReferenciaPanel fichaId={editId} />
                  {form.modo === "pdf_fundo" ? (
                    <FichaPdfFundoCorpo
                      key={previewCamposKey}
                      fichaId={editId}
                      campos={camposEditor}
                      posicoes={form.campos_posicao}
                      dados={{}}
                      readOnly={false}
                    />
                  ) : (
                    <FichaFolhaLayout
                      tituloDocumento={form.titulo_documento}
                      subtituloFicha={form.nome || "Sem nome"}
                      caixaRotulo="Ficha"
                      caixaValor={String(editId)}
                      identificacaoExemplo
                    >
                      <FichaCamposCorpo
                        key={previewCamposKey}
                        campos={camposEditor}
                        readOnly={false}
                      />
                    </FichaFolhaLayout>
                  )}
                </div>
              ) : (
                <FichaFolhaLayout
                  tituloDocumento={form.titulo_documento}
                  subtituloFicha={form.nome || "Sem nome"}
                  caixaRotulo="Ficha"
                  caixaValor={editId != null ? String(editId) : "nova"}
                  identificacaoExemplo
                >
                  <FichaCamposCorpo
                    key={previewCamposKey}
                    campos={camposEditor}
                    readOnly={false}
                  />
                </FichaFolhaLayout>
              )}
            </div>
          </div>
        </FichaFolhaViewport>
      </FichaFolhaPage>
    );
  }

  return (
    <div className="page-stack flex-1 min-h-0 overflow-hidden">
      <PageHeader
        title={ui.title}
        subtitle={ui.subtitle}
        actions={
          <button type="button" className="btn btn-primary" onClick={abrirOrigem}>
            <Plus size={18} aria-hidden />
            {ui.nova}
          </button>
        }
      />

      <div className="ficha-folha-lista-wrap scroll-interno">
        {podeConfig ? (
          <div className="ficha-folha-lista-filtros">
            {(
              [
                ["todas", "Todas"],
                ["clinica", "Clínica"],
                ["minhas", "Minhas"],
              ] as const
            ).map(([val, lbl]) => (
              <button
                key={val}
                type="button"
                className={escopo === val ? "ficha-folha-lista-filtros--ativo" : ""}
                onClick={() => setEscopo(val)}
              >
                {lbl}
              </button>
            ))}
          </div>
        ) : null}

        {loading ? (
          <p className="text-center text-muted">Carregando…</p>
        ) : fichas.length === 0 ? (
          <p className="text-center text-muted">{ui.vazio}</p>
        ) : (
          <ul className="ficha-folha-lista-grid">
            {fichas.map((f) => (
              <li key={f.id} className="ficha-folha-lista-item flex flex-wrap gap-3 justify-between">
                <div className="min-w-[200px] flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong>{f.nome}</strong>
                    {f.eh_default ? (
                      <span className="badge inline-flex items-center gap-1">
                        <Star size={14} />
                        Padrão
                      </span>
                    ) : null}
                    {!f.ativo ? (
                      <span className="badge opacity-70">Inativa — não aparece na agenda</span>
                    ) : null}
                    {f.pdf_referencia_path ? (
                      <span className="badge opacity-70">PDF</span>
                    ) : null}
                  </div>
                  <div className="text-muted text-sm mt-1">
                    {f.titulo_documento}
                    {f.medico_nome ? ` · ${f.medico_nome}` : " · Clínica"}
                    {" · "}
                    {f.campos.length} campo(s)
                  </div>
                  <ul className="text-muted text-xs mt-2 pl-4 mb-0">
                    {f.campos.slice(0, 6).map((c) => (
                      <li key={c.id}>
                        {c.label.replace(/:$/, "")} ({rotuloCampo(c.tipo)})
                      </li>
                    ))}
                    {f.campos.length > 6 ? <li>…</li> : null}
                  </ul>
                </div>
                <div className="flex flex-wrap gap-2 items-start">
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => abrirPreview(f)}>
                    <Eye size={16} aria-hidden />
                    Ver
                  </button>
                  {podeEditar(f) ? (
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => abrirEditar(f)}>
                      <Pencil size={16} aria-hidden />
                      Editar
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={async () => {
                      try {
                        const copia = await api.fichasTemplateDuplicar(f.id, {
                          pessoal: !podeConfig || f.medico_id != null,
                        });
                        abrirEditar(copia);
                      } catch (e) {
                        void msg.error(
                          e instanceof ApiError ? e.message : "Erro ao duplicar",
                        );
                      }
                    }}
                  >
                    <Copy size={16} aria-hidden />
                    Duplicar
                  </button>
                  {podeConfig && f.medico_id == null && f.ativo && !f.eh_default ? (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => void marcarDefault(f)}
                    >
                      <Star size={16} aria-hidden />
                      Padrão
                    </button>
                  ) : null}
                  {podeEditar(f) && f.pode_apagar ? (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => void apagarFicha(f)}
                    >
                      <Trash2 size={16} aria-hidden />
                      Apagar
                    </button>
                  ) : null}
                  {podeEditar(f) ? (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => void alternarAtivo(f)}
                    >
                      {f.ativo ? "Inativar" : "Ativar"}
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
