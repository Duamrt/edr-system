function buildSecaoFaltas() {
  const regs = diarGetRegistrosQuinzena();
  if (!regs.length) return '<div class="rel-card" style="margin-top:16px;"><div class="rel-card-title">⚠ FALTAS — QUINZENA ATUAL</div><div style="color:var(--texto3);font-size:12px;">Nenhum registro de diárias na quinzena ativa.</div></div>';

  const diasLancados = [...new Set(regs.map(r => r.data))].sort();
  const faltas = diarGetFaltasQuinzena();
  const totalDias = diasLancados.length;

  const linhas = DIAR_TEAM.map(nome => {
    const f = faltas[nome] || 0;
    const presencas = totalDias - f;
    const pct = totalDias > 0 ? Math.round(presencas/totalDias*100) : 100;
    const cor = f === 0 ? 'var(--verde-hl)' : f <= 1 ? '#fbbf24' : '#f87171';
    return `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--borda);">
      <span style="font-weight:600;font-size:13px;">${nome}</span>
      <div style="display:flex;align-items:center;gap:12px;">
        <span style="font-size:11px;color:var(--texto3);">${presencas}/${totalDias} dias</span>
        ${f > 0 ? `<span style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);color:#f87171;border-radius:6px;padding:2px 8px;font-size:11px;font-weight:700;">⚠ ${f} falta${f>1?'s':''}</span>` : '<span style="color:var(--verde-hl);font-size:11px;font-weight:700;">✓ Sem faltas</span>'}
        <div style="width:60px;height:6px;background:rgba(255,255,255,0.07);border-radius:3px;overflow:hidden;"><div style="height:100%;width:${pct}%;background:${cor};border-radius:3px;"></div></div>
      </div>
    </div>`;
  }).join('');

  const diasHtml = diasLancados.map(dia => {
    const itens = regs.filter(r => r.data === dia);
    const faltasDia = diarGetFaltasDia(dia, itens);
    const df = new Date(dia + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }).toUpperCase();
    return faltasDia.length ? `<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.05);font-size:11px;">
      <span style="color:var(--texto2);">${df}</span>
      <span style="color:#fca5a5;">${faltasDia.join(', ')}</span>
    </div>` : '';
  }).filter(Boolean).join('');

  return `<div class="rel-card" style="margin-top:16px;">
    <div class="rel-card-title">⚠ FALTAS — ${diarQuinzenaAtiva?.label||'QUINZENA ATUAL'}</div>
    <div style="margin-bottom:16px;">${linhas}</div>
    ${diasHtml ? `<div style="margin-top:12px;"><div style="font-size:10px;font-weight:700;letter-spacing:1px;color:var(--texto3);margin-bottom:8px;font-family:'Rajdhani',sans-serif;">DETALHE POR DIA</div>${diasHtml}</div>` : ''}
  </div>`;
}

// ────────────────────────────────────────────
// CALENDÁRIO DO FUNCIONÁRIO
// ────────────────────────────────────────────
function diarAbrirCalendarioFunc(nome) {
  const modal = document.getElementById('diar-modalCalendario');
  modal.style.display = 'flex';

  const regs = diarGetRegistrosQuinzena();
  const q = diarQuinzenaAtiva;
  if (!q) return;

  // Gerar todos os dias da quinzena
  const inicio = new Date(q.data_inicio + 'T12:00:00');
  const fim    = new Date(q.data_fim    + 'T12:00:00');
  const dias = [];
  for (let d = new Date(inicio); d <= fim; d.setDate(d.getDate()+1)) {
    dias.push(d.toISOString().split('T')[0]);
  }

  // Registros deste funcionário
  const regsFun = regs.filter(r => r.nome === nome || r.funcionario === nome);
  const regsPorDia = {};
  regsFun.forEach(r => { regsPorDia[r.data] = r; });

  // Calcular cargo/diaria deste func
  const qualquer = regsFun[0];
  const cargo = qualquer?.cargo || '';
  const diaria = qualquer?.diaria_base || 0;

  // Contar presença
  const totalDias = dias.filter(d => {
    const dow = new Date(d + 'T12:00:00').getDay();
    return dow !== 0 && dow !== 6; // ignorar fim de semana no count
  }).length;
  const diasTrabalhados = dias.filter(d => regsPorDia[d]).length;
  const faltasDias = dias.filter(d => {
    const dow = new Date(d + 'T12:00:00').getDay();
    return dow !== 0 && dow !== 6 && !regsPorDia[d];
  }).length;
  const totalValor = regsFun.reduce((s,r) => s + Number(r.valor||0), 0);

  // Header
  document.getElementById('diar-calNome').innerHTML =
    `📅 ${nome} <span style="font-size:11px;font-weight:400;color:var(--texto3)">${cargo}</span>`;
  const isMestre = usuarioAtual?.perfil === 'mestre';
  document.getElementById('diar-calResumo').innerHTML =
    `<div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:4px;">
      <span>✅ <strong style="color:var(--verde-hl)">${diasTrabalhados}</strong> dias trabalhados</span>
      <span>❌ <strong style="color:#f87171">${faltasDias}</strong> falta(s)</span>
      ${isMestre ? '' : `<span>💰 <strong style="color:var(--verde-hl)">R$ ${totalValor.toLocaleString('pt-BR',{minimumFractionDigits:2})}</strong></span>`}
    </div>`;

  // Grade de dias
  const linhas = dias.map(dia => {
    const dt = new Date(dia + 'T12:00:00');
    const dow = dt.getDay();
    const fds = dow === 0 || dow === 6;
    const df = dt.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }).toUpperCase();
    const reg = regsPorDia[dia];

    if (fds) {
      return `<div style="display:flex;align-items:center;gap:10px;padding:7px 10px;border-bottom:1px solid rgba(255,255,255,0.04);opacity:0.35;">
        <div style="width:8px;height:8px;border-radius:50%;background:#444;flex-shrink:0"></div>
        <span style="font-size:11px;color:var(--texto3);width:110px">${df}</span>
        <span style="font-size:10px;color:var(--texto3)">fim de semana</span>
      </div>`;
    }

    if (reg) {
      let periodos = [];
      try { periodos = typeof reg.periodos === 'string' ? JSON.parse(reg.periodos||'[]') : (reg.periodos||[]); } catch(e) { console.warn('JSON periodos inválido:', reg.periodos); }
      const obras = periodos.map(p => {
        const t = p.turno === 'manha' ? '☀ manhã' : p.turno === 'tarde' ? '🌤 tarde' : '📅 dia todo';
        return `<span style="font-size:10px;color:var(--texto2)">${t} <strong style="color:var(--branco)">${p.obra}</strong></span>`;
      }).join(' · ');
      const val = Number(reg.valor||0);
      return `<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-bottom:1px solid rgba(255,255,255,0.04);background:rgba(255,255,255,0.03);">
        <div style="width:8px;height:8px;border-radius:50%;background:#2ecc71;flex-shrink:0;box-shadow:0 0 6px #2ecc7188"></div>
        <span style="font-size:11px;font-weight:600;color:var(--branco);width:110px">${df}</span>
        <div style="flex:1;font-size:10px">${obras}</div>
        ${isMestre ? '' : `<span style="font-size:11px;font-family:'JetBrains Mono',monospace;color:var(--verde-hl);white-space:nowrap">R$ ${val.toLocaleString('pt-BR',{minimumFractionDigits:2})}</span>`}
      </div>`;
    }

    // Falta
    return `<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-bottom:1px solid rgba(255,255,255,0.04);background:rgba(239,68,68,0.04);">
      <div style="width:8px;height:8px;border-radius:50%;background:#ef4444;flex-shrink:0;box-shadow:0 0 6px #ef444488"></div>
      <span style="font-size:11px;font-weight:600;color:#f87171;width:110px">${df}</span>
      <span style="font-size:11px;color:#f87171;font-style:italic">faltou</span>
    </div>`;
  }).join('');

  document.getElementById('diar-calBody').innerHTML =
    `<div style="border:1px solid var(--borda);border-radius:10px;overflow:hidden">${linhas}</div>`;
}


// ────────────────────────────────────────────
// DADOS DOS FUNCIONÁRIOS (dinâmico — Supabase)
// ────────────────────────────────────────────
let DIAR_FUNCIONARIOS = {};
let DIAR_FUNCIONARIOS_RAW = []; // array original do Supabase

// Fallback hardcoded (usado enquanto Supabase não responde)
const DIAR_FUNCIONARIOS_FALLBACK = {
  'anderson': { nome: 'Anderson', cargo: 'Mestre', diaria: 170 },
  'zezao':    { nome: 'Anderson', cargo: 'Mestre', diaria: 170 },
  'josimar':  { nome: 'Josimar', cargo: 'Betoneiro', diaria: 90 },
  'binlade':  { nome: 'Josimar', cargo: 'Betoneiro', diaria: 90 },
  'nego':     { nome: 'Nego', cargo: 'Pedreiro', diaria: 130 },
  'seu nego': { nome: 'Nego', cargo: 'Pedreiro', diaria: 130 },
  'adeilton': { nome: 'Adeilton', cargo: 'Pedreiro', diaria: 130 },
  'marcone':  { nome: 'Marcone', cargo: 'Servente', diaria: 80 },
  'rosinaldo':{ nome: 'Rosinaldo', cargo: 'Servente', diaria: 80 },
  'tana':     { nome: 'Rosinaldo', cargo: 'Servente', diaria: 80 },
  'val':      { nome: 'Val', cargo: 'Servente', diaria: 80 },
};
DIAR_FUNCIONARIOS = { ...DIAR_FUNCIONARIOS_FALLBACK };

async function diarCarregarFuncionarios() {
  try {
    const lista = await sbGet('diarias_funcionarios', '?order=nome.asc');
    if (!Array.isArray(lista) || !lista.length) return;
    DIAR_FUNCIONARIOS_RAW = lista;
    // Reconstruir mapa de aliases
    DIAR_FUNCIONARIOS = {};
    lista.filter(f => f.ativo).forEach(f => {
      const entry = { nome: f.nome, cargo: f.cargo, diaria: Number(f.diaria) };
      // Nome principal (minúsculo)
      DIAR_FUNCIONARIOS[f.nome.toLowerCase()] = entry;
      // Apelidos
      const apelidos = Array.isArray(f.apelidos) ? f.apelidos : [];
      apelidos.forEach(a => { if (a) DIAR_FUNCIONARIOS[a.toLowerCase()] = entry; });
    });
    // Atualizar DIAR_TEAM
    _diarAtualizarTeam();
  } catch(e) { console.warn('diarCarregarFuncionarios fallback', e); }
}

function _diarAtualizarTeam() {
  const ativos = DIAR_FUNCIONARIOS_RAW.filter(f => f.ativo);
  const ordem = { 'Mestre':1, 'Pedreiro':2, 'Betoneiro':3, 'Servente':4 };
  ativos.sort((a,b) => (ordem[a.cargo]||9) - (ordem[b.cargo]||9));
  // Substituir DIAR_TEAM com nomes únicos dos ativos
  DIAR_TEAM.length = 0;
  ativos.forEach(f => { if (!DIAR_TEAM.includes(f.nome)) DIAR_TEAM.push(f.nome); });
}

function diarGetFuncionariosAtivos() {
  if (DIAR_FUNCIONARIOS_RAW.length) return DIAR_FUNCIONARIOS_RAW.filter(f => f.ativo);
  // Fallback: extrair do mapa hardcoded
  const unicos = {};
  Object.values(DIAR_FUNCIONARIOS).forEach(f => { unicos[f.nome] = f; });
  return Object.values(unicos);
}

// ────────────────────────────────────────────
// CRUD FUNCIONÁRIOS — Modal
// ────────────────────────────────────────────
function diarAbrirModalEquipe() {
  let modal = document.getElementById('diar-modalEquipe');
  if (!modal) {
    document.body.insertAdjacentHTML('beforeend', `
    <div id="diar-modalEquipe" style="display:flex;position:fixed;inset:0;background:rgba(0,0,0,0.88);z-index:9999;align-items:center;justify-content:center;padding:16px">
      <div style="background:var(--bg2);border:1px solid var(--borda);border-radius:14px;width:100%;max-width:540px;max-height:90vh;overflow-y:auto;padding:22px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px">
          <div style="font-weight:800;font-size:15px;letter-spacing:.05em;color:var(--branco)">👷 EQUIPE DE OBRA</div>
          <button onclick="document.getElementById('diar-modalEquipe').style.display='none'" style="background:none;border:none;color:var(--texto3);font-size:18px;cursor:pointer;padding:4px 8px">✕</button>
        </div>
        <div id="diar-equipe-lista"></div>
        <div style="margin-top:16px;border-top:1px solid var(--borda);padding-top:16px">
          <div style="font-weight:700;font-size:12px;letter-spacing:.08em;color:var(--verde-hl);margin-bottom:10px;font-family:'Rajdhani',sans-serif">+ ADICIONAR FUNCIONÁRIO</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
            <input id="diar-eq-nome" type="text" placeholder="Nome" style="padding:9px 12px;background:var(--bg3);border:1px solid var(--borda2);border-radius:8px;color:var(--branco);font-size:13px">
            <select id="diar-eq-cargo" style="padding:9px 12px;background:var(--bg3);border:1px solid var(--borda2);border-radius:8px;color:var(--branco);font-size:13px">
              <option value="Servente">Servente</option>
              <option value="Pedreiro">Pedreiro</option>
              <option value="Betoneiro">Betoneiro</option>
              <option value="Mestre">Mestre</option>
              <option value="Eletricista">Eletricista</option>
              <option value="Encanador">Encanador</option>
            </select>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
            <input id="diar-eq-diaria" type="number" placeholder="Diária (R$)" min="0" step="5" style="padding:9px 12px;background:var(--bg3);border:1px solid var(--borda2);border-radius:8px;color:var(--branco);font-size:13px">
            <input id="diar-eq-apelidos" type="text" placeholder="Apelidos (vírgula)" style="padding:9px 12px;background:var(--bg3);border:1px solid var(--borda2);border-radius:8px;color:var(--branco);font-size:13px">
          </div>
          <button onclick="diarAdicionarFuncionario()" style="width:100%;padding:10px;background:var(--verde);color:var(--verde-hl);border:none;border-radius:8px;font-weight:700;font-size:13px;cursor:pointer;letter-spacing:.05em">ADICIONAR</button>
        </div>
      </div>
    </div>`);
    modal = document.getElementById('diar-modalEquipe');
  } else {
    modal.style.display = 'flex';
  }
  diarRenderListaEquipe();
}

function diarRenderListaEquipe() {
  const el = document.getElementById('diar-equipe-lista');
  if (!el) return;
  const todos = DIAR_FUNCIONARIOS_RAW.length ? [...DIAR_FUNCIONARIOS_RAW] : [];
  if (!todos.length) {
    // Fallback: extrair do mapa
    const unicos = {};
    Object.values(DIAR_FUNCIONARIOS).forEach(f => { unicos[f.nome] = f; });
    Object.values(unicos).forEach(f => todos.push({ nome: f.nome, cargo: f.cargo, diaria: f.diaria, apelidos: [], ativo: true }));
  }
  const ordem = { 'Mestre':1, 'Pedreiro':2, 'Betoneiro':3, 'Servente':4 };
  todos.sort((a,b) => {
    if (a.ativo !== b.ativo) return a.ativo ? -1 : 1;
    return (ordem[a.cargo]||9) - (ordem[b.cargo]||9);
  });
  el.innerHTML = todos.map(f => {
    const apelidos = Array.isArray(f.apelidos) ? f.apelidos.filter(Boolean).join(', ') : '';
    const opaco = f.ativo ? '' : 'opacity:0.4;';
    const statusTag = f.ativo
      ? '<span style="font-size:9px;background:rgba(34,197,94,0.1);color:var(--verde-hl);padding:2px 6px;border-radius:4px;font-weight:700">ATIVO</span>'
      : '<span style="font-size:9px;background:rgba(239,68,68,0.15);color:#f87171;padding:2px 6px;border-radius:4px;font-weight:700">INATIVO</span>';
    const btnToggle = f.ativo
      ? `<button onclick="diarToggleFuncionario('${esc(f.id)}',false)" title="Desativar" style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);color:#f87171;border-radius:6px;padding:3px 8px;font-size:10px;cursor:pointer;">desativar</button>`
      : `<button onclick="diarToggleFuncionario('${esc(f.id)}',true)" title="Reativar" style="background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.15);color:var(--verde-hl);border-radius:6px;padding:3px 8px;font-size:10px;cursor:pointer;">reativar</button>`;
    const btnEditar = `<button onclick="diarEditarFuncionario('${esc(f.id)}')" title="Editar" style="background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.2);color:#60a5fa;border-radius:6px;padding:3px 8px;font-size:10px;cursor:pointer;">editar</button>`;
    const btnExcluir = !f.ativo ? `<button onclick="diarExcluirFuncionario('${esc(f.id)}','${esc(f.nome)}')" title="Excluir" style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);color:#f87171;border-radius:6px;padding:3px 8px;font-size:10px;cursor:pointer;">excluir</button>` : '';
    return `<div style="${opaco}display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid var(--borda);gap:8px;flex-wrap:wrap">
      <div style="flex:1;min-width:140px">
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-weight:700;color:var(--branco);font-size:13px">${esc(f.nome)}</span>
          <span style="font-size:10px;color:var(--texto3)">${f.cargo}</span>
          ${statusTag}
        </div>
        <div style="font-size:10px;color:var(--texto3);margin-top:2px">
          R$ ${Number(f.diaria).toFixed(2)}${apelidos ? ` · apelidos: ${apelidos}` : ''}
        </div>
      </div>
      <div style="display:flex;gap:4px;flex-shrink:0">${btnEditar}${btnToggle}${btnExcluir}</div>
    </div>`;
  }).join('');
}

