-- M6 — snapshot do nome do paciente no exame (auditoria).
-- ADD COLUMN removido: coluna já está em 001_init.sql (instalações novas).

UPDATE exames_anexos
SET paciente_nome = (
  SELECT nome FROM pacientes WHERE pacientes.id = exames_anexos.paciente_id
)
WHERE paciente_nome IS NULL;
