-- U1 — produto único: sempre clínico + cobrança
-- Não há SKU clinico. Permissões de cobrança só em quem já tem linhas em usuario_permissoes
-- (quem não tem linha continua no PERMISSOES_PADRAO do código, que já inclui cobrança).

INSERT INTO app_meta (chave, valor) VALUES ('edicao', 'clinico_cobranca')
ON CONFLICT(chave) DO UPDATE SET valor = 'clinico_cobranca';

INSERT OR IGNORE INTO usuario_permissoes (usuario_id, modulo, permitido)
SELECT u.id, m.modulo, 1
FROM usuarios u
CROSS JOIN (
  SELECT 'cobranca' AS modulo
  UNION ALL SELECT 'cobranca_relatorios'
  UNION ALL SELECT 'cobranca_config'
) m
WHERE u.perfil = 'secretaria'
  AND EXISTS (SELECT 1 FROM usuario_permissoes p WHERE p.usuario_id = u.id);

INSERT OR IGNORE INTO usuario_permissoes (usuario_id, modulo, permitido)
SELECT u.id, 'cobranca_solicitar', 1
FROM usuarios u
WHERE u.perfil = 'medico'
  AND EXISTS (SELECT 1 FROM usuario_permissoes p WHERE p.usuario_id = u.id);

INSERT OR IGNORE INTO usuario_permissoes (usuario_id, modulo, permitido)
SELECT u.id, m.modulo, 1
FROM usuarios u
CROSS JOIN (
  SELECT 'cobranca' AS modulo
  UNION ALL SELECT 'cobranca_solicitar'
  UNION ALL SELECT 'cobranca_config'
  UNION ALL SELECT 'cobranca_relatorios'
) m
WHERE u.perfil = 'admin'
  AND EXISTS (SELECT 1 FROM usuario_permissoes p WHERE p.usuario_id = u.id);
