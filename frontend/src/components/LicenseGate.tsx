import { useEffect, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

type LicResp = {
  status: string;
  enforced?: boolean;
};

const ALLOWED_WHEN_BLOCKED = [
  "/licenca",
  "/setup",
  "/login",
  "/login/recuperar-senha",
];

function pathAllowed(path: string): boolean {
  return ALLOWED_WHEN_BLOCKED.some(
    (p) => path === p || path.startsWith(`${p}/`),
  );
}

export function LicenseGate({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [state, setState] = useState<"loading" | "ok" | "blocked">("loading");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch("/api/licenca", { credentials: "include" });
        const data = (await r.json()) as LicResp;
        if (cancelled) return;
        if (data.enforced !== true) {
          setState("ok");
          return;
        }
        if (data.status === "ok") {
          setState("ok");
        } else {
          setState("blocked");
        }
      } catch {
        if (!cancelled) setState("ok");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [location.pathname]);

  if (state === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)]">
        <div className="text-[var(--muted)]">Carregando…</div>
      </div>
    );
  }

  if (state === "blocked" && !pathAllowed(location.pathname)) {
    return <Navigate to="/licenca" replace />;
  }

  return <>{children}</>;
}
