const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const { resolverConversaoImportacao } = require('../js/edr-v2-importar.js');

// No teste local, NF_BRITA_XML aponta para o XML integral recebido. O fallback
// reproduz somente os campos necessarios, sem versionar dados fiscais de terceiro.
const xml = process.env.NF_BRITA_XML
  ? fs.readFileSync(process.env.NF_BRITA_XML, 'utf8')
  : `<NFe><infNFe Id="NFe26260800000000000191550010000234441000000001">
      <ide><nNF>23444</nNF><serie>1</serie><dhEmi>2026-08-18T16:22:41-03:00</dhEmi></ide>
      <emit><CNPJ>00000000000191</CNPJ><xNome>FORNECEDOR TESTE</xNome></emit>
      <det><prod><cProd>4</cProd><xProd>BRITA 19mm</xProd><uCom>MT</uCom><qCom>11.5000</qCom><vUnCom>135.0000000000</vUnCom><vProd>1552.50</vProd></prod></det>
      <total><ICMSTot><vNF>1552.50</vNF></ICMSTot></total>
    </infNFe></NFe>`;
const tag = nome => xml.match(new RegExp(`<${nome}>([^<]+)</${nome}>`))?.[1] || '';
const chave = xml.match(/<infNFe\s+Id="NFe(\d{44})"/)?.[1] || '';

assert.equal(tag('xProd'), 'BRITA 19mm');
assert.equal(tag('uCom'), 'MT');
assert.equal(Number(tag('qCom')), 11.5);
assert.equal(Number(tag('vUnCom')), 135);
assert.equal(Number(tag('vProd')), 1552.5);
assert.equal(chave.length, 44);

const material = {
  id: 'mat-brita', codigo: '000108', nome: 'BRITA 19',
  unidade: 'M³', categoria: '02_fundacao', movimenta_estoque: true,
};
const fiscal = {
  qtd_fiscal: Number(tag('qCom')),
  unidade_fiscal: tag('uCom'),
  preco_fiscal: Number(tag('vUnCom')),
  total_fiscal: Number(tag('vProd')),
};
const convertido = resolverConversaoImportacao(fiscal, material, [{
  id: 'regra-brita-mt-m3', material_id: material.id,
  unidade_origem: 'MT', unidade_destino: 'M³', fator: 1,
  vigente_de: '2026-08-18', vigente_ate: null,
}], '2026-08-18');

assert.equal(convertido.status_conversao, 'convertido');
assert.equal(convertido.qtd_estoque, 11.5);
assert.equal(convertido.unidade_estoque, 'M³');
assert.equal(convertido.preco_estoque, 135);
assert.equal(convertido.qtd_estoque * convertido.preco_estoque, convertido.total_fiscal);

const itemNota = {
  desc: material.nome, codigo: material.codigo,
  qtd: convertido.qtd_estoque, unidade: convertido.unidade_estoque,
  preco: convertido.preco_estoque, total: convertido.total_fiscal,
  imposto: 0, credito: true, cat: 'Material',
  descricao_fiscal: tag('xProd'), codigo_produto_fiscal: tag('cProd'),
  ...convertido,
};

const elementos = new Map([
  ['f-desconto-total', { value: '' }],
]);
const overlays = [];
function criarOverlay() {
  const nodes = new Map();
  const node = seletor => {
    if (!nodes.has(seletor)) nodes.set(seletor, {
      style: {}, value: '', textContent: '', onclick: null,
      focus() {}, remove() {},
    });
    return nodes.get(seletor);
  };
  const overlay = {
    innerHTML: '', className: '', removed: false,
    querySelector: node,
    querySelectorAll() { return []; },
    addEventListener() {},
    remove() { this.removed = true; },
  };
  overlays.push(overlay);
  return overlay;
}

const gravacoes = [];
const agendados = [];
const avisos = [];
const contextoNotas = {
  console: { log() {}, warn() {}, error() {} },
  document: {
    getElementById: id => elementos.get(id) || null,
    createElement: criarOverlay,
    body: { appendChild() {} },
    addEventListener() {},
    querySelectorAll() { return []; },
  },
  setTimeout: fn => { agendados.push(fn); return agendados.length; },
  clearTimeout() {},
  showToast: mensagem => avisos.push(mensagem),
  confirmar: async () => true,
  norm: valor => String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim(),
  fmtData: valor => valor,
  fmtR: valor => `R$ ${Number(valor).toFixed(2)}`,
  esc: valor => String(valor || ''),
  hojeISO: () => '2026-08-18',
  COMPANY_DEFAULTS: { estoqueGeral: 'EDR', escritorio: 'EDR ESCRITORIO' },
  ImportModule: {
    _xmlCtx: {
      chaveAcesso: chave,
      desconto: 0,
      fornecedorCnpj: tag('CNPJ'),
      numero: `${tag('nNF')}/${tag('serie')}`,
      vNF: Number(tag('vNF')),
      qtdItens: 1,
    },
  },
  notas: [], lancamentos: [], distribuicoes: [], contasPagar: [],
  obras: [], obrasArquivadas: [],
  catalogoMateriais: [material],
  renderItensForm() {}, renderDashboard() {}, renderEstoque() {}, renderNotas() {},
  limparRascunhoNF() {}, setView() {}, aplicarPerfil() {},
  sbPost: async (tabela, payload) => {
    gravacoes.push({ tabela, payload });
    if (tabela === 'notas_fiscais') return { id: 'nf-brita-23444', ...payload };
    if (tabela === 'contas_pagar') return { id: 'cp-brita-23444', ...payload };
    return { id: `${tabela}-1`, ...payload };
  },
};
contextoNotas.globalThis = contextoNotas;

