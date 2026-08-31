import type { Database } from "better-sqlite3";
import { getDb } from "../db/index.js";

export const CONVENIO_PARTICULAR_ID = 1;

export type ConvenioRow = {
  id: number;
  nome: string;
  tipo: "particular" | "operadora";
  ativo: number;
  exige_guia: number;
};

export type ModoClinico = "prontuario" | "aso" | "nenhum";

export type ProcedimentoRow = {
  id: number;
  codigo: string | null;
  nome: string;
  ativo: number;
  orientacoes_paciente: string | null;
  modo_clinico: ModoClinico;
};

const PROC_COLS =
  "id, codigo, nome, ativo, orientacoes_paciente, modo_clinico";

const MODOS_CLINICOS: readonly ModoClinico[] = ["prontuario", "aso", "nenhum"];

function assertModoClinico(v: string): asserts v is ModoClinico {
  if (!(MODOS_CLINICOS as readonly string[]).includes(v)) {
    throw new Error("modo_clinico inválido");
  }
}

function contarAtivosDoModo(
  modo: ModoClinico,
  excetoId: number | null,
  db: Database,
): number {
  if (modo === "nenhum") return 999;
  const row = (
    excetoId == null
      ? db
          .prepare(
            `SELECT COUNT(*) AS n FROM procedimentos
             WHERE modo_clinico = ? AND ativo = 1`,
          )
          .get(modo)
      : db
          .prepare(
            `SELECT COUNT(*) AS n FROM procedimentos
             WHERE modo_clinico = ? AND ativo = 1 AND id != ?`,
          )
          .get(modo, excetoId)
  ) as { n: number };
  return Number(row.n);
}

function temAgendamentoFuturo(
  procedimentoId: number,
  db: Database,
): boolean {
  const row = db
    .prepare(
      `SELECT 1
       FROM agendamento_procedimentos ap
       JOIN agendamentos a ON a.id = ap.agendamento_id
       WHERE ap.procedimento_id = ?
         AND a.data >= date('now', 'localtime')
         AND a.status NOT IN ('cancelado', 'nao_compareceu')
       LIMIT 1`,
    )
    .get(procedimentoId);
  return Boolean(row);
}

function assertPodeFicarSemModo(
  modoAtual: ModoClinico,
  modoNovo: ModoClinico,
  ficaraAtivo: boolean,
  id: number,
  db: Database,
): void {
  const perdeProntuario =
    modoAtual === "prontuario" &&
    (modoNovo !== "prontuario" || !ficaraAtivo);
  const perdeAso =
    modoAtual === "aso" && (modoNovo !== "aso" || !ficaraAtivo);
  if (perdeProntuario && contarAtivosDoModo("prontuario", id, db) < 1) {
    throw new Error(
      "Precisa ficar pelo menos um procedimento ativo que abre prontuário.",
    );
  }
  if (perdeAso && contarAtivosDoModo("aso", id, db) < 1) {
    throw new Error(
      "Precisa ficar pelo menos um procedimento ativo que abre ASO.",
    );
  }
}

export type PrecoRow = {
  id: number;
  procedimento_id: number;
  convenio_id: number;
  valor_centavos: number;
};

export function listarConvenios(
  db: Database = getDb(),
  incluirInativos = true,
): ConvenioRow[] {
  let sql = `SELECT id, nome, tipo, ativo, exige_guia FROM convenios`;
  if (!incluirInativos) sql += ` WHERE ativo = 1`;
  sql += ` ORDER BY CASE WHEN id = ${CONVENIO_PARTICULAR_ID} THEN 0 ELSE 1 END, nome COLLATE NOCASE`;
  return db.prepare(sql).all() as ConvenioRow[];
}

export function criarConvenio(
  nome: string,
  tipo: "particular" | "operadora",
  exigeGuia = true,
  db: Database = getDb(),
): ConvenioRow {
  if (tipo === "particular") {
    throw new Error("Convênio Particular já existe no sistema");
  }
  const info = db
    .prepare(
      `INSERT INTO convenios (nome, tipo, ativo, exige_guia) VALUES (?, ?, 1, ?)`,
    )
    .run(nome.trim(), tipo, exigeGuia ? 1 : 0);
  return db
    .prepare(`SELECT id, nome, tipo, ativo, exige_guia FROM convenios WHERE id = ?`)
    .get(Number(info.lastInsertRowid)) as ConvenioRow;
}

