import { Router } from "express";
import { z } from "zod";
import {
  criarDadosPadrao,
  parseDadosJson,
  serializarDadosJson,
  type AdmissionalDados,
} from "../admissional/checklist.js";
import {
  camposCorpoAso,
  dadosJsonParaNovoAso,
  dadosVaziosAso,
  enriquecerAdmissionalModelo,
  getDefaultAsoTemplateId,
  getFichaTemplateRowById,
  isAsoLegado,
  listarModelosAsoDisponiveis,
  parseDadosModeloAso,
  resolveAsoTemplateIdNovo,
  rotuloOpcaoEscolha,
  serializarDadosModeloAso,
  snapshotAsoAoFinalizar,
} from "../admissional/asoModelo.js";
import { ASO_TITULO_CURTO } from "../admissional/labels.js";
import { requireAuth, requireModulo } from "../auth/middleware.js";
import type { Request } from "express";
import type { Modulo } from "../auth/modulos.js";
import { usuarioTemModulo } from "../auth/modulos.js";
import type { Perfil } from "../auth/users.js";
import { getDb } from "../db/index.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { gerarPdfAdmissional, gerarPdfConsulta } from "../services/documentPdf.js";
import { logAcesso } from "../services/logAcesso.js";
import { assertMedicoVinculoPaciente } from "../services/vinculosClinicos.js";
import { nomeExameParaExibicao } from "../utils/examesStorage.js";
import {
  AgendamentoAtendimentoError,
  assertHorarioAbreAso,
} from "../services/agendamentoAtendimento.js";
import {
  assertFichaPermitida,
  camposFromTemplate,
  FichaProntuarioError,
  prepararCamposConsultaPdf,
} from "../services/fichaProntuario.js";

export const admissionaisRouter = Router();

const podeListar: Modulo[] = ["admissional", "admissional_agenda"];
const podeFormulario: Modulo[] = ["admissional"];

type AdmissionalRow = {
  id: number;
  paciente_id: number;
  agendamento_id: number | null;
  medico_id: number;
  status: string;
  conclusao: string | null;
  restricoes_texto: string | null;
  dados_json: string;
  documento_path: string | null;
  exame_anexo_id: number | null;
  finalizado_em: string | null;
  created_at: string;
  created_by: number | null;
  updated_at: string;
  retificacao_de_id: number | null;
  motivo_retificacao: string | null;
  retificacao_finalizada: number | boolean | null;
  aso_template_id: number | null;
  template_snapshot_json: string | null;
};

function assertMedicoAdmissional(req: Request, medicoId: number): void {
  if (
    req.usuario!.perfil === "medico" &&
    medicoId !== req.usuario!.id
  ) {
    const err = new Error("Admissional de outro médico");
    (err as Error & { status: number }).status = 403;
    throw err;
  }
}

function rowToJson(row: AdmissionalRow, opts?: { incluirDados?: boolean }) {
  const incluirDados = opts?.incluirDados !== false;
  const paciente = getDb()
    .prepare(`SELECT nome, cpf, data_nasc FROM pacientes WHERE id = ?`)
    .get(row.paciente_id) as
    | { nome: string; cpf: string | null; data_nasc: string | null }
    | undefined;
  const medico = getDb()
    .prepare(`SELECT nome, crm FROM usuarios WHERE id = ?`)
    .get(row.medico_id) as { nome: string; crm: string | null } | undefined;

  let exame_descricao: string | null = null;
  let exame_nome_arquivo: string | null = null;
  if (row.exame_anexo_id) {
    const exame = getDb()
      .prepare(`SELECT descricao, arquivo_path FROM exames_anexos WHERE id = ?`)
      .get(row.exame_anexo_id) as
      | { descricao: string | null; arquivo_path: string }
      | undefined;
    if (exame) {
      const desc = String(exame.descricao ?? "").trim();
      const arquivo = exame.arquivo_path
        ? nomeExameParaExibicao(exame.arquivo_path)
        : "";
      exame_descricao = desc || null;
      exame_nome_arquivo = desc || arquivo || null;
    }
  }

  const base = {
    id: row.id,
    paciente_id: row.paciente_id,
    agendamento_id: row.agendamento_id,
    medico_id: row.medico_id,
    status: row.status,
    conclusao: row.conclusao,
    restricoes_texto: row.restricoes_texto,
    documento_path: row.documento_path,
    exame_anexo_id: row.exame_anexo_id,
    finalizado_em: row.finalizado_em,
    created_at: row.created_at,
    updated_at: row.updated_at,
    retificacao_de_id: row.retificacao_de_id ?? null,
    motivo_retificacao: row.motivo_retificacao ?? null,
    retificacao_finalizada: Number(row.retificacao_finalizada) ? 1 : 0,
    paciente_nome: paciente?.nome ?? null,
    paciente_cpf: paciente?.cpf ?? null,
    paciente_data_nasc: paciente?.data_nasc ?? null,
    medico_nome: medico?.nome ?? null,
    medico_crm: medico?.crm ?? null,
    exame_descricao,
    exame_nome_arquivo,
    aso_template_id: row.aso_template_id ?? null,
    aso_legado: isAsoLegado(row),
  };

  if (!incluirDados) return base;

  if (!isAsoLegado(row)) {
    const modelo = enriquecerAdmissionalModelo(row);
    const editavel =
      row.status === "em_preenchimento" && !row.retificacao_de_id;
    return {
      ...base,
      dados: modelo?.dados ?? {},
      aso_titulo_documento: modelo?.aso_titulo_documento ?? null,
      aso_modo: modelo?.aso_modo ?? "secoes",
      aso_campos: modelo?.aso_campos ?? [],
      aso_campos_posicao: modelo?.aso_campos_posicao ?? [],
      modelos_aso: editavel
        ? listarModelosAsoDisponiveis(row.medico_id).map((m) => ({
            id: m.id,
            nome: m.nome,
            eh_default: Boolean(m.eh_default),
          }))
        : undefined,
    };
  }

  return {
    ...base,
    dados: parseDadosJson(row.dados_json),
  };
}

