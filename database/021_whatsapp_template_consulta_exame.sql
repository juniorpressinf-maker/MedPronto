-- Atualiza template padrão (só se ainda for o texto antigo)

UPDATE config_whatsapp
SET template_confirmacao = 'Olá {nome}, confirmamos sua consulta/exame em {data} às {hora} com {medico}. Por favor, confirme sua presença respondendo SIM.'
WHERE id = 1
  AND (
    template_confirmacao IS NULL
    OR template_confirmacao LIKE '%confirmamos sua consulta em%'
  );
