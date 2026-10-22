'use strict';
// Financeiro real com servidor e DOM sintéticos. Sem consultas ou escritas externas.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../js/edr-v2-financeiro.js'), 'utf8');
const clone = x => JSON.parse(JSON.stringify(x));
const registros = () => [
  { id: 'dantas-sintetica', company_id: 'empresa-a', fornecedor: 'DANTAS SINTETICO', valor: 100, data_vencimento: '2026-12-01', status: 'pendente' },
  { id: 'darf-sintetica', company_id: 'empresa-a', fornecedor: 'DARF SINTETICO', valor: 200, data_vencimento: '2026-10-10', data_pagamento: '2026-10-09', status: 'pago' },
  { id: 'parcela-1', company_id: 'empresa-a', fornecedor: 'PARCELA SINTETICA', valor: 927.08, data_vencimento: '2026-10-28', status: 'pendente' },
  { id: 'parcela-2', company_id: 'empresa-a', fornecedor: 'PARCELA SINTETICA', valor: 927.09, data_vencimento: '2026-11-04', status: 'pendente' },
];
function deferred() {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
}
function ambiente() {
  const campos = new Map(['contas-stats', 'contas-lista', 'caixa-content'].map(id => [id, { innerHTML: '' }]));
  const rotas = {}, chamadas = [], servidor = { contas: registros() };
  const ctx = {
    console, _companyId: 'empresa-a', usuarioAtual: { id: 'usuario-a' }, obras: [],
    document: { getElementById: id => campos.get(id) || null },
    viewRegistry: { register: (nome, render) => { rotas[nome] = render; } },
    sbGet: async (tabela, query, options) => {
      chamadas.push({ tabela, query, options });
      return tabela === 'contas_pagar' ? clone(servidor.contas) : [];
    },
    hojeISO: () => '2026-10-22', fmt: n => Number(n).toFixed(2), fmtData: String,
    esc: s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;'),
    caixaProspectivoCarregar: async () => ({}), caixaProspectivoEstado: () => ({}),
    caixaProspectivoRender: el => { el.innerHTML = 'Caixa consultado'; },
  };
  vm.createContext(ctx);
  vm.runInContext(source + `
    globalThis.qa = {
      seed: rows => { contasPagar = rows; },
      rows: () => contasPagar,
      filtros: (status, mes) => { _contasFiltro = status; _contasMes = mes; },
      estado: () => ({ erro: _contasErroLeitura, status: _contasFiltro, mes: _contasMes })
    };
  `, ctx);
  return { ctx, rotas, chamadas, servidor, campos, rows: () => clone(ctx.qa.rows()) };
}

test('abrir Contas com apenas retorno das parcelas carrega também contas antigas pendentes e pagas', async () => {
  const a = ambiente();
  a.ctx.qa.seed(registros().slice(2));
  await a.rotas['contas-pagar']();
  assert.equal(a.chamadas.length, 1);
  assert.equal(a.chamadas[0].options.throwOnError, true);
  assert.equal(a.rows().length, 4);
  assert.match(a.campos.get('contas-stats').innerHTML, /Todas \(4\)/);
  assert.match(a.campos.get('contas-stats').innerHTML, /Pagas \(1\)/);
  assert.match(a.campos.get('contas-lista').innerHTML, /DANTAS SINTETICO/);
  assert.match(a.campos.get('contas-lista').innerHTML, /DARF SINTETICO/);
});

test('cada retorno à view reconcilia o snapshot completo mesmo com cache preenchido', async () => {
  const a = ambiente();
  await a.rotas['contas-pagar']();
  a.servidor.contas.push({ ...registros()[0], id: 'nova-sintetica' });
  await a.rotas['contas-pagar']();
  assert.equal(a.rows().length, 5);
  assert.equal(a.chamadas.length, 2);
  assert.match(a.campos.get('contas-stats').innerHTML, /Todas \(5\)/);
});

test('entrar em Caixa também reconcilia cache parcial antes de renderizar', async () => {
  const a = ambiente();
  a.ctx.qa.seed(registros().slice(2));
  await a.rotas.caixa();
  assert.equal(a.rows().length, 4);
  assert.deepEqual(a.chamadas.map(x => x.tabela), ['contas_pagar', 'projecoes_caixa']);
  assert.equal(a.campos.get('caixa-content').innerHTML, 'Caixa consultado');
});

test('atualização preserva filtros de status/mês sem filtrar o cache canônico', async () => {
  const a = ambiente();
  a.ctx.qa.seed(registros().slice(2));
  a.ctx.qa.filtros('pendente', '2026-11');
  await a.rotas['contas-pagar']();
  assert.equal(a.rows().length, 4);
  assert.deepEqual(clone(a.ctx.qa.estado()), { erro: '', status: 'pendente', mes: '2026-11' });
  assert.match(a.campos.get('contas-lista').innerHTML, /2026-11-04/);
  assert.doesNotMatch(a.campos.get('contas-lista').innerHTML, /DANTAS SINTETICO|DARF SINTETICO|2026-10-28/);
});

test('resposta vazia válida limpa cache e mostra lista vazia sem alerta de falha', async () => {
  const a = ambiente();
  a.ctx.qa.seed(registros());
  a.servidor.contas = [];
  await a.rotas['contas-pagar']();
  assert.deepEqual(a.rows(), []);
  assert.match(a.campos.get('contas-lista').innerHTML, /Nenhuma conta cadastrada/);
  assert.doesNotMatch(a.campos.get('contas-stats').innerHTML, /role="alert"/);
});

