// ══════════════════════════════════════════
// AUTENTICAÇÃO — Supabase Auth (GoTrue)
// ══════════════════════════════════════════

async function fazerLogin() {
  const u = document.getElementById('login-user').value.trim().toLowerCase();
  const s = document.getElementById('login-pass').value;
  const btn = document.querySelector('.btn-login');
  const errEl = document.getElementById('login-error');
  if (!u || !s) { errEl.textContent = 'Informe usuário e senha.'; return; }
  if (btn) { btn.disabled = true; btn.textContent = 'AGUARDE...'; }
  errEl.textContent = '';

  try {
    const email = u.includes('@') ? u : u + '@edreng.com.br';
    const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: s })
    });
    const data = await r.json();
    if (!r.ok || !data.access_token) {
      errEl.textContent = 'Usuário ou senha incorretos.';
      if (btn) { btn.disabled = false; btn.textContent = 'ENTRAR'; }
      return;
    }
    // Salvar tokens
    _authToken = data.access_token;
    const meta = data.user?.user_metadata || {};
    usuarioAtual = {
      id: data.user.id,
      usuario: meta.usuario || u,
      nome: meta.nome || u,
      perfil: meta.perfil || 'operacional',
      ativo: true
    };
    // Persistir sessão
    try {
      localStorage.setItem('edr_auth', JSON.stringify({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: Date.now() + (data.expires_in * 1000),
        user: usuarioAtual
      }));
    } catch(e) {}
    // Agendar refresh do token
    _agendarRefreshToken(data.expires_in);
    entrarNoApp();
  } catch(e) {
    console.error('Erro no login:', e);
    errEl.textContent = 'Erro de conexão. Tente novamente.';
  }
  if (btn) { btn.disabled = false; btn.textContent = 'ENTRAR'; }
}

