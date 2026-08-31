-- MedPronto — migração inicial (Fase 0)
-- Schema completo conforme Plano_MedPronto_v2.md

CREATE TABLE IF NOT EXISTS app_meta (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);

INSERT OR IGNORE INTO app_meta (chave, valor) VALUES ('versao_schema', '1');

-- Clínica
CREATE TABLE IF NOT EXISTS clinica (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  cnpj_cpf TEXT,
  telefone TEXT,
  endereco TEXT,
  logo_path TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- Licenciamento
CREATE TABLE IF NOT EXISTS config_licenca (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  data_instalacao TEXT NOT NULL DEFAULT (date('now', 'localtime')),
  data_vencimento TEXT,
  ultima_contra_senha TEXT
);

-- Usuários
CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  login TEXT NOT NULL UNIQUE,
  senha_hash TEXT NOT NULL,
  perfil TEXT NOT NULL CHECK (perfil IN ('admin', 'medico', 'secretaria')),
  crm TEXT,
  ativo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- Pacientes
CREATE TABLE IF NOT EXISTS pacientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  data_nasc TEXT,
  cpf TEXT,
  telefone TEXT,
  email TEXT,
  alergias TEXT,
  medicacoes_uso TEXT,
  observacoes_clinicas TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_pacientes_nome ON pacientes (nome);
CREATE INDEX IF NOT EXISTS idx_pacientes_cpf ON pacientes (cpf);

-- Agenda
CREATE TABLE IF NOT EXISTS agendamentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  paciente_id INTEGER NOT NULL REFERENCES pacientes (id),
  medico_id INTEGER NOT NULL REFERENCES usuarios (id),
  data TEXT NOT NULL,
  hora TEXT NOT NULL,
  duracao_minutos INTEGER NOT NULL DEFAULT 30,
  status TEXT NOT NULL DEFAULT 'agendado' CHECK (
    status IN (
      'agendado',
      'presente',
      'em_atendimento',
      'finalizado',
      'nao_compareceu',
      'cancelado'
    )
  ),
  observacao_agenda TEXT,
  confirmacao_enviada INTEGER NOT NULL DEFAULT 0,
  confirmacao_respondida INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_agendamentos_data ON agendamentos (data, medico_id, status);

CREATE TABLE IF NOT EXISTS agenda_bloqueios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  medico_id INTEGER NOT NULL REFERENCES usuarios (id),
  data_inicio TEXT NOT NULL,
  data_fim TEXT NOT NULL,
  motivo TEXT
);

-- Prontuário
CREATE TABLE IF NOT EXISTS prontuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  paciente_id INTEGER NOT NULL REFERENCES pacientes (id),
  agendamento_id INTEGER REFERENCES agendamentos (id),
  medico_id INTEGER NOT NULL REFERENCES usuarios (id),
  data_atendimento TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  queixa_principal TEXT,
  anamnese TEXT,
  exame_fisico TEXT,
  hipotese_diagnostica TEXT,
  cid_codigo TEXT,
  cid_descricao TEXT,
  conduta TEXT,
  plano TEXT,
  retificacao_de_id INTEGER REFERENCES prontuarios (id),
  motivo_retificacao TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_prontuarios_paciente ON prontuarios (paciente_id, data_atendimento DESC);

-- Receituário
CREATE TABLE IF NOT EXISTS receitas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prontuario_id INTEGER NOT NULL REFERENCES prontuarios (id),
  paciente_id INTEGER NOT NULL REFERENCES pacientes (id),
  medico_id INTEGER NOT NULL REFERENCES usuarios (id),
  data_emissao TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  observacoes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS receita_itens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  receita_id INTEGER NOT NULL REFERENCES receitas (id) ON DELETE CASCADE,
  medicamento TEXT NOT NULL,
  dosagem TEXT,
  via TEXT,
  posologia TEXT,
  quantidade TEXT,
  duracao_dias INTEGER
);

CREATE TABLE IF NOT EXISTS receita_modelos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  medico_id INTEGER NOT NULL REFERENCES usuarios (id),
  nome_modelo TEXT NOT NULL,
  itens_json TEXT NOT NULL
);

-- Documentos
CREATE TABLE IF NOT EXISTS atestados (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prontuario_id INTEGER NOT NULL REFERENCES prontuarios (id),
  paciente_id INTEGER NOT NULL REFERENCES pacientes (id),
  medico_id INTEGER NOT NULL REFERENCES usuarios (id),
  dias_afastamento INTEGER,
  cid_codigo TEXT,
  cid_descricao TEXT,
  texto_livre TEXT,
  data_emissao TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS pedidos_exame (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prontuario_id INTEGER NOT NULL REFERENCES prontuarios (id),
  paciente_id INTEGER NOT NULL REFERENCES pacientes (id),
  medico_id INTEGER NOT NULL REFERENCES usuarios (id),
  exames_solicitados TEXT NOT NULL,
  observacoes TEXT,
  data_emissao TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- Exames anexados
CREATE TABLE IF NOT EXISTS exames_anexos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  paciente_id INTEGER NOT NULL REFERENCES pacientes (id),
  paciente_nome TEXT,
  prontuario_id INTEGER REFERENCES prontuarios (id),
  data_upload TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  descricao TEXT,
  arquivo_path TEXT NOT NULL,
  uploaded_by INTEGER REFERENCES usuarios (id)
);

-- Auditoria
CREATE TABLE IF NOT EXISTS log_acesso (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER REFERENCES usuarios (id),
  paciente_id INTEGER REFERENCES pacientes (id),
  acao TEXT NOT NULL,
  detalhe TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- WhatsApp (Fase 6)
CREATE TABLE IF NOT EXISTS config_whatsapp (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  provedor TEXT,
  api_url TEXT,
  api_token TEXT,
  numero_origem TEXT,
  ativo INTEGER NOT NULL DEFAULT 0,
  template_confirmacao TEXT
);

CREATE TABLE IF NOT EXISTS log_whatsapp (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agendamento_id INTEGER REFERENCES agendamentos (id),
  paciente_id INTEGER REFERENCES pacientes (id),
  telefone TEXT,
  mensagem TEXT,
  status TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
