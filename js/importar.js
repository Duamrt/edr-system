// ══════════════════════════════════════════
// IMPORTAÇÃO RÁPIDA DE ITENS (NF)
// ══════════════════════════════════════════
let importItensPreview = [];

function abrirImportRapida() {
  document.getElementById('import-texto').value = '';
  document.getElementById('import-preview').innerHTML = '';
  document.getElementById('import-preview-wrap').classList.add('hidden');
  document.getElementById('import-btn-confirmar').classList.add('hidden');
  document.getElementById('import-instrucoes').classList.remove('hidden');
  document.getElementById('modal-import').classList.remove('hidden');
  importItensPreview = [];
  setTimeout(() => document.getElementById('import-texto').focus(), 100);
}

// ── PARSER: interpreta texto colado ──────────────────────────
function parseTextoImport(texto) {
  const linhas = texto.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const itens = [];

  for (const linha of linhas) {
    const item = parseLinha(linha);
    if (item) itens.push(item);
  }
  return itens;
}

function parseLinha(linha) {
  // Tenta vários formatos:
  // 1. Tab-separated: DESC\tQTD\tPRECO
  // 2. Semicolon: DESC;QTD;PRECO
  // 3. Pipe: DESC|QTD|PRECO
  // 4. Espaços com números no final: DESC    20    32,50
  // 5. Apenas descrição (sem qtd/preço)

  let parts = null;

  // Tab-separated
  if (linha.includes('\t')) {
    parts = linha.split('\t').map(p => p.trim()).filter(p => p);
  }
  // Semicolon
  else if (linha.includes(';')) {
    parts = linha.split(';').map(p => p.trim()).filter(p => p);
  }
  // Pipe
  else if (linha.includes('|')) {
    parts = linha.split('|').map(p => p.trim()).filter(p => p);
  }

  if (parts && parts.length >= 1) {
    return extrairDeParts(parts);
  }

  // Espaços: tentar separar descrição dos números no final
  // Ex: "CIMENTO CP-II 50KG    20    32,50"
  // Ex: "CIMENTO CP-II 50KG    20 SC    32,50"
  const regexNumFinal = /^(.+?)\s{2,}(\d+[.,]?\d*)\s*([A-Za-zÀ-ÿ²³]*)\s+(\d+[.,]\d+)\s*$/;
  const matchNum = linha.match(regexNumFinal);
  if (matchNum) {
    return {
      descOriginal: matchNum[1].trim().toUpperCase(),
      qtd: parseNumBR(matchNum[2]),
      unidade: (matchNum[3] || '').toUpperCase() || 'UN',
      preco: parseNumBR(matchNum[4])
    };
  }

  // Dois números no final (sem unidade)
  const regexDoisNum = /^(.+?)\s{2,}(\d+[.,]?\d*)\s+(\d+[.,]\d+)\s*$/;
  const matchDois = linha.match(regexDoisNum);
  if (matchDois) {
    return {
      descOriginal: matchDois[1].trim().toUpperCase(),
      qtd: parseNumBR(matchDois[2]),
      unidade: 'UN',
      preco: parseNumBR(matchDois[3])
    };
  }

  // Apenas descrição (sem números)
  if (linha.length > 2) {
    return {
      descOriginal: linha.toUpperCase(),
      qtd: 1,
      unidade: 'UN',
      preco: 0
    };
  }

  return null;
}

function extrairDeParts(parts) {
  const desc = (parts[0] || '').toUpperCase().trim();
  if (!desc) return null;

  let qtd = 1, unidade = 'UN', preco = 0;

  if (parts.length >= 3) {
    // DESC ; QTD ; PRECO  ou  DESC ; QTD UN ; PRECO
    const qtdPart = parts[1].trim();
    const qtdMatch = qtdPart.match(/^(\d+[.,]?\d*)\s*([A-Za-zÀ-ÿ²³]*)/);
    if (qtdMatch) {
      qtd = parseNumBR(qtdMatch[1]);
      if (qtdMatch[2]) unidade = qtdMatch[2].toUpperCase();
    }
    preco = parseNumBR(parts[2]);
  } else if (parts.length === 2) {
    // DESC ; QTD (sem preço)
    qtd = parseNumBR(parts[1]) || 1;
  }

  return { descOriginal: desc, qtd, unidade, preco };
}

