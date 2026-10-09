'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { abrir, fixture, ids } = require('./fixtures/visao-financeira-ui.cjs');
function dadosPlano(pendente = false) {
  const d = fixture();
  d.planosEntrada = { company_id: ids.empresa, planos: [{ obra_id: ids.a, plano_id: ids.a, revisao: 2,
    original_centavos: 10000, total_centavos: 11500, cancelado_centavos: 0, unlinked_centavos: pendente ? 2000 : 0,
    saldo_centavos: 9500, pendencia_conciliacao: pendente, stage: 'confirmed',
    parcelas: [{ id: '00000000-0000-4000-8000-000000000222', label: 'Parcela aprovada TESTE', due: null, method: '', remaining: 9500 }] }] };
  d.projecoes_caixa = [
    { id: 'avulsa-entrada', company_id: ids.empresa, obra_id: ids.a, tipo: 'entrada_cliente', valor: 100, data_prevista: '2026-11-01', descricao: 'PREVISAO DUPLICADA TESTE' },
    { id: 'avulsa-cef', company_id: ids.empresa, obra_id: ids.a, tipo: 'repasse_cef', valor: 200, data_prevista: '2026-11-01', descricao: 'REPASSE CEF TESTE' }
  ];
  return d;
}
if (!process.env.EDR_PLAYWRIGHT_PATH || !process.env.EDR_CHROMIUM_PATH) {
  test('projeções de entrada no Caixa real', { skip: 'Defina os caminhos existentes de Playwright e Chromium.' }, () => {});
} else {
  test('Caixa e visões financeiras reais usam projeção aprovada em leitura isolada', { timeout: 90000 }, async t => {
    const { chromium } = require(process.env.EDR_PLAYWRIGHT_PATH);
    const browser = await chromium.launch({ headless: true, executablePath: process.env.EDR_CHROMIUM_PATH });
    t.after(() => browser.close());
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
      await t.test('parcelas, desconhecido e conciliação em ' + viewport.width + 'px', async () => {
        const a = await abrir(browser, { dados: dadosPlano(), viewport });
        try {
          await a.pronto();
          const inicial = await a.envelope();
          assert.equal(inicial.visao.obras.find(o => o.id === ids.a).contratoOriginalCentavos, 100000);
          assert.equal(inicial.visao.obras.find(o => o.id === ids.a).ajusteEntradaCentavos, 1500);
          assert.equal(inicial.visao.obras.find(o => o.id === ids.a).contratoPrevistoCentavos, 101500);
          assert.equal(inicial.visao.saldo.totalCentavos, 100000);
          await a.page.evaluate(() => setView('caixa'));
          const content = a.page.locator('#caixa-content');
          await content.getByText('Parcela aprovada TESTE', { exact: false }).waitFor();
          let texto = await content.innerText();
          assert.match(texto, /Data aguardando definição/); assert.match(texto, /R\$\s*95,00/);
          assert.match(texto, /REPASSE CEF TESTE/); assert.doesNotMatch(texto, /PREVISAO DUPLICADA TESTE/);
          assert.match(texto, /substituída\(s\)/); assert.match(texto, /Avisos automáticos aguardam configuração/);
          assert.match(texto, /TOTAL DISPONÍVEL\s*R\$\s*1\.000,00/);
          const qa = process.env.EDR_QA_ARTIFACT_DIR;
          if (qa) { fs.mkdirSync(qa, { recursive: true }); await a.page.screenshot({ path: path.join(qa, 'caixa-planos-' + viewport.width + '.png'), fullPage: true }); }
          await a.controlar({ falharPlanos: true });
          await a.page.evaluate(() => renderCaixa());
          texto = await content.innerText(); assert.match(texto, /Previsões não confirmadas/); assert.doesNotMatch(texto, /Parcela aprovada TESTE/);
          assert.match(texto, /TOTAL DISPONÍVEL\s*R\$\s*1\.000,00/);
          await a.controlar({ falharPlanos: false });
          await a.page.evaluate(() => { window.__financeiroQa.dados.planosEntrada.planos[0].pendencia_conciliacao = true; window.__financeiroQa.dados.planosEntrada.planos[0].unlinked_centavos = 2000; return renderCaixa(); });
          texto = await content.innerText(); assert.match(texto, /aguardando vínculo ao plano/); assert.match(texto, /Parcelas previstas e avisos aguardam conciliação/);
          assert.doesNotMatch(texto, /Parcela aprovada TESTE/); assert.doesNotMatch(texto, /PREVISAO DUPLICADA TESTE/);
          assert.match(texto, /REPASSE CEF TESTE/);
          const tamanho = await a.page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
          assert.ok(tamanho.scroll <= tamanho.width + 1, 'Caixa sem overflow de página');
          await a.conferirIsolamento();
        } finally { await a.fechar(); }
      });
    }
  });
}