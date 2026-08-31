-- I1 — Integridade de vínculos: unicidade por agendamento + chaves imutáveis
-- Ver docs/INTEGRIDADE_VINCULOS.md bloco I1

-- Um prontuário por agendamento (retificações usam agendamento_id NULL)
CREATE UNIQUE INDEX IF NOT EXISTS idx_prontuarios_agendamento_unique
  ON prontuarios (agendamento_id)
  WHERE agendamento_id IS NOT NULL;

-- Um admissional por agendamento
CREATE UNIQUE INDEX IF NOT EXISTS idx_admissionais_agendamento_unique
  ON admissionais (agendamento_id)
  WHERE agendamento_id IS NOT NULL;

-- Impede troca de identidade após criação (defesa além da API)
CREATE TRIGGER IF NOT EXISTS trg_prontuario_ids_imutaveis_upd
BEFORE UPDATE ON prontuarios
FOR EACH ROW
WHEN NEW.paciente_id <> OLD.paciente_id
  OR NEW.medico_id <> OLD.medico_id
  OR IFNULL(NEW.agendamento_id, -1) <> IFNULL(OLD.agendamento_id, -1)
BEGIN
  SELECT RAISE(ABORT, 'Não é permitido alterar paciente, médico ou agendamento do prontuário');
END;

CREATE TRIGGER IF NOT EXISTS trg_admissional_ids_imutaveis_upd
BEFORE UPDATE ON admissionais
FOR EACH ROW
WHEN NEW.paciente_id <> OLD.paciente_id
  OR NEW.medico_id <> OLD.medico_id
  OR IFNULL(NEW.agendamento_id, -1) <> IFNULL(OLD.agendamento_id, -1)
BEGIN
  SELECT RAISE(ABORT, 'Não é permitido alterar paciente, médico ou agendamento do admissional');
END;

-- Documentos: vínculo com prontuário também em UPDATE (L3)
CREATE TRIGGER IF NOT EXISTS trg_receita_vinculo_upd
BEFORE UPDATE OF prontuario_id, paciente_id, medico_id ON receitas
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

CREATE TRIGGER IF NOT EXISTS trg_atestado_vinculo_upd
BEFORE UPDATE OF prontuario_id, paciente_id, medico_id ON atestados
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

CREATE TRIGGER IF NOT EXISTS trg_pedido_exame_vinculo_upd
BEFORE UPDATE OF prontuario_id, paciente_id, medico_id ON pedidos_exame
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
