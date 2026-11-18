import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireModulo } from "../auth/middleware.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { getDb } from "../db/index.js";
import { logAcesso } from "../services/logAcesso.js";
import { normalizarAvatar } from "../utils/avatarUsuario.js";
import { parseDataImageUrl } from "../utils/imageDataUrl.js";

export const chatRouter = Router();

chatRouter.use(requireAuth(), requireModulo("chat_interno"));

/** Usuário é considerado online se o sistema dele fez polling nos últimos 30s. */
const ONLINE_JANELA = "-30 seconds";

function marcarPresenca(uid: number): void {
  getDb()
    .prepare(
      `INSERT INTO chat_presenca (usuario_id, ultima_atividade)
       VALUES (?, datetime('now','localtime'))
       ON CONFLICT (usuario_id) DO UPDATE SET ultima_atividade = excluded.ultima_atividade`,
    )
    .run(uid);
}

function participaDaConversa(cid: number, uid: number): boolean {
  return !!getDb()
    .prepare(
      "SELECT 1 FROM chat_conversas WHERE id = ? AND (usuario1_id = ? OR usuario2_id = ?)",
    )
    .get(cid, uid, uid);
}

/**
 * Lista única de contatos: cada usuário aparece uma vez, com status online,
 * última mensagem e quantidade de mensagens recebidas não lidas.
 */
chatRouter.get(
  "/contatos",
  asyncHandler(async (req, res) => {
    const me = req.usuario!.id;
    marcarPresenca(me);

    const rows = getDb()
      .prepare(
        `
        SELECT
          u.id,
          u.nome,
          u.login,
          u.perfil,
          CASE WHEN u.foto IS NOT NULL THEN COALESCE(u.foto_atualizada_em, '1') END AS foto_versao,
          CASE WHEN p.ultima_atividade >= datetime('now','localtime', @janela) THEN 1 ELSE 0 END AS online,
          c.id AS conversa_id,
          (SELECT m.texto FROM chat_mensagens m WHERE m.conversa_id = c.id ORDER BY m.id DESC LIMIT 1) AS ultima_mensagem,
          (SELECT m.remetente_id FROM chat_mensagens m WHERE m.conversa_id = c.id ORDER BY m.id DESC LIMIT 1) AS ultima_remetente_id,
          (SELECT m.criado_em FROM chat_mensagens m WHERE m.conversa_id = c.id ORDER BY m.id DESC LIMIT 1) AS ultima_em,
          (
            SELECT COUNT(*) FROM chat_mensagens m
            LEFT JOIN chat_mensagens_lidas l ON l.mensagem_id = m.id AND l.usuario_id = @me
            WHERE m.conversa_id = c.id AND m.remetente_id <> @me AND l.mensagem_id IS NULL
          ) AS nao_lidas
        FROM usuarios u
        LEFT JOIN chat_conversas c
          ON c.usuario1_id = min(@me, u.id) AND c.usuario2_id = max(@me, u.id)
        LEFT JOIN chat_presenca p ON p.usuario_id = u.id
        WHERE u.id <> @me
          AND u.ativo = 1
          AND (
            u.perfil IN ('medico', 'secretaria', 'admin')
            OR EXISTS (
              SELECT 1 FROM usuario_permissoes up
              WHERE up.usuario_id = u.id AND up.modulo = 'chat_interno' AND up.permitido = 1
            )
          )
        ORDER BY nao_lidas DESC, ultima_em DESC NULLS LAST, u.nome
      `,
      )
      .all({ me, janela: ONLINE_JANELA });

    res.json(rows);
  }),
);

/** Abre (ou cria) a conversa 1:1 com outro usuário */
chatRouter.post(
  "/conversas",
  asyncHandler(async (req, res) => {
    const schema = z.object({ outroUsuarioId: z.number().int().positive() });
    const { outroUsuarioId } = schema.parse(req.body);
    const uid = req.usuario!.id;

    if (outroUsuarioId === uid) {
      res.status(400).json({ error: "Não é possível conversar consigo mesmo" });
      return;
    }

    const outroExiste = getDb()
      .prepare("SELECT 1 FROM usuarios WHERE id = ? AND ativo = 1")
      .get(outroUsuarioId);
    if (!outroExiste) {
      res.status(400).json({ error: "Usuário de destino inválido" });
      return;
    }

    const [id1, id2] = uid < outroUsuarioId ? [uid, outroUsuarioId] : [outroUsuarioId, uid];

    const insert = getDb()
      .prepare("INSERT OR IGNORE INTO chat_conversas (usuario1_id, usuario2_id) VALUES (?, ?)")
      .run(id1, id2);
    const { id: cid } = getDb()
      .prepare("SELECT id FROM chat_conversas WHERE usuario1_id = ? AND usuario2_id = ?")
      .get(id1, id2) as { id: number };

    if (insert.changes > 0) {
      logAcesso({
        usuarioId: uid,
        acao: "chat_conversa_criada",
        detalhe: `conversa=${cid} com=${outroUsuarioId}`,
      });
    }

    res.json({ conversa_id: cid });
  }),
);

