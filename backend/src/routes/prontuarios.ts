import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireModulo } from "../auth/middleware.js";
import { getDb } from "../db/index.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { logAcesso } from "../services/logAcesso.js";
import {
  assertConsultaEditavel,
  isConsultaEncerrada,
} from "../services/consultaEncerrada.js";
import { calcularRetornoAte } from "../services/retornoService.js";
import {
  assertMedicoVinculoPaciente,
} from "../services/vinculosClinicos.js";
import { getProntuarioOrThrow } from "../services/prontuarioAccess.js";
import {
  assertFichaPermitida,
  buildTemplateSnapshot,
  dadosJsonParaLegado,
  dadosJsonToString,
  enriquecerProntuarioFicha,
  FichaProntuarioError,
  getFichaTemplateOrThrow,
  legadoParaDadosJson,
  parseDadosJson,
  resolveFichaTemplateIdFromAgendamento,
  persistirFichaProntuarioSePendente,
  snapshotToJson,
  camposFromTemplate,
} from "../services/fichaProntuario.js";
import {
  AgendamentoAtendimentoError,
  assertHorarioAbreProntuario,
} from "../services/agendamentoAtendimento.js";

export const prontuariosRouter = Router();

const PRONTUARIO_DETALHE_SQL = `SELECT
  pr.id, pr.paciente_id, pr.agendamento_id, pr.medico_id, pr.data_atendimento,
  pr.queixa_principal, pr.anamnese, pr.exame_fisico, pr.hipotese_diagnostica,
  pr.cid_codigo, pr.cid_descricao, pr.conduta, pr.plano,
  pr.retorno_dias, pr.retorno_ate, pr.retificacao_de_id, pr.motivo_retificacao,
  pr.retificacao_finalizada, pr.created_at,
  pr.ficha_template_id, pr.template_snapshot_json, pr.dados_json,
  p.nome AS paciente_nome, p.data_nasc AS paciente_nasc, p.cpf AS paciente_cpf,
  p.telefone AS paciente_telefone, p.email AS paciente_email,
  p.alergias, p.medicacoes_uso, p.observacoes_clinicas,
  u.nome AS medico_nome, u.crm AS medico_crm
 FROM prontuarios pr
 JOIN pacientes p ON p.id = pr.paciente_id
 JOIN usuarios u ON u.id = pr.medico_id`;

function mapProntuarioDetalheResponse(
  row: Record<string, unknown>,
  prontuarioId?: number,
): Record<string, unknown> {
  const flags = row as {
    agendamento_id: number | null;
    retificacao_de_id: number | null;
    retificacao_finalizada: number | null;
  };
  const consulta_encerrada = isConsultaEncerrada(flags);
  const ficha = enriquecerProntuarioFicha({
    ...(row as Record<string, unknown>),
    consulta_encerrada,
  } as Parameters<typeof enriquecerProntuarioFicha>[0]);
  const id = prontuarioId ?? Number(row.id);
  if (Number.isFinite(id)) {
    persistirFichaProntuarioSePendente(
      id,
      { ...(row as Record<string, unknown>), consulta_encerrada },
      ficha,
    );
  }
  return {
    ...row,
    consulta_encerrada,
    ficha_template_id: ficha.ficha_template_id,
    ficha_titulo_documento: ficha.ficha_titulo_documento,
    ficha_modo: ficha.ficha_modo,
    ficha_campos: ficha.ficha_campos,
    ficha_campos_posicao: ficha.ficha_campos_posicao,
    dados_json: ficha.dados,
  };
}

function mapHistoricoItem(row: Record<string, unknown>): Record<string, unknown> {
  const flags = row as {
    agendamento_id: number | null;
    retificacao_de_id: number | null;
    retificacao_finalizada: number | null;
  };
  const consulta_encerrada = isConsultaEncerrada(flags);
  const ficha = enriquecerProntuarioFicha({
    ...(row as Record<string, unknown>),
    consulta_encerrada,
  } as Parameters<typeof enriquecerProntuarioFicha>[0]);
  return {
    ...row,
    consulta_encerrada,
    ficha_template_id: ficha.ficha_template_id,
    ficha_titulo_documento: ficha.ficha_titulo_documento,
    ficha_modo: ficha.ficha_modo,
    ficha_campos: ficha.ficha_campos,
    ficha_campos_posicao: ficha.ficha_campos_posicao,
    dados_json: ficha.dados,
  };
}

