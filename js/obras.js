// ── CATS: fonte única de categorias ──────────────────────────────
// Derivado do CATS_ESTOQUE (definido abaixo). Inicializado após CATS_ESTOQUE.
// fn recebe o objeto lançamento (r) e testa r.descricao normalizado.
let CATS = {}; // preenchido em initCATS()
function initCATS() {
  CATS = {};
  // Mão de obra — separado pois não está no CATS_ESTOQUE
  CATS['mao'] = { lb: '👷 Mão de Obra', fn: r => /m[aã]o[\s\-]de[\s\-]obra|armador|eletricista|pintor|pedreiro|servente|mestre de obras|encanador|azulejista/i.test(r.descricao) };
  CATS['doc'] = { lb: '📋 Documentação', fn: r => /contrato|documento|art |anotac|registro de contrato|orcamento|alvara|licenca|projeto|vistoria|escritura/i.test(r.descricao) };
  CATS['terreno'] = { lb: '🏡 Terreno', fn: r => /terreno|aquisicao de terreno|compra de terreno|area|lote/i.test(r.descricao) };
  // Demais categorias espelham CATS_ESTOQUE com chave normalizada
  const keyMap = { 'aco':'ferro' }; // aco→ferro para manter compatibilidade com dados existentes
  CATS_ESTOQUE.forEach(cat => {
    const key = keyMap[cat.key] || cat.key;
    CATS[key] = { lb: cat.lb, fn: r => cat.fn((r.descricao||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')) };
  });
}

function renderObrasView() {
  document.getElementById('obras-loading')?.classList.add('hidden');
  // Popular select de filtro de centro de custo a partir do ETAPAS
  const selCatFiltro = document.getElementById('obras-filtro-cat');
  if (selCatFiltro && selCatFiltro.options.length <= 1) {
    selCatFiltro.innerHTML = '<option value="">Todos centros de custo</option>' + ETAPAS.map(e => `<option value="${e.key}">${e.lb}</option>`).join('');
  }
  // Chips de categoria
  const chipsEl = document.getElementById('obras-chips');
  if (chipsEl) {
    chipsEl.innerHTML = Object.entries(CATS).map(([k,v]) =>
      `<div class="cat-chip ${catFiltroAtual===k?'ativo':''}" onclick="toggleCat('${k}')">${v.lb}</div>`
    ).join('') + `<div class="cat-chip ${catFiltroAtual===null?'':'ativo'}" onclick="toggleCat(null)">✕ Limpar</div>`;
  }
  // Mostrar visão de cards por padrão, esconder detalhe
  document.getElementById('obras-cards-overview').style.display = '';
  document.getElementById('obras-sticky').style.display = 'none';
  document.getElementById('obras-tab-content-lanc').style.display = 'none';
  document.getElementById('obras-tab-content-mat').style.display = 'none';
  renderObrasCards();
  aplicarPerfil();
}

let mostandoArquivadas = false;

function onChangeObraFiltro() {
  const sel = document.getElementById('obras-filtro-obra');
  const btn = document.getElementById('btn-arquivar-obra');
  if (btn) {
    if (sel.value && usuarioAtual?.perfil === 'admin') {
      btn.style.display = 'block';
      btn.textContent = mostandoArquivadas ? '🏗 REATIVAR' : '✅ CONCLUÍDA';
      btn.style.color = mostandoArquivadas ? '#4ade80' : '#fbbf24';
      btn.style.borderColor = mostandoArquivadas ? 'rgba(46,204,113,0.3)' : 'rgba(245,158,11,0.2)';
      btn.style.background = mostandoArquivadas ? 'rgba(46,204,113,0.08)' : 'rgba(245,158,11,0.08)';
    } else {
      btn.style.display = 'none';
    }
  }
  if (obraTabAtual === 'mat') renderObrasMateriais();
  else if (obraTabAtual === 'add' && typeof renderAdicionais === 'function') renderAdicionais();
  else filtrarLanc();
}

function onClickArquivarObra() {
  if (usuarioAtual?.perfil !== 'admin') return;
  const obraId = document.getElementById('obras-filtro-obra').value;
  if (!obraId) return;
  const arquivar = !mostandoArquivadas;
  if (arquivar) {
    // Abrir modal de conclusão
    abrirModalConclusao(obraId);
    return;
  }
  arquivarObra(obraId, false);
  document.getElementById('obras-filtro-obra').value = '';
  document.getElementById('btn-arquivar-obra').style.display = 'none';
}

function toggleObrasArquivadas() {
  if (usuarioAtual?.perfil !== 'admin') return;
  mostandoArquivadas = !mostandoArquivadas;
  const btn = document.getElementById('btn-ver-arquivadas');
  if (mostandoArquivadas) {
    btn.style.background = 'rgba(245,158,11,0.18)';
    btn.textContent = '🏗 VER ATIVAS';
  } else {
    btn.style.background = 'rgba(245,158,11,0.08)';
    btn.textContent = '📋 VER CONCLUÍDAS';
  }
  // Sincronizar botão da visão de cards
  const btn2 = document.getElementById('btn-ver-arquivadas2');
  if (btn2) {
    if (mostandoArquivadas) {
      btn2.style.background = 'rgba(245,158,11,0.18)';
      btn2.textContent = '🏗 VER ATIVAS';
    } else {
      btn2.style.background = 'rgba(245,158,11,0.08)';
      btn2.textContent = '📋 VER CONCLUÍDAS';
    }
  }
  // Resetar select e recarregar opções
  document.getElementById('obras-filtro-obra').value = '';
  document.getElementById('btn-arquivar-obra').style.display = 'none';
  populateSelects();
  renderObrasCards();
  filtrarLanc();
}

// Renderiza os cards de visão geral das obras
function renderObrasCards() {
  const el = document.getElementById('obras-cards-grid');
  if (!el) return;
  const pool = mostandoArquivadas ? obrasArquivadas : obras;

  if (!pool.length) {
    el.innerHTML = '<div class="empty" style="grid-column:1/-1;">Nenhuma obra ' + (mostandoArquivadas ? 'concluída' : 'ativa') + '.</div>';
    return;
  }

  el.innerHTML = pool.map(o => {
    const ls = lancamentos.filter(l => l.obra_id === o.id);
    const total = ls.reduce((s, l) => s + Number(l.total || 0), 0);
    const ultimaData = ls.length ? ls.sort((a, b) => (b.data || '').localeCompare(a.data || ''))[0]?.data : null;
    const ultimaStr = ultimaData ? fmtData(ultimaData) : 'Sem lançamentos';
    const adds = typeof getAdicionaisObra === 'function' ? getAdicionaisObra(o.id) : { qtd:0, valorTotal:0, totalRecebido:0, saldo:0 };

    // Top 3 etapas por valor
    const porEtapa = {};
    ls.forEach(l => {
      const k = l.etapa || '36_outros';
      porEtapa[k] = (porEtapa[k] || 0) + Number(l.total || 0);
    });
    const topEtapas = Object.entries(porEtapa)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    // Valor só visível para admin
    const valorHtml = usuarioAtual?.perfil === 'admin'
      ? `<div style="font-size:16px;font-weight:800;color:var(--verde-hl);font-family:'JetBrains Mono',monospace;">${fmtR(total)}</div>`
      : '';
    const addHtml = usuarioAtual?.perfil === 'admin' && adds.qtd > 0
      ? `<div style="font-size:10px;color:#a78bfa;margin-top:2px;">📝 ${adds.qtd} adicional(is): ${fmtR(adds.valorTotal)}</div>`
      : '';

    return `<div class="card" style="padding:16px;cursor:pointer;transition:all .2s;border:1px solid var(--borda);"
                 onclick="obrasAbrirDetalhe('${o.id}')"
                 onmouseover="this.style.borderColor='rgba(46,204,113,0.4)'"
                 onmouseout="this.style.borderColor='var(--borda)'">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">
        <div>
          <div style="font-size:15px;font-weight:700;color:var(--branco);font-family:'Rajdhani',sans-serif;letter-spacing:0.5px;">${o.nome}</div>
          <div style="font-size:11px;color:var(--texto3);margin-top:2px;">📍 ${o.cidade || 'Sem cidade'}</div>
        </div>
        <div style="text-align:right;">
          ${valorHtml}
          ${addHtml}
          <div style="font-size:10px;color:var(--texto3);margin-top:2px;">${ls.length} lançamento${ls.length !== 1 ? 's' : ''}</div>
        </div>
      </div>
      ${topEtapas.length > 0 ? `<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px;">
        ${topEtapas.map(([k, v]) => {
          const pct = total > 0 ? (v / total * 100).toFixed(0) : 0;
          const lbl = ETAPAS.find(e => e.key === k)?.lb || '📦 Outros';
          return `<span style="font-size:9px;background:rgba(46,204,113,0.08);color:var(--verde3);border:1px solid rgba(46,204,113,0.15);border-radius:4px;padding:2px 6px;">${lbl.split(' ').slice(0, 2).join(' ')} ${pct}%</span>`;
        }).join('')}
      </div>` : ''}
      <div style="display:flex;justify-content:space-between;align-items:center;padding-top:8px;border-top:1px solid rgba(46,204,113,0.06);">
        <span style="font-size:10px;color:var(--texto3);">📅 Último: ${ultimaStr}</span>
        <div style="display:flex;align-items:center;gap:8px;">
          ${usuarioAtual?.perfil === 'admin' ? `<button onclick="event.stopPropagation();abrirModalObra('${o.id}')" style="background:rgba(59,130,246,0.08);border:1px solid rgba(59,130,246,0.2);color:#60a5fa;border-radius:6px;padding:3px 10px;font-size:10px;font-family:'Rajdhani',sans-serif;font-weight:700;cursor:pointer;">✏ EDITAR</button>` : ''}
          ${usuarioAtual?.perfil === 'admin' ? (mostandoArquivadas
            ? `${o.slug_entrega ? `<button onclick="event.stopPropagation();abrirEntregaDigital('${o.slug_entrega}')" style="background:rgba(201,168,76,0.1);border:1px solid rgba(201,168,76,0.3);color:#c9a84c;border-radius:6px;padding:3px 10px;font-size:10px;font-family:'Rajdhani',sans-serif;font-weight:700;cursor:pointer;">📦 ENTREGA</button>` : ''}
               <button onclick="event.stopPropagation();reimprimirTermo('${o.id}')" style="background:rgba(139,92,246,0.08);border:1px solid rgba(139,92,246,0.2);color:#a78bfa;border-radius:6px;padding:3px 10px;font-size:10px;font-family:'Rajdhani',sans-serif;font-weight:700;cursor:pointer;">📄 TERMO</button>
               <button onclick="event.stopPropagation();arquivarObraCard('${o.id}',false)" style="background:rgba(46,204,113,0.08);border:1px solid rgba(46,204,113,0.2);color:#4ade80;border-radius:6px;padding:3px 10px;font-size:10px;font-family:'Rajdhani',sans-serif;font-weight:700;cursor:pointer;">🏗 REATIVAR</button>`
            : `<button onclick="event.stopPropagation();arquivarObraCard('${o.id}',true)" style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.2);color:#fbbf24;border-radius:6px;padding:3px 10px;font-size:10px;font-family:'Rajdhani',sans-serif;font-weight:700;cursor:pointer;">✅ CONCLUIR</button>`
          ) : ''}
          <span style="font-size:10px;color:var(--verde-hl);font-weight:600;">DETALHES →</span>
        </div>
      </div>
    </div>`;
  }).join('');
}

// Abre a visão detalhada de uma obra específica
function obrasAbrirDetalhe(obraId) {
  document.getElementById('obras-cards-overview').style.display = 'none';
  document.getElementById('obras-sticky').style.display = '';
  document.getElementById('obras-tab-content-lanc').style.display = '';
  // Selecionar a obra no filtro
  const sel = document.getElementById('obras-filtro-obra');
  if (sel) sel.value = obraId;
  onChangeObraFiltro();
  if (obraTabAtual === 'mat') renderObrasMateriais();
  else filtrarLanc();
}

// Volta para a visão de cards (overview)
function obrasVoltarCards() {
  document.getElementById('obras-cards-overview').style.display = '';
  document.getElementById('obras-sticky').style.display = 'none';
  document.getElementById('obras-tab-content-lanc').style.display = 'none';
  document.getElementById('obras-tab-content-mat').style.display = 'none';
  const addTab = document.getElementById('obras-tab-content-add');
  if (addTab) addTab.style.display = 'none';
  document.getElementById('obras-detalhe').classList.add('hidden');
  const sel = document.getElementById('obras-filtro-obra');
  if (sel) sel.value = '';
  renderObrasCards();
}

async function arquivarObra(obraId, arquivar) {
  if (usuarioAtual?.perfil !== 'admin') return;
  if (arquivar) {
    abrirModalConclusao(obraId);
    return;
  }
  if (!confirm('Deseja reabrir esta obra?')) return;
  try {
    await sbPatch('obras', `?id=eq.${obraId}`, { arquivada: false });
    await loadObras();
    populateSelects();
    filtrarLanc();
    renderDashboard();
    showToast('🔄 OBRA REABERTA!');
  } catch(e) { showToast('ERRO AO ATUALIZAR OBRA.'); }
}

async function arquivarObraCard(obraId, arquivar) {
  if (usuarioAtual?.perfil !== 'admin') return;
  const obra = [...obras, ...obrasArquivadas].find(o => o.id === obraId);
  const nome = obra?.nome || 'esta obra';
  if (arquivar) {
    // Abrir modal de conclusão ao invés de confirm simples
    abrirModalConclusao(obraId);
    return;
  }
  // Reativar — confirm simples
  if (!confirm(`Reativar "${nome}"?`)) return;
  try {
    await sbPatch('obras', `?id=eq.${obraId}`, { arquivada: false });
    await loadObras();
    populateSelects();
    renderObrasCards();
    renderDashboard();
    showToast(`🔄 "${nome}" reativada!`);
  } catch(e) { showToast('ERRO AO ATUALIZAR OBRA.'); }
}

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
  // Auto-sugerir slug a partir do nome da obra (ex: "CASA GILMARA" → "gilmara")
  const slugExistente = obra.slug_entrega || '';
  const slugSugerido = slugExistente || gerarSlug(obra.nome.replace(/^(CASA|RESID[ÊE]NCIA|PROJ\.?|PROJETO)\s+/i, ''));
  document.getElementById('concluir-slug').value = slugSugerido;
  document.getElementById('modal-concluir-obra').classList.remove('hidden');
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
  // Validação
  if (!proprietario) { showToast('INFORME O NOME DO PROPRIETÁRIO.'); return; }
  if (!cpf) { showToast('INFORME O CPF DO PROPRIETÁRIO.'); return; }
  if (!dataEntrega) { showToast('INFORME A DATA DE ENTREGA.'); return; }
  if (!rua) { showToast('INFORME A RUA / LOGRADOURO.'); return; }
  if (!numero) { showToast('INFORME O NÚMERO / LOTE.'); return; }
  if (!bairro) { showToast('INFORME O BAIRRO.'); return; }
  if (!cidade) { showToast('INFORME A CIDADE.'); return; }
  const slug_entrega = (document.getElementById('concluir-slug').value || '').toLowerCase().trim().replace(/\s+/g, '-');
  const obra = [...obras, ...obrasArquivadas].find(o => o.id === obraId);
  const nome = obra?.nome || 'Obra';
  if (!confirm(`Concluir "${nome}" e gerar o Termo de Entrega?`)) return;
  try {
    await sbPatch('obras', `?id=eq.${obraId}`, {
      arquivada: true,
      proprietario, contratante: proprietario, cpf_contratante: cpf,
      endereco_rua: rua, endereco_numero: numero, endereco_bairro: bairro,
      cidade, endereco_cep: cep, slug_entrega
    });
    // Gerar termo
    gerarTermoEntrega({ proprietario, cpf, dataEntrega, rua, numero, bairro, cidade, modelo: nome });
    await loadObras();
    populateSelects();
    renderObrasCards();
    renderDashboard();
    fecharModal('concluir-obra');
    showToast(`✅ "${nome}" concluída! Termo aberto em nova aba.`);
  } catch(e) { showToast('ERRO AO CONCLUIR OBRA.'); console.error(e); }
}

function gerarTermoEntrega(dados) {
  localStorage.setItem('edr-termo-dados', JSON.stringify(dados));
  window.open('termo-entrega.html', '_blank');
}

function reimprimirTermo(obraId) {
  const obra = [...obras, ...obrasArquivadas].find(o => o.id === obraId);
  if (!obra) return;
  if (!obra.proprietario && !obra.contratante) {
    showToast('DADOS INCOMPLETOS. EDITE A OBRA ANTES.');
    return;
  }
  gerarTermoEntrega({
    proprietario: obra.proprietario || obra.contratante || '',
    cpf: obra.cpf_contratante || '',
    dataEntrega: obra.criado_em ? obra.criado_em.split('T')[0] : '',
    rua: obra.endereco_rua || '',
    numero: obra.endereco_numero || '',
    bairro: obra.endereco_bairro || '',
    cidade: obra.cidade || '',
    modelo: obra.nome || ''
  });
}

let obraTabAtual = 'lanc';
function obrasSwitchTab(tab) {
  obraTabAtual = tab;
  const tabs = ['lanc','mat','add'];
  tabs.forEach(t => {
    const btn = document.getElementById('obras-tab-' + t);
    const cont = document.getElementById('obras-tab-content-' + t);
    if (btn) { btn.style.borderBottomColor = t === tab ? 'var(--verde-hl)' : 'transparent'; btn.style.color = t === tab ? 'var(--verde-hl)' : 'var(--texto3)'; }
    if (cont) cont.style.display = t === tab ? 'block' : 'none';
  });
  if (tab === 'mat') renderObrasMateriais();
  if (tab === 'add' && typeof renderAdicionais === 'function') renderAdicionais();
}

function renderObrasMateriais() {
  const obraId = document.getElementById('obras-filtro-obra').value;
  const el = document.getElementById('obras-mat-lista');
  if (!el) return;

  // Filtrar distribuições da obra selecionada
  const dists = distribuicoes.filter(d => !obraId || d.obra_id === obraId);

  if (!dists.length) {
    el.innerHTML = `<div class="empty">Nenhuma movimentação de material encontrada${obraId ? ' nesta obra' : ''}.</div>`;
    return;
  }

  // Agrupar por material
  const porMat = {};
  dists.forEach(d => {
    const key = (d.item_desc||'').toUpperCase();
    if (!porMat[key]) porMat[key] = { desc: d.item_desc, registros: [] };
    porMat[key].registros.push(d);
  });

  const isAdmin = usuarioAtual?.perfil === 'admin';

  el.innerHTML = Object.values(porMat)
    .sort((a,b) => a.desc.localeCompare(b.desc))
    .map(m => {
      const totalQtd = m.registros.reduce((s,d) => s + Number(d.qtd), 0);
      const totalVal = m.registros.reduce((s,d) => s + Number(d.valor||0), 0);
      const rows = m.registros
        .sort((a,b) => (b.data||'').localeCompare(a.data||''))
        .map(d => {
          const obra = obraId ? '' : `<span style="font-size:10px;color:var(--verde3);background:rgba(46,204,113,0.08);border:1px solid rgba(46,204,113,0.15);border-radius:4px;padding:1px 6px;">${d.obra_nome||'—'}</span>`;
          const etiqueta = d.item_idx === -1
            ? `<span style="font-size:9px;color:#fbbf24;background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.25);border-radius:4px;padding:1px 5px;">SAÍDA MANUAL</span>`
            : `<span style="font-size:9px;color:#60a5fa;background:rgba(59,130,246,0.08);border:1px solid rgba(59,130,246,0.2);border-radius:4px;padding:1px 5px;">DISTRIBUÇÃO</span>`;
          return `<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 12px;border-top:1px solid var(--borda);gap:8px;flex-wrap:wrap;">
            <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
              <span style="font-size:11px;color:var(--texto2)">${d.data||'—'}</span>
              ${etiqueta} ${obra}
              ${d.etapa ? `<span style="font-size:9px;color:var(--texto3)">${etapaLabel(d.etapa)}</span>` : ''}
            </div>
            <div style="display:flex;gap:12px;align-items:center;">
              <span style="font-weight:700;color:var(--branco)">${Number(d.qtd).toFixed(2)}</span>
              ${isAdmin && d.valor > 0 ? `<span style="color:var(--verde-hl);font-family:'JetBrains Mono',monospace;font-size:11px">${fmtR(d.valor)}</span>` : ''}
            </div>
          </div>`;
        }).join('');

      return `<div style="background:var(--bg2);border:1px solid var(--borda);border-radius:10px;margin-bottom:10px;overflow:hidden;">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:rgba(46,204,113,0.04);">
          <span style="font-weight:700;color:var(--branco);font-size:13px;">${m.desc}</span>
          <div style="display:flex;gap:12px;align-items:center;">
            <span style="font-size:11px;color:var(--texto3)">${m.registros.length} mov.</span>
            <span style="font-weight:800;color:var(--roxo)">${totalQtd.toFixed(2)}</span>
            ${isAdmin && totalVal > 0 ? `<span style="color:var(--verde-hl);font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:700">${fmtR(totalVal)}</span>` : ''}
          </div>
        </div>
        ${rows}
      </div>`;
    }).join('');
}

function toggleCat(k) {
  catFiltroAtual = catFiltroAtual === k ? null : k;
  // Sincronizar com o select
  const sel = document.getElementById('obras-filtro-cat');
  if (sel) sel.value = catFiltroAtual || '';
  renderObrasView();
}
function filtrarLancCat() {
  const sel = document.getElementById('obras-filtro-cat');
  catFiltroAtual = sel?.value || null;
  // Sincronizar chips
  document.querySelectorAll('#obras-chips .cat-chip').forEach(el => {
    const k = el.getAttribute('onclick')?.match(/'([^']+)'/)?.[1];
    if (k) el.classList.toggle('ativo', k === catFiltroAtual);
  });
  filtrarLanc();
}

function filtrarLanc() {
  // Se os elementos da aba não existem no DOM ainda, sai sem erro
  if (!document.getElementById('obras-lanc-lista')) return;
  const busca = norm(document.getElementById('obras-busca')?.value || '');
  // Pool correto conforme modo (ativas ou concluídas)
  const obraPool = mostandoArquivadas ? obrasArquivadas : obras;
  const obraIds = new Set(obraPool.map(o => o.id));
  const obraId = document.getElementById('obras-filtro-obra')?.value || '';
  // SEMPRE filtrar pelo pool — nunca misturar ativas com concluídas
  let lista = lancamentos.filter(l => obraIds.has(l.obra_id));
  if (busca) lista = lista.filter(l => norm(l.descricao||'').includes(busca));
  if (obraId) lista = lista.filter(l => l.obra_id === obraId);
  if (catFiltroAtual) lista = lista.filter(l => resolveEtapaKey(l.etapa || '36_outros') === catFiltroAtual);
  const el = document.getElementById('obras-lanc-lista'), empty = document.getElementById('obras-empty');
  if (!el || !empty) return;
  if (!lista.length) { el.innerHTML = ''; empty.classList.remove('hidden');
    document.getElementById('obras-total-filtro')?.classList.add('hidden'); return; }
  empty.classList.add('hidden');
  const totalFiltrado = lista.reduce((s,l) => s + Number(l.total||0), 0);
  const totalEl = document.getElementById('obras-total-filtro');
  const nFiltros = (obraId ? 1 : 0) + (catFiltroAtual ? 1 : 0) + (busca ? 1 : 0);
  totalEl.classList.remove('hidden');
  const totalQtd = lista.reduce((s,l) => s + Number(l.qtd||0), 0);
  const unidades = [...new Set(lista.map(l => l.unidade).filter(Boolean))];
  const unStr = unidades.length === 1 ? unidades[0] : unidades.length > 1 ? 'un. mistas' : 'un.';
  totalEl.innerHTML = `
    <span style="color:var(--texto2);font-size:11px;">${lista.length} lançamento${lista.length!==1?'s':''} ${nFiltros>0?'filtrados':'no total'}</span>
    <div style="display:flex;gap:12px;align-items:center;">
      <span style="font-size:12px;color:var(--texto3);">Qtd: <strong style="color:var(--branco);">${totalQtd % 1 === 0 ? totalQtd : totalQtd.toFixed(2)} ${unStr}</strong></span>
      ${usuarioAtual?.perfil==='admin' ? `<span style="font-size:15px;font-weight:800;color:var(--verde-hl);">${fmtR(totalFiltrado)}</span>` : ''}
    </div>`;
  // obraMap inclui ativas + arquivadas para exibir nome corretamente
  const obraMap = {};
  [...obras, ...obrasArquivadas].forEach(o => obraMap[o.id] = o.nome);

  // DRE por centro de custo — baseado na etapa construtiva do lançamento
  const detEl = document.getElementById('obras-detalhe');
  if (detEl && obraId && usuarioAtual?.perfil === 'admin') {
    const todosLancObra = lancamentos.filter(l => l.obra_id === obraId);
    const porCat = {};
    todosLancObra.forEach(l => {
      const lb = etapaLabel(l.etapa || '36_outros');
      porCat[lb] = (porCat[lb] || 0) + Number(l.total || 0);
    });
    const totalObra = Object.values(porCat).reduce((s,v) => s+v, 0);
    const catsComValor = Object.entries(porCat).sort((a,b) => b[1] - a[1]);

    // Adicionais da obra
    const adds = typeof getAdicionaisObra === 'function' ? getAdicionaisObra(obraId) : { qtd:0, valorTotal:0, totalRecebido:0, saldo:0 };

    detEl.classList.add('hidden');
  } else if (detEl) {
    detEl.classList.add('hidden');
  }
  el.innerHTML = lista.map(l => `
    <div class="lanc-item">
      <div class="lanc-top">
        <div class="lanc-desc">${l.descricao}</div>
        <div style="display:flex;align-items:center;gap:4px;">
          <span class="lanc-val admin-only">${fmtR(l.total)}</span>
          <button class="lanc-del admin-only" onclick="excluirLanc('${l.id}')">🗑</button>
        </div>
      </div>
      ${l.etapa ? `<div style="margin-bottom:3px;"><span style="font-size:9px;font-weight:700;background:rgba(46,204,113,0.08);color:var(--verde3);border:1px solid rgba(46,204,113,0.2);border-radius:4px;padding:1px 6px;font-family:'JetBrains Mono',monospace;">${etapaLabel(l.etapa)}</span></div>` : ''}
      <div class="lanc-meta">${obraMap[l.obra_id]||'—'} · ${(()=>{ const q=Number(l.qtd||1); const oNome=(obraMap[l.obra_id]||'').toUpperCase(); if(oNome.includes('ESCRIT')||q<=0||String(l.qtd).includes('e')||q!==Math.round(q*100)/100) return l.data||''; return q+' un · '+(l.data||''); })()}${l.criado_por ? `<span class="admin-only" style="margin-left:6px;font-size:9px;color:var(--texto4);"> · 👤 ${l.criado_por}</span>` : ''}</div>
    </div>`).join('');
  aplicarPerfil();
}

// ══════════════════════════════════════════
// ETAPAS CONSTRUTIVAS — Centro de Custo
// ══════════════════════════════════════════
const ETAPAS = [
  { key:'01_acab',       lb:'✨ 01 · Acabamento Final' },
  { key:'02_aco',        lb:'⚙ 02 · Aço / Ferro' },
  { key:'03_alimentacao',lb:'🍽 03 · Alimentação' },
  { key:'04_alven',      lb:'🧱 04 · Alvenaria' },
  { key:'05_externo',    lb:'🌿 05 · Área Externa' },
  { key:'06_cobr',       lb:'🏠 06 · Cobertura' },
  { key:'07_combustivel',lb:'⛽ 07 · Combustível' },
  { key:'08_doc',        lb:'📋 08 · Documentação / Licenças' },
  { key:'09_elet',       lb:'⚡ 09 · Elétrica' },
  { key:'10_epi',        lb:'🦺 10 · EPI / Segurança' },
  { key:'11_esquad',     lb:'🪟 11 · Esquadrias' },
  { key:'12_esgoto',     lb:'🪠 12 · Esgoto' },
  { key:'13_estrut',     lb:'🔩 13 · Estrutura' },
  { key:'14_expediente', lb:'📎 14 · Expediente' },
  { key:'15_ferramenta', lb:'🔨 15 · Ferramentas' },
  { key:'16_forma',      lb:'🪵 16 · Forma e Madeira' },
  { key:'17_fund',       lb:'🏗 17 · Fundação' },
  { key:'18_generico',   lb:'❓ 18 · Genérico' },
  { key:'19_gesso',      lb:'⬜ 19 · Gesso' },
  { key:'20_granito',    lb:'🪨 20 · Granito / Pedra' },
  { key:'21_hidro',      lb:'🚿 21 · Hidráulica' },
  { key:'22_imobilizado',lb:'🖥 22 · Imobilizado' },
  { key:'23_impermeab',  lb:'💧 23 · Impermeabilização' },
  { key:'24_imposto',    lb:'🧾 24 · Impostos / Encargos' },
  { key:'25_limpeza',    lb:'🧹 25 · Limpeza' },
  { key:'26_locacao',    lb:'🏗 26 · Locação / Máq. / Equip.' },
  { key:'27_loucas',     lb:'🛁 27 · Louças e Metais' },
  { key:'28_mao',        lb:'👷 28 · Mão de Obra' },
  { key:'29_terra',      lb:'🌍 29 · Movimento de Terra' },
  { key:'30_pintura',    lb:'🖌 30 · Pintura' },
  { key:'31_prelim',     lb:'⛏ 31 · Serviços Preliminares' },
  { key:'32_revarg',     lb:'🪣 32 · Revestimento Argamassa' },
  { key:'33_revestc',    lb:'🟫 33 · Revestimento Cerâmico' },
  { key:'34_tecnologia', lb:'💻 34 · Tecnologia / Assinaturas' },
  { key:'35_terreno',    lb:'🏛 35 · Terreno' },
  { key:'36_outros',     lb:'📦 36 · Não classificado' },
];
function etapaLabel(key) {
  const resolved = typeof resolveEtapaKey === 'function' ? resolveEtapaKey(key) : key;
  return ETAPAS.find(e => e.key === resolved)?.lb || ETAPAS.find(e => e.key === key)?.lb || key || '—';
}
function etapaSelectOpts(selected='', incluiVazio=true) {
  const vazio = incluiVazio ? '<option value="">— Etapa (opcional) —</option>' : '';
  return vazio + ETAPAS.map(e => `<option value="${e.key}" ${selected===e.key?'selected':''}>${e.lb}</option>`).join('');
}

// Redireciona para F3 Entrada Direta com a obra pré-selecionada
function irParaAdicionais() {
  setView('obras');
  const obraId = document.getElementById('obras-filtro-obra')?.value || '';
  if (obraId) {
    // Obra já selecionada — ir direto pra aba Adicionais
    obrasSwitchTab('add');
  } else if (obras.length) {
    // Nenhuma obra selecionada — abrir a primeira e ir na aba Adicionais
    obrasAbrirDetalhe(obras[0].id);
    setTimeout(() => obrasSwitchTab('add'), 100);
  }
}

function irParaEntradaDireta() {
  const obraId = document.getElementById('obras-filtro-obra')?.value || '';
  setView('estoque');
  setTimeout(() => {
    abrirEntradaDireta();
    if (obraId) {
      setDestinoEntrada('obra');
      const sel = document.getElementById('entrada-obra-id');
      if (sel) sel.value = obraId;
    }
  }, 100);
}

async function excluirLanc(id) {
  if (!confirm('Excluir este lançamento?')) return;
  // Verificar se existe distribuição vinculada a este lançamento
  // Distribuições são vinculadas pelo lanc_id (se existir) ou pela combinação obra+desc+data
  const lanc = lancamentos.find(l => l.id === id);
  // Apagar distribuição correspondente (mesmo obra_id, item_desc, data)
  if (lanc) {
    const distVinculadas = distribuicoes.filter(d =>
      d.obra_id === lanc.obra_id &&
      norm(d.item_desc) === norm(lanc.descricao?.replace(/ · .*/,'') || '') &&
      d.data === lanc.data
    );
    for (const d of distVinculadas) {
      await sbDelete('distribuicoes', `?id=eq.${d.id}`);
      distribuicoes = distribuicoes.filter(x => x.id !== d.id);
    }
    if (distVinculadas.length > 0) {
      showToast(`✅ Lançamento e ${distVinculadas.length} distribuição(ões) revertidas — estoque restaurado.`);
    }
  }
  await sbDelete('lancamentos', `?id=eq.${id}`);
  lancamentos = lancamentos.filter(l => l.id !== id);
  filtrarLanc(); renderDashboard(); renderEstoque();
  if (!lanc || distribuicoes.filter(d => d.obra_id === lanc?.obra_id).length === 0)
    showToast('Lançamento excluído.');
}

async function salvarNovaObra() {
  const nome = (document.getElementById('nova-obra-nome').value||'').toUpperCase().trim();
  const cidade = (document.getElementById('nova-obra-cidade').value||'').trim();
  const valorVenda = parseFloat(document.getElementById('nova-obra-valor-venda').value) || 0;
  const contratante = (document.getElementById('nova-obra-contratante').value||'').toUpperCase().trim();
  const cpf_contratante = (document.getElementById('nova-obra-cpf').value||'').trim();
  const slug_entrega = (document.getElementById('nova-obra-slug').value||'').toLowerCase().trim().replace(/\s+/g,'-');
  const editId = document.getElementById('obra-edit-id').value;
  if (!nome) { showToast('INFORME O NOME DA OBRA.'); return; }
  try {
    const payload = { nome, cidade, valor_venda: valorVenda, contratante, cpf_contratante, slug_entrega };
    if (editId) {
      await sbPatch('obras', `?id=eq.${editId}`, payload);
      await loadObras();
      populateSelects(); renderDashboard(); renderObrasCards();
      showToast(`✅ OBRA "${nome}" ATUALIZADA!`);
    } else {
      const [nova] = await sbPost('obras', payload);
      obras.push(nova); obras.sort((a,b)=>a.nome.localeCompare(b.nome));
      populateSelects(); renderDashboard(); renderObrasCards();
      showToast(`✅ OBRA ${nome} CADASTRADA!`);
    }
    fecharModal('obra');
  } catch(e) { showToast('ERRO AO SALVAR.'); }
}

function abrirModalObra(obraId) {
  const obra = obraId ? [...obras, ...obrasArquivadas].find(o => o.id === obraId) : null;
  document.getElementById('obra-edit-id').value = obra ? obra.id : '';
  document.getElementById('nova-obra-nome').value = obra ? obra.nome : '';
  document.getElementById('nova-obra-cidade').value = obra ? (obra.cidade || '') : '';
  document.getElementById('nova-obra-valor-venda').value = obra ? (obra.valor_venda || '') : '';
  document.getElementById('nova-obra-contratante').value = obra ? (obra.contratante || '') : '';
  document.getElementById('nova-obra-cpf').value = obra ? (obra.cpf_contratante || '') : '';
  document.getElementById('nova-obra-slug').value = obra ? (obra.slug_entrega || '') : '';
  document.getElementById('modal-obra-titulo').textContent = obra ? '🏗 EDITAR OBRA' : '🏗 NOVA OBRA';
  document.getElementById('modal-obra').classList.remove('hidden');
  setTimeout(() => document.getElementById('nova-obra-nome').focus(), 100);
}

// URL base do site de entrega (dominio custom GitHub Pages)
const ENTREGA_BASE_URL = 'https://edreng.com.br/entrega';

function abrirEntregaDigital(slug) {
  window.open(`${ENTREGA_BASE_URL}/${slug}.html`, '_blank');
}

// ══════════════════════════════════════════
