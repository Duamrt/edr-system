// ══════════════════════════════════════════════════════════════════
// EDR System V2 — Modulo: CUSTOS & LANCAMENTOS
// Depende: api.js, utils.js, config.js, obras.js (ETAPAS),
//          notas.js (lancamentos), auth.js, dashboard.js
// Auditado por: GM (Gemini) — 04/04/2026
// ══════════════════════════════════════════════════════════════════

// ── ESTADO ENCAPSULADO ──────────────────────────────────────────
const CustosModule = {
  // Visao
  view: 'cards',            // 'cards' | 'detalhe'
  obraAtual: '',            // obra selecionada no detalhe

  // Dados
  repassesCef: [],          // carregado do Supabase

  // Filtros cards overview
  filtroBusca: '',
  filtroPeriodo: '',        // '' | '30' | '60' | '90' | '180'

  // Contrato edicao
  _contratoEditId: null,

  // Debounce
  _buscaTimer: null,

  // Lazy loading: detalhes so carregam no click
  _detalheCarregado: null,
};


// O plano aprovado altera a carteira prevista; não cria recebimento nem altera o cadastro.
function _custosIdentidadePlano() {
  return { empresa: typeof _companyId !== 'undefined' ? _companyId : null,
    ator: typeof usuarioAtual !== 'undefined' ? usuarioAtual?.id : null,
    perfil: typeof usuarioAtual !== 'undefined' ? usuarioAtual?.perfil : null,
    token: typeof _supabaseToken !== 'undefined' ? _supabaseToken : null };
}
function _custosMesmaIdentidade(a, b) {
  return !!a && !!b && a.empresa === b.empresa && a.ator === b.ator && a.perfil === b.perfil && a.token === b.token;
}
function _custosSomarCentavos(valores) {
  if (typeof EntradaPlanoProjecoes === 'undefined') return null;
  let total = 0;
  for (const valor of valores) {
    const centavos = EntradaPlanoProjecoes.centavos(valor);
    if (!Number.isSafeInteger(centavos) || !Number.isSafeInteger(total + centavos)) return null;
    total += centavos;
  }
  return total;
}
function _custosSomarReais(valores) {
  const centavos = _custosSomarCentavos(valores);
  return centavos == null ? null : centavos / 100;
}
function _custosLedgerConfirmado() {
  const fonte = CustosModule._repassesFonte;
  return !fonte || (fonte.status === 'confirmada' && _custosMesmaIdentidade(fonte.dono, _custosIdentidadePlano()));
}
function _custosFinanceiroDerivado(obra, repasses, custos, adds) {
  const resumo = typeof EntradaPlanoProjecoes !== 'undefined' ? EntradaPlanoProjecoes.atual() : null;
  const proj = typeof EntradaPlanoProjecoes !== 'undefined' ? EntradaPlanoProjecoes.projetar(obra, resumo) : null;
  const empresa = _custosIdentidadePlano().empresa;
  const mesmoTenant = !empresa || !obra.company_id || obra.company_id === empresa;
  const somar = valores => _custosSomarCentavos(valores);
  const ledgerConfirmado = _custosLedgerConfirmado();
  const recebido = ledgerConfirmado ? somar(repasses.filter(r => ['pls', 'entrada', 'terreno'].includes(r.tipo || 'pls')).map(r => r.valor || 0)) : null;
  const custo = somar(custos.map(l => l.total || 0));
  const adicionais = somar(Array.isArray(adds.lista) ? adds.lista.map(a => a.valor || 0) : [adds.valorTotal || 0]);
  const adicionaisRecebidos = somar([adds.totalRecebido || 0]);
  const recebidoGeral = Number.isSafeInteger(recebido) && Number.isSafeInteger(adicionaisRecebidos)
    && Number.isSafeInteger(recebido + adicionaisRecebidos) ? recebido + adicionaisRecebidos : null;
  const receita = proj?.status === 'confirmada' && mesmoTenant && Number.isSafeInteger(proj.carteiraCentavos)
    && Number.isSafeInteger(adicionais) && Number.isSafeInteger(proj.carteiraCentavos + adicionais)
    ? proj.carteiraCentavos + adicionais : null;
  const saldo = Number.isSafeInteger(receita) && Number.isSafeInteger(recebidoGeral)
    && Number.isSafeInteger(receita - recebidoGeral) ? receita - recebidoGeral : null;
  const lucro = Number.isSafeInteger(receita) && Number.isSafeInteger(custo)
    && Number.isSafeInteger(receita - custo) ? receita - custo : null;
  const monetario = n => Number.isSafeInteger(n) ? n / 100 : null;
  return { planoConfirmado: Number.isSafeInteger(receita), ledgerConfirmado,
    confirmada: Number.isSafeInteger(receita) && Number.isSafeInteger(saldo) && Number.isSafeInteger(lucro),
    plano: mesmoTenant && proj?.status === 'confirmada' ? proj : null,
    vendaOriginal: monetario(somar([obra.valor_venda == null ? 0 : obra.valor_venda])),
    carteira: monetario(receita == null ? null : proj.carteiraCentavos),
    receita: monetario(receita), recebido: monetario(recebido), recebidoGeral: monetario(recebidoGeral),
    custo: monetario(custo), adicionais: monetario(adicionais), adicionaisRecebidos: monetario(adicionaisRecebidos),
    saldo: monetario(saldo), lucro: monetario(lucro),
    margem: receita > 0 && lucro != null ? lucro / receita * 100 : receita === 0 ? 0 : null,
    pctRecebido: receita > 0 && recebidoGeral != null ? Math.min(recebidoGeral / receita * 100, 100) : receita === 0 ? 0 : null };
}
function _custosFmtConfirmado(valor) { return valor == null ? 'Indisponível' : fmtR(valor); }
function _custosLinhaPlano(fin) {
  const p = fin.plano;
  return p?.planoId ? '<div class="custos-mini">Entrada original: ' + fmtR(p.originalCentavos / 100)
    + ' · Ajuste líquido: ' + fmtR(p.ajusteCentavos / 100) + ' · Entrada atual: ' + fmtR(p.totalCentavos / 100)
    + '</div><div class="custos-mini">Carteira atual: ' + _custosFmtConfirmado(fin.carteira) + '</div>' : '';
}

// ── CENTROS DE CUSTO INTERNOS (overhead) ────────────────────────
// TRANSIÇÃO até existir obras.tipo no banco. EDR-ESCRITORIO é overhead
// cadastrado como obra: poluía totais/lucro/margem/destaques das obras reais.
// Separado por ID EXATO (nome é frágil: '%edr%' pega 'pEDRo').
// Único interno hoje (verificado no banco 2026-07-09). Ao formalizar, migrar p/ obras.tipo.
const OBRAS_INTERNAS = ['4481e116-591d-42a7-a69c-da373980a988']; // EDR - ESCRITORIO
if (typeof window !== 'undefined') window.OBRAS_INTERNAS = OBRAS_INTERNAS; // exposto p/ outros módulos (ex.: obras.js) sem depender da ordem de load


// ── REGISTRO NO VIEW REGISTRY ───────────────────────────────────
if (typeof viewRegistry !== 'undefined') {
  viewRegistry.register('custos', renderCustosView);
}


// ══════════════════════════════════════════════════════════════════
// INIT — Carregar repasses CEF
// ══════════════════════════════════════════════════════════════════
async function _custosCarregarRepasses() {
  const identidade = _custosIdentidadePlano();
  const pedido = { dono: identidade, status: 'carregando' };
  CustosModule._repassesFonte = pedido;
  CustosModule._repassesDono = null;
  try {
    const r = await sbGet('repasses_cef', '?order=data_credito.desc', { throwOnError: true });
    if (!_custosMesmaIdentidade(identidade, _custosIdentidadePlano()) || CustosModule._repassesFonte !== pedido) return false;
    if (!Array.isArray(r)) throw new Error('Fonte de repasses não confirmada.');
    CustosModule.repassesCef = r;
    pedido.status = 'confirmada';
    CustosModule._repassesDono = identidade;
    return true;
  } catch (e) {
    if (_custosMesmaIdentidade(identidade, _custosIdentidadePlano()) && CustosModule._repassesFonte === pedido) {
      CustosModule.repassesCef = [];
      pedido.status = 'indisponivel';
    }
    return false;
  }
}

