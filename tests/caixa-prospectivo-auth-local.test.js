'use strict';
// Homologacao LOCAL: GoTrue emite JWT; PostgREST verifica JWT e aplica RLS.
// Nunca imprime senhas/JWT/chaves ou aceita um host remoto. Nao e mock Auth.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { LocalSupabase, configFromEnvironment } = require('./fixtures/caixa-supabase-local-runtime.cjs');
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const companyA = id(1), companyB = id(2), cpA = id(10), cpB = id(11), cpPaid = id(12), cpAvulsa = id(13), obra = id(14);
const TABLES = ['caixa_operacoes', 'caixa_contas', 'caixa_obrigacoes', 'caixa_movimentos'];
const literal = value => "'" + String(value).replaceAll("'", "''") + "'";
function success(response, label) {
  assert.equal(response.ok, true, `${label}: HTTP ${response.status}, codigo ${response.code || 'omitido'}`);
  return response.body;
}
function denied(response, statuses, code, label) {
  assert.equal(statuses.includes(response.status), true, `${label}: HTTP ${response.status}`);
  if (code) assert.equal(response.code, code, `${label}: codigo esperado`);
}
if (!process.env.EDR_CAIXA_AUTH_LOCAL_STATUS) {
  test('caixa: Auth real Supabase LOCAL', { skip: 'Stack LOCAL/status privado nao informados; Auth real NAO homologado.' }, () => {});
} else {
  test('caixa: GoTrue + PostgREST reais na stack LOCAL isolada', { timeout: 240000 }, async t => {
    const local = new LocalSupabase(configFromEnvironment());
    t.after(() => local.dispose());
    local.marker();
    const pgVersion = local.sql('show server_version;');
    assert.equal(/^[0-9.]+(?:[ -][A-Za-z0-9(). +_-]+)?$/.test(pgVersion), true, 'Versao PostgreSQL publica reconhecida');
    t.diagnostic('PostgreSQL LOCAL ' + pgVersion + '; GoTrue/PostgREST reais; endpoints fixados em loopback.');
    assert.equal(local.sql('select count(*) from public.caixa_contas;'), '0', 'Ensaio exige Caixa local novo; nao sobrescreve dados.');
    const actors = {};
    const run = crypto.randomBytes(6).toString('hex');
    await t.test('oito identidades sinteticas criadas e autenticadas pelo GoTrue real', async () => {
      for (const name of ['adminA', 'adminB', 'operacional', 'mestre', 'visitante', 'semEmpresa', 'inativoFalse', 'inativoNull']) {
        const email = `qa-edr-caixa-${run}-${name.toLowerCase()}@example.test`;
        const password = crypto.randomBytes(32).toString('base64url') + 'A1!';
        const created = success(await local.request('/auth/v1/admin/users', { admin: true, method: 'POST',
          body: { email, password, email_confirm: true, user_metadata: { nome: 'QA ' + name, edr_caixa_sintetico: true } } }), 'Criacao Auth LOCAL');
        assert.equal(typeof created.id, 'string', 'Auth retorna identidade');
        const session = success(await local.request('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } }), 'Login Auth LOCAL');
        assert.equal(typeof session.access_token, 'string', 'Auth emite JWT');
        assert.equal(session.token_type, 'bearer');
        const me = success(await local.request('/auth/v1/user', { token: session.access_token }), 'Validacao sessao Auth');
        assert.equal(me.id, created.id);
        actors[name] = { id: created.id, token: session.access_token };
      }
      const memberships = [['adminA', companyA, 'admin'], ['adminB', companyB, 'admin'],
        ['operacional', companyA, 'operacional'], ['mestre', companyA, 'mestre'], ['visitante', companyA, 'visitante'],
        ['inativoFalse', companyA, 'admin'], ['inativoNull', companyA, 'admin']];
      local.sql(`begin;
        insert into public.companies(id,owner_id,name,slug,saldo_manual) values
          ('${companyA}','${actors.adminA.id}','Empresa QA A','qa-a-${run}',123.45),
          ('${companyB}','${actors.adminB.id}','Empresa QA B','qa-b-${run}',678.90);
        insert into public.company_users(user_id,company_id,role,active,nome) values
          ${memberships.map(([name, company, role]) => `('${actors[name].id}','${company}','${role}',true,'QA ${name}')`).join(',')};
        insert into public.obras(id,company_id) values('${obra}','${companyA}');
        insert into public.contas_pagar(id,company_id,fornecedor,descricao,valor,data_vencimento,status,tipo,data_pagamento,obra_id) values
          ('${cpA}','${companyA}','Fornecedor QA','Obrigacao antiga A',100,'2001-06-01','pendente','despesa',null,null),
          ('${cpB}','${companyB}','Fornecedor QA','Obrigacao antiga B',100,'2001-06-01','pendente','despesa',null,null),
          ('${cpPaid}','${companyA}','Fornecedor QA','Ja paga antes da abertura',80,'2001-06-01','pago','despesa','2001-06-04',null),
          ('${cpAvulsa}','${companyA}','Fornecedor QA','Avulsa vinculada a obra',50,'2001-06-01','pendente','despesa',null,'${obra}');
        update public.company_users set active=false where user_id='${actors.inativoFalse.id}';
        update public.company_users set active=null where user_id='${actors.inativoNull.id}';
        commit;`);
    });
    const tokenA = actors.adminA.token, tokenB = actors.adminB.token;
    const state = async token => success(await local.rpc('caixa_estado', token), 'Estado Caixa LOCAL');
    const send = async (token, pedido, operation = crypto.randomUUID()) =>
      success(await local.rpc('caixa_registrar', token, { p_operacao: operation, p_pedido: pedido }), 'Registro Caixa LOCAL');
    const failure = async (token, pedido, operation = crypto.randomUUID()) =>
      denied(await local.rpc('caixa_registrar', token, { p_operacao: operation, p_pedido: pedido }), [400], 'P0001', 'Regra financeira');
    const opening = (bank = 100000, cash = 20000) => ({ action: 'abertura', corte_local: '2001-06-05T18:23', fuso: 'America/Sao_Paulo',
      contas: [{ codigo: 'banco', nome: 'Banco QA', saldo_centavos: bank }, { codigo: 'dinheiro', nome: 'Dinheiro QA', saldo_centavos: cash }] });
    const counts = () => local.json(`select jsonb_build_object(${TABLES.map(table => `${literal(table)},(select count(*) from public.${table})`).join(',')});`);
    const sentinel = () => local.json(`select jsonb_build_object(
      'manual',(select jsonb_agg(jsonb_build_array(id,saldo_manual) order by id) from public.companies),
      'custos',(select jsonb_agg(to_jsonb(l) order by id) from public.lancamentos l),
      'folha',(select jsonb_agg(to_jsonb(q) order by id) from public.diarias_quinzenas q),
      'estoque',(select jsonb_agg(to_jsonb(d) order by id) from public.distribuicoes d),
      'ja_paga',(select jsonb_build_array(status,data_pagamento,valor) from public.contas_pagar where id='${cpPaid}'));`);
    const before = sentinel();
    let receiptA, entryReceipt, entryRequest, entryOperation;
    await t.test('sem sessao, anon sem grants, JWT invalido e login incorreto sao negados', async () => {
      for (const name of ['caixa_estado', 'caixa_registrar']) {
        const body = name === 'caixa_estado' ? {} : { p_operacao: crypto.randomUUID(), p_pedido: opening() };
        denied(await local.request('/rest/v1/rpc/' + name, { noKey: true, method: 'POST', body }), [401, 403], null, 'Sem chave/sessao');
        denied(await local.request('/rest/v1/rpc/' + name, { method: 'POST', body }), [401, 403], '42501', 'Chave anon sem JWT de sessao');
        denied(await local.request('/rest/v1/rpc/' + name, { anonymous: true, method: 'POST', body }), [401, 403], '42501', 'Anon RPC');
        denied(await local.rpc(name, 'JWT.sintetico.invalido', body), [401], null, 'JWT invalido');
        const jwtParts = tokenA.split('.');
        assert.equal(jwtParts.length, 3, 'JWT emitido tem formato padrao');
        const signature = Buffer.from(jwtParts[2], 'base64url');
        signature[0] ^= 1;
        const alteredSignature = [jwtParts[0], jwtParts[1], signature.toString('base64url')].join('.');
        denied(await local.rpc(name, alteredSignature, body), [401], null, 'JWT real com assinatura adulterada');
      }
      for (const table of TABLES)
        denied(await local.request('/rest/v1/' + table + '?select=company_id', { anonymous: true }), [401, 403], '42501', 'Anon SELECT');
      denied(await local.request('/auth/v1/token?grant_type=password', { method: 'POST',
        body: { email: `qa-edr-caixa-${run}-admina@example.test`, password: 'Senha-incorreta-QA' } }), [400, 401], null, 'Senha incorreta');
      assert.deepEqual(counts(), { caixa_operacoes: 0, caixa_contas: 0, caixa_obrigacoes: 0, caixa_movimentos: 0 });
    });
    await t.test('operacional, mestre, visitante, sem empresa e admins false/null nao acessam RPCs', async () => {
      for (const name of ['operacional', 'mestre', 'visitante', 'semEmpresa', 'inativoFalse', 'inativoNull']) {
        const actor = actors[name];
        const expected = name === 'semEmpresa' ? '28000' : '42501';
        denied(await local.rpc('caixa_estado', actor.token), [401, 403], expected, name + ' leitura');
        denied(await local.rpc('caixa_registrar', actor.token, { p_operacao: crypto.randomUUID(), p_pedido: opening() }), [401, 403], expected, name + ' escrita');
      }
      assert.equal(local.sql('select count(*) from public.caixa_operacoes;'), '0');
    });
    await t.test('aberturas imutaveis por tenant e retry real sem duplicar', async () => {
      const operation = crypto.randomUUID(), pedido = opening();
      receiptA = await send(tokenA, pedido, operation);
      assert.equal(receiptA.company_id, companyA);
      assert.deepEqual(await send(tokenA, pedido, operation), receiptA);
      await failure(tokenA, { ...pedido, corte_local: '2001-06-05T18:24' }, operation);
      await failure(tokenA, pedido);
      await send(tokenB, opening(300000, 40000));
      assert.equal((await state(tokenA)).total_centavos, 120000);
      assert.equal((await state(tokenB)).total_centavos, 340000);
      assert.deepEqual(sentinel(), before);
    });
    let bankA, cashA, bankB;
    await t.test('corte efetivo e dia sem horario exigem classificacao explicita', async () => {
      const a = await state(tokenA), b = await state(tokenB);
      bankA = a.contas.find(c => c.codigo === 'banco').id;
      cashA = a.contas.find(c => c.codigo === 'dinheiro').id;
      bankB = b.contas.find(c => c.codigo === 'banco').id;
      const move = extra => ({ action: 'movimento', tipo: 'saida', conta_id: bankA, destino_id: null, valor_centavos: 10,
        data_efetiva: '2001-06-06', hora_efetiva: null, decisao_corte: null, descricao: 'Comprovante sintetico QA', conta_pagar_id: null, ...extra });
      for (const extra of [{ data_efetiva: '2001-06-04' }, { data_efetiva: '2001-06-05', hora_efetiva: '18:23' },
        { data_efetiva: '2001-06-05', decisao_corte: 'incluido_abertura' }]) await send(tokenA, move(extra));
      assert.equal((await state(tokenA)).total_centavos, 120000);
      const beforeFailure = counts();
      await failure(tokenA, move({ data_efetiva: '2001-06-05' }));
      await failure(tokenA, move({ data_efetiva: '2001-06-04', decisao_corte: 'apos_corte' }));
      await failure(tokenA, move({ data_efetiva: '2999-01-01' }));
      assert.deepEqual(counts(), beforeFailure);
      await send(tokenA, move({ data_efetiva: '2001-06-05', decisao_corte: 'apos_corte', valor_centavos: 1000 }));
      assert.equal((await state(tokenA)).total_centavos, 119000);
    });
    const moveA = extra => ({ action: 'movimento', tipo: 'entrada', conta_id: bankA, destino_id: null, valor_centavos: 2500,
      data_efetiva: '2001-06-06', hora_efetiva: null, decisao_corte: null, descricao: 'Comprovante sintetico QA', conta_pagar_id: null, ...extra });
    await t.test('entrada, saida, transferencia e cancelamento por API alteram saldo uma vez', async () => {
      entryOperation = crypto.randomUUID(); entryRequest = moveA({});
      const submissions = await Promise.all([0, 1].map(() => local.rpc('caixa_registrar', tokenA,
        { p_operacao: entryOperation, p_pedido: entryRequest })));
      entryReceipt = success(submissions[0], 'Pedido HTTP simultaneo 1');
      assert.deepEqual(success(submissions[1], 'Pedido HTTP simultaneo 2'), entryReceipt);
      assert.deepEqual(await send(tokenA, entryRequest, entryOperation), entryReceipt);
      await failure(tokenA, { ...entryRequest, valor_centavos: 2501 }, entryOperation);
      assert.equal((await state(tokenA)).total_centavos, 121500);
      await send(tokenA, moveA({ tipo: 'saida', valor_centavos: 500 }));
      const transfer = await send(tokenA, moveA({ tipo: 'transferencia', destino_id: cashA, valor_centavos: 2000 }));
      let s = await state(tokenA);
      assert.equal(s.total_centavos, 121000);
      assert.deepEqual(s.contas.map(c => [c.codigo, c.saldo_centavos]), [['banco', 99000], ['dinheiro', 22000]]);
      const cancel = { action: 'cancelar', movimento_id: transfer.movimento_id, motivo: 'Correcao QA preservada' }, operation = crypto.randomUUID();
      const cancelled = await send(tokenA, cancel, operation);
      assert.deepEqual(await send(tokenA, cancel, operation), cancelled);
      s = await state(tokenA);
      assert.deepEqual(s.contas.map(c => [c.codigo, c.saldo_centavos]), [['banco', 101000], ['dinheiro', 20000]]);
      assert.equal(s.movimentos.find(m => m.id === transfer.movimento_id).afeta_saldo, false);
      assert.equal(local.sql(`select count(*) from public.caixa_movimentos where company_id='${companyA}' and operacao_id='${entryOperation}';`), '1');
    });
    await t.test('pagamento parcial/total e cancelamento preservam custo e auditam ator JWT real', async () => {
      const payment = cents => moveA({ tipo: 'pagamento', conta_pagar_id: cpA, valor_centavos: cents });
      const p1 = await send(tokenA, payment(4000));
      let s = await state(tokenA);
      assert.equal(s.total_centavos, 117000);
      assert.equal(s.pagamentos.find(p => p.conta_pagar_id === cpA).restante_centavos, 6000);
      const cp = async () => success(await local.request(`/rest/v1/contas_pagar?id=eq.${cpA}&select=status,data_pagamento`, { token: tokenA }), 'SELECT obrigacao')[0];
      assert.deepEqual(await cp(), { status: 'pendente', data_pagamento: null });
      const initialCounts = counts(); await failure(tokenA, payment(6001)); assert.deepEqual(counts(), initialCounts);
      const p2 = await send(tokenA, payment(6000));
      assert.equal((await state(tokenA)).total_centavos, 111000);
      assert.deepEqual(await cp(), { status: 'pago', data_pagamento: '2001-06-06' });
      const audit = local.json(`select jsonb_build_object('uid',usuario_id,'nome',usuario_nome,'company',company_id,
        'antes',dados_antes->>'status','depois',dados_depois->>'status') from public.audit_logs
        where tabela='contas_pagar' and registro_id='${cpA}' and operacao='UPDATE' and dados_depois->>'status'='pago' limit 1;`);
      assert.deepEqual(audit, { uid: actors.adminA.id, nome: 'QA adminA', company: companyA, antes: 'pendente', depois: 'pago' });
      await send(tokenA, { action: 'cancelar', movimento_id: p1.movimento_id, motivo: 'Parcial QA cancelada' });
      assert.deepEqual(await cp(), { status: 'pendente', data_pagamento: null });
      assert.equal((await state(tokenA)).pagamentos.find(p => p.conta_pagar_id === cpA).restante_centavos, 4000);
      await send(tokenA, { action: 'cancelar', movimento_id: p2.movimento_id, motivo: 'Restante QA cancelado' });
      assert.equal((await state(tokenA)).total_centavos, 121000);
      assert.deepEqual(sentinel(), before);
    });
    await t.test('conta ja paga nao duplica e avulsa exige custo confirmado sem criar custo', async () => {
      await failure(tokenA, moveA({ tipo: 'pagamento', conta_pagar_id: cpPaid, valor_centavos: 1000 }));
      await failure(tokenA, moveA({ tipo: 'pagamento', conta_pagar_id: cpAvulsa, valor_centavos: 1000 }));
      const paid = await send(tokenA, moveA({ tipo: 'pagamento', conta_pagar_id: cpAvulsa, valor_centavos: 1000, custo_confirmado: true }));
      assert.equal((await state(tokenA)).total_centavos, 120000);
      await send(tokenA, { action: 'cancelar', movimento_id: paid.movimento_id, motivo: 'QA avulsa cancelada' });
      await send(tokenB, { ...moveA({ tipo: 'pagamento', conta_pagar_id: cpB, valor_centavos: 1000 }), conta_id: bankB });
      assert.equal((await state(tokenB)).total_centavos, 339000);
      assert.deepEqual(sentinel(), before);
    });
    await t.test('as quatro policies isolam duas empresas e negam SELECT a perfis nao autorizados', async () => {
      for (const [actorName, company] of [['adminA', companyA], ['adminB', companyB]]) {
        for (const table of TABLES) {
          const rows = success(await local.request('/rest/v1/' + table + '?select=company_id', { token: actors[actorName].token }), 'RLS SELECT QA');
          assert.equal(rows.length > 0, true, 'Tabela possui dados de ambos tenants no ensaio');
          assert.equal(rows.every(row => row.company_id === company), true, 'RLS restringe tenant');
          assert.deepEqual(success(await local.request('/rest/v1/' + table + '?company_id=eq.' + (company === companyA ? companyB : companyA) + '&select=company_id',
            { token: actors[actorName].token }), 'Filtro outro tenant'), []);
        }
      }
      for (const actorName of ['operacional', 'mestre', 'visitante', 'semEmpresa', 'inativoFalse', 'inativoNull'])
        for (const table of TABLES)
          assert.deepEqual(success(await local.request('/rest/v1/' + table + '?select=company_id', { token: actors[actorName].token }), 'Perfil sem SELECT'), []);
    });
    await t.test('DML direto negado nas quatro tabelas mesmo para admin ativo', async () => {
      const initial = counts();
      for (const actorName of ['adminA', 'adminB', 'operacional', 'mestre', 'visitante']) {
        for (const table of TABLES) {
          const token = actors[actorName].token, filter = '?company_id=eq.' + companyA;
          for (const [method, route, body] of [['POST', '/rest/v1/' + table, { company_id: companyA }],
            ['PATCH', '/rest/v1/' + table + filter, { company_id: companyA }], ['DELETE', '/rest/v1/' + table + filter, undefined]])
            denied(await local.request(route, { token, method, body }), [401, 403], '42501', 'DML direto ' + table);
        }
      }
      assert.deepEqual(counts(), initial);
    });
    await t.test('argumentos e IDs de outro tenant nao desviam RPC nem vazam recibos', async () => {
      const b0 = await state(tokenB), initial = counts();
      await failure(tokenA, { ...moveA({}), company_id: companyB });
      await failure(tokenA, { ...moveA({}), conta_id: bankB });
      await failure(tokenA, moveA({ tipo: 'transferencia', destino_id: bankB }));
      await failure(tokenA, moveA({ tipo: 'pagamento', conta_pagar_id: cpB }));
      await failure(tokenA, { action: 'cancelar', movimento_id: b0.movimentos[0].id, motivo: 'Tentativa tenant QA' });
      await failure(tokenB, entryRequest, entryOperation);
      const badSignature = await local.rpc('caixa_estado', tokenA, { company_id: companyB });
      denied(badSignature, [400, 404], 'PGRST202', 'Assinatura nao admite tenant');
      assert.deepEqual(counts(), initial);
      assert.deepEqual(await state(tokenB), b0);
      assert.equal((await state(tokenA)).company_id, companyA);
    });
    await t.test('desativar admin com JWT vivo nega leitura/escrita/retry antes do recibo', async () => {
      const initial = counts();
      local.sql(`update public.company_users set active=false where user_id='${actors.adminA.id}';`);
      denied(await local.rpc('caixa_estado', tokenA), [403], '42501', 'Admin desativado leitura');
      denied(await local.rpc('caixa_registrar', tokenA, { p_operacao: entryOperation, p_pedido: entryRequest }), [403], '42501', 'Admin desativado retry');
      denied(await local.rpc('caixa_registrar', tokenA, { p_operacao: crypto.randomUUID(), p_pedido: moveA({}) }), [403], '42501', 'Admin desativado escrita');
      for (const table of TABLES)
        assert.deepEqual(success(await local.request('/rest/v1/' + table + '?select=company_id', { token: tokenA }), 'Admin desativado RLS'), []);
      assert.deepEqual(counts(), initial);
      local.sql(`update public.company_users set active=true where user_id='${actors.adminA.id}';`);
      assert.deepEqual(await send(tokenA, entryRequest, entryOperation), entryReceipt);
      assert.deepEqual(counts(), initial);
    });
    await t.test('RLS, owner, search_path, grants minimos e Auth sem mocks conferidos no catalogo', async () => {
      const catalog = local.json(`select jsonb_build_object(
        'rls',(select count(*) from pg_class r join pg_namespace n on n.oid=r.relnamespace where n.nspname='public' and r.relname in (${TABLES.map(literal).join(',')}) and r.relrowsecurity),
        'policies',(select count(*) from pg_policies where schemaname='public' and tablename in (${TABLES.map(literal).join(',')}) and cmd='SELECT' and roles=array['authenticated']::name[]),
        'anon_select',(select count(*) from unnest(array[${TABLES.map(literal).join(',')}]) t where has_table_privilege('anon','public.'||t,'SELECT')),
        'client_dml',(select count(*) from unnest(array[${TABLES.map(literal).join(',')}]) t cross join unnest(array['anon','authenticated']) r where has_table_privilege(r,'public.'||t,'INSERT,UPDATE,DELETE')),
        'auth_select',(select count(*) from unnest(array[${TABLES.map(literal).join(',')}]) t where has_table_privilege('authenticated','public.'||t,'SELECT')),
        'rpc_owner',(select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles r on r.oid=p.proowner where n.nspname='public' and p.proname in ('caixa_estado','caixa_registrar') and p.prosecdef and r.rolname='postgres' and p.proconfig @> array['search_path=pg_catalog, public']),
        'anon_rpc',has_function_privilege('anon','public.caixa_estado()','EXECUTE') or has_function_privilege('anon','public.caixa_registrar(uuid,jsonb)','EXECUTE'),
        'auth_rpc',has_function_privilege('authenticated','public.caixa_estado()','EXECUTE') and has_function_privilege('authenticated','public.caixa_registrar(uuid,jsonb)','EXECUTE'),
        'public_rpc',(select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join lateral aclexplode(p.proacl) a where n.nspname='public' and p.proname in ('caixa_estado','caixa_registrar') and a.grantee=0),
        'auth_identities',(select count(*) from auth.users where raw_user_meta_data->>'edr_caixa_sintetico'='true'));
      `);
      assert.deepEqual(catalog, { rls: 4, policies: 4, anon_select: 0, client_dml: 0, auth_select: 4, rpc_owner: 2,
        anon_rpc: false, auth_rpc: true, public_rpc: 0, auth_identities: 8 });
      assert.deepEqual(sentinel(), before);
    });
    await t.test('rollback vazio recusa dados novos e mantem API/auditoria sem exclusao', async () => {
      const initial = counts(), s0 = await state(tokenA);
      const rollback = fs.readFileSync(path.join(__dirname, '../sql/caixa-prospectivo-rollback-DRAFT.sql'), 'utf8');
      assert.throws(() => local.sql(rollback), /SQL_LOCAL_FALHOU/);
      assert.deepEqual(counts(), initial);
      assert.deepEqual(await state(tokenA), s0);
      assert.deepEqual(sentinel(), before);
    });
    t.diagnostic('Somente dados/identidades sinteticas LOCAL. Senhas/JWT/chaves omitidos. Stack preservada para ensaio separado de recuperacao.');
  });
}
