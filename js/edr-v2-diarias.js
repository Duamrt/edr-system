// ══════════════════════════════════════════════════════════════════
// EDR System V2 — Modulo: DIARIAS (Pagamento de Trabalhadores)
// Depende: api.js, utils.js, config.js, obras.js (ETAPAS, obras),
//          auth.js (usuarioAtual, aplicarPerfil), dashboard.js
// Auditado por: GM (Gemini) — 04/04/2026
// ══════════════════════════════════════════════════════════════════

// ── ESTADO ENCAPSULADO ──────────────────────────────────────────
const DiariasModule = {
  // Funcionarios
  funcionarios: {},          // mapa alias→{nome, cargo, diaria}
  funcionariosRaw: [],       // array original Supabase
  team: [],                  // nomes ativos ordenados por hierarquia
  _funcionariosCarregados: false,

  // Quinzenas
  quinzenas: [],
  quinzenaAtiva: null,
  _criacaoEmAndamento: false,

  // Registros e extras da quinzena ativa
  registros: [],
  extras: [],

  // Interpretacao
  interpretado: null,        // resultado do parser

  // UI
  tab: 'registros',          // 'registros' | 'folha'
  panelRecolhido: false,

  // Voz
  _vozAtivo: false,
  _recognition: null,

  // Cache
  _obrasCache: null,
};


// ── REGISTRO NO VIEW REGISTRY ───────────────────────────────────
if (typeof viewRegistry !== 'undefined') {
  viewRegistry.register('diarias', initDiarias);
}


// ══════════════════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════════════════
async function initDiarias() {
  const dataInput = document.getElementById('diar-dataInput');
  if (dataInput && !dataInput.value) dataInput.value = hojeISO();

  if (!_companyId && typeof loadCompanyId === 'function') await loadCompanyId();

  // Reset estado
  DiariasModule.quinzenas = [];
  DiariasModule.quinzenaAtiva = null;
  DiariasModule.registros = [];
  DiariasModule.extras = [];

  await _diarCarregarFuncionarios();
  await _diarCarregarQuinzenas();
  _diarRenderRegistros();
  _diarRenderExtras();

  if (usuarioAtual?.perfil === 'mestre') _diarPopularFormManual();
  aplicarPerfil();

  if (usuarioAtual?.perfil === 'mestre') {
    const btnNova = document.getElementById('btn-diar-nova-quinzena');
    if (btnNova) btnNova.style.display = 'none';
  }
}


// ══════════════════════════════════════════════════════════════════
// FUNCIONARIOS — Supabase (100% dinamico, zero fallback hardcoded)
// ══════════════════════════════════════════════════════════════════
async function _diarCarregarFuncionarios() {
  try {
    const lista = await sbGet('diarias_funcionarios', '?order=nome.asc');
    if (!Array.isArray(lista) || !lista.length) return;
    DiariasModule._funcionariosCarregados = true;
    DiariasModule.funcionariosRaw = lista;
    _diarReconstruirMapa();
  } catch (e) {
    console.warn('[DIARIAS] Fallback funcionarios', e);
  }
}

function _diarReconstruirMapa() {
  DiariasModule.funcionarios = {};
  DiariasModule.funcionariosRaw.filter(f => f.ativo).forEach(f => {
    const entry = { nome: f.nome, cargo: f.cargo, diaria: Number(f.diaria) };
    DiariasModule.funcionarios[f.nome.toLowerCase()] = entry;
    const apelidos = Array.isArray(f.apelidos) ? f.apelidos : [];
    apelidos.forEach(a => { if (a) DiariasModule.funcionarios[a.toLowerCase()] = entry; });
  });
  _diarAtualizarTeam();
}

function _diarAtualizarTeam() {
  const ativos = DiariasModule.funcionariosRaw.filter(f => f.ativo);
  const ordem = { 'Mestre': 1, 'Pedreiro': 2, 'Betoneiro': 3, 'Servente': 4 };
  ativos.sort((a, b) => (ordem[a.cargo] || 9) - (ordem[b.cargo] || 9));
  DiariasModule.team = [];
  ativos.forEach(f => {
    if (!DiariasModule.team.includes(f.nome)) DiariasModule.team.push(f.nome);
  });
}

function _diarGetFuncionariosAtivos() {
  if (DiariasModule.funcionariosRaw.length) return DiariasModule.funcionariosRaw.filter(f => f.ativo);
  return [];
}


// ══════════════════════════════════════════════════════════════════
// EQUIPE — CRUD Funcionarios (Modal)
// ══════════════════════════════════════════════════════════════════
function diarAbrirModalEquipe() {
  let modal = document.getElementById('diar-modalEquipe');
  if (!modal) {
    document.body.insertAdjacentHTML('beforeend', `
    <div id="diar-modalEquipe" class="modal-overlay active" onclick="if(event.target===this)document.getElementById('diar-modalEquipe').style.display='none'">
      <div class="modal-box" style="max-width:540px;width:95vw;max-height:90vh;overflow-y:auto;">
        <div class="modal-header">
          <div class="modal-title"><span class="material-symbols-outlined" style="font-size:20px;vertical-align:middle;">group</span> EQUIPE DE OBRA</div>
          <button class="modal-close" onclick="document.getElementById('diar-modalEquipe').style.display='none'">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
        <div id="diar-equipe-lista" style="padding:0 20px;"></div>
        <div style="margin-top:16px;border-top:1px solid var(--border);padding:16px 0 0;">
          <div style="font-size:10px;font-weight:700;color:var(--primary);letter-spacing:1px;margin-bottom:10px;">+ ADICIONAR FUNCIONARIO</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
            <input id="diar-eq-nome" type="text" placeholder="Nome" style="padding:8px 10px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text-primary);font-family:inherit;font-size:12px;width:100%;box-sizing:border-box;">
            <select id="diar-eq-cargo" style="padding:8px 10px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text-primary);font-family:inherit;font-size:12px;width:100%;box-sizing:border-box;">
              <option value="Servente">Servente</option>
              <option value="Pedreiro">Pedreiro</option>
              <option value="Betoneiro">Betoneiro</option>
              <option value="Mestre">Mestre</option>
              <option value="Eletricista">Eletricista</option>
              <option value="Encanador">Encanador</option>
            </select>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">
            <input id="diar-eq-diaria" type="number" placeholder="Diaria (R$)" min="0" step="5" style="padding:8px 10px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text-primary);font-family:inherit;font-size:12px;width:100%;box-sizing:border-box;">
            <input id="diar-eq-apelidos" type="text" placeholder="Apelidos (virgula)" style="padding:8px 10px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text-primary);font-family:inherit;font-size:12px;width:100%;box-sizing:border-box;">
          </div>
          <button onclick="diarAdicionarFuncionario()" class="btn btn-primary" style="width:100%;padding:10px;">ADICIONAR</button>
        </div>
      </div>
    </div>`);
    modal = document.getElementById('diar-modalEquipe');
  } else {
    modal.style.display = 'flex';
  }
  _diarRenderListaEquipe();
}

function _diarRenderListaEquipe() {
  const el = document.getElementById('diar-equipe-lista');
  if (!el) return;
  const todos = [...DiariasModule.funcionariosRaw];
  if (!todos.length) { el.innerHTML = '<div class="edr-empty">Nenhum funcionario cadastrado.</div>'; return; }

  const ordem = { 'Mestre': 1, 'Pedreiro': 2, 'Betoneiro': 3, 'Servente': 4 };
  todos.sort((a, b) => {
    if (a.ativo !== b.ativo) return a.ativo ? -1 : 1;
    return (ordem[a.cargo] || 9) - (ordem[b.cargo] || 9);
  });

  el.innerHTML = todos.map(f => {
    const apelidos = Array.isArray(f.apelidos) ? f.apelidos.filter(Boolean).join(', ') : '';
    const opaco = f.ativo ? '' : 'opacity:0.4;';
    const statusStyle = f.ativo
      ? 'background:rgba(5,150,105,.1);color:var(--success);font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;'
      : 'background:rgba(239,68,68,.1);color:var(--error);font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;';
    const statusText = f.ativo ? 'ATIVO' : 'INATIVO';
    const btnToggle = f.ativo
      ? `<button onclick="diarToggleFuncionario('${esc(f.id)}',false)" class="edr-btn-sm" style="color:var(--error);border-color:rgba(239,68,68,.3);">desativar</button>`
      : `<button onclick="diarToggleFuncionario('${esc(f.id)}',true)" class="edr-btn-sm edr-btn-success-outline">reativar</button>`;
    const btnEditar = `<button onclick="diarEditarFuncionario('${esc(f.id)}')" class="edr-btn-sm" style="color:#60a5fa;border-color:rgba(96,165,250,.3);">editar</button>`;
    const btnExcluir = !f.ativo ? `<button onclick="diarExcluirFuncionario('${esc(f.id)}','${esc(f.nome)}')" class="edr-btn-sm" style="color:var(--error);border-color:rgba(239,68,68,.3);">excluir</button>` : '';
    return `<div style="${opaco}display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);gap:8px;min-width:0;">
      <div style="flex:1;min-width:0;overflow:hidden;">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <span style="font-weight:700;font-size:13px">${esc(f.nome)}</span>
          <span style="font-size:11px;color:var(--text-tertiary);">${f.cargo}</span>
          <span style="${statusStyle}">${statusText}</span>
        </div>
        <div style="font-size:11px;color:var(--text-tertiary);margin-top:2px;">
          R$ ${Number(f.diaria).toFixed(2)}${apelidos ? ' · apelidos: ' + apelidos : ''}
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:4px;flex-shrink:0;">${btnEditar}${btnToggle}${btnExcluir}</div>
    </div>`;
  }).join('');
}

async function diarAdicionarFuncionario() {
  const nome = document.getElementById('diar-eq-nome').value.trim();
  const cargo = document.getElementById('diar-eq-cargo').value;
  const diaria = parseFloat(document.getElementById('diar-eq-diaria').value) || 80;
  const apelidosStr = document.getElementById('diar-eq-apelidos').value.trim();
  const apelidos = apelidosStr ? apelidosStr.split(',').map(a => a.trim().toLowerCase()).filter(Boolean) : [];
  if (!nome) { showToast('Informe o nome.'); return; }
  if (DiariasModule.funcionariosRaw.find(f => f.nome.toLowerCase() === nome.toLowerCase())) {
    showToast('Ja existe um funcionario com esse nome.'); return;
  }
  try {
    const novo = await sbPost('diarias_funcionarios', { nome, cargo, diaria, apelidos, ativo: true });
    DiariasModule.funcionariosRaw.push(novo);
    _diarReconstruirMapa();
    _diarRenderListaEquipe();
    document.getElementById('diar-eq-nome').value = '';
    document.getElementById('diar-eq-diaria').value = '';
    document.getElementById('diar-eq-apelidos').value = '';
    showToast(nome + ' adicionado!');
  } catch (e) { showToast('Nao foi possivel adicionar: ' + e.message); }
}

async function diarToggleFuncionario(id, ativo) {
  try {
    await sbPatch('diarias_funcionarios', `?id=eq.${id}`, { ativo });
    const f = DiariasModule.funcionariosRaw.find(f => f.id === id);
    if (f) f.ativo = ativo;
    _diarReconstruirMapa();
    _diarRenderListaEquipe();
    showToast(ativo ? 'Funcionario reativado!' : 'Funcionario desativado.');
  } catch (e) { showToast('Erro: ' + e.message); }
}

async function diarExcluirFuncionario(id, nome) {
  const ok = await confirmar('Excluir ' + nome + ' permanentemente? Isso nao afeta registros antigos.');
  if (!ok) return;
  try {
    await sbDelete('diarias_funcionarios', `?id=eq.${id}`);
    DiariasModule.funcionariosRaw = DiariasModule.funcionariosRaw.filter(f => f.id !== id);
    _diarReconstruirMapa();
    _diarRenderListaEquipe();
    showToast(nome + ' excluido.');
  } catch (e) { showToast('Erro: ' + e.message); }
}

function diarEditarFuncionario(id) {
  const f = DiariasModule.funcionariosRaw.find(f => f.id === id);
  if (!f) return;
  const apelidos = Array.isArray(f.apelidos) ? f.apelidos.join(', ') : '';
  const inputStyle = 'padding:8px 10px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text-primary);font-family:inherit;font-size:12px;width:100%;box-sizing:border-box;';
  const labelStyle = 'display:block;font-size:10px;font-weight:700;color:var(--text-tertiary);letter-spacing:1px;margin-bottom:4px;';
  document.body.insertAdjacentHTML('beforeend', `
  <div id="diar-editFunc" class="modal-overlay active" onclick="if(event.target===this)document.getElementById('diar-editFunc').remove()">
    <div class="modal-box" style="max-width:400px;width:95vw;">
      <div class="modal-header">
        <div class="modal-title">Editar ${esc(f.nome)}</div>
        <button class="modal-close" onclick="document.getElementById('diar-editFunc').remove()">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>
      <div style="padding:20px;display:flex;flex-direction:column;gap:12px;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <div><label style="${labelStyle}">NOME</label><input id="diar-edit-nome" type="text" value="${esc(f.nome)}" style="${inputStyle}"></div>
          <div><label style="${labelStyle}">CARGO</label><select id="diar-edit-cargo" style="${inputStyle}">
            <option value="Servente" ${f.cargo === 'Servente' ? 'selected' : ''}>Servente</option>
            <option value="Pedreiro" ${f.cargo === 'Pedreiro' ? 'selected' : ''}>Pedreiro</option>
            <option value="Betoneiro" ${f.cargo === 'Betoneiro' ? 'selected' : ''}>Betoneiro</option>
            <option value="Mestre" ${f.cargo === 'Mestre' ? 'selected' : ''}>Mestre</option>
            <option value="Eletricista" ${f.cargo === 'Eletricista' ? 'selected' : ''}>Eletricista</option>
            <option value="Encanador" ${f.cargo === 'Encanador' ? 'selected' : ''}>Encanador</option>
          </select></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <div><label style="${labelStyle}">DIARIA (R$)</label><input id="diar-edit-diaria" type="number" value="${f.diaria}" min="0" step="5" style="${inputStyle}"></div>
          <div><label style="${labelStyle}">APELIDOS</label><input id="diar-edit-apelidos" type="text" value="${apelidos}" placeholder="virgula" style="${inputStyle}"></div>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:8px;padding-top:4px;">
          <button onclick="document.getElementById('diar-editFunc').remove()" class="btn btn-outline">CANCELAR</button>
          <button onclick="diarSalvarEdicaoFunc('${id}')" class="btn btn-primary">SALVAR</button>
        </div>
      </div>
    </div>
  </div>`);
}

