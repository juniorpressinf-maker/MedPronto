import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireModulo } from "../auth/middleware.js";
import { getDb } from "../db/index.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { logAcesso } from "../services/logAcesso.js";

export const auditoriaRouter = Router();

auditoriaRouter.use(requireAuth(), requireModulo("usuarios"));

const querySchema = z.object({
  q: z.string().optional(),
  acao: z.string().optional(),
  de: z.string().optional(),
  ate: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

auditoriaRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Parâmetros inválidos" });
      return;
    }

    const { q, acao, de, ate } = parsed.data;
    const limit = parsed.data.limit ?? 200;
    const offset = parsed.data.offset ?? 0;

    const where: string[] = [];
    const vals: unknown[] = [];

    if (acao?.trim()) {
      where.push("l.acao = ?");
      vals.push(acao.trim());
    }
    if (de?.trim()) {
      where.push("date(l.created_at) >= date(?)");
      vals.push(de.trim());
    }
    if (ate?.trim()) {
      where.push("date(l.created_at) <= date(?)");
      vals.push(ate.trim());
    }
    const term = q?.trim().toLowerCase();
    if (term) {
      where.push(
        `(lower(l.acao) LIKE ? OR lower(l.detalhe) LIKE ? OR lower(u.nome) LIKE ? OR lower(u.login) LIKE ? OR lower(p.nome) LIKE ?)`,
      );
      const like = `%${term}%`;
      vals.push(like, like, like, like, like);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const totalRow = getDb()
      .prepare(
        `SELECT COUNT(*) AS n
         FROM log_acesso l
         LEFT JOIN usuarios u ON u.id = l.usuario_id
         LEFT JOIN pacientes p ON p.id = l.paciente_id
         ${whereSql}`,
      )
      .get(...vals) as { n: number };

    const rows = getDb()
      .prepare(
        `SELECT
           l.id,
           l.usuario_id,
           u.nome AS usuario_nome,
           u.login AS usuario_login,
           l.paciente_id,
           p.nome AS paciente_nome,
           l.acao,
           l.detalhe,
           l.created_at
         FROM log_acesso l
         LEFT JOIN usuarios u ON u.id = l.usuario_id
         LEFT JOIN pacientes p ON p.id = l.paciente_id
         ${whereSql}
         ORDER BY l.id DESC
         LIMIT ? OFFSET ?`,
      )
      .all(...vals, limit, offset);

    logAcesso({
      usuarioId: req.usuario!.id,
      acao: "auditoria_consultada",
      detalhe: term || acao || de || ate || "lista",
    });

    res.json({
      total: Number(totalRow?.n ?? 0),
      limit,
      offset,
      itens: rows,
    });
  }),
);

auditoriaRouter.get(
  "/acoes",
  asyncHandler(async (_req, res) => {
    const rows = getDb()
      .prepare(
        `SELECT acao, COUNT(*) AS n
         FROM log_acesso
         GROUP BY acao
         ORDER BY acao`,
      )
      .all() as { acao: string; n: number }[];
    res.json({ acoes: rows });
  }),
);
