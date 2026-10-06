/*
 * Composicao conciliavel dos cartoes por obra, somente leitura.
 * API: FinanceiroVisaoComposicao.construir(contexto, obraId).
 * Recebimentos, custos, categorias e resultado usam centavos por origem,
 * a mesma regra de FinanceiroVisaoModelo. Nenhum credito de arredondamento.
 * O resultado principal inclui todos os lancamentos e recebimentos elegiveis
 * do modelo no mesmo periodo. Nao e saldo em conta nem lucro final da obra.
 * A margem da construcao conserva a classificacao/elegibilidade da DRE,
 * mas este detalhe tambem soma centavos por origem. O engine DRE nao muda.
 * Mao de obra por m2 e acumulada, usa somente etapa 28_mao e a area real.
 * Folha utiliza apenas o diagnostico agregado ja recebido no envelope:
 * nao consulta nem devolve registros ou valores individuais de funcionarios.
 */
(function (root, factory) {
  'use strict';
  const modelo = typeof module === 'object' && module.exports
    ? require('./edr-v2-visao-financeira-modelo.js') : root && root.FinanceiroVisaoModelo;
  const api = factory(modelo);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FinanceiroVisaoComposicao = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (modelo) {
  'use strict';
  const CATEGORIAS = [
    ['mao', 'Mão de obra'], ['material_servicos', 'Materiais e serviços'],
    ['impostos', 'Impostos'], ['expediente', 'Expediente'],
    ['alimentacao', 'Alimentação'], ['combustivel', 'Combustível'],
    ['limpeza', 'Limpeza'], ['tecnologia', 'Tecnologia'], ['terreno', 'Terreno']
  ];
  const POR_ETAPA = {
    '28_mao': 'mao', '24_imposto': 'impostos', '14_expediente': 'expediente',
    '03_alimentacao': 'alimentacao', '07_combustivel': 'combustivel',
    '25_limpeza': 'limpeza', '34_tecnologia': 'tecnologia', '35_terreno': 'terreno'
  };
  const AVISO_RESULTADO = 'Não representa saldo em conta nem lucro final da obra.';
  const AVISO_MAO = 'Mão de obra lançada / m² é parcial conforme o avanço da obra; considera somente custos já lançados.';
  const objeto = v => !!v && typeof v === 'object' && !Array.isArray(v);
  const id = v => v == null ? '' : String(v);
  const inteiro = v => Number.isSafeInteger(v) ? v : null;
  function empresa(s) {
    const c = s && (s.companyId || s.company_id);
    return typeof c === 'string' && c.trim() &&
      !(s.companyId && s.company_id && s.companyId !== s.company_id) ? c : null;
  }
  function soma(vs) {
    if (!Array.isArray(vs) || vs.some(v => inteiro(v) == null)) return null;
    const n = vs.reduce((a, v) => a + BigInt(v), 0n);
    return n > BigInt(Number.MAX_SAFE_INTEGER) || n < BigInt(Number.MIN_SAFE_INTEGER) ? null : Number(n);
  }
  const diferenca = (a, b) => inteiro(a) == null || inteiro(b) == null ? null : soma([a, -b]);
  function percentual(v, base) {
    return inteiro(v) != null && inteiro(base) != null && base > 0 ? v / base * 100 : null;
  }
  function congelar(v) {
    if (v && typeof v === 'object') {
      Object.values(v).forEach(congelar);
      Object.freeze(v);
    }
    return v;
  }
  function fonte(s, nome, companyId) {
    const d = s.fontes && s.fontes[nome];
    const status = objeto(d) ? d.status : d;
    const rows = s[nome];
    if (status !== 'confirmada' || !Array.isArray(rows)) return null;
    const vistos = new Set();
    for (const r of rows) {
      if (!objeto(r) || r.company_id !== companyId || !id(r.id) || vistos.has(id(r.id))) return null;
      vistos.add(id(r.id));
    }
    return rows;
  }
  function dataCivil(data) {
    if (typeof data !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return false;
    const [a, m, d] = data.split('-').map(Number);
    const dias = [31, a % 4 === 0 && (a % 100 !== 0 || a % 400 === 0) ? 29 : 28,
      31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return m >= 1 && m <= 12 && d >= 1 && d <= dias[m - 1];
  }
  function noPeriodo(rows, campoData, periodo) {
    if (!rows) return null;
    if (!periodo) return rows;
    // Sem data civil valida nao ha prova de inclusao ou exclusao do mes.
    // No acumulado nao se inventa data: preserva-se a soma do modelo.
    if (rows.some(r => !dataCivil(r[campoData]))) return null;
    return rows.filter(r => r[campoData].startsWith(periodo));
  }
  function mesmaSelecao(a, b) {
    return a.periodo === b.periodo && a.obraId === b.obraId && a.situacao === b.situacao;
  }
  function entrada(ctx, obraId) {
    if (!modelo || typeof modelo.centavos !== 'function' || typeof modelo.normalizarFiltro !== 'function' ||
        !objeto(ctx) || !objeto(ctx.snapshot) || !objeto(ctx.visao) || !Array.isArray(ctx.visao.obras)) return null;
    const s = ctx.snapshot, companyId = empresa(s), oid = id(obraId);
    if (!companyId || empresa(ctx.visao) !== companyId || !oid ||
        (s.perfil != null && s.perfil !== 'admin')) return null;
    if (ctx.envelope && (ctx.envelope.fase !== 'pronta' || empresa(ctx.envelope.snapshot) !== companyId)) return null;
    let filtro;
    try {
      filtro = modelo.normalizarFiltro(ctx.filtro);
      if (!objeto(ctx.visao.filtro) || !mesmaSelecao(filtro, modelo.normalizarFiltro(ctx.visao.filtro))) return null;
    } catch (_) { return null; }
    if (filtro.obraId && filtro.obraId !== oid) return null;
    const obras = fonte(s, 'obras', companyId);
    if (!obras) return null;
    const obra = obras.find(o => id(o.id) === oid);
    const selecionadas = ctx.visao.obras.filter(o => objeto(o) && id(o.id) === oid);
    if (!obra || selecionadas.length !== 1 ||
        (selecionadas[0].company_id != null && selecionadas[0].company_id !== companyId) ||
        (filtro.situacao !== 'todas' && !!obra.arquivada !== (filtro.situacao === 'arquivadas'))) return null;
    const internas = new Set((Array.isArray(s.obrasInternas) ? s.obrasInternas
      : Array.isArray(s.OBRAS_INTERNAS) ? s.OBRAS_INTERNAS : []).map(id));
    const nome = String(obra.nome || '').toUpperCase();
    if (internas.has(oid) || /^OBRA QA/.test(nome) || nome.includes('ESCRIT') || nome.includes('ALMOX')) return null;
    return { s, companyId, oid, obra, filtro, linhaModelo: selecionadas[0] };
  }
  function linha(r, fonteNome, tipo, campoValor, campoData, categoria) {
    const valor = modelo.centavos(r[campoValor]);
    return {
      id: id(r.id), fonte: fonteNome, tipo, categoria,
      etapa: tipo === 'custo' ? String(r.etapa || '').trim() : '',
      data: typeof r[campoData] === 'string' ? r[campoData] : '',
      valorCentavos: valor,
      efeitoCentavos: valor == null ? null : tipo === 'custo' ? (valor === 0 ? 0 : -valor) : valor
    };
  }
  function categorias(linhas) {
    return CATEGORIAS.map(([categoria, label]) => {
      if (!linhas) return { id: categoria, label, centavos: null, quantidade: null, etapas: [] };
      const rows = linhas.filter(l => l.categoria === categoria);
      const etapas = new Map();
      for (const r of rows) etapas.set(r.etapa, (etapas.get(r.etapa) || []).concat(r));
      return { id: categoria, label, centavos: soma(rows.map(l => l.valorCentavos)), quantidade: rows.length,
        etapas: [...etapas].sort(([a], [b]) => a.localeCompare(b)).map(([etapa, itens]) => ({
          id: etapa, centavos: soma(itens.map(l => l.valorCentavos)), quantidade: itens.length
        })) };
    });
  }
  function receitas(e) {
    const { s, companyId, oid, filtro } = e;
    const repasses = fonte(s, 'repasses', companyId);
    const reps = noPeriodo(repasses && repasses.filter(r => id(r.obra_id) === oid), 'data_credito', filtro.periodo);
    const adds = fonte(s, 'adicionais', companyId);
    const pagamentos = fonte(s, 'pagamentosAdicionais', companyId);
    const daObra = adds && adds.filter(a => id(a.obra_id) === oid);
    const idsTodos = daObra && new Set(daObra.map(a => id(a.id)));
    const idsElegiveis = daObra && new Set(daObra.filter(a => a.status !== 'pendente' && a.status !== 'cancelado').map(a => id(a.id)));
    const pgtosTodos = noPeriodo(idsTodos && pagamentos && pagamentos.filter(p => idsTodos.has(id(p.adicional_id))), 'data', filtro.periodo);
    const pgtos = noPeriodo(idsElegiveis && pagamentos && pagamentos.filter(p => idsElegiveis.has(id(p.adicional_id))), 'data', filtro.periodo);
    const linhasContrato = reps && reps.map(r => linha(r, 'repasses', 'recebimento', 'valor', 'data_credito',
      r.tipo === 'terreno' ? 'recebimento_terreno' : 'recebimento_contrato'));
    const linhasAdicionais = pgtos && pgtos.map(r => linha(r, 'pagamentosAdicionais', 'recebimento', 'valor', 'data', 'recebimento_adicional'));
    const contrato = linhasContrato ? soma(linhasContrato.map(l => l.valorCentavos)) : null;
    const adicionais = linhasAdicionais ? soma(linhasAdicionais.map(l => l.valorCentavos)) : null;
    const terreno = linhasContrato ? soma(linhasContrato.filter(l => l.categoria === 'recebimento_terreno').map(l => l.valorCentavos)) : null;
    const todosAdicionais = pgtosTodos ? soma(pgtosTodos.map(p => modelo.centavos(p.valor))) : null;
    const foraCarteira = pgtosTodos && idsElegiveis
      ? soma(pgtosTodos.filter(p => !idsElegiveis.has(id(p.adicional_id))).map(p => modelo.centavos(p.valor))) : null;
    return {
      contratoCentavos: contrato, adicionaisCentavos: adicionais, terrenoCentavos: terreno,
      recebidoCentavos: soma([contrato, adicionais]),
      construcaoCentavos: soma([diferenca(contrato, terreno), todosAdicionais]),
      adicionaisForaCarteiraCentavos: foraCarteira,
      linhas: linhasContrato && linhasAdicionais ? linhasContrato.concat(linhasAdicionais) : null
    };
  }
  function area(v) {
    if (!['number', 'string'].includes(typeof v) || String(v).trim() === '') return null;
    const texto = String(v).trim(), n = Number(texto);
    if (!Number.isFinite(n) || n <= 0) return null;
    const m = /^\+?(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/.exec(texto);
    if (!m) return null;
    const fracao = m[2] || m[3] || '', expoente = Number(m[4] || 0) - fracao.length;
    let numerador = BigInt((m[1] || '0') + fracao), denominador = 1n;
    if (expoente >= 0) numerador *= 10n ** BigInt(expoente);
    else denominador = 10n ** BigInt(-expoente);
    return numerador > 0n ? { valor: n, numerador, denominador } : null;
  }
  function porMetro(valor, m2) {
    if (inteiro(valor) == null || m2 == null) return null;
    const origem = BigInt(valor), negativo = origem < 0n;
    const dividendo = (negativo ? -origem : origem) * m2.denominador;
    let n = dividendo / m2.numerador;
    if (dividendo % m2.numerador * 2n >= m2.numerador) n += 1n;
    if (negativo) n = -n;
    return n > BigInt(Number.MAX_SAFE_INTEGER) || n < BigInt(Number.MIN_SAFE_INTEGER) ? null : Number(n);
  }
  function diagnosticoFolha(ctx, e) {
    const f = ctx.envelope && ctx.envelope.folha;
    const avisos = [AVISO_MAO];
    let estado = 'nao_avaliado', cobertura = 'indisponivel', pendenciaConfirmada = false;
    let filtroConfirmado = false;
    if (objeto(f) && objeto(f.filtro)) {
      try { filtroConfirmado = mesmaSelecao(modelo.normalizarFiltro(f.filtro), e.filtro); } catch (_) { /* desconhecido */ }
    }
    if (objeto(f) && empresa(f) === e.companyId && filtroConfirmado && Array.isArray(f.obras)) {
      const o = f.obras.find(r => objeto(r) && id(r.obraId || r.id) === e.oid);
      if (o) {
        pendenciaConfirmada = Array.isArray(o.motivos) && o.motivos.some(m => objeto(m) && m.severidade === 'pendencia');
        if (!e.filtro.periodo && ['confirmada', 'parcial', 'indisponivel'].includes(o.cobertura) &&
            ['pendencia_identificada', 'sem_pendencia_identificada', 'nao_avaliado'].includes(o.estado)) {
          estado = o.estado; cobertura = o.cobertura;
        } else if (e.filtro.periodo) cobertura = 'parcial';
      }
    }
    if (pendenciaConfirmada) avisos.push('Há pendência de folha identificada. O indicador considera somente mão de obra já lançada.');
    if (e.filtro.periodo) avisos.push('O diagnóstico de folha deste mês não confirma a cobertura do indicador acumulado.');
    else if (estado === 'nao_avaliado' || cobertura !== 'confirmada') avisos.push('O diagnóstico de folha não foi confirmado integralmente; não é possível afirmar que toda a mão de obra está lançada.');
    else avisos.push('A consulta de registros não comprova a cobertura de todos os dias nem pagamento da folha.');
    return { estado, cobertura, pendenciaConfirmada, avisos };
  }
  function construir(ctx, obraId) {
    const e = entrada(ctx, obraId);
    if (!e) return null;
    const { s, companyId, oid, obra, filtro, linhaModelo } = e;
    const fonteLancamentos = fonte(s, 'lancamentos', companyId);
    const acumulados = fonteLancamentos && fonteLancamentos.filter(l => id(l.obra_id) === oid);
    const lancamentos = noPeriodo(acumulados, 'data', filtro.periodo);
    const linhasCustos = lancamentos && lancamentos.map(l => linha(l, 'lancamentos', 'custo', 'total', 'data',
      POR_ETAPA[String(l.etapa || '').trim()] || 'material_servicos'));
    const cats = categorias(linhasCustos);
    const r = receitas(e);
    const custo = linhasCustos ? soma(linhasCustos.map(l => l.valorCentavos)) : null;
    let recebido = r.recebidoCentavos, resultado = diferenca(recebido, custo), custoPrincipal = custo;
    const avisos = [AVISO_RESULTADO];
    // Evita apresentar uma composicao confirmada para um cartao obsoleto.
    if ((recebido != null && recebido !== linhaModelo.recebidoPeriodoCentavos) ||
        (custo != null && custo !== linhaModelo.custoPeriodoCentavos) ||
        (resultado != null && resultado !== linhaModelo.diferencaRecebidoCustoCentavos)) {
      recebido = custoPrincipal = resultado = null;
      avisos.push('Os totais e as origens desta leitura não são consistentes. Atualize a consulta.');
    }
    const custoConstrucao = soma(cats.filter(c => c.id === 'mao' || c.id === 'material_servicos').map(c => c.centavos));
    const resultadoConstrucao = diferenca(r.construcaoCentavos, custoConstrucao);
    const engine = linhaModelo.dre && linhaModelo.dre.status === 'confirmada' && objeto(linhaModelo.dre.dados)
      ? modelo.centavos(linhaModelo.dre.dados.margem) : null;
    const maoRows = acumulados && acumulados.filter(l => String(l.etapa || '').trim() === '28_mao')
      .map(l => linha(l, 'lancamentos', 'custo', 'total', 'data', 'mao'));
    const mao = maoRows ? soma(maoRows.map(l => l.valorCentavos)) : null;
    const m2 = area(obra.area_m2);
    const folha = diagnosticoFolha(ctx, e);
    const status = recebido != null && custoPrincipal != null && resultado != null ? 'confirmada'
      : recebido != null || custoPrincipal != null ? 'parcial' : 'indisponivel';
    return congelar({
      status, obraId: oid, periodo: filtro.periodo,
      recebidoCentavos: recebido, custoCentavos: custoPrincipal, resultadoCentavos: resultado,
      resultadoPct: percentual(resultado, recebido),
      receitas: { contratoCentavos: r.contratoCentavos, adicionaisCentavos: r.adicionaisCentavos,
        terrenoCentavos: r.terrenoCentavos },
      categorias: cats, linhas: r.linhas && linhasCustos ? r.linhas.concat(linhasCustos) : [],
      margemConstrucao: {
        recebidoCentavos: r.construcaoCentavos, custoCentavos: custoConstrucao,
        resultadoCentavos: resultadoConstrucao, resultadoPct: percentual(resultadoConstrucao, r.construcaoCentavos),
        exclusoes: cats.filter(c => c.id !== 'mao' && c.id !== 'material_servicos' && c.quantidade > 0),
        recebimentoTerrenoCentavos: r.terrenoCentavos,
        adicionaisForaCarteiraCentavos: r.adicionaisForaCarteiraCentavos,
        engineResultadoCentavos: engine,
        diferencaArredondamentoCentavos: diferenca(resultadoConstrucao, engine)
      },
      acumulado: { maoCentavos: mao, areaM2: m2 && m2.valor, maoPorM2Centavos: porMetro(mao, m2),
        linhasMao: maoRows || [], statusFolha: folha.estado, folha },
      avisos
    });
  }
  return Object.freeze({ construir });
});
