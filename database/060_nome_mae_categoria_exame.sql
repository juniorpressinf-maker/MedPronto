-- 060: nome da mãe no cadastro do paciente (aparece no prontuário)
--      + categoria de exame corrigida pelo médico (pedido sai em folhas: laboratório / imagem).
ALTER TABLE pacientes ADD COLUMN nome_mae TEXT;

CREATE TABLE IF NOT EXISTS exame_categoria (
  -- nome do exame em maiúsculas, sem acento (chaveExame)
  nome_chave TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  categoria TEXT NOT NULL CHECK (categoria IN ('lab', 'imagem')),
  atualizado_por INTEGER REFERENCES usuarios (id),
  updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
