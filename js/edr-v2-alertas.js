// ══════════════════════════════════════════════════════════════════
// EDR System V2 — Módulo: ALERTAS
// Calcula alertas proativos a partir dos dados carregados
// Dispara após iniciarApp() em _entrarNoApp()
// ══════════════════════════════════════════════════════════════════

const AlertasModule = {
  _alertas: [],
  _panelAberto: false,

  // ─────────────────────────────────────────────────────────────────
  // CALCULAR (chamado após iniciarApp)
  // ─────────────────────────────────────────────────────────────────
  async calcular() {
    const alertas = [];
    const hoje = hojeISO();
    const em7  = _somarDias(hoje, 7);
    const ha15 = _somarDias(hoje, -15);
    const ha30 = _somarDias(hoje, -30);

    try { await Promise.all([
      _alertCaixa(alertas, hoje),
      _alertContasPagar(alertas, hoje, em7),
      _alertLeadsParados(alertas, ha15),
      _alertCronogramaAtrasado(alertas, hoje),
    ]); } catch(e) { console.warn('[ALERTAS] erro:', e); }

    // Obras sem lançamento — usa dados em memória (carregados no boot)
    _alertObrasSemLancamento(alertas, ha30);

    this._alertas = alertas;
    this._atualizarBadge();
  },

  // ─────────────────────────────────────────────────────────────────
  // BADGE
  // ─────────────────────────────────────────────────────────────────
  _atualizarBadge() {
    const badge = document.getElementById('notif-badge');
    if (!badge) return;
    const n = this._alertas.length;
    if (n > 0) {
      badge.textContent = n > 9 ? '9+' : String(n);
      badge.classList.remove('hidden');
    } else {
      badge.textContent = '0';
      badge.classList.add('hidden');
    }
  },

  // ─────────────────────────────────────────────────────────────────
  // PAINEL
  // ─────────────────────────────────────────────────────────────────
  togglePanel() {
    const panel = document.getElementById('notif-panel');
    if (!panel) return;
    if (this._panelAberto) {
      this._fecharPanel();
    } else {
      this._abrirPanel();
    }
  },

  _abrirPanel() {
    const panel = document.getElementById('notif-panel');
    if (!panel) return;
    this._renderPanel(panel);
    panel.style.display = 'block';
    this._panelAberto = true;
    // fechar ao clicar fora — remove primeiro pra nunca duplicar listener
    setTimeout(() => {
      document.removeEventListener('mousedown', AlertasModule._clickFora);
      document.addEventListener('mousedown', AlertasModule._clickFora);
    }, 0);
  },

  _fecharPanel() {
    const panel = document.getElementById('notif-panel');
    if (panel) panel.style.display = 'none';
    this._panelAberto = false;
    document.removeEventListener('mousedown', AlertasModule._clickFora);
  },

  _clickFora(e) {
    const panel = document.getElementById('notif-panel');
    const btn   = document.getElementById('btn-notifications');
    if (panel && !panel.contains(e.target) && btn && !btn.contains(e.target)) {
      AlertasModule._fecharPanel();
    }
  },

  _renderPanel(panel) {
    const alertas = this._alertas;
    const iconeCor = { danger: '#ef4444', warning: '#f59e0b', info: '#3b82f6', success: '#22c55e' };
    const bgCor    = { danger: 'rgba(239,68,68,.07)', warning: 'rgba(245,158,11,.07)', info: 'rgba(59,130,246,.07)', success: 'rgba(34,197,94,.07)' };

    if (!alertas.length) {
      panel.innerHTML = `
        <div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:12px;font-weight:700;color:var(--text-primary);letter-spacing:1px;">ALERTAS</span>
          <button onclick="AlertasModule._fecharPanel()" style="background:none;border:none;cursor:pointer;color:var(--text-tertiary);line-height:1;"><span class="material-symbols-outlined" style="font-size:18px;">close</span></button>
        </div>
        <div style="padding:32px 20px;text-align:center;color:var(--text-tertiary);">
          <span class="material-symbols-outlined" style="font-size:36px;display:block;margin-bottom:8px;color:var(--success);">check_circle</span>
          <div style="font-size:13px;font-weight:600;">Tudo em ordem!</div>
          <div style="font-size:11px;margin-top:4px;">Nenhum alerta no momento.</div>
        </div>`;
      return;
    }

    const items = alertas.map(a => `
      <div onclick="AlertasModule._clickAlerta('${a.view || ''}')"
           style="padding:12px 16px;border-radius:10px;background:${bgCor[a.tipo] || bgCor.info};cursor:${a.view ? 'pointer' : 'default'};display:flex;gap:12px;align-items:flex-start;">
        <span class="material-symbols-outlined" style="font-size:20px;color:${iconeCor[a.tipo]};flex-shrink:0;margin-top:1px;">${a.icone}</span>
        <div style="flex:1;min-width:0;">
          <div style="font-size:12px;font-weight:700;color:var(--text-primary);">${a.titulo}</div>
          <div style="font-size:11px;color:var(--text-secondary);margin-top:2px;">${a.msg}</div>
        </div>
        ${a.view ? `<span class="material-symbols-outlined" style="font-size:14px;color:var(--text-tertiary);flex-shrink:0;margin-top:3px;">chevron_right</span>` : ''}
      </div>`).join('');

    panel.innerHTML = `
      <div style="padding:14px 16px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;">
        <span style="font-size:12px;font-weight:700;color:var(--text-primary);letter-spacing:1px;">ALERTAS <span style="background:var(--error);color:#fff;font-size:10px;padding:1px 6px;border-radius:10px;margin-left:4px;">${alertas.length}</span></span>
        <div style="display:flex;gap:8px;align-items:center;">
          <button onclick="AlertasModule.atualizar()" title="Atualizar" style="background:none;border:none;cursor:pointer;color:var(--text-tertiary);line-height:1;"><span class="material-symbols-outlined" style="font-size:16px;">refresh</span></button>
          <button onclick="AlertasModule._fecharPanel()" style="background:none;border:none;cursor:pointer;color:var(--text-tertiary);line-height:1;"><span class="material-symbols-outlined" style="font-size:18px;">close</span></button>
        </div>
      </div>
      <div style="padding:10px;display:flex;flex-direction:column;gap:6px;max-height:380px;overflow-y:auto;">${items}</div>`;
  },

  _clickAlerta(view) {
    if (view && typeof setView === 'function') setView(view);
    this._fecharPanel();
  },

  async atualizar() {
    await this.calcular();
    const panel = document.getElementById('notif-panel');
    if (panel && this._panelAberto) this._renderPanel(panel);
  }
};

