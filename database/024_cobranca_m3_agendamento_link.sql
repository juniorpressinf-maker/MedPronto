-- M3 — permite vincular agendamento_id na conta quando ainda era NULL (check-in após abertura manual)

DROP TRIGGER IF EXISTS trg_conta_ids_imutaveis_upd;

CREATE TRIGGER trg_conta_ids_imutaveis_upd
BEFORE UPDATE ON contas_atendimento
FOR EACH ROW
WHEN NEW.paciente_id <> OLD.paciente_id
  OR NEW.data <> OLD.data
  OR (
    IFNULL(NEW.agendamento_id, -1) <> IFNULL(OLD.agendamento_id, -1)
    AND OLD.agendamento_id IS NOT NULL
  )
BEGIN
  SELECT RAISE(ABORT, 'Não é permitido alterar paciente, data ou agendamento da conta');
END;
