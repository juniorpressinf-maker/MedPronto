import type { Database } from "better-sqlite3";
import { getDb } from "../db/index.js";
import {
  addDiasIso,
  calcularDiaDisparoConfirmacao,
  hojeIsoLocal,
  isDiaNaoUtil,
} from "../lib/diasUteis.js";
import { primeiroNome } from "../lib/nomes.js";
import { getStatus, sendTextToPhone } from "../whatsapp/cliente.js";
export type ConfigWhatsApp = {
  id: number;
  provedor: string | null;
  api_url: string | null;
  api_token: string | null;
  numero_origem: string | null;
  ativo: number;
  template_confirmacao: string | null;
  hora_fixa_ativa: number;
  hora_fixa_mensagem: string | null;
};

export const TEMPLATE_PADRAO =
  "Olá {nome}, confirmamos seu procedimento em {data} às {hora} com {medico}. {preparo} Por favor, confirme sua presença respondendo SIM.";

export const TEMPLATE_PREPARO_EXTRA =
  "Olá {nome}, inclusão no seu atendimento de {data}: {preparo}";

export function getConfigWhatsApp(db: Database = getDb()): ConfigWhatsApp {
  const row = db
    .prepare(`SELECT * FROM config_whatsapp WHERE id = 1`)
    .get() as ConfigWhatsApp | undefined;
  if (!row) {
    db.prepare(
      `INSERT INTO config_whatsapp (id, ativo, template_confirmacao) VALUES (1, 0, ?)`,
    ).run(TEMPLATE_PADRAO);
    return getConfigWhatsApp(db);
  }
  return row;
}

export function horaNaMensagemConfirmacao(
  cfg: ConfigWhatsApp,
  horaAgenda: string,
): string {
  if (cfg.hora_fixa_ativa) {
    const fixa = String(cfg.hora_fixa_mensagem ?? "").trim();
    if (fixa) return fixa;
  }
  return horaAgenda;
}

export function formatarTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replaceAll(`{${k}}`, String(v ?? ""));
  }
  return out.replace(/[ \t]{2,}/g, " ").trim();
}

function formatDataBr(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function normalizarTelefone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length >= 12 && digits.startsWith("55")) return digits;
  if (digits.length >= 10) return `55${digits}`;
  return digits;
}

export async function enviarMensagemWhatsApp(
  telefone: string,
  texto: string,
  db: Database = getDb(),
): Promise<void> {
  const cfg = getConfigWhatsApp(db);
  if (!cfg.ativo) throw new Error("Envio automático desativado nas configurações");
  if (getStatus().status !== "conectado") {
    throw new Error(
      "WhatsApp não conectado. Abra Configurações → WhatsApp e escaneie o QR Code.",
    );
  }
  const dest = normalizarTelefone(telefone);
  if (dest.length < 10) throw new Error("Telefone inválido");
  await sendTextToPhone(dest, texto);
}

type AgendamentoEnvio = {
  id: number;
  paciente_id: number;
  paciente_nome: string;
  paciente_telefone: string | null;
  data: string;
  hora: string;
  medico_nome: string;
  status: string;
  confirmacao_enviada?: number;
};

export function concatenarPreparosAgendamento(
  agendamentoId: number,
  db: Database = getDb(),
  soPendentes = false,
): string {
  const rows = db
    .prepare(
      `SELECT pr.nome AS nome, TRIM(IFNULL(pr.orientacoes_paciente, '')) AS texto
       FROM agendamento_procedimentos ap
       JOIN procedimentos pr ON pr.id = ap.procedimento_id
       WHERE ap.agendamento_id = ?
         ${soPendentes ? "AND ap.preparo_enviado = 0" : ""}
       ORDER BY ap.ordem, ap.id`,
    )
    .all(agendamentoId) as { nome: string; texto: string }[];
  const blocos = rows
    .filter((r) => r.texto.length > 0)
    .map((r) => `${r.nome.trim().toUpperCase()} = ${r.texto}`);
  if (blocos.length === 0) return "";
  return `\n\n${blocos.join("\n\n")}\n`;
}

export function marcarPreparosEnviados(
  agendamentoId: number,
  db: Database = getDb(),
  soPendentes = false,
): void {
  if (soPendentes) {
    db.prepare(
      `UPDATE agendamento_procedimentos SET preparo_enviado = 1
       WHERE agendamento_id = ? AND preparo_enviado = 0`,
    ).run(agendamentoId);
  } else {
    db.prepare(
      `UPDATE agendamento_procedimentos SET preparo_enviado = 1
       WHERE agendamento_id = ?`,
    ).run(agendamentoId);
  }
  db.prepare(
    `UPDATE agendamentos SET whatsapp_preparo_pendente = 0 WHERE id = ?`,
  ).run(agendamentoId);
}

