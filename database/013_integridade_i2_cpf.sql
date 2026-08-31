-- I2 — CPF único em pacientes (quando informado)
-- Ver docs/INTEGRIDADE_VINCULOS.md bloco I2

-- Normaliza CPF existente para só dígitos
UPDATE pacientes
SET cpf = REPLACE(REPLACE(REPLACE(TRIM(cpf), '.', ''), '-', ''), ' ', '')
WHERE cpf IS NOT NULL AND TRIM(cpf) != '';

UPDATE pacientes SET cpf = NULL WHERE cpf IS NOT NULL AND TRIM(cpf) = '';

-- Duplicatas: mantém CPF no registro mais antigo (menor id); demais ficam sem CPF
UPDATE pacientes
SET cpf = NULL
WHERE cpf IS NOT NULL
  AND id NOT IN (
    SELECT MIN(id) FROM pacientes
    WHERE cpf IS NOT NULL AND TRIM(cpf) != ''
    GROUP BY cpf
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_pacientes_cpf_unique
  ON pacientes (cpf)
  WHERE cpf IS NOT NULL AND TRIM(cpf) != '';
