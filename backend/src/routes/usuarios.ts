import { Router } from "express";
import { z } from "zod";
import {
  MODULO_LABELS,
  MODULOS,
  aplicarPermissoesPadrao,
  getPermissoesUsuario,
  setPermissoesUsuario,
} from "../auth/modulos.js";
import { requireAuth, requireModulo } from "../auth/middleware.js";
import { hashPassword } from "../auth/crypto.js";
import { loginSchema } from "../auth/loginSchema.js";
import type { Perfil } from "../auth/users.js";
import { getDb } from "../db/index.js";
import { asyncHandler } from "../middleware/asyncHandler.js";

export const usuariosRouter = Router();

usuariosRouter.use(requireAuth(), requireModulo("usuarios"));

usuariosRouter.get(
  "/modulos",
  asyncHandler(async (_req, res) => {
    res.json({
      modulos: MODULOS.map((m) => ({
        codigo: m,
        label: MODULO_LABELS[m],
      })),
    });
  }),
);

usuariosRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const perfil = String(req.query.perfil ?? "").trim();
    let sql = `SELECT id, nome, login, perfil, crm, ativo, created_at FROM usuarios`;
    const params: unknown[] = [];
    if (perfil) {
      sql += ` WHERE perfil = ?`;
      params.push(perfil);
    }
    sql += ` ORDER BY nome COLLATE NOCASE`;
    const rows = getDb().prepare(sql).all(...params);
    res.json(rows);
  }),
);

usuariosRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const row = getDb()
      .prepare(
        `SELECT id, nome, login, perfil, crm, ativo, created_at FROM usuarios WHERE id = ?`,
      )
      .get(id);
    if (!row) {
      res.status(404).json({ error: "Usuário não encontrado" });
      return;
    }
    const permissoes = getPermissoesUsuario(id, (row as { perfil: Perfil }).perfil);
    res.json({ ...row, permissoes });
  }),
);

const createSchema = z.object({
  nome: z.string().min(2).max(120),
  login: loginSchema,
  senha: z.string().min(6),
  perfil: z.enum(["admin", "medico", "secretaria"]),
  crm: z.string().max(20).optional(),
  permissoes: z.array(z.string()).optional(),
});

usuariosRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body);
    const login = body.login.trim().toLowerCase();
    const { hash, salt } = hashPassword(body.senha);
    try {
      const info = getDb()
        .prepare(
          `INSERT INTO usuarios (nome, login, senha_hash, senha_salt, perfil, crm)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          body.nome.trim(),
          login,
          hash,
          salt,
          body.perfil,
          body.crm?.trim() || null,
        );
      const id = Number(info.lastInsertRowid);
      if (body.permissoes?.length) {
        setPermissoesUsuario(id, body.permissoes);
      } else {
        aplicarPermissoesPadrao(id, body.perfil);
      }
      const created = getDb()
        .prepare(
          `SELECT id, nome, login, perfil, crm, ativo, created_at FROM usuarios WHERE id = ?`,
        )
        .get(id) as
        | {
            id: number;
            nome: string;
            login: string;
            perfil: Perfil;
            crm: string | null;
            ativo: number;
            created_at: string;
          }
        | undefined;
      if (!created) {
        res.status(500).json({ error: "Falha ao criar usuário" });
        return;
      }
      res.status(201).json({
        ...created,
        permissoes: getPermissoesUsuario(id, body.perfil),
      });
    } catch (e: unknown) {
      if (String(e).includes("UNIQUE")) {
        res.status(409).json({ error: "Login já cadastrado" });
        return;
      }
      throw e;
    }
  }),
);

const updateSchema = z.object({
  nome: z.string().min(2).max(120).optional(),
  senha: z.string().min(6).optional(),
  perfil: z.enum(["admin", "medico", "secretaria"]).optional(),
  crm: z.string().max(30).nullable().optional(),
  ativo: z.boolean().optional(),
  permissoes: z.array(z.string()).optional(),
});

usuariosRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const body = updateSchema.parse(req.body);
    const atual = getDb()
      .prepare(`SELECT id, perfil FROM usuarios WHERE id = ?`)
      .get(id) as { id: number; perfil: Perfil } | undefined;
    if (!atual) {
      res.status(404).json({ error: "Usuário não encontrado" });
      return;
    }
    if (id === req.usuario!.id && body.ativo === false) {
      res.status(400).json({ error: "Você não pode desativar a si mesmo" });
      return;
    }
    const sets: string[] = [];
    const vals: unknown[] = [];
    if (body.nome !== undefined) {
      sets.push("nome = ?");
      vals.push(body.nome.trim());
    }
    if (body.perfil !== undefined) {
      sets.push("perfil = ?");
      vals.push(body.perfil);
    }
    if (body.crm !== undefined) {
      sets.push("crm = ?");
      vals.push(body.crm);
    }
    if (body.ativo !== undefined) {
      sets.push("ativo = ?");
      vals.push(body.ativo ? 1 : 0);
    }
    if (body.senha) {
      const { hash, salt } = hashPassword(body.senha);
      sets.push("senha_hash = ?", "senha_salt = ?");
      vals.push(hash, salt);
    }
    if (sets.length) {
      sets.push("updated_at = datetime('now', 'localtime')");
      getDb()
        .prepare(`UPDATE usuarios SET ${sets.join(", ")} WHERE id = ?`)
        .run(...vals, id);
    }
    const perfil = (body.perfil ?? atual.perfil) as Perfil;
    if (body.permissoes) {
      setPermissoesUsuario(id, body.permissoes);
    } else if (body.perfil !== undefined && body.perfil !== atual.perfil) {
      aplicarPermissoesPadrao(id, perfil);
    }
    const updated = getDb()
      .prepare(
        `SELECT id, nome, login, perfil, crm, ativo, created_at FROM usuarios WHERE id = ?`,
      )
      .get(id) as
      | {
          id: number;
          nome: string;
          login: string;
          perfil: Perfil;
          crm: string | null;
          ativo: number;
          created_at: string;
        }
      | undefined;
    if (!updated) {
      res.status(404).json({ error: "Usuário não encontrado" });
      return;
    }
    res.json({
      ...updated,
      permissoes: getPermissoesUsuario(id, perfil),
    });
  }),
);
