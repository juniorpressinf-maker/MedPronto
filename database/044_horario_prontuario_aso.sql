-- Um horário não pode ter prontuário e ASO ao mesmo tempo.
-- Retificações (A5) usam agendamento_id NULL e não disparam estes triggers.
-- Ver docs/INTEGRIDADE_VINCULOS.md e PLANO_UNIFICACAO_ATENDIMENTO.md §1.2.6 / §1.3.12.

DROP TRIGGER IF EXISTS trg_admissional_sem_prontuario_ins;
CREATE TRIGGER trg_admissional_sem_prontuario_ins
BEFORE INSERT ON admissionais
FOR EACH ROW
WHEN NEW.agendamento_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'Não misture consulta e ASO no mesmo horário')
  WHERE EXISTS (
    SELECT 1 FROM prontuarios p
    WHERE p.agendamento_id = NEW.agendamento_id
  );
END;

DROP TRIGGER IF EXISTS trg_admissional_sem_prontuario_upd;
CREATE TRIGGER trg_admissional_sem_prontuario_upd
BEFORE UPDATE OF agendamento_id ON admissionais
FOR EACH ROW
WHEN NEW.agendamento_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'Não misture consulta e ASO no mesmo horário')
  WHERE EXISTS (
    SELECT 1 FROM prontuarios p
    WHERE p.agendamento_id = NEW.agendamento_id
  );
END;

DROP TRIGGER IF EXISTS trg_prontuario_sem_aso_ins;
CREATE TRIGGER trg_prontuario_sem_aso_ins
BEFORE INSERT ON prontuarios
FOR EACH ROW
WHEN NEW.agendamento_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'Não misture consulta e ASO no mesmo horário')
  WHERE EXISTS (
    SELECT 1 FROM admissionais a
    WHERE a.agendamento_id = NEW.agendamento_id
      AND a.status != 'cancelado'
  );
END;

DROP TRIGGER IF EXISTS trg_prontuario_sem_aso_upd;
CREATE TRIGGER trg_prontuario_sem_aso_upd
BEFORE UPDATE OF agendamento_id ON prontuarios
FOR EACH ROW
WHEN NEW.agendamento_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'Não misture consulta e ASO no mesmo horário')
  WHERE EXISTS (
    SELECT 1 FROM admissionais a
    WHERE a.agendamento_id = NEW.agendamento_id
      AND a.status != 'cancelado'
  );
END;
