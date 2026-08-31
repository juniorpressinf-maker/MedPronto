import fs from "node:fs";
import { Router } from "express";
import { z } from "zod";
import { config } from "../config.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { searchCid10 } from "../services/cid10Service.js";

export const cidRouter = Router();

const querySchema = z.object({
  q: z.string().optional().default(""),
});

cidRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { q } = querySchema.parse(req.query);
    const resultados = searchCid10(q, 10);
    res.json({
      q,
      total: resultados.length,
      itens: resultados,
      fonte: fs.existsSync(config.cid10Path) ? "local" : "amostra",
    });
  }),
);
