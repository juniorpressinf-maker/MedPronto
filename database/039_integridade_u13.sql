-- U13 — episódio financeiro = horário (agendamentos.id); walk-in = paciente+data
-- Ver docs/INTEGRIDADE_VINCULOS.md §2.4

ALTER TABLE conta_itens ADD COLUMN agendamento_procedimento_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_conta_itens_agend_proc
  ON conta_itens (agendamento_procedimento_id);

-- Backfill: item do horário ligado à linha N:N do mesmo procedimento
UPDATE conta_itens
SET agendamento_procedimento_id = (
  SELECT ap.id
  FROM contas_atendimento c
  JOIN agendamento_procedimentos ap
    ON ap.agendamento_id = c.agendamento_id
   AND ap.procedimento_id = conta_itens.procedimento_id
  WHERE c.id = conta_itens.conta_id
  ORDER BY ap.ordem, ap.id
  LIMIT 1
)
WHERE agendamento_procedimento_id IS NULL
  AND procedimento_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM contas_atendimento c
    WHERE c.id = conta_itens.conta_id AND c.agendamento_id IS NOT NULL
  );

-- Conta com horário: mesmo paciente e mesma data do agendamento
DROP TRIGGER IF EXISTS trg_conta_agendamento_vinculo_ins;
CREATE TRIGGER trg_conta_agendamento_vinculo_ins
BEFORE INSERT ON contas_atendimento
FOR EACH ROW
WHEN NEW.agendamento_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM agendamentos
    WHERE id = NEW.agendamento_id
      AND paciente_id = NEW.paciente_id
      AND data = NEW.data
  )
BEGIN
  SELECT RAISE(ABORT, 'Conta deve ter o mesmo paciente e data do horário');
END;

DROP TRIGGER IF EXISTS trg_conta_agendamento_vinculo_upd;
CREATE TRIGGER trg_conta_agendamento_vinculo_upd
BEFORE UPDATE OF agendamento_id, paciente_id, data ON contas_atendimento
FOR EACH ROW
WHEN NEW.agendamento_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM agendamentos
    WHERE id = NEW.agendamento_id
      AND paciente_id = NEW.paciente_id
      AND data = NEW.data
  )
BEGIN
  SELECT RAISE(ABORT, 'Conta deve ter o mesmo paciente e data do horário');
END;

-- Convênio da conta nova = convênio do horário
DROP TRIGGER IF EXISTS trg_conta_convenio_horario_ins;
CREATE TRIGGER trg_conta_convenio_horario_ins
BEFORE INSERT ON contas_atendimento
FOR EACH ROW
WHEN NEW.agendamento_id IS NOT NULL
  AND NEW.convenio_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM agendamentos
    WHERE id = NEW.agendamento_id AND convenio_id = NEW.convenio_id
  )
BEGIN
  SELECT RAISE(ABORT, 'Convênio da conta deve ser o do horário');
END;

-- Conta em_aberto e horário: um lado copia o convênio do outro (SQLite sem trigger recursivo)
DROP TRIGGER IF EXISTS trg_conta_convenio_sync_apos_upd;
CREATE TRIGGER trg_conta_convenio_sync_apos_upd
AFTER UPDATE OF convenio_id ON contas_atendimento
FOR EACH ROW
WHEN NEW.agendamento_id IS NOT NULL
  AND NEW.status = 'em_aberto'
  AND NEW.convenio_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM agendamentos
    WHERE id = NEW.agendamento_id AND convenio_id != NEW.convenio_id
  )
BEGIN
  UPDATE agendamentos SET convenio_id = NEW.convenio_id WHERE id = NEW.agendamento_id;
END;

DROP TRIGGER IF EXISTS trg_agend_convenio_sync_conta_upd;
CREATE TRIGGER trg_agend_convenio_sync_conta_upd
AFTER UPDATE OF convenio_id ON agendamentos
FOR EACH ROW
WHEN NEW.convenio_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM contas_atendimento
    WHERE agendamento_id = NEW.id
      AND status = 'em_aberto'
      AND convenio_id != NEW.convenio_id
  )
BEGIN
  UPDATE contas_atendimento
  SET convenio_id = NEW.convenio_id
  WHERE agendamento_id = NEW.id AND status = 'em_aberto';
END;

-- Item nascido do horário: N:N do mesmo agendamento_id da conta
DROP TRIGGER IF EXISTS trg_conta_item_agend_proc_ins;
CREATE TRIGGER trg_conta_item_agend_proc_ins
BEFORE INSERT ON conta_itens
FOR EACH ROW
WHEN NEW.agendamento_procedimento_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM contas_atendimento c
    JOIN agendamento_procedimentos ap ON ap.id = NEW.agendamento_procedimento_id
    WHERE c.id = NEW.conta_id
      AND c.agendamento_id IS NOT NULL
      AND ap.agendamento_id = c.agendamento_id
  )
BEGIN
  SELECT RAISE(ABORT, 'Item deve pertencer ao mesmo horário da conta');
END;

DROP TRIGGER IF EXISTS trg_conta_item_agend_proc_upd;
CREATE TRIGGER trg_conta_item_agend_proc_upd
BEFORE UPDATE OF agendamento_procedimento_id, conta_id ON conta_itens
FOR EACH ROW
WHEN NEW.agendamento_procedimento_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM contas_atendimento c
    JOIN agendamento_procedimentos ap ON ap.id = NEW.agendamento_procedimento_id
    WHERE c.id = NEW.conta_id
      AND c.agendamento_id IS NOT NULL
      AND ap.agendamento_id = c.agendamento_id
  )
BEGIN
  SELECT RAISE(ABORT, 'Item deve pertencer ao mesmo horário da conta');
END;
