// ══════════════════════════════════════════
// ORCAMENTO PARAMETRICO — Baseado em obras concluídas
// Com INCC automático (API Banco Central) e export Excel padrão EDR
// ══════════════════════════════════════════

let _orcDadosCalc = null;
let _orcInccCache = null; // { dados: [...], atualizadoEm: timestamp }
let _orcInccInfo = ''; // texto informativo do período

function renderOrcamento() {
  const el = document.getElementById('orcamento-container');
  if (!el) return;

  const concluidas = (typeof obrasArquivadas !== 'undefined' ? obrasArquivadas : [])
    .filter(o => Number(o.area_m2) > 0);

  el.innerHTML = `
    <div style="margin:16px 0;">
      <label style="font-size:10px;font-weight:700;color:var(--texto3);text-transform:uppercase;letter-spacing:1px;">Obra modelo</label>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;" id="orc-modelos">
        ${concluidas.map(o => `<button onclick="selecionarModelo('${o.id}')" id="orc-btn-${o.id}" style="padding:8px 16px;border-radius:8px;border:1px solid var(--borda);background:var(--bg2);color:var(--texto);font-size:12px;font-weight:600;cursor:pointer;transition:all 0.2s;">${o.nome}<span style="font-size:10px;color:var(--texto3);margin-left:4px;">${Number(o.area_m2).toFixed(0)}m²</span></button>`).join('')}
      </div>
      <input type="hidden" id="orc-modelo" value="">
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;margin:12px 0;">
      <div style="min-width:140px;">
        <label style="font-size:10px;font-weight:700;color:var(--texto3);text-transform:uppercase;letter-spacing:1px;">Area nova (m²)</label>
        <input id="orc-area" type="number" step="0.01" placeholder="Ex: 80" oninput="calcOrcamento()" style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--borda);background:var(--bg2);color:var(--texto);font-size:13px;margin-top:4px;">
      </div>
      <div style="min-width:180px;">
        <label style="font-size:10px;font-weight:700;color:var(--texto3);text-transform:uppercase;letter-spacing:1px;">Correção INCC %</label>
        <div style="display:flex;gap:6px;align-items:center;margin-top:4px;">
          <input id="orc-correcao" type="number" step="0.1" value="0" placeholder="0" oninput="calcOrcamento()" style="width:80px;padding:10px;border-radius:8px;border:1px solid var(--borda);background:var(--bg2);color:var(--texto);font-size:13px;">
          <span id="orc-incc-info" style="font-size:10px;color:var(--texto4);line-height:1.3;max-width:200px;"></span>
        </div>
      </div>
      <div style="flex:1;min-width:160px;">
        <label style="font-size:10px;font-weight:700;color:var(--texto3);text-transform:uppercase;letter-spacing:1px;">Cliente (opcional)</label>
        <input id="orc-cliente" type="text" placeholder="Nome do cliente" style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--borda);background:var(--bg2);color:var(--texto);font-size:13px;margin-top:4px;">
      </div>
      <button class="btn-save" onclick="exportarOrcamento()" style="padding:10px 20px;font-size:12px;white-space:nowrap;">EXPORTAR EXCEL</button>
      <button class="btn-outline" onclick="pdfOrcamento()" style="padding:10px 16px;font-size:12px;white-space:nowrap;">📄 PDF</button>
    </div>

    <div id="orc-resumo" style="display:none;margin-bottom:16px;">
      <div style="display:flex;flex-wrap:wrap;gap:10px;" id="orc-cards"></div>
    </div>

    <div id="orc-tabela" style="margin-top:8px;"></div>
    <div id="orc-aviso" style="padding:40px;text-align:center;color:var(--texto3);font-size:13px;">
      Selecione uma obra concluida como modelo e informe a area desejada.
    </div>
  `;
}

