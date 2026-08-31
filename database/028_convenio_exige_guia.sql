-- Convênio pode faturar sem guia por atendimento (ex.: prefeitura / repasse mensal)
ALTER TABLE convenios ADD COLUMN exige_guia INTEGER NOT NULL DEFAULT 1;