// ══════════════════════════════════════════════════════════════════
// RENDER PRINCIPAL
// ══════════════════════════════════════════════════════════════════
async function renderCustosView() {
  const identidade = _custosIdentidadePlano();
  const versao = CustosModule._renderPlanoSeq = (CustosModule._renderPlanoSeq || 0) + 1;
  if (typeof EntradaPlanoProjecoes !== 'undefined') await EntradaPlanoProjecoes.carregar();
  if (!_custosMesmaIdentidade(identidade, _custosIdentidadePlano()) || versao !== CustosModule._renderPlanoSeq) return;
  if (!CustosModule.repassesCef.length || !_custosMesmaIdentidade(CustosModule._repassesDono, identidade)) await _custosCarregarRepasses();
  if (!_custosMesmaIdentidade(identidade, _custosIdentidadePlano()) || versao !== CustosModule._renderPlanoSeq) return;
  if (CustosModule.view === 'detalhe' && CustosModule.obraAtual) {
    await custosAbrirDetalhe(CustosModule.obraAtual);
  } else {
    _custosRenderCards();
  }
  if (_custosMesmaIdentidade(identidade, _custosIdentidadePlano())) aplicarPerfil();
}


// ══════════════════════════════════════════════════════════════════
// VISAO 1: CARDS OVERVIEW (Lazy — so totais macro)
// ══════════════════════════════════════════════════════════════════
function _custosRenderCards() {
  CustosModule.view = 'cards';
  CustosModule.obraAtual = '';

  const overviewEl = document.getElementById('custos-cards-overview');
  const detalheEl = document.getElementById('custos-detalhe-view');
  if (overviewEl) overviewEl.style.display = '';
  if (detalheEl) detalheEl.style.display = 'none';

  const el = document.getElementById('custos-cards-grid');
  if (!el) return;

  const busca = norm(CustosModule.filtroBusca);
  const periodoVal = CustosModule.filtroPeriodo;

  let todasObras = [...obras];
  if (typeof obrasArquivadas !== 'undefined') todasObras = [...todasObras, ...obrasArquivadas];
  todasObras = todasObras.filter(o => !o.arquivada);

  // Filtro busca
  if (busca) todasObras = todasObras.filter(o => norm(o.nome || '').includes(busca) || norm(o.cidade || '').includes(busca));

  // Filtro periodo
  let dataLimite = null;
  if (periodoVal) {
    dataLimite = new Date();
    dataLimite.setDate(dataLimite.getDate() - parseInt(periodoVal));
  }

  if (!todasObras.length) {
    el.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:48px;color:var(--text-tertiary);">
      <span class="material-symbols-outlined" style="font-size:48px;opacity:.3;">account_balance_wallet</span>
      <p style="margin-top:12px;">Nenhuma obra encontrada.</p>
    </div>`;
    return;
  }

  const isAdmin = usuarioAtual?.perfil === 'admin';

  // Separa overhead interno (escritório) das obras reais — só obras reais entram em tabela/totais/destaques
  const obrasReais = todasObras.filter(o => !OBRAS_INTERNAS.includes(o.id));
  const obrasInternas = todasObras.filter(o => OBRAS_INTERNAS.includes(o.id));

  // Totais agregados — SOMENTE soma de campos já calculados por obra (sem novo cálculo)
  let totContrato = 0, totRecebido = 0, totCusto = 0, totLucro = 0, totReceita = 0;
  let derivadosConfirmados = true;

  // "Onde olhar agora" (Passo 2a) — SUPERLATIVOS factuais dos campos já calculados.
  // Sem corte inventado, sem status OK/Atenção/Risco. Só max/min/contagem.
  let maiorCusto = { nome: '', val: -Infinity };
  let menorReceb = { nome: '', val: Infinity, has: false };
  let maiorPrej = { nome: '', val: 0, has: false };
  let semContrato = [];
  let menosLanc = { nome: '', val: Infinity };

  const linhas = obrasReais.map(o => {
    // Repasses da obra (totais macro — sem carregar detalhes)
    let reps = CustosModule.repassesCef.filter(r => r.obra_id === o.id);
    if (dataLimite) reps = reps.filter(r => r.data_credito && new Date(r.data_credito + 'T12:00:00') >= dataLimite);

    const custos = (typeof lancamentos !== 'undefined' && Array.isArray(lancamentos))
      ? lancamentos.filter(l => l.obra_id === o.id) : [];
    const adds = typeof getAdicionaisObra === 'function' ? getAdicionaisObra(o.id) : { qtd: 0, valorTotal: 0, totalRecebido: 0 };
    const fin = _custosFinanceiroDerivado(o, reps, custos, adds);
    const valorVenda = fin.vendaOriginal, custoTotal = fin.custo, totalRecebido = fin.recebido;
    const receitaObra = fin.receita, lucro = fin.lucro, pctRecebido = fin.pctRecebido;
    derivadosConfirmados = derivadosConfirmados && fin.planoConfirmado && fin.lucro != null;

    // Contrato CEF
    const contratoValor = Number(o.contrato_valor || 0);
    const pctContrato = totalRecebido == null ? null : contratoValor > 0 ? Math.min((totalRecebido / contratoValor * 100), 100) : 0;

    const margem = fin.margem;

    // Agrega totais (apenas campos já computados acima)
    totContrato += contratoValor;
    totRecebido = _custosSomarReais([totRecebido, fin.recebidoGeral]);
    totCusto = _custosSomarReais([totCusto, custoTotal]);
    if (fin.planoConfirmado && fin.lucro != null) {
      totLucro = _custosSomarReais([totLucro, lucro]);
      totReceita = _custosSomarReais([totReceita, receitaObra]);
    }
    derivadosConfirmados = derivadosConfirmados && totLucro != null && totReceita != null;

    // Superlativos factuais (Passo 2a) — sem corte, só extremos dos campos já calculados
    if (custoTotal > maiorCusto.val) maiorCusto = { nome: o.nome, val: custoTotal };
    if (receitaObra > 0 && pctRecebido != null && pctRecebido < menorReceb.val) menorReceb = { nome: o.nome, val: pctRecebido, has: true };
    if (lucro < maiorPrej.val) maiorPrej = { nome: o.nome, val: lucro, has: true };
    if (contratoValor <= 0) semContrato.push(o.nome);
    if (reps.length < menosLanc.val) menosLanc = { nome: o.nome, val: reps.length };

    if (isAdmin) {
      return `<tr class="custos-tr" onclick="custosAbrirDetalhe('${esc(o.id)}')">
        <td class="custos-td-obra">
          <div class="custos-obra-nome">${esc(o.nome)}</div>
          <div class="custos-obra-cidade">${esc(o.cidade || 'Sem cidade')}</div>
        </td>
        <td class="custos-num">${valorVenda > 0 ? fmtR(valorVenda) : '<span class="custos-muted">—</span>'}${_custosLinhaPlano(fin)}${!fin.planoConfirmado ? '<div class="custos-mini">Carteira atual indisponível</div>' : ''}${!fin.ledgerConfirmado ? '<div class="custos-mini">Recebimentos indisponíveis</div>' : ''}</td>
        <td class="custos-num">${contratoValor > 0 ? `${fmtR(contratoValor)}<div class="custos-mini">${pctContrato != null ? pctContrato.toFixed(0) + '% recebido' : 'Recebimentos indisponíveis'}</div>` : '<span class="custos-muted">—</span>'}</td>
        <td class="custos-num">${_custosFmtConfirmado(fin.recebidoGeral)}${pctRecebido != null ? '<div class="custos-bar"><div class="custos-bar-fill" style="width:' + pctRecebido + '%;"></div></div>' : ''}<div class="custos-mini">${pctRecebido != null ? pctRecebido.toFixed(0) + '% da receita' : '% da receita indisponível'} · ${reps.length} lanç.</div></td>
        <td class="custos-num">${_custosFmtConfirmado(custoTotal)}</td>
        <td class="custos-num"><strong style="color:${lucro >= 0 ? 'var(--success)' : 'var(--error)'};">${_custosFmtConfirmado(lucro)}</strong></td>
        <td class="custos-num" style="color:${margem >= 0 ? 'var(--text-primary)' : 'var(--error)'};">${margem != null ? margem.toFixed(1) + '%' : 'Indisponível'}</td>
        <td class="custos-td-acao"><button class="custos-btn-abrir" onclick="event.stopPropagation();custosAbrirDetalhe('${esc(o.id)}')">Abrir</button></td>
      </tr>`;
    }

    // Não-admin: mantém o mesmo escopo do card atual (só obra + contrato + ação)
    return `<tr class="custos-tr" onclick="custosAbrirDetalhe('${esc(o.id)}')">
      <td class="custos-td-obra">
        <div class="custos-obra-nome">${esc(o.nome)}</div>
        <div class="custos-obra-cidade">${esc(o.cidade || 'Sem cidade')}</div>
        <div class="custos-mini">${reps.length} lanç.</div>
      </td>
      <td class="custos-num">${contratoValor > 0 ? `${fmtR(contratoValor)}<div class="custos-mini">${pctContrato != null ? pctContrato.toFixed(0) + '% recebido' : 'Recebimentos indisponíveis'}</div>` : '<span class="custos-muted">—</span>'}</td>
      <td class="custos-td-acao"><button class="custos-btn-abrir" onclick="event.stopPropagation();custosAbrirDetalhe('${esc(o.id)}')">Abrir</button></td>
    </tr>`;
  }).join('');

  const totMargem = derivadosConfirmados ? (totReceita > 0 ? totLucro / totReceita * 100 : 0) : null;
  const totPctReceb = derivadosConfirmados && totRecebido != null ? (totReceita > 0 ? Math.min(totRecebido / totReceita * 100, 100) : 0) : null;

  // "Onde olhar agora" — cards factuais (só admin, como o resumo). Sem julgamento/corte.
  const olhar = isAdmin ? `<div class="custos-olhar-title">Onde olhar agora</div>
    <div class="custos-olhar">
      <div class="custos-olhar-card">
        <div class="custos-olhar-lbl"><span class="material-symbols-outlined">construction</span>Maior custo lançado</div>
        <div class="custos-olhar-obra">${esc(maiorCusto.nome)}</div>
        <div class="custos-olhar-val">${fmtR(maiorCusto.val)}</div>
      </div>
      <div class="custos-olhar-card">
        <div class="custos-olhar-lbl"><span class="material-symbols-outlined">trending_down</span>Menor % recebido</div>
        ${!derivadosConfirmados || totRecebido == null ? '<div class="custos-olhar-obra">Indisponível</div><div class="custos-olhar-val">receita ou recebimentos não confirmados</div>' : menorReceb.has ? `<div class="custos-olhar-obra">${esc(menorReceb.nome)}</div><div class="custos-olhar-val">${menorReceb.val.toFixed(0)}% da receita</div>` : `<div class="custos-olhar-obra">—</div><div class="custos-olhar-val">sem obra com receita</div>`}
      </div>
      <div class="custos-olhar-card">
        <div class="custos-olhar-lbl"><span class="material-symbols-outlined">money_off</span>Maior prejuízo</div>
        ${!derivadosConfirmados ? '<div class="custos-olhar-obra">Indisponível</div><div class="custos-olhar-val">planos de entrada não confirmados</div>' : maiorPrej.has ? `<div class="custos-olhar-obra">${esc(maiorPrej.nome)}</div><div class="custos-olhar-val">${fmtR(maiorPrej.val)}</div>` : `<div class="custos-olhar-obra">Nenhuma no prejuízo</div><div class="custos-olhar-val">lucro ≥ 0 em todas</div>`}
      </div>
      <div class="custos-olhar-card">
        <div class="custos-olhar-lbl"><span class="material-symbols-outlined">description</span>Sem contrato CEF</div>
        ${semContrato.length ? `<div class="custos-olhar-obra">${semContrato.length} obra(s)</div><div class="custos-olhar-val">${esc(semContrato.slice(0, 3).join(', '))}${semContrato.length > 3 ? '…' : ''}</div>` : `<div class="custos-olhar-obra">Nenhuma</div><div class="custos-olhar-val">todas com contrato</div>`}
      </div>
      <div class="custos-olhar-card">
        <div class="custos-olhar-lbl"><span class="material-symbols-outlined">receipt_long</span>Menos lançamentos</div>
        <div class="custos-olhar-obra">${esc(menosLanc.nome)}</div>
        <div class="custos-olhar-val">${menosLanc.val} lanç.</div>
      </div>
    </div>` : '';

  const resumo = isAdmin ? `${olhar}<div class="custos-resumo">
    <div class="custos-kpi">
      <div class="custos-kpi-head"><span class="custos-kpi-ico green"><span class="material-symbols-outlined">request_quote</span></span></div>
      <div class="custos-kpi-val">${fmtR(totContrato)}</div>
      <div class="custos-kpi-lbl">Contrato total</div>
    </div>
    <div class="custos-kpi">
      <div class="custos-kpi-head"><span class="custos-kpi-ico blue"><span class="material-symbols-outlined">payments</span></span></div>
      <div class="custos-kpi-val">${_custosFmtConfirmado(totRecebido)}</div>
      <div class="custos-kpi-lbl">Recebido total · ${totPctReceb != null ? totPctReceb.toFixed(1) + '% da receita' : '% da receita indisponível'}</div>
    </div>
    <div class="custos-kpi">
      <div class="custos-kpi-head"><span class="custos-kpi-ico amber"><span class="material-symbols-outlined">construction</span></span></div>
      <div class="custos-kpi-val">${_custosFmtConfirmado(totCusto)}</div>
      <div class="custos-kpi-lbl">Custo total</div>
    </div>
    <div class="custos-kpi">
      <div class="custos-kpi-head"><span class="custos-kpi-ico green"><span class="material-symbols-outlined">trending_up</span></span></div>
      <div class="custos-kpi-val" style="color:${totLucro >= 0 ? 'var(--success)' : 'var(--error)'};">${derivadosConfirmados ? fmtR(totLucro) : 'Indisponível'}</div>
      <div class="custos-kpi-lbl">Lucro · ${totMargem != null ? 'margem ' + totMargem.toFixed(1) + '%' : 'margem indisponível'}</div>
    </div>
  </div>` : '';

  const thead = isAdmin
    ? `<tr><th>Obra</th><th>Venda original / carteira atual</th><th>Contrato CEF original</th><th>Recebido</th><th>Custo</th><th>Lucro</th><th>Margem</th><th>Ação</th></tr>`
    : `<tr><th>Obra</th><th>Contrato CEF</th><th>Ação</th></tr>`;

  // Bloco "Custos internos / Escritório" — overhead separado, FORA dos totais de obra. Só admin (financeiro).
  let internosHtml = '';
  if (isAdmin && obrasInternas.length) {
    const cards = obrasInternas.map(oi => {
      const ls = (typeof lancamentos !== 'undefined' && Array.isArray(lancamentos))
        ? lancamentos.filter(l => l.obra_id === oi.id) : [];
      const totalInt = ls.reduce((s, l) => s + Number(l.total || 0), 0);
      const porEtapa = {};
      ls.forEach(l => { const k = l.etapa || '(sem etapa)'; porEtapa[k] = (porEtapa[k] || 0) + Number(l.total || 0); });
      const top = Object.entries(porEtapa).sort((a, b) => b[1] - a[1]).slice(0, 5);
      const etapasHtml = top.map(([k, v]) => `<div class="custos-internos-etapa"><span>${esc(typeof etapaLabel === 'function' ? etapaLabel(k) : k)}</span><span class="custos-num">${fmtR(v)}</span></div>`).join('');
      return `<div class="custos-internos-card">
        <div class="custos-internos-head">
          <div>
            <div class="custos-obra-nome">${esc(oi.nome)}</div>
            <div class="custos-obra-cidade">centro de custo · overhead (fora dos totais de obra)</div>
          </div>
          <div class="custos-internos-total">${fmtR(totalInt)}</div>
        </div>
        <div class="custos-internos-etapas">${etapasHtml || '<div class="custos-mini">Sem lançamentos.</div>'}</div>
        <button class="custos-btn-abrir" onclick="custosAbrirDetalhe('${esc(oi.id)}')">Abrir detalhe</button>
      </div>`;
    }).join('');
    internosHtml = `<div class="custos-internos-title">Custos internos / Escritório</div>
    <div class="custos-internos">${cards}</div>`;
  }

  el.innerHTML = `${resumo}
    <div class="custos-tbl-wrap">
      <table class="custos-tbl">
        <thead>${thead}</thead>
        <tbody>${linhas}</tbody>
      </table>
    </div>
    <div class="custos-tbl-count">${obrasReais.length} obra(s)</div>
    ${internosHtml}`;
}


// ══════════════════════════════════════════════════════════════════
// VISAO 2: DETALHE DA OBRA (Lazy loading — carrega ao clicar)
// ══════════════════════════════════════════════════════════════════
async function custosAbrirDetalhe(obraId) {
  const identidade = _custosIdentidadePlano();
  const versao = CustosModule._renderPlanoSeq = (CustosModule._renderPlanoSeq || 0) + 1;
  if (typeof EntradaPlanoProjecoes !== 'undefined') await EntradaPlanoProjecoes.carregar();
  if (!_custosMesmaIdentidade(identidade, _custosIdentidadePlano()) || versao !== CustosModule._renderPlanoSeq) return;
  if (!_custosMesmaIdentidade(CustosModule._repassesDono, identidade)) await _custosCarregarRepasses();
  if (!_custosMesmaIdentidade(identidade, _custosIdentidadePlano()) || versao !== CustosModule._renderPlanoSeq) return;
  CustosModule.view = 'detalhe';
  CustosModule.obraAtual = obraId;
  CustosModule._detalheCarregado = obraId;

  const overviewEl = document.getElementById('custos-cards-overview');
  const detalheEl = document.getElementById('custos-detalhe-view');
  if (overviewEl) overviewEl.style.display = 'none';
  if (detalheEl) detalheEl.style.display = '';

  _custosRenderResumoFinanceiro(obraId);
  _custosRenderContratoCard(obraId);
  _custosRenderRepasses(obraId);
  _custosRenderHistoricoMensal(obraId);
}

function custosVoltarCards() {
  CustosModule.view = 'cards';
  CustosModule.obraAtual = '';
  CustosModule._detalheCarregado = null;
  _custosRenderCards();
}


// ── RESUMO FINANCEIRO ───────────────────────────────────────────
function _custosRenderResumoFinanceiro(obraId) {
  const el = document.getElementById('custos-resumo');
  if (!el) return;

  const todasObras = [...obras];
  if (typeof obrasArquivadas !== 'undefined') todasObras.push(...obrasArquivadas);
  const obra = todasObras.find(o => o.id === obraId);
  if (!obra) { el.innerHTML = ''; return; }

  const isAdmin = usuarioAtual?.perfil === 'admin';
  if (!isAdmin) { el.innerHTML = ''; return; }


  const repsPool = CustosModule._repassesFonte ? CustosModule.repassesCef : (typeof repassesCef !== 'undefined' && repassesCef.length) ? repassesCef : CustosModule.repassesCef;
  const repassesObra = repsPool.filter(r => r.obra_id === obraId);
  const custos = (typeof lancamentos !== 'undefined' && Array.isArray(lancamentos))
    ? lancamentos.filter(l => l.obra_id === obraId) : [];
  const adds = typeof getAdicionaisObra === 'function' ? getAdicionaisObra(obraId) : { qtd: 0, valorTotal: 0, totalRecebido: 0 };
  const fin = _custosFinanceiroDerivado(obra, repassesObra, custos, adds);
  const p = fin.plano;
  el.innerHTML = `<div class="custos-resumo-title"><span class="material-symbols-outlined" style="font-size:18px;">bar_chart</span> RESUMO FINANCEIRO — ${esc(obra.nome)}</div>
  ${!fin.planoConfirmado ? '<div class="custos-resumo-sub" role="status">Plano de entrada não confirmado. Carteira, saldo, lucro e margem indisponíveis; recarregue para confirmar.</div>' : ''}
  ${!fin.ledgerConfirmado ? '<div class="custos-resumo-sub" role="status">Recebimentos indisponíveis. Total recebido e saldo a receber aguardam leitura confirmada; recarregue.</div>' : ''}
  <div class="custos-resumo-grid">
    <div class="custos-resumo-item"><div class="custos-resumo-label">VALOR ORIGINAL DO IMÓVEL</div><div class="custos-resumo-value">${fin.vendaOriginal > 0 ? fmtR(fin.vendaOriginal) : 'Não informado'}</div></div>
    ${p?.planoId ? '<div class="custos-resumo-item"><div class="custos-resumo-label">AJUSTE LÍQUIDO DA ENTRADA</div><div class="custos-resumo-value">' + fmtR(p.ajusteCentavos / 100) + '</div><div class="custos-resumo-sub">Entrada original: ' + fmtR(p.originalCentavos / 100) + ' · Entrada atual: ' + fmtR(p.totalCentavos / 100) + '</div></div>' : ''}
    ${p?.planoId || !fin.planoConfirmado ? '<div class="custos-resumo-item"><div class="custos-resumo-label">CARTEIRA ATUAL</div><div class="custos-resumo-value">' + _custosFmtConfirmado(fin.carteira) + '</div></div>' : ''}
    <div class="custos-resumo-item"><div class="custos-resumo-label">TOTAL RECEBIDO</div><div class="custos-resumo-value green">${_custosFmtConfirmado(fin.recebidoGeral)}</div>
      <div class="custos-resumo-sub">Repasses reais: ${_custosFmtConfirmado(fin.recebido)} | Adicionais: ${_custosFmtConfirmado(fin.adicionaisRecebidos)}</div></div>
    <div class="custos-resumo-item"><div class="custos-resumo-label">SALDO A RECEBER</div><div class="custos-resumo-value" style="color:${fin.saldo >= 0 ? 'var(--primary)' : 'var(--error)'};">${_custosFmtConfirmado(fin.saldo)}</div></div>
    <div class="custos-resumo-item" style="cursor:pointer;" onclick="verLancamentosObra('${esc(obraId)}')"><div class="custos-resumo-label">CUSTO TOTAL</div><div class="custos-resumo-value yellow">${_custosFmtConfirmado(fin.custo)}</div><div class="custos-resumo-sub">ver lançamentos</div></div>
    ${adds.qtd > 0 ? '<div class="custos-resumo-item"><div class="custos-resumo-label">ADICIONAIS (' + adds.qtd + ')</div><div class="custos-resumo-value purple">' + _custosFmtConfirmado(fin.adicionais) + '</div></div>' : ''}
    <div class="custos-resumo-item"><div class="custos-resumo-label">LUCRO ESTIMADO</div><div class="custos-resumo-value" style="color:${fin.lucro >= 0 ? 'var(--success)' : 'var(--error)'};">${_custosFmtConfirmado(fin.lucro)}</div></div>
    <div class="custos-resumo-item"><div class="custos-resumo-label">MARGEM</div><div class="custos-resumo-value" style="color:${fin.margem >= 15 ? 'var(--success)' : fin.margem >= 0 ? 'var(--warning)' : 'var(--error)'};">${fin.margem != null ? fin.margem.toFixed(1) + '%' : 'Indisponível'}</div></div>
  </div>
  ${fin.pctRecebido != null && fin.receita > 0 ? '<div class="custos-progress-bar"><div class="custos-progress-header"><span>RECEBIDO vs RECEITA TOTAL</span><span style="font-weight:700;color:var(--primary);">' + fin.pctRecebido.toFixed(1) + '%</span></div><div class="custos-progress-track"><div class="custos-progress-fill" style="width:' + fin.pctRecebido + '%;"></div></div></div>' : ''}`;

}

// ��─ CONTRATO CEF ────────────────────────────────────────────────
function _custosRenderContratoCard(obraId) {
  const el = document.getElementById('custos-contrato-card');
  if (!el) return;

  const todasObras = [...obras];
  if (typeof obrasArquivadas !== 'undefined') todasObras.push(...obrasArquivadas);
  const obra = todasObras.find(o => o.id === obraId);
  if (!obra) { el.innerHTML = ''; return; }

  const contratoValor = Number(obra.contrato_valor || 0);
  const isAdmin = usuarioAtual?.perfil === 'admin';

  if (contratoValor <= 0) {
    el.innerHTML = `<div class="custos-contrato-empty">
      <span class="material-symbols-outlined" style="font-size:18px;color:var(--text-tertiary);">description</span>
      Sem contrato CEF — ${isAdmin ? `<button class="custos-link-btn" onclick="custosAbrirModalContrato('${esc(obraId)}')">cadastrar</button>` : 'contate o admin'}
    </div>`;
    return;
  }

  if (!_custosLedgerConfirmado()) {
    el.innerHTML = '<div class="custos-contrato-card"><div class="custos-contrato-title">CONTRATO CEF ORIGINAL</div><div class="custos-contrato-valor">' + fmtR(contratoValor) + '</div><div role="status">Recebimentos e saldo do contrato indisponíveis. Recarregue para confirmar.</div></div>';
    return;
  }

  const contratoEntrada = Number(obra.contrato_entrada || 0);
  const contratoTerreno = Number(obra.contrato_terreno || 0);
  const contratoTaxa = obra.contrato_taxa || '';
  const contratoPrazo = obra.contrato_prazo || '';
  const contratoData = obra.contrato_data || '';
  const contratoValorEdr = Number(obra.contrato_valor_edr || 0);

  const repassesObra = CustosModule.repassesCef.filter(r => r.obra_id === obraId);
  const totalRecebido = repassesObra.reduce((s, r) => s + Number(r.valor || 0), 0);
  const falta = contratoValor - totalRecebido;
  const pctRecebido = contratoValor > 0 ? Math.min((totalRecebido / contratoValor) * 100, 100) : 0;

  const totalTerrenoPago = repassesObra.filter(r => (r.tipo || 'pls') === 'terreno').reduce((s, r) => s + Number(r.valor || 0), 0);
  const terrenoOk = contratoTerreno > 0 && (obra.terreno_pago || totalTerrenoPago >= contratoTerreno);

  /* ENTRADA DO CLIENTE — regra única em edr-v2-entrada-cliente.js.
     Antes desta correção (2026-08-03) o selo exibia `contratoEntrada` inteiro:
     com 14.000 contratados e 5.000 lançados, dizia "14.000 pendente".
     NÃO mexer no `falta` acima: `totalRecebido` já inclui os repasses de
     entrada; descontar de novo contaria a entrada duas vezes. */
  const entrada = EntradaCliente.calcular(obra, repassesObra, typeof EntradaPlanoProjecoes !== 'undefined' ? EntradaPlanoProjecoes.atual() : undefined);

  const infoParts = [];
  if (contratoTaxa) infoParts.push(`Taxa: ${esc(contratoTaxa)}`);
  if (contratoPrazo) infoParts.push(`Prazo: ${esc(contratoPrazo)}`);
  if (contratoData) infoParts.push(`Data: ${fmtData(contratoData)}`);

  el.innerHTML = `<div class="custos-contrato-card">
    <div class="custos-contrato-header">
      <div class="custos-contrato-title">
        <span class="material-symbols-outlined" style="font-size:18px;">description</span>
        CONTRATO CEF ORIGINAL
      </div>
      <div class="custos-contrato-valor">${fmtR(contratoValor)}${contratoValorEdr > 0 ? ` <span style="font-size:12px;color:var(--text-secondary);">EDR: ${fmtR(contratoValorEdr)}</span>` : ''}</div>
    </div>
    <div class="custos-progress-track" style="height:8px;margin:12px 0;">
      <div class="custos-progress-fill" style="width:${pctRecebido}%;"></div>
    </div>
    <div class="custos-contrato-stats">
      <span>${pctRecebido.toFixed(0)}% recebido</span>
      <span>Recebido: <strong style="color:var(--primary);">${fmtR(totalRecebido)}</strong> | Falta: <strong style="color:var(--warning);">${fmtR(falta)}</strong></span>
    </div>
    <div class="custos-contrato-tags">
      ${entrada.status !== 'sem_contrato' ? `<span class="custos-contrato-tag ${EntradaCliente.cor(entrada)}" ${entrada.alerta ? `title="${esc(entrada.alerta)}"` : ''}>${entrada.quitada ? '&#10003; ' : ''}${esc(EntradaCliente.rotulo(entrada, fmtR))}</span>` : ''}
      ${contratoTerreno > 0 ? `<span class="custos-contrato-tag purple">Terreno: ${fmtR(contratoTerreno)}</span>` : ''}
    </div>
    ${infoParts.length ? `<div class="custos-contrato-info">${infoParts.join(' | ')}</div>` : ''}
    ${isAdmin ? `<button class="btn-secondary" style="margin-top:12px;" onclick="custosAbrirModalContrato('${esc(obraId)}')">
      <span class="material-symbols-outlined" style="font-size:16px;">edit</span>Editar contrato</button>` : ''}
  </div>`;
}


// ── REPASSES DETALHADOS ─────────────────────────────────────────
function _custosRenderRepasses(obraId) {
  const el = document.getElementById('custos-detalhes');
  if (!el) return;
  if (!_custosLedgerConfirmado()) { el.innerHTML = '<div role="status">Recebimentos indisponíveis. Recarregue para confirmar.</div>'; return; }

  const todasObras = [...obras];
  if (typeof obrasArquivadas !== 'undefined') todasObras.push(...obrasArquivadas);
  const getNome = id => todasObras.find(o => o.id === id)?.nome || 'Obra removida';

  let lista = [...CustosModule.repassesCef].sort((a, b) => (b.data_credito || '').localeCompare(a.data_credito || ''));
  if (obraId) lista = lista.filter(r => r.obra_id === obraId);

  if (!lista.length) {
    el.innerHTML = `<div style="text-align:center;padding:32px;color:var(--text-tertiary);">Nenhum repasse CEF registrado.</div>`;
    return;
  }

  const isAdmin = usuarioAtual?.perfil === 'admin';
  const total = lista.reduce((s, r) => s + Number(r.valor || 0), 0);

  el.innerHTML = `<div class="custos-table-wrap">
    <table class="custos-table">
      <thead><tr>
        <th>TIPO</th><th>MED. No</th><th>VALOR</th><th>DATA CREDITO</th><th>OBS</th>${isAdmin ? '<th style="text-align:center;">ACAO</th>' : ''}
      </tr></thead>
      <tbody>
      ${lista.sort((a, b) => (a.medicao_numero || 0) - (b.medicao_numero || 0)).map(r => {
        const tipoR = r.tipo || 'pls';
        const tipoLabel = tipoR === 'entrada' ? 'ENTRADA' : tipoR === 'terreno' ? 'TERRENO' : 'PLS';
        const tipoClass = tipoR === 'entrada' ? 'blue' : tipoR === 'terreno' ? 'purple' : 'green';
        const medLabel = (tipoR === 'entrada' || tipoR === 'terreno') ? '-' : '#' + r.medicao_numero;
        return `<tr>
          <td><span class="custos-tipo-badge ${tipoClass}">${tipoLabel}</span></td>
          <td style="font-weight:700;">${medLabel}</td>
          <td class="${tipoClass}" style="font-weight:600;">${fmtR(r.valor)}</td>
          <td>${fmtData(r.data_credito)}</td>
          <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(r.observacao || '-')}</td>
          ${isAdmin ? `<td style="text-align:center;white-space:nowrap;">
            <button class="custos-action-btn blue" onclick="custosEditarRepasse('${esc(r.id)}')"><span class="material-symbols-outlined" style="font-size:14px;">edit</span></button>
            <button class="custos-action-btn red" onclick="custosExcluirRepasse('${esc(r.id)}')"><span class="material-symbols-outlined" style="font-size:14px;">delete</span></button>
          </td>` : ''}
        </tr>`;
      }).join('')}
      </tbody>
      <tfoot><tr>
        <td colspan="2" style="font-weight:700;">TOTAL</td>
        <td style="font-weight:800;color:var(--primary);">${fmtR(total)}</td>
        <td colspan="${isAdmin ? '3' : '2'}"></td>
      </tr></tfoot>
    </table>
  </div>`;
}


// ── HISTORICO MENSAL ─────────────────────────────────────────────
function _custosRenderHistoricoMensal(obraId) {
  const el = document.getElementById('custos-historico-mensal');
  if (!el) return;

  let lista = [...CustosModule.repassesCef];
  if (obraId) lista = lista.filter(r => r.obra_id === obraId);
  if (!lista.length) { el.innerHTML = ''; return; }

  const todasObras = [...obras];
  if (typeof obrasArquivadas !== 'undefined') todasObras.push(...obrasArquivadas);
  const getNome = id => todasObras.find(o => o.id === id)?.nome || 'Obra removida';

  // Agrupar por mes
  const porMes = {};
  lista.forEach(r => {
    const mes = r.data_credito ? r.data_credito.substring(0, 7) : 'sem-data';
    if (!porMes[mes]) porMes[mes] = [];
    porMes[mes].push(r);
  });

  const meses = Object.keys(porMes).sort().reverse();

  el.innerHTML = `<div class="custos-historico-title">
    <span class="material-symbols-outlined" style="font-size:18px;color:var(--primary);">calendar_month</span>
    HISTORICO MENSAL
  </div>
  ${meses.map(mes => {
    const reps = porMes[mes];
    const totalMes = reps.reduce((s, r) => s + Number(r.valor || 0), 0);
    const label = mes !== 'sem-data' ? new Date(mes + '-15').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) : 'Sem data';
    return `<div class="custos-historico-mes">
      <div class="custos-historico-mes-header">
        <span style="text-transform:capitalize;">${label}</span>
        <span style="font-weight:700;color:var(--primary);">${fmtR(totalMes)}</span>
      </div>
      ${reps.sort((a, b) => (a.medicao_numero || 0) - (b.medicao_numero || 0)).map(r => {
        const tipoR = r.tipo || 'pls';
        const tipoClass = tipoR === 'entrada' ? 'blue' : tipoR === 'terreno' ? 'purple' : 'green';
        const medInfo = (tipoR === 'entrada' || tipoR === 'terreno') ? '' : ` — Med. #${r.medicao_numero}`;
        return `<div class="custos-historico-item">
          <span><span class="custos-tipo-badge ${tipoClass}" style="font-size:9px;">${tipoR.toUpperCase()}</span> ${obraId ? '' : esc(getNome(r.obra_id))}${medInfo}</span>
          <span class="${tipoClass}" style="font-weight:600;">${fmtR(r.valor)}</span>
        </div>`;
      }).join('')}
    </div>`;
  }).join('')}`;
}


