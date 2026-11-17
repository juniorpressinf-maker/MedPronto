-- Chat 1:1 simplificado (substitui o modelo anterior)
-- Cada conversa armazena diretamente os dois participantes

DROP TABLE IF EXISTS chat_mensagens_lidas;
DROP TABLE IF EXISTS chat_mensagens;
DROP TABLE IF EXISTS chat_participantes;
DROP TABLE IF EXISTS chat_conversas;

CREATE TABLE chat_conversas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario1_id INTEGER NOT NULL,
  usuario2_id INTEGER NOT NULL,
  criado_em TEXT DEFAULT (datetime('now','localtime')),
  atualizado_em TEXT DEFAULT (datetime('now','localtime')),
  UNIQUE(usuario1_id, usuario2_id)
);

CREATE TABLE chat_mensagens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversa_id INTEGER NOT NULL,
  remetente_id INTEGER NOT NULL,
  texto TEXT NOT NULL,
  criado_em TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE chat_mensagens_lidas (
  mensagem_id INTEGER NOT NULL,
  usuario_id INTEGER NOT NULL,
  PRIMARY KEY (mensagem_id, usuario_id)
);

CREATE INDEX idx_chat_mensagens_conversa ON chat_mensagens(conversa_id, criado_em);
CREATE INDEX idx_chat_mensagens_lidas ON chat_mensagens_lidas(usuario_id, mensagem_id);