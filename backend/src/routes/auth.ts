import { Router } from "express";
import { z } from "zod";
import {
  deslogarUsuario,
  logarUsuario,
  requireAuth,
} from "../auth/middleware.js";
import { logAcesso } from "../services/logAcesso.js";
import { getPermissoesUsuario } from "../auth/modulos.js";
import { loginSchema } from "../auth/loginSchema.js";
import {
  authenticateUser,
  countUsers,
  createUser,
  updateUserPassword,
} from "../auth/users.js";
import {
  aplicarEmailRecuperacaoSeNecessario,
  confirmarCodigoRecuperacao,
  solicitarCodigoRecuperacao,
} from "../auth/recuperacaoSenha.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { getRecuperacaoContext } from "./clinica.js";

export const authRouter = Router();

authRouter.get(
  "/setup/needed",
  asyncHandler(async (_req, res) => {
    res.json({ needed: countUsers() === 0 });
  }),
);

authRouter.post(
  "/setup",
  asyncHandler(async (req, res) => {
    if (countUsers() > 0) {
      res.status(409).json({
        error: "Já existe um usuário cadastrado. Use login.",
      });
      return;
    }
    const body = z
      .object({ username: loginSchema, senha: z.string().min(6) })
      .parse(req.body);
    const user = createUser(body.username, body.senha, "admin", "Administrador");
    logarUsuario(res, {
      id: user.id,
      username: user.login,
      nome: user.nome,
      perfil: user.perfil,
    });
    res.status(201).json({
      ok: true,
      username: user.login,
      perfil: user.perfil,
    });
  }),
);

authRouter.get(
  "/recuperar-senha/status",
  asyncHandler(async (_req, res) => {
    const ctx = getRecuperacaoContext();
    let mensagem: string | null = null;
    if (!ctx.email_cadastrado) {
      mensagem = "E-mail da clínica ainda não cadastrado.";
    } else if (!ctx.senha_email_configurada) {
      mensagem =
        "Senha do e-mail não cadastrada. Conclua o cadastro da clínica.";
    } else if (!ctx.pode_recuperar) {
      mensagem =
        "Sistema ainda não configurado. Conclua o primeiro acesso antes de recuperar a senha.";
    } else {
      mensagem =
        "Informe o e-mail e a senha do e-mail cadastrados para obter uma senha de desbloqueio.";
    }
    res.json({ ...ctx, mensagem });
  }),
);

authRouter.post(
  "/recuperar-senha/solicitar",
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        email: z.string().min(5).max(120).email("Informe um e-mail válido."),
        username: z.string().min(3).max(30),
        email_senha: z.string().min(1, "Informe a senha do e-mail."),
      })
      .parse(req.body);

    const ctx = getRecuperacaoContext();
    if (!ctx.email_cadastrado) {
      res.status(400).json({ error: "E-mail da clínica não cadastrado." });
      return;
    }
    if (!ctx.senha_email_configurada) {
      res.status(400).json({ error: "Senha do e-mail não cadastrada." });
      return;
    }

    try {
      const result = solicitarCodigoRecuperacao(
        body.username,
        body.email,
        body.email_senha,
      );
      res.json({
        ok: true,
        mensagem: "Use a senha de desbloqueio abaixo para definir uma nova senha.",
        codigo_desbloqueio: result.codigo_desbloqueio,
        expira_minutos: result.expira_minutos,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao solicitar código.";
      res.status(400).json({ error: msg });
    }
  }),
);

authRouter.post(
  "/recuperar-senha/confirmar",
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        email: z.string().min(5).max(120).email("Informe um e-mail válido."),
        username: z.string().min(3).max(30),
        codigo: z.string().min(8).max(12),
        senha: z.string().min(6, "Senha deve ter no mínimo 6 caracteres."),
      })
      .parse(req.body);

    const ctx = getRecuperacaoContext();
    if (!ctx.pode_recuperar) {
      res.status(400).json({ error: "Sistema ainda não configurado." });
      return;
    }

    const codigoOk = confirmarCodigoRecuperacao(
      body.username,
      body.email,
      body.codigo,
    );
    if (!codigoOk) {
      res.status(401).json({
        error: "Código inválido ou expirado. Solicite um novo código.",
      });
      return;
    }

    const ok = updateUserPassword(body.username, body.senha);
    if (!ok) {
      res.status(401).json({ error: "Usuário não encontrado." });
      return;
    }

    aplicarEmailRecuperacaoSeNecessario(body.email);

    res.json({
      ok: true,
      mensagem: "Senha alterada. Faça login com a nova senha.",
    });
  }),
);

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const body = z
      .object({ username: z.string(), senha: z.string() })
      .parse(req.body);
    const user = authenticateUser(body.username, body.senha);
    if (!user) {
      if (countUsers() === 0) {
        res.status(401).json({
          error:
            "Nenhum usuário cadastrado. Conclua a configuração inicial.",
          setup_needed: true,
        });
        return;
      }
      logAcesso({
        acao: "login_falhou",
        detalhe: `usuario="${body.username.trim()}"`,
      });
      res.status(401).json({ error: "Usuário ou senha incorretos" });
      return;
    }
    logarUsuario(res, user);
    logAcesso({
      usuarioId: user.id,
      acao: "login_ok",
      detalhe: `usuario="${user.username}" perfil=${user.perfil}`,
    });
    res.json({ ok: true, username: user.username, perfil: user.perfil });
  }),
);

authRouter.post("/logout", (_req, res) => {
  deslogarUsuario(res);
  res.json({ ok: true });
});

authRouter.get(
  "/me",
  requireAuth(),
  asyncHandler(async (req, res) => {
    const u = req.usuario!;
    const permissoes = getPermissoesUsuario(
      u.id,
      u.perfil as import("../auth/users.js").Perfil,
    );
    res.json({
      id: u.id,
      username: u.username,
      perfil: u.perfil,
      permissoes,
    });
  }),
);
