/*
 * Origem dos numeros financeiros, somente leitura, sem DOM/rede/persistencia.
 * construir(key, ctx, {esc,money,nButton?,icon?}, workId='') devolve os dados
 * do drawer. extra e HTML escapado; rows sao dados para o renderer escapar.
 * Um detalhe por obra reconstroi modelo e contexto com o mesmo filtro comum.
 */
(function (root, factory) {
  'use strict';
  const common = typeof module === 'object' && module.exports;
  const modelo = common ? require('./edr-v2-visao-financeira-modelo.js') : root.FinanceiroVisaoModelo;
  const folha = common ? require('./edr-v2-visao-financeira-folha.js') : root.FinanceiroVisaoFolha;
  const contexto = () => common ? require('./edr-v2-visao-financeira-contexto.js') : root.FinanceiroVisaoContexto;
  const composicao = () => common ? require('./edr-v2-visao-financeira-composicao.js') : root.FinanceiroVisaoComposicao;
  const api = factory(modelo, folha, contexto, composicao);
  if (common) module.exports = api;
  if (root) root.FinanceiroVisaoDetalhes = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (modelo, folha, obterContexto, obterComposicao) {
  'use strict';
  const OPER = ['03_alimentacao', '07_combustivel', '14_expediente', '25_limpeza', '34_tecnologia'];
  const CAMPOS_DRE = {
    recBruta: ['Receita bruta das obras', 'Medicoes + entradas + recebimentos adicionais; terreno apartado.'],
    recMed: ['Medicoes e entradas', 'Soma dos repasses registrados, exceto terreno.'],
    recAdic: ['Recebimentos adicionais', 'Pagamentos vinculados aos adicionais, segundo o engine DRE.'],
    recTerr: ['Recebimento de terreno', 'Repasses classificados como terreno, em apartado.'],
    imposto: ['Imposto gerencial aplicado', 'Maior entre impostos lancados e estimativa de 6% da receita bruta.'],
    impostoReal: ['Impostos lancados', 'Soma dos lancamentos classificados em 24_imposto.'],
    dasEstimado: ['Estimativa vigente de impostos', '6% da receita bruta, conforme o engine DRE vigente.'],
    recLiq: ['Receita liquida gerencial', 'Receita bruta - imposto gerencial aplicado.'],
    custoObras: ['Custo das obras na DRE', 'Material e servicos + mao de obra.'],
    cMat: ['Material e servicos na DRE', 'Classificacao vigente; terreno, mao de obra, impostos e operacionais separados.'],
    cMao: ['Mao de obra reconhecida', 'Soma dos lancamentos classificados em 28_mao.'],
    cTerr: ['Custo de terreno', 'Lancamentos classificados em 35_terreno, em apartado.'],
    lucroBruto: ['Lucro bruto gerencial', 'Receita liquida gerencial - custo das obras.'],
    despOper: ['Despesas operacionais', 'Despesas operacionais lancadas + contas administrativas elegiveis.'],
    despOperReal: ['Despesas operacionais lancadas', 'Etapas operacionais vigentes; inclui estrutura e exclui obras QA.'],
    despAdmin: ['Contas administrativas elegiveis', 'Contas pagas sem obra, com elegibilidade e exclusoes de NF do engine DRE.'],
    resultado: ['Resultado liquido gerencial', 'Lucro bruto gerencial - despesas operacionais.'],
    recConstr: ['Receita da construcao nas obras selecionadas', 'Medicoes + entradas + adicionais; terreno apartado.'],
    custoConstr: ['Custo da construcao nas obras selecionadas', 'Material e servicos + mao de obra.'],
    margem: ['Resultado gerencial das obras selecionadas', 'Receita da construcao - custo da construcao, antes de impostos e administracao central.'],
    cDesp: ['Despesas classificadas da obra', 'Impostos e etapas operacionais, separados da contribuicao da construcao.'],
    resTerreno: ['Resultado de terreno', 'Recebimento de terreno - custo de terreno, em apartado.']
  };
  const SOMA_OBRAS = new Set(['recConstr', 'custoConstr', 'margem', 'cDesp', 'resTerreno']);
  const id = v => String(v == null ? '' : v);
  const inteiro = v => Number.isSafeInteger(v) ? v : null;
  const cents = v => modelo.centavos(v);
  function soma(vs) {
    if (vs.some(v => inteiro(v) == null)) return null;
    const total = vs.reduce((s, v) => s + BigInt(v), 0n);
    return total > BigInt(Number.MAX_SAFE_INTEGER) || total < BigInt(Number.MIN_SAFE_INTEGER) ? null : Number(total);
  }
  const subtrair = (a, b) => inteiro(a) == null || inteiro(b) == null ? null : soma([a, -b]);
  function areaValida(v) {
    if (!['number', 'string'].includes(typeof v) || String(v).trim() === '') return null;
    const area = Number(v);
    return Number.isFinite(area) && area > 0 ? area : null;
  }
  function empresa(v) { return v && (v.companyId || v.company_id); }
  function valido(ctx) {
    if (!ctx || !ctx.snapshot || !ctx.visao || !empresa(ctx.snapshot) || empresa(ctx.snapshot) !== empresa(ctx.visao) ||
        !Array.isArray(ctx.visao.obras) || !Array.isArray(ctx.snapshot.obras)) return false;
    if ((ctx.snapshot.companyId && ctx.snapshot.company_id && ctx.snapshot.companyId !== ctx.snapshot.company_id) ||
        (ctx.snapshot.perfil != null && ctx.snapshot.perfil !== 'admin')) return false;
    if (ctx.envelope && (ctx.envelope.fase !== 'pronta' || empresa(ctx.envelope.snapshot) !== empresa(ctx.snapshot))) return false;
    return ctx.visao.obras.every(o => ctx.snapshot.obras.some(s => id(s.id) === id(o.id) && (!s.company_id || s.company_id === empresa(ctx.snapshot))));
  }
  function fonte(ctx, nome) {
    const fs = ctx.snapshot.fontes && ctx.snapshot.fontes[nome];
    const status = fs && typeof fs === 'object' ? fs.status : fs;
    const rows = ctx.snapshot[nome];
    if ((status != null && status !== 'confirmada') || !Array.isArray(rows) ||
        rows.some(r => !r || typeof r !== 'object' || (r.company_id && r.company_id !== empresa(ctx.snapshot)))) return null;
    return rows;
  }
  function contextoObra(ctx, workId) {
    if (!workId) return ctx;
    if (!ctx.obras.some(o => id(o.id) === id(workId))) return null;
    const filtro = { ...ctx.filtro, obraId: id(workId) };
    const visao = modelo.construir(ctx.snapshot, filtro);
    if (!visao.obras.some(o => id(o.id) === id(workId))) return null;
    const api = obterContexto();
    if (!api || typeof api.construir !== 'function') return null;
    return api.construir({ ...ctx.envelope, fase: 'pronta', snapshot: ctx.snapshot, visao, filtro,
      folha: folha.avaliar(ctx.snapshot, filtro) });
  }
  function emPeriodo(data, per) { return !per || String(data || '').startsWith(per); }
  function etapa(l) {
    const e = String(l.etapa || '').trim();
    return e === '35_terreno' ? 'terreno' : e === '28_mao' ? 'mao'
      : e === '24_imposto' || OPER.includes(e) ? 'despesa' : 'material';
  }
  function nomes(ctx) { return new Map((fonte(ctx, 'obras') || []).map(o => [id(o.id), o.nome || 'Obra sem nome'])); }
  function row(ctx, r, valor, data, descricao, documento, oid) {
    return { data: data == null ? '' : String(data), descricao: descricao == null ? '' : String(descricao),
      documento: documento == null ? '' : String(documento), obraNome: nomes(ctx).get(id(oid)) || (oid ? 'Obra nao identificada' : 'Empresa'),
      id: id(r.id), valorCentavos: inteiro(valor) };
  }
  function lancRows(ctx, ids, pred = () => true) {
    return (fonte(ctx, 'lancamentos') || []).filter(l => (!ids || ids.has(id(l.obra_id))) && emPeriodo(l.data, ctx.filtro.periodo) && pred(l))
      .map(l => row(ctx, l, cents(l.total), l.data, l.descricao || 'Lancamento de custo', l.nota_id || l.id, l.obra_id));
  }
  function recebidoRows(ctx, ids, dre = false, tipo = '') {
    const reps = (fonte(ctx, 'repasses') || []).filter(r => ids.has(id(r.obra_id)) && emPeriodo(r.data_credito, ctx.filtro.periodo) &&
      (!tipo || (tipo === 'terreno' ? r.tipo === 'terreno' : r.tipo !== 'terreno')))
      .map(r => row(ctx, r, cents(r.valor), r.data_credito, 'Recebimento registrado: ' + (r.tipo || 'pls'), r.id, r.obra_id));
    if (tipo === 'terreno' || tipo === 'medicoes') return reps;
    const adds = new Map((fonte(ctx, 'adicionais') || []).filter(a => ids.has(id(a.obra_id)) &&
      (dre || (a.status !== 'pendente' && a.status !== 'cancelado'))).map(a => [id(a.id), a]));
    const pgtos = (fonte(ctx, 'pagamentosAdicionais') || []).filter(p => adds.has(id(p.adicional_id)) && emPeriodo(p.data, ctx.filtro.periodo))
      .map(p => { const a = adds.get(id(p.adicional_id)); return row(ctx, p, cents(p.valor), p.data,
        'Recebimento adicional: ' + (a.descricao || a.id), p.id, a.obra_id); });
    return tipo === 'adicionais' ? pgtos : reps.concat(pgtos);
  }
  function dadoDre(fonteDre) { return fonteDre?.status === 'confirmada' ? fonteDre.dados : null; }
  function declarada(ctx, nome) {
    const f = ctx.snapshot.fontes && ctx.snapshot.fontes[nome];
    return ['confirmada', 'confirmado'].includes(f && typeof f === 'object' ? f.status : f);
  }
  function idsReais(ctx) {
    const internas = new Set((ctx.snapshot.OBRAS_INTERNAS || ctx.snapshot.obrasInternas || []).map(id));
    return new Set((fonte(ctx, 'obras') || []).filter(o => !internas.has(id(o.id)) && !/^OBRA QA/i.test(o.nome || '') && !/ESCRIT|ALMOX/i.test(o.nome || '')).map(o => id(o.id)));
  }
  function norm(v) { return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim(); }
  function adminElegivel(ctx, c) {
    if (c.tipo === 'reembolso_fornecedor') return false;
    if (!c.nota_id && !c.nota_ref) return true;
    if (c.tipo === 'despesa_operacional_nf') return true;
    if (!c.nota_id) return false;
    const nota = (fonte(ctx, 'notas') || []).find(n => id(n.id) === id(c.nota_id));
    const desc = norm(c.descricao);
    if (!nota || !norm(nota.obra || nota.destino).includes('ESCRIT') || !desc || /^NF(?:\s|$)/.test(desc)) return false;
    return !(fonte(ctx, 'lancamentos') || []).some(l => {
      if (id(l.nota_id) !== id(c.nota_id) || Math.abs(Number(l.total || 0) - Number(c.valor || 0)) > 0.009) return false;
      const dl = norm(l.descricao).replace(/^\d{4,6}\s*[\u00b7-]\s*/, '');
      return dl === desc || dl.includes(desc) || desc.includes(dl);
    });
  }
  function adminRows(ctx) {
    return (fonte(ctx, 'contasPagar') || []).filter(c => c.status === 'pago' && !c.obra_id && adminElegivel(ctx, c) &&
      emPeriodo(c.data_pagamento || c.data_vencimento, ctx.filtro.periodo))
      .map(c => row(ctx, c, cents(c.valor), c.data_pagamento || c.data_vencimento, c.descricao || 'Conta administrativa', c.nota_ref || c.nota_id || c.id, null));
  }
  function dreRows(ctx, campo, workId) {
    const ids = workId ? new Set([id(workId)]) : SOMA_OBRAS.has(campo) ? new Set(ctx.obras.map(o => id(o.id))) : idsReais(ctx);
    const qa = new Set((fonte(ctx, 'obras') || []).filter(o => /^OBRA QA/i.test(o.nome || '')).map(o => id(o.id)));
    const corporate = l => !qa.has(id(l.obra_id));
    const custos = () => lancRows(ctx, ids, l => ['material', 'mao'].includes(etapa(l)));
    const bruto = () => recebidoRows(ctx, ids, true, 'medicoes').concat(recebidoRows(ctx, ids, true, 'adicionais'));
    if (campo === 'recMed') return recebidoRows(ctx, ids, true, 'medicoes');
    if (campo === 'recAdic') return recebidoRows(ctx, ids, true, 'adicionais');
    if (campo === 'recTerr') return recebidoRows(ctx, ids, true, 'terreno');
    if (['recBruta', 'recConstr', 'dasEstimado'].includes(campo)) return bruto();
    if (['custoObras', 'custoConstr'].includes(campo)) return custos();
    if (['cMat', 'cMao', 'cTerr', 'cDesp'].includes(campo)) return lancRows(ctx, ids, l => etapa(l) === ({ cMat: 'material', cMao: 'mao', cTerr: 'terreno', cDesp: 'despesa' })[campo]);
    if (['imposto', 'impostoReal'].includes(campo)) return lancRows(ctx, null, l => corporate(l) && String(l.etapa || '').trim() === '24_imposto');
    if (campo === 'despOperReal') return lancRows(ctx, null, l => corporate(l) && OPER.includes(String(l.etapa || '').trim()));
    if (campo === 'despAdmin') return adminRows(ctx);
    if (campo === 'despOper') return dreRows(ctx, 'despOperReal', '').concat(adminRows(ctx));
    if (campo === 'resTerreno') return recebidoRows(ctx, ids, true, 'terreno').concat(lancRows(ctx, ids, l => etapa(l) === 'terreno'));
    if (['margem', 'lucroBruto', 'resultado', 'recLiq'].includes(campo)) return bruto().concat(campo === 'recLiq' ? [] : custos(),
      ['lucroBruto', 'resultado', 'recLiq'].includes(campo) ? dreRows(ctx, 'impostoReal', '') : [],
      campo === 'resultado' ? dreRows(ctx, 'despOper', '') : []);
    return [];
  }
  function itemTable(ctx, h, excesso = false, origem = 'todos') {
    const adds = new Map((fonte(ctx, 'adicionais') || []).map(a => [id(a.id), a]));
    return ctx.obras.map(o => {
      const itens = [{ nome: 'Contrato', ...o.contrato }, ...o.adicionais.map(a => ({ nome: adds.get(id(a.id))?.descricao || 'Adicional ' + a.id, ...a }))];
      const valores = excesso ? [o.excedenteContratoCentavos, o.excedenteAdicionaisCentavos] : [o.pendenteContratoCentavos, o.pendenteAdicionaisCentavos];
      const total = origem === 'contrato' ? inteiro(valores[0]) : origem === 'adicionais' ? inteiro(valores[1]) : soma(valores);
      const rotulo = (excesso ? 'A MAIOR' : 'A RECEBER') + (origem === 'contrato' ? ' DO CONTRATO' : origem === 'adicionais' ? ' DOS ADICIONAIS' : '') + ' NESTA OBRA';
      const contexto = origem === 'todos' ? '' : ' Quadro de contexto com contrato e adicionais; o calculo destacado considera somente ' + origem + '.';
      const aviso = fonte(ctx, 'adicionais') && fonte(ctx, 'pagamentosAdicionais') ? '' : '<p class="detail-note">Fonte de adicionais ou recebimentos indisponivel; ausencia de linhas nao confirma inexistencia de adicionais.</p>';
      return `<section class="receivable-detail-work"><h3>${h.esc(o.nome)}</h3><div class="table-wrap"><table class="data-table"><thead><tr><th>ORIGEM</th><th class="num">VALOR</th><th class="num">RECEBIDO</th><th class="num">A RECEBER</th><th class="num">A MAIOR</th></tr></thead><tbody>${itens.map(a => `<tr><td>${h.esc(a.nome)}</td><td class="num">${h.esc(h.money(a.previstoCentavos))}</td><td class="num">${h.esc(h.money(a.recebidoCentavos))}</td><td class="num">${h.esc(h.money(a.pendenteCentavos))}</td><td class="num">${h.esc(h.money(a.excedenteCentavos))}</td></tr>`).join('')}</tbody></table></div><div class="formula"><small>${h.esc(rotulo)}</small>${h.esc(h.money(total))} = soma dos maximos de cada item (${excesso ? 'recebido - previsto' : 'previsto - recebido'}; 0)</div><p class="detail-note">Excedentes permanecem separados. Um recebimento a maior nao quita outro adicional, o contrato ou outra obra.${h.esc(contexto)}</p>${aviso}</section>`;
    }).join('') || '<p class="detail-note">Nenhuma obra identificada neste recorte. Fontes indisponiveis nao representam saldo zero.</p>';
  }
  function congelar(v) { if (v && typeof v === 'object' && !Object.isFrozen(v)) { Object.values(v).forEach(congelar); Object.freeze(v); } return v; }
  function origemComposta(ctx, l, oid, somenteMao = false) {
    const original = (fonte(ctx, l.fonte) || []).find(r => id(r.id) === id(l.id));
    let descricao, documento = original?.nota_id || l.id;
    if (l.tipo === 'custo') descricao = somenteMao || String(l.etapa || '').trim() === '28_mao'
      ? 'Mão de obra lançada (28_mao)' : original?.descricao || 'Custo ou despesa lançada';
    else if (l.fonte === 'pagamentosAdicionais') {
      const a = (fonte(ctx, 'adicionais') || []).find(r => id(r.id) === id(original?.adicional_id));
      descricao = 'Recebimento adicional: ' + (a?.descricao || 'Adicional vinculado');
    } else descricao = 'Recebimento registrado: ' + (original?.tipo || 'Repasses do contrato');
    return row(ctx, { id: l.fonte + ':' + id(l.id) }, somenteMao ? l.valorCentavos : l.efeitoCentavos,
      l.data, descricao, documento, oid);
  }
  function tabelaResultado(c, h) {
    const money = v => h.esc(h.money(inteiro(v)));
    const negativo = v => inteiro(v) == null ? null : -v;
    const entrada = (label, v) => `<tr><td>${h.esc(label)}</td><td class="num">${money(v)}</td><td class="num">—</td><td class="num">${money(v)}</td></tr>`;
    const custo = cat => `<tr><td>${h.esc(cat.label)}</td><td class="num">—</td><td class="num">${money(cat.centavos)}</td><td class="num">${money(negativo(cat.centavos))}</td></tr>`;
    const principais = entrada('Repasses do contrato (inclui terreno)', c.receitas?.contratoCentavos)
      + entrada('Recebimentos de adicionais elegíveis', c.receitas?.adicionaisCentavos)
      + (c.categorias || []).map(custo).join('');
    const m = c.margemConstrucao;
    const exclusoes = (m?.exclusoes || []).filter(cat => Number.isSafeInteger(cat.quantidade) && cat.quantidade > 0);
    const antesDe = exclusoes.length ? 'antes de ' + exclusoes.map(cat => String(cat.label).toLocaleLowerCase('pt-BR')).join(', ')
      : inteiro(m?.custoCentavos) == null ? 'exclusões de custos e despesas não confirmadas' : 'sem custos/despesas excluídos identificados';
    const precisaoDre = inteiro(m?.engineResultadoCentavos) != null && inteiro(m?.diferencaArredondamentoCentavos) != null && m.diferencaArredondamentoCentavos !== 0
      ? '<p class="detail-note">Referência do cálculo separado da DRE, com soma de decimais brutos: ' + money(m.engineResultadoCentavos)
        + '. Essa referência não integra a composição em centavos por origem e não cria ajuste compensatório.</p>' : '';
    const linhaMargem = (label, v) => `<tr><td>${h.esc(label)}</td><td class="num">${money(v)}</td></tr>`;
    const margem = m ? '<details class="receivable-detail-work"><summary>Por que difere da margem da construção</summary>'
      + '<p class="detail-note">Esta explicação usa centavos arredondados por origem para conferir os componentes. A DRE mantém suas fórmulas e sua soma de decimais brutos.</p>'
      + '<div class="table-wrap"><table class="data-table"><thead><tr><th>COMPONENTE</th><th class="num">EFEITO</th></tr></thead><tbody>'
      + linhaMargem('Margem da construção, em centavos por origem — ' + antesDe, m.resultadoCentavos)
      + linhaMargem('Recebimento de terreno incluído no resultado principal', m.recebimentoTerrenoCentavos)
      + linhaMargem('Adicionais fora da carteira elegível, presentes na regra DRE', negativo(m.adicionaisForaCarteiraCentavos))
      + exclusoes.map(cat => linhaMargem('Custo ou despesa incluído no principal: ' + cat.label, negativo(cat.centavos))).join('')
      + '</tbody><tfoot><tr><th>RECEBIDO MENOS TODOS OS CUSTOS</th><th class="num">' + money(c.resultadoCentavos)
      + '</th></tr></tfoot></table></div><p class="detail-note">Terreno, impostos e despesas operacionais permanecem identificados. Não há ajuste compensatório nem desconto de custos sem lançamento de origem.</p>' + precisaoDre + '</details>' : '';
    return '<section class="receivable-detail-work"><h3>Composição do resultado</h3><div class="table-wrap"><table class="data-table">'
      + '<thead><tr><th>ORIGEM OU CATEGORIA</th><th class="num">RECEBIDO</th><th class="num">CUSTO OU DESPESA</th><th class="num">EFEITO NO RESULTADO</th></tr></thead>'
      + '<tbody>' + principais + '</tbody><tfoot><tr><th>TOTAL</th><th class="num">' + money(c.recebidoCentavos)
      + '</th><th class="num">' + money(c.custoCentavos) + '</th><th class="num">' + money(c.resultadoCentavos)
      + '</th></tr></tfoot></table></div><div class="formula"><small>RECEBIDO MENOS CUSTOS</small>'
      + money(c.recebidoCentavos) + ' − ' + money(c.custoCentavos) + ' = ' + money(c.resultadoCentavos)
      + '</div><p class="detail-note">Cada origem aparece uma vez. Fonte indisponível permanece desconhecida; zero exige consulta confirmada.</p></section>' + margem;
  }
  function vazio(note) { return congelar({ title: 'Detalhe indisponivel', valueCentavos: null, formula: 'Fonte nao confirmada.', note,
    extra: '', rows: [] }); }
  function construir(key, ctx, h, workId = '') {
    if (!h || typeof h.esc !== 'function' || typeof h.money !== 'function') throw new TypeError('Helpers de detalhes incompletos.');
    if (!valido(ctx)) return vazio('A empresa e a leitura deste detalhe nao foram confirmadas.');
    // A composicao valida o ID dentro do filtro original e utiliza somente a
    // folha agregada desse envelope. Refiltrar/reavaliar a folha mudaria sua prova.
    if (!['resultReceipts', 'laborM2'].includes(key)) {
      try { ctx = contextoObra(ctx, workId); } catch (_) { return vazio('Nao foi possivel reconstruir a leitura da obra.'); }
    }
    if (!ctx || !valido(ctx)) return vazio('A obra nao pertence ao recorte confirmado.');
    const ids = new Set(ctx.obras.map(o => id(o.id))), t = ctx.totais, per = ctx.filtro.periodo;
    const out = { title: '', valueCentavos: null, formula: '', note: '', extra: '', rows: [] };
    const receber = { receivables: ['A receber acumulado', soma([t.pendenteContratoCentavos, t.pendenteAdicionaisCentavos])],
      receivableExcess: ['Recebido a maior', soma([t.excedenteContratoCentavos, t.excedenteAdicionaisCentavos])],
      receivableContract: ['Contrato a receber', inteiro(t.pendenteContratoCentavos)], receivableExtras: ['Adicionais a receber', inteiro(t.pendenteAdicionaisCentavos)] };
    if (receber[key]) {
      [out.title, out.valueCentavos] = receber[key];
      out.formula = key === 'receivableExcess' ? 'Soma de maximo(recebido - previsto; 0), por contrato e por adicional.'
        : key === 'receivableContract' ? 'Soma de maximo(contrato - recebimentos do contrato; 0), por obra.'
        : key === 'receivableExtras' ? 'Soma de maximo(adicional - recebimentos vinculados; 0), por adicional.'
        : 'Soma de maximo(previsto - recebido; 0), por contrato e por adicional.';
      out.note = 'Posicao acumulada da carteira atual. O periodo nao reduz a pendencia aos recebimentos daquele mes. Arquivamento nao comprova quitacao.';
      out.extra = itemTable(ctx, h, key === 'receivableExcess', key === 'receivableContract' ? 'contrato' : key === 'receivableExtras' ? 'adicionais' : 'todos');
      out.rows = recebidoRows({ ...ctx, filtro: { ...ctx.filtro, periodo: '' } }, ids);
    } else if (key === 'resultReceipts' || key === 'laborM2') {
      const oid = workId || (ctx.obras.length === 1 ? id(ctx.obras[0].id) : '');
      let c;
      try {
        const api = obterComposicao();
        c = api && typeof api.construir === 'function' ? api.construir(ctx, oid) : null;
      } catch (_) { return vazio('Não foi possível confirmar a composição deste indicador.'); }
      if (!c || !oid || id(c.obraId) !== id(oid)) return vazio('Selecione uma obra do recorte confirmado para consultar este indicador.');
      if (key === 'resultReceipts') {
        Object.assign(out, { title: 'Resultado sobre recebimentos', valueCentavos: inteiro(c.resultadoCentavos),
          formula: 'Recebimentos registrados no período − todos os custos e despesas lançados no período, em centavos por origem.',
          note: 'Inclui terreno, mão de obra, material e serviços, impostos e despesas operacionais lançados na obra. Não representa saldo em conta nem lucro final da obra. Lançamento de custo não comprova pagamento.',
          extra: tabelaResultado(c, h), rows: (c.linhas || []).map(l => origemComposta(ctx, l, oid)) });
      } else {
        const a = c.acumulado, f = a?.folha;
        const avisoFolha = f?.pendenciaConfirmada === true ? 'Há pendência de folha comprovada nesta consulta; o valor inclui somente mão de obra já lançada.'
          : f?.cobertura !== 'confirmada' ? 'Fontes ou vínculos de folha não confirmados: não é possível verificar pendências nesta consulta.'
          : 'A consulta não identificou pendência de folha; a cobertura de todos os dias permanece não verificada.';
        Object.assign(out, { title: 'Mão de obra lançada por m²', valueCentavos: inteiro(a?.maoPorM2Centavos),
          formula: 'Mão de obra lançada acumulada (28_mao) ÷ área cadastrada da obra; arredondado ao centavo por m².',
          note: 'Indicador parcial dos lançamentos acumulados, independente do mês selecionado. Avanço físico e custo final da mão de obra não foram consultados. ' + avisoFolha
            + (ctx.filtro.periodo ? ' O diagnóstico do mês selecionado não confirma a cobertura acumulada.' : '')
            + ' Não comprova pagamento nem representa saldo em conta ou lucro final da obra.',
          extra: '<div class="formula"><small>BASE DO CÁLCULO</small>' + h.esc(h.money(inteiro(a?.maoCentavos))) + ' ÷ '
            + h.esc(areaValida(a?.areaM2) == null ? 'Área indisponível' : String(a.areaM2) + ' m²') + ' = '
            + h.esc(h.money(inteiro(a?.maoPorM2Centavos))) + '/m²</div>',
          rows: (a?.linhasMao || []).map(l => origemComposta(ctx, l, oid, true)), signType: 'cost' });
      }
    } else if (key === 'received') {
      Object.assign(out, { title: 'Recebido registrado no periodo', valueCentavos: inteiro(t.recebidoPeriodoCentavos),
        formula: 'Repasses registrados + pagamentos de adicionais elegiveis, pelas datas do recebimento.',
        note: 'Inclui terreno no recebido da carteira. Registro de recebimento nao identifica uma conta bancaria nem cria novo movimento no Caixa.', rows: recebidoRows(ctx, ids) });
    } else if (['cost', 'constructionCost', 'materials', 'labor'].includes(key)) {
      const pred = key === 'materials' ? l => etapa(l) === 'material' : key === 'labor' ? l => etapa(l) === 'mao'
        : key === 'constructionCost' ? l => ['material', 'mao'].includes(etapa(l)) : () => true;
      const valor = key === 'cost' ? t.custoPeriodoCentavos : key === 'constructionCost' ? ctx.custoDre?.totalCentavos
        : key === 'materials' ? ctx.custoDre?.materialServicosCentavos : ctx.custoDre?.maoCentavos;
      Object.assign(out, { title: { cost: 'Custo lancado no periodo', constructionCost: 'Custo da construcao', materials: 'Material e servicos', labor: 'Mao de obra reconhecida' }[key],
        valueCentavos: inteiro(valor), formula: key === 'constructionCost' ? 'Material e servicos + mao de obra, conforme o engine DRE.' : 'Soma dos lancamentos do recorte e da classificacao indicada.',
        note: 'Lancamento de custo nao comprova pagamento ou consumo fisico de estoque. A classificacao DRE reune material e servicos; etapas vazias/desconhecidas seguem a classificacao vigente.',
        rows: lancRows(ctx, ids, pred), signType: 'cost' });
    } else if (key === 'contractM2' || key === 'costM2') {
      const oid = ctx.obras.length === 1 ? id(ctx.obras[0].id) : '';
      const origem = (fonte(ctx, 'obras') || []).find(o => id(o.id) === oid);
      const area = origem && declarada(ctx, 'obras') ? areaValida(origem.area_m2) : null;
      const acumulada = ctx.acumulada && empresa(ctx.acumulada) === empresa(ctx.snapshot)
        ? ctx.acumulada.obras.find(o => id(o.id) === oid) : null;
      const custo = key === 'costM2';
      const base = acumulada && (!custo || declarada(ctx, 'lancamentos'))
        ? inteiro(custo ? acumulada.custoPeriodoCentavos : acumulada.contratoPrevistoCentavos) : null;
      const valor = base != null && area != null ? inteiro(Math.round(base / area)) : null;
      Object.assign(out, { title: custo ? 'Custo acumulado por m²' : 'Contrato por m²', valueCentavos: valor,
        formula: (custo ? 'Custo lançado acumulado' : 'Valor do contrato cadastrado') + ' ÷ área cadastrada da obra; arredondado ao centavo por m².',
        note: custo ? 'Inclui todos os lançamentos de custo da obra, de todos os períodos e classificações. Custo registrado não comprova pagamento ou consumo de estoque.'
          : 'Valor do contrato atual, sem somar adicionais ou recebimentos. Área consultada no mesmo cadastro da obra.',
        extra: '<div class="formula"><small>BASE DO CÁLCULO</small>' + h.esc(h.money(base)) + ' ÷ ' + h.esc(area == null ? 'Área indisponível' : String(area) + ' m²')
          + ' = ' + h.esc(h.money(valor)) + '/m²</div>',
        rows: custo ? lancRows({ ...ctx, filtro: { ...ctx.filtro, periodo: '' } }, new Set(oid ? [oid] : []))
          : origem ? [row(ctx, origem, base, '', 'Contrato cadastrado; área ' + (area == null ? 'indisponível' : String(area) + ' m²'), origem.id, origem.id)] : [],
        signType: custo ? 'cost' : undefined });
      if (!oid) out.note += ' Selecione uma obra para consultar o indicador por m².';
      else if (area == null) out.note += ' Área ausente, inválida ou zero: indicador indisponível.';
    } else if (key === 'forecast' || key === 'work') {
      const a = ctx.acumulada?.totais;
      Object.assign(out, { title: key === 'work' ? 'Posicao gerencial da obra' : 'Posicao contratual menos custo registrado',
        valueCentavos: a ? subtrair(a.carteiraCentavos, a.custoPeriodoCentavos) : null,
        formula: 'Carteira atual - custo acumulado registrado.', note: 'Posicao sobre valores cadastrados e custos ja registrados. Nao estima custos futuros, lucro final nem dinheiro disponivel.',
        rows: lancRows({ ...ctx, filtro: { ...ctx.filtro, periodo: '' } }, ids), extra: itemTable(ctx, h) });
    } else if (key === 'payable') {
      Object.assign(out, { title: 'Obrigacoes consultadas em aberto', valueCentavos: ctx.obrigacoes?.status === 'confirmada' ? inteiro(ctx.obrigacoes.totalCentavos) : null,
        formula: 'Soma dos valores restantes persistidos das obrigacoes do recorte.', note: 'Obrigacoes ficam separadas do saldo disponivel. Pagamentos parciais usam o restante confirmado; reembolsos sao direitos a receber.',
        rows: (ctx.obrigacoes?.rows || []).map(c => row(ctx, c, c.restanteCentavos ?? c.restante_centavos, c.data_vencimento, c.descricao || 'Obrigacao', c.nota_ref || c.nota_id || c.id, c.obra_id)) });
    } else if (['cash', 'opening', 'paid', 'movement'].includes(key)) {
      const e = declarada(ctx, 'ledger') && ['confirmada', 'confirmado'].includes(ctx.snapshot.ledger?.status)
        && ctx.snapshot.ledger.estado?.company_id === empresa(ctx.snapshot) ? ctx.snapshot.ledger.estado : null;
      const contas = new Map((e?.contas || []).map(c => [id(c.id), c]));
      if (key === 'cash') {
        Object.assign(out, { title: ctx.visao.saldo?.status === 'sem_abertura' ? 'Saldo disponivel: abertura nao declarada' : 'Banco e dinheiro da empresa',
          valueCentavos: e && ctx.visao.saldo?.status === 'confirmada' ? inteiro(ctx.visao.saldo.totalCentavos) : null,
          formula: 'Abertura declarada + movimentos efetivos posteriores, por conta.',
          note: 'Saldo atual da empresa, sem rateio por obra ou filtro de competencia. Sem abertura, nao existe saldo prospectivo confirmado; o saldo manual antigo nao e usado aqui.',
          rows: (e?.contas || []).map(c => row(ctx, c, c.saldo_centavos, c.corte_em, c.nome, c.codigo, null)),
          extra: '<button class="btn" data-fv-action="caixa">Abrir controle de banco e dinheiro</button>' });
      } else if (key === 'opening') {
        Object.assign(out, { title: 'Saldo de abertura declarado', valueCentavos: e?.contas?.length ? soma(e.contas.map(c => c.abertura_centavos)) : null,
          formula: 'Saldo informado no marco de cada conta.', note: 'Abertura imutavel e informada, nao receita, pagamento ou conciliacao historica.',
          rows: (e?.contas || []).map(c => row(ctx, c, c.abertura_centavos, c.corte_em, c.nome, c.codigo, null)) });
      } else {
        const moves = ctx.ledger?.status === 'confirmada' ? (e?.movimentos || ctx.ledger.movimentos || []).filter(m => emPeriodo(m.data_efetiva, per)) : [];
        Object.assign(out, { title: key === 'paid' ? 'Saidas efetivas registradas' : 'Variacao prospectiva no periodo',
          valueCentavos: ctx.ledger?.status === 'confirmada' ? inteiro(key === 'paid' ? ctx.ledger.saidasCentavos : ctx.ledger.variacaoCentavos) : null,
          formula: key === 'paid' ? 'Saidas e pagamentos efetivos, pelas datas efetivas.' : 'Entradas efetivas - saidas efetivas. Transferencias vinculadas tem efeito total zero.',
          note: 'Movimentos persistidos da empresa no periodo, a partir do marco declarado. Cancelamentos e valores incluidos na abertura nao sao descontados novamente. Tarifas sao movimentos separados.',
          rows: moves.filter(m => key !== 'paid' || (['saida', 'pagamento'].includes(m.tipo) && m.afeta_saldo === true && m.cancelado_em == null && m.cancelado !== true)).map(m => {
            const cp = (fonte(ctx, 'contasPagar') || []).find(c => id(c.id) === id(m.conta_pagar_id));
            const auditado = m.afeta_saldo !== true || m.cancelado_em != null || m.cancelado === true;
            const transferido = ['transferencia', 'transferencia_in', 'transferencia_out'].includes(m.tipo);
            const valor = key === 'paid' ? inteiro(m.valor_centavos) : auditado || transferido ? 0
              : m.tipo === 'entrada' ? inteiro(m.valor_centavos) : inteiro(m.valor_centavos) == null ? null : -m.valor_centavos;
            return row(ctx, m, valor, m.data_efetiva, m.descricao + (auditado ? ' (registro de auditoria; efeito no saldo zero)' : transferido ? ' (transferencia vinculada; efeito total zero)' : ''),
              contas.get(id(m.conta_id))?.nome || m.conta_id, cp?.obra_id);
          }), signType: key === 'paid' ? 'cost' : undefined });
      }
    } else if (key === 'folha') {
      const f = ctx.folha || ctx.envelope?.folha;
      Object.assign(out, { title: 'Registros e diagnostico de folha', valueCentavos: null,
        formula: 'Apontamentos + contexto das quinzenas + vinculos FP consultados.',
        note: 'Fechamento e FP nao comprovam pagamento. Valores historicos nao sao recalculados nem somados novamente aos custos; a cobertura de todos os dias nao foi verificada.',
        extra: '<div class="detail-note">' + (f?.motivos || []).map(m => h.esc(m.texto || m.codigo)).join('<br>') + '</div>',
        rows: (f?.obras || []).filter(o => ids.has(id(o.obraId || o.id))).flatMap(o => (o.quinzenas || []).map(q => ({ data: q.dataFim || '',
          descricao: q.label || 'Quinzena registrada', documento: q.id || '', obraNome: o.nome || nomes(ctx).get(id(o.obraId || o.id)) || '',
          id: id(q.id), valorCentavos: null }))) });
    } else if (key === 'estoque') {
      Object.assign(out, { title: 'Estoque fisico', formula: 'Fonte de estoque nao consultada por esta visao.',
        note: 'Custo e estoque possuem fontes distintas. Nenhum saldo fisico e inferido de notas, pagamentos ou lancamentos de custo.',
        extra: '<button class="btn" data-fv-action="estoque">Abrir estoque</button>' });
    } else if (key === 'result' || String(key).startsWith('dre:')) {
      const campo = key === 'result' ? 'margem' : String(key).slice(4);
      if (!CAMPOS_DRE[campo]) return vazio('Campo gerencial nao identificado.');
      let dado, valor;
      if (workId || SOMA_OBRAS.has(campo)) {
        const ds = ctx.obras.map(o => dadoDre(o.dre));
        const engineConfirmado = ctx.snapshot.dre?.status === 'confirmada' && declarada(ctx, 'dre');
        valor = engineConfirmado ? soma(ds.map(d => d ? cents(d[campo]) : null)) : null;
      } else { dado = declarada(ctx, 'dre') ? dadoDre(ctx.visao.dre?.empresa) : null; valor = dado ? cents(dado[campo]) : null; }
      Object.assign(out, { title: CAMPOS_DRE[campo][0], valueCentavos: valor, formula: CAMPOS_DRE[campo][1],
        note: workId || SOMA_OBRAS.has(campo) ? 'Obras selecionadas no periodo. Contribuicao da construcao antes de impostos e administracao central; sem rateio arbitrario.'
          : 'Consolidado da empresa no periodo, incluindo obras reais ativas e arquivadas. Filtros de obra/situacao nao reduzem o consolidado. Estimativas nao possuem lancamento de origem; terreno permanece apartado.',
        rows: dreRows(ctx, campo, workId), signType: ['cMat', 'cMao', 'cTerr', 'cDesp', 'custoObras', 'custoConstr', 'imposto', 'impostoReal', 'despOper', 'despAdmin', 'despOperReal'].includes(campo) ? 'cost' : undefined });
    } else if (String(key).startsWith('overhead:')) {
      const campo = String(key).slice(9), d = declarada(ctx, 'dre') ? dadoDre(ctx.visao.dre?.overhead) : null;
      if (!['total', 'noResultado', 'foraResultado'].includes(campo)) return vazio('Campo de estrutura nao identificado.');
      const internos = new Set((ctx.snapshot.OBRAS_INTERNAS || ctx.snapshot.obrasInternas || []).map(id));
      Object.assign(out, { title: { total: 'Custos da estrutura', noResultado: 'Estrutura incluida no resultado', foraResultado: 'Estrutura fora do resultado' }[campo],
        valueCentavos: d ? cents(d[campo]) : null, formula: 'Lancamentos das obras internas cadastradas por ID, conforme o engine DRE.',
        note: 'Escopo da empresa no periodo, pelos IDs internos cadastrados. Conjunto vazio confirmado segue o zero do engine; fonte indisponivel permanece desconhecida. Nao aplica rateio nem altera a DRE.',
        rows: lancRows(ctx, internos, l => campo === 'total' || (campo === 'noResultado' ? etapa(l) === 'despesa' : etapa(l) !== 'despesa')), signType: 'cost' });
    } else return vazio('Origem do numero nao identificada.');
    if (out.valueCentavos == null && !['folha', 'estoque'].includes(key)) out.note += ' Valor não confirmado nesta consulta.';
    return congelar(out);
  }
  return Object.freeze({ construir });
});
