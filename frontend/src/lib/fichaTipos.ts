/** Tipos de campo — espelha backend/services/fichasTemplate.ts e docs §5.1 */

export const FICHA_TIPOS_CAMPO = [
  "textarea",
  "text",
  "busca",
  "sim_nao",
  "checkbox",
  "marcadores",
  "escolha",
  "cid",
  "retorno",
] as const;

export type FichaCampoTipo = (typeof FICHA_TIPOS_CAMPO)[number];

export type FichaCampoDef = {
  id: string;
  label: string;
  tipo: FichaCampoTipo;
  ordem: number;
  obrigatorio?: boolean;
  opcoes?: string[];
  /** Texto bruto no editor (só UI — preserva Enter / linha em branco) */
  opcoesTexto?: string;
  placeholder?: string;
};

export const FICHA_TIPO_LABELS: Record<FichaCampoTipo, string> = {
  textarea: "Texto longo",
  text: "Texto curto",
  busca: "Busca (texto)",
  sim_nao: "Sim / Não",
  checkbox: "Marcador único",
  marcadores: "Marcadores (várias opções)",
  escolha: "Escolha (uma opção)",
  cid: "CID-10",
  retorno: "Retorno (dias)",
};

export const OPCOES_MARCADORES_PADRAO = ["Opção A", "Opção B"] as const;

export type FichaCampoPosicao = {
  campo_id: string;
  x_pct: number;
  y_pct: number;
  largura_pct: number;
  altura_pct: number;
};

export function defaultPosicoes(campos: FichaCampoDef[]): FichaCampoPosicao[] {
  const ordenados = [...campos].sort((a, b) => a.ordem - b.ordem);
  return ordenados.map((c, i) => ({
    campo_id: c.id,
    x_pct: 5,
    y_pct: Math.min(8 + i * 11, 85),
    largura_pct: 90,
    altura_pct: c.tipo === "textarea" ? 14 : 10,
  }));
}

export function rotuloCampo(tipo: string): string {
  if ((FICHA_TIPOS_CAMPO as readonly string[]).includes(tipo)) {
    return FICHA_TIPO_LABELS[tipo as FichaCampoTipo];
  }
  return tipo;
}

export function slugCampoId(label: string, usados: Set<string>): string {
  let base = label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  if (!base || !/^[a-z]/.test(base)) base = "campo";
  let id = base;
  let n = 2;
  while (usados.has(id)) {
    id = `${base}_${n}`;
    n += 1;
  }
  usados.add(id);
  return id;
}

export function novoCampo(tipo: FichaCampoTipo, ordem: number, existentes: FichaCampoDef[]): FichaCampoDef {
  const usados = new Set(existentes.map((c) => c.id));
  const labels: Record<FichaCampoTipo, string> = {
    textarea: "Novo campo:",
    text: "Campo:",
    busca: "Buscar:",
    sim_nao: "Pergunta:",
    checkbox: "Marcador",
    marcadores: "Marcadores:",
    escolha: "Escolha:",
    cid: "CID-10",
    retorno: "Retorno (dias)",
  };
  const label = labels[tipo];
  const id = slugCampoId(label, usados);
  const campo: FichaCampoDef = { id, label, tipo, ordem };
  if (tipo === "busca") campo.placeholder = "Digite para buscar…";
  if (tipo === "marcadores" || tipo === "escolha") {
    campo.opcoes = [...OPCOES_MARCADORES_PADRAO];
    campo.opcoesTexto = OPCOES_MARCADORES_PADRAO.join("\n");
  }
  return campo;
}

/** Converte texto do editor em opções (ignora linhas vazias). */
export function opcoesFromTexto(texto: string): string[] {
  return texto
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
}

