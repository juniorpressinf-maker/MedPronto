-- Permissões por módulo (Fase 1) — admin define o que cada usuário acessa
-- Ver docs/Plano_MedPronto_v2.md seção 2

CREATE TABLE IF NOT EXISTS usuario_permissoes (
  usuario_id INTEGER NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  modulo     TEXT NOT NULL,
  permitido  INTEGER NOT NULL DEFAULT 1 CHECK (permitido IN (0, 1)),
  PRIMARY KEY (usuario_id, modulo)
);

CREATE INDEX IF NOT EXISTS idx_usuario_permissoes_modulo
  ON usuario_permissoes (modulo, permitido);

-- Módulos válidos (documentação; validação no backend):
-- agenda, pacientes, fila_recepcao, exames_anexos,
-- fila_medico, prontuario_ler, prontuario_escrever, receituario, documentos,
-- usuarios, clinica, backup, licenca, whatsapp
