// Licença de uso — estrutura pronta (igual Agenda).
// Verificação desligada por padrão: ENFORCE_LICENSE=true na fase final.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { hostname, networkInterfaces } from "node:os";
import type { NextFunction, Request, Response } from "express";
import { config } from "./config.js";
import { getDb } from "./db/index.js";
import { syncEdicaoFromLicense } from "./auth/edicao.js";

export const SIGNING_KEY =
  process.env.MEDPRONTO_LICENSE_KEY ??
  "medpronto-default-key-troque-isso-em-prod-com-no-minimo-32-chars";

const TOKEN_PREFIX = "MEDPRONTO-";
const GRACE_PREFIX = "MEDPRONTO-GRACE-";

function getMacs(): string[] {
  const ifaces = networkInterfaces();
  const macs: string[] = [];
  for (const [name, addrs] of Object.entries(ifaces)) {
    if (!addrs) continue;
    if (/loopback|virtual|vethernet|hyper|vmware|vbox|wsl/i.test(name)) continue;
    for (const a of addrs) {
      if (!a.mac || a.mac === "00:00:00:00:00:00" || a.internal) continue;
      macs.push(a.mac.toLowerCase());
    }
  }
  return Array.from(new Set(macs)).sort();
}

let _fp: string | null = null;
export function getMachineFingerprint(): string {
  if (_fp) return _fp;
  const macs = getMacs();
  const base = `${hostname()}|${macs.join(",")}`;
  _fp = createHmac("sha256", "medpronto-fp-salt")
    .update(base)
    .digest("hex")
    .slice(0, 16);
  return _fp;
}

function sign(data: string): string {
  return createHmac("sha256", SIGNING_KEY).update(data).digest("hex").slice(0, 32);
}

export interface LicensePayload {
  v: number;
  c: string;
  i: string;
  e: string;
  f: string;
  /**
   * Obsoleto (U14). Tokens antigos podem trazer `ed`; o runtime ignora
   * e nunca rebaixa o produto. Novos tokens não incluem este campo.
   */
  ed?: string;
}

