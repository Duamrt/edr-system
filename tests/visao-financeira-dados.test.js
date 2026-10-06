'use strict';
// Dados sinteticos e dependencias injetadas. Sem rede, banco, DOM ou escrita.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { criar } = require('../js/edr-v2-visao-financeira-dados.js');

const EMPRESA = 'empresa-sintetica-A';
const ATOR = 'ator-sintetico-A';
const TABELAS = ['obras', 'lancamentos', 'repasses_cef', 'obra_adicionais', 'adicional_pagamentos',
  'contas_pagar', 'notas_fiscais', 'diarias_quinzenas', 'diarias', 'diarias_extras'];
const NOMES = ['obras', 'lancamentos', 'repasses', 'adicionais', 'pagamentosAdicionais',
  'contasPagar', 'notas', 'quinzenas', 'diarias', 'extras'];
const row = (id, campos = {}) => ({ id, company_id: EMPRESA, ...campos });
const ledger = campos => ({ company_id: EMPRESA, contas: [], movimentos: [], pagamentos: [], total_centavos: 0, ...campos });
const adapter = () => ({ calcGerencialPorObra: () => ({ margem: 17 }), calcGerencialConsolidado: () => ({ resultado: 11 }) });
const comAbertura = () => ledger({
  contas: ['banco', 'dinheiro'].map((codigo, i) => ({ id: 'conta-' + codigo, codigo, nome: 'Conta sintetica ' + codigo,
    abertura_centavos: i ? 200 : 800, saldo_centavos: i ? 200 : 800,
    corte_em: '2026-09-01T12:00:00Z', fuso: 'America/Sao_Paulo' })),
  total_centavos: 1000
});
const transferencia = () => ({ id: 'mov-1', operacao_id: 'op-1', tipo: 'transferencia',
  conta_id: 'conta-banco', destino_id: 'conta-dinheiro', valor_centavos: 50,
  data_efetiva: '2026-09-02', hora_efetiva: null, decisao_corte: 'apos_corte', afeta_saldo: true,
  descricao: 'Transferencia sintetica', conta_pagar_id: null, cancelado_em: null });

function ambiente(overrides = {}) {
  let ator = { company_id: EMPRESA, ator_id: ATOR, perfil: 'admin' };
  const consultas = [], contextos = [], fontes = overrides.fontes || {};
  const deps = {
    obterIdentidade: () => ator,
    obterPagina: async (t, q) => {
      consultas.push({ t, q });
      const rows = fontes[t] || [];
      if (!Array.isArray(rows)) return rows;
      const off = Number(new URLSearchParams(q.slice(1)).get('offset'));
      // Preserva o teste negativo de servidor que viola limit na primeira pagina.
      if (!off && rows.length > 1000) return rows;
      return rows.slice(off, off + 1000);
    },
    carregarLedger: async () => ledger(),
    criarDre: async s => { contextos.push(s); return adapter(); },
    ...overrides
  };
  return { loader: criar(deps), consultas, contextos, deps, trocar: v => { ator = v; } };
}

test('API exige apenas dependencias explicitas e publica CommonJS/global sem efeitos', () => {
  assert.throws(() => criar({}), TypeError);
  const src = fs.readFileSync(require.resolve('../js/edr-v2-visao-financeira-dados.js'), 'utf8');
  const proibido = () => { throw new Error('Efeito externo proibido.'); };
  const ctx = { fetch: proibido, sbPost: proibido, sbPatch: proibido, sbDelete: proibido,
    sbRpc: proibido, initDiarias: proibido, localStorage: { setItem: proibido }, document: {} };
  vm.runInNewContext(src, ctx);
  assert.equal(typeof ctx.FinanceiroVisaoDados.criar, 'function');
  assert.equal(Object.isFrozen(ctx.FinanceiroVisaoDados), true);
});