test('falha não apaga cache nem mostra total parcial como completo; recuperação atualiza lista', async () => {
  const a = ambiente();
  const transporte = a.ctx.sbGet;
  a.ctx.qa.seed(registros().slice(2));
  a.ctx.sbGet = async () => { throw new Error('Falha sintética'); };
  assert.equal(await a.ctx._loadContasPagar(), false);
  a.ctx.renderContasPagar();
  assert.deepEqual(a.rows(), registros().slice(2));
  assert.match(a.campos.get('contas-stats').innerHTML, /role="alert"/);
  assert.match(a.campos.get('contas-stats').innerHTML, /lista completa/);
  assert.doesNotMatch(a.campos.get('contas-stats').innerHTML, /Todas \(2\)/);
  assert.equal(a.campos.get('contas-lista').innerHTML, '');
  await a.ctx.renderCaixa();
  assert.match(a.campos.get('caixa-content').innerHTML, /role="alert"/);
  a.ctx.sbGet = transporte;
  assert.equal(await a.ctx._loadContasPagar(), true);
  a.ctx.renderContasPagar();
  assert.equal(a.rows().length, 4);
  assert.doesNotMatch(a.campos.get('contas-stats').innerHTML, /role="alert"/);
});

test('resposta malformada não é aceita como lista vazia', async () => {
  const a = ambiente();
  a.ctx.qa.seed(registros());
  a.ctx.sbGet = async () => ({ erro: 'sintetico' });
  assert.equal(await a.ctx._loadContasPagar(), false);
  assert.deepEqual(a.rows(), registros());
  assert.match(a.ctx.qa.estado().erro, /lista completa/);
});

for (const falhaAntiga of [false, true]) {
  test('GET antigo não sobrescreve consulta mais recente: ' + (falhaAntiga ? 'rejeição atrasada' : 'sucesso atrasado'), async () => {
    const a = ambiente(), antigo = deferred(), novo = deferred();
    let n = 0;
    a.ctx.sbGet = () => ++n === 1 ? antigo.promise : novo.promise;
    const p1 = a.ctx._loadContasPagar(), p2 = a.ctx._loadContasPagar();
    novo.resolve(registros());
    assert.equal(await p2, true);
    if (falhaAntiga) antigo.reject(new Error('Erro atrasado')); else antigo.resolve(registros().slice(2));
    assert.equal(await p1, null);
    assert.deepEqual(a.rows(), registros());
    assert.equal(a.ctx.qa.estado().erro, '');
  });
}

for (const troca of ['empresa', 'usuario']) {
  test('resposta de sessão anterior ignorada após troca de ' + troca, async () => {
    const a = ambiente(), d = deferred();
    a.ctx.qa.seed([{ id: 'cache-atual' }]);
    a.ctx.sbGet = () => d.promise;
    const p = a.ctx._loadContasPagar();
    if (troca === 'empresa') a.ctx._companyId = 'empresa-b';
    else a.ctx.usuarioAtual.id = 'usuario-b'; // Mesmo objeto, como no auth real.
    d.resolve(registros());
    assert.equal(await p, null);
    assert.deepEqual(a.rows(), [{ id: 'cache-atual' }]);
    assert.equal(a.ctx.qa.estado().erro, '');
  });
}

test('callback obsoleto para sem consultar Caixa, mesmo com erro anterior no loader', async () => {
  const a = ambiente(), d = deferred();
  a.ctx.sbGet = async () => { throw Error('Falha inicial'); };
  assert.equal(await a.ctx._loadContasPagar(), false);
  let caixa = 0;
  a.ctx.caixaProspectivoCarregar = async () => { caixa++; };
  a.ctx.sbGet = () => d.promise;
  const navegar = a.rotas['contas-pagar']();
  a.ctx.usuarioAtual.id = 'outro-usuario';
  d.resolve(registros());
  await navegar;
  assert.equal(caixa, 0);
  assert.equal(a.campos.get('contas-stats').innerHTML, '');
});

test('troca de sessão durante leitura do Caixa não renderiza dados anteriores', async () => {
  const a = ambiente(), d = deferred(), iniciou = deferred();
  a.ctx.caixaProspectivoCarregar = () => { iniciou.resolve(); return d.promise; };
  const navegar = a.rotas['contas-pagar']();
  await iniciou.promise;
  a.ctx.usuarioAtual.id = 'outro-usuario';
  d.resolve({});
  await navegar;
  assert.equal(a.campos.get('contas-stats').innerHTML, '');
  assert.equal(a.campos.get('contas-lista').innerHTML, '');
});

for (const [render, campo] of [['renderContasPagar', 'contas-stats'], ['renderCaixa', 'caixa-content']]) {
  test('botão de recuperação ignora resposta de sessão anterior: ' + render, async () => {
    const a = ambiente(), d = deferred();
    a.ctx.sbGet = async () => { throw Error('Falha inicial'); };
    await a.ctx._loadContasPagar();
    await a.ctx[render]();
    const onclick = /onclick="([^"]+)"/.exec(a.campos.get(campo).innerHTML)[1];
    let renders = 0;
    a.ctx[render] = () => { renders++; };
    a.ctx.sbGet = () => d.promise;
    const retry = vm.runInContext(onclick, a.ctx);
    a.ctx.usuarioAtual.id = 'outro-usuario';
    d.resolve(registros());
    await retry;
    assert.equal(renders, 0);
  });
}
