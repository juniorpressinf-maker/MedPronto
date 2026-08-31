/** Primeiro token do nome completo (ex.: "GERVASIO DIAS DO NASCIMENTO" → "GERVASIO"). */
export function primeiroNome(nomeCompleto: string): string {
  const t = nomeCompleto.trim();
  if (!t) return "";
  return t.split(/\s+/)[0] ?? t;
}
