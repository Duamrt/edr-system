'use strict';
// Chromium isolado, fontes reais e dados sintéticos. Nenhum transporte externo é permitido.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.EDR_PLAYWRIGHT_MODULE || 'playwright');
const raiz = path.resolve(__dirname, '..');
const fontes = ['edr-v2-utils-extras.js', 'edr-v2-estoque.js', 'edr-v2-estoque-tabela.js', 'edr-v2-diarias.js']
  .map(nome => fs.readFileSync(path.join(raiz, 'js', nome), 'utf8'));
const nome = `MATERIAL D'ÁGUA ");window.__executou++;/* \\ &quot; <img src="https://invalid.test/sentinela" onerror="window.__executou++">`;
const unidade = `UN' \\ " &lt; <svg onload="window.__executou++">`;
const codigo = `COD' ");window.__executou++;// &quot;`;
const categoria = `CAT' \\ " &amp;`;
let browser;

test.before(async () => {
  browser = await chromium.launch({ headless: true, executablePath: process.env.EDR_CHROMIUM_EXECUTABLE || undefined });
});
test.after(async () => { await browser?.close(); });

async function ambiente() {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const transportes = [], erros = [];
  await context.route('**/*', route => { transportes.push(route.request().url()); return route.abort(); });
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  page.on('pageerror', error => erros.push(error.message));
  await page.setContent('<!doctype html><meta charset="utf-8"><body></body>');
  await page.evaluate(() => {
    window.__executou = 0;
    window.__chamadas = [];
    window.__transportes = [];
    const proibido = tipo => () => { __transportes.push(tipo); throw new Error('Transporte proibido: ' + tipo); };
    window.fetch = proibido('fetch');
    window.XMLHttpRequest = proibido('xhr');
    window.WebSocket = proibido('websocket');
    window.EventSource = proibido('eventsource');
    navigator.sendBeacon = proibido('beacon');
    for (const fn of ['sbGet', 'sbGetAll', 'sbPost', 'sbPostMinimal', 'sbPatch', 'sbDelete', 'sbRpc', 'sbRpcEstoque']) window[fn] = proibido(fn);
    window.usuarioAtual = { id: 'usuario-sintetico', perfil: 'admin' };
    window.COMPANY_DEFAULTS = { estoqueGeral: 'EDR' };
    window.catalogoMateriais = [];
    window.notas = [];
    window.distribuicoes = [];
    window.entradasDiretas = [];
    window.ajustesEstoque = [];
    window.lancamentos = [];
    window.obras = [];
    window.ETAPAS = [];
    window.estoqueContratoAtual = () => ({});
    window.openModal = id => document.getElementById(id)?.classList.add('active');
    window.closeModal = id => document.getElementById(id)?.classList.remove('active');
    window.showToast = () => {};
    window.fmtR = n => 'R$ ' + Number(n || 0).toFixed(2);
    window.fmtQtd = String;
    window.etapaLabel = c => c;
    window.__campos = (ids, tag = 'div') => ids.forEach(id => {
      const el = document.createElement(tag); el.id = id; document.body.appendChild(el);
    });
    __campos(['entrada-desc', 'entrada-unidade', 'saida-desc', 'saida-unidade', 'saida-qtd',
      'ajuste-desc', 'ajuste-unidade', 'ajuste-qtd', 'mat-nome', 'mat-unidade', 'mat-tipo-item'], 'input');
    __campos(['estoque-lista', 'ac-entrada-list', 'ac-saida-list', 'ac-ajuste-list', 'ajuste-saldo-atual',
      'btn-salvar-mat', 'modal-material', 'diar-equipe-lista', 'diar-folhaContainer',
      'diar-listaBox', 'diar-listaSalvar', 'diar-listaBuscaModal', 'diar-listaBuscaResult']);
    __campos(['mat-categoria'], 'select');
    __campos(['diar-listaBuscaInput'], 'input');
  });
  for (const content of fontes) await page.addScriptTag({ content });
  return {
    page,
    async conferir() {
      assert.deepEqual(erros, [], 'não pode haver erro de sintaxe/evento');
      assert.deepEqual(transportes, [], 'o DOM não pode iniciar carga de recurso externo');
      assert.deepEqual(await page.evaluate(() => __transportes), [], 'nenhuma API ou transporte pode ser chamado');
      assert.equal(await page.evaluate(() => __executou), 0, 'nenhum conteúdo deve executar');
      assert.equal(await page.locator('img,svg,iframe,[onerror],[onload]').count(), 0, 'dados não podem criar elementos/eventos');
    },
    close: () => context.close()
  };
}

