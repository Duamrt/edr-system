// ══════════════════════════════════════════
// LEADS V2 — CRM completo com histórico
// ══════════════════════════════════════════

let leadsData = [];
let leadHistorico = [];
let leadFiltroStatus = '';

const LEAD_STATUS = {
  novo:       { lb: 'NOVO',       cor: '#22c55e', bg: 'rgba(34,197,94,0.08)',    icone: '🟢' },
  contatado:  { lb: 'CONTATADO',  cor: '#3b82f6', bg: 'rgba(59,130,246,0.08)',   icone: '🔵' },
  convertido: { lb: 'CONVERTIDO', cor: '#f59e0b', bg: 'rgba(245,158,11,0.08)',   icone: '🟠' },
  descartado: { lb: 'DESCARTADO', cor: '#6b7280', bg: 'rgba(255,255,255,0.04)',  icone: '⚫' }
};

const LEAD_ACOES = {
  ligar:    '📞 Ligar',
  visita:   '🏠 Visita',
  proposta: '📄 Enviar proposta',
  reuniao:  '🤝 Reunião',
  outro:    '📋 Outro'
};

// ── Carregamento ──────────────────────────────────────

async function loadLeads() {
  try {
    const rows = await sbGet('leads', '?select=*&order=criado_em.desc');
    if (Array.isArray(rows)) leadsData = rows;
  } catch(e) {}
  await loadLeadHistorico();
}

async function loadLeadHistorico() {
  try {
    const rows = await sbGet('lead_historico', '?select=*&order=criado_em.desc');
    if (Array.isArray(rows)) leadHistorico = rows;
  } catch(e) { leadHistorico = []; }
}

// ── Renderização ──────────────────────────────────────

function renderLeads() {
  const el = document.getElementById('leads-lista');
  const statsEl = document.getElementById('leads-stats');
  if (!el) return;

  // Contadores
  const contadores = { novo: 0, contatado: 0, convertido: 0, descartado: 0 };
  leadsData.forEach(l => { if (contadores[l.status] !== undefined) contadores[l.status]++; });
  const total = leadsData.length;

  // Chips de filtro
  if (statsEl) {
    const chipBase = 'display:inline-flex;align-items:center;gap:4px;padding:5px 12px;border-radius:20px;font-size:11px;font-weight:700;cursor:pointer;border:1px solid;transition:all .15s;font-family:inherit;';
    let chips = `<button onclick="leadFiltroStatus='';renderLeads()" style="${chipBase}background:${!leadFiltroStatus ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.03)'};color:${!leadFiltroStatus ? 'var(--branco)' : 'var(--texto3)'};border-color:${!leadFiltroStatus ? 'rgba(255,255,255,0.2)' : 'var(--borda)'};">📋 Todos (${total})</button>`;
    for (const [key, cfg] of Object.entries(LEAD_STATUS)) {
      const ativo = leadFiltroStatus === key;
      chips += `<button onclick="leadFiltroStatus='${key}';renderLeads()" style="${chipBase}background:${ativo ? cfg.bg : 'rgba(255,255,255,0.03)'};color:${ativo ? cfg.cor : 'var(--texto3)'};border-color:${ativo ? cfg.cor + '40' : 'var(--borda)'};">${cfg.icone} ${cfg.lb} (${contadores[key]})</button>`;
    }
    statsEl.innerHTML = chips;
  }

  // Filtrar
  let lista = [...leadsData];
  if (leadFiltroStatus) lista = lista.filter(l => l.status === leadFiltroStatus);

  if (!lista.length) {
    el.innerHTML = '<div class="empty">Nenhum lead encontrado. Quando alguém conversar com a Duda no site e informar os dados, aparece aqui.</div>';
    return;
  }

  // Agrupar por status
  const ordem = ['novo', 'contatado', 'convertido', 'descartado'];
  const grupos = {};
  lista.forEach(l => {
    const s = l.status || 'novo';
    if (!grupos[s]) grupos[s] = [];
    grupos[s].push(l);
  });

  let html = '';
  for (const status of ordem) {
    if (!grupos[status] || !grupos[status].length) continue;
    const cfg = LEAD_STATUS[status] || LEAD_STATUS.novo;
    html += `<div style="margin-bottom:16px;">
      <div style="font-size:12px;font-weight:700;color:${cfg.cor};margin-bottom:8px;padding:4px 0;letter-spacing:.5px;">${cfg.icone} ${cfg.lb} (${grupos[status].length})</div>`;
    html += grupos[status].map(l => _renderLeadCard(l)).join('');
    html += '</div>';
  }

  el.innerHTML = html;
}

