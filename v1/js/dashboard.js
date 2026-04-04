// Dashboard EDR — gráficos HTML nativos (sem dependência de Chart.js)

// ── DASHBOARD OPERADOR ──────────────────────────────────────
function renderDashboardOperador() {
  if (!usuarioAtual) return;
  const el = document.getElementById('oper-welcome');
  el.classList.remove('hidden');

  const now = new Date();
  const dataStr = now.toLocaleDateString('pt-BR', { weekday:'long', day:'2-digit', month:'long' });
  const horaStr = now.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });

  const obrasAtivas = obras.map(o => {
    const ls = lancamentos.filter(l => l.obra_id === o.id);
    return { ...o, qtd: ls.length };
  }).filter(o => o.qtd > 0).sort((a,b) => b.qtd - a.qtd);

  const estoqueDisp = consolidarEstoque()
    .filter(m => m.saldoTotal > 0.01)
    .sort((a, b) => b.saldoTotal - a.saldoTotal)
    .slice(0, 8)
    .map(m => [m.desc, { qtd: m.saldoTotal, un: m.unidade }]);

  const obraMap = {};
  obras.forEach(o => obraMap[o.id] = o.nome);
  const ultimos = [...lancamentos].sort((a,b) => new Date(b.data||0) - new Date(a.data||0)).slice(0, 8);

  el.innerHTML = `
    <div class="card" style="margin-bottom:12px;padding:18px 20px;">
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <div>
          <div style="font-family:'Rajdhani',sans-serif;font-size:20px;font-weight:700;color:var(--branco);">Olá, ${esc(usuarioAtual.nome)}! 👷</div>
          <div style="font-size:11px;color:var(--texto3);margin-top:4px;font-family:'JetBrains Mono',monospace;text-transform:capitalize;">${dataStr} · ${horaStr}</div>
        </div>
        <div style="display:flex;gap:10px;">
          <button onclick="setView('form')" style="background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.15);color:var(--verde-hl);border-radius:10px;padding:10px 16px;font-family:'Rajdhani',sans-serif;font-weight:700;font-size:12px;letter-spacing:1px;cursor:pointer;">➕ LANÇAR NF</button>
          <button onclick="setView('estoque')" style="background:rgba(139,92,246,0.1);border:1px solid rgba(139,92,246,0.25);color:#a78bfa;border-radius:10px;padding:10px 16px;font-family:'Rajdhani',sans-serif;font-weight:700;font-size:12px;letter-spacing:1px;cursor:pointer;">📦 ESTOQUE</button>
        </div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
      ${dashBuildObrasAtivas(obrasAtivas)}
      ${dashBuildEstoqueDisp(estoqueDisp)}
    </div>
    ${dashBuildUltimosLanc(ultimos, obraMap)}`;
}

