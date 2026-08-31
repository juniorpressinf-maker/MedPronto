import {
  Cloud,
  Copy,
  ExternalLink,
  Play,
  ShieldAlert,
  Square,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { ApiError, api, type RemotoTunnelStatus } from "../lib/api";
import { useMessageBox } from "../lib/messageBoxContext";

type LanLink = {
  iface: string;
  address: string;
  netmask: string;
  url: string;
  qrSvg: string;
};

async function copiarTexto(valor: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(valor);
    return;
  }
  const ta = document.createElement("textarea");
  ta.value = valor;
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
}

export function RemotoPage() {
  const msg = useMessageBox();
  const [port, setPort] = useState<number | null>(null);
  const [links, setLinks] = useState<LanLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [tunnel, setTunnel] = useState<RemotoTunnelStatus | null>(null);
  const [tunnelBusy, setTunnelBusy] = useState(false);

  const carregarRede = useCallback(async () => {
    try {
      const data = await api.remotoNetwork();
      setPort(data.port);
      setLinks(data.links);
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro ao carregar rede");
    }
  }, [msg]);

  const carregarTunel = useCallback(async () => {
    try {
      const st = await api.remotoTunnelStatus();
      setTunnel(st);
    } catch {
      /* polling silencioso */
    }
  }, []);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      await carregarRede();
      await carregarTunel();
      setLoading(false);
    })();
  }, [carregarRede, carregarTunel]);

  useEffect(() => {
    const id = window.setInterval(() => void carregarTunel(), 5000);
    return () => window.clearInterval(id);
  }, [carregarTunel]);

  const tunnelOn =
    tunnel?.status === "ativo" ||
    tunnel?.status === "iniciando" ||
    !!tunnel?.running;

  async function iniciarTunel() {
    setTunnelBusy(true);
    try {
      const st = await api.remotoTunnelStart();
      setTunnel(st);
      if (!st.ok && st.erro) void msg.error(st.erro);
      window.setTimeout(() => void carregarTunel(), 1300);
    } catch (e) {
      const detalhe =
        e instanceof ApiError && e.data && typeof e.data === "object"
          ? String((e.data as { erro?: string; lastError?: string }).erro ??
              (e.data as { lastError?: string }).lastError ??
              "")
          : "";
      void msg.error(
        detalhe ||
          (e instanceof ApiError ? e.message : "Erro ao iniciar túnel"),
      );
    } finally {
      setTunnelBusy(false);
    }
  }

  async function pararTunel() {
    setTunnelBusy(true);
    try {
      const st = await api.remotoTunnelStop();
      setTunnel(st);
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro ao parar túnel");
    } finally {
      setTunnelBusy(false);
    }
  }

  async function copiarUrl(valor: string) {
    try {
      await copiarTexto(valor);
      void msg.success("Link copiado");
    } catch {
      void msg.error("Não foi possível copiar");
    }
  }

  return (
    <div className="page-stack flex-1 min-h-0 overflow-hidden">
      <PageHeader
        title="Acesso remoto"
        subtitle="Rede local e túnel Cloudflare para acessar o MedPronto de outro dispositivo"
      />
      <div className="page-stack flex-1 min-h-0 overflow-auto px-4 pb-4 space-y-4 max-w-3xl">
        <div
          className="est-card p-4 border-l-4"
          style={{ borderLeftColor: "var(--warn, #d97706)" }}
        >
          <h2 className="m-0 text-base font-semibold flex items-center gap-2">
            <ShieldAlert className="h-5 w-5" />
            Atenção de segurança
          </h2>
          <p className="m-0 mt-2 text-sm text-[var(--text-2)]">
            Ao compartilhar o link remoto você expõe a tela de login do sistema.
            Use somente com pessoas autorizadas. Em uso externo (túnel), prefira
            sessões curtas e desligue o túnel ao finalizar.
          </p>
        </div>

        {loading ? (
          <p className="text-sm text-[var(--muted)]">Carregando…</p>
        ) : links.length === 0 ? (
          <div className="est-card p-6 text-center space-y-2">
            <WifiOff className="h-10 w-10 mx-auto text-[var(--muted)]" />
            <h3 className="m-0 font-semibold">Nenhum IP de LAN encontrado</h3>
            <p className="m-0 text-sm text-[var(--text-2)]">
              Verifique se o Wi-Fi ou cabo de rede está ativo. Se estiver conectado
              e mesmo assim não aparecer, reinicie o MedPronto.
            </p>
          </div>
        ) : (
          <>
            <p className="m-0 text-sm text-[var(--text-2)]">
              Abra qualquer URL abaixo no celular ou em outro PC da mesma rede.
              {port != null ? (
                <>
                  {" "}
                  Porta em uso: <code>{port}</code>.
                </>
              ) : null}
            </p>
            {links.map((l) => (
              <div key={`${l.iface}-${l.address}`} className="est-card p-4 flex flex-wrap gap-4">
                <div
                  className="shrink-0 rounded border border-[var(--border)] bg-white p-2"
                  dangerouslySetInnerHTML={{ __html: l.qrSvg }}
                />
                <div className="flex-1 min-w-[220px] space-y-2">
                  <h3 className="m-0 text-base font-semibold flex items-center gap-2">
                    <Wifi className="h-4 w-4" />
                    Interface {l.iface}
                  </h3>
                  <p className="m-0 text-sm text-[var(--text-2)]">
                    IP local: <code>{l.address}</code> · máscara:{" "}
                    <code>{l.netmask}</code>
                  </p>
                  <div className="flex flex-wrap gap-2 items-center">
                    <input
                      type="text"
                      readOnly
                      value={l.url}
                      className="legacy-input flex-1 min-w-[200px] text-sm"
                    />
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => void copiarUrl(l.url)}
                    >
                      <Copy className="h-4 w-4" />
                      Copiar
                    </button>
                    <a
                      className="btn btn-secondary"
                      href={l.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Abrir
                    </a>
                  </div>
                  <p className="m-0 text-xs text-[var(--muted)]">
                    Quem receber o link precisa estar na mesma rede Wi-Fi/cabo.
                  </p>
                </div>
              </div>
            ))}
          </>
        )}

        <div className="est-card p-4 space-y-3">
          <h2 className="m-0 text-base font-semibold flex items-center gap-2">
            <Cloud className="h-5 w-5" />
            Acesso pela internet (Cloudflare Tunnel)
          </h2>
          <p className="m-0 text-sm text-[var(--text-2)]">
            Não precisa abrir porta no roteador. O túnel publica sua instalação local
            em uma URL HTTPS temporária.
          </p>

          <div className="flex flex-wrap gap-2 items-center">
            <input
              type="text"
              readOnly
              value={tunnel?.publicUrl ?? ""}
              placeholder="URL pública aparecerá aqui após iniciar o túnel"
              className="legacy-input flex-1 min-w-[200px] text-sm"
            />
            <button
              type="button"
              className="btn btn-secondary"
              disabled={!tunnel?.publicUrl}
              onClick={() => tunnel?.publicUrl && void copiarUrl(tunnel.publicUrl)}
            >
              <Copy className="h-4 w-4" />
              Copiar URL
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={!tunnel?.publicUrl}
              onClick={() =>
                tunnel?.publicUrl &&
                window.open(tunnel.publicUrl, "_blank", "noopener,noreferrer")
              }
            >
              <ExternalLink className="h-4 w-4" />
              Abrir
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-primary"
              disabled={tunnelBusy || tunnelOn}
              onClick={() => void iniciarTunel()}
            >
              <Play className="h-4 w-4" />
              Iniciar túnel
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={tunnelBusy || !tunnelOn}
              onClick={() => void pararTunel()}
            >
              <Square className="h-4 w-4" />
              Parar túnel
            </button>
          </div>

          <p className="m-0 text-sm text-[var(--text-2)]">
            Status: <code>{tunnel?.status ?? "parado"}</code>
            {tunnel?.lastError ? ` — ${tunnel.lastError}` : ""}
          </p>
          {tunnel && !tunnel.binaryFound ? (
            <p className="m-0 text-sm text-[var(--warn, #b45309)]">
              cloudflared não encontrado. Execute{" "}
              <code>scripts\baixar-cloudflared.ps1</code> ou coloque{" "}
              <code>bin\cloudflared.exe</code> na pasta do MedPronto.
            </p>
          ) : null}
          <p className="m-0 text-xs text-[var(--muted)]">
            Encerre o túnel ao terminar e não compartilhe links antigos.
          </p>
        </div>
      </div>
    </div>
  );
}
