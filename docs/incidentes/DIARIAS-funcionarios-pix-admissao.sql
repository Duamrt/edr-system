-- DIARIAS — cadastro de funcionário: nome completo + chave PIX + admissão
-- Data: 2026-08-01
-- Contexto: PIX e nome completo saem no PDF da folha de pagamento;
-- admissão é informativa, auto-sugerida da primeira diária e editável.
-- admissao_manual=true marca edição do admin — backfill passa a ignorar.

ALTER TABLE diarias_funcionarios
  ADD COLUMN IF NOT EXISTS nome_completo text,
  ADD COLUMN IF NOT EXISTS chave_pix text,
  ADD COLUMN IF NOT EXISTS admissao date,
  ADD COLUMN IF NOT EXISTS admissao_manual boolean DEFAULT false;
