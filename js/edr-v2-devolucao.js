// ══════════════════════════════════════════════════════════════════
// EDR System V2 — Devolução ao fornecedor
// Motor puro: valida a devolução antes da gravação e preserva o vínculo
// fiscal com a NF de compra. Não faz chamadas ao banco.
// ══════════════════════════════════════════════════════════════════

const DevolucaoFornecedor = (() => {
  const EPSILON = 0.000001;

  function itensDaNota(nota) {
    if (!nota) return [];
    if (Array.isArray(nota.itens)) return nota.itens;
    try { return JSON.parse(nota.itens || '[]'); } catch (_) { return []; }
  }

  function somenteDigitos(valor) {
    return String(valor || '').replace(/\D/g, '');
  }

  function chaveItem(item) {
    const codigoFiscal = String(item?.codigo_produto_fiscal || item?.cProd || '').trim().toUpperCase();
    if (codigoFiscal) return `F:${codigoFiscal}`;
    const codigoCatalogo = String(item?.codigo_catalogo || item?.codigo || '').trim().toUpperCase();
    if (codigoCatalogo) return `C:${codigoCatalogo}`;
    return '';
  }

  function qtdEstoque(item) {
    return Number(item?.qtd_estoque ?? item?.quantidade ?? item?.qtd) || 0;
  }

  function totalItem(item) {
    if (item?.total != null && item.total !== '') return Number(item.total) || 0;
    return qtdEstoque(item) * (Number(item?.preco_estoque ?? item?.preco_unitario ?? item?.preco) || 0);
  }

  function origensElegiveis(notas, cnpjFornecedor) {
    const cnpj = somenteDigitos(cnpjFornecedor);
    return (Array.isArray(notas) ? notas : []).filter(nota => {
      if (!nota?.id || nota.natureza === 'DEVOLUCAO') return false;
      if (nota.obra !== 'EDR') return false;
      if (!cnpj || somenteDigitos(nota.cnpj) !== cnpj) return false;
      return itensDaNota(nota).length > 0;
    });
  }

  function validar({ origem, itensDevolucao, notas, distribuicoes, cnpjFornecedor }) {
    const erros = [];
    if (!origem?.id) erros.push('Selecione a nota de compra que originou a devolução.');
    if (origem?.natureza === 'DEVOLUCAO') erros.push('Uma devolução não pode ser origem de outra devolução.');
    if (origem?.obra !== 'EDR') erros.push('Esta primeira versão aceita devolução apenas de compra que entrou no Estoque EDR.');

    const cnpjOrigem = somenteDigitos(origem?.cnpj);
    const cnpjDevolucao = somenteDigitos(cnpjFornecedor);
    if (!cnpjOrigem || !cnpjDevolucao || cnpjOrigem !== cnpjDevolucao) {
      erros.push('Fornecedor da devolução não confere com a nota de compra selecionada.');
    }

    const distribuiuOrigem = (Array.isArray(distribuicoes) ? distribuicoes : [])
      .some(d => d?.nota_id === origem?.id && Number(d.qtd || 0) > 0);
    if (distribuiuOrigem) {
      erros.push('A compra selecionada já teve saída para obra. A devolução precisa ser conferida manualmente antes de ser lançada.');
    }

    const itensOrigem = itensDaNota(origem);
    const devolucoesAnteriores = (Array.isArray(notas) ? notas : [])
      .filter(n => n?.natureza === 'DEVOLUCAO' && n?.nota_origem_id === origem?.id);
    const itensValidados = [];

    for (let indice = 0; indice < (itensDevolucao || []).length; indice++) {
      const item = itensDevolucao[indice];
      const chave = chaveItem(item);
      if (!chave) {
        erros.push(`Item ${indice + 1}: sem código fiscal ou código de catálogo para vincular à compra.`);
        continue;
      }
      const encontrados = itensOrigem
        .map((origemItem, itemIdx) => ({ origemItem, itemIdx }))
        .filter(({ origemItem }) => chaveItem(origemItem) === chave);
      if (encontrados.length !== 1) {
        erros.push(`Item ${indice + 1}: não foi possível identificar uma única linha correspondente na compra.`);
        continue;
      }

      const { origemItem, itemIdx } = encontrados[0];
      const qtdOriginal = qtdEstoque(origemItem);
      const qtdDevolvida = qtdEstoque(item);
      const qtdAnterior = devolucoesAnteriores.reduce((soma, nota) => soma + itensDaNota(nota)
        .filter(anterior => chaveItem(anterior) === chave)
        .reduce((subtotal, anterior) => subtotal + qtdEstoque(anterior), 0), 0);
      if (!(qtdDevolvida > 0)) {
        erros.push(`Item ${indice + 1}: a quantidade devolvida deve ser maior que zero.`);
        continue;
      }
      if (qtdDevolvida + qtdAnterior > qtdOriginal + EPSILON) {
        erros.push(`Item ${indice + 1}: devolução excede o saldo da compra (${qtdOriginal - qtdAnterior} disponível).`);
        continue;
      }

      const totalEsperado = qtdOriginal > 0 ? totalItem(origemItem) * qtdDevolvida / qtdOriginal : 0;
      if (Math.abs(totalItem(item) - totalEsperado) > 0.01) {
        erros.push(`Item ${indice + 1}: valor da devolução não confere com o valor proporcional da compra.`);
        continue;
      }
      itensValidados.push({ indice, item_idx_origem: itemIdx });
    }

    if (!(itensDevolucao || []).length) erros.push('A devolução precisa ter ao menos um item.');
    return { ok: erros.length === 0, erros, itensValidados };
  }

  return { itensDaNota, chaveItem, qtdEstoque, totalItem, origensElegiveis, validar };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = DevolucaoFornecedor;
