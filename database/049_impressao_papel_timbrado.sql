-- Impressão dos documentos do atendimento por médico: cabeçalho da clínica (padrão)
-- ou papel timbrado (sem cabeçalho, com margens em branco p/ o timbre).
ALTER TABLE usuarios ADD COLUMN impressao_timbrado INTEGER NOT NULL DEFAULT 0;
ALTER TABLE usuarios ADD COLUMN timbrado_topo_mm INTEGER NOT NULL DEFAULT 45;
ALTER TABLE usuarios ADD COLUMN timbrado_rodape_mm INTEGER NOT NULL DEFAULT 30;
