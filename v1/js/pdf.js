// ══════════════════════════════════════════
// PDF — Geração de relatórios com pdfmake
// ══════════════════════════════════════════

const PDF_STYLES = {
  titulo: { fontSize: 18, bold: true, color: '#111827', margin: [0, 0, 0, 2] },
  subtitulo: { fontSize: 13, bold: true, color: '#059669', margin: [0, 0, 0, 2] },
  data: { fontSize: 9, color: '#6b7280' },
  h2: { fontSize: 13, bold: true, color: '#111827', margin: [0, 12, 0, 6] },
  h3: { fontSize: 11, bold: true, color: '#374151', margin: [0, 8, 0, 4] },
  normal: { fontSize: 10, color: '#374151' },
  small: { fontSize: 9, color: '#6b7280' },
  bold: { fontSize: 10, bold: true, color: '#111827' },
  money: { fontSize: 10, color: '#374151', font: 'Roboto' },
  moneyBold: { fontSize: 11, bold: true, color: '#111827' },
  verde: { fontSize: 10, bold: true, color: '#059669' },
  vermelho: { fontSize: 10, bold: true, color: '#dc2626' },
  rodape: { fontSize: 8, color: '#9ca3af', alignment: 'center' }
};

function pdfLinha() {
  return { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.5, lineColor: '#d1d5db' }], margin: [0, 6, 0, 6] };
}

function pdfRodape() {
  return [
    { text: ' ', margin: [0, 15] },
    pdfLinha(),
    { text: `EDR Engenharia — sistema.edreng.com.br — ${new Date().toLocaleDateString('pt-BR')}`, style: 'rodape' }
  ];
}

