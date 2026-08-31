import type Database from "better-sqlite3";
import { getDb } from "../db/index.js";

const NOME_PADRAO = "ASO — padrão clínica";

const CAMPOS_PADRAO = [
  {
    id: "tipo_atestado",
    label: "Tipo de atestado",
    tipo: "escolha",
    ordem: 1,
    obrigatorio: true,
    opcoes: [
      "admissional",
      "demissional",
      "periodico",
      "retorno_trabalho",
      "mudanca_funcao",
    ],
  },
  { id: "empresa", label: "Nome da Empresa", tipo: "text", ordem: 2, obrigatorio: true },
  { id: "ci", label: "C.I.", tipo: "text", ordem: 3 },
  { id: "funcao", label: "Função", tipo: "text", ordem: 4 },
  {
    id: "riscos_texto",
    label: "Riscos ocupacionais (descrição)",
    tipo: "textarea",
    ordem: 5,
  },
  {
    id: "quimicos",
    label: "Agentes químicos",
    tipo: "marcadores",
    ordem: 6,
    opcoes: [
      "Detergente",
      "Desinfetante",
      "Álcool Etílico",
      "Sabão Líquido",
      "Ferro",
      "Poeira",
      "Hipoclorito de sódio 1%",
      "Clorado 10%",
      "Hidrocarbonetos",
      "Organofosforado",
      "Cromo",
      "Fosfina",
      "Tolueno",
      "Xileno",
      "Benzeno",
      "Etilbenzeno",
      "Níquel",
      "Chumbo",
      "Estanho",
      "Hidróxido de sódio",
      "Pigmento",
      "Resina",
      "Cimento",
      "Piretroides",
    ],
  },
  {
    id: "fisicos",
    label: "Agentes físicos",
    tipo: "marcadores",
    ordem: 7,
    opcoes: ["Calor", "Frio", "Radiação UV", "Ruído", "Umidade"],
  },
  { id: "biologicos", label: "Agentes biológicos", tipo: "checkbox", ordem: 8 },
  { id: "ergonomicos", label: "Ergonômicos", tipo: "checkbox", ordem: 9 },
  {
    id: "acidentes",
    label: "Riscos de acidentes",
    tipo: "marcadores",
    ordem: 10,
    opcoes: ["Quedas", "Choque", "Outros"],
  },
  { id: "riscos_outros", label: "Outros riscos", tipo: "text", ordem: 11 },
  {
    id: "exames",
    label: "Exames realizados",
    tipo: "marcadores",
    ordem: 12,
    opcoes: [
      "Exame Clínico",
      "Audiometria",
      "Avaliação vocal",
      "Acuidade Visual",
      "ECG",
      "EEG",
      "Hemograma",
      "Glicemia",
      "Anti - Hbs",
      "HBS-ag",
      "Anti-Hcv",
      "Rx Tórax",
      "Rx coluna vertebral",
    ],
  },
  { id: "exames_outros", label: "Outros exames", tipo: "text", ordem: 13 },
  {
    id: "nr35",
    label: "NR 35 — trabalho em altura",
    tipo: "escolha",
    ordem: 14,
    opcoes: ["apto_altura", "inapto_altura", "nao_aplica"],
  },
  { id: "observacoes", label: "Observações", tipo: "textarea", ordem: 15 },
  {
    id: "conclusao",
    label: "Conclusão",
    tipo: "escolha",
    ordem: 16,
    obrigatorio: true,
    opcoes: ["apto", "inapto", "apto_com_restricao"],
  },
];

function temColunaDestino(db: Database.Database): boolean {
  const cols = db.prepare(`PRAGMA table_info(fichas_template)`).all() as {
    name: string;
  }[];
  return cols.some((c) => c.name === "destino");
}

function asoDefaultId(db: Database.Database): number | null {
  const row = db
    .prepare(
      `SELECT id FROM fichas_template
       WHERE destino = 'aso' AND eh_default = 1 AND medico_id IS NULL
       LIMIT 1`,
    )
    .get() as { id: number } | undefined;
  return row?.id ?? null;
}

function recrearTriggerDestinoImutavel(db: Database.Database): void {
  db.exec(`
    DROP TRIGGER IF EXISTS trg_ficha_destino_imutavel;
    CREATE TRIGGER trg_ficha_destino_imutavel
    BEFORE UPDATE OF destino ON fichas_template
    FOR EACH ROW
    WHEN OLD.destino IS NOT NEW.destino
    BEGIN
      SELECT RAISE(ABORT, 'Destino do modelo não pode ser alterado');
    END;
  `);
}

function marcarPrimeiroAsoComoPadrao(db: Database.Database): boolean {
  const row = db
    .prepare(
      `SELECT id FROM fichas_template
       WHERE destino = 'aso' AND medico_id IS NULL AND ativo = 1
       ORDER BY id LIMIT 1`,
    )
    .get() as { id: number } | undefined;
  if (!row) return false;
  db.prepare(
    `UPDATE fichas_template SET eh_default = 0, updated_at = datetime('now', 'localtime')
     WHERE destino = 'aso' AND medico_id IS NULL AND eh_default = 1`,
  ).run();
  db.prepare(
    `UPDATE fichas_template SET eh_default = 1, ativo = 1, updated_at = datetime('now', 'localtime')
     WHERE id = ?`,
  ).run(row.id);
  return true;
}

function moverSeedDeslocado(db: Database.Database): boolean {
  const row = db
    .prepare(
      `SELECT id FROM fichas_template
       WHERE medico_id IS NULL
         AND (destino IS NULL OR destino <> 'aso')
         AND (nome = ? OR nome LIKE 'ASO%padrão clínica' OR nome LIKE 'ASO%padrao clinica')
       LIMIT 1`,
    )
    .get(NOME_PADRAO) as { id: number } | undefined;
  if (!row) return false;
  db.exec(`DROP TRIGGER IF EXISTS trg_ficha_destino_imutavel`);
  try {
    db.prepare(
      `UPDATE fichas_template
       SET destino = 'aso', eh_default = 1, ativo = 1, updated_at = datetime('now', 'localtime')
       WHERE id = ?`,
    ).run(row.id);
  } finally {
    recrearTriggerDestinoImutavel(db);
  }
  return true;
}

function inserirSeed(db: Database.Database): void {
  db.prepare(
    `INSERT INTO fichas_template (
       nome, titulo_documento, modo, campos_json, medico_id, eh_default, ativo, destino
     ) VALUES (?, ?, 'secoes', ?, NULL, 1, 1, 'aso')`,
  ).run(NOME_PADRAO, "Atestado de Saúde Ocupacional", JSON.stringify(CAMPOS_PADRAO));
}

/** Garante o modelo ASO padrão da clínica (AM1), mesmo se a 043 já tinha rodado sem o seed. */
export function garantirAsoModeloPadrao(): void {
  try {
    const db = getDb();
    if (!temColunaDestino(db)) return;
    if (asoDefaultId(db) != null) return;
    if (marcarPrimeiroAsoComoPadrao(db)) return;
    if (moverSeedDeslocado(db)) return;
    inserirSeed(db);
  } catch (e) {
    console.error("[MedPronto] não foi possível garantir o modelo ASO padrão:", e);
  }
}
