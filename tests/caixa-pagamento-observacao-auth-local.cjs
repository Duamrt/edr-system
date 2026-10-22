'use strict';
// QA Supabase existente e fixado. Somente identidades/empresas sinteticas desta execucao.
// Credenciais aleatorias ficam exclusivamente na memoria; sem trace/storageState/log de HTTP.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process'),{randomUUID:id,randomBytes,createHash}=require('node:crypto');
const REPO=path.resolve(__dirname,'..'),OUT=path.resolve(process.env.EDR_PAY_AUTH_EVIDENCE_DIR||path.resolve(REPO,'../output/playwright'));
assert.ok(!path.relative(path.resolve(REPO,'..'),OUT).startsWith('..'),'Evidencias restritas a esta tarefa');
const API='http://127.0.0.1:18081',UI='http://127.0.0.1:18082';
const DB='supabase_db_edr-entrada-qa-20261008',MARKER='edr-entrada-qa-20261008';
const run=randomBytes(5).toString('hex'),company=id(),other=id(),actors={},checks=[],writes=[];
let browser,context,page,phase='preflight',loseNext=false,baseline,cleanupDone=false;
fs.mkdirSync(OUT,{recursive:true});
function sql(s){try{return execFileSync('docker',['exec','-i',DB,'psql','-U','postgres','-d','postgres','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate'],{input:s,encoding:'utf8',windowsHide:true,timeout:30000,stdio:['pipe','pipe','pipe']}).trim();}catch(e){const code=String(e.stderr||'').match(/(?:ERROR|FATAL):\s+([A-Z0-9]{5})/)?.[1];throw Error('SQL_QA_FALHOU '+(code||'')+'; detalhes privados omitidos');}}
const json=s=>JSON.parse(sql(s).split(/\r?\n/).at(-1));
const lit=s=>"'"+String(s).replaceAll("'","''")+"'";
const pass=name=>{checks.push({name,passed:true});console.log('PASS '+name);};
async function http(route,{token,method='GET',body}={}){
 const u=new URL(route,API);assert.equal(u.origin,API);assert.ok(route.startsWith('/auth/v1/')||route.startsWith('/rest/v1/'));
 const headers={'Content-Type':'application/json'};if(token)headers.Authorization='Bearer '+token;
 let r;try{r=await fetch(u,{method,headers,body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(15000)});}catch{throw Error('HTTP_QA_FALHOU; detalhes privados omitidos');}
 let data=null;try{data=await r.json();}catch{}
 return {ok:r.ok,status:r.status,data};
}
const okay=(r,label)=>{assert.equal(r.ok,true,label+' HTTP '+r.status+' '+(r.data?.code||''));return r.data;};
const rpc=(who,name,body={})=>http('/rest/v1/rpc/'+name,{token:actors[who]?.token,method:'POST',body});
const send=(pedido,op=id(),who='admin')=>rpc(who,'caixa_registrar',{p_operacao:op,p_pedido:pedido});
const state=async(who='admin')=>okay(await rpc(who,'caixa_estado'),'estado');
const payment=(cp,extra={})=>({action:'movimento',tipo:'pagamento',conta_id:null,origem_codigo:'banco',conta_pagar_id:cp,valor_centavos:10000,data_efetiva:'2001-06-04',hora_efetiva:null,decisao_corte:null,descricao:'QA sintetico '+run,pagamento_confirmado:true,...extra});
function invoice(label,value=100,tenant=company){const cp=id();sql(`insert into public.contas_pagar(id,company_id,fornecedor,descricao,valor,data_vencimento,status,tipo) values('${cp}','${tenant}',${lit('QA '+label)},${lit('QA descartavel '+run+' '+label)},${value},'2001-06-05','pendente','despesa');`);return cp;}
const cpState=cp=>json(`select json_build_object('status',status,'valor',valor,'data',data_pagamento) from public.contas_pagar where id='${cp}';`);
function fingerprint(){
 const tables=['companies','company_users','contas_pagar','caixa_contas','caixa_movimentos','caixa_obrigacoes','caixa_operacoes','obras','repasses_cef'];
 const pieces=tables.map(t=>{const filter=t==='companies'?`id not in ('${company}','${other}')`:`company_id not in ('${company}','${other}')`;const row=t==='caixa_movimentos'?"to_jsonb(x)-ARRAY['origem_codigo','desconto_centavos','juros_centavos','conciliado_em','conciliado_por']":'to_jsonb(x)';return `${lit(t)},(select md5(coalesce(jsonb_agg(${row} order by (${row})::text)::text,'[]')) from public.${t} x where ${filter})`;});
 pieces.push("'custos',(select md5(jsonb_agg(x order by id)::text) from public.lancamentos x)","'folha',(select md5(jsonb_agg(x order by id)::text) from public.diarias_quinzenas x)","'estoque',(select md5(jsonb_agg(x order by id)::text) from public.distribuicoes x)");
 return json('select jsonb_build_object('+pieces.join(',')+');');
}
async function modalSaved(){await page.locator('#cp-modal').waitFor({state:'detached',timeout:15000});}
async function refresh(){await page.evaluate(async()=>{await caixaProspectivoCarregar();await _loadContasPagar();});}
async function cleanup(){
 for(const actor of Object.values(actors)){if(actor.token)await http('/auth/v1/logout?scope=global',{token:actor.token,method:'POST'}).catch(()=>null);}
 const ids=Object.values(actors).filter(x=>x.id).map(x=>lit(x.id));
 if(ids.length){sql(`begin; update public.company_users set active=false where company_id in ('${company}','${other}') and user_id in (${ids}); update auth.users set banned_until='infinity' where id in (${ids}) and email like 'qa-pay-${run}-%@example.test'; delete from auth.sessions where user_id in (${ids}); commit;`);}
 for(const a of Object.values(actors)){a.password='';a.token='';}
 cleanupDone=true;
}
(async()=>{
 assert.equal(process.env.EDR_PAY_AUTH_LOCAL_RUN,'AUTHORIZED_LOCAL_QA');
 assert.equal(sql('select project_id from edr_entrada_qa.marker where id=1;'),MARKER);
 assert.equal((await fetch(API+'/auth/v1/health',{redirect:'error'})).status,200);
 const uiHealth=await fetch(UI+'/health',{redirect:'error'});assert.equal(uiHealth.status,200);
 assert.equal((await uiHealth.json()).repo,path.basename(REPO),'Interface QA deve servir a mesma base do roteiro');
 baseline=fingerprint();
 const migration=fs.readFileSync(path.join(REPO,'sql/caixa-pagamento-observacao-opcional-DRAFT.sql'),'utf8');
 const baseSQL=fs.readFileSync(path.join(REPO,'sql/caixa-pagamento-sem-abertura-DRAFT.sql'),'utf8').replaceAll('\r','');
 const old=migration.match(/trecho:=\$old\$([\s\S]*?)\$old\$/)[1],replacement=migration.match(/,\$new\$([\s\S]*?)\$new\$/)[1];
 const body=baseSQL.match(/create or replace function public\.caixa_registrar\([\s\S]*?as \$\$([\s\S]*?)\$\$;/i)[1];
 assert.ok(body.includes(old));const expected=createHash('md5').update(body.replace(old,replacement).trim()).digest('hex');
 const functionHash=()=>sql("select md5(btrim(replace(prosrc,chr(13),''),chr(32)||chr(10)||chr(9))) from pg_proc where oid='public.caixa_registrar(uuid,jsonb)'::regprocedure;");
 const security=()=>json("select jsonb_build_object('functions',(select jsonb_agg(jsonb_build_object('name',proname,'acl',proacl,'security',prosecdef,'config',proconfig) order by proname) from pg_proc where oid in ('public.caixa_registrar(uuid,jsonb)'::regprocedure,'public.caixa_estado()'::regprocedure)),'policies',(select jsonb_agg(to_jsonb(p) order by tablename,policyname) from pg_policies p where schemaname='public' and tablename like 'caixa_%')); ");
 const beforeSecurity=security();
 if(functionHash()!==expected){assert.equal(functionHash(),'58a3430cddabfb2d18a97f40e22e1b5a');sql(migration);}
 assert.equal(functionHash(),expected);assert.deepEqual(security(),beforeSecurity);
 assert.deepEqual(fingerprint(),baseline);pass('migracao local exata, historico e seguranca preservados');
 phase='identidades sinteticas';
 for(const name of ['admin','reader','foreign','inactive']){
   const password=randomBytes(32).toString('base64url')+'Aa1!',email=`qa-pay-${run}-${name}@example.test`;
   const signed=okay(await http('/auth/v1/signup',{method:'POST',body:{email,password,data:{nome:'QA Pagamento '+name,perfil:'admin'}}}),'cadastro QA');
   assert.equal(typeof signed.access_token,'string');assert.ok(signed.user?.id);
   actors[name]={id:signed.user.id,memberId:id(),email,password,token:signed.access_token};
   const me=okay(await http('/auth/v1/user',{token:signed.access_token}),'identidade GoTrue');assert.equal(me.id,signed.user.id);
 }
 sql(`begin; insert into public.companies(id,owner_id,name,slug,saldo_manual) values('${company}','${actors.admin.id}','QA Pagamento ${run}','qa-pay-${run}',123.45),('${other}','${actors.foreign.id}','QA Outra empresa ${run}','qa-pay-other-${run}',987.65); insert into public.company_users(id,company_id,user_id,role,active,nome,email) values ${Object.entries(actors).map(([n,a])=>`('${a.memberId}','${n==='foreign'?other:company}','${a.id}','${n==='reader'?'visitante':'admin'}',${n!=='inactive'},${lit('QA '+n)},${lit(a.email)})`).join(',')}; commit;`);
 const cp=invoice('parcial e desconto'),before=invoice('incluido'),after=invoice('apos corte'),unknown=invoice('sem horario'),foreignCP=invoice('empresa B',100,other),race=invoice('concorrencia');
 pass('quatro identidades sinteticas autenticadas pelo GoTrue real');
 phase='login no navegador';
 const {chromium}=require(process.env.EDR_PLAYWRIGHT_PATH);
 browser=await chromium.launch({headless:true,executablePath:process.env.EDR_CHROMIUM_PATH});
 context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});
 const forbidden=[],unexpectedWrites=[];
 await context.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());
   if(![UI,API].includes(url.origin)){forbidden.push(url.origin);return route.abort('blockedbyclient');}
   if(url.origin===API&&request.method()!=='GET'&&request.method()!=='OPTIONS'){
     // Login original atualiza apenas nome/email do proprio vinculo sintetico.
     const profile=request.method()==='PATCH'&&url.pathname==='/rest/v1/company_users'&&url.searchParams.get('id')==='eq.'+actors.admin.memberId;
     if(profile){const b=request.postDataJSON();assert.deepEqual(Object.keys(b).sort(),['email','nome']);assert.equal(b.email,actors.admin.email);assert.equal(b.nome,'QA Pagamento admin');return route.continue();}
     // estoque_operacao_status e consulta de leitura do boot original; nao grava estoque.
     const allowed=url.pathname==='/auth/v1/token'||url.pathname==='/rest/v1/rpc/caixa_estado'||url.pathname==='/rest/v1/rpc/caixa_registrar'||url.pathname==='/rest/v1/rpc/entrada_plano_resumo'||url.pathname==='/rest/v1/rpc/estoque_operacao_status';
     if(!allowed){unexpectedWrites.push(url.pathname);return route.abort('blockedbyclient');}
   }
   if(url.pathname==='/rest/v1/rpc/caixa_registrar'){
     const body=request.postDataJSON();writes.push(body);
     if(loseNext&&body.p_pedido.tipo==='pagamento'){
       loseNext=false;const response=await route.fetch({maxRedirects:0});assert.ok(response.ok(),'commit real antes da resposta perdida');await response.dispose();return route.abort('connectionfailed');
     }
   }
   return route.continue();
 });
 page=await context.newPage();page.setDefaultTimeout(12000);
 page.on('dialog',d=>d.accept('Correcao sintetica QA'));
 await page.goto(UI+'/');await page.locator('#login-user').fill(actors.admin.email);await page.locator('#login-pass').fill(actors.admin.password);await page.locator('#login-btn').click();
 await page.waitForFunction(()=>document.getElementById('login-screen')?.style.display==='none');
 assert.deepEqual(await page.evaluate(()=>({company:_companyId,role:usuarioAtual.perfil})),{company,role:'admin'});
 assert.equal((await state()).contas.length,0);pass('login real pela tela e empresa/perfil confirmados');
 phase='observacao opcional no formulario';
 for(const [label,note] of [['ausente',undefined],['vazia',''],['espacos','   '],['preenchida','Observacao sintetica QA']]){
   await refresh();await page.evaluate(async cp=>{setView('contas-pagar');await caixaProspectivoAbrir('pagamento',cp);},cp);
   assert.equal(await page.locator('#cp-descricao').getAttribute('required'),null);
   assert.equal(await page.locator('#cp-descricao').isVisible(),false);
   assert.equal(await page.locator('#cp-pago-confirmado').getAttribute('required'),'');
   await page.locator('#cp-origem').selectOption('banco');await page.locator('#cp-valor').fill('10');await page.locator('#cp-data').fill('2001-06-04');
   if(label==='ausente'){
     const beforeWrites=writes.length;
     await page.locator('#cp-salvar').click();assert.equal(writes.length,beforeWrites,'confirmacao continua obrigatoria');
     await page.locator('#cp-descricao').evaluate(el=>el.remove());
   }else if(note){await page.getByText('Adicionar observação',{exact:true}).click();await page.locator('#cp-descricao').fill(note);}
   await page.locator('#cp-pago-confirmado').check();await page.locator('#cp-salvar').click();await modalSaved();
   const sent=writes.at(-1),s=await state(),m=s.movimentos.find(x=>x.operacao_id===sent.p_operacao);
   assert.equal(m.descricao,(note||'').trim());assert.equal(m.conta_pagar_id,cp);assert.equal(sent.p_pedido.conta_pagar_id,cp);
   assert.equal((await rpc('admin','caixa_registrar',sent)).data.movimento_id,m.id);
   assert.equal((await state()).movimentos.filter(x=>x.operacao_id===sent.p_operacao).length,1);
   pass('UI '+label+': salva sem inventar observacao, vinculo e reenvio preservados');
 }
 assert.equal(Number(cpState(cp).valor),100);assert.equal(cpState(cp).status,'pendente');
 await page.evaluate(async()=>{setView('caixa');await renderCaixa();});
 await page.waitForFunction(()=>document.getElementById('caixa-content')?.textContent.includes('QA parcial e desconto'));
 phase='observacao opcional na RPC';
 for(const [label,value] of [['ausente',undefined],['vazia',''],['espacos','   '],['nula',null],['preenchida','Referencia digitada QA'],['limite','x'.repeat(500)]]){
   const p=payment(after,{valor_centavos:100});if(value===undefined)delete p.descricao;else p.descricao=value;
   const op=id(),r=okay(await send(p,op),'RPC '+label),m=(await state()).movimentos.find(x=>x.id===r.movimento_id);
   assert.equal(m.descricao,(value||'').trim());assert.equal(m.conta_pagar_id,after);
   assert.deepEqual(okay(await send(p,op),'replay '+label),r);
   assert.equal((await send({...p,descricao:'pedido diferente'},op)).ok,false);
   pass('RPC '+label+': aceita e preserva idempotencia');
 }
 phase='validacoes e permissoes mantidas';
 const frozen=(await state()).movimentos.length;
 const noNote=payment(unknown,{descricao:''});
 for(const extra of [{descricao:'x'.repeat(501)},{pagamento_confirmado:false},{origem_codigo:''},{origem_codigo:'terceiro'},{data_efetiva:''},{data_efetiva:'2099-01-01'},{valor_centavos:0},{valor_centavos:10001},{company_id:other}])assert.equal((await send({...noNote,...extra})).ok,false);
 for(const who of ['reader','inactive','foreign','anonymous'])assert.equal((await send(noNote,id(),who)).ok,false,who);
 assert.equal((await send({...noNote,conta_pagar_id:foreignCP})).ok,false);
 assert.equal((await http('/rest/v1/caixa_movimentos?company_id=eq.'+company,{token:actors.admin.token,method:'PATCH',body:{descricao:''}})).ok,false);
 assert.equal((await state()).movimentos.length,frozen);
 pass('limite 500, confirmacao, origem, valor, data, autorizacao, RLS e isolamento mantidos');
 phase='demais movimentos continuam com descricao obrigatoria';
 okay(await send({action:'abertura',corte_local:'2001-06-05T12:00',fuso:'America/Sao_Paulo',contas:[{codigo:'banco',nome:'Banco QA',saldo_centavos:100000},{codigo:'dinheiro',nome:'Dinheiro QA',saldo_centavos:10000}]}),'abertura exclusivamente sintetica');
 const s=await state(),bank=s.contas.find(x=>x.codigo==='banco').id,cash=s.contas.find(x=>x.codigo==='dinheiro').id;
 for(const tipo of ['entrada','saida','transferencia']){
   const p={action:'movimento',tipo,conta_id:bank,destino_id:tipo==='transferencia'?cash:null,valor_centavos:100,data_efetiva:'2001-06-06',descricao:''};
   assert.equal((await send(p)).ok,false,tipo+' vazio');delete p.descricao;assert.equal((await send(p)).ok,false,tipo+' ausente');
   okay(await send({...p,descricao:'Movimento sintetico QA'}),tipo+' preenchido');
   await refresh();await page.evaluate(async t=>{await caixaProspectivoAbrir(t);},tipo);
   assert.equal(await page.locator('#cp-descricao').getAttribute('required'),'');await page.locator('#cp-cancelar').click();
 }
 const blankAfterOpening=okay(await send(payment(before,{conta_id:bank,data_efetiva:'2001-06-06',descricao:''})),'pagamento vazio apos abertura');
 assert.equal((await state()).movimentos.find(x=>x.id===blankAfterOpening.movimento_id).descricao,'');
 pass('entrada, saida e transferencia exigem descricao; pagamento segue opcional com abertura');
 assert.deepEqual(fingerprint(),baseline);assert.equal(unexpectedWrites.length,0);assert.equal(forbidden.length,0);
 pass('historico anterior e dados fora das empresas sinteticas preservados');

 phase='limpeza';await context.close();context=null;await browser.close();browser=null;await cleanup();
 assert.deepEqual(fingerprint(),baseline);pass('sessoes descartadas e contas sinteticas desativadas');
 const report={date:new Date().toISOString(),run,qa:MARKER,api:API,ui:UI,checks,authenticated:true,realGoTrue:true,realPostgREST:true,realBrowser:true,productionTouched:false,privateCredentialsRead:false,secretsPersisted:false,cleanupDone,fixtures:{company,other},screenshots:[]};
 fs.writeFileSync(path.join(OUT,'observacao-auth-result.json'),JSON.stringify(report,null,2));console.log('RESULTADO '+checks.length+'/'+checks.length+' etapas aprovadas; segredos somente em memoria.');
})().catch(async e=>{
 let safe=String(e.message||'').split('\n')[0];
 const location=String(e.stack||'').match(/caixa-pagamento-observacao-auth-local\.cjs:\d+:\d+/)?.[0]||'';
 for(const a of Object.values(actors))for(const secret of [a.password,a.token])if(secret)safe=safe.split(secret).join('[segredo omitido]');
 if(context)await context.close().catch(()=>{});if(browser)await browser.close().catch(()=>{});
 try{await cleanup();}catch{console.error('LIMPEZA_QA_PENDENTE: somente identidades sinteticas run='+run);}
 // Nao registrar objetos de erro Playwright/HTTP: podem carregar argumentos privados.
 safe=safe.replace(/qa-pay-[^\s@]+@example\.test/g,'[usuario sintetico]').replace(/eyJ[A-Za-z0-9_.-]+/g,'[token omitido]');
 console.error('FALHOU etapa='+phase+'; '+safe.slice(0,700)+'; '+location);
 fs.writeFileSync(path.join(OUT,'observacao-auth-failure.json'),JSON.stringify({run,phase,checks,cleanupDone,error:safe.slice(0,700),location},null,2));process.exitCode=1;
});
