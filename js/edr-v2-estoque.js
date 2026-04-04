// ══════════════════════════════════════════════════════════════════
// EDR System V2 — Modulo: ESTOQUE & MATERIAIS
// Depende: api.js, utils.js, config.js, obras.js (ETAPAS),
//          notas.js (notas), auth.js, menu.js, dashboard.js
// Auditado por: GM (Gemini) — 04/04/2026
// ══════════════════════════════════════════════════════════════════

// ── ESTADO ENCAPSULADO ──────────────────────────────────────────
const EstoqueModule = {
  // Tab ativa
  tab: 'estoque',           // 'estoque' | 'catalogo'

  // Estado do estoque
  ordem: 'az',              // 'az' | 'za' | 'maior' | 'menor'
  filtroObra: '',            // obra selecionada ('' = almoxarifado geral)
  filtroBusca: '',           // texto de busca
  filtroCategoria: null,     // etapa selecionada na sidebar
  filtroNegativos: false,    // chip negativos ativo
  filtroSemCodigo: false,    // chip sem codigo ativo
  page: 0,                  // paginacao (0-indexed)
  pageSize: 50,             // itens por pagina

  // Estado do catalogo
  catBusca: '',             // busca no catalogo
  catFiltroAuto: false,     // mostrar apenas AUTO pendentes
  catPage: 0,

  // Dados consolidados (cache local, invalidado a cada render)
  _consolidado: [],          // resultado de consolidarEstoque()
  _valorTotal: 0,            // valor total calculado

  // Catalogo
  catalogoMateriais: [],     // array do catalogo carregado
  _editandoId: null,         // material em edicao

  // Orfaos
  _orfaos: [],

  // Debounce
  _buscaTimer: null,
  _catBuscaTimer: null,
};


// ── REGISTRO NO VIEW REGISTRY ───────────────────────────────────
if (typeof viewRegistry !== 'undefined') {
  viewRegistry.register('estoque', renderEstoqueView);
  viewRegistry.register('catalogo', () => { EstoqueModule.tab = 'catalogo'; renderEstoqueView(); });
}


// ══════════════════════════════════════════════════════════════════
// RENDER PRINCIPAL
// ══════════════════════════════════════════════════════════════════
function renderEstoqueView() {
  if (EstoqueModule.tab === 'catalogo') {
    _showTabCatalogo();
  } else {
    _showTabEstoque();
  }
  aplicarPerfil();
}

function _showTabEstoque() {
  const tabEst = document.getElementById('tab-estoque');
  const tabCat = document.getElementById('tab-catalogo');
  if (tabEst) tabEst.style.display = '';
  if (tabCat) tabCat.style.display = 'none';
  _updateTabButtons('estoque');
  renderEstoque();
}

function _showTabCatalogo() {
  const tabEst = document.getElementById('tab-estoque');
  const tabCat = document.getElementById('tab-catalogo');
  if (tabEst) tabEst.style.display = 'none';
  if (tabCat) tabCat.style.display = '';
  _updateTabButtons('catalogo');
  renderCatalogo();
}

function _updateTabButtons(active) {
  document.querySelectorAll('.tab-btn').forEach((b, i) => {
    b.classList.toggle('active', (i === 0 && active === 'estoque') || (i === 1 && active === 'catalogo'));
  });
  const h = document.getElementById('header-title');
  if (h) h.textContent = active === 'estoque' ? 'Estoque' : 'Catalogo de Materiais';
}

function switchTab(tab) {
  EstoqueModule.tab = tab;
  EstoqueModule.page = 0;
  EstoqueModule.catPage = 0;
  renderEstoqueView();
}


// ══════════════════════════════════════════════════════════════════
// CONSOLIDACAO DE ESTOQUE
// Matching conservador: 1) codigo catalogo, 2) nome exato
// Sem fuzzy match — itens nao identificados viram orfaos
// ══════════════════════════════════════════════════════════════════

function consolidarEstoque(obraId) {
  const mapa = {}; // chave → { desc, codigo, un, cat, entradas, saidas, ajustes, lotes, temNF }

  // Helper: chave conservadora (sem adivinhacao)
  function getChave(desc, codigoCat) {
    if (codigoCat) return 'COD:' + codigoCat;
    return 'NOME:' + norm(desc);
  }

  // Helper: garantir entrada no mapa
  function garantir(chave, desc, codigoCat, un) {
    if (!mapa[chave]) {
      // Tentar achar no catalogo pelo codigo
      let catItem = null;
      if (codigoCat) {
        catItem = EstoqueModule.catalogoMateriais.find(m => m.codigo === codigoCat);
      }
      // Tentar achar por nome exato
      if (!catItem && desc) {
        const nDesc = norm(desc);
        catItem = EstoqueModule.catalogoMateriais.find(m => norm(m.nome) === nDesc);
      }

      // Categoria via ETAPAS (fonte unica — CATS_ESTOQUE eliminado)
      const categoria = catItem?.categoria || _categoriaPorEtapas(desc) || 'Outros';

      mapa[chave] = {
        desc: catItem?.nome || desc,
        codigo: catItem?.codigo || codigoCat || null,
        unidade: catItem?.unidade || un || 'UN',
        categoria,
        entradas: 0,
        entradasDiretas: 0,
        saidas: 0,
        ajustes: 0,
        valorTotal: 0,
        lotes: [],         // { nota_id, data, qtd, qtd_disponivel, valor_un }
        temNF: false,
        semCodigo: !catItem?.codigo && !codigoCat,
        nfPendente: false,
      };
    }
    return mapa[chave];
  }

  // 1) ENTRADAS VIA NF
  const notasFiltradas = obraId
    ? notas.filter(n => n.obra === obraId)
    : notas;

  for (const n of notasFiltradas) {
    const itens = parseItens(n);
    for (const it of itens) {
      const chave = getChave(it.descricao, it.codigo_catalogo);
      const item = garantir(chave, it.descricao, it.codigo_catalogo, it.unidade);
      const qtd = parseFloat(it.quantidade) || 0;
      const valorUn = parseFloat(it.preco_unitario) || 0;
      item.entradas += qtd;
      item.valorTotal += qtd * valorUn;
      item.temNF = true;
      item.lotes.push({
        nota_id: n.id,
        nf: n.numero_nf,
        fornecedor: n.fornecedor,
        data: n.data,
        qtd,
        qtd_disponivel: qtd, // sera reduzido pelas distribuicoes
        valor_un: valorUn,
      });
    }
  }

  // 2) ENTRADAS DIRETAS (se existir array global)
  if (typeof entradas_diretas !== 'undefined' && Array.isArray(entradas_diretas)) {
    const edFiltradas = obraId
      ? entradas_diretas.filter(e => e.obra_id === obraId)
      : entradas_diretas;

    for (const e of edFiltradas) {
      const chave = getChave(e.item_desc, e.codigo_catalogo);
      const item = garantir(chave, e.item_desc, e.codigo_catalogo, e.unidade);
      const qtd = parseFloat(e.qtd) || 0;
      const preco = parseFloat(e.preco) || 0;
      item.entradasDiretas += qtd;
      item.valorTotal += qtd * preco;
      if (!item.temNF) item.nfPendente = true;
    }
  }

  // 3) AJUSTES DE ESTOQUE
  if (typeof ajustes_estoque !== 'undefined' && Array.isArray(ajustes_estoque)) {
    const ajFiltrados = obraId
      ? ajustes_estoque.filter(a => a.obra_id === obraId)
      : ajustes_estoque;

    for (const a of ajFiltrados) {
      const chave = getChave(a.item_desc, a.codigo_catalogo);
      const item = garantir(chave, a.item_desc, a.codigo_catalogo, a.unidade);
      item.ajustes += parseFloat(a.qtd) || 0;
    }
  }

  // 4) DISTRIBUICOES (SAIDAS)
  if (typeof distribuicoes !== 'undefined' && Array.isArray(distribuicoes)) {
    const distFiltradas = obraId
      ? distribuicoes.filter(d => d.obra_destino === obraId)
      : distribuicoes;

    for (const d of distFiltradas) {
      const chave = getChave(d.item_desc, d.codigo_catalogo);
      const item = garantir(chave, d.item_desc, d.codigo_catalogo, d.unidade);
      const qtd = parseFloat(d.qtd) || 0;
      item.saidas += qtd;

      // Consumir FIFO dos lotes
      let restante = qtd;
      for (const lote of item.lotes) {
        if (restante <= 0) break;
        const consumir = Math.min(lote.qtd_disponivel, restante);
        lote.qtd_disponivel -= consumir;
        restante -= consumir;
      }
    }
  }

  // Calcular saldo e montar resultado
  const resultado = [];
  let valorTotal = 0;

  for (const chave in mapa) {
    const it = mapa[chave];
    const saldo = it.entradas + it.entradasDiretas + it.ajustes - it.saidas;
    const totalEntradas = it.entradas + it.entradasDiretas + it.ajustes;
    const valorMedio = totalEntradas > 0 ? it.valorTotal / totalEntradas : 0;

    resultado.push({
      chave,
      desc: it.desc,
      codigo: it.codigo,
      unidade: it.unidade,
      categoria: it.categoria,
      saldo,
      valorMedio,
      valorEstoque: saldo * valorMedio,
      entradas: it.entradas,
      entradasDiretas: it.entradasDiretas,
      saidas: it.saidas,
      ajustes: it.ajustes,
      lotes: it.lotes,
      temNF: it.temNF,
      semCodigo: it.semCodigo,
      nfPendente: it.nfPendente,
    });

    if (saldo > 0) valorTotal += saldo * valorMedio;
  }

  EstoqueModule._consolidado = resultado;
  EstoqueModule._valorTotal = valorTotal;
  return resultado;
}


