import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Copy,
  Key,
  Trash2,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ClinicaBrandMark } from "../components/ClinicaBrandMark";
import { PageHeader } from "../components/PageHeader";
import { VoltarLink } from "../components/VoltarButton";
import { ApiError, api } from "../lib/api";
import { useMessageBox } from "../lib/messageBoxContext";
import { loadScreenState, saveScreenState } from "../lib/screenState";

type LicStatus = {
  status:
    | "ok"
    | "expirada"
    | "sem_licenca"
    | "corrompida"
    | "maquina_errada"
    | "relogio_invalido";
  fingerprint?: string;
  cliente?: string;
  expira_em?: string;
  dias_restantes?: number;
  dias_atraso?: number;
  alerta?: "critico" | "aviso" | null;
  motivo?: string;
  esperado?: string;
  recebido?: string;
  enforced?: boolean;
};

function fmtDataBR(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Date(`${iso}T00:00:00Z`).toLocaleDateString("pt-BR");
  } catch {
    return iso;
  }
}

const STATUS_LABEL: Record<LicStatus["status"], string> = {
  ok: "Licenca ativa",
  expirada: "Licenca expirada",
  sem_licenca: "Sem licenca instalada",
  corrompida: "Licenca invalida",
  maquina_errada: "Licenca de outra maquina",
  relogio_invalido: "Data/hora do computador invalida",
};

type Props = {
  standalone?: boolean;
};

