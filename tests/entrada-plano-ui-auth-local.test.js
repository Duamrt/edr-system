'use strict';
// Auth e PostgREST reais na stack LOCAL dedicada. Nenhum saldo/recibo é simulado.
// Apenas a configuração Supabase da ponte original é substituída em memória.
// Este ensaio NÃO comprova a tela de login geral nem a versão em produção.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { LocalSupabase, configFromEnvironment, AUTHORIZED, REPO, EXPECTED_DIR, ORIGIN, inside } = require('./fixtures/entrada-plano-auth-local-runtime.cjs');
const literal = v => "'" + String(v).replaceAll("'", "''") + "'";
const SCRIPT_FILES = new Set(['infra', 'utils-extras', 'entrada-cliente', 'entrada-plano-projecoes', 'entrada-plano-calc', 'entrada-plano', 'obras', 'custos'].map(n => 'js/edr-v2-' + n + '.js'));
const API_ROUTES = new Set(['/auth/v1/user', '/rest/v1/company_users', '/rest/v1/obras', '/rest/v1/repasses_cef', '/rest/v1/rpc/entrada_plano_estado', '/rest/v1/rpc/entrada_plano_operar', '/rest/v1/rpc/entrada_plano_resumo']);
const success = (r, label) => { assert.equal(r.ok, true, `${label}: HTTP ${r.status}, código ${r.code || 'omitido'}`); return r.body; };
function realHtml() {
  const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src http://127.0.0.1:55421; font-src 'self' data:; form-action 'self'; base-uri 'self'">`;
  let html = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8').replace('<head>', '<head><base href="/">' + csp);
  // Recursos externos ficam fora do ensaio; qualquer tentativa restante será abortada.
  html = html.replace(/<link\b[^>]*href=["']https?:\/\/[^>]*>/gi, '');
  return html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (tag, attrs, source) => {
    const src = /\bsrc=["']([^"']+)["']/.exec(attrs)?.[1];
    if (!src) {
      const end = source.indexOf('// fecharModal');
      return source.includes('// Mesmo build do cache publicado') && end > 0 ? '<script>' + source.slice(0, end) + '</script>' : '';
    }
    const file = src.split('?')[0];
    if (!SCRIPT_FILES.has(file)) return '';
    return file === 'js/edr-v2-infra.js' ? tag + '<script>' + bootstrapBrowser() + '</script>' : tag;
  });
}
function localInfra(anon) {
  let source = fs.readFileSync(path.join(REPO, 'js/edr-v2-infra.js'), 'utf8');
  const localValues = { SUPABASE_URL: ORIGIN, SUPABASE_KEY: anon, SUPABASE_ANON_KEY: anon, SUPABASE_SERVICE_KEY: '' };
  for (const [name, value] of Object.entries(localValues)) {
    const pattern = new RegExp('^const ' + name + ' = [^;]+;', 'gm');
    assert.equal((source.match(pattern) || []).length, 1, 'Configuração única da ponte original: ' + name);
    source = source.replace(pattern, 'const ' + name + ' = ' + JSON.stringify(value).replace(/</g, '\\u003c') + ';');
  }
  return source;
}
function bootstrapBrowser() {
  // Esta inicialização injeta somente a sessão emitida pelo GoTrue local. Pessoa,
  // perfil, empresa e obra são novamente conferidos por Auth e REST reais.
  return String.raw`
    window.__entradaAuthReady = new Promise((resolve, reject) => {
      document.addEventListener('DOMContentLoaded', async () => {
        try {
          const session = window.__entradaQaSession;
          if (!session || SUPABASE_URL !== 'http://127.0.0.1:55421') throw Error('Configuração LOCAL da interface não confere.');
          const response = await fetch(SUPABASE_URL + '/auth/v1/user', {headers:{apikey:SUPABASE_KEY,Authorization:'Bearer ' + session.token},redirect:'error'});
          if (!response.ok) throw Error('JWT não confirmado pelo GoTrue LOCAL.');
          const me = await response.json();
          if (me.id !== session.actor) throw Error('Identidade GoTrue LOCAL não confere.');
          _supabaseToken = session.token;
          const members = await sbGet('company_users', '?user_id=eq.' + me.id + '&select=user_id,company_id,role,active,nome', {throwOnError:true});
          if (members.length !== 1 || members[0].active !== true || members[0].company_id !== session.company) throw Error('Vínculo ativo LOCAL não confere.');
          const member = members[0];
          _companyId = member.company_id;
          Object.assign(usuarioAtual, {id:me.id,nome:member.nome,perfil:member.role,empresa_id:member.company_id});
          obras = await sbGet('obras', '?id=eq.' + session.obra + '&select=*', {throwOnError:true});
          if (obras.length !== 1 || obras[0].company_id !== _companyId) throw Error('Obra do tenant LOCAL não confere.');
          ObrasModule.obraAberta = obras[0].id;
          document.getElementById('login-screen').style.display = 'none';
          document.getElementById('app-shell').style.display = '';
          document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
          document.getElementById('view-obras').classList.add('active');
          document.getElementById('header-title').textContent = 'Obras · QA LOCAL com Auth real';
          document.getElementById('obras-cards-overview').style.display = 'none';
          document.getElementById('obras-sticky').style.display = '';
          window.__entradaQaIdentity = {actor:me.id,company:member.company_id,perfil:member.role,obra:obras[0].id,origin:SUPABASE_URL};
          delete window.__entradaQaSession;
          obrasSwitchTab('entrada');
          resolve();
        } catch (_) { reject(Error('Inicialização LOCAL recusada; detalhes privados omitidos.')); }
      }, {once:true});
    });
  `;
}
if (process.env.EDR_ENTRADA_AUTH_LOCAL_RUN !== AUTHORIZED) {
  test('UI plano: GoTrue/PostgREST LOCAL reais', {skip:'Execução Auth/credenciais ainda não autorizadas; somente código preparado.'}, () => {});
} else {
  test('UI plano: Elyda solicita, Duam aprova, recebimento/estorno reais e terceiro negado', {timeout:240000}, async t => {
    assert.equal(['DEBUG', 'PWDEBUG', 'NODE_DEBUG'].some(k => !!process.env[k]), false, 'Desative debug/trace para não registrar material privado.');
    assert.ok(process.env.EDR_PLAYWRIGHT_PATH && process.env.EDR_CHROMIUM_PATH, 'Use Playwright e Chromium existentes, sem instalação.');
    const local = new LocalSupabase(configFromEnvironment()); t.after(() => local.dispose()); local.marker();
    const company = crypto.randomUUID(), obra = crypto.randomUUID(), run = crypto.randomBytes(6).toString('hex');
    const actors = {}, pages = {}, forbidden = [], unexpected = [], pageErrors = [], writes = [];
    let browser, bank, row, receipt, firstPayment;
    const state = async who => success(await local.rpc('entrada_plano_estado', actors[who].token, {p_obra_id:obra}), 'Estado real LOCAL');
    const cash = async () => success(await local.rpc('caixa_estado', actors.duam.token), 'Caixa real LOCAL');
    const counts = () => local.json(`select jsonb_build_object('receipts',(select count(*) from public.entrada_plano_recebimentos where obra_id='${obra}'), 'repasses',(select count(*) from public.repasses_cef where obra_id='${obra}'), 'cash',(select count(*) from public.caixa_movimentos where company_id='${company}'));`);
    const preserved = () => local.json(`select jsonb_build_object('original',(select contrato_entrada from public.obras where id='${obra}'), 'venda',(select valor_venda from public.obras where id='${obra}'), 'manual',(select saldo_manual from public.companies where id='${company}'), 'custos',(select sum(total) from public.lancamentos), 'folha',(select status from public.diarias_quinzenas where id=1), 'estoque',(select qtd from public.distribuicoes where id=1));`);
    const uiState = page => page.evaluate(() => EntradaPlano.estado());
    const content = page => page.locator('#entrada-plano-content');
    const refresh = async page => { await page.evaluate(() => EntradaPlano.carregar()); await page.waitForFunction(() => !!EntradaPlano.estado()); };
    async function openActor(who) {
      const context = await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});
      t.after(() => context.close());
      await context.addInitScript(({token,actor,company,obra}) => { window.__entradaQaSession = {token,actor,company,obra}; }, {token:actors[who].token,actor:actors[who].id,company,obra});
      const page = await context.newPage(); page.setDefaultTimeout(10000);
      page.on('pageerror', () => pageErrors.push(who + ': erro de script; detalhes omitidos'));
      await context.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url());
        if (url.origin !== ORIGIN || url.username || url.password || url.hash) { forbidden.push(url.protocol + '//' + url.hostname); return route.abort('blockedbyclient'); }
        if (API_ROUTES.has(url.pathname)) {
          const mutating = url.pathname === '/rest/v1/rpc/entrada_plano_operar';
          if (request.method() !== (url.pathname.includes('/rpc/') ? 'POST' : 'GET')) { unexpected.push('método LOCAL inesperado'); return route.abort(); }
          if (mutating) {
            const p = request.postDataJSON();
            assert.equal(p.p_obra_id, obra, 'Operação da interface usa obra autorizada');
            writes.push({who,operacao:p.p_operacao,pedido:p.p_pedido,body:p});
          }
          // Real HTTP, sem seguir redirects: nenhuma credencial pode sair da stack.
          let response;
          try { response = await route.fetch({maxRedirects:0}); }
          catch (_) { throw Error('HTTP da interface LOCAL falhou; detalhes privados omitidos.'); }
          try {
            if (response.status() >= 300 && response.status() < 400) { unexpected.push('redirecionamento LOCAL recusado'); return route.abort(); }
            await route.fulfill({response});
          } finally { await response.dispose(); }
          return; // Resposta/valores vêm exclusivamente de PostgREST real.
        }
        if (request.method() !== 'GET') { unexpected.push('escrita fora do RPC'); return route.abort(); }
        if (url.pathname === '/qa-entrada-ui/index.html') return route.fulfill({contentType:'text/html; charset=utf-8',body:realHtml().replace(/(src|href)=(["'])(js\/|css\/)/g, '$1=$2/$3')});
        const file = path.resolve(REPO, '.' + decodeURIComponent(url.pathname));
        const relative = path.relative(REPO, file).replaceAll(path.sep, '/');
        const assetAllowed = SCRIPT_FILES.has(relative) || ['sw.js', 'favicon.svg', 'manifest.json'].includes(relative) || /^(css|assets|img|icons)\//.test(relative);
        if (!inside(file, REPO) || !assetAllowed || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
          // Favicon ausente não inicia backend nem representa uma mutação.
          if (url.pathname === '/favicon.ico') return route.fulfill({status:204,body:''});
          unexpected.push('recurso LOCAL fora do conjunto'); return route.abort();
        }
        const body = relative === 'js/edr-v2-infra.js' ? localInfra(local.config.anon) : fs.readFileSync(file);
        const ext = path.extname(file);
        return route.fulfill({contentType:ext === '.js' ? 'application/javascript; charset=utf-8' : ext === '.css' ? 'text/css; charset=utf-8' : ext === '.svg' ? 'image/svg+xml' : ext === '.png' ? 'image/png' : ext === '.json' ? 'application/json' : 'application/octet-stream',body});
      });
      await page.goto(ORIGIN + '/qa-entrada-ui/index.html');
      await page.evaluate(() => window.__entradaAuthReady);
      await page.waitForFunction(() => !!EntradaPlano.estado());
      assert.deepEqual(await page.evaluate(() => window.__entradaQaIdentity), {actor:actors[who].id,company,perfil:'admin',obra,origin:ORIGIN});
      pages[who] = page; return page;
    }
    async function submit(page, why, {double=false} = {}) {
      await page.locator('#ep-motivo').fill(why);
      if (double) await page.locator('#ep-submit').evaluate(button => { button.click(); button.click(); });
      else await page.locator('#ep-submit').click();
      await page.waitForFunction(() => !document.getElementById('entrada-plano-modal').classList.contains('active'));
      assert.equal(await page.locator('#ep-error').innerText(), '', 'Formulário confirmado sem erro');
    }
    const metric = (page,label) => content(page).locator('.plan-metric').filter({has:page.locator('span', {hasText:new RegExp('^' + label + '$')})}).locator('strong').innerText();
    const evidence = async (page,name) => {
      if (!process.env.EDR_ENTRADA_UI_AUTH_EVIDENCE_DIR) return;
      const directory = path.resolve(process.env.EDR_ENTRADA_UI_AUTH_EVIDENCE_DIR);
      assert.equal(directory.toLowerCase(), path.join(path.dirname(EXPECTED_DIR), 'entrada-plano-qa', 'ui-auth-real').toLowerCase(), 'Imagens somente na pasta QA autorizada foraGit');
      fs.mkdirSync(directory,{recursive:true});
      await page.screenshot({path:path.join(directory,'replay-patch-' + name + '.png'),fullPage:true});
    };
    await t.test('GoTrue LOCAL emite três sessões reais e fixture nova usa somente tenant sintético próprio', async () => {
      for (const name of ['elyda','duam','terceiro']) {
        const email = `qa-edr-entrada-ui-${run}-${name}@example.test`, password = crypto.randomBytes(32).toString('base64url') + 'A1!';
        const created = success(await local.request('/auth/v1/admin/users',{admin:true,method:'POST',body:{email,password,email_confirm:true,user_metadata:{nome:'QA UI ' + name,edr_entrada_ui_sintetico:true}}}), 'Criar Auth UI LOCAL');
        const session = success(await local.request('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password}}), 'Login GoTrue UI LOCAL');
        assert.equal(typeof session.access_token,'string');
        const me = success(await local.request('/auth/v1/user',{token:session.access_token}), 'JWT confirmado LOCAL');
        assert.equal(me.id,created.id); actors[name] = {id:me.id,token:session.access_token};
      }
      local.sql(`begin; insert into public.companies(id,owner_id,name,slug,saldo_manual) values('${company}','${actors.duam.id}','Empresa QA UI entrada','entrada-ui-qa-${run}',123.45);
        insert into public.company_users(company_id,user_id,role,active,nome,email,senha_inicial,permissions) values ${Object.entries(actors).map(([n,a]) => `('${company}','${a.id}','admin',true,${literal('QA UI ' + n)},${literal(n + '@example.test')},'PRIVADO_NAO_EXIBIR_UI','{"flag_privada_qa":"NAO_EXIBIR_UI"}')`).join(',')};
        insert into public.obras(id,company_id,nome,contrato_entrada,valor_venda,data_entrega) values('${obra}','${company}','CASA QA UI AUTH REAL',100,1000,null);
        insert into public.entrada_plano_responsaveis(company_id,solicitante_id,aprovador_id) values('${company}','${actors.elyda.id}','${actors.duam.id}'); commit;`);
      assert.deepEqual(counts(),{receipts:0,repasses:0,cash:0});
      success(await local.rpc('caixa_registrar',actors.duam.token,{p_operacao:crypto.randomUUID(),p_pedido:{action:'abertura',corte_local:'2001-06-05T18:23',fuso:'America/Sao_Paulo',contas:[{codigo:'banco',nome:'Banco QA UI entrada',saldo_centavos:100000},{codigo:'dinheiro',nome:'Dinheiro QA UI entrada',saldo_centavos:0}]}}), 'Abertura real LOCAL');
      bank = (await cash()).contas.find(c => c.codigo === 'banco').id;
      const {chromium} = require(process.env.EDR_PLAYWRIGHT_PATH);
      browser = await chromium.launch({headless:true,executablePath:process.env.EDR_CHROMIUM_PATH}); t.after(() => browser.close());
    });
    const before = preserved();
    await t.test('Elyda solicita pelo editor real: datas vazias até preenchimento e proposta não movimenta dinheiro', async () => {
      const page = await openActor('elyda');
      await content(page).locator('[data-ep-action="planejar"]').click();
      assert.equal(await page.locator('#ep-delivery').inputValue(),'');
      await page.locator('[data-ep-action="adicionar"]').click();
      assert.equal(await page.locator('#ep-due-0').inputValue(),'');
      await page.locator('#ep-label-0').fill('Parcela QA UI Auth'); await page.locator('#ep-base-0').fill('100,00');
      await page.locator('#ep-mode-0').selectOption('percent'); await page.locator('#ep-rate-0').fill('15,00');
      // Datas antigas são explicitamente dados sintéticos do ensaio LOCAL.
      await page.locator('#ep-due-0').fill('2001-07-10'); await page.locator('#ep-delivery').fill('2002-01-01'); await page.locator('#ep-method-0').selectOption('Pix');
      assert.match(await page.locator('#ep-preview').innerText(), /115,00/);
      await submit(page,'QA UI Elyda solicita entrada');
      const s = await state('elyda'); assert.equal(s.requests.length,1); assert.equal(s.requests[0].status,'pending'); assert.equal(s.requests[0].actor,actors.elyda.id); assert.equal(s.rows.length,0);
      assert.equal(await content(page).locator('[data-ep-action="aprovar"]').isDisabled(),true);
      assert.equal((await cash()).total_centavos,100000); assert.deepEqual(counts(),{receipts:0,repasses:0,cash:0}); assert.deepEqual(preserved(),before);
      assert.match(await content(page).innerText(),/QA UI elyda/); assert.match(await content(page).innerText(),/automação não está ativa/);
    });
    await t.test('Terceiro ativo no mesmo tenant lê mas não solicita/aprova/recebe, inclusive RPC direto real', async () => {
      const page = await openActor('terceiro');
      assert.deepEqual((await uiState(page)).permissions,{solicitar:false,aprovar:false,receber:false});
      assert.equal(await content(page).locator('[data-ep-action="planejar"]').isDisabled(),true); assert.equal(await content(page).locator('[data-ep-action="aprovar"]').isDisabled(),true);
      const writeCount = writes.length; await page.evaluate(() => { EntradaPlano.abrir('planejar'); EntradaPlano.abrir('aprovar',EntradaPlano.estado().requests[0].id); });
      assert.equal(await page.locator('#entrada-plano-modal').isVisible(),false); assert.equal(writes.length,writeCount);
      const s = await state('terceiro');
      const denied = await local.rpc('entrada_plano_operar',actors.terceiro.token,{p_operacao:crypto.randomUUID(),p_obra_id:obra,p_pedido:{tipo:'decidir',revisao:s.plano.revisao,proposta_id:s.requests[0].id,decisao:'approved',motivo:'QA UI ator não configurado'}});
      assert.equal(denied.status,403); assert.equal(denied.code,'42501'); assert.deepEqual(counts(),{receipts:0,repasses:0,cash:0});
    });
    await t.test('Duam aprova pela UI e a leitura real confirma contrato, parcela e histórico sem dinheiro', async () => {
      const page = await openActor('duam'); await content(page).locator('[data-ep-action="aprovar"]').click(); await submit(page,'QA UI Duam aprova entrada');
      const s = await state('duam'); row = s.rows[0].id;
      assert.equal(s.plano.stage,'confirmed'); assert.equal(s.rows.length,1); assert.equal(s.rows[0].base,10000); assert.equal(s.rows[0].total,11500); assert.equal(s.rows[0].due,'2001-07-10'); assert.equal(s.plano.delivery,'2002-01-01');
      assert.equal(s.requests[0].status,'approved'); assert.equal(s.requests[0].approver,actors.duam.id); assert.equal((await cash()).total_centavos,100000);
      assert.match(await metric(page,'Original'),/100,00/); assert.match(await metric(page,'Saldo pendente'),/115,00/);
      assert.deepEqual(counts(),{receipts:0,repasses:0,cash:0}); assert.deepEqual(preserved(),before);
    });
    await t.test('Elyda recebe parcialmente antes da entrega; dois cliques gravam um repasse e um Caixa', async () => {
      const page = pages.elyda; await refresh(page); await content(page).locator('[data-ep-action="receber"]').click();
      assert.equal(await page.locator('#ep-data').inputValue(),''); await page.locator('#ep-amount').fill('20,00'); await page.locator('#ep-data').fill('2001-06-06'); await page.locator('#ep-conta').selectOption(bank); await page.locator('#ep-method').selectOption('Pix');
      assert.match(await page.locator('#ep-preview').innerText(),/Acréscimo cancelado\s+R\$\s*3,00/); assert.match(await page.locator('#ep-preview').innerText(),/Saldo após confirmar\s+R\$\s*92,00/);
      await submit(page,'QA UI Elyda recebimento parcial',{double:true});
      const s = await state('elyda'); receipt = s.receipts[0]; firstPayment = writes.find(w => w.who === 'elyda' && w.pedido.tipo === 'receber');
      assert.equal(receipt.amount,2000); assert.equal(receipt.principal,2000); assert.equal(receipt.additionPaid,0); assert.equal(receipt.cancelled,300); assert.equal(receipt.actor,actors.elyda.id); assert.equal(s.rows[0].remaining,9200);
      assert.deepEqual(counts(),{receipts:1,repasses:1,cash:1}); assert.equal((await cash()).total_centavos,102000); assert.deepEqual(preserved(),before);
      assert.equal(writes.filter(w => w.pedido.tipo === 'receber').length,1, 'Proteção do controlador evita dois POSTs');
      assert.equal(local.sql(`select count(*) from public.repasses_cef r join public.entrada_plano_recebimentos e on e.repasse_id=r.id join public.caixa_movimentos m on m.id=e.movimento_id where e.id='${receipt.id}' and r.valor=20 and m.valor_centavos=2000 and m.usuario_id='${actors.elyda.id}';`),'1','Os três registros persistidos se referem ao mesmo recebimento real');
      assert.equal(await page.evaluate(() => localStorage.getItem('edr-entrada-pedido:' + _companyId + ':' + usuarioAtual.id + ':' + ObrasModule.obraAberta)),null);
      await evidence(page,'elyda-parcial-auth-real-desktop');
    });
    await t.test('Duam consulta novamente saldo e histórico persistidos; replay real conserva recebimento único', async () => {
      const page = pages.duam; await refresh(page);
      assert.equal((await uiState(page)).totals.received,2000); assert.equal((await uiState(page)).totals.remaining,9200); assert.equal((await uiState(page)).totals.cancelled,300);
      assert.match(await metric(page,'Recebido'),/20,00/); assert.match(await metric(page,'Saldo pendente'),/92,00/); assert.match(await metric(page,'Final vigente'),/112,00/); assert.match(await metric(page,'Acréscimo cancelado'),/3,00/);
      assert.equal(await content(page).locator('.plan-event').count(),3);
      const history = await content(page).locator('.plan-event').allTextContents(); assert.equal(history.some(v => /QA UI elyda/.test(v)),true); assert.equal(history.some(v => /QA UI duam/.test(v)),true); assert.equal(history.some(v => /Recebimento confirmado/.test(v)),true);
      const replay = await pages.elyda.evaluate(body => sbRpcEntradaPlano('entrada_plano_operar',body),firstPayment.body);
      assert.equal(replay.ok,true); assert.equal(replay.dados.operacao_id,firstPayment.operacao); assert.deepEqual(counts(),{receipts:1,repasses:1,cash:1}); assert.equal((await cash()).total_centavos,102000);
      await evidence(page,'duam-saldo-historico-auth-real-desktop');
      await page.setViewportSize({width:390,height:844});
      await page.waitForFunction(() => document.getElementById('sidebar').getBoundingClientRect().right <= 1); // Espera a transição CSS real antes de avaliar/capturar.
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),true,'UI com dados persistidos sem overflow horizontal');
      await evidence(page,'duam-saldo-historico-auth-real-mobile'); await page.setViewportSize({width:1440,height:1000});
    });
    await t.test('Estorno parcial pela UI exige aprovação e recompõe proporcionalmente o acréscimo cancelado', async () => {
      const page = pages.elyda; await refresh(page); await content(page).locator('[data-ep-action="estorno"]').click();
      await page.locator('#ep-amount').fill('10,00'); await page.locator('#ep-data').fill('2001-06-07'); await page.locator('#ep-conta').selectOption(bank);
      assert.match(await page.locator('#ep-preview').innerText(),/Acréscimo cancelado a restabelecer\s+R\$\s*1,50/);
      await submit(page,'QA UI Elyda solicita estorno parcial'); assert.equal((await cash()).total_centavos,102000); assert.deepEqual(counts(),{receipts:1,repasses:1,cash:1});
      await refresh(pages.duam); await content(pages.duam).locator('[data-ep-action="aprovar"]').click(); await submit(pages.duam,'QA UI Duam aprova estorno parcial');
      const s = await state('duam'), inverse = s.receipts.find(r => r.reverses === receipt.id), original = s.receipts.find(r => r.id === receipt.id);
      assert.equal(original.amount,2000); assert.equal(original.available,1000); assert.equal(inverse.amount,-1000); assert.equal(inverse.principal,-1000); assert.equal(inverse.cancelled,-150); assert.equal(inverse.actor,actors.duam.id);
      assert.equal(s.rows[0].received,1000); assert.equal(s.rows[0].cancelled,150); assert.equal(s.rows[0].remaining,10350); assert.equal((await cash()).total_centavos,101000); assert.deepEqual(counts(),{receipts:2,repasses:2,cash:2}); assert.deepEqual(preserved(),before);
      assert.match(await metric(pages.duam,'Saldo pendente'),/103,50/);
    });
    await t.test('Terceiro permanece sem operar após aprovação; leituras da UI não expõem configuração/flags privadas', async () => {
      const page = pages.terceiro; await refresh(page);
      for (const action of ['planejar','editar','receber','estorno']) assert.equal(await content(page).locator('[data-ep-action="' + action + '"]').first().isDisabled(),true);
      const countBefore = writes.length; await page.evaluate(id => EntradaPlano.abrir('receber',id),row); assert.equal(await page.locator('#entrada-plano-modal').isVisible(),false); assert.equal(writes.length,countBefore);
      for (const who of Object.keys(pages)) {
        const source = JSON.stringify(await uiState(pages[who])); assert.equal(source.includes('PRIVADO_NAO_EXIBIR_UI'),false); assert.equal(source.includes('flag_privada_qa'),false);
        assert.equal((await content(pages[who]).innerText()).includes('PRIVADO_NAO_EXIBIR_UI'),false);
      }
      assert.deepEqual(forbidden,[],'Todos os endpoints fora 127.0.0.1:55421 são bloqueados e nenhum foi solicitado'); assert.deepEqual(unexpected,[],'Somente assets e rotas locais do ensaio foram usados'); assert.deepEqual(pageErrors,[]);
      assert.equal(writes.filter(w => w.who === 'terceiro').length,0); assert.deepEqual(preserved(),before);
      t.diagnostic('Index/CSS/controladores/ponte reais; sessão emitida/confirmada por GoTrue LOCAL e vínculo REST real. RPCs persistem no PostgREST LOCAL. Tela de login geral, demais módulos e produção não testados. Sem credenciais em logs/artefatos; stack e fixtures QA preservadas.');
    });
  });
}
