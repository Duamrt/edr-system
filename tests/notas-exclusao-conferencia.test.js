const test = require('node:test');
const assert = require('node:assert/strict');
const { ambiente } = require('./fixtures/fluxo-estoque.cjs');

function preparar(ler) {
  const a = ambiente();
  const consultas = [], exclusoes = [], confirmacoes = [];
  a.ctx.notas = [{ id: 'nf-1', numero_nf: '123/1', fornecedor: 'FORNECEDOR A', valor_bruto: 20 }];
  a.ctx.sbGet = async (tabela, query, options) => {
    consultas.push({ tabela, query, options });
    assert.equal(tabela, 'contas_pagar');
    assert.equal(options?.throwOnError, true, 'falha de consulta não pode virar lista vazia');
    return ler(query, consultas.length);
  };
  a.ctx.confirmar = async mensagem => { confirmacoes.push(mensagem); return true; };
  a.ctx.processarExclusaoNota = async (...args) => { exclusoes.push(args); };
  return { ...a, consultas, exclusoes, confirmacoes };
}

test('falha na consulta por UUID impede confirmação e exclusão', async () => {
  const a = preparar(() => { throw new Error('rede indisponível'); });
  await a.ctx.confirmarExclusaoNota('nf-1');
  assert.equal(a.exclusoes.length, 0);
  assert.equal(a.confirmacoes.length, 0);
  assert.equal(a.ctx.notas.length, 1);
  assert.match(a.avisos[0], /Não foi possível conferir.*Nenhum dado foi excluído/);
});

test('falha na consulta legada também preserva NF sem prosseguir', async () => {
  const a = preparar(query => {
    if (query.includes('nota_id=is.null')) throw new Error('HTTP 503');
    return [];
  });
  await a.ctx.confirmarExclusaoNota('nf-1');
  assert.equal(a.consultas.length, 2);
  assert.equal(a.exclusoes.length, 0);
  assert.equal(a.confirmacoes.length, 0);
});

test('falha ao conferir pendentes não aproveita consulta anterior de pagas', async () => {
  const a = preparar(query => {
    if (query.includes('status=eq.pendente')) throw new Error('HTTP 403');
    return [];
  });
  await a.ctx.confirmarExclusaoNota('nf-1');
  assert.equal(a.consultas.length, 3);
  assert.equal(a.exclusoes.length, 0);
  assert.equal(a.confirmacoes.length, 0);
});

for (const resposta of [null, {}, 'resposta inválida']) {
  test(`resposta financeira ${JSON.stringify(resposta)} bloqueia exclusão`, async () => {
    const a = preparar(() => resposta);
    await a.ctx.confirmarExclusaoNota('nf-1');
    assert.equal(a.exclusoes.length, 0);
    assert.equal(a.confirmacoes.length, 0);
    assert.match(a.avisos[0], /Não foi possível conferir/);
  });
}

test('conta paga vinculada por UUID bloqueia independentemente do nome', async () => {
  const a = preparar(query => query.includes('nota_id=eq.nf-1')
    ? [{ id: 'conta-1', nota_id: 'nf-1', fornecedor: 'NOME ANTIGO' }] : []);
  await a.ctx.confirmarExclusaoNota('nf-1');
  assert.equal(a.exclusoes.length, 0);
  assert.match(a.avisos[0], /PAGA/);
});

test('duas parcelas pendentes vinculadas impedem exclusão e órfãs', async () => {
  const a = preparar(query => query.includes('nota_id=eq.nf-1') && query.includes('status=eq.pendente')
    ? [{ id: 'parcela-1', nota_id: 'nf-1' }, { id: 'parcela-2', nota_id: 'nf-1' }] : []);
  await a.ctx.confirmarExclusaoNota('nf-1');
  assert.equal(a.exclusoes.length, 0);
  assert.match(a.avisos[0], /2 conta\(s\).*pendente/);
});

test('legado de mesmo número e fornecedor bloqueia; outro fornecedor não colide', async () => {
  const a = preparar(query => query.includes('nota_id=is.null')
    ? [{ id: 'legado-1', nota_id: null, fornecedor: ' fornecedor a ' }] : []);
  await a.ctx.confirmarExclusaoNota('nf-1');
  assert.equal(a.exclusoes.length, 0);
  const b = preparar(query => query.includes('nota_id=is.null')
    ? [{ id: 'legado-2', nota_id: null, fornecedor: 'FORNECEDOR B' }] : []);
  await b.ctx.confirmarExclusaoNota('nf-1');
  assert.equal(b.exclusoes.length, 1);
  assert.equal(b.confirmacoes.length, 1);
});

test('consultas completas vazias preservam fluxo de confirmação existente', async () => {
  const a = preparar(() => []);
  await a.ctx.confirmarExclusaoNota('nf-1');
  assert.equal(a.consultas.length, 4);
  assert.equal(a.exclusoes.length, 1);
  assert.equal(a.exclusoes[0][0], 'nf-1');
  assert.equal(a.confirmacoes.length, 1);
});