function handleFichaError(e: unknown, res: { status: (n: number) => { json: (o: unknown) => void } }): boolean {
  if (e instanceof FichaProntuarioError) {
    res.status(e.status).json({ error: e.message });
    return true;
  }
  return false;
}

prontuariosRouter.use(requireAuth());

const txt = (max: number) => z.string().max(max).nullable().optional();

const prontuarioBody = z.object({
  queixa_principal: txt(8000),
  anamnese: txt(16000),
  exame_fisico: txt(16000),
  hipotese_diagnostica: txt(4000),
  cid_codigo: txt(10),
  cid_descricao: txt(500),
  conduta: txt(8000),
  plano: txt(8000),
  retorno_dias: z.number().int().min(1).max(365).nullable().optional(),
  dados_json: z.union([z.record(z.string(), z.unknown()), z.string()]).optional(),
});

prontuariosRouter.post(
  "/abrir",
  requireModulo("prontuario_escrever", "fila_medico"),
  asyncHandler(async (req, res) => {
    const agendamentoId = Number(
      (req.body as { agendamento_id?: number }).agendamento_id,
    );
    if (!agendamentoId) {
      res.status(400).json({ error: "agendamento_id obrigatório" });
      return;
    }
    const ag = getDb()
      .prepare(
        `SELECT id, paciente_id, medico_id, status, tipo_atendimento, ficha_template_id
         FROM agendamentos WHERE id = ?`,
      )
      .get(agendamentoId) as
      | {
          id: number;
          paciente_id: number;
          medico_id: number;
          status: string;
          tipo_atendimento: string;
          ficha_template_id: number | null;
        }
      | undefined;
    if (!ag) {
      res.status(404).json({ error: "Agendamento não encontrado" });
      return;
    }
    try {
      assertHorarioAbreProntuario(agendamentoId);
    } catch (e) {
      if (e instanceof AgendamentoAtendimentoError) {
        res.status(400).json({ error: e.message });
        return;
      }
      throw e;
    }
    if (
      req.usuario!.perfil === "medico" &&
      ag.medico_id !== req.usuario!.id
    ) {
      res.status(403).json({ error: "Agendamento de outro médico" });
      return;
    }
    if (!["presente", "em_atendimento"].includes(ag.status)) {
      res.status(400).json({
        error: "Paciente precisa estar presente para iniciar atendimento",
      });
      return;
    }

    let fichaTemplateId: number;
    try {
      fichaTemplateId = resolveFichaTemplateIdFromAgendamento(ag);
      assertFichaPermitida(ag.medico_id, fichaTemplateId);
    } catch (e) {
      if (handleFichaError(e, res)) return;
      throw e;
    }

    const db = getDb();
    const prontuario = db.transaction(() => {
      let row = db
        .prepare(`SELECT * FROM prontuarios WHERE agendamento_id = ?`)
        .get(agendamentoId) as
        | {
            id: number;
            ficha_template_id: number | null;
            dados_json: string | null;
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
      if (!row) {
        const ficha = getFichaTemplateOrThrow(fichaTemplateId);
        const campos = camposFromTemplate(ficha);
        const dadosIniciais = legadoParaDadosJson({}, campos);
        const info = db
          .prepare(
            `INSERT INTO prontuarios (
              paciente_id, agendamento_id, medico_id, ficha_template_id, dados_json
            ) VALUES (?, ?, ?, ?, ?)`,
          )
          .run(
            ag.paciente_id,
            agendamentoId,
            ag.medico_id,
            fichaTemplateId,
            dadosJsonToString(dadosIniciais),
          );
        row = db
          .prepare(`SELECT * FROM prontuarios WHERE id = ?`)
          .get(info.lastInsertRowid) as typeof row;
      } else {
        const prFichaId = row.ficha_template_id ?? fichaTemplateId;
        assertFichaPermitida(ag.medico_id, prFichaId);
        const ficha = getFichaTemplateOrThrow(prFichaId);
        const campos = camposFromTemplate(ficha);
        let dadosJson = row.dados_json;
        if (!dadosJson?.trim()) {
          const dados = legadoParaDadosJson(row, campos);
          dadosJson = dadosJsonToString(dados);
        }
        db.prepare(
          `UPDATE prontuarios SET
            ficha_template_id = COALESCE(ficha_template_id, ?),
            dados_json = COALESCE(dados_json, ?)
           WHERE id = ?`,
        ).run(fichaTemplateId, dadosJson, row.id);
        row = db
          .prepare(`SELECT * FROM prontuarios WHERE id = ?`)
          .get(row.id) as typeof row;
      }
      if (ag.status !== "em_atendimento") {
        db.prepare(
          `UPDATE agendamentos SET status = 'em_atendimento',
           updated_at = datetime('now', 'localtime') WHERE id = ?`,
        ).run(agendamentoId);
      }
      return row;
    })();

    logAcesso({
      usuarioId: req.usuario!.id,
      pacienteId: ag.paciente_id,
      acao: "atendimento_aberto",
      detalhe: `agendamento=${agendamentoId}`,
    });

    const paciente = getDb()
      .prepare(`SELECT * FROM pacientes WHERE id = ?`)
      .get(ag.paciente_id);

    const prontuarioDetalhe = getDb()
      .prepare(`${PRONTUARIO_DETALHE_SQL} WHERE pr.id = ?`)
      .get((prontuario as { id: number }).id) as Record<string, unknown> | undefined;

    res.json({
      prontuario: prontuarioDetalhe
        ? mapProntuarioDetalheResponse(prontuarioDetalhe)
        : prontuario,
      paciente,
      agendamento_id: agendamentoId,
    });
  }),
);

prontuariosRouter.get(
  "/paciente/:pacienteId",
  requireModulo("prontuario_ler", "prontuario_escrever"),
  asyncHandler(async (req, res) => {
    const pacienteId = Number(req.params.pacienteId);
    if (req.usuario!.perfil === "medico") {
      assertMedicoVinculoPaciente(req, pacienteId);
    }
    let sql = `
         SELECT pr.*, u.nome AS medico_nome,
                EXISTS(SELECT 1 FROM receitas r WHERE r.prontuario_id = pr.id) AS tem_receita,
                EXISTS(SELECT 1 FROM pedidos_exame pe WHERE pe.prontuario_id = pr.id) AS tem_pedido_exame,
                EXISTS(SELECT 1 FROM atestados at WHERE at.prontuario_id = pr.id) AS tem_atestado
         FROM prontuarios pr
         JOIN usuarios u ON u.id = pr.medico_id
         WHERE pr.paciente_id = ?`;
    const params: unknown[] = [pacienteId];
    if (req.usuario!.perfil === "medico") {
      sql += ` AND pr.medico_id = ?`;
      params.push(req.usuario!.id);
    }
    sql += ` ORDER BY pr.data_atendimento DESC`;
    const rows = getDb().prepare(sql).all(...params) as Record<string, unknown>[];
    logAcesso({
      usuarioId: req.usuario!.id,
      pacienteId,
      acao: "prontuario_historico_lido",
    });
    res.json(rows.map(mapHistoricoItem));
  }),
);

prontuariosRouter.get(
  "/:id",
  requireModulo("prontuario_ler", "prontuario_escrever", "fila_medico"),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    getProntuarioOrThrow(id, req);
    const row = getDb()
      .prepare(`${PRONTUARIO_DETALHE_SQL} WHERE pr.id = ?`)
      .get(id) as Record<string, unknown> | undefined;
    if (!row) {
      res.status(404).json({ error: "Prontuário não encontrado" });
      return;
    }
    logAcesso({
      usuarioId: req.usuario!.id,
      pacienteId: (row as { paciente_id: number }).paciente_id,
      acao: "prontuario_lido",
      detalhe: `id=${id}`,
    });
    res.json(mapProntuarioDetalheResponse(row, id));
  }),
);

