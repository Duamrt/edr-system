'use strict';
// Código real do Financeiro, DOM e transportes sintéticos; nenhum acesso externo.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const fonte = fs.readFileSync(require.resolve('../js/edr-v2-financeiro.js'), 'utf8');
const clonar = x => JSON.parse(JSON.stringify(x));
const contaBase = () => ({
  id: 'conta-sintetica', fornecedor: 'FORNECEDOR SINTETICO', descricao: 'NF SINTETICA',
  valor: 1854.17, data_vencimento: '2026-10-28', status: 'pendente',
  nota_id: 'nota-sintetica', nota_ref: 'SINTETICA/1', obra_id: null,
});

function ambiente(contas = [contaBase()]) {
  const campos = new Map();
  function elemento(id) {
    const el = { id, value: '', innerHTML: '', textContent: '', hidden: false,
      style: {}, children: [], focus() {},
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
    'contas-stats', 'modal-box']) elemento(id);
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
    openModal: m => chamadas.abrir.push(m),
    fecharModal: m => chamadas.fechar.push(m),
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
  assert.equal(botao.textContent, 'Desdobrar em parcelas');
  await botao.onclick();
  assert.deepEqual(a.chamadas.desdobrar, [contaBase()]);
  assert.deepEqual(a.chamadas.fechar, ['conta']);
  assert.deepEqual(a.chamadas.patch, []);
  assert.deepEqual(a.chamadas.delete, []);
});

test('reabrir modal reutiliza botão; conta nova não mostra desdobramento', () => {
  const a = ambiente();
  a.ctx.abrirModalConta('conta-sintetica');
  a.ctx.abrirModalConta('conta-sintetica');
  assert.equal(a.campos.get('modal-box').children.length, 1);
  a.ctx.abrirModalConta(null);
  assert.equal(a.campos.get('conta-desdobrar').hidden, true);
});

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