export function listarAgendamentosParaDisparoNoDia(
  diaDisparo: string,
  db: Database = getDb(),
): AgendamentoEnvio[] {
  const ate = addDiasIso(diaDisparo, 30);
  const rows = db
    .prepare(
      `SELECT a.id, a.paciente_id, a.data, a.hora, a.status,
              p.nome AS paciente_nome, p.telefone AS paciente_telefone,
              u.nome AS medico_nome
       FROM agendamentos a
       JOIN pacientes p ON p.id = a.paciente_id
       JOIN usuarios u ON u.id = a.medico_id
       WHERE a.data >= ?
         AND a.data <= ?
         AND a.status = 'agendado'
         AND a.confirmacao_enviada = 0
         AND p.telefone IS NOT NULL AND TRIM(p.telefone) != ''`,
    )
    .all(diaDisparo, ate) as AgendamentoEnvio[];

  return rows.filter(
    (a) => calcularDiaDisparoConfirmacao(a.data) === diaDisparo,
  );
}

/** @deprecated use listarAgendamentosParaDisparoNoDia */
export function listarAgendamentosAmanha(db: Database = getDb()): AgendamentoEnvio[] {
  return listarAgendamentosParaDisparoNoDia(hojeIsoLocal(), db);
}

export function listarAgendamentosComPreparoPendente(
  hoje: string = hojeIsoLocal(),
  db: Database = getDb(),
): { id: number }[] {
  return db
    .prepare(
      `SELECT DISTINCT a.id
       FROM agendamentos a
       JOIN pacientes p ON p.id = a.paciente_id
       JOIN agendamento_procedimentos ap ON ap.agendamento_id = a.id
       JOIN procedimentos pr ON pr.id = ap.procedimento_id
       WHERE a.status = 'agendado'
         AND a.confirmacao_enviada = 1
         AND a.data > ?
         AND ap.preparo_enviado = 0
         AND TRIM(IFNULL(pr.orientacoes_paciente, '')) != ''
         AND p.telefone IS NOT NULL AND TRIM(p.telefone) != ''`,
    )
    .all(hoje) as { id: number }[];
}

