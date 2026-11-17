-- Projeto Agenda Nova — A1 (banco, 100% aditivo).
-- Ver docs/PROJETO_AGENDA_NOVA.md.
--
-- Garantias:
--   * nenhuma coluna existente de `agendamentos` é alterada (só ganha agendamento_tipo_id);
--   * a tela antiga continua gravando sem conhecer os tipos: um trigger infere o tipo;
--   * nada é apagado: a agenda_bloqueios antiga (001, nunca usada) vira agenda_bloqueios_legado_001.
--
-- Convenções: data 'AAAA-MM-DD'; hora 'HH:MM' (fim pode ser '24:00');
-- dia_semana 0 = domingo … 6 = sábado (igual a strftime('%w')).

------------------------------------------------------------------------------
-- 1. Tipos de agendamento
------------------------------------------------------------------------------
-- `codigo` identifica os tipos do sistema (não podem ser excluídos nem desativados,
-- e seu significado clínico é fixo). Tipos criados pela clínica têm codigo NULL.
-- `tipo_atendimento`, `eh_retorno` e `eh_encaixe` são o que o tipo grava no agendamento.
CREATE TABLE agendamento_tipos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT UNIQUE,
  nome TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(trim(nome)) BETWEEN 1 AND 60),
  cor TEXT NOT NULL CHECK (
    cor GLOB '#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]'
  ),
  duracao_minutos INTEGER NOT NULL DEFAULT 30 CHECK (duracao_minutos BETWEEN 5 AND 480),
  tipo_atendimento TEXT NOT NULL DEFAULT 'consulta'
    CHECK (tipo_atendimento IN ('consulta', 'admissional', 'exame')),
  eh_retorno INTEGER NOT NULL DEFAULT 0 CHECK (eh_retorno IN (0, 1)),
  eh_encaixe INTEGER NOT NULL DEFAULT 0 CHECK (eh_encaixe IN (0, 1)),
  ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1)),
  ordem INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  -- Retorno/encaixe só fazem sentido em consulta, e um tipo não é os dois ao mesmo tempo.
  CHECK (NOT (eh_retorno = 1 AND eh_encaixe = 1)),
  CHECK ((eh_retorno = 0 AND eh_encaixe = 0) OR tipo_atendimento = 'consulta')
);

INSERT INTO agendamento_tipos
  (codigo, nome, cor, duracao_minutos, tipo_atendimento, eh_retorno, eh_encaixe, ordem)
VALUES
  ('CONSULTA',    'Consulta',             '#2563EB', 30, 'consulta',    0, 0, 1),
  ('PRIMEIRA',    'Primeira consulta',    '#7C3AED', 30, 'consulta',    0, 0, 2),
  ('RETORNO',     'Retorno',              '#059669', 30, 'consulta',    1, 0, 3),
  ('ENCAIXE',     'Encaixe',              '#D97706', 30, 'consulta',    0, 1, 4),
  ('EXAME',       'Exame / Procedimento', '#0891B2', 30, 'exame',       0, 0, 5),
  ('ADMISSIONAL', 'Admissional (ASO)',    '#B91C1C', 30, 'admissional', 0, 0, 6);

-- Tipos do sistema: não excluir, não desativar, não mudar o significado.
CREATE TRIGGER trg_agendamento_tipo_sistema_upd
BEFORE UPDATE OF codigo, ativo, tipo_atendimento, eh_retorno, eh_encaixe ON agendamento_tipos
FOR EACH ROW
WHEN OLD.codigo IS NOT NULL AND (
  NEW.codigo IS NOT OLD.codigo
  OR NEW.ativo = 0
  OR NEW.tipo_atendimento IS NOT OLD.tipo_atendimento
  OR NEW.eh_retorno IS NOT OLD.eh_retorno
  OR NEW.eh_encaixe IS NOT OLD.eh_encaixe
)
BEGIN
  SELECT RAISE(ABORT, 'Tipo de agendamento do sistema: só nome, cor, duração e ordem podem ser alterados');
