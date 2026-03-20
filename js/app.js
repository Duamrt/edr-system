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

// ── Detecção offline ──────────────────────────────────────
function _showOfflineBanner(offline) {
  let banner = document.getElementById('offline-banner');
  if (offline && !banner) {
    banner = document.createElement('div');
    banner.id = 'offline-banner';
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#dc2626;color:#fff;text-align:center;padding:8px;font-size:12px;font-weight:700;letter-spacing:.5px;';
    banner.textContent = '⚠ SEM CONEXÃO — as alterações não serão salvas até a internet voltar.';
    document.body.prepend(banner);
  } else if (!offline && banner) {
    banner.remove();
    showToast('✅ Conexão restabelecida.');
  }
}
window.addEventListener('offline', () => _showOfflineBanner(true));
window.addEventListener('online', () => _showOfflineBanner(false));

// ── Auto-refresh ao voltar pra aba (sync entre usuários) ──
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && usuarioAtual && !_logoutInProgress) {
    // Recarrega dados silenciosamente ao voltar pra aba (resolve sync entre 2 usuários)
    Promise.all([loadLancamentos(), loadDistribuicoes(), loadEntradasDiretas(), loadAjustesEstoque()])
      .then(() => { renderEstoque(); renderDashboard(); })
      .catch(() => {});
  }
});

async function iniciarApp() {
  initCATS();
  await loadUsuarios();
  await loadObras();
  populateSelects();
  renderTabelaCreditos();
  renderUsuarios();
  await Promise.all([loadNotas(), loadLancamentos(), loadDistribuicoes(), loadEntradasDiretas(), loadMateriais(), loadRepassesCef(), loadAdicionais(), loadAjustesEstoque(), loadLeads(), loadContasPagar(), loadProjecoes(), loadGarantiaChamados(), loadAgendaNotas()]);
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
  initAjuda();
}
async function loadUsuarios() {
  try {
    const rows = await sbGet('usuarios', '?select=id,usuario,nome,perfil,ativo&order=criado_em');
    if (Array.isArray(rows) && rows.length && rows[0]?.usuario) {
      USUARIOS = rows;
    }
  } catch(e) { /* mantém USUARIOS vazio */ }
}

async function loadObras() {
  try {
    const todas = await sbGet('obras', '?select=*&order=nome');
    obrasArquivadas = Array.isArray(todas) ? todas.filter(o => o.arquivada) : [];
    obras = Array.isArray(todas) ? todas.filter(o => !o.arquivada) : [];
  } catch(e) { obras = []; obrasArquivadas = []; }
}
async function loadMateriais() { try { const r = await sbGet('materiais', '?order=codigo&limit=1000'); catalogoMateriais = Array.isArray(r) ? r : []; console.log('Materiais carregados:', catalogoMateriais.length); } catch(e) { catalogoMateriais = []; } }
async function loadNotas() { try { notas = await sbGet('notas_fiscais', '?order=criado_em.desc'); if (!Array.isArray(notas)) { notas = []; showToast('⚠ Execute o SQL na aba Setup.'); } } catch(e) { notas = []; } }
async function loadLancamentos() { try { lancamentos = await sbGet('lancamentos', '?select=id,obra_id,descricao,qtd,preco,total,data,obs,etapa,criado_por&order=data.desc'); if (!Array.isArray(lancamentos)) lancamentos = []; } catch(e) { lancamentos = []; } }
async function loadDistribuicoes() { try { const r = await sbGet('distribuicoes', '?order=criado_em.desc'); distribuicoes = Array.isArray(r) ? r : []; } catch(e) { distribuicoes = []; } }
async function loadEntradasDiretas() { try { const r = await sbGet('entradas_diretas', '?order=criado_em.desc'); entradasDiretas = Array.isArray(r) ? r : []; } catch(e) { entradasDiretas = []; } }
async function loadAjustesEstoque() { try { const r = await sbGet('ajustes_estoque', '?order=criado_em.desc'); ajustesEstoque = Array.isArray(r) ? r : []; } catch(e) { ajustesEstoque = []; } }
