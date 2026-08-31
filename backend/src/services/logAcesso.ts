import { getDb } from "../db/index.js";

export function logAcesso(opts: {
  usuarioId?: number | null;
  pacienteId?: number | null;
  acao: string;
  detalhe?: string;
}): void {
  try {
    getDb()
      .prepare(
        `INSERT INTO log_acesso (usuario_id, paciente_id, acao, detalhe)
         VALUES (?, ?, ?, ?)`,
      )
      .run(
        opts.usuarioId ?? null,
        opts.pacienteId ?? null,
        opts.acao,
        opts.detalhe ?? null,
      );
  } catch {
    /* ignora se tabela indisponível */
  }
}