export function LicencaPage({ standalone = false }: Props) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const msg = useMessageBox();
  const [lic, setLic] = useState<LicStatus | null>(null);
  const [token, setToken] = useState(
    () => loadScreenState<{ token: string }>("licenca")?.token ?? "",
  );
  const [contraSenha, setContraSenha] = useState("");
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  const carregar = useCallback(() => {
    setLoading(true);
    fetch("/api/licenca", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setLic(d as LicStatus))
      .catch(() =>
        setLic({ status: "corrompida", motivo: "Erro ao consultar licenca" }),
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    if (!standalone || loading || !lic) return;
    if (lic.enforced !== true) {
      navigate("/login", { replace: true });
    }
  }, [standalone, loading, lic, navigate]);

  useEffect(() => {
    saveScreenState("licenca", { token });
  }, [token]);

  async function aplicarContraSenha(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      const r = await api.licencaContraSenha(contraSenha);
      setContraSenha("");
      void msg.success(r.message);
      carregar();
    } catch (err) {
      setErro(
        err instanceof ApiError ? err.message : "Erro ao aplicar contra-senha",
      );
    } finally {
      setSalvando(false);
    }
  }

  async function instalar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      const r = await fetch("/api/licenca", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = (await r.json()) as { error?: string };
      if (!r.ok) throw new Error(data.error ?? "Nao foi possivel instalar");
      setToken("");
      if (standalone) {
        const next = searchParams.get("next");
        const destino =
          next && next.startsWith("/") && !next.startsWith("//")
            ? next
            : "/login";
        navigate(destino, { replace: true });
      } else {
        carregar();
      }
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao instalar");
    } finally {
      setSalvando(false);
    }
  }

  async function remover() {
    if (
      !window.confirm(
        "Remover a licenca instalada? O programa sera bloqueado ate instalar uma nova.",
      )
    ) {
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      const r = await fetch("/api/licenca", {
        method: "DELETE",
        credentials: "include",
      });
      const data = (await r.json()) as { error?: string };
      if (!r.ok) throw new Error(data.error ?? "Nao foi possivel remover");
      carregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao remover");
    } finally {
      setSalvando(false);
    }
  }

  function copiarFingerprint() {
    const fp = lic?.fingerprint;
    if (!fp) return;
    void navigator.clipboard.writeText(fp).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    });
  }

  const cardClass =
    lic?.status === "ok"
      ? "est-card--dup-paga"
      : lic?.status === "expirada" || lic?.status === "relogio_invalido"
        ? "est-card--dup-vencida"
        : lic?.status === "sem_licenca"
          ? "est-card--dup-futura"
          : "est-card--dup-parcial";

  const Icon =
    lic?.status === "ok"
      ? CheckCircle
      : lic?.status === "expirada"
        ? XCircle
        : lic?.status === "sem_licenca"
          ? Clock
          : AlertTriangle;

  const conteudo = (
    <div className="space-y-4">
      {loading ? (
        <p className="text-[var(--muted)]">Carregando…</p>
      ) : lic ? (
        <>
          <div
            className={`est-card est-card--dup ${cardClass} p-4 flex gap-4 items-start`}
          >
            <Icon size={32} className="shrink-0" />
            <div>
              <h2 className="m-0 text-lg font-semibold">
                {STATUS_LABEL[lic.status]}
              </h2>
              {lic.status === "sem_licenca" && lic.enforced === true && (
                <p className="mt-2 mb-0 text-sm text-[var(--muted)]">
                  O programa esta bloqueado ate instalar uma chave valida.
                </p>
              )}
              {lic.status === "expirada" && lic.expira_em && (
                <p className="mt-2 mb-0 text-sm">
                  Expirou em <strong>{fmtDataBR(lic.expira_em)}</strong>
                  {lic.dias_atraso !== undefined && (
                    <span className="text-[var(--danger)] font-semibold">
                      {" "}
                      ({lic.dias_atraso} dia(s) atras)
                    </span>
                  )}
                </p>
              )}
              {lic.cliente && lic.status === "ok" && (
                <p className="mt-1 mb-0">
                  Cliente: <strong>{lic.cliente}</strong>
                </p>
              )}
              {lic.expira_em && lic.status === "ok" && (
                <p className="mt-1 mb-0">
                  Expira em: <strong>{fmtDataBR(lic.expira_em)}</strong>
                  {lic.dias_restantes !== undefined && (
                    <span
                      className={
                        lic.alerta === "critico"
                          ? " text-[var(--danger)] font-semibold"
                          : lic.alerta === "aviso"
                            ? " text-[var(--warn)]"
                            : ""
                      }
                    >
                      {" "}
                      (vence em {lic.dias_restantes} dia
                      {lic.dias_restantes === 1 ? "" : "s"})
                    </span>
                  )}
                </p>
              )}
              {lic.status === "maquina_errada" && (
                <ul className="mt-2 mb-0 pl-4 text-sm space-y-1">
                  <li>
                    Fingerprint desta maquina:{" "}
                    <code>{lic.esperado ?? lic.fingerprint}</code>
                  </li>
                  <li>
                    Fingerprint da chave: <code>{lic.recebido}</code>
                  </li>
                </ul>
              )}
              {lic.motivo && lic.status !== "ok" && (
                <p className="mt-2 mb-0 text-[var(--muted)] text-sm">
                  {lic.motivo}
                </p>
              )}
            </div>
          </div>

          <div className="est-card p-4">
            <h3 className="m-0 text-base font-semibold flex items-center gap-2">
              <Key size={18} />
              Fingerprint desta maquina
            </h3>
            <p className="mt-2 mb-3 text-sm text-[var(--muted)]">
              Envie este codigo ao suporte para gerar a chave (
              <code>MEDPRONTO-...</code>).
            </p>
            <div className="flex flex-wrap gap-2 items-center">
              <code className="legacy-input font-mono text-center flex-1 min-w-[12rem]">
                {lic.fingerprint ?? "—"}
              </code>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={copiarFingerprint}
              >
                <Copy size={16} />
                {copiado ? "Copiado!" : "Copiar"}
              </button>
            </div>
          </div>

          {(lic.status === "expirada" ||
            lic.status === "ok" ||
            lic.status === "relogio_invalido") && (
            <form onSubmit={aplicarContraSenha} className="est-card p-4 space-y-3">
              <h3 className="m-0 text-base font-semibold">Contra-senha (prorrogação)</h3>
              <p className="m-0 text-sm text-[var(--muted)]">
                Código de uso único fornecido pelo suporte para estender a validade
                sem trocar a licença completa.
              </p>
              <label className="legacy-form block">
                <span className="block mb-1 font-medium">Cole a contra-senha</span>
                <input
                  className="legacy-input w-full font-mono text-sm"
                  value={contraSenha}
                  onChange={(e) => setContraSenha(e.target.value)}
                  placeholder="MEDPRONTO-GRACE-..."
                />
              </label>
              <button
                type="submit"
                className="btn btn-secondary"
                disabled={salvando || !contraSenha.trim()}
              >
                {salvando ? "Aplicando…" : "Aplicar contra-senha"}
              </button>
            </form>
          )}

          <form onSubmit={instalar} className="est-card p-4 space-y-3">
            <h3 className="m-0 text-base font-semibold">
              Instalar / atualizar licenca
            </h3>
            <label className="legacy-form block">
              <span className="block mb-1 font-medium">Cole a chave aqui</span>
              <textarea
                className="legacy-input w-full min-h-[88px] font-mono text-sm"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="MEDPRONTO-..."
                required
              />
            </label>
            {erro && (
              <p className="text-[var(--danger)] font-medium m-0">{erro}</p>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                className="btn btn-primary agenda-big-action"
                disabled={salvando || !token.trim()}
              >
                {salvando ? "Instalando…" : "Instalar licenca"}
              </button>
              {lic.status !== "sem_licenca" && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={salvando}
                  onClick={() => void remover()}
                >
                  <Trash2 size={16} />
                  Remover
                </button>
              )}
            </div>
          </form>

          {standalone ? (
            <p className="text-center text-sm text-[var(--muted)] m-0">
              <VoltarLink to="/login" className="text-brand-600 underline">
                Voltar ao login
              </VoltarLink>
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );

  if (standalone) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] p-4">
        <div className="w-full max-w-lg">
          <div className="mb-6 flex flex-col items-center gap-3 text-center login-brand">
            <ClinicaBrandMark size="lg" tone="light" />
            <h1 className="m-0 text-xl font-semibold text-slate-800">
              Licenca de uso
            </h1>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            {conteudo}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-stack flex-1 min-h-0 overflow-hidden">
      <PageHeader
        title="Licenca"
        subtitle="Status da licenca de uso do MedPronto"
        actions={
          <VoltarLink to="/" className="btn btn-primary btn-sm">
            Voltar ao inicio
          </VoltarLink>
        }
      />
      <div className="page-stack flex-1 min-h-0 overflow-hidden p-4">
        <div className="est-card est-card--page flex flex-col min-h-0 overflow-hidden max-w-2xl">
          <div className="est-card--page__area scroll-interno p-4">
            {conteudo}
          </div>
        </div>
      </div>
    </div>
  );
}
