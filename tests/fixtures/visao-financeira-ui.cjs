'use strict';
// Chromium novo; shell/CSS/modulos reais. Apenas identidade e transportes sao sinteticos.
// Nenhum servidor, autenticacao, rede externa, persistencia operacional ou migracao.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const raiz = path.resolve(__dirname, '../..');
const origin = 'http://127.0.0.1:43781';
const url = origin + '/index.html';
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const ids = { empresa: id(1), ator: id(2), a: id(10), b: id(11), c: id(12), negativa: id(13), interna: id(14),
  banco: id(20), dinheiro: id(21), quinzena: id(30), obrigacao: id(40) };
const copiar = v => JSON.parse(JSON.stringify(v));
function fixture() {
  const row = (n, campos) => ({ id: id(n), company_id: ids.empresa, ...campos });
  return {
    planosEntrada: { company_id: ids.empresa, planos: [] },
    obras: [row(10, { nome: 'CASA SINTETICA ALFA', valor_venda: 1000, area_m2: 80, arquivada: false }),
      row(11, { nome: 'CASA SINTETICA BETA', valor_venda: 500, area_m2: 50, arquivada: false }),
      row(12, { nome: 'CASA SINTETICA ARQUIVADA', valor_venda: 300, area_m2: 30, arquivada: true }),
      row(13, { nome: 'CASA SINTETICA NEGATIVA', valor_venda: 0, area_m2: 25, arquivada: false }),
      row(14, { nome: 'ESCRITORIO SINTETICO', valor_venda: 0, area_m2: 0, arquivada: false })],
    lancamentos: [row(50, { obra_id: ids.a, total: 200, data: '2026-09-10', etapa: '04_alven', descricao: 'Material sintetico setembro', obs: null }),
      row(51, { obra_id: ids.a, total: 300, data: '2026-10-10', etapa: '04_alven', descricao: 'Material sintetico outubro', obs: null }),
      row(52, { obra_id: ids.a, total: 100, data: '2026-10-15', etapa: '28_mao', descricao: 'FP sintetica', obs: 'Folha quinzenal · ' + ids.quinzena }),
      row(53, { obra_id: ids.b, total: 200, data: '2026-10-10', etapa: '04_alven', descricao: 'Material sintetico BETA', obs: null }),
      row(54, { obra_id: ids.negativa, total: 250, data: '2026-10-10', etapa: '04_alven', descricao: 'Custo sintetico sem recebimento', obs: null }),
      row(55, { obra_id: ids.interna, total: 20, data: '2026-10-10', etapa: '34_tecnologia', descricao: 'Overhead sintetico', obs: null })],
    repasses_cef: [row(60, { obra_id: ids.a, valor: 200, data_credito: '2026-09-10', tipo: 'pls' }),
      row(61, { obra_id: ids.a, valor: 1100, data_credito: '2026-10-10', tipo: 'pls' }),
      row(62, { obra_id: ids.b, valor: 100, data_credito: '2026-09-10', tipo: 'entrada' }),
      row(63, { obra_id: ids.c, valor: 350, data_credito: '2026-09-10', tipo: 'pls' })],
    obra_adicionais: [row(70, { obra_id: ids.a, valor: 200, status: 'aprovado', descricao: 'EXTRA SINTETICO EXCEDENTE' }),
      row(71, { obra_id: ids.a, valor: 100, status: 'aprovado', descricao: 'EXTRA SINTETICO PARCIAL' }),
      row(72, { obra_id: ids.b, valor: 999, status: 'pendente', descricao: 'EXTRA SINTETICO PENDENTE' })],
    adicional_pagamentos: [row(80, { adicional_id: id(70), valor: 300, data: '2026-10-10' }),
      row(81, { adicional_id: id(71), valor: 20, data: '2026-10-10' }),
      row(82, { adicional_id: id(71), valor: 20, data: '2026-11-10' })],
    contas_pagar: [row(40, { fornecedor: 'FORNECEDOR SINTETICO', descricao: 'Obrigacao parcial sintetica', valor: 400,
      status: 'pendente', data_vencimento: '2026-09-01', data_pagamento: null, obra_id: ids.a, tipo: 'despesa' }),
      row(41, { fornecedor: 'ADMINISTRACAO SINTETICA', descricao: 'Despesa admin sintetica', valor: 10,
        status: 'pago', data_vencimento: '2026-10-01', data_pagamento: '2026-10-01', obra_id: null, tipo: 'despesa' })],
    notas_fiscais: [],
    diarias_quinzenas: [row(30, { label: 'QUINZENA SINTETICA', data_inicio: '2026-10-01', data_fim: '2026-10-15', fechada: true, excluida: false })],
    diarias: [row(90, { quinzena_id: ids.quinzena, data: '2026-10-02', funcionario: 'PESSOA SINTETICA', status: 'apontado',
      periodos: [{ obra_id: ids.a, obra: 'CASA SINTETICA ALFA', turno: 'dia', fracao: 1 }], valor: 100, diaria_base: 100, total_fracoes: 1 })],
    diarias_extras: [],
    ledger: { company_id: ids.empresa, total_centavos: 100000,
      contas: [{ id: ids.banco, codigo: 'banco', nome: 'Banco sintetico', abertura_centavos: 75000, saldo_centavos: 75000,
        corte_em: '2026-09-01T21:00:00Z', fuso: 'America/Sao_Paulo' },
        { id: ids.dinheiro, codigo: 'dinheiro', nome: 'Dinheiro sintetico', abertura_centavos: 25000, saldo_centavos: 25000,
          corte_em: '2026-09-01T21:00:00Z', fuso: 'America/Sao_Paulo' }], movimentos: [],
      pagamentos: [{ conta_pagar_id: ids.obrigacao, pago_centavos: 15000, restante_centavos: 25000 },
        { conta_pagar_id: id(41), pago_centavos: 1000, restante_centavos: 0 }] }
  };
}
function fixtureComposicao() {
  const dados = fixture();
  const row = (n, campos) => ({ id: id(n), company_id: ids.empresa, obra_id: ids.a, obs: null, ...campos });
  dados.lancamentos = dados.lancamentos.filter(l => l.obra_id !== ids.a || l.id === id(50));
  dados.lancamentos.push(
    row(101, { total: '50.004', data: '2026-09-12', etapa: '28_mao', descricao: 'MAO SINTETICA MES ANTERIOR' }),
    ...[102, 103, 104].map(n => row(n, { total: '100.004', data: '2026-10-10', etapa: '04_alven', descricao: 'MATERIAL SINTETICO FRACIONARIO ' + n })),
    row(105, { total: '25.005', data: '2026-10-15', etapa: '28_mao', descricao: 'FP SINTETICA FRACIONARIA', obs: 'Folha quinzenal \u00b7 ' + ids.quinzena }),
    row(106, { total: 10, data: '2026-10-10', etapa: '24_imposto', descricao: 'IMPOSTO SINTETICO' }),
    row(107, { total: 5, data: '2026-10-10', etapa: '34_tecnologia', descricao: 'DESPESA SINTETICA' }),
    row(108, { total: 40, data: '2026-10-10', etapa: '35_terreno', descricao: 'TERRENO SINTETICO' })
  );
  return dados;
}
function bootstrap(dados, config) {
  const json = JSON.stringify({ dados, config, ids }).replace(/</g, '\\u003c');
  return `(function(){
    const entrada = ${json};
    window.__financeiroQa = { dados:entrada.dados, atrasarTabela:null, ...entrada.config, consultas:[], rpc:[], escritas:[], falhas:[], liberar:null };
    _companyId = entrada.ids.empresa;
    _supabaseToken = 'SENTINELA_SINTETICA_SEM_VALIDADE';
    Object.assign(usuarioAtual,{id:entrada.ids.ator,nome:'QA SINTETICA',perfil:'admin',role:'admin'});
    window.OBRAS_INTERNAS = [entrada.ids.interna];
    obras = entrada.dados.obras.filter(o=>!o.arquivada); obrasArquivadas = entrada.dados.obras.filter(o=>o.arquivada);
    lancamentos = entrada.dados.lancamentos; repassesCef = entrada.dados.repasses_cef;
    obrasAdicionais = entrada.dados.obra_adicionais; adicionaisPgtos = entrada.dados.adicional_pagamentos;
    notas = []; distribuicoes = []; entradasDiretas = []; catalogoMateriais = []; ajustesEstoque = [];
    const clone = v=>JSON.parse(JSON.stringify(v));
    const proibido = nome=>(...args)=>{window.__financeiroQa.escritas.push(nome);throw new Error('ESCRITA BLOQUEADA NO ENSAIO SINTETICO: '+nome);};
    sbPost=proibido('sbPost'); sbPostMinimal=proibido('sbPostMinimal'); sbPatch=proibido('sbPatch'); sbDelete=proibido('sbDelete');
    sbGet = async function(t,q='',options={}) {
      const controle=window.__financeiroQa;
      controle.consultas.push({tabela:t,query:q,estrita:options.throwOnError===true});
      if (controle.atrasarTabela===t) {controle.atrasarTabela=null;await new Promise(resolve=>{controle.liberar=resolve;});}
      if (controle.falharTabela===t) {controle.falhas.push(t);throw new Error('Falha sintetica de leitura');}
      if (!Object.prototype.hasOwnProperty.call(controle.dados,t)) {
        if (['projecoes_caixa','cronograma_tarefas','agenda_notas','pci_medicao','pci_itens'].includes(t)) return [];
        throw new Error('Tabela fora do ensaio sintetico: '+t);
      }
      const p=new URLSearchParams(q.replace(/^\\?/,'')),offset=Number(p.get('offset')||0),limite=Math.min(Number(p.get('limit')||1000),controle.capPagina||1000);
      let rows=controle.dados[t].slice(offset,offset+limite);
      const campos=p.get('select');
      if(campos&&campos!=='*'){const keys=new Set(campos.split(','));rows=rows.map(r=>Object.fromEntries(Object.entries(r).filter(([k])=>keys.has(k))));}
      return clone(rows);
    };
    sbGetAll=async(t,q='',o={})=>{const rows=[];let off=0;for(let i=0;i<100;i++){const b=await sbGet(t,q+(q.includes('?')?'&':'?')+'limit=1000&offset='+off,o);if(!b.length)return rows;rows.push(...b);off+=b.length;}throw new Error('Limite sintetico de paginacao');};
    sbRpcEstoque=async function(nome,args={}) {
      const c=window.__financeiroQa;c.rpc.push(nome);
      if(nome==='entrada_plano_resumo')return c.falharPlanos?{ok:false,mensagem:'Falha sintetica de leitura dos planos'}:{ok:true,dados:clone(c.dados.planosEntrada)};
      if(nome!=='caixa_estado'){c.escritas.push(nome);throw new Error('RPC DE ESCRITA BLOQUEADA: '+nome);}
      if(c.falharLedger)return{ok:false,mensagem:'Falha sintetica de leitura do caixa'};
      return{ok:true,dados:clone(c.dados.ledger)};
    };
  })();`;
}
function html(dados, config = {}) {
  let injetou = false, navegacao = 0;
  const original = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');
  let documento = original.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (tag, attrs, conteudo) => {
    const src = /\bsrc=["']([^"']+)["']/i.exec(attrs)?.[1];
    if (!src) {
      if (conteudo.includes('const VIEW_TITLES') && conteudo.includes('const viewRegistry')) { navegacao++; return tag; }
      return '';
    }
    const caminho = src.split('?')[0];
    const permitido = /^js\/edr-v2-visao-financeira-[a-z-]+\.js$/.test(caminho) ||
      /^js\/edr-v2-(infra|utils-extras|dashboard|relatorio|raiox|financeiro|dre|caixa-prospectivo|entrada-plano-projecoes)\.js$/.test(caminho);
    if (!permitido) return '';
    if (caminho === 'js/edr-v2-infra.js') { injetou = true; return tag + '<script>' + bootstrap(dados, config) + '</script>'; }
    return tag;
  });
  assert.equal(injetou, true, 'Infra real deve ser carregada antes das fixtures');
  assert.equal(navegacao, 1, 'Shell de navegacao original unico');
  assert.match(documento, /src=["']js\/edr-v2-visao-financeira-composicao\.js(?:\?[^"']*)?["']/,
    'Composicao real deve ser carregada pelo index; fixture nao fabrica adaptador');
  const iniciar = `<script>window.addEventListener('DOMContentLoaded',function(){
    document.getElementById('login-screen').style.display='none';document.getElementById('app-shell').style.display='';
    updateShellUser('QA SINTETICA','admin');
    document.body.dataset.edrQa='sintetico';
    setView(localStorage.getItem('edr_last_view')||'dashboard');
  });</script>`;
  documento = documento.replace('</body>', iniciar + '</body>');
  return documento;
}
function dentro(alvo) {
  const relativo = path.relative(raiz, alvo);
  return !relativo.startsWith('..') && !path.isAbsolute(relativo);
}
async function abrir(browser, options = {}) {
  const dados = copiar(options.dados || fixture());
  const context = await browser.newContext({ viewport: options.viewport || { width: 1440, height: 1000 },
    serviceWorkers: 'block', acceptDownloads: false });
  await context.addInitScript(() => { sessionStorage.setItem('edr_local_sw_limpo', '1'); });
  const page = await context.newPage();
  const erros = [], bloqueadas = [], tentativasProducao = [];
  page.on('pageerror', e => erros.push(e.message));
  const paginas = new Set([page]);
  context.on('page', nova => { paginas.add(nova); nova.on('pageerror', e => erros.push(e.message)); });
  await context.route('**/*', async route => {
    const request = route.request(), destino = new URL(request.url());
    if (destino.origin !== origin || request.method() !== 'GET') {
      bloqueadas.push(destino.origin + destino.pathname);
      if (/supabase\.co$/.test(destino.hostname)) tentativasProducao.push(destino.pathname);
      return route.abort('blockedbyclient');
    }
    if (destino.pathname === '/index.html' || destino.pathname === '/') {
      return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html(dados, options.config || {}) });
    }
    const alvo = path.resolve(raiz, '.' + decodeURIComponent(destino.pathname));
    if (!dentro(alvo) || !fs.existsSync(alvo) || !fs.statSync(alvo).isFile()) return route.fulfill({ status: 404, body: 'Arquivo local ausente no ensaio' });
    const tipos = { '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
      '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png' };
    return route.fulfill({ status: 200, contentType: tipos[path.extname(alvo)] || 'application/octet-stream', body: fs.readFileSync(alvo) });
  });
  await page.goto(url);
  return { page, context, dados, erros, bloqueadas, tentativasProducao, paginas,
    async fechar() { await context.close(); },
    async pronto() { await page.waitForFunction(() => typeof FinanceiroVisaoPonte !== 'undefined' && FinanceiroVisaoPonte.ler().fase === 'pronta'); },
    async envelope() { return page.evaluate(() => { const x=FinanceiroVisaoPonte.ler();return {fase:x.fase,filtro:x.filtro,visao:x.visao,folha:x.folha,consultadoEm:x.consultadoEm,erro:x.erro}; }); },
    async controlar(config) { await page.evaluate(config => Object.assign(window.__financeiroQa, config), config); },
    async conferirIsolamento() {
      assert.deepEqual(tentativasProducao, [], 'Nenhuma tentativa de rede Supabase real');
      assert.deepEqual(await page.evaluate(() => window.__financeiroQa.escritas), [], 'Nenhum transporte de escrita chamado');
      assert.deepEqual(erros, [], 'Nenhuma excecao de pagina ou popup');
    }
  };
}
module.exports = { abrir, fixture, fixtureComposicao, html, ids, origin, url, raiz };
