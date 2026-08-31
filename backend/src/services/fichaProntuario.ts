import { getDb } from "../db/index.js";
import {
  normalizarCampos,
  type FichaCampoDef,
  loadPosicoes,
  type FichaCampoPosicao,
} from "./fichasTemplate.js";

export type FichaDestino = "prontuario" | "aso";

export type FichaTemplateRow = {
  id: number;
  nome: string;
  titulo_documento: string;
  modo: string;
  campos_json: string;
  medico_id: number | null;
  ativo: number;
  destino?: string | null;
};

export type TemplateSnapshot = {
  ficha_template_id: number;
  nome: string;
  titulo_documento: string;
  modo: string;
  campos: FichaCampoDef[];
  posicoes?: import("./fichasTemplate.js").FichaCampoPosicao[];
};

export type ProntuarioLegado = {
  queixa_principal?: string | null;
  anamnese?: string | null;
  exame_fisico?: string | null;
  hipotese_diagnostica?: string | null;
  conduta?: string | null;
  plano?: string | null;
  cid_codigo?: string | null;
  cid_descricao?: string | null;
  retorno_dias?: number | null;
};

const LEGACY_TEXT_IDS = new Set([
  "queixa_principal",
  "anamnese",
  "exame_fisico",
  "hipotese_diagnostica",
  "conduta",
  "plano",
]);

export class FichaProntuarioError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "FichaProntuarioError";
  }
}

export function getDefaultFichaTemplateId(
  destino: FichaDestino = "prontuario",
): number {
  const row = getDb()
    .prepare(
      `SELECT id FROM fichas_template
       WHERE eh_default = 1 AND medico_id IS NULL AND ativo = 1
         AND destino = ?
       ORDER BY id LIMIT 1`,
    )
    .get(destino) as { id: number } | undefined;
  if (!row) {
    throw new FichaProntuarioError(
      destino === "aso"
        ? "Nenhum modelo ASO padrão da clínica configurado"
        : "Nenhuma ficha padrão da clínica configurada",
      500,
    );
  }
  return row.id;
}

export function getFichaTemplateOrThrow(id: number): FichaTemplateRow {
  const row = getDb()
    .prepare(`SELECT * FROM fichas_template WHERE id = ?`)
    .get(id) as FichaTemplateRow | undefined;
  if (!row) {
    throw new FichaProntuarioError("Ficha clínica não encontrada", 404);
  }
  if (row.ativo !== 1) {
    throw new FichaProntuarioError("Ficha clínica inativa", 400);
  }
  return row;
}

/** I5 — ficha global ou do próprio médico da consulta; destino separado do ASO */
export function assertFichaPermitida(
  medicoId: number,
  fichaTemplateId: number,
  destino: FichaDestino = "prontuario",
): void {
  const ficha = getFichaTemplateOrThrow(fichaTemplateId);
  const dest = (ficha.destino ?? "prontuario") as FichaDestino;
  if (dest !== destino) {
    throw new FichaProntuarioError(
      destino === "aso"
        ? "Este modelo não é de ASO"
        : "Este modelo não é ficha de consulta",
      400,
    );
  }
  if (ficha.medico_id != null && ficha.medico_id !== medicoId) {
    throw new FichaProntuarioError(
      destino === "aso"
        ? "Este modelo ASO pertence a outro médico"
        : "Esta ficha pertence a outro médico e não pode ser usada nesta consulta",
      403,
    );
  }
}

export function resolveFichaTemplateIdFromAgendamento(
  agendamento: { ficha_template_id?: number | null },
): number {
  if (agendamento.ficha_template_id != null) {
    return agendamento.ficha_template_id;
  }
  return getDefaultFichaTemplateId();
}

export function camposFromTemplate(row: FichaTemplateRow): FichaCampoDef[] {
  return normalizarCampos(JSON.parse(row.campos_json || "[]"));
}

export function buildTemplateSnapshot(
  ficha: FichaTemplateRow,
): TemplateSnapshot {
  const snap: TemplateSnapshot = {
    ficha_template_id: ficha.id,
    nome: ficha.nome,
    titulo_documento: ficha.titulo_documento,
    modo: ficha.modo,
    campos: camposFromTemplate(ficha),
  };
  if (ficha.modo === "pdf_fundo") {
    const pos = loadPosicoes(ficha.id);
    if (pos.length) snap.posicoes = pos;
  }
  return snap;
}

export function snapshotToJson(snapshot: TemplateSnapshot): string {
  return JSON.stringify(snapshot);
}

export function parseTemplateSnapshot(
  raw: string | null | undefined,
): TemplateSnapshot | null {
  if (!raw?.trim()) return null;
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const campos = normalizarCampos(o.campos ?? []);
    if (campos.length === 0) return null;
    return {
      ficha_template_id: Number(o.ficha_template_id ?? 0),
      nome: String(o.nome ?? ""),
      titulo_documento: String(o.titulo_documento ?? "Prontuário de consulta"),
      modo: String(o.modo ?? "secoes"),
      campos,
      posicoes: Array.isArray(o.posicoes)
        ? (o.posicoes as FichaCampoPosicao[])
        : undefined,
    };
  } catch {
    return null;
  }
}

