-- U3 — N procedimentos + convênio no horário
-- agendamentos.procedimento_id fica como espelho do primeiro da lista até U14.

-- SQLite recusa ADD COLUMN com REFERENCES e default não-NULL. FK fica no trigger.
ALTER TABLE agendamentos ADD COLUMN convenio_id INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_agendamentos_convenio
  ON agendamentos (convenio_id);

CREATE TABLE IF NOT EXISTS agendamento_procedimentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agendamento_id INTEGER NOT NULL REFERENCES agendamentos (id) ON DELETE CASCADE,
  procedimento_id INTEGER NOT NULL REFERENCES procedimentos (id),
  ordem INTEGER NOT NULL DEFAULT 0,
  origem TEXT NOT NULL DEFAULT 'agenda'
    CHECK (origem IN ('agenda', 'secretaria', 'medico')),
  criado_em TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  UNIQUE (agendamento_id, procedimento_id)
);

CREATE INDEX IF NOT EXISTS idx_agend_proc_agendamento
  ON agendamento_procedimentos (agendamento_id);

CREATE INDEX IF NOT EXISTS idx_agend_proc_procedimento
  ON agendamento_procedimentos (procedimento_id);

-- Convênio do horário: conta ligada ao agendamento; senão conta do paciente/data; senão Particular (já é 1).
UPDATE agendamentos
SET convenio_id = (
  SELECT c.convenio_id
  FROM contas_atendimento c
  WHERE c.agendamento_id = agendamentos.id
    AND c.status != 'cancelada'
    AND c.convenio_id IS NOT NULL
  LIMIT 1
)
WHERE EXISTS (
  SELECT 1
  FROM contas_atendimento c
  WHERE c.agendamento_id = agendamentos.id
    AND c.status != 'cancelada'
    AND c.convenio_id IS NOT NULL
);

UPDATE agendamentos
SET convenio_id = (
  SELECT c.convenio_id
  FROM contas_atendimento c
  WHERE c.paciente_id = agendamentos.paciente_id
    AND c.data = agendamentos.data
    AND c.status != 'cancelada'
    AND c.convenio_id IS NOT NULL
  ORDER BY c.id DESC
  LIMIT 1
)
WHERE convenio_id = 1
  AND EXISTS (
    SELECT 1
    FROM contas_atendimento c
    WHERE c.paciente_id = agendamentos.paciente_id
      AND c.data = agendamentos.data
      AND c.status != 'cancelada'
      AND c.convenio_id IS NOT NULL
  );

-- Backfill N:N — procedimento já gravado no horário
INSERT OR IGNORE INTO agendamento_procedimentos (
  agendamento_id, procedimento_id, ordem, origem
)
SELECT id, procedimento_id, 0, 'agenda'
FROM agendamentos
WHERE procedimento_id IS NOT NULL;

-- ASO sem procedimento → seed Admissional
INSERT OR IGNORE INTO agendamento_procedimentos (
  agendamento_id, procedimento_id, ordem, origem
)
SELECT a.id, (
  SELECT p.id FROM procedimentos p
  WHERE p.codigo = 'ADM' OR p.nome = 'Admissional'
  ORDER BY CASE WHEN p.codigo = 'ADM' THEN 0 ELSE 1 END
  LIMIT 1
), 0, 'agenda'
FROM agendamentos a
WHERE a.tipo_atendimento = 'admissional'
  AND NOT EXISTS (
    SELECT 1 FROM agendamento_procedimentos ap WHERE ap.agendamento_id = a.id
  );

-- Demais sem linha → seed Consulta
INSERT OR IGNORE INTO agendamento_procedimentos (
  agendamento_id, procedimento_id, ordem, origem
)
SELECT a.id, (
  SELECT p.id FROM procedimentos p
  WHERE p.codigo = 'CONS' OR p.nome = 'Consulta'
  ORDER BY CASE WHEN p.codigo = 'CONS' THEN 0 ELSE 1 END
  LIMIT 1
), 0, 'agenda'
FROM agendamentos a
WHERE NOT EXISTS (
  SELECT 1 FROM agendamento_procedimentos ap WHERE ap.agendamento_id = a.id
);

-- Espelho: primeiro da lista
UPDATE agendamentos
SET procedimento_id = (
  SELECT ap.procedimento_id
  FROM agendamento_procedimentos ap
  WHERE ap.agendamento_id = agendamentos.id
  ORDER BY ap.ordem, ap.id
  LIMIT 1
)
WHERE EXISTS (
  SELECT 1 FROM agendamento_procedimentos ap WHERE ap.agendamento_id = agendamentos.id
);

