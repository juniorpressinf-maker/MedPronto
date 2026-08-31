-- Conta fechada: conta_itens congelados até reabrir (em_aberto e sem fechada_em).
-- Espelha trg_conta_convenio_fechada_upd. API já recusa; isto impede SQL direto.
-- Ver PLANO_UNIFICACAO_ATENDIMENTO.md §1.4.17 e docs/INTEGRIDADE_VINCULOS.md.

DROP TRIGGER IF EXISTS trg_conta_item_conta_aberta_ins;
CREATE TRIGGER trg_conta_item_conta_aberta_ins
BEFORE INSERT ON conta_itens
FOR EACH ROW
WHEN EXISTS (
  SELECT 1 FROM contas_atendimento c
  WHERE c.id = NEW.conta_id
    AND (c.status != 'em_aberto' OR c.fechada_em IS NOT NULL)
)
BEGIN
  SELECT RAISE(ABORT, 'Não é permitido alterar item de conta que não está em aberto');
END;

DROP TRIGGER IF EXISTS trg_conta_item_conta_aberta_upd;
CREATE TRIGGER trg_conta_item_conta_aberta_upd
BEFORE UPDATE ON conta_itens
FOR EACH ROW
WHEN EXISTS (
  SELECT 1 FROM contas_atendimento c
  WHERE c.id = OLD.conta_id
    AND (c.status != 'em_aberto' OR c.fechada_em IS NOT NULL)
)
BEGIN
  SELECT RAISE(ABORT, 'Não é permitido alterar item de conta que não está em aberto');
END;

DROP TRIGGER IF EXISTS trg_conta_item_conta_aberta_del;
CREATE TRIGGER trg_conta_item_conta_aberta_del
BEFORE DELETE ON conta_itens
FOR EACH ROW
WHEN EXISTS (
  SELECT 1 FROM contas_atendimento c
  WHERE c.id = OLD.conta_id
    AND (c.status != 'em_aberto' OR c.fechada_em IS NOT NULL)
)
BEGIN
  SELECT RAISE(ABORT, 'Não é permitido alterar item de conta que não está em aberto');
END;
