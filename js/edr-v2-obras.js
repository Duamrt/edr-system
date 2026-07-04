// ══════════════════════════════════════════════════════════════════
// EDR System V2 — Modulo: OBRAS
// Depende: api.js, utils.js, config.js, estoque.js, notas.js,
//          adicionais.js, auth.js, menu.js, dashboard.js
// ══════════════════════════════════════════════════════════════════

// ── ETAPAS: centros de custo. _ETAPAS_BASE = base fixa no codigo (rede de seguranca);
// os customizados (criados pelo usuario) vem do banco e sao mesclados em runtime.
// cor: cor padrao pro design system V2
// aliases: keys legadas/antigas que resolvem pra essa etapa
const _ETAPAS_BASE = [
  { key:'01_acab',       lb:'Acabamento Final',           cor:'#ff7043', aliases:['14_acab'] },
  { key:'02_aco',        lb:'Aço / Ferro',                cor:'#7f8c8d', aliases:['aco','ferro'] },
  { key:'03_alimentacao',lb:'Alimentação',                cor:'#e67e22', aliases:['alimentacao'] },
  { key:'04_alven',      lb:'Alvenaria',                  cor:'#95a5a6', aliases:['alvenaria','07_alven'] },
  { key:'05_externo',    lb:'Área Externa',               cor:'#66bb6a', aliases:['16_externo'] },
  { key:'06_cobr',       lb:'Cobertura',                  cor:'#e74c3c', aliases:['cobertura','08_cobr'] },
  { key:'07_combustivel',lb:'Combustível',                cor:'#f39c12', aliases:['combustivel'] },
  { key:'08_doc',        lb:'Documentação / Licenças',    cor:'#9b59b6', aliases:['doc','02_doc'] },
  { key:'09_elet',       lb:'Elétrica',                   cor:'#f1c40f', aliases:['eletrica'] },
  { key:'10_epi',        lb:'EPI / Segurança',            cor:'#1abc9c', aliases:['epi'] },
  { key:'11_esquad',     lb:'Esquadrias',                 cor:'#3498db', aliases:['esquadria'] },
  { key:'12_esgoto',     lb:'Esgoto',                     cor:'#7f8c8d', aliases:['esgoto','10b_esgoto'] },
  { key:'13_estrut',     lb:'Estrutura',                  cor:'#546e7a', aliases:['estrutura','06_estrut'] },
  { key:'14_expediente', lb:'Expediente',                 cor:'#bdc3c7', aliases:['expediente'] },
  { key:'15_ferramenta', lb:'Ferramentas',                cor:'#e67e22', aliases:['ferramenta'] },
  { key:'16_forma',      lb:'Forma e Madeira',            cor:'#8e44ad', aliases:['forma'] },
  { key:'17_fund',       lb:'Fundação',                   cor:'#455a64', aliases:['fundacao','05_fund'] },
  { key:'18_generico',   lb:'Genérico',                   cor:'#7f8c8d', aliases:['generico'] },
  { key:'19_gesso',      lb:'Gesso',                      cor:'#ecf0f1', aliases:['gesso','13b_gesso'] },
  { key:'37_glp',        lb:'GLP / Gás',                  cor:'#ff6f00', aliases:['glp','gas','gas glp'] },
  { key:'20_granito',    lb:'Granito / Pedra',            cor:'#95a5a6', aliases:['granito','13d_granito'] },
  { key:'21_hidro',      lb:'Hidráulica',                 cor:'#2980b9', aliases:['hidraulica','10_hidro'] },
  { key:'22_imobilizado',lb:'Imobilizado',                cor:'#64748b', aliases:['imobilizado'] },
  { key:'23_impermeab',  lb:'Impermeabilização',          cor:'#16a085', aliases:['impermeab','13c_impermeab'] },
  { key:'24_imposto',    lb:'Impostos / Encargos',        cor:'#a855f7', aliases:['imposto'] },
  { key:'25_limpeza',    lb:'Limpeza',                    cor:'#27ae60', aliases:['limpeza','17_limpeza'] },
  { key:'26_locacao',    lb:'Locação / Máq. / Equip.',    cor:'#d35400', aliases:['locacao','15_locacao'] },
  { key:'27_loucas',     lb:'Louças e Metais',            cor:'#2ecc71', aliases:['loucas','13e_loucas'] },
  { key:'28_mao',        lb:'Mão de Obra',                cor:'#e74c3c', aliases:['mao'] },
  { key:'29_terra',      lb:'Movimento de Terra',         cor:'#8d6e63', aliases:['04_terra'] },
  { key:'30_pintura',    lb:'Pintura',                    cor:'#f39c12', aliases:['pintura','13_pintura'] },
  { key:'31_prelim',     lb:'Serviços Preliminares',      cor:'#78909c', aliases:['prelim','03_prelim'] },
  { key:'32_revarg',     lb:'Revestimento Argamassa',     cor:'#a1887f', aliases:['rev_arg','12b_revarg'] },
  { key:'33_revestc',    lb:'Revestimento Cerâmico',      cor:'#c0392b', aliases:['rev_cer','12_revestc'] },
  { key:'34_tecnologia', lb:'Tecnologia / Assinaturas',   cor:'#6366f1', aliases:['tecnologia'] },
  { key:'35_terreno',    lb:'Terreno',                    cor:'#6d4c41', aliases:['terreno','01_terreno'] },
  { key:'38_frete',      lb:'Frete / Logística',          cor:'#0ea5e9', aliases:['frete','logistica'] },
  { key:'36_outros',     lb:'Não classificado',           cor:'#546e7a', aliases:['outros','generico','00_outros'] },
];

// ETAPAS = base (codigo) + centros de custo customizados (banco). Mutavel em runtime.
let ETAPAS = _ETAPAS_BASE.slice();
let _ETAPA_ALIAS_MAP = {};
function _rebuildEtapaAlias() {
  _ETAPA_ALIAS_MAP = {};
  ETAPAS.forEach(e => { (e.aliases || []).forEach(a => { _ETAPA_ALIAS_MAP[a] = e.key; }); });
}
_rebuildEtapaAlias();

// Mescla os centros de custo criados pelo usuario (vindos do banco) na lista oficial.
// "Nao classificado" (36_outros) fica sempre por ultimo. Demais em ordem alfabetica.
// Fallback: sem extras, ETAPAS continua = base (sistema nunca fica sem centros de custo).
function aplicarCentrosCustoExtras(extras) {
  const outros = _ETAPAS_BASE.find(e => e.key === '36_outros');
  const base = _ETAPAS_BASE.filter(e => e.key !== '36_outros');
  const exs = (Array.isArray(extras) ? extras : [])
    .filter(c => c && c.key && c.label)
    .map(c => ({ key: c.key, lb: c.label, cor: c.cor || '#546e7a', aliases: [] }));
  ETAPAS = base.concat(exs).sort((a, b) => (a.lb || '').localeCompare(b.lb || '', 'pt-BR'));
  if (outros) ETAPAS.push(outros);
  _rebuildEtapaAlias();
}

// Resolve qualquer key legada pra key oficial
function resolveEtapaKey(key) { return _ETAPA_ALIAS_MAP[key] || key; }

// Retorna cor da etapa (usa ETAPAS como fonte unica)
function etapaCor(key) {
  const resolved = resolveEtapaKey(key);
  return ETAPAS.find(e => e.key === resolved)?.cor || '#546e7a';
}

function etapaLabel(key) {
  const resolved = resolveEtapaKey(key);
  return ETAPAS.find(e => e.key === resolved)?.lb || ETAPAS.find(e => e.key === key)?.lb || key || '—';
}

function etapaSelectOpts(selected = '', incluiVazio = true) {
  const vazio = incluiVazio ? '<option value="">— Etapa (opcional) —</option>' : '';
  return vazio + ETAPAS.map(e => `<option value="${e.key}" ${selected === e.key ? 'selected' : ''}>${e.lb}</option>`).join('');
}

