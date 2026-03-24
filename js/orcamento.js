// ══════════════════════════════════════════
// ORCAMENTO PARAMETRICO — Baseado em obras concluídas
// ══════════════════════════════════════════

let _orcDadosCalc = null; // cache do último cálculo para export

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
      <div style="min-width:120px;">
        <label style="font-size:10px;font-weight:700;color:var(--texto3);text-transform:uppercase;letter-spacing:1px;">Correção INCC %</label>
        <input id="orc-correcao" type="number" step="0.1" value="0" placeholder="Ex: 8.5" oninput="calcOrcamento()" style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--borda);background:var(--bg2);color:var(--texto);font-size:13px;margin-top:4px;">
      </div>
      <div style="flex:1;min-width:160px;">
        <label style="font-size:10px;font-weight:700;color:var(--texto3);text-transform:uppercase;letter-spacing:1px;">Cliente (opcional)</label>
        <input id="orc-cliente" type="text" placeholder="Nome do cliente" style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--borda);background:var(--bg2);color:var(--texto);font-size:13px;margin-top:4px;">
      </div>
      <button class="btn-save" onclick="exportarOrcamento()" style="padding:10px 20px;font-size:12px;white-space:nowrap;">EXPORTAR</button>
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
  calcOrcamento();
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
  const correcaoTag = correcaoPct > 0 ? `<span style="font-size:9px;color:#fbbf24;margin-left:4px;">+${correcaoPct}%</span>` : '';
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
        <div style="font-size:10px;color:var(--texto4);margin-top:2px;">${areaModelo.toFixed(0)}m² → ${areaNova.toFixed(0)}m²</div>
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
    tabelaEl.innerHTML = `
      <div style="font-size:10px;color:var(--texto4);margin-bottom:6px;">Clique na etapa para ver o detalhamento de insumos</div>
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead>
          <tr style="background:var(--bg3);border-bottom:2px solid var(--borda);">
            <th style="text-align:left;padding:10px 12px;font-size:10px;font-weight:700;color:var(--texto3);text-transform:uppercase;">Etapa</th>
            <th style="text-align:right;padding:10px 12px;font-size:10px;font-weight:700;color:var(--texto3);text-transform:uppercase;">R$/m²</th>
            <th style="text-align:right;padding:10px 12px;font-size:10px;font-weight:700;color:var(--texto3);text-transform:uppercase;">Estimado</th>
            <th style="text-align:right;padding:10px 12px;font-size:10px;font-weight:700;color:var(--texto3);text-transform:uppercase;">%</th>
            <th style="text-align:left;padding:10px 12px;font-size:10px;font-weight:700;color:var(--texto3);text-transform:uppercase;width:25%;">Peso</th>
          </tr>
        </thead>
        <tbody>
          ${etapasOrdenadas.map((e, i) => `
            <tr onclick="orcToggleDetalhe('orc-det-${i}')" style="border-bottom:1px solid var(--borda);cursor:pointer;${i % 2 ? 'background:var(--bg2);' : ''}transition:background 0.15s;" onmouseover="this.style.background='rgba(34,197,94,0.06)'" onmouseout="this.style.background='${i % 2 ? 'var(--bg2)' : ''}'">
              <td style="padding:8px 12px;font-weight:600;color:var(--texto);"><span style="margin-right:6px;font-size:10px;color:var(--texto4);">▶</span>${e.label}</td>
              <td style="padding:8px 12px;text-align:right;color:var(--texto2);font-family:'JetBrains Mono',monospace;">R$ ${fmtN(e.porM2)}</td>
              <td style="padding:8px 12px;text-align:right;font-weight:700;color:var(--texto);font-family:'JetBrains Mono',monospace;">R$ ${fmtN(e.estimado)}</td>
              <td style="padding:8px 12px;text-align:right;color:var(--texto3);font-family:'JetBrains Mono',monospace;">${e.pct.toFixed(1)}%</td>
              <td style="padding:8px 12px;">
                <div style="background:var(--borda);border-radius:4px;height:8px;overflow:hidden;">
                  <div style="background:var(--verde);height:100%;width:${e.pct}%;border-radius:4px;transition:width 0.3s;"></div>
                </div>
              </td>
            </tr>
            <tr id="orc-det-${i}" style="display:none;">
              <td colspan="5" style="padding:0;">
                <div style="background:rgba(34,197,94,0.03);border-left:3px solid var(--verde);padding:8px 12px 8px 24px;">
                  <table style="width:100%;border-collapse:collapse;font-size:11px;">
                    <thead>
                      <tr>
                        <th style="text-align:left;padding:4px 8px;color:var(--texto4);font-size:9px;font-weight:700;text-transform:uppercase;">Insumo</th>
                        <th style="text-align:right;padding:4px 8px;color:var(--texto4);font-size:9px;font-weight:700;text-transform:uppercase;">Qtd</th>
                        <th style="text-align:right;padding:4px 8px;color:var(--texto4);font-size:9px;font-weight:700;text-transform:uppercase;">Preço un.</th>
                        <th style="text-align:right;padding:4px 8px;color:var(--texto4);font-size:9px;font-weight:700;text-transform:uppercase;">Total base</th>
                        <th style="text-align:right;padding:4px 8px;color:var(--texto4);font-size:9px;font-weight:700;text-transform:uppercase;">Projetado</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${e.itens.map(item => {
                        const proj = (item.total / areaModelo) * fatorCorrecao * areaNova;
                        return '<tr style="border-bottom:1px solid rgba(255,255,255,0.03);">'
                          + '<td style="padding:5px 8px;color:var(--texto2);">' + esc(item.descricao) + '</td>'
                          + '<td style="padding:5px 8px;text-align:right;color:var(--texto3);font-family:\'JetBrains Mono\',monospace;">' + (item.qtd || '\u2014') + '</td>'
                          + '<td style="padding:5px 8px;text-align:right;color:var(--texto3);font-family:\'JetBrains Mono\',monospace;">' + (item.preco ? 'R$ ' + fmtN(item.preco) : '\u2014') + '</td>'
                          + '<td style="padding:5px 8px;text-align:right;color:var(--texto3);font-family:\'JetBrains Mono\',monospace;">R$ ' + fmtN(item.total) + '</td>'
                          + '<td style="padding:5px 8px;text-align:right;color:var(--texto);font-weight:600;font-family:\'JetBrains Mono\',monospace;">R$ ' + fmtN(proj) + '</td>'
                          + '</tr>';
                      }).join('')}
                    </tbody>
                  </table>
                </div>
              </td>
            </tr>
          `).join('')}
          <tr style="background:var(--bg3);border-top:2px solid var(--borda);">
            <td style="padding:10px 12px;font-weight:800;color:var(--texto);font-size:13px;">TOTAL</td>
            <td style="padding:10px 12px;text-align:right;font-weight:800;color:var(--texto);font-family:'JetBrains Mono',monospace;font-size:13px;">R$ ${fmtN(custoM2Modelo)}</td>
            <td style="padding:10px 12px;text-align:right;font-weight:800;color:var(--texto);font-family:'JetBrains Mono',monospace;font-size:13px;">R$ ${fmtN(totalEstimado)}</td>
            <td style="padding:10px 12px;text-align:right;font-weight:800;color:var(--texto);font-family:'JetBrains Mono',monospace;">100%</td>
            <td></td>
          </tr>
        </tbody>
      </table>
    `;
  }
}