END;

CREATE TRIGGER trg_agendamento_tipo_codigo_ins
BEFORE INSERT ON agendamento_tipos
FOR EACH ROW
WHEN NEW.codigo IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'Tipos de agendamento novos não podem ter código de sistema');
END;

CREATE TRIGGER trg_agendamento_tipo_del
BEFORE DELETE ON agendamento_tipos
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'Tipo de agendamento do sistema não pode ser excluído')
  WHERE OLD.codigo IS NOT NULL;
  SELECT RAISE(ABORT, 'Tipo de agendamento em uso: desative em vez de excluir')
  WHERE EXISTS (SELECT 1 FROM agendamentos WHERE agendamento_tipo_id = OLD.id);
END;

------------------------------------------------------------------------------
-- 2. Inferência do tipo a partir das colunas antigas (fonte única da regra)
------------------------------------------------------------------------------
-- Usada no backfill e nos triggers abaixo. Combinação ausente cai em CONSULTA.
CREATE TABLE agendamento_tipo_inferencia (
  tipo_atendimento TEXT NOT NULL,
  eh_retorno INTEGER NOT NULL,
  eh_encaixe INTEGER NOT NULL,
  codigo TEXT NOT NULL REFERENCES agendamento_tipos (codigo),
  PRIMARY KEY (tipo_atendimento, eh_retorno, eh_encaixe)
) WITHOUT ROWID;

INSERT INTO agendamento_tipo_inferencia (tipo_atendimento, eh_retorno, eh_encaixe, codigo)
VALUES
  ('consulta',    0, 0, 'CONSULTA'),
  ('consulta',    1, 0, 'RETORNO'),
  ('consulta',    0, 1, 'ENCAIXE'),
  ('consulta',    1, 1, 'RETORNO'),
  ('exame',       0, 0, 'EXAME'),
  ('exame',       1, 0, 'EXAME'),
  ('exame',       0, 1, 'EXAME'),
  ('exame',       1, 1, 'EXAME'),
  ('admissional', 0, 0, 'ADMISSIONAL'),
  ('admissional', 1, 0, 'ADMISSIONAL'),
  ('admissional', 0, 1, 'ADMISSIONAL'),
  ('admissional', 1, 1, 'ADMISSIONAL');

------------------------------------------------------------------------------
-- 3. agendamentos.agendamento_tipo_id (nullable; FK real, default NULL)
------------------------------------------------------------------------------
ALTER TABLE agendamentos ADD COLUMN agendamento_tipo_id INTEGER REFERENCES agendamento_tipos (id);

CREATE INDEX IF NOT EXISTS idx_agendamentos_tipo_agendamento
  ON agendamentos (agendamento_tipo_id);

-- Backfill: só preenche a coluna nova. eh_retorno/eh_encaixe/tipo_atendimento ficam intactos.
UPDATE agendamentos
SET agendamento_tipo_id = COALESCE(
  (
    SELECT t.id
    FROM agendamento_tipo_inferencia i
    JOIN agendamento_tipos t ON t.codigo = i.codigo
    WHERE i.tipo_atendimento = agendamentos.tipo_atendimento
      AND i.eh_retorno = agendamentos.eh_retorno
      AND i.eh_encaixe = agendamentos.eh_encaixe
  ),
  (SELECT id FROM agendamento_tipos WHERE codigo = 'CONSULTA')
)
WHERE agendamento_tipo_id IS NULL;

-- Tipo informado tem de estar ativo (FK já garante que existe).
CREATE TRIGGER trg_agendamento_tipo_ativo_ins
BEFORE INSERT ON agendamentos
FOR EACH ROW
WHEN NEW.agendamento_tipo_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM agendamento_tipos WHERE id = NEW.agendamento_tipo_id AND ativo = 1
  )
BEGIN
  SELECT RAISE(ABORT, 'Tipo de agendamento inexistente ou inativo');
END;