// ══════════════════════════════════════════════════════════════════
// CATEGORIA VIA ETAPAS (fonte unica — CATS_ESTOQUE eliminado)
// ══════════════════════════════════════════════════════════════════

function _categoriaPorEtapas(desc) {
  if (!desc || typeof ETAPAS === 'undefined') return null;
  const n = norm(desc);

  // Mapeamento simples: palavras-chave → etapa
  // Usa o array ETAPAS do obras.js como fonte unica
  const mapa = {
    'servicos preliminares': ['lona', 'tapume', 'placa obra', 'locacao', 'sondagem'],
    'fundacao': ['estaca', 'broca', 'sapata', 'radier', 'baldrame'],
    'estrutura': ['cimento', 'concreto', 'areia', 'brita', 'pedra', 'laje', 'vigota', 'tavela', 'pre-moldado'],
    'aco/ferro': ['ferro', 'vergalhao', 'tela soldada', 'arame recozido', 'malha pop', 'aco ca', 'barra aco'],
    'forma/madeira': ['madeira', 'caibro', 'viga', 'ripa', 'sarrafo', 'compensado', 'pontalete', 'forma', 'desmoldante'],
    'alvenaria': ['tijolo', 'bloco', 'argamassa', 'cal ', 'chapisco', 'emboco', 'reboco'],
    'eletrica': ['fio', 'cabo eletrico', 'eletroduto', 'conduite', 'disjuntor', 'tomada', 'interruptor', 'qd', 'luminaria', 'led', 'lampada'],
    'impermeabilizacao': ['impermeabilizante', 'manta asfaltica', 'bianco', 'aditivo', 'veda calha', 'vedante', 'selante', 'silicone'],
    'hidraulica': ['tubo pvc', 'joelho', 'tee', 'luva', 'registro', 'caixa dagua', 'sifao', 'adaptador', 'flange', 'cola pvc'],
    'loucas/metais': ['vaso sanitario', 'pia', 'lavatorio', 'cuba', 'torneira', 'chuveiro', 'ducha', 'acabamento'],
    'esgoto': ['tubo esgoto', 'caixa de gordura', 'caixa sifonada', 'ralo'],
    'cobertura': ['telha', 'cumeeira', 'rufo', 'calha', 'parafuso telha'],
    'esquadrias': ['porta', 'janela', 'batente', 'marco', 'caixilho', 'esquadria', 'fechadura', 'macaneta', 'trinco', 'puxador'],
    'revestimento argamassa': ['massa corrida', 'massa acrilica', 'gesso', 'forro gesso'],
    'revestimento ceramico': ['piso', 'ceramica', 'porcelanato', 'revestimento', 'azulejo', 'rejunte', 'argamassa colante'],
    'granito/pedra': ['granito', 'marmore', 'pedra', 'soleira', 'peitoril'],
    'pintura': ['tinta', 'selador', 'primer', 'textura', 'rolo', 'pincel', 'lixa', 'massa pva'],
    'ferramentas': ['disco', 'serra', 'broca', 'trena', 'nivel', 'espatula', 'desempenadeira', 'colher pedreiro'],
    'epi': ['capacete', 'luva', 'bota', 'oculos', 'protetor auricular', 'cinto seguranca', 'mascara'],
    'limpeza': ['vassoura', 'pa', 'saco lixo', 'detergente', 'acido muriatico'],
    'alimentacao': ['agua mineral', 'cafe', 'acucar', 'copo descartavel'],
  };

  for (const etapa in mapa) {
    for (const palavra of mapa[etapa]) {
      if (n.includes(palavra)) {
        // Retornar o nome da etapa formatado como no ETAPAS
        // Buscar correspondencia no array ETAPAS
        if (Array.isArray(ETAPAS)) {
          const match = ETAPAS.find(e => norm(e.nome || e).includes(etapa));
          if (match) return match.nome || match;
        }
        // Fallback: capitalizar
        return etapa.charAt(0).toUpperCase() + etapa.slice(1);
      }
    }
  }
  return null;
}


// ══════════════════════════════════════════════════════════════════
// RENDER ESTOQUE (tab principal)
// ══════════════════════════════════════════════════════════════════

