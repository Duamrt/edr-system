'use strict';

// Modulos reais, dados sinteticos e transporte interceptado; nenhuma chamada ao EDR.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { chromium } = require(process.env.EDR_PLAYWRIGHT_MODULE || 'playwright');

const root = path.resolve(__dirname, '..');
const origin = 'http://127.0.0.1:43871';
const sheetjsUrl = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
const sheetjsRuntime = process.env.EDR_SHEETJS_RUNTIME;
const source = file => fs.readFileSync(path.join(root, file), 'utf8');
// Base imutavel para o controle continuar valido depois do commit/deploy.
const baselineRef = 'b87407f2b37fe3166fd3bf013d9cded6c01a9b8b';
const baselineCache = new Map();
function baselineSource(file) {
  if (!baselineCache.has(file)) {
    baselineCache.set(file, execFileSync(process.env.EDR_GIT_EXECUTABLE || 'git', ['show', baselineRef + ':' + file], { cwd: root, encoding: 'utf8' }));
  }
  return baselineCache.get(file);
}
const id = '00000000-0000-4000-8000-000000000001';
const benignName = 'Casa D\'Ávila "Sul" & Filhos';
const htmlSentinel = '<svg onload="window.__sentinel+=1"></svg>';
const scriptSentinel = "Casa ';window.__sentinel+=1;//";
let browser;

test.before(async () => {
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.EDR_CHROMIUM_EXECUTABLE || undefined
  });
});
test.after(async () => { await browser?.close(); });

async function openFixture({ html, seed, sheetjs, baseline = !!process.env.EDR_SECURITY_BASELINE } = {}) {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  const errors = [];
  const blocked = [];
  const sheetRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.setDefaultTimeout(5000);
  await context.addInitScript(data => {
    window.__sentinel = 0;
    window.viewRegistry = { register() {} };
    window.usuarioAtual = { perfil: 'admin' };
    window.obras = [];
    window.obrasArquivadas = [];
    window.lancamentos = [];
    window.distribuicoes = [];
    window.notas = [];
    window.showToast = () => {};
    window.fecharModal = () => {};
    window.aplicarPerfil = () => {};
    if (data) localStorage.setItem('edr-termo-dados', JSON.stringify(data));
  }, seed);
  await context.route('**/*', async route => {
    const url = route.request().url();
    if (url === origin + '/fixture') {
      return route.fulfill({ contentType: 'text/html; charset=utf-8', body: html || '<!doctype html><body></body>' });
    }
    if (url === origin + '/img/logo-edr-preto.svg') {
      return route.fulfill({ contentType: 'image/svg+xml', body: source('img/logo-edr-preto.svg') });
    }
    if (url === sheetjsUrl && sheetjs) {
      sheetRequests.push(url);
      return sheetjs(route, sheetRequests.length);
    }
    blocked.push(url);
    return route.abort('blockedbyclient');
  });
  await page.goto(origin + '/fixture');
  if (!html) {
    for (const file of ['js/edr-v2-utils-extras.js', 'js/edr-v2-obras.js', 'js/edr-v2-garantias.js', 'js/edr-v2-pci.js', 'js/edr-v2-cronograma.js']) {
      await page.addScriptTag({ content: (baseline ? baselineSource : source)(file) });
    }
  }
  return { page, errors, blocked, sheetRequests, close: () => context.close() };
}

async function assertInert(fixture) {
  // Event-loop round trip after rendering/clicking the synthetic sentinel.
  await fixture.page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await fixture.page.evaluate(() => window.__sentinel), 0);
  assert.deepEqual(fixture.errors, []);
  assert.deepEqual(fixture.blocked, []);
}

test('Garantias: clique preserva nome e ID literais com aspas e sentinela inofensiva', async () => {
  const f = await openFixture();
  try {
    for (const nome of [benignName, scriptSentinel + htmlSentinel]) {
      await f.page.evaluate(({ nome, id }) => {
        document.body.innerHTML = '<div id="gar-obra-ac-wrap"></div>';
        obras = [{ id, nome }];
        _garantiasSetupObraAC(null);
      }, { nome, id });
      await f.page.locator('#gar-obra-input').fill('Casa');
      const choice = f.page.locator('#gar-obra-dropdown > div');
      assert.equal(await choice.locator('span').first().textContent(), nome);
      await choice.click();
      assert.equal(await f.page.locator('#gar-obra-input').inputValue(), nome);
      assert.equal(await f.page.locator('#gar-obra-id').inputValue(), id);
      assert.equal(await f.page.locator('svg').count(), 0);
    }
    await assertInert(f);
  } finally { await f.close(); }
});

