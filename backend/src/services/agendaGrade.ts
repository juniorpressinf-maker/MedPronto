/**
 * Agenda Nova — grade (semana/dia), horários vagos, avisos, tipo do
 * agendamento, remarcar (mover) e trocar dois agendamentos de lugar.
 *
 * Regras de remarcação (ver docs/PROJETO_AGENDA_NOVA.md, A2/A4d):
 *   - só horário em 'agendado', sem conta aberta e sem prontuário/ASO;
 *   - retorno continua com o mesmo médico e dentro do prazo;
 *   - ficha/modelo ASO revalidados se o médico mudar;
 *   - bloqueio → 409 'horario_bloqueado' (a tela pode confirmar e reenviar com ignorar_bloqueio);
 *   - sobreposição e fora do expediente → só aviso;
 *   - mudou data, hora ou médico → confirmação do WhatsApp zerada (será reenviada);
 *   - concorrência otimista: grava só se o horário ainda estiver como foi lido.
 */
import type { Database } from "better-sqlite3";
import { getDb } from "../db/index.js";
import {
  anexarProcedimentosAgendamentos,
  type AgendamentoProcedimentoApi,
} from "./agendamentoAtendimento.js";
import {
  type AgendamentoTipo,
  type Bloqueio,
  type ConfigMedico,
  type HorarioPadrao,
  listarBloqueios,
  listarConfigMedicos,
  listarTipos,
  obterHorarioPadrao,
  obterTipo,
  sqlMinutos,
  type TipoAtendimento,
} from "./agendaConfig.js";
import { AgendaErro } from "./agendaErro.js";
import { nomeFeriadoBr } from "../lib/diasUteis.js";
import {
  agoraLocal,
  dataValida,
  diaSemana,
  diasNoPeriodo,
  horaFim,
  horaParaMinutos,
  horaValida,
  intervalosSeCruzam,
  listarDatas,
  MINUTOS_DIA,
  minutosParaHora,
} from "./agendaHorario.js";
import { assertFichaPermitida, FichaProntuarioError } from "./fichaProntuario.js";
import { assertRetornoAgendavel } from "./retornoAgenda.js";

export const MAX_DIAS_GRADE = 42;
export const MAX_DIAS_VAGOS = 31;
const COR_SEM_CONFIG = "#64748B";
const STATUS_INATIVOS = ["cancelado", "nao_compareceu"] as const;
const SQL_STATUS_ATIVO = `a.status NOT IN ('cancelado', 'nao_compareceu')`;

export type UsuarioAgenda = { id: number; perfil: string };

function assertPeriodo(de: string, ate: string, maxDias: number): void {
  if (!dataValida(de) || !dataValida(ate)) {
    throw new AgendaErro("Informe de e ate no formato AAAA-MM-DD");
  }
  if (ate < de) throw new AgendaErro("Data final antes da inicial");
  if (diasNoPeriodo(de, ate) > maxDias) {
    throw new AgendaErro(`Período máximo de ${maxDias} dias`);
  }
}

// ---------------------------------------------------------------------------
// Grade
// ---------------------------------------------------------------------------

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
  whatsapp_ultima_resposta: string | null;
  whatsapp_resposta_tipo: "confirmou" | "recusou" | "outra" | null;
  whatsapp_resposta_em: string | null;
  total_previsto_centavos: number;
  conta_id: number | null;
  conta_status: string | null;
  procedimentos: AgendamentoProcedimentoApi[];
};

export type Grade = {
  de: string;
  ate: string;
  /** Faixa de horas a desenhar: horário padrão ∪ expedientes ∪ agendamentos (nada fica escondido). */
  faixa: { inicio: string; fim: string };
  /** Horário padrão único da agenda (botão ⚙). intervalo = altura das linhas da grade. */
  horario_padrao: HorarioPadrao;
  medicos: ConfigMedico[];
  tipos: AgendamentoTipo[];
  agendamentos: AgendamentoGrade[];
  bloqueios: Bloqueio[];
};

