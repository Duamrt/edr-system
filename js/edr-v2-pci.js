/* ============================================================
   EDR V2 — PciModule
   Fase 4.3 Lote 3 (fc8)
   PCI — Acompanhamento de Medicoes CEF
   ETAPAS_CEF hardcoded (regras da Caixa nao mudam)
   Medicoes persistidas no Supabase (tracker_sync key pci-medicoes-v3)
   ATENCAO: key pci-medicoes-v3 NUNCA trocar — PCI inteiro depende disso
   ============================================================ */

const PciModule = {

  // ── Estado ──
  state: [],
  expanded: new Set(),
  _carregado: false,
  _saveTimer: null,
  _container: null,

  // ── 20 Etapas CEF (extraidas dos .xlsb da Caixa) ──
  // DIFERENTE das 36 ETAPAS financeiras do obras.js
  ETAPAS_CEF: [
    { nome: 'Servicos Preliminares e Gerais', desc: 'Limpeza terreno, tapume, locacao da obra, placa, canteiro' },
    { nome: 'Infraestrutura', desc: 'Estacas, brocas, baldrames, sapatas, radier' },
    { nome: 'Superestrutura', desc: 'Vigas, pilares, cintas, lajes, escadas' },
    { nome: 'Paredes e Paineis', desc: 'Alvenaria de vedacao, paineis, vergas, contravergas' },
    { nome: 'Esquadrias', desc: 'Portas, janelas, batentes, ferragens' },
    { nome: 'Vidros e Plasticos', desc: 'Vidros das esquadrias, box, espelhos' },
    { nome: 'Coberturas', desc: 'Estrutura do telhado, telhas, calhas, rufos, cumeeiras' },
    { nome: 'Impermeabilizacoes', desc: 'Laje, banheiros, areas molhadas, baldrames' },
    { nome: 'Revestimentos Internos', desc: 'Reboco interno, gesso, chapisco, massa corrida' },
    { nome: 'Forros', desc: 'Forro de gesso, PVC, madeira' },
    { nome: 'Revestimentos Externos', desc: 'Reboco externo, textura, grafiato, ceramica fachada' },
    { nome: 'Pintura', desc: 'Pintura interna e externa, selador, massa PVA' },
    { nome: 'Pisos', desc: 'Contrapiso, ceramica, porcelanato, cimentado, soleira' },
    { nome: 'Acabamentos', desc: 'Soleiras, rodapes, peitoril, arremates gerais' },
    { nome: 'Inst. Eletricas e Telefonicas', desc: 'Eletrodutos, fiacao, quadro, tomadas, interruptores, interfone' },
    { nome: 'Instalacoes Hidraulicas', desc: 'Agua fria, agua quente, registros, caixa d\'agua, tubulacao' },
    { nome: 'Inst. Esgoto e Aguas Pluviais', desc: 'Esgoto, caixa de gordura, caixa de passagem, aguas pluviais' },
    { nome: 'Loucas e Metais', desc: 'Vasos, pias, torneiras, chuveiros, acessorios' },
    { nome: 'Complementos', desc: 'Limpeza final, calafete, entrega de chaves' },
    { nome: 'Outros Servicos', desc: 'Muro, portao, cisterna, fossa, calcada, area externa, paisagismo' }
  ],

  // ── Dados seed das obras (pesos do .xlsb) ──
  _OBRAS_SEED: [
    { id: 'junior', nome: 'JUNIOR', entrega: '11/06/2026', valor: 200000, medidoAnterior: 3.84,
      pesos: [1.18,3.07,15.04,4.84,8.04,2.16,4.12,4.58,6.86,2.16,4.90,4.25,9.22,1.34,4.58,3.92,3.92,4.58,1.77,9.48],
      exec: [1,1,1,1,0,0,1,1,0.8,1,0.7,0,0.3,0,0.6,1,0.9,0,0,0.8],
      historico: [{ parcela: 0, data: '10/12/2025', execMes: 3.84, execAcum: 3.84 }] },
    { id: 'dayana', nome: 'DAYANA', entrega: '02/07/2026', valor: 191000, medidoAnterior: 48.92,
      pesos: [1.89,4.62,12.50,6.36,6.06,2.42,4.92,4.92,7.05,1.74,4.47,4.09,9.09,1.06,4.24,4.17,3.94,4.70,1.74,10.00],
      exec: [1,1,1,1,0,0,1,1,0.8,0,1,0,0.3,0,0.6,1,0.5,0,0,0.8],
      historico: [{ parcela: 1, data: '01/01/2026', execMes: 16.12, execAcum: 16.12 },{ parcela: 2, data: '01/02/2026', execMes: 16.04, execAcum: 32.16 },{ parcela: 3, data: '01/03/2026', execMes: 16.76, execAcum: 48.92 }] },
    { id: 'pedro', nome: 'PEDRO', entrega: '24/07/2026', valor: 190500, medidoAnterior: 79.48,
      pesos: [3.42,4.99,12.31,7.04,6.50,2.19,5.81,4.44,6.91,1.57,4.03,3.69,9.09,1.30,3.79,3.76,4.10,4.24,1.57,9.23],
      exec: [1,1,1,1,0,0,1,1,1,0,1,0,0.3,0,0,1,0.5,0,0,0.6],
      historico: [{ parcela: 1, data: '23/01/2026', execMes: 13.64, execAcum: 13.64 },{ parcela: 2, data: '23/02/2026', execMes: 17.94, execAcum: 31.58 },{ parcela: 3, data: '23/03/2026', execMes: 47.90, execAcum: 79.48 }] },
    { id: 'leonardo', nome: 'LEONARDO', entrega: '09/08/2026', valor: 190025, medidoAnterior: 31.58,
      pesos: [3.42,4.99,12.31,7.04,6.50,2.19,5.81,4.44,6.91,1.57,4.03,3.69,9.09,1.30,3.79,3.76,4.10,4.24,1.57,9.23],
      exec: [1,1,0.7,0.8,0,0,0,0.3,0,0,0,0,0,0,0,0,0.5,0,0,0.6],
      historico: [{ parcela: 1, data: '08/02/2026', execMes: 13.18, execAcum: 13.18 },{ parcela: 2, data: '08/03/2026', execMes: 18.40, execAcum: 31.58 }] },
    { id: 'duamelyda', nome: 'DUAM + ELYDA', entrega: 'A definir', valor: 399891.20, medidoAnterior: 0,
      pesos: [2.83,6.60,12.96,9.35,8.01,1.20,0,4.24,7.07,2.00,4.24,5.89,8.72,1.18,3.77,3.77,4.01,4.48,1.13,8.55],
      exec: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
      historico: [] }
  ],

  SYNC_KEY: 'pci-medicoes-v3',   // NUNCA trocar
  CACHE_KEY: 'pci_cache_v3',

  // ── Render principal ──
  async render(container) {
    PciModule._container = container;
    container.innerHTML = PciModule._skeleton();
    await PciModule._carregar();
    PciModule._carregado = true;
    requestAnimationFrame(() => {
      container.innerHTML = PciModule._html();
      PciModule._bind(container);
    });
  },

  _skeleton() {
    return '<div style="max-width:1200px;margin:0 auto;padding:20px;">' +
      '<div style="height:80px;background:var(--skeleton);border-radius:12px;margin-bottom:16px;animation:pulse 1.5s infinite"></div>'.repeat(5) +
    '</div>';
  },

  // ── Carregar ──
  async _carregar() {
    // Tentar Supabase
    try {
      const rows = await sbGet('tracker_sync?key=eq.' + PciModule.SYNC_KEY + '&select=data');
      if (rows && rows.length && rows[0].data && rows[0].data.obras) {
        const saved = rows[0].data.obras;
        PciModule.state = PciModule._OBRAS_SEED.map(o => {
          const s = saved.find(x => x.id === o.id);
          if (!s) return JSON.parse(JSON.stringify(o));
          return {
            ...JSON.parse(JSON.stringify(o)),
            exec: s.exec || o.exec,
            medidoAnterior: s.medidoAnterior != null ? s.medidoAnterior : o.medidoAnterior,
            historico: s.historico || o.historico || []
          };
        });
        PciModule._cacheLocal();
        return;
      }
    } catch (e) {
      console.error('PciModule._carregar supabase:', e);
    }

    // Fallback cache local
    try {
      const cached = localStorage.getItem(PciModule.CACHE_KEY);
      if (cached) { PciModule.state = JSON.parse(cached); return; }
    } catch (e) {}

    // Fallback seed
    PciModule.state = JSON.parse(JSON.stringify(PciModule._OBRAS_SEED));
  },

  _cacheLocal() {
    try { localStorage.setItem(PciModule.CACHE_KEY, JSON.stringify(PciModule.state)); } catch (e) {}
  },

  async _salvar() {
    PciModule._cacheLocal();
    try {
      await sbPost('tracker_sync', {
        key: PciModule.SYNC_KEY,
        data: { obras: PciModule.state },
        updated_at: new Date().toISOString()
      }, { upsert: true });
    } catch (e) {
      console.error('PciModule._salvar:', e);
    }
  },

  // ── Calculos ──
  _calcExec(obra) {
    let total = 0;
    obra.pesos.forEach((p, i) => { total += p * (obra.exec[i] || 0); });
    return Math.round(total * 100) / 100;
  },

  _calcValorMedicao(obra) {
    return (obra.valor || 0) * PciModule._calcExec(obra) / 100;
  },

  _calcValorMensal(obra) {
    const exec = PciModule._calcExec(obra);
    const anterior = obra.medidoAnterior || 0;
    const diff = exec - anterior;
    return diff > 0 ? (obra.valor || 0) * diff / 100 : 0;
  },

  _diasRestantes(entrega) {
    if (!entrega || !entrega.includes('/')) return 999;
    const p = entrega.split('/');
    const d = new Date(+p[2], +p[1] - 1, +p[0]);
    const h = new Date(); h.setHours(0, 0, 0, 0);
    return Math.ceil((d - h) / 86400000);
  },

  _fmtR$(v) {
    return 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },

  _corProg(pct) { return pct >= 80 ? '#2D6A4F' : pct >= 40 ? '#D4A017' : '#C0392B'; },

  // ── HTML ──
  _html() {
    const state = PciModule.state;
    let html = '<div style="max-width:1200px;margin:0 auto;padding:20px;">';

    // Header
    html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">' +
      '<div>' +
        '<h2 style="font-family:\'Plus Jakarta Sans\',sans-serif;font-size:20px;font-weight:700;margin:0;">PCI — Acompanhamento de Medicoes</h2>' +
        '<div style="font-size:12px;color:var(--texto2);margin-top:4px;">EDR Engenharia</div>' +
      '</div>' +
      '<button id="pci-btn-pdf" style="background:#2D6A4F;color:#fff;border:none;border-radius:8px;padding:8px 16px;font-family:inherit;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px;">' +
        '<span class="material-symbols-outlined" style="font-size:16px;">picture_as_pdf</span> Gerar PDF' +
      '</button>' +
    '</div>';

    // Indicador de sync
    html += '<div id="pci-sync-ind" style="position:fixed;top:12px;left:50%;transform:translateX(-50%);background:#2D6A4F;color:#fff;padding:6px 16px;border-radius:20px;font-size:12px;font-weight:600;opacity:0;transition:opacity .3s;z-index:999;">Sincronizando...</div>';

    // Cards de obra
    state.forEach(obra => {
      const exec = PciModule._calcExec(obra);
      const dias = PciModule._diasRestantes(obra.entrega);
      const diasTxt = dias >= 999 ? 'Sem prazo' : dias + ' dias';
      const diasCor = dias >= 999 ? 'var(--texto2)' : dias < 30 ? '#C0392B' : dias < 60 ? '#D4A017' : 'var(--texto2)';
      const isOpen = PciModule.expanded.has(obra.id);
      const corExec = PciModule._corProg(exec);
      const feitas = obra.exec.filter((e, i) => e >= 1 && obra.pesos[i] > 0).length;
      const total = obra.pesos.filter(p => p > 0).length;

      html += '<div style="background:var(--fundo2);border:1px solid var(--borda);border-radius:12px;margin-bottom:16px;overflow:hidden;">';

      // Header obra
      html += '<div class="pci-obra-header" data-id="' + obra.id + '" style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;cursor:pointer;transition:background .2s;">' +
        '<div>' +
          '<div style="font-size:16px;font-weight:700;color:#2D6A4F;">' + obra.nome + '</div>' +
          '<div style="font-size:12px;color:var(--texto2);display:flex;gap:16px;margin-top:4px;flex-wrap:wrap;">' +
            '<span>Entrega: ' + obra.entrega + '</span>' +
            '<span style="color:' + diasCor + ';font-weight:600;">' + diasTxt + '</span>' +
            '<span>' + feitas + '/' + total + ' etapas concluidas</span>' +
          '</div>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:12px;">' +
          '<div>' +
            '<div style="width:120px;height:8px;background:var(--borda);border-radius:4px;overflow:hidden;">' +
              '<div style="height:100%;width:' + exec + '%;background:' + corExec + ';border-radius:4px;transition:width .3s;"></div>' +
            '</div>' +
          '</div>' +
          '<div style="font-size:20px;font-weight:700;min-width:60px;text-align:right;color:' + corExec + ';">' + exec.toFixed(1) + '%</div>' +
          '<span class="material-symbols-outlined pci-arrow" id="pci-arrow-' + obra.id + '" style="font-size:20px;color:var(--texto3);transition:transform .2s;' + (isOpen ? 'transform:rotate(90deg);color:#2D6A4F;' : '') + '">chevron_right</span>' +
        '</div>' +
      '</div>';

      // Body (expandido)
      html += '<div class="pci-obra-body" id="pci-body-' + obra.id + '" style="' + (isOpen ? '' : 'display:none;') + 'padding:0 20px 20px;border-top:1px solid var(--borda);">';

      // Stats
      html += '<div style="display:flex;gap:12px;margin:16px 0;flex-wrap:wrap;">';
      html += PciModule._stat(exec.toFixed(1) + '%', 'Executado total', exec >= 80 ? '#2D6A4F' : exec >= 40 ? '#D4A017' : '#C0392B');
      html += PciModule._stat((obra.medidoAnterior || 0).toFixed(1) + '%', 'Ja medido CEF', 'var(--texto)');
      html += PciModule._stat(PciModule._fmtR$(PciModule._calcValorMensal(obra)), 'Esta medicao (R$)', '#2D6A4F');
      html += PciModule._stat((exec - (obra.medidoAnterior || 0)).toFixed(1) + '%', 'Esta medicao (%)', 'var(--texto)');
      html += PciModule._stat(obra.valor ? PciModule._fmtR$(obra.valor) : '—', 'Contrato', 'var(--texto)');
      html += PciModule._stat(diasTxt, 'Pra entrega', dias < 30 ? '#C0392B' : dias < 60 ? '#D4A017' : '#2D6A4F');
      html += '</div>';

      // Tabela de etapas
      html += '<div style="overflow-x:auto;">';
      html += '<table style="width:100%;border-collapse:collapse;margin-top:12px;font-size:13px;">';
      html += '<thead><tr style="border-bottom:2px solid var(--borda);">' +
        '<th style="text-align:left;padding:8px 10px;font-size:11px;color:var(--texto2);text-transform:uppercase;letter-spacing:.5px;">Etapa</th>' +
        '<th style="text-align:left;padding:8px 10px;font-size:11px;color:var(--texto2);text-transform:uppercase;">Peso</th>' +
        '<th style="text-align:left;padding:8px 10px;font-size:11px;color:var(--texto2);text-transform:uppercase;">Valor</th>' +
        '<th style="text-align:left;padding:8px 10px;font-size:11px;color:var(--texto2);text-transform:uppercase;">Execucao</th>' +
        '<th style="text-align:left;padding:8px 10px;font-size:11px;color:var(--texto2);text-transform:uppercase;">Ajustar</th>' +
      '</tr></thead><tbody>';

      obra.pesos.forEach((p, i) => {
        if (p === 0) return;
        const e = obra.exec[i] || 0;
        const pct = Math.round(e * 100);
        const corBarra = PciModule._corProg(pct);
        const corTxt = pct === 0 ? 'var(--texto3)' : pct >= 100 ? '#2D6A4F' : '#D4A017';

        html += '<tr style="border-bottom:1px solid var(--borda);" title="' + PciModule.ETAPAS_CEF[i].desc + '">' +
          '<td style="padding:8px 10px;">' +
            '<div style="font-weight:500;">' + PciModule.ETAPAS_CEF[i].nome + '</div>' +
            '<div style="font-size:11px;color:var(--texto3);margin-top:1px;">' + PciModule.ETAPAS_CEF[i].desc + '</div>' +
          '</td>' +
          '<td style="padding:8px 10px;font-family:\'Space Grotesk\',monospace;color:var(--texto2);">' + p.toFixed(1) + '%</td>' +
          '<td style="padding:8px 10px;font-family:\'Space Grotesk\',monospace;color:var(--texto2);">' + (obra.valor ? PciModule._fmtR$(obra.valor * p / 100) : '—') + '</td>' +
          '<td style="padding:8px 10px;">' +
            '<div style="display:inline-block;width:80px;height:6px;background:var(--borda);border-radius:3px;overflow:hidden;vertical-align:middle;margin-right:6px;">' +
              '<div style="height:100%;width:' + pct + '%;background:' + corBarra + ';border-radius:3px;"></div>' +
            '</div>' +
            '<span style="font-family:\'Space Grotesk\',monospace;font-weight:600;color:' + corTxt + ';">' + pct + '%</span>' +
          '</td>' +
          '<td style="padding:8px 10px;">' +
            '<input type="range" class="pci-slider" data-obra="' + obra.id + '" data-idx="' + i + '" min="0" max="100" step="5" value="' + pct + '" style="width:80px;accent-color:#2D6A4F;cursor:pointer;vertical-align:middle;">' +
            '<span class="pci-slider-val" style="font-size:11px;color:#2D6A4F;margin-left:4px;font-family:\'Space Grotesk\',monospace;">' + pct + '%</span>' +
          '</td>' +
        '</tr>';
      });

      html += '</tbody></table></div>';

      // Sugestao de compensacao
      const compens = obra.pesos.map((p, i) => ({ nome: PciModule.ETAPAS_CEF[i].nome, peso: p, exec: obra.exec[i] || 0, idx: i }))
        .filter(e => e.exec < 1 && e.peso > 0)
        .sort((a, b) => b.peso - a.peso)
        .slice(0, 5);

      if (compens.length) {
        html += '<div style="background:rgba(212,160,23,0.08);border:1px solid rgba(212,160,23,0.2);border-radius:8px;padding:12px 16px;margin-top:12px;">' +
          '<h4 style="font-size:13px;color:#D4A017;margin-bottom:8px;display:flex;align-items:center;gap:6px;">' +
            '<span class="material-symbols-outlined" style="font-size:18px;">tips_and_updates</span> Onde compensar pra subir a medicao' +
          '</h4>';
        compens.forEach(c => {
          const ganho = c.peso * (1 - c.exec);
          const ganhoR = obra.valor ? PciModule._fmtR$(obra.valor * ganho / 100) : '';
          html += '<div style="font-size:13px;padding:4px 0;display:flex;justify-content:space-between;">' +
            '<span>' + c.nome + ' (' + Math.round(c.exec * 100) + '% feito)</span>' +
            '<span style="color:#2D6A4F;font-weight:600;font-family:\'Space Grotesk\',monospace;">+' + ganho.toFixed(1) + '%' + (ganhoR ? ' = ' + ganhoR : '') + '</span>' +
          '</div>';
        });
        html += '</div>';
      }

      // Historico de medicoes
      html += '<div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--borda);">';
      html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">' +
        '<h4 style="font-size:14px;color:var(--texto2);font-weight:600;display:flex;align-items:center;gap:6px;">' +
          '<span class="material-symbols-outlined" style="font-size:18px;">history</span> Historico de Medicoes' +
        '</h4>' +
        '<button class="pci-fechar-btn" data-obra="' + obra.id + '" style="background:rgba(45,106,79,0.1);border:1px solid rgba(45,106,79,0.2);color:#2D6A4F;padding:8px 16px;border-radius:8px;cursor:pointer;font-family:inherit;font-size:12px;font-weight:600;">Fechar medicao atual</button>' +
      '</div>';

      if (obra.historico && obra.historico.length) {
        html += '<table style="width:100%;border-collapse:collapse;font-size:13px;">';
        html += '<thead><tr style="border-bottom:2px solid var(--borda);">' +
          '<th style="text-align:left;padding:6px 10px;font-size:11px;color:var(--texto2);">Parcela</th>' +
          '<th style="text-align:left;padding:6px 10px;font-size:11px;color:var(--texto2);">Data</th>' +
          '<th style="text-align:right;padding:6px 10px;font-size:11px;color:var(--texto2);">Exec. Mes</th>' +
          '<th style="text-align:right;padding:6px 10px;font-size:11px;color:var(--texto2);">Acumulado</th>' +
          '<th style="text-align:right;padding:6px 10px;font-size:11px;color:var(--texto2);">Valor</th>' +
        '</tr></thead><tbody>';
        obra.historico.forEach(h => {
          html += '<tr style="border-bottom:1px solid var(--borda);">' +
            '<td style="padding:6px 10px;">' + h.parcela + '</td>' +
            '<td style="padding:6px 10px;">' + h.data + '</td>' +
            '<td style="padding:6px 10px;text-align:right;color:#2D6A4F;font-weight:600;font-family:\'Space Grotesk\',monospace;">' + h.execMes.toFixed(2) + '%</td>' +
            '<td style="padding:6px 10px;text-align:right;color:#2D6A4F;font-weight:600;font-family:\'Space Grotesk\',monospace;">' + h.execAcum.toFixed(2) + '%</td>' +
            '<td style="padding:6px 10px;text-align:right;font-family:\'Space Grotesk\',monospace;">' + (obra.valor ? PciModule._fmtR$(obra.valor * h.execMes / 100) : '—') + '</td>' +
          '</tr>';
        });
        html += '</tbody></table>';
      } else {
        html += '<div style="color:var(--texto3);font-size:13px;text-align:center;padding:12px;">Nenhuma medicao registrada</div>';
      }
      html += '</div>';

      html += '</div>'; // body
      html += '</div>'; // card
    });

    html += '</div>';
    return html;
  },

  _stat(valor, label, cor) {
    return '<div style="background:var(--fundo);border:1px solid var(--borda);border-radius:8px;padding:10px 14px;flex:1;min-width:120px;">' +
      '<div style="font-family:\'Space Grotesk\',monospace;font-size:16px;font-weight:700;color:' + cor + ';line-height:1;margin-bottom:4px;">' + valor + '</div>' +
      '<div style="font-size:11px;color:var(--texto2);text-transform:uppercase;letter-spacing:.5px;">' + label + '</div>' +
    '</div>';
  },

  // ── Bind ──
  _bind(container) {
    // Toggle obras
    container.querySelectorAll('.pci-obra-header').forEach(header => {
      header.addEventListener('click', () => {
        const id = header.dataset.id;
        if (PciModule.expanded.has(id)) PciModule.expanded.delete(id);
        else PciModule.expanded.add(id);
        requestAnimationFrame(() => {
          container.innerHTML = PciModule._html();
          PciModule._bind(container);
        });
      });
    });

    // Sliders
    container.querySelectorAll('.pci-slider').forEach(slider => {
      const valSpan = slider.nextElementSibling;

      slider.addEventListener('input', () => {
        if (valSpan) valSpan.textContent = slider.value + '%';
      });

      slider.addEventListener('change', () => {
        const obraId = slider.dataset.obra;
        const idx = parseInt(slider.dataset.idx);
        const val = Number(slider.value) / 100;
        const obra = PciModule.state.find(o => o.id === obraId);
        if (!obra) return;
        obra.exec[idx] = val;

        // Re-render e debounce save
        requestAnimationFrame(() => {
          container.innerHTML = PciModule._html();
          PciModule._bind(container);
        });
        clearTimeout(PciModule._saveTimer);
        PciModule._saveTimer = setTimeout(() => PciModule._salvar(), 800);
      });
    });

    // Fechar medicao
    container.querySelectorAll('.pci-fechar-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        PciModule._fecharMedicao(btn.dataset.obra, container);
      });
    });

    // PDF
    const btnPdf = container.querySelector('#pci-btn-pdf');
    if (btnPdf) {
      btnPdf.addEventListener('click', () => PciModule._gerarPdf());
    }
  },

  // ── Fechar medicao ──
  async _fecharMedicao(obraId, container) {
    const obra = PciModule.state.find(o => o.id === obraId);
    if (!obra) return;

    const exec = PciModule._calcExec(obra);
    const anterior = obra.medidoAnterior || 0;
    const diff = Math.round((exec - anterior) * 100) / 100;

    if (diff <= 0) {
      if (typeof confirmar === 'function') {
        confirmar('Nada novo pra medir. Ajuste os sliders primeiro.', null, { soInfo: true });
      }
      return;
    }

    const hoje = new Date();
    const dataStr = String(hoje.getDate()).padStart(2, '0') + '/' + String(hoje.getMonth() + 1).padStart(2, '0') + '/' + hoje.getFullYear();

    const msg = 'Fechar medicao?\n\nExec. esta medicao: ' + diff.toFixed(2) + '%\nAcumulado: ' + exec.toFixed(2) + '%\nValor: ' + PciModule._fmtR$(obra.valor * diff / 100) + '\nData: ' + dataStr;

    if (typeof confirmar === 'function') {
      confirmar(msg, async () => {
        if (!obra.historico) obra.historico = [];
        const parcela = obra.historico.length > 0 ? obra.historico[obra.historico.length - 1].parcela + 1 : 1;
        obra.historico.push({ parcela, data: dataStr, execMes: diff, execAcum: exec });
        obra.medidoAnterior = exec;
        await PciModule._salvar();
        requestAnimationFrame(() => {
          container.innerHTML = PciModule._html();
          PciModule._bind(container);
        });
      });
    }
  },

  // ── PDF via PdfModule ──
  _gerarPdf() {
    if (typeof PdfModule === 'undefined' || !PdfModule.gerarPCI) {
      console.error('PdfModule.gerarPCI nao disponivel');
      return;
    }
    const dados = PciModule.state.map(obra => ({
      nome: obra.nome,
      entrega: obra.entrega,
      valor: obra.valor,
      execTotal: PciModule._calcExec(obra),
      medidoAnterior: obra.medidoAnterior,
      valorMensal: PciModule._calcValorMensal(obra),
      etapas: obra.pesos.map((p, i) => ({
        nome: PciModule.ETAPAS_CEF[i].nome,
        peso: p,
        exec: Math.round((obra.exec[i] || 0) * 100),
        valor: obra.valor ? obra.valor * p / 100 : 0
      })).filter(e => e.peso > 0),
      historico: obra.historico || []
    }));
    PdfModule.gerarPCI(dados);
  }
};

// ── Registro no viewRegistry ──
if (typeof viewRegistry !== 'undefined') {
  viewRegistry.register('pci', (container) => PciModule.render(container));
}
