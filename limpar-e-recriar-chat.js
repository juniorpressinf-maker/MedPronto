// ============================================================
// CHAT INTERNO v3 - LIMPEZA TOTAL + NOVO SCHEMA
// Execute com: node limpar-e-recriar-chat.js
// ============================================================

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'data', 'medpronto.db');
console.log('=== CHAT v3 - Limpeza e recriação ===');
console.log('Banco:', dbPath);

if (!fs.existsSync(dbPath)) {
  console.error('ERRO: Banco não encontrado em', dbPath);
  process.exit(1);
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

try {
  console.log('\n[1/4] Removendo tabelas antigas...');
  db.prepare('DROP TABLE IF EXISTS chat_mensagens_lidas').run();
  db.prepare('DROP TABLE IF EXISTS chat_mensagens').run();
  db.prepare('DROP TABLE IF EXISTS chat_conversas').run();
  db.prepare('DROP TABLE IF EXISTS chat_presenca').run();
  console.log('OK');

  console.log('\n[2/4] Criando chat_conversas...');
  db.prepare(`
    CREATE TABLE chat_conversas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario1_id INTEGER NOT NULL,
      usuario2_id INTEGER NOT NULL,
      criado_em TEXT DEFAULT (datetime('now','localtime')),
      atualizado_em TEXT DEFAULT (datetime('now','localtime')),
      UNIQUE(usuario1_id, usuario2_id),
      CHECK (usuario1_id < usuario2_id)
    )
  `).run();
  console.log('OK');

  console.log('\n[3/4] Criando chat_mensagens...');
  db.prepare(`
    CREATE TABLE chat_mensagens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversa_id INTEGER NOT NULL,
      remetente_id INTEGER NOT NULL,
      texto TEXT NOT NULL CHECK (length(trim(texto)) > 0),
      criado_em TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (conversa_id) REFERENCES chat_conversas(id) ON DELETE CASCADE
    )
  `).run();
  console.log('OK');

  console.log('\n[4/4] Criando tabelas auxiliares...');
  
  db.prepare(`
    CREATE TABLE chat_mensagens_lidas (
      mensagem_id INTEGER NOT NULL,
      usuario_id INTEGER NOT NULL,
      lido_em TEXT DEFAULT (datetime('now','localtime')),
      PRIMARY KEY (mensagem_id, usuario_id),
      FOREIGN KEY (mensagem_id) REFERENCES chat_mensagens(id) ON DELETE CASCADE
    )
  `).run();

  db.prepare(`
    CREATE TABLE chat_presenca (
      usuario_id INTEGER PRIMARY KEY,
      ultima_atividade TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
    )
  `).run();

  // Índices
  db.prepare('CREATE INDEX idx_chat_conversas_usuario1 ON chat_conversas(usuario1_id)').run();
  db.prepare('CREATE INDEX idx_chat_conversas_usuario2 ON chat_conversas(usuario2_id)').run();
  db.prepare('CREATE INDEX idx_chat_mensagens_conversa ON chat_mensagens(conversa_id, criado_em)').run();
  db.prepare('CREATE INDEX idx_chat_mensagens_lidas_usuario ON chat_mensagens_lidas(usuario_id, mensagem_id)').run();
  db.prepare('CREATE INDEX idx_chat_presenca_atividade ON chat_presenca(ultima_atividade)').run();

  console.log('OK');

  console.log('\n========================================');
  console.log('CHAT v3 CRIADO COM SUCESSO');
  console.log('========================================');
  console.log('\nPróximo passo: reiniciar o MedPronto');

} catch (e) {
  console.error('\nERRO:', e.message);
  process.exit(1);
} finally {
  db.close();
}