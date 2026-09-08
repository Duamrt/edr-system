
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function ambiente() {
  const gravacoes = [], avisos = [], campos = {};
  const ctx = {
    console: { log() {}, warn() {}, error() {} }, window: {},
    document: { addEventListener() {}, getElementById: id => campos[id] || null, querySelectorAll: () => [] },
    setTimeout() {}, clearTimeout() {}, norm: s => String(s || '').toUpperCase().trim(),
    esc: s => String(s || ''), fmt: n => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
    fmtR: n => String(n), fmtQtd: n => String(n), parseItens: n => JSON.parse(n.itens || '[]'),
    confirmar: async () => true, confirm: () => true, hojeISO: () => '2026-09-06',
    showToast: msg => avisos.push(msg), closeModal() {}, fecharModal() {}, openModal() {},
    custoClassificacaoNovo: () => ({}), COMPANY_DEFAULTS: { estoqueGeral: 'EDR' },
    notas: [], distribuicoes: [], entradasDiretas: [], ajustesEstoque: [], lancamentos: [],
    catalogoMateriais: [{ codigo: '000001', nome: 'MATERIAL', unidade: 'UN', movimenta_estoque: true }],
    obras: [{ id: 'obra', nome: 'OBRA' }],
    sbPost: async (tabela, payload) => {
      const registro = { id: 'id-' + gravacoes.length, ...payload };
      gravacoes.push({ tabela, ...registro });
      return registro;
    },
    sbDelete: async () => 1,
  };
  const fonte = require('./fixtures/custo-nota.cjs').fonte + fs.readFileSync(require.resolve('../js/edr-v2-estoque.js'), 'utf8');
  vm.createContext(ctx);
  vm.runInContext(fonte + '\nrenderEstoque = () => {}; globalThis.api = { consolidarEstoque, confirmarDistribuicaoItem, salvarSaidaMaterial, abrirAjusteEstoque, _alvoAbsolutoAjuste, EstoqueModule };', ctx);
  ctx.api.EstoqueModule.catalogoMateriais = ctx.catalogoMateriais;
  return { ctx, api: ctx.api, gravacoes, avisos, campos };
}
const nf = (id, data, qtd, preco, extra = {}) => ({
  id, obra: 'EDR', natureza: 'VENDA', data, ...extra,
  itens: JSON.stringify([{ codigo: '000001', desc: 'MATERIAL', qtd, preco, total: qtd * preco }]),
});
const dist = (qtd, data, extra = {}) => ({ item_desc: 'MATERIAL', codigo_catalogo: '000001', qtd, data, ...extra });
const contagem = (real, criado_em) => ({ id: 'contagem', item_desc: 'MATERIAL', codigo_catalogo: '000001', tipo: 'contagem', motivo: 'real ' + real, criado_em, qtd: 0 });

