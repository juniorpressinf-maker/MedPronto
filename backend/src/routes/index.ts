import type { Request } from "express";
import { Router } from "express";
import { admissionaisRouter } from "./admissionais.js";
import { agendamentosRouter } from "./agendamentos.js";
import { auditoriaRouter } from "./auditoria.js";
import { authRouter } from "./auth.js";
import { backupRouter } from "./backup.js";
import { cidRouter } from "./cid.js";
import { clinicaRouter } from "./clinica.js";
import { cobrancaRouter } from "./cobranca.js";
import { dashboardRouter } from "./dashboard.js";
import { documentosRouter } from "./documentos.js";
import { examesAnexosRouter } from "./examesAnexos.js";
import { fichasTemplateRouter } from "./fichasTemplate.js";
import { healthRouter } from "./health.js";
import { licencaRouter } from "./licenca.js";
import { medicosRouter } from "./medicos.js";
import { pacientesRouter } from "./pacientes.js";
import { prontuariosRouter } from "./prontuarios.js";
import { remotoRouter } from "./remoto.js";
import { whatsappRouter } from "./whatsapp.js";
import { usuariosRouter } from "./usuarios.js";

export const apiRouter = Router();

apiRouter.use(healthRouter);
apiRouter.use("/dashboard", dashboardRouter);
apiRouter.use("/auth", authRouter);
apiRouter.use("/clinica", clinicaRouter);
apiRouter.use("/cid", cidRouter);
apiRouter.use("/backup", backupRouter);
apiRouter.use("/remoto", remotoRouter);
apiRouter.use("/licenca", licencaRouter);
apiRouter.use("/auditoria", auditoriaRouter);
apiRouter.use("/usuarios", usuariosRouter);
apiRouter.use("/medicos", medicosRouter);
apiRouter.use("/pacientes", pacientesRouter);
apiRouter.use("/exames", examesAnexosRouter);
apiRouter.use("/fichas-template", fichasTemplateRouter);
apiRouter.use("/agendamentos", agendamentosRouter);
apiRouter.use("/admissionais", admissionaisRouter);
apiRouter.use("/prontuarios", prontuariosRouter);
apiRouter.use("/prontuarios/:prontuarioId", documentosRouter);
apiRouter.use("/cobranca", cobrancaRouter);
apiRouter.use("/whatsapp", whatsappRouter);

function isLocalShutdownRequest(req: Request): boolean {
  const ip = String(req.ip ?? req.socket.remoteAddress ?? "").trim();
  return (
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip === "::ffff:127.0.0.1" ||
    ip.endsWith("127.0.0.1")
  );
}

apiRouter.post("/shutdown", (req, res) => {
  if (!isLocalShutdownRequest(req)) {
    res.status(403).json({ error: "Encerramento permitido apenas localmente" });
    return;
  }
  res.json({ ok: true, message: "encerrando" });
  setTimeout(() => process.exit(0), 300);
});
