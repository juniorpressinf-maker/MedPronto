import type { ProntuarioDetalhe } from "./api";
import type { FichaCampoDef } from "./fichaTipos";
import { upperPrompt } from "./upperPrompt";

export type FichaDados = Record<string, unknown>;

const LEGACY_TEXT_IDS = new Set([
  "queixa_principal",
  "anamnese",
  "exame_fisico",
  "hipotese_diagnostica",
  "conduta",
  "plano",
]);

export function parseDadosJson(
  raw: FichaDados | string | null | undefined,
): FichaDados {
  if (raw == null) return {};
  if (typeof raw === "object" && !Array.isArray(raw)) return { ...raw };
  if (typeof raw !== "string" || !raw.trim()) return {};
  try {
    const o = JSON.parse(raw);
    if (o && typeof o === "object" && !Array.isArray(o)) {
      return o as FichaDados;
    }
  } catch {
    /* ignore */
  }
  return {};
}

/** Aplica upperPrompt em strings editáveis (textarea, text, busca). */
export function normalizarDadosEntrada(
  dados: FichaDados,
  campos: FichaCampoDef[],
): FichaDados {
  const next = { ...dados };
  for (const c of campos) {
    if (c.tipo === "textarea" || c.tipo === "text" || c.tipo === "busca") {
      const v = next[c.id];
      if (typeof v === "string") next[c.id] = upperPrompt(v);
    }
  }
  return next;
}

/** Sincroniza colunas legadas do prontuário a partir de dados_json. */
export function syncProntuarioFromDados(
  pr: ProntuarioDetalhe,
  dados: FichaDados,
  campos: FichaCampoDef[],
): ProntuarioDetalhe {
  const next: ProntuarioDetalhe = {
    ...pr,
    dados_json: { ...dados },
  };

  for (const c of campos) {
    const v = dados[c.id];
    if (c.tipo === "cid") {
      const cid = (v ?? {}) as { codigo?: string; descricao?: string };
      next.cid_codigo = cid.codigo ?? "";
      next.cid_descricao = cid.descricao ?? "";
    } else if (c.tipo === "retorno") {
      next.retorno_dias =
        typeof v === "number" && Number.isFinite(v) ? v : null;
    } else if (LEGACY_TEXT_IDS.has(c.id)) {
      (next as Record<string, unknown>)[c.id] =
        typeof v === "string" ? v : v != null ? String(v) : "";
    }
  }

  return next;
}

export function payloadProntuarioSave(pr: ProntuarioDetalhe): Partial<ProntuarioDetalhe> {
  const dados = parseDadosJson(pr.dados_json);
  return {
    queixa_principal: pr.queixa_principal,
    anamnese: pr.anamnese,
    exame_fisico: pr.exame_fisico,
    hipotese_diagnostica: pr.hipotese_diagnostica,
    cid_codigo: pr.cid_codigo,
    cid_descricao: pr.cid_descricao,
    conduta: pr.conduta,
    plano: pr.plano,
    retorno_dias: pr.retorno_dias,
    dados_json: dados,
  };
}

export function campoTemConteudo(
  tipo: FichaCampoDef["tipo"],
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

export function camposHistoricoComConteudo(
  campos: FichaCampoDef[],
  dados: FichaDados,
): FichaCampoDef[] {
  return campos.filter((c) => campoTemConteudo(c.tipo, dados[c.id]));
}
