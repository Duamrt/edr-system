// ══════════════════════════════════════════
// CATÁLOGO DE MATERIAIS
// ══════════════════════════════════════════
let filtroAuto = false;
let _editandoMaterialId = null; // null = novo, id = editando
function filtrarSoAuto() {
  filtroAuto = !filtroAuto;
  renderCatalogo();
}

function renderCatalogo() {
  // Popular filtro de categorias a partir do ETAPAS (fonte única)
  const selCatFiltro = document.getElementById('catalogo-cat-filtro');
  if (selCatFiltro && selCatFiltro.options.length <= 1 && typeof ETAPAS !== 'undefined') {
    selCatFiltro.innerHTML = '<option value="">📂 Todos centros de custo</option>' + ETAPAS.map(e => `<option value="${e.key}">${e.lb}</option>`).join('');
  }
  const busca = norm(document.getElementById('catalogo-busca')?.value || '');
  const catFiltro = document.getElementById('catalogo-cat-filtro')?.value || '';
  let lista = [...catalogoMateriais];
  if (busca) lista = lista.filter(m => norm(m.nome).includes(busca) || (m.codigo && m.codigo.includes(busca)));
  if (catFiltro) lista = lista.filter(m => (m.categoria||'outros') === catFiltro);
  if (filtroAuto) lista = lista.filter(m => m.auto === true || m.auto === 'true');
  const el = document.getElementById('catalogo-lista');
  const stats = document.getElementById('catalogo-stats');
  const autoCount = catalogoMateriais.filter(m => m.auto === true || m.auto === 'true').length;
  if (stats) stats.innerHTML = `${lista.length} material(is) cadastrado(s)${autoCount > 0 && usuarioAtual?.perfil==='admin' ? ` &nbsp;<span style="background:rgba(245,158,11,0.12);color:#fbbf24;border:1px solid rgba(245,158,11,0.3);border-radius:4px;padding:1px 7px;font-size:10px;font-family:'JetBrains Mono',monospace;cursor:pointer;" onclick="filtrarSoAuto()" title="Ver apenas pendentes de revisão">⚠ ${autoCount} pendente${autoCount>1?'s':''} AUTO</span>` : ''}`;
  if (!lista.length) { el.innerHTML = '<div class="empty">Nenhum material encontrado. Clique em "+ Novo Material" para cadastrar.</div>'; return; }
  // Gera CATS_OPTS a partir de ETAPAS (fonte única de verdade)
  const CATS_OPTS = typeof ETAPAS !== 'undefined'
    ? ETAPAS.map(e => [e.key, e.lb])
    : [['36_outros','📦 36 · Não classificado']];
  el.innerHTML = lista.map(m => {
    const isAuto = m.auto === true || m.auto === 'true';
    const catSelect = CATS_OPTS.map(([k,lb]) => `<option value="${k}" ${m.categoria===k?'selected':''}>${lb}</option>`).join('');
    return `
    <div class="catalogo-item" style="${isAuto ? 'border-color:rgba(245,158,11,0.35);' : ''}">
      <span class="catalogo-codigo">${m.codigo || "S/COD"}</span>
      ${isAuto ? `<span style="font-size:9px;font-weight:800;background:rgba(245,158,11,0.12);color:#fbbf24;border:1px solid rgba(245,158,11,0.3);border-radius:4px;padding:1px 5px;font-family:'JetBrains Mono',monospace;white-space:nowrap;">AUTO</span>` : ''}
      <span class="catalogo-nome">${esc(m.nome)}</span>
      <span class="catalogo-un">${m.unidade||'UN'}</span>
      ${usuarioAtual?.perfil==='admin' ? `
        <select onchange="editarCategoriaMaterial('${m.id}',this.value,this)" style="background:var(--bg3);border:1px solid ${isAuto?'rgba(245,158,11,0.3)':'var(--borda2)'};border-radius:6px;padding:3px 6px;color:${isAuto?'#fbbf24':'var(--branco)'};font-size:10px;font-family:inherit;cursor:pointer;" title="Editar categoria">
          <option value="">— cat —</option>${catSelect}
        </select>
        ${isAuto ? `<button onclick="confirmarAutoMaterial('${m.id}')" style="background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.15);color:var(--verde-hl);border-radius:6px;padding:3px 8px;font-size:9px;font-family:'Rajdhani',sans-serif;font-weight:700;cursor:pointer;white-space:nowrap;" title="Confirmar revisão">✓ OK</button>` : ''}
        <button onclick="duplicarMaterial('${m.id}')" style="background:none;border:none;color:var(--texto3);cursor:pointer;font-size:14px;padding:4px;" title="Duplicar material">📋</button>
        <button onclick="editarMaterial('${m.id}')" style="background:none;border:none;color:var(--texto3);cursor:pointer;font-size:14px;padding:4px;" title="Editar material">✏️</button>
        <button onclick="excluirMaterial('${m.id}')" style="background:none;border:none;color:var(--texto3);cursor:pointer;font-size:14px;padding:4px;" title="Excluir">🗑</button>
      ` : m.categoria ? `<span class="catalogo-cat">${m.categoria}</span>` : ''}
    </div>`;
  }).join('');
}