async function diarAdicionarFuncionario() {
  const nome = document.getElementById('diar-eq-nome').value.trim();
  const cargo = document.getElementById('diar-eq-cargo').value;
  const diaria = parseFloat(document.getElementById('diar-eq-diaria').value) || 80;
  const apelidosStr = document.getElementById('diar-eq-apelidos').value.trim();
  const apelidos = apelidosStr ? apelidosStr.split(',').map(a => a.trim().toLowerCase()).filter(Boolean) : [];
  if (!nome) { showToast('⚠ Informe o nome.'); return; }
  // Verificar duplicata
  if (DIAR_FUNCIONARIOS_RAW.find(f => f.nome.toLowerCase() === nome.toLowerCase())) {
    showToast('⚠ Já existe um funcionário com esse nome.'); return;
  }
  try {
    const [novo] = await sbPost('diarias_funcionarios', { nome, cargo, diaria, apelidos, ativo: true });
    DIAR_FUNCIONARIOS_RAW.push(novo);
    _diarReconstruirMapa();
    diarRenderListaEquipe();
    // Limpar campos
    document.getElementById('diar-eq-nome').value = '';
    document.getElementById('diar-eq-diaria').value = '';
    document.getElementById('diar-eq-apelidos').value = '';
    showToast(`✅ ${nome} adicionado!`);
  } catch(e) { showToast('❌ Não foi possível adicionar: ' + e.message); }
}

async function diarToggleFuncionario(id, ativo) {
  try {
    await sbPatch('diarias_funcionarios', `?id=eq.${id}`, { ativo });
    const f = DIAR_FUNCIONARIOS_RAW.find(f => f.id === id);
    if (f) f.ativo = ativo;
    _diarReconstruirMapa();
    diarRenderListaEquipe();
    showToast(ativo ? '✅ Funcionário reativado!' : '✅ Funcionário desativado.');
  } catch(e) { showToast('❌ Erro: ' + e.message); }
}

async function diarExcluirFuncionario(id, nome) {
  if (!confirm(`Excluir ${nome} permanentemente? Isso não afeta registros antigos.`)) return;
  try {
    await sbDelete('diarias_funcionarios', `?id=eq.${id}`);
    DIAR_FUNCIONARIOS_RAW = DIAR_FUNCIONARIOS_RAW.filter(f => f.id !== id);
    _diarReconstruirMapa();
    diarRenderListaEquipe();
    showToast(`✅ ${nome} excluído.`);
  } catch(e) { showToast('❌ Erro: ' + e.message); }
}

