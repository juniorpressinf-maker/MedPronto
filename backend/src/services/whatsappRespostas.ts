// Respostas dos pacientes no WhatsApp: "SIM" confirma o próximo agendamento
// com confirmação enviada e ainda sem resposta. Outras respostas só ficam no log.
import type Database from "better-sqlite3";
import { getDb } from "../db/index.js";

/** DDD + últimos 8 dígitos: ignora +55 e o 9º dígito (que às vezes falta no WhatsApp). */
export function chaveTelefone(raw: string): string | null {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (d.length >= 12 && d.startsWith("55")) d = d.slice(2);
  if (d.length < 10) return null;
  return d.slice(0, 2) + d.slice(-8);
}

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** "sim", "s", "confirmo", "ok", "1", 👍 … (só o começo da resposta importa). */
export function ehConfirmacao(texto: string): boolean {
  const t = normalizar(texto);
  if (!t) return false;
  if (/^(👍|✅|✔)/u.test(t)) return true;
  const primeira = t.split(/[^a-z0-9]+/).filter(Boolean)[0] ?? "";
  return ["sim", "s", "ss", "confirmo", "confirmado", "confirmada", "confirmar", "ok", "1", "yes"].includes(primeira);
}

/** "não", "nao vou", "cancelar", "desmarcar", "remarcar", 👎 … — só sinaliza, nunca cancela. */
export function ehRecusa(texto: string): boolean {
  const t = normalizar(texto);
  if (!t) return false;
  if (/^(👎|❌)/u.test(t)) return true;
  const primeira = t.split(/[^a-z0-9]+/).filter(Boolean)[0] ?? "";
  if (["nao", "n", "nop", "cancela", "cancelar", "cancelo", "desmarcar", "desmarca", "remarcar", "remarca"].includes(primeira)) {
    return true;
  }
  return /\b(nao (vou|posso|poderei|conseguirei|vai dar|da)|cancel|desmarc|remarc|outro dia|outra data)/.test(t);
}

export type ResultadoResposta =
  | { tipo: "confirmou"; agendamento_id: number }
  | { tipo: "recusou"; agendamento_id: number }
  | { tipo: "outra"; agendamento_id: number | null }
  | { tipo: "sem_agendamento" };

type Candidato = { id: number; paciente_id: number; telefone: string | null };

export function registrarRespostaPaciente(
  telefone: string,
  texto: string,
  hoje: string,
  db: Database.Database = getDb(),
): ResultadoResposta {
  const chave = chaveTelefone(telefone);
  if (!chave) return { tipo: "sem_agendamento" };

  const candidatos = (
    db
      .prepare(
        `SELECT a.id, a.paciente_id, p.telefone
         FROM agendamentos a
         JOIN pacientes p ON p.id = a.paciente_id
         WHERE a.confirmacao_enviada = 1
           AND a.confirmacao_respondida = 0
           AND a.data >= ?
           AND a.status NOT IN ('cancelado', 'nao_compareceu', 'finalizado')
         ORDER BY a.data, a.hora`,
      )
      .all(hoje) as Candidato[]
  ).filter((c) => chaveTelefone(c.telefone ?? "") === chave);

  const alvo = candidatos[0] ?? null;
  // B3 [14]: telefone compartilhado (ex.: mãe e filhos) com horários pendentes de
  // pacientes diferentes — não dá para saber quem respondeu. Não confirma nada
  // sozinho: a resposta aparece em todos esses horários para a recepção decidir.
  const primeiroPorPaciente = new Map<number, Candidato>();
  for (const c of candidatos) {
    if (!primeiroPorPaciente.has(c.paciente_id)) primeiroPorPaciente.set(c.paciente_id, c);
  }
  const ambiguo = primeiroPorPaciente.size > 1;
  const confirmou = !!alvo && !ambiguo && ehConfirmacao(texto);
  const tipo: "confirmou" | "recusou" | "outra" = confirmou ? "confirmou" : ehRecusa(texto) ? "recusou" : "outra";
  const alvosResposta = ambiguo ? [...primeiroPorPaciente.values()] : alvo ? [alvo] : [];
  const textoCard = ambiguo
    ? `[Telefone de mais de um paciente — confirme manualmente] ${texto}`
    : texto;

  db.transaction(() => {
    if (confirmou) {
      db.prepare(`UPDATE agendamentos SET confirmacao_respondida = 1 WHERE id = ?`).run(alvo!.id);
    }
    // Última resposta fica visível na agenda (painel e card).
    for (const a of alvosResposta) {
      db.prepare(
        `UPDATE agendamentos
         SET whatsapp_ultima_resposta = ?, whatsapp_resposta_tipo = ?,
             whatsapp_resposta_em = datetime('now', 'localtime')
         WHERE id = ?`,
      ).run(textoCard.slice(0, 500), tipo, a.id);
    }
    if (alvo) {
      db.prepare(
        `INSERT INTO log_whatsapp (agendamento_id, paciente_id, telefone, mensagem, status)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(alvo.id, alvo.paciente_id, telefone, texto.slice(0, 1000), confirmou ? "resposta_confirmou" : tipo === "recusou" ? "resposta_recusou" : "resposta");
    }
  })();

  if (!alvo) return { tipo: "sem_agendamento" };
  return { tipo, agendamento_id: alvo.id };
}
