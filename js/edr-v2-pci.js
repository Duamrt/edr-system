/* ============================================================
   EDR V2 — PciModule (v2 — Sub-Serviços CAIXA/MCMV)
   Tabelas: pci_medicao + pci_itens (Supabase)
   Templates: pci_categorias_template + pci_sub_servicos_template
   LEGACY key pci-medicoes-v3 NUNCA trocar
   ============================================================ */

const PciModule = {

  // ── Estado ──
  medicoes: [],
  itens: [],
  historico: [],
  categorias: [],
  subServicos: [],
  obrasComCronograma: new Set(), // obra_ids que têm ao menos 1 tarefa no cronograma
  expanded: new Set(),
  expandedCats: new Set(),
  _carregado: false,
  _container: null,

  // ── Chaves legadas (NUNCA trocar) ──
  SYNC_KEY: 'pci-medicoes-v3',
  CACHE_KEY: 'pci_cache_v3',
  MAPA_KEY: 'pci-obra-map-v1',

  // ── Templates hardcoded (fallback se DB não responder) ──
  _CATS: [
    { id:'t1',  ordem:1,  nome:'Servicos Preliminares e Gerais',    peso_percentual:2.83 },
    { id:'t2',  ordem:2,  nome:'Infraestrutura',                    peso_percentual:6.60 },
    { id:'t3',  ordem:3,  nome:'Supra Estrutura',                   peso_percentual:12.96 },
    { id:'t4',  ordem:4,  nome:'Paredes e Paineis',                 peso_percentual:9.35 },
    { id:'t5',  ordem:5,  nome:'Esquadrias',                        peso_percentual:8.01 },
    { id:'t6',  ordem:6,  nome:'Vidros e Plasticos',                peso_percentual:1.20 },
    { id:'t7',  ordem:7,  nome:'Coberturas',                        peso_percentual:0 },
    { id:'t8',  ordem:8,  nome:'Impermeabilizacoes',                peso_percentual:4.24 },
    { id:'t9',  ordem:9,  nome:'Revestimentos Internos',            peso_percentual:7.07 },
    { id:'t10', ordem:10, nome:'Forros',                            peso_percentual:2.00 },
    { id:'t11', ordem:11, nome:'Revestimentos Externos',            peso_percentual:4.24 },
    { id:'t12', ordem:12, nome:'Pintura',                           peso_percentual:5.89 },
    { id:'t13', ordem:13, nome:'Pisos',                             peso_percentual:8.72 },
    { id:'t14', ordem:14, nome:'Acabamentos',                       peso_percentual:1.18 },
    { id:'t15', ordem:15, nome:'Inst. Eletricas e Telefonicas',     peso_percentual:3.77 },
    { id:'t16', ordem:16, nome:'Instalacoes Hidraulicas',           peso_percentual:3.77 },
    { id:'t17', ordem:17, nome:'Inst. Esgoto e Aguas Pluviais',     peso_percentual:4.01 },
    { id:'t18', ordem:18, nome:'Loucas e Metais',                   peso_percentual:4.48 },
    { id:'t19', ordem:19, nome:'Complementos',                      peso_percentual:1.13 },
    { id:'t20', ordem:20, nome:'Outros Servicos',                   peso_percentual:8.55 }
  ],
  _SUBS: [
    { categoria_id:'t1', descricao:'Limpeza do terreno', ordem:1 },
    { categoria_id:'t1', descricao:'Locacao da obra', ordem:2 },
    { categoria_id:'t1', descricao:'Ligacoes provisorias (agua/energia)', ordem:3 },
    { categoria_id:'t1', descricao:'Tapume', ordem:4 },
    { categoria_id:'t2', descricao:'Escavacao e aterro', ordem:1 },
    { categoria_id:'t2', descricao:'Formas e armacao de fundacao', ordem:2 },
    { categoria_id:'t2', descricao:'Concretagem de fundacao', ordem:3 },
    { categoria_id:'t2', descricao:'Impermeabilizacao de fundacao', ordem:4 },
    { categoria_id:'t3', descricao:'Pilares (forma, armacao, concretagem)', ordem:1 },
    { categoria_id:'t3', descricao:'Vigas (forma, armacao, concretagem)', ordem:2 },
    { categoria_id:'t3', descricao:'Laje (forma, armacao, concretagem)', ordem:3 },
    { categoria_id:'t4', descricao:'Marcacao de paredes', ordem:1 },
    { categoria_id:'t4', descricao:'Elevacao de alvenaria', ordem:2 },
    { categoria_id:'t4', descricao:'Vergas e contravergas', ordem:3 },
    { categoria_id:'t4', descricao:'Cinta de amarracao', ordem:4 },
    { categoria_id:'t5', descricao:'Instalacao de portas internas', ordem:1 },
    { categoria_id:'t5', descricao:'Instalacao de janelas', ordem:2 },
    { categoria_id:'t5', descricao:'Porta principal', ordem:3 },
    { categoria_id:'t5', descricao:'Grades e protecoes', ordem:4 },
    { categoria_id:'t6', descricao:'Instalacao de vidros', ordem:1 },
    { categoria_id:'t6', descricao:'Instalacao de PVC (rodapes, peitoris)', ordem:2 },
    { categoria_id:'t7', descricao:'Estrutura do telhado', ordem:1 },
    { categoria_id:'t7', descricao:'Instalacao de telhas', ordem:2 },
    { categoria_id:'t7', descricao:'Cumeeira e arremates', ordem:3 },
    { categoria_id:'t7', descricao:'Calhas e rufos', ordem:4 },
    { categoria_id:'t8', descricao:'Impermeabilizacao de fundacoes', ordem:1 },
    { categoria_id:'t8', descricao:'Impermeabilizacao de laje', ordem:2 },
    { categoria_id:'t8', descricao:'Impermeabilizacao de areas molhadas', ordem:3 },
    { categoria_id:'t9', descricao:'Chapisco interno', ordem:1 },
    { categoria_id:'t9', descricao:'Emboco e reboco interno', ordem:2 },
    { categoria_id:'t9', descricao:'Azulejo e ceramica em areas molhadas', ordem:3 },
    { categoria_id:'t10', descricao:'Instalacao de forro', ordem:1 },
    { categoria_id:'t10', descricao:'Arremates de forro', ordem:2 },
    { categoria_id:'t11', descricao:'Chapisco externo', ordem:1 },
    { categoria_id:'t11', descricao:'Emboco e reboco externo', ordem:2 },
    { categoria_id:'t11', descricao:'Tratamento de fachada', ordem:3 },
    { categoria_id:'t12', descricao:'Selador e massa corrida interna', ordem:1 },
    { categoria_id:'t12', descricao:'Pintura interna', ordem:2 },
    { categoria_id:'t12', descricao:'Pintura externa', ordem:3 },
    { categoria_id:'t12', descricao:'Pintura de esquadrias', ordem:4 },
    { categoria_id:'t13', descricao:'Contrapiso', ordem:1 },
    { categoria_id:'t13', descricao:'Ceramica e porcelanato interno', ordem:2 },
    { categoria_id:'t13', descricao:'Calcada e area externa', ordem:3 },
    { categoria_id:'t13', descricao:'Soleiras e peitoris', ordem:4 },
    { categoria_id:'t14', descricao:'Rodapes', ordem:1 },
    { categoria_id:'t14', descricao:'Pingadeiras', ordem:2 },
    { categoria_id:'t14', descricao:'Arremates gerais', ordem:3 },
    { categoria_id:'t15', descricao:'Eletrodutos e fiacao', ordem:1 },
    { categoria_id:'t15', descricao:'Quadro de distribuicao', ordem:2 },
    { categoria_id:'t15', descricao:'Tomadas e interruptores', ordem:3 },
    { categoria_id:'t15', descricao:'Iluminacao', ordem:4 },
    { categoria_id:'t16', descricao:'Tubulacao de agua fria', ordem:1 },
    { categoria_id:'t16', descricao:'Caixa dagua', ordem:2 },
    { categoria_id:'t16', descricao:'Pontos de agua (pias, chuveiro, vaso)', ordem:3 },
    { categoria_id:'t17', descricao:'Tubulacao de esgoto', ordem:1 },
    { categoria_id:'t17', descricao:'Caixa de inspecao', ordem:2 },
    { categoria_id:'t17', descricao:'Fossa e filtro', ordem:3 },
    { categoria_id:'t17', descricao:'Captacao de aguas pluviais', ordem:4 },
    { categoria_id:'t18', descricao:'Vaso sanitario', ordem:1 },
    { categoria_id:'t18', descricao:'Pia de cozinha', ordem:2 },
    { categoria_id:'t18', descricao:'Lavatorio', ordem:3 },
    { categoria_id:'t18', descricao:'Tanque', ordem:4 },
    { categoria_id:'t18', descricao:'Torneiras e registros', ordem:5 },
    { categoria_id:'t18', descricao:'Chuveiro', ordem:6 },
    { categoria_id:'t19', descricao:'Limpeza final da obra', ordem:1 },
    { categoria_id:'t19', descricao:'Espelhos e acabamentos eletricos', ordem:2 },
    { categoria_id:'t19', descricao:'Caixas de passagem', ordem:3 }
  ],

  // ── Render principal ──
  async render(container) {
    PciModule._container = container;
    container.innerHTML = PciModule._skeleton();
    await PciModule._carregar();
    PciModule._carregado = true;
    requestAnimationFrame(() => {
      container.innerHTML = PciModule._html();
      PciModule._bind(container);
    });
  },

  _skeleton() {
    return '<div style="max-width:1200px;margin:0 auto;padding:20px;">' +
      '<div style="height:80px;background:var(--skeleton,#eee);border-radius:12px;margin-bottom:16px;animation:pulse 1.5s infinite"></div>'.repeat(5) +
    '</div>';
  },

  // ── Carregar dados ──
  async _carregar() {
    // Templates
    try {
      const cats = await sbGet('pci_categorias_template?order=ordem');
      if (cats && cats.length) {
        PciModule.categorias = cats;
        const subs = await sbGet('pci_sub_servicos_template?order=ordem');
        PciModule.subServicos = subs || [];
      } else {
        PciModule.categorias = PciModule._CATS;
        PciModule.subServicos = PciModule._SUBS;
      }
    } catch (e) {
      PciModule.categorias = PciModule._CATS;
      PciModule.subServicos = PciModule._SUBS;
    }

    // Medições
    try {
      const meds = await sbGet('pci_medicao?order=created_at');
      PciModule.medicoes = meds || [];
      if (PciModule.medicoes.length) {
        const ids = PciModule.medicoes.map(m => m.id).join(',');
        const itens = await sbGet('pci_itens?medicao_id=in.(' + ids + ')&order=categoria_nome,created_at');
        PciModule.itens = itens || [];
      } else {
        PciModule.itens = [];
      }
    } catch (e) {
      console.warn('PciModule._carregar:', e);
      PciModule.medicoes = [];
      PciModule.itens = [];
    }

    // Histórico de medições fechadas (PLS 01, PLS 02...)
    try {
      const hist = await sbGet('pci_historico?order=obra_id,numero');
      PciModule.historico = Array.isArray(hist) ? hist : [];
    } catch (e) {
      PciModule.historico = [];
    }

    // Obras que têm cronograma (ao menos 1 tarefa)
    try {
      const tarefas = await sbGet('cronograma_tarefas?select=obra_id');
      PciModule.obrasComCronograma = new Set((tarefas || []).map(t => t.obra_id));
    } catch (e) {
      PciModule.obrasComCronograma = new Set();
    }
  },

  // ── Calcular execução total da medição ──
  // Normaliza pesos dos itens aplicáveis de uma categoria.
  // Se todos têm item_peso: usa direto. Se alguns têm, distribui o restante igualmente.
  // Se nenhum tem: igual (1/N cada).
  _normalizarPesos(aplicaveis) {
    const comPeso = aplicaveis.filter(i => i.item_peso > 0);
    const semPeso = aplicaveis.filter(i => !(i.item_peso > 0));
    if (!semPeso.length) {
      // Todos têm peso definido
      const soma = comPeso.reduce((a, i) => a + parseFloat(i.item_peso), 0);
      return aplicaveis.map(i => ({ id: i.id, w: parseFloat(i.item_peso) / (soma || 100) }));
    }
    if (!comPeso.length) {
      // Nenhum tem peso → igual
      const w = 1 / aplicaveis.length;
      return aplicaveis.map(i => ({ id: i.id, w }));
    }
    // Misturado: com peso declarado + sem peso dividem o restante
    const somaDeclarada = comPeso.reduce((a, i) => a + parseFloat(i.item_peso), 0);
    const restante = Math.max(0, 100 - somaDeclarada);
    const wSemPeso = semPeso.length ? restante / semPeso.length / 100 : 0;
    return aplicaveis.map(i => ({
      id: i.id,
      w: i.item_peso > 0 ? parseFloat(i.item_peso) / 100 : wSemPeso
    }));
  },

  _calcExec(medicaoId) {
    const medicao = PciModule.medicoes.find(m => m.id === medicaoId);
    if (!medicao) return 0;
    const items = PciModule.itens.filter(i => i.medicao_id === medicaoId);
    if (!items.length) return 0;

    const cats = {};
    items.forEach(item => {
      if (!cats[item.categoria_nome]) cats[item.categoria_nome] = { peso: parseFloat(item.categoria_peso) || 0, items: [] };
      cats[item.categoria_nome].items.push(item);
    });

    let total = 0;
    Object.entries(cats).forEach(([catNome, cat]) => {
      let peso = cat.peso;
      if (catNome === 'Coberturas' && medicao.cobertura_peso != null) peso = parseFloat(medicao.cobertura_peso) || 0;
      if (!peso) return;
      const aplicaveis = cat.items.filter(i => !i.nao_aplicavel);
      if (!aplicaveis.length) return;
      const pesos = PciModule._normalizarPesos(aplicaveis);
      const execPeso = aplicaveis.reduce((a, it) => {
        const pw = (pesos.find(p => p.id === it.id) || {}).w || 0;
        return a + (it.executado ? pw : 0);
      }, 0);
      total += peso * execPeso;
    });

    return Math.round(total * 100) / 100;
  },

  // ── Calcular execução por categoria ──
  _calcCatExec(medicaoId, catNome) {
    const items = PciModule.itens.filter(i => i.medicao_id === medicaoId && i.categoria_nome === catNome);
    if (!items.length) return { pct: 0, done: 0, total: 0, na: 0 };
    const naItems = items.filter(i => i.nao_aplicavel);
    const aplicaveis = items.filter(i => !i.nao_aplicavel);
    if (!aplicaveis.length) return { pct: 0, done: 0, total: 0, na: naItems.length };
    const pesos = PciModule._normalizarPesos(aplicaveis);
    const execPeso = aplicaveis.reduce((a, it) => {
      const pw = (pesos.find(p => p.id === it.id) || {}).w || 0;
      return a + (it.executado ? pw : 0);
    }, 0);
    const pct = Math.round(execPeso * 100);
    return { pct, done: aplicaveis.filter(i => i.executado).length, total: aplicaveis.length, na: naItems.length };
  },

  // ── Calcular soma dos pesos da medição ──
  _calcSomaPesos(medicao) {
    let soma = 0;
    PciModule.categorias.forEach(cat => {
      if (cat.nome === 'Coberturas') {
        soma += medicao.cobertura_peso != null ? parseFloat(medicao.cobertura_peso) || 0 : 0;
      } else {
        soma += parseFloat(cat.peso_percentual) || 0;
      }
    });
    return Math.round(soma * 100) / 100;
  },

  _fmtR$(v) {
    return 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },

  _corProg(pct) { return pct >= 80 ? '#2D6A4F' : pct >= 40 ? '#D4A017' : '#C0392B'; },

  // ── HTML Principal ──
  _html() {
    const obrasAtivas = (typeof obras !== 'undefined' ? obras : []).filter(o => !o.arquivada);
    let html = '<div style="max-width:1200px;margin:0 auto;padding:20px;">';

    html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">' +
      '<div>' +
        '<h2 style="font-family:\'Plus Jakarta Sans\',sans-serif;font-size:20px;font-weight:700;margin:0;">PCI — Acompanhamento de Medicoes</h2>' +
        '<div style="font-size:12px;color:var(--texto2);margin-top:4px;">EDR Engenharia · CAIXA/MCMV</div>' +
      '</div>' +
      '<button id="pci-btn-pdf" style="background:#2D6A4F;color:#fff;border:none;border-radius:8px;padding:8px 16px;font-family:inherit;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px;">' +
        '<span class="material-symbols-outlined" style="font-size:16px;">picture_as_pdf</span> Gerar PDF' +
      '</button>' +
    '</div>';

    if (!obrasAtivas.length) {
      html += '<div style="text-align:center;padding:40px;color:var(--texto3);">Nenhuma obra ativa</div>';
    } else {
      obrasAtivas.forEach(obra => { html += PciModule._htmlObraCard(obra); });
    }

    html += '</div>';
    return html;
  },

  _htmlObraCard(obra) {
    const medicao = PciModule.medicoes.find(m => m.obra_id === obra.id);
    const isOpen = PciModule.expanded.has(obra.id);
    const exec = medicao ? PciModule._calcExec(medicao.id) : null;
    const corExec = exec !== null ? PciModule._corProg(exec) : 'var(--texto3)';

    let html = '<div style="background:var(--fundo2);border:1px solid var(--borda);border-radius:12px;margin-bottom:16px;overflow:hidden;">';

    html += '<div class="pci-obra-header" data-id="' + obra.id + '" style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;cursor:pointer;transition:background .15s;">' +
      '<div>' +
        '<div style="font-size:16px;font-weight:700;color:#2D6A4F;">' + esc(obra.nome) + '</div>' +
        '<div style="font-size:12px;color:var(--texto2);margin-top:4px;">' +
          (medicao ? (obra.valor_venda ? PciModule._fmtR$(obra.valor_venda) + ' · ' : '') + 'PCI ativo' : 'Sem PCI gerado') +
        '</div>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:12px;">';

    if (exec !== null) {
      html += '<div style="width:120px;height:8px;background:var(--borda);border-radius:4px;overflow:hidden;">' +
        '<div style="height:100%;width:' + exec + '%;background:' + corExec + ';border-radius:4px;transition:width .3s;"></div>' +
      '</div>' +
      '<div style="font-size:20px;font-weight:700;min-width:60px;text-align:right;color:' + corExec + ';">' + exec.toFixed(1) + '%</div>';
    } else {
      html += '<div style="font-size:13px;color:var(--texto3);min-width:60px;text-align:right;">—</div>';
    }

    html += '<span class="material-symbols-outlined" style="font-size:20px;color:var(--texto3);transition:transform .2s;' + (isOpen ? 'transform:rotate(90deg);color:#2D6A4F;' : '') + '">chevron_right</span>' +
    '</div></div>';

    if (isOpen) {
      html += '<div style="padding:0 20px 20px;border-top:1px solid var(--borda);">';
      html += medicao ? PciModule._htmlMedicaoBody(medicao, obra) : PciModule._htmlCriarMedicao(obra);
      html += '</div>';
    }

    html += '</div>';
    return html;
  },

  _htmlCriarMedicao(obra) {
    const temCronograma = PciModule.obrasComCronograma.has(obra.id);
    if (!temCronograma) {
      return '<div style="padding:32px;text-align:center;">' +
        '<span class="material-symbols-outlined" style="font-size:48px;color:var(--texto3);display:block;margin-bottom:12px;">schedule</span>' +
        '<div style="font-size:15px;font-weight:600;margin-bottom:8px;">Cronograma não anexado</div>' +
        '<div style="font-size:13px;color:var(--texto2);margin-bottom:8px;">Anexe o cronograma desta obra antes de gerar a PCI.</div>' +
        '<div style="font-size:12px;color:var(--texto3);">Acesse <strong>Cronograma</strong> e importe o arquivo desta obra.</div>' +
      '</div>';
    }
    return '<div style="padding:32px;text-align:center;">' +
      '<span class="material-symbols-outlined" style="font-size:48px;color:var(--texto3);display:block;margin-bottom:12px;">assignment</span>' +
      '<div style="font-size:15px;font-weight:600;margin-bottom:8px;">Nenhuma PCI para esta obra</div>' +
      '<div style="font-size:13px;color:var(--texto2);margin-bottom:20px;">Gera os 20 sub-serviços CAIXA/MCMV pré-carregados automaticamente</div>' +
      '<button class="pci-criar-btn" data-obra="' + obra.id + '" style="background:#2D6A4F;color:#fff;border:none;border-radius:8px;padding:10px 24px;font-family:inherit;font-size:14px;font-weight:600;cursor:pointer;">' +
        'Gerar PCI desta Obra' +
      '</button>' +
    '</div>';
  },

  _htmlMedicaoBody(medicao, obra) {
    const exec = PciModule._calcExec(medicao.id);
    const corExec = PciModule._corProg(exec);
    const itensMedicao = PciModule.itens.filter(i => i.medicao_id === medicao.id);
    const feitos = itensMedicao.filter(i => i.executado && !i.nao_aplicavel).length;
    const aplicaveis = itensMedicao.filter(i => !i.nao_aplicavel).length;
    const somaPesos = PciModule._calcSomaPesos(medicao);
    const somaDiff = Math.abs(somaPesos - 100) > 0.1;

    let html = '';

    // Stats
    html += '<div style="display:flex;gap:12px;margin:16px 0;flex-wrap:wrap;">';
    html += PciModule._stat(exec.toFixed(1) + '%', 'Executado', corExec);
    html += PciModule._stat(feitos + '/' + aplicaveis, 'Sub-servicos', 'var(--texto)');
    if (obra.valor_venda) html += PciModule._stat(PciModule._fmtR$(obra.valor_venda * exec / 100), 'Valor executado', '#2D6A4F');
    html += PciModule._stat(somaPesos.toFixed(2) + '%', 'Soma dos pesos', somaDiff ? '#D97706' : '#2D6A4F');
    html += '</div>';

    // Aviso soma ≠ 100%
    if (somaDiff) {
      const diff = (somaPesos - 100).toFixed(2);
      html += '<div style="background:rgba(217,119,6,0.1);border:1px solid rgba(217,119,6,0.3);border-radius:8px;padding:10px 14px;margin-bottom:12px;font-size:13px;color:#D97706;">' +
        '<span class="material-symbols-outlined" style="font-size:16px;vertical-align:middle;margin-right:6px;">warning</span>' +
        'Soma dos pesos: <strong>' + somaPesos.toFixed(2) + '%</strong>' +
        (somaDiff ? ' (' + (parseFloat(diff) > 0 ? '+' : '') + diff + '% em relação a 100%). ' : '') +
        'Ajuste o peso de <strong>Coberturas</strong> para fechar 100%.' +
      '</div>';
    }

    // Categorias
    PciModule.categorias.forEach(cat => {
      html += PciModule._htmlCategoria(cat, medicao);
    });

    // Histórico PLS
    const histObra = (Array.isArray(PciModule.historico) ? PciModule.historico : []).filter(function(h) { return h.obra_id === medicao.obra_id; })
      .sort(function(a, b) { return a.numero - b.numero; });
    if (histObra.length) {
      html += '<div style="margin-top:20px;border-top:1px solid var(--borda);padding-top:16px;">';
      html += '<div style="font-size:12px;font-weight:700;color:var(--texto2);letter-spacing:.05em;margin-bottom:10px;">HISTÓRICO DE MEDIÇÕES</div>';
      html += '<div style="display:flex;flex-direction:column;gap:6px;">';
      histObra.forEach(function(h) {
        const plsLabel = 'PLS ' + String(h.numero).padStart(2, '0');
        const dataFmt = h.data_fechamento ? h.data_fechamento.split('-').reverse().join('/') : '—';
        const valorFmt = h.valor_executado ? PciModule._fmtR$(h.valor_executado) : '—';
        html += '<div style="display:flex;align-items:center;gap:12px;padding:8px 12px;background:var(--bg2);border-radius:8px;border:1px solid var(--borda);">'
          + '<span style="font-size:12px;font-weight:700;color:#2D6A4F;min-width:52px;">' + plsLabel + '</span>'
          + '<span style="font-size:12px;color:var(--texto2);">' + dataFmt + '</span>'
          + '<span style="font-size:13px;font-weight:600;color:var(--texto);margin-left:auto;">' + h.exec_pct.toFixed(1) + '%</span>'
          + '<span style="font-size:13px;font-weight:700;color:#2D6A4F;min-width:110px;text-align:right;">' + valorFmt + '</span>'
          + '<button class="pci-del-pls-btn" data-hid="' + h.id + '" title="Excluir este PLS" style="background:none;border:none;color:var(--texto3);cursor:pointer;padding:2px 4px;display:flex;align-items:center;">'
            + '<span class="material-symbols-outlined" style="font-size:16px;">delete</span>'
          + '</button>'
          + '</div>';
      });
      html += '</div></div>';
    }

    // Ações
    html += '<div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--borda);display:flex;justify-content:flex-end;gap:8px;">';
    if (!histObra.length && medicao.data_levantamento) {
      html += '<div style="font-size:12px;color:var(--texto2);align-self:center;">Ultima medicao fechada: ' + medicao.data_levantamento + '</div>';
    }
    html += '<button class="pci-excluir-btn" data-med="' + medicao.id + '" data-obra="' + esc(obra.nome) + '" style="background:none;border:1px solid rgba(220,38,38,0.2);color:#dc2626;padding:8px 14px;border-radius:8px;cursor:pointer;font-family:inherit;font-size:12px;font-weight:600;display:flex;align-items:center;gap:6px;">' +
      '<span class="material-symbols-outlined" style="font-size:15px;">restart_alt</span> Resetar PCI' +
    '</button>';
    html += '<button class="pci-fechar-btn" data-med="' + medicao.id + '" data-obra="' + esc(obra.nome) + '" data-valor="' + (obra.valor_venda || 0) + '" data-exec="' + exec.toFixed(2) + '" style="background:rgba(45,106,79,0.1);border:1px solid rgba(45,106,79,0.3);color:#2D6A4F;padding:8px 16px;border-radius:8px;cursor:pointer;font-family:inherit;font-size:13px;font-weight:600;display:flex;align-items:center;gap:6px;">' +
      '<span class="material-symbols-outlined" style="font-size:16px;">check_circle</span> Fechar Medicao' +
    '</button></div>';

    return html;
  },

  _htmlCategoria(cat, medicao) {
    const catKey = medicao.id + '-' + cat.nome;
    const isOpen = PciModule.expandedCats.has(catKey);
    const itensCat = PciModule.itens.filter(i => i.medicao_id === medicao.id && i.categoria_nome === cat.nome);
    const hasItems = itensCat.length > 0;

    let peso = parseFloat(cat.peso_percentual) || 0;
    if (cat.nome === 'Coberturas' && medicao.cobertura_peso != null) peso = parseFloat(medicao.cobertura_peso) || 0;

    const { pct, done, total, na } = PciModule._calcCatExec(medicao.id, cat.nome);
    const corPct = PciModule._corProg(pct);

    let html = '<div style="border:1px solid var(--borda);border-radius:8px;margin-bottom:6px;overflow:hidden;">';

    // Header categoria
    html += '<div class="pci-cat-header" data-key="' + catKey + '" style="display:flex;align-items:center;gap:10px;padding:10px 14px;cursor:pointer;background:var(--fundo);user-select:none;">' +
      '<span style="font-size:11px;font-weight:700;color:var(--texto3);min-width:20px;text-align:right;">' + cat.ordem + '</span>' +
      '<div style="flex:1;min-width:0;">' +
        '<div style="font-size:13px;font-weight:600;">' + esc(cat.nome) + '</div>' +
        (hasItems
          ? '<div style="font-size:11px;color:var(--texto2);margin-top:1px;">' + done + '/' + total + ' feitos' + (na ? ' · ' + na + ' N/A' : '') + '</div>'
          : '<div style="font-size:11px;color:var(--texto3);">sem itens</div>') +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:8px;flex-shrink:0;" onclick="event.stopPropagation();">';

    if (cat.nome === 'Coberturas') {
      html += '<input type="number" class="pci-cob-peso" data-med="' + medicao.id + '" value="' + peso + '" min="0" max="30" step="0.01" style="width:64px;padding:4px 6px;border:1px solid #2D6A4F;border-radius:6px;font-size:12px;text-align:center;background:var(--fundo);" title="Peso editavel para Coberturas">' +
        '<span style="font-size:11px;color:var(--texto2);">%</span>';
    } else {
      html += '<span style="font-size:12px;color:var(--texto2);font-family:\'Space Grotesk\',monospace;">' + peso.toFixed(2) + '%</span>';
    }

    if (hasItems) {
      html += '<div style="width:64px;height:5px;background:var(--borda);border-radius:3px;overflow:hidden;">' +
        '<div style="height:100%;width:' + pct + '%;background:' + corPct + ';border-radius:3px;"></div>' +
      '</div>' +
      '<span style="font-size:12px;font-weight:700;color:' + corPct + ';min-width:32px;text-align:right;font-family:\'Space Grotesk\',monospace;">' + pct + '%</span>';
    }

    html += '<span class="material-symbols-outlined" style="font-size:18px;color:var(--texto3);transition:transform .2s;pointer-events:none;' + (isOpen ? 'transform:rotate(90deg);color:#2D6A4F;' : '') + '">chevron_right</span>' +
    '</div></div>';

    // Body categoria
    if (isOpen) {
      html += '<div style="padding:8px 14px 12px;background:var(--fundo2);">';

      itensCat.forEach(item => { html += PciModule._htmlItem(item); });

      // Adicionar manual
      html += '<div style="display:flex;gap:8px;margin-top:10px;padding-top:8px;border-top:1px solid var(--borda);">' +
        '<input type="text" class="pci-manual-desc" data-med="' + medicao.id + '" data-cat="' + esc(cat.nome) + '" data-peso="' + peso + '" placeholder="Adicionar sub-servico..." ' +
          'style="flex:1;padding:6px 10px;border:1px solid var(--borda);border-radius:6px;font-family:inherit;font-size:13px;background:var(--fundo);">' +
        '<button class="pci-manual-btn" data-med="' + medicao.id + '" data-cat="' + esc(cat.nome) + '" data-peso="' + peso + '" ' +
          'style="background:#2D6A4F;color:#fff;border:none;border-radius:6px;padding:6px 12px;cursor:pointer;" title="Adicionar">' +
          '<span class="material-symbols-outlined" style="font-size:16px;vertical-align:middle;">add</span>' +
        '</button>' +
      '</div>';

      html += '</div>';
    }

    html += '</div>';
    return html;
  },

  _htmlItem(item) {
    const esmaecido = item.nao_aplicavel ? 'opacity:0.45;' : '';
    const riscado = (item.executado && !item.nao_aplicavel) ? 'text-decoration:line-through;color:var(--texto3);' : '';
    const pesoBadge = item.item_peso > 0
      ? '<input type="number" class="pci-item-peso" data-id="' + item.id + '" value="' + parseFloat(item.item_peso).toFixed(1) + '" min="0" max="100" step="0.1" title="Peso deste item na categoria (%)" style="width:52px;padding:3px 5px;border:1px solid rgba(45,106,79,0.3);border-radius:5px;font-size:11px;text-align:center;background:rgba(45,106,79,0.06);color:#2D6A4F;font-weight:600;"><span style="font-size:10px;color:var(--texto3);">%</span>'
      : '<input type="number" class="pci-item-peso" data-id="' + item.id + '" value="" min="0" max="100" step="0.1" placeholder="auto" title="Peso deste item na categoria (%)" style="width:52px;padding:3px 5px;border:1px solid var(--borda);border-radius:5px;font-size:11px;text-align:center;background:var(--fundo);color:var(--texto3);"><span style="font-size:10px;color:var(--texto3);">%</span>';
    return '<div class="pci-item-row" style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--borda);' + esmaecido + '">' +
      '<input type="checkbox" class="pci-check-exec" data-id="' + item.id + '" ' +
        (item.executado ? 'checked ' : '') +
        (item.nao_aplicavel ? 'disabled ' : '') +
        'style="width:16px;height:16px;accent-color:#2D6A4F;cursor:pointer;flex-shrink:0;">' +
      '<span style="flex:1;font-size:13px;' + riscado + (item.manual ? 'font-style:italic;' : '') + '">' + esc(item.sub_servico_descricao) + '</span>' +
      (item.manual ? '<span style="font-size:10px;background:rgba(45,106,79,0.12);color:#2D6A4F;padding:2px 6px;border-radius:4px;font-weight:600;flex-shrink:0;">manual</span>' : '') +
      pesoBadge +
      '<button class="pci-na-btn" data-id="' + item.id + '" ' +
        'style="background:' + (item.nao_aplicavel ? 'rgba(220,38,38,0.1)' : 'transparent') + ';border:1px solid ' + (item.nao_aplicavel ? '#DC2626' : 'var(--borda)') + ';border-radius:5px;padding:3px 8px;cursor:pointer;font-size:11px;color:' + (item.nao_aplicavel ? '#DC2626' : 'var(--texto3)') + ';flex-shrink:0;" ' +
        'title="' + (item.nao_aplicavel ? 'Reativar' : 'Nao aplicavel') + '">' +
        'N/A' +
      '</button>' +
      (item.manual
        ? '<button class="pci-del-btn" data-id="' + item.id + '" style="background:transparent;border:none;cursor:pointer;color:var(--texto3);padding:2px;flex-shrink:0;" title="Remover">' +
            '<span class="material-symbols-outlined" style="font-size:16px;">delete</span>' +
          '</button>'
        : '') +
    '</div>';
  },

  _stat(valor, label, cor) {
    return '<div style="background:var(--fundo);border:1px solid var(--borda);border-radius:8px;padding:10px 14px;flex:1;min-width:110px;">' +
      '<div style="font-family:\'Space Grotesk\',monospace;font-size:15px;font-weight:700;color:' + cor + ';line-height:1;margin-bottom:4px;">' + valor + '</div>' +
      '<div style="font-size:10px;color:var(--texto2);text-transform:uppercase;letter-spacing:.5px;">' + label + '</div>' +
    '</div>';
  },

  // ── Bind ──
  _bind(container) {
    // Toggle obra
    container.querySelectorAll('.pci-obra-header').forEach(h => {
      h.addEventListener('click', () => {
        const id = h.dataset.id;
        if (PciModule.expanded.has(id)) PciModule.expanded.delete(id);
        else PciModule.expanded.add(id);
        PciModule._rerender();
      });
    });

    // Criar medição
    container.querySelectorAll('.pci-criar-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!PciModule.obrasComCronograma.has(btn.dataset.obra)) {
          showToast('Anexe o cronograma desta obra antes de gerar a PCI.', 'error');
          return;
        }
        btn.disabled = true;
        btn.textContent = 'Gerando...';
        await PciModule._criarMedicao(btn.dataset.obra);
        PciModule._rerender();
      });
    });

    // Toggle categoria
    container.querySelectorAll('.pci-cat-header').forEach(h => {
      h.addEventListener('click', () => {
        const key = h.dataset.key;
        if (PciModule.expandedCats.has(key)) PciModule.expandedCats.delete(key);
        else PciModule.expandedCats.add(key);
        PciModule._rerender();
      });
    });

    // Checkbox executado
    container.querySelectorAll('.pci-check-exec').forEach(cb => {
      cb.addEventListener('change', async () => {
        await PciModule._toggleItem(cb.dataset.id, 'executado', cb.checked);
        PciModule._rerender();
      });
    });

    // N/A
    container.querySelectorAll('.pci-na-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const item = PciModule.itens.find(i => i.id === btn.dataset.id);
        if (!item) return;
        const novoNA = !item.nao_aplicavel;
        await PciModule._toggleItem(btn.dataset.id, 'nao_aplicavel', novoNA);
        // Se marcou NA, desmarcar executado
        if (novoNA && item.executado) await PciModule._toggleItem(btn.dataset.id, 'executado', false);
        PciModule._rerender();
      });
    });

    // Deletar item manual
    container.querySelectorAll('.pci-del-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await PciModule._removerItem(btn.dataset.id);
        PciModule._rerender();
      });
    });

    // Peso individual por item
    container.querySelectorAll('.pci-item-peso').forEach(input => {
      input.addEventListener('change', async (e) => {
        e.stopPropagation();
        const id = input.dataset.id;
        const val = input.value === '' ? null : parseFloat(input.value) || 0;
        const item = PciModule.itens.find(i => i.id === id);
        if (!item) return;
        item.item_peso = val;
        await sbPatch('pci_itens?id=eq.' + id, { item_peso: val });
        PciModule._rerender();
      });
      input.addEventListener('click', e => e.stopPropagation());
    });

    // Coberturas peso
    container.querySelectorAll('.pci-cob-peso').forEach(input => {
      input.addEventListener('change', async (e) => {
        e.stopPropagation();
        const val = parseFloat(input.value) || 0;
        await PciModule._editarCoberturas(input.dataset.med, val);
        PciModule._rerender();
      });
    });

    // Adicionar manual — botão
    container.querySelectorAll('.pci-manual-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const row = btn.parentElement;
        const inp = row.querySelector('.pci-manual-desc');
        const desc = inp ? inp.value.trim() : '';
        if (!desc) return;
        inp.value = '';
        await PciModule._adicionarManual(btn.dataset.med, btn.dataset.cat, parseFloat(btn.dataset.peso) || 0, desc);
        PciModule._rerender();
      });
    });

    // Adicionar manual — Enter
    container.querySelectorAll('.pci-manual-desc').forEach(inp => {
      inp.addEventListener('keydown', async (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const desc = inp.value.trim();
        if (!desc) return;
        inp.value = '';
        await PciModule._adicionarManual(inp.dataset.med, inp.dataset.cat, parseFloat(inp.dataset.peso) || 0, desc);
        PciModule._rerender();
      });
      inp.addEventListener('click', e => e.stopPropagation());
    });

    // Fechar medição
    container.querySelectorAll('.pci-fechar-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        PciModule._fecharMedicao(btn.dataset.med, btn.dataset.obra, parseFloat(btn.dataset.valor) || 0, parseFloat(btn.dataset.exec) || 0);
      });
    });

    // Resetar PCI (apaga tudo)
    container.querySelectorAll('.pci-excluir-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        PciModule._excluirMedicao(btn.dataset.med, btn.dataset.obra);
      });
    });

    // Excluir PLS individual do histórico
    container.querySelectorAll('.pci-del-pls-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        PciModule._excluirPls(btn.dataset.hid);
      });
    });

    // PDF
    const btnPdf = container.querySelector('#pci-btn-pdf');
    if (btnPdf) btnPdf.addEventListener('click', () => PciModule._gerarPdf());
  },

  _rerender() {
    if (!PciModule._container) return;
    requestAnimationFrame(() => {
      PciModule._container.innerHTML = PciModule._html();
      PciModule._bind(PciModule._container);
    });
  },

  // ── Criar medição (auto-gera itens do template) ──
  async _criarMedicao(obraId) {
    const med = await sbPost('pci_medicao', { obra_id: obraId, houve_repactuacao: false });
    if (!med || !med.id) { console.error('Falha ao criar pci_medicao'); return; }
    PciModule.medicoes.push(med);

    const itensParaInserir = [];
    PciModule.categorias.forEach(cat => {
      if (cat.nome === 'Outros Servicos') return;
      const subsCat = PciModule.subServicos.filter(s => s.categoria_id === cat.id);
      subsCat.forEach(sub => {
        itensParaInserir.push({
          medicao_id: med.id,
          categoria_nome: cat.nome,
          categoria_peso: parseFloat(cat.peso_percentual) || 0,
          sub_servico_descricao: sub.descricao,
          executado: false,
          nao_aplicavel: false,
          manual: false
        });
      });
    });

    if (itensParaInserir.length) {
      const ok = await sbPostMinimal('pci_itens', itensParaInserir);
      if (!ok) { console.error('Falha ao inserir pci_itens'); return; }
      const itens = await sbGet('pci_itens?medicao_id=eq.' + med.id + '&order=categoria_nome,created_at');
      if (itens) PciModule.itens.push(...itens);
    }
  },

  // ── Toggle campo de item ──
  async _toggleItem(itemId, field, value) {
    const item = PciModule.itens.find(i => i.id === itemId);
    if (!item) return;
    item[field] = value;
    await sbPatch('pci_itens?id=eq.' + itemId, { [field]: value });
  },

  // ── Editar peso de Coberturas ──
  async _editarCoberturas(medicaoId, novoPeso) {
    const med = PciModule.medicoes.find(m => m.id === medicaoId);
    if (!med) return;
    med.cobertura_peso = novoPeso;
    await sbPatch('pci_medicao?id=eq.' + medicaoId, { cobertura_peso: novoPeso });
    // Atualiza categoria_peso nos itens de Coberturas para consistência
    PciModule.itens
      .filter(i => i.medicao_id === medicaoId && i.categoria_nome === 'Coberturas')
      .forEach(i => { i.categoria_peso = novoPeso; });
  },

  // ── Adicionar sub-serviço manual ──
  async _adicionarManual(medicaoId, catNome, catPeso, descricao) {
    const item = await sbPost('pci_itens', {
      medicao_id: medicaoId,
      categoria_nome: catNome,
      categoria_peso: catPeso,
      sub_servico_descricao: descricao,
      executado: false,
      nao_aplicavel: false,
      manual: true
    });
    if (item && item.id) PciModule.itens.push(item);
  },

  // ── Remover item manual ──
  async _removerItem(itemId) {
    await sbDelete('pci_itens?id=eq.' + itemId);
    PciModule.itens = PciModule.itens.filter(i => i.id !== itemId);
  },

  // ── Fechar medição ──
  _fecharMedicao(medicaoId, obNome, valorVenda, execPct) {
    const med = PciModule.medicoes.find(m => m.id === medicaoId);
    if (!med) return;
    const exec = execPct || PciModule._calcExec(medicaoId);
    const dataHoje = new Date().toISOString().slice(0, 10);
    const dataFmt = dataHoje.split('-').reverse().join('/');
    const valorExec = valorVenda ? valorVenda * exec / 100 : null;
    const histObra = PciModule.historico.filter(h => h.obra_id === med.obra_id);
    const proximoNum = histObra.length + 1;
    const plsLabel = 'PLS ' + String(proximoNum).padStart(2, '0');

    let msg = 'Fechar ' + plsLabel + ' de ' + (obNome || '') + '?\n\nExecucao acumulada: ' + exec.toFixed(2) + '%';
    if (valorExec) msg += '\nValor executado: ' + PciModule._fmtR$(valorExec);
    msg += '\nData: ' + dataFmt;

    confirmar(msg, async () => {
      await sbPatch('pci_medicao?id=eq.' + medicaoId, { data_levantamento: dataHoje });
      med.data_levantamento = dataHoje;
      // Salvar snapshot no histórico
      try {
        const snap = await sbPost('pci_historico', {
          obra_id: med.obra_id,
          medicao_id: medicaoId,
          numero: proximoNum,
          data_fechamento: dataHoje,
          exec_pct: parseFloat(exec.toFixed(2)),
          valor_executado: valorExec ? parseFloat(valorExec.toFixed(2)) : null
        });
        if (snap && snap.id) PciModule.historico.push(snap);
      } catch(e) { console.warn('[PCI-HISTORICO] erro ao salvar snapshot:', e); }
      PciModule._rerender();
    });
  },

  async _excluirMedicao(medicaoId, obNome) {
    confirmar('RESETAR PCI de ' + (obNome || '') + '?\n\nIsso apaga TODOS os itens importados e o histórico desta obra. Use só para reimportar do zero.', async () => {
      try {
        await sbDelete('pci_itens', '?medicao_id=eq.' + medicaoId);
        await sbDelete('pci_historico', '?medicao_id=eq.' + medicaoId);
        await sbDelete('pci_medicao', '?id=eq.' + medicaoId);
        PciModule.medicoes = PciModule.medicoes.filter(m => m.id !== medicaoId);
        PciModule.itens = PciModule.itens.filter(i => i.medicao_id !== medicaoId);
        PciModule.historico = PciModule.historico.filter(h => h.medicao_id !== medicaoId);
        PciModule._rerender();
        showToast('PCI resetada');
      } catch(e) {
        console.error('[PCI-RESETAR]', e);
        showToast('Erro ao resetar PCI');
      }
    });
  },

  async _excluirPls(histId) {
    confirmar('Excluir este registro de medição fechada?\n\nOs dados da PCI continuam intactos.', async () => {
      try {
        await sbDelete('pci_historico', '?id=eq.' + histId);
        PciModule.historico = PciModule.historico.filter(h => h.id !== histId);
        // Renumerar em memória
        const obraId = (PciModule.historico.find(h => h.id === histId) || {}).obra_id;
        PciModule._rerender();
        showToast('Medição removida do histórico');
      } catch(e) {
        showToast('Erro ao excluir medição');
      }
    });
  },

  // ── PDF ──
  _gerarPdf() {
    if (typeof PdfModule === 'undefined' || !PdfModule.gerarPCI) {
      console.error('PdfModule.gerarPCI nao disponivel');
      return;
    }
    const obrasAtivas = (typeof obras !== 'undefined' ? obras : []).filter(o => !o.arquivada);
    const dados = obrasAtivas.map(obra => {
      const med = PciModule.medicoes.find(m => m.obra_id === obra.id);
      if (!med) return null;
      const exec = PciModule._calcExec(med.id);
      const etapas = PciModule.categorias.map(cat => {
        let peso = parseFloat(cat.peso_percentual) || 0;
        if (cat.nome === 'Coberturas' && med.cobertura_peso != null) peso = parseFloat(med.cobertura_peso) || 0;
        const { pct } = PciModule._calcCatExec(med.id, cat.nome);
        return { nome: cat.nome, peso, exec: pct, valor: obra.valor_venda ? obra.valor_venda * peso / 100 : 0 };
      }).filter(e => e.peso > 0);
      return {
        nome: obra.nome,
        entrega: '—',
        valor: obra.valor_venda || 0,
        execTotal: exec,
        medidoAnterior: 0,
        valorMensal: 0,
        etapas,
        historico: []
      };
    }).filter(Boolean);
    PdfModule.gerarPCI(dados);
  }
};

// ── Registro no viewRegistry ──
if (typeof viewRegistry !== 'undefined') {
  viewRegistry.register('pci', (container) => PciModule.render(container));
}
