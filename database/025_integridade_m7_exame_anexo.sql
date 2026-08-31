-- M7 — exame_anexo_id deve ser do mesmo paciente da conta

CREATE TRIGGER IF NOT EXISTS trg_conta_item_exame_anexo_ins
BEFORE INSERT ON conta_itens
FOR EACH ROW
WHEN NEW.exame_anexo_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM contas_atendimento c
    JOIN exames_anexos e ON e.id = NEW.exame_anexo_id
    WHERE c.id = NEW.conta_id AND e.paciente_id = c.paciente_id
  )
BEGIN
  SELECT RAISE(ABORT, 'Exame anexo inconsistente com paciente da conta');
END;

CREATE TRIGGER IF NOT EXISTS trg_conta_item_exame_anexo_upd
BEFORE UPDATE OF exame_anexo_id, conta_id ON conta_itens
FOR EACH ROW
WHEN NEW.exame_anexo_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM contas_atendimento c
    JOIN exames_anexos e ON e.id = NEW.exame_anexo_id
    WHERE c.id = NEW.conta_id AND e.paciente_id = c.paciente_id
  )
BEGIN
  SELECT RAISE(ABORT, 'Exame anexo inconsistente com paciente da conta');
END;
