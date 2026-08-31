-- F0 — Fichas clínicas de consulta: templates + colunas de vínculo
-- Ver docs/MODULO_FICHAS_CLINICAS.md bloco F0

CREATE TABLE IF NOT EXISTS fichas_template (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  titulo_documento TEXT NOT NULL,
  modo TEXT NOT NULL DEFAULT 'secoes'
    CHECK (modo IN ('secoes', 'pdf_fundo')),
  campos_json TEXT NOT NULL,
  pdf_referencia_path TEXT,
  medico_id INTEGER REFERENCES usuarios (id),
  eh_default INTEGER NOT NULL DEFAULT 0,
  ativo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_fichas_template_medico
  ON fichas_template (medico_id, ativo);

CREATE INDEX IF NOT EXISTS idx_fichas_template_default
  ON fichas_template (eh_default, medico_id)
  WHERE eh_default = 1;

ALTER TABLE agendamentos ADD COLUMN ficha_template_id INTEGER
  REFERENCES fichas_template (id);

ALTER TABLE prontuarios ADD COLUMN ficha_template_id INTEGER
  REFERENCES fichas_template (id);

ALTER TABLE prontuarios ADD COLUMN template_snapshot_json TEXT;

ALTER TABLE prontuarios ADD COLUMN dados_json TEXT;

-- Seed: Consulta — clínica geral (espelha AtendimentoPage + prontuarios)
INSERT INTO fichas_template (
  nome,
  titulo_documento,
  modo,
  campos_json,
  medico_id,
  eh_default,
  ativo
)
SELECT
  'Consulta — clínica geral',
  'Prontuário de consulta',
  'secoes',
  '[
    {"id":"queixa_principal","label":"Queixa principal:","tipo":"textarea","ordem":1},
    {"id":"anamnese","label":"Anamnese:","tipo":"textarea","ordem":2},
    {"id":"exame_fisico","label":"Exame físico:","tipo":"textarea","ordem":3},
    {"id":"hipotese_diagnostica","label":"Hipótese diagnóstica:","tipo":"textarea","ordem":4},
    {"id":"conduta","label":"Conduta:","tipo":"textarea","ordem":5},
    {"id":"plano","label":"Plano:","tipo":"textarea","ordem":6},
    {"id":"cid","label":"CID-10","tipo":"cid","ordem":7},
    {"id":"retorno","label":"Retorno (dias)","tipo":"retorno","ordem":8}
  ]',
  NULL,
  1,
  1
WHERE NOT EXISTS (
  SELECT 1 FROM fichas_template WHERE eh_default = 1 AND medico_id IS NULL
);