function entrarNoApp() {
  document.getElementById('login-screen').classList.add('hidden');
  ['obras','estoque','notas','form','creditos','setup','catalogo','banco','relatorio','diarias','custos','leads','caixa','contas-pagar','garantias'].forEach(name => {
    const el = document.getElementById('view-'+name);
    if (el) el.classList.add('hidden');
  });
  const dash = document.getElementById('view-dashboard');
  if (dash) dash.classList.remove('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('user-nome-badge').textContent = usuarioAtual.nome;
  const demoBadge = document.getElementById('demo-mode-badge');
  if (demoBadge) demoBadge.style.display = usuarioAtual.perfil === 'visitante' ? 'block' : 'none';
  if (!MODO_DEMO) {
    const bannerOrfao = document.getElementById('demo-banner');
    if (bannerOrfao) bannerOrfao.remove();
    const mc = document.getElementById('main-content');
    if (mc) mc.style.paddingBottom = '';
  }
  aplicarPerfil();
  initMenuDragDrop();
  // Carregar company_id antes de carregar dados
  if (typeof loadCompanyId === 'function') {
    loadCompanyId().then(() => {
      iniciarApp();
      checkPlatformAdmin();
    }).catch(() => iniciarApp());
  } else {
    iniciarApp();
  }
}

async function fazerLogout() {
  // Chamar logout no Supabase (invalidar token)
  if (_authToken) {
    try {
      await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
        method: 'POST',
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${_authToken}`, 'Content-Type': 'application/json' }
      });
    } catch(e) {}
  }
  _logoutInProgress = true;
  _authToken = null;
  try { localStorage.removeItem('edr_auth'); } catch(e) {}
  if (_refreshTimer) { clearTimeout(_refreshTimer); _refreshTimer = null; }
  MODO_DEMO = false;
  usuarioAtual = null;
  obras = []; obrasArquivadas = []; notas = []; lancamentos = []; distribuicoes = [];
  // Limpar estados de filtro pra não herdar IDs da sessão anterior
  obraFiltroAtual = null; catFiltroAtual = null; catEstoqueFiltro = null;
  entradasDiretas = []; catalogoMateriais = []; repassesCef = []; ajustesEstoque = [];
  itensForm = []; distItemAtual = null; currentCredito = null;
  leadsData = []; diarQuinzenas = []; diarQuinzenaAtiva = null; contasPagar = []; projecoesCaixa = []; garantiaChamados = [];
  if (typeof _demoBannerTimer !== 'undefined' && _demoBannerTimer) {
    clearTimeout(_demoBannerTimer);
    _demoBannerTimer = null;
  }
  const demoBanner = document.getElementById('demo-banner');
  if (demoBanner) demoBanner.remove();
  const demoBadge = document.getElementById('demo-badge');
  if (demoBadge) demoBadge.classList.add('hidden');
  const mc = document.getElementById('main-content');
  if (mc) mc.style.paddingBottom = '';
  document.getElementById('app').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('login-user').value = '';
  document.getElementById('login-pass').value = '';
  document.getElementById('login-error').textContent = '';
}

// ── SESSÃO: restaurar + refresh ──────────────────────────────
let _refreshTimer = null;
let _logoutInProgress = false;

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
    _authToken = data.access_token;
    const meta = data.user?.user_metadata || {};
    usuarioAtual = {
      id: data.user.id,
      usuario: meta.usuario || usuarioAtual?.usuario || '',
      nome: meta.nome || usuarioAtual?.nome || '',
      perfil: meta.perfil || usuarioAtual?.perfil || 'operacional',
      ativo: true
    };
    try {
      localStorage.setItem('edr_auth', JSON.stringify({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: Date.now() + (data.expires_in * 1000),
        user: usuarioAtual
      }));
    } catch(e) {}
    _agendarRefreshToken(data.expires_in);
    return true;
  } catch(e) { return false; }
}

function _agendarRefreshToken(expiresInSec) {
  if (_refreshTimer) clearTimeout(_refreshTimer);
  // Renovar 60s antes de expirar
  const ms = Math.max((expiresInSec - 60) * 1000, 30000);
  _refreshTimer = setTimeout(async () => {
    const sess = _getSessaoLocal();
    if (sess?.refresh_token) {
      const ok = await _refreshAuthToken(sess.refresh_token);
      if (!ok) fazerLogout();
    }
  }, ms);
}

function _getSessaoLocal() {
  try {
    const s = localStorage.getItem('edr_auth');
    return s ? JSON.parse(s) : null;
  } catch(e) { return null; }
}

function verificarSessao() {
  const sess = _getSessaoLocal();
  if (!sess || !sess.access_token) return false;
  // Token expirado? Tentar refresh em background, mas entrar com dados locais
  _authToken = sess.access_token;
  usuarioAtual = sess.user;
  if (sess.expires_at && Date.now() > sess.expires_at) {
    // Token expirado — tentar refresh em background
    if (sess.refresh_token) {
      _refreshAuthToken(sess.refresh_token).then(ok => {
        if (!ok && !_logoutInProgress) fazerLogout();
      });
    }
    // Mesmo com token expirado, entrar com dados locais (refresh vai atualizar)
    return true;
  }
  // Token válido — agendar refresh
  const restante = Math.max(Math.floor((sess.expires_at - Date.now()) / 1000), 60);
  _agendarRefreshToken(restante);
  return true;
}

// Auto-login ao abrir o app
window.addEventListener('DOMContentLoaded', () => {
  try {
    if (verificarSessao()) { entrarNoApp(); return; }
  } catch(e) {
    try { localStorage.removeItem('edr_auth'); } catch(e2) {}
  }
});

function aplicarPerfil() {
  const isAdmin = usuarioAtual.perfil === 'admin';
  const isMestre = usuarioAtual.perfil === 'mestre';
  const isVisitante = usuarioAtual.perfil === 'visitante';

  if (isVisitante) MODO_DEMO = true;
  else MODO_DEMO = false;

  ['nav-dashboard','nav-obras','nav-estoque','nav-notas','nav-form','nav-creditos',
   'nav-catalogo','nav-relatorio','nav-banco','nav-setup','nav-diarias','nav-custos','nav-leads','nav-caixa','nav-contas-pagar','nav-garantias'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('hidden');
  });
  const bnav = document.getElementById('bottom-nav');
  if (bnav) bnav.style.display = '';
  document.body.classList.remove('perfil-mestre');
  document.body.classList.toggle('perfil-mestre', isMestre);

  document.querySelectorAll('.admin-only').forEach(el => el.classList.toggle('hidden', !isAdmin));
  document.querySelectorAll('.admin-mestre').forEach(el => el.classList.toggle('hidden', !isAdmin && !isMestre));
  document.querySelectorAll('.operacional-info').forEach(el => el.classList.toggle('hidden', isAdmin));

  if (!isAdmin) {
    document.getElementById('nav-setup').classList.add('hidden');
  }

  if (isMestre) {
    ['nav-dashboard','nav-obras','nav-estoque','nav-notas','nav-form','nav-creditos','nav-catalogo','nav-relatorio','nav-banco'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.add('hidden');
    });
    const bnav = document.getElementById('bottom-nav');
    if (bnav) bnav.style.display = 'none';
    setTimeout(() => setView('diarias'), 100);
    diarPanelRecolhido = false;
    const pl = document.getElementById('diar-panelLeft');
    if (pl) pl.classList.remove('recolhido');
  }
}

// ── Super Admin — seletor de empresa ──────────────────
async function checkPlatformAdmin() {
  if (MODO_DEMO || !_authToken) return;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/is_platform_admin`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + _authToken, 'Content-Type': 'application/json' },
      body: '{}'
    });
    const isAdmin = await r.json();
    if (!isAdmin) return;

    // Carregar todas as empresas
    const cr = await fetch(`${SUPABASE_URL}/rest/v1/companies?select=id,name&order=name`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + _authToken }
    });
    const companies = await cr.json();
    if (!companies || !companies.length) return;

    // Mostrar badge SUPER ADMIN
    const badge = document.getElementById('super-admin-badge');
    if (badge) badge.style.display = 'inline-block';

    // Mostrar menu SUPER ADMIN no sidebar
    const labelSA = document.getElementById('label-superadmin');
    const groupSA = document.getElementById('group-superadmin');
    if (labelSA) labelSA.style.display = '';
    if (groupSA) groupSA.style.display = '';

    // Mostrar seletor de empresa
    const sel = document.getElementById('company-switcher');
    sel.innerHTML = companies.map(c =>
      '<option value="' + c.id + '"' + (c.id === _companyId ? ' selected' : '') + '>' + c.name + '</option>'
    ).join('');
    sel.style.display = 'inline-block';

    // Atualizar nome exibido pra mostrar empresa atual
    updateSuperAdminLabel();
  } catch(e) { console.warn('checkPlatformAdmin:', e); }
}

