import { Router } from "express";
import type { Request } from "express";
import { z } from "zod";
import { ASO_TITULO_CURTO } from "../admissional/labels.js";
import { usuarioTemModulo } from "../auth/modulos.js";
import { requireAuth, requireModulo } from "../auth/middleware.js";
import type { Perfil } from "../auth/users.js";
import { getDb } from "../db/index.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { logAcesso } from "../services/logAcesso.js";
import { getRetornoVigente } from "../services/retornoService.js";
import {
  assertFichaPermitida,
  camposFromTemplate,
  dadosJsonToString,
  FichaProntuarioError,
  getFichaTemplateOrThrow,
  legadoParaDadosJson,
} from "../services/fichaProntuario.js";
import { assertConsultaEditavel } from "../services/consultaEncerrada.js";
import {
  enriquecerAgendamentoComConta,
  executarContaNoCheckin,
} from "../services/cobrancaCheckin.js";
import { listarProcedimentos, listarConvenios } from "../services/cobrancaCadastros.js";
import { sugerirConvenioPaciente } from "../services/cobrancaContas.js";
import {
  AgendamentoAtendimentoError,
  anexarProcedimentosAgendamentos,
  assertContratoAgendamentoNovo,
  assertConvenioAtivo,
  assertSlotPacienteMedicoLivre,
  derivarTipoAtendimento,
  gravarProcedimentosExtras,
  horarioSoExame,
  isErroSlotPacienteMedicoDuplicado,
  listaTemConsultaRetorno,
  MSG_SLOT_PACIENTE_MEDICO_DUPLICADO,
  listarProcedimentosDoAgendamento,
  sincronizarProcedimentosAgendamento,
  validarListaProcedimentos,
} from "../services/agendamentoAtendimento.js";
import { listarHistoricoExamesClinicos } from "../services/historicoClinicoExames.js";
import { assertMedicoVinculoPaciente } from "../services/vinculosClinicos.js";
import { tentarPreparoZapAposEdicao } from "../services/whatsappService.js";

const STATUS = [
  "agendado",
  "presente",
  "em_atendimento",
  "finalizado",
  "nao_compareceu",
  "cancelado",
] as const;

type Status = (typeof STATUS)[number];

const TRANSICOES: Record<Status, Status[]> = {
  agendado: ["presente", "cancelado", "nao_compareceu"],
  presente: ["em_atendimento", "cancelado", "nao_compareceu", "agendado"],
  em_atendimento: ["finalizado", "presente"],
  finalizado: [],
  nao_compareceu: ["agendado"],
  cancelado: ["agendado"],
};

function hojeLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function podeAgenda(req: Request): boolean {
  const u = req.usuario!;
  return usuarioTemModulo(u.id, u.perfil as Perfil, "agenda");
}

function podeFilaRecepcao(req: Request): boolean {
  const u = req.usuario!;
  return usuarioTemModulo(u.id, u.perfil as Perfil, "fila_recepcao");
}

function podeFilaMedico(req: Request): boolean {
  const u = req.usuario!;
  return usuarioTemModulo(u.id, u.perfil as Perfil, "fila_medico");
}

const SQL_PRONTUARIO_ID = `(SELECT pr.id FROM prontuarios pr
  WHERE pr.agendamento_id = a.id ORDER BY pr.id DESC LIMIT 1)`;

const SQL_ADISSIONAL_ID = `(SELECT ad.id FROM admissionais ad
  WHERE ad.agendamento_id = a.id AND ad.status != 'cancelado'
  ORDER BY CASE WHEN ad.retificacao_de_id IS NULL THEN 0 ELSE 1 END, ad.id
  LIMIT 1)`;

const SQL_ADISSIONAL_STATUS = `(SELECT ad.status FROM admissionais ad
  WHERE ad.id = ${SQL_ADISSIONAL_ID})`;

const SQL_WHATSAPP_ULTIMO_STATUS = `(SELECT l.status FROM log_whatsapp l
  WHERE l.agendamento_id = a.id ORDER BY l.id DESC LIMIT 1)`;

const SQL_PROCEDIMENTO_NOME = `(SELECT pr.nome FROM agendamento_procedimentos ap
  JOIN procedimentos pr ON pr.id = ap.procedimento_id
  WHERE ap.agendamento_id = a.id
  ORDER BY ap.ordem ASC, ap.id ASC LIMIT 1)`;

function enriquecerLinha<T extends { id: number }>(
  row: T,
): T & {
  conta_id: number | null;
  conta_status: string | null;
  procedimentos: {
    id: number;
    nome: string;
    modo_clinico: string;
    ordem: number;
  }[];
} {
  return anexarProcedimentosAgendamentos([enriquecerAgendamentoComConta(row)])[0]!;
}

function enriquecerLista<T extends { id: number }>(rows: T[]) {
  return anexarProcedimentosAgendamentos(
    rows.map((r) => enriquecerAgendamentoComConta(r)),
  );
}