-- Convênio obrigatório e ativo
DROP TRIGGER IF EXISTS trg_agendamento_convenio_ativo_ins;
CREATE TRIGGER trg_agendamento_convenio_ativo_ins
BEFORE INSERT ON agendamentos
FOR EACH ROW
WHEN NEW.convenio_id IS NULL
  OR NOT EXISTS (
    SELECT 1 FROM convenios WHERE id = NEW.convenio_id AND ativo = 1
  )
BEGIN
  SELECT RAISE(ABORT, 'Convênio obrigatório e precisa estar ativo');
END;

DROP TRIGGER IF EXISTS trg_agendamento_convenio_ativo_upd;
CREATE TRIGGER trg_agendamento_convenio_ativo_upd
BEFORE UPDATE OF convenio_id ON agendamentos
FOR EACH ROW
WHEN NEW.convenio_id IS NULL
  OR NOT EXISTS (
    SELECT 1 FROM convenios WHERE id = NEW.convenio_id AND ativo = 1
  )
BEGIN
  SELECT RAISE(ABORT, 'Convênio obrigatório e precisa estar ativo');
END;

-- API antiga / testes: horário novo sem N:N ganha a linha a partir do espelho ou do seed
DROP TRIGGER IF EXISTS trg_agendamento_nn_apos_ins;
CREATE TRIGGER trg_agendamento_nn_apos_ins
AFTER INSERT ON agendamentos
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM agendamento_procedimentos WHERE agendamento_id = NEW.id
)
BEGIN
  SELECT RAISE(ABORT, 'Agendamento precisa de pelo menos um procedimento')
  WHERE COALESCE(
    NEW.procedimento_id,
    CASE
      WHEN NEW.tipo_atendimento = 'admissional' THEN (
        SELECT id FROM procedimentos WHERE codigo = 'ADM' LIMIT 1
      )
      WHEN NEW.eh_retorno = 1 THEN (
        SELECT id FROM procedimentos WHERE codigo = 'RET' LIMIT 1
      )
      ELSE (
        SELECT id FROM procedimentos WHERE codigo = 'CONS' LIMIT 1
      )
    END,
    CASE
      WHEN NEW.tipo_atendimento = 'admissional' THEN (
        SELECT id FROM procedimentos WHERE nome = 'Admissional' LIMIT 1
      )
      WHEN NEW.eh_retorno = 1 THEN (
        SELECT id FROM procedimentos WHERE nome = 'Consulta retorno' LIMIT 1
      )
      ELSE (
        SELECT id FROM procedimentos WHERE nome = 'Consulta' LIMIT 1
      )
    END
  ) IS NULL;

  INSERT INTO agendamento_procedimentos (
    agendamento_id, procedimento_id, ordem, origem
  )
  VALUES (
    NEW.id,
    COALESCE(
      NEW.procedimento_id,
      CASE
        WHEN NEW.tipo_atendimento = 'admissional' THEN (
          SELECT id FROM procedimentos WHERE codigo = 'ADM' LIMIT 1
        )
        WHEN NEW.eh_retorno = 1 THEN (
          SELECT id FROM procedimentos WHERE codigo = 'RET' LIMIT 1
        )
        ELSE (
          SELECT id FROM procedimentos WHERE codigo = 'CONS' LIMIT 1
        )
      END,
      CASE
        WHEN NEW.tipo_atendimento = 'admissional' THEN (
          SELECT id FROM procedimentos WHERE nome = 'Admissional' LIMIT 1
        )
        WHEN NEW.eh_retorno = 1 THEN (
          SELECT id FROM procedimentos WHERE nome = 'Consulta retorno' LIMIT 1
        )
        ELSE (
          SELECT id FROM procedimentos WHERE nome = 'Consulta' LIMIT 1
        )
      END
    ),
    0,
    'agenda'
  );
END;

-- Troca do único procedimento previsto (API antiga) atualiza a linha N:N
DROP TRIGGER IF EXISTS trg_agendamento_nn_apos_upd_proc;
CREATE TRIGGER trg_agendamento_nn_apos_upd_proc
AFTER UPDATE OF procedimento_id ON agendamentos
FOR EACH ROW
WHEN NEW.procedimento_id IS NOT NULL
  AND IFNULL(NEW.procedimento_id, -1) <> IFNULL(OLD.procedimento_id, -1)
  AND (
    SELECT COUNT(*) FROM agendamento_procedimentos WHERE agendamento_id = NEW.id
  ) <= 1
