-- U10 — marca preparo extra para o Zap (U11 envia se hoje < data do horário).
ALTER TABLE agendamentos ADD COLUMN whatsapp_preparo_pendente INTEGER NOT NULL DEFAULT 0;