export function carregarGrade(
  filtro: { de: string; ate: string; medicoIds?: number[]; incluirInativos?: boolean },
  db: Database = getDb(),
): Grade {
  assertPeriodo(filtro.de, filtro.ate, MAX_DIAS_GRADE);
  const medicoIds = filtro.medicoIds?.length ? filtro.medicoIds : undefined;

  const where = [`a.data BETWEEN ? AND ?`];
  const params: unknown[] = [filtro.de, filtro.ate];
  if (medicoIds) {
    where.push(`a.medico_id IN (${medicoIds.map(() => "?").join(",")})`);
    params.push(...medicoIds);
  }
  if (!filtro.incluirInativos) where.push(SQL_STATUS_ATIVO);

  const linhas = db
    .prepare(
      `SELECT a.id, a.data, a.hora, a.duracao_minutos, a.status, a.medico_id,
              a.paciente_id, p.nome AS paciente_nome, p.telefone AS paciente_telefone,
              p.data_nasc AS paciente_data_nasc,
              a.agendamento_tipo_id, a.tipo_atendimento, a.eh_retorno, a.eh_encaixe,
              a.convenio_id, cv.nome AS convenio_nome, a.observacao_agenda,
              a.confirmacao_enviada, a.confirmacao_respondida,
              a.whatsapp_ultima_resposta, a.whatsapp_resposta_tipo, a.whatsapp_resposta_em,
              COALESCE((
                SELECT SUM(pp.valor_centavos)
                FROM agendamento_procedimentos ap
                JOIN procedimento_precos pp
                  ON pp.procedimento_id = ap.procedimento_id AND pp.convenio_id = a.convenio_id
                WHERE ap.agendamento_id = a.id
              ), 0) AS total_previsto_centavos,
              c.id AS conta_id, c.status AS conta_status
       FROM agendamentos a
       JOIN pacientes p ON p.id = a.paciente_id
       LEFT JOIN convenios cv ON cv.id = a.convenio_id
       LEFT JOIN contas_atendimento c ON c.agendamento_id = a.id AND c.status != 'cancelada'
       WHERE ${where.join(" AND ")}
       ORDER BY a.data, a.hora, a.eh_encaixe, a.id`,
    )
    .all(...params) as Omit<AgendamentoGrade, "hora_fim" | "procedimentos">[];

  const agendamentos = anexarProcedimentosAgendamentos(
    linhas.map((r) => ({ ...r, hora_fim: horaFim(r.hora, r.duracao_minutos) ?? "24:00" })),
    db,
  );

  const medicos = medicosDaGrade(medicoIds, agendamentos, db);
  const horarioPadrao = obterHorarioPadrao(db);
  return {
    de: filtro.de,
    ate: filtro.ate,
    faixa: calcularFaixa(horarioPadrao, medicos, agendamentos),
    horario_padrao: horarioPadrao,
    medicos,
    tipos: listarTipos({ incluirInativos: true }, db), // inativos: cards antigos ainda os usam
    agendamentos,
    bloqueios: listarBloqueios({ de: filtro.de, ate: filtro.ate, medicoIds }, db),
  };
}

/**
 * Médicos ativos (ou os filtrados) + quem aparece nos agendamentos do período,
 * mesmo inativo ou com perfil admin (o POST aceita admin como médico).
 * Assim nenhum card fica sem nome/cor.
 */
function medicosDaGrade(
  medicoIds: number[] | undefined,
  agendamentos: { medico_id: number }[],
  db: Database,
): ConfigMedico[] {
  const lista = listarConfigMedicos({ medicoIds }, db);
  const conhecidos = new Set(lista.map((m) => m.medico_id));
  const faltando = [...new Set(agendamentos.map((a) => a.medico_id))].filter(
    (id) => !conhecidos.has(id),
  );
  if (faltando.length === 0) return lista;

  const extras = listarConfigMedicos({ medicoIds: faltando, incluirInativos: true }, db);
  for (const m of extras) conhecidos.add(m.medico_id);
  const naoMedicos = db
    .prepare(
      `SELECT id AS medico_id, nome, ativo FROM usuarios
       WHERE id IN (${faltando.map(() => "?").join(",")})`,
    )
    .all(...faltando) as { medico_id: number; nome: string; ativo: 0 | 1 }[];
  for (const u of naoMedicos) {
    if (conhecidos.has(u.medico_id)) continue;
    extras.push({ ...u, cor: COR_SEM_CONFIG, intervalo_minutos: 30, modo: "chegada", expediente: [] });
  }
  return [...lista, ...extras].sort((x, y) => x.nome.localeCompare(y.nome, "pt-BR"));
}

