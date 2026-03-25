
// ══════════════════════════════════════════
// NAVEGAÇÃO
// ══════════════════════════════════════════
// ══════════════════════════════════════════
// MENU DRAG & DROP — Personalização do sidebar
// ══════════════════════════════════════════
function getMenuOrderKey() {
  return 'edr_menu_order_' + (usuarioAtual?.id || 'default');
}

function salvarOrdemMenu() {
  const nav = document.getElementById('main-nav');
  const btns = [...nav.querySelectorAll('.nav-btn[data-view]')];
  const ordem = btns.map(b => b.getAttribute('data-view'));
  localStorage.setItem(getMenuOrderKey(), JSON.stringify(ordem));
  // Esconder labels e grupos vazios quando ordem customizada
  nav.querySelectorAll('.sidebar-group-label').forEach(l => l.style.display = 'none');
  nav.querySelectorAll('.sidebar-group').forEach(g => g.style.display = 'none');
  atualizarAtalhosMenu();
}

function aplicarOrdemMenu() {
  const saved = localStorage.getItem(getMenuOrderKey());
  if (!saved) return;
  try {
    const ordem = JSON.parse(saved);
    const nav = document.getElementById('main-nav');
    const sidebarBottom = nav.querySelector('.sidebar-bottom');
    // Esconder labels e grupos vazios quando ordem customizada
    nav.querySelectorAll('.sidebar-group-label').forEach(l => l.style.display = 'none');
    nav.querySelectorAll('.sidebar-group').forEach(g => g.style.display = 'none');
    ordem.forEach(view => {
      const btn = nav.querySelector(`.nav-btn[data-view="${view}"]`);
      if (btn) nav.insertBefore(btn, sidebarBottom);
    });
    atualizarAtalhosMenu();
  } catch(e) { console.error('Erro ao aplicar ordem do menu:', e); }
}

function resetarOrdemMenu() {
  localStorage.removeItem(getMenuOrderKey());
  const nav = document.getElementById('main-nav');
  const sidebarBottom = nav.querySelector('.sidebar-bottom');
  // Mostrar labels e grupos novamente
  nav.querySelectorAll('.sidebar-group-label').forEach(l => { l.style.display = ''; l.classList.remove('collapsed'); });
  nav.querySelectorAll('.sidebar-group').forEach(g => { g.style.display = ''; g.style.maxHeight = '500px'; g.classList.remove('collapsed'); });
  // Estrutura padrão com botões DENTRO dos grupos
  const estrutura = [
    { label: 'VISÃO', views: ['dashboard','relatorio','caixa'] },
    { label: 'OBRAS', views: ['obras','custos','garantias'] },
    { label: 'MATERIAIS', views: ['estoque','catalogo','notas','form'] },
    { label: 'FINANCEIRO', views: ['contas-pagar','creditos'] },
    { label: 'EQUIPE', views: ['diarias'] },
    { label: 'COMERCIAL', views: ['leads'] },
    { label: 'CONFIG', views: ['banco','permissoes','setup'] }
  ];
  const labels = [...nav.querySelectorAll('.sidebar-group-label')];
  const groups = [...nav.querySelectorAll('.sidebar-group')];
  estrutura.forEach((sec, i) => {
    const label = labels.find(l => l.textContent.trim() === sec.label);
    const group = label ? label.nextElementSibling : groups[i];
    if (label) nav.insertBefore(label, sidebarBottom);
    if (group) {
      nav.insertBefore(group, sidebarBottom);
      sec.views.forEach(view => {
        const btn = nav.querySelector(`.nav-btn[data-view="${view}"]`);
        if (btn) group.appendChild(btn);
      });
    }
  });
  atualizarAtalhosMenu();
  showToast('Menu restaurado!');
}

