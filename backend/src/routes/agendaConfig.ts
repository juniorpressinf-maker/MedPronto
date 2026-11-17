/**
 * Agenda Nova — /api/agenda-config
 *   tipos de agendamento · agenda dos médicos (cor, intervalo, modo, expediente) · bloqueios
 *
 * Leitura: quem usa a agenda. Tipos e médicos: módulo agenda_config.
 * Bloqueios: módulo agenda (a secretaria bloqueia direto da tela); médico só os próprios.
 */
import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireModulo } from "../auth/middleware.js";
import {
  atualizarTipo,
  criarBloqueio,
  criarTipo,
  excluirBloqueio,
  excluirTipo,
  listarBloqueios,
  listarConfigMedicos,
  listarTipos,
  obterBloqueio,
  obterHorarioPadrao,
  salvarConfigMedico,
  salvarHorarioPadrao,
} from "../services/agendaConfig.js";
import { AgendaErro } from "../services/agendaErro.js";
import { dataValida, horaFimValida, horaValida } from "../services/agendaHorario.js";
import { logAcesso } from "../services/logAcesso.js";
import { idDoParametro, listaDeIds, rotaAgenda, usuarioDaRequisicao } from "./agendaRespostas.js";

export const agendaConfigRouter = Router();
agendaConfigRouter.use(requireAuth());

const zCor = z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Cor no formato #RRGGBB");
const zHora = z.string().refine(horaValida, "Hora no formato HH:MM");
const zHoraFim = z.string().refine(horaFimValida, "Hora no formato HH:MM (até 24:00)");
const zData = z.string().refine(dataValida, "Data inválida (AAAA-MM-DD)");
const zAtendimento = z.enum(["consulta", "admissional", "exame"]);

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

const camposTipo = {
  nome: z.string().trim().min(1).max(60),
  cor: zCor,
  duracao_minutos: z.number().int().min(5).max(480),
  tipo_atendimento: zAtendimento,
  eh_retorno: z.boolean(),
  eh_encaixe: z.boolean(),
  ordem: z.number().int().min(0).max(9999),
};

const tipoSchema = z.strictObject({
  ...camposTipo,
  eh_retorno: camposTipo.eh_retorno.default(false),
  eh_encaixe: camposTipo.eh_encaixe.default(false),
  ordem: camposTipo.ordem.optional(),
});

// Sem defaults de propósito: no zod 4, .partial() sobre .default() preencheria
// campos ausentes (ex.: PATCH só do nome zeraria eh_retorno).
const tipoPatchSchema = z.strictObject({
  nome: camposTipo.nome.optional(),
  cor: camposTipo.cor.optional(),
  duracao_minutos: camposTipo.duracao_minutos.optional(),
  tipo_atendimento: camposTipo.tipo_atendimento.optional(),
  eh_retorno: camposTipo.eh_retorno.optional(),
  eh_encaixe: camposTipo.eh_encaixe.optional(),
  ordem: camposTipo.ordem.optional(),
  ativo: z.boolean().optional(),
});

agendaConfigRouter.get(
  "/tipos",
  requireModulo("agenda", "agenda_config", "fila_recepcao"),
  rotaAgenda((req, res) => {
    res.json(listarTipos({ incluirInativos: req.query.inativos === "1" }));
  }),
);

agendaConfigRouter.post(
  "/tipos",
  requireModulo("agenda_config"),
  rotaAgenda((req, res) => {
    const tipo = criarTipo(tipoSchema.parse(req.body));
    logAcesso({ usuarioId: req.usuario!.id, acao: "agenda_tipo_criado", detalhe: `id=${tipo.id} ${tipo.nome}` });
    res.status(201).json(tipo);
  }),
);

agendaConfigRouter.patch(
  "/tipos/:id",
  requireModulo("agenda_config"),
  rotaAgenda((req, res) => {
    const id = idDoParametro(req);
    const tipo = atualizarTipo(id, tipoPatchSchema.parse(req.body));
    logAcesso({ usuarioId: req.usuario!.id, acao: "agenda_tipo_alterado", detalhe: `id=${id}` });
    res.json(tipo);
  }),
);

agendaConfigRouter.delete(
  "/tipos/:id",
  requireModulo("agenda_config"),
  rotaAgenda((req, res) => {
    const id = idDoParametro(req);
    excluirTipo(id);
    logAcesso({ usuarioId: req.usuario!.id, acao: "agenda_tipo_excluido", detalhe: `id=${id}` });
    res.json({ ok: true });
  }),
);

// ---------------------------------------------------------------------------
// Agenda dos médicos
// ---------------------------------------------------------------------------

const turnoSchema = z
  .object({ dia_semana: z.number().int().min(0).max(6), inicio: zHora, fim: zHoraFim })
  .refine((t) => t.inicio < t.fim, "O fim do turno precisa ser depois do início");

