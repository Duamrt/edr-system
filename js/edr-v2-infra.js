// ══════════════════════════════════════════
// EDR SYSTEM V2 — INFRAESTRUTURA (Supabase bridge + UI helpers)
// Carrega ANTES de todos os módulos
// ══════════════════════════════════════════
(function(){const v=(document.currentScript?.src||'').match(/\?v=(\d+)/)?.[1]||'?';console.log('%c EDR System %c v'+v+' ','background:#14532d;color:#4ade80;font-weight:700;padding:3px 7px;border-radius:3px 0 0 3px','background:#4ade80;color:#14532d;font-weight:700;padding:3px 7px;border-radius:0 3px 3px 0');})();

// ── SUPABASE CONFIG ──────────────────────
const SUPABASE_URL = 'https://mepzoxoahpwcvvlymlfh.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Z9E8KLU8ZIMcWjD-bMG5gg_eM585qWq';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1lcHpveG9haHB3Y3Z2bHltbGZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyNzAyMDUsImV4cCI6MjA4Nzg0NjIwNX0.2_4hqT2vzM5Dw3iesOF_5V7esxkZafDnMFpDkCSBVlE';
const SUPABASE_SERVICE_KEY = '';

let _supabaseToken = null;

function _sbHeaders(preferOverride) {
  return {
    'apikey': SUPABASE_KEY,
    'Authorization': 'Bearer ' + (_supabaseToken || SUPABASE_KEY),
    'Content-Type': 'application/json',
    'Prefer': preferOverride || 'return=representation'
  };
}

// ── MULTI-TENANT ─────────────────────────────────────────────
const _TABELAS_SEM_TENANT = ['companies', 'company_users', 'usuarios', 'tracker_sync'];
// Tabelas que pertencem a um tenant — leituras filtradas por company_id
const _TABELAS_TENANT = new Set(['lancamentos','notas_fiscais','distribuicoes','entradas_diretas','repasses_cef','obra_adicionais','adicional_pagamentos','diarias','obras','projecoes_caixa','ajustes_estoque','garantia_chamados','diarias_funcionarios','diarias_quinzenas','diarias_extras','leads','lead_historico']);

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

// ── SUPABASE REST HELPERS ─────────────────────────────────────
async function sbGet(t, q='') {
  // Compatibilidade: query pode vir junto no t (ex: 'tabela?order=x')
  if (q === '' && t.includes('?')) { const i = t.indexOf('?'); q = t.substring(i); t = t.substring(0, i); }
  // Filtro automático por empresa para tabelas tenant-específicas
  if (_companyId && _TABELAS_TENANT.has(t)) {
    q = q ? q + '&company_id=eq.' + _companyId : '?company_id=eq.' + _companyId;
  }
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
    if (!r.ok) { const errBody = await r.json().catch(()=>{}); console.warn('sbPost erro:', r.status, t, errBody); return null; }
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
    if (!r.ok) { r.text().then(body => console.warn('sbPatch erro:', r.status, t, body)); return null; }
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

// ── SANITIZAÇÃO DE TEXTO PARA BANCO ─────────────────────────
// Remove acentos, cedilhas e converte para CAIXA ALTA
// Deve ser usada antes de gravar materiais, fornecedores e descrições de obra
function sanitizarTexto(str) {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // remove diacríticos (acentos, til, etc.)
    .replace(/ç/gi, 'c')              // cedilha (pré-normalização, caso não decomponha)
    .toUpperCase()
    .trim();
}

// ── CONFIRMAR (substitui confirm() nativo) — retorna Promise ──
function confirmar(msg, onSim, onNao) {
  return new Promise(resolve => {
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
    const fechar = (val) => { overlay.remove(); resolve(val); if (val && onSim) onSim(); if (!val && onNao) onNao(); };
    overlay.querySelector('#_conf-sim').onclick = () => fechar(true);
    overlay.querySelector('#_conf-nao').onclick = () => fechar(false);
    overlay.querySelector('.modal-close').onclick = () => fechar(false);
    overlay.addEventListener('keydown', e => { if (e.key === 'Escape') fechar(false); });
  });
}

// ── SHOW MODAL (genérico) ────────────────
function showModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add('active');
  setTimeout(() => {
    const first = el.querySelector('input:not([type=hidden]):not([readonly]), select, textarea');
    if (first) first.focus();
  }, 80);
}

// ── STUBS (funções esperadas pelos módulos V1→V2) ──
function aplicarPerfil() { /* V2: perfil controlado via PERFIL_VIEWS no shell */ }
function getHdrs(preferOverride) { return _sbHeaders(preferOverride); }

