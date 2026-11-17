-- Projeto Agenda Nova — decisões do cliente (13/11/2026), 100% aditivo:
--   1. A cor do card na agenda vem do PROCEDIMENTO (cadastro em Cobrança → Procedimentos).
--   2. Horário padrão ÚNICO da agenda (início, fim, intervalo), ajustado pelo botão ⚙ da agenda.
-- Médico não tem cor; tipos de agendamento ficam só internos (ver 046).

------------------------------------------------------------------------------
-- 1. procedimentos.cor
------------------------------------------------------------------------------
ALTER TABLE procedimentos ADD COLUMN cor TEXT
  CHECK (cor IS NULL OR cor GLOB '#[0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F]');

-- Paleta automática (contraste bom com texto branco). Usada no backfill e nos
-- procedimentos novos sem cor; o usuário pode trocar no cadastro.
CREATE TABLE agenda_paleta_procedimento (
  ordem INTEGER PRIMARY KEY,
  cor TEXT NOT NULL UNIQUE
);

INSERT INTO agenda_paleta_procedimento (ordem, cor) VALUES
  (0, '#2563EB'), (1, '#059669'), (2, '#7C3AED'), (3, '#D97706'),
  (4, '#DB2777'), (5, '#0891B2'), (6, '#DC2626'), (7, '#4D7C0F'),
  (8, '#9333EA'), (9, '#B45309'), (10, '#0F766E'), (11, '#475569');

-- Backfill: cada procedimento existente ganha uma cor, na ordem do id.
UPDATE procedimentos
SET cor = (
  SELECT p.cor FROM agenda_paleta_procedimento p
  WHERE p.ordem = (
    (SELECT COUNT(*) FROM procedimentos o WHERE o.id < procedimentos.id)
    % (SELECT COUNT(*) FROM agenda_paleta_procedimento)
  )
)
WHERE cor IS NULL;

-- Procedimento novo sem cor: primeira cor da paleta ainda não usada; se todas
-- usadas, gira pela paleta.
CREATE TRIGGER trg_procedimento_cor_auto
AFTER INSERT ON procedimentos
FOR EACH ROW
WHEN NEW.cor IS NULL
BEGIN
  UPDATE procedimentos
  SET cor = COALESCE(
    (SELECT p.cor FROM agenda_paleta_procedimento p
     WHERE p.cor NOT IN (SELECT cor FROM procedimentos WHERE cor IS NOT NULL)
     ORDER BY p.ordem LIMIT 1),
    (SELECT p.cor FROM agenda_paleta_procedimento p
     WHERE p.ordem = NEW.id % (SELECT COUNT(*) FROM agenda_paleta_procedimento))
  )
  WHERE id = NEW.id;
END;

------------------------------------------------------------------------------
-- 2. Horário padrão único da agenda (app_meta, mesmo padrão do WhatsApp)
------------------------------------------------------------------------------
INSERT OR IGNORE INTO app_meta (chave, valor) VALUES ('agenda_hora_inicio', '07:00');
INSERT OR IGNORE INTO app_meta (chave, valor) VALUES ('agenda_hora_fim', '19:00');
INSERT OR IGNORE INTO app_meta (chave, valor) VALUES ('agenda_intervalo_minutos', '30');
