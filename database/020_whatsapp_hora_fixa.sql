-- Horário fixo na mensagem (consultório por ordem de chegada)

ALTER TABLE config_whatsapp ADD COLUMN hora_fixa_ativa INTEGER NOT NULL DEFAULT 0;
ALTER TABLE config_whatsapp ADD COLUMN hora_fixa_mensagem TEXT;