function diarEditarFuncionario(id) {
  const f = DIAR_FUNCIONARIOS_RAW.find(f => f.id === id);
  if (!f) return;
  const apelidos = Array.isArray(f.apelidos) ? f.apelidos.join(', ') : '';
  const html = `
  <div id="diar-editFunc" style="position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px">
    <div style="background:var(--bg2);border:1px solid rgba(59,130,246,0.3);border-radius:14px;padding:22px;width:min(400px,94vw)">
      <div style="font-weight:800;font-size:14px;letter-spacing:.05em;color:var(--branco);margin-bottom:16px">Editar ${esc(f.nome)}</div>
      <div style="display:flex;flex-direction:column;gap:10px">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <div><label style="font-size:10px;color:var(--texto3)">NOME</label><input id="diar-edit-nome" type="text" value="${esc(f.nome)}" style="width:100%;box-sizing:border-box;padding:9px 12px;background:var(--bg3);border:1px solid var(--borda2);border-radius:8px;color:var(--branco);font-size:13px;margin-top:4px"></div>
          <div><label style="font-size:10px;color:var(--texto3)">CARGO</label><select id="diar-edit-cargo" style="width:100%;box-sizing:border-box;padding:9px 12px;background:var(--bg3);border:1px solid var(--borda2);border-radius:8px;color:var(--branco);font-size:13px;margin-top:4px">
            <option value="Servente" ${f.cargo==='Servente'?'selected':''}>Servente</option>
            <option value="Pedreiro" ${f.cargo==='Pedreiro'?'selected':''}>Pedreiro</option>
            <option value="Betoneiro" ${f.cargo==='Betoneiro'?'selected':''}>Betoneiro</option>
            <option value="Mestre" ${f.cargo==='Mestre'?'selected':''}>Mestre</option>
            <option value="Eletricista" ${f.cargo==='Eletricista'?'selected':''}>Eletricista</option>
            <option value="Encanador" ${f.cargo==='Encanador'?'selected':''}>Encanador</option>
          </select></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <div><label style="font-size:10px;color:var(--texto3)">DIÁRIA (R$)</label><input id="diar-edit-diaria" type="number" value="${f.diaria}" min="0" step="5" style="width:100%;box-sizing:border-box;padding:9px 12px;background:var(--bg3);border:1px solid var(--borda2);border-radius:8px;color:var(--branco);font-size:13px;margin-top:4px"></div>
          <div><label style="font-size:10px;color:var(--texto3)">APELIDOS</label><input id="diar-edit-apelidos" type="text" value="${apelidos}" placeholder="vírgula" style="width:100%;box-sizing:border-box;padding:9px 12px;background:var(--bg3);border:1px solid var(--borda2);border-radius:8px;color:var(--branco);font-size:13px;margin-top:4px"></div>
        </div>
      </div>
      <div style="display:flex;gap:10px;margin-top:16px">
        <button onclick="document.getElementById('diar-editFunc').remove()" style="flex:1;background:var(--bg3);border:1px solid var(--borda2);border-radius:8px;padding:10px;color:var(--texto2);font-weight:700;font-size:12px;cursor:pointer">CANCELAR</button>
        <button onclick="diarSalvarEdicaoFunc('${id}')" style="flex:2;background:var(--verde-hl);border:none;border-radius:8px;padding:10px;color:#000;font-weight:800;font-size:13px;cursor:pointer">SALVAR</button>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
}

async function diarSalvarEdicaoFunc(id) {
  const nome = document.getElementById('diar-edit-nome').value.trim();
  const cargo = document.getElementById('diar-edit-cargo').value;
  const diaria = parseFloat(document.getElementById('diar-edit-diaria').value) || 80;
  const apelidosStr = document.getElementById('diar-edit-apelidos').value.trim();
  const apelidos = apelidosStr ? apelidosStr.split(',').map(a => a.trim().toLowerCase()).filter(Boolean) : [];
  if (!nome) { showToast('⚠ Nome obrigatório.'); return; }
  try {
    await sbPatch('diarias_funcionarios', `?id=eq.${id}`, { nome, cargo, diaria, apelidos });
    const f = DIAR_FUNCIONARIOS_RAW.find(f => f.id === id);
    if (f) { f.nome = nome; f.cargo = cargo; f.diaria = diaria; f.apelidos = apelidos; }
    _diarReconstruirMapa();
    document.getElementById('diar-editFunc')?.remove();
    diarRenderListaEquipe();
    showToast(`✅ ${nome} atualizado!`);
  } catch(e) { showToast('❌ Erro: ' + e.message); }
}

function _diarReconstruirMapa() {
  DIAR_FUNCIONARIOS = {};
  DIAR_FUNCIONARIOS_RAW.filter(f => f.ativo).forEach(f => {
    const entry = { nome: f.nome, cargo: f.cargo, diaria: Number(f.diaria) };
    DIAR_FUNCIONARIOS[f.nome.toLowerCase()] = entry;
    const apelidos = Array.isArray(f.apelidos) ? f.apelidos : [];
    apelidos.forEach(a => { if (a) DIAR_FUNCIONARIOS[a.toLowerCase()] = entry; });
  });
  _diarAtualizarTeam();
}

// State
let diarRegistros = [];        // carregado do Supabase
let diarExtras = [];           // carregado do Supabase
let diarInterpretado = null;
let _diarObrasCache = null;

// Init — chamado ao abrir a view
let diarPanelRecolhido = false;
function diarTogglePanel() {
  diarPanelRecolhido = !diarPanelRecolhido;
  const panel   = document.getElementById('diar-panelLeft');
  const content = document.getElementById('diar-panelContent');
  const btn     = document.getElementById('diar-togglePanel');
  if (diarPanelRecolhido) {
    panel.classList.add('recolhido');
    content.style.display = 'none';
    btn.textContent = '▶';
    btn.title = 'Expandir painel';
  } else {
    panel.classList.remove('recolhido');
    content.style.display = 'flex';
    content.style.flexDirection = 'column';
    content.style.gap = '18px';
    btn.textContent = '◀';
    btn.title = 'Recolher painel';
  }
}

async function initDiarias() {
  if (!document.getElementById('diar-dataInput').value) {
    document.getElementById('diar-dataInput').value = hojeISO();
  }
  await diarCarregarFuncionarios();
  await diarCarregarQuinzenas();
  diarRenderRegistros();
  diarRenderExtras();
}

// ────────────────────────────────────────────
// QUINZENA — Supabase
// ────────────────────────────────────────────
async function diarCarregarQuinzenas() {
  try {
    diarQuinzenas = await sbGet('diarias_quinzenas', '?order=data_inicio.desc&limit=20');
    if (!Array.isArray(diarQuinzenas)) diarQuinzenas = [];
  } catch(e) { diarQuinzenas = []; }
  if (!diarQuinzenas.length) { await diarCriarQuinzenaAuto(); return; }
  if (!diarQuinzenaAtiva) {
    diarQuinzenaAtiva = diarQuinzenas.find(q => !q.fechada) || diarQuinzenas[0];
  } else {
    diarQuinzenaAtiva = diarQuinzenas.find(q => q.id === diarQuinzenaAtiva.id) || diarQuinzenas[0];
  }
  diarAtualizarSelectQuinzena();
  await diarCarregarRegistros();
}

async function diarCriarQuinzenaAuto() {
  const h = new Date();
  const ano = h.getFullYear(), mes = h.getMonth() + 1;
  const mesStr = h.toLocaleString('pt-BR', { month: 'long' }).toUpperCase();
  const q = h.getDate() <= 15 ? 1 : 2;
  const label  = `${q===1?'1\xaa':'2\xaa'} QUINZENA \xb7 ${mesStr} ${ano}`;
  const inicio = q===1 ? `${ano}-${String(mes).padStart(2,'0')}-01` : `${ano}-${String(mes).padStart(2,'0')}-16`;
  const fim    = q===1 ? `${ano}-${String(mes).padStart(2,'0')}-15` : new Date(ano,mes,0).toISOString().split('T')[0];
  try {
    const [nova] = await sbPost('diarias_quinzenas', { label, data_inicio: inicio, data_fim: fim });
    diarQuinzenas = [nova]; diarQuinzenaAtiva = nova;
  } catch(e) {}
  diarAtualizarSelectQuinzena();
  await diarCarregarRegistros();
}

function diarAtualizarSelectQuinzena() {
  const sel = document.getElementById('diar-quinzena-select');
  if (sel) sel.innerHTML = diarQuinzenas.map(q =>
    `<option value="${q.id}" ${diarQuinzenaAtiva?.id===q.id?'selected':''}>${q.label}${q.fechada?' \u2713':''}</option>`
  ).join('');
  const badge = document.getElementById('diar-quinzena-badge');
  if (badge && diarQuinzenaAtiva) badge.textContent = diarQuinzenaAtiva.label;
}

async function diarExcluirQuinzena() {
  if (!diarQuinzenaAtiva) return;
  // Contar registros antes de excluir
  const regsCount = diarRegistros.filter(r => r.quinzena_id === diarQuinzenaAtiva.id).length;
  const extrasCount = (diarExtras || []).filter(e => e.quinzena_id === diarQuinzenaAtiva.id).length;
  const totalRegs = regsCount + extrasCount;

  if (totalRegs > 0) {
    // Quinzena com dados — exigir digitação pra confirmar
    const confirmacao = prompt(`CUIDADO! A quinzena "${diarQuinzenaAtiva.label}" tem ${regsCount} registros de diarias e ${extrasCount} extras.\n\nDigite EXCLUIR para confirmar:`);
    if (!confirmacao || confirmacao.trim().toUpperCase() !== 'EXCLUIR') {
      showToast('Exclusao cancelada.');
      return;
    }
  } else {
    // Quinzena vazia — confirmação simples
    if (!confirm(`Excluir a quinzena vazia "${diarQuinzenaAtiva.label}"?`)) return;
  }
  try {
    await sbDelete('diarias_quinzenas', `?id=eq.${diarQuinzenaAtiva.id}`);
    diarQuinzenas = diarQuinzenas.filter(q => q.id !== diarQuinzenaAtiva.id);
    diarQuinzenaAtiva = diarQuinzenas[0] || null;
    diarRegistros = []; diarExtras = [];
    diarAtualizarSelectQuinzena();
    diarRenderRegistros(); diarRenderExtras();
    showToast('✅ Quinzena excluída.');
  } catch(e) { showToast('❌ Não foi possível excluir a quinzena.'); }
}

async function diarTrocarQuinzena(id) {
  diarQuinzenaAtiva = diarQuinzenas.find(q => q.id === id);
  const badge = document.getElementById('diar-quinzena-badge');
  if (badge && diarQuinzenaAtiva) badge.textContent = diarQuinzenaAtiva.label;
  await diarCarregarRegistros();
  diarRenderRegistros(); diarRenderExtras();
}

async function diarCarregarRegistros() {
  if (!diarQuinzenaAtiva) return;
  try {
    const [r1, r2] = await Promise.all([
      sbGet('diarias', `?quinzena_id=eq.${diarQuinzenaAtiva.id}&order=data.desc`),
      sbGet('diarias_extras', `?quinzena_id=eq.${diarQuinzenaAtiva.id}`)
    ]);
    diarRegistros = r1; diarExtras = r2;
    if (!Array.isArray(diarRegistros)) diarRegistros = [];
    if (!Array.isArray(diarExtras))    diarExtras = [];
    // Normalizar periodos (pode vir como string JSON do Supabase)
    diarRegistros = diarRegistros.map(r => ({
      ...r,
      periodos: typeof r.periodos === 'string' ? JSON.parse(r.periodos || '[]') : (r.periodos || []),
      total_fracoes: Number(r.total_fracoes || 0),
      diaria_base: Number(r.diaria_base || 0),
      valor: Number(r.valor || 0)
    }));
  } catch(e) { diarRegistros = []; diarExtras = []; }
}

function diarGetRegistrosQuinzena() { return diarRegistros; }

function diarAbrirModalNovaQuinzena() {
  const hoje = hojeISO();
  document.body.insertAdjacentHTML('beforeend', `
  <div id="diar-modalNQ" style="position:fixed;inset:0;background:rgba(0,0,0,0.82);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px">
    <div style="background:var(--bg2);border:1px solid rgba(255,255,255,0.1);border-radius:14px;padding:22px;width:min(400px,94vw)">
      <div style="font-family:'Rajdhani',sans-serif;font-weight:800;font-size:14px;letter-spacing:2px;color:var(--verde-hl);margin-bottom:16px">+ NOVA QUINZENA</div>
      <div style="display:flex;flex-direction:column;gap:12px">
        <div>
          <label style="font-size:10px;letter-spacing:1px;color:var(--texto3);font-family:'Rajdhani',sans-serif">NOME</label>
          <input id="nq-label" type="text" placeholder="Ex: 2\xaa QUINZENA \xb7 MAR\xc7O 2026"
            style="width:100%;box-sizing:border-box;background:var(--bg3);border:1px solid var(--borda2);border-radius:8px;padding:10px 12px;color:var(--branco);font-size:13px;margin-top:4px">
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div>
            <label style="font-size:10px;letter-spacing:1px;color:var(--texto3);font-family:'Rajdhani',sans-serif">DATA IN\xcdCIO</label>
            <input id="nq-inicio" type="date" value="${hoje}" onchange="diarSugerirLabelNQ()"
              style="width:100%;box-sizing:border-box;background:var(--bg3);border:1px solid var(--borda2);border-radius:8px;padding:10px 8px;color:var(--branco);font-size:13px;margin-top:4px">
          </div>
          <div>
            <label style="font-size:10px;letter-spacing:1px;color:var(--texto3);font-family:'Rajdhani',sans-serif">DATA FIM</label>
            <input id="nq-fim" type="date" value="${hoje}"
              style="width:100%;box-sizing:border-box;background:var(--bg3);border:1px solid var(--borda2);border-radius:8px;padding:10px 8px;color:var(--branco);font-size:13px;margin-top:4px">
          </div>
        </div>
      </div>
      <div style="display:flex;gap:10px;margin-top:18px">
        <button onclick="document.getElementById('diar-modalNQ').remove()" style="flex:1;background:var(--bg3);border:1px solid var(--borda2);border-radius:8px;padding:10px;color:var(--texto2);font-family:'Rajdhani',sans-serif;font-weight:700;font-size:12px;cursor:pointer">CANCELAR</button>
        <button onclick="diarSalvarNovaQuinzena()" style="flex:2;background:var(--verde-hl);border:none;border-radius:8px;padding:10px;color:#000;font-family:'Rajdhani',sans-serif;font-size:13px;font-weight:800;cursor:pointer">CRIAR</button>
      </div>
    </div>
  </div>`);
}

function diarSugerirLabelNQ() {
  const v = document.getElementById('nq-inicio')?.value; if (!v) return;
  const d = new Date(v + 'T12:00:00');
  const mes = d.toLocaleString('pt-BR', { month: 'long' }).toUpperCase();
  const q = d.getDate() <= 15 ? '1\xaa' : '2\xaa';
  document.getElementById('nq-label').value = `${q} QUINZENA \xb7 ${mes} ${d.getFullYear()}`;
}

async function diarSalvarNovaQuinzena() {
  const label  = (document.getElementById('nq-label')?.value||'').trim();
  const inicio = document.getElementById('nq-inicio')?.value;
  const fim    = document.getElementById('nq-fim')?.value;
  if (!label||!inicio||!fim) { showToast('⚠ Preencha todos os campos.'); return; }
  // Bloquear quinzena duplicada (mesma data de inicio ou mesmo label)
  const jaExiste = diarQuinzenas.find(q => q.data_inicio === inicio || q.label.trim().toLowerCase() === label.toLowerCase());
  if (jaExiste) { showToast('⚠ Ja existe uma quinzena com esse periodo: ' + jaExiste.label); return; }
  try {
    const result = await sbPost('diarias_quinzenas', { label, data_inicio: inicio, data_fim: fim, fechada: false });
    const nova = Array.isArray(result) ? result[0] : result;
    if (!nova?.id) { showToast('❌ Resposta inválida do servidor.'); return; }
    document.getElementById('diar-modalNQ')?.remove();
    diarQuinzenas.unshift(nova); diarQuinzenaAtiva = nova;
    diarAtualizarSelectQuinzena();
    await diarCarregarRegistros();
    diarRenderRegistros(); diarRenderExtras();
    showToast('\u2705 Quinzena criada!');
  } catch(e) { console.error(e); showToast('❌ Não foi possível criar a quinzena: ' + e.message); }
}

// ── Editar label da quinzena ──────────────────
async function diarEditarLabelQuinzena() {
  if (!diarQuinzenaAtiva) { showToast('⚠ Selecione uma quinzena.'); return; }
  const novoLabel = prompt('Editar descrição da quinzena:', diarQuinzenaAtiva.label);
  if (!novoLabel || novoLabel.trim() === '' || novoLabel.trim() === diarQuinzenaAtiva.label) return;
  try {
    await sbPatch('diarias_quinzenas', '?id=eq.' + diarQuinzenaAtiva.id, { label: novoLabel.trim() });
    diarQuinzenaAtiva.label = novoLabel.trim();
    const q = diarQuinzenas.find(x => x.id === diarQuinzenaAtiva.id);
    if (q) q.label = novoLabel.trim();
    diarAtualizarSelectQuinzena();
    showToast('✅ Descrição atualizada!');
  } catch(e) { console.error(e); showToast('❌ Não foi possível editar: ' + e.message); }
}

// ────────────────────────────────────────────
// INTERPRETAÇÃO LOCAL (regex, sem API)
// ────────────────────────────────────────────
function diarInterpretar() {
  const msg = document.getElementById('diar-msgInput').value.trim();
  const data = document.getElementById('diar-dataInput').value;
  if (!msg) { showToast('⚠ Cole uma mensagem primeiro.'); return; }
  if (!data) { showToast('⚠ Selecione a data.'); return; }

  try {
    const regs = diarParseMensagem(msg);
    if (!regs.length) {
      document.getElementById('diar-previewBox').innerHTML =
        '<div class="diarias-empty"><div class="diarias-empty-icon">🤔</div><div class="diarias-empty-text diarias-error-text">Nenhum funcionário identificado. Verifique a mensagem.</div></div>';
      document.getElementById('diar-btnConfirmar').disabled = true;
      return;
    }
    diarInterpretado = { data, registros: regs };
    diarRenderPreview(regs);
    document.getElementById('diar-btnConfirmar').disabled = false;
    // Avisar nomes não reconhecidos
    if (regs._naoReconhecidos && regs._naoReconhecidos.length) {
      showToast('⚠ Nomes nao reconhecidos: ' + regs._naoReconhecidos.join(', ') + ' — cadastre em Funcionarios');
    }
  } catch(err) {
    document.getElementById('diar-previewBox').innerHTML =
      '<div class="diarias-empty"><div class="diarias-empty-icon">⚠️</div><div class="diarias-empty-text diarias-error-text">Erro ao interpretar. Verifique a mensagem.</div></div>';
    console.error(err);
  }
}

// ────────────────────────────────────────────
// PARSER LOCAL DE MENSAGENS
// ────────────────────────────────────────────
function diarParseMensagem(msgOriginal) {
  // Normalizar: minúsculas, remover acentos para matching, "i " → "e "
  const norm = s => s.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/\bi\b/g, 'e'); // "i" isolado → "e" (conector nordestino)

  const msg = norm(msgOriginal);

  // MATERIAIS a ignorar (não são obras nem pessoas)
  const MATERIAIS = ['cimento', 'argamassa', 'areia', 'brita', 'tijolo', 'ferro', 'vergalhao',
    'madeira', 'prego', 'parafuso', 'tinta', 'cal', 'saco', 'sacos', 'bloco', 'telha'];

  // Detectar turno global da mensagem (se houver)
  // Padrões: "ate meio-dia", "manha", "tarde", "atarde", "meio dia em X"
  const detectarTurno = (texto) => {
    if (/ate meio.?dia|ate o meio.?dia|manha|de manha/.test(texto)) return 'manha';
    if (/a tarde|atarde|de tarde|tarde/.test(texto)) return 'tarde';
    if (/meio.?dia/.test(texto)) return 'manha'; // "meio dia em X" = meia diária = 0.5
    return 'dia';
  };

  // Nomes das obras cadastradas (normalizado para matching)
  const obrasNomes = obras.map(o => ({ original: o.nome, norm: norm(o.nome) }));

  // Aliases de obras — variações e erros comuns do mestre
  const OBRAS_ALIASES = {
    'josenaldo junior': ['jr', 'junior', 'junio', 'josenaldo jr', 'josenaldo junio', 'josenaldo junior'],
    'leonardo':         ['leonado', 'leanardo', 'leonaldo', 'loenardo', 'leoarndo'],
    'dayana':           ['daiana'],
  };
  // Resolver alias → nome original da obra cadastrada
  const resolverAliasObra = (trecho) => {
    const t = trecho.toLowerCase().trim();
    for (const [nomeObra, aliases] of Object.entries(OBRAS_ALIASES)) {
      for (const alias of aliases) {
        if (t.includes(alias)) {
          // Confirmar que existe obra cadastrada com esse nome
          const obraReal = obras.find(o => norm(o.nome) === norm(nomeObra));
          if (obraReal) return obraReal.nome;
        }
      }
    }
    return null;
  };

  // Extrair nome da obra de um trecho "casa di X" / "obra X"
  // Primeiro tenta cruzar com obras cadastradas, depois usa o texto literal
  const extrairObra = (trecho) => {
    // Tentar alias primeiro
    const aliasMatch = resolverAliasObra(trecho);
    if (aliasMatch) return aliasMatch;

    // Tentar match direto com obras cadastradas no trecho
    for (const o of obrasNomes) {
      // Pega só o primeiro nome da obra para matching (ex: "Josenaldo Junior" → "josenaldo")
      const primeiroNome = o.norm.split(' ')[0];
      if (primeiroNome.length >= 4 && trecho.includes(primeiroNome)) {
        return o.original;
      }
    }
    // Fallback: pegar o que vem depois de "casa di/de/do"
    const m = trecho.match(/cas[ao]\s+d[eio]\s+([a-záéíóúãõâêôàü\s]+?)(?:\s+\d|\s*$)/i)
           || trecho.match(/obra\s+([a-záéíóúãõâêôàü]+)/i);
    if (!m) return null;
    const palavra = m[1].trim();
    if (MATERIAIS.includes(norm(palavra))) return null;
    if (['a','o','e','de','da','do','na','no','um','uma'].includes(norm(palavra))) return null;
    return palavra.charAt(0).toUpperCase() + palavra.slice(1).toLowerCase();
  };

  // Construir ALIAS_PATTERNS dinamicamente a partir de DIAR_FUNCIONARIOS
  const ALIAS_PATTERNS = [];
  // Adicionar padrões especiais (multi-palavra) primeiro
  const _aliasEspeciais = [
    { re: /seu\s+nego|rochedo/, key: 'seu nego' },
    { re: /bin\s+lad[ea]m?|binlad[ea]m?/, key: 'binlade' },
    { re: /zez[aã]o/, key: 'zezao' },
  ];
  _aliasEspeciais.forEach(a => { if (DIAR_FUNCIONARIOS[a.key]) ALIAS_PATTERNS.push(a); });
  // Adicionar todas as chaves do mapa como patterns
  Object.keys(DIAR_FUNCIONARIOS).forEach(key => {
    // Escapar regex chars e criar pattern
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Para nomes curtos (3 chars), usar word boundary
    const re = key.length <= 3 ? new RegExp(`\\b${escaped}\\b`) : new RegExp(escaped);
    ALIAS_PATTERNS.push({ re, key });
  });

  // Encontrar todos os funcionários mencionados no texto
  const encontrarFuncionarios = (texto) => {
    const encontrados = [];
    for (const { re, key } of ALIAS_PATTERNS) {
      if (re.test(texto)) {
        const func = DIAR_FUNCIONARIOS[key];
        if (func && !encontrados.find(f => f.nome === func.nome)) {
          encontrados.push({ ...func });
        }
      }
    }
    return encontrados;
  };

  // ── ESTRATÉGIA DE PARSE ──────────────────────────────────────
  // A mensagem pode ter múltiplos blocos separados por "." ou "\n"
  // Cada bloco pode ter: [funcionários] + [turno] + [obra]
  // Ex: "Anderson e Josimar até meio-dia casa di Leonardo. I atarde casa di Pedro"
  //     "Seu nego i val casa di Junior 3 cimento"

  // Dividir em sub-blocos por "." ou "\n" primeiro,
  // depois subdividir cada bloco por marcador de turno (manha/tarde/dia todo)
  // para suportar: "Adeilto i val ate meio-dia casa di Junior i atarde casa di Mikael"
  const splitPorTurno = (bloco) => {
    // Substitui marcadores de turno por separador "|" para depois dividir
    // Suporta: "i atarde", "e atarde", "i manha", "e de tarde", etc.
    const marcado = bloco
      .replace(/\b(e|i)\s+(ate meio.?dia|de manha|a tarde|atarde|de tarde)/g, '|$2')
      .replace(/\b(e|i)\s+(manha)\b/g, '|$2')
      .replace(/,\s*(meio.?dia|manha|de manha|tarde|atarde|a tarde|de tarde|ate meio.?dia)/gi, '|$1'); // vírgula antes de turno
    const partes = marcado.split('|').map(s => s.trim()).filter(Boolean);
    return partes.length > 1 ? partes : [bloco];
  };

  const brutos = msg.split(/[.\n]+/).map(s => s.trim()).filter(Boolean);
  const blocos = brutos.flatMap(b => splitPorTurno(b));

  // Resultado final agrupado por funcionário
  const resultMap = {}; // nome → { funcionario, cargo, diaria_base, periodos }

  const addPeriodo = (func, turno, obra) => {
    if (!resultMap[func.nome]) {
      resultMap[func.nome] = {
        funcionario: func.nome,
        cargo: func.cargo,
        diaria_base: func.diaria,
        periodos: [],
        total_fracoes: 0
      };
    }
    // Evitar duplicar mesmo turno+obra
    const already = resultMap[func.nome].periodos.find(p => p.turno === turno && p.obra === obra);
    if (already) return;
    const fracao = (turno === 'dia') ? 1.0 : 0.5;
    resultMap[func.nome].periodos.push({ turno, obra, fracao });
    resultMap[func.nome].total_fracoes += fracao;
  };

  // Processar bloco a bloco
  let ultimosFuncs = []; // funcionários do último bloco com nomes
  for (const bloco of blocos) {
    if (!bloco) continue;

    const turno = detectarTurno(bloco);
    const obra = extrairObra(bloco) || 'Não especificada';
    const funcs = encontrarFuncionarios(bloco);

    if (funcs.length) {
      ultimosFuncs = funcs;
      // Se tem obra ou é bloco único, adiciona período
      // Se não tem obra e tem mais blocos, só guarda os nomes pra usar nos próximos
      if (obra !== 'Não especificada' || blocos.length === 1) {
        funcs.forEach(f => addPeriodo(f, turno, obra));
      }
    } else if (obra !== 'Não especificada' && ultimosFuncs.length) {
      // Bloco sem nome mas com obra — aplica ao mesmo grupo do bloco anterior
      // Ex: "I atarde casa di Pedro" — mesmos funcionários, turno tarde, obra Pedro
      ultimosFuncs.forEach(f => addPeriodo(f, turno, obra));
    }
  }

  // Se não encontrou nada com blocos, tentar parse único na mensagem toda
  if (!Object.keys(resultMap).length) {
    const turno = detectarTurno(msg);
    const obra = extrairObra(msg) || 'Não especificada';
    const funcs = encontrarFuncionarios(msg);
    funcs.forEach(f => addPeriodo(f, turno, obra));
  }

  // Detectar possíveis nomes não reconhecidos
  const nomesConhecidos = Object.keys(DIAR_FUNCIONARIOS);
  const palavras = msgOriginal.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').split(/[\s,.!?;:]+/).filter(p => p.length >= 3);
  const IGNORAR = ['casa','obra','ate','meio','dia','manha','tarde','todo','cimento','argamassa','areia','brita','tijolo','ferro','madeira','prego','tinta','cal','saco','sacos','bloco','telha','vergalhao','pra','para','com','que','foi','uma','uns','umas','mais','tambem','ainda','hoje','ontem','esta','esse','essa','nao','sim','bem','bom','boa','muito','pouco','todo','toda','todos','todas','aqui','ali','tem','vai','vem','dia','mes','ano'];
  const naoReconhecidos = [];
  palavras.forEach(p => {
    if (IGNORAR.includes(p)) return;
    if (nomesConhecidos.includes(p)) return;
    // Verificar se parece nome próprio (começa com maiúscula no original)
    const idx = msgOriginal.toLowerCase().indexOf(p);
    if (idx >= 0) {
      const charOriginal = msgOriginal[idx];
      if (charOriginal === charOriginal.toUpperCase() && charOriginal !== charOriginal.toLowerCase()) {
        if (!naoReconhecidos.includes(p) && !Object.values(resultMap).find(r => r.funcionario.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').includes(p))) {
          naoReconhecidos.push(p);
        }
      }
    }
  });

  const resultado = Object.values(resultMap);
  resultado._naoReconhecidos = naoReconhecidos;
  return resultado;
}

function diarRenderPreview(regs) {
  const box = document.getElementById('diar-previewBox');
  if (!regs || !regs.length) {
    box.innerHTML = '<div class="diarias-empty"><div class="diarias-empty-text diarias-error-text">Nenhum funcionário identificado</div></div>';
    return;
  }
  const isMestre = usuarioAtual?.perfil === 'mestre';
  box.innerHTML = regs.map(r => {
    const valor = (r.diaria_base * r.total_fracoes).toFixed(2);
    const periodos = r.periodos.map(p => {
      const cls = p.turno === 'manha' ? 'diarias-turno-manha' : p.turno === 'tarde' ? 'diarias-turno-tarde' : 'diarias-turno-dia';
      const label = p.turno === 'manha' ? 'MANHÃ' : p.turno === 'tarde' ? 'TARDE' : 'DIA TODO';
      return `<span class="diarias-turno-tag ${cls}">${label}</span><span style="font-size:10px;color:var(--texto3)">${p.obra}</span>`;
    }).join(' · ');
    return `<div class="diarias-func-card">
      <div class="diarias-func-avatar">${r.funcionario[0]}</div>
      <div class="diarias-func-info">
        <div class="diarias-func-nome">${r.funcionario} <span style="font-size:10px;color:var(--texto3);font-weight:400">${r.cargo||''}</span></div>
        <div class="diarias-func-obras" style="margin-top:3px">${periodos}</div>
      </div>
      ${isMestre ? '' : `<div class="diarias-func-val">R$ ${Number(valor).toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>`}
    </div>`;
  }).join('');
}

// ────────────────────────────────────────────
// SALVAR
// ────────────────────────────────────────────
async function diarConfirmarLancamento() {
  if (!diarInterpretado) return;
  if (!diarQuinzenaAtiva) { showToast('⚠ Nenhuma quinzena ativa. Crie uma quinzena primeiro.'); return; }
  const btn = document.getElementById('diar-btnConfirmar');
  if (btn) { btn.disabled = true; btn.textContent = 'SALVANDO...'; }
  try {
    // Remover registros do mesmo dia nessa quinzena
    const existentes = diarRegistros.filter(r => r.data === diarInterpretado.data);
    for (const r of existentes) {
      await sbDelete('diarias', `?id=eq.${r.id}`);
    }
    // Inserir novos
    const novos = diarInterpretado.registros.map(r => ({
      quinzena_id: diarQuinzenaAtiva.id,
      data: diarInterpretado.data,
      funcionario: r.funcionario, cargo: r.cargo || '',
      diaria_base: r.diaria_base, periodos: r.periodos,
      total_fracoes: r.total_fracoes, valor: r.diaria_base * r.total_fracoes,
      criado_por: usuarioAtual?.nome || ''
    }));
    await sbPostMinimal('diarias', novos);
    diarInterpretado = null;
    document.getElementById('diar-msgInput').value = '';
    document.getElementById('diar-previewBox').innerHTML =
      '<div class="diarias-empty"><div class="diarias-empty-icon">💬</div><div class="diarias-empty-text">Cole uma mensagem e clique em interpretar</div></div>';
    await diarCarregarRegistros();
    diarRenderRegistros();
    showToast('✅ Diárias salvas!');
  } catch(e) { showToast('❌ Erro: ' + (e.message || JSON.stringify(e))); console.error('diarSalvar',e); }
  if (btn) { btn.disabled = false; btn.textContent = '✓ CONFIRMAR E SALVAR'; }
}

// ────────────────────────────────────────────
// RENDER REGISTROS
// ────────────────────────────────────────────

// ────────────────────────────────────────────
// FALTAS
// ────────────────────────────────────────────
let DIAR_TEAM = ['Anderson','Josimar','Nego','Adeilton','Val','Rosinaldo','Marcone'];

function diarGetFaltasDia(dia, regs) {
  // normalizar periodos (pode vir como string do Supabase)
  regs = regs.map(r => ({ ...r, periodos: typeof r.periodos === 'string' ? JSON.parse(r.periodos||'[]') : (r.periodos||[]) }));
  const presentes = new Set(regs.map(r => r.funcionario));
  return DIAR_TEAM.filter(n => !presentes.has(n));
}

function diarGetFaltasQuinzena() {
  // Retorna { funcionario, totalFaltas } para cada membro do time
  const regs = diarGetRegistrosQuinzena();
  const diasLancados = [...new Set(regs.map(r => r.data))];
  const faltas = {};
  DIAR_TEAM.forEach(n => { faltas[n] = 0; });
  diasLancados.forEach(dia => {
    const presentes = new Set(regs.filter(r => r.data === dia).map(r => r.funcionario));
    DIAR_TEAM.forEach(n => { if (!presentes.has(n)) faltas[n]++; });
  });
  return faltas; // { Anderson: 0, Josimar: 2, ... }
}

function diarRenderRegistros() {
  const container = document.getElementById('diar-registrosContainer');
  if (!container) return;
  const regs = diarGetRegistrosQuinzena();
  if (!regs.length) {
    container.innerHTML = '<div class="diarias-empty"><div class="diarias-empty-icon">📋</div><div class="diarias-empty-text">Nenhum registro nesta quinzena</div></div>';
    return;
  }
  const porDia = {};
  regs.forEach(r => { if (!porDia[r.data]) porDia[r.data] = []; porDia[r.data].push(r); });
  const dias = Object.keys(porDia).sort().reverse();
  container.innerHTML = dias.map(dia => {
    const items = porDia[dia];
    const df = new Date(dia + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }).toUpperCase();
    const isAdmin = usuarioAtual?.perfil === 'admin' || _isSuperAdmin;
    const rows = items.map(r => {
      const periodos = typeof r.periodos === 'string' ? JSON.parse(r.periodos||'[]') : (r.periodos||[]);
      const obrasTexto = periodos.map(p => {
        const t = p.turno === 'manha' ? '☀' : p.turno === 'tarde' ? '🌤' : '📅';
        return `${t} ${p.obra}`;
      }).join(' · ');
      const btnEdit = isAdmin ? `<button onclick="event.stopPropagation();diarEditarRegistro('${r.id}')" style="background:none;border:none;color:var(--texto3);cursor:pointer;font-size:11px;padding:2px 6px;opacity:0.5;" title="Editar">✏</button>` : '';
      return `<div class="diarias-registro-row">
        <div class="diarias-rr-nome">${r.funcionario}</div>
        <div class="diarias-rr-obras">${obrasTexto}</div>
        <div class="diarias-rr-val">R$ ${r.valor.toLocaleString('pt-BR',{minimumFractionDigits:2})} ${btnEdit}</div>
      </div>`;
    }).join('');
    const faltas = diarGetFaltasDia(dia, items);
    const faltasHtml = faltas.length
      ? `<div style="margin-top:6px;padding:5px 10px;background:rgba(239,68,68,0.07);border-radius:6px;border:1px solid rgba(239,68,68,0.15);">
           <span style="font-size:9px;font-weight:700;letter-spacing:1px;color:#f87171;font-family:'Rajdhani',sans-serif;">⚠ FALTOU: </span>
           <span style="font-size:11px;color:#fca5a5;">${faltas.join(', ')}</span>
         </div>` : '';
    const isFirst = dia === dias[0];
    const chevron = `<span class="diar-chevron" style="font-size:10px;transition:transform .2s;display:inline-block;${isFirst?'transform:rotate(90deg)':''}">▶</span>`;
    return `<div class="diarias-registro-dia">
      <div class="diarias-registro-header" style="cursor:pointer;user-select:none;" onclick="diarToggleDia(this)">
        <div style="display:flex;align-items:center;gap:8px">
          ${chevron}
          <span class="diarias-registro-data">${df}</span>
          <span class="diarias-registro-count">${items.length} func.</span>
          ${faltas.length ? `<span style="font-size:9px;font-weight:700;color:#f87171;font-family:'Rajdhani',sans-serif;">⚠ ${faltas.length} falta(s)</span>` : ''}
        </div>
        <div style="display:flex;gap:4px;">
          ${isAdmin ? `<button style="background:none;border:none;color:var(--verde-hl);cursor:pointer;font-size:11px;font-weight:700;padding:2px 8px;font-family:'Rajdhani',sans-serif;" onclick="event.stopPropagation();diarAdicionarNoDia('${dia}')" title="Adicionar funcionario">+ ADD</button>` : ''}
          <button class="diarias-btn-del" onclick="event.stopPropagation();diarDeletarDia('${dia}')" title="Remover dia">✕</button>
        </div>
      </div>
      <div class="diar-dia-body" style="${isFirst?'':'display:none;'}">${rows}${faltasHtml}</div>
    </div>`;
  }).join('');
  diarRenderFolha();
}

function diarToggleDia(headerEl) {
  const body = headerEl.nextElementSibling;
  const chevron = headerEl.querySelector('.diar-chevron');
  if (body.style.display === 'none') {
    body.style.display = '';
    if (chevron) chevron.style.transform = 'rotate(90deg)';
  } else {
    body.style.display = 'none';
    if (chevron) chevron.style.transform = '';
  }
}

// ── Editar registro individual (admin) ──────────────
function diarEditarRegistro(regId) {
  const reg = diarRegistros.find(r => r.id === regId);
  if (!reg) return;
  const periodos = typeof reg.periodos === 'string' ? JSON.parse(reg.periodos||'[]') : (reg.periodos||[]);
  const obrasOpts = obras.map(o => `<option value="${esc(o.nome)}">${o.nome}</option>`).join('');

  let periodosHtml = periodos.map((p, i) => {
    return `<div style="display:flex;gap:8px;margin-bottom:8px;align-items:center;" data-idx="${i}">
      <select class="ed-turno" style="flex:1;padding:8px;background:var(--bg);border:1px solid var(--borda);border-radius:6px;color:#fafafa;font-size:12px;font-family:inherit;">
        <option value="dia" ${p.turno==='dia'?'selected':''}>Dia inteiro (1.0)</option>
        <option value="manha" ${p.turno==='manha'?'selected':''}>Manha (0.5)</option>
        <option value="tarde" ${p.turno==='tarde'?'selected':''}>Tarde (0.5)</option>
      </select>
      <select class="ed-obra" style="flex:1;padding:8px;background:var(--bg);border:1px solid var(--borda);border-radius:6px;color:#fafafa;font-size:12px;font-family:inherit;">
        <option value="Nao especificada">Nao especificada</option>
        ${obrasOpts}
      </select>
      <button onclick="this.parentElement.remove()" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:14px;">X</button>
    </div>`;
  }).join('');

  const modal = document.createElement('div');
  modal.id = 'diar-modalEdit';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center;';
  modal.innerHTML = `<div style="background:var(--cinza-escuro,#1a1a1a);border:1px solid var(--borda);border-radius:16px;padding:24px;width:90%;max-width:420px;">
    <div style="font-family:'Rajdhani',sans-serif;font-weight:800;font-size:14px;letter-spacing:2px;color:var(--verde-hl);margin-bottom:16px">EDITAR DIARIA</div>
    <div style="margin-bottom:12px;">
      <span style="font-size:13px;font-weight:700;">${esc(reg.funcionario)}</span>
      <span style="font-size:11px;color:var(--texto3);margin-left:8px;">${reg.data} · R$ ${reg.diaria_base}/dia</span>
    </div>
    <div style="font-size:11px;color:var(--texto3);font-weight:700;margin-bottom:6px;">PERIODOS</div>
    <div id="ed-periodos">${periodosHtml}</div>
    <button onclick="diarEditAddPeriodo()" style="background:none;border:1px dashed var(--borda);border-radius:6px;padding:6px 12px;color:var(--texto3);font-size:11px;cursor:pointer;font-family:inherit;margin-bottom:16px;width:100%;">+ Adicionar periodo</button>
    <div style="display:flex;gap:10px;">
      <button onclick="document.getElementById('diar-modalEdit')?.remove()" style="flex:1;padding:10px;border-radius:8px;border:1px solid var(--borda);background:none;color:var(--texto3);font-family:'Rajdhani',sans-serif;font-size:13px;font-weight:700;cursor:pointer;">CANCELAR</button>
      <button onclick="diarSalvarEdicao('${regId}')" style="flex:2;background:var(--verde-hl);border:none;border-radius:8px;padding:10px;color:#000;font-family:'Rajdhani',sans-serif;font-size:13px;font-weight:800;cursor:pointer;">SALVAR</button>
      <button onclick="diarExcluirRegistro('${regId}')" style="flex:1;padding:10px;border-radius:8px;border:1px solid rgba(239,68,68,0.3);background:rgba(239,68,68,0.05);color:#ef4444;font-family:'Rajdhani',sans-serif;font-size:13px;font-weight:700;cursor:pointer;">EXCLUIR</button>
    </div>
  </div>`;
  document.body.appendChild(modal);

  // Setar obras selecionadas
  setTimeout(() => {
    const selects = modal.querySelectorAll('.ed-obra');
    periodos.forEach((p, i) => { if (selects[i]) selects[i].value = p.obra || 'Nao especificada'; });
  }, 10);
}

function diarEditAddPeriodo() {
  const container = document.getElementById('ed-periodos');
  if (!container) return;
  const obrasOpts = obras.map(o => `<option value="${esc(o.nome)}">${o.nome}</option>`).join('');
  const div = document.createElement('div');
  div.style.cssText = 'display:flex;gap:8px;margin-bottom:8px;align-items:center;';
  div.innerHTML = `
    <select class="ed-turno" style="flex:1;padding:8px;background:var(--bg);border:1px solid var(--borda);border-radius:6px;color:#fafafa;font-size:12px;font-family:inherit;">
      <option value="dia">Dia inteiro (1.0)</option>
      <option value="manha">Manha (0.5)</option>
      <option value="tarde">Tarde (0.5)</option>
    </select>
    <select class="ed-obra" style="flex:1;padding:8px;background:var(--bg);border:1px solid var(--borda);border-radius:6px;color:#fafafa;font-size:12px;font-family:inherit;">
      <option value="Nao especificada">Nao especificada</option>
      ${obrasOpts}
    </select>
    <button onclick="this.parentElement.remove()" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:14px;">X</button>`;
  container.appendChild(div);
}

