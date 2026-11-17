-- Catálogo de nomes para busca automática na receita e no pedido de exames.
-- Os documentos continuam gravando TEXTO: o catálogo só sugere, não é vínculo.

-- Nomes oficiais (ANVISA / TUSS, carregados no boot a partir de backend/data/*.json)
-- e nomes incluídos ou desativados pela clínica.
CREATE TABLE IF NOT EXISTS catalogo_itens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT NOT NULL CHECK (tipo IN ('medicamento', 'exame')),
  nome TEXT NOT NULL,
  nome_busca TEXT NOT NULL,
  origem TEXT NOT NULL DEFAULT 'oficial' CHECK (origem IN ('oficial', 'clinica')),
  ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  UNIQUE (tipo, nome_busca)
);

-- Índice de uso: o que foi receitado/pedido em cada prontuário (refeito a cada
-- salvamento, então o salvamento automático não infla a contagem). Alimenta a
-- ordenação (mais usados primeiro) e o "aprende sozinho" (nome fora do catálogo).
CREATE TABLE IF NOT EXISTS catalogo_uso (
  tipo TEXT NOT NULL CHECK (tipo IN ('medicamento', 'exame')),
  prontuario_id INTEGER NOT NULL REFERENCES prontuarios(id) ON DELETE CASCADE,
  medico_id INTEGER,
  nome_busca TEXT NOT NULL,
  nome TEXT NOT NULL,
  PRIMARY KEY (tipo, prontuario_id, nome_busca)
);
CREATE INDEX IF NOT EXISTS idx_catalogo_uso_busca ON catalogo_uso(tipo, nome_busca);

-- Variações de prescrição que o médico pediu para não sugerir mais.
CREATE TABLE IF NOT EXISTS prescricao_memoria_oculta (
  medico_id INTEGER NOT NULL,
  medicamento_busca TEXT NOT NULL,
  assinatura TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  PRIMARY KEY (medico_id, medicamento_busca, assinatura)
);
