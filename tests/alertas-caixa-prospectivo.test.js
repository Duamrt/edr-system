const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');

const source = fs.readFileSync('js/edr-v2-alertas.js', 'utf8');
function carregar(lerEstado, lerContas) {
  let consultasLegadas = 0;
  const contexto = {
    console: { warn() {} },
    repassesCef: [{ valor: 50 }],
    adicionaisPgtos: [{ valor: 10 }],
    lancamentos: [{ total: 999999, data: '2020-01-01', etapa: '28_mao' }],
    _companyId: 'tenant-sintetico',
    fmtR: valor => 'R$ ' + valor.toFixed(2),
    sbGet: async () => { consultasLegadas++; throw new Error('Consulta legada proibida'); },
  };
  if (lerEstado) contexto.caixaProspectivoCarregar = lerEstado;
  if (lerContas) contexto.sbGet = lerContas;
  vm.createContext(contexto);
  vm.runInContext(source, contexto);
  return { alerta: contexto._alertCaixa, obrigacoes: contexto._alertContasPagar, contexto, consultas: () => consultasLegadas };
}
const estado = total => ({ company_id: 'tenant-sintetico', pagamentos: [], contas: [{ id: 'banco-sintetico' }, { id: 'dinheiro-sintetico' }], total_centavos: total });

test('saldo prospectivo positivo ignora custos de folha antigos e fontes legadas', async () => {
  let leituras = 0;
  const fluxo = carregar(async () => { leituras++; return estado(10000); });
  const alertas = [];
  await fluxo.alerta(alertas, '2026-01-02');
  assert.equal(leituras, 1);
  assert.equal(alertas.length, 0);
  assert.equal(fluxo.consultas(), 0);
});

test('saldo prospectivo negativo usa total persistido em centavos', async () => {
  const fluxo = carregar(async () => estado(-12345));
  const alertas = [];
  await fluxo.alerta(alertas, '2026-01-02');
  assert.equal(alertas.length, 1);
  assert.equal(alertas[0].view, 'caixa');
  assert.equal(alertas[0].tipo, 'danger');
  assert.equal(alertas[0].msg, 'Saldo atual: R$ -123.45. Revise movimentos efetivos.');
  assert.equal(fluxo.consultas(), 0);
});

test('total zero nao gera alerta', async () => {
  const fluxo = carregar(async () => estado(0));
  const alertas = [];
  await fluxo.alerta(alertas, '2026-01-02');
  assert.equal(alertas.length, 0);
});

test('sem abertura nao gera alerta mesmo com custos antigos ou total negativo', async () => {
  const fluxo = carregar(async () => ({ contas: [], total_centavos: -999999 }));
  const alertas = [];
  await fluxo.alerta(alertas, '2026-01-02');
  assert.equal(alertas.length, 0);
  assert.equal(fluxo.consultas(), 0);
});

test('falha, ausencia de RPC ou acesso indisponivel nao usam fallback legado', async () => {
  for (const lerEstado of [async () => null, async () => { throw new Error('Falha sintetica de persistencia'); }]) {
    const fluxo = carregar(lerEstado);
    const alertas = [];
    await fluxo.alerta(alertas, '2026-01-02');
    assert.equal(alertas.length, 0);
    assert.equal(fluxo.consultas(), 0);
  }
});

test('modulo ausente nao gera alerta nem consulta historico', async () => {
  const fluxo = carregar();
  const alertas = [];
  await fluxo.alerta(alertas, '2026-01-02');
  assert.equal(alertas.length, 0);
  assert.equal(fluxo.consultas(), 0);
});

test('resposta incompleta ou total invalido nao produz saldo atual', async () => {
  for (const resposta of [{ total_centavos: -100 }, estado(NaN), estado(Infinity), estado(-12.5), estado(-Number.MAX_SAFE_INTEGER - 1)]) {
    const fluxo = carregar(async () => resposta);
    const alertas = [];
    await fluxo.alerta(alertas, '2026-01-02');
    assert.equal(alertas.length, 0);
  }
});