function usuarioPodeVerFormularioAdmissional(req: Request): boolean {
  const u = req.usuario!;
  return usuarioTemModulo(u.id, u.perfil as Perfil, "admissional");
}

type AdmissionalHistoricoRow = AdmissionalRow & {
  medico_nome: string;
  medico_crm: string | null;
  exame_descricao: string | null;
  exame_arquivo_path: string | null;
};

function mapHistoricoItem(row: AdmissionalHistoricoRow) {
  const exameDescricao = String(row.exame_descricao ?? "").trim();
  const exameArquivo = row.exame_arquivo_path
    ? nomeExameParaExibicao(row.exame_arquivo_path)
    : "";
  return {
    id: row.id,
    paciente_id: row.paciente_id,
    agendamento_id: row.agendamento_id,
    medico_id: row.medico_id,
    status: row.status,
    conclusao: row.conclusao,
    restricoes_texto: row.restricoes_texto,
    exame_anexo_id: row.exame_anexo_id,
    finalizado_em: row.finalizado_em,
    created_at: row.created_at,
    medico_nome: row.medico_nome,
    medico_crm: row.medico_crm,
    exame_descricao: exameDescricao || null,
    exame_nome_arquivo: exameDescricao || exameArquivo || null,
    retificacao_de_id: row.retificacao_de_id ?? null,
    motivo_retificacao: row.motivo_retificacao ?? null,
    retificacao_finalizada: Number(row.retificacao_finalizada) ? 1 : 0,
  };
}

function getById(id: number): AdmissionalRow | undefined {
  return getDb()
    .prepare(`SELECT * FROM admissionais WHERE id = ?`)
    .get(id) as AdmissionalRow | undefined;
}

type AgendamentoAdmissional = {
  id: number;
  paciente_id: number;
  medico_id: number;
  status: string;
  tipo_atendimento: string;
  aso_template_id?: number | null;
};

function findAdmissionalPorAgendamento(agendamentoId: number): AdmissionalRow | undefined {
  return getDb()
    .prepare(
      `SELECT * FROM admissionais
       WHERE agendamento_id = ? AND status != 'cancelado'
       ORDER BY id DESC LIMIT 1`,
    )
    .get(agendamentoId) as AdmissionalRow | undefined;
}

