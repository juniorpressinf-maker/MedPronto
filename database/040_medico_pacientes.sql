-- Médico consulta cadastro do paciente (histórico de atendimento na ficha)

INSERT OR IGNORE INTO usuario_permissoes (usuario_id, modulo, permitido)
SELECT u.id, 'pacientes', 1
FROM usuarios u
WHERE u.perfil = 'medico'
  AND EXISTS (SELECT 1 FROM usuario_permissoes p WHERE p.usuario_id = u.id)
  AND NOT EXISTS (
    SELECT 1 FROM usuario_permissoes p
    WHERE p.usuario_id = u.id AND p.modulo = 'pacientes' AND p.permitido = 1
  );
