// ══════════════════════════════════════════════════════════════════
// EDR System V2 — Módulo: FINANCEIRO
// Views: contas-pagar, caixa (fluxo de caixa projetado)
// Depende: infra.js, utils-extras.js, obras.js (obras[])
// ══════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────
// CONTAS A PAGAR
// ─────────────────────────────────────────────────────────────────

let contasPagar = [];
let _contasFiltro = '';

const CONTA_STATUS = {
  pendente:  { lb: 'PENDENTE',  cor: '#f59e0b', bg: 'rgba(245,158,11,0.08)' },
  vencido:   { lb: 'VENCIDO',   cor: '#ef4444', bg: 'rgba(239,68,68,0.08)' },
  pago:      { lb: 'PAGO',      cor: '#22c55e', bg: 'rgba(34,197,94,0.08)' },
  cancelado: { lb: 'CANCELADO', cor: '#6b7280', bg: 'rgba(255,255,255,0.04)' }
};

async function _loadContasPagar() {
  try {
    const r = await sbGet('contas_pagar', '?order=data_vencimento');
    contasPagar = Array.isArray(r) ? r : [];
  } catch(e) { contasPagar = []; }
}

function _getStatusConta(c) {
  if (c.status === 'pago' || c.status === 'cancelado') return c.status;
  if (c.data_vencimento < hojeISO() && c.status === 'pendente') return 'vencido';
  return c.status || 'pendente';
}

function getContasVencidas() {
  const hoje = hojeISO();
  return contasPagar.filter(c => c.status === 'pendente' && c.data_vencimento < hoje);
}