function abrirAdmissionalPorAgendamento(
  agendamentoId: number,
  createdBy: number,
): AdmissionalRow {
  const ag = getDb()
    .prepare(`SELECT * FROM agendamentos WHERE id = ?`)
    .get(agendamentoId) as AgendamentoAdmissional | undefined;
  if (!ag) {
    throw new Error("NOT_FOUND");
  }
  assertHorarioAbreAso(agendamentoId);
  if (!["presente", "em_atendimento"].includes(ag.status)) {
    throw new Error("STATUS_INVALIDO");
  }

  const db = getDb();
  const row = db.transaction(() => {
    let current = findAdmissionalPorAgendamento(agendamentoId);
    if (!current) {
      let asoTemplateId: number | null = null;
      try {
        asoTemplateId = resolveAsoTemplateIdNovo(ag);
      } catch (e) {
        if (e instanceof FichaProntuarioError) throw e;
        throw e;
      }
      const preparado = dadosJsonParaNovoAso(asoTemplateId);
      if (preparado.asoTemplateId != null && preparado.dadosJson) {
        const info = db
          .prepare(
            `INSERT INTO admissionais (
              paciente_id, agendamento_id, medico_id, dados_json, aso_template_id, created_by
            ) VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .run(
            ag.paciente_id,
            agendamentoId,
            ag.medico_id,
            preparado.dadosJson,
            preparado.asoTemplateId,
            createdBy,
          );
        current = getById(Number(info.lastInsertRowid))!;
      } else {
        const dadosJson = serializarDadosJson(criarDadosPadrao());
        const info = db
          .prepare(
            `INSERT INTO admissionais (
              paciente_id, agendamento_id, medico_id, dados_json, created_by
            ) VALUES (?, ?, ?, ?, ?)`,
          )
          .run(ag.paciente_id, agendamentoId, ag.medico_id, dadosJson, createdBy);
        current = getById(Number(info.lastInsertRowid))!;
      }
    }
    if (ag.status !== "em_atendimento") {
      db.prepare(
        `UPDATE agendamentos SET status = 'em_atendimento',
         updated_at = datetime('now', 'localtime') WHERE id = ?`,
      ).run(agendamentoId);
    }
    return current;
  })();

  return row;
}

function finalizarAgendamentoVinculado(agendamentoId: number | null): void {
  if (!agendamentoId) return;
  getDb()
    .prepare(
      `UPDATE agendamentos SET status = 'finalizado',
       updated_at = datetime('now', 'localtime')
       WHERE id = ? AND status = 'em_atendimento'`,
    )
    .run(agendamentoId);
}

admissionaisRouter.get(
  "/ping",
  requireAuth(),
  requireModulo(...podeListar),
  asyncHandler(async (_req, res) => {
    res.json({ ok: true, modulo: "admissional" });
  }),
);

admissionaisRouter.get(
  "/pacientes-busca",
  requireAuth(),
  requireModulo(...podeListar),
  asyncHandler(async (req, res) => {
    const q = String(req.query.q ?? "").trim();
    let sql = `SELECT id, nome, cpf, telefone, data_nasc FROM pacientes`;
    const params: unknown[] = [];
    if (q) {
      sql += ` WHERE nome LIKE ? COLLATE NOCASE OR cpf LIKE ? OR telefone LIKE ?`;
      const like = `%${q}%`;
      params.push(like, like, like);
    }
    sql += ` ORDER BY nome COLLATE NOCASE LIMIT 30`;
    res.json(getDb().prepare(sql).all(...params));
  }),
);

admissionaisRouter.get(
  "/paciente/:pacienteId/historico",
  requireAuth(),
  requireModulo(...podeListar),
  asyncHandler(async (req, res) => {
    const pacienteId = Number(req.params.pacienteId);
    const paciente = getDb()
      .prepare(`SELECT id FROM pacientes WHERE id = ?`)
      .get(pacienteId);
    if (!paciente) {
      res.status(404).json({ error: "Paciente não encontrado" });
      return;
    }
    assertMedicoVinculoPaciente(req, pacienteId);

    let sql = `
      SELECT a.id, a.paciente_id, a.agendamento_id, a.medico_id, a.status,
             a.conclusao, a.restricoes_texto, a.exame_anexo_id,
             a.finalizado_em, a.created_at,
             a.retificacao_de_id, a.motivo_retificacao, a.retificacao_finalizada,
             u.nome AS medico_nome, u.crm AS medico_crm,
             e.descricao AS exame_descricao, e.arquivo_path AS exame_arquivo_path
      FROM admissionais a
      JOIN usuarios u ON u.id = a.medico_id
      LEFT JOIN exames_anexos e ON e.id = a.exame_anexo_id
      WHERE a.paciente_id = ? AND a.status != 'cancelado'
    `;
    const params: unknown[] = [pacienteId];
    if (req.usuario!.perfil === "medico") {
      sql += ` AND a.medico_id = ?`;
      params.push(req.usuario!.id);
    }
    sql += ` ORDER BY COALESCE(a.finalizado_em, a.created_at) DESC LIMIT 100`;

    const rows = getDb().prepare(sql).all(...params) as AdmissionalHistoricoRow[];
    res.json(rows.map(mapHistoricoItem));
  }),
);

admissionaisRouter.get(
  "/",
  requireAuth(),
  requireModulo(...podeListar),
  asyncHandler(async (req, res) => {
    const status = String(req.query.status ?? "").trim();
    const pacienteId = Number(req.query.paciente_id);
    const data = String(req.query.data ?? "").trim();

    let sql = `
      SELECT a.*, p.nome AS paciente_nome, u.nome AS medico_nome
      FROM admissionais a
      JOIN pacientes p ON p.id = a.paciente_id
      JOIN usuarios u ON u.id = a.medico_id
      WHERE 1=1
    `;
    const params: unknown[] = [];

    if (status) {
      sql += ` AND a.status = ?`;
      params.push(status);
    }
    if (Number.isFinite(pacienteId) && pacienteId > 0) {
      sql += ` AND a.paciente_id = ?`;
      params.push(pacienteId);
    }
    if (data) {
      sql += ` AND date(a.created_at) = date(?)`;
      params.push(data);
    }
    if (req.usuario!.perfil === "medico") {
      sql += ` AND a.medico_id = ?`;
      params.push(req.usuario!.id);
    }

    sql += ` ORDER BY a.created_at DESC LIMIT 200`;

    const rows = getDb().prepare(sql).all(...params) as (AdmissionalRow & {
      paciente_nome: string;
      medico_nome: string;
    })[];

    res.json(
      rows.map((r) => ({
        ...r,
        dados: parseDadosJson(r.dados_json),
      })),
    );
  }),
);

const createSchema = z.object({
  paciente_id: z.number().int().positive(),
  medico_id: z.number().int().positive(),
  agendamento_id: z.number().int().positive().optional(),
});

admissionaisRouter.post(
  "/",
  requireAuth(),
  requireModulo(...podeListar),
  asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body);
    const paciente = getDb()
      .prepare(`SELECT id FROM pacientes WHERE id = ?`)
      .get(body.paciente_id);
    if (!paciente) {
      res.status(400).json({ error: "Paciente não encontrado" });
      return;
    }
    const medico = getDb()
      .prepare(`SELECT id FROM usuarios WHERE id = ? AND perfil IN ('medico', 'admin') AND ativo = 1`)
      .get(body.medico_id);
    if (!medico) {
      res.status(400).json({ error: "Médico não encontrado ou inativo" });
      return;
    }
    if (body.agendamento_id) {
      const ag = getDb()
        .prepare(
          `SELECT id, tipo_atendimento, medico_id FROM agendamentos WHERE id = ? AND paciente_id = ?`,
        )
        .get(body.agendamento_id, body.paciente_id) as
        | { id: number; tipo_atendimento: string; medico_id: number }
        | undefined;
      if (!ag) {
        res.status(400).json({ error: "Agendamento inválido para este paciente" });
        return;
      }
      const existente = findAdmissionalPorAgendamento(body.agendamento_id);
      if (existente) {
        res.status(201).json(rowToJson(existente));
        return;
      }
      try {
        assertHorarioAbreAso(body.agendamento_id);
      } catch (e) {
        if (e instanceof AgendamentoAtendimentoError) {
          res.status(400).json({ error: e.message });
          return;
        }
        throw e;
      }
    }

    const medicoId =
      body.agendamento_id != null
        ? (
            getDb()
              .prepare(`SELECT medico_id FROM agendamentos WHERE id = ?`)
              .get(body.agendamento_id) as { medico_id: number } | undefined
          )?.medico_id ?? body.medico_id
        : body.medico_id;

    let asoTemplateId: number | null = null;
    try {
      if (body.agendamento_id) {
        const agFull = getDb()
          .prepare(`SELECT * FROM agendamentos WHERE id = ?`)
          .get(body.agendamento_id) as AgendamentoAdmissional | undefined;
        if (agFull) asoTemplateId = resolveAsoTemplateIdNovo(agFull);
      } else {
        asoTemplateId = getDefaultAsoTemplateId();
      }
    } catch (e) {
      if (e instanceof FichaProntuarioError) {
        res.status(e.status).json({ error: e.message });
        return;
      }
      throw e;
    }

    const preparado = dadosJsonParaNovoAso(asoTemplateId);
    let info;
    try {
      info =
        preparado.asoTemplateId != null && preparado.dadosJson
          ? getDb()
              .prepare(
                `INSERT INTO admissionais (
                  paciente_id, agendamento_id, medico_id, dados_json, aso_template_id, created_by
                ) VALUES (?, ?, ?, ?, ?, ?)`,
              )
              .run(
                body.paciente_id,
                body.agendamento_id ?? null,
                medicoId,
                preparado.dadosJson,
                preparado.asoTemplateId,
                req.usuario!.id,
              )
          : getDb()
              .prepare(
                `INSERT INTO admissionais (
                  paciente_id, agendamento_id, medico_id, dados_json, created_by
                ) VALUES (?, ?, ?, ?, ?)`,
              )
              .run(
                body.paciente_id,
                body.agendamento_id ?? null,
                medicoId,
                serializarDadosJson(criarDadosPadrao()),
                req.usuario!.id,
              );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("Não misture consulta e ASO")) {
        res.status(400).json({
          error: "Não misture consulta e ASO no mesmo horário",
        });
        return;
      }
      throw e;
    }

    const row = getById(Number(info.lastInsertRowid));
    res.status(201).json(rowToJson(row!));
  }),
);

admissionaisRouter.post(
  "/abrir",
  requireAuth(),
  requireModulo("admissional"),
  asyncHandler(async (req, res) => {
    const agendamentoId = Number(
      (req.body as { agendamento_id?: number }).agendamento_id,
    );
    if (!agendamentoId) {
      res.status(400).json({ error: "agendamento_id obrigatório" });
      return;
    }

    const ag = getDb()
      .prepare(`SELECT medico_id FROM agendamentos WHERE id = ?`)
      .get(agendamentoId) as { medico_id: number } | undefined;
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
      const row = abrirAdmissionalPorAgendamento(
        agendamentoId,
        req.usuario!.id,
      );
      res.json(rowToJson(row));
    } catch (e) {
      if (e instanceof FichaProntuarioError) {
        res.status(e.status).json({ error: e.message });
        return;
      }
      if (e instanceof AgendamentoAtendimentoError) {
        res.status(400).json({ error: e.message });
        return;
      }
      const code = e instanceof Error ? e.message : "";
      if (code === "NOT_FOUND") {
        res.status(404).json({ error: "Agendamento não encontrado" });
        return;
      }
      if (code === "STATUS_INVALIDO") {
        res.status(400).json({
          error: `Paciente precisa estar presente para iniciar ${ASO_TITULO_CURTO}`,
        });
        return;
      }
      throw e;
    }
  }),
);

admissionaisRouter.get(
  "/:id/pdf",
  requireAuth(),
  requireModulo(...podeFormulario),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const row = getById(id);
    if (!row) {
      res.status(404).json({ error: `${ASO_TITULO_CURTO} não encontrado` });
      return;
    }
    assertMedicoAdmissional(req, row.medico_id);
    if (row.status !== "finalizado" || !row.conclusao) {
      res.status(400).json({
        error: `PDF disponível apenas após finalizar o ${ASO_TITULO_CURTO}`,
      });
      return;
    }

    const ctxRow = getDb()
      .prepare(
        `SELECT p.nome AS paciente_nome, p.data_nasc AS paciente_nasc, p.cpf AS paciente_cpf,
                u.nome AS medico_nome, u.crm AS medico_crm,
                c.nome AS clinica_nome, c.telefone AS clinica_telefone, c.endereco AS clinica_endereco,
                c.logo_path AS clinica_logo, c.cnpj_cpf AS clinica_cnpj
         FROM admissionais a
         JOIN pacientes p ON p.id = a.paciente_id
         JOIN usuarios u ON u.id = a.medico_id
         LEFT JOIN clinica c ON c.id = 1
         WHERE a.id = ?`,
      )
      .get(id) as {
        paciente_nome: string;
        paciente_nasc: string | null;
        paciente_cpf: string | null;
        medico_nome: string;
        medico_crm: string | null;
        clinica_nome: string | null;
        clinica_telefone: string | null;
        clinica_endereco: string | null;
        clinica_logo: string | null;
        clinica_cnpj: string | null;
      };

    const ctx = {
        clinica_nome: ctxRow.clinica_nome ?? "Consultório",
        clinica_telefone: ctxRow.clinica_telefone,
        clinica_endereco: ctxRow.clinica_endereco,
        clinica_logo: ctxRow.clinica_logo,
        clinica_cnpj: ctxRow.clinica_cnpj,
        medico_nome: ctxRow.medico_nome,
        medico_crm: ctxRow.medico_crm,
        paciente_nome: ctxRow.paciente_nome,
        paciente_nasc: ctxRow.paciente_nasc,
        paciente_cpf: ctxRow.paciente_cpf,
        data_emissao: row.finalizado_em ?? row.created_at,
      };

    let pdf: Buffer;
    if (isAsoLegado(row)) {
      const dados = parseDadosJson(row.dados_json);
      pdf = await gerarPdfAdmissional(ctx, {
        dados,
        conclusao: row.conclusao ?? "",
        restricoes_texto: row.restricoes_texto,
        admissional_id: id,
        finalizado_em: row.finalizado_em,
        retificacao_de_id: row.retificacao_de_id ?? null,
        motivo_retificacao: row.motivo_retificacao ?? null,
      });
    } else {
      let modelo;
      try {
        modelo = enriquecerAdmissionalModelo(row);
      } catch (e) {
        if (e instanceof FichaProntuarioError) {
          res.status(e.status).json({ error: e.message });
          return;
        }
        throw e;
      }
      if (!modelo) {
        res.status(400).json({ error: "Modelo ASO incompleto" });
        return;
      }
      const camposPdf = prepararCamposConsultaPdf(
        camposCorpoAso(modelo.aso_campos),
        modelo.dados,
      );
      const conc = String(row.conclusao ?? "").trim();
      pdf = await gerarPdfConsulta(
        ctx,
        modelo.aso_titulo_documento,
        camposPdf,
        {
          faixa: row.retificacao_de_id
            ? `RETIFICAÇÃO DO ASO Nº ${row.retificacao_de_id}  ·  folha nº ${id}`
            : undefined,
          faixaSub: row.motivo_retificacao?.trim()
            ? `Motivo: ${row.motivo_retificacao.trim()}`
            : undefined,
          conclusao: conc
            ? {
                label: "Conclusão",
                valor: rotuloOpcaoEscolha(conc),
                restricoes: row.restricoes_texto,
              }
            : undefined,
        },
      );
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="admissional-${id}.pdf"`,
    );
    res.send(pdf);
  }),
);

admissionaisRouter.get(
  "/:id",
  requireAuth(),
  requireModulo(...podeListar),
  asyncHandler(async (req, res) => {
    const row = getById(Number(req.params.id));
    if (!row) {
      res.status(404).json({ error: `${ASO_TITULO_CURTO} não encontrado` });
      return;
    }
    assertMedicoAdmissional(req, row.medico_id);
    const incluirDados = usuarioPodeVerFormularioAdmissional(req);
    try {
      res.json(rowToJson(row, { incluirDados }));
    } catch (e) {
      if (e instanceof FichaProntuarioError) {
        res.status(e.status).json({ error: e.message });
        return;
      }
      throw e;
    }
  }),
);

const exameAnexoSchema = z.object({
  exame_anexo_id: z.number().int().positive().nullable(),
});

admissionaisRouter.patch(
  "/:id/exame-anexo",
  requireAuth(),
  requireModulo("admissional", "exames_anexos"),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const row = getById(id);
    if (!row) {
      res.status(404).json({ error: `${ASO_TITULO_CURTO} não encontrado` });
      return;
    }
    assertMedicoAdmissional(req, row.medico_id);
    assertMedicoVinculoPaciente(req, row.paciente_id);

    const body = exameAnexoSchema.parse(req.body);
    if (body.exame_anexo_id != null) {
      const exame = getDb()
        .prepare(`SELECT id, paciente_id FROM exames_anexos WHERE id = ?`)
        .get(body.exame_anexo_id) as { id: number; paciente_id: number } | undefined;
      if (!exame) {
        res.status(400).json({ error: "Exame anexado não encontrado" });
        return;
      }
      if (exame.paciente_id !== row.paciente_id) {
        res.status(400).json({
          error: "O exame pertence a outro paciente",
        });
        return;
      }
    }

    getDb()
      .prepare(
        `UPDATE admissionais SET exame_anexo_id = ?,
         updated_at = datetime('now', 'localtime') WHERE id = ?`,
      )
      .run(body.exame_anexo_id, id);

    const atualizado = getDb()
      .prepare(
        `SELECT a.id, a.paciente_id, a.agendamento_id, a.medico_id, a.status,
                a.conclusao, a.restricoes_texto, a.exame_anexo_id,
                a.finalizado_em, a.created_at,
                a.retificacao_de_id, a.motivo_retificacao, a.retificacao_finalizada,
                u.nome AS medico_nome, u.crm AS medico_crm,
                e.descricao AS exame_descricao, e.arquivo_path AS exame_arquivo_path
         FROM admissionais a
         JOIN usuarios u ON u.id = a.medico_id
         LEFT JOIN exames_anexos e ON e.id = a.exame_anexo_id
         WHERE a.id = ?`,
      )
      .get(id) as AdmissionalHistoricoRow;

    res.json(mapHistoricoItem(atualizado));
  }),
);

