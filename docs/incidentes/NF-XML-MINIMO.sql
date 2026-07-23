-- #####################################################################
-- ##  APLICADO EM PRODUCAO em 2026-07-23 (autorizado pelo Duam).      ##
-- ##  Versionado aqui como registro da migration ja executada.        ##
-- #####################################################################
-- ESCOPO MINIMO COMPLETO: lancar NF-e por XML sem duplicidade + desconto
-- total, usando o estoque atual SEM alterar arquitetura. Nada de lotes/
-- frete/cutover/FIFO/distribuicoes.  Data: 2026-07-23
--
--  1. coluna chave_acesso + desconto_total em notas_fiscais (legado NULL/0)
--  2. unicidade (company_id, chave_acesso) — banco impede duplicidade
--  3. TRIGGER: toda NF NOVA exige chave de acesso valida (44 dig + Mod 11).
--     -> "somente XML" vira regra de BANCO, nao so JS. INSERT manual via
--        REST/DevTools sem chave valida e' REJEITADO pelo banco.
--     -> legado (linhas existentes) intocado: trigger so vale para INSERT novo.

BEGIN;

-- 1) colunas novas (legado: chave NULL, desconto 0 — nao afeta as 145 notas)
ALTER TABLE public.notas_fiscais
  ADD COLUMN IF NOT EXISTS chave_acesso   text,
  ADD COLUMN IF NOT EXISTS desconto_total numeric NOT NULL DEFAULT 0;

-- 2) unicidade multi-tenant: mesma chave nao entra 2x na mesma empresa
CREATE UNIQUE INDEX IF NOT EXISTS uq_nf_chave_por_empresa
  ON public.notas_fiscais (company_id, chave_acesso)
  WHERE chave_acesso IS NOT NULL;

-- 3a) validador de chave (44 dig + modelo 55 + Mod 11) — no BANCO
CREATE OR REPLACE FUNCTION public.fn_chave_nfe_valida(p_chave text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE soma int := 0; peso int := 2; i int; dv_calc int; dv_inf int;
BEGIN
  IF p_chave IS NULL OR p_chave !~ '^\d{44}$' THEN RETURN false; END IF;
  IF substring(p_chave, 21, 2) <> '55' THEN RETURN false; END IF;  -- modelo NF-e
  dv_inf := (substring(p_chave, 44, 1))::int;
  FOR i IN REVERSE 43..1 LOOP
    soma := soma + (substring(p_chave, i, 1))::int * peso;
    peso := CASE WHEN peso = 9 THEN 2 ELSE peso + 1 END;
  END LOOP;
  dv_calc := 11 - (soma % 11);
  IF dv_calc >= 10 THEN dv_calc := 0; END IF;
  RETURN dv_calc = dv_inf;
END $$;

-- 3b) trigger: NF NOVA precisa de chave valida. Legado (UPDATE de linha antiga
--     que ja tem chave NULL) nao e' afetado — a regra so morde em INSERT.
CREATE OR REPLACE FUNCTION public.trg_nf_exige_chave()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF NEW.chave_acesso IS NULL OR NOT public.fn_chave_nfe_valida(NEW.chave_acesso) THEN
    RAISE EXCEPTION 'NF nova exige chave de acesso valida (44 digitos, modelo 55, Mod 11). Lancamento manual sem XML nao e' permitido.';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_nf_exige_chave ON public.notas_fiscais;
CREATE TRIGGER trg_nf_exige_chave
  BEFORE INSERT ON public.notas_fiscais
  FOR EACH ROW EXECUTE FUNCTION public.trg_nf_exige_chave();

-- 4) restaura a policy nf_insert (INSERT autenticado). A protecao "so XML" agora
--    e' o TRIGGER (chave valida obrigatoria), nao a policy false nem so o JS.
ALTER POLICY nf_insert ON public.notas_fiscais
  WITH CHECK ((company_id = auth_company_id())
              AND (auth_user_role() = ANY (ARRAY['admin','operacional'])));

-- guard: legado intocado
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.notas_fiscais WHERE chave_acesso IS NOT NULL;
  IF n <> 0 THEN RAISE EXCEPTION 'Migration tocou legado: % com chave. Abortando.', n; END IF;
  RAISE NOTICE 'OK: colunas+unicidade+trigger criados, nf_insert restaurada, legado intocado.';
END $$;

COMMIT;

-- ============ ROLLBACK (manual) ============
-- ALTER POLICY nf_insert ON public.notas_fiscais WITH CHECK (false);
-- DROP TRIGGER IF EXISTS trg_nf_exige_chave ON public.notas_fiscais;
-- DROP FUNCTION IF EXISTS public.trg_nf_exige_chave();
-- DROP FUNCTION IF EXISTS public.fn_chave_nfe_valida(text);
-- DROP INDEX IF EXISTS public.uq_nf_chave_por_empresa;
-- ALTER TABLE public.notas_fiscais DROP COLUMN IF EXISTS chave_acesso, DROP COLUMN IF EXISTS desconto_total;
