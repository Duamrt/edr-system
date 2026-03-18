-- Colunas de contrato CEF na tabela obras
-- Executar no Supabase SQL Editor

ALTER TABLE obras ADD COLUMN IF NOT EXISTS contrato_valor DECIMAL(15,2) DEFAULT 0;
ALTER TABLE obras ADD COLUMN IF NOT EXISTS contrato_entrada DECIMAL(15,2) DEFAULT 0;
ALTER TABLE obras ADD COLUMN IF NOT EXISTS contrato_terreno DECIMAL(15,2) DEFAULT 0;
ALTER TABLE obras ADD COLUMN IF NOT EXISTS contrato_taxa TEXT DEFAULT '';
ALTER TABLE obras ADD COLUMN IF NOT EXISTS contrato_prazo TEXT DEFAULT '';
ALTER TABLE obras ADD COLUMN IF NOT EXISTS contrato_data DATE;

-- Comentários
COMMENT ON COLUMN obras.contrato_valor IS 'Valor total contratado CEF';
COMMENT ON COLUMN obras.contrato_entrada IS 'Valor da entrada do cliente';
COMMENT ON COLUMN obras.contrato_terreno IS 'Valor do terreno no contrato';
COMMENT ON COLUMN obras.contrato_taxa IS 'Taxa de juros (ex: 7,95% a.a.)';
COMMENT ON COLUMN obras.contrato_prazo IS 'Prazo do financiamento (ex: 360 meses)';
COMMENT ON COLUMN obras.contrato_data IS 'Data de assinatura do contrato';
