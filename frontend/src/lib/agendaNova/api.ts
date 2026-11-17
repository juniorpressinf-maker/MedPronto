/**
 * Agenda Nova — cliente HTTP (/api/agenda-config e extensões de /api/agendamentos).
 * Usa o mesmo `request` de lib/api.ts (cookie, ApiError, licença).
 *
 * Decisões do cliente (13/11/2026): sem tela de configuração prévia; cor e duração
 * vêm do procedimento; horário padrão único ajustado pelo botão ⚙ da agenda.
 */
import { request } from "../api";

export type TipoAtendimento = "consulta" | "admissional" | "exame";

/** Tipos são internos (deduzidos dos procedimentos); vêm na grade só para rótulo. */
export type AgendamentoTipo = {
  id: number;
  codigo: string | null;
  nome: string;
  cor: string;
  duracao_minutos: number;
  tipo_atendimento: TipoAtendimento;
  eh_retorno: 0 | 1;
  eh_encaixe: 0 | 1;
  ativo: 0 | 1;
  ordem: number;
};

export type HorarioPadrao = {
  inicio: string;
  fim: string;
  intervalo_minutos: number;
};

export type Bloqueio = {
  id: number;
  medico_id: number | null;
  medico_nome: string | null;
  data_inicio: string;
  data_fim: string;
  hora_inicio: string;
  hora_fim: string;
  motivo: string | null;
  criado_por: number | null;
  criado_por_nome: string | null;
  created_at: string;
};

/** Médico na agenda (sem cor — decisão 13/11). */
export type MedicoAgenda = { medico_id: number; nome: string; ativo: 0 | 1 };

export type ProcedimentoCard = {
  id: number;
  nome: string;
  modo_clinico: string;
  ordem: number;
  cor?: string | null;
};

/** Espelha AgendamentoGrade de backend/src/services/agendaGrade.ts. */
export type AgendamentoGrade = {
  id: number;
  data: string;
  hora: string;
  hora_fim: string;
  duracao_minutos: number;
  status: string;
  medico_id: number;
  paciente_id: number;
  paciente_nome: string;
  paciente_telefone: string | null;
  paciente_data_nasc: string | null;
  agendamento_tipo_id: number | null;
  tipo_atendimento: TipoAtendimento;
  eh_retorno: 0 | 1;
  eh_encaixe: 0 | 1;
  convenio_id: number;
  convenio_nome: string | null;
  observacao_agenda: string | null;
  confirmacao_enviada: 0 | 1;
  confirmacao_respondida: 0 | 1;
  /** Última resposta do paciente no WhatsApp (nunca cancela sozinha). */
  whatsapp_ultima_resposta?: string | null;
  whatsapp_resposta_tipo?: "confirmou" | "recusou" | "outra" | null;
  whatsapp_resposta_em?: string | null;
  total_previsto_centavos: number;
  conta_id: number | null;
  conta_status: string | null;
  procedimentos: ProcedimentoCard[];
};

export type Grade = {
  de: string;
  ate: string;
  faixa: { inicio: string; fim: string };
  horario_padrao: HorarioPadrao;
  medicos: (MedicoAgenda & { expediente: unknown[] })[];
  tipos: AgendamentoTipo[];
  agendamentos: AgendamentoGrade[];
  bloqueios: Bloqueio[];
};

export type AvisosAgenda = {
  sobreposicao: { id: number; paciente_nome: string; hora: string; hora_fim: string }[];
  fora_expediente: boolean;
  bloqueios: Bloqueio[];
};

/** Corpo do POST /agendamentos (contrato U5 + campos opcionais da Agenda Nova). */
export type NovoAgendamento = {
  paciente_id: number;
  medico_id: number;
  data: string;
  hora: string;
  hora_fim?: string;
  convenio_id: number;
  procedimento_ids: number[];
  observacao_agenda?: string;
  eh_encaixe?: boolean;
  /** confirmações reenviadas após o 409 correspondente */
  ignorar_aviso_retorno?: boolean;
  confirmar_retorno?: boolean;
  confirmar_dia_especial?: boolean;
  ignorar_bloqueio?: boolean;
};

