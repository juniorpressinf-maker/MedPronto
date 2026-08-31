-- Garantias de vínculo paciente ↔ prontuário ↔ médico (última linha de defesa no SQLite)

-- Exame anexado só pode apontar para prontuário do mesmo paciente
CREATE TRIGGER IF NOT EXISTS trg_exames_prontuario_paciente_ins
BEFORE INSERT ON exames_anexos
FOR EACH ROW
WHEN NEW.prontuario_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'Exame e prontuário de pacientes diferentes')
  WHERE NOT EXISTS (
    SELECT 1 FROM prontuarios
    WHERE id = NEW.prontuario_id AND paciente_id = NEW.paciente_id
  );
END;

CREATE TRIGGER IF NOT EXISTS trg_exames_prontuario_paciente_upd
BEFORE UPDATE OF prontuario_id, paciente_id ON exames_anexos
FOR EACH ROW
WHEN NEW.prontuario_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'Exame e prontuário de pacientes diferentes')
  WHERE NOT EXISTS (
    SELECT 1 FROM prontuarios
    WHERE id = NEW.prontuario_id AND paciente_id = NEW.paciente_id
  );
END;

-- Prontuário vinculado a agendamento deve ser do mesmo paciente e médico
CREATE TRIGGER IF NOT EXISTS trg_prontuario_agendamento_ins
BEFORE INSERT ON prontuarios
FOR EACH ROW
WHEN NEW.agendamento_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'Prontuário inconsistente com agendamento')
  WHERE NOT EXISTS (
    SELECT 1 FROM agendamentos
    WHERE id = NEW.agendamento_id
      AND paciente_id = NEW.paciente_id
      AND medico_id = NEW.medico_id
  );
END;

CREATE TRIGGER IF NOT EXISTS trg_prontuario_agendamento_upd
BEFORE UPDATE OF agendamento_id, paciente_id, medico_id ON prontuarios
FOR EACH ROW
WHEN NEW.agendamento_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'Prontuário inconsistente com agendamento')
  WHERE NOT EXISTS (
    SELECT 1 FROM agendamentos
    WHERE id = NEW.agendamento_id
      AND paciente_id = NEW.paciente_id
      AND medico_id = NEW.medico_id
  );
END;

-- Documentos clínicos devem repetir paciente_id e medico_id do prontuário
CREATE TRIGGER IF NOT EXISTS trg_receita_vinculo_ins
BEFORE INSERT ON receitas
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'Receita inconsistente com prontuário')
  WHERE NOT EXISTS (
    SELECT 1 FROM prontuarios
    WHERE id = NEW.prontuario_id
      AND paciente_id = NEW.paciente_id
      AND medico_id = NEW.medico_id
  );
END;

CREATE TRIGGER IF NOT EXISTS trg_atestado_vinculo_ins
BEFORE INSERT ON atestados
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'Atestado inconsistente com prontuário')
  WHERE NOT EXISTS (
    SELECT 1 FROM prontuarios
    WHERE id = NEW.prontuario_id
      AND paciente_id = NEW.paciente_id
      AND medico_id = NEW.medico_id
  );
END;

CREATE TRIGGER IF NOT EXISTS trg_pedido_exame_vinculo_ins
BEFORE INSERT ON pedidos_exame
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'Pedido de exame inconsistente com prontuário')
  WHERE NOT EXISTS (
    SELECT 1 FROM prontuarios
    WHERE id = NEW.prontuario_id
      AND paciente_id = NEW.paciente_id
      AND medico_id = NEW.medico_id
  );
END;

-- Admissional vinculado a agendamento: mesmo paciente e médico
CREATE TRIGGER IF NOT EXISTS trg_admissional_agendamento_ins
BEFORE INSERT ON admissionais
FOR EACH ROW
WHEN NEW.agendamento_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'Admissional inconsistente com agendamento')
  WHERE NOT EXISTS (
    SELECT 1 FROM agendamentos
    WHERE id = NEW.agendamento_id
      AND paciente_id = NEW.paciente_id
      AND medico_id = NEW.medico_id
  );
END;

CREATE TRIGGER IF NOT EXISTS trg_admissional_agendamento_upd
BEFORE UPDATE OF agendamento_id, paciente_id, medico_id ON admissionais
FOR EACH ROW
WHEN NEW.agendamento_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'Admissional inconsistente com agendamento')
  WHERE NOT EXISTS (
    SELECT 1 FROM agendamentos
    WHERE id = NEW.agendamento_id
      AND paciente_id = NEW.paciente_id
      AND medico_id = NEW.medico_id
  );
END;