test('contagem nao oculta saida registrada depois no mesmo dia', () => {
  const { ctx, api } = ambiente();
  ctx.notas.push(nf('base', '2026-09-01', 10, 10));
  ctx.ajustesEstoque.push(contagem(10, '2026-09-06T12:00:00Z'));
  ctx.distribuicoes.push(dist(3, '2026-09-06', { criado_em: '2026-09-06T18:00:00Z' }));
  assert.equal(api.consolidarEstoque()[0].saldo, 7);
});
test('recebimento depois da contagem no mesmo dia entra no saldo', () => {
  const { ctx, api } = ambiente();
  ctx.ajustesEstoque.push(contagem(0, '2026-09-06T12:00:00Z'));
  ctx.notas.push(nf('nova', '2026-09-06', 5, 10, { criado_em: '2026-09-06T18:00:00Z' }));
  assert.equal(api.consolidarEstoque()[0].saldo, 5);
});
test('entrada retroativa nao soma duas vezes depois da contagem', () => {
  const { ctx, api } = ambiente();
  ctx.ajustesEstoque.push(contagem(10, '2026-09-04T12:00:00Z'));
  ctx.entradasDiretas.push({ id: 'ed', codigo_catalogo: '000001', item_desc: 'MATERIAL', qtd: 4, preco: 10, data: '2026-09-01', criado_em: '2026-09-05T12:00:00Z' });
  assert.equal(api.consolidarEstoque()[0].saldo, 10);
});
test('FIFO independe da ordem em que as NFs foram carregadas', () => {
  const { ctx, api } = ambiente();
  ctx.notas.push(nf('nova', '2026-09-02', 10, 20), nf('antiga', '2026-09-01', 10, 10));
  ctx.distribuicoes.push(dist(10, '2026-09-03'));
  const r = api.consolidarEstoque()[0];
  assert.equal(r.saldo, 10);
  assert.equal(r.lotes.find(l => l.nota_id === 'antiga').qtd_disponivel, 0);
  assert.equal(r.lotes.find(l => l.nota_id === 'nova').qtd_disponivel, 10);
  ctx.notas.reverse();
  assert.equal(api.consolidarEstoque()[0].lotes.find(l => l.nota_id === 'nova').qtd_disponivel, 10);
});
test('contagem zero encerra lotes antigos para a proxima distribuicao', async () => {
  const { ctx, api, gravacoes } = ambiente();
  ctx.notas.push(nf('nova', '2026-09-06', 10, 20), nf('antiga', '2026-09-01', 100, 1));
  ctx.ajustesEstoque.push(contagem(0, '2026-09-04T12:00:00Z'));
  const r = api.consolidarEstoque()[0];
  assert.equal(r.saldo, 10);
  assert.equal(r.lotes.reduce((n, l) => n + l.qtd_disponivel, 0), 10);
  await api.confirmarDistribuicaoItem(r.chave, 'obra', '04_alven', 5, '2026-09-06');
  assert.equal(gravacoes[0].total, 100);
  assert.equal(gravacoes[1].nota_id, 'nova');
});
test('saida que cruza duas NFs nao grava vinculo parcial', async () => {
  const { ctx, api, gravacoes, avisos } = ambiente();
  ctx.notas.push(nf('A', '2026-09-01', 10, 10), nf('B', '2026-09-02', 10, 20));
  const r = api.consolidarEstoque()[0];
  await api.confirmarDistribuicaoItem(r.chave, 'obra', '04_alven', 16, '2026-09-06');
  assert.equal(gravacoes.length, 0);
  assert.ok(avisos.some(a => /origem|lote/i.test(a)));
});
test('saida preserva indice real do item da NF', async () => {
  const { ctx, api, gravacoes } = ambiente();
  const nota = nf('A', '2026-09-01', 10, 10);
  nota.itens = JSON.stringify([{ codigo: '999999', desc: 'OUTRO', qtd: 1, preco: 2 }, ...JSON.parse(nota.itens)]);
  ctx.notas.push(nota);
  const r = api.consolidarEstoque().find(i => i.codigo === '000001');
  await api.confirmarDistribuicaoItem(r.chave, 'obra', '04_alven', 3, '2026-09-06');
  assert.equal(gravacoes[1].item_idx, 1);
  assert.equal(gravacoes[1].nota_id, 'A');
});
test('saida manual tambem registra NF e item de origem', async () => {
  const { ctx, api, gravacoes, campos } = ambiente();
  ctx.notas.push(nf('A', '2026-09-01', 10, 10));
  api.consolidarEstoque();
  for (const [id, value] of Object.entries({ 'saida-desc': 'MATERIAL', 'saida-qtd': '3', 'saida-unidade': 'UN', 'saida-data': '2026-09-06', 'saida-obra': 'obra', 'saida-etapa': '04_alven', 'saida-obs': '' })) campos[id] = { value };
  await api.salvarSaidaMaterial();
  assert.equal(gravacoes[1].nota_id, 'A');
  assert.equal(gravacoes[1].item_idx, 0);
});
test('duplo clique so solicita uma distribuicao', async () => {
  const { ctx, api, gravacoes } = ambiente();
  ctx.notas.push(nf('A', '2026-09-01', 10, 10));
  const r = api.consolidarEstoque()[0];
  await Promise.all([api.confirmarDistribuicaoItem(r.chave, 'obra', '04_alven', 7, '2026-09-06'), api.confirmarDistribuicaoItem(r.chave, 'obra', '04_alven', 7, '2026-09-06')]);
  assert.equal(gravacoes.filter(g => g.tabela === 'distribuicoes').length, 1);
});
test('carga incompleta bloqueia distribuicao antes de gravar', async () => {
  const { ctx, api, gravacoes } = ambiente();
  ctx.notas.push(nf('A', '2026-09-01', 10, 10));
  const r = api.consolidarEstoque()[0];
  ctx.estoqueDadosCompletos = () => false;
  await api.confirmarDistribuicaoItem(r.chave, 'obra', '04_alven', 3, '2026-09-06');
  assert.equal(gravacoes.length, 0);
});
test('contagem rapida preserva tres casas e rejeita negativa', async () => {
  const { ctx, api, gravacoes } = ambiente();
  ctx.notas.push(nf('A', '2026-09-01', 10, 10));
  const r = api.consolidarEstoque()[0];
  let real = '1.234';
  ctx.document.createElement = () => {
    const nodes = {};
    return { remove() {}, set innerHTML(v) {}, querySelector(sel) {
      return nodes[sel] ||= { value: sel === '#_ajuste-qtd-input' ? real : '', focus() {}, addEventListener() {} };
    }};
  };
  ctx.document.body = { appendChild(overlay) { queueMicrotask(() => overlay.querySelector('#_ajuste-ok-btn').onclick()); } };
  await api.abrirAjusteEstoque(r.chave);
  assert.equal(api._alvoAbsolutoAjuste(gravacoes[0]), 1.234);
  real = '-1';
  await api.abrirAjusteEstoque(r.chave);
  assert.equal(gravacoes.length, 1);
});