async function diarSalvarEdicao(regId) {
  const modal = document.getElementById('diar-modalEdit');
  if (!modal) return;
  const reg = diarRegistros.find(r => r.id === regId);
  if (!reg) return;

  const rows = modal.querySelectorAll('#ed-periodos > div');
  const periodos = [];
  let totalFracoes = 0;
  rows.forEach(row => {
    const turno = row.querySelector('.ed-turno')?.value || 'dia';
    const obra = row.querySelector('.ed-obra')?.value || 'Nao especificada';
    const fracao = turno === 'dia' ? 1.0 : 0.5;
    periodos.push({ turno, obra, fracao });
    totalFracoes += fracao;
  });

  if (!periodos.length) { showToast('Adicione pelo menos um periodo.'); return; }

  try {
    await sbPatch('diarias', `?id=eq.${regId}`, {
      periodos: periodos,
      total_fracoes: totalFracoes,
      valor: reg.diaria_base * totalFracoes
    });
    modal.remove();
    await diarCarregarRegistros();
    diarRenderRegistros();
    showToast('Diaria atualizada!');
  } catch(e) { showToast('Erro ao salvar: ' + e.message); }
}

// ── Adicionar funcionário avulso num dia já lançado ──
function diarAdicionarNoDia(data) {
  const regs = diarRegistros.filter(r => r.data === data && r.quinzena_id === diarQuinzenaAtiva?.id);
  const jaLancados = regs.map(r => r.funcionario);
  const ativos = diarGetFuncionariosAtivos().filter(f => !jaLancados.includes(f.nome));
  const obrasOpts = obras.map(o => `<option value="${esc(o.nome)}">${o.nome}</option>`).join('');

  if (!ativos.length) { showToast('Todos os funcionarios ja foram lancados neste dia.'); return; }

  const funcOpts = ativos.map(f => `<option value="${esc(f.nome)}" data-cargo="${f.cargo||''}" data-diaria="${f.diaria||0}">${f.nome} (${f.cargo||'-'})</option>`).join('');

  const modal = document.createElement('div');
  modal.id = 'diar-modalAdd';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center;';
  modal.innerHTML = `<div style="background:var(--cinza-escuro,#1a1a1a);border:1px solid var(--borda);border-radius:16px;padding:24px;width:90%;max-width:420px;">
    <div style="font-family:'Rajdhani',sans-serif;font-weight:800;font-size:14px;letter-spacing:2px;color:var(--verde-hl);margin-bottom:16px">+ ADICIONAR FUNCIONARIO</div>
    <div style="font-size:12px;color:var(--texto3);margin-bottom:16px;">${new Date(data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })}</div>
    <label style="font-size:11px;color:var(--texto3);font-weight:700;display:block;margin-bottom:4px;">FUNCIONARIO</label>
    <select id="add-func" style="width:100%;padding:10px;background:var(--bg);border:1px solid var(--borda);border-radius:8px;color:#fafafa;font-size:13px;font-family:inherit;margin-bottom:12px;">
      ${funcOpts}
    </select>
    <div id="add-periodos">
      <div style="display:flex;gap:8px;margin-bottom:8px;">
        <div style="flex:1;">
          <label style="font-size:11px;color:var(--texto3);font-weight:700;display:block;margin-bottom:4px;">TURNO</label>
          <select class="add-turno" style="width:100%;padding:10px;background:var(--bg);border:1px solid var(--borda);border-radius:8px;color:#fafafa;font-size:13px;font-family:inherit;">
            <option value="dia">Dia inteiro (1.0)</option>
            <option value="manha">Manha (0.5)</option>
            <option value="tarde">Tarde (0.5)</option>
          </select>
        </div>
        <div style="flex:1;">
          <label style="font-size:11px;color:var(--texto3);font-weight:700;display:block;margin-bottom:4px;">OBRA</label>
          <select class="add-obra" style="width:100%;padding:10px;background:var(--bg);border:1px solid var(--borda);border-radius:8px;color:#fafafa;font-size:13px;font-family:inherit;">
            ${obrasOpts}
          </select>
        </div>
      </div>
    </div>
    <button onclick="diarAddPeriodoModal()" style="background:none;border:1px dashed var(--borda);border-radius:6px;padding:6px;color:var(--texto3);font-size:11px;cursor:pointer;font-family:inherit;margin-bottom:16px;width:100%;">+ Segundo turno (outra obra)</button>
    <div style="display:flex;gap:10px;">
      <button onclick="document.getElementById('diar-modalAdd')?.remove()" style="flex:1;padding:12px;border-radius:8px;border:1px solid var(--borda);background:none;color:var(--texto3);font-family:'Rajdhani',sans-serif;font-size:13px;font-weight:700;cursor:pointer;">CANCELAR</button>
      <button onclick="diarConfirmarAdd('${data}')" style="flex:2;background:var(--verde-hl);border:none;border-radius:8px;padding:12px;color:#000;font-family:'Rajdhani',sans-serif;font-size:13px;font-weight:800;cursor:pointer;">ADICIONAR</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
}

function diarAddPeriodoModal() {
  const container = document.getElementById('add-periodos');
  if (!container) return;
  const obrasOpts = obras.map(o => `<option value="${esc(o.nome)}">${o.nome}</option>`).join('');
  const div = document.createElement('div');
  div.style.cssText = 'display:flex;gap:8px;margin-bottom:8px;';
  div.innerHTML = `
    <div style="flex:1;">
      <select class="add-turno" style="width:100%;padding:10px;background:var(--bg);border:1px solid var(--borda);border-radius:8px;color:#fafafa;font-size:13px;font-family:inherit;">
        <option value="dia">Dia inteiro (1.0)</option>
        <option value="manha">Manha (0.5)</option>
        <option value="tarde">Tarde (0.5)</option>
      </select>
    </div>
    <div style="flex:1;">
      <select class="add-obra" style="width:100%;padding:10px;background:var(--bg);border:1px solid var(--borda);border-radius:8px;color:#fafafa;font-size:13px;font-family:inherit;">
        ${obrasOpts}
      </select>
    </div>
    <button onclick="this.parentElement.remove()" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:14px;align-self:center;">X</button>`;
  container.appendChild(div);
}

