/** Retorna mensagem de erro ou null se válido/vazio. */
export function validarEmailOpcional(valor: string): string | null {
  const t = valor.trim();
  if (!t) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) {
    return "E-mail inválido";
  }
  return null;
}

/** Retorna mensagem de erro ou null se válido/vazio. */
export function validarTelefoneOpcional(valor: string): string | null {
  const digits = valor.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length < 10) {
    return "Telefone incompleto (mínimo 10 dígitos)";
  }
  return null;
}