/** Garante opcoes + opcoesTexto coerentes ao editar / pré-visualizar marcadores. */
export function normalizarCampoEditor(c: FichaCampoDef): FichaCampoDef {
  if (c.tipo !== "marcadores" && c.tipo !== "escolha") {
    const { opcoesTexto: _t, opcoes: _o, ...rest } = c;
    return rest;
  }
  const opcoesTexto =
    c.opcoesTexto ??
    (c.opcoes?.length ? c.opcoes.join("\n") : OPCOES_MARCADORES_PADRAO.join("\n"));
  const opcoes = c.opcoes?.length ? [...c.opcoes] : opcoesFromTexto(opcoesTexto);
  const opcoesFinais = opcoes.length ? opcoes : [...OPCOES_MARCADORES_PADRAO];
  return {
    ...c,
    opcoes: opcoesFinais,
    opcoesTexto,
  };
}

/** Aplica troca de tipo no editor — evita opcoes “fantasma” de outro marcador. */
export function aplicarTipoCampo(
  c: FichaCampoDef,
  tipo: FichaCampoTipo,
): FichaCampoDef {
  const base = { ...c, tipo };
  if (tipo === "marcadores" || tipo === "escolha") {
    return normalizarCampoEditor({
      ...base,
      opcoes: undefined,
      opcoesTexto: undefined,
    });
  }
  const { opcoesTexto: _t, opcoes: _o, ...rest } = base;
  if (tipo === "busca" && !rest.placeholder) {
    return { ...rest, placeholder: "Digite para buscar…" };
  }
  return rest;
}

export function normalizarCamposEditor(campos: FichaCampoDef[]): FichaCampoDef[] {
  return campos.map(normalizarCampoEditor);
}

/** Remove campos só do editor antes de gravar na API. */
export function camposParaApi(campos: FichaCampoDef[]): Omit<FichaCampoDef, "opcoesTexto">[] {
  return campos.map(({ opcoesTexto: _t, ...c }) => c);
}

export function validarCamposLocal(campos: FichaCampoDef[]): string | null {
  if (campos.length === 0) return "Inclua pelo menos um campo";
  let cid = 0;
  let retorno = 0;
  const ids = new Set<string>();
  for (const c of campos) {
    if (!c.label.trim()) return "Preencha o rótulo de todos os campos";
    if (ids.has(c.id)) return `ID duplicado: ${c.id}`;
    ids.add(c.id);
    if (c.tipo === "cid") cid += 1;
    if (c.tipo === "retorno") retorno += 1;
    if (c.tipo === "marcadores" || c.tipo === "escolha") {
      if (!c.opcoes?.length) return `Informe opções em "${c.label}"`;
      const uniq = new Set(c.opcoes.map((o) => o.toLowerCase()));
      if (uniq.size !== c.opcoes.length) return `Opções duplicadas em "${c.label}"`;
    }
    if (c.tipo === "checkbox" && c.opcoes?.length) {
      return `"${c.label}": use Marcadores para várias opções`;
    }
  }
  if (cid > 1) return "Só pode haver um campo CID-10";
  if (retorno > 1) return "Só pode haver um campo Retorno";
  return null;
}

export function reordenarCampos(campos: FichaCampoDef[]): FichaCampoDef[] {
  return campos.map((c, i) => ({ ...c, ordem: i + 1 }));
}

/** Ordena pelo campo `ordem` e renumera — editor e prévia usam a mesma sequência. */
export function camposEmOrdem(campos: FichaCampoDef[]): FichaCampoDef[] {
  return reordenarCampos(
    [...campos].sort(
      (a, b) => a.ordem - b.ordem || a.id.localeCompare(b.id),
    ),
  );
}

export function moverCampo(campos: FichaCampoDef[], index: number, dir: -1 | 1): FichaCampoDef[] {
  const sorted = camposEmOrdem(campos);
  const j = index + dir;
  if (j < 0 || j >= sorted.length) return sorted;
  const next = [...sorted];
  [next[index], next[j]] = [next[j], next[index]];
  return reordenarCampos(next);
}