test('admin autorizado com todas as fontes vazias confirma vazio e abertura ausente', async () => {
  const a = ambiente();
  const s = await a.loader.carregar();
  assert.equal(s.status, 'confirmada');
  assert.equal(s.companyId, EMPRESA);
  assert.equal(s.company_id, EMPRESA);
  assert.equal(s.dre.status, 'confirmada');
  assert.equal(a.contextos.length, 1);
  for (const nome of NOMES) {
    assert.deepEqual(s[nome], []);
    assert.deepEqual(s.fontes[nome], { status: 'confirmada', quantidade: 0, codigo: null });
  }
  assert.deepEqual(s.ledger.estado.contas, []);
  assert.equal(s.ledger.status, 'confirmada');
  assert.equal(s.coberturaFolha.comprovaPagamento, false);
  assert.equal(s.coberturaFolha.tipo, 'registros_de_competencia');
  assert.equal(s.coberturaFolha.coberturaOperacional, 'nao_verificada');
  assert.equal(s.dominios.folha.escopo, 'consulta_registros');
  assert.equal(a.consultas.length, TABELAS.length);
  for (const { q } of a.consultas) {
    const params = new URLSearchParams(q.slice(1));
    assert.equal(params.get('limit'), '1000');
    assert.equal(params.get('offset'), '0');
    assert.match(params.get('order'), /(^|,)id$/);
    assert.match(params.get('select'), /(^|,)company_id(,|$)/);
    assert.equal(params.has('company_id'), false, 'tenant e aplicado pelo helper autenticado injetado');
  }
  const notaQuery = a.consultas.find(c => c.t === 'notas_fiscais').q;
  assert.equal(new URLSearchParams(notaQuery.slice(1)).get('select'), 'id,company_id,obra');
  assert.match(new URLSearchParams(a.consultas.find(c => c.t === 'lancamentos').q.slice(1)).get('select'), /(^|,)obs(,|$)/);
});

for (const perfil of ['mestre', 'operacional', null]) {
  test('perfil ' + perfil + ' nao consulta dados financeiros sensiveis nem fabrica zeros', async () => {
    let chamadas = 0;
    const a = ambiente({ obterIdentidade: () => ({ company_id: EMPRESA, ator_id: ATOR, perfil }),
      obterPagina: () => { chamadas++; }, carregarLedger: () => { chamadas++; }, criarDre: () => { chamadas++; } });
    const s = await a.loader.carregar();
    assert.equal(chamadas, 0);
    assert.equal(s.status, 'indisponivel');
    for (const nome of NOMES) { assert.equal(s[nome], null); assert.equal(s.fontes[nome].codigo, 'IDENTIDADE_NAO_AUTORIZADA'); }
  });
}

test('identidade sem empresa ou ator nao dispara leitura', async () => {
  for (const ident of [null, { ator_id: ATOR, perfil: 'admin' }, { company_id: EMPRESA, perfil: 'admin' }]) {
    let chamadas = 0;
    const a = ambiente({ obterIdentidade: () => ident, obterPagina: () => { chamadas++; } });
    assert.equal((await a.loader.carregar()).status, 'indisponivel');
    assert.equal(chamadas, 0);
  }
});

test('aceita aliases de identidade e copia IDs internos sem depender de globais', async () => {
  const internas = ['obra-interna-sintetica'];
  const a = ambiente({ obterIdentidade: () => ({ companyId: EMPRESA, atorId: ATOR, perfil: 'admin' }), obrasInternas: internas });
  internas.push('alterada-depois');
  const s = await a.loader.carregar();
  assert.deepEqual(s.obrasInternas, ['obra-interna-sintetica']);
  assert.deepEqual(s.OBRAS_INTERNAS, s.obrasInternas);
  assert.throws(() => criar({ ...a.deps, obrasInternas: [null] }), TypeError);
});

test('paginacao percorre 1000 mais dois registros com offset e IDs estaveis', async () => {
  const calls = [];
  const a = ambiente({ obterPagina: async (t, q) => {
    if (t !== 'repasses_cef') return [];
    const off = Number(new URLSearchParams(q.slice(1)).get('offset'));
    calls.push(off);
    return Array.from({ length: off === 0 ? 1000 : off === 1000 ? 2 : 0 }, (_, i) => row('rep-' + (off + i), { valor: 1 }));
  } });
  const s = await a.loader.carregar();
  assert.deepEqual(calls, [0, 1000, 1002]);
  assert.equal(s.repasses.length, 1002);
  assert.equal(s.fontes.repasses.quantidade, 1002);
});

