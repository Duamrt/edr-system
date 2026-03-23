// ══════════════════════════════════════════
// AUTENTICAÇÃO — Supabase Auth (GoTrue)
// ══════════════════════════════════════════

// Resolver input de login: email direto ou telefone → email virtual
function _resolverLogin(input) {
  if (input.includes('@')) return input;
  // Limpar telefone (só números)
  const nums = input.replace(/\D/g, '');
  if (nums.length >= 10) return nums + '@edr.app';
  return input; // vai falhar na validação
}

// Formatar número de telefone pra exibição
function _formatarTelefone(nums) {
  if (nums.length === 11) return '(' + nums.slice(0,2) + ') ' + nums[2] + ' ' + nums.slice(3,7) + '-' + nums.slice(7);
  if (nums.length === 10) return '(' + nums.slice(0,2) + ') ' + nums.slice(2,6) + '-' + nums.slice(6);
  return nums;
}

async function fazerLogin() {
  const u = document.getElementById('login-user').value.trim().toLowerCase();
  const s = document.getElementById('login-pass').value;
  const btn = document.querySelector('.btn-login');
  const errEl = document.getElementById('login-error');
  if (!u || !s) { errEl.textContent = 'Informe email ou telefone e senha.'; return; }
  if (btn) { btn.disabled = true; btn.textContent = 'AGUARDE...'; }
  errEl.textContent = '';

  try {
    const email = _resolverLogin(u);
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
  ['obras','estoque','notas','form','creditos','setup','catalogo','banco','relatorio','diarias','usuarios','custos','leads','caixa','contas-pagar','garantias','permissoes'].forEach(name => {
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
    loadCompanyId().then(async () => {
      if (typeof loadCompanyPlan === 'function') loadCompanyPlan();
      // Carregar permissões extras do usuário
      await _carregarPermissoesUsuario();
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
  if(typeof mostandoArquivadas!=='undefined') mostandoArquivadas=false;
  if(typeof currentCredito!=='undefined') currentCredito=null;
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

// Permissões extras carregadas do company_users
let _userPermissions = {};

// Permissões da empresa (template por perfil)
let _companyRolePerms = {};

async function _carregarPermissoesUsuario() {
  if (MODO_DEMO || !_companyId || !usuarioAtual?.id) return;
  try {
    // Carregar permissões individuais + role
    const rows = await fetch(`${SUPABASE_URL}/rest/v1/company_users?company_id=eq.${_companyId}&user_id=eq.${usuarioAtual.id}&select=permissions,role`, {
      headers: getHdrs()
    }).then(r => r.json());
    if (rows && rows[0]) {
      _userPermissions = rows[0].permissions || {};
      if (rows[0].role) usuarioAtual.perfil = rows[0].role;
    }
    // Carregar template de permissões da empresa
    const comp = await fetch(`${SUPABASE_URL}/rest/v1/companies?id=eq.${_companyId}&select=role_permissions`, {
      headers: getHdrs()
    }).then(r => r.json());
    if (comp && comp[0] && comp[0].role_permissions) {
      _companyRolePerms = comp[0].role_permissions;
    }
  } catch(e) {}
}

// Checar se o usuário tem acesso a um módulo
// Prioridade: override individual → template empresa → padrão do perfil
function temPermissao(modulo) {
  if (usuarioAtual?.perfil === 'admin' || _isSuperAdmin) return true;
  // 1. Override individual (se definido)
  if (_userPermissions[modulo] !== undefined) return !!_userPermissions[modulo];
  // 2. Template da empresa
  const perfil = usuarioAtual?.perfil || 'operacional';
  if (_companyRolePerms[perfil] && _companyRolePerms[perfil][modulo] !== undefined) {
    return !!_companyRolePerms[perfil][modulo];
  }
  // 3. Padrão do perfil
  return !!(_PERMS_PADRAO[perfil]?.[modulo]);
}

function aplicarPerfil() {
  const isAdmin = usuarioAtual.perfil === 'admin';
  const isMestre = usuarioAtual.perfil === 'mestre';
  const isVisitante = usuarioAtual.perfil === 'visitante';

  if (isVisitante) MODO_DEMO = true;
  else MODO_DEMO = false;

  // Mapa nav-id → chave de permissão
  const navPerms = {
    'nav-dashboard': 'dashboard', 'nav-obras': 'obras', 'nav-estoque': 'estoque',
    'nav-notas': 'notas', 'nav-form': 'lancamentos', 'nav-creditos': 'lancamentos',
    'nav-catalogo': 'catalogo', 'nav-relatorio': 'relatorio', 'nav-banco': 'financeiro',
    'nav-setup': null, 'nav-permissoes': null, 'nav-diarias': 'diarias', 'nav-custos': 'custos',
    'nav-leads': 'leads', 'nav-caixa': 'financeiro', 'nav-contas-pagar': 'financeiro',
    'nav-garantias': 'garantias'
  };

  Object.entries(navPerms).forEach(([id, perm]) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.classList.contains('superadmin-only')) return; // controlado por checkPlatformAdmin
    if (isAdmin) { el.classList.remove('hidden'); return; }
    if (id === 'nav-permissoes') { el.classList.add('hidden'); return; }
    // Operacional/mestre: mostrar apenas se tem permissão
    if (perm) {
      el.classList.toggle('hidden', !temPermissao(perm));
    }
  });

  const bnav = document.getElementById('bottom-nav');
  if (bnav) bnav.style.display = '';
  document.body.classList.remove('perfil-mestre');
  document.body.classList.toggle('perfil-mestre', isMestre);

  // Nav-btns gerenciados por navPerms não devem ser tocados pelo admin-only
  const navPermIds = new Set(Object.keys(navPerms));
  document.querySelectorAll('.admin-only').forEach(el => {
    if (navPermIds.has(el.id)) return; // já controlado acima
    const modulo = el.dataset?.permissao;
    if (!isAdmin && modulo && temPermissao(modulo)) el.classList.remove('hidden');
    else el.classList.toggle('hidden', !isAdmin);
  });
  document.querySelectorAll('.admin-mestre').forEach(el => el.classList.toggle('hidden', !isAdmin && !isMestre));
  document.querySelectorAll('.operacional-info').forEach(el => el.classList.toggle('hidden', isAdmin));

  if (isMestre) {
    // Mestre: se não tem nenhum módulo extra liberado, focar em diárias
    const temAlgoExtra = _MODULOS_PERMISSAO.some(m => m.key !== 'diarias' && temPermissao(m.key));
    if (!temAlgoExtra) {
      const bnav = document.getElementById('bottom-nav');
      if (bnav) bnav.style.display = 'none';
      setTimeout(() => setView('diarias'), 100);
      diarPanelRecolhido = false;
      const pl = document.getElementById('diar-panelLeft');
      if (pl) pl.classList.remove('recolhido');
    }
  }

  // Esconder labels de grupo do sidebar se todos os itens dentro estão hidden
  // E recolher todos os grupos por padrão (exceto VISÃO que tem o Resumo)
  document.querySelectorAll('.sidebar-group-label').forEach(label => {
    if (label.id === 'label-superadmin') return;
    const group = label.nextElementSibling;
    if (!group || !group.classList.contains('sidebar-group')) return;
    const btns = [...group.querySelectorAll('.nav-btn')];
    const todosHidden = btns.length > 0 && btns.every(b => b.classList.contains('hidden'));
    label.style.display = todosHidden ? 'none' : '';
    group.style.display = todosHidden ? 'none' : '';
    if (!todosHidden) {
      // Recolher todos exceto VISÃO
      const isVisao = label.textContent.trim() === 'VISÃO';
      if (!isVisao) {
        group.classList.add('collapsed');
        label.classList.add('collapsed');
        group.style.maxHeight = '0px';
      }
    }
  });
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
    if (isAdmin !== true) return;
    _isSuperAdmin = true;

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

    // Mostrar itens exclusivos de super admin
    document.querySelectorAll('.superadmin-only').forEach(el => el.classList.remove('hidden'));

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
  if (typeof loadCompanyPlan === 'function') await loadCompanyPlan();
  // Mostrar nome da empresa no header
  try {
    const r = await sbGet('companies', '?id=eq.' + companyId + '&select=name');
    const badge = document.getElementById('empresa-badge');
    if (badge && r && r[0]) {
      badge.textContent = r[0].name;
      badge.style.display = 'inline-block';
    }
  } catch(e) {}
  // Recarregar dados com a nova empresa e voltar pro dashboard
  if (typeof iniciarApp === 'function') await iniciarApp();
  if (typeof setView === 'function') setView('dashboard');
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
        plan: 'trial',
        trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
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

    // 6. Notificar no Telegram
    notificarTelegram(TG_CHAT_EDR,
      '🏗 <b>Novo cliente EDR System!</b>\n\n' +
      '👤 ' + nome + '\n' +
      '🏢 ' + empresa + '\n' +
      '📍 ' + (cidade || 'N/I') + '\n' +
      '📧 ' + email + '\n' +
      '📅 ' + new Date().toLocaleString('pt-BR')
    );

    // 7. Entrar no app
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
      '<option value="trial"' + (c.plan === 'trial' ? ' selected' : '') + '>Trial (14 dias)</option>' +
      '<option value="obra"' + (c.plan === 'obra' ? ' selected' : '') + '>Obra — R$9,90 (1 obra, 2 usr)</option>' +
      '<option value="construtora"' + (c.plan === 'construtora' ? ' selected' : '') + '>Construtora — R$29,90 (3 obras, 5 usr)</option>' +
      '<option value="incorporadora"' + (c.plan === 'incorporadora' ? ' selected' : '') + '>Incorporadora — R$49,90 (ilimitado)</option>' +
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
async function excluirEmpresa(id, nome) {
  if (!confirm('Excluir a empresa "' + nome + '"?\n\nTodos os dados vinculados serão removidos. Essa ação não pode ser desfeita.')) return;
  if (!confirm('TEM CERTEZA? Digite OK pra confirmar.')) return;
  try {
    // 1. Remover vínculos de usuários
    await sbDelete('company_users', '?company_id=eq.' + id);
    // 2. Remover a empresa
    await sbDelete('companies', '?id=eq.' + id);
    alert('Empresa "' + nome + '" excluída.');
    renderPainelEmpresas();
  } catch(e) {
    alert('Erro ao excluir empresa: ' + e.message);
  }
}

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

// ══════════════════════════════════════════
// TELA USUÁRIOS (admin da empresa)
// ══════════════════════════════════════════

async function renderUsuarios() {
  const el = document.getElementById('usuarios-container');
  if (!el || !_companyId) return;

  el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--texto3);">Carregando...</div>';

  try {
    const hdrs = { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + _authToken };
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/list_company_users`, {
      method: 'POST',
      headers: { ...hdrs, 'Content-Type': 'application/json' },
      body: '{}'
    });
    const allUsers = await r.json();
    const users = Array.isArray(allUsers) ? allUsers.filter(u => u.company_id === _companyId) : [];
    // Buscar senhas iniciais da company_users
    let cuData = [];
    try {
      cuData = await sbGet('company_users', '?company_id=eq.' + _companyId + '&select=user_id,senha_inicial,role,active,permissions');
      if (!Array.isArray(cuData)) cuData = [];
    } catch(e) {}
    const cuMap = {};
    cuData.forEach(cu => { cuMap[cu.user_id] = { senha: cu.senha_inicial || '', active: cu.active !== false, permissions: cu.permissions || {} }; });
    const lim = getLimites();
    const plano = PLANOS[_companyPlan?.plan] || PLANOS.trial;

    let html = '<div style="max-width:700px;margin:0 auto;padding:20px;">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">';
    html += '<div><h2 style="margin:0;font-size:20px;">Usuarios</h2>';
    html += '<span style="font-size:12px;color:var(--texto3);">' + users.length + ' de ' + (lim.usuarios >= 999 ? 'ilimitado' : lim.usuarios) + ' no plano ' + plano.nome + '</span></div>';
    html += '<button onclick="abrirModalConvite()" style="padding:10px 20px;border-radius:10px;border:none;background:var(--verde);color:#000;font-weight:700;font-size:13px;cursor:pointer;font-family:inherit;">+ CONVIDAR</button>';
    html += '</div>';

    // Tabela de usuarios
    html += '<div style="background:var(--cinza-escuro,#141414);border:1px solid var(--borda);border-radius:12px;overflow:hidden;">';
    if (users.length === 0) {
      html += '<div style="padding:40px;text-align:center;color:var(--texto3);">Nenhum usuario encontrado.</div>';
    } else {
      html += '<table style="width:100%;border-collapse:collapse;">';
      html += '<thead><tr style="border-bottom:1px solid var(--borda);">';
      html += '<th style="padding:12px 16px;text-align:left;font-size:11px;color:var(--texto3);font-weight:700;">NOME</th>';
      html += '<th style="padding:12px 16px;text-align:left;font-size:11px;color:var(--texto3);font-weight:700;">LOGIN</th>';
      html += '<th style="padding:12px 16px;text-align:left;font-size:11px;color:var(--texto3);font-weight:700;">SENHA</th>';
      html += '<th style="padding:12px 16px;text-align:left;font-size:11px;color:var(--texto3);font-weight:700;">PERFIL</th>';
      html += '<th style="padding:12px 16px;text-align:center;font-size:11px;color:var(--texto3);font-weight:700;">STATUS</th>';
      html += '<th style="padding:12px 16px;text-align:center;font-size:11px;color:var(--texto3);font-weight:700;width:100px;">ACOES</th>';
      html += '</tr></thead><tbody>';
      users.forEach(u => {
        const isMe = u.user_id === usuarioAtual.id;
        const cu = cuMap[u.user_id] || { senha: '', active: true, permissions: {} };
        const isActive = cu.active;
        html += '<tr style="border-bottom:1px solid var(--borda,#222);' + (!isActive ? 'opacity:0.45;' : '') + '">';
        html += '<td style="padding:12px 16px;font-size:13px;">' + (u.nome || '-') + (isMe ? ' <span style="color:var(--verde);font-size:10px;font-weight:700;">(voce)</span>' : '') + '</td>';
        const loginDisplay = (u.email || '').endsWith('@edr.app') ? _formatarTelefone(u.email.replace('@edr.app','')) : (u.email || '-');
        html += '<td style="padding:12px 16px;font-size:13px;color:var(--texto3);">' + loginDisplay + '</td>';
        html += '<td style="padding:12px 16px;font-size:12px;color:var(--texto3);font-family:\'JetBrains Mono\',monospace;">' + (cu.senha || '<span style="color:var(--texto3);opacity:0.4;">-</span>') + '</td>';
        html += '<td style="padding:12px 16px;font-size:13px;">' + formatPerfil(u.role) + '</td>';
        // Status ativo/inativo com toggle
        html += '<td style="padding:12px 16px;text-align:center;">';
        if (!isMe) {
          html += '<button onclick="toggleAtivoMembro(\'' + u.user_id + '\',' + isActive + ')" style="background:none;border:none;cursor:pointer;font-size:11px;font-weight:700;font-family:inherit;padding:4px 10px;border-radius:10px;' + (isActive ? 'color:#22c55e;background:rgba(34,197,94,0.1);' : 'color:#ef4444;background:rgba(239,68,68,0.1);') + '">' + (isActive ? 'ATIVO' : 'INATIVO') + '</button>';
        } else {
          html += '<span style="color:#22c55e;font-size:11px;font-weight:700;">ATIVO</span>';
        }
        html += '</td>';
        // Ações: editar + remover
        html += '<td style="padding:12px 16px;text-align:center;">';
        if (!isMe) {
          const permData = btoa(JSON.stringify(cu.permissions));
          html += '<button onclick="abrirModalEditarUsuario(\'' + u.user_id + '\',\'' + (u.nome || '').replace(/'/g, '') + '\',\'' + (u.email || '').replace(/'/g, '') + '\',\'' + (u.role || 'operacional') + '\',\'' + permData + '\')" style="background:none;border:none;color:#3b82f6;cursor:pointer;font-size:14px;margin-right:6px;" title="Editar">&#9998;</button>';
          html += '<button onclick="removerMembro(\'' + u.user_id + '\',\'' + (u.nome || u.email || '').replace(/'/g, '') + '\')" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:14px;" title="Remover">&#10005;</button>';
        }
        html += '</td></tr>';
      });
      html += '</tbody></table>';
    }
    html += '</div></div>';

    // Modal convite
    html += '<div id="modal-convite" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;display:none;align-items:center;justify-content:center;">';
    html += '<div style="background:var(--cinza-escuro,#1a1a1a);border:1px solid var(--borda);border-radius:16px;padding:30px;width:90%;max-width:400px;">';
    html += '<h3 style="margin:0 0 20px;font-size:16px;">Convidar Usuario</h3>';
    html += '<label style="font-size:11px;color:var(--texto3);font-weight:700;display:block;margin-bottom:4px;">NOME</label>';
    html += '<input id="conv-nome" type="text" placeholder="Nome completo" style="width:100%;padding:10px;background:var(--bg);border:1px solid var(--borda);border-radius:8px;color:#fafafa;font-size:13px;font-family:inherit;margin-bottom:12px;box-sizing:border-box;">';
    html += '<label style="font-size:11px;color:var(--texto3);font-weight:700;display:block;margin-bottom:4px;">TELEFONE OU EMAIL</label>';
    html += '<input id="conv-email" type="text" placeholder="(87) 9 8171-3987 ou email@exemplo.com" style="width:100%;padding:10px;background:var(--bg);border:1px solid var(--borda);border-radius:8px;color:#fafafa;font-size:13px;font-family:inherit;margin-bottom:12px;box-sizing:border-box;">';
    html += '<label style="font-size:11px;color:var(--texto3);font-weight:700;display:block;margin-bottom:4px;">SENHA INICIAL</label>';
    html += '<input id="conv-senha" type="text" placeholder="Minimo 6 caracteres" style="width:100%;padding:10px;background:var(--bg);border:1px solid var(--borda);border-radius:8px;color:#fafafa;font-size:13px;font-family:inherit;margin-bottom:12px;box-sizing:border-box;">';
    html += '<label style="font-size:11px;color:var(--texto3);font-weight:700;display:block;margin-bottom:4px;">PERFIL</label>';
    html += '<select id="conv-perfil" style="width:100%;padding:10px;background:var(--bg);border:1px solid var(--borda);border-radius:8px;color:#fafafa;font-size:13px;font-family:inherit;margin-bottom:20px;">';
    html += '<option value="operacional">Operacional</option>';
    html += '<option value="mestre">Mestre de Obra</option>';
    html += '<option value="admin">Administrador</option>';
    html += '</select>';
    html += '<div id="conv-erro" style="color:#ef4444;font-size:12px;margin-bottom:12px;"></div>';
    html += '<div style="display:flex;gap:10px;">';
    html += '<button onclick="fecharModalConvite()" style="flex:1;padding:12px;border-radius:10px;border:1px solid var(--borda);background:none;color:var(--texto3);font-weight:700;font-size:13px;cursor:pointer;font-family:inherit;">CANCELAR</button>';
    html += '<button id="btn-convidar" onclick="convidarUsuario()" style="flex:1;padding:12px;border-radius:10px;border:none;background:var(--verde);color:#000;font-weight:700;font-size:13px;cursor:pointer;font-family:inherit;">CONVIDAR</button>';
    html += '</div></div></div>';

    el.innerHTML = html;
  } catch(e) {
    el.innerHTML = '<div style="text-align:center;padding:40px;color:#ef4444;">Erro ao carregar usuarios.</div>';
  }
}

function formatPerfil(role) {
  const cores = { admin: '#a855f7', operacional: '#3b82f6', mestre: '#f59e0b', visitante: '#6b7280' };
  const nomes = { admin: 'Admin', operacional: 'Operacional', mestre: 'Mestre', visitante: 'Visitante' };
  const cor = cores[role] || '#6b7280';
  return '<span style="background:' + cor + '20;color:' + cor + ';padding:3px 10px;border-radius:10px;font-size:11px;font-weight:700;">' + (nomes[role] || role || '-') + '</span>';
}

function abrirModalConvite() {
  const modal = document.getElementById('modal-convite');
  if (modal) {
    modal.style.display = 'flex';
    document.getElementById('conv-nome').value = '';
    document.getElementById('conv-email').value = '';
    document.getElementById('conv-senha').value = '';
    document.getElementById('conv-perfil').value = 'operacional';
    document.getElementById('conv-erro').textContent = '';
  }
}

function fecharModalConvite() {
  const modal = document.getElementById('modal-convite');
  if (modal) modal.style.display = 'none';
}

// ── TOGGLE ATIVO/INATIVO ──────────────────────────────
async function toggleAtivoMembro(userId, atualAtivo) {
  const novoStatus = !atualAtivo;
  try {
    const hdrs = { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + _authToken, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' };
    const r = await fetch(`${SUPABASE_URL}/rest/v1/company_users?company_id=eq.${_companyId}&user_id=eq.${userId}`, {
      method: 'PATCH', headers: hdrs,
      body: JSON.stringify({ active: novoStatus })
    });
    if (!r.ok) throw new Error(await r.text());
    showToast(novoStatus ? 'Usuario ativado.' : 'Usuario desativado.');
    renderUsuarios();
  } catch(e) {
    alert('Erro: ' + e.message);
  }
}

// ── MODAL EDITAR USUARIO ──────────────────────────────
const _MODULOS_PERMISSAO = [
  { key: 'dashboard', nome: 'Resumo / Dashboard' },
  { key: 'obras', nome: 'Obras' },
  { key: 'estoque', nome: 'Estoque' },
  { key: 'catalogo', nome: 'Catalogo de Materiais' },
  { key: 'notas', nome: 'Notas Fiscais' },
  { key: 'lancamentos', nome: 'Lancamentos' },
  { key: 'financeiro', nome: 'Financeiro (Caixa, Contas)' },
  { key: 'diarias', nome: 'Diarias / Equipe' },
  { key: 'relatorio', nome: 'Relatorios' },
  { key: 'leads', nome: 'Comercial / Leads' },
  { key: 'custos', nome: 'Custos de Obra' },
  { key: 'garantias', nome: 'Garantias' }
];

function abrirModalEditarUsuario(userId, nome, email, role, permB64) {
  let perms = {};
  try { perms = JSON.parse(atob(permB64 || '')); } catch(e) {}

  const loginDisplay = email.endsWith('@edr.app') ? _formatarTelefone(email.replace('@edr.app','')) : email;

  let html = '<div id="modal-editar-user" style="position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center;">';
  html += '<div style="background:var(--cinza-escuro,#1a1a1a);border:1px solid var(--borda);border-radius:16px;padding:30px;width:90%;max-width:450px;max-height:85vh;overflow-y:auto;">';
  html += '<h3 style="margin:0 0 6px;font-size:16px;">Editar Usuario</h3>';
  html += '<div style="font-size:12px;color:var(--texto3);margin-bottom:20px;">' + loginDisplay + '</div>';

  // Nome
  html += '<label style="font-size:11px;color:var(--texto3);font-weight:700;display:block;margin-bottom:4px;">NOME</label>';
  html += '<input id="edit-nome" type="text" value="' + nome + '" style="width:100%;padding:10px;background:var(--bg);border:1px solid var(--borda);border-radius:8px;color:#fafafa;font-size:13px;font-family:inherit;margin-bottom:12px;box-sizing:border-box;">';

  // Perfil
  html += '<label style="font-size:11px;color:var(--texto3);font-weight:700;display:block;margin-bottom:4px;">PERFIL</label>';
  html += '<select id="edit-perfil" style="width:100%;padding:10px;background:var(--bg);border:1px solid var(--borda);border-radius:8px;color:#fafafa;font-size:13px;font-family:inherit;margin-bottom:12px;">';
  html += '<option value="operacional"' + (role==='operacional' ? ' selected' : '') + '>Operacional</option>';
  html += '<option value="mestre"' + (role==='mestre' ? ' selected' : '') + '>Mestre de Obra</option>';
  html += '<option value="admin"' + (role==='admin' ? ' selected' : '') + '>Administrador</option>';
  html += '</select>';

  // Nova senha
  html += '<label style="font-size:11px;color:var(--texto3);font-weight:700;display:block;margin-bottom:4px;">NOVA SENHA <span style="font-weight:400;opacity:0.6;">(deixe vazio para manter)</span></label>';
  html += '<input id="edit-senha" type="text" placeholder="Nova senha (min 6)" style="width:100%;padding:10px;background:var(--bg);border:1px solid var(--borda);border-radius:8px;color:#fafafa;font-size:13px;font-family:inherit;margin-bottom:16px;box-sizing:border-box;">';

  // Permissões extras (só aparece pra operacional/mestre)
  html += '<div id="edit-perms-container">';
  html += '<label style="font-size:11px;color:var(--texto3);font-weight:700;display:block;margin-bottom:8px;">PERMISSOES EXTRAS</label>';
  html += '<div style="font-size:11px;color:var(--texto3);margin-bottom:10px;opacity:0.7;">Liberar modulos que normalmente sao exclusivos do admin:</div>';
  _MODULOS_PERMISSAO.forEach(m => {
    const checked = perms[m.key] ? ' checked' : '';
    html += '<label style="display:flex;align-items:center;gap:8px;padding:6px 0;font-size:13px;color:var(--texto2);cursor:pointer;">';
    html += '<input type="checkbox" class="perm-check" data-key="' + m.key + '"' + checked + ' style="accent-color:var(--verde);width:16px;height:16px;cursor:pointer;">';
    html += m.nome + '</label>';
  });
  html += '</div>';

  // Erro + botões
  html += '<div id="edit-erro" style="color:#ef4444;font-size:12px;margin:12px 0;"></div>';
  html += '<div style="display:flex;gap:10px;">';
  html += '<button onclick="document.getElementById(\'modal-editar-user\')?.remove()" style="flex:1;padding:12px;border-radius:10px;border:1px solid var(--borda);background:none;color:var(--texto3);font-weight:700;font-size:13px;cursor:pointer;font-family:inherit;">CANCELAR</button>';
  html += '<button onclick="salvarEdicaoUsuario(\'' + userId + '\',\'' + email.replace(/'/g, '') + '\')" style="flex:1;padding:12px;border-radius:10px;border:none;background:var(--verde);color:#000;font-weight:700;font-size:13px;cursor:pointer;font-family:inherit;">SALVAR</button>';
  html += '</div></div></div>';

  document.getElementById('modal-editar-user')?.remove();
  document.body.insertAdjacentHTML('beforeend', html);

  // Mostrar/ocultar permissões conforme perfil
  const selPerfil = document.getElementById('edit-perfil');
  const permsContainer = document.getElementById('edit-perms-container');
  function togglePermsVisibility() {
    permsContainer.style.display = selPerfil.value === 'admin' ? 'none' : '';
  }
  selPerfil.addEventListener('change', togglePermsVisibility);
  togglePermsVisibility();
}

async function salvarEdicaoUsuario(userId, email) {
  const nome = document.getElementById('edit-nome').value.trim();
  const perfil = document.getElementById('edit-perfil').value;
  const novaSenha = document.getElementById('edit-senha').value;
  const errEl = document.getElementById('edit-erro');
  errEl.textContent = '';

  if (!nome) { errEl.textContent = 'Nome obrigatorio.'; return; }
  if (novaSenha && novaSenha.length < 6) { errEl.textContent = 'Senha deve ter pelo menos 6 caracteres.'; return; }

  // Montar permissões
  const perms = {};
  document.querySelectorAll('.perm-check').forEach(cb => {
    if (cb.checked) perms[cb.dataset.key] = true;
  });

  try {
    const hdrs = { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + _authToken, 'Content-Type': 'application/json' };

    // 1. Atualizar company_users (perfil + permissões)
    const cuBody = { role: perfil, permissions: perms };
    if (novaSenha) cuBody.senha_inicial = novaSenha;
    const r1 = await fetch(`${SUPABASE_URL}/rest/v1/company_users?company_id=eq.${_companyId}&user_id=eq.${userId}`, {
      method: 'PATCH', headers: { ...hdrs, 'Prefer': 'return=minimal' },
      body: JSON.stringify(cuBody)
    });
    if (!r1.ok) throw new Error(await r1.text());

    // 2. Atualizar auth.users (nome, perfil, senha)
    const updates = { user_metadata: { nome, perfil } };
    if (novaSenha) updates.password = novaSenha;
    const r2 = await fetch(`${SUPABASE_URL}/rest/v1/rpc/admin_update_auth_user`, {
      method: 'POST', headers: hdrs,
      body: JSON.stringify({ p_email: email, p_updates: JSON.stringify(updates) })
    });
    if (!r2.ok) {
      const err = await r2.json().catch(() => ({}));
      throw new Error(err.message || 'Erro ao atualizar auth');
    }

    document.getElementById('modal-editar-user')?.remove();
    showToast('Usuario atualizado.');
    renderUsuarios();
  } catch(e) {
    errEl.textContent = 'Erro: ' + e.message;
  }
}

// ══════════════════════════════════════════════════════
// PERMISSÕES POR PERFIL — Configuração da empresa
// ══════════════════════════════════════════════════════

// Padrão de permissões por perfil (o que já funciona hoje)
const _PERMS_PADRAO = {
  admin: {
    dashboard: true, obras: true, estoque: true, catalogo: true,
    notas: true, lancamentos: true, financeiro: true, diarias: true,
    relatorio: true, leads: true, custos: true, garantias: true
  },
  operacional: {
    dashboard: true, obras: true, estoque: true, catalogo: false,
    notas: false, lancamentos: false, financeiro: false, diarias: true,
    relatorio: false, leads: false, custos: false, garantias: false
  },
  mestre: {
    dashboard: false, obras: false, estoque: false, catalogo: false,
    notas: false, lancamentos: false, financeiro: false, diarias: true,
    relatorio: false, leads: false, custos: false, garantias: false
  }
};

async function renderPermissoes() {
  const el = document.getElementById('permissoes-container');
  if (!el || !_companyId) return;

  el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--texto3);">Carregando...</div>';

  // Carregar config atual da empresa
  let rolePerms = {};
  try {
    const comp = await fetch(`${SUPABASE_URL}/rest/v1/companies?id=eq.${_companyId}&select=role_permissions`, {
      headers: getHdrs()
    }).then(r => r.json());
    if (comp && comp[0] && comp[0].role_permissions) rolePerms = comp[0].role_permissions;
  } catch(e) {}

  const perfis = ['operacional', 'mestre'];
  let html = '<div style="max-width:600px;margin:0 auto;padding:20px;">';
  html += '<div style="margin-bottom:20px;">';
  html += '<div style="font-size:12px;color:var(--texto3);line-height:1.6;">Configure quais modulos cada perfil pode acessar. Admin sempre tem acesso total.</div>';
  html += '</div>';

  perfis.forEach(perfil => {
    const permsAtuais = rolePerms[perfil] || _PERMS_PADRAO[perfil] || {};
    const nomesPerfil = { operacional: 'OPERACIONAL', mestre: 'MESTRE DE OBRA' };
    const coresPerfil = { operacional: '#3b82f6', mestre: '#f59e0b' };
    const cor = coresPerfil[perfil];

    html += '<div style="background:var(--cinza-escuro,#141414);border:1px solid var(--borda);border-radius:12px;margin-bottom:16px;overflow:hidden;">';
    // Header
    html += '<div style="padding:16px;border-bottom:1px solid var(--borda);display:flex;align-items:center;gap:10px;">';
    html += '<span style="background:' + cor + '20;color:' + cor + ';padding:4px 12px;border-radius:8px;font-size:11px;font-weight:800;letter-spacing:1px;">' + nomesPerfil[perfil] + '</span>';
    html += '</div>';
    // Módulos
    html += '<div style="padding:8px 0;">';
    _MODULOS_PERMISSAO.forEach(m => {
      const ativo = permsAtuais[m.key] !== undefined ? permsAtuais[m.key] : (_PERMS_PADRAO[perfil]?.[m.key] || false);
      html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.03);">';
      html += '<span style="font-size:13px;color:var(--texto2);">' + m.nome + '</span>';
      html += '<label style="position:relative;display:inline-block;width:44px;height:24px;flex-shrink:0;">';
      html += '<input type="checkbox" class="perm-toggle" data-perfil="' + perfil + '" data-modulo="' + m.key + '"' + (ativo ? ' checked' : '') + ' onchange="marcarPermissoesAlteradas()" style="opacity:0;width:0;height:0;">';
      html += '<span style="position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:' + (ativo ? 'var(--verde)' : 'rgba(255,255,255,0.1)') + ';border-radius:24px;transition:all .3s;"></span>';
      html += '<span style="position:absolute;height:18px;width:18px;left:' + (ativo ? '23px' : '3px') + ';bottom:3px;background:#fff;border-radius:50%;transition:all .3s;"></span>';
      html += '</label>';
      html += '</div>';
    });
    html += '</div></div>';
  });

  // Botão salvar
  html += '<div style="text-align:center;margin-top:8px;">';
  html += '<button id="btn-salvar-perms" onclick="salvarPermissoesPerfis()" style="width:100%;padding:14px;border-radius:10px;border:none;background:var(--verde);color:#000;font-weight:700;font-size:13px;cursor:pointer;font-family:inherit;opacity:0.5;" disabled>SALVAR PERMISSOES</button>';
  html += '</div>';

  html += '</div>';
  el.innerHTML = html;

  // Atualizar visual dos toggles ao mudar
  el.querySelectorAll('.perm-toggle').forEach(cb => {
    cb.addEventListener('change', function() {
      const slider = this.nextElementSibling;
      const dot = slider.nextElementSibling;
      slider.style.background = this.checked ? 'var(--verde)' : 'rgba(255,255,255,0.1)';
      dot.style.left = this.checked ? '23px' : '3px';
    });
  });
}

function marcarPermissoesAlteradas() {
  const btn = document.getElementById('btn-salvar-perms');
  if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
}

async function salvarPermissoesPerfis() {
  const btn = document.getElementById('btn-salvar-perms');
  if (btn) { btn.disabled = true; btn.textContent = 'SALVANDO...'; }

  const perms = { operacional: {}, mestre: {} };
  document.querySelectorAll('.perm-toggle').forEach(cb => {
    const perfil = cb.dataset.perfil;
    const modulo = cb.dataset.modulo;
    if (perms[perfil]) perms[perfil][modulo] = cb.checked;
  });

  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/companies?id=eq.${_companyId}`, {
      method: 'PATCH',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + _authToken, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify({ role_permissions: perms })
    });
    if (!r.ok) throw new Error(await r.text());
    showToast('Permissoes salvas.');
    if (btn) { btn.textContent = 'SALVAR PERMISSOES'; btn.style.opacity = '0.5'; }
  } catch(e) {
    alert('Erro: ' + e.message);
    if (btn) { btn.disabled = false; btn.textContent = 'SALVAR PERMISSOES'; btn.style.opacity = '1'; }
  }
}

async function convidarUsuario() {
  const nome = document.getElementById('conv-nome').value.trim();
  const inputLogin = document.getElementById('conv-email').value.trim().toLowerCase();
  const senha = document.getElementById('conv-senha').value;
  const perfil = document.getElementById('conv-perfil').value;
  const errEl = document.getElementById('conv-erro');
  const btn = document.getElementById('btn-convidar');

  errEl.textContent = '';
  if (!nome || !inputLogin || !senha) { errEl.textContent = 'Preencha todos os campos.'; return; }
  const email = _resolverLogin(inputLogin);
  if (!email.includes('@')) { errEl.textContent = 'Informe um telefone valido ou email.'; return; }
  if (senha.length < 6) { errEl.textContent = 'Senha deve ter pelo menos 6 caracteres.'; return; }

  // Checar limite do plano
  if (!(await checarLimiteUsuarios())) return;

  btn.disabled = true;
  btn.textContent = 'CRIANDO...';

  try {
    // 1. Criar usuario no Supabase Auth
    const r = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password: senha,
        data: { nome, perfil, usuario: email.split('@')[0] }
      })
    });
    const data = await r.json();

    if (!r.ok || data.error) {
      const msg = data.error_description || data.msg || data.error?.message || '';
      errEl.textContent = msg.includes('already registered') ? 'Este email ja esta cadastrado.' : 'Erro: ' + msg;
      btn.disabled = false;
      btn.textContent = 'CONVIDAR';
      return;
    }

    // 2. Vincular a empresa
    const hdrs = { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + _authToken, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' };
    const rVinc = await fetch(`${SUPABASE_URL}/rest/v1/company_users`, {
      method: 'POST',
      headers: hdrs,
      body: JSON.stringify({
        company_id: _companyId,
        user_id: data.user.id,
        role: perfil,
        active: true
      })
    });
    if (!rVinc.ok) {
      const errVinc = await rVinc.text().catch(() => '');
      errEl.textContent = 'Usuario criado mas erro ao vincular a empresa: ' + errVinc;
      btn.disabled = false;
      btn.textContent = 'CONVIDAR';
      return;
    }

    // Salvar senha inicial no vínculo
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/company_users?company_id=eq.${_companyId}&user_id=eq.${data.user.id}`, {
        method: 'PATCH',
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + _authToken, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ senha_inicial: senha })
      });
    } catch(e) {}

    fecharModalConvite();
    renderUsuarios();

    // Montar mensagem WhatsApp com credenciais
    const telefone = inputLogin.replace(/\D/g, '');
    const loginExibido = inputLogin.includes('@') ? inputLogin : inputLogin;
    const msgWpp = 'Ola ' + nome + '! Voce foi convidado para o EDR System.\n\n' +
      'Acesse: sistema.edreng.com.br\n' +
      'Login: ' + loginExibido + '\n' +
      'Senha: ' + senha + '\n\n' +
      'Troque sua senha no primeiro acesso.';
    const wppNum = telefone.length >= 10 ? (telefone.startsWith('55') ? telefone : '55' + telefone) : '';

    if (wppNum) {
      // Mostrar modal com link WhatsApp + botão copiar
      const wppLink = 'https://wa.me/' + wppNum + '?text=' + encodeURIComponent(msgWpp);
      const modalWpp = document.createElement('div');
      modalWpp.id = 'modal-wpp';
      modalWpp.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center;';
      modalWpp.innerHTML = '<div style="background:var(--cinza-escuro,#1a1a1a);border:1px solid var(--borda);border-radius:16px;padding:24px;width:90%;max-width:400px;">' +
        '<div style="font-size:14px;font-weight:700;margin-bottom:16px;color:var(--verde);">Usuario criado!</div>' +
        '<div style="background:var(--bg);border:1px solid var(--borda);border-radius:8px;padding:12px;font-size:12px;white-space:pre-line;margin-bottom:16px;color:var(--texto2);line-height:1.6;">' + msgWpp + '</div>' +
        '<div style="display:flex;gap:8px;">' +
        '<button onclick="navigator.clipboard.writeText(\'' + msgWpp.replace(/'/g,"\\'").replace(/\n/g,'\\n') + '\');showToast(\'Copiado!\')" style="flex:1;padding:12px;border-radius:10px;border:1px solid var(--borda);background:none;color:var(--texto2);font-weight:700;font-size:12px;cursor:pointer;font-family:inherit;">COPIAR</button>' +
        '<a href="' + wppLink + '" target="_blank" style="flex:1;padding:12px;border-radius:10px;border:none;background:#25D366;color:#fff;font-weight:700;font-size:12px;cursor:pointer;font-family:inherit;text-align:center;text-decoration:none;display:flex;align-items:center;justify-content:center;">ENVIAR WHATSAPP</a>' +
        '</div>' +
        '<button onclick="document.getElementById(\'modal-wpp\')?.remove()" style="width:100%;margin-top:10px;padding:10px;border-radius:10px;border:1px solid var(--borda);background:none;color:var(--texto3);font-size:12px;cursor:pointer;font-family:inherit;">FECHAR</button>' +
        '</div>';
      document.body.appendChild(modalWpp);
    } else {
      showToast('Usuario ' + nome + ' convidado com sucesso!');
    }
  } catch(e) {
    errEl.textContent = 'Erro de conexao. Tente novamente.';
  }
  btn.disabled = false;
  btn.textContent = 'CONVIDAR';
}

async function removerMembro(userId, nome) {
  if (!confirm('Remover "' + nome + '" da equipe?')) return;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/admin_delete_auth_user`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + _authToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_user_id: userId })
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.message || 'Erro ao remover');
    }
    renderUsuarios();
    showToast('Usuario removido.');
  } catch(e) {
    alert('Erro ao remover: ' + e.message);
  }
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
