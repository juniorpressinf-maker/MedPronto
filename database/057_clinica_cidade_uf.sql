-- Cidade e UF da clínica: usadas no "Cidade (UF), data" antes da assinatura
-- das receitas, pedidos de exame e atestados.
ALTER TABLE clinica ADD COLUMN cidade TEXT;
ALTER TABLE clinica ADD COLUMN uf TEXT;
