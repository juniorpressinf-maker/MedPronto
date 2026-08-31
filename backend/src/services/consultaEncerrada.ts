import { getDb } from "../db/index.js";

type ProntuarioFlags = {
  agendamento_id: number | null;
  retificacao_de_id: number | null;
  retificacao_finalizada: number | boolean | null;
};

function retificacaoEmAndamento(pr: ProntuarioFlags): boolean {
  return pr.retificacao_de_id != null && !pr.retificacao_finalizada;
}

export function isConsultaEncerrada(pr: ProntuarioFlags): boolean {
  if (retificacaoEmAndamento(pr)) return false;

  if (pr.retificacao_de_id != null) return true;

  if (!pr.agendamento_id) return true;

  const ag = getDb()
    .prepare(`SELECT status FROM agendamentos WHERE id = ?`)
    .get(pr.agendamento_id) as { status: string } | undefined;

  if (!ag) return true;
  return ag.status === "finalizado";
}

export function loadFlagsProntuario(
  prontuarioId: number,
): ProntuarioFlags | undefined {
  return getDb()
    .prepare(
      `SELECT agendamento_id, retificacao_de_id, retificacao_finalizada
       FROM prontuarios WHERE id = ?`,
    )
    .get(prontuarioId) as ProntuarioFlags | undefined;
}

export function assertConsultaEditavel(prontuarioId: number): void {
  const pr = loadFlagsProntuario(prontuarioId);
  if (!pr) {
    const err = new Error("Prontuário não encontrado");
    (err as Error & { status: number }).status = 404;
    throw err;
  }
  if (isConsultaEncerrada(pr)) {
    const err = new Error(
      "Consulta finalizada — documentos e prontuário em somente leitura. Para corrigir dados clínicos, use Retificação no histórico.",
    );
    (err as Error & { status: number }).status = 409;
    throw err;
  }
}