function renderEstoque() {
  // Consolidar
  const obraId = EstoqueModule.filtroObra || null;
  consolidarEstoque(obraId);

  let itens = [...EstoqueModule._consolidado];

  // Filtrar por categoria
  if (EstoqueModule.filtroCategoria) {
    itens = itens.filter(i => norm(i.categoria) === norm(EstoqueModule.filtroCategoria));
  }

  // Filtrar negativos
  if (EstoqueModule.filtroNegativos) {
    itens = itens.filter(i => i.saldo < 0);
  }

  // Filtrar sem codigo
  if (EstoqueModule.filtroSemCodigo) {
    itens = itens.filter(i => i.semCodigo);
  }

  // Filtrar busca
  if (EstoqueModule.filtroBusca) {
    const b = norm(EstoqueModule.filtroBusca);
    itens = itens.filter(i => norm(i.desc).includes(b) || (i.codigo && i.codigo.includes(b)));
  }

  // Filtrar: so itens com saldo != 0 ou com alertas
  itens = itens.filter(i => i.saldo !== 0 || i.semCodigo || i.nfPendente);

  // Ordenar
  switch (EstoqueModule.ordem) {
    case 'az': itens.sort((a, b) => (a.desc || '').localeCompare(b.desc || '', 'pt-BR')); break;
    case 'za': itens.sort((a, b) => (b.desc || '').localeCompare(a.desc || '', 'pt-BR')); break;
    case 'maior': itens.sort((a, b) => b.saldo - a.saldo); break;
    case 'menor': itens.sort((a, b) => a.saldo - b.saldo); break;
  }

  // Contadores pra summary cards
  const totalItens = itens.length;
  const semCodigo = EstoqueModule._consolidado.filter(i => i.semCodigo).length;
  const negativos = EstoqueModule._consolidado.filter(i => i.saldo < 0).length;

  _renderSummaryCards(EstoqueModule._valorTotal, totalItens, semCodigo, negativos);
  _renderCategoriasSidebar(EstoqueModule._consolidado);

  // Paginacao
  const start = 0;
  const end = (EstoqueModule.page + 1) * EstoqueModule.pageSize;
  const visiveis = itens.slice(start, end);
  const restantes = itens.length - end;

  // Render cards
  const el = document.getElementById('est-mat-grid');
  if (!el) return;

  if (!visiveis.length) {
    el.innerHTML = `<div style="text-align:center;padding:48px;color:var(--text-tertiary);">
      <span class="material-symbols-outlined" style="font-size:48px;opacity:.3;">inventory_2</span>
      <p style="margin-top:12px;">Nenhum material encontrado.</p>
    </div>`;
    return;
  }

  const isAdmin = usuarioAtual?.perfil === 'admin';

  el.innerHTML = visiveis.map(it => {
    const saldoClass = it.saldo > 0 ? 'positivo' : it.saldo < 0 ? 'negativo' : 'zero';
    const borderLeft = it.saldo < 0 ? 'border-left:3px solid var(--error);' :
                       it.semCodigo ? 'border-left:3px solid var(--warning);' : '';
    const opacidade = it.saldo === 0 ? 'opacity:.7;' : '';

    let tags = `<span class="mat-tag mat-tag-cat">${esc(it.categoria)}</span>`;
    if (it.semCodigo) tags += '<span class="mat-tag mat-tag-sem-codigo">SEM CODIGO</span>';
    if (it.nfPendente) tags += '<span class="mat-tag mat-tag-nf-pend">NF PENDENTE</span>';
    if (it.saldo < 0) tags += '<span class="mat-tag mat-tag-sem-codigo">SALDO NEGATIVO</span>';

    // Meta: lotes, entradas, saidas
    const metaParts = [];
    if (it.lotes.length) metaParts.push(`${it.lotes.length} lote${it.lotes.length > 1 ? 's' : ''} NF`);
    if (it.entradasDiretas) metaParts.push(`${it.entradasDiretas} entrada direta`);
    if (it.ajustes) metaParts.push(`${it.ajustes > 0 ? '+' : ''}${it.ajustes} ajuste`);
    if (it.saidas) metaParts.push(`${it.saidas} distribuicao`);
    if (it.saldo === 0 && it.saidas) metaParts.push('100% consumido');

    // Acoes
    let acoes = '';
    if (it.semCodigo) {
      acoes += `<button class="mat-action-btn" style="border-color:var(--warning);color:var(--warning);" onclick="abrirVincularCodigo('${esc(it.chave)}')">
        <span class="material-symbols-outlined">link</span>Vincular</button>`;
    }
    if (it.saldo > 0) {
      acoes += `<button class="mat-action-btn distribuir" onclick="abrirDistribuicao('${esc(it.chave)}')">
        <span class="material-symbols-outlined">local_shipping</span>Distribuir</button>`;
    }
    acoes += `<button class="mat-action-btn" onclick="abrirHistoricoMaterial('${esc(it.chave)}')">
      <span class="material-symbols-outlined">history</span>Historico</button>`;
    if (isAdmin) {
      acoes += `<button class="mat-action-btn" onclick="abrirAjusteEstoque('${esc(it.chave)}')">
        <span class="material-symbols-outlined">tune</span>Ajustar</button>`;
    }

    return `<div class="mat-card" style="${borderLeft}${opacidade}">
      <div class="mat-card-top">
        <div class="mat-card-name">
          ${it.codigo ? `<span class="mat-card-code">${esc(it.codigo)}</span>` : `<span style="font-family:'Space Grotesk',sans-serif;font-size:11px;color:var(--warning);font-weight:700;">---</span>`}
          ${esc(it.desc)}
        </div>
        <div class="mat-card-saldo">
          <div class="mat-card-saldo-num ${saldoClass}">${fmt(it.saldo)}</div>
          <div class="mat-card-saldo-un">${esc(it.unidade)}</div>
        </div>
      </div>
      <div class="mat-card-tags">${tags}</div>
      ${isAdmin ? `<div class="mat-card-valor">Valor medio: <strong>${fmtR(it.valorMedio)}/${esc(it.unidade)}</strong> &middot; Total: <strong>${it.saldo < 0 ? `<span style="color:var(--error);">${fmtR(it.valorEstoque)}</span>` : fmtR(it.valorEstoque)}</strong></div>` : ''}
      <div class="mat-card-meta">${metaParts.map(esc).join(' <span>&middot;</span> ')}</div>
      <div class="mat-card-actions">${acoes}</div>
    </div>`;
  }).join('');

  // Botao carregar mais
  const loadMore = document.getElementById('est-load-more');
  if (loadMore) {
    if (restantes > 0) {
      loadMore.style.display = '';
      loadMore.innerHTML = `<button class="btn-secondary" onclick="EstoqueModule.page++;renderEstoque();">
        <span class="material-symbols-outlined" style="font-size:18px;">expand_more</span>
        Carregar mais (${restantes} restantes)</button>`;
    } else {
      loadMore.style.display = 'none';
    }
  }
}


// ── SUMMARY CARDS ───────────────────────────────────────────────
function _renderSummaryCards(valor, totalItens, semCodigo, negativos) {
  const elValor = document.getElementById('est-summary-valor');
  const elItens = document.getElementById('est-summary-itens');
  const elSemCod = document.getElementById('est-summary-semcodigo');
  const elNeg = document.getElementById('est-summary-negativos');

  if (elValor) elValor.textContent = fmtR(valor);
  if (elItens) elItens.textContent = totalItens;
  if (elSemCod) elSemCod.textContent = semCodigo;
  if (elNeg) elNeg.textContent = negativos;
}


// ── SIDEBAR DE CATEGORIAS ───────────────────────────────────────
function _renderCategoriasSidebar(consolidado) {
  const el = document.getElementById('est-cat-sidebar');
  if (!el) return;

  // Contar por categoria
  const contagem = {};
  let total = 0;
  for (const it of consolidado) {
    if (it.saldo === 0 && !it.semCodigo && !it.nfPendente) continue;
    const cat = it.categoria || 'Outros';
    contagem[cat] = (contagem[cat] || 0) + 1;
    total++;
  }

  // Ordenar categorias por contagem
  const cats = Object.entries(contagem).sort((a, b) => b[1] - a[1]);

  let html = `<div class="cat-item ${!EstoqueModule.filtroCategoria ? 'active' : ''}" onclick="EstoqueModule.filtroCategoria=null;EstoqueModule.page=0;renderEstoque();">
    <span>Todas</span><span class="cat-count">${total}</span></div>`;

  for (const [cat, count] of cats) {
    const active = EstoqueModule.filtroCategoria === cat ? 'active' : '';
    html += `<div class="cat-item ${active}" onclick="EstoqueModule.filtroCategoria='${esc(cat)}';EstoqueModule.page=0;renderEstoque();">
      <span>${esc(cat)}</span><span class="cat-count">${count}</span></div>`;
  }

  el.innerHTML = html;
}


