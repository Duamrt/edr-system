// ══════════════════════════════════════════════════════════════════
// EDR System V2 — Modulo: NOTAS FISCAIS
// Depende: api.js, utils.js, config.js, estoque.js, obras.js,
//          auth.js, menu.js, dashboard.js
// ══════════════════════════════════════════════════════════════════

// ── ESTADO ENCAPSULADO ──────────────────────────────────────────
const NotasModule = {
  itens: [],                // itens do formulario atual
  currentCredito: null,     // credito do item sendo adicionado
  currentCodigo: null,      // codigo catalogo do item atual
  cachedFornecedores: [],   // autocomplete fornecedores
  cachedItens: [],          // autocomplete itens
  acSelectedIdx: -1,        // indice selecionado no autocomplete
  acFornIdx: -1,            // indice fornecedor selecionado
  _rascunhoTimer: null,     // timer do rascunho auto
  _fornecedorTimer: null,   // debounce fornecedor
};

// ── REGISTRO NO VIEW REGISTRY ───────────────────────────────────
if (typeof viewRegistry !== 'undefined') {
  viewRegistry.register('notas', renderNotasView);
}

// ── RENDER PRINCIPAL ────────────────────────────────────────────
function renderNotasView() {
  // Não chamar _notasShowLista() aqui — já estamos nesta view via viewRegistry.invoke
  renderNotas();
  aplicarPerfil();
}

function _notasShowLista() {
  if (typeof setView === 'function') setView('notas');
}

function _notasShowForm() {
  if (typeof setView === 'function') setView('form');
}

