function fazerLogin() {
  const u = document.getElementById('login-user').value.trim().toLowerCase();
  const s = document.getElementById('login-pass').value;
  const btn = document.querySelector('.btn-login');
  if (btn) { btn.disabled = true; btn.textContent = 'AGUARDE...'; }
  // Tentar login com usuários já carregados
  const tentarLogin = () => {
    const user = USUARIOS.find(x => x.usuario === u && x.senha === s && x.ativo !== false);
    if (btn) { btn.disabled = false; btn.textContent = 'ENTRAR'; }
    if (!user) {
      document.getElementById('login-error').textContent = 'Usuário ou senha incorretos ou acesso desativado.';
      return;
    }
    usuarioAtual = user;
    try {
      const ttl = user.perfil === 'admin' ? 30 : 0.33;
      localStorage.setItem('edr_session', JSON.stringify({ usuario: user.usuario, perfil: user.perfil, ts: Date.now(), ttl_dias: ttl }));
    } catch(e) {}
    entrarNoApp();
  };
  // Sempre tenta Supabase primeiro para garantir senhas atualizadas
  // Se demorar mais de 3s, usa fallback local
  if (USUARIOS.length <= 6) {
    const timeoutPromise = new Promise(res => setTimeout(res, 3000));
    Promise.race([loadUsuarios(), timeoutPromise]).then(tentarLogin).catch(tentarLogin);
  } else {
    tentarLogin();
  }
}
function entrarNoApp() {
  document.getElementById('login-screen').classList.add('hidden');
  // Esconder todas as views
  ['obras','estoque','notas','form','creditos','setup','catalogo','banco','relatorio','diarias'].forEach(name => {
    const el = document.getElementById('view-'+name);
    if (el) el.classList.add('hidden');
  });
  const dash = document.getElementById('view-dashboard');
  if (dash) dash.classList.remove('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('user-nome-badge').textContent = usuarioAtual.nome;
  // Badge modo visitante
  const demoBadge = document.getElementById('demo-mode-badge');
  if (demoBadge) demoBadge.style.display = usuarioAtual.perfil === 'visitante' ? 'block' : 'none';
  // Limpar resquícios de demo se NÃO está em modo demo
  if (!MODO_DEMO) {
    const bannerOrfao = document.getElementById('demo-banner');
    if (bannerOrfao) bannerOrfao.remove();
    const mc = document.getElementById('main-content');
    if (mc) mc.style.paddingBottom = '';
  }
  aplicarPerfil();
  initMenuDragDrop();
  iniciarApp();
}
function fazerLogout() {
  try { localStorage.removeItem('edr_session'); } catch(e) {}
  MODO_DEMO = false;
  usuarioAtual = null;
  // Cancelar timer pendente do banner demo
  if (typeof _demoBannerTimer !== 'undefined' && _demoBannerTimer) {
    clearTimeout(_demoBannerTimer);
    _demoBannerTimer = null;
  }
  // Remover banner e badge de demo se existirem
  const demoBanner = document.getElementById('demo-banner');
  if (demoBanner) demoBanner.remove();
  const demoBadge = document.getElementById('demo-badge');
  if (demoBadge) demoBadge.classList.add('hidden');
  // Restaurar padding do main-content
  const mc = document.getElementById('main-content');
  if (mc) mc.style.paddingBottom = '';
  document.getElementById('app').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('login-user').value = '';
  document.getElementById('login-pass').value = '';
  document.getElementById('login-error').textContent = '';
}
function verificarSessao() {
  try {
    const s = localStorage.getItem('edr_session');
    if (!s) return false;
    const { usuario, ts, ttl_dias } = JSON.parse(s);
    const ttl = (ttl_dias || 30) * 24 * 60 * 60 * 1000;
    if (Date.now() - ts > ttl) { localStorage.removeItem('edr_session'); return false; }
    // Aceita qualquer perfil — admin 30 dias, operador 8h
    const user = USUARIOS.find(x => x.usuario === usuario && x.ativo !== false);
    if (!user) return false;
    usuarioAtual = user;
    return true;
  } catch(e) { return false; }
}
// Auto-login ao abrir o app
window.addEventListener('DOMContentLoaded', async () => {
  // Verificar sessão imediatamente com fallback local
  // loadUsuarios em paralelo — se Supabase responder, atualiza USUARIOS em bg
  try {
    if (verificarSessao()) { entrarNoApp(); loadUsuarios(); return; }
  } catch(e) {
    try { localStorage.removeItem('edr_session'); } catch(e2) {}
  }
  // Sem sessão — tentar carregar usuários do Supabase com timeout de 5s
  // Se falhar, login ainda funciona com fallback embutido
  try {
    await Promise.race([
      loadUsuarios(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000))
    ]);
  } catch(e) { /* mantém fallback */ }
});
function aplicarPerfil() {
  const isAdmin = usuarioAtual.perfil === 'admin';
  const isMestre = usuarioAtual.perfil === 'mestre';
  const isVisitante = usuarioAtual.perfil === 'visitante';

  // Visitante: ativa modo demo (nenhuma escrita vai ao Supabase)
  // Não desativar MODO_DEMO se já foi ativado por entrarModoDemo()
  if (isVisitante) MODO_DEMO = true;

  // Resetar sidebar — mostrar tudo antes de aplicar restrições
  ['nav-dashboard','nav-obras','nav-estoque','nav-notas','nav-form','nav-creditos',
   'nav-catalogo','nav-relatorio','nav-banco','nav-setup','nav-diarias','nav-custos'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('hidden');
  });
  // Resetar bottom nav
  const bnav = document.getElementById('bottom-nav');
  if (bnav) bnav.style.display = '';
  // Resetar classe de perfil no body
  document.body.classList.remove('perfil-mestre');

  // Classe no body para CSS condicional
  document.body.classList.toggle('perfil-mestre', isMestre);

  document.querySelectorAll('.admin-only').forEach(el => el.classList.toggle('hidden', !isAdmin));
  document.querySelectorAll('.operacional-info').forEach(el => el.classList.toggle('hidden', isAdmin));

  // Operacional e Mestre não veem setup
  if (!isAdmin) {
    document.getElementById('nav-setup').classList.add('hidden');
  }

  // Mestre: só vê diárias — oculta tudo mais na sidebar e vai direto pra F7
  if (isMestre) {
    ['nav-dashboard','nav-obras','nav-estoque','nav-notas','nav-form','nav-creditos','nav-catalogo','nav-relatorio','nav-banco'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.add('hidden');
    });
    const bnav = document.getElementById('bottom-nav');
    if (bnav) bnav.style.display = 'none';
    setTimeout(() => setView('diarias'), 100);
    // Garantir painel esquerdo expandido no mestre
    diarPanelRecolhido = false;
    const pl = document.getElementById('diar-panelLeft');
    if (pl) pl.classList.remove('recolhido');
  }
}