export function parseDadosJson(
  raw: string | null | undefined,
): Record<string, unknown> {
  if (!raw?.trim()) return {};
  try {
    const o = JSON.parse(raw);
    if (o && typeof o === "object" && !Array.isArray(o)) {
      return o as Record<string, unknown>;
    }
  } catch {
    /* ignore */
  }
  return {};
}

function valorPadraoCampo(c: FichaCampoDef): unknown {
  switch (c.tipo) {
    case "sim_nao":
      return null;
    case "checkbox":
      return false;
    case "marcadores":
      return [];
    case "escolha":
      return "";
    case "cid":
      return { codigo: "", descricao: "" };
    case "retorno":
      return null;
    default:
      return "";
  }
}

/** Preenche dados_json a partir das colunas legadas (seed default). */
export function legadoParaDadosJson(
  pr: ProntuarioLegado,
  campos: FichaCampoDef[],
): Record<string, unknown> {
  const dados: Record<string, unknown> = {};
  for (const c of campos) {
    if (c.tipo === "cid") {
      dados[c.id] = {
        codigo: pr.cid_codigo ?? "",
        descricao: pr.cid_descricao ?? "",
      };
    } else if (c.tipo === "retorno") {
      dados[c.id] = pr.retorno_dias ?? null;
    } else if (LEGACY_TEXT_IDS.has(c.id)) {
      dados[c.id] = (pr as Record<string, unknown>)[c.id] ?? "";
    } else {
      dados[c.id] = valorPadraoCampo(c);
    }
  }
  return dados;
}

export function dadosTemConteudo(dados: Record<string, unknown>): boolean {
  for (const v of Object.values(dados)) {
    if (v == null) continue;
    if (typeof v === "string" && v.trim()) return true;
    if (typeof v === "number") return true;
    if (typeof v === "boolean" && v) return true;
    if (Array.isArray(v) && v.length > 0) return true;
    if (typeof v === "object" && !Array.isArray(v)) {
      const o = v as { codigo?: string; descricao?: string };
      if (o.codigo?.trim() || o.descricao?.trim()) return true;
    }
  }
  return false;
}

/** Sincroniza colunas legadas a partir de dados_json + definição de campos. */
export function dadosJsonParaLegado(
  dados: Record<string, unknown>,
  campos: FichaCampoDef[],
): ProntuarioLegado {
  const legado: ProntuarioLegado = {
    queixa_principal: null,
    anamnese: null,
    exame_fisico: null,
    hipotese_diagnostica: null,
    conduta: null,
    plano: null,
    cid_codigo: null,
    cid_descricao: null,
    retorno_dias: null,
  };

  for (const c of campos) {
    const v = dados[c.id];
    if (c.tipo === "cid") {
      const cid = (v ?? {}) as { codigo?: string; descricao?: string };
      legado.cid_codigo = cid.codigo?.trim() || null;
      legado.cid_descricao = cid.descricao?.trim() || null;
    } else if (c.tipo === "retorno") {
      legado.retorno_dias =
        typeof v === "number" && Number.isFinite(v) ? v : null;
    } else if (LEGACY_TEXT_IDS.has(c.id)) {
      (legado as Record<string, unknown>)[c.id] =
        typeof v === "string" ? v : v != null ? String(v) : null;
    }
  }

  return legado;
}

export function dadosJsonToString(dados: Record<string, unknown>): string {
  return JSON.stringify(dados);
}

export function enriquecerProntuarioFicha(row: {
  ficha_template_id?: number | null;
  template_snapshot_json?: string | null;
  dados_json?: string | null;
  consulta_encerrada?: boolean;
} & ProntuarioLegado): ProntuarioFichaEnriquecido {
  const encerrada = Boolean(row.consulta_encerrada);
  const snapshot = encerrada
    ? parseTemplateSnapshot(row.template_snapshot_json)
    : null;

  let fichaTemplateId = row.ficha_template_id ?? null;
  let titulo = "Prontuário de consulta";
  let modo = "secoes";
  let campos: FichaCampoDef[];
  let posicoes: FichaCampoPosicao[] = [];

  if (snapshot) {
    fichaTemplateId = snapshot.ficha_template_id || fichaTemplateId;
    titulo = snapshot.titulo_documento || titulo;
    modo = snapshot.modo || modo;
    campos = snapshot.campos;
    posicoes = snapshot.posicoes ?? [];
  } else if (fichaTemplateId != null) {
    const ficha = getFichaTemplateOrThrow(fichaTemplateId);
    titulo = ficha.titulo_documento;
    modo = ficha.modo;
    campos = camposFromTemplate(ficha);
    if (ficha.modo === "pdf_fundo") {
      posicoes = loadPosicoes(ficha.id);
    }
  } else {
    const defaultId = getDefaultFichaTemplateId();
    const ficha = getFichaTemplateOrThrow(defaultId);
    fichaTemplateId = defaultId;
    titulo = ficha.titulo_documento;
    modo = ficha.modo;
    campos = camposFromTemplate(ficha);
    if (ficha.modo === "pdf_fundo") {
      posicoes = loadPosicoes(ficha.id);
    }
  }

  let dados = parseDadosJson(row.dados_json);
  if (!dadosTemConteudo(dados)) {
    dados = legadoParaDadosJson(row, campos);
  }

  return {
    ficha_template_id: fichaTemplateId,
    ficha_titulo_documento: titulo,
    ficha_modo: modo,
    ficha_campos: campos,
    ficha_campos_posicao: posicoes,
    dados,
  };
}

