/**
 * Regra de agendamento de RETORNO (decisão do cliente, 13/11/2026):
 *
 *   - retorno vigente com o MESMO médico, data dentro do prazo → ok;
 *   - retorno vigente com OUTRO médico → recusado (é nova consulta);
 *   - sem consulta prévia, consulta sem prazo de retorno, prazo vencido
 *     ou data depois do prazo → pede confirmação ("agendar mesmo assim?").
 *
 * Usado por POST /agendamentos e por mover/trocar (agendaGrade.ts).
 */
import type { Database } from "better-sqlite3";
import { getDb } from "../db/index.js";
import { AgendaErro } from "./agendaErro.js";
import { getRetornoVigente } from "./retornoService.js";

export type MotivoConfirmacaoRetorno =
  | "sem_consulta"
  | "sem_prazo"
  | "prazo_vencido"
  | "data_apos_prazo";

function dataBr(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

/** Última consulta válida do paciente (mesmo critério de getRetornoVigente, sem o filtro de prazo). */
function ultimaConsulta(
  pacienteId: number,
  db: Database,
): { data_atendimento: string; medico_nome: string; retorno_ate: string | null } | undefined {
  return db
    .prepare(
      `SELECT pr.data_atendimento, pr.retorno_ate, u.nome AS medico_nome
       FROM prontuarios pr
       JOIN usuarios u ON u.id = pr.medico_id
       WHERE pr.paciente_id = ?
         AND (
           (pr.retificacao_de_id IS NOT NULL AND pr.retificacao_finalizada = 1)
           OR (
             pr.retificacao_de_id IS NULL
             AND (
               pr.agendamento_id IS NULL
               OR EXISTS (SELECT 1 FROM agendamentos a WHERE a.id = pr.agendamento_id AND a.status = 'finalizado')
             )
           )
         )
       ORDER BY pr.data_atendimento DESC, pr.id DESC
       LIMIT 1`,
    )
    .get(pacienteId) as
    | { data_atendimento: string; medico_nome: string; retorno_ate: string | null }
    | undefined;
}

/**
 * Valida o retorno. Lança AgendaErro 400 (outro médico) ou
 * 409 `codigo: 'retorno_confirmar'` com `motivo` e `mensagem` quando
 * precisa de confirmação e `confirmado` não veio true.
 */
export function assertRetornoAgendavel(
  params: { paciente_id: number; paciente_nome?: string; medico_id: number; data: string; confirmado: boolean },
  db: Database = getDb(),
): void {
  const vigente = getRetornoVigente(params.paciente_id);
  const quem = params.paciente_nome ? `${params.paciente_nome}: ` : "";

  if (vigente && vigente.medico_id !== params.medico_id) {
    throw new AgendaErro(
      `${quem}o retorno vigente é com ${vigente.medico_nome}. Para outro médico, agende como nova consulta.`,
      400,
      "invalido",
      { retorno: vigente },
    );
  }

  let motivo: MotivoConfirmacaoRetorno | null = null;
  let mensagem = "";
  if (vigente) {
    const limite = vigente.retorno_ate.slice(0, 10);
    if (params.data > limite) {
      motivo = "data_apos_prazo";
      mensagem = `${quem}a data escolhida é depois do fim do prazo de retorno (${dataBr(limite)}).`;
    }
  } else {
    const ultima = ultimaConsulta(params.paciente_id, db);
    if (!ultima) {
      motivo = "sem_consulta";
      mensagem = `${quem}paciente não tem consulta anterior registrada.`;
    } else if (!ultima.retorno_ate) {
      motivo = "sem_prazo";
      mensagem = `${quem}a última consulta (${dataBr(ultima.data_atendimento)}, ${ultima.medico_nome}) não definiu prazo de retorno.`;
    } else {
      motivo = "prazo_vencido";
      mensagem = `${quem}o prazo de retorno terminou em ${dataBr(ultima.retorno_ate)} (consulta de ${dataBr(ultima.data_atendimento)}, ${ultima.medico_nome}).`;
    }
  }

  if (motivo && !params.confirmado) {
    throw new AgendaErro(`${mensagem} Agendar o retorno mesmo assim?`, 409, "retorno_confirmar", {
      motivo,
      mensagem: `${mensagem} Agendar o retorno mesmo assim?`,
    });
  }
}
