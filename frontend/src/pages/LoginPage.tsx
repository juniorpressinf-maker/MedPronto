import { Eye, EyeOff } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ClinicaBrandMark } from "../components/ClinicaBrandMark";
import { useAuth } from "../lib/authContext";
import { ApiError, api } from "../lib/api";
import { useMessageBox } from "../lib/messageBoxContext";

export function LoginPage() {
  const { login, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const msg = useMessageBox();
  const restaurado = searchParams.get("restaurado") === "1";
  const info = (location.state as { info?: string } | null)?.info ?? null;
  const [username, setUsername] = useState("");
  const [senha, setSenha] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [podeRecuperarSenha, setPodeRecuperarSenha] = useState(false);

  useEffect(() => {
    void api
      .recuperarSenhaStatus()
      .then((st) => setPodeRecuperarSenha(st.pode_recuperar))
      .catch(() => setPodeRecuperarSenha(false));
  }, []);

  useEffect(() => {
    if (info) void msg.info(info);
  }, [info, msg]);

  useEffect(() => {
    if (!restaurado || authLoading) return;
    void msg.info(
      "Backup restaurado. Use a senha que estava no backup — a sessão anterior foi limpa.",
    );
  }, [restaurado, authLoading, msg]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(username.trim().toLowerCase(), senha);
      navigate("/", { replace: true });
    } catch (err) {
      void msg.error(
        err instanceof ApiError ? err.message : "Erro ao fazer login",
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
        </div>

        <form
          onSubmit={(e) => void submit(e)}
          className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm"
        >
          <h2 className="mb-6 text-lg font-semibold text-slate-800">Entrar</h2>

          <label className="mb-4 block">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              Usuário
            </span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value.trimStart())}
              autoComplete="username"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
              placeholder="login cadastrado (ex.: secretaria)"
            />
          </label>

          <label className="mb-6 block">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              Senha
            </span>
            <div className="relative">
              <input
                type={showPwd ? "text" : "password"}
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 pr-10 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
              <button
                type="button"
                onClick={() => setShowPwd((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </label>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {loading ? "Entrando…" : "Entrar"}
          </button>

          {podeRecuperarSenha ? (
            <p className="mt-4 mb-0 text-center text-sm text-slate-500">
              <Link
                to="/login/recuperar-senha"
                className="text-brand-600 underline"
              >
                Esqueci minha senha
              </Link>
            </p>
          ) : null}
        </form>
      </div>
    </div>
  );
}
