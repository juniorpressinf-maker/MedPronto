-- Admissional clínico (A0) — exame ocupacional separado do prontuário de consulta

CREATE TABLE IF NOT EXISTS admissionais (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  paciente_id INTEGER NOT NULL REFERENCES pacientes (id),
  agendamento_id INTEGER REFERENCES agendamentos (id),
  medico_id INTEGER NOT NULL REFERENCES usuarios (id),
  status TEXT NOT NULL DEFAULT 'em_preenchimento' CHECK (
    status IN ('em_preenchimento', 'finalizado', 'cancelado')
  ),
  conclusao TEXT CHECK (
    conclusao IN ('apto', 'inapto', 'apto_com_restricao')
  ),
  restricoes_texto TEXT,
  dados_json TEXT NOT NULL DEFAULT '{}',
  documento_path TEXT,
  exame_anexo_id INTEGER REFERENCES exames_anexos (id),
  finalizado_em TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  created_by INTEGER REFERENCES usuarios (id),
  updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_admissionais_paciente
  ON admissionais (paciente_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admissionais_status
  ON admissionais (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admissionais_medico
  ON admissionais (medico_id, created_at DESC);

INSERT OR IGNORE INTO app_meta (chave, valor) VALUES ('edicao', 'clinico');
