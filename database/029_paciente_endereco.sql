-- Endereço e contato de emergência do paciente
ALTER TABLE pacientes ADD COLUMN endereco TEXT;
ALTER TABLE pacientes ADD COLUMN numero TEXT;
ALTER TABLE pacientes ADD COLUMN bairro TEXT;
ALTER TABLE pacientes ADD COLUMN cidade TEXT;
ALTER TABLE pacientes ADD COLUMN uf TEXT;
ALTER TABLE pacientes ADD COLUMN fone_emergencia TEXT;
