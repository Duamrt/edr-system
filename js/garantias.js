// ══════════════════════════════════════════
// GARANTIA PÓS-ENTREGA — Chamados de garantia
// ══════════════════════════════════════════

let garantiaChamados = [];
let garantiaFiltro = ''; // '' | 'aberto' | 'em_andamento' | 'resolvido'

const GARANTIA_STATUS = {
  aberto:       { lb: 'ABERTO',       cor: '#ef4444', bg: 'rgba(239,68,68,0.08)',  icone: '🔴' },
  em_andamento: { lb: 'EM ANDAMENTO', cor: '#f59e0b', bg: 'rgba(245,158,11,0.08)', icone: '🟡' },
  resolvido:    { lb: 'RESOLVIDO',    cor: '#22c55e', bg: 'rgba(34,197,94,0.08)',  icone: '✅' }
};

const GARANTIA_CATEGORIAS = [
  { key: 'estrutura',          lb: '🏗 Fundações / Estrutura',      prazo: '5 anos' },
  { key: 'impermeabilizacao',  lb: '💧 Impermeabilização',          prazo: '3 anos' },
  { key: 'eletrica',           lb: '⚡ Instalações elétricas',      prazo: '2 anos' },
  { key: 'hidraulica',         lb: '🚿 Instalações hidráulicas',    prazo: '2 anos' },
  { key: 'revestimento',       lb: '🪣 Revestimento / Pintura',     prazo: '1 ano' },
  { key: 'esquadria',          lb: '🪟 Esquadrias / Vidros',        prazo: '1 ano' },
  { key: 'calha',              lb: '🌧 Calhas e rufos',             prazo: '1 ano' },
  { key: 'gesso',              lb: '⬜ Gesso / Forro',              prazo: '1 ano' },
  { key: 'outro',              lb: '📋 Outro',                      prazo: 'Verificar' }
];

// ── LOAD ─────────────────────────────────────────────────
async function loadGarantiaChamados() {
  try {
    const r = await sbGet('garantia_chamados', '?order=criado_em.desc');
    garantiaChamados = Array.isArray(r) ? r : [];
  } catch(e) { garantiaChamados = []; }
}