// ========== CADASTRO RAPIDO ==========
let _crOrigem = null;
function cadastroRapidoMaterial(nomeDigitado, origem) {
  _crOrigem = origem;
  document.querySelectorAll('.autocomplete-list').forEach(l => l.classList.add('hidden'));
  let modal = document.getElementById('modal-cadastro-rapido');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modal-cadastro-rapido';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.75);backdrop-filter:blur(6px);';
    modal.innerHTML = `
      <div style="background:var(--bg2);border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:24px;width:min(420px,94vw);box-shadow:0 20px 60px rgba(0,0,0,.6);">
        <div style="font-family:'Rajdhani',sans-serif;font-size:13px;font-weight:700;letter-spacing:2px;color:var(--verde-hl);margin-bottom:4px;">+ CADASTRAR NOVO MATERIAL</div>
        <div style="font-size:11px;color:var(--texto3);margin-bottom:16px;">Item não encontrado no catálogo. Confirme que não é um item já cadastrado e preencha abaixo.</div>
        <div id="cr-similares" style="display:none;margin-bottom:12px;border:1px solid rgba(251,191,36,0.3);border-radius:8px;padding:10px 12px;background:rgba(251,191,36,0.06);">
          <div style="font-size:10px;font-weight:700;letter-spacing:1px;color:#fbbf24;font-family:'Rajdhani',sans-serif;margin-bottom:6px;">⚠ ITENS PARECIDOS JA CADASTRADOS — é realmente um item novo?</div>
          <div id="cr-similares-lista"></div>
          <div style="margin-top:8px;font-size:10px;color:var(--texto3);">Clique em um item acima para usá-lo. Ou continue para cadastrar novo.</div>
        </div>
        <div style="margin-bottom:12px;">
          <label style="font-size:10px;letter-spacing:1px;color:var(--texto3);font-family:'Rajdhani',sans-serif;">NOME DO MATERIAL *</label>
          <input id="cr-nome" type="text" autocomplete="off"
            style="width:100%;box-sizing:border-box;background:var(--bg3);border:1px solid var(--borda2);border-radius:8px;padding:10px 12px;color:var(--branco);font-size:13px;font-family:'Inter',sans-serif;margin-top:4px;"
            oninput="this.value=this.value.toUpperCase();crMostrarSimilares(this.value)">
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
          <div>
            <label style="font-size:10px;letter-spacing:1px;color:var(--texto3);font-family:'Rajdhani',sans-serif;">UNIDADE</label>
            <select id="cr-unidade" style="width:100%;background:var(--bg3);border:1px solid var(--borda2);border-radius:8px;padding:10px 8px;color:var(--branco);font-size:13px;margin-top:4px;">
              <option value="UN">UN</option><option value="m²">m²</option><option value="m³">m³</option><option value="m">m</option><option value="kg">kg</option><option value="saco">saco</option><option value="rolo">rolo</option><option value="barra">barra</option><option value="gl">gl</option><option value="cx">cx</option><option value="par">par</option><option value="ml">ml</option>
            </select>
          </div>
          <div>
            <label style="font-size:10px;letter-spacing:1px;color:var(--texto3);font-family:'Rajdhani',sans-serif;">CATEGORIA</label>
            <select id="cr-categoria" style="width:100%;background:var(--bg3);border:1px solid var(--borda2);border-radius:8px;padding:10px 8px;color:var(--branco);font-size:13px;margin-top:4px;">
              <option value="">— selecione —</option>
              ${typeof ETAPAS !== 'undefined' ? ETAPAS.map(e => '<option value="'+e.key+'">'+e.lb+'</option>').join('') : ''}
            </select>
          </div>
        </div>
        <div id="cr-aviso" style="display:none;font-size:11px;color:#fbbf24;margin-bottom:10px;padding:8px;background:rgba(251,191,36,0.08);border-radius:6px;"></div>
        <div style="display:flex;gap:10px;">
          <button onclick="fecharCadastroRapido()" style="flex:1;background:var(--bg3);border:1px solid var(--borda2);border-radius:8px;padding:10px;color:var(--texto2);font-family:'Rajdhani',sans-serif;font-size:12px;font-weight:700;cursor:pointer;">CANCELAR</button>
          <button id="cr-btn-salvar" onclick="salvarCadastroRapido()" style="flex:2;background:var(--verde-hl);border:none;border-radius:8px;padding:10px;color:#000;font-family:'Rajdhani',sans-serif;font-size:13px;font-weight:800;cursor:pointer;letter-spacing:1px;">CADASTRAR E USAR</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
  }
  document.getElementById('cr-nome').value = nomeDigitado;
  document.getElementById('cr-unidade').value = 'UN';
  document.getElementById('cr-categoria').value = '';
  document.getElementById('cr-aviso').style.display = 'none';
  document.getElementById('cr-similares').style.display = 'none';
  modal.style.display = 'flex';
  setTimeout(() => { const n = document.getElementById('cr-nome'); n.focus(); n.select(); crMostrarSimilares(nomeDigitado); }, 150);
}

function fecharCadastroRapido() {
  const m = document.getElementById('modal-cadastro-rapido'); if (m) m.style.display = 'none';
}

function crMostrarSimilares(val) {
  const painel = document.getElementById('cr-similares');
  const lista = document.getElementById('cr-similares-lista');
  if (!painel || !lista) return;
  if (!val || val.length < 3) { painel.style.display = 'none'; return; }
  const n = s => (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const tokens = n(val).split(/\s+/).filter(t => t.length >= 3);
  const similares = catalogoMateriais.filter(m => { const nm = n(m.nome||''); return tokens.some(t => nm.includes(t)); }).slice(0, 4);
  if (!similares.length) { painel.style.display = 'none'; return; }
  lista.innerHTML = similares.map(m =>
    `<div onclick="crUsarExistente('${m.nome.replace(/'/g,"\\'")}','${m.codigo}')"
       style="display:flex;align-items:center;gap:8px;padding:5px 8px;border-radius:6px;cursor:pointer;background:rgba(34,197,94,0.04);border:1px solid rgba(34,197,94,0.08);margin-bottom:3px;">
      <span style="font-family:monospace;font-size:10px;color:var(--verde-hl);background:rgba(34,197,94,0.08);padding:2px 6px;border-radius:4px;">${m.codigo}</span>
      <span style="font-size:12px;color:var(--branco);flex:1;">${esc(m.nome)}</span>
      <span style="font-size:10px;color:var(--verde-hl);font-weight:700;">USAR →</span>
    </div>`
  ).join('');
  painel.style.display = 'block';
}

function crUsarExistente(nome, codigo) {
  fecharCadastroRapido();
  showToast('✅ Usando ' + codigo + ' — ' + nome);
  const m = catalogoMateriais.find(x => x.codigo === codigo);
  if (_crOrigem === 'nf') {
    document.getElementById('i-desc').value = nome;
    const res = classificarItem(nome);
    currentCredito = res?.credito ?? null;
    const badge = document.getElementById('i-credito-badge');
    if (badge) { badge.className = `credito-badge ${res?.credito?'sim':'nao'}`; badge.textContent = res?.credito ? `GERA CREDITO - ${res.cat}` : `SEM CREDITO - ${res.cat||''}`; }
    if (m?.unidade) document.getElementById('i-unidade').value = m.unidade;
    setTimeout(() => document.getElementById('i-qtd')?.focus(), 100);
  } else if (_crOrigem === 'estoque') {
    document.getElementById('entrada-desc').value = nome;
    if (m?.unidade) document.getElementById('entrada-unidade').value = m.unidade;
    setTimeout(() => document.getElementById('entrada-qtd')?.focus(), 100);
  }
}

async function salvarCadastroRapido() {
  const nome = (document.getElementById('cr-nome').value||'').trim().toUpperCase();
  const unidade = document.getElementById('cr-unidade').value;
  const categoria = document.getElementById('cr-categoria').value;
  const aviso = document.getElementById('cr-aviso');
  if (!nome || nome.length < 2) { aviso.textContent = 'Informe o nome do material.'; aviso.style.display='block'; return; }
  const existe = catalogoMateriais.find(m => (m.nome||'').toUpperCase() === nome);
  if (existe) { aviso.textContent = 'Já existe: ' + existe.codigo + ' — ' + existe.nome; aviso.style.display='block'; return; }
  const btn = document.getElementById('cr-btn-salvar');
  btn.disabled = true; btn.textContent = 'SALVANDO...';
  try {
    const proxNum = catalogoMateriais.length > 0 ? Math.max(...catalogoMateriais.map(m => parseInt(m.codigo)||0)) + 1 : 1;
    const codigo = String(proxNum).padStart(6, '0');
    const [saved] = await sbPost('materiais', { codigo, nome, unidade, categoria });
    catalogoMateriais.push(saved);
    catalogoMateriais.sort((a,b) => a.codigo.localeCompare(b.codigo));
    fecharCadastroRapido();
    showToast('✅ ' + codigo + ' — ' + nome + ' cadastrado!');
    if (_crOrigem === 'nf') {
      document.getElementById('i-desc').value = nome;
      const res = classificarItem(nome);
      currentCredito = res?.credito ?? null;
      const badge = document.getElementById('i-credito-badge');
      if (badge) { badge.className = `credito-badge ${res?.credito?'sim':'nao'}`; badge.textContent = res?.credito ? `GERA CREDITO - ${res.cat}` : `SEM CREDITO - ${res.cat||''}`; }
      document.getElementById('i-unidade').value = unidade;
      setTimeout(() => document.getElementById('i-qtd')?.focus(), 100);
    } else if (_crOrigem === 'estoque') {
      document.getElementById('entrada-desc').value = nome;
      document.getElementById('entrada-unidade').value = unidade;
      setTimeout(() => document.getElementById('entrada-qtd')?.focus(), 100);
    }
  } catch(e) { aviso.textContent = 'Erro ao salvar. Tente novamente.'; aviso.style.display='block'; }
  btn.disabled = false; btn.textContent = 'CADASTRAR E USAR';
}
// ===================================


function abrirModalNovoMaterial() {
  _editandoMaterialId = null;
  document.getElementById('mat-nome').value = '';
  document.getElementById('mat-unidade').value = 'UN';
  // Popular select de categoria a partir do ETAPAS (fonte única)
  const selCat = document.getElementById('mat-categoria');
  if (selCat && typeof ETAPAS !== 'undefined') {
    selCat.innerHTML = '<option value="">— Selecione —</option>' + ETAPAS.map(e => `<option value="${e.key}">${e.lb}</option>`).join('');
  }
  selCat.value = '';
  document.getElementById('modal-material-aviso').classList.add('hidden');
  document.getElementById('btn-salvar-mat').textContent = '💾 SALVAR MATERIAL';
  document.getElementById('modal-material').classList.remove('hidden');
  setTimeout(() => document.getElementById('mat-nome').focus(), 100);
}

function editarMaterial(id) {
  const m = catalogoMateriais.find(x => x.id === id);
  if (!m) return;
  _editandoMaterialId = id;
  // Popular select de categoria
  const selCat = document.getElementById('mat-categoria');
  if (selCat && typeof ETAPAS !== 'undefined') {
    selCat.innerHTML = '<option value="">— Selecione —</option>' + ETAPAS.map(e => `<option value="${e.key}">${e.lb}</option>`).join('');
  }
  // Preencher campos
  document.getElementById('mat-nome').value = m.nome || '';
  document.getElementById('mat-unidade').value = m.unidade || 'UN';
  selCat.value = m.categoria || '';
  document.getElementById('modal-material-aviso').classList.add('hidden');
  document.getElementById('btn-salvar-mat').textContent = '💾 SALVAR ALTERAÇÕES';
  document.getElementById('btn-salvar-mat').disabled = false;
  document.getElementById('modal-material').classList.remove('hidden');
  setTimeout(() => document.getElementById('mat-nome').focus(), 100);
}

function duplicarMaterial(id) {
  const m = catalogoMateriais.find(x => x.id === id);
  if (!m) return;
  _editandoMaterialId = null; // modo novo (é uma cópia, não edição)
  const selCat = document.getElementById('mat-categoria');
  if (selCat && typeof ETAPAS !== 'undefined') {
    selCat.innerHTML = '<option value="">— Selecione —</option>' + ETAPAS.map(e => `<option value="${e.key}">${e.lb}</option>`).join('');
  }
  // Preencher com dados do item original pra editar só o nome
  document.getElementById('mat-nome').value = m.nome || '';
  document.getElementById('mat-unidade').value = m.unidade || 'UN';
  selCat.value = m.categoria || '';
  document.getElementById('modal-material-aviso').classList.add('hidden');
  document.getElementById('btn-salvar-mat').textContent = '💾 CADASTRAR CÓPIA';
  document.getElementById('btn-salvar-mat').disabled = false;
  document.getElementById('modal-material').classList.remove('hidden');
  setTimeout(() => { const n = document.getElementById('mat-nome'); n.focus(); n.select(); }, 100);
}

function onMatNomeInput() {
  const input = document.getElementById('mat-nome');
  input.value = input.value.toUpperCase();
  const nome = input.value.trim();
  const aviso = document.getElementById('modal-material-aviso');
  const list = document.getElementById('ac-mat-list');
  
  // Verificar duplicata exata (excluir o próprio item se estiver editando)
  if (nome.length >= 3) {
    const similar = catalogoMateriais.find(m => norm(m.nome) === norm(nome) && m.id !== _editandoMaterialId);
    if (similar) {
      aviso.innerHTML = `⚠ Material já existe: <b>${similar.codigo}</b> — ${similar.nome}`;
      aviso.classList.remove('hidden');
      document.getElementById('btn-salvar-mat').disabled = true;
    } else {
      aviso.classList.add('hidden');
      document.getElementById('btn-salvar-mat').disabled = false;
    }
  } else {
    aviso.classList.add('hidden');
    document.getElementById('btn-salvar-mat').disabled = false;
  }

  // Autocomplete com similares
  if (!nome || nome.length < 2) { list.classList.add('hidden'); return; }
  const q = norm(nome);
  const matches = catalogoMateriais.filter(m => norm(m.nome).includes(q)).slice(0, 6);
  if (!matches.length) { list.classList.add('hidden'); return; }
  list.innerHTML = matches.map(m => `<div class="autocomplete-item" onmousedown="selectMatNome('${m.nome.replace(/'/g,"\\'")}')" style="opacity:0.7;">
    <span class="ac-codigo">${m.codigo}</span>
    <span class="ac-label">${esc(m.nome)}</span>
    <span style="font-size:10px;color:#dc2626;margin-left:auto;">já existe</span>
  </div>`).join('');
  list.classList.remove('hidden');
}

function selectMatNome(nome) {
  document.getElementById('mat-nome').value = nome;
  document.getElementById('ac-mat-list').classList.add('hidden');
  onMatNomeInput();
}

function verificarDuplicata() { onMatNomeInput(); }

async function salvarMaterial() {
  const nome = document.getElementById('mat-nome').value.trim().toUpperCase();
  const unidade = document.getElementById('mat-unidade').value;
  const categoria = document.getElementById('mat-categoria').value;
  if (!nome) { showToast('⚠ Informe o nome do material.'); return; }
  const btn = document.getElementById('btn-salvar-mat');

  // === MODO EDIÇÃO ===
  if (_editandoMaterialId) {
    const atual = catalogoMateriais.find(m => m.id === _editandoMaterialId);
    if (!atual) return;
    // Verificar duplicata (excluindo o próprio)
    const duplicata = catalogoMateriais.find(m => m.id !== _editandoMaterialId && norm(m.nome) === norm(nome));
    if (duplicata) { showToast(`⚠ Material já existe: ${duplicata.codigo}`); return; }
    btn.disabled = true; btn.textContent = 'SALVANDO...';
    try {
      await sbPatch('materiais', `?id=eq.${_editandoMaterialId}`, { nome, unidade, categoria, auto: false });
      atual.nome = nome;
      atual.unidade = unidade;
      atual.categoria = categoria;
      atual.auto = false;
      _editandoMaterialId = null;
      fecharModal('material');
      renderCatalogo();
      showToast(`✅ Material ${atual.codigo} atualizado!`);
    } catch(e) { showToast('❌ Não foi possível atualizar o material.'); }
    btn.disabled = false; btn.textContent = '💾 SALVAR ALTERAÇÕES';
    return;
  }

  // === MODO NOVO ===
  // Verificar duplicata exata
  const existe = catalogoMateriais.find(m => norm(m.nome) === norm(nome));
  if (existe) { showToast(`⚠ Material já existe: ${existe.codigo}`); return; }
  // Gerar próximo código
  const proxNum = catalogoMateriais.length > 0
    ? Math.max(...catalogoMateriais.map(m => parseInt(m.codigo)||0)) + 1
    : 1;
  const codigo = String(proxNum).padStart(6, '0');
  btn.disabled = true; btn.textContent = 'SALVANDO...';
  try {
    const [saved] = await sbPost('materiais', { codigo, nome, unidade, categoria });
    catalogoMateriais.push(saved);
    catalogoMateriais.sort((a,b) => a.codigo.localeCompare(b.codigo));
    fecharModal('material');
    renderCatalogo();
    showToast(`✅ Material ${codigo} — ${nome} cadastrado!`);
  } catch(e) { showToast('❌ Não foi possível salvar o material.'); }
  btn.disabled = false; btn.textContent = '💾 SALVAR MATERIAL';
}

async function confirmarAutoMaterial(id) {
  try {
    await sbPatch('materiais', `?id=eq.${id}`, { auto: false });
    const m = catalogoMateriais.find(x => x.id === id);
    if (m) m.auto = false;
    renderCatalogo();
    showToast('✅ Material confirmado!');
  } catch(e) { showToast('❌ Não foi possível confirmar o material.'); }
}

async function excluirMaterial(id) {
  if (!confirm('Excluir este material do catálogo? Esta ação não pode ser desfeita.')) return;
  await sbDelete('materiais', `?id=eq.${id}`);
  catalogoMateriais = catalogoMateriais.filter(m => m.id !== id);
  renderCatalogo();
  showToast('✅ Material excluído do catálogo.');
}

async function editarCategoriaMaterial(id, categoria, selEl) {
  if (!categoria) return;
  try {
    await sbPatch('materiais', `?id=eq.${id}`, { categoria, auto: false });
    const m = catalogoMateriais.find(x => x.id === id);
    if (m) { m.categoria = categoria; m.auto = false; }
    showToast('✅ Centro de custo atualizado!');
  } catch(e) { showToast('❌ Não foi possível atualizar a categoria.'); }
}

async function recalcularCategorias() {
  if (!confirm('Recalcular automaticamente as categorias de todos os materiais do catálogo?\n\nIsso vai usar a classificação automática + converter para o padrão numerado (01-36).')) return;
  let atualizados = 0;
  for (const m of catalogoMateriais) {
    // getCatEstoque retorna key legada → resolver pra key oficial numerada
    const catLegada = getCatEstoque(m.nome);
    const novaCat = resolveEtapaKey(catLegada);
    // Comparar com a key CRUA salva no banco — se for diferente, atualizar
    if (novaCat !== m.categoria) {
      try {
        await sbPatch('materiais', `?id=eq.${m.id}`, { categoria: novaCat });
        m.categoria = novaCat;
        atualizados++;
      } catch(e) {}
    }
  }
  renderCatalogo();
  showToast(`✅ ${atualizados} centro(s) de custo atualizado(s)!`);
}

function copiarSQL() { navigator.clipboard.writeText(SQL_SETUP).then(() => showToast('✅ SQL copiado!')).catch(() => showToast('⚠ Selecione e copie manualmente.')); }

// ══════════════════════════════════════════
// RECONCILIAÇÃO DE ITENS ÓRFÃOS
// ══════════════════════════════════════════
let _orfaos = []; // lista de itens órfãos encontrados

function abrirReconciliacao() {
  document.getElementById('modal-reconciliar').classList.remove('hidden');
  document.getElementById('reconciliar-loading').style.display = '';
  document.getElementById('reconciliar-stats').style.display = 'none';
  document.getElementById('reconciliar-lista').innerHTML = '';
  document.getElementById('reconciliar-vazio').style.display = 'none';
  setTimeout(escanearOrfaos, 100);
}

function escanearOrfaos() {
  // Coletar TODAS as descrições de itens no sistema
  const descMap = {}; // { descNorm: { desc, fontes: [{tipo, id, ...}], qtdTotal, valorTotal } }

  function addDesc(descOriginal, tipo, ref) {
    const n = norm(descOriginal);
    if (!n || n.length < 2) return;
    if (!descMap[n]) descMap[n] = { desc: descOriginal.toUpperCase(), fontes: [], qtdTotal: 0, valorTotal: 0 };
    descMap[n].fontes.push({ tipo, ...ref });
    descMap[n].qtdTotal += Number(ref.qtd || 0);
    descMap[n].valorTotal += Number(ref.valor || 0);
  }

  // 1. Itens dentro das notas fiscais (JSON)
  notas.forEach(n => {
    const itens = parseItens(n);
    itens.forEach((it, idx) => {
      addDesc(it.desc, 'nf', { notaId: n.id, itemIdx: idx, nf: n.numero_nf, forn: n.fornecedor, qtd: it.qtd, valor: Number(it.qtd) * Number(it.preco) });
    });
  });

  // 2. Entradas diretas
  entradasDiretas.forEach(e => {
    addDesc(e.item_desc, 'entrada', { id: e.id, qtd: e.qtd, valor: Number(e.qtd) * Number(e.preco) });
  });

  // 3. Distribuições
  distribuicoes.forEach(d => {
    addDesc(d.item_desc, 'dist', { id: d.id, obra: d.obra_nome, qtd: d.qtd, valor: d.valor });
  });

  // Filtrar: só os que NÃO têm match exato no catálogo
  _orfaos = [];
  for (const [nKey, item] of Object.entries(descMap)) {
    const mat = getMaterialCatalogo(item.desc);
    if (mat) continue; // tem match exato → não é órfão

    // Tentar match fuzzy (reusar matchCatalogo do importar.js)
    let sugestao = null;
    if (typeof matchCatalogo === 'function') {
      sugestao = matchCatalogo(item.desc);
    }

    _orfaos.push({
      descNorm: nKey,
      desc: item.desc,
      fontes: item.fontes,
      qtdTotal: item.qtdTotal,
      valorTotal: item.valorTotal,
      sugestao: sugestao, // { material, score, tipo } ou null
    });
  }

  // Ordenar: com sugestão primeiro, depois por valor (maior impacto)
  _orfaos.sort((a, b) => {
    if (a.sugestao && !b.sugestao) return -1;
    if (!a.sugestao && b.sugestao) return 1;
    return b.valorTotal - a.valorTotal;
  });

  renderReconciliacao();
}

function renderReconciliacao() {
  document.getElementById('reconciliar-loading').style.display = 'none';
  const listaEl = document.getElementById('reconciliar-lista');
  const statsEl = document.getElementById('reconciliar-stats');
  const vazioEl = document.getElementById('reconciliar-vazio');

  if (!_orfaos.length) {
    listaEl.innerHTML = '';
    statsEl.style.display = 'none';
    vazioEl.style.display = '';
    return;
  }

  vazioEl.style.display = 'none';
  const comSugestao = _orfaos.filter(o => o.sugestao && o.sugestao.score >= 55).length;
  const semSugestao = _orfaos.length - comSugestao;
  const totalValor = _orfaos.reduce((s, o) => s + o.valorTotal, 0);

  statsEl.style.display = '';
  statsEl.innerHTML = `
    <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:center;">
      <div><span style="font-size:22px;font-weight:800;color:#fbbf24;">${_orfaos.length}</span> <span style="font-size:11px;color:var(--texto3);">itens órfãos</span></div>
      <div><span style="font-size:14px;font-weight:700;color:var(--verde-hl);">${comSugestao}</span> <span style="font-size:11px;color:var(--texto3);">com sugestão</span></div>
      <div><span style="font-size:14px;font-weight:700;color:var(--vermelho);">${semSugestao}</span> <span style="font-size:11px;color:var(--texto3);">sem match</span></div>
      <div class="admin-only"><span style="font-size:11px;color:var(--texto3);">Valor total:</span> <span style="font-weight:700;color:var(--branco);">${fmtR(totalValor)}</span></div>
    </div>
    <div style="margin-top:8px;display:flex;gap:8px;">
      <button onclick="reconciliarTodosComSugestao()" style="background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.2);color:var(--verde-hl);border-radius:8px;padding:6px 14px;font-size:11px;font-weight:700;font-family:'Rajdhani',sans-serif;cursor:pointer;letter-spacing:1px;">✅ VINCULAR TODOS COM SCORE ≥ 80</button>
    </div>`;

  listaEl.innerHTML = _orfaos.map((o, i) => {
    const nfs = o.fontes.filter(f => f.tipo === 'nf').length;
    const entradas = o.fontes.filter(f => f.tipo === 'entrada').length;
    const dists = o.fontes.filter(f => f.tipo === 'dist').length;
    const fontesStr = [
      nfs ? `${nfs} NF` : '',
      entradas ? `${entradas} entrada${entradas > 1 ? 's' : ''}` : '',
      dists ? `${dists} distrib.` : ''
    ].filter(Boolean).join(' · ');

    const sug = o.sugestao;
    const scoreColor = sug ? (sug.score >= 80 ? 'var(--verde-hl)' : sug.score >= 60 ? '#fbbf24' : 'var(--vermelho)') : '';

    return `<div class="reconciliar-item" id="orfao-${i}" style="background:var(--bg2);border:1px solid var(--borda);border-radius:12px;padding:14px;margin-bottom:8px;border-left:3px solid ${sug ? (sug.score >= 80 ? 'var(--verde-hl)' : '#fbbf24') : 'var(--vermelho)'};">
      <div style="display:flex;align-items:flex-start;gap:10px;flex-wrap:wrap;">
        <div style="flex:1;min-width:200px;">
          <div style="font-weight:700;font-size:14px;color:var(--branco);">${o.desc}</div>
          <div style="font-size:10px;color:var(--texto3);margin-top:3px;">${fontesStr} · Qtd: ${o.qtdTotal % 1 === 0 ? o.qtdTotal : o.qtdTotal.toFixed(2)} · <span class="admin-only">${fmtR(o.valorTotal)}</span></div>
        </div>
        ${sug ? `
          <div style="flex:1;min-width:200px;background:rgba(34,197,94,0.04);border:1px solid rgba(34,197,94,0.1);border-radius:8px;padding:8px 10px;">
            <div style="font-size:9px;font-weight:700;letter-spacing:1px;color:var(--texto3);margin-bottom:4px;">SUGESTÃO (${sug.tipo})</div>
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="font-family:monospace;font-size:10px;color:var(--verde-hl);background:rgba(34,197,94,0.08);padding:2px 6px;border-radius:4px;">${sug.material.codigo}</span>
              <span style="font-size:12px;color:var(--branco);flex:1;">${sug.material.nome}</span>
              <span style="font-size:11px;font-weight:800;color:${scoreColor};">${sug.score}%</span>
            </div>
          </div>` : `
          <div style="flex:1;min-width:200px;background:rgba(239,68,68,0.04);border:1px solid rgba(239,68,68,0.15);border-radius:8px;padding:8px 10px;">
            <div style="font-size:10px;color:var(--vermelho);font-weight:700;">Nenhum match encontrado</div>
          </div>`}
      </div>
      <div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap;">
        ${sug ? `<button onclick="reconciliarVincular(${i})" style="background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.2);color:var(--verde-hl);border-radius:6px;padding:5px 12px;font-size:11px;font-weight:700;font-family:'Rajdhani',sans-serif;cursor:pointer;">✅ VINCULAR A ${sug.material.codigo}</button>` : ''}
        <button onclick="reconciliarBuscar(${i})" style="background:rgba(59,130,246,0.08);border:1px solid rgba(59,130,246,0.25);color:#60a5fa;border-radius:6px;padding:5px 12px;font-size:11px;font-weight:700;font-family:'Rajdhani',sans-serif;cursor:pointer;">🔍 BUSCAR MANUALMENTE</button>
        <button onclick="reconciliarCadastrar(${i})" style="background:rgba(251,191,36,0.08);border:1px solid rgba(251,191,36,0.25);color:#fbbf24;border-radius:6px;padding:5px 12px;font-size:11px;font-weight:700;font-family:'Rajdhani',sans-serif;cursor:pointer;">➕ CADASTRAR NOVO</button>
        <button onclick="reconciliarExcluir(${i})" style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.25);color:#f87171;border-radius:6px;padding:5px 12px;font-size:11px;font-weight:700;font-family:'Rajdhani',sans-serif;cursor:pointer;">🗑 EXCLUIR</button>
      </div>
      <div id="orfao-busca-${i}" style="display:none;margin-top:10px;"></div>
    </div>`;
  }).join('');
}

// Vincular órfão a um material do catálogo
async function reconciliarVincular(idx, matOverride) {
  const o = _orfaos[idx];
  if (!o) return;
  const mat = matOverride || o.sugestao?.material;
  if (!mat) { showToast('⚠ Sem material para vincular.'); return; }

  const el = document.getElementById(`orfao-${idx}`);
  if (el) el.style.opacity = '0.5';

  const novoNome = mat.nome;
  let atualizados = 0;

  try {
    // 1. Atualizar itens dentro das notas fiscais (JSON)
    const notasAfetadas = new Set();
    for (const f of o.fontes) {
      if (f.tipo === 'nf') notasAfetadas.add(f.notaId);
    }
    for (const notaId of notasAfetadas) {
      const nota = notas.find(n => n.id === notaId);
      if (!nota) continue;
      const itens = parseItens(nota);
      let mudou = false;
      itens.forEach(it => {
        if (norm(it.desc) === o.descNorm) { it.desc = novoNome; mudou = true; }
      });
      if (mudou) {
        const novoJson = JSON.stringify(itens);
        await sbPatch('notas_fiscais', `?id=eq.${notaId}`, { itens: novoJson });
        nota.itens = novoJson;
        atualizados++;
      }
    }

    // 2. Atualizar entradas_diretas
    for (const f of o.fontes) {
      if (f.tipo === 'entrada') {
        await sbPatch('entradas_diretas', `?id=eq.${f.id}`, { item_desc: novoNome });
        const ed = entradasDiretas.find(e => e.id === f.id);
        if (ed) ed.item_desc = novoNome;
        atualizados++;
      }
    }

    // 3. Atualizar distribuições
    for (const f of o.fontes) {
      if (f.tipo === 'dist') {
        await sbPatch('distribuicoes', `?id=eq.${f.id}`, { item_desc: novoNome });
        const d = distribuicoes.find(x => x.id === f.id);
        if (d) d.item_desc = novoNome;
        atualizados++;
      }
    }

    // Remover da lista de órfãos
    _orfaos.splice(idx, 1);
    renderReconciliacao();
    showToast(`✅ "${o.desc}" → ${mat.codigo} · ${novoNome} (${atualizados} registro${atualizados !== 1 ? 's' : ''} atualizado${atualizados !== 1 ? 's' : ''})`);
  } catch (e) {
    console.error('Erro ao reconciliar:', e);
    showToast('❌ Não foi possível vincular. Tente novamente.');
    if (el) el.style.opacity = '1';
  }
}

// Vincular todos com score >= 80 de uma vez
async function reconciliarTodosComSugestao() {
  const candidatos = _orfaos.filter(o => o.sugestao && o.sugestao.score >= 80);
  if (!candidatos.length) { showToast('⚠ Nenhum item com score >= 80.'); return; }
  if (!confirm(`Vincular automaticamente ${candidatos.length} item(ns) com score ≥ 80%?\n\nIsso vai atualizar as descrições nas notas, entradas e distribuições.`)) return;

  let ok = 0;
  // Processar de trás pra frente pra não bagunçar os índices
  for (let i = _orfaos.length - 1; i >= 0; i--) {
    const o = _orfaos[i];
    if (o.sugestao && o.sugestao.score >= 80) {
      try {
        await reconciliarVincular(i);
        ok++;
      } catch (e) {}
    }
  }
  showToast(`✅ ${ok} item(ns) vinculado(s) automaticamente!`);
}

// Buscar manualmente no catálogo
function reconciliarBuscar(idx) {
  const o = _orfaos[idx];
  const buscaEl = document.getElementById(`orfao-busca-${idx}`);
  if (!buscaEl) return;

  if (buscaEl.style.display !== 'none') { buscaEl.style.display = 'none'; return; }

  buscaEl.style.display = '';
  buscaEl.innerHTML = `
    <div style="display:flex;gap:8px;align-items:center;">
      <input type="text" id="orfao-busca-input-${idx}" placeholder="Buscar no catálogo..." value="${o.desc}"
        style="flex:1;background:var(--bg3);border:1px solid var(--borda2);border-radius:8px;padding:8px 12px;color:var(--branco);font-size:12px;font-family:inherit;"
        oninput="reconciliarFiltrar(${idx}, this.value)">
    </div>
    <div id="orfao-busca-resultados-${idx}" style="margin-top:8px;max-height:200px;overflow-y:auto;"></div>`;

  setTimeout(() => {
    const input = document.getElementById(`orfao-busca-input-${idx}`);
    if (input) { input.focus(); input.select(); }
    reconciliarFiltrar(idx, o.desc);
  }, 50);
}

function reconciliarFiltrar(idx, busca) {
  const resEl = document.getElementById(`orfao-busca-resultados-${idx}`);
  if (!resEl) return;
  const q = norm(busca);
  if (!q || q.length < 2) { resEl.innerHTML = '<div style="font-size:11px;color:var(--texto3);padding:8px;">Digite pelo menos 2 caracteres...</div>'; return; }

  // Buscar por nome e código
  let resultados = catalogoMateriais.filter(m => norm(m.nome).includes(q) || m.codigo.includes(q)).slice(0, 10);

  // Se poucos resultados, tentar match fuzzy
  if (resultados.length < 3 && typeof calcSimilaridade === 'function') {
    const scored = catalogoMateriais.map(m => ({ m, score: calcSimilaridade(limparParaMatch(busca), limparParaMatch(m.nome)) }))
      .filter(x => x.score >= 40)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
    // Merge sem duplicatas
    for (const s of scored) {
      if (!resultados.find(r => r.id === s.m.id)) resultados.push(s.m);
    }
  }

  if (!resultados.length) {
    resEl.innerHTML = '<div style="font-size:11px;color:var(--texto3);padding:8px;">Nenhum resultado encontrado.</div>';
    return;
  }

  resEl.innerHTML = resultados.map(m => `
    <div onclick="reconciliarVincular(${idx}, catalogoMateriais.find(x=>x.codigo==='${m.codigo}'))"
      style="display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:6px;cursor:pointer;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);margin-bottom:4px;transition:background 0.15s;"
      onmouseover="this.style.background='rgba(34,197,94,0.1)'" onmouseout="this.style.background='rgba(255,255,255,0.03)'">
      <span style="font-family:monospace;font-size:10px;color:var(--verde-hl);background:rgba(34,197,94,0.08);padding:2px 6px;border-radius:4px;">${m.codigo}</span>
      <span style="font-size:12px;color:var(--branco);flex:1;">${esc(m.nome)}</span>
      <span style="font-size:10px;color:var(--verde-hl);font-weight:700;">VINCULAR →</span>
    </div>`).join('');
}

// Cadastrar item órfão como novo no catálogo
async function reconciliarCadastrar(idx) {
  const o = _orfaos[idx];
  if (!o) return;

  // Gerar próximo código
  const proxNum = catalogoMateriais.length > 0 ? Math.max(...catalogoMateriais.map(m => parseInt(m.codigo) || 0)) + 1 : 1;
  const codigo = String(proxNum).padStart(6, '0');
  const categoria = getCatEstoque(o.desc) || '';

  try {
    const [saved] = await sbPost('materiais', { codigo, nome: o.desc, unidade: 'UN', categoria });
    catalogoMateriais.push(saved);
    catalogoMateriais.sort((a, b) => a.codigo.localeCompare(b.codigo));

    // Agora vincular automaticamente
    await reconciliarVincular(idx, saved);
    showToast(`✅ ${codigo} · ${o.desc} cadastrado e vinculado!`);
  } catch (e) {
    console.error(e);
    showToast('❌ Não foi possível cadastrar.');
  }
}

// Excluir todas as referências do item órfão
async function reconciliarExcluir(idx) {
  const o = _orfaos[idx];
  if (!o) return;
  const nfs = o.fontes.filter(f => f.tipo === 'nf');
  const entradas = o.fontes.filter(f => f.tipo === 'entrada');
  const dists = o.fontes.filter(f => f.tipo === 'dist');

  const msg = `Excluir "${o.desc}" de TODOS os registros?\n\n` +
    (nfs.length ? `• ${nfs.length} item(ns) em notas fiscais (será removido do JSON)\n` : '') +
    (entradas.length ? `• ${entradas.length} entrada(s) direta(s) (será deletada)\n` : '') +
    (dists.length ? `• ${dists.length} distribuição(ões) (será deletada)\n` : '') +
    `\n⚠ Essa ação NÃO pode ser desfeita!`;
  if (!confirm(msg)) return;

  const el = document.getElementById(`orfao-${idx}`);
  if (el) el.style.opacity = '0.5';

  try {
    // 1. Remover item do JSON das notas
    const notasAfetadas = new Set();
    for (const f of nfs) notasAfetadas.add(f.notaId);
    for (const notaId of notasAfetadas) {
      const nota = notas.find(n => n.id === notaId);
      if (!nota) continue;
      let itens = parseItens(nota);
      itens = itens.filter(it => norm(it.desc) !== o.descNorm);
      const novoJson = JSON.stringify(itens);
      await sbPatch('notas_fiscais', `?id=eq.${notaId}`, { itens: novoJson });
      nota.itens = novoJson;
    }

    // 2. Deletar entradas diretas
    for (const f of entradas) {
      await sbDelete('entradas_diretas', `?id=eq.${f.id}`);
      entradasDiretas = entradasDiretas.filter(e => e.id !== f.id);
    }

    // 3. Deletar distribuições
    for (const f of dists) {
      await sbDelete('distribuicoes', `?id=eq.${f.id}`);
      distribuicoes = distribuicoes.filter(d => d.id !== f.id);
    }

    _orfaos.splice(idx, 1);
    renderReconciliacao();
    showToast(`🗑 "${o.desc}" excluído de ${nfs.length + entradas.length + dists.length} registro(s).`);
  } catch (e) {
    console.error(e);
    showToast('❌ Não foi possível excluir.');
    if (el) el.style.opacity = '1';
  }
}
