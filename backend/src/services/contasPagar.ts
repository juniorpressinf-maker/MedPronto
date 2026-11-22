import crypto from "node:crypto";
import type { Database } from "better-sqlite3";
import { getDb } from "../db/index.js";
import { AppError } from "../utils/appError.js";

/**
 * Contas a pagar (molde CliniCar): conta única, parcelas do mesmo lançamento
 * (lote) ou repetir todo mês. Quitar gera saída no caixa; estornar devolve a conta
 * para "aberta" e lança a entrada de estorno no caixa.
 */
export type SituacaoConta = "paga" | "vencida" | "hoje" | "a_vencer";

export type ContaPagar = {
  id: number;
  fornecedor_id: number;
  fornecedor_nome: string;
  categoria_id: number;
  categoria_nome: string;
  descricao: string;
  documento: string;
  valor_centavos: number;
  vencimento: string;
  forma_prevista: string | null;
  linha_pagamento: string;
  observacao: string;
  status: "aberta" | "paga";
  situacao: SituacaoConta;
  lote_id: string | null;
  parcela_seq: number | null;
  parcela_total: number | null;
  repete_id: string | null;
  repete_seq: number | null;
  repete_total: number | null;
  pagamento_id: number | null;
  data_pagamento: string | null;
  valor_pago_centavos: number | null;
  juros_centavos: number | null;
  desconto_centavos: number | null;
  forma_paga: string | null;
};

export type TotalQtd = { qtd: number; valor_centavos: number };
export type TotaisContas = {
  abertas: TotalQtd;
  vencidas: TotalQtd;
  hoje: TotalQtd;
  a_vencer: TotalQtd;
  semana: TotalQtd;
  pagas_mes: TotalQtd;
};

const SELECT_CONTA = `
  SELECT c.*, f.nome AS fornecedor_nome, cat.nome AS categoria_nome,
         pg.id AS pagamento_id, pg.data_pagamento, pg.valor_centavos AS valor_pago_centavos,
         pg.juros_centavos, pg.desconto_centavos, pg.forma AS forma_paga,
         CASE
           WHEN c.status = 'paga' THEN 'paga'
           WHEN c.vencimento < date('now','localtime') THEN 'vencida'
           WHEN c.vencimento = date('now','localtime') THEN 'hoje'
           ELSE 'a_vencer'
         END AS situacao
  FROM contas_pagar c
  JOIN fornecedores f ON f.id = c.fornecedor_id
  JOIN caixa_categorias cat ON cat.id = c.categoria_id
  LEFT JOIN contas_pagar_pagamentos pg ON pg.conta_id = c.id AND pg.estornado_em IS NULL
`;

function dataValida(d: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(`${d}T12:00:00`))) {
    throw new AppError(400, "Data inválida.");
  }
  return d;
}