test('entrada sem NF continua disponivel e nao recebe uma NF inventada', async () => {
  const { ctx, api, gravacoes } = ambiente();
  ctx.entradasDiretas.push({ id: 'ed', codigo_catalogo: '000001', item_desc: 'MATERIAL', qtd: 8, preco: 12, data: '2026-09-01' });
  const r = api.consolidarEstoque()[0];
  assert.equal(r.saldo, 8);
  await api.confirmarDistribuicaoItem(r.chave, 'obra', '04_alven', 3, '2026-09-06');
  assert.equal(gravacoes[0].total, 36);
  assert.equal(gravacoes[1].nota_id, null);
});
test('recarga antes de salvar impede vincular mais do que resta na NF', async () => {
  const { ctx, api, gravacoes } = ambiente();
  ctx.notas.push(nf('A', '2026-09-01', 10, 10));
  const r = api.consolidarEstoque()[0];
  ctx.loadDistribuicoes = async () => { ctx.distribuicoes = [dist(8, '2026-09-05')]; return true; };
  await api.confirmarDistribuicaoItem(r.chave, 'obra', '04_alven', 7, '2026-09-06');
  assert.equal(gravacoes.length, 0);
  assert.equal(api.EstoqueModule._consolidado[0].saldo, 2);
});
test('falha de recarga nao grava e libera nova tentativa', async () => {
  const { ctx, api, gravacoes } = ambiente();
  ctx.notas.push(nf('A', '2026-09-01', 10, 10));
  const r = api.consolidarEstoque()[0];
  ctx.loadNotas = async () => false;
  await api.confirmarDistribuicaoItem(r.chave, 'obra', '04_alven', 2, '2026-09-06');
  assert.equal(gravacoes.length, 0);
  assert.equal(ctx.window._saidaEmAndamento, false);
  ctx.loadNotas = async () => true;
  await api.confirmarDistribuicaoItem(r.chave, 'obra', '04_alven', 2, '2026-09-06');
  assert.equal(gravacoes.length, 2);
});
test('falha da distribuicao mantem a compensacao do custo existente', async () => {
  const { ctx, api } = ambiente();
  const removidos = [];
  ctx.notas.push(nf('A', '2026-09-01', 10, 10));
  const r = api.consolidarEstoque()[0];
  ctx.sbPost = async t => t === 'lancamentos' ? { id: 'custo-temporario' } : null;
  ctx.sbDelete = async (t, id) => { removidos.push({ t, id }); return 1; };
  await api.confirmarDistribuicaoItem(r.chave, 'obra', '04_alven', 2, '2026-09-06');
  assert.deepEqual(removidos, [{ t: 'lancamentos', id: 'custo-temporario' }]);
  assert.equal(ctx.window._saidaEmAndamento, false);
});
test('contagens pequenas em notacao cientifica nao viram uma unidade', () => {
  const { api } = ambiente();
  assert.equal(api._alvoAbsolutoAjuste({ tipo: 'contagem', motivo: 'real 1e-7' }), 0.0000001);
  assert.equal(api._alvoAbsolutoAjuste({ tipo: 'ajuste', motivo: 'Zeragem manual', qtd: 15 }), null);
});
test('contagem parcial e ajuste posterior respeitam disponibilidade fisica', () => {
  const { ctx, api } = ambiente();
  ctx.notas.push(nf('A', '2026-09-01', 10, 10), nf('B', '2026-09-02', 10, 20));
  ctx.ajustesEstoque.push(contagem(5, '2026-09-03T12:00:00Z'));
  ctx.ajustesEstoque.push({ id: 'correcao', tipo: 'correcao', item_desc: 'MATERIAL', codigo_catalogo: '000001', qtd: -2, criado_em: '2026-09-04T12:00:00Z' });
  const r = api.consolidarEstoque()[0];
  assert.equal(r.saldo, 3);
  assert.equal(r.lotes.find(l => l.nota_id === 'A').qtd_disponivel, 0);
  assert.equal(r.lotes.find(l => l.nota_id === 'B').qtd_disponivel, 3);
});
test('movimento retroativo no dia anterior nao muda de dia pelo fuso do navegador', () => {
  const { ctx, api } = ambiente();
  ctx.notas.push(nf('base', '2026-09-01', 10, 10));
  ctx.ajustesEstoque.push(contagem(10, '2026-09-06T02:30:00Z')); // 05/09 23:30 em Brasilia
  ctx.distribuicoes.push(dist(3, '2026-09-05', { criado_em: '2026-09-06T02:45:00Z' }));
  assert.equal(api.consolidarEstoque()[0].saldo, 7);
});
test('compra direta e NF de obra continuam fora do almoxarifado', () => {
  const { ctx, api } = ambiente();
  ctx.notas.push(nf('base', '2026-09-01', 10, 10), nf('direta', '2026-09-02', 4, 20, { obra: 'OBRA' }));
  ctx.distribuicoes.push(dist(4, '2026-09-02', { nota_id: 'direta' }), dist(2, '2026-09-03', { lancamento_id: 'direto' }));
  ctx.lancamentos.push({ id: 'direto', origem: 'compra_direta' });
  const r = api.consolidarEstoque()[0];
  assert.equal(r.saldo, 10);
  assert.equal(r.lotes[0].qtd_disponivel, 10);
});

