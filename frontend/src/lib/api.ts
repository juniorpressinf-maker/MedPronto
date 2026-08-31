import { saveBlobAs } from "./saveFile";

const API_BASE = import.meta.env.VITE_API_URL ?? "/api";

export class ApiError extends Error {
  status: number;
  data?: unknown;

  constructor(message: string, status = 500, data?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      credentials: "include",
      headers: { "Content-Type": "application/json", ...options?.headers },
      ...options,
    });
  } catch {
    throw new ApiError(
      "A API ainda não respondeu. Aguarde o reinício terminar ou abra o atalho do MedPronto de novo.",
      0,
    );
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const body = data as {
      error?: string;
      licenca?: unknown;
      enforced?: boolean;
    };
    if (
      res.status === 403 &&
      body.enforced === true &&
      body.licenca &&
      typeof window !== "undefined" &&
      !window.location.pathname.startsWith("/licenca")
    ) {
      window.location.href = "/licenca";
      throw new ApiError("Licença inválida ou ausente", 403);
    }
    if (
      res.status === 401 &&
      typeof window !== "undefined" &&
      !window.location.pathname.startsWith("/login")
    ) {
      window.location.href = "/login?expirado=1";
      throw new ApiError("Sessão expirada — faça login novamente", 401);
    }
    const fallback =
      res.status === 404
        ? "Recurso não encontrado. Reinicie o MedPronto e tente de novo."
        : res.status === 500
          ? "Erro interno do servidor. Feche e abra o MedPronto de novo."
          : res.statusText;
    throw new ApiError(mensagemErroApi(data, body.error ?? fallback), res.status, data);
  }
  return data as T;
}

function mensagemErroApi(data: unknown, fallback: string): string {
  const body = data as { error?: string; erro?: string; mensagem?: string };
  if (body.mensagem?.trim()) return body.mensagem.trim();
  if (body.erro?.trim()) return body.erro.trim();
  if (body.error?.trim() && body.error !== "retorno_vigente") {
    return body.error.trim();
  }
  return fallback;
}

async function openPdf(path: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { credentials: "include" });
  } catch {
    throw new ApiError(
      "A API ainda não respondeu. Aguarde o reinício terminar ou abra o atalho do MedPronto de novo.",
      0,
    );
  }
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(data.error ?? res.statusText, res.status);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
}

export type ClinicaBranding = {
  nome: string;
  cnpj_cpf: string;
  logo: string | null;
  configured: boolean;
};

export type ClinicaRow = {
  nome: string;
  cnpj_cpf: string | null;
  telefone: string | null;
  endereco: string | null;
  email: string | null;
  logo: string | null;
};

export type HealthResponse = {
  ok: boolean;
  database: string;
  nome: string;
  versao: string;
  fase: string;
  ts: string;
  db: string;
  dbPath: string;
  port: number;
  lan_ips?: string[];
  restauracao_em?: string | null;
  inicio_servidor?: string | null;
};

export type Cid10Item = { codigo: string; descricao: string };

export type Cid10Response = {
  q: string;
  total: number;
  itens: Cid10Item[];
  fonte: string;
};

export type BackupArquivo = {
  nome: string;
  tamanho: number;
  criado_em: string;
};

export type RemotoTunnelStatus = {
  ok?: boolean;
  status: string;
  publicUrl: string | null;
  lastError: string | null;
  binaryFound: boolean;
  running: boolean;
  erro?: string;
};

export type FichaCampo = {
  id: string;
  label: string;
  tipo: string;
  ordem: number;
  obrigatorio?: boolean;
  opcoes?: string[];
  placeholder?: string;
};

export type FichaTemplate = {
  id: number;
  nome: string;
  titulo_documento: string;
  modo: string;
  campos: FichaCampo[];
  campos_posicao?: FichaCampoPosicao[];
  pdf_referencia_path: string | null;
  medico_id: number | null;
  medico_nome: string | null;
  eh_default: boolean;
  ativo: boolean;
  destino?: "prontuario" | "aso";
  em_uso?: boolean;
  pode_apagar?: boolean;
  created_at: string;
  updated_at: string;
};

export type FichaCampoPosicao = {
  campo_id: string;
  x_pct: number;
  y_pct: number;
  largura_pct: number;
  altura_pct: number;
};

export function destinoFicha(
  f: Pick<FichaTemplate, "destino" | "nome" | "titulo_documento">,
): "prontuario" | "aso" {
  if (f.destino === "aso" || f.destino === "prontuario") return f.destino;
  const texto = `${f.nome ?? ""} ${f.titulo_documento ?? ""}`;
  if (/\bASO\b/i.test(texto) || /ocupacional/i.test(texto)) return "aso";
  return "prontuario";
}

export function fichasDoDestino(
  fichas: FichaTemplate[],
  destino: "prontuario" | "aso",
): FichaTemplate[] {
  return fichas.filter((f) => destinoFicha(f) === destino);
}

export type AuditoriaItem = {
  id: number;
  usuario_id: number | null;
  usuario_nome: string | null;
  usuario_login: string | null;
  paciente_id: number | null;
  paciente_nome: string | null;
  acao: string;
  detalhe: string | null;
  created_at: string;
};

export type DashboardMedicoRow = {
  medico_id: number;
  medico_nome: string;
  total: number;
  finalizados: number;
};

export type DashboardTipoRow = {
  tipo: string;
  label: string;
  total: number;
};

export type DashboardConvenioRow = {
  convenio_id: number | null;
  convenio_nome: string;
  atendimentos: number;
  arrecadado_centavos: number;
  a_faturar_centavos: number;
};

export type DashboardProcedimentoRow = {
  procedimento_id: number;
  procedimento_nome: string;
  quantidade: number;
  faturado_centavos: number;
};

export type DashboardResponse = {
  periodo: { de: string; ate: string };
  cobranca_disponivel: boolean;
  clinico: {
    totais: {
      agendamentos: number;
      finalizados: number;
      presentes: number;
      em_atendimento: number;
      agendados: number;
      nao_compareceu: number;
      cancelados: number;
      pacientes_novos: number;
      admissionais: number;
      prontuarios: number;
      taxa_comparecimento: number | null;
    };
    hoje: {
      agendamentos: number;
      finalizados: number;
      na_fila: number;
    };
    por_medico: DashboardMedicoRow[];
    por_tipo: DashboardTipoRow[];
    whatsapp: { enviados: number; erros: number } | null;
  };
  financeiro: {
    arrecadado_centavos: number;
    contas_fechadas: number;
    contas_abertas: number;
    a_faturar_centavos: number;
    por_convenio: DashboardConvenioRow[];
    por_forma: { forma: string; valor_centavos: number }[];
    top_procedimentos: DashboardProcedimentoRow[];
  } | null;
};

