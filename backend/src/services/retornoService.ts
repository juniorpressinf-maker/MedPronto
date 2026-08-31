import { getDb } from "../db/index.js";

export type RetornoVigente = {
  prontuario_id: number;
  paciente_id: number;
  medico_id: number;
  medico_nome: string;
  retorno_dias: number;
  retorno_ate: string;
  data_atendimento: string;
  dias_restantes: number;
};

function hojeLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseDataLocal(iso: string): Date {
  const base = iso.trim().slice(0, 10);
  return new Date(`${base}T12:00:00`);
}

export function calcularRetornoAte(
  dataAtendimento: string,
  dias: number,
): string {
  const d = parseDataLocal(dataAtendimento);
  d.setDate(d.getDate() + dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function diasEntre(inicio: string, fim: string): number {
  const a = parseDataLocal(inicio).getTime();
  const b = parseDataLocal(fim).getTime();
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

export function getRetornoVigente(
  pacienteId: number,
): RetornoVigente | null {
  const hoje = hojeLocal();
  const row = getDb()
    .prepare(
      `SELECT pr.id AS prontuario_id, pr.paciente_id, pr.medico_id, pr.retorno_dias,
              pr.retorno_ate, pr.data_atendimento, u.nome AS medico_nome
       FROM prontuarios pr
       JOIN usuarios u ON u.id = pr.medico_id
       WHERE pr.paciente_id = ?
         AND pr.retorno_ate IS NOT NULL
         AND pr.retorno_ate >= ?
         AND (
           (pr.retificacao_de_id IS NOT NULL AND pr.retificacao_finalizada = 1)
           OR (
             pr.retificacao_de_id IS NULL
             AND (
               pr.agendamento_id IS NULL
               OR EXISTS (
                 SELECT 1 FROM agendamentos a
                 WHERE a.id = pr.agendamento_id AND a.status = 'finalizado'
               )
             )
           )
         )
       ORDER BY pr.retorno_ate DESC
       LIMIT 1`,
    )
    .get(pacienteId, hoje) as
    | {
        prontuario_id: number;
        paciente_id: number;
        medico_id: number;
        medico_nome: string;
        retorno_dias: number;
        retorno_ate: string;
        data_atendimento: string;
      }
    | undefined;

  if (!row) return null;

  return {
    ...row,
    dias_restantes: diasEntre(hoje, row.retorno_ate),
  };
}