async function diarSalvarEdicaoFunc(id) {
  const nome = document.getElementById('diar-edit-nome').value.trim();
  const cargo = document.getElementById('diar-edit-cargo').value;
  const diaria = parseFloat(document.getElementById('diar-edit-diaria').value) || 80;
  const apelidosStr = document.getElementById('diar-edit-apelidos').value.trim();
  const apelidos = apelidosStr ? apelidosStr.split(',').map(a => a.trim().toLowerCase()).filter(Boolean) : [];
  if (!nome) { showToast('Nome obrigatorio.'); return; }
  try {
    await sbPatch('diarias_funcionarios', `?id=eq.${id}`, { nome, cargo, diaria, apelidos });
    const f = DiariasModule.funcionariosRaw.find(f => f.id === id);
    if (f) { f.nome = nome; f.cargo = cargo; f.diaria = diaria; f.apelidos = apelidos; }
    _diarReconstruirMapa();
    document.getElementById('diar-editFunc')?.remove();
    _diarRenderListaEquipe();
    showToast(nome + ' atualizado!');
  } catch (e) { showToast('Erro: ' + e.message); }
}


// ══════════════════════════════════════════════════════════════════
// QUINZENAS — Supabase
// ══════════════════════════════════════════════════════════════════
let diarQuinzenas = []; // alias temporario p/ compatibilidade interna

async function _diarCarregarQuinzenas() {
  try {
    const todas = await sbGet('diarias_quinzenas', '?order=data_inicio.desc&limit=30');
    const arr = Array.isArray(todas) ? todas : [];
    DiariasModule.quinzenas = arr.filter(q => !q.excluida);
  } catch (e) { DiariasModule.quinzenas = []; }

  // Deduplicar
  if (DiariasModule.quinzenas.length > 1) {
    const seenDatas = {}, seenLabels = {}, duplicadas = [];
    for (const q of DiariasModule.quinzenas) {
      const chaveData = q.data_inicio + '|' + q.data_fim;
      const chaveLabel = (q.label || '').trim().toUpperCase();
      if (seenDatas[chaveData] || seenLabels[chaveLabel]) {
        duplicadas.push(q.id);
      } else {
        seenDatas[chaveData] = q;
        seenLabels[chaveLabel] = q;
      }
    }
    for (const id of duplicadas) {
      try { await sbPatch('diarias_quinzenas', '?id=eq.' + id, { excluida: true, excluida_em: new Date().toISOString() }); } catch (e) { /* ignora */ }
    }
    if (duplicadas.length) DiariasModule.quinzenas = DiariasModule.quinzenas.filter(q => !duplicadas.includes(q.id));
  }

  if (!DiariasModule.quinzenas.length) {
    showToast('Nenhuma quinzena encontrada. Crie uma clicando em +.');
    return;
  }

  if (!DiariasModule.quinzenaAtiva) {
    DiariasModule.quinzenaAtiva = DiariasModule.quinzenas.find(q => !q.fechada) || DiariasModule.quinzenas[0];
  } else {
    DiariasModule.quinzenaAtiva = DiariasModule.quinzenas.find(q => q.id === DiariasModule.quinzenaAtiva.id) || DiariasModule.quinzenas[0];
  }
  _diarAtualizarSelectQuinzena();
  await _diarCarregarRegistros();
}

async function _diarCriarQuinzenaAuto() {
  if (DiariasModule._criacaoEmAndamento) return;
  DiariasModule._criacaoEmAndamento = true;
  try {
    if (!_companyId) {
      if (typeof loadCompanyId === 'function') await loadCompanyId();
      if (!_companyId) { showToast('Erro: empresa nao carregada. Recarregue.'); DiariasModule._criacaoEmAndamento = false; return; }
    }
    const h = new Date();
    const ano = h.getFullYear(), mes = h.getMonth() + 1;
    const mesStr = h.toLocaleString('pt-BR', { month: 'long' }).toUpperCase();
    const q = h.getDate() <= 15 ? 1 : 2;
    const label = `${q === 1 ? '1\xaa' : '2\xaa'} QUINZENA \xb7 ${mesStr} ${ano}`;
    const inicio = q === 1 ? `${ano}-${String(mes).padStart(2, '0')}-01` : `${ano}-${String(mes).padStart(2, '0')}-16`;
    const fim = q === 1 ? `${ano}-${String(mes).padStart(2, '0')}-15` : new Date(ano, mes, 0).toISOString().split('T')[0];

    // Verificar duplicata antes de criar
    try {
      const todas = await sbGet('diarias_quinzenas', '?order=data_inicio.desc&limit=20');
      const existentes = (Array.isArray(todas) ? todas : []).filter(q => !q.excluida && q.data_inicio >= inicio && q.data_fim <= fim);
      if (existentes.length > 0) {
        DiariasModule.quinzenas = existentes;
        DiariasModule.quinzenaAtiva = existentes[0];
        _diarAtualizarSelectQuinzena();
        await _diarCarregarRegistros();
        DiariasModule._criacaoEmAndamento = false;
        return;
      }
    } catch (e) { /* segue pra criar */ }

    try {
      const nova = await sbPost('diarias_quinzenas', { label, data_inicio: inicio, data_fim: fim });
      DiariasModule.quinzenas = [nova];
      DiariasModule.quinzenaAtiva = nova;
    } catch (e) { showToast('Erro ao criar quinzena: ' + (e.message || '')); }
  } finally { DiariasModule._criacaoEmAndamento = false; }
  _diarAtualizarSelectQuinzena();
  await _diarCarregarRegistros();
}

function _diarAtualizarSelectQuinzena() {
  const sel = document.getElementById('diar-quinzena-select');
  if (sel) sel.innerHTML = DiariasModule.quinzenas.map(q =>
    `<option value="${q.id}" ${DiariasModule.quinzenaAtiva?.id === q.id ? 'selected' : ''}>${q.label}${q.fechada ? ' \u2713' : ''}</option>`
  ).join('');
  const badge = document.getElementById('diar-quinzena-badge');
  if (badge && DiariasModule.quinzenaAtiva) badge.textContent = DiariasModule.quinzenaAtiva.label;
}

async function diarExcluirQuinzena() {
  if (!DiariasModule.quinzenaAtiva) return;
  const regsCount = DiariasModule.registros.filter(r => r.quinzena_id === DiariasModule.quinzenaAtiva.id).length;
  const extrasCount = DiariasModule.extras.filter(e => e.quinzena_id === DiariasModule.quinzenaAtiva.id).length;

  if (regsCount > 0 || extrasCount > 0) {
    const ok = await confirmar('Mover "' + DiariasModule.quinzenaAtiva.label + '" para a lixeira?\n\n' + regsCount + ' registros e ' + extrasCount + ' extras serao arquivados.\nVoce pode restaurar depois.');
    if (!ok) return;
  } else {
    const ok = await confirmar('Excluir a quinzena vazia "' + DiariasModule.quinzenaAtiva.label + '"?');
    if (!ok) return;
    try {
      await sbDelete('diarias_quinzenas', `?id=eq.${DiariasModule.quinzenaAtiva.id}`);
      DiariasModule.quinzenas = DiariasModule.quinzenas.filter(q => q.id !== DiariasModule.quinzenaAtiva.id);
      DiariasModule.quinzenaAtiva = DiariasModule.quinzenas[0] || null;
      _diarAtualizarSelectQuinzena();
      _diarRenderRegistros(); _diarRenderExtras();
      showToast('Quinzena vazia excluida.');
    } catch (e) { showToast('Erro ao excluir.'); }
    return;
  }

  // Soft delete
  try {
    await sbPatch('diarias_quinzenas', `?id=eq.${DiariasModule.quinzenaAtiva.id}`, {
      excluida: true, excluida_em: new Date().toISOString()
    });
    DiariasModule.quinzenas = DiariasModule.quinzenas.filter(q => q.id !== DiariasModule.quinzenaAtiva.id);
    DiariasModule.quinzenaAtiva = DiariasModule.quinzenas[0] || null;
    DiariasModule.registros = []; DiariasModule.extras = [];
    _diarAtualizarSelectQuinzena();
    _diarRenderRegistros(); _diarRenderExtras();
    showToast('Quinzena movida pra lixeira.');
  } catch (e) { showToast('Erro: ' + e.message); }
}

// ── Lixeira de quinzenas ────────────────────────────
async function diarAbrirLixeira() {
  try {
    const excluidas = await sbGet('diarias_quinzenas', '?excluida=eq.true&order=excluida_em.desc');
    if (!excluidas || !excluidas.length) { showToast('Lixeira vazia.'); return; }

    const lista = excluidas.map(q => {
      const dataExc = q.excluida_em ? new Date(q.excluida_em).toLocaleDateString('pt-BR') : '';
      return `<div style="display:flex;justify-content:space-between;align-items:center;padding:12px;border-bottom:1px solid var(--border-primary);">
        <div>
          <div style="font-weight:700;font-size:13px;">${q.label}</div>
          <div style="color:var(--text-tertiary);" style="font-size:11px;">Excluida em ${dataExc}</div>
        </div>
        <div style="display:flex;gap:8px;">
          <button onclick="diarRestaurarQuinzena('${q.id}')" class="edr-btn-sm" style="background:var(--primary);color:#fff;border-color:var(--primary);">RESTAURAR</button>
          <button onclick="diarExcluirDefinitivo('${q.id}','${(q.label || '').replace(/'/g, '')}')" class="edr-btn-sm" style="color:var(--error);border-color:rgba(239,68,68,.3);">APAGAR</button>
        </div>
      </div>`;
    }).join('');

    document.body.insertAdjacentHTML('beforeend', `
    <div id="diar-modalLixeira" class="modal-overlay active">
      <div class="modal-box" style="max-width:500px;max-height:80vh;overflow-y:auto;">
        <div class="modal-header">
          <div class="modal-title"><span class="material-symbols-outlined" style="font-size:20px">delete</span> LIXEIRA</div>
          <button class="modal-close" onclick="document.getElementById('diar-modalLixeira')?.remove()">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
        ${lista}
      </div>
    </div>`);
  } catch (e) { showToast('Erro ao abrir lixeira: ' + e.message); }
}

async function diarRestaurarQuinzena(id) {
  try {
    await sbPatch('diarias_quinzenas', `?id=eq.${id}`, { excluida: false, excluida_em: null });
    document.getElementById('diar-modalLixeira')?.remove();
    await _diarCarregarQuinzenas();
    DiariasModule.quinzenaAtiva = DiariasModule.quinzenas.find(q => q.id === id) || DiariasModule.quinzenaAtiva;
    _diarAtualizarSelectQuinzena();
    await _diarCarregarRegistros();
    _diarRenderRegistros(); _diarRenderExtras();
    showToast('Quinzena restaurada com todos os dados!');
  } catch (e) { showToast('Erro ao restaurar: ' + e.message); }
}

async function diarExcluirDefinitivo(id, label) {
  // V2: modal de confirmacao com digitacao em vez de prompt() nativo
  const modalId = 'diar-confirmExcDef';
  document.body.insertAdjacentHTML('beforeend', `
  <div id="${modalId}" class="modal-overlay active">
    <div class="modal-box" style="max-width:400px">
      <div class="modal-header">
        <div class="modal-title" style="color:var(--error)">
          <span class="material-symbols-outlined">warning</span> EXCLUSAO DEFINITIVA
        </div>
      </div>
      <p style="font-size:13px;margin-bottom:12px;">Excluir definitivamente "<strong>${label}</strong>" e todos os registros?</p>
      <p style="font-size:12px;color:var(--text-tertiary);margin-bottom:12px;">Digite <strong>EXCLUIR</strong> para confirmar:</p>
      <input id="diar-confirmExcDefInput" style="padding:8px 10px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text-primary);font-family:inherit;font-size:12px;width:100%;box-sizing:border-box;" type="text" placeholder="EXCLUIR" style="margin-bottom:16px;">
      <div class="modal-footer">
        <button onclick="document.getElementById('${modalId}')?.remove()" class="btn btn-outline">CANCELAR</button>
        <button onclick="_diarConfirmarExcDefinitivo('${id}','${modalId}')" class="btn" style="background:rgba(239,68,68,.15);color:var(--error);border:1px solid rgba(239,68,68,.3);">CONFIRMAR</button>
      </div>
    </div>
  </div>`);
}

async function _diarConfirmarExcDefinitivo(id, modalId) {
  const input = document.getElementById('diar-confirmExcDefInput');
  if (!input || input.value.trim().toUpperCase() !== 'EXCLUIR') {
    showToast('Digite EXCLUIR para confirmar.');
    return;
  }
  try {
    await sbDelete('diarias', `?quinzena_id=eq.${id}`);
    await sbDelete('diarias_extras', `?quinzena_id=eq.${id}`);
    await sbDelete('diarias_quinzenas', `?id=eq.${id}`);
    document.getElementById(modalId)?.remove();
    document.getElementById('diar-modalLixeira')?.remove();
    showToast('Quinzena excluida definitivamente.');
  } catch (e) { showToast('Erro: ' + e.message); }
}

async function diarTrocarQuinzena(id) {
  DiariasModule.quinzenaAtiva = DiariasModule.quinzenas.find(q => q.id === id);
  const badge = document.getElementById('diar-quinzena-badge');
  if (badge && DiariasModule.quinzenaAtiva) badge.textContent = DiariasModule.quinzenaAtiva.label;
  await _diarCarregarRegistros();
  _diarRenderRegistros(); _diarRenderExtras();
}

