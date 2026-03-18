function abrirNota(id) {
  const n = notas.find(x => x.id === id); if (!n) return;
  const itens = parseItens(n);
  const subtotal = itens.reduce((s,i) => s + Number(i.total||0), 0);
  const frete = Number(n.frete||0);
  const total = Number(n.valor_bruto||0);
  const isAdmin = usuarioAtual?.perfil === 'admin';

  const itensHTML = itens.length ? itens.map(it => `
    <div style="display:flex;align-items:flex-start;gap:10px;padding:10px 0;border-bottom:1px solid var(--borda);">
      <div style="flex:1;">
        <div style="font-weight:600;font-size:13px;color:var(--branco);">${esc(it.desc)}</div>
        <div style="font-size:11px;color:var(--texto2);margin-top:3px;">${(()=>{const q=Number(it.qtd);return q%1===0?q:q.toFixed(3);})()} ${it.unidade||'UN'} × ${fmtR(it.preco||0)}/UN${it.desconto>0?' · Desc: '+fmtR(it.desconto):''}</div>
      </div>
      <div style="text-align:right;flex-shrink:0;">
        ${isAdmin ? `<div style="font-weight:700;color:var(--verde-hl);">${fmtR(it.total||0)}</div>` : ''}
        <div style="font-size:10px;margin-top:2px;"><span style="color:${it.credito?'var(--verde-hl)':'#f87171'};font-weight:700;">${it.credito?'✓ CRÉDITO':'✗ SEM CRÉDITO'}</span></div>
      </div>
    </div>`).join('') : '<div style="color:var(--texto3);font-size:13px;padding:12px 0;">Nenhum item registrado.</div>';

  document.getElementById('modal-nota-body').innerHTML = `
    <!-- CABEÇALHO -->
    <div style="background:var(--bg3);border:1px solid var(--borda);border-radius:10px;padding:14px;margin-bottom:14px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">
        <div>
          <div style="font-weight:800;font-size:16px;color:var(--branco);">${esc(n.fornecedor)}</div>
          <div style="font-size:12px;color:var(--texto3);margin-top:2px;">${esc(n.cnpj||'SEM CNPJ')}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:11px;color:var(--texto3);">NF</div>
          <div style="font-weight:800;font-size:18px;color:var(--verde-hl);">${n.numero_nf||'—'}</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;font-size:12px;">
        <div><div style="color:var(--texto3);font-size:10px;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px;">Emissão</div><div style="color:var(--branco);font-weight:600;">${n.data||'—'}</div></div>
        <div><div style="color:var(--texto3);font-size:10px;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px;">Recebimento</div><div style="color:var(--branco);font-weight:600;">${n.data_recebimento||'—'}</div></div>
        <div><div style="color:var(--texto3);font-size:10px;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px;">Natureza</div><div style="color:var(--branco);font-weight:600;">${n.natureza||'—'}</div></div>
        <div><div style="color:var(--texto3);font-size:10px;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px;">Destino</div><div style="color:var(--branco);font-weight:600;">${n.obra==='EDR'?'📦 Estoque':n.obra==='EDR_ESCRITORIO'?'🏢 Escritório':esc(n.obra)}</div></div>
        <div><div style="color:var(--texto3);font-size:10px;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px;">Crédito</div><div style="font-weight:700;color:${n.credito_status==='sim'?'var(--verde-hl)':n.credito_status==='misto'?'var(--amarelo)':'#f87171'};">${n.credito_status==='sim'?'✓ Sim':n.credito_status==='misto'?'⚡ Parcial':'✗ Não'}</div></div>
        ${isAdmin ? `<div><div style="color:var(--texto3);font-size:10px;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px;">Total</div><div style="font-weight:800;color:var(--verde-hl);">${fmtR(total)}</div></div>` : ''}
      </div>
      ${n.obs ? `<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--borda);font-size:12px;color:var(--texto2);">📝 ${esc(n.obs)}</div>` : ''}
    </div>

    <!-- ITENS -->
    <div style="font-size:10px;font-weight:700;color:var(--texto3);letter-spacing:1px;text-transform:uppercase;margin-bottom:8px;">
      ${itens.length} ITEN${itens.length!==1?'S':''}
    </div>
    ${itensHTML}

    <!-- TOTAIS -->
    ${isAdmin && (frete > 0 || itens.length > 0) ? `
    <div style="margin-top:12px;border-top:1px solid var(--borda);padding-top:12px;">
      ${itens.length > 1 ? `<div style="display:flex;justify-content:space-between;font-size:13px;color:var(--texto2);margin-bottom:6px;"><span>Subtotal itens</span><span>${fmtR(subtotal)}</span></div>` : ''}
      ${frete > 0 ? `<div style="display:flex;justify-content:space-between;font-size:13px;color:var(--verde-hl);margin-bottom:6px;"><span>🚚 Frete</span><span>${fmtR(frete)}</span></div>` : ''}
      <div style="display:flex;justify-content:space-between;font-weight:800;font-size:15px;color:var(--branco);"><span>TOTAL</span><span style="color:var(--verde-hl);">${fmtR(total)}</span></div>
    </div>` : ''}
  `;

  document.getElementById('modal-nota').classList.remove('hidden');
}

function abrirEntradaDireta() {
  const hoje = hojeISO();
  document.getElementById('entrada-desc').value = '';
  document.getElementById('entrada-qtd').value = '';
  document.getElementById('entrada-unidade').value = '';
  document.getElementById('entrada-preco').value = '';
  document.getElementById('entrada-fornecedor').value = '';
  document.getElementById('entrada-data').value = hoje;
  document.getElementById('entrada-obs').value = '';
  document.getElementById('entrada-preco-alerta').classList.add('hidden');
  const sel = document.getElementById('entrada-obra-id');
  sel.innerHTML = obras.map(o => `<option value="${o.id}">${o.nome}</option>`).join('');
  const selEt = document.getElementById('entrada-etapa');
  if (selEt) selEt.innerHTML = etapaSelectOpts('', true);
  setDestinoEntrada('estoque');
  document.getElementById('modal-entrada').classList.remove('hidden');
  setTimeout(() => document.getElementById('entrada-desc').focus(), 100);
}

function onEntradaPrecoInput() {
  const preco = parseFloat(document.getElementById('entrada-preco').value) || 0;
  const alerta = document.getElementById('entrada-preco-alerta');
  if (preco <= 0) {
    alerta.style.display = 'flex';
    alerta.classList.remove('hidden');
  } else {
    alerta.style.display = 'none';
  }
}

function buscarPrecoFC() {
  const desc = document.getElementById('entrada-desc').value.trim();
  const query = encodeURIComponent(desc || 'material construção');
  window.open(`https://www.ferreiracosta.com/busca?q=${query}`, '_blank');
}

