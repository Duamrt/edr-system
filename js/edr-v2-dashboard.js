// ══════════════════════════════════════════════════════════════════
// EDR System V2 — Modulo: DASHBOARD
// Depende: api.js, utils.js, config.js, obras.js (ETAPAS,
//          etapaLabel, etapaCor), notas.js (lancamentos),
//          custos.js (CustosModule), estoque.js (EstoqueModule),
//          adicionais.js, auth.js, relatorio.js (getCatFromLanc),
//          diarias.js (DiariasModule), banco.js
// ══════════════════════════════════════════════════════════════════

const DashboardModule = {
  agendaNotas: [],
  agendaSemanaOffset: 0,
  agendaAutorCores: {},
  finFiltro: null,       // null=geral, 'YYYY-MM'=mes
  currentTab: 0,
  _tabCount: 3,          // mobile
  _deskTabCount: 2,      // desktop
};

const _AGENDA_CORES = ['#2D6A4F','#3498db','#a855f7','#f59e0b','#ef4444','#06b6d4','#ec4899','#84cc16'];

// ── HELPERS ────────────────────────────────────────────────────

function _dashGetRepassesCef() {
  if (typeof repassesCef !== 'undefined' && repassesCef.length) return repassesCef;
  return typeof CustosModule !== 'undefined' && CustosModule.repassesCef.length ? CustosModule.repassesCef : [];
}

function _dashFmtR(v, abrev) {
  const n = Number(v) || 0;
  if (abrev && Math.abs(n) >= 1000) return 'R$ ' + (n / 1000).toFixed(1) + 'k';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function _dashGetCorAutor(nome) {
  if (!nome) return '#2D6A4F';
  const key = nome.toLowerCase();
  if (!DashboardModule.agendaAutorCores[key]) {
    const idx = Object.keys(DashboardModule.agendaAutorCores).length % _AGENDA_CORES.length;
    DashboardModule.agendaAutorCores[key] = _AGENDA_CORES[idx];
  }
  return DashboardModule.agendaAutorCores[key];
}

// ── AGENDA NOTAS ──────────────────────────────────────────────

async function loadAgendaNotas() {
  try {
    const r = await sbGet('agenda_notas', '?order=data.desc,criado_em.desc&limit=20');
    DashboardModule.agendaNotas = Array.isArray(r) ? r : [];
  } catch (e) { DashboardModule.agendaNotas = []; }
}

function _dashBuildAgenda() {
  const DIAS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const inicioSemana = new Date(hoje);
  inicioSemana.setDate(hoje.getDate() - hoje.getDay() + 1 + (DashboardModule.agendaSemanaOffset * 7));

  const dias = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(inicioSemana);
    d.setDate(inicioSemana.getDate() + i);
    const iso = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const notas = DashboardModule.agendaNotas.filter(n => n.data === iso);
    const isHoje = iso === hojeISO();
    dias.push({ date: d, iso, notas, isHoje, diaSemana: DIAS[d.getDay()], dia: d.getDate() });
  }

  const mesLabel = inicioSemana.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  const diasHTML = dias.map(d => {
    const previewHTML = d.notas.length ? d.notas.slice(0, 2).map(n => {
      const cor = _dashGetCorAutor(n.autor);
      return `<div style="display:flex;gap:4px;align-items:flex-start;margin-top:3px;">
        <div style="width:3px;height:12px;border-radius:2px;background:${cor};flex-shrink:0;margin-top:1px;"></div>
        <div style="font-size:9px;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:Inter,sans-serif;">${esc(n.texto)}</div>
      </div>`;
    }).join('') + (d.notas.length > 2 ? '<div style="font-size:8px;color:var(--text-tertiary);margin-top:2px;font-family:Inter,sans-serif;">+' + (d.notas.length - 2) + ' mais</div>' : '') : '';

    const clickAction = d.notas.length ? `dashAbrirDiaAgenda('${d.iso}')` : `dashAbrirModalNota('${d.iso}')`;

    return `<div style="min-height:60px;background:${d.isHoje ? 'rgba(45,106,79,0.06)' : 'var(--surface-alt)'};border:1px solid ${d.isHoje ? 'rgba(45,106,79,0.3)' : 'var(--border)'};border-radius:10px;padding:8px;cursor:pointer;transition:all .15s;" onclick="${clickAction}">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div>
          <span style="font-size:9px;font-weight:700;color:${d.isHoje ? '#2D6A4F' : 'var(--text-tertiary)'};letter-spacing:0.5px;font-family:'Space Grotesk',monospace;">${d.diaSemana}</span>
          <span style="font-size:13px;font-weight:800;color:${d.isHoje ? '#2D6A4F' : 'var(--text-primary)'};margin-left:4px;font-family:'Plus Jakarta Sans',sans-serif;">${d.dia}</span>
        </div>
        ${d.notas.length ? '<span style="font-size:8px;font-weight:700;background:rgba(45,106,79,0.15);color:#2D6A4F;padding:1px 5px;border-radius:6px;">' + d.notas.length + '</span>' : ''}
      </div>
      ${previewHTML}
    </div>`;
  }).join('');

  return `<div style="background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:22px;margin-bottom:16px;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
      <div style="display:flex;align-items:center;gap:10px;">
        <button onclick="DashboardModule.agendaSemanaOffset--;renderDashboard()" style="background:none;border:1px solid var(--border);color:var(--text-tertiary);width:32px;height:32px;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;"><span class="material-symbols-outlined" style="font-size:18px;">chevron_left</span></button>
        <div>
          <div style="font-size:13px;font-weight:700;color:var(--text-primary);font-family:'Plus Jakarta Sans',sans-serif;display:flex;align-items:center;gap:6px;"><span class="material-symbols-outlined" style="font-size:18px;color:#2D6A4F;">calendar_month</span> Agenda</div>
          <div style="font-size:10px;color:var(--text-tertiary);text-transform:capitalize;font-family:Inter,sans-serif;">${mesLabel}</div>
        </div>
        <button onclick="DashboardModule.agendaSemanaOffset++;renderDashboard()" style="background:none;border:1px solid var(--border);color:var(--text-tertiary);width:32px;height:32px;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;"><span class="material-symbols-outlined" style="font-size:18px;">chevron_right</span></button>
      </div>
      <div style="display:flex;gap:6px;align-items:center;">
        ${DashboardModule.agendaSemanaOffset !== 0 ? '<button onclick="DashboardModule.agendaSemanaOffset=0;renderDashboard()" style="padding:4px 10px;border-radius:6px;border:1px solid var(--border);background:transparent;color:var(--text-tertiary);font-size:10px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif;">HOJE</button>' : ''}
        <button onclick="dashAbrirModalNota()" style="padding:5px 12px;border-radius:8px;border:1px solid rgba(45,106,79,0.3);background:transparent;color:#2D6A4F;font-size:11px;font-weight:700;cursor:pointer;font-family:Inter,sans-serif;display:flex;align-items:center;gap:4px;"><span class="material-symbols-outlined" style="font-size:16px;">add</span> NOTA</button>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px;" id="agenda-semana-grid">${diasHTML}</div>
    <div style="display:flex;gap:12px;margin-top:10px;justify-content:center;" id="agenda-legenda"></div>
  </div>`;
}

