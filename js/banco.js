function renderUsuarios() {
  const el = document.getElementById('usuarios-lista');
  if (!el) return;
  if (!USUARIOS.length) { el.innerHTML = '<div class="empty">Nenhum usuário. Clique em + Novo Usuário.</div>'; return; }
  el.innerHTML = USUARIOS.map(u => {
    const isAtivo = u.ativo !== false;
    const isSelf = u.usuario === usuarioAtual?.usuario;
    return `<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.04);gap:10px;${!isAtivo?'opacity:0.45':''}">
      <div style="flex:1;">
        <div style="font-weight:700;font-size:14px;color:var(--branco);">${esc(u.nome)} ${isSelf?'<span style="font-size:10px;color:var(--verde3);">(você)</span>':''}</div>
        <div style="font-size:11px;color:var(--texto3);margin-top:2px;font-family:'JetBrains Mono',monospace;">@${esc(u.usuario)}</div>
      </div>
      <span style="font-size:10px;font-weight:700;padding:3px 10px;border-radius:20px;${u.perfil==='admin'?'background:rgba(34,197,94,0.08);color:var(--verde-hl);border:1px solid rgba(34,197,94,0.2);':'background:rgba(59,130,246,0.1);color:#60a5fa;border:1px solid rgba(59,130,246,0.2);'}">${u.perfil==='admin'?'👑 ADMIN':'👷 OPERACIONAL'}</span>
      <div style="display:flex;gap:6px;">
        <button onclick="abrirModalEditarUsuario('${u.id||u.usuario}')" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);color:var(--verde3);border-radius:7px;padding:5px 10px;font-size:10px;font-family:'Rajdhani',sans-serif;font-weight:700;cursor:pointer;letter-spacing:1px;" title="Editar">✏ EDITAR</button>
        ${!isSelf ? `<button onclick="toggleAtivoUsuario('${u.id||u.usuario}',${!isAtivo})" style="background:${isAtivo?'rgba(239,68,68,0.07)':'rgba(34,197,94,0.08)'};border:1px solid ${isAtivo?'rgba(239,68,68,0.2)':'rgba(34,197,94,0.15)'};color:${isAtivo?'#f87171':'var(--verde3)'};border-radius:7px;padding:5px 10px;font-size:10px;font-family:'Rajdhani',sans-serif;font-weight:700;cursor:pointer;letter-spacing:1px;">${isAtivo?'🚫 DESATIVAR':'✅ ATIVAR'}</button>` : ''}
      </div>
    </div>`;
  }).join('');
}

function abrirModalNovoUsuario() {
  document.getElementById('modal-usuario-titulo').textContent = 'NOVO USUÁRIO';
  document.getElementById('usr-id').value = '';
  document.getElementById('usr-nome').value = '';
  document.getElementById('usr-usuario').value = '';
  document.getElementById('usr-senha').value = '';
  document.getElementById('usr-perfil').value = 'operacional';
  document.getElementById('usr-usuario').disabled = false;
  document.getElementById('modal-usuario').classList.remove('hidden');
}

function abrirModalEditarUsuario(idOrUsuario) {
  const u = USUARIOS.find(x => (x.id||x.usuario) === idOrUsuario);
  if (!u) return;
  document.getElementById('modal-usuario-titulo').textContent = 'EDITAR USUÁRIO';
  document.getElementById('usr-id').value = u.id || '';
  document.getElementById('usr-nome').value = u.nome;
  document.getElementById('usr-usuario').value = u.usuario;
  document.getElementById('usr-senha').value = '';
  document.getElementById('usr-perfil').value = u.perfil;
  document.getElementById('usr-usuario').disabled = !!u.id; // não edita login se veio do Supabase
  document.getElementById('modal-usuario').classList.remove('hidden');
}

