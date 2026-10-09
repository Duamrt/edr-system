'use strict';
// GoTrue/JWT/PostgREST reais na stack LOCAL nova; nenhuma simulação de auth.uid().
// O teste só executa depois de autorização humana registrada pelo coordenador.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { LocalSupabase, configFromEnvironment, AUTHORIZED, TABLES } = require('./fixtures/entrada-plano-auth-local-runtime.cjs');
const id = () => crypto.randomUUID(); // IDs novos por ensaio; nenhuma fixture anterior é apagada.
const company = id(9101), other = id(9102), obra = id(9110), legacyObra = id(9111), otherObra = id(9112), legacyRepasse = id(9120);
const row = id(9130), legacyRow = id(9131), otherRow = id(9132);
const literal = v => "'" + String(v).replaceAll("'", "''") + "'";
const PLAN_TABLES = ['entrada_planos', 'entrada_plano_parcelas', 'entrada_plano_propostas', 'entrada_plano_recebimentos', 'entrada_plano_historico', 'entrada_plano_operacoes'];
function success(r, label) { assert.equal(r.ok, true, `${label}: HTTP ${r.status}, código ${r.code || 'omitido'}`); return r.body; }
function denied(r, statuses, codes, label) { assert.equal(statuses.includes(r.status), true, `${label}: HTTP ${r.status}`); if (codes) assert.equal(codes.includes(r.code), true, `${label}: código ${r.code || 'omitido'}`); }
if (process.env.EDR_ENTRADA_AUTH_LOCAL_RUN !== AUTHORIZED) {
  test('plano: Auth real GoTrue/PostgREST LOCAL', { skip: 'Execução/credenciais LOCAL ainda não autorizadas; apenas código preparado.' }, () => {});
} else {
  test('plano: GoTrue + PostgREST reais, RLS e concorrência HTTP na stack LOCAL dedicada', { timeout: 240000 }, async t => {
    assert.equal(['DEBUG','PWDEBUG','NODE_DEBUG'].some(k=>!!process.env[k]),false,'Desative debug/trace para preservar credenciais locais.');
    const local = new LocalSupabase(configFromEnvironment()); t.after(() => local.dispose()); local.marker();
    assert.equal(local.sql(`select count(*) from public.entrada_planos where company_id='${company}';`), '0', 'Exige tenant de ensaio novo; não sobrescreve execução anterior.');
    assert.equal(local.sql(`select count(*) from public.caixa_contas where company_id='${company}';`), '0', 'Exige Caixa LOCAL novo deste tenant.');
    const actors = {}, run = crypto.randomBytes(6).toString('hex');
    let bank, bankB, entryOperation, entryPedido, entryResult, originalReceipt;
    const state = async (who = 'duam', work = obra) => success(await local.rpc('entrada_plano_estado', actors[who].token, { p_obra_id: work }), 'Estado plano LOCAL');
    const cash = async (who = 'duam') => success(await local.rpc('caixa_estado', actors[who].token), 'Estado Caixa LOCAL');
    const operate = async (who, pedido, op = crypto.randomUUID(), work = obra) => success(await local.rpc('entrada_plano_operar', actors[who].token,
      { p_operacao: op, p_obra_id: work, p_pedido: pedido }), 'Operação plano LOCAL');
    const revisionPedido = async (who, extra, work = obra) => ({ revisao: (await state(who, work)).plano.revisao, motivo: 'Ensaio sintético LOCAL autorizado', ...extra });
    const action = async (who, extra, work = obra) => operate(who, await revisionPedido(who, extra, work), crypto.randomUUID(), work);
    const proposal = async (who = 'elyda', work = obra, rows = [{ id: row, label: 'Entrada sintética QA', base: 10000, mode: 'percent', rate: 1500, final: 10000, due: '2001-07-10', method: 'Pix' }], delivery = '2002-01-01') => action(who, { tipo: 'solicitar', rows, delivery }, work);
    const decision = async (who = 'duam', work = obra, value = 'approved', proposalId) => {
      const s = await state(who, work), p = proposalId || s.requests.find(q => q.status === 'pending')?.id;
      return action(who, { tipo: 'decidir', proposta_id: p, decisao: value }, work);
    };
    const payment = async (amount, extra = {}, who = 'duam') => action(who, { tipo: 'receber', row_id: row, amount, date: '2001-06-06', method: 'Pix', conta_id: bank, hora_efetiva: null, decisao_corte: null, ...extra });
    const counts = () => local.json(`select jsonb_build_object('receipts',(select count(*) from public.entrada_plano_recebimentos where obra_id='${obra}'), 'repasses',(select count(*) from public.repasses_cef where obra_id='${obra}'), 'cash',(select count(*) from public.caixa_movimentos where company_id='${company}'));`);
    const sentinels = () => local.json(`select jsonb_build_object('original',(select contrato_entrada from public.obras where id='${obra}'),
      'manual',(select saldo_manual from public.companies where id='${company}'),'custos',(select sum(total) from public.lancamentos),
      'folha',(select status from public.diarias_quinzenas where id=1),'estoque',(select qtd from public.distribuicoes where id=1));`);
    await t.test('identidades sintéticas e JWTs são emitidos/validados somente pelo GoTrue LOCAL', async () => {
      for (const name of ['elyda', 'duam', 'terceiro', 'operacional', 'mestre', 'visitante', 'semEmpresa', 'inativoFalse', 'inativoNull', 'otherDuam', 'otherElyda']) {
        const email = `qa-edr-entrada-${run}-${name.toLowerCase()}@example.test`, password = crypto.randomBytes(32).toString('base64url') + 'A1!';
        const created = success(await local.request('/auth/v1/admin/users', { admin: true, method: 'POST', body: { email, password, email_confirm: true,
          user_metadata: { nome: 'QA ' + name, edr_entrada_sintetico: true, role: 'admin', perfil: 'admin' } } }), 'Criar identidade GoTrue LOCAL');
        assert.equal(typeof created.id, 'string', 'Auth retorna UUID');
        const session = success(await local.request('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } }), 'Login real LOCAL');
        assert.equal(typeof session.access_token, 'string', 'Auth emite token'); assert.equal(session.token_type, 'bearer');
        const me = success(await local.request('/auth/v1/user', { token: session.access_token }), 'Verificar JWT real LOCAL');
        assert.equal(me.id, created.id); actors[name] = { id: created.id, token: session.access_token };
      }
      const members = [['elyda', company, 'admin'], ['duam', company, 'admin'], ['terceiro', company, 'admin'], ['operacional', company, 'operacional'],
        ['mestre', company, 'mestre'], ['visitante', company, 'visitante'], ['inativoFalse', company, 'admin'], ['inativoNull', company, 'admin'], ['otherDuam', other, 'admin'], ['otherElyda', other, 'admin']];
      local.sql(`begin;
        insert into public.companies(id,owner_id,name,slug,saldo_manual) values('${company}','${actors.duam.id}','Empresa QA entrada A','entrada-qa-a-${run}',123.45),('${other}','${actors.otherDuam.id}','Empresa QA entrada B','entrada-qa-b-${run}',678.90);
        insert into public.company_users(user_id,company_id,role,active,nome,email,senha_inicial,permissions) values ${members.map(([n,c,r]) => `('${actors[n].id}','${c}','${r}',true,'QA ${n}','${n}@example.test','SENTINELA_PRIVADA_NAO_EXIBIR','{"flag_privada_qa":"NAO_EXIBIR"}')`).join(',')};
        update public.company_users set active=false where user_id='${actors.inativoFalse.id}'; update public.company_users set active=null where user_id='${actors.inativoNull.id}';
        insert into public.obras(id,company_id,nome,contrato_entrada,valor_venda,data_entrega) values('${obra}','${company}','Casa QA entrada',100,1000,null),('${legacyObra}','${company}','Casa QA legado',50,500,null),('${otherObra}','${other}','Casa QA outro tenant',100,1000,null);
        insert into public.repasses_cef(id,company_id,obra_id,tipo,valor,data_credito) values('${legacyRepasse}','${company}','${legacyObra}','entrada',50,'2001-06-04');
        insert into public.entrada_plano_responsaveis(company_id,solicitante_id,aprovador_id) values('${company}','${actors.elyda.id}','${actors.duam.id}'),('${other}','${actors.otherElyda.id}','${actors.otherDuam.id}'); commit;`);
    });
    const before = sentinels();
    await t.test('sem sessão, anon, JWT inválido e assinatura adulterada são negados sem escrita', async () => {
      for (const name of ['entrada_plano_estado', 'entrada_plano_operar', 'entrada_plano_resumo', 'entrada_plano_avisos']) {
        const body = name === 'entrada_plano_estado' ? { p_obra_id: obra } : name === 'entrada_plano_operar' ? { p_obra_id: obra, p_operacao: crypto.randomUUID(), p_pedido: { tipo: 'solicitar' } } : name === 'entrada_plano_avisos' ? { p_referencia: '2001-07-07' } : {};
        denied(await local.request('/rest/v1/rpc/' + name, { noKey: true, method: 'POST', body }), [401,403], null, 'Sem chave/sessão');
        denied(await local.request('/rest/v1/rpc/' + name, { anonymous: true, method: 'POST', body }), [401,403], ['42501'], 'Anon RPC');
        denied(await local.rpc(name, 'JWT.sintetico.invalido', body), [401], null, 'JWT inválido');
        const parts = actors.duam.token.split('.'), signature = Buffer.from(parts[2], 'base64url'); signature[0] ^= 1;
        denied(await local.rpc(name, [parts[0],parts[1],signature.toString('base64url')].join('.'), body), [401], null, 'Assinatura real adulterada');
      }
      assert.deepEqual(counts(), { receipts: 0, repasses: 0, cash: 0 });
    });
    await t.test('permissões derivam de usuário ativo e tenant; metadados de perfil não autorizam ator', async () => {
      for (const name of ['mestre','visitante','semEmpresa','inativoFalse','inativoNull']) {
        const codes = name === 'semEmpresa' ? ['28000'] : ['42501'];
        denied(await local.rpc('entrada_plano_estado', actors[name].token, { p_obra_id: obra }), [401,403], codes, 'Perfil inválido leitura');
        denied(await local.rpc('entrada_plano_operar', actors[name].token, { p_obra_id: obra,p_operacao:crypto.randomUUID(),p_pedido:{tipo:'solicitar',revisao:0,motivo:'QA bloqueio'} }), [401,403], codes, 'Perfil inválido escrita');
      }
      for (const name of ['terceiro','operacional']) {
        const s = await state(name); assert.deepEqual(s.permissions,{solicitar:false,aprovar:false,receber:false}); assert.deepEqual(s.contas,[]);
        for (const tipo of ['solicitar','decidir','receber','solicitar_estorno']) denied(await local.rpc('entrada_plano_operar', actors[name].token, {p_obra_id:obra,p_operacao:crypto.randomUUID(),p_pedido:{tipo,revisao:0,motivo:'QA identidade não configurada'}}), [403], ['42501'], 'Terceiro/operacional operação');
      }
      denied(await local.rpc('entrada_plano_estado', actors.otherDuam.token, {p_obra_id:obra}), [403], ['42501'], 'Outro tenant obra');
      denied(await local.rpc('entrada_plano_operar', actors.otherDuam.token, {p_obra_id:obra,p_operacao:crypto.randomUUID(),p_pedido:{tipo:'receber',revisao:0,motivo:'QA outro tenant'}}), [403], ['42501'], 'Outro tenant escrita');
      assert.deepEqual(counts(), {receipts:0,repasses:0,cash:0});
    });
    await t.test('abertura por HTTP e solicitação Elyda aguardam decisão Duam sem efeito monetário', async () => {
      const abertura = {action:'abertura',corte_local:'2001-06-05T18:23',fuso:'America/Sao_Paulo',contas:[{codigo:'banco',nome:'Banco QA',saldo_centavos:100000},{codigo:'dinheiro',nome:'Dinheiro QA',saldo_centavos:0}]};
      success(await local.rpc('caixa_registrar', actors.duam.token, {p_operacao:crypto.randomUUID(),p_pedido:abertura}), 'Abertura QA A');
      success(await local.rpc('caixa_registrar', actors.otherDuam.token, {p_operacao:crypto.randomUUID(),p_pedido:abertura}), 'Abertura QA B');
      bank = (await cash()).contas.find(c=>c.codigo==='banco').id; bankB = (await cash('otherDuam')).contas.find(c=>c.codigo==='banco').id;
      const q = await proposal(); assert.equal(q.requests[0].status,'pending'); assert.equal(q.rows.length,0);
      assert.deepEqual(success(await local.rpc('entrada_plano_resumo',actors.duam.token),'Resumo pendente').planos,[]);
      denied(await local.rpc('entrada_plano_operar',actors.elyda.token,{p_operacao:crypto.randomUUID(),p_obra_id:obra,p_pedido:{tipo:'decidir',revisao:q.plano.revisao,motivo:'QA tentativa autoaprovação',proposta_id:q.requests[0].id,decisao:'approved'}}),[403],['42501'],'Autoaprovação');
      const yes = await decision(); assert.equal(yes.plano.stage,'confirmed'); assert.equal(yes.rows[0].total,11500); assert.equal((await cash()).total_centavos,100000); assert.deepEqual(sentinels(),before);
      const text = JSON.stringify(yes); assert.equal(text.includes('SENTINELA_PRIVADA_NAO_EXIBIR'),false); assert.equal(text.includes('flag_privada_qa'),false);
      const reminders = success(await local.rpc('entrada_plano_avisos',actors.duam.token,{p_referencia:'2001-07-07'}),'Avisos fonte QA');
      assert.equal(reminders.automation_active,false); assert.equal(reminders.avisos.length,1); assert.equal(reminders.avisos[0].aviso_em,'2001-07-07');
    });
    await t.test('vínculo do repasse antigo preserva recebimento e não cria Caixa nem segundo repasse', async () => {
      await proposal('elyda',legacyObra,[{id:legacyRow,label:'Entrada legada QA',base:5000,mode:'waived',rate:0,final:5000,due:null,method:'A combinar'}],null); await decision('duam',legacyObra);
      let s = await state('duam',legacyObra); assert.equal(s.totals.received,5000); assert.equal(s.totals.unlinked,5000); const beforeCash=(await cash()).total_centavos;
      const q=await revisionPedido('duam',{tipo:'vincular',row_id:legacyRow,repasse_id:legacyRepasse},legacyObra), op=crypto.randomUUID();
      const x=await operate('duam',q,op,legacyObra); assert.deepEqual(await operate('duam',q,op,legacyObra),x);
      s=await state('duam',legacyObra); assert.equal(s.receipts.length,1); assert.equal(s.receipts[0].linked,true); assert.equal(s.receipts[0].movimento_id,null);
      assert.equal(s.totals.unlinked,0); assert.equal(s.totals.received,5000); assert.equal((await cash()).total_centavos,beforeCash);
      assert.equal(local.sql(`select count(*) from public.repasses_cef where obra_id='${legacyObra}';`),'1');
    });
    await t.test('pagamento antecipado cria 1 repasse + 1 movimento; retries HTTP concorrentes devolvem mesma operação', async () => {
      entryOperation=crypto.randomUUID(); entryPedido=await revisionPedido('duam',{tipo:'receber',row_id:row,amount:2000,date:'2001-06-06',method:'Pix',conta_id:bank,hora_efetiva:null,decisao_corte:null});
      const responses=await Promise.all([0,1].map(()=>local.rpc('entrada_plano_operar',actors.duam.token,{p_operacao:entryOperation,p_obra_id:obra,p_pedido:entryPedido})));
      entryResult=success(responses[0],'HTTP simultâneo 1'); assert.deepEqual(success(responses[1],'HTTP simultâneo 2'),entryResult); assert.deepEqual(await operate('duam',entryPedido,entryOperation),entryResult);
      originalReceipt=entryResult.receipts[0]; assert.equal(originalReceipt.amount,2000); assert.equal(originalReceipt.principal,2000); assert.equal(originalReceipt.cancelled,300);
      assert.equal(originalReceipt.actor,actors.duam.id); assert.equal((await cash()).total_centavos,102000); assert.deepEqual(counts(),{receipts:1,repasses:1,cash:1});
      assert.deepEqual(local.json(`select jsonb_build_object('r',(select count(*) from public.repasses_cef where id='${originalReceipt.repasse_id}' and valor=20 and tipo='entrada'),'m',(select count(*) from public.caixa_movimentos where id='${originalReceipt.movimento_id}' and valor_centavos=2000 and usuario_id='${actors.duam.id}'));`),{r:1,m:1});
      denied(await local.rpc('entrada_plano_operar',actors.duam.token,{p_operacao:entryOperation,p_obra_id:obra,p_pedido:{...entryPedido,amount:2001}}),[400],['P0001'],'UUID com outro payload');
      denied(await local.rpc('entrada_plano_operar',actors.elyda.token,{p_operacao:entryOperation,p_obra_id:obra,p_pedido:entryPedido}),[400],['P0001'],'UUID com outro ator');
      assert.deepEqual(sentinels(),before);
    });
    await t.test('operações HTTP distintas na mesma revisão não duplicam pagamento; exatamente uma confirma', async () => {
      const q=await revisionPedido('duam',{tipo:'receber',row_id:row,amount:1000,date:'2001-06-06',method:'Pix',conta_id:bank,hora_efetiva:null,decisao_corte:null});
      const r=await Promise.all([0,1].map(()=>local.rpc('entrada_plano_operar',actors.duam.token,{p_operacao:crypto.randomUUID(),p_obra_id:obra,p_pedido:q})));
      assert.equal(r.filter(x=>x.ok).length,1); denied(r.find(x=>!x.ok),[500],['40001'],'Revisão concorrente'); assert.deepEqual(counts(),{receipts:2,repasses:2,cash:2});
      assert.equal((await cash()).total_centavos,103000); assert.equal((await state()).rows[0].cancelled,450);
    });
    await t.test('estorno parcial solicitado e aprovado conserva original, adiciona inversos e reabre acréscimo', async () => {
      const q=await action('elyda',{tipo:'solicitar_estorno',receipt_id:originalReceipt.id,amount:1000,date:'2001-06-07',conta_id:bank,hora_efetiva:null,decisao_corte:null});
      assert.equal(q.requests.at(-1).kind,'reversal'); assert.equal((await cash()).total_centavos,103000); await decision();
      const s=await state(), original=s.receipts.find(r=>r.id===originalReceipt.id), inverse=s.receipts.find(r=>r.reverses===originalReceipt.id);
      assert.deepEqual({...original,available:originalReceipt.available},originalReceipt); assert.equal(original.available,1000);
      assert.equal(inverse.amount,-1000); assert.equal(inverse.principal,-1000); assert.equal(inverse.cancelled,-150); assert.equal(inverse.actor,actors.duam.id);
      assert.equal(s.rows[0].received,2000); assert.equal(s.rows[0].cancelled,300); assert.equal((await cash()).total_centavos,102000);
      assert.deepEqual(counts(),{receipts:3,repasses:3,cash:3}); assert.deepEqual(sentinels(),before);
    });
    await t.test('termos obsoletos não aprovam após pagamento; rejeição mantém plano e IDs vigentes', async () => {
      const current=(await state()).rows[0], pending=await proposal('elyda',obra,[{id:row,label:current.label,base:10000,mode:'percent',rate:2000,final:10000,due:'2001-07-10',method:'Pix'}]);
      await payment(1000); const s=await state();
      denied(await local.rpc('entrada_plano_operar',actors.duam.token,{p_operacao:crypto.randomUUID(),p_obra_id:obra,p_pedido:{tipo:'decidir',revisao:s.plano.revisao,motivo:'QA revisão obsoleta',proposta_id:pending.requests.at(-1).id,decisao:'approved'}}),[500],['40001'],'Aprovação obsoleta');
      const rejected=await decision('duam',obra,'rejected'); assert.equal(rejected.rows[0].rate,1500); assert.equal(rejected.rows[0].id,row); assert.equal(rejected.requests.at(-1).status,'rejected');
    });
    await t.test('bypass de repasse/contrato/Caixa é bloqueado; entrega real permanece independente do plano', async () => {
      const initial=counts();
      for(const [method,route,body] of [['PATCH',`/rest/v1/repasses_cef?id=eq.${originalReceipt.repasse_id}`,{valor:1}],['DELETE',`/rest/v1/repasses_cef?id=eq.${originalReceipt.repasse_id}`,undefined],['PATCH',`/rest/v1/obras?id=eq.${obra}`,{contrato_entrada:999}]]) denied(await local.request(route,{token:actors.duam.token,method,body}),[403],['42501'],'REST guard financeiro');
      denied(await local.rpc('caixa_registrar',actors.duam.token,{p_operacao:crypto.randomUUID(),p_pedido:{action:'cancelar',movimento_id:originalReceipt.movimento_id,motivo:'QA preservação de original'}}),[403],['42501'],'Cancelamento Caixa vinculado');
      denied(await local.request('/rest/v1/repasses_cef',{token:actors.duam.token,method:'POST',body:{company_id:company,obra_id:obra,tipo:'entrada',valor:1,data_credito:'2001-06-06',medicao_numero:0}}),[403],['42501'],'Entrada fora da operação atômica');
      success(await local.request('/rest/v1/obras?id=eq.'+obra,{token:actors.duam.token,method:'PATCH',body:{data_entrega:'2001-06-06'}}),'Entrega real independente LOCAL');
      assert.equal(local.sql(`select data_entrega from public.obras where id='${obra}';`),'2001-06-06');
      assert.equal((await state()).plano.delivery,'2002-01-01','Previsão financeira do plano não usa entrega real do Termo');
      assert.deepEqual(counts(),initial); assert.deepEqual(sentinels(),before);
    });
    await t.test('RLS separa tenants e operação só é legível pelo autor; configuração privada não é exposta', async () => {
      await proposal('otherElyda',otherObra,[{id:otherRow,label:'Entrada outro tenant QA',base:10000,mode:'waived',rate:0,final:10000,due:null,method:'Pix'}],null); await decision('otherDuam',otherObra);
      await action('otherDuam',{tipo:'receber',row_id:otherRow,amount:100,date:'2001-06-06',method:'Pix',conta_id:bankB,hora_efetiva:null,decisao_corte:null},otherObra);
      for(const [who,c] of [['duam',company],['otherDuam',other]]) for(const table of PLAN_TABLES){
        const rows=success(await local.request('/rest/v1/'+table+'?select=company_id',{token:actors[who].token}),'SELECT RLS'); assert.equal(rows.length>0,true); assert.equal(rows.every(r=>r.company_id===c),true);
        assert.deepEqual(success(await local.request('/rest/v1/'+table+'?company_id=eq.'+(c===company?other:company)+'&select=company_id',{token:actors[who].token}),'Filtro outro tenant'),[]);
      }
      assert.deepEqual(success(await local.request('/rest/v1/entrada_plano_operacoes?id=eq.'+entryOperation+'&select=company_id',{token:actors.elyda.token}),'Operação de outro autor'),[]);
      for(const who of ['elyda','duam','terceiro','operacional']) denied(await local.request('/rest/v1/entrada_plano_responsaveis?select=*',{token:actors[who].token}),[401,403],['42501'],'Configuração privada');
      for(const who of ['mestre','visitante','semEmpresa','inativoFalse','inativoNull']) for(const table of PLAN_TABLES) assert.deepEqual(success(await local.request('/rest/v1/'+table+'?select=company_id',{token:actors[who].token}),'Perfil sem leitura RLS'),[]);
      const serialized=JSON.stringify(await state()); assert.equal(serialized.includes('SENTINELA_PRIVADA_NAO_EXIBIR'),false); assert.equal(serialized.includes('flag_privada_qa'),false);
    });
    await t.test('DML e auxiliares privadas são negados para cliente autenticado/anon', async () => {
      const initial=counts();
      for(const table of ['entrada_plano_responsaveis',...PLAN_TABLES]) for(const [method,body] of [['POST',{company_id:company}],['PATCH',{company_id:company}],['DELETE',undefined]]) denied(await local.request('/rest/v1/'+table+(method==='POST'?'':'?company_id=eq.'+company),{token:actors.duam.token,method,body}),[401,403],['42501'],'DML de tabela restrita');
      for(const table of ['entrada_plano_responsaveis',...PLAN_TABLES]) denied(await local.request('/rest/v1/'+table+'?select=company_id',{anonymous:true}),[401,403],['42501'],'Anon SELECT');
      denied(await local.request('/rest/v1/rpc/entrada_plano_cotar',{token:actors.duam.token,method:'POST',body:{p_row_id:row,p_amount:1,p_date:'2001-06-06'}}),[400,401,403,404],['42501','PGRST202'],'Auxiliar privada');
      assert.deepEqual(counts(),initial);
    });
    await t.test('JWT ainda vivo perde autorização após desativação, inclusive retry, e recupera ao reativar', async () => {
      const initial=counts(); local.sql(`update public.company_users set active=false where user_id='${actors.duam.id}';`);
      denied(await local.rpc('entrada_plano_estado',actors.duam.token,{p_obra_id:obra}),[403],['42501'],'Desativado leitura');
      denied(await local.rpc('entrada_plano_operar',actors.duam.token,{p_operacao:entryOperation,p_obra_id:obra,p_pedido:entryPedido}),[403],['42501'],'Desativado retry');
      for(const table of PLAN_TABLES) assert.deepEqual(success(await local.request('/rest/v1/'+table+'?select=company_id',{token:actors.duam.token}),'Desativado RLS'),[]);
      assert.deepEqual(counts(),initial); local.sql(`update public.company_users set active=true where user_id='${actors.duam.id}';`);
      assert.deepEqual(await operate('duam',entryPedido,entryOperation),entryResult); assert.deepEqual(counts(),initial);
    });
    await t.test('catálogo confirma RLS, owner/search_path, grants mínimos e auth.uid real da stack', async () => {
      const names=['entrada_plano_estado','entrada_plano_operar','entrada_plano_resumo','entrada_plano_avisos'];
      const catalog=local.json(`select jsonb_build_object('rls',(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in (${['entrada_plano_responsaveis',...PLAN_TABLES].map(literal).join(',')}) and c.relrowsecurity),
        'client_dml',(select count(*) from unnest(array[${['entrada_plano_responsaveis',...PLAN_TABLES].map(literal).join(',')}]) t cross join unnest(array['anon','authenticated']) r where has_table_privilege(r,'public.'||t,'INSERT,UPDATE,DELETE,TRUNCATE')),
        'private_config',has_table_privilege('authenticated','public.entrada_plano_responsaveis','SELECT'),
        'rpc_owner',(select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles r on r.oid=p.proowner where n.nspname='public' and p.proname in (${names.map(literal).join(',')}) and p.prosecdef and r.rolname='postgres' and p.proconfig @> array['search_path=pg_catalog, public']),
        'anon_rpc',(select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in (${names.map(literal).join(',')}) and has_function_privilege('anon',p.oid,'EXECUTE')),
        'public_rpc',(select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join lateral aclexplode(p.proacl) a where n.nspname='public' and p.proname in (${names.map(literal).join(',')}) and a.grantee=0),
        'auth_uid_source',(select pg_get_functiondef('auth.uid()'::regprocedure) not like '%request.jwt.claim.sub%' or pg_get_functiondef('auth.uid()'::regprocedure) like '%request.jwt.claims%'),
        'synthetic_auth',(select count(*) from auth.users where raw_user_meta_data->>'edr_entrada_sintetico'='true' and id in (${Object.values(actors).map(a=>literal(a.id)).join(',')})));`);
      assert.deepEqual(catalog,{rls:7,client_dml:0,private_config:false,rpc_owner:4,anon_rpc:0,public_rpc:0,auth_uid_source:true,synthetic_auth:11});
      assert.deepEqual(sentinels(),before); assert.equal((await state()).reminders.configured,false);
    });

    await t.test('JWT vivo rebaixado perde SELECT/replay de Caixa; troca de responsavel revoga acao atual sem duplicar dinheiro', async () => {
      const initial=counts();
      try {
        local.sql('update public.company_users set role=\'operacional\' where user_id='+literal(actors.duam.id)+';');
        success(await local.request('/auth/v1/user',{token:actors.duam.token}),'JWT continua autentico LOCAL apos downgrade');
        const s=await state();assert.deepEqual(s.contas,[]);assert.deepEqual(s.permissions,{solicitar:false,aprovar:false,receber:false});
        assert.deepEqual(success(await local.request('/rest/v1/entrada_plano_operacoes?id=eq.'+entryOperation+'&select=resultado',{token:actors.duam.token}),'SELECT revogado por papel atual'),[]);
        denied(await local.rpc('entrada_plano_operar',actors.duam.token,{p_operacao:entryOperation,p_obra_id:obra,p_pedido:entryPedido}),[403],['42501'],'Downgrade retry revogado');
        denied(await local.rpc('entrada_plano_operar',actors.duam.token,{p_operacao:crypto.randomUUID(),p_obra_id:obra,p_pedido:{...entryPedido,revisao:s.plano.revisao}}),[403],['42501'],'Downgrade nova mutacao revogada');
        assert.deepEqual(counts(),initial);
        local.sql('update public.company_users set role=\'admin\' where user_id='+literal(actors.duam.id)+';');
        assert.deepEqual(await operate('duam',entryPedido,entryOperation),entryResult);
        local.sql('update public.entrada_plano_responsaveis set aprovador_id='+literal(actors.terceiro.id)+' where company_id='+literal(company)+';');
        const history=success(await local.request('/rest/v1/entrada_plano_operacoes?id=eq.'+entryOperation+'&select=company_id',{token:actors.duam.token}),'Admin autor conserva historico proprio');
        assert.equal(history.length,1);assert.deepEqual((await state()).contas,[]);
        denied(await local.rpc('entrada_plano_operar',actors.duam.token,{p_operacao:entryOperation,p_obra_id:obra,p_pedido:entryPedido}),[403],['42501'],'Configuracao atual revoga replay');
        assert.deepEqual(counts(),initial);
      } finally {
        local.sql('update public.company_users set role=\'admin\',active=true where user_id='+literal(actors.duam.id)+'; update public.entrada_plano_responsaveis set aprovador_id='+literal(actors.duam.id)+' where company_id='+literal(company)+';');
      }
      assert.deepEqual(await operate('duam',entryPedido,entryOperation),entryResult);assert.deepEqual(counts(),initial);
    });

    t.diagnostic('Somente stack/dados/identidades sintéticos LOCAL. JWTs/senhas/chaves omitidos. UI autenticada não é exercitada por este teste HTTP. Stack preservada.');
  });
}