-- A5 — Integridade da retificação de ASO (idempotente se 041 já aplicou o índice)
-- Folha nova: agendamento_id NULL; original intacto; cobrança permanece no original

CREATE UNIQUE INDEX IF NOT EXISTS idx_admissionais_retificacao_aberta
  ON admissionais (retificacao_de_id)
  WHERE retificacao_de_id IS NOT NULL
    AND retificacao_finalizada = 0
    AND status != 'cancelado';

CREATE TRIGGER IF NOT EXISTS trg_admissional_retificacao_ins
BEFORE INSERT ON admissionais
FOR EACH ROW
WHEN NEW.retificacao_de_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'Retificação de ASO inconsistente')
  WHERE NEW.agendamento_id IS NOT NULL
     OR NOT EXISTS (
       SELECT 1 FROM admissionais o
       WHERE o.id = NEW.retificacao_de_id
         AND o.paciente_id = NEW.paciente_id
         AND o.medico_id = NEW.medico_id
         AND o.retificacao_de_id IS NULL
         AND o.status = 'finalizado'
     );
END;