function _renderLeadCard(l) {
  const cfg = LEAD_STATUS[l.status] || LEAD_STATUS.novo;
  const data = l.criado_em ? fmtData(l.criado_em) : '';
  const telLimpo = l.telefone ? l.telefone.replace(/\D/g, '') : '';

  let acaoHtml = '';
  if (l.tipo_acao && l.proxima_data) {
    const acaoLabel = LEAD_ACOES[l.tipo_acao] || l.tipo_acao;
    const dataAcao = fmtData(l.proxima_data);
    acaoHtml = `<div style="margin-top:6px;font-size:11px;color:#f59e0b;background:rgba(245,158,11,0.06);padding:3px 8px;border-radius:4px;display:inline-block;">🎯 ${esc(acaoLabel)} ${dataAcao}</div>`;
  }

  return `<div onclick="abrirModalLead('${esc(l.id)}')" style="background:var(--bg2);border:1px solid var(--borda);border-left:3px solid ${cfg.cor};border-radius:10px;padding:14px 16px;margin-bottom:6px;cursor:pointer;transition:background .15s;" onmouseenter="this.style.background='rgba(255,255,255,0.04)'" onmouseleave="this.style.background='var(--bg2)'">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap;">
      <div style="flex:1;min-width:180px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
          <span style="font-size:15px;font-weight:700;color:var(--branco);">${esc(l.nome || 'Sem nome')}</span>
          <span style="font-size:9px;font-weight:700;padding:2px 8px;border-radius:4px;background:${cfg.bg};color:${cfg.cor};border:1px solid ${cfg.cor}30;">${cfg.lb}</span>
        </div>
        ${telLimpo ? `<div style="font-size:13px;font-family:'JetBrains Mono',monospace;margin-bottom:4px;">
          <a href="https://wa.me/55${telLimpo}" target="_blank" onclick="event.stopPropagation()" style="color:var(--verde-hl);text-decoration:none;">${esc(l.telefone)}</a>
        </div>` : ''}
        <div style="display:flex;gap:8px;flex-wrap:wrap;font-size:11px;color:var(--texto2);">
          ${l.faixa ? `<span style="background:rgba(255,255,255,0.04);padding:2px 8px;border-radius:4px;">${esc(l.faixa)}</span>` : ''}
          ${l.modelo_escolhido ? `<span style="color:#f59e0b;">${esc(l.modelo_escolhido)}</span>` : ''}
          ${l.renda ? `<span>R$ ${Number(l.renda).toLocaleString('pt-BR')}</span>` : ''}
        </div>
        ${acaoHtml}
      </div>
      <div style="font-size:10px;color:var(--texto3);white-space:nowrap;">${data}</div>
    </div>
  </div>`;
}

// ── Modal Detalhe ─────────────────────────────────────

