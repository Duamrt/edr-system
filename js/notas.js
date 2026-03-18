// ══════════════════════════════════════════
// NOTAS
// ══════════════════════════════════════════
function renderNotas() {
  const fo = document.getElementById('filtro-obra').value, fc = document.getElementById('filtro-credito').value;
  let lista = [...notas];
  if (fo) lista = lista.filter(n => n.obra === fo);
  if (fc === 'sim') lista = lista.filter(n => n.gera_credito && n.obra !== 'EDR' && n.obra !== 'EDR_ESCRITORIO');
  if (fc === 'nao') lista = lista.filter(n => !n.gera_credito && n.obra !== 'EDR' && n.obra !== 'EDR_ESCRITORIO');
  if (fc === 'estoque') lista = lista.filter(n => n.obra === 'EDR');
  if (fc === 'escritorio') lista = lista.filter(n => n.obra === 'EDR_ESCRITORIO');
  const el = document.getElementById('notas-lista'), empty = document.getElementById('notas-empty');
  if (!lista.length) { el.innerHTML = ''; empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');
  el.innerHTML = lista.map(n => {
    const itens = parseItens(n);
    const classe = n.obra==='EDR'?'estoque':n.credito_status==='sim'?'':n.credito_status==='misto'?'misto':'sem-credito';
    return `<div class="nota-card ${classe}" onclick="abrirNota('${n.id}')" style="cursor:pointer;">
      <div class="nota-top">
        <span class="nota-fornecedor">${esc(n.fornecedor)} <span style="font-weight:400;font-size:11px;color:var(--texto3)">NF ${n.numero_nf||''}</span></span>
        <div style="display:flex;align-items:center;gap:8px;">
          <span class="nota-valor admin-only">${fmtR(n.valor_bruto)}</span>
          <span style="color:var(--texto3);font-size:16px;">›</span>
        </div>
      </div>
      <div class="nota-desc">${n.natureza||''} · ${itens.length} ITEN${itens.length!==1?'S':''} · ${n.data}${n.frete>0?' · 🚚 '+fmtR(n.frete):''}</div>
      <div class="tags">
        <span class="tag ${n.obra==='EDR'?'tag-estoque':n.obra==='EDR_ESCRITORIO'?'tag-nat':'tag-obra'}">${n.obra==='EDR'?'📦 ESTOQUE':n.obra==='EDR_ESCRITORIO'?'🏢 ESCRITÓRIO':n.obra}</span>
        <span class="tag tag-nat">${n.natureza||''}</span>
        <span class="tag ${n.credito_status==='sim'?'tag-credito':n.credito_status==='misto'?'tag-misto':'tag-semcredito'}">${n.obra==='EDR'?'AGUARD. DISTRIBUIÇÃO':n.obra==='EDR_ESCRITORIO'?'CONSUMO DIRETO':n.credito_status==='sim'?'✓ CRÉDITO':n.credito_status==='misto'?'⚡ CRÉDITO PARCIAL':'✗ SEM CRÉDITO'}</span>
      </div>
      <div class="nota-meta">${n.cnpj||'SEM CNPJ'}</div>
    </div>`;
  }).join('');
  aplicarPerfil();
}

// ══════════════════════════════════════════
// FORM NF
// ══════════════════════════════════════════
function atualizarTotalComFrete() {
  const frete = parseFloat(document.getElementById('f-frete').value)||0;
  const frRow = document.getElementById('frete-total-row');
  if (frete > 0) { document.getElementById('frete-total-val').textContent = fmtR(frete); frRow.classList.remove('hidden'); }
  else frRow.classList.add('hidden');
}

// AUTOCOMPLETE FORNECEDOR
function onFornecedorInput() {
  const val = document.getElementById('f-fornecedor').value.trim();
  const list = document.getElementById('ac-forn-list'); acFornIdx = -1;
  if (!val || val.length < 2) { list.classList.add('hidden'); cachedFornecedores = []; return; }
  const v = norm(val), map = {};
  notas.forEach(n => { if (norm(n.fornecedor).includes(v) && !map[n.fornecedor]) map[n.fornecedor] = { nome: n.fornecedor, cnpj: n.cnpj||'' }; });
  cachedFornecedores = Object.values(map).slice(0, 6);
  if (!cachedFornecedores.length) { list.classList.add('hidden'); return; }
  list.innerHTML = cachedFornecedores.map((m, i) => `<div class="autocomplete-item" data-forn-idx="${i}"><span class="ac-label">${m.nome}</span><span class="ac-forn-cnpj">${m.cnpj||'SEM CNPJ'}</span></div>`).join('');
  list.querySelectorAll('.autocomplete-item').forEach(el => { const fn = e => { e.preventDefault(); selectFornecedor(parseInt(el.dataset.fornIdx)); }; el.addEventListener('mousedown', fn); el.addEventListener('touchstart', fn, {passive:false}); });
  list.classList.remove('hidden');
}
function selectFornecedor(idx) {
  const m = cachedFornecedores[idx]; if (!m) return;
  document.getElementById('f-fornecedor').value = m.nome;
  if (m.cnpj) document.getElementById('f-cnpj').value = m.cnpj;
  document.getElementById('ac-forn-list').classList.add('hidden');
  acFornIdx = -1; document.getElementById('f-obra').focus();
  showToast('✅ FORNECEDOR PREENCHIDO!');
}

// AUTOCOMPLETE ITENS
const ITEMS_DB = [
  {palavras:['cimento','cp ii','cp iii','cp iv','cp v'],cat:'Material de construção',credito:true},
  {palavras:['areia','areia grossa','areia fina','areia media'],cat:'Material de construção',credito:true},
  {palavras:['brita','pedra','pedrisco','cascalho'],cat:'Material de construção',credito:true},
  {palavras:['tijolo','bloco','bloco ceramico','bloco concreto'],cat:'Material de construção',credito:true},
  {palavras:['ferro','vergalhao','tela soldada','arame recozido','malha pop'],cat:'Material de construção',credito:true},
  {palavras:['madeira','caibro','viga','ripa','sarrafo','compensado','mdf'],cat:'Material de construção',credito:true},
  {palavras:['cal','gesso','argamassa','reboco','chapisco','emboco'],cat:'Material de construção',credito:true},
  {palavras:['tinta','massa corrida','selador','primer','textura','massa acrilica'],cat:'Material de construção',credito:true},
  {palavras:['telha','cumeeira','rufo','calha'],cat:'Material de construção',credito:true},
  {palavras:['piso','ceramica','porcelanato','revestimento','azulejo','rejunte'],cat:'Material de construção',credito:true},
  {palavras:['porta','janela','batente','marco','caixilho','esquadria'],cat:'Material de construção',credito:true},
  {palavras:['fechadura','fechadura soprano','fechadura wc','fechadura sobrancelha','trinco','macaneta'],cat:'Material de construção',credito:true},
  {palavras:['pontalete','escore metalico'],cat:'Material de construção',credito:true},
  {palavras:['impermeabilizante','desmoldante','manta asfaltica','aditivo'],cat:'Material de construção',credito:true},
  {palavras:['parafuso','prego','bucha','chumbador','pino'],cat:'Material de construção',credito:true},
  {palavras:['concreto usinado','concreto bombeado','concretagem'],cat:'Material de construção',credito:true},
  {palavras:['laje','lajota','tavela','vigota','pre-moldado'],cat:'Material de construção',credito:true},
  {palavras:['selante','cola','silicone vedante'],cat:'Material de construção',credito:true},
  {palavras:['fio','cabo eletrico','eletroduto','conduite'],cat:'Instalação elétrica',credito:true},
  {palavras:['disjuntor','quadro eletrico','barramento','dps'],cat:'Instalação elétrica',credito:true},
  {palavras:['interruptor','tomada','espelho eletrico'],cat:'Instalação elétrica',credito:true},
  {palavras:['ducha','chuveiro','aquecedor eletrico'],cat:'Instalação elétrica',credito:true},
  {palavras:['lampada','luminaria','spot','refletor','led','bocal','pendente','plafon','painel led','downlight'],cat:'Instalação elétrica',credito:true},
  {palavras:['tubo','cano','conexao','joelho','luva hidraulica','cotovelo','registro','valvula'],cat:'Instalação hidráulica',credito:true},
  {palavras:['conexao esgoto','te esgoto','joelho esgoto','luva esgoto','cano esgoto'],cat:'Instalação hidráulica',credito:true},
  {palavras:['torneira','sifao','ralo','caixa dagua'],cat:'Instalação hidráulica',credito:true},
  {palavras:['vaso sanitario','bacia sanitaria','caixa acoplada'],cat:'Instalação hidráulica',credito:true},
  {palavras:['pia','cuba','tanque','lavatorio'],cat:'Instalação hidráulica',credito:true},
  {palavras:['mao de obra','mdo','servico de','servente','pedreiro','encanador','eletricista','pintor','carpinteiro','gesseiro','azulejista'],cat:'Serviço de mão de obra',credito:true},
  {palavras:['andaime','betoneira alugada','escora','balancim','equipamento alugado'],cat:'Equipamento alugado',credito:true},
  {palavras:['epi','capacete','bota de seguranca','luva de seguranca','oculos de protecao'],cat:'EPI / Segurança',credito:true},
  {palavras:['frete','transporte de material','entrega','carreto'],cat:'Transporte de material',credito:true},
  {palavras:['combustivel','gasolina','diesel','etanol'],cat:'Combustível',credito:false},
  {palavras:['alimentacao','refeicao','marmita','lanche','cafe','agua mineral','pacoca','bolacha','biscoito','refri'],cat:'Alimentação',credito:false},
  {palavras:['inseticida','repelente','raid','limpeza','detergente','desinfetante'],cat:'Limpeza/consumo',credito:false},
  {palavras:['ferramenta','martelo','furadeira','parafusadeira','trena','nivelador','cortag','disco de corte','espatula','desempenadeira','pa quadrada','pa redonda','broxa','pincel','serra'],cat:'Ferramentas',credito:false},
  {palavras:['escritorio','papel','caneta','impressao','xerox'],cat:'Despesas administrativas',credito:false},
  {palavras:['cadeira','mesa','movel','armario'],cat:'Mobiliário',credito:false},
];

function classificarItem(desc) {
  if (!desc || desc.length < 2) return null;
  const d = norm(desc) + ' ';
  for (const item of ITEMS_DB) {
    for (const p of item.palavras) {
      const pn = norm(p);
      if (pn.length <= 4) { if (new RegExp('(^|\\s)'+pn+'(\\s|$)').test(d.trim())) return item; }
      else { if (d.includes(pn)) return item; }
    }
  }
  return null;
}

function getItensAnteriores(val) {
  const v = norm(val), map = {};
  notas.forEach(n => { try { JSON.parse(n.itens||'[]').forEach(i => { if (norm(i.desc).includes(v) && !map[i.desc]) map[i.desc] = { desc: i.desc, credito: i.credito, cat: i.cat||'', unidade: i.unidade||'' }; }); } catch(e) {} });
  return Object.values(map).slice(0, 4);
}

function onDescInput() {
  const val = document.getElementById('i-desc').value;
  const badge = document.getElementById('i-credito-badge'), mw = document.getElementById('i-manual-wrap');
  const res = classificarItem(val); currentCredito = res ? res.credito : null; acSelectedIdx = -1;
  if (!val || val.length < 2) { badge.className = 'credito-badge duvida'; badge.textContent = 'Digite a descrição para classificação automática'; mw.classList.add('hidden'); }
  else if (res) { mw.classList.add('hidden'); badge.className = `credito-badge ${res.credito?'sim':'nao'}`; badge.textContent = res.credito ? `✓ GERA CRÉDITO IBS/CBS — ${res.cat}` : `✗ NÃO GERA CRÉDITO — ${res.cat}`; }
  else { badge.className = 'credito-badge duvida'; badge.textContent = '❓ NÃO RECONHECIDO — classifique abaixo'; mw.classList.remove('hidden'); }
  showAutocomplete(val);
}

function classificarManual(credito) {
  currentCredito = credito;
  document.getElementById('i-credito-badge').className = `credito-badge ${credito?'sim':'nao'}`;
  document.getElementById('i-credito-badge').textContent = credito ? '✓ CLASSIFICADO MANUALMENTE — GERA CRÉDITO' : '✗ CLASSIFICADO MANUALMENTE — SEM CRÉDITO';
  document.getElementById('i-manual-wrap').classList.add('hidden');
}

function showAutocomplete(val) {
  const list = document.getElementById('ac-list');
  if (!val || val.length < 2) { list.classList.add('hidden'); cachedItens = []; return; }
  const v = norm(val), matches = [], seen = new Set();
  catalogoMateriais.filter(m => norm(m.nome).includes(v) || m.codigo.includes(v)).slice(0,5).forEach(m => {
    if (!seen.has(m.nome)) {
      seen.add(m.nome);
      const res = classificarItem(m.nome);
      matches.push({ label: m.nome, credito: res?.credito ?? null, cat: res?.cat||m.categoria||'', unidade: m.unidade||'', anterior: false, codigo: m.codigo, fromCatalogo: true });
    }
  });
  const txt = val.trim().toUpperCase();
  matches.push({ label: txt, credito: null, cat: '', unidade: '', anterior: false, codigo: null, cadastroRapido: true });
  cachedItens = matches;
  list.innerHTML = matches.map((m, i) => m.cadastroRapido
    ? `<div class="autocomplete-item" data-ac-idx="${i}" style="border-top:1px solid rgba(255,255,255,0.1);margin-top:2px;">
        <span style="color:var(--verde-hl);font-weight:700;font-size:12px;">+ CADASTRAR "${m.label}" NO CATÁLOGO</span>
        <span style="font-size:10px;color:var(--texto3);">e usar aqui</span>
       </div>`
    : `<div class="autocomplete-item" data-ac-idx="${i}">
        <span class="ac-label">${m.fromCatalogo?`<span class="ac-codigo">${m.codigo}</span>`:''}${m.label}</span>
        <span class="ac-credito ${m.credito===true?'ac-sim':m.credito===false?'ac-nao':''}">${m.credito===true?'CREDITO':m.credito===false?'SEM CREDITO':'...'}</span>
       </div>`
  ).join('');
  list.querySelectorAll('.autocomplete-item').forEach(el => { const fn = e => { e.preventDefault(); selectAC(parseInt(el.dataset.acIdx)); }; el.addEventListener('mousedown', fn); el.addEventListener('touchstart', fn, {passive:false}); });
  list.classList.remove('hidden');
}

function selectAC(idx) {
  const m = cachedItens[idx]; if (!m) return;
  if (m.cadastroRapido) { cadastroRapidoMaterial(m.label, 'nf'); return; }
  document.getElementById('i-desc').value = m.label;
  document.getElementById('ac-list').classList.add('hidden');
  acSelectedIdx = -1; currentCredito = m.credito;
  const badge = document.getElementById('i-credito-badge');
  badge.className = `credito-badge ${m.credito?'sim':'nao'}`;
  badge.textContent = m.credito ? `GERA CREDITO IBS/CBS - ${m.cat}` : `NAO GERA CREDITO - ${m.cat}`;
  document.getElementById('i-manual-wrap').classList.add('hidden');
  if (m.unidade) document.getElementById('i-unidade').value = m.unidade;
  document.getElementById('i-qtd').focus();
}

// ASSISTENTE TRIBUTÁRIO OFFLINE
const REGRAS_TRIBUTARIAS = [
  {palavras:['cimento','cal','gesso','argamassa','reboco','chapisco','massa corrida','textura','tinta','primer','selador'],credito:true,cat:'Material de construção',motivo:'Material incorporado à obra — gera crédito IBS/CBS (LC 214/2025)'},
  {palavras:['areia','brita','pedra','pedrisco','cascalho','saibro'],credito:true,cat:'Material de construção',motivo:'Insumo incorporado à obra — gera crédito IBS/CBS (LC 214/2025)'},
  {palavras:['tijolo','bloco','ceramica','porcelanato','piso','azulejo','revestimento','rejunte'],credito:true,cat:'Material de construção',motivo:'Material incorporado à obra — gera crédito IBS/CBS (LC 214/2025)'},
  {palavras:['ferro','vergalhao','tela soldada','arame','pontalete','malha pop'],credito:true,cat:'Material de construção',motivo:'Material estrutural incorporado à obra — gera crédito IBS/CBS (LC 214/2025)'},
  {palavras:['madeira','caibro','viga','ripa','sarrafo','compensado','mdf'],credito:true,cat:'Material de construção',motivo:'Material incorporado à obra — gera crédito IBS/CBS (LC 214/2025)'},
  {palavras:['telha','cumeeira','rufo','calha'],credito:true,cat:'Material de construção',motivo:'Componente incorporado à edificação — gera crédito IBS/CBS (LC 214/2025)'},
  {palavras:['porta','janela','batente','marco','caixilho','esquadria','vidro'],credito:true,cat:'Material de construção',motivo:'Elemento incorporado à obra — gera crédito IBS/CBS (LC 214/2025)'},
  {palavras:['fechadura','macaneta','trinco','puxador'],credito:true,cat:'Material de construção',motivo:'Componente incorporado à obra — gera crédito IBS/CBS (LC 214/2025)'},
  {palavras:['parafuso','prego','bucha','chumbador'],credito:true,cat:'Material de construção',motivo:'Insumo incorporado à obra — gera crédito IBS/CBS (LC 214/2025)'},
  {palavras:['laje','lajota','tavela','vigota','concreto'],credito:true,cat:'Material de construção',motivo:'Estrutura da obra — gera crédito IBS/CBS (LC 214/2025)'},
  {palavras:['impermeabilizante','manta asfaltica','aditivo'],credito:true,cat:'Material de construção',motivo:'Insumo técnico incorporado — gera crédito IBS/CBS (LC 214/2025)'},
  {palavras:['fio','cabo','eletroduto','conduite'],credito:true,cat:'Instalação elétrica',motivo:'Material elétrico incorporado — gera crédito IBS/CBS (LC 214/2025)'},
  {palavras:['disjuntor','quadro eletrico','barramento'],credito:true,cat:'Instalação elétrica',motivo:'Equipamento elétrico incorporado — gera crédito IBS/CBS (LC 214/2025)'},
  {palavras:['interruptor','tomada','espelho eletrico'],credito:true,cat:'Instalação elétrica',motivo:'Componente elétrico incorporado — gera crédito IBS/CBS (LC 214/2025)'},
  {palavras:['lampada','luminaria','led','painel led','downlight','plafon'],credito:true,cat:'Instalação elétrica',motivo:'Luminária incorporada — gera crédito IBS/CBS (LC 214/2025)'},
  {palavras:['ducha','chuveiro','aquecedor'],credito:true,cat:'Instalação elétrica',motivo:'Equipamento incorporado — gera crédito IBS/CBS (LC 214/2025)'},
  {palavras:['tubo','cano','conexao','joelho','luva','cotovelo','registro','valvula','esgoto'],credito:true,cat:'Instalação hidráulica',motivo:'Material hidráulico incorporado — gera crédito IBS/CBS (LC 214/2025)'},
  {palavras:['torneira','sifao','ralo','caixa dagua'],credito:true,cat:'Instalação hidráulica',motivo:'Componente hidráulico incorporado — gera crédito IBS/CBS (LC 214/2025)'},
  {palavras:['vaso sanitario','bacia sanitaria','mictorio'],credito:true,cat:'Instalação hidráulica',motivo:'Louça sanitária incorporada — gera crédito IBS/CBS (LC 214/2025)'},
  {palavras:['pia','cuba','tanque','lavatorio'],credito:true,cat:'Instalação hidráulica',motivo:'Equipamento sanitário incorporado — gera crédito IBS/CBS (LC 214/2025)'},
  {palavras:['mao de obra','mdo','servico de','pedreiro','encanador','eletricista','pintor','gesseiro','servente'],credito:true,cat:'Serviço de mão de obra',motivo:'Serviço aplicado na obra — gera crédito IBS/CBS (LC 214/2025)'},
  {palavras:['andaime','betoneira alugada','locacao de'],credito:true,cat:'Equipamento alugado',motivo:'Aluguel para obra — gera crédito IBS/CBS (LC 214/2025)'},
  {palavras:['epi','capacete','bota de seguranca','cinto de seguranca'],credito:true,cat:'EPI / Segurança',motivo:'EPI e segurança do trabalho — gera crédito IBS/CBS (LC 214/2025)'},
  {palavras:['frete','transporte de material','carreto'],credito:true,cat:'Transporte de material',motivo:'Frete de insumos para obra — gera crédito IBS/CBS (LC 214/2025)'},
  {palavras:['combustivel','gasolina','diesel','etanol'],credito:false,cat:'Combustível',motivo:'Combustível não gera crédito IBS/CBS para construtoras'},
  {palavras:['alimentacao','refeicao','marmita','lanche','cafe','agua mineral','pacoca','bolacha','biscoito'],credito:false,cat:'Alimentação',motivo:'Despesa com alimentação não gera crédito IBS/CBS'},
  {palavras:['limpeza','inseticida','detergente','desinfetante','raid'],credito:false,cat:'Limpeza/consumo',motivo:'Material de limpeza não gera crédito IBS/CBS'},
  {palavras:['ferramenta','martelo','furadeira','nivelador','disco de corte','espatula','pa quadrada','pa redonda','broxa','pincel','serra'],credito:false,cat:'Ferramentas',motivo:'Ferramenta de uso próprio não gera crédito IBS/CBS'},
  {palavras:['escritorio','papel','caneta','impressao','toner'],credito:false,cat:'Despesas administrativas',motivo:'Despesas administrativas não geram crédito IBS/CBS'},
  {palavras:['cadeira','mesa','movel','armario'],credito:false,cat:'Mobiliário',motivo:'Mobiliário de escritório não gera crédito IBS/CBS'},
];

function abrirAssistente() {
  document.getElementById('ai-input').value = document.getElementById('i-desc').value;
  ['ai-response','ai-actions','ai-loading'].forEach(id => document.getElementById(id).classList.add('hidden'));
  document.getElementById('modal-ai').classList.remove('hidden');
  setTimeout(() => document.getElementById('ai-input').focus(), 100);
}
function consultarAssistente() {
  const item = document.getElementById('ai-input').value.trim(); if (!item) { showToast('INFORME O ITEM.'); return; }
  document.getElementById('ai-loading').classList.remove('hidden');
  ['ai-response','ai-actions'].forEach(id => document.getElementById(id).classList.add('hidden'));
  document.getElementById('btn-ai-consultar').disabled = true;
  setTimeout(() => {
    const v = norm(item); let resultado = null;
    for (const r of REGRAS_TRIBUTARIAS) { for (const p of r.palavras) { if (v.includes(norm(p)) || norm(p).includes(v)) { resultado = r; break; } } if (resultado) break; }
    let resposta;
    if (resultado) {
      resposta = resultado.credito ? `✅ GERA CRÉDITO IBS/CBS\n\n${resultado.motivo}\n\nCategoria: ${resultado.cat}` : `❌ NÃO GERA CRÉDITO IBS/CBS\n\n${resultado.motivo}\n\nCategoria: ${resultado.cat}`;
    } else {
      const ehFerramenta = /slim|cortad|lixad|furader|serr|esmer|polid|vassoura|rodo|espatu|nivelad|disco/.test(v);
      resposta = ehFerramenta ? `❌ PROVAVELMENTE NÃO GERA CRÉDITO\n\nParece ferramenta ou equipamento de uso próprio.` : `⚠️ ITEM NÃO IDENTIFICADO\n\nNão encontrei "${item}" na base.\n\nRegra geral (LC 214/2025):\n✓ GERA: materiais incorporados à obra\n✗ NÃO GERA: ferramentas, alimentação, limpeza, administrativo`;
    }
    document.getElementById('ai-response').textContent = resposta;
    document.getElementById('ai-response').classList.remove('hidden');
    document.getElementById('ai-actions').classList.remove('hidden');
    document.getElementById('ai-loading').classList.add('hidden');
    document.getElementById('btn-ai-consultar').disabled = false;
  }, 350);
}
function aplicarAI(credito) { const v = document.getElementById('ai-input').value; if (v) document.getElementById('i-desc').value = v.toUpperCase(); classificarManual(credito); fecharModal('ai'); }

// ITENS DO FORM
function calcItemTotal() {
  const q = parseFloat(document.getElementById('i-qtd').value)||0;
  const p = parseFloat(document.getElementById('i-preco').value)||0;
  const d = parseFloat(document.getElementById('i-desconto').value)||0;
  document.getElementById('i-total').value = Math.max(0, q*p-d).toFixed(2);
  const precoEl = document.getElementById('i-preco');
  if (p <= 0 && precoEl.value !== '') {
    precoEl.style.borderColor = 'var(--vermelho)';
    precoEl.style.boxShadow = '0 0 0 2px var(--verm-bg)';
  } else {
    precoEl.style.borderColor = '';
    precoEl.style.boxShadow = '';
  }
}
function adicionarItem() {
  const desc = document.getElementById('i-desc').value.trim().toUpperCase();
  const qtd = parseFloat(document.getElementById('i-qtd').value)||1;
  const unidade = document.getElementById('i-unidade').value.trim().toUpperCase();
  const preco = parseFloat(document.getElementById('i-preco').value)||0;
  const desconto = parseFloat(document.getElementById('i-desconto').value)||0;
  const total = Math.max(0, qtd*preco-desconto);
  const imposto = parseFloat(document.getElementById('i-imposto').value)||0;
  if (!desc) { showToast('⚠ INFORME A DESCRIÇÃO DO ITEM.'); document.getElementById('i-desc').focus(); return; }
  if (!preco || preco <= 0) { showToast('⚠ VALOR UNITÁRIO OBRIGATÓRIO — não é permitido lançar item com valor zero.'); document.getElementById('i-preco').focus(); return; }
  if (currentCredito === null) { showToast('CLASSIFIQUE O ITEM ANTES DE ADICIONAR.'); document.getElementById('i-desc').focus(); return; }
  const res = classificarItem(desc);
  itensForm.push({ desc, qtd, unidade, preco, total, imposto, credito: currentCredito, cat: res?.cat||'Manual' });
  renderItensForm();
  ['i-desc','i-qtd','i-unidade','i-preco','i-desconto','i-total','i-imposto'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('i-credito-badge').className = 'credito-badge duvida';
  document.getElementById('i-credito-badge').textContent = 'Digite a descrição para classificação automática';
  document.getElementById('i-manual-wrap').classList.add('hidden');
  currentCredito = null; acSelectedIdx = -1; document.getElementById('i-desc').focus();
}
function removerItem(idx) { itensForm.splice(idx, 1); renderItensForm(); }
function renderItensForm() {
  const lista = document.getElementById('itens-lista'), totalRow = document.getElementById('item-total-row');
  if (!itensForm.length) { lista.innerHTML = ''; totalRow.classList.add('hidden'); return; }
  totalRow.classList.remove('hidden');
  document.getElementById('item-total-val').textContent = fmtR(itensForm.reduce((s,i) => s+i.total, 0));
  lista.innerHTML = itensForm.map((item, idx) => `<div class="item-row"><div class="item-row-info"><div class="item-row-desc">${esc(item.desc)}</div><div class="item-row-meta">${Number(item.qtd)%1===0?item.qtd:Number(item.qtd).toFixed(3)} ${esc(item.unidade)} · ${fmtR(item.preco)}/UN · <span style="color:${item.credito?'#15803d':'#dc2626'};font-weight:700;">${item.credito?'✓ CRÉDITO':'✗ SEM CRÉDITO'}</span></div></div><div class="item-row-val">${fmtR(item.total)}</div><button class="item-row-del" onclick="removerItem(${idx})">🗑</button></div>`).join('');
}

// SALVAR NOTA
// ══════════════════════════════════════════
// AUTO-CADASTRO DE MATERIAIS NO CATÁLOGO
// ══════════════════════════════════════════
async function autocadastrarMateriais(itens) {
  const novos = [];
  for (const it of itens) {
    const nomeNorm = norm(it.desc);
    if (!nomeNorm) continue;
    // Verificar se já existe no catálogo
    const existe = catalogoMateriais.find(m => norm(m.nome) === nomeNorm);
    if (existe) continue;
    // Gerar próximo código
    const proxNum = catalogoMateriais.length > 0
      ? Math.max(...catalogoMateriais.map(m => parseInt(m.codigo)||0)) + 1
      : 1;
    const codigo = String(proxNum).padStart(6, '0');
    const categoria = getCatEstoque(it.desc);
    const unidade = it.unidade || 'UN';
    try {
      const [saved] = await sbPost('materiais', {
        codigo,
        nome: it.desc.toUpperCase().trim(),
        unidade,
        categoria,
        auto: true  // flag para tag AUTO no C.Custo
      });
      if (saved) {
        catalogoMateriais.push(saved);
        catalogoMateriais.sort((a,b) => a.codigo.localeCompare(b.codigo));
        novos.push(saved.nome);
      }
    } catch(e) { /* silencioso — não bloqueia o lançamento */ }
  }
  return novos;
}

async function salvarNota() {
  const numero = document.getElementById('f-numero').value.trim();
  const fornecedor = document.getElementById('f-fornecedor').value.trim().toUpperCase();
  const emissao = document.getElementById('f-emissao').value;
  if (!fornecedor || !emissao || !numero) { showToast('PREENCHA FORNECEDOR, Nº DA NOTA E DATA.'); return; }
  if (!itensForm.length) { showToast('ADICIONE PELO MENOS UM ITEM.'); return; }
  const cnpjVal = document.getElementById('f-cnpj').value.trim();
  if (!cnpjVal) {
    const prosseguir = confirm('⚠ CNPJ não informado.\n\nSem CNPJ o lançamento fica incompleto para fins fiscais.\n\nDeseja salvar mesmo assim?');
    if (!prosseguir) { document.getElementById('f-cnpj').focus(); return; }
  }

  // ── VERIFICAÇÃO DE DUPLICIDADE ────────────────────────────
  const nfDup = notas.find(n =>
    n.numero_nf && n.numero_nf.toUpperCase() === numero.toUpperCase() &&
    norm(n.fornecedor) === norm(fornecedor)
  );
  if (nfDup) {
    const dataLanc = fmtData(nfDup.data);
    const confirmar = confirm(
      `⚠ NOTA DUPLICADA DETECTADA!\n\nA NF Nº ${numero} do fornecedor ${fornecedor} já foi lançada em ${dataLanc}.\n\nSalvar mesmo assim causará duplicidade no estoque.\n\nClique CANCELAR para revisar ou OK apenas se tiver certeza de que são notas diferentes.`
    );
    if (!confirmar) return;
  }
  // ─────────────────────────────────────────────────────────
  const btn = document.getElementById('btn-salvar'); btn.disabled = true; btn.textContent = 'SALVANDO...';
  const subtotal = itensForm.reduce((s,i) => s+i.total, 0);
  const frete = parseFloat(document.getElementById('f-frete').value)||0;
  const totalBruto = subtotal + frete;
  const totalImposto = itensForm.reduce((s,i) => s+i.imposto, 0);
  const temCredito = itensForm.some(i => i.credito) || frete > 0;
  const csSimples = itensForm.length === 0 ? 'misto' : itensForm.every(i => i.credito) ? 'sim' : itensForm.some(i => i.credito) || frete > 0 ? 'misto' : 'nao';
  try {
    const destino = document.getElementById('f-obra').value;
    const payload = { data: emissao, data_recebimento: document.getElementById('f-recebimento').value||emissao, natureza: document.getElementById('f-natureza').value, numero_nf: numero.toUpperCase(), fornecedor, cnpj: document.getElementById('f-cnpj').value, obra: destino, valor_bruto: totalBruto, frete, imposto: totalImposto, gera_credito: temCredito, credito_status: csSimples, itens: JSON.stringify(itensForm), obs: document.getElementById('f-obs').value.toUpperCase() };
    const [saved] = await sbPost('notas_fiscais', payload);
    const notaSalva = { ...saved, valor_bruto: totalBruto, frete };
    notas.unshift(notaSalva);

    // Auto-cadastrar materiais novos no C.Custo
    const novosMatsCat = await autocadastrarMateriais(itensForm);
    if (novosMatsCat.length > 0) {
      console.log(`[EDR] Auto-cadastrado(s) no C.Custo: ${novosMatsCat.join(', ')}`);
    }

    // Baixa automática para itens de escritório (limpeza/alimentação/expediente)
    if (destino === 'EDR') {
      const CATS_ESCRITORIO = ['limpeza','alimentacao','expediente'];
      const itensEscritorio = itensForm.filter(it => CATS_ESCRITORIO.includes(getCatEstoque(it.desc)));
      if (itensEscritorio.length > 0) {
        // Buscar obra EDR-ESCRITORIO
        const obraEsc = obras.find(o => o.nome && o.nome.toUpperCase().includes('ESCRIT'));
        if (obraEsc) {
          const hoje = hojeISO();
          for (const [idx, it] of itensEscritorio.entries()) {
            const itemIdx = itensForm.indexOf(it);
            // Distribuição automática
            const [dist] = await sbPost('distribuicoes', {
              nota_id: saved.id, item_desc: it.desc, item_idx: itemIdx,
              obra_id: obraEsc.id, obra_nome: obraEsc.nome,
              qtd: it.qtd, valor: it.total, data: hoje
            });
            if (dist) distribuicoes.push({ ...dist, obra_nome: obraEsc.nome });
            // Lançamento financeiro automático no escritório
            const [lanc] = await sbPost('lancamentos', {
              obra_id: obraEsc.id, descricao: it.desc,
              qtd: it.qtd, preco: it.preco, total: it.total,
              data: hoje, obs: `NF ${numero} · ${fornecedor} · Baixa automática`
            });
            if (lanc) lancamentos.unshift(lanc);
          }
          const nomes = itensEscritorio.map(i => i.desc).join(', ');
          showToast(`✅ NF LANÇADA! ${itensEscritorio.length} item(ns) baixado(s) automaticamente → ${obraEsc.nome}`);
        } else {
          showToast('✅ NOTA LANÇADA! ⚠ Crie a obra ESCRITÓRIO para baixa automática.');
        }
      } else {
        showToast('✅ NOTA FISCAL LANÇADA!');
      }
    } else {
      showToast('✅ NOTA FISCAL LANÇADA!');
    }
    resetForm(); renderDashboard(); renderEstoque(); renderNotas(); setView('estoque');
  } catch(e) { console.error(e); if (e.message.includes('does not exist')) { showToast('⚠ EXECUTE O SQL NA ABA SETUP.'); setView('setup'); } else showToast('ERRO AO SALVAR.'); }
  btn.disabled = false; btn.textContent = '💾 SALVAR NOTA FISCAL   Ctrl+S';
}

function onDestinoChange() {
  const val = document.getElementById('f-obra').value;
  const aviso = document.getElementById('aviso-escritorio');
  if (aviso) aviso.classList.toggle('hidden', val !== 'EDR_ESCRITORIO');
}

function resetForm() {
  itensForm = []; currentCredito = null; renderItensForm();
  ['f-numero','f-fornecedor','f-cnpj','f-obs','f-frete'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('f-obra').value = 'EDR';
  document.getElementById('frete-total-row').classList.add('hidden');
  setToday();
}

// ══════════════════════════════════════════