// ══════════════════════════════════════════════════════════════════
// CRUD REPASSES CEF (Modais V2 — sem prompt() nativo)
// ══════════════════════════════════════════════════════════════════

function custosAbrirModalRepasse(obraId) {
  const modal = document.getElementById('custos-modal-repasse');
  if (!modal) return;
  const content = modal.querySelector('.modal');
  if (!content) return;

  const todasObras = [...obras];
  if (typeof obrasArquivadas !== 'undefined') todasObras.push(...obrasArquivadas);
  const obrasOpts = todasObras.map(o => `<option value="${esc(o.id)}" ${o.id === obraId ? 'selected' : ''}>${esc(o.nome)}</option>`).join('');

  // Auto-incrementar medicao
  let proxMedicao = 1;
  if (obraId) {
    const existentes = CustosModule.repassesCef.filter(r => r.obra_id === obraId && (r.tipo || 'pls') === 'pls');
    proxMedicao = existentes.reduce((m, r) => Math.max(m, r.medicao_numero || 0), 0) + 1;
  }

  content.innerHTML = `
    <div class="modal-title">
      <span class="material-symbols-outlined" style="color:var(--primary);">add_card</span>
      Novo Repasse CEF
      <button class="modal-close" onclick="closeModal('custos-modal-repasse')"><span class="material-symbols-outlined">close</span></button>
    </div>
    <input type="hidden" id="repasse-edit-id" value=""/>
    <div class="dist-form-grid">
      <div class="dist-form-field" style="grid-column:span 2;">
        <label class="dist-form-label">Obra</label>
        <select class="dist-form-input" id="repasse-obra" style="padding:0 8px;"><option value="">Selecione...</option>${obrasOpts}</select>
      </div>
      <div class="dist-form-field">
        <label class="dist-form-label">Tipo</label>
        <select class="dist-form-input" id="repasse-tipo" style="padding:0 8px;" onchange="_custosTipoChange()">
          <option value="pls" selected>PLS (Medicao)</option>
          <option value="entrada">Entrada (Cliente)</option>
          <option value="terreno">Terreno</option>
        </select>
      </div>
      <div class="dist-form-field" id="repasse-medicao-wrap">
        <label class="dist-form-label">Medicao No</label>
        <input class="dist-form-input" id="repasse-medicao" type="number" min="1" value="${proxMedicao}"/>
      </div>
      <div class="dist-form-field">
        <label class="dist-form-label">Valor (R$)</label>
        <input class="dist-form-input" id="repasse-valor" type="number" min="0" step="0.01" placeholder="0,00"/>
      </div>
      <div class="dist-form-field">
        <label class="dist-form-label">Data Credito</label>
        <input class="dist-form-input" id="repasse-data" type="date" value="${hojeISO()}"/>
      </div>
      <div class="dist-form-field" style="grid-column:span 2;">
        <label class="dist-form-label">Observacao</label>
        <input class="dist-form-input" id="repasse-obs" type="text" placeholder="Opcional..."/>
      </div>
    </div>
    <div style="display:flex;gap:12px;margin-top:24px;">
      <button class="btn-primary" style="flex:1;padding:14px;font-size:15px;justify-content:center;" onclick="custosSalvarRepasse()">
        <span class="material-symbols-outlined" style="font-size:20px;">save</span>Salvar Repasse</button>
    </div>`;

  openModal('custos-modal-repasse');
}

