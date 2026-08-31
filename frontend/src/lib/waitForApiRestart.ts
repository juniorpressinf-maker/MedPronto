/** Poll /api/health até a API voltar após restore de backup. */
export function waitForApiRestart(opts?: {
  timeoutMs?: number;
  intervalMs?: number;
  initialDelayMs?: number;
}): Promise<boolean> {
  const timeoutMs = opts?.timeoutMs ?? 180_000;
  const intervalMs = opts?.intervalMs ?? 1000;
  const initialDelayMs = opts?.initialDelayMs ?? 2500;
  const deadline = Date.now() + timeoutMs;

  return new Promise((resolve) => {
    function tick() {
      if (Date.now() >= deadline) {
        resolve(false);
        return;
      }
      fetch("/api/health", { cache: "no-store", credentials: "include" })
        .then((r) => (r.ok ? r.json() : null))
        .then((j: { ok?: boolean } | null) => {
          if (j?.ok) {
            resolve(true);
            return;
          }
          setTimeout(tick, intervalMs);
        })
        .catch(() => setTimeout(tick, intervalMs));
    }
    setTimeout(tick, initialDelayMs);
  });
}