function abrirModalLead(leadId) {
  const lead = leadsData.find(l => l.id === leadId);
  if (!lead) return;
  const cfg = LEAD_STATUS[lead.status] || LEAD_STATUS.novo;
  const telLimpo = lead.telefone ? lead.telefone.replace(/\D/g, '') : '';
  const hist = leadHistorico.filter(h => h.lead_id === leadId);
  const notas = hist.filter(h => h.tipo === 'nota');

  // Opções de obras
  const obrasOpts = (typeof obras !== 'undefined' ? obras : []).map(o =>
    `<option value="${esc(o.id)}" ${lead.obra_id === o.id ? 'selected' : ''}>${esc(o.nome)}</option>`
  ).join('');

  // Opções de ação
  const acoesOpts = Object.entries(LEAD_ACOES).map(([k, v]) =>
    `<option value="${esc(k)}" ${lead.tipo_acao === k ? 'selected' : ''}>${v}</option>`
  ).join('');

  const modal = document.createElement('div');
  modal.id = 'modal-lead-detalhe';
  modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:center;padding:12px;backdrop-filter:blur(6px);';
  modal.onclick = e => { if (e.target === modal) modal.remove(); };

  // Timeline do histórico
  const timelineHtml = hist.length ? hist.map(h => {
    const ico = h.tipo === 'status' ? '🔄' : h.tipo === 'nota' ? '📝' : h.tipo === 'acao' ? '🎯' : '📋';
    const dt = h.criado_em ? new Date(h.criado_em).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : '';
    return `<div style="display:flex;gap:8px;padding:8px 0;border-bottom:1px solid var(--borda);">
      <span style="font-size:14px;">${ico}</span>
      <div style="flex:1;min-width:0;">
        <div style="font-size:11px;color:var(--texto2);word-break:break-word;">${esc(h.conteudo || '')}</div>
        <div style="font-size:10px;color:var(--texto3);margin-top:2px;">${dt}${h.usuario ? ' · ' + esc(h.usuario) : ''}</div>
      </div>
    </div>`;
  }).join('') : '<div style="color:var(--texto3);font-size:12px;padding:12px 0;">Nenhum evento registrado.</div>';

  // Notas anteriores
  const notasHtml = notas.length ? notas.map(n => {
    const dt = n.criado_em ? new Date(n.criado_em).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : '';
    return `<div style="background:rgba(255,255,255,0.03);border:1px solid var(--borda);border-radius:8px;padding:10px;margin-bottom:6px;">
      <div style="font-size:12px;color:var(--texto2);white-space:pre-wrap;word-break:break-word;">${esc(n.conteudo || '')}</div>
      <div style="font-size:10px;color:var(--texto3);margin-top:4px;">${dt}${n.usuario ? ' · ' + esc(n.usuario) : ''}</div>
    </div>`;
  }).join('') : '<div style="color:var(--texto3);font-size:12px;">Nenhuma nota ainda.</div>';

  modal.innerHTML = `<div style="background:#111113;border:1px solid rgba(255,255,255,0.06);border-radius:14px;max-width:600px;width:100%;max-height:90vh;overflow-y:auto;display:flex;flex-direction:column;">
    <!-- Header -->
    <div style="padding:20px 20px 0;flex-shrink:0;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;">
        <div>
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
            <span style="font-size:18px;font-weight:700;color:var(--branco);">${esc(lead.nome || 'Sem nome')}</span>
            <span style="font-size:10px;font-weight:700;padding:3px 10px;border-radius:4px;background:${cfg.bg};color:${cfg.cor};border:1px solid ${cfg.cor}30;">${cfg.lb}</span>
          </div>
          ${telLimpo ? `<a href="https://wa.me/55${telLimpo}" target="_blank" style="color:var(--verde-hl);text-decoration:none;font-size:14px;font-family:'JetBrains Mono',monospace;">${esc(lead.telefone)}</a>` : ''}
        </div>
        <button onclick="document.getElementById('modal-lead-detalhe').remove()" style="background:none;border:none;color:var(--texto3);font-size:20px;cursor:pointer;padding:0 4px;">✕</button>
      </div>
      <!-- Abas -->
      <div style="display:flex;gap:0;border-bottom:1px solid var(--borda);">
        <button id="lead-tab-visao" onclick="_leadTab('visao')" style="padding:8px 16px;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer;background:none;border:none;border-bottom:2px solid var(--verde-hl);color:var(--branco);">Visão Geral</button>
        <button id="lead-tab-hist" onclick="_leadTab('hist')" style="padding:8px 16px;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer;background:none;border:none;border-bottom:2px solid transparent;color:var(--texto3);">Histórico</button>
        <button id="lead-tab-notas" onclick="_leadTab('notas')" style="padding:8px 16px;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer;background:none;border:none;border-bottom:2px solid transparent;color:var(--texto3);">Notas</button>
      </div>
    </div>

    <!-- ABA VISÃO GERAL -->
    <div id="lead-pane-visao" style="padding:16px 20px 20px;flex:1;overflow-y:auto;">
      <!-- Dados -->
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px;margin-bottom:16px;">
        ${_leadInfoChip('Faixa', lead.faixa)}
        ${_leadInfoChip('Renda', lead.renda ? 'R$ ' + Number(lead.renda).toLocaleString('pt-BR') : '')}
        ${_leadInfoChip('Modelo', lead.modelo_escolhido)}
        ${_leadInfoChip('Terreno', lead.tem_terreno === true ? 'Sim' : lead.tem_terreno === false ? 'Não' : '')}
        ${_leadInfoChip('FGTS', lead.tem_fgts === true ? 'Sim' : lead.tem_fgts === false ? 'Não' : '')}
      </div>

      <!-- Próxima ação -->
      <div style="background:rgba(255,255,255,0.03);border:1px solid var(--borda);border-radius:10px;padding:12px;margin-bottom:12px;">
        <div style="font-size:11px;font-weight:700;color:var(--texto3);margin-bottom:8px;letter-spacing:.5px;">🎯 PRÓXIMA AÇÃO</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <select id="lead-tipo-acao" style="flex:1;min-width:120px;padding:8px 10px;background:var(--bg2);border:1px solid var(--borda2);border-radius:8px;color:var(--branco);font-size:12px;font-family:inherit;">
            <option value="">Selecionar...</option>
            ${acoesOpts}
          </select>
          <input type="date" id="lead-proxima-data" value="${esc(lead.proxima_data || '')}" style="padding:8px 10px;background:var(--bg2);border:1px solid var(--borda2);border-radius:8px;color:var(--branco);font-size:12px;font-family:inherit;">
          <button onclick="salvarProximaAcao('${esc(lead.id)}')" style="padding:8px 14px;background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.2);color:#60a5fa;border-radius:8px;font-size:11px;font-weight:700;font-family:inherit;cursor:pointer;">SALVAR</button>
        </div>
      </div>

      <!-- Vincular à obra -->
      ${lead.status !== 'convertido' ? `<div style="background:rgba(255,255,255,0.03);border:1px solid var(--borda);border-radius:10px;padding:12px;margin-bottom:16px;">
        <div style="font-size:11px;font-weight:700;color:var(--texto3);margin-bottom:8px;letter-spacing:.5px;">🏗 VINCULAR À OBRA</div>
        <div style="display:flex;gap:8px;">
          <select id="lead-obra-select" style="flex:1;padding:8px 10px;background:var(--bg2);border:1px solid var(--borda2);border-radius:8px;color:var(--branco);font-size:12px;font-family:inherit;">
            <option value="">Nenhuma</option>
            ${obrasOpts}
          </select>
        </div>
      </div>` : `<div style="background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.15);border-radius:10px;padding:12px;margin-bottom:16px;font-size:12px;color:#f59e0b;">🟠 Lead convertido${lead.obra_id ? ' — vinculado a uma obra' : ''}</div>`}

      <!-- Botões de ação -->
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        ${lead.status === 'novo' ? `<button onclick="atualizarLeadStatus('${esc(lead.id)}','contatado')" style="flex:1;padding:10px;background:rgba(59,130,246,0.08);border:1px solid rgba(59,130,246,0.2);color:#60a5fa;border-radius:8px;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer;">📞 CONTATADO</button>` : ''}
        ${lead.status !== 'convertido' && lead.status !== 'descartado' ? `<button onclick="converterLead('${esc(lead.id)}')" style="flex:1;padding:10px;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.2);color:#f59e0b;border-radius:8px;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer;">✅ CONVERTER</button>` : ''}
        ${lead.status !== 'descartado' ? `<button onclick="atualizarLeadStatus('${esc(lead.id)}','descartado')" style="flex:1;padding:10px;background:rgba(107,114,128,0.08);border:1px solid rgba(107,114,128,0.2);color:#9ca3af;border-radius:8px;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer;">✕ DESCARTAR</button>` : `<button onclick="atualizarLeadStatus('${esc(lead.id)}','novo')" style="flex:1;padding:10px;background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.2);color:#22c55e;border-radius:8px;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer;">↩ REABRIR</button>`}
        ${lead.observacoes ? `<button onclick="verConversaLead('${esc(lead.id)}')" style="flex:1;padding:10px;background:rgba(255,255,255,0.04);border:1px solid var(--borda);color:var(--texto2);border-radius:8px;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer;">💬 CONVERSA</button>` : ''}
      </div>
    </div>

    <!-- ABA HISTÓRICO -->
    <div id="lead-pane-hist" style="padding:16px 20px 20px;flex:1;overflow-y:auto;display:none;">
      ${timelineHtml}
    </div>

    <!-- ABA NOTAS -->
    <div id="lead-pane-notas" style="padding:16px 20px 20px;flex:1;overflow-y:auto;display:none;">
      <div style="margin-bottom:12px;">
        <textarea id="lead-nota-text" placeholder="Escrever anotação..." style="width:100%;min-height:70px;padding:10px;background:var(--bg2);border:1px solid var(--borda2);border-radius:8px;color:var(--branco);font-size:12px;font-family:inherit;resize:vertical;box-sizing:border-box;"></textarea>
        <button onclick="adicionarNotaLead('${esc(lead.id)}')" style="margin-top:6px;padding:8px 16px;background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.2);color:#22c55e;border-radius:8px;font-size:11px;font-weight:700;font-family:inherit;cursor:pointer;">💾 SALVAR NOTA</button>
      </div>
      <div style="font-size:11px;font-weight:700;color:var(--texto3);margin-bottom:8px;letter-spacing:.5px;">NOTAS ANTERIORES</div>
      ${notasHtml}
    </div>
  </div>`;

  document.body.appendChild(modal);

  // ESC fecha
  const escHandler = e => { if (e.key === 'Escape') { modal.remove(); document.removeEventListener('keydown', escHandler); } };
  document.addEventListener('keydown', escHandler);
}

