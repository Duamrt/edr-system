// ══════════════════════════════════════════════════════════════
// EDR V2 — Módulo 4.2: Garantias Pós-Entrega
// Chamados por categoria, agendamento visita, rastreio solução
// ══════════════════════════════════════════════════════════════

const GarantiasModule = {
  chamados: [],
  filtro: '',       // '' | 'aberto' | 'em_andamento' | 'resolvido'
  page: 0,
  pageSize: 50,
};

// ── Constantes ───────────────────────────────────────────────

const GARANTIA_STATUS = {
  aberto:       { lb: 'Aberto',       cor: '#ef4444', bg: 'rgba(239,68,68,0.08)',  icon: 'error'          },
  em_andamento: { lb: 'Em andamento', cor: '#f59e0b', bg: 'rgba(245,158,11,0.08)', icon: 'pending'        },
  resolvido:    { lb: 'Resolvido',    cor: '#22c55e', bg: 'rgba(34,197,94,0.08)',   icon: 'check_circle'   },
};

const GARANTIA_CATEGORIAS = [
  { key: 'estrutura',         lb: 'Fundacoes / Estrutura',     icon: 'foundation',        prazo: '5 anos' },
  { key: 'impermeabilizacao', lb: 'Impermeabilizacao',         icon: 'water_drop',        prazo: '3 anos' },
  { key: 'eletrica',          lb: 'Instalacoes eletricas',     icon: 'bolt',              prazo: '2 anos' },
  { key: 'hidraulica',        lb: 'Instalacoes hidraulicas',   icon: 'plumbing',          prazo: '2 anos' },
  { key: 'revestimento',      lb: 'Revestimento / Pintura',    icon: 'format_paint',      prazo: '1 ano'  },
  { key: 'esquadria',         lb: 'Esquadrias / Vidros',       icon: 'window',            prazo: '1 ano'  },
  { key: 'calha',             lb: 'Calhas e rufos',            icon: 'roofing',           prazo: '1 ano'  },
  { key: 'gesso',             lb: 'Gesso / Forro',             icon: 'ceiling',           prazo: '1 ano'  },
  { key: 'outro',             lb: 'Outro',                     icon: 'more_horiz',        prazo: 'Verificar' },
];

// ── Carregamento ─────────────────────────────────────────────

async function _garantiasLoad() {
  try {
    const r = await sbGet('garantia_chamados', '?order=criado_em.desc');
    GarantiasModule.chamados = Array.isArray(r) ? r : [];
  } catch (e) { GarantiasModule.chamados = []; }
}

// ── Render principal ─────────────────────────────────────────

function renderGarantias() {
  const container = document.getElementById('garantia-lista') || document.getElementById('view-garantias');
  if (!container) return;

  // Skeleton
  container.innerHTML = _garantiasSkeleton();

  requestAnimationFrame(async () => {
    if (!GarantiasModule.chamados.length) await _garantiasLoad();
    container.innerHTML = _garantiasBuildPage();
    _garantiasBindAutocomplete();
  });
}

function _garantiasSkeleton() {
  return `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px;">
    <div style="height:70px;background:var(--skeleton);border-radius:10px;"></div>
    <div style="height:70px;background:var(--skeleton);border-radius:10px;"></div>
    <div style="height:70px;background:var(--skeleton);border-radius:10px;"></div>
  </div>
  <div style="height:80px;background:var(--skeleton);border-radius:10px;margin-bottom:8px;"></div>
  <div style="height:80px;background:var(--skeleton);border-radius:10px;margin-bottom:8px;"></div>`;
}

