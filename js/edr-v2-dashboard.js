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
  _deskTabCount: 4,      // desktop
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
    await sbPost('agenda_notas', { texto, data, hora, autor });
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
    await sbPatch('agenda_notas', '?id=eq.' + id, { texto, data, hora });
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
    await sbDelete('agenda_notas', '?id=eq.' + id);
    DashboardModule.agendaNotas = DashboardModule.agendaNotas.filter(n => n.id !== id);
    renderDashboard();
    showToast('Anotacao excluida.');
  } catch (e) { showToast('Erro ao excluir.'); }
}

function _dashRenderAgendaLegenda() {
  const el = document.getElementById('agenda-legenda');
  if (!el) return;
  const autores = [...new Set(DashboardModule.agendaNotas.map(n => n.autor).filter(Boolean))];
  if (!autores.length && typeof usuarioAtual !== 'undefined' && usuarioAtual?.nome) autores.push(usuarioAtual.nome);
  el.innerHTML = autores.map(a =>
    '<div style="display:flex;align-items:center;gap:4px;font-size:9px;color:var(--text-tertiary);font-family:Inter,sans-serif;"><div style="width:8px;height:8px;border-radius:2px;background:' + _dashGetCorAutor(a) + ';"></div> ' + a + '</div>'
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
    return { nome: o.nome, id: o.id, custo, vv, receb, lucro, margem, qtd: ls.length, adds };
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
    ? consolidarEstoque().filter(m => m.saldoTotal > 0.01).sort((a, b) => b.saldoTotal - a.saldoTotal).slice(0, 8).map(m => [m.desc, { qtd: m.saldoTotal, un: m.unidade }])
    : [];

  const obraMap = {};
  obras.forEach(o => obraMap[o.id] = o.nome);
  const ultimos = [...lancamentos].sort((a, b) => new Date(b.data || 0) - new Date(a.data || 0)).slice(0, 8);

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
        <span style="font-size:12px;color:var(--text-primary);font-weight:500;font-family:Inter,sans-serif;">${nome}</span>
        <span style="font-size:11px;font-weight:700;color:#a78bfa;font-family:'Space Grotesk',monospace;">${v.qtd % 1 === 0 ? v.qtd : v.qtd.toFixed(2)} ${v.un}</span>
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
          <div style="font-size:10px;color:var(--text-tertiary);margin-top:2px;font-family:'Space Grotesk',monospace;">${obraMap[l.obra_id] || '—'} · ${l.data || ''}</div>
        </div>
        <span style="font-size:10px;color:var(--text-tertiary);background:var(--surface-alt);padding:2px 8px;border-radius:10px;font-family:'Space Grotesk',monospace;white-space:nowrap;">${Number(l.qtd || 1) % 1 === 0 ? Number(l.qtd || 1) : Number(l.qtd || 1).toFixed(2)} ${l.unidade || 'UN'}</span>
      </div>`).join('')}
  </div>`;
}

// ── KPIs ──────────────────────────────────────────────────────

function _dashBuildKPIs(m, porObra) {
  const contasVenc = typeof getContasVencidas === 'function' ? getContasVencidas().length : 0;
  const valEstoque = typeof _valorEstoqueAtual !== 'undefined' ? _valorEstoqueAtual : 0;

  // Mao de obra vs Material do mes vigente
  const hoje = new Date();
  const mesAtual = hoje.getFullYear() + '-' + String(hoje.getMonth() + 1).padStart(2, '0');
  const lancMes = lancamentos.filter(l => l.data && l.data.startsWith(mesAtual) && m.obraAtivaIds.has(l.obra_id));
  const maoMes = lancMes.filter(l => typeof getCatFromLanc === 'function' && getCatFromLanc(l) === '28_mao').reduce((s, l) => s + Number(l.total || 0), 0);
  const materialMes = lancMes.reduce((s, l) => s + Number(l.total || 0), 0) - maoMes;

  const kpis = [
    { num: fmt(m.receitaTotal), label: 'Receita Total', icon: 'account_balance_wallet', bg: 'linear-gradient(135deg,#1B4332,#2D6A4F)' },
    { num: fmt(m.custoTotal), label: 'Custo Total', icon: 'trending_down', bg: 'linear-gradient(135deg,#92400e,#d97706)' },
    { num: fmt(m.lucroGeral), label: 'Lucro', icon: m.lucroGeral >= 0 ? 'trending_up' : 'trending_down', bg: m.lucroGeral >= 0 ? 'linear-gradient(135deg,#14532d,#22c55e)' : 'linear-gradient(135deg,#7f1d1d,#ef4444)' },
    { num: m.valorVendaTotal > 0 ? m.margemGeral.toFixed(1) + '%' : '—', label: 'Margem', icon: 'percent', bg: 'linear-gradient(135deg,#4c1d95,#7c3aed)' },
    { num: porObra.length.toString(), label: 'Obras Ativas', icon: 'domain', bg: 'linear-gradient(135deg,#1B4332,#2D6A4F)' },
    { num: contasVenc.toString(), label: 'Contas Vencidas', icon: 'warning', bg: contasVenc > 0 ? 'linear-gradient(135deg,#7f1d1d,#ef4444)' : 'linear-gradient(135deg,#14532d,#22c55e)' },
    // NOVOS KPIs (GM)
    { num: _dashFmtR(valEstoque), label: 'Estoque em Material', icon: 'inventory_2', bg: 'linear-gradient(135deg,#78350f,#f59e0b)' },
    { num: (maoMes + materialMes) > 0 ? (maoMes / (maoMes + materialMes) * 100).toFixed(0) + '% / ' + (materialMes / (maoMes + materialMes) * 100).toFixed(0) + '%' : '—', label: 'Mao Obra vs Material', icon: 'compare', bg: 'linear-gradient(135deg,#1e3a5f,#3b82f6)' },
  ];

  const kpiCols = window.innerWidth <= 768 ? 2 : 4;
  return `<div style="display:grid;grid-template-columns:repeat(${kpiCols},1fr);gap:10px;margin-bottom:16px;">
    ${kpis.map(k => `<div style="background:${k.bg};border-radius:14px;padding:16px 12px;text-align:center;cursor:pointer;transition:all .2s;position:relative;overflow:hidden;" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform=''">
      <div style="position:absolute;top:10px;right:12px;opacity:0.15;"><span class="material-symbols-outlined" style="font-size:32px;color:#fff;">${k.icon}</span></div>
      <div style="font-size:18px;font-weight:800;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,0.3);line-height:1.2;font-family:'Space Grotesk',monospace;">${k.num}</div>
      <div style="font-size:9px;font-weight:700;color:rgba(255,255,255,0.85);letter-spacing:0.8px;text-transform:uppercase;margin-top:4px;font-family:Inter,sans-serif;">${k.label}</div>
    </div>`).join('')}
  </div>`;
}

// ── ALERTAS ──────────────────────────────────────────────────

function _dashBuildAlertas(alertas) {
  if (!alertas.length) return '';
  return `<div style="background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.2);border-radius:16px;padding:14px 16px;margin-bottom:14px;">
    <div style="font-family:'Plus Jakarta Sans',sans-serif;font-size:12px;font-weight:700;color:var(--danger);letter-spacing:2px;margin-bottom:8px;display:flex;align-items:center;gap:6px;"><span class="material-symbols-outlined" style="font-size:18px;">warning</span> OBRAS COM MARGEM NEGATIVA</div>
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
        <div style="font-size:10px;color:var(--text-tertiary);font-family:Inter,sans-serif;">${i.sub}</div>
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
    const pctReceb = o.vv > 0 ? Math.min((o.receb / o.vv * 100), 100) : 0;
    const corM = o.margem >= 15 ? '#2D6A4F' : o.margem >= 0 ? 'var(--warning)' : 'var(--danger)';
    return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);cursor:pointer;" onclick="setView('custos');setTimeout(()=>custosAbrirDetalhe('${esc(o.id)}'),100)">
        <div style="flex:1;min-width:0;">
          <div style="font-size:12px;color:var(--text-primary);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:Inter,sans-serif;">${esc(o.nome)}</div>
        </div>
        <div style="width:80px;height:4px;background:var(--border);border-radius:2px;overflow:hidden;flex-shrink:0;">
          <div style="width:${pctReceb}%;height:100%;background:#2D6A4F;border-radius:2px;"></div>
        </div>
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

  const obrasData = obras.filter(o => porObra.some(p => p.id === o.id)).map(o => {
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
  const subSaidas = 'Material: ' + _dashFmtR(totalSaidas - totalMao) + ' · Mao de obra: ' + _dashFmtR(totalMao);

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
      ${cardG('trending_up', 'LUCRO PROJETADO', lucroProjetado, lucroProjetado >= 0 ? 'var(--warning)' : 'var(--danger)', 'Receita - Gasto · Margem: ' + margemProj.toFixed(0) + '%')}
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
        <div style="font-size:10px;color:var(--text-tertiary);font-weight:700;letter-spacing:1px;margin-bottom:4px;font-family:'Space Grotesk',monospace;display:flex;align-items:center;gap:4px;"><span class="material-symbols-outlined" style="font-size:14px;">diamond</span> CAIXA TOTAL</div>
        <div style="font-size:20px;font-weight:800;color:${saldoReal >= 0 ? 'var(--success)' : 'var(--danger)'};font-family:'Space Grotesk',monospace;">${_dashFmtR(saldoReal)}</div>
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
  const pctReceb = receita > 0 ? (entradas / receita * 100) : 0;
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
  requestAnimationFrame(() => {
    const m = _dashCalcMetricas();
    const porObra = _dashCalcPorObra(m.lancAtivos);
    const alertas = porObra.filter(o => o.vv > 0 && o.margem < 0);
    const dataStr = new Date().toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();

    const isMobile = window.innerWidth <= 768;

    if (isMobile) {
      const pages = [
        { label: 'Resumo', icon: 'dashboard', html: _dashBuildKPIs(m, porObra) + _dashBuildAlertas(alertas) + _dashBuildContasVencidas() + _dashBuildAcaoNecessaria() + _dashBuildAgenda() },
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
        { label: 'Resumo', icon: 'dashboard', html: _dashBuildKPIs(m, porObra) + _dashBuildAlertas(alertas) + _dashBuildContasVencidas() + _dashBuildAcaoNecessaria() },
        { label: 'Financeiro', icon: 'bar_chart', html: _dashBuildResumoFinanceiro(porObra) },
        { label: 'Agenda', icon: 'calendar_month', html: _dashBuildAgenda() },
        { label: 'Obras', icon: 'domain', html: _dashBuildSaudeObras(porObra) },
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
    }, 50);
  });
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
  if (idx === 2) setTimeout(_dashRenderAgendaLegenda, 50);
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
