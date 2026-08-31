import { Router, type Request } from "express";
import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import { z } from "zod";
import { requireAuth, requireModulo } from "../auth/middleware.js";
import { config } from "../config.js";
import { getDb } from "../db/index.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import {
  camposParaJson,
  defaultPosicoes,
  loadPosicoes,
  normalizarCampos,
  savePosicoes,
  validarCamposDestino,
  type FichaCampoDef,
  type FichaCampoPosicao,
} from "../services/fichasTemplate.js";
import { validarCamposAso, garantirCamposTravadosAso } from "../admissional/asoModelo.js";
import {
  absPathFichaPdf,
  FICHA_PDF_MAX_BYTES,
  garantirDirFichaPdf,
  pdfPermitido,
  relPathFichaPdf,
  resolveFichaPdfPath,
} from "../utils/fichasPdfStorage.js";

const tmpDir = path.join(config.dataDir, "tmp");
fs.mkdirSync(tmpDir, { recursive: true });

const uploadPdf = multer({
  dest: tmpDir,
  limits: { fileSize: FICHA_PDF_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!pdfPermitido(file.originalname, file.mimetype)) {
      cb(new Error("Envie um arquivo PDF."));
      return;
    }
    cb(null, true);
  },
});

export const fichasTemplateRouter = Router();

type FichaRow = {
  id: number;
  nome: string;
  titulo_documento: string;
  modo: string;
  campos_json: string;
  pdf_referencia_path: string | null;
  medico_id: number | null;
  eh_default: number;
  ativo: number;
  destino: string;
  created_at: string;
  updated_at: string;
  medico_nome: string | null;
};

