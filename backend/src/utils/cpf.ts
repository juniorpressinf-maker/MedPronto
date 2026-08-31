/** Normaliza CPF para 11 dígitos ou null se vazio. */
export function normalizarCpf(valor: string | null | undefined): string | null {
  if (valor == null) return null;
  const digits = valor.replace(/\D/g, "");
  if (!digits) return null;
  return digits;
}

/** Valida dígitos verificadores do CPF (11 números, não sequência repetida). */
export function cpfValido(digits: string): boolean {
  if (!/^\d{11}$/.test(digits)) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;

  const calc = (base: string, fator: number) => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) {
      soma += Number(base[i]) * (fator - i);
    }
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  const d1 = calc(digits.slice(0, 9), 10);
  const d2 = calc(digits.slice(0, 10), 11);
  return d1 === Number(digits[9]) && d2 === Number(digits[10]);
}

export function prepararCpfParaGravacao(
  valor: string | null | undefined,
): { cpf: string | null; erro?: string } {
  const digits = normalizarCpf(valor);
  if (!digits) return { cpf: null };
  if (!cpfValido(digits)) {
    return { cpf: null, erro: "CPF inválido" };
  }
  return { cpf: digits };
}

/** Formata 11 dígitos para exibição 000.000.000-00 */
export function formatarCpf(digits: string | null | undefined): string | null {
  const d = normalizarCpf(digits);
  if (!d || d.length !== 11) return d ?? null;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}
