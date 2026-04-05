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


// ── REGISTRO NO VIEW REGISTRY ───────────────────────────────────
if (typeof viewRegistry !== 'undefined') {
  viewRegistry.register('custos', renderCustosView);
}


// ══════════════════════════════════════════════════════════════════
// INIT — Carregar repasses CEF
// ══════════════════════════════════════════════════════════════════
async function _custosCarregarRepasses() {
  try {
    const r = await sbGet('repasses_cef', '?order=data_credito.desc');
    CustosModule.repassesCef = Array.isArray(r) ? r : [];
  } catch (e) { CustosModule.repassesCef = []; }
}


// ══════════════════════════════════════════════════════════════════
// RENDER PRINCIPAL
// ══════════════════════════════════════════════════════════════════
async function renderCustosView() {
  if (!CustosModule.repassesCef.length) await _custosCarregarRepasses();
  if (CustosModule.view === 'detalhe' && CustosModule.obraAtual) {
    _custosRenderDetalhe(CustosModule.obraAtual);
  } else {
    _custosRenderCards();
  }
  aplicarPerfil();
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

  el.innerHTML = todasObras.map(o => {
    // Repasses da obra (totais macro — sem carregar detalhes)
    let reps = CustosModule.repassesCef.filter(r => r.obra_id === o.id);
    if (dataLimite) reps = reps.filter(r => r.data_credito && new Date(r.data_credito + 'T12:00:00') >= dataLimite);

    const totalPls = reps.filter(r => (r.tipo || 'pls') === 'pls').reduce((s, r) => s + Number(r.valor || 0), 0);
    const totalEntrada = reps.filter(r => (r.tipo || 'pls') === 'entrada').reduce((s, r) => s + Number(r.valor || 0), 0);
    const totalTerreno = reps.filter(r => (r.tipo || 'pls') === 'terreno').reduce((s, r) => s + Number(r.valor || 0), 0);
    const totalRecebido = totalPls + totalEntrada + totalTerreno;

    const valorVenda = Number(o.valor_venda || 0);
    const custoTotal = (typeof lancamentos !== 'undefined' && Array.isArray(lancamentos))
      ? lancamentos.filter(l => l.obra_id === o.id).reduce((s, l) => s + Number(l.total || 0), 0)
      : 0;

    const adds = typeof getAdicionaisObra === 'function' ? getAdicionaisObra(o.id) : { qtd: 0, valorTotal: 0 };
    const receitaObra = valorVenda + adds.valorTotal;
    const lucro = receitaObra - custoTotal;
    const pctRecebido = receitaObra > 0 ? Math.min((totalRecebido / receitaObra * 100), 100) : 0;

    // Contrato CEF
    const contratoValor = Number(o.contrato_valor || 0);
    const pctContrato = contratoValor > 0 ? Math.min((totalRecebido / contratoValor * 100), 100) : 0;

    return `<div class="custos-card" onclick="custosAbrirDetalhe('${esc(o.id)}')">
      <div class="custos-card-top">
        <div>
          <div class="custos-card-nome">${esc(o.nome)}</div>
          <div class="custos-card-cidade">${esc(o.cidade || 'Sem cidade')}</div>
        </div>
        ${isAdmin && valorVenda > 0 ? `<div class="custos-card-valor">${fmtR(valorVenda)}</div>` : ''}
      </div>
      ${isAdmin ? `<div class="custos-card-grid">
        <div class="custos-card-metric"><div class="custos-card-metric-label">PLS</div><div class="custos-card-metric-value green">${fmtR(totalPls)}</div></div>
        <div class="custos-card-metric"><div class="custos-card-metric-label">ENTRADA</div><div class="custos-card-metric-value blue">${fmtR(totalEntrada)}</div></div>
        <div class="custos-card-metric"><div class="custos-card-metric-label">TERRENO</div><div class="custos-card-metric-value purple">${fmtR(totalTerreno)}</div></div>
        <div class="custos-card-metric"><div class="custos-card-metric-label">CUSTO</div><div class="custos-card-metric-value yellow">${fmtR(custoTotal)}</div></div>
      </div>` : ''}
      ${contratoValor > 0 ? `<div class="custos-card-contrato">
        <div class="custos-card-contrato-row">
          <span class="custos-card-contrato-label">CONTRATO CEF</span>
          <span>${pctContrato.toFixed(0)}% recebido</span>
        </div>
        <div class="custos-card-progress"><div class="custos-card-progress-fill" style="width:${pctContrato}%;"></div></div>
      </div>` : ''}
      ${isAdmin && valorVenda > 0 ? `<div class="custos-card-bottom">
        <span>Lucro: <strong style="color:${lucro >= 0 ? 'var(--success)' : 'var(--error)'};">${fmtR(lucro)}</strong></span>
        <span>Recebido: ${pctRecebido.toFixed(0)}%</span>
      </div>` : ''}
      <div class="custos-card-footer">
        <span>${reps.length} lancamento(s)</span>
        <span style="color:var(--primary);font-weight:600;">VER DETALHES</span>
      </div>
    </div>`;
  }).join('');
}


