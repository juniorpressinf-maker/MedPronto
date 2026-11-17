/**
 * Catálogo de nomes (medicamentos e exames) para a busca automática na receita e no
 * pedido de exames, e a "memória de prescrição" do médico.
 *
 * - Os documentos continuam gravando TEXTO; nada aqui é vínculo (receita antiga não muda).
 * - Busca: catálogo oficial (ANVISA/TUSS) + nomes já usados na clínica ("aprende sozinho"),
 *   ordenados pelo uso do médico, depois pelo uso da clínica.
 * - Uso: `catalogo_uso` é REFEITO para o prontuário a cada salvamento (idempotente — o
 *   salvamento automático não infla contagem nem deixa nome digitado pela metade).
 * - Memória: lida direto de `receita_itens` do médico (inclui o histórico antigo).
 */
import type Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { getDb } from "../db/index.js";

export type TipoCatalogo = "medicamento" | "exame";

export type SugestaoCatalogo = { nome: string; usos: number };

export type VariacaoPrescricao = {
  assinatura: string;
  dosagem: string | null;
  via: string | null;
  posologia: string | null;
  quantidade: string | null;
  duracao_dias: number | null;
  usos: number;
};

/** Minúsculo, sem acento, espaços simples — chave de comparação e de busca. */
export function normalizarNomeCatalogo(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const comFuncao = new WeakSet<Database.Database>();

/** Registra mp_norm() na conexão (uma vez por conexão). */
function garantirFuncaoNorm(db: Database.Database): void {
  if (comFuncao.has(db)) return;
  db.function("mp_norm", { deterministic: true }, (v: unknown) =>
    v == null ? "" : normalizarNomeCatalogo(String(v)),
  );
  comFuncao.add(db);
}

const ARQUIVO: Record<TipoCatalogo, string> = {
  medicamento: "catalogo_medicamentos.json",
  exame: "catalogo_exames.json",
};

/**
 * Carrega a lista oficial (backend/recursos/*.json) no banco na primeira vez (tabela sem itens oficiais do tipo).
 * Atualização da lista: novo JSON + `INSERT OR IGNORE` (não duplica, não reativa o que
 * a clínica desativou).
 */
export function garantirCatalogosIniciais(db: Database.Database = getDb()): void {
  for (const tipo of Object.keys(ARQUIVO) as TipoCatalogo[]) {
    const arquivo = path.join(config.catalogosDir, ARQUIVO[tipo]);
    if (!fs.existsSync(arquivo)) continue;
    const jaTem = db
      .prepare(`SELECT 1 FROM catalogo_itens WHERE tipo = ? AND origem = 'oficial' LIMIT 1`)
      .get(tipo);
    if (jaTem) continue;
    let nomes: unknown;
    try {
      nomes = JSON.parse(fs.readFileSync(arquivo, "utf8"));
    } catch (err) {
      console.warn(`[catalogo] ${ARQUIVO[tipo]} inválido:`, err);
      continue;
    }
    if (!Array.isArray(nomes)) continue;
    const ins = db.prepare(
      `INSERT OR IGNORE INTO catalogo_itens (tipo, nome, nome_busca, origem) VALUES (?, ?, ?, 'oficial')`,
    );
    db.transaction(() => {
      for (const n of nomes as unknown[]) {
        const nome = String(n ?? "").trim();
        if (nome) ins.run(tipo, nome, normalizarNomeCatalogo(nome));
      }
    })();
  }
}

function escaparLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Cada palavra digitada precisa aparecer (em qualquer ordem). */
function filtroPalavras(coluna: string, termo: string): { sql: string; params: string[] } {
  const palavras = normalizarNomeCatalogo(termo).split(" ").filter(Boolean).slice(0, 6);
  return {
    sql: palavras.map(() => `${coluna} LIKE ? ESCAPE '\\'`).join(" AND ") || "1 = 1",
    params: palavras.map((p) => `%${escaparLike(p)}%`),
  };
}

/** Busca para o autocomplete. `medicoId` prioriza o que esse médico mais usa. */
export function buscarCatalogo(
  tipo: TipoCatalogo,
  termo: string,
  medicoId: number | null,
  limite = 15,
  db: Database.Database = getDb(),
): SugestaoCatalogo[] {
  const q = normalizarNomeCatalogo(termo);
  if (q.length < 2) return [];
  const prefixo = `${escaparLike(q)}%`;

  const fCat = filtroPalavras("nome_busca", q);
  const catalogo = db
    .prepare(
      `SELECT nome, nome_busca, ativo FROM catalogo_itens
       WHERE tipo = ? AND ${fCat.sql}
       ORDER BY (nome_busca LIKE ? ESCAPE '\\') DESC, length(nome_busca), nome_busca
       LIMIT 300`,
    )
    .all(tipo, ...fCat.params, prefixo) as { nome: string; nome_busca: string; ativo: number }[];

  const fUso = filtroPalavras("nome_busca", q);
  const usos = db
    .prepare(
      `SELECT nome_busca, MAX(nome) AS nome, COUNT(*) AS usos,
              SUM(CASE WHEN medico_id = ? THEN 1 ELSE 0 END) AS usos_medico
       FROM catalogo_uso
       WHERE tipo = ? AND ${fUso.sql}
       GROUP BY nome_busca`,
    )
    .all(medicoId ?? -1, tipo, ...fUso.params) as {
    nome_busca: string;
    nome: string;
    usos: number;
    usos_medico: number;
  }[];

  type Cand = { nome: string; busca: string; usos: number; usosMedico: number };
  const mapa = new Map<string, Cand>();
  const inativos = new Set<string>();
  for (const c of catalogo) {
    if (!c.ativo) inativos.add(c.nome_busca);
    else mapa.set(c.nome_busca, { nome: c.nome, busca: c.nome_busca, usos: 0, usosMedico: 0 });
  }
  for (const u of usos) {
    if (inativos.has(u.nome_busca)) continue;
    const atual = mapa.get(u.nome_busca);
    if (atual) {
      atual.usos = u.usos;
      atual.usosMedico = u.usos_medico;
    } else if (
      // Nome usado na clínica fora do catálogo: só entra se não foi desativado no cadastro.
      !db.prepare(`SELECT 1 FROM catalogo_itens WHERE tipo = ? AND nome_busca = ? AND ativo = 0`).get(tipo, u.nome_busca)
    ) {
      mapa.set(u.nome_busca, { nome: u.nome, busca: u.nome_busca, usos: u.usos, usosMedico: u.usos_medico });
    }
  }

  return [...mapa.values()]
    .sort(
      (a, b) =>
        b.usosMedico - a.usosMedico ||
        b.usos - a.usos ||
        Number(b.busca.startsWith(q)) - Number(a.busca.startsWith(q)) ||
        a.busca.length - b.busca.length ||
        a.busca.localeCompare(b.busca),
    )
    .slice(0, limite)
    .map((c) => ({ nome: c.nome, usos: c.usos }));
}

/**
 * Refaz o índice de uso do prontuário com os nomes do documento salvo.
 * Chamar DENTRO da transação do salvamento.
 */
export function registrarUsoProntuario(
  db: Database.Database,
  tipo: TipoCatalogo,
  prontuarioId: number,
  medicoId: number | null,
  nomes: string[],
): void {
  db.prepare(`DELETE FROM catalogo_uso WHERE tipo = ? AND prontuario_id = ?`).run(tipo, prontuarioId);
  const ins = db.prepare(
    `INSERT OR IGNORE INTO catalogo_uso (tipo, prontuario_id, medico_id, nome_busca, nome)
     VALUES (?, ?, ?, ?, ?)`,
  );
  for (const bruto of nomes) {
    const nome = bruto.replace(/\s+/g, " ").trim();
    const busca = normalizarNomeCatalogo(nome);
    if (busca.length >= 2) ins.run(tipo, prontuarioId, medicoId, busca, nome);
  }
}

/** Linhas do texto do pedido de exames (um exame por linha). */
export function examesDoTexto(texto: string): string[] {
  return texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

function assinaturaVariacao(v: {
  dosagem: string | null;
  via: string | null;
  posologia: string | null;
  quantidade: string | null;
  duracao_dias: number | null;
}): string {
  return [v.dosagem, v.via, v.posologia, v.quantidade, v.duracao_dias == null ? "" : String(v.duracao_dias)]
    .map((x) => normalizarNomeCatalogo(x ?? ""))
    .join("|");
}

/**
 * Como ESTE médico costuma prescrever o medicamento (até 3 variações, mais usada
 * primeiro). Só receitas EMITIDAS (impressas ou de consulta encerrada) — o que está
 * só digitado/salvo não conta (o painel usa as linhas da própria tela à parte);
 * ignora as variações que o médico ocultou.
 */
export function memoriaPrescricao(
  medicoId: number,
  medicamento: string,
  db: Database.Database = getDb(),
): VariacaoPrescricao[] {
  const busca = normalizarNomeCatalogo(medicamento);
  if (busca.length < 2) return [];
  garantirFuncaoNorm(db);
  const linhas = db
    .prepare(
      `SELECT MAX(ri.dosagem) AS dosagem, MAX(ri.via) AS via, MAX(ri.posologia) AS posologia,
              MAX(ri.quantidade) AS quantidade, ri.duracao_dias AS duracao_dias,
              COUNT(*) AS usos, MAX(r.id) AS ultimo
       FROM receita_itens ri
       JOIN receitas r ON r.id = ri.receita_id
       JOIN prontuarios p ON p.id = r.prontuario_id
       LEFT JOIN agendamentos a ON a.id = p.agendamento_id
       WHERE r.medico_id = ? AND mp_norm(ri.medicamento) = ?
         -- só receitas EMITIDAS: impressas (têm uso registrado) ou de consulta encerrada
         AND (
           EXISTS (SELECT 1 FROM catalogo_uso cu WHERE cu.tipo = 'medicamento' AND cu.prontuario_id = r.prontuario_id)
           OR a.status = 'finalizado'
           OR trim(COALESCE(p.template_snapshot_json, '')) <> ''
         )
       GROUP BY mp_norm(ri.dosagem), mp_norm(ri.via), mp_norm(ri.posologia),
                mp_norm(ri.quantidade), ri.duracao_dias
       ORDER BY usos DESC, ultimo DESC
       LIMIT 20`,
    )
    .all(medicoId, busca) as (Omit<VariacaoPrescricao, "assinatura"> & {
    ultimo: number;
  })[];

  const ocultas = new Set(variacoesOcultas(medicoId, medicamento, db));

  const out: VariacaoPrescricao[] = [];
  for (const l of linhas) {
    const assinatura = assinaturaVariacao(l);
    if (assinatura.replace(/\|/g, "") === "" || ocultas.has(assinatura)) continue;
    out.push({
      assinatura,
      dosagem: l.dosagem,
      via: l.via,
      posologia: l.posologia,
      quantidade: l.quantidade,
      duracao_dias: l.duracao_dias,
      usos: l.usos,
    });
    if (out.length === 3) break;
  }
  return out;
}

/** O médico pede para não sugerir mais uma variação (ex.: digitada errada). */
export function ocultarVariacaoPrescricao(
  medicoId: number,
  medicamento: string,
  assinatura: string,
  db: Database.Database = getDb(),
): void {
  db.prepare(
    `INSERT OR IGNORE INTO prescricao_memoria_oculta (medico_id, medicamento_busca, assinatura)
     VALUES (?, ?, ?)`,
  ).run(medicoId, normalizarNomeCatalogo(medicamento), assinatura);
}

// ------------------------------------------------------------------ cadastro (tela)

export type ItemCatalogo = {
  id: number | null;
  nome: string;
  origem: "oficial" | "clinica" | "uso";
  ativo: boolean;
  usos: number;
};

export class CatalogoError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

/** Lista para a tela de cadastro (inclui desativados e nomes só usados). */
export function listarCatalogo(
  tipo: TipoCatalogo,
  termo: string,
  limite = 100,
  db: Database.Database = getDb(),
): ItemCatalogo[] {
  const f = filtroPalavras("ci.nome_busca", termo);
  const fu = filtroPalavras("u.nome_busca", termo);
  const rows = db
    .prepare(
      `SELECT ci.id, ci.nome, ci.origem, ci.ativo,
              (SELECT COUNT(*) FROM catalogo_uso u WHERE u.tipo = ci.tipo AND u.nome_busca = ci.nome_busca) AS usos
       FROM catalogo_itens ci
       WHERE ci.tipo = ? AND ${f.sql}
       UNION ALL
       SELECT NULL, MAX(u.nome), 'uso', 1, COUNT(*)
       FROM catalogo_uso u
       WHERE u.tipo = ? AND ${fu.sql}
         AND NOT EXISTS (SELECT 1 FROM catalogo_itens c2 WHERE c2.tipo = u.tipo AND c2.nome_busca = u.nome_busca)
       GROUP BY u.nome_busca
       ORDER BY 5 DESC, 2
       LIMIT ?`,
    )
    .all(tipo, ...f.params, tipo, ...fu.params, limite) as {
    id: number | null;
    nome: string;
    origem: ItemCatalogo["origem"];
    ativo: number;
    usos: number;
  }[];
  return rows.map((r) => ({ ...r, ativo: Boolean(r.ativo) }));
}

/** Inclui nome da clínica (ou reativa/atualiza se já existe). Também usado para desativar nome só usado. */
export function salvarNomeCatalogo(
  tipo: TipoCatalogo,
  nome: string,
  ativo: boolean,
  db: Database.Database = getDb(),
): ItemCatalogo {
  const limpo = nome.replace(/\s+/g, " ").trim().toUpperCase();
  const busca = normalizarNomeCatalogo(limpo);
  if (busca.length < 2) throw new CatalogoError("Informe o nome (mínimo 2 letras).");
  const existe = db
    .prepare(`SELECT id FROM catalogo_itens WHERE tipo = ? AND nome_busca = ?`)
    .get(tipo, busca) as { id: number } | undefined;
  if (existe) {
    db.prepare(`UPDATE catalogo_itens SET ativo = ? WHERE id = ?`).run(ativo ? 1 : 0, existe.id);
  } else {
    db.prepare(
      `INSERT INTO catalogo_itens (tipo, nome, nome_busca, origem, ativo) VALUES (?, ?, ?, 'clinica', ?)`,
    ).run(tipo, limpo, busca, ativo ? 1 : 0);
  }
  return obterItem(tipo, busca, db);
}

/** Renomeia / ativa / desativa um item do catálogo. */
export function atualizarItemCatalogo(
  tipo: TipoCatalogo,
  id: number,
  dados: { nome?: string; ativo?: boolean },
  db: Database.Database = getDb(),
): ItemCatalogo {
  const atual = db
    .prepare(`SELECT id, nome_busca FROM catalogo_itens WHERE id = ? AND tipo = ?`)
    .get(id, tipo) as { id: number; nome_busca: string } | undefined;
  if (!atual) throw new CatalogoError("Item não encontrado.", 404);
  let busca = atual.nome_busca;
  if (dados.nome !== undefined) {
    const limpo = dados.nome.replace(/\s+/g, " ").trim().toUpperCase();
    busca = normalizarNomeCatalogo(limpo);
    if (busca.length < 2) throw new CatalogoError("Informe o nome (mínimo 2 letras).");
    const outro = db
      .prepare(`SELECT 1 FROM catalogo_itens WHERE tipo = ? AND nome_busca = ? AND id <> ?`)
      .get(tipo, busca, id);
    if (outro) throw new CatalogoError("Já existe um item com esse nome.", 409);
    db.prepare(`UPDATE catalogo_itens SET nome = ?, nome_busca = ?, origem = 'clinica' WHERE id = ?`).run(
      limpo,
      busca,
      id,
    );
  }
  if (dados.ativo !== undefined) {
    db.prepare(`UPDATE catalogo_itens SET ativo = ? WHERE id = ?`).run(dados.ativo ? 1 : 0, id);
  }
  return obterItem(tipo, busca, db);
}

function obterItem(tipo: TipoCatalogo, busca: string, db: Database.Database): ItemCatalogo {
  const r = db
    .prepare(
      `SELECT id, nome, origem, ativo,
              (SELECT COUNT(*) FROM catalogo_uso u WHERE u.tipo = ci.tipo AND u.nome_busca = ci.nome_busca) AS usos
       FROM catalogo_itens ci WHERE tipo = ? AND nome_busca = ?`,
    )
    .get(tipo, busca) as { id: number; nome: string; origem: "oficial" | "clinica"; ativo: number; usos: number };
  return { ...r, ativo: Boolean(r.ativo) };
}

/** Assinaturas que o médico pediu para não sugerir (o painel filtra também as linhas da tela). */
export function variacoesOcultas(
  medicoId: number,
  medicamento: string,
  db: Database.Database = getDb(),
): string[] {
  return (
    db
      .prepare(`SELECT assinatura FROM prescricao_memoria_oculta WHERE medico_id = ? AND medicamento_busca = ?`)
      .all(medicoId, normalizarNomeCatalogo(medicamento)) as { assinatura: string }[]
  ).map((o) => o.assinatura);
}

/**
 * "Aprende" com os documentos EMITIDOS do prontuário: receita e pedido de exames como
 * estão gravados. Chamado ao imprimir (PDF) e ao finalizar a consulta — nunca no
 * salvamento automático (texto de busca parado na linha não vira sugestão).
 * Idempotente: refaz o índice do prontuário.
 */
export function registrarUsoDocumentos(prontuarioId: number, db: Database.Database = getDb()): void {
  const pr = db.prepare(`SELECT medico_id FROM prontuarios WHERE id = ?`).get(prontuarioId) as
    | { medico_id: number }
    | undefined;
  if (!pr) return;
  const meds = (
    db
      .prepare(
        `SELECT ri.medicamento FROM receita_itens ri
         JOIN receitas r ON r.id = ri.receita_id
         WHERE r.prontuario_id = ?`,
      )
      .all(prontuarioId) as { medicamento: string }[]
  ).map((r) => r.medicamento);
  const pedido = db
    .prepare(`SELECT exames_solicitados FROM pedidos_exame WHERE prontuario_id = ? ORDER BY id DESC LIMIT 1`)
    .get(prontuarioId) as { exames_solicitados: string } | undefined;
  db.transaction(() => {
    registrarUsoProntuario(db, "medicamento", prontuarioId, pr.medico_id, meds);
    registrarUsoProntuario(db, "exame", prontuarioId, pr.medico_id, examesDoTexto(pedido?.exames_solicitados ?? ""));
  })();
}

/**
 * Consultas já ENCERRADAS (finalizadas) que ainda não entraram no índice de uso
 * (ex.: finalizadas antes desta função existir). Roda no boot; só pega as pendentes.
 */
export function registrarUsoEncerradosPendentes(db: Database.Database = getDb()): number {
  const ids = (
    db
      .prepare(
        `SELECT p.id FROM prontuarios p
         LEFT JOIN agendamentos a ON a.id = p.agendamento_id
         WHERE (a.status = 'finalizado' OR trim(COALESCE(p.template_snapshot_json, '')) <> '')
           AND NOT EXISTS (SELECT 1 FROM catalogo_uso cu WHERE cu.prontuario_id = p.id)
           AND (EXISTS (SELECT 1 FROM receitas r WHERE r.prontuario_id = p.id)
                OR EXISTS (SELECT 1 FROM pedidos_exame pe WHERE pe.prontuario_id = p.id))`,
      )
      .all() as { id: number }[]
  ).map((r) => r.id);
  for (const id of ids) registrarUsoDocumentos(id, db);
  return ids.length;
}