test('Obras: centros dinamicos mantem valor/label, filtro e cores validas sem interpretar HTML/CSS', async () => {
  const f = await openFixture();
  const key = "centro');window.__sentinel+=1;//\" <b>";
  const label = benignName + htmlSentinel;
  try {
    const state = await f.page.evaluate(({ key, label }) => {
      document.body.innerHTML = '<div id="obras-filtro-cat-lista"></div><select id="centro"></select>';
      aplicarCentrosCustoExtras([
        { key, label, cor: '#123456" onmouseover="window.__sentinel+=1' },
        { key: 'legitimo', label: 'Centro legítimo', cor: '#1a2B3c' },
        { key: 'css', label: 'CSS sintético', cor: '#123456;position:fixed' }
      ]);
      document.getElementById('centro').innerHTML = etapaSelectOpts(key);
      _obrasPopularFiltrosCat();
      window.__clicked = null;
      window.obrasCatToggle = value => { window.__clicked = value; };
      const checkbox = [...document.querySelectorAll('input')].find(input => input.value === key);
      checkbox.click();
      return {
        value: document.getElementById('centro').value,
        label: document.getElementById('centro').selectedOptions[0].textContent,
        clicked: window.__clicked,
        fallback: etapaCor(key),
        legitimate: etapaCor('legitimo'),
        css: etapaCor('css'),
        last: ETAPAS.at(-1).key
      };
    }, { key, label });
    assert.deepEqual(state, { value: key, label, clicked: key, fallback: '#546e7a', legitimate: '#1a2B3c', css: '#546e7a', last: '36_outros' });
    assert.equal(await f.page.locator('svg, b, [onmouseover]').count(), 0);
    await assertInert(f);
  } finally { await f.close(); }
});