function _custosTipoChange() {
  const tipo = document.getElementById('repasse-tipo')?.value;
  const wrap = document.getElementById('repasse-medicao-wrap');
  if (wrap) wrap.style.display = (tipo === 'entrada' || tipo === 'terreno') ? 'none' : '';
}

async function custosEditarRepasse(id) {
  const r = CustosModule.repassesCef.find(x => x.id === id);
  if (!r) return;
  if ((r.tipo || 'pls') === 'entrada' && !await _custosEntradaLegadaPermitida(r.obra_id)) return;
  custosAbrirModalRepasse(r.obra_id);
  // Preencher campos apos abrir
  setTimeout(() => {
    const editId = document.getElementById('repasse-edit-id');
    if (editId) editId.value = r.id;
    const tipo = document.getElementById('repasse-tipo');
    if (tipo) { tipo.value = r.tipo || 'pls'; _custosTipoChange(); }
    const medicao = document.getElementById('repasse-medicao');
    if (medicao) medicao.value = r.medicao_numero || '';
    const valor = document.getElementById('repasse-valor');
    if (valor) valor.value = r.valor || '';
    const data = document.getElementById('repasse-data');
    if (data) data.value = r.data_credito || '';
    const obs = document.getElementById('repasse-obs');
    if (obs) obs.value = r.observacao || '';
  }, 50);
}