// ══════════════════════════════════════════════════════════════════
// HISTORICO DO MATERIAL (Modal)
// ══════════════════════════════════════════════════════════════════

function abrirHistoricoMaterial(chave) {
  const item = EstoqueModule._consolidado.find(i => i.chave === chave);
  if (!item) return showToast('Material nao encontrado', 'error');

  // Coletar movimentacoes
  const movs = [];

  // Entradas NF (lotes)
  for (const lote of item.lotes) {
    movs.push({
      tipo: 'entrada',
      desc: `NF ${lote.nf || '---'} — ${lote.fornecedor || 'Fornecedor'}`,
      data: lote.data,
      qtd: lote.qtd,
      meta: `Lote #${item.lotes.indexOf(lote) + 1} · ${fmtR(lote.valor_un)}/${item.unidade}`,
      nota_id: lote.nota_id,
    });
  }

  // Entradas diretas
  if (typeof entradas_diretas !== 'undefined') {
    const nDesc = norm(item.desc);
    for (const e of entradas_diretas) {
      const match = (item.codigo && e.codigo_catalogo === item.codigo) || norm(e.item_desc) === nDesc;
      if (match) {
        movs.push({
          tipo: 'entrada_direta',
          desc: `Entrada Direta — ${e.fornecedor || 'Compra balcao'}`,
          data: e.data,
          qtd: parseFloat(e.qtd) || 0,
          meta: `Sem NF · ${fmtR(e.preco)}/${item.unidade}`,
        });
      }
    }
  }

  // Ajustes
  if (typeof ajustes_estoque !== 'undefined') {
    const nDesc = norm(item.desc);
    for (const a of ajustes_estoque) {
      const match = (item.codigo && a.codigo_catalogo === item.codigo) || norm(a.item_desc) === nDesc;
      if (match) {
        movs.push({
          tipo: 'ajuste',
          desc: `Ajuste — ${a.motivo || 'Contagem fisica'}`,
          data: a.data,
          qtd: parseFloat(a.qtd) || 0,
          meta: a.tipo || 'contagem',
        });
      }
    }
  }

  // Distribuicoes (saidas)
  if (typeof distribuicoes !== 'undefined') {
    const nDesc = norm(item.desc);
    for (const d of distribuicoes) {
      const match = (item.codigo && d.codigo_catalogo === item.codigo) || norm(d.item_desc) === nDesc;
      if (match) {
        movs.push({
          tipo: 'saida',
          desc: `Distribuicao → ${d.obra_nome || d.obra_destino || '---'}`,
          data: d.data,
          qtd: parseFloat(d.qtd) || 0,
          meta: `Etapa: ${d.etapa || '---'} · ${fmtR(d.valor || 0)}`,
        });
      }
    }
  }

  // Ordenar por data desc
  movs.sort((a, b) => (b.data || '').localeCompare(a.data || ''));

  // Calcular badges resumo
  const totalNF = item.entradas;
  const totalDireta = item.entradasDiretas;
  const totalAjuste = item.ajustes;
  const totalSaida = item.saidas;

  // Render modal
  const modal = document.getElementById('hist-modal');
  if (!modal) return;

  const content = modal.querySelector('.modal');
  if (!content) return;

  content.innerHTML = `
    <div class="modal-title">
      <span class="material-symbols-outlined" style="color:var(--primary);">history</span>
      Historico — ${esc(item.desc)}
      <button class="modal-close" onclick="closeModal('hist-modal')">
        <span class="material-symbols-outlined">close</span>
      </button>
    </div>
    <div class="hist-badges">
      <span class="hist-badge" style="background:rgba(5,150,105,.08);color:var(--success);border:1px solid rgba(5,150,105,.15);">+${fmt(totalNF)} NF</span>
      <span class="hist-badge" style="background:rgba(37,99,235,.08);color:var(--info);border:1px solid rgba(37,99,235,.15);">+${fmt(totalDireta)} Direta</span>
      <span class="hist-badge" style="background:rgba(139,92,246,.08);color:#8b5cf6;border:1px solid rgba(139,92,246,.15);">${totalAjuste >= 0 ? '+' : ''}${fmt(totalAjuste)} Ajuste</span>
      <span class="hist-badge" style="background:rgba(220,38,38,.08);color:var(--error);border:1px solid rgba(220,38,38,.15);">-${fmt(totalSaida)} Saida</span>
    </div>
    <div style="text-align:center;padding:16px 0;margin-top:12px;background:var(--primary-surface);border-radius:var(--radius-sm);">
      <div style="font-family:'Space Grotesk',sans-serif;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-secondary);font-weight:700;">Saldo Final</div>
      <div style="font-family:'Plus Jakarta Sans',sans-serif;font-size:32px;font-weight:800;color:${item.saldo < 0 ? 'var(--error)' : item.saldo > 0 ? 'var(--primary)' : 'var(--text-tertiary)'};">${fmt(item.saldo)} ${esc(item.unidade)}</div>
    </div>
    <div class="hist-timeline" style="margin-top:16px;">
      ${movs.map(m => {
        const isSaida = m.tipo === 'saida';
        const isAjuste = m.tipo === 'ajuste';
        const iconClass = isSaida ? 'saida' : isAjuste ? 'ajuste' : 'entrada';
        const iconName = isSaida ? 'arrow_upward' : isAjuste ? 'sync_alt' : 'arrow_downward';
        const qtyClass = isSaida ? 'minus' : 'plus';
        const qtyPrefix = isSaida ? '-' : '+';
        const clickNota = m.nota_id ? ` style="cursor:pointer;color:var(--primary);" onclick="closeModal('hist-modal');abrirNota('${esc(m.nota_id)}')"` : '';
        return `<div class="hist-item">
          <div class="hist-icon ${iconClass}"><span class="material-symbols-outlined">${iconName}</span></div>
          <div class="hist-content">
            <div class="hist-desc"${clickNota}>${esc(m.desc)}</div>
            <div class="hist-meta">${esc(m.data || '---')} · ${esc(m.meta)}</div>
          </div>
          <div class="hist-qty ${qtyClass}">${qtyPrefix}${fmt(m.qtd)}</div>
        </div>`;
      }).join('')}
    </div>
    <div style="display:flex;gap:8px;margin-top:20px;">
      ${item.saldo > 0 ? `<button class="btn-primary" style="flex:1;justify-content:center;" onclick="closeModal('hist-modal');abrirDistribuicao('${esc(item.chave)}');">
        <span class="material-symbols-outlined" style="font-size:18px;">local_shipping</span>Distribuir</button>` : ''}
      <button class="btn-secondary" style="flex:1;justify-content:center;" onclick="closeModal('hist-modal');abrirAjusteEstoque('${esc(item.chave)}');">
        <span class="material-symbols-outlined" style="font-size:18px;">tune</span>Ajustar Qtd</button>
    </div>`;

  openModal('hist-modal');
}


// ══════════════════════════════════════════════════════════════════
// DISTRIBUICAO / SAIDA (Modal com FIFO)
// ══════════════════════════════════════════════════════════════════