function _garantiasBuildPage() {
  const M = GarantiasModule;
  const todos = M.chamados;

  const qtdAberto = todos.filter(c => c.status === 'aberto').length;
  const qtdAndamento = todos.filter(c => c.status === 'em_andamento').length;
  const qtdResolvido = todos.filter(c => c.status === 'resolvido').length;

  // Header: chips filtro + botao novo
  let html = `<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:16px;">
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      ${_garantiasChipFiltro('', 'list', 'Todos', todos.length)}
      ${_garantiasChipFiltro('aberto', 'error', 'Abertos', qtdAberto)}
      ${_garantiasChipFiltro('em_andamento', 'pending', 'Em andamento', qtdAndamento)}
      ${_garantiasChipFiltro('resolvido', 'check_circle', 'Resolvidos', qtdResolvido)}
    </div>
    <button onclick="_garantiasAbrirModal(null)" style="padding:8px 16px;border-radius:10px;border:1px solid rgba(45,106,79,0.4);background:rgba(45,106,79,0.1);color:#2D6A4F;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;display:flex;align-items:center;gap:6px;">
      <span class="material-symbols-outlined" style="font-size:16px;">add_circle</span> NOVO CHAMADO
    </button>
  </div>`;

  // Stat cards
  html += `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:20px;">
    <div style="background:var(--card-bg);border:1px solid var(--borda);border-top:3px solid #ef4444;border-radius:10px;padding:14px;text-align:center;">
      <div style="font-size:9px;color:var(--texto-sec);font-weight:700;letter-spacing:1px;">ABERTOS</div>
      <div style="font-size:26px;font-weight:800;color:#ef4444;font-family:'Space Grotesk',monospace;">${qtdAberto}</div>
    </div>
    <div style="background:var(--card-bg);border:1px solid var(--borda);border-top:3px solid #f59e0b;border-radius:10px;padding:14px;text-align:center;">
      <div style="font-size:9px;color:var(--texto-sec);font-weight:700;letter-spacing:1px;">EM ANDAMENTO</div>
      <div style="font-size:26px;font-weight:800;color:#f59e0b;font-family:'Space Grotesk',monospace;">${qtdAndamento}</div>
    </div>
    <div style="background:var(--card-bg);border:1px solid var(--borda);border-top:3px solid #22c55e;border-radius:10px;padding:14px;text-align:center;">
      <div style="font-size:9px;color:var(--texto-sec);font-weight:700;letter-spacing:1px;">RESOLVIDOS</div>
      <div style="font-size:26px;font-weight:800;color:#22c55e;font-family:'Space Grotesk',monospace;">${qtdResolvido}</div>
    </div>
  </div>`;

  // Lista filtrada
  let lista = M.filtro ? todos.filter(c => c.status === M.filtro) : [...todos];

  if (!lista.length) {
    html += `<div style="text-align:center;padding:40px 20px;color:var(--texto-sec);">
      <span class="material-symbols-outlined" style="font-size:40px;opacity:0.3;">${M.filtro ? 'search_off' : 'verified_user'}</span>
      <div style="font-size:13px;margin-top:8px;">${M.filtro ? 'Nenhum chamado com esse filtro.' : 'Nenhum chamado de garantia.'}</div>
      ${!M.filtro ? '<div style="font-size:11px;margin-top:6px;color:var(--texto-ter);">Quando um cliente reportar um problema, cadastre aqui.</div>' : ''}
    </div>`;
    return html;
  }

  // Ordenar: abertos primeiro
  const ordemSt = { aberto: 0, em_andamento: 1, resolvido: 2 };
  lista.sort((a, b) => {
    const oa = ordemSt[a.status] ?? 9;
    const ob = ordemSt[b.status] ?? 9;
    if (oa !== ob) return oa - ob;
    return (b.criado_em || '').localeCompare(a.criado_em || '');
  });

  // Paginacao
  const paginated = lista.slice(0, M.pageSize);

  // Mapa de obras
  const todasObras = [...(typeof obras !== 'undefined' ? obras : []), ...(typeof obrasArquivadas !== 'undefined' ? obrasArquivadas : [])];
  const obraMap = {};
  todasObras.forEach(o => { obraMap[o.id] = o.nome; });

  html += paginated.map(c => _garantiasCardChamado(c, obraMap)).join('');

  if (lista.length > M.pageSize) {
    html += `<div style="text-align:center;padding:12px;">
      <button onclick="GarantiasModule.pageSize+=50;renderGarantias()" style="padding:8px 20px;border-radius:8px;border:1px solid var(--borda);background:transparent;color:var(--texto-sec);font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;">
        Carregar mais...
      </button>
    </div>`;
  }

  return html;
}

