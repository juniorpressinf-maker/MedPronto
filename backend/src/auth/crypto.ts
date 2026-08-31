import {
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

const SCRYPT_N = 16384;
const SCRYPT_KEYLEN = 64;

export function hashPassword(plain: string): { hash: string; salt: string } {
  const salt = randomBytes(16);
  const hash = scryptSync(String(plain), salt, SCRYPT_KEYLEN, { N: SCRYPT_N });
  return { hash: hash.toString("hex"), salt: salt.toString("hex") };
}

export function verifyPassword(
  plain: string,
  saltHex: string,
  hashHex: string,
): boolean {
  try {
    const salt = Buffer.from(saltHex, "hex");
    const derived = scryptSync(String(plain), salt, SCRYPT_KEYLEN, {
      N: SCRYPT_N,
    });
    const a = Buffer.from(derived.toString("hex"));
    const b = Buffer.from(hashHex);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function randomSecret() {
  return randomBytes(32).toString("hex");
}

export const SESSION_COOKIE = "medpronto_sid";
/** Validade máxima do token se o cookie ainda existir (ex.: aba aberta o dia todo). */
export const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 12;

export function signSession(
  payload: Record<string, unknown>,
  secret: string,
): string {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret).update(data).digest("base64url");
  return `${data}.${sig}`;
}

export function verifySession(
  token: string | undefined,
  secret: string | null,
  bootId?: string | null,
): Record<string, unknown> | null {
  if (!token || !secret) return null;
  const idx = token.lastIndexOf(".");
  if (idx <= 0) return null;
  const data = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  const expected = createHmac("sha256", secret).update(data).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(data, "base64url").toString("utf8"),
    ) as Record<string, unknown>;
    if (typeof payload.exp === "number" && Date.now() > payload.exp) return null;
    if (bootId && payload.boot !== bootId) return null;
    return payload;
  } catch {
    return null;
  }
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of String(header).split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}
