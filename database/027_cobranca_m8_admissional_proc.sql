-- M8′ — procedimento Admissional para cobrança

INSERT INTO procedimentos (codigo, nome, categoria, ativo)
SELECT 'ADM', 'Admissional', 'admissional', 1
WHERE NOT EXISTS (SELECT 1 FROM procedimentos WHERE nome = 'Admissional');

INSERT INTO procedimento_precos (procedimento_id, convenio_id, valor_centavos, vigencia_inicio)
SELECT p.id, 1, 0, date('now', 'localtime')
FROM procedimentos p
WHERE p.nome = 'Admissional'
  AND NOT EXISTS (
    SELECT 1 FROM procedimento_precos pp
    WHERE pp.procedimento_id = p.id AND pp.convenio_id = 1
  );
