-- AM0/AM1 — Modelos de ASO: destino separado da ficha de consulta
-- Ver docs/MODULO_ASO_MODELOS.md

ALTER TABLE fichas_template ADD COLUMN destino TEXT NOT NULL DEFAULT 'prontuario';

CREATE UNIQUE INDEX IF NOT EXISTS idx_fichas_template_default_destino
  ON fichas_template (destino)
  WHERE eh_default = 1 AND medico_id IS NULL;

ALTER TABLE agendamentos ADD COLUMN aso_template_id INTEGER
  REFERENCES fichas_template (id);

ALTER TABLE admissionais ADD COLUMN aso_template_id INTEGER
  REFERENCES fichas_template (id);

ALTER TABLE admissionais ADD COLUMN template_snapshot_json TEXT;

DROP TRIGGER IF EXISTS trg_ficha_destino_imutavel;
CREATE TRIGGER trg_ficha_destino_imutavel
BEFORE UPDATE OF destino ON fichas_template
FOR EACH ROW
WHEN OLD.destino IS NOT NEW.destino
BEGIN
  SELECT RAISE(ABORT, 'Destino do modelo não pode ser alterado');
END;

DROP TRIGGER IF EXISTS trg_ficha_destino_valor;
CREATE TRIGGER trg_ficha_destino_valor
BEFORE INSERT ON fichas_template
FOR EACH ROW
WHEN NEW.destino NOT IN ('prontuario', 'aso')
BEGIN
  SELECT RAISE(ABORT, 'Destino do modelo inválido');
END;

DROP TRIGGER IF EXISTS trg_ficha_destino_valor_upd;
CREATE TRIGGER trg_ficha_destino_valor_upd
BEFORE UPDATE OF destino ON fichas_template
FOR EACH ROW
WHEN NEW.destino NOT IN ('prontuario', 'aso')
BEGIN
  SELECT RAISE(ABORT, 'Destino do modelo inválido');
END;

DROP TRIGGER IF EXISTS trg_ag_ficha_destino_ins;
CREATE TRIGGER trg_ag_ficha_destino_ins
BEFORE INSERT ON agendamentos
FOR EACH ROW
WHEN NEW.ficha_template_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'Ficha clínica inconsistente')
  WHERE NEW.tipo_atendimento != 'consulta'
     OR NOT EXISTS (
       SELECT 1 FROM fichas_template f
       WHERE f.id = NEW.ficha_template_id AND f.destino = 'prontuario'
     );
END;

DROP TRIGGER IF EXISTS trg_ag_ficha_destino_upd;
CREATE TRIGGER trg_ag_ficha_destino_upd
BEFORE UPDATE OF ficha_template_id, tipo_atendimento ON agendamentos
FOR EACH ROW
WHEN NEW.ficha_template_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'Ficha clínica inconsistente')
  WHERE NEW.tipo_atendimento != 'consulta'
     OR NOT EXISTS (
       SELECT 1 FROM fichas_template f
       WHERE f.id = NEW.ficha_template_id AND f.destino = 'prontuario'
     );
END;

DROP TRIGGER IF EXISTS trg_ag_aso_template_ins;
CREATE TRIGGER trg_ag_aso_template_ins
BEFORE INSERT ON agendamentos
FOR EACH ROW
WHEN NEW.aso_template_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'Modelo ASO inconsistente')
  WHERE NEW.tipo_atendimento != 'admissional'
     OR NOT EXISTS (
       SELECT 1 FROM fichas_template f
       WHERE f.id = NEW.aso_template_id AND f.destino = 'aso'
     );
END;

DROP TRIGGER IF EXISTS trg_ag_aso_template_upd;
CREATE TRIGGER trg_ag_aso_template_upd
BEFORE UPDATE OF aso_template_id, tipo_atendimento ON agendamentos
FOR EACH ROW
WHEN NEW.aso_template_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'Modelo ASO inconsistente')
  WHERE NEW.tipo_atendimento != 'admissional'
     OR NOT EXISTS (
       SELECT 1 FROM fichas_template f
       WHERE f.id = NEW.aso_template_id AND f.destino = 'aso'
     );
END;

DROP TRIGGER IF EXISTS trg_prontuario_ficha_destino_ins;
CREATE TRIGGER trg_prontuario_ficha_destino_ins
BEFORE INSERT ON prontuarios
FOR EACH ROW
WHEN NEW.ficha_template_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'Ficha clínica inconsistente')
  WHERE NOT EXISTS (
    SELECT 1 FROM fichas_template f
    WHERE f.id = NEW.ficha_template_id AND f.destino = 'prontuario'
  );
END;

