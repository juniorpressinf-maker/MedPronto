/** Caminho interno da SPA — bloqueia open redirect. */
export function isSafeAppPath(path: string): boolean {
  const p = path.trim();
  if (!p.startsWith("/") || p.startsWith("//")) return false;
  if (p.includes("://")) return false;
  if (p.includes("\\")) return false;
  return p.length <= 512;
}