// ── GLOBALS V1 (usadas por todos os módulos) ──
let obras = [], obrasArquivadas = [], notas = [], lancamentos = [], distribuicoes = [];
let entradasDiretas = [], catalogoMateriais = [], repassesCef = [], ajustesEstoque = [];
let obrasAdicionais = [], adicionaisPgtos = [];
let itensForm = [], distItemAtual = null, currentCredito = null, currentCodigo = null;
let acSelectedIdx = -1, acFornIdx = -1, cachedFornecedores = [], cachedItens = [];
let obraFiltroAtual = null, catFiltroAtual = null;
let USUARIOS = [];
let _companyId = null;
let _isSuperAdmin = false;
let MODO_DEMO = false;

// ── TELEGRAM ──
const TG_BOT = '8644194982:AAH6-26NFAbYYtq4TM45hOapqqMguid9qpI';
const TG_CHAT_EDR = '-5239426430';
function notificarTelegram(chatId, texto) {
  fetch('https://api.telegram.org/bot' + TG_BOT + '/sendMessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: texto, parse_mode: 'HTML' })
  }).catch(() => {});
}

// ── PLANOS E LIMITES ──
const PLANOS = {
  trial:        { nome: 'Trial',        obras: 1,   usuarios: 3   },
  essencial:    { nome: 'Essencial',    obras: 3,   usuarios: 5   },
  profissional: { nome: 'Profissional', obras: 5,   usuarios: 10  },
  construtora:  { nome: 'Construtora', obras: 999, usuarios: 999 }
};
let _companyPlan = null;

async function loadCompanyPlan() {
  if (MODO_DEMO || !_companyId) return;
  try {
    const r = await sbGet('companies', '?id=eq.' + _companyId + '&select=plan,trial_ends_at,permissions,name');
    if (r && r[0]) {
      _companyPlan = r[0];
      if (typeof _aplicarPermissoesBanco === 'function') _aplicarPermissoesBanco(r[0].permissions);
      const el = document.getElementById('sidebar-company-name');
      if (el && r[0].name) el.textContent = r[0].name;
    }
  } catch(e) { console.error('loadCompanyPlan:', e); }
}
function getLimites() {
  const plan = _companyPlan?.plan || 'trial';
  return PLANOS[plan] || PLANOS.trial;
}
function isPlatformAdmin() { return _isSuperAdmin; }

async function checarLimiteObras() {
  if (isPlatformAdmin()) return true;
  const lim = getLimites();
  const obrasAtivas = obras.filter(o => !o.arquivada);
  if (obrasAtivas.length >= lim.obras) {
    const plano = _companyPlan?.plan || 'trial';
    const nomePlano = PLANOS[plano]?.nome || plano;
    alert('Limite de obras atingido no plano ' + nomePlano + ' (' + lim.obras + ' obra' + (lim.obras > 1 ? 's' : '') + ').\n\nFale com o suporte para fazer upgrade.');

    return false;
  }
  return true;
}
async function checarLimiteUsuarios() {
  if (isPlatformAdmin()) return true;
  const lim = getLimites();
  try {
    const users = await sbGet('company_users', '?company_id=eq.' + _companyId + '&select=id');
    if (users && users.length >= lim.usuarios) {
      const plano = _companyPlan?.plan || 'trial';
      alert('Limite de usuários atingido no plano ' + (PLANOS[plano]?.nome || plano) + ' (' + lim.usuarios + ').\n\nFaça upgrade para adicionar mais membros.');
      return false;
    }
  } catch(e) { console.error('checarLimiteUsuarios:', e); }
  return true;
}