function renderContasPagar() {
  const hoje = hojeISO();
  const mesAtual = hoje.slice(0, 7);
  const lista = contasPagar.map(c => ({ ...c, _status: _getStatusConta(c) }));
  const filtrada = _contasFiltro ? lista.filter(c => c._status === _contasFiltro) : lista;

  const totalPendente = lista.filter(c => c._status === 'pendente').reduce((s, c) => s + Number(c.valor || 0), 0);
  const totalVencido  = lista.filter(c => c._status === 'vencido').reduce((s, c) => s + Number(c.valor || 0), 0);
  const pagasMes = lista.filter(c => c._status === 'pago' && (c.data_pagamento || '').startsWith(mesAtual)).reduce((s, c) => s + Number(c.valor || 0), 0);
  const qtdPendente = lista.filter(c => c._status === 'pendente').length;
  const qtdVencido  = lista.filter(c => c._status === 'vencido').length;
  const qtdPago     = lista.filter(c => c._status === 'pago').length;

  const statsEl = document.getElementById('contas-stats');
  if (statsEl) {
    statsEl.innerHTML = `
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;width:100%;">
        <button onclick="_contasFiltro='';renderContasPagar()" style="padding:5px 12px;border-radius:20px;border:1px solid ${!_contasFiltro ? 'var(--primary)' : 'var(--border)'};background:${!_contasFiltro ? 'rgba(45,106,79,0.1)' : 'transparent'};color:${!_contasFiltro ? 'var(--primary)' : 'var(--text-tertiary)'};font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;">Todas (${lista.length})</button>
        <button onclick="_contasFiltro='pendente';renderContasPagar()" style="padding:5px 12px;border-radius:20px;border:1px solid ${_contasFiltro==='pendente' ? '#f59e0b' : 'var(--border)'};background:${_contasFiltro==='pendente' ? 'rgba(245,158,11,0.1)' : 'transparent'};color:${_contasFiltro==='pendente' ? '#f59e0b' : 'var(--text-tertiary)'};font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;">Pendentes (${qtdPendente})</button>
        <button onclick="_contasFiltro='vencido';renderContasPagar()" style="padding:5px 12px;border-radius:20px;border:1px solid ${_contasFiltro==='vencido' ? '#ef4444' : 'var(--border)'};background:${_contasFiltro==='vencido' ? 'rgba(239,68,68,0.1)' : 'transparent'};color:${_contasFiltro==='vencido' ? '#ef4444' : 'var(--text-tertiary)'};font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;">Vencidas (${qtdVencido})</button>
        <button onclick="_contasFiltro='pago';renderContasPagar()" style="padding:5px 12px;border-radius:20px;border:1px solid ${_contasFiltro==='pago' ? '#22c55e' : 'var(--border)'};background:${_contasFiltro==='pago' ? 'rgba(34,197,94,0.1)' : 'transparent'};color:${_contasFiltro==='pago' ? '#22c55e' : 'var(--text-tertiary)'};font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;">Pagas (${qtdPago})</button>
        <div style="flex:1;"></div>
        <button onclick="abrirModalConta(null)" class="admin-only" style="padding:6px 14px;border-radius:10px;border:1px solid rgba(45,106,79,0.3);background:rgba(45,106,79,0.08);color:var(--primary);font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;letter-spacing:.5px;">+ NOVA CONTA</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;width:100%;margin-top:8px;">
        <div style="background:var(--card);border:1px solid var(--border);border-top:2px solid #f59e0b;border-radius:10px;padding:12px;text-align:center;">
          <div style="font-size:9px;color:var(--text-tertiary);font-weight:700;letter-spacing:1px;">PENDENTE</div>
          <div style="font-size:16px;font-weight:800;color:#f59e0b;font-family:'Space Grotesk',monospace;">${fmt(totalPendente)}</div>
        </div>
        <div style="background:var(--card);border:1px solid var(--border);border-top:2px solid #ef4444;border-radius:10px;padding:12px;text-align:center;">
          <div style="font-size:9px;color:var(--text-tertiary);font-weight:700;letter-spacing:1px;">VENCIDO</div>
          <div style="font-size:16px;font-weight:800;color:#ef4444;font-family:'Space Grotesk',monospace;">${fmt(totalVencido)}</div>
        </div>
        <div style="background:var(--card);border:1px solid var(--border);border-top:2px solid #22c55e;border-radius:10px;padding:12px;text-align:center;">
          <div style="font-size:9px;color:var(--text-tertiary);font-weight:700;letter-spacing:1px;">PAGAS NO MES</div>
          <div style="font-size:16px;font-weight:800;color:#22c55e;font-family:'Space Grotesk',monospace;">${fmt(pagasMes)}</div>
        </div>
      </div>`;
  }

  const listaEl = document.getElementById('contas-lista');
  if (!listaEl) return;

  if (!filtrada.length) {
    listaEl.innerHTML = `<div style="text-align:center;padding:40px 20px;color:var(--text-tertiary);">
      <span class="material-symbols-outlined" style="font-size:40px;display:block;margin-bottom:8px;">${_contasFiltro ? 'search' : 'receipt_long'}</span>
      <div style="font-size:13px;">${_contasFiltro ? 'Nenhuma conta com esse filtro.' : 'Nenhuma conta cadastrada.'}</div>
      ${!_contasFiltro ? '<div style="font-size:11px;margin-top:6px;">Clique em <strong style="color:var(--primary);">+ NOVA CONTA</strong> para adicionar.</div>' : ''}
    </div>`;
    return;
  }

  const ordemStatus = { vencido: 0, pendente: 1, pago: 2, cancelado: 3 };
  filtrada.sort((a, b) => {
    const oa = ordemStatus[a._status] ?? 9, ob = ordemStatus[b._status] ?? 9;
    if (oa !== ob) return oa - ob;
    return (a.data_vencimento || '').localeCompare(b.data_vencimento || '');
  });

  const obraMap = {};
  obras.forEach(o => obraMap[o.id] = o.nome);

  listaEl.innerHTML = filtrada.map(c => {
    const st = CONTA_STATUS[c._status] || CONTA_STATUS.pendente;
    const bordaCor = c._status === 'vencido' ? '#ef4444' : c._status === 'pago' ? '#22c55e' : '#f59e0b';
    const obraNome = c.obra_id ? (obraMap[c.obra_id] || '') : '';
    const isPago = c._status === 'pago' || c._status === 'cancelado';
    return `<div style="background:var(--card);border:1px solid var(--border);border-left:3px solid ${bordaCor};border-radius:12px;padding:14px 14px 14px 18px;margin-bottom:8px;${isPago ? 'opacity:0.7;' : ''}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">
        <div style="flex:1;min-width:0;">
          <div style="font-weight:700;font-size:14px;color:var(--text-primary);margin-bottom:2px;">${esc(c.fornecedor)}</div>
          ${c.descricao ? `<div style="font-size:12px;color:var(--text-secondary);margin-bottom:4px;">${esc(c.descricao)}</div>` : ''}
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;font-size:11px;color:var(--text-tertiary);">
            <span>Vence: <strong style="color:${c._status === 'vencido' ? '#ef4444' : 'var(--text-primary)'};">${fmtData(c.data_vencimento)}</strong></span>
            ${obraNome ? `<span>Obra: ${esc(obraNome)}</span>` : ''}
            ${c.nota_ref ? `<span>Ref: ${esc(c.nota_ref)}</span>` : ''}
            ${c.data_pagamento ? `<span>Pago em: ${fmtData(c.data_pagamento)}</span>` : ''}
          </div>
        </div>
        <div style="text-align:right;flex-shrink:0;">
          <div style="font-weight:800;font-size:16px;color:var(--primary);font-family:'Space Grotesk',monospace;">${fmt(c.valor)}</div>
          <span style="display:inline-block;padding:2px 8px;border-radius:6px;font-size:10px;font-weight:700;color:${st.cor};background:${st.bg};margin-top:4px;">${st.lb}</span>
        </div>
      </div>
      ${!isPago ? `<div class="admin-only" style="display:flex;gap:6px;margin-top:10px;justify-content:flex-end;">
        <button onclick="marcarComoPago('${esc(c.id)}')" style="padding:5px 12px;border-radius:8px;border:1px solid rgba(34,197,94,0.3);background:rgba(34,197,94,0.08);color:#22c55e;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;">Pago</button>
        <button onclick="abrirModalConta('${esc(c.id)}')" style="padding:5px 12px;border-radius:8px;border:1px solid var(--border);background:transparent;color:var(--text-secondary);font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;">Editar</button>
        <button onclick="excluirConta('${esc(c.id)}')" style="padding:5px 12px;border-radius:8px;border:1px solid rgba(239,68,68,0.2);background:transparent;color:#f87171;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;">Excluir</button>
      </div>` : `<div class="admin-only" style="display:flex;gap:6px;margin-top:10px;justify-content:flex-end;">
        <button onclick="excluirConta('${esc(c.id)}')" style="padding:5px 12px;border-radius:8px;border:1px solid rgba(239,68,68,0.2);background:transparent;color:#f87171;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;">Excluir</button>
      </div>`}
    </div>`;
  }).join('');
}