async function salvarUsuario() {
  const id = document.getElementById('usr-id').value;
  const nome = document.getElementById('usr-nome').value.trim();
  const usuario = document.getElementById('usr-usuario').value.trim().toLowerCase();
  const senha = document.getElementById('usr-senha').value;
  const perfil = document.getElementById('usr-perfil').value;
  if (!nome) { showToast('⚠ INFORME O NOME.'); return; }
  if (!usuario) { showToast('⚠ INFORME O USUÁRIO.'); return; }
  if (!id && !senha) { showToast('⚠ INFORME A SENHA.'); return; }
  if (senha && senha.length < 4) { showToast('⚠ SENHA MÍNIMO 4 CARACTERES.'); return; }
  try {
    if (id) {
      // Editar existente — atualizar tabela usuarios
      const payload = { nome, perfil };
      await sbPatch('usuarios', `?id=eq.${id}`, payload);
      const idx = USUARIOS.findIndex(x => x.id === id);
      if (idx >= 0) Object.assign(USUARIOS[idx], payload);
      // Atualizar Auth se mudou senha ou perfil
      const u = USUARIOS.find(x => x.id === id);
      if (u) {
        const authUpdate = { user_metadata: { nome, perfil, usuario: u.usuario } };
        if (senha) authUpdate.password = senha;
        await _authAdminUpdate(u.usuario + '@edreng.com.br', authUpdate);
      }
    } else {
      // Novo usuário — criar no Auth + tabela
      if (USUARIOS.find(x => x.usuario === usuario)) { showToast('⚠ USUÁRIO JÁ EXISTE.'); return; }
      // 1. Criar no Supabase Auth
      const authOk = await _authAdminCreate(usuario, senha, nome, perfil);
      if (!authOk) { showToast('⚠ ERRO AO CRIAR USUÁRIO NO AUTH.'); return; }
      // 2. Salvar na tabela usuarios (sem senha)
      const [novo] = await sbPost('usuarios', { nome, usuario, perfil, ativo: true });
      USUARIOS.push(novo);
    }
    fecharModal('usuario');
    renderUsuarios();
    showToast('✅ USUÁRIO SALVO!');
  } catch(e) { console.error(e); showToast('ERRO AO SALVAR USUÁRIO.'); }
}

// Auth Admin — criar usuário no Supabase Auth via RPC
async function _authAdminCreate(usuario, senha, nome, perfil) {
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${_getServiceKey()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: usuario + '@edreng.com.br',
        password: senha,
        email_confirm: true,
        user_metadata: { nome, perfil, usuario }
      })
    });
    return r.ok;
  } catch(e) { console.error('Auth create error:', e); return false; }
}

