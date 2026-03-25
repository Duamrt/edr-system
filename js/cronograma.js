// ══════════════════════════════════════════
// CRONOGRAMA — Gantt Chart (Frappe Gantt)
// ══════════════════════════════════════════

let cronTarefas = [];
let cronGantt = null;
let cronObraFiltro = '';
let cronViewMode = 'Week';
let cronExpandido = new Set();

// Cores por obra (atribuídas dinamicamente)
const CRON_CORES = [
  { bar: '#2563eb', prog: '#60a5fa', label: '#93c5fd' },  // Azul
  { bar: '#9333ea', prog: '#c084fc', label: '#d8b4fe' },  // Roxo
  { bar: '#ea580c', prog: '#fb923c', label: '#fdba74' },  // Laranja
  { bar: '#0d9488', prog: '#2dd4bf', label: '#5eead4' },  // Teal
  { bar: '#dc2626', prog: '#f87171', label: '#fca5a5' },  // Vermelho
  { bar: '#ca8a04', prog: '#facc15', label: '#fde047' },  // Amarelo
  { bar: '#059669', prog: '#34d399', label: '#6ee7b7' },  // Verde
  { bar: '#4f46e5', prog: '#818cf8', label: '#a5b4fc' },  // Indigo
];
let cronObraCores = {}; // { obraId: corIndex }

// ── ETAPAS PADRÃO COM SUB-ITENS ──────────────────────────
const CRON_ETAPAS_PADRAO = [
  { nome: 'Serviços Preliminares', dias: 15, subs: [
    'Limpeza de Terreno', 'Gabarito', 'Locação da Obra', 'Tapume / Canteiro', 'Placa de Obra'
  ]},
  { nome: 'Fundação', dias: 30, subs: [
    'Escavação de Sapatas', 'Concretagem Sapatas', 'Escavação de Baldrame', 'Embasamento',
    'Armadura Baldrame', 'Forma Baldrame', 'Concreto Baldrame', 'Impermeabilização Baldrame',
    'Tubulações de Esgoto'
  ]},
  { nome: 'Estrutura', dias: 45, subs: [
    'Pilares', 'Vigas', 'Cintas', 'Laje', 'Escada'
  ]},
  { nome: 'Alvenaria', dias: 30, subs: [
    'Alvenaria de Vedação', 'Vergas', 'Contravergas', 'Encunhamento'
  ]},
  { nome: 'Cobertura', dias: 15, subs: [
    'Estrutura do Telhado', 'Telhas', 'Calhas e Rufos', 'Cumeeira'
  ]},
  { nome: 'Instalações Elétricas', dias: 20, subs: [
    'Eletrodutos', 'Fiação', 'Quadro de Distribuição', 'Tomadas e Interruptores', 'Interfone / Automação'
  ]},
  { nome: 'Instalações Hidráulicas', dias: 20, subs: [
    'Água Fria', 'Água Quente', 'Registros', 'Caixa d\'Água',
    'Esgoto', 'Caixa de Gordura', 'Caixa de Passagem', 'Águas Pluviais'
  ]},
  { nome: 'Impermeabilização', dias: 10, subs: [
    'Laje', 'Banheiros', 'Áreas Molhadas', 'Baldrames'
  ]},
  { nome: 'Revestimento Argamassa', dias: 25, subs: [
    'Chapisco Interno', 'Reboco Interno', 'Chapisco Externo', 'Reboco Externo', 'Massa Corrida'
  ]},
  { nome: 'Forro', dias: 10, subs: [
    'Forro de Gesso', 'Sancas / Tabicas', 'Forro PVC (áreas molhadas)'
  ]},
  { nome: 'Revestimento Cerâmico', dias: 20, subs: [
    'Contrapiso', 'Piso Cerâmico / Porcelanato', 'Azulejo Banheiros', 'Azulejo Cozinha',
    'Soleiras e Peitoris'
  ]},
  { nome: 'Esquadrias', dias: 10, subs: [
    'Portas Internas', 'Porta de Entrada', 'Janelas', 'Batentes', 'Ferragens',
    'Vidros', 'Box Banheiro'
  ]},
  { nome: 'Pintura', dias: 15, subs: [
    'Selador', 'Massa PVA', 'Pintura Interna', 'Pintura Externa', 'Textura / Grafiato'
  ]},
  { nome: 'Louças e Metais', dias: 7, subs: [
    'Vasos Sanitários', 'Pias / Lavatórios', 'Torneiras', 'Chuveiros', 'Acessórios Banheiro'
  ]},
  { nome: 'Acabamento Final', dias: 10, subs: [
    'Rodapés', 'Arremates Gerais', 'Calafete', 'Espelhos Elétricos'
  ]},
  { nome: 'Área Externa', dias: 15, subs: [
    'Muro', 'Portão', 'Calçada', 'Cisterna / Fossa', 'Paisagismo', 'Garagem'
  ]},
  { nome: 'Limpeza e Entrega', dias: 7, subs: [
    'Limpeza Final Bruta', 'Limpeza Final Fina', 'Vistoria Interna', 'Entrega de Chaves'
  ]}
];

// ── RENDER PRINCIPAL ─────────────────────────────────────