/** Mesmo dia nos meses seguintes (31 → último dia do mês curto). */
export function somarMeses(iso: string, n: number): string {
  const [a, m, d] = iso.split("-").map(Number) as [number, number, number];
  const alvo = new Date(a, m - 1 + n, 1);
  const ultimo = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
  const dia = Math.min(d, ultimo);
  return `${alvo.getFullYear()}-${String(alvo.getMonth() + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

export function obterContaPagar(id: number, db: Database = getDb()): ContaPagar {
  const c = db.prepare(`${SELECT_CONTA} WHERE c.id = ?`).get(id) as ContaPagar | undefined;
  if (!c) throw new AppError(404, "Conta a pagar não encontrada.");
  return c;
}

export function listarContasPagar(
  filtros: { q?: string; situacao?: SituacaoConta | "abertas"; de?: string; ate?: string; categoria_id?: number },
  db: Database = getDb(),
): { rows: ContaPagar[]; totais: TotaisContas } {
  const where: string[] = [];
  const params: Record<string, string | number> = {};
  if (filtros.q?.trim()) {
    where.push("(f.nome LIKE @q OR c.descricao LIKE @q OR c.documento LIKE @q)");
    params.q = `%${filtros.q.trim()}%`;
  }
  if (filtros.categoria_id) {
    where.push("c.categoria_id = @cat");
    params.cat = filtros.categoria_id;
  }
  const sit = filtros.situacao;
  if (sit === "paga") where.push("c.status = 'paga'");
  else if (sit === "abertas") where.push("c.status = 'aberta'");
  else if (sit === "vencida") where.push("c.status = 'aberta' AND c.vencimento < date('now','localtime')");
  else if (sit === "hoje") where.push("c.status = 'aberta' AND c.vencimento = date('now','localtime')");
  else if (sit === "a_vencer") where.push("c.status = 'aberta' AND c.vencimento > date('now','localtime')");
  // Período: pagas filtram pela data do pagamento; as demais pelo vencimento.
  const campoData = sit === "paga" ? "pg.data_pagamento" : "c.vencimento";
  if (filtros.de) {
    where.push(`${campoData} >= @de`);
    params.de = dataValida(filtros.de);
  }
  if (filtros.ate) {
    where.push(`${campoData} <= @ate`);
    params.ate = dataValida(filtros.ate);
  }
  const rows = db
    .prepare(
      `${SELECT_CONTA} ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY CASE WHEN c.status = 'paga' THEN 1 ELSE 0 END,
                CASE WHEN c.status = 'paga' THEN pg.data_pagamento END DESC,
                c.vencimento, f.nome COLLATE NOCASE, c.id`,
    )
    .all(params) as ContaPagar[];
  return { rows, totais: totaisContasPagar(db) };
}

export function totaisContasPagar(db: Database = getDb()): TotaisContas {
  const t = (sql: string): TotalQtd =>
    db.prepare(`SELECT COUNT(*) AS qtd, COALESCE(SUM(valor_centavos), 0) AS valor_centavos FROM ${sql}`).get() as TotalQtd;
  return {
    abertas: t("contas_pagar WHERE status = 'aberta'"),
    vencidas: t("contas_pagar WHERE status = 'aberta' AND vencimento < date('now','localtime')"),
    hoje: t("contas_pagar WHERE status = 'aberta' AND vencimento = date('now','localtime')"),
    a_vencer: t("contas_pagar WHERE status = 'aberta' AND vencimento > date('now','localtime')"),
    semana: t(
      "contas_pagar WHERE status = 'aberta' AND vencimento BETWEEN date('now','localtime') AND date('now','localtime','+7 days')",
    ),
    pagas_mes: t(
      `contas_pagar_pagamentos WHERE estornado_em IS NULL
         AND substr(data_pagamento, 1, 7) = strftime('%Y-%m', 'now', 'localtime')`,
    ),
  };
}

export type DadosConta = {
  fornecedor_id?: number;
  fornecedor_nome?: string;
  categoria_id: number;
  descricao?: string;
  documento?: string;
  valor_centavos: number;
  vencimento: string;
  forma_prevista?: string | null;
  linha_pagamento?: string;
  observacao?: string;
};

function resolverFornecedor(d: DadosConta, db: Database): number {
  if (d.fornecedor_id) {
    const f = db.prepare("SELECT id FROM fornecedores WHERE id = ?").get(d.fornecedor_id);
    if (!f) throw new AppError(400, "Fornecedor não encontrado.");
    return d.fornecedor_id;
  }
  const nome = (d.fornecedor_nome ?? "").trim().toUpperCase() || "DIVERSOS";
  db.prepare("INSERT OR IGNORE INTO fornecedores (nome) VALUES (?)").run(nome);
  return (db.prepare("SELECT id FROM fornecedores WHERE nome = ?").get(nome) as { id: number }).id;
}

function validarCategoria(id: number, db: Database): void {
  const c = db.prepare("SELECT natureza FROM caixa_categorias WHERE id = ?").get(id) as
    | { natureza: string }
    | undefined;
  if (!c || c.natureza !== "saida") throw new AppError(400, "Escolha uma categoria de saída.");
}

/**
 * Cria a conta. `parcelas` (2–60) = mesmo lançamento dividido; `repetir_meses` (2–24) =
 * uma conta por mês (aluguel, luz). Devolve as contas criadas.
 */
export function criarContaPagar(
  d: DadosConta & {
    parcelas?: { valor_centavos: number; vencimento: string }[];
    repetir_meses?: number;
  },
  usuarioId: number | null,
  db: Database = getDb(),
): ContaPagar[] {
  validarCategoria(d.categoria_id, db);
  dataValida(d.vencimento);
  const parcelas = d.parcelas && d.parcelas.length >= 2 ? d.parcelas : null;
  const repetir = !parcelas && d.repetir_meses && d.repetir_meses >= 2 ? d.repetir_meses : null;
  if (parcelas && parcelas.length > 60) throw new AppError(400, "No máximo 60 parcelas.");
  if (repetir && repetir > 24) throw new AppError(400, "Repetir no máximo 24 meses.");
  if (!parcelas && !(d.valor_centavos > 0)) throw new AppError(400, "Informe o valor.");

  const ids: number[] = [];
  db.transaction(() => {
    const forn = resolverFornecedor(d, db);
    const ins = db.prepare(
      `INSERT INTO contas_pagar
         (fornecedor_id, categoria_id, descricao, documento, valor_centavos, vencimento, forma_prevista,
          linha_pagamento, observacao, lote_id, parcela_seq, parcela_total, repete_id, repete_seq, repete_total, criado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const base = [
      forn,
      d.categoria_id,
      (d.descricao ?? "").trim().toUpperCase(),
      (d.documento ?? "").trim(),
    ] as const;
    const resto = [d.forma_prevista || null, (d.linha_pagamento ?? "").trim(), (d.observacao ?? "").trim()] as const;
    if (parcelas) {
      const lote = crypto.randomUUID();
      parcelas.forEach((p, i) => {
        if (!(p.valor_centavos > 0)) throw new AppError(400, `Parcela ${i + 1} sem valor.`);
        dataValida(p.vencimento);
        ids.push(
          Number(
            ins.run(...base, p.valor_centavos, p.vencimento, ...resto, lote, i + 1, parcelas.length, null, null, null, usuarioId)
              .lastInsertRowid,
          ),
        );
      });
    } else if (repetir) {
      const rep = crypto.randomUUID();
      for (let i = 0; i < repetir; i += 1) {
        ids.push(
          Number(
            ins.run(...base, d.valor_centavos, somarMeses(d.vencimento, i), ...resto, null, null, null, rep, i + 1, repetir, usuarioId)
              .lastInsertRowid,
          ),
        );
      }
    } else {
      ids.push(
        Number(
          ins.run(...base, d.valor_centavos, d.vencimento, ...resto, null, null, null, null, null, null, usuarioId)
            .lastInsertRowid,
        ),
      );
    }
  })();
  return ids.map((id) => obterContaPagar(id, db));
}