// ── CATS: categorizacao automatica por regex ────────────────────
let CATS = {};
function initCATS() {
  CATS = {};
  CATS['mao'] = { lb: 'Mao de Obra', fn: r => /m[aã]o[\s\-]de[\s\-]obra|armador|eletricista|pintor|pedreiro|servente|mestre de obras|encanador|azulejista/i.test(r.descricao) };
  CATS['doc'] = { lb: 'Documentacao', fn: r => /contrato|documento|art |anotac|registro de contrato|orcamento|alvara|licenca|projeto|vistoria|escritura/i.test(r.descricao) };
  CATS['terreno'] = { lb: 'Terreno', fn: r => /terreno|aquisicao de terreno|compra de terreno|area|lote/i.test(r.descricao) };
  if (typeof CATS_ESTOQUE !== 'undefined') {
    const keyMap = { 'aco': 'ferro' };
    CATS_ESTOQUE.forEach(cat => {
      const key = keyMap[cat.key] || cat.key;
      CATS[key] = { lb: cat.lb, fn: r => cat.fn((r.descricao || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')) };
    });
  }
}

// ── ESTADO ENCAPSULADO ──────────────────────────────────────────
const ObrasModule = {
  tab: 'lanc',
  ordem: 'data',
  filtroSemCodigo: false,
  mostandoArquivadas: false,
  catFiltro: null,
  catsFiltro: new Set(),
  obraAberta: null,    // id da obra no detalhe
  lancPage: 0,         // pagina atual de lancamentos
  lancPageSize: 50,    // lancamentos por pagina
  lancTotalLoaded: [],  // lancamentos ja carregados
};

// ── REGISTRO NO VIEW REGISTRY ───────────────────────────────────
if (typeof viewRegistry !== 'undefined') {
  viewRegistry.register('obras', renderObrasView);
}

// ── RENDER PRINCIPAL ────────────────────────────────────────────
function renderObrasView() {
  initCATS();
  _obrasShowOverview();
  populateSelects();
  _obrasPopularFiltrosCat();
  _obrasPopularFiltroUsuario();
  document.addEventListener('click', _obrasCatMenuClickFora, true);
  renderObrasCards();
  aplicarPerfil();
}

function _obrasPopularFiltrosCat() {
  const lista = document.getElementById('obras-filtro-cat-lista');
  if (!lista) return;
  lista.innerHTML = ETAPAS.map(e => `
    <label style="display:flex;align-items:center;gap:8px;padding:6px 12px;cursor:pointer;font-size:12px;color:var(--text-primary);transition:background .1s;" onmouseenter="this.style.background='rgba(255,255,255,.04)'" onmouseleave="this.style.background=''">
      <input type="checkbox" value="${e.key}" onchange="obrasCatToggle('${e.key}')" style="accent-color:var(--primary);width:14px;height:14px;cursor:pointer;">
      ${e.lb}
    </label>`).join('');
}

function _obrasCatMenuClickFora(e) {
  const wrap = document.getElementById('obras-filtro-cat-wrap');
  if (wrap && !wrap.contains(e.target)) _obrasCatFecharMenu();
}

function obrasToggleCatMenu(e) {
  if (e) e.stopPropagation();
  const menu = document.getElementById('obras-filtro-cat-menu');
  if (!menu) return;
  menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
}

function _obrasCatFecharMenu() {
  const menu = document.getElementById('obras-filtro-cat-menu');
  if (menu) menu.style.display = 'none';
}

function obrasCatToggle(key) {
  if (ObrasModule.catsFiltro.has(key)) ObrasModule.catsFiltro.delete(key);
  else ObrasModule.catsFiltro.add(key);
  _obrasCatAtualizarLabel();
  filtrarLanc();
  if (ObrasModule.tab === 'mat') renderObrasMateriais();
}

function obrasCatSelecionarTodos() {
  ETAPAS.forEach(e => ObrasModule.catsFiltro.add(e.key));
  document.querySelectorAll('#obras-filtro-cat-lista input[type=checkbox]').forEach(cb => cb.checked = true);
  _obrasCatAtualizarLabel();
  filtrarLanc();
  if (ObrasModule.tab === 'mat') renderObrasMateriais();
}

function obrasCatLimpar() {
  ObrasModule.catsFiltro.clear();
  document.querySelectorAll('#obras-filtro-cat-lista input[type=checkbox]').forEach(cb => cb.checked = false);
  _obrasCatAtualizarLabel();
  filtrarLanc();
  if (ObrasModule.tab === 'mat') renderObrasMateriais();
}

function _obrasCatAtualizarLabel() {
  const label = document.getElementById('obras-filtro-cat-label');
  if (!label) return;
  const n = ObrasModule.catsFiltro.size;
  label.textContent = n === 0 ? 'Centros de custo' : `${n} selecionado${n > 1 ? 's' : ''}`;
  const btn = document.getElementById('obras-filtro-cat-btn');
  if (btn) btn.style.borderColor = n > 0 ? 'var(--primary)' : 'var(--border)';
}

function _obrasPopularFiltroUsuario() {
  const sel = document.getElementById('obras-filtro-usuario');
  if (!sel) return;
  const usuarios = [...new Set(
    (typeof lancamentos !== 'undefined' ? lancamentos : [])
      .map(l => l.criado_por).filter(Boolean)
  )].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  sel.innerHTML = '<option value="">Todos usuários</option>' +
    usuarios.map(u => `<option value="${esc(u)}">${esc(u)}</option>`).join('');
}

// ── OVERVIEW vs DETALHE ─────────────────────────────────────────
function _obrasShowOverview() {
  const overview = document.getElementById('obras-cards-overview');
  const sticky = document.getElementById('obras-sticky');
  if (overview) overview.style.display = '';
  if (sticky) sticky.style.display = 'none';
  // Esconder todos os paineis de tab
  ['lanc', 'mat', 'add', 'cef'].forEach(t => {
    const p = document.getElementById('obras-tab-content-' + t);
    if (p) p.style.display = 'none';
  });
  ObrasModule.obraAberta = null;
}

function obrasVoltarCards() {
  _obrasShowOverview();
  renderObrasCards();
}

// ── CARDS DE OBRAS ──────────────────────────────────────────────
function renderObrasCards() {
  const grid = document.getElementById('obras-cards-grid');
  if (!grid) return;

  const pool = ObrasModule.mostandoArquivadas ? obrasArquivadas : obras;

  // Topbar: atualizar botao ativas/concluidas
  const btnToggle = document.getElementById('obras-toggle-archived-btn');
  if (btnToggle) {
    btnToggle.innerHTML = ObrasModule.mostandoArquivadas
      ? '<span class="material-symbols-outlined" style="font-size:18px;">construction</span> Ver Ativas'
      : '<span class="material-symbols-outlined" style="font-size:18px;">inventory</span> Ver Concluidas';
  }

  // Botao nova obra: so admin
  const btnNova = document.getElementById('obras-btn-nova');
  if (btnNova) btnNova.style.display = usuarioAtual?.perfil === 'admin' ? '' : 'none';

  if (!pool.length) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:48px;color:var(--text-tertiary);">
      <span class="material-symbols-outlined" style="font-size:48px;opacity:.3;">construction</span>
      <p style="margin-top:12px;">Nenhuma obra ${ObrasModule.mostandoArquivadas ? 'concluida' : 'ativa'}.</p>
    </div>`;
    return;
  }

  const isAdmin = usuarioAtual?.perfil === 'admin';

  grid.innerHTML = pool.map(o => {
    // Calcular totais (TODO: migrar pra view Supabase — obra_resumo)
    const ls = lancamentos.filter(l => l.obra_id === o.id);
    const total = ls.reduce((s, l) => s + Number(l.total || 0), 0);
    const ultimaData = ls.length ? ls.sort((a, b) => (b.data || '').localeCompare(a.data || ''))[0]?.data : null;
    const adds = typeof getAdicionaisObra === 'function' ? getAdicionaisObra(o.id) : { qtd: 0, valorTotal: 0 };

    // Top 3 etapas por valor
    const porEtapa = {};
    ls.forEach(l => {
      const k = l.etapa || '36_outros';
      porEtapa[k] = (porEtapa[k] || 0) + Number(l.total || 0);
    });
    const topEtapas = Object.entries(porEtapa).sort((a, b) => b[1] - a[1]).slice(0, 3);

    return `<div class="obra-card" onclick="obrasAbrirDetalhe('${esc(o.id)}')">
      <div class="obra-card-header">
        <div>
          <div class="obra-card-name">${esc(o.nome)}</div>
          <div class="obra-card-city">
            <span class="material-symbols-outlined" style="font-size:14px;">location_on</span>
            ${esc(o.cidade || 'Sem cidade')}
          </div>
        </div>
        <div>
          ${isAdmin ? `<div class="obra-card-value">${fmtR(total)}</div>` : ''}
          <div class="obra-card-count">${ls.length} lancamento${ls.length !== 1 ? 's' : ''}</div>
          ${isAdmin && adds.qtd > 0 ? `<div style="font-size:10px;color:#8B5CF6;margin-top:2px;">${adds.qtd} adicional(is): ${fmtR(adds.valorTotal)}</div>` : ''}
        </div>
      </div>
      ${topEtapas.length ? `<div class="etapa-chips">
        ${topEtapas.map(([k, v]) => {
          const pct = total > 0 ? (v / total * 100).toFixed(0) : 0;
          return `<span class="etapa-chip">${etapaLabel(k).split(' ').slice(0, 2).join(' ')} ${pct}%</span>`;
        }).join('')}
      </div>` : ''}
      <div class="obra-card-footer">
        <span class="obra-card-date">
          <span class="material-symbols-outlined" style="font-size:14px;">calendar_today</span>
          Ultimo: ${ultimaData ? fmtData(ultimaData) : 'Sem lancamentos'}
        </span>
        <div class="obra-card-actions">
          ${isAdmin ? `<button class="obra-action-btn obra-action-edit" onclick="event.stopPropagation();abrirModalObra('${esc(o.id)}')">Editar</button>` : ''}
          ${isAdmin && !ObrasModule.mostandoArquivadas ? `<button class="obra-action-btn obra-action-complete" onclick="event.stopPropagation();abrirModalConclusao('${esc(o.id)}')">Concluir</button>` : ''}
          ${isAdmin && ObrasModule.mostandoArquivadas ? `
            ${o.slug_entrega ? `<button class="obra-action-btn" style="color:var(--warning);background:rgba(217,119,6,.06);border:1px solid rgba(217,119,6,.15);" onclick="event.stopPropagation();abrirEntregaDigital('${esc(o.slug_entrega)}')">Entrega</button>` : ''}
            <button class="obra-action-btn" style="color:#8B5CF6;background:rgba(139,92,246,.06);border:1px solid rgba(139,92,246,.15);" onclick="event.stopPropagation();reimprimirTermo('${esc(o.id)}')">Termo</button>
            <button class="obra-action-btn" style="color:var(--success);background:rgba(5,150,105,.06);border:1px solid rgba(5,150,105,.15);" onclick="event.stopPropagation();reativarObra('${esc(o.id)}')">Reativar</button>
          ` : ''}
          ${isAdmin ? `<button class="obra-action-btn" style="color:#0d5220;background:rgba(13,82,32,.06);border:1px solid rgba(13,82,32,.18);" onclick="event.stopPropagation();gerarRelatorioObra('${esc(o.id)}')">Relatório</button>` : ''}
          <span class="obra-card-link">Detalhes <span class="material-symbols-outlined" style="font-size:16px;">arrow_forward</span></span>
        </div>
      </div>
    </div>`;
  }).join('');
}

// ── TOGGLE ATIVAS / CONCLUIDAS ──────────────────────────────────
function toggleObrasArquivadas() {
  ObrasModule.mostandoArquivadas = !ObrasModule.mostandoArquivadas;
  renderObrasCards();
}

// ── DETALHE DA OBRA ─────────────────────────────────────────────
function obrasAbrirDetalhe(obraId) {
  ObrasModule.obraAberta = obraId;
  ObrasModule.catsFiltro.clear();
  ObrasModule.tab = 'lanc';
  ObrasModule.lancPage = 0;

  const overview = document.getElementById('obras-cards-overview');
  const sticky = document.getElementById('obras-sticky');
  if (overview) overview.style.display = 'none';
  if (sticky) sticky.style.display = '';

  const obra = [...obras, ...obrasArquivadas].find(o => o.id === obraId);
  if (!obra) return;

  // Popular selects — DEVE vir antes de setar o valor (populateSelects reconstrói o innerHTML)
  populateSelects();

  // Selecionar obra no filtro do sticky (após populateSelects para não ser resetado)
  const filtroObra = document.getElementById('obras-filtro-obra');
  if (filtroObra) filtroObra.value = obraId;

  // Renderizar aba padrao (lancamentos)
  obrasSwitchTab('lanc');
}

// ── TABS ────────────────────────────────────────────────────────
function _obrasRenderTabs() {
  // Usar botoes de tab existentes no HTML (obras-tab-lanc, obras-tab-mat, etc.)
  const tabMap = { lanc: 'obras-tab-lanc', mat: 'obras-tab-mat', add: 'obras-tab-add', cef: 'obras-tab-cef' };
  Object.entries(tabMap).forEach(([key, id]) => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.style.borderBottomColor = key === ObrasModule.tab ? 'var(--verde-hl)' : 'transparent';
      btn.style.color = key === ObrasModule.tab ? 'var(--verde-hl)' : 'var(--texto3)';
    }
  });
}

function obrasSwitchTab(tab) {
  ObrasModule.tab = tab;

  // Atualizar visual das tabs
  _obrasRenderTabs();

  // Mostrar/esconder paineis de conteudo
  ['lanc', 'mat', 'add', 'cef'].forEach(t => {
    const panel = document.getElementById('obras-tab-content-' + t);
    if (panel) panel.style.display = t === tab ? '' : 'none';
  });

  // Mostrar barra de ordem só em LANÇAMENTOS
  const ordBar = document.getElementById('obras-ord-bar');
  if (ordBar) ordBar.style.display = tab === 'lanc' ? '' : 'none';

  // Lazy loading: so buscar dados quando clicar na aba
  if (tab === 'lanc') { ObrasModule.lancPage = 0; filtrarLanc(); }
  if (tab === 'mat') loadDistribuicoes().then(renderObrasMateriais);
  if (tab === 'add') {
    const addContainer = document.getElementById('adicionais-lista');
    if (addContainer && typeof AdicionaisModule !== 'undefined') AdicionaisModule.render(ObrasModule.obraAberta, addContainer);
  }
  if (tab === 'cef') renderObraCef();
}

// ── LANCAMENTOS: filtro + render + paginacao ────────────────────
function obrasAtualizarOrdem(ordem) {
  ObrasModule.ordem = ordem;
  ObrasModule.lancPage = 0;
  // BUG10: atualizar visual dos botoes de ordem
  ['data','az','valor'].forEach(o => {
    const btn = document.getElementById('obras-ord-' + o);
    if (btn) btn.classList.toggle('ativo', o === ordem);
  });
  filtrarLanc();
}

function obrasToggleSemCodigo() {
  ObrasModule.filtroSemCodigo = !ObrasModule.filtroSemCodigo;
  ObrasModule.lancPage = 0;
  const btn = document.getElementById('obras-ord-codigo');
  if (btn) btn.classList.toggle('ativo', ObrasModule.filtroSemCodigo);
  filtrarLanc();
}

function filtrarLanc() {
  const listaEl = document.getElementById('obras-lanc-lista');
  const summaryEl = document.getElementById('obras-total-filtro');
  if (!listaEl) return;

  const obraId = ObrasModule.obraAberta;
  const busca = norm(document.getElementById('obras-busca')?.value || '');
  const usuarioFiltro = document.getElementById('obras-filtro-usuario')?.value || '';

  // Pool correto (ativas ou concluidas); quando obra especifica, busca direto
  let lista;
  if (obraId) {
    lista = lancamentos.filter(l => l.obra_id === obraId);
  } else {
    const obraPool = ObrasModule.mostandoArquivadas ? obrasArquivadas : obras;
    const obraIds = new Set(obraPool.map(o => o.id));
    lista = lancamentos.filter(l => obraIds.has(l.obra_id));
  }
  if (busca) lista = lista.filter(l => norm(l.descricao || '').includes(busca));
  if (usuarioFiltro) lista = lista.filter(l => (l.criado_por || '') === usuarioFiltro);
  if (ObrasModule.catsFiltro.size > 0) lista = lista.filter(l => {
    const resolved = typeof resolveEtapaKey === 'function' ? resolveEtapaKey(l.etapa || '36_outros') : (l.etapa || '36_outros');
    return ObrasModule.catsFiltro.has(resolved);
  });
  if (ObrasModule.filtroSemCodigo) lista = lista.filter(l => !/^\d{4,6}\s*[·-]/.test(l.descricao || ''));

  // CATS filter
  if (ObrasModule.catFiltro && CATS[ObrasModule.catFiltro]) {
    lista = lista.filter(l => CATS[ObrasModule.catFiltro].fn(l));
  }

  // Ordenacao
  if (ObrasModule.ordem === 'data') lista.sort((a, b) => (b.data || '').localeCompare(a.data || ''));
  else if (ObrasModule.ordem === 'az') lista.sort((a, b) => (a.descricao || '').localeCompare(b.descricao || '', 'pt-BR'));
  else if (ObrasModule.ordem === 'valor') lista.sort((a, b) => Number(b.total || 0) - Number(a.total || 0));

  // Guardar total pra paginacao
  ObrasModule.lancTotalLoaded = lista;
  const totalFiltrado = lista.reduce((s, l) => s + Number(l.total || 0), 0);
  const isAdmin = usuarioAtual?.perfil === 'admin';

  // Mostrar a obra na linha SÓ quando "Todas as obras" + filtro SEM CÓDIGO ativo (ajuda a ver pra onde foi o custo; não repete se já filtrado por uma obra)
  const mostrarObra = !obraId && ObrasModule.filtroSemCodigo;
  const obraNomePorId = mostrarObra ? Object.fromEntries([...(obras || []), ...(obrasArquivadas || [])].map(o => [o.id, o.nome])) : {};

  // Summary
  if (summaryEl) {
    if (!lista.length) {
      summaryEl.classList.add('hidden');
    } else {
      summaryEl.classList.remove('hidden');
      summaryEl.innerHTML = `
        <span class="lanc-summary-count">${lista.length} lancamento${lista.length !== 1 ? 's' : ''}</span>
        ${isAdmin ? `<span class="lanc-summary-value">${fmtR(totalFiltrado)}</span>` : ''}`;
    }
  }

  // Paginacao: mostrar ate (page+1) * pageSize
  const limite = (ObrasModule.lancPage + 1) * ObrasModule.lancPageSize;
  const pagina = lista.slice(0, limite);
  const temMais = lista.length > limite;

  if (!pagina.length) {
    listaEl.innerHTML = `<div style="text-align:center;padding:48px;color:var(--text-tertiary);">
      <span class="material-symbols-outlined" style="font-size:48px;opacity:.3;">search_off</span>
      <p style="margin-top:12px;">Nenhum lancamento encontrado.</p>
    </div>`;
    return;
  }

  // Render lancamentos
  listaEl.innerHTML = pagina.map(l => {
    const semCodigo = !/^\d{4,6}\s*[·-]/.test(l.descricao || '');
    const etapaKey = l.etapa || '36_outros';
    const notaVinc = l.nota_id ? (notas || []).find(n => n.id === l.nota_id) : null;
    const nfBadge = notaVinc
      ? `<span title="Ver NF ${esc(notaVinc.numero_nf || '')}" onclick="event.stopPropagation();abrirNota('${esc(l.nota_id)}')" style="cursor:pointer;display:inline-flex;align-items:center;gap:2px;background:rgba(var(--primary-rgb,34,139,87),.12);color:var(--primary);border:1px solid rgba(var(--primary-rgb,34,139,87),.3);border-radius:4px;font-size:9px;font-weight:700;padding:1px 5px;letter-spacing:.3px;">NF ${esc(notaVinc.numero_nf || '?')}</span>`
      : '';
    return `<div class="lanc-item" onclick="abrirNotaDoLancamento('${esc(l.id)}')">
      <div class="lanc-item-left">
        <div class="lanc-item-desc">${esc(l.descricao || '—')} ${nfBadge}</div>
        <div class="lanc-item-meta">
          ${mostrarObra ? `<span style="display:inline-flex;align-items:center;gap:3px;background:rgba(37,99,235,.1);color:#2563eb;border:1px solid rgba(37,99,235,.28);border-radius:4px;font-size:9px;font-weight:700;padding:1px 6px;"><span class="material-symbols-outlined" style="font-size:11px;">apartment</span>${esc(obraNomePorId[l.obra_id] || '?')}</span>` : ''}
          <span class="etapa-chip" style="font-size:9px;padding:2px 6px;">${esc(etapaLabel(etapaKey))}</span>
          <span>${l.data ? fmtData(l.data) : '—'}</span>
          ${l.qtd ? `<span>${Number(l.qtd)} ${l.unidade || 'un'}</span>` : ''}
          ${semCodigo ? '<span style="color:var(--text-tertiary);font-size:10px;">sem vinculo catalogo</span>' : ''}
          ${l.criado_por && isAdmin ? `<span style="font-size:10px;color:var(--text-tertiary);">${esc(l.criado_por)}</span>` : ''}
        </div>
      </div>
      <div class="lanc-item-right">
        ${isAdmin ? `<span class="lanc-item-value">${fmtR(l.total)}</span>` : ''}
        ${isAdmin ? `<div class="lanc-item-actions">
          ${l.nota_id
            ? `<span title="Custo de NF — alterar pela Nota Fiscal" style="display:inline-flex;align-items:center;gap:3px;font-size:10px;color:var(--text-tertiary);padding:2px 6px;"><span class="material-symbols-outlined" style="font-size:13px;">lock</span>NF</span>`
            : `<button class="lanc-action-btn" title="Editar lancamento" onclick="event.stopPropagation();editarLancamento('${esc(l.id)}')"><span class="material-symbols-outlined" style="font-size:16px;">edit</span></button>
          ${semCodigo ? `<button class="lanc-action-btn" title="Vincular ao catalogo" onclick="event.stopPropagation();editarDescLanc('${esc(l.id)}')"><span class="material-symbols-outlined" style="font-size:16px;">link</span></button>` : ''}
          <button class="lanc-action-btn" title="Excluir" onclick="event.stopPropagation();excluirLanc('${esc(l.id)}')"><span class="material-symbols-outlined" style="font-size:16px;">delete</span></button>`
          }
          <button class="lanc-action-btn" title="Centro de custo" onclick="event.stopPropagation();editarEtapaLanc('${esc(l.id)}')"><span class="material-symbols-outlined" style="font-size:16px;">folder</span></button>
        </div>` : ''}
      </div>
    </div>`;
  }).join('');

  // Botao "Carregar mais"
  if (temMais) {
    listaEl.innerHTML += `<button class="btn-carregar-mais" onclick="obrasCarregarMais()" style="
      display:block;width:100%;padding:14px;margin-top:8px;
      background:var(--card);border:1px solid var(--border);border-radius:var(--radius-sm);
      font-size:13px;font-weight:600;color:var(--primary);cursor:pointer;
      transition:all .15s;text-align:center;">
      Carregar mais (${lista.length - limite} restantes)
    </button>`;
  }

  aplicarPerfil();
}

function obrasCarregarMais() {
  ObrasModule.lancPage++;
  filtrarLanc();
}

// BUG10+BUG11: filtros de obra e categoria ──────────────────────
function onChangeObraFiltro() {
  const obraId = document.getElementById('obras-filtro-obra')?.value || '';
  ObrasModule.obraAberta = obraId || null;
  ObrasModule.lancPage = 0;
  const btnArq = document.getElementById('btn-arquivar-obra');
  if (btnArq) btnArq.style.display = obraId ? '' : 'none';
  filtrarLanc();
  if (ObrasModule.tab === 'mat') renderObrasMateriais();
}

function filtrarLancCat() {
  ObrasModule.lancPage = 0;
  filtrarLanc();
}

// ── CEF (aba) ───────────────────────────────────────────────────
function renderObraCef() {
  const obraId = ObrasModule.obraAberta;
  const el = document.getElementById('obras-cef-content');
  if (!el) return;

  if (!obraId) {
    el.innerHTML = '<div style="text-align:center;padding:48px;color:var(--text-tertiary);">Selecione uma obra.</div>';
    return;
  }

  const obra = [...obras, ...obrasArquivadas].find(o => o.id === obraId);
  if (!obra) { el.innerHTML = '<div style="text-align:center;padding:48px;color:var(--text-tertiary);">Obra nao encontrada.</div>'; return; }

  const financiado = Number(obra.contrato_valor || 0);
  const subsidio = Number(obra.contrato_subsidio || 0);
  const fgts = Number(obra.contrato_fgts || 0);
  const entrada = Number(obra.contrato_entrada || 0);
  const terreno = Number(obra.contrato_terreno || 0);
  const valorVenda = Number(obra.valor_venda || 0);
  const entradaPaga = obra.entrada_paga;

  // Validacao CEF: soma dos componentes = valor de venda (sem extras)
  const somaComponentes = financiado + subsidio + fgts + entrada;
  const somaOk = valorVenda > 0 && Math.abs(somaComponentes - valorVenda) < 1;
  const somaAlerta = valorVenda > 0 && !somaOk;

  // Repasses
  const reps = (typeof repassesCef !== 'undefined' ? repassesCef : []).filter(r => r.obra_id === obraId);
  const totalRecebido = reps.reduce((s, r) => s + Number(r.valor || 0), 0);

  // Adicionais
  const adds = typeof AdicionaisModule !== 'undefined' ? AdicionaisModule.getAdicionaisObra(obraId) : { lista: [], valorTotal: 0, totalRecebido: 0, saldo: 0 };
  const receitaObra = valorVenda + adds.valorTotal;
  // Onda 2.2+2.3 (regra aprovada Duam 2026-07-04): box financeiro coerente numa base so.
  // recebido total = repasses (todos tipos) + pagamentos de adicionais; receita total = venda + adicionais validos (= receitaObra).
  const recebidoAdicionais = Number(adds.totalRecebido || 0);
  const recebidoTotal = totalRecebido + (Number.isFinite(recebidoAdicionais) ? recebidoAdicionais : 0);
  const saldoReceber = receitaObra - recebidoTotal;
  const pctRecebido = receitaObra > 0 ? Math.min((recebidoTotal / receitaObra * 100), 100) : 0;

  // Custos
  const custoTotal = lancamentos.filter(l => l.obra_id === obraId).reduce((s, l) => s + Number(l.total || 0), 0);
  const lucro = receitaObra - custoTotal;

  const isAdmin = usuarioAtual?.perfil === 'admin';

  el.innerHTML = `
    <div class="cef-grid">
      <!-- Alerta de validacao -->
      ${somaAlerta ? `
      <div style="padding:12px 16px;background:rgba(220,38,38,.06);border:1px solid rgba(220,38,38,.2);border-radius:var(--radius-sm);display:flex;align-items:center;gap:8px;">
        <span class="material-symbols-outlined" style="color:var(--error);font-size:20px;">warning</span>
        <span style="font-size:13px;color:var(--error);font-weight:600;">
          Soma dos componentes (${fmt(somaComponentes)}) difere do valor de venda (${fmt(valorVenda)}).
          Diferenca: ${fmt(Math.abs(somaComponentes - valorVenda))}
        </span>
      </div>` : ''}

      <!-- Valor de Venda -->
      <div class="cef-hero">
        <div class="cef-hero-label">Valor de Venda do Imovel</div>
        <div class="cef-hero-value">${valorVenda > 0 ? fmt(valorVenda) : 'Nao definido'}</div>
      </div>

      <!-- Grid de fontes -->
      <div class="cef-cards">
        <div class="cef-card">
          <div class="cef-card-label">Financiado</div>
          <div class="cef-card-value" style="color:var(--primary);">${fmt(financiado)}</div>
        </div>
        <div class="cef-card">
          <div class="cef-card-label">Subsidio</div>
          <div class="cef-card-value" style="color:var(--info);">${fmt(subsidio)}</div>
        </div>
        <div class="cef-card">
          <div class="cef-card-label">FGTS</div>
          <div class="cef-card-value" style="color:#8B5CF6;">${fmt(fgts)}</div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div class="cef-card">
          <div class="cef-card-label">Entrada ${entradaPaga ? '<span style="color:var(--success);font-size:9px;">PAGA</span>' : '<span style="color:var(--warning);font-size:9px;">PENDENTE</span>'}</div>
          <div class="cef-card-value" style="color:var(--warning);">${fmt(entrada)}</div>
        </div>
        ${terreno > 0 ? `<div class="cef-card">
          <div class="cef-card-label">Terreno <span style="font-size:9px;color:var(--text-tertiary);">incluso no financiado</span></div>
          <div class="cef-card-value" style="color:#78716c;">${fmt(terreno)}</div>
        </div>` : ''}
      </div>

      <!-- Barra de repasses -->
      <div class="cef-progress-box">
        <div class="cef-progress-header">
          <span class="cef-progress-label">Repasses Recebidos</span>
          <span class="cef-progress-pct">${pctRecebido.toFixed(0)}%</span>
        </div>
        <div class="cef-progress-bar">
          <div class="cef-progress-fill" style="width:${pctRecebido}%;"></div>
        </div>
        <div class="cef-progress-footer">
          <span>Recebido: <strong style="color:var(--primary);">${fmt(recebidoTotal)}</strong></span>
          <span>Falta: <strong style="color:var(--warning);">${fmt(Math.max(0, saldoReceber))}</strong></span>
        </div>
      </div>

      <!-- Resumo financeiro -->
      ${isAdmin ? `
      <div class="cef-financeiro">
        <div class="cef-fin-card cef-fin-custo">
          <div class="cef-card-label">Custo Total</div>
          <div class="cef-card-value" style="color:var(--warning);">${fmt(custoTotal)}</div>
        </div>
        <div class="cef-fin-card cef-fin-lucro">
          <div class="cef-card-label">Lucro</div>
          <div class="cef-card-value" style="color:${lucro >= 0 ? 'var(--success)' : 'var(--error)'};">${fmt(lucro)}</div>
        </div>
      </div>` : ''}

      <!-- Adicionais -->
      ${adds.lista.length > 0 ? `
      <div style="padding:12px 16px;background:rgba(139,92,246,.05);border:1px solid rgba(139,92,246,.15);border-radius:var(--radius-sm);">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:12px;color:#8B5CF6;font-weight:700;">${adds.lista.length} adicional(is)</span>
          <span style="font-size:14px;font-weight:700;color:#8B5CF6;">${fmt(adds.valorTotal)}</span>
        </div>
        <div style="font-size:11px;color:var(--text-tertiary);margin-top:4px;">
          Recebido: ${fmt(adds.totalRecebido)} &middot; Saldo: <strong style="color:${adds.saldo > 0 ? 'var(--warning)' : 'var(--success)'};">${fmt(adds.saldo)}</strong>
        </div>
      </div>` : ''}

      <!-- Dados do contrato -->
      ${obra.contrato_data || obra.contrato_taxa || obra.contrato_prazo ? `
      <div style="background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm);padding:16px;">
        <div style="font-family:'Space Grotesk',sans-serif;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-secondary);font-weight:700;margin-bottom:8px;">Dados do Contrato</div>
        ${obra.contrato_data ? `<div style="font-size:13px;color:var(--text-primary);margin-bottom:4px;">Data: <strong>${fmtData(obra.contrato_data)}</strong></div>` : ''}
        ${obra.contrato_taxa ? `<div style="font-size:13px;color:var(--text-primary);margin-bottom:4px;">Taxa: <strong>${esc(obra.contrato_taxa)}% a.a.</strong></div>` : ''}
        ${obra.contrato_prazo ? `<div style="font-size:13px;color:var(--text-primary);">Prazo: <strong>${esc(obra.contrato_prazo)}</strong></div>` : ''}
      </div>` : ''}

      ${isAdmin ? `
      <button class="btn-primary" style="justify-self:start;" onclick="custosAbrirModalContrato('${esc(obraId)}')">
        <span class="material-symbols-outlined" style="font-size:18px;">edit</span>
        Editar Contrato CEF
      </button>` : ''}
    </div>`;
}

// ── MATERIAIS (aba) ─────────────────────────────────────────────
function renderObrasMateriais() {
  const obraId = ObrasModule.obraAberta;
  const el = document.getElementById('obras-mat-lista');
  if (!el) return;

  const busca = (document.getElementById('mat-busca')?.value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const dataDE = document.getElementById('mat-data-de')?.value || '';
  const dataATE = document.getElementById('mat-data-ate')?.value || '';

  const dists = distribuicoes.filter(d => {
    if (obraId && d.obra_id !== obraId) return false;
    if (busca && !(d.item_desc || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(busca)) return false;
    if (dataDE && (d.data || '') < dataDE) return false;
    if (dataATE && (d.data || '') > dataATE) return false;
    if (ObrasModule.catsFiltro.size > 0) {
      const rk = typeof resolveEtapaKey === 'function' ? resolveEtapaKey(d.etapa || '36_outros') : (d.etapa || '36_outros');
      if (!ObrasModule.catsFiltro.has(rk)) return false;
    }
    return true;
  });

  if (!dists.length) {
    el.innerHTML = `<div style="text-align:center;padding:48px;color:var(--text-tertiary);">
      <span class="material-symbols-outlined" style="font-size:48px;opacity:.3;">inventory_2</span>
      <p style="margin-top:12px;">Nenhuma movimentacao de material${obraId ? ' nesta obra' : ''}.</p>
    </div>`;
    return;
  }

  // Agrupar por material
  const porMat = {};
  dists.forEach(d => {
    const key = (d.item_desc || '').toUpperCase();
    if (!porMat[key]) porMat[key] = { desc: d.item_desc, registros: [] };
    porMat[key].registros.push(d);
  });

  const isAdmin = usuarioAtual?.perfil === 'admin';

  // ── Resumo por centro de custo (faixa no topo) — total do que está filtrado, por etapa + geral ──
  const _porEtapa = {};
  let _totQtd = 0, _totVal = 0;
  dists.forEach(d => {
    const rk = typeof resolveEtapaKey === 'function' ? resolveEtapaKey(d.etapa || '36_outros') : (d.etapa || '36_outros');
    if (!_porEtapa[rk]) _porEtapa[rk] = { qtd: 0, val: 0 };
    _porEtapa[rk].qtd += Number(d.qtd) || 0;
    _porEtapa[rk].val += Number(d.valor) || 0;
    _totQtd += Number(d.qtd) || 0;
    _totVal += Number(d.valor) || 0;
  });
  const _chips = Object.entries(_porEtapa)
    .sort((a, b) => b[1].val - a[1].val || b[1].qtd - a[1].qtd)
    .map(([k, v]) => {
      const cor = typeof etapaCor === 'function' ? etapaCor(k) : 'var(--primary)';
      return `<span style="display:inline-flex;align-items:center;gap:6px;font-size:12px;padding:3px 10px;border-radius:6px;background:rgba(127,127,127,.08);border-left:3px solid ${cor};">
        <strong>${esc(etapaLabel(k))}</strong>
        <span style="color:var(--text-tertiary);">${v.qtd.toFixed(2)}</span>
        ${isAdmin && v.val > 0 ? `<span style="color:var(--primary);font-weight:700;">${fmtR(v.val)}</span>` : ''}
      </span>`;
    }).join('');
  const _resumoHtml = `<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:10px 12px;margin-bottom:12px;border:1px solid rgba(127,127,127,.15);border-radius:8px;">
    <span style="font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--text-tertiary);">Por centro de custo</span>
    ${_chips}
    <span style="margin-left:auto;font-size:13px;">Total${isAdmin ? `: <strong style="color:var(--primary);">${fmtR(_totVal)}</strong>` : ` ${_totQtd.toFixed(2)} un`}</span>
  </div>`;

  el.innerHTML = _resumoHtml + Object.values(porMat)
    .sort((a, b) => a.desc.localeCompare(b.desc))
    .map(m => {
      const totalQtd = m.registros.reduce((s, d) => s + Number(d.qtd), 0);
      const totalVal = m.registros.reduce((s, d) => s + Number(d.valor || 0), 0);

      const rows = m.registros
        .sort((a, b) => (b.data || '').localeCompare(a.data || ''))
        .map(d => {
          const isDist = d.item_idx !== -1;
          return `<div class="mat-row">
            <div class="mat-row-left">
              <span>${d.data || '—'}</span>
              <span class="mat-badge ${isDist ? 'mat-badge-dist' : 'mat-badge-manual'}">${isDist ? 'DISTRIBUICAO' : 'SAIDA MANUAL'}</span>
              ${d.etapa ? `<span style="font-size:11px;color:var(--text-tertiary);">${esc(etapaLabel(d.etapa))}</span>` : ''}
              ${d.criado_por ? `<span style="font-size:10px;color:var(--text-tertiary);">por ${esc(d.criado_por)}</span>` : ''}
              ${!obraId && d.obra_nome ? `<span style="font-size:10px;color:var(--primary);background:var(--primary-surface);border:1px solid var(--primary-light);border-radius:4px;padding:1px 6px;">${esc(d.obra_nome)}</span>` : ''}
            </div>
            <div style="display:flex;gap:12px;align-items:center;">
              <span style="font-weight:700;">${Number(d.qtd).toFixed(2)}</span>
              ${isAdmin && d.valor > 0 ? `<span style="color:var(--primary);font-size:12px;">${fmtR(d.valor)}</span>` : ''}
              ${isAdmin ? `<button onclick="excluirDistribuicao('${esc(d.id)}')" title="Excluir" style="background:none;border:none;cursor:pointer;color:var(--error);padding:2px;line-height:1;"><span class="material-symbols-outlined" style="font-size:16px;">delete</span></button>` : ''}
            </div>
          </div>`;
        }).join('');

      return `<div class="mat-group">
        <div class="mat-group-header">
          <span class="mat-group-name">${esc(m.desc)}</span>
          <div class="mat-group-stats">
            <span style="color:var(--text-tertiary);">${m.registros.length} mov.</span>
            <span class="mat-group-qty">${totalQtd.toFixed(2)}</span>
            ${isAdmin && totalVal > 0 ? `<span class="mat-group-val">${fmtR(totalVal)}</span>` : ''}
          </div>
        </div>
        ${rows}
      </div>`;
    }).join('');
}

async function excluirDistribuicao(id) {
  const d = distribuicoes.find(x => x.id === id);
  const msg = d?.lancamento_id
    ? 'Excluir esta movimentacao de material?\nIsso tambem removera o custo vinculado da obra.'
    : 'Excluir esta movimentacao de material?';
  if (!confirm(msg)) return;
  try {
    const okDist = await sbDelete('distribuicoes', `?id=eq.${id}`);
    if (!okDist) { showToast('Erro ao excluir movimentacao.'); return; }
    if (d?.lancamento_id) {
      const okLanc = await sbDelete('lancamentos', `?id=eq.${d.lancamento_id}`);
      if (!okLanc) { showToast('Movimentacao excluida, mas custo nao removido do banco.'); }
      else {
        const li = lancamentos.findIndex(l => l.id === d.lancamento_id);
        if (li !== -1) lancamentos.splice(li, 1);
      }
    }
    const idx = distribuicoes.findIndex(x => x.id === id);
    if (idx !== -1) distribuicoes.splice(idx, 1);
    renderObrasMateriais();
    showToast('Movimentacao excluida.');
  } catch(e) { showToast('Erro ao excluir: ' + e.message); }
}

// ── CRUD: NOVA / EDITAR OBRA ────────────────────────────────────
function abrirModalObra(obraId) {
  const obra = obraId ? [...obras, ...obrasArquivadas].find(o => o.id === obraId) : null;
  document.getElementById('obra-edit-id').value = obra ? obra.id : '';
  document.getElementById('nova-obra-nome').value = obra ? obra.nome : '';
  document.getElementById('nova-obra-cidade').value = obra ? (obra.cidade || '') : '';
  document.getElementById('nova-obra-valor-venda').value = obra ? (obra.valor_venda || '') : '';
  document.getElementById('nova-obra-contratante').value = obra ? (obra.contratante || '') : '';
  document.getElementById('nova-obra-cpf').value = obra ? (obra.cpf_contratante || '') : '';
  document.getElementById('nova-obra-slug').value = obra ? (obra.slug_entrega || '') : '';
  document.getElementById('nova-obra-area').value = obra ? (obra.area_m2 || '') : '';
  document.getElementById('modal-obra-titulo').textContent = obra ? 'Editar Obra' : 'Nova Obra';
  const _mObra = document.getElementById('modal-obra');
  _mObra.classList.remove('hidden'); _mObra.classList.add('active');
  setTimeout(() => document.getElementById('nova-obra-nome').focus(), 100);
}

async function salvarNovaObra() {
  const nome = (document.getElementById('nova-obra-nome').value || '').toUpperCase().trim();
  const cidade = (document.getElementById('nova-obra-cidade').value || '').trim();
  const valorVenda = parseFloat(document.getElementById('nova-obra-valor-venda').value) || 0;
  const contratante = (document.getElementById('nova-obra-contratante').value || '').toUpperCase().trim();
  const cpf_contratante = (document.getElementById('nova-obra-cpf').value || '').trim();
  const slug_entrega = (document.getElementById('nova-obra-slug').value || '').toLowerCase().trim().replace(/\s+/g, '-');
  const area_m2 = parseFloat(document.getElementById('nova-obra-area').value) || 0;
  const editId = document.getElementById('obra-edit-id').value;

  if (!nome) { showToast('Informe o nome da obra.'); return; }
  if (!editId && !(await checarLimiteObras())) return;

  try {
    const payload = { nome, cidade, valor_venda: valorVenda, contratante, cpf_contratante, slug_entrega, area_m2 };

    if (editId) {
      const salva = await sbPatch('obras', `?id=eq.${editId}`, payload);
      // 1c: só atualizar estado / fechar modal / renderizar se a edição gravou de fato.
      // sbPatch (return=representation) devolve objeto em sucesso; null (erro HTTP/rede) ou
      // undefined (0 linhas afetadas — RLS/id inexistente) em falha. Abortar antes do "atualizada!".
      if (!salva) { showToast('Nao foi possivel salvar a obra. Tente novamente.'); return; }
      const obraAtual = [...obras, ...obrasArquivadas].find(o => o.id === editId);
      if (obraAtual?.clickup_list_id && obraAtual.nome !== nome && typeof clickupRenomearObra === 'function') {
        clickupRenomearObra(obraAtual.clickup_list_id, nome);
      }
      await loadObras();
      populateSelects();
      renderDashboard();
      renderObrasCards();
      showToast(`"${nome}" atualizada!`);
    } else {
      const nova = await sbPost('obras', payload);
      if (nova) {
        obras.push(nova);
        obras.sort((a, b) => a.nome.localeCompare(b.nome));
      } else {
        await loadObras();
      }
      populateSelects();
      renderDashboard();
      renderObrasCards();
      showToast(`Obra ${nome} cadastrada!`);
      if (typeof clickupCriarObra === 'function' && nova?.id) clickupCriarObra(nome, nova.id);
    }
    fecharModal('obra');
  } catch (e) { showToast('Nao foi possivel salvar a obra.'); }
}

// ── CONCLUSAO DE OBRA ───────────────────────────────────────────
function gerarSlug(texto) {
  return (texto || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-');
}

function abrirModalConclusao(obraId) {
  const obra = [...obras, ...obrasArquivadas].find(o => o.id === obraId);
  if (!obra) return;
  document.getElementById('concluir-obra-id').value = obraId;
  document.getElementById('concluir-proprietario').value = obra.contratante || obra.proprietario || '';
  document.getElementById('concluir-cpf').value = obra.cpf_contratante || '';
  document.getElementById('concluir-data-entrega').value = hojeISO();
  document.getElementById('concluir-rua').value = obra.endereco_rua || '';
  document.getElementById('concluir-numero').value = obra.endereco_numero || '';
  document.getElementById('concluir-bairro').value = obra.endereco_bairro || '';
  document.getElementById('concluir-cidade').value = obra.cidade || '';
  document.getElementById('concluir-cep').value = obra.endereco_cep || '';
  const slugSugerido = obra.slug_entrega || gerarSlug(obra.nome.replace(/^(CASA|RESID[ÊE]NCIA|PROJ\.?|PROJETO)\s+/i, ''));
  document.getElementById('concluir-slug').value = slugSugerido;
  const _mConc = document.getElementById('modal-concluir-obra');
  _mConc.classList.remove('hidden'); _mConc.classList.add('active');
  setTimeout(() => document.getElementById('concluir-proprietario').focus(), 100);
}

async function confirmarConclusaoObra() {
  const obraId = document.getElementById('concluir-obra-id').value;
  const proprietario = (document.getElementById('concluir-proprietario').value || '').toUpperCase().trim();
  const cpf = (document.getElementById('concluir-cpf').value || '').trim();
  const dataEntrega = document.getElementById('concluir-data-entrega').value;
  const rua = (document.getElementById('concluir-rua').value || '').toUpperCase().trim();
  const numero = (document.getElementById('concluir-numero').value || '').trim();
  const bairro = (document.getElementById('concluir-bairro').value || '').toUpperCase().trim();
  const cidade = (document.getElementById('concluir-cidade').value || '').toUpperCase().trim();
  const cep = (document.getElementById('concluir-cep').value || '').trim();

  if (!proprietario) { showToast('Informe o nome do proprietario.'); return; }
  if (!cpf) { showToast('Informe o CPF do proprietario.'); return; }
  if (!dataEntrega) { showToast('Informe a data de entrega.'); return; }
  if (!rua) { showToast('Informe a rua / logradouro.'); return; }
  if (!numero) { showToast('Informe o numero / lote.'); return; }
  if (!bairro) { showToast('Informe o bairro.'); return; }
  if (!cidade) { showToast('Informe a cidade.'); return; }

  const slug_entrega = (document.getElementById('concluir-slug').value || '').toLowerCase().trim().replace(/\s+/g, '-');
  const obra = [...obras, ...obrasArquivadas].find(o => o.id === obraId);
  const nome = obra?.nome || 'Obra';

  if (!await confirmar(`Concluir "${esc(nome)}" e gerar o Termo de Entrega?`)) return;

  try {
    const salva = await sbPatch('obras', `?id=eq.${obraId}`, {
      arquivada: true,
      proprietario, contratante: proprietario, cpf_contratante: cpf,
      endereco_rua: rua, endereco_numero: numero, endereco_bairro: bairro,
      cidade, endereco_cep: cep, slug_entrega,
      data_entrega: dataEntrega   // Onda 3: persiste a data de entrega p/ o Termo (evita reprint cair em criado_em)
    });
    // 1d: só emitir o Termo / atualizar estado se a conclusão foi REALMENTE gravada no banco.
    // sbPatch (return=representation) devolve o objeto em sucesso; null em erro HTTP/rede e
    // undefined quando 0 linhas foram afetadas (RLS/id inexistente). Em qualquer falha, abortar
    // ANTES de gerar o documento oficial — senão emite Termo para obra que continua ativa.
    if (!salva) { showToast('Nao foi possivel concluir a obra. Tente novamente.'); return; }

    if (obra?.clickup_list_id && typeof clickupArquivarObra === 'function') {
      clickupArquivarObra(obra.clickup_list_id);
    }

    gerarTermoEntrega({ proprietario, cpf, dataEntrega, rua, numero, bairro, cidade, modelo: nome });

    await loadObras();
    populateSelects();
    renderObrasCards();
    renderDashboard();
    fecharModal('concluir-obra');
    showToast(`"${nome}" concluida! Termo aberto em nova aba.`);
  } catch (e) { showToast('Nao foi possivel concluir a obra.'); console.error(e); }
}

async function gerarRelatorioObra(obraId) {
  const obra = [...obras, ...obrasArquivadas].find(o => o.id === obraId);
  if (!obra) { showToast('Obra não encontrada.'); return; }

  showToast('Gerando relatório...');

  let cronograma = [];
  try {
    const r = await sbGet('cronograma_tarefas', `?obra_id=eq.${obraId}&order=ordem.asc,data_inicio.asc`);
    if (Array.isArray(r)) cronograma = r;
  } catch(e) { console.warn('[REL] cronograma:', e); }

  const lancs = (Array.isArray(lancamentos) ? lancamentos : [])
    .filter(l => l.obra_id === obraId)
    .sort((a, b) => (a.data || '') < (b.data || '') ? -1 : 1);

  const porEtapa = {};
  lancs.forEach(l => {
    const key = l.etapa || 'sem_etapa';
    const label = key === 'sem_etapa' ? 'Sem categoria' : etapaLabel(key);
    if (!porEtapa[key]) porEtapa[key] = { label, itens: [], total: 0 };
    porEtapa[key].itens.push({ data: l.data, descricao: l.descricao, qtd: l.qtd, preco: l.preco, total: l.total });
    porEtapa[key].total += Number(l.total || 0);
  });

  const progFisico = cronograma.length
    ? Math.round(cronograma.reduce((s, t) => s + Number(t.progresso || 0), 0) / cronograma.length)
    : 0;
  const totalGasto = lancs.reduce((s, l) => s + Number(l.total || 0), 0);
  const empresaNome = (typeof _companyPlan !== 'undefined' && _companyPlan?.name) ? _companyPlan.name : 'EDR ENGENHARIA';

  const dados = {
    empresa: empresaNome,
    obra: {
      nome: obra.nome || '',
      contratante: obra.contratante || obra.proprietario || '',
      cpf: obra.cpf_contratante || '',
      endereco: [obra.endereco_rua, obra.endereco_numero, obra.endereco_bairro, obra.cidade].filter(Boolean).join(', '),
      area_m2: obra.area_m2 || '',
      valor_contrato: obra.valor_venda || 0,
    },
    cronograma: cronograma.map(t => ({ nome: t.nome, data_inicio: t.data_inicio || '', data_fim: t.data_fim || '', progresso: Number(t.progresso || 0) })),
    porEtapa,
    totalGasto,
    progFisico,
    geradoEm: hojeISO(),
  };

  localStorage.setItem('edr-relatorio-dados', JSON.stringify(dados));
  window.open('relatorio-obra.html', '_blank');
}

function gerarTermoEntrega(dados) {
  const empresaNome = (typeof _companyPlan !== 'undefined' && _companyPlan?.name) ? _companyPlan.name : 'EDR ENGENHARIA';
  localStorage.setItem('edr-termo-dados', JSON.stringify({ ...dados, empresaNome }));
  window.open('termo-entrega.html', '_blank');
}

function reimprimirTermo(obraId) {
  const obra = [...obras, ...obrasArquivadas].find(o => o.id === obraId);
  if (!obra) return;
  if (!obra.proprietario && !obra.contratante) {
    showToast('Dados incompletos. Edite a obra antes.');
    return;
  }
  // Onda 3: usar a data de entrega REAL persistida. Nunca criado_em/contrato_data/new Date().
  if (obra.data_entrega) { _emitirTermoObra(obra, obra.data_entrega); return; }
  // Legado (obra concluida antes da coluna existir): pedir a data, persistir e so entao emitir.
  _abrirModalDataEntregaLegado(obra);
}

function _emitirTermoObra(obra, dataEntrega) {
  gerarTermoEntrega({
    proprietario: obra.proprietario || obra.contratante || '',
    cpf: obra.cpf_contratante || '',
    dataEntrega: dataEntrega,
    rua: obra.endereco_rua || '',
    numero: obra.endereco_numero || '',
    bairro: obra.endereco_bairro || '',
    cidade: obra.cidade || '',
    modelo: obra.nome || ''
  });
}

function _abrirModalDataEntregaLegado(obra) {
  document.getElementById('modal-data-entrega-legado')?.remove();
  // DOM puro (sem innerHTML): so insere elementos novos; data SEM default (nao carimba hoje).
  const modal = document.createElement('div');
  modal.id = 'modal-data-entrega-legado';
  modal.className = 'modal-overlay active';
  modal.style.zIndex = '9999';

  const box = document.createElement('div');
  box.className = 'modal-box';
  box.style.cssText = 'max-width:420px;padding:24px;';

  const h = document.createElement('div');
  h.style.cssText = "font-family:'Plus Jakarta Sans',sans-serif;font-size:16px;font-weight:700;margin-bottom:6px;";
  h.textContent = 'Data de entrega';

  const msg = document.createElement('div');
  msg.style.cssText = 'font-size:13px;color:var(--text-secondary);margin-bottom:16px;';
  msg.textContent = 'Esta obra nao tem data de entrega salva. Informe a data para emitir o Termo — ela sera salva para reimpressoes futuras.';

  const field = document.createElement('div');
  field.style.cssText = 'margin-bottom:16px;';
  const lb = document.createElement('label');
  lb.style.cssText = 'font-size:11px;font-weight:700;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;display:block;';
  lb.textContent = 'Data de entrega';
  const input = document.createElement('input');
  input.id = 'del-data';
  input.type = 'date';
  input.style.cssText = 'width:100%;padding:10px 12px;border-radius:var(--radius-sm);background:var(--bg);color:var(--text-primary);border:1px solid var(--border);font-size:14px;box-sizing:border-box;';
  field.appendChild(lb); field.appendChild(input);

  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;gap:10px;justify-content:flex-end;';
  const btnCancel = document.createElement('button');
  btnCancel.style.cssText = 'padding:10px 20px;border-radius:var(--radius-sm);background:var(--bg);color:var(--text-secondary);border:1px solid var(--border);cursor:pointer;font-size:13px;';
  btnCancel.textContent = 'Cancelar';
  btnCancel.addEventListener('click', () => modal.remove());
  const btnOk = document.createElement('button');
  btnOk.id = 'del-confirmar';
  btnOk.className = 'btn-primary';
  btnOk.style.cssText = 'padding:10px 20px;';
  btnOk.textContent = 'Salvar e emitir';
  btnOk.addEventListener('click', () => _confirmarDataEntregaLegado(obra.id));
  actions.appendChild(btnCancel); actions.appendChild(btnOk);

  box.appendChild(h); box.appendChild(msg); box.appendChild(field); box.appendChild(actions);
  modal.appendChild(box);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);
  setTimeout(() => input.focus(), 80);
}

async function _confirmarDataEntregaLegado(obraId) {
  const val = document.getElementById('del-data')?.value || '';
  // Validar YYYY-MM-DD explicitamente (o input date ja restringe, mas garantimos).
  if (!/^\d{4}-\d{2}-\d{2}$/.test(val)) { showToast('Informe uma data valida.'); return; }
  const obra = [...obras, ...obrasArquivadas].find(o => o.id === obraId);
  if (!obra) { showToast('Obra nao encontrada.'); return; }
  const btn = document.getElementById('del-confirmar');
  if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }
  try {
    const salvo = await sbPatch('obras', `?id=eq.${obraId}`, { data_entrega: val });
    // sbPatch: objeto em sucesso, undefined em 0-linhas (RLS/id), null em erro HTTP. Qualquer falha: NAO emitir.
    if (!salvo) {
      showToast('Nao foi possivel salvar a data. Termo nao emitido.');
      if (btn) { btn.disabled = false; btn.textContent = 'Salvar e emitir'; }
      return;
    }
    obra.data_entrega = val;   // atualiza local so apos o patch confirmar
    document.getElementById('modal-data-entrega-legado')?.remove();
    _emitirTermoObra(obra, val);   // so agora emite o Termo
  } catch (e) {
    showToast('Erro ao salvar a data. Termo nao emitido.');
    if (btn) { btn.disabled = false; btn.textContent = 'Salvar e emitir'; }
  }
}

// ── REATIVAR OBRA ───────────────────────────────────────────────
async function reativarObra(obraId) {
  const obra = [...obras, ...obrasArquivadas].find(o => o.id === obraId);
  const nome = obra?.nome || 'esta obra';
  if (!await confirmar(`Reativar "${esc(nome)}"?`)) return;
  try {
    await sbPatch('obras', `?id=eq.${obraId}`, { arquivada: false });
    await loadObras();
    populateSelects();
    renderObrasCards();
    renderDashboard();
    showToast(`"${nome}" reativada!`);
  } catch (e) { showToast('Nao foi possivel reativar a obra.'); }
}

// ── EDITAR LANCAMENTO (descricao, qtd, valor, data) ─────────────
function editarLancamento(lancId) {
  const lanc = lancamentos.find(l => l.id === lancId);
  if (!lanc) return showToast('Lancamento nao encontrado');
  document.getElementById('modal-editar-lanc')?.remove();
  const inp = 'width:100%;padding:10px 12px;border-radius:var(--radius-sm);background:var(--bg);color:var(--text-primary);border:1px solid var(--border);font-size:14px;box-sizing:border-box;';
  const lb = 'font-size:11px;font-weight:700;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;display:block;';
  const modal = document.createElement('div');
  modal.id = 'modal-editar-lanc';
  modal.className = 'modal-overlay active';
  modal.style.zIndex = '9999';
  modal.innerHTML = `<div class="modal-box" style="max-width:440px;padding:24px;">
    <div style="font-family:'Plus Jakarta Sans',sans-serif;font-size:16px;font-weight:700;margin-bottom:16px;">Editar lancamento</div>
    <div style="margin-bottom:12px;"><label style="${lb}">Descricao</label><input id="el-desc" type="text" value="${esc(lanc.descricao || '')}" style="${inp}"></div>
    <div style="display:flex;gap:10px;margin-bottom:12px;">
      <div style="flex:1;"><label style="${lb}">Quantidade</label><input id="el-qtd" type="number" step="0.001" value="${lanc.qtd != null ? lanc.qtd : ''}" style="${inp}" oninput="_elRecalc()"></div>
      <div style="flex:1;"><label style="${lb}">Valor unit. (R$)</label><input id="el-preco" type="number" step="0.01" value="${lanc.preco != null ? lanc.preco : ''}" style="${inp}" oninput="_elRecalc()"></div>
    </div>
    <div style="display:flex;gap:10px;align-items:flex-end;">
      <div style="flex:1;"><label style="${lb}">Data</label><input id="el-data" type="date" value="${lanc.data || ''}" style="${inp}"></div>
      <div style="flex:1;text-align:right;"><label style="${lb}">Total</label><div id="el-total" data-total-original="${lanc.total != null ? lanc.total : 0}" style="font-family:'Space Grotesk',monospace;font-weight:800;font-size:18px;color:var(--primary);">${fmtR(lanc.total || 0)}</div></div>
    </div>
    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:18px;">
      <button onclick="document.getElementById('modal-editar-lanc')?.remove()" style="padding:10px 20px;border-radius:var(--radius-sm);background:var(--bg);color:var(--text-secondary);border:1px solid var(--border);cursor:pointer;font-size:13px;">Cancelar</button>
      <button class="btn-primary" onclick="salvarLancamentoEdit('${esc(lancId)}')" style="padding:10px 20px;">Salvar</button>
    </div>
  </div>`;
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);
  setTimeout(() => document.getElementById('el-desc')?.focus(), 80);
}

function _elRecalc() {
  const el = document.getElementById('el-total');
  if (!el) return;
  const qtdRaw = document.getElementById('el-qtd')?.value || '';
  const precoRaw = document.getElementById('el-preco')?.value || '';
  // Campo unitario vazio = lancamento avulso: total e autoritativo, exibe o original (nunca R$ 0,00).
  if (qtdRaw.trim() === '' || precoRaw.trim() === '') {
    const orig = parseFloat(el.dataset.totalOriginal);
    el.textContent = fmtR(Number.isFinite(orig) ? orig : 0);
    return;
  }
  const q = parseFloat(qtdRaw);
  const p = parseFloat(precoRaw);
  el.textContent = fmtR((Number.isFinite(q) && Number.isFinite(p)) ? q * p : 0);
}

async function salvarLancamentoEdit(lancId) {
  const desc = (document.getElementById('el-desc')?.value || '').trim();
  const qtdRaw = document.getElementById('el-qtd')?.value || '';
  const precoRaw = document.getElementById('el-preco')?.value || '';
  const data = document.getElementById('el-data')?.value || null;
  if (!desc) return showToast('Informe a descricao.');

  // Onda 2.1 — anti-zeragem de lancamento avulso:
  // vazio detectado pelo raw input (nao pelo numero). Campo vazio = avulso (frete, conta paga, diaria):
  // total e autoritativo, o patch NAO leva qtd/preco/total. Campo preenchido invalido = erro, aborta.
  const qtdVazio = qtdRaw.trim() === '';
  const precoVazio = precoRaw.trim() === '';
  let qtd = null, preco = null;
  if (!qtdVazio) {
    qtd = parseFloat(qtdRaw);
    if (!Number.isFinite(qtd)) return showToast('Quantidade invalida. Corrija para salvar.');
  }
  if (!precoVazio) {
    preco = parseFloat(precoRaw);
    if (!Number.isFinite(preco)) return showToast('Valor unitario invalido. Corrija para salvar.');
  }
  const mexeuFinanceiro = !qtdVazio && !precoVazio;
  const patchLanc = { descricao: desc, data };
  let total;
  if (mexeuFinanceiro) {
    total = qtd * preco;
    patchLanc.qtd = qtd;
    patchLanc.preco = preco;
    patchLanc.total = total;
  }
  try {
    const savedLanc = await sbPatch('lancamentos', `?id=eq.${lancId}`, patchLanc);
    if (!savedLanc) { showToast('Erro ao salvar no banco. Tente novamente.'); return; }
    // Distribuicao vinculada espelha SO o que mudou no lancamento (avulso: so a data, nunca zera valor).
    const dist = (typeof distribuicoes !== 'undefined' ? distribuicoes : []).find(d => d.lancamento_id === lancId);
    if (dist) {
      const patchDist = { data };
      if (mexeuFinanceiro) { patchDist.qtd = qtd; patchDist.valor = total; }
      const savedDist = await sbPatch('distribuicoes', `?id=eq.${dist.id}`, patchDist);
      if (!savedDist) {
        showToast('Lancamento salvo, mas estoque divergiu. Recarregue a pagina.');
        if (typeof loadLancamentos === 'function') await loadLancamentos();
        if (typeof loadDistribuicoes === 'function') await loadDistribuicoes();
        if (typeof filtrarLanc === 'function') filtrarLanc();
        return; // não mostrar sucesso quando distribuição ficou divergente
      }
      Object.assign(dist, patchDist);
    }
    const lanc = lancamentos.find(l => l.id === lancId);
    if (lanc) {
      Object.assign(lanc, { descricao: desc, data });
      if (mexeuFinanceiro) Object.assign(lanc, { qtd, preco, total });
    }
    document.getElementById('modal-editar-lanc')?.remove();
    showToast('Lancamento atualizado');
    if (typeof filtrarLanc === 'function') filtrarLanc();
    if (typeof renderRelatorio === 'function') renderRelatorio();
  } catch (e) { showToast('Erro ao salvar: ' + (e.message || e)); }
}

// ── EDITAR ETAPA (centro de custo) ──────────────────────────────
async function editarEtapaLanc(lancId) {
  const lanc = lancamentos.find(l => l.id === lancId);
  if (!lanc) return showToast('Lancamento nao encontrado');

  // Remove modal anterior — evita acumular #modal-editar-etapa / #sel-nova-etapa duplicados
  // (com IDs duplicados o salvar pegava o select errado e nao alterava o centro de custo)
  document.getElementById('modal-editar-etapa')?.remove();

  const etapaAtual = typeof resolveEtapaKey === 'function' ? resolveEtapaKey(lanc.etapa || '') : (lanc.etapa || '');

  const modal = document.createElement('div');
  modal.id = 'modal-editar-etapa';
  modal.className = 'modal-overlay active';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;';
  modal.innerHTML = `<div style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius-md);padding:24px;max-width:440px;width:100%;">
    <div style="font-family:'Plus Jakarta Sans',sans-serif;font-size:16px;font-weight:700;margin-bottom:6px;">Alterar Centro de Custo</div>
    <div style="font-size:13px;color:var(--text-secondary);margin-bottom:16px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(lanc.descricao || '—')}</div>
    <select id="sel-nova-etapa" style="width:100%;padding:12px;border-radius:var(--radius-sm);background:var(--bg);color:var(--text-primary);border:1px solid var(--border);font-size:14px;margin-bottom:16px;">
      ${etapaSelectOpts(etapaAtual, true)}
    </select>
    <div style="display:flex;gap:10px;justify-content:flex-end;">
      <button onclick="document.getElementById('modal-editar-etapa')?.remove()" style="padding:10px 20px;border-radius:var(--radius-sm);background:var(--bg);color:var(--text-secondary);border:1px solid var(--border);cursor:pointer;font-size:13px;">Cancelar</button>
      <button class="btn-primary" onclick="salvarEtapaLanc('${esc(lancId)}')" style="padding:10px 20px;">Salvar</button>
    </div>
  </div>`;
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);
}

async function salvarEtapaLanc(lancId) {
  const sel = document.getElementById('sel-nova-etapa');
  if (!sel) return;
  const novaEtapa = sel.value || '36_outros';
  try {
    // 1a: checar retorno dos patches antes de tocar estado local (espelha salvarLancamentoEdit).
    // Lancamento primeiro (fonte do custo/etapa); se falha, aborta sem mentir.
    const savedLanc = await sbPatch('lancamentos', `?id=eq.${lancId}`, { etapa: novaEtapa });
    if (!savedLanc) { showToast('Erro ao salvar no banco. Tente novamente.'); return; }
    // Sincronizar etapa na distribuição vinculada (se houver — lancamento sem material nao tem)
    const dist = (typeof distribuicoes !== 'undefined' ? distribuicoes : []).find(d => d.lancamento_id === lancId);
    if (dist) {
      const savedDist = await sbPatch('distribuicoes', `?id=eq.${dist.id}`, { etapa: novaEtapa });
      if (!savedDist) {
        showToast('Etapa do lancamento salva, mas o estoque divergiu. Recarregue a pagina.');
        if (typeof loadLancamentos === 'function') await loadLancamentos();
        if (typeof loadDistribuicoes === 'function') await loadDistribuicoes();
        if (typeof filtrarLanc === 'function') filtrarLanc();
        return; // nao mostrar sucesso quando a distribuicao ficou divergente
      }
      dist.etapa = novaEtapa;
    }
    const lanc = lancamentos.find(l => l.id === lancId);
    if (lanc) lanc.etapa = novaEtapa;
    document.getElementById('modal-editar-etapa')?.remove();
    showToast(`Centro de custo: ${etapaLabel(novaEtapa)}`);
    filtrarLanc();
    if (typeof renderRelatorio === 'function') renderRelatorio();
  } catch (e) { showToast('Erro ao salvar: ' + (e.message || e)); }
}

// ── EDITAR DESCRICAO (vincular catalogo) ────────────────────────
function editarDescLanc(lancId) {
  const lanc = lancamentos.find(l => l.id === lancId);
  if (!lanc) return;

  let modal = document.getElementById('modal-edit-desc');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modal-edit-desc';
    modal.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);';
    modal.addEventListener('click', e => { if (e.target === modal) fecharEditDesc(); });
    const box = document.createElement('div');
    box.style.cssText = 'background:var(--card);border:1px solid var(--border);border-radius:var(--radius-md);padding:24px;width:min(460px,94vw);';
    box.innerHTML = `
      <div style="font-family:'Plus Jakarta Sans',sans-serif;font-size:16px;font-weight:700;margin-bottom:4px;">Vincular ao Catalogo</div>
      <div id="ed-desc-atual" style="font-size:12px;color:var(--text-tertiary);margin-bottom:12px;padding:8px;background:var(--bg);border-radius:var(--radius-sm);"></div>
      <div style="position:relative;">
        <input id="ed-desc-input" type="text" placeholder="Digite o nome do material..." autocomplete="off" style="width:100%;box-sizing:border-box;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px 12px;color:var(--text-primary);font-size:13px;">
        <div id="ed-desc-ac" class="autocomplete-list hidden" style="position:absolute;top:100%;left:0;right:0;z-index:10;max-height:200px;overflow-y:auto;background:var(--card);border:1px solid var(--border);border-radius:var(--radius-sm);"></div>
      </div>
      <div id="ed-desc-selected" style="display:none;margin-top:10px;padding:10px;background:var(--primary-surface);border:1px solid var(--primary-light);border-radius:var(--radius-sm);"><span id="ed-desc-sel-text" style="font-size:12px;color:var(--primary);font-weight:700;"></span></div>
      <div style="display:flex;gap:10px;margin-top:16px;">
        <button id="ed-desc-cancel" style="flex:1;padding:10px;border-radius:var(--radius-sm);background:var(--bg);border:1px solid var(--border);color:var(--text-secondary);cursor:pointer;font-size:13px;">Cancelar</button>
        <button id="ed-desc-btn" class="btn-primary" style="flex:2;padding:10px;" disabled>Salvar</button>
      </div>`;
    modal.appendChild(box);
    document.body.appendChild(modal);
    document.getElementById('ed-desc-cancel').addEventListener('click', fecharEditDesc);
    document.getElementById('ed-desc-btn').addEventListener('click', confirmarEditDesc);
    document.getElementById('ed-desc-input').addEventListener('input', function () {
      this.value = this.value.toUpperCase();
      edDescAutocomplete(this.value);
    });
  }

  modal.dataset.lancId = lancId;
  modal.dataset.selectedCodigo = '';
  modal.dataset.selectedNome = '';
  document.getElementById('ed-desc-atual').textContent = 'Atual: ' + lanc.descricao;
  document.getElementById('ed-desc-input').value = '';
  document.getElementById('ed-desc-selected').style.display = 'none';
  document.getElementById('ed-desc-btn').disabled = true;
  document.getElementById('ed-desc-ac').classList.add('hidden');
  modal.style.display = 'flex';
  setTimeout(() => document.getElementById('ed-desc-input').focus(), 100);
}

function fecharEditDesc() {
  const m = document.getElementById('modal-edit-desc');
  if (m) m.style.display = 'none';
}

function edDescAutocomplete(val) {
  const list = document.getElementById('ed-desc-ac');
  if (!val || val.length < 2) { list.classList.add('hidden'); return; }
  const v = norm(val);
  const palavras = v.split(/\s+/).filter(p => p.length >= 2);
  const numVal = val.replace(/\D/g, '');
  const matches = catalogoMateriais
    .filter(m => {
      const n = norm(m.nome);
      if (numVal && (m.codigo || '').includes(numVal)) return true;
      if (n.includes(v)) return true;
      if (palavras.length > 0 && palavras.every(p => n.includes(p))) return true;
      return false;
    })
    .slice(0, 15);
  if (!matches.length) { list.classList.add('hidden'); return; }
  list.innerHTML = matches.map((m, i) =>
    `<div class="autocomplete-item" data-ed-i="${i}" style="padding:8px 12px;cursor:pointer;display:flex;gap:8px;align-items:center;border-bottom:1px solid var(--border);">
      <span style="font-family:'Space Grotesk',sans-serif;font-size:11px;font-weight:700;color:var(--primary);">${esc(m.codigo)}</span>
      <span style="font-size:13px;color:var(--text-primary);">${esc(m.nome)}</span>
    </div>`
  ).join('');
  list.querySelectorAll('.autocomplete-item').forEach((el, i) => {
    const m = matches[i];
    const fn = e => { e.preventDefault(); edDescSelect(m.codigo, m.nome); };
    el.addEventListener('mousedown', fn);
    el.addEventListener('touchstart', fn, { passive: false });
  });
  list.classList.remove('hidden');
}

function edDescSelect(codigo, nome) {
  const modal = document.getElementById('modal-edit-desc');
  modal.dataset.selectedCodigo = codigo;
  modal.dataset.selectedNome = nome;
  document.getElementById('ed-desc-input').value = nome;
  document.getElementById('ed-desc-ac').classList.add('hidden');
  document.getElementById('ed-desc-selected').style.display = 'block';
  document.getElementById('ed-desc-sel-text').textContent = codigo + ' \u00b7 ' + nome;
  document.getElementById('ed-desc-btn').disabled = false;
}

async function confirmarEditDesc() {
  const modal = document.getElementById('modal-edit-desc');
  const lancId = modal.dataset.lancId;
  const codigo = modal.dataset.selectedCodigo;
  const nome = modal.dataset.selectedNome;
  if (!lancId || !codigo) return;
  const lanc = lancamentos.find(l => l.id === lancId);
  if (!lanc) return;
  const btn = document.getElementById('ed-desc-btn');
  btn.disabled = true;
  btn.textContent = 'Salvando...';
  try {
    const novaDesc = codigo + ' \u00b7 ' + nome;
    // 1b: checar retorno dos patches antes de tocar estado local (espelha salvarLancamentoEdit).
    // Lancamento primeiro (descricao exibida no custo); se falha, aborta sem mentir.
    const savedLanc = await sbPatch('lancamentos', `?id=eq.${lancId}`, { descricao: novaDesc });
    if (!savedLanc) { showToast('Erro ao salvar no banco. Tente novamente.'); return; }
    // Sincronizar codigo_catalogo e item_desc na distribui\u00e7\u00e3o vinculada (se houver)
    const dist = (typeof distribuicoes !== 'undefined' ? distribuicoes : []).find(d => d.lancamento_id === lancId);
    if (dist) {
      const savedDist = await sbPatch('distribuicoes', `?id=eq.${dist.id}`, { codigo_catalogo: codigo, item_desc: nome });
      if (!savedDist) {
        showToast('Descricao salva, mas o estoque divergiu. Recarregue a pagina.');
        if (typeof loadLancamentos === 'function') await loadLancamentos();
        if (typeof loadDistribuicoes === 'function') await loadDistribuicoes();
        if (typeof filtrarLanc === 'function') filtrarLanc();
        return; // nao mostrar sucesso quando a distribuicao ficou divergente
      }
      dist.codigo_catalogo = codigo;
      dist.item_desc = nome;
    }
    lanc.descricao = novaDesc;
    showToast(novaDesc);
    modal.style.display = 'none';
    filtrarLanc();
  } catch (e) {
    console.error('editDesc:', e);
    showToast('Erro ao salvar: ' + e.message);
  } finally {
    // Reabilitar o botao em qualquer saida (sucesso, erro ou return antecipado dos guards).
    btn.disabled = false;
    btn.textContent = 'Salvar';
  }
}

// ── ABRIR NOTA DO LANCAMENTO ────────────────────────────────────
function abrirNotaDoLancamento(lancId) {
  const lanc = lancamentos.find(l => l.id === lancId);
  if (!lanc) return;
  // Via FK direta (nota_id)
  if (lanc.nota_id) { abrirNota(lanc.nota_id); return; }
  // Lançamentos manuais/diárias sem NF
  const obs = (lanc.obs || '').toUpperCase();
  if (obs.includes('ENTRADA DIRETA') || obs.includes('SAIDA MANUAL') || obs.includes('SA\u00cdDA MANUAL')) {
    showToast('Lancamento direto (sem nota fiscal).');
    return;
  }
  // Fallback legado: busca por texto no obs ("NF 1234")
  const descRaw = (lanc.descricao || '').toUpperCase();
  const desc = descRaw.replace(/^\d{4,6}\s*[·-]\s*/, '').trim();
  const obraObj = obras.find(o => o.id === lanc.obra_id) || obrasArquivadas.find(o => o.id === lanc.obra_id);
  const obraNome = obraObj?.nome || '';
  const nfMatch = obs.match(/NF\s+(\S+)/);
  if (nfMatch) {
    const nota = notas.find(n => n.numero_nf && n.numero_nf.toUpperCase() === nfMatch[1]);
    if (nota) { abrirNota(nota.id); return; }
  }
  for (const n of notas) {
    if (n.obra !== obraNome && n.obra !== 'EDR' && n.obra_id !== lanc.obra_id) continue;
    const itens = parseItens(n);
    if (itens.find(i => i.desc.toUpperCase() === desc)) {
      abrirNota(n.id);
      return;
    }
  }
  showToast('Nota nao encontrada para este item.');
}

// ── EXCLUIR LANCAMENTO ──────────────────────────────────────────
async function excluirLanc(id) {
  const lanc = lancamentos.find(l => l.id === id);
  // Lançamento de NF não pode ser excluído manualmente
  if (lanc?.nota_id) { showToast('Custo de NF — exclua pela Nota Fiscal.'); return; }
  if (!await confirmar('Excluir este lancamento? Esta acao nao pode ser desfeita.')) return;
  if (lanc) {
    // Busca por lancamento_id (fonte de verdade)
    let distVinculadas = distribuicoes.filter(d => d.lancamento_id === id);
    // Fallback legado: texto + data (para lançamentos antigos sem lancamento_id na distribuição)
    if (!distVinculadas.length) {
      const descBase = norm(lanc.descricao?.replace(/^\d{4,6}\s*[·\-]\s*/, '') || '');
      distVinculadas = distribuicoes.filter(d =>
        d.obra_id === lanc.obra_id &&
        norm(d.item_desc) === descBase &&
        d.data === lanc.data
      );
    }
    for (const d of distVinculadas) {
      const ok = await sbDelete('distribuicoes', `?id=eq.${d.id}`);
      if (!ok) { showToast('Erro ao reverter movimentacao de estoque. Operacao abortada.'); return; }
      distribuicoes = distribuicoes.filter(x => x.id !== d.id);
    }
  }
  const okLanc = await sbDelete('lancamentos', `?id=eq.${id}`);
  if (!okLanc) { showToast('Erro ao excluir lancamento no banco.'); return; }
  lancamentos = lancamentos.filter(l => l.id !== id);
  filtrarLanc();
  renderDashboard();
  if (typeof renderEstoque === 'function') renderEstoque();
  showToast('Lancamento excluido.');
}

// ── NAVEGACAO ENTRE MODULOS ─────────────────────────────────────
function irParaAdicionais() {
  setView('obras');
  const obraId = ObrasModule.obraAberta || '';
  if (obraId) {
    obrasSwitchTab('add');
  } else if (obras.length) {
    obrasAbrirDetalhe(obras[0].id);
    setTimeout(() => obrasSwitchTab('add'), 100);
  }
}

function irParaEntradaDireta() {
  const obraId = ObrasModule.obraAberta || '';
  setView('estoque');
  setTimeout(() => {
    if (typeof abrirEntradaDireta === 'function') abrirEntradaDireta();
    if (obraId && typeof setDestinoEntrada === 'function') {
      setDestinoEntrada('obra');
      const sel = document.getElementById('entrada-obra-id');
      if (sel) sel.value = obraId;
    }
  }, 100);
}

// ── ENTREGA DIGITAL ─────────────────────────────────────────────
const ENTREGA_BASE_URL = 'https://edreng.com.br/entrega';

function abrirEntregaDigital(slug) {
  window.open(`${ENTREGA_BASE_URL}/${slug}.html`, '_blank');
}
