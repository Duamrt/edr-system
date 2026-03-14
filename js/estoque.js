// ══════════════════════════════════════════
// ESTOQUE
// ══════════════════════════════════════════
function getSaldoItem(notaId, itemIdx, qtdOriginal) {
  const distribuido = distribuicoes.filter(d => d.nota_id === notaId && d.item_idx === itemIdx).reduce((s,d) => s + Number(d.qtd), 0);
  return qtdOriginal - distribuido; // permite negativo para reconciliação correta
}

const CATS_ESTOQUE = [
  { key:'prelim',     lb:'⛏ Serv. Preliminar',   fn: d => /andaime|tapume|demolic|terraplan|escavac|aterro|compactac|reaterro|locacao de obra|limpeza de terreno|placa de obra/i.test(d) },
  { key:'fundacao',   lb:'🏗 Fundação',           fn: d => /sapata|estaca|bloco de fundc|baldrame|radier|viga baldr|cinta|fundac|brocas|microestaca/i.test(d) },
  { key:'estrutura',  lb:'🔩 Estrutura',          fn: d => /pontalete|escore|cimbramento|forma |madeira|caibro|viga|ripa|sarrafo|compensado|mdf|compensado/i.test(d) },
  { key:'aco',        lb:'⚙ Aço / Ferro',        fn: d => /ferro|vergalh|estribo|tela sold|malha pop|arame recoz|aco ca|aco cp|barra chata|cantoneira|perfil met/i.test(d) },
  { key:'forma',      lb:'🪵 Forma e Madeira',   fn: d => /forma |chapa resinada|sarrafo|gravata|espaçad|arame recozido|desmoldante|pontalete|escora|madeira|caibro|viga|ripa|tabua|ripao|regua|prego|pino de aco|porta madeira|porta de mad/i.test(d) },
  { key:'alvenaria',  lb:'🧱 Alvenaria',          fn: d => /cimento|areia|brita|tijolo|bloco|reboco|chapisco|argamassa|cal|saibro|pedrisco|concreto|concreto usinado/i.test(d) },
  { key:'eletrica',   lb:'⚡ Elétrica',           fn: d => /fio |cabo flex|eletroduto|conduite|disjuntor|quadro el|barramento|interruptor|tomada|espelho el|bocal|lampada|luminaria|led|painel led|downlight|plafon|refletor|haste|dps|idr|spda|para.raio|cx luz|caixa de luz|cx 4x2|cx 4x4|pontalete plas/i.test(d) },
  { key:'impermeab',  lb:'💧 Impermeabilização',  fn: d => /impermeab|manta asf|manta bidin|primer betum|aditivo imperm|cristaliz|neutrol|vedacit|sika|manta flex/i.test(d) },
  { key:'hidraulica', lb:'🚿 Hidráulica',         fn: d => /tubo pvc agua|cano agua|joelho agua|luva agua|cotovelo agua|valvula|conex.*agua|cola pvc|sifao|caixa d.?agua|engate|joelho krona|joelho plast|joelho sold|joelho bch|joelho lt|joelho pvc|tubo sold|tubo krona|tubo plast|tubo pvc|eletroduto pvc|eletroduto corrugado/i.test(d) },
  { key:'loucas',     lb:'🛁 Louças e Metais',   fn: d => /bacia sanit|vaso sanit|cuba|tanque|lavatorio|lavat|pia|torneira|registro|chuveiro|ducha|aquecedor|misturador|kit complet|caixa acoplada|assento|kit banheiro|conjunto sanit/i.test(d) },
  { key:'esgoto',     lb:'🪠 Esgoto',            fn: d => /esg|juncao|caixa sifonada|caixa de inspe|grelha|caixa gordura|fossa|pluvial|calha|canalete|boca de lobo|ralo/i.test(d) },
  { key:'cobertura',  lb:'🏠 Cobertura',          fn: d => /telha|cumeeira|rufo|telhado|fibrocimento|zinco|metalica|isopanel|madeiramento|frechal|terça|linha|pendural/i.test(d) },
  { key:'esquadria',  lb:'🪟 Esquadrias',         fn: d => /porta|janela|batente|marco|caixilho|esquadria|grade|fechadura|macaneta|trinco|puxador|dobradica|dobradiça|vidro|box|portao|basculante|veneziana/i.test(d) },
  { key:'rev_arg',    lb:'🪣 Revest. Argamassa',  fn: d => /reboco|chapisco|emboço|gesso projetado|gesso em placa|contra piso|regularizac|argamassa ac|argamassa ret|argamassa col/i.test(d) },
  { key:'granito',    lb:'🪨 Granito / Pedra',    fn: d => /granito|marmore|quartzito|pedra natural|bancada|soleira|peitoril|rodape em ped|escada em ped|marmoraria|servico granito/i.test(d) },
  { key:'rev_cer',    lb:'🟫 Revest. Cerâmico',   fn: d => /ceramica|porcelanato|revestimento|azulejo|rejunte|pastilha|pedra|travertino|ardosia|pedra miracema/i.test(d) },
  { key:'gesso',      lb:'⬜ Gesso',              fn: d => /gesso|dry.?wall|drywall|placa de gesso|perfil de gesso|massa de gesso|forro de gesso|gesseiro|servico gesso/i.test(d) },
  { key:'pintura',    lb:'🖌 Pintura',            fn: d => /tinta|massa corrida|selador|primer|textura|massa acrilica|verniz|esmalte|tinta latex|tinta acrilica|lixa|rolo|trincha/i.test(d) },
  { key:'ferramenta', lb:'🔨 Ferramentas',        fn: d => /enxada|picareta|pa |pá |marreta|martelo|colher de ped|desempenadeira|broxa|pincel|disco de corte|disco bomcorte|disco de serra|disco p.mad|serrote|arco de serra|trena|nivel de bolha|prumo|espatula|ponteiro|talhadeira|formao|furadeira|esmerilhadeira|betoneira|vibrador|compactador/i.test(d) },
  { key:'epi',        lb:'🦺 EPI / Segurança',    fn: d => /epi|capacete|bota de seg|luva de seg|oculos de prot|cinto de seg|uniforme|colete|protetor|abafador|crachá/i.test(d) },
  { key:'limpeza',    lb:'🧹 Limpeza',            fn: d => /limpeza|vassoura|rodo|pano|detergente|desinfet|inseticida|raid|balde|saco de lixo|luva de borr|esponja|sabao/i.test(d) },
  { key:'alimentacao',lb:'🍽 Alimentação',        fn: d => /alimenta|refeicao|marmita|lanche|cafe|agua mineral|pacoca|bolacha|biscoito|refrigerante|suco|quentinha/i.test(d) },
  { key:'expediente', lb:'📎 Expediente',         fn: d => /papel|caneta|impressao|toner|cartucho|clips|grampeador|fita adesiva|envelope|pasta|agenda|caderno/i.test(d) },
  { key:'locacao',    lb:'🏗 Locação de Equip.',  fn: d => /locac|locaç|aluguel|andaime|betoneira alug|compactador alug|vibrador alug|escora alug|bomba alug|grua|guindaste|caçamba|cacamba|retroescavadeira|pa carregadeira|rolo compactador|mini retro|bobcat/i.test(d) },
  { key:'tecnologia',  lb:'💻 Tecnologia / Assinaturas', fn: d => /assinatura|software|sistema|plataforma|aplicativo|app |saas|cloud|hospedagem|dominio|ia |inteligencia artificial|curso|treinamento|capacitacao|licenca de software|antivirus|office|google workspace|adobe|autocad|sketchup|chatgpt|claude|openai/i.test(d) },
  { key:'imobilizado', lb:'🖥 Imobilizado',          fn: d => /computador|notebook|monitor|impressora|scanner|tablet|celular|smartphone|tv |televisao|televisor|camera|projetor|ar.condicionado|frigobar|geladeira|mesa|cadeira|armario|estante|servidor|nobreak|roteador|switch|telefone|aparelho|maquina|equipamento escritorio/i.test(d) },
  { key:'imposto',    lb:'🧾 Impostos / Encargos', fn: d => /inss|darf|iss |fgts|irrf|imposto|encargo|contribuicao|tributo|csll|cofins|pis |simples nacional|das |gps |gfip|caged|esocial/i.test(d) },
];
let catEstoqueFiltro = null;

