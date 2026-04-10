// ══════════════════════════════════════════════════════════════
// EDR V2 — Módulo 4.1: CRM / Leads (Comercial Pré-Venda)
// Kanban pipeline + modal 3 abas + histórico timestamped
// ══════════════════════════════════════════════════════════════

const LeadsModule = {
  data: [],
  historico: [],
  filtroStatus: '',
  page: 0,
  pageSize: 50,
  _leadAberto: null,   // id do lead no modal
  _tabAtiva: 'visao',
};

// ── Constantes ───────────────────────────────────────────────

const LEAD_STATUS_ORDEM = ['novo', 'conversa', 'contatado', 'convertido', 'descartado'];

const LEAD_STATUS = {
  novo:       { lb: 'Qualificado',  cor: '#22c55e', bg: 'rgba(34,197,94,0.08)',   icon: 'verified'        },
  conversa:   { lb: 'Conversa',     cor: '#a855f7', bg: 'rgba(168,85,247,0.08)',  icon: 'forum'           },
  contatado:  { lb: 'Contatado',    cor: '#3b82f6', bg: 'rgba(59,130,246,0.08)',  icon: 'phone_in_talk'   },
  convertido: { lb: 'Convertido',   cor: '#f59e0b', bg: 'rgba(245,158,11,0.08)',  icon: 'handshake'       },
  descartado: { lb: 'Descartado',   cor: '#6b7280', bg: 'rgba(255,255,255,0.04)', icon: 'block'           },
};

const LEAD_ACOES = {
  ligar:    { lb: 'Ligar',           icon: 'call'           },
  visita:   { lb: 'Visita',          icon: 'home'           },
  proposta: { lb: 'Enviar proposta', icon: 'description'    },
  reuniao:  { lb: 'Reuniao',         icon: 'groups'         },
  outro:    { lb: 'Outro',           icon: 'edit_note'      },
};

// ── Carregamento ─────────────────────────────────────────────

async function _leadsLoad() {
  try {
    const rows = await sbGet('leads', '?select=*&order=criado_em.desc');
    if (Array.isArray(rows)) LeadsModule.data = rows;
  } catch (e) { /* silencioso */ }
  await _leadsLoadHistorico();
}

async function _leadsLoadHistorico() {
  try {
    const rows = await sbGet('lead_historico', '?select=*&order=criado_em.desc');
    if (Array.isArray(rows)) LeadsModule.historico = rows;
  } catch (e) { LeadsModule.historico = []; }
}

// ── Render principal ─────────────────────────────────────────

function renderLeads() {
  const container = document.getElementById('leads-lista') || document.getElementById('view-leads');
  if (!container) return;

  // Skeleton
  container.innerHTML = _leadsSkeleton();

  requestAnimationFrame(async () => {
    if (!LeadsModule.data.length) await _leadsLoad();
    container.innerHTML = _leadsBuildPage();
    _leadsBindAutocomplete();
  });
}

function _leadsSkeleton() {
  const cols = LEAD_STATUS_ORDEM.slice(0, 4).map(() =>
    `<div style="flex:1;min-width:220px;">
      <div style="height:18px;width:100px;background:var(--skeleton);border-radius:4px;margin-bottom:12px;"></div>
      <div style="height:90px;background:var(--skeleton);border-radius:10px;margin-bottom:8px;"></div>
      <div style="height:90px;background:var(--skeleton);border-radius:10px;margin-bottom:8px;"></div>
    </div>`
  ).join('');
  return `<div style="display:flex;gap:12px;overflow-x:auto;padding:4px;">${cols}</div>`;
}

function _leadsBuildPage() {
  const M = LeadsModule;
  const total = M.data.length;

  // Contadores
  const cnt = {};
  LEAD_STATUS_ORDEM.forEach(s => cnt[s] = 0);
  M.data.forEach(l => { if (cnt[l.status] !== undefined) cnt[l.status]++; });

  // Header com stats + botao novo
  let html = `<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:16px;">
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      ${_leadsChipFiltro('', 'list', 'Todos', total)}
      ${LEAD_STATUS_ORDEM.map(s => _leadsChipFiltro(s, LEAD_STATUS[s].icon, LEAD_STATUS[s].lb, cnt[s])).join('')}
    </div>
    <button onclick="_leadsAbrirModal(null)" style="padding:8px 16px;border-radius:10px;border:1px solid rgba(45,106,79,0.4);background:rgba(45,106,79,0.1);color:#2D6A4F;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;display:flex;align-items:center;gap:6px;">
      <span class="material-symbols-outlined" style="font-size:16px;">person_add</span> NOVO LEAD
    </button>
  </div>`;

  // Filtro ativo? lista simples. Senão: Kanban
  if (M.filtroStatus) {
    html += _leadsBuildLista(M.data.filter(l => l.status === M.filtroStatus));
  } else {
    html += _leadsBuildKanban();
  }

  return html;
}

function _leadsChipFiltro(status, icon, label, count) {
  const ativo = LeadsModule.filtroStatus === status;
  const cfg = status ? LEAD_STATUS[status] : { cor: '#2D6A4F', bg: 'rgba(45,106,79,0.08)' };
  return `<button onclick="LeadsModule.filtroStatus='${status}';renderLeads()"
    style="padding:5px 12px;border-radius:20px;border:1px solid ${ativo ? cfg.cor + '60' : 'var(--borda)'};
    background:${ativo ? cfg.bg : 'transparent'};color:${ativo ? cfg.cor : 'var(--texto-sec)'};
    font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:4px;">
    <span class="material-symbols-outlined" style="font-size:14px;">${icon}</span>
    ${label} (${count})
  </button>`;
}

