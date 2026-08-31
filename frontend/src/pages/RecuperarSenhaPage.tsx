import { Eye, EyeOff } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ClinicaBrandMark } from "../components/ClinicaBrandMark";
import { VoltarButton, VoltarLink } from "../components/VoltarButton";
import { ApiError, api } from "../lib/api";
import { useMessageBox } from "../lib/messageBoxContext";

export function RecuperarSenhaPage() {
  const navigate = useNavigate();
  const msg = useMessageBox();
  const [etapa, setEtapa] = useState<1 | 2>(1);
  const [email, setEmail] = useState("");
  const [emailConfirmacao, setEmailConfirmacao] = useState("");
  const [senhaEmail, setSenhaEmail] = useState("");
  const [username, setUsername] = useState("admin");
  const [emailEnviado, setEmailEnviado] = useState("");
  const [codigo, setCodigo] = useState("");
  const [senha, setSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [showSenhaEmail, setShowSenhaEmail] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState(true);
  const [podeRecuperar, setPodeRecuperar] = useState(true);
  const [emailCadastrado, setEmailCadastrado] = useState(false);
  const [emailDica, setEmailDica] = useState<string | null>(null);
  const [nomeClinica, setNomeClinica] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  useEffect(() => {
    setSenhaEmail("");
    void (async () => {
      try {
        const st = await api.recuperarSenhaStatus();
        setPodeRecuperar(st.pode_recuperar);
        setEmailCadastrado(st.email_cadastrado);
        setEmailDica(st.email_dica);
        setNomeClinica(st.nome);
        setStatusMsg(st.mensagem);
        if (st.username) setUsername(st.username);
      } catch {
        setPodeRecuperar(false);
        setStatusMsg(
          "Nao foi possivel carregar os dados. Verifique se o MedPronto esta aberto e tente de novo.",
        );
      } finally {
        setStatusLoading(false);
      }
    })();
  }, []);

  const emailParaEnvio = () =>
    (emailCadastrado ? emailConfirmacao : email).trim();

  const solicitarDesbloqueio = async (e: React.FormEvent) => {
    e.preventDefault();
    const destino = emailParaEnvio();

    if (!emailCadastrado) {
      if (email.trim() !== emailConfirmacao.trim()) {
        void msg.warning("Os e-mails nao coincidem");
        return;
      }
    }
    if (!destino) {
      void msg.warning("Informe o e-mail");
      return;
    }
    if (!senhaEmail.trim()) {
      void msg.warning("Informe a senha do e-mail");
      return;
    }

    setLoading(true);
    try {
      const res = await api.recuperarSenhaSolicitar({
        email: destino,
        username: username.trim(),
        email_senha: senhaEmail,
      });
      setEmailEnviado(destino);
      setCodigo(res.codigo_desbloqueio);
      setSenhaEmail("");
      setEtapa(2);
    } catch (err) {
      void msg.error(
        err instanceof ApiError ? err.message : "Erro ao obter senha de desbloqueio",
      );
    } finally {
      setLoading(false);
    }
  };

  const confirmarRecuperacao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (senha !== confirmarSenha) {
      void msg.warning("As senhas nao coincidem");
      return;
    }
    const codigoNorm = codigo.replace(/-/g, "").trim();
    if (!codigoNorm) {
      void msg.error("Erro interno. Volte e tente novamente.");
      return;
    }
    setLoading(true);
    try {
      await api.recuperarSenhaConfirmar({
        email: emailEnviado,
        username: username.trim(),
        codigo: codigo.trim(),
        senha,
      });
      navigate("/login", {
        replace: true,
        state: { info: "Senha alterada. Entre com a nova senha." },
      });
    } catch (err) {
      void msg.error(
        err instanceof ApiError ? err.message : "Erro ao redefinir senha",
      );
    } finally {
      setLoading(false);
    }
  };

  const formDisabled = statusLoading || !podeRecuperar;

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)]">
      <div className="w-full max-w-sm p-4">
        <div className="mb-8 flex flex-col items-center gap-3 text-center login-brand">
          <ClinicaBrandMark size="lg" tone="light" />
          {nomeClinica ? (
            <p className="text-sm text-[var(--muted)] m-0">{nomeClinica}</p>
          ) : null}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <h2 className="mb-2 text-lg font-semibold text-slate-800">
            Recuperar senha
          </h2>
          <p className="mb-4 text-sm text-slate-500">
            {etapa === 1
              ? "Informe o e-mail e a senha do e-mail cadastrados na clinica."
              : "Escolha uma nova senha para o MedPronto."}
          </p>

          <p className="mb-4 text-xs font-medium text-slate-500">
            Passo {etapa} de 2
          </p>

          {statusLoading ? (
            <p className="mb-4 text-sm text-slate-500">Carregando…</p>
          ) : statusMsg ? (
            <p
              className={`mb-4 text-sm rounded-lg px-3 py-2 border ${
                podeRecuperar
                  ? "text-amber-800 bg-amber-50 border-amber-200"
                  : "text-red-800 bg-red-50 border-red-200"
              }`}
            >
              {statusMsg}
            </p>
          ) : null}

          {etapa === 1 ? (
            <form
              onSubmit={(e) => void solicitarDesbloqueio(e)}
              className="space-y-4"
              autoComplete="off"
            >
              {emailCadastrado && emailDica ? (
                <p className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 m-0">
                  E-mail cadastrado: <strong>{emailDica}</strong>
                </p>
              ) : null}

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Confirme o e-mail cadastrado *
                </span>
                <input
                  type="email"
                  autoFocus
                  value={emailCadastrado ? emailConfirmacao : email}
                  onChange={(e) =>
                    emailCadastrado
                      ? setEmailConfirmacao(e.target.value)
                      : setEmail(e.target.value)
                  }
                  disabled={formDisabled}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:opacity-60"
                  autoComplete="off"
                  required
                />
              </label>

              {!emailCadastrado ? (
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">
                    Confirmar e-mail *
                  </span>
                  <input
                    type="email"
                    value={emailConfirmacao}
                    onChange={(e) => setEmailConfirmacao(e.target.value)}
                    disabled={formDisabled}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:opacity-60"
                    autoComplete="off"
                    required
                  />
                </label>
              ) : null}

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Senha do e-mail *
                </span>
                <div className="relative">
                  <input
                    type={showSenhaEmail ? "text" : "password"}
                    value={senhaEmail}
                    onChange={(e) => setSenhaEmail(e.target.value)}
                    disabled={formDisabled}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 pr-10 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:opacity-60"
                    autoComplete="new-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowSenhaEmail((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    tabIndex={-1}
                  >
                    {showSenhaEmail ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Usuario do MedPronto *
                </span>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={formDisabled}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:opacity-60"
                  autoComplete="off"
                  required
                />
              </label>

              <button
                type="submit"
                disabled={loading || formDisabled}
                className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {loading ? "Verificando…" : "Obter senha de desbloqueio"}
              </button>
            </form>
          ) : (
            <form
              onSubmit={(e) => void confirmarRecuperacao(e)}
              className="space-y-4"
            >
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Nova senha do MedPronto (minimo 6 caracteres) *
                </span>
                <div className="relative">
                  <input
                    type={showPwd ? "text" : "password"}
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                    disabled={loading}
                    autoFocus
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 pr-10 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
                    autoComplete="new-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPwd ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Confirmar nova senha *
                </span>
                <input
                  type={showPwd ? "text" : "password"}
                  value={confirmarSenha}
                  onChange={(e) => setConfirmarSenha(e.target.value)}
                  disabled={loading}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
                  autoComplete="new-password"
                  required
                />
              </label>

              <div className="form-actions mt-2">
                <VoltarButton
                  type="button"
                  disabled={loading}
                  className="rounded-lg border border-slate-300 py-2 px-3 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  onClick={() => {
                    setEtapa(1);
                    setCodigo("");
                    setSenha("");
                    setConfirmarSenha("");
                  }}
                >
                  Voltar
                </VoltarButton>
                <div className="form-actions__direita">
                  <button
                    type="submit"
                    disabled={loading}
                    className="rounded-lg bg-brand-600 py-2.5 px-4 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                  >
                    {loading ? "Salvando…" : "Redefinir senha"}
                  </button>
                </div>
              </div>
            </form>
          )}

          <p className="mt-4 mb-0 text-center text-sm text-slate-500">
            <VoltarLink to="/login" className="text-brand-600 underline">
              Voltar ao login
            </VoltarLink>
          </p>
        </div>
      </div>
    </div>
  );
}
