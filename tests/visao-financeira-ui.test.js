'use strict';
// Navegador real, HTML/CSS/navegacao e modulos do checkout; somente transporte sintetico.
// Nao valida Auth nem compara pixels com referencias externas. Nenhuma escrita operacional.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { abrir, fixture, fixtureComposicao, ids, raiz } = require('./fixtures/visao-financeira-ui.cjs');
const escopo = page => page.locator('.view.active .edr-financial');
const textoSemAcentos = texto => texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const campoCard = (page, chave, obra = ids.a) => escopo(page).locator('.work-card [data-detail="' + chave + '"][data-work="' + obra + '"]');
async function fecharDetalhe(dialog) {
  await dialog.locator('[data-fv-action="fechar"]').click(); await dialog.waitFor({ state: 'hidden' });
}
async function composicao(page, obra = ids.a) {
  return page.evaluate(obraId => FinanceiroVisaoComposicao.construir(FinanceiroVisaoContexto.construir(FinanceiroVisaoPonte.ler()), obraId), obra);
}
async function filtrar(page, campo, valor) {
  const controle = escopo(page).locator('[data-fv-filter="' + campo + '"]');
  assert.equal(await controle.count(), 1, 'Controle compartilhado unico: ' + campo);
  if (await controle.evaluate(el => el.tagName) === 'SELECT') await controle.selectOption(valor);
  else { await controle.fill(valor); await controle.dispatchEvent('change'); }
  await page.waitForFunction(({ campo, valor }) => FinanceiroVisaoPonte.ler().filtro[campo] === valor, { campo, valor });
}
async function navegar(page, view) {
  if (await page.locator('#hamburger-btn').isVisible()) await page.locator('#hamburger-btn').click();
  await page.locator('.sidebar .nav-btn[data-view="' + view + '"]').click();
  await page.locator('#view-' + view + '.active .edr-financial').waitFor();
  await page.waitForFunction(() => FinanceiroVisaoPonte.ler().fase === 'pronta');
  await page.waitForFunction(() => innerWidth > 768 || document.querySelector('#sidebar').getBoundingClientRect().right <= 1);
}
async function atualizar(a) {
  const anterior = (await a.envelope()).consultadoEm;
  await escopo(a.page).locator('[data-fv-action="atualizar"]').click();
  await a.pronto();
  await a.page.waitForFunction(anterior => FinanceiroVisaoPonte.ler().consultadoEm !== anterior, anterior);
}
async function semOverflow(page) {
  const medida = await page.evaluate(() => ({ largura: innerWidth, documento: document.documentElement.scrollWidth,
    body: document.body.scrollWidth, roots: [...document.querySelectorAll('.view.active .edr-financial')].map(el => ({
      esquerda: el.getBoundingClientRect().left, direita: el.getBoundingClientRect().right,
      cliente: el.clientWidth, conteudo: el.scrollWidth })) }));
  assert.ok(medida.documento <= medida.largura + 1, 'Documento excedeu viewport: ' + JSON.stringify(medida));
  for (const r of medida.roots) {
    assert.ok(r.esquerda >= -1 && r.direita <= medida.largura + 1, 'Root fora do viewport: ' + JSON.stringify(r));
    assert.ok(r.conteudo <= r.cliente + 1, 'Overflow externo do painel: ' + JSON.stringify(r));
  }
  const cortados = await page.evaluate(() => [...document.querySelectorAll('.view.active .edr-financial .metric-value, .view.active .edr-financial .work-card .pair button, .view.active .edr-financial .work-card .pair > strong, .view.active .edr-financial .formula-step button, .view.active .edr-financial .attention-row .amount, .view.active .edr-financial .chart-summary button, .view.active .edr-financial .receivable-total > strong')]
    .filter(el => el.getBoundingClientRect().width && el.getBoundingClientRect().height)
    .flatMap(el => {
      const limite = el.matches('.receivable-total > strong') ? el.closest('.panel') :
        el.closest('.metric') || el.closest('.pair > div') || el.closest('.work-card') || el.closest('.formula-step') || el.closest('.attention-row') || el.closest('.chart-summary');
      if (!limite) return [];
      const range = document.createRange(); range.selectNodeContents(el);
      const texto = range.getBoundingClientRect(), box = limite.getBoundingClientRect();
      const css = getComputedStyle(limite), paddingLeft = limite.classList.contains('work-card') ? Number.parseFloat(css.paddingLeft) || 0 : 0;
      const paddingRight = limite.classList.contains('work-card') ? Number.parseFloat(css.paddingRight) || 0 : 0;
      return texto.left < box.left + paddingLeft - 1 || texto.right > box.right - paddingRight + 1 || texto.bottom > box.bottom + 1
        ? [{ texto: el.textContent, esquerda: texto.left, direita: texto.right, limite: { esquerda: box.left + paddingLeft, direita: box.right - paddingRight } }] : [];
    }));
  assert.deepEqual(cortados, [], 'Valores monetarios cortados dentro de cartoes');
  const moedasQuebradas = await page.evaluate(() => [...document.querySelectorAll('.view.active .edr-financial .metric-value, .view.active .edr-financial .work-card .pair button')]
    .filter(el => el.getBoundingClientRect().width && el.getBoundingClientRect().height && /^-?R\$\s/.test(el.textContent))
    .flatMap(el => {
      const range = document.createRange(); range.selectNodeContents(el);
      const rects = [...range.getClientRects()].filter(r => r.width > 0 && r.height > 0);
      const linhas = new Set(rects.map(r => Math.round(r.top * 10) / 10)).size;
      const rect = range.getBoundingClientRect(), css = getComputedStyle(el);
      const lineHeight = Number.parseFloat(css.lineHeight) || Number.parseFloat(css.fontSize) * 1.5;
      return linhas !== 1 || rect.height > lineHeight + 1 ? [{ texto: el.textContent, linhas, altura: rect.height, lineHeight }] : [];
    }));
  assert.deepEqual(moedasQuebradas, [], 'Moedas nas metricas devem aparecer inteiras em uma unica linha');
  const sobrepostos = await page.evaluate(() => [...document.querySelectorAll('.view.active .edr-financial .work-card .pair')]
    .flatMap(pair => {
      const label = pair.querySelector(':scope > span'), valor = pair.querySelector(':scope > button, :scope > strong');
      if (!label || !valor || !pair.getBoundingClientRect().height) return [];
      const a = document.createRange(), b = document.createRange(); a.selectNodeContents(label); b.selectNodeContents(valor);
      for (const l of a.getClientRects()) for (const v of b.getClientRects()) {
        if (Math.min(l.right, v.right) - Math.max(l.left, v.left) > 1 && Math.min(l.bottom, v.bottom) - Math.max(l.top, v.top) > 1)
          return [{ label: label.textContent, valor: valor.textContent }];
      }
      return [];
    }));
  assert.deepEqual(sobrepostos, [], 'Labels e valores dos cartoes nao devem se sobrepor');
}
async function captura(page, nome) {
  if (!process.env.EDR_UI_EVIDENCE_DIR) return;
  const dir = path.resolve(process.env.EDR_UI_EVIDENCE_DIR), workspace = path.resolve(raiz, '..');
  const relativo = path.relative(workspace, dir);
  assert.ok(!relativo.startsWith('..') && !path.isAbsolute(relativo), 'Evidencia deve permanecer no workspace isolado');
  fs.mkdirSync(dir, { recursive: true });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForFunction(() => scrollY === 0 && (innerWidth > 768 || document.querySelector('#sidebar').getBoundingClientRect().right <= 1));
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.screenshot({ path: path.join(dir, nome + '.png'), fullPage: true });
}
async function colunaDreAcessivel(page, semRolar = false) {
  const tabela = escopo(page).locator('.dre-table');
  assert.equal(await tabela.count(), 1);
  const medida = await tabela.evaluate((el, semRolar) => {
    const wrapper = el.closest('.table-wrap');
    if (!wrapper) return { wrapper: false };
    wrapper.scrollLeft = semRolar ? 0 : wrapper.scrollWidth;
    const box = wrapper.getBoundingClientRect();
    return { wrapper: true, overflow: getComputedStyle(wrapper).overflowX, texto: el.querySelector('tbody tr td:last-child').textContent,
      cliente: wrapper.clientWidth, conteudo: wrapper.scrollWidth,
      celulas: [...el.querySelectorAll('tbody tr td:last-child')].map(td => {
        const rect = td.getBoundingClientRect(); return { esquerda: rect.left, direita: rect.right };
      }), limiteEsquerda: box.left, limiteDireita: box.right };
  }, semRolar);
  assert.equal(medida.wrapper, true, 'Tabela DRE exige acesso a coluna de valores no celular');
  assert.ok(['auto', 'scroll'].includes(medida.overflow));
  assert.ok(medida.texto.trim().length > 0);
  if (semRolar) assert.ok(medida.conteudo <= medida.cliente + 1, 'As duas colunas normais DRE exigem rolagem: ' + JSON.stringify(medida));
  for (const celula of medida.celulas) assert.ok(celula.esquerda >= medida.limiteEsquerda - 1 && celula.direita <= medida.limiteDireita + 1,
    'Coluna final DRE permanece cortada: ' + JSON.stringify(medida));
}
async function textosDoDialogCabem(dialog) {
  const medida = await dialog.evaluate(el => {
    const box = el.getBoundingClientRect(), css = getComputedStyle(el);
    const esquerda = box.left + (Number.parseFloat(css.borderLeftWidth) || 0) + (Number.parseFloat(css.paddingLeft) || 0);
    const direita = box.right - (Number.parseFloat(css.borderRightWidth) || 0) - (Number.parseFloat(css.paddingRight) || 0);
    const cortados = [...el.querySelectorAll('.detail-value, .entry-value, .formula')]
      .filter(no => no.getBoundingClientRect().width && no.getBoundingClientRect().height)
      .flatMap(no => {
        const range = document.createRange(); range.selectNodeContents(no);
        const rect = range.getBoundingClientRect();
        return rect.left < esquerda - 1 || rect.right > direita + 1
          ? [{ classe: no.className, texto: no.textContent, esquerda: rect.left, direita: rect.right }] : [];
      });
    return { cliente: el.clientWidth, conteudo: el.scrollWidth, esquerda, direita, cortados };
  });
  assert.ok(medida.conteudo <= medida.cliente + 1, 'Dialog tem overflow horizontal externo: ' + JSON.stringify(medida));
  assert.deepEqual(medida.cortados, [], 'Moedas e formulas precisam caber no contentbox do dialog: ' + JSON.stringify(medida));
}
async function modal(page, tipo, detalhe = 'metodo') {
  const root = escopo(page);
  const botao = detalhe === 'metodo' ? root.locator('[data-fv-action="metodo"]') : root.locator('[data-detail="' + detalhe + '"]').first();
  await botao.click();
  const dialog = page.locator('#fv-detail-' + tipo);
  await dialog.waitFor({ state: 'visible' });
  assert.equal(await dialog.locator('[data-fv-detail-body]').count(), 1);
  await textosDoDialogCabem(dialog);
  return dialog;
}