// ── MODAL CONTA ───────────────────────────────────────────────────
function abrirModalConta(contaId) {
  const selObra = document.getElementById('conta-obra');
  if (selObra) {
    selObra.innerHTML = '<option value="">— Nenhuma —</option>' +
      obras.map(o => `<option value="${o.id}">${esc(o.nome)}</option>`).join('');
  }
  if (contaId) {
    const c = contasPagar.find(x => x.id === contaId);
    if (!c) return;
    document.getElementById('modal-conta-titulo').textContent = 'Editar conta';
    document.getElementById('conta-id').value = c.id;
    document.getElementById('conta-fornecedor').value = c.fornecedor || '';
    document.getElementById('conta-descricao').value = c.descricao || '';
    document.getElementById('conta-valor').value = c.valor || '';
    document.getElementById('conta-vencimento').value = c.data_vencimento || '';
    if (selObra) selObra.value = c.obra_id || '';
    document.getElementById('conta-nota-ref').value = c.nota_ref || '';
  } else {
    document.getElementById('modal-conta-titulo').textContent = 'Nova conta';
    document.getElementById('conta-id').value = '';
    document.getElementById('conta-fornecedor').value = '';
    document.getElementById('conta-descricao').value = '';
    document.getElementById('conta-valor').value = '';
    document.getElementById('conta-vencimento').value = '';
    if (selObra) selObra.value = '';
    document.getElementById('conta-nota-ref').value = '';
  }
  openModal('conta');
  setTimeout(() => document.getElementById('conta-fornecedor').focus(), 100);
}

async function salvarConta() {
  const fornecedor = (document.getElementById('conta-fornecedor').value || '').trim();
  const descricao  = (document.getElementById('conta-descricao').value || '').trim();
  const valor      = parseFloat(document.getElementById('conta-valor').value) || 0;
  const data_vencimento = document.getElementById('conta-vencimento').value;
  const obra_id    = document.getElementById('conta-obra').value || null;
  const nota_ref   = (document.getElementById('conta-nota-ref').value || '').trim();
  const id         = document.getElementById('conta-id').value;

  if (!fornecedor) { showToast('Informe o fornecedor.'); return; }
  if (valor <= 0)  { showToast('Informe o valor.'); return; }
  if (!data_vencimento) { showToast('Informe a data de vencimento.'); return; }

  const payload = { fornecedor, descricao, valor, data_vencimento, obra_id, nota_ref };

  try {
    if (id) {
      const atualizada = await sbPatch('contas_pagar', `?id=eq.${id}`, payload);
      const idx = contasPagar.findIndex(c => c.id === id);
      if (idx >= 0 && atualizada) contasPagar[idx] = { ...contasPagar[idx], ...atualizada };
      showToast('Conta atualizada');
    } else {
      payload.status = 'pendente';
      const nova = await sbPost('contas_pagar', payload);
      if (nova) contasPagar.push(nova);
      showToast('Conta cadastrada');
    }
    fecharModal('conta');
    renderContasPagar();
  } catch(e) {
    console.error(e);
    showToast('Erro ao salvar conta.');
  }
}

async function marcarComoPago(contaId) {
  if (!confirm('Confirma pagamento desta conta?')) return;
  try {
    const atualizada = await sbPatch('contas_pagar', `?id=eq.${contaId}`, { status: 'pago', data_pagamento: hojeISO() });
    const idx = contasPagar.findIndex(c => c.id === contaId);
    if (idx >= 0 && atualizada) contasPagar[idx] = { ...contasPagar[idx], ...atualizada };
    showToast('Conta marcada como paga');
    renderContasPagar();
    if (typeof renderDashboard === 'function') renderDashboard();
  } catch(e) {
    console.error(e);
    showToast('Erro ao atualizar conta.');
  }
}

