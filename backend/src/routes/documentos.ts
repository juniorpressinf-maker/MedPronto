import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireModulo } from "../auth/middleware.js";
import { getDb } from "../db/index.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import {
  gerarPdfAtestado,
  gerarPdfConsulta,
  gerarPdfPedidoExame,
  gerarPdfReceita,
} from "../services/documentPdf.js";
import {
  enriquecerProntuarioFicha,
  FichaProntuarioError,
  prepararCamposConsultaPdf,
} from "../services/fichaProntuario.js";
import {
  getDocumentoContext,
  getProntuarioOrThrow,
} from "../services/prontuarioAccess.js";
import { assertConsultaEditavel, isConsultaEncerrada } from "../services/consultaEncerrada.js";
import { logAcesso } from "../services/logAcesso.js";
import {
  gerarDocumentosLotePdf,
  listarDocumentosLote,
} from "../services/documentosLote.js";

export const documentosRouter = Router({ mergeParams: true });

documentosRouter.use(requireAuth());

const receitaItemSchema = z.object({
  medicamento: z.string().min(1).max(200),
  dosagem: z.string().max(100).optional().nullable(),
  via: z.string().max(50).optional().nullable(),
  posologia: z.string().max(300).optional().nullable(),
  quantidade: z.string().max(50).optional().nullable(),
  duracao_dias: z.number().int().min(1).max(999).nullable().optional(),
});

const receitaBodySchema = z.object({
  observacoes: z.string().max(2000).optional().nullable(),
  itens: z.array(receitaItemSchema).max(30),
});

const atestadoBodySchema = z.object({
  dias_afastamento: z.number().int().min(0).max(365).nullable().optional(),
  cid_codigo: z.string().max(10).optional().nullable(),
  cid_descricao: z.string().max(500).optional().nullable(),
  texto_livre: z.string().max(4000).optional().nullable(),
});

const pedidoBodySchema = z.object({
  exames_solicitados: z.string().min(1).max(8000),
  observacoes: z.string().max(2000).optional().nullable(),
});

function ctxFromRow(row: NonNullable<ReturnType<typeof getDocumentoContext>>) {
  return {
    clinica_nome: row.clinica_nome ?? "Consultório",
    clinica_telefone: row.clinica_telefone,
    clinica_endereco: row.clinica_endereco,
    clinica_logo: row.clinica_logo,
    medico_nome: row.medico_nome,
    medico_crm: row.medico_crm,
    paciente_nome: row.paciente_nome,
    paciente_nasc: row.paciente_nasc,
    paciente_cpf: row.paciente_cpf,
    data_emissao: row.data_atendimento,
  };
}

function loadReceita(prontuarioId: number) {
  const receita = getDb()
    .prepare(`SELECT * FROM receitas WHERE prontuario_id = ? ORDER BY id DESC LIMIT 1`)
    .get(prontuarioId) as
    | {
        id: number;
        observacoes: string | null;
      }
    | undefined;
  if (!receita) return { receita: null, itens: [] };
  const itens = getDb()
    .prepare(`SELECT * FROM receita_itens WHERE receita_id = ? ORDER BY id`)
    .all(receita.id);
  return { receita, itens };
}

documentosRouter.get(
  "/receita",
  requireModulo("receituario", "prontuario_ler"),
  asyncHandler(async (req, res) => {
    const prontuarioId = Number(req.params.prontuarioId);
    getProntuarioOrThrow(prontuarioId, req);
    res.json(loadReceita(prontuarioId));
  }),
);