function getVinculosAgendamento(agendamentoId: number): {
  prontuario_id: number | null;
  admissional_id: number | null;
} {
  const row = getDb()
    .prepare(
      `SELECT
        (SELECT pr.id FROM prontuarios pr
          WHERE pr.agendamento_id = a.id ORDER BY pr.id DESC LIMIT 1) AS prontuario_id,
        (SELECT ad.id FROM admissionais ad
         WHERE ad.agendamento_id = a.id AND ad.status != 'cancelado'
         ORDER BY CASE WHEN ad.retificacao_de_id IS NULL THEN 0 ELSE 1 END, ad.id
         LIMIT 1) AS admissional_id
       FROM agendamentos a
       WHERE a.id = ?`,
    )
    .get(agendamentoId) as {
      prontuario_id: number | null;
      admissional_id: number | null;
    } | undefined;
  return {
    prontuario_id: row?.prontuario_id ?? null,
    admissional_id: row?.admissional_id ?? null,
  };
}

function podeConsultarProntuario(req: Request): boolean {
  const u = req.usuario!;
  const perfil = u.perfil as Perfil;
  return (
    usuarioTemModulo(u.id, perfil, "prontuario_ler") ||
    usuarioTemModulo(u.id, perfil, "prontuario_escrever") ||
    usuarioTemModulo(u.id, perfil, "fila_medico")
  );
}

function podeConsultarAdmissional(req: Request): boolean {
  const u = req.usuario!;
  const perfil = u.perfil as Perfil;
  return (
    usuarioTemModulo(u.id, perfil, "admissional") ||
    usuarioTemModulo(u.id, perfil, "admissional_agenda")
  );
}

export const agendamentosRouter = Router();

agendamentosRouter.use(requireAuth());

function podeFiltrarFilaTodosMedicos(req: Request): boolean {
  const u = req.usuario!;
  const perfil = u.perfil as Perfil;
  return (
    perfil === "admin" ||
    perfil === "secretaria" ||
    usuarioTemModulo(u.id, perfil, "fila_recepcao")
  );
}

agendamentosRouter.get(
  "/fila",
  asyncHandler(async (req, res) => {
    if (!podeFilaMedico(req) && !podeFilaRecepcao(req) && !podeAgenda(req)) {
      res.status(403).json({ error: "Sem permissão para fila" });
      return;
    }
    const data = String(req.query.data ?? hojeLocal()).trim();
    let medicoId = req.query.medico_id ? Number(req.query.medico_id) : null;
    if (!podeFiltrarFilaTodosMedicos(req) && req.usuario!.perfil === "medico") {
      medicoId = req.usuario!.id;
    }
    let sql = `
      SELECT a.*, p.nome AS paciente_nome, p.data_nasc AS paciente_nasc,
             p.alergias AS paciente_alergias, u.nome AS medico_nome,
             cv.nome AS convenio_nome,
             ${SQL_PRONTUARIO_ID} AS prontuario_id,
             ${SQL_ADISSIONAL_ID} AS admissional_id,
             ${SQL_ADISSIONAL_STATUS} AS admissional_status,
             ${SQL_WHATSAPP_ULTIMO_STATUS} AS whatsapp_ultimo_status,
             ${SQL_PROCEDIMENTO_NOME} AS procedimento_nome
      FROM agendamentos a
      JOIN pacientes p ON p.id = a.paciente_id
      JOIN usuarios u ON u.id = a.medico_id
      LEFT JOIN convenios cv ON cv.id = a.convenio_id
      WHERE a.data = ?`;
    const params: unknown[] = [data];
    if (medicoId) {
      sql += ` AND a.medico_id = ?`;
      params.push(medicoId);
    }
    sql += ` ORDER BY a.hora, a.id`;
    const rows = getDb().prepare(sql).all(...params) as { id: number; status: Status }[];
    const grupos: Record<string, unknown[]> = {
      agendado: [],
      presente: [],
      em_atendimento: [],
      finalizado: [],
      nao_compareceu: [],
      cancelado: [],
    };
    for (const r of rows) {
      grupos[r.status]?.push(enriquecerLinha(r));
    }
    res.json({ data, medico_id: medicoId, grupos });
  }),
);

