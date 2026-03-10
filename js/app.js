// Service Worker registration
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    const swCode = `
      const CACHE = 'edr-v9';
      self.addEventListener('install', e => self.skipWaiting());
      self.addEventListener('activate', e => clients.claim());
      self.addEventListener('fetch', e => {
        if (e.request.mode === 'navigate') {
          e.respondWith(fetch(e.request).catch(() => caches.match('/')));
        }
      });
    `;
    const blob = new Blob([swCode], {type: 'application/javascript'});
    navigator.serviceWorker.register(URL.createObjectURL(blob));
  });
}

async function iniciarApp() {
  initCATS();
  await loadUsuarios();
  await loadObras();
  populateSelects();
  renderTabelaCreditos();
  renderUsuarios();
  await Promise.all([loadNotas(), loadLancamentos(), loadDistribuicoes(), loadEntradasDiretas(), loadMateriais(), loadRepassesCef()]);
  const mc = document.getElementById("main-content-inner"); if(mc) mc.style.visibility="visible";
  document.getElementById('sql-box').textContent = SQL_SETUP;
  renderDashboard();
  renderEstoque();
  renderNotas();
  // renderObrasView é chamado pelo setView quando o usuário abre a aba
  setToday();
  setupEnterNav();
  setupKeyboardShortcuts();
  setupClickOutside();
}
async function loadUsuarios() {
  try {
    const rows = await sbGet('usuarios', '?select=*&order=criado_em');
    if (Array.isArray(rows) && rows.length && rows[0]?.usuario) {
      USUARIOS = rows;
    }
  } catch(e) { /* mantém USUARIOS fallback */ }
  // Garantir que visitante sempre existe, independente do Supabase
  if (!USUARIOS.find(u => u.usuario === 'visitante')) {
    USUARIOS.push({ usuario: 'visitante', senha: 'edr2024', perfil: 'visitante', nome: 'Visitante', ativo: true });
  }
}

async function loadObras() {
  try {
    const todas = await sbGet('obras', '?select=*&order=nome');
    obrasArquivadas = Array.isArray(todas) ? todas.filter(o => o.arquivada) : [];
    obras = Array.isArray(todas) ? todas.filter(o => !o.arquivada) : [];
  } catch(e) { obras = []; obrasArquivadas = []; }
}
async function loadMateriais() { try { const r = await sbGet('materiais', '?order=codigo&limit=1000'); catalogoMateriais = Array.isArray(r) ? r : []; console.log('Materiais carregados:', catalogoMateriais.length); } catch(e) { catalogoMateriais = []; } }
async function loadNotas() { try { notas = await sbGet('notas_fiscais', '?order=criado_em.desc'); if (!Array.isArray(notas)) { notas = []; showToast('⚠ Execute o SQL no SETUP.'); } } catch(e) { notas = []; } }
async function loadLancamentos() { try { lancamentos = await sbGet('lancamentos', '?select=id,obra_id,descricao,qtd,preco,total,data,obs,etapa&order=data.desc'); if (!Array.isArray(lancamentos)) lancamentos = []; } catch(e) { lancamentos = []; } }
async function loadDistribuicoes() { try { const r = await sbGet('distribuicoes', '?order=criado_em.desc'); distribuicoes = Array.isArray(r) ? r : []; } catch(e) { distribuicoes = []; } }
async function loadEntradasDiretas() { try { const r = await sbGet('entradas_diretas', '?order=criado_em.desc'); entradasDiretas = Array.isArray(r) ? r : []; } catch(e) { entradasDiretas = []; } }
