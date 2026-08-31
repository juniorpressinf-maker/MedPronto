import {
  default as makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers,
} from "@whiskeysockets/baileys";
import pino from "pino";
import { mkdirSync } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";

const AUTH_DIR = path.join(config.dataDir, "auth");
mkdirSync(AUTH_DIR, { recursive: true });

const logger = pino({ level: "warn" });

export type WhatsAppConnectionStatus =
  | "desconectado"
  | "conectando"
  | "reconectando"
  | "aguardando_qr"
  | "conectado";

type MeInfo = { id: string } | null;

const state = {
  sock: null as ReturnType<typeof makeWASocket> | null,
  status: "desconectado" as WhatsAppConnectionStatus,
  qr: null as string | null,
  me: null as MeInfo,
  listeners: new Set<() => void>(),
};

let starting = false;
let intentionalClose = false;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempt = 0;
let connectWatchdog: ReturnType<typeof setTimeout> | null = null;
const CONNECT_WATCHDOG_MS = 45000;

function emit(): void {
  for (const cb of state.listeners) {
    try {
      cb();
    } catch {
      /* ignore */
    }
  }
}

export function onStatusChange(cb: () => void): () => void {
  state.listeners.add(cb);
  return () => state.listeners.delete(cb);
}

export function getStatus(): {
  status: WhatsAppConnectionStatus;
  qr: string | null;
  me: MeInfo;
} {
  return {
    status: state.status,
    qr: state.qr,
    me: state.me,
  };
}

function setStatus(
  status: WhatsAppConnectionStatus,
  extra: Partial<typeof state> = {},
): void {
  state.status = status;
  if (status !== "conectado" && !("me" in extra)) {
    state.me = null;
  }
  Object.assign(state, extra);
  syncConnectWatchdog(status);
  emit();
}

function clearConnectWatchdog(): void {
  if (connectWatchdog) {
    clearTimeout(connectWatchdog);
    connectWatchdog = null;
  }
}

function syncConnectWatchdog(status: WhatsAppConnectionStatus): void {
  clearConnectWatchdog();
  if (status === "conectado" || status === "aguardando_qr") return;
  if (!["conectando", "reconectando", "desconectado"].includes(status)) return;
  connectWatchdog = setTimeout(() => {
    connectWatchdog = null;
    if (state.status === "conectado" || state.status === "aguardando_qr") return;
    console.log("[whatsapp] sem conexão/QR; gerando novo QR...");
    void forceNewQr().catch((err) => console.error("[whatsapp] forceNewQr:", err));
  }, CONNECT_WATCHDOG_MS);
}

function clearReconnectTimer(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

async function teardownSocket(): Promise<void> {
  const sock = state.sock;
  state.sock = null;
  if (!sock) return;
  intentionalClose = true;
  try {
    sock.ev.removeAllListeners("connection.update");
    sock.ev.removeAllListeners("creds.update");
  } catch {
    /* ignore */
  }
  try {
    await sock.end(undefined);
  } catch {
    /* ignore */
  }
  intentionalClose = false;
}

function disconnectCode(lastDisconnect: unknown): number | null {
  const ld = lastDisconnect as {
    error?: { output?: { statusCode?: number }; code?: number };
  };
  return ld?.error?.output?.statusCode ?? ld?.error?.code ?? null;
}

function shouldClearCreds(code: number | null): boolean {
  return (
    code === DisconnectReason.loggedOut ||
    code === DisconnectReason.badSession ||
    code === DisconnectReason.multideviceMismatch
  );
}

function shouldReconnect(code: number | null): boolean {
  if (code == null) return true;
  if (code === DisconnectReason.loggedOut) return false;
  if (code === DisconnectReason.connectionReplaced) return false;
  if (code === DisconnectReason.forbidden) return false;
  return true;
}

function reconnectDelayMs(code: number | null): number {
  if (code === DisconnectReason.restartRequired) return 500;
  const base = 3000;
  const cap = 30000;
  const attempt = Math.min(reconnectAttempt, 5);
  return Math.min(base * 2 ** attempt, cap);
}

function scheduleReconnect(code: number | null): void {
  if (!shouldReconnect(code)) return;
  clearReconnectTimer();
  if (reconnectAttempt >= 3) {
    console.log("[whatsapp] várias falhas; resetando credenciais.");
    void clearAuthDir()
      .then(() => {
        reconnectAttempt = 0;
        scheduleReconnect(DisconnectReason.restartRequired);
      })
      .catch((err) => console.error("[whatsapp] erro limpando creds:", err));
    return;
  }
  const delay = reconnectDelayMs(code);
  setStatus("reconectando");
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void startClient().catch((err) =>
      console.error("[whatsapp] erro ao reconectar:", err),
    );
  }, delay);
}

