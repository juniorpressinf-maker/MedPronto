import { Router } from "express";
import QRCode from "qrcode";
import { z } from "zod";
import { requireAuth, requireModulo } from "../auth/middleware.js";
import { getDb } from "../db/index.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { logAcesso } from "../services/logAcesso.js";
import {
  TEMPLATE_PADRAO,
  enviarConfirmacaoAgendamento,
  getConfigWhatsApp,
  listarAgendamentosParaDisparoNoDia,
  processarEnviosAutomaticosDoDia,
  processarPreparosPendentesAgendamento,
} from "../services/whatsappService.js";
import {
  atualizarOrientacoesPaciente,
  listarProcedimentos,
} from "../services/cobrancaCadastros.js";
import { hojeIsoLocal } from "../lib/diasUteis.js";
import {
  forceNewQr,
  getStatus,
  logoutWhatsApp,
} from "../whatsapp/cliente.js";
export const whatsappRouter = Router();

whatsappRouter.use(requireAuth(), requireModulo("whatsapp"));

whatsappRouter.get(
  "/status",
  asyncHandler(async (_req, res) => {
    const wa = getStatus();
    let qrSvg: string | null = null;
    if (wa.qr) {
      qrSvg = await QRCode.toString(wa.qr, { type: "svg", margin: 1, width: 280 });
    }
    res.json({
      status: wa.status,
      me: wa.me,
      qrSvg,
    });
  }),
);

whatsappRouter.post(
  "/logout",
  asyncHandler(async (req, res) => {
    await logoutWhatsApp();
    logAcesso({ usuarioId: req.usuario!.id, acao: "whatsapp_logout" });
    res.json({ ok: true });
  }),
);

whatsappRouter.post(
  "/novo-qr",
  asyncHandler(async (req, res) => {
    await forceNewQr();
    logAcesso({ usuarioId: req.usuario!.id, acao: "whatsapp_novo_qr" });
    res.json({ ok: true });
  }),
);

whatsappRouter.get(
  "/config",
  asyncHandler(async (_req, res) => {
    const cfg = getConfigWhatsApp();
    const horaRow = getDb()
      .prepare(`SELECT valor FROM app_meta WHERE chave = 'whatsapp_hora_envio'`)
      .get() as { valor: string } | undefined;
    res.json({
      ...cfg,
      hora_envio_automatico: horaRow?.valor ? Number(horaRow.valor) : 17,
    });
  }),
);

const configSchema = z.object({
  ativo: z.boolean().optional(),
  template_confirmacao: z.string().max(2000).optional(),
  hora_envio_automatico: z.number().int().min(0).max(23).optional(),
  hora_fixa_ativa: z.boolean().optional(),
  hora_fixa_mensagem: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "Use HH:MM")
    .optional()
    .nullable(),
});

function validarConfigHoraFixa(body: z.infer<typeof configSchema>): string | null {
  const ativa =
    body.hora_fixa_ativa !== undefined ? body.hora_fixa_ativa : undefined;
  if (ativa && !body.hora_fixa_mensagem?.trim()) {
    return "Informe o horário fixo (HH:MM) para a mensagem.";
  }
  return null;
}

whatsappRouter.put(
  "/config",
  asyncHandler(async (req, res) => {
    const body = configSchema.parse(req.body);
    const erroHora = validarConfigHoraFixa(body);
    if (erroHora) {
      res.status(400).json({ error: erroHora });
      return;
    }
    const atual = getConfigWhatsApp();
    const horaFixaAtiva =
      body.hora_fixa_ativa !== undefined
        ? body.hora_fixa_ativa
          ? 1
          : 0
        : atual.hora_fixa_ativa;
    const horaFixaMsg =
      body.hora_fixa_mensagem !== undefined
        ? body.hora_fixa_mensagem
        : atual.hora_fixa_mensagem;
    getDb()
      .prepare(
        `UPDATE config_whatsapp SET
           provedor = 'baileys',
           ativo = ?,
           template_confirmacao = ?,
           hora_fixa_ativa = ?,
           hora_fixa_mensagem = ?
         WHERE id = 1`,
      )
      .run(
        body.ativo !== undefined ? (body.ativo ? 1 : 0) : atual.ativo,
        body.template_confirmacao ??
          atual.template_confirmacao ??
          TEMPLATE_PADRAO,
        horaFixaAtiva,
        horaFixaMsg,
      );
    if (body.hora_envio_automatico !== undefined) {
      getDb()
        .prepare(
          `INSERT INTO app_meta (chave, valor) VALUES ('whatsapp_hora_envio', ?)
           ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`,
        )
        .run(String(body.hora_envio_automatico));
    }
    logAcesso({
      usuarioId: req.usuario!.id,
      acao: "whatsapp_config",
    });
    res.json({ ok: true });
  }),
);

