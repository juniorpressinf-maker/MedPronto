-- Ficha-modelo "Prontuário livre (editor)": folha de texto formatado (negrito, listas, títulos)
-- + CID e Retorno (mantém a regra de retorno). Global (medico_id NULL), não é padrão.
INSERT INTO fichas_template (nome, titulo_documento, modo, campos_json, medico_id, eh_default, ativo, destino)
SELECT
  'Prontuário livre (editor)',
  'Prontuário de consulta',
  'secoes',
  '[
    {"id":"evolucao","label":"Evolução:","tipo":"texto_formatado","ordem":1},
    {"id":"cid","label":"CID-10","tipo":"cid","ordem":2},
    {"id":"retorno","label":"Retorno (dias)","tipo":"retorno","ordem":3}
  ]',
  NULL,
  0,
  1,
  'prontuario'
WHERE NOT EXISTS (SELECT 1 FROM fichas_template WHERE nome = 'Prontuário livre (editor)');
