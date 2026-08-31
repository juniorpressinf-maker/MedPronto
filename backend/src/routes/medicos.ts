import { Router } from "express";

import { z } from "zod";

import { hashPassword } from "../auth/crypto.js";

import {

  aplicarPermissoesPadrao,

  usuarioTemModulo,

  type Modulo,

} from "../auth/modulos.js";

import { requireAuth, requireModulo } from "../auth/middleware.js";

import { loginSchema } from "../auth/loginSchema.js";
import type { Perfil } from "../auth/users.js";

import { getDb } from "../db/index.js";

import { asyncHandler } from "../middleware/asyncHandler.js";



export const medicosRouter = Router();



const MEDICO_COLS = `id, nome, login, crm, cpf, telefone, endereco, email, ativo, created_at`;



function podeListarMedicos(req: { usuario?: { id: number; perfil: string } }) {

  const u = req.usuario!;

  const perfil = u.perfil as Perfil;

  const modulos: Modulo[] = [

    "agenda",

    "fila_recepcao",

    "usuarios",

    "clinica",

    "fila_medico",

    "prontuario_escrever",

    "admissional",

    "admissional_agenda",

  ];

  return modulos.some((m) => usuarioTemModulo(u.id, perfil, m));

}



function medicoTemHistoricoClinico(medicoId: number): boolean {

  const db = getDb();

  const checks = [

    `SELECT 1 FROM prontuarios WHERE medico_id = ? LIMIT 1`,

    `SELECT 1 FROM receitas WHERE medico_id = ? LIMIT 1`,

    `SELECT 1 FROM atestados WHERE medico_id = ? LIMIT 1`,

    `SELECT 1 FROM pedidos_exame WHERE medico_id = ? LIMIT 1`,

    `SELECT 1 FROM admissionais WHERE medico_id = ? LIMIT 1`,

    `SELECT 1 FROM exames_anexos WHERE uploaded_by = ? LIMIT 1`,

  ];

  return checks.some((sql) => Boolean(db.prepare(sql).get(medicoId)));

}



function excluirMedico(medicoId: number): void {

  const db = getDb();

  db.transaction(() => {

    db.prepare(`DELETE FROM agendamentos WHERE medico_id = ?`).run(medicoId);

    db.prepare(`DELETE FROM agenda_bloqueios WHERE medico_id = ?`).run(medicoId);

    db.prepare(`DELETE FROM receita_modelos WHERE medico_id = ?`).run(medicoId);

    db.prepare(`DELETE FROM log_acesso WHERE usuario_id = ?`).run(medicoId);

    db.prepare(`DELETE FROM usuarios WHERE id = ? AND perfil = 'medico'`).run(

      medicoId,

    );

  })();

}



function loginExists(login: string, excetoId?: number): boolean {

  const row = excetoId

    ? getDb()

        .prepare(

          `SELECT 1 FROM usuarios WHERE login = ? COLLATE NOCASE AND id <> ?`,

        )

        .get(login, excetoId)

    : getDb()

        .prepare(`SELECT 1 FROM usuarios WHERE login = ? COLLATE NOCASE`)

        .get(login);

  return Boolean(row);

}



function slugLogin(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
}

function extrairPrimeiroNome(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  for (const parte of partes) {
    const slug = slugLogin(parte);
    if (slug && slug !== "dr" && slug !== "dra" && slug.length >= 2) {
      return parte;
    }
  }
  return partes[0] ?? nome.trim();
}

function gerarLogin(nome: string): string {
  const primeiro = slugLogin(extrairPrimeiroNome(nome));
  const tokens = nome
    .trim()
    .split(/\s+/)
    .map((p) => slugLogin(p))
    .filter((s) => s && s !== "dr" && s !== "dra");

  let base = primeiro || tokens[0] || "med";
  if (base.length < 3 && tokens[1]) {
    base = `${tokens[0]}${tokens[1]}`.slice(0, 24);
  }
  if (base.length < 3) {
    base = slugLogin(nome).slice(0, 12) || "med";
  }
  base = base.slice(0, 24);

  if (!loginExists(base)) return base;

  for (let n = 1; n <= 9999; n++) {
    const login = `${base}${n}`.slice(0, 30);
    if (!loginExists(login)) return login;
  }

  return `${base}${String(Date.now()).slice(-4)}`.slice(0, 30);
}



const medicoBody = z.object({

  nome: z.string().min(2, "Informe o nome do médico").max(120),

  crm: z
    .string()
    .trim()
    .min(2, "Informe o CRM (mínimo 2 caracteres)")
    .max(30, "CRM muito longo (máximo 30 caracteres)"),

  cpf: z.string().max(14).optional(),

  telefone: z.string().max(30).optional(),

  endereco: z.string().max(500).optional(),

  email: z.string().email("E-mail inválido").optional().or(z.literal("")),

  login: loginSchema.optional(),

  senha: z.string().min(6).optional(),

  ativo: z.boolean().optional(),

});



medicosRouter.use(requireAuth());