function calcularFaixa(
  padrao: HorarioPadrao,
  medicos: ConfigMedico[],
  agendamentos: { hora: string; hora_fim: string }[],
): { inicio: string; fim: string } {
  let ini = horaParaMinutos(padrao.inicio);
  let fim = horaParaMinutos(padrao.fim);
  for (const m of medicos) {
    for (const t of m.expediente) {
      ini = Math.min(ini, horaParaMinutos(t.inicio));
      fim = Math.max(fim, horaParaMinutos(t.fim));
    }
  }
  // Nada pode ficar escondido fora da faixa.
  for (const a of agendamentos) {
    ini = Math.min(ini, horaParaMinutos(a.hora));
    fim = Math.max(fim, horaParaMinutos(a.hora_fim));
  }
  const inicioHora = Math.floor(ini / 60) * 60;
  const fimHora = Math.min(MINUTOS_DIA, Math.ceil(fim / 60) * 60);
  return { inicio: minutosParaHora(inicioHora), fim: minutosParaHora(fimHora) };
}

// ---------------------------------------------------------------------------
// Avisos (sobreposição, fora do expediente, bloqueio)
// ---------------------------------------------------------------------------

export type Avisos = {
  sobreposicao: { id: number; paciente_nome: string; hora: string; hora_fim: string }[];
  fora_expediente: boolean;
  bloqueios: Bloqueio[];
};

export function calcularAvisos(
  alvo: { medico_id: number; data: string; hora: string; duracao_minutos: number; ignorarIds?: number[] },
  db: Database = getDb(),
): Avisos {
  const ini = horaParaMinutos(alvo.hora);
  const fim = ini + alvo.duracao_minutos;
  const ignorar = alvo.ignorarIds?.length ? alvo.ignorarIds : [0];

  const sobreposicao = (
    db
      .prepare(
        `SELECT a.id, p.nome AS paciente_nome, a.hora, a.duracao_minutos
         FROM agendamentos a JOIN pacientes p ON p.id = a.paciente_id
         WHERE a.medico_id = ? AND a.data = ? AND ${SQL_STATUS_ATIVO}
           AND a.id NOT IN (${ignorar.map(() => "?").join(",")})
           AND ${sqlMinutos("a.hora")} < ?
           AND ? < ${sqlMinutos("a.hora")} + a.duracao_minutos
         ORDER BY a.hora, a.id`,
      )
      .all(alvo.medico_id, alvo.data, ...ignorar, fim, ini) as {
      id: number;
      paciente_nome: string;
      hora: string;
      duracao_minutos: number;
    }[]
  ).map((r) => ({
    id: r.id,
    paciente_nome: r.paciente_nome,
    hora: r.hora,
    hora_fim: horaFim(r.hora, r.duracao_minutos) ?? "24:00",
  }));

  const [cfg] = listarConfigMedicos({ medicoIds: [alvo.medico_id], incluirInativos: true }, db);
  let foraExpediente = false;
  if (cfg && cfg.modo === "horario") {
    const dia = diaSemana(alvo.data);
    foraExpediente = !cfg.expediente.some(
      (t) =>
        t.dia_semana === dia &&
        horaParaMinutos(t.inicio) <= ini &&
        fim <= horaParaMinutos(t.fim),
    );
  }

  const bloqueios = listarBloqueios(
    { de: alvo.data, ate: alvo.data, medicoIds: [alvo.medico_id] },
    db,
  ).filter((b) =>
    intervalosSeCruzam(ini, fim, horaParaMinutos(b.hora_inicio), horaParaMinutos(b.hora_fim)),
  );

  return { sobreposicao, fora_expediente: foraExpediente, bloqueios };
}

// ---------------------------------------------------------------------------
// Horários vagos
// ---------------------------------------------------------------------------

export type Vagos = {
  medico_id: number;
  modo: "horario" | "chegada";
  intervalo_minutos: number;
  /** true quando o médico não tem expediente cadastrado (não há como calcular). */
  sem_expediente: boolean;
  vagos: { data: string; hora: string; hora_fim: string }[];
};