function mapFicha(row: FichaRow) {
  const em_uso = fichaEmUso(row.id);
  let campos = normalizarCampos(JSON.parse(row.campos_json || "[]"));
  if (row.destino === "aso") {
    campos = garantirCamposTravadosAso(campos);
  }
  return {
    id: row.id,
    nome: row.nome,
    titulo_documento: row.titulo_documento,
    modo: row.modo,
    campos,
    pdf_referencia_path: row.pdf_referencia_path,
    campos_posicao: loadPosicoes(row.id),
    medico_id: row.medico_id,
    medico_nome: row.medico_nome,
    eh_default: row.eh_default === 1,
    ativo: row.ativo === 1,
    destino: row.destino === "aso" ? "aso" : "prontuario",
    em_uso,
    pode_apagar: row.eh_default !== 1 && !em_uso,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function assertPdfRevisadoParaAtivar(
  row: FichaRow,
  ativo: boolean | undefined,
  pdfRevisado: boolean | undefined,
): string | null {
  if (ativo !== true || !row.pdf_referencia_path?.trim()) return null;
  if (!pdfRevisado) {
    return "Confirme a revisão do PDF antes de ativar a ficha";
  }
  return null;
}

function copiarPosicoes(origemId: number, destinoId: number): void {
  const pos = loadPosicoes(origemId);
  if (pos.length) savePosicoes(destinoId, pos);
}

function aplicarPosicoesFicha(
  fichaId: number,
  modo: string,
  campos: FichaCampoDef[],
  posicoes?: FichaCampoPosicao[],
): void {
  if (modo !== "pdf_fundo") {
    getDb()
      .prepare(`DELETE FROM ficha_campos_posicao WHERE ficha_template_id = ?`)
      .run(fichaId);
    return;
  }
  const lista =
    posicoes?.length ? posicoes : defaultPosicoes(campos);
  savePosicoes(fichaId, lista);
}

function permissoesUsuario(req: Request) {
  return req.usuario!.permissoes ?? [];
}

function podeConfig(req: Request) {
  return permissoesUsuario(req).includes("fichas_config");
}

function podeMedico(req: Request) {
  return permissoesUsuario(req).includes("fichas_medico");
}

function getFichaRow(id: number): FichaRow | undefined {
  return getDb()
    .prepare(
      `SELECT f.*, u.nome AS medico_nome
       FROM fichas_template f
       LEFT JOIN usuarios u ON u.id = f.medico_id
       WHERE f.id = ?`,
    )
    .get(id) as FichaRow | undefined;
}

function podeVerFicha(req: Request, row: FichaRow): boolean {
  if (podeConfig(req)) return true;
  if (row.medico_id == null) return podeMedico(req);
  return row.medico_id === req.usuario!.id && podeMedico(req);
}

function podeEditarFicha(req: Request, row: FichaRow): boolean {
  if (row.medico_id == null) return podeConfig(req);
  if (podeConfig(req)) return true;
  return row.medico_id === req.usuario!.id && podeMedico(req);
}

function fichaUsadaEmProntuario(id: number): boolean {
  const r = getDb()
    .prepare(
      `SELECT 1 FROM prontuarios WHERE ficha_template_id = ? LIMIT 1`,
    )
    .get(id);
  return !!r;
}

function fichaUsadaEmAgendamento(id: number): boolean {
  const r = getDb()
    .prepare(
      `SELECT 1 FROM agendamentos
       WHERE ficha_template_id = ? OR aso_template_id = ? LIMIT 1`,
    )
    .get(id, id);
  return !!r;
}

function fichaUsadaEmAdmissional(id: number): boolean {
  const r = getDb()
    .prepare(
      `SELECT 1 FROM admissionais WHERE aso_template_id = ? LIMIT 1`,
    )
    .get(id);
  return !!r;
}

function fichaEmUso(id: number): boolean {
  return (
    fichaUsadaEmProntuario(id) ||
    fichaUsadaEmAgendamento(id) ||
    fichaUsadaEmAdmissional(id)
  );
}

function resolverMedicoIdCriacao(
  req: Request,
  medicoIdBody: number | null | undefined,
): number | null {
  if (podeConfig(req)) {
    return medicoIdBody ?? null;
  }
  return req.usuario!.id;
}

const campoSchema = z.object({
  id: z.string().optional(),
  label: z.string().min(1),
  tipo: z.string(),
  ordem: z.number().int().optional(),
  obrigatorio: z.boolean().optional(),
  opcoes: z.array(z.string()).optional(),
  placeholder: z.string().optional(),
});

const posicaoSchema = z.object({
  campo_id: z.string().min(1),
  x_pct: z.number().min(0).max(100),
  y_pct: z.number().min(0).max(100),
  largura_pct: z.number().min(1).max(100),
  altura_pct: z.number().min(1).max(100),
});

const createSchema = z.object({
  nome: z.string().min(1).max(120),
  titulo_documento: z.string().min(1).max(200),
  modo: z.enum(["secoes", "pdf_fundo"]).optional(),
  campos: z.array(campoSchema).min(1),
  campos_posicao: z.array(posicaoSchema).optional(),
  medico_id: z.number().int().nullable().optional(),
  ativo: z.boolean().optional(),
  pdf_revisado: z.boolean().optional(),
  destino: z.enum(["prontuario", "aso"]).optional(),
});

const updateSchema = createSchema.partial().extend({
  campos: z.array(campoSchema).min(1).optional(),
});

const patchSchema = z.object({
  ativo: z.boolean(),
});

const duplicarSchema = z.object({
  nome: z.string().min(1).max(120).optional(),
  pessoal: z.boolean().optional(),
});

function parseCamposInput(raw: z.infer<typeof campoSchema>[]): FichaCampoDef[] {
  return normalizarCampos(raw);
}

function parseDestino(raw: unknown): "prontuario" | "aso" {
  const s = String(raw ?? "prontuario");
  if (s === "aso") return "aso";
  return "prontuario";
}

function validarCamposComDestino(
  campos: FichaCampoDef[],
  destino: "prontuario" | "aso",
): string | null {
  const err = validarCamposDestino(campos, destino);
  if (err) return err;
  if (destino === "aso") return validarCamposAso(campos);
  return null;
}

function camposParaDestino(
  campos: FichaCampoDef[],
  destino: "prontuario" | "aso",
): FichaCampoDef[] {
  return destino === "aso" ? garantirCamposTravadosAso(campos) : campos;
}

fichasTemplateRouter.get(
  "/disponiveis",
  requireAuth(),
  requireModulo(
    "agenda",
    "fichas_config",
    "fichas_medico",
    "fila_medico",
    "prontuario_escrever",
    "admissional",
  ),
  asyncHandler(async (req, res) => {
    const medicoId = Number(req.query.medico_id);
    if (!medicoId) {
      res.status(400).json({ error: "medico_id obrigatório" });
      return;
    }
    if (
      req.usuario!.perfil === "medico" &&
      medicoId !== req.usuario!.id
    ) {
      res.status(403).json({ error: "Sem permissão para fichas de outro médico" });
      return;
    }

    const destino = parseDestino(req.query.destino);
    const rows = getDb()
      .prepare(
        `SELECT f.*, u.nome AS medico_nome
         FROM fichas_template f
         LEFT JOIN usuarios u ON u.id = f.medico_id
         WHERE f.ativo = 1 AND f.destino = ?
           AND (f.medico_id IS NULL OR f.medico_id = ?)
         ORDER BY f.eh_default DESC, f.medico_id IS NOT NULL, f.nome COLLATE NOCASE`,
      )
      .all(destino, medicoId) as FichaRow[];

    res.json({ fichas: rows.map(mapFicha) });
  }),
);

fichasTemplateRouter.use(
  requireAuth(),
  requireModulo("fichas_config", "fichas_medico"),
);

fichasTemplateRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const config = podeConfig(req);
    const medicoId = req.usuario!.id;
    const escopo = String(req.query.escopo ?? "todas");
    const destino = parseDestino(req.query.destino);

    let sql = `
      SELECT f.*, u.nome AS medico_nome
      FROM fichas_template f
      LEFT JOIN usuarios u ON u.id = f.medico_id
      WHERE f.destino = ?`;
    const params: unknown[] = [destino];

    if (!config) {
      sql += ` AND (f.medico_id IS NULL OR f.medico_id = ?)`;
      params.push(medicoId);
    } else if (escopo === "clinica") {
      sql += ` AND f.medico_id IS NULL`;
    } else if (escopo === "minhas") {
      sql += ` AND f.medico_id = ?`;
      params.push(medicoId);
    }

    sql += ` ORDER BY f.ativo DESC, f.eh_default DESC, f.medico_id IS NOT NULL, f.nome COLLATE NOCASE`;

    const rows = getDb().prepare(sql).all(...params) as FichaRow[];
    res.json({ fichas: rows.map(mapFicha) });
  }),
);

fichasTemplateRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body);
    const medicoId = resolverMedicoIdCriacao(req, body.medico_id ?? null);

    if (medicoId == null && !podeConfig(req)) {
      res.status(403).json({ error: "Somente admin pode criar ficha da clínica" });
      return;
    }

    const destino = body.destino ?? "prontuario";
    const campos = camposParaDestino(parseCamposInput(body.campos), destino);
    const err = validarCamposComDestino(campos, destino);
    if (err) {
      res.status(400).json({ error: err });
      return;
    }

    const db = getDb();
    const modo = body.modo ?? "secoes";
    const ativo = body.ativo === true ? 1 : 0;

    const r = db
      .prepare(
        `INSERT INTO fichas_template (
          nome, titulo_documento, modo, campos_json, medico_id, eh_default, ativo, destino
        ) VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
      )
      .run(
        body.nome.trim(),
        body.titulo_documento.trim(),
        modo,
        camposParaJson(campos),
        medicoId,
        ativo,
        destino,
      );

    const newId = Number(r.lastInsertRowid);
    aplicarPosicoesFicha(newId, modo, campos, body.campos_posicao);

    const row = getFichaRow(newId);
    res.status(201).json(mapFicha(row!));
  }),
);

/** Cria ficha inativa e grava o PDF em uma única requisição (F1′). */
fichasTemplateRouter.post(
  "/pdf",
  uploadPdf.single("arquivo"),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "Arquivo PDF obrigatório" });
      return;
    }

    let payload: unknown;
    try {
      payload = JSON.parse(String(req.body.dados ?? "{}"));
    } catch {
      res.status(400).json({ error: "Dados da ficha inválidos" });
      return;
    }

    const body = createSchema
      .omit({ ativo: true, pdf_revisado: true, campos_posicao: true })
      .parse(payload);
    const medicoId = resolverMedicoIdCriacao(req, body.medico_id ?? null);

    if (medicoId == null && !podeConfig(req)) {
      res.status(403).json({ error: "Somente admin pode criar ficha da clínica" });
      return;
    }

    const destinoPdf = body.destino ?? "prontuario";
    const campos = camposParaDestino(parseCamposInput(body.campos), destinoPdf);
    const err = validarCamposComDestino(campos, destinoPdf);
    if (err) {
      res.status(400).json({ error: err });
      return;
    }

    const modo = body.modo ?? "secoes";
    const db = getDb();
    const r = db
      .prepare(
        `INSERT INTO fichas_template (
          nome, titulo_documento, modo, campos_json, medico_id, eh_default, ativo, destino
        ) VALUES (?, ?, ?, ?, ?, 0, 0, ?)`,
      )
      .run(
        body.nome.trim(),
        body.titulo_documento.trim(),
        modo,
        camposParaJson(campos),
        medicoId,
        destinoPdf,
      );

    const newId = Number(r.lastInsertRowid);
    aplicarPosicoesFicha(newId, modo, campos, undefined);

    garantirDirFichaPdf(newId);
    const dest = absPathFichaPdf(newId);
    fs.renameSync(req.file.path, dest);
    const rel = relPathFichaPdf(newId);
    db.prepare(
      `UPDATE fichas_template SET pdf_referencia_path = ?,
       updated_at = datetime('now', 'localtime') WHERE id = ?`,
    ).run(rel, newId);

    res.status(201).json(mapFicha(getFichaRow(newId)!));
  }),
);

fichasTemplateRouter.post(
  "/:id/duplicar",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const body = duplicarSchema.parse(req.body ?? {});
    const origem = getFichaRow(id);

    if (!origem) {
      res.status(404).json({ error: "Ficha não encontrada" });
      return;
    }
    if (!podeVerFicha(req, origem)) {
      res.status(403).json({ error: "Sem permissão para esta ficha" });
      return;
    }

    const config = podeConfig(req);
    let medicoId: number | null;
    if (body.pessoal || !config) {
      medicoId = req.usuario!.id;
    } else if (origem.medico_id != null) {
      medicoId = origem.medico_id;
    } else {
      medicoId = null;
    }

    if (medicoId == null && !config) {
      res.status(403).json({ error: "Somente admin pode criar ficha da clínica" });
      return;
    }

    const nome =
      body.nome?.trim() ||
      `${origem.nome.trim()} (cópia)`.slice(0, 120);

    const destOrigem = origem.destino === "aso" ? "aso" : "prontuario";
    const camposJson =
      destOrigem === "aso"
        ? camposParaJson(
            camposParaDestino(
              normalizarCampos(JSON.parse(origem.campos_json || "[]")),
              "aso",
            ),
          )
        : origem.campos_json;

    const db = getDb();
    const r = db
      .prepare(
        `INSERT INTO fichas_template (
          nome, titulo_documento, modo, campos_json, pdf_referencia_path,
          medico_id, eh_default, ativo, destino
        ) VALUES (?, ?, ?, ?, ?, ?, 0, 1, ?)`,
      )
      .run(
        nome,
        origem.titulo_documento,
        origem.modo,
        camposJson,
        origem.pdf_referencia_path,
        medicoId,
        destOrigem,
      );

    const row = getFichaRow(Number(r.lastInsertRowid))!;
    copiarPosicoes(id, row.id);
    if (origem.pdf_referencia_path) {
      const src = resolveFichaPdfPath(origem.pdf_referencia_path, id);
      if (src && fs.existsSync(src)) {
        garantirDirFichaPdf(row.id);
        fs.copyFileSync(src, absPathFichaPdf(row.id));
        getDb()
          .prepare(
            `UPDATE fichas_template SET pdf_referencia_path = ? WHERE id = ?`,
          )
          .run(relPathFichaPdf(row.id), row.id);
      }
    }

    res.status(201).json(mapFicha(getFichaRow(row.id)!));
  }),
);

fichasTemplateRouter.post(
  "/:id/default",
  asyncHandler(async (req, res) => {
    if (!podeConfig(req)) {
      res.status(403).json({ error: "Somente admin define ficha padrão da clínica" });
      return;
    }

    const id = Number(req.params.id);
    const row = getFichaRow(id);
    if (!row) {
      res.status(404).json({ error: "Ficha não encontrada" });
      return;
    }
    if (row.medico_id != null) {
      res.status(400).json({ error: "Ficha padrão deve ser global da clínica" });
      return;
    }
    if (row.ativo !== 1) {
      res.status(400).json({ error: "Ative a ficha antes de marcar como padrão" });
      return;
    }

    const db = getDb();
    const dest = row.destino === "aso" ? "aso" : "prontuario";
    const tx = db.transaction(() => {
      db.prepare(
        `UPDATE fichas_template SET eh_default = 0, updated_at = datetime('now', 'localtime')
         WHERE medico_id IS NULL AND eh_default = 1 AND destino = ?`,
      ).run(dest);
      db.prepare(
        `UPDATE fichas_template SET eh_default = 1, updated_at = datetime('now', 'localtime')
         WHERE id = ?`,
      ).run(id);
    });
    tx();

    res.json(mapFicha(getFichaRow(id)!));
  }),
);

fichasTemplateRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const row = getFichaRow(id);

    if (!row) {
      res.status(404).json({ error: "Ficha não encontrada" });
      return;
    }
    if (!podeVerFicha(req, row)) {
      res.status(403).json({ error: "Sem permissão para esta ficha" });
      return;
    }

    res.json(mapFicha(row));
  }),
);

fichasTemplateRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const body = updateSchema.parse(req.body);
    const row = getFichaRow(id);

    if (!row) {
      res.status(404).json({ error: "Ficha não encontrada" });
      return;
    }
    if (!podeEditarFicha(req, row)) {
      res.status(403).json({ error: "Sem permissão para editar esta ficha" });
      return;
    }

    const destinoPut = row.destino === "aso" ? "aso" : "prontuario";
    const campos = camposParaDestino(
      body.campos
        ? parseCamposInput(body.campos)
        : normalizarCampos(JSON.parse(row.campos_json)),
      destinoPut,
    );
    const err = validarCamposComDestino(campos, destinoPut);
    if (err) {
      res.status(400).json({ error: err });
      return;
    }

    const nome = (body.nome ?? row.nome).trim();
    const titulo = (body.titulo_documento ?? row.titulo_documento).trim();
    const modo = body.modo ?? row.modo;
    const ativo = body.ativo !== undefined ? (body.ativo ? 1 : 0) : row.ativo;

    const revisaoErr = assertPdfRevisadoParaAtivar(
      row,
      body.ativo,
      body.pdf_revisado,
    );
    if (revisaoErr) {
      res.status(400).json({ error: revisaoErr });
      return;
    }

    if (row.eh_default === 1 && ativo === 0) {
      res.status(400).json({
        error: "Defina outra ficha padrão antes de inativar esta",
      });
      return;
    }

    getDb()
      .prepare(
        `UPDATE fichas_template SET
          nome = ?, titulo_documento = ?, modo = ?, campos_json = ?,
          ativo = ?, updated_at = datetime('now', 'localtime')
         WHERE id = ?`,
      )
      .run(nome, titulo, modo, camposParaJson(campos), ativo, id);

    aplicarPosicoesFicha(
      id,
      modo,
      campos,
      body.campos_posicao ?? (modo === "pdf_fundo" ? loadPosicoes(id) : undefined),
    );

    res.json(mapFicha(getFichaRow(id)!));
  }),
);

fichasTemplateRouter.post(
  "/:id/pdf",
  requireModulo("fichas_config", "fichas_medico"),
  uploadPdf.single("arquivo"),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const row = getFichaRow(id);
    if (!row) {
      res.status(404).json({ error: "Ficha não encontrada" });
      return;
    }
    if (!podeEditarFicha(req, row)) {
      res.status(403).json({ error: "Sem permissão para editar esta ficha" });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: "Arquivo PDF obrigatório" });
      return;
    }

    garantirDirFichaPdf(id);
    const dest = absPathFichaPdf(id);
    fs.renameSync(req.file.path, dest);
    const rel = relPathFichaPdf(id);
    getDb()
      .prepare(
        `UPDATE fichas_template SET pdf_referencia_path = ?,
         ativo = 0, updated_at = datetime('now', 'localtime') WHERE id = ?`,
      )
      .run(rel, id);

    res.json(mapFicha(getFichaRow(id)!));
  }),
);

fichasTemplateRouter.get(
  "/:id/pdf",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const row = getFichaRow(id);
    if (!row) {
      res.status(404).json({ error: "Ficha não encontrada" });
      return;
    }
    if (!podeVerFicha(req, row)) {
      res.status(403).json({ error: "Sem permissão para esta ficha" });
      return;
    }
    const abs = resolveFichaPdfPath(row.pdf_referencia_path, id);
    if (!abs || !fs.existsSync(abs)) {
      res.status(404).json({ error: "PDF de referência não encontrado" });
      return;
    }
    res.setHeader("Content-Type", "application/pdf");
    res.sendFile(abs);
  }),
);

fichasTemplateRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const body = patchSchema.parse(req.body);
    const row = getFichaRow(id);

    if (!row) {
      res.status(404).json({ error: "Ficha não encontrada" });
      return;
    }
    if (!podeEditarFicha(req, row)) {
      res.status(403).json({ error: "Sem permissão para editar esta ficha" });
      return;
    }

    if (row.eh_default === 1 && body.ativo === false) {
      res.status(400).json({
        error: "Defina outra ficha padrão antes de inativar esta",
      });
      return;
    }

    if (body.ativo === false && fichaEmUso(id)) {
      getDb()
        .prepare(
          `UPDATE fichas_template SET ativo = 0, updated_at = datetime('now', 'localtime')
           WHERE id = ?`,
        )
        .run(id);
      res.json(mapFicha(getFichaRow(id)!));
      return;
    }

    getDb()
      .prepare(
        `UPDATE fichas_template SET ativo = ?, updated_at = datetime('now', 'localtime')
         WHERE id = ?`,
      )
      .run(body.ativo ? 1 : 0, id);

    res.json(mapFicha(getFichaRow(id)!));
  }),
);

fichasTemplateRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const row = getFichaRow(id);

    if (!row) {
      res.status(404).json({ error: "Ficha não encontrada" });
      return;
    }
    if (!podeEditarFicha(req, row)) {
      res.status(403).json({ error: "Sem permissão para excluir esta ficha" });
      return;
    }
    if (row.eh_default === 1) {
      res.status(400).json({
        error: "Defina outra ficha padrão antes de apagar esta",
      });
      return;
    }
    if (fichaEmUso(id)) {
      res.status(409).json({
        error:
          "Este modelo já foi usado em consulta, ASO ou agendamento — use Inativar",
      });
      return;
    }

    getDb().prepare(`DELETE FROM fichas_template WHERE id = ?`).run(id);
    res.json({ ok: true });
  }),
);
