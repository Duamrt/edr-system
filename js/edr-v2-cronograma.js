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

  // ── Mapeamento Duam: 62 etapas por categoria PCI ──────────────
  _DUAM_SUBS: {
    'servicos preliminares e gerais': [
      'Limpeza do Terreno',
      'Gabarito',
      'Locação'
    ],
    'infraestrutura': [
      'Escavação das Sapatas e Arranques',
      'Concretagem de Sapatas e Arranques',
      'Escavação do Baldrame',
      'Embasamento',
      'Montagem das Ferragens do Baldrame',
      'Forma + Esgoto',
      'Concretagem das Vigas Baldrame',
      'Remoção das Formas',
      'Regularização do Piso'
    ],
    'supra estrutura': [
      'Amarração dos Pilares nos Arranques',
      '03 Fiadas de Alvenaria Impermeabilizada',
      'Alvenaria até 8 Fiadas',
      'Passagem de Tubos e Eletrodutos nos Pilares',
      'Concretagem 1º Lance de Pilar',
      'Vergas e Contravergas',
      'Conferir Nível Antes da Última Fiada',
      'Concretagem 2º Lance de Pilar até Fundo de Viga',
      'Montagem das Ferragens das Vigas Superiores',
      'Forma das Vigas Superiores',
      'Passagens nas Vigas para Eletrodutos',
      'Concretagem das Vigas Superiores',
      'Montagem da Laje',
      'Escoramento da Laje',
      'Concretagem da Laje'
    ],
    'paredes e paineis': [
      'Corte das Alvenarias para Elétrica e Hidráulica',
      'Chumbamento dos Eletrodutos nas Paredes',
      'Chapisco até Fundo de Viga',
      'Mestrar para Ajustar Ambiente Fora de Esquadro',
      'Reboco Interno',
      'Instalação das Caixas 4x2',
      'Reboco Externo',
      'Enquadramento das Janelas (Capeaços)'
    ],
    'coberturas': [
      'Alvenaria Platibanda',
      'Alvenaria Base da Caixa D\'água',
      'Laje Caixa D\'água',
      'Escoramento das Telhas em Alvenaria',
      'Instalação da Calha',
      'Instalação da Caixa D\'água + Ligação Água',
      'Instalação das Telhas de Fibrocimento',
      'Aplicação dos Rufos',
      'Reboco Externo da Platibanda'
    ],
    'forros': [
      'Retirada das Escoras da Laje',
      'Audalio — Tubulações do Teto',
      'Renato — Gesso / Drywall'
    ],
    'revestimentos internos': [
      'Piso — Paginação e Aplicação',
      'Revestimento Paredes Banheiro',
      'Revestimento Paredes Cozinha',
      'Revestimento Área de Serviço'
    ],
    'pisos': [
      'Piso em Concreto',
      'Granito das Janelas',
      'Granito Cozinha e Banheiros'
    ],
    'esquadrias': [
      'Instalação das Grades de Portas',
      'Janelas e Portas de Vidro',
      'Porta Social e Portão de Garagem'
    ],
    'inst. eletricas e telefonicas': [
      'Audalio — Elétrica Completa'
    ],
    'instalacoes hidraulicas': [
      'Instalações Hidráulicas'
    ],
    'loucas e metais': [
      'Instalação de Louças e Metais'
    ],
    'pintura': [
      'Vagner — Pintura'
    ],
    'acabamentos': [
      'Limpeza Final da Obra'
    ]
  },

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
        + '<button onclick="CronogramaModule._abrirModalImportarPCI()" style="padding:6px 12px;border-radius:8px;border:1px solid var(--primary);background:rgba(45,106,79,0.08);color:var(--primary);font-size:12px;cursor:pointer;font-weight:600;">'
          + '<span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">upload_file</span> Importar PCI</button>'
        + '<button onclick="CronogramaModule._syncComPCI()" id="cron-btn-sync-pci" style="padding:6px 12px;border-radius:8px;border:1px solid var(--borda);background:var(--bg2);color:var(--texto2);font-size:12px;cursor:pointer;">'
          + '<span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">sync</span> Sync PCI</button>'
        + '<button onclick="CronogramaModule._limparObra()" id="cron-btn-limpar" style="padding:6px 12px;border-radius:8px;border:1px solid rgba(220,38,38,0.3);background:rgba(220,38,38,0.06);color:#dc2626;font-size:12px;cursor:pointer;display:none;">'
          + '<span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">delete_sweep</span> Limpar obra</button>'
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
        + '<div id="cron-gantt-wrap" style="overflow-x:auto;display:none;margin-top:8px;border-radius:10px;border:1px solid var(--borda);position:relative;">'
          + '<button id="cron-gantt-fullscreen-btn" onclick="CronogramaModule._toggleFullscreen()" style="position:absolute;top:8px;right:8px;z-index:100;background:var(--primary);color:#fff;border:none;border-radius:6px;padding:6px 10px;font-size:11px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:4px;box-shadow:0 2px 8px rgba(0,0,0,.15);">'
            + '<span class="material-symbols-outlined" style="font-size:14px;">fullscreen</span>'
            + '<span id="cron-gantt-fullscreen-label">EXPANDIR</span>'
          + '</button>'
        + '</div>'
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
    if (t.tipo === 'categoria') {
      const children = this.tarefas.filter(x => x.parent_id === t.id);
      if (!children.length) return Number(t.progresso) || 0;
      return Math.round(children.reduce((a, c) => a + this._calcProgresso(c), 0) / children.length);
    }
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

    // ── Modo categorias (import PCI com subitens como tarefas) ──
    const hasCategorias = this.tarefas.some(t => t.tipo === 'categoria');
    if (hasCategorias) {
      const categorias = this.tarefas.filter(t => t.tipo === 'categoria').sort((a,b) => (a.ordem||0)-(b.ordem||0));
      const allFilhas = this.tarefas.filter(t => t.tipo === 'tarefa' && t.parent_id);
      const progGeral = allFilhas.length > 0 ? Math.round(allFilhas.reduce((a,t) => a + this._calcProgresso(t), 0) / allFilhas.length) : 0;
      const corPG = progGeral >= 100 ? '#2D6A4F' : progGeral >= 50 ? '#B7791F' : progGeral > 0 ? '#E85D04' : '#dc2626';
      lista.innerHTML = '<div style="background:var(--bg2);border:1px solid var(--borda);border-radius:10px;padding:10px 14px;margin-bottom:12px;display:flex;align-items:center;gap:12px;">'
        + '<div style="flex:1;">'
          + '<div style="font-size:10px;color:var(--texto3);margin-bottom:4px;letter-spacing:1px;font-weight:700;">' + allFilhas.length + ' ETAPAS · ' + categorias.length + ' CATEGORIAS</div>'
          + '<div style="height:6px;background:var(--borda);border-radius:3px;">'
            + '<div style="height:6px;background:' + corPG + ';border-radius:3px;width:' + progGeral + '%;transition:width 0.3s;"></div>'
          + '</div>'
        + '</div>'
        + '<span style="font-size:20px;font-weight:800;color:' + corPG + ';">' + progGeral + '%</span>'
      + '</div>'
      + categorias.map(cat => this._renderCategoriaRow(cat)).join('');
      return;
    }

    // ── Modo plano (tarefas manuais / legado) ───────────────────
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

  // ── Render categoria (header expansível com filhas) ─────────

  _renderCategoriaRow(cat) {
    const prog = this._calcProgresso(cat);
    const children = this.tarefas.filter(t => t.parent_id === cat.id).sort((a,b) => (a.ordem||0)-(b.ordem||0));
    const aberto = this.expandido.has(cat.id);
    const corIdx = this._obraCores[cat.obra_id] || 0;
    const corObra = this._CORES[corIdx] || this._CORES[0];
    const corProg = prog >= 100 ? '#2D6A4F' : prog >= 50 ? '#B7791F' : prog > 0 ? '#E85D04' : '#dc2626';
    const feitosN = children.filter(c => this._calcProgresso(c) >= 100).length;

    const childrenHtml = aberto && children.length
      ? '<div style="padding:0 12px 10px 12px;display:flex;flex-direction:column;gap:6px;">'
          + children.map(c => this._renderTarefaFilha(c)).join('')
        + '</div>'
      : '';

    return '<div style="background:var(--bg2);border:1px solid var(--borda);border-left:3px solid ' + corObra.bar + ';border-radius:10px;margin-bottom:8px;overflow:hidden;">'
      + '<div style="display:flex;align-items:center;gap:8px;padding:10px 12px;cursor:pointer;" onclick="CronogramaModule._toggleExpand(\'' + cat.id + '\')">'
        + '<span class="material-symbols-outlined" style="font-size:18px;color:var(--texto3);transition:transform 0.2s;transform:rotate(' + (aberto ? '90' : '0') + 'deg);">chevron_right</span>'
        + '<div style="flex:1;min-width:0;">'
          + '<div style="font-size:13px;font-weight:700;color:var(--texto);">' + esc(cat.nome) + '</div>'
          + '<div style="display:flex;align-items:center;gap:8px;margin-top:4px;">'
            + '<div style="width:100px;height:4px;background:var(--borda);border-radius:2px;">'
              + '<div style="height:4px;background:' + corProg + ';border-radius:2px;width:' + prog + '%;transition:width 0.3s;"></div>'
            + '</div>'
            + '<span style="font-size:11px;font-weight:700;color:' + corProg + ';">' + prog + '%</span>'
            + '<span style="font-size:10px;color:var(--texto3);">' + feitosN + '/' + children.length + ' etapas</span>'
          + '</div>'
        + '</div>'
        + '<div onclick="event.stopPropagation()" style="display:flex;gap:4px;">'
          + '<button onclick="CronogramaModule._abrirModal(\'' + cat.id + '\')" style="padding:4px 8px;border-radius:6px;border:1px solid var(--borda);background:transparent;color:var(--texto3);font-size:11px;cursor:pointer;display:inline-flex;align-items:center;">'
            + '<span class="material-symbols-outlined" style="font-size:13px;">edit</span>'
          + '</button>'
        + '</div>'
      + '</div>'
      + childrenHtml
    + '</div>';
  },

  _renderTarefaFilha(t) {
    const prog = this._calcProgresso(t);
    const feita = prog >= 100;
    const ini = t.data_inicio ? new Date(t.data_inicio + 'T00:00:00').toLocaleDateString('pt-BR') : '';
    const fim = t.data_fim ? new Date(t.data_fim + 'T00:00:00').toLocaleDateString('pt-BR') : '';
    const hoje = new Date().toISOString().split('T')[0];
    const atrasado = t.data_fim && t.data_fim < hoje && !feita;

    return '<div style="background:var(--bg);border:1px solid var(--borda);border-radius:8px;padding:8px 10px;display:flex;align-items:center;gap:10px;' + (feita ? 'opacity:0.55;' : '') + '">'
      + '<button onclick="CronogramaModule._marcarTarefaFilha(\'' + t.id + '\',' + (!feita) + ')" '
        + 'style="min-width:18px;height:18px;border-radius:4px;border:2px solid ' + (feita ? '#2D6A4F' : 'var(--borda)') + ';background:' + (feita ? '#2D6A4F' : 'transparent') + ';cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;padding:0;">'
        + (feita ? '<span class="material-symbols-outlined" style="font-size:12px;color:#fff;">check</span>' : '')
      + '</button>'
      + '<div style="flex:1;min-width:0;">'
        + '<div style="font-size:12px;font-weight:600;color:var(--texto);">' + esc(t.nome) + '</div>'
        + '<div style="font-size:10px;color:var(--texto3);margin-top:1px;">'
          + (ini ? ini + ' → ' + fim : '')
          + (atrasado ? ' <span style="color:#dc2626;font-weight:700;">ATRASADO</span>' : '')
        + '</div>'
      + '</div>'
      + '<button onclick="CronogramaModule._abrirModal(\'' + t.id + '\')" style="padding:3px 7px;border-radius:6px;border:1px solid var(--borda);background:transparent;color:var(--texto3);font-size:11px;cursor:pointer;display:inline-flex;align-items:center;">'
        + '<span class="material-symbols-outlined" style="font-size:13px;">edit</span>'
      + '</button>'
    + '</div>';
  },

  async _marcarTarefaFilha(id, feita) {
    const t = this.tarefas.find(x => x.id === id);
    if (!t) return;

    if (feita && t.dependencia) {
      const dep = this.tarefas.find(x => x.id === t.dependencia);
      if (dep) {
        const depProg = this._calcProgresso(dep);
        if (depProg < 100) {
          const ok = await confirmar('A etapa anterior "' + dep.nome + '" está ' + depProg + '% concluída. Concluir esta mesmo assim?');
          if (!ok) return;
        }
      }
    }

    t.progresso = feita ? 100 : 0;
    try {
      await sbPatch('cronograma_tarefas', '?id=eq.' + id, { progresso: t.progresso });
    } catch(e) { showToast('Erro ao salvar'); return; }

    if (t.parent_id) {
      const cat = this.tarefas.find(x => x.id === t.parent_id);
      if (cat) {
        cat.progresso = this._calcProgresso(cat);
        try { await sbPatch('cronograma_tarefas', '?id=eq.' + cat.id, { progresso: cat.progresso }); } catch {}
      }
    }

    if (this._view === 'gantt') this._renderGantt();
    else this._renderLista();
  },

  // ══════════════════════════════════════════════════════════
  // VIEW: GANTT (Frappe Gantt com try/catch)
  // ══════════════════════════════════════════════════════════

  // Feriados nacionais 2026 (configurável depois)
  _FERIADOS_BR_2026: [
    { from: '2026-01-01', to: '2026-01-01', label: 'Ano Novo' },
    { from: '2026-02-16', to: '2026-02-17', label: 'Carnaval' },
    { from: '2026-04-03', to: '2026-04-03', label: 'Sexta-feira Santa' },
    { from: '2026-04-21', to: '2026-04-21', label: 'Tiradentes' },
    { from: '2026-05-01', to: '2026-05-01', label: 'Dia do Trabalho' },
    { from: '2026-06-04', to: '2026-06-04', label: 'Corpus Christi' },
    { from: '2026-09-07', to: '2026-09-07', label: 'Independência' },
    { from: '2026-10-12', to: '2026-10-12', label: 'Nossa Senhora Aparecida' },
    { from: '2026-11-02', to: '2026-11-02', label: 'Finados' },
    { from: '2026-11-15', to: '2026-11-15', label: 'Proclamação da República' },
    { from: '2026-12-25', to: '2026-12-25', label: 'Natal' }
  ],

  // Converte UUID dependencia → predecessor string usando gantt_ids
  _buildPredecessor(t) {
    if (t.predecessor) return t.predecessor; // já tem formato Syncfusion
    if (!t.dependencia) return '';
    const parent = this.tarefas.find(x => x.id === t.dependencia);
    return parent && parent.gantt_id ? parent.gantt_id + 'FS' : '';
  },

  // Constrói árvore hierárquica (categoria → tarefas filhas) para Syncfusion
  _buildGanttData() {
    const cats = this.tarefas.filter(t => t.tipo === 'categoria' && t.gantt_id)
      .sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
    const tarefas = this.tarefas.filter(t => t.tipo !== 'categoria' && t.gantt_id);

    return cats.map(cat => {
      const filhas = tarefas
        .filter(f => f.parent_id === cat.id && f.data_inicio)
        .sort((a, b) => (a.ordem || 0) - (b.ordem || 0))
        .map(f => ({
          TaskID: f.gantt_id,
          _uuid: f.id,
          TaskName: f.nome || '',
          StartDate: f.data_inicio ? new Date(f.data_inicio + 'T00:00:00') : null,
          Duration: f.duracao_dias || Math.max(1, Math.round(((new Date(f.data_fim) - new Date(f.data_inicio)) / 86400000) || 1)),
          Progress: this._calcProgresso(f),
          Predecessor: this._buildPredecessor(f)
        }));

      return {
        TaskID: cat.gantt_id,
        _uuid: cat.id,
        TaskName: cat.nome || '',
        StartDate: cat.data_inicio ? new Date(cat.data_inicio + 'T00:00:00') : null,
        Progress: this._calcProgresso(cat),
        subtasks: filhas
      };
    });
  },

  _renderGantt() {
    const wrap = document.getElementById('cron-gantt-wrap');
    const lista = document.getElementById('cron-lista');
    if (!wrap) return;

    try {
      // Registra Syncfusion Community License (trial 30 dias até validação Community)
      try {
        if (ej && ej.base && ej.base.registerLicense && !this._licenseRegistered) {
          ej.base.registerLicense('Ngo9BigBOggjHTQxAR8/V1JHaF1cXmhPYVJ2WmFZfVhgdV9HaVZUR2Y/P1ZhSXxVdkBiWH5dcnZURGJfUEd9XEE=');
          this._licenseRegistered = true;
        }
      } catch(_) {}

      // Carrega traducao pt-BR da toolbar/labels do Gantt
      try {
        if (ej && ej.base && ej.base.L10n && !this._l10nLoaded) {
          ej.base.L10n.load({
            'pt-BR': {
              'gantt': {
                'emptyRecord': 'Nenhuma tarefa para exibir',
                'id': 'ID',
                'name': 'Nome',
                'startDate': 'Inicio',
                'endDate': 'Fim',
                'duration': 'Duracao',
                'progress': 'Progresso',
                'dependency': 'Dependencia',
                'notes': 'Notas',
                'baselineStartDate': 'Linha Base Inicio',
                'baselineEndDate': 'Linha Base Fim',
                'taskMode': 'Modo da Tarefa',
                'changeScheduleMode': 'Mudar modo de agendamento',
                'subTasksStartDate': 'Inicio das Subtarefas',
                'subTasksEndDate': 'Fim das Subtarefas',
                'scheduleStartDate': 'Inicio Programado',
                'scheduleEndDate': 'Fim Programado',
                'auto': 'Automatico',
                'manual': 'Manual',
                'type': 'Tipo',
                'offset': 'Offset',
                'resourceName': 'Recurso',
                'resourceID': 'ID Recurso',
                'day': 'dia',
                'hour': 'hora',
                'minute': 'minuto',
                'days': 'dias',
                'hours': 'horas',
                'minutes': 'minutos',
                'generalTab': 'Geral',
                'customTab': 'Colunas Personalizadas',
                'writeNotes': 'Adicionar nota',
                'addDialogTitle': 'Nova Tarefa',
                'editDialogTitle': 'Detalhes da Tarefa',
                'saveButton': 'Salvar',
                'taskBeforePredecessor_FS': 'Tarefa antecede predecessor',
                'taskAfterPredecessor_FS': 'Tarefa sucede predecessor',
                'taskBeforePredecessor_SS': 'Tarefa inicia antes do predecessor',
                'taskAfterPredecessor_SS': 'Tarefa inicia depois do predecessor',
                'taskBeforePredecessor_FF': 'Tarefa termina antes do predecessor',
                'taskAfterPredecessor_FF': 'Tarefa termina depois do predecessor',
                'taskBeforePredecessor_SF': 'Tarefa inicia antes do predecessor',
                'taskAfterPredecessor_SF': 'Tarefa inicia depois do predecessor',
                'taskInformation': 'Informacoes da Tarefa',
                'deleteTask': 'Excluir Tarefa',
                'deleteDependency': 'Excluir Dependencia',
                'convert': 'Converter',
                'save': 'Salvar',
                'above': 'Acima',
                'below': 'Abaixo',
                'child': 'Filha',
                'milestone': 'Marco',
                'toTask': 'Para Tarefa',
                'toMilestone': 'Para Marco',
                'eventMarkers': 'Marcadores',
                'leftTaskLabel': 'Rotulo Esquerda',
                'rightTaskLabel': 'Rotulo Direita',
                'timelineCell': 'Celula',
                'confirmDelete': 'Tem certeza que deseja excluir?',
                'from': 'De',
                'to': 'Para',
                'taskLink': 'Vinculo',
                'lag': 'Lag',
                'start': 'Inicio',
                'finish': 'Fim',
                'enterValue': 'Insira o valor',
                'taskschedulingMode': 'Modo de Agendamento',
                'OK': 'OK',
                'cancel': 'Cancelar',
                'yes': 'Sim',
                'no': 'Nao',
                'y': 'S',
                'n': 'N',
                'searchPlaceholder': 'Buscar',
                'addPredecessor': 'Adicionar Predecessor',
                'removePredecessor': 'Remover Predecessor',
                'edit': 'Editar',
                'update': 'Atualizar',
                'delete': 'Excluir',
                'add': 'Adicionar',
                'expandAll': 'Expandir tudo',
                'collapseAll': 'Recolher tudo',
                'criticalPath': 'Caminho critico',
                'zoomIn': 'Aproximar',
                'zoomOut': 'Afastar',
                'zoomToFit': 'Ajustar a tela',
                'excelExport': 'Exportar Excel',
                'csvExport': 'Exportar CSV',
                'pdfExport': 'Exportar PDF',
                'expand': 'Expandir',
                'collapse': 'Recolher',
                'nextTimeSpan': 'Proximo periodo',
                'prevTimeSpan': 'Periodo anterior',
                'okText': 'OK',
                'cancelText': 'Cancelar',
                'fyLabel': 'AF',
                'work': 'Trabalho',
                'taskType': 'Tipo de Tarefa',
                'unit': 'Unidade',
                'plannedStartDate': 'Inicio Planejado',
                'plannedEndDate': 'Fim Planejado',
                'plannedDuration': 'Duracao Planejada',
                'plannedWork': 'Trabalho Planejado',
                'completed': 'Concluida',
                'inProgress': 'Em Andamento',
                'notStarted': 'Nao iniciada',
                'noData': 'Sem dados',
                'overdue': 'Atrasada',
                'segments': 'Segmentos'
              }
            }
          });
          this._l10nLoaded = true;
        }
      } catch(_) {}

      if (typeof ej === 'undefined' || !ej.gantt) {
        showToast('Biblioteca Syncfusion Gantt indisponivel. Verifique sua conexao.');
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

      // Destruir instância anterior se existir
      if (this._gantt && typeof this._gantt.destroy === 'function') {
        try { this._gantt.destroy(); } catch(_) {}
        this._gantt = null;
      }
      wrap.innerHTML = '<button id="cron-gantt-fullscreen-btn" onclick="CronogramaModule._toggleFullscreen()" style="position:absolute;top:8px;right:8px;z-index:100;background:var(--primary);color:#fff;border:none;border-radius:6px;padding:6px 12px;font-size:11px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:4px;box-shadow:0 2px 8px rgba(0,0,0,.25);">'
        + '<span class="material-symbols-outlined" style="font-size:14px;" id="cron-gantt-fs-icon">fullscreen</span>'
        + '<span id="cron-gantt-fullscreen-label">EXPANDIR</span>'
        + '</button>'
        + '<div id="cron-gantt-syncfusion" style="height:600px;"></div>';

      const ganttData = this._buildGanttData();
      if (!ganttData.length || ganttData.every(c => !c.subtasks.length)) {
        wrap.innerHTML = '<div style="padding:40px;text-align:center;color:var(--texto3);">'
          + '<span class="material-symbols-outlined" style="font-size:40px;color:var(--texto4);">date_range</span>'
          + '<div style="font-size:13px;margin-top:8px;">Nenhuma tarefa com datas validas para o Gantt.</div>'
          + '<div style="font-size:11px;margin-top:4px;">Edite as tarefas e defina datas de inicio e fim.</div>'
          + '</div>';
        return;
      }

      // Injeta módulos
      try {
        if (ej.gantt.CriticalPath) ej.gantt.Gantt.Inject(ej.gantt.CriticalPath);
        if (ej.gantt.Selection)    ej.gantt.Gantt.Inject(ej.gantt.Selection);
        if (ej.gantt.Toolbar)      ej.gantt.Gantt.Inject(ej.gantt.Toolbar);
        if (ej.gantt.Edit)         ej.gantt.Gantt.Inject(ej.gantt.Edit);
        if (ej.gantt.DayMarkers)   ej.gantt.Gantt.Inject(ej.gantt.DayMarkers);
      } catch(_) {}

      const self = this;
      const MESES_PT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
      const fmtMesAno = (d) => MESES_PT[d.getMonth()] + ' ' + d.getFullYear();
      const fmtDia = (d) => String(d.getDate()).padStart(2,'0') + '/' + MESES_PT[d.getMonth()];
      this._gantt = new ej.gantt.Gantt({
        dataSource: ganttData,
        locale: 'pt-BR',
        height: '600px',
        taskFields: {
          id: 'TaskID',
          name: 'TaskName',
          startDate: 'StartDate',
          endDate: 'EndDate',
          duration: 'Duration',
          progress: 'Progress',
          dependency: 'Predecessor',
          child: 'subtasks'
        },
        columns: [
          { field: 'TaskID',    headerText: '#',           width: 50, isPrimaryKey: true, textAlign: 'Center', allowEditing: false },
          { field: 'TaskName',  headerText: 'Etapa',       width: 260 },
          { field: 'StartDate', headerText: 'Início',      width: 110, format: 'dd/MM/yyyy', editType: 'datepickeredit' },
          { field: 'EndDate',   headerText: 'Fim',         width: 110, format: 'dd/MM/yyyy', editType: 'datepickeredit' },
          { field: 'Duration',  headerText: 'Dias',        width: 80, textAlign: 'Center',
            template: '<input type="number" min="1" value="${Duration}" data-uuid="${_uuid}" data-taskid="${TaskID}" class="cron-dias-input" onclick="this.select()" onfocus="this.select()" onblur="CronogramaModule._inlineUpdateDuration(this)" onkeydown="if(event.key===\'Enter\'){event.preventDefault();this.blur();}else if(event.key===\'Escape\'){this.value=this.defaultValue;this.blur();}" style="width:55px;background:transparent;border:1px solid var(--borda);border-radius:4px;padding:3px 6px;color:inherit;text-align:center;font:inherit;">'
          },
          { field: 'Progress',  headerText: '%',           width: 70, textAlign: 'Center', editType: 'numericedit', edit: { params: { min: 0, max: 100, format: 'n0', showSpinButton: false } } },
          { field: 'Predecessor', headerText: 'Depende de', width: 130 }
        ],
        durationUnit: 'day',
        editSettings: {
          allowEditing: true,
          allowTaskbarEditing: true,
          allowAdding: false,
          allowDeleting: false,
          mode: 'Auto',
          showDeleteConfirmDialog: false
        },
        toolbar: ['ExpandAll','CollapseAll','CriticalPath','ZoomIn','ZoomOut','ZoomToFit'],
        allowSelection: true,
        gridLines: 'Both',
        enableCriticalPath: false,
        workWeek: ['Monday','Tuesday','Wednesday','Thursday','Friday'],
        includeWeekend: false,
        dayWorkingTime: [{ from: 7, to: 11.5 }, { from: 13, to: 17 }],
        holidays: this._FERIADOS_BR_2026,
        timelineSettings: {
          topTier:    { unit: 'Month', format: 'MMM yyyy', formatter: fmtMesAno },
          bottomTier: { unit: 'Week',  format: 'dd MMM',   formatter: fmtDia }
        },
        labelSettings: { rightLabel: 'TaskName' },
        splitterSettings: { columnIndex: 4 },
        treeColumnIndex: 1,

        taskbarEdited: function(args) {
          // args.modifiedRecords contem TODAS as tarefas que mudaram em cascata
          const recs = args.modifiedRecords && args.modifiedRecords.length
            ? args.modifiedRecords
            : (args.data ? [args.data] : []);
          self._saveSyncfusionBatch(recs);
        },
        actionComplete: function(args) {
          if (args.requestType === 'save') {
            const recs = args.modifiedRecords && args.modifiedRecords.length
              ? args.modifiedRecords
              : (args.data ? (Array.isArray(args.data) ? args.data : [args.data]) : []);
            self._saveSyncfusionBatch(recs);
          }
        },
        queryTaskbarInfo: function(args) {
          if (args.data && args.data.ganttProperties && args.data.ganttProperties.isCritical) {
            args.taskbarBgColor = '#dc2626';
            args.progressBarBgColor = '#991b1b';
          }
        },
        queryCellInfo: function(args) {
          if (!args || !args.column || !args.cell) return;
          // Tooltip na coluna "Depende de" mostrando nomes das tarefas referenciadas
          if (args.column.field === 'Predecessor' && args.data && args.data.taskData && args.data.taskData.Predecessor) {
            const pred = args.data.taskData.Predecessor;
            // pred pode ser "6FS,7SS+2d" — parse cada parte
            const partes = pred.split(',').map(p => p.trim()).filter(Boolean);
            const nomes = partes.map(p => {
              const m = p.match(/^(\d+)([A-Z]{2})?([+\-]\d+\s*\w*)?/);
              if (!m) return p;
              const taskId = parseInt(m[1], 10);
              const tipo = m[2] || 'FS';
              const offset = m[3] || '';
              const tipoTxt = { FS: 'apos', SS: 'inicia com', FF: 'termina com', SF: 'inicia ao fim de' }[tipo] || tipo;
              // procura no dataSource
              const alvo = self.tarefas.find(t => t.gantt_id === taskId);
              const nomeAlvo = alvo ? alvo.nome : ('Tarefa ' + taskId);
              return '#' + taskId + ' ' + tipoTxt + ' "' + nomeAlvo + '"' + (offset ? ' ' + offset : '');
            });
            args.cell.setAttribute('title', nomes.join('\n'));
            args.cell.style.cursor = 'help';
          }
        },
        recordDoubleClick: function(args) {
          if (args.rowData && args.rowData.taskData && args.rowData.taskData._uuid) {
            CronogramaModule._abrirModal(args.rowData.taskData._uuid);
          }
        }
      });

      this._gantt.appendTo('#cron-gantt-syncfusion');

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

  // Toggle modo tela cheia (esconde sidebar + header)
  _toggleFullscreen() {
    const wrap = document.getElementById('cron-gantt-wrap');
    if (!wrap) return;

    const isFull = wrap.classList.contains('cron-gantt-fullscreen');
    const label = document.getElementById('cron-gantt-fullscreen-label');
    const icon = wrap.querySelector('#cron-gantt-fullscreen-btn .material-symbols-outlined');

    if (!isFull) {
      // Injeta CSS uma vez
      if (!document.getElementById('cron-gantt-fs-css')) {
        const style = document.createElement('style');
        style.id = 'cron-gantt-fs-css';
        style.textContent = '.cron-gantt-fullscreen{position:fixed!important;inset:0!important;z-index:9999!important;background:var(--bg)!important;border-radius:0!important;border:none!important;margin:0!important;padding:0!important;overflow:auto!important;}'
          + '.cron-gantt-fullscreen #cron-gantt-syncfusion{height:calc(100vh - 0px)!important;}'
          + 'body.cron-fs-active{overflow:hidden!important;}';
        document.head.appendChild(style);
      }
      wrap.classList.add('cron-gantt-fullscreen');
      document.body.classList.add('cron-fs-active');
      if (label) label.textContent = 'SAIR';
      if (icon) icon.textContent = 'close_fullscreen';
      // Reforça altura do Gantt
      setTimeout(() => {
        const ganttDiv = document.getElementById('cron-gantt-syncfusion');
        if (ganttDiv) ganttDiv.style.height = (window.innerHeight - 4) + 'px';
        if (this._gantt && typeof this._gantt.refresh === 'function') {
          try { this._gantt.refresh(); } catch(_) {}
        }
      }, 50);
      // ESC pra sair
      this._fsKeyHandler = (e) => { if (e.key === 'Escape') this._toggleFullscreen(); };
      document.addEventListener('keydown', this._fsKeyHandler);
    } else {
      wrap.classList.remove('cron-gantt-fullscreen');
      document.body.classList.remove('cron-fs-active');
      if (label) label.textContent = 'EXPANDIR';
      if (icon) icon.textContent = 'fullscreen';
      const ganttDiv = document.getElementById('cron-gantt-syncfusion');
      if (ganttDiv) ganttDiv.style.height = '600px';
      if (this._gantt && typeof this._gantt.refresh === 'function') {
        try { this._gantt.refresh(); } catch(_) {}
      }
      if (this._fsKeyHandler) {
        document.removeEventListener('keydown', this._fsKeyHandler);
        this._fsKeyHandler = null;
      }
    }
  },

  // Inline update da coluna Dias via input HTML embutido no template
  _inlineUpdateDuration(inputEl) {
    if (!inputEl) return;
    const uuid = inputEl.dataset.uuid;
    const taskId = parseInt(inputEl.dataset.taskid, 10);
    const novosDias = Math.max(1, parseInt(inputEl.value, 10) || 1);
    const original = parseInt(inputEl.defaultValue, 10);

    if (novosDias === original) return; // nada mudou
    if (!uuid || !taskId || !this._gantt) return;

    // updateRecordByID dispara o auto-scheduling (cascata) E o actionComplete que salva tudo
    try {
      this._gantt.updateRecordByID({ TaskID: taskId, Duration: novosDias });
      inputEl.defaultValue = novosDias; // reseta o "original" pro proximo edit
    } catch (e) {
      console.error('[INLINE-DURATION]', e);
      inputEl.value = original; // rollback visual
      showToast('Erro ao atualizar duracao');
    }
  },

  // Salva edições do Syncfusion (incluindo cascata) no Supabase em paralelo
  async _saveSyncfusionBatch(records) {
    if (!records || !records.length) return;

    // Dedup por uuid (cascata pode trazer mesmo registro multiplas vezes)
    const seen = new Set();
    const itens = [];
    for (const rec of records) {
      const td = (rec && rec.taskData) || rec;
      if (!td || !td._uuid) continue;
      if (seen.has(td._uuid)) continue;
      seen.add(td._uuid);

      const start = td.StartDate instanceof Date ? td.StartDate : new Date(td.StartDate);
      if (!start || isNaN(start.getTime())) continue;
      const duration = Math.max(1, Number(td.Duration) || 1);
      // Usar EndDate calculado pelo Syncfusion (já exclui fins de semana)
      // Fallback manual caso não venha mapeado
      const fim = (td.EndDate instanceof Date && !isNaN(td.EndDate.getTime()))
        ? td.EndDate
        : (() => {
            const d = new Date(start); let r = duration;
            while (r > 0) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0 && d.getDay() !== 6) r--; }
            return d;
          })();

      itens.push({
        uuid: td._uuid,
        payload: {
          data_inicio: start.toISOString().split('T')[0],
          data_fim: fim.toISOString().split('T')[0],
          duracao_dias: duration,
          progresso: Math.round(Number(td.Progress) || 0),
          predecessor: td.Predecessor || ''
        }
      });
    }

    if (!itens.length) return;

    // Feedback visual
    const btn = document.getElementById('cron-gantt-fullscreen-btn');
    const oldLabel = btn ? btn.innerHTML : null;
    if (btn) btn.innerHTML = '<span class="material-symbols-outlined" style="font-size:14px;">sync</span> SALVANDO ' + itens.length + '...';

    try {
      // Paralelo: todas as PATCHs ao mesmo tempo
      await Promise.all(itens.map(it =>
        sbPatch('cronograma_tarefas', '?id=eq.' + it.uuid, it.payload)
      ));

      // Atualiza estado local
      for (const it of itens) {
        const t = this.tarefas.find(x => x.id === it.uuid);
        if (t) Object.assign(t, it.payload);
      }

      if (btn && oldLabel) btn.innerHTML = oldLabel;
      showToast(itens.length === 1 ? 'Tarefa atualizada' : itens.length + ' tarefas reajustadas em cascata');
    } catch (e) {
      console.error('[GANTT-SAVE-BATCH]', e);
      if (btn && oldLabel) btn.innerHTML = oldLabel;
      showToast('Erro ao salvar — recarregue a pagina');
    }
  },

  // (deprecado, mantido por compat) Salva 1 ediço — usar _saveSyncfusionBatch
  async _saveSyncfusionEdit(data) {
    if (!data) return;
    const td = data.taskData || data;
    const uuid = td._uuid;
    if (!uuid) return;

    try {
      const start = td.StartDate instanceof Date ? td.StartDate : new Date(td.StartDate);
      const duration = Math.max(1, Number(td.Duration) || 1);
      const fim = new Date(start);
      fim.setDate(fim.getDate() + duration);

      const payload = {
        data_inicio: start.toISOString().split('T')[0],
        data_fim: fim.toISOString().split('T')[0],
        duracao_dias: duration,
        progresso: Math.round(Number(td.Progress) || 0),
        predecessor: td.Predecessor || ''
      };

      await sbPatch('cronograma_tarefas', '?id=eq.' + uuid, payload);

      const t = this.tarefas.find(x => x.id === uuid);
      if (t) Object.assign(t, payload);

      showToast('Tarefa atualizada');
    } catch (e) {
      console.error('[GANTT-SAVE]', e);
      showToast('Erro ao salvar alteracao do Gantt');
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

  _filtrarObra() {
    this.obraFiltro = document.getElementById('cron-filtro-obra')?.value || '';
    var btnLimpar = document.getElementById('cron-btn-limpar');
    if (btnLimpar) btnLimpar.style.display = this.obraFiltro ? '' : 'none';
    this._carregarTarefas();
  },

  async _limparObra() {
    if (!this.obraFiltro) { showToast('Selecione uma obra no filtro primeiro'); return; }
    const obrasLista = typeof obras !== 'undefined' ? obras : [];
    const obra = obrasLista.find(function(o) { return o.id === CronogramaModule.obraFiltro; });
    const nomeObra = obra ? obra.nome : 'esta obra';
    confirmar('Limpar TODO o cronograma de "' + nomeObra + '"?\n\nIsso remove todas as etapas. Use antes de reimportar a PCI.', async function() {
      try {
        await sbDelete('cronograma_tarefas', '?obra_id=eq.' + CronogramaModule.obraFiltro);
        CronogramaModule.tarefas = [];
        showToast('Cronograma de "' + nomeObra + '" limpo. Agora importe a PCI.');
        CronogramaModule._renderLista();
        var vazio = document.getElementById('cron-vazio');
        if (vazio) vazio.classList.remove('hidden');
      } catch(e) {
        showToast('Erro ao limpar cronograma');
      }
    });
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

    if (prog >= 100 && t.dependencia) {
      const dep = this.tarefas.find(x => x.id === t.dependencia);
      if (dep) {
        const depProg = this._calcProgresso(dep);
        if (depProg < 100) {
          const ok = await confirmar('A etapa anterior "' + dep.nome + '" está ' + depProg + '% concluída. Marcar esta como 100% mesmo assim?');
          if (!ok) {
            t.subitens[subIdx].feito = !t.subitens[subIdx].feito;
            this._renderLista();
            return;
          }
        }
      }
    }

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
    const t = this.tarefas.find(x => x.id === id);
    if (t && t.dependencia && Math.round(progress) >= 100) {
      const dep = this.tarefas.find(x => x.id === t.dependencia);
      if (dep) {
        const depProg = this._calcProgresso(dep);
        if (depProg < 100) {
          const ok = await confirmar('A etapa anterior "' + dep.nome + '" está ' + depProg + '% concluída. Marcar esta como 100% mesmo assim?');
          if (!ok) { this._renderGantt(); return; }
        }
      }
    }
    try {
      await sbPatch('cronograma_tarefas', '?id=eq.' + id, { progresso: Math.round(progress) });
      if (t) t.progresso = Math.round(progress);
    } catch (e) { showToast('Erro ao salvar progresso'); }
  },

  _abrirModal(editId) {
    const t = editId ? this.tarefas.find(x => x.id === editId) : null;
    const obrasLista = typeof obras !== 'undefined' ? obras : [];
    const obrasOpts = obrasLista.map(o => '<option value="' + o.id + '" ' + (t && t.obra_id === o.id ? 'selected' : '') + '>' + esc(o.nome) + '</option>').join('');

    const depOpts = this.tarefas
      .filter(x => x.id !== editId && x.tipo !== 'categoria')
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

    // Preferir Proposta_Constr_Individual, senão primeira aba
    var sheetName = workbook.SheetNames.indexOf('Proposta_Constr_Individual') >= 0
      ? 'Proposta_Constr_Individual' : workbook.SheetNames[0];
    var ws = workbook.Sheets[sheetName];
    if (!ws) { console.warn('[PCI Import] Nenhuma aba encontrada'); return null; }
    console.log('[PCI Import] Usando aba:', sheetName);

    var data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    function normalizar(s) {
      return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    }

    function lerPesos(startRow, col) {
      var arr = [];
      for (var i = startRow; i < startRow + 20; i++) {
        if (i >= data.length) { arr.push(0); continue; }
        var val = data[i][col];
        var num = parseNumBR(val);
        arr.push(isNaN(num) ? 0 : num);
      }
      var soma = arr.reduce(function(a, b) { return a + b; }, 0);
      // Converter decimal → percentual se necessário
      if (soma > 0 && soma <= 1.5) {
        arr = arr.map(function(p) { return Math.round(p * 10000) / 100; });
        soma = arr.reduce(function(a, b) { return a + b; }, 0);
      }
      return { pesos: arr, soma: soma };
    }

    // Coletar TODAS as ocorrências de "Incidência" na planilha
    var ocorrencias = [];
    for (var r = 0; r < data.length; r++) {
      var row = data[r];
      for (var c = 0; c < row.length; c++) {
        if (normalizar(row[c]).startsWith('incid')) {
          ocorrencias.push({ r: r, c: c });
        }
      }
    }
    console.log('[PCI Import] Ocorrencias de Incidencia encontradas:', ocorrencias.length);

    // Testar cada ocorrência e escolher a que soma mais próximo de 100%
    var melhor = null, melhorDiff = Infinity;
    ocorrencias.forEach(function(occ) {
      var resultado = lerPesos(occ.r + 1, occ.c);
      var diff = Math.abs(resultado.soma - 100);
      console.log('[PCI Import] Tentativa linha', occ.r + 1, 'col', occ.c + 1,
        '| Soma:', resultado.soma.toFixed(2), '| Diff:', diff.toFixed(2));
      if (resultado.soma >= 50 && resultado.soma <= 150 && diff < melhorDiff) {
        melhorDiff = diff;
        melhor = { pesos: resultado.pesos, soma: resultado.soma, r: occ.r, c: occ.c };
      }
    });

    if (!melhor) {
      console.warn('[PCI Import] Nenhuma ocorrencia com soma valida (50-150%)');
      return null;
    }

    console.log('[PCI Import] Melhor: linha', melhor.r + 1, 'col', melhor.c + 1,
      '| Soma:', melhor.soma.toFixed(2));
    console.log('[PCI Import] Pesos finais:', melhor.pesos);
    return melhor.pesos;
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

    // Criar categorias + tarefas filhas (subitens como linhas individuais)
    let dataAtual = new Date(tInicio);
    let anteriorCatId = null;
    const rollbackIds = [];
    const etapas = typeof PciModule !== 'undefined'
      ? (PciModule.categorias && PciModule.categorias.length ? PciModule.categorias : PciModule._CATS)
      : [];

    try {
      for (let i = 0; i < 20; i++) {
        const peso = pesos[i] || 0;
        if (!peso) continue;
        const fase = etapas[i] || { nome: 'Fase ' + (i + 1) };
        const diasCat = Math.max(1, Math.round((peso / totalPeso) * totalDias));
        const dCatInicio = dataAtual.toISOString().split('T')[0];
        const dCatFimDate = new Date(dataAtual);
        dCatFimDate.setDate(dCatFimDate.getDate() + diasCat);
        if (dCatFimDate > tFim) dCatFimDate.setTime(tFim.getTime());
        const dCatFim = dCatFimDate.toISOString().split('T')[0];

        // Progresso real da PCI para a categoria
        var progCat = 0;
        if (medicaoId && fase.nome) {
          progCat = PciModule._calcCatExec(medicaoId, fase.nome).pct || 0;
        }

        // Subitens: mapeamento Duam → itens reais da medição → template → fallback _SUBS
        var subitens = [];
        var nomeKeyDuam = (fase.nome || '').toLowerCase().trim().replace(/\s+/g, ' ');
        if (CronogramaModule._DUAM_SUBS[nomeKeyDuam] && CronogramaModule._DUAM_SUBS[nomeKeyDuam].length) {
          // Pegar status real da PCI para marcar feito
          var progRealPct = progCat;
          subitens = CronogramaModule._DUAM_SUBS[nomeKeyDuam].map(function(nome) {
            return { nome: nome, feito: progRealPct >= 100 };
          });
        }
        if (!subitens.length && medicaoId && fase.nome) {
          var itensCat = PciModule.itens.filter(function(it) {
            return it.medicao_id === medicaoId && it.categoria_nome === fase.nome && !it.nao_aplicavel;
          });
          if (itensCat.length) {
            subitens = itensCat.map(function(it) { return { nome: it.sub_servico_descricao || it.descricao || '', feito: !!it.executado }; });
          }
        }
        if (!subitens.length && typeof PciModule !== 'undefined' && PciModule.templatePadrao && PciModule.templatePadrao.length) {
          var nomeLowerFase = (fase.nome || '').toLowerCase().trim();
          var tplFase = PciModule.templatePadrao.filter(function(tp) {
            return (tp.categoria_nome || '').toLowerCase().trim() === nomeLowerFase && !tp.nao_aplicavel;
          });
          if (tplFase.length) subitens = tplFase.map(function(tp) { return { nome: tp.sub_servico_descricao || '', feito: false }; });
        }
        if (!subitens.length && typeof PciModule !== 'undefined' && fase.id) {
          var subsFonte = (PciModule.subServicos && PciModule.subServicos.length) ? PciModule.subServicos : (PciModule._SUBS || []);
          subitens = subsFonte.filter(function(s) { return s.categoria_id === fase.id; })
            .map(function(s) { return { nome: s.descricao, feito: false }; });
        }

        // Criar linha CATEGORIA (header)
        const catRow = await sbPost('cronograma_tarefas', {
          obra_id: obraId, nome: fase.nome, data_inicio: dCatInicio, data_fim: dCatFim,
          progresso: progCat, dependencia: anteriorCatId, ordem: i, subitens: [], tipo: 'categoria',
          duracao_dias: diasCat
        });
        if (catRow && catRow.id) rollbackIds.push(catRow.id);

        // Criar linhas TAREFA filha — uma por subitem
        if (subitens.length > 0 && catRow && catRow.id) {
          const diasSub = Math.max(1, Math.floor(diasCat / subitens.length));
          let subData = new Date(dCatInicio + 'T00:00:00');
          let prevSubId = null;
          let prevSubGanttId = null;

          for (let j = 0; j < subitens.length; j++) {
            const sub = subitens[j];
            if (!sub.nome) continue;
            const dSubIni = subData.toISOString().split('T')[0];
            subData.setDate(subData.getDate() + diasSub);
            if (subData > dCatFimDate) subData.setTime(dCatFimDate.getTime());
            const dSubFim = subData.toISOString().split('T')[0];
            const depId = j === 0 ? anteriorCatId : prevSubId;
            // Predecessor formato Syncfusion: usa gantt_id da anterior
            const predStr = prevSubGanttId ? (prevSubGanttId + 'FS') : '';

            const subRow = await sbPost('cronograma_tarefas', {
              obra_id: obraId, nome: sub.nome,
              data_inicio: dSubIni, data_fim: dSubFim || dCatFim,
              progresso: sub.feito ? 100 : 0, dependencia: depId,
              ordem: j, parent_id: catRow.id, tipo: 'tarefa', subitens: [],
              duracao_dias: diasSub, predecessor: predStr
            });
            if (subRow && subRow.id) {
              prevSubId = subRow.id;
              prevSubGanttId = subRow.gantt_id || null;
              rollbackIds.push(subRow.id);
            }
          }
        }

        anteriorCatId = catRow ? catRow.id : anteriorCatId;
        dataAtual.setTime(dCatFimDate.getTime());
      }
    } catch (e) {
      if (rollbackIds.length) {
        try { await sbDelete('cronograma_tarefas', '?id=in.(' + rollbackIds.join(',') + ')'); } catch (_) {}
      }
      showToast('Falha ao gerar cronograma — alterações revertidas. Tente novamente.');
      throw e;
    }

    // Sincronizar pesos reais da planilha com PCI Medições
    try {
      await CronogramaModule._syncPesosPCI(obraId, pesos, etapas);
    } catch(e) {
      console.warn('[SYNC-PESOS-PCI]', e);
    }
  },

  // ── Sincroniza pesos reais do XLSB com pci_medicao + pci_itens ──
  async _syncPesosPCI(obraId, pesos, etapas) {
    if (typeof PciModule === 'undefined') return;

    const cats = (PciModule.categorias && PciModule.categorias.length) ? PciModule.categorias : PciModule._CATS;
    const subsSource = (PciModule.subServicos && PciModule.subServicos.length) ? PciModule.subServicos : PciModule._SUBS;
    const coberturaPeso = pesos[6] || 0; // índice 6 = Coberturas

    // Encontrar ou criar pci_medicao
    let med = PciModule.medicoes.find(function(m) { return m.obra_id === obraId; });
    if (!med) {
      med = await sbPost('pci_medicao', { obra_id: obraId, houve_repactuacao: false, cobertura_peso: coberturaPeso });
      if (!med || !med.id) return;
      PciModule.medicoes.push(med);
    } else {
      await sbPatch('pci_medicao?id=eq.' + med.id, { cobertura_peso: coberturaPeso });
      med.cobertura_peso = coberturaPeso;
    }

    // Buscar itens existentes desta medicao
    let itensExistentes = PciModule.itens.filter(function(i) { return i.medicao_id === med.id; });
    if (!itensExistentes.length) {
      const itensDb = await sbGet('pci_itens?medicao_id=eq.' + med.id + '&order=categoria_nome,created_at');
      itensExistentes = Array.isArray(itensDb) ? itensDb : [];
      if (itensExistentes.length) itensExistentes.forEach(function(it) { PciModule.itens.push(it); });
    }

    if (itensExistentes.length) {
      // Já tem itens — só atualizar categoria_peso em cada categoria
      for (var i = 0; i < 20; i++) {
        var cat = cats[i] || etapas[i];
        if (!cat || !cat.nome) continue;
        var catPeso = pesos[i] || 0;
        var itensCat = itensExistentes.filter(function(it) { return it.categoria_nome === cat.nome; });
        if (itensCat.length && itensCat[0].categoria_peso !== catPeso) {
          await sbPatch('pci_itens?medicao_id=eq.' + med.id + '&categoria_nome=eq.' + encodeURIComponent(cat.nome), { categoria_peso: catPeso });
          itensCat.forEach(function(it) { it.categoria_peso = catPeso; });
        }
      }
    } else {
      // Sem itens — criar com pesos reais da planilha + sub-itens do template (Dayana) ou genérico
      var temTemplate = PciModule.templatePadrao && PciModule.templatePadrao.length > 0;
      var itensParaInserir = [];

      if (temTemplate) {
        // Usar template salvo (estrutura da Dayana), trocando apenas o categoria_peso pelo real da planilha
        PciModule.templatePadrao.forEach(function(t) {
          var catIdx = cats.findIndex(function(c) { return c.nome === t.categoria_nome; });
          var catPesoReal = catIdx >= 0 ? (pesos[catIdx] || 0) : (t.categoria_peso || 0);
          itensParaInserir.push({
            medicao_id: med.id,
            categoria_nome: t.categoria_nome,
            categoria_peso: catPesoReal,
            sub_servico_descricao: t.sub_servico_descricao,
            executado: false,
            nao_aplicavel: t.nao_aplicavel || false,
            item_peso: t.item_peso || null,
            manual: t.manual || false
          });
        });
      } else {
        // Fallback: sub-serviços genéricos
        for (var j = 0; j < 20; j++) {
          var catJ = cats[j];
          if (!catJ) continue;
          var catPesoJ = pesos[j] || 0;
          var subsJ = subsSource.filter(function(s) { return s.categoria_id === catJ.id; });
          if (subsJ.length) {
            subsJ.forEach(function(sub) {
              itensParaInserir.push({
                medicao_id: med.id,
                categoria_nome: catJ.nome,
                categoria_peso: catPesoJ,
                sub_servico_descricao: sub.descricao,
                executado: false,
                nao_aplicavel: false,
                manual: false
              });
            });
          } else if (catPesoJ > 0) {
            itensParaInserir.push({
              medicao_id: med.id,
              categoria_nome: catJ.nome,
              categoria_peso: catPesoJ,
              sub_servico_descricao: catJ.nome,
              executado: false,
              nao_aplicavel: false,
              manual: false
            });
          }
        }
      }

      if (itensParaInserir.length) {
        await sbPostMinimal('pci_itens', itensParaInserir);
        var itensNovos = await sbGet('pci_itens?medicao_id=eq.' + med.id + '&order=categoria_nome,created_at');
        if (Array.isArray(itensNovos)) itensNovos.forEach(function(it) { PciModule.itens.push(it); });
      }
    }
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
  }
};

// Registrar no viewRegistry
if (typeof viewRegistry !== 'undefined') {
  viewRegistry.register('cronograma', function() { return CronogramaModule.render(); });
}
