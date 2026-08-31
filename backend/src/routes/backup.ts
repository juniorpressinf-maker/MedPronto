import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import multer from "multer";
import { requireAuth, requireModulo } from "../auth/middleware.js";
import { config } from "../config.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { logAcesso } from "../services/logAcesso.js";
import {
  RESTORE_EXIT_CODE,
  agendarRestauracao,
  criarBackup,
  inspecionarBackup,
  listarBackupsLocais,
} from "../utils/backup.js";

const tmpDir = path.join(config.dataDir, "tmp");
fs.mkdirSync(tmpDir, { recursive: true });

const upload = multer({
  dest: tmpDir,
  limits: { fileSize: 120 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.originalname.toLowerCase().endsWith(".zip")) {
      cb(new Error("Envie um arquivo .zip de backup."));
      return;
    }
    cb(null, true);
  },
});

export const backupRouter = Router();

backupRouter.use(requireAuth(), requireModulo("backup"));

backupRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json({ backups: listarBackupsLocais() });
  }),
);

backupRouter.get(
  "/download",
  asyncHandler(async (req, res) => {
    const incluirUploads = req.query.incluirUploads !== "0";
    const bk = await criarBackup({ incluirUploads });
    logAcesso({
      usuarioId: req.usuario!.id,
      acao: "backup_gerado",
      detalhe: `arquivo="${bk.nome}" uploads=${incluirUploads ? "sim" : "nao"}`,
    });
    res.download(bk.path, bk.nome, (err) => {
      if (err) console.error("[backup] download:", err);
    });
  }),
);

backupRouter.post(
  "/restaurar",
  upload.single("arquivo"),
  asyncHandler(async (req, res) => {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "Selecione um arquivo .zip de backup." });
      return;
    }

    try {
      inspecionarBackup(file.path);
    } catch (err) {
      try {
        fs.unlinkSync(file.path);
      } catch {
        /* ignore */
      }
      const msg = err instanceof Error ? err.message : "Arquivo inválido";
      res.status(400).json({ error: msg });
      return;
    }

    try {
      const info = agendarRestauracao(file.path);
      logAcesso({
        usuarioId: req.usuario!.id,
        acao: "backup_restaurado",
        detalhe: `conteudo=${JSON.stringify(info.conteudo)}`,
      });
      try {
        fs.unlinkSync(file.path);
      } catch {
        /* ignore */
      }
      res.json({
        ok: true,
        reiniciando: true,
        message:
          "Restauração agendada. O sistema vai reiniciar em instantes.",
        conteudo: info.conteudo,
      });
      setTimeout(() => process.exit(RESTORE_EXIT_CODE), 1500);
    } catch (err) {
      try {
        fs.unlinkSync(file.path);
      } catch {
        /* ignore */
      }
      const msg = err instanceof Error ? err.message : "Erro ao restaurar";
      res.status(400).json({ error: msg });
    }
  }),
);
