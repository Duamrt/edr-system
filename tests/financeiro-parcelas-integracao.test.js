'use strict';
// Código real do Financeiro, DOM e transportes sintéticos; nenhum acesso externo.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const fonte = fs.readFileSync(require.resolve('../js/edr-v2-financeiro.js'), 'utf8');
const index = fs.readFileSync(require.resolve('../index.html'), 'utf8');
const clonar = x => JSON.parse(JSON.stringify(x));
const contaBase = () => ({
  id: 'conta-sintetica', fornecedor: 'FORNECEDOR SINTETICO', descricao: 'NF SINTETICA',
  valor: 1854.17, data_vencimento: '2026-10-28', status: 'pendente',
  nota_id: 'nota-sintetica', nota_ref: 'SINTETICA/1', obra_id: null,
});

function ambiente(contas = [contaBase()]) {
  const campos = new Map();
  function elemento(id) {
    const classes = new Set();
    const el = { id, value: '', innerHTML: '', textContent: '', hidden: false,
      style: {}, children: [], focus() {},
      classList: { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c) },
      appendChild(child) {
        assert.equal(this.children.includes(child), false, 'somente elemento novo');
        this.children.push(child); campos.set(child.id, child);
      },
    };
    if (id) campos.set(id, el);
    return el;
  }
  for (const id of ['conta-obra', 'modal-conta-titulo', 'conta-id', 'conta-fornecedor',
    'conta-descricao', 'conta-valor', 'conta-vencimento', 'conta-nota-ref', 'contas-lista',
    'contas-stats', 'modal-box', 'modal-conta', 'conta-desdobrar', 'conta-parcelas-acao', 'conta-parcelas-aviso']) elemento(id);
  campos.get('conta-desdobrar').textContent = index.match(/<button[^>]*id="conta-desdobrar"[^>]*>([^<]+)<\/button>/)[1];
  const chamadas = { abrir: [], fechar: [], desdobrar: [], patch: [], pagar: [], delete: [], banners: 0 };
  const avisos = [];
  const ctx = {
    console, obras: [], setTimeout: fn => fn(),
    document: {
      getElementById: id => campos.get(id) || null,
      querySelector: sel => sel === '#modal-conta .modal-box' ? campos.get('modal-box') : null,
      createElement: () => elemento(),
    },
    ParcelasConta: {
      temPendente: () => false,
      abrirDesdobramento: c => chamadas.desdobrar.push(clonar(c)),
      renderPendencias: () => chamadas.banners++,
    },
    showToast: m => avisos.push(m),
    openModal: m => { chamadas.abrir.push(m); campos.get('modal-' + m)?.classList.add('active'); },
    fecharModal: m => { chamadas.fechar.push(m); campos.get('modal-' + m)?.classList.remove('active'); },
    caixaProspectivoPodeAlterarConta: async () => true,
    caixaProspectivoVinculada: () => false,
    caixaProspectivoAbrir: async (...args) => chamadas.pagar.push(args),
    caixaProspectivoEstado: () => ({}),
    hojeISO: () => '2026-10-20',
    fmt: v => Number(v).toFixed(2), fmtData: String,
    esc: v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;'),
    confirmar: async () => true,
    sbPatch: async (t, q, p) => { chamadas.patch.push({ t, q, p }); return { id: contas[0].id, ...p }; },
    sbDelete: async (...args) => { chamadas.delete.push(args); return 1; },
    sbPost: async () => { throw new Error('POST não esperado'); },
  };
  vm.createContext(ctx);
  vm.runInContext(fonte + '\nglobalThis.definirContas = x => { contasPagar = x; };', ctx);
  ctx.definirContas(clonar(contas));
  return { ctx, campos, chamadas, avisos };
}

test('conta pendente: botão abre formulário comum com dados originais e sem gravar', async () => {
  const a = ambiente();
  a.ctx.abrirModalConta('conta-sintetica');
  const botao = a.campos.get('conta-desdobrar');
  assert.equal(botao.hidden, false);
  assert.equal(botao.textContent, 'Editar valores e parcelas');
  assert.equal(a.campos.get('conta-parcelas-acao').hidden, false);
  await botao.onclick();
  assert.deepEqual(a.chamadas.desdobrar, [contaBase()]);
  assert.deepEqual(a.chamadas.fechar, ['conta']);
  assert.deepEqual(a.chamadas.patch, []);
  assert.deepEqual(a.chamadas.delete, []);
});