export const api = {
  health: () => request<HealthResponse>("/health"),

  dashboard: (de: string, ate: string) =>
    request<DashboardResponse>(
      `/dashboard?de=${encodeURIComponent(de)}&ate=${encodeURIComponent(ate)}`,
    ),

  cobrancaConveniosList: (inativos = true) =>
    request<CobrancaConvenio[]>(
      `/cobranca/convenios${inativos ? "" : "?inativos=0"}`,
    ),

  cobrancaConvenioCreate: (body: {
    nome: string;
    tipo: "particular" | "operadora";
    exige_guia?: boolean;
  }) =>
    request<CobrancaConvenio>("/cobranca/convenios", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  cobrancaConvenioUpdate: (
    id: number,
    body: {
      nome?: string;
      tipo?: "particular" | "operadora";
      ativo?: 0 | 1;
      exige_guia?: boolean;
    },
  ) =>
    request<CobrancaConvenio>(`/cobranca/convenios/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  cobrancaProcedimentosList: (q?: string, inativos = true) => {
    const params = new URLSearchParams();
    if (q?.trim()) params.set("q", q.trim());
    if (!inativos) params.set("inativos", "0");
    const qs = params.toString();
    return request<CobrancaProcedimento[]>(
      `/cobranca/procedimentos${qs ? `?${qs}` : ""}`,
    );
  },

  cobrancaProcedimentoCreate: (body: {
    codigo?: string;
    nome: string;
    orientacoes_paciente?: string;
    modo_clinico: "prontuario" | "aso" | "nenhum";
  }) =>
    request<CobrancaProcedimento>("/cobranca/procedimentos", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  cobrancaProcedimentoUpdate: (
    id: number,
    body: {
      codigo?: string | null;
      nome?: string;
      ativo?: 0 | 1;
      orientacoes_paciente?: string | null;
      modo_clinico?: "prontuario" | "aso" | "nenhum";
    },
  ) =>
    request<CobrancaProcedimento>(`/cobranca/procedimentos/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  cobrancaProcedimentoDelete: (id: number) =>
    request<CobrancaProcedimento>(`/cobranca/procedimentos/${id}`, {
      method: "DELETE",
    }),

  cobrancaPrecosGet: () => request<CobrancaMatrizPrecos>("/cobranca/precos"),

  cobrancaPrecosSave: (
    precos: {
      procedimento_id: number;
      convenio_id: number;
      valor_centavos: number;
    }[],
  ) =>
    request<CobrancaMatrizPrecos>("/cobranca/precos", {
      method: "PUT",
      body: JSON.stringify({ precos }),
    }),

  cobrancaContasList: (data: string, pacienteId?: number) => {
    const params = new URLSearchParams({ data });
    if (pacienteId) params.set("paciente_id", String(pacienteId));
    return request<CobrancaContaResumo[]>(`/cobranca/contas?${params}`);
  },

  cobrancaCaixaGet: (data: string) =>
    request<CobrancaCaixaDoDia>(`/cobranca/caixa?data=${encodeURIComponent(data)}`),

  cobrancaRelatorioGet: (de: string, ate: string) => {
    const params = new URLSearchParams({ de, ate });
    return request<CobrancaRelatorio>(`/cobranca/relatorios?${params}`);
  },

  cobrancaRelatorioPdf: (de: string, ate: string) =>
    openPdf(`/cobranca/relatorios/pdf?${new URLSearchParams({ de, ate })}`),

  cobrancaFaturamentoConvenioGet: (de: string, ate: string, convenioId?: number) => {
    const params = new URLSearchParams({ de, ate });
    if (convenioId) params.set("convenio_id", String(convenioId));
    return request<RelatorioFaturamentoConvenio>(
      `/cobranca/relatorios/faturamento-convenio?${params}`,
    );
  },

  cobrancaFaturamentoConvenioPdf: (de: string, ate: string, convenioId?: number) => {
    const params = new URLSearchParams({ de, ate });
    if (convenioId) params.set("convenio_id", String(convenioId));
    return openPdf(`/cobranca/relatorios/faturamento-convenio/pdf?${params}`);
  },
  cobrancaPendentesRepasseGet: (de: string, ate: string, convenioId?: number) => {
    const params = new URLSearchParams({ de, ate });
    if (convenioId) params.set("convenio_id", String(convenioId));
    return request<RelatorioFaturamentoConvenio>(
      `/cobranca/convenios/pendentes-repasse?${params}`,
    );
  },
  cobrancaReceberConvenioLote: (body: {
    conta_ids: number[];
    data_recebimento: string;
    observacao?: string;
  }) =>
    request<{ ok: number; erros: { conta_id: number; erro: string }[] }>(
      "/cobranca/convenios/receber-lote",
      { method: "POST", body: JSON.stringify(body) },
    ),
  cobrancaContaReceberConvenio: (
    contaId: number,
    body: { data_recebimento?: string; valor_centavos?: number; observacao?: string },
  ) =>
    request<CobrancaContaDetalhe>(`/cobranca/contas/${contaId}/receber-convenio`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  cobrancaContaGet: (id: number) =>
    request<CobrancaContaDetalhe>(`/cobranca/contas/${id}`),

  cobrancaContaPorProntuario: (prontuarioId: number) =>
    request<CobrancaContaDetalhe>(
      `/cobranca/contas/por-prontuario/${prontuarioId}`,
    ),

  cobrancaContaAbrir: (body: {
    paciente_id: number;
    data?: string;
    convenio_id?: number;
    agendamento_id?: number;
    observacao?: string;
  }) =>
    request<CobrancaContaDetalhe>("/cobranca/contas", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  cobrancaContaUpdate: (
    id: number,
    body: {
      convenio_id?: number;
      observacao?: string | null;
      valor_desconto_centavos?: number;
      motivo_desconto?: string | null;
    },
  ) =>
    request<CobrancaContaDetalhe>(`/cobranca/contas/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  cobrancaContaReceber: (
    contaId: number,
    body: {
      valor_desconto_centavos: number;
      motivo_desconto?: string | null;
      forma?: CobrancaFormaPagamento;
    },
  ) =>
    request<CobrancaContaDetalhe>(`/cobranca/contas/${contaId}/receber`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  cobrancaContaPagamento: (
    contaId: number,
    body: {
      forma: CobrancaFormaPagamento;
      valor_centavos: number;
      observacao?: string;
    },
  ) =>
    request<CobrancaContaDetalhe>(`/cobranca/contas/${contaId}/pagamentos`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  cobrancaContaFechar: (
    contaId: number,
    body?: {
      modo?: "normal" | "convenio" | "isento";
      motivo?: string;
      convenio_guia?: CobrancaConvenioGuiaInput;
    },
  ) =>
    request<CobrancaContaDetalhe>(`/cobranca/contas/${contaId}/fechar`, {
      method: "POST",
      body: JSON.stringify(body ?? {}),
    }),

  cobrancaContaReabrir: (contaId: number) =>
    request<CobrancaContaDetalhe>(`/cobranca/contas/${contaId}/reabrir`, {
      method: "POST",
    }),

  cobrancaContaItemAdd: (
    contaId: number,
    body: {
      procedimento_id: number;
      quantidade?: number;
      status?: CobrancaItemStatus;
      observacao?: string;
      confirmar_duplicata?: boolean;
    },
  ) =>
    request<CobrancaContaDetalhe>(`/cobranca/contas/${contaId}/itens`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  cobrancaContaItemPatch: (
    contaId: number,
    itemId: number,
    body: {
      status?: CobrancaItemStatus;
      observacao?: string | null;
      exame_anexo_id?: number | null;
      admissional_id?: number | null;
    },
  ) =>
    request<CobrancaContaDetalhe>(
      `/cobranca/contas/${contaId}/itens/${itemId}`,
      {
        method: "PATCH",
        body: JSON.stringify(body),
      },
    ),

  cobrancaContaItemCancelar: (contaId: number, itemId: number) =>
    request<CobrancaContaDetalhe>(
      `/cobranca/contas/${contaId}/itens/${itemId}`,
      { method: "DELETE" },
    ),

  cobrancaContaGuiaPatch: (contaId: number, body: CobrancaConvenioGuiaInput) =>
    request<CobrancaContaDetalhe>(`/cobranca/contas/${contaId}/convenio-guia`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  cobrancaAdmissionaisSugeridos: (contaId: number, itemId?: number) => {
    const q = itemId ? `?item_id=${itemId}` : "";
    return request<AdmissionalSugeridoConta[]>(
      `/cobranca/contas/${contaId}/admissionais-sugeridos${q}`,
    );
  },

  cid: (q: string) =>
    request<Cid10Response>(`/cid?q=${encodeURIComponent(q)}`),

  clinicaBranding: () => request<ClinicaBranding>("/clinica/branding"),

  clinicaGet: () => request<ClinicaRow | null>("/clinica"),

  clinicaCreate: (body: {
    nome: string;
    cnpj_cpf?: string;
    telefone?: string;
    endereco?: string;
    email: string;
    email_senha: string;
    logo?: string;
  }) =>
    request<ClinicaRow>("/clinica", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  clinicaUpdate: (body: {
    email?: string;
    email_senha?: string;
    logo?: string;
    telefone?: string;
    endereco?: string;
  }) =>
    request<ClinicaRow>("/clinica", {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  recuperarSenhaStatus: () =>
    request<{
      pode_recuperar: boolean;
      clinica_cadastrada: boolean;
      email_cadastrado: boolean;
      email_dica: string | null;
      senha_email_configurada: boolean;
      username: string | null;
      usernames: string[];
      nome: string | null;
      mensagem: string | null;
    }>("/auth/recuperar-senha/status"),

  recuperarSenhaSolicitar: (body: {
    email: string;
    username: string;
    email_senha: string;
  }) =>
    request<{
      ok: boolean;
      mensagem: string;
      codigo_desbloqueio: string;
      expira_minutos: number;
    }>("/auth/recuperar-senha/solicitar", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  recuperarSenhaConfirmar: (body: {
    email: string;
    username: string;
    codigo: string;
    senha: string;
  }) =>
    request<{ ok: boolean; mensagem: string }>(
      "/auth/recuperar-senha/confirmar",
      { method: "POST", body: JSON.stringify(body) },
    ),

  licencaGet: () =>
    request<{ status: string; enforced?: boolean; fingerprint?: string }>(
      "/licenca",
    ),

  licencaFingerprint: () =>
    request<{ fingerprint: string }>("/licenca/fingerprint"),

  licencaInstalar: (token: string) =>
    request("/licenca", { method: "POST", body: JSON.stringify({ token }) }),

  licencaContraSenha: (codigo: string) =>
    request<{ ok: boolean; message: string; estado: unknown }>(
      "/licenca/contra-senha",
      { method: "POST", body: JSON.stringify({ codigo }) },
    ),

  auditoriaList: (params?: {
    q?: string;
    acao?: string;
    de?: string;
    ate?: string;
    limit?: number;
    offset?: number;
  }) => {
    const qs = new URLSearchParams();
    if (params?.q) qs.set("q", params.q);
    if (params?.acao) qs.set("acao", params.acao);
    if (params?.de) qs.set("de", params.de);
    if (params?.ate) qs.set("ate", params.ate);
    if (params?.limit != null) qs.set("limit", String(params.limit));
    if (params?.offset != null) qs.set("offset", String(params.offset));
    const tail = qs.toString();
    return request<{ total: number; limit: number; offset: number; itens: AuditoriaItem[] }>(
      `/auditoria${tail ? `?${tail}` : ""}`,
    );
  },

  auditoriaAcoes: () =>
    request<{ acoes: { acao: string; n: number }[] }>("/auditoria/acoes"),

  remotoNetwork: () =>
    request<{
      port: number;
      links: {
        iface: string;
        address: string;
        netmask: string;
        url: string;
        qrSvg: string;
      }[];
    }>("/remoto/network"),

  remotoTunnelStatus: () =>
    request<RemotoTunnelStatus>("/remoto/tunnel/status"),

  remotoTunnelStart: () =>
    request<RemotoTunnelStatus>("/remoto/tunnel/start", { method: "POST" }),

  remotoTunnelStop: () =>
    request<RemotoTunnelStatus>("/remoto/tunnel/stop", { method: "POST" }),

  whatsappConfigGet: () => request<WhatsAppConfig>("/whatsapp/config"),

  whatsappStatus: () => request<WhatsAppPainelStatus>("/whatsapp/status"),

  whatsappLogout: () =>
    request<{ ok: boolean }>("/whatsapp/logout", { method: "POST" }),

  whatsappNovoQr: () =>
    request<{ ok: boolean }>("/whatsapp/novo-qr", { method: "POST" }),

  whatsappConfigSave: (body: {
    ativo?: boolean;
    template_confirmacao?: string;
    hora_envio_automatico?: number;
    hora_fixa_ativa?: boolean;
    hora_fixa_mensagem?: string | null;
  }) =>
    request<{ ok: boolean }>("/whatsapp/config", {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  whatsappLogs: (limit = 50) =>
    request<WhatsAppLogRow[]>(`/whatsapp/logs?limit=${limit}`),

  whatsappEnviar: (agendamentoId: number, opts?: { reenviar?: boolean }) =>
    request<{ ok: boolean; logId: number }>(
      `/whatsapp/enviar/${agendamentoId}`,
      {
        method: "POST",
        body: opts?.reenviar ? JSON.stringify({ reenviar: true }) : undefined,
      },
    ),

  whatsappEnviarHoje: () =>
    request<{ enviados: number; erros: number; ignorado?: string }>(
      "/whatsapp/enviar-hoje",
      { method: "POST" },
    ),

  whatsappEnviarAmanha: () =>
    request<{ enviados: number; erros: number }>("/whatsapp/enviar-amanha", {
      method: "POST",
    }),

  whatsappMarcarConfirmado: (agendamentoId: number) =>
    request<{ ok: boolean }>(
      `/whatsapp/agendamentos/${agendamentoId}/confirmado`,
      { method: "PATCH" },
    ),

  whatsappPreparosList: () =>
    request<CobrancaProcedimento[]>("/whatsapp/preparos"),

  whatsappPreparoSave: (id: number, orientacoes_paciente: string | null) =>
    request<CobrancaProcedimento>(`/whatsapp/preparos/${id}`, {
      method: "PUT",
      body: JSON.stringify({ orientacoes_paciente }),
    }),

  fichasTemplateList: async (params?: {
    escopo?: "todas" | "clinica" | "minhas";
    destino?: "prontuario" | "aso";
  }) => {
    const qs = new URLSearchParams();
    if (params?.escopo) qs.set("escopo", params.escopo);
    if (params?.destino) qs.set("destino", params.destino);
    const tail = qs.toString();
    const r = await request<{ fichas: FichaTemplate[] }>(
      `/fichas-template${tail ? `?${tail}` : ""}`,
    );
    if (!params?.destino) return r;
    return { fichas: fichasDoDestino(r.fichas, params.destino) };
  },

  fichasTemplateDisponiveis: async (
    medicoId: number,
    destino: "prontuario" | "aso" = "prontuario",
  ) => {
    const r = await request<{ fichas: FichaTemplate[] }>(
      `/fichas-template/disponiveis?medico_id=${medicoId}&destino=${destino}`,
    );
    return { fichas: fichasDoDestino(r.fichas, destino) };
  },

  fichasTemplateGet: (id: number) =>
    request<FichaTemplate>(`/fichas-template/${id}`),

  fichasTemplateCreate: (body: {
    nome: string;
    titulo_documento: string;
    modo?: "secoes" | "pdf_fundo";
    campos: FichaCampo[];
    campos_posicao?: FichaCampoPosicao[];
    medico_id?: number | null;
    ativo?: boolean;
    pdf_revisado?: boolean;
    destino?: "prontuario" | "aso";
  }) =>
    request<FichaTemplate>("/fichas-template", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  fichasTemplateUpdate: (
    id: number,
    body: {
      nome?: string;
      titulo_documento?: string;
      modo?: "secoes" | "pdf_fundo";
      campos?: FichaCampo[];
      campos_posicao?: FichaCampoPosicao[];
      ativo?: boolean;
      pdf_revisado?: boolean;
    },
  ) =>
    request<FichaTemplate>(`/fichas-template/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  fichasTemplateCreateFromPdf: async (
    meta: {
      nome: string;
      titulo_documento: string;
      campos: FichaCampo[];
      medico_id?: number | null;
      modo?: "secoes" | "pdf_fundo";
      destino?: "prontuario" | "aso";
    },
    file: File,
  ) => {
    const body = new FormData();
    body.append("arquivo", file);
    body.append(
      "dados",
      JSON.stringify({
        nome: meta.nome,
        titulo_documento: meta.titulo_documento,
        campos: meta.campos,
        medico_id: meta.medico_id,
        modo: meta.modo ?? "secoes",
        destino: meta.destino,
      }),
    );
    const res = await fetch(`${API_BASE}/fichas-template/pdf`, {
      method: "POST",
      credentials: "include",
      body,
    });
    const data = (await res.json().catch(() => ({}))) as FichaTemplate & {
      error?: string;
    };
    if (!res.ok) {
      const fallback =
        res.status === 404
          ? "Recurso não encontrado. Feche e abra o MedPronto de novo para aplicar a atualização."
          : res.statusText;
      throw new ApiError(mensagemErroApi(data, fallback), res.status, data);
    }
    return data;
  },

  fichasTemplateUploadPdf: async (id: number, file: File) => {
    const body = new FormData();
    body.append("arquivo", file);
    const res = await fetch(`${API_BASE}/fichas-template/${id}/pdf`, {
      method: "POST",
      credentials: "include",
      body,
    });
    const data = (await res.json().catch(() => ({}))) as FichaTemplate & {
      error?: string;
    };
    if (!res.ok) {
      const fallback =
        res.status === 404
          ? "Recurso não encontrado. Feche e abra o MedPronto de novo para aplicar a atualização."
          : res.statusText;
      throw new ApiError(mensagemErroApi(data, fallback), res.status, data);
    }
    return data;
  },

  fichasTemplatePdfBlob: async (id: number): Promise<Blob> => {
    const res = await fetch(`${API_BASE}/fichas-template/${id}/pdf`, {
      credentials: "include",
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new ApiError(data.error ?? res.statusText, res.status, data);
    }
    return res.blob();
  },

  fichasTemplatePatch: (id: number, body: { ativo: boolean }) =>
    request<FichaTemplate>(`/fichas-template/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  fichasTemplateDuplicar: (
    id: number,
    body?: { nome?: string; pessoal?: boolean },
  ) =>
    request<FichaTemplate>(`/fichas-template/${id}/duplicar`, {
      method: "POST",
      body: JSON.stringify(body ?? {}),
    }),

  fichasTemplateDefault: (id: number) =>
    request<FichaTemplate>(`/fichas-template/${id}/default`, { method: "POST" }),

  fichasTemplateDelete: (id: number) =>
    request<{ ok: boolean }>(`/fichas-template/${id}`, { method: "DELETE" }),

  backupList: () => request<{ backups: BackupArquivo[] }>("/backup"),

  backupDownload: async (incluirUploads: boolean) => {
    const qs = incluirUploads ? "" : "?incluirUploads=0";
    const res = await fetch(`${API_BASE}/backup/download${qs}`, {
      credentials: "include",
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new ApiError(data.error ?? res.statusText, res.status);
    }
    const blob = await res.blob();
    const disp = res.headers.get("Content-Disposition") ?? "";
    const match = /filename="?([^"]+)"?/i.exec(disp);
    const nome = match?.[1] ?? `medpronto-backup-${Date.now()}.zip`;
    const salvoComo = await saveBlobAs(blob, nome);
    return { nome: salvoComo };
  },

  backupRestaurar: async (file: File) => {
    const body = new FormData();
    body.append("arquivo", file);
    const res = await fetch(`${API_BASE}/backup/restaurar`, {
      method: "POST",
      credentials: "include",
      body,
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      message?: string;
      ok?: boolean;
      reiniciando?: boolean;
    };
    if (!res.ok) {
      throw new ApiError(data.error ?? res.statusText, res.status);
    }
    return data;
  },

  // —— Fase 1 clínica ——

  list: <T extends { id: number }>(resource: string, q?: string) => {
    const params = new URLSearchParams();
    if (q?.trim()) params.set("q", q.trim());
    const qs = params.toString();
    return request<T[]>(`/${resource}${qs ? `?${qs}` : ""}`);
  },

  create: <T>(resource: string, body: unknown) =>
    request<T>(`/${resource}`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  update: <T>(resource: string, id: number, body: unknown) =>
    request<T>(`/${resource}/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  remove: (resource: string, id: number) =>
    request(`/${resource}/${id}`, { method: "DELETE" }),

  nextCode: (resource: string) =>
    request<{ code: string }>(`/cadastros/${resource}/proximo-codigo`),

  pacientesList: (q?: string) => {
    const qs = q?.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
    return request<Paciente[]>(`/pacientes${qs}`);
  },

  pacienteGet: (id: number) => request<Paciente>(`/pacientes/${id}`),

  pacienteSave: (body: Partial<Paciente> & { nome: string }, id?: number) =>
    id
      ? request<Paciente>(`/pacientes/${id}`, {
          method: "PUT",
          body: JSON.stringify(body),
        })
      : request<Paciente>("/pacientes", {
          method: "POST",
          body: JSON.stringify(body),
        }),

  pacienteDelete: (id: number) =>
    request(`/pacientes/${id}`, { method: "DELETE" }),

  usuariosList: (perfil?: string) => {
    const qs = perfil ? `?perfil=${encodeURIComponent(perfil)}` : "";
    return request<UsuarioRow[]>(`/usuarios${qs}`);
  },

  medicosList: (somenteAtivos = true) => {
    const qs = somenteAtivos ? "" : "?ativos=0";
    return request<MedicoRow[]>(`/medicos${qs}`);
  },

  medicoGet: (id: number) => request<MedicoRow>(`/medicos/${id}`),

  medicoSave: (
    body: {
      nome: string;
      crm: string;
      login?: string;
      senha?: string;
      ativo?: boolean;
    },
    id?: number,
  ) =>
    id
      ? request<MedicoRow>(`/medicos/${id}`, {
          method: "PUT",
          body: JSON.stringify(body),
        })
      : request<MedicoRow>("/medicos", {
          method: "POST",
          body: JSON.stringify(body),
        }),

  medicoDelete: (id: number) =>
    request(`/medicos/${id}`, { method: "DELETE" }),

  usuariosModulos: () =>
    request<{ modulos: { codigo: string; label: string }[] }>(
      "/usuarios/modulos",
    ),

  usuarioGet: (id: number) =>
    request<UsuarioRow & { permissoes: string[] }>(`/usuarios/${id}`),

  usuarioSave: (
    body: {
      nome: string;
      login: string;
      senha?: string;
      perfil: Perfil;
      crm?: string;
      ativo?: boolean;
      permissoes?: string[];
    },
    id?: number,
  ) =>
    id
      ? request(`/usuarios/${id}`, {
          method: "PUT",
          body: JSON.stringify(body),
        })
      : request("/usuarios", {
          method: "POST",
          body: JSON.stringify(body),
        }),

  agendamentosList: (data: string, medicoId?: number) => {
    const p = new URLSearchParams({ data });
    if (medicoId) p.set("medico_id", String(medicoId));
    return request<AgendamentoRow[]>(`/agendamentos?${p}`);
  },

  agendamentosResumo: (
    de: string,
    ate: string,
    medicoId?: number,
    mes?: string,
    semana?: string,
  ) => {
    const p = new URLSearchParams({ de, ate });
    if (medicoId) p.set("medico_id", String(medicoId));
    if (mes) p.set("mes", mes);
    if (semana) p.set("semana", semana);
    return request<{
      de: string;
      ate: string;
      medico_id: number | null;
      dias: { data: string; total: number; ativos: number }[];
      medicos: {
        medico_id: number;
        medico_nome: string;
        agendamentos: number;
        pacientes: number;
      }[];
    }>(`/agendamentos/resumo?${p}`);
  },

  agendamentosFila: (data: string, medicoId?: number) => {
    const p = new URLSearchParams({ data });
    if (medicoId) p.set("medico_id", String(medicoId));
    return request<FilaDia>(`/agendamentos/fila?${p}`);
  },

  agendamentoCreate: (body: {
    paciente_id: number;
    medico_id: number;
    data: string;
    hora: string;
    duracao_minutos?: number;
    observacao_agenda?: string;
    ignorar_aviso_retorno?: boolean;
    checkin?: boolean;
    ficha_template_id?: number | null;
    aso_template_id?: number | null;
    eh_encaixe?: boolean;
    convenio_id: number;
    procedimento_ids: number[];
  }) =>
    request<AgendamentoRow>("/agendamentos", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  agendamentoConvenioSugerido: (pacienteId: number) =>
    request<{ convenio_id: number }>(
      `/agendamentos/convenio-sugerido?paciente_id=${pacienteId}`,
    ),

  agendamentosHistoricoPaciente: (pacienteId: number) =>
    request<PacienteAtendimentoHistoricoItem[]>(
      `/agendamentos/paciente/${pacienteId}/historico`,
    ),

  /** Horários só-exame finalizados — memória clínica (sem prontuário). */
  historicoExamesClinicos: (pacienteId: number) =>
    request<HistoricoExameClinicoItem[]>(
      `/agendamentos/paciente/${pacienteId}/historico-exames-clinicos`,
    ),

  agendamentoProcedimentos: (
    id: number,
    body: { procedimento_ids: number[]; convenio_id?: number },
  ) =>
    request<AgendamentoRow>(`/agendamentos/${id}/procedimentos`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  agendamentoProcedimentosPrevistos: () =>
    request<
      | CobrancaProcedimento[]
      | { procedimentos: CobrancaProcedimento[]; convenios?: CobrancaConvenio[] }
    >("/agendamentos/procedimentos-previstos"),

  agendamentoConvenios: () =>
    request<CobrancaConvenio[]>("/agendamentos/convenios"),

  retornoVigente: (pacienteId: number) =>
    request<{
      vigente: boolean;
      retorno: RetornoVigente | null;
    }>(`/agendamentos/retorno-vigente?paciente_id=${pacienteId}`),

  agendamentoStatus: (id: number, status: string) =>
    request<AgendamentoRow>(`/agendamentos/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),

  agendamentoFicha: (id: number, ficha_template_id: number | null) =>
    request<AgendamentoRow>(`/agendamentos/${id}/ficha`, {
      method: "PATCH",
      body: JSON.stringify({ ficha_template_id }),
    }),

  agendamentoConsultar: (id: number) =>
    request<{ tipo: "consulta" | "admissional"; id: number }>(
      `/agendamentos/${id}/consultar`,
    ),

  agendamentoVinculos: (id: number) =>
    request<{ prontuario_id: number | null; admissional_id: number | null }>(
      `/agendamentos/${id}/vinculos`,
    ),

  prontuarioAbrir: (agendamento_id: number) =>
    request<{
      prontuario: Prontuario;
      paciente: Paciente;
      agendamento_id: number;
    }>("/prontuarios/abrir", {
      method: "POST",
      body: JSON.stringify({ agendamento_id }),
    }),

  prontuarioGet: (id: number) => request<ProntuarioDetalhe>(`/prontuarios/${id}`),

  prontuarioSave: (id: number, body: Partial<Prontuario>) =>
    request<Prontuario>(`/prontuarios/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  prontuarioFinalizar: (id: number) =>
    request<{ ok: boolean }>(`/prontuarios/${id}/finalizar`, { method: "POST" }),

  receitaGet: (prontuarioId: number) =>
    request<{
      receita: { id: number; observacoes: string | null } | null;
      itens: ReceitaItem[];
    }>(`/prontuarios/${prontuarioId}/receita`),

  receitaSave: (
    prontuarioId: number,
    body: { observacoes?: string | null; itens: ReceitaItem[] },
  ) =>
    request<{
      receita: { id: number; observacoes: string | null } | null;
      itens: ReceitaItem[];
    }>(`/prontuarios/${prontuarioId}/receita`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  receitaPdf: (prontuarioId: number) =>
    openPdf(`/prontuarios/${prontuarioId}/receita/pdf`),

  atestadoGet: (prontuarioId: number) =>
    request<{ atestado: Atestado | null }>(`/prontuarios/${prontuarioId}/atestado`),

  atestadoSave: (prontuarioId: number, body: Partial<Atestado>) =>
    request<{ atestado: Atestado }>(`/prontuarios/${prontuarioId}/atestado`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  atestadoPdf: (prontuarioId: number) =>
    openPdf(`/prontuarios/${prontuarioId}/atestado/pdf`),

  pedidoExameGet: (prontuarioId: number) =>
    request<{ pedido: PedidoExame | null }>(
      `/prontuarios/${prontuarioId}/pedido-exame`,
    ),

  pedidoExameSave: (prontuarioId: number, body: Partial<PedidoExame>) =>
    request<{ pedido: PedidoExame }>(`/prontuarios/${prontuarioId}/pedido-exame`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  pedidoExamePdf: (prontuarioId: number) =>
    openPdf(`/prontuarios/${prontuarioId}/pedido-exame/pdf`),

  consultaPdf: (prontuarioId: number) =>
    openPdf(`/prontuarios/${prontuarioId}/consulta/pdf`),

  documentosLoteList: (prontuarioId: number) =>
    request<{
      documentos: { tipo: string; label: string }[];
    }>(`/prontuarios/${prontuarioId}/documentos/lote`),

  documentosLotePdf: (prontuarioId: number) =>
    openPdf(`/prontuarios/${prontuarioId}/documentos/lote/pdf`),

  examesListar: (pacienteId: number) =>
    request<{ exames: ExameAnexo[] }>(`/exames/paciente/${pacienteId}`),

  exameUpload: async (
    pacienteId: number,
    file: File,
    opts?: { descricao?: string; prontuario_id?: number },
  ) => {
    const body = new FormData();
    body.append("arquivo", file);
    if (opts?.descricao?.trim()) body.append("descricao", opts.descricao.trim());
    if (opts?.prontuario_id != null) {
      body.append("prontuario_id", String(opts.prontuario_id));
    }
    const res = await fetch(`${API_BASE}/exames/paciente/${pacienteId}`, {
      method: "POST",
      credentials: "include",
      body,
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      exame?: ExameAnexo;
    };
    if (!res.ok) {
      throw new ApiError(
        data.error ??
          (res.status === 404
            ? "Serviço de exames indisponível. Feche e abra o MedPronto de novo (parar.bat + iniciar)."
            : res.statusText),
        res.status,
        data,
      );
    }
    return data as { exame: ExameAnexo };
  },

  exameArquivo: (id: number) => openPdf(`/exames/${id}/arquivo`),

  exameVincular: (id: number, prontuario_id: number | null) =>
    request<{ exame: ExameAnexo }>(`/exames/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ prontuario_id }),
    }),

  prontuarioHistorico: (pacienteId: number) =>
    request<ProntuarioHistoricoItem[]>(`/prontuarios/paciente/${pacienteId}`),

  prontuarioRetificar: (id: number, motivo_retificacao: string) =>
    request<{ prontuario: ProntuarioDetalhe }>(`/prontuarios/${id}/retificar`, {
      method: "POST",
      body: JSON.stringify({ motivo_retificacao }),
    }),

  prontuarioCancelarRetificacao: (id: number) =>
    request<{ ok: boolean; prontuario_origem_id: number }>(
      `/prontuarios/${id}/cancelar-retificacao`,
      { method: "POST" },
    ),

  admissionalPing: () =>
    request<{ ok: boolean; modulo: string }>("/admissionais/ping"),

  admissionaisList: (params?: {
    status?: string;
    paciente_id?: number;
    data?: string;
  }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.paciente_id != null) qs.set("paciente_id", String(params.paciente_id));
    if (params?.data) qs.set("data", params.data);
    const tail = qs.toString();
    return request<AdmissionalRow[]>(`/admissionais${tail ? `?${tail}` : ""}`);
  },

  admissionalPacientesBusca: (q?: string) => {
    const qs = q?.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
    return request<AdmissionalPacienteBusca[]>(`/admissionais/pacientes-busca${qs}`);
  },

  admissionalGet: (id: number) => request<AdmissionalRow>(`/admissionais/${id}`),

  admissionalAbrir: (agendamento_id: number) =>
    request<AdmissionalRow>("/admissionais/abrir", {
      method: "POST",
      body: JSON.stringify({ agendamento_id }),
    }),

  admissionalCreate: (body: {
    paciente_id: number;
    medico_id: number;
    agendamento_id?: number;
  }) =>
    request<AdmissionalRow>("/admissionais", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  admissionalSave: (
    id: number,
    body: {
      dados?: AdmissionalDados | Record<string, unknown>;
      conclusao?: AdmissionalConclusao | null;
      restricoes_texto?: string | null;
    },
  ) =>
    request<AdmissionalRow>(`/admissionais/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  admissionalFinalizar: (
    id: number,
    body: {
      conclusao: AdmissionalConclusao;
      restricoes_texto?: string;
      dados?: AdmissionalDados | Record<string, unknown>;
    },
  ) =>
    request<AdmissionalRow>(`/admissionais/${id}/finalizar`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  admissionalModelo: (id: number, aso_template_id: number) =>
    request<AdmissionalRow>(`/admissionais/${id}/modelo`, {
      method: "PATCH",
      body: JSON.stringify({ aso_template_id }),
    }),

  admissionalRetificar: (id: number, motivo_retificacao: string) =>
    request<AdmissionalRow>(`/admissionais/${id}/retificar`, {
      method: "POST",
      body: JSON.stringify({ motivo_retificacao }),
    }),

  admissionalCancelarRetificacao: (id: number) =>
    request<{ ok: true; admissional_origem_id: number }>(
      `/admissionais/${id}/cancelar-retificacao`,
      { method: "POST" },
    ),

  admissionalPdf: (id: number) => openPdf(`/admissionais/${id}/pdf`),

  admissionalHistoricoPaciente: (pacienteId: number) =>
    request<AdmissionalHistoricoItem[]>(
      `/admissionais/paciente/${pacienteId}/historico`,
    ),

  admissionalVincularExame: (id: number, exame_anexo_id: number | null) =>
    request<AdmissionalHistoricoItem>(`/admissionais/${id}/exame-anexo`, {
      method: "PATCH",
      body: JSON.stringify({ exame_anexo_id }),
    }),
};

export type Perfil = "admin" | "medico" | "secretaria";

export type Paciente = {
  id: number;
  nome: string;
  data_nasc?: string | null;
  cpf?: string | null;
  telefone?: string | null;
  email?: string | null;
  endereco?: string | null;
  numero?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
  fone_emergencia?: string | null;
  alergias?: string | null;
  medicacoes_uso?: string | null;
  observacoes_clinicas?: string | null;
  exames_qtd?: number;
};

export type MedicoRow = {
  id: number;
  nome: string;
  login: string;
  crm?: string | null;
  cpf?: string | null;
  telefone?: string | null;
  endereco?: string | null;
  email?: string | null;
  ativo: number;
  created_at?: string;
};

export type UsuarioRow = {
  id: number;
  nome: string;
  login: string;
  perfil: Perfil;
  crm?: string | null;
  ativo: number;
};

export type AgendamentoRow = {
  id: number;
  paciente_id: number;
  medico_id: number;
  data: string;
  hora: string;
  duracao_minutos?: number;
  status: string;
  eh_retorno?: number;
  eh_encaixe?: number;
  tipo_atendimento?: "consulta" | "admissional" | "exame";
  ficha_template_id?: number | null;
  aso_template_id?: number | null;
  convenio_id?: number | null;
  convenio_nome?: string | null;
  procedimento_id?: number | null;
  procedimento_nome?: string | null;
  procedimentos?: {
    id: number;
    nome: string;
    modo_clinico: "prontuario" | "aso" | "nenhum";
    ordem: number;
  }[];
  paciente_nome?: string;
  medico_nome?: string;
  paciente_alergias?: string | null;
  observacao_agenda?: string | null;
  prontuario_id?: number | null;
  admissional_id?: number | null;
  admissional_status?: string | null;
  confirmacao_enviada?: number;
  confirmacao_respondida?: number;
  whatsapp_ultimo_status?: string | null;
  whatsapp_preparo_pendente?: number;
  paciente_telefone?: string | null;
  conta_id?: number | null;
  conta_status?: string | null;
};

export type PacienteAtendimentoHistoricoItem = {
  id: number;
  data: string;
  hora: string;
  status: string;
  medico_id: number;
  medico_nome?: string | null;
  procedimento_nome?: string | null;
  procedimentos?: {
    id: number;
    nome: string;
    modo_clinico: "prontuario" | "aso" | "nenhum";
    ordem: number;
  }[];
};

/** Episódio só-exame no histórico clínico (GET historico-exames-clinicos). */
export type HistoricoExameClinicoItem = {
  agendamento_id: number;
  data: string;
  hora: string;
  status: string;
  medico_id: number;
  medico_nome: string;
  procedimentos: {
    id: number;
    nome: string;
    modo_clinico: string;
    ordem: number;
  }[];
  anexos: {
    exame_anexo_id: number;
    exame_nome: string;
    procedimento_id: number | null;
    procedimento_nome: string | null;
  }[];
};

export type WhatsAppPainelStatus = {
  status: string;
  me: { id: string } | null;
  qrSvg: string | null;
};

export type WhatsAppConfig = {
  id: number;
  provedor: string | null;
  api_url: string | null;
  api_token: string | null;
  numero_origem: string | null;
  ativo: number;
  template_confirmacao: string | null;
  hora_envio_automatico?: number;
  hora_fixa_ativa?: number;
  hora_fixa_mensagem?: string | null;
};

export type WhatsAppLogRow = {
  id: number;
  agendamento_id: number | null;
  paciente_id: number | null;
  paciente_nome?: string | null;
  telefone: string | null;
  mensagem: string | null;
  status: string;
  created_at: string;
};

export type RetornoVigente = {
  prontuario_id: number;
  paciente_id: number;
  medico_id: number;
  medico_nome: string;
  retorno_dias: number;
  retorno_ate: string;
  data_atendimento: string;
  dias_restantes: number;
};

export type FilaDia = {
  data: string;
  medico_id: number | null;
  grupos: Record<string, AgendamentoRow[]>;
};

export type Prontuario = {
  id: number;
  paciente_id: number;
  agendamento_id?: number | null;
  medico_id: number;
  queixa_principal?: string | null;
  anamnese?: string | null;
  exame_fisico?: string | null;
  hipotese_diagnostica?: string | null;
  cid_codigo?: string | null;
  cid_descricao?: string | null;
  conduta?: string | null;
  plano?: string | null;
  retorno_dias?: number | null;
  retorno_ate?: string | null;
  data_atendimento?: string;
  retificacao_de_id?: number | null;
  motivo_retificacao?: string | null;
  retificacao_finalizada?: number | boolean | null;
  ficha_template_id?: number | null;
  ficha_titulo_documento?: string;
  ficha_modo?: string;
  ficha_campos?: import("./fichaTipos").FichaCampoDef[];
  ficha_campos_posicao?: FichaCampoPosicao[];
  dados_json?: Record<string, unknown>;
  template_snapshot_json?: string | null;
  /** Consulta finalizada — edição bloqueada (retificação em curso continua editável) */
  consulta_encerrada?: boolean;
};

export type ProntuarioDetalhe = Prontuario & {
  paciente_nome?: string;
  paciente_nasc?: string | null;
  paciente_cpf?: string | null;
  paciente_telefone?: string | null;
  paciente_email?: string | null;
  alergias?: string | null;
  medicacoes_uso?: string | null;
  observacoes_clinicas?: string | null;
  medico_nome?: string;
  medico_crm?: string | null;
};

export type ReceitaItem = {
  id?: number;
  medicamento: string;
  dosagem?: string | null;
  via?: string | null;
  posologia?: string | null;
  quantidade?: string | null;
  duracao_dias?: number | null;
};

export type Atestado = {
  id?: number;
  dias_afastamento?: number | null;
  cid_codigo?: string | null;
  cid_descricao?: string | null;
  texto_livre?: string | null;
};

export type PedidoExame = {
  id?: number;
  exames_solicitados: string;
  observacoes?: string | null;
};

export type ExameAnexo = {
  id: number;
  paciente_id: number;
  paciente_nome?: string;
  paciente_nome_atual?: string;
  nome_diverge?: boolean;
  prontuario_id: number | null;
  admissional_id?: number | null;
  conta_item_id?: number | null;
  data_upload: string;
  descricao: string | null;
  arquivo_path: string;
  uploaded_by: number | null;
  uploaded_by_nome?: string | null;
  nome_arquivo?: string;
  nome_arquivo_completo?: string;
};

export type ProntuarioHistoricoItem = Prontuario & {
  paciente_id: number;
  agendamento_id: number | null;
  medico_id: number;
  data_atendimento: string;
  queixa_principal: string | null;
  anamnese: string | null;
  exame_fisico: string | null;
  hipotese_diagnostica: string | null;
  cid_codigo: string | null;
  cid_descricao: string | null;
  conduta: string | null;
  plano: string | null;
  retorno_dias: number | null;
  retorno_ate: string | null;
  retificacao_de_id: number | null;
  motivo_retificacao: string | null;
  retificacao_finalizada: number | boolean | null;
  medico_nome: string;
  tem_receita?: number | boolean;
  tem_pedido_exame?: number | boolean;
  tem_atestado?: number | boolean;
};

import type { AdmissionalDados } from "./admissionalAso";

export type {
  AdmissionalDados,
  AsoExameValor,
} from "./admissionalAso";

export type AdmissionalConclusao = "apto" | "inapto" | "apto_com_restricao";

export type AdmissionalHistoricoItem = {
  id: number;
  paciente_id: number;
  agendamento_id: number | null;
  medico_id: number;
  status: "em_preenchimento" | "finalizado" | "cancelado";
  conclusao: AdmissionalConclusao | null;
  restricoes_texto: string | null;
  exame_anexo_id: number | null;
  finalizado_em: string | null;
  created_at: string;
  medico_nome: string;
  medico_crm: string | null;
  exame_descricao: string | null;
  exame_nome_arquivo: string | null;
  retificacao_de_id: number | null;
  motivo_retificacao: string | null;
  retificacao_finalizada: number | boolean | null;
};

export type AdmissionalRow = {
  id: number;
  paciente_id: number;
  agendamento_id: number | null;
  medico_id: number;
  status: "em_preenchimento" | "finalizado" | "cancelado";
  conclusao: AdmissionalConclusao | null;
  restricoes_texto: string | null;
  dados?: AdmissionalDados | Record<string, unknown>;
  documento_path: string | null;
  exame_anexo_id: number | null;
  exame_descricao?: string | null;
  exame_nome_arquivo?: string | null;
  finalizado_em: string | null;
  created_at: string;
  updated_at: string;
  paciente_nome?: string;
  paciente_cpf?: string | null;
  paciente_data_nasc?: string | null;
  medico_nome?: string;
  medico_crm?: string | null;
  retificacao_de_id?: number | null;
  motivo_retificacao?: string | null;
  retificacao_finalizada?: number | boolean | null;
  aso_template_id?: number | null;
  aso_legado?: boolean;
  aso_titulo_documento?: string | null;
  aso_modo?: string;
  aso_campos?: FichaCampo[];
  aso_campos_posicao?: FichaCampoPosicao[];
  modelos_aso?: { id: number; nome: string; eh_default: boolean }[];
};

export type AdmissionalPacienteBusca = {
  id: number;
  nome: string;
  cpf: string | null;
  telefone: string | null;
  data_nasc: string | null;
};

export type CobrancaConvenio = {
  id: number;
  nome: string;
  tipo: "particular" | "operadora";
  ativo: number;
  exige_guia: number;
};

export type CobrancaProcedimento = {
  id: number;
  codigo: string | null;
  nome: string;
  ativo: number;
  orientacoes_paciente?: string | null;
  modo_clinico: "prontuario" | "aso" | "nenhum";
};

export type CobrancaPreco = {
  id: number;
  procedimento_id: number;
  convenio_id: number;
  valor_centavos: number;
};

export type CobrancaMatrizPrecos = {
  convenios: CobrancaConvenio[];
  procedimentos: CobrancaProcedimento[];
  precos: CobrancaPreco[];
};

export type CobrancaItemStatus =
  | "previsto"
  | "solicitado"
  | "realizado"
  | "cancelado";

export type CobrancaFormaPagamento =
  | "pix"
  | "credito"
  | "debito"
  | "dinheiro"
  | "transferencia";

export type CobrancaContaPagamento = {
  id: number;
  conta_id: number;
  forma: CobrancaFormaPagamento | "repasse_convenio" | string;
  valor_centavos: number;
  registrado_em: string;
  registrado_por: number | null;
  observacao: string | null;
};

export type CobrancaContaItem = {
  id: number;
  conta_id: number;
  procedimento_id: number | null;
  status: CobrancaItemStatus;
  valor_centavos: number;
  quantidade: number;
  observacao: string | null;
  exame_anexo_id?: number | null;
  exame_nome?: string | null;
  admissional_id?: number | null;
  admissional_status?: string | null;
  admissional_conclusao?: string | null;
  admissional_medico_nome?: string | null;
  procedimento_nome?: string;
  procedimento_codigo?: string | null;
  procedimento_modo_clinico?: "prontuario" | "aso" | "nenhum" | null;
};

export type AdmissionalSugeridoConta = {
  id: number;
  status: string;
  conclusao: string | null;
  medico_nome: string;
  created_at: string;
  finalizado_em: string | null;
  vinculado_item_id: number | null;
  elegivel: boolean;
};

export type CobrancaCaixaConta = {
  id: number;
  paciente_id: number;
  paciente_nome: string;
  convenio_nome: string | null;
  agendamento_id?: number | null;
  agendamento_hora?: string | null;
  procedimentos_nomes?: string | null;
  status: string;
  qtd_itens: number;
  total_itens_centavos: number;
  total_liquido_centavos: number;
  total_pago_centavos: number;
  saldo_pendente_centavos: number;
};

export type CobrancaCaixaDoDia = {
  data: string;
  totais: {
    contas: number;
    em_aberto: number;
    aguardando_pagamento: number;
    fechadas: number;
    arrecadado_centavos: number;
    a_faturar_qtd: number;
    a_faturar_centavos: number;
    saldo_pendente_centavos: number;
  };
  por_forma: { forma: string; valor_centavos: number }[];
  contas: CobrancaCaixaConta[];
};

export type RelatorioFaturamentoConvenio = {
  de: string;
  ate: string;
  convenio_id: number | null;
  convenio_nome: string | null;
  grupos: FaturamentoConvenioGrupo[];
  qtd_contas: number;
  total_liquido_centavos: number;
};

export type FaturamentoConvenioGrupo = {
  convenio_id: number;
  convenio_nome: string;
  contas: FaturamentoConvenioConta[];
  total_liquido_centavos: number;
};

export type FaturamentoConvenioConta = {
  conta_id: number;
  data: string;
  agendamento_hora?: string | null;
  paciente_nome: string;
  status: string;
  numero_guia: string | null;
  senha: string | null;
  autorizacao: string | null;
  total_liquido_centavos: number;
  itens: {
    procedimento_nome: string;
    quantidade: number;
    valor_centavos: number;
    subtotal_centavos: number;
  }[];
};

export type CobrancaRelatorio = {
  de: string;
  ate: string;
  resumo: {
    arrecadado_centavos: number;
    recebido_convenio_centavos: number;
    a_faturar_centavos: number;
    contas_periodo: number;
    contas_fechadas: number;
  };
  por_forma: { forma: string; valor_centavos: number }[];
  por_convenio: {
    convenio_id: number | null;
    convenio_nome: string;
    convenio_tipo: string;
    atendimentos: number;
    total_itens_centavos: number;
    arrecadado_centavos: number;
    a_faturar_centavos: number;
  }[];
  por_procedimento: {
    procedimento_id: number;
    procedimento_nome: string;
    quantidade: number;
    valor_centavos: number;
  }[];
};

export type CobrancaContaResumo = {
  id: number;
  paciente_id: number;
  data: string;
  convenio_id: number | null;
  agendamento_id?: number | null;
  agendamento_hora?: string | null;
  procedimentos_nomes?: string | null;
  status: string;
  paciente_nome?: string;
  convenio_nome?: string;
  qtd_itens: number;
  total_itens_centavos: number;
};

export type CobrancaConvenioGuia = {
  conta_id: number;
  numero_guia: string | null;
  senha: string | null;
  autorizacao: string | null;
  data_envio: string | null;
  observacao: string | null;
};

export type CobrancaConvenioGuiaInput = {
  numero_guia?: string | null;
  senha?: string | null;
  autorizacao?: string | null;
  data_envio?: string | null;
  observacao?: string | null;
};

export type CobrancaContaDetalhe = CobrancaContaResumo & {
  observacao: string | null;
  valor_desconto_centavos: number;
  motivo_desconto?: string | null;
  itens: CobrancaContaItem[];
  pagamentos: CobrancaContaPagamento[];
  convenio_guia?: CobrancaConvenioGuia | null;
  total_liquido_centavos: number;
  total_pago_centavos: number;
  saldo_pendente_centavos: number;
};
