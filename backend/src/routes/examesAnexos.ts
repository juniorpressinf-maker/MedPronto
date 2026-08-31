import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { requireAuth, requireModulo } from "../auth/middleware.js";
import { usuarioTemModulo } from "../auth/modulos.js";
import type { Perfil } from "../auth/users.js";
import { config } from "../config.js";
import { getDb } from "../db/index.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { logAcesso } from "../services/logAcesso.js";
import { assertConsultaEditavel } from "../services/consultaEncerrada.js";
import {
  EXAMES_MAX_BYTES,
  buildExameFileName,
  contentTypeExame,
  extensaoPermitida,
  garantirDirExames,
  mimePermitido,
  nomeExameParaExibicao,
  relPathExame,
  resolveExamePathForPaciente,
} from "../utils/examesStorage.js";
import { getProntuarioOrThrow } from "../services/prontuarioAccess.js";
import {
  assertMedicoVinculoPaciente,
  assertProntuarioDoPaciente,
} from "../services/vinculosClinicos.js";

const tmpDir = path.join(config.dataDir, "tmp");
fs.mkdirSync(tmpDir, { recursive: true });

const upload = multer({
  dest: tmpDir,
  limits: { fileSize: EXAMES_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!extensaoPermitida(file.originalname) && !mimePermitido(file.mimetype)) {
      cb(new Error("Envie PDF ou imagem (JPG, PNG ou WebP)."));
      return;
    }
    cb(null, true);
  },
});

export const examesAnexosRouter = Router();

examesAnexosRouter.use(requireAuth());

const podeVerExames = requireModulo(
  "exames_anexos",
  "prontuario_ler",
  "prontuario_escrever",
);

const EXAME_LIST_SQL = `SELECT e.id, e.paciente_id,
  COALESCE(e.paciente_nome, p.nome) AS paciente_nome,
  p.nome AS paciente_nome_atual,
  e.prontuario_id, e.data_upload, e.descricao,
  e.arquivo_path, e.uploaded_by, u.nome AS uploaded_by_nome,
  (SELECT a.id FROM admissionais a
    WHERE a.exame_anexo_id = e.id AND a.status != 'cancelado'
    ORDER BY CASE WHEN a.retificacao_de_id IS NULL THEN 0 ELSE 1 END, a.id
    LIMIT 1) AS admissional_id,
  (SELECT ci.id FROM conta_itens ci
    WHERE ci.exame_anexo_id = e.id AND ci.status != 'cancelado'
    LIMIT 1) AS conta_item_id
 FROM exames_anexos e
 JOIN pacientes p ON p.id = e.paciente_id
 LEFT JOIN usuarios u ON u.id = e.uploaded_by`;

function mapExameRow(row: { arquivo_path: string } & Record<string, unknown>) {
  const pacienteNome = String(row.paciente_nome ?? "").trim();
  const pacienteNomeAtual = String(row.paciente_nome_atual ?? "").trim();
  const descricao = String(row.descricao ?? "").trim();
  const nomeArquivo = nomeExameParaExibicao(row.arquivo_path);
  return {
    ...row,
    paciente_nome: pacienteNome || pacienteNomeAtual,
    paciente_nome_atual: pacienteNomeAtual,
    nome_arquivo: descricao || nomeArquivo,
    nome_arquivo_completo: nomeArquivo,
    nome_diverge:
      pacienteNome.length > 0 &&
      pacienteNomeAtual.length > 0 &&
      pacienteNome.toLocaleUpperCase("pt-BR") !==
        pacienteNomeAtual.toLocaleUpperCase("pt-BR"),
  };
}

function detalheExameAudit(
  id: number,
  pacienteId: number,
  pacienteNome: string,
  extra?: string,
): string {
  const nome = pacienteNome.trim() || "?";
  return `exame=${id} paciente=${pacienteId} nome="${nome}"${extra ? ` ${extra}` : ""}`;
}

examesAnexosRouter.get(
  "/paciente/:pacienteId",
  podeVerExames,
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
    const rows = getDb()
      .prepare(
        `${EXAME_LIST_SQL} WHERE e.paciente_id = ? ORDER BY e.data_upload DESC`,
      )
      .all(pacienteId) as Array<{ arquivo_path: string } & Record<string, unknown>>;
    const exames = rows.map(mapExameRow);
    logAcesso({
      usuarioId: req.usuario!.id,
      pacienteId,
      acao: "exames_listados",
    });
    res.json({ exames });
  }),
);

