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

// Extrai números/medidas de uma string (ex: "50mm", "3/4", "25", "100mm")
function extrairMedidas(str) {
  const medidas = [];
  // Padrões: 50mm, 50MM, 50 mm, 3/4, 1/2, 20x20, 10.0, etc.
  const regex = /(\d+[.,]?\d*)\s*(mm|cm|m|pol|kg|"|''|g|l|ml|m2|m3|m²|m³)?/gi;
  let m;
  while ((m = regex.exec(str)) !== null) {
    medidas.push(m[1].replace(',', '.'));
  }
  // Frações: 3/4, 1/2
  const fracoes = str.match(/\d+\/\d+/g);
  if (fracoes) medidas.push(...fracoes);
  return medidas;
}

// Compara medidas entre dois textos — retorna penalidade (0 = ok, -30 = medidas diferentes)
function penalizarMedidasDiferentes(strA, strB) {
  const medA = extrairMedidas(strA);
  const medB = extrairMedidas(strB);
  if (!medA.length || !medB.length) return 0; // sem medidas, sem penalidade
  // Se ambos têm medidas, verificar se as medidas batem
  const medASet = new Set(medA);
  const medBSet = new Set(medB);
  const emComum = [...medASet].filter(m => medBSet.has(m)).length;
  if (emComum === 0) return -30; // medidas totalmente diferentes → penalidade pesada
  if (emComum < Math.max(medASet.size, medBSet.size)) return -15; // algumas diferentes
  return 0; // medidas batem
}

// Cache de catálogo limpo (invalidar quando catalogoMateriais mudar)
let _catCacheVer = 0;
let _catCache = null;
function getCatCache() {
  if (_catCache && _catCacheVer === catalogoMateriais.length) return _catCache;
  _catCacheVer = catalogoMateriais.length;
  const byNome = new Map();
  const byPrimeiraPalavra = new Map();
  for (const mat of catalogoMateriais) {
    const limpo = limparParaMatch(mat.nome);
    if (!limpo) continue;
    byNome.set(mat, limpo);
    const pp = limpo.split(/\s+/)[0] || '';
    if (pp.length >= 3) {
      if (!byPrimeiraPalavra.has(pp)) byPrimeiraPalavra.set(pp, []);
      byPrimeiraPalavra.get(pp).push(mat);
    }
  }
  _catCache = { byNome, byPrimeiraPalavra };
  return _catCache;
}

function matchCatalogo(descOriginal) {
  const inputLimpo = limparParaMatch(descOriginal);
  if (!inputLimpo) return null;

  const cache = getCatCache();
  let melhorMatch = null;
  let melhorScore = 0;

  for (const [mat, catLimpo] of cache.byNome) {
    // 1. Match exato
    if (catLimpo === inputLimpo) {
      return { material: mat, score: 100, tipo: 'exato' };
    }

    // Penalidade por medidas/bitolas diferentes (ex: 50mm vs 25mm)
    const penalidade = penalizarMedidasDiferentes(inputLimpo, catLimpo);

    // 2. Um contém o outro por inteiro (mínimo 5 chars pra evitar matches curtos)
    const menorLen = Math.min(catLimpo.length, inputLimpo.length);
    if (menorLen >= 5 && (catLimpo.includes(inputLimpo) || inputLimpo.includes(catLimpo))) {
      const ratio = menorLen / Math.max(catLimpo.length, inputLimpo.length);
      if (ratio >= 0.3) {
        const score = Math.max(0, Math.round(82 + ratio * 15) + penalidade);
        if (score > melhorScore) {
          melhorScore = score;
          melhorMatch = { material: mat, score, tipo: 'contem' };
        }
      }
      continue;
    }

    // 3. Similaridade por bigramas (mínimo 55% pra evitar falsos positivos)
    let score = calcSimilaridade(inputLimpo, catLimpo);
    score = Math.max(0, score + penalidade);
    if (score > melhorScore && score >= 55) {
      melhorScore = score;
      melhorMatch = { material: mat, score, tipo: 'similar' };
    }
  }

  // 4. Fallback: palavras significativas em comum (usa índice por 1ª palavra)
  if (!melhorMatch || melhorScore < 70) {
    const todasPalavrasInput = inputLimpo.split(/\s+/).filter(p => p.length >= 3);
    const palavrasInput = todasPalavrasInput.filter(p => p.length >= 4);
    const primeiraPalavra = todasPalavrasInput[0] || '';
    if (palavrasInput.length && primeiraPalavra.length >= 3) {
      // Buscar apenas materiais cuja 1ª palavra bate (índice)
      const candidatos = [];
      for (const [pp, mats] of cache.byPrimeiraPalavra) {
        if (pp === primeiraPalavra || pp.startsWith(primeiraPalavra) || primeiraPalavra.startsWith(pp)) {
          candidatos.push(...mats);
        }
      }
      for (const mat of candidatos) {
        const catLimpo = cache.byNome.get(mat);
        if (!catLimpo) continue;
        const palavrasCat = catLimpo.split(/\s+/).filter(p => p.length >= 3);
        const hits = palavrasInput.filter(pi => palavrasCat.some(pc => pi === pc || pc.startsWith(pi) || pi.startsWith(pc)));
        const numHits = hits.length;
        if (numHits >= 2 || (numHits === 1 && hits[0].length >= 6)) {
          const penalidade = penalizarMedidasDiferentes(inputLimpo, catLimpo);
          const ratio = numHits / Math.max(palavrasInput.length, palavrasCat.length);
          const scoreFinal = Math.max(0, Math.round(60 + ratio * 25) + penalidade);
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
      <div style="font-size:11px;padding:4px 10px;border-radius:4px;background:rgba(34,197,94,0.08);color:var(--verde-hl);border:1px solid rgba(34,197,94,0.15);">
        ${importItensPreview.length} itens encontrados
      </div>
      ${matchCount > 0 ? `<div style="font-size:11px;padding:4px 10px;border-radius:4px;background:rgba(34,197,94,0.08);color:var(--verde-hl);border:1px solid rgba(34,197,94,0.15);">
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
    const borderColor = hasMatch ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.3)';

    // Input com busca no catálogo
    const selectCatalogo = `
      <div style="position:relative;">
        <input type="text" id="import-cat-input-${i}" placeholder="${hasMatch ? item.codigoCat+' · '+item.descFinal : '🔍 Buscar no catálogo...'}"
          value="${hasMatch ? item.codigoCat+' · '+item.descFinal : ''}"
          oninput="importBuscarCatInput(${i})" onfocus="importBuscarCatInput(${i})"
          autocomplete="off"
          style="width:100%;padding:8px 10px;background:var(--bg3);border:1px solid ${borderColor};border-radius:6px;color:${hasMatch ? 'var(--branco)' : 'var(--texto3)'};font-size:11px;font-family:inherit;outline:none;margin-top:4px;box-sizing:border-box;">
        ${hasMatch ? `<button onclick="importSelecionarCatalogo(${i},'')" style="position:absolute;right:6px;top:8px;background:none;border:none;color:var(--texto3);cursor:pointer;font-size:12px;" title="Limpar">✕</button>` : ''}
        <div id="import-cat-list-${i}" class="hidden" style="position:absolute;left:0;right:0;top:100%;z-index:100;max-height:200px;overflow-y:auto;background:var(--bg2);border:1px solid var(--verde-bd);border-radius:0 0 8px 8px;box-shadow:0 8px 24px rgba(0,0,0,0.5);"></div>
      </div>
    `;

    return `
    <div class="import-item-row" style="border:1px solid ${borderColor};border-radius:8px;padding:12px;margin-bottom:8px;background:var(--bg3);">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">
        <div style="flex:1;">
          <div style="font-size:10px;color:var(--texto3);margin-bottom:2px;">ITEM NA NOTA:</div>
          <div style="font-size:13px;color:var(--texto2);font-family:'JetBrains Mono',monospace;">${item.descOriginal}</div>
        </div>
        <div style="display:flex;align-items:center;gap:6px;">
          <span style="font-size:9px;padding:2px 7px;border-radius:3px;background:${hasMatch ? 'rgba(34,197,94,0.08)' : 'rgba(245,158,11,0.1)'};color:${scoreColor};border:1px solid;font-weight:700;">${scoreLabel}${item.match ? ' '+item.match.score+'%' : ''}</span>
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
      <div style="margin-top:6px;">
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
          <span style="font-size:10px;color:#fbbf24;">❓ Classificar:</span>
          <button onclick="importConsultarCredito(${i})" style="font-size:9px;padding:2px 8px;border-radius:3px;background:rgba(139,92,246,0.1);color:#a78bfa;border:1px solid rgba(139,92,246,0.3);cursor:pointer;font-weight:700;">🔍 CONSULTAR</button>
          <button onclick="importClassificar(${i},true)" style="font-size:9px;padding:2px 8px;border-radius:3px;background:rgba(34,197,94,0.08);color:var(--verde-hl);border:1px solid rgba(34,197,94,0.15);cursor:pointer;font-weight:700;">✓ CRÉDITO</button>
          <button onclick="importClassificar(${i},false)" style="font-size:9px;padding:2px 8px;border-radius:3px;background:rgba(239,68,68,0.08);color:#f87171;border:1px solid rgba(239,68,68,0.2);cursor:pointer;font-weight:700;">✗ SEM CRÉDITO</button>
        </div>
        <div id="import-consulta-${i}" style="display:none;margin-top:6px;padding:8px 10px;border-radius:6px;font-size:10px;font-weight:700;"></div>
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
      // Reclassificar crédito com nome do catálogo, fallback pra descrição original
      const cred = classificarItem(mat.nome) || classificarItem(item.descOriginal);
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

function importConsultarCredito(idx) {
  const item = importItensPreview[idx];
  const desc = item.descFinal || item.descOriginal;
  const el = document.getElementById(`import-consulta-${idx}`);
  if (!el) return;
  // Consultar nas REGRAS_TRIBUTARIAS (mesmo motor do assistente)
  const v = norm(desc);
  let resultado = null;
  if (typeof REGRAS_TRIBUTARIAS !== 'undefined') {
    for (const r of REGRAS_TRIBUTARIAS) {
      for (const p of r.palavras) { if (v.includes(norm(p)) || norm(p).includes(v)) { resultado = r; break; } }
      if (resultado) break;
    }
  }
  if (resultado) {
    el.style.background = resultado.credito ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)';
    el.style.color = resultado.credito ? 'var(--verde-hl)' : '#f87171';
    el.style.border = resultado.credito ? '1px solid rgba(34,197,94,0.15)' : '1px solid rgba(239,68,68,0.2)';
    el.innerHTML = `${resultado.credito ? '✅' : '❌'} ${resultado.motivo}<br><span style="font-size:9px;color:var(--texto3);">Categoria: ${resultado.cat}</span>
      <button onclick="importClassificar(${idx},${resultado.credito})" style="margin-left:8px;font-size:9px;padding:2px 8px;border-radius:3px;background:rgba(139,92,246,0.1);color:#a78bfa;border:1px solid rgba(139,92,246,0.3);cursor:pointer;font-weight:700;">APLICAR</button>`;
  } else {
    el.style.background = 'rgba(245,158,11,0.08)';
    el.style.color = '#fbbf24';
    el.style.border = '1px solid rgba(245,158,11,0.2)';
    el.innerHTML = '⚠ Item não encontrado na base tributária. Classifique manualmente.';
  }
  el.style.display = 'block';
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

// ── Busca no catálogo com autocomplete ───────────────────────
function importBuscarCatInput(idx) {
  const input = document.getElementById(`import-cat-input-${idx}`);
  const list = document.getElementById(`import-cat-list-${idx}`);
  if (!input || !list) return;
  const val = input.value.trim();
  if (val.length < 2) { list.classList.add('hidden'); return; }
  const q = norm(val);
  const numVal = val.replace(/\D/g, '');
  const matches = catalogoMateriais
    .filter(m => norm(m.nome).includes(q) || (numVal && (m.codigo || '').includes(numVal)))
    .sort((a, b) => {
      const na = norm(a.nome), nb = norm(b.nome);
      const aStart = na.startsWith(q) ? 0 : na.includes(' ' + q) ? 1 : 2;
      const bStart = nb.startsWith(q) ? 0 : nb.includes(' ' + q) ? 1 : 2;
      return aStart - bStart;
    })
    .slice(0, 20);

  if (!matches.length) {
    list.innerHTML = `<div style="padding:8px 10px;font-size:11px;color:var(--texto3);">Nenhum item encontrado</div>`;
    list.classList.remove('hidden');
    return;
  }

  list.innerHTML = matches.map(m =>
    `<div onmousedown="importSelecionarCatPorInput(${idx},'${m.codigo}')" style="padding:8px 10px;cursor:pointer;border-bottom:1px solid var(--borda);display:flex;gap:8px;align-items:center;transition:background 0.1s;" onmouseover="this.style.background='rgba(34,197,94,0.08)'" onmouseout="this.style.background='transparent'">
      <span style="font-family:monospace;font-size:10px;color:var(--verde-hl);background:rgba(34,197,94,0.08);padding:2px 6px;border-radius:4px;white-space:nowrap;">${m.codigo}</span>
      <span style="font-size:11px;color:var(--branco);flex:1;">${m.nome}</span>
      <span style="font-size:10px;color:var(--texto3);">${m.unidade || 'UN'}</span>
    </div>`
  ).join('');
  list.classList.remove('hidden');

  // Fechar lista ao perder foco
  input.onblur = () => setTimeout(() => list.classList.add('hidden'), 150);
}

function importSelecionarCatPorInput(idx, codigo) {
  importSelecionarCatalogo(idx, codigo);
}

// ══════════════════════════════════════════
// IMPORTAÇÃO VIA XML (NF-e)
// ══════════════════════════════════════════
function abrirImportXML() {
  document.getElementById('input-xml-nfe').value = '';
  document.getElementById('input-xml-nfe').click();
}

function processarXMLNFe(input) {
  const file = input.files[0];
  if (!file) return;
  if (!file.name.toLowerCase().endsWith('.xml')) {
    showToast('⚠ Selecione um arquivo .xml'); return;
  }
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const parser = new DOMParser();
      const xml = parser.parseFromString(e.target.result, 'text/xml');
      const parseError = xml.querySelector('parsererror');
      if (parseError) { showToast('⚠ XML inválido — verifique o arquivo.'); return; }
      const nfe = extrairDadosNFe(xml);
      if (!nfe) { showToast('⚠ Não foi possível ler a NF-e. Verifique se é um XML de nota fiscal.'); return; }
      preencherFormComXML(nfe);
    } catch (err) {
      console.error('Erro ao processar XML:', err);
      showToast('⚠ Erro ao processar o XML.');
    }
  };
  reader.readAsText(file);
}

function extrairDadosNFe(xml) {
  // NF-e pode ter namespace ou não — busca flexível
  const getTag = (parent, tag) => {
    // Tenta sem namespace primeiro, depois com namespace
    let el = parent.getElementsByTagName(tag)[0];
    if (!el) el = parent.getElementsByTagName('nfe:' + tag)[0];
    if (!el) el = parent.getElementsByTagNameNS('*', tag)[0];
    return el;
  };
  const getVal = (parent, tag) => {
    const el = getTag(parent, tag);
    return el ? el.textContent.trim() : '';
  };
  const getAllTag = (parent, tag) => {
    let els = parent.getElementsByTagName(tag);
    if (!els.length) els = parent.getElementsByTagName('nfe:' + tag);
    if (!els.length) els = parent.getElementsByTagNameNS('*', tag);
    return els;
  };

  // Dados do emitente (fornecedor)
  const emit = getTag(xml, 'emit');
  const fornecedor = emit ? getVal(emit, 'xNome') : '';
  const cnpj = emit ? getVal(emit, 'CNPJ') : '';

  // Dados da nota
  const ide = getTag(xml, 'ide');
  const numero = ide ? getVal(ide, 'nNF') : '';
  const natureza = ide ? getVal(ide, 'natOp') : '';
  const dataEmissao = ide ? (getVal(ide, 'dhEmi') || getVal(ide, 'dEmi')) : '';

  // Totais
  const total = getTag(xml, 'ICMSTot');
  const valorBruto = total ? parseFloat(getVal(total, 'vProd')) || 0 : 0;
  const frete = total ? parseFloat(getVal(total, 'vFrete')) || 0 : 0;

  // Itens (produtos)
  const dets = getAllTag(xml, 'det');
  if (!dets.length) return null;

  const itens = [];
  for (let i = 0; i < dets.length; i++) {
    const det = dets[i];
    const prod = getTag(det, 'prod');
    if (!prod) continue;
    const desc = getVal(prod, 'xProd').toUpperCase();
    const qtd = parseFloat(getVal(prod, 'qCom')) || parseFloat(getVal(prod, 'qTrib')) || 0;
    const preco = parseFloat(getVal(prod, 'vUnCom')) || parseFloat(getVal(prod, 'vUnTrib')) || 0;
    const unidade = (getVal(prod, 'uCom') || getVal(prod, 'uTrib') || 'UN').toUpperCase();
    const totalItem = parseFloat(getVal(prod, 'vProd')) || qtd * preco;
    if (desc) {
      itens.push({ descOriginal: desc, qtd, preco, unidade, total: totalItem });
    }
  }

  // Formatar data (dhEmi = "2024-01-15T10:30:00-03:00" → "2024-01-15")
  let dataFormatada = '';
  if (dataEmissao) {
    dataFormatada = dataEmissao.substring(0, 10);
  }

  return { fornecedor, cnpj, numero, natureza, dataEmissao: dataFormatada, valorBruto, frete, itens };
}

function preencherFormComXML(nfe) {
  // Preencher cabeçalho da NF
  const numEl = document.getElementById('f-numero');
  if (numEl && nfe.numero) numEl.value = nfe.numero;

  const fornEl = document.getElementById('f-fornecedor');
  if (fornEl && nfe.fornecedor) fornEl.value = nfe.fornecedor;

  const cnpjEl = document.getElementById('f-cnpj');
  if (cnpjEl && nfe.cnpj) {
    // Formatar CNPJ
    let c = nfe.cnpj.replace(/\D/g, '');
    if (c.length === 14) c = c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
    cnpjEl.value = c;
  }

  const emissaoEl = document.getElementById('f-emissao');
  if (emissaoEl && nfe.dataEmissao) emissaoEl.value = nfe.dataEmissao;

  const recebEl = document.getElementById('f-recebimento');
  if (recebEl) recebEl.value = new Date().toISOString().split('T')[0];

  const freteEl = document.getElementById('f-frete');
  if (freteEl && nfe.frete > 0) freteEl.value = nfe.frete;

  // Natureza — mapear pra select do form
  const natEl = document.getElementById('f-natureza');
  if (natEl && nfe.natureza) {
    const natNorm = nfe.natureza.toLowerCase();
    if (natNorm.includes('venda')) natEl.value = 'VENDA';
    else if (natNorm.includes('bonif')) natEl.value = 'BONIFICACAO';
    else if (natNorm.includes('devol')) natEl.value = 'DEVOLUCAO';
    else if (natNorm.includes('transf')) natEl.value = 'TRANSFERENCIA';
  }

  // Processar itens com match do catálogo (reutiliza o mesmo motor)
  importItensPreview = nfe.itens.map((item, idx) => {
    const match = matchCatalogo(item.descOriginal);
    const credito = classificarItem(match ? match.material.nome : item.descOriginal);
    return {
      idx,
      descOriginal: item.descOriginal,
      qtd: item.qtd,
      unidade: match ? (match.material.unidade || item.unidade) : item.unidade,
      preco: item.preco,
      total: item.total || item.qtd * item.preco,
      match,
      descFinal: match ? match.material.nome : item.descOriginal,
      codigoCat: match ? match.material.codigo : null,
      credito: credito ? credito.credito : null,
      creditoCat: credito ? credito.cat : '',
      confirmado: !!match && match.score >= 60
    };
  });

  // Abrir modal de preview pra revisar os itens
  document.getElementById('import-texto').value = `[Importado do XML] ${nfe.fornecedor} — NF ${nfe.numero}\n${nfe.itens.length} itens extraídos automaticamente`;
  document.getElementById('modal-import').classList.remove('hidden');
  document.getElementById('import-instrucoes').classList.add('hidden');
  renderImportPreview();

  showToast(`📄 XML importado! ${nfe.itens.length} itens · ${nfe.fornecedor} · NF ${nfe.numero}`);
}
