// ══════════════════════════════════════════════════════════════
// EDR V2 — Cronograma / Gantt
// Estado encapsulado, Frappe Gantt com try/catch,
// confirmar() em vez de confirm(), modais em vez de prompt()
// ══════════════════════════════════════════════════════════════
//
// CSS NECESSARIO (adicionar ao stylesheet V2):
// .gantt .grid-background { fill: var(--bg) !important; }
// .gantt .grid-header { fill: var(--bg2) !important; }
// .gantt .grid-row { fill: var(--bg) !important; }
// .gantt .grid-row:nth-child(even) { fill: var(--bg2) !important; }
// .gantt .row-line { stroke: var(--borda) !important; }
// .gantt .tick { stroke: var(--borda) !important; }
// .gantt .today-highlight { fill: rgba(45,106,79,0.12) !important; }
// .gantt .bar { fill: var(--primary) !important; }
// .gantt .bar-progress { fill: var(--primary-dark) !important; }
// .gantt .bar-label { fill: var(--text-primary) !important; }
// .gantt .upper-text { fill: var(--text-secondary) !important; }
// .gantt .lower-text { fill: var(--text-tertiary) !important; }
// ══════════════════════════════════════════════════════════════

const CronogramaModule = {
  // ── Estado ─────────────────────────────────────────────
  tarefas: [],
  _gantt: null,
  obraFiltro: '',
  viewMode: 'Week',
  expandido: new Set(),
  _obraCores: {},
  _subsEdit: [],
  _view: 'lista',

  // ── Cores por obra ────────────────────────────────────
  _CORES: [
    { bar: '#2D6A4F', prog: '#40916C', label: '#52B788' },
    { bar: '#7B2CBF', prog: '#9D4EDD', label: '#C77DFF' },
    { bar: '#E85D04', prog: '#F48C06', label: '#FAA307' },
    { bar: '#0077B6', prog: '#00B4D8', label: '#48CAE4' },
    { bar: '#D00000', prog: '#E85D04', label: '#F48C06' },
    { bar: '#B5838D', prog: '#E5989B', label: '#FFB4A2' },
    { bar: '#3A86FF', prog: '#8338EC', label: '#FF006E' },
    { bar: '#606C38', prog: '#283618', label: '#DDA15E' }
  ],

  // ── Etapas padrao construtivas (separadas de ETAPAS financeiras) ──
  _ETAPAS_PADRAO: [
    { nome: 'Servicos Preliminares', dias: 15, subs: [
      'Limpeza de Terreno', 'Gabarito', 'Locacao da Obra', 'Tapume / Canteiro', 'Placa de Obra'
    ]},
    { nome: 'Fundacao', dias: 30, subs: [
      'Escavacao de Sapatas', 'Concretagem Sapatas', 'Escavacao de Baldrame', 'Embasamento',
      'Armadura Baldrame', 'Forma Baldrame', 'Concreto Baldrame', 'Impermeabilizacao Baldrame',
      'Tubulacoes de Esgoto'
    ]},
    { nome: 'Estrutura', dias: 45, subs: [
      'Pilares', 'Vigas', 'Cintas', 'Laje', 'Escada'
    ]},
    { nome: 'Alvenaria', dias: 30, subs: [
      'Alvenaria de Vedacao', 'Vergas', 'Contravergas', 'Encunhamento'
    ]},
    { nome: 'Cobertura', dias: 15, subs: [
      'Estrutura do Telhado', 'Telhas', 'Calhas e Rufos', 'Cumeeira'
    ]},
    { nome: 'Instalacoes Eletricas', dias: 20, subs: [
      'Eletrodutos', 'Fiacao', 'Quadro de Distribuicao', 'Tomadas e Interruptores', 'Interfone / Automacao'
    ]},
    { nome: 'Instalacoes Hidraulicas', dias: 20, subs: [
      'Agua Fria', 'Agua Quente', 'Registros', 'Caixa d\'Agua',
      'Esgoto', 'Caixa de Gordura', 'Caixa de Passagem', 'Aguas Pluviais'
    ]},
    { nome: 'Impermeabilizacao', dias: 10, subs: [
      'Laje', 'Banheiros', 'Areas Molhadas', 'Baldrames'
    ]},
    { nome: 'Revestimento Argamassa', dias: 25, subs: [
      'Chapisco Interno', 'Reboco Interno', 'Chapisco Externo', 'Reboco Externo', 'Massa Corrida'
    ]},
    { nome: 'Forro', dias: 10, subs: [
      'Forro de Gesso', 'Sancas / Tabicas', 'Forro PVC (areas molhadas)'
    ]},
    { nome: 'Revestimento Ceramico', dias: 20, subs: [
      'Contrapiso', 'Piso Ceramico / Porcelanato', 'Azulejo Banheiros', 'Azulejo Cozinha',
      'Soleiras e Peitoris'
    ]},
    { nome: 'Esquadrias', dias: 10, subs: [
      'Portas Internas', 'Porta de Entrada', 'Janelas', 'Batentes', 'Ferragens',
      'Vidros', 'Box Banheiro'
    ]},
    { nome: 'Pintura', dias: 15, subs: [
      'Selador', 'Massa PVA', 'Pintura Interna', 'Pintura Externa', 'Textura / Grafiato'
    ]},
    { nome: 'Loucas e Metais', dias: 7, subs: [
      'Vasos Sanitarios', 'Pias / Lavatorios', 'Torneiras', 'Chuveiros', 'Acessorios Banheiro'
    ]},
    { nome: 'Acabamento Final', dias: 10, subs: [
      'Rodapes', 'Arremates Gerais', 'Calafete', 'Espelhos Eletricos'
    ]},
    { nome: 'Area Externa', dias: 15, subs: [
      'Muro', 'Portao', 'Calcada', 'Cisterna / Fossa', 'Paisagismo', 'Garagem'
    ]},
    { nome: 'Limpeza e Entrega', dias: 7, subs: [
      'Limpeza Final Bruta', 'Limpeza Final Fina', 'Vistoria Interna', 'Entrega de Chaves'
    ]}
  ],

  // ══════════════════════════════════════════════════════════
  // RENDER PRINCIPAL
  // ══════════════════════════════════════════════════════════

  async render() {
    const el = document.getElementById('cronograma-container');
    if (!el) return;

    // Skeleton
    el.innerHTML = '<div style="padding:32px 0;text-align:center;">'
      + '<div style="width:60%;height:14px;background:var(--bg3);border-radius:6px;margin:0 auto 12px;"></div>'
      + '<div style="width:40%;height:10px;background:var(--bg3);border-radius:6px;margin:0 auto 8px;"></div>'
      + '<div style="width:80%;height:200px;background:var(--bg3);border-radius:10px;margin:12px auto;"></div>'
      + '</div>';

    requestAnimationFrame(async () => {
      const obrasLista = typeof obras !== 'undefined' ? obras : [];

      el.innerHTML = '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px;">'
        + '<div style="flex:1;min-width:180px;" id="cron-filtro-wrap"></div>'
        + '<div style="display:flex;gap:4px;" id="cron-view-btns">'
          + '<button id="cron-vm-lista" onclick="CronogramaModule._setView(\'lista\')" style="padding:6px 12px;border-radius:8px;border:1px solid var(--primary);background:rgba(45,106,79,0.1);color:var(--primary);font-size:12px;cursor:pointer;">'
            + '<span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">list</span> Lista</button>'
          + '<button id="cron-vm-gantt" onclick="CronogramaModule._setView(\'gantt\')" style="padding:6px 12px;border-radius:8px;border:1px solid var(--borda);background:var(--bg2);color:var(--texto2);font-size:12px;cursor:pointer;">'
            + '<span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">view_timeline</span> Gantt</button>'
        + '</div>'
        + '<button onclick="CronogramaModule._toggleTodos()" style="padding:6px 12px;border-radius:8px;border:1px solid var(--borda);background:var(--bg2);color:var(--texto2);font-size:12px;cursor:pointer;" id="cron-btn-toggle">'
          + '<span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">unfold_more</span> Expandir</button>'
        + '<button onclick="CronogramaModule._gerarEtapas()" style="padding:6px 12px;border-radius:8px;border:1px solid var(--borda);background:var(--bg2);color:var(--texto2);font-size:12px;cursor:pointer;">'
          + '<span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">auto_fix_high</span> Gerar Padrao</button>'
        + '<button onclick="CronogramaModule._abrirModal()" class="btn-save" style="padding:8px 16px;font-size:12px;">'
          + '<span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">add</span> TAREFA</button>'
        + '</div>'
        + '<div id="cron-vazio" class="hidden" style="text-align:center;padding:60px 20px;color:var(--texto3);">'
          + '<span class="material-symbols-outlined" style="font-size:48px;color:var(--texto4);">calendar_month</span>'
          + '<div style="font-size:14px;margin:12px 0 6px;">Nenhuma tarefa no cronograma</div>'
          + '<div style="font-size:12px;">Clique em <strong>+ TAREFA</strong> para adicionar ou <strong>Gerar Padrao</strong> para criar etapas automaticamente</div>'
        + '</div>'
        + '<div id="cron-gantt-wrap" style="overflow-x:auto;display:none;margin-top:8px;border-radius:10px;border:1px solid var(--borda);"></div>'
        + '<div id="cron-lista" style="margin-top:8px;"></div>';

      // Autocomplete pra filtro de obra
      const filtroWrap = document.getElementById('cron-filtro-wrap');
      if (filtroWrap && obrasLista.length > 0) {
        filtroWrap.innerHTML = '<select id="cron-filtro-obra" onchange="CronogramaModule._filtrarObra()" style="width:100%;padding:10px 14px;background:var(--bg2);border:1px solid var(--borda);border-radius:10px;color:var(--texto);font-size:13px;outline:none;font-family:inherit;">'
          + '<option value="">Todas as obras</option>'
          + obrasLista.map(o => '<option value="' + o.id + '">' + esc(o.nome) + '</option>').join('')
          + '</select>';
      }

      await this._carregarTarefas();
    });
  },

  // ══════════════════════════════════════════════════════════
  // DADOS
  // ══════════════════════════════════════════════════════════

  async _carregarTarefas() {
    try {
      let query = '?order=ordem,data_inicio';
      if (this.obraFiltro) query += '&obra_id=eq.' + this.obraFiltro;
      const r = await sbGet('cronograma_tarefas', query);
      this.tarefas = Array.isArray(r) ? r : [];
    } catch (e) { this.tarefas = []; }

    // Atribuir cores por obra
    const obrasUnicas = [...new Set(this.tarefas.map(t => t.obra_id))];
    this._obraCores = {};
    obrasUnicas.forEach((obraId, i) => { this._obraCores[obraId] = i % this._CORES.length; });

    const vazio = document.getElementById('cron-vazio');
    if (this.tarefas.length === 0) {
      if (vazio) vazio.classList.remove('hidden');
    } else {
      if (vazio) vazio.classList.add('hidden');
    }

    if (this._view === 'gantt') this._renderGantt();
    else this._renderLista();
  },

  _calcProgresso(t) {
    const subs = t.subitens || [];
    if (subs.length === 0) return Number(t.progresso) || 0;
    return Math.round(subs.filter(s => s.feito).length / subs.length * 100);
  },

  // ══════════════════════════════════════════════════════════
  // VIEW: LISTA COM CHECKLIST
  // ══════════════════════════════════════════════════════════

  _renderLista() {
    const lista = document.getElementById('cron-lista');
    if (!lista) return;
    if (this.tarefas.length === 0) { lista.innerHTML = ''; return; }

    const obrasLista = typeof obras !== 'undefined' ? obras : [];
    const totalGeral = this.tarefas.reduce((a, t) => a + (t.subitens || []).length, 0);
    const feitosGeral = this.tarefas.reduce((a, t) => a + (t.subitens || []).filter(s => s.feito).length, 0);
    const progGeral = totalGeral > 0 ? Math.round(feitosGeral / totalGeral * 100) : 0;

    const rows = this.tarefas.map(t => {
      const obra = obrasLista.find(o => o.id === t.obra_id);
      const subs = t.subitens || [];
      const feitos = subs.filter(s => s.feito).length;
      const prog = subs.length > 0 ? Math.round(feitos / subs.length * 100) : Math.round(Number(t.progresso) || 0);
      const inicio = t.data_inicio ? new Date(t.data_inicio + 'T00:00:00').toLocaleDateString('pt-BR') : '';
      const fim = t.data_fim ? new Date(t.data_fim + 'T00:00:00').toLocaleDateString('pt-BR') : '';
      const aberto = this.expandido.has(t.id);
      const corIdx = this._obraCores[t.obra_id] || 0;
      const corObra = this._CORES[corIdx] || this._CORES[0];
      const corProg = prog >= 100 ? '#2D6A4F' : prog >= 50 ? '#B7791F' : prog > 0 ? '#E85D04' : '#dc2626';

      let subsHtml = '';
      if (aberto && subs.length > 0) {
        subsHtml = '<div style="padding:8px 12px 12px 32px;border-bottom:1px solid var(--borda);background:var(--bg2);">'
          + subs.map((s, i) =>
            '<label style="display:flex;align-items:center;gap:8px;padding:5px 0;cursor:pointer;' + (s.feito ? 'opacity:0.6;' : '') + '">'
            + '<input type="checkbox" ' + (s.feito ? 'checked' : '') + ' onchange="CronogramaModule._toggleSub(\'' + t.id + '\',' + i + ')" style="accent-color:var(--primary);width:16px;height:16px;cursor:pointer;">'
            + '<span style="font-size:13px;color:var(--texto);' + (s.feito ? 'text-decoration:line-through;' : '') + '">' + esc(s.nome) + '</span>'
            + '</label>'
          ).join('')
          + '<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--borda);display:flex;gap:6px;">'
            + '<button onclick="CronogramaModule._abrirModalAddSub(\'' + t.id + '\')" style="padding:4px 10px;border-radius:6px;border:1px solid rgba(45,106,79,0.2);background:rgba(45,106,79,0.06);color:var(--primary);font-size:11px;cursor:pointer;">'
              + '<span class="material-symbols-outlined" style="font-size:12px;vertical-align:middle;">add</span> Sub-item</button>'
          + '</div>'
          + '</div>';
      }

      return '<div style="border-bottom:' + (aberto ? 'none' : '1px solid var(--borda)') + ';">'
        + '<div style="display:flex;align-items:center;gap:8px;padding:10px 12px;cursor:pointer;flex-wrap:wrap;" onclick="CronogramaModule._toggleExpand(\'' + t.id + '\')">'
          + '<div style="width:4px;height:28px;border-radius:2px;background:' + corObra.bar + ';flex-shrink:0;"></div>'
          + '<span class="material-symbols-outlined" style="font-size:16px;color:var(--texto3);transition:transform 0.2s;transform:rotate(' + (aberto ? '90' : '0') + 'deg);">' + (subs.length ? 'chevron_right' : 'circle') + '</span>'
          + '<div style="flex:1;min-width:150px;">'
            + '<div style="font-size:13px;color:var(--texto);font-weight:600;">' + esc(t.nome) + '</div>'
            + '<div style="font-size:11px;color:' + corObra.label + ';">' + esc(obra?.nome || '') + ' <span style="color:var(--texto3);">' + inicio + ' \u2192 ' + fim + '</span></div>'
          + '</div>'
          + '<div style="min-width:100px;display:flex;align-items:center;gap:6px;">'
            + '<div style="flex:1;background:var(--bg3);border-radius:4px;height:6px;overflow:hidden;">'
              + '<div style="width:' + prog + '%;height:100%;background:' + corProg + ';border-radius:4px;transition:width 0.3s;"></div>'
            + '</div>'
            + '<span style="font-size:11px;color:' + corProg + ';font-weight:600;min-width:32px;text-align:right;">' + (subs.length ? feitos + '/' + subs.length : prog + '%') + '</span>'
          + '</div>'
          + '<div style="display:flex;gap:4px;" onclick="event.stopPropagation()">'
            + '<button onclick="CronogramaModule._abrirModal(\'' + t.id + '\')" style="padding:4px 10px;border-radius:6px;border:1px solid var(--borda);background:var(--bg2);color:var(--texto);font-size:11px;cursor:pointer;">'
              + '<span class="material-symbols-outlined" style="font-size:12px;vertical-align:middle;">edit</span></button>'
            + '<button onclick="CronogramaModule._excluir(\'' + t.id + '\')" style="padding:4px 10px;border-radius:6px;border:1px solid rgba(220,38,38,0.2);background:rgba(220,38,38,0.06);color:#dc2626;font-size:11px;cursor:pointer;">'
              + '<span class="material-symbols-outlined" style="font-size:12px;vertical-align:middle;">close</span></button>'
          + '</div>'
        + '</div>'
        + subsHtml
        + '</div>';
    }).join('');

    // Legenda cores por obra
    const legendaHtml = Object.entries(this._obraCores).map(function(entry) {
      const obraId = entry[0], idx = entry[1];
      const cor = CronogramaModule._CORES[idx];
      const obrasRef = typeof obras !== 'undefined' ? obras : [];
      const nome = obrasRef.find(function(o) { return o.id === obraId; })?.nome || '';
      return '<div style="display:flex;align-items:center;gap:4px;font-size:11px;color:' + cor.label + ';"><div style="width:10px;height:10px;border-radius:3px;background:' + cor.bar + ';"></div>' + esc(nome) + '</div>';
    }).join('');

    lista.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;padding-top:8px;">'
      + '<div style="font-size:10px;color:var(--texto3);letter-spacing:2px;font-weight:700;font-family:\'Space Grotesk\',sans-serif;">ETAPAS (' + this.tarefas.length + ')</div>'
      + (totalGeral > 0 ? '<div style="display:flex;align-items:center;gap:6px;">'
        + '<div style="width:80px;background:var(--bg3);border-radius:4px;height:6px;overflow:hidden;">'
          + '<div style="width:' + progGeral + '%;height:100%;background:var(--primary);border-radius:4px;"></div>'
        + '</div>'
        + '<span style="font-size:11px;color:var(--primary);font-weight:600;font-family:\'Space Grotesk\',sans-serif;">' + progGeral + '% geral</span>'
        + '</div>' : '')
      + '</div>'
      + '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:8px;">' + legendaHtml + '</div>'
      + '<div style="background:var(--bg2);border-radius:10px;border:1px solid var(--borda);overflow:hidden;">'
        + rows
      + '</div>';
  },

  // ══════════════════════════════════════════════════════════
  // VIEW: GANTT (Frappe Gantt com try/catch)
  // ══════════════════════════════════════════════════════════

  _renderGantt() {
    const wrap = document.getElementById('cron-gantt-wrap');
    const lista = document.getElementById('cron-lista');
    if (!wrap) return;

    try {
      if (typeof Gantt === 'undefined') {
        showToast('Biblioteca Gantt indisponivel. Verifique sua conexao.');
        this._view = 'lista';
        this._updateViewBtns();
        if (wrap) wrap.style.display = 'none';
        if (lista) lista.style.display = '';
        this._renderLista();
        return;
      }

      if (this.tarefas.length === 0) {
        wrap.style.display = 'none';
        return;
      }

      wrap.style.display = '';
      if (lista) lista.style.display = 'none';
      wrap.innerHTML = '';

      const tasks = this.tarefas.map(t => ({
        id: t.id,
        name: t.nome,
        start: t.data_inicio,
        end: t.data_fim,
        progress: this._calcProgresso(t),
        dependencies: t.dependencia || '',
        custom_class: 'cron-bar-' + (this._obraCores[t.obra_id] || 0)
      }));

      this._gantt = new Gantt(wrap, tasks, {
        view_mode: this.viewMode,
        language: 'pt-br',
        on_click: function(task) {
          CronogramaModule._abrirModal(task.id);
        },
        on_date_change: function(task, start, end) {
          CronogramaModule._atualizarDatas(task.id, start, end);
        },
        on_progress_change: function(task, progress) {
          CronogramaModule._atualizarProgresso(task.id, progress);
        }
      });

    } catch (e) {
      console.error('CronogramaModule Gantt erro:', e);
      showToast('Erro ao renderizar Gantt. Usando vista lista.');
      this._view = 'lista';
      this._updateViewBtns();
      if (wrap) wrap.style.display = 'none';
      if (lista) lista.style.display = '';
      this._renderLista();
    }
  },

  // ══════════════════════════════════════════════════════════
  // CONTROLES DE VIEW
  // ══════════════════════════════════════════════════════════

  _setView(mode) {
    this._view = mode;
    this._updateViewBtns();

    const wrap = document.getElementById('cron-gantt-wrap');
    const lista = document.getElementById('cron-lista');

    if (mode === 'gantt') {
      if (lista) lista.style.display = 'none';
      this._renderGantt();
    } else {
      if (wrap) wrap.style.display = 'none';
      if (lista) lista.style.display = '';
      this._renderLista();
    }
  },

  _updateViewBtns() {
    const btnLista = document.getElementById('cron-vm-lista');
    const btnGantt = document.getElementById('cron-vm-gantt');
    const isLista = this._view === 'lista';
    if (btnLista) {
      btnLista.style.borderColor = isLista ? 'var(--primary)' : 'var(--borda)';
      btnLista.style.background = isLista ? 'rgba(45,106,79,0.1)' : 'var(--bg2)';
      btnLista.style.color = isLista ? 'var(--primary)' : 'var(--texto2)';
    }
    if (btnGantt) {
      btnGantt.style.borderColor = !isLista ? 'var(--primary)' : 'var(--borda)';
      btnGantt.style.background = !isLista ? 'rgba(45,106,79,0.1)' : 'var(--bg2)';
      btnGantt.style.color = !isLista ? 'var(--primary)' : 'var(--texto2)';
    }
  },

  _setGanttMode(mode) {
    this.viewMode = mode;
    if (this._gantt) {
      try { this._gantt.change_view_mode(mode); } catch (e) {}
    }
  },

  _filtrarObra() {
    this.obraFiltro = document.getElementById('cron-filtro-obra')?.value || '';
    this._carregarTarefas();
  },

  _scrollHoje() {
    const wrap = document.getElementById('cron-gantt-wrap');
    if (!wrap) return;
    const highlight = wrap.querySelector('.today-highlight');
    if (highlight) {
      const x = Number(highlight.getAttribute('x')) || 0;
      wrap.scrollTo({ left: Math.max(x - 100, 0), behavior: 'smooth' });
    }
  },

  _toggleExpand(id) {
    if (this.expandido.has(id)) this.expandido.delete(id);
    else this.expandido.add(id);
    this._renderLista();
  },

  _toggleTodos() {
    const btn = document.getElementById('cron-btn-toggle');
    if (this.expandido.size > 0) {
      this.expandido.clear();
      if (btn) btn.innerHTML = '<span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">unfold_more</span> Expandir';
    } else {
      this.tarefas.forEach(t => { if ((t.subitens || []).length > 0) this.expandido.add(t.id); });
      if (btn) btn.innerHTML = '<span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">unfold_less</span> Recolher';
    }
    this._renderLista();
  },

  // ══════════════════════════════════════════════════════════
  // CHECKLIST ACTIONS
  // ══════════════════════════════════════════════════════════

  async _toggleSub(tarefaId, subIdx) {
    const t = this.tarefas.find(x => x.id === tarefaId);
    if (!t || !t.subitens || !t.subitens[subIdx]) return;

    t.subitens[subIdx].feito = !t.subitens[subIdx].feito;
    const prog = this._calcProgresso(t);
    t.progresso = prog;

    try {
      await sbPatch('cronograma_tarefas', '?id=eq.' + tarefaId, {
        subitens: t.subitens,
        progresso: prog
      });
    } catch (e) { showToast('Erro ao salvar'); }

    if (this._view === 'gantt' && this._gantt) {
      this._renderGantt();
    } else {
      this._renderLista();
    }
  },

  // Modal pra adicionar sub-item (substitui prompt())
  _abrirModalAddSub(tarefaId) {
    let overlay = document.getElementById('modal-cron-addsub');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'modal-cron-addsub';
      overlay.className = 'modal-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.onclick = function(e) { if (e.target === overlay) overlay.classList.add('hidden'); };
      const modal = document.createElement('div');
      modal.className = 'modal';
      modal.style.maxWidth = '400px';
      overlay.appendChild(modal);
      document.body.appendChild(overlay);
    }

    overlay.querySelector('.modal').innerHTML = '<div class="modal-title">'
      + '<span><span class="material-symbols-outlined" style="font-size:18px;vertical-align:middle;">playlist_add</span> NOVO SUB-ITEM</span>'
      + '<button class="modal-close" onclick="document.getElementById(\'modal-cron-addsub\').classList.add(\'hidden\')"><span class="material-symbols-outlined">close</span></button>'
      + '</div>'
      + '<div class="field"><label>NOME DO SUB-ITEM</label>'
        + '<input type="text" id="cron-addsub-nome" placeholder="Ex: Concretagem, Fiacao..." style="width:100%;">'
      + '</div>'
      + '<button class="btn-save" onclick="CronogramaModule._confirmarAddSub(\'' + tarefaId + '\')" style="width:100%;margin-top:8px;">ADICIONAR</button>';

    overlay.classList.remove('hidden');
    setTimeout(function() {
      const input = document.getElementById('cron-addsub-nome');
      if (input) input.focus();
    }, 100);
  },

  async _confirmarAddSub(tarefaId) {
    const nome = document.getElementById('cron-addsub-nome')?.value?.trim();
    if (!nome) { showToast('Informe o nome do sub-item'); return; }

    const t = this.tarefas.find(x => x.id === tarefaId);
    if (!t) return;

    if (!t.subitens) t.subitens = [];
    t.subitens.push({ nome: nome, feito: false });
    t.progresso = this._calcProgresso(t);

    try {
      await sbPatch('cronograma_tarefas', '?id=eq.' + tarefaId, {
        subitens: t.subitens,
        progresso: t.progresso
      });
      const overlay = document.getElementById('modal-cron-addsub');
      if (overlay) overlay.classList.add('hidden');
      this._renderLista();
    } catch (e) { showToast('Erro ao adicionar sub-item'); }
  },

  // ══════════════════════════════════════════════════════════
  // CRUD
  // ══════════════════════════════════════════════════════════

  async _atualizarDatas(id, start, end) {
    const inicio = start instanceof Date ? start.toISOString().split('T')[0] : start;
    const fim = end instanceof Date ? end.toISOString().split('T')[0] : end;
    try {
      await sbPatch('cronograma_tarefas', '?id=eq.' + id, { data_inicio: inicio, data_fim: fim });
      const t = this.tarefas.find(x => x.id === id);
      if (t) { t.data_inicio = inicio; t.data_fim = fim; }
    } catch (e) { showToast('Erro ao salvar datas'); }
  },

  async _atualizarProgresso(id, progress) {
    try {
      await sbPatch('cronograma_tarefas', '?id=eq.' + id, { progresso: Math.round(progress) });
      const t = this.tarefas.find(x => x.id === id);
      if (t) t.progresso = Math.round(progress);
    } catch (e) { showToast('Erro ao salvar progresso'); }
  },

  _abrirModal(editId) {
    const t = editId ? this.tarefas.find(x => x.id === editId) : null;
    const obrasLista = typeof obras !== 'undefined' ? obras : [];
    const obrasOpts = obrasLista.map(o => '<option value="' + o.id + '" ' + (t && t.obra_id === o.id ? 'selected' : '') + '>' + esc(o.nome) + '</option>').join('');

    const depOpts = this.tarefas
      .filter(x => x.id !== editId)
      .map(x => {
        const oNome = obrasLista.find(o => o.id === x.obra_id)?.nome || '';
        return '<option value="' + x.id + '" ' + (t && t.dependencia === x.id ? 'selected' : '') + '>' + (oNome ? esc(oNome) + ' \u2014 ' : '') + esc(x.nome) + '</option>';
      }).join('');

    const hoje = new Date().toISOString().split('T')[0];
    const em30 = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];

    // Sub-itens existentes
    const subsExist = t?.subitens || [];
    this._subsEdit = subsExist.map(s => ({ nome: s.nome, feito: s.feito }));

    let subsHtml = '';
    if (subsExist.length > 0) {
      subsHtml = '<div style="border-top:1px solid var(--borda);margin:10px 0 6px;padding-top:8px;">'
        + '<div style="font-size:10px;color:var(--texto3);letter-spacing:2px;font-weight:700;margin-bottom:6px;font-family:\'Space Grotesk\',sans-serif;">SUB-ITENS (' + subsExist.length + ')</div>'
        + '<div id="cron-modal-subs" style="max-height:200px;overflow-y:auto;">'
          + this._renderSubsModal()
        + '</div>'
        + '</div>';
    }

    const html = '<div class="modal-title">'
      + '<span><span class="material-symbols-outlined" style="font-size:18px;vertical-align:middle;">' + (t ? 'edit' : 'calendar_month') + '</span> ' + (t ? 'EDITAR TAREFA' : 'NOVA TAREFA') + '</span>'
      + '<button class="modal-close" onclick="fecharModal(\'cron-tarefa\')"><span class="material-symbols-outlined">close</span></button>'
      + '</div>'
      + '<input type="hidden" id="cron-edit-id" value="' + (editId || '') + '">'
      + '<div class="field"><label>OBRA</label>'
        + '<select id="cron-obra" style="width:100%;padding:10px 14px;background:var(--bg2);border:1px solid var(--borda);border-radius:10px;color:var(--texto);font-size:13px;outline:none;font-family:inherit;">'
          + '<option value="">Selecione a obra</option>' + obrasOpts
        + '</select>'
      + '</div>'
      + '<div class="field"><label>TAREFA / ETAPA</label><input type="text" id="cron-nome" placeholder="Ex: Fundacao, Alvenaria, Cobertura" value="' + (t ? esc(t.nome) : '') + '"></div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">'
        + '<div class="field"><label>INICIO</label><input type="date" id="cron-inicio" value="' + (t ? t.data_inicio : hoje) + '"></div>'
        + '<div class="field"><label>FIM</label><input type="date" id="cron-fim" value="' + (t ? t.data_fim : em30) + '"></div>'
      + '</div>'
      + '<div class="field"><label>DEPENDE DE</label>'
        + '<select id="cron-dep" style="width:100%;padding:10px 14px;background:var(--bg2);border:1px solid var(--borda);border-radius:10px;color:var(--texto);font-size:13px;outline:none;font-family:inherit;">'
          + '<option value="">Nenhuma</option>' + depOpts
        + '</select>'
      + '</div>'
      + subsHtml
      + '<div style="display:flex;gap:8px;margin-top:8px;">'
        + '<button class="btn-save" onclick="CronogramaModule._salvar()" style="flex:1;">SALVAR</button>'
        + (t ? '<button class="btn-outline" onclick="CronogramaModule._excluir(\'' + editId + '\')" style="color:#dc2626;border-color:rgba(220,38,38,0.3);">'
          + '<span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">delete</span> EXCLUIR</button>' : '')
        + '<button class="btn-outline" onclick="fecharModal(\'cron-tarefa\')">CANCELAR</button>'
      + '</div>';

    let overlay = document.getElementById('modal-cron-tarefa');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'modal-cron-tarefa';
      overlay.className = 'modal-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.onclick = function(e) { if (e.target === overlay) fecharModal('cron-tarefa'); };
      const modal = document.createElement('div');
      modal.className = 'modal';
      modal.style.maxWidth = '500px';
      overlay.appendChild(modal);
      document.body.appendChild(overlay);
    }
    overlay.querySelector('.modal').innerHTML = html;
    overlay.classList.remove('hidden');
  },

  _renderSubsModal() {
    return this._subsEdit.map(function(s, i) {
      return '<div style="display:flex;align-items:center;gap:6px;padding:4px 0;">'
        + '<input type="text" value="' + esc(s.nome) + '" id="cron-sub-' + i + '" style="flex:1;padding:6px 10px;background:var(--bg2);border:1px solid var(--borda);border-radius:6px;color:var(--texto);font-size:12px;outline:none;font-family:inherit;">'
        + '<button onclick="CronogramaModule._removerSubModal(' + i + ')" style="padding:4px 8px;border-radius:4px;border:1px solid rgba(220,38,38,0.2);background:rgba(220,38,38,0.06);color:#dc2626;font-size:11px;cursor:pointer;">'
          + '<span class="material-symbols-outlined" style="font-size:12px;">close</span></button>'
        + '</div>';
    }).join('');
  },

  _removerSubModal(idx) {
    // Salvar nomes editados primeiro
    this._subsEdit.forEach(function(s, i) {
      const input = document.getElementById('cron-sub-' + i);
      if (input) s.nome = input.value.trim();
    });
    this._subsEdit.splice(idx, 1);
    const container = document.getElementById('cron-modal-subs');
    if (container) container.innerHTML = this._renderSubsModal();
  },

  async _salvar() {
    const editId = document.getElementById('cron-edit-id')?.value;
    const obra = document.getElementById('cron-obra')?.value;
    const nome = document.getElementById('cron-nome')?.value?.trim();
    const inicio = document.getElementById('cron-inicio')?.value;
    const fim = document.getElementById('cron-fim')?.value;
    const dep = document.getElementById('cron-dep')?.value || null;

    if (!obra || !nome || !inicio || !fim) { showToast('Preencha obra, tarefa, inicio e fim'); return; }
    if (fim < inicio) { showToast('Data fim deve ser apos inicio'); return; }

    // Atualizar nomes editados
    const subs = this._subsEdit.map(function(s, i) {
      const input = document.getElementById('cron-sub-' + i);
      return { nome: input ? input.value.trim() : s.nome, feito: s.feito };
    }).filter(s => s.nome);

    const prog = subs.length > 0 ? Math.round(subs.filter(s => s.feito).length / subs.length * 100) : 0;

    const dados = {
      obra_id: obra,
      nome: nome,
      data_inicio: inicio,
      data_fim: fim,
      progresso: prog,
      dependencia: dep,
      subitens: subs
    };

    try {
      if (editId) {
        await sbPatch('cronograma_tarefas', '?id=eq.' + editId, dados);
        showToast('Tarefa atualizada');
      } else {
        await sbPost('cronograma_tarefas', dados);
        showToast('Tarefa criada');
      }
      fecharModal('cron-tarefa');
      await this._carregarTarefas();
    } catch (e) {
      showToast('Erro ao salvar tarefa');
    }
  },

  async _excluir(id) {
    confirmar('Excluir esta tarefa do cronograma?', async function() {
      try {
        await sbDelete('cronograma_tarefas', '?id=eq.' + id);
        showToast('Tarefa excluida');
        try { fecharModal('cron-tarefa'); } catch (e) {}
        await CronogramaModule._carregarTarefas();
      } catch (e) { showToast('Erro ao excluir'); }
    });
  },

  // ══════════════════════════════════════════════════════════
  // GERADOR DE ETAPAS PADRAO
  // ══════════════════════════════════════════════════════════

  _gerarEtapas() {
    const obraId = document.getElementById('cron-filtro-obra')?.value;
    if (!obraId) { showToast('Selecione uma obra primeiro'); return; }

    const obrasLista = typeof obras !== 'undefined' ? obras : [];
    const obra = obrasLista.find(o => o.id === obraId);
    if (!obra) return;

    const existentes = this.tarefas.filter(t => t.obra_id === obraId);
    if (existentes.length > 0) {
      confirmar('Ja existem ' + existentes.length + ' tarefas pra ' + obra.nome + '. Adicionar etapas padrao mesmo assim?', function() {
        CronogramaModule._abrirModalEtapas(obraId);
      });
    } else {
      this._abrirModalEtapas(obraId);
    }
  },

  _abrirModalEtapas(obraId) {
    const obrasLista = typeof obras !== 'undefined' ? obras : [];
    const obra = obrasLista.find(o => o.id === obraId);
    const hoje = new Date().toISOString().split('T')[0];

    const etapasHtml = this._ETAPAS_PADRAO.map(function(e, i) {
      return '<div style="border-bottom:1px solid var(--borda);padding:6px 0;">'
        + '<div style="display:flex;align-items:center;gap:8px;">'
          + '<input type="checkbox" id="cron-et-' + i + '" checked style="accent-color:var(--primary);">'
          + '<label for="cron-et-' + i + '" style="flex:1;font-size:13px;color:var(--texto);cursor:pointer;font-weight:500;">' + e.nome + '</label>'
          + '<span style="font-size:11px;color:var(--texto3);font-family:\'Space Grotesk\',sans-serif;">' + e.dias + 'd \u00B7 ' + e.subs.length + ' itens</span>'
        + '</div>'
        + '<div style="padding-left:28px;font-size:11px;color:var(--texto4);margin-top:2px;">' + e.subs.join(' \u00B7 ') + '</div>'
        + '</div>';
    }).join('');

    const html = '<div class="modal-title">'
      + '<span><span class="material-symbols-outlined" style="font-size:18px;vertical-align:middle;">auto_fix_high</span> GERAR CRONOGRAMA COMPLETO</span>'
      + '<button class="modal-close" onclick="fecharModal(\'cron-etapas\')"><span class="material-symbols-outlined">close</span></button>'
      + '</div>'
      + '<div style="font-size:12px;color:var(--texto2);margin-bottom:12px;padding:8px;background:rgba(45,106,79,0.05);border:1px solid rgba(45,106,79,0.1);border-radius:8px;">'
        + 'Gerar ' + CronogramaModule._ETAPAS_PADRAO.length + ' etapas com sub-itens para <strong>' + esc(obra?.nome || '') + '</strong>.<br>'
        + 'Cada etapa vem com checklist de servicos. Progresso calcula automaticamente.'
      + '</div>'
      + '<div class="field"><label>DATA DE INICIO DA OBRA</label><input type="date" id="cron-etapas-inicio" value="' + hoje + '"></div>'
      + '<div style="max-height:350px;overflow-y:auto;margin:8px 0;">' + etapasHtml + '</div>'
      + '<button class="btn-save" onclick="CronogramaModule._salvarEtapas(\'' + obraId + '\')" style="width:100%;">GERAR CRONOGRAMA</button>'
      + '<button class="btn-outline" onclick="fecharModal(\'cron-etapas\')" style="margin-top:6px;width:100%;">CANCELAR</button>';

    let overlay = document.getElementById('modal-cron-etapas');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'modal-cron-etapas';
      overlay.className = 'modal-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.onclick = function(e) { if (e.target === overlay) fecharModal('cron-etapas'); };
      const modal = document.createElement('div');
      modal.className = 'modal';
      modal.style.maxWidth = '560px';
      overlay.appendChild(modal);
      document.body.appendChild(overlay);
    }
    overlay.querySelector('.modal').innerHTML = html;
    overlay.classList.remove('hidden');
  },

  async _salvarEtapas(obraId) {
    const inicioStr = document.getElementById('cron-etapas-inicio')?.value;
    if (!inicioStr) { showToast('Informe a data de inicio'); return; }

    let dataAtual = new Date(inicioStr + 'T00:00:00');
    let criadas = 0;
    let anteriorId = null;

    for (let i = 0; i < this._ETAPAS_PADRAO.length; i++) {
      const check = document.getElementById('cron-et-' + i);
      if (!check?.checked) continue;

      const etapa = this._ETAPAS_PADRAO[i];
      const inicio = dataAtual.toISOString().split('T')[0];
      dataAtual.setDate(dataAtual.getDate() + etapa.dias);
      const fim = dataAtual.toISOString().split('T')[0];

      const subitens = etapa.subs.map(s => ({ nome: s, feito: false }));

      try {
        const r = await sbPost('cronograma_tarefas', {
          obra_id: obraId,
          nome: etapa.nome,
          data_inicio: inicio,
          data_fim: fim,
          progresso: 0,
          dependencia: anteriorId,
          ordem: i,
          subitens: subitens
        });
        if (r && r[0]?.id) anteriorId = r[0].id;
        criadas++;
      } catch (e) { console.error('Erro etapa', etapa.nome, e); }
    }

    showToast(criadas + ' etapas criadas com sub-itens');
    fecharModal('cron-etapas');
    await this._carregarTarefas();
  },

  // ══════════════════════════════════════════════════════════
  // PDF — delega pro PdfModule centralizado
  // ══════════════════════════════════════════════════════════

  gerarPDF() {
    if (typeof PdfModule !== 'undefined' && PdfModule.gerarCronograma) {
      PdfModule.gerarCronograma(this.tarefas, this.obraFiltro);
    } else {
      showToast('Modulo PDF indisponivel');
    }
  }
};

// Registrar no viewRegistry
if (typeof viewRegistry !== 'undefined') {
  viewRegistry.register('cronograma', function() { return CronogramaModule.render(); });
}