export type Previa = {
  itens: { procedimento_id: number; valor_centavos: number }[];
  total_centavos: number;
  duracao_sugerida: number;
};

const json = (method: string, body: unknown): RequestInit => ({
  method,
  body: JSON.stringify(body),
});

export const agendaNovaApi = {
  /** Semana/dia de UM médico (o backend força o próprio médico quando o perfil é médico). */
  grade: (de: string, ate: string, medicoId?: number) =>
    request<Grade>(`/agendamentos/grade?de=${de}&ate=${ate}${medicoId ? `&medico_ids=${medicoId}` : ""}`),

  /** Valor total no convênio + duração sugerida dos procedimentos escolhidos. */
  previa: (convenioId: number | null, procedimentoIds: number[]) =>
    request<Previa>(
      `/agendamentos/previa?convenio_id=${convenioId ?? 0}&procedimento_ids=${procedimentoIds.join(",")}`,
    ),

  agendar: (body: NovoAgendamento) =>
    request<{ id: number; avisos?: AvisosAgenda }>("/agendamentos", json("POST", body)),

  bloquear: (body: {
    medico_id: number | null;
    data_inicio: string;
    data_fim: string;
    hora_inicio: string;
    hora_fim: string;
    motivo?: string | null;
  }) =>
    request<{ bloqueio: Bloqueio; agendamentos_afetados: number }>(
      "/agenda-config/bloqueios",
      json("POST", body),
    ),

  /** Remarcar: data, hora, médico e/ou fim (A2). Confirmações reenviadas após 409. */
  mover: (
    id: number,
    body: {
      data: string;
      hora: string;
      medico_id?: number;
      hora_fim?: string;
      ignorar_bloqueio?: boolean;
      confirmar_retorno?: boolean;
      confirmar_dia_especial?: boolean;
    },
  ) => request<{ id: number; confirmacao_zerada: boolean; avisos: AvisosAgenda }>(`/agendamentos/${id}/mover`, json("POST", body)),

  /** Troca data/hora/médico entre dois agendamentos (cada um mantém a duração). */
  trocar: (id: number, outroId: number, flags: { ignorar_bloqueio?: boolean; confirmar_retorno?: boolean; confirmar_dia_especial?: boolean } = {}) =>
    request<unknown>(`/agendamentos/${id}/trocar`, json("POST", { outro_id: outroId, ...flags })),

  /** Comentário (e tipo) do agendamento. */
  alterarAgenda: (id: number, body: { observacao_agenda?: string | null }) =>
    request<unknown>(`/agendamentos/${id}/agenda`, json("PATCH", body)),

  /** Prontuário/ASO ligados ao horário. */
  vinculos: (id: number) =>
    request<{ prontuario_id: number | null; admissional_id: number | null }>(`/agendamentos/${id}/vinculos`),

  /** Remove o bloqueio inteiro (todo o período dele). */
  desbloquear: (bloqueioId: number) =>
    request<{ ok: true }>(`/agenda-config/bloqueios/${bloqueioId}`, { method: "DELETE" }),

  /** Médicos ativos para o seletor do topo. */
  medicos: () => request<MedicoAgenda[]>("/agenda-config/medicos"),

  /** Horário padrão único da agenda (botão ⚙). */
  horarioPadrao: () => request<HorarioPadrao>("/agenda-config/horario-padrao"),
  horarioPadraoSalvar: (h: HorarioPadrao) =>
    request<HorarioPadrao>("/agenda-config/horario-padrao", json("PUT", h)),

  bloqueios: (de: string, ate: string, medicoIds?: number[]) =>
    request<Bloqueio[]>(
      `/agenda-config/bloqueios?de=${de}&ate=${ate}${medicoIds?.length ? `&medico_ids=${medicoIds.join(",")}` : ""}`,
    ),
};
