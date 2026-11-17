-- Horário fixo na mensagem por jornada: hora_fixa_mensagem = manhã (antes das 12:00);
-- hora_fixa_tarde = tarde (12:00 em diante). NULL = usa o da manhã (comportamento antigo).
ALTER TABLE config_whatsapp ADD COLUMN hora_fixa_tarde TEXT;