function _leadInfoChip(label, valor) {
  if (!valor) return '';
  return `<div style="background:rgba(255,255,255,0.03);border:1px solid var(--borda);border-radius:8px;padding:8px 10px;">
    <div style="font-size:9px;color:var(--texto3);font-weight:700;letter-spacing:.5px;margin-bottom:2px;">${esc(label)}</div>
    <div style="font-size:13px;color:var(--branco);font-weight:600;">${esc(String(valor))}</div>
  </div>`;
}

function _leadTab(tab) {
  const tabs = ['visao', 'hist', 'notas'];
  tabs.forEach(t => {
    const btn = document.getElementById('lead-tab-' + t);
    const pane = document.getElementById('lead-pane-' + t);
    if (btn) {
      btn.style.borderBottomColor = t === tab ? 'var(--verde-hl)' : 'transparent';
      btn.style.color = t === tab ? 'var(--branco)' : 'var(--texto3)';
    }
    if (pane) pane.style.display = t === tab ? 'block' : 'none';
  });
}

// ── Ações ─────────────────────────────────────────────

async function salvarProximaAcao(leadId) {
  const tipo = document.getElementById('lead-tipo-acao')?.value || '';
  const data = document.getElementById('lead-proxima-data')?.value || '';

  if (!tipo) { showToast('⚠ Selecione o tipo de ação.'); return; }

  try {
    await sbPatch('leads', `?id=eq.${leadId}`, {
      tipo_acao: tipo,
      proxima_data: data || null,
      atualizado_em: new Date().toISOString()
    });
    // Registrar no histórico
    const acaoLabel = LEAD_ACOES[tipo] || tipo;
    await sbPost('lead_historico', {
      lead_id: leadId,
      tipo: 'acao',
      conteudo: `Próxima ação definida: ${acaoLabel}${data ? ' em ' + fmtData(data) : ''}`,
      usuario: typeof usuarioAtual !== 'undefined' && usuarioAtual?.nome ? usuarioAtual.nome : ''
    });
    // Atualizar local
    const lead = leadsData.find(l => l.id === leadId);
    if (lead) { lead.tipo_acao = tipo; lead.proxima_data = data || null; }
    await loadLeadHistorico();
    showToast('✅ Próxima ação salva.');
    _fecharModalLead();
    renderLeads();
  } catch(e) { showToast('❌ Erro ao salvar ação.'); }
}

