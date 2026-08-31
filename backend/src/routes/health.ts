import { Router } from "express";
import { config } from "../config.js";
import { dbHealth } from "../db/index.js";
import { getUltimaRestauracao } from "../utils/backup.js";
import { getServerBootId } from "../auth/sessionBoot.js";
import { localIPv4s } from "../utils/localNetwork.js";
import { backupReiniciandoHtml } from "../utils/backupReiniciandoPage.js";
import {
  isLoginPageReady,
  readStartupStatusFile,
} from "../services/startupStatus.js";

export const healthRouter = Router();

healthRouter.get("/startup/status", (_req, res) => {
  res.json(readStartupStatusFile());
});

healthRouter.get("/startup/ready", (_req, res) => {
  const status = readStartupStatusFile();
  const db = dbHealth();
  const web = isLoginPageReady();
  res.json({
    ...status,
    database: db.ok ? "connected" : "disconnected",
    web,
    ready: db.ok && web,
  });
});

healthRouter.get("/backup/reiniciando", (_req, res) => {
  res.type("html").send(backupReiniciandoHtml(config.port));
});

healthRouter.get("/health", (_req, res) => {
  const db = dbHealth();
  res.json({
    ok: db.ok,
    database: db.ok ? "connected" : "disconnected",
    nome: "MedPronto API",
    versao: "0.1.0",
    fase: "2-documentos",
    ts: new Date().toISOString(),
    db: db.ok ? "ok" : "erro",
    dbPath: db.path,
    port: config.port,
    lan_ips: localIPv4s().map((ip) => ip.address),
    restauracao_em: getUltimaRestauracao(),
    inicio_servidor: getServerBootId(),
  });
});
