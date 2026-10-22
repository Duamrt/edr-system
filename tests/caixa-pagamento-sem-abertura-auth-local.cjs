'use strict';
// QA Supabase existente e fixado. Somente identidades/empresas sinteticas desta execucao.
// Credenciais aleatorias ficam exclusivamente na memoria; sem trace/storageState/log de HTTP.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process'),{randomUUID:id,randomBytes,createHash}=require('node:crypto');
const REPO=path.resolve(__dirname,'..'),OUT=path.resolve(process.env.EDR_PAY_AUTH_EVIDENCE_DIR||path.resolve(REPO,'../output/playwright'));
assert.ok(!path.relative(path.resolve(REPO,'..'),OUT).startsWith('..'),'Evidencias restritas a esta tarefa');
const API='http://127.0.0.1:18081',UI='http://127.0.0.1:18080';
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
async function uiPayment(cp,{cash='100',discount='0',interest='0',date='2001-06-04',lose=false}={}){
 await refresh();await page.evaluate(()=>{setView('contas-pagar');renderContasPagar();});
 await page.locator(`button[onclick="marcarComoPago('${cp}')"]`).click();
 await page.locator('#cp-modal').waitFor();
 if(await page.locator('#cp-origem').count())await page.locator('#cp-origem').selectOption('banco');
 await page.locator('#cp-valor').fill(cash);await page.locator('#cp-data').fill(date);
 await page.locator('#cp-descricao').fill('QA comprovante ficticio '+run);
 if(discount!=='0'||interest!=='0'){await page.locator('#cp-modal summary').click();await page.locator('#cp-desconto').fill(discount);await page.locator('#cp-juros').fill(interest);}
 await page.locator('#cp-pago-confirmado').check();
 if(lose)await page.screenshot({path:path.join(OUT,'pagamento-auth-formulario.png'),fullPage:true});
 loseNext=lose;await page.locator('#cp-salvar').click();
 if(lose){await page.waitForFunction(()=>document.getElementById('cp-salvar')?.textContent.includes('Conferir'));return;}
 await modalSaved();
}
async function uiReconcile(m,decision){await page.evaluate(async mid=>{setView('caixa');await renderCaixa();await caixaProspectivoAbrir('conciliar',mid);},m);await page.locator('#cp-decisao').selectOption(decision);await page.locator('#cp-salvar').click();await modalSaved();}
async function uiCancel(m){await page.evaluate(async()=>{setView('caixa');await renderCaixa();});await page.locator(`button[onclick="caixaProspectivoCancelarMovimento('${m}')"]`).click();await page.waitForFunction(mid=>caixaProspectivoEstado()?.movimentos.some(m=>m.id===mid&&!!m.cancelado_em),m);}
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
 const migration=fs.readFileSync(path.join(REPO,'sql/caixa-pagamento-sem-abertura-DRAFT.sql'),'utf8');
 const installed=Number(sql("select count(*) from information_schema.columns where table_schema='public' and table_name='caixa_movimentos' and column_name='origem_codigo';"));
 if(!installed){
   const schema=execFileSync('docker',['exec',DB,'pg_dump','-U','postgres','-d','postgres','--schema-only','--schema=public','--schema=edr_entrada_qa'],{windowsHide:true,timeout:30000,stdio:['ignore','pipe','pipe']});
   fs.writeFileSync(path.join(OUT,'qa-schema-before-payment.sql'),schema);
   sql(migration);sql("notify pgrst,'reload schema';");
 }
 for(const fn of ['caixa_estado','caixa_registrar']){
   const body=migration.match(new RegExp('create or replace function public\\.'+fn+'\\([\\s\\S]*?as \\$\\$([\\s\\S]*?)\\$\\$;','i'))?.[1];assert.ok(body);
   const expected=createHash('md5').update(body.replaceAll('\r','').trim()).digest('hex');
   assert.equal(sql(`select md5(btrim(replace(prosrc,chr(13),''),chr(32)||chr(10)||chr(9))) from pg_proc where pronamespace='public'::regnamespace and proname='${fn}';`),expected);
 }
 assert.deepEqual(fingerprint(),baseline);pass('migracao local exata e dados anteriores preservados');
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
 phase='pagamento parcial com resposta perdida';
 await uiPayment(cp,{cash:'40',discount:'5',interest:'2',lose:true});
 let s=await state();assert.equal(s.contas.length,0);assert.equal(s.movimentos.length,1);assert.equal(s.movimentos[0].conta_id,null);assert.equal(s.movimentos[0].afeta_saldo,false);assert.equal(s.movimentos[0].decisao_corte,'pendente');
 assert.equal(s.pagamentos.find(p=>p.conta_pagar_id===cp).restante_centavos,5700);
 const first=s.movimentos[0].id,originalWrite=writes.at(-1);
 await page.reload();await page.waitForFunction(()=>!!_companyId);await page.evaluate(async()=>{setView('caixa');await renderCaixa();});
 await page.getByRole('button',{name:'Conferir pedido pendente',exact:true}).click();
 await page.waitForFunction(()=>!_cpLerPendente());assert.equal((await state()).movimentos.length,1);
 assert.equal(writes.at(-1).p_operacao,originalWrite.p_operacao);
 const replay=okay(await rpc('admin','caixa_registrar',originalWrite),'reenvio HTTP');assert.equal(replay.movimento_id,first);
 assert.equal((await send({...originalWrite.p_pedido,valor_centavos:3999},originalWrite.p_operacao)).ok,false);
 pass('parcial com desconto/juros, resposta perdida e reenvio apos recarga sem duplicacao');
 phase='quitacao e cancelamento';
 await uiPayment(cp,{cash:'57'});assert.equal(cpState(cp).status,'pago');assert.equal(Number(cpState(cp).valor),100);
 s=await state();const final=s.movimentos.find(m=>m.conta_pagar_id===cp&&m.id!==first).id;
 await uiCancel(final);assert.equal(cpState(cp).status,'pendente');assert.equal((await state()).pagamentos.find(p=>p.conta_pagar_id===cp).restante_centavos,5700);
 okay(await send(payment(cp,{valor_centavos:5700})),'repor parcial sintetico');
 pass('quitacao preserva original e cancelamento reabre somente o restante correto');
 phase='permissoes e isolamento';
 const frozenCount=(await state()).movimentos.length;
 for(const name of ['reader','inactive','foreign'])assert.equal((await send(payment(after),id(),name)).ok,false,'perfil/empresa negado '+name);
 assert.equal((await send(payment(after),id(),'anonymous')).ok,false);
 assert.equal((await send(payment(foreignCP))).ok,false);
 assert.equal((await send(payment(after,{company_id:other}))).ok,false);
 for(const name of ['reader','inactive'])assert.equal((await rpc(name,'caixa_estado')).ok,false);
 assert.equal((await state('foreign')).movimentos.length,0);
 const readForeign=okay(await http('/rest/v1/caixa_movimentos?select=id',{token:actors.foreign.token}),'RLS outra empresa');assert.equal(readForeign.length,0);
 assert.equal((await http('/rest/v1/caixa_movimentos?id=eq.'+first,{token:actors.admin.token,method:'PATCH',body:{afeta_saldo:true}})).ok,false);
 assert.equal((await state()).movimentos.length,frozenCount);
 for(const extra of [{pagamento_confirmado:false},{origem_codigo:'terceiro'},{data_efetiva:'2099-01-01'}])assert.equal((await send(payment(after,extra))).ok,false);
 pass('perfis, inativo, anonimo, empresa e escrita direta bloqueados pelo servidor');
 phase='abertura e conciliacao posterior';
 const mBefore=okay(await send(payment(before)),'anterior').movimento_id;
 const mAfter=okay(await send(payment(after,{data_efetiva:'2001-06-06'})),'posterior').movimento_id;
 const mUnknown=okay(await send(payment(unknown,{data_efetiva:'2001-06-05'})),'sem horario').movimento_id;
 assert.equal((await send({action:'conciliar',movimento_id:mBefore,decisao_corte:'incluido_abertura'})).ok,false);
 await page.evaluate(async()=>{setView('caixa');await renderCaixa();await caixaProspectivoAbrir('abertura');});
 await page.locator('#cp-corte').fill('2001-06-05T12:00');await page.locator('#cp-banco').fill('1000');await page.locator('#cp-dinheiro').fill('100');await page.locator('#cp-salvar').click();await modalSaved();
 s=await state();assert.equal(s.total_centavos,110000);assert.ok(s.movimentos.filter(m=>!m.cancelado_em).every(m=>m.decisao_corte==='pendente'));
 assert.equal((await send({action:'conciliar',movimento_id:mBefore,decisao_corte:'apos_corte'})).ok,false);
 assert.equal((await send({action:'conciliar',movimento_id:mAfter,decisao_corte:'incluido_abertura'})).ok,false);
 assert.equal((await send({action:'conciliar',movimento_id:mUnknown,decisao_corte:null})).ok,false);
 await uiReconcile(mBefore,'incluido_abertura');assert.equal((await state()).total_centavos,110000);
 await uiReconcile(mAfter,'apos_corte');assert.equal((await state()).total_centavos,100000);
 const recWrite=writes.at(-1);okay(await rpc('admin','caixa_registrar',recWrite),'reenvio conciliacao');assert.equal((await state()).total_centavos,100000);
 assert.equal((await send({action:'conciliar',movimento_id:mAfter,decisao_corte:'apos_corte'})).ok,false);
 assert.equal((await send({action:'conciliar',movimento_id:mUnknown,decisao_corte:'apos_corte'},id(),'foreign')).ok,false);
 assert.equal((await state()).movimentos.find(m=>m.id===mUnknown).decisao_corte,'pendente');
 await page.evaluate(async()=>{setView('caixa');await renderCaixa();});await page.screenshot({path:path.join(OUT,'pagamento-auth-conciliacao.png'),fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>{if(typeof closeSidebar==='function')closeSidebar();});await page.screenshot({path:path.join(OUT,'pagamento-auth-mobile.png'),fullPage:true,animations:'disabled'});await page.setViewportSize({width:1440,height:1000});
 await uiCancel(mAfter);assert.equal((await state()).total_centavos,110000);assert.equal(cpState(after).status,'pendente');
 pass('abertura nao absorve pendencias; conciliacao explicita uma vez e cancelamento recompõe saldo');
 phase='concorrencia e auditoria';
 const bank=(await state()).contas.find(c=>c.codigo==='banco').id;
 const op=id(),p=payment(race,{conta_id:bank,data_efetiva:'2001-06-06'}),both=await Promise.all([send(p,op),send(p,op)]);assert.ok(both.every(r=>r.ok),'dois reenvios concorrentes confirmados');assert.deepEqual(both[0].data,both[1].data);
 assert.equal((await state()).movimentos.filter(m=>m.conta_pagar_id===race).length,1);
 const audit=json(`select json_build_object('operacoes',(select count(*) from caixa_operacoes where company_id='${company}'),'autores_corretos',(select bool_and(usuario_id='${actors.admin.id}') from caixa_operacoes where company_id='${company}'),'conciliacoes_autor',(select bool_and(conciliado_por='${actors.admin.id}' and conciliado_em is not null) from caixa_movimentos where company_id='${company}' and conciliado_por is not null));`);
 assert.ok(audit.operacoes>0&&audit.autores_corretos&&audit.conciliacoes_autor);
 assert.deepEqual(fingerprint(),baseline);assert.equal(unexpectedWrites.length,0,'Rotas POST nao autorizadas: '+[...new Set(unexpectedWrites)].join(', '));assert.equal(forbidden.length,0,'Origens externas bloqueadas: '+[...new Set(forbidden)].join(', '));
 pass('concorrencia, autoria e preservacao integral dos dados anteriores/custos/folha/estoque');
 phase='limpeza';await context.close();context=null;await browser.close();browser=null;await cleanup();
 assert.deepEqual(fingerprint(),baseline);pass('sessoes descartadas e contas sinteticas desativadas');
 const report={date:new Date().toISOString(),run,qa:MARKER,api:API,ui:UI,checks,authenticated:true,realGoTrue:true,realPostgREST:true,realBrowser:true,productionTouched:false,privateCredentialsRead:false,secretsPersisted:false,cleanupDone,fixtures:{company,other},screenshots:['pagamento-auth-formulario.png','pagamento-auth-conciliacao.png','pagamento-auth-mobile.png']};
 fs.writeFileSync(path.join(OUT,'pagamento-auth-result.json'),JSON.stringify(report,null,2));console.log('RESULTADO '+checks.length+'/'+checks.length+' etapas aprovadas; segredos somente em memoria.');
})().catch(async e=>{
 let safe=String(e.message||'').split('\n')[0];
 const location=String(e.stack||'').match(/caixa-pagamento-sem-abertura-auth-local\.cjs:\d+:\d+/)?.[0]||'';
 for(const a of Object.values(actors))for(const secret of [a.password,a.token])if(secret)safe=safe.split(secret).join('[segredo omitido]');
 if(context)await context.close().catch(()=>{});if(browser)await browser.close().catch(()=>{});
 try{await cleanup();}catch{console.error('LIMPEZA_QA_PENDENTE: somente identidades sinteticas run='+run);}
 // Nao registrar objetos de erro Playwright/HTTP: podem carregar argumentos privados.
 safe=safe.replace(/qa-pay-[^\s@]+@example\.test/g,'[usuario sintetico]').replace(/eyJ[A-Za-z0-9_.-]+/g,'[token omitido]');
 console.error('FALHOU etapa='+phase+'; '+safe.slice(0,700)+'; '+location);
 fs.writeFileSync(path.join(OUT,'pagamento-auth-failure.json'),JSON.stringify({run,phase,checks,cleanupDone,error:safe.slice(0,700),location},null,2));process.exitCode=1;
});
