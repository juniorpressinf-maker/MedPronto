import type { Database } from "better-sqlite3";
import { getDb } from "../db/index.js";
import {
  categoriaExamePorNome,
  chaveExame,
  type CategoriaExame,
} from "./classificacaoDocs.js";

/** Categorias que o médico corrigiu (chave do exame → categoria). */
export function carregarCorrecoesExame(db: Database = getDb()): Record<string, CategoriaExame> {
  const rows = db.prepare("SELECT nome_chave, categoria FROM exame_categoria").all() as {
    nome_chave: string;
    categoria: CategoriaExame;
  }[];
  return Object.fromEntries(rows.map((r) => [r.nome_chave, r.categoria]));
}

/**
 * Grava a correção. Se a escolha for igual à das palavras do nome, apaga a correção
 * (volta ao automático) — a tabela só guarda o que difere.
 */
export function salvarCorrecaoExame(
  nome: string,
  categoria: CategoriaExame,
  usuarioId: number | null,
  db: Database = getDb(),
): void {
  const chave = chaveExame(nome);
  if (!chave) return;
  if (categoriaExamePorNome(nome) === categoria) {
    db.prepare("DELETE FROM exame_categoria WHERE nome_chave = ?").run(chave);
    return;
  }
  db.prepare(
    `INSERT INTO exame_categoria (nome_chave, nome, categoria, atualizado_por)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (nome_chave) DO UPDATE SET
       nome = excluded.nome, categoria = excluded.categoria,
       atualizado_por = excluded.atualizado_por, updated_at = datetime('now', 'localtime')`,
  ).run(chave, nome.trim().toUpperCase(), categoria, usuarioId);
}