function selecionarModelo(id) {
  document.getElementById('orc-modelo').value = id;
  document.querySelectorAll('#orc-modelos button').forEach(btn => {
    const ativo = btn.id === 'orc-btn-' + id;
    btn.style.background = ativo ? 'var(--verde)' : 'var(--bg2)';
    btn.style.color = ativo ? '#fff' : 'var(--texto)';
    btn.style.borderColor = ativo ? 'var(--verde)' : 'var(--borda)';
  });
  orcBuscarINCC(id);
  calcOrcamento();
}

// ── INCC — Banco Central (série 192 = INCC-DI mensal) ──
async function orcBuscarINCC(modeloId) {
  const infoEl = document.getElementById('orc-incc-info');
  if (!infoEl) return;

  // Descobrir mês base: último lançamento da obra modelo
  const lancModelo = lancamentos.filter(l => l.obra_id === modeloId);
  if (!lancModelo.length) { infoEl.textContent = 'Sem lançamentos'; return; }

  const datas = lancModelo.map(l => l.data).filter(Boolean).sort();
  const ultimaData = datas[datas.length - 1]; // mais recente
  if (!ultimaData) { infoEl.textContent = ''; return; }

  const mesBase = new Date(ultimaData + 'T12:00:00');
  const hoje = new Date();

  // Se mesmo mês, sem correção
  if (mesBase.getFullYear() === hoje.getFullYear() && mesBase.getMonth() === hoje.getMonth()) {
    infoEl.innerHTML = '<span style="color:var(--verde-hl);">Base atual</span>';
    return;
  }

  infoEl.innerHTML = 'Buscando INCC...';

  try {
    // Buscar dados do BCB — do mês seguinte ao base até o mês atual
    const mesSeguinte = new Date(mesBase.getFullYear(), mesBase.getMonth() + 1, 1);
    const dataIni = ('0' + mesSeguinte.getDate()).slice(-2) + '/' + ('0' + (mesSeguinte.getMonth() + 1)).slice(-2) + '/' + mesSeguinte.getFullYear();
    const dataFim = ('0' + hoje.getDate()).slice(-2) + '/' + ('0' + (hoje.getMonth() + 1)).slice(-2) + '/' + hoje.getFullYear();

    const url = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.192/dados?formato=json&dataInicial=' + dataIni + '&dataFinal=' + dataFim;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('API indisponível');
    const dados = await resp.json();

    if (!dados.length) {
      infoEl.innerHTML = '<span style="color:var(--texto4);">Sem dados INCC no período</span>';
      return;
    }

    // Calcular acumulado composto
    let acumulado = 1;
    dados.forEach(d => { acumulado *= (1 + parseFloat(d.valor) / 100); });
    const pctAcumulado = ((acumulado - 1) * 100);

    // Montar label do período
    const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    const mesIniLabel = MESES[mesSeguinte.getMonth()] + '/' + mesSeguinte.getFullYear();
    const ultimoDado = dados[dados.length - 1].data.split('/');
    const mesFimLabel = MESES[parseInt(ultimoDado[1]) - 1] + '/' + ultimoDado[2];

    _orcInccInfo = mesIniLabel + ' a ' + mesFimLabel + ': ' + pctAcumulado.toFixed(1) + '%';

    // Preencher o campo automaticamente
    const correcaoInput = document.getElementById('orc-correcao');
    if (correcaoInput && parseFloat(correcaoInput.value) === 0) {
      correcaoInput.value = pctAcumulado.toFixed(1);
      calcOrcamento();
    }

    infoEl.innerHTML = '<span style="color:#fbbf24;">INCC ' + _orcInccInfo + '</span><br><span style="font-size:9px;color:var(--texto4);">Fonte: BCB · Ajuste livre</span>';

  } catch(e) {
    console.error('INCC fetch error:', e);
    infoEl.innerHTML = '<span style="color:var(--texto4);">INCC indisponível · insira manual</span>';
  }
}

