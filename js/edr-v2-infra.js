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

// ── SUPABASE REST HELPERS ────────────────
async function sbGet(path) {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: _sbHeaders() });
    if (!r.ok) { console.warn('sbGet erro:', r.status, path); return []; }
    return await r.json();
  } catch (e) { console.warn('sbGet falha:', path, e); return []; }
}

async function sbPost(path, body) {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      method: 'POST', headers: _sbHeaders(), body: JSON.stringify(body)
    });
    if (!r.ok) { console.warn('sbPost erro:', r.status, path); return null; }
    const data = await r.json();
    return Array.isArray(data) ? data[0] : data;
  } catch (e) { console.warn('sbPost falha:', path, e); return null; }
}

async function sbPatch(path, body) {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      method: 'PATCH', headers: _sbHeaders(), body: JSON.stringify(body)
    });
    if (!r.ok) { console.warn('sbPatch erro:', r.status, path); return null; }
    const data = await r.json();
    return Array.isArray(data) ? data[0] : data;
  } catch (e) { console.warn('sbPatch falha:', path, e); return null; }
}

async function sbDelete(path) {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      method: 'DELETE', headers: _sbHeaders()
    });
    return r.ok;
  } catch (e) { console.warn('sbDelete falha:', path, e); return false; }
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
async function loadCompanyId() { /* staging: sem multi-tenant ainda */ }
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
