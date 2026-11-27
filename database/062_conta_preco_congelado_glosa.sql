-- Auditoria do fluxo (26/11/2026)
-- reaberta_em: conta reaberta não é mais reprecificada pela tabela atual (preço do dia do atendimento vale).
-- glosa_centavos / glosa_motivo: diferença que o convênio não pagou na baixa (antes sumia sem registro).
ALTER TABLE contas_atendimento ADD COLUMN reaberta_em TEXT;
ALTER TABLE contas_atendimento ADD COLUMN glosa_centavos INTEGER NOT NULL DEFAULT 0;
ALTER TABLE contas_atendimento ADD COLUMN glosa_motivo TEXT;