// ─────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────
function _somarDias(isoDate, dias) {
  const d = new Date(isoDate + 'T00:00:00');
  d.setDate(d.getDate() + dias);
  return d.toISOString().substring(0, 10);
}

// ─────────────────────────────────────────────────────────────────
// 1. CAIXA NEGATIVO
// ─────────────────────────────────────────────────────────────────
async function _alertCaixa(alertas, hoje) {
  try {
    const entRepasses   = (Array.isArray(repassesCef) ? repassesCef : []).reduce((s, r) => s + Number(r.valor || 0), 0);
    const entAdicionais = (Array.isArray(adicionaisPgtos) ? adicionaisPgtos : []).reduce((s, p) => s + Number(p.valor || 0), 0);
    const saidas        = (Array.isArray(lancamentos) ? lancamentos : []).reduce((s, l) => s + Number(l.total || 0), 0);
    // contas pagas sem obra (admin expenses)
    let contasPagas = 0;
    try {
      const cp = await sbGet('contas_pagar', '?status=eq.pago&obra_id=is.null&select=valor');
      contasPagas = Array.isArray(cp) ? cp.reduce((s, c) => s + Number(c.valor || 0), 0) : 0;
    } catch(e) {}
    // saldo inicial configurado
    let saldoInicial = 0;
    try {
      const sc = await sbGet('companies', '?id=eq.' + _companyId + '&select=saldo_manual');
      if (sc && sc[0] && sc[0].saldo_manual !== null && sc[0].saldo_manual !== undefined) {
        saldoInicial = Number(sc[0].saldo_manual);
      }
    } catch(e) {}
    const saldo = saldoInicial + entRepasses + entAdicionais - saidas - contasPagas;
    if (saldo < 0) {
      alertas.push({
        tipo: 'danger',
        icone: 'account_balance_wallet',
        titulo: 'Fluxo de Caixa Negativo',
        msg: `Saldo atual: ${fmtR(saldo)}. Revise entradas e saidas.`,
        view: 'caixa'
      });
    }
  } catch(e) { console.warn('[ALERTAS] _alertCaixa:', e); }
}