function pdfR(n) {
  return 'R$ ' + Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function pdfBarra(pct, w) {
  const pw = Math.min(Math.max(pct, 0), 100) * (w || 200) / 100;
  const cor = pct >= 80 ? '#22c55e' : pct >= 40 ? '#eab308' : '#ef4444';
  return {
    canvas: [
      { type: 'rect', x: 0, y: 0, w: w || 200, h: 8, r: 3, color: '#e5e7eb' },
      { type: 'rect', x: 0, y: 0, w: Math.max(pw, 0), h: 8, r: 3, color: cor }
    ]
  };
}

// ══════════════════════════════════════════
// 1. PDF RELATÓRIO FINANCEIRO
// ══════════════════════════════════════════

function pdfRelatorio() {
  const ym = typeof relMesAtual !== 'undefined' ? relMesAtual : new Date().toISOString().slice(0, 7);
  const [anoStr, mesStr] = ym.split('-');
  const mesLabel = MESES_FULL[parseInt(mesStr) - 1] + ' ' + anoStr;

  const lancMes = lancamentos.filter(l => l.data && l.data.startsWith(ym));
  if (lancMes.length === 0) { showToast('Sem lançamentos no mês selecionado'); return; }

  const totalSaidas = lancMes.reduce((s, l) => s + Number(l.total || 0), 0);

  // Por obra
  const porObra = {};
  lancMes.forEach(l => {
    const obra = obras.find(o => o.id === l.obra_id) || obrasArquivadas.find(o => o.id === l.obra_id);
    const nome = obra?.nome || 'Sem obra';
    if (!porObra[nome]) porObra[nome] = { total: 0, mao: 0 };
    porObra[nome].total += Number(l.total || 0);
    if (getCatFromLanc(l) === '28_mao') porObra[nome].mao += Number(l.total || 0);
  });

  // Por etapa
  const porEtapa = {};
  lancMes.forEach(l => {
    const cat = getCatFromLanc(l);
    const label = etapaLabel(cat);
    if (!porEtapa[label]) porEtapa[label] = 0;
    porEtapa[label] += Number(l.total || 0);
  });

  const content = [];
  content.push({ text: 'RELATÓRIO FINANCEIRO', style: 'titulo' });
  content.push({ text: mesLabel.toUpperCase(), style: 'subtitulo' });
  content.push({ text: `${lancMes.length} lançamentos`, style: 'data' });

  // Resumo
  content.push({ text: ' ', margin: [0, 8] });
  content.push({
    columns: [
      { text: [{ text: 'TOTAL SAÍDAS\n', style: 'small' }, { text: pdfR(totalSaidas), style: 'vermelho', fontSize: 16 }], width: '50%' },
      { text: [{ text: 'LANÇAMENTOS\n', style: 'small' }, { text: String(lancMes.length), style: 'bold', fontSize: 16 }], width: '50%' }
    ]
  });

  // Por obra
  content.push(pdfLinha());
  content.push({ text: 'POR OBRA', style: 'h2' });

  const obrasBody = [
    [{ text: 'OBRA', style: 'small', bold: true }, { text: 'TOTAL', style: 'small', bold: true, alignment: 'right' }, { text: 'MÃO DE OBRA', style: 'small', bold: true, alignment: 'right' }, { text: '%', style: 'small', bold: true, alignment: 'right' }]
  ];
  Object.entries(porObra).sort((a, b) => b[1].total - a[1].total).forEach(([nome, d]) => {
    const pct = totalSaidas > 0 ? (d.total / totalSaidas * 100).toFixed(1) : '0';
    obrasBody.push([
      { text: nome, style: 'normal' },
      { text: pdfR(d.total), style: 'normal', alignment: 'right' },
      { text: d.mao > 0 ? pdfR(d.mao) : '—', style: 'small', alignment: 'right' },
      { text: pct + '%', style: 'small', alignment: 'right' }
    ]);
  });
  obrasBody.push([
    { text: 'TOTAL', style: 'bold' },
    { text: pdfR(totalSaidas), style: 'moneyBold', alignment: 'right' },
    { text: '', style: 'small' },
    { text: '100%', style: 'bold', alignment: 'right' }
  ]);

  content.push({
    table: { headerRows: 1, widths: ['*', 'auto', 'auto', 40], body: obrasBody },
    layout: { hLineWidth: (i, n) => i === 0 || i === 1 || i === n.table.body.length ? 0.5 : 0, hLineColor: () => '#d1d5db', vLineWidth: () => 0, paddingLeft: () => 6, paddingRight: () => 6, paddingTop: () => 4, paddingBottom: () => 4 }
  });

  // Por etapa / centro de custo
  content.push({ text: 'POR CENTRO DE CUSTO', style: 'h2' });

  const etapasBody = [
    [{ text: 'ETAPA', style: 'small', bold: true }, { text: 'VALOR', style: 'small', bold: true, alignment: 'right' }, { text: '%', style: 'small', bold: true, alignment: 'right' }]
  ];
  Object.entries(porEtapa).sort((a, b) => b[1] - a[1]).forEach(([label, val]) => {
    const pct = totalSaidas > 0 ? (val / totalSaidas * 100).toFixed(1) : '0';
    etapasBody.push([
      { text: label, style: 'normal' },
      { text: pdfR(val), style: 'normal', alignment: 'right' },
      { text: pct + '%', style: 'small', alignment: 'right' }
    ]);
  });

  content.push({
    table: { headerRows: 1, widths: ['*', 'auto', 40], body: etapasBody },
    layout: { hLineWidth: (i, n) => i === 0 || i === 1 || i === n.table.body.length ? 0.5 : 0, hLineColor: () => '#d1d5db', vLineWidth: () => 0, paddingLeft: () => 6, paddingRight: () => 6, paddingTop: () => 3, paddingBottom: () => 3 }
  });

  content.push(...pdfRodape());

  const nomeArquivo = `relatorio-${ym}.pdf`;
  try {
    pdfMake.createPdf({ pageSize: 'A4', pageMargins: [40, 40, 40, 40], content, styles: PDF_STYLES }).download(nomeArquivo);
    showToast('PDF gerado');
  } catch(e) { showToast('Erro ao gerar PDF'); console.error(e); }
}

// ══════════════════════════════════════════
// 2. PDF ORÇAMENTO PARAMÉTRICO
// ══════════════════════════════════════════

function pdfOrcamento() {
  const d = _orcDadosCalc;
  if (!d) { showToast('Selecione modelo e informe a área primeiro'); return; }
  const cliente = document.getElementById('orc-cliente')?.value || '';

  const content = [];
  content.push({ text: 'ORÇAMENTO PARAMÉTRICO', style: 'titulo' });
  if (cliente) content.push({ text: cliente.toUpperCase(), style: 'subtitulo' });
  content.push({ text: `Base: ${d.modelo.nome} (${d.areaModelo.toFixed(0)}m²) → ${d.areaNova.toFixed(0)}m²${d.correcaoPct > 0 ? ' · INCC +' + d.correcaoPct + '%' : ''}`, style: 'data' });

  // Resumo
  content.push({ text: ' ', margin: [0, 8] });
  const resumoCols = [
    { text: [{ text: 'CUSTO ESTIMADO\n', style: 'small' }, { text: pdfR(d.totalEstimado), style: 'vermelho', fontSize: 14 }, { text: '\n' + pdfR(d.custoM2Modelo) + '/m²', style: 'small' }], width: '*' }
  ];
  if (d.vendaEstimada > 0) {
    resumoCols.push({ text: [{ text: 'VENDA ESTIMADA\n', style: 'small' }, { text: pdfR(d.vendaEstimada), fontSize: 14, bold: true, color: '#2563eb' }, { text: '\n' + pdfR(d.vendaEstimada / d.areaNova) + '/m²', style: 'small' }], width: '*' });
    resumoCols.push({ text: [{ text: 'LUCRO ESTIMADO\n', style: 'small' }, { text: pdfR(d.lucroEstimado), style: 'verde', fontSize: 14 }, { text: '\n' + d.margemEstimada.toFixed(1) + '% margem', style: 'small' }], width: '*' });
  }
  content.push({ columns: resumoCols });

  // Tabela de etapas
  content.push(pdfLinha());
  content.push({ text: 'DETALHAMENTO POR ETAPA', style: 'h2' });

  const tabBody = [
    [
      { text: 'ETAPA', style: 'small', bold: true },
      { text: 'R$/m²', style: 'small', bold: true, alignment: 'right' },
      { text: 'ESTIMADO', style: 'small', bold: true, alignment: 'right' },
      { text: '%', style: 'small', bold: true, alignment: 'right' }
    ]
  ];

  d.etapasOrdenadas.forEach(e => {
    tabBody.push([
      { text: e.label, style: 'normal' },
      { text: pdfR(e.porM2), style: 'normal', alignment: 'right' },
      { text: pdfR(e.estimado), style: 'bold', alignment: 'right' },
      { text: e.pct.toFixed(1) + '%', style: 'small', alignment: 'right' }
    ]);
  });

  tabBody.push([
    { text: 'TOTAL', style: 'bold' },
    { text: pdfR(d.custoM2Modelo), style: 'moneyBold', alignment: 'right' },
    { text: pdfR(d.totalEstimado), style: 'moneyBold', alignment: 'right' },
    { text: '100%', style: 'bold', alignment: 'right' }
  ]);

  content.push({
    table: { headerRows: 1, widths: ['*', 'auto', 'auto', 35], body: tabBody },
    layout: { hLineWidth: (i, n) => i === 0 || i === 1 || i === n.table.body.length ? 0.5 : 0, hLineColor: () => '#d1d5db', vLineWidth: () => 0, paddingLeft: () => 6, paddingRight: () => 6, paddingTop: () => 4, paddingBottom: () => 4 }
  });

  content.push(...pdfRodape());

  const nomeCliente = cliente ? cliente.toLowerCase().replace(/[^a-z0-9]/g, '-') : 'orcamento';
  try {
    pdfMake.createPdf({ pageSize: 'A4', pageMargins: [40, 40, 40, 40], content, styles: PDF_STYLES }).download(`orcamento-${nomeCliente}-${d.areaNova.toFixed(0)}m2.pdf`);
    showToast('PDF gerado');
  } catch(e) { showToast('Erro ao gerar PDF'); console.error(e); }
}

// ══════════════════════════════════════════
// 3. PDF FOLHA DE DIÁRIAS
// ══════════════════════════════════════════

function pdfDiarias() {
  const q = diarQuinzenaAtiva;
  if (!q) { showToast('Nenhuma quinzena selecionada'); return; }

  const regs = diarGetRegistrosQuinzena();
  if (!regs.length) { showToast('Sem registros na quinzena'); return; }

  const content = [];
  content.push({ text: 'FOLHA DE DIÁRIAS', style: 'titulo' });
  content.push({ text: q.label, style: 'subtitulo' });

  // Agrupar por funcionário
  const porFunc = {};
  regs.forEach(r => {
    const nome = r.nome || r.funcionario || 'Sem nome';
    if (!porFunc[nome]) porFunc[nome] = { regs: [], total: 0, dias: new Set() };
    porFunc[nome].regs.push(r);
    porFunc[nome].total += Number(r.valor || 0);
    porFunc[nome].dias.add(r.data);
  });

  const totalGeral = Object.values(porFunc).reduce((s, f) => s + f.total, 0);

  // Resumo
  content.push({ text: ' ', margin: [0, 5] });
  content.push({
    columns: [
      { text: [{ text: 'TOTAL\n', style: 'small' }, { text: pdfR(totalGeral), style: 'vermelho', fontSize: 16 }], width: '*' },
      { text: [{ text: 'FUNCIONÁRIOS\n', style: 'small' }, { text: String(Object.keys(porFunc).length), style: 'bold', fontSize: 16 }], width: '*' },
      { text: [{ text: 'REGISTROS\n', style: 'small' }, { text: String(regs.length), style: 'bold', fontSize: 16 }], width: '*' }
    ]
  });

  content.push(pdfLinha());

  // Tabela resumo por funcionário
  const tabBody = [
    [
      { text: 'FUNCIONÁRIO', style: 'small', bold: true },
      { text: 'DIAS', style: 'small', bold: true, alignment: 'center' },
      { text: 'DIÁRIA', style: 'small', bold: true, alignment: 'right' },
      { text: 'TOTAL', style: 'small', bold: true, alignment: 'right' }
    ]
  ];

  Object.entries(porFunc).sort((a, b) => b[1].total - a[1].total).forEach(([nome, f]) => {
    const diariaBase = f.regs[0]?.diaria_base || 0;
    tabBody.push([
      { text: nome, style: 'normal' },
      { text: String(f.dias.size), style: 'normal', alignment: 'center' },
      { text: diariaBase > 0 ? pdfR(diariaBase) : '—', style: 'small', alignment: 'right' },
      { text: pdfR(f.total), style: 'bold', alignment: 'right' }
    ]);
  });

  tabBody.push([
    { text: 'TOTAL', style: 'bold' },
    { text: '', style: 'small' },
    { text: '', style: 'small' },
    { text: pdfR(totalGeral), style: 'moneyBold', alignment: 'right' }
  ]);

  content.push({
    table: { headerRows: 1, widths: ['*', 40, 'auto', 'auto'], body: tabBody },
    layout: { hLineWidth: (i, n) => i === 0 || i === 1 || i === n.table.body.length ? 0.5 : 0, hLineColor: () => '#d1d5db', vLineWidth: () => 0, paddingLeft: () => 6, paddingRight: () => 6, paddingTop: () => 5, paddingBottom: () => 5 }
  });

  // Detalhe por funcionário — dias e obras
  content.push({ text: 'DETALHE POR FUNCIONÁRIO', style: 'h2' });

  Object.entries(porFunc).sort((a, b) => b[1].total - a[1].total).forEach(([nome, f]) => {
    content.push({ text: nome, style: 'h3' });

    const detBody = [
      [{ text: 'DATA', style: 'small', bold: true }, { text: 'OBRA(S)', style: 'small', bold: true }, { text: 'FRAÇÕES', style: 'small', bold: true, alignment: 'center' }, { text: 'VALOR', style: 'small', bold: true, alignment: 'right' }]
    ];

    f.regs.sort((a, b) => (a.data || '').localeCompare(b.data || '')).forEach(r => {
      const dataFmt = r.data ? new Date(r.data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }) : '';
      const obrasNomes = (r.periodos || []).map(p => p.obra || '').filter(Boolean).join(', ') || '—';
      detBody.push([
        { text: dataFmt, style: 'small' },
        { text: obrasNomes, style: 'normal' },
        { text: String(r.total_fracoes || 0), style: 'small', alignment: 'center' },
        { text: pdfR(r.valor || 0), style: 'normal', alignment: 'right' }
      ]);
    });

    content.push({
      table: { headerRows: 1, widths: [65, '*', 40, 'auto'], body: detBody },
      layout: { hLineWidth: (i) => i === 0 || i === 1 ? 0.3 : 0, hLineColor: () => '#e5e7eb', vLineWidth: () => 0, paddingLeft: () => 4, paddingRight: () => 4, paddingTop: () => 2, paddingBottom: () => 2 },
      margin: [10, 0, 0, 6]
    });
  });

  // Espaço para assinaturas
  content.push({ text: ' ', margin: [0, 20] });
  content.push(pdfLinha());
  content.push({
    columns: [
      { text: '\n\n_______________________________\nResponsável', style: 'small', alignment: 'center', width: '50%' },
      { text: '\n\n_______________________________\nEngenheira', style: 'small', alignment: 'center', width: '50%' }
    ],
    margin: [0, 10]
  });

  content.push(...pdfRodape());

  const label = q.label.toLowerCase().replace(/[^a-z0-9]/g, '-');
  try {
    pdfMake.createPdf({ pageSize: 'A4', pageMargins: [40, 40, 40, 40], content, styles: PDF_STYLES }).download(`diarias-${label}.pdf`);
    showToast('PDF gerado');
  } catch(e) { showToast('Erro ao gerar PDF'); console.error(e); }
}
