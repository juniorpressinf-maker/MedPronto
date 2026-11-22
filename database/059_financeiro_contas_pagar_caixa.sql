-- ============================================================
-- 059 - Financeiro: contas a pagar + caixa (molde CliniCar)
--
-- * caixa_categorias: categorias de entrada/saida (as de saida
--   tambem classificam as contas a pagar)
-- * caixa_movimentos: lancamentos manuais (suprimento, sangria...)
--   e as saidas geradas ao pagar uma conta a pagar.
--   As entradas da Cobranca NAO sao copiadas aqui: o caixa le
--   direto de conta_pagamentos (estorno da cobranca ja some sozinho).
-- * fornecedores (DIVERSOS ja nasce)
-- * contas_pagar: vencimento, parcelas do mesmo lancamento (lote)
--   ou repetir todo mes (aluguel, luz)
-- * contas_pagar_pagamentos: quitacao com juros/desconto; estorno
--   devolve a conta para aberta e fica no historico
-- ============================================================

CREATE TABLE IF NOT EXISTS caixa_categorias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL UNIQUE COLLATE NOCASE,
  natureza TEXT NOT NULL CHECK (natureza IN ('entrada', 'saida')),
  ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1))
);

INSERT OR IGNORE INTO caixa_categorias (nome, natureza) VALUES
  ('Fornecedores', 'saida'),
  ('Aluguel e condomínio', 'saida'),
  ('Água, luz e telefone', 'saida'),
  ('Material de consumo', 'saida'),
  ('Salários e encargos', 'saida'),
  ('Impostos e taxas', 'saida'),
  ('Manutenção', 'saida'),
  ('Sangria', 'saida'),
  ('Outras despesas', 'saida'),
  ('Suprimento / troco', 'entrada'),
  ('Outras entradas', 'entrada'),
  ('Estorno de conta paga', 'entrada');

CREATE TABLE IF NOT EXISTS fornecedores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL UNIQUE COLLATE NOCASE,
  documento TEXT,
  telefone TEXT,
  observacao TEXT,
  ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

INSERT OR IGNORE INTO fornecedores (nome) VALUES ('DIVERSOS');

CREATE TABLE IF NOT EXISTS contas_pagar (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fornecedor_id INTEGER NOT NULL REFERENCES fornecedores (id),
  categoria_id INTEGER NOT NULL REFERENCES caixa_categorias (id),
  descricao TEXT NOT NULL DEFAULT '',
  documento TEXT NOT NULL DEFAULT '',
  valor_centavos INTEGER NOT NULL CHECK (valor_centavos > 0),
  vencimento TEXT NOT NULL,
  forma_prevista TEXT,
  linha_pagamento TEXT NOT NULL DEFAULT '',
  observacao TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'paga')),
  -- Parcelas do mesmo lancamento (lote) - nulo na conta unica
  lote_id TEXT,
  parcela_seq INTEGER,
  parcela_total INTEGER,
  -- Repetir todo mes (aluguel, luz) - cada mes e uma conta propria
  repete_id TEXT,
  repete_seq INTEGER,
  repete_total INTEGER,
  criado_por INTEGER REFERENCES usuarios (id),
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  CHECK (
    (lote_id IS NULL AND parcela_seq IS NULL AND parcela_total IS NULL)
    OR (lote_id IS NOT NULL AND parcela_total BETWEEN 2 AND 60 AND parcela_seq BETWEEN 1 AND parcela_total)
  ),
  CHECK (
    (repete_id IS NULL AND repete_seq IS NULL AND repete_total IS NULL)
    OR (repete_id IS NOT NULL AND repete_total BETWEEN 2 AND 24 AND repete_seq BETWEEN 1 AND repete_total)
  )
);

CREATE INDEX IF NOT EXISTS idx_contas_pagar_venc ON contas_pagar (status, vencimento);
CREATE INDEX IF NOT EXISTS idx_contas_pagar_fornecedor ON contas_pagar (fornecedor_id);

CREATE TABLE IF NOT EXISTS contas_pagar_pagamentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conta_id INTEGER NOT NULL REFERENCES contas_pagar (id) ON DELETE CASCADE,
  data_pagamento TEXT NOT NULL,
  valor_centavos INTEGER NOT NULL CHECK (valor_centavos > 0),
  juros_centavos INTEGER NOT NULL DEFAULT 0 CHECK (juros_centavos >= 0),
  desconto_centavos INTEGER NOT NULL DEFAULT 0 CHECK (desconto_centavos >= 0),
  forma TEXT NOT NULL,
  observacao TEXT,
  usuario_id INTEGER REFERENCES usuarios (id),
  estornado_em TEXT,
  estornado_por INTEGER REFERENCES usuarios (id),
  motivo_estorno TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- Uma quitacao valida por conta (a estornada fica no historico)
CREATE UNIQUE INDEX IF NOT EXISTS uq_cp_pagamento_ativo
  ON contas_pagar_pagamentos (conta_id)
  WHERE estornado_em IS NULL;

CREATE TABLE IF NOT EXISTS caixa_movimentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  categoria_id INTEGER NOT NULL REFERENCES caixa_categorias (id),
  natureza TEXT NOT NULL CHECK (natureza IN ('entrada', 'saida')),
  valor_centavos INTEGER NOT NULL CHECK (valor_centavos > 0),
  data TEXT NOT NULL DEFAULT (date('now', 'localtime')),
  descricao TEXT,
  forma TEXT,
  manual INTEGER NOT NULL DEFAULT 0 CHECK (manual IN (0, 1)),
  conta_pagar_pagamento_id INTEGER REFERENCES contas_pagar_pagamentos (id) ON DELETE SET NULL,
  registrado_por INTEGER REFERENCES usuarios (id),
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_caixa_mov_data ON caixa_movimentos (data, natureza);

-- Pagamento de conta a pagar sai do caixa uma vez so
CREATE UNIQUE INDEX IF NOT EXISTS uq_caixa_mov_cp_pagamento
  ON caixa_movimentos (conta_pagar_pagamento_id)
  WHERE conta_pagar_pagamento_id IS NOT NULL;
