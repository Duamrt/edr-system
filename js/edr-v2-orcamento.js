// ══════════════════════════════════════════════════════════════
// EDR V2 — Orcamento Parametrico
// Estado encapsulado, INCC com cache localStorage 15d,
// ExcelJS em vez de HTML-hack, fmtN() via utils-extras.js
// ══════════════════════════════════════════════════════════════

const OrcamentoModule = {
  // ── Estado ─────────────────────────────────────────────
  dadosCalc: null,
  _inccInfo: '',

  // ── Cache INCC — localStorage com TTL 15 dias ─────────
  _INCC_CACHE_KEY: 'edr_incc_cache',
  _INCC_TTL_MS: 15 * 24 * 60 * 60 * 1000,

  _getInccCache(modeloId) {
    try {
      const raw = localStorage.getItem(this._INCC_CACHE_KEY);
      if (!raw) return null;
      const cache = JSON.parse(raw);
      if (cache.modeloId !== modeloId) return null;
      if (Date.now() - cache.ts > this._INCC_TTL_MS) return null;
      return cache;
    } catch (e) { return null; }
  },

  _setInccCache(modeloId, pctAcumulado, info) {
    try {
      localStorage.setItem(this._INCC_CACHE_KEY, JSON.stringify({
        modeloId: modeloId,
        pct: pctAcumulado,
        info: info,
        ts: Date.now()
      }));
    } catch (e) {}
  },

  // ══════════════════════════════════════════════════════════
  // RENDER PRINCIPAL
  // ══════════════════════════════════════════════════════════

  async render() {
    const el = document.getElementById('orcamento-container');
    if (!el) return;

    // Skeleton
    el.innerHTML = '<div style="padding:32px 0;">'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;">'
        + '<div style="width:100px;height:36px;background:var(--bg3);border-radius:8px;"></div>'
        + '<div style="width:100px;height:36px;background:var(--bg3);border-radius:8px;"></div>'
        + '<div style="width:100px;height:36px;background:var(--bg3);border-radius:8px;"></div>'
      + '</div>'
      + '<div style="width:100%;height:120px;background:var(--bg3);border-radius:10px;margin-bottom:12px;"></div>'
      + '<div style="width:100%;height:300px;background:var(--bg3);border-radius:10px;"></div>'
      + '</div>';

    requestAnimationFrame(() => {
      const concluidas = (typeof obrasArquivadas !== 'undefined' ? obrasArquivadas : [])
        .filter(o => Number(o.area_m2) > 0);

      el.innerHTML = '<div style="margin:16px 0;">'
        + '<label style="font-size:10px;font-weight:700;color:var(--texto3);text-transform:uppercase;letter-spacing:1px;font-family:\'Space Grotesk\',sans-serif;">Obra modelo</label>'
        + '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;" id="orc-modelos">'
          + concluidas.map(o =>
            '<button onclick="OrcamentoModule._selecionarModelo(\'' + o.id + '\')" id="orc-btn-' + o.id + '" style="padding:8px 16px;border-radius:8px;border:1px solid var(--borda);background:var(--bg2);color:var(--texto);font-size:12px;font-weight:600;cursor:pointer;transition:all 0.2s;">'
            + esc(o.nome) + '<span style="font-size:10px;color:var(--texto3);margin-left:4px;">' + Number(o.area_m2).toFixed(0) + 'm\u00B2</span></button>'
          ).join('')
        + '</div>'
        + '<input type="hidden" id="orc-modelo" value="">'
        + '</div>'
        + '<div style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;margin:12px 0;">'
          + '<div style="min-width:140px;">'
            + '<label style="font-size:10px;font-weight:700;color:var(--texto3);text-transform:uppercase;letter-spacing:1px;font-family:\'Space Grotesk\',sans-serif;">Area nova (m\u00B2)</label>'
            + '<input id="orc-area" type="number" step="0.01" placeholder="Ex: 80" oninput="OrcamentoModule._calcular()" style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--borda);background:var(--bg2);color:var(--texto);font-size:13px;margin-top:4px;">'
          + '</div>'
          + '<div style="min-width:180px;">'
            + '<label style="font-size:10px;font-weight:700;color:var(--texto3);text-transform:uppercase;letter-spacing:1px;font-family:\'Space Grotesk\',sans-serif;">Correcao INCC %</label>'
            + '<div style="display:flex;gap:6px;align-items:center;margin-top:4px;">'
              + '<input id="orc-correcao" type="number" step="0.1" value="0" placeholder="0" oninput="OrcamentoModule._calcular()" style="width:80px;padding:10px;border-radius:8px;border:1px solid var(--borda);background:var(--bg2);color:var(--texto);font-size:13px;">'
              + '<span id="orc-incc-info" style="font-size:10px;color:var(--texto4);line-height:1.3;max-width:200px;"></span>'
            + '</div>'
          + '</div>'
          + '<div style="flex:1;min-width:160px;">'
            + '<label style="font-size:10px;font-weight:700;color:var(--texto3);text-transform:uppercase;letter-spacing:1px;font-family:\'Space Grotesk\',sans-serif;">Cliente (opcional)</label>'
            + '<input id="orc-cliente" type="text" placeholder="Nome do cliente" style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--borda);background:var(--bg2);color:var(--texto);font-size:13px;margin-top:4px;">'
          + '</div>'
          + '<button class="btn-save" onclick="OrcamentoModule._exportarExcel()" style="padding:10px 20px;font-size:12px;white-space:nowrap;">'
            + '<span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">table_view</span> EXPORTAR EXCEL</button>'
          + '<button class="btn-outline" onclick="PdfModule.gerarOrcamento()" style="padding:10px 16px;font-size:12px;white-space:nowrap;">'
            + '<span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">picture_as_pdf</span> PDF</button>'
        + '</div>'
        + '<div id="orc-resumo" style="display:none;margin-bottom:16px;">'
          + '<div style="display:flex;flex-wrap:wrap;gap:10px;" id="orc-cards"></div>'
        + '</div>'
        + '<div id="orc-tabela" style="margin-top:8px;"></div>'
        + '<div id="orc-aviso" style="padding:40px;text-align:center;color:var(--texto3);font-size:13px;">'
          + '<span class="material-symbols-outlined" style="font-size:48px;color:var(--texto4);display:block;margin-bottom:12px;">calculate</span>'
          + 'Selecione uma obra concluida como modelo e informe a area desejada.'
        + '</div>';
    });
  },

  // ══════════════════════════════════════════════════════════
  // SELECAO DE MODELO
  // ══════════════════════════════════════════════════════════

  _selecionarModelo(id) {
    document.getElementById('orc-modelo').value = id;
    document.querySelectorAll('#orc-modelos button').forEach(function(btn) {
      const ativo = btn.id === 'orc-btn-' + id;
      btn.style.background = ativo ? 'var(--primary)' : 'var(--bg2)';
      btn.style.color = ativo ? '#fff' : 'var(--texto)';
      btn.style.borderColor = ativo ? 'var(--primary)' : 'var(--borda)';
    });
    this._buscarINCC(id);
    this._calcular();
  },

  // ══════════════════════════════════════════════════════════
  // INCC — Banco Central (serie 192 = INCC-DI mensal)
  // Cache localStorage 15 dias
  // ══════════════════════════════════════════════════════════

  async _buscarINCC(modeloId) {
    const infoEl = document.getElementById('orc-incc-info');
    if (!infoEl) return;

    const lancRef = typeof lancamentos !== 'undefined' ? lancamentos : [];
    const lancModelo = lancRef.filter(l => l.obra_id === modeloId);
    if (!lancModelo.length) { infoEl.textContent = 'Sem lancamentos'; return; }

    const datas = lancModelo.map(l => l.data).filter(Boolean).sort();
    const ultimaData = datas[datas.length - 1];
    if (!ultimaData) { infoEl.textContent = ''; return; }

    const mesBase = new Date(ultimaData + 'T12:00:00');
    const hoje = new Date();

    // Mesmo mes = sem correcao
    if (mesBase.getFullYear() === hoje.getFullYear() && mesBase.getMonth() === hoje.getMonth()) {
      infoEl.innerHTML = '<span style="color:var(--primary);">Base atual</span>';
      return;
    }

    // Verificar cache
    const cached = this._getInccCache(modeloId);
    if (cached) {
      this._inccInfo = cached.info;
      this._aplicarINCC(cached.pct, cached.info, infoEl);
      return;
    }

    infoEl.innerHTML = 'Buscando INCC...';

    try {
      const mesSeguinte = new Date(mesBase.getFullYear(), mesBase.getMonth() + 1, 1);
      const dataIni = ('0' + mesSeguinte.getDate()).slice(-2) + '/' + ('0' + (mesSeguinte.getMonth() + 1)).slice(-2) + '/' + mesSeguinte.getFullYear();
      const dataFim = ('0' + hoje.getDate()).slice(-2) + '/' + ('0' + (hoje.getMonth() + 1)).slice(-2) + '/' + hoje.getFullYear();

      const url = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.192/dados?formato=json&dataInicial=' + dataIni + '&dataFinal=' + dataFim;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error('API indisponivel');
      const dados = await resp.json();

      if (!dados.length) {
        infoEl.innerHTML = '<span style="color:var(--texto4);">Sem dados INCC no periodo</span>';
        return;
      }

      // Acumulado composto
      let acumulado = 1;
      dados.forEach(function(d) { acumulado *= (1 + parseFloat(d.valor) / 100); });
      const pctAcumulado = (acumulado - 1) * 100;

      const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
      const mesIniLabel = MESES[mesSeguinte.getMonth()] + '/' + mesSeguinte.getFullYear();
      const ultimoDado = dados[dados.length - 1].data.split('/');
      const mesFimLabel = MESES[parseInt(ultimoDado[1]) - 1] + '/' + ultimoDado[2];

      const info = mesIniLabel + ' a ' + mesFimLabel + ': ' + pctAcumulado.toFixed(1) + '%';

      // Salvar cache
      this._setInccCache(modeloId, pctAcumulado, info);
      this._inccInfo = info;
      this._aplicarINCC(pctAcumulado, info, infoEl);

    } catch (e) {
      console.error('INCC fetch error:', e);
      infoEl.innerHTML = '<span style="color:var(--texto4);">INCC indisponivel \u00B7 insira manual</span>';
    }
  },

  _aplicarINCC(pct, info, infoEl) {
    const correcaoInput = document.getElementById('orc-correcao');
    if (correcaoInput && parseFloat(correcaoInput.value) === 0) {
      correcaoInput.value = pct.toFixed(1);
      this._calcular();
    }
    infoEl.innerHTML = '<span style="color:#B7791F;">INCC ' + info + '</span><br><span style="font-size:9px;color:var(--texto4);">Fonte: BCB \u00B7 Ajuste livre</span>';
  },

  // ══════════════════════════════════════════════════════════
  // CALCULO PARAMETRICO
  // ══════════════════════════════════════════════════════════

  _calcular() {
    const modeloId = document.getElementById('orc-modelo')?.value;
    const areaNova = parseFloat(document.getElementById('orc-area')?.value) || 0;
    const correcaoPct = parseFloat(document.getElementById('orc-correcao')?.value) || 0;
    const fatorCorrecao = 1 + (correcaoPct / 100);
    const avisoEl = document.getElementById('orc-aviso');
    const resumoEl = document.getElementById('orc-resumo');
    const tabelaEl = document.getElementById('orc-tabela');
    const cardsEl = document.getElementById('orc-cards');

    if (!modeloId || areaNova <= 0) {
      if (avisoEl) avisoEl.style.display = '';
      if (resumoEl) resumoEl.style.display = 'none';
      if (tabelaEl) tabelaEl.innerHTML = '';
      this.dadosCalc = null;
      return;
    }
    if (avisoEl) avisoEl.style.display = 'none';
    if (resumoEl) resumoEl.style.display = '';

    const todasObras = [
      ...(typeof obras !== 'undefined' ? obras : []),
      ...(typeof obrasArquivadas !== 'undefined' ? obrasArquivadas : [])
    ];
    const modelo = todasObras.find(o => o.id === modeloId);
    if (!modelo) return;

    const areaModelo = Number(modelo.area_m2) || 1;
    const lancRef = typeof lancamentos !== 'undefined' ? lancamentos : [];
    const lancModelo = lancRef.filter(l => l.obra_id === modeloId);

    // Agrupar por etapa com detalhamento
    const porEtapa = {};
    let totalModelo = 0;

    lancModelo.forEach(function(l) {
      const etapa = (typeof resolveEtapaKey === 'function') ? resolveEtapaKey(l.etapa || '36_outros') : (l.etapa || '36_outros');
      if (!porEtapa[etapa]) porEtapa[etapa] = { total: 0, itens: [] };
      const val = Number(l.total || 0);
      porEtapa[etapa].total += val;
      porEtapa[etapa].itens.push({
        descricao: l.descricao || 'Sem descricao',
        qtd: Number(l.qtd || 0),
        preco: Number(l.preco || 0),
        total: val,
        data: l.data || ''
      });
      totalModelo += val;
    });

    // Indices com correcao
    const custoM2Modelo = (totalModelo / areaModelo) * fatorCorrecao;
    const totalEstimado = custoM2Modelo * areaNova;
    const valorVenda = Number(modelo.valor_venda || 0);
    const vendaM2 = valorVenda > 0 ? (valorVenda / areaModelo) * fatorCorrecao : 0;
    const vendaEstimada = vendaM2 * areaNova;
    const lucroEstimado = vendaEstimada > 0 ? vendaEstimada - totalEstimado : 0;
    const margemEstimada = vendaEstimada > 0 ? (lucroEstimado / vendaEstimada * 100) : 0;

    // Cards resumo
    const correcaoTag = correcaoPct > 0 ? '<span style="font-size:9px;color:#B7791F;margin-left:4px;">+' + correcaoPct + '%</span>' : '';
    if (cardsEl) {
      cardsEl.innerHTML = '<div style="flex:1;min-width:140px;background:var(--bg2);border:1px solid var(--borda);border-radius:10px;padding:14px;text-align:center;">'
        + '<div style="font-size:10px;color:var(--texto3);font-weight:700;text-transform:uppercase;font-family:\'Space Grotesk\',sans-serif;">Custo Estimado' + correcaoTag + '</div>'
        + '<div style="font-size:20px;font-weight:800;color:#dc2626;margin-top:4px;font-family:\'Space Grotesk\',sans-serif;">R$ ' + fmtN(totalEstimado) + '</div>'
        + '<div style="font-size:10px;color:var(--texto4);margin-top:2px;">R$ ' + fmtN(custoM2Modelo) + '/m\u00B2</div>'
        + '</div>'
        + (vendaEstimada > 0 ? '<div style="flex:1;min-width:140px;background:var(--bg2);border:1px solid var(--borda);border-radius:10px;padding:14px;text-align:center;">'
          + '<div style="font-size:10px;color:var(--texto3);font-weight:700;text-transform:uppercase;font-family:\'Space Grotesk\',sans-serif;">Venda Estimada' + correcaoTag + '</div>'
          + '<div style="font-size:20px;font-weight:800;color:#2563eb;margin-top:4px;font-family:\'Space Grotesk\',sans-serif;">R$ ' + fmtN(vendaEstimada) + '</div>'
          + '<div style="font-size:10px;color:var(--texto4);margin-top:2px;">R$ ' + fmtN(vendaM2) + '/m\u00B2</div>'
          + '</div>'
          + '<div style="flex:1;min-width:140px;background:var(--bg2);border:1px solid var(--borda);border-radius:10px;padding:14px;text-align:center;">'
            + '<div style="font-size:10px;color:var(--texto3);font-weight:700;text-transform:uppercase;font-family:\'Space Grotesk\',sans-serif;">Lucro Estimado</div>'
            + '<div style="font-size:20px;font-weight:800;color:var(--primary);margin-top:4px;font-family:\'Space Grotesk\',sans-serif;">R$ ' + fmtN(lucroEstimado) + '</div>'
            + '<div style="font-size:10px;color:var(--texto4);margin-top:2px;">' + margemEstimada.toFixed(1) + '% margem</div>'
          + '</div>' : '')
        + '<div style="flex:1;min-width:140px;background:var(--bg2);border:1px solid var(--borda);border-radius:10px;padding:14px;text-align:center;">'
          + '<div style="font-size:10px;color:var(--texto3);font-weight:700;text-transform:uppercase;font-family:\'Space Grotesk\',sans-serif;">Base</div>'
          + '<div style="font-size:15px;font-weight:700;color:var(--texto);margin-top:4px;">' + esc(modelo.nome) + '</div>'
          + '<div style="font-size:10px;color:var(--texto4);margin-top:2px;">' + areaModelo.toFixed(0) + 'm\u00B2 \u2192 ' + areaNova.toFixed(0) + 'm\u00B2</div>'
        + '</div>';
    }

    // Tabela por etapa
    const etapasOrdenadas = Object.entries(porEtapa)
      .map(function(entry) {
        const key = entry[0], dados = entry[1];
        return {
          key: key,
          label: typeof etapaLabel === 'function' ? etapaLabel(key) : key,
          totalModelo: dados.total,
          porM2: (dados.total / areaModelo) * fatorCorrecao,
          estimado: (dados.total / areaModelo) * fatorCorrecao * areaNova,
          pct: totalModelo > 0 ? (dados.total / totalModelo * 100) : 0,
          itens: dados.itens.sort(function(a, b) { return b.total - a.total; })
        };
      })
      .sort(function(a, b) { return b.estimado - a.estimado; });

    // Cache pra export
    this.dadosCalc = {
      modelo: modelo, areaModelo: areaModelo, areaNova: areaNova,
      custoM2Modelo: custoM2Modelo, totalEstimado: totalEstimado,
      vendaEstimada: vendaEstimada, lucroEstimado: lucroEstimado,
      margemEstimada: margemEstimada, etapasOrdenadas: etapasOrdenadas,
      correcaoPct: correcaoPct, fatorCorrecao: fatorCorrecao
    };

    if (tabelaEl) {
      let tbody = '';
      etapasOrdenadas.forEach(function(e, i) {
        // Linha da etapa (clicavel)
        const corEtapa = typeof etapaCor === 'function' ? etapaCor(e.key) : 'var(--primary)';
        tbody += '<tr onclick="OrcamentoModule._toggleDetalhe(\'orc-det-' + i + '\')" style="border-bottom:1px solid var(--borda);cursor:pointer;' + (i % 2 ? 'background:var(--bg2);' : '') + '" onmouseover="this.style.background=\'rgba(45,106,79,0.06)\'" onmouseout="this.style.background=\'' + (i % 2 ? 'var(--bg2)' : '') + '\'">'
          + '<td style="padding:8px 12px;font-weight:600;color:var(--texto);"><span class="material-symbols-outlined" style="font-size:12px;color:var(--texto4);vertical-align:middle;margin-right:4px;">chevron_right</span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + corEtapa + ';margin-right:6px;vertical-align:middle;"></span>' + esc(e.label) + '</td>'
          + '<td style="padding:8px 12px;text-align:right;color:var(--texto2);font-family:\'Space Grotesk\',monospace;">R$ ' + fmtN(e.porM2) + '</td>'
          + '<td style="padding:8px 12px;text-align:right;font-weight:700;color:var(--texto);font-family:\'Space Grotesk\',monospace;">R$ ' + fmtN(e.estimado) + '</td>'
          + '<td style="padding:8px 12px;text-align:right;color:var(--texto3);font-family:\'Space Grotesk\',monospace;">' + e.pct.toFixed(1) + '%</td>'
          + '<td style="padding:8px 12px;"><div style="background:var(--bg3);border-radius:4px;height:8px;overflow:hidden;"><div style="background:' + corEtapa + ';height:100%;width:' + e.pct + '%;border-radius:4px;"></div></div></td>'
          + '</tr>';

        // Detalhamento escondido
        let itensHtml = '';
        e.itens.forEach(function(item) {
          const proj = (item.total / areaModelo) * fatorCorrecao * areaNova;
          itensHtml += '<tr style="border-bottom:1px solid var(--borda);">'
            + '<td style="padding:5px 8px;color:var(--texto2);">' + esc(item.descricao) + '</td>'
            + '<td style="padding:5px 8px;text-align:right;color:var(--texto3);font-family:\'Space Grotesk\',monospace;">' + (item.qtd || '\u2014') + '</td>'
            + '<td style="padding:5px 8px;text-align:right;color:var(--texto3);font-family:\'Space Grotesk\',monospace;">' + (item.preco ? 'R$ ' + fmtN(item.preco) : '\u2014') + '</td>'
            + '<td style="padding:5px 8px;text-align:right;color:var(--texto3);font-family:\'Space Grotesk\',monospace;">R$ ' + fmtN(item.total) + '</td>'
            + '<td style="padding:5px 8px;text-align:right;color:var(--texto);font-weight:600;font-family:\'Space Grotesk\',monospace;">R$ ' + fmtN(proj) + '</td>'
            + '</tr>';
        });

        tbody += '<tr id="orc-det-' + i + '" style="display:none;"><td colspan="5" style="padding:0;">'
          + '<div style="background:rgba(45,106,79,0.03);border-left:3px solid var(--primary);padding:8px 12px 8px 24px;">'
          + '<table style="width:100%;border-collapse:collapse;font-size:11px;"><thead><tr>'
            + '<th style="text-align:left;padding:4px 8px;color:var(--texto4);font-size:9px;font-weight:700;text-transform:uppercase;font-family:\'Space Grotesk\',sans-serif;">Insumo</th>'
            + '<th style="text-align:right;padding:4px 8px;color:var(--texto4);font-size:9px;font-weight:700;text-transform:uppercase;font-family:\'Space Grotesk\',sans-serif;">Qtd</th>'
            + '<th style="text-align:right;padding:4px 8px;color:var(--texto4);font-size:9px;font-weight:700;text-transform:uppercase;font-family:\'Space Grotesk\',sans-serif;">Preco un.</th>'
            + '<th style="text-align:right;padding:4px 8px;color:var(--texto4);font-size:9px;font-weight:700;text-transform:uppercase;font-family:\'Space Grotesk\',sans-serif;">Total base</th>'
            + '<th style="text-align:right;padding:4px 8px;color:var(--texto4);font-size:9px;font-weight:700;text-transform:uppercase;font-family:\'Space Grotesk\',sans-serif;">Projetado</th>'
          + '</tr></thead><tbody>' + itensHtml + '</tbody></table></div></td></tr>';
      });

      tabelaEl.innerHTML = '<div style="font-size:10px;color:var(--texto4);margin-bottom:6px;">Clique na etapa para ver o detalhamento de insumos</div>'
        + '<table style="width:100%;border-collapse:collapse;font-size:12px;"><thead><tr style="background:var(--bg3);border-bottom:2px solid var(--borda);">'
          + '<th style="text-align:left;padding:10px 12px;font-size:10px;font-weight:700;color:var(--texto3);text-transform:uppercase;font-family:\'Space Grotesk\',sans-serif;">Etapa</th>'
          + '<th style="text-align:right;padding:10px 12px;font-size:10px;font-weight:700;color:var(--texto3);text-transform:uppercase;font-family:\'Space Grotesk\',sans-serif;">R$/m\u00B2</th>'
          + '<th style="text-align:right;padding:10px 12px;font-size:10px;font-weight:700;color:var(--texto3);text-transform:uppercase;font-family:\'Space Grotesk\',sans-serif;">Estimado</th>'
          + '<th style="text-align:right;padding:10px 12px;font-size:10px;font-weight:700;color:var(--texto3);text-transform:uppercase;font-family:\'Space Grotesk\',sans-serif;">%</th>'
          + '<th style="text-align:left;padding:10px 12px;font-size:10px;font-weight:700;color:var(--texto3);text-transform:uppercase;font-family:\'Space Grotesk\',sans-serif;width:25%;">Peso</th>'
        + '</tr></thead><tbody>'
        + tbody
        + '<tr style="background:var(--bg3);border-top:2px solid var(--borda);">'
          + '<td style="padding:10px 12px;font-weight:800;color:var(--texto);font-size:13px;">TOTAL</td>'
          + '<td style="padding:10px 12px;text-align:right;font-weight:800;color:var(--texto);font-family:\'Space Grotesk\',monospace;font-size:13px;">R$ ' + fmtN(custoM2Modelo) + '</td>'
          + '<td style="padding:10px 12px;text-align:right;font-weight:800;color:var(--texto);font-family:\'Space Grotesk\',monospace;font-size:13px;">R$ ' + fmtN(totalEstimado) + '</td>'
          + '<td style="padding:10px 12px;text-align:right;font-weight:800;color:var(--texto);font-family:\'Space Grotesk\',monospace;">100%</td>'
          + '<td></td></tr></tbody></table>';
    }
  },

  _toggleDetalhe(id) {
    const row = document.getElementById(id);
    if (!row) return;
    const aberto = row.style.display !== 'none';
    row.style.display = aberto ? 'none' : '';
    const etapaRow = row.previousElementSibling;
    if (etapaRow) {
      const icon = etapaRow.querySelector('.material-symbols-outlined');
      if (icon) icon.textContent = aberto ? 'chevron_right' : 'expand_more';
    }
  },

  // ══════════════════════════════════════════════════════════
  // EXPORT EXCEL — ExcelJS (consistente com Estoque)
  // ══════════════════════════════════════════════════════════

  async _exportarExcel() {
    const d = this.dadosCalc;
    if (!d) { showToast('Selecione modelo e informe a area.'); return; }

    try {
      if (typeof ExcelJS === 'undefined') {
        showToast('Biblioteca Excel indisponivel. Verifique sua conexao.');
        return;
      }

      const cliente = document.getElementById('orc-cliente')?.value || 'Sem nome';
      const hoje = new Date().toLocaleDateString('pt-BR');
      const inccTexto = d.correcaoPct > 0 ? 'Correcao INCC: +' + d.correcaoPct + '%' + (this._inccInfo ? ' (' + this._inccInfo + ')' : '') : '';

      const wb = new ExcelJS.Workbook();
      wb.creator = 'EDR Engenharia';
      const ws = wb.addWorksheet('Orcamento');

      // Larguras de coluna
      ws.columns = [
        { width: 35 }, // Etapa/Insumo
        { width: 15 }, // R$/m2
        { width: 18 }, // Estimado
        { width: 10 }  // %
      ];

      const verde = '2D6A4F';
      const verdeEscuro = '1B4332';
      const cinza = 'F3F4F6';

      // ── Header EDR ──
      ws.mergeCells('A1:D1');
      const h1 = ws.getCell('A1');
      h1.value = 'EDR ENGENHARIA';
      h1.font = { bold: true, size: 16, color: { argb: 'FFFFFF' } };
      h1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: verdeEscuro } };
      h1.alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getRow(1).height = 36;

      ws.mergeCells('A2:D2');
      const h2 = ws.getCell('A2');
      h2.value = 'CNPJ 49.909.440/0001-55 \u00B7 Jupi-PE \u00B7 (87) 9 8171-3987';
      h2.font = { size: 9, color: { argb: '9CA3AF' } };
      h2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: verdeEscuro } };
      h2.alignment = { horizontal: 'center' };

      // ── Info ──
      ws.addRow([]);
      ws.addRow(['Cliente:', cliente, 'Data:', hoje]);
      ws.addRow(['Area:', d.areaNova.toFixed(2) + ' m\u00B2', 'Base:', d.modelo.nome + ' (' + d.areaModelo.toFixed(0) + 'm\u00B2)']);
      if (inccTexto) ws.addRow([inccTexto]);
      ws.addRow([]);

      // ── Resumo ──
      const resumoRow = ws.addRow(['Custo Estimado', 'Venda Estimada', 'Lucro Estimado', 'Margem']);
      resumoRow.font = { bold: true, size: 10, color: { argb: '6B7280' } };

      const valoresRow = ws.addRow([
        'R$ ' + fmtN(d.totalEstimado),
        d.vendaEstimada > 0 ? 'R$ ' + fmtN(d.vendaEstimada) : '-',
        d.lucroEstimado > 0 ? 'R$ ' + fmtN(d.lucroEstimado) : '-',
        d.margemEstimada > 0 ? d.margemEstimada.toFixed(1) + '%' : '-'
      ]);
      valoresRow.font = { bold: true, size: 12 };
      valoresRow.getCell(1).font = { bold: true, size: 12, color: { argb: 'DC2626' } };
      if (d.vendaEstimada > 0) valoresRow.getCell(2).font = { bold: true, size: 12, color: { argb: '2563EB' } };
      if (d.lucroEstimado > 0) valoresRow.getCell(3).font = { bold: true, size: 12, color: { argb: verde } };

      ws.addRow([]);

      // ── Header tabela ──
      const headerRow = ws.addRow(['Etapa / Insumo', 'R$/m\u00B2', 'Valor Estimado', 'Peso %']);
      headerRow.font = { bold: true, size: 10, color: { argb: 'FFFFFF' } };
      headerRow.eachCell(function(cell) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: verdeEscuro } };
        cell.alignment = { horizontal: 'center' };
        cell.border = { bottom: { style: 'thin', color: { argb: '9CA3AF' } } };
      });

      // ── Etapas com itens ──
      d.etapasOrdenadas.forEach(function(e) {
        const etapaRow = ws.addRow([e.label, 'R$ ' + fmtN(e.porM2), 'R$ ' + fmtN(e.estimado), e.pct.toFixed(1) + '%']);
        etapaRow.font = { bold: true, size: 10 };
        etapaRow.eachCell(function(cell) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: cinza.replace('#', '') } };
          cell.border = { bottom: { style: 'thin', color: { argb: 'DEE2E6' } } };
        });
        etapaRow.getCell(2).alignment = { horizontal: 'right' };
        etapaRow.getCell(3).alignment = { horizontal: 'right' };
        etapaRow.getCell(4).alignment = { horizontal: 'right' };

        e.itens.forEach(function(item) {
          const proj = (item.total / d.areaModelo) * d.fatorCorrecao * d.areaNova;
          const detRow = ws.addRow([
            '  ' + item.descricao,
            item.qtd ? item.qtd + ' un \u00D7 R$ ' + fmtN(item.preco) : '',
            'R$ ' + fmtN(proj),
            ''
          ]);
          detRow.font = { size: 9, color: { argb: '555555' } };
          detRow.getCell(2).alignment = { horizontal: 'right' };
          detRow.getCell(3).alignment = { horizontal: 'right' };
        });
      });

      // ── Total ──
      const totalRow = ws.addRow(['TOTAL', 'R$ ' + fmtN(d.custoM2Modelo), 'R$ ' + fmtN(d.totalEstimado), '100%']);
      totalRow.font = { bold: true, size: 11, color: { argb: 'FFFFFF' } };
      totalRow.eachCell(function(cell) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: verdeEscuro } };
      });
      totalRow.getCell(2).alignment = { horizontal: 'right' };
      totalRow.getCell(3).alignment = { horizontal: 'right' };
      totalRow.getCell(4).alignment = { horizontal: 'right' };

      // ── Rodape ──
      ws.addRow([]);
      ws.addRow(['EDR Engenharia \u2014 Rua Gerson Ferreira de Almeida, 89, Centro, Jupi-PE']);
      ws.addRow(['Engenheira Responsavel: Elyda Rodrigues \u2014 CREA-PE 66902']);
      ws.addRow(['Orcamento estimado com base em obra executada. Valores sujeitos a confirmacao apos projeto.']);

      // Download
      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Orcamento-EDR-' + cliente.replace(/\s+/g, '-') + '-' + d.areaNova.toFixed(0) + 'm2.xlsx';
      a.click();
      URL.revokeObjectURL(url);
      showToast('Orcamento exportado');

    } catch (e) {
      console.error('ExcelJS error:', e);
      showToast('Erro ao exportar Excel');
    }
  }
};

// Registrar no viewRegistry
if (typeof viewRegistry !== 'undefined') {
  viewRegistry.register('orcamento', function() { return OrcamentoModule.render(); });
}