function setDestinoEntrada(tipo) {
  const btnEst = document.getElementById('btn-destino-estoque');
  const btnObra = document.getElementById('btn-destino-obra');
  const infoEst = document.getElementById('entrada-estoque-info');
  const wrapObra = document.getElementById('entrada-obra-wrap');
  if (tipo === 'estoque') {
    btnEst.style.background = 'rgba(139,92,246,0.15)'; btnEst.style.color = '#a78bfa'; btnEst.style.borderColor = 'rgba(139,92,246,0.4)';
    btnObra.style.background = 'transparent'; btnObra.style.color = 'var(--texto3)'; btnObra.style.borderColor = 'rgba(255,255,255,0.1)';
    infoEst.classList.remove('hidden'); wrapObra.classList.add('hidden');
    btnEst.dataset.ativo = '1';
  } else {
    btnObra.style.background = 'rgba(34,197,94,0.1)'; btnObra.style.color = 'var(--verde-hl)'; btnObra.style.borderColor = 'rgba(34,197,94,0.3)';
    btnEst.style.background = 'transparent'; btnEst.style.color = 'var(--texto3)'; btnEst.style.borderColor = 'rgba(139,92,246,0.2)';
    infoEst.classList.add('hidden'); wrapObra.classList.remove('hidden');
    btnEst.dataset.ativo = '';
  }
}