function dashBuildObrasAtivas(obrasAtivas) {
  return `<div class="card" style="padding:16px;">
    <div style="font-family:'Rajdhani',sans-serif;font-size:13px;font-weight:700;color:var(--verde-hl);letter-spacing:2px;margin-bottom:12px;">🏗 Obras em Andamento</div>
    ${obrasAtivas.length ? obrasAtivas.map(o => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
        <span style="font-size:13px;color:var(--branco);font-weight:600;">${esc(o.nome)}</span>
        <span style="font-size:10px;color:var(--texto3);font-family:'JetBrains Mono',monospace;background:rgba(255,255,255,0.04);padding:2px 8px;border-radius:10px;">${o.qtd} lanç.</span>
      </div>`).join('') :
      '<div style="color:var(--texto3);font-size:12px;padding:8px 0;">Nenhuma obra ativa.</div>'}
  </div>`;
}

function dashBuildEstoqueDisp(estoqueDisp) {
  return `<div class="card" style="padding:16px;">
    <div style="font-family:'Rajdhani',sans-serif;font-size:13px;font-weight:700;color:#a78bfa;letter-spacing:2px;margin-bottom:12px;">📦 Estoque Disponível</div>
    ${estoqueDisp.length ? estoqueDisp.map(([nome, v]) => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(139,92,246,0.07);">
        <span style="font-size:12px;color:var(--texto);font-weight:500;">${nome}</span>
        <span style="font-size:11px;font-weight:700;color:#a78bfa;font-family:'JetBrains Mono',monospace;">${v.qtd % 1 === 0 ? v.qtd : v.qtd.toFixed(2)} ${v.un}</span>
      </div>`).join('') :
      '<div style="color:var(--texto3);font-size:12px;padding:8px 0;">Sem estoque disponível.</div>'}
  </div>`;
}

function dashBuildUltimosLanc(ultimos, obraMap) {
  if (!ultimos.length) return '';
  return `<div class="card" style="padding:16px;">
    <div style="font-family:'Rajdhani',sans-serif;font-size:13px;font-weight:700;color:#60a5fa;letter-spacing:2px;margin-bottom:12px;">🕐 Últimos Lançamentos</div>
    ${ultimos.map(l => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:9px 0;border-bottom:1px solid rgba(59,130,246,0.07);">
        <div>
          <div style="font-size:13px;color:var(--branco);font-weight:600;">${esc(l.descricao)}</div>
          <div style="font-size:10px;color:var(--texto3);margin-top:2px;font-family:'JetBrains Mono',monospace;">${obraMap[l.obra_id]||'—'} · ${l.data||''}</div>
        </div>
        <span style="font-size:10px;color:var(--texto3);background:rgba(59,130,246,0.07);padding:2px 8px;border-radius:10px;font-family:'JetBrains Mono',monospace;white-space:nowrap;">${Number(l.qtd||1) % 1 === 0 ? Number(l.qtd||1) : Number(l.qtd||1).toFixed(2)} ${l.unidade||'UN'}</span>
      </div>`).join('')}
  </div>`;
}

// ── CÁLCULOS DO DASHBOARD ADMIN ─────────────────────────────
function calcDashMetricas() {
  const obraAtivaIds = new Set(obras.map(o => o.id));
  const lancAtivos = lancamentos.filter(l => obraAtivaIds.has(l.obra_id));
  const custoTotal = lancAtivos.reduce((s,l) => s + Number(l.total||0), 0);
  const totalPls = repassesCef.filter(r => obraAtivaIds.has(r.obra_id) && (r.tipo||'pls')==='pls').reduce((s,r) => s + Number(r.valor||0), 0);
  const totalEntradas = repassesCef.filter(r => obraAtivaIds.has(r.obra_id) && (r.tipo||'pls')==='entrada').reduce((s,r) => s + Number(r.valor||0), 0);
  const totalTerreno = repassesCef.filter(r => obraAtivaIds.has(r.obra_id) && (r.tipo||'pls')==='terreno').reduce((s,r) => s + Number(r.valor||0), 0);
  const totalRecebido = totalPls + totalEntradas + totalTerreno;
  const valorVendaTotal = obras.reduce((s,o) => s + Number(o.valor_venda||0), 0);
  const addGeral = typeof getAdicionaisGeral === 'function' ? getAdicionaisGeral(obraAtivaIds) : { valorTotal:0, totalRecebido:0, saldo:0 };
  const receitaTotal = valorVendaTotal + addGeral.valorTotal;
  const lucroGeral = receitaTotal - custoTotal;
  const margemGeral = receitaTotal > 0 ? (lucroGeral / receitaTotal * 100) : 0;
  return { obraAtivaIds, lancAtivos, custoTotal, totalRecebido, valorVendaTotal, addGeral, receitaTotal, lucroGeral, margemGeral };
}

function calcDashPorObra(lancAtivos) {
  return obras.map(o => {
    const ls = lancAtivos.filter(l => l.obra_id === o.id);
    const custo = ls.reduce((s,l) => s + Number(l.total||0), 0);
    const vv = Number(o.valor_venda||0);
    const adds = typeof getAdicionaisObra === 'function' ? getAdicionaisObra(o.id) : { qtd:0, valorTotal:0, totalRecebido:0, saldo:0 };
    const receitaObra = vv + adds.valorTotal;
    const reps = repassesCef.filter(r => r.obra_id === o.id);
    const receb = reps.reduce((s,r) => s + Number(r.valor||0), 0);
    const lucro = receitaObra - custo;
    const margem = receitaObra > 0 ? (lucro/receitaObra*100) : 0;
    return { nome: o.nome, id: o.id, custo, vv, receb, lucro, margem, qtd: ls.length, adds };
  }).filter(o => o.qtd > 0 || o.vv > 0).sort((a,b) => b.custo - a.custo);
}

function calcDashEtapas(lancAtivos) {
  const etapaMap = {};
  lancAtivos.forEach(l => {
    const lb = etapaLabel(l.etapa || '36_outros');
    etapaMap[lb] = (etapaMap[lb]||0) + Number(l.total||0);
  });
  return Object.entries(etapaMap).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]).slice(0,8);
}

// ── SEÇÕES HTML DO DASHBOARD ADMIN ──────────────────────────
// ── AGENDA / ANOTAÇÕES ──────────────────────────────────────
let _agendaNotas = [];

async function loadAgendaNotas() {
  try {
    const r = await sbGet('agenda_notas', '?order=data.desc,criado_em.desc&limit=20');
    _agendaNotas = Array.isArray(r) ? r : [];
  } catch(e) { _agendaNotas = []; }
}

let _agendaSemanaOffset = 0;

function dashBuildAgenda() {
  const DIAS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
  const hoje = new Date();
  hoje.setHours(0,0,0,0);

  // Semana atual + offset
  const inicioSemana = new Date(hoje);
  inicioSemana.setDate(hoje.getDate() - hoje.getDay() + 1 + (_agendaSemanaOffset * 7)); // Começa segunda

  const dias = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(inicioSemana);
    d.setDate(inicioSemana.getDate() + i);
    const iso = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    const notas = _agendaNotas.filter(n => n.data === iso);
    const isHoje = iso === hojeISO();
    dias.push({ date: d, iso, notas, isHoje, diaSemana: DIAS[d.getDay()], dia: d.getDate() });
  }

  const mesLabel = inicioSemana.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  const diasHTML = dias.map(d => {
    const notasHTML = d.notas.map(n => {
      const nome = (n.autor || '').toLowerCase();
      const cor = _getCorAutor(n.autor);
      return `<div style="display:flex;gap:6px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.03);">
        <div style="width:3px;border-radius:2px;background:${cor};flex-shrink:0;"></div>
        <div style="flex:1;">
          <div style="font-size:11px;color:var(--branco);font-weight:600;line-height:1.4;">${esc(n.texto)}</div>
          <div style="font-size:9px;color:var(--texto3);margin-top:2px;"><span style="color:${cor};font-weight:700;">${esc(n.autor || '—')}</span>${n.hora ? ' · ' + n.hora : ''}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:2px;">
          <button onclick="event.stopPropagation();editarNota('${n.id}')" style="background:none;border:none;color:var(--texto3);cursor:pointer;font-size:10px;padding:0 2px;opacity:0.5;">✏</button>
          <button onclick="event.stopPropagation();excluirNota('${n.id}')" style="background:none;border:none;color:var(--texto3);cursor:pointer;font-size:10px;padding:0 2px;opacity:0.5;">×</button>
        </div>
      </div>`;
    }).join('');

    const clickAction = d.notas.length ? `abrirDiaAgenda('${d.iso}')` : `abrirModalNota('${d.iso}')`;
    // No grid, mostrar preview truncado
    const previewHTML = d.notas.length ? d.notas.slice(0, 2).map(n => {
      const cor = _getCorAutor(n.autor);
      return `<div style="display:flex;gap:4px;align-items:flex-start;margin-top:3px;">
        <div style="width:3px;height:12px;border-radius:2px;background:${cor};flex-shrink:0;margin-top:1px;"></div>
        <div style="font-size:9px;color:var(--texto2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(n.texto)}</div>
      </div>`;
    }).join('') + (d.notas.length > 2 ? '<div style="font-size:8px;color:var(--texto3);margin-top:2px;">+' + (d.notas.length - 2) + ' mais</div>' : '') : '';

    return `<div style="min-height:60px;background:${d.isHoje ? 'rgba(59,130,246,0.06)' : 'rgba(255,255,255,0.02)'};border:1px solid ${d.isHoje ? 'rgba(59,130,246,0.3)' : 'rgba(255,255,255,0.04)'};border-radius:10px;padding:8px;cursor:pointer;transition:all .15s;" onclick="${clickAction}">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div>
          <span style="font-size:9px;font-weight:700;color:${d.isHoje ? '#3b82f6' : 'var(--texto3)'};letter-spacing:0.5px;">${d.diaSemana}</span>
          <span style="font-size:13px;font-weight:800;color:${d.isHoje ? '#3b82f6' : 'var(--branco)'};margin-left:4px;">${d.dia}</span>
        </div>
        ${d.notas.length ? '<span style="font-size:8px;font-weight:700;background:rgba(59,130,246,0.15);color:#3b82f6;padding:1px 5px;border-radius:6px;">' + d.notas.length + '</span>' : ''}
      </div>
      ${previewHTML}
    </div>`;
  }).join('');

  return `<div class="card" style="padding:22px;margin-bottom:16px;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
      <div style="display:flex;align-items:center;gap:10px;">
        <button onclick="_agendaSemanaOffset--;renderDashboard()" style="background:none;border:1px solid var(--borda);color:var(--texto3);width:32px;height:32px;border-radius:8px;cursor:pointer;font-size:14px;">←</button>
        <div>
          <div style="font-size:13px;font-weight:700;color:var(--texto2);">📅 Agenda</div>
          <div style="font-size:10px;color:var(--texto3);text-transform:capitalize;">${mesLabel}</div>
        </div>
        <button onclick="_agendaSemanaOffset++;renderDashboard()" style="background:none;border:1px solid var(--borda);color:var(--texto3);width:32px;height:32px;border-radius:8px;cursor:pointer;font-size:14px;">→</button>
      </div>
      <div style="display:flex;gap:6px;align-items:center;">
        ${_agendaSemanaOffset !== 0 ? '<button onclick="_agendaSemanaOffset=0;renderDashboard()" style="padding:4px 10px;border-radius:6px;border:1px solid var(--borda);background:transparent;color:var(--texto3);font-size:10px;font-weight:600;cursor:pointer;font-family:inherit;">HOJE</button>' : ''}
        <button onclick="abrirModalNota()" style="padding:5px 12px;border-radius:8px;border:1px solid rgba(59,130,246,0.3);background:transparent;color:#3b82f6;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;">+ NOTA</button>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px;" id="agenda-semana-grid">
      ${diasHTML}
    </div>
    <div style="display:flex;gap:12px;margin-top:10px;justify-content:center;" id="agenda-legenda"></div>
  </div>`;
}

// Cores dinâmicas para autores da agenda
const _AGENDA_CORES = ['#3b82f6','#a855f7','#f59e0b','#ef4444','#06b6d4','#ec4899','#84cc16','#f97316'];
let _agendaAutorCores = {};
function _getCorAutor(nome) {
  if (!nome) return '#22c55e';
  const key = nome.toLowerCase();
  if (!_agendaAutorCores[key]) {
    const idx = Object.keys(_agendaAutorCores).length % _AGENDA_CORES.length;
    _agendaAutorCores[key] = _AGENDA_CORES[idx];
  }
  return _agendaAutorCores[key];
}
function _renderAgendaLegenda() {
  const el = document.getElementById('agenda-legenda');
  if (!el) return;
  // Pegar autores únicos das notas
  const autores = [...new Set(_agendaNotas.map(n => n.autor).filter(Boolean))];
  if (!autores.length && usuarioAtual?.nome) autores.push(usuarioAtual.nome);
  el.innerHTML = autores.map(a =>
    '<div style="display:flex;align-items:center;gap:4px;font-size:9px;color:var(--texto3);"><div style="width:8px;height:8px;border-radius:2px;background:' + _getCorAutor(a) + ';"></div> ' + a + '</div>'
  ).join('');
}

function abrirDiaAgenda(dataISO) {
  const notas = _agendaNotas.filter(n => n.data === dataISO);
  const dataFormatada = new Date(dataISO + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });

  const el = document.createElement('div');
  el.id = 'modal-nota-overlay';
  el.className = 'modal-overlay';
  el.onclick = function(e) { if (e.target === el) el.remove(); };

  const notasHTML = notas.map(n => {
    const cor = _getCorAutor(n.autor);
    return `<div style="display:flex;gap:10px;padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.04);">
      <div style="width:4px;border-radius:2px;background:${cor};flex-shrink:0;"></div>
      <div style="flex:1;">
        <div style="font-size:13px;color:var(--branco);font-weight:600;line-height:1.5;">${esc(n.texto)}</div>
        <div style="font-size:10px;color:var(--texto3);margin-top:4px;">
          <span style="color:${cor};font-weight:700;">${esc(n.autor || '—')}</span>${n.hora ? ' · ' + n.hora : ''}
        </div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0;">
        <button onclick="document.getElementById('modal-nota-overlay').remove();editarNota('${n.id}')" style="background:none;border:1px solid var(--borda);color:var(--texto3);cursor:pointer;font-size:11px;padding:4px 8px;border-radius:6px;">✏</button>
        <button onclick="document.getElementById('modal-nota-overlay').remove();excluirNota('${n.id}')" style="background:none;border:1px solid rgba(239,68,68,0.2);color:#ef4444;cursor:pointer;font-size:11px;padding:4px 8px;border-radius:6px;">×</button>
      </div>
    </div>`;
  }).join('');

  el.innerHTML = `<div class="modal" style="max-width:420px;">
    <div class="modal-title">
      <span style="text-transform:capitalize;">📅 ${dataFormatada}</span>
      <button class="modal-close" onclick="document.getElementById('modal-nota-overlay').remove()">✕</button>
    </div>
    <div style="max-height:50vh;overflow-y:auto;">${notasHTML}</div>
    <button class="btn-save" style="margin-top:12px;" onclick="document.getElementById('modal-nota-overlay').remove();abrirModalNota('${dataISO}')">+ NOVA ANOTAÇÃO</button>
  </div>`;

  document.body.appendChild(el);
}

function abrirModalNota(dataPre) {
  const autor = usuarioAtual?.nome || 'Duam';
  const hoje = dataPre || hojeISO();

  const el = document.createElement('div');
  el.id = 'modal-nota-overlay';
  el.className = 'modal-overlay';
  el.onclick = function(e) { if (e.target === el) el.remove(); };

  el.innerHTML = `<div class="modal" style="max-width:380px;">
    <div class="modal-title"><span>📝 Nova Anotação</span><button class="modal-close" onclick="document.getElementById('modal-nota-overlay').remove()">✕</button></div>
    <div class="field"><label>ANOTAÇÃO *</label><textarea id="nota-texto" rows="3" placeholder="Ex: Ligar pra Dayana sobre reboco" style="width:100%;padding:10px;background:rgba(255,255,255,0.03);border:1px solid var(--borda);border-radius:8px;color:var(--branco);font-size:13px;font-family:inherit;resize:vertical;box-sizing:border-box;"></textarea></div>
    <div style="display:flex;gap:8px;">
      <div class="field" style="flex:1;"><label>DATA</label><input type="date" id="nota-data" value="${hoje}" style="width:100%;padding:10px;background:rgba(255,255,255,0.03);border:1px solid var(--borda);border-radius:8px;color:var(--branco);font-size:13px;font-family:inherit;box-sizing:border-box;"></div>
      <div class="field" style="flex:1;"><label>HORA</label><input type="time" id="nota-hora" style="width:100%;padding:10px;background:rgba(255,255,255,0.03);border:1px solid var(--borda);border-radius:8px;color:var(--branco);font-size:13px;font-family:inherit;box-sizing:border-box;"></div>
    </div>
    <input type="hidden" id="nota-autor" value="${esc(autor)}">
    <button class="btn-save" onclick="salvarAgendaNota()">SALVAR</button>
  </div>`;

  document.body.appendChild(el);
  setTimeout(() => document.getElementById('nota-texto').focus(), 100);
}

async function salvarAgendaNota() {
  const texto = document.getElementById('nota-texto').value.trim();
  const data = document.getElementById('nota-data').value;
  const hora = document.getElementById('nota-hora').value || null;
  const autor = document.getElementById('nota-autor').value;
  if (!texto) { showToast('⚠ Digite a anotação.'); return; }

  try {
    await sbPost('agenda_notas', { texto, data, hora, autor });
    document.getElementById('modal-nota-overlay')?.remove();
    await loadAgendaNotas();
    renderDashboard();
    showToast('✅ Anotação salva!');
  } catch(e) {
    console.error(e);
    showToast('❌ Erro ao salvar. Verifique se a tabela agenda_notas existe.');
  }
}

function editarNota(id) {
  const nota = _agendaNotas.find(n => n.id === id);
  if (!nota) return;

  const el = document.createElement('div');
  el.id = 'modal-nota-overlay';
  el.className = 'modal-overlay';
  el.onclick = function(e) { if (e.target === el) el.remove(); };

  el.innerHTML = `<div class="modal" style="max-width:380px;">
    <div class="modal-title"><span>✏️ Editar Anotação</span><button class="modal-close" onclick="document.getElementById('modal-nota-overlay').remove()">✕</button></div>
    <div class="field"><label>ANOTAÇÃO *</label><textarea id="nota-texto" rows="3" style="width:100%;padding:10px;background:rgba(255,255,255,0.03);border:1px solid var(--borda);border-radius:8px;color:var(--branco);font-size:13px;font-family:inherit;resize:vertical;box-sizing:border-box;">${esc(nota.texto)}</textarea></div>
    <div style="display:flex;gap:8px;">
      <div class="field" style="flex:1;"><label>DATA</label><input type="date" id="nota-data" value="${nota.data || ''}" style="width:100%;padding:10px;background:rgba(255,255,255,0.03);border:1px solid var(--borda);border-radius:8px;color:var(--branco);font-size:13px;font-family:inherit;box-sizing:border-box;"></div>
      <div class="field" style="flex:1;"><label>HORA</label><input type="time" id="nota-hora" value="${nota.hora || ''}" style="width:100%;padding:10px;background:rgba(255,255,255,0.03);border:1px solid var(--borda);border-radius:8px;color:var(--branco);font-size:13px;font-family:inherit;box-sizing:border-box;"></div>
    </div>
    <input type="hidden" id="nota-edit-id" value="${id}">
    <input type="hidden" id="nota-autor" value="${esc(nota.autor || '')}">
    <button class="btn-save" onclick="salvarNotaEdit()">SALVAR</button>
  </div>`;

  document.body.appendChild(el);
  setTimeout(() => document.getElementById('nota-texto').focus(), 100);
}

async function salvarNotaEdit() {
  const id = document.getElementById('nota-edit-id').value;
  const texto = document.getElementById('nota-texto').value.trim();
  const data = document.getElementById('nota-data').value;
  const hora = document.getElementById('nota-hora').value || null;
  if (!texto) { showToast('⚠ Digite a anotação.'); return; }

  try {
    await sbPatch('agenda_notas', `?id=eq.${id}`, { texto, data, hora });
    document.getElementById('modal-nota-overlay')?.remove();
    await loadAgendaNotas();
    renderDashboard();
    showToast('✅ Anotação atualizada!');
  } catch(e) {
    console.error(e);
    showToast('❌ Erro ao atualizar.');
  }
}

async function excluirNota(id) {
  if (!confirm('Excluir esta anotação?')) return;
  try {
    await sbDelete('agenda_notas', `?id=eq.${id}`);
    _agendaNotas = _agendaNotas.filter(n => n.id !== id);
    renderDashboard();
    showToast('Anotação excluída.');
  } catch(e) { showToast('Erro ao excluir.'); }
}

function dashBuildHeader(dataStr) {
  return `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;padding-top:4px;padding-bottom:16px;border-bottom:1px solid rgba(255,255,255,0.06);">
    <div>
      <div style="font-family:'Inter',sans-serif;font-size:18px;font-weight:700;color:var(--branco);letter-spacing:-0.3px;">Resumo</div>
      <div style="font-size:11px;color:var(--texto3);font-weight:400;">${dataStr}</div>
    </div>
  </div>`;
}

function dashBuildCardReceita(receitaTotal, valorVendaTotal, addGeral) {
  return `<div class="stat-card" style="border-top:2px solid #3b82f6;margin-bottom:10px;text-align:center;padding:18px;">
    <div class="stat-label" style="font-size:10px;">RECEITA TOTAL</div>
    <div class="stat-value" style="color:#3b82f6;font-size:clamp(20px,4vw,28px);">${receitaTotal > 0 ? fmt(receitaTotal) : 'Não informado'}</div>
    <div class="stat-sub">${obras.length} imóvel(is)${addGeral.valorTotal > 0 ? ` · Venda: ${fmt(valorVendaTotal)} + Adicionais: ${fmt(addGeral.valorTotal)}` : ' · soma dos valores de venda'}</div>
  </div>`;
}

function dashBuildCardsSecundarios(m, porObra) {
  const { custoTotal, totalRecebido, lucroGeral, margemGeral } = m;
  const corLucro = lucroGeral >= 0 ? 'var(--verde-hl)' : '#ef4444';
  const corMargem = margemGeral >= 15 ? 'var(--verde-hl)' : margemGeral >= 0 ? '#f59e0b' : '#ef4444';
  return `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:18px;">
    <div class="stat-card" style="border-top:2px solid #f59e0b;padding:18px;">
      <div class="stat-label">CUSTO TOTAL</div>
      <div class="stat-value" style="color:#f59e0b;">${fmt(custoTotal)}</div>
      <div class="stat-sub">${porObra.length} obra(s) ativa(s)</div>
    </div>
    <div class="stat-card" style="border-top:2px solid #22c55e;padding:18px;">
      <div class="stat-label">TOTAL RECEBIDO</div>
      <div class="stat-value" style="color:var(--verde-hl);">${fmt(totalRecebido)}</div>
      <div class="stat-sub">PLS + Entradas + Terreno</div>
    </div>
    <div class="stat-card" style="border-top:2px solid ${lucroGeral >= 0 ? '#22c55e' : '#ef4444'};padding:18px;">
      <div class="stat-label">LUCRO GERAL</div>
      <div class="stat-value" style="color:${corLucro};">${fmt(lucroGeral)}</div>
      <div class="stat-sub">venda - custo</div>
    </div>
    <div class="stat-card" style="border-top:2px solid ${margemGeral >= 15 ? '#22c55e' : margemGeral >= 0 ? '#f59e0b' : '#ef4444'};padding:18px;">
      <div class="stat-label">MARGEM GERAL</div>
      <div class="stat-value" style="color:${corMargem};">${m.valorVendaTotal > 0 ? margemGeral.toFixed(1)+'%' : '-'}</div>
      <div class="stat-sub">${margemGeral >= 15 ? 'saudável' : margemGeral >= 0 ? 'atenção' : 'prejuízo'}</div>
    </div>
  </div>`;
}

function dashBuildAlertas(alertas) {
  if (!alertas.length) return '';
  return `<div style="background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.2);border-radius:12px;padding:12px 16px;margin-bottom:14px;">
    <div style="font-family:'Rajdhani',sans-serif;font-size:12px;font-weight:700;color:#ef4444;letter-spacing:2px;margin-bottom:8px;">⚠ OBRAS COM MARGEM NEGATIVA</div>
    ${alertas.map(o => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(239,68,68,0.08);">
        <span style="font-size:12px;color:var(--branco);font-weight:600;cursor:pointer;" onclick="setView('custos');setTimeout(()=>custosAbrirDetalhe('${esc(o.id)}'),100)">${esc(o.nome)}</span>
        <div style="display:flex;gap:12px;align-items:center;">
          <span style="font-size:11px;color:#ef4444;font-weight:700;">${o.margem.toFixed(1)}%</span>
          <span style="font-size:11px;color:var(--texto3);">Prejuízo: ${fmt(Math.abs(o.lucro))}</span>
        </div>
      </div>`).join('')}
  </div>`;
}

function dashBuildSaudeObras(porObra) {
  return `<div class="card" style="padding:16px;margin-bottom:14px;">
    <div style="font-size:13px;font-weight:700;color:var(--texto2);letter-spacing:0.5px;margin-bottom:16px;display:flex;align-items:center;gap:8px;"><span style="width:6px;height:6px;border-radius:50%;background:#22c55e;"></span> Saúde das Obras</div>
    ${porObra.map(o => {
      const pctReceb = o.vv > 0 ? Math.min((o.receb/o.vv*100),100) : 0;
      const corM = o.margem >= 15 ? 'var(--verde-hl)' : o.margem >= 0 ? '#f59e0b' : '#ef4444';
      const addInfo = o.adds && o.adds.qtd > 0 ? `<span style="font-size:10px;color:#a78bfa;">📝 +${fmt(o.adds.valorTotal)}</span>` : '';
      return `
      <div style="padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.06);cursor:pointer;transition:padding .15s;" onclick="setView('custos');setTimeout(()=>custosAbrirDetalhe('${esc(o.id)}'),100)">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
          <span style="font-size:13px;color:var(--branco);font-weight:600;">${esc(o.nome)}</span>
          <div style="display:flex;gap:14px;align-items:center;">
            <span style="font-size:11px;color:#f59e0b;">Custo: ${fmt(o.custo)}</span>
            ${addInfo}
            ${o.vv > 0 || (o.adds && o.adds.qtd > 0) ? `<span style="font-size:11px;font-weight:700;color:${corM};">Margem: ${o.margem.toFixed(1)}%</span>` : '<span style="font-size:10px;color:var(--texto3);">Sem valor de venda</span>'}
          </div>
        </div>
        ${o.vv > 0 ? `<div style="display:flex;align-items:center;gap:8px;">
          <div style="flex:1;height:4px;background:rgba(255,255,255,0.04);border-radius:2px;overflow:hidden;">
            <div style="width:${pctReceb}%;height:100%;background:var(--verde3);border-radius:2px;"></div>
          </div>
          <span style="font-size:9px;color:var(--texto3);min-width:60px;text-align:right;">Receb. ${pctReceb.toFixed(0)}%</span>
        </div>` : ''}
      </div>`;
    }).join('')}
  </div>`;
}

// ── RESUMO FINANCEIRO GERAL ─────────────────────────────────
let _dashFinFiltro = null; // null = geral, 'YYYY-MM' = mês específico

function _dashFinMeses() {
  // Coleta todos os meses com dados (lançamentos + repasses)
  const meses = new Set();
  lancamentos.forEach(l => { if (l.data) meses.add(l.data.slice(0, 7)); });
  repassesCef.forEach(r => { if (r.data_credito) meses.add(r.data_credito.slice(0, 7)); });
  return [...meses].sort().reverse();
}

function _dashFinFiltroBar() {
  const meses = _dashFinMeses();
  const atual = _dashFinFiltro;
  const btnStyle = (ativo) => `padding:6px 14px;border-radius:8px;border:1px solid ${ativo ? '#3b82f6' : 'rgba(255,255,255,0.1)'};background:${ativo ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.04)'};color:${ativo ? '#3b82f6' : 'var(--texto3)'};font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;letter-spacing:0.5px;`;
  const opts = meses.map(m => {
    const [a, mm] = m.split('-');
    const label = new Date(+a, +mm - 1).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }).toUpperCase();
    return `<option value="${m}" ${atual === m ? 'selected' : ''}>${label}</option>`;
  }).join('');
  return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;flex-wrap:wrap;">
    <button onclick="_dashFinSetFiltro(null)" style="${btnStyle(!atual)}">GERAL</button>
    <select onchange="_dashFinSetFiltro(this.value||null)" style="padding:6px 10px;border-radius:8px;border:1px solid ${atual ? '#3b82f6' : 'rgba(255,255,255,0.1)'};background:${atual ? 'rgba(59,130,246,0.15)' : 'var(--bg2)'};color:${atual ? '#3b82f6' : 'var(--texto3)'};font-size:11px;font-weight:700;font-family:inherit;cursor:pointer;">
      <option value="">MENSAL</option>${opts}
    </select>
  </div>`;
}

function _dashFinSetFiltro(val) {
  _dashFinFiltro = val || null;
  // Re-renderiza só o conteúdo financeiro
  const m = calcDashMetricas();
  const porObra = calcDashPorObra(m.lancAtivos);
  const html = dashBuildResumoFinanceiro(porObra);
  // Mobile ou desktop
  const elMob = document.getElementById('dash-page-1');
  const elDesk = document.getElementById('dash-dpage-1');
  if (elMob) elMob.innerHTML = html;
  if (elDesk) elDesk.innerHTML = html;
}

function _dashFinCalcObra(o, filtroMes) {
  let custo, receb, mao, adds;
  if (filtroMes) {
    const lancObra = lancamentos.filter(l => l.obra_id === o.id && (l.data || '').startsWith(filtroMes));
    custo = lancObra.reduce((s, l) => s + Number(l.total || 0), 0);
    mao = lancObra.filter(l => (typeof getCatFromLanc === 'function' ? getCatFromLanc(l) : '') === '28_mao').reduce((s, l) => s + Number(l.total || 0), 0);
    const reps = repassesCef.filter(r => r.obra_id === o.id && (r.data_credito || '').startsWith(filtroMes));
    receb = reps.reduce((s, r) => s + Number(r.valor || 0), 0);
    // Adicionais do mês — filtra pagamentos direto no array global
    if (typeof obrasAdicionais !== 'undefined' && typeof adicionaisPgtos !== 'undefined') {
      const listaAdd = obrasAdicionais.filter(a => a.obra_id === o.id);
      const addIds = new Set(listaAdd.map(a => a.id));
      const valorTotal = listaAdd.reduce((s, a) => s + Number(a.valor || 0), 0);
      const pgtosMes = adicionaisPgtos.filter(p => addIds.has(p.adicional_id) && (p.data || '').startsWith(filtroMes));
      const addRecebMes = pgtosMes.reduce((s, p) => s + Number(p.valor || 0), 0);
      adds = { valorTotal, totalRecebido: addRecebMes, saldo: 0 };
    } else {
      adds = { valorTotal: 0, totalRecebido: 0, saldo: 0 };
    }
  } else {
    const lancObra = lancamentos.filter(l => l.obra_id === o.id);
    custo = lancObra.reduce((s, l) => s + Number(l.total || 0), 0);
    mao = lancObra.filter(l => (typeof getCatFromLanc === 'function' ? getCatFromLanc(l) : '') === '28_mao').reduce((s, l) => s + Number(l.total || 0), 0);
    const reps = repassesCef.filter(r => r.obra_id === o.id);
    receb = reps.reduce((s, r) => s + Number(r.valor || 0), 0);
    adds = typeof getAdicionaisObra === 'function' ? getAdicionaisObra(o.id) : { valorTotal: 0, totalRecebido: 0, saldo: 0 };
  }
  const vv = Number(o.valor_venda || 0);
  const entradas = receb + (adds?.totalRecebido || 0);
  const receita = vv + (adds?.valorTotal || 0);
  const faltaReceber = filtroMes ? 0 : (receita - entradas); // falta receber só faz sentido no geral
  const saldo = entradas - custo;
  const pctReceb = receita > 0 ? (entradas / receita * 100) : 0;
  return { ...o, nome: o.nome, id: o.id, vv, custo, receb, entradas, receita, faltaReceber, saldo, mao, pctReceb, adds };
}

function dashBuildResumoFinanceiro(porObra) {
  if (!porObra.length) return '';
  if (typeof calcularValorEstoque === 'function') calcularValorEstoque();

  const filtroMes = _dashFinFiltro;

  // Recalcula por obra com filtro
  let totalEntradas = 0, totalSaidas = 0, totalReceita = 0, totalMao = 0;
  const obrasData = obras.filter(o => porObra.some(p => p.id === o.id)).map(o => {
    const d = _dashFinCalcObra(o, filtroMes);
    totalEntradas += d.entradas;
    totalSaidas += d.custo;
    totalReceita += d.receita;
    totalMao += d.mao;
    return d;
  }).filter(d => d.custo > 0 || d.entradas > 0 || (!filtroMes && d.vv > 0));

  const totalFaltaReceber = filtroMes ? 0 : (totalReceita - totalEntradas);
  const saldoGeral = totalEntradas - totalSaidas;
  const lucroProjetado = totalReceita - totalSaidas;
  const margemProj = totalReceita > 0 ? (lucroProjetado / totalReceita * 100) : 0;
  const pctRecebGeral = totalReceita > 0 ? (totalEntradas / totalReceita * 100) : 0;

  // Label do período
  const periodoLabel = filtroMes
    ? new Date(+filtroMes.slice(0,4), +filtroMes.slice(5,7)-1).toLocaleDateString('pt-BR', { month:'long', year:'numeric' }).toUpperCase()
    : 'OBRAS ATIVAS';

  const cardG = (icone, label, valor, cor, sub) => `
    <div style="background:var(--bg2);border:1px solid var(--borda2);border-radius:12px;padding:16px;position:relative;overflow:hidden;">
      <div style="position:absolute;top:10px;right:12px;font-size:24px;opacity:0.2;">${icone}</div>
      <div style="font-size:10px;color:var(--texto3);font-weight:700;letter-spacing:1.5px;margin-bottom:6px;">${label}</div>
      <div style="font-size:22px;font-weight:800;color:${cor};font-family:'Rajdhani',sans-serif;line-height:1;">${fmtR(valor)}</div>
      <div style="font-size:10px;color:var(--texto4);margin-top:6px;">${sub}</div>
    </div>`;

  // Cards gerais
  const subEntradas = filtroMes ? `Repasses + Extras do mês` : `PLs + Entrada + Terreno + Extras`;
  const subSaidas = `Material: ${fmtR(totalSaidas - totalMao)} · Mão: ${fmtR(totalMao)}`;
  const subFalta = `Receita: ${fmtR(totalReceita)} · Recebido: ${fmtR(totalEntradas)}`;

  let html = `<div style="margin-bottom:20px;">
    <div style="font-size:13px;font-weight:700;color:var(--verde-hl);letter-spacing:2px;margin-bottom:14px;font-family:'Rajdhani',sans-serif;">📊 RESUMO FINANCEIRO — ${periodoLabel}</div>
    ${_dashFinFiltroBar()}
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin-bottom:14px;">
      ${cardG('💰', filtroMes ? 'ENTRADAS NO MÊS' : 'TOTAL ENTRADAS', totalEntradas, '#22c55e', subEntradas)}
      ${cardG('📤', filtroMes ? 'SAÍDAS NO MÊS' : 'TOTAL SAÍDAS', totalSaidas, '#ef4444', subSaidas)}
      ${filtroMes ? cardG('📊', 'SALDO DO MÊS', saldoGeral, saldoGeral >= 0 ? '#22c55e' : '#ef4444', 'Entradas − Saídas no período') : cardG('🏦', 'FALTA RECEBER', totalFaltaReceber, '#3b82f6', subFalta)}
    </div>`;

  // Barra progresso recebido (só no geral)
  if (!filtroMes) {
    html += `<div style="background:var(--bg2);border:1px solid var(--borda2);border-radius:12px;padding:14px;margin-bottom:14px;">
      <div style="font-size:10px;color:var(--texto3);font-weight:700;letter-spacing:1px;margin-bottom:8px;">RECEBIDO vs RECEITA TOTAL</div>
      <div style="height:10px;background:rgba(255,255,255,0.06);border-radius:5px;overflow:hidden;">
        <div style="height:100%;width:${Math.min(pctRecebGeral, 100)}%;background:linear-gradient(90deg,#22c55e,#16a085);border-radius:5px;transition:width .5s;"></div>
      </div>
      <div style="display:flex;justify-content:space-between;margin-top:6px;font-size:10px;color:var(--texto4);">
        <span>Recebido: <strong style="color:#22c55e;">${fmtR(totalEntradas)}</strong> (${pctRecebGeral.toFixed(0)}%)</span>
        <span>Receita: <strong style="color:var(--branco);">${fmtR(totalReceita)}</strong></span>
      </div>
    </div>`;
  }

  // Saldo + Lucro
  if (filtroMes) {
    // No modo mensal: só saldo do mês (já mostrado nos 3 cards acima)
  } else {
    html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;">
      ${cardG('📊', 'SALDO (ENTRADAS − SAÍDAS)', saldoGeral, saldoGeral >= 0 ? '#22c55e' : '#ef4444', 'Caixa disponível das obras')}
      ${cardG('📈', 'LUCRO PROJETADO', lucroProjetado, lucroProjetado >= 0 ? '#f59e0b' : '#ef4444', `Receita − Gasto · Margem: ${margemProj.toFixed(0)}%`)}
    </div>`;
  }

  // Estoque como patrimônio
  if (typeof _valorEstoqueAtual !== 'undefined' && _valorEstoqueAtual > 0) {
    const saldoReal = saldoGeral + _valorEstoqueAtual;
    html += `<div style="background:var(--bg2);border:1px solid var(--borda2);border-radius:12px;padding:14px;margin-bottom:14px;display:flex;align-items:center;gap:16px;flex-wrap:wrap;">
      <div style="flex:1;min-width:150px;">
        <div style="font-size:10px;color:var(--texto3);font-weight:700;letter-spacing:1px;margin-bottom:4px;">📦 MATERIAL EM ESTOQUE</div>
        <div style="font-size:20px;font-weight:800;color:#f59e0b;font-family:'Rajdhani',sans-serif;">${fmtR(_valorEstoqueAtual)}</div>
        <div style="font-size:10px;color:var(--texto4);margin-top:2px;">Dinheiro parado em material</div>
      </div>
      <div style="flex:1;min-width:150px;">
        <div style="font-size:10px;color:var(--texto3);font-weight:700;letter-spacing:1px;margin-bottom:4px;">💎 SALDO REAL (CAIXA + ESTOQUE)</div>
        <div style="font-size:20px;font-weight:800;color:${saldoReal >= 0 ? '#22c55e' : '#ef4444'};font-family:'Rajdhani',sans-serif;">${fmtR(saldoReal)}</div>
        <div style="font-size:10px;color:var(--texto4);margin-top:2px;">Saldo financeiro + patrimônio em material</div>
      </div>
    </div>`;
  }

  // Por obra
  html += `<div style="font-size:11px;font-weight:700;color:var(--texto2);letter-spacing:1px;margin-bottom:10px;">🏗 POR OBRA</div>`;
  if (!obrasData.length) {
    html += `<div style="text-align:center;color:var(--texto4);font-size:12px;padding:20px;">Nenhum movimento neste mês</div>`;
  }
  obrasData.sort((a,b) => b.custo - a.custo).forEach(o => {
    const corPct = o.pctReceb >= 70 ? '#22c55e' : o.pctReceb >= 40 ? '#f59e0b' : '#ef4444';
    const corSaldo = o.saldo >= 0 ? '#22c55e' : '#ef4444';
    html += `<div style="background:var(--bg2);border:1px solid var(--borda2);border-radius:12px;padding:14px;margin-bottom:8px;cursor:pointer;" onclick="setView('custos');setTimeout(()=>custosAbrirDetalhe('${esc(o.id)}'),100)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <div style="font-size:13px;font-weight:700;color:var(--branco);max-width:55%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(o.nome)}</div>
        <div style="font-size:10px;font-weight:700;padding:3px 10px;border-radius:20px;background:${corPct}18;color:${corPct};">${filtroMes ? fmtR(o.saldo, true) : o.pctReceb.toFixed(0) + '% recebido'}</div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(${filtroMes ? 3 : 4},1fr);gap:8px;margin-bottom:10px;">
        <div><div style="font-size:9px;color:var(--texto4);font-weight:700;letter-spacing:0.5px;margin-bottom:2px;">ENTRADAS</div><div style="font-size:13px;font-weight:800;color:#22c55e;font-family:'Rajdhani',sans-serif;">${fmtR(o.entradas, true)}</div></div>
        <div><div style="font-size:9px;color:var(--texto4);font-weight:700;letter-spacing:0.5px;margin-bottom:2px;">SAÍDAS</div><div style="font-size:13px;font-weight:800;color:#ef4444;font-family:'Rajdhani',sans-serif;">${fmtR(o.custo, true)}</div></div>
        ${filtroMes ? '' : `<div><div style="font-size:9px;color:var(--texto4);font-weight:700;letter-spacing:0.5px;margin-bottom:2px;">FALTA RECEBER</div><div style="font-size:13px;font-weight:800;color:#3b82f6;font-family:'Rajdhani',sans-serif;">${fmtR(o.faltaReceber, true)}</div></div>`}
        <div><div style="font-size:9px;color:var(--texto4);font-weight:700;letter-spacing:0.5px;margin-bottom:2px;">SALDO</div><div style="font-size:13px;font-weight:800;color:${corSaldo};font-family:'Rajdhani',sans-serif;">${fmtR(o.saldo, true)}</div></div>
      </div>
      ${filtroMes ? '' : `<div style="height:6px;background:rgba(255,255,255,0.06);border-radius:3px;overflow:hidden;">
        <div style="height:100%;width:${Math.min(o.pctReceb, 100)}%;background:linear-gradient(90deg,${corPct},${corPct}cc);border-radius:3px;transition:width .5s;"></div>
      </div>`}
    </div>`;
  });

  html += `</div>`;
  return html;
}