// ── RENDER PRINCIPAL ─────────────────────────────────────
function renderGarantias() {
  // Filtrar
  let lista = garantiaChamados;
  if (garantiaFiltro) lista = lista.filter(c => c.status === garantiaFiltro);

  // Contadores
  const qtdAberto = garantiaChamados.filter(c => c.status === 'aberto').length;
  const qtdAndamento = garantiaChamados.filter(c => c.status === 'em_andamento').length;
  const qtdResolvido = garantiaChamados.filter(c => c.status === 'resolvido').length;

  // Stats + filtros
  const statsEl = document.getElementById('garantia-stats');
  statsEl.innerHTML = `
    <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;width:100%;">
      <button onclick="garantiaFiltro='';renderGarantias()" style="padding:5px 12px;border-radius:20px;border:1px solid ${!garantiaFiltro ? 'var(--verde3)' : 'var(--borda2)'};background:${!garantiaFiltro ? 'rgba(34,197,94,0.1)' : 'transparent'};color:${!garantiaFiltro ? 'var(--verde-hl)' : 'var(--texto3)'};font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;">Todos (${garantiaChamados.length})</button>
      <button onclick="garantiaFiltro='aberto';renderGarantias()" style="padding:5px 12px;border-radius:20px;border:1px solid ${garantiaFiltro==='aberto' ? '#ef4444' : 'var(--borda2)'};background:${garantiaFiltro==='aberto' ? 'rgba(239,68,68,0.1)' : 'transparent'};color:${garantiaFiltro==='aberto' ? '#ef4444' : 'var(--texto3)'};font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;">Abertos (${qtdAberto})</button>
      <button onclick="garantiaFiltro='em_andamento';renderGarantias()" style="padding:5px 12px;border-radius:20px;border:1px solid ${garantiaFiltro==='em_andamento' ? '#f59e0b' : 'var(--borda2)'};background:${garantiaFiltro==='em_andamento' ? 'rgba(245,158,11,0.1)' : 'transparent'};color:${garantiaFiltro==='em_andamento' ? '#f59e0b' : 'var(--texto3)'};font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;">Em andamento (${qtdAndamento})</button>
      <button onclick="garantiaFiltro='resolvido';renderGarantias()" style="padding:5px 12px;border-radius:20px;border:1px solid ${garantiaFiltro==='resolvido' ? '#22c55e' : 'var(--borda2)'};background:${garantiaFiltro==='resolvido' ? 'rgba(34,197,94,0.1)' : 'transparent'};color:${garantiaFiltro==='resolvido' ? '#22c55e' : 'var(--texto3)'};font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;">Resolvidos (${qtdResolvido})</button>
      <div style="flex:1;"></div>
      <button onclick="abrirModalChamado(null)" style="padding:6px 14px;border-radius:10px;border:1px solid rgba(34,197,94,0.3);background:rgba(34,197,94,0.08);color:var(--verde-hl);font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;letter-spacing:.5px;">+ NOVO CHAMADO</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;width:100%;margin-top:8px;">
      <div class="stat-card" style="border-top:2px solid #ef4444;padding:12px;text-align:center;">
        <div style="font-size:9px;color:var(--texto3);font-weight:700;letter-spacing:1px;">ABERTOS</div>
        <div style="font-size:22px;font-weight:800;color:#ef4444;">${qtdAberto}</div>
      </div>
      <div class="stat-card" style="border-top:2px solid #f59e0b;padding:12px;text-align:center;">
        <div style="font-size:9px;color:var(--texto3);font-weight:700;letter-spacing:1px;">EM ANDAMENTO</div>
        <div style="font-size:22px;font-weight:800;color:#f59e0b;">${qtdAndamento}</div>
      </div>
      <div class="stat-card" style="border-top:2px solid #22c55e;padding:12px;text-align:center;">
        <div style="font-size:9px;color:var(--texto3);font-weight:700;letter-spacing:1px;">RESOLVIDOS</div>
        <div style="font-size:22px;font-weight:800;color:#22c55e;">${qtdResolvido}</div>
      </div>
    </div>`;

  // Lista de chamados
  const listaEl = document.getElementById('garantia-lista');
  if (!lista.length) {
    listaEl.innerHTML = `<div style="text-align:center;padding:40px 20px;color:var(--texto3);">
      <div style="font-size:32px;margin-bottom:8px;">${garantiaFiltro ? '🔍' : '🛡'}</div>
      <div style="font-size:13px;">${garantiaFiltro ? 'Nenhum chamado com esse filtro.' : 'Nenhum chamado de garantia.'}</div>
      ${!garantiaFiltro ? '<div style="font-size:11px;margin-top:6px;">Quando um cliente reportar um problema, cadastre aqui.</div>' : ''}
    </div>`;
    return;
  }

  // Ordenar: abertos primeiro, depois em andamento, depois resolvidos
  const ordemStatus = { aberto: 0, em_andamento: 1, resolvido: 2 };
  lista.sort((a, b) => {
    const oa = ordemStatus[a.status] ?? 9;
    const ob = ordemStatus[b.status] ?? 9;
    if (oa !== ob) return oa - ob;
    return (b.criado_em || '').localeCompare(a.criado_em || '');
  });

  // Mapa de obras (ativas + arquivadas)
  const obraMap = {};
  [...obras, ...obrasArquivadas].forEach(o => { obraMap[o.id] = o.nome; });

  listaEl.innerHTML = lista.map(c => {
    const st = GARANTIA_STATUS[c.status] || GARANTIA_STATUS.aberto;
    const bordaCor = c.status === 'aberto' ? '#ef4444' : c.status === 'em_andamento' ? '#f59e0b' : '#22c55e';
    const obraNome = c.obra_id ? (obraMap[c.obra_id] || 'Obra removida') : '—';
    const cat = GARANTIA_CATEGORIAS.find(g => g.key === c.categoria) || GARANTIA_CATEGORIAS[GARANTIA_CATEGORIAS.length - 1];
    const isResolvido = c.status === 'resolvido';

    // Botoes de mudanca de status
    let statusBtns = '';
    if (c.status === 'aberto') {
      statusBtns = `<button onclick="mudarStatusChamado('${esc(c.id)}','em_andamento')" style="padding:5px 12px;border-radius:8px;border:1px solid rgba(245,158,11,0.3);background:rgba(245,158,11,0.08);color:#f59e0b;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;">🟡 Em andamento</button>
        <button onclick="mudarStatusChamado('${esc(c.id)}','resolvido')" style="padding:5px 12px;border-radius:8px;border:1px solid rgba(34,197,94,0.3);background:rgba(34,197,94,0.08);color:var(--verde-hl);font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;">✅ Resolvido</button>`;
    } else if (c.status === 'em_andamento') {
      statusBtns = `<button onclick="mudarStatusChamado('${esc(c.id)}','resolvido')" style="padding:5px 12px;border-radius:8px;border:1px solid rgba(34,197,94,0.3);background:rgba(34,197,94,0.08);color:var(--verde-hl);font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;">✅ Resolvido</button>
        <button onclick="mudarStatusChamado('${esc(c.id)}','aberto')" style="padding:5px 12px;border-radius:8px;border:1px solid rgba(239,68,68,0.2);background:transparent;color:#f87171;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;">🔴 Reabrir</button>`;
    } else {
      statusBtns = `<button onclick="mudarStatusChamado('${esc(c.id)}','aberto')" style="padding:5px 12px;border-radius:8px;border:1px solid rgba(239,68,68,0.2);background:transparent;color:#f87171;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;">🔴 Reabrir</button>`;
    }

    return `<div class="card" style="padding:14px 14px 14px 18px;margin-bottom:8px;border-left:3px solid ${bordaCor};${isResolvido ? 'opacity:0.6;' : ''}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">
        <div style="flex:1;min-width:0;">
          <div style="font-weight:700;font-size:14px;color:var(--branco);margin-bottom:2px;">${esc(obraNome)}</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:6px;">
            <span style="font-size:10px;padding:2px 8px;border-radius:6px;background:rgba(139,92,246,0.1);border:1px solid rgba(139,92,246,0.25);color:#a78bfa;font-weight:700;">${esc(cat.lb)}</span>
            <span style="font-size:10px;color:var(--texto3);">Prazo: ${esc(cat.prazo)}</span>
          </div>
          <div style="font-size:12px;color:var(--texto2);margin-bottom:4px;">${esc(c.descricao_problema)}</div>
          ${c.solucao ? `<div style="font-size:11px;color:var(--verde3);margin-bottom:4px;">💡 ${esc(c.solucao)}</div>` : ''}
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;font-size:11px;color:var(--texto3);">
            <span>Aberto em: ${c.criado_em ? fmtData(c.criado_em.split('T')[0]) : '—'}</span>
            ${c.data_visita ? `<span>Visita: <strong style="color:var(--branco);">${fmtData(c.data_visita)}</strong></span>` : ''}
            ${c.cliente_nome ? `<span>👤 ${esc(c.cliente_nome)}</span>` : ''}
            ${c.cliente_telefone ? `<span>📞 ${esc(c.cliente_telefone)}</span>` : ''}
          </div>
        </div>
        <div style="text-align:right;flex-shrink:0;">
          <span style="display:inline-block;padding:2px 8px;border-radius:6px;font-size:10px;font-weight:700;color:${st.cor};background:${st.bg};">${st.icone} ${st.lb}</span>
        </div>
      </div>
      <div style="display:flex;gap:6px;margin-top:10px;justify-content:flex-end;flex-wrap:wrap;">
        ${statusBtns}
        <button onclick="abrirModalChamado('${esc(c.id)}')" style="padding:5px 12px;border-radius:8px;border:1px solid var(--borda2);background:transparent;color:var(--texto2);font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;">✏ Editar</button>
        <button onclick="excluirChamado('${esc(c.id)}')" style="padding:5px 12px;border-radius:8px;border:1px solid rgba(239,68,68,0.2);background:transparent;color:#f87171;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;">🗑</button>
      </div>
    </div>`;
  }).join('');
}