for (const cap of [100, 500]) {
  test('servidor com teto ' + cap + ' percorre todas as linhas e confirma somente depois de pagina vazia', async () => {
    const rows = Array.from({ length: 1103 }, (_, i) => row('rep-' + i, { valor: 1 }));
    const offsets = [], tamanhos = [];
    const a = ambiente({ obterPagina: async (t, q) => {
      if (t !== 'repasses_cef') return [];
      const off = Number(new URLSearchParams(q.slice(1)).get('offset'));
      const batch = rows.slice(off, off + cap);
      offsets.push(off); tamanhos.push(batch.length);
      return batch;
    } });
    const s = await a.loader.carregar();
    assert.equal(s.repasses.length, rows.length);
    assert.equal(s.fontes.repasses.status, 'confirmada');
    assert.equal(s.fontes.repasses.quantidade, rows.length);
    assert.equal(offsets.at(-1), rows.length);
    assert.equal(tamanhos.at(-1), 0);
    for (let i = 1; i < offsets.length; i++) assert.equal(offsets[i], offsets[i - 1] + tamanhos[i - 1]);
    assert.equal(new Set(s.repasses.map(r => r.id)).size, rows.length);
  });
}

test('falha na segunda pagina descarta a fonte inteira em vez de confirmar parcial', async () => {
  const a = ambiente({ obterPagina: async (t, q) => {
    if (t !== 'repasses_cef') return [];
    if (new URLSearchParams(q.slice(1)).get('offset') !== '0') throw new Error('erro privado simulado');
    return Array.from({ length: 1000 }, (_, i) => row('rep-' + i));
  } });
  const s = await a.loader.carregar();
  assert.equal(s.repasses, null);
  assert.equal(s.fontes.repasses.codigo, 'LEITURA_FALHOU');
  assert.equal(s.dominios.recebiveis.status, 'parcial');
  assert.equal(s.dre.status, 'indisponivel');
  assert.equal(a.contextos.length, 0);
  assert.equal(s.dominios.caixa.status, 'confirmada');
});

for (const [nome, resposta, codigo] of [
  ['objeto em vez de array', {}, 'RESPOSTA_INVALIDA'],
  ['pagina acima do limite', Array.from({ length: 1001 }, (_, i) => row('r-' + i)), 'RESPOSTA_INVALIDA'],
  ['registro invalido', [null], 'REGISTROS_INVALIDOS'],
  ['registro sem ID', [{ company_id: EMPRESA }], 'REGISTROS_INVALIDOS'],
  ['registro sem tenant', [{ id: 'r' }], 'REGISTROS_INVALIDOS'],
  ['registro de outra empresa', [row('r', { company_id: 'empresa-sintetica-B' })], 'REGISTROS_INVALIDOS'],
  ['IDs duplicados', [row('r'), row('r')], 'REGISTROS_INVALIDOS']
]) {
  test('rejeita ' + nome + ' sem apresentar zero confirmado', async () => {
    const a = ambiente({ fontes: { contas_pagar: resposta } });
    const s = await a.loader.carregar();
    assert.equal(s.contasPagar, null);
    assert.equal(s.fontes.contasPagar.codigo, codigo);
    assert.equal(s.dominios.obrigacoes.status, 'parcial');
    assert.equal(s.dominios.recebiveis.status, 'confirmada');
    assert.equal(s.dre.status, 'indisponivel');
  });
}

test('IDs repetidos entre paginas detectam recorte inconsistente', async () => {
  const a = ambiente({ obterPagina: async (t, q) => t !== 'obras' ? [] :
    new URLSearchParams(q.slice(1)).get('offset') === '0'
      ? Array.from({ length: 1000 }, (_, i) => row('obra-' + i)) : [row('obra-0')] });
  const s = await a.loader.carregar();
  assert.equal(s.obras, null);
  assert.equal(s.fontes.obras.codigo, 'REGISTROS_INVALIDOS');
});

