// ══════════════════════════════════════════════════════════════════
// EDR System V2 — Modulo: RAIO-X DE OBRAS
// Painel consolidado por obra (carteira ao vivo): contrato, custo,
// recebido CEF, quanto falta receber, margem prevista.
// Lê dados JÁ carregados em memória — nao faz query nova.
// Depende: infra.js (obras, obrasArquivadas, lancamentos, distribuicoes,
//          getAdicionaisObra, fmt, esc), custos.js (CustosModule.repassesCef)
// ══════════════════════════════════════════════════════════════════

const RaioxModule = {
  filtro: 'todas',   // todas | andamento | concluida
};

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

// Cálculo por obra — mesma lógica financeira do resto do sistema
function _rxCalc(o) {
  const reps = _rxRepasses();
  const ls = (typeof lancamentos !== 'undefined' ? lancamentos : []).filter(l => l.obra_id === o.id);
  const custo = ls.reduce((s, l) => s + Number(l.total || 0), 0);
  const material = (typeof distribuicoes !== 'undefined' ? distribuicoes : []).filter(d => d.obra_id === o.id).reduce((s, d) => s + Number(d.valor || 0), 0);
  const receb = reps.filter(r => r.obra_id === o.id).reduce((s, r) => s + Number(r.valor || 0), 0);
  const contrato = Number(o.contrato_valor_edr || 0);
  const adic = (typeof getAdicionaisObra === 'function') ? getAdicionaisObra(o.id) : { valorTotal: 0, totalRecebido: 0, saldo: 0, qtd: 0 };
  const aReceberContrato = contrato > 0 ? Math.max(0, contrato - receb) : 0;
  const aReceberAdic = Math.max(0, (adic.valorTotal || 0) - (adic.totalRecebido || 0));
  const aReceber = aReceberContrato + aReceberAdic;
  const sobra = (contrato > 0 ? contrato : receb) - custo;
  const pctGasto = contrato > 0 ? Math.round(custo / contrato * 100) : null;
  const pctReceb = contrato > 0 ? Math.min(100, Math.round(receb / contrato * 100)) : null;
  return { o, status: _rxStatus(o), custo, material, receb, contrato, adic, aReceber, aReceberContrato, aReceberAdic, sobra, pctGasto, pctReceb, qtd: ls.length };
}

function _rxTodas() {
  const ativas = (typeof obras !== 'undefined' && Array.isArray(obras)) ? obras : [];
  const arq = (typeof obrasArquivadas !== 'undefined' && Array.isArray(obrasArquivadas)) ? obrasArquivadas : [];
  return [...ativas, ...arq];
}

// ── KPIs CONSOLIDADOS ──────────────────────────────────────────
function _rxKpisHtml(linhas) {
  const reais = linhas.filter(x => x.status !== 'estrutura');
  const contratado = reais.reduce((s, x) => s + (x.contrato > 0 ? x.contrato : 0), 0);
  const recebido = reais.reduce((s, x) => s + x.receb, 0);
  const aReceber = reais.reduce((s, x) => s + x.aReceber, 0);
  const custo = reais.reduce((s, x) => s + x.custo, 0);
  const margem = contratado - custo;
  const estrut = linhas.filter(x => x.status === 'estrutura').reduce((s, x) => s + x.custo, 0);

  const cards = [
    { lab: 'Contratado', val: _rxK(contratado), sub: reais.filter(x => x.contrato > 0).length + ' contratos', cor: 'var(--text-primary)' },
    { lab: 'Recebido (CEF)', val: _rxK(recebido), sub: 'entradas · terreno · PLS', cor: 'var(--text-primary)' },
    { lab: 'A receber', val: _rxK(aReceber), sub: 'contrato + adicionais', cor: '#2563eb', destaque: true },
    { lab: 'Custo realizado', val: _rxK(custo), sub: 'tudo lançado' + (estrut > 0 ? ' · +' + _rxK(estrut) + ' estrutura' : ''), cor: 'var(--text-primary)' },
    { lab: 'Margem prevista', val: _rxK(margem), sub: 'contrato − custo', cor: margem >= 0 ? '#16a34a' : '#dc2626' },
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
  const temContrato = x.contrato > 0;
  const aReceberVal = isEstrut ? '—' : (temContrato ? (x.aReceber < 10 ? 'quitado' : _rxK(x.aReceber)) : 'cadastrar contrato');
  const aReceberSub = isEstrut ? '' : (temContrato ? (x.aReceber < 10 ? 'recebido integral' : (x.aReceberAdic > 0 ? '+adic ' + _rxK(x.aReceberAdic) : 'do contrato')) : 'sem valor');
  const aReceberCor = isEstrut ? 'var(--text-tertiary)' : (temContrato ? '#2563eb' : 'var(--text-tertiary)');

  // barra de recebimento (só com contrato)
  let barra = '';
  if (temContrato && x.pctReceb != null) {
    barra = `<div style="margin-top:12px;">
      <div style="display:flex;justify-content:space-between;font-family:'Space Grotesk',monospace;font-size:11px;color:var(--text-tertiary);margin-bottom:4px;">
        <span>Recebido do contrato</span><span><b style="color:var(--text-secondary);">${x.pctReceb}%</b> · ${x.aReceber > 10 ? 'falta ' + _rxK(x.aReceber) : 'quitado'}</span>
      </div>
      <div style="height:8px;background:var(--surface-alt);border-radius:5px;overflow:hidden;">
        <div style="height:100%;width:${x.pctReceb}%;background:#16a34a;border-radius:5px;"></div>
      </div>
    </div>`;
  }

  const linha2 = isEstrut
    ? `${_rxMetric('Custo acumulado', _rxFmt(x.custo), 'var(--primary)')}${_rxMetric('Material', _rxFmt(x.material))}${_rxMetric('Lançamentos', x.qtd + '')}`
    : `${_rxMetric(temContrato ? 'Contrato EDR' : 'Recebido', _rxFmt(temContrato ? x.contrato : x.receb))}
       ${_rxMetric('Custo realizado', _rxFmt(x.custo), 'var(--primary)')}
       ${_rxMetric('A receber', aReceberVal, aReceberCor, aReceberSub)}
       ${_rxMetric('Recebido CEF', _rxFmt(x.receb))}`;

  return `<div style="background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:16px 18px;margin-bottom:12px;">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:14px;">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        <span style="font-family:'Plus Jakarta Sans',sans-serif;font-size:17px;font-weight:800;color:var(--text-primary);">${_rxEsc(o.nome)}</span>
        ${_rxBadge(x.status)}
      </div>
      <span style="font-size:11.5px;color:var(--text-tertiary);font-family:Inter,sans-serif;">${_rxEsc(o.cidade || '')}${o.area_m2 && Number(o.area_m2) > 0 ? ' · ' + o.area_m2 + ' m²' : ''}</span>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:14px;">${linha2}</div>
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
      <div style="font-size:13px;color:var(--text-tertiary);font-family:Inter,sans-serif;margin-top:2px;">Carteira ao vivo — contrato, custo e quanto falta receber por obra</div>
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