test('reabrir modal reutiliza CTA estático; conta nova não mostra desdobramento', () => {
  const a = ambiente();
  const botao = a.campos.get('conta-desdobrar');
  a.ctx.abrirModalConta('conta-sintetica');
  a.ctx.abrirModalConta('conta-sintetica');
  assert.equal(a.campos.get('conta-desdobrar'), botao);
  assert.equal(a.campos.get('modal-box').children.length, 0);
  a.ctx.abrirModalConta(null);
  assert.equal(a.campos.get('conta-desdobrar').hidden, true);
  assert.equal(a.campos.get('conta-parcelas-acao').hidden, true);
});

for (const campo of ['conta-fornecedor', 'conta-descricao', 'conta-valor', 'conta-vencimento', 'conta-obra', 'conta-nota-ref']) {
  test('rascunho não salvo preservado antes de editar parcelas: ' + campo, async () => {
    const a = ambiente();
    a.ctx.abrirModalConta('conta-sintetica');
    a.campos.get(campo).value = 'ALTERACAO SINTETICA';
    await a.campos.get('conta-desdobrar').onclick();
    assert.equal(a.campos.get(campo).value, 'ALTERACAO SINTETICA');
    assert.equal(a.campos.get('modal-conta').classList.contains('active'), true);
    assert.equal(a.campos.get('conta-parcelas-aviso').hidden, false);
    assert.match(a.campos.get('conta-parcelas-aviso').textContent, /Salve ou cancele/);
    for (const tipo of ['patch', 'delete', 'fechar', 'desdobrar']) assert.deepEqual(a.chamadas[tipo], []);
  });
}

test('voltar ao valor salvo libera CTA e envia somente a conta persistida', async () => {
  const a = ambiente();
  a.ctx.abrirModalConta('conta-sintetica');
  a.campos.get('conta-valor').value = '900';
  await a.campos.get('conta-desdobrar').onclick();
  a.campos.get('conta-valor').value = '1854.17';
  await a.campos.get('conta-desdobrar').onclick();
  assert.deepEqual(a.chamadas.desdobrar, [contaBase()]);
  assert.deepEqual(a.chamadas.patch, []);
});

test('rascunho digitado durante a consulta financeira também é preservado', async () => {
  const a = ambiente();
  a.ctx.abrirModalConta('conta-sintetica');
  let liberar;
  a.ctx.caixaProspectivoPodeAlterarConta = () => new Promise(resolve => { liberar = resolve; });
  const pedido = a.campos.get('conta-desdobrar').onclick();
  a.campos.get('conta-vencimento').value = '2026-12-01';
  liberar(true);
  await pedido;
  assert.equal(a.campos.get('conta-vencimento').value, '2026-12-01');
  assert.equal(a.campos.get('modal-conta').classList.contains('active'), true);
  assert.deepEqual(a.chamadas.desdobrar, []);
  assert.deepEqual(a.chamadas.fechar, []);
});

test('cancelar ou trocar a conta durante a consulta não reabre o editor anterior', async () => {
  const a = ambiente();
  a.ctx.abrirModalConta('conta-sintetica');
  let liberar;
  a.ctx.caixaProspectivoPodeAlterarConta = () => new Promise(resolve => { liberar = resolve; });
  const pedido = a.campos.get('conta-desdobrar').onclick();
  a.ctx.fecharModal('conta');
  a.ctx.abrirModalConta(null);
  a.campos.get('conta-fornecedor').value = 'OUTRO RASCUNHO';
  liberar(true);
  await pedido;
  assert.equal(a.campos.get('conta-fornecedor').value, 'OUTRO RASCUNHO');
  assert.equal(a.campos.get('modal-conta').classList.contains('active'), true);
  assert.deepEqual(a.chamadas.desdobrar, []);
  assert.equal(a.chamadas.fechar.length, 1);
});

for (const alvo of ['empresa', 'usuario']) {
  test('troca de ' + alvo + ' durante a consulta não abre conta da sessão anterior', async () => {
    const a = ambiente();
    a.ctx._companyId = 'empresa-sintetica-a';
    a.ctx.usuarioAtual = { id: 'usuario-sintetico-a' };
    a.ctx.abrirModalConta('conta-sintetica');
    let liberar;
    a.ctx.caixaProspectivoPodeAlterarConta = () => new Promise(resolve => { liberar = resolve; });
    const pedido = a.campos.get('conta-desdobrar').onclick();
    if (alvo === 'empresa') a.ctx._companyId = 'empresa-sintetica-b';
    else a.ctx.usuarioAtual.id = 'usuario-sintetico-b';
    liberar(true);
    await pedido;
    for (const tipo of ['patch', 'delete', 'fechar', 'desdobrar']) assert.deepEqual(a.chamadas[tipo], []);
  });
}