// ── Kanban ────────────────────────────────────────────────────

function _leadsBuildKanban() {
  const M = LeadsModule;
  // 5 colunas, mas Descartado fica colapsado
  const colunas = LEAD_STATUS_ORDEM.map(status => {
    const cfg = LEAD_STATUS[status];
    const leads = M.data.filter(l => l.status === status);
    const isDescartado = status === 'descartado';

    const cards = leads.slice(0, M.pageSize).map(l => _leadsKanbanCard(l)).join('');
    const mais = leads.length > M.pageSize
      ? `<div style="text-align:center;padding:8px;"><button onclick="LeadsModule.pageSize+=50;renderLeads()" style="font-size:11px;color:#2D6A4F;background:none;border:none;cursor:pointer;font-family:inherit;font-weight:700;">Carregar mais...</button></div>`
      : '';

    return `<div style="flex:1;min-width:220px;max-width:280px;${isDescartado ? 'opacity:0.5;' : ''}">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:10px;padding-bottom:8px;border-bottom:2px solid ${cfg.cor}30;">
        <span class="material-symbols-outlined" style="font-size:16px;color:${cfg.cor};">${cfg.icon}</span>
        <span style="font-size:12px;font-weight:700;color:${cfg.cor};">${cfg.lb.toUpperCase()}</span>
        <span style="font-size:11px;color:var(--texto-sec);font-family:'Space Grotesk',monospace;">${leads.length}</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;min-height:60px;">
        ${cards || `<div style="text-align:center;padding:20px 8px;color:var(--texto-sec);font-size:11px;">Nenhum lead</div>`}
        ${mais}
      </div>
    </div>`;
  });

  return `<div style="display:flex;gap:14px;overflow-x:auto;padding:4px 0;align-items:flex-start;">
    ${colunas.join('')}
  </div>`;
}

function _leadsKanbanCard(l) {
  const cfg = LEAD_STATUS[l.status] || LEAD_STATUS.novo;
  const data = l.criado_em ? fmtData(l.criado_em) : '';
  const origemTag = l.origem
    ? `<span style="font-size:9px;padding:1px 6px;border-radius:4px;background:rgba(59,130,246,0.1);color:#60a5fa;font-weight:700;">${esc(l.origem)}</span>`
    : l.observacoes
      ? `<span style="font-size:9px;padding:1px 6px;border-radius:4px;background:rgba(59,130,246,0.1);color:#60a5fa;font-weight:700;">Chatbot</span>`
      : '';

  let acaoHtml = '';
  if (l.tipo_acao && l.proxima_data) {
    const acao = LEAD_ACOES[l.tipo_acao] || LEAD_ACOES.outro;
    acaoHtml = `<div style="margin-top:6px;font-size:10px;color:#f59e0b;background:rgba(245,158,11,0.06);padding:2px 6px;border-radius:4px;display:inline-flex;align-items:center;gap:3px;">
      <span class="material-symbols-outlined" style="font-size:12px;">schedule</span>
      ${esc(acao.lb)} ${fmtData(l.proxima_data)}
    </div>`;
  }

  return `<div onclick="_leadsAbrirModal('${esc(l.id)}')"
    style="background:var(--card);border:1px solid var(--borda);border-left:3px solid ${cfg.cor};
    border-radius:10px;padding:12px;cursor:pointer;transition:all .15s;"
    onmouseenter="this.style.borderColor='${cfg.cor}40'" onmouseleave="this.style.borderColor='var(--borda)'">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px;">
      <span style="font-size:13px;font-weight:700;color:var(--texto-pri);">${esc(l.nome || 'Sem nome')}</span>
      ${origemTag}
    </div>
    ${l.telefone ? `<div style="font-size:11px;font-family:'Space Grotesk',monospace;color:var(--texto-sec);margin-top:4px;">${esc(l.telefone)}</div>` : ''}
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;">
      ${l.faixa ? `<span style="font-size:10px;padding:1px 6px;border-radius:4px;background:rgba(255,255,255,0.04);color:var(--texto-sec);">${esc(l.faixa)}</span>` : ''}
      ${l.modelo_escolhido ? `<span style="font-size:10px;color:#f59e0b;">${esc(l.modelo_escolhido)}</span>` : ''}
      ${l.valor_estimado ? `<span style="font-size:10px;color:#22c55e;font-weight:700;">R$ ${Number(l.valor_estimado).toLocaleString('pt-BR',{minimumFractionDigits:0})}</span>` : ''}
    </div>
    ${acaoHtml}
    <div style="font-size:9px;color:var(--text-tertiary);margin-top:6px;">${data}</div>
  </div>`;
}

// ── Lista (quando filtra por status) ─────────────────────────

