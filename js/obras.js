// ── CATS: fonte única de categorias ──────────────────────────────
// Derivado do CATS_ESTOQUE (definido abaixo). Inicializado após CATS_ESTOQUE.
// fn recebe o objeto lançamento (r) e testa r.descricao normalizado.
let CATS = {}; // preenchido em initCATS()
function initCATS() {
  CATS = {};
  // Mão de obra — separado pois não está no CATS_ESTOQUE
  CATS['mao'] = { lb: '👷 Mão de Obra', fn: r => /m[aã]o[\s\-]de[\s\-]obra|armador|eletricista|pintor|pedreiro|servente|mestre de obras|encanador|azulejista/i.test(r.descricao) };
  CATS['doc'] = { lb: '📋 Documentação', fn: r => /contrato|documento|art |anotac|registro de contrato|orcamento|alvara|licenca|projeto|vistoria|escritura/i.test(r.descricao) };
  CATS['terreno'] = { lb: '🏡 Terreno', fn: r => /terreno|aquisicao de terreno|compra de terreno|area|lote/i.test(r.descricao) };
  // Demais categorias espelham CATS_ESTOQUE com chave normalizada
  const keyMap = { 'aco':'ferro' }; // aco→ferro para manter compatibilidade com dados existentes
  CATS_ESTOQUE.forEach(cat => {
    const key = keyMap[cat.key] || cat.key;
    if (key === 'prelim' || key === 'fundacao' || key === 'estrutura' || key === 'rev_arg' || key === 'expediente') return;
    CATS[key] = { lb: cat.lb, fn: r => cat.fn((r.descricao||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')) };
  });
}

function renderObrasView() {
  document.getElementById('obras-loading')?.classList.add('hidden');
  // Chips de categoria
  const chipsEl = document.getElementById('obras-chips');
  if (chipsEl) {
    chipsEl.innerHTML = Object.entries(CATS).map(([k,v]) =>
      `<div class="cat-chip ${catFiltroAtual===k?'ativo':''}" onclick="toggleCat('${k}')">${v.lb}</div>`
    ).join('') + `<div class="cat-chip ${catFiltroAtual===null?'':'ativo'}" onclick="toggleCat(null)">✕ Limpar</div>`;
  }
  // Mostrar visão de cards por padrão, esconder detalhe
  document.getElementById('obras-cards-overview').style.display = '';
  document.getElementById('obras-sticky').style.display = 'none';
  document.getElementById('obras-tab-content-lanc').style.display = 'none';
  document.getElementById('obras-tab-content-mat').style.display = 'none';
  renderObrasCards();
  aplicarPerfil();
}

let mostandoArquivadas = false;

function onChangeObraFiltro() {
  const sel = document.getElementById('obras-filtro-obra');
  const btn = document.getElementById('btn-arquivar-obra');
  if (btn) {
    if (sel.value && usuarioAtual?.perfil === 'admin') {
      btn.style.display = 'block';
      btn.textContent = mostandoArquivadas ? '🏗 REATIVAR' : '✅ CONCLUÍDA';
      btn.style.color = mostandoArquivadas ? '#4ade80' : '#fbbf24';
      btn.style.borderColor = mostandoArquivadas ? 'rgba(46,204,113,0.3)' : 'rgba(245,158,11,0.2)';
      btn.style.background = mostandoArquivadas ? 'rgba(46,204,113,0.08)' : 'rgba(245,158,11,0.08)';
    } else {
      btn.style.display = 'none';
    }
  }
  if (obraTabAtual === 'mat') renderObrasMateriais();
  else if (obraTabAtual === 'add' && typeof renderAdicionais === 'function') renderAdicionais();
  else filtrarLanc();
}

function onClickArquivarObra() {
  if (usuarioAtual?.perfil !== 'admin') return;
  const obraId = document.getElementById('obras-filtro-obra').value;
  if (!obraId) return;
  arquivarObra(obraId, !mostandoArquivadas);
  document.getElementById('obras-filtro-obra').value = '';
  document.getElementById('btn-arquivar-obra').style.display = 'none';
}

function toggleObrasArquivadas() {
  if (usuarioAtual?.perfil !== 'admin') return;
  mostandoArquivadas = !mostandoArquivadas;
  const btn = document.getElementById('btn-ver-arquivadas');
  if (mostandoArquivadas) {
    btn.style.background = 'rgba(245,158,11,0.18)';
    btn.textContent = '🏗 VER ATIVAS';
  } else {
    btn.style.background = 'rgba(245,158,11,0.08)';
    btn.textContent = '📋 VER CONCLUÍDAS';
  }
  // Sincronizar botão da visão de cards
  const btn2 = document.getElementById('btn-ver-arquivadas2');
  if (btn2) {
    if (mostandoArquivadas) {
      btn2.style.background = 'rgba(245,158,11,0.18)';
      btn2.textContent = '🏗 VER ATIVAS';
    } else {
      btn2.style.background = 'rgba(245,158,11,0.08)';
      btn2.textContent = '📋 VER CONCLUÍDAS';
    }
  }
  // Resetar select e recarregar opções
  document.getElementById('obras-filtro-obra').value = '';
  document.getElementById('btn-arquivar-obra').style.display = 'none';
  populateSelects();
  renderObrasCards();
  filtrarLanc();
}

// Renderiza os cards de visão geral das obras
function renderObrasCards() {
  const el = document.getElementById('obras-cards-grid');
  if (!el) return;
  const pool = mostandoArquivadas ? obrasArquivadas : obras;

  if (!pool.length) {
    el.innerHTML = '<div class="empty" style="grid-column:1/-1;">Nenhuma obra ' + (mostandoArquivadas ? 'concluída' : 'ativa') + '.</div>';
    return;
  }

  el.innerHTML = pool.map(o => {
    const ls = lancamentos.filter(l => l.obra_id === o.id);
    const total = ls.reduce((s, l) => s + Number(l.total || 0), 0);
    const ultimaData = ls.length ? ls.sort((a, b) => (b.data || '').localeCompare(a.data || ''))[0]?.data : null;
    const ultimaStr = ultimaData ? new Date(ultimaData + 'T12:00:00').toLocaleDateString('pt-BR') : 'Sem lançamentos';
    const adds = typeof getAdicionaisObra === 'function' ? getAdicionaisObra(o.id) : { qtd:0, valorTotal:0, totalRecebido:0, saldo:0 };

    // Top 3 etapas por valor
    const porEtapa = {};
    ls.forEach(l => {
      const k = l.etapa || '00_outros';
      porEtapa[k] = (porEtapa[k] || 0) + Number(l.total || 0);
    });
    const topEtapas = Object.entries(porEtapa)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    // Valor só visível para admin
    const valorHtml = usuarioAtual?.perfil === 'admin'
      ? `<div style="font-size:16px;font-weight:800;color:var(--verde-hl);font-family:'JetBrains Mono',monospace;">${fmtR(total)}</div>`
      : '';
    const addHtml = usuarioAtual?.perfil === 'admin' && adds.qtd > 0
      ? `<div style="font-size:10px;color:#a78bfa;margin-top:2px;">📝 ${adds.qtd} adicional(is): ${fmtR(adds.valorTotal)}</div>`
      : '';

    return `<div class="card" style="padding:16px;cursor:pointer;transition:all .2s;border:1px solid var(--borda);"
                 onclick="obrasAbrirDetalhe('${o.id}')"
                 onmouseover="this.style.borderColor='rgba(46,204,113,0.4)'"
                 onmouseout="this.style.borderColor='var(--borda)'">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">
        <div>
          <div style="font-size:15px;font-weight:700;color:var(--branco);font-family:'Rajdhani',sans-serif;letter-spacing:0.5px;">${o.nome}</div>
          <div style="font-size:11px;color:var(--texto3);margin-top:2px;">📍 ${o.cidade || 'Sem cidade'}</div>
        </div>
        <div style="text-align:right;">
          ${valorHtml}
          ${addHtml}
          <div style="font-size:10px;color:var(--texto3);margin-top:2px;">${ls.length} lançamento${ls.length !== 1 ? 's' : ''}</div>
        </div>
      </div>
      ${topEtapas.length > 0 ? `<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px;">
        ${topEtapas.map(([k, v]) => {
          const pct = total > 0 ? (v / total * 100).toFixed(0) : 0;
          const lbl = ETAPAS.find(e => e.key === k)?.lb || '📦 Outros';
          return `<span style="font-size:9px;background:rgba(46,204,113,0.08);color:var(--verde3);border:1px solid rgba(46,204,113,0.15);border-radius:4px;padding:2px 6px;">${lbl.split(' ').slice(0, 2).join(' ')} ${pct}%</span>`;
        }).join('')}
      </div>` : ''}
      <div style="display:flex;justify-content:space-between;align-items:center;padding-top:8px;border-top:1px solid rgba(46,204,113,0.06);">
        <span style="font-size:10px;color:var(--texto3);">📅 Último: ${ultimaStr}</span>
        <div style="display:flex;align-items:center;gap:8px;">
          ${usuarioAtual?.perfil === 'admin' ? `<button onclick="event.stopPropagation();abrirModalObra('${o.id}')" style="background:rgba(59,130,246,0.08);border:1px solid rgba(59,130,246,0.2);color:#60a5fa;border-radius:6px;padding:3px 10px;font-size:10px;font-family:'Rajdhani',sans-serif;font-weight:700;cursor:pointer;">✏ EDITAR</button>` : ''}
          ${usuarioAtual?.perfil === 'admin' ? (mostandoArquivadas
            ? `<button onclick="event.stopPropagation();arquivarObraCard('${o.id}',false)" style="background:rgba(46,204,113,0.08);border:1px solid rgba(46,204,113,0.2);color:#4ade80;border-radius:6px;padding:3px 10px;font-size:10px;font-family:'Rajdhani',sans-serif;font-weight:700;cursor:pointer;">🏗 REATIVAR</button>`
            : `<button onclick="event.stopPropagation();arquivarObraCard('${o.id}',true)" style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.2);color:#fbbf24;border-radius:6px;padding:3px 10px;font-size:10px;font-family:'Rajdhani',sans-serif;font-weight:700;cursor:pointer;">✅ CONCLUIR</button>`
          ) : ''}
          <span style="font-size:10px;color:var(--verde-hl);font-weight:600;">DETALHES →</span>
        </div>
      </div>
    </div>`;
  }).join('');
}

// Abre a visão detalhada de uma obra específica
function obrasAbrirDetalhe(obraId) {
  document.getElementById('obras-cards-overview').style.display = 'none';
  document.getElementById('obras-sticky').style.display = '';
  document.getElementById('obras-tab-content-lanc').style.display = '';
  // Selecionar a obra no filtro
  const sel = document.getElementById('obras-filtro-obra');
  if (sel) sel.value = obraId;
  onChangeObraFiltro();
  if (obraTabAtual === 'mat') renderObrasMateriais();
  else filtrarLanc();
}

// Volta para a visão de cards (overview)
function obrasVoltarCards() {
  document.getElementById('obras-cards-overview').style.display = '';
  document.getElementById('obras-sticky').style.display = 'none';
  document.getElementById('obras-tab-content-lanc').style.display = 'none';
  document.getElementById('obras-tab-content-mat').style.display = 'none';
  const addTab = document.getElementById('obras-tab-content-add');
  if (addTab) addTab.style.display = 'none';
  document.getElementById('obras-detalhe').classList.add('hidden');
  const sel = document.getElementById('obras-filtro-obra');
  if (sel) sel.value = '';
  renderObrasCards();
}

async function arquivarObra(obraId, arquivar) {
  if (usuarioAtual?.perfil !== 'admin') return;
  const acao = arquivar ? 'marcar como concluída' : 'reabrir';
  if (!confirm(`Deseja ${acao} esta obra?`)) return;
  try {
    await sbPatch('obras', `?id=eq.${obraId}`, { arquivada: arquivar });
    // Atualizar localmente
    await loadObras();
    populateSelects();
    filtrarLanc();
    renderDashboard();
    showToast(arquivar ? '✅ OBRA CONCLUÍDA!' : '🔄 OBRA REABERTA!');
  } catch(e) { showToast('ERRO AO ATUALIZAR OBRA.'); }
}

async function arquivarObraCard(obraId, arquivar) {
  if (usuarioAtual?.perfil !== 'admin') return;
  const obra = [...obras, ...obrasArquivadas].find(o => o.id === obraId);
  const nome = obra?.nome || 'esta obra';
  const acao = arquivar ? `Concluir "${nome}" e arquivar?` : `Reativar "${nome}"?`;
  if (!confirm(acao)) return;
  try {
    await sbPatch('obras', `?id=eq.${obraId}`, { arquivada: arquivar });
    await loadObras();
    populateSelects();
    renderObrasCards();
    renderDashboard();
    showToast(arquivar ? `✅ "${nome}" concluída e arquivada!` : `🔄 "${nome}" reativada!`);
  } catch(e) { showToast('ERRO AO ATUALIZAR OBRA.'); }
}

let obraTabAtual = 'lanc';
function obrasSwitchTab(tab) {
  obraTabAtual = tab;
  const tabs = ['lanc','mat','add'];
  tabs.forEach(t => {
    const btn = document.getElementById('obras-tab-' + t);
    const cont = document.getElementById('obras-tab-content-' + t);
    if (btn) { btn.style.borderBottomColor = t === tab ? 'var(--verde-hl)' : 'transparent'; btn.style.color = t === tab ? 'var(--verde-hl)' : 'var(--texto3)'; }
    if (cont) cont.style.display = t === tab ? 'block' : 'none';
  });
  if (tab === 'mat') renderObrasMateriais();
  if (tab === 'add' && typeof renderAdicionais === 'function') renderAdicionais();
}

function renderObrasMateriais() {
  const obraId = document.getElementById('obras-filtro-obra').value;
  const el = document.getElementById('obras-mat-lista');
  if (!el) return;

  // Filtrar distribuições da obra selecionada
  const dists = distribuicoes.filter(d => !obraId || d.obra_id === obraId);

  if (!dists.length) {
    el.innerHTML = `<div class="empty">Nenhuma movimentação de material encontrada${obraId ? ' nesta obra' : ''}.</div>`;
    return;
  }

  // Agrupar por material
  const porMat = {};
  dists.forEach(d => {
    const key = (d.item_desc||'').toUpperCase();
    if (!porMat[key]) porMat[key] = { desc: d.item_desc, registros: [] };
    porMat[key].registros.push(d);
  });

  const isAdmin = usuarioAtual?.perfil === 'admin';

  el.innerHTML = Object.values(porMat)
    .sort((a,b) => a.desc.localeCompare(b.desc))
    .map(m => {
      const totalQtd = m.registros.reduce((s,d) => s + Number(d.qtd), 0);
      const totalVal = m.registros.reduce((s,d) => s + Number(d.valor||0), 0);
      const rows = m.registros
        .sort((a,b) => (b.data||'').localeCompare(a.data||''))
        .map(d => {
          const obra = obraId ? '' : `<span style="font-size:10px;color:var(--verde3);background:rgba(46,204,113,0.08);border:1px solid rgba(46,204,113,0.15);border-radius:4px;padding:1px 6px;">${d.obra_nome||'—'}</span>`;
          const etiqueta = d.item_idx === -1
            ? `<span style="font-size:9px;color:#fbbf24;background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.25);border-radius:4px;padding:1px 5px;">SAÍDA MANUAL</span>`
            : `<span style="font-size:9px;color:#60a5fa;background:rgba(59,130,246,0.08);border:1px solid rgba(59,130,246,0.2);border-radius:4px;padding:1px 5px;">DISTRIBUÇÃO</span>`;
          return `<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 12px;border-top:1px solid var(--borda);gap:8px;flex-wrap:wrap;">
            <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
              <span style="font-size:11px;color:var(--texto2)">${d.data||'—'}</span>
              ${etiqueta} ${obra}
              ${d.etapa ? `<span style="font-size:9px;color:var(--texto3)">${etapaLabel(d.etapa)}</span>` : ''}
            </div>
            <div style="display:flex;gap:12px;align-items:center;">
              <span style="font-weight:700;color:var(--branco)">${Number(d.qtd).toFixed(2)}</span>
              ${isAdmin && d.valor > 0 ? `<span style="color:var(--verde-hl);font-family:'JetBrains Mono',monospace;font-size:11px">${fmtR(d.valor)}</span>` : ''}
            </div>
          </div>`;
        }).join('');

      return `<div style="background:var(--bg2);border:1px solid var(--borda);border-radius:10px;margin-bottom:10px;overflow:hidden;">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:rgba(46,204,113,0.04);">
          <span style="font-weight:700;color:var(--branco);font-size:13px;">${m.desc}</span>
          <div style="display:flex;gap:12px;align-items:center;">
            <span style="font-size:11px;color:var(--texto3)">${m.registros.length} mov.</span>
            <span style="font-weight:800;color:var(--roxo)">${totalQtd.toFixed(2)}</span>
            ${isAdmin && totalVal > 0 ? `<span style="color:var(--verde-hl);font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:700">${fmtR(totalVal)}</span>` : ''}
          </div>
        </div>
        ${rows}
      </div>`;
    }).join('');
}

function toggleCat(k) {
  catFiltroAtual = catFiltroAtual === k ? null : k;
  // Sincronizar com o select
  const sel = document.getElementById('obras-filtro-cat');
  if (sel) sel.value = catFiltroAtual || '';
  renderObrasView();
}
function filtrarLancCat() {
  const sel = document.getElementById('obras-filtro-cat');
  catFiltroAtual = sel?.value || null;
  // Sincronizar chips
  document.querySelectorAll('#obras-chips .cat-chip').forEach(el => {
    const k = el.getAttribute('onclick')?.match(/'([^']+)'/)?.[1];
    if (k) el.classList.toggle('ativo', k === catFiltroAtual);
  });
  filtrarLanc();
}

function filtrarLanc() {
  // Se os elementos da aba não existem no DOM ainda, sai sem erro
  if (!document.getElementById('obras-lanc-lista')) return;
  const busca = norm(document.getElementById('obras-busca')?.value || '');
  // Pool correto conforme modo (ativas ou concluídas)
  const obraPool = mostandoArquivadas ? obrasArquivadas : obras;
  const obraIds = new Set(obraPool.map(o => o.id));
  const obraId = document.getElementById('obras-filtro-obra')?.value || '';
  // SEMPRE filtrar pelo pool — nunca misturar ativas com concluídas
  let lista = lancamentos.filter(l => obraIds.has(l.obra_id));
  if (busca) lista = lista.filter(l => norm(l.descricao||'').includes(busca));
  if (obraId) lista = lista.filter(l => l.obra_id === obraId);
  if (catFiltroAtual) lista = lista.filter(l => (l.etapa || '00_outros') === catFiltroAtual);
  const el = document.getElementById('obras-lanc-lista'), empty = document.getElementById('obras-empty');
  if (!el || !empty) return;
  if (!lista.length) { el.innerHTML = ''; empty.classList.remove('hidden');
    document.getElementById('obras-total-filtro')?.classList.add('hidden'); return; }
  empty.classList.add('hidden');
  const totalFiltrado = lista.reduce((s,l) => s + Number(l.total||0), 0);
  const totalEl = document.getElementById('obras-total-filtro');
  const nFiltros = (obraId ? 1 : 0) + (catFiltroAtual ? 1 : 0) + (busca ? 1 : 0);
  totalEl.classList.remove('hidden');
  const totalQtd = lista.reduce((s,l) => s + Number(l.qtd||0), 0);
  const unidades = [...new Set(lista.map(l => l.unidade).filter(Boolean))];
  const unStr = unidades.length === 1 ? unidades[0] : unidades.length > 1 ? 'un. mistas' : 'un.';
  totalEl.innerHTML = `
    <span style="color:var(--texto2);font-size:11px;">${lista.length} lançamento${lista.length!==1?'s':''} ${nFiltros>0?'filtrados':'no total'}</span>
    <div style="display:flex;gap:12px;align-items:center;">
      <span style="font-size:12px;color:var(--texto3);">Qtd: <strong style="color:var(--branco);">${totalQtd % 1 === 0 ? totalQtd : totalQtd.toFixed(2)} ${unStr}</strong></span>
      ${usuarioAtual?.perfil==='admin' ? `<span style="font-size:15px;font-weight:800;color:var(--verde-hl);">${fmtR(totalFiltrado)}</span>` : ''}
    </div>`;
  // obraMap inclui ativas + arquivadas para exibir nome corretamente
  const obraMap = {};
  [...obras, ...obrasArquivadas].forEach(o => obraMap[o.id] = o.nome);

  // DRE por centro de custo — baseado na etapa construtiva do lançamento
  const detEl = document.getElementById('obras-detalhe');
  if (detEl && obraId && usuarioAtual?.perfil === 'admin') {
    const todosLancObra = lancamentos.filter(l => l.obra_id === obraId);
    const porCat = {};
    todosLancObra.forEach(l => {
      const lb = etapaLabel(l.etapa || '00_outros');
      porCat[lb] = (porCat[lb] || 0) + Number(l.total || 0);
    });
    const totalObra = Object.values(porCat).reduce((s,v) => s+v, 0);
    const catsComValor = Object.entries(porCat).sort((a,b) => b[1] - a[1]);

    // Adicionais da obra
    const adds = typeof getAdicionaisObra === 'function' ? getAdicionaisObra(obraId) : { qtd:0, valorTotal:0, totalRecebido:0, saldo:0 };

    if (catsComValor.length > 0 || adds.qtd > 0) {
      detEl.classList.remove('hidden');
      detEl.innerHTML = `
        <div style="background:rgba(46,204,113,0.04);border:1px solid rgba(46,204,113,0.15);border-radius:12px;padding:14px 16px;margin-bottom:12px;">
          <div onclick="this.parentElement.querySelector('.dre-body').classList.toggle('hidden');this.querySelector('.dre-toggle').textContent=this.parentElement.querySelector('.dre-body').classList.contains('hidden')?'▶':'▼'" style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;user-select:none;">
            <div style="font-family:'Rajdhani',sans-serif;font-size:12px;font-weight:700;color:var(--verde-hl);letter-spacing:2px;">📊 RESUMO FINANCEIRO — ${obraMap[obraId]||''}</div>
            <div style="display:flex;align-items:center;gap:10px;">
              <span style="font-size:14px;font-weight:800;color:var(--verde-hl);font-family:'JetBrains Mono',monospace;">${fmtR(totalObra)}</span>
              <span class="dre-toggle" style="font-size:10px;color:var(--texto3);">▼</span>
            </div>
          </div>
          <div class="dre-body" style="margin-top:10px;">
          ${catsComValor.map(([lb, val]) => {
            const pct = totalObra > 0 ? (val/totalObra*100).toFixed(1) : 0;
            return `<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid rgba(46,204,113,0.06);">
              <span style="flex:1;font-size:12px;color:var(--texto);">${lb}</span>
              <div style="width:80px;height:4px;background:rgba(46,204,113,0.1);border-radius:2px;overflow:hidden;">
                <div style="width:${pct}%;height:100%;background:var(--verde3);border-radius:2px;"></div>
              </div>
              <span style="font-size:11px;color:var(--texto3);width:36px;text-align:right;">${pct}%</span>
              <span style="font-size:13px;font-weight:700;color:var(--branco);width:90px;text-align:right;font-family:'JetBrains Mono',monospace;">${fmtR(val)}</span>
            </div>`;
          }).join('')}
          ${adds.qtd > 0 ? `
          <div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(139,92,246,0.2);">
            <div style="display:flex;align-items:center;gap:8px;padding:5px 0;">
              <span style="flex:1;font-size:12px;color:#a78bfa;font-weight:700;">📝 Adicionais (${adds.qtd})</span>
              <span style="font-size:13px;font-weight:700;color:#a78bfa;width:90px;text-align:right;font-family:'JetBrains Mono',monospace;">${fmtR(adds.valorTotal)}</span>
            </div>
            <div style="display:flex;gap:16px;font-size:10px;padding:2px 0;">
              <span style="color:var(--verde-hl);">Recebido: ${fmtR(adds.totalRecebido)}</span>
              <span style="color:${adds.saldo > 0 ? '#fbbf24' : 'var(--verde-hl)'};">Saldo: ${fmtR(adds.saldo)}</span>
            </div>
          </div>` : ''}
          </div>
        </div>`;
    } else {
      detEl.classList.add('hidden');
    }
  } else if (detEl) {
    detEl.classList.add('hidden');
  }
  el.innerHTML = lista.map(l => `
    <div class="lanc-item">
      <div class="lanc-top">
        <div class="lanc-desc">${l.descricao}</div>
        <div style="display:flex;align-items:center;gap:4px;">
          <span class="lanc-val admin-only">${fmtR(l.total)}</span>
          <button class="lanc-del admin-only" onclick="excluirLanc('${l.id}')">🗑</button>
        </div>
      </div>
      ${l.etapa ? `<div style="margin-bottom:3px;"><span style="font-size:9px;font-weight:700;background:rgba(46,204,113,0.08);color:var(--verde3);border:1px solid rgba(46,204,113,0.2);border-radius:4px;padding:1px 6px;font-family:'JetBrains Mono',monospace;">${etapaLabel(l.etapa)}</span></div>` : ''}
      <div class="lanc-meta">${obraMap[l.obra_id]||'—'} · ${(()=>{ const q=Number(l.qtd||1); const oNome=(obraMap[l.obra_id]||'').toUpperCase(); if(oNome.includes('ESCRIT')||q<=0||String(l.qtd).includes('e')||q!==Math.round(q*100)/100) return l.data||''; return q+' un · '+(l.data||''); })()}</div>
    </div>`).join('');
  aplicarPerfil();
}

// ══════════════════════════════════════════
// ETAPAS CONSTRUTIVAS — Centro de Custo
// ══════════════════════════════════════════
const ETAPAS = [
  { key:'01_terreno',    lb:'🏛 01 · Terreno' },
  { key:'02_doc',        lb:'📋 02 · Documentação / Licenças' },
  { key:'03_prelim',     lb:'⛏ 03 · Serviços Preliminares' },
  { key:'04_terra',      lb:'🌍 04 · Movimento de Terra' },
  { key:'05_fund',       lb:'🏗 05 · Fundação' },
  { key:'06_estrut',     lb:'🔩 06 · Estrutura' },
  { key:'07_alven',      lb:'🧱 07 · Alvenaria' },
  { key:'08_cobr',       lb:'🏠 08 · Cobertura' },
  { key:'09_elet',       lb:'⚡ 09 · Elétrica' },
  { key:'10_hidro',      lb:'🚿 10 · Hidráulica / Esgoto' },
  { key:'11_esquad',     lb:'🪟 11 · Esquadrias' },
  { key:'12_revestc',    lb:'🟫 12 · Revestimento Cerâmico' },
  { key:'13_pintura',    lb:'🖌 13 · Pintura' },
  { key:'14_acab',       lb:'✨ 14 · Acabamento Final' },
  { key:'15_locacao',    lb:'🏗 15 · Locação / Máq. / Equip.' },
  { key:'16_externo',    lb:'🌿 16 · Área Externa' },
  { key:'17_limpeza',    lb:'🧹 17 · Limpeza Final' },
  { key:'00_outros',     lb:'📦 Não classificado' },
];
function etapaLabel(key) {
  return ETAPAS.find(e => e.key === key)?.lb || key || '—';
}
function etapaSelectOpts(selected='', incluiVazio=true) {
  const vazio = incluiVazio ? '<option value="">— Etapa (opcional) —</option>' : '';
  return vazio + ETAPAS.map(e => `<option value="${e.key}" ${selected===e.key?'selected':''}>${e.lb}</option>`).join('');
}

// Redireciona para F3 Entrada Direta com a obra pré-selecionada
function irParaEntradaDireta() {
  const obraId = document.getElementById('obras-filtro-obra')?.value || '';
  setView('estoque');
  setTimeout(() => {
    abrirEntradaDireta();
    if (obraId) {
      setDestinoEntrada('obra');
      const sel = document.getElementById('entrada-obra-id');
      if (sel) sel.value = obraId;
    }
  }, 100);
}

async function excluirLanc(id) {
  if (!confirm('Excluir este lançamento?')) return;
  // Verificar se existe distribuição vinculada a este lançamento
  // Distribuições são vinculadas pelo lanc_id (se existir) ou pela combinação obra+desc+data
  const lanc = lancamentos.find(l => l.id === id);
  // Apagar distribuição correspondente (mesmo obra_id, item_desc, data)
  if (lanc) {
    const distVinculadas = distribuicoes.filter(d =>
      d.obra_id === lanc.obra_id &&
      norm(d.item_desc) === norm(lanc.descricao?.replace(/ · .*/,'') || '') &&
      d.data === lanc.data
    );
    for (const d of distVinculadas) {
      await sbDelete('distribuicoes', `?id=eq.${d.id}`);
      distribuicoes = distribuicoes.filter(x => x.id !== d.id);
    }
    if (distVinculadas.length > 0) {
      showToast(`✅ Lançamento e ${distVinculadas.length} distribuição(ões) revertidas — estoque restaurado.`);
    }
  }
  await sbDelete('lancamentos', `?id=eq.${id}`);
  lancamentos = lancamentos.filter(l => l.id !== id);
  filtrarLanc(); renderDashboard(); renderEstoque();
  if (!lanc || distribuicoes.filter(d => d.obra_id === lanc?.obra_id).length === 0)
    showToast('Lançamento excluído.');
}

async function salvarNovaObra() {
  const nome = (document.getElementById('nova-obra-nome').value||'').toUpperCase().trim();
  const cidade = (document.getElementById('nova-obra-cidade').value||'').trim();
  const valorVenda = parseFloat(document.getElementById('nova-obra-valor-venda').value) || 0;
  const contratante = (document.getElementById('nova-obra-contratante').value||'').toUpperCase().trim();
  const cpf_contratante = (document.getElementById('nova-obra-cpf').value||'').trim();
  const editId = document.getElementById('obra-edit-id').value;
  if (!nome) { showToast('INFORME O NOME DA OBRA.'); return; }
  try {
    if (editId) {
      await sbPatch('obras', `?id=eq.${editId}`, { nome, cidade, valor_venda: valorVenda, contratante, cpf_contratante });
      await loadObras();
      populateSelects(); renderDashboard(); renderObrasCards();
      showToast(`✅ OBRA "${nome}" ATUALIZADA!`);
    } else {
      const [nova] = await sbPost('obras', { nome, cidade, valor_venda: valorVenda, contratante, cpf_contratante });
      obras.push(nova); obras.sort((a,b)=>a.nome.localeCompare(b.nome));
      populateSelects(); renderDashboard(); renderObrasCards();
      showToast(`✅ OBRA ${nome} CADASTRADA!`);
    }
    fecharModal('obra');
  } catch(e) { showToast('ERRO AO SALVAR.'); }
}

function abrirModalObra(obraId) {
  const obra = obraId ? [...obras, ...obrasArquivadas].find(o => o.id === obraId) : null;
  document.getElementById('obra-edit-id').value = obra ? obra.id : '';
  document.getElementById('nova-obra-nome').value = obra ? obra.nome : '';
  document.getElementById('nova-obra-cidade').value = obra ? (obra.cidade || '') : '';
  document.getElementById('nova-obra-valor-venda').value = obra ? (obra.valor_venda || '') : '';
  document.getElementById('nova-obra-contratante').value = obra ? (obra.contratante || '') : '';
  document.getElementById('nova-obra-cpf').value = obra ? (obra.cpf_contratante || '') : '';
  document.getElementById('modal-obra-titulo').textContent = obra ? '🏗 EDITAR OBRA' : '🏗 NOVA OBRA';
  document.getElementById('modal-obra').classList.remove('hidden');
  setTimeout(() => document.getElementById('nova-obra-nome').focus(), 100);
}

// ══════════════════════════════════════════