// ─────────────────────────────────────────────────────────────────
// 2. CONTAS A PAGAR
// ─────────────────────────────────────────────────────────────────
async function _alertContasPagar(alertas, hoje, em7) {
  try {
    const contas = await sbGet('contas_pagar', `?status=eq.pendente&select=valor,data_vencimento,descricao`);
    if (!Array.isArray(contas)) return;
    const vencidas  = contas.filter(c => c.data_vencimento < hoje);
    const vencendo  = contas.filter(c => c.data_vencimento >= hoje && c.data_vencimento <= em7);
    if (vencidas.length) {
      const total = vencidas.reduce((s, c) => s + Number(c.valor || 0), 0);
      alertas.push({
        tipo: 'danger',
        icone: 'receipt_long',
        titulo: `${vencidas.length} conta${vencidas.length > 1 ? 's' : ''} vencida${vencidas.length > 1 ? 's' : ''}`,
        msg: `Total em aberto: ${fmtR(total)}`,
        view: 'contas-pagar'
      });
    }
    if (vencendo.length) {
      const total = vencendo.reduce((s, c) => s + Number(c.valor || 0), 0);
      alertas.push({
        tipo: 'warning',
        icone: 'schedule',
        titulo: `${vencendo.length} conta${vencendo.length > 1 ? 's' : ''} vencem nos proximos 7 dias`,
        msg: `Total: ${fmtR(total)}`,
        view: 'contas-pagar'
      });
    }
  } catch(e) { console.warn('[ALERTAS] _alertContasPagar:', e); }
}

// ─────────────────────────────────────────────────────────────────
// 3. LEADS PARADOS (>15 dias sem atualização, não encerrados)
// ─────────────────────────────────────────────────────────────────
async function _alertLeadsParados(alertas, ha15) {
  try {
    const r = await sbGet('leads', `?status=not.in.(ganho,perdido,convertido)&atualizado_em=lte.${ha15}T23:59:59&select=id,nome,status`);
    if (!Array.isArray(r) || !r.length) return;
    alertas.push({
      tipo: 'warning',
      icone: 'person_search',
      titulo: `${r.length} lead${r.length > 1 ? 's' : ''} parado${r.length > 1 ? 's' : ''} ha mais de 15 dias`,
      msg: r.slice(0, 3).map(l => l.nome).join(', ') + (r.length > 3 ? ` e mais ${r.length - 3}` : ''),
      view: 'leads'
    });
  } catch(e) { console.warn('[ALERTAS] _alertLeadsParados:', e); }
}

// ─────────────────────────────────────────────────────────────────
// 4. OBRAS SEM LANÇAMENTO (>30 dias) — usa memória (boot)
// ─────────────────────────────────────────────────────────────────
function _alertObrasSemLancamento(alertas, ha30) {
  try {
    const obrasAtivas = (Array.isArray(obras) ? obras : []).filter(o => !o.arquivada);
    const lancs = Array.isArray(lancamentos) ? lancamentos : [];
    const semMovimento = obrasAtivas.filter(o => {
      const ll = lancs.filter(l => l.obra_id === o.id);
      if (!ll.length) return true; // nunca teve lançamento
      const ultimo = ll.reduce((max, l) => (l.data || '') > (max.data || '') ? l : max, ll[0]);
      return (ultimo.data || '') < ha30;
    });
    if (semMovimento.length) {
      alertas.push({
        tipo: 'warning',
        icone: 'construction',
        titulo: `${semMovimento.length} obra${semMovimento.length > 1 ? 's' : ''} sem lancamento ha mais de 30 dias`,
        msg: semMovimento.slice(0, 3).map(o => o.nome).join(', ') + (semMovimento.length > 3 ? ` e mais ${semMovimento.length - 3}` : ''),
        view: 'obras'
      });
    }
  } catch(e) { console.warn('[ALERTAS] _alertObrasSemLancamento:', e); }
}

// ─────────────────────────────────────────────────────────────────
// 5. CRONOGRAMA ATRASADO
// ─────────────────────────────────────────────────────────────────
async function _alertCronogramaAtrasado(alertas, hoje) {
  try {
    const r = await sbGet('cronograma_tarefas', `?data_fim=lt.${hoje}&progresso=lt.100&select=id,nome,obra_id`);
    if (!Array.isArray(r) || !r.length) return;
    // Agrupar por obra
    const obraMap = {};
    (Array.isArray(obras) ? obras : []).forEach(o => { obraMap[o.id] = o.nome; });
    const obrasAtrasadas = [...new Set(r.map(t => t.obra_id))].length;
    alertas.push({
      tipo: 'danger',
      icone: 'event_busy',
      titulo: `${r.length} etapa${r.length > 1 ? 's' : ''} do cronograma atrasada${r.length > 1 ? 's' : ''}`,
      msg: `Em ${obrasAtrasadas} obra${obrasAtrasadas > 1 ? 's' : ''}: ${r.slice(0, 2).map(t => t.nome).join(', ')}${r.length > 2 ? ` e mais ${r.length - 2}` : ''}`,
      view: 'cronograma'
    });
  } catch(e) { console.warn('[ALERTAS] _alertCronogramaAtrasado:', e); }
}
