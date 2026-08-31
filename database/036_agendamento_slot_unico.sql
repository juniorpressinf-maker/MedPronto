-- Impede o mesmo paciente + mesmo médico + mesmo dia + mesmo horário
-- em dois agendamentos ativos. Cancelado e não veio ficam de fora.

DROP TABLE IF EXISTS _u36_dup;
CREATE TEMP TABLE _u36_dup (id INTEGER PRIMARY KEY);

INSERT INTO _u36_dup (id)
SELECT id FROM (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY paciente_id, medico_id, data, hora
      ORDER BY
        CASE status
          WHEN 'finalizado' THEN 0
          WHEN 'em_atendimento' THEN 1
          WHEN 'presente' THEN 2
          WHEN 'agendado' THEN 3
          ELSE 4
        END,
        id
    ) AS rn
  FROM agendamentos
  WHERE status NOT IN ('cancelado', 'nao_compareceu')
)
WHERE rn > 1;

UPDATE agendamentos
SET status = 'cancelado',
    updated_at = datetime('now', 'localtime')
WHERE id IN (SELECT id FROM _u36_dup);

DROP TABLE IF EXISTS _u36_dup;

CREATE UNIQUE INDEX IF NOT EXISTS idx_agendamentos_slot_paciente_medico
  ON agendamentos (paciente_id, medico_id, data, hora)
  WHERE status NOT IN ('cancelado', 'nao_compareceu');
