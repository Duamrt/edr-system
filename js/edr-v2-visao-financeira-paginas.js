/*
 * Paginas financeiras de leitura. O DOM usa os componentes da previa aprovada;
 * valores e criterios pertencem exclusivamente ao modelo e ao engine DRE reais.
 * API: renderizar('analise'|'raiox'|'dre', contexto, helpers).
 * Sem rede, persistencia, autenticacao, reconhecimento ou pagamento automatico.
 */
(function (root, factory) {
  'use strict';
  const modelo = typeof module === 'object' && module.exports
    ? require('./edr-v2-visao-financeira-modelo.js') : root && root.FinanceiroVisaoModelo;
  const composicao = typeof module === 'object' && module.exports
    ? require('./edr-v2-visao-financeira-composicao.js') : root && root.FinanceiroVisaoComposicao;
  const api = factory(modelo, composicao);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FinanceiroVisaoPaginas = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (modelo, composicao) {
  'use strict';

  const TIPOS = ['analise', 'raiox', 'dre'];
  const AVISO_RESULTADO = 'Não representa saldo em conta nem lucro final da obra.';
  function empresa(v) {
    const id = v && (v.companyId || v.company_id);
    return typeof id === 'string' && id.trim() ? id : null;
  }
  function inteiro(v) { return Number.isSafeInteger(v) ? v : null; }
  function somar(a, b) {
    if (inteiro(a) == null || inteiro(b) == null) return null;
    const n = BigInt(a) + BigInt(b);
    return n > BigInt(Number.MAX_SAFE_INTEGER) || n < BigInt(Number.MIN_SAFE_INTEGER) ? null : Number(n);
  }
  function converter(v) { return modelo && typeof modelo.centavos === 'function' ? modelo.centavos(v) : null; }
  function dadosDre(fonte) {
    return fonte && fonte.status === 'confirmada' && fonte.dados && typeof fonte.dados === 'object'
      ? fonte.dados : null;
  }
  function indice(ctx) {
    const tenant = empresa(ctx.snapshot);
    return new Map((ctx.snapshot.obras || []).filter(o => o && (!o.company_id || o.company_id === tenant))
      .map(o => [String(o.id), o]));
  }
  function validado(ctx) {
    if (!ctx || !ctx.visao || !ctx.snapshot || !Array.isArray(ctx.visao.obras) || !Array.isArray(ctx.snapshot.obras)) return false;
    const tenant = empresa(ctx.snapshot);
    if (!tenant || empresa(ctx.visao) !== tenant) return false;
    if (ctx.envelope && ctx.envelope.fase && ctx.envelope.fase !== 'pronta') return false;
    if (ctx.envelope && ctx.envelope.snapshot && empresa(ctx.envelope.snapshot) !== tenant) return false;
    const atuais = indice(ctx);
    return ctx.visao.obras.every(o => o && atuais.has(String(o.id)) && (!o.company_id || o.company_id === tenant));
  }
  function indisponivel() {
    return '<section class="empty" role="status"><h2>Leitura financeira indisponível</h2><p>Não foi possível confirmar os dados e a empresa desta consulta. Atualize a leitura para continuar.</p></section>';
  }
  function porMetro(centavos, area) {
    if (inteiro(centavos) == null || !['number', 'string'].includes(typeof area) || String(area).trim() === '') return null;
    const m2 = Number(area);
    if (!Number.isFinite(m2) || m2 <= 0) return null;
    return inteiro(Math.round(centavos / m2));
  }
  function proporcao(v, total) {
    return inteiro(v) != null && inteiro(total) != null && v >= 0 && total > 0
      ? Math.min(100, Math.max(0, v / total * 100)) : 0;
  }
  function percentual(v, total, h) {
    return inteiro(v) != null && inteiro(total) != null && total > 0 ? h.pct(v / total * 100) : '—';
  }
  function par(rotulo, valor, chave, oid, h) {
    return `<div class="pair"><span>${h.esc(rotulo)}</span>${h.nButton(chave, valor, oid)}</div>`;
  }
  function tabelaAnalise(ctx, leituras, h) {
    return `<section class="panel"><div class="panel-head"><div><h2>Resultado sobre recebimentos por obra</h2><p>Mesmas obras e período · custos e despesas lançados</p></div><span class="pill">${ctx.visao.obras.length} ${ctx.visao.obras.length === 1 ? 'obra' : 'obras'}</span></div><div class="table-wrap"><table class="data-table"><thead><tr><th>OBRA</th><th class="num">RECEBIDO</th><th class="num">CUSTOS E DESPESAS LANÇADOS</th><th class="num">RESULTADO SOBRE RECEBIMENTOS</th><th class="num">% SOBRE RECEBIMENTOS</th></tr></thead><tbody>${ctx.visao.obras.map(o => {
      const comp = leituras.get(String(o.id));
      const resultado = inteiro(comp && comp.resultadoCentavos);
      return `<tr><td><button data-detail="work" data-work="${h.esc(o.id)}"><span class="work-monogram">${h.esc(String(o.nome || '').trim().slice(0, 2).toUpperCase())}</span><span><span class="work-name">${h.esc(o.nome)}</span><span class="cell-meta">${o.arquivada ? 'Arquivada' : 'Ativa'}</span></span></button></td><td class="num">${h.nButton('received', inteiro(comp && comp.recebidoCentavos), o.id)}</td><td class="num">${h.nButton('cost', inteiro(comp && comp.custoCentavos), o.id)}</td><td class="num ${resultado < 0 ? 'negative' : 'positive'}">${h.nButton('resultReceipts', resultado, o.id)}</td><td class="num">${comp && Number.isFinite(comp.resultadoPct) ? h.pct(comp.resultadoPct) : 'Indisponível'}</td></tr>`;
    }).join('')}</tbody></table></div><div class="bottom-note">Recebido − custos e despesas lançados. Não representa saldo em conta nem lucro final da obra.</div></section>`;
  }

  function analise(ctx, h) {
    const origens = indice(ctx);
    const leituras = new Map();
    const acumuladas = new Map(((ctx.acumulada && ctx.acumulada.obras) || []).map(o => [String(o.id), o]));
    const cards = ctx.visao.obras.map(o => {
      const origem = origens.get(String(o.id));
      const acumulada = ctx.acumulada && empresa(ctx.acumulada) === empresa(ctx.visao)
        ? acumuladas.get(String(o.id)) : null;
      const leitura = composicao && typeof composicao.construir === 'function' ? composicao.construir(ctx, o.id) : null;
      const comp = leitura && String(leitura.obraId) === String(o.id) ? leitura : null;
      leituras.set(String(o.id), comp);
      const mao = comp && comp.acumulado;
      const avisos = [...(comp && Array.isArray(comp.avisos) ? comp.avisos : []),
        ...(mao && mao.folha && Array.isArray(mao.folha.avisos) ? mao.folha.avisos : [])]
        .filter(aviso => aviso !== AVISO_RESULTADO);
      const pendente = somar(o.pendenteContratoCentavos, o.pendenteAdicionaisCentavos);
      const excedente = somar(o.excedenteContratoCentavos, o.excedenteAdicionaisCentavos);
      const codigo = String(o.nome || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(n => n[0]).join('').toUpperCase() || 'OB';
      return `<section class="panel work-card"><div class="work-card-top"><span class="work-monogram">${h.esc(codigo)}</span><span class="status-pill ${o.arquivada ? 'archived' : ''}">${o.arquivada ? 'Arquivada' : 'Ativa'}</span></div>
        <h2>${h.esc(o.nome)}</h2><p>${h.esc(ctx.periodoNome)} · recebimentos, custos e despesas lançados</p>
        <div class="progress-line" aria-hidden="true"></div><div class="smallrow"><span>Avanço físico não consultado</span><strong>Indisponível</strong></div>
        ${par('A receber acumulado', pendente, 'receivables', o.id, h)}
        ${par('Recebido a maior', excedente, 'receivableExcess', o.id, h)}
        ${par('Recebido no período', inteiro(comp && comp.recebidoCentavos), 'received', o.id, h)}
        ${par('Custos e despesas lançados', inteiro(comp && comp.custoCentavos), 'cost', o.id, h)}
        ${par('Resultado sobre recebimentos', inteiro(comp && comp.resultadoCentavos), 'resultReceipts', o.id, h)}
        <div class="pair"><span>Resultado / recebimentos</span><strong>${comp && Number.isFinite(comp.resultadoPct) ? h.pct(comp.resultadoPct) : 'Indisponível'}</strong></div>
        <p class="inline-note">${AVISO_RESULTADO}</p>
        <div class="smallrow"><span>Indicadores por m²</span><strong>Acumulado</strong></div>
        ${par('Contrato / m²', porMetro(acumulada && acumulada.contratoPrevistoCentavos, origem.area_m2), 'contractM2', o.id, h)}
        ${par('Custo acumulado / m²', porMetro(acumulada && acumulada.custoPeriodoCentavos, origem.area_m2), 'costM2', o.id, h)}
        ${par('Mão de obra lançada / m² (acumulado)', inteiro(mao && mao.maoPorM2Centavos), 'laborM2', o.id, h)}
        <p class="inline-note">${[...new Set(avisos)].map(aviso => h.esc(aviso)).join('<br>') || 'Indicadores por m² acumulados e parciais; avanço físico e cobertura da folha não confirmados nesta leitura.'}</p>
        <button class="btn" data-detail="work" data-work="${h.esc(o.id)}">Abrir análise da obra</button>
      </section>`;
    }).join('');
    return `<div class="split3">${cards}</div><p class="inline-note">Resultado sobre recebimentos = recebido no período − custos e despesas lançados no período. Contrato, custo e mão de obra por m² usam os valores acumulados; área ausente fica indisponível. A contribuição da construção conforme a DRE pode ser conferida nos detalhes.</p>${tabelaAnalise(ctx, leituras, h)}`;
  }

  function diagnosticoFolha(ctx, h) {
    const folha = ctx.envelope && ctx.envelope.folha;
    const tenant = empresa(ctx.visao);
    const confirmada = folha && empresa(folha) === tenant;
    const estados = {
      pendencia_identificada: 'Pendência identificada',
      nao_avaliado: 'Não avaliado',
      sem_pendencia_identificada: 'Sem pendência identificada nos registros'
    };
    const resumo = confirmada ? estados[folha.estado] || 'Não avaliado' : 'Diagnóstico indisponível';
    const obras = confirmada && Array.isArray(folha.obras)
      ? folha.obras.filter(o => ctx.visao.obras.some(v => String(v.id) === String(o.obraId || o.id))) : [];
    const motivos = confirmada && Array.isArray(folha.motivos)
      ? folha.motivos.filter(m => m && ['pendencia', 'nao_avaliado'].includes(m.severidade)) : [];
    return `<div class="safe-box"><strong>${h.esc(resumo)}</strong><p>Fechamento de quinzena e lançamento FP não comprovam pagamento. A consulta avalia registros e vínculos; a cobertura de todos os dias não foi verificada.</p></div>
      ${obras.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>OBRA</th><th>REGISTROS DE FOLHA</th></tr></thead><tbody>${obras.map(o => {
        const oid = o.obraId || o.id;
        const obra = ctx.visao.obras.find(v => String(v.id) === String(oid));
        return `<tr><td><button data-detail="folha" data-work="${h.esc(oid)}">${h.esc(obra.nome)}</button></td><td>${h.esc(estados[o.estado] || 'Não avaliado')}</td></tr>`;
      }).join('')}</tbody></table></div>` : ''}
      ${motivos.length ? `<div class="bottom-note">${motivos.slice(0, 4).map(m => h.esc(m.texto)).join('<br>')}${motivos.length > 4 ? '<br>Abra os detalhes para conferir os demais registros.' : ''}</div>` : ''}`;
  }

  function raiox(ctx, h) {
    const recebido = ctx.custoDre || {};
    const c = recebido.status == null || recebido.status === 'confirmada' ? recebido : {};
    const total = inteiro(c.totalCentavos), material = inteiro(c.materialServicosCentavos), mao = inteiro(c.maoCentavos);
    const maximo = Math.max(0, total || 0, material || 0, mao || 0);
    const categorias = [['materials', material, 'Material e serviços', 'Classificação vigente do engine DRE'], ['labor', mao, 'Mão de obra', 'Custo reconhecido; pagamento separado']];
    return `${h.receivables(ctx)}<section class="metrics" aria-label="Custos das obras">
      ${h.metric('Custo das obras', total, 'Material e serviços + mão de obra · DRE', 'constructionCost', 'cost', true)}
      ${h.metric('Material e serviços', material, 'Classificação conjunta preservada', 'materials', 'cost')}
      ${h.metric('Mão de obra', mao, 'Reconhecida no custo, sem presumir pagamento', 'labor', 'people')}
      ${h.metric('Lançamentos no período', inteiro(ctx.visao.totais && ctx.visao.totais.custoPeriodoCentavos), 'Inclui categorias separadas pela DRE', 'cost', 'receipt')}
      </section><div class="grid-main"><section class="panel"><div class="panel-head"><div><h2>Composição do custo</h2><p>Categorias existentes na DRE das obras filtradas</p></div></div><div class="cost-breakdown">
      <div class="stackbar" aria-label="Composição do custo">${categorias.map(([k, n, t]) => `<button data-detail="${k}" style="width:${proporcao(n, total)}%" aria-label="${h.esc(t + ': ' + h.money(n))}"></button>`).join('')}</div>
      ${categorias.map(([k, n, t, d]) => `<div class="cost-item"><span>${h.esc(t)}<small>${h.esc(d)}</small></span><button data-detail="${k}">${h.money(n)} <span class="unit">· ${percentual(n, total, h)}</span></button></div>`).join('')}
      <p class="inline-note">Material e serviços incluem as categorias que o engine já reúne. Esta leitura não separa consumo físico de materiais, frete ou serviços por estimativa.</p></div></section>
      <section class="panel"><div class="panel-head"><div><h2>Da compra ao consumo</h2><p>Custo, estoque e pagamento têm origens próprias</p></div></div><div class="formula-panel" style="padding-top:0"><div class="formula-step"><span>Custo de material e serviços</span>${h.nButton('materials', material)}</div><div class="formula-step"><span>Estoque físico</span>${h.nButton('estoque', null)}</div><p>O estoque físico e suas movimentações não foram consultados nesta visão. Um lançamento de custo não comprova compra paga nem saída de estoque.</p><button class="btn" data-detail="estoque">Entender a origem do estoque</button></div></section></div>
      <div class="grid-main"><section class="panel"><div class="panel-head"><div><h2>Folha e encargos</h2><p>Reconhecimento separado do pagamento</p></div></div><div class="chart">${h.bar('Reconhecido na DRE', mao, maximo, 'labor')}
      <div class="chart-summary"><span>Pagamento da folha comprovado nesta leitura</span>${h.nButton('folha', null)}</div></div>${diagnosticoFolha(ctx, h)}<div class="bottom-note"><button class="link" data-detail="folha">Conferir diagnóstico e registros</button></div></section>
      <section class="panel formula-panel"><h3>Uma origem para cada número</h3><p>Os lançamentos compõem o custo gerencial. Movimentos efetivos do controle de banco e dinheiro compõem o saldo disponível, a partir da abertura declarada.</p><div class="formula-step"><span>Obrigações consultadas em aberto</span>${h.nButton('payable', ctx.obrigacoes && ctx.obrigacoes.status === 'confirmada' ? inteiro(ctx.obrigacoes.totalCentavos) : null)}</div><p>Obrigações permanecem separadas do dinheiro disponível. Fechar a folha não baixa a conta bancária.</p><button class="btn" data-detail="cost">Conferir lançamentos de custo</button></section></div>`;
  }

  function dre(ctx, h) {
    const dados = dadosDre(ctx.visao.dre && ctx.visao.dre.empresa);
    const overhead = dadosDre(ctx.visao.dre && ctx.visao.dre.overhead);
    const valor = campo => converter(dados && dados[campo]);
    const linha = (rotulo, campo, classe = '') => `<tr class="${classe}"><td>${h.esc(rotulo)}</td><td>${h.nButton('dre:' + campo, valor(campo))}</td></tr>`;
    const linhas = [
      ['Receita bruta das obras', 'recBruta', 'group'], ['Medições + entrada', 'recMed', 'child'], ['Adicionais', 'recAdic', 'child'],
      ['(−) Impostos e encargos', 'imposto', 'group'], ['(=) Receita líquida', 'recLiq', 'group'],
      ['(−) Custo das obras', 'custoObras', 'group'], ['Material e serviços', 'cMat', 'child'], ['Mão de obra', 'cMao', 'child'],
      ['(=) Lucro bruto', 'lucroBruto', 'group'], ['(−) Despesas operacionais', 'despOper', 'group'],
      ['Despesas operacionais lançadas', 'despOperReal', 'child'], ['Contas administrativas elegíveis', 'despAdmin', 'child'],
      ['(=) Resultado líquido gerencial', 'resultado', 'result']
    ];
    return `<div class="dre-info">DRE gerencial consolidada da empresa · ${h.esc(ctx.periodoNome)}. O filtro de obra e situação continua aplicado às análises por obra abaixo; não reduz o consolidado da empresa. Os critérios fiscais e de classificação vigentes foram preservados.</div>
      <div class="grid-main"><section class="panel"><div class="panel-head"><div><h2>DRE gerencial da empresa</h2><p>${h.esc(ctx.periodoNome)} · consolidado da empresa</p></div><span class="pill">R$</span></div><div class="table-wrap"><table class="dre-table"><thead><tr><th>COMPOSIÇÃO</th><th>VALOR DO PERÍODO</th></tr></thead><tbody>${linhas.map(l => linha(...l)).join('')}
      <tr><td>Margem líquida sobre receita líquida</td><td>${dados && Number.isFinite(dados.mLiq) ? h.pct(dados.mLiq) : '—'}</td></tr></tbody></table></div><div class="bottom-note">Receita, custos, impostos e despesas usam o engine DRE existente. Esta leitura gerencial não substitui a contabilidade fiscal.</div></section>
      <section class="panel formula-panel"><h3>Critérios e escopo</h3><div class="formula-step"><span>Impostos lançados</span>${h.nButton('dre:impostoReal', valor('impostoReal'))}</div><div class="formula-step"><span>Estimativa vigente de impostos</span>${h.nButton('dre:dasEstimado', valor('dasEstimado'))}</div><div class="formula-step total"><span>Imposto aplicado pelo engine</span>${h.nButton('dre:imposto', valor('imposto'))}</div><p>Política vigente: maior entre impostos lançados e estimativa de 6% sobre a receita. ${dados && dados.impostoEst === true ? 'O resultado inclui estimativa de imposto.' : dados && dados.impostoEst === false ? 'O imposto lançado determina o valor aplicado.' : 'A origem aplicada não foi confirmada nesta consulta.'}</p>
      <div class="safe-box">Saldo disponível é o dinheiro da empresa. Resultado gerencial inclui os critérios de custos, tributos e despesas da DRE; não equivale a dinheiro livre para retirada.</div>
      <h3>Terreno, em apartado</h3><div class="formula-step"><span>Recebimento de terreno</span>${h.nButton('dre:recTerr', valor('recTerr'))}</div><div class="formula-step"><span>Custo de terreno</span>${h.nButton('dre:cTerr', valor('cTerr'))}</div><p>Terreno permanece separado do resultado da construção, conforme o modelo vigente.</p></section></div>
      <section class="panel"><div class="panel-head"><div><h2>Administração central e escritório</h2><p>Mesmo período do consolidado · sem redistribuição por obra</p></div></div><div class="formula-panel"><div class="formula-step"><span>Total lançado no escritório</span>${h.nButton('overhead:total', converter(overhead && overhead.total))}</div><div class="formula-step"><span>Já considerado no resultado</span>${h.nButton('overhead:noResultado', converter(overhead && overhead.noResultado))}</div><div class="formula-step total"><span>Fora do resultado, a classificar</span>${h.nButton('overhead:foraResultado', converter(overhead && overhead.foraResultado))}</div><p>O valor a classificar permanece fora do resultado. Sua destinação contábil depende de revisão; esta visão não cria despesa, imobilizado ou distribuição.</p></div></section>${h.workTable(ctx)}`;
  }

  function renderizar(tipo, ctx, h) {
    if (!TIPOS.includes(tipo)) throw new RangeError('Pagina financeira invalida.');
    if (!validado(ctx)) return indisponivel();
    if (!h || ['esc', 'money', 'pct', 'metric', 'nButton', 'bar', 'receivables', 'workTable', 'icon'].some(k => typeof h[k] !== 'function')) {
      throw new TypeError('Componentes financeiros incompletos.');
    }
    return tipo === 'analise' ? analise(ctx, h) : tipo === 'raiox' ? raiox(ctx, h) : dre(ctx, h);
  }
  return Object.freeze({ renderizar });
});
