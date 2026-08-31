import { NavLink, Outlet } from "react-router-dom";
import { PageHeader } from "../../components/PageHeader";
import { temModulo } from "../../lib/permissoes";
import { useAuth } from "../../lib/authContext";

const TABS = [
  { to: "/cobranca", label: "Início", end: true },
  { to: "/cobranca/caixa", label: "Caixa do dia" },
  { to: "/cobranca/contas", label: "Contas do dia" },
  { to: "/cobranca/relatorios", label: "Relatórios", modulo: "cobranca_relatorios" },
  { to: "/cobranca/receber-convenios", label: "Receber convênios", modulo: "cobranca_relatorios" },
  { to: "/cobranca/convenios", label: "Convênios", modulo: "cobranca_config" },
  { to: "/cobranca/procedimentos", label: "Procedimentos", modulo: "cobranca_config" },
  { to: "/cobranca/precos", label: "Tabela de preços", modulo: "cobranca_config" },
] as const;

export function CobrancaLayout() {
  const { permissoes } = useAuth();

  return (
    <div className="page-stack flex-1 min-h-0 overflow-hidden">
      <PageHeader
        title="Cobrança"
        subtitle="Cadastros, contas e caixa da recepção"
      />
      <nav className="cobranca-subnav px-4">
        {TABS.filter(
          (t) => !("modulo" in t) || temModulo(permissoes, t.modulo),
        ).map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={"end" in t ? t.end : false}
            className={({ isActive }) =>
              `cc-aba cobranca-subnav__aba ${isActive ? "cc-aba--ativa" : ""}`
            }
          >
            {t.label}
          </NavLink>
        ))}
      </nav>
      <div className="cobranca-outlet">
        <Outlet />
      </div>
    </div>
  );
}
