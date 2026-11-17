/**
 * Erro de domínio da Agenda Nova.
 *
 * `codigo` permite à tela tratar casos que pedem confirmação do usuário
 * (ex.: 'horario_bloqueado' → "Agendar mesmo assim?"), no mesmo padrão do
 * 409 'retorno_vigente' já usado em POST /agendamentos.
 */
export type CodigoErroAgenda =
  | "invalido"
  | "nao_encontrado"
  | "sem_permissao"
  | "conflito"
  | "horario_bloqueado"
  | "tipo_incompativel"
  | "retorno_confirmar"
  | "nao_remarcavel"
  | "dia_especial";

export class AgendaErro extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
    readonly codigo: CodigoErroAgenda = "invalido",
    readonly dados?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AgendaErro";
  }

  paraJson(): Record<string, unknown> {
    return { error: this.message, codigo: this.codigo, ...(this.dados ?? {}) };
  }
}

/**
 * Converte violações de CHECK/trigger/FK do SQLite (046) em AgendaErro 400,
 * preservando a mensagem dos RAISE(ABORT, '...'). Outros erros seguem adiante.
 */
export function traduzirErroSqlite(e: unknown): never {
  if (e instanceof AgendaErro) throw e;
  const err = e as { code?: string; message?: string };
  const code = err.code ?? "";
  if (code === "SQLITE_CONSTRAINT_TRIGGER") {
    throw new AgendaErro(err.message ?? "Operação recusada pelo banco");
  }
  if (code === "SQLITE_CONSTRAINT_CHECK") {
    throw new AgendaErro("Valor inválido para o campo informado");
  }
  if (code === "SQLITE_CONSTRAINT_FOREIGNKEY") {
    throw new AgendaErro("Referência inexistente (médico, tipo ou usuário)");
  }
  if (code === "SQLITE_CONSTRAINT_UNIQUE") {
    throw new AgendaErro("Já existe um registro com esse nome", 409, "conflito");
  }
  throw e;
}
