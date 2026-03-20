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

    // Recolher todos os grupos do sidebar exceto SUPER ADMIN
    document.querySelectorAll('.sidebar-group-label').forEach(label => {
      if (label.id === 'label-superadmin') return;
      const group = label.nextElementSibling;
      if (group && group.classList.contains('sidebar-group')) {
        group.classList.add('collapsed');
        label.classList.add('collapsed');
        group.style.maxHeight = '0px';
      }
    });

    // Abrir direto na view de empresas
    setTimeout(() => setView('clientes-plataforma'), 200);
  } catch(e) { console.warn('checkPlatformAdmin:', e); }
}

async function switchCompany(companyId) {
  _companyId = companyId;
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
    const hdrs = { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + _authToken };

    // Buscar empresas + usuarios via RPC segura
    const [companies, rpcUsers] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/companies?select=*&order=created_at.desc`, { headers: hdrs }).then(r => r.json()),
      fetch(`${SUPABASE_URL}/rest/v1/rpc/list_company_users`, { method: 'POST', headers: { ...hdrs, 'Content-Type': 'application/json' }, body: '{}' }).then(r => r.json()).catch(() => [])
    ]);

    if (!companies || !companies.length) {
      listaEl.innerHTML = '<div style="color:var(--texto3);padding:20px;">Nenhuma empresa cadastrada.</div>';
      return;
    }

    const allCompUsers = rpcUsers || [];

    // Stats
    const total = companies.length;
    const trials = companies.filter(c => c.plan === 'trial').length;
    const ativos = companies.filter(c => c.plan !== 'trial').length;
    const totalUsers = (allCompUsers || []).length;

    if (statsEl) {
      statsEl.innerHTML = [
        { label: 'Empresas', valor: total, cor: '#a855f7' },
        { label: 'Trial', valor: trials, cor: '#f59e0b' },
        { label: 'Pagantes', valor: ativos, cor: '#22c55e' },
        { label: 'Usuarios', valor: totalUsers, cor: '#3b82f6' }
      ].map(s =>
        '<div style="background:rgba(255,255,255,0.03);border:1px solid var(--borda);border-radius:10px;padding:12px 18px;min-width:90px;">' +
          '<div style="font-size:22px;font-weight:800;color:' + s.cor + ';">' + s.valor + '</div>' +
          '<div style="font-size:11px;color:var(--texto3);font-weight:600;letter-spacing:0.5px;">' + s.label + '</div>' +
        '</div>'
      ).join('');
    }

    // Lista de empresas com usuarios expandidos
    listaEl.innerHTML = companies.map(c => {
      const companyUsers = (allCompUsers || []).filter(cu => cu.company_id === c.id);
      const planBadge = c.plan === 'trial'
        ? '<span style="background:rgba(245,158,11,0.12);color:#f59e0b;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;">TRIAL</span>'
        : '<span style="background:rgba(34,197,94,0.12);color:#22c55e;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;">' + (c.plan || 'ATIVO').toUpperCase() + '</span>';
      const trialEnd = c.trial_ends_at ? new Date(c.trial_ends_at).toLocaleDateString('pt-BR') : '';
      const criado = c.created_at ? new Date(c.created_at).toLocaleDateString('pt-BR') : '';
      const isActive = c.id === _companyId;

      // Lista de usuarios dessa empresa
      let usersHtml = '';
      if (companyUsers.length) {
        usersHtml = '<div style="margin-top:12px;border-top:1px solid rgba(255,255,255,0.04);padding-top:10px;">' +
          '<div style="font-size:10px;color:var(--texto3);font-weight:700;letter-spacing:1px;margin-bottom:6px;">USUARIOS</div>' +
          '<table style="width:100%;border-collapse:collapse;font-size:11px;">' +
          '<tr style="border-bottom:1px solid rgba(255,255,255,0.06);">' +
            '<th style="text-align:left;padding:4px 6px;color:var(--texto3);font-size:9px;font-weight:700;">NOME</th>' +
            '<th style="text-align:left;padding:4px 6px;color:var(--texto3);font-size:9px;font-weight:700;">LOGIN</th>' +
            '<th style="text-align:left;padding:4px 6px;color:var(--texto3);font-size:9px;font-weight:700;">PERFIL</th>' +
          '</tr>' +
          companyUsers.map(cu => {
            const email = cu.email || '—';
            const nome = cu.nome || '—';
            const roleColor = cu.role === 'admin' ? '#22c55e' : cu.role === 'mestre' ? '#f59e0b' : cu.role === 'visitante' ? '#6b7280' : '#3b82f6';
            return '<tr style="border-bottom:1px solid rgba(255,255,255,0.02);">' +
              '<td style="padding:6px;color:#fafafa;font-weight:600;">' + nome + '</td>' +
              '<td style="padding:6px;color:var(--texto3);font-family:monospace;font-size:10px;">' + email + '</td>' +
              '<td style="padding:6px;"><span style="color:' + roleColor + ';font-size:9px;font-weight:700;">' + (cu.role || 'OPERACIONAL').toUpperCase() + '</span></td>' +
            '</tr>';
          }).join('') +
          '</table>' +
        '</div>';
      }

      return '<div class="empresa-card" data-nome="' + (c.name || '').toLowerCase() + '" style="background:' + (isActive ? 'rgba(168,85,247,0.06)' : 'rgba(255,255,255,0.02)') + ';border:1px solid ' + (isActive ? 'rgba(168,85,247,0.3)' : 'var(--borda)') + ';border-radius:12px;padding:16px 20px;margin-bottom:12px;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;cursor:pointer;" onclick="toggleEmpresaDetalhe(this)">' +
          '<div>' +
            '<div style="font-weight:700;font-size:14px;margin-bottom:4px;">' + (c.name || 'Sem nome') + ' ' + planBadge + ' <span style="font-size:10px;color:var(--texto3);">' + companyUsers.length + ' usr</span></div>' +
            '<div style="font-size:11px;color:var(--texto3);">' +
              (c.city ? c.city + ' · ' : '') +
              (c.plan === 'trial' && trialEnd ? 'Trial ate ' + trialEnd + ' · ' : '') +
              'Criado ' + criado +
            '</div>' +
          '</div>' +
          '<span class="empresa-toggle" style="font-size:14px;color:var(--texto3);transition:transform .2s;">▼</span>' +
        '</div>' +
        '<div class="empresa-detalhe" style="display:none;margin-top:12px;border-top:1px solid rgba(255,255,255,0.04);padding-top:12px;">' +
          (c.cnpj ? '<div style="font-size:11px;color:var(--texto3);margin-bottom:8px;">CNPJ: ' + c.cnpj + (c.phone ? ' · Tel: ' + c.phone : '') + '</div>' : '') +
          (c.notes ? '<div style="font-size:11px;background:rgba(168,85,247,0.06);border:1px solid rgba(168,85,247,0.15);border-radius:8px;padding:10px;margin-bottom:8px;"><div style="font-size:9px;color:#a855f7;font-weight:700;letter-spacing:1px;margin-bottom:6px;">📝 OBSERVAÇÕES</div>' + c.notes.replace(/</g,'&lt;').split('\n').filter(l=>l.trim()).map(l => '<div style="padding:4px 0;border-bottom:1px solid rgba(168,85,247,0.08);color:#ccc;font-family:monospace;font-size:11px;">' + l + '</div>').join('') + '</div>' : '') +
          usersHtml +
          '<div style="display:flex;gap:6px;margin-top:12px;">' +
            '<button onclick="event.stopPropagation();editarEmpresa(\'' + c.id + '\');" style="padding:6px 10px;border-radius:8px;border:1px solid var(--borda);background:rgba(255,255,255,0.03);color:var(--texto3);font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;">EDITAR</button>' +
            '<button onclick="event.stopPropagation();excluirEmpresa(\'' + c.id + '\',\'' + (c.name || '').replace(/'/g, '') + '\');" style="padding:6px 10px;border-radius:8px;border:1px solid rgba(239,68,68,0.2);background:rgba(239,68,68,0.05);color:#ef4444;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;">EXCLUIR</button>' +
            '<button onclick="event.stopPropagation();switchCompany(\'' + c.id + '\');setView(\'dashboard\');" style="padding:6px 14px;border-radius:8px;border:1px solid rgba(168,85,247,0.3);background:rgba(168,85,247,0.08);color:#a855f7;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;">ACESSAR</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('');

  } catch(e) {
    console.error('Erro ao carregar empresas:', e);
    listaEl.innerHTML = '<div style="color:var(--vermelho);padding:20px;">Erro ao carregar empresas.</div>';
  }
}

// ── Editar empresa ────────────────────────────────────
async function editarEmpresa(companyId) {
  const hdrs = { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + _authToken };
  const [arr, rpcUsers] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/companies?id=eq.${companyId}`, { headers: hdrs }).then(r => r.json()),
    fetch(`${SUPABASE_URL}/rest/v1/rpc/list_company_users`, { method: 'POST', headers: { ...hdrs, 'Content-Type': 'application/json' }, body: '{}' }).then(r => r.json()).catch(() => [])
  ]);
  const c = arr && arr[0] ? arr[0] : null;
  if (!c) { alert('Empresa nao encontrada.'); return; }
  const compUsers = (rpcUsers || []).filter(u => u.company_id === companyId);

  // Montar lista de usuarios editaveis
  let usersHtml = '';
  if (compUsers && compUsers.length) {
    usersHtml = '<div style="margin-bottom:12px;"><label style="font-size:11px;color:var(--texto3);font-weight:700;display:block;margin-bottom:8px;">USUARIOS</label>' +
      compUsers.map((cu, i) => {
        const email = cu.email || '—';
        const nome = cu.nome || '—';
        const cuId = cu.cu_id || cu.id;
        return '<div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;padding:8px;background:rgba(255,255,255,0.02);border:1px solid var(--borda);border-radius:8px;">' +
          '<div style="flex:1;min-width:0;">' +
            '<div style="font-size:12px;font-weight:700;color:#fafafa;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + nome + '</div>' +
            '<div style="font-size:10px;color:var(--texto3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + email + '</div>' +
          '</div>' +
          '<select data-cuid="' + cuId + '" class="ed-user-role" style="padding:4px 6px;background:var(--cinza-medio,#141414);border:1px solid var(--borda);border-radius:6px;color:#fafafa;font-size:10px;font-family:inherit;">' +
            '<option value="admin"' + (cu.role === 'admin' ? ' selected' : '') + '>Admin</option>' +
            '<option value="operacional"' + (cu.role === 'operacional' ? ' selected' : '') + '>Operacional</option>' +
            '<option value="mestre"' + (cu.role === 'mestre' ? ' selected' : '') + '>Mestre</option>' +
            '<option value="visitante"' + (cu.role === 'visitante' ? ' selected' : '') + '>Visitante</option>' +
          '</select>' +
          '<button onclick="removerUsuarioEmpresa(\'' + cuId + '\',\'' + nome.replace(/'/g,'') + '\')" style="padding:4px 8px;border-radius:6px;border:1px solid rgba(239,68,68,0.2);background:rgba(239,68,68,0.05);color:#ef4444;font-size:10px;font-weight:700;cursor:pointer;font-family:inherit;">X</button>' +
        '</div>';
      }).join('') +
    '</div>';
  }

  const overlay = document.createElement('div');
  overlay.id = 'edit-empresa-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;';
  overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };

  overlay.innerHTML = '<div style="background:var(--cinza-escuro,#0a0a0a);border:1px solid var(--borda);border-radius:16px;padding:24px;width:100%;max-width:460px;max-height:90vh;overflow-y:auto;">' +
    '<div style="font-size:16px;font-weight:800;margin-bottom:16px;color:#a855f7;">Editar Empresa</div>' +
    '<div style="margin-bottom:12px;"><label style="font-size:11px;color:var(--texto3);font-weight:700;display:block;margin-bottom:4px;">NOME</label><input id="ed-emp-nome" value="' + (c.name || '') + '" style="width:100%;padding:10px;background:var(--cinza-medio,#141414);border:1px solid var(--borda);border-radius:8px;color:#fafafa;font-size:13px;font-family:inherit;box-sizing:border-box;"></div>' +
    '<div style="margin-bottom:12px;"><label style="font-size:11px;color:var(--texto3);font-weight:700;display:block;margin-bottom:4px;">CIDADE</label><input id="ed-emp-cidade" value="' + (c.city || '') + '" style="width:100%;padding:10px;background:var(--cinza-medio,#141414);border:1px solid var(--borda);border-radius:8px;color:#fafafa;font-size:13px;font-family:inherit;box-sizing:border-box;"></div>' +
    '<div style="margin-bottom:12px;"><label style="font-size:11px;color:var(--texto3);font-weight:700;display:block;margin-bottom:4px;">CNPJ</label><input id="ed-emp-cnpj" value="' + (c.cnpj || '') + '" style="width:100%;padding:10px;background:var(--cinza-medio,#141414);border:1px solid var(--borda);border-radius:8px;color:#fafafa;font-size:13px;font-family:inherit;box-sizing:border-box;"></div>' +
    '<div style="margin-bottom:12px;"><label style="font-size:11px;color:var(--texto3);font-weight:700;display:block;margin-bottom:4px;">TELEFONE</label><input id="ed-emp-phone" value="' + (c.phone || '') + '" style="width:100%;padding:10px;background:var(--cinza-medio,#141414);border:1px solid var(--borda);border-radius:8px;color:#fafafa;font-size:13px;font-family:inherit;box-sizing:border-box;"></div>' +
    usersHtml +
    '<div style="margin-bottom:12px;"><label style="font-size:11px;color:var(--texto3);font-weight:700;display:block;margin-bottom:4px;">OBSERVAÇÕES (senhas, contatos, etc)</label><textarea id="ed-emp-notes" rows="4" style="width:100%;padding:10px;background:var(--cinza-medio,#141414);border:1px solid var(--borda);border-radius:8px;color:#fafafa;font-size:12px;font-family:monospace;box-sizing:border-box;resize:vertical;">' + (c.notes || '') + '</textarea></div>' +
    '<div style="margin-bottom:16px;"><label style="font-size:11px;color:var(--texto3);font-weight:700;display:block;margin-bottom:4px;">PLANO</label><select id="ed-emp-plan" style="width:100%;padding:10px;background:var(--cinza-medio,#141414);border:1px solid var(--borda);border-radius:8px;color:#fafafa;font-size:13px;font-family:inherit;">' +
      '<option value="trial"' + (c.plan === 'trial' ? ' selected' : '') + '>Trial</option>' +
      '<option value="essencial"' + (c.plan === 'essencial' ? ' selected' : '') + '>Essencial</option>' +
      '<option value="completo"' + (c.plan === 'completo' ? ' selected' : '') + '>Completo</option>' +
      '<option value="premium"' + (c.plan === 'premium' ? ' selected' : '') + '>Premium</option>' +
    '</select></div>' +
    '<div style="display:flex;gap:8px;">' +
      '<button onclick="document.getElementById(\'edit-empresa-overlay\').remove();" style="flex:1;padding:10px;border-radius:8px;border:1px solid var(--borda);background:transparent;color:var(--texto3);font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;">CANCELAR</button>' +
      '<button onclick="salvarEmpresa(\'' + companyId + '\')" style="flex:1;padding:10px;border-radius:8px;border:none;background:#a855f7;color:#fff;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;">SALVAR</button>' +
    '</div>' +
  '</div>';

  document.body.appendChild(overlay);
}

