// Ensaios locais: dados sintéticos e RPC simulada; nenhuma chamada à produção.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

const modulePath = path.join(__dirname, '../js/edr-v2-caixa-prospectivo.js');
const plain = x => JSON.parse(JSON.stringify(x));
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const empresa = id(1), banco = id(2), dinheiro = id(3), obrigacao = id(4);

function estadoSintetico() {
  return {
    company_id: empresa,
    contas: [
      { id: banco, codigo: 'banco', nome: 'Banco de teste', abertura_centavos: 100000, corte_em: '2026-09-14T15:00:00Z', fuso: 'America/Sao_Paulo', saldo_centavos: 100000 },
      { id: dinheiro, codigo: 'dinheiro', nome: 'Dinheiro de teste', abertura_centavos: 10000, corte_em: '2026-09-14T15:00:00Z', fuso: 'America/Sao_Paulo', saldo_centavos: 10000 },
    ],
    total_centavos: 110000,
    movimentos: [],
    pagamentos: [{ conta_pagar_id: obrigacao, pago_centavos: 0, restante_centavos: 40000 }],
  };
}

// DOM mínimo para testes rápidos de contrato. O ensaio opcional Chromium abaixo
// repete os fluxos no DOM real e mantém todas as requisições externas bloqueadas.
function domSintetico() {
  const campos = new Map();
  function element(tag = 'div', elementId) {
    const classes = new Set();
    const el = {
      tagName: tag.toUpperCase(), value: '', checked: false, disabled: false,
      textContent: '', style: {}, dataset: {}, children: [],
      classList: { add: (...xs) => xs.forEach(x => classes.add(x)), remove: (...xs) => xs.forEach(x => classes.delete(x)), contains: x => classes.has(x) },
      appendChild: child => { el.children.push(child); if (child.id) campos.set(child.id, child); return child; },
      remove: () => { if (el.id) campos.delete(el.id); },
      addEventListener() {}, focus() {}, setAttribute(k, v) { this[k] = String(v); },
      querySelector: selector => selector[0] === '#' ? campos.get(selector.slice(1)) || null : null,
      querySelectorAll: () => [],
      insertAdjacentHTML(position, html) { parse(html); el._html = (el._html || '') + html; },
    };
    Object.defineProperty(el, 'id', { get: () => elementId, set: value => { elementId = value; campos.set(value, el); } });
    Object.defineProperty(el, 'innerHTML', { get: () => el._html || '', set: html => { el._html = html; parse(html); } });
    if (elementId) campos.set(elementId, el);
    return el;
  }
  function parse(html) {
    for (const match of String(html).matchAll(/<(input|select|textarea|button|div|section|span|form|p)[^>]*\bid=["']([^"']+)["'][^>]*>/g)) {
      const el = element(match[1], match[2]);
      const value = /\bvalue=["']([^"']*)["']/.exec(match[0]);
      if (value) el.value = value[1];
      if (/\bdisabled\b/.test(match[0])) el.disabled = true;
      if (match[1] === 'select') {
        const start = match.index + match[0].length;
        const options = String(html).slice(start, String(html).indexOf('</select>', start));
        const selected = /<option[^>]*value=["']([^"']*)["'][^>]*selected[^>]*>/.exec(options);
        const first = /<option[^>]*value=["']([^"']*)["'][^>]*>/.exec(options);
        el.value = selected?.[1] ?? first?.[1] ?? '';
      }
    }
  }
  const body = element('body');
  const content = element('div', 'caixa-content');
  return { campos, content, document: { body, createElement: tag => element(tag), getElementById: name => campos.get(name) || null, querySelector: selector => body.querySelector(selector), querySelectorAll: selector => selector === '#cp-modal input,#cp-modal select' ? [...campos.values()].filter(el => ['INPUT', 'SELECT'].includes(el.tagName) && el.id?.startsWith('cp-')) : [], addEventListener() {} } };
}