function dashAbrirDiaAgenda(dataISO) {
  const notas = DashboardModule.agendaNotas.filter(n => n.data === dataISO);
  const dataFormatada = new Date(dataISO + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });

  const el = document.createElement('div');
  el.id = 'modal-nota-overlay';
  el.className = 'modal-overlay';
  el.onclick = function (e) { if (e.target === el) el.remove(); };

  const notasHTML = notas.map(n => {
    const cor = _dashGetCorAutor(n.autor);
    return `<div style="display:flex;gap:10px;padding:12px 0;border-bottom:1px solid var(--border);">
      <div style="width:4px;border-radius:2px;background:${cor};flex-shrink:0;"></div>
      <div style="flex:1;">
        <div style="font-size:13px;color:var(--text-primary);font-weight:600;line-height:1.5;font-family:Inter,sans-serif;">${esc(n.texto)}</div>
        <div style="font-size:10px;color:var(--text-tertiary);margin-top:4px;font-family:Inter,sans-serif;">
          <span style="color:${cor};font-weight:700;">${esc(n.autor || '—')}</span>${n.hora ? ' · ' + n.hora : ''}
        </div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0;">
        <button onclick="document.getElementById('modal-nota-overlay').remove();dashEditarNota('${n.id}')" style="background:none;border:1px solid var(--border);color:var(--text-tertiary);cursor:pointer;padding:4px 8px;border-radius:6px;display:flex;align-items:center;"><span class="material-symbols-outlined" style="font-size:16px;">edit</span></button>
        <button onclick="document.getElementById('modal-nota-overlay').remove();dashExcluirNota('${n.id}')" style="background:none;border:1px solid rgba(239,68,68,0.2);color:var(--danger);cursor:pointer;padding:4px 8px;border-radius:6px;display:flex;align-items:center;"><span class="material-symbols-outlined" style="font-size:16px;">delete</span></button>
      </div>
    </div>`;
  }).join('');

  el.innerHTML = `<div class="modal" style="max-width:420px;">
    <div class="modal-title">
      <span style="text-transform:capitalize;display:flex;align-items:center;gap:8px;font-family:'Plus Jakarta Sans',sans-serif;"><span class="material-symbols-outlined" style="font-size:20px;color:#2D6A4F;">calendar_today</span> ${dataFormatada}</span>
      <button class="modal-close" onclick="document.getElementById('modal-nota-overlay').remove()"><span class="material-symbols-outlined">close</span></button>
    </div>
    <div style="max-height:50vh;overflow-y:auto;">${notasHTML}</div>
    <button class="btn-save" style="margin-top:12px;display:flex;align-items:center;justify-content:center;gap:6px;" onclick="document.getElementById('modal-nota-overlay').remove();dashAbrirModalNota('${dataISO}')"><span class="material-symbols-outlined" style="font-size:18px;">add</span> NOVA ANOTACAO</button>
  </div>`;

  document.body.appendChild(el);
}

function dashAbrirModalNota(dataPre) {
  const autor = typeof usuarioAtual !== 'undefined' ? (usuarioAtual?.nome || 'Duam') : 'Duam';
  const hoje = dataPre || hojeISO();

  const el = document.createElement('div');
  el.id = 'modal-nota-overlay';
  el.className = 'modal-overlay';
  el.onclick = function (e) { if (e.target === el) el.remove(); };

  el.innerHTML = `<div class="modal" style="max-width:380px;">
    <div class="modal-title"><span style="display:flex;align-items:center;gap:8px;font-family:'Plus Jakarta Sans',sans-serif;"><span class="material-symbols-outlined" style="font-size:20px;color:#2D6A4F;">edit_note</span> Nova Anotacao</span><button class="modal-close" onclick="document.getElementById('modal-nota-overlay').remove()"><span class="material-symbols-outlined">close</span></button></div>
    <div class="field"><label>ANOTACAO *</label><textarea id="nota-texto" rows="3" placeholder="Ex: Ligar pra Dayana sobre reboco" style="width:100%;padding:10px;background:var(--surface-alt);border:1px solid var(--border);border-radius:8px;color:var(--text-primary);font-size:13px;font-family:Inter,sans-serif;resize:vertical;box-sizing:border-box;"></textarea></div>
    <div style="display:flex;gap:8px;">
      <div class="field" style="flex:1;"><label>DATA</label><input type="date" id="nota-data" value="${hoje}" style="width:100%;padding:10px;background:var(--surface-alt);border:1px solid var(--border);border-radius:8px;color:var(--text-primary);font-size:13px;font-family:Inter,sans-serif;box-sizing:border-box;"></div>
      <div class="field" style="flex:1;"><label>HORA</label><input type="time" id="nota-hora" style="width:100%;padding:10px;background:var(--surface-alt);border:1px solid var(--border);border-radius:8px;color:var(--text-primary);font-size:13px;font-family:Inter,sans-serif;box-sizing:border-box;"></div>
    </div>
    <input type="hidden" id="nota-autor" value="${esc(autor)}">
    <button class="btn-save" onclick="dashSalvarAgendaNota()">SALVAR</button>
  </div>`;

  document.body.appendChild(el);
  setTimeout(() => document.getElementById('nota-texto')?.focus(), 100);
}

async function dashSalvarAgendaNota() {
  const texto = document.getElementById('nota-texto').value.trim();
  const data = document.getElementById('nota-data').value;
  const hora = document.getElementById('nota-hora').value || null;
  const autor = document.getElementById('nota-autor').value;
  if (!texto) { showToast('Digite a anotacao.'); return; }

  try {
    const nova = await sbPost('agenda_notas', { texto, data, hora, autor });
    if (!nova) { showToast('Erro ao salvar a anotacao — tente de novo.'); return; }  // nao fecha modal (preserva texto), nao recarrega
    document.getElementById('modal-nota-overlay')?.remove();
    await loadAgendaNotas();
    renderDashboard();
    showToast('Anotacao salva!');
  } catch (e) {
    console.error(e);
    showToast('Erro ao salvar anotacao.');
  }
}

function dashEditarNota(id) {
  const nota = DashboardModule.agendaNotas.find(n => n.id === id);
  if (!nota) return;

  const el = document.createElement('div');
  el.id = 'modal-nota-overlay';
  el.className = 'modal-overlay';
  el.onclick = function (e) { if (e.target === el) el.remove(); };

  el.innerHTML = `<div class="modal" style="max-width:380px;">
    <div class="modal-title"><span style="display:flex;align-items:center;gap:8px;font-family:'Plus Jakarta Sans',sans-serif;"><span class="material-symbols-outlined" style="font-size:20px;color:#2D6A4F;">edit</span> Editar Anotacao</span><button class="modal-close" onclick="document.getElementById('modal-nota-overlay').remove()"><span class="material-symbols-outlined">close</span></button></div>
    <div class="field"><label>ANOTACAO *</label><textarea id="nota-texto" rows="3" style="width:100%;padding:10px;background:var(--surface-alt);border:1px solid var(--border);border-radius:8px;color:var(--text-primary);font-size:13px;font-family:Inter,sans-serif;resize:vertical;box-sizing:border-box;">${esc(nota.texto)}</textarea></div>
    <div style="display:flex;gap:8px;">
      <div class="field" style="flex:1;"><label>DATA</label><input type="date" id="nota-data" value="${nota.data || ''}" style="width:100%;padding:10px;background:var(--surface-alt);border:1px solid var(--border);border-radius:8px;color:var(--text-primary);font-size:13px;font-family:Inter,sans-serif;box-sizing:border-box;"></div>
      <div class="field" style="flex:1;"><label>HORA</label><input type="time" id="nota-hora" value="${nota.hora || ''}" style="width:100%;padding:10px;background:var(--surface-alt);border:1px solid var(--border);border-radius:8px;color:var(--text-primary);font-size:13px;font-family:Inter,sans-serif;box-sizing:border-box;"></div>
    </div>
    <input type="hidden" id="nota-edit-id" value="${id}">
    <button class="btn-save" onclick="dashSalvarNotaEdit()">SALVAR</button>
  </div>`;

  document.body.appendChild(el);
  setTimeout(() => document.getElementById('nota-texto')?.focus(), 100);
}

async function dashSalvarNotaEdit() {
  const id = document.getElementById('nota-edit-id').value;
  const texto = document.getElementById('nota-texto').value.trim();
  const data = document.getElementById('nota-data').value;
  const hora = document.getElementById('nota-hora').value || null;
  if (!texto) { showToast('Digite a anotacao.'); return; }

  try {
    const atualizada = await sbPatch('agenda_notas', '?id=eq.' + id, { texto, data, hora });
    if (!atualizada) {  // null=erro HTTP | undefined=0 linhas (id sumiu/RLS) — nao fecha modal
      showToast(atualizada === null ? 'Erro ao atualizar.' : 'Anotacao nao encontrada — recarregue.');
      return;
    }
    document.getElementById('modal-nota-overlay')?.remove();
    await loadAgendaNotas();
    renderDashboard();
    showToast('Anotacao atualizada!');
  } catch (e) {
    console.error(e);
    showToast('Erro ao atualizar.');
  }
}

async function dashExcluirNota(id) {
  const ok = await confirmar('Excluir esta anotacao?', 'Essa acao nao pode ser desfeita.');
  if (!ok) return;
  try {
    const apagou = await sbDelete('agenda_notas', '?id=eq.' + id);  // 3-estados: >0 apagou | 0 nao existia | null erro
    if (apagou === null) { showToast('Erro ao excluir.'); return; }  // erro HTTP: NAO remove local
    DashboardModule.agendaNotas = DashboardModule.agendaNotas.filter(n => n.id !== id);
    renderDashboard();
    showToast(apagou ? 'Anotacao excluida.' : 'Anotacao ja nao existia — lista atualizada.');
  } catch (e) { showToast('Erro ao excluir.'); }
}

