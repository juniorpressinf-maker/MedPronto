import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireModulo } from "../auth/middleware.js";
import { config } from "../config.js";
import {
  aplicarContraSenhaLicenca,
  getEstadoLicenca,
  getMachineFingerprint,
  instalarLicenca,
  removerLicenca,
} from "../licenca.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { logAcesso } from "../services/logAcesso.js";

export const licencaRouter = Router();

licencaRouter.get("/", (_req, res) => {
  res.json({
    ...getEstadoLicenca(),
    enforced: config.enforceLicense,
  });
});

licencaRouter.get("/fingerprint", (_req, res) => {
  res.json({ fingerprint: getMachineFingerprint() });
});

const instalarSchema = z.object({
  token: z.string().min(10, "Cole a chave de licença completa"),
});

licencaRouter.post(
  "/",
  requireAuth(),
  requireModulo("licenca"),
  asyncHandler(async (req, res) => {
    const parsed = instalarSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Dados inválidos",
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }
    try {
      const payload = instalarLicenca(parsed.data.token);
      logAcesso({
        usuarioId: req.usuario!.id,
        acao: "licenca_instalada",
        detalhe: `cliente="${payload.c}" expira=${payload.e}`,
      });
      res.json({
        ok: true,
        message: `Licença instalada. Expira em ${payload.e}.`,
        estado: getEstadoLicenca(),
      });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : "Licença inválida",
      });
    }
  }),
);

const contraSenhaSchema = z.object({
  codigo: z.string().min(10, "Informe a contra-senha"),
});

licencaRouter.post(
  "/contra-senha",
  asyncHandler(async (req, res) => {
    const parsed = contraSenhaSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Informe a contra-senha" });
      return;
    }
    try {
      const r = aplicarContraSenhaLicenca(parsed.data.codigo);
      logAcesso({
        acao: "licenca_contra_senha",
        detalhe: `dias=${r.dias} expira=${r.expira_em}`,
      });
      res.json({
        ok: true,
        message: `Licença prorrogada por ${r.dias} dia(s). Nova validade: ${r.expira_em}.`,
        estado: getEstadoLicenca(),
      });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : "Contra-senha inválida",
      });
    }
  }),
);

licencaRouter.delete(
  "/",
  requireAuth(),
  requireModulo("licenca"),
  (_req, res) => {
    removerLicenca();
    logAcesso({
      usuarioId: _req.usuario!.id,
      acao: "licenca_removida",
    });
    res.json({ ok: true, estado: getEstadoLicenca() });
  },
);
