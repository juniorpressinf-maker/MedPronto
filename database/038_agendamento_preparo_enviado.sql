-- U11 — marca quais procedimentos já tiveram preparo no Zap.
ALTER TABLE agendamento_procedimentos ADD COLUMN preparo_enviado INTEGER NOT NULL DEFAULT 0;

-- Confirmação já enviada: não reenviar preparo desses itens.
UPDATE agendamento_procedimentos
SET preparo_enviado = 1
WHERE agendamento_id IN (
  SELECT id FROM agendamentos WHERE confirmacao_enviada = 1
);