function onEntradaDescInput() {
  const val = document.getElementById('entrada-desc').value;
  const list = document.getElementById('ac-entrada-list');
  if (!val || val.length < 2) { list.classList.add('hidden'); return; }
  const v = norm(val), seen = new Set(), matches = [];
  // 1. Catálogo de materiais — busca por nome E por código (sem limite, ordena por relevância)
  const numVal = val.replace(/\D/g,'');
  catalogoMateriais
    .filter(m => norm(m.nome).includes(v) || (numVal && (m.codigo||'').includes(numVal)))
    .sort((a,b) => {
      // Prioriza: começa com o termo > contém no início da palavra > contém em qualquer lugar
      const na = norm(a.nome), nb = norm(b.nome);
      const aStart = na.startsWith(v) ? 0 : na.includes(' '+v) ? 1 : 2;
      const bStart = nb.startsWith(v) ? 0 : nb.includes(' '+v) ? 1 : 2;
      return aStart - bStart;
    })
    .forEach(m => {
      if (!seen.has(m.nome)) { seen.add(m.nome); matches.push({ desc: m.nome, unidade: m.unidade||'UN', codigo: m.codigo||'' }); }
    });
  // 2. Histórico de entradas diretas
  const txtEst = val.trim().toUpperCase();
  matches.push({ desc: txtEst, unidade: 'UN', codigo: '', cadastroRapido: true });
  const top = matches.slice(0,15);
  list.innerHTML = top.map((m,i) => m.cadastroRapido
    ? `<div class="autocomplete-item" data-ed-idx="${i}" style="border-top:1px solid rgba(255,255,255,0.1);margin-top:2px;">
        <span style="color:var(--verde-hl);font-weight:700;font-size:12px;">+ CADASTRAR "${m.desc}" NO CATÁLOGO</span>
        <span style="font-size:10px;color:var(--texto3);">e usar aqui</span>
       </div>`
    : `<div class="autocomplete-item" data-ed-idx="${i}">${m.codigo?`<span class="ac-codigo">${m.codigo}</span>`:''}<span class="ac-label">${m.desc}</span><span style="font-size:10px;color:var(--texto3);">${m.unidade}</span></div>`
  ).join('');
  list.querySelectorAll('.autocomplete-item').forEach((el, i) => {
    const selectItem = ev => {
      ev.preventDefault();
      if (top[i].cadastroRapido) { cadastroRapidoMaterial(top[i].desc, 'estoque'); return; }
      document.getElementById('entrada-desc').value = top[i].desc;
      document.getElementById('entrada-unidade').value = top[i].unidade;
      list.classList.add('hidden');
    };
    el.addEventListener('mousedown', selectItem);
    el.addEventListener('touchstart', selectItem, { passive: false });
  });
  list.classList.remove('hidden');
}