async function excluirConta(contaId) {
  if (!confirm('Excluir esta conta? Essa acao nao pode ser desfeita.')) return;
  try {
    await sbDelete('contas_pagar', `?id=eq.${contaId}`);
    contasPagar = contasPagar.filter(c => c.id !== contaId);
    showToast('Conta excluida');
    renderContasPagar();
    if (typeof renderDashboard === 'function') renderDashboard();
  } catch(e) {
    console.error(e);
    showToast('Erro ao excluir conta.');
  }
}

// Autocomplete fornecedor no modal
function onContaFornInput() {
  const val = (document.getElementById('conta-fornecedor')?.value || '').trim();
  const list = document.getElementById('ac-conta-forn');
  if (!list || val.length < 2) { if (list) list.classList.add('hidden'); return; }
  const v = val.toUpperCase();
  const fornSet = new Map();
  if (typeof notas !== 'undefined') notas.forEach(n => { if (n.fornecedor) fornSet.set(n.fornecedor.toUpperCase(), n.fornecedor); });
  contasPagar.forEach(c => { if (c.fornecedor && !fornSet.has(c.fornecedor.toUpperCase())) fornSet.set(c.fornecedor.toUpperCase(), c.fornecedor); });
  const matches = [...fornSet.values()].filter(f => f.toUpperCase().includes(v)).slice(0, 8);
  if (!matches.length) { list.classList.add('hidden'); return; }
  list.innerHTML = matches.map(f => `<div class="autocomplete-item" onmousedown="selecionarContaForn('${esc(f)}')" style="padding:8px 12px;cursor:pointer;font-size:13px;color:var(--text-primary);">${esc(f)}</div>`).join('');
  list.classList.remove('hidden');
}

function selecionarContaForn(nome) {
  document.getElementById('conta-fornecedor').value = nome;
  document.getElementById('ac-conta-forn').classList.add('hidden');
  document.getElementById('conta-descricao').focus();
}

// ─────────────────────────────────────────────────────────────────
// FLUXO DE CAIXA
// ─────────────────────────────────────────────────────────────────

let projecoesCaixa = [];
let _saldoManual = null; // saldo digitado manualmente pelo usuario

async function _loadSaldoManual() {
  try {
    if (_companyId) {
      const r = await sbGet('companies', '?id=eq.' + _companyId + '&select=saldo_manual');
      if (r && r[0] && r[0].saldo_manual !== null && r[0].saldo_manual !== undefined) {
        _saldoManual = parseFloat(r[0].saldo_manual);
        try { localStorage.setItem('edr_saldo_manual', String(_saldoManual)); } catch(e) {}
        return;
      }
    }
    // fallback localStorage
    const raw = localStorage.getItem('edr_saldo_manual');
    _saldoManual = raw !== null ? parseFloat(raw) : null;
  } catch(e) {
    const raw = localStorage.getItem('edr_saldo_manual');
    _saldoManual = raw !== null ? parseFloat(raw) : null;
  }
}

async function salvarSaldoManual() {
  const inp = document.getElementById('caixa-saldo-manual-input');
  if (!inp) return;
  const val = parseFloat(inp.value);
  if (isNaN(val)) { showToast('Informe um valor valido.'); return; }
  _saldoManual = val;
  try { localStorage.setItem('edr_saldo_manual', String(val)); } catch(e) {}
  if (_companyId) await sbPatch('companies', '?id=eq.' + _companyId, { saldo_manual: val });
  showToast('Saldo salvo');
  renderCaixa();
}

async function limparSaldoManual() {
  _saldoManual = null;
  try { localStorage.removeItem('edr_saldo_manual'); } catch(e) {}
  if (_companyId) await sbPatch('companies', '?id=eq.' + _companyId, { saldo_manual: null });
  renderCaixa();
}

function _calcSaldoBase() {
  return (_saldoManual !== null ? _saldoManual : 0) + _calcSaldoHoje();
}

async function _loadProjecoes() {
  try {
    const r = await sbGet('projecoes_caixa', '?order=data_prevista');
    projecoesCaixa = Array.isArray(r) ? r : [];
  } catch(e) { projecoesCaixa = []; }
}

function _getRepassesCef() {
  if (typeof repassesCef !== 'undefined' && repassesCef.length) return repassesCef;
  return (typeof CustosModule !== 'undefined') ? CustosModule.repassesCef || [] : [];
}