function _leadsBuildLista(lista) {
  if (!lista.length) {
    return `<div style="text-align:center;padding:40px 20px;color:var(--texto-sec);">
      <span class="material-symbols-outlined" style="font-size:40px;opacity:0.3;">search_off</span>
      <div style="font-size:13px;margin-top:8px;">Nenhum lead com esse filtro.</div>
    </div>`;
  }

  const paginated = lista.slice(0, LeadsModule.pageSize);
  let html = paginated.map(l => _leadsKanbanCard(l)).join('');

  if (lista.length > LeadsModule.pageSize) {
    html += `<div style="text-align:center;padding:12px;">
      <button onclick="LeadsModule.pageSize+=50;renderLeads()" style="padding:8px 20px;border-radius:8px;border:1px solid var(--borda);background:transparent;color:var(--texto-sec);font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;">
        Carregar mais...
      </button>
    </div>`;
  }

  return `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px;">${html}</div>`;
}

// ── Modal de Detalhe / Criar ─────────────────────────────────

function _leadsAbrirModal(leadId) {
  const lead = leadId ? LeadsModule.data.find(l => l.id === leadId) : null;
  LeadsModule._leadAberto = leadId;
  LeadsModule._tabAtiva = 'visao';

  const isNovo = !lead;
  const cfg = lead ? (LEAD_STATUS[lead.status] || LEAD_STATUS.novo) : LEAD_STATUS.novo;

  // Historico e notas do lead
  const hist = lead ? LeadsModule.historico.filter(h => h.lead_id === leadId) : [];
  const notas = hist.filter(h => h.tipo === 'nota');

  // Opcoes de acao
  const acoesOpts = Object.entries(LEAD_ACOES).map(([k, v]) =>
    `<option value="${esc(k)}" ${lead?.tipo_acao === k ? 'selected' : ''}>${v.lb}</option>`
  ).join('');

  // Conversa formatada (chatbot)
  let conversaHtml = '';
  if (lead?.observacoes) {
    const linhas = lead.observacoes.split('\n').map(linha => {
      if (linha.startsWith('Cliente:')) return `<div style="margin:4px 0;padding:6px 10px;background:rgba(45,106,79,0.08);border-radius:8px 8px 8px 2px;font-size:12px;color:var(--texto-pri);"><strong style="color:#2D6A4F;">Cliente:</strong>${esc(linha.replace('Cliente:', ''))}</div>`;
      if (linha.startsWith('Duda:')) return `<div style="margin:4px 0;padding:6px 10px;background:rgba(245,158,11,0.06);border-radius:8px 8px 2px 8px;font-size:12px;color:var(--texto-pri);text-align:right;"><strong style="color:#f59e0b;">Duda:</strong>${esc(linha.replace('Duda:', ''))}</div>`;
      return linha.trim() ? `<div style="font-size:11px;color:var(--texto-sec);margin:2px 0;">${esc(linha)}</div>` : '';
    }).join('');
    conversaHtml = `<div style="max-height:200px;overflow-y:auto;padding:8px;background:var(--card);border:1px solid var(--borda);border-radius:10px;">${linhas}</div>`;
  }

  // Montar modal
  const overlay = document.createElement('div');
  overlay.id = 'modal-lead-v2';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;padding:12px;backdrop-filter:blur(4px);';
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };

  overlay.innerHTML = `<div style="background:var(--surface);border:1px solid var(--borda);border-radius:16px;max-width:640px;width:100%;max-height:90vh;overflow-y:auto;display:flex;flex-direction:column;">
    <!-- Header -->
    <div style="padding:20px 20px 0;flex-shrink:0;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;">
        <div>
          ${isNovo
            ? '<span style="font-size:18px;font-weight:700;color:var(--texto-pri);">Novo Lead</span>'
            : `<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                <span style="font-size:18px;font-weight:700;color:var(--texto-pri);">${esc(lead.nome || 'Sem nome')}</span>
                <span style="font-size:10px;font-weight:700;padding:3px 10px;border-radius:6px;background:${cfg.bg};color:${cfg.cor};border:1px solid ${cfg.cor}30;">
                  <span class="material-symbols-outlined" style="font-size:12px;vertical-align:middle;">${cfg.icon}</span> ${cfg.lb.toUpperCase()}
                </span>
                ${lead.observacoes ? '<span style="font-size:9px;padding:2px 6px;border-radius:4px;background:rgba(59,130,246,0.1);color:#60a5fa;font-weight:700;">Origem: Chatbot Telegram</span>' : ''}
              </div>
              ${lead.telefone ? `<a href="https://wa.me/55${lead.telefone.replace(/\\D/g, '')}" target="_blank" style="color:#2D6A4F;text-decoration:none;font-size:14px;font-family:'Space Grotesk',monospace;display:inline-flex;align-items:center;gap:4px;">
                <span class="material-symbols-outlined" style="font-size:14px;">chat</span> ${esc(lead.telefone)}
              </a>` : ''}`
          }
        </div>
        <button onclick="document.getElementById('modal-lead-v2').remove()" style="background:none;border:none;color:var(--texto-sec);cursor:pointer;padding:4px;">
          <span class="material-symbols-outlined" style="font-size:22px;">close</span>
        </button>
      </div>

      ${isNovo ? '' : `<!-- Abas -->
      <div style="display:flex;gap:0;border-bottom:1px solid var(--borda);">
        <button onclick="_leadsTab('visao')" id="lead-tab-visao" style="padding:8px 16px;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer;background:none;border:none;border-bottom:2px solid #2D6A4F;color:var(--texto-pri);display:flex;align-items:center;gap:4px;">
          <span class="material-symbols-outlined" style="font-size:14px;">info</span> Visao Geral
        </button>
        <button onclick="_leadsTab('hist')" id="lead-tab-hist" style="padding:8px 16px;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer;background:none;border:none;border-bottom:2px solid transparent;color:var(--texto-sec);display:flex;align-items:center;gap:4px;">
          <span class="material-symbols-outlined" style="font-size:14px;">history</span> Historico
        </button>
        <button onclick="_leadsTab('notas')" id="lead-tab-notas" style="padding:8px 16px;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer;background:none;border:none;border-bottom:2px solid transparent;color:var(--texto-sec);display:flex;align-items:center;gap:4px;">
          <span class="material-symbols-outlined" style="font-size:14px;">sticky_note_2</span> Notas
        </button>
        ${lead.observacoes ? `<button onclick="_leadsTab('chat')" id="lead-tab-chat" style="padding:8px 16px;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer;background:none;border:none;border-bottom:2px solid transparent;color:var(--texto-sec);display:flex;align-items:center;gap:4px;">
          <span class="material-symbols-outlined" style="font-size:14px;">smart_toy</span> Conversa
        </button>` : ''}
      </div>`}
    </div>

    ${isNovo ? _leadsBuildFormNovo() : `
    <!-- ABA VISAO GERAL -->
    <div id="lead-pane-visao" style="padding:16px 20px 20px;flex:1;overflow-y:auto;">
      <!-- Dados -->
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px;margin-bottom:16px;">
        ${_leadsInfoChip('Faixa', lead.faixa, 'real_estate_agent')}
        ${_leadsInfoChip('Renda', lead.renda ? 'R$ ' + Number(lead.renda).toLocaleString('pt-BR') : '', 'payments')}
        ${_leadsInfoChip('Modelo', lead.modelo_escolhido, 'home')}
        ${_leadsInfoChip('Terreno', lead.tem_terreno === true ? 'Sim' : lead.tem_terreno === false ? 'Nao' : '', 'landscape')}
        ${_leadsInfoChip('FGTS', lead.tem_fgts === true ? 'Sim' : lead.tem_fgts === false ? 'Nao' : '', 'account_balance')}
        ${_leadsInfoChip('Origem', lead.origem, 'ads_click')}
        ${_leadsInfoChip('Valor Est.', lead.valor_estimado ? 'R$ ' + Number(lead.valor_estimado).toLocaleString('pt-BR', {minimumFractionDigits:0}) : '', 'attach_money')}
        ${_leadsInfoChip('Responsável', lead.responsavel, 'person')}
      </div>

      <!-- Proxima acao -->
      <div style="background:var(--card);border:1px solid var(--borda);border-radius:10px;padding:12px;margin-bottom:12px;">
        <div style="font-size:11px;font-weight:700;color:var(--texto-sec);margin-bottom:8px;letter-spacing:.5px;display:flex;align-items:center;gap:4px;">
          <span class="material-symbols-outlined" style="font-size:14px;">schedule</span> PROXIMA ACAO
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <select id="lead-tipo-acao" style="flex:1;min-width:120px;padding:8px 10px;background:var(--input-bg);border:1px solid var(--borda);border-radius:8px;color:var(--texto-pri);font-size:12px;font-family:inherit;">
            <option value="">Selecionar...</option>
            ${acoesOpts}
          </select>
          <input type="date" id="lead-proxima-data" value="${esc(lead.proxima_data || '')}" style="padding:8px 10px;background:var(--input-bg);border:1px solid var(--borda);border-radius:8px;color:var(--texto-pri);font-size:12px;font-family:inherit;">
          <button onclick="_leadsSalvarAcao('${esc(lead.id)}')" style="padding:8px 14px;background:rgba(45,106,79,0.1);border:1px solid rgba(45,106,79,0.3);color:#2D6A4F;border-radius:8px;font-size:11px;font-weight:700;font-family:inherit;cursor:pointer;">SALVAR</button>
        </div>
      </div>

      <!-- Vincular obra -->
      ${lead.status !== 'convertido' ? `<div style="background:var(--card);border:1px solid var(--borda);border-radius:10px;padding:12px;margin-bottom:16px;">
        <div style="font-size:11px;font-weight:700;color:var(--texto-sec);margin-bottom:8px;letter-spacing:.5px;display:flex;align-items:center;gap:4px;">
          <span class="material-symbols-outlined" style="font-size:14px;">engineering</span> VINCULAR A OBRA
        </div>
        <div id="lead-obra-ac-wrap" style="position:relative;"></div>
      </div>` : `<div style="background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.15);border-radius:10px;padding:12px;margin-bottom:16px;font-size:12px;color:#f59e0b;display:flex;align-items:center;gap:6px;">
        <span class="material-symbols-outlined" style="font-size:16px;">handshake</span> Lead convertido${lead.obra_id ? ' — vinculado a uma obra' : ''}
      </div>`}

      <!-- Mudar status -->
      <div style="background:var(--card);border:1px solid var(--borda);border-radius:10px;padding:12px;margin-bottom:16px;">
        <div style="font-size:11px;font-weight:700;color:var(--texto-sec);margin-bottom:8px;letter-spacing:.5px;display:flex;align-items:center;gap:4px;">
          <span class="material-symbols-outlined" style="font-size:14px;">swap_horiz</span> ALTERAR STATUS
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          ${LEAD_STATUS_ORDEM.filter(s => s !== lead.status).map(s => {
            const sc = LEAD_STATUS[s];
            return `<button onclick="_leadsAlterarStatus('${esc(lead.id)}','${s}')" style="padding:7px 12px;border-radius:8px;border:1px solid ${sc.cor}30;background:${sc.bg};color:${sc.cor};font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;display:flex;align-items:center;gap:4px;">
              <span class="material-symbols-outlined" style="font-size:14px;">${sc.icon}</span> ${sc.lb}
            </button>`;
          }).join('')}
        </div>
      </div>

      <!-- Botoes -->
      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button onclick="_leadsExcluir('${esc(lead.id)}')" style="padding:8px 14px;background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.2);color:#ef4444;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;display:flex;align-items:center;gap:4px;">
          <span class="material-symbols-outlined" style="font-size:14px;">delete</span> Excluir
        </button>
      </div>
    </div>

    <!-- ABA HISTORICO -->
    <div id="lead-pane-hist" style="padding:16px 20px 20px;flex:1;overflow-y:auto;display:none;">
      ${hist.length ? hist.map(h => {
        const ico = h.tipo === 'status' ? 'sync' : h.tipo === 'nota' ? 'edit_note' : h.tipo === 'acao' ? 'schedule' : 'info';
        const dt = h.criado_em ? new Date(h.criado_em).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : '';
        return `<div style="display:flex;gap:10px;padding:10px 0;border-bottom:1px solid var(--borda);">
          <span class="material-symbols-outlined" style="font-size:18px;color:var(--texto-sec);">${ico}</span>
          <div style="flex:1;min-width:0;">
            <div style="font-size:12px;color:var(--texto-sec);word-break:break-word;">${esc(h.conteudo || '')}</div>
            <div style="font-size:10px;color:var(--text-tertiary);margin-top:2px;">${dt}${h.usuario ? ' · ' + esc(h.usuario) : ''}</div>
          </div>
        </div>`;
      }).join('') : `<div style="text-align:center;padding:24px;color:var(--texto-sec);">
        <span class="material-symbols-outlined" style="font-size:32px;opacity:0.3;">history</span>
        <div style="font-size:12px;margin-top:6px;">Nenhum evento registrado.</div>
      </div>`}
    </div>

    <!-- ABA NOTAS -->
    <div id="lead-pane-notas" style="padding:16px 20px 20px;flex:1;overflow-y:auto;display:none;">
      <div style="margin-bottom:12px;">
        <textarea id="lead-nota-text" placeholder="Escrever anotacao..." style="width:100%;min-height:70px;padding:10px;background:var(--input-bg);border:1px solid var(--borda);border-radius:8px;color:var(--texto-pri);font-size:12px;font-family:inherit;resize:vertical;box-sizing:border-box;"></textarea>
        <button onclick="_leadsAdicionarNota('${esc(lead.id)}')" style="margin-top:6px;padding:8px 16px;background:rgba(45,106,79,0.1);border:1px solid rgba(45,106,79,0.3);color:#2D6A4F;border-radius:8px;font-size:11px;font-weight:700;font-family:inherit;cursor:pointer;display:flex;align-items:center;gap:4px;">
          <span class="material-symbols-outlined" style="font-size:14px;">save</span> SALVAR NOTA
        </button>
      </div>
      <div style="font-size:11px;font-weight:700;color:var(--texto-sec);margin-bottom:8px;letter-spacing:.5px;">NOTAS ANTERIORES</div>
      ${notas.length ? notas.map(n => {
        const dt = n.criado_em ? new Date(n.criado_em).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : '';
        return `<div style="background:var(--card);border:1px solid var(--borda);border-radius:8px;padding:10px;margin-bottom:6px;">
          <div style="font-size:12px;color:var(--texto-sec);white-space:pre-wrap;word-break:break-word;">${esc(n.conteudo || '')}</div>
          <div style="font-size:10px;color:var(--text-tertiary);margin-top:4px;">${dt}${n.usuario ? ' · ' + esc(n.usuario) : ''}</div>
        </div>`;
      }).join('') : '<div style="color:var(--texto-sec);font-size:12px;">Nenhuma nota ainda.</div>'}
    </div>

    <!-- ABA CONVERSA (chatbot) -->
    ${lead.observacoes ? `<div id="lead-pane-chat" style="padding:16px 20px 20px;flex:1;overflow-y:auto;display:none;">
      <div style="font-size:11px;font-weight:700;color:var(--texto-sec);margin-bottom:8px;letter-spacing:.5px;display:flex;align-items:center;gap:4px;">
        <span class="material-symbols-outlined" style="font-size:14px;">smart_toy</span> CONVERSA VIA CHATBOT
      </div>
      ${conversaHtml}
    </div>` : ''}
    `}
  </div>`;

  document.body.appendChild(overlay);

  // ESC fecha
  const escH = e => { if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', escH); } };
  document.addEventListener('keydown', escH);
}

