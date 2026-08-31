import { hashPassword, verifyPassword } from "./crypto.js";
import { getDb } from "../db/index.js";
import { emailsMatch, normEmail } from "../utils/email.js";
import {
  getClinicaRecoveryEmail,
  setClinicaRecoveryEmail,
  verificarSenhaEmailClinica,
} from "../routes/clinica.js";
import { findUserByLogin } from "./users.js";
import {
  gerarPoolSenhasDesbloqueio,
  reservarSenhaDesbloqueio,
} from "./senhasDesbloqueio.js";

const CODIGO_MINUTOS = 30;
const COOLDOWN_SEGUNDOS = 60;

function sqlLocalAgoraMaisMinutos(minutos: number): string {
  const d = new Date(Date.now() + minutos * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function parseSqlLocal(s: string): number {
  const [date, time] = s.split(" ");
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm, ss] = time.split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm, ss ?? 0).getTime();
}

function invalidarCodigosPendentes(username: string, email: string) {
  getDb()
    .prepare(
      `UPDATE recuperacao_senha_codigos SET usado = 1
       WHERE username = ? COLLATE NOCASE AND email = ? AND usado = 0`,
    )
    .run(username.trim().toLowerCase(), normEmail(email));
}

export function solicitarCodigoRecuperacao(
  username: string,
  email: string,
  emailSenha: string,
): { codigo_desbloqueio: string; expira_minutos: number } {
  const user = findUserByLogin(username);
  if (!user) {
    throw new Error("Usuario nao encontrado.");
  }

  const emailNorm = normEmail(email);
  const cadastrado = getClinicaRecoveryEmail();
  if (cadastrado && !emailsMatch(emailNorm, cadastrado)) {
    throw new Error("E-mail nao confere com o cadastro da clinica.");
  }

  if (!verificarSenhaEmailClinica(emailSenha)) {
    throw new Error("Senha do e-mail incorreta.");
  }

  gerarPoolSenhasDesbloqueio();

  const ultimo = getDb()
    .prepare(
      `SELECT created_at FROM recuperacao_senha_codigos
       WHERE username = ? COLLATE NOCASE
       ORDER BY id DESC LIMIT 1`,
    )
    .get(username.trim().toLowerCase()) as { created_at: string } | undefined;

  if (ultimo?.created_at) {
    const diff = (Date.now() - parseSqlLocal(ultimo.created_at)) / 1000;
    if (diff < COOLDOWN_SEGUNDOS) {
      const espera = Math.ceil(COOLDOWN_SEGUNDOS - diff);
      throw new Error(
        `Aguarde ${espera} segundos antes de solicitar outra senha de desbloqueio.`,
      );
    }
  }

  const codigo = reservarSenhaDesbloqueio();
  if (!codigo) {
    throw new Error(
      "Nao ha mais senhas de desbloqueio disponiveis. Entre em contato com o suporte.",
    );
  }

  const codigoNorm = codigo.replace(/-/g, "");
  const { hash, salt } = hashPassword(codigoNorm);
  const expiraSql = sqlLocalAgoraMaisMinutos(CODIGO_MINUTOS);

  invalidarCodigosPendentes(username, emailNorm);

  getDb()
    .prepare(
      `INSERT INTO recuperacao_senha_codigos
       (username, email, codigo_hash, codigo_salt, expira_em)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(username.trim().toLowerCase(), emailNorm, hash, salt, expiraSql);

  return {
    codigo_desbloqueio: codigo,
    expira_minutos: CODIGO_MINUTOS,
  };
}

export function confirmarCodigoRecuperacao(
  username: string,
  email: string,
  codigo: string,
): boolean {
  const emailNorm = normEmail(email);
  const codigoNorm = codigo.replace(/-/g, "").trim();

  const row = getDb()
    .prepare(
      `SELECT id, codigo_hash, codigo_salt, expira_em, usado
       FROM recuperacao_senha_codigos
       WHERE username = ? COLLATE NOCASE AND email = ? AND usado = 0
       ORDER BY id DESC LIMIT 1`,
    )
    .get(username.trim().toLowerCase(), emailNorm) as
    | {
        id: number;
        codigo_hash: string;
        codigo_salt: string;
        expira_em: string;
        usado: number;
      }
    | undefined;

  if (!row || row.usado) return false;

  const expira = parseSqlLocal(row.expira_em);
  if (Date.now() > expira) return false;

  const ok = verifyPassword(codigoNorm, row.codigo_salt, row.codigo_hash);
  if (!ok) return false;

  getDb()
    .prepare("UPDATE recuperacao_senha_codigos SET usado = 1 WHERE id = ?")
    .run(row.id);

  return true;
}

export function aplicarEmailRecuperacaoSeNecessario(email: string): void {
  if (!getClinicaRecoveryEmail()) {
    setClinicaRecoveryEmail(email);
  }
}
