// ══════════════════════════════════════════
// CONTAS A PAGAR — Módulo simples para exceções
// ══════════════════════════════════════════

let contasPagar = [];
let contasFiltro = ''; // '' | 'pendente' | 'pago' | 'vencido'

const CONTA_STATUS = {
  pendente: { lb: 'PENDENTE', cor: '#f59e0b', bg: 'rgba(245,158,11,0.08)', icone: '⏳' },
  vencido:  { lb: 'VENCIDO',  cor: '#ef4444', bg: 'rgba(239,68,68,0.08)',  icone: '🚨' },
  pago:     { lb: 'PAGO',     cor: '#22c55e', bg: 'rgba(34,197,94,0.08)',  icone: '✅' },
  cancelado:{ lb: 'CANCELADO',cor: '#6b7280', bg: 'rgba(255,255,255,0.04)',icone: '⚫' }
};

// ── LOAD ─────────────────────────────────────────────────
async function loadContasPagar() {
  try {
    const r = await sbGet('contas_pagar', '?order=data_vencimento');
    contasPagar = Array.isArray(r) ? r : [];
  } catch(e) { contasPagar = []; }
}

// ── STATUS AUTOMÁTICO ────────────────────────────────────
function getStatusConta(c) {
  if (c.status === 'pago' || c.status === 'cancelado') return c.status;
  const hoje = hojeISO();
  if (c.data_vencimento < hoje && c.status === 'pendente') return 'vencido';
  return c.status || 'pendente';
}

// ── CONTAS VENCIDAS (para uso no dashboard) ──────────────
function getContasVencidas() {
  const hoje = hojeISO();
  return contasPagar.filter(c => c.status === 'pendente' && c.data_vencimento < hoje);
}

