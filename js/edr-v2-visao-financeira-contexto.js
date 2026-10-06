/*
 * Contexto imutavel de apresentacao, sem DOM, rede, caches ou escrita.
 * API: FinanceiroVisaoContexto.construir(envelope).
 * Somente fase "pronta" com snapshot/visao/filtro da mesma empresa e selecao.
 * Os agregados exigem fontes explicitamente confirmadas pelo loader.
 * Outras fases ou envelope inconsistente devolvem null.
 *
 * custoDre usa resultados confirmados do mesmo engine: cMao + cMat.
 * Obrigações sao atuais das obras selecionadas, sem filtro de vencimento
 * pelo mes e sem ratear despesas gerais. Valores restantes vem da RPC.
 * Ledger mostra movimentos efetivos da empresa no periodo, sem distribuir
 * por obra nem reconstruir saldo atual. Transferencia vinculada permanece
 * na lista, mas fica fora dos totais de entrada/saida.
 * O corte/afeta_saldo ja vem da fonte. Metadados do marco delimitam cobertura
 * temporal; um mes anterior a todos os marcos nao recebe zero confirmado.
 */
(function (root, factory) {
  'use strict';
  const modelo = typeof module === 'object' && module.exports
    ? require('./edr-v2-visao-financeira-modelo.js') : root && root.FinanceiroVisaoModelo;
  const api = factory(modelo);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FinanceiroVisaoContexto = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (modelo) {
  'use strict';
  const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const TIPOS = ['entrada', 'saida', 'pagamento', 'transferencia', 'transferencia_in', 'transferencia_out'];
  function objeto(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function id(v) { return v == null ? '' : String(v); }
  function confirmada(status) { return status === 'confirmada' || status === 'confirmado'; }
  function declarada(s, nome) {
    const d = s.fontes && s.fontes[nome];
    return objeto(d) ? d.status : d;
  }
  function fonteArray(s, nome, companyId) {
    const d = declarada(s, nome);
    const a = s[nome];
    return confirmada(d) && Array.isArray(a) &&
      a.every(r => objeto(r) && r.company_id === companyId) ? a : null;
  }
  function soma(valores) {
    if (!Array.isArray(valores) || valores.some(v => !Number.isSafeInteger(v))) return null;
    let n = 0n;
    for (const v of valores) n += BigInt(v);
    return n > BigInt(Number.MAX_SAFE_INTEGER) || n < BigInt(Number.MIN_SAFE_INTEGER) ? null : Number(n);
  }
  function dataCivil(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const [a, m, d] = s.split('-').map(Number);
    const dias = [31, a % 4 === 0 && (a % 100 !== 0 || a % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return m >= 1 && m <= 12 && d >= 1 && d <= dias[m - 1];
  }
  function mesmoFiltro(a, b) {
    return a.periodo === b.periodo && a.obraId === b.obraId && a.situacao === b.situacao;
  }
  function copiar(v, vistos, pais) {
    if (v == null || ['string', 'boolean', 'number', 'undefined', 'function'].includes(typeof v)) return v;
    if (typeof v !== 'object' || (!Array.isArray(v) && Object.prototype.toString.call(v) !== '[object Object]') || pais.has(v)) throw new TypeError('Contexto deve conter dados simples sem ciclos.');
    if (vistos.has(v)) return vistos.get(v);
    const c = Array.isArray(v) ? [] : {};
    vistos.set(v, c); pais.add(v);
    for (const [k, valor] of Object.entries(v)) c[k] = copiar(valor, vistos, pais);
    pais.delete(v);
    return Object.freeze(c);
  }
  function ledgerConfirmado(s, companyId) {
    const l = s.ledger;
    if (!objeto(l) || !confirmada(l.status) || !confirmada(declarada(s, 'ledger'))) return null;
    const e = l.estado || l.dados;
    return objeto(e) && e.company_id === companyId && Array.isArray(e.contas) &&
      Array.isArray(e.movimentos) && Array.isArray(e.pagamentos) ? e : null;
  }
  function custoDre(s, v) {
    const r = { status: 'indisponivel', escopo: 'obras_selecionadas_periodo',
      maoCentavos: null, materialServicosCentavos: null, totalCentavos: null };
    if (!confirmada(s.dre && s.dre.status) ||
        !confirmada(declarada(s, 'dre')) ||
        !Array.isArray(v.obras) || !fonteArray(s, 'obras', s.companyId || s.company_id)) return r;
    const mao = [], mat = [];
    for (const o of v.obras) {
      const d = o.dre;
      if (!objeto(d) || !confirmada(d.status) || !objeto(d.dados)) {
        mao.push(null); mat.push(null); continue;
      }
      mao.push(modelo.centavos(d.dados.cMao));
      mat.push(modelo.centavos(d.dados.cMat));
    }
    r.maoCentavos = soma(mao);
    r.materialServicosCentavos = soma(mat);
    r.totalCentavos = soma([r.maoCentavos, r.materialServicosCentavos]);
    r.status = r.totalCentavos != null ? 'confirmada'
      : r.maoCentavos != null || r.materialServicosCentavos != null ? 'parcial' : 'indisponivel';
    return r;
  }
  function obrigacoes(s, v, e, companyId) {
    const r = { status: 'indisponivel', escopo: 'obras_selecionadas_atual', totalCentavos: null, rows: null };
    const contas = fonteArray(s, 'contasPagar', companyId);
    if (!contas || !e || !Array.isArray(v.obras) || !fonteArray(s, 'obras', companyId)) return r;
    const pagamentos = new Map();
    for (const p of e.pagamentos) {
      if (!objeto(p) || !id(p.conta_pagar_id) || pagamentos.has(id(p.conta_pagar_id)) ||
          !Number.isSafeInteger(p.restante_centavos) || p.restante_centavos < 0 ||
          !Number.isSafeInteger(p.pago_centavos) || p.pago_centavos < 0) return r;
      pagamentos.set(id(p.conta_pagar_id), p);
    }
    const selecionadas = new Set(v.obras.map(o => id(o.id)));
    const rows = [], ids = new Set();
    for (const c of contas) {
      if (!id(c.id) || ids.has(id(c.id))) return r;
      ids.add(id(c.id));
      if (!selecionadas.has(id(c.obra_id)) || String(c.tipo || '').startsWith('reembolso')) continue;
      const p = pagamentos.get(id(c.id));
      if (!p) return r;
      // CP e RPC sao consultas independentes. Cancelamento entre leituras pode
      // deixar status antigo fechado com restante atual positivo: nao afirmar zero.
      if (['pago', 'cancelado'].includes(c.status)) {
        if (p.restante_centavos > 0) return r;
        continue;
      }
      if (p.restante_centavos > 0) rows.push({ ...c,
        restanteCentavos: p.restante_centavos, pagoCentavos: p.pago_centavos,
        restante_centavos: p.restante_centavos, pago_centavos: p.pago_centavos });
    }
    const total = soma(rows.map(c => c.restanteCentavos));
    if (total == null) return r;
    return { ...r, status: 'confirmada', totalCentavos: total, rows };
  }
  function marcoCivil(c) {
    if (!objeto(c) || typeof c.corte_em !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(c.corte_em) || typeof c.fuso !== 'string') return null;
    const instante = new Date(c.corte_em);
    if (!Number.isFinite(instante.getTime())) return null;
    try {
      const partes = new Intl.DateTimeFormat('en-CA', { timeZone: c.fuso,
        year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(instante);
      const p = Object.fromEntries(partes.map(x => [x.type, x.value]));
      const data = p.year + '-' + p.month + '-' + p.day;
      return dataCivil(data) ? { contaId: id(c.id), data, corteEm: c.corte_em, fuso: c.fuso } : null;
    } catch (_) { return null; }
  }
  function movimentos(e, f) {
    const r = { status: 'indisponivel', escopo: 'empresa_periodo_prospectivo',
      movimentos: null, entradasCentavos: null, saidasCentavos: null, variacaoCentavos: null,
      coberturaTemporal: 'nao_avaliada', marcos: [] };
    if (!e) return r;
    if (!e.contas.length) return { ...r, status: 'sem_abertura' };
    const marcos = e.contas.map(marcoCivil);
    if (marcos.some(m => !m)) return r;
    r.marcos = marcos;
    if (f.periodo && marcos.every(m => m.data.slice(0, 7) > f.periodo)) {
      return { ...r, coberturaTemporal: 'anterior_aos_marcos' };
    }
    r.coberturaTemporal = !f.periodo ? 'desde_marcos_declarados'
      : marcos.every(m => m.data < f.periodo + '-01') ? 'confirmada' : 'parcial';
    const rows = [], entradas = [], saidas = [], ids = new Set();
    for (const m of e.movimentos) {
      if (!objeto(m) || !id(m.id) || ids.has(id(m.id)) || typeof m.afeta_saldo !== 'boolean') return r;
      ids.add(id(m.id));
      if (!m.afeta_saldo || m.cancelado_em != null || m.cancelado === true) continue;
      if (!dataCivil(m.data_efetiva) || !TIPOS.includes(m.tipo) ||
          !Number.isSafeInteger(m.valor_centavos) || m.valor_centavos <= 0 ||
          (m.company_id != null && m.company_id !== e.company_id) ||
          m.decisao_corte === 'incluido_abertura' ||
          (m.tipo === 'transferencia' && (!id(m.conta_id) || !id(m.destino_id) || id(m.conta_id) === id(m.destino_id)))) return r;
      if (f.periodo && !m.data_efetiva.startsWith(f.periodo)) continue;
      rows.push(m);
      if (m.tipo === 'entrada') entradas.push(m.valor_centavos);
      else if (m.tipo === 'saida' || m.tipo === 'pagamento') saidas.push(m.valor_centavos);
    }
    const entrada = soma(entradas), saida = soma(saidas);
    const variacao = entrada == null || saida == null ? null : soma([entrada, -saida]);
    if (variacao == null) return r;
    return { ...r, status: 'confirmada', movimentos: rows,
      entradasCentavos: entrada, saidasCentavos: saida, variacaoCentavos: variacao };
  }
  function construir(envelope) {
    if (!objeto(envelope) || envelope.fase !== 'pronta' || !modelo ||
        typeof modelo.construir !== 'function' || typeof modelo.normalizarFiltro !== 'function' ||
        typeof modelo.centavos !== 'function' || !objeto(envelope.snapshot) || !objeto(envelope.visao)) return null;
    const s = envelope.snapshot, v = envelope.visao;
    const companyId = s.companyId || s.company_id;
    if (typeof companyId !== 'string' || !companyId.trim() ||
        (s.companyId && s.company_id && s.companyId !== s.company_id) ||
        v.companyId !== companyId || !Array.isArray(v.obras) || !objeto(v.totais)) return null;
    try {
      const f = modelo.normalizarFiltro(envelope.filtro);
      if (!objeto(v.filtro) || !mesmoFiltro(f, modelo.normalizarFiltro(v.filtro))) return null;
      const e = ledgerConfirmado(s, companyId);
      const contexto = {
        envelope, visao: v, snapshot: s, filtro: f, folha: envelope.folha || null,
        obras: v.obras, totais: v.totais,
        acumulada: modelo.construir(s, { ...f, periodo: '' }),
        custoDre: custoDre(s, v), obrigacoes: obrigacoes(s, v, e, companyId),
        ledger: movimentos(e, f),
        periodoNome: f.periodo ? MESES[Number(f.periodo.slice(5, 7)) - 1] + ' de ' + f.periodo.slice(0, 4) : 'Acumulado'
      };
      return copiar(contexto, new Map(), new Set());
    } catch (_) { return null; }
  }
  return Object.freeze({ construir });
});
