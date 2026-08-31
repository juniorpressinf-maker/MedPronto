-- M1 — procedimentos padrão e preços zerados no Particular

INSERT INTO procedimentos (codigo, nome, categoria, ativo)
SELECT 'CONS', 'Consulta', 'consulta', 1
WHERE NOT EXISTS (SELECT 1 FROM procedimentos WHERE nome = 'Consulta');

INSERT INTO procedimentos (codigo, nome, categoria, ativo)
SELECT 'RET', 'Consulta retorno', 'consulta', 1
WHERE NOT EXISTS (SELECT 1 FROM procedimentos WHERE nome = 'Consulta retorno');

INSERT INTO procedimentos (codigo, nome, categoria, ativo)
SELECT 'ELET', 'Eletro', 'exame', 1
WHERE NOT EXISTS (SELECT 1 FROM procedimentos WHERE nome = 'Eletro');

INSERT INTO procedimento_precos (procedimento_id, convenio_id, valor_centavos, vigencia_inicio)
SELECT p.id, 1, 0, date('now', 'localtime')
FROM procedimentos p
WHERE NOT EXISTS (
  SELECT 1 FROM procedimento_precos pp
  WHERE pp.procedimento_id = p.id AND pp.convenio_id = 1
);