export function listarVagos(
  filtro: { de: string; ate: string; medicoId: number },
  db: Database = getDb(),
): Vagos {
  assertPeriodo(filtro.de, filtro.ate, MAX_DIAS_VAGOS);
  const [cfg] = listarConfigMedicos({ medicoIds: [filtro.medicoId] }, db);
  if (!cfg) throw new AgendaErro("Médico não encontrado ou inativo", 404, "nao_encontrado");

  const base = {
    medico_id: cfg.medico_id,
    modo: cfg.modo,
    intervalo_minutos: cfg.intervalo_minutos,
    sem_expediente: cfg.expediente.length === 0,
  };
  if (base.sem_expediente) return { ...base, vagos: [] };

  const ocupados = db
    .prepare(
      `SELECT a.data, a.hora, a.duracao_minutos FROM agendamentos a
       WHERE a.medico_id = ? AND a.data BETWEEN ? AND ? AND ${SQL_STATUS_ATIVO}`,
    )
    .all(filtro.medicoId, filtro.de, filtro.ate) as {
    data: string;
    hora: string;
    duracao_minutos: number;
  }[];
  const bloqueios = listarBloqueios(
    { de: filtro.de, ate: filtro.ate, medicoIds: [filtro.medicoId] },
    db,
  );
  const agora = agoraLocal();
  const passo = cfg.intervalo_minutos;
  const vagos: Vagos["vagos"] = [];

  for (const data of listarDatas(filtro.de, filtro.ate)) {
    if (data < agora.data) continue;
    const dia = diaSemana(data);
    const ocupadosDia = ocupados
      .filter((o) => o.data === data)
      .map((o) => {
        const i = horaParaMinutos(o.hora);
        return [i, i + o.duracao_minutos] as const;
      });
    const bloqueiosDia = bloqueios
      .filter((b) => b.data_inicio <= data && data <= b.data_fim)
      .map((b) => [horaParaMinutos(b.hora_inicio), horaParaMinutos(b.hora_fim)] as const);

    for (const t of cfg.expediente.filter((e) => e.dia_semana === dia)) {
      const fimTurno = horaParaMinutos(t.fim);
      for (let ini = horaParaMinutos(t.inicio); ini + passo <= fimTurno; ini += passo) {
        const fim = ini + passo;
        if (data === agora.data && ini < agora.minutos) continue;
        const livre =
          !ocupadosDia.some(([a, b]) => intervalosSeCruzam(ini, fim, a, b)) &&
          !bloqueiosDia.some(([a, b]) => intervalosSeCruzam(ini, fim, a, b));
        if (livre) vagos.push({ data, hora: minutosParaHora(ini), hora_fim: minutosParaHora(fim) });
      }
    }
  }
  return { ...base, vagos };
}

// ---------------------------------------------------------------------------
// Tipo do agendamento e duração sugerida
// ---------------------------------------------------------------------------

/**
 * O significado clínico (tipo_atendimento, retorno) vem dos PROCEDIMENTOS (regra U5).
 * O tipo de agendamento é a categoria da agenda e tem de ser compatível com ele.
 * Sem tipo informado → null (o trigger da 046 infere). eh_encaixe vem do tipo.
 */
export function resolverTipoAgendamento(
  tipoId: number | null | undefined,
  derivado: { tipo_atendimento: TipoAtendimento; eh_retorno: boolean },
  ehEncaixeInformado: boolean | undefined,
  db: Database = getDb(),
): { agendamento_tipo_id: number | null; eh_encaixe: boolean } {
  if (tipoId == null) {
    return { agendamento_tipo_id: null, eh_encaixe: ehEncaixeInformado ?? false };
  }
  const tipo = obterTipo(tipoId, db);
  if (!tipo || !tipo.ativo) {
    throw new AgendaErro("Tipo de agendamento inexistente ou inativo");
  }
  assertTipoCompativel(tipo, derivado);
  if (ehEncaixeInformado !== undefined && ehEncaixeInformado !== (tipo.eh_encaixe === 1)) {
    throw new AgendaErro(
      `Encaixe é definido pelo tipo de agendamento ("${tipo.nome}"). Escolha o tipo Encaixe.`,
      400,
      "tipo_incompativel",
    );
  }
  return { agendamento_tipo_id: tipo.id, eh_encaixe: tipo.eh_encaixe === 1 };
}

const ROTULO_ATENDIMENTO: Record<TipoAtendimento, string> = {
  consulta: "procedimento de consulta",
  admissional: "procedimento de ASO",
  exame: "somente exames/procedimentos (sem consulta nem ASO)",
};