prontuariosRouter.put(
  "/:id",
  requireModulo("prontuario_escrever"),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const body = prontuarioBody.parse(req.body);
    const atual = getDb()
      .prepare(`SELECT * FROM prontuarios WHERE id = ?`)
      .get(id) as
      | {
          medico_id: number;
          paciente_id: number;
          data_atendimento: string;
          retorno_dias: number | null;
          retorno_ate: string | null;
          ficha_template_id: number | null;
          dados_json: string | null;
          queixa_principal: string | null;
          anamnese: string | null;
          exame_fisico: string | null;
          hipotese_diagnostica: string | null;
          conduta: string | null;
          plano: string | null;
          cid_codigo: string | null;
          cid_descricao: string | null;
        }
      | undefined;
    if (!atual) {
      res.status(404).json({ error: "Prontuário não encontrado" });
      return;
    }
    if (
      req.usuario!.perfil === "medico" &&
      atual.medico_id !== req.usuario!.id
    ) {
      res.status(403).json({ error: "Prontuário de outro médico" });
      return;
    }
    assertConsultaEditavel(id);

    let fichaId = atual.ficha_template_id;
    if (fichaId == null) {
      try {
        fichaId = resolveFichaTemplateIdFromAgendamento({});
        assertFichaPermitida(atual.medico_id, fichaId);
        getDb()
          .prepare(`UPDATE prontuarios SET ficha_template_id = ? WHERE id = ?`)
          .run(fichaId, id);
      } catch (e) {
        if (handleFichaError(e, res)) return;
        throw e;
      }
    }
    try {
      assertFichaPermitida(atual.medico_id, fichaId);
    } catch (e) {
      if (handleFichaError(e, res)) return;
      throw e;
    }

    const ficha = getFichaTemplateOrThrow(fichaId);
    const campos = camposFromTemplate(ficha);

    let dados: Record<string, unknown>;
    if (body.dados_json !== undefined) {
      dados =
        typeof body.dados_json === "string"
          ? parseDadosJson(body.dados_json)
          : (body.dados_json as Record<string, unknown>);
    } else if (atual.dados_json?.trim()) {
      dados = parseDadosJson(atual.dados_json);
    } else {
      dados = legadoParaDadosJson(
        {
          queixa_principal: body.queixa_principal ?? atual.queixa_principal,
          anamnese: body.anamnese ?? atual.anamnese,
          exame_fisico: body.exame_fisico ?? atual.exame_fisico,
          hipotese_diagnostica:
            body.hipotese_diagnostica ?? atual.hipotese_diagnostica,
          conduta: body.conduta ?? atual.conduta,
          plano: body.plano ?? atual.plano,
          cid_codigo: body.cid_codigo ?? atual.cid_codigo,
          cid_descricao: body.cid_descricao ?? atual.cid_descricao,
          retorno_dias:
            body.retorno_dias !== undefined
              ? body.retorno_dias
              : atual.retorno_dias,
        },
        campos,
      );
    }

    const legado = dadosJsonParaLegado(dados, campos);
    const retornoDias = legado.retorno_dias ?? null;
    const retornoAte =
      retornoDias != null
        ? calcularRetornoAte(atual.data_atendimento, retornoDias)
        : null;

    getDb()
      .prepare(
        `UPDATE prontuarios SET
          queixa_principal = ?, anamnese = ?, exame_fisico = ?,
          hipotese_diagnostica = ?, cid_codigo = ?, cid_descricao = ?,
          conduta = ?, plano = ?, retorno_dias = ?, retorno_ate = ?,
          dados_json = ?
         WHERE id = ?`,
      )
      .run(
        legado.queixa_principal ?? null,
        legado.anamnese ?? null,
        legado.exame_fisico ?? null,
        legado.hipotese_diagnostica ?? null,
        legado.cid_codigo ?? null,
        legado.cid_descricao ?? null,
        legado.conduta ?? null,
        legado.plano ?? null,
        retornoDias,
        retornoAte,
        dadosJsonToString(dados),
        id,
      );
    const updated = getDb()
      .prepare(`${PRONTUARIO_DETALHE_SQL} WHERE pr.id = ?`)
      .get(id) as Record<string, unknown>;
    res.json(mapProntuarioDetalheResponse(updated));
  }),
);