async function renderCronograma() {
  const container = document.getElementById('cronograma-container');
  if (!container) return;

  const obrasOpts = obras.map(o => `<option value="${o.id}">${o.nome}</option>`).join('');
  container.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px;">
      <select id="cron-filtro-obra" onchange="cronFiltrarObra()" style="flex:1;min-width:180px;padding:10px 14px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;color:var(--branco);font-size:14px;outline:none;font-family:inherit;">
        <option value="">Todas as obras</option>
        ${obrasOpts}
      </select>
      <div style="display:flex;gap:4px;">
        <button onclick="cronSetView('Day')" id="cron-vm-Day" class="cron-vm-btn" style="padding:6px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.03);color:var(--texto2);font-size:12px;cursor:pointer;">Dia</button>
        <button onclick="cronSetView('Week')" id="cron-vm-Week" class="cron-vm-btn" style="padding:6px 12px;border-radius:8px;border:1px solid rgba(74,222,128,0.3);background:rgba(74,222,128,0.1);color:#4ade80;font-size:12px;cursor:pointer;">Semana</button>
        <button onclick="cronSetView('Month')" id="cron-vm-Month" class="cron-vm-btn" style="padding:6px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.03);color:var(--texto2);font-size:12px;cursor:pointer;">Mes</button>
      </div>
      <button onclick="cronScrollHoje()" style="padding:6px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.03);color:var(--texto2);font-size:12px;cursor:pointer;">Hoje</button>
      <button onclick="cronToggleTodos()" style="padding:6px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.03);color:var(--texto2);font-size:12px;cursor:pointer;" id="cron-btn-toggle">Expandir</button>
      <button onclick="cronAbrirModal()" class="btn-save" style="padding:8px 16px;font-size:12px;">+ TAREFA</button>
    </div>
    <div id="cron-gantt-wrap" style="overflow-x:auto;background:rgba(255,255,255,0.02);border-radius:12px;border:1px solid rgba(255,255,255,0.06);min-height:120px;-webkit-overflow-scrolling:touch;"></div>
    <div id="cron-vazio" class="hidden" style="text-align:center;padding:60px 20px;color:var(--texto3);">
      <div style="font-size:32px;margin-bottom:12px;">📅</div>
      <div style="font-size:14px;margin-bottom:6px;">Nenhuma tarefa no cronograma</div>
      <div style="font-size:12px;">Clique em <strong>+ TAREFA</strong> para adicionar etapas da obra</div>
    </div>
    <div id="cron-lista" style="margin-top:16px;"></div>
  `;

  await cronCarregarTarefas();
}

async function cronCarregarTarefas() {
  try {
    let query = '?order=ordem,data_inicio';
    if (cronObraFiltro) query += `&obra_id=eq.${cronObraFiltro}`;
    const r = await sbGet('cronograma_tarefas', query);
    cronTarefas = Array.isArray(r) ? r : [];
  } catch(e) { cronTarefas = []; }
  cronRenderGantt();
}

// ── GANTT ────────────────────────────────────────────────

function cronCalcProgresso(t) {
  const subs = t.subitens || [];
  if (subs.length === 0) return Number(t.progresso) || 0;
  const feitos = subs.filter(s => s.feito).length;
  return Math.round(feitos / subs.length * 100);
}

function cronRenderGantt() {
  const wrap = document.getElementById('cron-gantt-wrap');
  const vazio = document.getElementById('cron-vazio');
  if (!wrap) return;

  if (cronTarefas.length === 0) {
    wrap.style.display = 'none';
    if (vazio) vazio.classList.remove('hidden');
    cronGantt = null;
    cronRenderLista();
    return;
  }

  wrap.style.display = '';
  if (vazio) vazio.classList.add('hidden');

  // Atribuir cores por obra
  const obrasUnicas = [...new Set(cronTarefas.map(t => t.obra_id))];
  cronObraCores = {};
  obrasUnicas.forEach((obraId, i) => { cronObraCores[obraId] = i % CRON_CORES.length; });

  const idSet = new Set(cronTarefas.map(t => t.id));
  const tasks = cronTarefas.map(t => {
    const obraNome = obras.find(o => o.id === t.obra_id)?.nome || '';
    const dep = t.dependencia && idSet.has(t.dependencia) ? t.dependencia : '';
    const corIdx = cronObraCores[t.obra_id] || 0;
    return {
      id: t.id,
      name: obraNome ? `${obraNome} — ${t.nome}` : t.nome,
      start: t.data_inicio,
      end: t.data_fim,
      progress: cronCalcProgresso(t),
      dependencies: dep,
      custom_class: 'cron-bar cron-obra-' + corIdx
    };
  });

  wrap.innerHTML = '';

  try {
    cronGantt = new Gantt(wrap, tasks, {
      view_mode: cronViewMode,
      date_format: 'YYYY-MM-DD',
      language: 'ptBr',
      on_click: task => cronToggleExpand(task.id),
      on_date_change: (task, start, end) => cronAtualizarDatas(task.id, start, end),
      on_progress_change: (task, progress) => cronAtualizarProgresso(task.id, progress),
      custom_popup_html: task => {
        const t = cronTarefas.find(x => x.id === task.id);
        const obraNome = t ? (obras.find(o => o.id === t.obra_id)?.nome || '') : '';
        const subs = t?.subitens || [];
        const feitos = subs.filter(s => s.feito).length;
        return `<div class="cron-popup">
          <div style="font-weight:700;margin-bottom:4px;">${task.name}</div>
          ${obraNome ? `<div style="font-size:11px;color:#8b8fa0;margin-bottom:4px;">${obraNome}</div>` : ''}
          <div style="font-size:12px;">${formatDateBR(task._start)} → ${formatDateBR(task._end)}</div>
          <div style="font-size:12px;margin-top:2px;">${subs.length ? `${feitos}/${subs.length} itens` : `${Math.round(task.progress)}%`}</div>
        </div>`;
      }
    });
    setTimeout(() => cronAplicarTemaEscuro(wrap), 100);
    setTimeout(() => cronAplicarTemaEscuro(wrap), 500);
  } catch(e) {
    console.error('Gantt render error:', e);
    wrap.innerHTML = '<div style="padding:20px;color:#ef4444;text-align:center;">Erro ao renderizar: ' + e.message + '</div>';
  }

  cronRenderLista();
}

// ── LISTA DE TAREFAS COM CHECKLIST ───────────────────────

function cronToggleExpand(id) {
  if (cronExpandido.has(id)) cronExpandido.delete(id);
  else cronExpandido.add(id);
  cronRenderLista();
}

function cronRenderLista() {
  const lista = document.getElementById('cron-lista');
  if (!lista) return;
  if (cronTarefas.length === 0) { lista.innerHTML = ''; return; }

  const totalGeral = cronTarefas.reduce((a, t) => a + (t.subitens || []).length, 0);
  const feitosGeral = cronTarefas.reduce((a, t) => a + (t.subitens || []).filter(s => s.feito).length, 0);
  const progGeral = totalGeral > 0 ? Math.round(feitosGeral / totalGeral * 100) : 0;

  const rows = cronTarefas.map(t => {
    const obra = obras.find(o => o.id === t.obra_id);
    const subs = t.subitens || [];
    const feitos = subs.filter(s => s.feito).length;
    const prog = subs.length > 0 ? Math.round(feitos / subs.length * 100) : Math.round(Number(t.progresso) || 0);
    const inicio = t.data_inicio ? new Date(t.data_inicio + 'T00:00:00').toLocaleDateString('pt-BR') : '';
    const fim = t.data_fim ? new Date(t.data_fim + 'T00:00:00').toLocaleDateString('pt-BR') : '';
    const aberto = cronExpandido.has(t.id);
    const corIdx = cronObraCores[t.obra_id] || 0;
    const corObra = CRON_CORES[corIdx] || CRON_CORES[0];
    const corProg = prog >= 100 ? '#4ade80' : prog >= 50 ? '#fbbf24' : prog > 0 ? '#f97316' : '#ef4444';

    let subsHtml = '';
    if (aberto && subs.length > 0) {
      subsHtml = `<div style="padding:8px 12px 12px 32px;border-bottom:1px solid rgba(255,255,255,0.04);background:rgba(255,255,255,0.01);">
        ${subs.map((s, i) => `
          <label style="display:flex;align-items:center;gap:8px;padding:5px 0;cursor:pointer;${s.feito ? 'opacity:0.6;' : ''}">
            <input type="checkbox" ${s.feito ? 'checked' : ''} onchange="cronToggleSub('${t.id}',${i})" style="accent-color:#4ade80;width:16px;height:16px;cursor:pointer;">
            <span style="font-size:13px;color:${s.feito ? '#6b9e78' : '#e2e4e9'};${s.feito ? 'text-decoration:line-through;' : ''}">${s.nome}</span>
          </label>
        `).join('')}
        <div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.04);display:flex;gap:6px;">
          <button onclick="cronAddSub('${t.id}')" style="padding:4px 10px;border-radius:6px;border:1px solid rgba(74,222,128,0.2);background:rgba(74,222,128,0.06);color:#4ade80;font-size:11px;cursor:pointer;">+ Sub-item</button>
        </div>
      </div>`;
    }

    return `<div style="border-bottom:${aberto ? 'none' : '1px solid rgba(255,255,255,0.04)'};">
      <div style="display:flex;align-items:center;gap:8px;padding:10px 12px;cursor:pointer;flex-wrap:wrap;" class="cron-lista-item" onclick="cronToggleExpand('${t.id}')">
        <div style="width:4px;height:28px;border-radius:2px;background:${corObra.bar};flex-shrink:0;"></div>
        <div style="font-size:14px;transition:transform 0.2s;transform:rotate(${aberto ? '90' : '0'}deg);color:#8b8fa0;">${subs.length ? '▶' : '•'}</div>
        <div style="flex:1;min-width:150px;">
          <div style="font-size:13px;color:#e2e4e9;font-weight:500;">${t.nome}</div>
          <div style="font-size:11px;color:${corObra.label};">${obra?.nome || ''} <span style="color:#8b8fa0;">· ${inicio} → ${fim}</span></div>
        </div>
        <div style="min-width:100px;display:flex;align-items:center;gap:6px;">
          <div style="flex:1;background:rgba(255,255,255,0.06);border-radius:4px;height:6px;overflow:hidden;">
            <div style="width:${prog}%;height:100%;background:${corProg};border-radius:4px;transition:width 0.3s;"></div>
          </div>
          <span style="font-size:11px;color:${corProg};font-weight:600;min-width:32px;text-align:right;">${subs.length ? `${feitos}/${subs.length}` : `${prog}%`}</span>
        </div>
        <div style="display:flex;gap:4px;" onclick="event.stopPropagation()">
          <button onclick="cronAbrirModal('${t.id}')" style="padding:4px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.04);color:#e2e4e9;font-size:11px;cursor:pointer;">Editar</button>
          <button onclick="cronExcluir('${t.id}')" style="padding:4px 10px;border-radius:6px;border:1px solid rgba(239,68,68,0.2);background:rgba(239,68,68,0.06);color:#ef4444;font-size:11px;cursor:pointer;">✕</button>
        </div>
      </div>
      ${subsHtml}
    </div>`;
  }).join('');

  lista.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;padding-top:8px;">
      <div style="font-size:10px;color:var(--texto3);letter-spacing:2px;font-weight:700;">ETAPAS (${cronTarefas.length})</div>
      ${totalGeral > 0 ? `<div style="display:flex;align-items:center;gap:6px;">
        <div style="width:80px;background:rgba(255,255,255,0.06);border-radius:4px;height:6px;overflow:hidden;">
          <div style="width:${progGeral}%;height:100%;background:#4ade80;border-radius:4px;"></div>
        </div>
        <span style="font-size:11px;color:#4ade80;font-weight:600;">${progGeral}% geral</span>
      </div>` : ''}
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:8px;">
      ${Object.entries(cronObraCores).map(([obraId, idx]) => {
        const cor = CRON_CORES[idx];
        const nome = obras.find(o => o.id === obraId)?.nome || '';
        return `<div style="display:flex;align-items:center;gap:4px;font-size:11px;color:${cor.label};"><div style="width:10px;height:10px;border-radius:3px;background:${cor.bar};"></div>${nome}</div>`;
      }).join('')}
    </div>
    <div style="background:rgba(255,255,255,0.02);border-radius:10px;border:1px solid rgba(255,255,255,0.06);overflow:hidden;">
      ${rows}
    </div>
  `;
}

