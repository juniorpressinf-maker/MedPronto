-- CID-10 no pedido de exames (tela igual ao Clinicar; sai na impressão).
ALTER TABLE pedidos_exame ADD COLUMN cid_codigo TEXT;
ALTER TABLE pedidos_exame ADD COLUMN cid_descricao TEXT;
