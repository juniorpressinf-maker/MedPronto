import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireModulo } from "../auth/middleware.js";
import { getDb } from "../db/index.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import {
  assertCpfUnico,
  CpfDuplicadoError,
  resolverCpfPaciente,
} from "../services/pacienteCpf.js";
import { logAcesso } from "../services/logAcesso.js";

export const pacientesRouter = Router();

/** Campos de identificação: o log guarda o valor ANTIGO e o NOVO. */
const CAMPOS_IDENTIDADE = ["nome", "data_nasc", "cpf", "telefone"] as const;
const CAMPOS_AUDITADOS = [
  ...CAMPOS_IDENTIDADE,
  "nome_mae", "email", "endereco", "numero", "bairro", "cidade", "uf", "fone_emergencia",
  "alergias", "medicacoes_uso", "observacoes_clinicas",
] as const;

/** B3 [13]: resumo das mudanças do cadastro (identidade com antes → depois). */
function diffPaciente(
  antes: Record<string, unknown>,
  depois: Record<string, unknown>,
): string {
  const norm = (v: unknown) => (v == null ? "" : String(v));
  const partes: string[] = [];
  for (const c of CAMPOS_AUDITADOS) {
    if (norm(antes[c]) === norm(depois[c])) continue;
    partes.push(
      (CAMPOS_IDENTIDADE as readonly string[]).includes(c)
        ? `${c}: "${norm(antes[c])}" → "${norm(depois[c])}"`
        : c,
    );
  }
  return partes.join("; ");
}

pacientesRouter.use(requireAuth(), requireModulo("pacientes"));

function tratarErroCpf(e: unknown): { status: number; error: string } | null {
  if (e instanceof CpfDuplicadoError) {
    return { status: 409, error: e.message };
  }
  if (e instanceof Error && e.name === "CpfInvalidoError") {
    return { status: 400, error: e.message };
  }
  const code = (e as { code?: string }).code;
  if (code === "SQLITE_CONSTRAINT_UNIQUE") {
    return { status: 409, error: "Já existe paciente cadastrado com este CPF" };
  }
  return null;
}

const pacienteBody = z.object({
  nome: z.string().min(2).max(200),
  data_nasc: z.string().min(1, "Informe a data de nascimento").max(10),
  cpf: z.string().max(14).optional(),
  /** Ausente/null = não mexe (telas que não têm o campo); "" apaga. */
  nome_mae: z.string().max(200).nullable().optional(),
  telefone: z
    .string()
    .min(1, "Informe o telefone")
    .max(30)
    .refine((v) => v.replace(/\D/g, "").length >= 10, {
      message: "Telefone incompleto (mínimo 10 dígitos)",
    }),
  email: z.string().email().optional().or(z.literal("")),
  endereco: z.string().max(200).optional(),
  numero: z.string().max(20).optional(),
  bairro: z.string().max(100).optional(),
  cidade: z.string().max(100).optional(),
  uf: z.string().max(2).optional(),
  fone_emergencia: z.string().max(30).optional(),
  alergias: z.string().max(2000).optional(),
  medicacoes_uso: z.string().max(2000).optional(),
  observacoes_clinicas: z.string().max(4000).optional(),
});

pacientesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = String(req.query.q ?? "").trim();
    let sql = `SELECT id, nome, data_nasc, cpf, nome_mae, telefone, email,
                      endereco, numero, bairro, cidade, uf, fone_emergencia,
                      alergias, medicacoes_uso, observacoes_clinicas,
                      created_at, updated_at,
                      (SELECT COUNT(*) FROM exames_anexos e
                        WHERE e.paciente_id = pacientes.id) AS exames_qtd
               FROM pacientes`;
    const params: unknown[] = [];
    if (q) {
      sql += ` WHERE nome LIKE ? COLLATE NOCASE OR cpf LIKE ? OR telefone LIKE ?`;
      const like = `%${q}%`;
      params.push(like, like, like);
    }
    sql += ` ORDER BY nome COLLATE NOCASE`;
    res.json(getDb().prepare(sql).all(...params));
  }),
);

pacientesRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const row = getDb()
      .prepare(`SELECT * FROM pacientes WHERE id = ?`)
      .get(Number(req.params.id));
    if (!row) {
      res.status(404).json({ error: "Paciente não encontrado" });
      return;
    }
    res.json(row);
  }),
);

pacientesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = pacienteBody.parse(req.body);
    const db = getDb();
    let cpf: string | null;
    try {
      ({ cpf } = resolverCpfPaciente(body.cpf));
      assertCpfUnico(db, cpf);
    } catch (e) {
      const handled = tratarErroCpf(e);
      if (handled) {
        res.status(handled.status).json({ error: handled.error });
        return;
      }
      throw e;
    }
    try {
      const info = db
        .prepare(
          `INSERT INTO pacientes (nome, data_nasc, cpf, nome_mae, telefone, email,
           endereco, numero, bairro, cidade, uf, fone_emergencia,
           alergias, medicacoes_uso, observacoes_clinicas)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          body.nome.trim(),
          body.data_nasc.trim(),
          cpf,
          body.nome_mae?.trim().toUpperCase() || null,
          body.telefone.trim(),
          body.email?.trim() || null,
          body.endereco?.trim() || null,
          body.numero?.trim() || null,
          body.bairro?.trim() || null,
          body.cidade?.trim() || null,
          body.uf?.trim().toUpperCase() || null,
          body.fone_emergencia?.trim() || null,
          body.alergias?.trim() || null,
          body.medicacoes_uso?.trim() || null,
          body.observacoes_clinicas?.trim() || null,
        );
      const created = db
        .prepare(`SELECT * FROM pacientes WHERE id = ?`)
        .get(info.lastInsertRowid);
      res.status(201).json(created);
    } catch (e) {
      const handled = tratarErroCpf(e);
      if (handled) {
        res.status(handled.status).json({ error: handled.error });
        return;
      }
      throw e;
    }
  }),
);

pacientesRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const body = pacienteBody.parse(req.body);
    const db = getDb();
    let cpf: string | null;
    try {
      ({ cpf } = resolverCpfPaciente(body.cpf));
      assertCpfUnico(db, cpf, id);
    } catch (e) {
      const handled = tratarErroCpf(e);
      if (handled) {
        res.status(handled.status).json({ error: handled.error });
        return;
      }
      throw e;
    }
    const antes = db.prepare(`SELECT * FROM pacientes WHERE id = ?`).get(id) as
      | Record<string, unknown>
      | undefined;
    try {
      const info = db
        .prepare(
          `UPDATE pacientes SET nome = ?, data_nasc = ?, cpf = ?,
           nome_mae = CASE WHEN ? IS NULL THEN nome_mae ELSE NULLIF(?, '') END,
           telefone = ?, email = ?,
           endereco = ?, numero = ?, bairro = ?, cidade = ?, uf = ?, fone_emergencia = ?,
           alergias = ?, medicacoes_uso = ?, observacoes_clinicas = ?,
           updated_at = datetime('now', 'localtime') WHERE id = ?`,
        )
        .run(
          body.nome.trim(),
          body.data_nasc.trim(),
          cpf,
          body.nome_mae == null ? null : body.nome_mae.trim().toUpperCase(),
          body.nome_mae == null ? null : body.nome_mae.trim().toUpperCase(),
          body.telefone.trim(),
          body.email?.trim() || null,
          body.endereco?.trim() || null,
          body.numero?.trim() || null,
          body.bairro?.trim() || null,
          body.cidade?.trim() || null,
          body.uf?.trim().toUpperCase() || null,
          body.fone_emergencia?.trim() || null,
          body.alergias?.trim() || null,
          body.medicacoes_uso?.trim() || null,
          body.observacoes_clinicas?.trim() || null,
          id,
        );
      if (info.changes === 0) {
        res.status(404).json({ error: "Paciente não encontrado" });
        return;
      }
      const depois = db.prepare(`SELECT * FROM pacientes WHERE id = ?`).get(id) as Record<string, unknown>;
      const mudancas = antes ? diffPaciente(antes, depois) : "";
      if (mudancas) {
        logAcesso({
          usuarioId: req.usuario!.id,
          pacienteId: id,
          acao: "paciente_alterado",
          detalhe: mudancas.slice(0, 2000),
        });
      }
      res.json(depois);
    } catch (e) {
      const handled = tratarErroCpf(e);
      if (handled) {
        res.status(handled.status).json({ error: handled.error });
        return;
      }
      throw e;
    }
  }),
);

pacientesRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const antes = getDb()
      .prepare(`SELECT nome, cpf, data_nasc FROM pacientes WHERE id = ?`)
      .get(id) as { nome: string; cpf: string | null; data_nasc: string | null } | undefined;
    try {
      const info = getDb()
        .prepare(`DELETE FROM pacientes WHERE id = ?`)
        .run(id);
      if (info.changes === 0) {
        res.status(404).json({ error: "Paciente não encontrado" });
        return;
      }
      // Paciente já não existe: o log guarda os dados no texto (sem paciente_id).
      logAcesso({
        usuarioId: req.usuario!.id,
        pacienteId: null,
        acao: "paciente_excluido",
        detalhe: `id=${id} nome="${antes?.nome ?? ""}" cpf="${antes?.cpf ?? ""}" nasc="${antes?.data_nasc ?? ""}"`,
      });
      res.status(204).send();
    } catch (e: unknown) {
      const code = (e as { code?: string }).code;
      if (code === "SQLITE_CONSTRAINT_FOREIGNKEY") {
        res.status(400).json({
          error: "Paciente possui agendamentos ou prontuário — não pode excluir.",
        });
        return;
      }
      throw e;
    }
  }),
);
