/* ═══════════════════════════════════════════════════════════════════════════
   EDR — Simulador · ADAPTADOR DE TAXA
   ───────────────────────────────────────────────────────────────────────────
   ESTE ARQUIVO NÃO FAZ PARTE DO NÚCLEO DETERMINÍSTICO.

   Motivo: a conversão anual→mensal exige raiz de ordem 12, que não tem
   equivalente exato em aritmética inteira. Aqui usamos ponto flutuante e
   QUANTIZAMOS o resultado para inteiro ppb (half-up). Essa é a ÚNICA
   fronteira float do simulador, e ela é explícita.

   Depois da quantização, o inteiro ppb é a fonte de verdade. O motor nunca
   recebe taxa anual, nunca refaz esta conta.

   REGRA CRÍTICA: valor EXIBIDO nunca volta como entrada de cálculo.
   Converter 7,95% a.a. -> exibir "0,639519%" -> reconverter esse texto
   perde 3 ppb (6_395_190 em vez de 6_395_193). Sempre quantizar a partir
   da precisão plena.
   ═══════════════════════════════════════════════════════════════════════════ */

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SimuladorTaxa = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const PPB_NUM = 1e9;

  class ErroTaxa extends Error {
    constructor(codigo, mensagem, detalhe) {
      super(mensagem);
      this.name = 'ErroTaxa';
      this.codigo = codigo;
      this.detalhe = detalhe || null;
    }
  }

  function _quantizarHalfUp(valorFracionario) {
    // valorFracionario: taxa como fração decimal (0.0063951933951152)
    // Retorna BigInt em ppb, half-up, a partir da precisão plena.
    if (!Number.isFinite(valorFracionario) || valorFracionario < 0) {
      throw new ErroTaxa('TAXA_INVALIDA', 'taxa deve ser finita e >= 0', { valorFracionario });
    }
    const escalado = valorFracionario * PPB_NUM;
    if (escalado > Number.MAX_SAFE_INTEGER) {
      throw new ErroTaxa('TAXA_INVALIDA', 'taxa fora da faixa suportada', { valorFracionario });
    }
    return BigInt(Math.floor(escalado + 0.5));
  }

  /**
   * Taxa efetiva anual -> taxa mensal em ppb (BigInt).
   * i_m = (1 + i_a)^(1/12) - 1, capitalização composta.
   * Ex.: 0.0795 (7,95% a.a.) -> 6_395_193n
   */
  function anualParaMensalPpb(taxaAnualFracao) {
    if (typeof taxaAnualFracao !== 'number' || !Number.isFinite(taxaAnualFracao)) {
      throw new ErroTaxa('TAXA_INVALIDA', 'taxa anual deve ser número finito',
        { recebido: typeof taxaAnualFracao });
    }
    if (taxaAnualFracao < 0) {
      throw new ErroTaxa('TAXA_INVALIDA', 'taxa anual negativa', { taxaAnualFracao });
    }
    if (taxaAnualFracao === 0) return 0n;
    const mensal = Math.pow(1 + taxaAnualFracao, 1 / 12) - 1;
    return _quantizarHalfUp(mensal);
  }

  /** Taxa mensal já informada como fração (0.01 = 1% a.m.) -> ppb. */
  function mensalParaPpb(taxaMensalFracao) {
    if (typeof taxaMensalFracao !== 'number' || !Number.isFinite(taxaMensalFracao)) {
      throw new ErroTaxa('TAXA_INVALIDA', 'taxa mensal deve ser número finito',
        { recebido: typeof taxaMensalFracao });
    }
    if (taxaMensalFracao < 0) {
      throw new ErroTaxa('TAXA_INVALIDA', 'taxa mensal negativa', { taxaMensalFracao });
    }
    return _quantizarHalfUp(taxaMensalFracao);
  }

  /** ppb -> fração anual equivalente. APENAS PARA EXIBIÇÃO. */
  function ppbParaAnualExibicao(taxaMensalPpb) {
    if (typeof taxaMensalPpb !== 'bigint') {
      throw new ErroTaxa('TIPO_INVALIDO', 'taxaMensalPpb deve ser BigInt');
    }
    const mensal = Number(taxaMensalPpb) / PPB_NUM;
    return Math.pow(1 + mensal, 12) - 1;
  }

  /** ppb -> percentual mensal em texto. APENAS PARA EXIBIÇÃO. */
  function ppbParaTextoMensal(taxaMensalPpb, casas) {
    if (typeof taxaMensalPpb !== 'bigint') {
      throw new ErroTaxa('TIPO_INVALIDO', 'taxaMensalPpb deve ser BigInt');
    }
    const c = (casas == null) ? 6 : casas;
    const pct = (Number(taxaMensalPpb) / PPB_NUM) * 100;
    return pct.toFixed(c).replace('.', ',') + '%';
  }

  /**
   * Interpreta texto livre vindo de obras.contrato_taxa ("7,95%", "7.95 % a.a.").
   * Retorna null se não interpretar — NUNCA chuta, NUNCA grava de volta.
   */
  function interpretarTextoTaxa(texto) {
    if (typeof texto !== 'string') return null;
    const limpo = texto.trim().replace(/%/g, '').replace(/a\.?\s*a\.?/gi, '')
                       .replace(/ao ano/gi, '').trim().replace(',', '.');
    if (limpo === '' || !/^\d+(\.\d+)?$/.test(limpo)) return null;
    const n = parseFloat(limpo);
    if (!Number.isFinite(n) || n < 0 || n > 100) return null;
    return n / 100;   // fração
  }

  /** Interpreta obras.contrato_prazo ("360 meses", "360"). null se falhar. */
  function interpretarTextoPrazo(texto) {
    if (typeof texto !== 'string') return null;
    const m = texto.trim().match(/^(\d{1,3})\s*(meses|mes|m)?$/i);
    if (!m) return null;
    const n = parseInt(m[1], 10);
    if (!Number.isInteger(n) || n < 1 || n > 480) return null;
    return n;
  }

  return {
    ErroTaxa,
    anualParaMensalPpb, mensalParaPpb,
    ppbParaAnualExibicao, ppbParaTextoMensal,
    interpretarTextoTaxa, interpretarTextoPrazo
  };
});