const fonteNotas = fs.readFileSync(require.resolve('../js/edr-v2-notas.js'), 'utf8') + `
globalThis.__notasTeste = { salvarNota, getNotas: () => notas, getContas: () => contasPagar };
`;
vm.runInNewContext(fonteNotas, contextoNotas, { filename: 'edr-v2-notas.js' });

(async () => {
  const numero = `${tag('nNF')}/${tag('serie')}`;
  const salvou = await contextoNotas.__notasTeste.salvarNota({
    numero,
    fornecedor: tag('xNome'),
    cnpj: tag('CNPJ'),
    emissao: tag('dhEmi').slice(0, 10),
    recebimento: '2026-08-18',
    obra: 'EDR',
    natureza: 'VENDA',
    itens: [itemNota],
  });
  assert.equal(salvou, true);

  const postNota = gravacoes.find(g => g.tabela === 'notas_fiscais');
  assert.ok(postNota);
  assert.equal(postNota.payload.valor_bruto, 1552.5);
  assert.equal(postNota.payload.obra, 'EDR');
  const itemPersistido = JSON.parse(postNota.payload.itens)[0];
  assert.equal(itemPersistido.qtd_fiscal, 11.5);
  assert.equal(itemPersistido.unidade_fiscal, 'MT');
  assert.equal(itemPersistido.qtd_estoque, 11.5);
  assert.equal(itemPersistido.unidade_estoque, 'M³');
  assert.equal(itemPersistido.preco_estoque, 135);
  assert.equal(itemPersistido.regra_conversao_id, 'regra-brita-mt-m3');

  const fonteEstoque = fs.readFileSync(require.resolve('../js/edr-v2-estoque.js'), 'utf8') + `
globalThis.__estoqueTeste = { consolidarEstoque };
`;
  const contextoEstoque = {
    console: { log() {}, warn() {}, error() {} },
    document: { addEventListener() {}, getElementById() { return null; }, querySelectorAll() { return []; } },
    window: {}, setTimeout() {}, clearTimeout() {},
    norm: valor => String(valor || '').toUpperCase().trim(),
    parseItens: nota => JSON.parse(nota.itens || '[]'),
    _resolverCategoriaEstoque: valor => valor,
    _categoriaPorEtapas: () => '36_outros',
    COMPANY_DEFAULTS: { estoqueGeral: 'EDR' },
    notas: contextoNotas.__notasTeste.getNotas(),
    entradasDiretas: [], ajustesEstoque: [], distribuicoes: [], lancamentos: [],
    catalogoMateriais: [material],
  };
  contextoEstoque.globalThis = contextoEstoque;
  vm.runInNewContext(fonteEstoque, contextoEstoque, { filename: 'edr-v2-estoque.js' });
  const estoque = contextoEstoque.__estoqueTeste.consolidarEstoque();
  assert.equal(estoque.length, 1);
  assert.equal(estoque[0].saldo, 11.5);
  assert.equal(estoque[0].unidade, 'M³');
  assert.equal(estoque[0].valorMedio, 135);
  assert.equal(estoque[0].valorEstoque, 1552.5);

  assert.equal(agendados.length, 1);
  agendados[0]();
  const promptPagamento = overlays.at(-1);
  assert.ok(promptPagamento);
  await promptPagamento.querySelector('#_pp-vista').onclick();
  const postFinanceiro = gravacoes.find(g => g.tabela === 'contas_pagar');
  assert.ok(postFinanceiro);
  assert.equal(postFinanceiro.payload.valor, 1552.5);
  assert.equal(postFinanceiro.payload.nota_id, 'nf-brita-23444');
  assert.equal(postFinanceiro.payload.nota_ref, numero);
  assert.equal(postFinanceiro.payload.status, 'pago');
  assert.equal(contextoNotas.__notasTeste.getContas().length, 1);

  console.log('nf-brita-fluxo: 33 assertions passed');
})().catch(erro => {
  console.error(erro);
  process.exitCode = 1;
});
