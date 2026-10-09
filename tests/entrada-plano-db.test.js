'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {randomUUID}=require('node:crypto');
if(!process.env.EDR_PGLITE_PATH){test('plano entrada SQL',{skip:'Defina EDR_PGLITE_PATH; banco SQL nao executado.'},()=>{});}
else{
 const {PGlite}=require(process.env.EDR_PGLITE_PATH);
 const read=f=>fs.readFileSync(path.join(__dirname,f),'utf8');
 const fixture=read('fixtures/caixa-prospectivo-base.sql')+'\n'+read('fixtures/entrada-plano-base.sql');
 const originalMigration=read('../sql/caixa-prospectivo-DRAFT.sql')+'\n'+read('../sql/entrada-plano-DRAFT.sql');
 const replayPatch=read('../sql/entrada-plano-revalidar-replay.sql');
 const migration=originalMigration+'\n'+replayPatch;
 const rollback=read('../sql/entrada-plano-rollback-DRAFT.sql');
 const ids=Array.from({length:10},()=>randomUUID());
 const [company,other,elyda,duam,third,operational,reader,otherAdmin,obra,otherObra]=ids;
 async function ambiente(t,{base=10000,configured=true,approved=true,mode='percent',rate=1500,final=10000,delivery='2002-01-01',existing=false,patched=true}={}){
  const db=new PGlite();t.after(()=>db.close());await db.exec(fixture);await db.exec(patched?migration:originalMigration);
  await db.query('insert into companies(id) values($1),($2)',[company,other]);
  await db.query("insert into company_users(user_id,company_id,role) values($1,$2,'admin'),($3,$2,'admin'),($4,$2,'admin'),($5,$2,'operacional'),($6,$2,'leitura'),($7,$8,'admin')",[elyda,company,duam,third,operational,reader,otherAdmin,other]);
  await db.query('insert into obras(id,company_id,contrato_entrada,nome,data_entrega) values($1,$2,$3,$4,null),($5,$6,100,$7,null)',[obra,company,base/100,'Obra sintética',otherObra,other,'Outra obra sintética']);
  if(configured)await db.query('insert into entrada_plano_responsaveis(company_id,solicitante_id,aprovador_id) values($1,$2,$3)',[company,elyda,duam]);
  let user=elyda;
  const session=async u=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[u||'']);user=u;await db.exec('set role authenticated')};
  const owner=async(sql,params=[])=>{await db.exec('reset role');try{return await db.query(sql,params);}finally{await db.exec('set role authenticated')}};
  const state=async()=> (await db.query('select entrada_plano_estado($1) r',[obra])).rows[0].r;
  const resumo=async()=> (await db.query('select entrada_plano_resumo() r')).rows[0].r;
  const send=async(p,op=randomUUID(),ob=obra)=> (await db.query('select entrada_plano_operar($1,$2,$3::jsonb) r',[op,ob,JSON.stringify(p)])).rows[0].r;
  const operate=async extra=>send({revisao:(await state()).plano.revisao,motivo:'Operacao sintética QA',...extra});
  await session(duam);
  await db.query('select caixa_registrar($1,$2::jsonb)',[randomUUID(),JSON.stringify({action:'abertura',corte_local:'2001-06-05T18:23',fuso:'America/Sao_Paulo',contas:[{codigo:'banco',nome:'Banco QA',saldo_centavos:100000},{codigo:'dinheiro',nome:'Dinheiro QA',saldo_centavos:0}]})]);
  const bank=(await db.query('select caixa_estado() r')).rows[0].r.contas.find(c=>c.codigo==='banco').id;
  const cash=async()=> (await db.query('select caixa_estado() r')).rows[0].r.total_centavos;
  const row=randomUUID();
  const rows=[{id:row,label:'Parcela sintética',base,mode,rate:mode==='percent'?rate:0,final,due:null,method:'Pix'}];
  const solicitar=(r=rows,d=delivery)=>operate({tipo:'solicitar',rows:r,delivery:d});
  const decide=async(decisao='approved',proposta_id)=>{await session(duam);const s=await state();return operate({tipo:'decidir',proposta_id:proposta_id||s.requests.find(x=>x.status==='pending').id,decisao})};
  const receber=(amount,date='2001-06-06',extra={})=>operate({tipo:'receber',row_id:row,amount,date,method:'Pix',conta_id:bank,hora_efetiva:null,decisao_corte:null,...extra});
  const estorno=async(amount,receipt_id=null,extra={})=>{receipt_id=receipt_id||(await state()).receipts.find(x=>x.amount>0).id;await session(elyda);return operate({tipo:'solicitar_estorno',receipt_id,amount,date:'2001-06-07',conta_id:bank,hora_efetiva:null,decisao_corte:null,...extra})};
  const sentinels=async()=> (await owner("select jsonb_build_object('saldo_manual',(select saldo_manual from companies where id=$1),'custos',(select sum(total) from lancamentos),'folha',(select status from diarias_quinzenas where id=1),'estoque',(select qtd from distribuicoes where id=1),'original',(select contrato_entrada from obras where id=$2)) r",[company,obra])).rows[0].r;
  await session(elyda);
  let repasse=null;
  if(existing){repasse=randomUUID();await owner('insert into repasses_cef(id,company_id,obra_id,tipo,valor,data_credito) values($1,$2,$3,$4,$5,$6)',[repasse,company,obra,'entrada',base/100,'2001-06-04']);}
  if(approved){await solicitar();await decide();}
  return{db,session,owner,state,resumo,send,operate,row,rows,solicitar,decide,receber,estorno,cash,bank,sentinels,repasse,get user(){return user}};
 }
 test('schema vazio não presume identidades, datas ou automação; rollback vazio seguro',async t=>{
  const a=await ambiente(t,{configured:false,approved:false});const s=await a.state();
  assert.equal(s.plano.stage,'none');assert.deepEqual(s.rows,[]);assert.equal(s.plano.delivery,null);
  assert.deepEqual(s.permissions,{solicitar:false,aprovar:false,receber:false});assert.equal(s.reminders.configured,false);
  await assert.rejects(a.solicitar(),/nao configurados/);
  await a.db.exec('reset role');await a.db.exec(rollback);
  assert.equal((await a.db.query("select to_regclass('public.entrada_planos') t")).rows[0].t,null);
  assert.ok((await a.db.query("select to_regprocedure('public.caixa_registrar(uuid,jsonb)') t")).rows[0].t);
  assert.ok((await a.db.query("select tgname from pg_trigger where tgname='audit_repasses_cef'")).rows.length);
 });
 test('proposta pendente não muda original nem projeção; aprovação deixa parcelas e aviso data-3',async t=>{
  const a=await ambiente(t,{approved:false,delivery:null});const before=await a.sentinels();
  const rows=a.rows.map(p=>({...p,due:'2002-03-10'}));const s=await a.solicitar(rows,null);
  assert.equal(s.rows.length,0);assert.equal(s.requests[0].status,'pending');assert.deepEqual((await a.resumo()).planos,[]);
  assert.deepEqual(await a.sentinels(),before);const yes=await a.decide();
  assert.equal(yes.plano.stage,'confirmed');assert.equal(yes.rows[0].due,'2002-03-10');assert.equal(yes.rows[0].aviso_em,'2002-03-07');
  assert.equal(yes.rows[0].total,11500);assert.equal(yes.reminders.configured,false);assert.deepEqual(await a.sentinels(),before);
  assert.deepEqual((await a.resumo()).planos[0],{obra_id:obra,plano_id:obra,revisao:2,original_centavos:10000,total_centavos:11500,cancelado_centavos:0,stage:'confirmed',unlinked_centavos:0,saldo_centavos:11500,pendencia_conciliacao:false,parcelas:[{id:a.row,label:'Parcela sintética',due:'2002-03-10',method:'Pix',remaining:11500,pendencia_conciliacao:false}]});
 });
 test('identidades Auth, active, tenant, ACL e ausência de autoaprovação são conferidos no servidor',async t=>{
  const a=await ambiente(t,{approved:false});
  await a.session(third);assert.deepEqual((await a.state()).permissions,{solicitar:false,aprovar:false,receber:false});
  await assert.rejects(a.solicitar(),/Identidade/);await assert.rejects(a.receber(100),/Identidade/);
  await a.session(elyda);const p=await a.solicitar();
  await assert.rejects(a.operate({tipo:'decidir',proposta_id:p.requests[0].id,decisao:'approved'}),/Identidade/);
  await a.session(operational);assert.equal((await a.state()).permissions.receber,false);
  await assert.rejects(a.receber(100),/Identidade/);assert.deepEqual((await a.state()).contas,[]);
  await a.session(reader);await assert.rejects(a.state(),/sem permissao/);await assert.rejects(a.resumo(),/sem permissao/);
  await a.session(otherAdmin);await assert.rejects(a.state(),/Obra indisponivel/);
  assert.equal((await a.db.query('select count(*)::int n from entrada_planos')).rows[0].n,0);
  await a.session(elyda);await a.owner('update company_users set active=false where user_id=$1',[elyda]);await assert.rejects(a.state(),/sem permissao/);
  await a.owner('update company_users set active=true where user_id=$1',[elyda]);
  for(const sql of ['insert into entrada_plano_responsaveis(company_id,solicitante_id,aprovador_id) values(gen_random_uuid(),gen_random_uuid(),gen_random_uuid())',
    'delete from entrada_planos','update entrada_plano_parcelas set base=1',"select entrada_plano_cotar(gen_random_uuid(),1,current_date)"]){await assert.rejects(a.db.query(sql),/permission denied/)}
  await a.db.exec('reset role;set role anon');await assert.rejects(a.db.query('select entrada_plano_estado($1)',[obra]),/permission denied/);
 });
 test('recebimento parcial comum aloca principal/acréscimo proporcional; entrega exata não cancela',async t=>{
  const a=await ambiente(t,{delivery:'2001-06-06'}),before=await a.sentinels();
  const s=await a.receber(5750),r=s.receipts[0];assert.equal(r.principal,5000);assert.equal(r.additionPaid,750);assert.equal(r.cancelled,0);
  assert.equal(s.rows[0].remaining,5750);assert.equal(await a.cash(),105750);
  await a.receber(5750);const end=await a.state();assert.equal(end.rows[0].remaining,0);assert.equal(end.rows[0].principalPaid,10000);
  assert.equal(end.rows[0].additionPaid,1500);assert.equal(await a.cash(),111500);
  assert.equal((await a.owner('select sum(valor)::float8 v from repasses_cef')).rows[0].v,115);
  assert.deepEqual(await a.sentinels(),before);await assert.rejects(a.receber(1),/excede/);
 });
 test('antecipação proporcional cumulativa conserva centavos; cancelamento nunca é Caixa',async t=>{
  const a=await ambiente(t,{base:3,rate:3333,final:3});
  await a.receber(1);await a.receber(1);await a.receber(1);const s=await a.state();
  assert.deepEqual(s.receipts.map(r=>[r.amount,r.principal,r.additionPaid,r.cancelled]),[[1,1,0,0],[1,1,0,1],[1,1,0,0]]);
  assert.equal(s.rows[0].remaining,0);assert.equal(s.rows[0].total,3);assert.equal(s.totals.cancelled,1);
  assert.equal(await a.cash(),100003);assert.equal((await a.owner('select count(*)::int n,sum(valor_centavos)::int v from caixa_movimentos')).rows[0].n,3);
  assert.equal((await a.sentinels()).original,.03);
 });
 test('antecipação integral cancela somente acréscimo; entrega indefinida e após entrega não cancelam',async t=>{
  const a=await ambiente(t);await assert.rejects(a.receber(10001),/somente o principal/);
  await a.session(elyda);await a.receber(4000);await a.session(duam);await a.receber(6000);
  const s=await a.state();assert.equal(s.rows[0].cancelled,1500);assert.equal(s.rows[0].remaining,0);assert.equal(await a.cash(),110000);
  const b=await ambiente(t,{delivery:null});await b.receber(10000);assert.equal((await b.state()).rows[0].cancelled,0);
  const c=await ambiente(t,{delivery:'2001-06-04'});await c.receber(10000);assert.equal((await c.state()).rows[0].cancelled,0);
 });
 test('vínculo por ID preserva recebimento existente, não cria caixa e impede duplicação',async t=>{
  const a=await ambiente(t,{existing:true,mode:'waived',rate:0});let s=await a.state();
  assert.equal(s.totals.received,10000);assert.equal(s.totals.unlinked,10000);assert.equal(s.totals.remaining,0);
  await assert.rejects(a.receber(1),/Vincule/);await a.operate({tipo:'vincular',row_id:a.row,repasse_id:a.repasse});
  s=await a.state();assert.equal(s.receipts.length,1);assert.equal(s.receipts[0].repasse_id,a.repasse);assert.equal(s.receipts[0].linked,true);
  assert.equal(s.totals.unlinked,0);assert.equal(s.totals.received,10000);assert.equal(s.rows[0].remaining,0);
  assert.equal(await a.cash(),100000);assert.equal((await a.owner('select count(*)::int n from caixa_movimentos')).rows[0].n,0);
  await assert.rejects(a.operate({tipo:'vincular',row_id:a.row,repasse_id:a.repasse}),/ja vinculado/);
  await assert.rejects(a.owner('update repasses_cef set valor=1 where id=$1',[a.repasse]),/imutavel/);
 });
 test('estorno parcial antecipado reabre principal e acréscimo inversos exatos; original preservado',async t=>{
  const a=await ambiente(t);await a.receber(4000);const original=(await a.state()).receipts[0];const before=await a.sentinels();
  await a.estorno(2000);assert.equal((await a.state()).rows[0].received,4000);assert.equal(await a.cash(),104000);
  await a.decide();let s=await a.state();assert.deepEqual(s.receipts[0],{...original,available:2000});
  assert.deepEqual(s.receipts.map(r=>[r.amount,r.principal,r.additionPaid,r.cancelled]),[[4000,4000,0,600],[-2000,-2000,0,-300]]);
  assert.equal(s.rows[0].received,2000);assert.equal(s.rows[0].cancelled,300);assert.equal(s.rows[0].remaining,9200);
  assert.equal(await a.cash(),102000);assert.equal((await a.owner('select sum(valor)::int v from repasses_cef')).rows[0].v,20);
  await a.estorno(2000,original.id);await a.decide();s=await a.state();
  assert.equal(s.rows[0].principalPaid,0);assert.equal(s.rows[0].cancelled,0);assert.equal(s.rows[0].remaining,11500);
  assert.equal(await a.cash(),100000);assert.deepEqual(await a.sentinels(),before);
  await assert.rejects(a.estorno(1,original.id),/excede/);
 });
 test('estorno comum dividido em centavos restaura exatamente componentes do evento original',async t=>{
  const a=await ambiente(t,{base:3,rate:6667,final:3,delivery:null});await a.receber(5);const r=(await a.state()).receipts[0];
  for(let i=0;i<5;i++){await a.estorno(1,r.id);await a.decide();}
  const s=await a.state();assert.equal(s.rows[0].received,0);assert.equal(s.rows[0].principalPaid,0);assert.equal(s.rows[0].additionPaid,0);
  assert.equal(s.rows[0].remaining,5);assert.equal(await a.cash(),100000);assert.equal(s.receipts.length,6);
  assert.equal(s.receipts.reduce((v,r)=>v+r.principal,0),0);assert.equal(s.receipts.reduce((v,r)=>v+r.additionPaid,0),0);
 });
 test('UUID durável exige mesmo payload/ator; revisão muda impede dois pagamentos concorrentes',async t=>{
  const a=await ambiente(t);const op=randomUUID();const pedido={tipo:'receber',revisao:(await a.state()).plano.revisao,motivo:'Recebimento QA idempotente',row_id:a.row,amount:4000,date:'2001-06-06',method:'Pix',conta_id:a.bank,hora_efetiva:null,decisao_corte:null};
  const [x,y]=await Promise.all([a.send(pedido,op),a.send(pedido,op)]);assert.deepEqual(x,y);assert.equal(x.receipts.length,1);
  await assert.rejects(a.send({...pedido,amount:5000},op),/dados\/ator diferentes/);
  await a.session(elyda);await assert.rejects(a.send(pedido,op),/dados\/ator diferentes/);
  await a.session(duam);await assert.rejects(a.send(pedido),/Revisao mudou/);
  assert.equal(await a.cash(),104000);assert.equal((await a.owner('select count(*)::int n from entrada_plano_recebimentos')).rows[0].n,1);
 });
 test('pagamento após proposta torna aprovação obsoleta; rejeição mantém vigente e nova proposta preserva IDs',async t=>{
  const a=await ambiente(t);await a.session(elyda);const q=await a.solicitar(a.rows.map(p=>({...p,rate:2000})));
  await a.receber(1000);await assert.rejects(a.decide(),/Proposta obsoleta/);await a.decide('rejected');
  const s=await a.state();assert.equal(s.rows[0].rate,1500);assert.equal(s.requests.at(-1).status,'rejected');
  await a.session(elyda);await assert.rejects(a.solicitar(a.rows.map(p=>({...p,base:9999}))),/imutavel|preservar/);
  await a.solicitar(a.rows.map(p=>({...p,rate:2000})));await a.decide();
  assert.equal((await a.state()).rows[0].rate,2000);assert.equal((await a.state()).receipts.length,1);
 });
 test('mudança de entrega é prospectiva e cancelamentos anteriores não são recalculados',async t=>{
  const a=await ambiente(t);await a.receber(2000);const r=(await a.state()).receipts[0];
  await a.session(elyda);await a.solicitar(a.rows,'2001-06-04');await a.decide();
  assert.deepEqual((await a.state()).receipts[0],r);await a.receber(2000);assert.equal((await a.state()).receipts[1].cancelled,0);
  assert.equal((await a.sentinels()).original,100);assert.equal((await a.owner('select data_entrega::text d from obras where id=$1',[obra])).rows[0].d,null);
 });
 test('guardas bloqueiam bypass obra/repasse/caixa e escrita imutável; PLS e terreno seguem independentes',async t=>{
  const a=await ambiente(t);await a.receber(1000);const s=await a.state(),r=s.receipts[0];
  for(const sql of ['update entrada_plano_recebimentos set amount=1','delete from entrada_plano_historico','delete from entrada_plano_operacoes'])await assert.rejects(a.owner(sql),/imutavel/);
  await assert.rejects(a.db.query('update obras set contrato_entrada=999 where id=$1',[obra]),/Contrato original/);
  await a.db.query('update obras set data_entrega=null where id=$1',[obra]);
  await assert.rejects(a.db.query('update repasses_cef set tipo=$1 where id=$2',['terreno',r.repasse_id]),/imutavel/);
  await assert.rejects(a.db.query('delete from repasses_cef where id=$1',[r.repasse_id]),/imutavel/);
  await assert.rejects(a.db.query('insert into repasses_cef(company_id,obra_id,tipo,valor,data_credito) values($1,$2,$3,10,$4)',[company,obra,'entrada','2001-06-06']),/atomico/);
  await assert.rejects(a.db.query('select caixa_registrar($1,$2::jsonb)',[randomUUID(),JSON.stringify({action:'cancelar',movimento_id:r.movimento_id,motivo:'Teste indevido'})]),/estorno aprovado/);
  const pls=randomUUID();await a.db.query('insert into repasses_cef(id,company_id,obra_id,tipo,valor,data_credito) values($1,$2,$3,$4,10,$5)',[pls,company,obra,'pls','2001-06-06']);
  await a.db.query('update repasses_cef set valor=20 where id=$1',[pls]);await a.db.query('delete from repasses_cef where id=$1',[pls]);
  assert.ok((await a.owner("select tgname from pg_trigger where tgname='audit_repasses_cef'")).rows.length);
  assert.equal((await a.owner('select count(*)::int n from audit_repasses_cef_ensaio')).rows[0].n,4);
 });
 test('falha Caixa reverte repasse/plano/histórico/operação; retry após correção funciona',async t=>{
  const a=await ambiente(t);const initial=await a.state(),op=randomUUID();
  const p={tipo:'receber',revisao:initial.plano.revisao,motivo:'Recebimento falha QA',row_id:a.row,amount:1000,date:'2999-01-01',method:'Pix',conta_id:a.bank};
  await assert.rejects(a.send(p,op),/futuro/);assert.deepEqual(await a.state(),initial);
  assert.equal((await a.owner('select count(*)::int n from repasses_cef')).rows[0].n,0);assert.equal(await a.cash(),100000);
  await a.send({...p,date:'2001-06-06'},op);assert.equal((await a.state()).receipts.length,1);
  const n=(await a.owner('select count(*)::int n from entrada_plano_operacoes where id=$1',[op])).rows[0].n;assert.equal(n,1);
 });
 test('limites, campos reservados, datas inválidas, redução abaixo do recebido e rollback com uso rejeitados',async t=>{
  const a=await ambiente(t,{approved:false});
  await assert.rejects(a.solicitar(a.rows.map(p=>({...p,rate:10001}))),/invalido/);
  await assert.rejects(a.solicitar(a.rows.map(p=>({...p,due:'2026-02-30'}))),/date/);
  await assert.rejects(a.solicitar(a.rows.map(p=>({...p,base:9999}))),/preservar/);
  await assert.rejects(a.solicitar(a.rows.map(p=>({...p,received:1}))),/reservados/);
  await assert.rejects(a.operate({tipo:'solicitar',company_id:other,rows:a.rows}),/reservados/);
  await a.solicitar();await a.decide();await a.receber(5000);await a.session(elyda);
  await assert.rejects(a.solicitar(a.rows.map(p=>({...p,mode:'final',rate:0,final:4000}))),/conflita/);
  await a.db.exec('reset role');await assert.rejects(a.db.exec(rollback),/Rollback bloqueado/);
  await a.db.exec('rollback');await a.session(elyda);
  assert.ok((await a.state()).receipts.length);assert.equal((await a.sentinels()).original,100);
 });

 test('estorno de pagamento comum após renegociação preserva principal/acréscimo históricos e nova alocação',async t=>{
  const a=await ambiente(t,{delivery:'2001-06-06'});await a.receber(5750);const original=(await a.state()).receipts[0];
  await a.session(elyda);await a.solicitar(a.rows.map(r=>({...r,rate:2000})),'2002-01-01');await a.decide();
  await a.receber(2500);assert.equal((await a.state()).rows[0].cancelled,625);
  await a.estorno(1000,original.id);await a.decide();const s=await a.state();
  assert.deepEqual(s.receipts[0],{...original,available:4750});assert.equal(s.receipts[2].principal,-870);
  assert.equal(s.receipts[2].additionPaid,-130);assert.equal(s.receipts[2].cancelled,0);
  assert.equal(s.rows[0].principalPaid,6630);assert.equal(s.rows[0].additionPaid,620);assert.equal(s.rows[0].cancelled,625);
  assert.equal(s.rows[0].remaining,4125);assert.equal(await a.cash(),107250);
  assert.equal(s.rows[0].allocation.principal,3370);assert.equal(s.rows[0].allocation.addition,755);
 });
 test('aviso três dias antes tem chave estável, exige acordo e vínculo, não anuncia automação ativa',async t=>{
  const a=await ambiente(t,{mode:'waived',rate:0,approved:false,existing:true});const due='2002-03-10';
  const avisos=async d=>(await a.db.query('select entrada_plano_avisos($1) r',[d])).rows[0].r;
  await a.solicitar(a.rows.map(p=>({...p,due})),null);assert.deepEqual((await avisos('2002-03-07')).avisos,[]);
  await a.decide();const resumo=(await a.resumo()).planos[0];assert.equal(resumo.saldo_centavos,0);
  assert.equal(resumo.unlinked_centavos,10000);assert.equal(resumo.pendencia_conciliacao,true);
  assert.equal(resumo.parcelas[0].pendencia_conciliacao,true);assert.deepEqual((await avisos('2002-03-07')).avisos,[]);
  await a.operate({tipo:'vincular',row_id:a.row,repasse_id:a.repasse});assert.deepEqual((await avisos('2002-03-07')).avisos,[]);
  const b=await ambiente(t,{approved:false});await b.solicitar(b.rows.map(p=>({...p,due})),null);await b.decide();
  const get=async d=>(await b.db.query('select entrada_plano_avisos($1) r',[d])).rows[0].r;
  const v=await get('2002-03-07');assert.equal(v.automation_active,false);assert.equal(v.avisos.length,1);
  assert.equal(v.avisos[0].id,'entrada:'+obra+':'+b.row+':'+due);assert.equal(v.avisos[0].amount,11500);
  await b.receber(1000);const w=await get('2002-03-07');assert.equal(w.avisos[0].id,v.avisos[0].id);
  assert.ok(w.avisos[0].revisao>v.avisos[0].revisao);assert.deepEqual((await get('2002-03-06')).avisos,[]);
  await assert.rejects(b.db.query('select entrada_plano_avisos(null)'),/referencia real/);
 });
 test('operação é visível só ao autor; trilhas compactas não expõem Caixa ao operacional',async t=>{
  const a=await ambiente(t);await a.receber(1000);await a.session(operational);
  assert.equal((await a.db.query('select count(*)::int n from entrada_plano_operacoes')).rows[0].n,0);
  const s=await a.state();assert.deepEqual(s.contas,[]);assert.ok(s.history.every(h=>!h.before.contas&&!h.after.contas&&!h.before.history&&!h.after.history));
  assert.ok(s.requests.every(r=>!r.before.contas&&!r.before.history&&!r.before.receipts));
  assert.ok(s.history.every(h=>h.actorName));assert.ok(s.requests.every(r=>r.actorName));
 });
 test('contrato original zero não é preenchido silenciosamente por parcelas',async t=>{
  const a=await ambiente(t,{base:0,approved:false});
  await assert.rejects(a.solicitar(a.rows.map(r=>({...r,base:100,final:100}))),/Defina o contrato original/);
  assert.equal((await a.owner('select count(*)::int n from entrada_planos')).rows[0].n,0);
  assert.equal((await a.sentinels()).original,0);
 });


 test('previsão financeira não substitui data real do Termo nem bloqueia conclusão da obra',async t=>{
  const a=await ambiente(t,{approved:false,delivery:'2002-01-01'});
  await a.owner('update obras set data_entrega=$1 where id=$2',['2001-02-03',obra]);
  assert.equal((await a.state()).plano.delivery,null,'Data real não vira previsão por fallback');
  await a.solicitar();await a.decide();
  assert.equal((await a.state()).plano.delivery,'2002-01-01');
  assert.equal((await a.owner('select data_entrega::text d from obras where id=$1',[obra])).rows[0].d,'2001-02-03');
  await a.db.query('update obras set data_entrega=$1 where id=$2',['2002-04-10',obra]);
  assert.equal((await a.owner('select data_entrega::text d from obras where id=$1',[obra])).rows[0].d,'2002-04-10');
  assert.equal((await a.state()).plano.delivery,'2002-01-01','Conclusão real não renegocia previsão');
  assert.equal((await a.sentinels()).original,100);
 });


 test('cadastro alterado durante primeira proposta exige rejeição e nova base antes de aprovação',async t=>{
  const a=await ambiente(t,{approved:false});const first=await a.solicitar();
  await a.db.query('update obras set contrato_entrada=$1 where id=$2',[200,obra]);
  await a.session(duam);const stale=await a.state();
  await assert.rejects(a.decide(),/Contrato original mudou/);assert.deepEqual(await a.state(),stale);
  await a.session(elyda);const currentRows=a.rows.map(r=>({...r,base:20000,final:20000}));
  await assert.rejects(a.solicitar(currentRows),/Rejeite os pedidos pendentes/);
  await a.decide('rejected');await a.session(elyda);await a.solicitar(currentRows);await a.decide();
  const s=await a.state();assert.equal(s.plano.stage,'confirmed');assert.equal(s.plano.original,20000);
  assert.equal(s.plano.contrato_entrada,20000);assert.equal(s.rows[0].base,20000);assert.equal(s.rows[0].total,23000);
  assert.equal(s.requests[0].id,first.requests[0].id);assert.equal(s.requests[0].status,'rejected');
  assert.equal(s.requests[0].before.plano.original,10000);assert.equal(s.requests[1].status,'approved');
  const refreshed=s.history.find(h=>h.type==='solicitar'&&h.after.plano.original===20000);
  assert.equal(refreshed.before.plano.original,10000);
  await a.db.query('update obras set data_entrega=$1 where id=$2',['2002-04-10',obra]);
  assert.equal((await a.owner('select data_entrega::text d from obras where id=$1',[obra])).rows[0].d,'2002-04-10');
  await assert.rejects(a.db.query('update obras set contrato_entrada=$1 where id=$2',[201,obra]),/Contrato original/);
 });
 test('guard original confirmado preserva updates alheios em drift legado e aceita só reparo exato',async t=>{
  const a=await ambiente(t);
  // Simula somente em QA uma intervenção privilegiada antiga. Não faz bypass de Auth real.
  await a.owner('alter table obras disable trigger entrada_plano_guard_obra');
  await a.owner('update obras set contrato_entrada=$1 where id=$2',[200,obra]);
  await a.owner('alter table obras enable trigger entrada_plano_guard_obra');
  await a.db.query('update obras set data_entrega=$1 where id=$2',['2002-04-10',obra]);
  assert.equal((await a.sentinels()).original,200);
  await assert.rejects(a.db.query('update obras set contrato_entrada=$1 where id=$2',[201,obra]),/Contrato original/);
  await a.db.query('update obras set contrato_entrada=$1 where id=$2',[100,obra]);
  assert.equal((await a.sentinels()).original,100);assert.equal((await a.state()).plano.original,10000);
 });


 test('defeito original reproduzido: downgrade vazava Caixa em SELECT/replay; patch revoga sem alterar dinheiro',async t=>{
  const a=await ambiente(t,{patched:false}),op=randomUUID();
  const pedido={tipo:'receber',revisao:2,motivo:'Reproducao isolada do replay QA',row_id:a.row,amount:4000,date:'2001-06-06',method:'Pix',conta_id:a.bank};
  const original=await a.send(pedido,op);assert.equal(original.contas.length,2);
  const ledger=async()=> (await a.owner("select jsonb_build_object('receipts',(select count(*) from entrada_plano_recebimentos),'repasses',(select count(*) from repasses_cef),'movements',(select count(*) from caixa_movimentos),'operations',(select count(*) from entrada_plano_operacoes),'received',(select sum(valor) from repasses_cef)) r")).rows[0].r;
  const before=await ledger();await a.owner("update company_users set role='operacional' where user_id=$1",[duam]);
  assert.deepEqual((await a.state()).contas,[],'Estado ja respeitava downgrade');
  const leaked=(await a.db.query('select resultado from entrada_plano_operacoes where id=$1',[op])).rows;
  assert.equal(leaked.length,1);assert.equal(leaked[0].resultado.contas.length,2);
  assert.deepEqual(await a.send(pedido,op),original,'Original devolvia Caixa apesar do papel atual');
  t.diagnostic('ORIGINAL_DEFECT_CONFIRMED: own SELECT=1 with 2 Caixa accounts; replay returned original after admin->operacional; no duplicate ledger.');
  await a.db.exec('reset role');await a.db.exec(replayPatch);await a.session(duam);
  assert.equal((await a.db.query('select count(*)::int n from entrada_plano_operacoes where id=$1',[op])).rows[0].n,0);
  await assert.rejects(a.send(pedido,op),e=>e.code==='42501'&&/permissao atual/.test(e.message));
  assert.deepEqual((await a.state()).contas,[]);assert.deepEqual(await ledger(),before);
  await a.owner("update company_users set role='admin' where user_id=$1",[duam]);
  assert.deepEqual(await a.send(pedido,op),original,'Retry volta a funcionar sob autorizacao atual sem novo recebimento');
  assert.deepEqual(await ledger(),before);assert.equal(await a.cash(),104000);
  const metadata=(await a.owner("select jsonb_build_object('functions',(select jsonb_agg(jsonb_build_object('name',proname,'prosrc_md5',md5(prosrc),'identity',pg_get_function_identity_arguments(oid),'settings',proconfig) order by proname) from pg_proc where pronamespace='public'::regnamespace and proname in ('entrada_plano_operar','entrada_plano_estado')),'policy',(select qual from pg_policies where schemaname='public' and tablename='entrada_plano_operacoes' and policyname='entrada_plano_empresa')) r")).rows[0].r;
  assert.ok(!metadata.policy.includes('operacional'));assert.ok(metadata.policy.includes("'admin'"));
  t.diagnostic('REPLAY_PATCH_METADATA '+JSON.stringify(metadata));
 });
 test('patch: downgrade/desativacao de Elyda revogam solicitacao nova e replay; restauracao conserva recibo',async t=>{
  const a=await ambiente(t);await a.receber(1000);await a.session(elyda);
  const op=randomUUID(),pedido={tipo:'solicitar',revisao:3,motivo:'Proposta isolada com role QA',rows:a.rows.map(r=>({...r,rate:2000})),delivery:'2002-01-01'};
  const original=await a.send(pedido,op);assert.equal(original.permissions.solicitar,true);
  const before=(await a.owner('select count(*)::int n from entrada_plano_operacoes')).rows[0].n;
  await a.owner("update company_users set role='operacional' where user_id=$1",[elyda]);
  const s=await a.state();assert.deepEqual(s.contas,[]);assert.deepEqual(s.permissions,{solicitar:false,aprovar:false,receber:false});
  assert.equal((await a.db.query('select count(*)::int n from entrada_plano_operacoes')).rows[0].n,0);
  for(const p of [pedido,{...pedido,revisao:s.plano.revisao},{tipo:'solicitar_estorno',revisao:s.plano.revisao,motivo:'Estorno negado por papel QA'}])
    await assert.rejects(a.send(p,p===pedido?op:randomUUID()),e=>e.code==='42501');
  await a.owner("update company_users set role='admin',active=false where user_id=$1",[elyda]);
  for(const active of [false,null]){
    await a.owner('update company_users set active=$1 where user_id=$2',[active,elyda]);
    assert.equal((await a.db.query('select count(*)::int n from entrada_plano_operacoes')).rows[0].n,0);
    await assert.rejects(a.state(),e=>e.code==='42501');await assert.rejects(a.send(pedido,op),e=>e.code==='42501');
  }
  await a.owner('update company_users set active=true where user_id=$1',[elyda]);
  assert.deepEqual(await a.send(pedido,op),original);
  assert.equal((await a.owner('select count(*)::int n from entrada_plano_operacoes')).rows[0].n,before);
  assert.equal((await a.state()).receipts.length,1);assert.equal(await a.cash(),101000);
 });
 test('patch: troca atual de responsavel nega replay mas admin autor conserva leitura historica propria',async t=>{
  const a=await ambiente(t),op=randomUUID(),pedido={tipo:'receber',revisao:2,motivo:'Pagamento antes de troca QA',row_id:a.row,amount:4000,date:'2001-06-06',method:'Pix',conta_id:a.bank};
  const original=await a.send(pedido,op);await a.owner('update entrada_plano_responsaveis set aprovador_id=$1 where company_id=$2',[third,company]);
  assert.equal((await a.db.query('select count(*)::int n from entrada_plano_operacoes where id=$1',[op])).rows[0].n,1,'Admin autor continua autorizado ao Caixa historico');
  assert.deepEqual((await a.state()).contas,[]);await assert.rejects(a.send(pedido,op),e=>e.code==='42501');
  await assert.rejects(a.send({...pedido,revisao:3},randomUUID()),e=>e.code==='42501');
  await a.session(third);await assert.rejects(a.send(pedido,op),/dados\/ator diferentes/);
  assert.equal((await a.db.query('select count(*)::int n from entrada_plano_operacoes where id=$1',[op])).rows[0].n,0,'Outro admin nao le operacao do autor');
  await a.owner('update entrada_plano_responsaveis set aprovador_id=$1 where company_id=$2',[duam,company]);await a.session(duam);
  assert.deepEqual(await a.send(pedido,op),original);assert.equal((await a.state()).receipts.length,1);assert.equal(await a.cash(),104000);
 });


}