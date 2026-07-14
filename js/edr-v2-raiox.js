// ══════════════════════════════════════════════════════════════════
// EDR System V2 — Modulo: RAIO-X DE OBRAS
// Painel consolidado por obra (carteira ao vivo). Foco: quanto SAIU (custo),
// quanto ENTROU (recebido) e quanto ENTROU A MAIS (serviços extras).
// Contrato da obra = VALOR DE VENDA (campo vivo do sistema). Receita = contrato + extras.
// Custo = tudo lancado (ja inclui a execucao dos extras). Lucro = receita - custo.
// Le dados JA carregados em memoria. Depende: infra.js (obras/obrasArquivadas/
// lancamentos/distribuicoes/getAdicionaisObra/fmt/esc), custos.js (CustosModule.repassesCef)
// ══════════════════════════════════════════════════════════════════

const RaioxModule = { filtro: 'andamento', _crono: [], _cronoLoaded: false };

// Carrega progresso do cronograma (lazy, 1x) — não vem nos dados globais do boot
async function _rxLoadCrono() {
  try {
    const r = await sbGet('cronograma_tarefas', '?tipo=eq.tarefa&select=obra_id,progresso');
    RaioxModule._crono = Array.isArray(r) ? r : [];
  } catch (e) { RaioxModule._crono = []; }
  RaioxModule._cronoLoaded = true;
}
function _rxProgObra(id) {
  const ts = (RaioxModule._crono || []).filter(t => t.obra_id === id);
  if (!ts.length) return null;
  return Math.round(ts.reduce((s, t) => s + Number(t.progresso || 0), 0) / ts.length);
}

