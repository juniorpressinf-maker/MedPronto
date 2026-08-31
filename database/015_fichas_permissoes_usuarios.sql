-- Concede permissões de fichas a usuários com lista explícita (criados antes do módulo F0)

INSERT OR IGNORE INTO usuario_permissoes (usuario_id, modulo, permitido)
SELECT u.id, 'fichas_medico', 1
FROM usuarios u
WHERE u.perfil = 'medico'
  AND EXISTS (SELECT 1 FROM usuario_permissoes p WHERE p.usuario_id = u.id)
  AND NOT EXISTS (
    SELECT 1 FROM usuario_permissoes p
    WHERE p.usuario_id = u.id AND p.modulo = 'fichas_medico' AND p.permitido = 1
  );

INSERT OR IGNORE INTO usuario_permissoes (usuario_id, modulo, permitido)
SELECT u.id, 'fichas_config', 1
FROM usuarios u
WHERE u.perfil = 'admin'
  AND EXISTS (SELECT 1 FROM usuario_permissoes p WHERE p.usuario_id = u.id)
  AND NOT EXISTS (
    SELECT 1 FROM usuario_permissoes p
    WHERE p.usuario_id = u.id AND p.modulo = 'fichas_config' AND p.permitido = 1
  );

INSERT OR IGNORE INTO usuario_permissoes (usuario_id, modulo, permitido)
SELECT u.id, 'fichas_medico', 1
FROM usuarios u
WHERE u.perfil = 'admin'
  AND EXISTS (SELECT 1 FROM usuario_permissoes p WHERE p.usuario_id = u.id)
  AND NOT EXISTS (
    SELECT 1 FROM usuario_permissoes p
    WHERE p.usuario_id = u.id AND p.modulo = 'fichas_medico' AND p.permitido = 1
  );
