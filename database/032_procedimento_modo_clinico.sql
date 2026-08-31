-- U2 — modo clínico do procedimento (prontuário / ASO / nenhum)
-- Seed por nome só nesta migration. Runtime não infere pelo nome.

ALTER TABLE procedimentos ADD COLUMN modo_clinico TEXT NOT NULL DEFAULT 'nenhum';

UPDATE procedimentos
SET modo_clinico = 'prontuario'
WHERE nome IN ('Consulta', 'Consulta retorno');

UPDATE procedimentos
SET modo_clinico = 'aso'
WHERE nome = 'Admissional';

DROP TRIGGER IF EXISTS trg_procedimento_modo_clinico_ins;
CREATE TRIGGER trg_procedimento_modo_clinico_ins
BEFORE INSERT ON procedimentos
FOR EACH ROW
WHEN NEW.modo_clinico NOT IN ('prontuario', 'aso', 'nenhum')
BEGIN
  SELECT RAISE(ABORT, 'modo_clinico inválido');
END;

DROP TRIGGER IF EXISTS trg_procedimento_modo_clinico_upd;
CREATE TRIGGER trg_procedimento_modo_clinico_upd
BEFORE UPDATE OF modo_clinico ON procedimentos
FOR EACH ROW
WHEN NEW.modo_clinico NOT IN ('prontuario', 'aso', 'nenhum')
BEGIN
  SELECT RAISE(ABORT, 'modo_clinico inválido');
END;