async function diarConfirmarAdd(data) {
  const modal = document.getElementById('diar-modalAdd');
  if (!modal) return;
  const sel = modal.querySelector('#add-func');
  const nome = sel.value;
  const opt = sel.selectedOptions[0];
  const cargo = opt?.dataset.cargo || '';
  const diaria = Number(opt?.dataset.diaria) || 0;

  const rows = modal.querySelectorAll('#add-periodos > div');
  const periodos = [];
  let totalFracoes = 0;
  rows.forEach(row => {
    const turno = row.querySelector('.add-turno')?.value || 'dia';
    const obra = row.querySelector('.add-obra')?.value || 'Nao especificada';
    const fracao = turno === 'dia' ? 1.0 : 0.5;
    periodos.push({ turno, obra, fracao });
    totalFracoes += fracao;
  });

  if (!periodos.length) { showToast('Selecione pelo menos um turno.'); return; }

  try {
    await sbPostMinimal('diarias', [{
      quinzena_id: diarQuinzenaAtiva.id,
      data: data,
      funcionario: nome,
      cargo: cargo,
      diaria_base: diaria,
      periodos: periodos,
      total_fracoes: totalFracoes,
      valor: diaria * totalFracoes,
      criado_por: usuarioAtual?.nome || ''
    }]);
    modal.remove();
    await diarCarregarRegistros();
    diarRenderRegistros();
    showToast(nome + ' adicionado!');
  } catch(e) { showToast('Erro: ' + e.message); }
}

