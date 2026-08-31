-- Infraestrutura portada de d:\agenda (auth, licenca, recuperacao de senha)

CREATE TABLE IF NOT EXISTS sessoes_secret (
  id         INTEGER PRIMARY KEY CHECK (id = 1),
  secret     TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

ALTER TABLE usuarios ADD COLUMN senha_salt TEXT NOT NULL DEFAULT '';
ALTER TABLE usuarios ADD COLUMN updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'));

DROP TABLE IF EXISTS config_licenca;

CREATE TABLE IF NOT EXISTS licenca (
  id                   INTEGER PRIMARY KEY CHECK (id = 1),
  token                TEXT NOT NULL,
  cliente              TEXT,
  fingerprint          TEXT,
  emitida_em           TEXT,
  expira_em            TEXT,
  ultimo_dia_validado  TEXT,
  instalada_em         TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

ALTER TABLE clinica ADD COLUMN email TEXT;
ALTER TABLE clinica ADD COLUMN email_senha_hash TEXT;
ALTER TABLE clinica ADD COLUMN email_senha_salt TEXT;

CREATE TABLE IF NOT EXISTS recuperacao_senha_codigos (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  username     TEXT NOT NULL COLLATE NOCASE,
  email        TEXT NOT NULL,
  codigo_hash  TEXT NOT NULL,
  codigo_salt  TEXT NOT NULL,
  expira_em    TEXT NOT NULL,
  usado        INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_recuperacao_senha_user_email
  ON recuperacao_senha_codigos (username, email, usado, expira_em);

CREATE TABLE IF NOT EXISTS senhas_desbloqueio (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo       TEXT NOT NULL,
  codigo_hash  TEXT NOT NULL,
  codigo_salt  TEXT NOT NULL,
  usado        INTEGER NOT NULL DEFAULT 0,
  usado_em     TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_senhas_desbloqueio_usado ON senhas_desbloqueio (usado);