// Auth Admin — atualizar usuário no Supabase Auth
async function _authAdminUpdate(email, updates) {
  try {
    // Buscar auth user ID pelo email
    const r1 = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=50`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${_getServiceKey()}` }
    });
    const data = await r1.json();
    const authUser = data.users?.find(u => u.email === email);
    if (!authUser) return false;
    const r2 = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${authUser.id}`, {
      method: 'PUT',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${_getServiceKey()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    return r2.ok;
  } catch(e) { console.error('Auth update error:', e); return false; }
}

// Service key — só disponível pra admin
function _getServiceKey() {
  if (usuarioAtual?.perfil !== 'admin') return null;
  return atob('ZXlKaGJHY2lPaUpJVXpJMU5pSXNJblI1Y0NJNklrcFhWQ0o5LmV5SnBjM01pT2lKemRYQmhZbUZ6WlNJc0luSmxaaUk2SW0xbGNIcHZlRzloYUhCM1kzWjJiSGx0Ykdab0lpd2ljbTlzWlNJNkluTmxjblpwWTJWZmNtOXNaU0lzSW1saGRDSTZNVGMzTWpJM01ESXdOU3dpWlhod0lqb3lNRGczT0RRMk1qQTFmUS41Z1QzWWUyeDlkMFNYdl9ETlVuWjNZLWpTTlUzMUd3dmRsd1Qxa294UXdR');
}

async function toggleAtivoUsuario(idOrUsuario, ativar) {
  const u = USUARIOS.find(x => (x.id||x.usuario) === idOrUsuario);
  if (!u) return;
  const acao = ativar ? 'ativar' : 'desativar';
  if (!confirm(`Deseja ${acao} o usuário "${esc(u.nome)}"?`)) return;
  try {
    if (u.id) await sbPatch('usuarios', `?id=eq.${u.id}`, { ativo: ativar });
    // Desativar/ativar no Auth (ban/unban)
    const email = u.usuario + '@edreng.com.br';
    await _authAdminUpdate(email, { ban_duration: ativar ? 'none' : '876000h' });
    u.ativo = ativar;
    renderUsuarios();
    showToast(ativar ? '✅ USUÁRIO ATIVADO!' : '🚫 USUÁRIO DESATIVADO!');
  } catch(e) { showToast('ERRO AO ATUALIZAR.'); }
}

// ══════════════════════════════════════════

function renderBanco() {
  // OBRAS
  const obrasEl = document.getElementById('banco-obras-lista');
  if (obrasEl) {
    if (!obras.length) { obrasEl.innerHTML = '<div class="empty">Nenhuma obra cadastrada.</div>'; }
    else {
      obrasEl.innerHTML = obras.map(o => {
        const ls = lancamentos.filter(l => l.obra_id === o.id);
        const total = ls.reduce((s,l) => s + Number(l.total||0), 0);
        const status = o.status === 'concluida' ? '<span style="font-size:9px;padding:2px 8px;border-radius:10px;background:rgba(34,197,94,0.08);color:var(--verde-hl);font-weight:700;margin-left:8px;">CONCLUÍDA</span>' : '';
        return `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--borda2);">
          <div>
            <div style="font-weight:700;font-size:13px;">${o.nome}${status}</div>
            <div style="font-size:11px;color:var(--texto3);margin-top:2px;">${ls.length} lançamento${ls.length!==1?'s':''}</div>
          </div>
          <div style="font-weight:700;color:var(--verde-hl);font-size:13px;">${fmtR(total)}</div>
        </div>`;
      }).join('');
    }
  }

  // FORNECEDORES — extraídos das notas
  const fornEl = document.getElementById('banco-forn-lista');
  if (fornEl) {
    const fornMap = {};
    notas.forEach(n => {
      if (!n.fornecedor) return;
      if (!fornMap[n.fornecedor]) fornMap[n.fornecedor] = { total: 0, qtd: 0, cnpj: n.cnpj || '' };
      fornMap[n.fornecedor].total += Number(n.valor_bruto||0);
      fornMap[n.fornecedor].qtd++;
    });
    const forns = Object.entries(fornMap).sort((a,b) => b[1].total - a[1].total);
    const countEl = document.getElementById('banco-forn-count');
    if (countEl) countEl.textContent = `(${forns.length})`;
    if (!forns.length) { fornEl.innerHTML = '<div class="empty">Nenhum fornecedor ainda.</div>'; }
    else {
      fornEl.innerHTML = forns.map(([nome, d]) =>
        `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--borda2);">
          <div>
            <div style="font-weight:700;font-size:13px;">${nome}</div>
            <div style="font-size:11px;color:var(--texto3);margin-top:2px;">${d.cnpj || 'CNPJ não informado'} · ${d.qtd} nota${d.qtd!==1?'s':''}</div>
          </div>
          <div style="font-weight:700;color:var(--verde-hl);font-size:13px;">${fmtR(d.total)}</div>
        </div>`
      ).join('');
    }
  }

  // USUÁRIOS — puxa do array USUARIOS (Supabase)
  const usersEl = document.getElementById('banco-users-lista');
  if (usersEl) {
    const lista = typeof USUARIOS !== 'undefined' ? USUARIOS.filter(u => u.ativo !== false) : [];
    if (!lista.length) { usersEl.innerHTML = '<div class="empty">Nenhum usuário cadastrado.</div>'; }
    else {
      const iconePerfil = p => p === 'admin' ? '👑' : p === 'mestre' ? '🔨' : '👷';
      const labelPerfil = p => p === 'admin' ? 'Admin' : p === 'mestre' ? 'Mestre' : 'Operacional';
      usersEl.innerHTML = lista.map(u =>
        `<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--borda2);">
          <div style="width:36px;height:36px;border-radius:50%;background:var(--verde-bg);display:flex;align-items:center;justify-content:center;font-size:16px;">${iconePerfil(u.perfil)}</div>
          <div>
            <div style="font-weight:700;font-size:13px;">${esc(u.nome)}</div>
            <div style="font-size:11px;color:var(--texto3);">@${esc(u.usuario)} · ${labelPerfil(u.perfil)}</div>
          </div>
        </div>`
      ).join('');
    }
  }
}
