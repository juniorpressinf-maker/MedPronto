-- Chat interno (médico ↔ secretária / médico ↔ médico)
-- 2026-11-03

CREATE TABLE IF NOT EXISTS chat_conversas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  criado_em TEXT DEFAULT (datetime('now', 'localtime')),
  atualizado_em TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS chat_participantes (
  conversa_id INTEGER NOT NULL,
  usuario_id INTEGER NOT NULL,
  PRIMARY KEY (conversa_id, usuario_id),
  FOREIGN KEY (conversa_id) REFERENCES chat_conversas(id) ON DELETE CASCADE,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS chat_mensagens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversa_id INTEGER NOT NULL,
  remetente_id INTEGER NOT NULL,
  texto TEXT NOT NULL CHECK (length(trim(texto)) > 0),
  criado_em TEXT DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (conversa_id) REFERENCES chat_conversas(id) ON DELETE CASCADE,
  FOREIGN KEY (remetente_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS chat_mensagens_lidas (
  mensagem_id INTEGER NOT NULL,
  usuario_id INTEGER NOT NULL,
  lido_em TEXT DEFAULT (datetime('now', 'localtime')),
  PRIMARY KEY (mensagem_id, usuario_id),
  FOREIGN KEY (mensagem_id) REFERENCES chat_mensagens(id) ON DELETE CASCADE,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

-- Índices para performance de polling e listagem
CREATE INDEX IF NOT EXISTS idx_chat_mensagens_conversa_criado
  ON chat_mensagens(conversa_id, criado_em);

CREATE INDEX IF NOT EXISTS idx_chat_mensagens_lidas_usuario
  ON chat_mensagens_lidas(usuario_id, mensagem_id);