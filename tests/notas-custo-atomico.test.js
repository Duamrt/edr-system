const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {ambiente}=require('./fixtures/fluxo-estoque.cjs');
if(!process.env.EDR_PGLITE_PATH){test('NF atomica SQL',{skip:'Defina EDR_PGLITE_PATH; banco nao testado'},()=>{});}
else {
 const {PGlite}=require(process.env.EDR_PGLITE_PATH);
 const id=n=>'10000000-0000-4000-8000-'+String(n).padStart(12,'0');
 const empresa=id(1),outra=id(2),usuario=id(3),leitor=id(4),obra=id(5);
 async function preparar(t){
  const db=new PGlite();t.after(()=>db.close());
  await db.exec(fs.readFileSync(require.resolve('./fixtures/estoque-transacao-base.sql'),'utf8'));
  await db.exec(`create table contas_pagar(id uuid primary key default gen_random_uuid(),company_id uuid not null,fornecedor text,descricao text,valor numeric not null,data_vencimento date,status text,data_pagamento date,tipo text,nota_id uuid references notas_fiscais(id),nota_ref text)`);
  // Reproduz os privilegios padrao do projeto Supabase, inclusive TRUNCATE.
  await db.exec('alter default privileges in schema public grant all on tables to anon, authenticated');
  await db.exec(require('./fixtures/custo-nota.cjs').sql);
  await db.query('insert into companies values($1),($2)',[empresa,outra]);
  await db.query("insert into company_users values($1,$2,'admin'),($3,$2,'leitura')",[usuario,empresa,leitor]);
  await db.query("insert into obras(id,company_id,nome) values($1,$2,'OBRA')",[obra,empresa]);
  await db.query("insert into materiais(company_id,codigo,nome,categoria) values($1,'000001','MATERIAL','04_alven')",[empresa]);
  for(const tabela of ['notas_fiscais','lancamentos','distribuicoes','contas_pagar']) await db.exec(`alter table ${tabela} enable row level security; create policy tenant on ${tabela} to authenticated using(company_id=auth_company_id()) with check(company_id=auth_company_id() and auth_user_role() in ('admin','operacional')); grant select,insert,update,delete on ${tabela} to authenticated;`);
  await db.exec('grant usage on schema auth to authenticated; grant select on obras,materiais to authenticated;');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[usuario]);await db.exec('set role authenticated');
  const a=ambiente();a.ctx._companyId=empresa;a.ctx.usuarioAtual.id=usuario;a.ctx.obras=[{id:obra,nome:'OBRA'}];
  const pedidos=[];let perder=false;
  async function enviar(params){return (await db.query('select registrar_nota_fiscal_atomica($1,$2,$3,$4) r',[params.p_operacao_id,params.p_nota,params.p_classificacoes,params.p_custo])).rows[0].r;}
  a.ctx.sbRpcEstoque=async(fn,params)=>{assert.equal(fn,'registrar_nota_fiscal_atomica');pedidos.push(params);try{const r=await enviar(params);if(perder){perder=false;return {ok:false,incerto:true,mensagem:'Resposta perdida'};}return {ok:true,dados:r};}catch(e){return {ok:false,incerto:false,mensagem:e.message}}};
  async function totais(){return (await db.query('select (select count(*)::int from notas_fiscais) nf,(select count(*)::int from lancamentos) lc,(select count(*)::int from distribuicoes) dist,(select count(*)::int from contas_pagar) contas,(select count(*)::int from notas_operacoes) recibos')).rows[0];}
  return {...a,db,pedidos,enviar,totais,perderResposta(){perder=true}};
 }
 test('recibos revogam privilegios herdados e bloqueiam TRUNCATE',async t=>{
  const a=await preparar(t);
  const r=(await a.db.query("select has_table_privilege('anon','notas_operacoes','SELECT') anon_le, has_table_privilege('anon','notas_operacoes','TRUNCATE') anon_trunca, has_table_privilege('authenticated','notas_operacoes','TRUNCATE') auth_trunca, has_table_privilege('authenticated','notas_operacoes','INSERT') auth_insere")).rows[0];
  assert.deepEqual(r,{anon_le:false,anon_trunca:false,auth_trunca:false,auth_insere:true});
  await assert.rejects(a.db.exec('truncate notas_operacoes'),/permission denied/);
  await a.db.exec('reset role; set role anon');
  await assert.rejects(a.db.exec('truncate notas_operacoes'),/permission denied/);
 });
 test('NF direta: desconto reduz custo; frete e despesas fecham o total',async t=>{
  const a=await preparar(t);assert.equal(await a.salvarNF({destino:'OBRA',desconto:40,frete:40,outras:10}),true,JSON.stringify(a.avisos));
  const r=(await a.db.query('select sum(total)::float8 total from lancamentos')).rows[0];assert.equal(r.total,410);
  assert.equal((await a.db.query('select valor::float8 from distribuicoes')).rows[0].valor,360);
  assert.equal(JSON.parse(a.ctx.notas[0].itens)[0].total,400);assert.equal(a.ctx.notas[0].desconto_total,40);
  assert.deepEqual(await a.totais(),{nf:1,lc:3,dist:1,contas:0,recibos:1});
 });
 test('NF almoxarifado -> baixa FIFO usa desconto e acessorios',async t=>{
  const a=await preparar(t);assert.equal(await a.salvarNF({desconto:40,frete:40,outras:10}),true,JSON.stringify(a.avisos));
  a.ctx.obras.push({id:'obra',nome:'DESTINO DO ENSAIO'});await a.saida('manual');assert.equal(a.custo(),123);assert.equal(a.saldo(),7);
 });
 test('falha real de SQL na distribuicao reverte NF e custo inteiro',async t=>{
  const a=await preparar(t);await a.db.exec("reset role; create function falhar() returns trigger language plpgsql as $$begin raise exception 'falha injetada'; end$$; create trigger falhar before insert on distribuicoes for each row execute function falhar(); set role authenticated;");
  assert.equal(await a.salvarNF({destino:'OBRA'}),false);assert.deepEqual(await a.totais(),{nf:0,lc:0,dist:0,contas:0,recibos:0});
  assert.equal(a.ctx.notas.length,0);assert.ok(a.avisos.some(x=>x.includes('falha injetada')));assert.ok(!a.avisos.includes('Nota fiscal lancada!'));
 });
 test('resposta perdida e reimportacao recuperam mesmo pedido sem duplicar',async t=>{
  const a=await preparar(t);a.perderResposta();assert.equal(await a.salvarNF({destino:'OBRA'}),false);
  assert.equal(a.ctx.localStorage.dados.size,1);assert.equal(await a.salvarNF({destino:'OBRA'}),true,JSON.stringify(a.avisos));
  assert.equal(a.pedidos[0].p_operacao_id,a.pedidos[1].p_operacao_id);assert.deepEqual(await a.totais(),{nf:1,lc:1,dist:1,contas:0,recibos:1});assert.equal(a.ctx.localStorage.dados.size,0);
 });
 test('duplo clique da NF faz uma unica solicitacao',async t=>{
  const a=await preparar(t);const r=await Promise.all([a.salvarNF({destino:'OBRA'}),a.salvarNF({destino:'OBRA'})]);
  assert.equal(r.filter(Boolean).length,1,JSON.stringify(a.avisos));assert.equal(a.pedidos.length,1);assert.equal((await a.totais()).nf,1);
 });
 test('despesa operacional usa desconto, sem baixa e sem custo duplicado',async t=>{
  const a=await preparar(t);a.ctx.catalogoMateriais[0].categoria='14_expediente';assert.equal(await a.salvarNF({desconto:40}),true,JSON.stringify(a.avisos));
  assert.deepEqual(await a.totais(),{nf:1,lc:0,dist:0,contas:1,recibos:1});assert.equal((await a.db.query('select valor::float8 from contas_pagar')).rows[0].valor,360);
 });
 test('servico para obra grava custo sem distribuicao',async t=>{
  const a=await preparar(t);await a.db.exec("reset role; update materiais set movimenta_estoque=false; set role authenticated");
  a.ctx.catalogoMateriais[0].movimenta_estoque=false;assert.equal(await a.salvarNF({destino:'OBRA'}),true,JSON.stringify(a.avisos));assert.deepEqual(await a.totais(),{nf:1,lc:1,dist:0,contas:0,recibos:1});
 });
 test('obra de outra empresa e perfil leitura nao gravam NF',async t=>{
  const a=await preparar(t);await a.db.exec('reset role');await a.db.query('update obras set company_id=$1',[outra]);await a.db.exec('set role authenticated');
  assert.equal(await a.salvarNF({destino:'OBRA'}),false);assert.equal((await a.totais()).nf,0);
  await a.db.query("select set_config('request.jwt.claim.sub',$1,false)",[leitor]);assert.equal(await a.salvarNF(),false);assert.equal((await a.totais()).nf,0);
  await assert.rejects(a.db.query("insert into notas_operacoes(id,company_id,usuario_id,pedido,resultado) values($1,$2,$3,'{}','{}')",[id(10),empresa,leitor]),/row-level security/);
 });
 test('recibo rejeita payload alterado e nao recria NF excluida',async t=>{
  const a=await preparar(t);assert.equal(await a.salvarNF(),true,JSON.stringify(a.avisos));const p=a.pedidos[0];
  await assert.rejects(a.enviar({...p,p_nota:{...p.p_nota,obs:'ALTERADA'}}),/dados diferentes/);
  await a.db.query('delete from notas_fiscais where id=$1',[p.p_operacao_id]);assert.equal((await a.enviar(p)).status,'excluida');assert.equal((await a.totais()).nf,0);
 });
 test('banco usa quantidade convertida devolvida pelo trigger',async t=>{
  const a=await preparar(t);await a.db.exec("reset role; create function converter() returns trigger language plpgsql as $$begin new.itens:=jsonb_set(new.itens::jsonb,'{0,qtd_estoque}','20')::text; return new; end$$; create trigger converter before insert on notas_fiscais for each row execute function converter(); set role authenticated;");
  assert.equal(await a.salvarNF({destino:'OBRA'}),true,JSON.stringify(a.avisos));const lc=(await a.db.query('select qtd::float8,preco::float8,total::float8 from lancamentos')).rows[0];assert.deepEqual(lc,{qtd:20,preco:20,total:400});
 });
 test('rateio JS e SQL coincide em centavos, conversao e legado liquido',async t=>{
  const a=await preparar(t);const casos=[
   {itens:[{qtd:10,total:400}],desconto_total:40,frete:40,outras_despesas:10,valor_bruto:410},
   {itens:[{qtd:1,total:1},{qtd:1,total:1},{qtd:1,total:1}],desconto_total:0.01,frete:0.02,valor_bruto:3.01},
   {itens:[{qtd:1,total:100,desconto_fiscal:20},{qtd:1,total:100}],desconto_total:20,valor_bruto:180},
   {itens:[{qtd_estoque:20,qtd:10,total:360}],desconto_total:40,valor_bruto:360},
   {itens:[{qtd:1,total:0},{qtd:2,total:0}],frete:0.03,valor_bruto:0.03}
  ];
  for(const n of casos){n.itens=JSON.stringify(n.itens);const sql=(await a.db.query('select custos_itens_nota($1) r',[n])).rows[0].r;assert.deepEqual(sql,JSON.parse(JSON.stringify(a.ctx.custosItensNota(n))));}
 });
 test('funcao invoker respeita negacao de policy da distribuicao',async t=>{
  const a=await preparar(t);await a.db.exec("reset role; drop policy tenant on distribuicoes; create policy negar on distribuicoes to authenticated using(false) with check(false); set role authenticated");
  assert.equal(await a.salvarNF({destino:'OBRA'}),false);assert.deepEqual(await a.totais(),{nf:0,lc:0,dist:0,contas:0,recibos:0});
 });
 test('reversao do candidato conserva recibos apos uso',async t=>{
  const a=await preparar(t);assert.equal(await a.salvarNF(),true);await a.db.exec('reset role');
  const rollback=fs.readFileSync(require.resolve('../sql/notas-custo-atomico-rollback-DRAFT.sql'),'utf8');
  await assert.rejects(a.db.exec(rollback),/preservar recibos/);await a.db.exec('rollback');assert.equal((await a.totais()).recibos,1);
 });
 test('reversao antes do uso remove apenas o candidato novo',async t=>{
  const a=await preparar(t);await a.db.exec('reset role');
  await a.db.exec(fs.readFileSync(require.resolve('../sql/notas-custo-atomico-rollback-DRAFT.sql'),'utf8'));
  const r=(await a.db.query("select to_regclass('public.notas_operacoes') recibos,to_regclass('public.notas_fiscais') notas")).rows[0];assert.equal(r.recibos,null);assert.equal(r.notas,'notas_fiscais');
 });
}