// ══════════════════════════════════════════════════════════════════
// LISTA DE NOTAS
// ══════════════════════════════════════════════════════════════════
function renderNotas() {
  const fo = document.getElementById('filtro-obra')?.value || '';
  const ff = document.getElementById('filtro-fornecedor')?.value || '';
  const fc = document.getElementById('filtro-credito')?.value || '';
  const fn = (document.getElementById('filtro-numero-nf')?.value || '').trim().toLowerCase();

  // Popular select de fornecedores (uma vez por render)
  const selForn = document.getElementById('filtro-fornecedor');
  if (selForn) {
    const fornAtuais = new Set();
    selForn.querySelectorAll('option').forEach(o => { if (o.value) fornAtuais.add(o.value); });
    const fornNovos = [...new Set(notas.map(n => n.fornecedor).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    if (fornNovos.length !== fornAtuais.size || fornNovos.some(f => !fornAtuais.has(f))) {
      const valAtual = selForn.value;
      selForn.innerHTML = '<option value="">Todos os fornecedores</option>' + fornNovos.map(f => `<option value="${esc(f)}" ${f === valAtual ? 'selected' : ''}>${esc(f)}</option>`).join('');
    }
  }

  let lista = [...notas];
  if (fo) lista = lista.filter(n => n.obra === fo);
  if (ff) lista = lista.filter(n => n.fornecedor === ff);
  if (fc === 'sim') lista = lista.filter(n => n.gera_credito && n.obra !== COMPANY_DEFAULTS.estoqueGeral && n.obra !== COMPANY_DEFAULTS.escritorio);
  if (fc === 'nao') lista = lista.filter(n => !n.gera_credito && n.obra !== COMPANY_DEFAULTS.estoqueGeral && n.obra !== COMPANY_DEFAULTS.escritorio);
  if (fc === 'estoque') lista = lista.filter(n => n.obra === COMPANY_DEFAULTS.estoqueGeral);
  if (fc === 'escritorio') lista = lista.filter(n => n.obra === COMPANY_DEFAULTS.escritorio);
  if (fn) lista = lista.filter(n => (n.numero_nf || '').toLowerCase().includes(fn));

  const el = document.getElementById('notas-lista');
  if (!el) return;

  if (!lista.length) {
    el.innerHTML = `<div class="empty-state">
      <span class="material-symbols-outlined icon-3xl">receipt_long</span>
      <p>Nenhuma nota fiscal encontrada.</p>
    </div>`;
    return;
  }

  const isAdmin = usuarioAtual?.perfil === 'admin';

  el.innerHTML = lista.map(n => {
    const itens = parseItens(n);
    const isEstoque = n.obra === COMPANY_DEFAULTS.estoqueGeral;
    const isEscritorio = n.obra === COMPANY_DEFAULTS.escritorio;

    // Tag de credito
    let tagCredito = '', tagClass = '';
    if (isEstoque) { tagCredito = 'AGUARD. DISTRIBUICAO'; tagClass = 'nf-tag-estoque'; }
    else if (isEscritorio) { tagCredito = 'CONSUMO DIRETO'; tagClass = 'nf-tag-nat'; }
    else if (n.credito_status === 'sim') { tagCredito = 'CREDITO IBS/CBS'; tagClass = 'nf-tag-credito'; }
    else if (n.credito_status === 'misto') { tagCredito = 'CREDITO PARCIAL'; tagClass = 'nf-tag-misto'; }
    else { tagCredito = 'SEM CREDITO'; tagClass = 'nf-tag-sem'; }

    // Tag de obra
    let tagObra = '', tagObraClass = 'nf-tag-obra';
    if (isEstoque) { tagObra = 'ESTOQUE GERAL'; tagObraClass = 'nf-tag-estoque'; }
    else if (isEscritorio) { tagObra = 'ESCRITORIO'; tagObraClass = 'nf-tag-nat'; }
    else { tagObra = n.obra || '—'; }

    return `<div class="nf-card" onclick="abrirNota('${esc(n.id)}')">
      <div class="nf-card-top">
        <div>
          <span class="nf-card-fornecedor">${esc(n.fornecedor)}</span>
          <span class="nf-card-nf">NF ${esc(n.numero_nf || '')}</span>
        </div>
        ${isAdmin ? `<span class="nf-card-valor">${fmtR(n.valor_bruto)}</span>` : ''}
      </div>
      <div class="nf-card-meta">
        <span>${esc(n.natureza || '')}</span>
        <span>&middot;</span>
        <span>${itens.length} ite${itens.length !== 1 ? 'ns' : 'm'}</span>
        <span>&middot;</span>
        <span>${n.data || ''}</span>
        ${n.frete > 0 ? `<span>&middot;</span><span>Frete: ${fmtR(n.frete)}</span>` : ''}
      </div>
      <div class="nf-card-tags">
        <span class="nf-tag ${tagObraClass}">${tagObra}</span>
        <span class="nf-tag nf-tag-nat">${esc(n.natureza || '')}</span>
        <span class="nf-tag ${tagClass}">${tagCredito}</span>
      </div>
      <div class="nf-card-cnpj">${esc(n.cnpj || 'SEM CNPJ')}</div>
      ${isAdmin ? `<div class="nf-card-acoes"><button class="btn-excluir-nf" onclick="event.stopPropagation();confirmarExclusaoNota('${esc(n.id)}')"><span class="material-symbols-outlined icon-sm">delete</span> Excluir nota</button></div>` : ''}
    </div>`;
  }).join('');

  aplicarPerfil();
}

// ══════════════════════════════════════════════════════════════════
// ESTEIRA DE CLASSIFICACAO HIBRIDA (IBS/CBS)
// Ordem: 1) Catalogo → 2) Historico → 3) Regex → 4) Manual
// ══════════════════════════════════════════════════════════════════

// ITEMS_DB: classificacao por regex (fallback, passo 3)
const ITEMS_DB = [
  { palavras: ['cimento', 'cp ii', 'cp iii', 'cp iv', 'cp v'], cat: 'Material de construcao', credito: true },
  { palavras: ['areia', 'areia grossa', 'areia fina', 'areia media'], cat: 'Material de construcao', credito: true },
  { palavras: ['brita', 'pedra', 'pedrisco', 'cascalho'], cat: 'Material de construcao', credito: true },
  { palavras: ['tijolo', 'bloco', 'bloco ceramico', 'bloco concreto'], cat: 'Material de construcao', credito: true },
  { palavras: ['ferro', 'vergalhao', 'tela soldada', 'arame recozido', 'malha pop'], cat: 'Material de construcao', credito: true },
  { palavras: ['madeira', 'caibro', 'viga', 'ripa', 'sarrafo', 'compensado', 'mdf'], cat: 'Material de construcao', credito: true },
  { palavras: ['cal', 'gesso', 'argamassa', 'reboco', 'chapisco', 'emboco'], cat: 'Material de construcao', credito: true },
  { palavras: ['tinta', 'massa corrida', 'selador', 'primer', 'textura', 'massa acrilica'], cat: 'Material de construcao', credito: true },
  { palavras: ['telha', 'cumeeira', 'rufo', 'calha'], cat: 'Material de construcao', credito: true },
  { palavras: ['piso', 'ceramica', 'porcelanato', 'revestimento', 'azulejo', 'rejunte'], cat: 'Material de construcao', credito: true },
  { palavras: ['porta', 'janela', 'batente', 'marco', 'caixilho', 'esquadria'], cat: 'Material de construcao', credito: true },
  { palavras: ['fechadura', 'trinco', 'macaneta', 'puxador'], cat: 'Material de construcao', credito: true },
  { palavras: ['impermeabilizante', 'desmoldante', 'manta asfaltica', 'aditivo', 'bianco', 'veda calha', 'vedante'], cat: 'Material de construcao', credito: true },
  { palavras: ['parafuso', 'prego', 'bucha', 'chumbador', 'pino'], cat: 'Material de construcao', credito: true },
  { palavras: ['concreto usinado', 'concreto bombeado', 'concretagem'], cat: 'Material de construcao', credito: true },
  { palavras: ['laje', 'lajota', 'tavela', 'vigota', 'pre-moldado'], cat: 'Material de construcao', credito: true },
  { palavras: ['selante', 'cola', 'silicone'], cat: 'Material de construcao', credito: true },
  { palavras: ['pontalete', 'escore metalico'], cat: 'Material de construcao', credito: true },
  { palavras: ['fio', 'cabo eletrico', 'eletroduto', 'conduite'], cat: 'Instalacao eletrica', credito: true },
  { palavras: ['disjuntor', 'quadro eletrico', 'barramento', 'dps'], cat: 'Instalacao eletrica', credito: true },
  { palavras: ['interruptor', 'tomada', 'espelho eletrico'], cat: 'Instalacao eletrica', credito: true },
  { palavras: ['ducha', 'chuveiro', 'aquecedor'], cat: 'Instalacao eletrica', credito: true },
  { palavras: ['lampada', 'luminaria', 'spot', 'refletor', 'led', 'bocal', 'plafon', 'painel led', 'downlight'], cat: 'Instalacao eletrica', credito: true },
  { palavras: ['tubo', 'cano', 'conexao', 'joelho', 'luva hidraulica', 'cotovelo', 'registro', 'valvula'], cat: 'Instalacao hidraulica', credito: true },
  { palavras: ['conexao esgoto', 'te esgoto', 'joelho esgoto', 'luva esgoto', 'cano esgoto'], cat: 'Instalacao hidraulica', credito: true },
  { palavras: ['torneira', 'sifao', 'ralo', 'caixa dagua'], cat: 'Instalacao hidraulica', credito: true },
  { palavras: ['vaso sanitario', 'bacia sanitaria', 'caixa acoplada'], cat: 'Instalacao hidraulica', credito: true },
  { palavras: ['pia', 'cuba', 'tanque', 'lavatorio'], cat: 'Instalacao hidraulica', credito: true },
  { palavras: ['mao de obra', 'mdo', 'servico de', 'servente', 'pedreiro', 'encanador', 'eletricista', 'pintor', 'carpinteiro', 'gesseiro', 'azulejista'], cat: 'Servico de mao de obra', credito: true },
  { palavras: ['andaime', 'betoneira alugada', 'escora', 'balancim', 'equipamento alugado'], cat: 'Equipamento alugado', credito: true },
  { palavras: ['epi', 'capacete', 'bota de seguranca', 'luva de seguranca', 'oculos de protecao'], cat: 'EPI / Seguranca', credito: true },
  { palavras: ['frete', 'transporte de material', 'entrega', 'carreto'], cat: 'Transporte de material', credito: true },
  { palavras: ['combustivel', 'gasolina', 'diesel', 'etanol'], cat: 'Combustivel', credito: false },
  { palavras: ['alimentacao', 'refeicao', 'marmita', 'lanche', 'cafe', 'agua mineral', 'pacoca', 'bolacha', 'biscoito', 'refri'], cat: 'Alimentacao', credito: false },
  { palavras: ['inseticida', 'repelente', 'raid', 'limpeza', 'detergente', 'desinfetante'], cat: 'Limpeza/consumo', credito: false },
  { palavras: ['ferramenta', 'martelo', 'furadeira', 'parafusadeira', 'trena', 'nivelador', 'disco de corte', 'espatula', 'desempenadeira', 'serra', 'makita'], cat: 'Ferramentas', credito: false },
  { palavras: ['escritorio', 'papel', 'caneta', 'impressao', 'xerox', 'toner'], cat: 'Despesas administrativas', credito: false },
  { palavras: ['cadeira', 'mesa', 'movel', 'armario'], cat: 'Mobiliario', credito: false },
];

// Passo 3: classificar por regex
function _classificarPorRegex(desc) {
  if (!desc || desc.length < 2) return null;
  const d = norm(desc) + ' ';
  for (const item of ITEMS_DB) {
    for (const p of item.palavras) {
      const pn = norm(p);
      if (pn.length <= 4) { if (new RegExp('(^|\\s)' + pn + '(\\s|$)').test(d.trim())) return item; }
      else { if (d.includes(pn)) return item; }
    }
  }
  return null;
}

// Passo 1: classificar pelo catalogo (soberano)
function _classificarPorCatalogo(desc, codigo) {
  if (!desc) return null;
  let mat = null;
  if (codigo) mat = catalogoMateriais.find(m => m.codigo === codigo);
  if (!mat) mat = catalogoMateriais.find(m => norm(m.nome) === norm(desc));
  if (!mat) return null;

  // Categorias do catalogo que geram credito
  const catCredito = ['material de construcao', 'instalacao eletrica', 'instalacao hidraulica',
    'servico de mao de obra', 'equipamento alugado', 'epi', 'transporte de material',
    'acabamento', 'aco', 'alvenaria', 'cobertura', 'eletrica', 'esquadrias', 'esgoto',
    'estrutura', 'forma', 'fundacao', 'gesso', 'granito', 'hidraulica', 'impermeabilizacao',
    'loucas', 'mao de obra', 'pintura', 'revestimento'];
  const catSemCredito = ['combustivel', 'alimentacao', 'limpeza', 'ferramentas',
    'despesas administrativas', 'mobiliario', 'expediente', 'tecnologia'];

  const catNorm = norm(mat.categoria || '');
  if (catCredito.some(c => catNorm.includes(norm(c)))) return { credito: true, cat: mat.categoria, fonte: 'catalogo' };
  if (catSemCredito.some(c => catNorm.includes(norm(c)))) return { credito: false, cat: mat.categoria, fonte: 'catalogo' };

  // Se categoria nao mapeada, tenta regex como fallback
  const regex = _classificarPorRegex(desc);
  if (regex) return { credito: regex.credito, cat: regex.cat, fonte: 'catalogo+regex' };

  return null;
}

// Passo 2: classificar pelo historico (memoria de rebanho)
// Consulta as ultimas classificacoes desse item no Supabase
async function _classificarPorHistorico(desc) {
  if (!desc || desc.length < 3) return null;
  const descNorm = norm(desc);

  // Primeiro: buscar local nas notas ja carregadas
  let encontrados = [];
  for (const n of notas) {
    const itens = parseItens(n);
    for (const it of itens) {
      if (norm(it.desc) === descNorm && it.credito !== undefined && it.credito !== null) {
        encontrados.push(it.credito);
      }
    }
    if (encontrados.length >= 3) break;
  }

  if (encontrados.length >= 2) {
    // Maioria vence
    const sim = encontrados.filter(c => c === true).length;
    const nao = encontrados.filter(c => c === false).length;
    const credito = sim >= nao;
    return { credito, cat: 'Historico (' + encontrados.length + 'x)', fonte: 'historico' };
  }

  // Se nao tem local suficiente, tentar buscar no Supabase
  // (tabela notas_fiscais, campo itens JSON, busca por descricao)
  // TODO: criar tabela notas_itens_historico pra consulta direta
  // Por ora usa o que tem local
  return null;
}

// Esteira completa: catalogo → historico → regex → null (manual)
async function classificarItem(desc, codigo) {
  // Passo 1: Catalogo e soberano
  const porCatalogo = _classificarPorCatalogo(desc, codigo);
  if (porCatalogo) return porCatalogo;

  // Passo 2: Historico (memoria de rebanho)
  const porHistorico = await _classificarPorHistorico(desc);
  if (porHistorico) return porHistorico;

  // Passo 3: Regex (fallback)
  const porRegex = _classificarPorRegex(desc);
  if (porRegex) return { credito: porRegex.credito, cat: porRegex.cat, fonte: 'regex' };

  // Passo 4: Nao reconhecido — precisa de intervencao manual
  return null;
}

// Versao sincrona rapida (pra autocomplete sem await)
function classificarItemSync(desc, codigo) {
  const porCatalogo = _classificarPorCatalogo(desc, codigo);
  if (porCatalogo) return porCatalogo;
  const porRegex = _classificarPorRegex(desc);
  if (porRegex) return { credito: porRegex.credito, cat: porRegex.cat, fonte: 'regex' };
  return null;
}

// ══════════════════════════════════════════════════════════════════
// RASCUNHO AUTOMATICO
// ══════════════════════════════════════════════════════════════════
function salvarRascunhoNF() {
  clearTimeout(NotasModule._rascunhoTimer);
  NotasModule._rascunhoTimer = setTimeout(() => {
    try {
      const rascunho = {
        fornecedor: document.getElementById('f-fornecedor')?.value || '',
        cnpj: document.getElementById('f-cnpj')?.value || '',
        numero: document.getElementById('f-numero')?.value || '',
        emissao: document.getElementById('f-emissao')?.value || '',
        recebimento: document.getElementById('f-recebimento')?.value || '',
        obra: document.getElementById('f-obra')?.value || '',
        natureza: document.getElementById('f-natureza')?.value || '',
        frete: document.getElementById('f-frete')?.value || '',
        obs: document.getElementById('f-obs')?.value || '',
        itens: NotasModule.itens || [],
        salvo_em: Date.now()
      };
      if (rascunho.fornecedor || rascunho.numero || rascunho.itens.length) {
        localStorage.setItem('edr_rascunho_nf', JSON.stringify(rascunho));
      }
    } catch (e) { /* silencioso */ }
  }, 1000);
}

function restaurarRascunhoNF() {
  try {
    const raw = localStorage.getItem('edr_rascunho_nf');
    if (!raw) return;
    const r = JSON.parse(raw);
    if (!r.fornecedor && !r.numero && (!r.itens || !r.itens.length)) {
      localStorage.removeItem('edr_rascunho_nf');
      return;
    }
    if (r.salvo_em && Date.now() - r.salvo_em > 7 * 24 * 60 * 60 * 1000) {
      localStorage.removeItem('edr_rascunho_nf');
      return;
    }
    if (!confirm('Voce tem um lancamento incompleto. Deseja continuar?')) {
      localStorage.removeItem('edr_rascunho_nf');
      return;
    }
    if (r.fornecedor) document.getElementById('f-fornecedor').value = r.fornecedor;
    if (r.cnpj) document.getElementById('f-cnpj').value = r.cnpj;
    if (r.numero) document.getElementById('f-numero').value = r.numero;
    if (r.emissao) document.getElementById('f-emissao').value = r.emissao;
    if (r.recebimento) document.getElementById('f-recebimento').value = r.recebimento;
    if (r.obra) document.getElementById('f-obra').value = r.obra;
    if (r.natureza) document.getElementById('f-natureza').value = r.natureza;
    if (r.frete) document.getElementById('f-frete').value = r.frete;
    if (r.obs) document.getElementById('f-obs').value = r.obs;
    if (r.itens && r.itens.length) {
      NotasModule.itens = r.itens;
      renderItensForm();
    }
    atualizarTotalComFrete();
    showToast('Rascunho restaurado!');
  } catch (e) { /* silencioso */ }
}

function limparRascunhoNF() {
  try { localStorage.removeItem('edr_rascunho_nf'); } catch (e) { }
}

// Listeners de rascunho nos campos do form NF
document.addEventListener('DOMContentLoaded', () => {
  ['f-fornecedor', 'f-cnpj', 'f-numero', 'f-emissao', 'f-recebimento', 'f-obra', 'f-natureza', 'f-frete', 'f-obs'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', salvarRascunhoNF);
  });
  const cnpjEl = document.getElementById('f-cnpj');
  if (cnpjEl) cnpjEl.addEventListener('blur', _onCnpjBlur);
});

// Auto-preenche fornecedor ao sair do campo CNPJ
function _onCnpjBlur() {
  const cnpjEl = document.getElementById('f-cnpj');
  const fornEl = document.getElementById('f-fornecedor');
  if (!cnpjEl || !fornEl || fornEl.value.trim()) return;
  const cnpj = cnpjEl.value.replace(/\D/g, '');
  if (cnpj.length !== 14) return;
  const match = notas.find(n => n.cnpj && n.cnpj.replace(/\D/g, '') === cnpj);
  if (match) {
    fornEl.value = match.fornecedor;
    showToast('Fornecedor preenchido automaticamente.');
    salvarRascunhoNF();
  }
}

// ══════════════════════════════════════════════════════════════════
// FORM NF: CABECALHO
// ══════════════════════════════════════════════════════════════════
function atualizarTotalComFrete() {
  const frete = parseFloat(document.getElementById('f-frete')?.value) || 0;
  const frRow = document.getElementById('frete-total-row');
  if (!frRow) return;
  if (frete > 0) {
    document.getElementById('frete-total-val').textContent = fmtR(frete);
    frRow.classList.remove('hidden');
  } else {
    frRow.classList.add('hidden');
  }
}

// AUTOCOMPLETE FORNECEDOR
function onFornecedorInput() {
  clearTimeout(NotasModule._fornecedorTimer);
  NotasModule._fornecedorTimer = setTimeout(() => {
    const val = document.getElementById('f-fornecedor').value.trim();
    const list = document.getElementById('ac-forn-list');
    NotasModule.acFornIdx = -1;
    if (!val || val.length < 2) { list.classList.add('hidden'); NotasModule.cachedFornecedores = []; return; }
    const v = norm(val), map = {};
    notas.forEach(n => { if (norm(n.fornecedor).includes(v) && !map[n.fornecedor]) map[n.fornecedor] = { nome: n.fornecedor, cnpj: n.cnpj || '' }; });
    NotasModule.cachedFornecedores = Object.values(map).slice(0, 6);
    if (!NotasModule.cachedFornecedores.length) { list.classList.add('hidden'); return; }
    list.innerHTML = NotasModule.cachedFornecedores.map((m, i) =>
      `<div class="autocomplete-item ac-item" data-forn-idx="${i}">
        <span class="ac-item-name">${esc(m.nome)}</span>
        <span class="ac-item-sub">${esc(m.cnpj || 'SEM CNPJ')}</span>
      </div>`
    ).join('');
    list.querySelectorAll('.autocomplete-item').forEach(el => {
      const fn = e => { e.preventDefault(); selectFornecedor(parseInt(el.dataset.fornIdx)); };
      el.addEventListener('mousedown', fn);
      el.addEventListener('touchstart', fn, { passive: false });
    });
    list.classList.remove('hidden');
  }, 300);
}

function selectFornecedor(idx) {
  const m = NotasModule.cachedFornecedores[idx];
  if (!m) return;
  document.getElementById('f-fornecedor').value = m.nome;
  if (m.cnpj) document.getElementById('f-cnpj').value = m.cnpj;
  document.getElementById('ac-forn-list').classList.add('hidden');
  NotasModule.acFornIdx = -1;
  document.getElementById('f-obra')?.focus();
  showToast('Fornecedor preenchido!');
}

// ══════════════════════════════════════════════════════════════════
// FORM NF: ITENS (autocomplete + classificacao)
// ══════════════════════════════════════════════════════════════════

// Input de descricao — classifica e mostra autocomplete
async function onDescInput() {
  const val = document.getElementById('i-desc').value;
  const badge = document.getElementById('i-credito-badge');
  const mw = document.getElementById('i-manual-wrap');
  NotasModule.currentCodigo = null;
  NotasModule.acSelectedIdx = -1;

  if (!val || val.length < 2) {
    badge.className = 'nf-credito-badge nf-credito-duvida';
    badge.textContent = 'Digite a descricao para classificacao automatica';
    mw.classList.add('hidden');
    NotasModule.currentCredito = null;
    showAutocomplete(val);
    return;
  }

  // Esteira de classificacao hibrida
  const res = await classificarItem(val, null);
  NotasModule.currentCredito = res ? res.credito : null;

  if (res) {
    mw.classList.add('hidden');
    badge.className = `nf-credito-badge ${res.credito ? 'nf-credito-sim' : 'nf-credito-nao'}`;
    const fonteLabel = res.fonte === 'catalogo' ? 'Catalogo' : res.fonte === 'historico' ? 'Historico' : 'Auto';
    badge.innerHTML = res.credito
      ? `<span class="material-symbols-outlined" class="icon-sm icon-inline">verified</span> GERA CREDITO IBS/CBS — ${esc(res.cat)} <span style="font-size:10px;opacity:.6;">(${fonteLabel})</span>`
      : `<span class="material-symbols-outlined" class="icon-sm icon-inline">block</span> NAO GERA CREDITO — ${esc(res.cat)} <span style="font-size:10px;opacity:.6;">(${fonteLabel})</span>`;
  } else {
    badge.className = 'nf-credito-badge nf-credito-duvida';
    badge.innerHTML = '<span class="material-symbols-outlined" class="icon-sm icon-inline">help</span> NAO RECONHECIDO — classifique abaixo';
    mw.classList.remove('hidden');
  }

  showAutocomplete(val);
}

function classificarManual(credito) {
  NotasModule.currentCredito = credito;
  const badge = document.getElementById('i-credito-badge');
  badge.className = `nf-credito-badge ${credito ? 'nf-credito-sim' : 'nf-credito-nao'}`;
  badge.innerHTML = credito
    ? '<span class="material-symbols-outlined" class="icon-sm icon-inline">verified</span> CLASSIFICADO MANUALMENTE — GERA CREDITO'
    : '<span class="material-symbols-outlined" class="icon-sm icon-inline">block</span> CLASSIFICADO MANUALMENTE — SEM CREDITO';
  document.getElementById('i-manual-wrap').classList.add('hidden');
}

// AUTOCOMPLETE ITENS
function showAutocomplete(val) {
  const list = document.getElementById('ac-list');
  if (!val || val.length < 2) { list.classList.add('hidden'); NotasModule.cachedItens = []; return; }
  const v = norm(val), matches = [], seen = new Set();

  // Buscar no catalogo
  catalogoMateriais.filter(m => norm(m.nome).includes(v) || m.codigo.includes(v)).slice(0, 5).forEach(m => {
    if (!seen.has(m.nome)) {
      seen.add(m.nome);
      const res = classificarItemSync(m.nome, m.codigo);
      matches.push({ label: m.nome, credito: res?.credito ?? null, cat: res?.cat || m.categoria || '', unidade: m.unidade || '', codigo: m.codigo, fromCatalogo: true });
    }
  });

  // Opcao de cadastro rapido
  const txt = val.trim().toUpperCase();
  matches.push({ label: txt, credito: null, cat: '', unidade: '', codigo: null, cadastroRapido: true });

  NotasModule.cachedItens = matches;

  list.innerHTML = matches.map((m, i) => m.cadastroRapido
    ? `<div class="autocomplete-item ac-item-cadastro" data-ac-idx="${i}">
        <span>+ CADASTRAR "${esc(m.label)}" NO CATALOGO</span>
      </div>`
    : `<div class="autocomplete-item ac-item" data-ac-idx="${i}">
        <span class="ac-item-name">${m.fromCatalogo ? `<span class="ac-item-code">${esc(m.codigo)}</span>` : ''}${esc(m.label)}</span>
        <span class="ac-badge ${m.credito === true ? 'ac-badge-sim' : m.credito === false ? 'ac-badge-nao' : 'ac-badge-duvida'}">${m.credito === true ? 'CREDITO' : m.credito === false ? 'SEM CREDITO' : '...'}</span>
      </div>`
  ).join('');

  list.querySelectorAll('.autocomplete-item').forEach(el => {
    const fn = e => { e.preventDefault(); selectAC(parseInt(el.dataset.acIdx)); };
    el.addEventListener('mousedown', fn);
    el.addEventListener('touchstart', fn, { passive: false });
  });
  list.classList.remove('hidden');
}

function selectAC(idx) {
  const m = NotasModule.cachedItens[idx];
  if (!m) return;
  if (m.cadastroRapido) { cadastroRapidoMaterial(m.label, 'nf'); return; }

  document.getElementById('i-desc').value = m.label;
  document.getElementById('ac-list').classList.add('hidden');
  NotasModule.acSelectedIdx = -1;
  NotasModule.currentCredito = m.credito;
  NotasModule.currentCodigo = m.codigo || null;

  const badge = document.getElementById('i-credito-badge');
  if (m.credito === null) {
    badge.className = 'nf-credito-badge nf-credito-duvida';
    badge.innerHTML = '<span class="material-symbols-outlined" class="icon-sm icon-inline">help</span> NAO RECONHECIDO — classifique abaixo';
    document.getElementById('i-manual-wrap').classList.remove('hidden');
  } else {
    badge.className = `nf-credito-badge ${m.credito ? 'nf-credito-sim' : 'nf-credito-nao'}`;
    badge.innerHTML = m.credito
      ? `<span class="material-symbols-outlined" class="icon-sm icon-inline">verified</span> GERA CREDITO IBS/CBS — ${esc(m.cat)}`
      : `<span class="material-symbols-outlined" class="icon-sm icon-inline">block</span> NAO GERA CREDITO — ${esc(m.cat)}`;
    document.getElementById('i-manual-wrap').classList.add('hidden');
  }

  if (m.unidade) document.getElementById('i-unidade').value = m.unidade;
  document.getElementById('i-qtd').focus();
}

// ══════════════════════════════════════════════════════════════════
// FORM NF: CALCULOS E LISTA DE ITENS
// ══════════════════════════════════════════════════════════════════
function calcItemTotal() {
  const q = parseFloat(document.getElementById('i-qtd').value) || 0;
  const p = parseFloat(document.getElementById('i-preco').value) || 0;
  const d = parseFloat(document.getElementById('i-desconto').value) || 0;
  document.getElementById('i-total').value = Math.max(0, q * p - d).toFixed(2);
  const precoEl = document.getElementById('i-preco');
  if (p <= 0 && precoEl.value !== '') {
    precoEl.style.borderColor = 'var(--error)';
    precoEl.style.boxShadow = '0 0 0 2px rgba(220,38,38,.12)';
  } else {
    precoEl.style.borderColor = '';
    precoEl.style.boxShadow = '';
  }
}

// adicionarItem aceita JSON (desacoplado do HTML pra futuro XML import)
function adicionarItem(itemData) {
  let desc, qtd, unidade, preco, desconto, total, imposto, credito, cat, codigo;

  if (itemData && typeof itemData === 'object') {
    // Chamada programatica (JSON) — futuro: import XML
    desc = (itemData.desc || '').trim().toUpperCase();
    qtd = parseFloat(itemData.qtd) || 1;
    unidade = (itemData.unidade || 'UN').trim().toUpperCase();
    preco = parseFloat(itemData.preco) || 0;
    desconto = parseFloat(itemData.desconto) || 0;
    total = itemData.total != null ? parseFloat(itemData.total) : Math.max(0, qtd * preco - desconto);
    imposto = parseFloat(itemData.imposto) || 0;
    credito = itemData.credito != null ? itemData.credito : null;
    cat = itemData.cat || '';
    codigo = itemData.codigo || '';
  } else {
    // Chamada do form HTML
    desc = (document.getElementById('i-desc').value || '').trim().toUpperCase();
    qtd = parseFloat(document.getElementById('i-qtd').value) || 1;
    unidade = (document.getElementById('i-unidade').value || '').trim().toUpperCase();
    preco = parseFloat(document.getElementById('i-preco').value) || 0;
    desconto = parseFloat(document.getElementById('i-desconto').value) || 0;
    total = Math.max(0, qtd * preco - desconto);
    imposto = parseFloat(document.getElementById('i-imposto').value) || 0;
    credito = NotasModule.currentCredito;
    const res = classificarItemSync(desc, NotasModule.currentCodigo);
    cat = res?.cat || 'Manual';
    codigo = NotasModule.currentCodigo || '';
  }

  if (!desc) { showToast('Informe a descricao do item.'); document.getElementById('i-desc')?.focus(); return false; }
  if (!preco || preco <= 0) { showToast('Valor unitario obrigatorio.'); document.getElementById('i-preco')?.focus(); return false; }
  if (credito === null) { showToast('Classifique o item antes de adicionar.'); document.getElementById('i-desc')?.focus(); return false; }

  NotasModule.itens.push({ desc, qtd, unidade, preco, total, imposto, credito, cat, codigo });
  renderItensForm();

  // Limpar form HTML (se chamada do form)
  if (!itemData) {
    ['i-desc', 'i-qtd', 'i-unidade', 'i-preco', 'i-desconto', 'i-total', 'i-imposto'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    const badge = document.getElementById('i-credito-badge');
    if (badge) {
      badge.className = 'nf-credito-badge nf-credito-duvida';
      badge.textContent = 'Digite a descricao para classificacao automatica';
    }
    document.getElementById('i-manual-wrap')?.classList.add('hidden');
    NotasModule.currentCredito = null;
    NotasModule.currentCodigo = null;
    NotasModule.acSelectedIdx = -1;
    document.getElementById('i-desc')?.focus();
  }

  salvarRascunhoNF();
  return true;
}

function removerItem(idx) {
  NotasModule.itens.splice(idx, 1);
  renderItensForm();
  salvarRascunhoNF();
}

function renderItensForm() {
  const lista = document.getElementById('itens-lista');
  const totalRow = document.getElementById('item-total-row');
  if (!lista) return;

  if (!NotasModule.itens.length) {
    lista.innerHTML = '';
    if (totalRow) totalRow.classList.add('hidden');
    return;
  }

  if (totalRow) totalRow.classList.remove('hidden');
  const subtotal = NotasModule.itens.reduce((s, i) => s + i.total, 0);
  const subEl = document.getElementById('item-total-val');
  if (subEl) subEl.textContent = fmtR(subtotal);

  lista.innerHTML = NotasModule.itens.map((item, idx) => `
    <div class="nf-item-row">
      <div style="flex:1;min-width:0;">
        <div class="nf-item-desc">
          ${item.codigo ? `<span class="ac-item-code">${esc(item.codigo)}</span>` : ''}
          ${esc(item.desc)}
        </div>
        <div class="nf-item-meta">
          <span>${Number(item.qtd) % 1 === 0 ? item.qtd : Number(item.qtd).toFixed(3)} ${esc(item.unidade)}</span>
          <span>${fmtR(item.preco)}/un</span>
          <span class="nf-item-credito ${item.credito ? 'nf-item-credito-sim' : 'nf-item-credito-nao'}">${item.credito ? 'CREDITO' : 'SEM CREDITO'}</span>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <span class="nf-item-valor">${fmtR(item.total)}</span>
        <button class="nf-item-remove" onclick="removerItem(${idx})">
          <span class="material-symbols-outlined icon-sm">delete</span>
        </button>
      </div>
    </div>
  `).join('');
}

// ══════════════════════════════════════════════════════════════════
// SALVAR NOTA FISCAL
// ══════════════════════════════════════════════════════════════════

// Auto-cadastro de materiais novos no catalogo
async function autocadastrarMateriais(itens) {
  const novos = [];
  for (const it of itens) {
    const nomeNorm = norm(it.desc);
    if (!nomeNorm) continue;
    const existe = catalogoMateriais.find(m => norm(m.nome) === nomeNorm);
    if (existe) continue;
    const codigo = typeof _proxCodigoCatalogo === 'function' ? _proxCodigoCatalogo() : '';
    const categoria = typeof getCatEstoque === 'function' ? getCatEstoque(it.desc) : '';
    const unidade = it.unidade || 'UN';
    try {
      const [saved] = await sbPost('materiais', { codigo, nome: it.desc.toUpperCase().trim(), unidade, categoria, auto: true });
      if (saved) {
        catalogoMateriais.push(saved);
        catalogoMateriais.sort((a, b) => a.codigo.localeCompare(b.codigo));
        novos.push(saved.nome);
      }
    } catch (e) { /* silencioso */ }
  }
  return novos;
}

// ── VERIFICAÇÃO DE FORNECEDOR DUPLICADO ─────────────────────────
// Normaliza nome: MAIÚSCULAS + sem acento + sem cedilha
function _normForn(s) {
  return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
}

// Retorna o fornecedor existente (nome + cnpj) se nome normalizado ou CNPJ já estiver cadastrado
// com grafia diferente. Prefere a entrada mais completa (com CNPJ). Retorna null se sem conflito.
function _detectarFornDuplicado(novoNome, novoCnpj) {
  const normNovo = _normForn(novoNome);
  const cnpjNovo = (novoCnpj || '').replace(/\D/g, '');
  const mapaNome = {};  // normNome → entry (prefer entry with cnpj)
  const mapaCnpj = {};  // cnpj → entry (prefer entry with longer name = more complete)

  notas.forEach(n => {
    if (!n.fornecedor) return;
    const chave = _normForn(n.fornecedor);
    const cnpj = (n.cnpj || '').replace(/\D/g, '');
    const entry = { nome: n.fornecedor, cnpj };

    // Por nome: prefere entrada que tem CNPJ
    if (!mapaNome[chave] || (!mapaNome[chave].cnpj && cnpj)) {
      mapaNome[chave] = entry;
    }
    // Por CNPJ: prefere entrada com nome mais longo (mais informação)
    if (cnpj.length >= 11) {
      if (!mapaCnpj[cnpj] || mapaCnpj[cnpj].nome.length < n.fornecedor.length) {
        mapaCnpj[cnpj] = entry;
      }
    }
  });

  // 1) Mesmo CNPJ com nome normalizado diferente
  if (cnpjNovo.length >= 11 && mapaCnpj[cnpjNovo]) {
    const existente = mapaCnpj[cnpjNovo];
    if (_normForn(existente.nome) !== normNovo) return existente;
  }
  // 2) Mesmo nome normalizado com grafia diferente
  if (mapaNome[normNovo] && _normForn(mapaNome[normNovo].nome) !== normNovo) return mapaNome[normNovo];
  // 3) Mesmo nome normalizado mas diferente do salvo (acento/caixa)
  if (mapaNome[normNovo] && mapaNome[normNovo].nome !== novoNome) return mapaNome[normNovo];
  return null;
}

// Exibe modal de conflito e retorna: 'usar' | 'cancelar'
async function _alertarFornDuplicado(existente, novoNome, novoCnpj) {
  const cnpjExib = existente.cnpj ? ` · CNPJ: ${existente.cnpj}` : '';
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay active';
    overlay.innerHTML = `
      <div class="modal-box" style="max-width:460px;">
        <div class="modal-header">
          <span class="modal-title" style="color:var(--amarelo,#f59e0b);">⚠ Fornecedor já cadastrado</span>
          <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
        <div class="modal-body" style="line-height:1.7;font-size:13px;">
          <p>O fornecedor digitado:</p>
          <p style="font-weight:700;color:var(--text-primary);margin:4px 0 12px 0;">"${esc(novoNome)}"</p>
          <p>já existe no sistema como:</p>
          <p style="font-weight:700;color:var(--verde-hl);margin:4px 0 12px 0;">"${esc(existente.nome)}"${esc(cnpjExib)}</p>
          <p style="color:var(--texto3);">Usar o cadastro existente garante agrupamento correto nos relatórios.</p>
        </div>
        <div class="modal-footer">
          <button class="btn" style="color:var(--text-secondary);" id="_fdup-cancelar">Cancelar</button>
          <button class="btn btn-primary" id="_fdup-usar">Usar fornecedor existente</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('#_fdup-usar').onclick = () => { overlay.remove(); resolve('usar'); };
    overlay.querySelector('#_fdup-cancelar').onclick = () => { overlay.remove(); resolve('cancelar'); };
    overlay.querySelector('.modal-close').onclick = () => { overlay.remove(); resolve('cancelar'); };
    overlay.addEventListener('keydown', e => { if (e.key === 'Escape') { overlay.remove(); resolve('cancelar'); } });
  });
}

// salvarNota aceita JSON (desacoplado do HTML pra futuro XML import)
async function salvarNota(notaData) {
  let numero, fornecedor, emissao, recebimento, cnpjVal, destino, natureza, frete, obs, itens;

  if (notaData && typeof notaData === 'object') {
    // Chamada programatica (JSON) — futuro: import XML
    numero = (notaData.numero || '').trim();
    fornecedor = _normForn(notaData.fornecedor || '');
    emissao = notaData.emissao || '';
    recebimento = notaData.recebimento || emissao;
    cnpjVal = notaData.cnpj || '';
    destino = notaData.obra || COMPANY_DEFAULTS.estoqueGeral;
    natureza = notaData.natureza || '';
    frete = parseFloat(notaData.frete) || 0;
    obs = (notaData.obs || '').toUpperCase();
    itens = notaData.itens || [];
  } else {
    // Chamada do form HTML
    numero = (document.getElementById('f-numero').value || '').trim();
    fornecedor = _normForn(document.getElementById('f-fornecedor').value || '');
    emissao = document.getElementById('f-emissao')?.value || '';
    recebimento = document.getElementById('f-recebimento')?.value || emissao;
    cnpjVal = (document.getElementById('f-cnpj').value || '').trim();
    destino = document.getElementById('f-obra')?.value || COMPANY_DEFAULTS.estoqueGeral;
    natureza = document.getElementById('f-natureza')?.value || '';
    frete = parseFloat(document.getElementById('f-frete')?.value) || 0;
    obs = (document.getElementById('f-obs')?.value || '').toUpperCase();
    itens = NotasModule.itens;
  }

  // Validacoes
  if (!fornecedor || !emissao || !numero) { showToast('Preencha fornecedor, numero da nota e data.'); return false; }
  if (!itens.length) { showToast('Adicione pelo menos um item.'); return false; }

  // Trava de fornecedor duplicado — usa cadastro existente silenciosamente
  const _fornDup = _detectarFornDuplicado(fornecedor, cnpjVal);
  if (_fornDup) {
    fornecedor = _fornDup.nome;
    if (_fornDup.cnpj && !cnpjVal) cnpjVal = _fornDup.cnpj;
    const fEl = document.getElementById('f-fornecedor');
    const cEl = document.getElementById('f-cnpj');
    if (fEl) fEl.value = fornecedor;
    if (cEl && _fornDup.cnpj) cEl.value = _fornDup.cnpj;
  }

  if (!cnpjVal) {
    const prosseguir = await confirmar('CNPJ nao informado. Sem CNPJ o lancamento fica incompleto para fins fiscais. Salvar mesmo assim?');
    if (!prosseguir) { document.getElementById('f-cnpj')?.focus(); return false; }
  }

  // Verificacao de duplicidade
  const nfDup = notas.find(n =>
    n.numero_nf && n.numero_nf.toUpperCase() === numero.toUpperCase() &&
    norm(n.fornecedor) === norm(fornecedor)
  );
  if (nfDup) {
    const dataLanc = fmtData(nfDup.data);
    const confirmaDup = await confirmar(`NF ${numero} do fornecedor ${fornecedor} ja foi lancada em ${dataLanc}. Salvar causara duplicidade. Confirma?`);
    if (!confirmaDup) return false;
  }

  const btn = document.getElementById('btn-salvar');
  if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }

  const subtotal = itens.reduce((s, i) => s + i.total, 0);
  const totalBruto = subtotal + frete;
  const totalImposto = itens.reduce((s, i) => s + (i.imposto || 0), 0);
  const temCredito = itens.some(i => i.credito) || frete > 0;
  const csSimples = itens.length === 0 ? 'misto' : itens.every(i => i.credito) ? 'sim' : itens.some(i => i.credito) || frete > 0 ? 'misto' : 'nao';

  try {
    const payload = {
      data: emissao, data_recebimento: recebimento, natureza,
      numero_nf: numero.toUpperCase(), fornecedor, cnpj: cnpjVal,
      obra: destino, valor_bruto: totalBruto, frete, imposto: totalImposto,
      gera_credito: temCredito, credito_status: csSimples,
      itens: JSON.stringify(itens), obs
    };
    const [saved] = await sbPost('notas_fiscais', payload);
    const notaSalva = { ...saved, valor_bruto: totalBruto, frete };
    notas.unshift(notaSalva);

    // Auto-cadastrar materiais novos no catalogo
    const novosMatsCat = await autocadastrarMateriais(itens);
    if (novosMatsCat.length > 0) {
      console.log(`[EDR] Auto-cadastrado(s) no catalogo: ${novosMatsCat.join(', ')}`);
    }

    // Baixa automatica pra escritorio (limpeza/alimentacao/expediente)
    if (destino === COMPANY_DEFAULTS.estoqueGeral) {
      const CATS_ESCRITORIO = ['limpeza', 'alimentacao', 'expediente'];
      const itensEscritorio = itens.filter(it => typeof getCatEstoque === 'function' && CATS_ESCRITORIO.includes(getCatEstoque(it.desc)));
      if (itensEscritorio.length > 0) {
        const obraEsc = obras.find(o => o.nome && o.nome.toUpperCase().includes('ESCRIT'));
        if (obraEsc) {
          const hoje = hojeISO();
          for (const it of itensEscritorio) {
            const itemIdx = itens.indexOf(it);
            const [dist] = await sbPost('distribuicoes', {
              nota_id: saved.id, item_desc: it.desc, item_idx: itemIdx,
              obra_id: obraEsc.id, obra_nome: obraEsc.nome,
              qtd: it.qtd, valor: it.total, data: hoje
            });
            if (dist) distribuicoes.push({ ...dist, obra_nome: obraEsc.nome });
            const descLanc = it.codigo ? `${it.codigo} \u00b7 ${it.desc}` : it.desc;
            const [lanc] = await sbPost('lancamentos', {
              obra_id: obraEsc.id, descricao: descLanc,
              qtd: it.qtd, preco: it.preco, total: it.total,
              data: hoje, obs: `NF ${numero} \u00b7 ${fornecedor} \u00b7 Baixa automatica`
            });
            if (lanc) lancamentos.unshift(lanc);
          }
          showToast(`NF lancada! ${itensEscritorio.length} item(ns) baixado(s) → ${obraEsc.nome}`);
        } else {
          showToast('NF lancada! Crie a obra Escritorio para baixa automatica.');
        }
      } else {
        showToast('Nota fiscal lancada!');
      }
    } else {
      showToast('Nota fiscal lancada!');
    }

    resetForm();
    renderDashboard();
    if (typeof renderEstoque === 'function') renderEstoque();
    renderNotas();
    _notasShowLista();
    return true;
  } catch (e) {
    console.error('Erro ao salvar nota:', e);
    if (e.message && e.message.includes('does not exist')) {
      showToast('Execute o SQL na aba Setup.');
      setView('setup');
    } else {
      showToast('Erro ao salvar: ' + (e.message || 'verifique sua conexao.'));
    }
    return false;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Salvar Nota Fiscal'; }
  }
}

function onDestinoChange() {
  const val = document.getElementById('f-obra')?.value || '';
  const aviso = document.getElementById('aviso-escritorio');
  if (aviso) aviso.classList.toggle('hidden', val !== COMPANY_DEFAULTS.escritorio);
}

function resetForm() {
  limparRascunhoNF();
  NotasModule.itens = [];
  NotasModule.currentCredito = null;
  NotasModule.currentCodigo = null;
  renderItensForm();
  ['f-numero', 'f-fornecedor', 'f-cnpj', 'f-obs', 'f-frete'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const selObra = document.getElementById('f-obra');
  if (selObra) selObra.value = COMPANY_DEFAULTS.estoqueGeral;
  const frRow = document.getElementById('frete-total-row');
  if (frRow) frRow.classList.add('hidden');
  if (typeof setToday === 'function') setToday();
}

// ══════════════════════════════════════════════════════════════════
// ABRIR FORM NOVA NF
// ══════════════════════════════════════════════════════════════════
function abrirFormNF() {
  resetForm();
  _notasShowForm();
  restaurarRascunhoNF();
  setTimeout(() => document.getElementById('f-fornecedor')?.focus(), 100);
}

// ══════════════════════════════════════════════════════════════════
// WRAPPERS GLOBAIS — botões do form NF chamam estas funções
// (ImportModule carrega depois no order de scripts, mas executa depois)
// ══════════════════════════════════════════════════════════════════
function abrirImportXML() {
  if (typeof ImportModule === 'undefined') { showToast('Modulo de importacao nao carregado.'); return; }
  ImportModule.abrir();
  setTimeout(() => ImportModule.abrirXML(), 150);
}
function abrirImportRapida() {
  if (typeof ImportModule === 'undefined') { showToast('Modulo de importacao nao carregado.'); return; }
  ImportModule.abrir();
}
function processarXMLNFe(input) {
  if (typeof ImportModule === 'undefined') { showToast('Modulo de importacao nao carregado.'); return; }
  ImportModule.processarXML(input);
}

// ══════════════════════════════════════════════════════════════════
// EXCLUSAO DE NOTA FISCAL COM ESTORNO
// ══════════════════════════════════════════════════════════════════
async function confirmarExclusaoNota(id) {
  const nota = notas.find(n => n.id === id || n.id === Number(id));
  if (!nota) { showToast('Nota nao encontrada.', 'error'); return; }

  // Trava: nota paga no financeiro
  if (typeof contasPagar !== 'undefined' && Array.isArray(contasPagar)) {
    const nfNum = (nota.numero_nf || '').toUpperCase().trim();
    const contaPaga = contasPagar.find(c =>
      c.status === 'pago' && (c.nota_ref || '').toUpperCase().trim() === nfNum
    );
    if (contaPaga) {
      showToast(`NF ${nota.numero_nf} ja esta PAGA no financeiro. Cancele o pagamento antes de excluir.`, 'error');
      return;
    }
  }

  const destino = nota.obra || 'sem destino';
  const itens = parseItens(nota);
  const ok = confirm(
    `Excluir NF ${nota.numero_nf || '(sem numero)'} de ${nota.fornecedor}?\n\n` +
    `Destino: ${destino}\n` +
    `Itens: ${itens.length}\n` +
    `Valor: ${fmtR(nota.valor_bruto)}\n\n` +
    `O estoque/custo sera estornado automaticamente.\n` +
    `Esta acao NAO pode ser desfeita.`
  );
  if (!ok) return;
  await processarExclusaoNota(id);
}

async function processarExclusaoNota(id) {
  const nota = notas.find(n => n.id === id || n.id === Number(id));
  if (!nota) { showToast('Nota nao encontrada.', 'error'); return; }

  const nfNum = (nota.numero_nf || '').toUpperCase().trim();
  const erros = [];

  try {
    // Passo A: Excluir distribuicoes vinculadas (tem nota_id real)
    try {
      await sbDelete('distribuicoes', `?nota_id=eq.${nota.id}`);
      if (typeof distribuicoes !== 'undefined' && Array.isArray(distribuicoes)) {
        distribuicoes = distribuicoes.filter(d => d.nota_id !== nota.id);
      }
    } catch(e) {
      erros.push('distribuicoes: ' + (e.message || e));
      console.error('[EDR] Erro ao excluir distribuicoes da NF', nota.id, e);
    }

    // Passo B: Excluir lancamentos de "baixa automatica" desta NF (por ID)
    if (typeof lancamentos !== 'undefined' && Array.isArray(lancamentos) && nfNum) {
      const lancsDaNota = lancamentos.filter(l =>
        l.obs && l.obs.toUpperCase().includes('NF ' + nfNum)
      );
      for (const l of lancsDaNota) {
        try {
          await sbDelete('lancamentos', `?id=eq.${l.id}`);
        } catch(e) {
          erros.push(`lancamento ${l.id}: ` + (e.message || e));
          console.error('[EDR] Erro ao excluir lancamento', l.id, e);
        }
      }
      if (lancsDaNota.length) {
        lancamentos = lancamentos.filter(l => !lancsDaNota.some(x => x.id === l.id));
      }
    }

    // Passo C: Excluir a nota principal
    await sbDelete('notas_fiscais', `?id=eq.${nota.id}`);

    // Atualizar memoria local
    notas = notas.filter(n => n.id !== nota.id);

    // Re-renderizar
    renderNotas();
    if (typeof renderEstoque === 'function') renderEstoque();
    if (typeof renderDashboard === 'function') renderDashboard();

    if (erros.length) {
      showToast(`Nota excluida com avisos: ${erros.join('; ')}`, 'warning');
    } else {
      showToast(`NF ${nota.numero_nf || ''} excluida. Estorno aplicado.`, 'success');
    }
  } catch(e) {
    console.error('[EDR] Erro critico ao excluir nota', id, e);
    showToast('Erro ao excluir nota: ' + (e.message || 'verifique o console.'), 'error');
  }
}
