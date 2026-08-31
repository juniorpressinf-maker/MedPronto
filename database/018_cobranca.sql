-- M0 — fundação cobrança (tabelas vazias; lógica nos blocos M1+)

CREATE TABLE IF NOT EXISTS convenios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'operadora' CHECK (tipo IN ('particular', 'operadora')),
  ativo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS procedimentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT,
  nome TEXT NOT NULL,
  categoria TEXT,
  ativo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS procedimento_precos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  procedimento_id INTEGER NOT NULL REFERENCES procedimentos (id),
  convenio_id INTEGER NOT NULL REFERENCES convenios (id),
  valor_centavos INTEGER NOT NULL DEFAULT 0,
  vigencia_inicio TEXT,
  vigencia_fim TEXT,
  UNIQUE (procedimento_id, convenio_id)
);

CREATE TABLE IF NOT EXISTS contas_atendimento (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  paciente_id INTEGER NOT NULL REFERENCES pacientes (id),
  data TEXT NOT NULL,
  convenio_id INTEGER REFERENCES convenios (id),
  agendamento_id INTEGER REFERENCES agendamentos (id),
  prontuario_id INTEGER REFERENCES prontuarios (id),
  status TEXT NOT NULL DEFAULT 'em_aberto',
  observacao TEXT,
  valor_desconto_centavos INTEGER NOT NULL DEFAULT 0,
  motivo_desconto TEXT,
  fechada_em TEXT,
  fechada_por INTEGER REFERENCES usuarios (id),
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  created_by INTEGER REFERENCES usuarios (id)
);

CREATE TABLE IF NOT EXISTS conta_itens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conta_id INTEGER NOT NULL REFERENCES contas_atendimento (id),
  procedimento_id INTEGER REFERENCES procedimentos (id),
  executado_por INTEGER REFERENCES usuarios (id),
  status TEXT NOT NULL DEFAULT 'previsto',
  valor_centavos INTEGER NOT NULL DEFAULT 0,
  quantidade INTEGER NOT NULL DEFAULT 1,
  solicitado_por INTEGER REFERENCES usuarios (id),
  solicitado_em TEXT,
  realizado_em TEXT,
  exame_anexo_id INTEGER,
  admissional_id INTEGER REFERENCES admissionais (id),
  observacao TEXT
);

CREATE TABLE IF NOT EXISTS conta_pagamentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conta_id INTEGER NOT NULL REFERENCES contas_atendimento (id),
  forma TEXT NOT NULL,
  valor_centavos INTEGER NOT NULL,
  registrado_em TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  registrado_por INTEGER REFERENCES usuarios (id),
  observacao TEXT
);

CREATE TABLE IF NOT EXISTS conta_convenio_guia (
  conta_id INTEGER PRIMARY KEY REFERENCES contas_atendimento (id),
  numero_guia TEXT,
  senha TEXT,
  autorizacao TEXT,
  data_envio TEXT,
  observacao TEXT
);

INSERT OR IGNORE INTO convenios (id, nome, tipo, ativo) VALUES (1, 'Particular', 'particular', 1);
