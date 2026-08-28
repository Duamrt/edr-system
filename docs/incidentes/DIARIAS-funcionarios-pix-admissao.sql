-- DIARIAS — cadastro de funcionário: nome completo + chave PIX + admissão
-- Data: 2026-08-01
-- Contexto: PIX e nome completo saem no PDF da folha de pagamento;
-- admissão é informativa, auto-sugerida da primeira diária e editável.
-- admissao_manual=true marca edição do admin — backfill passa a ignorar.
--
-- Regressao confirmada em 2026-08-28:
-- diarias_funcionarios_admin() continuou com o retorno anterior e omitia
-- nome_completo/chave_pix. Como o PDF usa o retorno dessa RPC, imprimia "—".
-- Correcao versionada em sql/diarias-migration-d-admin-pix-pdf.sql.
-- Teste de regressao: tests/diarias-pix-pdf.test.js.
-- Aplicada em producao em 2026-08-28; RPC retornou PIX para 7/7 ativos,
-- mestre recebeu 42501 e o PDF foi confirmado visualmente pelo Duam.

ALTER TABLE diarias_funcionarios
  ADD COLUMN IF NOT EXISTS nome_completo text,
  ADD COLUMN IF NOT EXISTS chave_pix text,
  ADD COLUMN IF NOT EXISTS admissao date,
  ADD COLUMN IF NOT EXISTS admissao_manual boolean DEFAULT false;
