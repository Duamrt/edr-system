-- Soft delete para quinzenas — nunca mais perde dados
ALTER TABLE diarias_quinzenas ADD COLUMN IF NOT EXISTS excluida boolean DEFAULT false;
ALTER TABLE diarias_quinzenas ADD COLUMN IF NOT EXISTS excluida_em timestamptz;