documentosRouter.put(
  "/receita",
  requireModulo("receituario"),
  asyncHandler(async (req, res) => {
    const prontuarioId = Number(req.params.prontuarioId);
    const pr = getProntuarioOrThrow(prontuarioId, req);
    assertConsultaEditavel(prontuarioId);
    const body = receitaBodySchema.parse(req.body);
    const db = getDb();
    const existing = db
      .prepare(`SELECT id FROM receitas WHERE prontuario_id = ? ORDER BY id DESC LIMIT 1`)
      .get(prontuarioId) as { id: number } | undefined;

    const tx = db.transaction(() => {
      let receitaId: number;
      if (existing) {
        receitaId = existing.id;
        db.prepare(`UPDATE receitas SET observacoes = ? WHERE id = ?`).run(
          body.observacoes ?? null,
          receitaId,
        );
        db.prepare(`DELETE FROM receita_itens WHERE receita_id = ?`).run(receitaId);
      } else {
        const info = db
          .prepare(
            `INSERT INTO receitas (prontuario_id, paciente_id, medico_id, observacoes)
             VALUES (?, ?, ?, ?)`,
          )
          .run(prontuarioId, pr.paciente_id, pr.medico_id, body.observacoes ?? null);
        receitaId = Number(info.lastInsertRowid);
      }
      const ins = db.prepare(
        `INSERT INTO receita_itens (receita_id, medicamento, dosagem, via, posologia, quantidade, duracao_dias)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const it of body.itens) {
        ins.run(
          receitaId,
          it.medicamento,
          it.dosagem ?? null,
          it.via ?? null,
          it.posologia ?? null,
          it.quantidade ?? null,
          it.duracao_dias ?? null,
        );
      }
      return receitaId;
    });
    tx();
    res.json(loadReceita(prontuarioId));
  }),
);

documentosRouter.get(
  "/receita/pdf",
  requireModulo("receituario", "prontuario_ler"),
  asyncHandler(async (req, res) => {
    const prontuarioId = Number(req.params.prontuarioId);
    getProntuarioOrThrow(prontuarioId, req);
    const row = getDocumentoContext(prontuarioId);
    if (!row) {
      res.status(404).json({ error: "Prontuário não encontrado" });
      return;
    }
    const { receita, itens } = loadReceita(prontuarioId);
    if (!receita || itens.length === 0) {
      res.status(400).json({ error: "Salve a receita com ao menos um medicamento" });
      return;
    }
    const pdf = await gerarPdfReceita(
      ctxFromRow(row),
      itens as {
        medicamento: string;
        dosagem?: string | null;
        via?: string | null;
        posologia?: string | null;
        quantidade?: string | null;
        duracao_dias?: number | null;
      }[],
      receita.observacoes,
    );
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="receita-${prontuarioId}.pdf"`,
    );
    res.send(pdf);
  }),
);

documentosRouter.get(
  "/atestado",
  requireModulo("documentos", "prontuario_ler"),
  asyncHandler(async (req, res) => {
    const prontuarioId = Number(req.params.prontuarioId);
    getProntuarioOrThrow(prontuarioId, req);
    const atestado = getDb()
      .prepare(`SELECT * FROM atestados WHERE prontuario_id = ? ORDER BY id DESC LIMIT 1`)
      .get(prontuarioId);
    res.json({ atestado: atestado ?? null });
  }),
);

documentosRouter.put(
  "/atestado",
  requireModulo("documentos"),
  asyncHandler(async (req, res) => {
    const prontuarioId = Number(req.params.prontuarioId);
    const pr = getProntuarioOrThrow(prontuarioId, req);
    assertConsultaEditavel(prontuarioId);
    const body = atestadoBodySchema.parse(req.body);
    const db = getDb();
    const existing = db
      .prepare(`SELECT id FROM atestados WHERE prontuario_id = ? ORDER BY id DESC LIMIT 1`)
      .get(prontuarioId) as { id: number } | undefined;

    if (existing) {
      db.prepare(
        `UPDATE atestados SET dias_afastamento = ?, cid_codigo = ?, cid_descricao = ?, texto_livre = ?
         WHERE id = ?`,
      ).run(
        body.dias_afastamento ?? null,
        body.cid_codigo ?? null,
        body.cid_descricao ?? null,
        body.texto_livre ?? null,
        existing.id,
      );
    } else {
      db.prepare(
        `INSERT INTO atestados (prontuario_id, paciente_id, medico_id, dias_afastamento, cid_codigo, cid_descricao, texto_livre)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        prontuarioId,
        pr.paciente_id,
        pr.medico_id,
        body.dias_afastamento ?? null,
        body.cid_codigo ?? null,
        body.cid_descricao ?? null,
        body.texto_livre ?? null,
      );
    }
    const atestado = db
      .prepare(`SELECT * FROM atestados WHERE prontuario_id = ? ORDER BY id DESC LIMIT 1`)
      .get(prontuarioId);
    res.json({ atestado });
  }),
);

documentosRouter.get(
  "/atestado/pdf",
  requireModulo("documentos", "prontuario_ler"),
  asyncHandler(async (req, res) => {
    const prontuarioId = Number(req.params.prontuarioId);
    getProntuarioOrThrow(prontuarioId, req);
    const row = getDocumentoContext(prontuarioId);
    if (!row) {
      res.status(404).json({ error: "Prontuário não encontrado" });
      return;
    }
    const atestado = getDb()
      .prepare(`SELECT * FROM atestados WHERE prontuario_id = ? ORDER BY id DESC LIMIT 1`)
      .get(prontuarioId) as
      | {
          dias_afastamento: number | null;
          cid_codigo: string | null;
          cid_descricao: string | null;
          texto_livre: string | null;
        }
      | undefined;
    if (!atestado) {
      res.status(400).json({ error: "Salve o atestado antes de gerar o PDF" });
      return;
    }
    const pdf = await gerarPdfAtestado(ctxFromRow(row), atestado);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="atestado-${prontuarioId}.pdf"`,
    );
    res.send(pdf);
  }),
);

documentosRouter.get(
  "/pedido-exame",
  requireModulo("documentos", "prontuario_ler"),
  asyncHandler(async (req, res) => {
    const prontuarioId = Number(req.params.prontuarioId);
    getProntuarioOrThrow(prontuarioId, req);
    const pedido = getDb()
      .prepare(`SELECT * FROM pedidos_exame WHERE prontuario_id = ? ORDER BY id DESC LIMIT 1`)
      .get(prontuarioId);
    res.json({ pedido: pedido ?? null });
  }),
);

documentosRouter.put(
  "/pedido-exame",
  requireModulo("documentos"),
  asyncHandler(async (req, res) => {
    const prontuarioId = Number(req.params.prontuarioId);
    const pr = getProntuarioOrThrow(prontuarioId, req);
    assertConsultaEditavel(prontuarioId);
    const body = pedidoBodySchema.parse(req.body);
    const db = getDb();
    const existing = db
      .prepare(`SELECT id FROM pedidos_exame WHERE prontuario_id = ? ORDER BY id DESC LIMIT 1`)
      .get(prontuarioId) as { id: number } | undefined;

    if (existing) {
      db.prepare(
        `UPDATE pedidos_exame SET exames_solicitados = ?, observacoes = ? WHERE id = ?`,
      ).run(body.exames_solicitados, body.observacoes ?? null, existing.id);
    } else {
      db.prepare(
        `INSERT INTO pedidos_exame (prontuario_id, paciente_id, medico_id, exames_solicitados, observacoes)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(
        prontuarioId,
        pr.paciente_id,
        pr.medico_id,
        body.exames_solicitados,
        body.observacoes ?? null,
      );
    }
    const pedido = db
      .prepare(`SELECT * FROM pedidos_exame WHERE prontuario_id = ? ORDER BY id DESC LIMIT 1`)
      .get(prontuarioId);
    res.json({ pedido });
  }),
);

documentosRouter.get(
  "/pedido-exame/pdf",
  requireModulo("documentos", "prontuario_ler"),
  asyncHandler(async (req, res) => {
    const prontuarioId = Number(req.params.prontuarioId);
    getProntuarioOrThrow(prontuarioId, req);
    const row = getDocumentoContext(prontuarioId);
    if (!row) {
      res.status(404).json({ error: "Prontuário não encontrado" });
      return;
    }
    const pedido = getDb()
      .prepare(`SELECT * FROM pedidos_exame WHERE prontuario_id = ? ORDER BY id DESC LIMIT 1`)
      .get(prontuarioId) as
      | { exames_solicitados: string; observacoes: string | null }
      | undefined;
    if (!pedido?.exames_solicitados?.trim()) {
      res.status(400).json({ error: "Salve o pedido de exame antes de gerar o PDF" });
      return;
    }
    const pdf = await gerarPdfPedidoExame(
      ctxFromRow(row),
      pedido.exames_solicitados,
      pedido.observacoes,
    );
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="pedido-exame-${prontuarioId}.pdf"`,
    );
    res.send(pdf);
  }),
);

documentosRouter.get(
  "/lote",
  requireModulo(
    "prontuario_ler",
    "prontuario_escrever",
    "receituario",
    "documentos",
  ),
  asyncHandler(async (req, res) => {
    const prontuarioId = Number(req.params.prontuarioId);
    getProntuarioOrThrow(prontuarioId, req);
    const documentos = await listarDocumentosLote(prontuarioId, req);
    res.json({ documentos });
  }),
);

documentosRouter.get(
  "/lote/pdf",
  requireModulo(
    "prontuario_ler",
    "prontuario_escrever",
    "receituario",
    "documentos",
  ),
  asyncHandler(async (req, res) => {
    const prontuarioId = Number(req.params.prontuarioId);
    const pr = getProntuarioOrThrow(prontuarioId, req);
    try {
      const { pdf, incluidos } = await gerarDocumentosLotePdf(prontuarioId, req);
      logAcesso({
        usuarioId: req.usuario!.id,
        pacienteId: pr.paciente_id,
        acao: "documentos_lote_pdf",
        detalhe: `prontuario=${prontuarioId} docs=${incluidos.join(",")}`,
      });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `inline; filename="consulta-${prontuarioId}-documentos.pdf"`,
      );
      res.send(pdf);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Erro ao gerar PDF em lote";
      res.status(400).json({ error: msg });
    }
  }),
);

documentosRouter.get(
  "/consulta/pdf",
  requireModulo("prontuario_ler", "prontuario_escrever"),
  asyncHandler(async (req, res) => {
    const prontuarioId = Number(req.params.prontuarioId);
    getProntuarioOrThrow(prontuarioId, req);

    const row = getDb()
      .prepare(
        `SELECT pr.id, pr.agendamento_id, pr.retificacao_de_id, pr.retificacao_finalizada,
                pr.ficha_template_id, pr.template_snapshot_json, pr.dados_json,
                pr.queixa_principal, pr.anamnese, pr.exame_fisico, pr.hipotese_diagnostica,
                pr.cid_codigo, pr.cid_descricao, pr.conduta, pr.plano,
                pr.retorno_dias, pr.retorno_ate
         FROM prontuarios pr WHERE pr.id = ?`,
      )
      .get(prontuarioId) as Record<string, unknown> | undefined;

    if (!row) {
      res.status(404).json({ error: "Prontuário não encontrado" });
      return;
    }

    const consulta_encerrada = isConsultaEncerrada({
      agendamento_id: row.agendamento_id as number | null,
      retificacao_de_id: row.retificacao_de_id as number | null,
      retificacao_finalizada: row.retificacao_finalizada as number | boolean | null,
    });

    let ficha;
    try {
      ficha = enriquecerProntuarioFicha({
        ...(row as Parameters<typeof enriquecerProntuarioFicha>[0]),
        consulta_encerrada,
      });
    } catch (e) {
      if (e instanceof FichaProntuarioError) {
        res.status(e.status).json({ error: e.message });
        return;
      }
      throw e;
    }

    const camposPdf = prepararCamposConsultaPdf(
      ficha.ficha_campos,
      ficha.dados,
      row.retorno_ate as string | null | undefined,
    );

    if (camposPdf.length === 0) {
      res.status(400).json({ error: "Nenhum dado clínico para imprimir" });
      return;
    }

    const ctxRow = getDocumentoContext(prontuarioId);
    if (!ctxRow) {
      res.status(404).json({ error: "Prontuário não encontrado" });
      return;
    }

    const pdf = await gerarPdfConsulta(
      ctxFromRow(ctxRow),
      ficha.ficha_titulo_documento,
      camposPdf,
    );
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="consulta-${prontuarioId}.pdf"`,
    );
    res.send(pdf);
  }),
);
