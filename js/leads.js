// ══════════════════════════════════════════
// LEADS — Capturados pela Duda (chatbot)
// ══════════════════════════════════════════

let leadsData = [];

async function loadLeads() {
  try {
    const rows = await sbGet('leads', '?select=*&order=criado_em.desc');
    if (Array.isArray(rows)) leadsData = rows;
  } catch(e) {}
}

function renderLeads() {
  const el = document.getElementById('leads-lista');
  const stats = document.getElementById('leads-stats');
  if (!el) return;

  const filtro = document.getElementById('leads-filtro-status')?.value || '';
  let lista = [...leadsData];
  if (filtro) lista = lista.filter(l => l.status === filtro);

  const novos = leadsData.filter(l => l.status === 'novo').length;
  const contatados = leadsData.filter(l => l.status === 'contatado').length;
  const convertidos = leadsData.filter(l => l.status === 'convertido').length;
  if (stats) stats.innerHTML = `${leadsData.length} lead(s) · <span style="color:#22c55e;">${novos} novo(s)</span> · ${contatados} contatado(s) · ${convertidos} convertido(s)`;

  if (!lista.length) {
    el.innerHTML = '<div class="empty">Nenhum lead encontrado. Quando alguém conversar com a Duda no site e informar os dados, aparece aqui.</div>';
    return;
  }

  el.innerHTML = lista.map(l => {
    const corStatus = l.status === 'novo' ? '#22c55e' : l.status === 'contatado' ? '#3b82f6' : l.status === 'convertido' ? '#f59e0b' : '#8a8a8a';
    const bgStatus = l.status === 'novo' ? 'rgba(34,197,94,0.08)' : l.status === 'contatado' ? 'rgba(59,130,246,0.08)' : l.status === 'convertido' ? 'rgba(245,158,11,0.08)' : 'rgba(255,255,255,0.04)';
    const labelStatus = l.status === 'novo' ? 'NOVO' : l.status === 'contatado' ? 'CONTATADO' : l.status === 'convertido' ? 'CONVERTIDO' : 'DESCARTADO';
    const data = l.criado_em ? new Date(l.criado_em).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : '';

    return `<div style="background:var(--bg2);border:1px solid var(--borda);border-left:3px solid ${corStatus};border-radius:10px;padding:16px;margin-bottom:8px;">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap;">
        <div style="flex:1;min-width:200px;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
            <span style="font-size:16px;font-weight:700;color:var(--branco);">${esc(l.nome || 'Sem nome')}</span>
            <span style="font-size:9px;font-weight:700;padding:2px 8px;border-radius:4px;background:${bgStatus};color:${corStatus};border:1px solid ${corStatus}30;">${labelStatus}</span>
          </div>
          ${l.telefone ? `<div style="font-size:13px;color:var(--verde-hl);font-family:'JetBrains Mono',monospace;margin-bottom:4px;">
            <a href="https://wa.me/55${l.telefone.replace(/\D/g,'')}" target="_blank" style="color:var(--verde-hl);text-decoration:none;">${l.telefone}</a>
          </div>` : ''}
          <div style="display:flex;gap:12px;flex-wrap:wrap;font-size:11px;color:var(--texto2);margin-bottom:6px;">
            ${l.faixa ? `<span style="background:rgba(255,255,255,0.04);padding:2px 8px;border-radius:4px;">${l.faixa}</span>` : ''}
            ${l.renda ? `<span>Renda: R$ ${Number(l.renda).toLocaleString('pt-BR')}</span>` : ''}
            ${l.modelo_escolhido ? `<span style="color:#f59e0b;">Modelo: ${l.modelo_escolhido}</span>` : ''}
            ${l.tem_terreno === true ? '<span style="color:#22c55e;">Tem terreno</span>' : l.tem_terreno === false ? '<span style="color:#ef4444;">Sem terreno</span>' : ''}
            ${l.tem_fgts === true ? '<span style="color:#22c55e;">Tem FGTS</span>' : l.tem_fgts === false ? '<span style="color:#ef4444;">Sem FGTS</span>' : ''}
          </div>
          <div style="font-size:10px;color:var(--texto3);">${data}</div>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0;">
          ${l.observacoes ? `<button onclick="verConversaLead('${esc(l.id)}')" style="background:rgba(255,255,255,0.04);border:1px solid var(--borda);color:var(--texto2);border-radius:6px;padding:5px 10px;font-size:10px;font-family:'Rajdhani',sans-serif;font-weight:700;cursor:pointer;">💬 CONVERSA</button>` : ''}
          ${l.status === 'novo' ? `<button onclick="atualizarLeadStatus('${esc(l.id)}','contatado')" style="background:rgba(59,130,246,0.08);border:1px solid rgba(59,130,246,0.2);color:#60a5fa;border-radius:6px;padding:5px 10px;font-size:10px;font-family:'Rajdhani',sans-serif;font-weight:700;cursor:pointer;">📞 CONTATADO</button>` : ''}
          ${l.status === 'contatado' ? `<button onclick="atualizarLeadStatus('${esc(l.id)}','convertido')" style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.2);color:#f59e0b;border-radius:6px;padding:5px 10px;font-size:10px;font-family:'Rajdhani',sans-serif;font-weight:700;cursor:pointer;">✅ CONVERTIDO</button>` : ''}
          ${l.status !== 'descartado' ? `<button onclick="atualizarLeadStatus('${esc(l.id)}','descartado')" style="background:none;border:none;color:var(--texto3);cursor:pointer;font-size:12px;padding:4px;" title="Descartar">✕</button>` : `<button onclick="atualizarLeadStatus('${esc(l.id)}','novo')" style="background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.15);color:#22c55e;border-radius:6px;padding:5px 10px;font-size:10px;font-family:'Rajdhani',sans-serif;font-weight:700;cursor:pointer;">↩ REABRIR</button>`}
        </div>
      </div>
    </div>`;
  }).join('');
}

function verConversaLead(leadId) {
  const lead = leadsData.find(l => l.id === leadId);
  if (!lead?.observacoes) return;
  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(6px);';
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
}

async function atualizarLeadStatus(leadId, novoStatus) {
  try {
    await sbPatch('leads', `?id=eq.${leadId}`, { status: novoStatus });
    const lead = leadsData.find(l => l.id === leadId);
    if (lead) lead.status = novoStatus;
    renderLeads();
    const labels = { contatado: '📞 Lead contatado!', convertido: '✅ Lead convertido!', descartado: '✅ Lead descartado.', novo: '✅ Lead reaberto.' };
    showToast(labels[novoStatus] || '✅ Status atualizado.');
  } catch(e) { showToast('❌ Não foi possível atualizar o lead.'); }
}
