-- ══════════════════════════════════════════════════════════════
-- EDR System → Multi-Tenant SaaS
-- Migração: adicionar company_id em todas as tabelas
-- IMPORTANTE: rodar no SQL Editor do Supabase
-- ══════════════════════════════════════════════════════════════

-- 1. Tabela de empresas
CREATE TABLE IF NOT EXISTS companies (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id uuid REFERENCES auth.users(id),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  cnpj text,
  phone text,
  city text,
  state text DEFAULT 'PE',
  address text,
  email_domain text,
  delivery_base_url text,
  logo_url text,
  plan text DEFAULT 'trial',
  trial_ends_at timestamptz DEFAULT (now() + interval '30 days'),
  created_at timestamptz DEFAULT now()
);

-- 2. Tabela de vínculo usuário ↔ empresa
CREATE TABLE IF NOT EXISTS company_users (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text DEFAULT 'operacional' CHECK (role IN ('admin','operacional','mestre','visitante')),
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(company_id, user_id)
);

-- 3. Inserir EDR Engenharia como primeira empresa
-- (substitua o owner_id pelo UUID do Duam no Supabase Auth)
INSERT INTO companies (name, slug, cnpj, phone, city, address, email_domain, delivery_base_url, plan)
VALUES (
  'EDR Engenharia',
  'edr',
  '49.909.440/0001-55',
  '87981713987',
  'Jupi',
  'Rua Gerson Ferreira de Almeida, 89, Centro, Jupi-PE',
  '@edreng.com.br',
  'https://edreng.com.br/entrega',
  'premium'
)
ON CONFLICT (slug) DO NOTHING;

-- 4. Adicionar company_id em todas as tabelas existentes
-- Primeiro pega o ID da EDR pra setar como default nos dados existentes

DO $$
DECLARE
  edr_id uuid;
