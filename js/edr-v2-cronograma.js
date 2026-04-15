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
        + '<button onclick="CronogramaModule._abrirModalImportarPCI()" style="padding:6px 12px;border-radius:8px;border:1px solid var(--primary);background:rgba(45,106,79,0.08);color:var(--primary);font-size:12px;cursor:pointer;font-weight:600;">'
          + '<span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">upload_file</span> Importar PCI</button>'
        + '<button onclick="CronogramaModule._syncComPCI()" id="cron-btn-sync-pci" style="padding:6px 12px;border-radius:8px;border:1px solid var(--borda);background:var(--bg2);color:var(--texto2);font-size:12px;cursor:pointer;">'
          + '<span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">sync</span> Sync PCI</button>'
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

    const _renderRow = (t, mostrarObra) => {
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
      if (aberto) {
        subsHtml = '<div style="padding:8px 12px 12px 32px;border-bottom:1px solid var(--borda);background:var(--bg2);">'
          + (subs.length ? subs.map((s, i) =>
            '<label style="display:flex;align-items:center;gap:8px;padding:5px 0;cursor:pointer;' + (s.feito ? 'opacity:0.6;' : '') + '">'
            + '<input type="checkbox" ' + (s.feito ? 'checked' : '') + ' onchange="CronogramaModule._toggleSub(\'' + t.id + '\',' + i + ')" style="accent-color:var(--primary);width:16px;height:16px;cursor:pointer;">'
            + '<span style="font-size:13px;color:var(--texto);' + (s.feito ? 'text-decoration:line-through;' : '') + '">' + esc(s.nome) + '</span>'
            + '</label>'
          ).join('') : '<p style="font-size:12px;color:var(--texto3);margin:0 0 8px;">Nenhum sub-item ainda.</p>')
          + '<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--borda);display:flex;gap:6px;">'
            + '<button onclick="CronogramaModule._abrirModalAddSub(\'' + t.id + '\')" style="padding:4px 10px;border-radius:6px;border:1px solid rgba(45,106,79,0.2);background:rgba(45,106,79,0.06);color:var(--primary);font-size:11px;cursor:pointer;">'
              + '<span class="material-symbols-outlined" style="font-size:12px;vertical-align:middle;">add</span> Sub-item</button>'
          + '</div>'
          + '</div>';
      }

      // Sempre mostra chevron para expandir (mesmo sem subitens)
      const iconeEtapa = '<span class="material-symbols-outlined" style="font-size:16px;color:var(--texto3);transition:transform 0.2s;transform:rotate(' + (aberto ? '90' : '0') + 'deg);">chevron_right</span>';

      // Subinfo: omite nome da obra se já está no grupo
      const hoje = new Date().toISOString().split('T')[0];
      const atrasado = t.data_fim && t.data_fim < hoje && prog < 100;
      const statusTag = atrasado
        ? ' <span style="color:#dc2626;font-size:10px;font-weight:700;background:rgba(220,38,38,0.08);padding:1px 5px;border-radius:4px;">ATRASADO</span>'
        : '';
      const subinfo = mostrarObra
        ? esc(obra?.nome || '') + ' <span style="color:var(--texto3);">' + inicio + ' \u2192 ' + fim + '</span>' + statusTag
        : '<span style="color:var(--texto3);">' + inicio + ' \u2192 ' + fim + '</span>' + statusTag;

      return '<div style="border-bottom:' + (aberto ? 'none' : '1px solid var(--borda)') + ';">'
        + '<div style="display:flex;align-items:center;gap:8px;padding:10px 12px;cursor:pointer;flex-wrap:wrap;" onclick="CronogramaModule._toggleExpand(\'' + t.id + '\')">'
          + '<div style="width:4px;height:28px;border-radius:2px;background:' + corObra.bar + ';flex-shrink:0;"></div>'
          + iconeEtapa
          + '<div style="flex:1;min-width:150px;">'
            + '<div style="font-size:13px;color:var(--texto);font-weight:600;">' + esc(t.nome) + '</div>'
            + '<div style="font-size:11px;color:' + corObra.label + ';">' + subinfo + '</div>'
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
    };

    // BUG07: agrupar por obra quando sem filtro e ha multiplas obras
    const obrasUnicasNaLista = [...new Set(this.tarefas.map(t => t.obra_id))];
    let rows = '';
    if (!this.obraFiltro && obrasUnicasNaLista.length > 1) {
      obrasUnicasNaLista.forEach(obraId => {
        const obra = obrasLista.find(o => o.id === obraId);
        const tarefasObra = this.tarefas.filter(t => t.obra_id === obraId);
        const corIdx = this._obraCores[obraId] || 0;
        const cor = this._CORES[corIdx] || this._CORES[0];
        const totalO = tarefasObra.reduce((a, t) => a + (t.subitens || []).length, 0);
        const feitosO = tarefasObra.reduce((a, t) => a + (t.subitens || []).filter(s => s.feito).length, 0);
        const progO = totalO > 0 ? Math.round(feitosO / totalO * 100) : 0;
        rows += '<div style="border-bottom:2px solid var(--borda);margin-top:8px;">'
          + '<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:rgba(0,0,0,0.03);">'
            + '<div style="width:10px;height:10px;border-radius:3px;background:' + cor.bar + ';flex-shrink:0;"></div>'
            + '<span style="font-size:11px;font-weight:700;color:var(--texto2);letter-spacing:1px;font-family:\'Space Grotesk\',sans-serif;">' + esc(obra?.nome || 'SEM OBRA') + '</span>'
            + '<div style="flex:1;background:var(--bg3);border-radius:4px;height:4px;overflow:hidden;max-width:80px;">'
              + '<div style="width:' + progO + '%;height:100%;background:' + cor.bar + ';border-radius:4px;"></div>'
            + '</div>'
            + '<span style="font-size:10px;color:' + cor.label + ';font-weight:600;">' + progO + '%</span>'
          + '</div>'
          + tarefasObra.map(t => _renderRow(t, false)).join('')
          + '</div>';
      });
    } else {
      rows = this.tarefas.map(t => _renderRow(t, true)).join('');
    }

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
      + ((!this.obraFiltro && obrasUnicasNaLista.length > 1) ? '' : '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:8px;">' + legendaHtml + '</div>')
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

      const tasks = this.tarefas
        .filter(t => t.data_inicio && t.data_fim && t.data_inicio <= t.data_fim)
        .map(t => ({
          id: t.id,
          name: t.nome,
          start: t.data_inicio,
          end: t.data_fim,
          progress: this._calcProgresso(t),
          dependencies: t.dependencia || '',
          custom_class: 'cron-bar-' + (this._obraCores[t.obra_id] || 0)
        }));

      if (tasks.length === 0) {
        wrap.innerHTML = '<div style="padding:40px;text-align:center;color:var(--texto3);">'
          + '<span class="material-symbols-outlined" style="font-size:40px;color:var(--texto4);">date_range</span>'
          + '<div style="font-size:13px;margin-top:8px;">Nenhuma tarefa com datas validas para o Gantt.</div>'
          + '<div style="font-size:11px;margin-top:4px;">Edite as tarefas e defina datas de inicio e fim.</div>'
          + '</div>';
        return;
      }

      this._gantt = new Gantt(wrap, tasks, {
        view_mode: this.viewMode,
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
  // SYNC COM PCI
  // ══════════════════════════════════════════════════════════

  async _syncComPCI() {
    const btn = document.getElementById('cron-btn-sync-pci');
    if (btn) btn.disabled = true;
    try {
      // Garantir dados PCI carregados
      if (typeof PciModule === 'undefined') { showToast('Módulo PCI não disponível'); return; }
      if (!PciModule.medicoes.length || !PciModule.itens.length) {
        await PciModule._carregar();
      }

      // Descobrir obras únicas no cronograma atual
      const obraIds = [...new Set(this.tarefas.map(t => t.obra_id))];
      let atualizados = 0;

      for (const obraId of obraIds) {
        const med = PciModule.medicoes.find(function(m) { return m.obra_id === obraId; });
        if (!med) continue; // obra sem PCI, pula

        const tarefasObra = this.tarefas.filter(function(t) { return t.obra_id === obraId; });

        for (const tarefa of tarefasObra) {
          // Buscar itens da PCI para esta categoria
          const itensCat = PciModule.itens.filter(function(it) {
            return it.medicao_id === med.id && it.categoria_nome === tarefa.nome && !it.nao_aplicavel;
          });

          if (itensCat.length) {
            const subitens = itensCat.map(function(it) {
              return { nome: it.sub_servico_descricao || it.descricao || '', feito: !!it.executado };
            });
            const progresso = Math.round(subitens.filter(function(s) { return s.feito; }).length / subitens.length * 100);

            await sbPatch('cronograma_tarefas', '?id=eq.' + tarefa.id, {
              subitens: subitens,
              progresso: progresso
            });
            tarefa.subitens = subitens;
            tarefa.progresso = progresso;
            atualizados++;
          } else {
            // Sem itens individuais — usar % calculada pela categoria
            const calc = PciModule._calcCatExec(med.id, tarefa.nome);
            if (calc && calc.pct > 0) {
              await sbPatch('cronograma_tarefas', '?id=eq.' + tarefa.id, { progresso: calc.pct });
              tarefa.progresso = calc.pct;
              atualizados++;
            }
          }
        }
      }

      this._renderLista();
      showToast(atualizados > 0 ? atualizados + ' tarefa(s) sincronizada(s) com a PCI' : 'Nenhuma tarefa atualizada — verifique se a PCI tem dados');
    } catch(e) {
      console.error('[SYNC-PCI]', e);
      showToast('Erro ao sincronizar com PCI');
    } finally {
      if (btn) btn.disabled = false;
    }
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
      overlay.onclick = function(e) { if (e.target === overlay) overlay.classList.remove('active'); };
      const modal = document.createElement('div');
      modal.className = 'modal-box';
      modal.style.maxWidth = '400px';
      overlay.appendChild(modal);
      document.body.appendChild(overlay);
    }

    overlay.querySelector('.modal-box').innerHTML = '<div class="modal-title">'
      + '<span><span class="material-symbols-outlined" style="font-size:18px;vertical-align:middle;">playlist_add</span> NOVO SUB-ITEM</span>'
      + '<button class="modal-close" onclick="document.getElementById(\'modal-cron-addsub\').classList.remove(\'active\')"><span class="material-symbols-outlined">close</span></button>'
      + '</div>'
      + '<div class="field"><label>NOME DO SUB-ITEM</label>'
        + '<input type="text" id="cron-addsub-nome" placeholder="Ex: Concretagem, Fiacao..." style="width:100%;">'
      + '</div>'
      + '<button class="btn-save" onclick="CronogramaModule._confirmarAddSub(\'' + tarefaId + '\')" style="width:100%;margin-top:8px;">ADICIONAR</button>';

    overlay.classList.add('active');
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
      if (overlay) overlay.classList.remove('active');
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
      modal.className = 'modal-box';
      modal.style.maxWidth = '500px';
      overlay.appendChild(modal);
      document.body.appendChild(overlay);
    }
    overlay.querySelector('.modal-box').innerHTML = html;
    overlay.classList.add('active');
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
  // IMPORTAÇÃO DE PCI (XLSB da Caixa)
  // ══════════════════════════════════════════════════════════

  _pdfFile: null,

  _abrirModalImportarPCI() {
    const obrasLista = typeof obras !== 'undefined' ? obras : [];
    const hoje = new Date().toISOString().split('T')[0];
    const obraFiltroAtual = document.getElementById('cron-filtro-obra')?.value || '';

    const obraOpts = obrasLista.map(function(o) {
      return '<option value="' + o.id + '"' + (o.id == obraFiltroAtual ? ' selected' : '') + '>' + esc(o.nome) + '</option>';
    }).join('');

    const pciLista = (typeof obras !== 'undefined' ? obras : []).filter(function(o) { return !o.arquivada; });
    const pciOpts = pciLista.map(function(p) {
      return '<option value="' + p.id + '">' + esc(p.nome) + '</option>';
    }).join('');

    const html = '<div class="modal-title">'
      + '<span><span class="material-symbols-outlined" style="font-size:18px;vertical-align:middle;">upload_file</span> IMPORTAR PCI</span>'
      + '<button class="modal-close" onclick="fecharModal(\'cron-import-pci\')"><span class="material-symbols-outlined">close</span></button>'
      + '</div>'
      + '<div class="field"><label>OBRA (no sistema)</label>'
        + '<select id="imp-obra"><option value="">Selecione a obra</option>' + obraOpts + '</select>'
      + '</div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">'
        + '<div class="field"><label>DATA DE INICIO</label><input type="date" id="imp-inicio" value="' + hoje + '"></div>'
        + '<div class="field"><label>DATA DE ENTREGA</label><input type="date" id="imp-fim"></div>'
      + '</div>'
      + '<div class="field"><label>QUAL PCI ESTA IMPORTANDO</label>'
        + '<select id="imp-pci"><option value="">Selecione</option>' + pciOpts + '</select>'
      + '</div>'
      + '<div class="field"><label>ARQUIVO XLSB DA CAIXA</label>'
        + '<div id="imp-area" onclick="document.getElementById(\'imp-file\').click()" style="border:2px dashed var(--border);border-radius:10px;padding:20px;text-align:center;cursor:pointer;transition:border-color .2s;">'
          + '<span class="material-symbols-outlined" style="font-size:36px;color:var(--text-tertiary);">upload_file</span>'
          + '<div id="imp-nome" style="font-size:12px;color:var(--text-secondary);margin-top:6px;">Clique para selecionar o .xlsb</div>'
        + '</div>'
        + '<input type="file" id="imp-file" accept=".xlsb,.xlsx,.xls" style="display:none;" onchange="CronogramaModule._onArquivoSelecionado(this)">'
      + '</div>'
      + '<button class="btn-save" id="imp-btn" onclick="CronogramaModule._processarImportacaoPCI()" disabled>IMPORTAR E GERAR CRONOGRAMA</button>'
      + '<button class="btn-outline" onclick="fecharModal(\'cron-import-pci\')">CANCELAR</button>';

    let overlay = document.getElementById('modal-cron-import-pci');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'modal-cron-import-pci';
      overlay.className = 'modal-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.onclick = function(e) { if (e.target === overlay) fecharModal('cron-import-pci'); };
      const modal = document.createElement('div');
      modal.className = 'modal-box';
      modal.style.maxWidth = '500px';
      overlay.appendChild(modal);
      document.body.appendChild(overlay);
    }
    overlay.querySelector('.modal-box').innerHTML = html;
    overlay.classList.add('active');
    CronogramaModule._arquivoPCI = null;
  },

  _onArquivoSelecionado(input) {
    const file = input.files[0];
    if (!file) return;
    CronogramaModule._arquivoPCI = file;
    document.getElementById('imp-nome').textContent = file.name;
    document.getElementById('imp-area').style.borderColor = 'var(--primary)';
    document.getElementById('imp-btn').disabled = false;
  },

  async _carregarSheetJS() {
    if (window.XLSX) return;
    await new Promise(function(resolve, reject) {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  },

  _extrairPesosDoPlanilha(workbook) {
    console.log('[PCI Import] Abas encontradas:', workbook.SheetNames);
    const ws = workbook.Sheets['Proposta_Constr_Individual'];
    if (!ws) {
      console.warn('[PCI Import] Aba Proposta_Constr_Individual nao encontrada');
      return null;
    }
    // Coluna X (índice 23), linhas 120-139 (índice 119-138)
    const pesos = [];
    for (let row = 119; row <= 138; row++) {
      const addr = 'X' + (row + 1);
      const cell = ws[addr];
      pesos.push(cell && typeof cell.v === 'number' ? Math.round(cell.v * 100) / 100 : 0);
    }
    const soma = pesos.reduce(function(a, b) { return a + b; }, 0);
    console.log('[PCI Import] Pesos lidos:', pesos, '| Soma:', soma.toFixed(2));
    if (soma < 50 || soma > 150) {
      console.warn('[PCI Import] Soma fora do intervalo esperado (50-150):', soma.toFixed(2));
      return null;
    }
    return pesos;
  },

  async _processarImportacaoPCI() {
    const obraId = document.getElementById('imp-obra')?.value;
    const inicioStr = document.getElementById('imp-inicio')?.value;
    const fimStr = document.getElementById('imp-fim')?.value;
    const pciId = document.getElementById('imp-pci')?.value;
    const file = CronogramaModule._arquivoPCI;

    if (!obraId) { showToast('Selecione a obra'); return; }
    if (!inicioStr) { showToast('Informe a data de inicio'); return; }
    if (!fimStr) { showToast('Informe a data de entrega'); return; }
    if (fimStr <= inicioStr) { showToast('Data de entrega deve ser apos o inicio'); return; }
    if (!pciId) { showToast('Selecione qual PCI esta importando'); return; }
    if (!file) { showToast('Selecione o arquivo XLSB'); return; }

    const btn = document.getElementById('imp-btn');
    btn.disabled = true;
    btn.textContent = 'Lendo planilha...';

    try {
      await CronogramaModule._carregarSheetJS();
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const pesos = CronogramaModule._extrairPesosDoPlanilha(wb);

      if (!pesos) {
        showToast('Nao foi possivel ler os pesos da planilha. Verifique se e o arquivo correto.');
        btn.disabled = false;
        btn.textContent = 'IMPORTAR E GERAR CRONOGRAMA';
        return;
      }

      btn.textContent = 'Gerando...';
      await CronogramaModule._gerarDeImportacaoPCI(obraId, pciId, pesos, inicioStr, fimStr);
      fecharModal('cron-import-pci');
      showToast('PCI importada e cronograma gerado!');
      await CronogramaModule._carregarTarefas();
    } catch (e) {
      console.error('Erro importando PCI:', e);
      showToast('Erro ao processar o arquivo');
      btn.disabled = false;
      btn.textContent = 'IMPORTAR E GERAR CRONOGRAMA';
    }
  },

  async _gerarDeImportacaoPCI(obraId, pciId, pesos, inicioStr, fimStr) {
    const tInicio = new Date(inicioStr + 'T00:00:00');
    const tFim = new Date(fimStr + 'T00:00:00');
    const totalDias = Math.round((tFim - tInicio) / 86400000);
    const totalPeso = pesos.reduce(function(a, b) { return a + b; }, 0);

    // Limpar tarefas existentes da obra antes de regerar
    await sbDelete('cronograma_tarefas', '?obra_id=eq.' + obraId);

    // Garantir que dados da PCI estejam carregados
    if (typeof PciModule !== 'undefined' && !PciModule.medicoes.length) {
      await PciModule._carregar();
    }

    // pciId vem como obra_id — resolver para pci_medicao.id
    var medicaoId = null;
    if (typeof PciModule !== 'undefined' && pciId) {
      var med = PciModule.medicoes.find(function(m) { return m.obra_id === pciId; });
      medicaoId = med ? med.id : null;
    }

    // Criar tarefas do cronograma
    let dataAtual = new Date(tInicio);
    let anteriorId = null;
    let criadas = 0;
    const etapas = typeof PciModule !== 'undefined'
      ? (PciModule.categorias && PciModule.categorias.length ? PciModule.categorias : PciModule._CATS)
      : [];

    for (let i = 0; i < 20; i++) {
      const peso = pesos[i] || 0;
      if (!peso) continue;
      const fase = etapas[i] || { nome: 'Fase ' + (i + 1) };
      const dias = Math.max(1, Math.round((peso / totalPeso) * totalDias));
      const dInicio = dataAtual.toISOString().split('T')[0];
      dataAtual.setDate(dataAtual.getDate() + dias);
      if (dataAtual > tFim) dataAtual = new Date(tFim);
      const dFim = dataAtual.toISOString().split('T')[0];

      // Progresso real da PCI
      var progresso = 0;
      if (medicaoId && fase.nome) {
        progresso = PciModule._calcCatExec(medicaoId, fase.nome).pct || 0;
      }

      // Subitens: itens reais da medição → fallback template
      var subitens = [];
      if (medicaoId && fase.nome) {
        var itensCat = PciModule.itens.filter(function(it) {
          return it.medicao_id === medicaoId && it.categoria_nome === fase.nome && !it.nao_aplicavel;
        });
        if (itensCat.length) {
          subitens = itensCat.map(function(it) { return { nome: it.sub_servico_descricao || it.descricao || '', feito: !!it.executado }; });
        }
      }
      if (!subitens.length && typeof PciModule !== 'undefined' && fase.id) {
        var subsFonte = (PciModule.subServicos && PciModule.subServicos.length) ? PciModule.subServicos : (PciModule._SUBS || []);
        subitens = subsFonte.filter(function(s) { return s.categoria_id === fase.id; })
          .map(function(s) { return { nome: s.descricao, feito: false }; });
      }

      try {
        const r = await sbPost('cronograma_tarefas', {
          obra_id: obraId, nome: fase.nome, data_inicio: dInicio, data_fim: dFim,
          progresso: progresso, dependencia: anteriorId, ordem: i, subitens: subitens
        });
        if (r && r.id) anteriorId = r.id;
        criadas++;
      } catch (e) { console.error('Erro etapa', fase.nome, e); }
    }

    // (mapeamento PCI-obra removido — tracker_sync sem RLS)
  },

  // ══════════════════════════════════════════════════════════
  // GERADOR DE ETAPAS PADRAO
  // ══════════════════════════════════════════════════════════

  _gerarEtapas() {
    this._abrirModalEtapas();
  },

  _abrirModalEtapas() {
    const obrasLista = typeof obras !== 'undefined' ? obras : [];
    const hoje = new Date().toISOString().split('T')[0];

    // Pre-selecionar obra do filtro se houver
    const obraFiltroAtual = document.getElementById('cron-filtro-obra')?.value || '';

    // Opcoes de obra
    const obraOpts = obrasLista.map(function(o) {
      return '<option value="' + o.id + '"' + (o.id == obraFiltroAtual ? ' selected' : '') + '>' + esc(o.nome) + '</option>';
    }).join('');

    // Opcoes de PCI — usa medicoes do Supabase (V2)
    const pciLista = (typeof PciModule !== 'undefined')
      ? (PciModule.state && PciModule.state.length ? PciModule.state : (PciModule._OBRAS_SEED || PciModule.medicoes || []))
      : [];
    const pciOpts = pciLista.map(function(p) {
      const obraNome = p.nome || (obras.find(function(o) { return o.id === p.obra_id; }) || {}).nome || 'PCI ' + p.id;
      const entregaLabel = p.entrega && p.entrega !== 'A definir' ? ' — entrega ' + p.entrega : '';
      return '<option value="' + p.id + '">' + obraNome + entregaLabel + '</option>';
    }).join('');

    const html = '<div class="modal-title">'
      + '<span><span class="material-symbols-outlined" style="font-size:18px;vertical-align:middle;">auto_fix_high</span> GERAR CRONOGRAMA</span>'
      + '<button class="modal-close" onclick="fecharModal(\'cron-etapas\')"><span class="material-symbols-outlined">close</span></button>'
      + '</div>'
      + '<div class="field"><label>OBRA</label>'
        + '<select id="cron-etapas-obra" style="width:100%;padding:10px 14px;background:var(--bg2);border:1px solid var(--borda);border-radius:10px;color:var(--texto);font-size:13px;outline:none;font-family:inherit;">'
          + '<option value="">Selecione a obra</option>'
          + obraOpts
        + '</select>'
      + '</div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">'
        + '<div class="field"><label>DATA DE INICIO</label><input type="date" id="cron-etapas-inicio" value="' + hoje + '"></div>'
        + '<div class="field"><label>DATA DE ENTREGA</label><input type="date" id="cron-etapas-fim" value=""></div>'
      + '</div>'
      + '<div class="field"><label>PCI DA OBRA</label>'
        + '<select id="cron-etapas-pci" style="width:100%;padding:10px 14px;background:var(--bg2);border:1px solid var(--borda);border-radius:10px;color:var(--texto);font-size:13px;outline:none;font-family:inherit;">'
          + '<option value="">Sem PCI — etapas construtivas padrao</option>'
          + pciOpts
        + '</select>'
      + '</div>'
      + '<button class="btn-save" onclick="CronogramaModule._salvarEtapas()">GERAR CRONOGRAMA</button>'
      + '<button class="btn-outline" onclick="fecharModal(\'cron-etapas\')">CANCELAR</button>';

    let overlay = document.getElementById('modal-cron-etapas');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'modal-cron-etapas';
      overlay.className = 'modal-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.onclick = function(e) { if (e.target === overlay) fecharModal('cron-etapas'); };
      const modal = document.createElement('div');
      modal.className = 'modal-box';
      modal.style.maxWidth = '480px';
      overlay.appendChild(modal);
      document.body.appendChild(overlay);
    }
    overlay.querySelector('.modal-box').innerHTML = html;
    overlay.classList.add('active');
  },

  async _salvarEtapas() {
    const obraId = document.getElementById('cron-etapas-obra')?.value;
    const inicioStr = document.getElementById('cron-etapas-inicio')?.value;
    const fimStr = document.getElementById('cron-etapas-fim')?.value;
    const pciId = document.getElementById('cron-etapas-pci')?.value;

    if (!obraId) { showToast('Selecione a obra'); return; }
    if (!inicioStr) { showToast('Informe a data de inicio'); return; }
    if (!fimStr) { showToast('Informe a data de entrega'); return; }
    if (fimStr <= inicioStr) { showToast('Data de entrega deve ser apos o inicio'); return; }

    const tInicio = new Date(inicioStr + 'T00:00:00');
    const tFim = new Date(fimStr + 'T00:00:00');
    const totalDias = Math.round((tFim - tInicio) / 86400000);

    let etapas;

    // Usar PCI se selecionada
    if (pciId && typeof PciModule !== 'undefined' && PciModule.state) {
      const pciObra = PciModule.state.find(function(p) { return p.id === pciId; });
      if (!pciObra) { showToast('PCI nao encontrada'); return; }

      const totalPeso = pciObra.pesos.reduce(function(a, p) { return a + p; }, 0);
      etapas = PciModule.ETAPAS_CEF.map(function(fase, i) {
        const peso = pciObra.pesos[i] || 0;
        if (!peso) return null;
        const dias = Math.max(1, Math.round((peso / totalPeso) * totalDias));
        const subs = fase.desc.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
        return { nome: fase.nome, dias: dias, subs: subs };
      }).filter(Boolean);
    } else {
      // Fallback: etapas padrao com dias fixos
      etapas = this._ETAPAS_PADRAO;
    }

    let dataAtual = new Date(tInicio);
    let criadas = 0;
    let anteriorId = null;

    for (let i = 0; i < etapas.length; i++) {
      const etapa = etapas[i];
      const dInicio = dataAtual.toISOString().split('T')[0];
      dataAtual.setDate(dataAtual.getDate() + etapa.dias);
      if (dataAtual > tFim) dataAtual = new Date(tFim);
      const dFim = dataAtual.toISOString().split('T')[0];

      const subitens = etapa.subs.map(function(s) { return { nome: s, feito: false }; });

      try {
        const r = await sbPost('cronograma_tarefas', {
          obra_id: obraId,
          nome: etapa.nome,
          data_inicio: dInicio,
          data_fim: dFim,
          progresso: 0,
          dependencia: anteriorId,
          ordem: i,
          subitens: subitens
        });
        if (r && r.id) anteriorId = r.id;
        criadas++;
      } catch (e) { console.error('Erro etapa', etapa.nome, e); }
    }

    // Salvar mapeamento obra_id → pci_id para PCI Medições
    if (pciId && criadas > 0) {
      try {
        const mapRows = await sbGet('tracker_sync?key=eq.pci-obra-map-v1&select=data');
        let map = { mappings: [] };
        if (mapRows && mapRows.length && mapRows[0].data) map = mapRows[0].data;
        map.mappings = (map.mappings || []).filter(function(m) { return m.pci_id !== pciId && m.obra_id !== obraId; });
        map.mappings.push({ pci_id: pciId, obra_id: obraId });
        await sbPost('tracker_sync', { key: 'pci-obra-map-v1', data: map, updated_at: new Date().toISOString() }, { upsert: true });
      } catch (e) { console.error('Erro mapa PCI-obra:', e); }
    }

    showToast(criadas + ' etapas criadas');
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