test('autocompletes conservam nome, código e unidade como texto e selecionam o valor original', async () => {
  const a = await ambiente();
  try {
    await a.page.evaluate(({ nome, unidade, codigo }) => {
      catalogoMateriais.push({ id: 'material', nome, unidade, codigo });
      EstoqueModule.catalogoMateriais = catalogoMateriais;
      EstoqueModule._consolidado = [{ desc: nome, unidade, saldo: 5 }];
      for (const tipo of ['entrada', 'saida', 'ajuste']) document.getElementById(tipo + '-desc').value = 'MATERIAL';
      onEntradaDescInput(); onSaidaDescInput(); onAjusteDescInput();
    }, { nome, unidade, codigo });
    for (const tipo of ['entrada', 'saida', 'ajuste']) {
      const item = a.page.locator('#ac-' + tipo + '-list .autocomplete-item').first();
      assert.ok((await item.textContent()).includes(nome));
      assert.ok((await item.textContent()).includes(codigo));
      assert.ok((await item.textContent()).includes(unidade));
      await item.dispatchEvent(tipo === 'entrada' ? 'mousedown' : 'click');
      assert.equal(await a.page.locator('#' + tipo + '-desc').inputValue(), nome);
      assert.equal(await a.page.locator('#' + tipo + '-unidade').inputValue(), unidade);
    }
    assert.ok((await a.page.locator('#ajuste-saldo-atual').textContent()).includes(unidade));
    await a.page.evaluate(nome => { document.getElementById('entrada-desc').value = nome; onEntradaDescInput(); }, nome);
    const cadastro = a.page.locator('#ac-entrada-list .autocomplete-item').last();
    assert.ok((await cadastro.textContent()).includes(nome.toUpperCase()));
    await cadastro.dispatchEvent('mousedown');
    assert.equal(await a.page.locator('#mat-nome').inputValue(), nome.toUpperCase());
    await a.conferir();
  } finally { await a.close(); }
});

for (const comCodigo of [true, false]) test(`cartões e tabela preservam argumento ${comCodigo ? 'COD' : 'NOME'} sem mudar saldo/custo`, async () => {
  const a = await ambiente();
  try {
    const chave = await a.page.evaluate(({ nome, unidade, codigo, categoria, comCodigo }) => {
      ETAPAS.push({ key: categoria, lb: 'Categoria sintética' });
      if (comCodigo) catalogoMateriais.push({ id: 'material', nome, unidade, codigo, categoria, movimenta_estoque: true });
      entradasDiretas.push({ id: 'entrada', item_desc: nome, unidade, codigo_catalogo: comCodigo ? codigo : null,
        qtd: 5, preco: 10, data: '2026-10-10', categoria });
      EstoqueModule.catalogoMateriais = catalogoMateriais;
      window.__snapshot = JSON.stringify({ catalogoMateriais, entradasDiretas, distribuicoes, ajustesEstoque, lancamentos });
      EstoqueModule.viewMode = 'cards'; renderEstoque();
      for (const fn of ['abrirVincularCodigo', 'abrirDistribuicao', 'abrirSaidaMaterial', 'abrirHistoricoMaterial', 'abrirAjusteEstoque']) {
        window[fn] = (...args) => __chamadas.push({ fn, args });
      }
      return EstoqueModule._consolidado[0].chave;
    }, { nome, unidade, codigo, categoria, comCodigo });
    for (const btn of await a.page.locator('#estoque-lista .mat-action-btn').all()) await btn.dispatchEvent('click');
    const chamadas = await a.page.evaluate(() => __chamadas);
    assert.ok(chamadas.length >= 4);
    for (const chamada of chamadas) assert.deepEqual(chamada.args, chamada.fn === 'abrirSaidaMaterial' ? [nome, unidade] : [chave]);
    await a.page.evaluate(() => { __chamadas.length = 0; EstoqueModule.viewMode = 'tabela'; renderEstoque(); });
    await a.page.locator('#estoque-lista .estk-row').dispatchEvent('click');
    await a.page.locator('#estk-drawer button').filter({ hasText: 'Ver histórico' }).dispatchEvent('click');
    assert.deepEqual(await a.page.evaluate(() => __chamadas[0]), { fn: 'abrirHistoricoMaterial', args: [chave] });
    await a.page.locator('#estoque-lista .estk-cat-edit').dispatchEvent('click');
    await a.page.evaluate(() => { EstoqueTabela.salvarCat = (...args) => __chamadas.push({ fn: 'categoria', args }); });
    await a.page.locator('.estk-catsel').selectOption(categoria);
    assert.deepEqual(await a.page.evaluate(() => __chamadas.at(-1)), { fn: 'categoria', args: [chave, categoria] });
    const estado = await a.page.evaluate(() => ({ saldo: EstoqueModule._consolidado[0].saldo,
      valor: EstoqueModule._consolidado[0].valorEstoque,
      intacto: __snapshot === JSON.stringify({ catalogoMateriais, entradasDiretas, distribuicoes, ajustesEstoque, lancamentos }) }));
    assert.deepEqual(estado, { saldo: 5, valor: 50, intacto: true });
    await a.conferir();
  } finally { await a.close(); }
});