const dadosSchema = z.object({
  versao: z.literal(2),
  empresa: z.string().max(500),
  ci: z.string().max(50),
  funcao: z.string().max(200),
  tipo_atestado: z.string().max(50),
  riscos_texto: z.string().max(4000),
  quimicos: z.record(z.string(), z.boolean()),
  fisicos: z.record(z.string(), z.boolean()),
  biologicos: z.boolean(),
  ergonomicos: z.boolean(),
  acidentes: z.record(z.string(), z.boolean()),
  riscos_outros: z.string().max(2000),
  exames: z.record(
    z.string(),
    z.object({
      realizado: z.boolean(),
      data: z.string().max(20),
    }),
  ),
  exames_outros: z.string().max(2000),
  nr35: z.string().max(30),
  observacoes: z.string().max(8000),
});

const saveSchema = z.object({
  dados: z.unknown().optional(),
  conclusao: z
    .enum(["apto", "inapto", "apto_com_restricao"])
    .nullable()
    .optional(),
  restricoes_texto: z.string().max(4000).nullable().optional(),
});

function isDadosV2(d: unknown): d is AdmissionalDados {
  return Boolean(
    d &&
      typeof d === "object" &&
      !Array.isArray(d) &&
      (d as { versao?: number }).versao === 2,
  );
}