whatsappRouter.get(
  "/preparos",
  asyncHandler(async (_req, res) => {
    res.json(listarProcedimentos(undefined, false));
  }),
);

const preparoBody = z.object({
  orientacoes_paciente: z.string().max(1000).nullable(),
});

whatsappRouter.put(
  "/preparos/:id",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const body = preparoBody.parse(req.body);
    try {
      res.json(atualizarOrientacoesPaciente(id, body.orientacoes_paciente));
    } catch (e) {
      res.status(400).json({
        error: e instanceof Error ? e.message : "Erro ao salvar orientações",
      });
    }
  }),
);

whatsappRouter.get(
  "/logs",
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const rows = getDb()
      .prepare(
        `SELECT l.*, p.nome AS paciente_nome
         FROM log_whatsapp l
         LEFT JOIN pacientes p ON p.id = l.paciente_id
         ORDER BY l.id DESC
         LIMIT ?`,
      )
      .all(limit);
    res.json(rows);
  }),
);

whatsappRouter.get(
  "/disparo/preview",
  asyncHandler(async (_req, res) => {
    const hoje = hojeIsoLocal();
    const agendamentos = listarAgendamentosParaDisparoNoDia(hoje).map((a) => ({
      ...a,
      dia_disparo: hoje,
      data_consulta: a.data,
    }));
    res.json({ dia_disparo: hoje, agendamentos });
  }),
);

whatsappRouter.get(
  "/amanha/preview",
  asyncHandler(async (_req, res) => {
    const hoje = hojeIsoLocal();
    const agendamentos = listarAgendamentosParaDisparoNoDia(hoje);
    res.json({ agendamentos, dia_disparo: hoje });
  }),
);

whatsappRouter.post(
  "/enviar/:agendamentoId",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.agendamentoId);
    const reenviar = Boolean(
      req.body && typeof req.body === "object" && (req.body as { reenviar?: boolean }).reenviar,
    );
    try {
      const ag = getDb()
        .prepare(`SELECT confirmacao_enviada FROM agendamentos WHERE id = ?`)
        .get(id) as { confirmacao_enviada: number } | undefined;
      if (!ag) {
        res.status(404).json({ error: "Agendamento não encontrado" });
        return;
      }
      let r: { ok: boolean; logId?: number; enviado?: boolean; motivo?: string };
      if (reenviar || ag.confirmacao_enviada !== 1) {
        r = await enviarConfirmacaoAgendamento(id, getDb(), {
          forcar: reenviar,
        });
      } else {
        r = await processarPreparosPendentesAgendamento(id);
        if ("enviado" in r && r.enviado === false) {
          const msg =
            r.motivo === "mesmo_dia_ou_passado"
              ? "No dia do atendimento não enviamos preparo extra"
              : "Não há preparo novo para enviar";
          res.status(400).json({ error: msg });
          return;
        }
      }
      logAcesso({
        usuarioId: req.usuario!.id,
        acao: "whatsapp_envio",
        detalhe: `agendamento=${id}${reenviar ? " reenviar" : ""}`,
      });
      res.json(r);
    } catch (e) {
      res.status(400).json({
        error: e instanceof Error ? e.message : "Erro ao enviar",
      });
    }
  }),
);

whatsappRouter.post(
  "/enviar-hoje",
  asyncHandler(async (req, res) => {
    const r = await processarEnviosAutomaticosDoDia(hojeIsoLocal());
    logAcesso({
      usuarioId: req.usuario!.id,
      acao: "whatsapp_cron_manual",
      detalhe: `enviados=${r.enviados} erros=${r.erros}`,
    });
    res.json(r);
  }),
);

whatsappRouter.post(
  "/enviar-amanha",
  asyncHandler(async (req, res) => {
    const r = await processarEnviosAutomaticosDoDia(hojeIsoLocal());
    logAcesso({
      usuarioId: req.usuario!.id,
      acao: "whatsapp_cron_manual",
      detalhe: `enviados=${r.enviados} erros=${r.erros}`,
    });
    res.json(r);
  }),
);

whatsappRouter.patch(
  "/agendamentos/:id/confirmado",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const info = getDb()
      .prepare(`UPDATE agendamentos SET confirmacao_respondida = 1 WHERE id = ?`)
      .run(id);
    if (info.changes === 0) {
      res.status(404).json({ error: "Agendamento não encontrado" });
      return;
    }
    res.json({ ok: true });
  }),
);