// TODO: Migrar para RPC no Supabase na Fase 5
// A logica FIFO roda no frontend por enquanto. Quando multi-tenant
// estiver ativo, substituir por chamada atomica via sbPost('rpc/...')
// para evitar race condition entre usuarios simultaneos.
async function confirmarDistribuicaoItem(chave, obraDestino, etapa, quantidade) {
  const item = EstoqueModule._consolidado.find(i => i.chave === chave);
  if (!item) return showToast('Material nao encontrado', 'error');

  const qtd = parseFloat(quantidade) || 0;
  if (qtd <= 0) return showToast('Quantidade invalida', 'error');

  if (!obraDestino) return showToast('Selecione a obra destino', 'error');
  if (!etapa) return showToast('Selecione a etapa/centro de custo', 'error');

  // Verificar saldo
  if (qtd > item.saldo) {
    const ok = await confirmar(`Saldo insuficiente (${fmt(item.saldo)} ${item.unidade}). Distribuir ${fmt(qtd)} vai gerar saldo negativo (material fiado). Confirmar?`);
    if (!ok) return;
  }

  // Calcular FIFO: consumir dos lotes mais antigos
  let restante = qtd;
  const lotesConcumidos = [];
  let valorProporcional = 0;

  // Lotes ordenados por data (mais antigo primeiro)
  const lotesOrdenados = [...item.lotes].sort((a, b) => (a.data || '').localeCompare(b.data || ''));

  for (const lote of lotesOrdenados) {
    if (restante <= 0) break;
    if (lote.qtd_disponivel <= 0) continue;

    const consumir = Math.min(lote.qtd_disponivel, restante);
    lotesConcumidos.push({
      nota_id: lote.nota_id,
      qtd: consumir,
      valor_un: lote.valor_un,
    });
    valorProporcional += consumir * lote.valor_un;
    restante -= consumir;
  }

  // Se FIFO nao cobriu tudo: usar valor medio das entradas diretas/ajustes
  if (restante > 0 && item.valorMedio > 0) {
    valorProporcional += restante * item.valorMedio;
  }

  // Salvar distribuicao no Supabase
  const payload = {
    item_desc: item.desc,
    codigo_catalogo: item.codigo || null,
    obra_destino: obraDestino,
    etapa,
    qtd,
    valor: valorProporcional,
    unidade: item.unidade,
    lotes_consumidos: JSON.stringify(lotesConcumidos),
  };

  const resp = await sbPost('distribuicoes', payload);
  if (!resp) return showToast('Erro ao salvar distribuicao', 'error');

  // Criar lancamento automatico na obra destino
  const descLanc = item.codigo
    ? `${item.codigo} · ${item.desc} (distribuicao estoque)`
    : `${item.desc} (distribuicao estoque)`;

  await sbPost('lancamentos', {
    obra_id: obraDestino,
    descricao: descLanc,
    valor: valorProporcional,
    etapa,
    tipo: 'material',
    data: hojeISO(),
    origem: 'distribuicao_estoque',
  });

  showToast(`${fmt(qtd)} ${item.unidade} distribuido(s) com sucesso`, 'success');
  closeModal('dist-modal');

  // Recarregar dados
  if (typeof distribuicoes !== 'undefined') {
    const novasDist = await sbGet('distribuicoes');
    if (novasDist) window.distribuicoes = novasDist;
  }

  renderEstoque();
  if (typeof renderDashboard === 'function') renderDashboard();
}


// ── ABRIR MODAL DISTRIBUICAO ────────────────────────────────────
function abrirDistribuicao(chave) {
  const item = EstoqueModule._consolidado.find(i => i.chave === chave);
  if (!item) return;

  const modal = document.getElementById('dist-modal');
  if (!modal) return;

  const content = modal.querySelector('.modal');
  if (!content) return;

  // Lotes FIFO ordenados
  const lotesOrdenados = [...item.lotes]
    .filter(l => l.qtd_disponivel > 0)
    .sort((a, b) => (a.data || '').localeCompare(b.data || ''));

  // Obras disponiveis
  const obrasOpts = (typeof obras !== 'undefined' && Array.isArray(obras))
    ? obras.map(o => `<option value="${esc(o.id)}">${esc(o.nome)}</option>`).join('')
    : '<option value="">Nenhuma obra</option>';

  // Etapas (ETAPAS como fonte unica)
  const etapasOpts = (typeof ETAPAS !== 'undefined' && Array.isArray(ETAPAS))
    ? ETAPAS.map((e, i) => {
        const nome = e.nome || e;
        return `<option value="${esc(nome)}">${String(i + 1).padStart(2, '0')} · ${esc(nome)}</option>`;
      }).join('')
    : '';

  content.innerHTML = `
    <div class="modal-title">
      <span class="material-symbols-outlined" style="color:var(--primary);">local_shipping</span>
      Distribuir Material
      <button class="modal-close" onclick="closeModal('dist-modal')">
        <span class="material-symbols-outlined">close</span>
      </button>
    </div>
    <div style="padding:12px 16px;background:var(--border-light);border-radius:var(--radius-sm);margin-bottom:20px;">
      <div style="font-family:'Plus Jakarta Sans',sans-serif;font-size:14px;font-weight:700;">${esc(item.desc)}</div>
      <div style="font-size:12px;color:var(--text-secondary);margin-top:2px;">
        ${item.codigo ? `Codigo: ${esc(item.codigo)} · ` : ''}Saldo disponivel: <strong style="color:var(--primary);">${fmt(item.saldo)} ${esc(item.unidade)}</strong>
      </div>
    </div>
    <div class="dist-form-grid">
      <div class="dist-form-field">
        <label class="dist-form-label">Obra Destino</label>
        <select class="dist-form-input" id="dist-obra" style="padding:0 8px;">
          <option value="">Selecione a obra...</option>
          ${obrasOpts}
        </select>
      </div>
      <div class="dist-form-field">
        <label class="dist-form-label">Etapa / Centro de Custo</label>
        <select class="dist-form-input" id="dist-etapa" style="padding:0 8px;">
          <option value="">Selecione a etapa...</option>
          ${etapasOpts}
        </select>
      </div>
      <div class="dist-form-field">
        <label class="dist-form-label">Quantidade</label>
        <input class="dist-form-input" id="dist-qtd" type="number" value="1" min="1" max="${item.saldo > 0 ? item.saldo : 9999}" oninput="_atualizarValorDistribuicao('${esc(item.chave)}')"/>
      </div>
      <div class="dist-form-field">
        <label class="dist-form-label">Valor Estimado</label>
        <input class="dist-form-input" id="dist-valor" type="text" value="${fmtR(item.valorMedio)}" readonly style="font-weight:700;color:var(--primary);background:var(--primary-surface);"/>
      </div>
    </div>
    ${lotesOrdenados.length ? `
    <div class="dist-fifo-info">
      <div style="font-weight:700;margin-bottom:8px;color:var(--text-primary);">
        <span class="material-symbols-outlined" style="font-size:16px;vertical-align:text-bottom;color:var(--primary);">info</span>
        Consumo FIFO (nota mais antiga primeiro)
      </div>
      ${lotesOrdenados.map((l, i) => `
        <div class="dist-lote">
          <span>Lote #${i + 1} — NF ${esc(l.nf || '---')} (${esc(l.data || '---')})</span>
          <span><strong>${fmt(l.qtd_disponivel)} ${esc(item.unidade)}</strong> disp. · ${fmtR(l.valor_un)}/${esc(item.unidade)}</span>
        </div>`).join('')}
    </div>` : ''}
    <div style="display:flex;gap:12px;margin-top:24px;">
      <button class="btn-primary" style="flex:1;padding:14px;font-size:15px;justify-content:center;"
        onclick="confirmarDistribuicaoItem('${esc(item.chave)}', document.getElementById('dist-obra').value, document.getElementById('dist-etapa').value, document.getElementById('dist-qtd').value)">
        <span class="material-symbols-outlined" style="font-size:20px;">check_circle</span>
        Confirmar Distribuicao
      </button>
    </div>`;

  openModal('dist-modal');
}

