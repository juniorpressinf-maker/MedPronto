-- Auditoria do fluxo (26/11/2026) [9] — pagamentos protegidos e estorno com registro.

-- Estorno guarda a linha do pagamento (antes ela era apagada e sobrava só o texto no log).
CREATE TABLE IF NOT EXISTS conta_pagamentos_estornados (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pagamento_id INTEGER NOT NULL,
  conta_id INTEGER NOT NULL REFERENCES contas_atendimento (id),
  forma TEXT NOT NULL,
  valor_centavos INTEGER NOT NULL,
  registrado_em TEXT NOT NULL,
  registrado_por INTEGER REFERENCES usuarios (id),
  observacao TEXT,
  estornado_em TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  estornado_por INTEGER REFERENCES usuarios (id),
  motivo TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_conta_pagamentos_estornados_conta
  ON conta_pagamentos_estornados (conta_id);

-- Estorno registrado não se altera nem se apaga.
DROP TRIGGER IF EXISTS trg_pagamento_estornado_imutavel_upd;
CREATE TRIGGER trg_pagamento_estornado_imutavel_upd
BEFORE UPDATE ON conta_pagamentos_estornados
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'Estorno registrado não pode ser alterado');
END;

DROP TRIGGER IF EXISTS trg_pagamento_estornado_imutavel_del;
CREATE TRIGGER trg_pagamento_estornado_imutavel_del
BEFORE DELETE ON conta_pagamentos_estornados
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'Estorno registrado não pode ser apagado');
END;

-- Valor, forma e conta de um pagamento não mudam (corrige-se estornando e lançando de novo).
DROP TRIGGER IF EXISTS trg_conta_pagamento_valores_imutaveis_upd;
CREATE TRIGGER trg_conta_pagamento_valores_imutaveis_upd
BEFORE UPDATE OF conta_id, forma, valor_centavos ON conta_pagamentos
FOR EACH ROW
WHEN NEW.conta_id IS NOT OLD.conta_id
  OR NEW.forma IS NOT OLD.forma
  OR NEW.valor_centavos IS NOT OLD.valor_centavos
BEGIN
  SELECT RAISE(ABORT, 'Pagamento não pode ser alterado — estorne e lance de novo');
END;

-- Pagamento só entra em conta que recebe (em aberto, ou aguardando repasse do convênio) e com valor positivo.
DROP TRIGGER IF EXISTS trg_conta_pagamento_conta_recebe_ins;
CREATE TRIGGER trg_conta_pagamento_conta_recebe_ins
BEFORE INSERT ON conta_pagamentos
FOR EACH ROW
WHEN NEW.valor_centavos <= 0
  OR NOT EXISTS (
    SELECT 1 FROM contas_atendimento
    WHERE id = NEW.conta_id AND status IN ('em_aberto', 'a_faturar_convenio')
  )
BEGIN
  SELECT RAISE(ABORT, 'Pagamento só em conta em aberto (ou aguardando repasse do convênio) e com valor positivo');
END;
