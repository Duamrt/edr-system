-- ══════════════════════════════════════════════════════════════
-- EDR SYSTEM — SEGURANÇA: RLS + Policies
-- Executar no Supabase SQL Editor (https://supabase.com/dashboard)
-- ══════════════════════════════════════════════════════════════

-- 1. HABILITAR RLS EM TODAS AS TABELAS
-- (tabelas que estavam com RLS desabilitado)

ALTER TABLE notas_fiscais ENABLE ROW LEVEL SECURITY;
ALTER TABLE distribuicoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE entradas_diretas ENABLE ROW LEVEL SECURITY;
ALTER TABLE diarias_quinzenas ENABLE ROW LEVEL SECURITY;
ALTER TABLE diarias ENABLE ROW LEVEL SECURITY;
ALTER TABLE diarias_extras ENABLE ROW LEVEL SECURITY;
ALTER TABLE diarias_funcionarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE ajustes_estoque ENABLE ROW LEVEL SECURITY;
ALTER TABLE lancamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE obras ENABLE ROW LEVEL SECURITY;
ALTER TABLE materiais ENABLE ROW LEVEL SECURITY;
ALTER TABLE obra_adicionais ENABLE ROW LEVEL SECURITY;
ALTER TABLE adicional_pagamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- 2. POLICIES: Só usuários autenticados (logados via Auth) acessam dados
-- Regra simples: autenticou = pode tudo. Sem auth = bloqueado.

-- notas_fiscais
DROP POLICY IF EXISTS "notas_auth" ON notas_fiscais;
CREATE POLICY "notas_auth" ON notas_fiscais FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- distribuicoes
DROP POLICY IF EXISTS "dist_auth" ON distribuicoes;
CREATE POLICY "dist_auth" ON distribuicoes FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- entradas_diretas
DROP POLICY IF EXISTS "entradas_auth" ON entradas_diretas;
CREATE POLICY "entradas_auth" ON entradas_diretas FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- diarias_quinzenas
DROP POLICY IF EXISTS "quinzenas_auth" ON diarias_quinzenas;
CREATE POLICY "quinzenas_auth" ON diarias_quinzenas FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- diarias
DROP POLICY IF EXISTS "diarias_auth" ON diarias;
CREATE POLICY "diarias_auth" ON diarias FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- diarias_extras
DROP POLICY IF EXISTS "extras_auth" ON diarias_extras;
CREATE POLICY "extras_auth" ON diarias_extras FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- diarias_funcionarios
DROP POLICY IF EXISTS "func_auth" ON diarias_funcionarios;
CREATE POLICY "func_auth" ON diarias_funcionarios FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ajustes_estoque
DROP POLICY IF EXISTS "ajustes_auth" ON ajustes_estoque;
CREATE POLICY "ajustes_auth" ON ajustes_estoque FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- lancamentos
DROP POLICY IF EXISTS "lanc_auth" ON lancamentos;
CREATE POLICY "lanc_auth" ON lancamentos FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- obras
DROP POLICY IF EXISTS "obras_auth" ON obras;
CREATE POLICY "obras_auth" ON obras FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- materiais (catálogo)
DROP POLICY IF EXISTS "materiais_auth" ON materiais;
CREATE POLICY "materiais_auth" ON materiais FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- obra_adicionais
DROP POLICY IF EXISTS "adicionais_auth" ON obra_adicionais;
CREATE POLICY "adicionais_auth" ON obra_adicionais FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- adicional_pagamentos
DROP POLICY IF EXISTS "pgtos_auth" ON adicional_pagamentos;
CREATE POLICY "pgtos_auth" ON adicional_pagamentos FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- leads
DROP POLICY IF EXISTS "leads_auth" ON leads;
CREATE POLICY "leads_auth" ON leads FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- repasses_cef (já tinha RLS, recriar policy mais restritiva)
DROP POLICY IF EXISTS "repasses_cef_all" ON repasses_cef;
CREATE POLICY "repasses_auth" ON repasses_cef FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- usuarios (já tinha RLS, garantir policy)
DROP POLICY IF EXISTS "usuarios_auth" ON usuarios;
CREATE POLICY "usuarios_auth" ON usuarios FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- 3. RPC PARA ADMIN: Gerenciamento de usuários Auth
-- (substitui a service key exposta no frontend)

CREATE OR REPLACE FUNCTION admin_create_auth_user(
  p_email TEXT,
  p_password TEXT,
  p_nome TEXT,
  p_perfil TEXT,
  p_usuario TEXT
) RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_perfil TEXT;
  new_user JSON;
BEGIN
  -- Verificar se quem chama é admin
  SELECT raw_user_meta_data->>'perfil' INTO caller_perfil
  FROM auth.users WHERE id = auth.uid();

  IF caller_perfil IS NULL OR caller_perfil != 'admin' THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem criar usuários.';
  END IF;

  -- Criar usuário via auth.users (inserção direta com SECURITY DEFINER)
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(), 'authenticated', 'authenticated',
    p_email,
    crypt(p_password, gen_salt('bf')),
    NOW(),
    jsonb_build_object('nome', p_nome, 'perfil', p_perfil, 'usuario', p_usuario),
    NOW(), NOW(), '', '', '', ''
  )
  RETURNING json_build_object('id', id, 'email', email) INTO new_user;

  RETURN new_user;
END;
$$;

CREATE OR REPLACE FUNCTION admin_update_auth_user(
  p_email TEXT,
  p_updates JSON
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_perfil TEXT;
  target_id UUID;
  new_password TEXT;
  new_meta JSONB;
  ban_duration TEXT;
BEGIN
  -- Verificar se quem chama é admin
  SELECT raw_user_meta_data->>'perfil' INTO caller_perfil
  FROM auth.users WHERE id = auth.uid();

  IF caller_perfil IS NULL OR caller_perfil != 'admin' THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem alterar usuários.';
  END IF;

  -- Encontrar o usuário alvo
  SELECT id INTO target_id FROM auth.users WHERE email = p_email;
  IF target_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não encontrado: %', p_email;
  END IF;

  -- Atualizar senha se fornecida
  new_password := p_updates->>'password';
  IF new_password IS NOT NULL AND new_password != '' THEN
    UPDATE auth.users SET encrypted_password = crypt(new_password, gen_salt('bf')), updated_at = NOW()
    WHERE id = target_id;
  END IF;

  -- Atualizar metadata se fornecida
  new_meta := (p_updates->'user_metadata')::JSONB;
  IF new_meta IS NOT NULL THEN
    UPDATE auth.users SET raw_user_meta_data = raw_user_meta_data || new_meta, updated_at = NOW()
    WHERE id = target_id;
  END IF;

  -- Ban/unban se fornecido
  ban_duration := p_updates->>'ban_duration';
  IF ban_duration IS NOT NULL THEN
    IF ban_duration = 'none' THEN
      UPDATE auth.users SET banned_until = NULL, updated_at = NOW() WHERE id = target_id;
    ELSE
      UPDATE auth.users SET banned_until = NOW() + ban_duration::INTERVAL, updated_at = NOW() WHERE id = target_id;
    END IF;
  END IF;

  RETURN TRUE;
END;
$$;

-- Dar permissão de execução apenas para usuários autenticados
GRANT EXECUTE ON FUNCTION admin_create_auth_user TO authenticated;
GRANT EXECUTE ON FUNCTION admin_update_auth_user TO authenticated;