function parseNumBR(str) {
  if (!str) return 0;
  let s = String(str).trim();
  // "1.250,50" → "1250.50"  |  "32,50" → "32.50"  |  "32.50" → "32.50"
  if (s.includes(',') && s.includes('.')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (s.includes(',')) {
    s = s.replace(',', '.');
  }
  return parseFloat(s) || 0;
}

// ── MATCH com catálogo ──────────────────────────────────────
function limparParaMatch(str) {
  let s = norm(str);
  // Remove código numérico do início (ex: "000001 · ")
  s = s.replace(/^\d{4,6}\s*[·\-]?\s*/, '');
  // Normaliza separadores
  s = s.replace(/[·\/]/g, ' ');
  // Remove espaços duplos
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

function matchCatalogo(descOriginal) {
  const inputLimpo = limparParaMatch(descOriginal);
  if (!inputLimpo) return null;

  let melhorMatch = null;
  let melhorScore = 0;

  for (const mat of catalogoMateriais) {
    const catLimpo = limparParaMatch(mat.nome);
    if (!catLimpo) continue;

    // 1. Match exato
    if (catLimpo === inputLimpo) {
      return { material: mat, score: 100, tipo: 'exato' };
    }

    // 2. Um contém o outro por inteiro
    if (catLimpo.includes(inputLimpo) || inputLimpo.includes(catLimpo)) {
      const ratio = Math.min(catLimpo.length, inputLimpo.length) / Math.max(catLimpo.length, inputLimpo.length);
      const score = Math.round(82 + ratio * 15);
      if (score > melhorScore) {
        melhorScore = score;
        melhorMatch = { material: mat, score, tipo: 'contem' };
      }
      continue;
    }

    // 3. Similaridade por bigramas
    const score = calcSimilaridade(inputLimpo, catLimpo);
    if (score > melhorScore && score >= 35) {
      melhorScore = score;
      melhorMatch = { material: mat, score, tipo: 'similar' };
    }
  }

  // 4. Fallback: primeira palavra significativa em comum (ex: "tinta" casa com "tinta acrilica")
  if (!melhorMatch || melhorScore < 70) {
    const palavrasInput = inputLimpo.split(/\s+/).filter(p => p.length >= 4);
    if (palavrasInput.length) {
      for (const mat of catalogoMateriais) {
        const catLimpo = limparParaMatch(mat.nome);
        const palavrasCat = catLimpo.split(/\s+/).filter(p => p.length >= 4);
        // Contar quantas palavras significativas batem
        const hits = palavrasInput.filter(pi => palavrasCat.some(pc => pi === pc || pc.startsWith(pi) || pi.startsWith(pc))).length;
        if (hits > 0) {
          const ratio = hits / Math.max(palavrasInput.length, palavrasCat.length);
          const scoreFinal = Math.round(70 + ratio * 20); // 70-90
          if (scoreFinal > melhorScore) {
            melhorScore = scoreFinal;
            melhorMatch = { material: mat, score: scoreFinal, tipo: 'palavra-chave' };
          }
        }
      }
    }
  }

  return melhorMatch;
}

// Dice coefficient com bigramas — robusto pra variações de nome
function calcSimilaridade(a, b) {
  if (a === b) return 100;
  if (a.length < 2 || b.length < 2) return 0;

  const bigramas = str => {
    const set = new Map();
    for (let i = 0; i < str.length - 1; i++) {
      const bg = str.slice(i, i + 2);
      set.set(bg, (set.get(bg) || 0) + 1);
    }
    return set;
  };

  const bgA = bigramas(a);
  const bgB = bigramas(b);
  let intersecao = 0;

  for (const [bg, count] of bgA) {
    if (bgB.has(bg)) intersecao += Math.min(count, bgB.get(bg));
  }

  const totalA = a.length - 1;
  const totalB = b.length - 1;
  const dice = (2 * intersecao) / (totalA + totalB);

  return Math.round(dice * 100);
}

// ── INTERPRETAR texto colado ─────────────────────────────────
function interpretarImport() {
  const texto = document.getElementById('import-texto').value.trim();
  if (!texto) { showToast('⚠ Cole os itens da nota no campo de texto.'); return; }

  const itens = parseTextoImport(texto);
  if (!itens.length) { showToast('⚠ Não consegui identificar itens. Verifique o formato.'); return; }

  // Match com catálogo
  importItensPreview = itens.map((item, idx) => {
    const match = matchCatalogo(item.descOriginal);
    const credito = classificarItem(match ? match.material.nome : item.descOriginal);
    return {
      idx,
      descOriginal: item.descOriginal,
      qtd: item.qtd,
      unidade: match ? (match.material.unidade || item.unidade) : item.unidade,
      preco: item.preco,
      total: item.qtd * item.preco,
      match: match,
      descFinal: match ? match.material.nome : item.descOriginal,
      codigoCat: match ? match.material.codigo : null,
      credito: credito ? credito.credito : null,
      creditoCat: credito ? credito.cat : '',
      confirmado: !!match && match.score >= 60
    };
  });

  renderImportPreview();
}

function renderImportPreview() {
  const el = document.getElementById('import-preview');
  const matchCount = importItensPreview.filter(i => i.match && i.match.score >= 60).length;
  const semMatch = importItensPreview.filter(i => !i.match || i.match.score < 60).length;
  const semPreco = importItensPreview.filter(i => !i.preco || i.preco <= 0).length;

  let html = `
    <div style="display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap;">
      <div style="font-size:11px;padding:4px 10px;border-radius:4px;background:rgba(46,204,113,0.08);color:var(--verde-hl);border:1px solid rgba(46,204,113,0.2);">
        ${importItensPreview.length} itens encontrados
      </div>
      ${matchCount > 0 ? `<div style="font-size:11px;padding:4px 10px;border-radius:4px;background:rgba(46,204,113,0.08);color:var(--verde-hl);border:1px solid rgba(46,204,113,0.2);">
        ✓ ${matchCount} com match no catálogo
      </div>` : ''}
      ${semMatch > 0 ? `<div style="font-size:11px;padding:4px 10px;border-radius:4px;background:rgba(245,158,11,0.1);color:#fbbf24;border:1px solid rgba(245,158,11,0.3);">
        ⚠ ${semMatch} sem match
      </div>` : ''}
      ${semPreco > 0 ? `<div style="font-size:11px;padding:4px 10px;border-radius:4px;background:rgba(239,68,68,0.1);color:#f87171;border:1px solid rgba(239,68,68,0.2);">
        ✗ ${semPreco} sem preço
      </div>` : ''}
    </div>
  `;

  html += importItensPreview.map((item, i) => {
    const hasMatch = item.match && item.match.score >= 60;
    const scoreColor = !item.match ? '#f87171' : item.match.score >= 80 ? 'var(--verde-hl)' : item.match.score >= 60 ? '#fbbf24' : '#f87171';
    const scoreLabel = !item.match ? 'SEM MATCH' : item.match.score >= 80 ? 'MATCH FORTE' : item.match.score >= 60 ? 'MATCH PARCIAL' : 'MATCH FRACO';
    const borderColor = hasMatch ? 'rgba(46,204,113,0.2)' : 'rgba(245,158,11,0.3)';

    // Select do catálogo para itens sem match ou match fraco
    const selectCatalogo = `
      <select onchange="importSelecionarCatalogo(${i}, this.value)" style="width:100%;padding:6px 8px;background:var(--bg3);border:1px solid ${borderColor};border-radius:6px;color:var(--branco);font-size:11px;font-family:inherit;outline:none;margin-top:4px;">
        <option value="">— Selecionar do catálogo —</option>
        ${hasMatch ? `<option value="${item.codigoCat}" selected>${item.codigoCat} · ${item.descFinal}</option>` : ''}
        ${catalogoMateriais.slice(0, 200).map(m =>
          (hasMatch && m.codigo === item.codigoCat) ? '' :
          `<option value="${m.codigo}">${m.codigo} · ${m.nome}</option>`
        ).join('')}
      </select>
    `;

    return `
    <div class="import-item-row" style="border:1px solid ${borderColor};border-radius:8px;padding:12px;margin-bottom:8px;background:var(--bg3);">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">
        <div style="flex:1;">
          <div style="font-size:10px;color:var(--texto3);margin-bottom:2px;">ITEM NA NOTA:</div>
          <div style="font-size:13px;color:var(--texto2);font-family:'JetBrains Mono',monospace;">${item.descOriginal}</div>
        </div>
        <div style="display:flex;align-items:center;gap:6px;">
          <span style="font-size:9px;padding:2px 7px;border-radius:3px;background:${hasMatch ? 'rgba(46,204,113,0.08)' : 'rgba(245,158,11,0.1)'};color:${scoreColor};border:1px solid;font-weight:700;">${scoreLabel}${item.match ? ' '+item.match.score+'%' : ''}</span>
          <button onclick="importRemoverItem(${i})" style="background:none;border:none;color:var(--texto3);cursor:pointer;font-size:14px;" title="Remover">✕</button>
        </div>
      </div>
      <div style="margin-bottom:8px;">
        <div style="font-size:10px;color:var(--verde-hl);margin-bottom:2px;">ITEM EDR (CATÁLOGO):</div>
        ${selectCatalogo}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:6px;">
        <div>
          <label style="font-size:9px;color:var(--texto3);display:block;margin-bottom:2px;">QTD</label>
          <input type="number" value="${item.qtd}" onchange="importEditarCampo(${i},'qtd',this.value)" style="width:100%;padding:5px 7px;background:var(--bg2);border:1px solid var(--borda);border-radius:5px;color:var(--branco);font-size:12px;font-family:'JetBrains Mono',monospace;outline:none;">
        </div>
        <div>
          <label style="font-size:9px;color:var(--texto3);display:block;margin-bottom:2px;">UNIDADE</label>
          <input type="text" value="${item.unidade}" onchange="importEditarCampo(${i},'unidade',this.value)" style="width:100%;padding:5px 7px;background:var(--bg2);border:1px solid var(--borda);border-radius:5px;color:var(--branco);font-size:12px;outline:none;text-transform:uppercase;">
        </div>
        <div>
          <label style="font-size:9px;color:var(--texto3);display:block;margin-bottom:2px;">PREÇO UNIT.</label>
          <input type="number" value="${item.preco}" step="0.01" onchange="importEditarCampo(${i},'preco',this.value)" style="width:100%;padding:5px 7px;background:var(--bg2);border:1px solid var(--borda);border-radius:5px;color:var(--branco);font-size:12px;font-family:'JetBrains Mono',monospace;outline:none;${item.preco <= 0 ? 'border-color:rgba(239,68,68,0.4);' : ''}">
        </div>
        <div>
          <label style="font-size:9px;color:var(--texto3);display:block;margin-bottom:2px;">TOTAL</label>
          <div style="padding:5px 7px;font-size:12px;color:var(--verde-hl);font-weight:700;font-family:'JetBrains Mono',monospace;">${fmtR(item.total)}</div>
        </div>
      </div>
      ${item.credito !== null ? `
      <div style="margin-top:6px;font-size:10px;color:${item.credito ? 'var(--verde-hl)' : '#f87171'};font-weight:700;">
        ${item.credito ? '✓ GERA CRÉDITO' : '✗ SEM CRÉDITO'} ${item.creditoCat ? '— '+item.creditoCat : ''}
      </div>` : `
      <div style="margin-top:6px;display:flex;gap:6px;align-items:center;">
        <span style="font-size:10px;color:#fbbf24;">❓ Classificar:</span>
        <button onclick="importClassificar(${i},true)" style="font-size:9px;padding:2px 8px;border-radius:3px;background:rgba(46,204,113,0.08);color:var(--verde-hl);border:1px solid rgba(46,204,113,0.2);cursor:pointer;font-weight:700;">✓ CRÉDITO</button>
        <button onclick="importClassificar(${i},false)" style="font-size:9px;padding:2px 8px;border-radius:3px;background:rgba(239,68,68,0.08);color:#f87171;border:1px solid rgba(239,68,68,0.2);cursor:pointer;font-weight:700;">✗ SEM CRÉDITO</button>
      </div>`}
    </div>`;
  }).join('');

  // Total geral
  const totalGeral = importItensPreview.reduce((s, i) => s + i.total, 0);
  html += `
    <div style="display:flex;justify-content:space-between;padding:12px;background:var(--bg2);border-radius:8px;margin-top:8px;border:1px solid var(--borda);">
      <span style="font-weight:700;color:var(--branco);">TOTAL ${importItensPreview.length} ITENS</span>
      <span style="font-weight:800;color:var(--verde-hl);font-family:'JetBrains Mono',monospace;">${fmtR(totalGeral)}</span>
    </div>
  `;

  el.innerHTML = html;
  document.getElementById('import-preview-wrap').classList.remove('hidden');
  document.getElementById('import-instrucoes').classList.add('hidden');

  // Mostrar botão confirmar apenas se todos itens têm crédito classificado
  const todosClassificados = importItensPreview.every(i => i.credito !== null);
  const btn = document.getElementById('import-btn-confirmar');
  btn.classList.remove('hidden');
  if (!todosClassificados) {
    btn.style.opacity = '0.5';
    btn.title = 'Classifique todos os itens antes de confirmar';
  } else {
    btn.style.opacity = '1';
    btn.title = '';
  }
}

// ── Ações do preview ─────────────────────────────────────────
function importSelecionarCatalogo(idx, codigoCat) {
  const item = importItensPreview[idx];
  if (!codigoCat) {
    item.match = null;
    item.descFinal = item.descOriginal;
    item.codigoCat = null;
    item.confirmado = false;
    // Reclassificar crédito
    const cred = classificarItem(item.descOriginal);
    item.credito = cred ? cred.credito : null;
    item.creditoCat = cred ? cred.cat : '';
  } else {
    const mat = catalogoMateriais.find(m => m.codigo === codigoCat);
    if (mat) {
      item.match = { material: mat, score: 100, tipo: 'manual' };
      item.descFinal = mat.nome;
      item.codigoCat = mat.codigo;
      item.unidade = mat.unidade || item.unidade;
      item.confirmado = true;
      // Reclassificar crédito com nome do catálogo
      const cred = classificarItem(mat.nome);
      item.credito = cred ? cred.credito : null;
      item.creditoCat = cred ? cred.cat : '';
    }
  }
  renderImportPreview();
}

function importEditarCampo(idx, campo, valor) {
  const item = importItensPreview[idx];
  if (campo === 'qtd') {
    item.qtd = parseFloat(valor) || 0;
    item.total = item.qtd * item.preco;
  } else if (campo === 'preco') {
    item.preco = parseFloat(valor) || 0;
    item.total = item.qtd * item.preco;
  } else if (campo === 'unidade') {
    item.unidade = valor.toUpperCase();
  }
  renderImportPreview();
}

function importClassificar(idx, credito) {
  importItensPreview[idx].credito = credito;
  importItensPreview[idx].creditoCat = credito ? 'Manual — Gera crédito' : 'Manual — Sem crédito';
  renderImportPreview();
}

function importRemoverItem(idx) {
  importItensPreview.splice(idx, 1);
  importItensPreview.forEach((item, i) => item.idx = i);
  if (!importItensPreview.length) {
    document.getElementById('import-preview-wrap').classList.add('hidden');
    document.getElementById('import-btn-confirmar').classList.add('hidden');
    document.getElementById('import-instrucoes').classList.remove('hidden');
  } else {
    renderImportPreview();
  }
}

// ── CONFIRMAR: adiciona itens ao form principal ──────────────
function confirmarImport() {
  const naoClassificados = importItensPreview.filter(i => i.credito === null);
  if (naoClassificados.length) {
    showToast(`⚠ Classifique ${naoClassificados.length} item(ns) antes de confirmar.`);
    return;
  }

  const semPreco = importItensPreview.filter(i => i.preco <= 0);
  if (semPreco.length) {
    if (!confirm(`⚠ ${semPreco.length} item(ns) sem preço unitário.\n\nDeseja adicionar mesmo assim?`)) return;
  }

  // Adicionar cada item ao itensForm do form principal
  for (const item of importItensPreview) {
    const res = classificarItem(item.descFinal);
    itensForm.push({
      desc: item.descFinal,
      qtd: item.qtd,
      unidade: item.unidade,
      preco: item.preco,
      total: item.total,
      imposto: 0,
      credito: item.credito,
      cat: res?.cat || item.creditoCat || 'Manual'
    });
  }

  renderItensForm();
  fecharModal('import');
  showToast(`✅ ${importItensPreview.length} itens adicionados à nota!`);
  importItensPreview = [];
}

// ── Busca no catálogo dentro do select ───────────────────────
function importBuscarCatalogo(idx) {
  const input = document.getElementById(`import-busca-cat-${idx}`);
  if (!input) return;
  const val = norm(input.value);
  const select = input.closest('.import-item-row')?.querySelector('select');
  if (!select) return;

  const opts = catalogoMateriais
    .filter(m => norm(m.nome).includes(val) || m.codigo.includes(val))
    .slice(0, 50);

  select.innerHTML = '<option value="">— Selecionar do catálogo —</option>' +
    opts.map(m => `<option value="${m.codigo}">${m.codigo} · ${m.nome}</option>`).join('');
}
