import { useLocation } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { PLACEHOLDER_ROUTES } from "../config/navigation";

export function PlaceholderPage() {
  const location = useLocation();
  const mensagem =
    PLACEHOLDER_ROUTES[location.pathname] ??
    "Módulo previsto no plano de desenvolvimento.";

  return (
    <div className="page-stack flex-1 min-h-0 overflow-hidden">
      <PageHeader title="Em desenvolvimento" subtitle={mensagem} />
      <div className="px-4 pb-4">
        <div className="est-card est-card--page p-6">
          <p className="text-[var(--muted)]">
            Esta tela será implementada conforme{" "}
            <code>docs/Plano_MedPronto_v2.md</code>.
          </p>
        </div>
      </div>
    </div>
  );
}