export function convenioExigeGuia(
  convenioId: number | null | undefined,
  db: Database = getDb(),
): boolean {
  if (!convenioId || convenioId === CONVENIO_PARTICULAR_ID) return false;
  const row = db
    .prepare(`SELECT tipo, exige_guia FROM convenios WHERE id = ?`)
    .get(convenioId) as { tipo: string; exige_guia: number } | undefined;
  if (!row || row.tipo !== "operadora") return false;
  return row.exige_guia !== 0;
}

export function atualizarConvenio(
  id: number,
  dados: {
    nome?: string;
    tipo?: "particular" | "operadora";
    ativo?: number;
    exige_guia?: number;
  },
  db: Database = getDb(),
): ConvenioRow {
  const atual = db
    .prepare(`SELECT id, nome, tipo, ativo, exige_guia FROM convenios WHERE id = ?`)
    .get(id) as ConvenioRow | undefined;
  if (!atual) throw new Error("Convênio não encontrado");

  if (id === CONVENIO_PARTICULAR_ID) {
    if (dados.tipo && dados.tipo !== "particular") {
      throw new Error("O convênio Particular não pode mudar de tipo");
    }
    if (dados.ativo === 0) {
      throw new Error("O convênio Particular não pode ser desativado");
    }
    const nome = dados.nome?.trim() || atual.nome;
    db.prepare(`UPDATE convenios SET nome = ? WHERE id = ?`).run(nome, id);
  } else {
    const nome = dados.nome?.trim() || atual.nome;
    const tipo = dados.tipo ?? atual.tipo;
    const ativo = dados.ativo ?? atual.ativo;
    const exigeGuia =
      dados.exige_guia !== undefined ? (dados.exige_guia ? 1 : 0) : atual.exige_guia;
    db.prepare(
      `UPDATE convenios SET nome = ?, tipo = ?, ativo = ?, exige_guia = ? WHERE id = ?`,
    ).run(nome, tipo, ativo, exigeGuia, id);
  }

  return db
    .prepare(`SELECT id, nome, tipo, ativo, exige_guia FROM convenios WHERE id = ?`)
    .get(id) as ConvenioRow;
}

export function listarProcedimentos(
  q?: string,
  incluirInativos = true,
  db: Database = getDb(),
): ProcedimentoRow[] {
  let sql = `SELECT ${PROC_COLS} FROM procedimentos`;
  const params: unknown[] = [];
  const where: string[] = [];
  if (!incluirInativos) where.push(`ativo = 1`);
  if (q?.trim()) {
    where.push(
      `(nome LIKE ? COLLATE NOCASE OR codigo LIKE ? COLLATE NOCASE)`,
    );
    const like = `%${q.trim()}%`;
    params.push(like, like);
  }
  if (where.length) sql += ` WHERE ${where.join(" AND ")}`;
  sql += ` ORDER BY nome COLLATE NOCASE`;
  return db.prepare(sql).all(...params) as ProcedimentoRow[];
}

export function procedimentoEmConta(
  procedimentoId: number,
  db: Database = getDb(),
): boolean {
  const row = db
    .prepare(`SELECT 1 FROM conta_itens WHERE procedimento_id = ? LIMIT 1`)
    .get(procedimentoId);
  return Boolean(row);
}

export function criarProcedimento(
  dados: {
    codigo?: string;
    nome: string;
    orientacoes_paciente?: string;
    modo_clinico: ModoClinico;
  },
  db: Database = getDb(),
): ProcedimentoRow {
  assertModoClinico(dados.modo_clinico);
  const info = db
    .prepare(
      `INSERT INTO procedimentos (codigo, nome, ativo, orientacoes_paciente, modo_clinico)
       VALUES (?, ?, 1, ?, ?)`,
    )
    .run(
      dados.codigo?.trim() || null,
      dados.nome.trim(),
      dados.orientacoes_paciente?.trim() || null,
      dados.modo_clinico,
    );
  const id = Number(info.lastInsertRowid);
  const convenios = listarConvenios(db, false);
  for (const c of convenios) {
    db.prepare(
      `INSERT OR IGNORE INTO procedimento_precos (procedimento_id, convenio_id, valor_centavos, vigencia_inicio)
       VALUES (?, ?, 0, date('now', 'localtime'))`,
    ).run(id, c.id);
  }
  return db
    .prepare(`SELECT ${PROC_COLS} FROM procedimentos WHERE id = ?`)
    .get(id) as ProcedimentoRow;
}

