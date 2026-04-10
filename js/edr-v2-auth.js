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
  // Atualizar sessão com dados completos (perfil + permissions vindos do banco)
  try {
    const sess = JSON.parse(localStorage.getItem('edr_auth') || '{}');
    if (sess.access_token) {
      sess.user = { ...sess.user, ...usuarioAtual };
      localStorage.setItem('edr_auth', JSON.stringify(sess));
    }
  } catch(e) {}
  // Aplicar filtro visual de permissões no menu
  aplicarPermissoesVisuais(usuarioAtual.perfil, usuarioAtual.permissions);
  // Restaurar última view ou ir pro dashboard
  const lastView = localStorage.getItem('edr_last_view');
  if (typeof setView === 'function') setView(lastView || 'dashboard');
  // Onboarding wizard para novos tenants
  if (_companyId && typeof abrirOnboarding === 'function') {
    sbGet('companies', '?id=eq.' + _companyId + '&select=onboarding_done').then(r => {
      if (r && r[0] && r[0].onboarding_done === false) abrirOnboarding();
    }).catch(() => {});
  }
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
    // meta.nome vazio não herda nome de sessão anterior (evita vazar nome entre tenants)
    usuarioAtual.nome = meta.nome || data.user?.email || usuarioAtual.nome;
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
    const rows = await sbGet('company_users?user_id=eq.' + usuarioAtual.id + '&select=id,company_id,role,permissions&limit=1');
    if (rows && rows.length > 0) {
      _companyId = rows[0].company_id;
      if (rows[0].role) usuarioAtual.perfil = rows[0].role;
      if (rows[0].permissions !== undefined) usuarioAtual.permissions = rows[0].permissions;
      // Salvar nome/email no company_users para aparecer na tela de permissões
      if (usuarioAtual.nome || usuarioAtual.email) {
        sbPatch('company_users', rows[0].id, {
          nome: usuarioAtual.nome || '',
          email: usuarioAtual.email || ''
        }).catch(() => {});
      }
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
  { id: 'relatorio',    label: 'Relatório P&L' },
  { id: 'caixa',        label: 'Fluxo de Caixa' },
  { id: 'obras',        label: 'Obras' },
  { id: 'custos',       label: 'Custos CEF' },
  { id: 'cronograma',   label: 'Cronograma' },
  { id: 'orcamento',    label: 'Orçamento' },
  { id: 'adicionais',   label: 'Adicionais' },
  { id: 'garantias',    label: 'Garantias' },
  { id: 'pci',          label: 'PCI Medições' },
  { id: 'diario',       label: 'Diário de Obra' },
  { id: 'estoque',      label: 'Estoque' },
  { id: 'notas',        label: 'Notas Fiscais' },
  { id: 'catalogo',     label: 'Catálogo' },
  { id: 'contas-pagar', label: 'Contas a Pagar' },
  { id: 'creditos',     label: 'Créditos' },
  { id: 'diarias',      label: 'Diárias' },
  { id: 'leads',        label: 'Leads / CRM' },
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

  // Buscar usuários da empresa (nome/email agora estão em company_users)
  let usuarios = [];
  if (_companyId) {
    try {
      const rows = await sbGet('company_users', '?company_id=eq.' + _companyId + '&select=id,user_id,role,nome,email&order=nome');
      usuarios = Array.isArray(rows) ? rows : [];
    } catch(e) { usuarios = []; }
  }

  const isAdmin = usuarioAtual?.perfil === 'admin';
  const _PERFIS_EDITAVEIS = ['operacional','mestre','visitante']; // admin sempre tem tudo

  // ── MATRIZ DE ACESSO ──
  let matrizRows = _MODULOS_PERMISSAO.map(mod => {
    const colunas = _PERFIS.map(p => {
      const tem = _perfilTemAcesso(p.id, mod.id);
      const editavel = isAdmin && _PERFIS_EDITAVEIS.includes(p.id);
      const icon = tem
        ? `<span class="material-symbols-outlined" style="color:#16a34a;font-size:18px;vertical-align:middle;">check_circle</span>`
        : `<span class="material-symbols-outlined" style="color:#e5e7eb;font-size:18px;vertical-align:middle;">cancel</span>`;
      return `<td style="text-align:center;padding:7px 4px;">
        ${editavel
          ? `<span onclick="_togglePermissao('${p.id}','${mod.id}')" style="cursor:pointer;display:inline-block;" title="Clique para ${tem?'remover':'liberar'} acesso">${icon}</span>`
          : icon
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
      const perfilCor = (_PERFIS.find(p => p.id === perfilAtual) || {}).cor || '#6b7280';
      const nomeEsc = (u.nome||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'");
      const emailEsc = (u.email||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'");
      const nomeLabel = (u.nome||u.email||'este usuário').replace(/\\/g,'\\\\').replace(/'/g,"\\'");
      const editBtn = isAdmin
        ? `<div style="display:flex;gap:6px;align-items:center;">
            <button onclick="abrirModalEditarUsuario('${u.id}','${u.user_id||''}','${nomeEsc}','${emailEsc}','${perfilAtual}')"
              style="background:none;border:1px solid var(--border);border-radius:6px;padding:4px 8px;cursor:pointer;color:var(--text-secondary);display:flex;align-items:center;gap:3px;font-size:11px;font-weight:700;">
              <span class="material-symbols-outlined" style="font-size:14px;">edit</span>EDITAR
            </button>
            <button onclick="excluirUsuario('${u.id}','${nomeLabel}')"
              style="background:none;border:1px solid #fca5a5;border-radius:6px;padding:4px 8px;cursor:pointer;color:#dc2626;display:flex;align-items:center;gap:3px;font-size:11px;font-weight:700;">
              <span class="material-symbols-outlined" style="font-size:14px;">delete</span>
            </button>
          </div>`
        : `<span style="font-size:12px;font-weight:700;color:${perfilCor};">${perfilAtual.toUpperCase()}</span>`;

      return `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;margin-bottom:8px;border:1px solid var(--border);border-radius:8px;background:var(--card);">
        <div>
          <div style="font-size:13px;font-weight:700;color:var(--text-primary);">${u.nome || '—'}</div>
          <div style="font-size:11px;color:var(--text-tertiary);">${u.email || ''}</div>
          <div style="font-size:11px;font-weight:700;color:${perfilCor};margin-top:2px;">${perfilAtual.toUpperCase()}</div>
        </div>
        ${editBtn}
      </div>`;
    }).join('');
  }

  const isSuperAdmin = usuarioAtual?.email === 'admin@edreng.com.br';

  c.innerHTML = `
    ${isSuperAdmin ? `
    <div class="card" style="margin-bottom:12px;padding:16px;background:linear-gradient(135deg,#1B4332 0%,#2D6A4F 100%);">
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <div>
          <div style="font-size:13px;font-weight:700;color:#fff;margin-bottom:2px;">Novo Cliente</div>
          <div style="font-size:11px;color:rgba(255,255,255,.6);">Cria empresa + acesso no sistema</div>
        </div>
        <button onclick="abrirModalNovoCliente()" style="background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.25);color:#fff;border-radius:8px;padding:8px 14px;font-size:12px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:6px;font-family:inherit;">
          <span class="material-symbols-outlined" style="font-size:16px;">add_business</span>CRIAR CLIENTE
        </button>
      </div>
    </div>
    ` : ''}

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
        ${isAdmin ? '* Clique nos ícones de Operacional, Mestre e Visitante para liberar ou bloquear acesso.' : '* Visitante tem acesso somente leitura em cada módulo.'}
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

async function _togglePermissao(perfilId, moduloId) {
  if (usuarioAtual?.perfil !== 'admin') return;
  const atual = PERFIL_VIEWS[perfilId];
  if (atual === null) {
    // Era tudo — vira lista sem esse módulo
    const todos = _MODULOS_PERMISSAO.map(m => m.id).filter(id => id !== moduloId);
    PERFIL_VIEWS[perfilId] = todos;
  } else {
    const lista = Array.isArray(atual) ? [...atual] : [];
    const idx = lista.indexOf(moduloId);
    if (idx >= 0) lista.splice(idx, 1); else lista.push(moduloId);
    PERFIL_VIEWS[perfilId] = lista;
  }
  await _salvarPermissoes();
  if (typeof renderPermissoes === 'function') renderPermissoes();
}

async function _salvarPermissoes() {
  if (!_companyId) return;
  const perms = {
    operacional: PERFIL_VIEWS.operacional,
    mestre: PERFIL_VIEWS.mestre,
    visitante: PERFIL_VIEWS.visitante
  };
  try {
    await sbPatch('companies', '?id=eq.' + _companyId, { permissions: perms });
    if (typeof showToast === 'function') showToast('Permissões salvas.');
  } catch(e) {
    if (typeof showToast === 'function') showToast('Erro ao salvar permissões.');
  }
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

// ── MODAL EDITAR USUÁRIO ─────────────────────────────────────
let _editarUsuarioCompanyUserId = null;

async function abrirModalEditarUsuario(companyUserId, authUserId, nome, email, perfil) {
  if (usuarioAtual?.perfil !== 'admin') return;
  _editarUsuarioCompanyUserId = companyUserId;
  document.getElementById('editar-usuario-id').value = companyUserId;
  document.getElementById('editar-usuario-user-id').value = authUserId || '';
  document.getElementById('editar-usuario-nome').value = nome || '';
  document.getElementById('editar-usuario-email').value = email || '';
  document.getElementById('editar-usuario-perfil').value = perfil || 'operacional';
  const senhaEl = document.getElementById('editar-usuario-senha');
  if (senhaEl) senhaEl.value = '';
  // Carregar e renderizar permissões do usuário
  let userPerms = null;
  try {
    const rows = await sbGet('company_users?id=eq.' + companyUserId + '&select=permissions&limit=1');
    if (rows && rows.length > 0) userPerms = rows[0].permissions;
  } catch(e) {}
  _renderPermissoesCheckboxes(userPerms, perfil || 'operacional');
  if (typeof openModal === 'function') openModal('editar-usuario');
  else {
    const modal = document.getElementById('modal-editar-usuario');
    modal.classList.remove('hidden'); modal.classList.add('active');
  }
}

function fecharModalEditarUsuario() {
  if (typeof fecharModal === 'function') fecharModal('editar-usuario');
  else {
    const modal = document.getElementById('modal-editar-usuario');
    modal.classList.remove('active'); modal.classList.add('hidden');
  }
  _editarUsuarioCompanyUserId = null;
}

async function salvarEdicaoUsuario() {
  const id = document.getElementById('editar-usuario-id').value;
  const nome = document.getElementById('editar-usuario-nome').value.trim();
  const email = document.getElementById('editar-usuario-email').value.trim();
  const perfil = document.getElementById('editar-usuario-perfil').value;
  if (!id || !nome) { showToast('Informe o nome.'); return; }
  // Coletar permissões marcadas (null = sem restrição se for admin ou sem grid)
  let permissions = null;
  if (perfil !== 'admin') {
    const checkboxes = document.querySelectorAll('#editar-usuario-permissoes-grid input[type="checkbox"][data-perm]');
    if (checkboxes.length > 0) {
      permissions = Array.from(checkboxes).filter(c => c.checked).map(c => c.getAttribute('data-perm'));
    }
  }
  try {
    const ok = await sbPatch('company_users', '?id=eq.' + id, { nome, email, role: perfil, permissions });
    if (ok !== null) {
      showToast('Usuário atualizado.');
      fecharModalEditarUsuario();
      renderPermissoes();
    } else {
      showToast('Erro ao salvar.');
    }
  } catch(e) {
    showToast('Erro ao salvar.');
  }
}

async function definirSenhaUsuario() {
  const authUserId = document.getElementById('editar-usuario-user-id').value;
  const senha = document.getElementById('editar-usuario-senha').value;
  if (!senha || senha.length < 6) { showToast('Mínimo 6 caracteres.'); return; }
  if (!authUserId) { showToast('ID do usuário não encontrado. Salve primeiro.'); return; }
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/set-user-password`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + _supabaseToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ user_id: authUserId, password: senha })
    });
    const data = await r.json();
    if (r.ok && data.ok) {
      showToast('Senha definida com sucesso.');
      document.getElementById('editar-usuario-senha').value = '';
    } else {
      showToast(data.error || 'Erro ao definir senha.');
    }
  } catch(e) {
    showToast('Erro de conexão.');
  }
}

async function excluirUsuario(companyUserId, nome) {
  if (usuarioAtual?.perfil !== 'admin') return;
  const ok = await confirmar(`Remover "${nome}" do sistema? O usuário perderá o acesso ao EDR.`);
  if (!ok) return;
  try {
    const r = await sbDelete('company_users', '?id=eq.' + companyUserId);
    if (r) {
      showToast('Usuário removido.');
      renderPermissoes();
    } else {
      showToast('Erro ao remover usuário.');
    }
  } catch(e) {
    showToast('Erro ao remover usuário.');
  }
}

// ── PERMISSÕES VISUAIS DO MENU ───────────────────────────────
function aplicarPermissoesVisuais(perfil, permissions) {
  const btns = document.querySelectorAll('.sidebar .nav-btn[data-view]');
  // Prioridade: permissões por usuário → PERFIL_VIEWS da role → tudo
  let permsArray = Array.isArray(permissions) ? permissions : null;
  if (!permsArray && typeof PERFIL_VIEWS !== 'undefined') {
    const rolePerms = PERFIL_VIEWS[perfil];
    permsArray = Array.isArray(rolePerms) ? rolePerms : null;
  }
  if (perfil === 'admin' || !permsArray) {
    btns.forEach(b => b.classList.remove('perm-hidden'));
    document.querySelectorAll('.sidebar-group, .sidebar-group-label').forEach(el => el.classList.remove('perm-hidden'));
    return;
  }
  const permsSet = new Set(permsArray);
  btns.forEach(b => {
    b.classList.toggle('perm-hidden', !permsSet.has(b.getAttribute('data-view')));
  });
  // Ocultar grupos que ficaram sem nenhum item visível
  document.querySelectorAll('.sidebar-group').forEach(group => {
    const hasVisible = Array.from(group.querySelectorAll('.nav-btn[data-view]')).some(b => !b.classList.contains('perm-hidden'));
    const label = group.previousElementSibling;
    group.classList.toggle('perm-hidden', !hasVisible);
    if (label?.classList.contains('sidebar-group-label')) label.classList.toggle('perm-hidden', !hasVisible);
  });
}

// ── CHECKBOXES DE PERMISSÃO NO MODAL ─────────────────────────
function _renderPermissoesCheckboxes(permissions, perfil) {
  const section = document.getElementById('editar-usuario-permissoes-section');
  const grid = document.getElementById('editar-usuario-permissoes-grid');
  if (!section || !grid) return;
  if (perfil === 'admin') { section.style.display = 'none'; return; }
  section.style.display = '';
  // null = acesso total (sem restrição ainda definida → marcar tudo)
  const checkedSet = permissions ? new Set(permissions) : new Set(_MODULOS_PERMISSAO.map(m => m.id));
  grid.innerHTML = _MODULOS_PERMISSAO.map(mod =>
    `<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px;padding:3px 0;color:var(--text-primary);">
      <input type="checkbox" data-perm="${mod.id}" ${checkedSet.has(mod.id) ? 'checked' : ''}
        style="accent-color:var(--primary);width:13px;height:13px;flex-shrink:0;">
      ${mod.label}
    </label>`
  ).join('');
}

function _toggleTodasPermissoes() {
  const checkboxes = document.querySelectorAll('#editar-usuario-permissoes-grid input[type="checkbox"]');
  const allChecked = Array.from(checkboxes).every(c => c.checked);
  checkboxes.forEach(c => { c.checked = !allChecked; });
}

window.abrirModalEditarUsuario = abrirModalEditarUsuario;
window.fecharModalEditarUsuario = fecharModalEditarUsuario;
window.salvarEdicaoUsuario = salvarEdicaoUsuario;
window.definirSenhaUsuario = definirSenhaUsuario;
window.excluirUsuario = excluirUsuario;
window._toggleTodasPermissoes = _toggleTodasPermissoes;

// ── CRIAR NOVO USUÁRIO ────────────────────────────────────────
function abrirModalNovoUsuario() {
  if (usuarioAtual?.perfil !== 'admin') return;
  const modal = document.getElementById('modal-novo-usuario');
  if (!modal) return;
  document.getElementById('novo-usuario-nome').value = '';
  document.getElementById('novo-usuario-email').value = '';
  document.getElementById('novo-usuario-senha').value = '';
  document.getElementById('novo-usuario-perfil').value = 'operacional';
  document.getElementById('novo-usuario-erro').textContent = '';
  modal.classList.remove('hidden'); modal.classList.add('active');
  setTimeout(() => document.getElementById('novo-usuario-nome').focus(), 100);
}

function fecharModalNovoUsuario() {
  const modal = document.getElementById('modal-novo-usuario');
  if (!modal) return;
  modal.classList.remove('active'); modal.classList.add('hidden');
}

async function salvarNovoUsuario() {
  const nome = document.getElementById('novo-usuario-nome').value.trim();
  const email = document.getElementById('novo-usuario-email').value.trim().toLowerCase();
  const senha = document.getElementById('novo-usuario-senha').value;
  const perfil = document.getElementById('novo-usuario-perfil').value;
  const erroEl = document.getElementById('novo-usuario-erro');
  const btn = document.getElementById('novo-usuario-btn-salvar');

  erroEl.textContent = '';
  if (!nome) { erroEl.textContent = 'Informe o nome.'; return; }
  if (!email || !email.includes('@')) { erroEl.textContent = 'Informe um email válido.'; return; }
  if (!senha || senha.length < 6) { erroEl.textContent = 'Senha com mínimo 6 caracteres.'; return; }

  btn.disabled = true; btn.textContent = 'CRIANDO...';
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/create-user`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + _supabaseToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ nome, email, password: senha, role: perfil })
    });
    const data = await r.json();
    if (r.ok && data.ok) {
      showToast('Usuário criado com sucesso!');
      fecharModalNovoUsuario();
      renderPermissoes();
    } else {
      erroEl.textContent = data.error || 'Erro ao criar usuário.';
    }
  } catch(e) {
    erroEl.textContent = 'Erro de conexão.';
  }
  btn.disabled = false; btn.textContent = 'CRIAR USUÁRIO';
}

window.abrirModalNovoUsuario = abrirModalNovoUsuario;
window.fecharModalNovoUsuario = fecharModalNovoUsuario;
window.salvarNovoUsuario = salvarNovoUsuario;

// ── NOVO CLIENTE ─────────────────────────────────────────────
function _gerarSenha() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function abrirModalNovoCliente() {
  let m = document.getElementById('modal-novo-cliente');
  if (!m) {
    m = document.createElement('div');
    m.id = 'modal-novo-cliente';
    m.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;padding:16px;';
    m.innerHTML = `
      <div style="background:var(--card);border-radius:var(--radius-md);padding:24px;width:100%;max-width:420px;box-shadow:0 8px 32px rgba(0,0,0,.2);">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
          <div style="font-size:15px;font-weight:700;color:var(--text-primary);display:flex;align-items:center;gap:8px;">
            <span class="material-symbols-outlined" style="color:var(--primary);font-size:20px;">add_business</span>Novo Cliente
          </div>
          <button onclick="fecharModalNovoCliente()" style="background:none;border:none;cursor:pointer;color:var(--text-tertiary);display:flex;">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>

        <div id="ncl-form">
          <div style="display:flex;flex-direction:column;gap:14px;">
            <div>
              <label style="font-size:11px;font-weight:700;color:var(--text-tertiary);letter-spacing:.1em;text-transform:uppercase;display:block;margin-bottom:5px;">Nome da Empresa *</label>
              <input id="ncl-empresa" type="text" placeholder="Ex: Construtora Silva" style="width:100%;height:40px;padding:0 12px;border:1px solid var(--border);border-radius:8px;font-size:13px;color:var(--text-primary);background:var(--bg);outline:none;font-family:inherit;box-sizing:border-box;">
            </div>
            <div>
              <label style="font-size:11px;font-weight:700;color:var(--text-tertiary);letter-spacing:.1em;text-transform:uppercase;display:block;margin-bottom:5px;">Nome do Responsável</label>
              <input id="ncl-nome" type="text" placeholder="Ex: João Silva" style="width:100%;height:40px;padding:0 12px;border:1px solid var(--border);border-radius:8px;font-size:13px;color:var(--text-primary);background:var(--bg);outline:none;font-family:inherit;box-sizing:border-box;">
            </div>
            <div>
              <label style="font-size:11px;font-weight:700;color:var(--text-tertiary);letter-spacing:.1em;text-transform:uppercase;display:block;margin-bottom:5px;">E-mail de Acesso *</label>
              <input id="ncl-email" type="email" placeholder="joao@construtora.com" style="width:100%;height:40px;padding:0 12px;border:1px solid var(--border);border-radius:8px;font-size:13px;color:var(--text-primary);background:var(--bg);outline:none;font-family:inherit;box-sizing:border-box;">
            </div>
            <div>
              <label style="font-size:11px;font-weight:700;color:var(--text-tertiary);letter-spacing:.1em;text-transform:uppercase;display:block;margin-bottom:5px;">Senha Inicial</label>
              <div style="display:flex;gap:8px;">
                <input id="ncl-senha" type="text" value="${_gerarSenha()}" style="flex:1;height:40px;padding:0 12px;border:1px solid var(--border);border-radius:8px;font-size:13px;color:var(--text-primary);background:var(--bg);outline:none;font-family:monospace;letter-spacing:.1em;box-sizing:border-box;">
                <button onclick="document.getElementById('ncl-senha').value=_gerarSenha()" style="padding:0 12px;border:1px solid var(--border);border-radius:8px;background:var(--bg);cursor:pointer;color:var(--text-secondary);font-size:11px;font-weight:700;white-space:nowrap;font-family:inherit;">GERAR</button>
              </div>
            </div>
          </div>
          <p id="ncl-erro" style="color:var(--error);font-size:12px;margin:10px 0 0;min-height:16px;"></p>
          <button onclick="criarNovoCliente()" id="ncl-btn" style="width:100%;margin-top:16px;height:44px;background:var(--primary);color:#fff;font-size:13px;font-weight:700;border-radius:8px;border:none;cursor:pointer;font-family:inherit;">CRIAR CLIENTE</button>
        </div>

        <div id="ncl-sucesso" style="display:none;text-align:center;">
          <div style="width:48px;height:48px;border-radius:50%;background:rgba(5,150,105,.1);display:flex;align-items:center;justify-content:center;margin:0 auto 12px;">
            <span class="material-symbols-outlined" style="color:#059669;font-size:28px;">check_circle</span>
          </div>
          <div style="font-size:15px;font-weight:700;color:var(--text-primary);margin-bottom:6px;">Cliente criado!</div>
          <div id="ncl-resumo" style="font-size:12px;color:var(--text-secondary);margin-bottom:16px;line-height:1.6;"></div>
          <div style="display:flex;flex-direction:column;gap:8px;">
            <button id="ncl-btn-wa" onclick="_enviarWhatsApp()" style="width:100%;height:44px;background:#25D366;color:#fff;font-size:13px;font-weight:700;border-radius:8px;border:none;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:8px;">
              <span style="font-size:18px;">📱</span>COPIAR MENSAGEM WHATSAPP
            </button>
            <button onclick="fecharModalNovoCliente()" style="width:100%;height:40px;border:1px solid var(--border);background:transparent;color:var(--text-secondary);font-size:13px;font-weight:700;border-radius:8px;cursor:pointer;font-family:inherit;">FECHAR</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(m);
    m.addEventListener('click', e => { if (e.target === m) fecharModalNovoCliente(); });
  }
  m.style.display = 'flex';
  document.getElementById('ncl-form').style.display = '';
  document.getElementById('ncl-sucesso').style.display = 'none';
  document.getElementById('ncl-erro').textContent = '';
}

function fecharModalNovoCliente() {
  const m = document.getElementById('modal-novo-cliente');
  if (m) m.style.display = 'none';
}

let _nclDados = {};

async function criarNovoCliente() {
  const empresa = (document.getElementById('ncl-empresa').value || '').trim();
  const nome    = (document.getElementById('ncl-nome').value || '').trim();
  const email   = (document.getElementById('ncl-email').value || '').trim().toLowerCase();
  const senha   = (document.getElementById('ncl-senha').value || '').trim();
  const erroEl  = document.getElementById('ncl-erro');
  const btn     = document.getElementById('ncl-btn');

  erroEl.textContent = '';
  if (!empresa) { erroEl.textContent = 'Informe o nome da empresa.'; return; }
  if (!email || !email.includes('@')) { erroEl.textContent = 'Informe um e-mail válido.'; return; }
  if (senha.length < 6) { erroEl.textContent = 'Senha mínima de 6 caracteres.'; return; }

  btn.disabled = true;
  btn.textContent = 'CRIANDO...';

  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/criar-cliente`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${_supabaseToken}`,
        'apikey': SUPABASE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ empresa, nome, email, password: senha })
    });
    const data = await r.json();
    if (!r.ok || !data.ok) {
      erroEl.textContent = data.error || 'Erro ao criar cliente.';
      btn.disabled = false;
      btn.textContent = 'CRIAR CLIENTE';
      return;
    }

    _nclDados = { empresa, nome, email, senha };
    document.getElementById('ncl-resumo').innerHTML =
      `<strong>${empresa}</strong><br>${nome || '—'}<br>${email}<br>Senha: <code style="background:var(--border-light);padding:1px 5px;border-radius:4px;">${senha}</code>`;
    document.getElementById('ncl-form').style.display = 'none';
    document.getElementById('ncl-sucesso').style.display = '';

  } catch(e) {
    erroEl.textContent = 'Erro de conexão.';
    btn.disabled = false;
    btn.textContent = 'CRIAR CLIENTE';
  }
}

function _enviarWhatsApp() {
  const { empresa, nome, email, senha } = _nclDados;
  const msg = `Olá${nome ? ', ' + nome.split(' ')[0] : ''}! 👋\n\nSeu acesso ao *EDR System* foi criado.\n\n🔗 *Link:* https://sistema.edreng.com.br\n📧 *E-mail:* ${email}\n🔑 *Senha:* ${senha}\n\nRecomendo trocar a senha após o primeiro acesso. Qualquer dúvida é só chamar!`;
  navigator.clipboard.writeText(msg).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = msg;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  });
  const btn = document.getElementById('ncl-btn-wa');
  if (btn) { btn.textContent = '✅ COPIADO!'; setTimeout(() => { btn.innerHTML = '<span style="font-size:18px;">📱</span>COPIAR MENSAGEM WHATSAPP'; }, 2500); }
}

window.abrirModalNovoCliente = abrirModalNovoCliente;
window.fecharModalNovoCliente = fecharModalNovoCliente;
window.criarNovoCliente = criarNovoCliente;
window._enviarWhatsApp = _enviarWhatsApp;

// Registrar view de permissões
window.addEventListener('DOMContentLoaded', () => {
  if (typeof viewRegistry !== 'undefined') {
    viewRegistry.register('permissoes', renderPermissoes);
  }
});