// ── RENDER PRINCIPAL ─────────────────────────────────────
function renderContasPagar() {
  const hoje = hojeISO();
  const mesAtual = hoje.slice(0, 7);

  // Aplicar status automático
  const lista = contasPagar.map(c => ({ ...c, _status: getStatusConta(c) }));

  // Filtrar
  let filtrada = lista;
  if (contasFiltro) filtrada = lista.filter(c => c._status === contasFiltro);

  // Stats
  const totalPendente = lista.filter(c => c._status === 'pendente').reduce((s, c) => s + Number(c.valor || 0), 0);
  const totalVencido = lista.filter(c => c._status === 'vencido').reduce((s, c) => s + Number(c.valor || 0), 0);
  const pagasMes = lista.filter(c => c._status === 'pago' && c.data_pagamento && c.data_pagamento.startsWith(mesAtual)).reduce((s, c) => s + Number(c.valor || 0), 0);
  const qtdPendente = lista.filter(c => c._status === 'pendente').length;
  const qtdVencido = lista.filter(c => c._status === 'vencido').length;
  const qtdPago = lista.filter(c => c._status === 'pago').length;

  const statsEl = document.getElementById('contas-stats');
  statsEl.innerHTML = `
    <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;width:100%;">
      <button onclick="contasFiltro='';renderContasPagar()" style="padding:5px 12px;border-radius:20px;border:1px solid ${!contasFiltro ? 'var(--verde3)' : 'var(--borda2)'};background:${!contasFiltro ? 'rgba(34,197,94,0.1)' : 'transparent'};color:${!contasFiltro ? 'var(--verde-hl)' : 'var(--texto3)'};font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;">Todas (${lista.length})</button>
      <button onclick="contasFiltro='pendente';renderContasPagar()" style="padding:5px 12px;border-radius:20px;border:1px solid ${contasFiltro==='pendente' ? '#f59e0b' : 'var(--borda2)'};background:${contasFiltro==='pendente' ? 'rgba(245,158,11,0.1)' : 'transparent'};color:${contasFiltro==='pendente' ? '#f59e0b' : 'var(--texto3)'};font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;">Pendentes (${qtdPendente})</button>
      <button onclick="contasFiltro='vencido';renderContasPagar()" style="padding:5px 12px;border-radius:20px;border:1px solid ${contasFiltro==='vencido' ? '#ef4444' : 'var(--borda2)'};background:${contasFiltro==='vencido' ? 'rgba(239,68,68,0.1)' : 'transparent'};color:${contasFiltro==='vencido' ? '#ef4444' : 'var(--texto3)'};font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;">Vencidas (${qtdVencido})</button>
      <button onclick="contasFiltro='pago';renderContasPagar()" style="padding:5px 12px;border-radius:20px;border:1px solid ${contasFiltro==='pago' ? '#22c55e' : 'var(--borda2)'};background:${contasFiltro==='pago' ? 'rgba(34,197,94,0.1)' : 'transparent'};color:${contasFiltro==='pago' ? '#22c55e' : 'var(--texto3)'};font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;">Pagas (${qtdPago})</button>
      <div style="flex:1;"></div>
      <button onclick="abrirModalConta(null)" style="padding:6px 14px;border-radius:10px;border:1px solid rgba(34,197,94,0.3);background:rgba(34,197,94,0.08);color:var(--verde-hl);font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;letter-spacing:.5px;">+ NOVA CONTA</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;width:100%;margin-top:8px;">
      <div class="stat-card" style="border-top:2px solid #f59e0b;padding:12px;text-align:center;">
        <div style="font-size:9px;color:var(--texto3);font-weight:700;letter-spacing:1px;">PENDENTE</div>
        <div style="font-size:16px;font-weight:800;color:#f59e0b;font-family:'JetBrains Mono',monospace;">${fmt(totalPendente)}</div>
      </div>
      <div class="stat-card" style="border-top:2px solid #ef4444;padding:12px;text-align:center;">
        <div style="font-size:9px;color:var(--texto3);font-weight:700;letter-spacing:1px;">VENCIDO</div>
        <div style="font-size:16px;font-weight:800;color:#ef4444;font-family:'JetBrains Mono',monospace;">${fmt(totalVencido)}</div>
      </div>
      <div class="stat-card" style="border-top:2px solid #22c55e;padding:12px;text-align:center;">
        <div style="font-size:9px;color:var(--texto3);font-weight:700;letter-spacing:1px;">PAGAS NO MES</div>
        <div style="font-size:16px;font-weight:800;color:#22c55e;font-family:'JetBrains Mono',monospace;">${fmt(pagasMes)}</div>
      </div>
    </div>`;

  // Lista de contas
  const listaEl = document.getElementById('contas-lista');
  if (!filtrada.length) {
    listaEl.innerHTML = `<div style="text-align:center;padding:40px 20px;color:var(--texto3);">
      <div style="font-size:32px;margin-bottom:8px;">${contasFiltro ? '🔍' : '📋'}</div>
      <div style="font-size:13px;">${contasFiltro ? 'Nenhuma conta com esse filtro.' : 'Nenhuma conta cadastrada.'}</div>
      ${!contasFiltro ? '<div style="font-size:11px;margin-top:6px;">Clique em <strong style="color:var(--verde-hl);">+ NOVA CONTA</strong> para adicionar.</div>' : ''}
    </div>`;
    return;
  }

  // Ordenar: vencidas primeiro, depois pendentes, depois pagas
  const ordemStatus = { vencido: 0, pendente: 1, pago: 2, cancelado: 3 };
  filtrada.sort((a, b) => {
    const oa = ordemStatus[a._status] ?? 9;
    const ob = ordemStatus[b._status] ?? 9;
    if (oa !== ob) return oa - ob;
    return (a.data_vencimento || '').localeCompare(b.data_vencimento || '');
  });

  const obraMap = {};
  obras.forEach(o => obraMap[o.id] = o.nome);

  listaEl.innerHTML = filtrada.map(c => {
    const st = CONTA_STATUS[c._status] || CONTA_STATUS.pendente;
    const bordaCor = c._status === 'vencido' ? '#ef4444' : c._status === 'pago' ? '#22c55e' : '#f59e0b';
    const obraNome = c.obra_id ? obraMap[c.obra_id] || '' : '';
    const isPago = c._status === 'pago';
    const isCancelado = c._status === 'cancelado';

    return `<div class="card" style="padding:14px 14px 14px 18px;margin-bottom:8px;border-left:3px solid ${bordaCor};${isPago || isCancelado ? 'opacity:0.6;' : ''}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">
        <div style="flex:1;min-width:0;">
          <div style="font-weight:700;font-size:14px;color:var(--branco);margin-bottom:2px;">${esc(c.fornecedor)}</div>
          ${c.descricao ? `<div style="font-size:12px;color:var(--texto2);margin-bottom:4px;">${esc(c.descricao)}</div>` : ''}
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;font-size:11px;color:var(--texto3);">
            <span>Vence: <strong style="color:${c._status === 'vencido' ? '#ef4444' : 'var(--branco)'};">${fmtData(c.data_vencimento)}</strong></span>
            ${obraNome ? `<span>Obra: ${esc(obraNome)}</span>` : ''}
            ${c.nota_ref ? `<span>Ref: ${esc(c.nota_ref)}</span>` : ''}
            ${c.data_pagamento ? `<span>Pago em: ${fmtData(c.data_pagamento)}</span>` : ''}
          </div>
        </div>
        <div style="text-align:right;flex-shrink:0;">
          <div style="font-weight:800;font-size:16px;color:var(--verde-hl);font-family:'JetBrains Mono',monospace;">${fmt(c.valor)}</div>
          <span style="display:inline-block;padding:2px 8px;border-radius:6px;font-size:10px;font-weight:700;color:${st.cor};background:${st.bg};margin-top:4px;">${st.icone} ${st.lb}</span>
        </div>
      </div>
      ${!isPago && !isCancelado ? `<div style="display:flex;gap:6px;margin-top:10px;justify-content:flex-end;">
        <button onclick="marcarComoPago('${esc(c.id)}')" style="padding:5px 12px;border-radius:8px;border:1px solid rgba(34,197,94,0.3);background:rgba(34,197,94,0.08);color:var(--verde-hl);font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;">✅ Pago</button>
        <button onclick="abrirModalConta('${esc(c.id)}')" style="padding:5px 12px;border-radius:8px;border:1px solid var(--borda2);background:transparent;color:var(--texto2);font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;">✏ Editar</button>
        <button onclick="excluirConta('${esc(c.id)}')" style="padding:5px 12px;border-radius:8px;border:1px solid rgba(239,68,68,0.2);background:transparent;color:#f87171;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;">🗑</button>
      </div>` : `<div style="display:flex;gap:6px;margin-top:10px;justify-content:flex-end;">
        <button onclick="excluirConta('${esc(c.id)}')" style="padding:5px 12px;border-radius:8px;border:1px solid rgba(239,68,68,0.2);background:transparent;color:#f87171;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;">🗑</button>
      </div>`}
    </div>`;
  }).join('');
}