function _garantiasChipFiltro(status, icon, label, count) {
  const ativo = GarantiasModule.filtro === status;
  const cor = status ? (GARANTIA_STATUS[status]?.cor || '#6b7280') : '#2D6A4F';
  const bg = status ? (GARANTIA_STATUS[status]?.bg || 'transparent') : 'rgba(45,106,79,0.08)';
  return `<button onclick="GarantiasModule.filtro='${status}';renderGarantias()"
    style="padding:5px 12px;border-radius:20px;border:1px solid ${ativo ? cor + '60' : 'var(--borda)'};
    background:${ativo ? bg : 'transparent'};color:${ativo ? cor : 'var(--texto-sec)'};
    font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:4px;">
    <span class="material-symbols-outlined" style="font-size:14px;">${icon}</span>
    ${label} (${count})
  </button>`;
}

// ── Card de chamado ──────────────────────────────────────────

function _garantiasCardChamado(c, obraMap) {
  const st = GARANTIA_STATUS[c.status] || GARANTIA_STATUS.aberto;
  const cat = GARANTIA_CATEGORIAS.find(g => g.key === c.categoria) || GARANTIA_CATEGORIAS[GARANTIA_CATEGORIAS.length - 1];
  const obraNome = c.obra_id ? (obraMap[c.obra_id] || 'Obra removida') : '—';
  const isResolvido = c.status === 'resolvido';

  // Botoes de status
  let statusBtns = '';
  if (c.status === 'aberto') {
    statusBtns = `
      <button onclick="_garantiasMudarStatus('${esc(c.id)}','em_andamento')" style="padding:5px 12px;border-radius:8px;border:1px solid rgba(245,158,11,0.3);background:rgba(245,158,11,0.08);color:#f59e0b;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:3px;">
        <span class="material-symbols-outlined" style="font-size:13px;">pending</span> Em andamento
      </button>
      <button onclick="_garantiasMudarStatus('${esc(c.id)}','resolvido')" style="padding:5px 12px;border-radius:8px;border:1px solid rgba(34,197,94,0.3);background:rgba(34,197,94,0.08);color:#22c55e;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:3px;">
        <span class="material-symbols-outlined" style="font-size:13px;">check_circle</span> Resolvido
      </button>`;
  } else if (c.status === 'em_andamento') {
    statusBtns = `
      <button onclick="_garantiasMudarStatus('${esc(c.id)}','resolvido')" style="padding:5px 12px;border-radius:8px;border:1px solid rgba(34,197,94,0.3);background:rgba(34,197,94,0.08);color:#22c55e;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:3px;">
        <span class="material-symbols-outlined" style="font-size:13px;">check_circle</span> Resolvido
      </button>
      <button onclick="_garantiasMudarStatus('${esc(c.id)}','aberto')" style="padding:5px 12px;border-radius:8px;border:1px solid rgba(239,68,68,0.2);background:transparent;color:#ef4444;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:3px;">
        <span class="material-symbols-outlined" style="font-size:13px;">error</span> Reabrir
      </button>`;
  } else {
    statusBtns = `<button onclick="_garantiasMudarStatus('${esc(c.id)}','aberto')" style="padding:5px 12px;border-radius:8px;border:1px solid rgba(239,68,68,0.2);background:transparent;color:#ef4444;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:3px;">
      <span class="material-symbols-outlined" style="font-size:13px;">error</span> Reabrir
    </button>`;
  }

  return `<div style="background:var(--card-bg);border:1px solid var(--borda);border-left:3px solid ${st.cor};border-radius:10px;padding:14px;margin-bottom:8px;${isResolvido ? 'opacity:0.6;' : ''}">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">
      <div style="flex:1;min-width:0;">
        <div style="font-weight:700;font-size:14px;color:var(--texto-pri);margin-bottom:4px;">${esc(obraNome)}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:6px;">
          <span style="font-size:10px;padding:2px 8px;border-radius:6px;background:rgba(139,92,246,0.1);border:1px solid rgba(139,92,246,0.25);color:#a78bfa;font-weight:700;display:inline-flex;align-items:center;gap:3px;">
            <span class="material-symbols-outlined" style="font-size:12px;">${cat.icon}</span> ${esc(cat.lb)}
          </span>
          <span style="font-size:10px;color:var(--texto-sec);">Prazo: ${esc(cat.prazo)}</span>
        </div>
        <div style="font-size:12px;color:var(--texto-sec);margin-bottom:4px;">${esc(c.descricao_problema)}</div>
        ${c.solucao ? `<div style="font-size:11px;color:#22c55e;margin-bottom:4px;display:flex;align-items:flex-start;gap:4px;">
          <span class="material-symbols-outlined" style="font-size:14px;">lightbulb</span> ${esc(c.solucao)}
        </div>` : ''}
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;font-size:11px;color:var(--texto-ter);">
          <span>Aberto em: ${c.criado_em ? fmtData(c.criado_em.split('T')[0]) : '—'}</span>
          ${c.data_visita ? `<span style="display:inline-flex;align-items:center;gap:2px;"><span class="material-symbols-outlined" style="font-size:12px;">event</span> Visita: <strong style="color:var(--texto-pri);">${fmtData(c.data_visita)}</strong></span>` : ''}
          ${c.cliente_nome ? `<span style="display:inline-flex;align-items:center;gap:2px;"><span class="material-symbols-outlined" style="font-size:12px;">person</span> ${esc(c.cliente_nome)}</span>` : ''}
          ${c.cliente_telefone ? `<span style="display:inline-flex;align-items:center;gap:2px;"><span class="material-symbols-outlined" style="font-size:12px;">call</span> ${esc(c.cliente_telefone)}</span>` : ''}
        </div>
      </div>
      <div style="text-align:right;flex-shrink:0;">
        <span style="display:inline-flex;align-items:center;gap:3px;padding:3px 8px;border-radius:6px;font-size:10px;font-weight:700;color:${st.cor};background:${st.bg};">
          <span class="material-symbols-outlined" style="font-size:13px;">${st.icon}</span> ${st.lb.toUpperCase()}
        </span>
      </div>
    </div>
    <div style="display:flex;gap:6px;margin-top:10px;justify-content:flex-end;flex-wrap:wrap;">
      ${statusBtns}
      <button onclick="_garantiasAbrirModal('${esc(c.id)}')" style="padding:5px 12px;border-radius:8px;border:1px solid var(--borda);background:transparent;color:var(--texto-sec);font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:3px;">
        <span class="material-symbols-outlined" style="font-size:13px;">edit</span> Editar
      </button>
      <button onclick="_garantiasExcluir('${esc(c.id)}')" style="padding:5px 12px;border-radius:8px;border:1px solid rgba(239,68,68,0.2);background:transparent;color:#ef4444;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:3px;">
        <span class="material-symbols-outlined" style="font-size:13px;">delete</span>
      </button>
    </div>
  </div>`;
}

