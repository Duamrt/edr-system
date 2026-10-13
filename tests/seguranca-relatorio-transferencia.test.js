'use strict';
// Navegador novo, dados sinteticos e transporte externo sempre bloqueado.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.EDR_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const origin = 'http://127.0.0.1:43784';
let browser;
test.before(async () => { browser = await chromium.launch({ headless: true, executablePath: process.env.EDR_CHROMIUM_EXECUTABLE }); });
test.after(async () => { await browser?.close(); });

async function setup() {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const external = [], errors = [];
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin || route.request().method() !== 'GET') {
      external.push(url.href); return route.abort();
    }
    if (url.pathname === '/index.html') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><div id="app-shell"></div><div id="login-screen"></div><input id="login-user"><input id="login-pass"><div id="login-error"></div>' });
    const file = path.resolve(root, '.' + url.pathname);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
    let body = fs.readFileSync(file);
    if (file.endsWith('.html')) body = body.toString('utf8').replace(/<script src="js\/posthog\.js[^>]*><\/script>/g, '').replace(/<link[^>]+href="https:[^>]*>/g, '');
    return route.fulfill({ contentType: file.endsWith('.js') ? 'application/javascript' : file.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/css', body });
  });
  const page = await context.newPage();
  await page.goto(origin + '/index.html');
  await page.evaluate(() => {
    window.setSyntheticSession = (user = 'user-a', sid = 'session-a', nonce = 'first') => {
      localStorage.setItem('edr_auth', JSON.stringify({ access_token: 'synthetic.' + btoa(JSON.stringify({ session_id: sid, nonce })) + '.synthetic', expires_at: Date.now() + 3600000, user: { id: user } }));
    };
    setSyntheticSession();
    localStorage.setItem('edr-relatorio-dados', JSON.stringify({ private: 'LEGACY-PRIVATE-MARKER' }));
    window._companyId = 'company-a'; window._supabaseToken = 'synthetic';
    window.usuarioAtual = { id: 'user-a' }; window._companyPlan = { name: 'EMPRESA SINTETICA' };
    window.obras = [{ id: 'obra-a', nome: 'OBRA SINTETICA', contratante: 'PROPRIETARIO QA', cpf_contratante: 'CPF-SINTETICO', valor_venda: 200, area_m2: 50 }];
    window.obrasArquivadas = []; window.lancamentos = [{ obra_id: 'obra-a', data: '2026-10-13', descricao: 'ITEM SINTETICO', qtd: 2, preco: 10, total: 20 }];
    window.sbGet = async () => []; window.showToast = text => { (window.messages ||= []).push(text); };
  });
  for (const file of ['js/edr-v2-utils-extras.js', 'js/edr-v2-report-transfer.js', 'js/edr-v2-obras.js', 'js/edr-v2-auth.js']) {
    await page.addScriptTag({ content: fs.readFileSync(path.join(root, file), 'utf8') });
  }
  return { page, context, external, errors, close: () => context.close() };
}

async function generate(a) {
  const popup = a.page.waitForEvent('popup');
  await a.page.evaluate(() => gerarRelatorioObra('obra-a'));
  const report = await popup; await report.waitForLoadState();
  await report.locator('#report-root .page').first().waitFor();
  return report;
}

test('relatorio legitimo: totais/contratante preservados, sem snapshot e consumo unico', async () => {
  const a = await setup();
  try {
    const report = await generate(a);
    assert.match(await report.locator('#report-root').innerText(), /PROPRIETARIO QA/);
    assert.match(await report.locator('#report-root').innerText(), /20,00/);
    assert.equal(await a.page.evaluate(() => localStorage.getItem('edr-relatorio-dados')), null);
    assert.equal(new URL(report.url()).hash, '');
    await report.reload();
    assert.equal(await report.locator('#report-root .page').count(), 0);
    assert.doesNotMatch(await report.locator('#report-root').innerText(), /CPF-SINTETICO|PROPRIETARIO QA/);
    assert.deepEqual(a.errors, []); assert.deepEqual(a.external, []);
  } finally { await a.close(); }
});