// ══════════════════════════════════════════════════════════════════
// VISAO 2: DETALHE DA OBRA (Lazy loading — carrega ao clicar)
// ══════════════════════════════════════════════════════════════════
function custosAbrirDetalhe(obraId) {
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

  const valorVenda = Number(obra.valor_venda || 0);
  const repsPool = (typeof repassesCef !== 'undefined' && repassesCef.length) ? repassesCef : CustosModule.repassesCef;
  const repassesObra = repsPool.filter(r => r.obra_id === obraId);
  const totalPls = repassesObra.filter(r => (r.tipo || 'pls') === 'pls').reduce((s, r) => s + Number(r.valor || 0), 0);
  const totalEntrada = repassesObra.filter(r => (r.tipo || 'pls') === 'entrada').reduce((s, r) => s + Number(r.valor || 0), 0);
  const totalTerreno = repassesObra.filter(r => (r.tipo || 'pls') === 'terreno').reduce((s, r) => s + Number(r.valor || 0), 0);
  const totalRecebido = totalPls + totalEntrada + totalTerreno;
  const saldoReceber = valorVenda - totalRecebido;

  const custoTotal = (typeof lancamentos !== 'undefined' && Array.isArray(lancamentos))
    ? lancamentos.filter(l => l.obra_id === obraId).reduce((s, l) => s + Number(l.total || 0), 0) : 0;

  const adds = typeof getAdicionaisObra === 'function' ? getAdicionaisObra(obraId) : { qtd: 0, valorTotal: 0 };
  const receitaObra = valorVenda + adds.valorTotal;
  const lucro = receitaObra - custoTotal;
  const margem = receitaObra > 0 ? (lucro / receitaObra * 100) : 0;
  const pctRecebido = receitaObra > 0 ? Math.min((totalRecebido / receitaObra * 100), 100) : 0;

  el.innerHTML = `<div class="custos-resumo-title"><span class="material-symbols-outlined" style="font-size:18px;">bar_chart</span> RESUMO FINANCEIRO — ${esc(obra.nome)}</div>
  <div class="custos-resumo-grid">
    <div class="custos-resumo-item"><div class="custos-resumo-label">VALOR DO IMOVEL</div><div class="custos-resumo-value">${valorVenda > 0 ? fmtR(valorVenda) : 'Nao informado'}</div></div>
    <div class="custos-resumo-item"><div class="custos-resumo-label">TOTAL RECEBIDO</div><div class="custos-resumo-value green">${fmtR(totalRecebido)}</div>
      <div class="custos-resumo-sub">PLS: ${fmtR(totalPls)} | Entrada: ${fmtR(totalEntrada)} | Terreno: ${fmtR(totalTerreno)}</div></div>
    <div class="custos-resumo-item"><div class="custos-resumo-label">SALDO A RECEBER</div><div class="custos-resumo-value" style="color:${saldoReceber >= 0 ? 'var(--primary)' : 'var(--error)'};">${valorVenda > 0 ? fmtR(saldoReceber) : '-'}</div></div>
    <div class="custos-resumo-item" style="cursor:pointer;" onclick="verLancamentosObra('${esc(obraId)}')"><div class="custos-resumo-label">CUSTO TOTAL</div><div class="custos-resumo-value yellow">${fmtR(custoTotal)}</div><div class="custos-resumo-sub">ver lancamentos</div></div>
    ${adds.qtd > 0 ? `<div class="custos-resumo-item"><div class="custos-resumo-label">ADICIONAIS (${adds.qtd})</div><div class="custos-resumo-value purple">${fmtR(adds.valorTotal)}</div></div>` : ''}
    <div class="custos-resumo-item"><div class="custos-resumo-label">LUCRO ESTIMADO</div><div class="custos-resumo-value" style="color:${lucro >= 0 ? 'var(--success)' : 'var(--error)'};">${receitaObra > 0 ? fmtR(lucro) : '-'}</div></div>
    <div class="custos-resumo-item"><div class="custos-resumo-label">MARGEM</div><div class="custos-resumo-value" style="color:${margem >= 15 ? 'var(--success)' : margem >= 0 ? 'var(--warning)' : 'var(--error)'};">${receitaObra > 0 ? margem.toFixed(1) + '%' : '-'}</div></div>
  </div>
  ${valorVenda > 0 ? `<div class="custos-progress-bar">
    <div class="custos-progress-header"><span>RECEBIDO vs VALOR VENDA</span><span style="font-weight:700;color:var(--primary);">${pctRecebido.toFixed(1)}%</span></div>
    <div class="custos-progress-track"><div class="custos-progress-fill" style="width:${pctRecebido}%;"></div></div>
  </div>` : ''}`;
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

  const totalEntradaPaga = repassesObra.filter(r => (r.tipo || 'pls') === 'entrada').reduce((s, r) => s + Number(r.valor || 0), 0);
  const totalTerrenoPago = repassesObra.filter(r => (r.tipo || 'pls') === 'terreno').reduce((s, r) => s + Number(r.valor || 0), 0);
  const entradaOk = contratoEntrada > 0 && (obra.entrada_paga || totalEntradaPaga >= contratoEntrada);
  const terrenoOk = contratoTerreno > 0 && (obra.terreno_pago || totalTerrenoPago >= contratoTerreno);

  const infoParts = [];
  if (contratoTaxa) infoParts.push(`Taxa: ${esc(contratoTaxa)}`);
  if (contratoPrazo) infoParts.push(`Prazo: ${esc(contratoPrazo)}`);
  if (contratoData) infoParts.push(`Data: ${fmtData(contratoData)}`);

  el.innerHTML = `<div class="custos-contrato-card">
    <div class="custos-contrato-header">
      <div class="custos-contrato-title">
        <span class="material-symbols-outlined" style="font-size:18px;">description</span>
        CONTRATO CEF
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
      ${contratoEntrada > 0 ? `<span class="custos-contrato-tag ${entradaOk ? 'green' : 'yellow'}">Entrada: ${fmtR(contratoEntrada)} ${entradaOk ? '&#10003;' : 'pendente'}</span>` : ''}
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

function custosEditarRepasse(id) {
  const r = CustosModule.repassesCef.find(x => x.id === id);
  if (!r) return;
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

  if (!obraId) return showToast('Selecione uma obra', 'error');
  if (tipo === 'pls' && medicao < 1) return showToast('Informe o numero da medicao', 'error');
  if (!valor || valor <= 0) return showToast('Informe o valor', 'error');
  if (!data) return showToast('Informe a data', 'error');

  const body = { obra_id: obraId, medicao_numero: medicao, valor, data_credito: data, observacao: obs, tipo };

  if (editId) {
    await sbPatch('repasses_cef', `?id=eq.${editId}`, body);
    showToast('Repasse atualizado', 'success');
  } else {
    await sbPost('repasses_cef', body);
    showToast('Repasse salvo', 'success');
  }

  closeModal('custos-modal-repasse');
  await _custosCarregarRepasses();
  if (CustosModule.obraAtual) custosAbrirDetalhe(CustosModule.obraAtual);
  else _custosRenderCards();
}

async function custosExcluirRepasse(id) {
  const ok = await confirmar('Excluir este repasse CEF? Esta acao nao pode ser desfeita.');
  if (!ok) return;
  await sbDelete('repasses_cef', `?id=eq.${id}`);
  showToast('Repasse excluido', 'success');
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

  content.innerHTML = `
    <div class="modal-title">
      <span class="material-symbols-outlined" style="color:var(--primary);">description</span>
      Contrato CEF — ${esc(obra.nome)}
      <button class="modal-close" onclick="closeModal('custos-modal-contrato')"><span class="material-symbols-outlined">close</span></button>
    </div>
    <input type="hidden" id="contrato-obra-id" value="${esc(obraId)}"/>
    <div class="dist-form-grid">
      <div class="dist-form-field"><label class="dist-form-label">Valor Financiado</label>
        <input class="dist-form-input" id="contrato-valor" type="number" value="${obra.contrato_valor || ''}" oninput="_custosCalcValorVenda()"/></div>
      <div class="dist-form-field"><label class="dist-form-label">Subsidio</label>
        <input class="dist-form-input" id="contrato-subsidio" type="number" value="${obra.contrato_subsidio || ''}" oninput="_custosCalcValorVenda()"/></div>
      <div class="dist-form-field"><label class="dist-form-label">FGTS</label>
        <input class="dist-form-input" id="contrato-fgts" type="number" value="${obra.contrato_fgts || ''}" oninput="_custosCalcValorVenda()"/></div>
      <div class="dist-form-field"><label class="dist-form-label">Entrada</label>
        <input class="dist-form-input" id="contrato-entrada" type="number" value="${obra.contrato_entrada || ''}" oninput="_custosCalcValorVenda()"/></div>
      <div class="dist-form-field"><label class="dist-form-label">Extras</label>
        <input class="dist-form-input" id="contrato-extras" type="number" value="${obra.contrato_extras || ''}" oninput="_custosCalcValorVenda()"/></div>
      <div class="dist-form-field"><label class="dist-form-label">Valor Venda (calculado)</label>
        <div id="contrato-venda-valor" style="font-family:'Plus Jakarta Sans',sans-serif;font-size:18px;font-weight:800;color:var(--primary);padding:8px 0;">${fmtR((Number(obra.contrato_valor || 0) + Number(obra.contrato_subsidio || 0) + Number(obra.contrato_fgts || 0) + Number(obra.contrato_entrada || 0) + Number(obra.contrato_extras || 0)))}</div>
        <div id="contrato-venda-alerta" style="display:none;font-size:11px;color:var(--warning);"></div></div>
      <div class="dist-form-field"><label class="dist-form-label">Taxa</label>
        <input class="dist-form-input" id="contrato-taxa" type="text" value="${esc(obra.contrato_taxa || '')}"/></div>
      <div class="dist-form-field"><label class="dist-form-label">Prazo</label>
        <input class="dist-form-input" id="contrato-prazo" type="text" value="${esc(obra.contrato_prazo || '')}"/></div>
      <div class="dist-form-field"><label class="dist-form-label">Data Contrato</label>
        <input class="dist-form-input" id="contrato-data" type="date" value="${obra.contrato_data || ''}"/></div>
      <div class="dist-form-field" style="display:flex;align-items:center;gap:8px;padding-top:20px;">
        <input type="checkbox" id="contrato-entrada-paga" ${obra.entrada_paga ? 'checked' : ''} style="accent-color:var(--primary);"/>
        <label for="contrato-entrada-paga" style="font-size:13px;">Entrada paga</label>
      </div>
    </div>
    <div style="display:flex;gap:12px;margin-top:24px;">
      <button class="btn-primary" style="flex:1;padding:14px;font-size:15px;justify-content:center;" onclick="custosSalvarContrato()">
        <span class="material-symbols-outlined" style="font-size:20px;">save</span>Salvar Contrato</button>
    </div>`;

  openModal('custos-modal-contrato');
}

function _custosCalcValorVenda() {
  const fin = parseFloat(document.getElementById('contrato-valor')?.value) || 0;
  const sub = parseFloat(document.getElementById('contrato-subsidio')?.value) || 0;
  const fgts = parseFloat(document.getElementById('contrato-fgts')?.value) || 0;
  const ent = parseFloat(document.getElementById('contrato-entrada')?.value) || 0;
  const ext = parseFloat(document.getElementById('contrato-extras')?.value) || 0;
  const total = fin + sub + fgts + ent + ext;
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
  const ext = parseFloat(document.getElementById('contrato-extras')?.value) || 0;
  const entPaga = document.getElementById('contrato-entrada-paga')?.checked || false;
  const taxa = (document.getElementById('contrato-taxa')?.value || '').trim();
  const prazo = (document.getElementById('contrato-prazo')?.value || '').trim();
  const data = document.getElementById('contrato-data')?.value || null;

  if (fin <= 0) return showToast('Informe o valor financiado', 'error');

  const valorVenda = fin + sub + fgts + ent + ext;

  const body = {
    contrato_valor: fin, contrato_subsidio: sub, contrato_fgts: fgts,
    contrato_entrada: ent, contrato_extras: ext,
    contrato_valor_edr: valorVenda, valor_venda: valorVenda,
    entrada_paga: entPaga, contrato_taxa: taxa, contrato_prazo: prazo, contrato_data: data,
  };

  await sbPatch('obras', `?id=eq.${obraId}`, body);

  // Atualizar obra local
  const obra = [...obras, ...(typeof obrasArquivadas !== 'undefined' ? obrasArquivadas : [])].find(o => o.id === obraId);
  if (obra) Object.assign(obra, body);

  closeModal('custos-modal-contrato');
  showToast('Contrato salvo', 'success');
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

  const totalGeral = lista.reduce((s, r) => s + Number(r.valor || 0), 0);

  const porObra = {};
  lista.forEach(r => {
    if (!porObra[r.obra_id]) porObra[r.obra_id] = { nome: getNome(r.obra_id), reps: [] };
    porObra[r.obra_id].reps.push(r);
  });

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
    <p>Gerado em: ${new Date().toLocaleDateString('pt-BR')} — Total geral: <strong class="total">${fmtR(totalGeral)}</strong></p>`;

  for (const [oid, data] of Object.entries(porObra)) {
    const totalObra = data.reps.reduce((s, r) => s + Number(r.valor || 0), 0);
    const obraObj = todasObras.find(o => o.id === oid);
    const valorVenda = Number(obraObj?.valor_venda || 0);
    const custoObra = (typeof lancamentos !== 'undefined' && Array.isArray(lancamentos))
      ? lancamentos.filter(l => l.obra_id === oid).reduce((s, l) => s + Number(l.total || 0), 0) : 0;
    const lucroObra = valorVenda - custoObra;
    const margemObra = valorVenda > 0 ? (lucroObra / valorVenda * 100) : 0;

    html += `<h2>${data.nome} — Total Recebido: ${fmtR(totalObra)}</h2>`;
    if (valorVenda > 0) {
      html += `<table><tbody>
        <tr><td><strong>Valor do Imovel</strong></td><td class="right">${fmtR(valorVenda)}</td></tr>
        <tr><td>Custo Total</td><td class="right" style="color:#D97706;font-weight:700;">${fmtR(custoObra)}</td></tr>
        <tr><td><strong>Lucro Estimado</strong></td><td class="right total">${fmtR(lucroObra)}</td></tr>
        <tr><td><strong>Margem</strong></td><td class="right total">${margemObra.toFixed(1)}%</td></tr>
      </tbody></table>`;
    }
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