function orcToggleDetalhe(id) {
  const row = document.getElementById(id);
  if (!row) return;
  const aberto = row.style.display !== 'none';
  row.style.display = aberto ? 'none' : '';
  // Atualizar seta
  const etapaRow = row.previousElementSibling;
  if (etapaRow) {
    const seta = etapaRow.querySelector('span');
    if (seta) seta.textContent = aberto ? '▶' : '▼';
  }
}

function fmtN(n) {
  return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function exportarOrcamento() {
  const d = _orcDadosCalc;
  if (!d) { showToast('Selecione modelo e informe a area.'); return; }
  const cliente = document.getElementById('orc-cliente')?.value || 'Sem nome';

  const hoje = new Date().toLocaleDateString('pt-BR');
  let csv = 'ORCAMENTO ESTIMADO - EDR ENGENHARIA\n';
  csv += `Cliente: ${cliente}\n`;
  csv += `Area: ${d.areaNova} m2\n`;
  csv += `Modelo base: ${d.modelo.nome} (${d.areaModelo} m2)\n`;
  if (d.correcaoPct > 0) csv += `Correcao INCC: +${d.correcaoPct}%\n`;
  csv += `Data: ${hoje}\n\n`;
  csv += 'ETAPA;R$/M2;ESTIMADO;%\n';
  d.etapasOrdenadas.forEach(e => {
    csv += `${e.label.replace(/^[^\w]*/, '')};${e.porM2.toFixed(2)};${e.estimado.toFixed(2)};${e.pct.toFixed(1)}%\n`;
    // Detalhamento de itens
    e.itens.forEach(item => {
      const proj = (item.total / d.areaModelo) * d.fatorCorrecao * d.areaNova;
      csv += `  ${item.descricao};${item.qtd || ''};${item.total.toFixed(2)};${proj.toFixed(2)}\n`;
    });
  });
  csv += `\nTOTAL;${d.custoM2Modelo.toFixed(2)};${d.totalEstimado.toFixed(2)};100%\n`;
  if (d.vendaEstimada > 0) {
    csv += `\nVenda estimada;;${d.vendaEstimada.toFixed(2)}\n`;
    csv += `Lucro estimado;;${d.lucroEstimado.toFixed(2)};${d.margemEstimada.toFixed(1)}%\n`;
  }

  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `orcamento-${cliente.replace(/\s+/g, '-').toLowerCase()}-${d.areaNova}m2.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Orcamento exportado!');
}