// ── MODAL CRIAR/EDITAR ───────────────────────────────────
function abrirModalConta(contaId) {
  const modal = document.getElementById('modal-conta');
  const titulo = document.getElementById('modal-conta-titulo');
  const selObra = document.getElementById('conta-obra');

  // Popular select de obras
  selObra.innerHTML = '<option value="">— Nenhuma —</option>' +
    obras.map(o => `<option value="${o.id}">${esc(o.nome)}</option>`).join('');

  if (contaId) {
    const c = contasPagar.find(x => x.id === contaId);
    if (!c) return;
    titulo.textContent = 'Editar conta';
    document.getElementById('conta-id').value = c.id;
    document.getElementById('conta-fornecedor').value = c.fornecedor || '';
    document.getElementById('conta-descricao').value = c.descricao || '';
    document.getElementById('conta-valor').value = c.valor || '';
    document.getElementById('conta-vencimento').value = c.data_vencimento || '';
    document.getElementById('conta-obra').value = c.obra_id || '';
    document.getElementById('conta-nota-ref').value = c.nota_ref || '';
  } else {
    titulo.textContent = 'Nova conta';
    document.getElementById('conta-id').value = '';
    document.getElementById('conta-fornecedor').value = '';
    document.getElementById('conta-descricao').value = '';
    document.getElementById('conta-valor').value = '';
    document.getElementById('conta-vencimento').value = '';
    document.getElementById('conta-obra').value = '';
    document.getElementById('conta-nota-ref').value = '';
  }

  modal.classList.remove('hidden');
  setTimeout(() => document.getElementById('conta-fornecedor').focus(), 100);
}

// ── SALVAR ────────────────────────────────────────────────
async function salvarConta() {
  const fornecedor = (document.getElementById('conta-fornecedor').value || '').trim();
  const descricao = (document.getElementById('conta-descricao').value || '').trim();
  const valor = parseFloat(document.getElementById('conta-valor').value) || 0;
  const data_vencimento = document.getElementById('conta-vencimento').value;
  const obra_id = document.getElementById('conta-obra').value || null;
  const nota_ref = (document.getElementById('conta-nota-ref').value || '').trim();
  const id = document.getElementById('conta-id').value;

  if (!fornecedor) { showToast('⚠ Informe o fornecedor.'); return; }
  if (valor <= 0) { showToast('⚠ Informe o valor.'); return; }
  if (!data_vencimento) { showToast('⚠ Informe a data de vencimento.'); return; }

  const payload = { fornecedor, descricao, valor, data_vencimento, obra_id, nota_ref };

  try {
    if (id) {
      // Editar
      const [atualizada] = await sbPatch('contas_pagar', id, payload);
      const idx = contasPagar.findIndex(c => c.id === id);
      if (idx >= 0) contasPagar[idx] = { ...contasPagar[idx], ...atualizada };
      showToast('✅ Conta atualizada');
    } else {
      // Criar
      payload.status = 'pendente';
      const [nova] = await sbPost('contas_pagar', payload);
      contasPagar.push(nova);
      showToast('✅ Conta cadastrada');
    }
    fecharModal('conta');
    renderContasPagar();
  } catch(e) {
    console.error(e);
    showToast('❌ Erro ao salvar conta. Verifique se a tabela existe no Supabase.');
  }
}

// ── MARCAR COMO PAGO ─────────────────────────────────────
async function marcarComoPago(contaId) {
  if (!confirm('Confirma pagamento desta conta?')) return;
  try {
    const [atualizada] = await sbPatch('contas_pagar', contaId, { status: 'pago', data_pagamento: hojeISO() });
    const idx = contasPagar.findIndex(c => c.id === contaId);
    if (idx >= 0) contasPagar[idx] = { ...contasPagar[idx], ...atualizada };
    showToast('✅ Conta marcada como paga');
    renderContasPagar();
    renderDashboard();
  } catch(e) {
    console.error(e);
    showToast('❌ Erro ao atualizar conta.');
  }
}

// ── EXCLUIR ──────────────────────────────────────────────
async function excluirConta(contaId) {
  if (!confirm('Excluir esta conta? Essa acao nao pode ser desfeita.')) return;
  try {
    await sbDelete('contas_pagar', contaId);
    contasPagar = contasPagar.filter(c => c.id !== contaId);
    showToast('✅ Conta excluida');
    renderContasPagar();
    renderDashboard();
  } catch(e) {
    console.error(e);
    showToast('❌ Erro ao excluir conta.');
  }
}
