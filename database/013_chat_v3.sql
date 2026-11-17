-- Chat interno v3 - Design limpo e profissional
-- 2026-11-05

-- Remove tabelas antigas se existirem
DROP TABLE IF EXISTS chat_mensagens_lidas;
DROP TABLE IF EXISTS chat_mensagens;
DROP TABLE IF EXISTS chat_conversas;
DROP TABLE IF EXISTS chat_presenca;

-- ============================================
-- CONVERSAS (1:1)
-- ============================================
CREATE TABLE chat_conversas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario1_id INTEGER NOT NULL,
  usuario2_id INTEGER NOT NULL,
  criado_em TEXT DEFAULT (datetime('now','localtime')),
  atualizado_em TEXT DEFAULT (datetime('now','localtime')),
  UNIQUE(usuario1_id, usuario2_id),
  CHECK (usuario1_id < usuario2_id)
);

-- ============================================
-- MENSAGENS
-- ============================================
CREATE TABLE chat_mensagens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversa_id INTEGER NOT NULL,
  remetente_id INTEGER NOT NULL,
  texto TEXT NOT NULL CHECK (length(trim(texto)) > 0),
  criado_em TEXT DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (conversa_id) REFERENCES chat_conversas(id) ON DELETE CASCADE
);

-- ============================================
-- CONTROLE DE LEITURA
-- ============================================
CREATE TABLE chat_mensagens_lidas (
  mensagem_id INTEGER NOT NULL,
  usuario_id INTEGER NOT NULL,
  lido_em TEXT DEFAULT (datetime('now','localtime')),
  PRIMARY KEY (mensagem_id, usuario_id),
  FOREIGN KEY (mensagem_id) REFERENCES chat_mensagens(id) ON DELETE CASCADE
);

-- ============================================
-- PRESENÇA (online/offline)
-- ============================================
CREATE TABLE chat_presenca (
  usuario_id INTEGER PRIMARY KEY,
  ultima_atividade TEXT DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

-- ============================================
-- ÍNDICES
-- ============================================
CREATE INDEX idx_chat_conversas_usuario1 ON chat_conversas(usuario1_id);
CREATE INDEX idx_chat_conversas_usuario2 ON chat_conversas(usuario2_id);
CREATE INDEX idx_chat_mensagens_conversa ON chat_mensagens(conversa_id, criado_em);
CREATE INDEX idx_chat_mensagens_lidas_usuario ON chat_mensagens_lidas(usuario_id, mensagem_id);
CREATE INDEX idx_chat_presenca_atividade ON chat_presenca(ultima_atividade);