async function salvarEntradaDireta() {
  const desc = (document.getElementById('entrada-desc').value||'').toUpperCase().trim();
  const qtd = parseFloat(document.getElementById('entrada-qtd').value)||0;
  const unidade = (document.getElementById('entrada-unidade').value||'UN').toUpperCase();
  const preco = parseFloat(document.getElementById('entrada-preco').value)||0;
  const fornecedor = (document.getElementById('entrada-fornecedor').value||'').toUpperCase();
  const data = document.getElementById('entrada-data').value;
  const obs = (document.getElementById('entrada-obs').value||'').toUpperCase();
  const destinoObra = document.getElementById('btn-destino-estoque').dataset.ativo !== '1';
  const obraId = document.getElementById('entrada-obra-id').value;
  const obraObj = obras.find(o => o.id === obraId);
  if (!desc) { showToast('⚠ Informe o material.'); return; }
  if (qtd <= 0) { showToast('⚠ Informe a quantidade.'); return; }
  if (destinoObra && (!preco || preco <= 0)) { showToast('⚠ Valor unitário obrigatório para lançamento em obra.'); document.getElementById('entrada-preco').focus(); return; }
  if (destinoObra && !obraId) { showToast('⚠ Selecione a obra.'); return; }
  const etapaVal = document.getElementById('entrada-etapa')?.value || '';
  if (destinoObra && !etapaVal) { showToast('⚠ Selecione o centro de custo (etapa).'); document.getElementById('entrada-etapa')?.focus(); return; }
  try {
    if (destinoObra && obraObj) {
      // DIRETO NA OBRA — não gera estoque, só lançamento de custo
      const valor = qtd * preco;
      const etapa = document.getElementById('entrada-etapa')?.value || '';
      const [lanc] = await sbPost('lancamentos', { obra_id: obraId, descricao: desc + (fornecedor ? ` · ${fornecedor}` : ''), qtd, preco, total: valor, data, obs: obs || 'ENTRADA DIRETA SEM NF', etapa });
      lancamentos.unshift(lanc);
      showToast(`✅ ${qtd} ${unidade} de ${desc} → ${obraObj.nome}!`);
    } else {
      // ESTOQUE — entra no estoque, distribui depois
      const [nova] = await sbPost('entradas_diretas', { item_desc: desc, unidade, qtd, preco, fornecedor, data, obs, obra: 'EDR' });
      entradasDiretas.unshift(nova);
      showToast(`✅ ${qtd} ${unidade} de ${desc} no estoque!`);
    }
    fecharModal('entrada');
    renderEstoque();
    renderDashboard();
    filtrarLanc();
  } catch(e) { console.error(e); showToast('❌ Não foi possível registrar. Execute o SQL no Setup.'); }
}

// ── SAÍDA / BAIXA DE ESTOQUE ──────────────────────────────
function abrirSaidaMaterial(descPreenchida, unidadePreenchida) {
  // Popular selects
  const obraSelect = document.getElementById('saida-obra');
  obraSelect.innerHTML = '<option value="">— Selecione a obra —</option>' +
    obras.map(o => `<option value="${o.id}">${o.nome}</option>`).join('');
  document.getElementById('saida-etapa').innerHTML = etapaSelectOpts('', false);
  // Data de hoje
  const hoje = hojeISO();
  document.getElementById('saida-data').value = hoje;
  // Limpar campos
  document.getElementById('saida-desc').value = descPreenchida || '';
  document.getElementById('saida-qtd').value = '';
  document.getElementById('saida-obs').value = '';
  if (unidadePreenchida) document.getElementById('saida-unidade').value = unidadePreenchida;
  document.getElementById('ac-saida-list').classList.add('hidden');
  document.getElementById('modal-saida').classList.remove('hidden');
  // Se veio com material, foca direto na quantidade
  if (descPreenchida) {
    setTimeout(() => document.getElementById('saida-qtd').focus(), 100);
  } else {
    setTimeout(() => document.getElementById('saida-desc').focus(), 100);
  }
}