test('cem paginas cheias atingem teto e nao se tornam carga completa', async () => {
  let paginas = 0;
  const a = ambiente({ obterPagina: async (t, q) => {
    if (t !== 'diarias_extras') return [];
    const off = Number(new URLSearchParams(q.slice(1)).get('offset'));
    paginas++;
    return Array.from({ length: 1000 }, (_, i) => row('extra-' + (off + i)));
  } });
  const s = await a.loader.carregar();
  assert.equal(paginas, 100);
  assert.equal(s.extras, null);
  assert.equal(s.fontes.extras.codigo, 'LIMITE_PAGINACAO');
  assert.equal(s.dominios.folha.status, 'parcial');
  assert.equal(s.dominios.recebiveis.status, 'confirmada');
});

for (const campo of ['company_id', 'ator_id', 'perfil']) {
  test('troca de ' + campo + ' durante consulta rejeita carga obsoleta', async () => {
    let liberar;
    const espera = new Promise(resolve => { liberar = resolve; });
    const a = ambiente({ obterPagina: async t => { if (t === 'obras') await espera; return []; } });
    const pedido = a.loader.carregar();
    const obsoleta = assert.rejects(pedido, e => e.code === 'LEITURA_OBSOLETA');
    a.trocar({ company_id: EMPRESA, ator_id: ATOR, perfil: 'admin', [campo]: campo === 'perfil' ? 'mestre' : 'outro-valor' });
    liberar();
    await obsoleta;
    assert.equal(a.contextos.length, 0);
  });
}

test('nova carga invalida leitura anterior ainda pendente', async () => {
  let liberar, primeiro = true;
  const espera = new Promise(resolve => { liberar = resolve; });
  const a = ambiente({ obterPagina: async t => { if (t === 'obras' && primeiro) { primeiro = false; await espera; } return []; } });
  const anterior = a.loader.carregar();
  const obsoleta = assert.rejects(anterior, e => e.code === 'LEITURA_OBSOLETA');
  const atual = await a.loader.carregar();
  liberar();
  await obsoleta;
  assert.equal(atual.status, 'confirmada');
  assert.equal(a.contextos.length, 1);
});

test('ledger falho nao derruba recebiveis e DRE confirmados', async () => {
  const a = ambiente({ carregarLedger: async () => { throw new Error('falha privada do caixa'); } });
  const s = await a.loader.carregar();
  assert.equal(s.ledger.estado, null);
  assert.equal(s.dominios.caixa.status, 'indisponivel');
  assert.equal(s.dominios.obrigacoes.status, 'parcial');
  assert.equal(s.dominios.recebiveis.status, 'confirmada');
  assert.equal(s.dominios.dre.status, 'confirmada');
  assert.equal(s.status, 'parcial');
  assert.equal(JSON.stringify(s).includes('falha privada'), false);
});

test('ledger preserva pagamento parcial, nao modifica obrigacao nem soma custos', async () => {
  const cp = row('conta-1', { valor: 400, status: 'pendente' });
  const pago = { conta_pagar_id: cp.id, pago_centavos: 15000, restante_centavos: 25000 };
  const a = ambiente({ fontes: { contas_pagar: [cp] }, carregarLedger: async () => ledger({ pagamentos: [pago] }) });
  const s = await a.loader.carregar();
  assert.equal(s.contasPagar[0].valor, 400);
  assert.deepEqual(s.ledger.estado.pagamentos[0], pago);
  assert.deepEqual(s.lancamentos, []);
  assert.equal(cp.valor, 400);
});

