import { Eye, EyeOff } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ClinicaBrandMark } from "../components/ClinicaBrandMark";
import { useAuth } from "../lib/authContext";
import { ApiError } from "../lib/api";
import { LOGIN_NAO_EMAIL_MSG, loginPareceEmail } from "../lib/login";
import { useMessageBox } from "../lib/messageBoxContext";

export function SetupPage() {
  const { refresh, setupNeeded, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const msg = useMessageBox();
  const [username, setUsername] = useState("admin");
  const [senha, setSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (authLoading || setupNeeded) return;
    navigate("/login", {
      replace: true,
      state: { info: "O administrador já foi criado. Faça login." },
    });
  }, [authLoading, setupNeeded, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loginPareceEmail(username)) {
      void msg.warning(LOGIN_NAO_EMAIL_MSG);
      return;
    }
    if (senha !== confirmar) {
      void msg.warning("As senhas não coincidem");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/setup", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, senha }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new ApiError(data.error ?? "Erro", res.status);
      await refresh();
      let destino = "/clinica/setup";
      try {
        const licRes = await fetch("/api/licenca", { credentials: "include" });
        const lic = (await licRes.json()) as {
          enforced?: boolean;
          status?: string;
        };
        if (lic.enforced === true && lic.status !== "ok") {
          destino = `/licenca?next=${encodeURIComponent("/clinica/setup")}`;
        }
      } catch {
        /* segue para clinica */
      }
      navigate(destino, { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        await refresh();
        navigate("/login", {
          replace: true,
          state: { info: "O administrador já existe. Faça login." },
        });
        return;
      }
      void msg.error(
        err instanceof ApiError ? err.message : "Erro ao criar usuário",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)]">
      <div className="w-full max-w-sm p-4">
        <div className="mb-8 flex flex-col items-center gap-3 text-center login-brand">
          <ClinicaBrandMark size="lg" tone="light" />
          <p className="text-sm text-[var(--muted)]">Configuração inicial</p>
        </div>

        <form
          onSubmit={(e) => void submit(e)}
          autoComplete="off"
          className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm"
        >
          <div className="sr-only" aria-hidden="true">
            <input type="text" name="fake-user" autoComplete="username" tabIndex={-1} />
            <input
              type="password"
              name="fake-pass"
              autoComplete="current-password"
              tabIndex={-1}
            />
          </div>
          <h2 className="mb-2 text-lg font-semibold text-slate-800">
            Criar administrador
          </h2>
          <p className="mb-6 text-sm text-slate-500">
            Primeira execução — defina o login e a senha do administrador do
            MedPronto. Não use o e-mail da clínica; ele será pedido na tela
            seguinte, só para recuperação de senha.
          </p>

          <label className="mb-4 block">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              Nome de usuário
            </span>
            <input
              name="medpronto_admin_login"
              value={username}
              onChange={(e) => setUsername(e.target.value.replace(/\s+/g, ""))}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              readOnly
              onFocus={(e) => e.currentTarget.removeAttribute("readOnly")}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </label>

          <label className="mb-4 block">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              Senha (mínimo 6 caracteres)
            </span>
            <div className="relative">
              <input
                name="medpronto_admin_senha"
                type={showPwd ? "text" : "password"}
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                autoComplete="new-password"
                readOnly
                onFocus={(e) => e.currentTarget.removeAttribute("readOnly")}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 pr-10 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
              <button
                type="button"
                onClick={() => setShowPwd((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
              >
                {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </label>

          <label className="mb-6 block">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              Confirmar senha
            </span>
            <input
              name="medpronto_admin_senha_conf"
              type={showPwd ? "text" : "password"}
              value={confirmar}
              onChange={(e) => setConfirmar(e.target.value)}
              autoComplete="new-password"
              readOnly
              onFocus={(e) => e.currentTarget.removeAttribute("readOnly")}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {loading ? "Criando…" : "Criar administrador e entrar"}
          </button>

          <p className="mt-4 mb-0 text-center text-sm text-slate-500">
            Já configurou?{" "}
            <Link to="/login" className="text-brand-600 underline">
              Fazer login
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