export function alterarContaPagar(id: number, d: DadosConta, db: Database = getDb()): ContaPagar {
  const atual = obterContaPagar(id, db);
  if (atual.status === "paga") throw new AppError(409, "Conta paga não pode ser alterada. Estorne o pagamento.");
  validarCategoria(d.categoria_id, db);
  dataValida(d.vencimento);
  if (!(d.valor_centavos > 0)) throw new AppError(400, "Informe o valor.");
  db.transaction(() => {
    const forn = resolverFornecedor(d, db);
    db.prepare(
      `UPDATE contas_pagar SET fornecedor_id = ?, categoria_id = ?, descricao = ?, documento = ?, valor_centavos = ?,
         vencimento = ?, forma_prevista = ?, linha_pagamento = ?, observacao = ?, updated_at = datetime('now','localtime')
       WHERE id = ?`,
    ).run(
      forn,
      d.categoria_id,
      (d.descricao ?? "").trim().toUpperCase(),
      (d.documento ?? "").trim(),
      d.valor_centavos,
      d.vencimento,
      d.forma_prevista || null,
      (d.linha_pagamento ?? "").trim(),
      (d.observacao ?? "").trim(),
      id,
    );
  })();
  return obterContaPagar(id, db);
}

export function excluirContaPagar(id: number, db: Database = getDb()): void {
  const c = obterContaPagar(id, db);
  if (c.status === "paga") throw new AppError(409, "Conta paga não pode ser excluída. Estorne o pagamento primeiro.");
  db.prepare("DELETE FROM contas_pagar WHERE id = ?").run(id);
}

function descricaoCaixa(c: ContaPagar): string {
  const parte = c.parcela_seq ? ` (${c.parcela_seq}/${c.parcela_total})` : c.repete_seq ? ` (${c.repete_seq}/${c.repete_total})` : "";
  return `${c.fornecedor_nome}${c.descricao ? ` — ${c.descricao}` : ""}${parte}`;
}

/**
 * Quita uma ou várias contas abertas. Juros/desconto só quando é uma conta.
 * Cada quitação vira uma saída no caixa (categoria da conta, data do pagamento).
 */
