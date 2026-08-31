-- U4 — uma conta ativa por horário; walk-in continua um por paciente/dia

DROP INDEX IF EXISTS idx_contas_paciente_data_unique;

-- Homologação: conta sem horário, se houver agendamento livre no mesmo dia, vira 1:1
DROP TABLE IF EXISTS _u4_link_conta;
CREATE TEMP TABLE _u4_link_conta (
  conta_id INTEGER PRIMARY KEY,
  agendamento_id INTEGER
);

INSERT INTO _u4_link_conta (conta_id, agendamento_id)
SELECT c.id, (
  SELECT a.id
  FROM agendamentos a
  WHERE a.paciente_id = c.paciente_id
    AND a.data = c.data
    AND a.status != 'cancelado'
    AND NOT EXISTS (
      SELECT 1 FROM contas_atendimento c2
      WHERE c2.agendamento_id = a.id
        AND c2.status != 'cancelada'
        AND c2.id != c.id
    )
  ORDER BY a.hora, a.id
  LIMIT 1
)
FROM contas_atendimento c
WHERE c.agendamento_id IS NULL
  AND c.status != 'cancelada';

UPDATE contas_atendimento
SET agendamento_id = (
  SELECT l.agendamento_id FROM _u4_link_conta l WHERE l.conta_id = contas_atendimento.id
)
WHERE id IN (
  SELECT conta_id FROM _u4_link_conta WHERE agendamento_id IS NOT NULL
);

DROP TABLE IF EXISTS _u4_link_conta;

CREATE UNIQUE INDEX IF NOT EXISTS idx_contas_agendamento_unique
  ON contas_atendimento (agendamento_id)
  WHERE agendamento_id IS NOT NULL AND status != 'cancelada';

CREATE UNIQUE INDEX IF NOT EXISTS idx_contas_walkin_paciente_data_unique
  ON contas_atendimento (paciente_id, data)
  WHERE agendamento_id IS NULL AND status != 'cancelada';