function dashBuildSaudeObrasCompacta(porObra) {
  if (!porObra.length) return '';
  return `<div class="card" style="padding:16px;margin-bottom:14px;">
    <div style="font-size:13px;font-weight:700;color:var(--texto2);letter-spacing:0.5px;margin-bottom:12px;display:flex;align-items:center;gap:8px;"><span style="width:6px;height:6px;border-radius:50%;background:#22c55e;"></span> Obras</div>
    ${porObra.map(o => {
      const pctReceb = o.vv > 0 ? Math.min((o.receb/o.vv*100),100) : 0;
      const corM = o.margem >= 15 ? 'var(--verde-hl)' : o.margem >= 0 ? '#f59e0b' : '#ef4444';
      return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.04);cursor:pointer;" onclick="setView('custos');setTimeout(()=>custosAbrirDetalhe('${esc(o.id)}'),100)">
        <div style="flex:1;min-width:0;">
          <div style="font-size:12px;color:var(--branco);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(o.nome)}</div>
        </div>
        <div style="width:80px;height:4px;background:rgba(255,255,255,0.04);border-radius:2px;overflow:hidden;flex-shrink:0;">
          <div style="width:${pctReceb}%;height:100%;background:var(--verde3);border-radius:2px;"></div>
        </div>
        <span style="font-size:10px;font-weight:700;color:${corM};min-width:40px;text-align:right;">${o.vv > 0 ? o.margem.toFixed(0)+'%' : '—'}</span>
      </div>`;
    }).join('')}
  </div>`;
}

// ── GRÁFICOS ────────────────────────────────────────────────
function dashRenderFluxoCaixa(lancAtivos, obraAtivaIds) {
  const el = document.getElementById('dash-fluxo-caixa');
  if (!el) return;
  const hoje = new Date();
  const mesesArr = [];
  for (let i = 5; i >= 0; i--) {
    let m = hoje.getMonth() + 1 - i;
    let a = hoje.getFullYear();
    while (m <= 0) { m += 12; a--; }
    mesesArr.push(a + '-' + String(m).padStart(2, '0'));
  }
  const MESES_LBL = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const dados = mesesArr.map(ym => {
    const saidas = lancAtivos.filter(l => l.data && l.data.startsWith(ym)).reduce((s,l) => s + Number(l.total||0), 0);
    const repMes = repassesCef.filter(r => obraAtivaIds.has(r.obra_id) && r.data_credito && r.data_credito.startsWith(ym)).reduce((s,r) => s + Number(r.valor||0), 0);
    const pgtosMes = (typeof adicionaisPgtos !== 'undefined' ? adicionaisPgtos : []).filter(p => p.data && p.data.startsWith(ym)).reduce((s,p) => s + Number(p.valor||0), 0);
    return { ym, entradas: repMes + pgtosMes, saidas };
  });
  const maxVal = Math.max(...dados.map(d => Math.max(d.entradas, d.saidas)), 1);
  const mesAtual = hoje.getFullYear() + '-' + String(hoje.getMonth()+1).padStart(2,'0');

  let html = `<div style="display:flex;gap:16px;margin-bottom:10px;">
    <span style="display:flex;align-items:center;gap:4px;font-size:10px;color:var(--texto3);"><span style="width:10px;height:10px;background:#2ecc71;border-radius:2px;display:inline-block;"></span> Entradas</span>
    <span style="display:flex;align-items:center;gap:4px;font-size:10px;color:var(--texto3);"><span style="width:10px;height:10px;background:#e74c3c;border-radius:2px;display:inline-block;"></span> Saidas</span>
  </div><div style="display:flex;gap:6px;align-items:flex-end;">`;
  dados.forEach(d => {
    const [,m] = d.ym.split('-');
    const hE = Math.max(d.entradas / maxVal * 120, d.entradas > 0 ? 4 : 0);
    const hS = Math.max(d.saidas / maxVal * 120, d.saidas > 0 ? 4 : 0);
    const isAtual = d.ym === mesAtual;
    const saldo = d.entradas - d.saidas;
    const corSaldo = saldo >= 0 ? '#2ecc71' : '#ef4444';
    html += `<div style="flex:1;text-align:center;${isAtual ? 'background:rgba(34,197,94,0.04);border-radius:8px;padding:4px 2px;border:1px solid rgba(34,197,94,0.1);' : ''}">
      <div style="display:flex;gap:2px;justify-content:center;align-items:flex-end;height:120px;">
        <div style="width:40%;height:${hE}px;background:linear-gradient(0deg,#16a085,#2ecc71);border-radius:3px 3px 0 0;" title="Entradas: ${fmtR(d.entradas)}"></div>
        <div style="width:40%;height:${hS}px;background:linear-gradient(0deg,#c0392b,#e74c3c);border-radius:3px 3px 0 0;" title="Saidas: ${fmtR(d.saidas)}"></div>
      </div>
      <div style="font-size:10px;color:${isAtual ? 'var(--verde-hl)' : 'var(--texto3)'};font-weight:${isAtual ? '700' : '400'};margin-top:4px;">${MESES_LBL[parseInt(m)-1]}</div>
      <div style="font-size:9px;color:${corSaldo};font-weight:600;font-family:'JetBrains Mono',monospace;">${saldo >= 0 ? '+' : ''}${fmtR(saldo, true)}</div>
    </div>`;
  });
  html += '</div>';
  el.innerHTML = html;
}

function dashRenderCustoReceita(porObra) {
  const el = document.getElementById('dash-custo-receita');
  if (!el) return;
  const dados = porObra.filter(o => o.vv > 0 || o.custo > 0);
  if (!dados.length) { el.innerHTML = '<div style="color:var(--texto3);font-size:12px;">Nenhuma obra com dados.</div>'; return; }
  const maxVal = Math.max(...dados.map(d => Math.max(d.custo, d.vv + (d.adds?.valorTotal || 0))), 1);
  el.innerHTML = dados.map(o => {
    const receita = o.vv + (o.adds?.valorTotal || 0);
    const pctCusto = o.custo / maxVal * 100;
    const pctReceita = receita / maxVal * 100;
    const corM = o.margem >= 15 ? '#2ecc71' : o.margem >= 0 ? '#f59e0b' : '#ef4444';
    return `<div style="margin-bottom:14px;cursor:pointer;" onclick="setView('custos');setTimeout(()=>custosAbrirDetalhe('${esc(o.id)}'),100)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <span style="font-size:12px;color:var(--branco);font-weight:600;">${esc(o.nome)}</span>
        <span style="font-size:11px;font-weight:700;color:${corM};">${receita > 0 ? o.margem.toFixed(0) + '%' : '—'}</span>
      </div>
      <div style="position:relative;height:22px;background:rgba(255,255,255,0.04);border-radius:4px;overflow:hidden;">
        ${receita > 0 ? `<div style="position:absolute;top:0;left:0;height:100%;width:${pctReceita}%;background:rgba(34,197,94,0.1);border-radius:4px;border:1px solid rgba(34,197,94,0.15);"></div>` : ''}
        <div style="position:absolute;top:0;left:0;height:100%;width:${pctCusto}%;background:${o.margem < 0 ? 'rgba(239,68,68,0.5)' : 'rgba(245,158,11,0.5)'};border-radius:4px;"></div>
      </div>
      <div style="display:flex;justify-content:space-between;margin-top:3px;font-size:10px;">
        <span style="color:#f59e0b;">Custo: ${fmt(o.custo)}</span>
        <span style="color:var(--verde-hl);">${receita > 0 ? 'Receita: ' + fmt(receita) : 'Sem valor de venda'}</span>
      </div>
    </div>`;
  }).join('');
}

function dashRenderTopEtapas(etapaEntries) {
  const el = document.getElementById('dash-top-etapas');
  if (!el) return;
  const totalCusto = etapaEntries.reduce((s,[,v]) => s + v, 0);
  const coresEtapa = ['#2ecc71','#3498db','#e67e22','#9b59b6','#e74c3c','#1abc9c','#f39c12','#27ae60'];
  el.innerHTML = etapaEntries.map(([lb, val], i) => {
    const pct = totalCusto > 0 ? (val / totalCusto * 100) : 0;
    return `<div style="margin-bottom:8px;">
      <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:3px;">
        <span style="color:var(--branco);font-weight:600;">${lb}</span>
        <span style="color:var(--texto2);">${fmtR(val)} <span style="color:var(--texto3);">(${pct.toFixed(1)}%)</span></span>
      </div>
      <div style="height:6px;background:rgba(255,255,255,0.06);border-radius:3px;overflow:hidden;">
        <div style="height:100%;width:${pct}%;background:${coresEtapa[i % coresEtapa.length]};border-radius:3px;transition:width .5s;"></div>
      </div>
    </div>`;
  }).join('') || '<div style="color:var(--texto3);font-size:12px;">Sem dados.</div>';
}

// ── RENDER PRINCIPAL ────────────────────────────────────────
function renderDashboard() {
  document.getElementById('dash-loading').classList.add('hidden');
  document.getElementById('dash-content').classList.remove('hidden');

  if (usuarioAtual?.perfil !== 'admin') { renderDashboardOperador(); return; }

  const el = document.getElementById('dash-admin-content');
  if (!el) return;

  // Cálculos
  const m = calcDashMetricas();
  const porObra = calcDashPorObra(m.lancAtivos);
  const alertas = porObra.filter(o => o.vv > 0 && o.margem < 0);
  const etapaEntries = calcDashEtapas(m.lancAtivos);
  const obraMap = {};
  obras.forEach(o => obraMap[o.id] = o.nome);
  const ultimos = [...m.lancAtivos].sort((a,b) => new Date(b.data||0) - new Date(a.data||0)).slice(0, 5);
  const dataStr = new Date().toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'short',year:'numeric'}).toUpperCase();

  // Contas vencidas
  const contasVenc = typeof getContasVencidas === 'function' ? getContasVencidas().length : 0;

  // KPI Grid estilo NaRegua
  const kpis = [
    { num: fmt(m.receitaTotal), label: 'Receita Total', cor: '#3b82f6', bg: 'linear-gradient(135deg,#1a5276,#2e86c1)' },
    { num: fmt(m.custoTotal), label: 'Custo Total', cor: '#f59e0b', bg: 'linear-gradient(135deg,#b7950b,#f1c40f)' },
    { num: fmt(m.lucroGeral), label: 'Lucro', cor: m.lucroGeral >= 0 ? '#22c55e' : '#ef4444', bg: m.lucroGeral >= 0 ? 'linear-gradient(135deg,#1e8449,#27ae60)' : 'linear-gradient(135deg,#922b21,#e74c3c)' },
    { num: m.valorVendaTotal > 0 ? m.margemGeral.toFixed(1)+'%' : '—', label: 'Margem', cor: '#a855f7', bg: 'linear-gradient(135deg,#6c3483,#9b59b6)' },
    { num: porObra.length, label: 'Obras Ativas', cor: '#22c55e', bg: 'linear-gradient(135deg,#1e8449,#2ecc71)' },
    { num: contasVenc, label: 'Contas Vencidas', cor: '#ef4444', bg: contasVenc > 0 ? 'linear-gradient(135deg,#922b21,#e74c3c)' : 'linear-gradient(135deg,#1e8449,#27ae60)' },
  ];

  // Contas vencidas
  let contasVencHTML = '';
  if (typeof getContasVencidas === 'function') {
    const vencidas = getContasVencidas();
    if (vencidas.length > 0) {
      const totalVenc = vencidas.reduce((s, c) => s + Number(c.valor || 0), 0);
      contasVencHTML = `<div style="background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.2);border-radius:12px;padding:14px 16px;margin-top:14px;cursor:pointer;" onclick="setView('contas-pagar')">
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <div>
            <div style="font-family:'Rajdhani',sans-serif;font-size:12px;font-weight:700;color:#ef4444;letter-spacing:2px;">🚨 CONTAS VENCIDAS</div>
            <div style="font-size:13px;color:var(--branco);margin-top:4px;font-weight:600;">${vencidas.length} conta${vencidas.length > 1 ? 's' : ''} vencida${vencidas.length > 1 ? 's' : ''} — ${fmt(totalVenc)}</div>
          </div>
          <button style="padding:6px 14px;border-radius:8px;border:1px solid rgba(239,68,68,0.3);background:rgba(239,68,68,0.08);color:#ef4444;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;">VER CONTAS</button>
        </div>
      </div>`;
    }
  }

  const kpiCols = window.innerWidth <= 768 ? 2 : 3;
  const kpisHTML = `<div style="display:grid;grid-template-columns:repeat(${kpiCols},1fr);gap:10px;margin-bottom:16px;">
    ${kpis.map(k => `<div style="background:${k.bg};border-radius:14px;padding:16px 12px;text-align:center;cursor:pointer;transition:all .2s;" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform=''">
      <div style="font-size:18px;font-weight:800;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,0.3);line-height:1.2;">${k.num}</div>
      <div style="font-size:9px;font-weight:700;color:rgba(255,255,255,0.85);letter-spacing:0.8px;text-transform:uppercase;margin-top:4px;">${k.label}</div>
    </div>`).join('')}
  </div>`;

  const isMobile = window.innerWidth <= 768;

  if (isMobile) {
    // ── MOBILE: Abas com swipe (conteúdo rola vertical normalmente) ──
    const pages = [
      { label: 'Resumo', html: kpisHTML + dashBuildAlertas(alertas) + contasVencHTML + dashBuildAgenda() },
      { label: 'Financeiro', html: dashBuildResumoFinanceiro(porObra) },
      { label: 'Obras', html: dashBuildSaudeObrasCompacta(porObra) },
    ];

    const tabsHTML = pages.map((p, i) =>
      `<button onclick="dashMobileTab(${i})" id="dash-tab-${i}" style="flex:1;background:none;border:none;color:${i === 0 ? '#3b82f6' : 'var(--texto3)'};font-size:11px;font-weight:700;font-family:'Rajdhani',sans-serif;letter-spacing:1px;cursor:pointer;padding:10px 0;border-bottom:2px solid ${i === 0 ? '#3b82f6' : 'transparent'};transition:all .2s;">${p.label.toUpperCase()}</button>`
    ).join('');

    const pagesHTML = pages.map((p, i) =>
      `<div id="dash-page-${i}" style="display:${i === 0 ? 'block' : 'none'};">${p.html}</div>`
    ).join('');

    el.innerHTML = `
      ${dashBuildHeader(dataStr)}
      <div style="display:flex;margin-bottom:14px;border-bottom:1px solid rgba(255,255,255,0.06);" id="dash-tabs-bar">${tabsHTML}</div>
      <div id="dash-pages">${pagesHTML}</div>`;

    // Touch swipe pra trocar abas
    _dashMobileSwipeInit();
  } else {
    // ── DESKTOP: Abas horizontais ──
    const deskPages = [
      { label: 'Resumo', html: kpisHTML + dashBuildAlertas(alertas) + contasVencHTML },
      { label: 'Financeiro', html: dashBuildResumoFinanceiro(porObra) },
      { label: 'Agenda', html: dashBuildAgenda() },
      { label: 'Obras', html: dashBuildSaudeObrasCompacta(porObra) },
    ];

    const deskTabsHTML = deskPages.map((p, i) =>
      `<button onclick="dashDesktopTab(${i})" id="dash-dtab-${i}" style="background:none;border:none;color:${i === 0 ? '#3b82f6' : 'var(--texto3)'};font-size:13px;font-weight:700;font-family:'Rajdhani',sans-serif;letter-spacing:1.5px;cursor:pointer;padding:10px 24px;border-bottom:2px solid ${i === 0 ? '#3b82f6' : 'transparent'};transition:all .2s;">${p.label.toUpperCase()}</button>`
    ).join('');

    const deskPagesHTML = deskPages.map((p, i) =>
      `<div id="dash-dpage-${i}" style="display:${i === 0 ? 'block' : 'none'};">${p.html}</div>`
    ).join('');

    el.innerHTML = `
      ${dashBuildHeader(dataStr)}
      <div style="display:flex;margin-bottom:18px;border-bottom:1px solid rgba(255,255,255,0.06);" id="dash-dtabs-bar">${deskTabsHTML}</div>
      <div id="dash-dpages">${deskPagesHTML}</div>`;
  }

  setTimeout(autoFitStatValues, 50);
  _renderAgendaLegenda();
}

// ── DESKTOP TAB HELPERS ───────────────────────────────────
function dashDesktopTab(idx) {
  const count = 4;
  for (let i = 0; i < count; i++) {
    const page = document.getElementById('dash-dpage-' + i);
    const tab = document.getElementById('dash-dtab-' + i);
    if (page) page.style.display = i === idx ? 'block' : 'none';
    if (tab) {
      tab.style.color = i === idx ? '#3b82f6' : 'var(--texto3)';
      tab.style.borderBottomColor = i === idx ? '#3b82f6' : 'transparent';
    }
  }
  if (idx === 2) setTimeout(_renderAgendaLegenda, 50);
}

// ── MOBILE TAB/SWIPE HELPERS ──────────────────────────────
let _dashCurrentTab = 0;
const _DASH_TAB_COUNT = 3;

function dashMobileTab(idx) {
  _dashCurrentTab = idx;
  for (let i = 0; i < _DASH_TAB_COUNT; i++) {
    const page = document.getElementById('dash-page-' + i);
    const tab = document.getElementById('dash-tab-' + i);
    if (page) page.style.display = i === idx ? 'block' : 'none';
    if (tab) {
      tab.style.color = i === idx ? '#3b82f6' : 'var(--texto3)';
      tab.style.borderBottomColor = i === idx ? '#3b82f6' : 'transparent';
    }
  }
  // Re-renderizar legenda da agenda se for a aba de resumo
  if (idx === 0) setTimeout(_renderAgendaLegenda, 50);
}

function _dashMobileSwipeInit() {
  const pagesEl = document.getElementById('dash-pages');
  if (!pagesEl) return;
  let startX = 0, startY = 0, tracking = false;

  pagesEl.addEventListener('touchstart', function(e) {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    tracking = true;
  }, { passive: true });

  pagesEl.addEventListener('touchend', function(e) {
    if (!tracking) return;
    tracking = false;
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    // Só troca se o swipe horizontal for maior que o vertical (evita conflito com scroll)
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0 && _dashCurrentTab < _DASH_TAB_COUNT - 1) dashMobileTab(_dashCurrentTab + 1);
      if (dx > 0 && _dashCurrentTab > 0) dashMobileTab(_dashCurrentTab - 1);
    }
  }, { passive: true });
}
