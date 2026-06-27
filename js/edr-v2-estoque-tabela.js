// ══════════════════════════════════════════════════════════════════
// EDR System V2 — Estoque · MODO TABELA (Fase 1 — só visualização)
// Reaproveita 100% de consolidarEstoque()/renderEstoque(): NÃO calcula
// saldo, NÃO toca banco, NÃO grava nada. Só apresenta o _consolidado
// num painel de gestão (KPIs + tabela densa + drawer somente leitura).
// Ativado pela bifurcação em renderEstoque() quando viewMode==='tabela'.
// ══════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  // helpers do app, com fallback defensivo
  const _esc = s => (typeof esc === 'function' ? esc(s) : String(s == null ? '' : s));
  const _fmtR = v => (typeof fmtR === 'function' ? fmtR(v) : 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const _fmtQ = v => (typeof fmtQtd === 'function' ? fmtQtd(v) : Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 }));
  const _lbl = c => (typeof etapaLabel === 'function' && c ? etapaLabel(c) : (c || '—'));
  const ALTO = 5000;

  let _itens = [];      // itens já filtrados/ordenados pelo renderEstoque (sem paginação)
  let _universo = [];   // _consolidado completo (pros KPIs)
  let _kpi = null;      // filtro de KPI client-side: precificar|negativos|alto|legado|comsaldo|null

  // ── DERIVAÇÕES (só leem o item consolidado, não recalculam saldo) ──
  function status(it) {
    if (it.saldo < 0) return 'NEGATIVO';
    if (it.saldo === 0) return 'ZERADO';
    if ((it.valorMedio || 0) === 0) return it.temNF ? 'SEM_VALOR' : 'LEGADO';
    return 'OK';
  }
  const STLABEL = { SEM_VALOR: 'SEM VALOR', LEGADO: 'LEGADO', NEGATIVO: 'NEGATIVO', OK: 'OK', ZERADO: 'ZERADO' };
  function origem(it) {
    const nf = it.entradas || 0, ed = it.entradasDiretas || 0, aj = Math.max(0, it.ajustes || 0);
    const m = Math.max(nf, ed, aj);
    if (m === 0) return { k: 'na', l: 'Sem origem clara' };
    if (nf === m) return { k: 'nf', l: 'NF' };
    if (ed === m) return { k: 'ed', l: 'Entrada direta' };
    return { k: 'aj', l: 'Ajuste' };
  }
  const isPrecificar = it => it.saldo > 0 && (it.valorMedio || 0) === 0 && it.temNF;
  const isLegado = it => it.saldo > 0 && (it.valorMedio || 0) === 0 && !it.temNF;

  function matchKpi(it) {
    switch (_kpi) {
      case 'comsaldo': return it.saldo > 0;
      case 'precificar': return isPrecificar(it);
      case 'negativos': return it.saldo < 0;
      case 'alto': return it.valorEstoque > ALTO;
      case 'legado': return isLegado(it);
      default: return true;
    }
  }

  // ── KPIs (sobre o universo do almoxarifado) ──
  function kpis() {
    const u = _universo;
    const comSaldo = u.filter(i => i.saldo > 0);
    return [
      { id: null, cls: 'k-total', lbl: 'Valor conhecido', val: _fmtR(comSaldo.reduce((s, i) => s + i.saldo * (i.valorMedio || 0), 0)), tip: u.filter(isPrecificar).length + ' sem preço fora da conta' },
      { id: 'comsaldo', cls: 'k-saldo', lbl: 'Itens com saldo', val: comSaldo.length },
      { id: 'precificar', cls: 'k-precificar', lbl: 'Precificar agora', val: u.filter(isPrecificar).length, tip: 'fila de ação' },
      { id: 'negativos', cls: 'k-neg', lbl: 'Negativos', val: u.filter(i => i.saldo < 0).length },
      { id: 'alto', cls: 'k-alto', lbl: 'Alto valor (>5k)', val: u.filter(i => i.valorEstoque > ALTO).length },
      { id: 'legado', cls: 'k-legado', lbl: 'Legado (informativo)', val: u.filter(isLegado).length },
    ];
  }

  // ── RENDER ──
  function render(itens, universo) {
    injectCSS();
    _itens = Array.isArray(itens) ? itens : [];
    _universo = Array.isArray(universo) ? universo : [];
    const el = document.getElementById('estoque-lista');
    if (!el) return;
    const isAdmin = (typeof usuarioAtual !== 'undefined' && usuarioAtual?.perfil === 'admin');

    const kp = kpis().map(k =>
      `<button class="estk-kpi ${k.cls} ${(_kpi || null) === (k.id || null) ? 'active' : ''}" onclick="EstoqueTabela.kpi(${k.id ? `'${k.id}'` : 'null'})">
        <span class="estk-kl"><span class="estk-dot"></span>${k.lbl}</span>
        <span class="estk-kn">${k.val}</span>
        ${k.tip ? `<span class="estk-kt">▸ ${_esc(k.tip)}</span>` : ''}
      </button>`).join('');

    const rows = _itens.filter(matchKpi);
    const body = rows.length ? rows.map((it, i) => {
      const st = status(it), o = origem(it);
      const tcls = it.valorEstoque < 0 ? 'neg' : it.valorEstoque > 0 ? 'pos' : 'zero';
      const idx = _universo.indexOf(it);
      return `<div class="estk-row" onclick="EstoqueTabela.open('${_esc(it.chave)}')">
        <div class="estk-cod">${it.codigo ? _esc(it.codigo) : '—'}</div>
        <div class="estk-mat" title="${_esc(it.desc)}">${_esc(it.desc)}</div>
        <div class="estk-cat"><span class="estk-catb">${_esc(_lbl(it.categoria))}</span></div>
        <div class="estk-saldo ${it.saldo < 0 ? 'neg' : it.saldo === 0 ? 'zero' : ''}">${_fmtQ(it.saldo)} <span class="estk-un">${_esc(it.unidade || 'UN')}</span></div>
        ${isAdmin ? `<div class="estk-vmed">${it.valorMedio ? _fmtR(it.valorMedio) : '—'}</div>` : '<div class="estk-vmed">—</div>'}
        ${isAdmin ? `<div class="estk-total ${tcls}">${it.valorEstoque ? _fmtR(it.valorEstoque) : 'R$ 0'}</div>` : '<div class="estk-total zero">—</div>'}
        <div class="estk-org"><span class="estk-od od-${o.k}"></span>${o.l}</div>
        <div><span class="estk-st st-${st.toLowerCase()}">${STLABEL[st]}</span></div>
      </div>`;
    }).join('') : `<div class="estk-empty">Nenhum item neste recorte.</div>`;

    const valExib = rows.filter(i => i.saldo > 0).reduce((s, i) => s + i.saldo * (i.valorMedio || 0), 0);

    el.innerHTML = `
      <div class="estk-diag">Diagnóstico do almoxarifado <span>números do estoque inteiro · clique num indicador para filtrar a lista abaixo</span></div>
      <div class="estk-kpis">${kp}</div>
      <div class="estk-card">
        <div class="estk-head">
          <div>Código</div><div>Material</div><div>Categoria</div><div class="r">Saldo</div>
          <div class="r ${isAdmin ? '' : 'estk-hide'}">Vlr médio</div><div class="r ${isAdmin ? '' : 'estk-hide'}">Total</div>
          <div>Origem</div><div>Status</div>
        </div>
        <div class="estk-body">${body}</div>
        <div class="estk-count"><span>${rows.length} ${rows.length === 1 ? 'item' : 'itens'}</span>${isAdmin ? `<span>valor exibido ${_fmtR(valExib)}</span>` : ''}</div>
      </div>`;
  }

  // ── FILTRO POR KPI ──
  function kpi(id) {
    _kpi = (_kpi === id) ? null : id;
    if (typeof renderEstoque === 'function') renderEstoque();
  }

  // ── DRAWER (somente leitura) ──
  function compRow(label, k, val, max) {
    if (!val) return '';
    const p = max > 0 ? Math.min(100, Math.round(Math.abs(val) / max * 100)) : 0;
    return `<div class="estk-crow"><span class="estk-cl"><span class="estk-od od-${k}"></span>${label}</span><div class="estk-bar"><span style="width:${p}%" class="seg-${k}"></span></div><span class="estk-cv">${_fmtQ(val)}</span></div>`;
  }
  function motivo(it, st) {
    if (st === 'SEM_VALOR') return { c: 'warn', t: `Tem saldo (${_fmtQ(it.saldo)} ${_esc(it.unidade || 'UN')}) mas <b>custo R$ 0,00</b> — a entrada não registrou preço. Distorce valor de estoque e DRE. Entra na fila <b>Precificar agora</b>.` };
    if (st === 'LEGADO') return { c: 'info', t: `Entrou sem NF (inventário/ajuste). Valor zero é <b>esperado</b> aqui — não é erro. Vai zerando no uso.` };
    if (st === 'NEGATIVO') return { c: 'danger', t: `Saldo <b>negativo</b>: saiu mais do que entrou no sistema. Conferir distribuições/lançamentos antes de qualquer ajuste.` };
    if (st === 'ZERADO') return { c: 'info', t: `Sem saldo no momento. Histórico preservado.` };
    return { c: 'ok', t: `Saldo e custo consistentes. Total em estoque <b>${_fmtR(it.valorEstoque)}</b>.` };
  }
  function open(chave) {
    const it = (typeof EstoqueModule !== 'undefined' ? EstoqueModule._consolidado : []).find(i => i.chave === chave);
    if (!it) return;
    injectCSS();
    const st = status(it), o = origem(it), m = motivo(it, st);
    const isAdmin = (typeof usuarioAtual !== 'undefined' && usuarioAtual?.perfil === 'admin');
    const maxEnt = Math.max(it.entradas || 0, it.entradasDiretas || 0, Math.max(0, it.ajustes || 0), 1);
    let comp = compRow('NF', 'nf', it.entradas, maxEnt) + compRow('Entrada direta', 'ed', it.entradasDiretas, maxEnt) + compRow('Ajuste', 'aj', it.ajustes, maxEnt);
    if (it.saidas) comp += compRow('Saídas (distribuição)', 'dist', it.saidas, maxEnt);
    if (!comp) comp = '<div class="estk-note">Sem movimentação registrada.</div>';

    let dw = document.getElementById('estk-drawer');
    if (!dw) { dw = document.createElement('aside'); dw.id = 'estk-drawer'; dw.className = 'estk-dw'; document.body.appendChild(dw); }
    let ov = document.getElementById('estk-ov');
    if (!ov) { ov = document.createElement('div'); ov.id = 'estk-ov'; ov.className = 'estk-ov'; ov.onclick = close; document.body.appendChild(ov); }

    dw.innerHTML = `
      <div class="estk-dwh">
        <div><div class="estk-dwc">${it.codigo ? _esc(it.codigo) : '—'} · ${_esc(it.unidade || 'UN')}</div>
          <div class="estk-dwn">${_esc(it.desc)}</div>
          <div style="margin-top:8px"><span class="estk-st st-${st.toLowerCase()}">${STLABEL[st]}</span> <span class="estk-catb" style="margin-left:4px">${_esc(_lbl(it.categoria))}</span> <span class="estk-org" style="margin-left:4px"><span class="estk-od od-${o.k}"></span>${o.l}</span></div>
        </div>
        <button class="estk-x" onclick="EstoqueTabela.close()">✕</button>
      </div>
      <div class="estk-dwb">
        <div class="estk-callout ${m.c}"><b>Por que ${STLABEL[st]}:</b> ${m.t}</div>
        <div class="estk-grid">
          ${isAdmin ? `<div class="estk-cell hero"><div class="k">Total em estoque</div><div class="v">${_fmtR(it.valorEstoque)}</div></div>` : ''}
          <div class="estk-cell"><div class="k">Saldo</div><div class="v" style="${it.saldo < 0 ? 'color:var(--error)' : ''}">${_fmtQ(it.saldo)} <span style="font-size:11px;color:var(--text-secondary)">${_esc(it.unidade || 'UN')}</span></div></div>
          ${isAdmin ? `<div class="estk-cell"><div class="k">Valor médio</div><div class="v sm" style="${it.valorMedio ? '' : 'color:var(--warning)'}">${_fmtR(it.valorMedio)}</div></div>` : ''}
        </div>
        <div class="estk-sec">Composição da origem</div>
        <div class="estk-comp">${comp}</div>
        ${isPrecificar(it) ? `<div class="estk-sec">Ação</div><div class="estk-action"><div class="estk-note">Este item precisa de preço. A <b>precificação entra na Fase 2</b> — esta tela é só visualização confiável.</div></div>` : ''}
      </div>
      <div class="estk-dwf">
        <button class="estk-btn" onclick="EstoqueTabela.close();(typeof abrirHistoricoMaterial==='function')&&abrirHistoricoMaterial('${_esc(it.chave)}')">Ver histórico</button>
        <button class="estk-btn" disabled style="opacity:.6;cursor:not-allowed">Definir valor <span class="estk-f2">FASE 2</span></button>
      </div>`;
    dw.classList.add('show'); ov.classList.add('show');
  }
  function close() {
    document.getElementById('estk-drawer')?.classList.remove('show');
    document.getElementById('estk-ov')?.classList.remove('show');
  }
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });

  function setView(mode) {
    if (typeof EstoqueModule === 'undefined') return;
    EstoqueModule.viewMode = mode;
    document.getElementById('est-view-cards')?.classList.toggle('ativo', mode === 'cards');
    document.getElementById('est-view-tabela')?.classList.toggle('ativo', mode === 'tabela');
    if (mode === 'cards') _kpi = null;
    if (typeof renderEstoque === 'function') renderEstoque();
  }

  // ── CSS injetado uma vez (usa as vars de tema do app) ──
  function injectCSS() {
    if (document.getElementById('estk-css')) return;
    const s = document.createElement('style');
    s.id = 'estk-css';
    s.textContent = `
.estk-diag{font:700 11px/1 sans-serif;text-transform:uppercase;letter-spacing:.04em;color:var(--text-secondary,#5b6776);margin:2px 0 8px;display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}
.estk-diag span{font-weight:500;text-transform:none;letter-spacing:0;color:#93a0ad;font-size:11px}
.estk-kpis{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin-bottom:12px}
@media(max-width:900px){.estk-kpis{grid-template-columns:repeat(3,1fr)}}
.estk-kpi{background:var(--card,#fff);border:1px solid var(--border,#e0e4ea);border-radius:8px;padding:10px 11px;cursor:pointer;text-align:left;transition:.15s}
.estk-kpi:hover{transform:translateY(-1px)}
.estk-kpi.active{box-shadow:0 0 0 2px var(--primary,#15803d) inset}
.estk-kl{display:flex;align-items:center;gap:5px;font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:var(--text-secondary,#5b6776);font-weight:600}
.estk-dot{width:7px;height:7px;border-radius:50%;background:var(--text-secondary,#5b6776);display:inline-block}
.estk-kn{display:block;font:700 21px/1.1 'JetBrains Mono',ui-monospace,monospace;margin-top:6px}
.estk-kt{display:block;font:600 9px/1 'JetBrains Mono',ui-monospace,monospace;color:#c2410c;margin-top:4px}
.estk-kpi.k-total .estk-kn{color:var(--primary,#15803d)} .estk-kpi.k-total .estk-dot{background:var(--primary,#15803d)}
.estk-kpi.k-precificar .estk-kn{color:#c2410c} .estk-kpi.k-precificar .estk-dot{background:#c2410c}
.estk-kpi.k-neg .estk-kn{color:var(--error,#d4322a)} .estk-kpi.k-neg .estk-dot{background:var(--error,#d4322a)}
.estk-kpi.k-alto .estk-kn{color:#2563eb} .estk-kpi.k-alto .estk-dot{background:#2563eb}
.estk-kpi.k-legado .estk-kn{color:#475569} .estk-kpi.k-legado .estk-dot{background:#475569}
.estk-card{background:var(--card,#fff);border:1px solid var(--border,#e0e4ea);border-radius:8px;overflow:hidden}
.estk-head,.estk-row{display:grid;grid-template-columns:70px 1fr 120px 110px 100px 116px 124px 112px;align-items:center}
.estk-head{background:var(--bg-subtle,#f6f8fa);border-bottom:1px solid var(--border,#e0e4ea)}
.estk-head>div{padding:9px 12px;font:600 10px/1 sans-serif;text-transform:uppercase;letter-spacing:.04em;color:var(--text-secondary,#5b6776)}
.estk-body{max-height:60vh;overflow:auto}
.estk-row{border-bottom:1px solid var(--border,#e0e4ea);cursor:pointer;transition:background .1s}
.estk-row:hover{background:var(--bg-subtle,#f6f8fa)}
.estk-row>div{padding:8px 12px;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.estk-cod{font:600 12px/1 'JetBrains Mono',ui-monospace,monospace;color:#93a0ad}
.estk-mat{font-weight:600}
.estk-catb{display:inline-block;font:600 10.5px/1 sans-serif;padding:3px 7px;border-radius:5px;background:rgba(21,128,61,.1);color:var(--primary,#15803d)}
.r,.estk-saldo,.estk-vmed,.estk-total{justify-self:end;text-align:right}
.estk-saldo{font:600 13px/1 'JetBrains Mono',ui-monospace,monospace}
.estk-saldo.neg{color:var(--error,#d4322a)} .estk-saldo.zero{color:#93a0ad}
.estk-un{font-size:10px;color:var(--text-secondary,#5b6776)}
.estk-vmed{font:500 11.5px/1 'JetBrains Mono',ui-monospace,monospace;color:#93a0ad}
.estk-total{font:700 15px/1 'JetBrains Mono',ui-monospace,monospace}
.estk-total.pos{color:var(--primary,#15803d)} .estk-total.neg{color:var(--error,#d4322a)} .estk-total.zero{color:#93a0ad;font-weight:500;font-size:12px}
.estk-org{display:inline-flex;align-items:center;gap:5px;font:600 11px/1 sans-serif;color:var(--text-secondary,#5b6776)}
.estk-od{width:7px;height:7px;border-radius:2px;display:inline-block}
.od-nf{background:#2563eb} .od-ed{background:#0891b2} .od-aj{background:#9333ea} .od-dist{background:#c2410c} .od-na{background:#93a0ad}
.estk-st{display:inline-flex;align-items:center;font:700 10px/1 'JetBrains Mono',ui-monospace,monospace;padding:4px 7px;border-radius:5px;letter-spacing:.03em}
.st-ok{background:rgba(21,128,61,.12);color:var(--primary,#15803d)}
.st-sem_value,.st-sem_valor{background:rgba(194,65,12,.12);color:#c2410c;box-shadow:0 0 0 1px rgba(194,65,12,.3) inset}
.st-negativo{background:rgba(212,50,42,.1);color:var(--error,#d4322a)}
.st-legado{background:rgba(71,85,105,.1);color:#475569}
.st-zerado{background:rgba(71,85,105,.08);color:#93a0ad}
.estk-count{padding:8px 12px;font:600 11.5px/1 'JetBrains Mono',ui-monospace,monospace;color:var(--text-secondary,#5b6776);background:var(--bg-subtle,#f6f8fa);border-top:1px solid var(--border,#e0e4ea);display:flex;justify-content:space-between}
.estk-empty{padding:40px;text-align:center;color:#93a0ad;font-size:13px}
.estk-ov{position:fixed;inset:0;background:rgba(15,23,32,.34);opacity:0;pointer-events:none;transition:.2s;z-index:1400}
.estk-ov.show{opacity:1;pointer-events:auto}
.estk-dw{position:fixed;top:0;right:0;height:100%;width:412px;max-width:94vw;background:var(--card,#fff);border-left:1px solid var(--border,#e0e4ea);transform:translateX(100%);transition:transform .22s;z-index:1401;display:flex;flex-direction:column}
.estk-dw.show{transform:translateX(0)}
.estk-dwh{padding:16px 18px;border-bottom:1px solid var(--border,#e0e4ea);display:flex;justify-content:space-between;align-items:flex-start;gap:10px}
.estk-dwc{font:600 11px/1 'JetBrains Mono',ui-monospace,monospace;color:#93a0ad}
.estk-dwn{font-size:16px;font-weight:700;margin-top:5px}
.estk-x{width:30px;height:30px;border:1px solid var(--border,#e0e4ea);border-radius:6px;background:var(--card,#fff);cursor:pointer;flex-shrink:0;font-size:14px;color:var(--text-secondary,#5b6776)}
.estk-dwb{padding:16px 18px;overflow:auto;flex:1}
.estk-callout{border-radius:7px;padding:10px 11px;font-size:12px;line-height:1.45;margin-bottom:14px}
.estk-callout.warn{background:rgba(194,65,12,.1);border:1px solid rgba(194,65,12,.35);color:#9a3a0c}
.estk-callout.danger{background:rgba(212,50,42,.08);border:1px solid rgba(212,50,42,.3);color:#a82a23}
.estk-callout.info{background:rgba(71,85,105,.08);border:1px solid rgba(71,85,105,.2);color:#475569}
.estk-callout.ok{background:rgba(21,128,61,.08);border:1px solid rgba(21,128,61,.25);color:var(--primary,#15803d)}
.estk-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-bottom:4px}
.estk-cell{background:var(--bg-subtle,#f6f8fa);border:1px solid var(--border,#e0e4ea);border-radius:7px;padding:10px 11px}
.estk-cell.hero{grid-column:1/-1;background:rgba(21,128,61,.08);border-color:rgba(21,128,61,.25)}
.estk-cell .k{font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:var(--text-secondary,#5b6776);font-weight:600}
.estk-cell .v{font:700 16px/1.2 'JetBrains Mono',ui-monospace,monospace;margin-top:5px}
.estk-cell.hero .v{font-size:23px;color:var(--primary,#15803d)}
.estk-cell .v.sm{font-size:15px}
.estk-sec{font:700 11px/1 sans-serif;text-transform:uppercase;letter-spacing:.05em;color:var(--text-secondary,#5b6776);margin:18px 0 9px}
.estk-comp{border:1px solid var(--border,#e0e4ea);border-radius:7px;padding:11px 12px}
.estk-crow{display:grid;grid-template-columns:96px 1fr 70px;align-items:center;gap:9px;margin-bottom:8px;font-size:12px}
.estk-crow:last-child{margin-bottom:0}
.estk-cl{display:flex;align-items:center;gap:6px;color:var(--text-secondary,#5b6776);font-weight:600}
.estk-bar{height:8px;border-radius:4px;background:var(--bg-subtle,#eef1f5);overflow:hidden}
.estk-bar>span{display:block;height:100%;border-radius:4px}
.seg-nf{background:#2563eb} .seg-ed{background:#0891b2} .seg-aj{background:#9333ea} .seg-dist{background:#c2410c}
.estk-cv{font:600 11.5px/1 'JetBrains Mono',ui-monospace,monospace;text-align:right}
.estk-action{border:1px dashed rgba(194,65,12,.4);background:#fffdf8;border-radius:8px;padding:12px}
.estk-note{font:500 11px/1.4 sans-serif;color:#93a0ad}
.estk-dwf{padding:13px 18px;border-top:1px solid var(--border,#e0e4ea);display:grid;grid-template-columns:1fr 1fr;gap:8px}
.estk-btn{height:40px;border-radius:7px;border:1px solid var(--border,#e0e4ea);background:var(--card,#fff);font:600 13px/1 sans-serif;cursor:pointer;color:var(--text-primary,#16202b);display:flex;align-items:center;justify-content:center;gap:6px}
.estk-btn:hover:not([disabled]){background:var(--bg-subtle,#f6f8fa)}
.estk-f2{font:700 9px/1 'JetBrains Mono',ui-monospace,monospace;background:rgba(71,85,105,.12);color:#475569;padding:2px 5px;border-radius:4px;margin-left:5px}
.estk-hide{display:none}`;
    document.head.appendChild(s);
  }

  window.EstoqueTabela = { render, kpi, open, close, setView };
})();