BEGIN
  SELECT id INTO edr_id FROM companies WHERE slug = 'edr';

  -- Adicionar coluna company_id em cada tabela (se não existir)
  -- e setar dados existentes pra EDR

  -- obras
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='obras' AND column_name='company_id') THEN
    ALTER TABLE obras ADD COLUMN company_id uuid REFERENCES companies(id);
    UPDATE obras SET company_id = edr_id;
    ALTER TABLE obras ALTER COLUMN company_id SET NOT NULL;
    CREATE INDEX idx_obras_company ON obras(company_id);
  END IF;

  -- lancamentos
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='lancamentos' AND column_name='company_id') THEN
    ALTER TABLE lancamentos ADD COLUMN company_id uuid REFERENCES companies(id);
    UPDATE lancamentos SET company_id = edr_id;
    ALTER TABLE lancamentos ALTER COLUMN company_id SET NOT NULL;
    CREATE INDEX idx_lancamentos_company ON lancamentos(company_id);
  END IF;

  -- notas_fiscais
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='notas_fiscais' AND column_name='company_id') THEN
    ALTER TABLE notas_fiscais ADD COLUMN company_id uuid REFERENCES companies(id);
    UPDATE notas_fiscais SET company_id = edr_id;
    ALTER TABLE notas_fiscais ALTER COLUMN company_id SET NOT NULL;
    CREATE INDEX idx_notas_fiscais_company ON notas_fiscais(company_id);
  END IF;

  -- distribuicoes
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='distribuicoes' AND column_name='company_id') THEN
    ALTER TABLE distribuicoes ADD COLUMN company_id uuid REFERENCES companies(id);
    UPDATE distribuicoes SET company_id = edr_id;
    ALTER TABLE distribuicoes ALTER COLUMN company_id SET NOT NULL;
    CREATE INDEX idx_distribuicoes_company ON distribuicoes(company_id);
  END IF;

  -- entradas_diretas
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='entradas_diretas' AND column_name='company_id') THEN
    ALTER TABLE entradas_diretas ADD COLUMN company_id uuid REFERENCES companies(id);
    UPDATE entradas_diretas SET company_id = edr_id;
    ALTER TABLE entradas_diretas ALTER COLUMN company_id SET NOT NULL;
    CREATE INDEX idx_entradas_diretas_company ON entradas_diretas(company_id);
  END IF;

  -- repasses_cef
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='repasses_cef' AND column_name='company_id') THEN
    ALTER TABLE repasses_cef ADD COLUMN company_id uuid REFERENCES companies(id);
    UPDATE repasses_cef SET company_id = edr_id;
    ALTER TABLE repasses_cef ALTER COLUMN company_id SET NOT NULL;
    CREATE INDEX idx_repasses_cef_company ON repasses_cef(company_id);
  END IF;

  -- diarias_quinzenas
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='diarias_quinzenas' AND column_name='company_id') THEN
    ALTER TABLE diarias_quinzenas ADD COLUMN company_id uuid REFERENCES companies(id);
    UPDATE diarias_quinzenas SET company_id = edr_id;
    ALTER TABLE diarias_quinzenas ALTER COLUMN company_id SET NOT NULL;
    CREATE INDEX idx_diarias_quinzenas_company ON diarias_quinzenas(company_id);
  END IF;

  -- diarias
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='diarias' AND column_name='company_id') THEN
    ALTER TABLE diarias ADD COLUMN company_id uuid REFERENCES companies(id);
    UPDATE diarias SET company_id = edr_id;
    ALTER TABLE diarias ALTER COLUMN company_id SET NOT NULL;
    CREATE INDEX idx_diarias_company ON diarias(company_id);
  END IF;

  -- diarias_extras
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='diarias_extras' AND column_name='company_id') THEN
    ALTER TABLE diarias_extras ADD COLUMN company_id uuid REFERENCES companies(id);
    UPDATE diarias_extras SET company_id = edr_id;
    ALTER TABLE diarias_extras ALTER COLUMN company_id SET NOT NULL;
    CREATE INDEX idx_diarias_extras_company ON diarias_extras(company_id);
  END IF;

  -- diarias_funcionarios
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='diarias_funcionarios' AND column_name='company_id') THEN
    ALTER TABLE diarias_funcionarios ADD COLUMN company_id uuid REFERENCES companies(id);
    UPDATE diarias_funcionarios SET company_id = edr_id;
    ALTER TABLE diarias_funcionarios ALTER COLUMN company_id SET NOT NULL;
    CREATE INDEX idx_diarias_funcionarios_company ON diarias_funcionarios(company_id);
  END IF;

  -- ajustes_estoque
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ajustes_estoque' AND column_name='company_id') THEN
    ALTER TABLE ajustes_estoque ADD COLUMN company_id uuid REFERENCES companies(id);
    UPDATE ajustes_estoque SET company_id = edr_id;
    ALTER TABLE ajustes_estoque ALTER COLUMN company_id SET NOT NULL;
    CREATE INDEX idx_ajustes_estoque_company ON ajustes_estoque(company_id);
  END IF;

  -- contas_pagar
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='contas_pagar' AND column_name='company_id') THEN
    ALTER TABLE contas_pagar ADD COLUMN company_id uuid REFERENCES companies(id);
    UPDATE contas_pagar SET company_id = edr_id;
    ALTER TABLE contas_pagar ALTER COLUMN company_id SET NOT NULL;
    CREATE INDEX idx_contas_pagar_company ON contas_pagar(company_id);
  END IF;

  -- projecoes_caixa
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='projecoes_caixa' AND column_name='company_id') THEN
    ALTER TABLE projecoes_caixa ADD COLUMN company_id uuid REFERENCES companies(id);
    UPDATE projecoes_caixa SET company_id = edr_id;
    ALTER TABLE projecoes_caixa ALTER COLUMN company_id SET NOT NULL;
    CREATE INDEX idx_projecoes_caixa_company ON projecoes_caixa(company_id);
  END IF;

  -- garantia_chamados
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='garantia_chamados' AND column_name='company_id') THEN
    ALTER TABLE garantia_chamados ADD COLUMN company_id uuid REFERENCES companies(id);
    UPDATE garantia_chamados SET company_id = edr_id;
    ALTER TABLE garantia_chamados ALTER COLUMN company_id SET NOT NULL;
    CREATE INDEX idx_garantia_chamados_company ON garantia_chamados(company_id);
  END IF;

  -- obra_adicionais
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='obra_adicionais' AND column_name='company_id') THEN
    ALTER TABLE obra_adicionais ADD COLUMN company_id uuid REFERENCES companies(id);
    UPDATE obra_adicionais SET company_id = edr_id;
    ALTER TABLE obra_adicionais ALTER COLUMN company_id SET NOT NULL;
    CREATE INDEX idx_obra_adicionais_company ON obra_adicionais(company_id);
  END IF;

  -- adicional_pagamentos
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='adicional_pagamentos' AND column_name='company_id') THEN
    ALTER TABLE adicional_pagamentos ADD COLUMN company_id uuid REFERENCES companies(id);
    UPDATE adicional_pagamentos SET company_id = edr_id;
    ALTER TABLE adicional_pagamentos ALTER COLUMN company_id SET NOT NULL;
    CREATE INDEX idx_adicional_pagamentos_company ON adicional_pagamentos(company_id);
  END IF;

  -- leads
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leads' AND column_name='company_id') THEN
    ALTER TABLE leads ADD COLUMN company_id uuid REFERENCES companies(id);
    UPDATE leads SET company_id = edr_id;
    ALTER TABLE leads ALTER COLUMN company_id SET NOT NULL;
    CREATE INDEX idx_leads_company ON leads(company_id);
  END IF;

  -- lead_historico
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='lead_historico' AND column_name='company_id') THEN
    ALTER TABLE lead_historico ADD COLUMN company_id uuid REFERENCES companies(id);
    UPDATE lead_historico SET company_id = edr_id;
    ALTER TABLE lead_historico ALTER COLUMN company_id SET NOT NULL;
    CREATE INDEX idx_lead_historico_company ON lead_historico(company_id);
  END IF;

  -- agenda_notas
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agenda_notas' AND column_name='company_id') THEN
    ALTER TABLE agenda_notas ADD COLUMN company_id uuid REFERENCES companies(id);
    UPDATE agenda_notas SET company_id = edr_id;
    ALTER TABLE agenda_notas ALTER COLUMN company_id SET NOT NULL;
    CREATE INDEX idx_agenda_notas_company ON agenda_notas(company_id);
  END IF;

  -- materiais (catálogo) — compartilhado globalmente + por empresa
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='materiais' AND column_name='company_id') THEN
    ALTER TABLE materiais ADD COLUMN company_id uuid REFERENCES companies(id);
    UPDATE materiais SET company_id = edr_id;
    CREATE INDEX idx_materiais_company ON materiais(company_id);
    -- materiais pode ser NULL (catálogo global) ou ter company_id (catálogo da empresa)
  END IF;

  -- Vincular owner da EDR na company_users
  -- (pegar o primeiro admin do Supabase Auth)
  INSERT INTO company_users (company_id, user_id, role)
  SELECT edr_id, id, 'admin'
  FROM auth.users
  WHERE raw_user_meta_data->>'perfil' = 'admin'
  LIMIT 1
  ON CONFLICT (company_id, user_id) DO NOTHING;

