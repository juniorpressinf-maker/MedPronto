/** Campos travados e rótulos de escolha do ASO — espelha backend/admissional/asoModelo.ts */

import type { FichaCampoDef } from "./fichaTipos";

export const ASO_CAMPO_TRAVADO_IDS = ["tipo_atestado", "conclusao"] as const;

export const ASO_TIPO_ATESTADO_IDS = [
  "admissional",
  "demissional",
  "periodico",
  "retorno_trabalho",
  "mudanca_funcao",
] as const;

export const ASO_CONCLUSAO_IDS = [
  "apto",
  "inapto",
  "apto_com_restricao",
] as const;

export const ASO_ESCOLHA_LABEL: Record<string, string> = {
  admissional: "Admissional",
  demissional: "Demissional",
  periodico: "Periódico",
  retorno_trabalho: "Retorno ao trabalho",
  mudanca_funcao: "Mudança de função",
  apto: "Apto",
  inapto: "Inapto",
  apto_com_restricao: "Apto com restrição",
  apto_altura: "apto para trabalho em altura",
  inapto_altura: "inapto para trabalho em altura",
  nao_aplica: "não se aplica",
};

export function rotuloOpcaoEscolha(valor: string): string {
  return ASO_ESCOLHA_LABEL[valor] ?? valor;
}

export function isCampoTravadoAso(id: string): boolean {
  return (ASO_CAMPO_TRAVADO_IDS as readonly string[]).includes(id);
}

function unirOpcoes(
  atuais: string[] | undefined,
  obrigatorias: readonly string[],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const o of [...obrigatorias, ...(atuais ?? [])]) {
    const t = String(o).trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/** Garante tipo de atestado + conclusão (NR-7), mesmo se a cópia veio sem eles. */
export function garantirCamposTravadosAso(
  campos: FichaCampoDef[],
): FichaCampoDef[] {
  const tipoExist = campos.find((c) => c.id === "tipo_atestado");
  const concExist = campos.find((c) => c.id === "conclusao");
  const meio = campos.filter(
    (c) => c.id !== "tipo_atestado" && c.id !== "conclusao",
  );

  const tipo: FichaCampoDef = {
    id: "tipo_atestado",
    label: tipoExist?.label?.trim() || "Tipo de atestado",
    tipo: "escolha",
    ordem: 1,
    obrigatorio: true,
    opcoes: unirOpcoes(tipoExist?.opcoes, ASO_TIPO_ATESTADO_IDS),
  };
  const conc: FichaCampoDef = {
    id: "conclusao",
    label: concExist?.label?.trim() || "Conclusão",
    tipo: "escolha",
    ordem: meio.length + 2,
    obrigatorio: true,
    opcoes: unirOpcoes(concExist?.opcoes, ASO_CONCLUSAO_IDS),
  };
  const meioRen = meio.map((c, i) => ({ ...c, ordem: i + 2 }));
  return [tipo, ...meioRen, conc];
}

export function validarCamposAsoLocal(
  campos: { id: string; tipo: string; opcoes?: string[] }[],
): string | null {
  const tipo = campos.find((c) => c.id === "tipo_atestado");
  const conc = campos.find((c) => c.id === "conclusao");
  if (!tipo || tipo.tipo !== "escolha") {
    return "Modelo ASO precisa do campo tipo de atestado (escolha)";
  }
  if (!conc || conc.tipo !== "escolha") {
    return "Modelo ASO precisa do campo conclusão (escolha)";
  }
  for (const id of ASO_TIPO_ATESTADO_IDS) {
    if (!tipo.opcoes?.includes(id)) {
      return `tipo_atestado precisa da opção ${id}`;
    }
  }
  for (const id of ASO_CONCLUSAO_IDS) {
    if (!conc.opcoes?.includes(id)) {
      return `conclusao precisa da opção ${id}`;
    }
  }
  if (campos.some((c) => c.tipo === "cid" || c.tipo === "retorno")) {
    return "Modelo ASO não usa CID nem retorno de consulta";
  }
  return null;
}

export function camposCorpoAso<T extends { id: string }>(campos: T[]): T[] {
  return campos.filter((c) => c.id !== "conclusao");
}