// ── Form Novo Lead ───────────────────────────────────────────

function _leadsBuildFormNovo() {
  return `<div style="padding:16px 20px 20px;">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;">
      <div>
        <label style="font-size:10px;font-weight:700;color:var(--texto-sec);display:block;margin-bottom:4px;">NOME *</label>
        <input id="lead-new-nome" type="text" placeholder="Nome do lead" style="width:100%;padding:8px 10px;background:var(--input-bg);border:1px solid var(--borda);border-radius:8px;color:var(--texto-pri);font-size:12px;font-family:inherit;box-sizing:border-box;">
      </div>
      <div>
        <label style="font-size:10px;font-weight:700;color:var(--texto-sec);display:block;margin-bottom:4px;">TELEFONE</label>
        <input id="lead-new-telefone" type="text" placeholder="(00) 0 0000-0000" style="width:100%;padding:8px 10px;background:var(--input-bg);border:1px solid var(--borda);border-radius:8px;color:var(--texto-pri);font-size:12px;font-family:inherit;box-sizing:border-box;">
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:12px;">
      <div>
        <label style="font-size:10px;font-weight:700;color:var(--texto-sec);display:block;margin-bottom:4px;">FAIXA</label>
        <select id="lead-new-faixa" style="width:100%;padding:8px 10px;background:var(--input-bg);border:1px solid var(--borda);border-radius:8px;color:var(--texto-pri);font-size:12px;font-family:inherit;">
          <option value="">—</option>
          <option value="Faixa 1">Faixa 1</option>
          <option value="Faixa 2">Faixa 2</option>
          <option value="Faixa 3">Faixa 3</option>
        </select>
      </div>
      <div>
        <label style="font-size:10px;font-weight:700;color:var(--texto-sec);display:block;margin-bottom:4px;">RENDA</label>
        <input id="lead-new-renda" type="number" placeholder="0.00" style="width:100%;padding:8px 10px;background:var(--input-bg);border:1px solid var(--borda);border-radius:8px;color:var(--texto-pri);font-size:12px;font-family:inherit;box-sizing:border-box;">
      </div>
      <div>
        <label style="font-size:10px;font-weight:700;color:var(--texto-sec);display:block;margin-bottom:4px;">MODELO</label>
        <input id="lead-new-modelo" type="text" placeholder="Modelo da casa" style="width:100%;padding:8px 10px;background:var(--input-bg);border:1px solid var(--borda);border-radius:8px;color:var(--texto-pri);font-size:12px;font-family:inherit;box-sizing:border-box;">
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;">
      <div>
        <label style="font-size:10px;font-weight:700;color:var(--texto-sec);display:block;margin-bottom:4px;">TEM TERRENO?</label>
        <select id="lead-new-terreno" style="width:100%;padding:8px 10px;background:var(--input-bg);border:1px solid var(--borda);border-radius:8px;color:var(--texto-pri);font-size:12px;font-family:inherit;">
          <option value="">—</option><option value="true">Sim</option><option value="false">Nao</option>
        </select>
      </div>
      <div>
        <label style="font-size:10px;font-weight:700;color:var(--texto-sec);display:block;margin-bottom:4px;">TEM FGTS?</label>
        <select id="lead-new-fgts" style="width:100%;padding:8px 10px;background:var(--input-bg);border:1px solid var(--borda);border-radius:8px;color:var(--texto-pri);font-size:12px;font-family:inherit;">
          <option value="">—</option><option value="true">Sim</option><option value="false">Nao</option>
        </select>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:16px;">
      <div>
        <label style="font-size:10px;font-weight:700;color:var(--texto-sec);display:block;margin-bottom:4px;">ORIGEM</label>
        <select id="lead-new-origem" style="width:100%;padding:8px 10px;background:var(--input-bg);border:1px solid var(--borda);border-radius:8px;color:var(--texto-pri);font-size:12px;font-family:inherit;">
          <option value="">—</option>
          <option value="Instagram">Instagram</option>
          <option value="WhatsApp">WhatsApp</option>
          <option value="Indicacao">Indicação</option>
          <option value="Site">Site</option>
          <option value="Feirao">Feirão</option>
          <option value="Facebook">Facebook</option>
          <option value="Outro">Outro</option>
        </select>
      </div>
      <div>
        <label style="font-size:10px;font-weight:700;color:var(--texto-sec);display:block;margin-bottom:4px;">VALOR ESTIMADO</label>
        <input id="lead-new-valor" type="number" placeholder="0.00" style="width:100%;padding:8px 10px;background:var(--input-bg);border:1px solid var(--borda);border-radius:8px;color:var(--texto-pri);font-size:12px;font-family:inherit;box-sizing:border-box;">
      </div>
      <div>
        <label style="font-size:10px;font-weight:700;color:var(--texto-sec);display:block;margin-bottom:4px;">RESPONSÁVEL</label>
        <input id="lead-new-responsavel" type="text" placeholder="Nome do responsável" style="width:100%;padding:8px 10px;background:var(--input-bg);border:1px solid var(--borda);border-radius:8px;color:var(--texto-pri);font-size:12px;font-family:inherit;box-sizing:border-box;">
      </div>
    </div>
    <div style="display:flex;gap:8px;justify-content:flex-end;">
      <button onclick="document.getElementById('modal-lead-v2').remove()" style="padding:8px 16px;border-radius:8px;border:1px solid var(--borda);background:transparent;color:var(--texto-sec);font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;">Cancelar</button>
      <button onclick="_leadsCriar()" style="padding:8px 16px;border-radius:8px;border:1px solid rgba(45,106,79,0.4);background:rgba(45,106,79,0.1);color:#2D6A4F;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;display:flex;align-items:center;gap:4px;">
        <span class="material-symbols-outlined" style="font-size:14px;">person_add</span> Criar Lead
      </button>
    </div>
  </div>`;
}