medicosRouter.get(

  "/",

  asyncHandler(async (req, res) => {

    if (!podeListarMedicos(req)) {

      res.status(403).json({ error: "Sem permissão para listar médicos" });

      return;

    }

    const q = String(req.query.q ?? "").trim();

    const incluirInativos =

      req.query.inativos === "1" || req.query.ativos === "0";

    let sql = `SELECT ${MEDICO_COLS} FROM usuarios WHERE perfil = 'medico'`;

    const params: unknown[] = [];

    if (!incluirInativos) sql += ` AND ativo = 1`;

    if (q) {

      sql += ` AND (nome LIKE ? COLLATE NOCASE OR crm LIKE ? OR cpf LIKE ? OR telefone LIKE ?)`;

      const like = `%${q}%`;

      params.push(like, like, like, like);

    }

    sql += ` ORDER BY nome COLLATE NOCASE`;

    res.json(getDb().prepare(sql).all(...params));

  }),

);



medicosRouter.get(

  "/:id",

  asyncHandler(async (req, res) => {

    if (!podeListarMedicos(req)) {

      res.status(403).json({ error: "Sem permissão" });

      return;

    }

    const id = Number(req.params.id);

    const row = getDb()

      .prepare(

        `SELECT ${MEDICO_COLS} FROM usuarios WHERE id = ? AND perfil = 'medico'`,

      )

      .get(id);

    if (!row) {

      res.status(404).json({ error: "Médico não encontrado" });

      return;

    }

    res.json(row);

  }),

);



medicosRouter.post(

  "/",

  requireModulo("usuarios", "clinica"),

  asyncHandler(async (req, res) => {

    const body = medicoBody.parse(req.body);

    const login = (body.login?.trim() || gerarLogin(body.nome)).toLowerCase();

    const senha = body.senha?.trim();

    if (!senha || senha.length < 6) {

      res.status(400).json({

        error: "Informe a senha de acesso do médico (mínimo 6 caracteres)",

      });

      return;

    }

    const { hash, salt } = hashPassword(senha);

    try {

      const info = getDb()

        .prepare(

          `INSERT INTO usuarios (nome, login, senha_hash, senha_salt, perfil, crm, cpf, telefone, endereco, email, ativo)

           VALUES (?, ?, ?, ?, 'medico', ?, ?, ?, ?, ?, 1)`,

        )

        .run(

          body.nome.trim(),

          login,

          hash,

          salt,

          body.crm.trim(),

          body.cpf?.trim() || null,

          body.telefone?.trim() || null,

          body.endereco?.trim() || null,

          body.email?.trim() || null,

        );

      const id = Number(info.lastInsertRowid);

      aplicarPermissoesPadrao(id, "medico");

      const created = getDb()

        .prepare(`SELECT ${MEDICO_COLS} FROM usuarios WHERE id = ?`)

        .get(id);

      res.status(201).json(created);

    } catch (e) {

      const err = e as { code?: string };

      if (err.code === "SQLITE_CONSTRAINT_UNIQUE") {

        res.status(409).json({ error: "Login já cadastrado" });

        return;

      }

      throw e;

    }

  }),

);



medicosRouter.put(

  "/:id",

  requireModulo("usuarios", "clinica"),

  asyncHandler(async (req, res) => {

    const id = Number(req.params.id);

    const body = medicoBody.partial().parse(req.body);

    const atual = getDb()

      .prepare(`SELECT id, perfil FROM usuarios WHERE id = ?`)

      .get(id) as { id: number; perfil: string } | undefined;

    if (!atual || atual.perfil !== "medico") {

      res.status(404).json({ error: "Médico não encontrado" });

      return;

    }



    const sets: string[] = [];

    const vals: unknown[] = [];

    if (body.nome !== undefined) {

      sets.push("nome = ?");

      vals.push(body.nome.trim());

    }

    if (body.crm !== undefined) {

      sets.push("crm = ?");

      vals.push(body.crm.trim());

    }

    if (body.cpf !== undefined) {

      sets.push("cpf = ?");

      vals.push(body.cpf?.trim() || null);

    }

    if (body.telefone !== undefined) {

      sets.push("telefone = ?");

      vals.push(body.telefone?.trim() || null);

    }

    if (body.endereco !== undefined) {

      sets.push("endereco = ?");

      vals.push(body.endereco?.trim() || null);

    }

    if (body.email !== undefined) {

      sets.push("email = ?");

      vals.push(body.email?.trim() || null);

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

      sets.push(`updated_at = datetime('now', 'localtime')`);

      vals.push(id);

      getDb()

        .prepare(`UPDATE usuarios SET ${sets.join(", ")} WHERE id = ?`)

        .run(...vals);

    }



    const updated = getDb()

      .prepare(`SELECT ${MEDICO_COLS} FROM usuarios WHERE id = ?`)

      .get(id);

    res.json(updated);

  }),

);



medicosRouter.delete(

  "/:id",

  requireModulo("usuarios", "clinica"),

  asyncHandler(async (req, res) => {

    const id = Number(req.params.id);

    const row = getDb()

      .prepare(`SELECT id, perfil, nome FROM usuarios WHERE id = ?`)

      .get(id) as { id: number; perfil: string; nome: string } | undefined;

    if (!row || row.perfil !== "medico") {

      res.status(404).json({ error: "Médico não encontrado" });

      return;

    }

    if (medicoTemHistoricoClinico(id)) {

      res.status(400).json({

        error:

          "Este médico possui prontuário ou documentos clínicos e não pode ser excluído.",

      });

      return;

    }

    try {

      excluirMedico(id);

      res.status(204).send();

    } catch (e) {

      const err = e as { code?: string };

      if (err.code === "SQLITE_CONSTRAINT_FOREIGNKEY") {

        res.status(400).json({

          error:

            "Não foi possível excluir — o médico ainda está vinculado a outros registros.",

        });

        return;

      }

      throw e;

    }

  }),

);