agendamentosRouter.get(
  "/resumo",
  asyncHandler(async (req, res) => {
    if (!podeAgenda(req) && !podeFilaMedico(req) && !podeFilaRecepcao(req)) {
      res.status(403).json({ error: "Sem permissão para agenda" });
      return;
    }
    const iso = /^\d{4}-\d{2}-\d{2}$/;
    const de = String(req.query.de ?? "").trim();
    const ate = String(req.query.ate ?? "").trim();
    if (!iso.test(de) || !iso.test(ate) || ate < de) {
      res.status(400).json({ error: "Informe de e ate no formato AAAA-MM-DD" });
      return;
    }
    const t0 = Date.parse(`${de}T12:00:00`);
    const t1 = Date.parse(`${ate}T12:00:00`);
    if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 - t0 > 45 * 86400000) {
      res.status(400).json({ error: "Intervalo máximo de 45 dias" });
      return;
    }

    let medicoId: number | null = null;
    const nMed = Number(req.query.medico_id);
    if (Number.isInteger(nMed) && nMed > 0) medicoId = nMed;
    if (req.usuario!.perfil === "medico") {
      medicoId = req.usuario!.id;
    }

    const dataDia = `substr(a.data, 1, 10)`;
    let sql = `
      SELECT ${dataDia} AS data,
             COUNT(*) AS total,
             COALESCE(SUM(CASE WHEN a.status NOT IN ('cancelado', 'nao_compareceu') THEN 1 ELSE 0 END), 0) AS ativos
      FROM agendamentos a
      WHERE ${dataDia} >= ? AND ${dataDia} <= ?`;
    const params: unknown[] = [de, ate];
    if (medicoId) {
      sql += ` AND a.medico_id = ?`;
      params.push(medicoId);
    }
    sql += ` GROUP BY ${dataDia} ORDER BY 1`;
    const dias = getDb()
      .prepare(sql)
      .all(...params) as { data: string; total: number; ativos: number }[];

    const mes = String(req.query.mes ?? "").trim();
    let mesDe = de;
    let mesAte = ate;
    if (/^\d{4}-\d{2}$/.test(mes)) {
      const [y, mo] = mes.split("-").map(Number);
      const ultimo = new Date(y, mo, 0).getDate();
      const mm = String(mo).padStart(2, "0");
      mesDe = `${y}-${mm}-01`;
      mesAte = `${y}-${mm}-${String(ultimo).padStart(2, "0")}`;
    }
    const semana = String(req.query.semana ?? "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(semana)) {
      const dt = new Date(`${semana}T12:00:00`);
      if (Number.isFinite(dt.getTime())) {
        const offset = (dt.getDay() + 6) % 7;
        dt.setDate(dt.getDate() - offset);
        const y = dt.getFullYear();
        const mo = String(dt.getMonth() + 1).padStart(2, "0");
        const d = String(dt.getDate()).padStart(2, "0");
        mesDe = `${y}-${mo}-${d}`;
        const fim = new Date(dt);
        fim.setDate(fim.getDate() + 6);
        mesAte = `${fim.getFullYear()}-${String(fim.getMonth() + 1).padStart(2, "0")}-${String(fim.getDate()).padStart(2, "0")}`;
      }
    }

    const paramsMed: unknown[] = [mesDe, mesAte];
    let sqlMed = `
      SELECT a.medico_id AS medico_id,
             u.nome AS medico_nome,
             COUNT(*) AS agendamentos,
             COUNT(DISTINCT a.paciente_id) AS pacientes
      FROM agendamentos a
      JOIN usuarios u ON u.id = a.medico_id
      WHERE ${dataDia} >= ? AND ${dataDia} <= ?
        AND a.status NOT IN ('cancelado', 'nao_compareceu')`;
    if (medicoId) {
      sqlMed += ` AND a.medico_id = ?`;
      paramsMed.push(medicoId);
    }
    sqlMed += ` GROUP BY a.medico_id, u.nome ORDER BY pacientes DESC, u.nome COLLATE NOCASE`;
    const medicos = (
      getDb()
        .prepare(sqlMed)
        .all(...paramsMed) as {
          medico_id: number;
          medico_nome: string;
          agendamentos: number;
          pacientes: number;
        }[]
    ).map((row) => ({
      medico_id: Number(row.medico_id),
      medico_nome: String(row.medico_nome ?? ""),
      agendamentos: Number(row.agendamentos) || 0,
      pacientes: Number(row.pacientes) || 0,
    }));

    res.json({
      de,
      ate,
      medico_id: medicoId,
      dias: dias.map((d) => ({
        data: String(d.data).slice(0, 10),
        total: Number(d.total) || 0,
        ativos: Number(d.ativos) || 0,
      })),
      medicos,
    });
  }),
);

agendamentosRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    if (!podeAgenda(req) && !podeFilaMedico(req) && !podeFilaRecepcao(req)) {
      res.status(403).json({ error: "Sem permissão para agenda" });
      return;
    }
    const data = String(req.query.data ?? hojeLocal()).trim();
    const medicoId = req.query.medico_id
      ? Number(req.query.medico_id)
      : null;
    const status = String(req.query.status ?? "").trim();

    let sql = `
      SELECT a.*, p.nome AS paciente_nome, p.telefone AS paciente_telefone,
             p.alergias AS paciente_alergias, u.nome AS medico_nome,
             cv.nome AS convenio_nome,
             ${SQL_PRONTUARIO_ID} AS prontuario_id,
             ${SQL_ADISSIONAL_ID} AS admissional_id,
             ${SQL_ADISSIONAL_STATUS} AS admissional_status,
             ${SQL_WHATSAPP_ULTIMO_STATUS} AS whatsapp_ultimo_status,
             ${SQL_PROCEDIMENTO_NOME} AS procedimento_nome
      FROM agendamentos a
      JOIN pacientes p ON p.id = a.paciente_id
      JOIN usuarios u ON u.id = a.medico_id
      LEFT JOIN convenios cv ON cv.id = a.convenio_id
      WHERE a.data = ?`;
    const params: unknown[] = [data];

    if (medicoId) {
      sql += ` AND a.medico_id = ?`;
      params.push(medicoId);
    }
    if (status) {
      sql += ` AND a.status = ?`;
      params.push(status);
    }
    if (req.usuario!.perfil === "medico") {
      sql += ` AND a.medico_id = ?`;
      params.push(req.usuario!.id);
    }
    sql += ` ORDER BY a.hora, a.eh_encaixe, p.nome COLLATE NOCASE, a.id`;
    const rows = getDb().prepare(sql).all(...params) as { id: number }[];
    res.json(enriquecerLista(rows));
  }),
);