// ── Helpers UI ────────────────────────────────────────────────

function _leadsInfoChip(label, valor, icon) {
  if (!valor) return '';
  return `<div style="background:var(--card);border:1px solid var(--borda);border-radius:8px;padding:8px 10px;">
    <div style="font-size:9px;color:var(--text-tertiary);font-weight:700;letter-spacing:.5px;margin-bottom:2px;display:flex;align-items:center;gap:3px;">
      <span class="material-symbols-outlined" style="font-size:11px;">${icon}</span> ${esc(label)}
    </div>
    <div style="font-size:13px;color:var(--texto-pri);font-weight:600;">${esc(String(valor))}</div>
  </div>`;
}

function _leadsTab(tab) {
  const tabs = ['visao', 'hist', 'notas', 'chat'];
  tabs.forEach(t => {
    const btn = document.getElementById('lead-tab-' + t);
    const pane = document.getElementById('lead-pane-' + t);
    if (btn) {
      btn.style.borderBottomColor = t === tab ? '#2D6A4F' : 'transparent';
      btn.style.color = t === tab ? 'var(--texto-pri)' : 'var(--texto-sec)';
    }
    if (pane) pane.style.display = t === tab ? 'block' : 'none';
  });
  LeadsModule._tabAtiva = tab;
}