BEGIN
  UPDATE agendamento_procedimentos
  SET procedimento_id = NEW.procedimento_id
  WHERE agendamento_id = NEW.id;

  INSERT INTO agendamento_procedimentos (
    agendamento_id, procedimento_id, ordem, origem
  )
  SELECT NEW.id, NEW.procedimento_id, 0, 'agenda'
  WHERE NOT EXISTS (
    SELECT 1 FROM agendamento_procedimentos WHERE agendamento_id = NEW.id
  );
END;

DROP TRIGGER IF EXISTS trg_agend_proc_mix_ins;
CREATE TRIGGER trg_agend_proc_mix_ins
BEFORE INSERT ON agendamento_procedimentos
FOR EACH ROW
WHEN EXISTS (
  SELECT 1
  FROM procedimentos p_new
  JOIN agendamento_procedimentos ap ON ap.agendamento_id = NEW.agendamento_id
  JOIN procedimentos p_old ON p_old.id = ap.procedimento_id
  WHERE p_new.id = NEW.procedimento_id
    AND (
      (p_new.modo_clinico = 'prontuario' AND p_old.modo_clinico = 'aso')
      OR (p_new.modo_clinico = 'aso' AND p_old.modo_clinico = 'prontuario')
    )
)
BEGIN
  SELECT RAISE(ABORT, 'Não misture consulta e ASO no mesmo horário');
END;

DROP TRIGGER IF EXISTS trg_agend_proc_mix_upd;
CREATE TRIGGER trg_agend_proc_mix_upd
BEFORE UPDATE OF procedimento_id ON agendamento_procedimentos
FOR EACH ROW
WHEN EXISTS (
  SELECT 1
  FROM procedimentos p_new
  JOIN agendamento_procedimentos ap
    ON ap.agendamento_id = NEW.agendamento_id AND ap.id != NEW.id
  JOIN procedimentos p_old ON p_old.id = ap.procedimento_id
  WHERE p_new.id = NEW.procedimento_id
    AND (
      (p_new.modo_clinico = 'prontuario' AND p_old.modo_clinico = 'aso')
      OR (p_new.modo_clinico = 'aso' AND p_old.modo_clinico = 'prontuario')
    )
)
BEGIN
  SELECT RAISE(ABORT, 'Não misture consulta e ASO no mesmo horário');
END;

-- Pelo menos um procedimento; CASCADE ao apagar o horário passa (pai já sumiu)
DROP TRIGGER IF EXISTS trg_agend_proc_min_del;
CREATE TRIGGER trg_agend_proc_min_del
BEFORE DELETE ON agendamento_procedimentos
FOR EACH ROW
WHEN EXISTS (SELECT 1 FROM agendamentos WHERE id = OLD.agendamento_id)
  AND (
    SELECT COUNT(*) FROM agendamento_procedimentos
    WHERE agendamento_id = OLD.agendamento_id
  ) <= 1
BEGIN
  SELECT RAISE(ABORT, 'Agendamento precisa de pelo menos um procedimento');
END;

DROP TRIGGER IF EXISTS trg_agend_proc_espelho_ins;
CREATE TRIGGER trg_agend_proc_espelho_ins
AFTER INSERT ON agendamento_procedimentos
FOR EACH ROW
BEGIN
  UPDATE agendamentos
  SET procedimento_id = (
    SELECT ap.procedimento_id
    FROM agendamento_procedimentos ap
    WHERE ap.agendamento_id = NEW.agendamento_id
    ORDER BY ap.ordem, ap.id
    LIMIT 1
  )
  WHERE id = NEW.agendamento_id;
END;

DROP TRIGGER IF EXISTS trg_agend_proc_espelho_upd;
CREATE TRIGGER trg_agend_proc_espelho_upd
AFTER UPDATE OF procedimento_id, ordem ON agendamento_procedimentos
FOR EACH ROW
BEGIN
  UPDATE agendamentos
  SET procedimento_id = (
    SELECT ap.procedimento_id
    FROM agendamento_procedimentos ap
    WHERE ap.agendamento_id = NEW.agendamento_id
    ORDER BY ap.ordem, ap.id
    LIMIT 1
  )
  WHERE id = NEW.agendamento_id;
END;

DROP TRIGGER IF EXISTS trg_agend_proc_espelho_del;
CREATE TRIGGER trg_agend_proc_espelho_del
AFTER DELETE ON agendamento_procedimentos
FOR EACH ROW
BEGIN
  UPDATE agendamentos
  SET procedimento_id = (
    SELECT ap.procedimento_id
    FROM agendamento_procedimentos ap
    WHERE ap.agendamento_id = OLD.agendamento_id
    ORDER BY ap.ordem, ap.id
    LIMIT 1
  )
  WHERE id = OLD.agendamento_id;
END;