examesAnexosRouter.post(
  "/paciente/:pacienteId",
  requireModulo("exames_anexos"),
  upload.single("arquivo"),
  asyncHandler(async (req, res) => {
    const pacienteId = Number(req.params.pacienteId);
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "Selecione um arquivo PDF ou imagem." });
      return;
    }

    const paciente = getDb()
      .prepare(`SELECT id, nome FROM pacientes WHERE id = ?`)
      .get(pacienteId) as { id: number; nome: string } | undefined;
    if (!paciente) {
      try {
        fs.unlinkSync(file.path);
      } catch {
        /* ignore */
      }
      res.status(404).json({ error: "Paciente não encontrado" });
      return;
    }

    const descricao = String(req.body?.descricao ?? "").trim().slice(0, 500) || null;
    const prontuarioRaw = req.body?.prontuario_id;
    let prontuarioId: number | null = null;
    if (prontuarioRaw != null && String(prontuarioRaw).trim() !== "") {
      prontuarioId = Number(prontuarioRaw);
      if (!Number.isFinite(prontuarioId)) {
        try {
          fs.unlinkSync(file.path);
        } catch {
          /* ignore */
        }
        res.status(400).json({ error: "prontuario_id inválido" });
        return;
      }
      assertProntuarioDoPaciente(prontuarioId, pacienteId);
      getProntuarioOrThrow(prontuarioId, req);
    }

    const info = getDb()
      .prepare(
        `INSERT INTO exames_anexos (paciente_id, paciente_nome, prontuario_id, descricao, arquivo_path, uploaded_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        pacienteId,
        paciente.nome.trim(),
        prontuarioId,
        descricao,
        "",
        req.usuario!.id,
      );

    const id = Number(info.lastInsertRowid);
    const fileName = buildExameFileName({
      id,
      pacienteNome: paciente.nome,
      descricao,
      originalName: file.originalname,
    });
    const relative = relPathExame(pacienteId, fileName);
    const destDir = garantirDirExames(pacienteId);
    const destAbs = path.join(destDir, fileName);

    try {
      fs.renameSync(file.path, destAbs);
    } catch {
      try {
        fs.copyFileSync(file.path, destAbs);
        fs.unlinkSync(file.path);
      } catch {
        getDb().prepare(`DELETE FROM exames_anexos WHERE id = ?`).run(id);
        res.status(500).json({ error: "Falha ao salvar arquivo" });
        return;
      }
    }

    getDb()
      .prepare(`UPDATE exames_anexos SET arquivo_path = ? WHERE id = ?`)
      .run(relative, id);

    logAcesso({
      usuarioId: req.usuario!.id,
      pacienteId,
      acao: "exame_anexado",
      detalhe: detalheExameAudit(id, pacienteId, paciente.nome),
    });

    const row = getDb()
      .prepare(`${EXAME_LIST_SQL} WHERE e.id = ?`)
      .get(id) as { arquivo_path: string } & Record<string, unknown>;

    res.status(201).json({
      exame: mapExameRow(row),
    });
  }),
);

examesAnexosRouter.get(
  "/:id/arquivo",
  podeVerExames,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const row = getDb()
      .prepare(
        `SELECT e.paciente_id, e.arquivo_path,
          COALESCE(e.paciente_nome, p.nome) AS paciente_nome
         FROM exames_anexos e
         JOIN pacientes p ON p.id = e.paciente_id
         WHERE e.id = ?`,
      )
      .get(id) as
      | { paciente_id: number; arquivo_path: string; paciente_nome: string }
      | undefined;
    if (!row) {
      res.status(404).json({ error: "Exame não encontrado" });
      return;
    }
    assertMedicoVinculoPaciente(req, row.paciente_id);
    const abs = resolveExamePathForPaciente(row.arquivo_path, row.paciente_id);
    if (!abs || !fs.existsSync(abs)) {
      res.status(404).json({ error: "Arquivo não encontrado no disco" });
      return;
    }
    logAcesso({
      usuarioId: req.usuario!.id,
      pacienteId: row.paciente_id,
      acao: "exame_aberto",
      detalhe: detalheExameAudit(id, row.paciente_id, row.paciente_nome),
    });
    res.setHeader("Content-Type", contentTypeExame(abs));
    res.sendFile(abs);
  }),
);

const patchBody = z.object({
  prontuario_id: z.number().int().positive().nullable(),
  descricao: z.string().max(500).nullable().optional(),
});

examesAnexosRouter.patch(
  "/:id",
  requireModulo("exames_anexos", "prontuario_escrever"),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const body = patchBody.parse(req.body);
    const atual = getDb()
      .prepare(`SELECT * FROM exames_anexos WHERE id = ?`)
      .get(id) as
      | {
          id: number;
          paciente_id: number;
          paciente_nome: string | null;
          prontuario_id: number | null;
          descricao: string | null;
        }
      | undefined;
    if (!atual) {
      res.status(404).json({ error: "Exame não encontrado" });
      return;
    }
    assertMedicoVinculoPaciente(req, atual.paciente_id);

    const u = req.usuario!;
    const perfil = u.perfil as Perfil;
    const podeVincularConsulta = usuarioTemModulo(
      u.id,
      perfil,
      "prontuario_escrever",
    );
    if (body.prontuario_id !== undefined && !podeVincularConsulta) {
      res.status(403).json({
        error: "Somente quem atende pode vincular exame à consulta",
      });
      return;
    }

    if (atual.prontuario_id != null) {
      getProntuarioOrThrow(atual.prontuario_id, req);
      assertConsultaEditavel(atual.prontuario_id);
    }

    if (body.prontuario_id !== undefined && body.prontuario_id !== null) {
      assertProntuarioDoPaciente(body.prontuario_id, atual.paciente_id);
      getProntuarioOrThrow(body.prontuario_id, req);
      assertConsultaEditavel(body.prontuario_id);
    }

    const prontuarioId =
      body.prontuario_id !== undefined ? body.prontuario_id : atual.prontuario_id;
    const descricao =
      body.descricao !== undefined ? body.descricao : atual.descricao;

    getDb()
      .prepare(
        `UPDATE exames_anexos SET prontuario_id = ?, descricao = ? WHERE id = ?`,
      )
      .run(prontuarioId, descricao, id);

    logAcesso({
      usuarioId: req.usuario!.id,
      pacienteId: atual.paciente_id,
      acao: "exame_atualizado",
      detalhe: detalheExameAudit(
        id,
        atual.paciente_id,
        String(atual.paciente_nome ?? ""),
        prontuarioId ? `prontuario=${prontuarioId}` : "desvinculado",
      ),
    });

    const row = getDb()
      .prepare(`${EXAME_LIST_SQL} WHERE e.id = ?`)
      .get(id) as { arquivo_path: string } & Record<string, unknown>;

    res.json({
      exame: mapExameRow(row),
    });
  }),
);
