
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
  atualizarAtalhosMenu();
}

function aplicarOrdemMenu() {
  const saved = localStorage.getItem(getMenuOrderKey());
  if (!saved) return;
  try {
    const ordem = JSON.parse(saved);
    const nav = document.getElementById('main-nav');
    const sidebarBottom = nav.querySelector('.sidebar-bottom');
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
  const ordemPadrao = ['dashboard','obras','estoque','notas','form','creditos','diarias','catalogo','relatorio','custos','banco','setup'];
  ordemPadrao.forEach(view => {
    const btn = nav.querySelector(`.nav-btn[data-view="${view}"]`);
    if (btn) nav.insertBefore(btn, sidebarBottom);
  });
  atualizarAtalhosMenu();
  showToast('Menu restaurado!');
}

function initMenuDragDrop() {
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
}

function setView(v) {
  // Mestre só pode acessar diárias
  if (usuarioAtual?.perfil === 'mestre' && v !== 'diarias') return;
  syncBnav(v);
  const views = ['dashboard','obras','estoque','notas','form','creditos','setup','catalogo','banco','relatorio','diarias','custos','leads'];
  views.forEach(name => {
    document.getElementById(`view-${name}`)?.classList.toggle('hidden', name !== v);
    const nb = document.getElementById(`nav-${name}`);
    if (nb) nb.classList.toggle('active', name === v);
  });
  if (v === 'form') setTimeout(() => { const el = document.getElementById('f-numero'); if (el) { el.focus(); el.select && el.select(); } }, 50);
  if (v === 'obras') renderObrasView();
  if (v === 'catalogo') renderCatalogo();
  if (v === 'banco') renderBanco();
  if (v === 'relatorio') initRelatorio();
  if (v === 'diarias') initDiarias();
  if (v === 'custos') renderCustos();
  if (v === 'leads') renderLeads();
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

let atalhoMenuMap = {};

function atualizarAtalhosMenu() {
  const nav = document.getElementById('main-nav');
  const btns = [...nav.querySelectorAll('.nav-btn[data-view]')];
  atalhoMenuMap = {};
  btns.forEach((btn, i) => {
    const fKey = 'F' + (i + 1);
    const view = btn.getAttribute('data-view');
    atalhoMenuMap[fKey] = view;
    const keyEl = btn.querySelector('.nav-key');
    if (keyEl) keyEl.textContent = fKey;
  });
}

function setupKeyboardShortcuts() {
  atualizarAtalhosMenu();
  document.addEventListener('keydown', e => {
    if (atalhoMenuMap[e.key]) { e.preventDefault(); setView(atalhoMenuMap[e.key]); return; }
    if (e.ctrlKey && e.key === 's') { e.preventDefault(); const v = document.getElementById('view-form'); if (v && !v.classList.contains('hidden')) salvarNota(); }
  }, true);
}

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