async function diarExcluirRegistro(regId) {
  if (!confirm('Excluir este registro de diaria?')) return;
  try {
    await sbDelete('diarias', `?id=eq.${regId}`);
    document.getElementById('diar-modalEdit')?.remove();
    await diarCarregarRegistros();
    diarRenderRegistros();
    showToast('Registro excluido.');
  } catch(e) { showToast('Erro ao excluir: ' + e.message); }
}

async function diarDeletarDia(data) {
  if (!confirm(`Remover todos os registros de ${data}?`)) return;
  try {
    await sbDelete('diarias', `?quinzena_id=eq.${diarQuinzenaAtiva.id}&data=eq.${data}`);
    await diarCarregarRegistros();
    diarRenderRegistros();
    showToast('✅ Registros removidos.');
  } catch(e) { showToast('❌ Não foi possível remover.'); }
}

// ────────────────────────────────────────────
// RENDER FOLHA
// ────────────────────────────────────────────
function diarRenderFolha() {
  const container = document.getElementById('diar-folhaContainer');
  if (!container) return;
  const regs = diarGetRegistrosQuinzena();
  if (!regs.length) {
    container.innerHTML = '<div class="diarias-empty"><div class="diarias-empty-icon">💰</div><div class="diarias-empty-text">Nenhum dado ainda</div></div>';
    return;
  }
  const porFunc = {};
  regs.forEach(r => {
    const periodos = typeof r.periodos === 'string' ? JSON.parse(r.periodos||'[]') : (r.periodos||[]);
    if (!porFunc[r.funcionario]) porFunc[r.funcionario] = { nome: r.funcionario, cargo: r.cargo||'', diaria: r.diaria_base, fracoes: 0, valor: 0, obras: {} };
    porFunc[r.funcionario].fracoes += Number(r.total_fracoes||0);
    porFunc[r.funcionario].valor += Number(r.valor||0);
    periodos.forEach(p => { porFunc[r.funcionario].obras[p.obra] = (porFunc[r.funcionario].obras[p.obra]||0) + (p.fracao||0); });
  });
  const ordem = { 'Mestre':1, 'Pedreiro':2, 'Betoneiro':3, 'Servente':4 };
  const funcs = Object.values(porFunc).sort((a,b) => (ordem[a.cargo]||9) - (ordem[b.cargo]||9));
  const totalDiarias = funcs.reduce((s,f) => s + f.valor, 0);
  const isMestre = usuarioAtual?.perfil === 'mestre';

  // Mapear extras por funcionário
  const extras = diarGetExtrasQuinzena();
  const extrasPorFunc = {};
  extras.forEach(e => { extrasPorFunc[e.funcionario] = (extrasPorFunc[e.funcionario]||0) + e.valor; });
  const totalExtras = Object.values(extrasPorFunc).reduce((s,v)=>s+v,0);
  const totalGeral  = totalDiarias + totalExtras;

  // Faltas por funcionário — deve vir antes de rows
  const faltas = diarGetFaltasQuinzena();
  const diasLancados = [...new Set(regs.map(r => r.data))].length;
  const rows = funcs.map(f => {
    const extra     = extrasPorFunc[f.nome] || 0;
    const totalFunc = f.valor + extra;
    return `
    <tr>
      <td class="diarias-td-nome" style="cursor:pointer;text-decoration:underline dotted;text-underline-offset:3px;" onclick="diarAbrirCalendarioFunc('${esc(f.nome)}')" title="Ver calendário da quinzena">${esc(f.nome)} <span style="font-size:9px;color:var(--texto3)">📅</span></td>
      <td style="font-size:10px;color:var(--texto3)">${f.cargo||'-'}</td>
      ${isMestre ? '' : `<td style="color:var(--texto2);font-size:11px">R$ ${f.diaria} × ${f.fracoes.toFixed(1)}d</td>`}
      <td>${f.fracoes.toFixed(1)}d</td>
      ${isMestre ? '' : `<td style="text-align:center;font-weight:700;color:${(faltas[f.nome]||0)>0?'#f87171':'var(--texto3)'};">${faltas[f.nome]||0}</td>`}
      <td><div class="diarias-obras-breakdown">${Object.keys(f.obras).map(o => `<span class="diarias-obra-tag">${o}</span>`).join('')}</div></td>
      ${isMestre ? '' : `<td class="diarias-td-val">R$ ${f.valor.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>`}
      ${isMestre ? '' : `<td class="diarias-td-val" style="color:${extra>0?'#fbbf24':'var(--texto3)'};">${extra>0 ? `R$ ${extra.toLocaleString('pt-BR',{minimumFractionDigits:2})}` : '—'}</td>`}
      ${isMestre ? '' : `<td class="diarias-td-val" style="font-size:14px;font-weight:800;color:var(--verde-hl)">R$ ${totalFunc.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>`}
    </tr>`;
  }).join('');

  // Custo por obra
  const custoPorObra = diarCalcCustoObra();
  const obraLinhas = Object.entries(custoPorObra).sort((a,b)=>b[1]-a[1]).map(([o,v]) =>
    `<tr><td style="padding:7px 10px;font-weight:600">${o}</td>${isMestre ? '' : `<td style="padding:7px 10px;color:var(--verde-hl);font-family:'JetBrains Mono',monospace;text-align:right">R$ ${v.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>`}</tr>`).join('');
  const totalObras = Object.values(custoPorObra).reduce((s,v)=>s+v,0);
  const thDiaria  = isMestre ? '' : '<th>Diária × Dias</th>';
  const thFaltas  = isMestre ? '' : '<th style="text-align:center;color:#f87171">Faltas</th>';
  const thDiarias = isMestre ? '' : '<th style="text-align:right">Diárias</th>';
  const thExtra   = isMestre ? '' : '<th style="text-align:right;color:#fbbf24">Extra</th>';
  const thTotal   = isMestre ? '' : '<th style="text-align:right;color:var(--verde-hl)">Total</th>';
  const trTotal   = isMestre ? '' : `
    <tr class="diarias-folha-total-row">
      <td colspan="5" style="font-weight:700">TOTAL QUINZENA</td>
      <td class="diarias-td-val">R$ ${totalDiarias.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
      <td class="diarias-td-val" style="color:#fbbf24">R$ ${totalExtras.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
      <td class="diarias-td-val" style="font-size:15px;color:var(--verde-hl)">R$ ${totalGeral.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
    </tr>`;
  container.innerHTML = `
    <table class="diarias-folha-table">
      <thead><tr><th>Funcionário</th><th>Função</th>${thDiaria}<th>Dias</th>${thFaltas}<th>Obras</th>${thDiarias}${thExtra}${thTotal}</tr></thead>
      <tbody>${rows}${trTotal}</tbody>
    </table>
    ${!isMestre && obraLinhas ? `<div style="margin-top:16px;background:var(--bg2);border:1px solid var(--borda);border-radius:10px;overflow:hidden">
      <div style="padding:10px 14px;background:rgba(255,255,255,0.04);font-weight:700;font-size:12px;letter-spacing:.08em;color:var(--verde-hl)">🏗 CUSTO MÃO DE OBRA POR OBRA</div>
      <table style="width:100%;border-collapse:collapse"><tbody>${obraLinhas}</tbody>
        <tfoot><tr style="border-top:1px solid var(--borda)">
          <td style="padding:9px 10px;font-weight:700">TOTAL</td>
          <td style="padding:9px 10px;font-weight:700;color:var(--verde-hl);text-align:right;font-family:'JetBrains Mono',monospace">R$ ${totalObras.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
        </tr></tfoot>
      </table>
    </div>` : ''}`;
}

// ────────────────────────────────────────────
// EXTRAS / BONIFICAÇÕES
// ────────────────────────────────────────────
function diarGetExtrasQuinzena() { return diarExtras; }

function diarAbrirModalExtra() {
  // Popular select de funcionários (dinâmico)
  const selFunc = document.getElementById('diar-extra-func');
  selFunc.innerHTML = '<option value="">Selecionar...</option>';
  diarGetFuncionariosAtivos().forEach(f => {
    selFunc.innerHTML += `<option value="${esc(f.nome)}">${esc(f.nome)} (${f.cargo})</option>`;
  });
  // Popular select de obras
  const sel = document.getElementById('diar-extra-obra');
  sel.innerHTML = '<option value="">Selecionar obra...</option>';
  [...obras, ...obrasArquivadas].forEach(o => {
    sel.innerHTML += `<option value="${o.nome}">${o.nome}</option>`;
  });
  // Limpar campos
  document.getElementById('diar-extra-func').value = '';
  document.getElementById('diar-extra-desc').value = '';
  document.getElementById('diar-extra-valor').value = '';
  document.getElementById('diar-modalExtra').style.display = 'flex';
}

function diarFecharModalExtra() {
  document.getElementById('diar-modalExtra').style.display = 'none';
}

async function diarSalvarExtra() {
  const func  = document.getElementById('diar-extra-func').value.trim();
  const desc  = document.getElementById('diar-extra-desc').value.trim();
  const valor = parseFloat(document.getElementById('diar-extra-valor').value);
  const obra  = document.getElementById('diar-extra-obra').value;
  if (!func)  { showToast('⚠ Selecione o funcionário.'); return; }
  if (!desc)  { showToast('⚠ Informe a descrição.'); return; }
  if (!valor||valor<=0) { showToast('⚠ Informe um valor válido.'); return; }
  if (!obra)  { showToast('⚠ Selecione a obra.'); return; }
  try {
    const [novo] = await sbPost('diarias_extras', { quinzena_id: diarQuinzenaAtiva.id, funcionario: func, descricao: desc, valor, obra });
    diarExtras.push(novo);
    diarFecharModalExtra(); diarRenderExtras(); diarRenderFolha();
    showToast('✅ Extra registrado!');
  } catch(e) { showToast('❌ Não foi possível salvar o extra.'); }
}

async function diarExcluirExtra(id) {
  if (!confirm('Remover este extra? Esta ação não pode ser desfeita.')) return;
  try {
    await sbDelete('diarias_extras', `?id=eq.${id}`);
    diarExtras = diarExtras.filter(e => e.id !== id);
    diarRenderExtras(); diarRenderFolha();
    showToast('✅ Extra removido.');
  } catch(e) { showToast('❌ Não foi possível remover o extra.'); }
}

function diarRenderExtras() {
  const el = document.getElementById('diar-extras-lista');
  if (!el) return;
  const extras = diarGetExtrasQuinzena();
  if (!extras.length) {
    el.innerHTML = '<div style="font-size:11px;color:var(--texto3);padding:8px 0;">Nenhum extra lançado nesta quinzena.</div>';
    return;
  }
  const totalExtras = extras.reduce((s, e) => s + e.valor, 0);
  el.innerHTML = `
    <div style="background:var(--bg2);border:1px solid var(--borda);border-radius:10px;overflow:hidden;margin-bottom:8px;">
      ${extras.map(e => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:9px 12px;border-bottom:1px solid var(--borda);gap:8px;flex-wrap:wrap;">
          <div style="display:flex;flex-direction:column;gap:2px;flex:1;">
            <span style="font-weight:700;color:var(--branco);font-size:12px;">${e.funcionario}</span>
            <span style="font-size:10px;color:var(--texto3);">${e.descricao||e.desc||''} · <span style="color:var(--verde3)">${e.obra}</span></span>
          </div>
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="font-weight:700;color:var(--verde-hl);font-family:'JetBrains Mono',monospace;font-size:13px;">R$ ${e.valor.toLocaleString('pt-BR',{minimumFractionDigits:2})}</span>
            <button onclick="diarExcluirExtra('${esc(e.id)}')" style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);color:#f87171;border-radius:6px;padding:3px 8px;font-size:11px;cursor:pointer;">✕</button>
          </div>
        </div>`).join('')}
      <div style="padding:9px 12px;display:flex;justify-content:space-between;align-items:center;background:rgba(255,255,255,0.03);">
        <span style="font-size:11px;font-weight:700;color:var(--texto2);">TOTAL EXTRAS</span>
        <span style="font-weight:800;color:var(--verde-hl);font-family:'JetBrains Mono',monospace;">R$ ${totalExtras.toLocaleString('pt-BR',{minimumFractionDigits:2})}</span>
      </div>
    </div>`;
}

function diarCalcCustoObra() {
  const regs = diarGetRegistrosQuinzena();
  const porObra = {};
  regs.forEach(r => { r.periodos.forEach(p => { porObra[p.obra] = (porObra[p.obra]||0) + r.diaria_base * p.fracao; }); });
  // Somar extras por obra
  diarGetExtrasQuinzena().forEach(e => { porObra[e.obra] = (porObra[e.obra]||0) + e.valor; });
  return porObra;
}

// ────────────────────────────────────────────
// TABS
// ────────────────────────────────────────────
function diarSwitchTab(tab, el) {
  document.querySelectorAll('#view-diarias .diarias-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('diar-tabRegistros').style.display = tab === 'registros' ? 'block' : 'none';
  document.getElementById('diar-tabFolha').style.display = tab === 'folha' ? 'block' : 'none';
  if (tab === 'folha') { diarCarregarRegistros().then(() => { diarRenderFolha(); diarRenderExtras(); }); }
}

// ────────────────────────────────────────────
// EXPORTAR CSV
// ────────────────────────────────────────────
function diarExportarFolha() {
  try {
    const regs = diarGetRegistrosQuinzena();
    if (!regs.length) { showToast('⚠ Nenhum dado para exportar.'); return; }

    // Carregar jsPDF dinamicamente se não estiver disponível
    if (!window.jspdf) {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
      script.onload = () => diarGerarPDF(regs);
      script.onerror = () => { showToast('❌ Não foi possível carregar o gerador de PDF. Tente novamente.'); };
      document.head.appendChild(script);
    } else {
      diarGerarPDF(regs);
    }
  } catch(e) { showToast('❌ Não foi possível exportar: ' + e.message); }
}

function diarGerarPDF(regs) {
  try {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = 210, margem = 14;
  const quinzena = (diarQuinzenaAtiva?.label||'Quinzena');
  const hoje = new Date().toLocaleDateString('pt-BR');

  // ── Cores
  const VERDE  = [10, 61, 24];   // #0a3d18
  const BRANCO = [255, 255, 255];
  const CINZA1 = [30, 30, 30];
  const CINZA2 = [60, 60, 60];
  const CINZA3 = [120, 120, 120];
  const LINHA  = [220, 220, 220];
  const VERDE_CL = [232, 245, 233];

  let y = 0;

  // ── CABEÇALHO
  doc.setFillColor(...VERDE);
  doc.rect(0, 0, W, 28, 'F');
  doc.setTextColor(...BRANCO);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('EDR ENGENHARIA', margem, 12);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('GESTÃO INTEGRADA DE OBRAS', margem, 18);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('FOLHA DE PAGAMENTO — DIÁRIAS', W - margem, 12, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(quinzena, W - margem, 18, { align: 'right' });
  doc.text(`Emitido em: ${hoje}`, W - margem, 23, { align: 'right' });
  y = 36;

  // ── SEÇÃO RESUMO POR FUNCIONÁRIO
  doc.setTextColor(...CINZA1);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('RESUMO POR FUNCIONÁRIO', margem, y);
  y += 5;

  // Cabeçalho da tabela
  const colW = [62, 28, 22, 28, 28, 28]; // Funcionário, Cargo, Dias, Diária, Total
  const colX = [margem];
  colW.forEach((w, i) => colX.push(colX[i] + colW[i]));

  doc.setFillColor(...VERDE);
  doc.rect(margem, y, W - margem * 2, 7, 'F');
  doc.setTextColor(...BRANCO);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  const headers = ['FUNCIONÁRIO', 'CARGO', 'DIAS', 'DIÁRIA (R$)', 'TOTAL (R$)'];
  const aligns  = ['left', 'left', 'center', 'right', 'right'];
  headers.forEach((h, i) => {
    const x = aligns[i] === 'right' ? colX[i] + colW[i] - 2
            : aligns[i] === 'center' ? colX[i] + colW[i] / 2 : colX[i] + 2;
    doc.text(h, x, y + 5, { align: aligns[i] });
  });
  y += 7;

  // Montar dados resumo
  const ordem = { 'Mestre': 1, 'Pedreiro': 2, 'Betoneiro': 3, 'Servente': 4 };
  const porFunc = {};
  regs.forEach(r => {
    if (!porFunc[r.funcionario]) porFunc[r.funcionario] = { nome: r.funcionario, cargo: r.cargo || '', diaria: r.diaria_base, fracoes: 0, valor: 0, obras: {} };
    porFunc[r.funcionario].fracoes += r.total_fracoes;
    porFunc[r.funcionario].valor += r.valor;
    r.periodos.forEach(p => { porFunc[r.funcionario].obras[p.obra] = (porFunc[r.funcionario].obras[p.obra] || 0) + p.fracao; });
  });
  const funcs = Object.values(porFunc).sort((a, b) => (ordem[a.cargo] || 9) - (ordem[b.cargo] || 9));
  const totalGeral = funcs.reduce((s, f) => s + f.valor, 0);

  funcs.forEach((f, idx) => {
    if (idx % 2 === 0) {
      doc.setFillColor(248, 248, 248);
      doc.rect(margem, y, W - margem * 2, 7, 'F');
    }
    doc.setTextColor(...CINZA1);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text(f.nome, colX[0] + 2, y + 5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...CINZA2);
    doc.text(f.cargo, colX[1] + 2, y + 5);
    doc.text(f.fracoes.toFixed(1), colX[2] + colW[2] / 2, y + 5, { align: 'center' });
    doc.text(`R$ ${f.diaria.toFixed(2)}`, colX[3] + colW[3] - 2, y + 5, { align: 'right' });
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...VERDE);
    doc.text(`R$ ${f.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, colX[4] + colW[4] - 2, y + 5, { align: 'right' });
    y += 7;
  });

  // Linha total
  doc.setFillColor(...VERDE_CL);
  doc.rect(margem, y, W - margem * 2, 8, 'F');
  doc.setTextColor(...CINZA1);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('TOTAL DIÁRIAS', colX[0] + 2, y + 5.5);
  doc.setTextColor(...VERDE);
  doc.text(`R$ ${totalGeral.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, colX[4] + colW[4] - 2, y + 5.5, { align: 'right' });
  y += 10;

  // Extras
  const extras = diarGetExtrasQuinzena();
  if (extras.length) {
    doc.setTextColor(...CINZA1);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('EXTRAS / BONIFICAÇÕES', margem, y);
    y += 5;
    doc.setFillColor(...VERDE);
    doc.rect(margem, y, W - margem * 2, 7, 'F');
    doc.setTextColor(...BRANCO);
    doc.setFontSize(8);
    doc.text('FUNCIONÁRIO', margem + 2, y + 5);
    doc.text('DESCRIÇÃO', colX[1] + 2, y + 5);
    doc.text('OBRA', colX[3] + 2, y + 5);
    doc.text('VALOR (R$)', W - margem - 2, y + 5, { align: 'right' });
    y += 7;
    const totalExtras = extras.reduce((s,e) => s + e.valor, 0);
    extras.forEach((e, idx) => {
      if (idx % 2 === 0) { doc.setFillColor(248,248,248); doc.rect(margem, y, W-margem*2, 7, 'F'); }
      doc.setTextColor(...CINZA1); doc.setFont('helvetica','bold'); doc.setFontSize(8.5);
      doc.text(e.funcionario, margem + 2, y + 5);
      doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(...CINZA2);
      doc.text((e.descricao||'').substring(0,28), colX[1]+2, y+5);
      doc.text((e.obra||'').substring(0,18), colX[3]+2, y+5);
      doc.setFont('helvetica','bold'); doc.setTextColor(...VERDE);
      doc.text(`R$ ${e.valor.toLocaleString('pt-BR',{minimumFractionDigits:2})}`, W-margem-2, y+5, {align:'right'});
      y += 7;
    });
    doc.setFillColor(...VERDE_CL);
    doc.rect(margem, y, W-margem*2, 8, 'F');
    doc.setTextColor(...CINZA1); doc.setFont('helvetica','bold'); doc.setFontSize(9);
    doc.text('TOTAL EXTRAS', colX[0]+2, y+5.5);
    doc.setTextColor(...VERDE);
    doc.text(`R$ ${totalExtras.toLocaleString('pt-BR',{minimumFractionDigits:2})}`, W-margem-2, y+5.5, {align:'right'});
    y += 10;
    // Total geral (diárias + extras)
    const totalFinal = totalGeral + totalExtras;
    doc.setFillColor(...VERDE);
    doc.rect(margem, y, W-margem*2, 9, 'F');
    doc.setTextColor(...BRANCO); doc.setFont('helvetica','bold'); doc.setFontSize(10);
    doc.text('TOTAL GERAL (DIÁRIAS + EXTRAS)', margem+2, y+6.2);
    doc.text(`R$ ${totalFinal.toLocaleString('pt-BR',{minimumFractionDigits:2})}`, W-margem-2, y+6.2, {align:'right'});
    y += 14;
  } else {
    y += 4;
  }

  // ── SEÇÃO CUSTO POR OBRA
  const custoPorObra = diarCalcCustoObra();
  if (Object.keys(custoPorObra).length) {
    doc.setTextColor(...CINZA1);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('CUSTO DE MÃO DE OBRA POR OBRA', margem, y);
    y += 5;

    doc.setFillColor(...VERDE);
    doc.rect(margem, y, W - margem * 2, 7, 'F');
    doc.setTextColor(...BRANCO);
    doc.setFontSize(8);
    doc.text('OBRA', margem + 2, y + 5);
    doc.text('TOTAL (R$)', W - margem - 2, y + 5, { align: 'right' });
    y += 7;

    const obrasOrdenadas = Object.entries(custoPorObra).sort((a, b) => b[1] - a[1]);
    obrasOrdenadas.forEach(([obra, val], idx) => {
      if (idx % 2 === 0) { doc.setFillColor(248, 248, 248); doc.rect(margem, y, W - margem * 2, 7, 'F'); }
      doc.setTextColor(...CINZA1);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.text(obra, margem + 2, y + 5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...VERDE);
      doc.text(`R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, W - margem - 2, y + 5, { align: 'right' });
      y += 7;
    });
    y += 6;
  }

  // ── RODAPÉ
  y = Math.max(y + 10, 255);
  if (y > 270) { doc.addPage(); y = 240; }
  doc.setDrawColor(...LINHA);
  doc.line(margem, y, W - margem, y);
  y += 6;
  doc.setTextColor(...CINZA3);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text('EDR Engenharia — Documento gerado pelo EDR System', margem, y);
  doc.text(`Página 1`, W - margem, y, { align: 'right' });

  // Salvar
  doc.save(`EDR_Folha_${(diarQuinzenaAtiva?.label||'quinzena').replace(/[^a-zA-Z0-9]/g,'_')}.pdf`);
  showToast('✅ PDF gerado!');
  } catch(e) { showToast('❌ Não foi possível gerar o PDF: ' + e.message); }
}