function _dashRenderAgendaLegenda() {
  const el = document.getElementById('agenda-legenda');
  if (!el) return;
  const autores = [...new Set(DashboardModule.agendaNotas.map(n => n.autor).filter(Boolean))];
  if (!autores.length && typeof usuarioAtual !== 'undefined' && usuarioAtual?.nome) autores.push(usuarioAtual.nome);
  el.innerHTML = autores.map(a =>
    '<div style="display:flex;align-items:center;gap:4px;font-size:9px;color:var(--text-tertiary);font-family:Inter,sans-serif;"><div style="width:8px;height:8px;border-radius:2px;background:' + _dashGetCorAutor(a) + ';"></div> ' + esc(a) + '</div>'
  ).join('');
}

// ── CALCULOS ──────────────────────────────────────────────────

function _dashCalcMetricas() {
  const reps = _dashGetRepassesCef();
  const obraAtivaIds = new Set(obras.map(o => o.id));
  const lancAtivos = lancamentos.filter(l => obraAtivaIds.has(l.obra_id));
  const custoTotal = lancAtivos.reduce((s, l) => s + Number(l.total || 0), 0);
  const totalPls = reps.filter(r => obraAtivaIds.has(r.obra_id) && (r.tipo || 'pls') === 'pls').reduce((s, r) => s + Number(r.valor || 0), 0);
  const totalEntradas = reps.filter(r => obraAtivaIds.has(r.obra_id) && r.tipo === 'entrada').reduce((s, r) => s + Number(r.valor || 0), 0);
  const totalTerreno = reps.filter(r => obraAtivaIds.has(r.obra_id) && r.tipo === 'terreno').reduce((s, r) => s + Number(r.valor || 0), 0);
  const totalRecebido = totalPls + totalEntradas + totalTerreno;
  const valorVendaTotal = obras.reduce((s, o) => s + Number(o.valor_venda || 0), 0);
  const addGeral = typeof getAdicionaisGeral === 'function' ? getAdicionaisGeral(obraAtivaIds) : { valorTotal: 0, totalRecebido: 0 };
  const receitaTotal = valorVendaTotal + addGeral.valorTotal;
  const lucroGeral = receitaTotal - custoTotal;
  const margemGeral = receitaTotal > 0 ? (lucroGeral / receitaTotal * 100) : 0;
  return { obraAtivaIds, lancAtivos, custoTotal, totalRecebido, valorVendaTotal, addGeral, receitaTotal, lucroGeral, margemGeral };
}

function _dashCalcPorObra(lancAtivos) {
  const reps = _dashGetRepassesCef();
  return obras.map(o => {
    const ls = lancAtivos.filter(l => l.obra_id === o.id);
    const custo = ls.reduce((s, l) => s + Number(l.total || 0), 0);
    const vv = Number(o.valor_venda || 0);
    const adds = typeof getAdicionaisObra === 'function' ? getAdicionaisObra(o.id) : { qtd: 0, valorTotal: 0, totalRecebido: 0 };
    const receitaObra = vv + adds.valorTotal;
    const repsObra = reps.filter(r => r.obra_id === o.id);
    const receb = repsObra.reduce((s, r) => s + Number(r.valor || 0), 0);
    const lucro = receitaObra - custo;
    const margem = receitaObra > 0 ? (lucro / receitaObra * 100) : 0;
    const entradas = receb + (adds.totalRecebido || 0);
    const pctReceb = receitaObra > 0 ? Math.min(entradas / receitaObra * 100, 100) : null;
    return { nome: o.nome, id: o.id, custo, vv, receb, lucro, margem, qtd: ls.length, adds, pctReceb };
  }).filter(o => o.qtd > 0 || o.vv > 0).sort((a, b) => b.custo - a.custo);
}

function _dashCalcEtapas(lancAtivos) {
  const etapaMap = {};
  lancAtivos.forEach(l => {
    const lb = etapaLabel(l.etapa || '36_outros');
    etapaMap[lb] = (etapaMap[lb] || 0) + Number(l.total || 0);
  });
  return Object.entries(etapaMap).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 8);
}

// ── DASHBOARD OPERADOR ────────────────────────────────────────

function _dashRenderOperador() {
  const el = document.getElementById('oper-welcome');
  if (!el) return;
  el.classList.remove('hidden');

  const now = new Date();
  const dataStr = now.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
  const horaStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const obrasAtivas = obras.map(o => {
    const ls = lancamentos.filter(l => l.obra_id === o.id);
    return { ...o, qtd: ls.length };
  }).filter(o => o.qtd > 0).sort((a, b) => b.qtd - a.qtd);

  const estoqueDisp = typeof consolidarEstoque === 'function'
    ? consolidarEstoque().filter(m => m.saldo > 0.01).sort((a, b) => b.saldo - a.saldo).slice(0, 8).map(m => [m.desc, { qtd: m.saldo, un: m.unidade }])
    : [];

  const obraMap = {};
  obras.forEach(o => obraMap[o.id] = o.nome);
  const ultimos = [...lancamentos].sort((a, b) => (b.data || '') > (a.data || '') ? 1 : -1).slice(0, 8);

  el.innerHTML = `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:18px 20px;margin-bottom:12px;">
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <div>
          <div style="font-family:'Plus Jakarta Sans',sans-serif;font-size:20px;font-weight:700;color:var(--text-primary);">Ola, ${esc(typeof usuarioAtual !== 'undefined' ? usuarioAtual?.nome || '' : '')}!</div>
          <div style="font-size:11px;color:var(--text-tertiary);margin-top:4px;font-family:'Space Grotesk',monospace;text-transform:capitalize;">${dataStr} · ${horaStr}</div>
        </div>
        <div style="display:flex;gap:10px;">
          <button onclick="setView('form')" style="background:rgba(45,106,79,0.08);border:1px solid rgba(45,106,79,0.15);color:#2D6A4F;border-radius:10px;padding:10px 16px;font-family:'Plus Jakarta Sans',sans-serif;font-weight:700;font-size:12px;letter-spacing:1px;cursor:pointer;display:flex;align-items:center;gap:6px;"><span class="material-symbols-outlined" style="font-size:18px;">add_circle</span> LANCAR NF</button>
          <button onclick="setView('estoque')" style="background:rgba(139,92,246,0.1);border:1px solid rgba(139,92,246,0.25);color:#a78bfa;border-radius:10px;padding:10px 16px;font-family:'Plus Jakarta Sans',sans-serif;font-weight:700;font-size:12px;letter-spacing:1px;cursor:pointer;display:flex;align-items:center;gap:6px;"><span class="material-symbols-outlined" style="font-size:18px;">inventory_2</span> ESTOQUE</button>
        </div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
      ${_dashBuildObrasAtivas(obrasAtivas)}
      ${_dashBuildEstoqueDisp(estoqueDisp)}
    </div>
    ${_dashBuildUltimosLanc(ultimos, obraMap)}`;
}

function _dashBuildObrasAtivas(obrasAtivas) {
  return `<div style="background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:16px;">
    <div style="font-family:'Plus Jakarta Sans',sans-serif;font-size:13px;font-weight:700;color:#2D6A4F;letter-spacing:2px;margin-bottom:12px;display:flex;align-items:center;gap:6px;"><span class="material-symbols-outlined" style="font-size:18px;">construction</span> Obras em Andamento</div>
    ${obrasAtivas.length ? obrasAtivas.map(o => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);">
        <span style="font-size:13px;color:var(--text-primary);font-weight:600;font-family:Inter,sans-serif;">${esc(o.nome)}</span>
        <span style="font-size:10px;color:var(--text-tertiary);font-family:'Space Grotesk',monospace;background:var(--surface-alt);padding:2px 8px;border-radius:10px;">${o.qtd} lanc.</span>
      </div>`).join('') :
    '<div style="color:var(--text-tertiary);font-size:12px;padding:8px 0;font-family:Inter,sans-serif;">Nenhuma obra ativa.</div>'}
  </div>`;
}

function _dashBuildEstoqueDisp(estoqueDisp) {
  return `<div style="background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:16px;">
    <div style="font-family:'Plus Jakarta Sans',sans-serif;font-size:13px;font-weight:700;color:#a78bfa;letter-spacing:2px;margin-bottom:12px;display:flex;align-items:center;gap:6px;"><span class="material-symbols-outlined" style="font-size:18px;">inventory_2</span> Estoque Disponivel</div>
    ${estoqueDisp.length ? estoqueDisp.map(([nome, v]) => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);">
        <span style="font-size:12px;color:var(--text-primary);font-weight:500;font-family:Inter,sans-serif;">${esc(nome)}</span>
        <span style="font-size:11px;font-weight:700;color:#a78bfa;font-family:'Space Grotesk',monospace;">${v.qtd % 1 === 0 ? v.qtd : v.qtd.toFixed(2)} ${esc(v.un)}</span>
      </div>`).join('') :
    '<div style="color:var(--text-tertiary);font-size:12px;padding:8px 0;font-family:Inter,sans-serif;">Sem estoque disponivel.</div>'}
  </div>`;
}

