-- =========================================================
-- EDR System — PCI Sub-Serviços (CAIXA/MCMV)
-- Executar UMA VEZ no Supabase SQL Editor
-- =========================================================

-- 1. Tabelas de template (compartilhadas, sem company_id)
-- =========================================================

CREATE TABLE IF NOT EXISTS pci_categorias_template (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  ordem integer NOT NULL,
  nome text NOT NULL,
  peso_percentual numeric(6,2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS pci_sub_servicos_template (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  categoria_id uuid NOT NULL REFERENCES pci_categorias_template(id) ON DELETE CASCADE,
  descricao text NOT NULL,
  ordem integer NOT NULL DEFAULT 0
);

-- 2. Tabela de medição por obra
-- =========================================================

CREATE TABLE IF NOT EXISTS pci_medicao (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  obra_id uuid NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  data_contratacao date,
  data_inicio_obra date,
  data_termino_previsto date,
  data_levantamento date,
  houve_repactuacao boolean DEFAULT false,
  cobertura_peso numeric(6,2) DEFAULT NULL,
  company_id uuid NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- 3. Tabela de itens gerados por medição
-- =========================================================

CREATE TABLE IF NOT EXISTS pci_itens (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  medicao_id uuid NOT NULL REFERENCES pci_medicao(id) ON DELETE CASCADE,
  categoria_nome text NOT NULL,
  categoria_peso numeric(6,2) NOT NULL DEFAULT 0,
  sub_servico_descricao text NOT NULL,
  executado boolean DEFAULT false,
  nao_aplicavel boolean DEFAULT false,
  manual boolean DEFAULT false,
  company_id uuid NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- 4. Índices
-- =========================================================

CREATE INDEX IF NOT EXISTS pci_medicao_obra_idx ON pci_medicao(obra_id);
CREATE INDEX IF NOT EXISTS pci_itens_medicao_idx ON pci_itens(medicao_id);
CREATE INDEX IF NOT EXISTS pci_itens_cat_idx ON pci_itens(categoria_nome);

-- 5. RLS
-- =========================================================

ALTER TABLE pci_categorias_template ENABLE ROW LEVEL SECURITY;
ALTER TABLE pci_sub_servicos_template ENABLE ROW LEVEL SECURITY;
ALTER TABLE pci_medicao ENABLE ROW LEVEL SECURITY;
ALTER TABLE pci_itens ENABLE ROW LEVEL SECURITY;

-- Templates: leitura para autenticados
DROP POLICY IF EXISTS "pci_cat_template_select" ON pci_categorias_template;
CREATE POLICY "pci_cat_template_select" ON pci_categorias_template
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "pci_sub_template_select" ON pci_sub_servicos_template;
CREATE POLICY "pci_sub_template_select" ON pci_sub_servicos_template
  FOR SELECT TO authenticated USING (true);

-- Medições: filtro por empresa
DROP POLICY IF EXISTS "pci_medicao_all" ON pci_medicao;
CREATE POLICY "pci_medicao_all" ON pci_medicao
  FOR ALL TO authenticated
  USING (company_id = get_my_company_id())
  WITH CHECK (company_id = get_my_company_id());

-- Itens: filtro por empresa
DROP POLICY IF EXISTS "pci_itens_all" ON pci_itens;
CREATE POLICY "pci_itens_all" ON pci_itens
  FOR ALL TO authenticated
  USING (company_id = get_my_company_id())
  WITH CHECK (company_id = get_my_company_id());

-- 6. Popular templates CAIXA/MCMV (limpa e reinsere)
-- =========================================================

-- Remove sub-serviços primeiro (FK), depois categorias
DELETE FROM pci_sub_servicos_template;
DELETE FROM pci_categorias_template;

INSERT INTO pci_categorias_template (ordem, nome, peso_percentual) VALUES
(1,  'Servicos Preliminares e Gerais',    2.83),
(2,  'Infraestrutura',                    6.60),
(3,  'Supra Estrutura',                   12.96),
(4,  'Paredes e Paineis',                 9.35),
(5,  'Esquadrias',                        8.01),
(6,  'Vidros e Plasticos',                1.20),
(7,  'Coberturas',                        0.00),
(8,  'Impermeabilizacoes',                4.24),
(9,  'Revestimentos Internos',            7.07),
(10, 'Forros',                            2.00),
(11, 'Revestimentos Externos',            4.24),
(12, 'Pintura',                           5.89),
(13, 'Pisos',                             8.72),
(14, 'Acabamentos',                       1.18),
(15, 'Inst. Eletricas e Telefonicas',     3.77),
(16, 'Instalacoes Hidraulicas',           3.77),
(17, 'Inst. Esgoto e Aguas Pluviais',     4.01),
(18, 'Loucas e Metais',                   4.48),
(19, 'Complementos',                      1.13),
(20, 'Outros Servicos',                   8.55);

DO $$
DECLARE
  c1 uuid; c2 uuid; c3 uuid; c4 uuid; c5 uuid; c6 uuid; c7 uuid;
  c8 uuid; c9 uuid; c10 uuid; c11 uuid; c12 uuid; c13 uuid; c14 uuid;
  c15 uuid; c16 uuid; c17 uuid; c18 uuid; c19 uuid;
BEGIN
  SELECT id INTO c1  FROM pci_categorias_template WHERE ordem = 1;
  SELECT id INTO c2  FROM pci_categorias_template WHERE ordem = 2;
  SELECT id INTO c3  FROM pci_categorias_template WHERE ordem = 3;
  SELECT id INTO c4  FROM pci_categorias_template WHERE ordem = 4;
  SELECT id INTO c5  FROM pci_categorias_template WHERE ordem = 5;
  SELECT id INTO c6  FROM pci_categorias_template WHERE ordem = 6;
  SELECT id INTO c7  FROM pci_categorias_template WHERE ordem = 7;
  SELECT id INTO c8  FROM pci_categorias_template WHERE ordem = 8;
  SELECT id INTO c9  FROM pci_categorias_template WHERE ordem = 9;
  SELECT id INTO c10 FROM pci_categorias_template WHERE ordem = 10;
  SELECT id INTO c11 FROM pci_categorias_template WHERE ordem = 11;
  SELECT id INTO c12 FROM pci_categorias_template WHERE ordem = 12;
  SELECT id INTO c13 FROM pci_categorias_template WHERE ordem = 13;
  SELECT id INTO c14 FROM pci_categorias_template WHERE ordem = 14;
  SELECT id INTO c15 FROM pci_categorias_template WHERE ordem = 15;
  SELECT id INTO c16 FROM pci_categorias_template WHERE ordem = 16;
  SELECT id INTO c17 FROM pci_categorias_template WHERE ordem = 17;
  SELECT id INTO c18 FROM pci_categorias_template WHERE ordem = 18;
  SELECT id INTO c19 FROM pci_categorias_template WHERE ordem = 19;
  -- c20 (Outros Servicos) sem sub-servicos pre-definidos

  INSERT INTO pci_sub_servicos_template (categoria_id, descricao, ordem) VALUES
  -- 1. Servicos Preliminares e Gerais
  (c1, 'Limpeza do terreno', 1),
  (c1, 'Locacao da obra', 2),
  (c1, 'Ligacoes provisorias (agua/energia)', 3),
  (c1, 'Tapume', 4),
  -- 2. Infraestrutura
  (c2, 'Escavacao e aterro', 1),
  (c2, 'Formas e armacao de fundacao', 2),
  (c2, 'Concretagem de fundacao', 3),
  (c2, 'Impermeabilizacao de fundacao', 4),
  -- 3. Supra Estrutura
  (c3, 'Pilares (forma, armacao, concretagem)', 1),
  (c3, 'Vigas (forma, armacao, concretagem)', 2),
  (c3, 'Laje (forma, armacao, concretagem)', 3),
  -- 4. Paredes e Paineis
  (c4, 'Marcacao de paredes', 1),
  (c4, 'Elevacao de alvenaria', 2),
  (c4, 'Vergas e contravergas', 3),
  (c4, 'Cinta de amarracao', 4),
  -- 5. Esquadrias
  (c5, 'Instalacao de portas internas', 1),
  (c5, 'Instalacao de janelas', 2),
  (c5, 'Porta principal', 3),
  (c5, 'Grades e protecoes', 4),
  -- 6. Vidros e Plasticos
  (c6, 'Instalacao de vidros', 1),
  (c6, 'Instalacao de PVC (rodapes, peitoris)', 2),
  -- 7. Coberturas
  (c7, 'Estrutura do telhado', 1),
  (c7, 'Instalacao de telhas', 2),
  (c7, 'Cumeeira e arremates', 3),
  (c7, 'Calhas e rufos', 4),
  -- 8. Impermeabilizacoes
  (c8, 'Impermeabilizacao de fundacoes', 1),
  (c8, 'Impermeabilizacao de laje', 2),
  (c8, 'Impermeabilizacao de areas molhadas', 3),
  -- 9. Revestimentos Internos
  (c9, 'Chapisco interno', 1),
  (c9, 'Emboco e reboco interno', 2),
  (c9, 'Azulejo e ceramica em areas molhadas', 3),
  -- 10. Forros
  (c10, 'Instalacao de forro', 1),
  (c10, 'Arremates de forro', 2),
  -- 11. Revestimentos Externos
  (c11, 'Chapisco externo', 1),
  (c11, 'Emboco e reboco externo', 2),
  (c11, 'Tratamento de fachada', 3),
  -- 12. Pintura
  (c12, 'Selador e massa corrida interna', 1),
  (c12, 'Pintura interna', 2),
  (c12, 'Pintura externa', 3),
  (c12, 'Pintura de esquadrias', 4),
  -- 13. Pisos
  (c13, 'Contrapiso', 1),
  (c13, 'Ceramica e porcelanato interno', 2),
  (c13, 'Calcada e area externa', 3),
  (c13, 'Soleiras e peitoris', 4),
  -- 14. Acabamentos
  (c14, 'Rodapes', 1),
  (c14, 'Pingadeiras', 2),
  (c14, 'Arremates gerais', 3),
  -- 15. Inst. Eletricas e Telefonicas
  (c15, 'Eletrodutos e fiacao', 1),
  (c15, 'Quadro de distribuicao', 2),
  (c15, 'Tomadas e interruptores', 3),
  (c15, 'Iluminacao', 4),
  -- 16. Instalacoes Hidraulicas
  (c16, 'Tubulacao de agua fria', 1),
  (c16, 'Caixa d''agua', 2),
  (c16, 'Pontos de agua (pias, chuveiro, vaso)', 3),
  -- 17. Inst. Esgoto e Aguas Pluviais
  (c17, 'Tubulacao de esgoto', 1),
  (c17, 'Caixa de inspecao', 2),
  (c17, 'Fossa e filtro', 3),
  (c17, 'Captacao de aguas pluviais', 4),
  -- 18. Loucas e Metais
  (c18, 'Vaso sanitario', 1),
  (c18, 'Pia de cozinha', 2),
  (c18, 'Lavatorio', 3),
  (c18, 'Tanque', 4),
  (c18, 'Torneiras e registros', 5),
  (c18, 'Chuveiro', 6),
  -- 19. Complementos
  (c19, 'Limpeza final da obra', 1),
  (c19, 'Espelhos e acabamentos eletricos', 2),
  (c19, 'Caixas de passagem', 3);
  -- 20. Outros Servicos: sem sub-servicos pre-definidos (usuario adiciona manualmente)
END $$;