const retificarBody = z.object({
  motivo_retificacao: z.string().min(3).max(2000),
});

prontuariosRouter.post(
  "/:id/retificar",
  requireModulo("prontuario_escrever"),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const body = retificarBody.parse(req.body);
    const orig = getDb()
      .prepare(`SELECT * FROM prontuarios WHERE id = ?`)
      .get(id) as
      | {
          id: number;
          paciente_id: number;
          medico_id: number;
          agendamento_id: number | null;
          retificacao_de_id: number | null;
          retificacao_finalizada: number | null;
          ficha_template_id: number | null;
          dados_json: string | null;
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
        }
      | undefined;
    if (!orig) {
      res.status(404).json({ error: "Prontuário não encontrado" });
      return;
    }
    if (
      req.usuario!.perfil === "medico" &&
      orig.medico_id !== req.usuario!.id
    ) {
      res.status(403).json({ error: "Prontuário de outro médico" });
      return;
    }
    if (
      !isConsultaEncerrada({
        agendamento_id: orig.agendamento_id,
        retificacao_de_id: orig.retificacao_de_id,
        retificacao_finalizada: orig.retificacao_finalizada,
      })
    ) {
      res.status(400).json({
        error: "Só é possível retificar consulta finalizada",
      });
      return;
    }
    const retAberta = getDb()
      .prepare(
        `SELECT id FROM prontuarios
         WHERE retificacao_de_id = ? AND retificacao_finalizada = 0`,
      )
      .get(orig.id) as { id: number } | undefined;
    if (retAberta) {
      res.status(409).json({
        error: "Já existe retificação em andamento para esta consulta",
      });
      return;
    }

    const fichaId = orig.ficha_template_id;
    let dadosJson = orig.dados_json;
    if (fichaId != null) {
      try {
        assertFichaPermitida(orig.medico_id, fichaId);
      } catch (e) {
        if (handleFichaError(e, res)) return;
        throw e;
      }
      if (!dadosJson?.trim()) {
        const ficha = getFichaTemplateOrThrow(fichaId);
        const campos = camposFromTemplate(ficha);
        dadosJson = dadosJsonToString(legadoParaDadosJson(orig, campos));
      }
    }

    const info = getDb()
      .prepare(
        `INSERT INTO prontuarios (
          paciente_id, medico_id, data_atendimento,
          queixa_principal, anamnese, exame_fisico, hipotese_diagnostica,
          cid_codigo, cid_descricao, conduta, plano,
          retorno_dias, retorno_ate, retificacao_de_id, motivo_retificacao,
          ficha_template_id, dados_json
        ) VALUES (?, ?, date('now', 'localtime'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        orig.paciente_id,
        orig.medico_id,
        orig.queixa_principal,
        orig.anamnese,
        orig.exame_fisico,
        orig.hipotese_diagnostica,
        orig.cid_codigo,
        orig.cid_descricao,
        orig.conduta,
        orig.plano,
        orig.retorno_dias,
        orig.retorno_ate,
        orig.id,
        body.motivo_retificacao.trim(),
        fichaId,
        dadosJson,
      );

    const novoId = Number(info.lastInsertRowid);
    logAcesso({
      usuarioId: req.usuario!.id,
      pacienteId: orig.paciente_id,
      acao: "prontuario_retificado",
      detalhe: `origem=${id} novo=${novoId}`,
    });

    const row = getDb()
      .prepare(`${PRONTUARIO_DETALHE_SQL} WHERE pr.id = ?`)
      .get(novoId) as Record<string, unknown>;
    res.status(201).json({ prontuario: mapProntuarioDetalheResponse(row) });
  }),
);

prontuariosRouter.post(
  "/:id/cancelar-retificacao",
  requireModulo("prontuario_escrever"),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const pr = getDb()
      .prepare(`SELECT * FROM prontuarios WHERE id = ?`)
      .get(id) as
      | {
          id: number;
          paciente_id: number;
          medico_id: number;
          agendamento_id: number | null;
          retificacao_de_id: number | null;
          retificacao_finalizada: number;
        }
      | undefined;
    if (!pr) {
      res.status(404).json({ error: "Prontuário não encontrado" });
      return;
    }
    if (!pr.retificacao_de_id) {
      res.status(400).json({
        error: "Só é possível cancelar um prontuário de retificação em andamento",
      });
      return;
    }
    if (pr.retificacao_finalizada) {
      res.status(400).json({
        error: "Retificação já foi salva — não pode ser cancelada",
      });
      return;
    }
    if (pr.agendamento_id) {
      res.status(400).json({
        error: "Retificação vinculada a agendamento — use o prontuário normal",
      });
      return;
    }
    if (
      req.usuario!.perfil === "medico" &&
      pr.medico_id !== req.usuario!.id
    ) {
      res.status(403).json({ error: "Prontuário de outro médico" });
      return;
    }

    const db = getDb();
    db.transaction(() => {
      const receitas = db
        .prepare(`SELECT id FROM receitas WHERE prontuario_id = ?`)
        .all(id) as { id: number }[];
      for (const r of receitas) {
        db.prepare(`DELETE FROM receita_itens WHERE receita_id = ?`).run(r.id);
      }
      db.prepare(`DELETE FROM receitas WHERE prontuario_id = ?`).run(id);
      db.prepare(`DELETE FROM atestados WHERE prontuario_id = ?`).run(id);
      db.prepare(`DELETE FROM pedidos_exame WHERE prontuario_id = ?`).run(id);
      db.prepare(`UPDATE exames_anexos SET prontuario_id = NULL WHERE prontuario_id = ?`).run(
        id,
      );
      db.prepare(`DELETE FROM prontuarios WHERE id = ?`).run(id);
    })();

    logAcesso({
      usuarioId: req.usuario!.id,
      pacienteId: pr.paciente_id,
      acao: "retificacao_cancelada",
      detalhe: `id=${id} origem=${pr.retificacao_de_id}`,
    });

    res.json({ ok: true, prontuario_origem_id: pr.retificacao_de_id });
  }),
);

prontuariosRouter.post(
  "/:id/finalizar",
  requireModulo("prontuario_escrever"),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const pr = getDb()
      .prepare(`SELECT * FROM prontuarios WHERE id = ?`)
      .get(id) as
      | {
          agendamento_id: number | null;
          medico_id: number;
          paciente_id: number;
          retificacao_de_id: number | null;
          ficha_template_id: number | null;
          template_snapshot_json: string | null;
        }
      | undefined;
    if (!pr) {
      res.status(404).json({ error: "Prontuário não encontrado" });
      return;
    }
    if (
      req.usuario!.perfil === "medico" &&
      pr.medico_id !== req.usuario!.id
    ) {
      res.status(403).json({ error: "Prontuário de outro médico" });
      return;
    }
    assertConsultaEditavel(id);

    let fichaId = pr.ficha_template_id;
    if (fichaId == null) {
      try {
        fichaId = resolveFichaTemplateIdFromAgendamento({});
        assertFichaPermitida(pr.medico_id, fichaId);
        getDb()
          .prepare(`UPDATE prontuarios SET ficha_template_id = ? WHERE id = ?`)
          .run(fichaId, id);
      } catch (e) {
        if (handleFichaError(e, res)) return;
        throw e;
      }
    }

    if (!pr.template_snapshot_json?.trim()) {
      try {
        assertFichaPermitida(pr.medico_id, fichaId);
        const ficha = getFichaTemplateOrThrow(fichaId);
        const snapshot = buildTemplateSnapshot(ficha);
        getDb()
          .prepare(
            `UPDATE prontuarios SET template_snapshot_json = ? WHERE id = ?`,
          )
          .run(snapshotToJson(snapshot), id);
      } catch (e) {
        if (handleFichaError(e, res)) return;
        throw e;
      }
    }

    if (pr.agendamento_id) {
      getDb()
        .prepare(
          `UPDATE agendamentos SET status = 'finalizado',
           updated_at = datetime('now', 'localtime') WHERE id = ?`,
        )
        .run(pr.agendamento_id);
    }
    if (pr.retificacao_de_id) {
      getDb()
        .prepare(`UPDATE prontuarios SET retificacao_finalizada = 1 WHERE id = ?`)
        .run(id);
    }
    logAcesso({
      usuarioId: req.usuario!.id,
      pacienteId: pr.paciente_id,
      acao: "atendimento_finalizado",
      detalhe: `prontuario=${id}`,
    });
    res.json({ ok: true });
  }),
);
