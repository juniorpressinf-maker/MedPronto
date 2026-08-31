import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../lib/authContext";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { me, loading, setupNeeded, clinicaNeeded } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)]">
        <div className="text-[var(--muted)]">Carregando…</div>
      </div>
    );
  }

  if (setupNeeded) return <Navigate to="/setup" replace />;
  if (!me) return <Navigate to="/login" replace />;
  if (clinicaNeeded && location.pathname !== "/clinica/setup") {
    return <Navigate to="/clinica/setup" replace />;
  }
  return <>{children}</>;
}