// ── CHECKLIST ACTIONS ────────────────────────────────────

async function cronToggleSub(tarefaId, subIdx) {
  const t = cronTarefas.find(x => x.id === tarefaId);
  if (!t || !t.subitens || !t.subitens[subIdx]) return;

  t.subitens[subIdx].feito = !t.subitens[subIdx].feito;
  const prog = cronCalcProgresso(t);
  t.progresso = prog;

  try {
    await sbPatch('cronograma_tarefas', `?id=eq.${tarefaId}`, {
      subitens: t.subitens,
      progresso: prog
    });
  } catch(e) { showToast('Erro ao salvar'); }

  // Atualizar Gantt sem recarregar tudo
  if (cronGantt) {
    try {
      const wrap = document.getElementById('cron-gantt-wrap');
      cronRenderGantt();
    } catch(e) {}
  } else {
    cronRenderLista();
  }
}

async function cronAddSub(tarefaId) {
  const nome = prompt('Nome do sub-item:');
  if (!nome || !nome.trim()) return;

  const t = cronTarefas.find(x => x.id === tarefaId);
  if (!t) return;

  if (!t.subitens) t.subitens = [];
  t.subitens.push({ nome: nome.trim(), feito: false });
  t.progresso = cronCalcProgresso(t);

  try {
    await sbPatch('cronograma_tarefas', `?id=eq.${tarefaId}`, {
      subitens: t.subitens,
      progresso: t.progresso
    });
    cronRenderLista();
  } catch(e) { showToast('Erro ao adicionar sub-item'); }
}

