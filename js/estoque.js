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

  // 3. Calcular saldo real = (NF + entrada direta) - distribuições
  // Criar mapa reverso: material -> key
  const keyByRef = new Map();
  Object.entries(map).forEach(([k, v]) => keyByRef.set(v, k));
  
  Object.values(map).forEach(m => {
    const myKey = keyByRef.get(m);
    const totalDistribuido = distribuicoes
      .filter(d => getEstoqueKey(d.item_desc) === myKey)
      .reduce((s,d) => s + Number(d.qtd), 0);
    m.saldoTotal = m.qtdNF + m.qtdDireta - totalDistribuido;
    m.temNFPendente = m.qtdDireta > 0;
    m.valorMedio = (m.qtdNF + m.qtdDireta) > 0 ? m.totalValor / (m.qtdNF + m.qtdDireta) : 0;
  });

  return Object.values(map)
    .filter(m => m.saldoTotal !== 0 || m.temNFPendente)
    .sort((a,b) => a.desc.localeCompare(b.desc));
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
        </div>
      </div>
      <div style="text-align:right;min-width:55px;">
        <div style="font-weight:800;font-size:20px;color:${corSaldo};">${m.saldoTotal}</div>
        <div style="font-size:10px;color:var(--texto3);">${m.unidade}</div>
      </div>
      <button class="btn-dist-item" onclick="abrirSaidaMaterial(${i})">📤</button>
    </div>`;
  }).join('');
  window._materiaisEstoque = filtrados;
  aplicarPerfil();
}

function abrirSaidaMaterial(idx) {
  const m = (window._materiaisEstoque||[])[idx]; if (!m) return;
  distItemAtual = { material: m };
  document.getElementById('modal-nota-info').innerHTML =
    `<strong>${m.desc}</strong><br>Saldo: <strong style="color:var(--roxo)">${m.saldoTotal} ${m.unidade}</strong> em ${m.lotes.length} lote${m.lotes.length!==1?'s':''}`;
  const saldoColor = m.saldoTotal < 0 ? 'color:var(--vermelho)' : 'color:var(--verde-hl)';
  document.getElementById('dist-saldo-info').innerHTML = `Saldo atual: <strong style="${saldoColor}">${m.saldoTotal} ${m.unidade}</strong>${m.saldoTotal < 0 ? ' ⚠ negativo' : ''}`;
  document.getElementById('dist-qtd').value = '';
  document.getElementById('dist-qtd').max = m.saldoTotal;
  document.getElementById('dist-obs').value = '';
  document.getElementById('dist-valor-preview').style.display = 'none';
  const hist = distribuicoes.filter(d => norm(d.item_desc) === norm(m.desc));
  const histEl = document.getElementById('dist-historico');
  if (hist.length) {
    document.getElementById('dist-historico-lista').innerHTML = hist.slice(0,5).map(d =>
      `<div class="dist-historico-row"><span>${d.obra_nome}</span><span>${d.qtd} ${m.unidade} · ${fmtR(d.valor)}</span></div>`).join('');
    histEl.classList.remove('hidden');
  } else histEl.classList.add('hidden');
  const selDistEtapa = document.getElementById('dist-etapa');
  if (selDistEtapa) selDistEtapa.innerHTML = etapaSelectOpts();
  document.getElementById('modal-dist').classList.remove('hidden');
}

function abrirDistribuicaoItem(notaId, itemIdx) {
  const nota = notas.find(n => n.id === notaId); if (!nota) return;
  const itens = parseItens(nota); const item = itens[itemIdx]; if (!item) return;
  const materiais = consolidarEstoque();
  const idx = materiais.findIndex(m => norm(m.desc) === norm(item.desc));
  if (idx >= 0) { window._materiaisEstoque = materiais; abrirSaidaMaterial(idx); }
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

// ══════════════════════════════════════════
