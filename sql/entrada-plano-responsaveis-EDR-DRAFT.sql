-- Configuração exclusiva da EDR, separada da migração estrutural.
-- Não cria usuários, não muda papéis, não cria plano/parcela/recebimento.
-- Auth UIDs conferidos na retomada; revalidação ocorre na mesma transação.
begin;
do $$
declare
  empresa constant uuid := '3d040713-320f-4639-8a0e-35f62ef10ba7';
  elyda constant uuid := 'c671c3ac-59a6-40d8-90f4-1c1c6a41d6c5';
  duam constant uuid := 'c9718eb3-bcd3-434c-b43b-c1ea2613cc7d';
  atual public.entrada_plano_responsaveis%rowtype;
begin
  if current_user <> 'postgres' then
    raise exception 'Configuração exige o owner autorizado' using errcode='42501';
  end if;
  perform 1 from public.company_users
    where company_id=empresa and user_id in (elyda,duam) for share;
  if (select count(*) from public.company_users
      where company_id=empresa and user_id in (elyda,duam)) <> 2
     or not exists(select 1 from public.company_users where company_id=empresa
       and user_id=elyda and active is true and role='admin')
     or not exists(select 1 from public.company_users where company_id=empresa
       and user_id=duam and active is true and role='admin')
     or (select count(*) from auth.users where id in (elyda,duam)) <> 2 then
    raise exception 'Identidades ou vínculos atuais divergem da configuração revisada';
  end if;
  select * into atual from public.entrada_plano_responsaveis
    where company_id=empresa for update;
  if found then
    if atual.solicitante_id is distinct from elyda or atual.aprovador_id is distinct from duam then
      raise exception 'Configuração existente divergente; não substituir responsáveis';
    end if;
  else
    insert into public.entrada_plano_responsaveis(company_id,solicitante_id,aprovador_id)
      values(empresa,elyda,duam);
  end if;
end $$;
select company_id,solicitante_id,aprovador_id,configurado_em
from public.entrada_plano_responsaveis
where company_id='3d040713-320f-4639-8a0e-35f62ef10ba7';
commit;
