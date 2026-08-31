-- A5 — Retificação de ASO (folha nova; original intacto)
-- Igual prontuários: retificação NÃO herda agendamento_id
-- (idx_admissionais_agendamento_unique permanece 1 ASO por horário)

ALTER TABLE admissionais ADD COLUMN retificacao_de_id INTEGER REFERENCES admissionais (id);
ALTER TABLE admissionais ADD COLUMN motivo_retificacao TEXT;
ALTER TABLE admissionais ADD COLUMN retificacao_finalizada INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_admissionais_retificacao_de
  ON admissionais (retificacao_de_id);

-- Uma retificação em andamento por original (finalizadas podem repetir)
CREATE UNIQUE INDEX IF NOT EXISTS idx_admissionais_retificacao_aberta
  ON admissionais (retificacao_de_id)
  WHERE retificacao_de_id IS NOT NULL
    AND retificacao_finalizada = 0
    AND status != 'cancelado';