function calcOrcamento() {
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
    _orcDadosCalc = null;
    return;
  }
  if (avisoEl) avisoEl.style.display = 'none';
  if (resumoEl) resumoEl.style.display = '';

  const modelo = obras.find(o => o.id === modeloId)
    || (typeof obrasArquivadas !== 'undefined' ? obrasArquivadas : []).find(o => o.id === modeloId);
  if (!modelo) return;

  const areaModelo = Number(modelo.area_m2) || 1;
  const lancModelo = lancamentos.filter(l => l.obra_id === modeloId);

  // Agrupar por etapa COM detalhamento de itens
  const porEtapa = {};
  let totalModelo = 0;

  lancModelo.forEach(l => {
    const etapa = l.etapa || '36_outros';
    if (!porEtapa[etapa]) porEtapa[etapa] = { total: 0, itens: [] };
    const val = Number(l.total || 0);
    porEtapa[etapa].total += val;
    porEtapa[etapa].itens.push({
      descricao: l.descricao || 'Sem descrição',
      qtd: Number(l.qtd || 0),
      preco: Number(l.preco || 0),
      total: val,
      data: l.data || ''
    });
    totalModelo += val;
  });

  // Calcular índices com correção
  const custoM2Modelo = (totalModelo / areaModelo) * fatorCorrecao;
  const totalEstimado = custoM2Modelo * areaNova;
  const valorVenda = Number(modelo.valor_venda || 0);
  const vendaM2 = valorVenda > 0 ? (valorVenda / areaModelo) * fatorCorrecao : 0;
  const vendaEstimada = vendaM2 * areaNova;
  const lucroEstimado = vendaEstimada > 0 ? vendaEstimada - totalEstimado : 0;
  const margemEstimada = vendaEstimada > 0 ? (lucroEstimado / vendaEstimada * 100) : 0;

  // Cards resumo
  const correcaoTag = correcaoPct > 0 ? '<span style="font-size:9px;color:#fbbf24;margin-left:4px;">+' + correcaoPct + '%</span>' : '';
  if (cardsEl) {
    cardsEl.innerHTML = `
      <div style="flex:1;min-width:140px;background:var(--bg2);border:1px solid var(--borda);border-radius:10px;padding:14px;text-align:center;">
        <div style="font-size:10px;color:var(--texto3);font-weight:700;text-transform:uppercase;">Custo Estimado${correcaoTag}</div>
        <div style="font-size:20px;font-weight:800;color:var(--vermelho);margin-top:4px;">R$ ${fmtN(totalEstimado)}</div>
        <div style="font-size:10px;color:var(--texto4);margin-top:2px;">R$ ${fmtN(custoM2Modelo)}/m²</div>
      </div>
      ${vendaEstimada > 0 ? `
      <div style="flex:1;min-width:140px;background:var(--bg2);border:1px solid var(--borda);border-radius:10px;padding:14px;text-align:center;">
        <div style="font-size:10px;color:var(--texto3);font-weight:700;text-transform:uppercase;">Venda Estimada${correcaoTag}</div>
        <div style="font-size:20px;font-weight:800;color:var(--azul);margin-top:4px;">R$ ${fmtN(vendaEstimada)}</div>
        <div style="font-size:10px;color:var(--texto4);margin-top:2px;">R$ ${fmtN(vendaM2)}/m²</div>
      </div>
      <div style="flex:1;min-width:140px;background:var(--bg2);border:1px solid var(--borda);border-radius:10px;padding:14px;text-align:center;">
        <div style="font-size:10px;color:var(--texto3);font-weight:700;text-transform:uppercase;">Lucro Estimado</div>
        <div style="font-size:20px;font-weight:800;color:var(--verde);margin-top:4px;">R$ ${fmtN(lucroEstimado)}</div>
        <div style="font-size:10px;color:var(--texto4);margin-top:2px;">${margemEstimada.toFixed(1)}% margem</div>
      </div>
      ` : ''}
      <div style="flex:1;min-width:140px;background:var(--bg2);border:1px solid var(--borda);border-radius:10px;padding:14px;text-align:center;">
        <div style="font-size:10px;color:var(--texto3);font-weight:700;text-transform:uppercase;">Base</div>
        <div style="font-size:15px;font-weight:700;color:var(--texto);margin-top:4px;">${modelo.nome}</div>
        <div style="font-size:10px;color:var(--texto4);margin-top:2px;">${areaModelo.toFixed(0)}m² \u2192 ${areaNova.toFixed(0)}m²</div>
      </div>
    `;
  }

  // Tabela por etapa com detalhamento
  const etapasOrdenadas = Object.entries(porEtapa)
    .map(([key, dados]) => ({
      key,
      label: etapaLabel(key),
      totalModelo: dados.total,
      porM2: (dados.total / areaModelo) * fatorCorrecao,
      estimado: (dados.total / areaModelo) * fatorCorrecao * areaNova,
      pct: totalModelo > 0 ? (dados.total / totalModelo * 100) : 0,
      itens: dados.itens.sort((a, b) => b.total - a.total)
    }))
    .sort((a, b) => b.estimado - a.estimado);

  // Cache para export
  _orcDadosCalc = { modelo, areaModelo, areaNova, custoM2Modelo, totalEstimado, vendaEstimada, lucroEstimado, margemEstimada, etapasOrdenadas, correcaoPct, fatorCorrecao };

  if (tabelaEl) {
    let tbody = '';
    etapasOrdenadas.forEach((e, i) => {
      // Linha da etapa (clicável)
      tbody += '<tr onclick="orcToggleDetalhe(\'orc-det-' + i + '\')" style="border-bottom:1px solid var(--borda);cursor:pointer;' + (i % 2 ? 'background:var(--bg2);' : '') + 'transition:background 0.15s;" onmouseover="this.style.background=\'rgba(34,197,94,0.06)\'" onmouseout="this.style.background=\'' + (i % 2 ? 'var(--bg2)' : '') + '\'">'
        + '<td style="padding:8px 12px;font-weight:600;color:var(--texto);"><span style="margin-right:6px;font-size:10px;color:var(--texto4);">\u25B6</span>' + e.label + '</td>'
        + '<td style="padding:8px 12px;text-align:right;color:var(--texto2);font-family:\'JetBrains Mono\',monospace;">R$ ' + fmtN(e.porM2) + '</td>'
        + '<td style="padding:8px 12px;text-align:right;font-weight:700;color:var(--texto);font-family:\'JetBrains Mono\',monospace;">R$ ' + fmtN(e.estimado) + '</td>'
        + '<td style="padding:8px 12px;text-align:right;color:var(--texto3);font-family:\'JetBrains Mono\',monospace;">' + e.pct.toFixed(1) + '%</td>'
        + '<td style="padding:8px 12px;"><div style="background:var(--borda);border-radius:4px;height:8px;overflow:hidden;"><div style="background:var(--verde);height:100%;width:' + e.pct + '%;border-radius:4px;"></div></div></td>'
        + '</tr>';

      // Detalhamento (escondido)
      let itensHtml = '';
      e.itens.forEach(item => {
        const proj = (item.total / areaModelo) * fatorCorrecao * areaNova;
        itensHtml += '<tr style="border-bottom:1px solid rgba(255,255,255,0.03);">'
          + '<td style="padding:5px 8px;color:var(--texto2);">' + esc(item.descricao) + '</td>'
          + '<td style="padding:5px 8px;text-align:right;color:var(--texto3);font-family:\'JetBrains Mono\',monospace;">' + (item.qtd || '\u2014') + '</td>'
          + '<td style="padding:5px 8px;text-align:right;color:var(--texto3);font-family:\'JetBrains Mono\',monospace;">' + (item.preco ? 'R$ ' + fmtN(item.preco) : '\u2014') + '</td>'
          + '<td style="padding:5px 8px;text-align:right;color:var(--texto3);font-family:\'JetBrains Mono\',monospace;">R$ ' + fmtN(item.total) + '</td>'
          + '<td style="padding:5px 8px;text-align:right;color:var(--texto);font-weight:600;font-family:\'JetBrains Mono\',monospace;">R$ ' + fmtN(proj) + '</td>'
          + '</tr>';
      });

      tbody += '<tr id="orc-det-' + i + '" style="display:none;"><td colspan="5" style="padding:0;">'
        + '<div style="background:rgba(34,197,94,0.03);border-left:3px solid var(--verde);padding:8px 12px 8px 24px;">'
        + '<table style="width:100%;border-collapse:collapse;font-size:11px;"><thead><tr>'
        + '<th style="text-align:left;padding:4px 8px;color:var(--texto4);font-size:9px;font-weight:700;text-transform:uppercase;">Insumo</th>'
        + '<th style="text-align:right;padding:4px 8px;color:var(--texto4);font-size:9px;font-weight:700;text-transform:uppercase;">Qtd</th>'
        + '<th style="text-align:right;padding:4px 8px;color:var(--texto4);font-size:9px;font-weight:700;text-transform:uppercase;">Pre\u00e7o un.</th>'
        + '<th style="text-align:right;padding:4px 8px;color:var(--texto4);font-size:9px;font-weight:700;text-transform:uppercase;">Total base</th>'
        + '<th style="text-align:right;padding:4px 8px;color:var(--texto4);font-size:9px;font-weight:700;text-transform:uppercase;">Projetado</th>'
        + '</tr></thead><tbody>' + itensHtml + '</tbody></table></div></td></tr>';
    });

    tabelaEl.innerHTML = '<div style="font-size:10px;color:var(--texto4);margin-bottom:6px;">Clique na etapa para ver o detalhamento de insumos</div>'
      + '<table style="width:100%;border-collapse:collapse;font-size:12px;"><thead><tr style="background:var(--bg3);border-bottom:2px solid var(--borda);">'
      + '<th style="text-align:left;padding:10px 12px;font-size:10px;font-weight:700;color:var(--texto3);text-transform:uppercase;">Etapa</th>'
      + '<th style="text-align:right;padding:10px 12px;font-size:10px;font-weight:700;color:var(--texto3);text-transform:uppercase;">R$/m²</th>'
      + '<th style="text-align:right;padding:10px 12px;font-size:10px;font-weight:700;color:var(--texto3);text-transform:uppercase;">Estimado</th>'
      + '<th style="text-align:right;padding:10px 12px;font-size:10px;font-weight:700;color:var(--texto3);text-transform:uppercase;">%</th>'
      + '<th style="text-align:left;padding:10px 12px;font-size:10px;font-weight:700;color:var(--texto3);text-transform:uppercase;width:25%;">Peso</th>'
      + '</tr></thead><tbody>'
      + tbody
      + '<tr style="background:var(--bg3);border-top:2px solid var(--borda);">'
      + '<td style="padding:10px 12px;font-weight:800;color:var(--texto);font-size:13px;">TOTAL</td>'
      + '<td style="padding:10px 12px;text-align:right;font-weight:800;color:var(--texto);font-family:\'JetBrains Mono\',monospace;font-size:13px;">R$ ' + fmtN(custoM2Modelo) + '</td>'
      + '<td style="padding:10px 12px;text-align:right;font-weight:800;color:var(--texto);font-family:\'JetBrains Mono\',monospace;font-size:13px;">R$ ' + fmtN(totalEstimado) + '</td>'
      + '<td style="padding:10px 12px;text-align:right;font-weight:800;color:var(--texto);font-family:\'JetBrains Mono\',monospace;">100%</td>'
      + '<td></td></tr></tbody></table>';
  }
}

