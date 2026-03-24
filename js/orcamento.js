// ══════════════════════════════════════════
// ORCAMENTO PARAMETRICO — Baseado em obras concluídas
// ══════════════════════════════════════════

function renderOrcamento() {
  const el = document.getElementById('orcamento-container');
  if (!el) return;

  // Só obras arquivadas (concluídas) com área preenchida
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
  const avisoEl = document.getElementById('orc-aviso');
  const resumoEl = document.getElementById('orc-resumo');
  const tabelaEl = document.getElementById('orc-tabela');
  const cardsEl = document.getElementById('orc-cards');

  if (!modeloId || areaNova <= 0) {
    if (avisoEl) avisoEl.style.display = '';
    if (resumoEl) resumoEl.style.display = 'none';
    if (tabelaEl) tabelaEl.innerHTML = '';
    return;
  }
  if (avisoEl) avisoEl.style.display = 'none';
  if (resumoEl) resumoEl.style.display = '';

  // Buscar obra modelo
  const modelo = obras.find(o => o.id === modeloId)
    || (typeof obrasArquivadas !== 'undefined' ? obrasArquivadas : []).find(o => o.id === modeloId);
  if (!modelo) return;

  const areaModelo = Number(modelo.area_m2) || 1;

  // Agrupar lançamentos por etapa
  const lancModelo = lancamentos.filter(l => l.obra_id === modeloId);
  const porEtapa = {};
  let totalModelo = 0;

  lancModelo.forEach(l => {
    const etapa = l.etapa || '36_outros';
    if (!porEtapa[etapa]) porEtapa[etapa] = 0;
    porEtapa[etapa] += Number(l.total || 0);
    totalModelo += Number(l.total || 0);
  });

  // Calcular índices e projetar
  const custoM2Modelo = totalModelo / areaModelo;
  const totalEstimado = custoM2Modelo * areaNova;
  const valorVenda = Number(modelo.valor_venda || 0);
  const vendaM2 = valorVenda > 0 ? valorVenda / areaModelo : 0;
  const vendaEstimada = vendaM2 * areaNova;
  const lucroEstimado = vendaEstimada > 0 ? vendaEstimada - totalEstimado : 0;
  const margemEstimada = vendaEstimada > 0 ? (lucroEstimado / vendaEstimada * 100) : 0;

  // Cards resumo
  if (cardsEl) {
    cardsEl.innerHTML = `
      <div style="flex:1;min-width:140px;background:var(--bg2);border:1px solid var(--borda);border-radius:10px;padding:14px;text-align:center;">
        <div style="font-size:10px;color:var(--texto3);font-weight:700;text-transform:uppercase;">Custo Estimado</div>
        <div style="font-size:20px;font-weight:800;color:var(--vermelho);margin-top:4px;">R$ ${fmtN(totalEstimado)}</div>
        <div style="font-size:10px;color:var(--texto4);margin-top:2px;">R$ ${fmtN(custoM2Modelo)}/m²</div>
      </div>
      ${vendaEstimada > 0 ? `
      <div style="flex:1;min-width:140px;background:var(--bg2);border:1px solid var(--borda);border-radius:10px;padding:14px;text-align:center;">
        <div style="font-size:10px;color:var(--texto3);font-weight:700;text-transform:uppercase;">Venda Estimada</div>
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

  // Tabela por etapa
  const etapasOrdenadas = Object.entries(porEtapa)
    .map(([key, val]) => ({
      key,
      label: etapaLabel(key),
      totalModelo: val,
      porM2: val / areaModelo,
      estimado: (val / areaModelo) * areaNova,
      pct: totalModelo > 0 ? (val / totalModelo * 100) : 0
    }))
    .sort((a, b) => b.estimado - a.estimado);

  if (tabelaEl) {
    tabelaEl.innerHTML = `
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead>
          <tr style="background:var(--bg3);border-bottom:2px solid var(--borda);">
            <th style="text-align:left;padding:10px 12px;font-size:10px;font-weight:700;color:var(--texto3);text-transform:uppercase;">Etapa</th>
            <th style="text-align:right;padding:10px 12px;font-size:10px;font-weight:700;color:var(--texto3);text-transform:uppercase;">R$/m²</th>
            <th style="text-align:right;padding:10px 12px;font-size:10px;font-weight:700;color:var(--texto3);text-transform:uppercase;">Estimado</th>
            <th style="text-align:right;padding:10px 12px;font-size:10px;font-weight:700;color:var(--texto3);text-transform:uppercase;">%</th>
            <th style="text-align:left;padding:10px 12px;font-size:10px;font-weight:700;color:var(--texto3);text-transform:uppercase;width:30%;">Peso</th>
          </tr>
        </thead>
        <tbody>
          ${etapasOrdenadas.map((e, i) => `
            <tr style="border-bottom:1px solid var(--borda);${i % 2 ? 'background:var(--bg2);' : ''}">
              <td style="padding:8px 12px;font-weight:600;color:var(--texto);">${e.label}</td>
              <td style="padding:8px 12px;text-align:right;color:var(--texto2);font-family:'JetBrains Mono',monospace;">R$ ${fmtN(e.porM2)}</td>
              <td style="padding:8px 12px;text-align:right;font-weight:700;color:var(--texto);font-family:'JetBrains Mono',monospace;">R$ ${fmtN(e.estimado)}</td>
              <td style="padding:8px 12px;text-align:right;color:var(--texto3);font-family:'JetBrains Mono',monospace;">${e.pct.toFixed(1)}%</td>
              <td style="padding:8px 12px;">
                <div style="background:var(--borda);border-radius:4px;height:8px;overflow:hidden;">
                  <div style="background:var(--verde);height:100%;width:${e.pct}%;border-radius:4px;transition:width 0.3s;"></div>
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

function fmtN(n) {
  return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function exportarOrcamento() {
  const modeloId = document.getElementById('orc-modelo')?.value;
  const areaNova = parseFloat(document.getElementById('orc-area')?.value) || 0;
  const cliente = document.getElementById('orc-cliente')?.value || 'Sem nome';

  if (!modeloId || areaNova <= 0) { showToast('Selecione modelo e informe a area.'); return; }

  const modelo = obras.find(o => o.id === modeloId)
    || (typeof obrasArquivadas !== 'undefined' ? obrasArquivadas : []).find(o => o.id === modeloId);
  if (!modelo) return;

  const areaModelo = Number(modelo.area_m2) || 1;
  const lancModelo = lancamentos.filter(l => l.obra_id === modeloId);
  const porEtapa = {};
  let totalModelo = 0;

  lancModelo.forEach(l => {
    const etapa = l.etapa || '36_outros';
    if (!porEtapa[etapa]) porEtapa[etapa] = 0;
    porEtapa[etapa] += Number(l.total || 0);
    totalModelo += Number(l.total || 0);
  });

  const custoM2 = totalModelo / areaModelo;
  const totalEst = custoM2 * areaNova;

  const etapas = Object.entries(porEtapa)
    .map(([key, val]) => ({
      label: etapaLabel(key).replace(/^[^\w]*/, ''),
      porM2: val / areaModelo,
      estimado: (val / areaModelo) * areaNova,
      pct: totalModelo > 0 ? (val / totalModelo * 100) : 0
    }))
    .sort((a, b) => b.estimado - a.estimado);

  const hoje = new Date().toLocaleDateString('pt-BR');
  let csv = 'ORCAMENTO ESTIMADO - EDR ENGENHARIA\n';
  csv += `Cliente: ${cliente}\n`;
  csv += `Area: ${areaNova} m2\n`;
  csv += `Modelo base: ${modelo.nome} (${areaModelo} m2)\n`;
  csv += `Data: ${hoje}\n\n`;
  csv += 'ETAPA;R$/M2;ESTIMADO;%\n';
  etapas.forEach(e => {
    csv += `${e.label};${e.porM2.toFixed(2)};${e.estimado.toFixed(2)};${e.pct.toFixed(1)}%\n`;
  });
  csv += `\nTOTAL;${custoM2.toFixed(2)};${totalEst.toFixed(2)};100%\n`;

  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `orcamento-${cliente.replace(/\s+/g, '-').toLowerCase()}-${areaNova}m2.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Orcamento exportado!');
}