function _dashBuildUltimosLanc(ultimos, obraMap) {
  if (!ultimos.length) return '';
  return `<div style="background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:16px;">
    <div style="font-family:'Plus Jakarta Sans',sans-serif;font-size:13px;font-weight:700;color:#3b82f6;letter-spacing:2px;margin-bottom:12px;display:flex;align-items:center;gap:6px;"><span class="material-symbols-outlined" style="font-size:18px;">history</span> Ultimos Lancamentos</div>
    ${ultimos.map(l => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--border);">
        <div>
          <div style="font-size:13px;color:var(--text-primary);font-weight:600;font-family:Inter,sans-serif;">${esc(l.descricao)}</div>
          <div style="font-size:10px;color:var(--text-tertiary);margin-top:2px;font-family:'Space Grotesk',monospace;">${esc(obraMap[l.obra_id] || '—')} · ${l.data || ''}</div>
        </div>
        <span style="font-size:10px;color:var(--text-tertiary);background:var(--surface-alt);padding:2px 8px;border-radius:10px;font-family:'Space Grotesk',monospace;white-space:nowrap;">${Number(l.qtd || 1) % 1 === 0 ? Number(l.qtd || 1) : Number(l.qtd || 1).toFixed(2)} ${esc(l.unidade || 'UN')}</span>
      </div>`).join('')}
  </div>`;
}

// ── KPIs ──────────────────────────────────────────────────────

function _dashBuildTopoGerencial(c, oh, carteiraAtiva) {
  // Fallback defensivo: se a API do DRE não respondeu, não quebra o Painel.
  if (!c) return `<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:16px;color:var(--text-tertiary);font-size:12px;font-family:Inter,sans-serif;">Resumo gerencial indisponível — abra o DRE uma vez.</div>`;

  const corRes = c.resultado >= 0 ? 'var(--success)' : 'var(--danger)';
  const margem = (typeof c.mBruta === 'number' ? c.mBruta : 0).toFixed(1);
  const foraOh = oh ? Number(oh.foraResultado || 0) : 0;

  const cardDRE = (label, valor, cor, sub) => `
    <div style="background:var(--surface);border:1px solid var(--border);border-top:3px solid ${cor};border-radius:12px;padding:14px 15px;">
      <div style="font-size:10px;color:var(--text-tertiary);font-weight:700;letter-spacing:.5px;text-transform:uppercase;font-family:Inter,sans-serif;">${label}</div>
      <div style="font-size:20px;font-weight:800;font-family:'Space Grotesk',monospace;color:${cor};letter-spacing:-.5px;margin-top:5px;line-height:1.1;">${valor}</div>
      <div style="font-size:10px;color:var(--text-tertiary);margin-top:4px;font-family:Inter,sans-serif;">${sub}</div>
    </div>`;

  const cardCarteira = `
    <div style="background:var(--surface);border:1px dashed var(--border);border-radius:12px;padding:14px 15px;">
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
        <span style="font-size:10px;color:var(--text-tertiary);font-weight:700;letter-spacing:.5px;text-transform:uppercase;font-family:Inter,sans-serif;">Carteira contratada ativa</span>
        <span style="font-size:8px;background:var(--text-tertiary);color:var(--surface);padding:1px 5px;border-radius:5px;font-weight:800;letter-spacing:.5px;font-family:Inter,sans-serif;">COMERCIAL</span>
      </div>
      <div style="font-size:20px;font-weight:800;font-family:'Space Grotesk',monospace;color:var(--text-secondary);letter-spacing:-.5px;margin-top:5px;line-height:1.1;">${fmt(carteiraAtiva)}</div>
      <div style="font-size:10px;color:var(--text-tertiary);margin-top:4px;font-family:Inter,sans-serif;">contratos ativos, não realizado</div>
    </div>`;

  const cols = window.innerWidth <= 768 ? 2 : 4;
  return `<div style="margin-bottom:16px;">
    <div style="font-family:'Plus Jakarta Sans',sans-serif;font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:10px;display:flex;align-items:center;gap:8px;"><span class="material-symbols-outlined" style="font-size:18px;color:#2D6A4F;">insights</span> Como estou agora <span style="font-size:10px;font-weight:700;color:var(--text-tertiary);letter-spacing:.5px;">· GERENCIAL (DRE)</span></div>
    <div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:10px;">
      ${cardDRE('Resultado (DRE)', fmt(c.resultado), corRes, 'margem ' + margem + '%')}
      ${cardDRE('Receita realizada', fmt(c.recBruta), '#2D6A4F', 'medições + adicionais')}
      ${cardDRE('Custo aplicado em obras', fmt(c.custoObras), 'var(--warning)', 'mão + material, sem escritório')}
      ${cardCarteira}
    </div>
    <div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:10px;font-size:11px;color:var(--text-tertiary);font-family:Inter,sans-serif;">
      <span>Overhead a classificar: <b style="color:var(--warning);font-family:'Space Grotesk',monospace;">${fmt(foraOh)}</b> <span style="opacity:.8;">(fora do resultado)</span></span>
    </div>
  </div>`;
}

// ── ONDE OLHAR HOJE (sub-lote C) — agrupa os blocos de ação JÁ EXISTENTES sob 1 cabeçalho.
// NÃO cria número/regra nova, NÃO altera a base de cada bloco — só reordena por prioridade e rotula.
function _dashBuildOndeOlhar(alertas) {
  const blocos = _dashBuildContasVencidas() + _dashBuildAlertas(alertas) + _dashBuildAcaoNecessaria();
  if (!blocos.trim()) return '';
  return `<div style="font-family:'Plus Jakarta Sans',sans-serif;font-size:13px;font-weight:700;color:var(--text-primary);margin:2px 0 10px;display:flex;align-items:center;gap:8px;"><span class="material-symbols-outlined" style="font-size:18px;color:var(--warning);">visibility</span> Onde olhar hoje</div>` + blocos;
}

// ── ALERTAS ──────────────────────────────────────────────────

