'use strict';
// DOMParser real em Chromium novo, sem acessar rede ou dados do usuario.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.EDR_PLAYWRIGHT_MODULE || 'playwright');
const fonte = fs.readFileSync(path.join(__dirname, '../js/edr-v2-importar.js'), 'utf8');
let browser;

test.before(async () => {
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.EDR_CHROMIUM_EXECUTABLE || undefined,
  });
});
test.after(async () => { await browser?.close(); });

function xml(cobranca = '', prefixo = '', namespace = true) {
  let conteudo = `<nfeProc><NFe><infNFe Id="NFeSINTETICA">
    <ide><nNF>100</nNF><serie>1</serie><natOp>VENDA</natOp><finNFe>1</finNFe><dhEmi>2026-10-20T12:00:00-03:00</dhEmi></ide>
    <emit><xNome>FORNECEDOR SINTETICO</xNome></emit>
    <det nItem="1"><prod><cProd>QA</cProd><xProd>MATERIAL TESTE</xProd><qCom>1</qCom><uCom>UN</uCom><vUnCom>1854.17</vUnCom><vProd>1854.17</vProd></prod></det>
    <total><ICMSTot><vProd>1854.17</vProd><vDesc>0.00</vDesc><vNF>1854.17</vNF></ICMSTot></total>
    ${cobranca}
  </infNFe></NFe></nfeProc>`;
  if (prefixo) {
    conteudo = conteudo.replace(/(<\/?)([A-Za-z][A-Za-z0-9]*)/g, '$1' + prefixo + ':$2');
    return conteudo.replace('<' + prefixo + ':nfeProc>', '<' + prefixo + ':nfeProc xmlns:' + prefixo + '="http://www.portalfiscal.inf.br/nfe">');
  }
  return namespace ? conteudo.replace('<nfeProc>', '<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe">') : conteudo;
}

async function extrair(conteudo, preencher = false) {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  await context.route('**/*', route => route.abort());
  const page = await context.newPage();
  try {
    await page.addScriptTag({ content: fonte });
    return await page.evaluate(async ({ conteudo, preencher }) => {
      const doc = new DOMParser().parseFromString(conteudo, 'text/xml');
      if (doc.querySelector('parsererror')) throw new Error('Fixture XML invalida');
      const nfe = ImportModule._extrairDadosNFe(doc);
      if (!preencher) return nfe;
      // O preenchimento usa DOM real; apenas catalogo e preview sao isolados.
      document.body.innerHTML = '<input id="f-numero"><input id="f-emissao"><input id="f-recebimento"><input id="f-fornecedor">';
      window.notas = [];
      window.showToast = () => {};
      ImportModule._carregarConversoes = async () => true;
      ImportModule._deParaGet = () => null;
      ImportModule.matchCatalogo = () => null;
      ImportModule._recalcularConversaoItem = item => item;
      ImportModule._renderPreview = () => {};
      await ImportModule._preencherFormComXML(nfe);
      const primeiro = JSON.parse(JSON.stringify(ImportModule._xmlCtx));
      await ImportModule._preencherFormComXML({ ...nfe, cobranca: null });
      return { primeiro, segundo: ImportModule._xmlCtx };
    }, { conteudo, preencher });
  } finally {
    await context.close();
  }
}

const cobranca = `<cobr><fat><nFat>FAT-100</nFat><vOrig>1854.17</vOrig><vDesc>12.34</vDesc><vLiq>1841.83</vLiq></fat>
  <dup><nDup>001</nDup><dVenc>2026-10-28</dVenc><vDup>800.01</vDup></dup>
  <dup><nDup>002</nDup><dVenc>2026-11-12</dVenc><vDup>1041.82</vDup></dup></cobr>`;
const esperado = {
  fatura: { numero: 'FAT-100', valorOriginal: '1854.17', desconto: '12.34', valorLiquido: '1841.83' },
  duplicatas: [
    { numero: '001', vencimento: '2026-10-28', valor: '800.01' },
    { numero: '002', vencimento: '2026-11-12', valor: '1041.82' },
  ],
};

for (const [nome, prefixo, namespace] of [
  ['namespace padrao', '', true],
  ['prefixo nfe', 'nfe', true],
  ['prefixo arbitrario', 'fiscal', true],
  ['sem namespace', '', false],
]) {
  test('duas parcelas distintas e fatura independente: ' + nome, async () => {
    const nf = await extrair(xml(cobranca, prefixo, namespace));
    assert.deepEqual(nf.cobranca, esperado);
    assert.equal(nf.vNF, 1854.17);
    assert.equal(nf.desconto, 0, 'desconto financeiro nao altera desconto fiscal');
    assert.equal(nf.itens[0].total, 1854.17, 'cobranca nao altera custo dos itens');
  });
}

test('uma parcela, sem fatura, preserva centavos e zeros no numero', async () => {
  const nf = await extrair(xml('<cobr><dup><nDup>0001</nDup><dVenc>2026-12-01</dVenc><vDup>0.01</vDup></dup></cobr>'));
  assert.deepEqual(nf.cobranca, {
    fatura: { numero: '', valorOriginal: '', desconto: '', valorLiquido: '' },
    duplicatas: [{ numero: '0001', vencimento: '2026-12-01', valor: '0.01' }],
  });
});

test('fatura sem duplicatas nao inventa boleto, valor, desconto ou vencimento', async () => {
  const nf = await extrair(xml('<cobr><fat><vOrig>1854.17</vOrig><vLiq>1854.17</vLiq></fat></cobr>'));
  assert.deepEqual(nf.cobranca, {
    fatura: { numero: '', valorOriginal: '1854.17', desconto: '', valorLiquido: '1854.17' },
    duplicatas: [],
  });
});

test('XML sem cobranca distingue ausencia de cobranca vazia', async () => {
  assert.equal((await extrair(xml())).cobranca, null);
  assert.deepEqual((await extrair(xml('<cobr/>'))).cobranca, {
    fatura: { numero: '', valorOriginal: '', desconto: '', valorLiquido: '' }, duplicatas: [],
  });
});

test('campos incompletos e duplicatas repetidas ficam visiveis para revisao', async () => {
  const nf = await extrair(xml(`<cobr><fat><vDesc>0.00</vDesc></fat>
    <dup><nDup>001</nDup><vDup>0.00</vDup></dup><dup><nDup>001</nDup><vDup>0.00</vDup></dup>
    <dup><dVenc>2026-02-30</dVenc></dup></cobr>`));
  assert.equal(nf.cobranca.fatura.desconto, '0.00');
  assert.deepEqual(nf.cobranca.duplicatas, [
    { numero: '001', vencimento: '', valor: '0.00' },
    { numero: '001', vencimento: '', valor: '0.00' },
    { numero: '', vencimento: '2026-02-30', valor: '' },
  ]);
});

test('contexto da importacao recebe cobranca e proxima nota limpa contexto anterior', async () => {
  const ctx = await extrair(xml(cobranca), true);
  assert.deepEqual(ctx.primeiro.cobranca, esperado);
  assert.equal(ctx.primeiro.numero, '100/1');
  assert.equal(ctx.primeiro.vNF, 1854.17);
  assert.equal(ctx.segundo.cobranca, null);
});

test('cobranca fora da propria infNFe nao e importada', async () => {
  const nf = await extrair(xml().replace('</nfeProc>', cobranca + '</nfeProc>'));
  assert.equal(nf.cobranca, null);
});