// ── Modal Criar/Editar ───────────────────────────────────────

function _garantiasAbrirModal(chamadoId) {
  const c = chamadoId ? GarantiasModule.chamados.find(x => x.id === chamadoId) : null;
  const isNovo = !c;

  const overlay = document.createElement('div');
  overlay.id = 'modal-garantia-v2';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;padding:12px;backdrop-filter:blur(4px);';
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };

  // Opcoes de categoria
  const catOpts = GARANTIA_CATEGORIAS.map(g =>
    `<option value="${esc(g.key)}" ${c?.categoria === g.key ? 'selected' : ''}>${g.lb} — ${g.prazo}</option>`
  ).join('');

  // Opcoes de status
  const stOpts = Object.entries(GARANTIA_STATUS).map(([k, v]) =>
    `<option value="${esc(k)}" ${c?.status === k ? 'selected' : ''}>${v.lb}</option>`
  ).join('');

  overlay.innerHTML = `<div style="background:var(--bg-surface);border:1px solid var(--borda);border-radius:16px;max-width:560px;width:100%;max-height:90vh;overflow-y:auto;">
    <!-- Header -->
    <div style="padding:20px 20px 16px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--borda);">
      <span style="font-size:16px;font-weight:700;color:var(--texto-pri);display:flex;align-items:center;gap:6px;">
        <span class="material-symbols-outlined" style="font-size:20px;color:#2D6A4F;">${isNovo ? 'add_circle' : 'edit'}</span>
        ${isNovo ? 'Novo chamado de garantia' : 'Editar chamado'}
      </span>
      <button onclick="document.getElementById('modal-garantia-v2').remove()" style="background:none;border:none;color:var(--texto-sec);cursor:pointer;padding:4px;">
        <span class="material-symbols-outlined" style="font-size:22px;">close</span>
      </button>
    </div>

    <!-- Form -->
    <div style="padding:16px 20px 20px;">
      <input id="gar-id" type="hidden" value="${esc(c?.id || '')}">

      <!-- Obra (autocomplete) -->
      <div style="margin-bottom:12px;">
        <label style="font-size:10px;font-weight:700;color:var(--texto-sec);display:block;margin-bottom:4px;">OBRA *</label>
        <div id="gar-obra-ac-wrap" style="position:relative;"></div>
      </div>

      <!-- Categoria + Status -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;">
        <div>
          <label style="font-size:10px;font-weight:700;color:var(--texto-sec);display:block;margin-bottom:4px;">CATEGORIA</label>
          <select id="gar-categoria" style="width:100%;padding:8px 10px;background:var(--input-bg);border:1px solid var(--borda);border-radius:8px;color:var(--texto-pri);font-size:12px;font-family:inherit;">
            ${catOpts}
          </select>
        </div>
        <div>
          <label style="font-size:10px;font-weight:700;color:var(--texto-sec);display:block;margin-bottom:4px;">STATUS</label>
          <select id="gar-status" style="width:100%;padding:8px 10px;background:var(--input-bg);border:1px solid var(--borda);border-radius:8px;color:var(--texto-pri);font-size:12px;font-family:inherit;">
            ${stOpts}
          </select>
        </div>
      </div>

      <!-- Descricao -->
      <div style="margin-bottom:12px;">
        <label style="font-size:10px;font-weight:700;color:var(--texto-sec);display:block;margin-bottom:4px;">DESCRICAO DO PROBLEMA *</label>
        <textarea id="gar-descricao" rows="3" placeholder="Descreva o problema relatado..." style="width:100%;padding:8px 10px;background:var(--input-bg);border:1px solid var(--borda);border-radius:8px;color:var(--texto-pri);font-size:12px;font-family:inherit;resize:vertical;box-sizing:border-box;">${esc(c?.descricao_problema || '')}</textarea>
      </div>

      <!-- Solucao -->
      <div style="margin-bottom:12px;">
        <label style="font-size:10px;font-weight:700;color:var(--texto-sec);display:block;margin-bottom:4px;">SOLUCAO APLICADA</label>
        <textarea id="gar-solucao" rows="2" placeholder="Descreva a solucao (se houver)..." style="width:100%;padding:8px 10px;background:var(--input-bg);border:1px solid var(--borda);border-radius:8px;color:var(--texto-pri);font-size:12px;font-family:inherit;resize:vertical;box-sizing:border-box;">${esc(c?.solucao || '')}</textarea>
      </div>

      <!-- Data visita -->
      <div style="margin-bottom:12px;">
        <label style="font-size:10px;font-weight:700;color:var(--texto-sec);display:block;margin-bottom:4px;">DATA DA VISITA TECNICA</label>
        <input id="gar-data-visita" type="date" value="${esc(c?.data_visita || '')}" style="width:100%;padding:8px 10px;background:var(--input-bg);border:1px solid var(--borda);border-radius:8px;color:var(--texto-pri);font-size:12px;font-family:inherit;box-sizing:border-box;">
      </div>

      <!-- Cliente nome + telefone -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;">
        <div>
          <label style="font-size:10px;font-weight:700;color:var(--texto-sec);display:block;margin-bottom:4px;">NOME DO CLIENTE</label>
          <input id="gar-cliente-nome" type="text" value="${esc(c?.cliente_nome || '')}" placeholder="Nome" style="width:100%;padding:8px 10px;background:var(--input-bg);border:1px solid var(--borda);border-radius:8px;color:var(--texto-pri);font-size:12px;font-family:inherit;box-sizing:border-box;">
        </div>
        <div>
          <label style="font-size:10px;font-weight:700;color:var(--texto-sec);display:block;margin-bottom:4px;">TELEFONE</label>
          <input id="gar-cliente-tel" type="text" value="${esc(c?.cliente_telefone || '')}" placeholder="(00) 0 0000-0000" style="width:100%;padding:8px 10px;background:var(--input-bg);border:1px solid var(--borda);border-radius:8px;color:var(--texto-pri);font-size:12px;font-family:inherit;box-sizing:border-box;">
        </div>
      </div>

      <!-- Botoes -->
      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button onclick="document.getElementById('modal-garantia-v2').remove()" style="padding:8px 16px;border-radius:8px;border:1px solid var(--borda);background:transparent;color:var(--texto-sec);font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;">Cancelar</button>
        <button onclick="_garantiasSalvar()" style="padding:8px 16px;border-radius:8px;border:1px solid rgba(45,106,79,0.4);background:rgba(45,106,79,0.1);color:#2D6A4F;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;display:flex;align-items:center;gap:4px;">
          <span class="material-symbols-outlined" style="font-size:14px;">save</span> Salvar
        </button>
      </div>
    </div>
  </div>`;

  document.body.appendChild(overlay);

  // Autocomplete de obra
  _garantiasSetupObraAC(c);

  // ESC fecha
  const escH = e => { if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', escH); } };
  document.addEventListener('keydown', escH);
}