function _leadsFecharModal() {
  const m = document.getElementById('modal-lead-v2');
  if (m) m.remove();
  LeadsModule._leadAberto = null;
}

function _leadsBindAutocomplete() {
  // Autocomplete pra vincular obra no modal (se existir)
  const wrap = document.getElementById('lead-obra-ac-wrap');
  if (!wrap || typeof obras === 'undefined') return;

  const obraAtual = LeadsModule._leadAberto
    ? LeadsModule.data.find(l => l.id === LeadsModule._leadAberto)
    : null;
  const obraAtualNome = obraAtual?.obra_id
    ? (obras.find(o => o.id === obraAtual.obra_id)?.nome || '')
    : '';

  wrap.innerHTML = `<input id="lead-obra-input" type="text" value="${esc(obraAtualNome)}" placeholder="Buscar obra..." autocomplete="off"
    style="width:100%;padding:8px 10px;background:var(--input-bg);border:1px solid var(--borda);border-radius:8px;color:var(--texto-pri);font-size:12px;font-family:inherit;box-sizing:border-box;">
    <input id="lead-obra-id" type="hidden" value="${esc(obraAtual?.obra_id || '')}">
    <div id="lead-obra-dropdown" style="position:absolute;top:100%;left:0;right:0;background:var(--surface);border:1px solid var(--borda);border-radius:8px;max-height:180px;overflow-y:auto;display:none;z-index:10;margin-top:2px;"></div>`;

  const input = document.getElementById('lead-obra-input');
  const dd = document.getElementById('lead-obra-dropdown');
  const hiddenId = document.getElementById('lead-obra-id');

  input.addEventListener('input', () => {
    const q = input.value.toLowerCase().trim();
    if (!q) { dd.style.display = 'none'; return; }
    const matches = obras.filter(o => o.nome.toLowerCase().includes(q)).slice(0, 10);
    if (!matches.length) { dd.style.display = 'none'; return; }
    dd.innerHTML = matches.map(o =>
      `<div onclick="document.getElementById('lead-obra-input').value='${esc(o.nome)}';document.getElementById('lead-obra-id').value='${esc(o.id)}';document.getElementById('lead-obra-dropdown').style.display='none';"
        style="padding:8px 10px;font-size:12px;cursor:pointer;border-bottom:1px solid var(--borda);"
        onmouseenter="this.style.background='rgba(45,106,79,0.08)'" onmouseleave="this.style.background='transparent'">
        ${esc(o.nome)}
      </div>`
    ).join('');
    dd.style.display = 'block';
  });

  input.addEventListener('blur', () => { setTimeout(() => { dd.style.display = 'none'; }, 200); });
}