async function custosSalvarRepasse() {
  const obraId = document.getElementById('repasse-obra')?.value;
  const tipo = document.getElementById('repasse-tipo')?.value;
  const medicao = parseInt(document.getElementById('repasse-medicao')?.value) || 0;
  const valor = parseFloat(document.getElementById('repasse-valor')?.value);
  const data = document.getElementById('repasse-data')?.value;
  const obs = (document.getElementById('repasse-obs')?.value || '').trim();
  const editId = document.getElementById('repasse-edit-id')?.value;

  if (!obraId) return showToast('Selecione uma obra', 5000);
  const anterior = CustosModule.repassesCef.find(r => r.id === editId);
  if ((tipo === 'entrada' || anterior?.tipo === 'entrada') && !await _custosEntradaLegadaPermitida(anterior?.obra_id || obraId)) return;
  if (tipo === 'pls' && medicao < 1) return showToast('Informe o numero da medicao', 5000);
  if (!valor || valor <= 0) return showToast('Informe o valor', 5000);
  if (!data) return showToast('Informe a data', 5000);

  const body = { obra_id: obraId, medicao_numero: medicao, valor, data_credito: data, observacao: obs, tipo };
  const params = {
    p_obra_id: obraId,
    p_medicao_numero: medicao,
    p_valor: valor,
    p_data_credito: data,
    p_observacao: obs,
    p_tipo: tipo,
    p_repasse_id: editId || null
  };

  // A RPC deriva company_id e papel no servidor. Enquanto a migration ainda nao
  // estiver aplicada, preserva o caminho REST legado para nao quebrar o modulo.
  const respostaRpc = await sbRpc('salvar_repasse_cef', params);
  if (respostaRpc !== 'RPC_AUSENTE') {
    const salvoRpc = Array.isArray(respostaRpc) ? respostaRpc[0] : respostaRpc;
    if (!salvoRpc) {
      showToast('Nao foi possivel salvar o repasse. Recarregue e tente novamente.', 5000);
      return;
    }
    showToast(editId ? 'Repasse atualizado' : 'Repasse salvo');
    closeModal('custos-modal-repasse');
    await _custosCarregarRepasses();
    if (CustosModule.obraAtual) custosAbrirDetalhe(CustosModule.obraAtual);
    else _custosRenderCards();
    return;
  }

  if (editId) {
    // sbPatch (infra): objeto = persistiu / undefined = 0 linhas (id inexistente/RLS) / null = erro HTTP.
    const salvo = await sbPatch('repasses_cef', `?id=eq.${editId}`, body);
    if (!salvo) {
      showToast(salvo === null ? 'Erro ao salvar o repasse.' : 'Repasse nao encontrado — recarregue.', 5000);
      return; // mantem modal aberto, nao recarrega/renderiza (tela nao recalcula com repasse nao persistido)
    }
    showToast('Repasse atualizado');
  } else {
    const criado = await sbPost('repasses_cef', body);
    if (!criado) {
      showToast('Erro ao criar o repasse.', 5000);
      return; // mantem modal aberto, nao recarrega/renderiza
    }
    showToast('Repasse salvo');
  }

  closeModal('custos-modal-repasse');
  await _custosCarregarRepasses();
  if (CustosModule.obraAtual) custosAbrirDetalhe(CustosModule.obraAtual);
  else _custosRenderCards();
}

