/**
 * Agenda Nova — utilitários de hora no frontend (espelham backend/services/agendaHorario.ts).
 * A validação definitiva é sempre a do backend; aqui é só para avisar cedo.
 */
/** 0 = domingo … 6 = sábado (igual ao backend / strftime('%w')). */
export const DIAS_SEMANA = [
  { dia: 1, curto: "Seg", nome: "Segunda" },
  { dia: 2, curto: "Ter", nome: "Terça" },
  { dia: 3, curto: "Qua", nome: "Quarta" },
  { dia: 4, curto: "Qui", nome: "Quinta" },
  { dia: 5, curto: "Sex", nome: "Sexta" },
  { dia: 6, curto: "Sáb", nome: "Sábado" },
  { dia: 0, curto: "Dom", nome: "Domingo" },
] as const;

export const INTERVALOS_MINUTOS = [5, 10, 15, 20, 30, 60] as const;

const RE_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const RE_HORA_FIM = /^(([01]\d|2[0-3]):[0-5]\d|24:00)$/;

export function horaValida(h: string): boolean {
  return RE_HORA.test(h);
}

export function horaFimValida(h: string): boolean {
  return RE_HORA_FIM.test(h);
}

export function horaParaMinutos(h: string): number {
  const [hh, mm] = h.split(":").map(Number);
  return (hh ?? 0) * 60 + (mm ?? 0);
}

export function formatarDuracao(min: number): string {
  if (min <= 0) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

/** Cores sugeridas (contraste bom com texto branco). O usuário pode escolher qualquer outra. */
export const CORES_SUGERIDAS = [
  "#2563EB", "#7C3AED", "#DB2777", "#DC2626", "#EA580C",
  "#D97706", "#16A34A", "#059669", "#0891B2", "#475569",
] as const;

/** Texto legível (preto/branco) sobre a cor de fundo — contraste WCAG simples. */
export function corTextoSobre(hex: string): "#FFFFFF" | "#0A0A0A" {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#FFFFFF";
  const n = parseInt(m[1]!, 16);
  const canal = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const lum = 0.2126 * canal((n >> 16) & 255) + 0.7152 * canal((n >> 8) & 255) + 0.0722 * canal(n & 255);
  return lum > 0.4 ? "#0A0A0A" : "#FFFFFF";
}
