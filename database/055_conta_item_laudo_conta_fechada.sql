-- Laudo do exame (exame_anexo_id) pode ser vinculado com a conta paga/fechada:
-- o resultado costuma chegar depois do pagamento e não mexe no financeiro.
-- Qualquer outra coluna continua congelada (ver 045_conta_itens_conta_aberta.sql).

DROP TRIGGER IF EXISTS trg_conta_item_conta_aberta_upd;
CREATE TRIGGER trg_conta_item_conta_aberta_upd
BEFORE UPDATE ON conta_itens
FOR EACH ROW
WHEN EXISTS (
  SELECT 1 FROM contas_atendimento c
  WHERE c.id = OLD.conta_id
    AND (c.status != 'em_aberto' OR c.fechada_em IS NOT NULL)
)
AND NOT (
  NEW.id IS OLD.id
  AND NEW.conta_id IS OLD.conta_id
  AND NEW.procedimento_id IS OLD.procedimento_id
  AND NEW.executado_por IS OLD.executado_por
  AND NEW.status IS OLD.status
  AND NEW.valor_centavos IS OLD.valor_centavos
  AND NEW.quantidade IS OLD.quantidade
  AND NEW.solicitado_por IS OLD.solicitado_por
  AND NEW.solicitado_em IS OLD.solicitado_em
  AND NEW.realizado_em IS OLD.realizado_em
  AND NEW.admissional_id IS OLD.admissional_id
  AND NEW.observacao IS OLD.observacao
  AND NEW.agendamento_procedimento_id IS OLD.agendamento_procedimento_id
  AND (SELECT status FROM contas_atendimento WHERE id = OLD.conta_id) != 'cancelada'
)
BEGIN
  SELECT RAISE(ABORT, 'Não é permitido alterar item de conta que não está em aberto');
END;