async function salvarEmpresa(companyId) {
  const hdrs = { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + _authToken, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' };
  try {
    // Salvar dados da empresa
    await fetch(`${SUPABASE_URL}/rest/v1/companies?id=eq.${companyId}`, {
      method: 'PATCH',
      headers: hdrs,
      body: JSON.stringify({
        name: document.getElementById('ed-emp-nome').value.trim(),
        city: document.getElementById('ed-emp-cidade').value.trim() || null,
        cnpj: document.getElementById('ed-emp-cnpj').value.trim() || null,
        phone: document.getElementById('ed-emp-phone').value.trim() || null,
        plan: document.getElementById('ed-emp-plan').value,
        notes: document.getElementById('ed-emp-notes').value.trim() || null
      })
    });

    // Salvar perfis de usuarios alterados
    const roleSelects = document.querySelectorAll('.ed-user-role');
    for (const sel of roleSelects) {
      const cuId = sel.getAttribute('data-cuid');
      if (cuId) {
        await fetch(`${SUPABASE_URL}/rest/v1/company_users?id=eq.${cuId}`, {
          method: 'PATCH',
          headers: hdrs,
          body: JSON.stringify({ role: sel.value })
        });
      }
    }

    document.getElementById('edit-empresa-overlay')?.remove();
    showToast('Empresa atualizada!');
    renderPlataformaClientes();
  } catch(e) {
    alert('Erro ao salvar: ' + e.message);
  }
}

async function removerUsuarioEmpresa(companyUserId, nome) {
  if (!confirm('Remover "' + nome + '" desta empresa?')) return;
  const hdrs = { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + _authToken, 'Prefer': 'return=minimal' };
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/company_users?id=eq.${companyUserId}`, { method: 'DELETE', headers: hdrs });
    showToast('Usuario removido.');
    document.getElementById('edit-empresa-overlay')?.remove();
    renderPlataformaClientes();
  } catch(e) {
    alert('Erro ao remover: ' + e.message);
  }
}

// ── Excluir empresa ───────────────────────────────────
// ── Toggle expandir/recolher empresa ──────────────────
function toggleEmpresaDetalhe(headerEl) {
  const detalhe = headerEl.nextElementSibling;
  const toggle = headerEl.querySelector('.empresa-toggle');
  if (!detalhe) return;
  if (detalhe.style.display === 'none') {
    detalhe.style.display = 'block';
    if (toggle) toggle.style.transform = 'rotate(180deg)';
  } else {
    detalhe.style.display = 'none';
    if (toggle) toggle.style.transform = '';
  }
}

function toggleTodasEmpresas() {
  const cards = document.querySelectorAll('.empresa-detalhe');
  const btn = document.getElementById('btn-toggle-empresas');
  const algumAberto = [...cards].some(c => c.style.display !== 'none');

  cards.forEach(c => c.style.display = algumAberto ? 'none' : 'block');
  document.querySelectorAll('.empresa-toggle').forEach(t => t.style.transform = algumAberto ? '' : 'rotate(180deg)');
  if (btn) btn.textContent = algumAberto ? 'EXPANDIR TUDO' : 'RECOLHER TUDO';
}

function filtrarEmpresas() {
  const busca = (document.getElementById('plataforma-busca')?.value || '').toLowerCase();
  document.querySelectorAll('.empresa-card').forEach(card => {
    const nome = card.getAttribute('data-nome') || '';
    card.style.display = nome.includes(busca) ? '' : 'none';
  });
}

async function excluirEmpresa(companyId, nome) {
  if (!confirm('Tem certeza que quer excluir "' + nome + '"?\n\nIsso vai apagar TODOS os dados dessa empresa (obras, estoque, financeiro, usuarios). Acao irreversivel.')) return;
  if (!confirm('ULTIMA CONFIRMACAO: Excluir "' + nome + '" permanentemente?')) return;

  const hdrs = { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + _authToken, 'Prefer': 'return=minimal' };
  try {
    // Deletar vinculos de usuarios
    await fetch(`${SUPABASE_URL}/rest/v1/company_users?company_id=eq.${companyId}`, { method: 'DELETE', headers: hdrs });
    // Deletar termos aceites
    await fetch(`${SUPABASE_URL}/rest/v1/termos_aceites?company_id=eq.${companyId}`, { method: 'DELETE', headers: hdrs });
    // Deletar empresa (cascade deve cuidar do resto se configurado)
    await fetch(`${SUPABASE_URL}/rest/v1/companies?id=eq.${companyId}`, { method: 'DELETE', headers: hdrs });

    showToast('Empresa excluida.');
    renderPlataformaClientes();
  } catch(e) {
    alert('Erro ao excluir: ' + e.message);
  }
}
