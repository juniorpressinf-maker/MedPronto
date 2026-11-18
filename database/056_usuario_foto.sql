-- Foto (avatar) do usuário, usada no chat interno.
-- Guardada como data URL JPEG pequena (~192x192, poucos KB), igual ao padrão do logo da clínica.
-- foto_atualizada_em serve de "versão" para o navegador poder guardar a imagem em cache.
ALTER TABLE usuarios ADD COLUMN foto TEXT;
ALTER TABLE usuarios ADD COLUMN foto_atualizada_em TEXT;
