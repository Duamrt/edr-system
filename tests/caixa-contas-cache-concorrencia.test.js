'use strict';
// Dois módulos reais, transportes sintéticos e nenhuma rede externa.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const original = { id: 'conta-antiga', company_id: 'empresa-qa', valor: 100,
  fornecedor: 'Fornecedor sintético', status: 'pendente', data_vencimento: '2026-10-28' };
const atualizadas = [original, { ...original, id: 'parcela-1' }, { ...original, id: 'parcela-2' }];
const plain = x => JSON.parse(JSON.stringify(x));

function ambiente() {
  const consultas = [], avisos = [], desenhos = [], modais = [], rpc = [];
  const content = { innerHTML: '' };
  const ctx = {
    console, _companyId: 'empresa-qa', usuarioAtual: { id: 'ator-qa', perfil: 'admin' },
    document: { getElementById: id => id === 'caixa-content' ? content : null,
      body: { insertAdjacentHTML: (...args) => modais.push(args) } },
    sessionStorage: { getItem: () => null }, showToast: x => avisos.push(x),
    sbGet: async tabela => {
      if (tabela === 'projecoes_caixa') return [];
      assert.equal(tabela, 'contas_pagar');
      return new Promise((resolve, reject) => consultas.push({ resolve, reject }));
    },
    sbRpcEstoque: async nome => {
      rpc.push(nome); assert.equal(nome, 'caixa_estado');
      return { ok: true, dados: { company_id: 'empresa-qa', contas: [], movimentos: [],
        pagamentos: [], total_centavos: 0, pagamento_sem_abertura: true } };
    },
    fetch: async () => { throw new Error('Rede proibida neste ensaio'); },
  };
  vm.createContext(ctx);
  for (const arquivo of ['edr-v2-financeiro.js', 'edr-v2-caixa-prospectivo.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', arquivo), 'utf8'), ctx);
  }
  ctx.__desenho = () => desenhos.push({ cache: plain(ctx.cache()), caixa: plain(ctx.caixaProspectivoEstado()) });
  vm.runInContext('globalThis.cache=()=>contasPagar; globalThis.definirCache=x=>{contasPagar=x;}; _cpDesenhar=()=>__desenho();', ctx);
  ctx.definirCache(plain([original]));
  return { ctx, consultas, avisos, desenhos, modais, rpc, content };
}

async function aguardarConsulta(a, quantidade = 1) {
  for (let i = 0; i < 20 && a.consultas.length < quantidade; i++) await Promise.resolve();
  assert.equal(a.consultas.length, quantidade, 'consulta esperada iniciada');
}

test('Caixa: GET anterior ao RPC não sobrescreve a lista nova nem invalida saldo confirmado', async () => {
  for (const falhaAntiga of [false, true]) {
    const a = ambiente();
    const renderAntigo = a.ctx.caixaProspectivoRender(a.content);
    await aguardarConsulta(a);
    const posRpc = a.ctx._loadContasPagar();
    a.consultas[1].resolve(plain(atualizadas)); assert.equal(await posRpc, true);
    if (falhaAntiga) a.consultas[0].reject(new Error('Falha antiga sintética'));
    else a.consultas[0].resolve(plain([original]));
    await renderAntigo;
    assert.deepEqual(plain(a.ctx.cache()), atualizadas);
    assert.ok(a.ctx.caixaProspectivoEstado(), 'consulta ultrapassada não apaga estado vigente');
    assert.equal(a.desenhos.length, 0, 'render ultrapassado aborta');
    assert.deepEqual(a.avisos, []);
  }
});

test('Pagamento: consulta ultrapassada não restaura cache antigo nem abre modal com obrigação antiga', async () => {
  for (const falhaAntiga of [false, true]) {
    const a = ambiente();
    const abrir = a.ctx.caixaProspectivoAbrir('pagamento', original.id);
    await aguardarConsulta(a);
    const posRpc = a.ctx._loadContasPagar();
    a.consultas[1].resolve(plain(atualizadas)); assert.equal(await posRpc, true);
    if (falhaAntiga) a.consultas[0].reject(new Error('Falha antiga sintética'));
    else a.consultas[0].resolve(plain([original]));
    await abrir;
    assert.deepEqual(plain(a.ctx.cache()), atualizadas);
    assert.equal(a.modais.length, 0);
    assert.deepEqual(a.avisos, []);
    assert.ok(a.ctx.caixaProspectivoEstado());
  }
});

test('Caixa e pagamento: falha vigente preserva cache e mantém bloqueio operacional com aviso', async () => {
  const a = ambiente();
  const render = a.ctx.caixaProspectivoRender(a.content);
  await aguardarConsulta(a); a.consultas[0].reject(new Error('Falha vigente sintética')); await render;
  assert.deepEqual(plain(a.ctx.cache()), [original]);
  assert.equal(a.ctx.caixaProspectivoEstado(), null);
  assert.equal(a.desenhos.length, 1);
  assert.match(vm.runInContext('_cpErro', a.ctx), /consultar as obrigações persistidas/);
  const b = ambiente();
  const abrir = b.ctx.caixaProspectivoAbrir('pagamento', original.id);
  await aguardarConsulta(b); b.consultas[0].reject(new Error('Falha vigente sintética')); await abrir;
  assert.deepEqual(plain(b.ctx.cache()), [original]);
  assert.equal(b.modais.length, 0);
  assert.match(b.avisos[0], /consultar a obrigação persistida/);
  assert.ok([...a.rpc, ...b.rpc].every(nome => nome === 'caixa_estado'));
});

test('Caixa e pagamento: troca de sessão durante GET impede cache e interface da sessão anterior', async () => {
  for (const pagamento of [false, true]) {
    const a = ambiente();
    const acao = pagamento ? a.ctx.caixaProspectivoAbrir('pagamento', original.id)
      : a.ctx.caixaProspectivoRender(a.content);
    await aguardarConsulta(a);
    a.ctx._companyId = 'outra-empresa'; a.ctx.usuarioAtual = { id: 'outro-ator', perfil: 'admin' };
    a.ctx.definirCache([]);
    a.consultas[0].resolve(plain(atualizadas)); await acao;
    assert.deepEqual(plain(a.ctx.cache()), []);
    assert.equal(a.modais.length, 0); assert.equal(a.desenhos.length, 0);
    assert.deepEqual(a.avisos, []);
  }
});