DROP TRIGGER IF EXISTS trg_prontuario_ficha_destino_upd;
CREATE TRIGGER trg_prontuario_ficha_destino_upd
BEFORE UPDATE OF ficha_template_id ON prontuarios
FOR EACH ROW
WHEN NEW.ficha_template_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'Ficha clínica inconsistente')
  WHERE NOT EXISTS (
    SELECT 1 FROM fichas_template f
    WHERE f.id = NEW.ficha_template_id AND f.destino = 'prontuario'
  );
END;

DROP TRIGGER IF EXISTS trg_admissional_aso_template_ins;
CREATE TRIGGER trg_admissional_aso_template_ins
BEFORE INSERT ON admissionais
FOR EACH ROW
WHEN NEW.aso_template_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'Modelo ASO inconsistente')
  WHERE NOT EXISTS (
    SELECT 1 FROM fichas_template f
    WHERE f.id = NEW.aso_template_id AND f.destino = 'aso'
  );
END;

DROP TRIGGER IF EXISTS trg_admissional_aso_template_upd;
CREATE TRIGGER trg_admissional_aso_template_upd
BEFORE UPDATE OF aso_template_id ON admissionais
FOR EACH ROW
WHEN NEW.aso_template_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'Modelo ASO inconsistente')
  WHERE NOT EXISTS (
    SELECT 1 FROM fichas_template f
    WHERE f.id = NEW.aso_template_id AND f.destino = 'aso'
  );
END;

INSERT INTO fichas_template (
  nome,
  titulo_documento,
  modo,
  campos_json,
  medico_id,
  eh_default,
  ativo,
  destino
)
SELECT
  'ASO — padrão clínica',
  'Atestado de Saúde Ocupacional',
  'secoes',
  '[
    {"id":"tipo_atestado","label":"Tipo de atestado","tipo":"escolha","ordem":1,"obrigatorio":true,"opcoes":["admissional","demissional","periodico","retorno_trabalho","mudanca_funcao"]},
    {"id":"empresa","label":"Nome da Empresa","tipo":"text","ordem":2,"obrigatorio":true},
    {"id":"ci","label":"C.I.","tipo":"text","ordem":3},
    {"id":"funcao","label":"Função","tipo":"text","ordem":4},
    {"id":"riscos_texto","label":"Riscos ocupacionais (descrição)","tipo":"textarea","ordem":5},
    {"id":"quimicos","label":"Agentes químicos","tipo":"marcadores","ordem":6,"opcoes":["Detergente","Desinfetante","Álcool Etílico","Sabão Líquido","Ferro","Poeira","Hipoclorito de sódio 1%","Clorado 10%","Hidrocarbonetos","Organofosforado","Cromo","Fosfina","Tolueno","Xileno","Benzeno","Etilbenzeno","Níquel","Chumbo","Estanho","Hidróxido de sódio","Pigmento","Resina","Cimento","Piretroides"]},
    {"id":"fisicos","label":"Agentes físicos","tipo":"marcadores","ordem":7,"opcoes":["Calor","Frio","Radiação UV","Ruído","Umidade"]},
    {"id":"biologicos","label":"Agentes biológicos","tipo":"checkbox","ordem":8},
    {"id":"ergonomicos","label":"Ergonômicos","tipo":"checkbox","ordem":9},
    {"id":"acidentes","label":"Riscos de acidentes","tipo":"marcadores","ordem":10,"opcoes":["Quedas","Choque","Outros"]},
    {"id":"riscos_outros","label":"Outros riscos","tipo":"text","ordem":11},
    {"id":"exames","label":"Exames realizados","tipo":"marcadores","ordem":12,"opcoes":["Exame Clínico","Audiometria","Avaliação vocal","Acuidade Visual","ECG","EEG","Hemograma","Glicemia","Anti - Hbs","HBS-ag","Anti-Hcv","Rx Tórax","Rx coluna vertebral"]},
    {"id":"exames_outros","label":"Outros exames","tipo":"text","ordem":13},
    {"id":"nr35","label":"NR 35 — trabalho em altura","tipo":"escolha","ordem":14,"opcoes":["apto_altura","inapto_altura","nao_aplica"]},
    {"id":"observacoes","label":"Observações","tipo":"textarea","ordem":15},
    {"id":"conclusao","label":"Conclusão","tipo":"escolha","ordem":16,"obrigatorio":true,"opcoes":["apto","inapto","apto_com_restricao"]}
  ]',
  NULL,
  1,
  1,
  'aso'
WHERE NOT EXISTS (
  SELECT 1 FROM fichas_template WHERE destino = 'aso' AND eh_default = 1 AND medico_id IS NULL
);