function orcToggleDetalhe(id) {
  const row = document.getElementById(id);
  if (!row) return;
  const aberto = row.style.display !== 'none';
  row.style.display = aberto ? 'none' : '';
  const etapaRow = row.previousElementSibling;
  if (etapaRow) {
    const seta = etapaRow.querySelector('span');
    if (seta) seta.textContent = aberto ? '\u25B6' : '\u25BC';
  }
}

function fmtN(n) {
  return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── EXPORT EXCEL — Padrão EDR ──────────────────────
function exportarOrcamento() {
  const d = _orcDadosCalc;
  if (!d) { showToast('Selecione modelo e informe a area.'); return; }
  const cliente = document.getElementById('orc-cliente')?.value || 'Sem nome';
  const hoje = new Date().toLocaleDateString('pt-BR');
  const inccTexto = d.correcaoPct > 0 ? 'Correção INCC: +' + d.correcaoPct + '% ' + (_orcInccInfo ? '(' + _orcInccInfo + ')' : '') : '';

  // Gerar linhas de etapas com detalhamento
  let etapasHtml = '';
  d.etapasOrdenadas.forEach(e => {
    etapasHtml += '<tr>'
      + '<td style="padding:8px 10px;font-weight:bold;background:#f8f9fa;border:1px solid #dee2e6;">' + e.label.replace(/^[^\w]*/, '') + '</td>'
      + '<td style="padding:8px 10px;text-align:right;background:#f8f9fa;border:1px solid #dee2e6;font-family:Consolas,monospace;">R$ ' + fmtN(e.porM2) + '</td>'
      + '<td style="padding:8px 10px;text-align:right;background:#f8f9fa;border:1px solid #dee2e6;font-weight:bold;font-family:Consolas,monospace;">R$ ' + fmtN(e.estimado) + '</td>'
      + '<td style="padding:8px 10px;text-align:right;background:#f8f9fa;border:1px solid #dee2e6;">' + e.pct.toFixed(1) + '%</td>'
      + '</tr>';
    // Itens da etapa
    e.itens.forEach(item => {
      const proj = (item.total / d.areaModelo) * d.fatorCorrecao * d.areaNova;
      etapasHtml += '<tr>'
        + '<td style="padding:5px 10px 5px 30px;color:#555;border:1px solid #dee2e6;font-size:11px;">' + esc(item.descricao) + '</td>'
        + '<td style="padding:5px 10px;text-align:right;color:#888;border:1px solid #dee2e6;font-size:11px;font-family:Consolas,monospace;">' + (item.qtd ? item.qtd + ' un' : '') + (item.preco ? ' × R$ ' + fmtN(item.preco) : '') + '</td>'
        + '<td style="padding:5px 10px;text-align:right;color:#555;border:1px solid #dee2e6;font-size:11px;font-family:Consolas,monospace;">R$ ' + fmtN(proj) + '</td>'
        + '<td style="padding:5px 10px;border:1px solid #dee2e6;"></td>'
        + '</tr>';
    });
  });

  const html = '<!DOCTYPE html><html><head><meta charset="utf-8">'
    + '<style>'
    + 'body { font-family: Calibri, Arial, sans-serif; margin: 20px; color: #222; }'
    + 'table { border-collapse: collapse; width: 100%; }'
    + '.header-bar { background: #1a1a2e; color: #fff; padding: 20px 24px; border-radius: 6px 6px 0 0; }'
    + '.header-bar h1 { margin: 0; font-size: 18px; letter-spacing: 2px; }'
    + '.header-bar .sub { color: #adb5bd; font-size: 11px; margin-top: 4px; }'
    + '.info-grid { display: flex; gap: 0; border: 1px solid #dee2e6; border-top: none; }'
    + '.info-cell { flex: 1; padding: 12px 16px; border-right: 1px solid #dee2e6; }'
    + '.info-cell:last-child { border-right: none; }'
    + '.info-label { font-size: 9px; text-transform: uppercase; color: #888; font-weight: bold; letter-spacing: 1px; }'
    + '.info-val { font-size: 14px; font-weight: bold; margin-top: 2px; }'
    + '.card-row { display: flex; gap: 12px; margin: 16px 0; }'
    + '.card { flex: 1; border: 1px solid #dee2e6; border-radius: 6px; padding: 14px; text-align: center; }'
    + '.card-label { font-size: 9px; text-transform: uppercase; color: #888; font-weight: bold; }'
    + '.card-val { font-size: 20px; font-weight: 800; margin-top: 4px; }'
    + '.card-sub { font-size: 10px; color: #aaa; margin-top: 2px; }'
    + '.footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #dee2e6; font-size: 10px; color: #aaa; }'
    + '</style></head><body>'
    // Header EDR
    + '<div class="header-bar">'
    + '<h1>EDR ENGENHARIA</h1>'
    + '<div class="sub">CNPJ 49.909.440/0001-55 · Jupi-PE · (87) 9 8171-3987</div>'
    + '</div>'
    // Info grid
    + '<div class="info-grid">'
    + '<div class="info-cell"><div class="info-label">Cliente</div><div class="info-val">' + esc(cliente) + '</div></div>'
    + '<div class="info-cell"><div class="info-label">Área</div><div class="info-val">' + d.areaNova.toFixed(2) + ' m²</div></div>'
    + '<div class="info-cell"><div class="info-label">Base</div><div class="info-val">' + esc(d.modelo.nome) + ' (' + d.areaModelo.toFixed(0) + 'm²)</div></div>'
    + '<div class="info-cell"><div class="info-label">Data</div><div class="info-val">' + hoje + '</div></div>'
    + (inccTexto ? '<div class="info-cell"><div class="info-label">INCC</div><div class="info-val" style="color:#b45309;">' + inccTexto + '</div></div>' : '')
    + '</div>'
    // Cards resumo
    + '<div class="card-row">'
    + '<div class="card"><div class="card-label">Custo Estimado</div><div class="card-val" style="color:#dc2626;">R$ ' + fmtN(d.totalEstimado) + '</div><div class="card-sub">R$ ' + fmtN(d.custoM2Modelo) + '/m²</div></div>'
    + (d.vendaEstimada > 0 ? '<div class="card"><div class="card-label">Venda Estimada</div><div class="card-val" style="color:#2563eb;">R$ ' + fmtN(d.vendaEstimada) + '</div></div>' : '')
    + (d.lucroEstimado > 0 ? '<div class="card"><div class="card-label">Lucro Estimado</div><div class="card-val" style="color:#16a34a;">R$ ' + fmtN(d.lucroEstimado) + '</div><div class="card-sub">' + d.margemEstimada.toFixed(1) + '% margem</div></div>' : '')
    + '</div>'
    // Tabela
    + '<h3 style="font-size:13px;text-transform:uppercase;letter-spacing:1px;color:#555;margin-top:24px;">Detalhamento por Etapa Construtiva</h3>'
    + '<table>'
    + '<thead><tr style="background:#1a1a2e;color:#fff;">'
    + '<th style="padding:10px 12px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:1px;">Etapa / Insumo</th>'
    + '<th style="padding:10px 12px;text-align:right;font-size:10px;text-transform:uppercase;">R$/m²</th>'
    + '<th style="padding:10px 12px;text-align:right;font-size:10px;text-transform:uppercase;">Valor Estimado</th>'
    + '<th style="padding:10px 12px;text-align:right;font-size:10px;text-transform:uppercase;">Peso %</th>'
    + '</tr></thead><tbody>'
    + etapasHtml
    + '<tr style="background:#1a1a2e;color:#fff;font-weight:bold;">'
    + '<td style="padding:10px 12px;">TOTAL</td>'
    + '<td style="padding:10px 12px;text-align:right;font-family:Consolas,monospace;">R$ ' + fmtN(d.custoM2Modelo) + '</td>'
    + '<td style="padding:10px 12px;text-align:right;font-family:Consolas,monospace;">R$ ' + fmtN(d.totalEstimado) + '</td>'
    + '<td style="padding:10px 12px;text-align:right;">100%</td>'
    + '</tr></tbody></table>'
    // Footer
    + '<div class="footer">'
    + '<strong>EDR Engenharia</strong> · Rua Gerson Ferreira de Almeida, 89, Centro, Jupi-PE<br>'
    + 'Engenheira Responsável: Elyda Rodrigues — CREA-PE 66902<br>'
    + 'Orçamento estimado com base em obra executada. Valores sujeitos a confirmação após projeto.'
    + '</div>'
    + '</body></html>';

  const blob = new Blob(['\ufeff' + html], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'Orcamento-EDR-' + cliente.replace(/\s+/g, '-') + '-' + d.areaNova + 'm2.xls';
  a.click();
  URL.revokeObjectURL(url);
  showToast('Orçamento exportado!');
}