async function clearAuthDir(): Promise<void> {
  try {
    await rm(AUTH_DIR, { recursive: true, force: true });
    mkdirSync(AUTH_DIR, { recursive: true });
    console.log("[whatsapp] credenciais limpas em data/auth/");
  } catch (err) {
    console.error(
      "[whatsapp] erro limpando creds:",
      err instanceof Error ? err.message : err,
    );
  }
}

export async function startClient(): Promise<ReturnType<typeof makeWASocket> | null> {
  if (state.sock) return state.sock;
  if (starting) return null;

  clearReconnectTimer();
  starting = true;

  try {
    await teardownSocket();
    setStatus("conectando");

    const { state: authState, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      auth: authState,
      logger,
      printQRInTerminal: false,
      browser: Browsers.appropriate("Desktop"),
      syncFullHistory: false,
      markOnlineOnConnect: false,
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 25000,
      defaultQueryTimeoutMs: 60000,
    });

    state.sock = sock;

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        state.qr = qr;
        setStatus("aguardando_qr");
      }

      if (connection === "connecting") {
        if (state.status !== "aguardando_qr") {
          setStatus(state.me ? "reconectando" : "conectando");
        }
      }

      if (connection === "open") {
        reconnectAttempt = 0;
        state.qr = null;
        const user = sock.user;
        state.me = user?.id ? { id: user.id } : null;
        setStatus("conectado", { me: state.me });
        console.log(`[whatsapp] conectado como ${state.me?.id ?? "?"}`);
      }

      if (connection === "close") {
        if (intentionalClose) return;

        const code = disconnectCode(lastDisconnect);
        console.log(`[whatsapp] conexão caiu (code=${code ?? "?"})`);

        state.qr = null;
        await teardownSocket();

        if (code === DisconnectReason.connectionReplaced) {
          state.me = null;
          setStatus("desconectado");
          return;
        }

        if (shouldClearCreds(code)) {
          await clearAuthDir();
          state.me = null;
        }

        if (!shouldReconnect(code)) {
          setStatus("desconectado");
          if (shouldClearCreds(code)) {
            reconnectAttempt = 0;
            scheduleReconnect(DisconnectReason.restartRequired);
          }
          return;
        }

        reconnectAttempt += 1;
        scheduleReconnect(code);
      }
    });

    return sock;
  } finally {
    starting = false;
  }
}

export function jidFromE164(e164: string): string {
  const digits = String(e164).replace(/\D/g, "");
  if (!digits) throw new Error(`telefone inválido: ${e164}`);
  return `${digits}@s.whatsapp.net`;
}

function requireConnected() {
  if (!state.sock || state.status !== "conectado") {
    throw new Error(
      `WhatsApp não conectado (status=${state.status}). Escaneie o QR em Configurações → WhatsApp.`,
    );
  }
  return state.sock;
}

export async function resolveJid(e164: string): Promise<{
  jid: string | null;
  exists: boolean | null;
}> {
  const sock = requireConnected();
  const base = jidFromE164(e164);
  try {
    const result = await sock.onWhatsApp(base);
    if (!Array.isArray(result) || result.length === 0) {
      return { jid: null, exists: false };
    }
    const r = result[0];
    return { jid: r.jid || base, exists: Boolean(r.exists) };
  } catch {
    return { jid: base, exists: null };
  }
}

export async function sendTextToPhone(telefone: string, text: string): Promise<void> {
  const { jid, exists } = await resolveJid(telefone);
  if (!jid) throw new Error("Número não está no WhatsApp");
  if (exists === false) throw new Error("Número não está no WhatsApp");

  const sock = requireConnected();
  try {
    await sock.presenceSubscribe(jid);
  } catch {
    /* ignore */
  }
  await sock.sendMessage(jid, { text });
}

export async function forceNewQr(): Promise<void> {
  clearReconnectTimer();
  clearConnectWatchdog();
  reconnectAttempt = 0;
  await teardownSocket();
  state.qr = null;
  state.me = null;
  await clearAuthDir();
  setStatus("conectando");
  await startClient();
}

export async function logoutWhatsApp(): Promise<void> {
  clearReconnectTimer();
  clearConnectWatchdog();
  reconnectAttempt = 0;

  const sock = state.sock;
  if (sock) {
    try {
      await sock.logout();
    } catch (err) {
      console.warn(
        "[whatsapp] logout falhou:",
        err instanceof Error ? err.message : err,
      );
    }
  }
  await teardownSocket();

  state.qr = null;
  state.me = null;
  setStatus("desconectado");

  await clearAuthDir();

  setTimeout(() => {
    void startClient().catch((err) =>
      console.error("[whatsapp] erro ao reiniciar pós-logout:", err),
    );
  }, 800);
}