const contaParcial = vencimento => ({ id: 'obrigacao-sintetica', valor: 400, data_vencimento: vencimento, descricao: 'Custo sintetico', tipo: null });
const estadoParcial = (restante = 25000) => ({ ...estado(10000), pagamentos: [{ conta_pagar_id: 'obrigacao-sintetica', pago_centavos: 15000, restante_centavos: restante }] });
async function alertarObrigacoes(fluxo) {
  const alertas = [];
  await fluxo.obrigacoes(alertas, '2026-01-02', '2026-01-09');
  return alertas;
}

test('vencida parcial mostra restante 250 de obrigacao 400 paga em 150', async () => {
  let consultas = 0;
  const fluxo = carregar(async () => estadoParcial(), async (tabela, query, options) => {
    consultas++;
    assert.equal(tabela, 'contas_pagar');
    assert.match(query, /status=eq.pendente/);
    assert.match(query, /select=id,valor,/);
    assert.equal(options.throwOnError, true);
    return [contaParcial('2026-01-01')];
  });
  const alertas = await alertarObrigacoes(fluxo);
  assert.equal(consultas, 1);
  assert.equal(alertas.length, 1);
  assert.equal(alertas[0].tipo, 'danger');
  assert.equal(alertas[0].msg, 'Total em aberto: R$ 250.00');
  assert.ok(!alertas[0].msg.includes('400'));
});

test('vencendo parcial mostra somente restante confirmado', async () => {
  const alertas = await alertarObrigacoes(carregar(async () => estadoParcial(), async () => [contaParcial('2026-01-05')]));
  assert.equal(alertas.length, 1);
  assert.equal(alertas[0].tipo, 'warning');
  assert.equal(alertas[0].msg, 'Total: R$ 250.00');
});

test('restante zero nao entra na contagem nem no total de obrigacoes', async () => {
  const alertas = await alertarObrigacoes(carregar(async () => estadoParcial(0), async () => [contaParcial('2026-01-01')]));
  assert.equal(alertas.length, 0);
});

test('sem snapshot confirmado nao alerta obrigacoes nem consulta valor integral', async () => {
  for (const lerEstado of [undefined, async () => null, async () => { throw new Error('RPC indisponivel'); }]) {
    let consultas = 0;
    const fluxo = carregar(lerEstado, async () => { consultas++; return [contaParcial('2026-01-01')]; });
    assert.equal((await alertarObrigacoes(fluxo)).length, 0);
    assert.equal(consultas, 0);
  }
});

test('snapshot incompleto ou restante invalido nao usa valor original', async () => {
  for (const resposta of [estado(10000), estadoParcial(NaN), estadoParcial(-1), estadoParcial(12.5)]) {
    const fluxo = carregar(async () => resposta, async () => [contaParcial('2026-01-01')]);
    assert.equal((await alertarObrigacoes(fluxo)).length, 0);
  }
});

test('erro de leitura das contas nao produz total atualizado', async () => {
  const fluxo = carregar(async () => estadoParcial(), async () => { throw new Error('Falha sintetica de leitura'); });
  assert.equal((await alertarObrigacoes(fluxo)).length, 0);
});

test('snapshot de outra empresa ou troca durante leitura suprimem alerta', async () => {
  const divergente = carregar(async () => ({ ...estadoParcial(), company_id: 'outra-empresa' }), async () => [contaParcial('2026-01-01')]);
  assert.equal((await alertarObrigacoes(divergente)).length, 0);
  const trocando = carregar(async () => estadoParcial(), async () => {
    trocando.contexto._companyId = 'outra-empresa';
    return [contaParcial('2026-01-01')];
  });
  assert.equal((await alertarObrigacoes(trocando)).length, 0);
});

test('reembolso previsto nao soma a obrigacoes a pagar', async () => {
  const fluxo = carregar(async () => estadoParcial(), async () => [
    contaParcial('2026-01-01'),
    { id: 'reembolso-sintetico', valor: 900, tipo: 'reembolso_fornecedor', data_vencimento: '2026-01-01' }
  ]);
  const alertas = await alertarObrigacoes(fluxo);
  assert.equal(alertas.length, 1);
  assert.equal(alertas[0].titulo, '1 conta vencida');
  assert.equal(alertas[0].msg, 'Total em aberto: R$ 250.00');
});
