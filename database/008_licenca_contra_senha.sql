-- Contra-senha de licença (prorrogação temporária) — Fase 4

ALTER TABLE licenca ADD COLUMN ultima_contra_senha TEXT;

CREATE TABLE IF NOT EXISTS licenca_contra_senhas_usadas (
  codigo_hash TEXT PRIMARY KEY,
  dias INTEGER NOT NULL,
  aplicada_em TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