// ── Acoes CRUD ───────────────────────────────────────────────

async function _leadsCriar() {
  const nome = (document.getElementById('lead-new-nome')?.value || '').trim();
  if (!nome) { showToast('Informe o nome do lead.'); return; }

  const payload = {
    nome,
    telefone: (document.getElementById('lead-new-telefone')?.value || '').trim() || null,
    faixa: document.getElementById('lead-new-faixa')?.value || null,
    renda: parseFloat(document.getElementById('lead-new-renda')?.value) || null,
    modelo_escolhido: (document.getElementById('lead-new-modelo')?.value || '').trim() || null,
    tem_terreno: _leadsBool('lead-new-terreno'),
    tem_fgts: _leadsBool('lead-new-fgts'),
    origem: document.getElementById('lead-new-origem')?.value || null,
    valor_estimado: parseFloat(document.getElementById('lead-new-valor')?.value) || null,
    responsavel: (document.getElementById('lead-new-responsavel')?.value || '').trim() || null,
    status: 'novo',
  };

  try {
    const novo = await sbPost('leads', payload);
    LeadsModule.data.unshift(novo);
    showToast('Lead criado.');
    _leadsFecharModal();
    renderLeads();
  } catch (e) { showToast('Erro ao criar lead.'); }
}

function _leadsBool(elId) {
  const v = document.getElementById(elId)?.value;
  if (v === 'true') return true;
  if (v === 'false') return false;
  return null;
}