// ── TEMA ESCURO SVG ──────────────────────────────────────

function cronAplicarTemaEscuro(wrap) {
  if (!wrap) return;
  wrap.querySelectorAll('.grid-background').forEach(el => { el.setAttribute('fill', '#111113'); });
  wrap.querySelectorAll('.grid-header').forEach(el => { el.setAttribute('fill', '#161618'); });
  wrap.querySelectorAll('.grid-row').forEach((el, i) => { el.setAttribute('fill', i % 2 === 0 ? '#111113' : '#0e0e10'); });
  wrap.querySelectorAll('.row-line').forEach(el => { el.setAttribute('stroke', 'rgba(255,255,255,0.04)'); });
  wrap.querySelectorAll('.tick').forEach(el => { el.setAttribute('stroke', 'rgba(255,255,255,0.06)'); });
  wrap.querySelectorAll('.today-highlight').forEach(el => { el.setAttribute('fill', 'rgba(74,222,128,0.08)'); });
  // Cores por obra nas barras (mapear por ordem das tarefas)
  const wrappers = wrap.querySelectorAll('.bar-wrapper');
  wrappers.forEach((el, i) => {
    const tarefa = cronTarefas[i];
    if (!tarefa) return;
    const corIdx = cronObraCores[tarefa.obra_id] || 0;
    const cor = CRON_CORES[corIdx] || CRON_CORES[0];
    const bar = el.querySelector('.bar');
    const prog = el.querySelector('.bar-progress');
    if (bar) bar.setAttribute('fill', cor.bar);
    if (prog) prog.setAttribute('fill', cor.prog);
  });
  wrap.querySelectorAll('.bar-label').forEach(el => { el.setAttribute('fill', '#f0f0f0'); el.style.fill = '#f0f0f0'; });
  wrap.querySelectorAll('.upper-text').forEach(el => { el.setAttribute('fill', '#c0c4cc'); el.style.fill = '#c0c4cc'; });
  wrap.querySelectorAll('.lower-text').forEach(el => { el.setAttribute('fill', '#8b8fa0'); el.style.fill = '#8b8fa0'; });
}