function onSaidaDescInput() {
  const val = document.getElementById('saida-desc').value.toUpperCase().trim();
  const list = document.getElementById('ac-saida-list');
  if (val.length < 2) { list.classList.add('hidden'); return; }

  // Montar mapa de saldo real por chave de estoque
  const saldoMap = {};
  consolidarEstoque().forEach(m => { saldoMap[getEstoqueKey(m.desc)] = m.saldoTotal; });

  // Buscar APENAS no catálogo (itens com código)
  const matches = catalogoMateriais
    .filter(m => m.codigo && m.nome.toUpperCase().includes(val))
    .slice(0, 8)
    .map(m => {
      const saldo = saldoMap[getEstoqueKey(m.nome)] || 0;
      return { ...m, saldo };
    });

  if (!matches.length) { list.classList.add('hidden'); return; }
  list.innerHTML = matches.map(m =>
    `<div class="autocomplete-item" onclick="selecionarSaidaItem('${esc(m.nome)}','${esc(m.unidade||'UN')}')">
      <span class="ac-cod">${m.codigo}</span>
      <span class="ac-label">${m.nome}</span>
      <span style="color:var(--texto3);font-size:10px;margin-left:auto">${m.saldo > 0 ? m.saldo.toFixed(2)+' '+m.unidade : '<span style="color:#f87171">sem saldo</span>'}</span>
    </div>`
  ).join('');
  list.classList.remove('hidden');
}

function selecionarSaidaItem(desc, unidade) {
  document.getElementById('saida-desc').value = desc;
  document.getElementById('saida-unidade').value = unidade;
  document.getElementById('ac-saida-list').classList.add('hidden');
  document.getElementById('saida-qtd').focus();
}

// Calcular saldo atual do estoque por item
function calcEstoqueAtual() {
  const mapa = {};
  // Entradas: NF + entradas diretas para estoque
  entradasDiretas.forEach(e => {
    const k = (e.item_desc||'').toUpperCase();
    if (!mapa[k]) mapa[k] = { qtd: 0, unidade: e.unidade||'UN' };
    mapa[k].qtd += parseFloat(e.qtd)||0;
  });
  // Saídas: distribuições
  distribuicoes.forEach(d => {
    const k = (d.item_desc||'').toUpperCase();
    if (!mapa[k]) mapa[k] = { qtd: 0, unidade: 'UN' };
    mapa[k].qtd -= parseFloat(d.qtd)||0;
  });
  return mapa;
}

async function salvarSaidaMaterial() {
  const desc = (document.getElementById('saida-desc').value||'').toUpperCase().trim();
  const qtd = parseFloat(document.getElementById('saida-qtd').value)||0;
  const unidade = document.getElementById('saida-unidade').value||'UN';
  const data = document.getElementById('saida-data').value;
  const obraId = document.getElementById('saida-obra').value;
  const etapa = document.getElementById('saida-etapa').value;
  const obs = (document.getElementById('saida-obs').value||'').toUpperCase();
  const obraObj = obras.find(o => o.id === obraId);

  if (!desc) { showToast('⚠ Informe o material.'); return; }
  if (qtd <= 0) { showToast('⚠ Informe a quantidade.'); return; }
  if (!obraId) { showToast('⚠ Selecione a obra destino.'); return; }
  if (!etapa) { showToast('⚠ Selecione o centro de custo.'); document.getElementById('saida-etapa').focus(); return; }

  // Verificar saldo disponível
  const estoqueItem = consolidarEstoque().find(m => m.desc.toUpperCase() === desc);
  const saldo = estoqueItem?.saldoTotal || 0;
  if (saldo < qtd) {
    if (!confirm(`⚠ Saldo em estoque: ${saldo.toFixed(2)} ${unidade}. Deseja registrar saída de ${qtd} mesmo assim?`)) return;
  }

  try {
    const valorUnit = estoqueItem?.valorMedio || 0;
    const valor = qtd * valorUnit;
    const [nova] = await sbPost('distribuicoes', {
      item_desc: desc, item_idx: -1,
      obra_id: obraId, obra_nome: obraObj?.nome || '',
      qtd, valor, data,
      etapa: etapa || ''
    });
    distribuicoes.unshift(nova);
    // Também gera lançamento de custo na obra se tiver valor
    if (valor > 0) {
      const [lanc] = await sbPost('lancamentos', {
        obra_id: obraId, descricao: desc,
        qtd, preco: valorUnit, total: valor, data,
        obs: obs || 'SAÍDA MANUAL DE ESTOQUE', etapa: etapa || ''
      });
      lancamentos.unshift(lanc);
    }
    showToast(`✅ Baixa de ${qtd} ${unidade} de ${desc} registrada!`);
    fecharModal('saida');
    renderEstoque();
    renderDashboard();
    filtrarLanc();
  } catch(e) { console.error(e); showToast('❌ Não foi possível registrar a saída.'); }
}
// ── AJUSTE DE ESTOQUE ─────────────────────────────────────
let ajusteTipoAtual = 'inventario';