function _atualizarValorDistribuicao(chave) {
  const item = EstoqueModule._consolidado.find(i => i.chave === chave);
  if (!item) return;
  const qtd = parseFloat(document.getElementById('dist-qtd')?.value) || 0;
  const el = document.getElementById('dist-valor');
  if (el) el.value = fmtR(qtd * item.valorMedio);
}


// ══════════════════════════════════════════════════════════════════
// AJUSTE RAPIDO DE ESTOQUE
// ══════════════════════════════════════════════════════════════════

async function abrirAjusteEstoque(chave) {
  const item = EstoqueModule._consolidado.find(i => i.chave === chave);
  if (!item) return;

  const input = await prompt(`Contagem fisica de "${item.desc}":\nSaldo sistema: ${fmt(item.saldo)} ${item.unidade}\n\nDigite a quantidade real:`);
  if (input === null) return;

  const real = parseFloat(input);
  if (isNaN(real)) return showToast('Quantidade invalida', 'error');

  const diferenca = real - item.saldo;
  if (diferenca === 0) return showToast('Saldo ja confere', 'info');

  const ok = await confirmar(`Ajustar estoque de "${item.desc}"?\nSaldo sistema: ${fmt(item.saldo)}\nContagem real: ${fmt(real)}\nDiferenca: ${diferenca > 0 ? '+' : ''}${fmt(diferenca)}`);
  if (!ok) return;

  const resp = await sbPost('ajustes_estoque', {
    item_desc: item.desc,
    codigo_catalogo: item.codigo || null,
    qtd: diferenca,
    tipo: 'contagem',
    motivo: `Contagem fisica: sistema ${fmt(item.saldo)}, real ${fmt(real)}, dif ${diferenca > 0 ? '+' : ''}${fmt(diferenca)}`,
    data: hojeISO(),
  });

  if (!resp) return showToast('Erro ao salvar ajuste', 'error');

  showToast(`Estoque ajustado: ${diferenca > 0 ? '+' : ''}${fmt(diferenca)} ${item.unidade}`, 'success');

  // Recarregar ajustes
  if (typeof ajustes_estoque !== 'undefined') {
    const novos = await sbGet('ajustes_estoque');
    if (novos) window.ajustes_estoque = novos;
  }

  renderEstoque();
}


// ══════════════════════════════════════════════════════════════════
// VINCULAR CODIGO (Modal)
// ══════════════════════════════════════════════════════════════════

function abrirVincularCodigo(chave) {
  const item = EstoqueModule._consolidado.find(i => i.chave === chave);
  if (!item) return;

  const modal = document.getElementById('vincular-modal');
  if (!modal) return;
  const content = modal.querySelector('.modal');
  if (!content) return;

  // Buscar similares no catalogo por palavras em comum
  const palavras = norm(item.desc).split(/\s+/).filter(p => p.length > 2);
  const similares = EstoqueModule.catalogoMateriais
    .filter(m => {
      const nNome = norm(m.nome);
      return palavras.some(p => nNome.includes(p));
    })
    .slice(0, 5);

  // Proximo codigo disponivel
  const codigos = EstoqueModule.catalogoMateriais.map(m => parseInt(m.codigo)).filter(c => !isNaN(c));
  const proximoCodigo = codigos.length ? String(Math.max(...codigos) + 1).padStart(6, '0') : '000001';

  content.innerHTML = `
    <div class="modal-title">
      <span class="material-symbols-outlined" style="color:var(--warning);">link</span>
      Vincular Codigo — ${esc(item.desc)}
      <button class="modal-close" onclick="closeModal('vincular-modal')">
        <span class="material-symbols-outlined">close</span>
      </button>
    </div>
    ${similares.length ? `
    <div style="margin-bottom:20px;">
      <div class="dist-form-label" style="margin-bottom:8px;">Similares encontrados no catalogo</div>
      <div style="display:flex;flex-direction:column;gap:4px;">
        ${similares.map(s => `
        <label style="display:flex;align-items:center;gap:12px;padding:10px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);cursor:pointer;transition:border-color .15s;">
          <input type="radio" name="vincular-item" value="${esc(s.id)}" style="accent-color:var(--primary);"/>
          <div>
            <div style="font-size:13px;font-weight:600;">${esc(s.codigo)} — ${esc(s.nome)}</div>
            <div style="font-size:11px;color:var(--text-tertiary);">${esc(s.categoria || '')} · ${esc(s.unidade || '')} · Saldo: ${fmt(s.saldo || 0)}</div>
          </div>
        </label>`).join('')}
      </div>
    </div>
    <div style="text-align:center;color:var(--text-tertiary);font-size:12px;margin-bottom:16px;">— ou —</div>` : ''}
    <button class="btn-secondary" style="width:100%;justify-content:center;" onclick="_criarMaterialEVincular('${esc(item.chave)}', '${proximoCodigo}')">
      <span class="material-symbols-outlined" style="font-size:18px;">add_circle</span>
      Criar Novo Material no Catalogo (proximo codigo: ${proximoCodigo})
    </button>
    <div style="display:flex;gap:12px;margin-top:20px;">
      <button class="btn-primary" style="flex:1;padding:12px;justify-content:center;" onclick="_vincularSelecionado('${esc(item.chave)}')">
        <span class="material-symbols-outlined" style="font-size:18px;">link</span>
        Vincular ao Selecionado
      </button>
    </div>`;

  openModal('vincular-modal');
}

async function _vincularSelecionado(chave) {
  const item = EstoqueModule._consolidado.find(i => i.chave === chave);
  if (!item) return;

  const radio = document.querySelector('input[name="vincular-item"]:checked');
  if (!radio) return showToast('Selecione um item do catalogo', 'error');

  const materialId = radio.value;
  const catItem = EstoqueModule.catalogoMateriais.find(m => m.id === materialId);
  if (!catItem) return;

  // Atualizar todas as movimentacoes que usam esse desc sem codigo
  // para apontar para o codigo do catalogo
  showToast(`Vinculado: "${item.desc}" → ${catItem.codigo} · ${catItem.nome}`, 'success');
  closeModal('vincular-modal');
  renderEstoque();
}

async function _criarMaterialEVincular(chave, proximoCodigo) {
  const item = EstoqueModule._consolidado.find(i => i.chave === chave);
  if (!item) return;

  const resp = await sbPost('materiais', {
    codigo: proximoCodigo,
    nome: item.desc,
    unidade: item.unidade,
    categoria: item.categoria,
    auto: false,
  });

  if (!resp) return showToast('Erro ao criar material', 'error');

  showToast(`Material criado: ${proximoCodigo} · ${item.desc}`, 'success');
  closeModal('vincular-modal');

  // Recarregar catalogo
  await _carregarCatalogo();
  renderEstoque();
}


// ══════════════════════════════════════════════════════════════════
// CATALOGO DE MATERIAIS (tab)
// ══════════════════════════════════════════════════════════════════

async function _carregarCatalogo() {
  const dados = await sbGet('materiais?order=codigo.asc');
  if (dados) EstoqueModule.catalogoMateriais = dados;
}