// ── Autocomplete obra (ativas + arquivadas) ──────────────────

function _garantiasSetupObraAC(chamado) {
  const wrap = document.getElementById('gar-obra-ac-wrap');
  if (!wrap) return;

  const todasObras = [...(typeof obras !== 'undefined' ? obras : []), ...(typeof obrasArquivadas !== 'undefined' ? obrasArquivadas : [])];
  const obraAtualNome = chamado?.obra_id
    ? (todasObras.find(o => o.id === chamado.obra_id)?.nome || '')
    : '';

  wrap.innerHTML = `<input id="gar-obra-input" type="text" value="${esc(obraAtualNome)}" placeholder="Buscar obra..." autocomplete="off"
    style="width:100%;padding:8px 10px;background:var(--input-bg);border:1px solid var(--borda);border-radius:8px;color:var(--texto-pri);font-size:12px;font-family:inherit;box-sizing:border-box;">
    <input id="gar-obra-id" type="hidden" value="${esc(chamado?.obra_id || '')}">
    <div id="gar-obra-dropdown" style="position:absolute;top:100%;left:0;right:0;background:var(--bg-surface);border:1px solid var(--borda);border-radius:8px;max-height:180px;overflow-y:auto;display:none;z-index:10;margin-top:2px;"></div>`;

  const input = document.getElementById('gar-obra-input');
  const dd = document.getElementById('gar-obra-dropdown');

  input.addEventListener('input', () => {
    const q = input.value.toLowerCase().trim();
    if (!q) { dd.style.display = 'none'; return; }
    const matches = todasObras.filter(o => o.nome.toLowerCase().includes(q)).slice(0, 10);
    if (!matches.length) { dd.style.display = 'none'; return; }
    dd.innerHTML = matches.map(o =>
      `<div onclick="document.getElementById('gar-obra-input').value='${esc(o.nome)}';document.getElementById('gar-obra-id').value='${esc(o.id)}';document.getElementById('gar-obra-dropdown').style.display='none';"
        style="padding:8px 10px;font-size:12px;cursor:pointer;border-bottom:1px solid var(--borda);display:flex;justify-content:space-between;"
        onmouseenter="this.style.background='rgba(45,106,79,0.08)'" onmouseleave="this.style.background='transparent'">
        <span>${esc(o.nome)}</span>
        ${o.arquivada ? '<span style="font-size:9px;color:var(--texto-ter);">entregue</span>' : ''}
      </div>`
    ).join('');
    dd.style.display = 'block';
  });

  input.addEventListener('blur', () => { setTimeout(() => { dd.style.display = 'none'; }, 200); });
}

