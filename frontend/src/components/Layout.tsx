import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/authContext";
import { navigation, type NavItem } from "../config/navigation";
import { filtrarNavegacao, temModulo } from "../lib/permissoes";
import { api } from "../lib/api";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, LogOut } from "lucide-react";
import { ClinicaBrandMark } from "./ClinicaBrandMark";
import {
  loadNavTreeOpen,
  navBranchKey,
  saveNavTreeOpen,
  type NavTreeOpenMap,
} from "../lib/navTreeState";

function pathInItem(item: NavItem, pathname: string): boolean {
  if (item.path) {
    if (item.path === "/") return pathname === "/";
    return pathname === item.path || pathname.startsWith(`${item.path}/`);
  }
  return item.children?.some((c) => pathInItem(c, pathname)) ?? false;
}

function NavTreeItem({
  item,
  parentKey,
  openBranches,
  setBranchOpen,
}: {
  item: NavItem;
  parentKey: string | null;
  openBranches: NavTreeOpenMap;
  setBranchOpen: (key: string, open: boolean) => void;
}) {
  const location = useLocation();
  const branchKey = navBranchKey(parentKey, item.label);
  const hasChildren = Boolean(item.children?.length);
  const branchActive = pathInItem(item, location.pathname);
  const hasSavedState = Object.prototype.hasOwnProperty.call(openBranches, branchKey);
  const open = hasSavedState ? openBranches[branchKey]! : branchActive;

  useEffect(() => {
    if (!hasChildren || !branchActive || hasSavedState) return;
    setBranchOpen(branchKey, true);
  }, [hasChildren, branchActive, hasSavedState, branchKey, setBranchOpen]);

  if (hasChildren) {
    const Icon = item.icon;
    return (
      <div className="nav-tree-node">
        <button
          type="button"
          className={`nav-tree-branch${branchActive ? " nav-tree-branch--active" : ""}`}
          onClick={() => setBranchOpen(branchKey, !open)}
          aria-expanded={open}
        >
          <ChevronRight
            className={`nav-tree-branch__chevron${open ? " nav-tree-branch__chevron--open" : ""}`}
            aria-hidden
          />
          {Icon && <Icon className="h-4 w-4 shrink-0 opacity-85" />}
          <span className="min-w-0 truncate">{item.label}</span>
          {item.badge && <span className="nav-tree-badge">{item.badge}</span>}
        </button>
        {open && (
          <div className="nav-tree-children">
            {item.children!.map((child) => (
              <NavTreeItem
                key={child.label}
                item={child}
                parentKey={branchKey}
                openBranches={openBranches}
                setBranchOpen={setBranchOpen}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  if (!item.path) return null;

  const Icon = item.icon;
  return (
    <NavLink
      to={item.path}
      end
      className={({ isActive }) =>
        `app-nav-link${isActive ? " app-nav-link--active" : ""}`
      }
    >
      {Icon && <Icon className="h-4 w-4 shrink-0" />}
      <span className="min-w-0 truncate">{item.label}</span>
      {item.badge && <span className="nav-tree-badge">{item.badge}</span>}
    </NavLink>
  );
}

export function Layout() {
  const { permissoes, me, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [dbOk, setDbOk] = useState<boolean | null>(null);
  const [servidorEndpoint, setServidorEndpoint] = useState<string | null>(null);
  const [openBranches, setOpenBranches] = useState<NavTreeOpenMap>(loadNavTreeOpen);
  const navItems = useMemo(
    () => filtrarNavegacao(navigation, permissoes),
    [permissoes],
  );
  const podeClinica = temModulo(permissoes, "clinica");
  const clinicaAtiva = location.pathname.startsWith("/configuracoes/clinica");

  const sair = useCallback(async () => {
    await logout();
    navigate("/login", { replace: true });
  }, [logout, navigate]);

  const setBranchOpen = useCallback((key: string, open: boolean) => {
    setOpenBranches((prev) => {
      const next = { ...prev, [key]: open };
      saveNavTreeOpen(next);
      return next;
    });
  }, []);

  useEffect(() => {
    api.health().then(
      (h) => {
        setDbOk(h.ok);
        const port = h.port || Number(window.location.port) || 3021;
        const lan = h.lan_ips?.filter(Boolean) ?? [];
        const host =
          lan[0] ||
          window.location.hostname ||
          "127.0.0.1";
        const extras =
          lan.length > 1 ? lan.slice(1).map((ip) => `${ip}:${port}`) : [];
        const principal = `${host}:${port}`;
        setServidorEndpoint(
          extras.length > 0
            ? [principal, ...extras].join(" · ")
            : principal,
        );
      },
      () => {
        setDbOk(false);
        const port = Number(window.location.port) || 3021;
        const host = window.location.hostname || "127.0.0.1";
        setServidorEndpoint(`${host}:${port}`);
      },
    );
  }, []);

  return (
    <div className="app-shell flex min-h-screen">
      <aside className="app-sidebar flex w-64 shrink-0 flex-col">
        <button
          type="button"
          className={`app-top-brand app-top-brand--link px-4 py-4${
            clinicaAtiva ? " app-top-brand--active" : ""
          }${!podeClinica ? " app-top-brand--link-disabled" : ""}`}
          onClick={() => {
            if (podeClinica) navigate("/configuracoes/clinica");
          }}
          title={
            podeClinica
              ? "Abrir cadastro da clínica"
              : "Cadastro da clínica (sem permissão)"
          }
          aria-label="Cadastro da clínica"
        >
          <ClinicaBrandMark size="md" stackProgramAndClinic tone="dark" />
        </button>
        <nav className="app-nav flex-1 overflow-y-auto px-2 py-3">
          {navItems.map((item) => (
            <NavTreeItem
              key={item.label}
              item={item}
              parentKey={null}
              openBranches={openBranches}
              setBranchOpen={setBranchOpen}
            />
          ))}
        </nav>
        <div className="app-sidebar-footer px-4 py-3 text-xs text-[var(--nav-text)] opacity-80 border-t border-[#1e3a5f]">
          {me ? (
            <div className="mb-2 truncate font-medium opacity-95">{me.username}</div>
          ) : null}
          <button
            type="button"
            className="app-sidebar-logout"
            onClick={() => void sair()}
          >
            <LogOut className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Sair
          </button>
          <div className="mt-2">
            Banco:{" "}
            {dbOk === null ? "…" : dbOk ? "conectado" : "erro"}
          </div>
          {servidorEndpoint ? (
            <div className="mt-1 font-mono text-[0.7rem] opacity-90 break-all">
              {servidorEndpoint}
            </div>
          ) : null}
        </div>
      </aside>
      <main className="app-main flex flex-1 flex-col min-h-0 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
