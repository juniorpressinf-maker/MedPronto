-- Última resposta do paciente no WhatsApp (mostrada no painel/card da agenda).
-- tipo: confirmou | recusou | outra. Nunca cancela nada sozinho.
ALTER TABLE agendamentos ADD COLUMN whatsapp_ultima_resposta TEXT;
ALTER TABLE agendamentos ADD COLUMN whatsapp_resposta_em TEXT;
ALTER TABLE agendamentos ADD COLUMN whatsapp_resposta_tipo TEXT;