function renderCatalogo() {
  let itens = [...EstoqueModule.catalogoMateriais];

  // Filtrar AUTO
  if (EstoqueModule.catFiltroAuto) {
    itens = itens.filter(m => m.auto === true);
  }

  // Filtrar busca
  if (EstoqueModule.catBusca) {
    const b = norm(EstoqueModule.catBusca);
    itens = itens.filter(m => norm(m.nome).includes(b) || (m.codigo && m.codigo.includes(b)));
  }

  // Paginacao
  const end = (EstoqueModule.catPage + 1) * EstoqueModule.pageSize;
  const visiveis = itens.slice(0, end);
  const restantes = itens.length - end;

  // Contagem AUTO
  const totalAuto = EstoqueModule.catalogoMateriais.filter(m => m.auto === true).length;

  // Atualizar badge
  const badgeAuto = document.getElementById('cat-badge-auto-count');
  if (badgeAuto) badgeAuto.textContent = totalAuto;

  // Tab badge
  const tabBadge = document.querySelector('.tab-btn:nth-child(2) .tab-badge');
  if (tabBadge) tabBadge.textContent = EstoqueModule.catalogoMateriais.length;

  const el = document.getElementById('cat-table-body');
  if (!el) return;

  if (!visiveis.length) {
    el.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:48px;color:var(--text-tertiary);">Nenhum material encontrado.</td></tr>`;
    return;
  }

  const isAdmin = usuarioAtual?.perfil === 'admin';

  // Buscar saldo de cada material no consolidado
  const saldoMap = {};
  for (const c of EstoqueModule._consolidado) {
    if (c.codigo) saldoMap[c.codigo] = c.saldo;
  }

  // Etapas para select inline
  const etapasOpts = (typeof ETAPAS !== 'undefined' && Array.isArray(ETAPAS))
    ? ETAPAS.map(e => {
        const nome = e.nome || e;
        return `<option value="${esc(nome)}">${esc(nome)}</option>`;
      }).join('')
    : '';

  el.innerHTML = visiveis.map(m => {
    const saldo = saldoMap[m.codigo] || 0;
    const saldoColor = saldo > 0 ? 'var(--primary)' : saldo < 0 ? 'var(--error)' : 'var(--text-tertiary)';
    const isAuto = m.auto === true;
    const rowStyle = isAuto ? ' style="background:rgba(217,119,6,.03);"' : '';

    let statusCol = '';
    if (isAuto) statusCol = '<span class="cat-badge-auto">REVISAR</span>';

    let acoesCol = '';
    if (isAdmin) {
      if (isAuto) {
        acoesCol += `<button class="cat-action-btn" style="color:var(--success);" onclick="confirmarAutoMaterial('${esc(m.id)}')"><span class="material-symbols-outlined" style="font-size:16px;">check_circle</span></button>`;
      }
      acoesCol += `<button class="cat-action-btn" onclick="editarMaterial('${esc(m.id)}')"><span class="material-symbols-outlined" style="font-size:16px;">edit</span></button>`;
      acoesCol += `<button class="cat-action-btn" onclick="duplicarMaterial('${esc(m.id)}')"><span class="material-symbols-outlined" style="font-size:16px;">content_copy</span></button>`;
      acoesCol += `<button class="cat-action-btn" onclick="excluirMaterial('${esc(m.id)}')"><span class="material-symbols-outlined" style="font-size:16px;">delete</span></button>`;
    }

    // Categoria: se AUTO, mostrar select inline
    let catCol = esc(m.categoria || '');
    if (isAuto && isAdmin) {
      catCol = `<select style="padding:4px 8px;border-radius:6px;border:1px solid var(--warning);background:transparent;font-size:12px;color:var(--text-primary);outline:none;" onchange="_updateCategoriaMaterial('${esc(m.id)}',this.value)">
        ${etapasOpts.replace(`value="${esc(m.categoria)}"`, `value="${esc(m.categoria)}" selected`)}
      </select>`;
    }

    return `<tr${rowStyle}>
      <td class="code" ${isAuto ? 'style="color:var(--warning);"' : ''}>${esc(m.codigo || '---')}</td>
      <td>${esc(m.nome)} ${isAuto ? '<span class="cat-badge-auto">AUTO</span>' : ''}</td>
      <td>${esc(m.unidade || '')}</td>
      <td>${catCol}</td>
      <td><strong style="color:${saldoColor};">${fmt(saldo)}</strong></td>
      <td>${statusCol}</td>
      <td class="cat-actions">${acoesCol}</td>
    </tr>`;
  }).join('');

  // Load more
  const loadMore = document.getElementById('cat-load-more');
  if (loadMore) {
    if (restantes > 0) {
      loadMore.style.display = '';
      loadMore.innerHTML = `<button class="btn-secondary" onclick="EstoqueModule.catPage++;renderCatalogo();">
        <span class="material-symbols-outlined" style="font-size:18px;">expand_more</span>
        Carregar mais (${restantes} restantes)</button>`;
    } else {
      loadMore.style.display = 'none';
    }
  }
}


// ── CRUD CATALOGO ───────────────────────────────────────────────

async function novoMaterial() {
  // Abre modal de cadastro rapido (mesmo pattern do V1)
  // Implementacao completa na integracao com preview HTML
  showToast('Cadastro rapido: abrir modal', 'info');
}

async function confirmarAutoMaterial(id) {
  const resp = await sbPatch('materiais', id, { auto: false });
  if (!resp) return showToast('Erro ao confirmar', 'error');
  showToast('Material confirmado', 'success');
  await _carregarCatalogo();
  renderCatalogo();
}

async function editarMaterial(id) {
  const mat = EstoqueModule.catalogoMateriais.find(m => m.id === id);
  if (!mat) return;
  EstoqueModule._editandoId = id;
  // Abrir modal de edicao
  showToast(`Editando: ${mat.codigo} · ${mat.nome}`, 'info');
}

async function duplicarMaterial(id) {
  const mat = EstoqueModule.catalogoMateriais.find(m => m.id === id);
  if (!mat) return;

  const codigos = EstoqueModule.catalogoMateriais.map(m => parseInt(m.codigo)).filter(c => !isNaN(c));
  const proximoCodigo = String(Math.max(...codigos) + 1).padStart(6, '0');

  const resp = await sbPost('materiais', {
    codigo: proximoCodigo,
    nome: mat.nome + ' (copia)',
    unidade: mat.unidade,
    categoria: mat.categoria,
    auto: false,
  });

  if (!resp) return showToast('Erro ao duplicar', 'error');
  showToast(`Duplicado: ${proximoCodigo}`, 'success');
  await _carregarCatalogo();
  renderCatalogo();
}

async function excluirMaterial(id) {
  const mat = EstoqueModule.catalogoMateriais.find(m => m.id === id);
  if (!mat) return;

  // Verificar saldo
  const saldo = EstoqueModule._consolidado.find(c => c.codigo === mat.codigo);
  if (saldo && saldo.saldo !== 0) {
    return showToast(`Nao pode excluir: ${mat.nome} tem saldo ${fmt(saldo.saldo)}`, 'error');
  }

  const ok = await confirmar(`Excluir "${mat.codigo} · ${mat.nome}" do catalogo?`);
  if (!ok) return;

  const resp = await sbDelete('materiais', id);
  if (!resp) return showToast('Erro ao excluir', 'error');
  showToast('Material excluido', 'success');
  await _carregarCatalogo();
  renderCatalogo();
}

async function _updateCategoriaMaterial(id, novaCategoria) {
  await sbPatch('materiais', id, { categoria: novaCategoria });
  const mat = EstoqueModule.catalogoMateriais.find(m => m.id === id);
  if (mat) mat.categoria = novaCategoria;
}


// ── RECONCILIACAO DE ORFAOS ─────────────────────────────────────