async function _diarCarregarRegistros() {
  if (!DiariasModule.quinzenaAtiva) return;
  try {
    const [r1, r2] = await Promise.all([
      sbGet('diarias', `?quinzena_id=eq.${DiariasModule.quinzenaAtiva.id}&order=data.desc`),
      sbGet('diarias_extras', `?quinzena_id=eq.${DiariasModule.quinzenaAtiva.id}`)
    ]);
    DiariasModule.registros = Array.isArray(r1) ? r1 : [];
    DiariasModule.extras = Array.isArray(r2) ? r2 : [];
    // Normalizar periodos
    DiariasModule.registros = DiariasModule.registros.map(r => ({
      ...r,
      periodos: typeof r.periodos === 'string' ? JSON.parse(r.periodos || '[]') : (r.periodos || []),
      total_fracoes: Number(r.total_fracoes || 0),
      diaria_base: Number(r.diaria_base || 0),
      valor: Number(r.valor || 0)
    }));
  } catch (e) { DiariasModule.registros = []; DiariasModule.extras = []; }
}

function _diarGetRegistrosQuinzena() { return DiariasModule.registros; }
function _diarGetExtrasQuinzena() { return DiariasModule.extras; }

// ── Nova quinzena (modal) ──────────────────────
function diarAbrirModalNovaQuinzena() {
  if (usuarioAtual?.perfil === 'mestre') { showToast('Sem permissao para criar quinzena.'); return; }
  const hoje = hojeISO();
  document.body.insertAdjacentHTML('beforeend', `
  <div id="diar-modalNQ" class="modal-overlay active">
    <div class="modal-box" style="max-width:400px">
      <div class="modal-header">
        <div class="modal-title"><span class="material-symbols-outlined">add_circle</span> NOVA QUINZENA</div>
        <button class="modal-close" onclick="document.getElementById('diar-modalNQ').remove()">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>
      <div style="display:flex;flex-direction:column;gap:12px">
        <div>
          <label style="display:block;font-size:10px;font-weight:700;color:var(--text-tertiary);letter-spacing:1px;margin-bottom:4px;">NOME</label>
          <input id="nq-label" style="padding:8px 10px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text-primary);font-family:inherit;font-size:12px;width:100%;box-sizing:border-box;" type="text" placeholder="Ex: 2a QUINZENA · MARCO 2026">
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div>
            <label style="display:block;font-size:10px;font-weight:700;color:var(--text-tertiary);letter-spacing:1px;margin-bottom:4px;">DATA INICIO</label>
            <input id="nq-inicio" style="padding:8px 10px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text-primary);font-family:inherit;font-size:12px;width:100%;box-sizing:border-box;" type="date" value="${hoje}" onchange="diarSugerirLabelNQ()">
          </div>
          <div>
            <label style="display:block;font-size:10px;font-weight:700;color:var(--text-tertiary);letter-spacing:1px;margin-bottom:4px;">DATA FIM</label>
            <input id="nq-fim" style="padding:8px 10px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text-primary);font-family:inherit;font-size:12px;width:100%;box-sizing:border-box;" type="date" value="${hoje}">
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button onclick="document.getElementById('diar-modalNQ').remove()" class="btn btn-outline">CANCELAR</button>
        <button onclick="diarSalvarNovaQuinzena()" class="btn btn-primary" style="flex:2">CRIAR</button>
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
  if (usuarioAtual?.perfil === 'mestre') { showToast('Sem permissao.'); return; }
  const label = (document.getElementById('nq-label')?.value || '').trim();
  const inicio = document.getElementById('nq-inicio')?.value;
  const fim = document.getElementById('nq-fim')?.value;
  if (!label || !inicio || !fim) { showToast('Preencha todos os campos.'); return; }
  if (inicio > fim) { showToast('Data inicio nao pode ser maior que data fim.'); return; }
  if (!_companyId) { showToast('Erro: empresa nao carregada.'); return; }

  const jaExiste = DiariasModule.quinzenas.find(q => {
    const labelIgual = q.label.trim().toLowerCase() === label.toLowerCase();
    const sobreposicao = q.data_inicio <= fim && q.data_fim >= inicio;
    return labelIgual || sobreposicao;
  });
  if (jaExiste) { showToast('Ja existe uma quinzena com esse periodo: ' + jaExiste.label); return; }

  try {
    const result = await sbPost('diarias_quinzenas', { label, data_inicio: inicio, data_fim: fim, fechada: false });
    const nova = Array.isArray(result) ? result[0] : result;
    if (!nova?.id) { showToast('Resposta invalida do servidor.'); return; }
    document.getElementById('diar-modalNQ')?.remove();
    DiariasModule.quinzenas.unshift(nova);
    DiariasModule.quinzenaAtiva = nova;
    _diarAtualizarSelectQuinzena();
    await _diarCarregarRegistros();
    _diarRenderRegistros(); _diarRenderExtras();
    showToast('Quinzena criada!');
  } catch (e) { showToast('Nao foi possivel criar a quinzena: ' + e.message); }
}

// ── Editar label da quinzena ──────────────────
function diarEditarLabelQuinzena() {
  if (!DiariasModule.quinzenaAtiva) { showToast('Selecione uma quinzena.'); return; }
  // V2: modal em vez de prompt() nativo
  const labelAtual = DiariasModule.quinzenaAtiva.label;
  document.body.insertAdjacentHTML('beforeend', `
  <div id="diar-modalEditLabel" class="modal-overlay active">
    <div class="modal-box" style="max-width:380px">
      <div class="modal-header">
        <div class="modal-title">Editar Quinzena</div>
        <button class="modal-close" onclick="document.getElementById('diar-modalEditLabel')?.remove()">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>
      <label style="display:block;font-size:10px;font-weight:700;color:var(--text-tertiary);letter-spacing:1px;margin-bottom:4px;">DESCRICAO</label>
      <input id="diar-editLabelInput" style="padding:8px 10px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text-primary);font-family:inherit;font-size:12px;width:100%;box-sizing:border-box;" type="text" value="${esc(labelAtual)}">
      <div class="modal-footer">
        <button onclick="document.getElementById('diar-modalEditLabel')?.remove()" class="btn btn-outline">CANCELAR</button>
        <button onclick="_diarSalvarEditLabel()" class="btn btn-primary">SALVAR</button>
      </div>
    </div>
  </div>`);
}

async function _diarSalvarEditLabel() {
  const novoLabel = (document.getElementById('diar-editLabelInput')?.value || '').trim();
  if (!novoLabel || novoLabel === DiariasModule.quinzenaAtiva.label) {
    document.getElementById('diar-modalEditLabel')?.remove();
    return;
  }
  try {
    await sbPatch('diarias_quinzenas', '?id=eq.' + DiariasModule.quinzenaAtiva.id, { label: novoLabel });
    DiariasModule.quinzenaAtiva.label = novoLabel;
    const q = DiariasModule.quinzenas.find(x => x.id === DiariasModule.quinzenaAtiva.id);
    if (q) q.label = novoLabel;
    _diarAtualizarSelectQuinzena();
    document.getElementById('diar-modalEditLabel')?.remove();
    showToast('Descricao atualizada!');
  } catch (e) { showToast('Nao foi possivel editar: ' + e.message); }
}


// ══════════════════════════════════════════════════════════════════
// VOZ — Speech Recognition (Web Speech API)
// ══════════════════════════════════════════════════════════════════
function diarToggleVoz() {
  if (DiariasModule._vozAtivo) { _diarPararVoz(); return; }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) { showToast('Seu navegador nao suporta reconhecimento de voz. Use o Chrome.'); return; }

  const rec = new SpeechRecognition();
  rec.lang = 'pt-BR';
  rec.continuous = true;
  rec.interimResults = true;

  const textarea = document.getElementById('diar-msgInput');
  const textoAntes = textarea.value;

  rec.onstart = function () {
    DiariasModule._vozAtivo = true;
    const btn = document.getElementById('diar-btnMic');
    if (btn) { btn.classList.add('recording'); }
    const status = document.getElementById('diar-vozStatus');
    if (status) status.style.display = '';
  };

  rec.onresult = function (e) {
    let final = '', interim = '';
    for (let i = 0; i < e.results.length; i++) {
      if (e.results[i].isFinal) final += e.results[i][0].transcript + '\n';
      else interim = e.results[i][0].transcript;
    }
    const sep = textoAntes && !textoAntes.endsWith('\n') ? '\n' : '';
    textarea.value = textoAntes + sep + final + interim;
  };

  rec.onerror = function (e) {
    if (e.error === 'not-allowed') showToast('Permissao de microfone negada.');
    else if (e.error !== 'aborted') showToast('Erro de voz: ' + e.error);
    _diarPararVoz();
  };

  rec.onend = function () { _diarPararVoz(); };

  try { rec.start(); DiariasModule._recognition = rec; }
  catch (e) { showToast('Erro ao iniciar microfone.'); }
}

function _diarPararVoz() {
  DiariasModule._vozAtivo = false;
  if (DiariasModule._recognition) {
    try { DiariasModule._recognition.stop(); } catch (e) { }
    DiariasModule._recognition = null;
  }
  const btn = document.getElementById('diar-btnMic');
  if (btn) btn.classList.remove('recording');
  const status = document.getElementById('diar-vozStatus');
  if (status) status.style.display = 'none';
  const textarea = document.getElementById('diar-msgInput');
  if (textarea && textarea.value.trim()) showToast('Voz capturada! Clique em INTERPRETAR.');
}


// ══════════════════════════════════════════════════════════════════
// FORMULARIO MANUAL
// ══════════════════════════════════════════════════════════════════
function diarToggleFormManual() {
  const form = document.getElementById('diar-formManual');
  if (!form) return;
  const visivel = window.getComputedStyle(form).display !== 'none';
  form.style.display = visivel ? 'none' : 'block';
  if (!visivel) _diarPopularFormManual();
}

function _diarPopularFormManual() {
  const selFunc = document.getElementById('diar-manual-func');
  const selObra = document.getElementById('diar-manual-obra');
  if (!selFunc || !selObra) return;
  const funcsAtivos = _diarGetFuncionariosAtivos();
  selFunc.innerHTML = '<option value="">Selecione o funcionario...</option>' +
    funcsAtivos.map(f => '<option value="' + esc(f.nome) + '">' + esc(f.nome) + ' (' + esc(f.cargo) + ')</option>').join('');
  selObra.innerHTML = '<option value="">Selecione a obra...</option>' +
    obras.map(o => '<option value="' + esc(o.nome) + '">' + esc(o.nome) + '</option>').join('');
}

function adicionarDiariaManual() {
  const funcNome = document.getElementById('diar-manual-func')?.value || '';
  const obraNome = document.getElementById('diar-manual-obra')?.value || '';
  const turno = document.getElementById('diar-manual-turno')?.value || 'dia';
  const data = document.getElementById('diar-dataInput')?.value || '';
  if (!funcNome) { showToast('Selecione o funcionario.'); return; }
  if (!obraNome) { showToast('Selecione a obra.'); return; }
  if (!data) { showToast('Selecione a data.'); return; }

  const funcEntry = DiariasModule.funcionarios[funcNome.toLowerCase()];
  if (!funcEntry) { showToast('Funcionario nao encontrado.'); return; }

  const fracao = turno === 'dia' ? 1 : 0.5;
  const valor = funcEntry.diaria * fracao;
  const periodos = [{ obra: obraNome, turno, fracao }];

  const reg = {
    nome: funcEntry.nome, funcionario: funcEntry.nome, cargo: funcEntry.cargo,
    diaria_base: funcEntry.diaria, total_fracoes: fracao, valor, periodos
  };

  if (!DiariasModule.interpretado) {
    DiariasModule.interpretado = { data, registros: [reg] };
  } else {
    const existente = DiariasModule.interpretado.registros.find(r => r.nome === reg.nome);
    if (existente) {
      existente.periodos.push(...periodos);
      existente.total_fracoes += fracao;
      existente.valor += valor;
    } else {
      DiariasModule.interpretado.registros.push(reg);
    }
    DiariasModule.interpretado.data = data;
  }

  _diarRenderPreview(DiariasModule.interpretado.registros);
  const btnConf = document.getElementById('diar-btnConfirmar');
  if (btnConf) btnConf.disabled = false;
  showToast(funcEntry.nome + ' adicionado (' + (turno === 'dia' ? 'dia inteiro' : turno) + ' em ' + obraNome + ')');
  document.getElementById('diar-manual-func').value = '';
  document.getElementById('diar-manual-obra').value = '';
  document.getElementById('diar-manual-turno').value = 'dia';
}


// ══════════════════════════════════════════════════════════════════
// INTERPRETACAO LOCAL (regex, sem API)
// ══════════════════════════════════════════════════════════════════
function diarInterpretar() {
  const msg = document.getElementById('diar-msgInput').value.trim();
  const data = document.getElementById('diar-dataInput').value;
  if (!msg) { showToast('Cole uma mensagem primeiro.'); return; }
  if (!data) { showToast('Selecione a data.'); return; }

  try {
    const regs = diarParseMensagem(msg);
    if (!regs.length) {
      document.getElementById('diar-previewBox').innerHTML =
        '<div class="edr-empty"><span class="material-symbols-outlined" style="font-size:32px;opacity:.4;">search_off</span><p>Nenhum funcionario identificado. Verifique a mensagem.</p></div>';
      const btnConf = document.getElementById('diar-btnConfirmar');
      if (btnConf) btnConf.disabled = true;
      return;
    }
    DiariasModule.interpretado = { data, registros: regs };
    _diarRenderPreview(regs);
    const btnConf = document.getElementById('diar-btnConfirmar');
    if (btnConf) btnConf.disabled = false;
    if (regs._naoReconhecidos && regs._naoReconhecidos.length) {
      showToast('Nomes nao reconhecidos: ' + regs._naoReconhecidos.join(', ') + ' — cadastre em Funcionarios');
    }
  } catch (err) {
    document.getElementById('diar-previewBox').innerHTML =
      '<div class="edr-empty"><span class="material-symbols-outlined" style="font-size:32px;opacity:.4;">error</span><p>Erro ao interpretar. Verifique a mensagem.</p></div>';
    console.error(err);
  }
}


// ══════════════════════════════════════════════════════════════════
// PARSER LOCAL DE MENSAGENS
// *** PRESERVADO INTACTO do V1 — logica de regex nao foi alterada ***
// *** Unica mudanca: referencia DiariasModule.funcionarios em vez de DIAR_FUNCIONARIOS ***
// ══════════════════════════════════════════════════════════════════
function diarParseMensagem(msgOriginal) {
  const normTxt = s => s.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\bi\b/g, 'e');

  const msg = normTxt(msgOriginal);

  const MATERIAIS = ['cimento', 'argamassa', 'areia', 'brita', 'tijolo', 'ferro', 'vergalhao',
    'madeira', 'prego', 'parafuso', 'tinta', 'cal', 'saco', 'sacos', 'bloco', 'telha'];

  const detectarTurno = (texto) => {
    if (/dia\s+inteiro|o dia (todo|inteiro)/.test(texto)) return 'dia';
    if (/ate meio.?dia|ate o meio.?dia|manha|de manha/.test(texto)) return 'manha';
    if (/a ?tarde|atarde|de tarde|tarde/.test(texto)) return 'tarde';
    if (/meio.?dia/.test(texto)) return 'manha';
    return 'dia';
  };

  const obrasNomes = obras.map(o => ({ original: o.nome, norm: normTxt(o.nome) }));

  // Aliases de obras — dinamicos a partir das obras cadastradas
  const OBRAS_ALIASES = {};
  obras.forEach(o => {
    const nomeNorm = normTxt(o.nome).toLowerCase();
    const nomeOriginal = o.nome.toLowerCase();
    if (!OBRAS_ALIASES[nomeOriginal]) OBRAS_ALIASES[nomeOriginal] = [];
    if (nomeNorm !== nomeOriginal && !OBRAS_ALIASES[nomeOriginal].includes(nomeNorm)) {
      OBRAS_ALIASES[nomeOriginal].push(nomeNorm);
    }
    const primeiraPalavra = nomeOriginal.split(' ')[0];
    if (primeiraPalavra.length >= 3 && !OBRAS_ALIASES[nomeOriginal].includes(primeiraPalavra)) {
      OBRAS_ALIASES[nomeOriginal].push(primeiraPalavra);
    }
    const primeiraSemAcento = normTxt(primeiraPalavra);
    if (primeiraSemAcento !== primeiraPalavra && !OBRAS_ALIASES[nomeOriginal].includes(primeiraSemAcento)) {
      OBRAS_ALIASES[nomeOriginal].push(primeiraSemAcento);
    }
    if (!OBRAS_ALIASES[nomeOriginal].includes(nomeOriginal)) {
      OBRAS_ALIASES[nomeOriginal].push(nomeOriginal);
    }
  });

  const _matchPalavra = (texto, palavra) => {
    const escaped = palavra.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp('(?:^|[\\s,.;:!?/(\\[])' + escaped + '(?=[\\s,.;:!?/)\\]]|$)').test(texto);
  };

  const resolverAliasObra = (trecho) => {
    const t = trecho.toLowerCase().trim();
    for (const [nomeObra, aliases] of Object.entries(OBRAS_ALIASES)) {
      for (const alias of aliases) {
        if (_matchPalavra(t, alias)) {
          const obraReal = obras.find(o => normTxt(o.nome) === normTxt(nomeObra));
          if (obraReal) return obraReal.nome;
        }
      }
    }
    return null;
  };

  const extrairObra = (trecho) => {
    const aliasMatch = resolverAliasObra(trecho);
    if (aliasMatch) return aliasMatch;
    for (const o of obrasNomes) {
      const primeiroNome = o.norm.split(' ')[0];
      if (primeiroNome.length >= 4 && _matchPalavra(trecho, primeiroNome)) return o.original;
    }
    const m = trecho.match(/cas[ao]\s+d[eio]\s+([a-záéíóúãõâêôàü\s]+?)(?:\s+\d|\s*$)/i)
      || trecho.match(/obra\s+([a-záéíóúãõâêôàü]+)/i);
    if (!m) return null;
    const palavra = m[1].trim();
    if (MATERIAIS.includes(normTxt(palavra))) return null;
    if (['a', 'o', 'e', 'de', 'da', 'do', 'na', 'no', 'um', 'uma'].includes(normTxt(palavra))) return null;
    return palavra.charAt(0).toUpperCase() + palavra.slice(1).toLowerCase();
  };

  // ALIAS_PATTERNS dinamicamente a partir de DiariasModule.funcionarios
  const ALIAS_PATTERNS = [];
  const _aliasEspeciais = [
    { re: /seu\s+nego|rochedo/, key: 'seu nego' },
    { re: /bin\s+lad[ea]m?|binlad[ea]m?/, key: 'binlade' },
    { re: /zez[aã]o/, key: 'zezao' },
  ];
  _aliasEspeciais.forEach(a => { if (DiariasModule.funcionarios[a.key]) ALIAS_PATTERNS.push(a); });
  Object.keys(DiariasModule.funcionarios).forEach(key => {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = key.length <= 3 ? new RegExp(`\\b${escaped}\\b`) : new RegExp(escaped);
    ALIAS_PATTERNS.push({ re, key });
  });

  const encontrarFuncionarios = (texto) => {
    const encontrados = [];
    for (const { re, key } of ALIAS_PATTERNS) {
      if (re.test(texto)) {
        const func = DiariasModule.funcionarios[key];
        if (func && !encontrados.find(f => f.nome === func.nome)) {
          encontrados.push({ ...func });
        }
      }
    }
    return encontrados;
  };

  const splitPorTurno = (bloco) => {
    const marcado = bloco
      .replace(/\b(e|i)\s+(ate meio.?dia|de manha|a ?tarde|atarde|de tarde|meio.?dia)/g, '|$2')
      .replace(/\b(e|i)\s+(manha)\b/g, '|$2')
      .replace(/,\s*(meio.?dia|manha|de manha|tarde|atarde|a ?tarde|de tarde|ate meio.?dia)/gi, '|$1')
      .replace(/\b(a ?tarde|de tarde)\s+(na\s+)?casa/g, '|$1 casa')
      .replace(/((?:em|na)\s+\w+)\s+(meio.?dia\s+(?:em|na)\s)/g, '$1|$2')
      .replace(/(casa\s+d[eio]\s+\w+)\s+(meio.?dia\s+(?:em|na|casa)\s)/g, '$1|$2');
    const partes = marcado.split('|').map(s => s.trim()).filter(Boolean);
    return partes.length > 1 ? partes : [bloco];
  };

  let msgPrep = msg;
  const _funcNomes = [...new Set(Object.values(DiariasModule.funcionarios).map(f => normTxt(f.nome)))];
  _funcNomes.sort((a, b) => b.length - a.length);
  const _skipWords = new Set(['e', 'i', 'de', 'da', 'do', 'di', 'na', 'no', 'em', 'casa', 'obra', 'seu']);
  _funcNomes.forEach(nome => {
    if (nome.length < 3) return;
    const escaped = nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    msgPrep = msgPrep.replace(new RegExp('(\\b\\w+)\\s+(' + escaped + '\\b)', 'g'), (match, antes, n) => {
      if (_skipWords.has(antes)) return match;
      return antes + '\n' + n;
    });
  });

  const brutos = msgPrep.split(/[.\r\n]+/).map(s => s.trim()).filter(Boolean);
  const blocos = brutos.flatMap(b => splitPorTurno(b));

  const resultMap = {};

  const addPeriodo = (func, turno, obra) => {
    if (!resultMap[func.nome]) {
      resultMap[func.nome] = {
        funcionario: func.nome, cargo: func.cargo, diaria_base: func.diaria,
        periodos: [], total_fracoes: 0
      };
    }
    if (turno === 'manha' && resultMap[func.nome].periodos.find(p => p.turno === 'manha')) turno = 'tarde';
    const already = resultMap[func.nome].periodos.find(p => p.turno === turno && p.obra === obra);
    if (already) return;
    const fracao = (turno === 'dia') ? 1.0 : 0.5;
    resultMap[func.nome].periodos.push({ turno, obra, fracao });
    resultMap[func.nome].total_fracoes += fracao;
  };

  let ultimosFuncs = [];
  for (const bloco of blocos) {
    if (!bloco) continue;
    const turno = detectarTurno(bloco);
    const obra = extrairObra(bloco) || 'Nao especificada';
    const funcs = encontrarFuncionarios(bloco);
    if (funcs.length) {
      ultimosFuncs = funcs;
      if (obra !== 'Nao especificada' || blocos.length === 1) {
        funcs.forEach(f => addPeriodo(f, turno, obra));
      }
    } else if (obra !== 'Nao especificada' && ultimosFuncs.length) {
      ultimosFuncs.forEach(f => addPeriodo(f, turno, obra));
    }
  }

  if (!Object.keys(resultMap).length) {
    const turno = detectarTurno(msg);
    const obra = extrairObra(msg) || 'Nao especificada';
    const funcs = encontrarFuncionarios(msg);
    funcs.forEach(f => addPeriodo(f, turno, obra));
  }

  // Detectar nomes nao reconhecidos
  const nomesConhecidos = Object.keys(DiariasModule.funcionarios);
  const nomesObras = new Set();
  obrasNomes.forEach(o => {
    o.norm.split(/\s+/).forEach(p => { if (p.length >= 3) nomesObras.add(p); });
    nomesObras.add(o.norm);
  });
  Object.entries(OBRAS_ALIASES).forEach(([nome, aliases]) => {
    nome.split(/\s+/).forEach(p => { if (p.length >= 3) nomesObras.add(p); });
    aliases.forEach(a => nomesObras.add(a));
  });
  const palavras = msgOriginal.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[\s,.!?;:]+/).filter(p => p.length >= 3);
  const IGNORAR = ['casa', 'obra', 'ate', 'meio', 'dia', 'manha', 'tarde', 'todo', 'cimento', 'argamassa', 'areia', 'brita', 'tijolo', 'ferro', 'madeira', 'prego', 'tinta', 'cal', 'saco', 'sacos', 'bloco', 'telha', 'vergalhao', 'pra', 'para', 'com', 'que', 'foi', 'uma', 'uns', 'umas', 'mais', 'tambem', 'ainda', 'hoje', 'ontem', 'esta', 'esse', 'essa', 'nao', 'sim', 'bem', 'bom', 'boa', 'muito', 'pouco', 'todo', 'toda', 'todos', 'todas', 'aqui', 'ali', 'tem', 'vai', 'vem', 'dia', 'mes', 'ano'];
  const naoReconhecidos = [];
  palavras.forEach(p => {
    if (IGNORAR.includes(p)) return;
    if (nomesConhecidos.includes(p)) return;
    if (nomesObras.has(p)) return;
    const idx = msgOriginal.toLowerCase().indexOf(p);
    if (idx >= 0) {
      const charOriginal = msgOriginal[idx];
      if (charOriginal === charOriginal.toUpperCase() && charOriginal !== charOriginal.toLowerCase()) {
        if (!naoReconhecidos.includes(p) && !Object.values(resultMap).find(r => r.funcionario.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(p))) {
          naoReconhecidos.push(p);
        }
      }
    }
  });

  const resultado = Object.values(resultMap);
  resultado._naoReconhecidos = naoReconhecidos;
  return resultado;
}


// ══════════════════════════════════════════════════════════════════
// PREVIEW E SALVAR
// ══════════════════════════════════════════════════════════════════
function _diarRenderPreview(regs) {
  const box = document.getElementById('diar-previewBox');
  if (!regs || !regs.length) {
    box.innerHTML = '<div class="edr-empty"><p>Nenhum funcionario identificado</p></div>';
    return;
  }
  const isMestre = usuarioAtual?.perfil === 'mestre';
  box.innerHTML = regs.map(r => {
    const valor = (r.diaria_base * r.total_fracoes).toFixed(2);
    const periodos = r.periodos.map(p => {
      const cls = p.turno === 'manha' ? 'diar-turno-manha' : p.turno === 'tarde' ? 'diar-turno-tarde' : 'diar-turno-dia';
      const label = p.turno === 'manha' ? 'MANHA' : p.turno === 'tarde' ? 'TARDE' : 'DIA TODO';
      return `<span class="diar-turno-tag ${cls}">${label}</span><span style="color:var(--text-tertiary);" style="font-size:10px">${p.obra}</span>`;
    }).join(' · ');
    return `<div class="diar-func-card">
      <div class="diar-func-avatar">${r.funcionario[0]}</div>
      <div class="diar-func-info">
        <div class="diar-func-nome">${r.funcionario} <span style="color:var(--text-tertiary);" style="font-size:10px;font-weight:400">${r.cargo || ''}</span></div>
        <div style="margin-top:3px">${periodos}</div>
      </div>
      ${isMestre ? '' : `<div class="diar-func-val">R$ ${Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>`}
    </div>`;
  }).join('');
}

async function diarConfirmarLancamento() {
  if (!DiariasModule.interpretado) return;
  if (!DiariasModule.quinzenaAtiva) { showToast('Nenhuma quinzena ativa. Crie uma quinzena primeiro.'); return; }
  if (!DiariasModule._funcionariosCarregados) { showToast('Sem conexao com o banco. Valores de diaria podem estar desatualizados.', 5000); return; }

  const btn = document.getElementById('diar-btnConfirmar');
  if (btn) { btn.disabled = true; btn.textContent = 'SALVANDO...'; }

  try {
    // Remover registros do mesmo dia em paralelo
    const existentes = DiariasModule.registros.filter(r => r.data === DiariasModule.interpretado.data);
    if (existentes.length) await Promise.all(existentes.map(r => sbDelete('diarias', `?id=eq.${r.id}`)));

    const novos = DiariasModule.interpretado.registros.map(r => ({
      quinzena_id: DiariasModule.quinzenaAtiva.id,
      data: DiariasModule.interpretado.data,
      funcionario: r.funcionario, cargo: r.cargo || '',
      diaria_base: r.diaria_base, periodos: r.periodos,
      total_fracoes: r.total_fracoes, valor: r.diaria_base * r.total_fracoes,
      criado_por: usuarioAtual?.nome || ''
    }));
    await sbPostMinimal('diarias', novos);
    DiariasModule.interpretado = null;
    document.getElementById('diar-msgInput').value = '';
    document.getElementById('diar-previewBox').innerHTML =
      '<div class="edr-empty"><span class="material-symbols-outlined" style="font-size:32px;opacity:.3;">chat</span><p>Cole uma mensagem e clique em interpretar</p></div>';
    await _diarCarregarRegistros();
    _diarRenderRegistros();
    _diarRenderFolha();
    showToast('Diarias salvas!');
    // _diarAutoLancarPL desativado — criava duplicatas de custo. Usar botão "Lançar FP" na folha.
  } catch (e) { showToast('Erro: ' + (e.message || JSON.stringify(e))); }
  if (btn) { btn.disabled = false; btn.textContent = 'CONFIRMAR E SALVAR'; }
}

// Lançamento automático na tabela lancamentos após confirmar diárias
// IMPORTANTE: usa upsert por obra_id+data+obs para evitar duplicatas quando Anderson salva parcialmente
async function _diarAutoLancarPL(novos) {
  const obrasMap = await _diarBuscarObras();
  if (!obrasMap) return;
  const porObra = {};
  novos.forEach(r => {
    const periodos = Array.isArray(r.periodos) ? r.periodos : [];
    periodos.forEach(p => {
      const chave = _diarNormStr(p.obra || '');
      if (!porObra[chave]) porObra[chave] = { valor: 0, nome: p.obra };
      porObra[chave].valor += r.diaria_base * (p.fracao || 0);
    });
  });
  const data = novos[0]?.data || hojeISO();
  const obs = 'Diaria · ' + data + ' · ' + (DiariasModule.quinzenaAtiva?.label || 'Quinzena');
  for (const [chave, { valor }] of Object.entries(porObra)) {
    const obraId = obrasMap[chave];
    if (!obraId || valor <= 0) continue;
    try {
      // Verificar se já existe lançamento de diária para essa obra/data/quinzena
      const existente = await sbGet('lancamentos',
        `?obra_id=eq.${obraId}&data=eq.${data}&obs=eq.${encodeURIComponent(obs)}&etapa=eq.28_mao&select=id`);
      if (Array.isArray(existente) && existente.length > 0) {
        // Atualizar valor existente em vez de criar duplicata
        await sbPatch('lancamentos',
          `?id=eq.${existente[0].id}`,
          { preco: valor, total: valor, descricao: '000460 \u00b7 MAO DE OBRA' });
      } else {
        await sbPostMinimal('lancamentos', {
          obra_id: obraId, descricao: '000460 \u00b7 MAO DE OBRA', qtd: 1,
          preco: valor, total: valor, data, obs, etapa: '28_mao'
        });
      }
    } catch(e) { console.warn('[DIAR] auto-lancar PL:', e); }
  }
}

function _diarNormStr(s) {
  return (s || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
}


// ══════════════════════════════════════════════════════════════════
// RENDER REGISTROS (por dia)
// ══════════════════════════════════════════════════════════════════
function _diarRenderRegistros() {
  const container = document.getElementById('diar-registrosContainer');
  if (!container) return;
  const regs = _diarGetRegistrosQuinzena();
  if (!regs.length) {
    container.innerHTML = '<div class="edr-empty"><span class="material-symbols-outlined" style="font-size:48px;opacity:.3;">event_note</span><p>Nenhum registro nesta quinzena</p></div>';
    return;
  }
  const porDia = {};
  regs.forEach(r => { if (!porDia[r.data]) porDia[r.data] = []; porDia[r.data].push(r); });
  const dias = Object.keys(porDia).sort().reverse();
  const isAdmin = usuarioAtual?.perfil === 'admin' || (typeof _isSuperAdmin !== 'undefined' && _isSuperAdmin);

  container.innerHTML = dias.map(dia => {
    const items = porDia[dia];
    const diaDate = new Date(dia + 'T12:00:00');
    const diaDow = diaDate.getDay();
    const diaFds = diaDow === 0 || diaDow === 6;
    const df = diaDate.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }).toUpperCase();
    const rows = items.map(r => {
      const periodos = typeof r.periodos === 'string' ? JSON.parse(r.periodos || '[]') : (r.periodos || []);
      const obrasTexto = periodos.map(p => {
        const icon = p.turno === 'manha' ? 'wb_sunny' : p.turno === 'tarde' ? 'wb_twilight' : 'calendar_today';
        return `<span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle">${icon}</span> ${p.obra}`;
      }).join(' · ');
      const btnEdit = isAdmin ? `<button onclick="event.stopPropagation();diarEditarRegistro('${r.id}')" class="edr-btn-icon" title="Editar"><span class="material-symbols-outlined" style="font-size:16px">edit</span></button>` : '';
      return `<div class="diar-registro-row">
        <div class="diar-rr-nome">${r.funcionario}</div>
        <div class="diar-rr-obras">${obrasTexto}</div>
        <div class="diar-rr-val">R$ ${r.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} ${btnEdit}</div>
      </div>`;
    }).join('');

    const faltas = _diarGetFaltasDia(dia, items);
    const faltasHtml = faltas.length
      ? `<div class="diar-faltas-banner">
           <span class="material-symbols-outlined" style="font-size:14px;color:var(--error)">warning</span>
           <span style="font-size:11px;font-weight:700;color:var(--error)">FALTOU: </span>
           <span style="font-size:11px;color:var(--error)">${faltas.join(', ')}</span>
         </div>` : '';

    const isFirst = dia === dias[0];
    const badgeDia = diaFds
      ? `<span class="edr-badge" style="background:rgba(59,130,246,0.12);color:#3b82f6;">${items.length} extra(s)</span>`
      : (faltas.length ? `<span class="edr-badge edr-badge-error">${faltas.length} falta(s)</span>` : '');

    return `<div class="diar-registro-dia">
      <div class="diar-registro-header" onclick="diarToggleDia(this)">
        <div style="display:flex;align-items:center;gap:8px">
          <span class="material-symbols-outlined diar-chevron" style="font-size:16px;transition:transform .2s;${isFirst ? 'transform:rotate(90deg)' : ''}">${isFirst ? 'expand_more' : 'chevron_right'}</span>
          <span class="diar-registro-data">${df}</span>
          ${!diaFds ? `<span class="diar-registro-count">${items.length} func.</span>` : ''}
          ${badgeDia}
        </div>
        <div style="display:flex;gap:4px;">
          ${isAdmin ? `<button class="edr-btn-sm edr-btn-success-outline" onclick="event.stopPropagation();diarAdicionarNoDia('${dia}')">+ ADD</button>` : ''}
          <button class="edr-btn-icon" onclick="event.stopPropagation();diarDeletarDia('${dia}')" title="Remover dia"><span class="material-symbols-outlined" style="font-size:16px">close</span></button>
        </div>
      </div>
      <div class="diar-dia-body" style="${isFirst ? '' : 'display:none;'}">${rows}${faltasHtml}</div>
    </div>`;
  }).join('');

  _diarRenderFolha();
}

