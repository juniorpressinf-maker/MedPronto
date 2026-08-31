ALTER TABLE prontuarios ADD COLUMN retificacao_finalizada INTEGER NOT NULL DEFAULT 0;

-- Retificações já finalizadas antes desta migração (via log de auditoria)
UPDATE prontuarios
SET retificacao_finalizada = 1
WHERE retificacao_de_id IS NOT NULL
  AND id IN (
    SELECT CAST(REPLACE(detalhe, 'prontuario=', '') AS INTEGER)
    FROM log_acesso
    WHERE acao = 'atendimento_finalizado'
      AND detalhe GLOB 'prontuario=[0-9]*'
  );
