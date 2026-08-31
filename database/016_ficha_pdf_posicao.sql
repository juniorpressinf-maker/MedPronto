-- F1′ — posicionamento de campos no modo pdf_fundo

CREATE TABLE IF NOT EXISTS ficha_campos_posicao (
  ficha_template_id INTEGER NOT NULL REFERENCES fichas_template (id) ON DELETE CASCADE,
  campo_id TEXT NOT NULL,
  x_pct REAL NOT NULL DEFAULT 5,
  y_pct REAL NOT NULL DEFAULT 5,
  largura_pct REAL NOT NULL DEFAULT 90,
  altura_pct REAL NOT NULL DEFAULT 10,
  PRIMARY KEY (ficha_template_id, campo_id)
);