function formatDateBR(d) {
  if (!d) return '';
  const dt = new Date(d);
  return dt.toLocaleDateString('pt-BR');
}

function cronSetView(mode) {
  cronViewMode = mode;
  document.querySelectorAll('.cron-vm-btn').forEach(b => {
    const active = b.id === `cron-vm-${mode}`;
    b.style.borderColor = active ? 'rgba(74,222,128,0.3)' : 'rgba(255,255,255,0.08)';
    b.style.background = active ? 'rgba(74,222,128,0.1)' : 'rgba(255,255,255,0.03)';
    b.style.color = active ? '#4ade80' : 'var(--texto2)';
  });
  if (cronGantt) {
    try { cronGantt.change_view_mode(mode); } catch(e) {}
  }
}

function cronFiltrarObra() {
  cronObraFiltro = document.getElementById('cron-filtro-obra')?.value || '';
  cronCarregarTarefas();
}

function cronScrollHoje() {
  const wrap = document.getElementById('cron-gantt-wrap');
  if (!wrap) return;
  const highlight = wrap.querySelector('.today-highlight');
  if (highlight) {
    const x = Number(highlight.getAttribute('x')) || 0;
    wrap.scrollTo({ left: Math.max(x - 100, 0), behavior: 'smooth' });
  }
}

function cronToggleTodos() {
  const btn = document.getElementById('cron-btn-toggle');
  if (cronExpandido.size > 0) {
    cronExpandido.clear();
    if (btn) btn.textContent = 'Expandir';
  } else {
    cronTarefas.forEach(t => { if ((t.subitens || []).length > 0) cronExpandido.add(t.id); });
    if (btn) btn.textContent = 'Recolher';
  }
  cronRenderLista();
}

// ── CRUD ─────────────────────────────────────────────────

async function cronAtualizarDatas(id, start, end) {
  const inicio = start.toISOString().split('T')[0];
  const fim = end.toISOString().split('T')[0];
  try {
    await sbPatch('cronograma_tarefas', `?id=eq.${id}`, { data_inicio: inicio, data_fim: fim });
    const t = cronTarefas.find(x => x.id === id);
    if (t) { t.data_inicio = inicio; t.data_fim = fim; }
  } catch(e) { showToast('Erro ao salvar datas'); }
}

async function cronAtualizarProgresso(id, progress) {
  try {
    await sbPatch('cronograma_tarefas', `?id=eq.${id}`, { progresso: Math.round(progress) });
    const t = cronTarefas.find(x => x.id === id);
    if (t) t.progresso = Math.round(progress);
  } catch(e) { showToast('Erro ao salvar progresso'); }
}

function cronAbrirModal(editId) {
  const t = editId ? cronTarefas.find(x => x.id === editId) : null;
  const obrasOpts = obras.map(o => `<option value="${o.id}" ${t && t.obra_id === o.id ? 'selected' : ''}>${o.nome}</option>`).join('');

  const depOpts = cronTarefas
    .filter(x => x.id !== editId)
    .map(x => {
      const oNome = obras.find(o => o.id === x.obra_id)?.nome || '';
      return `<option value="${x.id}" ${t && t.dependencia === x.id ? 'selected' : ''}>${oNome ? oNome + ' — ' : ''}${x.nome}</option>`;
    }).join('');

  const hoje = new Date().toISOString().split('T')[0];
  const em30 = new Date(Date.now() + 30*86400000).toISOString().split('T')[0];

  // Sub-itens existentes pra edição
  const subsExist = t?.subitens || [];
  const subsHtml = subsExist.length > 0 ? `
    <div style="border-top:1px solid var(--borda);margin:10px 0 6px;padding-top:8px;">
      <div style="font-size:10px;color:var(--texto3);letter-spacing:2px;font-weight:700;margin-bottom:6px;">SUB-ITENS (${subsExist.length})</div>
      <div id="cron-modal-subs" style="max-height:200px;overflow-y:auto;">
        ${subsExist.map((s, i) => `
          <div style="display:flex;align-items:center;gap:6px;padding:4px 0;">
            <input type="text" value="${s.nome}" id="cron-sub-${i}" style="flex:1;padding:6px 10px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:6px;color:var(--branco);font-size:12px;outline:none;font-family:inherit;">
            <button onclick="cronRemoverSubModal(${i})" style="padding:4px 8px;border-radius:4px;border:1px solid rgba(239,68,68,0.2);background:rgba(239,68,68,0.06);color:#ef4444;font-size:11px;cursor:pointer;">✕</button>
          </div>
        `).join('')}
      </div>
    </div>
  ` : '';

  const html = `
    <div class="modal-title"><span>${t ? '✏ EDITAR TAREFA' : '📅 NOVA TAREFA'}</span> <button class="modal-close" onclick="fecharModal('cron-tarefa')">✕</button></div>
    <input type="hidden" id="cron-edit-id" value="${editId || ''}">
    <div class="field"><label>OBRA *</label>
      <select id="cron-obra" style="width:100%;padding:10px 14px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;color:var(--branco);font-size:14px;outline:none;font-family:inherit;">
        <option value="">Selecione a obra</option>
        ${obrasOpts}
      </select>
    </div>
    <div class="field"><label>TAREFA / ETAPA *</label><input type="text" id="cron-nome" placeholder="Ex: Fundação, Alvenaria, Cobertura" value="${t ? t.nome : ''}"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
      <div class="field"><label>INÍCIO *</label><input type="date" id="cron-inicio" value="${t ? t.data_inicio : hoje}"></div>
      <div class="field"><label>FIM *</label><input type="date" id="cron-fim" value="${t ? t.data_fim : em30}"></div>
    </div>
    <div class="field"><label>DEPENDE DE</label>
      <select id="cron-dep" style="width:100%;padding:10px 14px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;color:var(--branco);font-size:14px;outline:none;font-family:inherit;">
        <option value="">Nenhuma</option>
        ${depOpts}
      </select>
    </div>
    ${subsHtml}
    <div style="display:flex;gap:8px;margin-top:8px;">
      <button class="btn-save" onclick="cronSalvar()" style="flex:1;">SALVAR</button>
      ${t ? `<button class="btn-outline" onclick="cronExcluir('${editId}')" style="color:#ef4444;border-color:rgba(239,68,68,0.3);">EXCLUIR</button>` : ''}
      <button class="btn-outline" onclick="fecharModal('cron-tarefa')">CANCELAR</button>
    </div>
  `;

  let overlay = document.getElementById('modal-cron-tarefa');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'modal-cron-tarefa';
    overlay.className = 'modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.onclick = e => { if (e.target === overlay) fecharModal('cron-tarefa'); };
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.maxWidth = '500px';
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  }
  overlay.querySelector('.modal').innerHTML = html;
  overlay.classList.remove('hidden');

  // Guardar subs pra edição
  window._cronSubsEdit = [...subsExist];
}

