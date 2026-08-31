import fs from "node:fs";
import path from "node:path";

import { config } from "../config.js";
import { dbHealth } from "../db/index.js";

function resolveProjectRoot(): string {
  const fromEnv = process.env.MEDPRONTO_ROOT?.trim();
  if (fromEnv) return fromEnv;
  return config.rootDir;
}

export function readStartupStatusFile(): { message: string; time: string | null } {
  const file = path.join(resolveProjectRoot(), "data", "status.txt");
  try {
    const raw = fs.readFileSync(file, "utf8").trim();
    if (!raw) return { message: "Preparando sistema…", time: null };
    const m = raw.match(/^\[(\d{2}:\d{2}:\d{2})\]\s*(.+)$/);
    if (m) return { message: m[2], time: m[1] };
    return { message: raw, time: null };
  } catch {
    return { message: "Preparando sistema…", time: null };
  }
}

export function isLoginPageReady(): boolean {
  const dist = path.join(config.rootDir, "frontend", "dist", "index.html");
  if (!fs.existsSync(dist)) return false;
  const db = dbHealth();
  return db.ok;
}