CREATE TRIGGER trg_agendamento_tipo_ativo_upd
BEFORE UPDATE OF agendamento_tipo_id ON agendamentos
FOR EACH ROW
WHEN NEW.agendamento_tipo_id IS NOT NULL
  AND NEW.agendamento_tipo_id IS NOT OLD.agendamento_tipo_id
  AND NOT EXISTS (
    SELECT 1 FROM agendamento_tipos WHERE id = NEW.agendamento_tipo_id AND ativo = 1
  )
BEGIN
  SELECT RAISE(ABORT, 'Tipo de agendamento inexistente ou inativo');
END;

-- Tela antiga / APIs sem tipo: o horário novo ganha o tipo inferido.
CREATE TRIGGER trg_agendamento_tipo_inferir_ins
AFTER INSERT ON agendamentos
FOR EACH ROW
WHEN NEW.agendamento_tipo_id IS NULL
BEGIN
  UPDATE agendamentos
  SET agendamento_tipo_id = COALESCE(
    (
      SELECT t.id
      FROM agendamento_tipo_inferencia i
      JOIN agendamento_tipos t ON t.codigo = i.codigo
      WHERE i.tipo_atendimento = NEW.tipo_atendimento
        AND i.eh_retorno = NEW.eh_retorno
        AND i.eh_encaixe = NEW.eh_encaixe
    ),
    (SELECT id FROM agendamento_tipos WHERE codigo = 'CONSULTA')
  )
  WHERE id = NEW.id;
END;

-- Tela antiga mudou retorno/encaixe/tipo de atendimento e o tipo ficou incoerente:
-- re-infere. Quem grava tipo + colunas coerentes (tela nova) não dispara nada.
CREATE TRIGGER trg_agendamento_tipo_inferir_upd
AFTER UPDATE OF tipo_atendimento, eh_retorno, eh_encaixe ON agendamentos
FOR EACH ROW
WHEN NEW.agendamento_tipo_id IS NULL
  OR NOT EXISTS (
    SELECT 1 FROM agendamento_tipos t
    WHERE t.id = NEW.agendamento_tipo_id
      AND t.tipo_atendimento = NEW.tipo_atendimento
      AND t.eh_retorno = NEW.eh_retorno
      AND t.eh_encaixe = NEW.eh_encaixe
  )
BEGIN
  UPDATE agendamentos
  SET agendamento_tipo_id = COALESCE(
    (
      SELECT t.id
      FROM agendamento_tipo_inferencia i
      JOIN agendamento_tipos t ON t.codigo = i.codigo
      WHERE i.tipo_atendimento = NEW.tipo_atendimento
        AND i.eh_retorno = NEW.eh_retorno
        AND i.eh_encaixe = NEW.eh_encaixe
    ),
    (SELECT id FROM agendamento_tipos WHERE codigo = 'CONSULTA')
  )
  WHERE id = NEW.id;
END;

------------------------------------------------------------------------------
-- 4. Duração do procedimento (sugere a duração do horário)
------------------------------------------------------------------------------
ALTER TABLE procedimentos ADD COLUMN duracao_minutos INTEGER
  CHECK (duracao_minutos IS NULL OR duracao_minutos BETWEEN 5 AND 480);

