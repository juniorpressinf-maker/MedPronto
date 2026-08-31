import { isSafeAppPath } from "./appPath";
import { isDataIsoValida } from "./dataIso";

export type VistaAgenda = "mes" | "dia";

export function hojeIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function isMesIso(mes: string): boolean {
  if (!/^\d{4}-\d{2}$/.test(mes)) return false;
  const [y, m] = mes.split("-").map(Number);
  return m >= 1 && m <= 12 && y >= 2000 && y <= 2100;
}

export function mesAtualIso(): string {
  return hojeIso().slice(0, 7);
}

export function mesDeData(data: string): string {
  return data.slice(0, 7);
}

export function addMesIso(mes: string, delta: number): string {
  const [y, m] = mes.split("-").map(Number);
  const dt = new Date(y, m - 1 + delta, 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
}

type AgendaQuery = {
  medicoId?: number | "";
  voltar?: string | null;
  semana?: string | null;
};

function appendComum(sp: URLSearchParams, q: AgendaQuery) {
  if (q.medicoId) sp.set("medico_id", String(q.medicoId));
  if (q.voltar && isSafeAppPath(q.voltar)) sp.set("voltar", q.voltar);
  if (q.semana && isDataIsoValida(q.semana)) sp.set("semana", q.semana);
}

export function agendaMesPath(mes: string, q: AgendaQuery = {}): string {
  const sp = new URLSearchParams();
  sp.set("vista", "mes");
  if (isMesIso(mes)) sp.set("mes", mes);
  appendComum(sp, q);
  return `/agenda?${sp}`;
}

export function agendaDiaPath(data: string, q: AgendaQuery = {}): string {
  const sp = new URLSearchParams();
  sp.set("vista", "dia");
  sp.set("data", isDataIsoValida(data) ? data : hojeIso());
  appendComum(sp, q);
  return `/agenda?${sp}`;
}

export function resolverVistaAgenda(sp: URLSearchParams): VistaAgenda {
  const vista = sp.get("vista");
  if (vista === "mes") return "mes";
  if (vista === "dia") return "dia";
  if (sp.get("data")) return "dia";
  return "mes";
}

export function lerVoltarAgenda(sp: URLSearchParams, fallback: string): string {
  const v = sp.get("voltar");
  if (v && isSafeAppPath(v)) return v;
  return fallback;
}

export function lerSemanaAgenda(sp: URLSearchParams): string {
  const raw = sp.get("semana");
  if (!raw || !isDataIsoValida(raw)) return "";
  return raw;
}

export function lerMedicoIdAgenda(sp: URLSearchParams): number | "" {
  const raw = sp.get("medico_id");
  if (!raw) return "";
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : "";
}