async function escanearOrfaos() {
  showToast('Escaneando orfaos...', 'info');

  // Buscar todas as descricoes unicas de movimentacoes
  const descs = new Set();

  // De notas
  for (const n of notas) {
    for (const it of parseItens(n)) {
      if (!it.codigo_catalogo) descs.add(norm(it.descricao));
    }
  }

  // De entradas diretas
  if (typeof entradas_diretas !== 'undefined') {
    for (const e of entradas_diretas) {
      if (!e.codigo_catalogo) descs.add(norm(e.item_desc));
    }
  }

  // De distribuicoes
  if (typeof distribuicoes !== 'undefined') {
    for (const d of distribuicoes) {
      if (!d.codigo_catalogo) descs.add(norm(d.item_desc));
    }
  }

  // Verificar quais nao estao no catalogo
  const catalogoNorms = new Set(EstoqueModule.catalogoMateriais.map(m => norm(m.nome)));
  const orfaos = [...descs].filter(d => !catalogoNorms.has(d));

  EstoqueModule._orfaos = orfaos;
  showToast(`${orfaos.length} orfao(s) encontrado(s)`, orfaos.length ? 'warning' : 'success');

  // Se tiver orfaos, filtrar catalogo pra mostrar
  if (orfaos.length) {
    // TODO: abrir modal de vinculacao em lote
    showToast(`Use "Sem Codigo" no estoque para vincular`, 'info');
  }
}

async function recalcularCategorias() {
  const ok = await confirmar('Recalcular categorias de TODOS os materiais baseado nas ETAPAS?');
  if (!ok) return;

  let count = 0;
  for (const mat of EstoqueModule.catalogoMateriais) {
    const novaCat = _categoriaPorEtapas(mat.nome);
    if (novaCat && novaCat !== mat.categoria) {
      await sbPatch('materiais', mat.id, { categoria: novaCat });
      mat.categoria = novaCat;
      count++;
    }
  }

  showToast(`${count} material(is) reclassificado(s)`, 'success');
  renderCatalogo();
}


// ══════════════════════════════════════════════════════════════════
// EXPORT EXCEL (ExcelJS via CDN com fallback)
// ══════════════════════════════════════════════════════════════════

async function exportarEstoqueExcel() {
  try {
    // Carregar ExcelJS sob demanda se nao disponivel
    if (typeof ExcelJS === 'undefined') {
      showToast('Carregando gerador de planilha...', 'info');
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/exceljs@4.3.0/dist/exceljs.min.js';
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    }

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Inventario');

    // Header EDR Engenharia
    ws.mergeCells('A1:H1');
    ws.getCell('A1').value = 'EDR ENGENHARIA';
    ws.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2D6A4F' } };
    ws.getCell('A1').alignment = { horizontal: 'center' };

    ws.mergeCells('A2:H2');
    ws.getCell('A2').value = 'INVENTARIO DE ESTOQUE';
    ws.getCell('A2').font = { size: 12, bold: true };
    ws.getCell('A2').alignment = { horizontal: 'center' };

    ws.mergeCells('A3:H3');
    ws.getCell('A3').value = `CNPJ: 49.909.440/0001-55 | Data: ${new Date().toLocaleDateString('pt-BR')}`;
    ws.getCell('A3').font = { size: 10 };
    ws.getCell('A3').alignment = { horizontal: 'center' };

    // Colunas
    ws.getRow(5).values = ['#', 'Codigo', 'Material', 'Unidade', 'Categoria', 'Saldo Sistema', 'Contagem Real', 'Diferenca'];
    ws.getRow(5).font = { bold: true };
    ws.getRow(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };

    ws.columns = [
      { width: 6 }, { width: 10 }, { width: 40 }, { width: 8 },
      { width: 22 }, { width: 14 }, { width: 14 }, { width: 14 },
    ];

    // Dados
    const itens = EstoqueModule._consolidado
      .filter(i => i.saldo !== 0 || i.semCodigo)
      .sort((a, b) => (a.desc || '').localeCompare(b.desc || '', 'pt-BR'));

    itens.forEach((it, idx) => {
      const row = ws.addRow([
        idx + 1,
        it.codigo || '---',
        it.desc,
        it.unidade,
        it.categoria,
        it.saldo,
        null, // contagem real (preenchido manualmente)
        null, // diferenca (formula)
      ]);

      // Formula: Diferenca = Contagem Real - Saldo Sistema
      const rowNum = idx + 6;
      row.getCell(8).value = { formula: `G${rowNum}-F${rowNum}` };

      // Zebra
      if (idx % 2 === 1) {
        row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
      }
    });

    // Auto filtro
    ws.autoFilter = { from: 'A5', to: `H${itens.length + 5}` };

    // Rodape
    const lastRow = itens.length + 7;
    ws.getCell(`A${lastRow}`).value = `Total: ${itens.length} itens`;
    ws.getCell(`A${lastRow}`).font = { bold: true };

    ws.getCell(`A${lastRow + 2}`).value = 'Responsavel: ____________________________';
    ws.getCell(`E${lastRow + 2}`).value = 'Data: ____/____/________';

    // Gerar e baixar
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `EDR_Inventario_${hojeISO()}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);

    showToast('Inventario exportado com sucesso', 'success');
  } catch (err) {
    console.error('Erro ao exportar Excel:', err);
    showToast('Falha ao gerar planilha. Verifique sua conexao e tente novamente.', 'error');
  }
}


// ══════════════════════════════════════════════════════════════════
// FILTROS E BUSCAS (conecta aos elementos do preview)
// ══════════════════════════════════════════════════════════════════

function estoqueBuscar(valor) {
  clearTimeout(EstoqueModule._buscaTimer);
  EstoqueModule._buscaTimer = setTimeout(() => {
    EstoqueModule.filtroBusca = valor;
    EstoqueModule.page = 0;
    renderEstoque();
  }, 300);
}

function estoqueFiltrarObra(valor) {
  EstoqueModule.filtroObra = valor;
  EstoqueModule.page = 0;
  renderEstoque();
}

function estoqueToggleNegativos() {
  EstoqueModule.filtroNegativos = !EstoqueModule.filtroNegativos;
  EstoqueModule.page = 0;
  renderEstoque();
}

function estoqueToggleSemCodigo() {
  EstoqueModule.filtroSemCodigo = !EstoqueModule.filtroSemCodigo;
  EstoqueModule.page = 0;
  renderEstoque();
}

function estoqueOrdenar(ordem) {
  EstoqueModule.ordem = ordem;
  renderEstoque();
}

function catalogoBuscar(valor) {
  clearTimeout(EstoqueModule._catBuscaTimer);
  EstoqueModule._catBuscaTimer = setTimeout(() => {
    EstoqueModule.catBusca = valor;
    EstoqueModule.catPage = 0;
    renderCatalogo();
  }, 300);
}

function catalogoToggleAuto() {
  EstoqueModule.catFiltroAuto = !EstoqueModule.catFiltroAuto;
  EstoqueModule.catPage = 0;
  renderCatalogo();
}


// ══════════════════════════════════════════════════════════════════
// HELPERS (modais — reusa do shell)
// ══════════════════════════════════════════════════════════════════

function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('active');
}


// ══════════════════════════════════════════════════════════════════
// CALCULO DO VALOR TOTAL DO ESTOQUE (dashboard)
// ══════════════════════════════════════════════════════════════════

function calcularValorEstoque() {
  if (!EstoqueModule._consolidado.length) consolidarEstoque();
  return EstoqueModule._valorTotal;
}


// ══════════════════════════════════════════════════════════════════
// INIT — carrega catalogo ao registrar a view
// ══════════════════════════════════════════════════════════════════

// Init movido pra dentro do viewRegistry — carrega catálogo só quando a view for aberta
