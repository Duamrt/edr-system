-- Catálogo EDR Engenharia: padronização visual de unidade e limpeza de texto.
-- Não altera código, categoria, tipo, saldo nem histórico.

begin;

update public.materiais
set unidade = 'UN'
where company_id = '3d040713-320f-4639-8a0e-35f62ef10ba7'
  and codigo in ('000524', '000525', '000526', '000527')
  and unidade = 'un';

update public.materiais
set unidade = 'KG'
where company_id = '3d040713-320f-4639-8a0e-35f62ef10ba7'
  and codigo in ('000503', '000515')
  and unidade = 'kg';

update public.materiais
set unidade = 'M2'
where company_id = '3d040713-320f-4639-8a0e-35f62ef10ba7'
  and codigo in ('000441', '000446', '000447', '000448', '000449', '000450', '000606')
  and unidade in ('m²', 'm2');

update public.materiais
set nome = 'CAFE 250G'
where company_id = '3d040713-320f-4639-8a0e-35f62ef10ba7'
  and codigo = '000055'
  and nome = 'CAFE  250G';

update public.materiais
set nome = 'RALO SIFONADO 100X50'
where company_id = '3d040713-320f-4639-8a0e-35f62ef10ba7'
  and codigo = '000527'
  and nome = E'RALO\r\n  SIFONADO 100X50';

commit;