// ── ADICIONAIS (helpers compartilhados) ──
function getAdicionaisObra(obraId) {
  const lista = obrasAdicionais.filter(a => a.obra_id === obraId);
  const valorTotal = lista.reduce((s, a) => s + Number(a.valor || 0), 0);
  const pgtos = adicionaisPgtos.filter(p => lista.some(a => a.id === p.adicional_id));
  const totalRecebido = pgtos.reduce((s, p) => s + Number(p.valor || 0), 0);
  const saldo = valorTotal - totalRecebido;
  return { qtd: lista.length, valorTotal, totalRecebido, saldo };
}
function getAdicionaisGeral(obraIds) {
  const set = obraIds instanceof Set ? obraIds : new Set(obraIds);
  const lista = obrasAdicionais.filter(a => set.has(a.obra_id));
  const valorTotal = lista.reduce((s, a) => s + Number(a.valor || 0), 0);
  const pgtos = adicionaisPgtos.filter(p => lista.some(a => a.id === p.adicional_id));
  const totalRecebido = pgtos.reduce((s, p) => s + Number(p.valor || 0), 0);
  return { valorTotal, totalRecebido, saldo: valorTotal - totalRecebido };
}
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
async function loadLancamentos() { try { lancamentos = await sbGet('lancamentos', '?select=id,obra_id,descricao,qtd,preco,total,data,obs,etapa,criado_por,nota_id&order=data.desc&limit=10000'); if (!Array.isArray(lancamentos)) lancamentos = []; } catch(e) { lancamentos = []; } }
async function loadDistribuicoes() { try { const r = await sbGet('distribuicoes', '?order=criado_em.desc'); distribuicoes = Array.isArray(r) ? r : []; } catch(e) { distribuicoes = []; } }
async function loadEntradasDiretas() { try { const r = await sbGet('entradas_diretas', '?order=criado_em.desc'); entradasDiretas = Array.isArray(r) ? r : []; } catch(e) { entradasDiretas = []; } }
async function loadMateriais() { try { const r = await sbGet('materiais', '?order=codigo&limit=1000'); catalogoMateriais = Array.isArray(r) ? r : []; } catch(e) { catalogoMateriais = []; } }
async function loadRepassesCef() { try { repassesCef = await sbGet('repasses_cef', '?order=data_credito.desc'); if (!Array.isArray(repassesCef)) repassesCef = []; } catch(e) { repassesCef = []; } }
async function loadAjustesEstoque() { try { const r = await sbGet('ajustes_estoque', '?order=criado_em.desc'); ajustesEstoque = Array.isArray(r) ? r : []; } catch(e) { ajustesEstoque = []; } }
async function loadAdicionais() {
  try { const r = await sbGet('obra_adicionais', '?order=criado_em.desc'); obrasAdicionais = Array.isArray(r) ? r : []; } catch(e) { obrasAdicionais = []; }
  try { const r = await sbGet('adicional_pagamentos', '?order=data.desc'); adicionaisPgtos = Array.isArray(r) ? r : []; } catch(e) { adicionaisPgtos = []; }
}

function _trialExpiradoEDR() {
  if (!_companyPlan) return false;
  const plan = _companyPlan.plan;
  if (['essencial', 'profissional', 'construtora'].includes(plan)) return false;
  if (plan === 'trial' && _companyPlan.trial_ends_at) {
    const hoje = new Date().toISOString().split('T')[0];
    const fim = _companyPlan.trial_ends_at.split('T')[0];
    return fim < hoje;
  }
  return false;
}