test('opções de categoria preservam chave e rótulo em criação e edição de material', async () => {
  const a = await ambiente();
  try {
    await a.page.evaluate(({ nome, categoria }) => {
      ETAPAS.push({ key: categoria, lb: nome });
      catalogoMateriais.push({ id: 'material', nome, unidade: 'UN', categoria });
      EstoqueModule.catalogoMateriais = catalogoMateriais;
      abrirModalNovoMaterial('NOVO');
    }, { nome, categoria });
    assert.equal(await a.page.locator('#mat-categoria option').last().textContent(), nome);
    assert.equal(await a.page.locator('#mat-categoria option').last().getAttribute('value'), categoria);
    await a.page.evaluate(() => editarMaterial('material'));
    assert.equal(await a.page.locator('#mat-categoria').inputValue(), categoria);
    assert.equal(await a.page.locator('#mat-nome').inputValue(), nome);
    await a.conferir();
  } finally { await a.close(); }
});

test('equipe e folha conservam apelidos/nomes em HTML, edição e handlers', async () => {
  const a = await ambiente();
  try {
    await a.page.evaluate(nome => {
      DiariasModule.funcionariosRaw = [{ id: 'funcionario', nome, cargo: 'Pedreiro', diaria: 100, ativo: false, apelidos: [nome] }];
      _diarRenderListaEquipe();
    }, nome);
    assert.ok((await a.page.locator('#diar-equipe-lista').textContent()).includes(nome));
    await a.page.locator('#diar-equipe-lista button').filter({ hasText: 'editar' }).dispatchEvent('click');
    assert.equal(await a.page.locator('#diar-edit-apelidos').inputValue(), nome);
    await a.page.evaluate(() => { diarExcluirFuncionario = (...args) => __chamadas.push(args); });
    await a.page.locator('#diar-equipe-lista button').filter({ hasText: 'excluir' }).dispatchEvent('click');
    assert.deepEqual(await a.page.evaluate(() => __chamadas[0]), ['funcionario', nome]);
    await a.page.evaluate(nome => {
      DiariasModule.quinzenaAtiva = { id: 'periodo' };
      DiariasModule.registros = [{ quinzena_id: 'periodo', funcionario: nome, data: '2026-10-12', diaria_base: 100,
        cargo: 'Pedreiro', total_fracoes: 1, valor: 100, periodos: [{ obra: 'OBRA', turno: 'dia', fracao: 1 }] }];
      _diarRenderFolha();
      diarAbrirCalendarioFunc = (...args) => __chamadas.push(args);
    }, nome);
    await a.page.locator('.diar-td-nome').dispatchEvent('click');
    assert.deepEqual(await a.page.evaluate(() => __chamadas.at(-1)), [nome]);
    await a.conferir();
  } finally { await a.close(); }
});

test('apontamento mobile preserva nomes na busca, meia falta, falta e não escalado', async () => {
  const a = await ambiente();
  try {
    await a.page.evaluate(nome => {
      DiariasModule.funcionariosRaw = [{ id: 'funcionario', nome, cargo: 'Pedreiro', diaria: 100, ativo: true }];
      obras.push({ id: 'obra', nome: 'OBRA ' + nome });
      _diarListaRender();
    }, nome);
    await a.page.locator('.diar-lista-cell').first().dispatchEvent('click');
    await a.page.locator('.diar-lista-busca-item').dispatchEvent('click');
    assert.equal(await a.page.evaluate(nome => _diarLista.apont[nome].manha, nome), 'OBRA ' + nome);
    await a.page.locator('.diar-lista-confirma-sim').dispatchEvent('click');
    assert.equal(await a.page.evaluate(nome => _diarListaMontaPeriodos(_diarLista.apont[nome]).totalFracoes, nome), 0.5);
    await a.page.locator('.diar-lista-cell.meiofalta').dispatchEvent('click');
    assert.deepEqual(await a.page.evaluate(() => _diarLista._alvoBusca), { id: nome, turno: 'tarde' });
    await a.page.locator('.diar-lista-falta-btn').dispatchEvent('click');
    assert.equal(await a.page.evaluate(nome => _diarLista.apont[nome].falta, nome), true);
    await a.page.locator('.diar-lista-ne-btn').dispatchEvent('click');
    assert.equal(await a.page.evaluate(nome => _diarLista.apont[nome].naoEscalado, nome), true);
    await a.conferir();
  } finally { await a.close(); }
});
