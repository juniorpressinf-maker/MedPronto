import { getDb } from "../db/index.js";
import {
  assertFichaPermitida,
  buildTemplateSnapshot,
  camposFromTemplate,
  FichaProntuarioError,
  getDefaultFichaTemplateId,
  parseDadosJson as parseDadosFichaJson,
  parseTemplateSnapshot,
  snapshotToJson,
  type FichaTemplateRow,
  type TemplateSnapshot,
} from "../services/fichaProntuario.js";
import {
  loadPosicoes,
  type FichaCampoDef,
  type FichaCampoPosicao,
} from "../services/fichasTemplate.js";

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

export const ASO_CAMPO_TRAVADO_IDS = ["tipo_atestado", "conclusao"] as const;

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

export function isAsoLegado(row: {
  aso_template_id?: number | null;
  template_snapshot_json?: string | null;
}): boolean {
  return row.aso_template_id == null && !String(row.template_snapshot_json ?? "").trim();
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

export function validarCamposAso(campos: FichaCampoDef[]): string | null {
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

export function dadosVaziosAso(campos: FichaCampoDef[]): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const c of campos) {
    if (c.tipo === "marcadores") o[c.id] = [];
    else if (c.tipo === "checkbox") o[c.id] = false;
    else if (c.tipo === "escolha") {
      o[c.id] = c.id === "tipo_atestado" ? "admissional" : "";
    } else {
      o[c.id] = "";
    }
  }
  return o;
}

export function parseDadosModeloAso(
  raw: string | null | undefined,
): Record<string, unknown> {
  return parseDadosFichaJson(raw);
}

export function serializarDadosModeloAso(dados: Record<string, unknown>): string {
  return JSON.stringify(dados);
}

export function getDefaultAsoTemplateId(): number | null {
  try {
    return getDefaultFichaTemplateId("aso");
  } catch {
    return null;
  }
}

export function getFichaTemplateRowById(id: number): FichaTemplateRow | undefined {
  return getDb()
    .prepare(`SELECT * FROM fichas_template WHERE id = ?`)
    .get(id) as FichaTemplateRow | undefined;
}

export function resolveAsoTemplateIdNovo(ag: {
  aso_template_id?: number | null;
  medico_id: number;
}): number | null {
  if (ag.aso_template_id != null) {
    assertFichaPermitida(ag.medico_id, ag.aso_template_id, "aso");
    return ag.aso_template_id;
  }
  return getDefaultAsoTemplateId();
}

export function dadosJsonParaNovoAso(templateId: number | null): {
  dadosJson: string;
  asoTemplateId: number | null;
} {
  if (templateId == null) {
    return { dadosJson: "", asoTemplateId: null };
  }
  const ficha = getFichaTemplateRowById(templateId);
  if (!ficha || (ficha.destino ?? "prontuario") !== "aso") {
    return { dadosJson: "", asoTemplateId: null };
  }
  const campos = camposFromTemplate(ficha);
  return {
    dadosJson: serializarDadosModeloAso(dadosVaziosAso(campos)),
    asoTemplateId: templateId,
  };
}

export type AsoModeloEnriquecido = {
  aso_template_id: number | null;
  aso_titulo_documento: string;
  aso_modo: string;
  aso_campos: FichaCampoDef[];
  aso_campos_posicao: FichaCampoPosicao[];
  dados: Record<string, unknown>;
  snapshot: TemplateSnapshot | null;
};

export function enriquecerAdmissionalModelo(row: {
  aso_template_id?: number | null;
  template_snapshot_json?: string | null;
  dados_json?: string | null;
  status: string;
}): AsoModeloEnriquecido | null {
  if (isAsoLegado(row)) return null;

  const snapshot = parseTemplateSnapshot(row.template_snapshot_json);

  let asoTemplateId = row.aso_template_id ?? null;
  let titulo = "Atestado de Saúde Ocupacional";
  let modo = "secoes";
  let campos: FichaCampoDef[] = [];
  let posicoes: FichaCampoPosicao[] = [];

  if (snapshot) {
    asoTemplateId = snapshot.ficha_template_id || asoTemplateId;
    titulo = snapshot.titulo_documento || titulo;
    modo = snapshot.modo || modo;
    campos = snapshot.campos;
    posicoes = snapshot.posicoes ?? [];
  } else if (asoTemplateId != null) {
    const ficha = getFichaTemplateRowById(asoTemplateId);
    if (!ficha) {
      throw new FichaProntuarioError("Modelo ASO não encontrado", 404);
    }
    titulo = ficha.titulo_documento;
    modo = ficha.modo;
    campos = camposFromTemplate(ficha);
    if (ficha.modo === "pdf_fundo") {
      posicoes = loadPosicoes(ficha.id);
    }
  }

  const dados = parseDadosModeloAso(row.dados_json);
  return {
    aso_template_id: asoTemplateId,
    aso_titulo_documento: titulo,
    aso_modo: modo,
    aso_campos: campos,
    aso_campos_posicao: posicoes,
    dados,
    snapshot,
  };
}

export function snapshotAsoAoFinalizar(row: {
  aso_template_id?: number | null;
  template_snapshot_json?: string | null;
}): string | null {
  if (isAsoLegado(row)) return null;
  if (row.template_snapshot_json?.trim()) return row.template_snapshot_json;
  const id = row.aso_template_id;
  if (id == null) return null;
  const ficha = getFichaTemplateRowById(id);
  if (!ficha) {
    throw new FichaProntuarioError("Modelo ASO não encontrado para snapshot", 400);
  }
  return snapshotToJson(buildTemplateSnapshot(ficha));
}

export function camposCorpoAso(campos: FichaCampoDef[]): FichaCampoDef[] {
  return campos.filter((c) => c.id !== "conclusao");
}

export function listarModelosAsoDisponiveis(medicoId: number): {
  id: number;
  nome: string;
  eh_default: boolean;
}[] {
  const rows = getDb()
    .prepare(
      `SELECT id, nome, eh_default FROM fichas_template
       WHERE destino = 'aso' AND ativo = 1
         AND (medico_id IS NULL OR medico_id = ?)
       ORDER BY eh_default DESC, medico_id IS NOT NULL, nome COLLATE NOCASE`,
    )
    .all(medicoId) as { id: number; nome: string; eh_default: number }[];
  return rows.map((m) => ({
    id: m.id,
    nome: m.nome,
    eh_default: m.eh_default === 1,
  }));
}