if (!process.env.EDR_PLAYWRIGHT_PATH || !process.env.EDR_CHROMIUM_PATH) {
  test('UI financeira real em Chromium isolado', {
    skip: 'Defina EDR_PLAYWRIGHT_PATH e EDR_CHROMIUM_PATH existentes; navegador nao executado.'
  }, () => {});
} else {
  test('UI financeira real: desktop/mobile, leituras sinteticas e transporte externo bloqueado', { timeout: 180000 }, async t => {
    assert.ok(fs.existsSync(path.join(raiz, 'js/edr-v2-visao-financeira-ui.js')), 'Apresentador real deve existir');
    const { chromium } = require(process.env.EDR_PLAYWRIGHT_PATH);
    const browser = await chromium.launch({ headless: true, executablePath: process.env.EDR_CHROMIUM_PATH });
    t.after(() => browser.close());

    await t.test('desktop usa hooks reais, calcula recebiveis sem compensar excessos e saldo separado', async () => {
      const a = await abrir(browser); try {
        await a.pronto();
        assert.equal(await escopo(a.page).count(), 1);
        for (const campo of ['periodo', 'obraId', 'situacao']) assert.equal(await escopo(a.page).locator('[data-fv-filter="' + campo + '"]').count(), 1);
        await filtrar(a.page, 'periodo', '2026-10');
        const e = await a.envelope();
        assert.equal(e.visao.totais.recebidoPeriodoCentavos, 142000);
        assert.equal(e.visao.totais.custoPeriodoCentavos, 85000);
        assert.equal(e.visao.totais.pendenteContratoCentavos, 40000);
        assert.equal(e.visao.totais.excedenteContratoCentavos, 30000);
        assert.equal(e.visao.totais.pendenteAdicionaisCentavos, 6000);
        assert.equal(e.visao.totais.excedenteAdicionaisCentavos, 10000);
        assert.equal(e.visao.saldo.totalCentavos, 100000);
        assert.equal(Math.round(e.visao.dre.empresa.dados.resultado * 100), 45480);
        await semOverflow(a.page); await captura(a.page, 'resumo-desktop-sintetico');
        await escopo(a.page).locator('[data-fv-tab="financeiro"]').click();
        assert.match(await escopo(a.page).innerText(), /receb[ií]veis/i);
        assert.match(await escopo(a.page).innerText(), /excedente/i);
        await semOverflow(a.page); await captura(a.page, 'financeiro-desktop-sintetico');
        await a.conferirIsolamento();
      } finally { await a.fechar(); }
    });

    await t.test('filtros atravessam navegacao real sem renomear disponibilidade ou perder o escopo', async () => {
      const a = await abrir(browser); try {
        await a.pronto();
        await filtrar(a.page, 'periodo', '2026-10'); await filtrar(a.page, 'obraId', ids.b);
        for (const view of ['relatorio', 'raiox', 'dre', 'dashboard']) {
          await navegar(a.page, view);
          assert.equal(await escopo(a.page).locator('[data-fv-filter="periodo"]').inputValue(), '2026-10');
          assert.equal(await escopo(a.page).locator('[data-fv-filter="obraId"]').inputValue(), ids.b);
          const e = await a.envelope();
          assert.deepEqual(e.visao.obras.map(o => o.id), [ids.b]);
          assert.equal(e.visao.totais.pendenteContratoCentavos, 40000);
          assert.equal(e.visao.saldo.totalCentavos, 100000);
          assert.equal(Math.round(e.visao.dre.empresa.dados.resultado * 100), 45480);
          await semOverflow(a.page);
        }
        await a.conferirIsolamento();
      } finally { await a.fechar(); }
    });

    await t.test('analise mostra obras filtradas, valor zero/negativo, m² e modal com fonte FP', async () => {
      const a = await abrir(browser); try {
        await a.pronto(); await navegar(a.page, 'relatorio');
        await filtrar(a.page, 'periodo', '2026-10');
        assert.equal(await a.page.locator('#rel-mes:visible').count(), 0, 'Filtro legado nao pode competir com compartilhado');
        await filtrar(a.page, 'obraId', ids.negativa);
        const e = await a.envelope();
        assert.equal(e.visao.totais.carteiraCentavos, 0); assert.equal(e.visao.totais.diferencaRecebidoCustoCentavos, -25000);
        const botoesObras = await escopo(a.page).locator('[data-work]').evaluateAll(xs => [...new Set(xs
          .filter(el => el.getBoundingClientRect().width && el.getBoundingClientRect().height).map(el => el.dataset.work))]);
        assert.ok(botoesObras.includes(ids.negativa));
        assert.ok(!botoesObras.includes(ids.a) && !botoesObras.includes(ids.b) && !botoesObras.includes(ids.c));
        assert.match(await escopo(a.page).innerText(), /m[²2]/);
        await filtrar(a.page, 'obraId', ids.a);
        for (const [chave, valor, base] of [['contractM2', '12,50', '1.000,00'], ['costM2', '7,50', '600,00']]) {
          assert.equal(await escopo(a.page).locator('.work-card [data-detail="' + chave + '"]').innerText(), 'R$\u00a0' + valor);
          const detalhe = await modal(a.page, 'analise', chave);
          const texto = (await detalhe.locator('[data-fv-detail-body]').innerText()).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          assert.match(texto, /area cadastrada/);
          assert.match(texto, /\u00f7/);
          assert.match(texto, /80 m/);
          assert.ok(texto.includes(base) && texto.includes(valor), 'Detalhe deve mostrar base e valor por metro quadrado');
          if (chave === 'costM2') { assert.match(texto, /custo.*acumulado/i); assert.match(texto, /todos os periodos/i); }
          await captura(a.page, chave + '-modal-desktop-sintetico');
          await detalhe.locator('[data-fv-action="fechar"]').click(); await detalhe.waitFor({ state: 'hidden' });
        }
        await navegar(a.page, 'raiox');
        const dialog = await modal(a.page, 'raiox', 'folha');
        await captura(a.page, 'folha-modal-desktop-sintetico');
        assert.match(await dialog.innerText(), /folha|FP|m[aã]o de obra/i);
        assert.match(await dialog.innerText(), /pagamento|pag[oa]|compet[eê]ncia/i);
        await dialog.locator('[data-fv-action="fechar"]').click(); await dialog.waitFor({ state: 'hidden' });
        await navegar(a.page, 'relatorio');
        await captura(a.page, 'analise-desktop-sintetica'); await a.conferirIsolamento();
      } finally { await a.fechar(); }
    });

    await t.test('modal abre e fecha, reage ao filtro e permite navegacao com nova montagem', async () => {
      const a = await abrir(browser); try {
        await a.pronto();
        let dialog = await modal(a.page, 'dashboard');
        await dialog.locator('[data-fv-action="fechar"]').click(); await dialog.waitFor({ state: 'hidden' });
        dialog = await modal(a.page, 'dashboard');
        await a.page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
        await filtrar(a.page, 'periodo', '2026-11');
        assert.equal((await a.envelope()).visao.totais.recebidoPeriodoCentavos, 2000);
        assert.equal((await a.envelope()).visao.totais.pendenteContratoCentavos, 40000);
        dialog = await modal(a.page, 'dashboard');
        assert.ok((await dialog.innerText()).length > 30);
        await dialog.locator('[data-fv-action="fechar"]').click();
        await navegar(a.page, 'raiox'); await captura(a.page, 'raiox-desktop-sintetico');
        await navegar(a.page, 'dre'); await captura(a.page, 'dre-desktop-sintetica');
        await a.conferirIsolamento();
      } finally { await a.fechar(); }
    });

    await t.test('falha de fonte fica desconhecida, conserva fonte confirmada e retry publica novo snapshot', async () => {
      const a = await abrir(browser, { config: { falharTabela: 'repasses_cef' } }); try {
        await a.pronto();
        let e = await a.envelope();
        assert.equal(e.visao.status, 'parcial'); assert.equal(e.visao.totais.recebidoPeriodoCentavos, null);
        assert.equal(e.visao.totais.pendenteContratoCentavos, null); assert.equal(e.visao.saldo.totalCentavos, 100000);
        assert.match(await escopo(a.page).innerText(), /n[aã]o avaliad|indispon[ií]vel|n[aã]o confirmad|desconhecid/i);
        await captura(a.page, 'fonte-indisponivel-desktop-sintetica');
        await a.controlar({ falharTabela: null }); await atualizar(a);
        e = await a.envelope(); assert.equal(e.visao.status, 'confirmada'); assert.equal(e.visao.totais.pendenteContratoCentavos, 40000);
        await a.conferirIsolamento();
      } finally { await a.fechar(); }
    });

    await t.test('ausencia de abertura e falha do ledger nunca apresentam receita menos custo como disponibilidade', async () => {
      const dados = fixture(); dados.ledger = { company_id: ids.empresa, contas: [], movimentos: [], pagamentos: [], total_centavos: 0 };
      const a = await abrir(browser, { dados }); try {
        await a.pronto(); await escopo(a.page).locator('[data-fv-tab="financeiro"]').click();
        let e = await a.envelope(); assert.equal(e.visao.saldo.status, 'sem_abertura'); assert.equal(e.visao.saldo.totalCentavos, null);
        assert.match(await escopo(a.page).innerText(), /abertura.*pendente|abertura.*declar|declar.*abertura/i);
        await a.controlar({ falharLedger: true }); await atualizar(a);
        e = await a.envelope(); assert.equal(e.visao.saldo.status, 'indisponivel'); assert.equal(e.visao.saldo.totalCentavos, null);
        assert.equal(e.visao.totais.pendenteContratoCentavos, 40000);
        await a.conferirIsolamento();
      } finally { await a.fechar(); }
    });

    await t.test('carregamento inicial e atualizacao retiram valores ate as fontes serem confirmadas', async () => {
      const a = await abrir(browser, { config: { atrasarTabela: 'obras' } }); try {
        await a.page.waitForFunction(() => typeof window.__financeiroQa.liberar === 'function');
        assert.equal((await a.envelope()).fase, 'carregando');
        assert.equal(await escopo(a.page).locator('.metric-value').count(), 0);
        assert.match(await escopo(a.page).innerText(), /consultando fontes|confirma.*fontes/i);
        assert.equal(await escopo(a.page).locator('[data-fv-action="exportar"]').isDisabled(), true);
        await a.page.evaluate(() => { window.__financeiroQa.liberar(); window.__financeiroQa.liberar = null; });
        await a.pronto(); assert.equal((await a.envelope()).visao.saldo.totalCentavos, 100000);
        await a.controlar({ atrasarTabela: 'obras' });
        await escopo(a.page).locator('[data-fv-action="atualizar"]').click();
        await a.page.waitForFunction(() => typeof window.__financeiroQa.liberar === 'function');
        assert.equal((await a.envelope()).fase, 'carregando');
        assert.equal(await escopo(a.page).locator('.metric-value').count(), 0);
        assert.equal(await escopo(a.page).locator('[data-fv-action="atualizar"]').isDisabled(), true);
        await a.page.evaluate(() => { window.__financeiroQa.liberar(); window.__financeiroQa.liberar = null; });
        await a.pronto(); assert.ok(await escopo(a.page).locator('.metric-value').count() > 0);
        await a.conferirIsolamento();
      } finally { await a.fechar(); }
    });

    await t.test('reload refaz leitura e preserva view de navegacao sem persistir snapshot financeiro', async () => {
      const a = await abrir(browser); try {
        await a.pronto(); await navegar(a.page, 'raiox');
        await a.page.reload(); await a.pronto();
        await a.page.locator('#view-raiox.active .edr-financial').waitFor();
        const transporte = await a.page.evaluate(() => ({ consultas: window.__financeiroQa.consultas.length,
          keys: Object.keys(localStorage), rpc: window.__financeiroQa.rpc }));
        assert.ok(transporte.consultas > 10, 'Reload deve consultar paginas, nao ler snapshot do storage');
        assert.ok(transporte.rpc.includes('caixa_estado'));
        assert.deepEqual(transporte.keys, ['edr_last_view']);
        assert.equal((await a.envelope()).visao.saldo.totalCentavos, 100000);
        await a.conferirIsolamento();
      } finally { await a.fechar(); }
    });

    await t.test('exportacao usa obra/periodo filtrados e nao imprime obras ocultas por outro helper', async () => {
      const a = await abrir(browser); try {
        await a.pronto(); await navegar(a.page, 'relatorio');
        await filtrar(a.page, 'periodo', '2026-10'); await filtrar(a.page, 'obraId', ids.b);
        const popupPromise = a.page.waitForEvent('popup');
        await escopo(a.page).locator('[data-fv-action="exportar"]').click();
        const popup = await popupPromise;
        await popup.waitForLoadState('domcontentloaded');
        const texto = await popup.locator('body').innerText();
        assert.match(texto, /CASA SINTETICA BETA/);
        assert.doesNotMatch(texto, /CASA SINTETICA ALFA|CASA SINTETICA ARQUIVADA|CASA SINTETICA NEGATIVA/);
        assert.match(texto, /2026-10|outubro|Outubro|OUTUBRO/);
        await popup.close(); await a.conferirIsolamento();
      } finally { await a.fechar(); }
    });

    await t.test('mobile navega pelas telas reais, cruza filtros e mantem modal e conteudo dentro do viewport', async () => {
      const a = await abrir(browser, { viewport: { width: 390, height: 844 } }); try {
        await a.pronto(); await semOverflow(a.page); await captura(a.page, 'resumo-mobile-sintetico');
        await escopo(a.page).locator('[data-fv-tab="financeiro"]').click(); await semOverflow(a.page); await captura(a.page, 'financeiro-mobile-sintetico');
        await filtrar(a.page, 'situacao', 'arquivadas'); await filtrar(a.page, 'obraId', ids.c);
        assert.deepEqual((await a.envelope()).visao.obras.map(o => o.id), [ids.c]);
        assert.equal((await a.envelope()).visao.totais.excedenteContratoCentavos, 5000);
        for (const [view, tipo] of [['relatorio', 'analise'], ['raiox', 'raiox'], ['dre', 'dre']]) {
          await navegar(a.page, view); await semOverflow(a.page);
          assert.equal(await escopo(a.page).locator('[data-fv-filter="obraId"]').inputValue(), ids.c);
          const dialog = await modal(a.page, tipo);
          const box = await dialog.boundingBox(); assert.ok(box.x >= -1 && box.x + box.width <= 391, 'Dialog mobile fora do viewport');
          await captura(a.page, 'metodo-' + tipo + '-mobile-sintetico');
          await dialog.locator('[data-fv-action="fechar"]').click(); await dialog.waitFor({ state: 'hidden' });
          await captura(a.page, tipo + '-mobile-sintetico');
          if (tipo === 'dre') { await colunaDreAcessivel(a.page, true); await captura(a.page, 'dre-valores-mobile-sinteticos'); }
        }
        await a.conferirIsolamento();
      } finally { await a.fechar(); }
    });

    await t.test('mobile 320 mostra as quatro telas, numeros inteiros e duas colunas DRE sem rolagem', async () => {
      const a = await abrir(browser, { viewport: { width: 320, height: 740 } }); try {
        await a.pronto(); await filtrar(a.page, 'periodo', '2026-10');
        for (const [view, tipo] of [['dashboard', 'dashboard'], ['relatorio', 'analise'], ['raiox', 'raiox'], ['dre', 'dre']]) {
          if (view !== 'dashboard') await navegar(a.page, view);
          assert.equal(await escopo(a.page).getAttribute('data-fv-view'), tipo);
          assert.equal((await a.envelope()).visao.saldo.totalCentavos, 100000);
          if (tipo === 'dashboard') assert.equal(await escopo(a.page).locator('.metric.featured[data-detail="cash"] .metric-value').innerText(), 'R$\u00a01.000,00');
          assert.equal(await escopo(a.page).locator('[role="alert"]').count(), 0);
          await semOverflow(a.page);
          if (tipo === 'dre') await colunaDreAcessivel(a.page, true);
          await captura(a.page, tipo + '-mobile-320-sintetico');
        }
        await navegar(a.page, 'dashboard');
        await escopo(a.page).locator('[data-fv-tab="financeiro"]').click();
        assert.equal(await escopo(a.page).locator('.metric.featured[data-detail="cash"] .metric-value').innerText(), 'R$\u00a01.000,00');
        await semOverflow(a.page); await captura(a.page, 'financeiro-mobile-320-sintetico');
        await a.conferirIsolamento();
      } finally { await a.fechar(); }
    });

    await t.test('filtro de obra e situacao incompativeis conserva banco e dinheiro gerais no financeiro', async () => {
      const a = await abrir(browser); try {
        await a.pronto(); await escopo(a.page).locator('[data-fv-tab="financeiro"]').click();
        await filtrar(a.page, 'obraId', ids.a); await filtrar(a.page, 'situacao', 'arquivadas');
        const e = await a.envelope();
        assert.deepEqual(e.visao.obras, []);
        assert.equal(e.visao.saldo.totalCentavos, 100000);
        assert.match(await escopo(a.page).innerText(), /Banco|C6|Dinheiro/i);
        assert.equal(await escopo(a.page).locator('.metric.featured[data-detail="cash"] .metric-value').innerText(), 'R$\u00a01.000,00');
        await semOverflow(a.page); await a.conferirIsolamento();
      } finally { await a.fechar(); }
    });

    await t.test('nome de obra nulo aceito pela leitura nao remove a consulta nem quebra a montagem', async () => {
      const dados = fixture(); dados.obras[0].nome = null;
      const a = await abrir(browser, { dados }); try {
        await a.pronto(); await filtrar(a.page, 'obraId', ids.a);
        assert.equal((await a.envelope()).visao.obras[0].id, ids.a);
        assert.equal(await escopo(a.page).locator('[role="alert"]').count(), 0);
        assert.ok(await escopo(a.page).locator('.metric').count() > 0);
        await navegar(a.page, 'relatorio');
        assert.equal(await escopo(a.page).locator('[role="alert"]').count(), 0);
        assert.ok(await escopo(a.page).locator('[data-work="' + ids.a + '"]').count() > 0);
        await a.conferirIsolamento();
      } finally { await a.fechar(); }
    });

    await t.test('falha de renderizacao retira valores anteriores e permite nova consulta explicita', async () => {
      const a = await abrir(browser); try {
        await a.pronto(); await navegar(a.page, 'relatorio');
        assert.match(await escopo(a.page).locator('[data-fv-content]').innerText(), /CASA SINTETICA ALFA/);
        await a.page.evaluate(() => {
          window.__paginasQaOriginal = window.FinanceiroVisaoPaginas;
          window.FinanceiroVisaoPaginas = { ...window.FinanceiroVisaoPaginas, renderizar() { throw new Error('FALHA_SINTETICA_DE_RENDER'); } };
          FinanceiroVisaoPonte.setFiltro({ obraId: window.__financeiroQa.dados.obras[1].id });
        });
        await escopo(a.page).locator('[role="alert"]').waitFor();
        assert.match(await escopo(a.page).innerText(), /valores anteriores foram retirados/i);
        assert.doesNotMatch(await escopo(a.page).innerText(), /CASA SINTETICA ALFA|CASA SINTETICA BETA/);
        await a.page.evaluate(() => { window.FinanceiroVisaoPaginas = window.__paginasQaOriginal; delete window.__paginasQaOriginal; });
        await escopo(a.page).locator('[data-fv-action="atualizar"]').click(); await a.pronto();
        await a.page.waitForFunction(() => !document.querySelector('#view-relatorio.active .edr-financial [role="alert"]'));
        assert.match(await escopo(a.page).locator('[data-fv-content]').innerText(), /CASA SINTETICA BETA/);
        assert.doesNotMatch(await escopo(a.page).locator('[data-fv-content]').innerText(), /CASA SINTETICA ALFA/);
        await a.conferirIsolamento();
      } finally { await a.fechar(); }
    });

    await t.test('novos cards conciliam recebido menos todos custos por origem e preservam referencia DRE sem ajuste', async () => {
      const a = await abrir(browser, { dados: fixtureComposicao() }); try {
        await a.pronto(); await navegar(a.page, 'relatorio');
        await filtrar(a.page, 'periodo', '2026-10'); await filtrar(a.page, 'obraId', ids.a);
        assert.equal(await a.page.evaluate(() => typeof FinanceiroVisaoComposicao.construir), 'function');
        const c = await composicao(a.page);
        assert.equal(c.status, 'confirmada'); assert.equal(c.recebidoCentavos, 142000);
        assert.equal(c.custoCentavos, 38001); assert.equal(c.resultadoCentavos, 103999);
        const cats = Object.fromEntries(c.categorias.map(cat => [cat.id, cat.centavos]));
        assert.equal(cats.material_servicos, 30000); assert.equal(cats.mao, 2501);
        assert.equal(cats.impostos, 1000); assert.equal(cats.tecnologia, 500); assert.equal(cats.terreno, 4000);
        assert.equal(c.categorias.reduce((n, cat) => n + cat.centavos, 0), 38001);
        assert.equal(c.margemConstrucao.resultadoCentavos, 109499);
        assert.equal(c.margemConstrucao.engineResultadoCentavos, 109498);
        assert.equal(c.margemConstrucao.diferencaArredondamentoCentavos, 1);
        assert.equal(c.acumulado.maoCentavos, 7501); assert.equal(c.acumulado.areaM2, 80); assert.equal(c.acumulado.maoPorM2Centavos, 94);
        const origens = new Set(a.dados.lancamentos.map(l => l.id).concat(a.dados.repasses_cef.map(r => r.id), a.dados.adicional_pagamentos.map(p => p.id)));
        assert.ok(c.linhas.length > 0 && c.linhas.every(l => origens.has(l.id)), 'Nenhum lancamento compensatorio pode ser fabricado');
        assert.equal(await campoCard(a.page, 'received').innerText(), 'R$\u00a01.420,00');
        assert.equal(await campoCard(a.page, 'cost').innerText(), 'R$\u00a0380,01');
        assert.equal(await campoCard(a.page, 'resultReceipts').innerText(), 'R$\u00a01.039,99');
        assert.equal(await campoCard(a.page, 'laborM2').innerText(), 'R$\u00a00,94');
        assert.match(textoSemAcentos(await campoCard(a.page, 'cost').locator('..').innerText()), /Custos e despesas lancados/);
        assert.match(textoSemAcentos(await campoCard(a.page, 'resultReceipts').locator('..').innerText()), /Resultado sobre recebimentos/);
        await semOverflow(a.page); await captura(a.page, 'cartoes-composicao-desktop-sinteticos');
        const result = await modal(a.page, 'analise', 'resultReceipts');
        const comparacao = result.locator('details.receivable-detail-work').filter({ hasText: 'Por que difere' });
        assert.equal(await comparacao.count(), 1);
        await comparacao.locator('summary').click(); assert.equal(await comparacao.evaluate(el => el.open), true);
        await textosDoDialogCabem(result);
        const texto = textoSemAcentos(await result.locator('[data-fv-detail-body]').innerText());
        assert.match(texto, /Resultado sobre recebimentos/); assert.match(texto, /centavos por origem/);
        for (const rotulo of ['Materiais', 'Mao de obra', 'Impostos', 'Tecnologia', 'Terreno']) assert.ok(texto.includes(rotulo));
        for (const valor of ['1.420,00', '380,01', '1.039,99', '300,00', '25,01', '10,00', '5,00', '40,00', '1.094,99', '1.094,98']) assert.ok(texto.includes(valor), 'Composicao deve expor valor real ' + valor);
        assert.match(texto, /DRE/); assert.match(texto, /decimais brutos/); assert.match(texto, /nao cria ajuste compensatorio/);
        await captura(a.page, 'resultado-composicao-modal-desktop-sintetico'); await fecharDetalhe(result);
        const labor = await modal(a.page, 'analise', 'laborM2');
        const mao = textoSemAcentos(await labor.locator('[data-fv-detail-body]').innerText());
        assert.match(mao, /acumulad/i); assert.match(mao, /80 m/); assert.match(mao, /75,01/); assert.match(mao, /0,94/);
        assert.match(mao, /parcial|cobertura|nao.*complet/i);
        await captura(a.page, 'labor-m2-modal-desktop-sintetico'); await fecharDetalhe(labor);
        await a.conferirIsolamento();
      } finally { await a.fechar(); }
    });

    await t.test('resultado segue mes obra e arquivadas enquanto mao por metro permanece acumulada', async () => {
      const a = await abrir(browser, { dados: fixtureComposicao() }); try {
        await a.pronto(); await navegar(a.page, 'relatorio'); await filtrar(a.page, 'obraId', ids.a);
        for (const [periodo, resultado, recebido, custo] of [['2026-09', '-R$\u00a050,00', 20000, 25000], ['2026-10', 'R$\u00a01.039,99', 142000, 38001], ['2026-11', 'R$\u00a020,00', 2000, 0], ['', 'R$\u00a01.009,99', 164000, 63001]]) {
          await filtrar(a.page, 'periodo', periodo);
          const c = await composicao(a.page); assert.equal(c.recebidoCentavos, recebido); assert.equal(c.custoCentavos, custo);
          assert.equal(await campoCard(a.page, 'resultReceipts').innerText(), resultado);
          assert.equal(await campoCard(a.page, 'laborM2').innerText(), 'R$\u00a00,94');
          assert.match(textoSemAcentos(await campoCard(a.page, 'laborM2').locator('..').innerText()), /acumulado/i);
        }
        await filtrar(a.page, 'periodo', '2026-10'); await filtrar(a.page, 'obraId', ids.b);
        assert.equal(await campoCard(a.page, 'resultReceipts', ids.b).innerText(), '-R$\u00a0200,00');
        assert.equal(await campoCard(a.page, 'laborM2', ids.b).innerText(), 'R$\u00a00,00');
        await filtrar(a.page, 'situacao', 'arquivadas'); await filtrar(a.page, 'obraId', ids.c);
        assert.equal(await campoCard(a.page, 'resultReceipts', ids.c).innerText(), 'R$\u00a00,00');
        await filtrar(a.page, 'periodo', '');
        assert.equal(await campoCard(a.page, 'resultReceipts', ids.c).innerText(), 'R$\u00a0350,00');
        const idsVisiveis = await escopo(a.page).locator('.work-card [data-work]').evaluateAll(xs => [...new Set(xs.map(x => x.dataset.work))]);
        assert.deepEqual(idsVisiveis, [ids.c]); await a.conferirIsolamento();
      } finally { await a.fechar(); }
    });

    await t.test('area ausente zero negativa e fonte de custo falha deixam indicadores desconhecidos', async () => {
      for (const area of [null, 0, -80]) {
        const dados = fixtureComposicao(); dados.obras[0].area_m2 = area;
        const a = await abrir(browser, { dados }); try {
          await a.pronto(); await navegar(a.page, 'relatorio'); await filtrar(a.page, 'periodo', '2026-10'); await filtrar(a.page, 'obraId', ids.a);
          assert.equal(await campoCard(a.page, 'resultReceipts').innerText(), 'R$\u00a01.039,99');
          for (const chave of ['contractM2', 'costM2', 'laborM2']) assert.equal(await campoCard(a.page, chave).innerText(), 'Indispon\u00edvel');
          assert.equal((await composicao(a.page)).acumulado.maoPorM2Centavos, null);
          const dialog = await modal(a.page, 'analise', 'laborM2');
          assert.match(textoSemAcentos(await dialog.locator('[data-fv-detail-body]').innerText()), /area.*ausente|area.*invalida|area.*zero|area.*indisponivel/i);
          await fecharDetalhe(dialog); await a.conferirIsolamento();
        } finally { await a.fechar(); }
      }
      const a = await abrir(browser, { dados: fixtureComposicao(), config: { falharTabela: 'lancamentos' } }); try {
        await a.pronto(); await navegar(a.page, 'relatorio'); await filtrar(a.page, 'periodo', '2026-10'); await filtrar(a.page, 'obraId', ids.a);
        assert.equal(await campoCard(a.page, 'received').innerText(), 'R$\u00a01.420,00');
        for (const chave of ['cost', 'resultReceipts', 'costM2', 'laborM2']) assert.equal(await campoCard(a.page, chave).innerText(), 'Indispon\u00edvel');
        const c = await composicao(a.page); assert.equal(c.custoCentavos, null); assert.equal(c.resultadoCentavos, null); assert.equal(c.acumulado.maoCentavos, null);
        await a.controlar({ falharTabela: null }); await atualizar(a);
        assert.equal(await campoCard(a.page, 'resultReceipts').innerText(), 'R$\u00a01.039,99');
        assert.equal(await campoCard(a.page, 'laborM2').innerText(), 'R$\u00a00,94'); await a.conferirIsolamento();
      } finally { await a.fechar(); }
    });

    await t.test('diagnostico de folha desconhecido preserva mao lancada com aviso de cobertura parcial', async () => {
      const a = await abrir(browser, { dados: fixtureComposicao(), config: { falharTabela: 'diarias' }, viewport: { width: 390, height: 844 } }); try {
        await a.pronto(); await navegar(a.page, 'relatorio'); await filtrar(a.page, 'obraId', ids.a);
        const c = await composicao(a.page); assert.equal(c.acumulado.maoPorM2Centavos, 94);
        assert.equal(c.acumulado.folha.estado, 'nao_avaliado'); assert.notEqual(c.acumulado.folha.cobertura, 'confirmada');
        assert.equal(await campoCard(a.page, 'laborM2').innerText(), 'R$\u00a00,94');
        const card = escopo(a.page).locator('.work-card');
        assert.match(textoSemAcentos(await card.innerText()), /nao.*confirmad|nao.*possivel.*afirmar|parcial/i);
        await captura(a.page, 'cartao-folha-desconhecida-mobile-sintetico');
        const dialog = await modal(a.page, 'analise', 'laborM2');
        const texto = textoSemAcentos(await dialog.locator('[data-fv-detail-body]').innerText());
        assert.match(texto, /parcial|nao.*confirmad|nao.*possivel/i); assert.match(texto, /75,01/);
        assert.doesNotMatch(texto, /PESSOA SINTETICA/);
        await fecharDetalhe(dialog); await semOverflow(a.page); await a.conferirIsolamento();
      } finally { await a.fechar(); }
    });

    await t.test('exportacao dos novos cards preserva resultado mao acumulada e filtro sem obras ocultas', async () => {
      const a = await abrir(browser, { dados: fixtureComposicao() }); try {
        await a.pronto(); await navegar(a.page, 'relatorio'); await filtrar(a.page, 'periodo', '2026-10'); await filtrar(a.page, 'obraId', ids.a);
        const popupPromise = a.page.waitForEvent('popup'); await escopo(a.page).locator('[data-fv-action="exportar"]').click();
        const popup = await popupPromise; await popup.waitForLoadState('domcontentloaded');
        const texto = textoSemAcentos(await popup.locator('body').innerText());
        assert.match(texto, /CASA SINTETICA ALFA/); assert.doesNotMatch(texto, /CASA SINTETICA BETA|CASA SINTETICA ARQUIVADA|CASA SINTETICA NEGATIVA/);
        assert.match(texto, /Resultado sobre recebimentos/); assert.match(texto, /Custos e despesas lancados/);
        assert.match(texto, /1.039,99/); assert.match(texto, /380,01/); assert.match(texto, /0,94/);
        assert.match(texto, /acumulado/i); assert.match(texto, /parcial|nao.*comprova|nao.*confirma/i);
        assert.match(texto, /outubro|2026-10/i);
        await popup.close(); await a.conferirIsolamento();
      } finally { await a.fechar(); }
    });

    await t.test('cards e novos detalhes desktop 390 e 320 mostram valores longos e percentual sem corte ou sobreposicao', async () => {
      const dados = fixtureComposicao(); dados.obras[0].area_m2 = 1;
      const antigo = dados.lancamentos.find(l => l.obra_id === ids.a);
      dados.lancamentos = dados.lancamentos.filter(l => l.obra_id !== ids.a).concat({ ...antigo, total: '90071992547409.91', etapa: '28_mao', data: '2026-10-10', obs: null });
      const recebido = dados.repasses_cef.find(r => r.obra_id === ids.a);
      dados.repasses_cef = dados.repasses_cef.filter(r => r.obra_id !== ids.a).concat({ ...recebido, valor: '0.01', data_credito: '2026-10-10' });
      const adicionaisIds = new Set(dados.obra_adicionais.filter(ad => ad.obra_id === ids.a).map(ad => ad.id));
      dados.obra_adicionais = dados.obra_adicionais.filter(ad => ad.obra_id !== ids.a);
      dados.adicional_pagamentos = dados.adicional_pagamentos.filter(p => !adicionaisIds.has(p.adicional_id));
      for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 320, height: 740 }]) {
        const a = await abrir(browser, { dados, viewport }); try {
          await a.pronto(); await navegar(a.page, 'relatorio'); await filtrar(a.page, 'periodo', '2026-10'); await filtrar(a.page, 'obraId', ids.a);
          assert.equal(await campoCard(a.page, 'received').innerText(), 'R$\u00a00,01');
          assert.equal(await campoCard(a.page, 'laborM2').innerText(), 'R$\u00a090.071.992.547.409,91');
          const c = await composicao(a.page); assert.equal(c.acumulado.maoPorM2Centavos, Number.MAX_SAFE_INTEGER);
          assert.equal(c.resultadoCentavos, -9007199254740990); assert.ok(Number.isFinite(c.resultadoPct));
          await captura(a.page, 'cartoes-valores-largos-' + viewport.width + '-sinteticos'); await semOverflow(a.page);
          for (const chave of ['resultReceipts', 'laborM2']) {
            const dialog = await modal(a.page, 'analise', chave);
            if (chave === 'resultReceipts') {
              const principal = dialog.locator('.detail-value');
              assert.equal(await principal.count(), 1); assert.equal(await principal.evaluate(el => el.classList.contains('fv-negative')), true);
              assert.match(await principal.innerText(), /^-R\$/);
              const cores = await principal.evaluate(el => {
                const css = getComputedStyle(el), token = css.getPropertyValue('--error').trim();
                const hex = /^#([0-9a-f]{6})$/i.exec(token);
                const erro = hex ? 'rgb(' + [0, 2, 4].map(i => Number.parseInt(hex[1].slice(i, i + 2), 16)).join(', ') + ')' : token;
                return { exibida: css.color, erro };
              });
              assert.ok(cores.erro); assert.equal(cores.exibida, cores.erro, 'Resultado negativo do drawer deve usar a cor de erro EDR');
            }
            const box = await dialog.boundingBox(); assert.ok(box.x >= -1 && box.x + box.width <= viewport.width + 1);
            assert.ok((await dialog.locator('[data-fv-detail-body]').innerText()).length > 40);
            await captura(a.page, chave + '-modal-' + viewport.width + '-sintetico'); await fecharDetalhe(dialog);
          }
          await a.conferirIsolamento();
        } finally { await a.fechar(); }
      }
    });

    await t.test('valores monetarios largos e fontes indisponiveis nao sao cortados nos cartoes mobile', async () => {
      const dados = fixture();
      dados.obras[0].valor_venda = '987654321.99';
      dados.ledger.contas[0].abertura_centavos = 98765432199;
      dados.ledger.contas[0].saldo_centavos = 98765432199;
      dados.ledger.contas[1].abertura_centavos = 12345678900;
      dados.ledger.contas[1].saldo_centavos = 12345678900;
      dados.ledger.total_centavos = 111111111099;
      for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 740 }]) {
        const sufixo = viewport.width === 390 ? '' : '-320';
        const a = await abrir(browser, { dados, viewport }); try {
          await a.pronto(); await captura(a.page, 'valores-largos-resumo-mobile-sinteticos' + sufixo); await semOverflow(a.page);
          assert.equal((await a.envelope()).visao.saldo.totalCentavos, 111111111099);
          assert.equal(await escopo(a.page).locator('.metric.featured[data-detail="cash"] .metric-value').innerText(), 'R$\u00a01.111.111.110,99');
          assert.equal(await escopo(a.page).locator('.receivable-total[data-detail="receivables"] > strong').innerText(), 'R$\u00a0987.653.481,99');
          await escopo(a.page).locator('[data-fv-tab="financeiro"]').click(); await semOverflow(a.page);
          assert.equal(await escopo(a.page).locator('.metric.featured[data-detail="cash"] .metric-value').innerText(), 'R$\u00a01.111.111.110,99');
          assert.equal(await escopo(a.page).locator('.receivable-total[data-detail="receivables"] > strong').innerText(), 'R$\u00a0987.653.481,99');
          await captura(a.page, 'valores-largos-mobile-sinteticos' + sufixo);
          await navegar(a.page, 'relatorio'); await semOverflow(a.page);
          await navegar(a.page, 'dre'); await semOverflow(a.page);
          await a.controlar({ falharTabela: 'lancamentos' }); await atualizar(a); await semOverflow(a.page);
          assert.equal((await a.envelope()).visao.totais.custoPeriodoCentavos, null);
          await captura(a.page, 'dre-indisponivel-mobile-sintetica' + sufixo);
          await a.conferirIsolamento();
        } finally { await a.fechar(); }
      }
    });
  });
}