async function adicionarNotaLead(leadId) {
  const textarea = document.getElementById('lead-nota-text');
  const texto = textarea?.value?.trim();
  if (!texto) { showToast('⚠ Escreva algo antes de salvar.'); return; }

  try {
    await sbPost('lead_historico', {
      lead_id: leadId,
      tipo: 'nota',
      conteudo: texto,
      usuario: typeof usuarioAtual !== 'undefined' && usuarioAtual?.nome ? usuarioAtual.nome : ''
    });
    showToast('✅ Nota adicionada.');
    await loadLeadHistorico();
    _fecharModalLead();
    abrirModalLead(leadId);
    // Trocar pra aba notas
    setTimeout(() => _leadTab('notas'), 50);
  } catch(e) { showToast('❌ Erro ao salvar nota.'); }
}

async function converterLead(leadId) {
  const lead = leadsData.find(l => l.id === leadId);
  if (!lead) return;

  // Pegar obra selecionada no modal (se houver)
  const obraSelect = document.getElementById('lead-obra-select');
  const obraId = obraSelect?.value || null;

  if (!confirm(`Converter lead "${lead.nome || 'Sem nome'}" para CONVERTIDO?${obraId ? '\n\nSer\u00e1 vinculado \u00e0 obra selecionada.' : ''}`)) return;

  try {
    const patch = {
      status: 'convertido',
      atualizado_em: new Date().toISOString()
    };
    if (obraId) patch.obra_id = obraId;

    await sbPatch('leads', `?id=eq.${leadId}`, patch);
    await sbPost('lead_historico', {
      lead_id: leadId,
      tipo: 'status',
      conteudo: `Status alterado para CONVERTIDO${obraId ? ' (vinculado a obra)' : ''}`,
      usuario: typeof usuarioAtual !== 'undefined' && usuarioAtual?.nome ? usuarioAtual.nome : ''
    });

    if (lead) {
      lead.status = 'convertido';
      if (obraId) lead.obra_id = obraId;
    }
    await loadLeadHistorico();
    showToast('✅ Lead convertido!');
    _fecharModalLead();
    renderLeads();
  } catch(e) { showToast('❌ Erro ao converter lead.'); }
}