const configMedicoSchema = z
  .object({
    // Sem `cor`: é automática e única por médico (migração 047).
    intervalo_minutos: z
      .number()
      .int()
      .refine((n) => [5, 10, 15, 20, 30, 60].includes(n), "Intervalo: 5, 10, 15, 20, 30 ou 60")
      .optional(),
    modo: z.enum(["horario", "chegada"]).optional(),
    expediente: z.array(turnoSchema).max(42).optional(),
  })
  .strict();

agendaConfigRouter.get(
  "/medicos",
  requireModulo("agenda", "agenda_config", "fila_recepcao"),
  rotaAgenda((req, res) => {
    res.json(listarConfigMedicos({ incluirInativos: req.query.inativos === "1" }));
  }),
);

agendaConfigRouter.put(
  "/medicos/:id",
  requireModulo("agenda_config"),
  rotaAgenda((req, res) => {
    const id = idDoParametro(req);
    const cfg = salvarConfigMedico(id, configMedicoSchema.parse(req.body));
    logAcesso({ usuarioId: req.usuario!.id, acao: "agenda_medico_config", detalhe: `medico=${id}` });
    res.json(cfg);
  }),
);

// ---------------------------------------------------------------------------
// Bloqueios
// ---------------------------------------------------------------------------

const bloqueioSchema = z
  .object({
    medico_id: z.number().int().positive().nullable(),
    data_inicio: zData,
    data_fim: zData,
    hora_inicio: zHora.default("00:00"),
    hora_fim: zHoraFim.default("24:00"),
    motivo: z.string().trim().max(200).nullable().optional(),
  })
  .strict()
  .refine((b) => b.data_inicio <= b.data_fim, "Data final antes da inicial")
  .refine((b) => b.hora_inicio < b.hora_fim, "Hora final precisa ser depois da inicial");

agendaConfigRouter.get(
  "/bloqueios",
  requireModulo("agenda", "fila_recepcao"),
  rotaAgenda((req, res) => {
    const de = String(req.query.de ?? "");
    const ate = String(req.query.ate ?? "");
    if (!dataValida(de) || !dataValida(ate) || ate < de) {
      throw new AgendaErro("Informe de e ate no formato AAAA-MM-DD");
    }
    let medicoIds = listaDeIds(req.query.medico_ids);
    const u = usuarioDaRequisicao(req);
    if (u.perfil === "medico") medicoIds = [u.id];
    res.json(listarBloqueios({ de, ate, medicoIds }));
  }),
);

agendaConfigRouter.post(
  "/bloqueios",
  requireModulo("agenda"),
  rotaAgenda((req, res) => {
    const dados = bloqueioSchema.parse(req.body);
    const u = usuarioDaRequisicao(req);
    if (u.perfil === "medico" && dados.medico_id !== u.id) {
      throw new AgendaErro("Médico só pode bloquear a própria agenda", 403, "sem_permissao");
    }
    const r = criarBloqueio(dados, u.id);
    logAcesso({
      usuarioId: u.id,
      acao: "agenda_bloqueio_criado",
      detalhe: `id=${r.bloqueio.id} medico=${dados.medico_id ?? "todos"} ${dados.data_inicio}..${dados.data_fim} ${dados.hora_inicio}-${dados.hora_fim}`,
    });
    res.status(201).json(r);
  }),
);

agendaConfigRouter.delete(
  "/bloqueios/:id",
  requireModulo("agenda"),
  rotaAgenda((req, res) => {
    const id = idDoParametro(req);
    const u = usuarioDaRequisicao(req);
    const b = obterBloqueio(id);
    if (!b) throw new AgendaErro("Bloqueio não encontrado", 404, "nao_encontrado");
    if (u.perfil === "medico" && b.medico_id !== u.id) {
      throw new AgendaErro("Médico só pode remover bloqueio da própria agenda", 403, "sem_permissao");
    }
    excluirBloqueio(id);
    logAcesso({ usuarioId: u.id, acao: "agenda_bloqueio_excluido", detalhe: `id=${id}` });
    res.json({ ok: true });
  }),
);

// ---------------------------------------------------------------------------
// Horário padrão único (botão ⚙ da agenda)
// ---------------------------------------------------------------------------

const horarioPadraoSchema = z.strictObject({
  inicio: zHora,
  fim: zHoraFim,
  intervalo_minutos: z.number().int(),
});

agendaConfigRouter.get(
  "/horario-padrao",
  requireModulo("agenda", "agenda_config", "fila_recepcao", "fila_medico"),
  rotaAgenda((_req, res) => {
    res.json(obterHorarioPadrao());
  }),
);

agendaConfigRouter.put(
  "/horario-padrao",
  requireModulo("agenda_config"),
  rotaAgenda((req, res) => {
    const h = salvarHorarioPadrao(horarioPadraoSchema.parse(req.body));
    logAcesso({
      usuarioId: req.usuario!.id,
      acao: "agenda_horario_padrao",
      detalhe: `${h.inicio}-${h.fim} / ${h.intervalo_minutos}min`,
    });
    res.json(h);
  }),
);