test('contagem igual ao saldo cria checkpoint no modal e na importacao', async () => {
  const { ctx, api, campos, gravacoes } = ambiente();
  ctx.notas.push(nf('A', '2026-09-01', 10, 10));
  api.consolidarEstoque();
  vm.runInContext('ajusteTipoAtual = "contagem"; globalThis.salvarContagemTeste = salvarAjusteModal; globalThis.ajustePlanilhaTeste = _calcAjusteContagemItem;', ctx);
  for (const [id, value] of Object.entries({ 'ajuste-desc': 'MATERIAL', 'ajuste-qtd': '10', 'ajuste-unidade': 'UN', 'ajuste-motivo': '' })) campos[id] = { value };
  await ctx.salvarContagemTeste();
  assert.equal(gravacoes.length, 1);
  assert.equal(gravacoes[0].qtd, 0);
  assert.equal(api._alvoAbsolutoAjuste(gravacoes[0]), 10);
  assert.equal(ctx.ajustePlanilhaTeste('000001', 'MATERIAL', 'UN', 10, api.EstoqueModule._consolidado).tipo, 'contagem');
});
test('campo vazio nao e interpretado como contagem zero', async () => {
  const { ctx, campos, gravacoes } = ambiente();
  vm.runInContext('ajusteTipoAtual = "contagem"; globalThis.salvarContagemTeste = salvarAjusteModal;', ctx);
  for (const [id, value] of Object.entries({ 'ajuste-desc': 'MATERIAL', 'ajuste-qtd': '', 'ajuste-unidade': 'UN', 'ajuste-motivo': '' })) campos[id] = { value };
  await ctx.salvarContagemTeste();
  assert.equal(gravacoes.length, 0);
});
test('saida captura quantidade no clique e protege o botao durante a recarga', async () => {
  const { ctx, api, campos, gravacoes } = ambiente();
  ctx.notas.push(nf('A', '2026-09-01', 10, 10));
  api.consolidarEstoque();
  for (const [id, value] of Object.entries({ 'saida-desc': 'MATERIAL', 'saida-qtd': '3', 'saida-unidade': 'UN', 'saida-data': '2026-09-06', 'saida-obra': 'obra', 'saida-etapa': '04_alven', 'saida-obs': '' })) campos[id] = { value };
  campos['btn-confirmar-saida'] = { disabled: false, textContent: 'CONFIRMAR SAÍDA', innerHTML: '<span>check</span>CONFIRMAR SAÍDA' };
  ctx.loadNotas = async () => {
    assert.equal(campos['btn-confirmar-saida'].disabled, true);
    campos['saida-qtd'].value = '9';
    return true;
  };
  await api.salvarSaidaMaterial();
  assert.equal(gravacoes[1].qtd, 3);
  assert.equal(campos['btn-confirmar-saida'].disabled, false);
  assert.equal(campos['btn-confirmar-saida'].textContent, 'CONFIRMAR SAÍDA');
  assert.equal(campos['btn-confirmar-saida'].innerHTML, '<span>check</span>CONFIRMAR SAÍDA');
});

test('quantidade nao finita nao grava custo nem distribuicao pelos dois botoes', async () => {
  const { ctx, api, gravacoes, campos } = ambiente();
  ctx.notas.push(nf('A', '2026-09-01', 10, 10));
  const r = api.consolidarEstoque()[0];
  await api.confirmarDistribuicaoItem(r.chave, 'obra', '04_alven', 'Infinity', '2026-09-06');
  for (const [id, value] of Object.entries({ 'saida-desc': 'MATERIAL', 'saida-qtd': 'Infinity', 'saida-unidade': 'UN', 'saida-data': '2026-09-06', 'saida-obra': 'obra', 'saida-etapa': '04_alven', 'saida-obs': '' })) campos[id] = { value };
  await api.salvarSaidaMaterial();
  assert.equal(gravacoes.length, 0);
});

test('quantidade fracionaria pequena conserva a NF de origem', async () => {
  const { ctx, api, gravacoes } = ambiente();
  ctx.notas.push(nf('A', '2026-09-01', 0.0000001, 10));
  const r = api.consolidarEstoque()[0];
  await api.confirmarDistribuicaoItem(r.chave, 'obra', '04_alven', 0.0000001, '2026-09-06');
  assert.equal(gravacoes[1].nota_id, 'A');
});
