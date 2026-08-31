import { Router } from "express";
import { z } from "zod";
import { hashPassword, verifyPassword } from "../auth/crypto.js";
import { gerarPoolSenhasDesbloqueio } from "../auth/senhasDesbloqueio.js";
import { requireAuth, requireModulo } from "../auth/middleware.js";
import { getDb } from "../db/index.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { normEmail, maskEmail } from "../utils/email.js";
import { parseDataImageUrl } from "../utils/imageDataUrl.js";
import { normalizeLogoForStorage } from "../utils/normalizeLogo.js";
import { garantirUsuariosOperacionais } from "../services/usuariosPadrao.js";

const LOGO_INPUT_DATA_URL_MAX = 12_000_000;

const logoInputSchema = z
  .string()
  .max(LOGO_INPUT_DATA_URL_MAX, "Imagem muito grande para enviar.")
  .refine(
    (v) => !v || parseDataImageUrl(v) !== null,
    "Logo deve ser imagem (PNG, JPG, WebP, GIF, BMP, TIFF, HEIC ou ICO)",
  );

async function persistLogo(raw: string | undefined): Promise<string | null | undefined> {
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  logoInputSchema.parse(trimmed);
  return normalizeLogoForStorage(trimmed);
}

const emailSchema = z
  .string()
  .min(5)
  .max(120)
  .email("Informe um e-mail valido.");

const createSchema = z.object({
  nome: z.string().min(1).max(120),
  cnpj_cpf: z.string().max(18).optional(),
  telefone: z.string().max(30).optional(),
  endereco: z.string().max(200).optional(),
  email: emailSchema,
  email_senha: z.string().min(1, "Informe a senha do e-mail cadastrado."),
  logo: logoInputSchema.optional(),
});

const updateSchema = z
  .object({
    logo: z.union([logoInputSchema, z.literal("")]).optional(),
    email: emailSchema.optional(),
    email_senha: z.string().optional(),
    telefone: z.string().max(30).optional(),
    endereco: z.string().max(200).optional(),
  })
  .refine(
    (b) =>
      b.logo !== undefined ||
      b.email !== undefined ||
      b.email_senha !== undefined ||
      b.telefone !== undefined ||
      b.endereco !== undefined,
    { message: "Nada para atualizar" },
  );

function mapClinicaRow(row: {
  nome: string;
  cnpj_cpf: string | null;
  telefone: string | null;
  endereco: string | null;
  email: string | null;
  logo_path: string | null;
}) {
  return {
    nome: normNome(row.nome),
    cnpj_cpf: row.cnpj_cpf?.trim() || null,
    telefone: row.telefone?.trim() || null,
    endereco: row.endereco?.trim() || null,
    email: row.email?.trim() || null,
    logo: row.logo_path?.trim() || null,
  };
}

function normNome(v: string) {
  return v.trim().toUpperCase();
}

export function salvarSenhaEmailClinica(senha: string): void {
  const { hash, salt } = hashPassword(senha.trim());
  getDb()
    .prepare(
      `UPDATE clinica SET email_senha_hash = ?, email_senha_salt = ?
       WHERE id = 1`,
    )
    .run(hash, salt);
}

export function verificarSenhaEmailClinica(senha: string): boolean {
  const row = getDb()
    .prepare(
      "SELECT email_senha_hash, email_senha_salt FROM clinica WHERE id = 1",
    )
    .get() as
    | { email_senha_hash: string | null; email_senha_salt: string | null }
    | undefined;
  if (!row?.email_senha_hash || !row.email_senha_salt) return false;
  return verifyPassword(senha.trim(), row.email_senha_salt, row.email_senha_hash);
}

export function senhaEmailClinicaConfigurada(): boolean {
  const row = getDb()
    .prepare("SELECT email_senha_hash FROM clinica WHERE id = 1")
    .get() as { email_senha_hash: string | null } | undefined;
  return Boolean(row?.email_senha_hash?.trim());
}

export function getClinicaRecoveryEmail(): string | null {
  const row = getDb()
    .prepare("SELECT email FROM clinica WHERE id = 1")
    .get() as { email: string | null } | undefined;
  return row?.email?.trim() || null;
}

export function setClinicaRecoveryEmail(email: string): boolean {
  const row = getDb()
    .prepare("SELECT id FROM clinica WHERE id = 1")
    .get() as { id: number } | undefined;
  if (!row) return false;
  getDb()
    .prepare("UPDATE clinica SET email = ? WHERE id = 1")
    .run(normEmail(email));
  return true;
}

export function getRecuperacaoContext() {
  const clinica = getDb()
    .prepare("SELECT nome, email FROM clinica WHERE id = 1")
    .get() as { nome: string; email: string | null } | undefined;
  const users = getDb()
    .prepare("SELECT login FROM usuarios WHERE ativo = 1 ORDER BY id")
    .all() as { login: string }[];
  const email = clinica?.email?.trim() || null;
  const senhaOk = senhaEmailClinicaConfigurada();
  return {
    clinica_cadastrada: Boolean(clinica),
    nome: clinica ? normNome(clinica.nome) : null,
    email_cadastrado: Boolean(email),
    email_dica: email ? maskEmail(email) : null,
    username: users[0]?.login ?? null,
    usernames: users.map((u) => u.login),
    pode_recuperar: Boolean(clinica) && users.length > 0 && senhaOk,
    senha_email_configurada: senhaOk,
  };
}

