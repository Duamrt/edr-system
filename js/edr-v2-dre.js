// ══════════════════════════════════════════════════════════════════
// EDR System V2 — Módulo: DRE GERENCIAL
// Demonstrativo do Resultado por obra e consolidado.
// Calcula a partir das globais em memória (obras, lancamentos,
// repassesCef, adicionaisPgtos, obrasAdicionais) — SEM RPC/tabela nova.
// Tributos estimados (selo EST) — afinar com contador na Onda 2.
// Depende: infra.js (globais + sbGet), utils-extras.js (fmtR, esc)
// ══════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  // ── Parâmetros estimados (configurável na Onda 2) ──
  const DAS_ALIQUOTA = 0.06;           // 6% — Simples Anexo IV/V (ESTIMADO, fallback)
  const BENCH_BRUTA = [25, 40];        // benchmark construção MCMV
  const ETAPA_TERRENO = '35_terreno';
  const ETAPA_MAO = '28_mao';
  const ETAPA_IMPOSTO = '24_imposto';
  // Despesas operacionais (overhead) — não são custo de obra nem material.
  const ETAPAS_OPER = ['03_alimentacao', '07_combustivel', '14_expediente', '25_limpeza', '34_tecnologia'];
  const ETAPAS_DESPESA = [ETAPA_IMPOSTO].concat(ETAPAS_OPER);

  // ── Estado ──
  let _modo = 'obra';        // 'obra' | 'cons'
  let _periodo = '';         // '' = acumulado | 'YYYY-MM'
  let _obraSel = null;       // obra aberta no drill (modo obra)
  let _contasAdmin = [];     // contas_pagar sem obra_id (pagas)
  let _loaded = false;

  // ── Helpers ──
  const _n = v => Number(v || 0);
  const _pct = (v, base) => base ? (v / base * 100) : 0;
  const _fpct = (v, base) => base ? (v / base * 100).toFixed(1).replace('.', ',') + '%' : '—';
  function _money(v) { return (typeof fmtR === 'function') ? fmtR(v) : 'R$ ' + _n(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function _esc(s) { return (typeof esc === 'function') ? esc(s) : String(s == null ? '' : s); }
  function _inPer(data, per) { if (!per) return true; return String(data || '').startsWith(per); }
  function _classif(l) {
    const e = String(l.etapa || '').trim();
    if (e === ETAPA_TERRENO) return 'terreno';
    if (e === ETAPA_MAO) return 'mao';
    if (ETAPAS_DESPESA.indexOf(e) !== -1) return 'despesa';
    return 'material';
  }
  function _ehQA(nome) { return /^OBRA QA/i.test(String(nome || '')); }
  // Obras de teste (QA) e almoxarifado/escritório (estoque = ativo) NÃO entram no DRE.
  // O custo do material só conta quando é distribuído para uma obra real.
  function _ehEstrutural(nome) {
    const n = String(nome || '').toUpperCase();
    return /^OBRA QA/i.test(n) || n.includes('ESCRIT') || n.includes('ALMOX');
  }
  function _todasObras() {
    const a = (typeof obras !== 'undefined' && Array.isArray(obras)) ? obras : [];
    const b = (typeof obrasArquivadas !== 'undefined' && Array.isArray(obrasArquivadas)) ? obrasArquivadas : [];
    return a.concat(b).filter(o => o && o.id && !_ehEstrutural(o.nome));
  }

  // ── ENGINE: cálculo por obra ──
  function _calcObra(obraId, per) {
    let recMed = 0, recAdic = 0, recTerr = 0, cMao = 0, cMat = 0, cTerr = 0, cDesp = 0;
    const reps = (typeof repassesCef !== 'undefined' && Array.isArray(repassesCef)) ? repassesCef : [];
    reps.forEach(r => {
      if (r.obra_id !== obraId || !_inPer(r.data_credito, per)) return;
      const v = _n(r.valor);
      if (r.tipo === 'terreno') recTerr += v; else recMed += v; // pls + entrada = construção
    });
    const pgtos = (typeof adicionaisPgtos !== 'undefined' && Array.isArray(adicionaisPgtos)) ? adicionaisPgtos : [];
    const adics = (typeof obrasAdicionais !== 'undefined' && Array.isArray(obrasAdicionais)) ? obrasAdicionais : [];
    pgtos.forEach(p => {
      if (!_inPer(p.data, per)) return;
      const ad = adics.find(a => a.id === p.adicional_id);
      if (ad && ad.obra_id === obraId) recAdic += _n(p.valor);
    });
    const lancs = (typeof lancamentos !== 'undefined' && Array.isArray(lancamentos)) ? lancamentos : [];
    lancs.forEach(l => {
      if (l.obra_id !== obraId || !_inPer(l.data, per)) return;
      const v = _n(l.total), c = _classif(l);
      if (c === 'terreno') cTerr += v;
      else if (c === 'mao') cMao += v;
      else if (c === 'despesa') cDesp += v;   // imposto/overhead → operacional, fora do custo da obra
      else cMat += v;
    });
    const recConstr = recMed + recAdic;
    const custoConstr = cMao + cMat;          // só material + mão de obra (margem de contribuição)
    const margem = recConstr - custoConstr;
    return {
      recMed, recAdic, recTerr, recConstr,
      cMao, cMat, cTerr, cDesp, custoConstr,
      margem, margemPct: _pct(margem, recConstr),
      resTerreno: recTerr - cTerr
    };
  }

  // ── ENGINE: consolidado ──
  function _calcCons(per) {
    let recMed = 0, recAdic = 0, recTerr = 0, cMao = 0, cMat = 0, cTerr = 0, area = 0;
    _todasObras().forEach(o => {
      const d = _calcObra(o.id, per);
      recMed += d.recMed; recAdic += d.recAdic; recTerr += d.recTerr;
      cMao += d.cMao; cMat += d.cMat; cTerr += d.cTerr;
      if (d.recConstr > 0 || d.custoConstr > 0) area += _n(o.area_m2);
    });
    const recBruta = recMed + recAdic;

    // Impostos e despesas operacionais REAIS — varre TODAS as obras (inclui ESCRITÓRIO,
    // exclui só as de teste QA), porque o overhead da empresa fica lançado no escritório.
    const obrasAll = ((typeof obras !== 'undefined' && Array.isArray(obras)) ? obras : [])
      .concat((typeof obrasArquivadas !== 'undefined' && Array.isArray(obrasArquivadas)) ? obrasArquivadas : []);
    const qaIds = new Set(obrasAll.filter(o => o && _ehQA(o.nome)).map(o => o.id));
    const lancs = (typeof lancamentos !== 'undefined' && Array.isArray(lancamentos)) ? lancamentos : [];
    let impostoReal = 0, despOperReal = 0;
    lancs.forEach(l => {
      if (!_inPer(l.data, per) || qaIds.has(l.obra_id)) return;
      const e = String(l.etapa || '').trim();
      if (e === ETAPA_IMPOSTO) impostoReal += _n(l.total);
      else if (ETAPAS_OPER.indexOf(e) !== -1) despOperReal += _n(l.total);
    });

    const dasEstimado = recBruta * DAS_ALIQUOTA;
    // DRE gerencial conservador: usa o MAIOR entre real e estimativa.
    // Evita subcontar imposto quando só parte foi lançada (parcial derruba estimativa).
    // Para aceitar real menor, criar flag "imposto conferido" (pendente).
    const impostoEst = impostoReal < dasEstimado;        // true = estimativa foi usada ou complementada
    const imposto = Math.max(impostoReal, dasEstimado);
    const recLiq = recBruta - imposto;
    const custoObras = cMao + cMat;
    const lucroBruto = recLiq - custoObras;
    // Bug 3: fallback para data_vencimento quando data_pagamento está ausente
    const despAdmin = _contasAdmin.filter(c => _inPer(c.data_pagamento || c.data_vencimento, per)).reduce((s, c) => s + _n(c.valor), 0);
    const despOper = despOperReal + despAdmin;
    const resultado = lucroBruto - despOper;
    return {
      recBruta, recMed, recAdic, recTerr,
      imposto, impostoReal, impostoEst, dasEstimado, recLiq,
      custoObras, cMao, cMat, cTerr, lucroBruto,
      despOper, despOperReal, despAdmin, resultado, area,
      mBruta: _pct(lucroBruto, recLiq), mLiq: _pct(resultado, recLiq),
      custoM2: area ? custoObras / area : 0
    };
  }

  // ── Períodos disponíveis (YYYY-MM presentes nos dados) ──
  function _periodos() {
    const set = new Set();
    const add = (arr, campo) => (Array.isArray(arr) ? arr : []).forEach(x => { const d = String(x[campo] || '').slice(0, 7); if (d.length === 7) set.add(d); });
    add(typeof repassesCef !== 'undefined' ? repassesCef : [], 'data_credito');
    add(typeof lancamentos !== 'undefined' ? lancamentos : [], 'data');
    add(typeof adicionaisPgtos !== 'undefined' ? adicionaisPgtos : [], 'data');
    // Bug 2: inclui meses com só despesa administrativa paga (sem obra)
    (_contasAdmin || []).forEach(c => {
      const d = String(c.data_pagamento || c.data_vencimento || '').slice(0, 7);
      if (d.length === 7) set.add(d);
    });
    return [...set].sort().reverse();
  }
  const MESES = ['', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  function _labelPer(ym) { if (!ym) return 'Acumulado (todas)'; const [y, m] = ym.split('-'); return `${MESES[+m] || m}/${y}`; }

  // ── CSS (injetado uma vez) ──
  function _injectCSS() {
    if (document.getElementById('dre-styles')) return;
    const s = document.createElement('style');
    s.id = 'dre-styles';
    s.textContent = `
.dre-controls{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:16px}
.dre-tg{display:inline-flex;gap:2px;background:var(--card);border:1px solid var(--border);border-radius:9px;padding:3px}
.dre-tg button{background:transparent;border:none;padding:7px 14px;font-size:12px;font-weight:700;color:var(--text-tertiary);border-radius:7px;cursor:pointer;font-family:inherit}
.dre-tg button.on{background:var(--primary);color:#fff}
.dre-sel{padding:8px 12px;border:1px solid var(--border);border-radius:8px;background:var(--card);font-family:inherit;font-size:13px;font-weight:600;color:var(--text-primary);cursor:pointer}
.dre-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px}
@media(max-width:760px){.dre-kpis{grid-template-columns:repeat(2,1fr)}}
.dre-kpi{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:13px 15px;border-top:3px solid var(--primary)}
.dre-kpi.g{border-top-color:var(--success)} .dre-kpi.r{border-top-color:var(--error)} .dre-kpi.y{border-top-color:var(--warning,#d97706)}
.dre-kpi .lb{font-size:10px;color:var(--text-tertiary);font-weight:700;letter-spacing:.5px;text-transform:uppercase}
.dre-kpi .vl{font-size:21px;font-weight:800;font-family:'Space Grotesk',monospace;letter-spacing:-.5px;margin-top:5px}
.dre-kpi .vl.g{color:var(--success)} .dre-kpi .vl.r{color:var(--error)}
.dre-kpi .sub{font-size:10px;color:var(--text-tertiary);margin-top:3px}
.dre-grid{display:grid;grid-template-columns:1fr 310px;gap:14px;align-items:start}
@media(max-width:980px){.dre-grid{grid-template-columns:1fr}}
.dre-card{background:var(--card);border:1px solid var(--border);border-radius:12px;overflow:hidden}
.dre-ch{padding:13px 17px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center}
.dre-ch h3{margin:0;font-size:14px;font-weight:700}
.dre-ch .cl{font-size:10px;color:var(--text-tertiary);font-weight:700;text-transform:uppercase;letter-spacing:.5px}
.dre-obra{display:grid;grid-template-columns:1fr 96px 96px 86px;gap:9px;align-items:center;padding:11px 17px;border-bottom:1px solid var(--border);cursor:pointer}
.dre-obra:last-child{border-bottom:none} .dre-obra:hover{background:var(--bg)}
.dre-obra .nm{font-weight:700;font-size:13px} .dre-obra .nm small{display:block;font-size:10.5px;color:var(--text-tertiary);font-weight:500}
.dre-obra .vv{font-family:'Space Grotesk',monospace;font-weight:600;text-align:right;font-size:12.5px;color:var(--text-secondary)}
.dre-obra .mg{text-align:right;font-family:'Space Grotesk',monospace;font-weight:800;font-size:13px}
.dre-obra .mg.g{color:var(--success)} .dre-obra .mg.r{color:var(--error)} .dre-obra .mg.y{color:var(--warning,#d97706)}
.dre-obra .mg small{display:block;font-size:9.5px;font-weight:600;opacity:.85}
.dre-obra-head{cursor:default} .dre-obra-head:hover{background:var(--card)}
.dre-obra-head .hl,.dre-obra-head .hr{font-size:10px;font-weight:700;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px}
.dre-obra-head .hr{text-align:right}
.dre-cas{display:grid;grid-template-columns:1fr 130px 58px;gap:9px;align-items:center;padding:9px 17px;border-bottom:1px solid var(--border);font-size:13px}
.dre-cas:last-child{border-bottom:none}
.dre-cas.sub{padding-left:34px;background:var(--bg);font-size:12px}
.dre-cas.tot{background:var(--bg);font-weight:800;border-top:1.5px solid var(--border);border-bottom:1.5px solid var(--border)}
.dre-cas.grand{background:rgba(45,106,79,.08);font-weight:800;font-size:14.5px;border-top:2px solid var(--primary)}
.dre-cas .op{font-family:'Space Grotesk',monospace;width:12px;text-align:center;font-weight:700;color:var(--text-tertiary);display:inline-block;margin-right:6px}
.dre-cas.minus .op{color:var(--error)} .dre-cas.plus .op{color:var(--success)} .dre-cas.tot .op{color:var(--primary)}
.dre-cas .cv{font-family:'Space Grotesk',monospace;font-weight:600;text-align:right}
.dre-cas .cv.minus{color:var(--error)} .dre-cas.tot .cv{color:var(--primary)} .dre-cas.grand .cv{color:var(--primary);font-size:16px}
.dre-cas .cp{font-family:'Space Grotesk',monospace;font-size:11px;color:var(--text-tertiary);text-align:right}
.dre-est{font-size:8.5px;background:var(--warning,#d97706);color:#fff;padding:1px 5px;border-radius:5px;font-weight:700;letter-spacing:.3px;vertical-align:middle;margin-left:5px}
.dre-side{display:flex;flex-direction:column;gap:12px}
.dre-sc{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:14px 16px}
.dre-sc h4{margin:0 0 10px;font-size:12.5px;font-weight:700;display:flex;align-items:center;gap:7px}
.dre-sc h4 .material-symbols-outlined{font-size:16px;color:var(--primary)}
.dre-mr{display:flex;justify-content:space-between;align-items:baseline;padding:8px 0;border-bottom:1px dashed var(--border)}
.dre-mr:last-child{border-bottom:none}
.dre-mr .ml{font-size:12px;color:var(--text-secondary)} .dre-mr .mb{font-size:10px;color:var(--text-tertiary)}
.dre-mr .mv{font-family:'Space Grotesk',monospace;font-weight:800;font-size:15px}
.dre-mr .mv.g{color:var(--success)} .dre-mr .mv.y{color:var(--warning,#d97706)} .dre-mr .mv.r{color:var(--error)}
.dre-ins{padding:9px 11px;border-radius:8px;font-size:11.5px;line-height:1.5;display:flex;gap:7px;margin-bottom:7px}
.dre-ins:last-child{margin-bottom:0}
.dre-ins .material-symbols-outlined{font-size:15px;flex-shrink:0}
.dre-ins.ok{background:rgba(34,197,94,.1);color:var(--success)} .dre-ins.wn{background:rgba(217,119,6,.1);color:var(--warning,#d97706)}
.dre-ins b{font-weight:700} .dre-ins span{color:var(--text-primary)}
.dre-terr{background:var(--card);border:1px dashed var(--border);border-radius:12px;padding:13px 17px;margin-top:14px}
.dre-terr .tt{font-size:10px;color:var(--text-tertiary);font-weight:700;letter-spacing:.5px;text-transform:uppercase;margin-bottom:8px}
.dre-terr .tr{display:flex;justify-content:space-between;font-size:12.5px;padding:4px 0}
.dre-terr .tr b{font-family:'Space Grotesk',monospace}
`;
    document.head.appendChild(s);
  }

  // ── Carregar contas administrativas (sem obra) ──
  async function _loadContasAdmin() {
    try {
      const r = await sbGet('contas_pagar', '?status=eq.pago&obra_id=is.null&order=data_pagamento.desc');
      // DRE = competência: despesa operacional é só conta avulsa (salário, contador, aluguel...).
      // Conta com nota_ref = pagamento de NF; o custo desse material/serviço já entra no DRE
      // pelo lançamento (custo de obra). Contar aqui também = double-count. Excluir.
      _contasAdmin = Array.isArray(r) ? r.filter(c => !c.nota_ref) : [];
    } catch (e) { _contasAdmin = []; }
    _loaded = true;
  }

  // ── RENDER principal ──
  async function renderDRE() {
    _injectCSS();
    const el = document.getElementById('dre-content');
    if (!el) return;
    if (!_loaded) { el.innerHTML = `<div style="text-align:center;padding:50px;color:var(--text-tertiary);">Carregando DRE...</div>`; await _loadContasAdmin(); }

    const pers = _periodos();
    const opts = ['<option value="">Acumulado (todas)</option>']
      .concat(pers.map(p => `<option value="${p}"${p === _periodo ? ' selected' : ''}>${_labelPer(p)}</option>`)).join('');

    let html = `
    <div class="dre-controls">
      <div class="dre-tg">
        <button class="${_modo === 'obra' ? 'on' : ''}" onclick="DREModule.setModo('obra')">Por Obra</button>
        <button class="${_modo === 'cons' ? 'on' : ''}" onclick="DREModule.setModo('cons')">Consolidado</button>
      </div>
      <select class="dre-sel" onchange="DREModule.setPeriodo(this.value)">${opts}</select>
      <div style="flex:1"></div>
      <button class="btn btn-primary admin-only" style="padding:8px 14px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;border:1px solid var(--primary);background:var(--primary);color:#fff;font-family:inherit;display:inline-flex;align-items:center;gap:6px;" onclick="DREModule.exportar()">
        <span class="material-symbols-outlined" style="font-size:17px;">download</span> Exportar PDF
      </button>
    </div>`;

    const c = _calcCons(_periodo);
    html += `
    <div class="dre-kpis">
      <div class="dre-kpi"><div class="lb">Receita Bruta</div><div class="vl">${_money(c.recBruta)}</div><div class="sub">medições + adicionais</div></div>
      <div class="dre-kpi"><div class="lb">Custo das Obras</div><div class="vl">${_money(c.custoObras)}</div><div class="sub">mão de obra + material</div></div>
      <div class="dre-kpi ${c.resultado >= 0 ? 'g' : 'r'}"><div class="lb">Resultado</div><div class="vl ${c.resultado >= 0 ? 'g' : 'r'}">${_money(c.resultado)}</div><div class="sub">após impostos + despesas${c.impostoEst ? ' (est.)' : ''}</div></div>
      <div class="dre-kpi y"><div class="lb">Margem Bruta</div><div class="vl">${_fpct(c.lucroBruto, c.recLiq)}</div><div class="sub">benchmark ${BENCH_BRUTA[0]}–${BENCH_BRUTA[1]}%</div></div>
    </div>
    <div class="dre-grid">
      <div>${_modo === 'obra' ? _renderObras() : _renderCascata(c)}</div>
      <div class="dre-side">${_renderPainel(c)}</div>
    </div>`;

    el.innerHTML = html;
  }

  function _renderObras() {
    const linhas = _todasObras().map(o => ({ o, d: _calcObra(o.id, _periodo) }))
      .filter(x => x.d.recConstr > 0 || x.d.custoConstr > 0)
      .sort((a, b) => b.d.margemPct - a.d.margemPct);
    if (!linhas.length) return `<div class="dre-card"><div style="padding:40px;text-align:center;color:var(--text-tertiary);">Sem movimentação no período.</div></div>`;
    let h = `<div class="dre-card"><div class="dre-ch"><h3>Margem por obra</h3></div>`;
    h += `<div class="dre-obra dre-obra-head"><div class="hl">Obra</div><div class="hr">Recebido</div><div class="hr">Custo</div><div class="hr">Margem contrib.</div></div>`;
    h += linhas.map(({ o, d }) => {
      const cls = d.margem < 0 ? 'r' : d.margemPct >= 25 ? 'g' : 'y';
      const w = Math.max(2, Math.min(100, Math.abs(d.margemPct)));
      const st = o.arquivada ? 'concluída' : 'em obra';
      return `<div class="dre-obra">
        <div class="nm">${_esc(o.nome)} <small>${o.area_m2 ? Math.round(o.area_m2) + 'm² · ' : ''}${st}</small></div>
        <div class="vv">${_money(d.recConstr)}</div>
        <div class="vv">${_money(d.custoConstr)}</div>
        <div class="mg ${cls}">${d.margemPct.toFixed(0)}%<small>${d.margem >= 0 ? '+' : ''}${_money(d.margem)}</small></div>
      </div>`;
    }).join('');
    h += `</div>`;
    return h;
  }

  function _renderCascata(c) {
    const P = base => v => _fpct(v, base);
    const rl = P(c.recLiq);
    let h = `<div class="dre-card"><div class="dre-ch"><h3>DRE Consolidado</h3><div class="cl">% RL</div></div>`;
    h += `
    <div class="dre-cas plus"><div><span class="op">+</span>Receita Bruta de Obras</div><div class="cv">${_money(c.recBruta)}</div><div class="cp">—</div></div>
    <div class="dre-cas sub"><div><span class="op">·</span>Medições + entrada</div><div class="cv">${_money(c.recMed)}</div><div class="cp">${_fpct(c.recMed, c.recBruta)}</div></div>
    <div class="dre-cas sub"><div><span class="op">·</span>Adicionais</div><div class="cv">${_money(c.recAdic)}</div><div class="cp">${_fpct(c.recAdic, c.recBruta)}</div></div>
    <div class="dre-cas minus"><div><span class="op">−</span>Impostos e Encargos${c.impostoEst ? '<span class="dre-est">EST 6%</span>' : ''}</div><div class="cv minus">${_money(c.imposto)}</div><div class="cp">${rl(c.imposto)}</div></div>
    <div class="dre-cas tot"><div><span class="op">=</span>Receita Líquida</div><div class="cv">${_money(c.recLiq)}</div><div class="cp">100%</div></div>
    <div class="dre-cas minus"><div><span class="op">−</span>Custo das Obras</div><div class="cv minus">${_money(c.custoObras)}</div><div class="cp">${rl(c.custoObras)}</div></div>
    <div class="dre-cas sub"><div><span class="op">·</span>Mão de obra</div><div class="cv">${_money(c.cMao)}</div><div class="cp">${rl(c.cMao)}</div></div>
    <div class="dre-cas sub"><div><span class="op">·</span>Material e serviços</div><div class="cv">${_money(c.cMat)}</div><div class="cp">${rl(c.cMat)}</div></div>
    <div class="dre-cas tot"><div><span class="op">=</span>Lucro Bruto</div><div class="cv">${_money(c.lucroBruto)}</div><div class="cp">${rl(c.lucroBruto)}</div></div>
    <div class="dre-cas minus"><div><span class="op">−</span>Despesas Operacionais</div><div class="cv minus">${_money(c.despOper)}</div><div class="cp">${rl(c.despOper)}</div></div>
    <div class="dre-cas grand"><div><span class="op">=</span>RESULTADO LÍQUIDO</div><div class="cv">${_money(c.resultado)}</div><div class="cp">${rl(c.resultado)}</div></div>`;
    h += `</div>`;
    if (c.recTerr || c.cTerr) {
      h += `<div class="dre-terr"><div class="tt">Terreno · operação à parte (ganho de capital PF)</div>
        <div class="tr"><span>Recebido pelo terreno</span><b>${_money(c.recTerr)}</b></div>
        <div class="tr"><span>Custo do terreno</span><b>${_money(c.cTerr)}</b></div>
        <div class="tr" style="border-top:1px solid var(--border);margin-top:4px;padding-top:7px;"><span><b>Resultado do terreno</b></span><b style="color:var(--primary)">${_money(c.recTerr - c.cTerr)}</b></div>
      </div>`;
    }
    return h;
  }

  function _renderPainel(c) {
    const mbCls = c.mBruta >= BENCH_BRUTA[0] ? 'g' : c.mBruta >= 15 ? 'y' : 'r';
    let h = `<div class="dre-sc"><h4><span class="material-symbols-outlined">percent</span>Margens</h4>
      <div class="dre-mr"><div><div class="ml">Margem Bruta</div><div class="mb">benchmark ${BENCH_BRUTA[0]}–${BENCH_BRUTA[1]}%</div></div><div class="mv ${mbCls}">${_fpct(c.lucroBruto, c.recLiq)}</div></div>
      <div class="dre-mr"><div><div class="ml">Margem Líquida</div><div class="mb">após impostos + despesas${c.impostoEst ? ' (est.)' : ''}</div></div><div class="mv ${c.resultado >= 0 ? 'g' : 'r'}">${_fpct(c.resultado, c.recLiq)}</div></div>
      <div class="dre-mr"><div><div class="ml">Custo médio / m²</div><div class="mb">MCMV típico 1.400–2.200</div></div><div class="mv y">${c.custoM2 ? _money(c.custoM2) : '—'}</div></div>
    </div>`;

    // Insights
    const vermelhas = _todasObras().map(o => ({ o, d: _calcObra(o.id, _periodo) })).filter(x => (x.d.recConstr > 0 || x.d.custoConstr > 0) && x.d.margem < 0);
    const positivas = _todasObras().map(o => _calcObra(o.id, _periodo)).filter(d => (d.recConstr > 0 || d.custoConstr > 0) && d.margemPct >= 25).length;
    h += `<div class="dre-sc"><h4><span class="material-symbols-outlined">lightbulb</span>Observações</h4>`;
    if (vermelhas.length) {
      h += `<div class="dre-ins wn"><span class="material-symbols-outlined">warning</span><span><b>${vermelhas.length} obra(s) no vermelho:</b> ${vermelhas.map(x => _esc(x.o.nome)).join(', ')}. Custo passou o recebido.</span></div>`;
    }
    if (positivas) h += `<div class="dre-ins ok"><span class="material-symbols-outlined">check_circle</span><span><b>${positivas} obra(s) acima de 25%</b> de margem.</span></div>`;
    const mbOk = c.mBruta >= BENCH_BRUTA[0];
    h += `<div class="dre-ins ${mbOk ? 'ok' : 'wn'}"><span class="material-symbols-outlined">${mbOk ? 'check_circle' : 'trending_down'}</span><span><b>Margem bruta ${_fpct(c.lucroBruto, c.recLiq)}</b> ${mbOk ? '— dentro do saudável' : '— abaixo do benchmark'} (${BENCH_BRUTA[0]}–${BENCH_BRUTA[1]}%).</span></div>`;
    if (c.impostoEst) {
      h += `<div class="dre-ins wn"><span class="material-symbols-outlined">info</span><span><b>Impostos estimados (6% da receita).</b> Lance o DAS/encargos reais para o DRE refletir o pago.</span></div>`;
    } else {
      const baixo = c.imposto < c.dasEstimado * 0.7;   // real bem abaixo da estimativa → pode faltar lançar
      h += `<div class="dre-ins ${baixo ? 'wn' : 'ok'}"><span class="material-symbols-outlined">${baixo ? 'warning' : 'receipt_long'}</span><span><b>Impostos reais lançados: ${_money(c.imposto)}.</b> ${baixo ? `Estimativa 6% seria ${_money(c.dasEstimado)} — confira se faltam impostos a lançar no período.` : `Próximo da estimativa (${_money(c.dasEstimado)}).`}</span></div>`;
    }
    h += `</div>`;
    return h;
  }

  // ── EXPORT PDF (HTML standalone + print) ──
  function exportar() {
    const c = _calcCons(_periodo);
    const obrasLinhas = _todasObras().map(o => ({ o, d: _calcObra(o.id, _periodo) }))
      .filter(x => x.d.recConstr > 0 || x.d.custoConstr > 0)
      .sort((a, b) => b.d.margemPct - a.d.margemPct);
    const empresa = (typeof _companyPlan !== 'undefined' && _companyPlan?.name) ? _companyPlan.name : 'EDR Engenharia';
    const perLabel = _labelPer(_periodo);
    const hoje = new Date().toLocaleDateString('pt-BR');
    const rl = v => _fpct(v, c.recLiq);
    const mbOk = c.mBruta >= BENCH_BRUTA[0];

    const linhasObra = obrasLinhas.map((x, i) => {
      const neg = x.d.margem < 0;
      return `<div class="ob"><span class="n">${String(i + 1).padStart(2, '0')}</span><span class="nm">${_esc(x.o.nome)}${x.o.area_m2 ? ' · ' + Math.round(x.o.area_m2) + 'm²' : ''}</span><span class="vv">${neg ? '<span class="neg">' : '+'}${_money(x.d.margem)}${neg ? '</span>' : ''}</span><span class="mm${neg ? ' neg' : ''}">${x.d.margemPct.toFixed(0)}%</span></div>`;
    }).join('');

    const vermelhas = obrasLinhas.filter(x => x.d.margem < 0);
    const insTerr = (c.recTerr || c.cTerr) ? `<div class="ln">▸ Terreno (modelo aquisição+construção) tratado à parte: resultado ${_money(c.recTerr - c.cTerr)} — ganho de capital PF.</div>` : '';

    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>DRE — ${_esc(empresa)} — ${perLabel}</title>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'JetBrains Mono',monospace;color:#16241d;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.hd{background:#16241d;color:#e8efe9;padding:20px 28px;display:flex;justify-content:space-between;align-items:flex-start}
.hd-l{display:flex;gap:13px;align-items:center}
.hd-logo{width:44px;height:44px;border-radius:10px;background:linear-gradient(135deg,#2d6a4f,#40916c);display:grid;place-items:center;font-weight:800;font-size:13px;color:#fff}
.hd-meta{font-size:8px;letter-spacing:.15em;color:#7f9b8c;text-transform:uppercase;margin-bottom:3px}
.hd h1{font-size:20px;font-weight:800;letter-spacing:.02em}
.hd-sub{font-size:8.5px;color:#9db5a8;margin-top:2px}
.hd-r{text-align:right} .hd-r .emp{font-size:13px;font-weight:700;color:#fff} .hd-r .per{font-size:10px;color:#9db5a8;margin-top:2px}
.hd-r .badge{display:inline-block;margin-top:6px;font-size:8px;font-weight:700;letter-spacing:.08em;border:1px solid #40916c;color:#74c69d;padding:3px 8px;border-radius:5px}
.strip{background:#1f3329;color:#9db5a8;font-size:8px;letter-spacing:.03em;padding:7px 28px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px;border-bottom:2px solid #2d6a4f}
.strip b{color:#74c69d} .strip .ll{color:#fff}
table{width:100%;border-collapse:collapse}
th{background:#16241d;color:#7f9b8c;font-size:8px;letter-spacing:.1em;text-transform:uppercase;text-align:left;padding:7px 28px;font-weight:700}
th.r{text-align:right}
td{padding:6px 28px;font-size:10.5px;border-bottom:1px solid #eef2f0}
td.r{text-align:right;font-weight:600}
tr.sub td{font-size:9.5px;color:#5a6b63;background:#fafbfa} tr.sub td:first-child{padding-left:44px}
tr.tot td{background:#f0f4f2;font-weight:800;border-top:1.5px solid #c8d3cd;border-bottom:1.5px solid #c8d3cd}
tr.grand td{background:#16241d;color:#fff;font-weight:800;font-size:12px;padding:10px 28px} tr.grand td .gl{color:#74c69d}
td .neg{color:#c0392b} .pct{color:#8a9890;font-size:9px;text-align:right}
.est{font-size:7px;background:#d97706;color:#fff;padding:1px 4px;border-radius:4px;font-weight:700;margin-left:4px;vertical-align:middle}
.mg-row{display:flex;border-bottom:1px solid #eef2f0}
.mg-c{flex:1;padding:12px 16px;border-right:1px solid #eef2f0} .mg-c:last-child{border-right:none}
.mg-c .t{font-size:7.5px;letter-spacing:.1em;color:#8a9890;text-transform:uppercase;font-weight:700}
.mg-c .v{font-size:20px;font-weight:800;color:#2d6a4f;margin:3px 0} .mg-c .b{font-size:7.5px;color:#8a9890}
.sec-t{background:#16241d;color:#7f9b8c;font-size:8px;letter-spacing:.1em;text-transform:uppercase;padding:7px 28px;font-weight:700;display:flex;justify-content:space-between}
.ob{display:flex;align-items:center;padding:5px 28px;font-size:10px;border-bottom:1px solid #eef2f0;gap:10px}
.ob .n{width:20px;color:#b0bdb6;font-weight:700} .ob .nm{flex:1;font-weight:600}
.ob .vv{width:96px;text-align:right;font-weight:700} .ob .mm{width:46px;text-align:right;font-weight:800;color:#2d6a4f}
.ob .mm.neg,.ob .vv .neg{color:#c0392b}
.ins{margin:14px 28px 0;border:2px solid #16241d;background:#f6f9f7;padding:10px 14px}
.ins .it{font-size:8px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;padding-bottom:6px;border-bottom:1px solid #c8d3cd;margin-bottom:6px}
.ins .ln{font-size:9px;line-height:1.7;color:#2a3a32}
.ft{background:#16241d;color:#9db5a8;padding:13px 28px;display:flex;justify-content:space-between;align-items:center;margin-top:14px}
.ft .fl{font-size:8px;letter-spacing:.05em} .ft .fl b{color:#74c69d} .ft img{width:54px;height:54px;border-radius:6px;background:#fff;padding:3px}
.disc{font-size:7.5px;color:#8a9890;padding:9px 28px;line-height:1.6}
@media print{@page{size:A4 portrait;margin:9mm}}
</style></head><body onload="window.print()">
<div class="hd"><div class="hd-l"><div class="hd-logo">EDR</div><div><div class="hd-meta">EDR ENGENHARIA · SISTEMA DE GESTÃO</div><h1>DRE GERENCIAL</h1><div class="hd-sub">Demonstrativo do Resultado do Exercício</div></div></div>
<div class="hd-r"><div class="emp">${_esc(empresa)}</div><div class="per">${perLabel}</div><div class="badge">GERENCIAL</div></div></div>
<div class="strip"><span>GERADO EM <b>${hoje}</b> · FONTE <b>EDR SYSTEM</b> · ENGINE v1.0</span><span>REC. BRUTA <b>${_money(c.recBruta)}</b> · RESULTADO <span class="ll">${_money(c.resultado)}</span></span></div>
<table><thead><tr><th>Linha do DRE</th><th class="r">Valor (R$)</th><th class="r">% RL</th></tr></thead><tbody>
<tr><td><b>Receita Bruta de Obras</b></td><td class="r">${_money(c.recBruta)}</td><td class="pct">—</td></tr>
<tr class="sub"><td>Medições + entrada</td><td class="r">${_money(c.recMed)}</td><td class="pct">${_fpct(c.recMed, c.recBruta)}</td></tr>
<tr class="sub"><td>Adicionais</td><td class="r">${_money(c.recAdic)}</td><td class="pct">${_fpct(c.recAdic, c.recBruta)}</td></tr>
<tr><td>(−) Impostos e Encargos${c.impostoEst ? '<span class="est">EST 6%</span>' : ''}</td><td class="r"><span class="neg">${_money(c.imposto)}</span></td><td class="pct">${rl(c.imposto)}</td></tr>
<tr class="tot"><td>= Receita Líquida</td><td class="r">${_money(c.recLiq)}</td><td class="pct">100,0%</td></tr>
<tr><td>(−) Custo das Obras</td><td class="r"><span class="neg">${_money(c.custoObras)}</span></td><td class="pct">${rl(c.custoObras)}</td></tr>
<tr class="sub"><td>Mão de obra</td><td class="r">${_money(c.cMao)}</td><td class="pct">${rl(c.cMao)}</td></tr>
<tr class="sub"><td>Material e serviços</td><td class="r">${_money(c.cMat)}</td><td class="pct">${rl(c.cMat)}</td></tr>
<tr class="tot"><td>= Lucro Bruto</td><td class="r">${_money(c.lucroBruto)}</td><td class="pct">${rl(c.lucroBruto)}</td></tr>
<tr><td>(−) Despesas Operacionais</td><td class="r"><span class="neg">${_money(c.despOper)}</span></td><td class="pct">${rl(c.despOper)}</td></tr>
<tr class="grand"><td><span class="gl">= RESULTADO LÍQUIDO DO PERÍODO</span></td><td class="r"><span class="gl">${_money(c.resultado)}</span></td><td class="pct" style="color:#74c69d">${rl(c.resultado)}</td></tr>
</tbody></table>
<div class="mg-row">
<div class="mg-c"><div class="t">Margem Bruta</div><div class="v">${_fpct(c.lucroBruto, c.recLiq)}</div><div class="b">Benchmark ${BENCH_BRUTA[0]}–${BENCH_BRUTA[1]}%</div></div>
<div class="mg-c"><div class="t">Margem Líquida</div><div class="v">${_fpct(c.resultado, c.recLiq)}</div><div class="b">após tributos est.</div></div>
<div class="mg-c"><div class="t">Custo médio / m²</div><div class="v" style="font-size:16px">${c.custoM2 ? _money(c.custoM2) : '—'}</div><div class="b">MCMV 1.400–2.200</div></div>
</div>
<div class="sec-t"><span>Top Obras — Margem por Contrato</span><span>Margem</span></div>
${linhasObra}
<div class="ins"><div class="it">// Auto Insights — Análise Automática EDR System</div>
<div class="ln">${mbOk ? '✓' : '⚠'} Margem bruta ${_fpct(c.lucroBruto, c.recLiq)} ${mbOk ? '— dentro do saudável para construção MCMV' : '— abaixo do benchmark'} (${BENCH_BRUTA[0]}–${BENCH_BRUTA[1]}%).</div>
<div class="ln">${c.resultado >= 0 ? '✓' : '⚠'} Resultado do período: ${_money(c.resultado)} (estimado, antes de afinar tributos).</div>
${vermelhas.length ? `<div class="ln">⚠ ${vermelhas.length} obra(s) com margem negativa: ${vermelhas.map(x => _esc(x.o.nome)).join(', ')} — custo já supera o recebido.</div>` : ''}
${insTerr}
${c.impostoEst ? '<div class="ln">⚠ Impostos estimados em 6% da receita — lance o DAS/encargos reais para refletir o pago.</div>' : `<div class="ln">▸ Impostos e encargos reais lançados: ${_money(c.imposto)} · despesas operacionais ${_money(c.despOper)} (estimativa 6% seria ${_money(c.dasEstimado)}).</div>`}</div>
<div class="ft"><div class="fl">⚙ PROCESSADO VIA EDR SYSTEM · ENGINE v1.0<br>${_esc(empresa)} · <b>sistema.edreng.com.br</b></div>
<img src="https://api.qrserver.com/v1/create-qr-code/?size=108x108&data=https://sistema.edreng.com.br&bgcolor=ffffff&color=16241d&margin=2" alt="QR"></div>
<div class="disc">Documento gerencial — EDR é Simples Nacional. Impostos e Encargos = lançamentos reais de imposto (DAS/DARF/INSS/etc.) quando informados; senão estimativa de 6% sobre a receita. Despesas Operacionais = overhead lançado no escritório (combustível, expediente, limpeza, tecnologia, alimentação) + contas a pagar sem obra. Terreno (modelo aquisição+construção) tratado em apartado (ganho de capital PF). Não substitui a contabilidade fiscal.</div>
</body></html>`;

    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) { if (typeof showToast === 'function') showToast('Permita pop-ups para exportar.'); return; }
    win.document.write(html);
    win.document.close();
  }

  // ── API pública ──
  function setModo(m) { _modo = m; renderDRE(); }
  function setPeriodo(p) { _periodo = p; renderDRE(); }

  window.DREModule = { render: renderDRE, setModo, setPeriodo, exportar };

  if (typeof viewRegistry !== 'undefined') {
    viewRegistry.register('dre', renderDRE);
  }
})();