test('ledger completo com transferencia vinculada preserva total e movimentos sem recalcular pelo periodo', async () => {
  const e = comAbertura();
  e.contas[0].saldo_centavos -= 50;
  e.contas[1].saldo_centavos += 50;
  e.movimentos.push(transferencia());
  e.pagamentos.push({ conta_pagar_id: 'obrigacao-sintetica', pago_centavos: 15000, restante_centavos: 25000 });
  const s = await ambiente({ carregarLedger: async () => ({ status: 'confirmada', estado: e }) }).loader.carregar();
  assert.equal(s.ledger.status, 'confirmada');
  assert.equal(s.ledger.estado.total_centavos, 1000);
  assert.equal(s.ledger.estado.contas[0].saldo_centavos, 750);
  assert.equal(s.ledger.estado.contas[1].saldo_centavos, 250);
  assert.equal(s.ledger.estado.movimentos[0].afeta_saldo, true);
  assert.equal(e.contas[0].saldo_centavos, 750);
});

test('ledger conserva cancelamento auditado sem transforma-lo em movimento efetivo', async () => {
  const e = comAbertura();
  e.movimentos.push({ ...transferencia(), afeta_saldo: false, cancelado_em: '2026-09-03T12:00:00Z' });
  const s = await ambiente({ carregarLedger: async () => e }).loader.carregar();
  assert.equal(s.ledger.status, 'confirmada');
  assert.equal(s.ledger.estado.movimentos[0].afeta_saldo, false);
});

for (const [nome, alterar] of [
  ['soma divergente', e => { e.total_centavos = 0; }],
  ['uma conta', e => { e.contas.pop(); e.total_centavos = 800; }],
  ['codigo duplicado', e => { e.contas[1].codigo = 'banco'; }],
  ['ID ausente', e => { delete e.contas[0].id; }],
  ['abertura ausente', e => { delete e.contas[0].abertura_centavos; }],
  ['corte ausente', e => { delete e.contas[0].corte_em; }],
  ['pagamento incompleto', e => { e.pagamentos.push({ conta_pagar_id: 'p-1' }); }],
  ['restante negativo', e => { e.pagamentos.push({ conta_pagar_id: 'p-1', pago_centavos: 0, restante_centavos: -1 }); }],
  ['pagamentos duplicados', e => { e.pagamentos.push(...Array.from({ length: 2 }, () => ({ conta_pagar_id: 'p-1', pago_centavos: 0, restante_centavos: 0 }))); }],
  ['movimento incompleto', e => { e.movimentos.push({}); }],
  ['transferencia para mesma conta', e => { e.movimentos.push({ ...transferencia(), destino_id: 'conta-banco' }); }],
  ['cancelamento efetivo', e => { e.movimentos.push({ ...transferencia(), cancelado_em: '2026-09-03T12:00:00Z' }); }],
  ['abertura afetando saldo', e => { e.movimentos.push({ ...transferencia(), decisao_corte: 'incluido_abertura' }); }],
  ['data civil invalida', e => { e.movimentos.push({ ...transferencia(), data_efetiva: '2026-02-30' }); }]
]) {
  test('ledger com ' + nome + ' nao confirma caixa nem pagamentos', async () => {
    const e = comAbertura(); alterar(e);
    const s = await ambiente({ carregarLedger: async () => e }).loader.carregar();
    assert.equal(s.ledger.status, 'indisponivel');
    assert.equal(s.ledger.estado, null);
    assert.equal(s.dominios.obrigacoes.status, 'parcial');
    assert.equal(s.dominios.recebiveis.status, 'confirmada');
  });
}

for (const [nome, resposta] of [
  ['null', null], ['tenant errado', ledger({ company_id: 'empresa-B' })],
  ['total invalido', ledger({ total_centavos: null })], ['array ausente', { company_id: EMPRESA }],
  ['sem abertura com movimentos', ledger({ movimentos: [{}] })],
  ['sem abertura com saldo', ledger({ total_centavos: 1 })],
  ['envelope indisponivel', { status: 'indisponivel', estado: ledger() }]
]) {
  test('ledger ' + nome + ' continua indisponivel sem fallback historico', async () => {
    const s = await ambiente({ carregarLedger: async () => resposta }).loader.carregar();
    assert.equal(s.ledger.status, 'indisponivel');
    assert.equal(s.ledger.estado, null);
    assert.equal(s.dominios.recebiveis.status, 'confirmada');
  });
}