END $$;

-- 5. RLS nas tabelas novas
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "companies_member" ON companies FOR ALL
  USING (
    id IN (SELECT company_id FROM company_users WHERE user_id = auth.uid() AND active = true)
    OR owner_id = auth.uid()
  );

CREATE POLICY "company_users_member" ON company_users FOR ALL
  USING (
    company_id IN (SELECT company_id FROM company_users WHERE user_id = auth.uid() AND active = true)
  );

-- 6. Função helper: pegar company_id do usuário logado
CREATE OR REPLACE FUNCTION get_my_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT company_id FROM company_users
  WHERE user_id = auth.uid() AND active = true
  LIMIT 1;
$$;

-- 7. Reescrever RLS de TODAS as tabelas pra filtrar por company_id
-- (dropar policies antigas e criar novas)

DO $$
DECLARE
  tabelas text[] := ARRAY[
    'obras','lancamentos','notas_fiscais','distribuicoes','entradas_diretas',
    'repasses_cef','diarias_quinzenas','diarias','diarias_extras','diarias_funcionarios',
    'ajustes_estoque','contas_pagar','projecoes_caixa','garantia_chamados',
    'obra_adicionais','adicional_pagamentos','leads','lead_historico','agenda_notas'
  ];
  t text;
BEGIN
  FOREACH t IN ARRAY tabelas LOOP
    -- Dropar policies antigas
    EXECUTE format('DROP POLICY IF EXISTS "%s_auth" ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_all" ON %I', t, t);

    -- Habilitar RLS
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);

    -- Criar policy de isolamento por empresa
    EXECUTE format(
      'CREATE POLICY "%s_company" ON %I FOR ALL
        USING (company_id = get_my_company_id())
        WITH CHECK (company_id = get_my_company_id())',
      t, t
    );
  END LOOP;
END $$;

-- Materiais: ver os da empresa + os globais (sem company_id)
DROP POLICY IF EXISTS "materiais_auth" ON materiais;
ALTER TABLE materiais ENABLE ROW LEVEL SECURITY;
CREATE POLICY "materiais_company" ON materiais FOR ALL
  USING (company_id = get_my_company_id() OR company_id IS NULL)
  WITH CHECK (company_id = get_my_company_id());

-- Leads: permitir insert anon (chatbot do site) + leitura por empresa
DROP POLICY IF EXISTS "leads_insert_anon" ON leads;
CREATE POLICY "leads_insert_anon" ON leads FOR INSERT
  WITH CHECK (true);

-- 8. Pronto! Verificar
SELECT 'Migração multi-tenant concluída!' AS status,
       (SELECT count(*) FROM companies) AS empresas,
       (SELECT count(*) FROM company_users) AS vinculos;
