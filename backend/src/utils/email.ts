export function normEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function emailsMatch(a: string, b: string): boolean {
  return normEmail(a) === normEmail(b);
}

export function maskEmail(value: string): string {
  const email = normEmail(value);
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const hint =
    local.length <= 1 ? "*" : `${local[0]}${"*".repeat(Math.min(local.length - 1, 3))}`;
  return `${hint}@${domain}`;
}