test('normaliza periodos legados sem mudar fonte e preserva competencia de folha', async () => {
  const diaria = row('dia-1', { quinzena_id: 'q-1', data: '2026-09-15', diaria_base: '123.45', valor: '61.73',
    periodos: '[{"obra":"Nome legado","fracao":0.5}]', faltas_turno: ['tarde'], status: 'apontado' });
  const q = row('q-1', { fechada: true, data_inicio: '2026-09-01', data_fim: '2026-09-15' });
  const extra = row('extra-1', { quinzena_id: q.id, obra: 'Nome legado', valor: '-5', descricao: 'Desconto sintetico' });
  const a = ambiente({ fontes: { diarias: [diaria], diarias_quinzenas: [q], diarias_extras: [extra] } });
  const s = await a.loader.carregar();
  assert.deepEqual(s.diarias[0].periodos, [{ obra: 'Nome legado', fracao: 0.5 }]);
  assert.equal(typeof diaria.periodos, 'string');
  assert.equal(s.diarias[0].valor, '61.73');
  assert.equal(s.coberturaFolha.comprovaPagamento, false);
  assert.equal('data' in s.extras[0], false);
  assert.equal('paga' in s.quinzenas[0], false);
  assert.equal(s.dominios.folha.status, 'confirmada');
});

for (const periodos of ['{invalid}', '{}', [null]]) {
  test('periodos malformados invalidam somente fonte folha: ' + JSON.stringify(periodos), async () => {
    const s = await ambiente({ fontes: { diarias: [row('dia-1', { periodos })] } }).loader.carregar();
    assert.equal(s.diarias, null);
    assert.equal(s.fontes.diarias.codigo, 'PERIODOS_INVALIDOS');
    assert.equal(s.dominios.recebiveis.status, 'confirmada');
    assert.equal(s.dominios.dre.status, 'confirmada');
  });
}

test('factory DRE recebe dados congelados, sem cache global, e adapter falho nao confirma resultado', async () => {
  const a = ambiente({ criarDre: s => {
    assert.equal(Object.isFrozen(s), true);
    assert.equal(Object.isFrozen(s.contasPagar), true);
    assert.deepEqual(s.OBRAS_INTERNAS, []);
    throw new Error('erro privado com credencial simulada');
  } });
  const s = await a.loader.carregar();
  assert.equal(s.dre.status, 'indisponivel');
  assert.equal(s.fontes.dre.codigo, 'ADAPTER_DRE_INDISPONIVEL');
  assert.equal(s.dominios.recebiveis.status, 'confirmada');
  assert.equal(JSON.stringify(s).includes('credencial'), false);
});

test('adapter sem API exigida nao e confirmado', async () => {
  const s = await ambiente({ criarDre: () => ({}) }).loader.carregar();
  assert.equal(s.dre.status, 'indisponivel');
});

test('adapter declarado indisponivel nao e promovido apesar de possuir callbacks', async () => {
  const s = await ambiente({ criarDre: () => ({ ...adapter(), status: 'indisponivel' }) }).loader.carregar();
  assert.equal(s.dre.status, 'indisponivel');
});

test('troca de ator durante factory DRE rejeita snapshot', async () => {
  let a;
  a = ambiente({ criarDre: () => { a.trocar({ company_id: EMPRESA, ator_id: 'novo-ator', perfil: 'admin' }); return adapter(); } });
  await assert.rejects(a.loader.carregar(), e => e.code === 'LEITURA_OBSOLETA');
});

test('snapshot e copia congelada; mutacao posterior da fonte nao altera consulta confirmada', async () => {
  const original = row('obra-1', { nome: 'Obra sintetica', valor_venda: '100.00' });
  const a = ambiente({ fontes: { obras: [original] } });
  const s = await a.loader.carregar();
  original.nome = 'Outro nome';
  assert.equal(s.obras[0].nome, 'Obra sintetica');
  assert.equal(Object.isFrozen(s), true);
  assert.equal(Object.isFrozen(s.obras[0]), true);
  assert.throws(() => { s.obras.push(row('obra-2')); }, TypeError);
  assert.equal(s.dre.calcGerencialConsolidado('').resultado, 11);
});