async function atualizarLeadStatus(leadId, novoStatus) {
  try {
    await sbPatch('leads', `?id=eq.${leadId}`, {
      status: novoStatus,
      atualizado_em: new Date().toISOString()
    });
    const statusLabel = LEAD_STATUS[novoStatus]?.lb || novoStatus;
    await sbPost('lead_historico', {
      lead_id: leadId,
      tipo: 'status',
      conteudo: `Status alterado para ${statusLabel}`,
      usuario: typeof usuarioAtual !== 'undefined' && usuarioAtual?.nome ? usuarioAtual.nome : ''
    }).catch(() => {});

    const lead = leadsData.find(l => l.id === leadId);
    if (lead) lead.status = novoStatus;
    await loadLeadHistorico();
    renderLeads();

    const labels = { contatado: '📞 Lead contatado!', convertido: '✅ Lead convertido!', descartado: '✅ Lead descartado.', novo: '✅ Lead reaberto.' };
    showToast(labels[novoStatus] || '✅ Status atualizado.');
    _fecharModalLead();
  } catch(e) { showToast('❌ Não foi possível atualizar o lead.'); }
}

function verConversaLead(leadId) {
  const lead = leadsData.find(l => l.id === leadId);
  if (!lead?.observacoes) return;
  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(6px);';
  modal.onclick = e => { if (e.target === modal) modal.remove(); };
  const obs = esc(lead.observacoes).replace(/\n/g, '<br>').replace(/(Cliente:)/g, '<strong style="color:var(--verde-hl);">$1</strong>').replace(/(Duda:)/g, '<strong style="color:#f59e0b;">$1</strong>');
  modal.innerHTML = `<div style="background:#111113;border:1px solid rgba(255,255,255,0.06);border-radius:14px;padding:24px;max-width:600px;width:100%;max-height:80vh;overflow-y:auto;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <span style="font-weight:700;font-size:14px;">💬 Conversa com ${esc(lead.nome || 'Lead')}</span>
      <button onclick="this.closest('div[style]').parentElement.remove()" style="background:none;border:none;color:var(--texto3);font-size:18px;cursor:pointer;">✕</button>
    </div>
    <div style="font-size:12px;line-height:1.8;color:var(--texto2);">${obs}</div>
  </div>`;
  document.body.appendChild(modal);
  const escH = e => { if (e.key === 'Escape') { modal.remove(); document.removeEventListener('keydown', escH); } };
  document.addEventListener('keydown', escH);
}

function _fecharModalLead() {
  const m = document.getElementById('modal-lead-detalhe');
  if (m) m.remove();
}