function _mostrarBloqueioEDR() {
  const empresa = _companyPlan?.name || 'Sua Empresa';
  const fimRaw = _companyPlan?.trial_ends_at || '';
  const fimFmt = fimRaw
    ? new Date(fimRaw + 'T12:00:00').toLocaleDateString('pt-BR')
    : '';

  // Esconde sidebar e conteúdo principal
  const sidebar = document.querySelector('.sidebar');
  const main = document.querySelector('.main-content, #main-content, main');
  if (sidebar) sidebar.style.display = 'none';
  if (main) main.style.display = 'none';

  const overlay = document.createElement('div');
  overlay.id = 'edr-trial-block';
  overlay.style.cssText = [
    'position:fixed;inset:0;z-index:99999',
    'background:#F0FDF4',
    'display:flex;align-items:center;justify-content:center',
    'padding:24px',
    'font-family:Inter,sans-serif'
  ].join(';');

  overlay.innerHTML = `
    <div style="width:100%;max-width:420px;">

      <!-- Logo EDR System -->
      <div style="text-align:center;margin-bottom:32px;">
        <div style="font-family:'Plus Jakarta Sans',Inter,sans-serif;font-size:22px;font-weight:800;color:#1A1D23;letter-spacing:-.5px;">
          EDR <span style="color:#2D6A4F;">System</span>
        </div>
        <div style="font-size:11px;color:#9CA3AF;letter-spacing:2px;text-transform:uppercase;margin-top:2px;">
          Gestão de Obras
        </div>
      </div>

      <!-- Card -->
      <div style="background:#fff;border:1px solid #E5E7EB;border-radius:8px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.07);">

        <!-- Faixa vermelha -->
        <div style="background:rgba(220,38,38,0.08);border-bottom:1px solid rgba(220,38,38,0.15);padding:10px 24px;display:flex;align-items:center;gap:8px;">
          <div style="width:6px;height:6px;border-radius:50%;background:#DC2626;flex-shrink:0;box-shadow:0 0 6px #DC2626;"></div>
          <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#DC2626;">Acesso Suspenso</span>
        </div>

        <div style="padding:28px 24px;">

          <!-- Empresa -->
          <div style="margin-bottom:20px;">
            <div style="font-family:'Plus Jakarta Sans',Inter,sans-serif;font-size:20px;font-weight:800;color:#111827;margin-bottom:4px;">${empresa}</div>
            <div style="display:flex;align-items:center;gap:14px;font-size:12px;">
              <span style="color:#9CA3AF;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Trial</span>
              ${fimFmt ? `<span style="color:#DC2626;font-weight:600;">Expirou em ${fimFmt}</span>` : ''}
            </div>
          </div>

          <!-- Separador -->
          <div style="height:1px;background:#F3F4F6;margin-bottom:20px;"></div>

          <!-- Mensagem -->
          <p style="font-size:14px;color:#6B7280;line-height:1.65;margin-bottom:24px;">
            Seu período de teste gratuito encerrou. Para reativar o acesso e continuar usando o EDR System, entre em contato e escolha um plano.
          </p>

          <!-- Botão WhatsApp -->
          <a href="https://wa.me/5587981713987" target="_blank"
             style="display:flex;align-items:center;justify-content:center;gap:10px;width:100%;background:#2D6A4F;color:#fff;font-size:15px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;padding:13px 20px;border-radius:6px;text-decoration:none;margin-bottom:10px;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
              <path d="M12 0C5.373 0 0 5.373 0 12c0 2.124.558 4.115 1.535 5.836L.057 23.215a.75.75 0 0 0 .93.927l5.487-1.461A11.943 11.943 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.891 0-3.667-.5-5.207-1.377l-.374-.213-3.876 1.032 1.056-3.773-.228-.37A9.944 9.944 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
            </svg>
            Falar no WhatsApp
          </a>

          <!-- Botão secundário -->
          <a href="landing.html"
             style="display:flex;align-items:center;justify-content:center;width:100%;background:none;color:#6B7280;font-size:13px;padding:10px;border-radius:6px;text-decoration:none;border:1px solid #E5E7EB;">
            Ver planos e preços
          </a>

        </div>

        <!-- Rodapé -->
        <div style="background:#F9FAFB;border-top:1px solid #E5E7EB;padding:12px 24px;display:flex;align-items:center;justify-content:space-between;">
          <span style="font-size:11px;color:#9CA3AF;">A partir de R$ 197/mês</span>
          <span style="font-size:11px;color:#9CA3AF;">(87) 9 8171-3987</span>
        </div>

      </div>
    </div>`;

  document.body.appendChild(overlay);

  // Bloqueia ESC e clique fora
  document.addEventListener('keydown', e => { if (e.key === 'Escape') e.stopImmediatePropagation(); }, true);
}

async function iniciarApp() {
  console.log('[INFRA] iniciarApp chamado');
  await loadObras();
  console.log('[INFRA] obras carregadas:', obras.length, 'arquivadas:', obrasArquivadas.length);
  await Promise.all([
    loadNotas().catch(e => console.warn('loadNotas:', e)),
    loadLancamentos().catch(e => console.warn('loadLancamentos:', e)),
    loadDistribuicoes().catch(e => console.warn('loadDistribuicoes:', e)),
    loadEntradasDiretas().catch(e => console.warn('loadEntradasDiretas:', e)),
    loadMateriais().catch(e => console.warn('loadMateriais:', e)),
    loadRepassesCef().catch(e => console.warn('loadRepassesCef:', e)),
    loadAjustesEstoque().catch(e => console.warn('loadAjustesEstoque:', e)),
    loadAdicionais().catch(e => console.warn('loadAdicionais:', e)),
    loadCompanyPlan().catch(e => console.warn('loadCompanyPlan:', e))
  ]);
  console.log('[INFRA] Promise.all concluido. notas:', notas.length, 'lancamentos:', lancamentos.length, 'materiais:', catalogoMateriais.length);
  // Checar trial expirado (plataforma admin nunca é bloqueada)
  const _isAdmin = usuarioAtual?.email === 'admin@edreng.com.br';
  if (!_isAdmin && _trialExpiradoEDR()) {
    _mostrarBloqueioEDR();
    return;
  }
  // Sincronizar AdicionaisModule com globais carregadas no boot
  if (typeof AdicionaisModule !== 'undefined') {
    AdicionaisModule.adicionais = obrasAdicionais;
    AdicionaisModule.pagamentos = adicionaisPgtos;
    AdicionaisModule._loaded = true;
  }
  if (typeof populateSelects === 'function') populateSelects();
  if (typeof setToday === 'function') setToday();
  console.log('[INFRA] iniciarApp CONCLUIDO');
}

// ── USUARIO ATUAL (preenchido pelo auth.js após login) ──
const usuarioAtual = {
  id: null,
  nome: '',
  email: '',
  perfil: 'operacional',
  empresa_id: null
};