function cronRemoverSubModal(idx) {
  if (!window._cronSubsEdit) return;
  window._cronSubsEdit.splice(idx, 1);
  // Re-renderizar subs no modal
  const container = document.getElementById('cron-modal-subs');
  if (container) {
    container.innerHTML = window._cronSubsEdit.map((s, i) => `
      <div style="display:flex;align-items:center;gap:6px;padding:4px 0;">
        <input type="text" value="${s.nome}" id="cron-sub-${i}" style="flex:1;padding:6px 10px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:6px;color:var(--branco);font-size:12px;outline:none;font-family:inherit;">
        <button onclick="cronRemoverSubModal(${i})" style="padding:4px 8px;border-radius:4px;border:1px solid rgba(239,68,68,0.2);background:rgba(239,68,68,0.06);color:#ef4444;font-size:11px;cursor:pointer;">✕</button>
      </div>
    `).join('');
  }
}

async function cronSalvar() {
  const editId = document.getElementById('cron-edit-id').value;
  const obra = document.getElementById('cron-obra').value;
  const nome = document.getElementById('cron-nome').value.trim();
  const inicio = document.getElementById('cron-inicio').value;
  const fim = document.getElementById('cron-fim').value;
  const dep = document.getElementById('cron-dep').value || null;

  if (!obra || !nome || !inicio || !fim) { showToast('Preencha obra, tarefa, início e fim'); return; }
  if (fim < inicio) { showToast('Data fim deve ser após início'); return; }

  // Atualizar nomes dos sub-itens editados
  const subs = (window._cronSubsEdit || []).map((s, i) => {
    const input = document.getElementById(`cron-sub-${i}`);
    return { nome: input ? input.value.trim() : s.nome, feito: s.feito };
  }).filter(s => s.nome);

  const prog = subs.length > 0 ? Math.round(subs.filter(s => s.feito).length / subs.length * 100) : 0;

  const dados = {
    obra_id: obra,
    nome: nome,
    data_inicio: inicio,
    data_fim: fim,
    progresso: prog,
    dependencia: dep,
    subitens: subs
  };

  try {
    if (editId) {
      await sbPatch('cronograma_tarefas', `?id=eq.${editId}`, dados);
      showToast('Tarefa atualizada');
    } else {
      await sbPost('cronograma_tarefas', dados);
      showToast('Tarefa criada');
    }
    fecharModal('cron-tarefa');
    await cronCarregarTarefas();
  } catch(e) {
    showToast('Erro ao salvar tarefa');
  }
}

async function cronExcluir(id) {
  if (!confirm('Excluir esta tarefa?')) return;
  try {
    await sbDelete('cronograma_tarefas', `?id=eq.${id}`);
    showToast('Tarefa excluída');
    fecharModal('cron-tarefa');
    await cronCarregarTarefas();
  } catch(e) { showToast('Erro ao excluir'); }
}

// ── GERADOR DE ETAPAS PADRÃO ─────────────────────────────