test('confirmação pendente bloqueia editar, salvar, pagar, excluir e novo desdobramento', async () => {
  const a = ambiente();
  a.ctx.abrirModalConta('conta-sintetica');
  a.ctx.ParcelasConta.temPendente = () => true;
  a.chamadas.abrir.length = 0;
  a.ctx.abrirModalConta('conta-sintetica');
  await a.ctx.salvarConta();
  await a.ctx.marcarComoPago('conta-sintetica');
  await a.ctx.excluirConta('conta-sintetica');
  await a.ctx.desdobrarConta('conta-sintetica');
  assert.equal(a.avisos.length, 5);
  assert.deepEqual(a.chamadas.abrir, []);
  for (const tipo of ['patch', 'pagar', 'delete', 'desdobrar']) assert.deepEqual(a.chamadas[tipo], []);
});

for (const extra of [{ status: 'pago' }, { data_pagamento: '2026-10-20' }, { data_recebimento: '2026-10-20' }]) {
  test('conta com pagamento/finalizada preservada: ' + JSON.stringify(extra), async () => {
    const a = ambiente([{ ...contaBase(), ...extra }]);
    a.ctx.abrirModalConta('conta-sintetica');
    await a.ctx.desdobrarConta('conta-sintetica');
    a.campos.get('conta-id').value = 'conta-sintetica';
    await a.ctx.salvarConta();
    assert.deepEqual(a.chamadas.abrir, []);
    assert.deepEqual(a.chamadas.desdobrar, []);
    assert.deepEqual(a.chamadas.patch, []);
  });
}

for (const tipo of ['despesa_operacional_nf', 'reembolso_fornecedor']) {
  test('registro especial preserva edição normal, sem desdobramento: ' + tipo, async () => {
    const a = ambiente([{ ...contaBase(), tipo }]);
    a.ctx.abrirModalConta('conta-sintetica');
    assert.equal(a.campos.get('conta-desdobrar').hidden, true);
    await a.ctx.desdobrarConta('conta-sintetica');
    assert.deepEqual(a.chamadas.desdobrar, []);
  });
}

test('falha da consulta ou vínculo de caixa impede desdobramento', async () => {
  const a = ambiente();
  a.ctx.caixaProspectivoPodeAlterarConta = async () => false;
  await a.ctx.desdobrarConta('conta-sintetica');
  a.ctx.caixaProspectivoPodeAlterarConta = async () => true;
  a.ctx.caixaProspectivoVinculada = () => true;
  await a.ctx.desdobrarConta('conta-sintetica');
  delete a.ctx.caixaProspectivoPodeAlterarConta;
  await a.ctx.desdobrarConta('conta-sintetica');
  assert.deepEqual(a.chamadas.desdobrar, []);
  assert.deepEqual(a.chamadas.fechar, []);
});

test('histórico de parcelamento aparece e não pode ser perdido por PATCH/DELETE legado', async () => {
  const a = ambiente([{ ...contaBase(), parcelamento: [{ operacao_id: 'sintetica' }] }]);
  await a.ctx.abrirModalConta('conta-sintetica');
  assert.equal(a.chamadas.desdobrar.length, 1);
  assert.deepEqual(a.chamadas.abrir, []);
  a.campos.get('conta-id').value = 'conta-sintetica';
  await a.ctx.salvarConta();
  await a.ctx.excluirConta('conta-sintetica');
  a.ctx.renderContasPagar();
  assert.match(a.campos.get('contas-lista').innerHTML, /Parcelamento registrado/);
  assert.deepEqual(a.chamadas.patch, []);
  assert.deepEqual(a.chamadas.delete, []);
});

test('repetições pendentes continuam visíveis com lista vazia ou consulta de caixa indisponível', () => {
  const a = ambiente([]);
  a.ctx.renderContasPagar();
  a.ctx.caixaProspectivoEstado = () => null;
  a.ctx.renderContasPagar();
  assert.equal(a.chamadas.banners, 2);
});

test('regressão: conta simples pendente ainda edita valor e vencimento normalmente', async () => {
  const a = ambiente();
  a.ctx.abrirModalConta('conta-sintetica');
  a.campos.get('conta-valor').value = '100.01';
  a.campos.get('conta-vencimento').value = '2026-11-30';
  await a.ctx.salvarConta();
  assert.equal(a.chamadas.patch.length, 1);
  assert.equal(a.chamadas.patch[0].p.valor, 100.01);
  assert.equal(a.chamadas.patch[0].p.data_vencimento, '2026-11-30');
  assert.equal(a.chamadas.patch[0].p.nota_ref, 'SINTETICA/1');
  assert.equal(a.chamadas.patch[0].p.parcelamento, undefined);
});
