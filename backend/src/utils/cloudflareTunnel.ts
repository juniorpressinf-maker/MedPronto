import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { config } from "../config.js";

type TunnelStatus = "parado" | "iniciando" | "ativo" | "erro";

const state = {
  proc: null as ChildProcess | null,
  status: "parado" as TunnelStatus,
  publicUrl: null as string | null,
  lastError: null as string | null,
  lastLine: null as string | null,
  startedAt: null as string | null,
};

function cloudflaredCandidates(): string[] {
  const list: string[] = [];
  if (process.env.CLOUDFLARED_BIN?.trim()) {
    list.push(process.env.CLOUDFLARED_BIN.trim());
  }
  list.push(path.join(config.rootDir, "bin", "cloudflared.exe"));
  list.push(path.join(config.rootDir, "cloudflared.exe"));
  list.push("cloudflared");
  return list;
}

export function resolveCloudflaredBinary(): string | null {
  for (const p of cloudflaredCandidates().filter((x) => x !== "cloudflared")) {
    if (existsSync(p)) return p;
  }
  try {
    const probe =
      process.platform === "win32"
        ? spawnSync("where", ["cloudflared"], { encoding: "utf8" })
        : spawnSync("which", ["cloudflared"], { encoding: "utf8" });
    const out = String(probe.stdout ?? "")
      .trim()
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (probe.status === 0 && out.length > 0) return out[0] ?? null;
  } catch {
    /* ignore */
  }
  return null;
}

function parsePublicUrl(line: string): string | null {
  const m = line.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
  return m ? m[0] : null;
}

function resetRuntime() {
  state.proc = null;
  state.publicUrl = null;
  state.startedAt = null;
}

export function getTunnelStatus() {
  const bin = resolveCloudflaredBinary();
  return {
    status: state.status,
    publicUrl: state.publicUrl,
    lastError: state.lastError,
    lastLine: state.lastLine,
    startedAt: state.startedAt,
    binaryFound: !!bin,
    binaryPath: bin,
    running: !!state.proc,
  };
}

export function startCloudflaredTunnel(port = config.port) {
  if (state.proc) return getTunnelStatus();

  const bin = resolveCloudflaredBinary();
  if (!bin) {
    state.status = "erro";
    state.lastError =
      "cloudflared não encontrado (copie para bin/cloudflared.exe ou instale no PATH).";
    return getTunnelStatus();
  }

  state.status = "iniciando";
  state.publicUrl = null;
  state.lastError = null;
  state.lastLine = null;
  state.startedAt = new Date().toISOString();

  const args = [
    "tunnel",
    "--url",
    `http://127.0.0.1:${Number(port) || config.port}`,
    "--no-autoupdate",
  ];
  const child = spawn(bin, args, { windowsHide: true });
  state.proc = child;

  const onLine = (buf: Buffer) => {
    const line = String(buf ?? "").trim();
    if (!line) return;
    state.lastLine = line;
    const url = parsePublicUrl(line);
    if (url) {
      state.publicUrl = url;
      state.status = "ativo";
    }
    if (/error|failed|fatal/i.test(line) && state.status !== "ativo") {
      state.status = "erro";
      state.lastError = line;
    }
  };

  child.stdout?.on("data", onLine);
  child.stderr?.on("data", onLine);

  child.on("error", (err) => {
    state.status = "erro";
    state.lastError = err?.message || String(err);
    resetRuntime();
  });

  child.on("exit", (code) => {
    if (state.status !== "erro") {
      state.status = code === 0 ? "parado" : "erro";
      if (code && code !== 0 && !state.lastError) {
        state.lastError = `cloudflared encerrou com código ${code}.`;
      }
    }
    resetRuntime();
  });

  return getTunnelStatus();
}

export function stopCloudflaredTunnel() {
  if (!state.proc) {
    state.status = "parado";
    return getTunnelStatus();
  }
  try {
    state.proc.kill();
  } catch {
    /* ignore */
  }
  state.status = "parado";
  resetRuntime();
  return getTunnelStatus();
}