// ── HELPERS ────────────────────────────────────────────────────
function _rxRepasses() {
  if (typeof repassesCef !== 'undefined' && Array.isArray(repassesCef) && repassesCef.length) return repassesCef;
  return (typeof CustosModule !== 'undefined' && Array.isArray(CustosModule.repassesCef)) ? CustosModule.repassesCef : [];
}
function _rxFmt(v) { return (typeof fmt === 'function') ? fmt(v) : 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function _rxK(v) { return 'R$ ' + Math.round(Number(v) || 0).toLocaleString('pt-BR'); }
function _rxEsc(s) { return (typeof esc === 'function') ? esc(s) : String(s == null ? '' : s); }

function _rxStatus(o) {
  // RX1: alinha ao contrato compartilhado (OBRAS_INTERNAS por ID, exposto por custos.js) + fallback de nome.
  // ADITIVO: escritorio ja e pego por nome; ID so adiciona robustez p/ futura interna sem ESCRIT/ALMOX no nome.
  const internas = (typeof window !== 'undefined' && Array.isArray(window.OBRAS_INTERNAS)) ? window.OBRAS_INTERNAS : [];
  const nome = (o.nome || '').toUpperCase();
  if (internas.includes(o.id) || nome.includes('ESCRIT') || nome.includes('ALMOX')) return 'estrutura';
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
  const recebContrato = reps.filter(r => r.obra_id === o.id).reduce((s, r) => s + Number(r.valor || 0), 0);
  const contrato = Number(o.valor_venda || 0);
  const adic = (typeof getAdicionaisObra === 'function') ? getAdicionaisObra(o.id) : { valorTotal: 0, totalRecebido: 0, saldo: 0, qtd: 0 };
  const extras = Number(adic.valorTotal || 0);
  const recebExtras = Number(adic.totalRecebido || 0);
  const receb = recebContrato + recebExtras;           // total financeiro recebido
  const extrasReceber = Math.max(0, extras - recebExtras);
  const receita = contrato + extras;
  const lucro = receita - custo;
  const caixa = receb - custo;
  const margem = receita > 0 ? (lucro / receita * 100) : 0;
  const aReceberContrato = contrato > 0 ? Math.max(0, contrato - recebContrato) : 0;  // baseado só em repasses
  const aReceber = aReceberContrato + extrasReceber;
  const pctReceb = contrato > 0 ? Math.min(100, Math.round(recebContrato / contrato * 100)) : null;  // barra do contrato
  const prog = _rxProgObra(o.id);
  const pctGasto = contrato > 0 ? Math.round(custo / contrato * 100) : null;
  return { o, status: _rxStatus(o), contrato, extras, extrasReceber, receita, custo, material, receb, recebContrato, recebExtras, lucro, caixa, margem, aReceber, aReceberContrato, pctReceb, prog, pctGasto, qtd: ls.length, adicQtd: Number(adic.qtd || 0) };
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
  const caixa = recebido - custo;
  const aReceber = reais.reduce((s, x) => s + x.aReceber, 0);
  const estrut = linhas.filter(x => x.status === 'estrutura').reduce((s, x) => s + x.custo, 0);

  // [LOCK 2026-05-28] destaque azul (cor #2563eb + destaque:true) do card "Falta receber" é proposital — Duam pediu pra fixar. NÃO mover/remover sem pedido explícito.
  const cards = [
    { lab: 'Contratos', val: _rxK(contratos), sub: reais.length + ' obras · valor de venda', cls: 'rx-default' },
    { lab: 'Serviços extras', val: _rxK(extras), sub: 'entrou a mais (adicionais)', cls: 'rx-info' },
    { lab: 'Recebido', val: _rxK(recebido), sub: 'entrou no caixa', cls: 'rx-success' },
    { lab: 'Custo realizado', val: _rxK(custo), sub: 'saiu' + (estrut > 0 ? ' · +' + _rxK(estrut) + ' estrutura' : ''), cls: 'rx-warning' },
    { lab: 'Saldo de fluxo acumulado', val: _rxK(caixa), sub: 'recebido − custo, acumulado', cls: caixa >= 0 ? 'rx-success' : 'rx-danger' },
    { lab: 'Projeção por contrato', val: _rxK(lucro), sub: 'contrato + extras − custo realizado', cls: lucro >= 0 ? 'rx-success' : 'rx-danger' },
    { lab: 'Falta receber', val: _rxK(aReceber), sub: 'contrato + extras', cor: '#2563eb', destaque: true },
  ];
  // Ramo 'destaque' = card "Falta receber": HTML/cor/box byte-idênticos ao original (LOCK 2026-05-28, fora do RX3+4).
  return cards.map(c => c.destaque
    ? `
    <div style="background:var(--surface);border:1px solid #bfdbfe;border-radius:14px;padding:14px 16px;box-shadow:0 0 0 1px #bfdbfe inset;">
      <div style="font-size:10.5px;letter-spacing:.5px;text-transform:uppercase;color:var(--text-tertiary);font-weight:700;font-family:'Space Grotesk',monospace;">${c.lab}</div>
      <div style="font-size:21px;font-weight:800;color:${c.cor};margin-top:4px;font-family:'Plus Jakarta Sans',sans-serif;">${c.val}</div>
      <div style="font-size:11px;color:var(--text-tertiary);margin-top:2px;font-family:Inter,sans-serif;">${c.sub}</div>
    </div>`
    : `
    <div class="rx-kpi">
      <div class="rx-kpi-lab">${c.lab}</div>
      <div class="rx-kpi-val ${c.cls}">${c.val}</div>
      <div class="rx-kpi-sub">${c.sub}</div>
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
    andamento: ['Em obra', 'rx-badge--andamento'],
    concluida: ['Concluída', 'rx-badge--concluida'],
    estrutura: ['Estrutura', 'rx-badge--estrutura'],
  };
  const [lab, cls] = map[status] || map.estrutura;
  return `<span class="rx-badge ${cls}">${lab}</span>`;
}

function _rxMetric(lab, val, cor, sub) {
  // 'cor' inline (ex.: '#2563eb' do LOCK "Falta receber") -> ramo LEGADO byte-idêntico ao original, SEM nenhuma classe .rx-*.
  const isInline = typeof cor === 'string' && (cor[0] === '#' || cor.indexOf('var(') === 0);
  if (isInline) {
    return `<div style="display:flex;flex-direction:column;gap:2px;">
    <div style="font-size:9.5px;letter-spacing:.4px;text-transform:uppercase;color:var(--text-tertiary);font-weight:700;font-family:'Space Grotesk',monospace;">${lab}</div>
    <div style="font-size:15px;font-weight:700;color:${cor};font-family:'Plus Jakarta Sans',sans-serif;">${val}</div>
    ${sub ? `<div style="font-size:10px;color:var(--text-tertiary);font-family:Inter,sans-serif;">${sub}</div>` : ''}
  </div>`;
  }
  // Ramo RX3+4: classe .rx-* (ou rx-default quando sem cor de status)
  return `<div class="rx-metric">
    <div class="rx-metric-lab">${lab}</div>
    <div class="rx-metric-val ${cor || 'rx-default'}">${val}</div>
    ${sub ? `<div class="rx-metric-sub">${sub}</div>` : ''}
  </div>`;
}

function _rxCardObra(x) {
  const o = x.o;
  const isEstrut = x.status === 'estrutura';

  let metricas;
  if (isEstrut) {
    metricas = `${_rxMetric('Custo acumulado', _rxFmt(x.custo), 'rx-warning')}${_rxMetric('Material', _rxFmt(x.material))}${_rxMetric('Lançamentos', x.qtd + '')}`;
  } else {
    const arSub = x.aReceber < 10 ? 'quitado' : (x.extrasReceber > 0 ? ('contrato ' + _rxK(x.aReceberContrato) + ' + extras ' + _rxK(x.extrasReceber)) : 'do contrato');
    metricas =
      _rxMetric('Contrato (venda)', _rxFmt(x.contrato)) +
      _rxMetric('Serviços extras', x.extras > 0 ? _rxFmt(x.extras) : '—', x.extras > 0 ? 'rx-info' : 'rx-muted', x.adicQtd > 0 ? (x.adicQtd + ' item' + (x.adicQtd > 1 ? 's' : '')) : '') +
      _rxMetric('Custo (saiu)', _rxFmt(x.custo), 'rx-warning') +
      _rxMetric('Projeção por contrato', _rxFmt(x.lucro), x.lucro >= 0 ? 'rx-success' : 'rx-danger', x.receita > 0 ? ('margem ' + x.margem.toFixed(0) + '%') : '') +
      _rxMetric('Recebido', _rxFmt(x.receb), 'rx-success') +
      _rxMetric('Saldo de fluxo acumulado', _rxFmt(x.caixa), x.caixa >= 0 ? 'rx-success' : 'rx-danger', 'recebido − custo, acumulado') +
      _rxMetric('Falta receber', x.aReceber < 10 ? 'quitado' : _rxFmt(x.aReceber), '#2563eb', arSub);
  }

  // barra de recebimento
  let barra = '';
  if (!isEstrut && x.contrato > 0 && x.pctReceb != null) {
    barra = `<div style="margin-top:12px;">
      <div style="display:flex;justify-content:space-between;font-family:'Space Grotesk',monospace;font-size:11px;color:var(--text-tertiary);margin-bottom:4px;">
        <span>Recebido do contrato</span><span><b style="color:var(--text-secondary);">${x.pctReceb}%</b> · ${x.aReceber > 10 ? 'falta ' + _rxK(x.aReceber) : 'quitado'}</span>
      </div>
      <div style="height:8px;background:var(--surface-alt);border-radius:5px;overflow:hidden;display:flex;">
        <div style="height:100%;width:${x.pctReceb}%;background:#16a34a;"></div>
        ${x.aReceber > 10 ? `<div style="height:100%;width:${100 - x.pctReceb}%;background:#2563eb;"></div>` : ''}
      </div>
    </div>`;
  }
  if (!isEstrut && x.prog != null) {
    const alerta = x.pctGasto != null && x.pctGasto > x.prog + 10;
    barra += `<div style="margin-top:10px;">
      <div style="display:flex;justify-content:space-between;font-family:'Space Grotesk',monospace;font-size:11px;color:var(--text-tertiary);margin-bottom:4px;">
        <span>Avanço da obra</span><span><b style="color:var(--text-secondary);">${x.prog}% construído</b>${x.pctGasto != null ? ' · ' + x.pctGasto + '% gasto' : ''}${alerta ? ' · ritmo de gasto alto' : ''}</span>
      </div>
      <div class="rx-bar-track">
        <div class="rx-bar-fill ${alerta ? 'rx-bar-fill--avanco-alerta' : 'rx-bar-fill--avanco'}" style="width:${x.prog}%;"></div>
      </div>
    </div>`;
  }

  return `<div class="rx-card">
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
  if (!RaioxModule._cronoLoaded) { _rxLoadCrono().then(() => renderRaiox()); }

  const linhas = _rxTodas().map(_rxCalc).filter(x => x.qtd > 0 || x.contrato > 0 || x.receb > 0);

  if (!linhas.length) {
    cont.innerHTML = `<div style="color:var(--text-tertiary);font-size:14px;padding:40px 0;text-align:center;font-family:Inter,sans-serif;">Nenhuma obra com movimentação ainda.</div>`;
    return;
  }

  const f = RaioxModule.filtro;
  const linhasKpi = (f === 'todas') ? linhas : linhas.filter(x => x.status === f);
  const escopo = f === 'andamento' ? 'obras em andamento' : (f === 'concluida' ? 'obras concluídas' : 'todas as obras');
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
    <div style="margin-bottom:16px;display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;">
      <div>
        <div style="font-family:'Plus Jakarta Sans',sans-serif;font-size:22px;font-weight:800;color:var(--text-primary);">Raio-X de Obras</div>
        <div style="font-size:13px;color:var(--text-tertiary);font-family:Inter,sans-serif;margin-top:2px;">Carteira ao vivo — quanto saiu, quanto entrou e o que entrou a mais (extras)</div>
      </div>
      <button onclick="rxEmitirRelatorio()" style="display:flex;align-items:center;gap:7px;background:var(--primary);color:#fff;border:none;border-radius:10px;padding:10px 16px;font-family:'Plus Jakarta Sans',sans-serif;font-weight:700;font-size:13px;cursor:pointer;white-space:nowrap;"><span class="material-symbols-outlined" style="font-size:18px;">description</span> Relatório completo</button>
    </div>
    <div style="font-size:11px;color:var(--text-tertiary);font-family:'Space Grotesk',monospace;margin-bottom:8px;">Números de: <b style="color:var(--text-secondary);">${escopo}</b> — use os filtros abaixo pra mudar</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:16px;">${_rxKpisHtml(linhasKpi)}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:4px;">${_rxFiltrosHtml(f)}</div>
    ${corpo}`;
}

function rxSetFiltro(f) {
  RaioxModule.filtro = f;
  renderRaiox();
}

// ══════════════════════════════════════════════════════════════════
// EMITIR RELATÓRIO COMPLETO — documento ao vivo, imprimível (abre nova aba)
// ══════════════════════════════════════════════════════════════════
function _rxDt(s) { return s ? String(s).slice(0, 10).split('-').reverse().join('/') : '—'; }

function _rxEtapasObra(id) {
  const ls = (typeof lancamentos !== 'undefined' ? lancamentos : []).filter(l => l.obra_id === id);
  const g = {};
  ls.forEach(l => { const k = (typeof etapaLabel === 'function') ? etapaLabel(l.etapa || '36_outros') : (l.etapa || 'Outros'); g[k] = (g[k] || 0) + Number(l.total || 0); });
  return Object.entries(g).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
}
function _rxCefObra(id) {
  return _rxRepasses().filter(r => r.obra_id === id).slice().sort((a, b) => String(a.data_credito || '').localeCompare(String(b.data_credito || '')));
}
function _rxAdicObra(id) {
  // Mesmo filtro de _rxCalc: pendentes e cancelados não entram no relatório impresso
  const ad = (typeof obrasAdicionais !== 'undefined' ? obrasAdicionais : [])
    .filter(a => a.obra_id === id && a.status !== 'pendente' && a.status !== 'cancelado');
  const pg = (typeof adicionaisPgtos !== 'undefined' ? adicionaisPgtos : []);
  return ad.map(a => ({ desc: a.descricao || '—', valor: Number(a.valor || 0), status: a.status || '', pago: pg.filter(p => p.adicional_id === a.id).reduce((s, p) => s + Number(p.valor || 0), 0) }));
}

function _rxDocCss() {
  return `<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#f4f2ee;color:#1c1a17;font-family:'Inter',system-ui,-apple-system,sans-serif;font-size:14px;line-height:1.5;padding:0}
  .wrap{max-width:1080px;margin:0 auto;padding:0 24px 60px}
  .doc-head{border-bottom:2px solid #1c1a17;padding:30px 0 18px;display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:14px}
  .doc-head .eyebrow{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#c2410c;font-weight:600}
  .doc-head h1{font-size:28px;font-weight:700;letter-spacing:-.02em;margin-top:5px}
  .doc-head .sub{color:#5c574f;font-size:13px;margin-top:3px}
  .doc-head .stamp{font-family:'JetBrains Mono',monospace;font-size:12px;color:#5c574f;text-align:right;line-height:1.7}
  .kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:1px;background:#e4ddd3;border:1px solid #e4ddd3;border-radius:10px;overflow:hidden;margin:22px 0}
  .kpi{background:#fff;padding:14px 16px}
  .kpi .l{font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#a8a098;font-weight:600}
  .kpi .v{font-family:'JetBrains Mono',monospace;font-size:19px;font-weight:600;margin-top:4px}
  .kpi .s{font-size:11px;color:#5c574f;margin-top:2px}
  h2.sec{font-family:'JetBrains Mono',monospace;font-size:12px;letter-spacing:.12em;text-transform:uppercase;font-weight:700;margin:26px 0 10px;color:#1c1a17}
  h2.sec span{color:#a8a098;font-weight:500}
  .card{background:#fff;border:1px solid #e4ddd3;border-radius:12px;margin-bottom:14px;overflow:hidden}
  .card-h{padding:15px 18px;border-bottom:1px solid #e4ddd3;display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:8px}
  .card-h .nm{font-size:18px;font-weight:700}
  .card-h .meta{font-family:'JetBrains Mono',monospace;font-size:11px;color:#a8a098}
  .badge{font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;padding:3px 8px;border-radius:5px;margin-left:8px}
  .b-and{background:#e8f0eb;color:#2d6a4f}.b-con{background:#e8eef6;color:#1d4e89}.b-est{background:#eee9e2;color:#5c574f}
  .mrow{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:1px;background:#f0ece5}
  .m{background:#fff;padding:12px 16px}
  .m .l{font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:.06em;text-transform:uppercase;color:#a8a098;font-weight:600}
  .m .v{font-family:'JetBrains Mono',monospace;font-size:15px;font-weight:600;margin-top:3px}
  .pos{color:#15803d}.neg{color:#b91c1c}.acc{color:#c2410c}.az{color:#1d4e89}
  .sub-sec{padding:12px 18px;border-top:1px solid #f0ece5}
  .sub-sec h3{font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#5c574f;font-weight:700;margin-bottom:7px}
  table{width:100%;border-collapse:collapse;font-size:12.5px}
  th{font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:.05em;text-transform:uppercase;color:#a8a098;text-align:left;font-weight:600;padding:5px 8px;border-bottom:1px solid #e4ddd3}
  td{padding:6px 8px;border-bottom:1px solid #faf8f4}
  td.n{font-family:'JetBrains Mono',monospace;text-align:right;white-space:nowrap}
  tr:last-child td{border-bottom:none}
  .toolbar{position:sticky;top:0;background:#f4f2ee;padding:12px 0;display:flex;gap:10px;justify-content:flex-end;border-bottom:1px solid #e4ddd3;z-index:5}
  .pbtn{font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:600;padding:8px 16px;border:1px solid #1c1a17;background:#1c1a17;color:#fff;border-radius:8px;cursor:pointer}
  footer{border-top:1px solid #e4ddd3;margin-top:30px;padding:18px 0;font-family:'JetBrains Mono',monospace;font-size:11px;color:#a8a098;display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px}
  @media print{.toolbar{display:none}body{background:#fff}.card{break-inside:avoid;border:1px solid #ccc}}
  </style><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">`;
}

function _rxDocObra(x) {
  const o = x.o;
  const isEstrut = x.status === 'estrutura';
  const badge = { andamento: ['Em obra', 'b-and'], concluida: ['Concluída', 'b-con'], estrutura: ['Estrutura', 'b-est'] }[x.status] || ['', 'b-est'];
  const etapas = _rxEtapasObra(o.id);
  const maxEt = etapas.length ? etapas[0][1] : 1;
  const cef = isEstrut ? [] : _rxCefObra(o.id);
  const adic = isEstrut ? [] : _rxAdicObra(o.id);

  let mrow;
  if (isEstrut) {
    mrow = `<div class="m"><div class="l">Custo acumulado</div><div class="v acc">${_rxFmt(x.custo)}</div></div>
      <div class="m"><div class="l">Material</div><div class="v">${_rxFmt(x.material)}</div></div>
      <div class="m"><div class="l">Lançamentos</div><div class="v">${x.qtd}</div></div>`;
  } else {
    const arTxt = x.aReceber < 10 ? 'quitado' : _rxFmt(x.aReceber);
    mrow = `<div class="m"><div class="l">Contrato (venda)</div><div class="v">${_rxFmt(x.contrato)}</div></div>
      <div class="m"><div class="l">Serviços extras</div><div class="v az">${x.extras > 0 ? _rxFmt(x.extras) : '—'}</div></div>
      <div class="m"><div class="l">Recebido</div><div class="v pos">${_rxFmt(x.receb)}</div></div>
      <div class="m"><div class="l">Custo (saiu)</div><div class="v acc">${_rxFmt(x.custo)}</div></div>
      <div class="m"><div class="l">Saldo de fluxo acumulado</div><div class="v ${x.caixa >= 0 ? 'pos' : 'neg'}">${_rxFmt(x.caixa)}</div></div>
      <div class="m"><div class="l">Projeção por contrato</div><div class="v ${x.lucro >= 0 ? 'pos' : 'neg'}">${_rxFmt(x.lucro)}</div></div>
      <div class="m"><div class="l">Falta receber</div><div class="v az">${arTxt}</div></div>
      ${x.prog != null ? `<div class="m"><div class="l">Avanço da obra</div><div class="v">${x.prog}%${x.pctGasto != null ? ' · ' + x.pctGasto + '% gasto' : ''}</div></div>` : ''}`;
  }

  const tabEtapas = etapas.length ? `<div class="sub-sec"><h3>Custo por etapa</h3><table><tbody>${etapas.map(([n, v]) => `<tr><td>${_rxEsc(n)}</td><td class="n">${_rxFmt(v)}</td></tr>`).join('')}</tbody></table></div>` : '';
  const tabCef = cef.length ? `<div class="sub-sec"><h3>Repasses CEF · ${_rxK(x.receb)}</h3><table><thead><tr><th>Data</th><th>Tipo</th><th>Obs</th><th style="text-align:right">Valor</th></tr></thead><tbody>${cef.map(r => `<tr><td>${_rxDt(r.data_credito)}</td><td>${_rxEsc((r.tipo || 'pls').toUpperCase())}</td><td>${_rxEsc(r.observacao || '—')}</td><td class="n">${_rxFmt(r.valor)}</td></tr>`).join('')}</tbody></table></div>` : '';
  const tabAdic = adic.length ? `<div class="sub-sec"><h3>Serviços extras · ${_rxK(x.extras)}</h3><table><thead><tr><th>Descrição</th><th>Status</th><th style="text-align:right">Valor</th><th style="text-align:right">Pago</th></tr></thead><tbody>${adic.map(a => `<tr><td>${_rxEsc(a.desc)}</td><td>${_rxEsc(a.status)}</td><td class="n">${_rxFmt(a.valor)}</td><td class="n">${a.pago > 0 ? _rxFmt(a.pago) : '—'}</td></tr>`).join('')}</tbody></table></div>` : '';

  return `<div class="card">
    <div class="card-h"><div class="nm">${_rxEsc(o.nome)}<span class="badge ${badge[1]}">${badge[0]}</span></div>
      <div class="meta">${_rxEsc(o.cidade || '')}${o.area_m2 && Number(o.area_m2) > 0 ? ' · ' + o.area_m2 + ' m²' : ''}</div></div>
    <div class="mrow">${mrow}</div>${tabEtapas}${tabCef}${tabAdic}
  </div>`;
}

function rxEmitirRelatorio() {
  const linhas = _rxTodas().map(_rxCalc).filter(x => x.qtd > 0 || x.contrato > 0 || x.receb > 0);
  if (!linhas.length) { if (typeof showToast === 'function') showToast('Sem obras para emitir.'); return; }

  const reais = linhas.filter(x => x.status !== 'estrutura');
  const contratos = reais.reduce((s, x) => s + x.contrato, 0);
  const extras = reais.reduce((s, x) => s + x.extras, 0);
  const recebido = reais.reduce((s, x) => s + x.receb, 0);
  const custo = reais.reduce((s, x) => s + x.custo, 0);
  const lucro = (contratos + extras) - custo;
  const caixa = recebido - custo;
  const aReceber = reais.reduce((s, x) => s + x.aReceber, 0);
  const kpis = [
    ['Contratos', _rxK(contratos), reais.length + ' obras'],
    ['Serviços extras', _rxK(extras), 'entrou a mais', 'az'],
    ['Recebido', _rxK(recebido), 'entrou', 'pos'],
    ['Custo', _rxK(custo), 'saiu', 'acc'],
    ['Saldo de fluxo acumulado', _rxK(caixa), 'recebido − custo, acumulado', caixa >= 0 ? 'pos' : 'neg'],
    ['Projeção por contrato', _rxK(lucro), 'contrato + extras − custo realizado', lucro >= 0 ? 'pos' : 'neg'],
    ['Falta receber', _rxK(aReceber), 'contrato + extras', 'az'],
  ];
  const kpiHtml = kpis.map(k => `<div class="kpi"><div class="l">${k[0]}</div><div class="v ${k[3] || ''}">${k[1]}</div><div class="s">${k[2]}</div></div>`).join('');

  const grupos = [['andamento', 'Em andamento'], ['concluida', 'Concluídas'], ['estrutura', 'Estrutura / Almoxarifado']];
  let obrasHtml = '';
  grupos.forEach(([st, tit]) => {
    const itens = linhas.filter(x => x.status === st).sort((a, b) => b.aReceber - a.aReceber || b.custo - a.custo);
    if (!itens.length) return;
    obrasHtml += `<h2 class="sec">${tit} <span>· ${itens.length}</span></h2>` + itens.map(_rxDocObra).join('');
  });

  const hoje = new Date().toLocaleDateString('pt-BR');
  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EDR — Raio-X de Obras ${hoje}</title>${_rxDocCss()}</head><body>
    <div class="toolbar"><div class="wrap" style="width:100%;display:flex;justify-content:flex-end;padding-top:0;padding-bottom:0;"><button class="pbtn" onclick="window.print()">Imprimir / Salvar PDF</button></div></div>
    <div class="wrap">
      <div class="doc-head">
        <div><div class="eyebrow">EDR Engenharia · Gestão de Obras</div><h1>Raio-X de Obras</h1><div class="sub">Carteira ao vivo — quanto saiu, quanto entrou e o que entrou a mais</div></div>
        <div class="stamp">Emitido em <b>${hoje}</b><br>Fonte: EDR System (ao vivo)</div>
      </div>
      <div class="kpis">${kpiHtml}</div>
      ${obrasHtml}
      <footer><span>EDR Engenharia — CNPJ 49.909.440/0001-55 · Jupi-PE</span><span>Raio-X de Obras · emitido pelo EDR System</span></footer>
    </div>
  </body></html>`;

  const w = window.open('', '_blank');
  if (!w) { if (typeof showToast === 'function') showToast('Libere o pop-up pra emitir o relatório.'); return; }
  w.document.open(); w.document.write(html); w.document.close();
}

// ── Registro no viewRegistry ──
if (typeof viewRegistry !== 'undefined') {
  viewRegistry.register('raiox', (container) => renderRaiox(container));
}
window.rxSetFiltro = rxSetFiltro;
window.renderRaiox = renderRaiox;
window.rxEmitirRelatorio = rxEmitirRelatorio;
