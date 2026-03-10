// ══════════════════════════════════════════
// CATÁLOGO DE MATERIAIS
// ══════════════════════════════════════════
let filtroAuto = false;
function filtrarSoAuto() {
  filtroAuto = !filtroAuto;
  renderCatalogo();
}

function renderCatalogo() {
  const busca = norm(document.getElementById('catalogo-busca')?.value || '');
  const catFiltro = document.getElementById('catalogo-cat-filtro')?.value || '';
  let lista = [...catalogoMateriais];
  if (busca) lista = lista.filter(m => norm(m.nome).includes(busca) || m.codigo.includes(busca));
  if (catFiltro) lista = lista.filter(m => (m.categoria||'outros') === catFiltro);
  if (filtroAuto) lista = lista.filter(m => m.auto === true || m.auto === 'true');
  const el = document.getElementById('catalogo-lista');
  const stats = document.getElementById('catalogo-stats');
  const autoCount = catalogoMateriais.filter(m => m.auto === true || m.auto === 'true').length;
  if (stats) stats.innerHTML = `${lista.length} material(is) cadastrado(s)${autoCount > 0 && usuarioAtual?.perfil==='admin' ? ` &nbsp;<span style="background:rgba(245,158,11,0.12);color:#fbbf24;border:1px solid rgba(245,158,11,0.3);border-radius:4px;padding:1px 7px;font-size:10px;font-family:'JetBrains Mono',monospace;cursor:pointer;" onclick="filtrarSoAuto()" title="Ver apenas pendentes de revisão">⚠ ${autoCount} pendente${autoCount>1?'s':''} AUTO</span>` : ''}`;
  if (!lista.length) { el.innerHTML = '<div class="empty">Nenhum material encontrado. Clique em "+ Novo Material" para cadastrar.</div>'; return; }
  const CATS_OPTS = [
    ['alimentacao','🍽 Alimentação'],['alvenaria','🧱 Alvenaria'],['cobertura','🏠 Cobertura'],
    ['combustivel','⛽ Combustível'],['doc','📋 Documentação'],['eletrica','⚡ Elétrica'],
    ['epi','🦺 EPI / Segurança'],['esgoto','🪠 Esgoto'],['esquadria','🪟 Esquadrias'],
    ['expediente','📎 Expediente'],['ferro','⚙ Aço / Ferro'],['ferramenta','🔨 Ferramentas'],
    ['forma','🪵 Forma e Madeira'],['gesso','⬜ Gesso'],['granito','🪨 Granito / Pedra'],['hidraulica','🚿 Hidráulica'],
    ['impermeab','💧 Impermeabilização'],['imobilizado','🖥 Imobilizado'],['imposto','🧾 Impostos / Encargos'],['tecnologia','💻 Tecnologia / Assinaturas'],
    ['limpeza','🧹 Limpeza'],['locacao','🏗 Locação de Equip.'],
    ['loucas','🛁 Louças e Metais'],['mao','👷 Mão de Obra'],['pintura','🖌 Pintura'],
    ['rev_cer','🟫 Revest. Cerâmico'],['terreno','🏡 Terreno'],['generico','❓ Genérico'],['outros','📦 Outros']
  ];
  el.innerHTML = lista.map(m => {
    const isAuto = m.auto === true || m.auto === 'true';
    const catSelect = CATS_OPTS.map(([k,lb]) => `<option value="${k}" ${m.categoria===k?'selected':''}>${lb}</option>`).join('');
    return `
    <div class="catalogo-item" style="${isAuto ? 'border-color:rgba(245,158,11,0.35);' : ''}">
      <span class="catalogo-codigo">${m.codigo || "S/COD"}</span>
      ${isAuto ? `<span style="font-size:9px;font-weight:800;background:rgba(245,158,11,0.12);color:#fbbf24;border:1px solid rgba(245,158,11,0.3);border-radius:4px;padding:1px 5px;font-family:'JetBrains Mono',monospace;white-space:nowrap;">AUTO</span>` : ''}
      <span class="catalogo-nome">${m.nome}</span>
      <span class="catalogo-un">${m.unidade||'UN'}</span>
      ${usuarioAtual?.perfil==='admin' ? `
        <select onchange="editarCategoriaMaterial('${m.id}',this.value,this)" style="background:var(--bg3);border:1px solid ${isAuto?'rgba(245,158,11,0.3)':'var(--borda2)'};border-radius:6px;padding:3px 6px;color:${isAuto?'#fbbf24':'var(--branco)'};font-size:10px;font-family:inherit;cursor:pointer;" title="Editar categoria">
          <option value="">— cat —</option>${catSelect}
        </select>
        ${isAuto ? `<button onclick="confirmarAutoMaterial('${m.id}')" style="background:rgba(46,204,113,0.08);border:1px solid rgba(46,204,113,0.2);color:var(--verde-hl);border-radius:6px;padding:3px 8px;font-size:9px;font-family:'Rajdhani',sans-serif;font-weight:700;cursor:pointer;white-space:nowrap;" title="Confirmar revisão">✓ OK</button>` : ''}
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
      <div style="background:var(--bg2);border:1px solid rgba(46,204,113,0.3);border-radius:16px;padding:24px;width:min(420px,94vw);box-shadow:0 20px 60px rgba(0,0,0,.6);">
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
            style="width:100%;box-sizing:border-box;background:var(--bg3);border:1px solid var(--borda2);border-radius:8px;padding:10px 12px;color:var(--branco);font-size:13px;font-family:'Barlow',sans-serif;margin-top:4px;"
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
              <option value="alvenaria">🧱 Alvenaria</option><option value="ferro">⚙ Aço / Ferro</option><option value="eletrica">⚡ Elétrica</option><option value="hidraulica">🚿 Hidráulica</option><option value="loucas">🛁 Louças e Metais</option><option value="esgoto">🪠 Esgoto</option><option value="cobertura">🏠 Cobertura</option><option value="esquadria">🪟 Esquadrias</option><option value="rev_cer">🟫 Revest. Cerâmico</option><option value="rev_arg">🟤 Revest. Argamassa</option><option value="pintura">🖌 Pintura</option><option value="impermeab">💧 Impermeabilização</option><option value="gesso">⬜ Gesso</option><option value="forma">🪵 Forma e Madeira</option><option value="ferramenta">🔨 Ferramentas</option><option value="epi">🦺 EPI / Segurança</option><option value="combustivel">⛽ Combustível</option><option value="limpeza">🧹 Limpeza</option><option value="alimentacao">🍽 Alimentação</option><option value="locacao">🏗 Locação de Equip.</option><option value="mao">👷 Mão de Obra</option><option value="imposto">🧾 Impostos / Encargos</option><option value="imobilizado">🖥 Imobilizado</option><option value="tecnologia">💻 Tecnologia / Assinaturas</option><option value="doc">📋 Documentação</option><option value="terreno">🏡 Terreno</option><option value="expediente">📎 Expediente</option><option value="generico">❓ Genérico</option><option value="outros">📦 Outros</option>
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
       style="display:flex;align-items:center;gap:8px;padding:5px 8px;border-radius:6px;cursor:pointer;background:rgba(46,204,113,0.05);border:1px solid rgba(46,204,113,0.1);margin-bottom:3px;">
      <span style="font-family:monospace;font-size:10px;color:var(--verde-hl);background:rgba(46,204,113,0.1);padding:2px 6px;border-radius:4px;">${m.codigo}</span>
      <span style="font-size:12px;color:var(--branco);flex:1;">${m.nome}</span>
      <span style="font-size:10px;color:var(--verde-hl);font-weight:700;">USAR →</span>
    </div>`
  ).join('');
  painel.style.display = 'block';
}

function crUsarExistente(nome, codigo) {
  fecharCadastroRapido();
  showToast('Usando ' + codigo + ' — ' + nome);
  const m = catalogoMateriais.find(x => x.codigo === codigo);
  if (_crOrigem === 'lanc') {
    document.getElementById('lanc-desc').value = nome;
    setTimeout(() => document.getElementById('lanc-preco')?.focus(), 100);
  } else if (_crOrigem === 'nf') {
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
  if (existe) { aviso.textContent = 'Ja existe: ' + existe.codigo + ' — ' + existe.nome; aviso.style.display='block'; return; }
  const btn = document.getElementById('cr-btn-salvar');
  btn.disabled = true; btn.textContent = 'SALVANDO...';
  try {
    const proxNum = catalogoMateriais.length > 0 ? Math.max(...catalogoMateriais.map(m => parseInt(m.codigo)||0)) + 1 : 1;
    const codigo = String(proxNum).padStart(6, '0');
    const [saved] = await sbPost('materiais', { codigo, nome, unidade, categoria });
    catalogoMateriais.push(saved);
    catalogoMateriais.sort((a,b) => a.codigo.localeCompare(b.codigo));
    fecharCadastroRapido();
    showToast(codigo + ' — ' + nome + ' CADASTRADO!');
    if (_crOrigem === 'lanc') {
      document.getElementById('lanc-desc').value = nome;
      setTimeout(() => document.getElementById('lanc-preco')?.focus(), 100);
    } else if (_crOrigem === 'nf') {
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
  document.getElementById('mat-nome').value = '';
  document.getElementById('mat-unidade').value = 'UN';
  document.getElementById('mat-categoria').value = '';
  document.getElementById('modal-material-aviso').classList.add('hidden');
  document.getElementById('modal-material').classList.remove('hidden');
  setTimeout(() => document.getElementById('mat-nome').focus(), 100);
}

function onMatNomeInput() {
  const input = document.getElementById('mat-nome');
  input.value = input.value.toUpperCase();
  const nome = input.value.trim();
  const aviso = document.getElementById('modal-material-aviso');
  const list = document.getElementById('ac-mat-list');
  
  // Verificar duplicata exata
  if (nome.length >= 3) {
    const similar = catalogoMateriais.find(m => norm(m.nome) === norm(nome));
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
    <span class="ac-label">${m.nome}</span>
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
  if (!nome) { showToast('⚠ INFORME O NOME DO MATERIAL.'); return; }
  // Verificar duplicata exata
  const existe = catalogoMateriais.find(m => norm(m.nome) === norm(nome));
  if (existe) { showToast(`⚠ MATERIAL JÁ EXISTE: ${existe.codigo}`); return; }
  // Gerar próximo código
  const proxNum = catalogoMateriais.length > 0
    ? Math.max(...catalogoMateriais.map(m => parseInt(m.codigo)||0)) + 1
    : 1;
  const codigo = String(proxNum).padStart(6, '0');
  const btn = document.getElementById('btn-salvar-mat'); btn.disabled = true; btn.textContent = 'SALVANDO...';
  try {
    const [saved] = await sbPost('materiais', { codigo, nome, unidade, categoria });
    catalogoMateriais.push(saved);
    catalogoMateriais.sort((a,b) => a.codigo.localeCompare(b.codigo));
    fecharModal('material');
    renderCatalogo();
    showToast(`✅ MATERIAL ${codigo} — ${nome} CADASTRADO!`);
  } catch(e) { showToast('ERRO AO SALVAR MATERIAL.'); }
  btn.disabled = false; btn.textContent = '💾 SALVAR MATERIAL';
}

async function confirmarAutoMaterial(id) {
  try {
    await sbPatch('materiais', `?id=eq.${id}`, { auto: false });
    const m = catalogoMateriais.find(x => x.id === id);
    if (m) m.auto = false;
    renderCatalogo();
    showToast('✅ MATERIAL CONFIRMADO!');
  } catch(e) { showToast('ERRO AO CONFIRMAR.'); }
}

async function excluirMaterial(id) {
  if (!confirm('Excluir este material do catálogo?')) return;
  await sbDelete('materiais', `?id=eq.${id}`);
  catalogoMateriais = catalogoMateriais.filter(m => m.id !== id);
  renderCatalogo();
  showToast('Material excluído do catálogo.');
}

async function migrarMateriaisExistentes() {
  if (!confirm('Isso vai criar códigos automáticos para todos os materiais do estoque que ainda não têm código. Continuar?')) return;
  const estoque = consolidarEstoque();
  let criados = 0;
  const proxBase = catalogoMateriais.length > 0 ? Math.max(...catalogoMateriais.map(m => parseInt(m.codigo)||0)) : 0;
  for (const [i, m] of estoque.entries()) {
    const jaExiste = catalogoMateriais.find(x => norm(x.nome) === norm(m.desc));
    if (jaExiste) continue;
    const codigo = String(proxBase + i + 1).padStart(6, '0');
    try {
      const [saved] = await sbPost('materiais', { codigo, nome: m.desc.toUpperCase(), unidade: m.unidade||'UN', categoria: getCatEstoque(m.desc)||'' });
      catalogoMateriais.push(saved);
      criados++;
    } catch(e) {}
  }
  catalogoMateriais.sort((a,b) => a.codigo.localeCompare(b.codigo));
  renderCatalogo();
  showToast(`✅ ${criados} MATERIAL(IS) MIGRADO(S) PARA O CATÁLOGO!`);
}

async function editarCategoriaMaterial(id, categoria, selEl) {
  if (!categoria) return;
  try {
    await sbPatch('materiais', `?id=eq.${id}`, { categoria, auto: false });
    const m = catalogoMateriais.find(x => x.id === id);
    if (m) { m.categoria = categoria; m.auto = false; }
    showToast('✅ CENTRO DE CUSTO ATUALIZADO!');
  } catch(e) { showToast('ERRO AO ATUALIZAR CATEGORIA.'); }
}

async function recalcularCategorias() {
  if (!confirm('Recalcular automaticamente as categorias de todos os materiais do catálogo?')) return;
  let atualizados = 0;
  for (const m of catalogoMateriais) {
    const novaCat = getCatEstoque(m.nome);
    if (novaCat !== m.categoria) {
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/materiais?id=eq.${m.id}`, {
          method: 'PATCH', headers: hdrs,
          body: JSON.stringify({ categoria: novaCat })
        });
        m.categoria = novaCat;
        atualizados++;
      } catch(e) {}
    }
  }
  renderCatalogo();
  showToast(`✅ ${atualizados} CENTRO(S) DE CUSTO ATUALIZADO(S)!`);
}

function copiarSQL() { navigator.clipboard.writeText(SQL_SETUP).then(() => showToast('SQL COPIADO!')).catch(() => showToast('SELECIONE E COPIE MANUALMENTE.')); }
