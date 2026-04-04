// ══════════════════════════════════════════
// EDR SYSTEM V2 — INFRAESTRUTURA (Supabase bridge + UI helpers)
// Carrega ANTES de todos os módulos
// ══════════════════════════════════════════

// ── SUPABASE CONFIG ──────────────────────
const SUPABASE_URL = 'https://mepzoxoahpwcvvlymlfh.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Z9E8KLU8ZIMcWjD-bMG5gg_eM585qWq';

let _supabaseToken = null;

function _sbHeaders(preferOverride) {
  return {
    'apikey': SUPABASE_KEY,
    'Authorization': 'Bearer ' + (_supabaseToken || SUPABASE_KEY),
    'Content-Type': 'application/json',
    'Prefer': preferOverride || 'return=representation'
  };
}

// ── MULTI-TENANT ────────────────────────
const _TABELAS_SEM_TENANT = ['companies', 'company_users', 'usuarios'];
const _TABELAS_COM_GLOBAL = ['materiais'];

function _addCompanyFilter(tabela, query) {
  if (_TABELAS_SEM_TENANT.includes(tabela)) return query;
  if (!_companyId) {
    const sep = query.includes('?') ? '&' : '?';
    return query + sep + 'company_id=eq.00000000-0000-0000-0000-000000000000';
  }
  const sep = query.includes('?') ? '&' : '?';
  if (_TABELAS_COM_GLOBAL.includes(tabela)) {
    return query + sep + 'or=(company_id.eq.' + _companyId + ',company_id.is.null)';
  }
  return query + sep + 'company_id=eq.' + _companyId;
}

function _addCompanyToBody(tabela, body) {
  if (_TABELAS_SEM_TENANT.includes(tabela) || !_companyId) return body;
  if (Array.isArray(body)) return body.map(b => ({ company_id: _companyId, ...b }));
  return { company_id: _companyId, ...body };
}

const _TABELAS_RASTREIO = ['lancamentos','notas_fiscais','distribuicoes','entradas_diretas','repasses_cef','obra_adicionais','adicional_pagamentos','diarias'];
function _addCriadoPor(t, b) {
  if (_TABELAS_RASTREIO.includes(t) && usuarioAtual?.nome) b.criado_por = usuarioAtual.nome;
  return b;
}

// ── SUPABASE REST HELPERS (multi-tenant) ──
async function sbGet(t, q='') {
  // Compatibilidade: se query veio dentro do t (ex: 'materiais?order=x'), separar
  if (q === '' && t.includes('?')) { const i = t.indexOf('?'); q = t.substring(i); t = t.substring(0, i); }
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${t}${_addCompanyFilter(t, q)}`, { headers: _sbHeaders() });
    if (!r.ok) { console.warn('sbGet erro:', r.status, t); return []; }
    return await r.json();
  } catch (e) { console.warn('sbGet falha:', t, e); return []; }
}

async function sbPost(t, b) {
  _addCriadoPor(t, b);
  b = _addCompanyToBody(t, b);
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${t}`, {
      method: 'POST', headers: _sbHeaders(), body: JSON.stringify(b)
    });
    if (!r.ok) { console.warn('sbPost erro:', r.status, t); return null; }
    const data = await r.json();
    return Array.isArray(data) ? data[0] : data;
  } catch (e) { console.warn('sbPost falha:', t, e); return null; }
}

async function sbPostMinimal(t, b) {
  if (Array.isArray(b)) b.forEach(item => _addCriadoPor(t, item)); else _addCriadoPor(t, b);
  b = _addCompanyToBody(t, b);
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${t}`, {
      method: 'POST', headers: _sbHeaders('return=minimal'), body: JSON.stringify(b)
    });
    if (!r.ok) { console.warn('sbPostMinimal erro:', r.status, t); return false; }
    return true;
  } catch (e) { console.warn('sbPostMinimal falha:', t, e); return false; }
}

async function sbPatch(t, q, b) {
  // Compatibilidade: se chamado com 2 args (path+query, body), ajustar
  if (b === undefined && typeof q === 'object') { b = q; q = ''; }
  // Compatibilidade: se query veio dentro do t, separar
  if ((!q || q === '') && t.includes('?')) { const i = t.indexOf('?'); q = t.substring(i); t = t.substring(0, i); }
  // Compatibilidade: se q é UUID solto (sem ? ou =), virar ?id=eq.UUID
  if (q && !q.includes('=') && !q.startsWith('?')) q = '?id=eq.' + q;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${t}${_addCompanyFilter(t, q||'')}`, {
      method: 'PATCH', headers: _sbHeaders(), body: JSON.stringify(b)
    });
    if (!r.ok) { console.warn('sbPatch erro:', r.status, t); return null; }
    const data = await r.json();
    return Array.isArray(data) ? data[0] : data;
  } catch (e) { console.warn('sbPatch falha:', t, e); return null; }
}

async function sbDelete(t, q='') {
  // Compatibilidade: se q é UUID solto, virar ?id=eq.UUID
  if (q && !q.includes('=') && !q.startsWith('?')) q = '?id=eq.' + q;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${t}${_addCompanyFilter(t, q)}`, {
      method: 'DELETE', headers: _sbHeaders()
    });
    return r.ok;
  } catch (e) { console.warn('sbDelete falha:', t, e); return false; }
}

// ── CONFIRMAR (substitui confirm() nativo) ──
function confirmar(msg, onSim, onNao) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay active';
  overlay.innerHTML = `
    <div class="modal-box" style="max-width:420px;">
      <div class="modal-header">
        <span class="modal-title">Confirmar</span>
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>
      <div class="modal-body">
        <p style="font-size:14px; color:var(--text-primary); line-height:1.6;">${msg}</p>
      </div>
      <div class="modal-footer">
        <button class="btn" style="color:var(--text-secondary);" id="_conf-nao">Cancelar</button>
        <button class="btn btn-primary" id="_conf-sim">Confirmar</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector('#_conf-sim').onclick = () => { overlay.remove(); if (onSim) onSim(); };
  overlay.querySelector('#_conf-nao').onclick = () => { overlay.remove(); if (onNao) onNao(); };
  overlay.addEventListener('keydown', e => { if (e.key === 'Escape') overlay.remove(); });
}

// ── SHOW MODAL (genérico) ────────────────
function showModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}

// ── STUBS (funções esperadas pelos módulos V1→V2) ──
function aplicarPerfil() { /* V2: perfil controlado via PERFIL_VIEWS no shell */ }
function getHdrs(preferOverride) { return _sbHeaders(preferOverride); }

// ── GLOBALS V1 (usadas por notas, estoque, diárias) ──
let notas = [];
let _companyId = null;
async function loadCompanyId() {
  try {
    const rows = await fetch(`${SUPABASE_URL}/rest/v1/company_users?user_id=eq.${usuarioAtual.id}&select=company_id&limit=1`, { headers: _sbHeaders() }).then(r => r.json());
    if (rows && rows.length > 0) _companyId = rows[0].company_id;
  } catch(e) { console.warn('loadCompanyId erro:', e); }
}
const COMPANY_DEFAULTS = {
  estoqueGeral: 'EDR',
  escritorio: 'EDR_ESCRITORIO',
  estoqueLabel: 'EDR ENGENHARIA',
  escritorioLabel: 'EDR ESCRITÓRIO'
};

// ── USUARIO ATUAL (preenchido pelo auth.js após login) ──
const usuarioAtual = {
  id: null,
  nome: '',
  email: '',
  perfil: 'operacional',
  empresa_id: null
};
