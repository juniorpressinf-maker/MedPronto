import type { ModoClinico } from "./modoClinico";

export type ProcAgenda = {
  id: number;
  nome: string;
  codigo?: string | null;
  modo_clinico: ModoClinico;
};

export function ehConsultaRetorno(p: ProcAgenda): boolean {
  return p.codigo === "RET" || p.nome === "Consulta retorno";
}

export function listaTemModo(
  procs: { modo_clinico: ModoClinico }[],
  modo: ModoClinico,
): boolean {
  return procs.some((p) => p.modo_clinico === modo);
}

/** Null se pode juntar; senão mensagem para a secretária. */
export function motivoNaoJuntarProcedimento(
  atuais: ProcAgenda[],
  novo: ProcAgenda,
): string | null {
  if (novo.modo_clinico === "aso" && listaTemModo(atuais, "prontuario")) {
    return "Não misture consulta e ASO no mesmo horário. Agende o ASO em outro horário.";
  }
  if (novo.modo_clinico === "prontuario" && listaTemModo(atuais, "aso")) {
    return "Não misture ASO e consulta no mesmo horário. Agende a consulta em outro horário.";
  }
  return null;
}

export function badgeClassModoClinico(modo?: ModoClinico | string | null): string {
  if (modo === "aso") return "fila-tipo-badge fila-tipo-badge--admissional";
  if (modo === "nenhum") return "fila-tipo-badge fila-tipo-badge--exame";
  return "fila-tipo-badge fila-tipo-badge--consulta";
}

export type ProcedimentoNaLinha = {
  id: number;
  nome: string;
  modo_clinico: ModoClinico;
  ordem: number;
};

/** Nomes dos procedimentos do horário; se a API antiga só mandar tipo, cai em “Procedimento”. */
export function procedimentosDaLinha(r: {
  procedimentos?: {
    id: number;
    nome: string;
    modo_clinico: ModoClinico | string;
    ordem: number;
  }[];
  procedimento_id?: number | null;
  procedimento_nome?: string | null;
}): ProcedimentoNaLinha[] {
  if (r.procedimentos && r.procedimentos.length > 0) {
    return r.procedimentos.map((p) => ({
      id: p.id,
      nome: p.nome,
      modo_clinico: (p.modo_clinico as ModoClinico) || "nenhum",
      ordem: p.ordem,
    }));
  }
  if (r.procedimento_nome) {
    return [
      {
        id: r.procedimento_id ?? 0,
        nome: r.procedimento_nome,
        modo_clinico: "nenhum",
        ordem: 0,
      },
    ];
  }
  return [{ id: 0, nome: "Procedimento", modo_clinico: "nenhum", ordem: 0 }];
}

export function horarioTemProntuario(
  r: Parameters<typeof procedimentosDaLinha>[0],
): boolean {
  return listaTemModo(procedimentosDaLinha(r), "prontuario");
}

export function horarioTemAso(
  r: Parameters<typeof procedimentosDaLinha>[0],
): boolean {
  return listaTemModo(procedimentosDaLinha(r), "aso");
}

/** Horário só com exames: sem prontuário e sem ASO. Sem lista na API, só se o tipo derivado for exame. */
export function horarioSoExame(r: {
  procedimentos?: {
    modo_clinico: ModoClinico | string;
  }[];
  tipo_atendimento?: string;
}): boolean {
  if (r.procedimentos && r.procedimentos.length > 0) {
    const modos = r.procedimentos.map((p) => ({
      modo_clinico: (p.modo_clinico as ModoClinico) || "nenhum",
    }));
    return !listaTemModo(modos, "prontuario") && !listaTemModo(modos, "aso");
  }
  return r.tipo_atendimento === "exame";
}