const createSchema = z.object({
  paciente_id: z.number().int().positive(),
  medico_id: z.number().int().positive(),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hora: z.string().regex(/^\d{2}:\d{2}$/),
  duracao_minutos: z.number().int().min(5).max(480).optional(),
  observacao_agenda: z.string().max(500).optional(),
  ignorar_aviso_retorno: z.boolean().optional(),
  checkin: z.boolean().optional(),
  ficha_template_id: z.number().int().positive().nullable().optional(),
  aso_template_id: z.number().int().positive().nullable().optional(),
  eh_encaixe: z.boolean().optional(),
  convenio_id: z.number().int().positive(),
  procedimento_ids: z.array(z.number().int().positive()).min(1),
});

const patchProcedimentosSchema = z.object({
  procedimento_ids: z.array(z.number().int().positive()).min(1),
  convenio_id: z.number().int().positive().optional(),
});

const fichaAgendamentoSchema = z.object({
  ficha_template_id: z.number().int().positive().nullable(),
});

function handleFichaError(
  e: unknown,
  res: { status: (n: number) => { json: (o: unknown) => void } },
): boolean {
  if (e instanceof FichaProntuarioError) {
    res.status(e.status).json({ error: e.message });
    return true;
  }
  return false;
}

agendamentosRouter.get(
  "/procedimentos-previstos",
  requireModulo("agenda", "fila_recepcao"),
  asyncHandler(async (_req, res) => {
    res.json({
      procedimentos: listarProcedimentos(undefined, false),
      convenios: listarConvenios(getDb(), false),
    });
  }),
);

agendamentosRouter.get(
  "/convenios",
  requireModulo("agenda", "fila_recepcao"),
  asyncHandler(async (_req, res) => {
    res.json(listarConvenios(getDb(), false));
  }),
);

agendamentosRouter.get(
  "/retorno-vigente",
  asyncHandler(async (req, res) => {
    if (
      !podeAgenda(req) &&
      !podeFilaRecepcao(req) &&
      !podeFilaMedico(req)
    ) {
      res.status(403).json({ error: "Sem permissão" });
      return;
    }
    const pacienteId = Number(req.query.paciente_id);
    if (!pacienteId) {
      res.status(400).json({ error: "paciente_id obrigatório" });
      return;
    }
    const retorno = getRetornoVigente(pacienteId);
    res.json({ vigente: Boolean(retorno), retorno });
  }),
);

agendamentosRouter.get(
  "/convenio-sugerido",
  asyncHandler(async (req, res) => {
    if (!podeAgenda(req) && !podeFilaRecepcao(req) && !podeFilaMedico(req)) {
      res.status(403).json({ error: "Sem permissão" });
      return;
    }
    const pacienteId = Number(req.query.paciente_id);
    if (!pacienteId) {
      res.status(400).json({ error: "paciente_id obrigatório" });
      return;
    }
    res.json({ convenio_id: sugerirConvenioPaciente(pacienteId) });
  }),
);

agendamentosRouter.get(
  "/paciente/:pacienteId/historico",
  requireModulo(
    "agenda",
    "fila_recepcao",
    "fila_medico",
    "pacientes",
    "prontuario_ler",
  ),
  asyncHandler(async (req, res) => {
    const pacienteId = Number(req.params.pacienteId);
    if (!Number.isInteger(pacienteId) || pacienteId <= 0) {
      res.status(400).json({ error: "Paciente inválido" });
      return;
    }
    const paciente = getDb()
      .prepare(`SELECT id FROM pacientes WHERE id = ?`)
      .get(pacienteId);
    if (!paciente) {
      res.status(404).json({ error: "Paciente não encontrado" });
      return;
    }

    const rows = getDb()
      .prepare(
        `SELECT a.id, a.data, a.hora, a.status, a.medico_id,
                u.nome AS medico_nome,
                ${SQL_PROCEDIMENTO_NOME} AS procedimento_nome
         FROM agendamentos a
         JOIN usuarios u ON u.id = a.medico_id
         WHERE a.paciente_id = ?
         ORDER BY a.data DESC, a.hora DESC, a.id DESC
         LIMIT 200`,
      )
      .all(pacienteId) as { id: number }[];

    logAcesso({
      usuarioId: req.usuario!.id,
      pacienteId,
      acao: "paciente_atendimentos_lido",
    });

    res.json(enriquecerLista(rows));
  }),
);

/**
 * Horários só-exame finalizados do paciente — memória clínica no histórico
 * (sem prontuário/ASO). Exame no mesmo slot de consulta não entra (§1.3.13).
 */
agendamentosRouter.get(
  "/paciente/:pacienteId/historico-exames-clinicos",
  requireModulo("prontuario_ler", "prontuario_escrever"),
  asyncHandler(async (req, res) => {
    const pacienteId = Number(req.params.pacienteId);
    if (!Number.isInteger(pacienteId) || pacienteId <= 0) {
      res.status(400).json({ error: "Paciente inválido" });
      return;
    }
    const paciente = getDb()
      .prepare(`SELECT id FROM pacientes WHERE id = ?`)
      .get(pacienteId);
    if (!paciente) {
      res.status(404).json({ error: "Paciente não encontrado" });
      return;
    }
    assertMedicoVinculoPaciente(req, pacienteId);

    const medicoId =
      req.usuario!.perfil === "medico" ? req.usuario!.id : undefined;
    const itens = listarHistoricoExamesClinicos(pacienteId, { medicoId });

    logAcesso({
      usuarioId: req.usuario!.id,
      pacienteId,
      acao: "paciente_historico_exames_clinicos_lido",
    });

    res.json(itens);
  }),
);

