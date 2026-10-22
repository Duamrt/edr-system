'use strict';
// Dados exclusivamente sinteticos, PostgreSQL embarcado. Nao acessa rede/contas reais.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {randomUUID:id}=require('node:crypto');
const {PGlite}=require(process.env.EDR_PGLITE_PATH);
const read=f=>fs.readFileSync(path.join(__dirname,f),'utf8');
const base=read('../sql/caixa-prospectivo-DRAFT.sql'),upgrade=read('../sql/caixa-pagamento-sem-abertura-DRAFT.sql');
async function setup(t){
  const db=new PGlite();t.after(()=>db.close());
  await db.exec(read('fixtures/caixa-prospectivo-base.sql'));await db.exec(base);await db.exec(upgrade);
  const company=id(),other=id(),admin=id(),foreign=id(),reader=id(),inactive=id();
  await db.query('insert into companies(id) values($1),($2)',[company,other]);
  await db.query("insert into company_users(user_id,company_id,role,active) values($1,$2,'admin',true),($3,$4,'admin',true),($5,$2,'leitura',true),($6,$2,'admin',false)",[admin,company,foreign,other,reader,inactive]);
  const session=async user=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user||'']);await db.exec('set role authenticated');};
  const owner=async(sql,args=[])=>{await db.exec('reset role');try{return await db.query(sql,args);}finally{await db.exec('set role authenticated');}};
  const invoice=async(value=100,tenant=company)=>{const cp=id();await owner("insert into contas_pagar(id,company_id,valor,status,tipo,descricao,data_vencimento) values($1,$2,$3,'pendente','despesa','QA ficticio','2001-06-05')",[cp,tenant,value]);return cp;};
  await session(admin);
  const send=async(p,op=id())=>(await db.query('select caixa_registrar($1,$2::jsonb) r',[op,JSON.stringify(p)])).rows[0].r;
  const state=async()=>(await db.query('select caixa_estado() r')).rows[0].r;
  const opening=()=>({action:'abertura',corte_local:'2001-06-05T12:00',fuso:'America/Sao_Paulo',contas:[{codigo:'banco',nome:'Banco QA',saldo_centavos:100000},{codigo:'dinheiro',nome:'Dinheiro QA',saldo_centavos:10000}]});
  const payment=(cp,x={})=>({action:'movimento',tipo:'pagamento',conta_id:null,origem_codigo:'banco',conta_pagar_id:cp,valor_centavos:10000,data_efetiva:'2001-06-05',hora_efetiva:null,decisao_corte:null,descricao:'Comprovante ficticio',pagamento_confirmado:true,...x});
  const cancel=(m,op)=>send({action:'cancelar',movimento_id:m.movimento_id,motivo:'Correcao ficticia'},op);
  const reconcile=(m,decision,op)=>send({action:'conciliar',movimento_id:m.movimento_id,decisao_corte:decision},op);
  const status=async cp=>(await owner('select status,valor::float8,data_pagamento from contas_pagar where id=$1',[cp])).rows[0];
  return {db,company,other,admin,foreign,reader,inactive,session,owner,invoice,send,state,opening,payment,cancel,reconcile,status};
}
test('sem abertura: quita sem saldo inventado; reenvio, payload divergente e estorno auditados',async t=>{
  const a=await setup(t),cp=await a.invoice(),p=a.payment(cp),op=id();
  const m=await a.send(p,op);assert.deepEqual(await a.send(p,op),m);
  await assert.rejects(a.send({...p,valor_centavos:9999},op),/dados diferentes/);
  let s=await a.state();assert.deepEqual(s.contas,[]);assert.equal(s.movimentos.length,1);
  assert.equal(s.movimentos[0].conta_id,null);assert.equal(s.movimentos[0].decisao_corte,'pendente');assert.equal(s.movimentos[0].afeta_saldo,false);
  assert.equal((await a.status(cp)).status,'pago');assert.equal(s.pagamentos[0].restante_centavos,0);
  await assert.rejects(a.send(p),/excede/);
  const co=id(),r=await a.cancel(m,co);assert.deepEqual(await a.cancel(m,co),r);assert.equal((await a.status(cp)).status,'pendente');
  assert.ok((await a.state()).movimentos[0].cancelado_em);
  const audit=await a.owner('select pedido,usuario_id,resultado from caixa_operacoes order by criado_em');assert.equal(audit.rows.length,2);assert.ok(audit.rows.every(x=>x.usuario_id===a.admin));
});
test('origem, data, confirmacao, perfil e empresa sao validados no servidor; sem escrita direta',async t=>{
  const a=await setup(t),cp=await a.invoice(),p=a.payment(cp);
  for(const [extra,re] of [[{origem_codigo:null},/origem/],[{origem_codigo:'terceiro'},/origem/],[{conta_id:id()},/origem/],[{data_efetiva:'2099-01-01'},/futuro/],[{data_efetiva:'2001-02-30'},/date|range/],[{hora_efetiva:'25:00'},/Hora/],[{data_efetiva:''},/Data/],[{pagamento_confirmado:false},/Confirme/],[{decisao_corte:'incluido_abertura'},/pendente/],[{company_id:a.other},/invalido/]])await assert.rejects(a.send({...p,...extra}),re);
  const fc=await a.invoice(100,a.other);await assert.rejects(a.send(a.payment(fc)),/indisponivel/);
  for(const user of [a.reader,a.inactive,a.foreign,null]){await a.session(user);await assert.rejects(a.send(p),/administrador|indisponivel|Sessao/);}
  await a.session(a.admin);await assert.rejects(a.db.query('update caixa_movimentos set afeta_saldo=true'),/permission denied/);
  assert.equal((await a.state()).movimentos.length,0);
});
test('parcial, desconto e juros preservam original e quitam apenas o principal abatido',async t=>{
  const a=await setup(t),cp=await a.invoice();
  const first=await a.send(a.payment(cp,{valor_centavos:4000,desconto_centavos:500,juros_centavos:200}));
  let s=await a.state();assert.equal(s.pagamentos[0].pago_centavos,4000);assert.equal(s.pagamentos[0].quitado_centavos,4300);assert.equal(s.pagamentos[0].restante_centavos,5700);assert.equal((await a.status(cp)).status,'pendente');
  await assert.rejects(a.send(a.payment(cp,{valor_centavos:5701})),/excede/);
  for(const extra of [{desconto_centavos:-1},{juros_centavos:10000},{desconto_centavos:'0.5'},{desconto_centavos:9007199254740991}])await assert.rejects(a.send(a.payment(cp,extra)));
  const final=await a.send(a.payment(cp,{valor_centavos:6000,juros_centavos:300}));
  assert.equal((await a.status(cp)).status,'pago');assert.equal((await a.status(cp)).valor,100);
  await a.cancel(final);assert.equal((await a.state()).pagamentos[0].restante_centavos,5700);
  await a.cancel(first);assert.equal((await a.state()).pagamentos[0].restante_centavos,10000);
});
test('abertura preserva pendencias; inclusao e posterior sao confirmados, idempotentes e reversiveis',async t=>{
  const a=await setup(t),cp=await a.invoice(),cp2=await a.invoice();
  const before=await a.send(a.payment(cp,{data_efetiva:'2001-06-04'})),after=await a.send(a.payment(cp2,{data_efetiva:'2001-06-06'}));
  await assert.rejects(a.reconcile(before,'incluido_abertura'),/abertura/);
  await a.send(a.opening());let s=await a.state();assert.equal(s.total_centavos,110000);assert.ok(s.movimentos.every(m=>m.decisao_corte==='pendente'));
  await assert.rejects(a.reconcile(before,'apos_corte'),/contradiz/);await assert.rejects(a.reconcile(after,'incluido_abertura'),/contradiz/);await assert.rejects(a.reconcile(after,null),/Confirme/);
  const op=id(),r=await a.reconcile(before,'incluido_abertura',op);assert.deepEqual(await a.reconcile(before,'incluido_abertura',op),r);assert.equal((await a.state()).total_centavos,110000);
  await assert.rejects(a.reconcile(before,'incluido_abertura'),/indisponivel/);
  await a.reconcile(after,'apos_corte');s=await a.state();assert.equal(s.total_centavos,100000);assert.ok(s.movimentos.every(m=>m.conciliado_por===a.admin));
  await a.cancel(after);assert.equal((await a.state()).total_centavos,110000);await a.cancel(before);assert.equal((await a.state()).total_centavos,110000);
});
test('com abertura: origem valida, corte conhecido e mesmo dia sem horario fica pendente',async t=>{
  const a=await setup(t);await a.send(a.opening());const ct=(await a.state()).contas.find(x=>x.codigo==='banco');
  const cp=await a.invoice(),p=a.payment(cp,{conta_id:ct.id});const m=await a.send(p);
  assert.equal((await a.state()).movimentos[0].decisao_corte,'pendente');assert.equal((await a.state()).total_centavos,110000);
  await a.reconcile(m,'apos_corte');assert.equal((await a.state()).total_centavos,100000);
  const cp2=await a.invoice();await assert.rejects(a.send(a.payment(cp2,{conta_id:ct.id,origem_codigo:'dinheiro'})),/diverge/);
  await a.send(a.payment(cp2,{conta_id:ct.id,data_efetiva:'2001-06-06',valor_centavos:10500,juros_centavos:500}));assert.equal((await a.state()).total_centavos,89500);
  assert.equal((await a.status(cp2)).valor,100);
});
test('conciliacao isolada por tenant e falha no recibo reverte pagamento inteiro',async t=>{
  const a=await setup(t),cp=await a.invoice(),p=a.payment(cp),op=id();
  await a.owner("create function falhar_qa() returns trigger language plpgsql as $$ begin raise exception 'FALHA QA'; end $$;");
  await a.owner('create trigger falha_qa before insert on caixa_operacoes for each row execute function falhar_qa();');
  await assert.rejects(a.send(p,op),/FALHA QA/);assert.equal((await a.status(cp)).status,'pendente');assert.equal((await a.state()).movimentos.length,0);
  await a.owner('drop trigger falha_qa on caixa_operacoes');const m=await a.send(p,op);await a.send(a.opening());
  await a.session(a.foreign);await assert.rejects(a.reconcile(m,'apos_corte'),/indisponivel/);await assert.rejects(a.cancel(m),/indisponivel/);
  await a.session(a.admin);const sentinels=(await a.owner('select (select sum(total) from lancamentos)::float8 custo,(select status from diarias_quinzenas limit 1) folha,(select sum(qtd) from distribuicoes)::int estoque')).rows[0];assert.deepEqual(sentinels,{custo:91.23,folha:'fechada',estoque:7});
});
test('juros altos nao permitem soma monetaria fora da faixa exata do frontend',async t=>{
  const a=await setup(t),cp=await a.invoice();
  const p=a.payment(cp,{valor_centavos:9007199254740891,juros_centavos:9007199254740691});
  await a.send(p);await assert.rejects(a.send(p),/faixa segura/);
  assert.equal((await a.state()).movimentos.length,1);assert.equal((await a.state()).pagamentos[0].restante_centavos,9800);
});
test('migracao recusa versao de funcao divergente sem alterar estrutura',async t=>{
  const db=new PGlite();t.after(()=>db.close());await db.exec(read('fixtures/caixa-prospectivo-base.sql'));await db.exec(base);
  await db.exec("create or replace function caixa_estado() returns jsonb language sql as $$select '{}'::jsonb$$;");
  await assert.rejects(db.exec(upgrade),/Versao base.*divergente/);await db.exec('rollback;');
  assert.equal((await db.query("select count(*)::int n from information_schema.columns where table_name='caixa_movimentos' and column_name='origem_codigo'")).rows[0].n,0);
});