export function limparPreparosVencidos(
  hoje: string = hojeIsoLocal(),
  db: Database = getDb(),
): void {
  db.prepare(
    `UPDATE agendamento_procedimentos SET preparo_enviado = 1
     WHERE preparo_enviado = 0
       AND agendamento_id IN (
         SELECT id FROM agendamentos WHERE data <= ?
       )`,
  ).run(hoje);
  db.prepare(
    `UPDATE agendamentos SET whatsapp_preparo_pendente = 0
     WHERE data <= ? AND whatsapp_preparo_pendente = 1`,
  ).run(hoje);
}
export async function enviarConfirmacaoAgendamento(
  agendamentoId: number,
  db: Database = getDb(),
  opts?: { forcar?: boolean },
): Promise<{ ok: boolean; logId: number }> {
  const row = db
    .prepare(
      `SELECT a.id, a.paciente_id, a.data, a.hora, a.status, a.confirmacao_enviada,
              p.nome AS paciente_nome, p.telefone AS paciente_telefone,
              u.nome AS medico_nome
       FROM agendamentos a
       JOIN pacientes p ON p.id = a.paciente_id
       JOIN usuarios u ON u.id = a.medico_id
       WHERE a.id = ?`,
    )
    .get(agendamentoId) as AgendamentoEnvio | undefined;

  if (!row) throw new Error("Agendamento não encontrado");
  if (row.status !== "agendado") {
    throw new Error("Só é possível enviar confirmação para agendamentos pendentes");
  }
  if (row.confirmacao_enviada === 1 && !opts?.forcar) {
    throw new Error("Confirmação já enviada. Use o envio de preparo extra se houver item novo.");
  }
  const tel = String(row.paciente_telefone ?? "").trim();
  if (!tel) throw new Error("Paciente sem telefone cadastrado");

  const cfg = getConfigWhatsApp(db);
  const template =
    String(cfg.template_confirmacao ?? TEMPLATE_PADRAO).trim() || TEMPLATE_PADRAO;
  const mensagem = formatarTemplate(template, {
    nome: primeiroNome(row.paciente_nome),
    data: formatDataBr(row.data),
    hora: horaNaMensagemConfirmacao(cfg, row.hora),
    medico: row.medico_nome,
    preparo: concatenarPreparosAgendamento(agendamentoId, db),
  });

  const info = db
    .prepare(
      `INSERT INTO log_whatsapp (agendamento_id, paciente_id, telefone, mensagem, status)
       VALUES (?, ?, ?, ?, 'enviando')`,
    )
    .run(agendamentoId, row.paciente_id, tel, mensagem);
  const logId = Number(info.lastInsertRowid);

  try {
    await enviarMensagemWhatsApp(tel, mensagem, db);
    db.prepare(`UPDATE log_whatsapp SET status = 'enviado' WHERE id = ?`).run(logId);
    db.prepare(`UPDATE agendamentos SET confirmacao_enviada = 1 WHERE id = ?`).run(
      agendamentoId,
    );
    marcarPreparosEnviados(agendamentoId, db);
    return { ok: true, logId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao enviar";
    db.prepare(`UPDATE log_whatsapp SET status = 'erro' WHERE id = ?`).run(logId);
    throw new Error(msg);
  }
}

export async function processarPreparosPendentesAgendamento(
  agendamentoId: number,
  db: Database = getDb(),
): Promise<{ ok: boolean; enviado: boolean; motivo?: string; logId?: number }> {
  const row = db
    .prepare(
      `SELECT a.id, a.paciente_id, a.data, a.hora, a.status, a.confirmacao_enviada,
              p.nome AS paciente_nome, p.telefone AS paciente_telefone,
              u.nome AS medico_nome
       FROM agendamentos a
       JOIN pacientes p ON p.id = a.paciente_id
       JOIN usuarios u ON u.id = a.medico_id
       WHERE a.id = ?`,
    )
    .get(agendamentoId) as AgendamentoEnvio | undefined;
  if (!row) throw new Error("Agendamento não encontrado");
  if (row.confirmacao_enviada !== 1) {
    return { ok: true, enviado: false, motivo: "sem_confirmacao" };
  }

  const hoje = hojeIsoLocal();
  if (hoje >= row.data) {
    marcarPreparosEnviados(agendamentoId, db, true);
    return { ok: true, enviado: false, motivo: "mesmo_dia_ou_passado" };
  }

  const preparo = concatenarPreparosAgendamento(agendamentoId, db, true);
  if (!preparo) {
    marcarPreparosEnviados(agendamentoId, db, true);
    return { ok: true, enviado: false, motivo: "sem_pendente" };
  }

  const tel = String(row.paciente_telefone ?? "").trim();
  if (!tel) throw new Error("Paciente sem telefone cadastrado");

  const mensagem = formatarTemplate(TEMPLATE_PREPARO_EXTRA, {
    nome: primeiroNome(row.paciente_nome),
    data: formatDataBr(row.data),
    hora: row.hora,
    medico: row.medico_nome,
    preparo,
  });

  const info = db
    .prepare(
      `INSERT INTO log_whatsapp (agendamento_id, paciente_id, telefone, mensagem, status)
       VALUES (?, ?, ?, ?, 'enviando')`,
    )
    .run(agendamentoId, row.paciente_id, tel, mensagem);
  const logId = Number(info.lastInsertRowid);

  try {
    await enviarMensagemWhatsApp(tel, mensagem, db);
    db.prepare(`UPDATE log_whatsapp SET status = 'enviado' WHERE id = ?`).run(logId);
    marcarPreparosEnviados(agendamentoId, db, true);
    return { ok: true, enviado: true, logId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao enviar";
    db.prepare(`UPDATE log_whatsapp SET status = 'erro' WHERE id = ?`).run(logId);
    throw new Error(msg);
  }
}

/** Depois de editar o horário: Zap extra se couber; falha não desfaz o lançamento. */
export async function tentarPreparoZapAposEdicao(
  agendamentoId: number,
  db: Database = getDb(),
): Promise<void> {
  try {
    await processarPreparosPendentesAgendamento(agendamentoId, db);
  } catch (e) {
    console.error("[whatsapp] preparo após edição", agendamentoId, e);
  }
}

export async function processarEnviosAutomaticosDoDia(
  diaDisparo: string = hojeIsoLocal(),
  db: Database = getDb(),
): Promise<{ enviados: number; erros: number; ignorado?: string }> {
  limparPreparosVencidos(diaDisparo, db);

  const cfg = getConfigWhatsApp(db);
  if (!cfg.ativo) return { enviados: 0, erros: 0 };
  if (getStatus().status !== "conectado") return { enviados: 0, erros: 0 };
  if (isDiaNaoUtil(diaDisparo)) {
    return { enviados: 0, erros: 0, ignorado: "dia_nao_util" };
  }

  const lista = listarAgendamentosParaDisparoNoDia(diaDisparo, db);
  let enviados = 0;
  let erros = 0;
  for (const a of lista) {
    try {
      await enviarConfirmacaoAgendamento(a.id, db);
      enviados++;
    } catch {
      erros++;
    }
  }
  for (const a of listarAgendamentosComPreparoPendente(diaDisparo, db)) {
    try {
      const r = await processarPreparosPendentesAgendamento(a.id, db);
      if (r.enviado) enviados++;
    } catch {
      erros++;
    }
  }
  return { enviados, erros };
}

/** @deprecated use processarEnviosAutomaticosDoDia */
export async function processarEnviosAutomaticosAmanha(
  db: Database = getDb(),
): Promise<{ enviados: number; erros: number }> {
  const r = await processarEnviosAutomaticosDoDia(hojeIsoLocal(), db);
  return { enviados: r.enviados, erros: r.erros };
}