function assertEditavel(row: AdmissionalRow): string | null {
  if (row.status === "finalizado") {
    return `${ASO_TITULO_CURTO} finalizado — não pode alterar. Para corrigir, use retificação no histórico.`;
  }
  if (row.status === "cancelado") return `${ASO_TITULO_CURTO} cancelado`;
  return null;
}

function findRetificacaoAberta(origemId: number): { id: number } | undefined {
  return getDb()
    .prepare(
      `SELECT id FROM admissionais
       WHERE retificacao_de_id = ? AND retificacao_finalizada = 0
         AND status != 'cancelado'`,
    )
    .get(origemId) as { id: number } | undefined;
}

const retificarBody = z.object({
  motivo_retificacao: z.string().min(3).max(2000),
});

admissionaisRouter.post(
  "/:id/retificar",
  requireAuth(),
  requireModulo(...podeFormulario),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const body = retificarBody.parse(req.body);
    const orig = getById(id);
    if (!orig) {
      res.status(404).json({ error: `${ASO_TITULO_CURTO} não encontrado` });
      return;
    }
    assertMedicoAdmissional(req, orig.medico_id);
    if (orig.retificacao_de_id) {
      res.status(400).json({
        error: `Só é possível retificar o ${ASO_TITULO_CURTO} original, não uma retificação`,
      });
      return;
    }
    if (orig.status !== "finalizado") {
      res.status(400).json({
        error: `Só é possível retificar ${ASO_TITULO_CURTO} finalizado`,
      });
      return;
    }
    const db = getDb();
    let novoId: number;
    try {
      novoId = db.transaction(() => {
        const aberta = findRetificacaoAberta(orig.id);
        if (aberta) {
          const err = new Error("RET_ABERTA");
          (err as Error & { admissional_id: number }).admissional_id = aberta.id;
          throw err;
        }
        const info = db
          .prepare(
            `INSERT INTO admissionais (
              paciente_id, agendamento_id, medico_id, status,
              conclusao, restricoes_texto, dados_json, exame_anexo_id,
              retificacao_de_id, motivo_retificacao, retificacao_finalizada,
              aso_template_id, template_snapshot_json,
              created_by
            ) VALUES (?, NULL, ?, 'em_preenchimento', ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
          )
          .run(
            orig.paciente_id,
            orig.medico_id,
            orig.conclusao,
            orig.restricoes_texto,
            orig.dados_json,
            orig.exame_anexo_id,
            orig.id,
            body.motivo_retificacao.trim(),
            orig.aso_template_id ?? null,
            orig.template_snapshot_json ?? null,
            req.usuario!.id,
          );
        return Number(info.lastInsertRowid);
      })();
    } catch (e) {
      if (e instanceof Error && e.message === "RET_ABERTA") {
        res.status(409).json({
          error: "Já existe retificação em andamento para este ASO",
          admissional_id: (e as Error & { admissional_id: number }).admissional_id,
        });
        return;
      }
      const msgErro = e instanceof Error ? e.message : "";
      const code = (e as { code?: string }).code ?? "";
      const uniqueAberta =
        code === "SQLITE_CONSTRAINT_UNIQUE" ||
        msgErro.includes("idx_admissionais_retificacao_aberta") ||
        (msgErro.includes("UNIQUE") && msgErro.includes("retificacao_de_id"));
      if (uniqueAberta) {
        const aberta = findRetificacaoAberta(orig.id);
        res.status(409).json({
          error: "Já existe retificação em andamento para este ASO",
          admissional_id: aberta?.id,
        });
        return;
      }
      throw e;
    }
    logAcesso({
      usuarioId: req.usuario!.id,
      pacienteId: orig.paciente_id,
      acao: "admissional_retificado",
      detalhe: `origem=${id} novo=${novoId}`,
    });

    res.status(201).json(rowToJson(getById(novoId)!));
  }),
);

admissionaisRouter.post(
  "/:id/cancelar-retificacao",
  requireAuth(),
  requireModulo(...podeFormulario),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const row = getById(id);
    if (!row) {
      res.status(404).json({ error: `${ASO_TITULO_CURTO} não encontrado` });
      return;
    }
    if (!row.retificacao_de_id) {
      res.status(400).json({
        error: "Só é possível cancelar uma retificação em andamento",
      });
      return;
    }
    if (row.status === "finalizado" || Number(row.retificacao_finalizada)) {
      res.status(400).json({
        error: "Retificação já foi salva — não pode ser cancelada",
      });
      return;
    }
    if (row.agendamento_id) {
      res.status(400).json({
        error: "Este ASO está ligado ao horário — não é uma folha de retificação",
      });
      return;
    }
    assertMedicoAdmissional(req, row.medico_id);

    getDb().prepare(`DELETE FROM admissionais WHERE id = ?`).run(id);

    logAcesso({
      usuarioId: req.usuario!.id,
      pacienteId: row.paciente_id,
      acao: "admissional_retificacao_cancelada",
      detalhe: `id=${id} origem=${row.retificacao_de_id}`,
    });

    res.json({ ok: true, admissional_origem_id: row.retificacao_de_id });
  }),
);

const modeloSchema = z.object({
  aso_template_id: z.number().int().positive(),
});

admissionaisRouter.patch(
  "/:id/modelo",
  requireAuth(),
  requireModulo(...podeFormulario),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const row = getById(id);
    if (!row) {
      res.status(404).json({ error: `${ASO_TITULO_CURTO} não encontrado` });
      return;
    }
    const bloqueio = assertEditavel(row);
    if (bloqueio) {
      res.status(400).json({ error: bloqueio });
      return;
    }
    if (row.retificacao_de_id) {
      res.status(400).json({ error: "Não é possível trocar o modelo numa retificação" });
      return;
    }
    assertMedicoAdmissional(req, row.medico_id);
    const body = modeloSchema.parse(req.body);
    try {
      assertFichaPermitida(row.medico_id, body.aso_template_id, "aso");
    } catch (e) {
      if (e instanceof FichaProntuarioError) {
        res.status(e.status).json({ error: e.message });
        return;
      }
      throw e;
    }
    const ficha = getFichaTemplateRowById(body.aso_template_id);
    if (!ficha) {
      res.status(404).json({ error: "Modelo ASO não encontrado" });
      return;
    }
    const dados = dadosVaziosAso(camposFromTemplate(ficha));
    if (row.conclusao) dados.conclusao = row.conclusao;
    getDb()
      .prepare(
        `UPDATE admissionais SET
          aso_template_id = ?,
          dados_json = ?,
          updated_at = datetime('now', 'localtime')
         WHERE id = ?`,
      )
      .run(body.aso_template_id, serializarDadosModeloAso(dados), id);
    res.json(rowToJson(getById(id)!));
  }),
);

admissionaisRouter.put(
  "/:id",
  requireAuth(),
  requireModulo(...podeFormulario),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const row = getById(id);
    if (!row) {
      res.status(404).json({ error: `${ASO_TITULO_CURTO} não encontrado` });
      return;
    }
    const bloqueio = assertEditavel(row);
    if (bloqueio) {
      res.status(400).json({ error: bloqueio });
      return;
    }
    assertMedicoAdmissional(req, row.medico_id);

    const body = saveSchema.parse(req.body);

    if (isAsoLegado(row)) {
      let dados: AdmissionalDados = parseDadosJson(row.dados_json);
      if (body.dados != null) {
        if (!isDadosV2(body.dados)) {
          res.status(400).json({ error: "Dados do ASO legado inválidos" });
          return;
        }
        dados = body.dados;
      }
      getDb()
        .prepare(
          `UPDATE admissionais SET
            dados_json = ?,
            conclusao = COALESCE(?, conclusao),
            restricoes_texto = COALESCE(?, restricoes_texto),
            updated_at = datetime('now', 'localtime')
           WHERE id = ?`,
        )
        .run(
          serializarDadosJson(dados),
          body.conclusao ?? null,
          body.restricoes_texto ?? null,
          id,
        );
    } else {
      if (body.dados != null && isDadosV2(body.dados)) {
        res.status(400).json({ error: "Use os campos do modelo ASO" });
        return;
      }
      let dados = parseDadosModeloAso(row.dados_json);
      if (body.dados && typeof body.dados === "object" && !Array.isArray(body.dados)) {
        dados = body.dados as Record<string, unknown>;
      }
      if (body.conclusao) dados.conclusao = body.conclusao;
      getDb()
        .prepare(
          `UPDATE admissionais SET
            dados_json = ?,
            conclusao = COALESCE(?, conclusao),
            restricoes_texto = COALESCE(?, restricoes_texto),
            updated_at = datetime('now', 'localtime')
           WHERE id = ?`,
        )
        .run(
          serializarDadosModeloAso(dados),
          body.conclusao ?? null,
          body.restricoes_texto ?? null,
          id,
        );
    }

    res.json(rowToJson(getById(id)!));
  }),
);

const finalizarSchema = z.object({
  conclusao: z.enum(["apto", "inapto", "apto_com_restricao"]),
  restricoes_texto: z.string().max(4000).optional(),
  dados: saveSchema.shape.dados,
});

admissionaisRouter.post(
  "/:id/finalizar",
  requireAuth(),
  requireModulo(...podeFormulario),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const row = getById(id);
    if (!row) {
      res.status(404).json({ error: `${ASO_TITULO_CURTO} não encontrado` });
      return;
    }
    const bloqueio = assertEditavel(row);
    if (bloqueio) {
      res.status(400).json({ error: bloqueio });
      return;
    }
    assertMedicoAdmissional(req, row.medico_id);

    const body = finalizarSchema.parse(req.body);
    if (
      body.conclusao === "apto_com_restricao" &&
      !body.restricoes_texto?.trim()
    ) {
      res.status(400).json({
        error: "Informe as restrições para apto com restrição",
      });
      return;
    }

    let dadosJson: string;
    let snapshotJson: string | null = row.template_snapshot_json ?? null;

    if (isAsoLegado(row)) {
      let dados: AdmissionalDados = parseDadosJson(row.dados_json);
      if (body.dados != null) {
        if (!isDadosV2(body.dados)) {
          res.status(400).json({ error: "Dados do ASO legado inválidos" });
          return;
        }
        dados = body.dados;
      }
      dadosJson = serializarDadosJson(dados);
    } else {
      if (body.dados != null && isDadosV2(body.dados)) {
        res.status(400).json({ error: "Use os campos do modelo ASO" });
        return;
      }
      let dados = parseDadosModeloAso(row.dados_json);
      if (body.dados && typeof body.dados === "object" && !Array.isArray(body.dados)) {
        dados = body.dados as Record<string, unknown>;
      }
      dados.conclusao = body.conclusao;
      dadosJson = serializarDadosModeloAso(dados);
      try {
        snapshotJson = snapshotAsoAoFinalizar(row);
      } catch (e) {
        if (e instanceof FichaProntuarioError) {
          res.status(e.status).json({ error: e.message });
          return;
        }
        throw e;
      }
    }

    getDb()
      .prepare(
        `UPDATE admissionais SET
          status = 'finalizado',
          conclusao = ?,
          restricoes_texto = ?,
          dados_json = ?,
          template_snapshot_json = COALESCE(?, template_snapshot_json),
          finalizado_em = datetime('now', 'localtime'),
          updated_at = datetime('now', 'localtime'),
          retificacao_finalizada = CASE
            WHEN retificacao_de_id IS NOT NULL THEN 1
            ELSE retificacao_finalizada
          END
         WHERE id = ?`,
      )
      .run(
        body.conclusao,
        body.restricoes_texto?.trim() || null,
        dadosJson,
        snapshotJson,
        id,
      );

    finalizarAgendamentoVinculado(row.agendamento_id);

    logAcesso({
      usuarioId: req.usuario!.id,
      pacienteId: row.paciente_id,
      acao: "admissional_finalizado",
      detalhe: row.retificacao_de_id
        ? `id=${id} retificacao_de=${row.retificacao_de_id} conclusao=${body.conclusao}`
        : `id=${id} conclusao=${body.conclusao}`,
    });

    res.json(rowToJson(getById(id)!));
  }),
);