function cronGerarEtapas() {
  const obraId = document.getElementById('cron-filtro-obra')?.value;
  if (!obraId) { showToast('Selecione uma obra primeiro'); return; }

  const obra = obras.find(o => o.id === obraId);
  if (!obra) return;

  const existentes = cronTarefas.filter(t => t.obra_id === obraId);
  if (existentes.length > 0) {
    if (!confirm(`Já existem ${existentes.length} tarefas pra ${obra.nome}. Adicionar etapas padrão mesmo assim?`)) return;
  }

  cronAbrirModalEtapas(obraId);
}

function cronAbrirModalEtapas(obraId) {
  const obra = obras.find(o => o.id === obraId);
  const hoje = new Date().toISOString().split('T')[0];

  const html = `
    <div class="modal-title"><span>⚡ GERAR CRONOGRAMA COMPLETO</span> <button class="modal-close" onclick="fecharModal('cron-etapas')">✕</button></div>
    <div style="font-size:12px;color:var(--texto2);margin-bottom:12px;padding:8px;background:rgba(74,222,128,0.05);border:1px solid rgba(74,222,128,0.1);border-radius:8px;">
      Gerar ${CRON_ETAPAS_PADRAO.length} etapas com sub-itens para <strong>${obra?.nome || ''}</strong>.<br>
      Cada etapa vem com checklist de serviços. Progresso calcula automaticamente.
    </div>
    <div class="field"><label>DATA DE INÍCIO DA OBRA</label><input type="date" id="cron-etapas-inicio" value="${hoje}"></div>
    <div style="max-height:350px;overflow-y:auto;margin:8px 0;">
      ${CRON_ETAPAS_PADRAO.map((e, i) => `
        <div style="border-bottom:1px solid rgba(255,255,255,0.04);padding:6px 0;">
          <div style="display:flex;align-items:center;gap:8px;">
            <input type="checkbox" id="cron-et-${i}" checked style="accent-color:#4ade80;">
            <label for="cron-et-${i}" style="flex:1;font-size:13px;color:var(--texto1);cursor:pointer;font-weight:500;">${e.nome}</label>
            <span style="font-size:11px;color:var(--texto3);">${e.dias}d · ${e.subs.length} itens</span>
          </div>
          <div style="padding-left:28px;font-size:11px;color:#6b7280;margin-top:2px;">${e.subs.join(' · ')}</div>
        </div>
      `).join('')}
    </div>
    <button class="btn-save" onclick="cronSalvarEtapas('${obraId}')">GERAR CRONOGRAMA</button>
    <button class="btn-outline" onclick="fecharModal('cron-etapas')" style="margin-top:6px;">CANCELAR</button>
  `;

  let overlay = document.getElementById('modal-cron-etapas');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'modal-cron-etapas';
    overlay.className = 'modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.onclick = e => { if (e.target === overlay) fecharModal('cron-etapas'); };
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.maxWidth = '560px';
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  }
  overlay.querySelector('.modal').innerHTML = html;
  overlay.classList.remove('hidden');
}

async function cronSalvarEtapas(obraId) {
  const inicioStr = document.getElementById('cron-etapas-inicio')?.value;
  if (!inicioStr) { showToast('Informe a data de início'); return; }

  let dataAtual = new Date(inicioStr + 'T00:00:00');
  let criadas = 0;
  let anteriorId = null;

  for (let i = 0; i < CRON_ETAPAS_PADRAO.length; i++) {
    const check = document.getElementById(`cron-et-${i}`);
    if (!check?.checked) continue;

    const etapa = CRON_ETAPAS_PADRAO[i];
    const inicio = dataAtual.toISOString().split('T')[0];
    dataAtual.setDate(dataAtual.getDate() + etapa.dias);
    const fim = dataAtual.toISOString().split('T')[0];

    const subitens = etapa.subs.map(s => ({ nome: s, feito: false }));

    try {
      const r = await sbPost('cronograma_tarefas', {
        obra_id: obraId,
        nome: etapa.nome,
        data_inicio: inicio,
        data_fim: fim,
        progresso: 0,
        dependencia: anteriorId,
        ordem: i,
        subitens: subitens
      });
      if (r && r[0]?.id) anteriorId = r[0].id;
      criadas++;
    } catch(e) { console.error('Erro etapa', etapa.nome, e); }
  }

  showToast(`${criadas} etapas criadas com sub-itens`);
  fecharModal('cron-etapas');
  await cronCarregarTarefas();
}

// ── GERAR PDF ────────────────────────────────────────────