export function assertTipoCompativel(
  tipo: AgendamentoTipo,
  derivado: { tipo_atendimento: TipoAtendimento; eh_retorno: boolean },
): void {
  if (tipo.tipo_atendimento !== derivado.tipo_atendimento) {
    throw new AgendaErro(
      `O tipo "${tipo.nome}" exige ${ROTULO_ATENDIMENTO[tipo.tipo_atendimento]}.`,
      400,
      "tipo_incompativel",
    );
  }
  if ((tipo.eh_retorno === 1) !== derivado.eh_retorno) {
    throw new AgendaErro(
      tipo.eh_retorno === 1
        ? `O tipo "${tipo.nome}" exige o procedimento Consulta retorno.`
        : `Com o procedimento Consulta retorno, use o tipo Retorno (e não "${tipo.nome}").`,
      400,
      "tipo_incompativel",
    );
  }
}

/**
 * Duração sugerida (decisão 13/11): soma das durações dos procedimentos →
 * intervalo do horário padrão da agenda. Na marcação o usuário pode mudar.
 */
export function duracaoSugerida(procedimentoIds: number[], db: Database = getDb()): number {
  if (procedimentoIds.length) {
    const soma = db
      .prepare(
        `SELECT SUM(duracao_minutos) FROM procedimentos
         WHERE id IN (${procedimentoIds.map(() => "?").join(",")}) AND duracao_minutos IS NOT NULL`,
      )
      .pluck()
      .get(...procedimentoIds) as number | null;
    if (soma) return Math.min(soma, 480);
  }
  return obterHorarioPadrao(db).intervalo_minutos;
}

/** hora_fim → duração. Valida que o fim fica depois do início e no mesmo dia. */
export function duracaoPorHoraFim(hora: string, horaFimStr: string): number {
  const d = horaParaMinutos(horaFimStr) - horaParaMinutos(hora);
  if (d < 5) throw new AgendaErro("O fim precisa ser pelo menos 5 minutos depois do início");
  if (d > 480) throw new AgendaErro("Duração máxima de 8 horas");
  return d;
}

// ---------------------------------------------------------------------------
// Remarcar (mover) e trocar
// ---------------------------------------------------------------------------

type AgendamentoBase = {
  id: number;
  paciente_id: number;
  paciente_nome: string;
  medico_id: number;
  data: string;
  hora: string;
  duracao_minutos: number;
  status: string;
  tipo_atendimento: TipoAtendimento;
  eh_retorno: 0 | 1;
  ficha_template_id: number | null;
  aso_template_id: number | null;
};

type Slot = { data: string; hora: string; medico_id: number; duracao_minutos: number };

function carregarBase(id: number, db: Database): AgendamentoBase {
  const ag = db
    .prepare(
      `SELECT a.id, a.paciente_id, p.nome AS paciente_nome, a.medico_id, a.data, a.hora,
              a.duracao_minutos, a.status, a.tipo_atendimento, a.eh_retorno,
              a.ficha_template_id, a.aso_template_id
       FROM agendamentos a JOIN pacientes p ON p.id = a.paciente_id
       WHERE a.id = ?`,
    )
    .get(id) as AgendamentoBase | undefined;
  if (!ag) throw new AgendaErro("Agendamento não encontrado", 404, "nao_encontrado");
  return ag;
}

function assertPodeMexer(ag: AgendamentoBase, usuario: UsuarioAgenda): void {
  if (usuario.perfil === "medico" && ag.medico_id !== usuario.id) {
    throw new AgendaErro("Agendamento de outro médico", 403, "sem_permissao");
  }
}

function assertRemarcavel(ag: AgendamentoBase, db: Database): void {
  if (ag.status !== "agendado") {
    const motivo = (STATUS_INATIVOS as readonly string[]).includes(ag.status)
      ? "cancelado ou com falta — reative antes de remarcar"
      : "paciente já chegou ou foi atendido";
    throw new AgendaErro(
      `Só é possível remarcar horário em "agendado" (${ag.paciente_nome}: ${motivo}).`,
      409,
      "nao_remarcavel",
    );
  }
  const vinculo = db
    .prepare(
      `SELECT
         EXISTS (SELECT 1 FROM contas_atendimento WHERE agendamento_id = ? AND status != 'cancelada') AS conta,
         EXISTS (SELECT 1 FROM prontuarios WHERE agendamento_id = ?) AS prontuario,
         EXISTS (SELECT 1 FROM admissionais WHERE agendamento_id = ? AND status != 'cancelado') AS aso`,
    )
    .get(ag.id, ag.id, ag.id) as { conta: number; prontuario: number; aso: number };
  if (vinculo.conta || vinculo.prontuario || vinculo.aso) {
    throw new AgendaErro(
      `Horário de ${ag.paciente_nome} já tem conta, prontuário ou ASO e não pode ser remarcado.`,
      409,
      "nao_remarcavel",
    );
  }
}