function initMenuDragDrop() {
  // Drag & drop desativado — causava sumiço dos labels de grupo
  // Limpar ordem customizada salva anteriormente
  try { localStorage.removeItem(getMenuOrderKey()); } catch(e) {}
  return;
  /* DESATIVADO
  const nav = document.getElementById('main-nav');
  let draggedEl = null;

  nav.querySelectorAll('.nav-btn[data-view]').forEach(btn => {
    btn.addEventListener('dragstart', e => {
      draggedEl = btn;
      btn.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', btn.getAttribute('data-view'));
    });

    btn.addEventListener('dragend', () => {
      btn.classList.remove('dragging');
      nav.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('drag-over'));
      draggedEl = null;
      salvarOrdemMenu();
    });

    btn.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (btn !== draggedEl) btn.classList.add('drag-over');
    });

    btn.addEventListener('dragleave', () => {
      btn.classList.remove('drag-over');
    });

    btn.addEventListener('drop', e => {
      e.preventDefault();
      btn.classList.remove('drag-over');
      if (!draggedEl || draggedEl === btn) return;
      const allBtns = [...nav.querySelectorAll('.nav-btn[data-view]')];
      const dragIdx = allBtns.indexOf(draggedEl);
      const dropIdx = allBtns.indexOf(btn);
      if (dragIdx < dropIdx) {
        btn.parentNode.insertBefore(draggedEl, btn.nextSibling);
      } else {
        btn.parentNode.insertBefore(draggedEl, btn);
      }
    });

    // Touch support (mobile)
    let touchStartY = 0;
    let touchClone = null;
    let touchMoving = false;

    btn.addEventListener('touchstart', e => {
      touchStartY = e.touches[0].clientY;
      touchMoving = false;
      draggedEl = btn;
    }, { passive: true });

    btn.addEventListener('touchmove', e => {
      const dy = Math.abs(e.touches[0].clientY - touchStartY);
      if (dy < 10 && !touchMoving) return;
      touchMoving = true;
      e.preventDefault();
      btn.classList.add('dragging');
      const touch = e.touches[0];
      const target = document.elementFromPoint(touch.clientX, touch.clientY);
      nav.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('drag-over'));
      if (target && target.closest && target.closest('.nav-btn[data-view]') && target.closest('.nav-btn[data-view]') !== draggedEl) {
        target.closest('.nav-btn[data-view]').classList.add('drag-over');
      }
    }, { passive: false });

    btn.addEventListener('touchend', e => {
      if (!touchMoving) { draggedEl = null; return; }
      btn.classList.remove('dragging');
      const touch = e.changedTouches[0];
      const target = document.elementFromPoint(touch.clientX, touch.clientY);
      const dropTarget = target?.closest?.('.nav-btn[data-view]');
      nav.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('drag-over'));
      if (dropTarget && dropTarget !== draggedEl) {
        const allBtns = [...nav.querySelectorAll('.nav-btn[data-view]')];
        const dragIdx = allBtns.indexOf(draggedEl);
        const dropIdx = allBtns.indexOf(dropTarget);
        if (dragIdx < dropIdx) {
          dropTarget.parentNode.insertBefore(draggedEl, dropTarget.nextSibling);
        } else {
          dropTarget.parentNode.insertBefore(draggedEl, dropTarget);
        }
        salvarOrdemMenu();
      }
      draggedEl = null;
      touchMoving = false;
    });
  });

  // Aplicar ordem salva
  aplicarOrdemMenu();
  // Iniciar sidebar com grupos colapsados
  initSidebarGroups();
  DESATIVADO */
}

// ── SIDEBAR ACCORDION ─────────────────────────────────────
function toggleSidebarGroup(labelEl) {
  const group = labelEl.nextElementSibling;
  if (!group || !group.classList.contains('sidebar-group')) return;
  const isCollapsed = group.classList.contains('collapsed');
  if (isCollapsed) {
    group.classList.remove('collapsed');
    labelEl.classList.remove('collapsed');
    group.style.maxHeight = group.scrollHeight + 'px';
    // Após a transição, remover max-height fixo para permitir conteúdo dinâmico
    setTimeout(() => { group.style.maxHeight = '500px'; }, 260);
  } else {
    group.style.maxHeight = group.scrollHeight + 'px';
    requestAnimationFrame(() => { group.classList.add('collapsed'); labelEl.classList.add('collapsed'); });
  }
}

function collapseAllGroups() {
  document.querySelectorAll('.sidebar-group').forEach(g => {
    g.classList.add('collapsed');
    g.style.maxHeight = '0px';
    const label = g.previousElementSibling;
    if (label?.classList.contains('sidebar-group-label')) label.classList.add('collapsed');
  });
}

function initSidebarGroups() {
  // Começa tudo fechado, abre o grupo da view ativa (ou dashboard se nenhuma ativa)
  collapseAllGroups();
  const activeBtn = document.querySelector('.nav-btn.active[data-view]');
  const activeView = activeBtn ? activeBtn.getAttribute('data-view') : 'dashboard';
  expandGroupForView(activeView);
}

function expandGroupForView(viewId) {
  const btn = document.querySelector(`.nav-btn[data-view="${viewId}"]`);
  if (!btn) return;
  const group = btn.closest('.sidebar-group');
  if (!group) return;
  const label = group.previousElementSibling;
  if (group.classList.contains('collapsed')) {
    group.classList.remove('collapsed');
    if (label) label.classList.remove('collapsed');
    group.style.maxHeight = group.scrollHeight + 'px';
    setTimeout(() => { group.style.maxHeight = '500px'; }, 260);
  }
}

