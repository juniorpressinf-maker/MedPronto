import { isDataIsoValida } from "./dataIso";

export type CelulaAgendaMes = {
  iso: string;
  dia: number;
  foraDoMes: boolean;
};

/** Grade 6×7, semana começa na segunda. */
export function celulasDoMes(mesIso: string): CelulaAgendaMes[] {
  const [y, m] = mesIso.split("-").map(Number);
  const primeiro = new Date(y, m - 1, 1);
  const offsetSeg = (primeiro.getDay() + 6) % 7;
  const inicio = new Date(y, m - 1, 1 - offsetSeg);
  const cells: CelulaAgendaMes[] = [];
  for (let i = 0; i < 42; i++) {
    const dt = new Date(inicio);
    dt.setDate(inicio.getDate() + i);
    const iso = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
    cells.push({
      iso,
      dia: dt.getDate(),
      foraDoMes: dt.getMonth() !== m - 1,
    });
  }
  return cells;
}

export function segundaIsoDaSemana(iso: string): string {
  const dt = new Date(`${iso.slice(0, 10)}T12:00:00`);
  const offset = (dt.getDay() + 6) % 7;
  dt.setDate(dt.getDate() - offset);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

export function isoNaMesmaSemana(a: string, b: string): boolean {
  return segundaIsoDaSemana(a) === segundaIsoDaSemana(b);
}

export function addDiasIso(iso: string, dias: number): string {
  const dt = new Date(`${iso.slice(0, 10)}T12:00:00`);
  dt.setDate(dt.getDate() + dias);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

export function intervaloSemana(segundaIso: string): { de: string; ate: string } {
  const de = segundaIsoDaSemana(segundaIso);
  return { de, ate: addDiasIso(de, 6) };
}

export function tituloSemanaPt(segundaIso: string): string {
  const { de, ate } = intervaloSemana(segundaIso);
  const fmt = (iso: string) => {
    const [, m, d] = iso.split("-");
    return `${d}/${m}`;
  };
  return `${fmt(de)} a ${fmt(ate)}`;
}

export function intervaloGradeMes(mesIso: string): { de: string; ate: string } {
  const cells = celulasDoMes(mesIso);
  return { de: cells[0]!.iso, ate: cells[41]!.iso };
}

export function intervaloMesCivil(mesIso: string): { de: string; ate: string } {
  const [y, m] = mesIso.split("-").map(Number);
  const ultimo = new Date(y, m, 0).getDate();
  const mm = String(m).padStart(2, "0");
  return {
    de: `${y}-${mm}-01`,
    ate: `${y}-${mm}-${String(ultimo).padStart(2, "0")}`,
  };
}

export function tituloMesPt(mesIso: string): string {
  const [y, m] = mesIso.split("-").map(Number);
  const nome = new Date(y, m - 1, 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
  return nome.charAt(0).toUpperCase() + nome.slice(1);
}

export function diasEntreIso(de: string, ate: string): number {
  if (!isDataIsoValida(de) || !isDataIsoValida(ate)) return 0;
  const a = new Date(`${de}T12:00:00`);
  const b = new Date(`${ate}T12:00:00`);
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}
