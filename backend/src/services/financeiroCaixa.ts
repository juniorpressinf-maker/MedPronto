import type { Database } from "better-sqlite3";
import { getDb } from "../db/index.js";
import { AppError } from "../utils/appError.js";

/**
 * Caixa (molde CliniCar): entradas e saídas de um período.
 * - Entradas da Cobrança: lidas direto de conta_pagamentos (não duplica; estorno da cobrança some sozinho).
 * - Saídas das contas pagas, estornos de conta paga e lançamentos manuais: caixa_movimentos.
 */
export type OrigemMovimento = "cobranca" | "conta_pagar" | "manual" | "outro";

export type MovimentoCaixa = {
  /** Única na lista (o id sozinho repete entre cobrança e caixa). */
  chave: string;
  id: number;
  data: string;
  natureza: "entrada" | "saida";
  categoria_nome: string;
  valor_centavos: number;
  descricao: string | null;
  forma: string | null;
  origem: OrigemMovimento;
  manual: number;
  /** Conta da cobrança (para abrir a conta pelo caixa). */
  conta_atendimento_id: number | null;
  usuario_nome: string | null;
  created_at: string;
};

export type ResumoCaixa = {
  de: string;
  ate: string;
  movimentos: MovimentoCaixa[];
  entradas_centavos: number;
  saidas_centavos: number;
  saldo_centavos: number;
  /** Saldo acumulado antes do período (para o saldo final). */
  saldo_anterior_centavos: number;
  por_forma: { forma: string; entradas_centavos: number; saidas_centavos: number }[];
  por_categoria: { categoria: string; natureza: string; valor_centavos: number }[];
};

export type CategoriaCaixa = { id: number; nome: string; natureza: "entrada" | "saida"; ativo: number };

export const CATEGORIA_COBRANCA = "Atendimentos (cobrança)";
export const CATEGORIA_REPASSE = "Repasse de convênio";

function dataValida(d: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(`${d}T12:00:00`))) {
    throw new AppError(400, "Data inválida.");
  }
  return d;
}

const SQL_MOVIMENTOS = `
  SELECT 'c' || p.id AS chave, p.id, date(p.registrado_em) AS data, 'entrada' AS natureza,
         CASE WHEN p.forma = 'repasse_convenio' THEN @catRepasse ELSE @catCobranca END AS categoria_nome,
         p.valor_centavos, pac.nome AS descricao, p.forma, 'cobranca' AS origem, 0 AS manual,
         p.conta_id AS conta_atendimento_id, u.nome AS usuario_nome, p.registrado_em AS created_at
  FROM conta_pagamentos p
  JOIN contas_atendimento ca ON ca.id = p.conta_id
  LEFT JOIN pacientes pac ON pac.id = ca.paciente_id
  LEFT JOIN usuarios u ON u.id = p.registrado_por
  WHERE date(p.registrado_em) BETWEEN @de AND @ate
  UNION ALL
  SELECT 'm' || m.id AS chave, m.id, m.data, m.natureza, cat.nome AS categoria_nome,
         m.valor_centavos, m.descricao, m.forma,
         CASE
           WHEN m.conta_pagar_pagamento_id IS NOT NULL THEN 'conta_pagar'
           WHEN m.manual = 1 THEN 'manual'
           ELSE 'outro'
         END AS origem,
         m.manual, NULL AS conta_atendimento_id, u.nome AS usuario_nome, m.created_at
  FROM caixa_movimentos m
  JOIN caixa_categorias cat ON cat.id = m.categoria_id
  LEFT JOIN usuarios u ON u.id = m.registrado_por
  WHERE m.data BETWEEN @de AND @ate
  ORDER BY data, created_at, chave`;