function cronGerarPDF() {
  if (cronTarefas.length === 0) { showToast('Nenhuma tarefa no cronograma'); return; }

  // Filtrar por obra se selecionada
  const obraId = cronObraFiltro;
  const tarefas = obraId ? cronTarefas.filter(t => t.obra_id === obraId) : cronTarefas;
  if (tarefas.length === 0) { showToast('Nenhuma tarefa pra essa obra'); return; }

  const obraNome = obraId ? (obras.find(o => o.id === obraId)?.nome || 'Obra') : 'Todas as Obras';
  const hoje = new Date().toLocaleDateString('pt-BR');

  // Stats gerais
  const totalSubs = tarefas.reduce((a, t) => a + (t.subitens || []).length, 0);
  const feitosSubs = tarefas.reduce((a, t) => a + (t.subitens || []).filter(s => s.feito).length, 0);
  const progGeral = totalSubs > 0 ? Math.round(feitosSubs / totalSubs * 100) : 0;

  // Montar conteúdo do PDF
  const content = [];

  // Header
  content.push({ text: 'CRONOGRAMA DE OBRA', style: 'titulo' });
  content.push({ text: obraNome.toUpperCase(), style: 'subtitulo' });
  content.push({ text: `Gerado em ${hoje}`, style: 'data' });
  content.push({ text: ' ', margin: [0, 5] });

  // Resumo
  content.push({
    columns: [
      { text: `${tarefas.length} etapas`, style: 'stat' },
      { text: `${totalSubs} serviços`, style: 'stat' },
      { text: `${feitosSubs} concluídos`, style: 'stat' },
      { text: `${progGeral}% geral`, style: 'statDestaque' }
    ],
    margin: [0, 0, 0, 15]
  });

  // Linha separadora
  content.push({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.5, lineColor: '#cccccc' }], margin: [0, 0, 0, 10] });

  // Etapas com sub-itens
  tarefas.forEach((t, idx) => {
    const subs = t.subitens || [];
    const feitos = subs.filter(s => s.feito).length;
    const prog = subs.length > 0 ? Math.round(feitos / subs.length * 100) : Math.round(Number(t.progresso) || 0);
    const inicio = t.data_inicio ? new Date(t.data_inicio + 'T00:00:00').toLocaleDateString('pt-BR') : '';
    const fim = t.data_fim ? new Date(t.data_fim + 'T00:00:00').toLocaleDateString('pt-BR') : '';

    // Header da etapa
    content.push({
      columns: [
        { text: `${idx + 1}. ${t.nome}`, style: 'etapaNome', width: '*' },
        { text: `${inicio} → ${fim}`, style: 'etapaDatas', width: 'auto', alignment: 'right' }
      ],
      margin: [0, idx > 0 ? 12 : 0, 0, 2]
    });

    // Barra de progresso visual
    content.push({
      columns: [
        {
          canvas: [
            { type: 'rect', x: 0, y: 0, w: 300, h: 8, r: 3, color: '#e5e7eb' },
            { type: 'rect', x: 0, y: 0, w: Math.max(prog * 3, 0), h: 8, r: 3, color: prog >= 100 ? '#22c55e' : prog >= 50 ? '#eab308' : '#ef4444' }
          ],
          width: 310
        },
        { text: subs.length > 0 ? `${feitos}/${subs.length} (${prog}%)` : `${prog}%`, style: 'progresso', width: 'auto' }
      ],
      margin: [0, 2, 0, 4]
    });

    // Sub-itens como checklist
    if (subs.length > 0) {
      const tabBody = [];
      // 2 colunas de sub-itens pra economizar espaço
      for (let i = 0; i < subs.length; i += 2) {
        const row = [];
        row.push({ text: `${subs[i].feito ? '☑' : '☐'} ${subs[i].nome}`, style: subs[i].feito ? 'subFeito' : 'subPendente' });
        if (subs[i + 1]) {
          row.push({ text: `${subs[i + 1].feito ? '☑' : '☐'} ${subs[i + 1].nome}`, style: subs[i + 1].feito ? 'subFeito' : 'subPendente' });
        } else {
          row.push({ text: '' });
        }
        tabBody.push(row);
      }

      content.push({
        table: { widths: ['50%', '50%'], body: tabBody },
        layout: {
          hLineWidth: () => 0,
          vLineWidth: () => 0,
          paddingLeft: () => 8,
          paddingRight: () => 4,
          paddingTop: () => 2,
          paddingBottom: () => 2
        },
        margin: [10, 0, 0, 0]
      });
    }
  });

  // Rodapé com info da empresa
  content.push({ text: ' ', margin: [0, 20] });
  content.push({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.5, lineColor: '#cccccc' }] });
  content.push({ text: 'EDR Engenharia — sistema.edreng.com.br', style: 'rodape', margin: [0, 8, 0, 0] });

  const docDefinition = {
    pageSize: 'A4',
    pageMargins: [40, 40, 40, 40],
    content: content,
    styles: {
      titulo: { fontSize: 18, bold: true, color: '#111827', margin: [0, 0, 0, 2] },
      subtitulo: { fontSize: 14, bold: true, color: '#059669', margin: [0, 0, 0, 2] },
      data: { fontSize: 9, color: '#6b7280' },
      stat: { fontSize: 10, color: '#374151', alignment: 'center' },
      statDestaque: { fontSize: 11, bold: true, color: '#059669', alignment: 'center' },
      etapaNome: { fontSize: 11, bold: true, color: '#111827' },
      etapaDatas: { fontSize: 9, color: '#6b7280' },
      progresso: { fontSize: 9, color: '#374151', margin: [6, 0, 0, 0] },
      subFeito: { fontSize: 9, color: '#9ca3af' },
      subPendente: { fontSize: 9, color: '#374151' },
      rodape: { fontSize: 8, color: '#9ca3af', alignment: 'center' }
    }
  };

  const nomeArquivo = `cronograma-${obraNome.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${new Date().toISOString().split('T')[0]}.pdf`;

  try {
    pdfMake.createPdf(docDefinition).download(nomeArquivo);
    showToast('PDF gerado');
  } catch(e) {
    console.error('PDF error:', e);
    showToast('Erro ao gerar PDF');
  }
}
