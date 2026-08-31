import { Navigate, useLocation } from "react-router-dom";
import { moduloParaRota, temModulo } from "../lib/permissoes";
import { useAuth } from "../lib/authContext";

export function ModuloGuard({
  children,
  modulo,
}: {
  children: React.ReactNode;
  modulo?: string | string[];
}) {
  const { me, loading, permissoes } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-[var(--muted)]">Carregando…</div>
      </div>
    );
  }
  if (!me) return <Navigate to="/login" replace />;

  const required = modulo ?? moduloParaRota(location.pathname);
  if (required && !temModulo(permissoes, required)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