function setView(v) {
  // Mestre só pode acessar diárias
  if (usuarioAtual?.perfil === 'mestre' && v !== 'diarias') return;
  // Salvar página atual pra restaurar após reload
  try { localStorage.setItem('edr_last_view', v); } catch(e) {}
  closeBnavMore();
  expandGroupForView(v);
  syncBnav(v);
  const views = ['clientes-plataforma','dashboard','obras','estoque','notas','form','creditos','setup','catalogo','banco','relatorio','diarias','usuarios','custos','leads','caixa','contas-pagar','garantias','permissoes','orcamento','cronograma'];
  views.forEach(name => {
    document.getElementById(`view-${name}`)?.classList.toggle('hidden', name !== v);
    const nb = document.getElementById(`nav-${name}`);
    if (nb) nb.classList.toggle('active', name === v);
  });
  if (v === 'form') { if (typeof restaurarRascunhoNF === 'function') restaurarRascunhoNF(); setTimeout(() => { const el = document.getElementById('f-numero'); if (el) { el.focus(); el.select && el.select(); } }, 50); }
  if (v === 'obras') renderObrasView();
  if (v === 'catalogo') renderCatalogo();
  if (v === 'banco') renderBanco();
  if (v === 'relatorio') initRelatorio();
  if (v === 'diarias') initDiarias();
  if (v === 'custos') renderCustos();
  if (v === 'leads') renderLeads();
  if (v === 'caixa') renderCaixa();
  if (v === 'contas-pagar') renderContasPagar();
  if (v === 'garantias') renderGarantias();
  if (v === 'usuarios') renderUsuarios();
  if (v === 'permissoes') renderPermissoes();
  if (v === 'orcamento') renderOrcamento();
  if (v === 'cronograma') renderCronograma();
  if (v === 'clientes-plataforma') renderPlataformaClientes();
}


function setupClickOutside() {
  document.addEventListener('click', e => {
    if (!e.target.closest('.autocomplete-wrap')) {
      document.getElementById('ac-list').classList.add('hidden');
      document.getElementById('ac-forn-list').classList.add('hidden');
    }
  });
}

function setupEnterNav() {
  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const el = document.activeElement; if (!el) return;
    const fList = document.getElementById('ac-forn-list');
    if (!fList.classList.contains('hidden') && acFornIdx >= 0 && cachedFornecedores[acFornIdx]) { selectFornecedor(acFornIdx); e.preventDefault(); return; }
    const acList = document.getElementById('ac-list');
    if (!acList.classList.contains('hidden') && acSelectedIdx >= 0 && cachedItens[acSelectedIdx]) { selectAC(acSelectedIdx); e.preventDefault(); return; }
    if (el.dataset.action === 'addItem') { e.preventDefault(); adicionarItem(); return; }
    const nextId = el.dataset.next;
    if (nextId) { e.preventDefault(); const next = document.getElementById(nextId); if (next) { next.focus(); next.select && next.select(); } return; }
    if (el.tagName === 'TEXTAREA') return;
  });
  document.getElementById('i-desc').addEventListener('keydown', e => {
    const acList = document.getElementById('ac-list'); if (acList.classList.contains('hidden')) return;
    const items = acList.querySelectorAll('.autocomplete-item'); if (!items.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); acSelectedIdx = Math.min(acSelectedIdx+1, items.length-1); items.forEach((it,i) => it.classList.toggle('selected', i === acSelectedIdx)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); acSelectedIdx = Math.max(acSelectedIdx-1, 0); items.forEach((it,i) => it.classList.toggle('selected', i === acSelectedIdx)); }
  });
  document.getElementById('f-fornecedor').addEventListener('keydown', e => {
    const fList = document.getElementById('ac-forn-list'); if (fList.classList.contains('hidden')) return;
    const items = fList.querySelectorAll('.autocomplete-item'); if (!items.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); acFornIdx = Math.min(acFornIdx+1, items.length-1); items.forEach((it,i) => it.classList.toggle('selected', i === acFornIdx)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); acFornIdx = Math.max(acFornIdx-1, 0); items.forEach((it,i) => it.classList.toggle('selected', i === acFornIdx)); }
  });
}

// Atalhos de teclado removidos — causavam conflito com inputs
let atalhoMenuMap = {};
function atualizarAtalhosMenu() {}
function setupKeyboardShortcuts() {}

function fecharModal(w) { document.getElementById(`modal-${w}`).classList.add('hidden'); if (w === 'dist') distItemAtual = null; }

// ESC fecha qualquer modal ou volta de tela de detalhe
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  // 1. Fecha modais abertos
  const modais = document.querySelectorAll('.modal-overlay:not(.hidden)');
  if (modais.length) { modais.forEach(m => { const id = m.id.replace('modal-',''); fecharModal(id); }); e.preventDefault(); return; }
  // 2. Volta de detalhe para cards (CUSTOS CEF)
  if (custoObraAtual && document.getElementById('custos-detalhe-view')?.style.display !== 'none') { custosVoltarCards(); e.preventDefault(); return; }
  // 3. Volta de detalhe para cards (OBRAS F2)
  if (document.getElementById('obras-sticky')?.style.display !== 'none' && document.getElementById('obras-cards-overview')?.style.display === 'none') { obrasVoltarCards(); e.preventDefault(); return; }
});