// ── MODAL CRIAR/EDITAR ───────────────────────────────────
function abrirModalChamado(chamadoId) {
  const modal = document.getElementById('modal-chamado');
  const titulo = document.getElementById('modal-chamado-titulo');
  const selObra = document.getElementById('chamado-obra');
  const selCat = document.getElementById('chamado-categoria');
  const selStatus = document.getElementById('chamado-status');

  // Popular select de obras (ativas + arquivadas — arquivadas são as que mais precisam!)
  const todasObras = [...obrasArquivadas, ...obras];
  selObra.innerHTML = '<option value="">— Selecione a obra —</option>' +
    todasObras.map(o => `<option value="${esc(o.id)}">${esc(o.nome)}${o.arquivada ? ' (entregue)' : ''}</option>`).join('');

  // Popular select de categorias
  selCat.innerHTML = GARANTIA_CATEGORIAS.map(g =>
    `<option value="${esc(g.key)}">${esc(g.lb)} — ${esc(g.prazo)}</option>`
  ).join('');

  if (chamadoId) {
    const c = garantiaChamados.find(x => x.id === chamadoId);
    if (!c) return;
    titulo.textContent = 'Editar chamado';
    document.getElementById('chamado-id').value = c.id;
    selObra.value = c.obra_id || '';
    selCat.value = c.categoria || 'outro';
    document.getElementById('chamado-descricao').value = c.descricao_problema || '';
    document.getElementById('chamado-solucao').value = c.solucao || '';
    selStatus.value = c.status || 'aberto';
    document.getElementById('chamado-data-visita').value = c.data_visita || '';
    document.getElementById('chamado-cliente-nome').value = c.cliente_nome || '';
    document.getElementById('chamado-cliente-telefone').value = c.cliente_telefone || '';
  } else {
    titulo.textContent = 'Novo chamado de garantia';
    document.getElementById('chamado-id').value = '';
    selObra.value = '';
    selCat.value = 'outro';
    document.getElementById('chamado-descricao').value = '';
    document.getElementById('chamado-solucao').value = '';
    selStatus.value = 'aberto';
    document.getElementById('chamado-data-visita').value = '';
    document.getElementById('chamado-cliente-nome').value = '';
    document.getElementById('chamado-cliente-telefone').value = '';
  }

  modal.classList.remove('hidden');
  setTimeout(() => selObra.focus(), 100);
}