/** Confirmações que a tela pede ao usuário e reenvia (409 → "fazer mesmo assim?"). */
export type ConfirmacoesRemarcar = {
  /** 409 'horario_bloqueado' */
  ignorarBloqueio: boolean;
  /** 409 'retorno_confirmar' (sem consulta prévia / prazo vencido) */
  confirmarRetorno: boolean;
  /** 409 'dia_especial' (sábado, domingo, feriado, fora do expediente) */
  confirmarDiaEspecial: boolean;
};

function confirmacoes(o: Partial<ConfirmacoesRemarcar>): ConfirmacoesRemarcar {
  return {
    ignorarBloqueio: !!o.ignorarBloqueio,
    confirmarRetorno: !!o.confirmarRetorno,
    confirmarDiaEspecial: !!o.confirmarDiaEspecial,
  };
}

function assertDestinoValido(
  ag: AgendamentoBase,
  destino: Slot,
  usuario: UsuarioAgenda,
  flags: ConfirmacoesRemarcar,
  ignorarIds: number[],
  db: Database,
): void {
  if (!dataValida(destino.data)) throw new AgendaErro("Data inválida");
  if (!horaValida(destino.hora)) throw new AgendaErro("Hora inválida");
  if (horaFim(destino.hora, destino.duracao_minutos) === null) {
    throw new AgendaErro("O horário termina depois da meia-noite");
  }
  if (destino.data < agoraLocal().data) {
    throw new AgendaErro("Não é possível remarcar para uma data que já passou");
  }

  const mudaMedico = destino.medico_id !== ag.medico_id;
  if (mudaMedico) {
    if (usuario.perfil === "medico") {
      throw new AgendaErro("Médico não pode passar o agendamento para outro médico", 403, "sem_permissao");
    }
    const medico = db
      .prepare(`SELECT id FROM usuarios WHERE id = ? AND perfil IN ('medico', 'admin') AND ativo = 1`)
      .get(destino.medico_id);
    if (!medico) throw new AgendaErro("Médico de destino não encontrado ou inativo");

    try {
      if (ag.ficha_template_id != null) {
        assertFichaPermitida(destino.medico_id, ag.ficha_template_id, "prontuario");
      }
      if (ag.aso_template_id != null) {
        assertFichaPermitida(destino.medico_id, ag.aso_template_id, "aso");
      }
    } catch (e) {
      if (e instanceof FichaProntuarioError) {
        throw new AgendaErro(`Ficha do horário não vale para o médico de destino: ${e.message}`);
      }
      throw e;
    }
  }

  // Mesma regra do POST (services/retornoAgenda.ts): outro médico → recusa;
  // sem consulta prévia / prazo vencido → 409 retorno_confirmar.
  if (ag.eh_retorno === 1 && ag.tipo_atendimento === "consulta" &&
      (mudaMedico || destino.data !== ag.data)) {
    assertRetornoAgendavel(
      {
        paciente_id: ag.paciente_id,
        paciente_nome: ag.paciente_nome,
        medico_id: destino.medico_id,
        data: destino.data,
        confirmado: flags.confirmarRetorno,
      },
      db,
    );
  }

  // Mesmo paciente + médico + dia + hora (índice 036).
  const dup = db
    .prepare(
      `SELECT 1 FROM agendamentos a
       WHERE a.paciente_id = ? AND a.medico_id = ? AND a.data = ? AND a.hora = ?
         AND ${SQL_STATUS_ATIVO}
         AND a.id NOT IN (${ignorarIds.map(() => "?").join(",")})
       LIMIT 1`,
    )
    .get(ag.paciente_id, destino.medico_id, destino.data, destino.hora, ...ignorarIds);
  if (dup) {
    throw new AgendaErro(
      `${ag.paciente_nome} já está agendado com este médico neste horário.`,
      409,
      "conflito",
    );
  }

  if (!flags.ignorarBloqueio) {
    const { bloqueios } = calcularAvisos({ ...destino, ignorarIds }, db);
    if (bloqueios.length) {
      throw new AgendaErro("Horário bloqueado na agenda", 409, "horario_bloqueado", { bloqueios });
    }
  }

  // Só pergunta se o horário mudou de fato (mover para o mesmo lugar não incomoda).
  if (destino.data !== ag.data || destino.hora !== ag.hora || mudaMedico) {
    assertDiaEspecialConfirmado({ ...destino, ignorarIds }, flags.confirmarDiaEspecial, db);
  }
}

