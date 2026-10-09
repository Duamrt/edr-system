/* Projeções do plano aprovado: leitura autenticada, sem fabricar recebimento ou saldo. */
(function (root, factory) {
  'use strict';
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.EntradaPlanoProjecoes = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  const safe = Number.isSafeInteger;
  const object = v => !!v && typeof v === 'object' && !Array.isArray(v);
  const id = v => typeof v === 'string' && !!v.trim();
  function congelar(v) { if (v && typeof v === 'object' && !Object.isFrozen(v)) { Object.values(v).forEach(congelar); Object.freeze(v); } return v; }
  function soma(a, b) { const v = BigInt(a) + BigInt(b); return v > BigInt(Number.MAX_SAFE_INTEGER) || v < BigInt(Number.MIN_SAFE_INTEGER) ? null : Number(v); }
  function centavos(v) {
    if (!['number', 'string'].includes(typeof v) || !/^-?\d+(?:\.\d+)?$/.test(String(v).trim())) return null;
    const s = String(v).trim(), neg = s[0] === '-', parts = (neg ? s.slice(1) : s).split('.'), frac = parts[1] || '';
    let n = BigInt(parts[0]) * 100n + BigInt((frac + '00').slice(0, 2));
    if (frac.length > 2 && frac[2] >= '5') n++;
    if (neg) n = -n;
    return n > BigInt(Number.MAX_SAFE_INTEGER) || n < BigInt(Number.MIN_SAFE_INTEGER) ? null : Number(n);
  }
  function dataCivil(v) {
    if (v == null) return true;
    if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
    const [y, m, d] = v.split('-').map(Number), leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
    return y > 0 && m >= 1 && m <= 12 && d >= 1 && d <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  }
  function validarResumo(value, company) {
    if (!id(company) || !object(value) || value.company_id !== company ||
        (value.status != null && value.status !== 'confirmada') || !Array.isArray(value.planos)) throw new Error('Resumo do plano não confirmado para esta empresa.');
    const obras = new Set(), planos = new Set(), parcelasGlobais = new Set();
    const rows = value.planos.map(p => {
      if (!object(p) || (p.company_id != null && p.company_id !== company) || !id(p.obra_id) || !id(p.plano_id) || obras.has(p.obra_id) || planos.has(p.plano_id) ||
          p.stage !== 'confirmed' || !safe(p.revisao) || p.revisao < 1 ||
          !['original_centavos', 'total_centavos', 'cancelado_centavos'].every(k => safe(p[k]) && p[k] >= 0) ||
          !safe(p.unlinked_centavos) || p.unlinked_centavos < 0 || !safe(p.saldo_centavos) || p.saldo_centavos < 0 ||
          typeof p.pendencia_conciliacao !== 'boolean' || !Array.isArray(p.parcelas)) throw new Error('Plano aprovado inválido.');
      obras.add(p.obra_id); planos.add(p.plano_id);
      const parcelas = new Set();
      const ps = p.parcelas.map(r => {
        if (!object(r) || (r.company_id != null && r.company_id !== company) || !id(r.id) || parcelas.has(r.id) || parcelasGlobais.has(r.id) || typeof r.label !== 'string' || !r.label.trim() ||
            !dataCivil(r.due) || typeof r.method !== 'string' || !safe(r.remaining) || r.remaining < 0) throw new Error('Parcela aprovada inválida.');
        parcelas.add(r.id); parcelasGlobais.add(r.id);
        return { id: r.id, label: r.label, due: r.due == null ? null : r.due, method: r.method, remaining: r.remaining };
      });
      const pendente = ps.reduce((s, r) => s == null ? null : soma(s, r.remaining), 0);
      if (pendente == null || pendente > p.total_centavos) throw new Error('Saldo das parcelas inválido.');
      return { obra_id: p.obra_id, plano_id: p.plano_id, revisao: p.revisao, stage: p.stage,
        original_centavos: p.original_centavos, total_centavos: p.total_centavos,
        cancelado_centavos: p.cancelado_centavos, unlinked_centavos: p.unlinked_centavos,
        saldo_centavos: p.saldo_centavos, pendencia_conciliacao: p.pendencia_conciliacao, parcelas: ps };
    });
    return congelar({ status: 'confirmada', company_id: company, planos: rows });
  }
  function projetar(obra, resumo) {
    const unknown = { status: 'indisponivel', originalCentavos: null, ajusteCentavos: null, totalCentavos: null,
      carteiraOriginalCentavos: null, carteiraCentavos: null, canceladoCentavos: null, planoId: null, revisao: null, parcelas: null };
    if (!object(obra)) return unknown;
    const company = obra.company_id || resumo?.company_id;
    let s;
    try { s = validarResumo(resumo, company); } catch (_) { return unknown; }
    if (!id(String(obra.id || '')) || (obra.company_id && obra.company_id !== s.company_id)) return unknown;
    const p = s.planos.find(p => p.obra_id === String(obra.id));
    const original = p ? p.original_centavos : centavos(obra.contrato_entrada == null ? 0 : obra.contrato_entrada);
    const total = p ? p.total_centavos : original, carteiraOriginal = centavos(obra.valor_venda);
    const ajuste = safe(original) && safe(total) ? soma(total, -original) : null;
    const carteira = safe(carteiraOriginal) && safe(ajuste) ? soma(carteiraOriginal, ajuste) : null;
    return { status: safe(total) && safe(original) && safe(ajuste) ? 'confirmada' : 'indisponivel',
      originalCentavos: original, ajusteCentavos: ajuste, totalCentavos: total,
      carteiraOriginalCentavos: carteiraOriginal, carteiraCentavos: carteira,
      canceladoCentavos: p ? p.cancelado_centavos : 0, planoId: p ? p.plano_id : null,
      revisao: p ? p.revisao : null, parcelas: p ? p.parcelas : [],
      pendenciaConciliacao: p ? p.pendencia_conciliacao : false, saldoCentavos: p ? p.saldo_centavos : null,
      semVinculoCentavos: p ? p.unlinked_centavos : 0 };
  }
  function previstas(resumo, company, avulsas) {
    let s;
    try { s = validarResumo(resumo, company); } catch (_) { return { status: 'indisponivel', parcelas: null, avulsas: null, substituidas: null }; }
    if (avulsas != null && (!Array.isArray(avulsas) || avulsas.some(p => !object(p) || (p.company_id && p.company_id !== company)))) return { status: 'indisponivel', parcelas: null, avulsas: null, substituidas: null };
    const obraIds = new Set(s.planos.map(p => p.obra_id));
    const lista = avulsas || [], substituida = p => p.tipo === 'entrada_cliente' && obraIds.has(String(p.obra_id));
    const parcelas = s.planos.filter(p => !p.pendencia_conciliacao).flatMap(p => p.parcelas.filter(r => r.remaining > 0).map(r => ({
      id: r.id, obra_id: p.obra_id, plano_id: p.plano_id, revisao: p.revisao,
      descricao: r.label, data_prevista: r.due, forma: r.method, valor_centavos: r.remaining,
      origem: 'plano_entrada', editavel: false
    }))).sort((a, b) => (a.data_prevista || '9999').localeCompare(b.data_prevista || '9999') || a.id.localeCompare(b.id));
    return { status: 'confirmada', parcelas, conciliacao: s.planos.filter(p => p.pendencia_conciliacao).map(p => ({ obra_id: p.obra_id, plano_id: p.plano_id, saldo_centavos: p.saldo_centavos, unlinked_centavos: p.unlinked_centavos })), avulsas: lista.filter(p => !substituida(p)), substituidas: lista.filter(substituida) };
  }
  function identidade() {
    const company = typeof _companyId !== 'undefined' ? _companyId : null;
    const ator = typeof usuarioAtual !== 'undefined' ? usuarioAtual : null;
    const autenticado = typeof _supabaseToken !== 'undefined' && !!_supabaseToken;
    return autenticado && id(company) && id(ator?.id) ? { company_id: company, ator_id: ator.id, perfil: ator.perfil } : null;
  }
  function mesma(a, b) { return !!a && !!b && a.company_id === b.company_id && a.ator_id === b.ator_id && a.perfil === b.perfil; }
  let cache = null, dono = null, revisao = 0, pendente = null;
  function invalidar() { ++revisao; cache = null; dono = null; pendente = null; }
  function atual() { if (!mesma(dono, identidade())) { cache = null; dono = null; } return cache; }
  function publicar(resumo, ident) {
    const atualIdent = identidade();
    if (!mesma(ident, atualIdent)) return null;
    try { cache = validarResumo(resumo, ident.company_id); dono = { ...ident }; return cache; }
    catch (_) { cache = null; dono = null; return null; }
  }
  async function carregar() {
    const ident = identidade();
    if (!ident) { invalidar(); return null; }
    if (pendente && mesma(pendente.ident, ident)) return pendente.promise;
    const versao = ++revisao;
    cache = null; dono = null;
    const pedido = { ident, promise: null };
    pedido.promise = (async () => {
      try {
        if (typeof sbRpcEstoque !== 'function') return null;
        const r = await sbRpcEstoque('entrada_plano_resumo', {});
        if (versao !== revisao || !mesma(ident, identidade()) || !r?.ok) return null;
        return publicar(r.dados, ident);
      } catch (_) { return null; }
    })();
    pendente = pedido;
    try { return await pedido.promise; } finally { if (pendente === pedido) pendente = null; }
  }
  return Object.freeze({ validarResumo, projetar, previstas, centavos, carregar, publicar, atual, invalidar });
});