function diarToggleDia(headerEl) {
  const body = headerEl.nextElementSibling;
  const chevron = headerEl.querySelector('.diar-chevron');
  if (body.style.display === 'none') {
    body.style.display = '';
    if (chevron) { chevron.style.transform = 'rotate(90deg)'; chevron.textContent = 'expand_more'; }
  } else {
    body.style.display = 'none';
    if (chevron) { chevron.style.transform = ''; chevron.textContent = 'chevron_right'; }
  }
}


// ── Editar registro individual (admin) ──────────────
function diarEditarRegistro(regId) {
  const reg = DiariasModule.registros.find(r => r.id === regId);
  if (!reg) return;
  const periodos = typeof reg.periodos === 'string' ? JSON.parse(reg.periodos || '[]') : (reg.periodos || []);
  const obrasOpts = obras.map(o => `<option value="${esc(o.nome)}">${o.nome}</option>`).join('');

  let periodosHtml = periodos.map((p, i) => {
    return `<div style="display:flex;gap:8px;margin-bottom:8px;align-items:center;" data-idx="${i}">
      <select class="ed-turno" style="flex:1;padding:7px 8px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text-primary);font-family:inherit;font-size:12px;">
        <option value="dia" ${p.turno === 'dia' ? 'selected' : ''}>Dia inteiro (1.0)</option>
        <option value="manha" ${p.turno === 'manha' ? 'selected' : ''}>Manha (0.5)</option>
        <option value="tarde" ${p.turno === 'tarde' ? 'selected' : ''}>Tarde (0.5)</option>
      </select>
      <select class="ed-obra" style="flex:1;padding:7px 8px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text-primary);font-family:inherit;font-size:12px;">
        <option value="Nao especificada">Nao especificada</option>
        ${obrasOpts}
      </select>
      <button onclick="this.parentElement.remove()" class="edr-btn-icon" style="color:var(--error)"><span class="material-symbols-outlined">close</span></button>
    </div>`;
  }).join('');

  document.body.insertAdjacentHTML('beforeend', `
  <div id="diar-modalEdit" class="modal-overlay active">
    <div class="modal-box" style="max-width:420px">
      <div class="modal-header">
        <div class="modal-title">EDITAR DIARIA</div>
        <button class="modal-close" onclick="document.getElementById('diar-modalEdit')?.remove()">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>
      <div style="margin-bottom:12px;">
        <span style="font-size:13px;font-weight:700;">${esc(reg.funcionario)}</span>
        <span style="color:var(--text-tertiary);" style="font-size:11px;margin-left:8px;">${reg.data} · R$ ${reg.diaria_base}/dia</span>
      </div>
      <div style="display:block;font-size:10px;font-weight:700;color:var(--text-tertiary);letter-spacing:1px;margin-bottom:4px;" style="margin-bottom:6px;">PERIODOS</div>
      <div id="ed-periodos">${periodosHtml}</div>
      <button onclick="diarEditAddPeriodo()" class="btn btn-ghost" style="width:100%;margin-bottom:16px;">+ Adicionar periodo</button>
      <div class="modal-footer">
        <button onclick="document.getElementById('diar-modalEdit')?.remove()" class="btn btn-outline">CANCELAR</button>
        <button onclick="diarSalvarEdicao('${regId}')" class="btn btn-primary" style="flex:2">SALVAR</button>
        <button onclick="diarExcluirRegistro('${regId}')" class="btn" style="background:rgba(239,68,68,.15);color:var(--error);border:1px solid rgba(239,68,68,.3);">EXCLUIR</button>
      </div>
    </div>
  </div>`);

  setTimeout(() => {
    const modal = document.getElementById('diar-modalEdit');
    if (!modal) return;
    const selects = modal.querySelectorAll('.ed-obra');
    periodos.forEach((p, i) => { if (selects[i]) selects[i].value = p.obra || 'Nao especificada'; });
  }, 10);
}