export const clinicaRouter = Router();

clinicaRouter.get(
  "/branding",
  asyncHandler(async (_req, res) => {
    const row = getDb()
      .prepare("SELECT nome, cnpj_cpf, logo_path FROM clinica WHERE id = 1")
      .get() as
      | { nome: string; cnpj_cpf: string | null; logo_path: string | null }
      | undefined;
    res.json({
      nome: row ? normNome(row.nome) : "",
      cnpj_cpf: row?.cnpj_cpf?.trim() ?? "",
      logo: row?.logo_path?.trim() || null,
      configured: Boolean(row),
    });
  }),
);

clinicaRouter.get(
  "/status",
  asyncHandler(async (_req, res) => {
    const row = getDb()
      .prepare("SELECT COUNT(*) AS n FROM clinica")
      .get() as { n: number };
    res.json({ exists: Number(row?.n ?? 0) > 0 });
  }),
);

clinicaRouter.get(
  "/",
  requireAuth(),
  asyncHandler(async (_req, res) => {
    const row = getDb()
      .prepare(
        "SELECT nome, cnpj_cpf, telefone, endereco, email, logo_path FROM clinica WHERE id = 1",
      )
      .get() as
      | {
          nome: string;
          cnpj_cpf: string | null;
          telefone: string | null;
          endereco: string | null;
          email: string | null;
          logo_path: string | null;
        }
      | undefined;
    if (!row) {
      res.json(null);
      return;
    }
    res.json(mapClinicaRow(row));
  }),
);

clinicaRouter.post(
  "/",
  requireAuth(),
  requireModulo("clinica"),
  asyncHandler(async (req, res) => {
    const count = getDb()
      .prepare("SELECT COUNT(*) AS n FROM clinica")
      .get() as { n: number };
    if (Number(count?.n ?? 0) > 0) {
      res.status(409).json({ error: "Já existe uma clínica cadastrada." });
      return;
    }
    const body = createSchema.parse(req.body);
    const emailNorm = normEmail(body.email);
    const { hash, salt } = hashPassword(body.email_senha.trim());
    const logoStored = body.logo?.trim()
      ? await persistLogo(body.logo.trim())
      : null;

    getDb()
      .prepare(
        `INSERT INTO clinica (id, nome, cnpj_cpf, telefone, endereco, email, logo_path, email_senha_hash, email_senha_salt)
         VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        normNome(body.nome),
        body.cnpj_cpf?.trim() || null,
        body.telefone?.trim() || null,
        body.endereco?.trim() || null,
        emailNorm,
        logoStored,
        hash,
        salt,
      );

    gerarPoolSenhasDesbloqueio();
    // Secretaria padrão — e-mail/senha da clínica NÃO viram usuário de acesso.
    garantirUsuariosOperacionais();

    const created = getDb()
      .prepare(
        "SELECT nome, cnpj_cpf, telefone, endereco, email, logo_path FROM clinica WHERE id = 1",
      )
      .get() as {
      nome: string;
      cnpj_cpf: string | null;
      telefone: string | null;
      endereco: string | null;
      email: string | null;
      logo_path: string | null;
    };
    res.status(201).json(mapClinicaRow(created));
  }),
);

clinicaRouter.put(
  "/",
  requireAuth(),
  requireModulo("clinica"),
  asyncHandler(async (req, res) => {
    const existing = getDb()
      .prepare("SELECT id FROM clinica WHERE id = 1")
      .get() as { id: number } | undefined;
    if (!existing) {
      res.status(404).json({ error: "Clínica não cadastrada" });
      return;
    }
    const body = updateSchema.parse(req.body);
    const sets: string[] = [];
    const values: unknown[] = [];
    if (body.logo !== undefined) {
      sets.push("logo_path = ?");
      values.push(
        body.logo.trim() ? await persistLogo(body.logo.trim()) : null,
      );
    }
    if (body.email !== undefined) {
      sets.push("email = ?");
      values.push(normEmail(body.email));
    }
    if (body.email_senha?.trim()) {
      const { hash, salt } = hashPassword(body.email_senha.trim());
      sets.push("email_senha_hash = ?", "email_senha_salt = ?");
      values.push(hash, salt);
    }
    if (body.telefone !== undefined) {
      sets.push("telefone = ?");
      values.push(body.telefone.trim() || null);
    }
    if (body.endereco !== undefined) {
      sets.push("endereco = ?");
      values.push(body.endereco.trim() || null);
    }
    if (!sets.length) {
      res.status(400).json({ error: "Nada para atualizar" });
      return;
    }
    getDb()
      .prepare(`UPDATE clinica SET ${sets.join(", ")} WHERE id = 1`)
      .run(...values);

    gerarPoolSenhasDesbloqueio();

    const updated = getDb()
      .prepare(
        "SELECT nome, cnpj_cpf, telefone, endereco, email, logo_path FROM clinica WHERE id = 1",
      )
      .get() as {
      nome: string;
      cnpj_cpf: string | null;
      telefone: string | null;
      endereco: string | null;
      email: string | null;
      logo_path: string | null;
    };
    res.json(mapClinicaRow(updated));
  }),
);