const SQL_GRAVAR_SLOT = `
  UPDATE agendamentos
  SET data = @data, hora = @hora, medico_id = @medico_id, duracao_minutos = @duracao_minutos,
      confirmacao_enviada = CASE WHEN @reset = 1 THEN 0 ELSE confirmacao_enviada END,
      confirmacao_respondida = CASE WHEN @reset = 1 THEN 0 ELSE confirmacao_respondida END,
      whatsapp_preparo_pendente = CASE WHEN @reset = 1 THEN 0 ELSE whatsapp_preparo_pendente END,
      whatsapp_ultima_resposta = CASE WHEN @reset = 1 THEN NULL ELSE whatsapp_ultima_resposta END,
      whatsapp_resposta_tipo = CASE WHEN @reset = 1 THEN NULL ELSE whatsapp_resposta_tipo END,
      whatsapp_resposta_em = CASE WHEN @reset = 1 THEN NULL ELSE whatsapp_resposta_em END,
      updated_at = datetime('now', 'localtime')
  WHERE id = @id AND status = 'agendado'
    AND data = @old_data AND hora = @old_hora AND medico_id = @old_medico_id`;

function gravarSlot(ag: AgendamentoBase, destino: Slot, db: Database, horaLida = ag.hora): void {
  const reset =
    destino.data !== ag.data || destino.hora !== ag.hora || destino.medico_id !== ag.medico_id;
  const r = db.prepare(SQL_GRAVAR_SLOT).run({
    ...destino,
    id: ag.id,
    reset: reset ? 1 : 0,
    old_data: ag.data,
    old_hora: horaLida,
    old_medico_id: ag.medico_id,
  });
  if (r.changes !== 1) {
    throw new AgendaErro(
      "O agendamento foi alterado por outra pessoa — recarregue a agenda e tente de novo.",
      409,
      "conflito",
    );
  }
}

export type ResultadoRemarcar = {
  id: number;
  de: Slot;
  para: Slot;
  confirmacao_zerada: boolean;
  avisos: Avisos;
};

export function remarcarAgendamento(
  id: number,
  pedido: { data: string; hora: string; medico_id?: number; duracao_minutos?: number },
  opts: { usuario: UsuarioAgenda } & Partial<ConfirmacoesRemarcar>,
  db: Database = getDb(),
): ResultadoRemarcar {
  return db.transaction(() => {
    const ag = carregarBase(id, db);
    assertPodeMexer(ag, opts.usuario);
    assertRemarcavel(ag, db);

    const de: Slot = { data: ag.data, hora: ag.hora, medico_id: ag.medico_id, duracao_minutos: ag.duracao_minutos };
    const para: Slot = {
      data: pedido.data,
      hora: pedido.hora,
      medico_id: pedido.medico_id ?? ag.medico_id,
      duracao_minutos: pedido.duracao_minutos ?? ag.duracao_minutos,
    };
    if (
      para.data === de.data && para.hora === de.hora &&
      para.medico_id === de.medico_id && para.duracao_minutos === de.duracao_minutos
    ) {
      throw new AgendaErro("Nada mudou: o agendamento já está nesse horário");
    }
    assertDestinoValido(ag, para, opts.usuario, confirmacoes(opts), [ag.id], db);
    gravarSlot(ag, para, db);

    return {
      id,
      de,
      para,
      confirmacao_zerada: para.data !== de.data || para.hora !== de.hora || para.medico_id !== de.medico_id,
      avisos: calcularAvisos({ ...para, ignorarIds: [id] }, db),
    };
  })();
}

export type ResultadoTrocar = { a: ResultadoRemarcar; b: ResultadoRemarcar };