async function custosExcluirRepasse(id) {
  const registro = CustosModule.repassesCef.find(r => r.id === id);
  if (!registro) { showToast('Repasse não encontrado. Recarregue antes de excluir.'); return; }
  if ((registro.tipo || 'pls') === 'entrada' && !await _custosEntradaLegadaPermitida(registro.obra_id)) return;
  const ok = await confirmar('Excluir este repasse CEF? Esta acao nao pode ser desfeita.');
  if (!ok) return;
  // sbDelete 3-estados: >0 apagou / 0 nao apagou (id inexistente/RLS) / null erro HTTP.
  const apagou = await sbDelete('repasses_cef', `?id=eq.${id}`);
  if (apagou === null) { showToast('Erro ao excluir o repasse.', 5000); return; } // nao recarrega/renderiza
  showToast(apagou ? 'Repasse excluido' : 'Repasse ja nao existia — lista atualizada.');
  await _custosCarregarRepasses();
  if (CustosModule.obraAtual) custosAbrirDetalhe(CustosModule.obraAtual);
  else _custosRenderCards();
}


// ══════════════════════════════════════════════════════════════════
// MODAL CONTRATO CEF (V2 — sem prompt() nativo)
// ══════════════════════════════════════════════════════════════════

function custosAbrirModalContrato(obraId) {
  const modal = document.getElementById('custos-modal-contrato');
  if (!modal) return;
  const content = modal.querySelector('.modal');
  if (!content) return;

  const todasObras = [...obras];
  if (typeof obrasArquivadas !== 'undefined') todasObras.push(...obrasArquivadas);
  const obra = todasObras.find(o => o.id === obraId);
  if (!obra) return;

  const _vv = Number(obra.contrato_valor||0)+Number(obra.contrato_subsidio||0)+Number(obra.contrato_fgts||0)+Number(obra.contrato_entrada||0);

  content.innerHTML = `
    <div class="modal-title">
      <span class="material-symbols-outlined" style="color:var(--primary);">description</span>
      Contrato CEF — ${esc(obra.nome)}
      <button class="modal-close" onclick="closeModal('custos-modal-contrato')"><span class="material-symbols-outlined">close</span></button>
    </div>
    <input type="hidden" id="contrato-obra-id" value="${esc(obraId)}"/>

    <!-- Valor de Venda destacado -->
    <div style="background:var(--primary-light,rgba(45,106,79,0.08));border:1px solid var(--primary-border,rgba(45,106,79,0.2));border-radius:10px;padding:12px;margin-bottom:16px;text-align:center;">
      <div style="font-size:9px;color:var(--text-secondary);letter-spacing:1px;font-weight:700;text-transform:uppercase;">Valor de Venda do Imóvel</div>
      <div id="contrato-venda-valor" style="font-family:'Plus Jakarta Sans',sans-serif;font-size:22px;font-weight:800;color:var(--primary);margin-top:4px;">${fmtR(_vv)}</div>
      <div id="contrato-venda-alerta" style="display:none;font-size:10px;color:var(--error,#ef4444);margin-top:4px;font-weight:700;"></div>
    </div>

    <!-- Seção: Valores Recebidos do Banco -->
    <div style="font-size:10px;color:var(--text-secondary);letter-spacing:1.5px;font-weight:700;margin-bottom:8px;">
      <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">account_balance</span> VALORES RECEBIDOS DO BANCO</div>
    <div style="display:flex;gap:8px;margin-bottom:4px;">
      <div style="flex:1;">
        <label style="font-size:11px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:4px;">FINANCIADO (R$) *</label>
        <input class="dist-form-input" id="contrato-valor" type="number" step="0.01" placeholder="Valor financiado" value="${obra.contrato_valor || ''}" oninput="_custosCalcValorVenda()"/>
      </div>
      <div style="flex:1;">
        <label style="font-size:11px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:4px;">SUBSÍDIO (R$)</label>
        <input class="dist-form-input" id="contrato-subsidio" type="number" step="0.01" placeholder="Desconto governo" value="${obra.contrato_subsidio || ''}" oninput="_custosCalcValorVenda()"/>
      </div>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:16px;">
      <div style="flex:1;">
        <label style="font-size:11px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:4px;">FGTS (R$)</label>
        <input class="dist-form-input" id="contrato-fgts" type="number" step="0.01" placeholder="Saque FGTS" value="${obra.contrato_fgts || ''}" oninput="_custosCalcValorVenda()"/>
      </div>
      <div style="flex:1;">
        <label style="font-size:11px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:4px;">TERRENO (R$)</label>
        <input class="dist-form-input" id="contrato-terreno" type="number" step="0.01" placeholder="Valor do terreno (informativo)" value="${obra.contrato_terreno || ''}" style="border-style:dashed;"/>
        <span style="font-size:9px;color:var(--text-secondary);font-style:italic;">Incluso no financiado, apenas informativo</span>
      </div>
    </div>

    <!-- Seção: Valores Pagos pelo Cliente -->
    <div style="font-size:10px;color:var(--text-secondary);letter-spacing:1.5px;font-weight:700;margin-bottom:8px;">
      <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">payments</span> VALORES PAGOS PELO CLIENTE</div>
    <div style="display:flex;gap:8px;margin-bottom:8px;">
      <div style="flex:1;">
        <label style="font-size:11px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:4px;">ENTRADA (R$)</label>
        <input class="dist-form-input" id="contrato-entrada" type="number" step="0.01" placeholder="Entrada do cliente" value="${obra.contrato_entrada || ''}" oninput="_custosCalcValorVenda()"/>
      </div>
      <div style="flex:1;"></div>
    </div>
    <div style="margin-bottom:16px;">
      <label style="display:flex;align-items:flex-start;gap:6px;cursor:pointer;font-size:12px;color:var(--text-secondary);">
        <input type="checkbox" id="contrato-entrada-paga" ${obra.entrada_paga ? 'checked' : ''} style="accent-color:var(--primary);width:16px;height:16px;margin-top:1px;flex:0 0 auto;"/>
        <span>Marca legada de conciliação — <strong>não registra recebimento</strong></span>
      </label>
      <div style="font-size:10.5px;color:var(--text-tertiary);margin:5px 0 0 22px;line-height:1.45;">
        O valor recebido vem dos <strong>repasses do tipo Entrada</strong>. Para registrar
        que o cliente pagou, lance o repasse — marcar aqui não soma ao caixa nem quita a entrada.
      </div>
    </div>

    <!-- Seção: Dados do Contrato -->
    <div style="font-size:10px;color:var(--text-secondary);letter-spacing:1.5px;font-weight:700;margin-bottom:8px;">
      <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">description</span> DADOS DO CONTRATO</div>
    <div style="display:flex;gap:8px;margin-bottom:8px;">
      <div style="flex:1;">
        <label style="font-size:11px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:4px;">TAXA (% a.a.)</label>
        <input class="dist-form-input" id="contrato-taxa" type="text" placeholder="Ex: 7,95%" value="${esc(obra.contrato_taxa || '')}"/>
      </div>
      <div style="flex:1;">
        <label style="font-size:11px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:4px;">PRAZO</label>
        <input class="dist-form-input" id="contrato-prazo" type="text" placeholder="Ex: 360 meses" value="${esc(obra.contrato_prazo || '')}"/>
      </div>
    </div>
    <div style="margin-bottom:16px;">
      <label style="font-size:11px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:4px;">DATA DO CONTRATO</label>
      <input class="dist-form-input" id="contrato-data" type="date" value="${obra.contrato_data || ''}"/>
    </div>

    <div style="display:flex;gap:10px;margin-top:8px;">
      <button class="btn-primary" style="flex:1;padding:12px;font-size:14px;justify-content:center;" onclick="custosSalvarContrato()">
        <span class="material-symbols-outlined" style="font-size:18px;">save</span> Salvar Contrato</button>
      <button class="btn-secondary" style="padding:12px 20px;font-size:14px;" onclick="closeModal('custos-modal-contrato')">Cancelar</button>
    </div>`;

  openModal('custos-modal-contrato');
}

