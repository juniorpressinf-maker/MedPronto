-- MANUAL (nao e migracao): apaga TODAS as mensagens e conversas do chat interno (modelo v3).
-- Fica fora de database/ de proposito - la tudo vira migracao automatica.

DELETE FROM chat_mensagens_lidas;
DELETE FROM chat_mensagens;
DELETE FROM chat_conversas;
