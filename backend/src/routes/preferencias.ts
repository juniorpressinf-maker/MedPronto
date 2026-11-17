import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../auth/middleware.js";
import { getDb } from "../db/index.js";
import { asyncHandler } from "../middleware/asyncHandler.js";

/** Preferências do próprio usuário (cada médico escolhe as suas). */
export const preferenciasRouter = Router();
preferenciasRouter.use(requireAuth());

type Impressao = { impressao_timbrado: number; timbrado_topo_mm: number; timbrado_rodape_mm: number };

export function lerImpressao(usuarioId: number): Impressao {
  return getDb()
    .prepare(`SELECT impressao_timbrado, timbrado_topo_mm, timbrado_rodape_mm FROM usuarios WHERE id = ?`)
    .get(usuarioId) as Impressao;
}

preferenciasRouter.get(
  "/impressao",
  asyncHandler(async (req, res) => {
    res.json(lerImpressao(req.usuario!.id));
  }),
);

export const impressaoSchema = z.strictObject({
  impressao_timbrado: z.boolean(),
  timbrado_topo_mm: z.number().int().min(0).max(120),
  timbrado_rodape_mm: z.number().int().min(0).max(80),
});

preferenciasRouter.put(
  "/impressao",
  asyncHandler(async (req, res) => {
    salvarImpressao(req.usuario!.id, impressaoSchema.parse(req.body));
    res.json(lerImpressao(req.usuario!.id));
  }),
);

export function salvarImpressao(usuarioId: number, b: z.infer<typeof impressaoSchema>): void {
  getDb()
    .prepare(
      `UPDATE usuarios SET impressao_timbrado = ?, timbrado_topo_mm = ?, timbrado_rodape_mm = ? WHERE id = ?`,
    )
    .run(b.impressao_timbrado ? 1 : 0, b.timbrado_topo_mm, b.timbrado_rodape_mm, usuarioId);
}
