// REINICIALIZAÇÃO TOTAL DO CHAT INTERNO (modelo 1:1)
// Execute com: node limpar-chat.js

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'medpronto.db');
console.log('REINICIALIZANDO CHAT em:', dbPath);

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

try {
  // 1. Apaga tudo
  db.prepare('DROP TABLE IF EXISTS chat_mensagens_lidas').run();
  db.prepare('DROP TABLE IF EXISTS chat_mensagens').run();
  db.prepare('DROP TABLE IF EXISTS chat_conversas').run();

  // 2. Recria schema correto (modelo 1:1 com UNIQUE)
  db.prepare(`
    CREATE TABLE chat_conversas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario1_id INTEGER NOT NULL,
      usuario2_id INTEGER NOT NULL,
      criado_em TEXT DEFAULT (datetime('now','localtime')),
      atualizado_em TEXT DEFAULT (datetime('now','localtime')),
      UNIQUE(usuario1_id, usuario2_id)
    )
  `).run();

  db.prepare(`
    CREATE TABLE chat_mensagens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversa_id INTEGER NOT NULL,
      remetente_id INTEGER NOT NULL,
      texto TEXT NOT NULL,
      criado_em TEXT DEFAULT (datetime('now','localtime'))
    )
  `).run();

  db.prepare(`
    CREATE TABLE chat_mensagens_lidas (
      mensagem_id INTEGER NOT NULL,
      usuario_id INTEGER NOT NULL,
      PRIMARY KEY (mensagem_id, usuario_id)
    )
  `).run();

  // 3. Índices
  db.prepare('CREATE INDEX idx_chat_mensagens_conversa ON chat_mensagens(conversa_id, criado_em)').run();
  db.prepare('CREATE INDEX idx_chat_mensagens_lidas ON chat_mensagens_lidas(usuario_id, mensagem_id)').run();

  console.log('Chat reinicializado com sucesso (schema v2 1:1).');
} catch (e) {
  console.error('Erro:', e.message);
} finally {
  db.close();
}