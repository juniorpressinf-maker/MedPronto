-- Dados cadastrais do médico (além de login/CRM)
ALTER TABLE usuarios ADD COLUMN cpf TEXT;
ALTER TABLE usuarios ADD COLUMN telefone TEXT;
ALTER TABLE usuarios ADD COLUMN endereco TEXT;
ALTER TABLE usuarios ADD COLUMN email TEXT;