function _dashBuildAlertas(alertas) {
  if (!alertas.length) return '';
  return `<div style="background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.2);border-radius:16px;padding:14px 16px;margin-bottom:14px;">
    <div style="font-family:'Plus Jakarta Sans',sans-serif;font-size:12px;font-weight:700;color:var(--danger);margin-bottom:2px;display:flex;align-items:center;gap:6px;"><span class="material-symbols-outlined" style="font-size:18px;">warning</span> Obras com contribuição negativa</div>
    <div style="font-size:10px;color:var(--text-tertiary);margin-bottom:8px;font-family:Inter,sans-serif;">base DRE: recebido + adicionais − custo</div>
    ${alertas.map(o => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(239,68,68,0.08);">
        <span style="font-size:12px;color:var(--text-primary);font-weight:600;cursor:pointer;font-family:Inter,sans-serif;" onclick="setView('custos');setTimeout(()=>custosAbrirDetalhe('${esc(o.id)}'),100)">${esc(o.nome)}</span>
        <div style="display:flex;gap:12px;align-items:center;">
          <span style="font-size:11px;color:var(--danger);font-weight:700;font-family:'Space Grotesk',monospace;">${o.margem.toFixed(1)}%</span>
          <span style="font-size:11px;color:var(--text-tertiary);font-family:'Space Grotesk',monospace;">Prejuizo: ${fmt(Math.abs(o.lucro))}</span>
        </div>
      </div>`).join('')}
  </div>`;
}

// ── CONTAS VENCIDAS ──────────────────────────────────────────

function _dashBuildContasVencidas() {
  if (typeof getContasVencidas !== 'function') return '';
  const vencidas = getContasVencidas();
  if (!vencidas.length) return '';
  const totalVenc = vencidas.reduce((s, c) => s + Number(c.valor || 0), 0);
  return `<div style="background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.2);border-radius:16px;padding:14px 16px;margin-top:14px;cursor:pointer;" onclick="setView('contas-pagar')">
    <div style="display:flex;align-items:center;justify-content:space-between;">
      <div>
        <div style="font-family:'Plus Jakarta Sans',sans-serif;font-size:12px;font-weight:700;color:var(--danger);letter-spacing:2px;display:flex;align-items:center;gap:6px;"><span class="material-symbols-outlined" style="font-size:18px;">notification_important</span> CONTAS VENCIDAS</div>
        <div style="font-size:13px;color:var(--text-primary);margin-top:4px;font-weight:600;font-family:Inter,sans-serif;">${vencidas.length} conta${vencidas.length > 1 ? 's' : ''} vencida${vencidas.length > 1 ? 's' : ''} — ${fmt(totalVenc)}</div>
      </div>
      <button style="padding:6px 14px;border-radius:8px;border:1px solid rgba(239,68,68,0.3);background:rgba(239,68,68,0.08);color:var(--danger);font-size:11px;font-weight:700;cursor:pointer;font-family:Inter,sans-serif;display:flex;align-items:center;gap:4px;"><span class="material-symbols-outlined" style="font-size:16px;">visibility</span> VER CONTAS</button>
    </div>
  </div>`;
}

// ── WIDGET ACAO NECESSARIA (GM IDEIA) ────────────────────────

function _dashBuildAcaoNecessaria() {
  const itens = [];

  // Contas a vencer nos proximos 3 dias
  if (typeof getContasAVencer === 'function') {
    const proximas = getContasAVencer(3);
    proximas.forEach(c => {
      itens.push({ icon: 'receipt_long', label: c.descricao || 'Conta', sub: 'Vence ' + (typeof fmtData === 'function' ? fmtData(c.data_vencimento) : c.data_vencimento), cor: 'var(--warning)', acao: "setView('contas-pagar')" });
    });
  }

  // NFs pendentes revisao (se existir tag)
  if (typeof lancamentos !== 'undefined') {
    const revisar = lancamentos.filter(l => l.status === 'REVISAR' || l._revisar).slice(0, 5);
    revisar.forEach(l => {
      itens.push({ icon: 'rate_review', label: l.descricao || 'NF para revisar', sub: obras.find(o => o.id === l.obra_id)?.nome || '—', cor: '#f59e0b', acao: "setView('form')" });
    });
  }

  if (!itens.length) return '';

  return `<div style="background:var(--surface);border:1px solid rgba(245,158,11,0.3);border-radius:16px;padding:16px;margin-bottom:14px;">
    <div style="font-family:'Plus Jakarta Sans',sans-serif;font-size:12px;font-weight:700;color:var(--warning);letter-spacing:2px;margin-bottom:10px;display:flex;align-items:center;gap:6px;"><span class="material-symbols-outlined" style="font-size:18px;">priority_high</span> ACAO NECESSARIA</div>
    ${itens.map(i => `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);cursor:pointer;" onclick="${i.acao}">
      <span class="material-symbols-outlined" style="font-size:20px;color:${i.cor};">${i.icon}</span>
      <div style="flex:1;">
        <div style="font-size:12px;color:var(--text-primary);font-weight:600;font-family:Inter,sans-serif;">${esc(i.label)}</div>
        <div style="font-size:10px;color:var(--text-tertiary);font-family:Inter,sans-serif;">${esc(i.sub)}</div>
      </div>
      <span class="material-symbols-outlined" style="font-size:16px;color:var(--text-tertiary);">chevron_right</span>
    </div>`).join('')}
  </div>`;
}

// ── SAUDE DAS OBRAS ──────────────────────────────────────────

function _dashBuildSaudeObras(porObra) {
  if (!porObra.length) return '';
  return `<div style="background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:16px;margin-bottom:14px;">
    <div style="font-size:13px;font-weight:700;color:var(--text-secondary);letter-spacing:0.5px;margin-bottom:12px;display:flex;align-items:center;gap:8px;font-family:'Plus Jakarta Sans',sans-serif;">
      <span style="width:6px;height:6px;border-radius:50%;background:#2D6A4F;"></span> Obras
    </div>
    ${porObra.map(o => {
    // pctReceb pode vir null (modo mensal) — esconde a barra nesse caso
    const pctReceb = (o.pctReceb === null || o.pctReceb === undefined)
      ? null
      : Math.min(o.pctReceb, 100);
    const corM = o.margem >= 15 ? '#2D6A4F' : o.margem >= 0 ? 'var(--warning)' : 'var(--danger)';
    const barra = pctReceb === null
      ? `<div style="width:80px;font-size:9px;color:var(--text-tertiary);text-align:center;font-family:'Space Grotesk',monospace;">—</div>`
      : `<div style="width:80px;height:4px;background:var(--border);border-radius:2px;overflow:hidden;flex-shrink:0;">
          <div style="width:${pctReceb}%;height:100%;background:#2D6A4F;border-radius:2px;"></div>
        </div>`;
    return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);cursor:pointer;" onclick="setView('custos');setTimeout(()=>custosAbrirDetalhe('${esc(o.id)}'),100)">
        <div style="flex:1;min-width:0;">
          <div style="font-size:12px;color:var(--text-primary);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:Inter,sans-serif;">${esc(o.nome)}</div>
        </div>
        ${barra}
        <span style="font-size:10px;font-weight:700;color:${corM};min-width:40px;text-align:right;font-family:'Space Grotesk',monospace;">${o.vv > 0 ? o.margem.toFixed(0) + '%' : '—'}</span>
      </div>`;
  }).join('')}
  </div>`;
}

// ── RESUMO FINANCEIRO ────────────────────────────────────────

function _dashFinMeses() {
  const meses = new Set();
  lancamentos.forEach(l => { if (l.data) meses.add(l.data.slice(0, 7)); });
  _dashGetRepassesCef().forEach(r => { if (r.data_credito) meses.add(r.data_credito.slice(0, 7)); });
  return [...meses].sort().reverse();
}

function dashFinSetFiltro(val) {
  DashboardModule.finFiltro = val || null;
  const m = _dashCalcMetricas();
  const porObra = _dashCalcPorObra(m.lancAtivos);
  const html = _dashBuildResumoFinanceiro(porObra);
  const elMob = document.getElementById('dash-page-1');
  const elDesk = document.getElementById('dash-dpage-1');
  if (elMob) elMob.innerHTML = html;
  if (elDesk) elDesk.innerHTML = html;
}

function _dashBuildResumoFinanceiro(porObra) {
  if (!porObra.length) return '';
  if (typeof calcularValorEstoque === 'function') calcularValorEstoque();

  const filtroMes = DashboardModule.finFiltro;
  let totalEntradas = 0, totalSaidas = 0, totalReceita = 0, totalMao = 0;

  // F1: exclui EDR-ESCRITÓRIO (interna) da visão de OBRAS via listarObrasReais — some da lista "Por obra" e dos totais de obras.
  const _idsReais = (window.DREModule && DREModule.listarObrasReais) ? new Set(DREModule.listarObrasReais().map(o => o.id)) : null;
  const obrasData = obras.filter(o => porObra.some(p => p.id === o.id) && (!_idsReais || _idsReais.has(o.id))).map(o => {
    const d = _dashFinCalcObra(o, filtroMes);
    totalEntradas += d.entradas;
    totalSaidas += d.custo;
    totalReceita += d.receita;
    totalMao += d.mao;
    return d;
  }).filter(d => d.custo > 0 || d.entradas > 0 || (!filtroMes && d.vv > 0));

  const saldoGeral = totalEntradas - totalSaidas;
  const lucroProjetado = totalReceita - totalSaidas;
  const margemProj = totalReceita > 0 ? (lucroProjetado / totalReceita * 100) : 0;
  const pctRecebGeral = totalReceita > 0 ? (totalEntradas / totalReceita * 100) : 0;

  const periodoLabel = filtroMes
    ? new Date(+filtroMes.slice(0, 4), +filtroMes.slice(5, 7) - 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase()
    : 'OBRAS ATIVAS';

  // Filtro bar
  const meses = _dashFinMeses();
  const atual = DashboardModule.finFiltro;
  const opts = meses.map(m => {
    const [a, mm] = m.split('-');
    const label = new Date(+a, +mm - 1).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }).toUpperCase();
    return `<option value="${m}" ${atual === m ? 'selected' : ''}>${label}</option>`;
  }).join('');

  const cardG = (icon, label, valor, cor, sub) => `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;position:relative;overflow:hidden;">
      <div style="position:absolute;top:10px;right:12px;opacity:0.12;"><span class="material-symbols-outlined" style="font-size:28px;color:${cor};">${icon}</span></div>
      <div style="font-size:10px;color:var(--text-tertiary);font-weight:700;letter-spacing:1.5px;margin-bottom:6px;font-family:'Space Grotesk',monospace;">${label}</div>
      <div style="font-size:22px;font-weight:800;color:${cor};font-family:'Space Grotesk',monospace;line-height:1;">${_dashFmtR(valor)}</div>
      <div style="font-size:10px;color:var(--text-tertiary);margin-top:6px;font-family:Inter,sans-serif;">${sub}</div>
    </div>`;

  const subEntradas = filtroMes ? 'Repasses do mes' : 'PLs + Entrada + Terreno';
  const subSaidas = 'Material: ' + _dashFmtR(totalSaidas - totalMao) + ' · Mao de obra: ' + _dashFmtR(totalMao) + ' · s/ admin/impostos';

  let html = `<div style="margin-bottom:20px;">
    <div style="font-size:13px;font-weight:700;color:#2D6A4F;letter-spacing:2px;margin-bottom:14px;font-family:'Plus Jakarta Sans',sans-serif;display:flex;align-items:center;gap:8px;"><span class="material-symbols-outlined" style="font-size:20px;">bar_chart</span> RESUMO FINANCEIRO — ${periodoLabel}</div>
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;flex-wrap:wrap;">
      <button onclick="dashFinSetFiltro(null)" style="padding:6px 14px;border-radius:8px;border:1px solid ${!atual ? '#2D6A4F' : 'var(--border)'};background:${!atual ? 'rgba(45,106,79,0.12)' : 'transparent'};color:${!atual ? '#2D6A4F' : 'var(--text-tertiary)'};font-size:11px;font-weight:700;cursor:pointer;font-family:Inter,sans-serif;">GERAL</button>
      <select onchange="dashFinSetFiltro(this.value||null)" style="padding:6px 10px;border-radius:8px;border:1px solid ${atual ? '#2D6A4F' : 'var(--border)'};background:${atual ? 'rgba(45,106,79,0.12)' : 'var(--surface)'};color:${atual ? '#2D6A4F' : 'var(--text-tertiary)'};font-size:11px;font-weight:700;font-family:Inter,sans-serif;cursor:pointer;">
        <option value="">MENSAL</option>${opts}
      </select>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin-bottom:14px;">
      ${cardG('trending_up', filtroMes ? 'RECEBIDO NO MES' : 'RECEBIDO', totalEntradas, 'var(--success)', subEntradas)}
      ${cardG('trending_down', filtroMes ? 'APLICADO NO MES' : 'APLICADO NAS OBRAS', totalSaidas, 'var(--danger)', subSaidas)}
      ${filtroMes ? cardG('account_balance', 'DISPONIVEL NO MES', saldoGeral, saldoGeral >= 0 ? 'var(--success)' : 'var(--danger)', 'Recebido - Aplicado no periodo') : cardG('account_balance_wallet', 'FALTA RECEBER', totalReceita - totalEntradas, '#3b82f6', 'Receita: ' + _dashFmtR(totalReceita))}
    </div>`;

  // Barra progresso (modo geral)
  if (!filtroMes) {
    html += `<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:14px;">
      <div style="font-size:10px;color:var(--text-tertiary);font-weight:700;letter-spacing:1px;margin-bottom:8px;font-family:'Space Grotesk',monospace;">RECEBIDO vs RECEITA TOTAL</div>
      <div style="height:10px;background:var(--border);border-radius:5px;overflow:hidden;">
        <div style="height:100%;width:${Math.min(pctRecebGeral, 100)}%;background:linear-gradient(90deg,#2D6A4F,#1B4332);border-radius:5px;transition:width .5s;"></div>
      </div>
      <div style="display:flex;justify-content:space-between;margin-top:6px;font-size:10px;color:var(--text-tertiary);font-family:Inter,sans-serif;">
        <span>Recebido: <strong style="color:#2D6A4F;">${_dashFmtR(totalEntradas)}</strong> (${pctRecebGeral.toFixed(0)}%)</span>
        <span>Receita: <strong style="color:var(--text-primary);">${_dashFmtR(totalReceita)}</strong></span>
      </div>
    </div>`;

    html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;">
      ${cardG('account_balance', 'DISPONIVEL', saldoGeral, saldoGeral >= 0 ? 'var(--success)' : 'var(--danger)', 'Recebido que ainda nao foi aplicado')}
      ${cardG('trending_up', 'LUCRO PROJETADO', lucroProjetado, lucroProjetado >= 0 ? 'var(--warning)' : 'var(--danger)', 'Margem bruta de obra: ' + margemProj.toFixed(0) + '% · s/ admin/impostos')}
    </div>`;
  }

  // Estoque patrimonio
  const valEstoque = typeof _valorEstoqueAtual !== 'undefined' ? _valorEstoqueAtual : 0;
  if (valEstoque > 0) {
    const saldoReal = saldoGeral + valEstoque;
    html += `<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:14px;display:flex;align-items:center;gap:16px;flex-wrap:wrap;">
      <div style="flex:1;min-width:150px;">
        <div style="font-size:10px;color:var(--text-tertiary);font-weight:700;letter-spacing:1px;margin-bottom:4px;font-family:'Space Grotesk',monospace;display:flex;align-items:center;gap:4px;"><span class="material-symbols-outlined" style="font-size:14px;">inventory_2</span> ESTOQUE (PATRIMONIO)</div>
        <div style="font-size:20px;font-weight:800;color:var(--warning);font-family:'Space Grotesk',monospace;">${_dashFmtR(valEstoque)}</div>
      </div>
      <div style="flex:1;min-width:150px;">
        <div style="font-size:10px;color:var(--text-tertiary);font-weight:700;letter-spacing:1px;margin-bottom:4px;font-family:'Space Grotesk',monospace;display:flex;align-items:center;gap:4px;" title="Disponível em caixa + valor do estoque físico"><span class="material-symbols-outlined" style="font-size:14px;">diamond</span> PATRIMONIO LIQUIDO</div>
        <div style="font-size:20px;font-weight:800;color:${saldoReal >= 0 ? 'var(--success)' : 'var(--danger)'};font-family:'Space Grotesk',monospace;">${_dashFmtR(saldoReal)}</div>
        <div style="font-size:9px;color:var(--text-tertiary);margin-top:2px;font-family:'Space Grotesk',monospace;">caixa + estoque</div>
      </div>
    </div>`;
  }

  // Por obra
  html += '<div style="font-size:11px;font-weight:700;color:var(--text-secondary);letter-spacing:1px;margin-bottom:10px;font-family:\'Plus Jakarta Sans\',sans-serif;display:flex;align-items:center;gap:6px;"><span class="material-symbols-outlined" style="font-size:16px;">domain</span> POR OBRA</div>';
  if (!obrasData.length) {
    html += '<div style="text-align:center;color:var(--text-tertiary);font-size:12px;padding:20px;font-family:Inter,sans-serif;">Nenhum movimento neste mes</div>';
  }
  obrasData.sort((a, b) => b.custo - a.custo).forEach(o => {
    const corPct = o.pctReceb >= 70 ? 'var(--success)' : o.pctReceb >= 40 ? 'var(--warning)' : 'var(--danger)';
    const corSaldo = o.saldo >= 0 ? 'var(--success)' : 'var(--danger)';
    html += `<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:8px;cursor:pointer;" onclick="setView('custos');setTimeout(()=>custosAbrirDetalhe('${esc(o.id)}'),100)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <div style="font-size:13px;font-weight:700;color:var(--text-primary);max-width:55%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:'Plus Jakarta Sans',sans-serif;">${esc(o.nome)}</div>
        <div style="font-size:10px;font-weight:700;padding:3px 10px;border-radius:20px;background:rgba(45,106,79,0.08);color:${corPct};font-family:'Space Grotesk',monospace;">${filtroMes ? _dashFmtR(o.saldo, true) : o.pctReceb.toFixed(0) + '% recebido'}</div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(${filtroMes ? 3 : 4},1fr);gap:8px;margin-bottom:10px;">
        <div><div style="font-size:9px;color:var(--text-tertiary);font-weight:700;letter-spacing:0.5px;margin-bottom:2px;font-family:'Space Grotesk',monospace;">ENTRADAS</div><div style="font-size:13px;font-weight:800;color:var(--success);font-family:'Space Grotesk',monospace;">${_dashFmtR(o.entradas, true)}</div></div>
        <div><div style="font-size:9px;color:var(--text-tertiary);font-weight:700;letter-spacing:0.5px;margin-bottom:2px;font-family:'Space Grotesk',monospace;">SAIDAS</div><div style="font-size:13px;font-weight:800;color:var(--danger);font-family:'Space Grotesk',monospace;">${_dashFmtR(o.custo, true)}</div></div>
        ${filtroMes ? '' : '<div><div style="font-size:9px;color:var(--text-tertiary);font-weight:700;letter-spacing:0.5px;margin-bottom:2px;font-family:\'Space Grotesk\',monospace;">FALTA RECEBER</div><div style="font-size:13px;font-weight:800;color:#3b82f6;font-family:\'Space Grotesk\',monospace;">' + _dashFmtR(o.faltaReceber, true) + '</div></div>'}
        <div><div style="font-size:9px;color:var(--text-tertiary);font-weight:700;letter-spacing:0.5px;margin-bottom:2px;font-family:'Space Grotesk',monospace;">SALDO</div><div style="font-size:13px;font-weight:800;color:${corSaldo};font-family:'Space Grotesk',monospace;">${_dashFmtR(o.saldo, true)}</div></div>
      </div>
      ${filtroMes ? '' : '<div style="height:6px;background:var(--border);border-radius:3px;overflow:hidden;"><div style="height:100%;width:' + Math.min(o.pctReceb, 100) + '%;background:linear-gradient(90deg,#2D6A4F,rgba(45,106,79,0.6));border-radius:3px;transition:width .5s;"></div></div>'}
    </div>`;
  });

  html += '</div>';
  return html;
}

function _dashFinCalcObra(o, filtroMes) {
  const reps = _dashGetRepassesCef();
  let custo, receb, mao, adds;
  if (filtroMes) {
    const lancObra = lancamentos.filter(l => l.obra_id === o.id && (l.data || '').startsWith(filtroMes));
    custo = lancObra.reduce((s, l) => s + Number(l.total || 0), 0);
    mao = lancObra.filter(l => typeof getCatFromLanc === 'function' && getCatFromLanc(l) === '28_mao').reduce((s, l) => s + Number(l.total || 0), 0);
    receb = reps.filter(r => r.obra_id === o.id && (r.data_credito || '').startsWith(filtroMes)).reduce((s, r) => s + Number(r.valor || 0), 0);
    if (typeof obrasAdicionais !== 'undefined' && typeof adicionaisPgtos !== 'undefined') {
      const listaAdd = obrasAdicionais.filter(a => a.obra_id === o.id);
      const addIds = new Set(listaAdd.map(a => a.id));
      const valorTotal = listaAdd.reduce((s, a) => s + Number(a.valor || 0), 0);
      const addRecebMes = adicionaisPgtos.filter(p => addIds.has(p.adicional_id) && (p.data || '').startsWith(filtroMes)).reduce((s, p) => s + Number(p.valor || 0), 0);
      adds = { valorTotal, totalRecebido: addRecebMes };
    } else {
      adds = { valorTotal: 0, totalRecebido: 0 };
    }
  } else {
    const lancObra = lancamentos.filter(l => l.obra_id === o.id);
    custo = lancObra.reduce((s, l) => s + Number(l.total || 0), 0);
    mao = lancObra.filter(l => typeof getCatFromLanc === 'function' && getCatFromLanc(l) === '28_mao').reduce((s, l) => s + Number(l.total || 0), 0);
    receb = reps.filter(r => r.obra_id === o.id).reduce((s, r) => s + Number(r.valor || 0), 0);
    adds = typeof getAdicionaisObra === 'function' ? getAdicionaisObra(o.id) : { valorTotal: 0, totalRecebido: 0 };
  }
  const vv = Number(o.valor_venda || 0);
  const entradas = receb + (adds?.totalRecebido || 0);
  const receita = vv + (adds?.valorTotal || 0);
  const faltaReceber = filtroMes ? 0 : (receita - entradas);
  const saldo = entradas - custo;
  // pctReceb não faz sentido no modo mensal (entradas do mês / receita total da obra) — vira null pra UI esconder
  const pctReceb = filtroMes ? null : (receita > 0 ? (entradas / receita * 100) : 0);
  return { ...o, nome: o.nome, id: o.id, vv, custo, receb, entradas, receita, faltaReceber, saldo, mao, pctReceb, adds };
}

// ── RENDER PRINCIPAL ─────────────────────────────────────────

function renderDashboard() {
  console.log('[DASH] renderDashboard chamado');
  const loadingEl = document.getElementById('dash-loading');
  if (loadingEl) loadingEl.classList.add('hidden');

  // Garantir que dash-content e dash-admin-content existam
  const vd = document.getElementById('view-dashboard');
  let contentEl = document.getElementById('dash-content');
  if (!contentEl && vd) {
    console.log('[DASH] Criando dash-content e dash-admin-content');
    vd.innerHTML = '<div id="dash-content"><div id="dash-admin-content" class="admin-only"></div><div id="oper-welcome" class="hidden"></div></div>';
    contentEl = document.getElementById('dash-content');
  }
  if (contentEl) contentEl.classList.remove('hidden');

  if (typeof usuarioAtual !== 'undefined' && usuarioAtual?.perfil !== 'admin') { _dashRenderOperador(); return; }

  const el = document.getElementById('dash-admin-content');
  console.log('[DASH] dash-admin-content:', !!el, 'obras:', obras.length, 'lanc:', lancamentos.length);
  if (!el) return;

  // Skeleton instantaneo
  el.innerHTML = '<div class="skeleton-block" style="height:120px;border-radius:16px;margin-bottom:12px;"></div>'.repeat(4);

  // Async: libera thread pra pintar skeleton, depois calcula
  requestAnimationFrame(async () => {
    if (typeof calcularValorEstoque === 'function') calcularValorEstoque();
    // Sub-lote B: topo do Painel consome a verdade gerencial do DRE (fonte única, sem reimplementar fórmula).
    // OBRIGATÓRIO: garantir contas admin ANTES de calcular (senão Resultado vem sem desp. admin — bug latente).
    if (window.DREModule && DREModule.garantirContasAdmin) { try { await DREModule.garantirContasAdmin(); } catch (e) { console.warn('[DASH] garantirContasAdmin falhou', e); } }
    const cGer = (window.DREModule && DREModule.calcGerencialConsolidado) ? DREModule.calcGerencialConsolidado('') : null;
    const ohGer = (window.DREModule && DREModule.calcGerencialOverhead) ? DREModule.calcGerencialOverhead('') : null;
    const obrasAtivasReais = (window.DREModule && DREModule.listarObrasReais) ? DREModule.listarObrasReais().filter(o => !o.arquivada) : (typeof obras !== 'undefined' ? obras : []);
    const carteiraAtiva = obrasAtivasReais.reduce((s, o) => s + Number(o.valor_venda || 0), 0);
    const m = _dashCalcMetricas();
    const porObra = _dashCalcPorObra(m.lancAtivos);
    // D2: "obras com contribuição negativa" pela base DRE (recebido + adicionais − custo), NÃO margem de contrato.
    // Fonte única (calcGerencialPorObra) = mesmas obras "no vermelho" do DRE. Ordena pior (maior prejuízo) primeiro.
    const _obrasReais = (window.DREModule && DREModule.listarObrasReais) ? DREModule.listarObrasReais() : [];
    const alertas = _obrasReais.map(o => {
      const d = (window.DREModule && DREModule.calcGerencialPorObra) ? (DREModule.calcGerencialPorObra(o.id, '') || {}) : {};
      return { nome: o.nome, id: o.id, margem: d.margemPct || 0, lucro: d.margem || 0 };
    }).filter(x => x.lucro < 0).sort((a, b) => a.lucro - b.lucro);
    const dataStr = new Date().toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();

    const isMobile = window.innerWidth <= 768;

    if (isMobile) {
      const pages = [
        { label: 'Resumo', icon: 'dashboard', html: _dashBuildTopoGerencial(cGer, ohGer, carteiraAtiva) + _dashBuildOndeOlhar(alertas) + '<div id="dash-exec-obras-m"></div>' + _dashBuildAgenda() },
        { label: 'Financeiro', icon: 'bar_chart', html: _dashBuildResumoFinanceiro(porObra) },
        { label: 'Obras', icon: 'domain', html: _dashBuildSaudeObras(porObra) },
      ];

      const tabsHTML = pages.map((p, i) =>
        `<button onclick="dashMobileTab(${i})" id="dash-tab-${i}" style="flex:1;background:none;border:none;color:${i === 0 ? '#2D6A4F' : 'var(--text-tertiary)'};font-size:11px;font-weight:700;font-family:'Plus Jakarta Sans',sans-serif;letter-spacing:1px;cursor:pointer;padding:10px 0;border-bottom:2px solid ${i === 0 ? '#2D6A4F' : 'transparent'};transition:all .2s;display:flex;align-items:center;justify-content:center;gap:4px;"><span class="material-symbols-outlined" style="font-size:16px;">${p.icon}</span>${p.label.toUpperCase()}</button>`
      ).join('');

      const pagesHTML = pages.map((p, i) =>
        `<div id="dash-page-${i}" style="display:${i === 0 ? 'block' : 'none'};">${p.html}</div>`
      ).join('');

      el.innerHTML = `${_dashBuildHeader(dataStr)}
        <div style="display:flex;margin-bottom:14px;border-bottom:1px solid var(--border);" id="dash-tabs-bar">${tabsHTML}</div>
        <div id="dash-pages">${pagesHTML}</div>`;

      _dashMobileSwipeInit();
    } else {
      const deskPages = [
        { label: 'Resumo', icon: 'dashboard', html: _dashBuildTopoGerencial(cGer, ohGer, carteiraAtiva) + _dashBuildOndeOlhar(alertas) + '<div id="dash-exec-obras"></div>' },
        { label: 'Financeiro', icon: 'bar_chart', html: _dashBuildResumoFinanceiro(porObra) },
      ];

      const deskTabsHTML = deskPages.map((p, i) =>
        `<button onclick="dashDesktopTab(${i})" id="dash-dtab-${i}" style="background:none;border:none;color:${i === 0 ? '#2D6A4F' : 'var(--text-tertiary)'};font-size:13px;font-weight:700;font-family:'Plus Jakarta Sans',sans-serif;letter-spacing:1.5px;cursor:pointer;padding:10px 24px;border-bottom:2px solid ${i === 0 ? '#2D6A4F' : 'transparent'};transition:all .2s;display:flex;align-items:center;gap:6px;"><span class="material-symbols-outlined" style="font-size:18px;">${p.icon}</span>${p.label.toUpperCase()}</button>`
      ).join('');

      const deskPagesHTML = deskPages.map((p, i) =>
        `<div id="dash-dpage-${i}" style="display:${i === 0 ? 'block' : 'none'};">${p.html}</div>`
      ).join('');

      el.innerHTML = `${_dashBuildHeader(dataStr)}
        <div style="display:flex;margin-bottom:18px;border-bottom:1px solid var(--border);" id="dash-dtabs-bar">${deskTabsHTML}</div>
        <div id="dash-dpages">${deskPagesHTML}</div>`;
    }

    setTimeout(() => {
      if (typeof autoFitStatValues === 'function') autoFitStatValues();
      _dashRenderAgendaLegenda();
      _dashRenderExecObras();
    }, 50);
  });
}

// ── EXECUÇÃO DE OBRAS (PCI) ───────────────────────────────────

async function _dashRenderExecObras() {
  try {
    if (!PciModule.medicoes.length) await PciModule._carregar();
    // D1: exclui EDR-ESCRITÓRIO via listarObrasReais (fonte única) + só ativas (não arquivadas).
    const _base = (window.DREModule && DREModule.listarObrasReais) ? DREModule.listarObrasReais() : (typeof obras !== 'undefined' ? obras : []);
    const obrasAtivas = _base.filter(o => !o.arquivada);
    if (!obrasAtivas.length) return;

    const linhas = obrasAtivas.map(obra => {
      const medicao = PciModule.medicoes.find(m => m.obra_id === obra.id);
      const exec = medicao ? PciModule._calcExec(medicao.id) : null;
      const cor = exec !== null ? PciModule._corProg(exec) : 'var(--text-tertiary)';
      const dataAtual = medicao && medicao.data_levantamento
        ? medicao.data_levantamento.split('-').reverse().join('/')
        : '—';
      return { obra, exec, cor, dataAtual };
    }).sort((a, b) => (b.exec ?? -1) - (a.exec ?? -1));

    const _th = `font-size:9px;color:var(--text-tertiary);font-weight:700;letter-spacing:.5px;text-transform:uppercase;font-family:Inter,sans-serif;`;
    const _cols = `grid-template-columns:1fr 96px 132px;`;
    const rows = `<div style="display:grid;${_cols}gap:10px;padding:4px 0 8px;border-bottom:1px solid var(--border);">
        <span style="${_th}">Obra</span>
        <span style="${_th}text-align:right;">Última medição</span>
        <span style="${_th}text-align:right;">Execução</span>
      </div>` + linhas.map(({ obra, exec, cor, dataAtual }) => `
      <div style="display:grid;${_cols}gap:10px;align-items:center;padding:9px 0;border-bottom:1px solid var(--border);">
        <span style="font-size:12px;font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:Inter,sans-serif;">${esc(obra.nome)}</span>
        <span style="font-size:11px;color:var(--text-tertiary);text-align:right;font-family:'Space Grotesk',monospace;">${dataAtual}</span>
        <div style="display:flex;align-items:center;gap:8px;justify-content:flex-end;">
          <div style="flex:1;max-width:76px;height:5px;background:var(--border);border-radius:3px;overflow:hidden;">
            <div style="width:${exec ?? 0}%;height:100%;background:${cor};border-radius:3px;transition:width .4s;"></div>
          </div>
          <span style="font-size:11px;font-weight:700;color:${cor};min-width:42px;text-align:right;font-family:'Space Grotesk',monospace;">${exec !== null ? exec.toFixed(1) + '%' : '—'}</span>
        </div>
      </div>`).join('');

    const html = `<div style="background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:16px;margin-bottom:14px;">
      <div style="font-family:'Plus Jakarta Sans',sans-serif;font-size:12px;font-weight:700;color:#2D6A4F;letter-spacing:2px;margin-bottom:6px;display:flex;align-items:center;gap:6px;">
        <span class="material-symbols-outlined" style="font-size:18px;">construction</span> EXECUÇÃO DAS OBRAS
      </div>
      ${rows}
    </div>`;

    ['dash-exec-obras', 'dash-exec-obras-m'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = html;
    });
  } catch(e) { console.warn('_dashRenderExecObras:', e); }
}

function _dashBuildHeader(dataStr) {
  return `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;padding-top:4px;padding-bottom:16px;border-bottom:1px solid var(--border);">
    <div>
      <div style="font-family:'Plus Jakarta Sans',sans-serif;font-size:18px;font-weight:700;color:var(--text-primary);letter-spacing:-0.3px;">Resumo</div>
      <div style="font-size:11px;color:var(--text-tertiary);font-weight:400;font-family:Inter,sans-serif;">${dataStr}</div>
    </div>
  </div>`;
}

// ── TAB HELPERS ──────────────────────────────────────────────

function dashDesktopTab(idx) {
  for (let i = 0; i < DashboardModule._deskTabCount; i++) {
    const page = document.getElementById('dash-dpage-' + i);
    const tab = document.getElementById('dash-dtab-' + i);
    if (page) page.style.display = i === idx ? 'block' : 'none';
    if (tab) {
      tab.style.color = i === idx ? '#2D6A4F' : 'var(--text-tertiary)';
      tab.style.borderBottomColor = i === idx ? '#2D6A4F' : 'transparent';
    }
  }
}

function dashMobileTab(idx) {
  DashboardModule.currentTab = idx;
  for (let i = 0; i < DashboardModule._tabCount; i++) {
    const page = document.getElementById('dash-page-' + i);
    const tab = document.getElementById('dash-tab-' + i);
    if (page) page.style.display = i === idx ? 'block' : 'none';
    if (tab) {
      tab.style.color = i === idx ? '#2D6A4F' : 'var(--text-tertiary)';
      tab.style.borderBottomColor = i === idx ? '#2D6A4F' : 'transparent';
    }
  }
  if (idx === 0) setTimeout(_dashRenderAgendaLegenda, 50);
}

function _dashMobileSwipeInit() {
  const pagesEl = document.getElementById('dash-pages');
  if (!pagesEl) return;
  let startX = 0, startY = 0, tracking = false;

  pagesEl.addEventListener('touchstart', function (e) {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    tracking = true;
  }, { passive: true });

  pagesEl.addEventListener('touchend', function (e) {
    if (!tracking) return;
    tracking = false;
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0 && DashboardModule.currentTab < DashboardModule._tabCount - 1) dashMobileTab(DashboardModule.currentTab + 1);
      if (dx > 0 && DashboardModule.currentTab > 0) dashMobileTab(DashboardModule.currentTab - 1);
    }
  }, { passive: true });
}

// ── REGISTER ─────────────────────────────────────────────────
if (typeof viewRegistry !== 'undefined') {
  viewRegistry.register('dashboard', async () => {
    await loadAgendaNotas();
    renderDashboard();
  });
}