function getCatEstoque(desc) {
  const d = (desc||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  for (const cat of CATS_ESTOQUE) { if (cat.fn(d)) return cat.key; }
  return 'outros';
}

function getSaldoEntradaDireta(desc) {
  // Qtd total que entrou via entradas diretas para este material
  return entradasDiretas
    .filter(e => norm(e.item_desc) === norm(desc))
    .reduce((s,e) => s + Number(e.qtd), 0);
}

// Busca o material do catálogo pelo nome (match exato, código, ou nome base)
function getMaterialCatalogo(descricao) {
  const n = norm(descricao);
  // 1. Match exato normalizado
  const exato = catalogoMateriais.find(m => norm(m.nome) === n);
  if (exato) return exato;
  // 2. Match por código no início (ex: "000001 · Cimento CP-II 50kg")
  const codMatch = n.match(/^(\d{4,6})\s/);
  if (codMatch) {
    const porCodigo = catalogoMateriais.find(m => m.codigo === codMatch[1]);
    if (porCodigo) return porCodigo;
  }
  // 3. Descrição curta (1-2 palavras) que é início exato do nome no catálogo
  //    Ex: "CIMENTO" casa com "CIMENTO CPIIZ 50KG"
  const palavras = n.split(/\s+/);
  if (palavras.length <= 2 && n.length >= 5) {
    const candidatos = catalogoMateriais.filter(m => norm(m.nome).startsWith(n + ' ') || norm(m.nome) === n);
    if (candidatos.length === 1) return candidatos[0];
  }
  return null;
}

// Chave de consolidação inteligente: agrupa variações do mesmo material
function getEstoqueKeyNorm(descricao) {
  let d = norm(descricao);
  // Remove código numérico do início (ex: "000001 · ")
  d = d.replace(/^\d{4,6}\s*[·\-]?\s*/, '');
  // Remove especificações comuns que não mudam o material base
  d = d.replace(/\b(cp\s*-?\s*ii[iz]?|cp\s*-?\s*iv|cp\s*-?\s*v|50\s*kg|25\s*kg|20\s*kg|18\s*l|saco|sc|un|ml|m2|m3|m³|pct|cx|pc|rolo|galao|gl|barra|metro|kg)\b/g, '');
  // Colapsa espaços
  d = d.replace(/\s+/g, ' ').trim();
  return d;
}

// Chave de consolidação: código do catálogo se existir, senão normalização inteligente
function getEstoqueKey(descricao) {
  const mat = getMaterialCatalogo(descricao);
  return mat ? `CAT:${mat.codigo}` : `DESC:${getEstoqueKeyNorm(descricao)}`;
}

function consolidarEstoque() {
  const map = {};

  // 1. Entradas via NF — soma qtd ORIGINAL de cada item
  const estoque = notas.filter(n => n.obra === 'EDR');
  estoque.forEach(n => {
    const itens = parseItens(n);
    itens.forEach((it, idx) => {
      const key = getEstoqueKey(it.desc);
      const mat = getMaterialCatalogo(it.desc);
      // Nome padrão: usa o do catálogo se existir
      const descPadrao = mat ? mat.nome : it.desc;
      const unidadePadrao = mat ? (mat.unidade || it.unidade || 'UN') : (it.unidade || 'UN');
      if (!map[key]) map[key] = { 
        desc: descPadrao, 
        unidade: unidadePadrao, 
        credito: it.credito, 
        codigo: mat?.codigo || null,
        categoria: mat?.categoria || null,
        qtdNF: 0, qtdDireta: 0, totalValor: 0, lotes: [], temNFPendente: false 
      };
      map[key].qtdNF += Number(it.qtd);
      if (Number(it.preco) > 0) map[key].totalValor += Number(it.qtd) * Number(it.preco);
      map[key].lotes.push({ notaId: n.id, itemIdx: idx, nota: n, item: it, saldo: Number(it.qtd) });
    });
  });

  // 2. Entradas diretas (fiado / sem nota)
  entradasDiretas.forEach(e => {
    const key = getEstoqueKey(e.item_desc);
    const mat = getMaterialCatalogo(e.item_desc);
    const descPadrao = mat ? mat.nome : e.item_desc;
    if (!map[key]) map[key] = { 
      desc: descPadrao, 
      unidade: mat?.unidade || e.unidade || 'UN', 
      credito: false, 
      codigo: mat?.codigo || null,
      categoria: mat?.categoria || null,
      qtdNF: 0, qtdDireta: 0, totalValor: 0, lotes: [], temNFPendente: false 
    };
    map[key].qtdDireta += Number(e.qtd);
    if (e.preco > 0) map[key].totalValor += Number(e.qtd) * Number(e.preco);
  });

  // 2b. Ajustes de estoque (inventário inicial, contagem física, correções)
  ajustesEstoque.forEach(a => {
    const key = getEstoqueKey(a.item_desc);
    const mat = getMaterialCatalogo(a.item_desc);
    const descPadrao = mat ? mat.nome : a.item_desc;
    if (!map[key]) map[key] = {
      desc: descPadrao,
      unidade: mat?.unidade || a.unidade || 'UN',
      credito: false,
      codigo: mat?.codigo || null,
      categoria: mat?.categoria || null,
      qtdNF: 0, qtdDireta: 0, qtdAjuste: 0, totalValor: 0, lotes: [], temNFPendente: false
    };
    if (!map[key].qtdAjuste) map[key].qtdAjuste = 0;
    map[key].qtdAjuste += Number(a.qtd);
  });

  // 3. Calcular saldo real = (NF + entrada direta + ajustes) - distribuições
  // Criar mapa reverso: material -> key
  const keyByRef = new Map();
  Object.entries(map).forEach(([k, v]) => keyByRef.set(v, k));
  
  Object.values(map).forEach(m => {
    const myKey = keyByRef.get(m);
    const totalDistribuido = distribuicoes
      .filter(d => getEstoqueKey(d.item_desc) === myKey)
      .reduce((s,d) => s + Number(d.qtd), 0);
    m.saldoTotal = m.qtdNF + m.qtdDireta + (m.qtdAjuste||0) - totalDistribuido;
    m.temNFPendente = m.qtdDireta > 0;
    m.valorMedio = (m.qtdNF + m.qtdDireta) > 0 ? m.totalValor / (m.qtdNF + m.qtdDireta) : 0;
  });

  return Object.values(map)
    .filter(m => m.saldoTotal !== 0 || m.temNFPendente)
    .sort((a,b) => a.desc.localeCompare(b.desc));
}

function toggleLimparBusca() {
  const btn = document.getElementById('btn-limpar-busca');
  if (btn) btn.style.display = document.getElementById('estoque-busca').value.trim() ? 'block' : 'none';
}

function renderEstoque() {
  document.getElementById('estoque-loading').classList.add('hidden');
  const lista = document.getElementById('estoque-lista'), empty = document.getElementById('estoque-empty');
  const materiais = consolidarEstoque();
  // Renderizar sidebar de categorias
  const catsEl = document.getElementById('estoque-cats');
  if (catsEl) {
    const catsComItens = new Set(materiais.map(m => m.categoria || getCatEstoque(m.desc)));
    const contCat = {};
    materiais.forEach(m => { const k = m.categoria || getCatEstoque(m.desc); contCat[k] = (contCat[k]||0)+1; });
    const catsVisiveis = CATS_ESTOQUE.filter(cat => catsComItens.has(cat.key));
    if (catsComItens.has('outros')) catsVisiveis.push({key:'outros', lb:'📦 Outros'});
    const totalGeral = materiais.length;
    catsEl.innerHTML =
      `<button class="cat-btn ${!catEstoqueFiltro?'ativo':''}" onclick="catEstoqueFiltro=null;renderEstoque()">
        <span>🔹 Todos</span>
        <span class="cat-btn-count">${totalGeral}</span>
      </button>` +
      catsVisiveis.map(cat => `
        <button class="cat-btn ${catEstoqueFiltro===cat.key?'ativo':''}" onclick="catEstoqueFiltro='${cat.key}';renderEstoque()">
          <span style="flex:1;">${cat.lb}</span>
          <span class="cat-btn-count">${contCat[cat.key]||0}</span>
        </button>`).join('');
  }
  if (!materiais.length) { lista.innerHTML = ''; empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');
  const busca = norm(document.getElementById('estoque-busca') ? document.getElementById('estoque-busca').value : '');
  let filtrados = busca ? materiais.filter(m => norm(m.desc).includes(busca)) : materiais;
  if (catEstoqueFiltro) filtrados = filtrados.filter(m => (m.categoria || getCatEstoque(m.desc)) === catEstoqueFiltro);
  if (!filtrados.length) { lista.innerHTML = '<div class="empty">Nenhum material nesta categoria.</div>'; return; }
  lista.innerHTML = filtrados.map((m, i) => {
    const negativo = m.saldoTotal < 0;
    const corSaldo = negativo ? 'var(--vermelho)' : m.saldoTotal === 0 ? 'var(--texto3)' : 'var(--verde-hl)';
    const bordaEsq = negativo ? 'var(--vermelho)' : m.credito ? 'var(--verde3)' : 'var(--borda2)';
    return `<div style="display:flex;align-items:center;gap:12px;padding:12px 14px;background:var(--bg2);border:1px solid var(--borda);border-radius:12px;margin-bottom:8px;border-left:3px solid ${bordaEsq};">
      <div style="flex:1;">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
          <span style="font-weight:700;font-size:14px;color:var(--branco);">${m.desc}</span>
          ${m.temNFPendente ? '<span style="font-size:9px;background:var(--amar-bg);color:var(--amarelo);border:1px solid rgba(245,158,11,.3);border-radius:4px;padding:2px 6px;font-weight:700;">⏳ NF PENDENTE</span>' : ''}
          ${negativo ? '<span style="font-size:9px;background:var(--verm-bg);color:var(--vermelho);border:1px solid var(--verm-bd);border-radius:4px;padding:2px 6px;font-weight:700;">⚠ SALDO NEGATIVO</span>' : ''}
        </div>
        <div style="font-size:11px;color:var(--texto2);margin-top:4px;">
          <span style="color:${m.credito?'var(--verde-hl)':'#f87171'};font-weight:700;">${m.credito?'✓ CRÉDITO':'✗ SEM CRÉDITO'}</span>
          <span class="admin-only"> · ${fmtR(m.valorMedio)}/un · Total: ${fmtR(m.saldoTotal * m.valorMedio)}</span>
          ${m.lotes.length > 0 ? ` · ${m.lotes.length} lote${m.lotes.length!==1?'s':''}` : ''}
          ${m.qtdDireta > 0 ? ` · <span style="color:var(--amarelo);">+${m.qtdDireta} entrada direta</span>` : ''}
          ${(m.qtdAjuste||0) !== 0 ? ` · <span style="color:#60a5fa;">${m.qtdAjuste > 0 ? '+' : ''}${m.qtdAjuste} ajuste</span>` : ''}
        </div>
      </div>
      <div style="text-align:right;min-width:55px;">
        <div style="font-weight:800;font-size:20px;color:${corSaldo};">${m.saldoTotal}</div>
        <div style="font-size:10px;color:var(--texto3);">${m.unidade}</div>
      </div>
      <button class="btn-dist-item" onclick="abrirSaidaDoItem(${i})">📤</button>
    </div>`;
  }).join('');
  window._materiaisEstoque = filtrados;
  aplicarPerfil();
}

// Saída direto de um item do estoque (botão 📤 no card do material)
function abrirSaidaDoItem(idx) {
  const m = (window._materiaisEstoque||[])[idx]; if (!m) return;
  // Abre o modal genérico de saída já preenchido com o material
  abrirSaidaMaterial(m.desc, m.unidade);
}

function abrirDistribuicaoItem(notaId, itemIdx) {
  const nota = notas.find(n => n.id === notaId); if (!nota) return;
  const itens = parseItens(nota); const item = itens[itemIdx]; if (!item) return;
  const materiais = consolidarEstoque();
  const m = materiais.find(m => norm(m.desc) === norm(item.desc));
  if (m) { abrirSaidaMaterial(m.desc, m.unidade); }
}

function calcDistValor() {
  if (!distItemAtual?.material) return;
  const m = distItemAtual.material;
  const qtd = parseFloat(document.getElementById('dist-qtd').value)||0;
  const valor = qtd * m.valorMedio;
  const prev = document.getElementById('dist-valor-preview');
  if (qtd > 0) { document.getElementById('dist-valor-val').textContent = fmtR(valor); prev.style.display = 'block'; }
  else prev.style.display = 'none';
}

async function confirmarDistribuicaoItem() {
  if (!distItemAtual?.material) { showToast('ERRO: material não selecionado.'); return; }
  const m = distItemAtual.material;
  const obraId = document.getElementById('dist-obra').value;
  const obraNome = document.getElementById('dist-obra').selectedOptions[0]?.text||'';
  const qtd = parseFloat(document.getElementById('dist-qtd').value)||0;
  const obs = document.getElementById('dist-obs').value.toUpperCase();
  if (!obraId) { showToast('SELECIONE A OBRA.'); return; }
  if (qtd <= 0) { showToast('INFORME A QUANTIDADE.'); return; }
  const etapaDistVal = document.getElementById('dist-etapa')?.value || '';
  if (!etapaDistVal) { showToast('⚠ SELECIONE O CENTRO DE CUSTO (ETAPA).'); document.getElementById('dist-etapa')?.focus(); return; }
  // Permite saldo negativo (material fiado)
  if (m.saldoTotal <= 0 && !m.temNFPendente && m.qtdDireta === 0) {
    if (!confirm(`Saldo atual: ${m.saldoTotal} ${m.unidade}. Confirma saída mesmo assim? (Material fiado)`)) return;
  }
  const hoje = new Date().toISOString().split('T')[0];
  // FIFO: consumir lotes na ordem de entrada
  // Recalcular saldo real de cada lote descontando distribuições já gravadas
  let restante = qtd, totalValor = 0;
  const lotesUsados = [];
  for (const lote of m.lotes) {
    if (restante <= 0) break;
    // saldo real do lote = qtd original - já distribuído deste lote específico
    const jaDistribuido = distribuicoes
      .filter(d => d.nota_id === lote.notaId && d.item_idx === lote.itemIdx)
      .reduce((s,d) => s + Number(d.qtd), 0);
    const saldoReal = Number(lote.item.qtd) - jaDistribuido;
    if (saldoReal <= 0) continue; // lote esgotado, pular
    const usar = Math.min(restante, saldoReal);
    lotesUsados.push({ ...lote, usar, valor: usar * Number(lote.item.preco) });
    totalValor += usar * Number(lote.item.preco);
    restante -= usar;
  }
  if (lotesUsados.length === 0 || restante > 0) {
    const saldoDisp = qtd - restante;
    if (saldoDisp <= 0) { showToast(`⚠ SALDO ESGOTADO. Não há lotes disponíveis.`); return; }
  }
  const precoMedio = totalValor / qtd;
  try {
    // Salvar uma distribuição por lote (FIFO)
    for (const lote of lotesUsados) {
      const [dist] = await sbPost('distribuicoes', {
        nota_id: lote.notaId, item_desc: m.desc, item_idx: lote.itemIdx,
        obra_id: obraId, obra_nome: obraNome, qtd: lote.usar, valor: lote.valor, data: hoje,
        etapa: document.getElementById('dist-etapa')?.value || ''
      });
      distribuicoes.push({ ...dist, obra_nome: obraNome });
    }
    // Um único lançamento no financeiro da obra
    const descLanc = `${m.desc}${obs ? ' · '+obs : ''}`;
    const [lanc] = await sbPost('lancamentos', {
      obra_id: obraId, descricao: descLanc,
      qtd, preco: precoMedio, total: totalValor, data: hoje,
      etapa: document.getElementById('dist-etapa')?.value || '',
      obs: `Estoque EDR · ${lotesUsados.length} lote${lotesUsados.length!==1?'s':''}`
    });
    if (lanc) lancamentos.unshift(lanc);
    showToast(`✅ ${qtd} ${m.unidade} de ${m.desc} → ${obraNome}!`);
    fecharModal('dist'); renderEstoque(); renderDashboard(); filtrarLanc();
  } catch(e) { console.error(e); showToast('ERRO AO DISTRIBUIR.'); }
}

async function exportarEstoqueExcel() {
  const materiais = consolidarEstoque();
  if (!materiais.length) { showToast('ESTOQUE VAZIO.'); return; }

  showToast('⏳ Gerando planilha...');

  // Carregar ExcelJS se ainda não carregou
  if (!window.ExcelJS) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
      s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = 'EDR Engenharia';
  const ws = wb.addWorksheet('Estoque EDR', { properties: { defaultColWidth: 18 } });

  // Cores EDR
  const VERDE = '0A3D18';
  const VERDE_CLARO = '1A7A30';
  const BRANCO = 'FFFFFF';

  // Largura das colunas — generosa pra texto caber completo
  ws.columns = [
    { width: 7 },   // A - #
    { width: 16 },  // B - Código
    { width: 50 },  // C - Material (nome completo)
    { width: 12 },  // D - Unidade
    { width: 18 },  // E - Saldo Sistema
    { width: 18 },  // F - Contagem Real
    { width: 18 },  // G - Diferença
  ];

  // Header — fundo verde com titulo centralizado (logo: usuario adiciona manualmente)
  ws.getRow(1).height = 50;
  ws.mergeCells('A1:G1');
  const headerCell = ws.getCell('A1');
  headerCell.value = 'EDR ENGENHARIA';
  headerCell.font = { name: 'Arial', size: 22, bold: true, color: { argb: BRANCO } };
  headerCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE } };
  headerCell.alignment = { horizontal: 'center', vertical: 'middle' };
  for (let c = 2; c <= 7; c++) { ws.getRow(1).getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE } }; }

  // Subtítulo
  ws.mergeCells('A2:G2');
  const subCell = ws.getCell('A2');
  subCell.value = 'INVENTÁRIO DE ESTOQUE — CONTAGEM FÍSICA';
  subCell.font = { name: 'Arial', size: 11, bold: true, color: { argb: BRANCO } };
  subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE_CLARO } };
  subCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(2).height = 26;
  for (let c = 2; c <= 7; c++) { ws.getRow(2).getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE_CLARO } }; }

  // Info
  ws.mergeCells('A3:G3');
  const infoCell = ws.getCell('A3');
  const hoje = new Date();
  infoCell.value = `Data: ${hoje.toLocaleDateString('pt-BR')}  •  CNPJ: 49.909.440/0001-55  •  Jupi-PE`;
  infoCell.font = { name: 'Arial', size: 9, italic: true, color: { argb: '666666' } };
  infoCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(3).height = 22;

  // Linha vazia
  ws.addRow([]);

  // Agrupar por categoria
  const catMap = {};
  materiais.forEach(m => {
    const catKey = m.categoria || getCatEstoque(m.desc);
    const catObj = CATS_ESTOQUE.find(c => c.key === catKey);
    const catNome = catObj ? catObj.lb : '📦 Outros';
    if (!catMap[catNome]) catMap[catNome] = [];
    catMap[catNome].push(m);
  });

  const bordaFina = { style: 'thin', color: { argb: 'CCCCCC' } };
  const bordas = { top: bordaFina, left: bordaFina, bottom: bordaFina, right: bordaFina };

  let itemNum = 0;
  Object.keys(catMap).sort().forEach(cat => {
    // Header da categoria
    const catRow = ws.addRow([cat, '', '', '', '', '', '']);
    ws.mergeCells(catRow.number, 1, catRow.number, 7);
    catRow.getCell(1).font = { name: 'Arial', size: 11, bold: true, color: { argb: BRANCO } };
    catRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '2D6A3F' } };
    catRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    catRow.height = 26;

    // Cabeçalho colunas
    const colRow = ws.addRow(['#', 'CÓDIGO', 'MATERIAL', 'UN', 'SALDO SISTEMA', 'CONTAGEM REAL', 'DIFERENÇA']);
    colRow.eachCell(c => {
      c.font = { name: 'Arial', size: 9, bold: true, color: { argb: '333333' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E8E8E8' } };
      c.alignment = { horizontal: 'center', vertical: 'middle' };
      c.border = bordas;
    });
    colRow.height = 22;

    // Itens
    catMap[cat].sort((a,b) => a.desc.localeCompare(b.desc)).forEach(m => {
      itemNum++;
      const codigo = m.codigo || '—';
      const row = ws.addRow([itemNum, codigo, m.desc, m.unidade, m.saldoTotal, '', '']);
      row.height = 20;

      // Estilo de cada célula
      row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(1).font = { name: 'Arial', size: 9, color: { argb: '999999' } };
      row.getCell(2).font = { name: 'Arial', size: 9, color: { argb: '666666' } };
      row.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(3).font = { name: 'Arial', size: 10 };
      row.getCell(3).alignment = { vertical: 'middle', indent: 1 };
      row.getCell(4).font = { name: 'Arial', size: 9 };
      row.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(5).font = { name: 'Arial', size: 10, bold: true };
      row.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE7' } };
      row.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(6).font = { name: 'Arial', size: 10 };
      row.getCell(7).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(7).font = { name: 'Arial', size: 10 };

      // Fórmula diferença = contagem - saldo
      const r = row.number;
      row.getCell(7).value = { formula: `IF(F${r}="","",F${r}-E${r})` };

      // Bordas em todas
      row.eachCell(c => { c.border = bordas; });

      // Zebra
      if (itemNum % 2 === 0) {
        [1,2,3,4,5,7].forEach(i => {
          row.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F9F9F9' } };
        });
      }
    });

    // Linha vazia entre categorias
    ws.addRow([]);
  });

  // Rodapé
  ws.addRow([]);
  ws.addRow([]);
  const totalRow = ws.addRow(['', '', `TOTAL DE ITENS: ${materiais.length}`, '', '', '', '']);
  totalRow.getCell(3).font = { name: 'Arial', size: 10, bold: true, color: { argb: VERDE } };

  const respRow = ws.addRow(['', '', 'Responsável pela contagem: _______________________________', '', '', '', '']);
  respRow.getCell(3).font = { name: 'Arial', size: 9, color: { argb: '666666' } };

  const assinRow = ws.addRow(['', '', 'Assinatura: _______________________________  Data: ___/___/______', '', '', '', '']);
  assinRow.getCell(3).font = { name: 'Arial', size: 9, color: { argb: '666666' } };

  // Configurar impressão
  ws.pageSetup = { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
  ws.headerFooter = { oddFooter: 'EDR Engenharia — Inventário de Estoque — Página &P de &N' };

  // Gerar e baixar
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `estoque-edr-${hoje.toISOString().slice(0,10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('✅ Planilha Excel exportada!');
}

// ══════════════════════════════════════════
