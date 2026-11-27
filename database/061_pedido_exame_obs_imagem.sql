-- 061: indicação clínica própria da folha de IMAGEM do pedido de exame.
-- Vazia: a folha de imagem repete a indicação geral (observacoes).
ALTER TABLE pedidos_exame ADD COLUMN observacoes_imagem TEXT;