// ── SALVAR ────────────────────────────────────────────────
async function salvarChamado() {
  const obra_id = document.getElementById('chamado-obra').value || null;
  const categoria = document.getElementById('chamado-categoria').value || 'outro';
  const descricao_problema = (document.getElementById('chamado-descricao').value || '').trim();
  const solucao = (document.getElementById('chamado-solucao').value || '').trim();
  const status = document.getElementById('chamado-status').value || 'aberto';
  const data_visita = document.getElementById('chamado-data-visita').value || null;
  const cliente_nome = (document.getElementById('chamado-cliente-nome').value || '').trim();
  const cliente_telefone = (document.getElementById('chamado-cliente-telefone').value || '').trim();
  const id = document.getElementById('chamado-id').value;

  if (!obra_id) { showToast('⚠ Selecione a obra.'); return; }
  if (!descricao_problema) { showToast('⚠ Descreva o problema.'); return; }

  const payload = { obra_id, categoria, descricao_problema, solucao, status, data_visita, cliente_nome, cliente_telefone, atualizado_em: new Date().toISOString() };

  try {
    if (id) {
      const [atualizado] = await sbPatch('garantia_chamados', `?id=eq.${id}`, payload);
      const idx = garantiaChamados.findIndex(c => c.id === id);
      if (idx >= 0) garantiaChamados[idx] = { ...garantiaChamados[idx], ...atualizado };
      showToast('✅ Chamado atualizado');
    } else {
      const [novo] = await sbPost('garantia_chamados', payload);
      garantiaChamados.unshift(novo);
      showToast('✅ Chamado registrado');
    }
    fecharModal('chamado');
    renderGarantias();
  } catch(e) {
    console.error(e);
    showToast('❌ Erro ao salvar chamado. Verifique se a tabela existe no Supabase.');
  }
}

// ── MUDAR STATUS ─────────────────────────────────────────
async function mudarStatusChamado(chamadoId, novoStatus) {
  try {
    const [atualizado] = await sbPatch('garantia_chamados', `?id=eq.${chamadoId}`, { status: novoStatus, atualizado_em: new Date().toISOString() });
    const idx = garantiaChamados.findIndex(c => c.id === chamadoId);
    if (idx >= 0) garantiaChamados[idx] = { ...garantiaChamados[idx], ...atualizado };
    const lb = GARANTIA_STATUS[novoStatus]?.lb || novoStatus;
    showToast(`✅ Status alterado para ${lb}`);
    renderGarantias();
  } catch(e) {
    console.error(e);
    showToast('❌ Erro ao atualizar status.');
  }
}

// ── EXCLUIR ──────────────────────────────────────────────
async function excluirChamado(chamadoId) {
  if (!confirm('Excluir este chamado de garantia? Essa acao nao pode ser desfeita.')) return;
  try {
    await sbDelete('garantia_chamados', `?id=eq.${chamadoId}`);
    garantiaChamados = garantiaChamados.filter(c => c.id !== chamadoId);
    showToast('✅ Chamado excluido');
    renderGarantias();
  } catch(e) {
    console.error(e);
    showToast('❌ Erro ao excluir chamado.');
  }
}
