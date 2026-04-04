/* ============================================================
   EDR V2 — DiarioModule
   Fase 4.3 Lote 3 (fc7)
   View independente mobile-first — Diario de Obra
   Checklist de campo para acompanhamento diario
   ============================================================ */

const DiarioModule = {

  // ── Estado ──
  tarefas: [],
  obras: [],
  alteracoes: {},   // { tarefaId: { subIdx: bool } }
  filtroObra: '',
  _carregado: false,

  // ── Render principal ──
  async render(container) {
    container.innerHTML = DiarioModule._skeleton();
    await DiarioModule._carregar();
    DiarioModule._carregado = true;
    requestAnimationFrame(() => {
      container.innerHTML = DiarioModule._html();
      DiarioModule._bind(container);
    });
  },

  _skeleton() {
    return '<div style="max-width:600px;margin:0 auto;padding:16px;">' +
      '<div style="height:48px;background:var(--skeleton);border-radius:12px;margin-bottom:16px;animation:pulse 1.5s infinite"></div>' +
      '<div style="display:flex;gap:8px;margin-bottom:16px;">' +
        '<div style="flex:1;height:64px;background:var(--skeleton);border-radius:10px;animation:pulse 1.5s infinite"></div>'.repeat(3) +
      '</div>' +
      '<div style="height:120px;background:var(--skeleton);border-radius:12px;margin-bottom:12px;animation:pulse 1.5s infinite"></div>'.repeat(3) +
    '</div>';
  },

  // ── Carregar dados ──
  async _carregar() {
    try {
      const filtro = DiarioModule.filtroObra;
      let params = 'select=*,obras(id,nome)&order=ordem.asc,data_inicio.asc';
      if (filtro) params += '&obra_id=eq.' + filtro;
      const data = await sbGet('cronograma_tarefas?' + params);

      // Extrair obras unicas
      const obrasMap = {};
      (data || []).forEach(t => {
        if (t.obras && t.obras.id) obrasMap[t.obras.id] = t.obras.nome;
      });
      DiarioModule.obras = Object.entries(obrasMap)
        .map(([id, nome]) => ({ id, nome }))
        .sort((a, b) => a.nome.localeCompare(b.nome));

      // Filtrar: so tarefas com subitens pendentes
      DiarioModule.tarefas = (data || []).map(t => ({
        ...t,
        _obraNome: t.obras?.nome || 'Sem obra'
      })).filter(t => {
        const subs = t.subitens || [];
        return subs.length > 0 && subs.some(s => !s.feito);
      });
    } catch (e) {
      console.error('DiarioModule._carregar:', e);
      DiarioModule.tarefas = [];
    }
    DiarioModule.alteracoes = {};
  },

  // ── HTML principal ──
  _html() {
    const hoje = new Date();
    const dataHoje = hoje.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
    const tarefas = DiarioModule.tarefas;

    // Stats
    const totalSubs = tarefas.reduce((a, t) => a + (t.subitens || []).length, 0);
    const feitos = tarefas.reduce((a, t) => a + (t.subitens || []).filter(s => s.feito).length, 0);
    const pendentes = totalSubs - feitos;
    const prog = totalSubs > 0 ? Math.round(feitos / totalSubs * 100) : 0;
    const hojeStr = hoje.toISOString().split('T')[0];
    const emAndamento = tarefas.filter(t => t.data_inicio <= hojeStr && t.data_fim >= hojeStr).length;
    const atrasadas = tarefas.filter(t => t.data_fim < hojeStr).length;
    const corProg = prog >= 70 ? '#2D6A4F' : prog >= 40 ? '#D4A017' : '#C0392B';

    // Opcoes de obra pro autocomplete/select
    const obrasOpts = DiarioModule.obras.map(o =>
      '<option value="' + o.id + '"' + (DiarioModule.filtroObra === o.id ? ' selected' : '') + '>' + o.nome + '</option>'
    ).join('');

    let html = '<div style="max-width:600px;margin:0 auto;padding:0 0 90px;">';

    // Header
    html += '<div style="position:sticky;top:0;z-index:90;background:var(--fundo);border-bottom:1px solid var(--borda);padding:14px 16px;display:flex;align-items:center;justify-content:space-between;">' +
      '<div>' +
        '<div style="font-family:\'Plus Jakarta Sans\',sans-serif;font-size:16px;font-weight:800;letter-spacing:-0.5px;">EDR <span style="color:#2D6A4F;">Diario</span></div>' +
        '<div style="font-size:11px;color:var(--texto2);">' + dataHoje + '</div>' +
      '</div>' +
      '<select id="diario-filtro-obra" style="background:var(--fundo2);color:var(--texto);border:1px solid var(--borda);border-radius:8px;padding:6px 10px;font-family:inherit;font-size:12px;">' +
        '<option value="">Todas as obras</option>' + obrasOpts +
      '</select>' +
    '</div>';

    // Stats
    html += '<div style="display:flex;gap:8px;padding:12px 16px;overflow-x:auto;">';
    html += DiarioModule._statCard(prog + '%', 'Progresso', corProg);
    html += DiarioModule._statCard(pendentes, 'Pendentes', 'var(--texto)');
    html += DiarioModule._statCard(emAndamento, 'Em andamento', '#2D6A4F');
    if (atrasadas > 0) html += DiarioModule._statCard(atrasadas, 'Atrasadas', '#C0392B');
    html += '</div>';

    // Conteudo
    if (tarefas.length === 0) {
      html += '<div style="text-align:center;padding:60px 20px;color:var(--texto2);">' +
        '<span class="material-symbols-outlined" style="font-size:48px;color:#2D6A4F;margin-bottom:12px;">check_circle</span>' +
        '<div style="font-weight:600;">Tudo concluido!</div><div style="font-size:13px;">Nenhuma tarefa pendente.</div>' +
      '</div>';
    } else {
      // Agrupar por obra
      const porObra = {};
      tarefas.forEach(t => {
        const nome = t._obraNome;
        if (!porObra[nome]) porObra[nome] = [];
        porObra[nome].push(t);
      });

      Object.entries(porObra).forEach(([obraNome, tasks]) => {
        const obraSubs = tasks.reduce((a, t) => a + (t.subitens || []).length, 0);
        const obraFeitos = tasks.reduce((a, t) => a + (t.subitens || []).filter(s => s.feito).length, 0);
        const obraProg = obraSubs > 0 ? Math.round(obraFeitos / obraSubs * 100) : 0;
        const obraCor = obraProg >= 70 ? '#2D6A4F' : obraProg >= 40 ? '#D4A017' : '#C0392B';

        html += '<div style="margin:12px 16px;">';
        // Header da obra
        html += '<div style="position:sticky;top:50px;z-index:80;background:var(--fundo);padding:10px 0;border-bottom:1px solid var(--borda);display:flex;align-items:center;justify-content:space-between;">' +
          '<div style="font-size:16px;font-weight:700;display:flex;align-items:center;gap:6px;">' +
            '<span class="material-symbols-outlined" style="font-size:20px;color:#2D6A4F;">construction</span> ' + obraNome +
          '</div>' +
          '<div style="display:flex;align-items:center;gap:6px;">' +
            '<div style="width:60px;height:6px;background:var(--borda);border-radius:3px;overflow:hidden;">' +
              '<div style="height:100%;width:' + obraProg + '%;background:' + obraCor + ';border-radius:3px;transition:width .3s;"></div>' +
            '</div>' +
            '<span style="font-size:11px;font-weight:700;color:' + obraCor + ';">' + obraProg + '%</span>' +
          '</div>' +
        '</div>';

        // Ordenar: em andamento primeiro
        tasks.sort((a, b) => {
          const aAtivo = a.data_inicio <= hojeStr ? 0 : 1;
          const bAtivo = b.data_inicio <= hojeStr ? 0 : 1;
          return aAtivo - bAtivo || (a.ordem || 0) - (b.ordem || 0);
        });

        tasks.forEach(t => {
          const subs = t.subitens || [];
          const subFeitos = subs.filter(s => s.feito).length;
          const ativo = t.data_inicio <= hojeStr;
          const atrasado = t.data_fim < hojeStr;
          const inicioFmt = DiarioModule._fmtDataCurta(t.data_inicio);
          const fimFmt = DiarioModule._fmtDataCurta(t.data_fim);
          const statusCor = atrasado ? '#C0392B' : ativo ? '#2D6A4F' : 'var(--texto3)';
          const statusTxt = atrasado ? 'ATRASADA' : ativo ? 'EM ANDAMENTO' : 'FUTURA';

          html += '<div style="background:var(--fundo2);border:1px solid var(--borda);border-radius:10px;margin-bottom:8px;overflow:hidden;" id="diario-etapa-' + t.id + '">';

          // Header da etapa
          html += '<div class="diario-etapa-header" data-id="' + t.id + '" style="padding:10px 12px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;">' +
            '<div>' +
              '<div style="font-size:13px;font-weight:600;">' + (t.nome || '') + '</div>' +
              '<div style="font-size:10px;color:var(--texto3);margin-top:2px;">' + inicioFmt + ' &rarr; ' + fimFmt + ' &middot; <span style="color:' + statusCor + ';font-weight:600;">' + statusTxt + '</span></div>' +
            '</div>' +
            '<div style="display:flex;align-items:center;gap:6px;">' +
              '<span style="font-size:11px;color:var(--texto2);">' + subFeitos + '/' + subs.length + '</span>' +
              '<span class="material-symbols-outlined diario-arrow" id="diario-arrow-' + t.id + '" style="font-size:16px;color:var(--texto3);transition:transform .2s;' + (ativo ? 'transform:rotate(90deg);' : '') + '">chevron_right</span>' +
            '</div>' +
          '</div>';

          // Subitens
          html += '<div class="diario-subs" id="diario-subs-' + t.id + '" style="padding:0 12px 10px;' + (ativo ? '' : 'display:none;') + '">';
          subs.forEach((s, i) => {
            html += '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid rgba(0,0,0,0.04);">' +
              '<input type="checkbox" class="diario-check" data-tarefa="' + t.id + '" data-idx="' + i + '" ' + (s.feito ? 'checked' : '') + ' style="width:22px;height:22px;accent-color:#2D6A4F;cursor:pointer;">' +
              '<span style="font-size:13px;flex:1;' + (s.feito ? 'color:var(--texto3);text-decoration:line-through;' : '') + '">' + (s.nome || '') + '</span>' +
            '</div>';
          });
          html += '</div>';

          html += '</div>';
        });

        html += '</div>';
      });
    }

    // Bottom bar
    html += '<div style="position:fixed;bottom:0;left:0;right:0;background:var(--fundo2);border-top:1px solid var(--borda);padding:12px 16px;display:flex;gap:8px;z-index:90;">' +
      '<button id="diario-btn-voltar" style="flex:1;padding:10px;border-radius:10px;border:1px solid var(--borda);background:var(--fundo);color:var(--texto2);font-family:inherit;font-size:12px;font-weight:700;cursor:pointer;">' +
        '<span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">arrow_back</span> SISTEMA' +
      '</button>' +
      '<button id="diario-btn-salvar" style="flex:1;padding:10px;border-radius:10px;border:none;background:#2D6A4F;color:#fff;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer;">SALVAR ALTERACOES</button>' +
    '</div>';

    html += '</div>';
    return html;
  },

  _statCard(valor, label, cor) {
    return '<div style="flex:1;min-width:80px;background:var(--fundo2);border:1px solid var(--borda);border-radius:10px;padding:10px;text-align:center;">' +
      '<div style="font-size:20px;font-weight:800;color:' + cor + ';">' + valor + '</div>' +
      '<div style="font-size:9px;color:var(--texto2);text-transform:uppercase;letter-spacing:1px;margin-top:2px;">' + label + '</div>' +
    '</div>';
  },

  _fmtDataCurta(iso) {
    if (!iso) return '';
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  },

  // ── Bind eventos ──
  _bind(container) {
    // Filtro de obra
    const sel = container.querySelector('#diario-filtro-obra');
    if (sel) {
      sel.addEventListener('change', async () => {
        DiarioModule.filtroObra = sel.value;
        await DiarioModule._carregar();
        requestAnimationFrame(() => {
          container.innerHTML = DiarioModule._html();
          DiarioModule._bind(container);
        });
      });
    }

    // Toggle etapas
    container.querySelectorAll('.diario-etapa-header').forEach(header => {
      header.addEventListener('click', () => {
        const id = header.dataset.id;
        const subs = container.querySelector('#diario-subs-' + id);
        const arrow = container.querySelector('#diario-arrow-' + id);
        if (!subs) return;
        const aberto = subs.style.display !== 'none';
        subs.style.display = aberto ? 'none' : '';
        if (arrow) arrow.style.transform = aberto ? 'rotate(0deg)' : 'rotate(90deg)';
      });
    });

    // Checkboxes
    container.querySelectorAll('.diario-check').forEach(cb => {
      cb.addEventListener('change', () => {
        const tarefaId = cb.dataset.tarefa;
        const idx = parseInt(cb.dataset.idx);
        const feito = cb.checked;

        // Registrar alteracao
        if (!DiarioModule.alteracoes[tarefaId]) DiarioModule.alteracoes[tarefaId] = {};
        DiarioModule.alteracoes[tarefaId][idx] = feito;

        // Visual
        const label = cb.nextElementSibling;
        if (label) {
          label.style.color = feito ? 'var(--texto3)' : '';
          label.style.textDecoration = feito ? 'line-through' : '';
        }

        // Atualizar local
        const t = DiarioModule.tarefas.find(x => x.id === tarefaId);
        if (t && t.subitens && t.subitens[idx]) t.subitens[idx].feito = feito;

        // Botao salvar
        const btn = container.querySelector('#diario-btn-salvar');
        if (btn) {
          const count = Object.values(DiarioModule.alteracoes).reduce((a, o) => a + Object.keys(o).length, 0);
          btn.textContent = 'SALVAR (' + count + ' alterac' + (count > 1 ? 'oes' : 'ao') + ')';
        }
      });
    });

    // Botao voltar
    const btnVoltar = container.querySelector('#diario-btn-voltar');
    if (btnVoltar) {
      btnVoltar.addEventListener('click', () => {
        if (typeof viewRegistry !== 'undefined') viewRegistry.show('dashboard');
      });
    }

    // Botao salvar
    const btnSalvar = container.querySelector('#diario-btn-salvar');
    if (btnSalvar) {
      btnSalvar.addEventListener('click', () => DiarioModule._salvar(container));
    }
  },

  // ── Salvar alteracoes ──
  async _salvar(container) {
    const ids = Object.keys(DiarioModule.alteracoes);
    if (ids.length === 0) {
      if (typeof confirmar === 'function') {
        confirmar('Nenhuma alteracao pra salvar', null, { soInfo: true });
      }
      return;
    }

    const btn = container.querySelector('#diario-btn-salvar');
    if (btn) { btn.textContent = 'SALVANDO...'; btn.disabled = true; }

    let salvos = 0;
    for (const tarefaId of ids) {
      const t = DiarioModule.tarefas.find(x => x.id === tarefaId);
      if (!t) continue;

      // Aplicar alteracoes
      Object.entries(DiarioModule.alteracoes[tarefaId]).forEach(([idx, feito]) => {
        if (t.subitens && t.subitens[parseInt(idx)]) t.subitens[parseInt(idx)].feito = feito;
      });

      // Calcular progresso
      const subs = t.subitens || [];
      const prog = subs.length > 0 ? Math.round(subs.filter(s => s.feito).length / subs.length * 100) : 0;

      try {
        await sbPatch('cronograma_tarefas?id=eq.' + tarefaId, {
          subitens: t.subitens,
          progresso: prog
        });
        salvos++;
      } catch (e) {
        console.error('DiarioModule._salvar:', tarefaId, e);
      }
    }

    DiarioModule.alteracoes = {};
    if (btn) {
      btn.textContent = 'SALVO! (' + salvos + ')';
      btn.disabled = false;
      setTimeout(() => { btn.textContent = 'SALVAR ALTERACOES'; }, 2000);
    }
  }
};

// ── Registro no viewRegistry ──
if (typeof viewRegistry !== 'undefined') {
  viewRegistry.register('diario', (container) => DiarioModule.render(container));
}
