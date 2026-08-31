import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { ApiError, api } from "./api";

const RESTORE_MARK_KEY = "medpronto:ultima-restauracao";
/** Cookie persiste no perfil Edge/Chrome; sessionStorage some ao fechar a janela. */
const BROWSER_SESSION_KEY = "medpronto:sessao-navegador";
const SERVER_BOOT_KEY = "medpronto:inicio-servidor";

function stripReabrirQuery() {
  const params = new URLSearchParams(window.location.search);
  if (!params.has("reabrir")) return false;
  params.delete("reabrir");
  const qs = params.toString();
  window.history.replaceState(
    null,
    "",
    `${window.location.pathname}${qs ? `?${qs}` : ""}`,
  );
  return true;
}

async function encerrarSessaoNavegador() {
  await fetch("/api/auth/logout", {
    method: "POST",
    credentials: "include",
  }).catch(() => undefined);
  sessionStorage.removeItem(BROWSER_SESSION_KEY);
  sessionStorage.removeItem(SERVER_BOOT_KEY);
}

async function syncRestoreMarker() {
  try {
    const h = await api.health();
    const mark = h.restauracao_em ?? null;
    const boot = h.inicio_servidor ?? null;
    const prevBoot = sessionStorage.getItem(SERVER_BOOT_KEY);
    if (boot && prevBoot && prevBoot !== boot) {
      await encerrarSessaoNavegador();
    }
    if (boot) sessionStorage.setItem(SERVER_BOOT_KEY, boot);
    else sessionStorage.removeItem(SERVER_BOOT_KEY);
    if (!mark) return false;
    const prev = localStorage.getItem(RESTORE_MARK_KEY);
    if (prev && prev !== mark) {
      await encerrarSessaoNavegador();
      localStorage.setItem(RESTORE_MARK_KEY, mark);
      return true;
    }
    if (!prev) localStorage.setItem(RESTORE_MARK_KEY, mark);
  } catch {
    /* API ainda subindo */
  }
  return false;
}

export type Perfil = "admin" | "medico" | "secretaria";

export interface Me {
  id: number;
  username: string;
  perfil: Perfil;
  permissoes: string[];
}

interface AuthState {
  me: Me | null;
  loading: boolean;
  setupNeeded: boolean;
  clinicaNeeded: boolean;
  permissoes: string[];
}

interface AuthCtx extends AuthState {
  login: (username: string, senha: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  permissoes: string[];
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    me: null,
    loading: true,
    setupNeeded: false,
    clinicaNeeded: false,
    permissoes: [],
  });

  const refresh = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }));
    try {
      if (stripReabrirQuery()) {
        await encerrarSessaoNavegador();
      }

      await syncRestoreMarker();

      const setupData = (await fetch("/api/auth/setup/needed", {
        credentials: "include",
      })
        .then((r) => r.json())
        .catch(() => ({ needed: false }))) as { needed: boolean };

      if (setupData.needed) {
        setState({
          me: null,
          loading: false,
          setupNeeded: true,
          clinicaNeeded: false,
          permissoes: [],
        });
        return;
      }

      let me = await fetch("/api/auth/me", { credentials: "include" })
        .then((r) => (r.ok ? (r.json() as Promise<Me>) : null))
        .catch(() => null);

      if (me && !sessionStorage.getItem(BROWSER_SESSION_KEY)) {
        await encerrarSessaoNavegador();
        me = null;
      }
      if (!me) sessionStorage.removeItem(BROWSER_SESSION_KEY);

      let clinicaNeeded = false;
      if (me) {
        const st = (await fetch("/api/clinica/status", {
          credentials: "include",
        })
          .then((r) => r.json() as Promise<{ exists: boolean }>)
          .catch(() => ({ exists: true }))) as { exists: boolean };
        clinicaNeeded = !st.exists;
      }

      setState({
        me,
        loading: false,
        setupNeeded: false,
        clinicaNeeded,
        permissoes: me?.permissoes ?? [],
      });
    } catch {
      setState({
        me: null,
        loading: false,
        setupNeeded: false,
        clinicaNeeded: false,
        permissoes: [],
      });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(
    async (username: string, senha: string) => {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, senha }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new ApiError(data.error ?? "Erro no login", res.status);
      const h = await api.health().catch(() => null);
      sessionStorage.setItem(BROWSER_SESSION_KEY, "1");
      if (h?.inicio_servidor) {
        sessionStorage.setItem(SERVER_BOOT_KEY, h.inicio_servidor);
      }
      await refresh();
    },
    [refresh],
  );

  const logout = useCallback(async () => {
    await encerrarSessaoNavegador();
    setState({
      me: null,
      loading: false,
      setupNeeded: false,
      clinicaNeeded: false,
      permissoes: [],
    });
  }, []);

  return (
    <Ctx.Provider value={{ ...state, login, logout, refresh }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth fora do AuthProvider");
  return ctx;
}
