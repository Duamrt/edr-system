'use strict';
// DOM/eventos Chromium reais; dados, transporte e gravacoes inteiramente sinteticos.
// EDR_PLAYWRIGHT_MODULE e EDR_CHROMIUM_EXECUTABLE permitem usar o runtime local existente.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.EDR_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const source = file => fs.readFileSync(path.join(root, file), 'utf8');
const marker = '<img src=x onerror="&#119;&#105;&#110;&#100;&#111;&#119;&#46;&#95;&#95;&#120;&#115;&#115;=1">';
const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lXcAAAAASUVORK5CYII=';
let browser;
test.before(async () => {
  browser = await chromium.launch({ headless: true, executablePath: process.env.EDR_CHROMIUM_EXECUTABLE || undefined });
});
test.after(async () => { if (browser) await browser.close(); });

async function isolated(t) {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  await context.route('**/*', route => route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(async () => {
    await context.close();
    assert.deepEqual(errors, [], 'Nenhum erro JavaScript no DOM sintetico');
  });
  await page.evaluate(() => {
    window.__xss = 0;
    window.fetch = async () => { throw new Error('Rede proibida neste teste'); };
  });
  return page;
}

async function importer(t) {
  const page = await isolated(t);
  await page.setContent('<input id="f-recebimento" value="2026-10-13"><input id="f-numero"><input id="f-fornecedor"><input id="f-cnpj"><input id="f-emissao"><textarea id="f-natureza"></textarea>');
  await page.evaluate(() => {
    window.catalogoMateriais = [];
    window.notas = [];
    window.__writes = [];
    window.sbGetAll = async () => [];
    window.sbPost = async (table, body) => {
      window.__writes.push({ table, body });
      return { id: 'material-sintetico', ...body };
    };
    window.loadMateriais = async () => {};
    window.classificarItemSync = () => ({ credito: true, cat: 'Material' });
    window.showToast = () => {};
  });
  await page.addScriptTag({ content: source('js/edr-v2-utils-extras.js') });
  await page.addScriptTag({ content: source('js/edr-v2-importar.js') });
  await page.evaluate(() => ImportModule.abrir());
  return page;
}

async function importXml(page, { name = 'MATERIAL SINTETICO SEM MATCH', unit = 'UN' } = {}) {
  const xml = `<nfeProc><NFe><infNFe Id="NFeSINTETICA"><ide><nNF>999</nNF><serie>1</serie><dhEmi>2026-10-13</dhEmi></ide><emit><xNome>FORNECEDOR SINTETICO</xNome></emit><det><prod><cProd>SINTETICO</cProd><xProd><![CDATA[${name}]]></xProd><qCom>2</qCom><uCom><![CDATA[${unit}]]></uCom><vUnCom>10</vUnCom><vProd>20</vProd></prod></det><total><ICMSTot><vProd>20</vProd><vNF>20</vNF></ICMSTot></total></infNFe></NFe></nfeProc>`;
  await page.setInputFiles('#input-xml-nfe-v2', { name: 'nf-sintetica.xml', mimeType: 'application/xml', buffer: Buffer.from(xml) });
  await page.waitForFunction(() => ImportModule.itensPreview.length === 1 && document.querySelector('.import-item-card'));
}

async function noMarkup(page, selector) {
  assert.equal(await page.locator(selector + ' img, ' + selector + ' svg, ' + selector + ' script').count(), 0);
  assert.equal(await page.evaluate(() => window.__xss), 0);
}

test('escJsArg preserva aspas, entidades, controles e separadores Unicode como um unico argumento', async t => {
  const page = await isolated(t);
  await page.addScriptTag({ content: source('js/edr-v2-utils-extras.js') });
  const values = ["D'AGUA", '";window.__xss=1;//', '&quot; &apos; &#39; &#34;', '</script><img src=x onerror=window.__xss=1>', '\\fim\r\n\t\u0000\u0001', 'A\u2028B\u2029C', '', null, 0];
  for (const value of values) {
    await page.evaluate(value => {
      document.body.innerHTML = '<button onclick="window.__received = ' + escJsArg(value) + '">Testar</button>';
    }, value);
    await page.locator('button').click();
    assert.equal(await page.evaluate(() => window.__received), String(value == null ? '' : value));
    await noMarkup(page, 'body');
  }
});

test('FileReader e DOMParser preservam unidade XML como texto nos ramos de conversao', async t => {
  const page = await importer(t);
  await importXml(page, { unit: marker });
  assert.ok((await page.locator('#import-preview-v2').textContent()).includes(marker.toUpperCase()));
  assert.equal(await page.evaluate(() => ImportModule.itensPreview[0].total), 20);
  await noMarkup(page, '#import-preview-v2');
  for (const status of ['igual', 'convertido', 'revisao_obrigatoria']) {
    await page.evaluate(status => {
      Object.assign(ImportModule.itensPreview[0], { status_conversao: status, motivo_conversao: ImportModule.itensPreview[0].unidade_fiscal });
      ImportModule._renderPreview();
    }, status);
    await noMarkup(page, '#import-preview-v2');
  }
});

test('nome XML cadastrado e usado permanece literal no catalogo e na previa', async t => {
  const page = await importer(t);
  const name = 'MATERIAL " > ' + marker;
  await importXml(page, { name });
  await page.locator('#import-preview-v2 select').selectOption('outra');
  assert.equal(await page.locator('#cr-nome').inputValue(), name.toUpperCase());
  await page.locator('#cr-btn-salvar').click();
  await page.waitForFunction(() => ImportModule.itensPreview[0].codigoCat === '000001');
  assert.equal(await page.locator('#import-cat-input-0').inputValue(), '000001 - ' + name.toUpperCase());
  assert.equal(await page.locator('#import-cat-input-0').getAttribute('placeholder'), '000001 - ' + name.toUpperCase());
  assert.equal(await page.evaluate(() => window.__writes[0].body.nome), name.toUpperCase());
  assert.equal(await page.evaluate(() => ImportModule.itensPreview[0].total), 20);
  await noMarkup(page, '#import-preview-v2');
});

test('autocomplete de importacao preserva dados de catalogo e argumentos dos listeners', async t => {
  const page = await importer(t);
  await importXml(page);
  const material = { id: 'sintetico', codigo: '000123\'&quot;', nome: 'MATERIAL D\'AGUA " ' + marker, unidade: 'UN" ' + marker };
  await page.evaluate(material => {
    catalogoMateriais.push(material);
    ImportModule._selecionarCatPorInput = (idx, code) => { window.__selected = [idx, code]; };
    ImportModule._cadastroRapido = (idx, value) => { window.__added = [idx, value]; };
  }, material);
  await page.locator('#import-cat-input-0').fill('MATERIAL');
  await noMarkup(page, '#import-cat-list-0');
  assert.ok((await page.locator('#import-cat-list-0').textContent()).includes(material.nome));
  await page.locator('[data-import-catalogo]').dispatchEvent('mousedown');
  assert.deepEqual(await page.evaluate(() => window.__selected), [0, material.codigo]);
  for (const value of ['MATERIAL\';window.__xss=1;//', 'INEXISTENTE " &apos;\n' + marker]) {
    await page.locator('#import-cat-input-0').fill(value);
    const expected = await page.locator('#import-cat-input-0').inputValue();
    await page.locator('#import-cat-list-0 .autocomplete-item-add').dispatchEvent('mousedown');
    assert.deepEqual(await page.evaluate(() => window.__added), [0, expected.trim()]);
    await noMarkup(page, '#import-cat-list-0');
  }
});

test('similares do cadastro rapido usam texto e listener sem interpolar nomes em JavaScript', async t => {
  const page = await importer(t);
  const material = { codigo: 'COD"&apos;', nome: 'MATERIAL D\'AGUA " ' + marker, unidade: 'UN' };
  await page.evaluate(material => {
    catalogoMateriais.push(material);
    cadastroRapidoMaterial('MATERIAL', 'import', 'UN');
    crMostrarSimilares('MATERIAL');
    window.crUsarExistente = (name, code) => { window.__similar = [name, code]; };
  }, material);
  await noMarkup(page, '#cr-similares-lista');
  await page.locator('[data-cr-similar]').click();
  assert.deepEqual(await page.evaluate(() => window.__similar), [material.nome, material.codigo]);
});

async function portal(t, data, slug = 'obra-sintetica', error = null) {
  const page = await isolated(t);
  const html = source('acompanhar.html').replace(/<script\b[^>]*\bsrc=[^>]*>[\s\S]*?<\/script>/gi, '');
  await page.addInitScript(({ data, error }) => {
    window.__xss = 0;
    window.fetch = async () => {
      if (error) throw new Error(error);
      return { json: async () => data };
    };
  }, { data, error });
  await page.route('https://seguranca.invalid/acompanhar.html*', route => route.fulfill({ contentType: 'text/html', body: html }));
  await page.goto('https://seguranca.invalid/acompanhar.html?slug=' + encodeURIComponent(slug));
  return page;
}

test('portal mostra slug e erro como texto, sem exigir obra existente', async t => {
  const slug = '</strong>' + marker;
  const page = await portal(t, { erro: 'nao encontrada' }, slug);
  assert.equal(await page.locator('#app strong').textContent(), slug);
  await noMarkup(page, '#app');
  const failed = await portal(t, null, 'erro', marker);
  assert.equal(await failed.locator('#app p').textContent(), marker);
  await noMarkup(failed, '#app');
});

test('portal preserva textos publicos, progresso e fotos sem criar atributos executaveis', async t => {
  const suspiciousPhoto = 'x" onerror="window.__xss=1';
  const page = await portal(t, {
    obra: { nome: marker, cidade: 'CIDADE ' + marker, area_m2: 80, status: marker, contratante: marker, data_prevista: '2026-10-31' },
    progresso: 37.5,
    cronograma: [{ nome: marker, progresso: 50, data_fim: '2026-10-31' }],
    diario: [{ data: '2026-10-13', clima: marker, relato: 'Texto &amp; ' + marker, fotos: [suspiciousPhoto, image] }],
  });
  assert.equal(await page.locator('.header-title').textContent(), marker);
  assert.equal(await page.locator('.header-badge').textContent(), marker);
  assert.equal(await page.locator('.etapa-nome').textContent(), marker);
  assert.equal(await page.locator('.diario-clima').textContent(), marker);
  assert.equal(await page.locator('.diario-relato').textContent(), 'Texto &amp; ' + marker);
  assert.equal(await page.locator('.progress-pct').textContent(), '37.5%');
  assert.equal(await page.locator('.progress-bar').evaluate(el => el.style.width), '37.5%');
  assert.equal(await page.locator('#app img').count(), 2);
  assert.equal(await page.locator('.diario-foto').first().getAttribute('src'), suspiciousPhoto);
  assert.equal(await page.locator('[onerror]').count(), 0);
  await page.locator('.diario-foto').nth(1).click();
  assert.equal(await page.locator('#lightbox-img').getAttribute('src'), image);
  assert.equal(await page.evaluate(() => window.__xss), 0);
});
