// ══════════════════════════════════════════════════════════════
// EDR System V2 — AUTH (Supabase Auth)
// Login, sessão, refresh, logout
// Depende: edr-v2-infra.js (SUPABASE_URL, SUPABASE_KEY, _supabaseToken, usuarioAtual)
// ══════════════════════════════════════════════════════════════

let _refreshTimer = null;

// ── LOGIN ────────────────────────────────────────────────────
async function fazerLogin() {
  const u = document.getElementById('login-user').value.trim().toLowerCase();
  const s = document.getElementById('login-pass').value;
  const btn = document.getElementById('login-btn');
  const errEl = document.getElementById('login-error');
  if (!u || !s) { errEl.textContent = 'Informe email e senha.'; return; }
  if (btn) { btn.disabled = true; btn.textContent = 'AGUARDE...'; }
  errEl.textContent = '';

  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: u, password: s })
    });
    const data = await r.json();
    if (!r.ok || !data.access_token) {
      errEl.textContent = 'Usuário ou senha incorretos.';
      if (btn) { btn.disabled = false; btn.textContent = 'ENTRAR'; }
      return;
    }
    // Setar token global (infra.js usa no header Authorization)
    _supabaseToken = data.access_token;

    // Dados do usuário
    const meta = data.user?.user_metadata || {};
    usuarioAtual.id = data.user.id;
    usuarioAtual.nome = meta.nome || u;
    usuarioAtual.email = data.user.email || u;
    usuarioAtual.perfil = meta.perfil || 'operacional';

    // Persistir sessão
    try {
      localStorage.setItem('edr_auth', JSON.stringify({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: Date.now() + (data.expires_in * 1000),
        user: usuarioAtual
      }));
    } catch(e) {}

    // Agendar refresh
    _agendarRefresh(data.expires_in, data.refresh_token);

    // Carregar company_id e dados
    await _carregarCompanyId();
    await iniciarApp();

    // Entrar no app
    _entrarNoApp();
  } catch(e) {
    console.error('Erro no login:', e);
    errEl.textContent = 'Erro de conexão. Tente novamente.';
  }
  if (btn) { btn.disabled = false; btn.textContent = 'ENTRAR'; }
}

// ── ENTRAR NO APP ────────────────────────────────────────────
function _entrarNoApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app-shell').style.display = '';
  if (typeof updateShellUser === 'function') {
    updateShellUser(usuarioAtual.nome, usuarioAtual.perfil);
  }
  // Restaurar última view ou ir pro dashboard
  const lastView = localStorage.getItem('edr_last_view');
  if (typeof setView === 'function') setView(lastView || 'dashboard');
}

// ── LOGOUT ───────────────────────────────────────────────────
function fazerLogout() {
  _supabaseToken = null;
  _companyId = null;
  if (_refreshTimer) clearTimeout(_refreshTimer);
  try { localStorage.removeItem('edr_auth'); } catch(e) {}
  document.getElementById('app-shell').style.display = 'none';
  document.getElementById('login-screen').style.display = '';
  document.getElementById('login-user').value = '';
  document.getElementById('login-pass').value = '';
  document.getElementById('login-error').textContent = '';
}

// ── SESSÃO: verificar + restaurar ────────────────────────────
function verificarSessao() {
  try {
    const s = localStorage.getItem('edr_auth');
    if (!s) return false;
    const sess = JSON.parse(s);
    if (!sess || !sess.access_token) return false;

    _supabaseToken = sess.access_token;
    Object.assign(usuarioAtual, sess.user);

    if (sess.expires_at && Date.now() > sess.expires_at) {
      // Token expirado — tentar refresh
      if (sess.refresh_token) {
        _refreshAuthToken(sess.refresh_token).then(ok => {
          if (!ok) fazerLogout();
        });
      }
      return true; // entra com dados locais enquanto refresh roda
    }
    // Token válido
    const restante = Math.max(Math.floor((sess.expires_at - Date.now()) / 1000), 60);
    _agendarRefresh(restante, sess.refresh_token);
    return true;
  } catch(e) {
    try { localStorage.removeItem('edr_auth'); } catch(e2) {}
    return false;
  }
}

// ── REFRESH TOKEN ────────────────────────────────────────────
async function _refreshAuthToken(refreshToken) {
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken })
    });
    if (!r.ok) return false;
    const data = await r.json();
    if (!data.access_token) return false;
    _supabaseToken = data.access_token;
    const meta = data.user?.user_metadata || {};
    usuarioAtual.id = data.user.id;
    usuarioAtual.nome = meta.nome || usuarioAtual.nome;
    usuarioAtual.perfil = meta.perfil || usuarioAtual.perfil;
    try {
      localStorage.setItem('edr_auth', JSON.stringify({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: Date.now() + (data.expires_in * 1000),
        user: usuarioAtual
      }));
    } catch(e) {}
    _agendarRefresh(data.expires_in, data.refresh_token);
    return true;
  } catch(e) { return false; }
}

function _agendarRefresh(expiresInSec, refreshToken) {
  if (_refreshTimer) clearTimeout(_refreshTimer);
  const ms = Math.max((expiresInSec - 60) * 1000, 30000);
  _refreshTimer = setTimeout(() => {
    if (refreshToken) {
      _refreshAuthToken(refreshToken).then(ok => { if (!ok) fazerLogout(); });
    }
  }, ms);
}

// ── CARREGAR COMPANY ID ──────────────────────────────────────
async function _carregarCompanyId() {
  try {
    const rows = await sbGet('company_users?user_id=eq.' + usuarioAtual.id + '&select=company_id,role&limit=1');
    if (rows && rows.length > 0) {
      _companyId = rows[0].company_id;
      // Atualizar perfil com o role do company_users
      if (rows[0].role) usuarioAtual.perfil = rows[0].role;
    }
  } catch(e) {
    console.warn('Erro ao carregar company_id:', e);
  }
}

// ── AUTO-LOGIN ───────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  if (verificarSessao()) {
    await _carregarCompanyId();
    await iniciarApp();
    _entrarNoApp();
  }
});
