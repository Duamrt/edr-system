// ══════════════════════════════════════════════════════════════
// EDR V2 — Importacao Rapida de Itens (NF) + XML NF-e
// ImportModule encapsulado, motor de matching PRESERVADO INTACTO
// Entrega JSON limpo pro NotasModule.adicionarItem()
// ══════════════════════════════════════════════════════════════

if (typeof fmtR !== 'function') {
  var fmtR = v => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const ImportModule = {

  // ── Estado encapsulado ──────────────────────────────────
  itensPreview: [],
  _catCacheVer: 0,
  _catCache: null,
  _cadastroIdx: null,

  // ══════════════════════════════════════════════════════════
  // PARSER: interpreta texto colado (5 formatos)
  // ══════════════════════════════════════════════════════════

  parseTexto(texto) {
    const linhas = texto.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    return linhas.map(l => this._parseLinha(l)).filter(Boolean);
  },

  _parseLinha(linha) {
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
      return this._extrairDeParts(parts);
    }

    // Espacos: DESC    20    32,50
    const regexNumFinal = /^(.+?)\s{2,}(\d+[.,]?\d*)\s*([A-Za-z\u00C0-\u00FF\u00B2\u00B3]*)\s+(\d+[.,]\d+)\s*$/;
    const matchNum = linha.match(regexNumFinal);
    if (matchNum) {
      return {
        descOriginal: matchNum[1].trim().toUpperCase(),
        qtd: this._parseNumBR(matchNum[2]),
        unidade: (matchNum[3] || '').toUpperCase() || 'UN',
        preco: this._parseNumBR(matchNum[4])
      };
    }

    // Dois numeros no final (sem unidade)
    const regexDoisNum = /^(.+?)\s{2,}(\d+[.,]?\d*)\s+(\d+[.,]\d+)\s*$/;
    const matchDois = linha.match(regexDoisNum);
    if (matchDois) {
      return {
        descOriginal: matchDois[1].trim().toUpperCase(),
        qtd: this._parseNumBR(matchDois[2]),
        unidade: 'UN',
        preco: this._parseNumBR(matchDois[3])
      };
    }

    // Apenas descricao (sem numeros)
    if (linha.length > 2) {
      return { descOriginal: linha.toUpperCase(), qtd: 1, unidade: 'UN', preco: 0 };
    }

    return null;
  },

  _extrairDeParts(parts) {
    const desc = (parts[0] || '').toUpperCase().trim();
    if (!desc) return null;

    let qtd = 1, unidade = 'UN', preco = 0;

    if (parts.length >= 3) {
      const qtdPart = parts[1].trim();
      const qtdMatch = qtdPart.match(/^(\d+[.,]?\d*)\s*([A-Za-z\u00C0-\u00FF\u00B2\u00B3]*)/);
      if (qtdMatch) {
        qtd = this._parseNumBR(qtdMatch[1]);
        if (qtdMatch[2]) unidade = qtdMatch[2].toUpperCase();
      }
      preco = this._parseNumBR(parts[2]);
    } else if (parts.length === 2) {
      qtd = this._parseNumBR(parts[1]) || 1;
    }

    return { descOriginal: desc, qtd, unidade, preco };
  },

  _parseNumBR(str) {
    if (!str) return 0;
    let s = String(str).trim();
    if (s.includes(',') && s.includes('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else if (s.includes(',')) {
      s = s.replace(',', '.');
    }
    return parseFloat(s) || 0;
  },

  // ══════════════════════════════════════════════════════════
  // MOTOR DE MATCHING — PRESERVADO INTACTO
  // Exact -> Contains -> Bigramas (Dice) -> Palavras-chave
  // ══════════════════════════════════════════════════════════

  _limparParaMatch(str) {
    let s = typeof norm === 'function' ? norm(str) : str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    s = s.replace(/^\d{4,6}\s*[\u00B7\-]?\s*/, '');
    s = s.replace(/[\u00B7\/]/g, ' ');
    s = s.replace(/\s+/g, ' ').trim();
    return s;
  },

  _extrairMedidas(str) {
    const medidas = [];
    const regex = /(\d+[.,]?\d*)\s*(mm|cm|m|pol|kg|"|''|g|l|ml|m2|m3|m\u00B2|m\u00B3)?/gi;
    let m;
    while ((m = regex.exec(str)) !== null) {
      medidas.push(m[1].replace(',', '.'));
    }
    const fracoes = str.match(/\d+\/\d+/g);
    if (fracoes) medidas.push(...fracoes);
    return medidas;
  },

  _penalizarMedidas(strA, strB) {
    const medA = this._extrairMedidas(strA);
    const medB = this._extrairMedidas(strB);
    if (!medA.length || !medB.length) return 0;
    const medASet = new Set(medA);
    const medBSet = new Set(medB);
    const emComum = [...medASet].filter(m => medBSet.has(m)).length;
    if (emComum === 0) return -30;
    if (emComum < Math.max(medASet.size, medBSet.size)) return -15;
    return 0;
  },

  _getCatCache() {
    const catalogo = typeof catalogoMateriais !== 'undefined' ? catalogoMateriais : [];
    if (this._catCache && this._catCacheVer === catalogo.length) return this._catCache;
    this._catCacheVer = catalogo.length;
    const byNome = new Map();
    const byPrimeiraPalavra = new Map();
    for (const mat of catalogo) {
      const limpo = this._limparParaMatch(mat.nome);
      if (!limpo) continue;
      byNome.set(mat, limpo);
      const pp = limpo.split(/\s+/)[0] || '';
      if (pp.length >= 3) {
        if (!byPrimeiraPalavra.has(pp)) byPrimeiraPalavra.set(pp, []);
        byPrimeiraPalavra.get(pp).push(mat);
      }
    }
    this._catCache = { byNome, byPrimeiraPalavra };
    return this._catCache;
  },

  matchCatalogo(descOriginal) {
    const inputLimpo = this._limparParaMatch(descOriginal);
    if (!inputLimpo) return null;

    const cache = this._getCatCache();
    let melhorMatch = null;
    let melhorScore = 0;

    for (const [mat, catLimpo] of cache.byNome) {
      // 1. Match exato
      if (catLimpo === inputLimpo) {
        return { material: mat, score: 100, tipo: 'exato' };
      }

      const penalidade = this._penalizarMedidas(inputLimpo, catLimpo);

      // 2. Um contem o outro
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

      // 3. Similaridade por bigramas (Dice coefficient)
      let score = this._calcSimilaridade(inputLimpo, catLimpo);
      score = Math.max(0, score + penalidade);
      if (score > melhorScore && score >= 55) {
        melhorScore = score;
        melhorMatch = { material: mat, score, tipo: 'similar' };
      }
    }

    // 4. Fallback: palavras significativas em comum
    if (!melhorMatch || melhorScore < 70) {
      const todasPalavrasInput = inputLimpo.split(/\s+/).filter(p => p.length >= 3);
      const palavrasInput = todasPalavrasInput.filter(p => p.length >= 4);
      const primeiraPalavra = todasPalavrasInput[0] || '';
      if (palavrasInput.length && primeiraPalavra.length >= 3) {
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
            const penalidade = this._penalizarMedidas(inputLimpo, catLimpo);
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
  },

  _calcSimilaridade(a, b) {
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
    return Math.round((2 * intersecao) / (totalA + totalB) * 100);
  },

  // ══════════════════════════════════════════════════════════
  // ABRIR MODAL DE IMPORTACAO (gerado via JS)
  // ══════════════════════════════════════════════════════════

  abrir() {
    this.itensPreview = [];

    // Gera modal via JS (nao depende de HTML externo)
    let modal = document.getElementById('modal-import-v2');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'modal-import-v2';
      modal.className = 'modal-overlay';
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div class="modal-box" style="max-width:900px;width:95%;max-height:90vh;overflow-y:auto;">
        <div class="modal-header">
          <h3><span class="material-symbols-outlined" style="font-size:20px;vertical-align:middle;margin-right:6px;">upload_file</span>Importacao Rapida</h3>
          <button onclick="ImportModule.fechar()" class="modal-close"><span class="material-symbols-outlined">close</span></button>
        </div>
        <div class="modal-body" style="padding:16px;">
          <div id="import-instrucoes-v2" style="margin-bottom:12px;">
            <p style="font-size:13px;color:var(--texto2);margin-bottom:8px;">Cole os itens da nota no campo abaixo. Formatos aceitos:</p>
            <div style="font-size:11px;color:var(--texto3);line-height:1.8;">
              <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">check_circle</span> Tab: DESCRICAO &lt;tab&gt; QTD &lt;tab&gt; PRECO<br>
              <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">check_circle</span> Ponto-virgula: DESCRICAO;QTD;PRECO<br>
              <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">check_circle</span> Pipe: DESCRICAO|QTD|PRECO<br>
              <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">check_circle</span> Espacos: DESCRICAO&nbsp;&nbsp;&nbsp;&nbsp;20&nbsp;&nbsp;&nbsp;&nbsp;32,50<br>
              <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">check_circle</span> Apenas descricao (sem qtd/preco)
            </div>
          </div>
          <textarea id="import-texto-v2" rows="6" placeholder="Cole aqui os itens da nota..." style="width:100%;padding:10px;background:var(--bg3);border:1px solid var(--borda);border-radius:8px;color:var(--texto1);font-size:12px;font-family:'JetBrains Mono',monospace;resize:vertical;box-sizing:border-box;"></textarea>
          <div style="display:flex;gap:8px;margin-top:10px;">
            <button onclick="ImportModule.interpretar()" class="btn btn-primary" style="flex:1;">
              <span class="material-symbols-outlined" style="font-size:16px;vertical-align:middle;margin-right:4px;">search</span>Interpretar
            </button>
            <button onclick="ImportModule.abrirXML()" class="btn btn-secondary" style="flex:1;">
              <span class="material-symbols-outlined" style="font-size:16px;vertical-align:middle;margin-right:4px;">description</span>Importar XML NF-e
            </button>
            <input type="file" id="input-xml-nfe-v2" accept=".xml" onchange="ImportModule.processarXML(this)" style="display:none;">
          </div>
          <div id="import-preview-v2" style="margin-top:14px;"></div>
          <div id="import-btn-confirmar-wrap" style="display:none;margin-top:12px;">
            <button onclick="ImportModule.confirmarImport()" class="btn btn-primary" style="width:100%;padding:12px;font-size:14px;font-weight:700;">
              <span class="material-symbols-outlined" style="font-size:18px;vertical-align:middle;margin-right:6px;">check_circle</span>Confirmar Importacao
            </button>
          </div>
        </div>
      </div>
    `;

    modal.classList.add('active');
    modal.style.display = 'flex';
    setTimeout(() => document.getElementById('import-texto-v2')?.focus(), 100);
  },

  fechar() {
    const modal = document.getElementById('modal-import-v2');
    if (modal) { modal.classList.remove('active'); modal.style.display = 'none'; }
    this.itensPreview = [];
  },

  // ══════════════════════════════════════════════════════════
  // INTERPRETAR TEXTO COLADO
  // ══════════════════════════════════════════════════════════

  interpretar() {
    const texto = document.getElementById('import-texto-v2')?.value?.trim();
    if (!texto) { showToast('Cole os itens da nota no campo de texto'); return; }

    const itens = this.parseTexto(texto);
    if (!itens.length) { showToast('Nao foi possivel identificar itens. Verifique o formato.'); return; }

    this.itensPreview = itens.map((item, idx) => {
      const match = this.matchCatalogo(item.descOriginal);
      const credito = typeof classificarItemSync === 'function' ? classificarItemSync(match ? match.material.nome : item.descOriginal) : null;
      // GM diretriz 4: confianca baixa → revisao humana
      const confiavel = match && match.score >= 60;
      return {
        idx,
        descOriginal: item.descOriginal,
        qtd: item.qtd,
        unidade: match ? (match.material.unidade || item.unidade) : item.unidade,
        preco: item.preco,
        total: item.qtd * item.preco,
        match,
        descFinal: confiavel ? match.material.nome : item.descOriginal,
        codigoCat: confiavel ? match.material.codigo : null,
        credito: credito ? credito.credito : null,
        creditoCat: credito ? credito.cat : '',
        confirmado: confiavel
      };
    });

    this._renderPreview();
  },

  // ══════════════════════════════════════════════════════════
  // PREVIEW INTERATIVO
  // ══════════════════════════════════════════════════════════

  _renderPreview() {
    const el = document.getElementById('import-preview-v2');
    if (!el) return;

    const matchCount = this.itensPreview.filter(i => i.match && i.match.score >= 60).length;
    const semMatch = this.itensPreview.filter(i => !i.match || i.match.score < 60).length;
    const semPreco = this.itensPreview.filter(i => !i.preco || i.preco <= 0).length;

    let html = `<div style="display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap;">
      <div class="chip-stat chip-stat-ok">${this.itensPreview.length} itens encontrados</div>
      ${matchCount > 0 ? `<div class="chip-stat chip-stat-ok"><span class="material-symbols-outlined" style="font-size:13px;vertical-align:middle;">check</span> ${matchCount} com match</div>` : ''}
      ${semMatch > 0 ? `<div class="chip-stat chip-stat-warn"><span class="material-symbols-outlined" style="font-size:13px;vertical-align:middle;">warning</span> ${semMatch} sem match</div>` : ''}
      ${semPreco > 0 ? `<div class="chip-stat chip-stat-err"><span class="material-symbols-outlined" style="font-size:13px;vertical-align:middle;">error</span> ${semPreco} sem preco</div>` : ''}
    </div>`;

    html += this.itensPreview.map((item, i) => {
      const hasMatch = item.match && item.match.score >= 60;
      const scoreLabel = !item.match ? 'SEM MATCH' : item.match.score >= 80 ? 'MATCH FORTE' : item.match.score >= 60 ? 'MATCH PARCIAL' : 'MATCH FRACO';
      const scoreClass = hasMatch ? (item.match.score >= 80 ? 'badge-ok' : 'badge-warn') : 'badge-err';

      return `
      <div class="import-item-card" style="border:1px solid var(--borda);border-radius:8px;padding:12px;margin-bottom:8px;background:var(--bg3);">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">
          <div style="flex:1;">
            <div style="font-size:10px;color:var(--texto3);margin-bottom:2px;">ITEM NA NOTA:</div>
            <div style="font-size:13px;color:var(--texto2);font-family:'Space Grotesk',monospace;">${typeof esc === 'function' ? esc(item.descOriginal) : item.descOriginal}</div>
          </div>
          <div style="display:flex;align-items:center;gap:6px;">
            <span class="badge ${scoreClass}">${scoreLabel}${item.match ? ' ' + item.match.score + '%' : ''}</span>
            <button onclick="ImportModule.removerItem(${i})" class="btn-icon-sm" title="Remover"><span class="material-symbols-outlined" style="font-size:16px;">close</span></button>
          </div>
        </div>
        <div style="margin-bottom:8px;">
          <div style="font-size:10px;color:var(--verde-hl);margin-bottom:2px;">ITEM EDR (CATALOGO):</div>
          <div style="position:relative;">
            <input type="text" id="import-cat-input-${i}" placeholder="${hasMatch ? item.codigoCat + ' - ' + item.descFinal : 'Buscar no catalogo...'}"
              value="${hasMatch ? item.codigoCat + ' - ' + item.descFinal : ''}"
              oninput="ImportModule._buscarCatInput(${i})" onfocus="ImportModule._buscarCatInput(${i})"
              autocomplete="off"
              class="input-import-cat" style="width:100%;box-sizing:border-box;">
            ${hasMatch ? `<button onclick="ImportModule.selecionarCatalogo(${i},'')" class="btn-icon-sm" style="position:absolute;right:6px;top:8px;" title="Limpar"><span class="material-symbols-outlined" style="font-size:14px;">close</span></button>` : ''}
            <div id="import-cat-list-${i}" class="autocomplete-list hidden"></div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:6px;">
          <div>
            <label class="label-mini">QTD</label>
            <input type="number" value="${item.qtd}" onchange="ImportModule.editarCampo(${i},'qtd',this.value)" class="input-mini input-mono">
          </div>
          <div>
            <label class="label-mini">UNIDADE</label>
            <input type="text" value="${item.unidade}" onchange="ImportModule.editarCampo(${i},'unidade',this.value)" class="input-mini" style="text-transform:uppercase;">
          </div>
          <div>
            <label class="label-mini">PRECO UNIT.</label>
            <input type="number" value="${item.preco}" step="0.01" onchange="ImportModule.editarCampo(${i},'preco',this.value)" class="input-mini input-mono" ${item.preco <= 0 ? 'style="border-color:var(--vermelho);"' : ''}>
          </div>
          <div>
            <label class="label-mini">TOTAL</label>
            <input type="number" value="${item.total.toFixed(2)}" step="0.01" onchange="ImportModule.editarCampo(${i},'total',this.value)" class="input-mini input-mono" style="color:var(--verde-hl);font-weight:700;">
          </div>
        </div>
        ${item.credito !== null ? `
        <div style="margin-top:6px;font-size:10px;font-weight:700;color:${item.credito ? 'var(--verde-hl)' : 'var(--vermelho)'};">
          <span class="material-symbols-outlined" style="font-size:13px;vertical-align:middle;">${item.credito ? 'check_circle' : 'cancel'}</span>
          ${item.credito ? 'GERA CREDITO' : 'SEM CREDITO'} ${item.creditoCat ? '\u2014 ' + item.creditoCat : ''}
        </div>` : `
        <div style="margin-top:6px;display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
          <span style="font-size:10px;color:var(--amarelo);"><span class="material-symbols-outlined" style="font-size:13px;vertical-align:middle;">help</span> Classificar:</span>
          <button onclick="ImportModule._consultarCredito(${i})" class="btn-mini btn-secondary">
            <span class="material-symbols-outlined" style="font-size:12px;vertical-align:middle;">search</span> CONSULTAR
          </button>
          <button onclick="ImportModule.classificar(${i},true)" class="btn-mini btn-ok">
            <span class="material-symbols-outlined" style="font-size:12px;vertical-align:middle;">check</span> CREDITO
          </button>
          <button onclick="ImportModule.classificar(${i},false)" class="btn-mini btn-err">
            <span class="material-symbols-outlined" style="font-size:12px;vertical-align:middle;">close</span> SEM CREDITO
          </button>
          <div id="import-consulta-${i}" style="display:none;margin-top:6px;padding:8px 10px;border-radius:6px;font-size:10px;font-weight:700;width:100%;"></div>
        </div>`}
      </div>`;
    }).join('');

    // Total geral
    const totalGeral = this.itensPreview.reduce((s, i) => s + i.total, 0);
    html += `
      <div style="display:flex;justify-content:space-between;padding:12px;background:var(--bg2);border-radius:8px;margin-top:8px;border:1px solid var(--borda);">
        <span style="font-weight:700;color:var(--texto1);">TOTAL ${this.itensPreview.length} ITENS</span>
        <span style="font-weight:800;color:var(--verde-hl);font-family:'Space Grotesk',monospace;">${fmtR(totalGeral)}</span>
      </div>
    `;

    el.innerHTML = html;
    document.getElementById('import-instrucoes-v2')?.style && (document.getElementById('import-instrucoes-v2').style.display = 'none');

    // Botao confirmar
    const btnWrap = document.getElementById('import-btn-confirmar-wrap');
    if (btnWrap) {
      btnWrap.style.display = 'block';
      const todosClassificados = this.itensPreview.every(i => i.credito !== null);
      const btn = btnWrap.querySelector('button');
      if (btn) {
        btn.style.opacity = todosClassificados ? '1' : '0.5';
        btn.title = todosClassificados ? '' : 'Classifique todos os itens antes de confirmar';
      }
    }
  },

  // ── Acoes do preview ─────────────────────────────────────

  selecionarCatalogo(idx, codigoCat) {
    const item = this.itensPreview[idx];
    if (!codigoCat) {
      item.match = null;
      item.descFinal = item.descOriginal;
      item.codigoCat = null;
      item.confirmado = false;
      const cred = typeof classificarItemSync === 'function' ? classificarItemSync(item.descOriginal) : null;
      item.credito = cred ? cred.credito : null;
      item.creditoCat = cred ? cred.cat : '';
    } else {
      const catalogo = typeof catalogoMateriais !== 'undefined' ? catalogoMateriais : [];
      const mat = catalogo.find(m => m.codigo === codigoCat);
      if (mat) {
        item.match = { material: mat, score: 100, tipo: 'manual' };
        item.descFinal = mat.nome;
        item.codigoCat = mat.codigo;
        item.unidade = mat.unidade || item.unidade;
        item.confirmado = true;
        const cred = typeof classificarItemSync === 'function'
          ? (classificarItemSync(mat.nome, mat.codigo) || classificarItemSync(item.descOriginal, null))
          : null;
        item.credito = cred ? cred.credito : null;
        item.creditoCat = cred ? cred.cat : '';
      }
    }
    this._renderPreview();
  },

  editarCampo(idx, campo, valor) {
    const item = this.itensPreview[idx];
    if (campo === 'qtd') {
      item.qtd = parseFloat(valor) || 0;
      item.total = item.qtd * item.preco;
    } else if (campo === 'preco') {
      item.preco = parseFloat(valor) || 0;
      item.total = item.qtd * item.preco;
    } else if (campo === 'unidade') {
      item.unidade = valor.toUpperCase();
    } else if (campo === 'total') {
      item.total = parseFloat(valor) || 0;
      if (item.qtd > 0) item.preco = +(item.total / item.qtd).toFixed(6);
    }
    this._renderPreview();
  },

  _consultarCredito(idx) {
    const item = this.itensPreview[idx];
    const desc = item.descFinal || item.descOriginal;
    const el = document.getElementById(`import-consulta-${idx}`);
    if (!el) return;

    const v = typeof norm === 'function' ? norm(desc) : desc.toLowerCase();
    let resultado = null;
    if (typeof REGRAS_TRIBUTARIAS !== 'undefined') {
      for (const r of REGRAS_TRIBUTARIAS) {
        for (const p of r.palavras) {
          const pn = typeof norm === 'function' ? norm(p) : p.toLowerCase();
          if (v.includes(pn) || pn.includes(v)) { resultado = r; break; }
        }
        if (resultado) break;
      }
    }

    if (resultado) {
      el.style.background = resultado.credito ? 'rgba(45,106,79,0.08)' : 'rgba(220,38,38,0.08)';
      el.style.color = resultado.credito ? 'var(--verde-hl)' : 'var(--vermelho)';
      el.style.border = resultado.credito ? '1px solid rgba(45,106,79,0.2)' : '1px solid rgba(220,38,38,0.2)';
      el.innerHTML = `<span class="material-symbols-outlined" style="font-size:13px;vertical-align:middle;">${resultado.credito ? 'check_circle' : 'cancel'}</span> ${resultado.motivo}<br>
        <span style="font-size:9px;color:var(--texto3);">Categoria: ${resultado.cat}</span>
        <button onclick="ImportModule.classificar(${idx},${resultado.credito})" class="btn-mini btn-secondary" style="margin-left:8px;">APLICAR</button>`;
    } else {
      el.style.background = 'rgba(183,121,31,0.08)';
      el.style.color = 'var(--amarelo)';
      el.style.border = '1px solid rgba(183,121,31,0.2)';
      el.innerHTML = '<span class="material-symbols-outlined" style="font-size:13px;vertical-align:middle;">warning</span> Item nao encontrado na base tributaria. Classifique manualmente.';
    }
    el.style.display = 'block';
  },

  classificar(idx, credito) {
    this.itensPreview[idx].credito = credito;
    this.itensPreview[idx].creditoCat = credito ? 'Manual \u2014 Gera credito' : 'Manual \u2014 Sem credito';
    this._renderPreview();
  },

  removerItem(idx) {
    this.itensPreview.splice(idx, 1);
    this.itensPreview.forEach((item, i) => item.idx = i);
    if (!this.itensPreview.length) {
      document.getElementById('import-preview-v2').innerHTML = '';
      document.getElementById('import-btn-confirmar-wrap').style.display = 'none';
      const inst = document.getElementById('import-instrucoes-v2');
      if (inst) inst.style.display = '';
    } else {
      this._renderPreview();
    }
  },

  // ══════════════════════════════════════════════════════════
  // CONFIRMAR: entrega JSON pro NotasModule.adicionarItem()
  // ══════════════════════════════════════════════════════════

  async confirmarImport() {
    const naoClassificados = this.itensPreview.filter(i => i.credito === null);
    if (naoClassificados.length) {
      showToast(`Classifique ${naoClassificados.length} item(ns) antes de confirmar`);
      return;
    }

    const semPreco = this.itensPreview.filter(i => i.preco <= 0);
    if (semPreco.length) {
      const ok = await confirmar(`${semPreco.length} item(ns) sem preco unitario. Deseja adicionar mesmo assim?`);
      if (!ok) return;
    }

    // Salvar de-para para proximas importacoes do mesmo fornecedor
    for (const item of this.itensPreview) {
      if (item.cProd && item.codigoCat) {
        this._deParaSet(item._cnpj, item.cProd, item.codigoCat);
      }
    }

    // Entrega cada item como JSON pro NotasModule
    for (const item of this.itensPreview) {
      const res = typeof classificarItemSync === 'function' ? classificarItemSync(item.descFinal) : null;
      const itemData = {
        desc: item.descFinal,
        qtd: item.qtd,
        unidade: item.unidade,
        preco: item.preco,
        total: item.total,
        imposto: 0,
        credito: item.credito,
        cat: res?.cat || item.creditoCat || 'Manual'
      };

      // adicionarItem e funcao global definida em edr-v2-notas.js
      if (typeof adicionarItem === 'function') {
        adicionarItem(itemData);
      } else if (typeof NotasModule !== 'undefined') {
        NotasModule.itens.push(itemData);
      }
    }

    // Garante render mesmo se adicionarItem nao chamou (fallback)
    if (typeof renderItensForm === 'function') renderItensForm();

    showToast(`${this.itensPreview.length} itens adicionados a nota`);
    this.fechar();
  },

  // ── Busca no catalogo com autocomplete ──────────────────

  _buscarCatInput(idx) {
    const input = document.getElementById(`import-cat-input-${idx}`);
    const list = document.getElementById(`import-cat-list-${idx}`);
    if (!input || !list) return;

    const val = input.value.trim();
    if (val.length < 2) { list.classList.add('hidden'); return; }

    const q = typeof norm === 'function' ? norm(val) : val.toLowerCase();
    const numVal = val.replace(/\D/g, '');
    const catalogo = typeof catalogoMateriais !== 'undefined' ? catalogoMateriais : [];

    const matches = catalogo
      .filter(m => {
        const n = typeof norm === 'function' ? norm(m.nome) : m.nome.toLowerCase();
        return n.includes(q) || (numVal && (m.codigo || '').includes(numVal));
      })
      .sort((a, b) => {
        const na = typeof norm === 'function' ? norm(a.nome) : a.nome.toLowerCase();
        const nb = typeof norm === 'function' ? norm(b.nome) : b.nome.toLowerCase();
        const aStart = na.startsWith(q) ? 0 : na.includes(' ' + q) ? 1 : 2;
        const bStart = nb.startsWith(q) ? 0 : nb.includes(' ' + q) ? 1 : 2;
        return aStart - bStart;
      })
      .slice(0, 20);

    if (!matches.length) {
      list.innerHTML = `<div style="padding:8px 10px;font-size:11px;color:var(--texto3);">Nenhum item encontrado</div>
        <div onmousedown="ImportModule._cadastroRapido(${idx},'${typeof esc === 'function' ? esc(val) : val}')" class="autocomplete-item autocomplete-item-add">
          <span class="material-symbols-outlined" style="font-size:14px;">add_circle</span> CADASTRAR NO CATALOGO
        </div>`;
      list.classList.remove('hidden');
      return;
    }

    list.innerHTML = matches.map(m =>
      `<div onmousedown="ImportModule._selecionarCatPorInput(${idx},'${typeof esc === 'function' ? esc(m.codigo) : m.codigo}')" class="autocomplete-item">
        <span class="codigo-cat">${m.codigo}</span>
        <span style="font-size:11px;color:var(--texto1);flex:1;">${m.nome}</span>
        <span style="font-size:10px;color:var(--texto3);">${m.unidade || 'UN'}</span>
      </div>`
    ).join('') + `<div onmousedown="ImportModule._cadastroRapido(${idx},'${typeof esc === 'function' ? esc(val) : val}')" class="autocomplete-item autocomplete-item-add">
      <span class="material-symbols-outlined" style="font-size:14px;">add_circle</span> CADASTRAR NOVO
    </div>`;
    list.classList.remove('hidden');

    input.onblur = () => setTimeout(() => list.classList.add('hidden'), 150);
  },

  _selecionarCatPorInput(idx, codigo) {
    this.selecionarCatalogo(idx, codigo);
  },

  // ── Cadastro rapido inline ──────────────────────────────

  _cadastroRapido(idx, nomeDigitado) {
    this._cadastroIdx = idx;
    this._catCacheVer = 0;
    if (typeof cadastroRapidoMaterial === 'function') {
      cadastroRapidoMaterial(nomeDigitado, 'import');
    }
  },

  // Hook chamado apos salvar cadastro rapido com origem 'import'
  posicaoRapidoCallback(codigo) {
    if (this._cadastroIdx !== null) {
      this._catCacheVer = 0;
      this.selecionarCatalogo(this._cadastroIdx, codigo);
      this._cadastroIdx = null;
    }
  },

  // ══════════════════════════════════════════════════════════
  // DE-PARA INTELIGENTE — cache localStorage de vinculacoes
  // Chave: edr_dp_{cnpj}:{cProd}  Valor: codigo do catalogo EDR
  // ══════════════════════════════════════════════════════════

  _deParaKey(cnpj, cProd) {
    const c = (cnpj || '').replace(/\D/g, '');
    const p = (cProd || '').trim().toUpperCase();
    return `edr_dp_${c}:${p}`;
  },

  _deParaGet(cnpj, cProd) {
    if (!cProd) return null;
    try { return localStorage.getItem(this._deParaKey(cnpj, cProd)) || null; } catch(e) { return null; }
  },

  _deParaSet(cnpj, cProd, codigoCat) {
    if (!cProd || !codigoCat) return;
    try { localStorage.setItem(this._deParaKey(cnpj, cProd), codigoCat); } catch(e) { }
  },

  // ══════════════════════════════════════════════════════════
  // IMPORTACAO VIA XML NF-e — PRESERVADA 100%
  // ══════════════════════════════════════════════════════════

  abrirXML() {
    const input = document.getElementById('input-xml-nfe-v2');
    if (input) { input.value = ''; input.click(); }
  },

  processarXML(input) {
    const file = input.files[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.xml')) {
      showToast('Selecione um arquivo .xml'); return;
    }
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const parser = new DOMParser();
        const xml = parser.parseFromString(e.target.result, 'text/xml');
        if (xml.querySelector('parsererror')) { showToast('XML invalido. Verifique o arquivo.'); return; }
        const nfe = this._extrairDadosNFe(xml);
        if (!nfe) { showToast('Nao foi possivel ler a NF-e. Verifique se e um XML de nota fiscal.'); return; }
        this._preencherFormComXML(nfe);
      } catch (err) {
        console.error('ImportModule XML erro:', err);
        showToast('Nao foi possivel processar o XML');
      }
    };
    reader.readAsText(file);
  },

  _extrairDadosNFe(xml) {
    const getTag = (parent, tag) => {
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

    const emit = getTag(xml, 'emit');
    const fornecedor = emit ? getVal(emit, 'xNome') : '';
    const cnpj = emit ? getVal(emit, 'CNPJ') : '';

    const ide = getTag(xml, 'ide');
    const numero = ide ? getVal(ide, 'nNF') : '';
    const serie = ide ? getVal(ide, 'serie') : '';
    const natureza = ide ? getVal(ide, 'natOp') : '';
    const dataEmissao = ide ? (getVal(ide, 'dhEmi') || getVal(ide, 'dEmi')) : '';

    const total = getTag(xml, 'ICMSTot');
    const valorBruto = total ? parseFloat(getVal(total, 'vProd')) || 0 : 0;
    const frete = total ? parseFloat(getVal(total, 'vFrete')) || 0 : 0;
    // vNF = total real da nota (já inclui IPI, frete e demais impostos)
    const vNF = total ? parseFloat(getVal(total, 'vNF')) || 0 : 0;

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
      const vProdItem = parseFloat(getVal(prod, 'vProd')) || qtd * preco;
      // Captura IPI: tenta IPITrib primeiro, depois IPINT
      const ipiNode = getTag(det, 'IPI');
      let vIPI = 0;
      if (ipiNode) {
        const ipiTrib = getTag(ipiNode, 'IPITrib');
        const ipiNT   = getTag(ipiNode, 'IPINT');
        vIPI = parseFloat(getVal(ipiTrib || ipiNT || ipiNode, 'vIPI')) || 0;
      }
      const totalItem = Math.round((vProdItem + vIPI) * 100) / 100;
      const cProd = getVal(prod, 'cProd') || '';
      if (desc) itens.push({ descOriginal: desc, qtd, preco, unidade, total: totalItem, cProd });
    }

    let dataFormatada = '';
    if (dataEmissao) dataFormatada = dataEmissao.substring(0, 10);

    return { fornecedor, cnpj, numero, serie, natureza, dataEmissao: dataFormatada, valorBruto, frete, vNF, itens };
  },

  _preencherFormComXML(nfe) {
    // Preencher cabecalho da NF (compativel com V2 NotasModule)
    const setVal = (id, val) => { const el = document.getElementById(id); if (el && val) el.value = val; };
    // Numero inclui serie quando disponivel (ex: 123456/1) — padrão NF-e
    const numComSerie = (nfe.serie && nfe.serie !== '') ? `${nfe.numero}/${nfe.serie}` : nfe.numero;
    setVal('f-numero', numComSerie);
    // Fornecedor: usa nome cadastrado se CNPJ já existe, senão normaliza o nome do XML
    const _cnpjCheck = (nfe.cnpj || '').replace(/\D/g, '');
    const _fornExist = _cnpjCheck.length === 14 && Array.isArray(notas)
      ? notas.find(n => n.cnpj && n.cnpj.replace(/\D/g, '') === _cnpjCheck)
      : null;
    const _nomeForn = _fornExist
      ? _fornExist.fornecedor
      : (typeof _normForn === 'function' ? _normForn(nfe.fornecedor) : nfe.fornecedor.toUpperCase());
    setVal('f-fornecedor', _nomeForn);

    if (nfe.cnpj) {
      let c = nfe.cnpj.replace(/\D/g, '');
      if (c.length === 14) c = c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
      setVal('f-cnpj', c);
    }

    setVal('f-emissao', nfe.dataEmissao);
    const recebEl = document.getElementById('f-recebimento');
    if (recebEl) recebEl.value = new Date().toISOString().split('T')[0];
    if (nfe.frete > 0) setVal('f-frete', nfe.frete);

    const natEl = document.getElementById('f-natureza');
    if (natEl && nfe.natureza) {
      const natNorm = nfe.natureza.toLowerCase();
      if (natNorm.includes('venda')) natEl.value = 'VENDA';
      else if (natNorm.includes('bonif')) natEl.value = 'BONIFICACAO';
      else if (natNorm.includes('devol')) natEl.value = 'DEVOLUCAO';
      else if (natNorm.includes('transf')) natEl.value = 'TRANSFERENCIA';
    }

    // Processar itens com de-para inteligente + match do catalogo
    const cnpjDigits = (nfe.cnpj || '').replace(/\D/g, '');
    this.itensPreview = nfe.itens.map((item, idx) => {
      // Passo 1: De-Para — vinculacao salva de importacoes anteriores
      let match = null;
      const codigoDePara = this._deParaGet(cnpjDigits, item.cProd);
      if (codigoDePara) {
        const catalogo = typeof catalogoMateriais !== 'undefined' ? catalogoMateriais : [];
        const matDP = catalogo.find(m => m.codigo === codigoDePara);
        if (matDP) match = { material: matDP, score: 100, tipo: 'depara' };
      }
      // Passo 2: Match por nome (fallback)
      if (!match) match = this.matchCatalogo(item.descOriginal);
      const confiavel = match && match.score >= 60;
      const credito = typeof classificarItemSync === 'function' ? classificarItemSync(match ? match.material.nome : item.descOriginal) : null;
      return {
        idx,
        descOriginal: item.descOriginal,
        cProd: item.cProd || '',
        _cnpj: cnpjDigits,
        qtd: item.qtd,
        unidade: confiavel ? (match.material.unidade || item.unidade) : item.unidade,
        preco: item.preco,
        total: item.total || item.qtd * item.preco,
        match,
        descFinal: confiavel ? match.material.nome : item.descOriginal,
        codigoCat: confiavel ? match.material.codigo : null,
        credito: credito ? credito.credito : null,
        creditoCat: credito ? credito.cat : '',
        confirmado: confiavel
      };
    });

    // Preencher campo texto com info do XML
    const textarea = document.getElementById('import-texto-v2');
    if (textarea) textarea.value = `[Importado do XML] ${nfe.fornecedor} \u2014 NF ${nfe.numero}\n${nfe.itens.length} itens extraidos automaticamente`;

    this._renderPreview();
    showToast(`XML importado: ${nfe.itens.length} itens - ${nfe.fornecedor} - NF ${nfe.numero}`);

    // Fornecedor já resolvido acima via CNPJ antes de preencher o form
  }
};

// Compatibilidade: hooks globais para cadastro rapido
function importPosicaoRapidoCallback(codigo) {
  ImportModule.posicaoRapidoCallback(codigo);
}
