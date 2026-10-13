'use strict';

// Somente Chromium isolado e dados sinteticos. Nenhuma chamada ao EDR real.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const repo = path.resolve(__dirname, '..');
const source = file => fs.readFileSync(path.join(repo, file), 'utf8');
const playwrightModule = process.env.EDR_PLAYWRIGHT_MODULE;
const chromiumExecutable = process.env.EDR_CHROMIUM_EXECUTABLE;

if (!playwrightModule || !chromiumExecutable) {
  test('Cadastros: regressao de contexto HTML no Chromium', {
    skip: 'Defina EDR_PLAYWRIGHT_MODULE e EDR_CHROMIUM_EXECUTABLE existentes; nada sera instalado.'
  }, () => {});
} else {
  test('Cadastros: contextos HTML, eventos e limpeza de relatorio', async t => {
    const { chromium } = require(playwrightModule);
    const browser = await chromium.launch({ headless: true, executablePath: chromiumExecutable });
    t.after(() => browser.close());
    const payloads = [
      'João D\'Ávila "Filho" & Cia',
      '&#39;);window.__executou++;//',
      'x" onpointerenter="window.__executou++" data-extra="',
      '<img src=x onerror="window.__executou++">',
      'linha\nbarra\\ &quot; &amp;'
    ];

    async function harness(scripts, html) {
      const context = await browser.newContext({ serviceWorkers: 'block' });
      const page = await context.newPage();
      const errors = [], blocked = [];
      const url = 'http://cadastros.invalid/isolado';
      page.on('pageerror', error => errors.push(error.message));
      await context.route('**/*', route => {
        if (route.request().url() === url) return route.fulfill({
          contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><body>' + html + '</body>'
        });
        blocked.push(route.request().url());
        return route.abort();
      });
      await page.goto(url);
      await page.evaluate(() => {
        window.__executou = 0;
        window.__transporte = [];
        window.usuarioAtual = { id: 'qa-user', nome: 'QA', perfil: 'admin', email: 'qa@example.test' };
        window._companyId = 'qa-company';
        window._supabaseToken = 'qa-token-sem-validade';
        window.obras = [];
        window.PERFIL_VIEWS = { admin: null, operacional: [], mestre: [], visitante: [] };
        window.viewRegistry = { register() {} };
        window.showToast = () => {};
        window.confirmar = async () => false;
        window.fetch = async () => { throw new Error('Rede nao permitida no ensaio sintetico'); };
        window.sbGet = async (...args) => { window.__transporte.push(['get', ...args]); return []; };
        window.sbPatch = async (...args) => { window.__transporte.push(['patch', ...args]); return {}; };
        window.sbPost = async (...args) => { window.__transporte.push(['post', ...args]); return {}; };
        window.sbDelete = async (...args) => { window.__transporte.push(['delete', ...args]); return 1; };
      });
      await page.addScriptTag({ content: source('js/edr-v2-utils-extras.js') });
      for (const script of scripts) await page.addScriptTag({ content: source(script) });
      return { page, errors, blocked, close: () => context.close() };
    }

    await t.test('Usuarios: texto hostil continua sendo argumento literal ao editar/excluir', async () => {
      const h = await harness(['js/edr-v2-auth.js'], '<div id="permissoes-container"></div>');
      try {
        for (const nome of payloads) {
          const user = { id: 'qa-vinculo', user_id: 'qa-auth', role: 'operacional', nome, email: nome + '@example.test' };
          await h.page.evaluate(async user => {
            window.sbGet = async () => [user];
            window.abrirModalEditarUsuario = (...args) => { window.__editArgs = args; };
            window.excluirUsuario = (...args) => { window.__deleteArgs = args; };
            await renderPermissoes();
          }, user);
          await h.page.locator('button[onclick^="abrirModalEditarUsuario("]').click();
          assert.deepEqual(await h.page.evaluate(() => window.__editArgs),
            [user.id, user.user_id, user.nome, user.email, user.role]);
          await h.page.locator('button[onclick^="excluirUsuario("]').click();
          assert.deepEqual(await h.page.evaluate(() => window.__deleteArgs), [user.id, user.nome]);
          assert.equal(await h.page.locator('[onerror], [onpointerenter], [data-extra]').count(), 0);
          assert.equal(await h.page.evaluate(() => window.__executou), 0);
        }
        assert.deepEqual(h.errors, []);
        assert.deepEqual(h.blocked, []);
      } finally { await h.close(); }
    });

    await t.test('Logout e sessao invalida limpam somente os snapshots de relatorio', async () => {
      const h = await harness(['js/edr-v2-auth.js'],
        '<div id="app-shell"></div><div id="login-screen"></div><input id="login-user"><input id="login-pass"><div id="login-error"></div>');
      try {
        const result = await h.page.evaluate(() => {
          window.__clears = 0;
          window.EdrReportTransfer = { clear: () => { window.__clears++; } };
          localStorage.setItem('edr_auth', '{"access_token":"qa"}');
          localStorage.setItem('edr-relatorio-dados', '{"sintetico":true}');
          localStorage.setItem('preferencia-qa', 'preservar');
          fazerLogout();
          const logout = [localStorage.getItem('edr-relatorio-dados'), localStorage.getItem('edr_auth'), window.__clears];
          localStorage.setItem('edr_auth', '{json-invalido');
          localStorage.setItem('edr-relatorio-dados', '{"sintetico":true}');
          const restored = verificarSessao();
          const invalid = [restored, localStorage.getItem('edr-relatorio-dados'), localStorage.getItem('edr_auth'), window.__clears];
          delete window.EdrReportTransfer;
          fazerLogout();
          return { logout, invalid, preference: localStorage.getItem('preferencia-qa') };
        });
        assert.deepEqual(result, { logout: [null, null, 1], invalid: [false, null, null, 2], preference: 'preservar' });
        assert.deepEqual(h.errors, []);
        assert.deepEqual(h.blocked, []);
      } finally { await h.close(); }
    });

    await t.test('Leads: obra selecionada preserva nome e telefone produz link so com digitos', async () => {
      const h = await harness(['js/edr-v2-leads.js'], '<div id="view-leads"></div>');
      try {
        for (const payload of payloads) {
          const input = { id: 'qa-lead', nome: payload, telefone: '(87) 99999-1234 ' + payload, status: 'novo' };
          await h.page.evaluate(input => {
            window.obras = [{ id: 'qa-obra', nome: 'Obra ' + input.nome }];
            LeadsModule.data = [input];
            LeadsModule.historico = [];
            _leadsAbrirModal(input.id);
            _leadsBindAutocomplete();
          }, input);
          const anchor = h.page.locator('#modal-lead-v2 a[href^="https://wa.me/"]');
          assert.equal(await anchor.getAttribute('href'), 'https://wa.me/55' + input.telefone.replace(/\D/g, ''));
          await h.page.locator('#lead-obra-input').fill('Obra');
          assert.equal((await h.page.locator('#lead-obra-dropdown [data-obra-index]').textContent()).trim(), 'Obra ' + payload);
          await h.page.locator('#lead-obra-dropdown [data-obra-index]').click();
          // Inputs de uma linha removem CR/LF ao receber value (comportamento nativo).
          assert.equal(await h.page.locator('#lead-obra-input').inputValue(), ('Obra ' + payload).replace(/[\r\n]/g, ''));
          assert.equal(await h.page.locator('#lead-obra-id').inputValue(), 'qa-obra');
          assert.equal(await h.page.locator('[onerror], [onpointerenter], [data-extra]').count(), 0);
          assert.equal(await h.page.evaluate(() => window.__executou), 0);
          await h.page.evaluate(() => document.getElementById('modal-lead-v2').remove());
        }
        assert.deepEqual(h.errors, []);
        assert.deepEqual(h.blocked, []);
      } finally { await h.close(); }
    });

    await t.test('Leads: handlers de acao mantem o identificador como dado', async () => {
      const h = await harness(['js/edr-v2-leads.js'], '<div id="view-leads"></div>');
      try {
        const id = payloads[1];
        const received = await h.page.evaluate(id => {
          LeadsModule.data = [{ id, nome: 'QA', status: 'novo' }];
          _leadsAbrirModal(id);
          const calls = [];
          for (const name of ['_leadsSalvarAcao', '_leadsAlterarStatus', '_leadsExcluir', '_leadsAdicionarNota']) {
            window[name] = (...args) => calls.push([name, ...args]);
            document.querySelector('button[onclick^="' + name + '("]').click();
          }
          return calls;
        }, id);
        assert.deepEqual(received, [['_leadsSalvarAcao', id], ['_leadsAlterarStatus', id, 'conversa'],
          ['_leadsExcluir', id], ['_leadsAdicionarNota', id]]);
        assert.equal(await h.page.evaluate(() => window.__executou), 0);
        assert.deepEqual(h.errors, []);
        assert.deepEqual(h.blocked, []);
      } finally { await h.close(); }
    });

    await t.test('Diario: autor, clima, obra e fotos nao criam HTML ou eventos', async () => {
      const h = await harness(['js/edr-v2-diario.js'], '<div id="view-diario"></div>');
      try {
        for (const payload of payloads) {
          const record = { id: 'qa-diario', obra_id: 'qa-obra', data: '2001-01-01',
            criado_por: payload, clima: payload, relato: payload, fotos: ['https://foto.invalid/' + payload] };
          await h.page.evaluate(record => {
            DiarioModule.obras = [{ id: 'qa-obra', nome: record.criado_por }];
            DiarioModule.registros = [record];
            document.getElementById('view-diario').innerHTML = DiarioModule._html();
          }, record);
          assert.equal(await h.page.locator('#diario-form-obra option[value="qa-obra"]').textContent(), payload);
          assert.equal(await h.page.locator('#view-diario img').getAttribute('src'), record.fotos[0]);
          assert.equal(await h.page.locator('[onerror], [onpointerenter], [data-extra]').count(), 0);
          await h.page.locator('#view-diario img').click();
          assert.equal(await h.page.locator('#diario-foto-overlay img').getAttribute('src'), record.fotos[0]);
          assert.equal(await h.page.locator('[onerror], [onpointerenter], [data-extra]').count(), 0);
          await h.page.locator('#diario-foto-overlay').click();
          await h.page.evaluate(() => DiarioModule.editar('qa-diario'));
          assert.equal(await h.page.locator('#diario-form-relato').inputValue(), payload);
          assert.equal(await h.page.locator('#diario-fotos-preview img').getAttribute('src'), record.fotos[0]);
          assert.equal(await h.page.evaluate(() => window.__executou), 0);
        }
        assert.deepEqual(h.errors, []);
        assert.ok(h.blocked.every(url => url.startsWith('https://foto.invalid/')),
          'Apenas URLs sinteticas de imagem foram bloqueadas; nenhuma rede real foi liberada.');
        assert.deepEqual(await h.page.evaluate(() => window.__transporte), []);
      } finally { await h.close(); }
    });
  });
}