/** Lista mensagens da conversa e marca como lidas as recebidas */
chatRouter.get(
  "/conversas/:id/mensagens",
  asyncHandler(async (req, res) => {
    const cid = Number(req.params.id);
    const uid = req.usuario!.id;

    if (!participaDaConversa(cid, uid)) {
      res.status(403).json({ error: "Você não participa desta conversa" });
      return;
    }

    getDb()
      .prepare(
        `INSERT OR IGNORE INTO chat_mensagens_lidas (mensagem_id, usuario_id)
         SELECT id, ? FROM chat_mensagens WHERE conversa_id = ? AND remetente_id <> ?`,
      )
      .run(uid, cid, uid);

    const mensagens = getDb()
      .prepare(
        `
        SELECT * FROM (
          SELECT m.id, m.remetente_id, u.nome AS remetente_nome, m.texto, m.criado_em
          FROM chat_mensagens m
          JOIN usuarios u ON u.id = m.remetente_id
          WHERE m.conversa_id = ?
          ORDER BY m.id DESC
          LIMIT 200
        ) ORDER BY id ASC
      `,
      )
      .all(cid);

    res.json(mensagens);
  }),
);

/** Envia mensagem */
chatRouter.post(
  "/conversas/:id/mensagens",
  asyncHandler(async (req, res) => {
    const cid = Number(req.params.id);
    const uid = req.usuario!.id;
    const { texto } = z.object({ texto: z.string().trim().min(1).max(4000) }).parse(req.body);

    if (!participaDaConversa(cid, uid)) {
      res.status(403).json({ error: "Você não participa desta conversa" });
      return;
    }

    const info = getDb()
      .prepare("INSERT INTO chat_mensagens (conversa_id, remetente_id, texto) VALUES (?, ?, ?)")
      .run(cid, uid, texto);

    getDb()
      .prepare("UPDATE chat_conversas SET atualizado_em = datetime('now','localtime') WHERE id = ?")
      .run(cid);

    res.status(201).json({ id: Number(info.lastInsertRowid) });
  }),
);

// ------------------------------------------------------------------ foto (avatar)

/** Dados do próprio usuário para o cabeçalho do chat (versão da foto). */
chatRouter.get(
  "/eu",
  asyncHandler(async (req, res) => {
    const uid = req.usuario!.id;
    const row = getDb()
      .prepare(
        `SELECT id, nome, CASE WHEN foto IS NOT NULL THEN COALESCE(foto_atualizada_em, '1') END AS foto_versao
         FROM usuarios WHERE id = ?`,
      )
      .get(uid) as { id: number; nome: string; foto_versao: string | null } | undefined;
    res.json(row ?? { id: uid, nome: "", foto_versao: null });
  }),
);

/**
 * Imagem do avatar de um usuário. A URL leva ?v=<foto_versao>, então pode ficar
 * em cache no navegador — quando a foto muda, a versão (e a URL) muda junto.
 */
chatRouter.get(
  "/foto/:id",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const row = getDb().prepare("SELECT foto FROM usuarios WHERE id = ?").get(id) as
      | { foto: string | null }
      | undefined;
    const parsed = row?.foto ? parseDataImageUrl(row.foto) : null;
    if (!parsed) {
      res.status(404).end();
      return;
    }
    res.setHeader("Content-Type", parsed.mime);
    res.setHeader("Cache-Control", "private, max-age=604800");
    res.end(parsed.buffer);
  }),
);

/** Cada usuário troca a própria foto. */
chatRouter.put(
  "/minha-foto",
  asyncHandler(async (req, res) => {
    const uid = req.usuario!.id;
    const { foto } = z.object({ foto: z.string().min(30).max(12_000_000) }).parse(req.body);
    let normalizada: string;
    try {
      normalizada = await normalizarAvatar(foto);
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : "Imagem inválida" });
      return;
    }
    getDb()
      .prepare(
        "UPDATE usuarios SET foto = ?, foto_atualizada_em = strftime('%Y%m%d%H%M%f','now','localtime') WHERE id = ?",
      )
      .run(normalizada, uid);
    logAcesso({ usuarioId: uid, acao: "usuario_foto_alterada", detalhe: `usuario=${uid}` });
    const { foto_atualizada_em } = getDb()
      .prepare("SELECT foto_atualizada_em FROM usuarios WHERE id = ?")
      .get(uid) as { foto_atualizada_em: string };
    res.json({ foto_versao: foto_atualizada_em });
  }),
);

/** Remove a própria foto (volta às iniciais). */
chatRouter.delete(
  "/minha-foto",
  asyncHandler(async (req, res) => {
    const uid = req.usuario!.id;
    getDb().prepare("UPDATE usuarios SET foto = NULL, foto_atualizada_em = NULL WHERE id = ?").run(uid);
    logAcesso({ usuarioId: uid, acao: "usuario_foto_removida", detalhe: `usuario=${uid}` });
    res.json({ foto_versao: null });
  }),
);

/** Total de mensagens recebidas não lidas (também mantém o usuário online) */
chatRouter.get(
  "/unread-total",
  asyncHandler(async (req, res) => {
    const uid = req.usuario!.id;
    marcarPresenca(uid);

    const row = getDb()
      .prepare(
        `
        SELECT COUNT(*) AS total
        FROM chat_mensagens m
        JOIN chat_conversas c ON c.id = m.conversa_id
        LEFT JOIN chat_mensagens_lidas l ON l.mensagem_id = m.id AND l.usuario_id = ?
        WHERE l.mensagem_id IS NULL
          AND m.remetente_id <> ?
          AND (c.usuario1_id = ? OR c.usuario2_id = ?)
      `,
      )
      .get(uid, uid, uid, uid) as { total: number };

    res.json({ total: row.total });
  }),
);
