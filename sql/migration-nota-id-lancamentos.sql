-- ══════════════════════════════════════════════════════════════════
-- MIGRAÇÃO: Vínculo real nota_id em lancamentos
-- Data: 2026-04-07
-- Propósito: Permitir exclusão em cascata de lançamentos quando
--            uma nota fiscal for excluída (Operação Elo de Ferro)
-- ══════════════════════════════════════════════════════════════════

-- 1. Adicionar coluna nota_id (nullable — lançamentos manuais ficam NULL)
ALTER TABLE lancamentos
  ADD COLUMN IF NOT EXISTS nota_id UUID REFERENCES notas_fiscais(id) ON DELETE SET NULL;

-- 2. Criar índice para performance na exclusão
CREATE INDEX IF NOT EXISTS idx_lancamentos_nota_id ON lancamentos(nota_id) WHERE nota_id IS NOT NULL;

-- 3. RETROATIVO: vincular lançamentos já existentes que têm número da NF no obs
--    Padrão: obs LIKE 'NF 12345 · ...' ou obs LIKE '%NF 12345%'
UPDATE lancamentos l
SET nota_id = n.id
FROM notas_fiscais n
WHERE l.nota_id IS NULL
  AND l.obs IS NOT NULL
  AND l.obs ILIKE '%NF ' || n.numero_nf || '%'
  AND n.numero_nf IS NOT NULL
  AND n.numero_nf != '';

-- Resultado esperado: lançamentos de "baixa automática escritório" vinculados
-- Lançamentos de distribuição de estoque permanecerão NULL até próxima distribuição
