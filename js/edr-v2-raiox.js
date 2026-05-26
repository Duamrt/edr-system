// ══════════════════════════════════════════════════════════════════
// EDR System V2 — Modulo: RAIO-X DE OBRAS
// Painel consolidado por obra (carteira ao vivo). Foco: quanto SAIU (custo),
// quanto ENTROU (recebido) e quanto ENTROU A MAIS (serviços extras).
// Contrato da obra = VALOR DE VENDA (campo vivo do sistema). Receita = contrato + extras.
// Custo = tudo lancado (ja inclui a execucao dos extras). Lucro = receita - custo.
// Le dados JA carregados em memoria. Depende: infra.js (obras/obrasArquivadas/
// lancamentos/distribuicoes/getAdicionaisObra/fmt/esc), custos.js (CustosModule.repassesCef)
// ══════════════════════════════════════════════════════════════════

const RaioxModule = { filtro: 'todas' };

// ── HELPERS ────────────────────────────────────────────────────
function _rxRepasses() {
  if (typeof repassesCef !== 'undefined' && Array.isArray(repassesCef) && repassesCef.length) return repassesCef;
  return (typeof CustosModule !== 'undefined' && Array.isArray(CustosModule.repassesCef)) ? CustosModule.repassesCef : [];
}
function _rxFmt(v) { return (typeof fmt === 'function') ? fmt(v) : 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function _rxK(v) { return 'R$ ' + Math.round(Number(v) || 0).toLocaleString('pt-BR'); }
function _rxEsc(s) { return (typeof esc === 'function') ? esc(s) : String(s == null ? '' : s); }

function _rxStatus(o) {
  const nome = (o.nome || '').toUpperCase();
  if (nome.includes('ESCRIT')) return 'estrutura';
  if (o.arquivada) return 'concluida';
  return 'andamento';
}

// Cálculo por obra. Contrato = valor_venda. Extras = adicionais aprovados (getAdicionaisObra
// já exclui pendentes/cancelados). Custo = soma lancamentos (inclui execução dos extras).
function _rxCalc(o) {
  const reps = _rxRepasses();
  const ls = (typeof lancamentos !== 'undefined' ? lancamentos : []).filter(l => l.obra_id === o.id);
  const custo = ls.reduce((s, l) => s + Number(l.total || 0), 0);
  const material = (typeof distribuicoes !== 'undefined' ? distribuicoes : []).filter(d => d.obra_id === o.id).reduce((s, d) => s + Number(d.valor || 0), 0);
  const receb = reps.filter(r => r.obra_id === o.id).reduce((s, r) => s + Number(r.valor || 0), 0);
  const contrato = Number(o.valor_venda || 0);
  const adic = (typeof getAdicionaisObra === 'function') ? getAdicionaisObra(o.id) : { valorTotal: 0, totalRecebido: 0, saldo: 0, qtd: 0 };
  const extras = Number(adic.valorTotal || 0);
  const extrasReceber = Math.max(0, extras - Number(adic.totalRecebido || 0));
  const receita = contrato + extras;
  const lucro = receita - custo;
  const margem = receita > 0 ? (lucro / receita * 100) : 0;
  const aReceberContrato = contrato > 0 ? Math.max(0, contrato - receb) : 0;
  const aReceber = aReceberContrato + extrasReceber;
  const pctReceb = contrato > 0 ? Math.min(100, Math.round(receb / contrato * 100)) : null;
  return { o, status: _rxStatus(o), contrato, extras, extrasReceber, receita, custo, material, receb, lucro, margem, aReceber, aReceberContrato, pctReceb, qtd: ls.length, adicQtd: Number(adic.qtd || 0) };
}

function _rxTodas() {
  const ativas = (typeof obras !== 'undefined' && Array.isArray(obras)) ? obras : [];
  const arq = (typeof obrasArquivadas !== 'undefined' && Array.isArray(obrasArquivadas)) ? obrasArquivadas : [];
  return [...ativas, ...arq];
}

// ── KPIs CONSOLIDADOS ──────────────────────────────────────────
function _rxKpisHtml(linhas) {
  const reais = linhas.filter(x => x.status !== 'estrutura');
  const contratos = reais.reduce((s, x) => s + x.contrato, 0);
  const extras = reais.reduce((s, x) => s + x.extras, 0);
  const recebido = reais.reduce((s, x) => s + x.receb, 0);
  const custo = reais.reduce((s, x) => s + x.custo, 0);
  const lucro = (contratos + extras) - custo;
  const aReceber = reais.reduce((s, x) => s + x.aReceber, 0);
  const estrut = linhas.filter(x => x.status === 'estrutura').reduce((s, x) => s + x.custo, 0);

  const cards = [
    { lab: 'Contratos', val: _rxK(contratos), sub: reais.length + ' obras · valor de venda', cor: 'var(--text-primary)' },
    { lab: 'Serviços extras', val: _rxK(extras), sub: 'entrou a mais (adicionais)', cor: '#2563eb', destaque: true },
    { lab: 'Recebido', val: _rxK(recebido), sub: 'entrou no caixa', cor: '#16a34a' },
    { lab: 'Custo realizado', val: _rxK(custo), sub: 'saiu' + (estrut > 0 ? ' · +' + _rxK(estrut) + ' estrutura' : ''), cor: '#b45309' },
    { lab: 'Lucro previsto', val: _rxK(lucro), sub: '(contrato + extras) − custo', cor: lucro >= 0 ? '#16a34a' : '#dc2626' },
    { lab: 'Falta receber', val: _rxK(aReceber), sub: 'contrato + extras', cor: 'var(--text-primary)' },
  ];
  return cards.map(c => `
    <div style="background:var(--surface);border:1px solid ${c.destaque ? '#bfdbfe' : 'var(--border)'};border-radius:14px;padding:14px 16px;${c.destaque ? 'box-shadow:0 0 0 1px #bfdbfe inset;' : ''}">
      <div style="font-size:10.5px;letter-spacing:.5px;text-transform:uppercase;color:var(--text-tertiary);font-weight:700;font-family:'Space Grotesk',monospace;">${c.lab}</div>
      <div style="font-size:21px;font-weight:800;color:${c.cor};margin-top:4px;font-family:'Plus Jakarta Sans',sans-serif;">${c.val}</div>
      <div style="font-size:11px;color:var(--text-tertiary);margin-top:2px;font-family:Inter,sans-serif;">${c.sub}</div>
    </div>`).join('');
}

// ── FILTROS ────────────────────────────────────────────────────
function _rxFiltrosHtml(f) {
  const opts = [['todas', 'Todas'], ['andamento', 'Em andamento'], ['concluida', 'Concluídas']];
  return opts.map(([id, lab]) => `
    <button onclick="rxSetFiltro('${id}')" style="font-family:'Space Grotesk',monospace;font-size:12px;font-weight:600;padding:7px 14px;border-radius:999px;cursor:pointer;border:1px solid ${f === id ? 'var(--primary)' : 'var(--border)'};background:${f === id ? 'var(--primary)' : 'var(--surface)'};color:${f === id ? '#fff' : 'var(--text-secondary)'};transition:all .15s;">${lab}</button>`).join('');
}

// ── CARD DE OBRA ───────────────────────────────────────────────
function _rxBadge(status) {
  const map = {
    andamento: ['Em obra', '#2D6A4F', 'rgba(45,106,79,0.1)'],
    concluida: ['Concluída', '#2563eb', 'rgba(37,99,235,0.1)'],
    estrutura: ['Estrutura', '#6b7280', 'rgba(107,114,128,0.12)'],
  };
  const [lab, cor, bg] = map[status] || map.estrutura;
  return `<span style="font-family:'Space Grotesk',monospace;font-size:10px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;padding:3px 9px;border-radius:6px;color:${cor};background:${bg};">${lab}</span>`;
}

function _rxMetric(lab, val, cor, sub) {
  return `<div style="display:flex;flex-direction:column;gap:2px;">
    <div style="font-size:9.5px;letter-spacing:.4px;text-transform:uppercase;color:var(--text-tertiary);font-weight:700;font-family:'Space Grotesk',monospace;">${lab}</div>
    <div style="font-size:15px;font-weight:700;color:${cor || 'var(--text-primary)'};font-family:'Plus Jakarta Sans',sans-serif;">${val}</div>
    ${sub ? `<div style="font-size:10px;color:var(--text-tertiary);font-family:Inter,sans-serif;">${sub}</div>` : ''}
  </div>`;
}

function _rxCardObra(x) {
  const o = x.o;
  const isEstrut = x.status === 'estrutura';

  let metricas;
  if (isEstrut) {
    metricas = `${_rxMetric('Custo acumulado', _rxFmt(x.custo), '#b45309')}${_rxMetric('Material', _rxFmt(x.material))}${_rxMetric('Lançamentos', x.qtd + '')}`;
  } else {
    const arSub = x.aReceber < 10 ? 'quitado' : (x.extrasReceber > 0 ? ('contrato ' + _rxK(x.aReceberContrato) + ' + extras ' + _rxK(x.extrasReceber)) : 'do contrato');
    metricas =
      _rxMetric('Contrato (venda)', _rxFmt(x.contrato)) +
      _rxMetric('Serviços extras', x.extras > 0 ? _rxFmt(x.extras) : '—', x.extras > 0 ? '#2563eb' : 'var(--text-tertiary)', x.adicQtd > 0 ? (x.adicQtd + ' item' + (x.adicQtd > 1 ? 's' : '')) : '') +
      _rxMetric('Custo (saiu)', _rxFmt(x.custo), '#b45309') +
      _rxMetric('Lucro previsto', _rxFmt(x.lucro), x.lucro >= 0 ? '#16a34a' : '#dc2626', x.receita > 0 ? ('margem ' + x.margem.toFixed(0) + '%') : '') +
      _rxMetric('Recebido', _rxFmt(x.receb), '#16a34a') +
      _rxMetric('Falta receber', x.aReceber < 10 ? 'quitado' : _rxFmt(x.aReceber), '#2563eb', arSub);
  }

  // barra de recebimento
  let barra = '';
  if (!isEstrut && x.contrato > 0 && x.pctReceb != null) {
    barra = `<div style="margin-top:12px;">
      <div style="display:flex;justify-content:space-between;font-family:'Space Grotesk',monospace;font-size:11px;color:var(--text-tertiary);margin-bottom:4px;">
        <span>Recebido do contrato</span><span><b style="color:var(--text-secondary);">${x.pctReceb}%</b> · ${x.aReceber > 10 ? 'falta ' + _rxK(x.aReceber) : 'quitado'}</span>
      </div>
      <div style="height:8px;background:var(--surface-alt);border-radius:5px;overflow:hidden;">
        <div style="height:100%;width:${x.pctReceb}%;background:#16a34a;border-radius:5px;"></div>
      </div>
    </div>`;
  }

  return `<div style="background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:16px 18px;margin-bottom:12px;">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:14px;">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        <span style="font-family:'Plus Jakarta Sans',sans-serif;font-size:17px;font-weight:800;color:var(--text-primary);">${_rxEsc(o.nome)}</span>
        ${_rxBadge(x.status)}
      </div>
      <span style="font-size:11.5px;color:var(--text-tertiary);font-family:Inter,sans-serif;">${_rxEsc(o.cidade || '')}${o.area_m2 && Number(o.area_m2) > 0 ? ' · ' + o.area_m2 + ' m²' : ''}</span>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:14px;">${metricas}</div>
    ${barra}
  </div>`;
}

// ── RENDER PRINCIPAL ───────────────────────────────────────────
function renderRaiox(container) {
  const cont = container || document.getElementById('view-raiox');
  if (!cont) return;

  const linhas = _rxTodas().map(_rxCalc).filter(x => x.qtd > 0 || x.contrato > 0 || x.receb > 0);

  if (!linhas.length) {
    cont.innerHTML = `<div style="color:var(--text-tertiary);font-size:14px;padding:40px 0;text-align:center;font-family:Inter,sans-serif;">Nenhuma obra com movimentação ainda.</div>`;
    return;
  }

  const f = RaioxModule.filtro;
  const grupos = [
    ['andamento', 'Em andamento', 'construction'],
    ['concluida', 'Concluídas', 'task_alt'],
    ['estrutura', 'Estrutura / Almoxarifado', 'warehouse'],
  ];

  let corpo = '';
  grupos.forEach(([st, titulo, icon]) => {
    if (f !== 'todas' && f !== st) return;
    const itens = linhas.filter(x => x.status === st).sort((a, b) => b.aReceber - a.aReceber || b.custo - a.custo);
    if (!itens.length) return;
    corpo += `<div style="margin:22px 0 10px;font-family:'Plus Jakarta Sans',sans-serif;font-size:13px;font-weight:700;color:var(--text-secondary);letter-spacing:.4px;display:flex;align-items:center;gap:8px;">
      <span class="material-symbols-outlined" style="font-size:19px;color:var(--primary);">${icon}</span> ${titulo}
      <span style="color:var(--text-tertiary);font-weight:500;font-family:'Space Grotesk',monospace;">· ${itens.length}</span></div>`;
    corpo += itens.map(_rxCardObra).join('');
  });

  cont.innerHTML = `
    <div style="margin-bottom:16px;">
      <div style="font-family:'Plus Jakarta Sans',sans-serif;font-size:22px;font-weight:800;color:var(--text-primary);">Raio-X de Obras</div>
      <div style="font-size:13px;color:var(--text-tertiary);font-family:Inter,sans-serif;margin-top:2px;">Carteira ao vivo — quanto saiu, quanto entrou e o que entrou a mais (extras)</div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:16px;">${_rxKpisHtml(linhas)}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:4px;">${_rxFiltrosHtml(f)}</div>
    ${corpo}`;
}

function rxSetFiltro(f) {
  RaioxModule.filtro = f;
  renderRaiox();
}

// ── Registro no viewRegistry ──
if (typeof viewRegistry !== 'undefined') {
  viewRegistry.register('raiox', (container) => renderRaiox(container));
}
window.rxSetFiltro = rxSetFiltro;
window.renderRaiox = renderRaiox;