function diarEditAddPeriodo() {
  const container = document.getElementById('ed-periodos');
  if (!container) return;
  const obrasOpts = obras.map(o => `<option value="${esc(o.nome)}">${o.nome}</option>`).join('');
  container.insertAdjacentHTML('beforeend', `
    <div style="display:flex;gap:8px;margin-bottom:8px;align-items:center;">
      <select class="ed-turno" style="flex:1;padding:7px 8px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text-primary);font-family:inherit;font-size:12px;">
        <option value="dia">Dia inteiro (1.0)</option>
        <option value="manha">Manha (0.5)</option>
        <option value="tarde">Tarde (0.5)</option>
      </select>
      <select class="ed-obra" style="flex:1;padding:7px 8px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text-primary);font-family:inherit;font-size:12px;">
        <option value="Nao especificada">Nao especificada</option>
        ${obrasOpts}
      </select>
      <button onclick="this.parentElement.remove()" class="edr-btn-icon" style="color:var(--error)"><span class="material-symbols-outlined">close</span></button>
    </div>`);
}

async function diarSalvarEdicao(regId) {
  const modal = document.getElementById('diar-modalEdit');
  if (!modal) return;
  const reg = DiariasModule.registros.find(r => r.id === regId);
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
      periodos, total_fracoes: totalFracoes, valor: reg.diaria_base * totalFracoes
    });
    modal.remove();
    await _diarCarregarRegistros();
    _diarRenderRegistros();
    showToast('Diaria atualizada!');
  } catch (e) { showToast('Erro ao salvar: ' + e.message); }
}

// ── Adicionar funcionario avulso num dia ja lancado ──
function diarAdicionarNoDia(data) {
  const regs = DiariasModule.registros.filter(r => r.data === data && r.quinzena_id === DiariasModule.quinzenaAtiva?.id);
  const jaLancados = regs.map(r => r.funcionario);
  const ativos = _diarGetFuncionariosAtivos().filter(f => !jaLancados.includes(f.nome));
  const obrasOpts = obras.map(o => `<option value="${esc(o.nome)}">${o.nome}</option>`).join('');
  if (!ativos.length) { showToast('Todos os funcionarios ja foram lancados neste dia.'); return; }
  const funcOpts = ativos.map(f => `<option value="${esc(f.nome)}" data-cargo="${f.cargo || ''}" data-diaria="${f.diaria || 0}">${f.nome} (${f.cargo || '-'})</option>`).join('');

  document.body.insertAdjacentHTML('beforeend', `
  <div id="diar-modalAdd" class="modal-overlay active">
    <div class="modal-box" style="max-width:420px">
      <div class="modal-header">
        <div class="modal-title"><span class="material-symbols-outlined" style="font-size:20px">person_add</span> ADICIONAR FUNCIONARIO</div>
        <button class="modal-close" onclick="document.getElementById('diar-modalAdd')?.remove()">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>
      <div style="color:var(--text-tertiary);" style="font-size:12px;margin-bottom:16px;">${new Date(data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })}</div>
      <label style="display:block;font-size:10px;font-weight:700;color:var(--text-tertiary);letter-spacing:1px;margin-bottom:4px;">FUNCIONARIO</label>
      <select id="add-func" style="padding:8px 10px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text-primary);font-family:inherit;font-size:12px;width:100%;box-sizing:border-box;" style="margin-bottom:12px;">${funcOpts}</select>
      <div id="add-periodos">
        <div style="display:flex;gap:8px;margin-bottom:8px;">
          <div style="flex:1;">
            <label style="display:block;font-size:10px;font-weight:700;color:var(--text-tertiary);letter-spacing:1px;margin-bottom:4px;">TURNO</label>
            <select class="add-turno" style="padding:7px 8px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text-primary);font-family:inherit;font-size:12px;width:100%;">
              <option value="dia">Dia inteiro (1.0)</option>
              <option value="manha">Manha (0.5)</option>
              <option value="tarde">Tarde (0.5)</option>
            </select>
          </div>
          <div style="flex:1;">
            <label style="display:block;font-size:10px;font-weight:700;color:var(--text-tertiary);letter-spacing:1px;margin-bottom:4px;">OBRA</label>
            <select class="add-obra" style="padding:7px 8px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text-primary);font-family:inherit;font-size:12px;width:100%;">${obrasOpts}</select>
          </div>
        </div>
      </div>
      <button onclick="diarAddPeriodoModal()" class="btn btn-ghost" style="width:100%;margin-bottom:16px;">+ Segundo turno (outra obra)</button>
      <div class="modal-footer">
        <button onclick="document.getElementById('diar-modalAdd')?.remove()" class="btn btn-outline">CANCELAR</button>
        <button onclick="diarConfirmarAdd('${data}')" class="btn btn-primary" style="flex:2">ADICIONAR</button>
      </div>
    </div>
  </div>`);
}

