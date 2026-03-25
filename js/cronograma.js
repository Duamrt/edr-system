// ══════════════════════════════════════════
// CRONOGRAMA — Gantt Chart (Frappe Gantt)
// ══════════════════════════════════════════

let cronTarefas = [];
let cronGantt = null;
let cronObraFiltro = '';
let cronViewMode = 'Week';

async function renderCronograma() {
  const container = document.getElementById('cronograma-container');
  if (!container) return;

  // Header com filtro de obra e controles
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
      <button onclick="cronAbrirModal()" class="btn-save" style="padding:8px 16px;font-size:12px;">+ TAREFA</button>
    </div>
    <div id="cron-gantt-wrap" style="overflow-x:auto;background:rgba(255,255,255,0.02);border-radius:12px;border:1px solid rgba(255,255,255,0.06);min-height:200px;"></div>
    <div id="cron-vazio" class="hidden" style="text-align:center;padding:60px 20px;color:var(--texto3);">
      <div style="font-size:32px;margin-bottom:12px;">📅</div>
      <div style="font-size:14px;margin-bottom:6px;">Nenhuma tarefa no cronograma</div>
      <div style="font-size:12px;">Clique em <strong>+ TAREFA</strong> para adicionar etapas da obra</div>
    </div>
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

function cronRenderGantt() {
  const wrap = document.getElementById('cron-gantt-wrap');
  const vazio = document.getElementById('cron-vazio');
  if (!wrap) return;

  if (cronTarefas.length === 0) {
    wrap.style.display = 'none';
    if (vazio) vazio.classList.remove('hidden');
    cronGantt = null;
    return;
  }

  wrap.style.display = '';
  if (vazio) vazio.classList.add('hidden');

  // Mapear tarefas pro formato Frappe Gantt
  const tasks = cronTarefas.map(t => {
    const obraNome = obras.find(o => o.id === t.obra_id)?.nome || '';
    return {
      id: t.id,
      name: obraNome ? `${obraNome} — ${t.nome}` : t.nome,
      start: t.data_inicio,
      end: t.data_fim,
      progress: Number(t.progresso) || 0,
      dependencies: t.dependencia || '',
      custom_class: 'cron-bar'
    };
  });

  wrap.innerHTML = '<svg id="cron-gantt-svg"></svg>';

  try {
    cronGantt = new Gantt('#cron-gantt-svg', tasks, {
      view_mode: cronViewMode,
      date_format: 'YYYY-MM-DD',
      language: 'pt-br',
      on_click: task => cronAbrirModal(task.id),
      on_date_change: (task, start, end) => cronAtualizarDatas(task.id, start, end),
      on_progress_change: (task, progress) => cronAtualizarProgresso(task.id, progress),
      custom_popup_html: task => {
        const t = cronTarefas.find(x => x.id === task.id);
        const obraNome = t ? (obras.find(o => o.id === t.obra_id)?.nome || '') : '';
        return `<div class="cron-popup">
          <div style="font-weight:700;margin-bottom:4px;">${task.name}</div>
          ${obraNome ? `<div style="font-size:11px;color:#8b8fa0;margin-bottom:4px;">🏗 ${obraNome}</div>` : ''}
          <div style="font-size:12px;">${formatDateBR(task._start)} → ${formatDateBR(task._end)}</div>
          <div style="font-size:12px;margin-top:2px;">Progresso: ${Math.round(task.progress)}%</div>
        </div>`;
      }
    });
  } catch(e) {
    wrap.innerHTML = '<div style="padding:20px;color:var(--texto3);text-align:center;">Erro ao renderizar cronograma</div>';
  }
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

  // Tarefas da mesma obra pra dependência
  const depOpts = cronTarefas
    .filter(x => x.id !== editId)
    .map(x => {
      const oNome = obras.find(o => o.id === x.obra_id)?.nome || '';
      return `<option value="${x.id}" ${t && t.dependencia === x.id ? 'selected' : ''}>${oNome ? oNome + ' — ' : ''}${x.nome}</option>`;
    }).join('');

  const hoje = new Date().toISOString().split('T')[0];
  const em30 = new Date(Date.now() + 30*86400000).toISOString().split('T')[0];

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
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
      <div class="field"><label>PROGRESSO (%)</label><input type="number" id="cron-progresso" min="0" max="100" value="${t ? Math.round(t.progresso) : 0}"></div>
      <div class="field"><label>DEPENDE DE</label>
        <select id="cron-dep" style="width:100%;padding:10px 14px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;color:var(--branco);font-size:14px;outline:none;font-family:inherit;">
          <option value="">Nenhuma</option>
          ${depOpts}
        </select>
      </div>
    </div>
    <div style="display:flex;gap:8px;margin-top:4px;">
      <button class="btn-save" onclick="cronSalvar()" style="flex:1;">SALVAR</button>
      ${t ? `<button class="btn-outline" onclick="cronExcluir('${editId}')" style="color:#ef4444;border-color:rgba(239,68,68,0.3);">EXCLUIR</button>` : ''}
      <button class="btn-outline" onclick="fecharModal('cron-tarefa')">CANCELAR</button>
    </div>
  `;

  // Reusar modal genérico ou criar dinâmico
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
}

async function cronSalvar() {
  const editId = document.getElementById('cron-edit-id').value;
  const obra = document.getElementById('cron-obra').value;
  const nome = document.getElementById('cron-nome').value.trim();
  const inicio = document.getElementById('cron-inicio').value;
  const fim = document.getElementById('cron-fim').value;
  const progresso = Number(document.getElementById('cron-progresso').value) || 0;
  const dep = document.getElementById('cron-dep').value || null;

  if (!obra || !nome || !inicio || !fim) { showToast('Preencha obra, tarefa, início e fim'); return; }
  if (fim < inicio) { showToast('Data fim deve ser após início'); return; }

  const dados = {
    obra_id: obra,
    nome: nome,
    data_inicio: inicio,
    data_fim: fim,
    progresso: progresso,
    dependencia: dep
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

// ── Template rápido: criar etapas padrão pra uma obra ────

function cronGerarEtapas() {
  const obraId = document.getElementById('cron-filtro-obra')?.value;
  if (!obraId) { showToast('Selecione uma obra primeiro'); return; }

  const obra = obras.find(o => o.id === obraId);
  if (!obra) return;

  const etapasBase = [
    { nome: 'Serviços Preliminares', dias: 15 },
    { nome: 'Fundação', dias: 30 },
    { nome: 'Estrutura', dias: 45 },
    { nome: 'Alvenaria', dias: 30 },
    { nome: 'Cobertura', dias: 15 },
    { nome: 'Instalações Elétricas', dias: 20 },
    { nome: 'Instalações Hidráulicas', dias: 20 },
    { nome: 'Revestimento Argamassa', dias: 25 },
    { nome: 'Revestimento Cerâmico', dias: 20 },
    { nome: 'Esquadrias', dias: 10 },
    { nome: 'Pintura', dias: 15 },
    { nome: 'Acabamento Final', dias: 15 },
    { nome: 'Limpeza e Entrega', dias: 7 }
  ];

  // Verificar se já tem etapas pra essa obra
  const existentes = cronTarefas.filter(t => t.obra_id === obraId);
  if (existentes.length > 0) {
    if (!confirm(`Já existem ${existentes.length} tarefas pra ${obra.nome}. Adicionar etapas padrão mesmo assim?`)) return;
  }

  cronAbrirModalEtapas(obraId, etapasBase);
}

function cronAbrirModalEtapas(obraId, etapas) {
  const obra = obras.find(o => o.id === obraId);
  const hoje = new Date().toISOString().split('T')[0];

  const html = `
    <div class="modal-title"><span>⚡ GERAR CRONOGRAMA</span> <button class="modal-close" onclick="fecharModal('cron-etapas')">✕</button></div>
    <div style="font-size:12px;color:var(--texto2);margin-bottom:12px;padding:8px;background:rgba(74,222,128,0.05);border:1px solid rgba(74,222,128,0.1);border-radius:8px;">
      Gerar ${etapas.length} etapas padrão para <strong>${obra?.nome || ''}</strong>.<br>As datas são sequenciais a partir da data de início.
    </div>
    <div class="field"><label>DATA DE INÍCIO DA OBRA</label><input type="date" id="cron-etapas-inicio" value="${hoje}"></div>
    <div style="max-height:300px;overflow-y:auto;margin:8px 0;">
      ${etapas.map((e, i) => `
        <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.04);">
          <input type="checkbox" id="cron-et-${i}" checked style="accent-color:#4ade80;">
          <label for="cron-et-${i}" style="flex:1;font-size:13px;color:var(--texto1);cursor:pointer;">${e.nome}</label>
          <span style="font-size:11px;color:var(--texto3);">${e.dias}d</span>
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
    modal.style.maxWidth = '500px';
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  }
  overlay.querySelector('.modal').innerHTML = html;
  overlay.classList.remove('hidden');

  // Guardar etapas no window pra callback
  window._cronEtapasBase = etapas;
}

async function cronSalvarEtapas(obraId) {
  const inicioStr = document.getElementById('cron-etapas-inicio')?.value;
  if (!inicioStr) { showToast('Informe a data de início'); return; }

  const etapas = window._cronEtapasBase || [];
  let dataAtual = new Date(inicioStr + 'T00:00:00');
  let criadas = 0;
  let anteriorId = null;

  for (let i = 0; i < etapas.length; i++) {
    const check = document.getElementById(`cron-et-${i}`);
    if (!check?.checked) continue;

    const inicio = dataAtual.toISOString().split('T')[0];
    dataAtual.setDate(dataAtual.getDate() + etapas[i].dias);
    const fim = dataAtual.toISOString().split('T')[0];

    try {
      const r = await sbPost('cronograma_tarefas', {
        obra_id: obraId,
        nome: etapas[i].nome,
        data_inicio: inicio,
        data_fim: fim,
        progresso: 0,
        dependencia: anteriorId,
        ordem: i
      });
      if (r && r[0]?.id) anteriorId = r[0].id;
      criadas++;
    } catch(e) {}
  }

  showToast(`${criadas} etapas criadas`);
  fecharModal('cron-etapas');
  await cronCarregarTarefas();
}