agendamentosRouter.post(
  "/",
  requireModulo("agenda"),
  asyncHandler(async (req, res) => {
    try {
      assertContratoAgendamentoNovo(req.body);
    } catch (e) {
      res.status(400).json({
        error: e instanceof Error ? e.message : "Contrato de agendamento inválido",
      });
      return;
    }

    const body = createSchema.parse(req.body);
    let procs;
    try {
      assertConvenioAtivo(body.convenio_id);
      procs = validarListaProcedimentos(body.procedimento_ids);
    } catch (e) {
      res.status(400).json({
        error: e instanceof Error ? e.message : "Procedimentos inválidos",
      });
      return;
    }

    const tipo = derivarTipoAtendimento(procs);
    const ehRetorno = listaTemConsultaRetorno(procs);
    const vigente =
      tipo === "consulta" ? getRetornoVigente(body.paciente_id) : null;

    if (tipo === "admissional" && ehRetorno) {
      res.status(400).json({
        error: `${ASO_TITULO_CURTO} não pode ser agendado como retorno`,
      });
      return;
    }

    if (ehRetorno && tipo === "consulta") {
      if (!vigente) {
        res.status(400).json({
          error: "Paciente sem retorno vigente para agendar como retorno.",
        });
        return;
      }
      if (body.medico_id !== vigente.medico_id) {
        res.status(400).json({
          error: `Retorno deve ser com ${vigente.medico_nome}. Para outro médico, use nova consulta.`,
          retorno: vigente,
        });
        return;
      }
      if (body.data > vigente.retorno_ate.slice(0, 10)) {
        res.status(400).json({
          error: `Data após o fim do prazo de retorno (${vigente.retorno_ate.slice(0, 10)}). Agende como nova consulta.`,
          retorno: vigente,
        });
        return;
      }
    }

    if (
      vigente &&
      !ehRetorno &&
      !body.ignorar_aviso_retorno &&
      body.medico_id === vigente.medico_id
    ) {
      res.status(409).json({
        error: "retorno_vigente",
        mensagem: `Paciente em prazo de retorno com ${vigente.medico_nome} até ${vigente.retorno_ate}. Confirme com o paciente se é retorno ou nova consulta.`,
        retorno: vigente,
      });
      return;
    }
    const paciente = getDb()
      .prepare(`SELECT id, data_nasc, telefone FROM pacientes WHERE id = ?`)
      .get(body.paciente_id) as
      | { id: number; data_nasc: string | null; telefone: string | null }
      | undefined;
    if (!paciente) {
      res.status(400).json({ error: "Paciente não encontrado" });
      return;
    }
    if (!paciente.data_nasc?.trim() || !paciente.telefone?.trim()) {
      res.status(400).json({
        error:
          "Paciente precisa de telefone e data de nascimento para agendar.",
      });
      return;
    }
    const medico = getDb()
      .prepare(
        `SELECT id FROM usuarios WHERE id = ? AND perfil IN ('medico', 'admin') AND ativo = 1`,
      )
      .get(body.medico_id);
    if (!medico) {
      res.status(400).json({ error: "Médico não encontrado ou inativo" });
      return;
    }
    const ehEncaixe = body.eh_encaixe ? 1 : 0;
    const obs = body.observacao_agenda?.trim() || null;
    const observacao = ehRetorno && !obs ? "Retorno" : obs;
    const statusInicial = body.checkin ? "presente" : "agendado";

    let fichaTemplateId: number | null = null;
    if (body.ficha_template_id != null) {
      if (tipo !== "consulta") {
        res.status(400).json({
          error: "Ficha clínica só se aplica quando há procedimento de consulta",
        });
        return;
      }
      try {
        assertFichaPermitida(body.medico_id, body.ficha_template_id, "prontuario");
        fichaTemplateId = body.ficha_template_id;
      } catch (e) {
        if (handleFichaError(e, res)) return;
        throw e;
      }
    }

    let asoTemplateId: number | null = null;
    if (body.aso_template_id != null) {
      if (tipo !== "admissional") {
        res.status(400).json({
          error: "Modelo ASO só se aplica quando o horário é ASO",
        });
        return;
      }
      try {
        assertFichaPermitida(body.medico_id, body.aso_template_id, "aso");
        asoTemplateId = body.aso_template_id;
      } catch (e) {
        if (handleFichaError(e, res)) return;
        throw e;
      }
    }

    const procedimentoId = body.procedimento_ids[0]!;
    const db = getDb();
    try {
      assertSlotPacienteMedicoLivre({
        paciente_id: body.paciente_id,
        medico_id: body.medico_id,
        data: body.data,
        hora: body.hora,
      });
    } catch (e) {
      if (e instanceof AgendamentoAtendimentoError) {
        res.status(409).json({ error: e.message });
        return;
      }
      throw e;
    }
    let id: number;
    try {
      id = db.transaction(() => {
        const info = db
          .prepare(
            `INSERT INTO agendamentos (
              paciente_id, medico_id, data, hora, duracao_minutos,
              observacao_agenda, eh_retorno, tipo_atendimento, status,
              ficha_template_id, aso_template_id, eh_encaixe,
              procedimento_id, convenio_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            body.paciente_id,
            body.medico_id,
            body.data,
            body.hora,
            body.duracao_minutos ?? 30,
            observacao,
            ehRetorno ? 1 : 0,
            tipo,
            statusInicial,
            fichaTemplateId,
            asoTemplateId,
            ehEncaixe,
            procedimentoId,
            body.convenio_id,
          );
        const newId = Number(info.lastInsertRowid);
        gravarProcedimentosExtras(newId, body.procedimento_ids, db);
        if (statusInicial === "presente") {
          executarContaNoCheckin(newId, req.usuario!.id, db);
        }
        return newId;
      })();
    } catch (e) {
      if (isErroSlotPacienteMedicoDuplicado(e)) {
        res.status(409).json({ error: MSG_SLOT_PACIENTE_MEDICO_DUPLICADO });
        return;
      }
      const msg =
        e instanceof AgendamentoAtendimentoError || e instanceof Error
          ? e.message
          : "Erro ao criar agendamento";
      res.status(400).json({ error: msg });
      return;
    }
    logAcesso({
      usuarioId: req.usuario!.id,
      pacienteId: body.paciente_id,
      acao: "agendamento_criado",
      detalhe: `id=${id} data=${body.data} hora=${body.hora} medico=${body.medico_id} encaixe=${ehEncaixe ? "sim" : "nao"} status=${statusInicial}`,
    });
    const row = getDb()
      .prepare(
        `SELECT a.*, p.nome AS paciente_nome, u.nome AS medico_nome,
                cv.nome AS convenio_nome
         FROM agendamentos a
         JOIN pacientes p ON p.id = a.paciente_id
         JOIN usuarios u ON u.id = a.medico_id
         LEFT JOIN convenios cv ON cv.id = a.convenio_id
         WHERE a.id = ?`,
      )
      .get(id) as { id: number };
    res.status(201).json(enriquecerLinha(row));
  }),
);

const statusSchema = z.object({
  status: z.enum(STATUS),
});

agendamentosRouter.get(
  "/:id/consultar",
  asyncHandler(async (req, res) => {
    if (!podeAgenda(req) && !podeFilaMedico(req) && !podeFilaRecepcao(req)) {
      res.status(403).json({ error: "Sem permissão para agenda" });
      return;
    }
    const id = Number(req.params.id);
    const ag = getDb()
      .prepare(
        `SELECT id, medico_id, tipo_atendimento, status FROM agendamentos WHERE id = ?`,
      )
      .get(id) as
      | {
          id: number;
          medico_id: number;
          tipo_atendimento: string;
          status: string;
        }
      | undefined;
    if (!ag) {
      res.status(404).json({ error: "Agendamento não encontrado" });
      return;
    }
    if (
      req.usuario!.perfil === "medico" &&
      ag.medico_id !== req.usuario!.id
    ) {
      res.status(403).json({ error: "Agendamento de outro médico" });
      return;
    }
    if (ag.status !== "finalizado") {
      res.status(400).json({
        error: "Consulta disponível apenas para atendimentos finalizados",
      });
      return;
    }

    const v = getVinculosAgendamento(id);
    const procs = listarProcedimentosDoAgendamento(id);
    const temAso = procs.some((p) => p.modo_clinico === "aso");
    const temProntuario = procs.some((p) => p.modo_clinico === "prontuario");

    if (temAso) {
      if (!podeConsultarAdmissional(req)) {
        res.status(403).json({ error: `Sem permissão para consultar ${ASO_TITULO_CURTO}` });
        return;
      }
      if (!v.admissional_id) {
        res.status(404).json({
          error: `${ASO_TITULO_CURTO} não encontrado para este agendamento`,
        });
        return;
      }
      res.json({ tipo: "admissional", id: v.admissional_id });
      return;
    }

    if (!temProntuario) {
      res.status(400).json({
        error: "Este horário só tem exame. Não há ficha clínica para abrir.",
      });
      return;
    }

    if (!podeConsultarProntuario(req)) {
      res.status(403).json({ error: "Sem permissão para consultar prontuário" });
      return;
    }
    if (!v.prontuario_id) {
      res.status(404).json({
        error: "Prontuário não encontrado para este agendamento",
      });
      return;
    }
    res.json({ tipo: "consulta", id: v.prontuario_id });
  }),
);

agendamentosRouter.get(
  "/:id/vinculos",
  asyncHandler(async (req, res) => {
    if (!podeAgenda(req) && !podeFilaMedico(req) && !podeFilaRecepcao(req)) {
      res.status(403).json({ error: "Sem permissão para agenda" });
      return;
    }
    const id = Number(req.params.id);
    const ag = getDb()
      .prepare(`SELECT id, medico_id FROM agendamentos WHERE id = ?`)
      .get(id) as { id: number; medico_id: number } | undefined;
    if (!ag) {
      res.status(404).json({ error: "Agendamento não encontrado" });
      return;
    }
    if (
      req.usuario!.perfil === "medico" &&
      ag.medico_id !== req.usuario!.id
    ) {
      res.status(403).json({ error: "Agendamento de outro médico" });
      return;
    }
    res.json(getVinculosAgendamento(id));
  }),
);

agendamentosRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    if (!podeAgenda(req) && !podeFilaMedico(req) && !podeFilaRecepcao(req)) {
      res.status(403).json({ error: "Sem permissão para agenda" });
      return;
    }
    const id = Number(req.params.id);
    const row = getDb()
      .prepare(
        `SELECT a.*, p.nome AS paciente_nome, u.nome AS medico_nome,
                cv.nome AS convenio_nome
         FROM agendamentos a
         JOIN pacientes p ON p.id = a.paciente_id
         JOIN usuarios u ON u.id = a.medico_id
         LEFT JOIN convenios cv ON cv.id = a.convenio_id
         WHERE a.id = ?`,
      )
      .get(id) as { id: number; medico_id: number } | undefined;
    if (!row) {
      res.status(404).json({ error: "Agendamento não encontrado" });
      return;
    }
    if (
      req.usuario!.perfil === "medico" &&
      row.medico_id !== req.usuario!.id
    ) {
      res.status(403).json({ error: "Agendamento de outro médico" });
      return;
    }
    res.json(enriquecerLinha(row));
  }),
);

agendamentosRouter.patch(
  "/:id/procedimentos",
  requireModulo("agenda", "cobranca"),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const body = patchProcedimentosSchema.parse(req.body);
    const ag = getDb()
      .prepare(`SELECT id, medico_id FROM agendamentos WHERE id = ?`)
      .get(id) as { id: number; medico_id: number } | undefined;
    if (!ag) {
      res.status(404).json({ error: "Agendamento não encontrado" });
      return;
    }
    if (
      req.usuario!.perfil === "medico" &&
      ag.medico_id !== req.usuario!.id
    ) {
      res.status(403).json({ error: "Agendamento de outro médico" });
      return;
    }

    try {
        sincronizarProcedimentosAgendamento({
          agendamentoId: id,
          procedimentoIds: body.procedimento_ids,
          convenioId: body.convenio_id,
          origemNovos: "secretaria",
          usuarioId: req.usuario!.id,
        });
        await tentarPreparoZapAposEdicao(id);
    } catch (e) {
      res.status(400).json({
        error: e instanceof Error ? e.message : "Não foi possível atualizar",
      });
      return;
    }

    const row = getDb()
      .prepare(
        `SELECT a.*, p.nome AS paciente_nome, u.nome AS medico_nome,
                cv.nome AS convenio_nome
         FROM agendamentos a
         JOIN pacientes p ON p.id = a.paciente_id
         JOIN usuarios u ON u.id = a.medico_id
         LEFT JOIN convenios cv ON cv.id = a.convenio_id
         WHERE a.id = ?`,
      )
      .get(id) as { id: number };
    res.json(enriquecerLinha(row));
  }),
);

agendamentosRouter.patch(
  "/:id/ficha",
  requireModulo("agenda", "fila_medico", "prontuario_escrever"),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const body = fichaAgendamentoSchema.parse(req.body);
    const ag = getDb()
      .prepare(`SELECT * FROM agendamentos WHERE id = ?`)
      .get(id) as
      | {
          id: number;
          medico_id: number;
          status: Status;
          ficha_template_id: number | null;
        }
      | undefined;
    if (!ag) {
      res.status(404).json({ error: "Agendamento não encontrado" });
      return;
    }
    const procsFicha = listarProcedimentosDoAgendamento(id);
    if (!procsFicha.some((p) => p.modo_clinico === "prontuario")) {
      res.status(400).json({ error: "Ficha clínica só se aplica quando há procedimento de consulta" });
      return;
    }
    if (ag.status === "finalizado") {
      res.status(409).json({ error: "Consulta finalizada — ficha não pode ser alterada" });
      return;
    }
    if (
      req.usuario!.perfil === "medico" &&
      ag.medico_id !== req.usuario!.id
    ) {
      res.status(403).json({ error: "Agendamento de outro médico" });
      return;
    }

    const fichaId = body.ficha_template_id;
    if (fichaId != null) {
      try {
        assertFichaPermitida(ag.medico_id, fichaId, "prontuario");
      } catch (e) {
        if (handleFichaError(e, res)) return;
        throw e;
      }
    }

    getDb()
      .prepare(
        `UPDATE agendamentos SET ficha_template_id = ?, updated_at = datetime('now', 'localtime')
         WHERE id = ?`,
      )
      .run(fichaId, id);

    const pr = getDb()
      .prepare(`SELECT * FROM prontuarios WHERE agendamento_id = ?`)
      .get(id) as
      | {
          id: number;
          queixa_principal: string | null;
          anamnese: string | null;
          exame_fisico: string | null;
          hipotese_diagnostica: string | null;
          conduta: string | null;
          plano: string | null;
          cid_codigo: string | null;
          cid_descricao: string | null;
          retorno_dias: number | null;
        }
      | undefined;

    if (pr && fichaId != null) {
      try {
        assertConsultaEditavel(pr.id);
        const ficha = getFichaTemplateOrThrow(fichaId);
        const campos = camposFromTemplate(ficha);
        const dados = legadoParaDadosJson(pr, campos);
        getDb()
          .prepare(
            `UPDATE prontuarios SET ficha_template_id = ?, dados_json = ? WHERE id = ?`,
          )
          .run(fichaId, dadosJsonToString(dados), pr.id);
      } catch (e) {
        if (e instanceof FichaProntuarioError) {
          if (handleFichaError(e, res)) return;
        }
        if (
          e instanceof Error &&
          e.message.includes("Consulta finalizada")
        ) {
          /* prontuário encerrado — só agenda atualizada */
        } else {
          throw e;
        }
      }
    } else if (pr && fichaId == null) {
      try {
        assertConsultaEditavel(pr.id);
        getDb()
          .prepare(`UPDATE prontuarios SET ficha_template_id = NULL WHERE id = ?`)
          .run(pr.id);
      } catch {
        /* consulta encerrada */
      }
    }

    const row = getDb()
      .prepare(
        `SELECT a.*, p.nome AS paciente_nome, u.nome AS medico_nome
         FROM agendamentos a
         JOIN pacientes p ON p.id = a.paciente_id
         JOIN usuarios u ON u.id = a.medico_id
         WHERE a.id = ?`,
      )
      .get(id);
    res.json(enriquecerLinha(row as { id: number }));
  }),
);

agendamentosRouter.patch(
  "/:id/status",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const { status: novo } = statusSchema.parse(req.body);
    const row = getDb()
      .prepare(`SELECT * FROM agendamentos WHERE id = ?`)
      .get(id) as
      | {
          status: Status;
          medico_id: number;
          paciente_id: number;
          data: string;
          hora: string;
        }
      | undefined;
    if (!row) {
      res.status(404).json({ error: "Agendamento não encontrado" });
      return;
    }

    const soExame = horarioSoExame(id);
    const fechandoExame =
      novo === "finalizado" &&
      soExame &&
      (row.status === "presente" || row.status === "em_atendimento");

    const precisaRecepcao = [
      "presente",
      "cancelado",
      "nao_compareceu",
      "agendado",
    ].includes(novo);
    const precisaMedico = ["em_atendimento", "finalizado"].includes(novo);

    if (precisaRecepcao && !podeFilaRecepcao(req) && !podeAgenda(req)) {
      res.status(403).json({ error: "Sem permissão na recepção" });
      return;
    }
    if (
      precisaMedico &&
      !podeFilaMedico(req) &&
      !(fechandoExame && podeFilaRecepcao(req))
    ) {
      res.status(403).json({ error: "Sem permissão do médico" });
      return;
    }
    if (
      req.usuario!.perfil === "medico" &&
      row.medico_id !== req.usuario!.id
    ) {
      res.status(403).json({ error: "Agendamento de outro médico" });
      return;
    }

    const permitidos = [...(TRANSICOES[row.status] ?? [])];
    if (row.status === "presente" && soExame) {
      permitidos.push("finalizado");
    }
    if (!permitidos.includes(novo) && row.status !== novo) {
      res.status(400).json({
        error: `Transição inválida: ${row.status} → ${novo}`,
      });
      return;
    }

    if (novo !== "cancelado" && novo !== "nao_compareceu") {
      try {
        assertSlotPacienteMedicoLivre({
          paciente_id: row.paciente_id,
          medico_id: row.medico_id,
          data: row.data,
          hora: row.hora,
          ignorarId: id,
        });
      } catch (e) {
        if (e instanceof AgendamentoAtendimentoError) {
          res.status(409).json({ error: e.message });
          return;
        }
        throw e;
      }
    }

    const db = getDb();
    try {
      db.transaction(() => {
        const ch = db
          .prepare(
            `UPDATE agendamentos SET status = ?, updated_at = datetime('now', 'localtime')
             WHERE id = ? AND status = ?`,
          )
          .run(novo, id, row.status);
        if (ch.changes === 0) {
          throw new Error("STATUS_CONFLICT");
        }
        if (novo === "presente") {
          executarContaNoCheckin(id, req.usuario!.id, db);
        }
      })();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg === "STATUS_CONFLICT") {
        res.status(409).json({
          error: "Status do agendamento foi alterado — recarregue e tente novamente",
        });
        return;
      }
      if (isErroSlotPacienteMedicoDuplicado(e)) {
        res.status(409).json({ error: MSG_SLOT_PACIENTE_MEDICO_DUPLICADO });
        return;
      }
      res.status(400).json({
        error: msg || "Erro ao abrir conta no check-in",
      });
      return;
    }

    const updated = db
      .prepare(
        `SELECT a.*, p.nome AS paciente_nome, u.nome AS medico_nome
         FROM agendamentos a
         JOIN pacientes p ON p.id = a.paciente_id
         JOIN usuarios u ON u.id = a.medico_id
         WHERE a.id = ?`,
      )
      .get(id);
    if (!updated) {
      res.status(404).json({ error: "Agendamento não encontrado" });
      return;
    }
    if ((updated as { status: Status }).status !== novo) {
      res.status(409).json({
        error: "Status do agendamento foi alterado — recarregue e tente novamente",
      });
      return;
    }
    logAcesso({
      usuarioId: req.usuario!.id,
      pacienteId: row.paciente_id,
      acao: "agendamento_status",
      detalhe: `id=${id} ${row.status}→${novo}`,
    });
    res.json(enriquecerLinha(updated as { id: number }));
  }),
);

agendamentosRouter.delete(
  "/:id",
  requireModulo("agenda"),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const ag = getDb()
      .prepare(`SELECT id, medico_id FROM agendamentos WHERE id = ?`)
      .get(id) as { id: number; medico_id: number } | undefined;
    if (!ag) {
      res.status(404).json({ error: "Agendamento não encontrado" });
      return;
    }
    if (
      req.usuario!.perfil === "medico" &&
      ag.medico_id !== req.usuario!.id
    ) {
      res.status(403).json({ error: "Agendamento de outro médico" });
      return;
    }
    getDb()
      .prepare(
        `UPDATE agendamentos SET status = 'cancelado', updated_at = datetime('now', 'localtime') WHERE id = ?`,
      )
      .run(id);
    res.json({ ok: true });
  }),
);