// ────────────────────────────────────────────
// MODAL LANÇAR NO EDR SYSTEM
// ────────────────────────────────────────────
async function diarBuscarObras() {
  if (_diarObrasCache) return _diarObrasCache;
  try {
    const lista = await sbGet('obras', '?select=id,nome&arquivada=eq.false&order=nome.asc');
    _diarObrasCache = {};
    lista.forEach(o => { _diarObrasCache[o.nome.toUpperCase()] = o.id; });
    return _diarObrasCache;
  } catch(e) { console.error(e); return null; }
}

async function diarAbrirModalEDR() {
  const custoPorObra = diarCalcCustoObra();
  if (!Object.keys(custoPorObra).length) { showToast('⚠ Nenhum dado na quinzena atual.'); return; }
  const obs = `Folha quinzenal · ${(diarQuinzenaAtiva?.label||'Quinzena')}`;
  const modal = document.getElementById('diar-modalEDR');
  modal.style.display = 'flex';
  document.getElementById('diar-modalEDRBody').innerHTML =
    '<div style="text-align:center;padding:28px;color:var(--texto3);font-size:12px">⏳ Carregando obras do EDR System...</div>';
  modal.dataset.obs = obs;
  const obrasMap = await diarBuscarObras();
  if (!obrasMap) {
    document.getElementById('diar-modalEDRBody').innerHTML =
      '<div style="text-align:center;padding:28px;color:#f87171;font-size:12px">❌ Não foi possível conectar ao EDR System.</div>';
    return;
  }
  const linhas = Object.entries(custoPorObra).map(([obra, valor]) => {
    const id = obrasMap[obra.toUpperCase()] || null;
    const status = id ? '✅' : '⚠️ não encontrada';
    return `<tr data-obra="${obra}" data-valor="${valor.toFixed(2)}" data-id="${id||''}">
      <td style="padding:7px 5px;font-family:'JetBrains Mono',monospace;font-size:11px">${status}</td>
      <td style="padding:7px 5px;font-weight:600">${obra}</td>
      <td style="padding:7px 5px;color:var(--verde-hl);font-family:'JetBrains Mono',monospace;text-align:right">R$ ${valor.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
    </tr>`;
  }).join('');
  const total = Object.values(custoPorObra).reduce((s,v)=>s+v,0);
  document.getElementById('diar-modalEDRBody').innerHTML = `
    <p style="color:var(--texto3);font-size:12px;margin-bottom:10px">
      Cada linha será lançada como <strong>MAO DE OBRA</strong> na obra correspondente.<br>
      Obs: <em>${obs}</em>
    </p>
    <table style="width:100%;border-collapse:collapse">
      <thead><tr style="border-bottom:1px solid var(--borda)">
        <th style="padding:5px;text-align:left;font-size:10px;color:var(--texto3)"></th>
        <th style="padding:5px;text-align:left;font-size:10px;color:var(--texto3)">OBRA</th>
        <th style="padding:5px;text-align:right;font-size:10px;color:var(--texto3)">CUSTO MO</th>
      </tr></thead>
      <tbody>${linhas}</tbody>
      <tfoot><tr style="border-top:1px solid var(--borda)">
        <td colspan="2" style="padding:9px 5px;font-weight:700">TOTAL</td>
        <td style="padding:9px 5px;color:var(--verde-hl);font-weight:700;text-align:right;font-family:'JetBrains Mono',monospace">R$ ${total.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
      </tr></tfoot>
    </table>
    <div id="diar-edrStatus" style="margin-top:10px;min-height:20px;font-size:11px;color:var(--texto3)"></div>`;
  modal.dataset.obs = obs;
}

