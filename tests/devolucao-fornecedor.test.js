const assert = require('node:assert/strict');
const DevolucaoFornecedor = require('../js/edr-v2-devolucao.js');

// Valores conferidos nos dois XMLs reais da FEMAC. A fixture é mínima para o
// teste ficar reproduzível sem depender da pasta Downloads do operador.
const compraXml = {
  numero: '861318', natureza: 'VENDA DE MERCADORIAS SUJEITA AO REGIME DE SUBST TRIBUTARIA',
  cnpj: '09266030000119', produto: 'CAIXA DAGUA FORTLEV 1000L POLIETILENO', qtd: 2, total: 792.90,
};
const devolucaoXml = {
  numero: '147051', natureza: 'DEV. DE MERCADORIA SUJEITAS AO REGIME DE S.T.',
  cnpj: '09266030000119', produto: 'CAIXA DAGUA FORTLEV 1000L POLIETILENO', qtd: 1, total: 396.45,
};

assert.equal(compraXml.numero, '861318');
assert.equal(compraXml.qtd, 2);
assert.equal(compraXml.total, 792.90);
assert.match(devolucaoXml.natureza, /DEV\./);
assert.equal(devolucaoXml.qtd, 1);
assert.equal(devolucaoXml.total, 396.45);
assert.equal(compraXml.produto, devolucaoXml.produto);

const compra = {
  id: 'compra-861318', natureza: 'VENDA', obra: 'EDR', cnpj: compraXml.cnpj,
  itens: JSON.stringify([{
    codigo_produto_fiscal: '559', desc: compraXml.produto, qtd: 2, qtd_estoque: 2, preco: 396.45, total: 792.90,
  }]),
};
const devolucao = [{
  codigo_produto_fiscal: '559', desc: devolucaoXml.produto, qtd: 1, qtd_estoque: 1, preco: 396.45, total: 396.45,
}];

const ok = DevolucaoFornecedor.validar({
  origem: compra, itensDevolucao: devolucao, notas: [compra], distribuicoes: [], cnpjFornecedor: devolucaoXml.cnpj,
});
assert.equal(ok.ok, true);
assert.deepEqual(ok.itensValidados, [{ indice: 0, item_idx_origem: 0 }]);
assert.equal(compraXml.qtd - devolucaoXml.qtd, 1);
assert.equal(compraXml.total - devolucaoXml.total, 396.45);

const excedente = DevolucaoFornecedor.validar({
  origem: compra, itensDevolucao: [{ ...devolucao[0], qtd: 3, qtd_estoque: 3, total: 1189.35 }], notas: [compra], distribuicoes: [], cnpjFornecedor: devolucaoXml.cnpj,
});
assert.equal(excedente.ok, false);
assert.match(excedente.erros.join(' '), /excede o saldo/);

const jaDistribuida = DevolucaoFornecedor.validar({
  origem: compra, itensDevolucao: devolucao, notas: [compra], distribuicoes: [{ nota_id: compra.id, qtd: 1 }], cnpjFornecedor: devolucaoXml.cnpj,
});
assert.equal(jaDistribuida.ok, false);
assert.match(jaDistribuida.erros.join(' '), /já teve saída/);

const fornecedorDivergente = DevolucaoFornecedor.validar({
  origem: compra, itensDevolucao: devolucao, notas: [compra], distribuicoes: [], cnpjFornecedor: '00000000000000',
});
assert.equal(fornecedorDivergente.ok, false);
assert.match(fornecedorDivergente.erros.join(' '), /Fornecedor/);

console.log('devolucao-fornecedor: 17 assertions passed');
