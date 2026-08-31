-- I4 — Integridade cobrança: unicidade, vínculos e imutabilidade
-- Ver docs/INTEGRIDADE_VINCULOS.md bloco I4

-- Uma conta ativa por paciente/dia (regra M2)
CREATE UNIQUE INDEX IF NOT EXISTS idx_contas_paciente_data_unique
  ON contas_atendimento (paciente_id, data)
  WHERE status != 'cancelada';

-- Chaves de identidade da conta imutáveis após abertura
CREATE TRIGGER IF NOT EXISTS trg_conta_ids_imutaveis_upd
BEFORE UPDATE ON contas_atendimento
FOR EACH ROW
WHEN NEW.paciente_id <> OLD.paciente_id
  OR NEW.data <> OLD.data
  OR IFNULL(NEW.agendamento_id, -1) <> IFNULL(OLD.agendamento_id, -1)
BEGIN
  SELECT RAISE(ABORT, 'Não é permitido alterar paciente, data ou agendamento da conta');
END;

-- Status válidos da conta
CREATE TRIGGER IF NOT EXISTS trg_conta_status_chk_ins
BEFORE INSERT ON contas_atendimento
FOR EACH ROW
WHEN NEW.status NOT IN (
  'em_aberto', 'aguardando_pagamento', 'pago', 'parcialmente_pago',
  'a_faturar_convenio', 'isento', 'cancelada'
)
BEGIN
  SELECT RAISE(ABORT, 'Status de conta inválido');
END;

CREATE TRIGGER IF NOT EXISTS trg_conta_status_chk_upd
BEFORE UPDATE OF status ON contas_atendimento
FOR EACH ROW
WHEN NEW.status NOT IN (
  'em_aberto', 'aguardando_pagamento', 'pago', 'parcialmente_pago',
  'a_faturar_convenio', 'isento', 'cancelada'
)
BEGIN
  SELECT RAISE(ABORT, 'Status de conta inválido');
END;

-- Convênio imutável após fechamento ou fora de em_aberto
CREATE TRIGGER IF NOT EXISTS trg_conta_convenio_fechada_upd
BEFORE UPDATE OF convenio_id ON contas_atendimento
FOR EACH ROW
WHEN NEW.convenio_id <> OLD.convenio_id
  AND (
    OLD.fechada_em IS NOT NULL
    OR OLD.status != 'em_aberto'
  )
BEGIN
  SELECT RAISE(ABORT, 'Não é permitido alterar convênio de conta fechada');
END;

-- prontuario_id deve pertencer ao mesmo paciente da conta
CREATE TRIGGER IF NOT EXISTS trg_conta_prontuario_vinculo_ins
BEFORE INSERT ON contas_atendimento
FOR EACH ROW
WHEN NEW.prontuario_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM prontuarios
    WHERE id = NEW.prontuario_id AND paciente_id = NEW.paciente_id
  )
BEGIN
  SELECT RAISE(ABORT, 'Prontuário inconsistente com paciente da conta');
END;

CREATE TRIGGER IF NOT EXISTS trg_conta_prontuario_vinculo_upd
BEFORE UPDATE OF prontuario_id, paciente_id ON contas_atendimento
FOR EACH ROW
WHEN NEW.prontuario_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM prontuarios
    WHERE id = NEW.prontuario_id AND paciente_id = NEW.paciente_id
  )
BEGIN
  SELECT RAISE(ABORT, 'Prontuário inconsistente com paciente da conta');
END;

-- agendamento_id deve pertencer ao mesmo paciente da conta
CREATE TRIGGER IF NOT EXISTS trg_conta_agendamento_vinculo_ins
BEFORE INSERT ON contas_atendimento
FOR EACH ROW
WHEN NEW.agendamento_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM agendamentos
    WHERE id = NEW.agendamento_id AND paciente_id = NEW.paciente_id
  )
BEGIN
  SELECT RAISE(ABORT, 'Agendamento inconsistente com paciente da conta');
END;

CREATE TRIGGER IF NOT EXISTS trg_conta_agendamento_vinculo_upd
BEFORE UPDATE OF agendamento_id, paciente_id ON contas_atendimento
FOR EACH ROW
WHEN NEW.agendamento_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM agendamentos
    WHERE id = NEW.agendamento_id AND paciente_id = NEW.paciente_id
  )
BEGIN
  SELECT RAISE(ABORT, 'Agendamento inconsistente com paciente da conta');
END;

-- Item não pode mudar de conta
CREATE TRIGGER IF NOT EXISTS trg_conta_item_conta_imutavel_upd
BEFORE UPDATE ON conta_itens
FOR EACH ROW
WHEN NEW.conta_id <> OLD.conta_id
BEGIN
  SELECT RAISE(ABORT, 'Não é permitido mover item entre contas');
END;

-- Status válidos do item
CREATE TRIGGER IF NOT EXISTS trg_conta_item_status_chk_ins
BEFORE INSERT ON conta_itens
FOR EACH ROW
WHEN NEW.status NOT IN ('previsto', 'solicitado', 'realizado', 'cancelado')
BEGIN
  SELECT RAISE(ABORT, 'Status de item inválido');
END;

CREATE TRIGGER IF NOT EXISTS trg_conta_item_status_chk_upd
BEFORE UPDATE OF status ON conta_itens
FOR EACH ROW
WHEN NEW.status NOT IN ('previsto', 'solicitado', 'realizado', 'cancelado')
BEGIN
  SELECT RAISE(ABORT, 'Status de item inválido');
END;

-- admissional_id deve ser do mesmo paciente da conta
CREATE TRIGGER IF NOT EXISTS trg_conta_item_admissional_ins
BEFORE INSERT ON conta_itens
FOR EACH ROW
WHEN NEW.admissional_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM contas_atendimento c
    JOIN admissionais a ON a.id = NEW.admissional_id
    WHERE c.id = NEW.conta_id AND a.paciente_id = c.paciente_id
  )
BEGIN
  SELECT RAISE(ABORT, 'Admissional inconsistente com paciente da conta');
END;

CREATE TRIGGER IF NOT EXISTS trg_conta_item_admissional_upd
BEFORE UPDATE OF admissional_id, conta_id ON conta_itens
FOR EACH ROW
WHEN NEW.admissional_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM contas_atendimento c
    JOIN admissionais a ON a.id = NEW.admissional_id
    WHERE c.id = NEW.conta_id AND a.paciente_id = c.paciente_id
  )
BEGIN
  SELECT RAISE(ABORT, 'Admissional inconsistente com paciente da conta');
END;
