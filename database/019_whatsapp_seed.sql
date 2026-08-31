-- WhatsApp: registro único de config + meta do cron

INSERT OR IGNORE INTO config_whatsapp (id, ativo, template_confirmacao)
VALUES (
  1,
  0,
  'Olá {nome}, confirmamos sua consulta/exame em {data} às {hora} com {medico}. Por favor, confirme sua presença respondendo SIM.'
);

INSERT OR IGNORE INTO app_meta (chave, valor) VALUES ('whatsapp_cron_ultimo_dia', '');
INSERT OR IGNORE INTO app_meta (chave, valor) VALUES ('whatsapp_hora_envio', '17');