function abrirAjusteEstoque() {
  ajusteTipoAtual = 'inventario';
  document.getElementById('ajuste-desc').value = '';
  document.getElementById('ajuste-qtd').value = '';
  document.getElementById('ajuste-unidade').value = '';
  document.getElementById('ajuste-motivo').value = '';
  document.getElementById('ajuste-saldo-atual').style.display = 'none';
  document.getElementById('ac-ajuste-list').classList.add('hidden');
  setTipoAjuste('inventario');
  document.getElementById('modal-ajuste').classList.remove('hidden');
  setTimeout(() => document.getElementById('ajuste-desc').focus(), 100);
}

function setTipoAjuste(tipo) {
  ajusteTipoAtual = tipo;
  const btns = { inventario: 'btn-ajuste-inventario', contagem: 'btn-ajuste-contagem', correcao: 'btn-ajuste-correcao' };
  const cores = { inventario: ['96,165,250', '#60a5fa'], contagem: ['46,204,113', 'var(--verde-hl)'], correcao: ['245,158,11', '#fbbf24'] };
  const infos = {
    inventario: 'Material que ja existia antes do sistema. Entra no saldo sem gerar custo.',
    contagem: 'Contagem fisica real. Informe a DIFERENCA (positiva ou negativa) em relacao ao saldo atual.',
    correcao: 'Correcao manual por erro de lancamento, perda ou extravio.'
  };
  const labels = { inventario: 'QUANTIDADE A ADICIONAR *', contagem: 'DIFERENCA (+ ou -) *', correcao: 'QUANTIDADE A AJUSTAR (+ ou -) *' };
  Object.entries(btns).forEach(([k, id]) => {
    const el = document.getElementById(id);
    if (k === tipo) {
      el.style.background = `rgba(${cores[k][0]},0.15)`;
      el.style.color = cores[k][1];
      el.style.borderColor = `rgba(${cores[k][0]},0.4)`;
    } else {
      el.style.background = 'transparent';
      el.style.color = 'var(--texto3)';
      el.style.borderColor = `rgba(${cores[k][0]},0.2)`;
    }
  });
  document.getElementById('ajuste-tipo-info').textContent = infos[tipo];
  document.getElementById('ajuste-qtd-label').textContent = labels[tipo];
}

function onAjusteDescInput() {
  const val = document.getElementById('ajuste-desc').value;
  const list = document.getElementById('ac-ajuste-list');
  if (!val || val.length < 2) { list.classList.add('hidden'); return; }
  const v = norm(val);
  const matches = catalogoMateriais
    .filter(m => norm(m.nome).includes(v))
    .sort((a, b) => { const na = norm(a.nome), nb = norm(b.nome); return (na.startsWith(v) ? 0 : 1) - (nb.startsWith(v) ? 0 : 1); })
    .slice(0, 10);
  if (!matches.length) { list.classList.add('hidden'); return; }
  list.innerHTML = matches.map(m =>
    `<div class="autocomplete-item" onclick="selecionarAjusteItem('${esc(m.nome)}','${esc(m.unidade || 'UN')}')">
      ${m.codigo ? `<span class="ac-codigo">${m.codigo}</span>` : ''}<span class="ac-label">${m.nome}</span><span style="font-size:10px;color:var(--texto3);">${m.unidade || 'UN'}</span>
    </div>`
  ).join('');
  list.classList.remove('hidden');
}

