'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
if(!process.env.EDR_POSTGRES_BIN){test('plano: concorrência PG17 nativo',{skip:'Defina EDR_POSTGRES_BIN; concorrência real não testada.'},()=>{});}
else{
 for(const k of Object.keys(process.env))if(k.startsWith('PG'))delete process.env[k];
 const {iniciar}=require('./fixtures/estoque-pg-local.cjs');
 const read=f=>fs.readFileSync(path.join(__dirname,f),'utf8');
 const base=(read('fixtures/caixa-prospectivo-base.sql')+'\n'+read('fixtures/entrada-plano-base.sql')).replace(/^create role (anon|authenticated);\r?\n/gm,'');
 const originalMigration=read('../sql/caixa-prospectivo-DRAFT.sql')+'\n'+read('../sql/entrada-plano-DRAFT.sql');
 const replayPatch=read('../sql/entrada-plano-revalidar-replay.sql');
 const migration=originalMigration+'\n'+replayPatch;
 const rollback=read('../sql/entrada-plano-rollback-DRAFT.sql');
 const q=v=>v==null?'null':"'"+String(v).replace(/'/g,"''")+"'";
 const settled=p=>p.then(value=>({ok:true,value}),error=>({ok:false,error}));
 const good=r=>{assert.equal(r.ok,true,r.error?.message);return r.value};
 const bad=(r,re)=>{assert.equal(r.ok,false);assert.match(r.error.message,re)};
 const company=randomUUID(),elyda=randomUUID(),duam=randomUUID(),obra=randomUUID();
 let pg,control,seq=0;
 test.before(async()=>{pg=await iniciar();console.log('PLANO NATIVO '+pg.versao+'; loopback127.0.0.1; cluster novo '+pg.pasta);control=pg.conectar();await control.query('create role anon;create role authenticated;')});
 test.after(async()=>{if(pg)await pg.parar()});
 async function ambiente(t,{baseValue=10000,rate=1500,approved=true}={}){
  const db='edr_entrada_t'+(++seq);await control.query('create database '+db+';');
  const observer=pg.conectar(db,db+'_observador'),sessions=[observer];
  t.after(async()=>{for(const s of sessions){if(s.pendente)s.destruir();else await s.fechar()}});
  await observer.query(base+'\n'+migration);
  await observer.query("insert into companies(id) values("+q(company)+");insert into company_users(user_id,company_id,role) values("+q(elyda)+","+q(company)+",'admin'),("+q(duam)+","+q(company)+",'admin');insert into obras(id,company_id,contrato_entrada) values("+q(obra)+","+q(company)+","+baseValue+"/100.0);insert into entrada_plano_responsaveis(company_id,solicitante_id,aprovador_id) values("+q(company)+","+q(elyda)+","+q(duam)+");select set_config('request.jwt.claim.sub',"+q(duam)+",false);");
  const sessao=async(name,user=duam)=>{const s=pg.conectar(db,db+'_'+name);sessions.push(s);await s.query("select set_config('request.jwt.claim.sub',"+q(user)+",false);set role authenticated;");return s};
  const first=await sessao('primeira'),second=await sessao('segunda');
  const pid1=await first.json('select to_json(pg_backend_pid());'),pid2=await second.json('select to_json(pg_backend_pid());');assert.notEqual(pid1,pid2);
  const rpc=(pedido,id=randomUUID())=>'select entrada_plano_operar('+q(id)+'::uuid,'+q(obra)+'::uuid,'+q(JSON.stringify(pedido))+'::jsonb);';
  const state=()=>observer.json('select entrada_plano_estado('+q(obra)+'::uuid);');
  const caixa=(p,id=randomUUID())=>'select caixa_registrar('+q(id)+'::uuid,'+q(JSON.stringify(p))+'::jsonb);';
  await first.json(caixa({action:'abertura',corte_local:'2001-06-05T18:23',fuso:'America/Sao_Paulo',contas:[{codigo:'banco',nome:'Banco QA',saldo_centavos:100000},{codigo:'dinheiro',nome:'Dinheiro QA',saldo_centavos:0}]}));
  const bank=(await observer.json('select caixa_estado();')).contas[0].id,row=randomUUID();
  const rows=[{id:row,label:'Parcela nativa QA',base:baseValue,mode:'percent',rate,final:baseValue,due:null,method:'Pix'}];
  await first.query("select set_config('request.jwt.claim.sub',"+q(elyda)+",false);");
  const req=await first.json(rpc({tipo:'solicitar',revisao:0,motivo:'Plano sintético PG17',rows,delivery:'2002-01-01'}));
  await first.query("select set_config('request.jwt.claim.sub',"+q(duam)+",false);");
  if(approved)await first.json(rpc({tipo:'decidir',revisao:1,motivo:'Aprovação sintética PG17',proposta_id:req.requests[0].id,decisao:'approved'}));
  const pedido=(extra={})=>({tipo:'receber',revisao:2,motivo:'Recebimento nativo QA',row_id:row,amount:4000,date:'2001-06-06',method:'Pix',conta_id:bank,hora_efetiva:null,decisao_corte:null,...extra});
  const counts=()=>observer.json("select jsonb_build_object('receipts',(select count(*) from entrada_plano_recebimentos),'rep',(select count(*) from repasses_cef),'mov',(select count(*) from caixa_movimentos),'amount',(select coalesce(sum(valor),0)*100 from repasses_cef),'cash',(select caixa_estado()->>'total_centavos'),'original',(select contrato_entrada from obras where id="+q(obra)+"),'stock',(select qtd from distribuicoes where id=1),'cost',(select total from lancamentos where id=1));");
  const waiting=async()=>{const end=Date.now()+5000;do{const r=await observer.json('select jsonb_build_object(\'pid\',pid,\'type\',wait_event_type,\'blocking\',pg_blocking_pids(pid)) from pg_stat_activity where pid='+pid2+';');if(r?.type==='Lock'&&r.blocking.includes(pid1)){t.diagnostic('PID '+pid2+' bloqueado pelo PID '+pid1);return r}await new Promise(resolve=>setTimeout(resolve,25))}while(Date.now()<end);throw Error('Não observou espera real em conexões distintas')};
  return{db,observer,first,second,sessao,rpc,state,caixa,bank,row,rows,pedido,counts,waiting,pid1,pid2};
 }
 test('PG17: UUID simultâneo espera commit e gera recebimento, repasse e Caixa uma vez',{timeout:25000},async t=>{
  const a=await ambiente(t),op=randomUUID(),p=a.pedido();await a.first.query('begin;');const x=await a.first.json(a.rpc(p,op));
  const later=settled(a.second.json(a.rpc(p,op)));await a.waiting();assert.equal((await a.state()).receipts.length,0);
  await a.first.query('commit;');assert.deepEqual(good(await later),x);
  const n=await a.counts();assert.equal(n.receipts,1);assert.equal(n.rep,1);assert.equal(n.mov,1);assert.equal(n.amount,4000);assert.equal(n.cash,'104000');
  assert.equal(n.original,100);assert.equal(n.stock,7);assert.equal(n.cost,91.23);
 });
 test('PG17: operações diferentes com mesma revisão rejeitam segunda sem exceder principal',{timeout:25000},async t=>{
  const a=await ambiente(t);await a.first.query('begin;');await a.first.json(a.rpc(a.pedido({amount:7000})));
  const later=settled(a.second.json(a.rpc(a.pedido({amount:4000}))));await a.waiting();await a.first.query('commit;');
  bad(await later,/Revisao mudou/);const n=await a.counts();assert.equal(n.receipts,1);assert.equal(n.rep,1);assert.equal(n.mov,1);assert.equal(n.amount,7000);
  assert.equal((await a.state()).rows[0].remaining,3450);
 });
 test('PG17: mesmo UUID com payload divergente falha após lock sem repetir Caixa',{timeout:25000},async t=>{
  const a=await ambiente(t),op=randomUUID();await a.first.query('begin;');await a.first.json(a.rpc(a.pedido(),op));
  const later=settled(a.second.json(a.rpc(a.pedido({amount:2000}),op)));await a.waiting();await a.first.query('commit;');
  bad(await later,/dados\/ator diferentes/);assert.equal((await a.counts()).cash,'104000');assert.equal((await a.counts()).receipts,1);
 });
 test('PG17: rollback da primeira sessão libera retry e não deixa recibo nem dinheiro parcial',{timeout:25000},async t=>{
  const a=await ambiente(t),op=randomUUID(),p=a.pedido();await a.first.query('begin;');await a.first.json(a.rpc(p,op));
  const later=settled(a.second.json(a.rpc(p,op)));await a.waiting();await a.first.query('rollback;');
  good(await later);const n=await a.counts();assert.equal(n.receipts,1);assert.equal(n.rep,1);assert.equal(n.mov,1);assert.equal(n.amount,4000);
  assert.equal((await a.state()).history.filter(h=>h.type==='receber').length,1);
 });
 test('PG17: pagamento concorrente deixa proposta obsoleta, aprovação não sobrepõe recebimento',{timeout:25000},async t=>{
  const a=await ambiente(t);const requester=await a.sessao('solicitante',elyda);
  const r=await requester.json(a.rpc({tipo:'solicitar',revisao:2,motivo:'Revisão proposta QA',rows:a.rows.map(p=>({...p,rate:2000})),delivery:'2002-01-01'}));
  await a.first.query('begin;');await a.first.json(a.rpc(a.pedido({revisao:3})));
  const later=settled(a.second.json(a.rpc({tipo:'decidir',revisao:3,motivo:'Decisão concorrente QA',proposta_id:r.requests.at(-1).id,decisao:'approved'})));
  await a.waiting();await a.first.query('commit;');bad(await later,/Revisao mudou/);
  const s=await a.state();assert.equal(s.rows[0].rate,1500);assert.equal(s.requests.at(-1).status,'pending');assert.equal(s.receipts.length,1);
 });
 test('PG17: dupla aprovação de estorno usa mesmo UUID e inverte componentes somente uma vez',{timeout:25000},async t=>{
  const a=await ambiente(t);const paid=await a.first.json(a.rpc(a.pedido())),receipt=paid.receipts[0];
  const requester=await a.sessao('estorno_solicitante',elyda);
  const req=await requester.json(a.rpc({tipo:'solicitar_estorno',revisao:3,motivo:'Estorno solicitado QA',receipt_id:receipt.id,amount:2000,date:'2001-06-07',conta_id:a.bank}));
  const op=randomUUID(),p={tipo:'decidir',revisao:4,motivo:'Estorno aprovado QA',proposta_id:req.requests.at(-1).id,decisao:'approved'};
  await a.first.query('begin;');const x=await a.first.json(a.rpc(p,op));const later=settled(a.second.json(a.rpc(p,op)));
  await a.waiting();await a.first.query('commit;');assert.deepEqual(good(await later),x);
  const s=await a.state();assert.equal(s.receipts.length,2);assert.equal(s.rows[0].received,2000);assert.equal(s.rows[0].cancelled,300);
  const n=await a.counts();assert.equal(n.cash,'102000');assert.equal(n.amount,2000);assert.equal(n.rep,2);assert.equal(n.mov,2);
 });
 test('PG17: Caixa concorrente não cancela recebimento vinculado depois do commit',{timeout:25000},async t=>{
  const a=await ambiente(t);await a.first.query('begin;');const s=await a.first.json(a.rpc(a.pedido()));
  const later=settled(a.second.json(a.caixa({action:'cancelar',movimento_id:s.receipts[0].movimento_id,motivo:'Cancelamento indevido QA'})));
  await a.waiting();await a.first.query('commit;');bad(await later,/estorno aprovado/);
  const n=await a.counts();assert.equal(n.cash,'104000');assert.equal(n.mov,1);assert.equal(n.receipts,1);
 });
 test('PG17: rollback schema concorre com recebimento e preserva auditoria quando commit ocorrer',{timeout:25000},async t=>{
  const a=await ambiente(t);await a.first.query('begin;');await a.first.json(a.rpc(a.pedido()));
  // Sessão owner separada: rollback bloqueia nos locks de tabela, depois recusa dados auditados.
  const rollbackSession=pg.conectar(a.db,'rollback_schema');
  // Usa sessão nova explicitamente owner no mesmo banco; o helper acima não muda autenticação existente.
  t.after(()=>rollbackSession.fechar());
  const later=await settled(rollbackSession.query(rollback));bad(later,/could not obtain lock/);
  await a.first.query('commit;');
  const checker=pg.conectar(a.db,'rollback_apos_commit');t.after(()=>checker.fechar());
  bad(await settled(checker.query(rollback)),/Rollback bloqueado/);
  const n=await a.counts();assert.equal(n.receipts,1);assert.equal(n.cash,'104000');
 });

 test('PG17: backup lógico/restauração preserva plano, repasses, Caixa, histórico e recibo durável',{timeout:30000},async t=>{
  const a=await ambiente(t),op=randomUUID(),p=a.pedido();const received=await a.first.json(a.rpc(p,op));
  const {execFileSync}=require('node:child_process'),ext=process.platform==='win32'?'.exe':'';
  const backup=path.join(pg.pasta,'entrada-recuperacao.sql');
  execFileSync(path.join(pg.bin,'pg_dump'+ext),['-h','127.0.0.1','-p',String(pg.porta),'-U','edr_test','-d',a.db,'--format=plain','--no-owner','-f',backup],{windowsHide:true,stdio:'pipe',timeout:10000});
  const restored=a.db+'_restaurado';await control.query('create database '+restored+';');
  execFileSync(path.join(pg.bin,'psql'+ext),['-X','-q','-w','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',String(pg.porta),'-U','edr_test','-d',restored,'-f',backup],{windowsHide:true,stdio:'pipe',timeout:10000});
  const verify=pg.conectar(restored,'entrada_restore_owner');t.after(()=>verify.fechar());
  await verify.query("select set_config('request.jwt.claim.sub',"+q(duam)+",false);set role authenticated;");
  assert.deepEqual(await verify.json('select entrada_plano_estado('+q(obra)+'::uuid);'),await a.state());
  const retry=await verify.json(a.rpc(p,op));assert.deepEqual(retry,received);
  const cash=await verify.json('select caixa_estado();');assert.equal(cash.total_centavos,104000);assert.equal(cash.movimentos.length,1);
  const source=fs.readFileSync(backup,'utf8');assert.ok(source.includes('entrada_plano_historico'));assert.ok(source.includes('entrada_plano_operacoes'));
  t.diagnostic('pg_dump/restore em banco sintético novo confirmou idempotência e saldos; nenhuma produção acessada');
 });


 test('PG17: ordem inversa DDL primeiro bloqueia RPC antes de config/obra e libera sem deadlock',{timeout:25000},async t=>{
  const a=await ambiente(t),ownerPid=await a.observer.json('select to_json(pg_backend_pid());');
  await a.observer.query('begin;lock table entrada_plano_operacoes in access exclusive mode;');
  const later=settled(a.second.json(a.rpc(a.pedido())));
  let blocked=false;const end=Date.now()+5000;
  do{
   const s=await a.observer.json("select jsonb_build_object('type',wait_event_type,'blocking',pg_blocking_pids(pid)) from pg_stat_activity where pid="+a.pid2+";");
   if(s?.type==='Lock'&&s.blocking.includes(ownerPid)){blocked=true;break;}
   await new Promise(resolve=>setTimeout(resolve,25));
  }while(Date.now()<end);
  assert.equal(blocked,true,'RPC deve esperar AccessShare em operacoes antes de config/obra');
  await a.observer.query('lock table entrada_planos,entrada_plano_parcelas,entrada_plano_propostas,entrada_plano_recebimentos,entrada_plano_historico,entrada_plano_responsaveis,obras,repasses_cef,caixa_movimentos in access exclusive mode nowait;');
  await a.observer.query('rollback;');good(await later);
  const n=await a.counts();assert.equal(n.receipts,1);assert.equal(n.rep,1);assert.equal(n.mov,1);assert.equal(n.cash,'104000');
  t.diagnostic('DDL PID '+ownerPid+' precedeu RPC PID '+a.pid2+'; locks seguintes NOWAIT adquiridos sem deadlock');
 });


 test('PG17: alteração concorrente no cadastro original torna primeira aprovação obsoleta sem mutação',{timeout:25000},async t=>{
  const a=await ambiente(t,{approved:false});const pending=(await a.state()).requests[0];
  const ownerPid=await a.observer.json('select to_json(pg_backend_pid());');
  await a.observer.query('begin;update obras set contrato_entrada=200 where id='+q(obra)+';');
  const later=settled(a.second.json(a.rpc({tipo:'decidir',revisao:1,motivo:'Aprovação contra cadastro QA',proposta_id:pending.id,decisao:'approved'})));
  let blocked=false;const end=Date.now()+5000;
  do{const s=await a.observer.json("select jsonb_build_object('type',wait_event_type,'blocking',pg_blocking_pids(pid)) from pg_stat_activity where pid="+a.pid2+";");
   if(s?.type==='Lock'&&s.blocking.includes(ownerPid)){blocked=true;break;}
   await new Promise(resolve=>setTimeout(resolve,25));
  }while(Date.now()<end);
  assert.equal(blocked,true);await a.observer.query('commit;');bad(await later,/Contrato original mudou/);
  const s=await a.state();assert.equal(s.plano.stage,'draft');assert.equal(s.plano.revisao,1);
  assert.equal(s.requests[0].status,'pending');assert.equal(s.rows.length,0);assert.equal(s.history.length,1);
  const n=await a.counts();assert.equal(n.original,200);assert.equal(n.receipts,0);assert.equal(n.rep,0);assert.equal(n.mov,0);
  assert.equal(n.cash,'100000');t.diagnostic('Cadastro PID '+ownerPid+' bloqueou aprovação PID '+a.pid2+'; aprovação recusou original novo após commit');
 });


 test('PG17: downgrade durante espera em advisory lock e revalidado antes de replay',{timeout:25000},async t=>{
  const a=await ambiente(t),op=randomUUID(),p=a.pedido();await a.first.query('begin;');const original=await a.first.json(a.rpc(p,op));
  const later=settled(a.second.json(a.rpc(p,op)));await a.waiting();
  await a.observer.query("update company_users set role='operacional' where user_id="+q(duam)+";");
  await a.first.query('commit;');bad(await later,/permissao atual/);
  // psql ON_ERROR_STOP encerra a sessao do adaptador apos a negativa esperada.
  const verify=await a.sessao('leitura_apos_revogacao');
  assert.equal(await verify.json('select to_json(count(*)) from entrada_plano_operacoes;'),0);
  assert.deepEqual((await verify.json('select entrada_plano_estado('+q(obra)+'::uuid);')).contas,[]);
  await a.observer.query("update company_users set role='admin' where user_id="+q(duam)+";");
  assert.deepEqual(await verify.json(a.rpc(p,op)),original);const n=await a.counts();
  assert.equal(n.receipts,1);assert.equal(n.rep,1);assert.equal(n.mov,1);assert.equal(n.cash,'104000');
  const metadata=await a.observer.json("select jsonb_build_object('functions',(select jsonb_agg(jsonb_build_object('name',proname,'prosrc_md5',md5(prosrc),'identity',pg_get_function_identity_arguments(oid),'settings',proconfig) order by proname) from pg_proc where pronamespace='public'::regnamespace and proname in ('entrada_plano_operar','entrada_plano_estado')),'policy',(select qual from pg_policies where schemaname='public' and tablename='entrada_plano_operacoes' and policyname='entrada_plano_empresa'));");
  t.diagnostic('REPLAY_PATCH_PG17_METADATA '+JSON.stringify(metadata));
 });


}