test('logout real revoga DOM da aba aberta e leitura direta do legado', async () => {
  const a = await setup();
  try {
    const report = await generate(a);
    await a.page.evaluate(() => fazerLogout());
    await report.waitForFunction(() => !document.querySelector('#report-root .page'));
    await report.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
    assert.doesNotMatch(await report.locator('body').innerText(), /CPF-SINTETICO|PROPRIETARIO QA/);
    const direct = await a.context.newPage(); await direct.goto(origin + '/relatorio-obra.html');
    assert.doesNotMatch(await direct.locator('body').innerText(), /LEGACY-PRIVATE-MARKER|PROPRIETARIO QA/);
    assert.deepEqual(a.errors, []); assert.deepEqual(a.external, []);
  } finally { await a.close(); }
});

test('logout durante consulta impede publicacao tardia, inclusive novo login do mesmo usuario', async () => {
  const a = await setup();
  try {
    await a.page.evaluate(() => {
      sbGet = () => new Promise(resolve => { window.finishQuery = resolve; });
      window.generating = gerarRelatorioObra('obra-a');
    });
    await a.page.evaluate(() => {
      fazerLogout(); setSyntheticSession('user-a', 'session-new'); _companyId = 'company-a';
      finishQuery([]);
    });
    await a.page.evaluate(() => window.generating);
    assert.equal(a.context.pages().length, 1);
    assert.equal(await a.page.evaluate(() => localStorage.getItem('edr-relatorio-dados')), null);
    assert.match(await a.page.evaluate(() => messages.at(-1)), /não aberto/);
    assert.deepEqual(a.errors, []);
  } finally { await a.close(); }
});

test('troca de tenant apos await bloqueia, refresh da mesma sessao preserva geracao', async () => {
  const a = await setup();
  try {
    await a.page.evaluate(() => { sbGet = () => new Promise(resolve => { window.finishQuery = resolve; }); window.generating = gerarRelatorioObra('obra-a'); });
    await a.page.evaluate(() => { _companyId = 'company-b'; finishQuery([]); });
    await a.page.evaluate(() => window.generating);
    assert.equal(a.context.pages().length, 1);
    await a.page.evaluate(() => { _companyId = 'company-a'; sbGet = async () => { setSyntheticSession('user-a', 'session-a', 'refreshed'); return []; }; });
    const report = await generate(a);
    assert.match(await report.locator('#report-root').innerText(), /OBRA SINTETICA/);
    await a.page.evaluate(() => setSyntheticSession('user-b', 'session-b'));
    await report.waitForFunction(() => !document.querySelector('#report-root .page'));
    assert.deepEqual(a.errors, []);
  } finally { await a.close(); }
});

test('duas geracoes possuem transferencias distintas e popup bloqueado descarta entrega', async () => {
  const a = await setup();
  try {
    const result = await a.page.evaluate(() => {
      const realOpen = window.open, opened = [];
      window.open = url => { opened.push(url); return {}; };
      const owner = EdrReportTransfer.capture();
      EdrReportTransfer.open({ marker: 'ONE' }, owner); EdrReportTransfer.open({ marker: 'TWO' }, owner);
      const ids = opened.map(url => new URL(url, location.href).hash.split('=')[1]);
      const values = ids.map(id => EdrReportTransfer.consume(id)?.data.marker);
      const reused = EdrReportTransfer.consume(ids[0]);
      window.open = () => null;
      const blocked = EdrReportTransfer.open({ marker: 'BLOCKED' }, owner);
      window.open = realOpen;
      return { distinct: ids[0] !== ids[1], values, reused, blocked };
    });
    assert.deepEqual(result, { distinct: true, values: ['ONE', 'TWO'], reused: null, blocked: false });
    assert.deepEqual(a.errors, []);
  } finally { await a.close(); }
});

test('historico, mesma pagina e expiracao nao conservam relatorio revogado', async () => {
  const a = await setup();
  try {
    const report = await generate(a);
    await report.evaluate(() => { const auth = JSON.parse(localStorage.getItem('edr_auth')); auth.expires_at = Date.now() - 1; localStorage.setItem('edr_auth', JSON.stringify(auth)); window.dispatchEvent(new Event('beforeprint')); });
    assert.equal(await report.locator('#report-root .page').count(), 0);
    await report.goto(origin + '/index.html'); await report.goBack();
    assert.doesNotMatch(await report.locator('#report-root').innerText(), /CPF-SINTETICO|PROPRIETARIO QA/);
    assert.deepEqual(a.errors, []); assert.deepEqual(a.external, []);
  } finally { await a.close(); }
});