function selecionarAjusteItem(desc, unidade) {
  document.getElementById('ajuste-desc').value = desc;
  document.getElementById('ajuste-unidade').value = unidade;
  document.getElementById('ac-ajuste-list').classList.add('hidden');
  // Mostrar saldo atual
  const materiais = consolidarEstoque();
  const m = materiais.find(m => norm(m.desc) === norm(desc));
  const saldoEl = document.getElementById('ajuste-saldo-atual');
  if (m) {
    saldoEl.innerHTML = `Saldo atual no sistema: <strong style="color:var(--verde-hl);">${m.saldoTotal} ${m.unidade}</strong>`;
    saldoEl.style.display = 'block';
  } else {
    saldoEl.innerHTML = `Material sem saldo no sistema (será criado).`;
    saldoEl.style.display = 'block';
  }
  document.getElementById('ajuste-qtd').focus();
}

async function salvarAjusteEstoque() {
  const desc = (document.getElementById('ajuste-desc').value || '').toUpperCase().trim();
  const qtd = parseFloat(document.getElementById('ajuste-qtd').value) || 0;
  const unidade = (document.getElementById('ajuste-unidade').value || 'UN').toUpperCase();
  const motivo = (document.getElementById('ajuste-motivo').value || '').toUpperCase();
  if (!desc) { showToast('⚠ Informe o material.'); return; }
  if (qtd === 0) { showToast('⚠ Informe a quantidade.'); return; }
  if (ajusteTipoAtual === 'inventario' && qtd < 0) { showToast('⚠ Inventário inicial deve ser positivo.'); return; }
  const label = { inventario: 'Inventário inicial', contagem: 'Contagem física', correcao: 'Correção manual' }[ajusteTipoAtual];
  if (!confirm(`Confirma ${label}: ${qtd > 0 ? '+' : ''}${qtd} ${unidade} de ${desc}?`)) return;
  try {
    const [novo] = await sbPost('ajustes_estoque', {
      item_desc: desc, unidade, qtd,
      tipo: ajusteTipoAtual,
      motivo: `${label}${motivo ? ' · ' + motivo : ''}`
    });
    ajustesEstoque.unshift(novo);
    showToast(`📋 Ajuste registrado: ${qtd > 0 ? '+' : ''}${qtd} ${unidade} de ${desc}`);
    fecharModal('ajuste');
    renderEstoque();
    renderDashboard();
  } catch (e) { console.error(e); showToast('❌ Não foi possível registrar o ajuste. Execute o SQL no Setup.'); }
}

function toggleBnavMore() {
  document.getElementById('bnav-more-menu').classList.toggle('open');
}
function closeBnavMore() {
  document.getElementById('bnav-more-menu')?.classList.remove('open');
}
function syncBnav(v) {
  ['dashboard','obras','estoque','notas'].forEach(id => {
    const btn = document.getElementById('bnav-' + id);
    if (btn) btn.classList.toggle('active', id === v);
  });
  const moreActive = ['form','creditos','catalogo','banco','setup','relatorio'].includes(v);
  document.getElementById('bnav-more-btn')?.classList.toggle('active', moreActive);
  ['form','creditos','catalogo','banco','setup'].forEach(id => {
    const btn = document.getElementById('bnav-' + id);
    if (btn) btn.classList.toggle('active', id === v);
  });
}
document.addEventListener('click', e => {
  if (!e.target.closest('#bnav-more-menu') && !e.target.closest('#bnav-more-btn')) closeBnavMore();
});

function closeModalOutside(e, w) { if (e.target === document.getElementById(`modal-${w}`)) fecharModal(w); }

function showToast(msg, duracao) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  // Erros/avisos ficam mais tempo (5s), sucesso 3s
  if (!duracao) duracao = /⚠|ERRO|❌|FALHA/i.test(msg) ? 5000 : 3000;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add('hidden'), duracao);
}
