-- M3+ — procedimento previsto no agendamento (check-in usa na conta)

ALTER TABLE agendamentos ADD COLUMN procedimento_id INTEGER
  REFERENCES procedimentos (id);

CREATE INDEX IF NOT EXISTS idx_agendamentos_procedimento
  ON agendamentos (procedimento_id);

INSERT INTO procedimentos (codigo, nome, categoria, ativo)
SELECT 'ENDO', 'Endoscopia', 'exame', 1
WHERE NOT EXISTS (SELECT 1 FROM procedimentos WHERE nome = 'Endoscopia');

INSERT INTO procedimento_precos (procedimento_id, convenio_id, valor_centavos, vigencia_inicio)
SELECT p.id, 1, 0, date('now', 'localtime')
FROM procedimentos p
WHERE p.nome = 'Endoscopia'
  AND NOT EXISTS (
    SELECT 1 FROM procedimento_precos pp
    WHERE pp.procedimento_id = p.id AND pp.convenio_id = 1
  );