function diarAddPeriodoModal() {
  const container = document.getElementById('add-periodos');
  if (!container) return;
  const obrasOpts = obras.map(o => `<option value="${esc(o.nome)}">${o.nome}</option>`).join('');
  container.insertAdjacentHTML('beforeend', `
    <div style="display:flex;gap:8px;margin-bottom:8px;">
      <div style="flex:1;">
        <select class="add-turno" style="padding:7px 8px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text-primary);font-family:inherit;font-size:12px;width:100%;">
          <option value="dia">Dia inteiro (1.0)</option>
          <option value="manha">Manha (0.5)</option>
          <option value="tarde">Tarde (0.5)</option>
        </select>
      </div>
      <div style="flex:1;">
        <select class="add-obra" style="padding:7px 8px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text-primary);font-family:inherit;font-size:12px;width:100%;">${obrasOpts}</select>
      </div>
      <button onclick="this.parentElement.remove()" class="edr-btn-icon" style="color:var(--error);align-self:center;"><span class="material-symbols-outlined">close</span></button>
    </div>`);
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
      quinzena_id: DiariasModule.quinzenaAtiva.id,
      data, funcionario: nome, cargo, diaria_base: diaria,
      periodos, total_fracoes: totalFracoes,
      valor: diaria * totalFracoes,
      criado_por: usuarioAtual?.nome || ''
    }]);
    modal.remove();
    await _diarCarregarRegistros();
    _diarRenderRegistros();
    showToast(nome + ' adicionado!');
  } catch (e) { showToast('Erro: ' + e.message); }
}

async function diarExcluirRegistro(regId) {
  const ok = await confirmar('Excluir este registro de diaria?');
  if (!ok) return;
  try {
    await sbDelete('diarias', `?id=eq.${regId}`);
    document.getElementById('diar-modalEdit')?.remove();
    await _diarCarregarRegistros();
    _diarRenderRegistros();
    showToast('Registro excluido.');
  } catch (e) { showToast('Erro ao excluir: ' + e.message); }
}

async function diarDeletarDia(data) {
  const ok = await confirmar('Remover todos os registros de ' + data + '?');
  if (!ok) return;
  try {
    await sbDelete('diarias', `?quinzena_id=eq.${DiariasModule.quinzenaAtiva.id}&data=eq.${data}`);
    await _diarCarregarRegistros();
    _diarRenderRegistros();
    showToast('Registros removidos.');
  } catch (e) { showToast('Nao foi possivel remover.'); }
}


// ══════════════════════════════════════════════════════════════════
// FALTAS
// ══════════════════════════════════════════════════════════════════
function _diarGetFaltasDia(dia, regs) {
  const dow = new Date(dia + 'T12:00:00').getDay();
  if (dow === 0 || dow === 6) return []; // fds: presença voluntária, não conta falta
  regs = regs.map(r => ({ ...r, periodos: typeof r.periodos === 'string' ? JSON.parse(r.periodos || '[]') : (r.periodos || []) }));
  const presentes = new Set(regs.map(r => r.funcionario));
  return DiariasModule.team.filter(n => !presentes.has(n));
}

function _diarGetFaltasQuinzena() {
  const regs = _diarGetRegistrosQuinzena();
  const diasLancados = [...new Set(regs.map(r => r.data))];
  const faltas = {};
  DiariasModule.team.forEach(n => { faltas[n] = 0; });
  diasLancados.forEach(dia => {
    const dow = new Date(dia + 'T12:00:00').getDay();
    if (dow === 0 || dow === 6) return; // fds: não conta falta
    const presentes = new Set(regs.filter(r => r.data === dia).map(r => r.funcionario));
    DiariasModule.team.forEach(n => { if (!presentes.has(n)) faltas[n]++; });
  });
  return faltas;
}

function buildSecaoFaltas() {
  const regs = _diarGetRegistrosQuinzena();
  if (!regs.length) return '<div class="edr-card" style="margin-top:16px;"><div class="edr-card-title"><span class="material-symbols-outlined">warning</span> FALTAS — QUINZENA ATUAL</div><div style="color:var(--text-tertiary);" style="font-size:12px;">Nenhum registro de diarias na quinzena ativa.</div></div>';

  const diasLancados = [...new Set(regs.map(r => r.data))].sort();
  const faltas = _diarGetFaltasQuinzena();
  const totalDias = diasLancados.length;

  const linhas = DiariasModule.team.map(nome => {
    const f = faltas[nome] || 0;
    const presencas = totalDias - f;
    const pct = totalDias > 0 ? Math.round(presencas / totalDias * 100) : 100;
    const cor = f === 0 ? 'var(--success)' : f <= 1 ? 'var(--warning)' : 'var(--error)';
    return `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border-primary);">
      <span style="font-weight:600;font-size:13px;">${nome}</span>
      <div style="display:flex;align-items:center;gap:12px;">
        <span style="color:var(--text-tertiary);" style="font-size:11px;">${presencas}/${totalDias} dias</span>
        ${f > 0 ? `<span class="edr-badge edr-badge-error">${f} falta${f > 1 ? 's' : ''}</span>` : '<span class="edr-badge edr-badge-success">Sem faltas</span>'}
        <div style="width:60px;height:6px;background:var(--surface-secondary);border-radius:3px;overflow:hidden;"><div style="height:100%;width:${pct}%;background:${cor};border-radius:3px;"></div></div>
      </div>
    </div>`;
  }).join('');

  const diasHtml = diasLancados.map(dia => {
    const itens = regs.filter(r => r.data === dia);
    const faltasDia = _diarGetFaltasDia(dia, itens);
    const df = new Date(dia + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }).toUpperCase();
    return faltasDia.length ? `<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid var(--border-secondary);font-size:11px;">
      <span class="edr-text-secondary">${df}</span>
      <span style="color:var(--error)">${faltasDia.join(', ')}</span>
    </div>` : '';
  }).filter(Boolean).join('');

  return `<div class="edr-card" style="margin-top:16px;">
    <div class="edr-card-title"><span class="material-symbols-outlined">warning</span> FALTAS — ${DiariasModule.quinzenaAtiva?.label || 'QUINZENA ATUAL'}</div>
    <div style="margin-bottom:16px;">${linhas}</div>
    ${diasHtml ? `<div style="margin-top:12px;"><div class="edr-section-label" style="margin-bottom:8px;">DETALHE POR DIA</div>${diasHtml}</div>` : ''}
  </div>`;
}


// ══════════════════════════════════════════════════════════════════
// CALENDARIO DO FUNCIONARIO
// ══════════════════════════════════════════════════════════════════
function diarAbrirCalendarioFunc(nome) {
  const regs = _diarGetRegistrosQuinzena();
  const q = DiariasModule.quinzenaAtiva;
  if (!q) return;

  const inicio = new Date(q.data_inicio + 'T12:00:00');
  const fim = new Date(q.data_fim + 'T12:00:00');
  const dias = [];
  for (let d = new Date(inicio); d <= fim; d.setDate(d.getDate() + 1)) {
    dias.push(d.toISOString().split('T')[0]);
  }

  const regsFun = regs.filter(r => r.nome === nome || r.funcionario === nome);
  const regsPorDia = {};
  regsFun.forEach(r => { regsPorDia[r.data] = r; });

  const qualquer = regsFun[0];
  const cargo = qualquer?.cargo || '';
  const totalDias = dias.filter(d => { const dow = new Date(d + 'T12:00:00').getDay(); return dow !== 0 && dow !== 6; }).length;
  const diasTrabalhados = dias.filter(d => regsPorDia[d]).length;
  const faltasDias = dias.filter(d => { const dow = new Date(d + 'T12:00:00').getDay(); return dow !== 0 && dow !== 6 && !regsPorDia[d]; }).length;
  const totalValor = regsFun.reduce((s, r) => s + Number(r.valor || 0), 0);
  const isMestre = usuarioAtual?.perfil === 'mestre';

  const linhas = dias.map(dia => {
    const dt = new Date(dia + 'T12:00:00');
    const dow = dt.getDay();
    const fds = dow === 0 || dow === 6;
    const df = dt.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }).toUpperCase();
    const reg = regsPorDia[dia];

    if (fds) {
      return `<div class="diar-cal-row diar-cal-fds">
        <div class="diar-cal-dot" style="background:var(--text-tertiary)"></div>
        <span class="diar-cal-date">${df}</span>
        <span style="color:var(--text-tertiary);" style="font-size:10px">fim de semana</span>
      </div>`;
    }
    if (reg) {
      let periodos = [];
      try { periodos = typeof reg.periodos === 'string' ? JSON.parse(reg.periodos || '[]') : (reg.periodos || []); } catch (e) { }
      const obrasStr = periodos.map(p => {
        const icon = p.turno === 'manha' ? 'wb_sunny' : p.turno === 'tarde' ? 'wb_twilight' : 'calendar_today';
        const label = p.turno === 'manha' ? 'manha' : p.turno === 'tarde' ? 'tarde' : 'dia todo';
        return `<span class="material-symbols-outlined" style="font-size:12px">${icon}</span> ${label} <strong>${p.obra}</strong>`;
      }).join(' · ');
      const val = Number(reg.valor || 0);
      return `<div class="diar-cal-row diar-cal-presente">
        <div class="diar-cal-dot" style="background:var(--success)"></div>
        <span class="diar-cal-date" style="font-weight:600">${df}</span>
        <div style="flex:1;font-size:10px">${obrasStr}</div>
        ${isMestre ? '' : `<span class="diar-cal-valor">R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>`}
      </div>`;
    }
    return `<div class="diar-cal-row diar-cal-falta">
      <div class="diar-cal-dot" style="background:var(--error)"></div>
      <span class="diar-cal-date" style="font-weight:600;color:var(--error)">${df}</span>
      <span style="font-size:11px;color:var(--error);font-style:italic">faltou</span>
    </div>`;
  }).join('');

  document.body.insertAdjacentHTML('beforeend', `
  <div id="diar-modalCalendario" class="modal-overlay active">
    <div class="modal-box" style="max-width:500px;max-height:90vh;overflow-y:auto;">
      <div class="modal-header">
        <div class="modal-title">
          <span class="material-symbols-outlined">calendar_month</span>
          ${nome} <span style="color:var(--text-tertiary);" style="font-size:11px;font-weight:400">${cargo}</span>
        </div>
        <button class="modal-close" onclick="document.getElementById('diar-modalCalendario')?.remove()">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>
      <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:16px;font-size:13px;">
        <span><span class="material-symbols-outlined" style="font-size:14px;color:var(--success);vertical-align:middle">check_circle</span> <strong>${diasTrabalhados}</strong> dias trabalhados</span>
        <span><span class="material-symbols-outlined" style="font-size:14px;color:var(--error);vertical-align:middle">cancel</span> <strong>${faltasDias}</strong> falta(s)</span>
        ${isMestre ? '' : `<span><span class="material-symbols-outlined" style="font-size:14px;color:var(--success);vertical-align:middle">payments</span> <strong>R$ ${totalValor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong></span>`}
      </div>
      <div style="border:1px solid var(--border-primary);border-radius:10px;overflow:hidden">${linhas}</div>
    </div>
  </div>`);
}


// ══════════════════════════════════════════════════════════════════
// NORMALIZAR NOME DE OBRA
// ══════════════════════════════════════════════════════════════════
function _diarNormalizarObra(obraNome) {
  if (!obraNome) return 'NAO ESPECIFICADA';
  const t = obraNome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  if (!Array.isArray(obras) || !obras.length) return obraNome.toUpperCase().trim();
  for (const o of obras) {
    const n = o.nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (t === n) return o.nome.toUpperCase();
  }
  let melhorMatch = null, melhorLen = Infinity;
  for (const o of obras) {
    const n = o.nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (n.includes(t) && n.length < melhorLen) { melhorMatch = o; melhorLen = n.length; }
  }
  if (melhorMatch) return melhorMatch.nome.toUpperCase();
  for (const o of obras) {
    const n = o.nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const primeiro = n.split(' ')[0];
    if (primeiro.length >= 3 && t === primeiro) return o.nome.toUpperCase();
  }
  return obraNome.toUpperCase().trim();
}