function _custosCalcValorVenda() {
  const fin = parseFloat(document.getElementById('contrato-valor')?.value) || 0;
  const sub = parseFloat(document.getElementById('contrato-subsidio')?.value) || 0;
  const fgts = parseFloat(document.getElementById('contrato-fgts')?.value) || 0;
  const ent = parseFloat(document.getElementById('contrato-entrada')?.value) || 0;
  const total = fin + sub + fgts + ent;
  const el = document.getElementById('contrato-venda-valor');
  if (el) el.textContent = fmtR(total);

  const obraId = document.getElementById('contrato-obra-id')?.value;
  const obra = [...obras, ...(typeof obrasArquivadas !== 'undefined' ? obrasArquivadas : [])].find(o => o.id === obraId);
  const alertaEl = document.getElementById('contrato-venda-alerta');
  if (alertaEl && obra && obra.valor_venda > 0 && total > 0 && Math.abs(total - Number(obra.valor_venda)) > 1) {
    alertaEl.textContent = `Difere do valor atual (${fmtR(obra.valor_venda)}). Ao salvar, sera atualizado.`;
    alertaEl.style.display = 'block';
  } else if (alertaEl) {
    alertaEl.style.display = 'none';
  }
}

async function custosSalvarContrato() {
  const obraId = document.getElementById('contrato-obra-id')?.value;
  if (!obraId) return;

  const fin = parseFloat(document.getElementById('contrato-valor')?.value) || 0;
  const sub = parseFloat(document.getElementById('contrato-subsidio')?.value) || 0;
  const fgts = parseFloat(document.getElementById('contrato-fgts')?.value) || 0;
  const ent = parseFloat(document.getElementById('contrato-entrada')?.value) || 0;
  const terreno = parseFloat(document.getElementById('contrato-terreno')?.value) || 0;
  const entPaga = document.getElementById('contrato-entrada-paga')?.checked || false;
  const taxa = (document.getElementById('contrato-taxa')?.value || '').trim();
  const prazo = (document.getElementById('contrato-prazo')?.value || '').trim();
  const data = document.getElementById('contrato-data')?.value || null;

  if (fin <= 0) return showToast('Informe o valor financiado', 5000);

  const valorVenda = fin + sub + fgts + ent;

  const body = {
    contrato_valor: fin, contrato_subsidio: sub, contrato_fgts: fgts,
    contrato_entrada: ent, contrato_terreno: terreno,
    valor_venda: valorVenda,
    entrada_paga: entPaga, contrato_taxa: taxa, contrato_prazo: prazo, contrato_data: data,
  };

  // sbPatch (infra): objeto = persistiu / undefined = 0 linhas (obra inexistente/RLS) / null = erro HTTP.
  const salvo = await sbPatch('obras', `?id=eq.${obraId}`, body);
  if (!salvo) {
    showToast(salvo === null ? 'Erro ao salvar o contrato.' : 'Obra nao encontrada — recarregue.', 5000);
    return; // nao Object.assign, nao fecha modal, nao renderiza (contrato define valor_venda -> receita/lucro/margem)
  }

  // Atualizar obra local SO apos persistir
  const obra = [...obras, ...(typeof obrasArquivadas !== 'undefined' ? obrasArquivadas : [])].find(o => o.id === obraId);
  if (obra) Object.assign(obra, body);

  closeModal('custos-modal-contrato');
  showToast('Contrato salvo');
  _custosRenderContratoCard(obraId);
  _custosRenderResumoFinanceiro(obraId);
}


