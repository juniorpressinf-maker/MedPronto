import { Router } from "express";
import { requireAuth } from "../auth/middleware.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import {
  montarDashboard,
  validarPeriodo,
} from "../services/dashboardService.js";

export const dashboardRouter = Router();

dashboardRouter.use(requireAuth());

dashboardRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const de = typeof req.query.de === "string" ? req.query.de : undefined;
    const ate = typeof req.query.ate === "string" ? req.query.ate : undefined;
    const periodo = validarPeriodo(de, ate);
    if ("erro" in periodo) {
      res.status(400).json({ error: periodo.erro });
      return;
    }

    const medicoId =
      req.usuario?.perfil === "medico" ? req.usuario.id : undefined;

    res.json(montarDashboard(periodo.de, periodo.ate, medicoId));
  }),
);
