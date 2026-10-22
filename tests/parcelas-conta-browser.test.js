'use strict';
// Navegador novo, CSS e modulos reais; transporte sintetico e nenhuma rede externa.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.EDR_PLAYWRIGHT_MODULE || 'playwright');
const raiz = path.resolve(__dirname, '..');
const origin = 'http://127.0.0.1:43784';
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const nf = { notaId: id(1), valor: 1854.17, dataRef: '2026-10-20', obraId: id(2), fornecedor: 'FORNECEDOR SINTETICO QA', numero: '100/1' };
const cobranca = {
  fatura: { numero: '100', valorOriginal: '1854.17', desconto: '12.34', valorLiquido: '1841.83' },
  duplicatas: [
    { numero: '001', valor: '800.01', vencimento: '2026-10-28' },
    { numero: '002', valor: '1041.82', vencimento: '2026-11-12' },
  ],
};
let browser;
test.before(async () => {
  browser = await chromium.launch({ headless: true, executablePath: process.env.EDR_CHROMIUM_EXECUTABLE || undefined });
});
test.after(async () => { await browser?.close(); });

function html() {
  const styles = [...fs.readFileSync(path.join(raiz, 'index.html'), 'utf8').matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)]
    .map(x => x[1]).join('\n');
  const bootstrap = String.raw`
    var _companyId='00000000-0000-4000-8000-000000000010';
    var usuarioAtual={id:'00000000-0000-4000-8000-000000000011'};
    var contasPagar=[];
    var __qa={writes:[],toasts:[],fail:null,hold:false};
    var showToast=msg=>__qa.toasts.push(msg);
    var renderContasPagar=()=>ParcelasConta.renderPendencias();
    var sbRpcEstoque=async(fn,p)=>{
      const empresa=_companyId;
      __qa.writes.push(JSON.parse(JSON.stringify({fn,...p})));
      if(__qa.hold)await new Promise(resolve=>__qa.release=resolve);
      if(__qa.fail==='throw')throw Error('Falha de transporte sintetica');
      if(__qa.fail==='rejected')return {ok:false,incerto:false,mensagem:'Conta alterada por outro usuario'};
      if(__qa.fail==='missing')return {ok:false,incerto:false,ausente:true,mensagem:'RPC ausente'};
      if(__qa.fail==='uncertain')return {ok:false,incerto:true,mensagem:'Resposta perdida'};
      if(__qa.fail==='incomplete')return {ok:true,dados:{}};
      if(__qa.fail==='malformed')return {ok:true,dados:{contas:[{}]}};
      const contas=p.p_pedido.parcelas.map((x,i)=>({
        id:p.p_pedido.conta_id&&i===0?p.p_pedido.conta_id:'00000000-0000-4000-8000-'+String(i+100).padStart(12,'0'),
        company_id:empresa,
        fornecedor:p.p_pedido.fornecedor,valor:x.valor_centavos/100,data_vencimento:x.vencimento,
        nota_id:p.p_pedido.nota_id,nota_ref:p.p_pedido.nota_ref,status:p.p_pedido.status
      }));
      return {ok:true,dados:{repetida:__qa.repetida===true,contas:__qa.fail==='partial'?contas.slice(0,1):contas}};
    };
  `;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${styles}</style></head>
    <body><main style="padding:16px"><h1>Contas a pagar — ensaio sintético</h1><div id="contas-lista"></div></main>
    <script>${bootstrap}</script><script src="/js/edr-v2-parcelas.js"></script><script src="/js/edr-v2-notas.js"></script></body></html>`;
}
async function abrir(width = 1440) {
  const context = await browser.newContext({ viewport: { width, height: 1000 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  const errors = [], external = [];
  page.setDefaultTimeout(5000);
  page.on('pageerror', e => errors.push(e.message));
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin || route.request().method() !== 'GET') {
      external.push(url.origin + url.pathname); return route.abort();
    }
    if (url.pathname === '/index.html') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: html() });
    if (!['/js/edr-v2-parcelas.js', '/js/edr-v2-notas.js'].includes(url.pathname)) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ contentType: 'application/javascript; charset=utf-8', body: fs.readFileSync(path.join(raiz, url.pathname), 'utf8') });
  });
  await page.goto(origin + '/index.html');
  return { page, context, errors, external, close: () => context.close() };
}
async function prompt(page, contexto = {}, overrides = {}) {
  await page.evaluate(({ n, contexto }) => { void _notasPromptPagamento(n.notaId, n.valor, n.dataRef, n.obraId, n.fornecedor, n.numero, contexto); }, { n: { ...nf, ...overrides }, contexto });
  await page.locator('#parcelas-conta-modal').waitFor();
}
async function preencher(page, i, valor, vencimento, numero) {
  await page.getByLabel('Valor da parcela ' + i, { exact: true }).fill(valor);
  await page.getByLabel('Vencimento da parcela ' + i, { exact: true }).fill(vencimento);
  if (numero !== undefined) await page.getByLabel('Identificador da parcela ' + i, { exact: true }).fill(numero);
}
const writes = page => page.evaluate(() => __qa.writes);
const saved = page => page.waitForFunction(() => !document.getElementById('parcelas-conta-modal'));
const erro = page => page.locator('#parcelas-erro');
async function enviar(page) { await page.locator('#parcelas-salvar').click(); }
async function screenshot(page, nome) {
  const dir = path.resolve(process.env.EDR_PARCELAS_EVIDENCE_DIR || path.join(raiz, 'output/playwright'));
  fs.mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, 'parcelas-' + nome + '.png'), fullPage: false });
}
function semFalhas(a) { assert.deepEqual(a.errors, []); assert.deepEqual(a.external, []); }

// Reproducoes sinteticas dos valores/vencimentos informados para validacao.
// Fornecedor, tenant, usuario e UUIDs sao ficticios; nenhuma consulta real.
for (const caso of [
  { numero: '211923/1', total: '1854.17', cents: 185417,
    valores: ['927,08', '927,09'], centavos: [92708, 92709], datas: ['2026-10-28', '2026-11-04'] },
  { numero: '213180', total: '827.51', cents: 82751,
    valores: ['413,75', '413,76'], centavos: [41375, 41376], datas: ['2026-11-05', '2026-11-12'] },
]) test('reproducao sintetica NF ' + caso.numero + ': dois boletos manuais sem abatimento', async () => {
  const a = await abrir();
  try {
    await prompt(a.page, { valorTotalNF: caso.total, despesasJaRegistradas: 0, cobranca: {
      fatura: { numero: '', valorOriginal: caso.total, desconto: '', valorLiquido: caso.total }, duplicatas: [],
    } }, { numero: caso.numero, valor: Number(caso.total) });
    assert.match(await a.page.locator('#parcelas-conta-modal').innerText(), /XML n\u00e3o informa duplicatas/);
    assert.equal(await a.page.getByLabel('Valor da parcela 1', { exact: true }).inputValue(), '');
    assert.equal(await a.page.getByLabel('Vencimento da parcela 1', { exact: true }).inputValue(), '');
    await preencher(a.page, 1, caso.valores[0], caso.datas[0]);
    await a.page.locator('#parcelas-adicionar').click();
    assert.equal(await a.page.getByLabel('Valor da parcela 2', { exact: true }).inputValue(), '');
    assert.equal(await a.page.getByLabel('Vencimento da parcela 2', { exact: true }).inputValue(), '');
    await preencher(a.page, 2, caso.valores[1], caso.datas[1]);
    assert.equal(await a.page.locator('#parcelas-confirmacao-row').isVisible(), false);
    assert.equal(await a.page.locator('#parcelas-avisos').isVisible(), false);
    assert.doesNotMatch(await a.page.locator('#parcelas-conta-modal').innerText(), /162,97|340,46/);
    const nome = 'nf-' + caso.numero.replace('/', '-') + '-sintetica';
    await screenshot(a.page, nome + '-desktop');
    await a.page.setViewportSize({ width: 390, height: 1000 });
    const dimensoes = await a.page.locator('#parcelas-conta-modal .modal-box').evaluate(el => ({ client: el.clientWidth, scroll: el.scrollWidth }));
    assert.ok(dimensoes.scroll <= dimensoes.client + 1, JSON.stringify(dimensoes));
    await screenshot(a.page, nome + '-mobile');
    await a.page.locator('#parcelas-salvar').scrollIntoViewIfNeeded();
    await screenshot(a.page, nome + '-mobile-rodape');
    await enviar(a.page); await saved(a.page);
    const [w] = await writes(a.page);
    assert.equal(w.p_pedido.nota_ref, caso.numero);
    assert.deepEqual(w.p_pedido.parcelas.map(p => p.valor_centavos), caso.centavos);
    assert.deepEqual(w.p_pedido.parcelas.map(p => p.vencimento), caso.datas);
    assert.equal(w.p_pedido.parcelas.reduce((s, p) => s + p.valor_centavos, 0), caso.cents);
    assert.equal(w.p_pedido.aceitar_divergencia, false);
    assert.equal(w.p_pedido.motivo, '');
    assert.equal(w.p_pedido.status, 'pendente');
    assert.equal(await a.page.evaluate(() => contasPagar.reduce((s, c) => s + Math.round(c.valor * 100), 0)), caso.cents);
    assert.equal(await a.page.evaluate(() => localStorage.length), 0);
    semFalhas(a);
  } finally { await a.close(); }
});

test('sem XML: valor e vencimento vazios; adicionar nao divide nem copia; cancelar nao grava', async () => {
  const a = await abrir();
  try {
    await prompt(a.page);
    assert.equal(await a.page.getByLabel('Valor da parcela 1', { exact: true }).inputValue(), '');
    assert.equal(await a.page.getByLabel('Vencimento da parcela 1', { exact: true }).inputValue(), '');
    await preencher(a.page, 1, '800,01', '2026-10-28', '001');
    await a.page.locator('#parcelas-adicionar').click();
    assert.equal(await a.page.getByLabel('Valor da parcela 2', { exact: true }).inputValue(), '');
    assert.equal(await a.page.getByLabel('Vencimento da parcela 2', { exact: true }).inputValue(), '');
    assert.equal(await a.page.getByLabel('Identificador da parcela 2', { exact: true }).inputValue(), '');
    assert.equal(await a.page.getByLabel('Valor da parcela 1', { exact: true }).inputValue(), '800,01');
    await screenshot(a.page, 'manual-desktop');
    await a.page.locator('#parcelas-cancelar').click();
    assert.deepEqual(await writes(a.page), []);
    assert.equal(await a.page.evaluate(() => localStorage.length), 0);
    semFalhas(a);
  } finally { await a.close(); }
});

test('uma parcela manual salva centavos, vencimento e vinculos corretos sem presumir recebimento', async () => {
  const a = await abrir();
  try {
    await prompt(a.page);
    await preencher(a.page, 1, '1.854,17', '2026-11-03');
    await enviar(a.page); await saved(a.page);
    const [w] = await writes(a.page);
    assert.equal(w.fn, 'registrar_parcelas_conta');
    assert.equal(w.p_pedido.nota_id, nf.notaId);
    assert.equal(w.p_pedido.nota_ref, '100/1');
    assert.equal(w.p_pedido.obra_id, nf.obraId);
    assert.equal(w.p_pedido.status, 'pendente');
    assert.equal(w.p_pedido.data_pagamento, null);
    assert.deepEqual(w.p_pedido.parcelas, [{ numero: '', valor_centavos: 185417, vencimento: '2026-11-03' }]);
    assert.equal(await a.page.evaluate(() => localStorage.length), 0);
    semFalhas(a);
  } finally { await a.close(); }
});

test('wrapper da NF encaminha cobranca e totais separados; duas parcelas desiguais permitem divergencia confirmada', async () => {
  const a = await abrir();
  try {
    await prompt(a.page, { cobranca, valorTotalNF: 1854.17 });
    const texto = await a.page.locator('#parcelas-conta-modal').innerText();
    assert.match(texto, /Fatura original[\s\S]*1\.854,17/);
    assert.match(texto, /Desconto da fatura[\s\S]*12,34/);
    assert.match(texto, /Fatura líquida[\s\S]*1\.841,83/);
    assert.equal(await a.page.getByLabel('Valor da parcela 1', { exact: true }).inputValue(), '800.01');
    assert.equal(await a.page.getByLabel('Vencimento da parcela 2', { exact: true }).inputValue(), '2026-11-12');
    await enviar(a.page);
    assert.match(await erro(a.page).innerText(), /confirmação da divergência/);
    assert.deepEqual(await writes(a.page), []);
    await a.page.locator('#parcelas-confirmacao').check();
    await screenshot(a.page, 'xml-desktop');
    await enviar(a.page); await saved(a.page);
    const [w] = await writes(a.page);
    assert.deepEqual(w.p_pedido.parcelas, [
      { numero: '001', valor_centavos: 80001, vencimento: '2026-10-28' },
      { numero: '002', valor_centavos: 104182, vencimento: '2026-11-12' },
    ]);
    assert.equal(w.p_pedido.aceitar_divergencia, true);
    semFalhas(a);
  } finally { await a.close(); }
});

test('XML incompleto/invalido exige revisao; identificadores repetidos nao gravam', async () => {
  const a = await abrir();
  try {
    await prompt(a.page, { cobranca: {
      fatura: { valorOriginal: '', desconto: '', valorLiquido: '' },
      duplicatas: [{ numero: '001', valor: '', vencimento: '2026-02-30' }, { numero: '001', valor: '854.17', vencimento: '' }],
    } });
    assert.match(await a.page.locator('#parcelas-conta-modal').innerText(), /Não informado/);
    assert.match(await a.page.locator('#parcelas-avisos').innerText(), /ausentes ou inválidos/);
    assert.equal(await a.page.getByLabel('Vencimento da parcela 1', { exact: true }).inputValue(), '');
    await enviar(a.page); assert.match(await erro(a.page).innerText(), /valor maior que zero/);
    await preencher(a.page, 1, '1000', '2026-11-01');
    await enviar(a.page); assert.match(await erro(a.page).innerText(), /vencimento válido/);
    await preencher(a.page, 2, '854.17', '2026-12-01');
    await enviar(a.page); assert.match(await erro(a.page).innerText(), /duplicata repetido/);
    assert.deepEqual(await writes(a.page), []);
    await a.page.getByLabel('Identificador da parcela 2', { exact: true }).fill('002');
    await enviar(a.page); await saved(a.page);
    assert.equal((await writes(a.page)).length, 1);
    semFalhas(a);
  } finally { await a.close(); }
});

test('valores fracionarios invalidos nao arredondam e soma usa centavos exatos', async () => {
  const a = await abrir();
  try {
    await prompt(a.page, {}, { valor: 0.30 });
    await preencher(a.page, 1, '0,001', '2026-10-28');
    await enviar(a.page); assert.match(await erro(a.page).innerText(), /2 casas decimais/);
    await preencher(a.page, 1, '0,10', '2026-10-28');
    await a.page.locator('#parcelas-adicionar').click();
    await preencher(a.page, 2, '0,20', '2026-11-28');
    assert.match(await a.page.locator('#parcelas-soma').innerText(), /0,30/);
    assert.equal(await a.page.locator('#parcelas-confirmacao-row').isVisible(), false);
    await enviar(a.page); await saved(a.page);
    assert.deepEqual((await writes(a.page))[0].p_pedido.parcelas.map(p => p.valor_centavos), [10, 20]);
    semFalhas(a);
  } finally { await a.close(); }
});

test('vista exige uma parcela e data real do pagamento', async () => {
  const a = await abrir();
  try {
    await prompt(a.page);
    await preencher(a.page, 1, '1854.17', '2026-10-28');
    await a.page.locator('#parcelas-pago').check();
    assert.equal(await a.page.locator('#parcelas-data-pagamento').inputValue(), '');
    await enviar(a.page); assert.match(await erro(a.page).innerText(), /data real do pagamento/);
    await a.page.locator('#parcelas-data-pagamento').fill('2026-10-21');
    await a.page.locator('#parcelas-adicionar').click();
    await preencher(a.page, 2, '0.01', '2026-11-28');
    await a.page.locator('#parcelas-confirmacao').check();
    await enviar(a.page); assert.match(await erro(a.page).innerText(), /uma parcela/);
    await a.page.getByRole('button', { name: 'Remover parcela 2', exact: true }).click();
    await enviar(a.page); await saved(a.page);
    assert.equal((await writes(a.page))[0].p_pedido.status, 'pago');
    assert.equal((await writes(a.page))[0].p_pedido.data_pagamento, '2026-10-21');
    semFalhas(a);
  } finally { await a.close(); }
});

test('despesas existentes exigem confirmacao e motivo e mantem valor integral do boleto', async () => {
  const a = await abrir();
  try {
    await prompt(a.page, { despesasJaRegistradas: 100 });
    assert.match(await a.page.locator('#parcelas-conta-modal').innerText(), /100,00.*despesas/);
    await preencher(a.page, 1, '1854.17', '2026-11-01');
    await enviar(a.page); assert.match(await erro(a.page).innerText(), /confirmação/);
    await a.page.locator('#parcelas-confirmacao').check();
    await enviar(a.page); assert.match(await erro(a.page).innerText(), /motivo/);
    await a.page.locator('#parcelas-motivo').fill('Conferência sintética dos boletos e despesas');
    await enviar(a.page); await saved(a.page);
    assert.equal((await writes(a.page))[0].p_pedido.parcelas[0].valor_centavos, 185417);
    semFalhas(a);
  } finally { await a.close(); }
});

test('duplo clique envia uma vez; campos e fechamento bloqueados durante gravação', async () => {
  const a = await abrir();
  try {
    await prompt(a.page); await preencher(a.page, 1, '1854.17', '2026-10-28');
    await a.page.evaluate(() => { __qa.hold = true; document.getElementById('parcelas-salvar').click(); document.getElementById('parcelas-salvar').click(); });
    await a.page.waitForFunction(() => __qa.writes.length === 1);
    assert.equal(await a.page.locator('#parcelas-cancelar').isDisabled(), true);
    assert.equal(await a.page.getByLabel('Valor da parcela 1', { exact: true }).isDisabled(), true);
    await a.page.keyboard.press('Escape');
    assert.equal(await a.page.locator('#parcelas-conta-modal').count(), 1);
    await a.page.evaluate(() => __qa.release()); await saved(a.page);
    assert.equal((await writes(a.page)).length, 1);
    semFalhas(a);
  } finally { await a.close(); }
});

for (const mode of ['uncertain', 'incomplete', 'malformed', 'throw']) test('resultado ' + mode + ': guarda pedido e repete mesmo UUID e payload', async () => {
  const a = await abrir();
  try {
    await prompt(a.page); await preencher(a.page, 1, '1854.17', '2026-10-28');
    await a.page.evaluate(mode => { __qa.fail = mode; }, mode);
    await enviar(a.page);
    await a.page.getByRole('button', { name: 'Conferir pedido enviado', exact: true }).waitFor();
    const [primeiro] = await writes(a.page);
    assert.equal(await a.page.evaluate(() => localStorage.length), 1);
    assert.equal(await a.page.getByLabel('Valor da parcela 1', { exact: true }).isDisabled(), true);
    await a.page.evaluate(() => { __qa.fail = null; __qa.repetida = true; });
    await enviar(a.page); await saved(a.page);
    assert.deepEqual((await writes(a.page))[1], primeiro);
    assert.equal(await a.page.evaluate(() => localStorage.length), 0);
    assert.match(await a.page.evaluate(() => __qa.toasts.at(-1)), /já estavam registradas/);
    semFalhas(a);
  } finally { await a.close(); }
});

test('resposta parcial nao atualiza cache e mantem duas parcelas para recuperacao', async () => {
  const a = await abrir();
  try {
    await prompt(a.page, { cobranca });
    await a.page.locator('#parcelas-confirmacao').check();
    await a.page.evaluate(() => { __qa.fail = 'partial'; });
    await enviar(a.page);
    await a.page.getByRole('button', { name: 'Conferir pedido enviado', exact: true }).waitFor();
    assert.match(await erro(a.page).innerText(), /incompleta/);
    assert.equal(await a.page.evaluate(() => contasPagar.length), 0);
    assert.equal(await a.page.evaluate(() => JSON.parse(localStorage.getItem(localStorage.key(0))).pedido.parcelas.length), 2);
    const [primeiro] = await writes(a.page);
    await a.page.evaluate(() => { __qa.fail = null; });
    await enviar(a.page); await saved(a.page);
    assert.deepEqual((await writes(a.page))[1], primeiro);
    assert.equal(await a.page.evaluate(() => contasPagar.length), 2);
    semFalhas(a);
  } finally { await a.close(); }
});

for (const mode of ['missing', 'rejected']) test('RPC ' + mode + ': falha conhecida nao fecha nem faz fallback direto', async () => {
  const a = await abrir();
  try {
    await prompt(a.page); await preencher(a.page, 1, '1854.17', '2026-10-28');
    await a.page.evaluate(mode => { __qa.fail = mode; }, mode);
    await enviar(a.page);
    assert.match(await erro(a.page).innerText(), mode === 'missing' ? /não foi habilitado/ : /outro usuario/);
    assert.equal(await a.page.locator('#parcelas-conta-modal').count(), 1);
    assert.equal(await a.page.evaluate(() => localStorage.length), 0);
    assert.equal(await a.page.getByLabel('Valor da parcela 1', { exact: true }).isDisabled(), false);
    assert.equal((await writes(a.page)).length, 1);
    semFalhas(a);
  } finally { await a.close(); }
});

test('reload: renderPendencias recupera pedido incerto com mesmo UUID', async () => {
  const a = await abrir();
  try {
    await prompt(a.page, { cobranca });
    await a.page.locator('#parcelas-confirmacao').check();
    await a.page.evaluate(() => { __qa.fail = 'uncertain'; });
    await enviar(a.page);
    await a.page.getByRole('button', { name: 'Conferir pedido enviado', exact: true }).waitFor();
    const [primeiro] = await writes(a.page);
    await a.page.reload();
    await a.page.evaluate(() => ParcelasConta.renderPendencias());
    await a.page.locator('#parcelas-pendencias [data-recuperar]').click();
    assert.equal(await a.page.getByLabel('Valor da parcela 1', { exact: true }).inputValue(), '800.01');
    assert.equal(await a.page.getByLabel('Valor da parcela 1', { exact: true }).isDisabled(), true);
    await screenshot(a.page, 'recuperacao-desktop');
    await enviar(a.page); await saved(a.page);
    assert.deepEqual((await writes(a.page))[0], primeiro);
    assert.equal(await a.page.locator('#parcelas-pendencias [data-recuperar]').count(), 0);
    semFalhas(a);
  } finally { await a.close(); }
});

test('troca de sessao durante RPC preserva pedido original e ignora resposta tardia', async () => {
  const a = await abrir();
  try {
    await prompt(a.page); await preencher(a.page, 1, '1854.17', '2026-10-28');
    await a.page.evaluate(() => { __qa.hold = true; document.getElementById('parcelas-salvar').click(); });
    await a.page.waitForFunction(() => __qa.writes.length === 1);
    const [primeiro] = await writes(a.page);
    await a.page.evaluate(({ empresa, usuario }) => {
      _companyId = empresa; usuarioAtual.id = usuario; __qa.release();
    }, { empresa: id(30), usuario: id(31) });
    await saved(a.page);
    assert.equal(await a.page.evaluate(() => contasPagar.length), 0);
    assert.equal(await a.page.evaluate(() => localStorage.length), 1);
    assert.equal(await a.page.locator('#parcelas-pendencias [data-recuperar]').count(), 0);
    assert.match(await a.page.evaluate(() => __qa.toasts.at(-1)), /sessão mudou/);
    await a.page.evaluate(({ empresa, usuario }) => {
      _companyId = empresa; usuarioAtual.id = usuario; __qa.hold = false;
      ParcelasConta.renderPendencias();
    }, { empresa: id(10), usuario: id(11) });
    await a.page.locator('#parcelas-pendencias [data-recuperar]').click();
    await enviar(a.page); await saved(a.page);
    assert.deepEqual((await writes(a.page))[1], primeiro);
    assert.equal(await a.page.evaluate(() => localStorage.length), 0);
    assert.equal(await a.page.evaluate(() => contasPagar.length), 1);
    semFalhas(a);
  } finally { await a.close(); }
});

test('troca de sessao antes de salvar fecha editor sem enviar', async () => {
  const a = await abrir();
  try {
    await prompt(a.page); await preencher(a.page, 1, '1854.17', '2026-10-28');
    await a.page.evaluate(() => { usuarioAtual.id = '00000000-0000-4000-8000-000000000031'; });
    await enviar(a.page); await saved(a.page);
    assert.deepEqual(await writes(a.page), []);
    assert.equal(await a.page.evaluate(() => localStorage.length), 0);
    semFalhas(a);
  } finally { await a.close(); }
});

test('sem armazenamento duravel nenhum pedido financeiro e enviado', async () => {
  const a = await abrir();
  try {
    await prompt(a.page); await preencher(a.page, 1, '1854.17', '2026-10-28');
    await a.page.evaluate(() => { Storage.prototype.setItem = () => { throw Error('Quota sintetica'); }; });
    await enviar(a.page);
    assert.match(await erro(a.page).innerText(), /Nenhuma parcela foi enviada/);
    assert.deepEqual(await writes(a.page), []);
    assert.equal(await a.page.getByLabel('Valor da parcela 1', { exact: true }).isDisabled(), false);
    semFalhas(a);
  } finally { await a.close(); }
});

test('desdobramento: snapshot original preservado e correcao do total exige motivo e confirmacao', async () => {
  const a = await abrir();
  try {
    const conta = { id: id(20), nota_id: nf.notaId, nota_ref: nf.numero, fornecedor: nf.fornecedor, descricao: 'NF sintética QA', valor: 1854.17, data_vencimento: '2026-10-28', status: 'pendente', obra_id: nf.obraId };
    await a.page.evaluate(c => { void ParcelasConta.abrirDesdobramento(c); }, conta);
    await a.page.locator('#parcelas-conta-modal').waitFor();
    assert.equal(await a.page.getByLabel('Valor da parcela 1', { exact: true }).inputValue(), '');
    assert.equal(await a.page.getByLabel('Vencimento da parcela 1', { exact: true }).inputValue(), '');
    await preencher(a.page, 1, '800.01', '2026-10-29');
    await a.page.locator('#parcelas-adicionar').click();
    await preencher(a.page, 2, '1041.82', '2026-11-13');
    await enviar(a.page); assert.match(await erro(a.page).innerText(), /divergência/);
    await a.page.locator('#parcelas-confirmacao').check();
    await enviar(a.page); assert.match(await erro(a.page).innerText(), /motivo/);
    await a.page.locator('#parcelas-motivo').fill('Valor corrigido conforme dois boletos sintéticos');
    await screenshot(a.page, 'desdobramento-desktop');
    await enviar(a.page); await saved(a.page);
    const p = (await writes(a.page))[0].p_pedido;
    assert.equal(p.modo, 'desdobrar');
    assert.equal(p.conta_id, conta.id);
    assert.equal(p.original.valor_centavos, 185417);
    assert.equal(p.original.data_vencimento, '2026-10-28');
    assert.equal(p.original.nota_id, nf.notaId);
    assert.equal(p.original.status, 'pendente');
    assert.equal(p.parcelas.reduce((s, x) => s + x.valor_centavos, 0), 184183);
    semFalhas(a);
  } finally { await a.close(); }
});

test('conta paga/baixa e reembolso nao abrem desdobramento', async () => {
  const a = await abrir();
  try {
    await a.page.evaluate(async id => {
      await ParcelasConta.abrirDesdobramento({ id, status: 'pago' });
      await ParcelasConta.abrirDesdobramento({ id, status: 'pendente', data_pagamento: '2026-10-20' });
      await ParcelasConta.abrirDesdobramento({ id, status: 'pendente', tipo: 'reembolso_fornecedor' });
    }, id(20));
    assert.equal(await a.page.locator('#parcelas-conta-modal').count(), 0);
    assert.deepEqual(await writes(a.page), []);
    assert.equal(await a.page.evaluate(() => __qa.toasts.length), 3);
    semFalhas(a);
  } finally { await a.close(); }
});

test('revisar linhas depois de confirmar divergencia exige nova confirmacao', async () => {
  const a = await abrir();
  try {
    await prompt(a.page, { cobranca });
    await a.page.locator('#parcelas-confirmacao').check();
    await a.page.getByRole('button', { name: 'Remover parcela 2', exact: true }).click();
    assert.equal(await a.page.locator('#parcelas-confirmacao').isChecked(), false);
    await enviar(a.page);
    assert.match(await erro(a.page).innerText(), /confirmação/);
    assert.deepEqual(await writes(a.page), []);
    semFalhas(a);
  } finally { await a.close(); }
});

for (const width of [320, 390]) test('celular ' + width + ': sem overflow, campos editaveis e foco contido', async () => {
  const a = await abrir(width);
  try {
    await prompt(a.page, { cobranca });
    const bounds = await a.page.locator('#parcelas-conta-modal .modal-box').boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1, JSON.stringify(bounds));
    const overflow = await a.page.evaluate(() => {
      const box = document.querySelector('#parcelas-conta-modal .modal-box');
      return { client: box.clientWidth, scroll: box.scrollWidth };
    });
    assert.ok(overflow.scroll <= overflow.client + 1, JSON.stringify(overflow));
    await preencher(a.page, 1, '800,01', '2026-10-29');
    await a.page.locator('#parcelas-confirmacao').check();
    await screenshot(a.page, 'mobile-' + width);
    await a.page.locator('#parcelas-salvar').focus(); await a.page.keyboard.press('Tab');
    assert.equal(await a.page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Fechar');
    await a.page.locator('#parcelas-salvar').scrollIntoViewIfNeeded();
    await screenshot(a.page, 'mobile-' + width + '-rodape');
    semFalhas(a);
  } finally { await a.close(); }
});
