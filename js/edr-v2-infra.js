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

// ── MULTI-TENANT (só para INSERTs — RLS cuida das leituras) ──
const _TABELAS_SEM_TENANT = ['companies', 'company_users', 'usuarios'];

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

// ── SUPABASE REST HELPERS (RLS filtra por empresa) ──
async function sbGet(t, q='') {
  // Compatibilidade: query pode vir junto no t (ex: 'tabela?order=x')
  if (q === '' && t.includes('?')) { const i = t.indexOf('?'); q = t.substring(i); t = t.substring(0, i); }
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${t}${q}`, { headers: _sbHeaders() });
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
  // Compatibilidade: 2 args (path, body) ou 3 args (tabela, query, body)
  if (b === undefined && typeof q === 'object') { b = q; q = ''; }
  if ((!q || q === '') && t.includes('?')) { const i = t.indexOf('?'); q = t.substring(i); t = t.substring(0, i); }
  if (q && !q.includes('=') && !q.startsWith('?')) q = '?id=eq.' + q;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${t}${q||''}`, {
      method: 'PATCH', headers: _sbHeaders(), body: JSON.stringify(b)
    });
    if (!r.ok) { console.warn('sbPatch erro:', r.status, t); return null; }
    const data = await r.json();
    return Array.isArray(data) ? data[0] : data;
  } catch (e) { console.warn('sbPatch falha:', t, e); return null; }
}

async function sbDelete(t, q='') {
  if (q && !q.includes('=') && !q.startsWith('?')) q = '?id=eq.' + q;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${t}${q}`, {
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

// ── GLOBALS V1 (usadas por todos os módulos) ──
let obras = [], obrasArquivadas = [], notas = [], lancamentos = [], distribuicoes = [];
let entradasDiretas = [], catalogoMateriais = [], repassesCef = [], ajustesEstoque = [];
let itensForm = [], distItemAtual = null, currentCredito = null, currentCodigo = null;
let acSelectedIdx = -1, acFornIdx = -1, cachedFornecedores = [], cachedItens = [];
let obraFiltroAtual = null, catFiltroAtual = null;
let USUARIOS = [];
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

// ── CARGA DE DADOS GLOBAL (chamada após login) ──
async function loadObras() {
  try {
    const todas = await sbGet('obras', '?select=*&order=nome');
    obrasArquivadas = Array.isArray(todas) ? todas.filter(o => o.arquivada) : [];
    obras = Array.isArray(todas) ? todas.filter(o => !o.arquivada) : [];
  } catch(e) { obras = []; obrasArquivadas = []; }
}
async function loadNotas() { try { notas = await sbGet('notas_fiscais', '?order=criado_em.desc'); if (!Array.isArray(notas)) notas = []; } catch(e) { notas = []; } }
async function loadLancamentos() { try { lancamentos = await sbGet('lancamentos', '?select=id,obra_id,descricao,qtd,preco,total,data,obs,etapa,criado_por&order=data.desc'); if (!Array.isArray(lancamentos)) lancamentos = []; } catch(e) { lancamentos = []; } }
async function loadDistribuicoes() { try { const r = await sbGet('distribuicoes', '?order=criado_em.desc'); distribuicoes = Array.isArray(r) ? r : []; } catch(e) { distribuicoes = []; } }
async function loadEntradasDiretas() { try { const r = await sbGet('entradas_diretas', '?order=criado_em.desc'); entradasDiretas = Array.isArray(r) ? r : []; } catch(e) { entradasDiretas = []; } }
async function loadMateriais() { try { const r = await sbGet('materiais', '?order=codigo&limit=1000'); catalogoMateriais = Array.isArray(r) ? r : []; } catch(e) { catalogoMateriais = []; } }
async function loadRepassesCef() { try { repassesCef = await sbGet('repasses_cef', '?order=data_credito.desc'); if (!Array.isArray(repassesCef)) repassesCef = []; } catch(e) { repassesCef = []; } }
async function loadAjustesEstoque() { try { const r = await sbGet('ajustes_estoque', '?order=criado_em.desc'); ajustesEstoque = Array.isArray(r) ? r : []; } catch(e) { ajustesEstoque = []; } }

async function iniciarApp() {
  await loadObras();
  await Promise.all([
    loadNotas().catch(e => console.warn('loadNotas:', e)),
    loadLancamentos().catch(e => console.warn('loadLancamentos:', e)),
    loadDistribuicoes().catch(e => console.warn('loadDistribuicoes:', e)),
    loadEntradasDiretas().catch(e => console.warn('loadEntradasDiretas:', e)),
    loadMateriais().catch(e => console.warn('loadMateriais:', e)),
    loadRepassesCef().catch(e => console.warn('loadRepassesCef:', e)),
    loadAjustesEstoque().catch(e => console.warn('loadAjustesEstoque:', e))
  ]);
  if (typeof populateSelects === 'function') populateSelects();
  if (typeof setToday === 'function') setToday();
}

// ── USUARIO ATUAL (preenchido pelo auth.js após login) ──
const usuarioAtual = {
  id: null,
  nome: '',
  email: '',
  perfil: 'operacional',
  empresa_id: null
};
