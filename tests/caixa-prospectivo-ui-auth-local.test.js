'use strict';
// Chromium isolado + modulo Caixa original + REST/GoTrue REAIS da QA LOCAL.
// Adaptadores de transporte/auth nao simulam saldos, movimentos ou recibos.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { LocalSupabase, configFromEnvironment, REPO, inside } = require('./fixtures/caixa-supabase-local-runtime.cjs');
const success = (response, label) => {
  assert.equal(response.ok, true, `${label}: HTTP ${response.status}, codigo ${response.code || 'omitido'}`);
  return response.body;
};
if (!process.env.EDR_CAIXA_AUTH_LOCAL_STATUS || !process.env.EDR_PLAYWRIGHT_PATH || !process.env.EDR_CHROMIUM_PATH) {
  test('UI Chromium + RPC/Auth reais LOCAL', { skip: 'Defina status QA privado, Playwright e Chromium existentes; este ensaio NAO executado.' }, () => {});
} else {
  test('UI Chromium: movimentos persistidos em RPC real com JWT GoTrue LOCAL', { timeout: 180000 }, async t => {
    assert.equal(['DEBUG', 'PWDEBUG', 'NODE_DEBUG'].some(key => !!process.env[key]), false,
      'Desative debug/trace no processo de ensaio para nao registrar argumentos privados.');
    const local = new LocalSupabase(configFromEnvironment()); t.after(() => local.dispose()); local.marker();
    const company = crypto.randomUUID(), obligation = crypto.randomUUID(), run = crypto.randomBytes(5).toString('hex');
    const email = `qa-edr-ui-${run}@example.test`, password = crypto.randomBytes(32).toString('base64url') + 'A1!';
    const user = success(await local.request('/auth/v1/admin/users', { admin: true, method: 'POST',
      body: { email, password, email_confirm: true, user_metadata: { nome: 'QA UI Caixa', edr_caixa_ui_sintetico: true } } }), 'Criacao Auth UI QA');
    const session = success(await local.request('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } }), 'Login Auth UI QA');
    assert.equal(typeof session.access_token, 'string', 'JWT emitido pelo GoTrue');
    const token = session.access_token;
    local.sql(`begin;
      insert into public.companies(id,owner_id,name,slug,saldo_manual) values('${company}','${user.id}','Empresa QA UI','qa-ui-${run}',987.65);
      insert into public.company_users(company_id,user_id,role,active,nome) values('${company}','${user.id}','admin',true,'QA UI Caixa');
      insert into public.contas_pagar(id,company_id,fornecedor,descricao,valor,data_vencimento,status,tipo)
        values('${obligation}','${company}','Fornecedor QA UI','Obrigacao QA UI',80,'2001-06-01','pendente','despesa');
      commit;`);
    const fingerprint = () => local.json(`select jsonb_build_object(
      'manual',(select saldo_manual from public.companies where id='${company}'),
      'custos',(select jsonb_agg(to_jsonb(l) order by id) from public.lancamentos l),
      'folha',(select jsonb_agg(to_jsonb(q) order by id) from public.diarias_quinzenas q),
      'estoque',(select jsonb_agg(to_jsonb(d) order by id) from public.distribuicoes d));`);
    const before = fingerprint();
    const realState = async () => success(await local.rpc('caixa_estado', token), 'Leitura persistida QA UI');
    const realCounts = () => local.json(`select jsonb_build_object('movimentos',(select count(*) from public.caixa_movimentos where company_id='${company}'),
      'operacoes',(select count(*) from public.caixa_operacoes where company_id='${company}'));`);
    const { chromium } = require(process.env.EDR_PLAYWRIGHT_PATH);
    const browser = await chromium.launch({ headless: true, executablePath: process.env.EDR_CHROMIUM_PATH }); t.after(() => browser.close());
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const origin = 'http://127.0.0.1:55321', harnessUrl = origin + '/qa-edr-caixa-ui';
    const style = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8').match(/<style>([\s\S]*?)<\/style>/)[1];
    const html = '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>' + style +
      '</style><body><main style="max-width:1040px;margin:24px auto;padding:0 16px;"><p>QA LOCAL - dados sinteticos - Auth e RPC reais</p><div id="caixa-content"></div><div id="qa-toast" role="status"></div></main></body></html>';
    let blocked = 0, lostResponse = false, realRpcCalls = 0;
    await page.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (request.url() === harnessUrl && request.method() === 'GET') return route.fulfill({ status: 200, contentType: 'text/html', body: html });
      const allowed = ['/auth/v1/user', '/rest/v1/company_users', '/rest/v1/contas_pagar',
        '/rest/v1/rpc/caixa_estado', '/rest/v1/rpc/caixa_registrar'];
      if (url.origin !== origin || !allowed.includes(url.pathname)) { blocked++; return route.abort(); }
      if (url.pathname === '/rest/v1/rpc/caixa_registrar' && request.method() === 'POST') {
        realRpcCalls++;
        if (lostResponse) {
          lostResponse = false;
          // Envia ao banco de verdade. Somente depois da resposta/commit, corta
          // a entrega ao navegador para verificar recuperacao do mesmo UUID.
          let live;
          try { live = await route.fetch({ maxRedirects: 0 }); }
          catch { throw new Error('HTTP LOCAL interrompido; headers privados omitidos.'); }
          assert.equal(live.ok(), true, 'Commit real precede perda controlada da resposta');
          await live.dispose(); return route.abort('failed');
        }
      }
      return route.continue();
    });
    async function boot() {
      await page.evaluate(async ({ token, key, origin }) => {
        const headers = { apikey: key, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
        const get = async route => {
          const response = await fetch(origin + route, { headers, redirect: 'error' });
          if (!response.ok) throw new Error('HTTP QA ' + response.status);
          return response.json();
        };
        const me = await get('/auth/v1/user');
        const memberships = await get('/rest/v1/company_users?user_id=eq.' + me.id + '&select=user_id,company_id,role,active,nome');
        if (memberships.length !== 1 || memberships[0].active !== true) throw new Error('Vinculo real QA nao confere');
        const member = memberships[0];
        window.sbCurrentUser = { id: me.id, company_id: member.company_id, role: member.role, active: member.active };
        window._companyId = member.company_id;
        window.usuarioAtual = { id: me.id, nome: member.nome, perfil: member.role, role: member.role };
        window.contasPagar = [];
        window.fmtData = x => x ? String(x).split('-').reverse().join('/') : '';
        window.fmt = x => Number(x).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        window.esc = x => String(x ?? '').replace(/[&<>"']/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[x]);
        window.showToast = text => { document.getElementById('qa-toast').textContent = text; };
        window.sbGet = async (table, query = '') => {
          if (table !== 'contas_pagar') throw new Error('Tabela fora do ensaio QA');
          return get('/rest/v1/' + table + (query || '?select=*') + '&company_id=eq.' + member.company_id);
        };
        window._loadContasPagar = async () => { window.contasPagar = await window.sbGet('contas_pagar', '?order=data_vencimento'); };
        window.sbRpcEstoque = async (name, body = {}) => {
          if (!['caixa_estado', 'caixa_registrar'].includes(name)) throw new Error('RPC fora do ensaio QA');
          try {
            const response = await fetch(origin + '/rest/v1/rpc/' + name, { method: 'POST', headers, body: JSON.stringify(body), redirect: 'error' });
            const result = await response.json();
            if (!response.ok) return { ok: false, incerto: response.status >= 500, mensagem: 'RPC LOCAL HTTP ' + response.status };
            return { ok: true, dados: result };
          } catch { return { ok: false, incerto: true, mensagem: 'Resposta LOCAL interrompida; conferir mesmo pedido.' }; }
        };
      }, { token, key: local.config.anon, origin });
      await page.addScriptTag({ content: fs.readFileSync(path.join(REPO, 'js/edr-v2-caixa-prospectivo.js'), 'utf8') });
      await page.evaluate(() => { window.renderCaixa = () => caixaProspectivoRender(document.getElementById('caixa-content')); });
      await page.evaluate(() => renderCaixa());
    }
    const readUi = () => page.evaluate(() => caixaProspectivoEstado());
    async function assertTotal(expected) {
      await page.waitForFunction(expected => caixaProspectivoEstado()?.total_centavos === expected &&
        document.querySelectorAll('#caixa-content strong')[2]?.textContent === fmt(expected / 100), expected);
      assert.equal((await readUi()).total_centavos, expected);
      assert.equal((await realState()).total_centavos, expected, 'UI confere saldo no banco, sem estado simulado');
      assert.match(await page.locator('#caixa-content').innerText(), new RegExp(Number(expected / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 }).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
    async function fillMovement(value, description, extra = {}) {
      await page.locator('#cp-valor').fill(String(value));
      await page.locator('#cp-data').fill(extra.date || '2001-06-06');
      await page.locator('#cp-hora').fill('');
      await page.locator('#cp-descricao').fill(description);
    }
    async function save() {
      await page.locator('#cp-salvar').click();
      await page.waitForFunction(() => !document.getElementById('cp-modal'));
    }
    async function clickAction(name) { await page.getByRole('button', { name, exact: true }).click(); await page.locator('#cp-modal').waitFor(); }
    async function cancelMovement(description) {
      const movement = (await realState()).movimentos.find(m => m.descricao === description && !m.cancelado_em);
      assert.equal(!!movement, true, 'Movimento real disponivel para cancelamento');
      page.once('dialog', dialog => dialog.accept('Cancelamento sintetico QA UI'));
      await page.locator('button[onclick="caixaProspectivoCancelarMovimento(\'' + movement.id + '\')"]').click();
      await page.waitForFunction(id => caixaProspectivoEstado()?.movimentos.some(m => m.id === id && m.cancelado_em), movement.id);
    }
    await page.goto(harnessUrl); await boot();
    assert.equal((await readUi()).company_id, company, 'Tenant derivado da sessao/vinculo reais');
    await clickAction('Declarar abertura');
    await page.locator('#cp-corte').fill('2001-06-05T18:23'); await page.locator('#cp-banco').fill('500'); await page.locator('#cp-dinheiro').fill('100');
    await save(); await assertTotal(60000);
    await clickAction('Entrada'); await fillMovement(25, 'QA UI entrada'); await save(); await assertTotal(62500);
    await clickAction('Saída'); await fillMovement(5, 'QA UI saida'); await save(); await assertTotal(62000);
    await clickAction('Transferência'); await fillMovement(40, 'QA UI transferencia');
    const accounts = (await realState()).contas, bank = accounts.find(c => c.codigo === 'banco').id, cash = accounts.find(c => c.codigo === 'dinheiro').id;
    await page.locator('#cp-conta').selectOption(bank); await page.locator('#cp-destino').selectOption(cash); await save(); await assertTotal(62000);
    assert.deepEqual((await realState()).contas.map(c => [c.codigo, c.saldo_centavos]), [['banco', 48000], ['dinheiro', 14000]]);
    await clickAction('Pagar'); await fillMovement(30, 'QA UI parcial'); await page.locator('#cp-conta').selectOption(bank); await save(); await assertTotal(59000);
    assert.equal((await realState()).pagamentos.find(p => p.conta_pagar_id === obligation).restante_centavos, 5000);
    assert.match(await page.locator('#caixa-content').innerText(), /50,00/);
    await clickAction('Entrada'); await fillMovement(10, 'QA UI duplo clique');
    const beforeDouble = realCounts();
    await page.locator('#cp-salvar').evaluate(button => { button.click(); button.click(); });
    await page.waitForFunction(() => !document.getElementById('cp-modal')); await assertTotal(60000);
    assert.equal(realCounts().movimentos, beforeDouble.movimentos + 1, 'Duas ativacoes DOM gravam uma vez');
    await cancelMovement('QA UI transferencia'); await assertTotal(60000);
    assert.deepEqual((await realState()).contas.map(c => [c.codigo, c.saldo_centavos]), [['banco', 50000], ['dinheiro', 10000]]);
    const beforeLost = realCounts();
    await clickAction('Entrada'); await fillMovement(7, 'QA UI resposta perdida'); lostResponse = true;
    await page.locator('#cp-salvar').click();
    await page.waitForFunction(() => document.getElementById('cp-erro')?.textContent.includes('interrompida'));
    assert.equal((await realState()).total_centavos, 60700, 'Commit ocorreu no banco antes de perder resposta');
    assert.equal((await readUi()).total_centavos, 60000, 'UI nao confirmou sucesso sem recibo');
    const pending = await page.evaluate(() => JSON.parse(sessionStorage.getItem('edr-caixa-pedido:' + _companyId)));
    assert.equal(typeof pending.operacao, 'string');
    assert.equal(realCounts().movimentos, beforeLost.movimentos + 1);
    await page.reload(); await boot();
    await assertTotal(60700); await page.getByRole('button', { name: 'Conferir pedido pendente', exact: true }).click();
    await page.waitForFunction(() => !document.getElementById('cp-modal')); await assertTotal(60700);
    assert.equal(realCounts().movimentos, beforeLost.movimentos + 1, 'Reload/reenvio reutiliza UUID sem debito/credito extra');
    assert.equal(local.sql(`select count(*) from public.caixa_operacoes where company_id='${company}' and id='${pending.operacao}';`), '1');
    await cancelMovement('QA UI parcial'); await assertTotal(63700);
    assert.equal((await realState()).pagamentos.find(p => p.conta_pagar_id === obligation).restante_centavos, 8000);
    const beforeCancel = realCounts(); await clickAction('Saída'); await fillMovement(100, 'QA UI formulario cancelado'); await page.locator('#cp-cancelar').click();
    assert.deepEqual(realCounts(), beforeCancel);
    await clickAction('Entrada'); await fillMovement(1, 'QA UI incluido abertura', { date: '2001-06-05' });
    const beforeCut = realCounts(); await page.locator('#cp-salvar').click(); assert.match(await page.locator('#cp-erro').innerText(), /corte/); assert.deepEqual(realCounts(), beforeCut);
    await page.locator('#cp-decisao').selectOption('incluido_abertura'); await save(); await assertTotal(63700);
    await clickAction('Saída'); await fillMovement(1, 'QA UI tarifa separada'); await save(); await assertTotal(63600);
    await clickAction('Pagar'); await fillMovement(81, 'QA UI excede restante'); const beforeError = realCounts();
    await page.locator('#cp-salvar').click(); await page.waitForFunction(() => document.getElementById('cp-erro')?.textContent.includes('HTTP 400'));
    assert.deepEqual(realCounts(), beforeError); assert.equal((await realState()).total_centavos, 63600);
    await page.locator('#cp-cancelar').click(); await page.reload(); await boot(); await assertTotal(63600);
    assert.deepEqual(fingerprint(), before, 'Custos/folha/estoque/saldo manual preservados');
    if (process.env.EDR_UI_AUTH_EVIDENCE_DIR) {
      const directory = path.resolve(process.env.EDR_UI_AUTH_EVIDENCE_DIR);
      assert.equal(inside(directory, path.resolve(REPO, '../evidencias/caixa-ui-real')), true, 'Artefatos brutos apenas na pasta QA externa autorizada');
      fs.mkdirSync(directory, { recursive: true });
      await page.screenshot({ path: path.join(directory, '2026-10-06-ui-auth-real-desktop.png'), fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: path.join(directory, '2026-10-06-ui-auth-real-mobile.png'), fullPage: true });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Sem overflow horizontal mobile');
    }
    assert.equal(blocked, 0, 'Nenhuma requisicao fora das rotas locais autorizadas');
    assert.equal(realRpcCalls >= 13, true, 'Mutacoes realizadas contra REST real, incluindo reenvio e erro');
    t.diagnostic('Auth GoTrue real; claims/vinculo obtidos de Auth/REST. Caixa+CSS originais e adaptadores REST reais; login/dashboard completos nao carregados. Nenhum segredo registrado.');
  });
}