function ambiente(initial = estadoSintetico(), journal = new Map()) {
  const dom = domSintetico(), avisos = [], pedidos = [], storage = new Map();
  let estado = plain(initial), onWrite;
  const ctx = {
    console: { log() {}, warn() {}, error() {} }, crypto: webcrypto,
    document: dom.document, window: {}, _companyId: empresa,
    usuarioAtual: { id: id(8), perfil: 'admin', role: 'admin', permissions: { caixa: true } },
    hojeISO: () => '2026-09-16', fmtData: x => x, fmt: x => Number(x).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
    esc: x => String(x ?? '').replace(/[&<>"']/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[x]),
    showToast: msg => avisos.push(msg), confirmar: async () => true, confirm: () => true,
    prompt: () => 'Cancelamento sintético para conferência',
    setTimeout, clearTimeout,
    contasPagar: [{ id: obrigacao, company_id: empresa, fornecedor: 'Fornecedor sintético', descricao: 'Obrigação anterior ao corte', valor: 400, status: 'pendente', data_vencimento: '2026-09-01' }],
    lancamentos: [], adicionaisPgtos: [], obras: [],
    loadContasPagar: async () => true,
    sbGet: async tabela => {
      if (tabela !== 'contas_pagar') throw Error('Leitura inesperada: ' + tabela);
      return plain(ctx.contasPagar);
    },
    localStorage: { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) },
    sessionStorage: { getItem: k => journal.get(k) || null, setItem: (k, v) => journal.set(k, v), removeItem: k => journal.delete(k) },
    sbPost: async () => { throw Error('Escrita legada proibida no ensaio'); },
    sbPatch: async () => { throw Error('Escrita legada proibida no ensaio'); },
    fetch: async () => { throw Error('Rede externa proibida no ensaio'); },
    sbRpcEstoque: async (fn, params = {}) => {
      pedidos.push({ fn, params: plain(params) });
      if (fn === 'caixa_estado') return { ok: true, dados: plain(estado) };
      if (fn !== 'caixa_registrar') throw Error('RPC inesperada: ' + fn);
      if (onWrite) return onWrite(fn, params);
      return { ok: true, dados: { company_id: empresa, operacao_id: params.p_operacao, status: 'registrado', estado: plain(estado) } };
    },
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(modulePath, 'utf8'), ctx, { filename: modulePath });
  ctx.renderCaixa = () => ctx.caixaProspectivoRender(dom.content);
  const writes = () => pedidos.filter(p => p.fn === 'caixa_registrar');
  return { ...dom, ctx, avisos, pedidos, storage, journal, writes, setEstado: x => { estado = plain(x); }, onWrite: f => { onWrite = f; } };
}

async function abrir(a, tipo = 'entrada', conta = null) {
  await a.ctx.caixaProspectivoRender(a.content);
  await a.ctx.caixaProspectivoAbrir(tipo, conta);
}

function preencher(a, values = {}) {
  for (const [name, value] of Object.entries({ 'cp-data': '2026-09-16', 'cp-hora': '14:05', 'cp-conta': banco, 'cp-valor': '50.00', 'cp-descricao': 'Movimento sintético', ...values })) {
    const field = a.campos.get(name);
    assert.ok(field, 'Campo esperado no formulário: ' + name);
    field.value = value;
  }
}

function financeiroSemCaixa(contas = [{ id: obrigacao, company_id: empresa, fornecedor: 'Fornecedor sintético', descricao: 'Obrigação sintética', valor: 400, obra_id: id(11), status: 'pendente', data_vencimento: '2026-09-01' }]) {
  const dom = domSintetico(), avisos = [], mutacoes = [];
  const ctx = {
    document: dom.document, console: { log() {}, warn() {}, error() {} },
    _companyId: empresa, usuarioAtual: { id: id(8), perfil: 'admin' },
    hojeISO: () => '2026-09-16', esc: x => String(x ?? ''), fmtData: x => x,
    fmt: x => Number(x).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
    lancamentos: [], adicionaisPgtos: [], obras: [],
    showToast: msg => avisos.push(msg), confirm: () => true, confirmar: async () => true,
    fecharModal() {}, openModal() {}, setTimeout() {}, custoClassificacaoNovo: () => ({}),
    sbGet: async tabela => tabela === 'contas_pagar' ? plain(contas) : [],
    sbPatch: async (tabela, query, payload) => { mutacoes.push({ tipo: 'patch', tabela, query, payload: plain(payload) }); return { id: contas[0]?.id, ...payload }; },
    sbPost: async (tabela, payload) => { mutacoes.push({ tipo: 'post', tabela, payload: plain(payload) }); return { id: id(99), ...payload }; },
    sbPostMinimal: async (tabela, payload) => { mutacoes.push({ tipo: 'postMinimal', tabela, payload: plain(payload) }); return true; },
    sbDelete: async (tabela, query) => { mutacoes.push({ tipo: 'delete', tabela, query }); return true; },
    fetch: async () => { throw Error('Rede externa proibida no ensaio'); },
    _testContas: plain(contas),
  };
  for (const [name, value] of Object.entries({ 'conta-id': contas[0]?.id || '', 'conta-fornecedor': 'Fornecedor editado', 'conta-descricao': 'Descrição sintética editada', 'conta-valor': '500', 'conta-vencimento': '2026-09-20', 'conta-obra': id(11), 'conta-nota-ref': '' })) dom.campos.set(name, { value });
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/edr-v2-financeiro.js'), 'utf8') + '\ncontasPagar = _testContas;', ctx);
  return { ...dom, ctx, avisos, mutacoes, contas: () => plain(vm.runInContext('contasPagar', ctx)) };
}

test('integração: módulo Caixa ausente bloqueia pagamento comum e qualquer custo legado', async () => {
  const a = financeiroSemCaixa();
  await a.ctx.marcarComoPago(obrigacao);
  assert.equal(a.mutacoes.length, 0, 'Pagamento comum não pode cair em status pago ou custo legado');
  assert.equal(a.contas()[0].status, 'pendente');
  assert.match(a.avisos.join(' '), /indisponível.*pagamento/i);
});

test('integração: módulo Caixa ausente bloqueia edição e exclusão da obrigação existente', async () => {
  const a = financeiroSemCaixa(); const original = a.contas();
  await a.ctx.salvarConta(); await a.ctx.excluirConta(obrigacao);
  assert.equal(a.mutacoes.length, 0);
  assert.deepEqual(a.contas(), original);
  assert.match(a.avisos.join(' '), /indisponível.*alterar.*indisponível.*excluir/i);
});

test('integração: carga parcial do módulo sem guard de leitura também bloqueia alterações', async () => {
  const a = financeiroSemCaixa();
  a.ctx.caixaProspectivoAbrir = async () => {};
  a.ctx.caixaProspectivoVinculada = () => false;
  await a.ctx.salvarConta(); await a.ctx.excluirConta(obrigacao);
  assert.equal(a.mutacoes.length, 0, 'A presença de outros helpers não substitui a leitura confirmada');
  assert.equal(a.contas()[0].valor, 400);
});

test('integração: falha na leitura persistida ao pagar não ativa caminho legado', async () => {
  const a = ambiente(); a.ctx._testContas = plain(a.ctx.contasPagar);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/edr-v2-financeiro.js'), 'utf8') + '\ncontasPagar = _testContas;', a.ctx);
  a.ctx.sbRpcEstoque = async () => ({ ok: false, ausente: true });
  let mutations = 0; a.ctx.sbPatch = a.ctx.sbPostMinimal = async () => { mutations++; return true; };
  await a.ctx.marcarComoPago(obrigacao);
  assert.equal(mutations, 0);
  assert.equal(vm.runInContext('contasPagar[0].status', a.ctx), 'pendente');
  assert.match(a.avisos.join(' '), /não instalado/i);
});

test('integração: recebimento de reembolso preserva confirmação e data sem módulo Caixa', async () => {
  const conta = { id: obrigacao, tipo: 'reembolso_fornecedor', fornecedor: 'Fornecedor sintético', valor: 80, status: 'pendente', data_vencimento: '2026-09-20' };
  const a = financeiroSemCaixa([conta]);
  let confirmation = '';
  a.ctx.confirm = msg => { confirmation = msg; return true; };
  await a.ctx.marcarComoPago(obrigacao);
  assert.match(confirmation, /reembolso.*recebido/i);
  assert.deepEqual(a.mutacoes.map(m => ({ tipo: m.tipo, tabela: m.tabela, payload: m.payload })), [{ tipo: 'patch', tabela: 'contas_pagar', payload: { status: 'pago', data_recebimento: '2026-09-16' } }]);
  assert.equal(a.contas()[0].status, 'pago');
  assert.equal(a.contas()[0].data_recebimento, '2026-09-16');
  assert.match(a.avisos.join(' '), /Reembolso confirmado/);
});

test('integração: nova obrigação continua sendo cadastro pendente sem módulo Caixa', async () => {
  const a = financeiroSemCaixa([]);
  await a.ctx.salvarConta();
  assert.equal(a.mutacoes.length, 1);
  assert.equal(a.mutacoes[0].tipo, 'post');
  assert.equal(a.mutacoes[0].tabela, 'contas_pagar');
  assert.equal(a.mutacoes[0].payload.status, 'pendente');
  assert.equal(a.contas()[0].status, 'pendente');
});

test('UI: tela exibe banco, dinheiro, total e obrigações separadas', async () => {
  const a = ambiente();
  await a.ctx.caixaProspectivoRender(a.content);
  assert.match(a.content.innerHTML, /Banco de teste/);
  assert.match(a.content.innerHTML, /Dinheiro de teste/);
  assert.match(a.content.innerHTML, /1\.100,00/);
  assert.match(a.content.innerHTML, /saldo informado|abertura/i);
  assert.equal(a.writes().length, 0);
  assert.equal(a.storage.size, 0);
});

test('UI: entrada e saída enviam conta, valor em centavos e data efetiva', async () => {
  for (const tipo of ['entrada', 'saida']) {
    const a = ambiente(); await abrir(a, tipo); preencher(a);
    await a.ctx.caixaProspectivoSalvar();
    assert.equal(a.writes().length, 1);
    const { params } = a.writes()[0];
    assert.equal(params.p_pedido.tipo, tipo);
    assert.equal(params.p_pedido.conta_id, banco);
    assert.equal(params.p_pedido.valor_centavos, 5000);
    assert.equal(params.p_pedido.data_efetiva, '2026-09-16');
    assert.equal(params.p_pedido.hora_efetiva, '14:05');
    assert.match(params.p_operacao, /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i);
    assert.equal(a.storage.size, 0);
  }
});

test('UI: transferência vinculada usa uma RPC; origem igual ao destino bloqueia', async () => {
  const a = ambiente(); await abrir(a, 'transferencia'); preencher(a, { 'cp-destino': dinheiro });
  await a.ctx.caixaProspectivoSalvar();
  assert.equal(a.writes().length, 1);
  assert.equal(a.writes()[0].params.p_pedido.tipo, 'transferencia');
  assert.equal(a.writes()[0].params.p_pedido.destino_id, dinheiro);
  const b = ambiente(); await abrir(b, 'transferencia'); preencher(b, { 'cp-destino': banco });
  await b.ctx.caixaProspectivoSalvar();
  assert.equal(b.writes().length, 0);
  assert.match(b.campos.get('cp-erro').textContent, /diferente|mesma conta/i);
});

test('UI: pagamento parcial envia obrigação antiga sem criar novo custo', async () => {
  const a = ambiente(); await abrir(a, 'pagamento', obrigacao); preencher(a, { 'cp-valor': '150.00' });
  await a.ctx.caixaProspectivoSalvar();
  assert.equal(a.writes().length, 1);
  assert.equal(a.writes()[0].params.p_pedido.conta_pagar_id, obrigacao);
  assert.equal(a.writes()[0].params.p_pedido.valor_centavos, 15000);
  assert.equal(a.ctx.lancamentos.length, 0);
});

test('UI: clique duplo durante persistência envia apenas uma operação', async () => {
  const a = ambiente(); await abrir(a); preencher(a);
  let finish;
  a.onWrite((fn, params) => new Promise(resolve => { finish = () => resolve({ ok: true, dados: { company_id: empresa, operacao_id: params.p_operacao, status: 'registrado', estado: estadoSintetico() } }); }));
  const first = a.ctx.caixaProspectivoSalvar();
  await a.ctx.caixaProspectivoSalvar();
  assert.equal(a.writes().length, 1);
  finish(); await first;
});

test('UI: resposta perdida conserva UUID e pedido no reenvio, sem anunciar sucesso', async () => {
  const a = ambiente(); await abrir(a); preencher(a);
  a.onWrite(async () => ({ ok: false, incerto: true, mensagem: 'Conexão sintética interrompida' }));
  await a.ctx.caixaProspectivoSalvar();
  const original = a.writes()[0].params;
  assert.ok(a.campos.get('cp-modal'), 'Formulário deve permitir recuperar a operação incerta');
  assert.doesNotMatch(a.avisos.join(' '), /registrado com sucesso|salvo com sucesso/i);
  a.onWrite(async (fn, params) => ({ ok: true, dados: { company_id: empresa, operacao_id: params.p_operacao, status: 'registrado', estado: estadoSintetico() } }));
  await a.ctx.caixaProspectivoSalvar();
  assert.equal(a.writes().length, 2);
  assert.deepEqual(a.writes()[1].params, original);
});

test('UI: cancelamento do formulário não grava; cancelamento de movimento usa RPC', async () => {
  const a = ambiente(); await abrir(a); preencher(a);
  await a.ctx.caixaProspectivoCancelarFormulario();
  assert.equal(a.writes().length, 0);
  const state = estadoSintetico();
  state.movimentos.push({ id: id(9), tipo: 'saida', conta_id: banco, destino_id: null, valor_centavos: 5000, data_efetiva: '2026-09-16', hora_efetiva: '14:05', decisao_corte: null, descricao: 'Saída sintética', cancelado_em: null, afeta_saldo: true });
  a.setEstado(state); await a.ctx.caixaProspectivoRender(a.content);
  await a.ctx.caixaProspectivoCancelarMovimento(id(9));
  assert.equal(a.writes().length, 1);
  assert.equal(a.writes()[0].params.p_pedido.movimento_id, id(9));
});

test('UI: falha definitiva de persistência preserva formulário e saldo confirmado', async () => {
  const a = ambiente(); await abrir(a); preencher(a); const before = a.content.innerHTML;
  a.onWrite(async () => ({ ok: false, incerto: false, mensagem: 'Falha de persistência sintética' }));
  await a.ctx.caixaProspectivoSalvar();
  assert.match(a.campos.get('cp-erro').textContent, /Falha de persistência sintética/);
  assert.ok(a.campos.get('cp-modal'));
  assert.equal(a.content.innerHTML, before);
  assert.equal(a.storage.size, 0);
});

test('UI: movimento no dia do corte sem horário exige declaração explícita', async () => {
  const a = ambiente(); await abrir(a); preencher(a, { 'cp-data': '2026-09-14', 'cp-hora': '', 'cp-decisao': '' });
  await a.ctx.caixaProspectivoSalvar();
  assert.equal(a.writes().length, 0);
  assert.match(a.campos.get('cp-erro').textContent, /corte|horário/i);
  a.campos.get('cp-decisao').value = 'apos_corte';
  await a.ctx.caixaProspectivoSalvar();
  assert.equal(a.writes().length, 1);
  assert.equal(a.writes()[0].params.p_pedido.decisao_corte, 'apos_corte');
  assert.equal(a.writes()[0].params.p_pedido.hora_efetiva, null);
});

test('UI: dados retornados de outra empresa não são exibidos nem aceitos', async () => {
  const state = estadoSintetico(); state.company_id = id(99);
  const a = ambiente(state); await a.ctx.caixaProspectivoRender(a.content);
  assert.doesNotMatch(a.content.innerHTML, /Banco de teste/);
  assert.match(a.content.innerHTML + a.avisos.join(' '), /empresa|indisponível|carregar/i);
  assert.equal(a.writes().length, 0);
});

test('UI: abertura envia saldo informado sem sobrescrever manual antigo', async () => {
  const state = estadoSintetico(); state.contas = []; state.total_centavos = 0;
  const a = ambiente(state); a.ctx._saldoManual = 777;
  await abrir(a, 'abertura');
  for (const [field, value] of Object.entries({ 'cp-corte': '2026-09-14T12:00', 'cp-banco': '1000.00', 'cp-dinheiro': '100.00' })) a.campos.get(field).value = value;
  await a.ctx.caixaProspectivoSalvar();
  assert.equal(a.writes().length, 1);
  assert.deepEqual(a.writes()[0].params.p_pedido, {
    action: 'abertura', corte_local: '2026-09-14T12:00', fuso: 'America/Sao_Paulo',
    contas: [{ codigo: 'banco', nome: 'C6 PJ', saldo_centavos: 100000 }, { codigo: 'dinheiro', nome: 'Dinheiro no escritório', saldo_centavos: 10000 }],
  });
  assert.equal(a.ctx._saldoManual, 777);
  assert.equal(a.ctx.lancamentos.length, 0);
  assert.equal(a.storage.size, 0);
});

test('UI: journal recupera após recarga o mesmo UUID e payload; nenhum saldo é guardado', async () => {
  const a = ambiente(); await abrir(a); preencher(a);
  a.onWrite(async () => ({ ok: false, incerto: true, mensagem: 'Resposta perdida sintética' }));
  await a.ctx.caixaProspectivoSalvar();
  assert.equal(a.journal.size, 1);
  const serialized = [...a.journal.values()][0];
  assert.doesNotMatch(serialized, /saldo_centavos|abertura_centavos|total_centavos/);
  const b = ambiente(estadoSintetico(), a.journal);
  await b.ctx.caixaProspectivoRender(b.content);
  assert.match(b.content.innerHTML, /Conferir pedido pendente/);
  await b.ctx.caixaProspectivoAbrir('saida'); assert.equal(b.writes().length, 0);
  await b.ctx.caixaProspectivoConferirPendente();
  assert.deepEqual(b.writes()[0].params, a.writes()[0].params);
  assert.equal(b.journal.size, 0);
});

test('UI: indisponibilidade do journal bloqueia envio antes da persistência', async () => {
  const a = ambiente(); await abrir(a); preencher(a);
  a.ctx.sessionStorage.setItem = () => { throw Error('Journal sintético indisponível'); };
  await a.ctx.caixaProspectivoSalvar();
  assert.equal(a.writes().length, 0);
  assert.match(a.campos.get('cp-erro').textContent, /Journal sintético indisponível|recuperação/i);
});

test('UI: erro de consulta de obrigações não exibe saldo operacional', async () => {
  const a = ambiente(); a.ctx.sbGet = async () => { throw Error('Leitura sintética falhou'); };
  await a.ctx.caixaProspectivoRender(a.content);
  assert.doesNotMatch(a.content.innerHTML, /TOTAL DISPONÍVEL/);
  assert.match(a.content.innerHTML, /obrigações|consultar/i);
  assert.equal(a.writes().length, 0);
});

test('UI: resposta de gravação de outra empresa mantém pedido sem sucesso', async () => {
  const a = ambiente(); await abrir(a); preencher(a);
  a.onWrite(async (fn, params) => ({ ok: true, dados: { company_id: id(99), operacao_id: params.p_operacao } }));
  await a.ctx.caixaProspectivoSalvar();
  assert.ok(a.campos.get('cp-modal'));
  assert.equal(a.journal.size, 1);
  assert.doesNotMatch(a.avisos.join(' '), /Registro persistido/);
});

test('integração: renderCaixa usa saldo persistido e botão Pago abre pagamento parcial', async () => {
  const a = ambiente();
  a.ctx._testContas = plain(a.ctx.contasPagar);
  for (const name of ['contas-stats', 'contas-lista']) { const el = a.ctx.document.createElement('div'); el.id = name; }
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/edr-v2-financeiro.js'), 'utf8') + '\ncontasPagar = _testContas; _saldoManual = 777;', a.ctx);
  await a.ctx.renderCaixa();
  assert.match(a.content.innerHTML, /1\.100,00/);
  a.ctx.lancamentos.push({ data: '2026-09-10', total: 5000, etapa: '28_mao' });
  await a.ctx.renderCaixa();
  assert.match(a.content.innerHTML, /1\.100,00/);
  await a.ctx.marcarComoPago(obrigacao);
  assert.match(a.ctx.document.body.innerHTML, /Pagamento efetivo/);
  assert.equal(a.writes().length, 0, 'Abrir pagamento não pode marcar a obrigação como paga');
  preencher(a, { 'cp-valor': '150.00' }); await a.ctx.caixaProspectivoSalvar();
  assert.equal(a.writes().length, 1);
  assert.equal(a.writes()[0].params.p_pedido.conta_pagar_id, obrigacao);
  assert.equal(a.ctx.lancamentos.length, 1, 'Pagamento não pode criar outro custo');
  assert.equal(vm.runInContext('_saldoManual', a.ctx), 777);
  assert.doesNotMatch(a.campos.get('contas-stats').innerHTML, /Pagamentos persistidos indisponíveis/);
  assert.match(a.campos.get('contas-lista').innerHTML, /Fornecedor sintético/);
});

test('integração: fechar folha antiga já abrangida na abertura não baixa saldo', async () => {
  const a = ambiente(); await a.ctx.caixaProspectivoRender(a.content);
  const source = fs.readFileSync(path.join(__dirname, '../js/edr-v2-diarias.js'), 'utf8');
  const helper = source.match(/function _diarMontarPlanoLancamento\([\s\S]*?\n\}/);
  const close = source.match(/async function diarConfirmarLancamentosEDR\([\s\S]*?\n\}/);
  assert.ok(helper && close, 'Fluxo real da folha deve existir');
  a.ctx.DiariasModule = { quinzenaAtiva: { id: id(12), data_fim: '2026-09-10', fechada: false } };
  a.ctx._diarAtualizarSelectQuinzena = () => {};
  a.ctx.custoClassificacaoNovo = () => ({ destino_custo: 'obra', adicional_id: null });
  a.campos.set('diar-btnConfirmarEDR', { disabled: false, textContent: '' });
  a.campos.set('diar-edrStatus', { innerHTML: '' });
  a.campos.set('diar-modalEDR', { dataset: { obs: 'Folha sintética anterior à abertura' } });
  const select = a.ctx.document.querySelectorAll;
  a.ctx.document.querySelectorAll = selector => selector === '#diar-modalEDRBody tbody tr' ? [{ dataset: { id: id(11), obra: 'Obra sintética', valor: '250' } }] : select(selector);
  const get = a.ctx.sbGet, synthetics = [];
  a.ctx.sbGet = async tabela => tabela === 'lancamentos' ? [] : get(tabela);
  a.ctx.sbPostMinimal = async (tabela, payload) => { synthetics.push({ tabela, payload: plain(payload) }); a.ctx.lancamentos.push(payload); return true; };
  a.ctx.sbPatch = async (tabela, query, payload) => { synthetics.push({ tabela, query, payload }); return payload; };
  vm.runInContext(helper[0] + '\n' + close[0], a.ctx);
  await a.ctx.diarConfirmarLancamentosEDR();
  assert.equal(a.ctx.DiariasModule.quinzenaAtiva.fechada, true);
  assert.deepEqual(synthetics.map(x => x.tabela), ['lancamentos', 'diarias_quinzenas']);
  assert.equal(synthetics[0].payload.data, '2026-09-10', 'Competência da folha permanece anterior ao corte');
  assert.equal(a.writes().length, 0, 'Fechar folha não registra pagamento financeiro');
  await a.ctx.caixaProspectivoRender(a.content);
  assert.match(a.content.innerHTML, /1\.100,00/);
});

test('UI: cancelamento confirmado no banco com resposta perdida recupera após recarga', async () => {
  const state = estadoSintetico();
  state.movimentos = [{ id: id(9), tipo: 'saida', conta_id: banco, valor_centavos: 5000, data_efetiva: '2026-09-16', hora_efetiva: '14:05', descricao: 'Saída sintética', afeta_saldo: true, cancelado_em: null }];
  const a = ambiente(state); await a.ctx.caixaProspectivoRender(a.content);
  a.onWrite(async () => ({ ok: false, incerto: true, mensagem: 'Resposta perdida sintética' }));
  await a.ctx.caixaProspectivoCancelarMovimento(id(9));
  assert.equal(a.journal.size, 1);
  const committed = plain(state); committed.movimentos[0].cancelado_em = '2026-09-16T18:00:00Z';
  const b = ambiente(committed, a.journal); await b.ctx.caixaProspectivoRender(b.content);
  await b.ctx.caixaProspectivoConferirPendente();
  assert.equal(b.writes().length, 1, 'Mesmo movimento já cancelado precisa repetir RPC idempotente para confirmar o pedido pendente');
  assert.deepEqual(b.writes()[0].params, a.writes()[0].params);
  assert.equal(b.journal.size, 0);
});

test('UI: troca de empresa durante envio preserva journal da origem sem sucesso falso', async () => {
  const a = ambiente(); await abrir(a); preencher(a);
  a.onWrite(async (fn, params) => { a.ctx._companyId = id(99); return { ok: true, dados: { company_id: empresa, operacao_id: params.p_operacao } }; });
  await a.ctx.caixaProspectivoSalvar();
  assert.equal(a.journal.size, 1);
  assert.doesNotMatch(a.avisos.join(' '), /Registro persistido/);
  assert.ok([...a.journal.keys()].every(key => key.endsWith(empresa)), 'Chave pendente continua vinculada à empresa de origem');
  assert.equal(a.campos.get('cp-modal'), undefined, 'Modal da empresa anterior deve sair da sessão nova');
});

test('UI: conta avulsa com obra exige declarar custo já registrado, sem lançar outro custo', async () => {
  const a = ambiente(); a.ctx.contasPagar[0].obra_id = id(11);
  await abrir(a, 'pagamento', obrigacao); preencher(a, { 'cp-valor': '100.00' });
  assert.ok(a.campos.get('cp-custo-confirmado'));
  await a.ctx.caixaProspectivoSalvar();
  assert.equal(a.writes().length, 0);
  assert.match(a.campos.get('cp-erro').textContent, /custo na obra/i);
  a.campos.get('cp-custo-confirmado').checked = true;
  await a.ctx.caixaProspectivoSalvar();
  assert.equal(a.writes().length, 1);
  assert.equal(a.writes()[0].params.p_pedido.custo_confirmado, true);
  assert.equal(a.ctx.lancamentos.length, 0);
});

test('integração: obrigação com pagamento vinculado não pode ser editada ou excluída', async () => {
  const state = estadoSintetico(); state.movimentos = [{ id: id(9), tipo: 'pagamento', conta_id: banco, conta_pagar_id: obrigacao, valor_centavos: 10000, data_efetiva: '2026-09-16', descricao: 'Pagamento sintético', afeta_saldo: true }];
  const a = ambiente(state); a.ctx._testContas = plain(a.ctx.contasPagar);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/edr-v2-financeiro.js'), 'utf8') + '\ncontasPagar = _testContas;', a.ctx);
  for (const [name, value] of Object.entries({ 'conta-id': obrigacao, 'conta-fornecedor': 'Fornecedor alterado', 'conta-descricao': 'Alteração sintética', 'conta-valor': '500', 'conta-vencimento': '2026-09-20', 'conta-obra': '', 'conta-nota-ref': '' })) a.campos.set(name, { value });
  let mutations = 0;
  a.ctx.sbPatch = a.ctx.sbDelete = async () => { mutations++; return true; };
  await a.ctx.salvarConta(); await a.ctx.excluirConta(obrigacao);
  assert.equal(mutations, 0);
  assert.match(a.avisos.join(' '), /vinculada/);
});

test('UI: parcial persistido exibe restante separado do saldo disponível', async () => {
  const state = estadoSintetico(); state.pagamentos[0] = { conta_pagar_id: obrigacao, pago_centavos: 15000, restante_centavos: 25000 };
  const a = ambiente(state); await a.ctx.caixaProspectivoRender(a.content);
  assert.equal(a.ctx.caixaProspectivoRestante(a.ctx.contasPagar[0]), 250);
  assert.match(a.content.innerHTML, /Obrigações a pagar.*250,00/);
  assert.match(a.content.innerHTML, /TOTAL DISPONÍVEL.*1\.100,00/);
});

test('integração: falha na recarga de pagamentos bloqueia edição e exclusão de obrigação', async () => {
  const a = ambiente(); a.ctx._testContas = plain(a.ctx.contasPagar);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/edr-v2-financeiro.js'), 'utf8') + '\ncontasPagar = _testContas;', a.ctx);
  for (const [name, value] of Object.entries({ 'conta-id': obrigacao, 'conta-fornecedor': 'Fornecedor alterado', 'conta-descricao': 'Alteração sintética', 'conta-valor': '500', 'conta-vencimento': '2026-09-20', 'conta-obra': '', 'conta-nota-ref': '' })) a.campos.set(name, { value });
  await a.ctx.caixaProspectivoCarregar();
  a.ctx.sbRpcEstoque = async () => ({ ok: false, mensagem: 'Leitura sintética indisponível' });
  let mutations = 0; a.ctx.sbPatch = a.ctx.sbDelete = async () => { mutations++; return true; };
  await a.ctx.salvarConta(); await a.ctx.excluirConta(obrigacao);
  assert.equal(mutations, 0, 'Cache antigo não pode autorizar alteração quando a recarga falhar');
  assert.match(a.avisos.join(' '), /conferir os pagamentos|Recarregue/);
});

function carregarAlertas(a) {
  const source = fs.readFileSync(path.join(__dirname, '../js/edr-v2-alertas.js'), 'utf8');
  const caixa = source.match(/async function _alertCaixa\([\s\S]*?\n\}/);
  const contas = source.match(/async function _alertContasPagar\([\s\S]*?\n\}/);
  assert.ok(caixa && contas, 'Helpers reais de alerta devem existir');
  a.ctx.fmtR = a.ctx.fmt;
  vm.runInContext(caixa[0] + '\n' + contas[0], a.ctx);
}

test('alerta: usa saldo persistido e não deduz novamente custos antigos', async () => {
  const a = ambiente(); carregarAlertas(a);
  a.ctx.lancamentos.push({ total: 10000, data: '2026-09-10', etapa: '28_mao' });
  const alerts = []; await a.ctx._alertCaixa(alerts, '2026-09-16');
  assert.equal(alerts.length, 0);
  const negative = estadoSintetico(); negative.total_centavos = -2500;
  a.setEstado(negative); await a.ctx._alertCaixa(alerts, '2026-09-16');
  assert.equal(alerts.length, 1); assert.match(alerts[0].msg, /25,00/);
  a.ctx.sbRpcEstoque = async () => ({ ok: false });
  await a.ctx._alertCaixa(alerts, '2026-09-16');
  assert.equal(alerts.length, 1, 'Leitura falha não pode fabricar outro alerta de saldo');
});

test('alerta: obrigação parcialmente paga apresenta apenas o restante a pagar', async () => {
  const state = estadoSintetico(); state.pagamentos[0] = { conta_pagar_id: obrigacao, pago_centavos: 15000, restante_centavos: 25000 };
  const a = ambiente(state); carregarAlertas(a); await a.ctx.caixaProspectivoCarregar();
  const alerts = []; await a.ctx._alertContasPagar(alerts, '2026-09-16', '2026-09-23');
  assert.equal(alerts.length, 1);
  assert.match(alerts[0].msg, /250,00/);
  assert.doesNotMatch(alerts[0].msg, /400,00/);
});

test('UI: erro definitivo após resposta incerta conserva UUID e journal do movimento', async () => {
  const a = ambiente(); await abrir(a); preencher(a);
  a.onWrite(async () => ({ ok: false, incerto: true, mensagem: 'Resposta sintética perdida' }));
  await a.ctx.caixaProspectivoSalvar();
  const original = a.writes()[0].params;
  a.onWrite(async () => ({ ok: false, incerto: false, mensagem: 'Erro definitivo nesta tentativa sintética' }));
  await a.ctx.caixaProspectivoSalvar();
  assert.equal(a.journal.size, 1, 'Falha do replay não desmente gravação possível da tentativa original');
  assert.deepEqual(a.writes()[1].params, original);
  assert.equal(a.campos.get('cp-conta').disabled, true);
  await a.ctx.caixaProspectivoCancelarFormulario();
  assert.ok(a.campos.get('cp-modal'));
  a.onWrite(async (fn, params) => ({ ok: true, dados: { company_id: empresa, operacao_id: params.p_operacao } }));
  await a.ctx.caixaProspectivoSalvar();
  assert.deepEqual(a.writes()[2].params, original);
  assert.equal(a.journal.size, 0);
});

test('UI: erro definitivo na recuperação de cancelamento incerto conserva UUID e journal', async () => {
  const state = estadoSintetico();
  state.movimentos = [{ id: id(9), tipo: 'saida', conta_id: banco, valor_centavos: 5000, data_efetiva: '2026-09-16', descricao: 'Saída sintética', afeta_saldo: true, cancelado_em: null }];
  const a = ambiente(state); await a.ctx.caixaProspectivoRender(a.content);
  a.onWrite(async () => ({ ok: false, incerto: true }));
  await a.ctx.caixaProspectivoCancelarMovimento(id(9));
  const original = a.writes()[0].params;
  const b = ambiente(state, a.journal); await b.ctx.caixaProspectivoRender(b.content);
  b.onWrite(async () => ({ ok: false, incerto: false, mensagem: 'Erro definitivo nesta tentativa sintética' }));
  await b.ctx.caixaProspectivoConferirPendente();
  assert.equal(b.journal.size, 1);
  assert.deepEqual(b.writes()[0].params, original);
  assert.doesNotMatch(b.avisos.join(' '), /Cancelamento persistido/);
  b.onWrite(async (fn, params) => ({ ok: true, dados: { company_id: empresa, operacao_id: params.p_operacao } }));
  await b.ctx.caixaProspectivoConferirPendente();
  assert.deepEqual(b.writes()[1].params, original);
  assert.equal(b.journal.size, 0);
});

test('UI: leitura administrativa pendente não vaza após mudança de perfil ou ator no mesmo tenant', async () => {
  for (const tipo of ['perfil', 'ator']) {
    const a = ambiente(); let reads = 0, releaseOld, releaseFresh;
    a.ctx.sbRpcEstoque = async fn => {
      assert.equal(fn, 'caixa_estado'); reads++;
      return new Promise(resolve => { if (reads === 1) releaseOld = resolve; else releaseFresh = resolve; });
    };
    const oldRead = a.ctx.caixaProspectivoCarregar();
    if (tipo === 'perfil') a.ctx.usuarioAtual.perfil = 'operacional';
    else a.ctx.usuarioAtual = { id: id(88), perfil: 'admin', role: 'admin' };
    assert.equal(a.ctx.caixaProspectivoEstado(), null);
    const currentRead = a.ctx.caixaProspectivoCarregar();
    if (tipo === 'perfil') {
      assert.equal(await currentRead, null); assert.equal(reads, 1);
    } else {
      assert.equal(reads, 2, 'Novo ator precisa de nova leitura, sem compartilhar promessa do ator anterior');
    }
    releaseOld({ ok: true, dados: estadoSintetico() });
    assert.equal(await oldRead, null);
    assert.equal(a.ctx.caixaProspectivoEstado(), null, 'Resposta do usuário anterior não pode alimentar o cache atual');
    if (tipo === 'ator') {
      const fresh = estadoSintetico(); fresh.total_centavos = 77700;
      releaseFresh({ ok: true, dados: fresh });
      assert.equal((await currentRead).total_centavos, 77700);
      assert.equal(a.ctx.caixaProspectivoEstado().total_centavos, 77700);
    }
  }
});

test('UI: consulta anterior ao commit não alimenta saldo depois da gravação', async () => {
  const a = ambiente(); await abrir(a); preencher(a);
  let releaseWrite, releaseOld, reads = 0;
  a.onWrite((fn, params) => new Promise(resolve => { releaseWrite = () => resolve({ ok: true, dados: { company_id: empresa, operacao_id: params.p_operacao } }); }));
  const saving = a.ctx.caixaProspectivoSalvar();
  const originalRpc = a.ctx.sbRpcEstoque;
  a.ctx.sbRpcEstoque = async (fn, params) => {
    if (fn === 'caixa_estado' && ++reads === 1) return new Promise(resolve => { releaseOld = resolve; });
    return originalRpc(fn, params);
  };
  const beforeCommit = a.ctx.caixaProspectivoCarregar();
  const fresh = estadoSintetico(); fresh.contas[0].saldo_centavos = 105000; fresh.total_centavos = 115000;
  a.setEstado(fresh); releaseWrite();
  await new Promise(resolve => setImmediate(resolve));
  const requestedFreshBeforeOldResponse = reads >= 2;
  releaseOld({ ok: true, dados: estadoSintetico() });
  await saving;
  assert.equal(await beforeCommit, null, 'Leitura iniciada antes da gravação deve ser invalidada');
  assert.equal(requestedFreshBeforeOldResponse, true, 'Após commit a UI precisa consultar novamente, sem reutilizar promessa anterior');
  assert.equal(a.ctx.caixaProspectivoEstado().total_centavos, 115000);
  assert.match(a.content.innerHTML, /TOTAL DISPONÍVEL.*1\.150,00/);
});

// Defina EDR_PLAYWRIGHT_PATH (pasta de playwright) e opcionalmente
// EDR_CHROMIUM_PATH (chrome.exe já instalado) para executar no navegador real.
if (!process.env.EDR_PLAYWRIGHT_PATH) {
  test('UI Chromium: DOM real e fluxos sintéticos', { skip: 'Defina EDR_PLAYWRIGHT_PATH; este ensaio de navegador não foi executado.' }, () => {});
} else {
  test('UI Chromium: DOM real, entrada, transferência e falha de persistência', async t => {
    const { chromium } = require(process.env.EDR_PLAYWRIGHT_PATH);
    const browser = await chromium.launch({ headless: true, ...(process.env.EDR_CHROMIUM_PATH ? { executablePath: process.env.EDR_CHROMIUM_PATH } : {}) });
    t.after(() => browser.close());
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    let external = 0;
    const harnessUrl = 'http://127.0.0.1:43199/caixa-sintetico';
    const projectStyle = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8').match(/<style>([\s\S]*?)<\/style>/)[1];
    const html = '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><style>' + projectStyle + '</style><body><main id="caixa-content" style="max-width:1040px;margin:32px auto;padding:0 20px;"></main></body></html>';
    // A navegação é respondida pelo próprio teste; nenhum servidor é iniciado
    // ou acessado. A origem localhost permite sessionStorage e crypto reais.
    await page.route('**/*', route => {
      if (route.request().url() === harnessUrl) return route.fulfill({ status: 200, contentType: 'text/html', body: html });
      external++; return route.abort();
    });
    await page.goto(harnessUrl);
    await page.evaluate(({ state, ids }) => {
      window._companyId = ids.empresa; window.usuarioAtual = { id: ids.empresa, perfil: 'admin', role: 'admin' };
      window.__state = state; window.__writes = []; window.__toasts = []; window.__fail = false;
      window.hojeISO = () => '2026-09-16'; window.fmtData = x => x ? String(x).split('-').reverse().join('/') : '';
      window.fmt = x => Number(x).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      window.esc = x => String(x ?? '').replace(/[&<>"']/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[x]);
      window.showToast = msg => window.__toasts.push(msg); window.confirmar = async () => true;
      window.contasPagar = [{ id: ids.obrigacao, fornecedor: 'Fornecedor sintético', descricao: 'Obrigação sintética', valor: 400, status: 'pendente', data_vencimento: '2026-09-01' }];
      window.loadContasPagar = async () => true; window.sbGet = async () => window.contasPagar;
      window.sbRpcEstoque = async (fn, params = {}) => {
        if (fn === 'caixa_estado') return { ok: true, dados: JSON.parse(JSON.stringify(window.__state)) };
        window.__writes.push({ fn, params: JSON.parse(JSON.stringify(params)) });
        if (window.__fail) return { ok: false, incerto: false, mensagem: 'Falha sintética' };
        return { ok: true, dados: { company_id: ids.empresa, operacao_id: params.p_operacao, status: 'registrado', estado: window.__state } };
      };
    }, { state: estadoSintetico(), ids: { empresa, obrigacao } });
    await page.addScriptTag({ content: fs.readFileSync(modulePath, 'utf8') });
    await page.evaluate(() => { window.renderCaixa = () => caixaProspectivoRender(document.getElementById('caixa-content')); });
    await page.evaluate(() => caixaProspectivoRender(document.getElementById('caixa-content')));
    assert.match(await page.locator('#caixa-content').innerText(), /Banco de teste/);
    if (process.env.EDR_UI_EVIDENCE_DIR) {
      const dir = path.resolve(process.env.EDR_UI_EVIDENCE_DIR); fs.mkdirSync(dir, { recursive: true });
      const panel = await page.locator('#caixa-content').innerHTML();
      const readonly = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EDR — Caixa sintético</title><style>' + projectStyle + '</style></head><body><main style="max-width:1040px;margin:32px auto;padding:0 20px;"><p style="font-size:12px;padding:12px;margin-bottom:16px;background:var(--primary-surface);border-radius:8px;">Prévia local de teste — dados sintéticos, sem conexão com banco. Os botões estão desativados.</p>' + panel.replace(/<button\b/g, '<button disabled').replace(/\s+onclick="[^"]*"/g, '') + '</main></body></html>';
      fs.writeFileSync(path.join(dir, 'caixa-prospectivo-sintetico.html'), readonly, 'utf8');
      await page.screenshot({ path: path.join(dir, 'caixa-prospectivo-desktop.png'), fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: path.join(dir, 'caixa-prospectivo-mobile.png'), fullPage: true });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Painel não deve ter rolagem horizontal no celular');
      await page.setViewportSize({ width: 1280, height: 900 });
    }
    await page.evaluate(conta => caixaProspectivoAbrir('entrada', conta), banco);
    await page.locator('#cp-data').fill('2026-09-16'); await page.locator('#cp-hora').fill('14:05');
    await page.locator('#cp-valor').fill('25'); await page.locator('#cp-descricao').fill('Entrada sintética');
    await page.locator('#cp-salvar').click();
    await page.waitForFunction(() => !document.getElementById('cp-modal'));
    assert.equal((await page.evaluate(() => window.__writes)).length, 1);
    await page.evaluate(conta => caixaProspectivoAbrir('transferencia', conta), banco);
    await page.locator('#cp-data').fill('2026-09-16'); await page.locator('#cp-hora').fill('14:06');
    await page.locator('#cp-destino').selectOption(dinheiro); await page.locator('#cp-valor').fill('10');
    await page.locator('#cp-descricao').fill('Transferência sintética'); await page.locator('#cp-salvar').click();
    await page.waitForFunction(() => !document.getElementById('cp-modal'));
    assert.equal((await page.evaluate(() => window.__writes)).length, 2);
    await page.evaluate(conta => caixaProspectivoAbrir('pagamento', conta), obrigacao);
    await page.locator('#cp-data').fill('2026-09-16'); await page.locator('#cp-hora').fill('14:06');
    await page.locator('#cp-valor').fill('150'); await page.locator('#cp-descricao').fill('Pagamento parcial sintético');
    await page.locator('#cp-salvar').click(); await page.waitForFunction(() => !document.getElementById('cp-modal'));
    const partial = await page.evaluate(() => window.__writes.at(-1).params.p_pedido);
    assert.equal(partial.conta_pagar_id, obrigacao); assert.equal(partial.valor_centavos, 15000);
    await page.evaluate(conta => caixaProspectivoAbrir('entrada', conta), banco);
    await page.locator('#cp-cancelar').click(); assert.equal((await page.evaluate(() => window.__writes)).length, 3);
    await page.evaluate(conta => caixaProspectivoAbrir('entrada', conta), banco);
    await page.locator('#cp-data').fill('2026-09-14'); await page.locator('#cp-hora').fill('');
    await page.locator('#cp-valor').fill('10'); await page.locator('#cp-descricao').fill('Movimento sem horário sintético');
    await page.locator('#cp-salvar').click(); assert.equal((await page.evaluate(() => window.__writes)).length, 3);
    assert.match(await page.locator('#cp-erro').innerText(), /corte/);
    await page.locator('#cp-decisao').selectOption('incluido_abertura'); await page.locator('#cp-salvar').click();
    await page.waitForFunction(() => !document.getElementById('cp-modal'));
    assert.equal((await page.evaluate(() => window.__writes.at(-1).params.p_pedido)).decisao_corte, 'incluido_abertura');
    await page.evaluate(conta => caixaProspectivoAbrir('saida', conta), banco);
    await page.locator('#cp-data').fill('2026-09-16'); await page.locator('#cp-hora').fill('14:07');
    await page.locator('#cp-valor').fill('5'); await page.locator('#cp-descricao').fill('Saída sintética');
    await page.evaluate(() => { window.__fail = true; }); await page.locator('#cp-salvar').click();
    assert.equal(await page.locator('#cp-modal').count(), 1);
    assert.match(await page.locator('#cp-erro').innerText(), /Falha sintética/);
    assert.equal(external, 0, 'O harness não pode acessar recursos externos');
  });
}