function _garantiasBindAutocomplete() {
  // Autocomplete principal (nao no modal, mas poderia ser usado no futuro)
}

// ── Acoes CRUD ───────────────────────────────────────────────

async function _garantiasSalvar() {
  const obra_id = document.getElementById('gar-obra-id')?.value || null;
  const categoria = document.getElementById('gar-categoria')?.value || 'outro';
  const descricao_problema = (document.getElementById('gar-descricao')?.value || '').trim();
  const solucao = (document.getElementById('gar-solucao')?.value || '').trim();
  const status = document.getElementById('gar-status')?.value || 'aberto';
  const data_visita = document.getElementById('gar-data-visita')?.value || null;
  const cliente_nome = (document.getElementById('gar-cliente-nome')?.value || '').trim();
  const cliente_telefone = (document.getElementById('gar-cliente-tel')?.value || '').trim();
  const id = document.getElementById('gar-id')?.value;

  if (!obra_id) { showToast('Selecione a obra.'); return; }
  if (!descricao_problema) { showToast('Descreva o problema.'); return; }

  const payload = { obra_id, categoria, descricao_problema, solucao, status, data_visita, cliente_nome, cliente_telefone, atualizado_em: new Date().toISOString() };

  try {
    if (id) {
      const [atualizado] = await sbPatch('garantia_chamados', `?id=eq.${id}`, payload);
      const idx = GarantiasModule.chamados.findIndex(c => c.id === id);
      if (idx >= 0) GarantiasModule.chamados[idx] = { ...GarantiasModule.chamados[idx], ...atualizado };
      showToast('Chamado atualizado.');
    } else {
      const [novo] = await sbPost('garantia_chamados', payload);
      GarantiasModule.chamados.unshift(novo);
      showToast('Chamado registrado.');
    }
    document.getElementById('modal-garantia-v2')?.remove();
    renderGarantias();
  } catch (e) {
    showToast('Erro ao salvar chamado.');
  }
}