async function diarConfirmarLancamentosEDR() {
  const btn = document.getElementById('diar-btnConfirmarEDR');
  btn.disabled = true; btn.textContent = 'Lançando...';
  const statusEl = document.getElementById('diar-edrStatus');
  const obs = document.getElementById('diar-modalEDR').dataset.obs || 'Folha quinzenal';
  const hoje = hojeISO();
  const rows = document.querySelectorAll('#diar-modalEDRBody tbody tr');
  let ok = 0, erro = 0;
  for (const row of rows) {
    const obra = row.dataset.obra; const valor = parseFloat(row.dataset.valor); const obraId = row.dataset.id;
    if (!obraId) { statusEl.innerHTML += `<div style="color:#f87171">⚠️ ${obra}: sem ID, pulando</div>`; erro++; continue; }
    try {
      await sbPostMinimal('lancamentos', { obra_id: obraId, descricao: 'MAO DE OBRA', qtd: 1, preco: valor, total: valor, data: hoje, obs, etapa: '28_mao' });
      statusEl.innerHTML += `<div style="color:var(--verde-hl)">✅ ${obra}: R$ ${valor.toLocaleString('pt-BR',{minimumFractionDigits:2})} lançado</div>`;
      ok++;
    } catch(e) { statusEl.innerHTML += `<div style="color:#f87171">❌ ${obra}: ${e.message}</div>`; erro++; }
  }
  btn.textContent = ok > 0 ? `✅ ${ok} lançado(s)${erro > 0 ? ` / ⚠️ ${erro} erro(s)` : ''}` : '❌ Falhou';
  if (ok > 0) { _diarObrasCache = null; showToast(`✅ ${ok} lançamento(s) enviado(s)!`); }
}

function diarFecharModalEDR() {
  document.getElementById('diar-modalEDR').style.display = 'none';
  const btn = document.getElementById('diar-btnConfirmarEDR');
  btn.disabled = false; btn.textContent = '🚀 Confirmar e Lançar Tudo';
}
// ══════════════════════════════════════════