export function quitarContasPagar(
  opts: {
    ids: number[];
    data_pagamento: string;
    forma: string;
    juros_centavos?: number;
    desconto_centavos?: number;
    observacao?: string;
  },
  usuarioId: number | null,
  db: Database = getDb(),
): ContaPagar[] {
  const ids = [...new Set(opts.ids)];
  if (ids.length === 0) throw new AppError(400, "Escolha ao menos uma conta.");
  dataValida(opts.data_pagamento);
  if (!opts.forma.trim()) throw new AppError(400, "Escolha a forma de pagamento.");
  const juros = ids.length === 1 ? Math.max(0, opts.juros_centavos ?? 0) : 0;
  const desconto = ids.length === 1 ? Math.max(0, opts.desconto_centavos ?? 0) : 0;
  db.transaction(() => {
    for (const id of ids) {
      const c = obterContaPagar(id, db);
      if (c.status === "paga") throw new AppError(409, `A conta de ${c.fornecedor_nome} já está paga.`);
      const valor = c.valor_centavos + juros - desconto;
      if (valor <= 0) throw new AppError(400, "O desconto não pode zerar o pagamento.");
      const pg = Number(
        db
          .prepare(
            `INSERT INTO contas_pagar_pagamentos
               (conta_id, data_pagamento, valor_centavos, juros_centavos, desconto_centavos, forma, observacao, usuario_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(id, opts.data_pagamento, valor, juros, desconto, opts.forma, opts.observacao?.trim() || null, usuarioId)
          .lastInsertRowid,
      );
      db.prepare("UPDATE contas_pagar SET status = 'paga', updated_at = datetime('now','localtime') WHERE id = ?").run(id);
      db.prepare(
        `INSERT INTO caixa_movimentos
           (categoria_id, natureza, valor_centavos, data, descricao, forma, conta_pagar_pagamento_id, registrado_por)
         VALUES (?, 'saida', ?, ?, ?, ?, ?, ?)`,
      ).run(c.categoria_id, valor, opts.data_pagamento, descricaoCaixa(c), opts.forma, pg, usuarioId);
    }
  })();
  return ids.map((id) => obterContaPagar(id, db));
}

/** Desfaz a quitação: conta volta a "aberta"; o caixa recebe a entrada de estorno. */
export function estornarContaPagar(
  id: number,
  motivo: string | undefined,
  usuarioId: number | null,
  db: Database = getDb(),
): ContaPagar {
  const c = obterContaPagar(id, db);
  if (c.status !== "paga" || !c.pagamento_id) throw new AppError(409, "Esta conta não está paga.");
  const cat = db.prepare("SELECT id FROM caixa_categorias WHERE nome = 'Estorno de conta paga'").get() as
    | { id: number }
    | undefined;
  if (!cat) throw new AppError(500, "Categoria de estorno não encontrada (rode as migrações).");
  db.transaction(() => {
    db.prepare(
      `UPDATE contas_pagar_pagamentos
       SET estornado_em = datetime('now','localtime'), estornado_por = ?, motivo_estorno = ?
       WHERE id = ?`,
    ).run(usuarioId, motivo?.trim() || null, c.pagamento_id);
    db.prepare("UPDATE contas_pagar SET status = 'aberta', updated_at = datetime('now','localtime') WHERE id = ?").run(id);
    db.prepare(
      `INSERT INTO caixa_movimentos (categoria_id, natureza, valor_centavos, data, descricao, forma, registrado_por)
       VALUES (?, 'entrada', ?, date('now','localtime'), ?, ?, ?)`,
    ).run(cat.id, c.valor_pago_centavos, `Estorno: ${descricaoCaixa(c)}${motivo?.trim() ? ` — ${motivo.trim()}` : ""}`, c.forma_paga, usuarioId);
  })();
  return obterContaPagar(id, db);
}

// ------------------------------------------------------------------ cadastros auxiliares

export type Fornecedor = { id: number; nome: string; documento: string | null; telefone: string | null; ativo: number };

export function listarFornecedores(db: Database = getDb()): Fornecedor[] {
  return db
    .prepare("SELECT id, nome, documento, telefone, ativo FROM fornecedores ORDER BY nome COLLATE NOCASE")
    .all() as Fornecedor[];
}

export function salvarFornecedor(
  d: { id?: number; nome: string; documento?: string; telefone?: string },
  db: Database = getDb(),
): Fornecedor {
  const nome = d.nome.trim().toUpperCase();
  if (!nome) throw new AppError(400, "Informe o nome do fornecedor.");
  const dup = db.prepare("SELECT id FROM fornecedores WHERE nome = ? AND id <> ?").get(nome, d.id ?? 0);
  if (dup) throw new AppError(409, "Já existe fornecedor com esse nome.");
  let id = d.id;
  if (id) {
    db.prepare("UPDATE fornecedores SET nome = ?, documento = ?, telefone = ? WHERE id = ?").run(
      nome,
      d.documento?.trim() || null,
      d.telefone?.trim() || null,
      id,
    );
  } else {
    id = Number(
      db
        .prepare("INSERT INTO fornecedores (nome, documento, telefone) VALUES (?, ?, ?)")
        .run(nome, d.documento?.trim() || null, d.telefone?.trim() || null).lastInsertRowid,
    );
  }
  return db.prepare("SELECT id, nome, documento, telefone, ativo FROM fornecedores WHERE id = ?").get(id) as Fornecedor;
}