------------------------------------------------------------------------------
-- 5. Agenda do médico: configuração (1 por médico) + expediente (N turnos por dia)
------------------------------------------------------------------------------
CREATE TABLE medico_agenda (
  medico_id INTEGER PRIMARY KEY REFERENCES usuarios (id) ON DELETE CASCADE,
  cor TEXT NOT NULL CHECK (
    cor GLOB '#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]'
  ),
  intervalo_minutos INTEGER NOT NULL DEFAULT 30 CHECK (intervalo_minutos IN (5, 10, 15, 20, 30, 60)),
  modo TEXT NOT NULL DEFAULT 'chegada' CHECK (modo IN ('horario', 'chegada')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TRIGGER trg_medico_agenda_perfil_ins
BEFORE INSERT ON medico_agenda
FOR EACH ROW
WHEN NOT EXISTS (SELECT 1 FROM usuarios WHERE id = NEW.medico_id AND perfil = 'medico')
BEGIN
  SELECT RAISE(ABORT, 'Configuração de agenda só para usuário médico');
END;

CREATE TABLE medico_expediente (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  medico_id INTEGER NOT NULL REFERENCES medico_agenda (medico_id) ON DELETE CASCADE,
  dia_semana INTEGER NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
  inicio TEXT NOT NULL CHECK (inicio GLOB '[0-2][0-9]:[0-5][0-9]' AND inicio < '24:00'),
  fim TEXT NOT NULL CHECK (fim GLOB '[0-2][0-9]:[0-5][0-9]' AND fim <= '24:00'),
  CHECK (inicio < fim)
);

CREATE INDEX idx_medico_expediente_medico_dia
  ON medico_expediente (medico_id, dia_semana, inicio);

-- Turnos do mesmo médico no mesmo dia não se sobrepõem (encostar é permitido: 12:00/12:00).
CREATE TRIGGER trg_medico_expediente_sobreposicao_ins
BEFORE INSERT ON medico_expediente
FOR EACH ROW
WHEN EXISTS (
  SELECT 1 FROM medico_expediente e
  WHERE e.medico_id = NEW.medico_id
    AND e.dia_semana = NEW.dia_semana
    AND e.inicio < NEW.fim
    AND NEW.inicio < e.fim
)
BEGIN
  SELECT RAISE(ABORT, 'Turno sobreposto a outro turno do mesmo dia');
END;

CREATE TRIGGER trg_medico_expediente_sobreposicao_upd
BEFORE UPDATE OF medico_id, dia_semana, inicio, fim ON medico_expediente
FOR EACH ROW
WHEN EXISTS (
  SELECT 1 FROM medico_expediente e
  WHERE e.id <> NEW.id
    AND e.medico_id = NEW.medico_id
    AND e.dia_semana = NEW.dia_semana
    AND e.inicio < NEW.fim
    AND NEW.inicio < e.fim
)
BEGIN
  SELECT RAISE(ABORT, 'Turno sobreposto a outro turno do mesmo dia');
END;

-- Cor inicial = mesma paleta de frontend/src/lib/corMedicoAgenda.ts (id % 10),
-- para o cliente não ver as cores mudarem. Sem expediente => modo 'chegada'.
INSERT INTO medico_agenda (medico_id, cor, intervalo_minutos, modo)
SELECT
  u.id,
  CASE abs(u.id) % 10
    WHEN 0 THEN '#1A4D7A'
    WHEN 1 THEN '#7A1A4D'
    WHEN 2 THEN '#2D6A2D'
    WHEN 3 THEN '#8B4513'
    WHEN 4 THEN '#5C2D91'
    WHEN 5 THEN '#C45C00'
    WHEN 6 THEN '#006D6D'
    WHEN 7 THEN '#8B1A1A'
    WHEN 8 THEN '#4A4A8B'
    ELSE '#6B4423'
  END,
  30,
  'chegada'
FROM usuarios u
WHERE u.perfil = 'medico';

-- Médico novo (ou usuário promovido a médico) já nasce com configuração.
CREATE TRIGGER trg_usuario_medico_agenda_ins
AFTER INSERT ON usuarios
FOR EACH ROW
WHEN NEW.perfil = 'medico'
BEGIN
  INSERT OR IGNORE INTO medico_agenda (medico_id, cor, intervalo_minutos, modo)
  VALUES (
    NEW.id,
    CASE abs(NEW.id) % 10
      WHEN 0 THEN '#1A4D7A'
      WHEN 1 THEN '#7A1A4D'
      WHEN 2 THEN '#2D6A2D'
      WHEN 3 THEN '#8B4513'
      WHEN 4 THEN '#5C2D91'
      WHEN 5 THEN '#C45C00'
      WHEN 6 THEN '#006D6D'
      WHEN 7 THEN '#8B1A1A'
      WHEN 8 THEN '#4A4A8B'
      ELSE '#6B4423'
    END,
    30,
    'chegada'
  );
END;

CREATE TRIGGER trg_usuario_medico_agenda_upd
AFTER UPDATE OF perfil ON usuarios
FOR EACH ROW
WHEN NEW.perfil = 'medico'
BEGIN
  INSERT OR IGNORE INTO medico_agenda (medico_id, cor, intervalo_minutos, modo)
  VALUES (
    NEW.id,
    CASE abs(NEW.id) % 10
      WHEN 0 THEN '#1A4D7A'
      WHEN 1 THEN '#7A1A4D'
      WHEN 2 THEN '#2D6A2D'
      WHEN 3 THEN '#8B4513'
      WHEN 4 THEN '#5C2D91'
      WHEN 5 THEN '#C45C00'
      WHEN 6 THEN '#006D6D'
      WHEN 7 THEN '#8B1A1A'
      WHEN 8 THEN '#4A4A8B'
      ELSE '#6B4423'
    END,
    30,
    'chegada'
  );
END;

------------------------------------------------------------------------------
-- 6. Bloqueios de agenda ("Horário Bloqueado")
------------------------------------------------------------------------------
-- A tabela da 001 (medico_id NOT NULL, data_inicio, data_fim, motivo) nunca foi usada
-- pelo sistema. Suas linhas (se houver) são preservadas numa cópia sem chaves
-- estrangeiras — assim excluir um médico (routes/medicos.ts) continua funcionando.
-- Formato das datas desconhecido, então nenhuma linha é convertida às cegas.
CREATE TABLE agenda_bloqueios_legado_001 AS SELECT * FROM agenda_bloqueios;
DROP TABLE agenda_bloqueios;

-- Um bloqueio vale de data_inicio a data_fim (inclusive), em cada dia, de hora_inicio
-- a hora_fim. Dia inteiro = 00:00–24:00. medico_id NULL = clínica toda.
CREATE TABLE agenda_bloqueios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  medico_id INTEGER REFERENCES usuarios (id) ON DELETE CASCADE,
  data_inicio TEXT NOT NULL CHECK (date(data_inicio) IS NOT NULL AND date(data_inicio) = data_inicio),
  data_fim TEXT NOT NULL CHECK (date(data_fim) IS NOT NULL AND date(data_fim) = data_fim),
  hora_inicio TEXT NOT NULL DEFAULT '00:00'
    CHECK (hora_inicio GLOB '[0-2][0-9]:[0-5][0-9]' AND hora_inicio < '24:00'),
  hora_fim TEXT NOT NULL DEFAULT '24:00'
    CHECK (hora_fim GLOB '[0-2][0-9]:[0-5][0-9]' AND hora_fim <= '24:00'),
  motivo TEXT CHECK (motivo IS NULL OR length(motivo) <= 200),
  criado_por INTEGER REFERENCES usuarios (id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  CHECK (data_inicio <= data_fim),
  CHECK (hora_inicio < hora_fim)
);

CREATE INDEX idx_agenda_bloqueios_periodo
  ON agenda_bloqueios (data_inicio, data_fim);

CREATE INDEX idx_agenda_bloqueios_medico
  ON agenda_bloqueios (medico_id, data_inicio);

CREATE TRIGGER trg_agenda_bloqueio_medico_ins
BEFORE INSERT ON agenda_bloqueios
FOR EACH ROW
WHEN NEW.medico_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM usuarios WHERE id = NEW.medico_id AND perfil = 'medico')
BEGIN
  SELECT RAISE(ABORT, 'Bloqueio de agenda: usuário informado não é médico');
END;

CREATE TRIGGER trg_agenda_bloqueio_medico_upd
BEFORE UPDATE OF medico_id ON agenda_bloqueios
FOR EACH ROW
WHEN NEW.medico_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM usuarios WHERE id = NEW.medico_id AND perfil = 'medico')
BEGIN
  SELECT RAISE(ABORT, 'Bloqueio de agenda: usuário informado não é médico');
END;
