-- Orientações de preparo enviadas no WhatsApp ({preparo})

ALTER TABLE procedimentos ADD COLUMN orientacoes_paciente TEXT;

UPDATE config_whatsapp
SET template_confirmacao = 'Olá {nome}, confirmamos sua consulta/exame em {data} às {hora} com {medico}. {preparo} Por favor, confirme sua presença respondendo SIM.'
WHERE id = 1
  AND (
    template_confirmacao IS NULL
    OR (
      template_confirmacao NOT LIKE '%{preparo}%'
      AND template_confirmacao LIKE '%confirmamos sua consulta/exame em {data} às {hora} com {medico}. Por favor%'
    )
  );