test('Obras: unidade aparece como texto; quantidade e total permanecem iguais', async () => {
  const f = await openFixture();
  try {
    for (const unidade of ['m²', htmlSentinel]) {
      await f.page.evaluate(({ unidade, id }) => {
        document.body.innerHTML = '<div id="obras-lanc-lista"></div><div id="obras-total-filtro"></div>';
        ObrasModule.obraAberta = id;
        lancamentos = [{ id, obra_id: id, descricao: 'Material sintético', unidade, qtd: 2, total: 125.50, data: '2026-10-13' }];
        filtrarLanc();
      }, { unidade, id });
      assert.match(await f.page.locator('.lanc-item-meta').textContent(), new RegExp('2 ' + unidade.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      assert.match(await f.page.locator('.lanc-item-value').textContent(), /125,50/);
      assert.equal(await f.page.locator('svg').count(), 0);
    }
    await assertInert(f);
  } finally { await f.close(); }
});

test('Obras: entrega recebe slug literal inclusive aspas e barra invertida', async () => {
  const f = await openFixture();
  try {
    for (const slug of ["casa-d'ávila", "slug');window.__sentinel+=1;//\\\"<tag>"]) {
      await f.page.evaluate(({ slug, id }) => {
        document.body.innerHTML = '<div id="obras-cards-grid"></div>';
        obrasArquivadas = [{ id, nome: 'Casa sintética', slug_entrega: slug }];
        ObrasModule.mostandoArquivadas = true;
        window.__slug = null;
        window.abrirEntregaDigital = value => { window.__slug = value; };
        renderObrasCards();
      }, { slug, id });
      await f.page.getByRole('button', { name: 'Entrega', exact: true }).click();
      assert.equal(await f.page.evaluate(() => window.__slug), slug);
    }
    await assertInert(f);
  } finally { await f.close(); }
});

test('PCI: data-key conserva nome literal e toggle da categoria funciona', async () => {
  const f = await openFixture();
  try {
    for (const nome of [benignName, 'Categoria" onpointerover="window.__sentinel+=1' + htmlSentinel]) {
      await f.page.evaluate(({ nome, id }) => {
        document.body.innerHTML = '<div id="pci"></div>';
        const container = document.getElementById('pci');
        container.innerHTML = PciModule._htmlCategoria({ nome, ordem: 1, peso_percentual: 5 }, { id });
        PciModule._rerender = () => {};
        PciModule._bind(container);
      }, { nome, id });
      const header = f.page.locator('.pci-cat-header');
      assert.equal(await header.getAttribute('data-key'), id + '-' + nome);
      assert.equal(await header.getAttribute('onpointerover'), null);
      await header.click();
      assert.equal(await f.page.evaluate(key => PciModule.expandedCats.has(key), id + '-' + nome), true);
      await header.click();
      assert.equal(await f.page.evaluate(key => PciModule.expandedCats.has(key), id + '-' + nome), false);
      assert.equal(await f.page.locator('svg').count(), 0);
    }
    await assertInert(f);
  } finally { await f.close(); }
});

test('Cronograma: opcoes PCI preservam obra/entrega e nao encerram o select', async () => {
  const f = await openFixture();
  const markup = '</option></select>' + htmlSentinel + '<select><option>';
  try {
    for (const nome of [benignName, markup]) {
      await f.page.evaluate(({ nome, id, markup }) => {
        obras = [{ id, nome }];
        PciModule.medicoes = [{ id, obra_id: id, entrega: markup }];
        CronogramaModule._abrirModalEtapas();
      }, { nome, id, markup });
      const options = f.page.locator('#cron-etapas-pci option');
      assert.equal(await options.count(), 2);
      assert.equal(await options.nth(1).textContent(), nome + ' \u2014 entrega ' + markup);
      await f.page.locator('#cron-etapas-pci').selectOption(id);
      assert.equal(await f.page.locator('#cron-etapas-pci').inputValue(), id);
      assert.equal(await f.page.locator('svg').count(), 0);
    }
    assert.equal(await f.page.evaluate(() => Object.values(CronogramaModule._DUAM_SUBS).flat().length), 62);
    await assertInert(f);
  } finally { await f.close(); }
});

test('Termo: assinatura usa texto e uma quebra de linha, preservando conteudo legitimo', async () => {
  const html = (process.env.EDR_SECURITY_BASELINE ? baselineSource : source)('termo-entrega.html')
    .replace(/<script\b[^>]*\bsrc=[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<link\b[^>]*>/gi, '');
  for (const proprietario of [benignName, htmlSentinel]) {
    const cpf = 'CPF sintético <b>literal</b>';
    const f = await openFixture({ html, seed: { proprietario, cpf } });
    try {
      assert.equal(await f.page.locator('#t-ass-proprietario').textContent(), proprietario + 'CPF: ' + cpf);
      assert.equal(await f.page.locator('#t-ass-proprietario > br').count(), 1);
      assert.equal(await f.page.locator('#t-ass-proprietario > :not(br)').count(), 0);
      assert.equal(await f.page.evaluate(() => localStorage.getItem('edr-termo-dados')), null);
      await assertInert(f);
    } finally { await f.close(); }
  }
});

test('SheetJS: global antigo nao passa, falha/versao errada permitem retry, versao certa reutiliza', async () => {
  const f = await openFixture({
    sheetjs: (route, attempt) => attempt === 1 ? route.abort('failed') : route.fulfill({
      contentType: 'application/javascript',
      body: attempt === 2 ? 'window.XLSX={version:"0.18.5"};' : 'window.XLSX={version:"0.20.3"};'
    })
  });
  try {
    await f.page.evaluate(() => { window.XLSX = { version: '0.18.5' }; });
    const first = await f.page.evaluate(async () => {
      try { await CronogramaModule._carregarSheetJS(); return 'aceito'; } catch (error) { return error.message; }
    });
    assert.match(first, /Tente novamente/);
    const second = await f.page.evaluate(async () => {
      try { await CronogramaModule._carregarSheetJS(); return 'aceito'; } catch (error) { return error.message; }
    });
    assert.match(second, /Versão segura/);
    await f.page.evaluate(() => CronogramaModule._carregarSheetJS());
    assert.equal(await f.page.evaluate(() => XLSX.version), '0.20.3');
    await f.page.evaluate(() => CronogramaModule._carregarSheetJS());
    assert.equal(f.sheetRequests.length, 3);
    assert.equal(await f.page.locator('script[src]').count(), 0);
    await assertInert(f);
  } finally { await f.close(); }
});

test('SheetJS oficial offline: XLSX/XLS/XLSB mantem 20 pesos e conversao decimal', { skip: !sheetjsRuntime }, async () => {
  const runtime = fs.readFileSync(sheetjsRuntime, 'utf8');
  const f = await openFixture({ sheetjs: route => route.fulfill({ contentType: 'application/javascript', body: runtime }) });
  try {
    const results = await f.page.evaluate(async () => {
      await CronogramaModule._carregarSheetJS();
      const rows = [];
      for (const format of ['xlsx', 'xls', 'xlsb']) {
        for (const weight of [5, 0.05]) {
          const workbook = XLSX.utils.book_new();
          const data = [['Incidência'], ...Array.from({ length: 20 }, () => [weight])];
          XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(data), 'Proposta_Constr_Individual');
          const bytes = XLSX.write(workbook, { bookType: format, type: 'array' });
          const reread = XLSX.read(bytes, { type: 'array' });
          rows.push({ format, weight, pesos: CronogramaModule._extrairPesosDoPlanilha(reread) });
        }
      }
      const empty = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(empty, XLSX.utils.aoa_to_sheet([['Sem pesos']]), 'Planilha');
      return { version: XLSX.version, rows, invalid: CronogramaModule._extrairPesosDoPlanilha(empty) };
    });
    assert.equal(results.version, '0.20.3');
    assert.equal(results.rows.length, 6);
    for (const row of results.rows) assert.deepEqual(row.pesos, Array(20).fill(5), row.format + ':' + row.weight);
    assert.equal(results.invalid, null);
    await assertInert(f);
  } finally { await f.close(); }
});

test('Visual: cinco telas com dados legitimos sao identicas a base anterior ao patch', { skip: !!process.env.EDR_SECURITY_BASELINE }, async () => {
  const styles = [...source('index.html').matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(match => match[1]).join('\n');
  for (const scenario of ['garantias', 'obras', 'pci', 'cronograma', 'termo']) {
    const screenshots = [];
    for (const baseline of [true, false]) {
      const html = scenario === 'termo' ? (baseline ? baselineSource : source)('termo-entrega.html')
        .replace(/<script\b[^>]*\bsrc=[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<link\b[^>]*>/gi, '') : undefined;
      const f = await openFixture({ baseline, html, seed: { proprietario: 'Pessoa Sintética', cpf: 'Documento sintético' } });
      try {
        if (scenario !== 'termo') {
          await f.page.addStyleTag({ content: styles });
          await f.page.evaluate(({ scenario, id }) => {
            const nome = 'Casa Sintética & Filhos';
            obras = [{ id, nome }];
            if (scenario === 'garantias') {
              document.body.innerHTML = '<div style="width:500px;padding:20px"><div id="gar-obra-ac-wrap"></div></div>';
              _garantiasSetupObraAC({ obra_id: id });
              document.getElementById('gar-obra-input').dispatchEvent(new Event('input'));
            } else if (scenario === 'obras') {
              document.body.innerHTML = '<main style="padding:20px"><div id="obras-cards-grid"></div><div id="obras-filtro-cat-lista"></div><div id="obras-lanc-lista"></div></main>';
              aplicarCentrosCustoExtras([{ key: 'sintetico', label: 'Centro Sintético', cor: '#1a2b3c' }]);
              renderObrasCards();
              _obrasPopularFiltrosCat();
              ObrasModule.obraAberta = id;
              lancamentos = [{ id, obra_id: id, descricao: 'Material sintético', unidade: 'm²', qtd: 2, total: 125.50, data: '2026-10-13' }];
              filtrarLanc();
            } else if (scenario === 'pci') {
              document.body.innerHTML = '<main style="padding:20px">' + PciModule._htmlCategoria({ nome, ordem: 1, peso_percentual: 5 }, { id }) + '</main>';
            } else {
              PciModule.medicoes = [{ id, obra_id: id, entrega: '2026-10-31' }];
              CronogramaModule._abrirModalEtapas();
            }
          }, { scenario, id });
        }
        await f.page.evaluate(() => document.fonts.ready);
        screenshots.push(await f.page.screenshot({ fullPage: true, animations: 'disabled' }));
        await assertInert(f);
      } finally { await f.close(); }
    }
    assert.ok(screenshots[0].equals(screenshots[1]), 'Mudanca visual inesperada na fixture ' + scenario);
  }
});