async function _leadsSalvarAcao(leadId) {
  const tipo = document.getElementById('lead-tipo-acao')?.value || '';
  const data = document.getElementById('lead-proxima-data')?.value || '';
  if (!tipo) { showToast('Selecione o tipo de acao.'); return; }

  try {
    await sbPatch('leads', `?id=eq.${leadId}`, {
      tipo_acao: tipo,
      proxima_data: data || null,
      atualizado_em: new Date().toISOString(),
    });
    const acao = LEAD_ACOES[tipo] || LEAD_ACOES.outro;
    await sbPost('lead_historico', {
      lead_id: leadId,
      tipo: 'acao',
      conteudo: `Proxima acao definida: ${acao.lb}${data ? ' em ' + fmtData(data) : ''}`,
      usuario: typeof usuarioAtual !== 'undefined' && usuarioAtual?.nome ? usuarioAtual.nome : '',
    });
    const lead = LeadsModule.data.find(l => l.id === leadId);
    if (lead) { lead.tipo_acao = tipo; lead.proxima_data = data || null; }
    await _leadsLoadHistorico();
    showToast('Proxima acao salva.');
    _leadsFecharModal();
    renderLeads();
  } catch (e) { showToast('Erro ao salvar acao.'); }
}

async function _leadsAdicionarNota(leadId) {
  const textarea = document.getElementById('lead-nota-text');
  const texto = textarea?.value?.trim();
  if (!texto) { showToast('Escreva algo antes de salvar.'); return; }

  try {
    await sbPost('lead_historico', {
      lead_id: leadId,
      tipo: 'nota',
      conteudo: texto,
      usuario: typeof usuarioAtual !== 'undefined' && usuarioAtual?.nome ? usuarioAtual.nome : '',
    });
    showToast('Nota adicionada.');
    await _leadsLoadHistorico();
    _leadsFecharModal();
    _leadsAbrirModal(leadId);
    setTimeout(() => _leadsTab('notas'), 50);
  } catch (e) { showToast('Erro ao salvar nota.'); }
}

async function _leadsAlterarStatus(leadId, novoStatus) {
  if (novoStatus === 'convertido') {
    // Pegar obra vinculada se houver
    const obraId = document.getElementById('lead-obra-id')?.value || null;
    const lead = LeadsModule.data.find(l => l.id === leadId);
    const nome = lead?.nome || 'este lead';

    const ok = await confirmar(`Converter "${nome}" para CONVERTIDO?${obraId ? '\n\nSera vinculado a obra selecionada.' : ''}`);
    if (!ok) return;

    try {
      const patch = { status: 'convertido', atualizado_em: new Date().toISOString() };
      if (obraId) patch.obra_id = obraId;
      await sbPatch('leads', `?id=eq.${leadId}`, patch);
      await sbPost('lead_historico', {
        lead_id: leadId,
        tipo: 'status',
        conteudo: `Status alterado para CONVERTIDO${obraId ? ' (vinculado a obra)' : ''}`,
        usuario: typeof usuarioAtual !== 'undefined' && usuarioAtual?.nome ? usuarioAtual.nome : '',
      });
      if (lead) { lead.status = 'convertido'; if (obraId) lead.obra_id = obraId; }
      await _leadsLoadHistorico();
      showToast('Lead convertido!');
      _leadsFecharModal();
      renderLeads();
    } catch (e) { showToast('Erro ao converter lead.'); }
    return;
  }

  try {
    await sbPatch('leads', `?id=eq.${leadId}`, {
      status: novoStatus,
      atualizado_em: new Date().toISOString(),
    });
    const statusLabel = LEAD_STATUS[novoStatus]?.lb || novoStatus;
    await sbPost('lead_historico', {
      lead_id: leadId,
      tipo: 'status',
      conteudo: `Status alterado para ${statusLabel}`,
      usuario: typeof usuarioAtual !== 'undefined' && usuarioAtual?.nome ? usuarioAtual.nome : '',
    }).catch(() => {});

    const lead = LeadsModule.data.find(l => l.id === leadId);
    if (lead) lead.status = novoStatus;
    await _leadsLoadHistorico();

    const labels = { contatado: 'Lead contatado!', convertido: 'Lead convertido!', descartado: 'Lead descartado.', novo: 'Lead reaberto.' };
    showToast(labels[novoStatus] || 'Status atualizado.');
    _leadsFecharModal();
    renderLeads();
  } catch (e) { showToast('Erro ao atualizar status.'); }
}

async function _leadsExcluir(leadId) {
  const ok = await confirmar('Excluir este lead e todo o historico de interacoes?');
  if (!ok) return;
  try {
    await sbDelete('lead_historico', '?lead_id=eq.' + leadId);
    await sbDelete('leads', '?id=eq.' + leadId);
    LeadsModule.data = LeadsModule.data.filter(l => l.id !== leadId);
    _leadsFecharModal();
    renderLeads();
    showToast('Lead excluido.');
  } catch (e) { showToast('Erro ao excluir lead.'); }
}

// ── Registry ─────────────────────────────────────────────────

viewRegistry.register('leads', () => { renderLeads(); });
