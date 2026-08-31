import { getDb } from "../db/index.js";

/** Tipos de campo de ficha clínica — espelha docs/MODULO_FICHAS_CLINICAS.md §5.1 */

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

const ID_RE = /^[a-z][a-z0-9_]{0,63}$/;

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

export function normalizarCampos(raw: unknown): FichaCampoDef[] {
  if (!Array.isArray(raw)) return [];
  const out: FichaCampoDef[] = [];
  const ids = new Set<string>();

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    let tipo = String(o.tipo ?? "");
    if (!(FICHA_TIPOS_CAMPO as readonly string[]).includes(tipo)) continue;

    let opcoesRaw: string[] | undefined;
    if (Array.isArray(o.opcoes)) {
      const opcoes = o.opcoes.map((x) => String(x).trim()).filter(Boolean);
      if (opcoes.length > 0) opcoesRaw = opcoes;
    }

    if (tipo === "checkbox" && opcoesRaw?.length) {
      tipo = "marcadores";
    }

    let id = String(o.id ?? "").trim();
    if (!ID_RE.test(id)) {
      id = slugCampoId(String(o.label ?? "campo"), ids);
    }
    if (ids.has(id)) continue;
    ids.add(id);

    const label = String(o.label ?? "").trim();
    if (!label) continue;

    const ordem = Number(o.ordem);
    const campo: FichaCampoDef = {
      id,
      label,
      tipo: tipo as FichaCampoTipo,
      ordem: Number.isFinite(ordem) ? ordem : out.length + 1,
    };

    if (o.obrigatorio === true) campo.obrigatorio = true;

    if ((tipo === "marcadores" || tipo === "checkbox" || tipo === "escolha") && opcoesRaw) {
      campo.opcoes = opcoesRaw;
    }

    if (tipo === "busca" && typeof o.placeholder === "string") {
      const ph = o.placeholder.trim();
      if (ph) campo.placeholder = ph;
    }

    out.push(campo);
  }

  return out.sort((a, b) => a.ordem - b.ordem || a.id.localeCompare(b.id));
}

export function validarCampos(campos: FichaCampoDef[]): string | null {
  if (campos.length === 0) return "A ficha precisa de pelo menos um campo";

  const ids = new Set<string>();
  let cid = 0;
  let retorno = 0;

  for (const c of campos) {
    if (!ID_RE.test(c.id)) {
      return `ID de campo inválido: ${c.id}`;
    }
    if (ids.has(c.id)) return `Campo duplicado: ${c.id}`;
    ids.add(c.id);

    if (!c.label.trim()) return "Todo campo precisa de rótulo";

    if (!(FICHA_TIPOS_CAMPO as readonly string[]).includes(c.tipo)) {
      return `Tipo de campo inválido: ${c.tipo}`;
    }

    if (c.tipo === "cid") cid += 1;
    if (c.tipo === "retorno") retorno += 1;

    if (c.tipo === "marcadores" || c.tipo === "escolha") {
      if (!c.opcoes?.length) {
        return `${c.tipo === "escolha" ? "Escolha" : "Marcadores"} "${c.label}" precisa de pelo menos uma opção`;
      }
      const uniq = new Set(c.opcoes.map((o) => o.toLowerCase()));
      if (uniq.size !== c.opcoes.length) {
        return `Opções duplicadas em "${c.label}"`;
      }
    }

    if (c.tipo === "checkbox" && c.opcoes?.length) {
      return `Use o tipo "marcadores" para várias opções em "${c.label}"`;
    }
  }

  if (cid > 1) return "Permitido no máximo um campo CID-10 por ficha";
  if (retorno > 1) return "Permitido no máximo um campo Retorno por ficha";

  return null;
}

export function validarCamposDestino(
  campos: FichaCampoDef[],
  destino: "prontuario" | "aso",
): string | null {
  const base = validarCampos(campos);
  if (base) return base;
  if (destino === "prontuario" && campos.some((c) => c.tipo === "escolha")) {
    return "O tipo Escolha é só para modelos de ASO";
  }
  if (destino === "aso" && campos.some((c) => c.tipo === "cid" || c.tipo === "retorno")) {
    return "Modelo ASO não usa CID nem retorno de consulta";
  }
  return null;
}

export function camposParaJson(campos: FichaCampoDef[]): string {
  const ordenados = [...campos].sort((a, b) => a.ordem - b.ordem);
  return JSON.stringify(
    ordenados.map((c) => {
      const o: Record<string, unknown> = {
        id: c.id,
        label: c.label,
        tipo: c.tipo,
        ordem: c.ordem,
      };
      if (c.obrigatorio) o.obrigatorio = true;
      if (c.opcoes?.length) o.opcoes = c.opcoes;
      if (c.placeholder) o.placeholder = c.placeholder;
      return o;
    }),
  );
}

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

export function loadPosicoes(fichaTemplateId: number): FichaCampoPosicao[] {
  return getDb()
    .prepare(
      `SELECT campo_id, x_pct, y_pct, largura_pct, altura_pct
       FROM ficha_campos_posicao WHERE ficha_template_id = ?
       ORDER BY y_pct, x_pct`,
    )
    .all(fichaTemplateId) as FichaCampoPosicao[];
}

export function savePosicoes(
  fichaTemplateId: number,
  posicoes: FichaCampoPosicao[],
): void {
  const db = getDb();
  db.prepare(`DELETE FROM ficha_campos_posicao WHERE ficha_template_id = ?`).run(
    fichaTemplateId,
  );
  const ins = db.prepare(
    `INSERT INTO ficha_campos_posicao (
      ficha_template_id, campo_id, x_pct, y_pct, largura_pct, altura_pct
    ) VALUES (?, ?, ?, ?, ?, ?)`,
  );
  for (const p of posicoes) {
    ins.run(
      fichaTemplateId,
      p.campo_id,
      p.x_pct,
      p.y_pct,
      p.largura_pct,
      p.altura_pct,
    );
  }
}