async function _garantiasMudarStatus(chamadoId, novoStatus) {
  try {
    const [atualizado] = await sbPatch('garantia_chamados', `?id=eq.${chamadoId}`, { status: novoStatus, atualizado_em: new Date().toISOString() });
    const idx = GarantiasModule.chamados.findIndex(c => c.id === chamadoId);
    if (idx >= 0) GarantiasModule.chamados[idx] = { ...GarantiasModule.chamados[idx], ...atualizado };
    const lb = GARANTIA_STATUS[novoStatus]?.lb || novoStatus;
    showToast(`Status alterado para ${lb}.`);
    renderGarantias();
  } catch (e) {
    showToast('Erro ao atualizar status.');
  }
}

async function _garantiasExcluir(chamadoId) {
  const ok = await confirmar('Excluir este chamado de garantia? Essa acao nao pode ser desfeita.');
  if (!ok) return;
  try {
    await sbDelete('garantia_chamados', `?id=eq.${chamadoId}`);
    GarantiasModule.chamados = GarantiasModule.chamados.filter(c => c.id !== chamadoId);
    showToast('Chamado excluido.');
    renderGarantias();
  } catch (e) {
    showToast('Erro ao excluir chamado.');
  }
}

// ── Registry ─────────────────────────────────────────────────

viewRegistry.register('garantias', () => { renderGarantias(); });