export function atualizarProcedimento(
  id: number,
  dados: {
    codigo?: string | null;
    nome?: string;
    ativo?: number;
    orientacoes_paciente?: string | null;
    modo_clinico?: ModoClinico;
  },
  db: Database = getDb(),
): ProcedimentoRow {
  const atual = db
    .prepare(`SELECT ${PROC_COLS} FROM procedimentos WHERE id = ?`)
    .get(id) as ProcedimentoRow | undefined;
  if (!atual) throw new Error("Procedimento não encontrado");

  const modoNovo = dados.modo_clinico ?? atual.modo_clinico;
  assertModoClinico(modoNovo);
  const ativoNovo = dados.ativo ?? atual.ativo;

  assertPodeFicarSemModo(
    atual.modo_clinico,
    modoNovo,
    ativoNovo === 1,
    id,
    db,
  );

  if (ativoNovo === 0 && atual.ativo === 1) {
    if (temAgendamentoFuturo(id, db)) {
      throw new Error(
        "Não dá para desativar: há agendamento futuro com este procedimento.",
      );
    }
    if (procedimentoEmConta(id, db)) {
      throw new Error(
        "Procedimento já usado em contas — desative somente se não houver itens vinculados (use ativo=0 via edição)",
      );
    }
  }

  db.prepare(
    `UPDATE procedimentos
     SET codigo = ?, nome = ?, ativo = ?, orientacoes_paciente = ?, modo_clinico = ?
     WHERE id = ?`,
  ).run(
    dados.codigo !== undefined ? dados.codigo?.trim() || null : atual.codigo,
    dados.nome?.trim() || atual.nome,
    ativoNovo,
    dados.orientacoes_paciente !== undefined
      ? dados.orientacoes_paciente?.trim() || null
      : atual.orientacoes_paciente,
    modoNovo,
    id,
  );

  return db
    .prepare(`SELECT ${PROC_COLS} FROM procedimentos WHERE id = ?`)
    .get(id) as ProcedimentoRow;
}

export function atualizarOrientacoesPaciente(
  id: number,
  texto: string | null,
  db: Database = getDb(),
): ProcedimentoRow {
  return atualizarProcedimento(id, { orientacoes_paciente: texto }, db);
}

export function desativarProcedimento(
  id: number,
  db: Database = getDb(),
): ProcedimentoRow {
  return atualizarProcedimento(id, { ativo: 0 }, db);
}

export type MatrizPrecos = {
  convenios: ConvenioRow[];
  procedimentos: ProcedimentoRow[];
  precos: PrecoRow[];
};

export function obterMatrizPrecos(db: Database = getDb()): MatrizPrecos {
  return {
    convenios: listarConvenios(db, false),
    procedimentos: listarProcedimentos(undefined, false, db),
    precos: db
      .prepare(
        `SELECT id, procedimento_id, convenio_id, valor_centavos
         FROM procedimento_precos`,
      )
      .all() as PrecoRow[],
  };
}

export function salvarPrecos(
  itens: { procedimento_id: number; convenio_id: number; valor_centavos: number }[],
  db: Database = getDb(),
): MatrizPrecos {
  const tx = db.transaction(() => {
    const stmt = db.prepare(
      `INSERT INTO procedimento_precos (procedimento_id, convenio_id, valor_centavos, vigencia_inicio)
       VALUES (?, ?, ?, date('now', 'localtime'))
       ON CONFLICT(procedimento_id, convenio_id)
       DO UPDATE SET valor_centavos = excluded.valor_centavos`,
    );
    for (const item of itens) {
      if (item.valor_centavos < 0) {
        throw new Error("Valor não pode ser negativo");
      }
      const proc = db
        .prepare(`SELECT id FROM procedimentos WHERE id = ? AND ativo = 1`)
        .get(item.procedimento_id);
      const conv = db
        .prepare(`SELECT id FROM convenios WHERE id = ? AND ativo = 1`)
        .get(item.convenio_id);
      if (!proc || !conv) {
        throw new Error("Procedimento ou convênio inválido");
      }
      stmt.run(item.procedimento_id, item.convenio_id, item.valor_centavos);
    }
  });
  tx();
  return obterMatrizPrecos(db);
}
