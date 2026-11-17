import type { Database } from "better-sqlite3";
import { getDb } from "../db/index.js";
import { nomeExameParaExibicao } from "../utils/examesStorage.js";
import { buscarContaPorAgendamento } from "./cobrancaContas.js";

/**
 * Resultado (laudo PDF) dos exames auxiliares de um horário, pela Sala de espera.
 * Laudo não é financeiro: pode ser vinculado mesmo com a conta paga/fechada
 * (trigger liberado só para exame_anexo_id em 055_conta_item_laudo_conta_fechada.sql).
 */

export type ExameResultadoItem = {
  item_id: number;
  procedimento_nome: string;
  exame_anexo_id: number | null;
  exame_nome: string | null;
};

export type ExamesResultadoAgendamento = {
  agendamento_id: number;
  paciente_id: number;
  paciente_nome: string;
  conta_id: number | null;
  itens: ExameResultadoItem[];
};

export class ExameResultadoErro extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export function pacienteDoAgendamento(
  agendamentoId: number,
  db: Database = getDb(),
): { paciente_id: number; paciente_nome: string } {
  const ag = db
    .prepare(
      `SELECT a.paciente_id, p.nome AS paciente_nome
       FROM agendamentos a JOIN pacientes p ON p.id = a.paciente_id
       WHERE a.id = ?`,
    )
    .get(agendamentoId) as { paciente_id: number; paciente_nome: string } | undefined;
  if (!ag) throw new ExameResultadoErro("Agendamento não encontrado", 404);
  return ag;
}

export function listarExamesResultadoAgendamento(
  agendamentoId: number,
  db: Database = getDb(),
): ExamesResultadoAgendamento {
  const ag = pacienteDoAgendamento(agendamentoId, db);
  const conta = buscarContaPorAgendamento(agendamentoId, db);
  const base = {
    agendamento_id: agendamentoId,
    paciente_id: ag.paciente_id,
    paciente_nome: ag.paciente_nome,
    conta_id: conta?.id ?? null,
  };
  if (!conta) return { ...base, itens: [] };

  const rows = db
    .prepare(
      `SELECT ci.id AS item_id, pr.nome AS procedimento_nome, ci.exame_anexo_id,
              ea.descricao AS exame_descricao, ea.arquivo_path AS exame_arquivo_path
       FROM conta_itens ci
       JOIN procedimentos pr ON pr.id = ci.procedimento_id
       LEFT JOIN exames_anexos ea ON ea.id = ci.exame_anexo_id
       WHERE ci.conta_id = ? AND ci.status != 'cancelado' AND pr.modo_clinico = 'nenhum'
       ORDER BY ci.id`,
    )
    .all(conta.id) as {
    item_id: number;
    procedimento_nome: string;
    exame_anexo_id: number | null;
    exame_descricao: string | null;
    exame_arquivo_path: string | null;
  }[];

  return {
    ...base,
    itens: rows.map((r) => ({
      item_id: r.item_id,
      procedimento_nome: r.procedimento_nome,
      exame_anexo_id: r.exame_anexo_id,
      exame_nome: r.exame_anexo_id
        ? r.exame_descricao?.trim() ||
          (r.exame_arquivo_path
            ? nomeExameParaExibicao(r.exame_arquivo_path)
            : `Exame #${r.exame_anexo_id}`)
        : null,
    })),
  };
}

export function vincularResultadoExameAgendamento(
  agendamentoId: number,
  itemId: number,
  exameAnexoId: number | null,
  db: Database = getDb(),
): ExamesResultadoAgendamento {
  const atual = listarExamesResultadoAgendamento(agendamentoId, db);
  if (!atual.conta_id) throw new ExameResultadoErro("Horário sem conta");
  if (!atual.itens.some((i) => i.item_id === itemId)) {
    throw new ExameResultadoErro("Item não é exame deste horário");
  }
  if (exameAnexoId != null) {
    const ok = db
      .prepare(`SELECT 1 FROM exames_anexos WHERE id = ? AND paciente_id = ?`)
      .get(exameAnexoId, atual.paciente_id);
    if (!ok) throw new ExameResultadoErro("Exame anexo não é deste paciente");
  }
  db.prepare(`UPDATE conta_itens SET exame_anexo_id = ? WHERE id = ?`).run(
    exameAnexoId,
    itemId,
  );
  return listarExamesResultadoAgendamento(agendamentoId, db);
}

export type ExamePendente = {
  agendamento_id: number;
  data: string;
  hora: string;
  paciente_nome: string;
  medico_id: number;
  medico_nome: string;
  exames: string[];
};

/**
 * Horários finalizados (últimos 180 dias) com exame sem laudo — tela "Laudos pendentes".
 * medicoId: restringe a um médico (perfil médico sem fila da recepção).
 */
export function listarExamesPendentes(
  medicoId: number | null,
  db: Database = getDb(),
): ExamePendente[] {
  let sql = `
    SELECT a.id AS agendamento_id, a.data, a.hora, p.nome AS paciente_nome,
           a.medico_id, u.nome AS medico_nome, pr.nome AS exame
    FROM agendamentos a
    JOIN pacientes p ON p.id = a.paciente_id
    JOIN usuarios u ON u.id = a.medico_id
    JOIN contas_atendimento c ON c.agendamento_id = a.id AND c.status != 'cancelada'
    JOIN conta_itens ci ON ci.conta_id = c.id AND ci.status != 'cancelado'
    JOIN procedimentos pr ON pr.id = ci.procedimento_id
    WHERE a.status = 'finalizado'
      AND pr.modo_clinico = 'nenhum'
      AND ci.exame_anexo_id IS NULL
      AND a.data >= date('now', 'localtime', '-180 days')`;
  const params: unknown[] = [];
  if (medicoId) {
    sql += ` AND a.medico_id = ?`;
    params.push(medicoId);
  }
  sql += ` ORDER BY a.data DESC, a.hora DESC, a.id DESC, ci.id`;
  const rows = db.prepare(sql).all(...params) as (Omit<ExamePendente, "exames"> & {
    exame: string;
  })[];

  const porAgendamento = new Map<number, ExamePendente>();
  for (const { exame, ...r } of rows) {
    const atual = porAgendamento.get(r.agendamento_id);
    if (atual) atual.exames.push(exame);
    else porAgendamento.set(r.agendamento_id, { ...r, exames: [exame] });
  }
  return [...porAgendamento.values()];
}