export function gerarToken({
  cliente,
  fingerprint,
  dias,
}: {
  cliente?: string;
  fingerprint: string;
  dias: number | string;
}): string {
  const fp = String(fingerprint).toLowerCase();
  if (!/^[0-9a-f]{16}$/i.test(fp)) {
    throw new Error("fingerprint invalido");
  }
  const d = Number(dias);
  if (!Number.isFinite(d) || d <= 0) throw new Error("dias deve ser > 0");
  const hoje = new Date();
  const expira = new Date(hoje.getTime() + d * 86400000);
  const payload: LicensePayload = {
    v: 1,
    c: String(cliente ?? "").trim().slice(0, 100),
    i: hoje.toISOString().slice(0, 10),
    e: expira.toISOString().slice(0, 10),
    f: fp,
  };
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${TOKEN_PREFIX}${data}.${sign(data)}`;
}

export function decodificarToken(token: string): {
  ok: boolean;
  payload?: LicensePayload;
  motivo?: string;
} {
  const s = String(token ?? "").trim();
  if (!s.startsWith(TOKEN_PREFIX))
    return { ok: false, motivo: "formato inválido (prefixo)" };
  const corpo = s.slice(TOKEN_PREFIX.length);
  const dot = corpo.lastIndexOf(".");
  if (dot < 1) return { ok: false, motivo: "formato inválido (separador)" };
  const data = corpo.slice(0, dot);
  const sig = corpo.slice(dot + 1);
  const expected = sign(data);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b))
    return { ok: false, motivo: "assinatura inválida" };
  try {
    const payload = JSON.parse(
      Buffer.from(data, "base64url").toString("utf8"),
    ) as LicensePayload;
    if (payload.v !== 1) return { ok: false, motivo: "versão desconhecida" };
    if (!payload.e || !payload.f) return { ok: false, motivo: "campos faltando" };
    return { ok: true, payload };
  } catch {
    return { ok: false, motivo: "payload corrompido" };
  }
}

export function validarParaEstaMaquina(token: string): {
  ok: boolean;
  payload?: LicensePayload;
  motivo?: string;
  esperado?: string;
  recebido?: string;
} {
  const r = decodificarToken(token);
  if (!r.ok) return r;
  const fp = getMachineFingerprint();
  if (r.payload!.f !== fp) {
    return {
      ok: false,
      motivo: "licenca nao pertence a esta maquina",
      esperado: fp,
      recebido: r.payload!.f,
      payload: r.payload,
    };
  }
  const hojeStr = new Date().toISOString().slice(0, 10);
  if (r.payload!.e < hojeStr) {
    return { ok: false, motivo: "licenca expirada", payload: r.payload };
  }
  return { ok: true, payload: r.payload };
}

type LicencaRow = {
  token: string;
  cliente: string | null;
  fingerprint: string | null;
  emitida_em: string | null;
  expira_em: string | null;
  ultimo_dia_validado: string | null;
};

export type LicenseStatus =
  | { status: "sem_licenca"; fingerprint: string }
  | {
      status: "ok";
      fingerprint: string;
      cliente: string;
      expira_em: string;
      dias_restantes: number;
      alerta: "critico" | "aviso" | null;
    }
  | {
      status: "expirada";
      fingerprint: string;
      cliente: string;
      expira_em: string;
      dias_atraso: number;
    }
  | {
      status: "maquina_errada";
      fingerprint: string;
      esperado: string;
      recebido: string;
      motivo: string;
    }
  | {
      status: "relogio_invalido";
      fingerprint: string;
      motivo: string;
      hoje?: string;
      ultimo_dia_validado?: string;
      emitida_em?: string;
    }
  | { status: "corrompida"; fingerprint: string; motivo: string };

export function getEstadoLicenca(): LicenseStatus {
  const fp = getMachineFingerprint();
  try {
    const row = getDb()
      .prepare("SELECT * FROM licenca WHERE id = 1")
      .get() as LicencaRow | undefined;

    if (!row) return { status: "sem_licenca", fingerprint: fp };

  const r = validarParaEstaMaquina(row.token);
  if (!r.ok) {
    if (r.motivo === "licenca expirada") {
      const dias = Math.ceil(
        (Date.now() - new Date(row.expira_em!).getTime()) / 86400000,
      );
      return {
        status: "expirada",
        fingerprint: fp,
        cliente: row.cliente ?? "",
        expira_em: row.expira_em!,
        dias_atraso: dias,
      };
    }
    if (r.motivo === "licenca nao pertence a esta maquina") {
      return {
        status: "maquina_errada",
        fingerprint: fp,
        esperado: r.esperado!,
        recebido: r.recebido!,
        motivo: r.motivo,
      };
    }
    return { status: "corrompida", fingerprint: fp, motivo: r.motivo ?? "desconhecido" };
  }

  const hojeStr = new Date().toISOString().slice(0, 10);
  if (row.emitida_em && hojeStr < row.emitida_em) {
    return {
      status: "relogio_invalido",
      fingerprint: fp,
      motivo: "Data do sistema anterior a data de emissao da licenca.",
      hoje: hojeStr,
      emitida_em: row.emitida_em,
    };
  }
  if (row.ultimo_dia_validado && hojeStr < row.ultimo_dia_validado) {
    return {
      status: "relogio_invalido",
      fingerprint: fp,
      motivo:
        "Relogio do sistema voltou para tras. Sincronize data/hora automaticas do Windows.",
      hoje: hojeStr,
      ultimo_dia_validado: row.ultimo_dia_validado,
    };
  }

  const toMs = (d: string | null | undefined) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d ?? ""));
    if (!m) return null;
    return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  };
  const hojeMs = toMs(hojeStr);
  const ultMs = toMs(row.ultimo_dia_validado);
  const podeAvancar =
    !row.ultimo_dia_validado ||
    (hojeMs != null && ultMs != null && hojeMs - ultMs <= 3 * 86400000);
  if (
    podeAvancar &&
    (!row.ultimo_dia_validado || hojeStr > row.ultimo_dia_validado)
  ) {
    try {
      getDb()
        .prepare("UPDATE licenca SET ultimo_dia_validado = ? WHERE id = 1")
        .run(hojeStr);
    } catch {
      /* ignora */
    }
  }

  const dias_restantes = Math.ceil(
    (new Date(row.expira_em!).getTime() - Date.now()) / 86400000,
  );
  return {
    status: "ok",
    fingerprint: fp,
    cliente: row.cliente ?? "",
    expira_em: row.expira_em!,
    dias_restantes,
    alerta:
      dias_restantes <= 1 ? "critico" : dias_restantes <= 7 ? "aviso" : null,
  };
  } catch {
    return { status: "sem_licenca", fingerprint: fp };
  }
}

export function instalarLicenca(token: string): LicensePayload {
  const r = validarParaEstaMaquina(token);
  if (!r.ok) throw new Error(`Licenca invalida: ${r.motivo}`);
  const p = r.payload!;
  const hojeStr = new Date().toISOString().slice(0, 10);
  getDb()
    .prepare(
      `INSERT INTO licenca (id, token, cliente, fingerprint, emitida_em, expira_em, ultimo_dia_validado)
       VALUES (1, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         token = excluded.token,
         cliente = excluded.cliente,
         fingerprint = excluded.fingerprint,
         emitida_em = excluded.emitida_em,
         expira_em = excluded.expira_em,
         ultimo_dia_validado = excluded.ultimo_dia_validado,
         instalada_em = datetime('now', 'localtime')`,
    )
    .run(token.trim(), p.c || null, p.f, p.i, p.e, hojeStr);
  syncEdicaoFromLicense(p.ed);
  return p;
}

export function removerLicenca(): void {
  getDb().prepare("DELETE FROM licenca WHERE id = 1").run();
}

interface GracePayload {
  v: 1;
  f: string;
  d: number;
  n: string;
}

export function gerarContraSenhaLicenca(
  fingerprint: string,
  dias: number | string,
): string {
  const fp = String(fingerprint).toLowerCase();
  if (!/^[0-9a-f]{16}$/i.test(fp)) {
    throw new Error("fingerprint invalido");
  }
  const d = Number(dias);
  if (!Number.isFinite(d) || d <= 0 || d > 90) {
    throw new Error("dias deve ser entre 1 e 90");
  }
  const payload: GracePayload = {
    v: 1,
    f: fp,
    d: Math.floor(d),
    n: randomBytes(4).toString("hex"),
  };
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${GRACE_PREFIX}${data}.${sign(data)}`;
}

function decodificarContraSenha(codigo: string): {
  ok: boolean;
  payload?: GracePayload;
  motivo?: string;
} {
  const s = String(codigo ?? "").trim();
  if (!s.startsWith(GRACE_PREFIX)) {
    return { ok: false, motivo: "formato invalido" };
  }
  const corpo = s.slice(GRACE_PREFIX.length);
  const dot = corpo.lastIndexOf(".");
  if (dot < 1) return { ok: false, motivo: "formato invalido" };
  const data = corpo.slice(0, dot);
  const sig = corpo.slice(dot + 1);
  const expected = sign(data);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, motivo: "assinatura invalida" };
  }
  try {
    const payload = JSON.parse(
      Buffer.from(data, "base64url").toString("utf8"),
    ) as GracePayload;
    if (payload.v !== 1 || !payload.f || !payload.d) {
      return { ok: false, motivo: "payload invalido" };
    }
    return { ok: true, payload };
  } catch {
    return { ok: false, motivo: "payload corrompido" };
  }
}

