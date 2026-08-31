import cors from "cors";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { attachPermissoes, sessionMiddleware } from "./auth/middleware.js";
import { config } from "./config.js";
import { garantirAsoModeloPadrao } from "./admissional/asoPadraoSeed.js";
import { runMigrations } from "./db/migrate.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { requireValidLicense } from "./licenca.js";
import { apiRouter } from "./routes/index.js";
import { garantirUsuariosOperacionais } from "./services/usuariosPadrao.js";
import { stopCloudflaredTunnel } from "./utils/cloudflareTunnel.js";
import { iniciarWhatsAppCron } from "./services/whatsappCron.js";
import { startClient } from "./whatsapp/cliente.js";
import { localIPv4s } from "./utils/localNetwork.js";

const applied = runMigrations();
if (applied.length > 0) {
  console.log("Migrações aplicadas:", applied.join(", "));
}
garantirUsuariosOperacionais();
garantirAsoModeloPadrao();
iniciarWhatsAppCron();
void startClient().catch((err) =>
  console.error("[whatsapp] erro ao iniciar cliente:", err),
);

const app = express();

app.use(
  cors({
    origin: config.corsOrigin.split(",").map((s) => s.trim()),
    credentials: true,
  }),
);
app.use(express.json({ limit: "12mb" }));
app.use(sessionMiddleware());
app.use(attachPermissoes());

app.use("/api", requireValidLicense());
app.use("/api", apiRouter);

const serveFrontend =
  config.isProduction && fs.existsSync(path.join(config.frontendDist, "index.html"));

if (serveFrontend) {
  const indexHtml = path.resolve(config.frontendDist, "index.html");
  app.use(express.static(config.frontendDist));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(indexHtml);
  });
} else {
  app.get("/", (_req, res) => {
    res.json({ nome: "MedPronto API", docs: "/api/health" });
  });
}

app.use(errorHandler);

function encerrarTunel() {
  try {
    stopCloudflaredTunnel();
  } catch {
    /* ignore */
  }
}

process.on("exit", encerrarTunel);
process.on("SIGINT", () => {
  encerrarTunel();
  process.exit(0);
});
process.on("SIGTERM", () => {
  encerrarTunel();
  process.exit(0);
});

app.listen(config.port, config.host, () => {
  const mode = config.isProduction ? "producao" : "desenvolvimento";
  console.log(`MedPronto (${mode}) em http://127.0.0.1:${config.port}`);
  const ips = localIPv4s();
  if (ips.length > 0) {
    console.log("[MedPronto] acesso remoto (LAN):");
    for (const ip of ips) {
      console.log(`         - http://${ip.address}:${config.port}  (${ip.iface})`);
    }
  }
});
