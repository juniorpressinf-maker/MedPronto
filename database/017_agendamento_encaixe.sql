-- Fase 5.2 — encaixe na agenda (ignora conflito de horário)
ALTER TABLE agendamentos ADD COLUMN eh_encaixe INTEGER NOT NULL DEFAULT 0;
