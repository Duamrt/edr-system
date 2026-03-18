-- ══════════════════════════════════════════
-- LEADS V2 — Extensão para CRM completo
-- ══════════════════════════════════════════

-- Novas colunas na tabela leads
ALTER TABLE leads ADD COLUMN IF NOT EXISTS proxima_acao TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS proxima_data DATE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS tipo_acao TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS obra_id UUID REFERENCES obras(id) ON DELETE SET NULL;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS anotacoes_internas TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMPTZ DEFAULT NOW();

-- Tabela de histórico de leads
CREATE TABLE IF NOT EXISTS lead_historico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  conteudo TEXT,
  usuario TEXT,
  criado_em TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE lead_historico ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lead_hist_auth" ON lead_historico FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
