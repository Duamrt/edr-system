/* Apresentacao financeira somente leitura, integrada ao shell EDR existente.
 * Layout: referencia aprovada a8d9c9f; calculos: snapshot/engine reais.
 * Nenhum saldo, pagamento ou registro e persistido por este modulo.
 */
(function (root, factory) {
  'use strict';
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FinanceiroVisaoUI = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  const TITULOS = { dashboard: 'Painel', analise: 'Análise de Obras', raiox: 'Raio X', dre: 'DRE Gerencial' };
  const icones = {
    cash: '<rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 9h18M15 14h6"/><circle cx="16" cy="14" r=".5"/>',
    result: '<path d="M4 20h17M6 16v-4m6 4V8m6 8V4"/>',
    cost: '<path d="m12 3 9 5-9 5-9-5zm-9 5v9l9 5 9-5V8M12 13v9"/>',
    forecast: '<path d="M3 18 9 12l4 3 8-11M15 4h6v6"/>',
    check: '<path d="m9 12 2 2 4-5"/><circle cx="12" cy="12" r="9"/>',
    filter: '<path d="M3 5h18M6 12h12m-8 7h4"/>',
    people: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m1-16a3 3 0 0 1 0 6m3 10v-3a6 6 0 0 0-2-4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    xray: '<path d="M3 7V3h4m10 0h4v4M3 17v4h4m10 0h4v-4M3 12h18"/><circle cx="12" cy="12" r="5"/>',
    receipt: '<path d="M5 3h14v18l-3-2-4 2-4-2-3 2zM9 8h6m-6 4h6"/>'
  };
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  const reaisInteiros = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
  function money(v) {
    if (!Number.isSafeInteger(v)) return 'Indisponível';
    const centavos = BigInt(v), absoluto = centavos < 0n ? -centavos : centavos;
    return (centavos < 0n ? '-' : '') + 'R$\u00a0' + reaisInteiros.format(absoluto / 100n) + ',' + String(absoluto % 100n).padStart(2, '0');
  }
  function pct(v) { return typeof v === 'number' && Number.isFinite(v) ? v.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%' : '—'; }
  function icon(k) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + (icones[k] || icones.receipt) + '</svg>'; }
  function sum(values) {
    if (values.some(v => !Number.isSafeInteger(v))) return null;
    const n = values.reduce((a, b) => a + BigInt(b), 0n);
    return n > BigInt(Number.MAX_SAFE_INTEGER) || n < BigInt(Number.MIN_SAFE_INTEGER) ? null : Number(n);
  }
  function nButton(key, value, work) { return `<button class="${value < 0 ? 'fv-negative' : ''}" data-detail="${esc(key)}"${work ? ` data-work="${esc(work)}"` : ''}>${money(value)}</button>`; }
  function metric(title, value, caption, key, ico, featured) {
    return `<button class="metric ${featured ? 'featured' : ''}${value == null ? ' unavailable' : ''}${value < 0 ? ' negative' : ''}" data-detail="${esc(key)}" aria-label="Ver origem de ${esc(title)}"><span class="metric-head">${esc(title)}${icon(ico)}</span><span class="metric-value${Number.isSafeInteger(value) && money(value).length > 15 ? ' fv-value-long' : ''}">${money(value)}</span><span class="metric-caption">${esc(caption)}</span></button>`;
  }
  function bar(label, value, max, key, cls) {
    const width = Number.isSafeInteger(value) && max > 0 ? Math.min(100, Math.max(0, value / max * 100)) : 0;
    return `<div class="barrow"><button data-detail="${esc(key)}" aria-label="Ver ${esc(label)}: ${esc(money(value))}"><span>${esc(label)}</span><div class="bartrack"><div class="bar ${esc(cls || '')}" style="width:${width}%"></div></div><strong>${money(value)}</strong></button></div>`;
  }
  function pendente(w) { return sum([w.pendenteContratoCentavos, w.pendenteAdicionaisCentavos]); }
  function excedente(w) { return sum([w.excedenteContratoCentavos, w.excedenteAdicionaisCentavos]); }
  function receivables(c) {
    const t = c.totais;
    const p = sum([t.pendenteContratoCentavos, t.pendenteAdicionaisCentavos]);
    const e = sum([t.excedenteContratoCentavos, t.excedenteAdicionaisCentavos]);
    return `<section class="panel receivables-panel"><div class="panel-head"><div><h2>Recebíveis por obra</h2><p>Posição acumulada atual · mesmas obras e situação do filtro</p></div><span class="pill">${c.visao.status === 'confirmada' ? 'Consulta confirmada' : 'Consulta parcial'}</span></div><div class="receivable-totals"><button data-detail="receivables" class="receivable-total"><span>A RECEBER</span><strong>${money(p)}</strong><small>Contratos ${money(t.pendenteContratoCentavos)} + adicionais ${money(t.pendenteAdicionaisCentavos)}</small></button><button data-detail="receivableExcess" class="receivable-total excess"><span>RECEBIDO A MAIOR</span><strong>${money(e)}</strong><small>Contratos ${money(t.excedenteContratoCentavos)} + adicionais ${money(t.excedenteAdicionaisCentavos)}</small></button></div><div class="table-wrap"><table class="data-table receivable-table"><thead><tr><th>OBRA</th><th class="num">CONTRATO A RECEBER</th><th class="num">ADICIONAIS A RECEBER</th><th class="num">TOTAL A RECEBER</th><th class="num">RECEBIDO A MAIOR</th></tr></thead><tbody>${c.obras.map(w => `<tr><td><button data-detail="receivables" data-work="${esc(w.id)}"><strong>${esc(w.nome)}</strong></button></td><td class="num">${nButton('receivableContract', w.pendenteContratoCentavos, w.id)}</td><td class="num">${nButton('receivableExtras', w.pendenteAdicionaisCentavos, w.id)}</td><td class="num positive">${nButton('receivables', pendente(w), w.id)}</td><td class="num excess-text">${nButton('receivableExcess', excedente(w), w.id)}</td></tr>`).join('')}<tr class="receivable-sum"><td><strong>Soma por obra</strong></td><td class="num">${money(t.pendenteContratoCentavos)}</td><td class="num">${money(t.pendenteAdicionaisCentavos)}</td><td class="num positive"><strong>${money(p)}</strong></td><td class="num excess-text"><strong>${money(e)}</strong></td></tr></tbody></table></div><div class="bottom-note">Pendências calculadas por contrato e por adicional antes da soma. Excedentes ficam separados e não compensam outras origens ou obras. O período mensal não recorta esta posição acumulada.</div></section>`;
  }
  function dreCent(w, field) { return w.dre?.status === 'confirmada' ? root.FinanceiroVisaoModelo.centavos(w.dre.dados[field]) : null; }
  function workTable(c) {
    return `<section class="panel"><div class="panel-head"><div><h2>Resultado por obra</h2><p>Mesmas obras e período · engine gerencial vigente</p></div><span class="pill">${c.obras.length} ${c.obras.length === 1 ? 'obra' : 'obras'}</span></div><div class="table-wrap"><table class="data-table"><thead><tr><th>OBRA</th><th class="num">RECEITA DE CONSTRUÇÃO</th><th class="num">CUSTO DE CONSTRUÇÃO</th><th class="num">CONTRIBUIÇÃO GERENCIAL</th><th class="num">MARGEM</th></tr></thead><tbody>${c.obras.map(w => `<tr><td><button data-detail="work" data-work="${esc(w.id)}"><span class="work-monogram">${esc(String(w.nome || '').trim().slice(0, 2).toUpperCase())}</span><span><span class="work-name">${esc(w.nome)}</span><span class="cell-meta">${w.arquivada ? 'Arquivada' : 'Ativa'}</span></span></button></td><td class="num">${nButton('dre:recConstr', dreCent(w, 'recConstr'), w.id)}</td><td class="num">${nButton('dre:custoConstr', dreCent(w, 'custoConstr'), w.id)}</td><td class="num ${dreCent(w, 'margem') < 0 ? 'negative' : 'positive'}">${nButton('result', dreCent(w, 'margem'), w.id)}</td><td class="num">${w.dre?.status === 'confirmada' && w.dre.dados.recConstr ? pct(w.dre.dados.margemPct) : '—'}</td></tr>`).join('')}</tbody></table></div><div class="bottom-note">Contribuição antes de impostos e administração central; terreno tratado à parte. Custo registrado não comprova pagamento.</div></section>`;
  }
  function overview(c) {
    const result = c.custoDre.status === 'confirmada' ? sum(c.obras.map(w => dreCent(w, 'margem'))) : null;
    const rec = c.custoDre.status === 'confirmada' ? sum(c.obras.map(w => dreCent(w, 'recConstr'))) : null;
    const position = sum([c.acumulada.totais.carteiraCentavos, c.acumulada.totais.custoPeriodoCentavos == null ? null : -c.acumulada.totais.custoPeriodoCentavos]);
    const d = c.custoDre, max = Math.max(rec || 0, d.totalCentavos || 0, 1);
    return `<section class="metrics" aria-label="Indicadores principais">${metric('Caixa disponível', c.visao.saldo.totalCentavos, c.visao.saldo.status === 'sem_abertura' ? 'Abertura pendente · saldo ainda não declarado' : 'Empresa · saldo atual de banco + dinheiro', 'cash', 'cash', true)}${metric('Resultado gerencial', result, 'Contribuição das obras · antes de impostos e administração', 'result', 'result')}${metric('Custo reconhecido', d.totalCentavos, 'Construção · materiais e serviços + mão de obra', 'constructionCost', 'cost')}${metric('Saldo da carteira', position, 'Carteira − custo acumulado · não prevê custos futuros', 'forecast', 'forecast')}</section><div class="grid-main"><section class="panel"><div class="panel-head"><div><h2>O resultado, sem misturar conceitos</h2><p>Movimentos do período selecionado</p></div><span class="pill">${c.filtro.periodo ? 'Mês' : 'Acumulado'}</span></div><div class="chart"><div class="chart-legend"><span><i class="legend-dot"></i>Receita de construção</span><span><i class="legend-dot dark"></i>Custo de construção</span></div>${bar('Receita de construção', rec, max, 'dre:recConstr')}${bar('Materiais e serviços', d.materialServicosCentavos, max, 'materials', 'muted')}${bar('Mão de obra', d.maoCentavos, max, 'labor', 'mid')}<div class="chart-summary"><span>Contribuição gerencial das obras</span>${nButton('result', result)}</div></div></section><section class="panel"><div class="panel-head"><div><h2>No radar</h2><p>Posição atual · conceitos separados</p></div>${icon('xray')}</div><div class="attention"><div class="attention-row"><div class="iconbox amber">${icon('people')}</div><button class="text-button" data-detail="payable"><strong>Obrigações a pagar</strong><p>Restante confirmado · não descontado novamente do saldo</p></button><span class="amount">${money(c.obrigacoes.totalCentavos)}</span></div><div class="attention-row"><div class="iconbox">${icon('cost')}</div><button class="text-button" data-detail="estoque"><strong>Materiais em estoque</strong><p>Consulte o estoque operacional</p></button><span class="amount">—</span></div><div class="attention-row"><div class="iconbox">${icon('forecast')}</div><button class="text-button" data-detail="folha"><strong>Folha e quinzenas</strong><p>Fechamento e custo não comprovam pagamento</p></button><span class="amount">Conferir</span></div></div></section></div><div class="reconcile">${icon('check')}<div><h3>Banco, custo e resultado separados</h3><p>A abertura é saldo informado. O controle prospectivo não concilia o histórico anterior nem transforma custos em pagamentos.</p></div><button class="link" data-detail="cash">Conferir saldo</button></div>${receivables(c)}${workTable(c)}`;
  }
  function finance(c) {
    const bank = c.visao.saldo.contas.find(a => a.codigo === 'banco'), cash = c.visao.saldo.contas.find(a => a.codigo === 'dinheiro');
    const l = c.ledger, max = Math.max(l.entradasCentavos || 0, l.saidasCentavos || 0, 1);
    const cobertura = ({ parcial: 'Período parcialmente coberto pelo marco declarado', anterior_aos_marcos: 'Período anterior aos marcos · histórico não conciliado', desde_marcos_declarados: 'Desde os marcos declarados', confirmada: 'Período posterior aos marcos' })[l.coberturaTemporal] || 'Cobertura temporal não confirmada';
    const accounts = new Map((c.snapshot.ledger?.estado?.contas || []).map(a => [a.id, a.nome]));
    return `${receivables(c)}<section class="metrics">${metric(bank?.nome || 'Banco', bank?.saldoCentavos ?? null, 'Saldo geral atual · sem rateio por obra', 'cash', 'cash')}${metric(cash?.nome || 'Dinheiro no escritório', cash?.saldoCentavos ?? null, 'Saldo geral atual · abertura declarada', 'cash', 'cash')}${metric('Caixa disponível', c.visao.saldo.totalCentavos, c.visao.saldo.status === 'sem_abertura' ? 'Abertura pendente · saldo ainda não declarado' : 'Banco + dinheiro · não soma recebíveis', 'cash', 'cash', true)}${metric('Variação prospectiva', l.variacaoCentavos, 'Somente movimentos efetivos cobertos pelo marco', 'movement', 'result')}</section><div class="grid-main"><section class="panel"><div class="panel-head"><div><h2>Movimentos efetivos de dinheiro</h2><p>Empresa · período selecionado · ${esc(cobertura)}</p></div></div><div class="chart">${bar('Entradas', l.entradasCentavos, max, 'movement')}${bar('Saídas', l.saidasCentavos, max, 'paid', 'muted')}<div class="chart-summary"><span>Variação prospectiva</span>${nButton('movement', l.variacaoCentavos)}</div></div><div class="bottom-note">Transferências vinculadas têm efeito total zero; tarifas são saídas separadas. Movimentos anteriores ao marco não entram novamente.</div></section><section class="panel"><div class="panel-head"><div><h2>Caixa com contexto</h2><p>Saldo atual da empresa · obrigações das obras selecionadas</p></div></div><div class="attention"><div class="attention-row"><div class="iconbox amber">${icon('clock')}</div><button class="text-button" data-detail="payable"><strong>Compromissos em aberto</strong><p>Restantes após pagamentos parciais confirmados</p></button><span class="amount">${money(c.obrigacoes.totalCentavos)}</span></div></div><p class="inline-note">Saldo disponível é dinheiro confirmado nas contas. Recebíveis, estoque e lucro previsto não são dinheiro em conta.</p><button class="btn primary" data-fv-action="caixa">Abrir Banco e dinheiro</button></section></div><section class="panel"><div class="panel-head"><div><h2>Movimentações de caixa</h2><p>Empresa · datas efetivas · cobertura prospectiva do período</p></div><button class="link" data-fv-action="caixa">Abrir controle</button></div><div class="table-wrap"><table class="data-table"><thead><tr><th>DATA EFETIVA</th><th>LANÇAMENTO</th><th>CONTA</th><th class="num">VALOR</th></tr></thead><tbody>${(l.movimentos || []).map(m => `<tr><td>${esc(m.data_efetiva)}<span class="cell-meta">${esc(m.hora_efetiva || 'Sem horário')}</span></td><td><button data-detail="cash">${esc(m.descricao)}</button><span class="cell-meta">${esc(m.tipo)} · ${m.cancelado_em ? 'Cancelado' : m.afeta_saldo ? 'Incluído no saldo' : 'Incluído na abertura'}</span></td><td>${esc(accounts.get(m.conta_id) || '')}${m.destino_id ? ' → ' + esc(accounts.get(m.destino_id) || '') : ''}</td><td class="num">${m.tipo === 'entrada' ? '+ ' : ['saida', 'pagamento'].includes(m.tipo) ? '− ' : ''}${money(m.valor_centavos)}</td></tr>`).join('') || `<tr><td colspan="4">${c.visao.saldo.status === 'sem_abertura' ? 'Abertura ainda não declarada. Nenhum saldo foi presumido.' : l.status === 'indisponivel' ? 'Movimentos não confirmados.' : 'Nenhum movimento registrado neste período.'}</td></tr>`}</tbody></table></div></section>`;
  }
  const h = Object.freeze({ esc, money, pct, icon, metric, nButton, bar, receivables, workTable });
  const montagens = new Map();
  let ponte, tab = 'resumo';
  function cabecalhosLegados(tipo, el) {
    if (tipo === 'analise') { const view = el.closest('#view-relatorio'); if (view) [...view.children].filter(n => n !== el).forEach(n => { n.hidden = true; n.style.display = 'none'; }); }
    if (tipo === 'dre') { const head = el.parentElement?.querySelector('.sticky-header'); if (head) { head.hidden = true; head.style.display = 'none'; } }
  }
  function tituloPeriodo(p) {
    if (!p) return 'Acumulado';
    const names = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    return names[Number(p.slice(5)) - 1] + ' de ' + p.slice(0, 4);
  }
  function filtros(c, e, tipo) {
    const f = e.filtro, all = c ? root.FinanceiroVisaoModelo.construir(c.snapshot, { periodo: '', obraId: '', situacao: 'todas' }).obras : [];
    const months = c?.visao.meses || [];
    const prefix = 'fv-' + tipo + '-';
    return `<section class="filterbar" aria-label="Filtros compartilhados"><div class="filter-title">${icon('filter')}<span>Filtros</span></div><label for="${prefix}periodo">Período<select id="${prefix}periodo" data-fv-filter="periodo"><option value="">Acumulado</option>${[...new Set([...months, ...(f.periodo ? [f.periodo] : [])])].map(m => `<option value="${esc(m)}"${f.periodo === m ? ' selected' : ''}>${esc(tituloPeriodo(m))}</option>`).join('')}</select></label><label for="${prefix}obra">Obra<select id="${prefix}obra" data-fv-filter="obraId"><option value="">Todas as obras</option>${all.map(w => `<option value="${esc(w.id)}"${f.obraId === String(w.id) ? ' selected' : ''}>${esc(w.nome)}</option>`).join('')}</select></label><label for="${prefix}situacao">Situação<select id="${prefix}situacao" data-fv-filter="situacao">${[['ativas', 'Ativas'], ['todas', 'Todas as situações'], ['arquivadas', 'Arquivadas']].map(([v, label]) => `<option value="${v}"${f.situacao === v ? ' selected' : ''}>${label}</option>`).join('')}</select></label><span class="filter-sync">Mesmo filtro entre as visões · saldo geral atual</span></section>`;
  }
  function desenhar(m, e) {
    const c = root.FinanceiroVisaoContexto.construir(e);
    m.contexto = c;
    let content;
    if (!c) content = `<section class="empty" role="${e.fase === 'erro' ? 'alert' : 'status'}"><h2>${e.fase === 'carregando' ? 'Consultando fontes financeiras…' : e.fase === 'invalidada' ? 'Consulta invalidada' : 'Consulta financeira indisponível'}</h2><p>${e.fase === 'carregando' ? 'Os valores só aparecem depois da confirmação das fontes.' : 'Atualize a consulta com uma sessão administrativa válida. Nenhum valor anterior foi reutilizado.'}</p>${e.fase === 'carregando' ? '' : '<button class="btn primary" data-fv-action="atualizar">Atualizar consulta</button>'}</section>`;
    else if (c.visao.fontes.obras.status !== 'confirmada') content = '<section class="empty" role="alert"><h2>Lista de obras não confirmada</h2><p>Atualize a consulta para conferir as obras. Outros valores não substituem esta fonte.</p></section>';
    else if (!c.obras.length && ['analise', 'raiox'].includes(m.tipo)) content = '<section class="empty"><h2>Nenhuma obra neste filtro</h2><p>A obra e a situação selecionadas não coincidem ou não há obras cadastradas.</p><button class="btn" data-fv-action="limpar">Mostrar todas as obras</button></section>';
    else content = m.tipo === 'dashboard' ? (tab === 'financeiro' ? finance(c) : overview(c)) : root.FinanceiroVisaoPaginas.renderizar(m.tipo, c, h);
    const scope = c ? `${c.periodoNome || tituloPeriodo(e.filtro.periodo)} · ${c.obras.length} ${c.obras.length === 1 ? 'obra' : 'obras'} no filtro` : 'Leitura de fontes confirmadas';
    m.el.innerHTML = `<div class="edr-financial" data-fv-view="${m.tipo}"><div class="page-heading"><div><h1>${TITULOS[m.tipo]}</h1><p>${esc(scope)}</p></div><div class="fv-heading-actions"><button class="btn ghost" data-fv-action="metodo">Entenda os números</button><button class="btn ghost" data-fv-action="atualizar"${e.fase === 'carregando' ? ' disabled' : ''}>Atualizar</button><button class="btn" data-fv-action="exportar"${c ? '' : ' disabled'}>Exportar PDF</button></div></div>${filtros(c, e, m.tipo)}${m.tipo === 'dashboard' ? `<div class="subtabs" role="tablist" aria-label="Visões do painel">${['resumo', 'financeiro'].map(t => `<button role="tab" aria-selected="${tab === t}" class="${tab === t ? 'active' : ''}" data-fv-tab="${t}">${t === 'resumo' ? 'Resumo' : 'Financeiro'}</button>`).join('')}</div>` : ''}<div data-fv-content>${content}</div><footer>Fontes EDR · ${e.consultadoEm ? 'consulta em ' + esc(new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(e.consultadoEm))) + ' (São Paulo)' : 'consulta pendente'} · saldo atual da empresa; carteira acumulada; custos e DRE no período.</footer><dialog id="fv-detail-${m.tipo}" aria-labelledby="fv-detail-title-${m.tipo}"><div class="drawer-top"><span class="eyebrow">ORIGEM DO NÚMERO</span><button class="icon-btn" data-fv-action="fechar" aria-label="Fechar detalhes">×</button></div><div data-fv-detail-body></div></dialog><div class="fv-feedback" role="status" aria-live="polite"></div></div>`;
  }
  function lista(rows) {
    return `<div class="detail-list">${(rows || []).map(r => `<div class="detail-entry"><span class="entry-date">${esc(r.data || 'Sem data')}</span><div class="entry-name">${esc(r.descricao || '')}<small>${esc([r.obraNome, r.documento, r.id].filter(Boolean).join(' · '))}</small></div><span class="entry-value">${money(r.valorCentavos)}</span></div>`).join('') || '<p class="detail-note">Não há registros confirmados para apresentar.</p>'}</div>`;
  }
  function renderSeguro(m, e) {
    try { desenhar(m, e); }
    catch (_) {
      m.contexto = null;
      m.el.innerHTML = '<div class="edr-financial"><section class="empty" role="alert"><h2>Não foi possível apresentar esta consulta</h2><p>Os valores anteriores foram retirados. Atualize para consultar novamente.</p><button class="btn primary" data-fv-action="atualizar">Atualizar consulta</button></section></div>';
    }
  }
  function detalhe(m, key, work) {
    if (!m.contexto) return;
    const d = key === 'metodo' ? { title: 'Como ler estes números', valueCentavos: null, note: 'Carteira e recebíveis são acumulados. Custos e DRE obedecem ao período. O saldo disponível vem exclusivamente do controle prospectivo confirmado, sem rateio por obra. Abertura não é receita; lançar custo ou fechar folha não é pagar. Pendências e excedentes são calculados por origem antes da soma. Material e serviços continuam juntos na classificação gerencial vigente. Impostos, administração e terreno seguem o engine existente.' } : root.FinanceiroVisaoDetalhes.construir(key, m.contexto, h, work || '');
    if (!d) return;
    const dialog = m.el.querySelector('dialog'), body = dialog.querySelector('[data-fv-detail-body]');
    body.innerHTML = `<h2 id="fv-detail-title-${m.tipo}" class="detail-title">${esc(d.title)}</h2><div class="detail-scope">${esc(m.contexto.periodoNome)} · ${esc(work ? m.contexto.obras.find(w => String(w.id) === work)?.nome || '' : 'Obras do filtro atual')} · fontes EDR</div>${d.valueCentavos != null ? `<div class="detail-value">${money(d.valueCentavos)}</div>` : ''}${d.formula ? `<div class="formula"><small>CÁLCULO</small>${esc(d.formula)}</div>` : ''}<p class="detail-note">${esc(d.note)}</p>${d.extra || ''}${d.rows ? '<h3 class="detail-heading">Registros de origem</h3>' + lista(d.rows) : ''}`;
    dialog.showModal();
  }
  function exportar(m) {
    if (!m.contexto) return false;
    const c = m.contexto, type = m.tipo;
    // Captura os mesmos elementos/valores da tela e descarta controles interativos.
    const clone = m.el.querySelector('[data-fv-content]').cloneNode(true);
    clone.querySelectorAll('[data-fv-action]').forEach(n => n.remove());
    clone.querySelectorAll('button').forEach(n => { const span = root.document.createElement('span'); span.innerHTML = n.innerHTML; n.replaceWith(span); });
    const win = root.open('about:blank', '_blank');
    if (!win) { m.el.querySelector('.fv-feedback').textContent = 'Permita a janela de impressão para exportar PDF.'; return false; }
    const css = new URL('css/edr-v2-visao-financeira.css', root.location.href).href;
    const fontes = [...root.document.querySelectorAll('link[rel="stylesheet"]')].filter(n => n.href.startsWith('https://fonts.googleapis.com/')).map(n => n.outerHTML).join('');
    win.document.open();
    win.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>EDR · ${esc(TITULOS[type])}</title>${fontes}<link rel="stylesheet" href="${esc(css)}"><style>body{margin:0;background:white}.edr-financial{padding:24px}.edr-financial .grid-main{grid-template-columns:1fr}.edr-financial .metrics{grid-template-columns:repeat(2,1fr)}.edr-financial .table-wrap{overflow:visible}button{font:inherit;color:inherit;background:none;border:0}@media print{.edr-financial .panel{break-inside:avoid}}</style></head><body><main class="edr-financial"><div class="page-heading"><div><h1>${esc(TITULOS[type])}</h1><p>${esc(c.periodoNome)} · ${esc(c.obras.map(w => w.nome).join(', ') || 'Nenhuma obra')} · ${esc(c.filtro.situacao)}</p></div></div>${clone.innerHTML}<footer>Consulta ${esc(c.envelope.consultadoEm)} · saldo geral atual; carteira acumulada; custos/DRE no período. DRE empresarial mantém seu alcance próprio.</footer></main></body></html>`);
    win.document.close();
    win.addEventListener('load', () => { win.focus(); win.print(); }, { once: true });
    return true;
  }
  function montar(tipo, el) {
    if (!TITULOS[tipo] || !el || !root.document) return false;
    cabecalhosLegados(tipo, el);
    try {
      if (!root.FinanceiroVisaoContexto || !root.FinanceiroVisaoPaginas || !root.FinanceiroVisaoDetalhes) throw new Error('DEPENDENCIAS');
      ponte = root.FinanceiroVisaoPonte.obter();
      let m = montagens.get(el);
      if (!m) {
        m = { tipo, el, contexto: null }; montagens.set(el, m);
        el.addEventListener('change', e => { const field = e.target.dataset.fvFilter; if (field) ponte.setFiltro({ [field]: e.target.value }); });
        el.addEventListener('click', e => {
          const b = e.target.closest('button'); if (!b || !el.contains(b)) return;
          if (b.dataset.fvTab) { tab = b.dataset.fvTab; renderSeguro(m, ponte.ler()); return; }
          if (b.dataset.detail) { detalhe(m, b.dataset.detail, b.dataset.work); return; }
          const action = b.dataset.fvAction;
          if (action === 'atualizar') { void ponte.carregar(); }
          else if (action === 'limpar') ponte.setFiltro({ obraId: '', situacao: 'todas' });
          else if (action === 'metodo') detalhe(m, 'metodo');
          else if (action === 'fechar') el.querySelector('dialog').close();
          else if (action === 'caixa' || action === 'estoque') { if (typeof setView === 'function') setView(action); }
          else if (action === 'exportar') exportar(m);
        });
        ponte.assinar(e => renderSeguro(m, e));
      } else { m.tipo = tipo; renderSeguro(m, ponte.ler()); }
      // Uma nova navegacao consulta novamente: o saldo pode ter mudado no Caixa.
      if (ponte.ler().fase !== 'carregando') void ponte.carregar();
      return true;
    } catch (_) {
      el.innerHTML = '<div class="edr-financial"><section class="empty" role="alert"><h2>Módulos financeiros indisponíveis</h2><p>Recarregue o sistema para concluir a atualização. Nenhum saldo foi presumido.</p></section></div>';
      return false;
    }
  }
  return Object.freeze({ montar, helpers: h, resumo: overview, financeiro: finance, exportar });
});
