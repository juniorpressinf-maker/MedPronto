/**
 * Episódios clínicos de horário só-exame (modo_clinico = nenhum).
 * Sem prontuário/ASO — aparecem no histórico clínico só como memória + PDF opcional (M7).
 * Exame no mesmo horário de consulta NÃO entra aqui (§1.3.13): já faz parte da consulta.
 */
import type { Database } from "better-sqlite3";
import { getDb } from "../db/index.js";
import { nomeExameParaExibicao } from "../utils/examesStorage.js";

export type HistoricoExameAnexo = {
  exame_anexo_id: number;
  exame_nome: string;
  procedimento_id: number | null;
  procedimento_nome: string | null;
};

export type HistoricoExameClinicoItem = {
  agendamento_id: number;
  data: string;
  hora: string;
  status: string;
  medico_id: number;
  medico_nome: string;
  procedimentos: {
    id: number;
    nome: string;
    modo_clinico: string;
    ordem: number;
  }[];
  anexos: HistoricoExameAnexo[];
};

/** Mesma regra de `horarioSoExame`, em SQL para listagem. */
const SQL_HORARIO_SO_EXAME = `(
  (
    EXISTS (
      SELECT 1 FROM agendamento_procedimentos apx
      WHERE apx.agendamento_id = a.id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM agendamento_procedimentos apx
      JOIN procedimentos px ON px.id = apx.procedimento_id
      WHERE apx.agendamento_id = a.id
        AND px.modo_clinico IN ('prontuario', 'aso')
    )
  )
  OR (
    NOT EXISTS (
      SELECT 1 FROM agendamento_procedimentos apx
      WHERE apx.agendamento_id = a.id
    )
    AND a.tipo_atendimento = 'exame'
  )
)`;

export function listarHistoricoExamesClinicos(
  pacienteId: number,
  opts: { medicoId?: number } = {},
  db: Database = getDb(),
): HistoricoExameClinicoItem[] {
  const params: unknown[] = [pacienteId];
  let sql = `
    SELECT a.id AS agendamento_id, a.data, a.hora, a.status, a.medico_id,
           u.nome AS medico_nome
    FROM agendamentos a
    JOIN usuarios u ON u.id = a.medico_id
    WHERE a.paciente_id = ?
      AND a.status = 'finalizado'
      AND ${SQL_HORARIO_SO_EXAME}`;
  if (opts.medicoId != null) {
    sql += ` AND a.medico_id = ?`;
    params.push(opts.medicoId);
  }
  sql += ` ORDER BY a.data DESC, a.hora DESC, a.id DESC LIMIT 200`;

  const rows = db.prepare(sql).all(...params) as {
    agendamento_id: number;
    data: string;
    hora: string;
    status: string;
    medico_id: number;
    medico_nome: string;
  }[];

  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.agendamento_id);
  const ph = ids.map(() => "?").join(",");

  const procs = db
    .prepare(
      `SELECT ap.agendamento_id, p.id, p.nome, p.modo_clinico, ap.ordem
       FROM agendamento_procedimentos ap
       JOIN procedimentos p ON p.id = ap.procedimento_id
       WHERE ap.agendamento_id IN (${ph})
       ORDER BY ap.agendamento_id, ap.ordem, ap.id`,
    )
    .all(...ids) as {
    agendamento_id: number;
    id: number;
    nome: string;
    modo_clinico: string;
    ordem: number;
  }[];

  const procsPorAg = new Map<number, HistoricoExameClinicoItem["procedimentos"]>();
  for (const p of procs) {
    const lista = procsPorAg.get(p.agendamento_id) ?? [];
    lista.push({
      id: p.id,
      nome: p.nome,
      modo_clinico: p.modo_clinico,
      ordem: p.ordem,
    });
    procsPorAg.set(p.agendamento_id, lista);
  }

  const anexoRows = db
    .prepare(
      `SELECT c.agendamento_id, ci.exame_anexo_id, ci.procedimento_id,
              pr.nome AS procedimento_nome,
              ea.descricao AS exame_descricao,
              ea.arquivo_path AS exame_arquivo_path
       FROM contas_atendimento c
       JOIN conta_itens ci ON ci.conta_id = c.id
       LEFT JOIN procedimentos pr ON pr.id = ci.procedimento_id
       LEFT JOIN exames_anexos ea ON ea.id = ci.exame_anexo_id
       WHERE c.agendamento_id IN (${ph})
         AND c.status != 'cancelada'
         AND ci.status != 'cancelado'
         AND ci.exame_anexo_id IS NOT NULL
       ORDER BY c.agendamento_id, ci.id`,
    )
    .all(...ids) as {
    agendamento_id: number;
    exame_anexo_id: number;
    procedimento_id: number | null;
    procedimento_nome: string | null;
    exame_descricao: string | null;
    exame_arquivo_path: string | null;
  }[];

  const anexosPorAg = new Map<number, HistoricoExameAnexo[]>();
  for (const row of anexoRows) {
    const desc = row.exame_descricao?.trim();
    const nome =
      desc ||
      (row.exame_arquivo_path
        ? nomeExameParaExibicao(row.exame_arquivo_path)
        : `Exame #${row.exame_anexo_id}`);
    const lista = anexosPorAg.get(row.agendamento_id) ?? [];
    lista.push({
      exame_anexo_id: row.exame_anexo_id,
      exame_nome: nome,
      procedimento_id: row.procedimento_id,
      procedimento_nome: row.procedimento_nome,
    });
    anexosPorAg.set(row.agendamento_id, lista);
  }

  return rows.map((r) => ({
    agendamento_id: r.agendamento_id,
    data: r.data,
    hora: r.hora,
    status: r.status,
    medico_id: r.medico_id,
    medico_nome: r.medico_nome,
    procedimentos: procsPorAg.get(r.agendamento_id) ?? [],
    anexos: anexosPorAg.get(r.agendamento_id) ?? [],
  }));
}
