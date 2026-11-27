-- Consulta retorno: preço 0 (gratuito) em todo convênio que ainda não tem preço cadastrado.
-- Convênios criados antes desta versão nasciam sem preço e a conta do retorno travava
-- ("sem preço cadastrado"). Não altera preço já cadastrado.
INSERT OR IGNORE INTO procedimento_precos (procedimento_id, convenio_id, valor_centavos, vigencia_inicio)
SELECT p.id, c.id, 0, date('now', 'localtime')
FROM procedimentos p
CROSS JOIN convenios c
WHERE (p.codigo = 'RET' OR p.nome = 'Consulta retorno')
  AND NOT EXISTS (
    SELECT 1 FROM procedimento_precos pp
    WHERE pp.procedimento_id = p.id AND pp.convenio_id = c.id
  );