// ══════════════════════════════════════════════════════════════════
// FOLHA DE PAGAMENTO
// ══════════════════════════════════════════════════════════════════
function _diarRenderFolha() {
  const container = document.getElementById('diar-folhaContainer');
  if (!container) return;
  const regs = _diarGetRegistrosQuinzena();
  if (!regs.length) {
    container.innerHTML = '<div class="edr-empty"><span class="material-symbols-outlined" style="font-size:48px;opacity:.3;">payments</span><p>Nenhum dado ainda</p></div>';
    return;
  }
  const porFunc = {};
  regs.forEach(r => {
    const periodos = typeof r.periodos === 'string' ? JSON.parse(r.periodos || '[]') : (r.periodos || []);
    if (!porFunc[r.funcionario]) porFunc[r.funcionario] = { nome: r.funcionario, cargo: r.cargo || '', diaria: r.diaria_base, fracoes: 0, valor: 0, obras: {} };
    porFunc[r.funcionario].fracoes += Number(r.total_fracoes || 0);
    // Recalcula pelo mesmo método de _diarCalcCustoObra (diaria_base × fracao por período)
    const valorCalc = periodos.reduce((s, p) => s + r.diaria_base * (p.fracao || 0), 0);
    porFunc[r.funcionario].valor += valorCalc;
    periodos.forEach(p => { const obra = _diarNormalizarObra(p.obra); porFunc[r.funcionario].obras[obra] = (porFunc[r.funcionario].obras[obra] || 0) + (p.fracao || 0); });
  });
  const ordem = { 'Mestre': 1, 'Pedreiro': 2, 'Betoneiro': 3, 'Servente': 4 };
  const funcs = Object.values(porFunc).sort((a, b) => (ordem[a.cargo] || 9) - (ordem[b.cargo] || 9));
  const totalDiarias = funcs.reduce((s, f) => s + f.valor, 0);
  const isMestre = usuarioAtual?.perfil === 'mestre';

  const extras = _diarGetExtrasQuinzena();
  const extrasPorFunc = {};
  extras.forEach(e => { extrasPorFunc[e.funcionario] = (extrasPorFunc[e.funcionario] || 0) + e.valor; });
  const totalExtras = Object.values(extrasPorFunc).reduce((s, v) => s + v, 0);
  const totalGeral = totalDiarias + totalExtras;

  const faltas = _diarGetFaltasQuinzena();

  const rows = funcs.map(f => {
    const extra = extrasPorFunc[f.nome] || 0;
    const totalFunc = f.valor + extra;
    return `<tr>
      <td class="diar-td-nome" style="cursor:pointer;text-decoration:underline dotted;text-underline-offset:3px;" onclick="diarAbrirCalendarioFunc('${esc(f.nome)}')" title="Ver calendario"><span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;opacity:.5">calendar_month</span> ${esc(f.nome)}</td>
      <td style="color:var(--text-tertiary);" style="font-size:11px">${f.cargo || '-'}</td>
      ${isMestre ? '' : `<td class="edr-text-secondary" style="font-size:11px">R$ ${f.diaria} x ${f.fracoes.toFixed(1)}d</td>`}
      <td>${f.fracoes.toFixed(1)}d</td>
      ${isMestre ? '' : `<td style="text-align:center;font-weight:700;color:${(faltas[f.nome] || 0) > 0 ? 'var(--error)' : 'var(--text-tertiary)'};">${faltas[f.nome] || 0}</td>`}
      <td><div class="diar-obras-breakdown">${Object.keys(f.obras).map(o => `<span class="diar-obra-tag">${o}</span>`).join('')}</div></td>
      ${isMestre ? '' : `<td class="diar-td-val">R$ ${f.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>`}
      ${isMestre ? '' : `<td class="diar-td-val" style="color:${extra > 0 ? 'var(--warning)' : 'var(--text-tertiary)'};">${extra > 0 ? 'R$ ' + extra.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '\u2014'}</td>`}
      ${isMestre ? '' : `<td class="diar-td-val" style="font-size:14px;font-weight:800;color:var(--success)">R$ ${totalFunc.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>`}
    </tr>`;
  }).join('');

  const custoPorObra = _diarCalcCustoObra();
  const obraLinhas = Object.entries(custoPorObra).sort((a, b) => b[1] - a[1]).map(([o, v]) =>
    `<tr><td style="padding:7px 10px;font-weight:600">${o}</td>${isMestre ? '' : `<td style="padding:7px 10px;color:var(--success);font-family:'Space Grotesk',monospace;text-align:right">R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>`}</tr>`).join('');
  const totalObras = Object.values(custoPorObra).reduce((s, v) => s + v, 0);

  const thDiaria = isMestre ? '' : '<th>Diaria x Dias</th>';
  const thFaltas = isMestre ? '' : '<th style="text-align:center;color:var(--error)">Faltas</th>';
  const thDiarias = isMestre ? '' : '<th style="text-align:right">Diarias</th>';
  const thExtra = isMestre ? '' : '<th style="text-align:right;color:var(--warning)">Extra</th>';
  const thTotal = isMestre ? '' : '<th style="text-align:right;color:var(--success)">Total</th>';
  const trTotal = isMestre ? '' : `
    <tr class="diar-folha-total-row">
      <td colspan="5" style="font-weight:700">TOTAL QUINZENA</td>
      <td class="diar-td-val">R$ ${totalDiarias.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
      <td class="diar-td-val" style="color:var(--warning)">R$ ${totalExtras.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
      <td class="diar-td-val" style="font-size:15px;color:var(--success)">R$ ${totalGeral.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
    </tr>`;

  container.innerHTML = `
    <table class="diar-folha-table">
      <thead><tr><th>Funcionario</th><th>Funcao</th>${thDiaria}<th>Dias</th>${thFaltas}<th>Obras</th>${thDiarias}${thExtra}${thTotal}</tr></thead>
      <tbody>${rows}${trTotal}</tbody>
    </table>
    ${!isMestre && obraLinhas ? `<div class="edr-card" style="margin-top:16px">
      <div class="edr-card-title"><span class="material-symbols-outlined">construction</span> CUSTO MAO DE OBRA POR OBRA</div>
      <table style="width:100%;border-collapse:collapse"><tbody>${obraLinhas}</tbody>
        <tfoot><tr style="border-top:1px solid var(--border-primary)">
          <td style="padding:9px 10px;font-weight:700">TOTAL</td>
          <td style="padding:9px 10px;font-weight:700;color:var(--success);text-align:right;font-family:'Space Grotesk',monospace">R$ ${totalObras.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
        </tr></tfoot>
      </table>
    </div>` : ''}`;
}


// ══════════════════════════════════════════════════════════════════
// EXTRAS / BONIFICACOES
// ══════════════════════════════════════════════════════════════════
function diarAbrirModalExtra() {
  const selFunc = document.getElementById('diar-extra-func');
  selFunc.innerHTML = '<option value="">Selecionar...</option>';
  _diarGetFuncionariosAtivos().forEach(f => {
    selFunc.innerHTML += `<option value="${esc(f.nome)}">${esc(f.nome)} (${f.cargo})</option>`;
  });
  const sel = document.getElementById('diar-extra-obra');
  sel.innerHTML = '<option value="">Selecionar obra...</option>';
  const todasObras = typeof obrasArquivadas !== 'undefined' ? [...obras, ...obrasArquivadas] : [...obras];
  todasObras.forEach(o => { sel.innerHTML += `<option value="${esc(o.nome)}">${esc(o.nome)}</option>`; });
  document.getElementById('diar-extra-func').value = '';
  document.getElementById('diar-extra-desc').value = '';
  document.getElementById('diar-extra-valor').value = '';
  document.getElementById('diar-modalExtra').style.display = 'flex';
}

function diarFecharModalExtra() {
  document.getElementById('diar-modalExtra').style.display = 'none';
}

async function diarSalvarExtra() {
  const func = document.getElementById('diar-extra-func').value.trim();
  const desc = document.getElementById('diar-extra-desc').value.trim();
  const valor = parseFloat(document.getElementById('diar-extra-valor').value);
  const obra = document.getElementById('diar-extra-obra').value;
  if (!func) { showToast('Selecione o funcionario.'); return; }
  if (!desc) { showToast('Informe a descricao.'); return; }
  if (!valor || valor <= 0) { showToast('Informe um valor valido.'); return; }
  if (!obra) { showToast('Selecione a obra.'); return; }
  try {
    const novo = await sbPost('diarias_extras', { quinzena_id: DiariasModule.quinzenaAtiva.id, funcionario: func, descricao: desc, valor, obra });
    DiariasModule.extras.push(novo);
    diarFecharModalExtra(); _diarRenderExtras(); _diarRenderFolha();
    showToast('Extra registrado!');
  } catch (e) { showToast('Nao foi possivel salvar o extra.'); }
}

async function diarExcluirExtra(id) {
  const ok = await confirmar('Remover este extra? Esta acao nao pode ser desfeita.');
  if (!ok) return;
  try {
    await sbDelete('diarias_extras', `?id=eq.${id}`);
    DiariasModule.extras = DiariasModule.extras.filter(e => e.id !== id);
    _diarRenderExtras(); _diarRenderFolha();
    showToast('Extra removido.');
  } catch (e) { showToast('Nao foi possivel remover o extra.'); }
}

function _diarRenderExtras() {
  const el = document.getElementById('diar-extras-lista');
  if (!el) return;
  const extras = _diarGetExtrasQuinzena();
  if (!extras.length) {
    el.innerHTML = '<div style="color:var(--text-tertiary);" style="font-size:11px;padding:8px 0;">Nenhum extra lancado nesta quinzena.</div>';
    return;
  }
  const totalExtras = extras.reduce((s, e) => s + e.valor, 0);
  el.innerHTML = `
    <div class="edr-card" style="overflow:hidden;margin-bottom:8px;">
      ${extras.map(e => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:9px 12px;border-bottom:1px solid var(--border-primary);gap:8px;flex-wrap:wrap;">
          <div style="display:flex;flex-direction:column;gap:2px;flex:1;">
            <span style="font-weight:700;font-size:12px;">${e.funcionario}</span>
            <span style="color:var(--text-tertiary);" style="font-size:10px;">${e.descricao || e.desc || ''} · <span style="color:var(--success)">${e.obra}</span></span>
          </div>
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="font-weight:700;color:var(--success);font-family:'Space Grotesk',monospace;font-size:13px;">R$ ${e.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            <button onclick="diarExcluirExtra('${esc(e.id)}')" class="edr-btn-sm" style="color:var(--error);border-color:rgba(239,68,68,.3);">
              <span class="material-symbols-outlined" style="font-size:14px">close</span>
            </button>
          </div>
        </div>`).join('')}
      <div style="padding:9px 12px;display:flex;justify-content:space-between;align-items:center;background:var(--surface-secondary);">
        <span style="font-size:11px;font-weight:700;">TOTAL EXTRAS</span>
        <span style="font-weight:800;color:var(--success);font-family:'Space Grotesk',monospace;">R$ ${totalExtras.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
      </div>
    </div>`;
}

function _diarCalcCustoObra() {
  const regs = _diarGetRegistrosQuinzena();
  const porObra = {};
  regs.forEach(r => { r.periodos.forEach(p => { const obra = _diarNormalizarObra(p.obra); porObra[obra] = (porObra[obra] || 0) + r.diaria_base * p.fracao; }); });
  _diarGetExtrasQuinzena().forEach(e => { const obra = _diarNormalizarObra(e.obra); porObra[obra] = (porObra[obra] || 0) + e.valor; });
  return porObra;
}


// ══════════════════════════════════════════════════════════════════
// TABS
// ══════════════════════════════════════════════════════════════════
function diarSwitchTab(tab, el) {
  DiariasModule.tab = tab;
  document.querySelectorAll('#view-diarias .diar-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('diar-tabRegistros').style.display = tab === 'registros' ? 'block' : 'none';
  document.getElementById('diar-tabFolha').style.display = tab === 'folha' ? 'block' : 'none';
  if (tab === 'folha') { _diarCarregarRegistros().then(() => { _diarRenderFolha(); _diarRenderExtras(); }); }
}


// ══════════════════════════════════════════════════════════════════
// TOGGLE PAINEL
// ══════════════════════════════════════════════════════════════════
function diarTogglePanel() {
  DiariasModule.panelRecolhido = !DiariasModule.panelRecolhido;
  const panel = document.getElementById('diar-panelLeft');
  const content = document.getElementById('diar-panelContent');
  const btn = document.getElementById('diar-togglePanel');
  const grid = panel?.closest('.diarias-main');
  if (DiariasModule.panelRecolhido) {
    panel.classList.add('recolhido');
    if (grid) grid.classList.add('panel-recolhido');
    content.style.display = 'none';
    if (btn) { btn.textContent = '▶'; btn.title = 'Expandir painel'; }
  } else {
    panel.classList.remove('recolhido');
    if (grid) grid.classList.remove('panel-recolhido');
    content.style.display = 'flex';
    content.style.flexDirection = 'column';
    content.style.gap = '18px';
    if (btn) { btn.textContent = '◀'; btn.title = 'Recolher painel'; }
  }
}


// ══════════════════════════════════════════════════════════════════
// EXPORTAR PDF (jsPDF com try/catch)
// ══════════════════════════════════════════════════════════════════
function diarExportarFolha() {
  try {
    const regs = _diarGetRegistrosQuinzena();
    if (!regs.length) { showToast('Nenhum dado para exportar.'); return; }

    if (!window.jspdf) {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
      script.onload = () => _diarGerarPDF(regs);
      script.onerror = () => { showToast('Nao foi possivel carregar o gerador de PDF. Tente novamente.'); };
      document.head.appendChild(script);
    } else {
      _diarGerarPDF(regs);
    }
  } catch (e) { showToast('Nao foi possivel exportar: ' + e.message); }
}

function _diarGerarPDF(regs) {
  try {
    if (!window.jspdf) { showToast('Erro ao carregar exportacao.'); return; }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const W = 210, margem = 14;
    const quinzena = (DiariasModule.quinzenaAtiva?.label || 'Quinzena');
    const hoje = new Date().toLocaleDateString('pt-BR');

    const VERDE = [45, 106, 79];     // #2D6A4F (verde floresta V2)
    const BRANCO = [255, 255, 255];
    const CINZA1 = [30, 30, 30];
    const CINZA2 = [60, 60, 60];
    const CINZA3 = [120, 120, 120];
    const LINHA = [220, 220, 220];
    const VERDE_CL = [232, 245, 233];

    let y = 0;

    // CABECALHO
    doc.setFillColor(...VERDE);
    doc.rect(0, 0, W, 28, 'F');
    doc.setTextColor(...BRANCO);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text('EDR ENGENHARIA', margem, 12);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('GESTAO INTEGRADA DE OBRAS', margem, 18);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('FOLHA DE PAGAMENTO — DIARIAS', W - margem, 12, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(quinzena, W - margem, 18, { align: 'right' });
    doc.text('Emitido em: ' + hoje, W - margem, 23, { align: 'right' });
    y = 36;

    // RESUMO POR FUNCIONARIO
    doc.setTextColor(...CINZA1);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('RESUMO POR FUNCIONARIO', margem, y);
    y += 5;

    const colW = [62, 28, 22, 28, 28, 28];
    const colX = [margem];
    colW.forEach((w, i) => colX.push(colX[i] + colW[i]));

    doc.setFillColor(...VERDE);
    doc.rect(margem, y, W - margem * 2, 7, 'F');
    doc.setTextColor(...BRANCO);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    const headers = ['FUNCIONARIO', 'CARGO', 'DIAS', 'DIARIA (R$)', 'TOTAL (R$)'];
    const aligns = ['left', 'left', 'center', 'right', 'right'];
    headers.forEach((h, i) => {
      const x = aligns[i] === 'right' ? colX[i] + colW[i] - 2 : aligns[i] === 'center' ? colX[i] + colW[i] / 2 : colX[i] + 2;
      doc.text(h, x, y + 5, { align: aligns[i] });
    });
    y += 7;

    const ordemPdf = { 'Mestre': 1, 'Pedreiro': 2, 'Betoneiro': 3, 'Servente': 4 };
    const porFunc = {};
    regs.forEach(r => {
      if (!porFunc[r.funcionario]) porFunc[r.funcionario] = { nome: r.funcionario, cargo: r.cargo || '', diaria: r.diaria_base, fracoes: 0, valor: 0, obras: {} };
      porFunc[r.funcionario].fracoes += r.total_fracoes;
      porFunc[r.funcionario].valor += r.valor;
      r.periodos.forEach(p => { const obra = _diarNormalizarObra(p.obra); porFunc[r.funcionario].obras[obra] = (porFunc[r.funcionario].obras[obra] || 0) + p.fracao; });
    });
    const funcs = Object.values(porFunc).sort((a, b) => (ordemPdf[a.cargo] || 9) - (ordemPdf[b.cargo] || 9));
    const totalGeral = funcs.reduce((s, f) => s + f.valor, 0);

    funcs.forEach((f, idx) => {
      if (idx % 2 === 0) { doc.setFillColor(248, 248, 248); doc.rect(margem, y, W - margem * 2, 7, 'F'); }
      doc.setTextColor(...CINZA1); doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
      doc.text(f.nome, colX[0] + 2, y + 5);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...CINZA2);
      doc.text(f.cargo, colX[1] + 2, y + 5);
      doc.text(f.fracoes.toFixed(1), colX[2] + colW[2] / 2, y + 5, { align: 'center' });
      doc.text('R$ ' + f.diaria.toFixed(2), colX[3] + colW[3] - 2, y + 5, { align: 'right' });
      doc.setFont('helvetica', 'bold'); doc.setTextColor(...VERDE);
      doc.text('R$ ' + f.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 }), colX[4] + colW[4] - 2, y + 5, { align: 'right' });
      y += 7;
    });

    doc.setFillColor(...VERDE_CL);
    doc.rect(margem, y, W - margem * 2, 8, 'F');
    doc.setTextColor(...CINZA1); doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    doc.text('TOTAL DIARIAS', colX[0] + 2, y + 5.5);
    doc.setTextColor(...VERDE);
    doc.text('R$ ' + totalGeral.toLocaleString('pt-BR', { minimumFractionDigits: 2 }), colX[4] + colW[4] - 2, y + 5.5, { align: 'right' });
    y += 10;

    // Extras
    const extras = _diarGetExtrasQuinzena();
    if (extras.length) {
      doc.setTextColor(...CINZA1); doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
      doc.text('EXTRAS / BONIFICACOES', margem, y);
      y += 5;
      doc.setFillColor(...VERDE);
      doc.rect(margem, y, W - margem * 2, 7, 'F');
      doc.setTextColor(...BRANCO); doc.setFontSize(8);
      doc.text('FUNCIONARIO', margem + 2, y + 5);
      doc.text('DESCRICAO', colX[1] + 2, y + 5);
      doc.text('OBRA', colX[3] + 2, y + 5);
      doc.text('VALOR (R$)', W - margem - 2, y + 5, { align: 'right' });
      y += 7;
      const totalExtras = extras.reduce((s, e) => s + e.valor, 0);
      extras.forEach((e, idx) => {
        if (idx % 2 === 0) { doc.setFillColor(248, 248, 248); doc.rect(margem, y, W - margem * 2, 7, 'F'); }
        doc.setTextColor(...CINZA1); doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
        doc.text(e.funcionario, margem + 2, y + 5);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...CINZA2);
        doc.text((e.descricao || '').substring(0, 28), colX[1] + 2, y + 5);
        doc.text((e.obra || '').substring(0, 18), colX[3] + 2, y + 5);
        doc.setFont('helvetica', 'bold'); doc.setTextColor(...VERDE);
        doc.text('R$ ' + e.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 }), W - margem - 2, y + 5, { align: 'right' });
        y += 7;
      });
      doc.setFillColor(...VERDE_CL);
      doc.rect(margem, y, W - margem * 2, 8, 'F');
      doc.setTextColor(...CINZA1); doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
      doc.text('TOTAL EXTRAS', colX[0] + 2, y + 5.5);
      doc.setTextColor(...VERDE);
      doc.text('R$ ' + totalExtras.toLocaleString('pt-BR', { minimumFractionDigits: 2 }), W - margem - 2, y + 5.5, { align: 'right' });
      y += 10;
      const totalFinal = totalGeral + totalExtras;
      doc.setFillColor(...VERDE);
      doc.rect(margem, y, W - margem * 2, 9, 'F');
      doc.setTextColor(...BRANCO); doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
      doc.text('TOTAL GERAL (DIARIAS + EXTRAS)', margem + 2, y + 6.2);
      doc.text('R$ ' + totalFinal.toLocaleString('pt-BR', { minimumFractionDigits: 2 }), W - margem - 2, y + 6.2, { align: 'right' });
      y += 14;
    } else {
      y += 4;
    }

    // CUSTO POR OBRA
    const custoPorObra = _diarCalcCustoObra();
    if (Object.keys(custoPorObra).length) {
      doc.setTextColor(...CINZA1); doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
      doc.text('CUSTO DE MAO DE OBRA POR OBRA', margem, y);
      y += 5;
      doc.setFillColor(...VERDE);
      doc.rect(margem, y, W - margem * 2, 7, 'F');
      doc.setTextColor(...BRANCO); doc.setFontSize(8);
      doc.text('OBRA', margem + 2, y + 5);
      doc.text('TOTAL (R$)', W - margem - 2, y + 5, { align: 'right' });
      y += 7;
      Object.entries(custoPorObra).sort((a, b) => b[1] - a[1]).forEach(([obra, val], idx) => {
        if (idx % 2 === 0) { doc.setFillColor(248, 248, 248); doc.rect(margem, y, W - margem * 2, 7, 'F'); }
        doc.setTextColor(...CINZA1); doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
        doc.text(obra, margem + 2, y + 5);
        doc.setFont('helvetica', 'bold'); doc.setTextColor(...VERDE);
        doc.text('R$ ' + val.toLocaleString('pt-BR', { minimumFractionDigits: 2 }), W - margem - 2, y + 5, { align: 'right' });
        y += 7;
      });
      y += 6;
    }

    // RODAPE
    y = Math.max(y + 10, 255);
    if (y > 270) { doc.addPage(); y = 240; }
    doc.setDrawColor(...LINHA);
    doc.line(margem, y, W - margem, y);
    y += 6;
    doc.setTextColor(...CINZA3); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
    doc.text('EDR Engenharia — Documento gerado pelo EDR System V2', margem, y);
    doc.text('Pagina 1', W - margem, y, { align: 'right' });

    doc.save('EDR_Folha_' + (DiariasModule.quinzenaAtiva?.label || 'quinzena').replace(/[^a-zA-Z0-9]/g, '_') + '.pdf');
    showToast('PDF gerado!');
  } catch (e) { showToast('Nao foi possivel gerar o PDF: ' + e.message); }
}


// ══════════════════════════════════════════════════════════════════
// MODAL LANCAR NO EDR SYSTEM
// ══════════════════════════════════════════════════════════════════
async function _diarBuscarObras() {
  if (DiariasModule._obrasCache) return DiariasModule._obrasCache;
  try {
    const lista = await sbGet('obras', '?select=id,nome&arquivada=eq.false&order=nome.asc');
    DiariasModule._obrasCache = {};
    lista.forEach(o => { DiariasModule._obrasCache[_diarNormStr(o.nome)] = o.id; });
    return DiariasModule._obrasCache;
  } catch (e) { return null; }
}

async function diarAbrirModalEDR() {
  const custoPorObra = _diarCalcCustoObra();
  if (!Object.keys(custoPorObra).length) { showToast('Nenhum dado na quinzena atual.'); return; }
  const obs = 'Folha quinzenal · ' + (DiariasModule.quinzenaAtiva?.label || 'Quinzena');
  const modal = document.getElementById('diar-modalEDR');
  modal.style.display = 'flex';
  document.getElementById('diar-modalEDRBody').innerHTML =
    '<div style="text-align:center;padding:28px;font-size:12px" style="color:var(--text-tertiary);"><span class="material-symbols-outlined" style="font-size:24px;animation:spin 1s linear infinite">sync</span><p>Carregando obras do EDR System...</p></div>';
  modal.dataset.obs = obs;

  const obrasMap = await _diarBuscarObras();
  if (!obrasMap) {
    document.getElementById('diar-modalEDRBody').innerHTML =
      '<div style="text-align:center;padding:28px;color:var(--error);font-size:12px"><span class="material-symbols-outlined">cloud_off</span><p>Nao foi possivel conectar ao EDR System.</p></div>';
    return;
  }
  const linhas = Object.entries(custoPorObra).map(([obra, valor]) => {
    const id = obrasMap[_diarNormStr(obra)] || null;
    const statusIcon = id ? 'check_circle' : 'warning';
    const statusColor = id ? 'var(--success)' : 'var(--warning)';
    return `<tr data-obra="${obra}" data-valor="${valor.toFixed(2)}" data-id="${id || ''}">
      <td style="padding:7px 5px"><span class="material-symbols-outlined" style="font-size:16px;color:${statusColor}">${statusIcon}</span></td>
      <td style="padding:7px 5px;font-weight:600">${obra}</td>
      <td style="padding:7px 5px;color:var(--success);font-family:'Space Grotesk',monospace;text-align:right">R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
    </tr>`;
  }).join('');
  const total = Object.values(custoPorObra).reduce((s, v) => s + v, 0);

  document.getElementById('diar-modalEDRBody').innerHTML = `
    <p style="color:var(--text-tertiary);" style="font-size:12px;margin-bottom:10px">
      Cada linha sera lancada como <strong>MAO DE OBRA</strong> na obra correspondente.<br>
      Obs: <em>${obs}</em>
    </p>
    <table style="width:100%;border-collapse:collapse">
      <thead><tr style="border-bottom:1px solid var(--border-primary)">
        <th style="padding:5px;text-align:left;font-size:10px" style="color:var(--text-tertiary);"></th>
        <th style="padding:5px;text-align:left;font-size:10px" style="color:var(--text-tertiary);">OBRA</th>
        <th style="padding:5px;text-align:right;font-size:10px" style="color:var(--text-tertiary);">CUSTO MO</th>
      </tr></thead>
      <tbody>${linhas}</tbody>
      <tfoot><tr style="border-top:1px solid var(--border-primary)">
        <td colspan="2" style="padding:9px 5px;font-weight:700">TOTAL</td>
        <td style="padding:9px 5px;color:var(--success);font-weight:700;text-align:right;font-family:'Space Grotesk',monospace">R$ ${total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
      </tr></tfoot>
    </table>
    <div id="diar-edrStatus" style="margin-top:10px;min-height:20px;font-size:11px" style="color:var(--text-tertiary);"></div>`;
  modal.dataset.obs = obs;
}

async function diarConfirmarLancamentosEDR() {
  const btn = document.getElementById('diar-btnConfirmarEDR');
  btn.disabled = true; btn.textContent = 'Lancando...';
  const statusEl = document.getElementById('diar-edrStatus');
  const obs = document.getElementById('diar-modalEDR').dataset.obs || 'Folha quinzenal';
  const hoje = hojeISO();
  const rows = document.querySelectorAll('#diar-modalEDRBody tbody tr');
  let ok = 0, erro = 0;
  for (const row of rows) {
    const obra = row.dataset.obra; const valor = parseFloat(row.dataset.valor); const obraId = row.dataset.id;
    if (!obraId) { statusEl.innerHTML += `<div style="color:var(--warning)"><span class="material-symbols-outlined" style="font-size:14px">warning</span> ${obra}: sem ID, pulando</div>`; erro++; continue; }
    try {
      // Verificar duplicata: mesma obra + obs (contém label da quinzena) + etapa
      const existente = await sbGet('lancamentos',
        `?obra_id=eq.${obraId}&obs=eq.${encodeURIComponent(obs)}&etapa=eq.28_mao&select=id`);
      if (Array.isArray(existente) && existente.length > 0) {
        await sbPatch('lancamentos', `?id=eq.${existente[0].id}`, { preco: valor, total: valor, descricao: '000460 \u00b7 MAO DE OBRA' });
        statusEl.innerHTML += `<div style="color:var(--warning)"><span class="material-symbols-outlined" style="font-size:14px">update</span> ${obra}: atualizado (ja existia)</div>`;
      } else {
        await sbPostMinimal('lancamentos', { obra_id: obraId, descricao: '000460 \u00b7 MAO DE OBRA', qtd: 1, preco: valor, total: valor, data: hoje, obs, etapa: '28_mao' });
        statusEl.innerHTML += `<div style="color:var(--success)"><span class="material-symbols-outlined" style="font-size:14px">check_circle</span> ${obra}: R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} lancado</div>`;
      }
      ok++;
    } catch (e) { statusEl.innerHTML += `<div style="color:var(--error)"><span class="material-symbols-outlined" style="font-size:14px">error</span> ${obra}: ${e.message}</div>`; erro++; }
  }
  btn.textContent = ok > 0 ? ok + ' lancado(s)' + (erro > 0 ? ' / ' + erro + ' erro(s)' : '') : 'Falhou';
  if (ok > 0) { DiariasModule._obrasCache = null; showToast(ok + ' lancamento(s) enviado(s)!'); }
}

function diarFecharModalEDR() {
  document.getElementById('diar-modalEDR').style.display = 'none';
  const btn = document.getElementById('diar-btnConfirmarEDR');
  btn.disabled = false; btn.textContent = 'Confirmar e Lancar Tudo';
}
