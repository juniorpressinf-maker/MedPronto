/**
 * Idade em anos e meses ("45 anos e 3 meses", "1 ano", "8 meses", "12 dias").
 * `referencia` = data do atendimento (prontuário antigo mostra a idade daquele dia); padrão hoje.
 */
export function idadeAnosMeses(nascIso: string | null | undefined, referencia?: string | null): string {
  const n = nascIso?.trim().slice(0, 10);
  if (!n || !/^\d{4}-\d{2}-\d{2}$/.test(n)) return "—";
  const hoje = new Date();
  const ref =
    referencia?.trim().slice(0, 10) ||
    `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
  const [ny, nm, nd] = n.split("-").map(Number) as [number, number, number];
  const [ry, rm, rd] = ref.split("-").map(Number) as [number, number, number];
  let meses = (ry - ny) * 12 + (rm - nm);
  if (rd < nd) meses -= 1;
  if (meses < 0) return "—";
  const anos = Math.floor(meses / 12);
  const m = meses % 12;
  if (anos === 0 && m === 0) {
    const dias = Math.round((Date.parse(`${ref}T12:00:00`) - Date.parse(`${n}T12:00:00`)) / 864e5);
    return dias === 1 ? "1 dia" : `${dias} dias`;
  }
  const a = anos === 1 ? "1 ano" : `${anos} anos`;
  const ms = m === 1 ? "1 mês" : `${m} meses`;
  if (anos === 0) return ms;
  if (m === 0) return a;
  return `${a} e ${ms}`;
}
