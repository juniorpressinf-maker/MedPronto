import type { NextFunction, Request, Response } from "express";
import { logAcesso } from "../services/logAcesso.js";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_MS,
  parseCookies,
  signSession,
  verifySession,
} from "./crypto.js";
import { getServerBootId } from "./sessionBoot.js";
import {
  getPermissoesUsuario,
  usuarioTemModulo,
  type Modulo,
} from "./modulos.js";
import { getSessionSecret, usuarioEstaAtivo, type Perfil } from "./users.js";

declare global {
  namespace Express {
    interface Request {
      usuario?: {
        id: number;
        username: string;
        nome: string;
        perfil: string;
        logado: boolean;
        permissoes?: string[];
      };
    }
  }
}

function sessaoAnonima(): NonNullable<Request["usuario"]> {
  return { id: 0, username: "", nome: "", perfil: "", logado: false };
}

function garantirUsuarioAtivo(req: Request, res: Response): boolean {
  if (!req.usuario?.logado) return false;
  if (!usuarioEstaAtivo(req.usuario.id)) {
    deslogarUsuario(res);
    req.usuario = sessaoAnonima();
    return false;
  }
  return true;
}

function aplicarSessaoSeAtivo(
  req: Request,
  res: Response,
  payload: Record<string, unknown>,
): void {
  const uid = Number(payload.uid);
  if (!usuarioEstaAtivo(uid)) {
    deslogarUsuario(res);
    req.usuario = sessaoAnonima();
    return;
  }
  req.usuario = {
    id: uid,
    username: String(payload.uname ?? ""),
    nome: String(payload.nome ?? ""),
    perfil: String(payload.perfil ?? ""),
    logado: true,
  };
}

export function sessionMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const cookies = parseCookies(req.headers.cookie);
      const token = cookies[SESSION_COOKIE];
      const secret = getSessionSecret();
      const payload = verifySession(token, secret, getServerBootId());
      if (!payload) {
        req.usuario = sessaoAnonima();
      } else {
        aplicarSessaoSeAtivo(req, res, payload);
      }
    } catch {
      req.usuario = sessaoAnonima();
    }
    next();
  };
}

export function attachPermissoes() {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (req.usuario?.logado) {
      req.usuario.permissoes = getPermissoesUsuario(
        req.usuario.id,
        req.usuario.perfil as Perfil,
      );
    }
    next();
  };
}

export function requireAuth() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!garantirUsuarioAtivo(req, res)) {
      res.status(401).json({ error: "Não autenticado" });
      return;
    }
    next();
  };
}

export function requireModulo(...modulos: Modulo[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!garantirUsuarioAtivo(req, res)) {
      res.status(401).json({ error: "Não autenticado" });
      return;
    }
    const perfil = req.usuario!.perfil as Perfil;
    const ok = modulos.some((m) => usuarioTemModulo(req.usuario!.id, perfil, m));
    if (!ok) {
      logAcesso({
        usuarioId: req.usuario!.id,
        acao: "acesso_negado",
        detalhe: modulos.join(","),
      });
      res.status(403).json({ error: "Sem permissão para este módulo" });
      return;
    }
    next();
  };
}

export function requireAdmin() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!garantirUsuarioAtivo(req, res)) {
      res.status(401).json({ error: "Não autenticado" });
      return;
    }
    if (req.usuario!.perfil !== "admin") {
      res.status(403).json({ error: "Acesso restrito ao administrador" });
      return;
    }
    next();
  };
}

export function logarUsuario(
  res: Response,
  user: { id: number; username: string; nome: string; perfil: string },
) {
  const secret = getSessionSecret();
  const exp = Date.now() + SESSION_MAX_AGE_MS;
  const token = signSession(
    {
      uid: user.id,
      uname: user.username,
      nome: user.nome,
      perfil: user.perfil,
      exp,
      boot: getServerBootId(),
    },
    secret,
  );
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    // Sem maxAge: cookie de sessão (não persiste entre reinícios do navegador).
  });
}

export function deslogarUsuario(res: Response) {
  res.clearCookie(SESSION_COOKIE, { path: "/", sameSite: "lax" });
}