function hashContraSenha(codigo: string): string {
  return createHmac("sha256", SIGNING_KEY).update(codigo.trim()).digest("hex");
}

export function aplicarContraSenhaLicenca(codigo: string): {
  expira_em: string;
  dias: number;
} {
  const r = decodificarContraSenha(codigo);
  if (!r.ok || !r.payload) {
    throw new Error(`Contra-senha invalida: ${r.motivo ?? "desconhecido"}`);
  }

  const fp = getMachineFingerprint();
  if (r.payload.f !== fp) {
    throw new Error("Contra-senha nao pertence a esta maquina");
  }

  const hash = hashContraSenha(codigo);
  const usada = getDb()
    .prepare("SELECT 1 FROM licenca_contra_senhas_usadas WHERE codigo_hash = ?")
    .get(hash);
  if (usada) {
    throw new Error("Contra-senha ja utilizada");
  }

  const row = getDb()
    .prepare("SELECT expira_em FROM licenca WHERE id = 1")
    .get() as { expira_em: string | null } | undefined;

  const hoje = new Date();
  const hojeStr = hoje.toISOString().slice(0, 10);
  const baseMs = row?.expira_em
    ? Math.max(Date.parse(`${row.expira_em}T00:00:00Z`), Date.parse(`${hojeStr}T00:00:00Z`))
    : Date.parse(`${hojeStr}T00:00:00Z`);
  const novaExpira = new Date(baseMs + r.payload.d * 86400000)
    .toISOString()
    .slice(0, 10);

  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO licenca_contra_senhas_usadas (codigo_hash, dias)
       VALUES (?, ?)`,
    ).run(hash, r.payload!.d);

    if (row) {
      db.prepare(
        `UPDATE licenca
         SET expira_em = ?, ultima_contra_senha = datetime('now', 'localtime')
         WHERE id = 1`,
      ).run(novaExpira);
    } else {
      throw new Error("Instale uma licenca antes de usar contra-senha");
    }
  });
  tx();

  return { expira_em: novaExpira, dias: r.payload.d };
}

const DEFAULT_ALLOWLIST = [
  "/api/health",
  "/api/startup/status",
  "/api/startup/ready",
  "/api/backup/reiniciando",
  "/api/shutdown",
  "/api/auth/setup/needed",
  "/api/auth/setup",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/recuperar-senha/status",
  "/api/auth/recuperar-senha/solicitar",
  "/api/auth/recuperar-senha/confirmar",
  "/api/clinica/status",
  "/api/clinica/branding",
  "/api/licenca",
  "/api/licenca/fingerprint",
];

export function requireValidLicense(allowlist: string[] = DEFAULT_ALLOWLIST) {
  const passa = (path: string) =>
    allowlist.some((p) => path === p || path.startsWith(`${p}/`));

  return (req: Request, res: Response, next: NextFunction) => {
    if (!config.enforceLicense) return next();
    const apiPath = req.baseUrl + req.path;
    if (passa(apiPath) || passa(req.path)) return next();

    const est = getEstadoLicenca();
    if (est.status === "ok") {
      res.locals.licenca = est;
      return next();
    }

    res.status(403).json({
      error: "Licença inválida ou ausente",
      enforced: true,
      licenca: est,
    });
  };
}
