-- B3 — Bloco 3 da auditoria de integridade (docs/RELATORIO_AUDITORIA_INTEGRIDADE_2026-11-15.txt)

-- [9] Horário com prontuário, ASO ou conta ativa não troca de paciente, médico ou dia.
-- Até aqui só a API (assertRemarcavel) segurava; os gatilhos dos filhos só
-- conferem quando o FILHO é gravado. Hora pode mudar (troca usa hora provisória).
DROP TRIGGER IF EXISTS trg_agendamento_vinculos_imutaveis_upd;
CREATE TRIGGER trg_agendamento_vinculos_imutaveis_upd
BEFORE UPDATE OF paciente_id, medico_id, data ON agendamentos
FOR EACH ROW
WHEN (NEW.paciente_id <> OLD.paciente_id
       OR NEW.medico_id <> OLD.medico_id
       OR NEW.data <> OLD.data)
  AND (
    EXISTS (SELECT 1 FROM prontuarios WHERE agendamento_id = OLD.id)
    OR EXISTS (SELECT 1 FROM admissionais WHERE agendamento_id = OLD.id AND status != 'cancelado')
    OR EXISTS (SELECT 1 FROM contas_atendimento WHERE agendamento_id = OLD.id AND status != 'cancelada')
  )
BEGIN
  SELECT RAISE(ABORT, 'Horário com prontuário, ASO ou conta não pode mudar de paciente, médico ou dia');
END;

-- [15] Uma retificação de prontuário em andamento por consulta.
-- Gatilho (e não índice único) para não falhar em bases que já tenham duplicata antiga.
DROP TRIGGER IF EXISTS trg_prontuario_retificacao_unica_ins;
CREATE TRIGGER trg_prontuario_retificacao_unica_ins
BEFORE INSERT ON prontuarios
FOR EACH ROW
WHEN NEW.retificacao_de_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'Já existe retificação em andamento para esta consulta')
  WHERE EXISTS (
    SELECT 1 FROM prontuarios
    WHERE retificacao_de_id = NEW.retificacao_de_id AND retificacao_finalizada = 0
  );
END;
