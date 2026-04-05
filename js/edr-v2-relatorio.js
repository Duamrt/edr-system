// ══════════════════════════════════════════════════════════════════
// EDR System V2 — Modulo: RELATORIO P&L
// Depende: api.js, utils.js, config.js, obras.js (ETAPAS,
//          resolveEtapaKey, etapaLabel, etapaCor),
//          notas.js (lancamentos), custos.js (CustosModule.repasses),
//          estoque.js (EstoqueModule), adicionais.js, auth.js,
//          diarias.js (DiariasModule.buildSecaoFaltas)
// ══════════════════════════════════════════════════════════════════

const RelatorioModule = {
  mesAtual: '',           // formato "YYYY-MM"
  mostrarConcluidas: false,
  entradasMes: [],        // entradas unificadas do mes
  filtrosEntrada: new Set(),
  lancSaidasMes: [],
  lancMaoObraMes: [],
  detalheCardAberto: '',
};

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const MESES_FULL = ['Janeiro','Fevereiro','Marco','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

// ── HELPERS ────────────────────────────────────────────────────

function _relGetRepassesCef() {
  if (typeof repassesCef !== 'undefined' && repassesCef.length) return repassesCef;
  return typeof CustosModule !== 'undefined' && CustosModule.repassesCef.length ? CustosModule.repassesCef : [];
}

function _relGetAdicionaisPgtos() {
  return typeof adicionaisPgtos !== 'undefined' ? adicionaisPgtos : [];
}

function _relGetObrasAdicionais() {
  return typeof obrasAdicionais !== 'undefined' ? obrasAdicionais : [];
}

function _relGetCatalogoMateriais() {
  return typeof catalogoMateriais !== 'undefined' ? catalogoMateriais : [];
}

// Detecta etapa de um lancamento (por etapa salva, catalogo, regex)
function getCatFromLanc(l) {
  if (l.etapa && l.etapa !== '00_outros' && l.etapa !== '36_outros') return resolveEtapaKey(l.etapa);
  const descLimpa = (l.descricao || '').replace(/^\d{6}\s*·\s*/, '').trim();
  const dn = descLimpa.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const cat = _relGetCatalogoMateriais();
  const mat = cat.find(m => {
    const mn = norm(m.nome);
    return mn === norm(l.descricao || '') || mn === norm(descLimpa) || mn.includes(dn) || dn.includes(mn.split(' ')[0]);
  });
  if (mat && mat.categoria) return resolveEtapaKey(mat.categoria);
  const desc = descLimpa || l.descricao || '';
  const dnn = desc.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (typeof getCatEstoque === 'function') {
    const catEst = getCatEstoque(desc);
    if (catEst && catEst !== 'outros') return resolveEtapaKey(catEst);
  }
  if (/mao[\s\-]de[\s\-]obra|armador(?!\s+de\s)|eletricista|pintor(?!\s+de\s)|(?<!\w\s+de\s+)pedreiro|servente|mestre de obras|encanador|azulejista/.test(dnn) && !/bucha|luva|joelho|adaptador|registro|conexao|te\b|curva|niple|flange|fita|cola|parafuso|prego|tela|disco/i.test(dnn)) return '28_mao';
  if (/aquisicao de terreno|compra de terreno/.test(dnn)) return '35_terreno';
  if (/contrato|documento|anotacao|alvara|licenca|vistoria|escritura/.test(dnn)) return '08_doc';
  return '36_outros';
}

function getCatLabel(key) {
  return etapaLabel(key);
}

function _relFmtR(v, abrev) {
  const n = Number(v) || 0;
  if (abrev && Math.abs(n) >= 1000) return 'R$ ' + (n / 1000).toFixed(1) + 'k';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// ── INIT ───────────────────────────────────────────────────────

function initRelatorio() {
  const hoje = new Date();
  RelatorioModule.mesAtual = hoje.getFullYear() + '-' + String(hoje.getMonth() + 1).padStart(2, '0');
  // Popular select de meses
  const selMes = document.getElementById('rel-mes');
  if (selMes) {
    selMes.innerHTML = _relBuildSelectMeses();
    // Se mes atual nao tem dados, pegar o mais recente
    if (selMes.options.length && !selMes.value) selMes.selectedIndex = 0;
    RelatorioModule.mesAtual = selMes.value || RelatorioModule.mesAtual;
  }
  renderRelatorio();
}

// ── RENDER PRINCIPAL ──────────────────────────────────────────

function renderRelatorio() {
  const el = document.getElementById('rel-content');
  if (!el) return;
  const secao = document.getElementById('rel-secao')?.value || 'financeiro';

  // Skeleton enquanto calcula
  el.innerHTML = '<div class="skeleton-block" style="height:200px;border-radius:12px;margin-bottom:16px;"></div>'.repeat(3);

  // Async render — libera a thread pra pintar o skeleton
  requestAnimationFrame(() => {
    let html = '';
    if (secao === 'financeiro') {
      html = _relBuildPainelFinanceiro();
    } else if (secao === 'categoria') {
      const ls = _relGetLancMes(RelatorioModule.mesAtual);
      html = ls.length ? _relBuildSecaoCategoria(ls) : _relMsgVazio();
    } else if (secao === 'comparativo') {
      html = _relBuildSecaoComparativo();
    } else if (secao === 'faltas') {
      html = typeof DiariasModule !== 'undefined' && typeof buildSecaoFaltas === 'function'
        ? buildSecaoFaltas() : _relMsgVazio();
    }
    el.innerHTML = html;
    // Renderizar tabela de entradas filtradas
    if (document.getElementById('rel-entradas-tabela')) _relRenderTabelaEntradas();
  });
}

function _relBuildSelectMeses() {
  const mesesDisp = new Set();
  lancamentos.forEach(l => { if (l.data) mesesDisp.add(l.data.substring(0, 7)); });
  _relGetRepassesCef().forEach(r => { if (r.data_credito) mesesDisp.add(r.data_credito.substring(0, 7)); });
  _relGetAdicionaisPgtos().forEach(p => { if (p.data) mesesDisp.add(p.data.substring(0, 7)); });
  mesesDisp.add(RelatorioModule.mesAtual);
  const arr = [...mesesDisp].sort().reverse();
  return arr.map(ym => {
    const [a, m] = ym.split('-');
    return `<option value="${ym}" ${ym === RelatorioModule.mesAtual ? 'selected' : ''}>${MESES[parseInt(m) - 1]} ${a}</option>`;
  }).join('');
}

function onChangeMesRel() {
  RelatorioModule.mesAtual = document.getElementById('rel-mes')?.value || RelatorioModule.mesAtual;
  renderRelatorio();
}

function _relGetLancMes(ym) { return lancamentos.filter(l => l.data && l.data.startsWith(ym)); }
function _relGetRepassesMes(ym) { return _relGetRepassesCef().filter(r => r.data_credito && r.data_credito.startsWith(ym)); }
function _relMsgVazio() {
  return '<div style="text-align:center;padding:60px 20px;color:var(--text-tertiary);font-size:13px;font-family:Inter,sans-serif;">Nenhum lancamento encontrado para o periodo selecionado.</div>';
}

function _relGetObrasIdsAtivas() { return new Set(obras.filter(o => !o.arquivada).map(o => o.id)); }

function relToggleObrasConcluidas() {
  RelatorioModule.mostrarConcluidas = !RelatorioModule.mostrarConcluidas;
  renderRelatorio();
}

// ── PAINEL FINANCEIRO ─────────────────────────────────────────

function _relBuildPainelFinanceiro() {
  const ym = RelatorioModule.mesAtual;
  const [anoStr, mesStr] = ym.split('-');
  const mesLabel = MESES_FULL[parseInt(mesStr) - 1] + ' ' + anoStr;
  const mostrar = RelatorioModule.mostrarConcluidas;
  const idsAtivas = _relGetObrasIdsAtivas();

  // Saidas do mes
  const lancMesTodas = _relGetLancMes(ym);
  const lancMes = mostrar ? lancMesTodas : lancMesTodas.filter(l => !l.obra_id || idsAtivas.has(l.obra_id));
  const totalSaidas = lancMes.reduce((s, l) => s + Number(l.total || 0), 0);
  const lancMaoObra = lancMes.filter(l => getCatFromLanc(l) === '28_mao');
  const maoObraMes = lancMaoObra.reduce((s, l) => s + Number(l.total || 0), 0);
  RelatorioModule.lancSaidasMes = lancMes;
  RelatorioModule.lancMaoObraMes = lancMaoObra;

  // Entradas do mes
  const pgtosMes = _relGetAdicionaisPgtos().filter(p => p.data && p.data.startsWith(ym));
  const totalPgtosAdic = pgtosMes.reduce((s, p) => s + Number(p.valor || 0), 0);
  const repassesMes = _relGetRepassesMes(ym);
  const totalRepasses = repassesMes.reduce((s, r) => s + Number(r.valor || 0), 0);
  const plsMes = repassesMes.filter(r => (r.tipo || 'pls') === 'pls').reduce((s, r) => s + Number(r.valor || 0), 0);
  const entradaMes = repassesMes.filter(r => r.tipo === 'entrada').reduce((s, r) => s + Number(r.valor || 0), 0);
  const terrenoMes = repassesMes.filter(r => r.tipo === 'terreno').reduce((s, r) => s + Number(r.valor || 0), 0);
  const totalEntradas = totalPgtosAdic + totalRepasses;
  const saldo = totalEntradas - totalSaidas;
  const corSaldo = saldo >= 0 ? 'var(--success)' : 'var(--danger)';

  // Subtitulo entradas
  const subParts = [];
  if (plsMes > 0) subParts.push('PLs: ' + _relFmtR(plsMes));
  if (entradaMes > 0) subParts.push('Entrada: ' + _relFmtR(entradaMes));
  if (terrenoMes > 0) subParts.push('Terreno: ' + _relFmtR(terrenoMes));
  if (totalPgtosAdic > 0) subParts.push('Extras: ' + _relFmtR(totalPgtosAdic));
  const subEntradas = subParts.length ? subParts.join(' · ') : 'Nenhuma entrada no mes';

  // Toggle obras concluidas
  const toggleAtivo = mostrar;
  let html = `<div style="display:flex;justify-content:flex-end;margin-bottom:12px;">
    <span onclick="relToggleObrasConcluidas()" style="cursor:pointer;padding:6px 14px;border-radius:20px;font-size:11px;font-weight:600;color:${toggleAtivo ? 'var(--success)' : 'var(--text-tertiary)'};background:${toggleAtivo ? 'rgba(45,106,79,0.1)' : 'transparent'};border:1.5px solid ${toggleAtivo ? 'rgba(45,106,79,0.3)' : 'var(--border)'};transition:all .2s;user-select:none;font-family:Inter,sans-serif;">
      <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;margin-right:4px;">${toggleAtivo ? 'check_circle' : 'filter_list'}</span>
      ${toggleAtivo ? 'Mostrando concluidas' : 'So obras ativas'}
    </span>
  </div>`;

  // Cards resumo
  html += `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:20px;">
    ${_relCardResumo('trending_up', 'ENTRADAS', totalEntradas, 'var(--success)', subEntradas, "relToggleDetalheCard('entradas')")}
    ${_relCardResumo('trending_down', 'SAIDAS', totalSaidas, 'var(--danger)', lancMes.length + ' lancamentos', "relToggleDetalheCard('saidas')")}
    ${_relCardResumo('account_balance', 'SALDO', saldo, corSaldo, saldo >= 0 ? 'Positivo' : 'Negativo')}
    ${_relCardResumo('engineering', 'MAO DE OBRA', maoObraMes, 'var(--warning)', totalSaidas > 0 ? (maoObraMes / totalSaidas * 100).toFixed(0) + '% do total' : '—', "relToggleDetalheCard('mao')")}
  </div>`;

  // Estoque como patrimonio
  const valEstoque = typeof _valorEstoqueAtual !== 'undefined' ? _valorEstoqueAtual : 0;
  if (valEstoque > 0) {
    const saldoReal = saldo + valEstoque;
    html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px;">
      ${_relCardResumo('inventory_2', 'ESTOQUE EM MATERIAL', valEstoque, 'var(--warning)', 'Dinheiro parado em material')}
      ${_relCardResumo('diamond', 'SALDO REAL', saldoReal, saldoReal >= 0 ? 'var(--success)' : 'var(--danger)', 'Caixa + Estoque')}
    </div>`;
  }

  // Container detalhe expandido
  html += '<div id="rel-detalhe-card" style="margin-bottom:16px;"></div>';

  // Detalhe entradas com filtros
  if (repassesMes.length || pgtosMes.length) {
    const todasEntradas = [];
    repassesMes.forEach(r => {
      const tipoKey = r.tipo === 'entrada' ? 'entrada' : r.tipo === 'terreno' ? 'terreno' : 'pls';
      const icons = { pls: 'account_balance', entrada: 'payments', terreno: 'foundation' };
      const labels = { pls: 'PL', entrada: 'Entrada', terreno: 'Terreno' };
      todasEntradas.push({
        data: r.data_credito || '', obraNome: obras.find(o => o.id === r.obra_id)?.nome || '—',
        tipoKey, tipoLabel: labels[tipoKey], tipoIcon: icons[tipoKey],
        desc: r.descricao || r.tipo || '—', valor: Number(r.valor || 0)
      });
    });
    pgtosMes.forEach(p => {
      const adic = (typeof adicionais !== 'undefined' ? adicionais : []).find(a => a.id === p.adicional_id);
      todasEntradas.push({
        data: p.data || '', obraNome: adic ? (obras.find(o => o.id === adic.obra_id)?.nome || '—') : '—',
        tipoKey: 'extra', tipoLabel: 'Extra', tipoIcon: 'star',
        desc: adic?.descricao || '—', valor: Number(p.valor || 0)
      });
    });
    todasEntradas.sort((a, b) => a.data.localeCompare(b.data));

    const tiposPresentes = [...new Set(todasEntradas.map(e => e.tipoKey))];
    const tipoConfig = {
      pls: { lb: 'PLs', cor: '#3498db', icon: 'account_balance' },
      entrada: { lb: 'Entrada', cor: 'var(--success)', icon: 'payments' },
      terreno: { lb: 'Terreno', cor: '#e67e22', icon: 'foundation' },
      extra: { lb: 'Extras', cor: '#f1c40f', icon: 'star' }
    };

    RelatorioModule.entradasMes = todasEntradas;
    RelatorioModule.filtrosEntrada = new Set(tiposPresentes);

    const chips = tiposPresentes.map(key => {
      const c = tipoConfig[key] || { lb: key, cor: '#999', icon: 'category' };
      return `<span id="rel-chip-${key}" onclick="relToggleFiltroEntrada('${key}')" style="cursor:pointer;padding:5px 12px;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:0.5px;transition:all .2s;user-select:none;background:${c.cor};color:#fff;font-family:Inter,sans-serif;display:inline-flex;align-items:center;gap:4px;">
        <span class="material-symbols-outlined" style="font-size:14px;">${c.icon}</span>${c.lb}
      </span>`;
    }).join('');

    html += `<div style="background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:20px;margin-bottom:16px;">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:12px;">
        <div style="font-family:'Plus Jakarta Sans',sans-serif;font-size:14px;font-weight:700;color:var(--text-primary);display:flex;align-items:center;gap:8px;">
          <span class="material-symbols-outlined" style="font-size:20px;color:var(--success);">trending_up</span> ENTRADAS DO MES
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
          ${chips}
          <span onclick="relLimparFiltrosEntrada()" style="cursor:pointer;padding:5px 10px;border-radius:20px;font-size:10px;color:var(--text-tertiary);border:1px solid var(--border);transition:all .2s;font-family:Inter,sans-serif;">LIMPAR</span>
        </div>
      </div>
      <div style="margin-bottom:8px;font-size:11px;color:var(--text-tertiary);font-family:Inter,sans-serif;" id="rel-entradas-total"></div>
      <div id="rel-entradas-tabela"></div>
    </div>`;
  }

  // Grafico barras 6 meses
  html += _relBuildGraficoMensal(ym);
  // Detalhamento por obra
  html += _relBuildDetalheObras(ym);
  // Custo por m2
  html += _relBuildCustoPorM2();

  return html;
}

// ── CARD RESUMO ───────────────────────────────────────────────

function _relCardResumo(icon, titulo, valor, cor, sub, onclick) {
  const clicavel = onclick ? 'cursor:pointer;' : '';
  const hint = onclick ? '<div style="font-size:9px;color:var(--text-tertiary);margin-top:4px;opacity:0.6;font-family:Inter,sans-serif;">clique para ver detalhes</div>' : '';
  return `<div ${onclick ? 'onclick="' + onclick + '"' : ''} style="${clicavel}background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:20px;position:relative;overflow:hidden;transition:transform .15s,border-color .15s;" ${onclick ? `onmouseover="this.style.borderColor='${cor}';this.style.transform='translateY(-2px)'" onmouseout="this.style.borderColor='var(--border)';this.style.transform='none'"` : ''}>
    <div style="position:absolute;top:14px;right:16px;opacity:0.15;"><span class="material-symbols-outlined" style="font-size:32px;color:${cor};">${icon}</span></div>
    <div style="font-size:10px;color:var(--text-tertiary);font-weight:700;letter-spacing:1.5px;margin-bottom:8px;font-family:'Space Grotesk',monospace;">${titulo}</div>
    <div style="font-size:22px;font-weight:800;color:${cor};font-family:'Space Grotesk',monospace;line-height:1;">${_relFmtR(valor)}</div>
    <div style="font-size:10px;color:var(--text-tertiary);margin-top:6px;font-family:Inter,sans-serif;">${sub}</div>
    ${hint}
  </div>`;
}

// ── DETALHE EXPANDIDO DOS CARDS ──────────────────────────────

function relToggleDetalheCard(tipo) {
  const el = document.getElementById('rel-detalhe-card');
  if (!el) return;
  if (RelatorioModule.detalheCardAberto === tipo) { el.innerHTML = ''; RelatorioModule.detalheCardAberto = ''; return; }
  RelatorioModule.detalheCardAberto = tipo;

  let itens = [], tituloDetalhe = '', corDetalhe = '', iconDetalhe = '';
  if (tipo === 'entradas') {
    tituloDetalhe = 'DETALHAMENTO — ENTRADAS'; iconDetalhe = 'trending_up'; corDetalhe = 'var(--success)';
    itens = RelatorioModule.entradasMes.map(e => ({ data: e.data, desc: e.desc, obra: e.obraNome, valor: e.valor, tipo: e.tipoLabel }));
  } else if (tipo === 'saidas') {
    tituloDetalhe = 'DETALHAMENTO — SAIDAS'; iconDetalhe = 'trending_down'; corDetalhe = 'var(--danger)';
    itens = RelatorioModule.lancSaidasMes.map(l => ({ id: l.id, data: l.data, desc: l.descricao || '—', obra: obras.find(o => o.id === l.obra_id)?.nome || 'Sem obra', valor: Number(l.total || 0), tipo: getCatLabel(getCatFromLanc(l)) }));
  } else if (tipo === 'mao') {
    tituloDetalhe = 'DETALHAMENTO — MAO DE OBRA'; iconDetalhe = 'engineering'; corDetalhe = 'var(--warning)';
    itens = RelatorioModule.lancMaoObraMes.map(l => ({ id: l.id, data: l.data, desc: l.descricao || '—', obra: obras.find(o => o.id === l.obra_id)?.nome || 'Sem obra', valor: Number(l.total || 0), tipo: 'Mao de obra' }));
  }

  if (!itens.length) { el.innerHTML = '<div style="background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:20px;text-align:center;color:var(--text-tertiary);font-size:12px;font-family:Inter,sans-serif;">Nenhum lancamento encontrado.</div>'; return; }

  window._relDetalheItens = itens;
  window._relDetalheOrdem = window._relDetalheOrdem || 'data';
  window._relDetalheTipo = tipo;
  window._relDetalheCor = corDetalhe;
  window._relDetalheTitulo = tituloDetalhe;
  window._relDetalheIcon = iconDetalhe;
  _relRenderDetalhe(el);
}

function _relRenderDetalhe(el) {
  const itens = [...(window._relDetalheItens || [])];
  const ordem = window._relDetalheOrdem || 'data';
  const corDetalhe = window._relDetalheCor;
  const tituloDetalhe = window._relDetalheTitulo;
  const iconDetalhe = window._relDetalheIcon;
  const tipo = window._relDetalheTipo;

  if (ordem === 'data') itens.sort((a, b) => (a.data || '').localeCompare(b.data || ''));
  else if (ordem === 'az') itens.sort((a, b) => (a.desc || '').localeCompare(b.desc || ''));
  else if (ordem === 'valor') itens.sort((a, b) => b.valor - a.valor);

  const totalItens = itens.reduce((s, i) => s + i.valor, 0);
  const isLanc = tipo === 'saidas' || tipo === 'mao';

  const btnStyle = (o) => `cursor:pointer;font-size:10px;padding:4px 10px;border-radius:6px;border:1px solid ${ordem === o ? corDetalhe : 'var(--border)'};background:${ordem === o ? 'rgba(45,106,79,0.08)' : 'transparent'};color:${ordem === o ? corDetalhe : 'var(--text-tertiary)'};font-weight:${ordem === o ? '700' : '400'};font-family:Inter,sans-serif;display:inline-flex;align-items:center;gap:4px;`;

  const linhasHtml = itens.map(i => {
    const dataFmt = i.data ? i.data.split('-').reverse().join('/') : '—';
    const btnEditar = isLanc && i.id ? `<span onclick="event.stopPropagation();editarEtapaLanc('${esc(i.id)}')" style="cursor:pointer;margin-left:6px;opacity:0.5;transition:opacity .2s;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.5" title="Alterar centro de custo"><span class="material-symbols-outlined" style="font-size:16px;">folder_open</span></span>` : '';
    return `<div style="display:grid;grid-template-columns:70px 1fr auto;gap:8px;padding:8px 0;border-bottom:1px solid var(--border);align-items:center;">
      <div style="font-size:11px;color:var(--text-tertiary);font-family:'Space Grotesk',monospace;">${dataFmt}</div>
      <div>
        <div style="font-size:12px;color:var(--text-primary);font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:Inter,sans-serif;">${esc(i.desc)}</div>
        <div style="font-size:10px;color:var(--text-tertiary);font-family:Inter,sans-serif;">${esc(i.obra)} · ${i.tipo}</div>
      </div>
      <div style="display:flex;align-items:center;white-space:nowrap;">
        <span style="font-size:13px;font-weight:700;color:${corDetalhe};font-family:'Space Grotesk',monospace;">${_relFmtR(i.valor)}</span>
        ${btnEditar}
      </div>
    </div>`;
  }).join('');

  el.innerHTML = `<div style="background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:20px;margin-bottom:16px;border-left:3px solid ${corDetalhe};">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
      <div style="font-family:'Plus Jakarta Sans',sans-serif;font-size:14px;font-weight:700;color:var(--text-primary);display:flex;align-items:center;gap:8px;">
        <span class="material-symbols-outlined" style="font-size:20px;color:${corDetalhe};">${iconDetalhe}</span> ${tituloDetalhe}
      </div>
      <div style="font-size:10px;color:var(--text-tertiary);font-family:'Space Grotesk',monospace;">${itens.length} itens · <span style="color:${corDetalhe};font-weight:700;">${_relFmtR(totalItens)}</span></div>
    </div>
    <div style="display:flex;gap:6px;margin-bottom:12px;">
      <span style="${btnStyle('data')}" onclick="window._relDetalheOrdem='data';_relRenderDetalhe(this.closest('[style*=border-left]').parentElement)"><span class="material-symbols-outlined" style="font-size:14px;">calendar_today</span> Data</span>
      <span style="${btnStyle('az')}" onclick="window._relDetalheOrdem='az';_relRenderDetalhe(this.closest('[style*=border-left]').parentElement)"><span class="material-symbols-outlined" style="font-size:14px;">sort_by_alpha</span> A-Z</span>
      <span style="${btnStyle('valor')}" onclick="window._relDetalheOrdem='valor';_relRenderDetalhe(this.closest('[style*=border-left]').parentElement)"><span class="material-symbols-outlined" style="font-size:14px;">trending_up</span> Maior valor</span>
    </div>
    <div style="max-height:400px;overflow-y:auto;">${linhasHtml}</div>
  </div>`;
}

// ── GRAFICO BARRAS 6 MESES ───────────────────────────────────

function _relBuildGraficoMensal(ymBase) {
  const [anoBase, mesBase] = ymBase.split('-').map(Number);
  const mesesArr = [];
  for (let i = 5; i >= 0; i--) {
    let m = mesBase - i, a = anoBase;
    while (m <= 0) { m += 12; a--; }
    mesesArr.push(a + '-' + String(m).padStart(2, '0'));
  }

  const saidasPorMes = {}, entAdicPorMes = {}, entRepPorMes = {};
  mesesArr.forEach(ym => { saidasPorMes[ym] = 0; entAdicPorMes[ym] = 0; entRepPorMes[ym] = 0; });
  const mesesSet = new Set(mesesArr);
  lancamentos.forEach(l => { const ym = l.data?.substring(0, 7); if (ym && mesesSet.has(ym)) saidasPorMes[ym] += Number(l.total || 0); });
  _relGetAdicionaisPgtos().forEach(p => { const ym = p.data?.substring(0, 7); if (ym && mesesSet.has(ym)) entAdicPorMes[ym] += Number(p.valor || 0); });
  _relGetRepassesCef().forEach(r => { const ym = r.data_credito?.substring(0, 7); if (ym && mesesSet.has(ym)) entRepPorMes[ym] += Number(r.valor || 0); });

  const dados = mesesArr.map(ym => ({ ym, entradas: entAdicPorMes[ym] + entRepPorMes[ym], saidas: saidasPorMes[ym] }));
  const maxVal = Math.max(...dados.map(d => Math.max(d.entradas, d.saidas)), 1);

  const colunas = dados.map(d => {
    const [, m] = d.ym.split('-');
    const hEnt = Math.max((d.entradas / maxVal * 100), d.entradas > 0 ? 4 : 0);
    const hSai = Math.max((d.saidas / maxVal * 100), d.saidas > 0 ? 4 : 0);
    const isAtual = d.ym === ymBase;
    const bordaAtual = isAtual ? 'border:2px solid rgba(45,106,79,0.4);border-radius:10px;padding:4px;' : '';
    return `<div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex:1;min-width:55px;${bordaAtual}">
      <div style="display:flex;gap:3px;align-items:flex-end;height:90px;width:100%;">
        <div style="flex:1;display:flex;align-items:flex-end;height:100%;">
          <div style="width:100%;height:${hEnt}%;background:linear-gradient(0deg,#1B5E3B,#2D6A4F);border-radius:4px 4px 0 0;transition:height .5s;min-height:${d.entradas > 0 ? '4px' : '0'};" title="Entradas: ${_relFmtR(d.entradas)}"></div>
        </div>
        <div style="flex:1;display:flex;align-items:flex-end;height:100%;">
          <div style="width:100%;height:${hSai}%;background:linear-gradient(0deg,#c0392b,#e74c3c);border-radius:4px 4px 0 0;transition:height .5s;min-height:${d.saidas > 0 ? '4px' : '0'};" title="Saidas: ${_relFmtR(d.saidas)}"></div>
        </div>
      </div>
      <div style="font-size:10px;color:${isAtual ? '#2D6A4F' : 'var(--text-tertiary)'};font-weight:${isAtual ? '700' : '400'};text-align:center;font-family:Inter,sans-serif;">${MESES[parseInt(m) - 1]}</div>
    </div>`;
  }).join('');

  return `<div style="background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:20px;margin-bottom:16px;">
    <div style="font-family:'Plus Jakarta Sans',sans-serif;font-size:14px;font-weight:700;color:var(--text-primary);margin-bottom:12px;display:flex;align-items:center;gap:8px;">
      <span class="material-symbols-outlined" style="font-size:20px;color:#2D6A4F;">bar_chart</span> ENTRADAS vs SAIDAS — ultimos 6 meses
    </div>
    <div style="display:flex;gap:12px;align-items:center;margin-bottom:12px;">
      <span style="display:flex;align-items:center;gap:4px;font-size:10px;color:var(--text-tertiary);font-family:Inter,sans-serif;"><span style="width:12px;height:12px;background:#2D6A4F;border-radius:3px;display:inline-block;"></span> Entradas</span>
      <span style="display:flex;align-items:center;gap:4px;font-size:10px;color:var(--text-tertiary);font-family:Inter,sans-serif;"><span style="width:12px;height:12px;background:#e74c3c;border-radius:3px;display:inline-block;"></span> Saidas</span>
    </div>
    <div style="display:flex;gap:8px;align-items:flex-end;overflow-x:auto;padding-bottom:4px;">${colunas}</div>
  </div>`;
}

// ── DETALHAMENTO POR OBRA ────────────────────────────────────

function _relBuildDetalheObras(ym) {
  const mostrar = RelatorioModule.mostrarConcluidas;
  const obrasAtivas = mostrar ? [...obras, ...(typeof obrasArquivadas !== 'undefined' ? obrasArquivadas : [])] : obras.filter(o => !o.arquivada);
  if (!obrasAtivas.length) return '';

  const dados = obrasAtivas.map(o => {
    const lancObra = lancamentos.filter(l => l.obra_id === o.id && l.data && l.data.startsWith(ym));
    const saidas = lancObra.reduce((s, l) => s + Number(l.total || 0), 0);
    const mao = lancObra.filter(l => getCatFromLanc(l) === '28_mao').reduce((s, l) => s + Number(l.total || 0), 0);
    const repObra = _relGetRepassesMes(ym).filter(r => r.obra_id === o.id);
    const entRepasses = repObra.reduce((s, r) => s + Number(r.valor || 0), 0);
    const addsObra = _relGetObrasAdicionais().filter(a => a.obra_id === o.id);
    const addIds = new Set(addsObra.map(a => a.id));
    const pgtos = _relGetAdicionaisPgtos().filter(p => addIds.has(p.adicional_id) && p.data && p.data.startsWith(ym));
    const entAdic = pgtos.reduce((s, p) => s + Number(p.valor || 0), 0);
    const entradas = entRepasses + entAdic;
    const totalGasto = lancamentos.filter(l => l.obra_id === o.id).reduce((s, l) => s + Number(l.total || 0), 0);
    const valorVenda = Number(o.valor_venda || 0);
    const addsTotais = typeof getAdicionaisObra === 'function' ? getAdicionaisObra(o.id) : { valorTotal: 0 };
    const receitaTotal = valorVenda + addsTotais.valorTotal;
    return { nome: o.nome, id: o.id, entradas, saidas, mao, totalGasto, receitaTotal };
  }).filter(d => d.saidas > 0 || d.entradas > 0 || d.totalGasto > 0);

  if (!dados.length) return '';
  const maxSaida = Math.max(...dados.map(d => d.saidas), 1);

  const linhas = dados.map(d => {
    const saldo = d.entradas - d.saidas;
    const corSaldo = saldo >= 0 ? 'var(--success)' : 'var(--danger)';
    const pctSaida = d.saidas / maxSaida * 100;
    const pctMao = d.saidas > 0 ? (d.mao / d.saidas * 100) : 0;
    const pctGasto = d.receitaTotal > 0 ? (d.totalGasto / d.receitaTotal * 100) : 0;
    const corPctGasto = pctGasto > 90 ? 'var(--danger)' : pctGasto > 70 ? 'var(--warning)' : 'var(--success)';

    return `<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <div style="font-size:13px;font-weight:700;color:var(--text-primary);max-width:55%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:'Plus Jakarta Sans',sans-serif;">${esc(d.nome)}</div>
        <div style="font-size:10px;color:var(--text-tertiary);font-family:'Space Grotesk',monospace;">
          ${d.receitaTotal > 0 ? '<span style="color:' + corPctGasto + ';font-weight:700;">' + pctGasto.toFixed(0) + '%</span> consumido' : ''}
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px;margin-bottom:10px;">
        <div><div style="font-size:9px;color:var(--text-tertiary);margin-bottom:2px;font-family:'Space Grotesk',monospace;">ENTRADAS</div><div style="font-size:13px;font-weight:700;color:var(--success);font-family:'Space Grotesk',monospace;">${_relFmtR(d.entradas, true)}</div></div>
        <div><div style="font-size:9px;color:var(--text-tertiary);margin-bottom:2px;font-family:'Space Grotesk',monospace;">SAIDAS</div><div style="font-size:13px;font-weight:700;color:var(--danger);font-family:'Space Grotesk',monospace;">${_relFmtR(d.saidas, true)}</div></div>
        <div><div style="font-size:9px;color:var(--text-tertiary);margin-bottom:2px;font-family:'Space Grotesk',monospace;">MAO DE OBRA</div><div style="font-size:13px;font-weight:700;color:var(--warning);font-family:'Space Grotesk',monospace;">${_relFmtR(d.mao, true)}</div></div>
        <div><div style="font-size:9px;color:var(--text-tertiary);margin-bottom:2px;font-family:'Space Grotesk',monospace;">SALDO MES</div><div style="font-size:13px;font-weight:700;color:${corSaldo};font-family:'Space Grotesk',monospace;">${_relFmtR(saldo, true)}</div></div>
      </div>
      <div style="display:flex;gap:4px;align-items:center;">
        <div style="flex:1;height:6px;background:var(--border);border-radius:3px;overflow:hidden;">
          <div style="height:100%;width:${pctSaida}%;background:linear-gradient(90deg,#e74c3c,#c0392b);border-radius:3px;transition:width .5s;"></div>
        </div>
        ${d.mao > 0 ? '<span style="font-size:9px;color:var(--warning);white-space:nowrap;font-family:\'Space Grotesk\',monospace;"><span class="material-symbols-outlined" style="font-size:12px;vertical-align:middle;">engineering</span> ' + pctMao.toFixed(0) + '%</span>' : ''}
      </div>
    </div>`;
  }).join('');

  const [, ms] = ym.split('-');
  return `<div style="background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:20px;margin-bottom:16px;">
    <div style="font-family:'Plus Jakarta Sans',sans-serif;font-size:14px;font-weight:700;color:var(--text-primary);margin-bottom:12px;display:flex;align-items:center;gap:8px;">
      <span class="material-symbols-outlined" style="font-size:20px;color:#2D6A4F;">domain</span> DETALHAMENTO POR OBRA — ${MESES_FULL[parseInt(ms) - 1]}
    </div>
    ${linhas}
  </div>`;
}

// ── CUSTO POR M2 ─────────────────────────────────────────────

function _relBuildCustoPorM2() {
  const todasObras = [...obras, ...(typeof obrasArquivadas !== 'undefined' ? obrasArquivadas : [])];
  const obrasComArea = todasObras.filter(o => Number(o.area_m2) > 0);
  if (!obrasComArea.length) return '';

  const dados = obrasComArea.map(o => {
    const area = Number(o.area_m2);
    const totalGasto = lancamentos.filter(l => l.obra_id === o.id).reduce((s, l) => s + Number(l.total || 0), 0);
    const maoObra = lancamentos.filter(l => l.obra_id === o.id && getCatFromLanc(l) === '28_mao').reduce((s, l) => s + Number(l.total || 0), 0);
    const valorVenda = Number(o.valor_venda || 0);
    const custoM2 = area > 0 ? totalGasto / area : 0;
    const maoM2 = area > 0 ? maoObra / area : 0;
    const vendaM2 = area > 0 && valorVenda > 0 ? valorVenda / area : 0;
    const lucroM2 = vendaM2 > 0 ? vendaM2 - custoM2 : 0;
    const margemPct = vendaM2 > 0 ? (lucroM2 / vendaM2 * 100) : 0;
    return { nome: o.nome, area, totalGasto, maoObra, custoM2, maoM2, vendaM2, lucroM2, margemPct, arquivada: o.arquivada };
  }).sort((a, b) => a.custoM2 - b.custoM2);

  const linhas = dados.map(d => {
    const corMargem = d.lucroM2 > 0 ? 'var(--success)' : d.vendaM2 > 0 ? 'var(--danger)' : 'var(--text-tertiary)';
    const badge = d.arquivada ? '<span style="font-size:8px;background:rgba(45,106,79,0.15);color:#2D6A4F;padding:2px 6px;border-radius:4px;margin-left:6px;font-weight:700;font-family:Inter,sans-serif;">CONCLUIDA</span>' : '';
    return `<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <div style="font-size:13px;font-weight:700;color:var(--text-primary);font-family:'Plus Jakarta Sans',sans-serif;">${esc(d.nome)}${badge}</div>
        <div style="font-size:10px;color:var(--text-tertiary);font-family:'Space Grotesk',monospace;">${d.area.toFixed(1)} m²</div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:8px;">
        <div>
          <div style="font-size:9px;color:var(--text-tertiary);margin-bottom:2px;font-family:'Space Grotesk',monospace;">CUSTO / m²</div>
          <div style="font-size:16px;font-weight:800;color:var(--danger);font-family:'Space Grotesk',monospace;">${_relFmtR(d.custoM2)}</div>
        </div>
        <div>
          <div style="font-size:9px;color:var(--text-tertiary);margin-bottom:2px;font-family:'Space Grotesk',monospace;">MAO OBRA / m²</div>
          <div style="font-size:16px;font-weight:800;color:var(--warning);font-family:'Space Grotesk',monospace;">${_relFmtR(d.maoM2)}</div>
        </div>
        ${d.vendaM2 > 0 ? `<div>
          <div style="font-size:9px;color:var(--text-tertiary);margin-bottom:2px;font-family:'Space Grotesk',monospace;">VENDA / m²</div>
          <div style="font-size:16px;font-weight:800;color:var(--success);font-family:'Space Grotesk',monospace;">${_relFmtR(d.vendaM2)}</div>
        </div>
        <div>
          <div style="font-size:9px;color:var(--text-tertiary);margin-bottom:2px;font-family:'Space Grotesk',monospace;">LUCRO / m²</div>
          <div style="font-size:16px;font-weight:800;color:${corMargem};font-family:'Space Grotesk',monospace;">${_relFmtR(d.lucroM2)}</div>
          <div style="font-size:9px;color:${corMargem};margin-top:2px;font-family:Inter,sans-serif;">Margem ${d.margemPct.toFixed(1)}%</div>
        </div>` : ''}
      </div>
      <div style="margin-top:10px;font-size:10px;color:var(--text-tertiary);font-family:Inter,sans-serif;">
        Total gasto: ${_relFmtR(d.totalGasto)} · Mao de obra: ${_relFmtR(d.maoObra)} (${d.totalGasto > 0 ? (d.maoObra / d.totalGasto * 100).toFixed(0) : 0}%)
      </div>
    </div>`;
  }).join('');

  return `<div style="background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:20px;margin-bottom:16px;">
    <div style="font-family:'Plus Jakarta Sans',sans-serif;font-size:14px;font-weight:700;color:var(--text-primary);margin-bottom:6px;display:flex;align-items:center;gap:8px;">
      <span class="material-symbols-outlined" style="font-size:20px;color:#2D6A4F;">straighten</span> CUSTO POR m²
    </div>
    <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:12px;font-family:Inter,sans-serif;">Comparativo de custo acumulado por area construida</div>
    ${linhas}
  </div>`;
}

// ── SECAO POR CATEGORIA ──────────────────────────────────────

function _relBuildSecaoCategoria(ls) {
  const map = {};
  ls.forEach(l => {
    const cat = getCatFromLanc(l);
    map[cat] = (map[cat] || 0) + Number(l.total || 0);
  });
  const total = Object.values(map).reduce((s, v) => s + v, 0);
  const itens = Object.entries(map).sort((a, b) => b[1] - a[1]);

  const barras = itens.map(([cat, val]) => {
    const pct = total > 0 ? (val / total * 100).toFixed(1) : 0;
    const cor = etapaCor(cat);
    const lb = getCatLabel(cat);
    return `<div style="margin-bottom:10px;cursor:pointer;" onclick="relVerCategoriaEmObras('${cat}')" title="Ver lancamentos de ${lb}">
      <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:4px;">
        <span style="color:var(--text-primary);font-weight:600;font-family:Inter,sans-serif;">${lb} <span class="material-symbols-outlined" style="font-size:12px;vertical-align:middle;color:var(--text-tertiary);">open_in_new</span></span>
        <span style="color:var(--text-secondary);font-family:'Space Grotesk',monospace;">${_relFmtR(val)} <span style="color:var(--text-tertiary);">(${pct}%)</span></span>
      </div>
      <div style="height:8px;background:var(--border);border-radius:4px;overflow:hidden;">
        <div style="height:100%;width:${pct}%;background:${cor};border-radius:4px;transition:width .5s;"></div>
      </div>
    </div>`;
  }).join('');

  return `<div style="background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:20px;">
    <div style="font-family:'Plus Jakarta Sans',sans-serif;font-size:14px;font-weight:700;color:var(--text-primary);margin-bottom:16px;display:flex;align-items:center;gap:8px;">
      <span class="material-symbols-outlined" style="font-size:20px;color:#2D6A4F;">sell</span> CUSTO POR CENTRO DE CUSTO
    </div>
    <div style="margin-bottom:16px;">
      <span style="font-size:24px;font-weight:700;color:#2D6A4F;font-family:'Space Grotesk',monospace;">${_relFmtR(total)}</span>
      <span style="font-size:11px;color:var(--text-tertiary);margin-left:8px;font-family:Inter,sans-serif;">total lancado</span>
    </div>
    ${barras}
  </div>`;
}

function relVerCategoriaEmObras(cat) {
  if (typeof setView === 'function') setView('obras');
  const selObra = document.getElementById('filtro-obra-lanc') || document.getElementById('sel-obra-lanc');
  const relObraId = document.getElementById('rel-obra')?.value || '';
  if (selObra && relObraId) selObra.value = relObraId;
  const sel = document.getElementById('filtro-cat');
  if (sel) sel.value = cat;
  if (typeof filtrarLanc === 'function') filtrarLanc();
  showToast(getCatLabel(cat));
}

// ── SECAO COMPARATIVO ────────────────────────────────────────

function _relBuildSecaoComparativo() {
  if (obras.length < 2) return '';
  const dados = obras.map(o => {
    const total = lancamentos.filter(l => l.obra_id === o.id).reduce((s, l) => s + Number(l.total || 0), 0);
    return { nome: o.nome, total };
  }).filter(d => d.total > 0).sort((a, b) => b.total - a.total);

  if (!dados.length) return '';
  const maxVal = dados[0].total;
  const coresRanking = ['#2D6A4F', '#3498db', '#e67e22', '#9b59b6', '#e74c3c', '#1abc9c', '#f39c12', '#27ae60'];

  const linhas = dados.map((d, i) => {
    const pct = maxVal > 0 ? (d.total / maxVal * 100).toFixed(1) : 0;
    const cor = coresRanking[i % coresRanking.length];
    return `<div style="margin-bottom:12px;">
      <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:4px;">
        <span style="color:var(--text-primary);font-weight:600;max-width:60%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:Inter,sans-serif;">${esc(d.nome)}</span>
        <span style="color:var(--text-secondary);font-family:'Space Grotesk',monospace;">${_relFmtR(d.total)}</span>
      </div>
      <div style="height:10px;background:var(--border);border-radius:5px;overflow:hidden;">
        <div style="height:100%;width:${pct}%;background:${cor};border-radius:5px;transition:width .5s;"></div>
      </div>
    </div>`;
  }).join('');

  return `<div style="background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:20px;">
    <div style="font-family:'Plus Jakarta Sans',sans-serif;font-size:14px;font-weight:700;color:var(--text-primary);margin-bottom:16px;display:flex;align-items:center;gap:8px;">
      <span class="material-symbols-outlined" style="font-size:20px;color:#2D6A4F;">compare_arrows</span> COMPARATIVO ENTRE OBRAS
    </div>
    ${linhas}
  </div>`;
}

// ── FILTROS ENTRADAS ─────────────────────────────────────────

const _relTipoConfig = {
  pls: { lb: 'PLs', cor: '#3498db', icon: 'account_balance' },
  entrada: { lb: 'Entrada', cor: 'var(--success)', icon: 'payments' },
  terreno: { lb: 'Terreno', cor: '#e67e22', icon: 'foundation' },
  extra: { lb: 'Extras', cor: '#f1c40f', icon: 'star' }
};

function relToggleFiltroEntrada(key) {
  const filtros = RelatorioModule.filtrosEntrada;
  if (filtros.has(key)) filtros.delete(key); else filtros.add(key);
  _relAtualizarChipsEntrada();
  _relRenderTabelaEntradas();
}

function relLimparFiltrosEntrada() {
  const todos = [...new Set(RelatorioModule.entradasMes.map(e => e.tipoKey))];
  const filtros = RelatorioModule.filtrosEntrada;
  const todosAtivos = todos.every(k => filtros.has(k));
  if (todosAtivos) filtros.clear(); else todos.forEach(k => filtros.add(k));
  _relAtualizarChipsEntrada();
  _relRenderTabelaEntradas();
}

function _relAtualizarChipsEntrada() {
  const filtros = RelatorioModule.filtrosEntrada;
  Object.keys(_relTipoConfig).forEach(key => {
    const chip = document.getElementById('rel-chip-' + key);
    if (!chip) return;
    const c = _relTipoConfig[key];
    if (filtros.has(key)) {
      chip.style.background = c.cor; chip.style.color = '#fff'; chip.style.border = 'none'; chip.style.opacity = '1';
    } else {
      chip.style.background = 'transparent'; chip.style.color = c.cor; chip.style.border = '1.5px solid ' + c.cor; chip.style.opacity = '0.6';
    }
  });
}

function _relRenderTabelaEntradas() {
  const container = document.getElementById('rel-entradas-tabela');
  const totalEl = document.getElementById('rel-entradas-total');
  if (!container || !RelatorioModule.entradasMes.length) return;

  const filtros = RelatorioModule.filtrosEntrada;
  const filtradas = RelatorioModule.entradasMes.filter(e => filtros.has(e.tipoKey));
  const totalFiltrado = filtradas.reduce((s, e) => s + e.valor, 0);

  if (totalEl) {
    totalEl.innerHTML = filtradas.length
      ? 'Mostrando <strong>' + filtradas.length + '</strong> entrada' + (filtradas.length > 1 ? 's' : '') + ' · Total: <strong style="color:var(--success);">' + _relFmtR(totalFiltrado) + '</strong>'
      : 'Nenhuma entrada com os filtros selecionados.';
  }

  if (!filtradas.length) { container.innerHTML = ''; return; }

  let tbl = '<table style="width:100%;font-size:11px;border-collapse:collapse;font-family:Inter,sans-serif;">';
  tbl += '<tr style="border-bottom:1px solid var(--border);"><th style="text-align:left;padding:6px 8px;color:var(--text-tertiary);font-size:10px;font-family:\'Space Grotesk\',monospace;">DATA</th><th style="text-align:left;padding:6px 8px;color:var(--text-tertiary);font-size:10px;font-family:\'Space Grotesk\',monospace;">OBRA</th><th style="text-align:left;padding:6px 8px;color:var(--text-tertiary);font-size:10px;font-family:\'Space Grotesk\',monospace;">TIPO</th><th style="text-align:left;padding:6px 8px;color:var(--text-tertiary);font-size:10px;font-family:\'Space Grotesk\',monospace;">DESCRICAO</th><th style="text-align:right;padding:6px 8px;color:var(--text-tertiary);font-size:10px;font-family:\'Space Grotesk\',monospace;">VALOR</th></tr>';
  filtradas.forEach(e => {
    const dataFmt = typeof fmtData === 'function' ? fmtData(e.data) : (e.data || '').split('-').reverse().join('/');
    tbl += '<tr style="border-bottom:1px solid var(--border);">';
    tbl += '<td style="padding:6px 8px;color:var(--text-tertiary);">' + dataFmt + '</td>';
    tbl += '<td style="padding:6px 8px;font-weight:600;color:var(--text-primary);">' + esc(e.obraNome) + '</td>';
    tbl += '<td style="padding:6px 8px;"><span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;margin-right:2px;">' + (e.tipoIcon || 'category') + '</span>' + e.tipoLabel + '</td>';
    tbl += '<td style="padding:6px 8px;color:var(--text-tertiary);">' + esc(e.desc) + '</td>';
    tbl += '<td style="padding:6px 8px;text-align:right;font-weight:700;color:var(--success);font-family:\'Space Grotesk\',monospace;">' + _relFmtR(e.valor) + '</td>';
    tbl += '</tr>';
  });
  tbl += '</table>';
  container.innerHTML = tbl;
}

// ── EXPORT PDF ───────────────────────────────────────────────

function exportarRelatorioPDF() {
  if (typeof pdfRelatorio === 'function') pdfRelatorio();
  else showToast('Modulo PDF nao carregado');
}

// ── AUTO FIT ─────────────────────────────────────────────────

function autoFitStatValues() {
  document.querySelectorAll('.stat-value').forEach(el => {
    el.style.fontSize = '';
    el.style.whiteSpace = 'nowrap';
    const parent = el.parentElement;
    if (!parent) return;
    const maxW = parent.clientWidth - 20;
    let size = parseInt(getComputedStyle(el).fontSize);
    while (el.scrollWidth > maxW && size > 11) { size--; el.style.fontSize = size + 'px'; }
    if (el.scrollWidth > maxW) { el.style.whiteSpace = 'normal'; el.style.wordBreak = 'break-all'; }
  });
}

window.addEventListener('resize', () => {
  clearTimeout(window._resizeFit);
  window._resizeFit = setTimeout(autoFitStatValues, 100);
});

// ── REGISTER ─────────────────────────────────────────────────
if (typeof viewRegistry !== 'undefined') {
  viewRegistry.register('relatorio', () => {
    initRelatorio();
  });
}