export type ProntuarioFichaEnriquecido = {
  ficha_template_id: number | null;
  ficha_titulo_documento: string;
  ficha_modo: string;
  ficha_campos: FichaCampoDef[];
  ficha_campos_posicao: FichaCampoPosicao[];
  dados: Record<string, unknown>;
};

function formatDataBrPdf(iso: string): string {
  const base = iso.trim().slice(0, 10);
  const [y, m, d] = base.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

export function campoTemConteudo(
  tipo: string,
  valor: unknown,
): boolean {
  if (valor == null) return false;
  switch (tipo) {
    case "sim_nao":
      return valor === "sim" || valor === "nao" || valor === "ni";
    case "checkbox":
      return valor === true;
    case "marcadores":
      return Array.isArray(valor) && valor.length > 0;
    case "escolha":
      return typeof valor === "string" && Boolean(valor.trim());
    case "cid": {
      const o = valor as { codigo?: string; descricao?: string };
      return Boolean(o.codigo?.trim() || o.descricao?.trim());
    }
    case "retorno":
      return typeof valor === "number" && Number.isFinite(valor);
    default:
      return typeof valor === "string"
        ? Boolean(valor.trim())
        : Boolean(String(valor).trim());
  }
}

export function formatarValorCampoPdf(
  tipo: string,
  valor: unknown,
  retornoAte?: string | null,
): string {
  switch (tipo) {
    case "sim_nao":
      if (valor === "sim") return "Sim";
      if (valor === "nao") return "Não";
      if (valor === "ni") return "N.I.";
      return "";
    case "checkbox":
      return valor === true ? "Sim" : "Não";
    case "marcadores":
      return Array.isArray(valor) ? valor.map(String).join(", ") : "";
    case "escolha": {
      const raw = typeof valor === "string" ? valor.trim() : String(valor ?? "").trim();
      const labels: Record<string, string> = {
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
      return labels[raw] ?? raw;
    }
    case "cid": {
      const o = (valor ?? {}) as { codigo?: string; descricao?: string };
      return [o.codigo?.trim(), o.descricao?.trim()].filter(Boolean).join(" — ");
    }
    case "retorno": {
      if (typeof valor !== "number" || !Number.isFinite(valor)) return "";
      const ate = retornoAte?.trim();
      return ate
        ? `${valor} dia(s) (até ${formatDataBrPdf(ate)})`
        : `${valor} dia(s)`;
    }
    default:
      return typeof valor === "string" ? valor.trim() : String(valor ?? "").trim();
  }
}

export function prepararCamposConsultaPdf(
  campos: FichaCampoDef[],
  dados: Record<string, unknown>,
  retornoAte?: string | null,
): { label: string; valor: string }[] {
  const ordenados = [...campos].sort((a, b) => a.ordem - b.ordem);
  return ordenados
    .filter((c) => campoTemConteudo(c.tipo, dados[c.id]))
    .map((c) => ({
      label: c.label.replace(/:+$/, "").trim() || c.id,
      valor: formatarValorCampoPdf(c.tipo, dados[c.id], retornoAte),
    }))
    .filter((c) => c.valor);
}

/** Grava ficha/dados resolvidos em prontuários legados (pré-F2) ainda editáveis. */
export function persistirFichaProntuarioSePendente(
  prontuarioId: number,
  row: {
    ficha_template_id?: number | null;
    dados_json?: string | null;
    consulta_encerrada?: boolean;
  },
  ficha: ProntuarioFichaEnriquecido,
): void {
  if (row.consulta_encerrada) return;
  if (ficha.ficha_template_id == null) return;

  const precisaFicha = row.ficha_template_id == null;
  const precisaDados = !row.dados_json?.trim();
  if (!precisaFicha && !precisaDados) return;

  getDb()
    .prepare(
      `UPDATE prontuarios SET
        ficha_template_id = COALESCE(ficha_template_id, ?),
        dados_json = COALESCE(dados_json, ?)
       WHERE id = ?`,
    )
    .run(
      ficha.ficha_template_id,
      dadosJsonToString(ficha.dados),
      prontuarioId,
    );
}
