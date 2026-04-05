// ══════════════════════════════════════════════════════════════
// EDR V2 — PDF Export (pdfmake)
// Encapsulado, try/catch CDN, verde floresta #2D6A4F
// ══════════════════════════════════════════════════════════════

const PdfModule = {
  // Estilos V2 — verde floresta, tipografia atualizada
  STYLES: {
    titulo:    { fontSize: 18, bold: true, color: '#1B4332', margin: [0, 0, 0, 2] },
    subtitulo: { fontSize: 13, bold: true, color: '#2D6A4F', margin: [0, 0, 0, 2] },
    data:      { fontSize: 9, color: '#6b7280' },
    h2:        { fontSize: 13, bold: true, color: '#1B4332', margin: [0, 12, 0, 6] },
    h3:        { fontSize: 11, bold: true, color: '#374151', margin: [0, 8, 0, 4] },
    normal:    { fontSize: 10, color: '#374151' },
    small:     { fontSize: 9, color: '#6b7280' },
    bold:      { fontSize: 10, bold: true, color: '#1B4332' },
    money:     { fontSize: 10, color: '#374151' },
    moneyBold: { fontSize: 11, bold: true, color: '#1B4332' },
    verde:     { fontSize: 10, bold: true, color: '#2D6A4F' },
    vermelho:  { fontSize: 10, bold: true, color: '#dc2626' },
    rodape:    { fontSize: 8, color: '#9ca3af', alignment: 'center' }
  },

  // ── Utilitarios ──────────────────────────────────────────

  _linha() {
    return { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.5, lineColor: '#d1d5db' }], margin: [0, 6, 0, 6] };
  },

  _rodape() {
    return [
      { text: ' ', margin: [0, 15] },
      this._linha(),
      { text: `EDR ENGENHARIA \u2014 sistema.edreng.com.br \u2014 ${new Date().toLocaleDateString('pt-BR')}`, style: 'rodape' }
    ];
  },

  _fmtR(n) {
    return 'R$ ' + Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },

  _barra(pct, w) {
    const pw = Math.min(Math.max(pct, 0), 100) * (w || 200) / 100;
    const cor = pct >= 80 ? '#2D6A4F' : pct >= 40 ? '#B7791F' : '#dc2626';
    return {
      canvas: [
        { type: 'rect', x: 0, y: 0, w: w || 200, h: 8, r: 3, color: '#e5e7eb' },
        { type: 'rect', x: 0, y: 0, w: Math.max(pw, 0), h: 8, r: 3, color: cor }
      ]
    };
  },

  _gerarPdf(docDef, nomeArquivo) {
    try {
      if (typeof pdfMake === 'undefined') {
        showToast('Biblioteca PDF indisponivel. Verifique sua conexao.');
        return;
      }
      pdfMake.createPdf({
        pageSize: 'A4',
        pageMargins: [40, 40, 40, 40],
        styles: this.STYLES,
        ...docDef
      }).download(nomeArquivo);
      showToast('PDF gerado com sucesso');
    } catch (e) {
      console.error('PdfModule erro:', e);
      showToast('Erro ao gerar PDF. Verifique sua conexao.');
    }
  },

  // ══════════════════════════════════════════════════════════
  // 1. RELATORIO FINANCEIRO MENSAL
  // ══════════════════════════════════════════════════════════

  gerarRelatorio() {
    const ym = typeof RelatorioModule !== 'undefined' && RelatorioModule.mesAtual
      ? RelatorioModule.mesAtual
      : new Date().toISOString().slice(0, 7);
    const [anoStr, mesStr] = ym.split('-');
    const mesLabel = (typeof MESES_FULL !== 'undefined' ? MESES_FULL[parseInt(mesStr) - 1] : mesStr) + ' ' + anoStr;

    const lancMes = (typeof lancamentos !== 'undefined' ? lancamentos : []).filter(l => l.data && l.data.startsWith(ym));
    if (!lancMes.length) { showToast('Sem lancamentos no mes selecionado'); return; }

    const totalSaidas = lancMes.reduce((s, l) => s + Number(l.total || 0), 0);

    // Agrupar por obra
    const todasObras = [
      ...(typeof obras !== 'undefined' ? obras : []),
      ...(typeof obrasArquivadas !== 'undefined' ? obrasArquivadas : [])
    ];
    const porObra = {};
    lancMes.forEach(l => {
      const obra = todasObras.find(o => o.id === l.obra_id);
      const nome = obra?.nome || 'Sem obra';
      if (!porObra[nome]) porObra[nome] = { total: 0, mao: 0 };
      porObra[nome].total += Number(l.total || 0);
      const cat = typeof getCatFromLanc === 'function' ? getCatFromLanc(l) : '';
      if (cat === '28_mao') porObra[nome].mao += Number(l.total || 0);
    });

    // Agrupar por etapa/centro de custo
    const porEtapa = {};
    lancMes.forEach(l => {
      const cat = typeof getCatFromLanc === 'function' ? getCatFromLanc(l) : '';
      const label = typeof etapaLabel === 'function' ? etapaLabel(cat) : cat;
      if (!porEtapa[label]) porEtapa[label] = 0;
      porEtapa[label] += Number(l.total || 0);
    });

    const content = [];
    content.push({ text: 'RELATORIO FINANCEIRO', style: 'titulo' });
    content.push({ text: mesLabel.toUpperCase(), style: 'subtitulo' });
    content.push({ text: `${lancMes.length} lancamentos`, style: 'data' });

    // Resumo
    content.push({ text: ' ', margin: [0, 8] });
    content.push({
      columns: [
        { text: [{ text: 'TOTAL SAIDAS\n', style: 'small' }, { text: this._fmtR(totalSaidas), style: 'vermelho', fontSize: 16 }], width: '50%' },
        { text: [{ text: 'LANCAMENTOS\n', style: 'small' }, { text: String(lancMes.length), style: 'bold', fontSize: 16 }], width: '50%' }
      ]
    });

    // Tabela por obra
    content.push(this._linha());
    content.push({ text: 'POR OBRA', style: 'h2' });

    const obrasBody = [
      [
        { text: 'OBRA', style: 'small', bold: true },
        { text: 'TOTAL', style: 'small', bold: true, alignment: 'right' },
        { text: 'MAO DE OBRA', style: 'small', bold: true, alignment: 'right' },
        { text: '%', style: 'small', bold: true, alignment: 'right' }
      ]
    ];
    Object.entries(porObra).sort((a, b) => b[1].total - a[1].total).forEach(([nome, d]) => {
      const pct = totalSaidas > 0 ? (d.total / totalSaidas * 100).toFixed(1) : '0';
      obrasBody.push([
        { text: nome, style: 'normal' },
        { text: this._fmtR(d.total), style: 'normal', alignment: 'right' },
        { text: d.mao > 0 ? this._fmtR(d.mao) : '\u2014', style: 'small', alignment: 'right' },
        { text: pct + '%', style: 'small', alignment: 'right' }
      ]);
    });
    obrasBody.push([
      { text: 'TOTAL', style: 'bold' },
      { text: this._fmtR(totalSaidas), style: 'moneyBold', alignment: 'right' },
      { text: '', style: 'small' },
      { text: '100%', style: 'bold', alignment: 'right' }
    ]);

    const tblLayout = {
      hLineWidth: (i, n) => i === 0 || i === 1 || i === n.table.body.length ? 0.5 : 0,
      hLineColor: () => '#d1d5db',
      vLineWidth: () => 0,
      paddingLeft: () => 6, paddingRight: () => 6,
      paddingTop: () => 4, paddingBottom: () => 4
    };

    content.push({ table: { headerRows: 1, widths: ['*', 'auto', 'auto', 40], body: obrasBody }, layout: tblLayout });

    // Tabela por centro de custo
    content.push({ text: 'POR CENTRO DE CUSTO', style: 'h2' });

    const etapasBody = [
      [
        { text: 'ETAPA', style: 'small', bold: true },
        { text: 'VALOR', style: 'small', bold: true, alignment: 'right' },
        { text: '%', style: 'small', bold: true, alignment: 'right' }
      ]
    ];
    Object.entries(porEtapa).sort((a, b) => b[1] - a[1]).forEach(([label, val]) => {
      const pct = totalSaidas > 0 ? (val / totalSaidas * 100).toFixed(1) : '0';
      etapasBody.push([
        { text: label, style: 'normal' },
        { text: this._fmtR(val), style: 'normal', alignment: 'right' },
        { text: pct + '%', style: 'small', alignment: 'right' }
      ]);
    });

    content.push({
      table: { headerRows: 1, widths: ['*', 'auto', 40], body: etapasBody },
      layout: {
        hLineWidth: (i, n) => i === 0 || i === 1 || i === n.table.body.length ? 0.5 : 0,
        hLineColor: () => '#d1d5db',
        vLineWidth: () => 0,
        paddingLeft: () => 6, paddingRight: () => 6,
        paddingTop: () => 3, paddingBottom: () => 3
      }
    });

    content.push(...this._rodape());

    this._gerarPdf({ content }, `relatorio-${ym}.pdf`);
  },

  // ══════════════════════════════════════════════════════════
  // 2. ORCAMENTO PARAMETRICO
  // ══════════════════════════════════════════════════════════

  gerarOrcamento() {
    const d = typeof OrcamentoModule !== 'undefined' ? OrcamentoModule.dadosCalc : null;
    if (!d) { showToast('Selecione modelo e informe a area primeiro'); return; }
    const cliente = document.getElementById('orc-cliente')?.value || '';

    const content = [];
    content.push({ text: 'ORCAMENTO PARAMETRICO', style: 'titulo' });
    if (cliente) content.push({ text: cliente.toUpperCase(), style: 'subtitulo' });
    content.push({ text: `Base: ${d.modelo.nome} (${d.areaModelo.toFixed(0)}m2) \u2192 ${d.areaNova.toFixed(0)}m2${d.correcaoPct > 0 ? ' \u00B7 INCC +' + d.correcaoPct + '%' : ''}`, style: 'data' });

    // Resumo
    content.push({ text: ' ', margin: [0, 8] });
    const resumoCols = [
      { text: [{ text: 'CUSTO ESTIMADO\n', style: 'small' }, { text: this._fmtR(d.totalEstimado), style: 'vermelho', fontSize: 14 }, { text: '\n' + this._fmtR(d.custoM2Modelo) + '/m2', style: 'small' }], width: '*' }
    ];
    if (d.vendaEstimada > 0) {
      resumoCols.push({ text: [{ text: 'VENDA ESTIMADA\n', style: 'small' }, { text: this._fmtR(d.vendaEstimada), fontSize: 14, bold: true, color: '#2563eb' }, { text: '\n' + this._fmtR(d.vendaEstimada / d.areaNova) + '/m2', style: 'small' }], width: '*' });
      resumoCols.push({ text: [{ text: 'LUCRO ESTIMADO\n', style: 'small' }, { text: this._fmtR(d.lucroEstimado), style: 'verde', fontSize: 14 }, { text: '\n' + d.margemEstimada.toFixed(1) + '% margem', style: 'small' }], width: '*' });
    }
    content.push({ columns: resumoCols });

    // Tabela de etapas
    content.push(this._linha());
    content.push({ text: 'DETALHAMENTO POR ETAPA', style: 'h2' });

    const tabBody = [
      [
        { text: 'ETAPA', style: 'small', bold: true },
        { text: 'R$/m2', style: 'small', bold: true, alignment: 'right' },
        { text: 'ESTIMADO', style: 'small', bold: true, alignment: 'right' },
        { text: '%', style: 'small', bold: true, alignment: 'right' }
      ]
    ];

    (d.etapasOrdenadas || []).forEach(e => {
      tabBody.push([
        { text: e.label, style: 'normal' },
        { text: this._fmtR(e.porM2), style: 'normal', alignment: 'right' },
        { text: this._fmtR(e.estimado), style: 'bold', alignment: 'right' },
        { text: e.pct.toFixed(1) + '%', style: 'small', alignment: 'right' }
      ]);
    });

    tabBody.push([
      { text: 'TOTAL', style: 'bold' },
      { text: this._fmtR(d.custoM2Modelo), style: 'moneyBold', alignment: 'right' },
      { text: this._fmtR(d.totalEstimado), style: 'moneyBold', alignment: 'right' },
      { text: '100%', style: 'bold', alignment: 'right' }
    ]);

    content.push({
      table: { headerRows: 1, widths: ['*', 'auto', 'auto', 35], body: tabBody },
      layout: {
        hLineWidth: (i, n) => i === 0 || i === 1 || i === n.table.body.length ? 0.5 : 0,
        hLineColor: () => '#d1d5db',
        vLineWidth: () => 0,
        paddingLeft: () => 6, paddingRight: () => 6,
        paddingTop: () => 4, paddingBottom: () => 4
      }
    });

    content.push(...this._rodape());

    const nomeCliente = cliente ? cliente.toLowerCase().replace(/[^a-z0-9]/g, '-') : 'orcamento';
    this._gerarPdf({ content }, `orcamento-${nomeCliente}-${d.areaNova.toFixed(0)}m2.pdf`);
  },

  // ══════════════════════════════════════════════════════════
  // 3. FOLHA DE DIARIAS QUINZENAL
  // ══════════════════════════════════════════════════════════

  gerarDiarias() {
    const q = typeof DiariasModule !== 'undefined' ? DiariasModule.quinzenaAtiva : null;
    if (!q) { showToast('Nenhuma quinzena selecionada'); return; }

    const regs = typeof diarGetRegistrosQuinzena === 'function' ? diarGetRegistrosQuinzena() : [];
    if (!regs.length) { showToast('Sem registros na quinzena'); return; }

    const content = [];
    content.push({ text: 'FOLHA DE DIARIAS', style: 'titulo' });
    content.push({ text: q.label, style: 'subtitulo' });

    // Agrupar por funcionario
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
        { text: [{ text: 'TOTAL\n', style: 'small' }, { text: this._fmtR(totalGeral), style: 'vermelho', fontSize: 16 }], width: '*' },
        { text: [{ text: 'FUNCIONARIOS\n', style: 'small' }, { text: String(Object.keys(porFunc).length), style: 'bold', fontSize: 16 }], width: '*' },
        { text: [{ text: 'REGISTROS\n', style: 'small' }, { text: String(regs.length), style: 'bold', fontSize: 16 }], width: '*' }
      ]
    });

    content.push(this._linha());

    // Tabela resumo por funcionario
    const tabBody = [
      [
        { text: 'FUNCIONARIO', style: 'small', bold: true },
        { text: 'DIAS', style: 'small', bold: true, alignment: 'center' },
        { text: 'DIARIA', style: 'small', bold: true, alignment: 'right' },
        { text: 'TOTAL', style: 'small', bold: true, alignment: 'right' }
      ]
    ];

    Object.entries(porFunc).sort((a, b) => b[1].total - a[1].total).forEach(([nome, f]) => {
      const diariaBase = f.regs[0]?.diaria_base || 0;
      tabBody.push([
        { text: nome, style: 'normal' },
        { text: String(f.dias.size), style: 'normal', alignment: 'center' },
        { text: diariaBase > 0 ? this._fmtR(diariaBase) : '\u2014', style: 'small', alignment: 'right' },
        { text: this._fmtR(f.total), style: 'bold', alignment: 'right' }
      ]);
    });

    tabBody.push([
      { text: 'TOTAL', style: 'bold' },
      { text: '', style: 'small' },
      { text: '', style: 'small' },
      { text: this._fmtR(totalGeral), style: 'moneyBold', alignment: 'right' }
    ]);

    content.push({
      table: { headerRows: 1, widths: ['*', 40, 'auto', 'auto'], body: tabBody },
      layout: {
        hLineWidth: (i, n) => i === 0 || i === 1 || i === n.table.body.length ? 0.5 : 0,
        hLineColor: () => '#d1d5db',
        vLineWidth: () => 0,
        paddingLeft: () => 6, paddingRight: () => 6,
        paddingTop: () => 5, paddingBottom: () => 5
      }
    });

    // Detalhe por funcionario
    content.push({ text: 'DETALHE POR FUNCIONARIO', style: 'h2' });

    Object.entries(porFunc).sort((a, b) => b[1].total - a[1].total).forEach(([nome, f]) => {
      content.push({ text: nome, style: 'h3' });

      const detBody = [
        [
          { text: 'DATA', style: 'small', bold: true },
          { text: 'OBRA(S)', style: 'small', bold: true },
          { text: 'FRACOES', style: 'small', bold: true, alignment: 'center' },
          { text: 'VALOR', style: 'small', bold: true, alignment: 'right' }
        ]
      ];

      f.regs.sort((a, b) => (a.data || '').localeCompare(b.data || '')).forEach(r => {
        const dataFmt = r.data ? new Date(r.data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }) : '';
        const obrasNomes = (r.periodos || []).map(p => p.obra || '').filter(Boolean).join(', ') || '\u2014';
        detBody.push([
          { text: dataFmt, style: 'small' },
          { text: obrasNomes, style: 'normal' },
          { text: String(r.total_fracoes || 0), style: 'small', alignment: 'center' },
          { text: this._fmtR(r.valor || 0), style: 'normal', alignment: 'right' }
        ]);
      });

      content.push({
        table: { headerRows: 1, widths: [65, '*', 40, 'auto'], body: detBody },
        layout: {
          hLineWidth: (i) => i === 0 || i === 1 ? 0.3 : 0,
          hLineColor: () => '#e5e7eb',
          vLineWidth: () => 0,
          paddingLeft: () => 4, paddingRight: () => 4,
          paddingTop: () => 2, paddingBottom: () => 2
        },
        margin: [10, 0, 0, 6]
      });
    });

    // Assinaturas
    content.push({ text: ' ', margin: [0, 20] });
    content.push(this._linha());
    content.push({
      columns: [
        { text: '\n\n_______________________________\nResponsavel', style: 'small', alignment: 'center', width: '50%' },
        { text: '\n\n_______________________________\nEngenheira', style: 'small', alignment: 'center', width: '50%' }
      ],
      margin: [0, 10]
    });

    content.push(...this._rodape());

    const label = q.label.toLowerCase().replace(/[^a-z0-9]/g, '-');
    this._gerarPdf({ content }, `diarias-${label}.pdf`);
  },

  // ══════════════════════════════════════════════════════════
  // 4. CRONOGRAMA DE OBRA
  // ══════════════════════════════════════════════════════════

  gerarCronograma(tarefas, obraFiltro) {
    const tarefasRef = tarefas || (typeof CronogramaModule !== 'undefined' ? CronogramaModule.tarefas : []);
    const filtro = obraFiltro || (typeof CronogramaModule !== 'undefined' ? CronogramaModule.obraFiltro : '');

    if (!tarefasRef.length) { showToast('Nenhuma tarefa no cronograma'); return; }

    const lista = filtro ? tarefasRef.filter(t => t.obra_id === filtro) : tarefasRef;
    if (!lista.length) { showToast('Nenhuma tarefa pra essa obra'); return; }

    const obrasRef = typeof obras !== 'undefined' ? obras : [];
    const obraNome = filtro ? (obrasRef.find(o => o.id === filtro)?.nome || 'Obra') : 'Todas as Obras';

    // Stats
    const totalSubs = lista.reduce((a, t) => a + (t.subitens || []).length, 0);
    const feitosSubs = lista.reduce((a, t) => a + (t.subitens || []).filter(s => s.feito).length, 0);
    const progGeral = totalSubs > 0 ? Math.round(feitosSubs / totalSubs * 100) : 0;

    const content = [];
    content.push({ text: 'CRONOGRAMA DE OBRA', style: 'titulo' });
    content.push({ text: obraNome.toUpperCase(), style: 'subtitulo' });
    content.push({ text: 'Gerado em ' + new Date().toLocaleDateString('pt-BR'), style: 'data' });
    content.push({ text: ' ', margin: [0, 5] });

    // Resumo
    content.push({
      columns: [
        { text: lista.length + ' etapas', style: 'normal', alignment: 'center' },
        { text: totalSubs + ' servicos', style: 'normal', alignment: 'center' },
        { text: feitosSubs + ' concluidos', style: 'normal', alignment: 'center' },
        { text: progGeral + '% geral', style: 'verde', alignment: 'center' }
      ],
      margin: [0, 0, 0, 15]
    });

    content.push(this._linha());

    // Etapas com sub-itens
    lista.forEach((t, idx) => {
      const subs = t.subitens || [];
      const feitos = subs.filter(s => s.feito).length;
      const prog = subs.length > 0 ? Math.round(feitos / subs.length * 100) : Math.round(Number(t.progresso) || 0);
      const inicio = t.data_inicio ? new Date(t.data_inicio + 'T00:00:00').toLocaleDateString('pt-BR') : '';
      const fim = t.data_fim ? new Date(t.data_fim + 'T00:00:00').toLocaleDateString('pt-BR') : '';

      content.push({
        columns: [
          { text: (idx + 1) + '. ' + t.nome, style: 'bold', width: '*' },
          { text: inicio + ' \u2192 ' + fim, style: 'small', width: 'auto', alignment: 'right' }
        ],
        margin: [0, idx > 0 ? 12 : 0, 0, 2]
      });

      // Barra de progresso
      content.push({
        columns: [
          this._barra(prog, 300),
          { text: subs.length > 0 ? feitos + '/' + subs.length + ' (' + prog + '%)' : prog + '%', style: 'small', width: 'auto', margin: [6, 0, 0, 0] }
        ],
        margin: [0, 2, 0, 4]
      });

      // Sub-itens em 2 colunas
      if (subs.length > 0) {
        const tabBody = [];
        for (let i = 0; i < subs.length; i += 2) {
          const row = [];
          row.push({ text: (subs[i].feito ? '\u2611' : '\u2610') + ' ' + subs[i].nome, style: subs[i].feito ? 'small' : 'normal', color: subs[i].feito ? '#9ca3af' : '#374151' });
          if (subs[i + 1]) {
            row.push({ text: (subs[i + 1].feito ? '\u2611' : '\u2610') + ' ' + subs[i + 1].nome, style: subs[i + 1].feito ? 'small' : 'normal', color: subs[i + 1].feito ? '#9ca3af' : '#374151' });
          } else {
            row.push({ text: '' });
          }
          tabBody.push(row);
        }

        content.push({
          table: { widths: ['50%', '50%'], body: tabBody },
          layout: {
            hLineWidth: () => 0,
            vLineWidth: () => 0,
            paddingLeft: () => 8,
            paddingRight: () => 4,
            paddingTop: () => 2,
            paddingBottom: () => 2
          },
          margin: [10, 0, 0, 0]
        });
      }
    });

    content.push(...this._rodape());

    const nomeArquivo = 'cronograma-' + obraNome.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + new Date().toISOString().split('T')[0] + '.pdf';
    this._gerarPdf({ content }, nomeArquivo);
  }
};

// ── Wrappers globais (chamados pelos botões no HTML) ──────────
function pdfRelatorio()  { PdfModule.gerarRelatorio(); }
function pdfDiarias()    { PdfModule.gerarDiarias(); }
function cronGerarPDF()  { PdfModule.gerarCronograma(); }
