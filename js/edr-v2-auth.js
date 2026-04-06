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
    // Esconde login imediatamente (evita flash de tela de login)
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app-shell').style.display = '';
    await _carregarCompanyId();
    await iniciarApp();
    _entrarNoApp();
  }
});

// ── PERMISSÕES POR PERFIL ────────────────────────────────────
const _MODULOS_PERMISSAO = [
  { id: 'dashboard',    label: 'Dashboard' },
  { id: 'obras',        label: 'Obras' },
  { id: 'cronograma',   label: 'Cronograma' },
  { id: 'orcamento',    label: 'Orçamento' },
  { id: 'adicionais',   label: 'Adicionais' },
  { id: 'diario',       label: 'Diário de Obra' },
  { id: 'garantias',    label: 'Garantias' },
  { id: 'estoque',      label: 'Estoque' },
  { id: 'notas',        label: 'Notas Fiscais' },
  { id: 'contas-pagar', label: 'Contas a Pagar' },
  { id: 'creditos',     label: 'Créditos' },
  { id: 'diarias',      label: 'Diárias' },
  { id: 'leads',        label: 'Leads / CRM' },
  { id: 'pci',          label: 'PCI Medições' },
  { id: 'banco',        label: 'Dados' },
  { id: 'permissoes',   label: 'Permissões' },
  { id: 'setup',        label: 'Configuração' },
];

const _PERFIS = [
  { id: 'admin',       label: 'Admin',       cor: '#16a34a' },
  { id: 'operacional', label: 'Operacional', cor: '#2563eb' },
  { id: 'mestre',      label: 'Mestre',      cor: '#d97706' },
  { id: 'visitante',   label: 'Visitante',   cor: '#6b7280' },
];

function _perfilTemAcesso(perfilId, viewId) {
  const allowed = PERFIL_VIEWS[perfilId];
  return allowed === null || (Array.isArray(allowed) && allowed.includes(viewId));
}

async function renderPermissoes(container) {
  const c = document.getElementById('permissoes-container');
  if (!c) return;
  c.innerHTML = '<div style="color:var(--text-tertiary);font-size:13px;padding:16px 0;">Carregando...</div>';

  // Buscar usuários da empresa
  let usuarios = [];
  if (_companyId) {
    try {
      usuarios = await sbGet('company_users', '?company_id=eq.' + _companyId + '&select=id,user_id,role,nome,email&order=nome');
      if (!Array.isArray(usuarios)) usuarios = [];
    } catch(e) { usuarios = []; }
  }

  const isAdmin = usuarioAtual?.perfil === 'admin';

  // ── MATRIZ DE ACESSO ──
  let matrizRows = _MODULOS_PERMISSAO.map(mod => {
    const colunas = _PERFIS.map(p => {
      const tem = _perfilTemAcesso(p.id, mod.id);
      return `<td style="text-align:center;padding:7px 4px;">
        ${tem
          ? '<span class="material-symbols-outlined" style="color:#16a34a;font-size:18px;vertical-align:middle;">check_circle</span>'
          : '<span class="material-symbols-outlined" style="color:#e5e7eb;font-size:18px;vertical-align:middle;">cancel</span>'
        }
      </td>`;
    }).join('');
    return `<tr style="border-bottom:1px solid var(--borda);">
      <td style="padding:7px 8px;font-size:13px;color:var(--text-primary);">${mod.label}</td>
      ${colunas}
    </tr>`;
  }).join('');

  const cabecalhos = _PERFIS.map(p =>
    `<th style="padding:8px 4px;font-size:11px;font-weight:700;letter-spacing:.5px;text-align:center;color:${p.cor};">${p.label.toUpperCase()}</th>`
  ).join('');

  // ── LISTA DE USUÁRIOS ──
  let usersHTML = '';
  if (usuarios.length === 0) {
    usersHTML = '<div style="color:var(--text-tertiary);font-size:13px;padding:8px 0;">Nenhum usuário encontrado.</div>';
  } else {
    usersHTML = usuarios.map(u => {
      const perfilAtual = u.role || 'operacional';
      const opts = _PERFIS.map(p =>
        `<option value="${p.id}" ${p.id === perfilAtual ? 'selected' : ''}>${p.label}</option>`
      ).join('');
      const selector = isAdmin
        ? `<select onchange="alterarPerfilUsuario('${u.id}', this.value)"
            style="background:var(--card);border:1px solid var(--borda);color:var(--text-primary);border-radius:6px;padding:5px 8px;font-family:'Rajdhani',sans-serif;font-size:12px;font-weight:600;cursor:pointer;">${opts}</select>`
        : `<span style="font-size:12px;font-weight:700;color:var(--text-secondary);">${perfilAtual.toUpperCase()}</span>`;

      return `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--borda);">
        <div>
          <div style="font-size:13px;font-weight:700;color:var(--text-primary);">${u.nome || '—'}</div>
          <div style="font-size:11px;color:var(--text-tertiary);">${u.email || ''}</div>
        </div>
        ${selector}
      </div>`;
    }).join('');
  }

  c.innerHTML = `
    <div class="card" style="margin-bottom:12px;padding:16px;overflow-x:auto;">
      <div class="section-title" style="margin-bottom:12px;font-size:13px;">
        <span class="material-symbols-outlined icon-sm icon-inline">grid_on</span> MATRIZ DE ACESSO
      </div>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="border-bottom:2px solid var(--borda);">
            <th style="padding:8px;font-size:11px;font-weight:700;letter-spacing:.5px;text-align:left;color:var(--text-tertiary);">MÓDULO</th>
            ${cabecalhos}
          </tr>
        </thead>
        <tbody>${matrizRows}</tbody>
      </table>
      <div style="margin-top:10px;font-size:11px;color:var(--text-tertiary);line-height:1.5;">
        * Visitante tem acesso a tudo, porém em modo somente leitura (controlado em cada módulo).
      </div>
    </div>

    <div class="card" style="padding:16px;">
      <div class="section-title" style="margin-bottom:4px;font-size:13px;">
        <span class="material-symbols-outlined icon-sm icon-inline">group</span> USUÁRIOS E PERFIS
      </div>
      ${!isAdmin ? '<div style="font-size:11px;color:var(--text-tertiary);margin-bottom:10px;">Apenas administradores podem alterar perfis.</div>' : ''}
      ${usersHTML}
    </div>
  `;
}

async function alterarPerfilUsuario(companyUserId, novoPerfil) {
  try {
    const ok = await sbPatch('company_users', '?id=eq.' + companyUserId, { role: novoPerfil });
    if (ok !== null) {
      if (typeof showToast === 'function') showToast('Perfil atualizado.');
    } else {
      if (typeof showToast === 'function') showToast('Erro ao atualizar perfil.');
    }
  } catch(e) {
    if (typeof showToast === 'function') showToast('Erro ao atualizar perfil.');
  }
}

// Registrar view de permissões
window.addEventListener('DOMContentLoaded', () => {
  if (typeof viewRegistry !== 'undefined') {
    viewRegistry.register('permissoes', renderPermissoes);
  }
});