/** Troca data, hora e médico entre dois agendamentos. Cada um mantém sua duração. */
export function trocarAgendamentos(
  idA: number,
  idB: number,
  opts: { usuario: UsuarioAgenda } & Partial<ConfirmacoesRemarcar>,
  db: Database = getDb(),
): ResultadoTrocar {
  if (idA === idB) throw new AgendaErro("Escolha dois agendamentos diferentes");
  return db.transaction(() => {
    const a = carregarBase(idA, db);
    const b = carregarBase(idB, db);
    for (const ag of [a, b]) {
      assertPodeMexer(ag, opts.usuario);
      assertRemarcavel(ag, db);
    }
    if (a.data === b.data && a.hora === b.hora && a.medico_id === b.medico_id) {
      throw new AgendaErro("Os dois agendamentos já estão no mesmo horário");
    }

    const slotA: Slot = { data: a.data, hora: a.hora, medico_id: a.medico_id, duracao_minutos: a.duracao_minutos };
    const slotB: Slot = { data: b.data, hora: b.hora, medico_id: b.medico_id, duracao_minutos: b.duracao_minutos };
    const paraA: Slot = { ...slotB, duracao_minutos: a.duracao_minutos };
    const paraB: Slot = { ...slotA, duracao_minutos: b.duracao_minutos };
    const ambos = [a.id, b.id];
    assertDestinoValido(a, paraA, opts.usuario, confirmacoes(opts), ambos, db);
    assertDestinoValido(b, paraB, opts.usuario, confirmacoes(opts), ambos, db);

    // Hora provisória em A evita colisão momentânea no índice 036
    // quando o paciente e o médico são os mesmos nos dois horários.
    const provisoria = db
      .prepare(
        `UPDATE agendamentos SET hora = '--:--'
         WHERE id = ? AND status = 'agendado' AND data = ? AND hora = ? AND medico_id = ?`,
      )
      .run(a.id, a.data, a.hora, a.medico_id);
    if (provisoria.changes !== 1) {
      throw new AgendaErro(
        "O agendamento foi alterado por outra pessoa — recarregue a agenda e tente de novo.",
        409,
        "conflito",
      );
    }
    gravarSlot(b, paraB, db);
    gravarSlot(a, paraA, db, "--:--");

    return {
      a: {
        id: a.id,
        de: slotA,
        para: paraA,
        confirmacao_zerada: true,
        avisos: calcularAvisos({ ...paraA, ignorarIds: [a.id] }, db),
      },
      b: {
        id: b.id,
        de: slotB,
        para: paraB,
        confirmacao_zerada: true,
        avisos: calcularAvisos({ ...paraB, ignorarIds: [b.id] }, db),
      },
    };
  })();
}

// ---------------------------------------------------------------------------
// Dia especial: sábado, domingo, feriado nacional ou fora do expediente
// ---------------------------------------------------------------------------

/** Motivos para avisar antes de marcar/remarcar (vazio = dia normal). */
export function motivosDiaEspecial(
  alvo: { medico_id: number; data: string; hora: string; duracao_minutos: number; ignorarIds?: number[] },
  db: Database = getDb(),
): string[] {
  const motivos: string[] = [];
  const feriado = nomeFeriadoBr(alvo.data);
  if (feriado) motivos.push(`é feriado (${feriado})`);
  const dia = diaSemana(alvo.data);
  if (dia === 6) motivos.push("é sábado");
  if (dia === 0) motivos.push("é domingo");
  if (calcularAvisos(alvo, db).fora_expediente) motivos.push("está fora do expediente do médico");
  return motivos;
}

/**
 * 409 'dia_especial' → a tela pergunta "Marcar mesmo assim?" e reenvia
 * com confirmar_dia_especial. Aviso, não bloqueio (plantão/encaixe continuam possíveis).
 */
export function assertDiaEspecialConfirmado(
  alvo: { medico_id: number; data: string; hora: string; duracao_minutos: number; ignorarIds?: number[] },
  confirmado: boolean,
  db: Database = getDb(),
): void {
  if (confirmado) return;
  const motivos = motivosDiaEspecial(alvo, db);
  if (!motivos.length) return;
  const [y, m, d] = alvo.data.split("-");
  const mensagem = `${d}/${m}/${y} às ${alvo.hora} ${motivos.join(", ")}.`;
  throw new AgendaErro(mensagem, 409, "dia_especial", { mensagem, motivos });
}
