-- Retorno médico: prazo definido no atendimento + marcação na agenda

ALTER TABLE prontuarios ADD COLUMN retorno_dias INTEGER;
ALTER TABLE prontuarios ADD COLUMN retorno_ate TEXT;

ALTER TABLE agendamentos ADD COLUMN eh_retorno INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_prontuarios_retorno_ate
  ON prontuarios (paciente_id, retorno_ate);