export function resumoCaixa(filtros: { de: string; ate: string }, db: Database = getDb()): ResumoCaixa {
  const de = dataValida(filtros.de);
  const ate = dataValida(filtros.ate);
  if (de > ate) throw new AppError(400, "A data inicial é depois da final.");

  const movimentos = db.prepare(SQL_MOVIMENTOS).all({
    de,
    ate,
    catCobranca: CATEGORIA_COBRANCA,
    catRepasse: CATEGORIA_REPASSE,
  }) as MovimentoCaixa[];

  const ant = db
    .prepare(
      `SELECT
         (SELECT COALESCE(SUM(valor_centavos), 0) FROM conta_pagamentos WHERE date(registrado_em) < @de)
         + (SELECT COALESCE(SUM(CASE WHEN natureza = 'entrada' THEN valor_centavos ELSE -valor_centavos END), 0)
            FROM caixa_movimentos WHERE data < @de) AS s`,
    )
    .get({ de }) as { s: number };

  const formas = new Map<string, { forma: string; entradas_centavos: number; saidas_centavos: number }>();
  const cats = new Map<string, { categoria: string; natureza: string; valor_centavos: number }>();
  let entradas = 0;
  let saidas = 0;
  for (const m of movimentos) {
    if (m.natureza === "entrada") entradas += m.valor_centavos;
    else saidas += m.valor_centavos;
    const f = m.forma || "—";
    const fx = formas.get(f) ?? { forma: f, entradas_centavos: 0, saidas_centavos: 0 };
    if (m.natureza === "entrada") fx.entradas_centavos += m.valor_centavos;
    else fx.saidas_centavos += m.valor_centavos;
    formas.set(f, fx);
    const k = `${m.natureza}:${m.categoria_nome}`;
    const cx = cats.get(k) ?? { categoria: m.categoria_nome, natureza: m.natureza, valor_centavos: 0 };
    cx.valor_centavos += m.valor_centavos;
    cats.set(k, cx);
  }

  return {
    de,
    ate,
    movimentos,
    entradas_centavos: entradas,
    saidas_centavos: saidas,
    saldo_centavos: entradas - saidas,
    saldo_anterior_centavos: ant.s,
    por_forma: [...formas.values()].sort((a, b) => a.forma.localeCompare(b.forma)),
    por_categoria: [...cats.values()].sort(
      (a, b) => a.natureza.localeCompare(b.natureza) || b.valor_centavos - a.valor_centavos,
    ),
  };
}

export function lancarManual(
  d: {
    natureza: "entrada" | "saida";
    categoria_id: number;
    valor_centavos: number;
    data: string;
    descricao: string;
    forma?: string;
  },
  usuarioId: number | null,
  db: Database = getDb(),
): number {
  const cat = db.prepare("SELECT natureza FROM caixa_categorias WHERE id = ?").get(d.categoria_id) as
    | { natureza: string }
    | undefined;
  if (!cat || cat.natureza !== d.natureza) throw new AppError(400, "Categoria não combina com entrada/saída.");
  if (!(d.valor_centavos > 0)) throw new AppError(400, "Informe o valor.");
  if (!d.descricao.trim()) throw new AppError(400, "Informe a descrição.");
  return Number(
    db
      .prepare(
        `INSERT INTO caixa_movimentos (categoria_id, natureza, valor_centavos, data, descricao, forma, manual, registrado_por)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
      )
      .run(
        d.categoria_id,
        d.natureza,
        d.valor_centavos,
        dataValida(d.data),
        d.descricao.trim().toUpperCase(),
        d.forma || null,
        usuarioId,
      ).lastInsertRowid,
  );
}

/** Só lançamento manual sai daqui; o resto se desfaz pela origem (estorno na Cobrança / na conta paga). */
export function excluirManual(id: number, db: Database = getDb()): void {
  const m = db.prepare("SELECT manual FROM caixa_movimentos WHERE id = ?").get(id) as
    | { manual: number }
    | undefined;
  if (!m) throw new AppError(404, "Lançamento não encontrado.");
  if (!m.manual) {
    throw new AppError(409, "Só lançamento manual pode ser excluído aqui. Os demais se desfazem por estorno.");
  }
  db.prepare("DELETE FROM caixa_movimentos WHERE id = ?").run(id);
}

export function listarCategorias(db: Database = getDb()): CategoriaCaixa[] {
  return db
    .prepare("SELECT id, nome, natureza, ativo FROM caixa_categorias ORDER BY natureza, nome COLLATE NOCASE")
    .all() as CategoriaCaixa[];
}

export function criarCategoria(
  d: { nome: string; natureza: "entrada" | "saida" },
  db: Database = getDb(),
): CategoriaCaixa {
  const nome = d.nome.trim();
  if (!nome) throw new AppError(400, "Informe o nome da categoria.");
  if ([CATEGORIA_COBRANCA, CATEGORIA_REPASSE].some((n) => n.toLowerCase() === nome.toLowerCase())) {
    throw new AppError(409, "Esse nome é reservado para as entradas da Cobrança.");
  }
  const dup = db.prepare("SELECT 1 FROM caixa_categorias WHERE nome = ? COLLATE NOCASE").get(nome);
  if (dup) throw new AppError(409, "Já existe categoria com esse nome.");
  const id = Number(
    db.prepare("INSERT INTO caixa_categorias (nome, natureza) VALUES (?, ?)").run(nome, d.natureza).lastInsertRowid,
  );
  return db.prepare("SELECT id, nome, natureza, ativo FROM caixa_categorias WHERE id = ?").get(id) as CategoriaCaixa;
}
