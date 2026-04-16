// ══════════════════════════════════════════════════════════════
// EDR V2 — Adicionais (Sub-modulo de Obras)
// AdicionaisModule encapsulado, tab dentro de Detalhes da Obra
// confirmar() em vez de confirm(), Material Symbols, modais via JS
// valorPorExtenso() referenciado de utils.js
// ══════════════════════════════════════════════════════════════

// Garantia: esc() nunca cai no fallback sem sanitização
if (typeof esc !== 'function') {
  var esc = s => (s == null ? '' : String(s)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

const AdicionaisModule = {

  // ── Estado encapsulado ──────────────────────────────────
  adicionais: [],
  pagamentos: [],
  _loaded: false,

  // ── Constantes ──────────────────────────────────────────
  STATUS: {
    pendente:      { label: 'Pendente',       cor: '#B7791F', icon: 'schedule' },
    aprovado:      { label: 'Aprovado',       cor: '#2563eb', icon: 'check_circle' },
    em_andamento:  { label: 'Em andamento',   cor: '#ea580c', icon: 'engineering' },
    concluido:     { label: 'Concluido',      cor: '#2D6A4F', icon: 'task_alt' }
  },

  // ══════════════════════════════════════════════════════════
  // CONSULTAS
  // ══════════════════════════════════════════════════════════

  getAdicionaisObra(obraId) {
    const lista = this.adicionais.filter(a => a.obra_id === obraId);
    const valorTotal = lista.reduce((s, a) => s + Number(a.valor || 0), 0);
    const pgtos = this.pagamentos.filter(p => lista.some(a => a.id === p.adicional_id));
    const totalRecebido = pgtos.reduce((s, p) => s + Number(p.valor || 0), 0);
    return { lista, valorTotal, totalRecebido, saldo: valorTotal - totalRecebido };
  },

  getAdicionaisGeral(obraIds) {
    const set = obraIds instanceof Set ? obraIds : new Set(obraIds);
    const lista = this.adicionais.filter(a => set.has(a.obra_id));
    const valorTotal = lista.reduce((s, a) => s + Number(a.valor || 0), 0);
    const pgtos = this.pagamentos.filter(p => lista.some(a => a.id === p.adicional_id));
    const totalRecebido = pgtos.reduce((s, p) => s + Number(p.valor || 0), 0);
    return { lista, valorTotal, totalRecebido, saldo: valorTotal - totalRecebido };
  },

  // ══════════════════════════════════════════════════════════
  // LOAD
  // ══════════════════════════════════════════════════════════

  async load() {
    try {
      const r = await sbGet('obra_adicionais', '?order=criado_em.desc');
      this.adicionais = Array.isArray(r) ? r : [];
    } catch (e) { this.adicionais = []; }
    try {
      const r = await sbGet('adicional_pagamentos', '?order=data.desc');
      this.pagamentos = Array.isArray(r) ? r : [];
    } catch (e) { this.pagamentos = []; }
    this._loaded = true;
  },

  // ══════════════════════════════════════════════════════════
  // RENDER — Tab dentro de Detalhes da Obra
  // ══════════════════════════════════════════════════════════

  render(obraId, container) {
    if (!obraId || !container) return;
    if (!this._loaded) {
      this.load().then(() => this.render(obraId, container));
      return;
    }

    const lista = this.adicionais.filter(a => a.obra_id === obraId);
    const todasObras = [
      ...(typeof obras !== 'undefined' ? obras : []),
      ...(typeof obrasArquivadas !== 'undefined' ? obrasArquivadas : [])
    ];
    const obra = todasObras.find(o => o.id === obraId);

    // Stats
    const totalValor = lista.reduce((s, a) => s + Number(a.valor || 0), 0);
    const totalPago = this.pagamentos
      .filter(p => lista.some(a => a.id === p.adicional_id))
      .reduce((s, p) => s + Number(p.valor || 0), 0);
    const saldo = totalValor - totalPago;

    let html = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <h4 style="margin:0;font-size:14px;color:var(--texto1);">
          <span class="material-symbols-outlined" style="font-size:18px;vertical-align:middle;margin-right:4px;">construction</span>
          Servicos Adicionais
        </h4>
        <button onclick="AdicionaisModule.abrirModal('${obraId}')" class="btn btn-primary btn-sm">
          <span class="material-symbols-outlined" style="font-size:16px;vertical-align:middle;margin-right:2px;">add</span>Novo Adicional
        </button>
      </div>

      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px;">
        <div class="stat-mini">
          <div class="stat-mini-label">Valor Total</div>
          <div class="stat-mini-value" style="color:var(--texto1);">${this._fmtR(totalValor)}</div>
        </div>
        <div class="stat-mini">
          <div class="stat-mini-label">Pago</div>
          <div class="stat-mini-value" style="color:var(--verde-hl);">${this._fmtR(totalPago)}</div>
        </div>
        <div class="stat-mini">
          <div class="stat-mini-label">Saldo</div>
          <div class="stat-mini-value" style="color:${saldo > 0 ? 'var(--amarelo)' : 'var(--verde-hl)'};">${this._fmtR(saldo)}</div>
        </div>
      </div>
    `;

    if (!lista.length) {
      html += `<div class="empty-state" style="padding:30px;text-align:center;">
        <span class="material-symbols-outlined" style="font-size:40px;color:var(--texto3);">construction</span>
        <p style="color:var(--texto3);margin-top:8px;">Nenhum servico adicional registrado para esta obra</p>
      </div>`;
    } else {
      html += lista.map(a => {
        const st = this.STATUS[a.status] || this.STATUS.pendente;
        const pgtos = this.pagamentos.filter(p => p.adicional_id === a.id);
        const pagoParcial = pgtos.reduce((s, p) => s + Number(p.valor || 0), 0);
        const saldoItem = Number(a.valor || 0) - pagoParcial;
        const pagoPct = a.valor > 0 ? (pagoParcial / a.valor * 100).toFixed(0) : 0;

        const pgtoRows = pgtos.map(p =>
          `<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:11px;border-bottom:1px solid var(--borda);">
            <span style="color:var(--texto3);">${typeof fmtData === 'function' ? fmtData(p.data) : p.data}</span>
            <span style="color:var(--texto2);">${p.forma || ''}</span>
            <span style="color:var(--verde-hl);font-weight:700;font-family:'Space Grotesk',monospace;">${this._fmtR(p.valor)}</span>
          </div>`
        ).join('');

        return `
        <div class="card-adicional" style="border:1px solid var(--borda);border-radius:8px;padding:12px;margin-bottom:8px;background:var(--bg3);">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">
            <div style="flex:1;">
              <div style="font-size:13px;font-weight:600;color:var(--texto1);">${typeof esc === 'function' ? esc(a.descricao) : a.descricao}</div>
              ${a.condicao ? `<div style="font-size:11px;color:var(--texto3);margin-top:2px;">${typeof esc === 'function' ? esc(a.condicao) : a.condicao}</div>` : ''}
            </div>
            <div style="display:flex;align-items:center;gap:6px;">
              <span class="badge" style="background:${st.cor}20;color:${st.cor};border:1px solid ${st.cor}40;">
                <span class="material-symbols-outlined" style="font-size:13px;vertical-align:middle;">${st.icon}</span> ${st.label}
              </span>
              <div class="dropdown-actions" style="position:relative;">
                <button onclick="this.nextElementSibling.classList.toggle('hidden')" class="btn-icon-sm"><span class="material-symbols-outlined" style="font-size:16px;">more_vert</span></button>
                <div class="dropdown-menu hidden" style="position:absolute;right:0;top:100%;z-index:10;min-width:160px;background:var(--bg2);border:1px solid var(--borda);border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.2);overflow:hidden;">
                  <button onclick="AdicionaisModule.editar('${a.id}');this.closest('.dropdown-menu').classList.add('hidden')" class="dropdown-item">
                    <span class="material-symbols-outlined" style="font-size:14px;">edit</span> Editar
                  </button>
                  ${a.status !== 'aprovado' ? `<button onclick="AdicionaisModule.mudarStatus('${a.id}','aprovado');this.closest('.dropdown-menu').classList.add('hidden')" class="dropdown-item">
                    <span class="material-symbols-outlined" style="font-size:14px;">check_circle</span> Aprovar
                  </button>` : ''}
                  ${a.status !== 'em_andamento' ? `<button onclick="AdicionaisModule.mudarStatus('${a.id}','em_andamento');this.closest('.dropdown-menu').classList.add('hidden')" class="dropdown-item">
                    <span class="material-symbols-outlined" style="font-size:14px;">engineering</span> Em andamento
                  </button>` : ''}
                  ${a.status !== 'concluido' ? `<button onclick="AdicionaisModule.mudarStatus('${a.id}','concluido');this.closest('.dropdown-menu').classList.add('hidden')" class="dropdown-item">
                    <span class="material-symbols-outlined" style="font-size:14px;">task_alt</span> Concluir
                  </button>` : ''}
                  <button onclick="AdicionaisModule.abrirPgto('${a.id}');this.closest('.dropdown-menu').classList.add('hidden')" class="dropdown-item">
                    <span class="material-symbols-outlined" style="font-size:14px;">payments</span> Registrar Pgto
                  </button>
                  <button onclick="AdicionaisModule.gerarTermo('${a.id}');this.closest('.dropdown-menu').classList.add('hidden')" class="dropdown-item">
                    <span class="material-symbols-outlined" style="font-size:14px;">description</span> Gerar Termo
                  </button>
                  <div style="border-top:1px solid var(--borda);"></div>
                  <button onclick="AdicionaisModule.excluir('${a.id}');this.closest('.dropdown-menu').classList.add('hidden')" class="dropdown-item" style="color:var(--vermelho);">
                    <span class="material-symbols-outlined" style="font-size:14px;">delete</span> Excluir
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;">
            <div style="font-size:16px;font-weight:700;color:var(--texto1);font-family:'Space Grotesk',monospace;">${this._fmtR(a.valor)}</div>
            <div style="font-size:11px;color:var(--texto3);">${a.data_acordo ? (typeof fmtData === 'function' ? fmtData(a.data_acordo) : a.data_acordo) : ''}</div>
          </div>

          <!-- Barra de progresso pagamento -->
          <div style="margin-top:8px;">
            <div style="display:flex;justify-content:space-between;font-size:10px;margin-bottom:3px;">
              <span style="color:var(--texto3);">Pagamento: ${pagoPct}%</span>
              <span style="color:${saldoItem > 0 ? 'var(--amarelo)' : 'var(--verde-hl)'};">Saldo: ${this._fmtR(saldoItem)}</span>
            </div>
            <div style="height:6px;background:var(--borda);border-radius:3px;overflow:hidden;">
              <div style="height:100%;width:${Math.min(pagoPct, 100)}%;background:var(--verde-hl);border-radius:3px;transition:width 0.3s;"></div>
            </div>
          </div>

          ${pgtos.length ? `
          <div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--borda);">
            <div style="font-size:10px;color:var(--texto3);margin-bottom:4px;font-weight:600;">PAGAMENTOS</div>
            ${pgtoRows}
          </div>` : ''}

          ${a.obs ? `<div style="margin-top:6px;font-size:11px;color:var(--texto3);font-style:italic;">${typeof esc === 'function' ? esc(a.obs) : a.obs}</div>` : ''}
        </div>`;
      }).join('');
    }

    container.innerHTML = html;

    // Fechar dropdowns ao clicar fora
    document.addEventListener('click', e => {
      if (!e.target.closest('.dropdown-actions')) {
        container.querySelectorAll('.dropdown-menu').forEach(m => m.classList.add('hidden'));
      }
    }, { once: true });
  },

  // ══════════════════════════════════════════════════════════
  // MODAL ADICIONAL (CRUD) — Gerado via JS
  // ══════════════════════════════════════════════════════════

  abrirModal(obraId, editId) {
    const a = editId ? this.adicionais.find(x => x.id === editId) : null;

    let modal = document.getElementById('modal-adicional-v2');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'modal-adicional-v2';
      modal.className = 'modal-overlay';
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div class="modal-box" style="max-width:500px;">
        <div class="modal-header">
          <h3><span class="material-symbols-outlined" style="font-size:20px;vertical-align:middle;margin-right:6px;">construction</span>${a ? 'Editar' : 'Novo'} Adicional</h3>
          <button onclick="AdicionaisModule._fecharModal('adicional-v2')" class="modal-close"><span class="material-symbols-outlined">close</span></button>
        </div>
        <div class="modal-body" style="padding:16px;">
          <input type="hidden" id="add-edit-id" value="${a?.id || ''}">
          <input type="hidden" id="add-obra-id" value="${obraId}">

          <div class="form-group">
            <label class="form-label">Descricao do servico</label>
            <textarea id="add-descricao" rows="3" class="form-input" placeholder="Ex: MURO DE ARRIMO LATERAL" style="text-transform:uppercase;">${a?.descricao || ''}</textarea>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <div class="form-group">
              <label class="form-label">Valor (R$)</label>
              <input type="number" id="add-valor" step="0.01" class="form-input" value="${a?.valor || ''}">
            </div>
            <div class="form-group">
              <label class="form-label">Data do acordo</label>
              <input type="date" id="add-data" class="form-input" value="${a?.data_acordo || new Date().toISOString().split('T')[0]}">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Condicao de pagamento</label>
            <input type="text" id="add-condicao" class="form-input" placeholder="Ex: 50% INICIO + 50% CONCLUSAO" style="text-transform:uppercase;" value="${a?.condicao || ''}">
          </div>
          <div class="form-group">
            <label class="form-label">Observacoes</label>
            <textarea id="add-obs" rows="2" class="form-input" style="text-transform:uppercase;">${a?.obs || ''}</textarea>
          </div>
          <button onclick="AdicionaisModule.salvar()" class="btn btn-primary" style="width:100%;margin-top:8px;">
            <span class="material-symbols-outlined" style="font-size:16px;vertical-align:middle;margin-right:4px;">save</span>Salvar
          </button>
        </div>
      </div>
    `;

    modal.classList.remove('hidden'); modal.classList.add('active');
  },

  editar(id) {
    const a = this.adicionais.find(x => x.id === id);
    if (!a) return;
    this.abrirModal(a.obra_id, id);
  },

  async salvar() {
    const editId = document.getElementById('add-edit-id')?.value;
    const obraId = document.getElementById('add-obra-id')?.value;
    const descricao = (document.getElementById('add-descricao')?.value || '').toUpperCase().trim();
    const valor = parseFloat(document.getElementById('add-valor')?.value) || 0;
    const condicao = (document.getElementById('add-condicao')?.value || '').toUpperCase().trim();
    const obs = (document.getElementById('add-obs')?.value || '').toUpperCase().trim();
    const data_acordo = document.getElementById('add-data')?.value;

    if (!descricao || valor <= 0) { showToast('Preencha descricao e valor'); return; }

    try {
      if (editId) {
        await sbPatch('obra_adicionais', `?id=eq.${editId}`, { descricao, valor, condicao, obs, data_acordo });
        const idx = this.adicionais.findIndex(a => a.id === editId);
        if (idx >= 0) Object.assign(this.adicionais[idx], { descricao, valor, condicao, obs, data_acordo });
        showToast('Adicional atualizado');
      } else {
        const novo = await sbPost('obra_adicionais', { obra_id: obraId, descricao, valor, condicao, obs, data_acordo, status: 'pendente' });
        if (novo) this.adicionais.unshift(novo);
        showToast('Adicional criado');
      }

      this._fecharModal('adicional-v2');
      this._reRenderObra(obraId);
    } catch (e) {
      console.error('AdicionaisModule salvar:', e);
      showToast('Nao foi possivel salvar o adicional');
    }
  },

  async mudarStatus(id, status) {
    try {
      await sbPatch('obra_adicionais', `?id=eq.${id}`, { status });
      const a = this.adicionais.find(x => x.id === id);
      if (a) {
        a.status = status;
        showToast(`Status alterado para ${this.STATUS[status]?.label || status}`);
        this._reRenderObra(a.obra_id);
      }
    } catch (e) {
      console.error('AdicionaisModule mudarStatus:', e);
      showToast('Nao foi possivel alterar o status');
    }
  },

  async excluir(id) {
    const ok = await confirmar('Excluir este adicional e todos os pagamentos vinculados?');
    if (!ok) return;

    try {
      await sbDelete('adicional_pagamentos', `?adicional_id=eq.${id}`);
      await sbDelete('obra_adicionais', `?id=eq.${id}`);

      const a = this.adicionais.find(x => x.id === id);
      const obraId = a?.obra_id;

      this.pagamentos = this.pagamentos.filter(p => p.adicional_id !== id);
      this.adicionais = this.adicionais.filter(x => x.id !== id);

      showToast('Adicional excluido');
      if (obraId) this._reRenderObra(obraId);
    } catch (e) {
      console.error('AdicionaisModule excluir:', e);
      showToast('Nao foi possivel excluir');
    }
  },

  // ══════════════════════════════════════════════════════════
  // MODAL PAGAMENTO
  // ══════════════════════════════════════════════════════════

  abrirPgto(addId) {
    const a = this.adicionais.find(x => x.id === addId);
    if (!a) return;
    const totalPago = this.pagamentos.filter(p => p.adicional_id === addId).reduce((s, p) => s + Number(p.valor || 0), 0);
    const saldo = Number(a.valor) - totalPago;

    let modal = document.getElementById('modal-add-pgto-v2');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'modal-add-pgto-v2';
      modal.className = 'modal-overlay';
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div class="modal-box" style="max-width:400px;">
        <div class="modal-header">
          <h3><span class="material-symbols-outlined" style="font-size:20px;vertical-align:middle;margin-right:6px;">payments</span>Registrar Pagamento</h3>
          <button onclick="AdicionaisModule._fecharModal('add-pgto-v2')" class="modal-close"><span class="material-symbols-outlined">close</span></button>
        </div>
        <div class="modal-body" style="padding:16px;">
          <input type="hidden" id="pgto-add-id" value="${addId}">
          <div style="margin-bottom:12px;padding:10px;background:var(--bg2);border-radius:8px;border:1px solid var(--borda);">
            <div style="font-size:11px;color:var(--texto3);">Saldo restante</div>
            <div style="font-size:18px;font-weight:700;color:${saldo > 0 ? 'var(--amarelo)' : 'var(--verde-hl)'};font-family:'Space Grotesk',monospace;">${this._fmtR(saldo)}</div>
          </div>
          <div class="form-group">
            <label class="form-label">Valor (R$)</label>
            <input type="number" id="pgto-valor" step="0.01" class="form-input" value="${saldo > 0 ? saldo.toFixed(2) : ''}">
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <div class="form-group">
              <label class="form-label">Data</label>
              <input type="date" id="pgto-data" class="form-input" value="${new Date().toISOString().split('T')[0]}">
            </div>
            <div class="form-group">
              <label class="form-label">Forma</label>
              <input type="text" id="pgto-forma" class="form-input" placeholder="PIX, DINHEIRO..." style="text-transform:uppercase;">
            </div>
          </div>
          <button onclick="AdicionaisModule.salvarPgto()" class="btn btn-primary" style="width:100%;margin-top:8px;">
            <span class="material-symbols-outlined" style="font-size:16px;vertical-align:middle;margin-right:4px;">check</span>Registrar
          </button>
        </div>
      </div>
    `;

    modal.classList.remove('hidden'); modal.classList.add('active');
  },

  async salvarPgto() {
    const adicional_id = document.getElementById('pgto-add-id')?.value;
    const valor = parseFloat(document.getElementById('pgto-valor')?.value) || 0;
    const data = document.getElementById('pgto-data')?.value;
    const forma = (document.getElementById('pgto-forma')?.value || '').toUpperCase();

    if (!valor || !data) { showToast('Preencha valor e data'); return; }

    try {
      const novo = await sbPost('adicional_pagamentos', { adicional_id, valor, data, forma });
      if (novo) this.pagamentos.unshift(novo);

      // Auto-conclusao quando totalmente pago
      const adicional = this.adicionais.find(a => a.id === adicional_id);
      if (adicional) {
        const totalPago = this.pagamentos
          .filter(p => p.adicional_id === adicional_id)
          .reduce((s, p) => s + Number(p.valor || 0), 0);
        if (totalPago >= Number(adicional.valor || 0) && adicional.status !== 'concluido') {
          await sbPatch('obra_adicionais', `?id=eq.${adicional_id}`, { status: 'concluido' });
          adicional.status = 'concluido';
          showToast('Pagamento registrado! Adicional concluido automaticamente.');
        } else {
          showToast('Pagamento registrado');
        }
        this._fecharModal('add-pgto-v2');
        this._reRenderObra(adicional.obra_id);
      } else {
        showToast('Pagamento registrado');
        this._fecharModal('add-pgto-v2');
      }
    } catch (e) {
      console.error('AdicionaisModule salvarPgto:', e);
      showToast('Nao foi possivel registrar o pagamento');
    }
  },

  // ══════════════════════════════════════════════════════════
  // TERMO DE AUTORIZACAO — HTML + window.print()
  // ══════════════════════════════════════════════════════════

  gerarTermo(id) {
    const a = this.adicionais.find(x => x.id === id);
    if (!a) return;

    const todasObras = [
      ...(typeof obras !== 'undefined' ? obras : []),
      ...(typeof obrasArquivadas !== 'undefined' ? obrasArquivadas : [])
    ];
    const obra = todasObras.find(o => o.id === a.obra_id);
    const obraNome = obra?.nome || '\u2014';
    const obraCidade = obra?.cidade || 'JUPI-PE';
    const contratante = obra?.contratante || '';
    const cpfContratante = obra?.cpf_contratante || '';
    const dataAcordo = a.data_acordo
      ? (typeof fmtData === 'function' ? fmtData(a.data_acordo) : a.data_acordo)
      : new Date().toLocaleDateString('pt-BR');

    // valorPorExtenso vem de utils.js (GM diretriz 7)
    const extenso = typeof valorPorExtenso === 'function' ? valorPorExtenso(a.valor) : '';

    if (!contratante) {
      showToast('Preencha o nome do contratante na obra antes de gerar o termo');
      return;
    }

    const logoB64 = typeof EDR_LOGO_B64 !== 'undefined' ? EDR_LOGO_B64 : '';
    const valorFmt = Number(a.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    const escHtml = s => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  @page { margin: 25mm 20mm; }
  body { font-family: 'Inter', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; color: #1a1a1a; font-size: 12.5px; line-height: 1.9; max-width: 700px; margin: 0 auto; padding: 20px; }
  .header { text-align: center; border-bottom: 2px solid #2D6A4F; padding-bottom: 16px; margin-bottom: 30px; }
  .header img { height: 80px; margin-bottom: 8px; }
  .header .empresa { font-size: 11px; color: #444; margin-top: 4px; letter-spacing: 1px; }
  .header .cnpj { font-size: 10.5px; color: #666; }
  .titulo { text-align: center; font-size: 14px; font-weight: 700; letter-spacing: 3px; margin: 30px 0 24px 0; text-transform: uppercase; border: 2px solid #2D6A4F; padding: 10px; color: #1a1a1a; }
  .clausula { margin-bottom: 16px; text-align: justify; }
  .clausula strong { font-weight: 700; }
  .destaque { background: #f7f9f7; border-left: 3px solid #2D6A4F; padding: 12px 16px; margin: 16px 0; }
  .destaque .valor { font-size: 20px; font-weight: 700; color: #1a1a1a; }
  .assinaturas { display: flex; justify-content: space-between; margin-top: 60px; gap: 40px; }
  .assinatura { flex: 1; text-align: center; padding-top: 8px; border-top: 1px solid #1a1a1a; }
  .assinatura .nome { font-weight: 700; font-size: 11.5px; }
  .assinatura .info { font-size: 10px; color: #666; }
  .footer { text-align: center; font-size: 9px; color: #999; margin-top: 40px; border-top: 1px solid #ddd; padding-top: 8px; }
  .local-data { text-align: center; margin-top: 30px; font-size: 11.5px; }
</style></head><body>

<div class="header">
  ${logoB64 ? `<img src="${logoB64}" alt="EDR Engenharia">` : '<div style="font-size:24px;font-weight:700;color:#2D6A4F;">EDR ENGENHARIA</div>'}
  <div class="empresa">RUA GERSON FERREIRA DE ALMEIDA, N\u00BA 89, CENTRO \u2014 JUPI/PE</div>
  <div class="cnpj">CNPJ: 49.909.440/0001-55</div>
</div>

<div class="titulo">TERMO DE AUTORIZA\u00C7\u00C3O DE SERVI\u00C7O ADICIONAL</div>

<div class="clausula">
  <strong>CL\u00C1USULA 1\u00AA \u2014 DO OBJETO:</strong> O presente termo tem por finalidade formalizar a autoriza\u00E7\u00E3o para execu\u00E7\u00E3o de servi\u00E7o adicional na obra <strong>\u201C${escHtml(obraNome)}\u201D</strong>, localizada em <strong>${escHtml(obraCidade)}</strong>, conforme descrito abaixo:
</div>

<div class="destaque">
  <strong>SERVI\u00C7O:</strong> ${escHtml(a.descricao)}
</div>

<div class="clausula">
  <strong>CL\u00C1USULA 2\u00AA \u2014 DO VALOR:</strong> O valor total para execu\u00E7\u00E3o do servi\u00E7o adicional acima descrito \u00E9 de:
</div>

<div class="destaque">
  <div class="valor">R$ ${valorFmt}</div>
  ${extenso ? `<div style="font-size:11px;color:#555;margin-top:2px;">(${extenso})</div>` : ''}
</div>

<div class="clausula">
  <strong>CL\u00C1USULA 3\u00AA \u2014 DAS CONDI\u00C7\u00D5ES DE PAGAMENTO:</strong> ${escHtml(a.condicao)}
</div>

<div class="clausula">
  <strong>CL\u00C1USULA 4\u00AA \u2014 DO PRAZO:</strong> O servi\u00E7o adicional ser\u00E1 executado conforme cronograma da obra, sem preju\u00EDzo das atividades contratadas originalmente. O prazo espec\u00EDfico ser\u00E1 acordado entre as partes e poder\u00E1 sofrer altera\u00E7\u00F5es em raz\u00E3o de condi\u00E7\u00F5es clim\u00E1ticas ou de abastecimento de materiais.
</div>

<div class="clausula">
  <strong>CL\u00C1USULA 5\u00AA \u2014 DAS RESPONSABILIDADES:</strong> A <strong>EDR ENGENHARIA</strong> se compromete a executar o servi\u00E7o com qualidade, utilizando materiais adequados e m\u00E3o de obra qualificada. O CONTRATANTE declara estar ciente de que este servi\u00E7o \u00E9 adicional ao contrato original e que seu custo n\u00E3o est\u00E1 inclu\u00EDdo no financiamento habitacional.
</div>

<div class="clausula">
  <strong>CL\u00C1USULA 6\u00AA \u2014 DA AUTORIZA\u00C7\u00C3O:</strong> O(A) Sr(a). <strong>${escHtml(contratante)}</strong>, portador(a) do CPF n\u00BA <strong>${cpfContratante || '___.___.___-__'}</strong>, ao assinar este termo, autoriza expressamente a execu\u00E7\u00E3o do servi\u00E7o descrito na Cl\u00E1usula 1\u00AA, nas condi\u00E7\u00F5es estabelecidas neste instrumento.
</div>

${a.obs ? `<div class="clausula"><strong>OBSERVA\u00C7\u00D5ES:</strong> ${escHtml(a.obs)}</div>` : ''}

<div class="local-data">
  ${escHtml(obraCidade)}, ${dataAcordo}
</div>

<div class="assinaturas">
  <div class="assinatura">
    <div class="nome">${escHtml(contratante)}</div>
    <div class="info">CPF: ${cpfContratante || '___.___.___-__'}</div>
  </div>
  <div class="assinatura">
    <div class="nome">EDR ENGENHARIA</div>
    <div class="info">CNPJ: 49.909.440/0001-55</div>
  </div>
</div>

<div class="footer">Documento gerado pelo EDR System em ${new Date().toLocaleDateString('pt-BR')} \u00E0s ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>

</body></html>`;

    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 400);
  },

  // ══════════════════════════════════════════════════════════
  // UTILITARIOS INTERNOS
  // ══════════════════════════════════════════════════════════

  _fmtR(n) {
    return 'R$ ' + Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },

  _fecharModal(id) {
    const modal = document.getElementById('modal-' + id);
    if (modal) { modal.classList.add('hidden'); modal.style.display = 'none'; }
  },

  _reRenderObra(obraId) {
    // Re-renderiza a tab de adicionais dentro da obra aberta
    const container = document.getElementById('adicionais-lista');
    if (container && obraId) {
      this.render(obraId, container);
    }
  },

  // ══════════════════════════════════════════════════════════
  // VIEW GERAL — Todos os adicionais (para viewRegistry)
  // ══════════════════════════════════════════════════════════

  async renderGeral(container) {
    if (!container) return;
    container.innerHTML = '<div style="padding:20px;text-align:center;"><span class="material-symbols-outlined" style="font-size:36px;animation:pulse 1.5s infinite;color:var(--primary)">hourglass_empty</span></div>';

    if (!this._loaded) await this.load();

    const todasObras = [
      ...(typeof obras !== 'undefined' ? obras : []),
      ...(typeof obrasArquivadas !== 'undefined' ? obrasArquivadas : [])
    ].filter(o => !o.arquivada);

    const totalGeral = this.adicionais.reduce((s, a) => s + Number(a.valor || 0), 0);
    const totalPagoGeral = this.pagamentos.reduce((s, p) => s + Number(p.valor || 0), 0);
    const totalPendentes = this.adicionais.filter(a => a.status === 'pendente').length;
    const totalAprovados = this.adicionais.filter(a => a.status === 'aprovado' || a.status === 'em_andamento').length;

    let html = `
      <div class="sticky-header">
        <div class="modulo-badge"><span class="material-symbols-outlined">construction</span> ADICIONAIS</div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:10px;">
          <div class="stat-mini"><div class="stat-mini-label">Total</div><div class="stat-mini-value">${this._fmtR(totalGeral)}</div></div>
          <div class="stat-mini"><div class="stat-mini-label">Recebido</div><div class="stat-mini-value" style="color:var(--verde-hl);">${this._fmtR(totalPagoGeral)}</div></div>
          <div class="stat-mini"><div class="stat-mini-label">Pendentes</div><div class="stat-mini-value" style="color:var(--amarelo);">${totalPendentes}</div></div>
          <div class="stat-mini"><div class="stat-mini-label">Em andamento</div><div class="stat-mini-value" style="color:var(--primary);">${totalAprovados}</div></div>
        </div>
      </div>
      <div style="padding:0 0 80px;">
    `;

    if (!this.adicionais.length) {
      html += `<div class="empty-state" style="padding:60px 20px;text-align:center;">
        <span class="material-symbols-outlined" style="font-size:48px;color:var(--text-tertiary);">construction</span>
        <p style="color:var(--text-tertiary);margin-top:8px;">Nenhum adicional registrado.</p>
      </div>`;
    } else {
      // Agrupar por obra
      const porObra = {};
      this.adicionais.forEach(a => {
        if (!porObra[a.obra_id]) porObra[a.obra_id] = [];
        porObra[a.obra_id].push(a);
      });

      Object.entries(porObra).forEach(([obraId, lista]) => {
        const obra = todasObras.find(o => o.id === obraId);
        const obraNome = obra?.nome || 'Obra desconhecida';
        const totalObra = lista.reduce((s, a) => s + Number(a.valor || 0), 0);
        const pagoObra = this.pagamentos.filter(p => lista.some(a => a.id === p.adicional_id)).reduce((s, p) => s + Number(p.valor || 0), 0);

        html += `<div style="margin:14px 0 4px;padding:10px 12px;background:var(--surface);border:1px solid var(--border);border-radius:8px;">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;">
            <div style="font-size:13px;font-weight:700;display:flex;align-items:center;gap:6px;">
              <span class="material-symbols-outlined" style="font-size:16px;color:var(--primary);">home_work</span>${typeof esc === 'function' ? esc(obraNome) : obraNome}
            </div>
            <div style="font-size:11px;color:var(--text-tertiary);">${this._fmtR(totalObra)} · pago ${this._fmtR(pagoObra)}</div>
          </div>
        </div>`;

        lista.forEach(a => {
          const st = this.STATUS[a.status] || this.STATUS.pendente;
          const pgtos = this.pagamentos.filter(p => p.adicional_id === a.id);
          const pagoParcial = pgtos.reduce((s, p) => s + Number(p.valor || 0), 0);
          const saldoItem = Number(a.valor || 0) - pagoParcial;

          html += `<div class="card-adicional" style="border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:6px;background:var(--surface);">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
              <div style="flex:1;">
                <div style="font-size:13px;font-weight:600;color:var(--text-primary);">${typeof esc === 'function' ? esc(a.descricao) : a.descricao}</div>
                ${a.data_acordo ? `<div style="font-size:11px;color:var(--text-tertiary);margin-top:2px;">${typeof fmtData === 'function' ? fmtData(a.data_acordo) : a.data_acordo}</div>` : ''}
              </div>
              <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;">
                <span class="badge" style="background:${st.cor}20;color:${st.cor};border:1px solid ${st.cor}40;font-size:10px;">
                  <span class="material-symbols-outlined" style="font-size:12px;vertical-align:middle;">${st.icon}</span> ${st.label}
                </span>
                <span style="font-size:13px;font-weight:700;color:var(--text-primary);font-family:'Space Grotesk',monospace;">${this._fmtR(a.valor)}</span>
                ${saldoItem > 0 ? `<span style="font-size:10px;color:var(--amarelo);">Saldo: ${this._fmtR(saldoItem)}</span>` : '<span style="font-size:10px;color:var(--verde-hl);">Quitado</span>'}
              </div>
            </div>
          </div>`;
        });
      });
    }

    html += '</div>';
    container.innerHTML = html;
  }
};

// ── Registro no viewRegistry ──
if (typeof viewRegistry !== 'undefined') {
  viewRegistry.register('adicionais', (container) => AdicionaisModule.renderGeral(container));
}