function _calcSaldoHoje() {
  const entRepasses  = _getRepassesCef().reduce((s, r) => s + Number(r.valor || 0), 0);
  const entAdicionais = (typeof adicionaisPgtos !== 'undefined' ? adicionaisPgtos : []).reduce((s, p) => s + Number(p.valor || 0), 0);
  const saidas = (typeof lancamentos !== 'undefined' ? lancamentos : []).reduce((s, l) => s + Number(l.total || 0), 0);
  const contasPagas = contasPagar.filter(c => c.status === 'pago' && !c.obra_id).reduce((s, c) => s + Number(c.valor || 0), 0);
  return (entRepasses + entAdicionais) - saidas - contasPagas;
}

function _calcMediaSaidaSemanal() {
  const hoje = new Date();
  const limite = new Date(hoje);
  limite.setDate(limite.getDate() - 90);
  const limiteISO = limite.toISOString().substring(0, 10);
  const lancs = typeof lancamentos !== 'undefined' ? lancamentos : [];
  const recentes = lancs.filter(l => l.data && l.data >= limiteISO);
  const total = recentes.reduce((s, l) => s + Number(l.total || 0), 0);
  return total / (90 / 7);
}

async function renderCaixa() {
  const el = document.getElementById('caixa-content');
  if (!el) return;

  await _loadSaldoManual();
  const saldoBase  = _calcSaldoBase();
  const mediaSem   = _calcMediaSaidaSemanal();
  const corSaldo   = saldoBase >= 0 ? 'var(--success)' : 'var(--error)';
  const hoje       = hojeISO();
  const isManual   = _saldoManual !== null;

  const d14 = new Date();
  d14.setDate(d14.getDate() + 14);
  const limite14 = d14.toISOString().substring(0, 10);
  const entradasProx = projecoesCaixa.filter(p => p.data_prevista >= hoje && p.data_prevista <= limite14);
  const totalEntradasProx = entradasProx.reduce((s, p) => s + Number(p.valor || 0), 0);
  const saidaEstimada2sem = mediaSem * 2;

  let html = '';

  // Card saldo calculado automaticamente
  const _entradas = _getRepassesCef().reduce((s, r) => s + Number(r.valor || 0), 0) +
    (typeof adicionaisPgtos !== 'undefined' ? adicionaisPgtos : []).reduce((s, p) => s + Number(p.valor || 0), 0);
  const _saidas = (typeof lancamentos !== 'undefined' ? lancamentos : []).reduce((s, l) => s + Number(l.total || 0), 0) +
    contasPagar.filter(c => c.status === 'pago' && !c.obra_id).reduce((s, c) => s + Number(c.valor || 0), 0);
  const _inicio = _saldoManual !== null ? _saldoManual : 0;
  html += `<div style="background:var(--card);border:1.5px solid ${saldoBase >= 0 ? 'rgba(5,150,105,0.3)' : 'rgba(220,38,38,0.3)'};border-radius:16px;padding:20px;margin-bottom:16px;">
    <div style="font-size:10px;color:var(--text-tertiary);font-weight:700;letter-spacing:2px;margin-bottom:4px;display:flex;align-items:center;gap:6px;">
      SALDO DISPONIVEL HOJE
      <span style="font-size:9px;background:rgba(34,197,94,0.1);color:var(--success);padding:2px 7px;border-radius:10px;letter-spacing:0;font-weight:700;">AUTOMATICO</span>
    </div>
    <div style="font-size:32px;font-weight:800;color:${corSaldo};font-family:'Space Grotesk',monospace;line-height:1;margin-bottom:10px;">${fmtR(saldoBase)}</div>
    <div style="display:flex;gap:16px;font-size:10px;flex-wrap:wrap;margin-bottom:14px;">
      ${_inicio !== 0 ? `<span style="color:var(--text-tertiary);">Inicial: <strong style="color:var(--text-secondary);font-family:'Space Grotesk',monospace;">${fmtR(_inicio)}</strong></span>` : ''}
      <span style="color:var(--text-tertiary);">Entradas: <strong style="color:var(--success);font-family:'Space Grotesk',monospace;">+${fmtR(_entradas)}</strong></span>
      <span style="color:var(--text-tertiary);">Saidas: <strong style="color:var(--error);font-family:'Space Grotesk',monospace;">-${fmtR(_saidas)}</strong></span>
    </div>
    <details style="border-top:1px solid var(--border);padding-top:12px;">
      <summary style="font-size:11px;color:var(--text-tertiary);cursor:pointer;list-style:none;display:flex;align-items:center;gap:4px;user-select:none;">
        <span style="font-size:14px;line-height:1;">⚙</span> Saldo inicial da conta ${isManual ? `<strong style="color:var(--text-secondary);font-family:'Space Grotesk',monospace;">${fmtR(_saldoManual)}</strong>` : '(nao configurado)'}
      </summary>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:10px;">
        <input type="number" id="caixa-saldo-manual-input" step="0.01" placeholder="Saldo da conta antes de usar o EDR (R$)" value="${isManual ? _saldoManual : ''}" style="flex:1;min-width:160px;padding:9px 13px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:14px;background:var(--bg);color:var(--text-primary);" onkeydown="if(event.key==='Enter')salvarSaldoManual()">
        <button onclick="salvarSaldoManual()" style="padding:9px 16px;border-radius:var(--radius-sm);border:none;background:var(--primary);color:#fff;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap;">Salvar</button>
        ${isManual ? `<button onclick="limparSaldoManual()" style="padding:9px 12px;border-radius:var(--radius-sm);border:1px solid var(--border);background:transparent;color:var(--text-tertiary);font-size:12px;cursor:pointer;">Limpar</button>` : ''}
      </div>
      <div style="font-size:10px;color:var(--text-tertiary);margin-top:6px;">Configure uma vez. O saldo diario sera calculado automaticamente a partir dai.</div>
    </details>
  </div>`;

  // Cards 14 dias
  html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px;">
    <div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:16px;">
      <div style="font-size:10px;color:var(--text-tertiary);font-weight:700;letter-spacing:1.5px;margin-bottom:8px;">ENTRADAS PREVISTAS (14 DIAS)</div>
      <div style="font-size:22px;font-weight:800;color:var(--success);font-family:'Space Grotesk',monospace;line-height:1;">${fmtR(totalEntradasProx)}</div>
      <div style="font-size:10px;color:var(--text-tertiary);margin-top:6px;">${entradasProx.length} projecao(es)</div>
    </div>
    <div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:16px;">
      <div style="font-size:10px;color:var(--text-tertiary);font-weight:700;letter-spacing:1.5px;margin-bottom:8px;">SAIDA ESTIMADA (14 DIAS)</div>
      <div style="font-size:22px;font-weight:800;color:var(--error);font-family:'Space Grotesk',monospace;line-height:1;">${fmtR(saidaEstimada2sem)}</div>
      <div style="font-size:10px;color:var(--text-tertiary);margin-top:6px;">Media dos ultimos 90 dias</div>
    </div>
  </div>`;

  html += _renderGraficoCaixa();

  // Lista projeções
  html += `<div style="display:flex;justify-content:space-between;align-items:center;margin:20px 0 12px 0;">
    <div style="font-size:12px;font-weight:700;color:var(--text-primary);letter-spacing:1px;">ENTRADAS PREVISTAS</div>
    <button onclick="abrirModalProjecao(null)" class="admin-only" style="background:var(--primary);color:#fff;border:none;border-radius:8px;padding:8px 16px;font-size:12px;font-weight:700;cursor:pointer;">+ ADICIONAR</button>
  </div>`;

  if (!projecoesCaixa.length) {
    html += `<div style="text-align:center;padding:40px 20px;color:var(--text-tertiary);font-size:13px;">Nenhuma entrada prevista. Clique em + ADICIONAR para criar.</div>`;
  } else {
    const sorted = [...projecoesCaixa].sort((a, b) => (a.data_prevista || '').localeCompare(b.data_prevista || ''));
    const obraMap = {};
    obras.forEach(o => obraMap[o.id] = o.nome);
    const tipoLabels = { repasse_cef: 'Repasse CEF', entrada_cliente: 'Entrada cliente', terreno: 'Terreno', extra: 'Outro' };
    html += sorted.map(p => {
      const obraNome  = p.obra_id ? (obraMap[p.obra_id] || 'Obra removida') : 'Geral';
      const tipoLabel = tipoLabels[p.tipo] || esc(p.tipo || '');
      const isPast    = p.data_prevista && p.data_prevista < hoje;
      return `<div style="background:var(--card);border:1px solid ${isPast ? 'rgba(239,68,68,0.3)' : 'var(--border)'};border-radius:10px;padding:14px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
        <div style="flex:1;min-width:180px;">
          <div style="font-size:13px;font-weight:700;color:var(--text-primary);">${tipoLabel}</div>
          <div style="font-size:11px;color:var(--text-tertiary);margin-top:2px;">${esc(obraNome)}${p.descricao ? ' · ' + esc(p.descricao) : ''}</div>
          <div style="font-size:10px;color:${isPast ? 'var(--error)' : 'var(--text-tertiary)'};margin-top:4px;">${fmtData(p.data_prevista)}${isPast ? ' · ATRASADA' : ''}</div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="font-size:18px;font-weight:800;color:var(--success);font-family:'Space Grotesk',monospace;">${fmtR(p.valor)}</div>
          <div class="admin-only" style="display:flex;gap:4px;">
            <button onclick="abrirModalProjecao('${esc(p.id)}')" style="background:rgba(37,99,235,0.1);border:1px solid rgba(37,99,235,0.2);border-radius:6px;padding:4px 10px;color:#3b82f6;font-size:11px;cursor:pointer;" title="Editar"><span class="material-symbols-outlined" style="font-size:14px;">edit</span></button>
            <button onclick="excluirProjecao('${esc(p.id)}')" style="background:rgba(220,38,38,0.1);border:1px solid rgba(220,38,38,0.2);border-radius:6px;padding:4px 10px;color:#ef4444;font-size:11px;cursor:pointer;" title="Excluir"><span class="material-symbols-outlined" style="font-size:14px;">delete</span></button>
          </div>
        </div>
      </div>`;
    }).join('');
  }

  el.innerHTML = html;
}

function _renderGraficoCaixa() {
  const MESES_LABEL = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const hoje = new Date();
  const mesAtual = hoje.getMonth();
  const anoAtual = hoje.getFullYear();
  const mesesArr = [];
  for (let i = -3; i <= 3; i++) {
    let m = mesAtual + i, a = anoAtual;
    while (m < 0) { m += 12; a--; }
    while (m > 11) { m -= 12; a++; }
    mesesArr.push({ ym: a + '-' + String(m + 1).padStart(2, '0'), futuro: i > 0, atual: i === 0 });
  }
  const reps = _getRepassesCef();
  const adds = typeof adicionaisPgtos !== 'undefined' ? adicionaisPgtos : [];
  const lancs = typeof lancamentos !== 'undefined' ? lancamentos : [];
  const dados = mesesArr.map(info => {
    const ym = info.ym;
    const entRepasses   = reps.filter(r => (r.data_credito || '').startsWith(ym)).reduce((s, r) => s + Number(r.valor || 0), 0);
    const entAdicionais = adds.filter(p => (p.data || '').startsWith(ym)).reduce((s, p) => s + Number(p.valor || 0), 0);
    const saidasReais   = lancs.filter(l => (l.data || '').startsWith(ym)).reduce((s, l) => s + Number(l.total || 0), 0);
    const entProjecoes  = projecoesCaixa.filter(p => (p.data_prevista || '').startsWith(ym)).reduce((s, p) => s + Number(p.valor || 0), 0);
    let entradas, saidas;
    if (info.futuro) {
      entradas = entProjecoes + entRepasses;
      saidas = saidasReais > 0 ? saidasReais : _calcMediaSaidaSemanal() * (30 / 7);
    } else {
      entradas = entRepasses + entAdicionais + entProjecoes;
      saidas = saidasReais;
    }
    return { ...info, entradas, saidas };
  });

  let acum = 0;
  const saldos = dados.map(d => { acum += d.entradas - d.saidas; return acum; });
  const idxAtual = dados.findIndex(d => d.atual);
  const offset = _calcSaldoBase() - saldos[idxAtual];
  saldos.forEach((_, i) => saldos[i] += offset);

  const maxVal = Math.max(...dados.map(d => Math.max(d.entradas, d.saidas)), 1);
  const colunas = dados.map((d, i) => {
    const [, m] = d.ym.split('-');
    const hEnt = Math.max((d.entradas / maxVal * 100), d.entradas > 0 ? 4 : 0);
    const hSai = Math.max((d.saidas / maxVal * 100), d.saidas > 0 ? 4 : 0);
    const estiloCol = d.atual ? 'border:2px solid rgba(5,150,105,0.4);border-radius:10px;padding:4px;' : d.futuro ? 'border:2px dashed rgba(5,150,105,0.2);border-radius:10px;padding:4px;opacity:0.6;' : '';
    return `<div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex:1;min-width:40px;${estiloCol}">
      <div style="display:flex;gap:2px;align-items:flex-end;height:80px;width:100%;">
        <div style="flex:1;display:flex;align-items:flex-end;height:100%;"><div style="width:100%;height:${hEnt}%;background:linear-gradient(0deg,var(--primary-hover),var(--primary));border-radius:3px 3px 0 0;" title="Entradas: ${fmtR(d.entradas)}"></div></div>
        <div style="flex:1;display:flex;align-items:flex-end;height:100%;"><div style="width:100%;height:${hSai}%;background:linear-gradient(0deg,#991b1b,var(--error));border-radius:3px 3px 0 0;" title="Saidas: ${fmtR(d.saidas)}"></div></div>
      </div>
      <div style="font-size:9px;color:${d.atual ? 'var(--primary)' : 'var(--text-tertiary)'};font-weight:${d.atual ? '700' : '400'};text-align:center;">${MESES_LABEL[parseInt(m) - 1]}${d.futuro ? '*' : ''}</div>
    </div>`;
  }).join('');

  const pontosSaldo = dados.map((d, i) => {
    const cor = saldos[i] >= 0 ? 'var(--success)' : 'var(--error)';
    return `<div style="flex:1;text-align:center;"><div style="font-size:8px;font-weight:700;color:${cor};">${fmtR(saldos[i], true)}</div></div>`;
  }).join('');

  return `<div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:16px;">
    <div style="font-size:11px;font-weight:700;color:var(--text-primary);letter-spacing:1px;margin-bottom:12px;">FLUXO DE CAIXA — 6 MESES</div>
    <div style="display:flex;gap:4px;align-items:center;margin-bottom:10px;">
      <span style="width:12px;height:12px;background:var(--primary);border-radius:3px;display:inline-block;"></span>
      <span style="font-size:10px;color:var(--text-tertiary);margin-right:12px;">Entradas</span>
      <span style="width:12px;height:12px;background:var(--error);border-radius:3px;display:inline-block;"></span>
      <span style="font-size:10px;color:var(--text-tertiary);margin-right:12px;">Saidas</span>
      <span style="font-size:10px;color:var(--text-tertiary);">* Projetado</span>
    </div>
    <div style="display:flex;gap:6px;align-items:flex-end;overflow-x:auto;padding-bottom:4px;">${colunas}</div>
    <div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border);">
      <div style="font-size:9px;color:var(--text-tertiary);margin-bottom:4px;letter-spacing:1px;">SALDO ACUMULADO</div>
      <div style="display:flex;gap:8px;">${pontosSaldo}</div>
    </div>
  </div>`;
}

// ── MODAL PROJECAO ────────────────────────────────────────────────
function abrirModalProjecao(id) {
  const selObra = document.getElementById('proj-obra');
  if (selObra) {
    selObra.innerHTML = '<option value="">— Geral —</option>' +
      obras.map(o => `<option value="${o.id}">${esc(o.nome)}</option>`).join('');
  }
  if (id) {
    const p = projecoesCaixa.find(x => x.id === id);
    if (!p) return;
    document.getElementById('modal-proj-titulo').textContent = 'Editar entrada prevista';
    document.getElementById('proj-id').value = p.id;
    document.getElementById('proj-tipo').value = p.tipo || 'repasse_cef';
    document.getElementById('proj-valor').value = p.valor || '';
    document.getElementById('proj-data').value = p.data_prevista || '';
    if (selObra) selObra.value = p.obra_id || '';
    document.getElementById('proj-descricao').value = p.descricao || '';
  } else {
    document.getElementById('modal-proj-titulo').textContent = 'Nova entrada prevista';
    document.getElementById('proj-id').value = '';
    document.getElementById('proj-tipo').value = 'repasse_cef';
    document.getElementById('proj-valor').value = '';
    document.getElementById('proj-data').value = '';
    if (selObra) selObra.value = '';
    document.getElementById('proj-descricao').value = '';
  }
  openModal('proj');
}

async function salvarProjecao() {
  const id       = document.getElementById('proj-id').value;
  const tipo     = document.getElementById('proj-tipo').value;
  const valor    = parseFloat(document.getElementById('proj-valor').value);
  const data     = document.getElementById('proj-data').value;
  const obra_id  = document.getElementById('proj-obra').value || null;
  const descricao = document.getElementById('proj-descricao').value.trim();

  if (!valor || valor <= 0) { showToast('Informe o valor.'); return; }
  if (!data) { showToast('Informe a data prevista.'); return; }

  const body = { tipo, valor, data_prevista: data, obra_id, descricao };
  try {
    if (id) {
      await sbPatch('projecoes_caixa', `?id=eq.${id}`, body);
      showToast('Projecao atualizada');
    } else {
      const nova = await sbPost('projecoes_caixa', body);
      if (nova) projecoesCaixa.push(nova);
      showToast('Entrada prevista salva');
    }
    fecharModal('proj');
    await _loadProjecoes();
    renderCaixa();
  } catch(e) {
    console.error(e);
    showToast('Nao foi possivel salvar.');
  }
}

async function excluirProjecao(id) {
  if (!confirm('Excluir esta projecao?')) return;
  try {
    await sbDelete('projecoes_caixa', `?id=eq.${id}`);
    projecoesCaixa = projecoesCaixa.filter(p => p.id !== id);
    showToast('Projecao excluida');
    renderCaixa();
  } catch(e) {
    console.error(e);
    showToast('Nao foi possivel excluir.');
  }
}

// ─────────────────────────────────────────────────────────────────
// REGISTRO NO VIEW REGISTRY
// ─────────────────────────────────────────────────────────────────
if (typeof viewRegistry !== 'undefined') {
  viewRegistry.register('contas-pagar', async () => {
    if (!contasPagar.length) await _loadContasPagar();
    renderContasPagar();
  });

  viewRegistry.register('caixa', async () => {
    if (!contasPagar.length) await _loadContasPagar();
    await _loadProjecoes();
    renderCaixa();
  });
}
