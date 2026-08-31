-- A3: tipo de atendimento na agenda (consulta | admissional | exame)

ALTER TABLE agendamentos ADD COLUMN tipo_atendimento TEXT NOT NULL DEFAULT 'consulta'
  CHECK (tipo_atendimento IN ('consulta', 'admissional', 'exame'));

CREATE INDEX IF NOT EXISTS idx_admissionais_agendamento
  ON admissionais (agendamento_id);

CREATE INDEX IF NOT EXISTS idx_agendamentos_tipo
  ON agendamentos (data, tipo_atendimento);