function updateSuperAdminLabel() {
  const sel = document.getElementById('company-switcher');
  if (!sel || sel.style.display === 'none') return;
  const empresaNome = sel.options[sel.selectedIndex]?.text || '';
  const nomeEl = document.getElementById('user-nome-badge');
  if (nomeEl && empresaNome) {
    nomeEl.textContent = usuarioAtual.nome + ' · ' + empresaNome;
  }
}

async function switchCompany(companyId) {
  _companyId = companyId;
  updateSuperAdminLabel();
  // Recarregar dados com a nova empresa
  if (typeof iniciarApp === 'function') iniciarApp();
}

// ── Tabs Login / Criar Conta ──────────────────────────
function switchLoginTab(tab) {
  document.getElementById('login-card-login').style.display = tab === 'login' ? 'block' : 'none';
  document.getElementById('login-card-signup').style.display = tab === 'signup' ? 'block' : 'none';
  document.getElementById('login-error').textContent = '';
  document.getElementById('signup-error').textContent = '';
}

// ── Criar Conta ───────────────────────────────────────
async function criarConta() {
  const nome = document.getElementById('signup-nome').value.trim();
  const empresa = document.getElementById('signup-empresa').value.trim();
  const cidade = document.getElementById('signup-cidade').value.trim();
  const email = document.getElementById('signup-email').value.trim().toLowerCase();
  const senha = document.getElementById('signup-senha').value;
  const errEl = document.getElementById('signup-error');
  const btn = document.getElementById('btn-signup');

  errEl.textContent = '';

  if (!nome || !empresa || !email || !senha) {
    errEl.textContent = 'Preencha todos os campos.';
    return;
  }
  if (senha.length < 6) {
    errEl.textContent = 'Senha deve ter pelo menos 6 caracteres.';
    return;
  }
  if (!document.getElementById('signup-termos').checked) {
    errEl.textContent = 'Aceite os Termos de Uso para continuar.';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'CRIANDO...';

  try {
    // 1. Criar usuário no Supabase Auth
    const r = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password: senha,
        data: { nome, perfil: 'admin', usuario: email.split('@')[0] }
      })
    });
    const data = await r.json();

    if (!r.ok || data.error) {
      const msg = (data.error_description || data.msg || data.error?.message || '');
      if (msg.includes('already registered')) errEl.textContent = 'Este e-mail já está cadastrado. Faça login.';
      else errEl.textContent = 'Erro ao criar conta: ' + msg;
      btn.disabled = false;
      btn.textContent = 'CRIAR CONTA GRÁTIS';
      return;
    }

    // 2. Fazer login automaticamente
    const lr = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: senha })
    });
    const loginData = await lr.json();

    if (!lr.ok || !loginData.access_token) {
      // Pode precisar confirmar email
      errEl.style.color = '#2ecc71';
      errEl.textContent = 'Conta criada! Verifique seu e-mail para confirmar e faça login.';
      btn.disabled = false;
      btn.textContent = 'CRIAR CONTA GRÁTIS';
      return;
    }

    _authToken = loginData.access_token;
    const meta = loginData.user?.user_metadata || {};
    usuarioAtual = {
      id: loginData.user.id,
      usuario: meta.usuario || email.split('@')[0],
      nome: meta.nome || nome,
      perfil: meta.perfil || 'admin',
      ativo: true
    };

    try {
      localStorage.setItem('edr_auth', JSON.stringify({
        access_token: loginData.access_token,
        refresh_token: loginData.refresh_token,
        expires_at: Date.now() + (loginData.expires_in * 1000),
        user: usuarioAtual
      }));
    } catch(e) {}
    _agendarRefreshToken(loginData.expires_in);

    // 3. Criar empresa
    const slug = empresa.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    const hdrs = {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + _authToken,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    };

    const cr = await fetch(`${SUPABASE_URL}/rest/v1/companies`, {
      method: 'POST',
      headers: hdrs,
      body: JSON.stringify({
        owner_id: loginData.user.id,
        name: empresa,
        slug: slug + '-' + Date.now().toString(36),
        city: cidade || null,
        plan: 'trial'
      })
    });
    const companyArr = await cr.json();
    const company = Array.isArray(companyArr) ? companyArr[0] : companyArr;

    if (company && company.id) {
      // 4. Vincular usuário à empresa
      await fetch(`${SUPABASE_URL}/rest/v1/company_users`, {
        method: 'POST',
        headers: { ...hdrs, 'Prefer': 'return=minimal' },
        body: JSON.stringify({
          company_id: company.id,
          user_id: loginData.user.id,
          role: 'admin'
        })
      });
      _companyId = company.id;

      // 5. Registrar aceite dos termos
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/termos_aceites`, {
          method: 'POST',
          headers: { ...hdrs, 'Prefer': 'return=minimal' },
          body: JSON.stringify({
            user_id: loginData.user.id,
            company_id: company.id,
            versao: '2026-03-20',
            user_agent: navigator.userAgent
          })
        });
      } catch(e) { console.warn('Erro ao salvar aceite:', e); }
    } else {
      // Empresa não foi criada — erro grave
      errEl.textContent = 'Erro ao criar empresa. Tente novamente ou entre em contato.';
      btn.disabled = false;
      btn.textContent = 'CRIAR CONTA GRÁTIS';
      return;
    }

    // 6. Entrar no app
    entrarNoApp();

  } catch(e) {
    console.error('Erro ao criar conta:', e);
    errEl.textContent = 'Erro de conexão. Tente novamente.';
  }

  btn.disabled = false;
  btn.textContent = 'CRIAR CONTA GRÁTIS';
}

// ── Painel Super Admin — Lista de Empresas ────────────
async function renderPlataformaClientes() {
  const statsEl = document.getElementById('plataforma-stats');
  const listaEl = document.getElementById('plataforma-lista');
  if (!listaEl) return;

  listaEl.innerHTML = '<div style="color:var(--texto3);padding:20px;">Carregando empresas...</div>';

  try {
    // Buscar todas as empresas
    const companies = await fetch(`${SUPABASE_URL}/rest/v1/companies?select=*&order=created_at.desc`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + _authToken }
    }).then(r => r.json());

    if (!companies || !companies.length) {
      listaEl.innerHTML = '<div style="color:var(--texto3);padding:20px;">Nenhuma empresa cadastrada.</div>';
      return;
    }

    // Buscar contagem de usuarios por empresa
    const compUsers = await fetch(`${SUPABASE_URL}/rest/v1/company_users?select=company_id`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + _authToken }
    }).then(r => r.json());

    const userCount = {};
    (compUsers || []).forEach(cu => {
      userCount[cu.company_id] = (userCount[cu.company_id] || 0) + 1;
    });

    // Stats
    const total = companies.length;
    const trials = companies.filter(c => c.plan === 'trial').length;
    const ativos = companies.filter(c => c.plan !== 'trial').length;

    if (statsEl) {
      statsEl.innerHTML = [
        { label: 'Total', valor: total, cor: '#a855f7' },
        { label: 'Trial', valor: trials, cor: '#f59e0b' },
        { label: 'Ativos', valor: ativos, cor: '#22c55e' }
      ].map(s =>
        '<div style="background:rgba(255,255,255,0.03);border:1px solid var(--borda);border-radius:10px;padding:12px 18px;min-width:100px;">' +
          '<div style="font-size:22px;font-weight:800;color:' + s.cor + ';">' + s.valor + '</div>' +
          '<div style="font-size:11px;color:var(--texto3);font-weight:600;letter-spacing:0.5px;">' + s.label + '</div>' +
        '</div>'
      ).join('');
    }

    // Lista de empresas
    listaEl.innerHTML = companies.map(c => {
      const users = userCount[c.id] || 0;
      const planBadge = c.plan === 'trial'
        ? '<span style="background:rgba(245,158,11,0.12);color:#f59e0b;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;">TRIAL</span>'
        : '<span style="background:rgba(34,197,94,0.12);color:#22c55e;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;">' + (c.plan || 'ATIVO').toUpperCase() + '</span>';
      const trialEnd = c.trial_ends_at ? new Date(c.trial_ends_at).toLocaleDateString('pt-BR') : '';
      const criado = c.created_at ? new Date(c.created_at).toLocaleDateString('pt-BR') : '';
      const isActive = c.id === _companyId;

      return '<div onclick="switchCompany(\'' + c.id + '\');setView(\'dashboard\');" style="background:' + (isActive ? 'rgba(168,85,247,0.06)' : 'rgba(255,255,255,0.02)') + ';border:1px solid ' + (isActive ? 'rgba(168,85,247,0.3)' : 'var(--borda)') + ';border-radius:12px;padding:16px 20px;margin-bottom:8px;cursor:pointer;transition:all .15s;display:flex;justify-content:space-between;align-items:center;" onmouseover="this.style.borderColor=\'rgba(168,85,247,0.4)\'" onmouseout="this.style.borderColor=\'' + (isActive ? 'rgba(168,85,247,0.3)' : 'var(--borda)') + '\'">' +
        '<div>' +
          '<div style="font-weight:700;font-size:14px;margin-bottom:4px;">' + (c.name || 'Sem nome') + ' ' + planBadge + '</div>' +
          '<div style="font-size:11px;color:var(--texto3);">' +
            (c.city ? c.city + ' · ' : '') +
            users + ' usuario' + (users !== 1 ? 's' : '') +
            (c.plan === 'trial' && trialEnd ? ' · Trial ate ' + trialEnd : '') +
            ' · Criado ' + criado +
          '</div>' +
        '</div>' +
        '<div style="font-size:18px;color:var(--texto3);">→</div>' +
      '</div>';
    }).join('');

  } catch(e) {
    console.error('Erro ao carregar empresas:', e);
    listaEl.innerHTML = '<div style="color:var(--vermelho);padding:20px;">Erro ao carregar empresas.</div>';
  }
}
