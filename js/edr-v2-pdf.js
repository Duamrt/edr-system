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
  },

  // ══════════════════════════════════════════════════════════
  // 5. BOLETIM DE MEDIÇÃO — PCI / CEF
  // ══════════════════════════════════════════════════════════

  gerarPCI(dados) {
    if (!dados || !dados.length) { showToast('Sem dados de medicao'); return; }

    const tblLayout = {
      hLineWidth: (i, n) => i === 0 || i === 1 || i === n.table.body.length ? 0.5 : 0,
      hLineColor: () => '#d1d5db',
      vLineWidth: () => 0,
      paddingLeft: () => 6, paddingRight: () => 6,
      paddingTop: () => 3, paddingBottom: () => 3
    };

    const totalExec  = dados.reduce((s, o) => s + (o.execTotal || 0), 0) / dados.length;
    const totalMens  = dados.reduce((s, o) => s + (o.valorMensal || 0), 0);
    const totalContr = dados.reduce((s, o) => s + (Number(o.valor) || 0), 0);

    const content = [];
    content.push({ text: 'BOLETIM DE MEDICAO — PCI / CEF', style: 'titulo' });
    content.push({ text: 'EDR ENGENHARIA', style: 'subtitulo' });
    content.push({ text: 'Emitido em ' + new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }), style: 'data' });
    content.push({ text: ' ', margin: [0, 6] });

    // Resumo geral
    content.push({
      columns: [
        { text: [{ text: 'OBRAS\n', style: 'small' }, { text: String(dados.length), style: 'bold', fontSize: 16 }], width: '*', alignment: 'center' },
        { text: [{ text: 'EXEC. MEDIA\n', style: 'small' }, { text: totalExec.toFixed(1) + '%', style: 'verde', fontSize: 16 }], width: '*', alignment: 'center' },
        { text: [{ text: 'VALOR MENSAL\n', style: 'small' }, { text: this._fmtR(totalMens), style: 'moneyBold', fontSize: 14 }], width: '*', alignment: 'center' },
        { text: [{ text: 'TOTAL CONTRATOS\n', style: 'small' }, { text: this._fmtR(totalContr), style: 'bold', fontSize: 14 }], width: '*', alignment: 'center' }
      ]
    });

    content.push(this._linha());

    // Detalhe por obra
    dados.forEach((obra, idx) => {
      if (idx > 0) content.push({ text: ' ', margin: [0, 6] });

      const entregaFmt = obra.entrega ? new Date(obra.entrega + 'T00:00:00').toLocaleDateString('pt-BR') : '—';
      content.push({
        columns: [
          { text: obra.nome || 'Obra', style: 'h2', margin: [0, 0, 0, 0], width: '*' },
          { text: 'Entrega: ' + entregaFmt, style: 'small', width: 'auto', margin: [0, 2, 0, 0] }
        ],
        margin: [0, 8, 0, 2]
      });

      // Barra execução + resumo financeiro
      const exec = obra.execTotal || 0;
      content.push({
        columns: [
          this._barra(exec, 280),
          { text: exec.toFixed(1) + '% executado', style: 'small', width: 'auto', margin: [6, 0, 0, 0] }
        ],
        margin: [0, 0, 0, 4]
      });

      content.push({
        columns: [
          { text: [{ text: 'Contrato: ', style: 'small' }, { text: obra.valor ? this._fmtR(obra.valor) : '—', style: 'bold' }], width: '*' },
          { text: [{ text: 'Medido anterior: ', style: 'small' }, { text: obra.medidoAnterior ? this._fmtR(obra.medidoAnterior) : '—', style: 'normal' }], width: '*' },
          { text: [{ text: 'Medicao mensal: ', style: 'small' }, { text: obra.valorMensal ? this._fmtR(obra.valorMensal) : '—', style: 'verde' }], width: '*' }
        ],
        margin: [0, 0, 0, 6]
      });

      // Tabela de etapas
      if (obra.etapas && obra.etapas.length) {
        const etBody = [[
          { text: 'ETAPA CEF', style: 'small', bold: true },
          { text: 'PESO', style: 'small', bold: true, alignment: 'right' },
          { text: 'EXEC %', style: 'small', bold: true, alignment: 'right' },
          { text: 'VALOR', style: 'small', bold: true, alignment: 'right' }
        ]];

        obra.etapas.forEach(e => {
          const cor = e.exec >= 80 ? '#2D6A4F' : e.exec >= 40 ? '#B7791F' : '#374151';
          etBody.push([
            { text: e.nome, style: 'small' },
            { text: e.peso.toFixed(2) + '%', style: 'small', alignment: 'right' },
            { text: e.exec + '%', fontSize: 9, bold: true, color: cor, alignment: 'right' },
            { text: e.valor > 0 ? this._fmtR(e.valor * e.exec / 100) : '—', style: 'small', alignment: 'right' }
          ]);
        });

        content.push({
          table: { headerRows: 1, widths: ['*', 45, 45, 'auto'], body: etBody },
          layout: tblLayout
        });
      }

      // Histórico de medições
      if (obra.historico && obra.historico.length) {
        content.push({ text: 'HISTORICO DE MEDICOES', style: 'h3' });
        const histBody = [[
          { text: 'DATA', style: 'small', bold: true },
          { text: 'MEDICAO', style: 'small', bold: true, alignment: 'right' },
          { text: 'EXEC %', style: 'small', bold: true, alignment: 'right' }
        ]];
        obra.historico.forEach(h => {
          const dataFmt = h.data ? new Date(h.data + 'T00:00:00').toLocaleDateString('pt-BR') : '—';
          histBody.push([
            { text: dataFmt, style: 'small' },
            { text: h.valor != null ? this._fmtR(h.valor) : '—', style: 'small', alignment: 'right' },
            { text: h.exec != null ? h.exec + '%' : '—', style: 'small', alignment: 'right' }
          ]);
        });
        content.push({
          table: { headerRows: 1, widths: ['*', 'auto', 60], body: histBody },
          layout: {
            hLineWidth: (i) => i === 0 || i === 1 ? 0.3 : 0,
            hLineColor: () => '#e5e7eb',
            vLineWidth: () => 0,
            paddingLeft: () => 4, paddingRight: () => 4,
            paddingTop: () => 2, paddingBottom: () => 2
          },
          margin: [10, 0, 0, 0]
        });
      }
    });

    content.push(...this._rodape());

    const hoje = new Date().toISOString().split('T')[0];
    this._gerarPdf({ content }, `pci-medicao-${hoje}.pdf`);
  },

  // ══════════════════════════════════════════════════════════
  // TERMO DE ENTREGA + MANUAL DO PROPRIETÁRIO
  // ══════════════════════════════════════════════════════════

  gerarTermo(p) {
    const verde = '#2D6A4F';
    const verdeClaro = '#D8F3DC';
    const cinza = '#374151';
    const cinzaClaro = '#6b7280';
    const emp = p.empresa || {};

    const secao = (titulo) => ([
      { text: titulo, fontSize: 11, bold: true, color: '#fff', background: verde, margin: [0, 12, 0, 0], fillColor: verde },
    ]);

    // Cabeçalho
    const cabecalho = [
      { text: emp.nome || 'EDR ENGENHARIA', fontSize: 18, bold: true, color: verde, alignment: 'center', margin: [0, 0, 0, 2] },
      { text: 'CNPJ ' + (emp.cnpj || '') + ' — ' + (emp.endereco || ''), fontSize: 8, color: cinzaClaro, alignment: 'center' },
      { text: (emp.whatsapp || '') + ' | ' + (emp.instagram || '') + ' | ' + (emp.responsavel || '') + ' · ' + (emp.crea || ''), fontSize: 8, color: cinzaClaro, alignment: 'center', margin: [0, 0, 0, 10] },
      this._linha(),
      { text: 'TERMO DE ENTREGA DE OBRA\nMANUAL DO PROPRIETÁRIO', fontSize: 15, bold: true, color: verde, alignment: 'center', margin: [0, 8, 0, 8] },
      this._linha(),
    ];

    // Dados do proprietário
    const dadosBox = {
      table: {
        widths: ['*', '*'],
        body: [
          [
            { text: 'PROPRIETÁRIO: ' + (p.proprietario || '___________________________'), fontSize: 10, bold: true, color: cinza, border: [false,false,false,false] },
            { text: 'CPF: ' + (p.cpf || '___________________'), fontSize: 10, color: cinza, border: [false,false,false,false] }
          ],
          [
            { text: 'ENDEREÇO: ' + (p.endereco || '') + (p.numero ? ', ' + p.numero : ''), fontSize: 10, color: cinza, border: [false,false,false,false] },
            { text: 'CIDADE: ' + (p.cidade || ''), fontSize: 10, color: cinza, border: [false,false,false,false] }
          ],
          [
            { text: 'DATA ENTREGA: ' + (p.dataEntrega || '___/___/______'), fontSize: 10, color: cinza, border: [false,false,false,false] },
            { text: 'MODELO: ' + (p.modelo || ''), fontSize: 10, color: cinza, border: [false,false,false,false] }
          ]
        ]
      },
      layout: 'noBorders',
      fillColor: '#f9fafb',
      margin: [0, 6, 0, 10]
    };

    // Garantias
    const garantiasRows = (p.garantias || []).map(g => ([
      { text: g.item, fontSize: 9, color: cinza, border: [false,false,false,true], borderColor: ['','','','#e5e7eb'] },
      { text: g.garantia, fontSize: 9, color: verde, bold: true, alignment: 'center', border: [false,false,false,true], borderColor: ['','','','#e5e7eb'] },
      { text: g.obs || '', fontSize: 8, color: cinzaClaro, border: [false,false,false,true], borderColor: ['','','','#e5e7eb'] }
    ]));
    const garantiasTable = garantiasRows.length ? {
      table: {
        headerRows: 1,
        widths: ['*', 70, 120],
        body: [
          [
            { text: 'ITEM', fontSize: 9, bold: true, color: '#fff', fillColor: verde, border: [false,false,false,false] },
            { text: 'GARANTIA', fontSize: 9, bold: true, color: '#fff', fillColor: verde, alignment: 'center', border: [false,false,false,false] },
            { text: 'OBSERVAÇÃO', fontSize: 9, bold: true, color: '#fff', fillColor: verde, border: [false,false,false,false] }
          ],
          ...garantiasRows
        ]
      },
      layout: { hLineWidth: (i,n) => i===0||i===n.table.body.length?0:0.3, hLineColor:()=>'#e5e7eb', vLineWidth:()=>0, paddingLeft:()=>4, paddingRight:()=>4, paddingTop:()=>3, paddingBottom:()=>3 },
      margin: [0, 4, 0, 10]
    } : {};

    // Checklist
    const checklist = (p.checklist || []).map(item => ({
      text: '☐  ' + item, fontSize: 9, color: cinza, margin: [0, 2, 0, 0]
    }));

    // Listas genéricas
    const lista = (arr) => (arr || []).map(t => ({ text: '• ' + t, fontSize: 9, color: cinza, margin: [6, 1, 0, 0] }));

    // Assinaturas
    const assinaturas = {
      table: {
        widths: ['*', '*'],
        body: [[
          { stack: [
            { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 200, y2: 0, lineWidth: 0.5, lineColor: '#9ca3af' }] },
            { text: emp.responsavel || 'Responsável Técnico', fontSize: 9, color: cinzaClaro, alignment: 'center', margin: [0, 2, 0, 0] },
            { text: emp.crea || '', fontSize: 8, color: cinzaClaro, alignment: 'center' }
          ], border: [false,false,false,false], margin: [0, 20, 0, 0] },
          { stack: [
            { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 200, y2: 0, lineWidth: 0.5, lineColor: '#9ca3af' }] },
            { text: p.proprietario || 'Proprietário', fontSize: 9, color: cinzaClaro, alignment: 'center', margin: [0, 2, 0, 0] },
            { text: 'CPF: ' + (p.cpf || ''), fontSize: 8, color: cinzaClaro, alignment: 'center' }
          ], border: [false,false,false,false], margin: [0, 20, 0, 0] }
        ]]
      },
      layout: 'noBorders',
      margin: [0, 30, 0, 0]
    };

    const content = [
      ...cabecalho,
      dadosBox,

      { text: 'PRAZO DE GARANTIA', fontSize: 11, bold: true, color: '#fff', background: verde, fillColor: verde, margin: [0, 8, 0, 0], padding: [4, 4, 4, 4] },
      garantiasTable,

      { text: 'CHECKLIST DE VISTORIA', fontSize: 11, bold: true, color: '#fff', background: verde, fillColor: verde, margin: [0, 8, 0, 4], padding: [4, 4, 4, 4] },
      ...checklist,

      { text: 'ORIENTAÇÕES DE USO E MANUTENÇÃO', fontSize: 11, bold: true, color: '#fff', background: verde, fillColor: verde, margin: [0, 12, 0, 4], padding: [4, 4, 4, 4] },
      ...lista(p.orientacoes),

      { text: 'MANUTENÇÕES PREVENTIVAS', fontSize: 11, bold: true, color: '#fff', background: verde, fillColor: verde, margin: [0, 12, 0, 4], padding: [4, 4, 4, 4] },
      ...lista((p.manutencao || []).map(m => m.item + ' — ' + m.freq + (m.resp ? ' (' + m.resp + ')' : ''))),

      { text: 'PERDA DE GARANTIA', fontSize: 11, bold: true, color: '#fff', background: verde, fillColor: verde, margin: [0, 12, 0, 4], padding: [4, 4, 4, 4] },
      ...lista(p.perdaGarantia),

      { text: 'RESPONSABILIDADES DO PROPRIETÁRIO', fontSize: 11, bold: true, color: '#fff', background: verde, fillColor: verde, margin: [0, 12, 0, 4], padding: [4, 4, 4, 4] },
      ...lista(p.responsabilidades),

      { text: '\n' + (p.localData || ''), fontSize: 9, color: cinzaClaro, alignment: 'right', margin: [0, 16, 0, 0] },
      assinaturas,
      ...this._rodape()
    ];

    this._gerarPdf({ content }, `termo-entrega-${(p.proprietario||'obra').replace(/\s+/g,'-').toLowerCase()}.pdf`);
  }
};

// ── Wrappers globais (chamados pelos botões no HTML) ──────────
function pdfRelatorio()  { PdfModule.gerarRelatorio(); }
function pdfDiarias()    { PdfModule.gerarDiarias(); }
function cronGerarPDF()  { PdfModule.gerarCronograma(); }
function pciGerarPDF()   { if (typeof PciModule !== 'undefined') PciModule._gerarPdf(); }