// ══════════════════════════════════════════════════════════════════
// RELATORIO IMPRESSO
// ══════════════════════════════════════════════════════════════════

function custosGerarRelatorio(obraIdParam) {
  const todasObras = [...obras];
  if (typeof obrasArquivadas !== 'undefined') todasObras.push(...obrasArquivadas);
  const getNome = id => todasObras.find(o => o.id === id)?.nome || 'Obra removida';
  const obraId = obraIdParam || CustosModule.obraAtual || '';

  let lista = [...CustosModule.repassesCef].sort((a, b) => (a.data_credito || '').localeCompare(b.data_credito || ''));
  if (obraId) lista = lista.filter(r => r.obra_id === obraId);

  const totalGeral = _custosLedgerConfirmado() ? _custosSomarReais(lista.map(r => r.valor || 0)) : null;

  const porObra = {};
  lista.forEach(r => {
    if (!porObra[r.obra_id]) porObra[r.obra_id] = { nome: getNome(r.obra_id), reps: [] };
    porObra[r.obra_id].reps.push(r);
  });

  if (obraId && !porObra[obraId] && todasObras.some(o => o.id === obraId)) porObra[obraId] = { nome: getNome(obraId), reps: [] };

  let html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Relatorio Custos CEF</title>
    <style>
      body{font-family:'Inter',Arial,sans-serif;padding:30px;color:#222;font-size:12px;}
      h1{font-size:18px;margin-bottom:4px;color:#2D6A4F;}
      h2{font-size:14px;margin-top:20px;border-bottom:2px solid #2D6A4F;padding-bottom:4px;}
      table{width:100%;border-collapse:collapse;margin-top:8px;}
      th,td{border:1px solid #ddd;padding:6px 8px;text-align:left;}
      th{background:#ECFDF5;font-weight:700;}
      .total{font-weight:700;color:#2D6A4F;}
      .right{text-align:right;}
      @media print{body{padding:10px;}}
    </style></head><body>
    <h1>EDR ENGENHARIA — RELATORIO DE REPASSES CEF</h1>
    <p>Gerado em: ${new Date().toLocaleDateString('pt-BR')} — Total geral: <strong class="total">${_custosFmtConfirmado(totalGeral)}</strong></p>`;

  for (const [oid, data] of Object.entries(porObra)) {
    const totalObra = data.reps.reduce((s, r) => s + Number(r.valor || 0), 0);
    const obraObj = todasObras.find(o => o.id === oid);

    const custos = (typeof lancamentos !== 'undefined' && Array.isArray(lancamentos))
      ? lancamentos.filter(l => l.obra_id === oid) : [];
    const adds = typeof getAdicionaisObra === 'function' ? getAdicionaisObra(oid) : { qtd: 0, valorTotal: 0, totalRecebido: 0 };
    const fin = _custosFinanceiroDerivado(obraObj || { id: oid }, data.reps, custos, adds);
    const p = fin.plano;
    html += `<h2>${esc(data.nome)} — Repasses recebidos: ${_custosFmtConfirmado(fin.recebido)}</h2>
      ${!fin.planoConfirmado ? '<p>Plano de entrada não confirmado. Valores derivados indisponíveis.</p>' : ''}
      ${!fin.ledgerConfirmado ? '<p>Recebimentos indisponíveis. Total recebido e saldo aguardam leitura confirmada.</p>' : ''}
      <table><tbody>
        <tr><td>Valor original do imóvel</td><td class="right">${_custosFmtConfirmado(fin.vendaOriginal)}</td></tr>
        ${Number(obraObj?.contrato_valor) > 0 ? '<tr><td>Contrato CEF original</td><td class="right">' + fmtR(obraObj.contrato_valor) + '</td></tr>' : ''}
        ${p?.planoId ? '<tr><td>Entrada original / atual</td><td class="right">' + fmtR(p.originalCentavos / 100) + ' / ' + fmtR(p.totalCentavos / 100) + '</td></tr><tr><td>Ajuste líquido da entrada</td><td class="right">' + fmtR(p.ajusteCentavos / 100) + '</td></tr>' : ''}
        <tr><td>Carteira atual</td><td class="right">${_custosFmtConfirmado(fin.carteira)}</td></tr>
        <tr><td>Adicionais aprovados / recebidos</td><td class="right">${_custosFmtConfirmado(fin.adicionais)} / ${_custosFmtConfirmado(fin.adicionaisRecebidos)}</td></tr>
        <tr><td>Receita total prevista</td><td class="right">${_custosFmtConfirmado(fin.receita)}</td></tr>
        <tr><td>Total recebido</td><td class="right">${_custosFmtConfirmado(fin.recebidoGeral)}</td></tr>
        <tr><td>Saldo a receber</td><td class="right">${_custosFmtConfirmado(fin.saldo)}</td></tr>
        <tr><td>Custo Total</td><td class="right">${_custosFmtConfirmado(fin.custo)}</td></tr>
        <tr><td><strong>Lucro Estimado</strong></td><td class="right total">${_custosFmtConfirmado(fin.lucro)}</td></tr>
        <tr><td><strong>Margem</strong></td><td class="right total">${fin.margem != null ? fin.margem.toFixed(1) + '%' : 'Indisponível'}</td></tr>
      </tbody></table>`;
    html += `<table><thead><tr><th>Tipo</th><th>Med. No</th><th>Valor</th><th>Data</th><th>Obs</th></tr></thead><tbody>`;
    data.reps.sort((a, b) => (a.medicao_numero || 0) - (b.medicao_numero || 0)).forEach(r => {
      const tipoR = r.tipo || 'pls';
      const tipoLb = tipoR === 'entrada' ? 'ENTRADA' : tipoR === 'terreno' ? 'TERRENO' : 'PLS';
      const medLb = (tipoR === 'entrada' || tipoR === 'terreno') ? '-' : '#' + r.medicao_numero;
      html += `<tr><td>${tipoLb}</td><td>${medLb}</td><td class="right total">${fmtR(r.valor)}</td><td>${fmtData(r.data_credito)}</td><td>${esc(r.observacao || '-')}</td></tr>`;
    });
    html += `</tbody></table>`;
  }

  html += '</body></html>';
  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
  w.print();
}


// ══════════════════════════════════════════════════════════════════
// FUNCAO LEGADA (chamada de outros modulos)
// ══════════════════════════════════════════════════════════════════
function verLancamentosObra(obraId) {
  if (typeof obrasOrdem !== 'undefined') obrasOrdem = 'valor';
  if (typeof viewRegistry !== 'undefined') viewRegistry.show('obras');
  setTimeout(() => {
    if (typeof obrasAbrirDetalhe === 'function') obrasAbrirDetalhe(obraId);
  }, 50);
}


// ══════════════════════════════════════════════════════════════════
// FILTROS (conecta ao preview)
// ══════════════════════════════════════════════════════════════��═══
function custosBuscar(valor) {
  clearTimeout(CustosModule._buscaTimer);
  CustosModule._buscaTimer = setTimeout(() => {
    CustosModule.filtroBusca = valor;
    _custosRenderCards();
  }, 300);
}

function custosFiltrarPeriodo(valor) {
  CustosModule.filtroPeriodo = valor;
  _custosRenderCards();
}


// ══════════════════════════════════════════════════════════════════
// HELPERS MODAIS (reusa do shell)
// ════════════════════════════════════════════════════════════���═════
// openModal / closeModal — definidos no index.html (com fallback modal- prefix)


// ══════════════════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════════════════
// Init movido pra viewRegistry — carrega repasses só quando a view for aberta

async function _custosEntradaLegadaPermitida(obraId) {
  if (typeof EntradaPlano === 'undefined' || typeof EntradaPlano.guardarLegado !== 'function') {
    showToast('Controle do plano indisponível. Recarregue antes de alterar a entrada.');
    return false;
  }
  const conferido = await EntradaPlano.guardarLegado(obraId);
  if (!conferido.permitido) showToast(conferido.mensagem);
  return conferido.permitido;
}
