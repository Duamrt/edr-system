// ══════════════════════════════════════════
// FLUXO DE CAIXA PROJETADO
// ══════════════════════════════════════════

let projecoesCaixa = [];

async function loadProjecoes() {
  try {
    const r = await sbGet('projecoes_caixa', '?order=data_prevista');
    projecoesCaixa = Array.isArray(r) ? r : [];
  } catch(e) { projecoesCaixa = []; }
}

// ── CÁLCULOS ─────────────────────────────────────────────

function calcSaldoHoje() {
  // Entradas: repasses CEF + pagamentos de adicionais
  const entRepasses = (typeof repassesCef !== 'undefined' ? repassesCef : [])
    .reduce((s, r) => s + Number(r.valor || 0), 0);
  const entAdicionais = (typeof adicionaisPgtos !== 'undefined' ? adicionaisPgtos : [])
    .reduce((s, p) => s + Number(p.valor || 0), 0);
  // Saídas: lançamentos
  const saidas = lancamentos.reduce((s, l) => s + Number(l.total || 0), 0);
  // Contas a pagar já pagas (só as sem obra — com obra já estão nos lançamentos)
  const contasPagas = (typeof contasPagar !== 'undefined' ? contasPagar : [])
    .filter(c => c.status === 'pago' && !c.obra_id)
    .reduce((s, c) => s + Number(c.valor || 0), 0);
  return (entRepasses + entAdicionais) - saidas - contasPagas;
}

function calcMediaSaidaSemanal() {
  const hoje = new Date();
  const limite = new Date(hoje);
  limite.setDate(limite.getDate() - 90);
  const limiteISO = limite.toISOString().substring(0, 10);
  const recentes = lancamentos.filter(l => l.data && l.data >= limiteISO);
  const total = recentes.reduce((s, l) => s + Number(l.total || 0), 0);
  return total / (90 / 7);
}

function calcProjecaoMensal(mesesFuturo) {
  const hoje = new Date();
  const anoAtual = hoje.getFullYear();
  const mesAtual = hoje.getMonth(); // 0-based

  // Média mensal de saída dos últimos 3 meses
  const mesesPassados = [];
  for (let i = 1; i <= 3; i++) {
    let m = mesAtual - i;
    let a = anoAtual;
    while (m < 0) { m += 12; a--; }
    mesesPassados.push(a + '-' + String(m + 1).padStart(2, '0'));
  }
  const totalSaidasHist = mesesPassados.reduce((s, ym) => {
    return s + lancamentos.filter(l => l.data && l.data.startsWith(ym)).reduce((ss, l) => ss + Number(l.total || 0), 0);
  }, 0);
  const mediaMensalSaida = totalSaidasHist / Math.max(mesesPassados.length, 1);

  let saldoAcum = calcSaldoHoje();
  const resultado = [];

  for (let i = 0; i < mesesFuturo; i++) {
    let m = mesAtual + i + 1;
    let a = anoAtual;
    while (m > 11) { m -= 12; a++; }
    const ym = a + '-' + String(m + 1).padStart(2, '0');

    // Entradas projetadas nesse mês
    const entradasProj = projecoesCaixa
      .filter(p => p.data_prevista && p.data_prevista.startsWith(ym))
      .reduce((s, p) => s + Number(p.valor || 0), 0);

    // Repasses CEF confirmados nesse mês futuro
    const repassesFut = (typeof repassesCef !== 'undefined' ? repassesCef : [])
      .filter(r => r.data_credito && r.data_credito.startsWith(ym))
      .reduce((s, r) => s + Number(r.valor || 0), 0);

    const entradas = entradasProj + repassesFut;
    const saidas = mediaMensalSaida;
    saldoAcum = saldoAcum + entradas - saidas;

    resultado.push({ ym, entradas, saidas, saldo: saldoAcum });
  }

  return resultado;
}

// ── RENDERIZAÇÃO PRINCIPAL ───────────────────────────────

function renderCaixa() {
  const el = document.getElementById('caixa-content');
  if (!el) return;

  const saldoHoje = calcSaldoHoje();
  const mediaSemanal = calcMediaSaidaSemanal();
  const corSaldo = saldoHoje >= 0 ? '#2ecc71' : '#ef4444';

  // Próximas 2 semanas
  const hoje = hojeISO();
  const d14 = new Date();
  d14.setDate(d14.getDate() + 14);
  const limite14 = d14.toISOString().substring(0, 10);

  const entradasProx = projecoesCaixa.filter(p =>
    p.data_prevista && p.data_prevista >= hoje && p.data_prevista <= limite14
  );
  const totalEntradasProx = entradasProx.reduce((s, p) => s + Number(p.valor || 0), 0);
  const saidaEstimada2sem = mediaSemanal * 2;

  let html = '';

  // ── CARD SALDO HOJE ──
  html += `<div style="background:linear-gradient(135deg,${saldoHoje >= 0 ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)'},var(--bg2));border:1.5px solid ${saldoHoje >= 0 ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'};border-radius:14px;padding:24px;margin-bottom:16px;text-align:center;">
    <div style="font-size:10px;color:var(--texto3);font-weight:700;letter-spacing:2px;margin-bottom:10px;">SALDO ATUAL (ENTRADAS - SAIDAS)</div>
    <div style="font-size:32px;font-weight:800;color:${corSaldo};font-family:'Rajdhani',sans-serif;line-height:1;">${fmtR(saldoHoje)}</div>
    <div style="font-size:11px;color:var(--texto4);margin-top:8px;">${saldoHoje >= 0 ? 'Caixa positivo' : 'Caixa negativo - atenção!'}</div>
  </div>`;

  // ── CARDS PRÓXIMAS 2 SEMANAS ──
  html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px;">
    <div style="background:var(--bg2);border:1px solid var(--borda2);border-radius:12px;padding:16px;position:relative;overflow:hidden;">
      <div style="position:absolute;top:12px;right:14px;font-size:22px;opacity:0.3;">💰</div>
      <div style="font-size:10px;color:var(--texto3);font-weight:700;letter-spacing:1.5px;margin-bottom:8px;">ENTRADAS PREVISTAS (14 DIAS)</div>
      <div style="font-size:22px;font-weight:800;color:#2ecc71;font-family:'Rajdhani',sans-serif;line-height:1;">${fmtR(totalEntradasProx)}</div>
      <div style="font-size:10px;color:var(--texto4);margin-top:6px;">${entradasProx.length} projecao(es) cadastrada(s)</div>
    </div>
    <div style="background:var(--bg2);border:1px solid var(--borda2);border-radius:12px;padding:16px;position:relative;overflow:hidden;">
      <div style="position:absolute;top:12px;right:14px;font-size:22px;opacity:0.3;">📤</div>
      <div style="font-size:10px;color:var(--texto3);font-weight:700;letter-spacing:1.5px;margin-bottom:8px;">SAIDA ESTIMADA (14 DIAS)</div>
      <div style="font-size:22px;font-weight:800;color:#ef4444;font-family:'Rajdhani',sans-serif;line-height:1;">${fmtR(saidaEstimada2sem)}</div>
      <div style="font-size:10px;color:var(--texto4);margin-top:6px;">Media baseada nos ultimos 90 dias</div>
    </div>
  </div>`;

  // ── GRÁFICO ──
  html += renderGraficoCaixa();

  // ── LISTA DE PROJEÇÕES ──
  html += `<div style="display:flex;justify-content:space-between;align-items:center;margin:20px 0 12px 0;">
    <div style="font-size:12px;font-weight:700;color:var(--branco);letter-spacing:1px;">📋 ENTRADAS PREVISTAS</div>
    <button onclick="abrirModalProjecao()" style="background:var(--verde);color:#fff;border:none;border-radius:8px;padding:8px 16px;font-size:12px;font-weight:700;cursor:pointer;">+ ADICIONAR</button>
  </div>`;

  if (!projecoesCaixa.length) {
    html += `<div style="text-align:center;padding:40px 20px;color:var(--texto3);font-size:13px;">Nenhuma entrada prevista cadastrada. Clique em + ADICIONAR para criar.</div>`;
  } else {
    const sorted = [...projecoesCaixa].sort((a, b) => (a.data_prevista || '').localeCompare(b.data_prevista || ''));
    html += sorted.map(p => {
      const obraNome = p.obra_id ? (obras.find(o => o.id === p.obra_id)?.nome || 'Obra removida') : 'Geral';
      const tipoLabels = { repasse_cef: '🏦 Repasse CEF', entrada_cliente: '💵 Entrada cliente', terreno: '🏗 Terreno', extra: '📋 Outro' };
      const tipoLabel = tipoLabels[p.tipo] || esc(p.tipo);
      const isPast = p.data_prevista && p.data_prevista < hoje;
      const corBorda = isPast ? 'rgba(239,68,68,0.3)' : 'var(--borda2)';

      return `<div style="background:var(--bg2);border:1px solid ${corBorda};border-radius:10px;padding:14px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
        <div style="flex:1;min-width:180px;">
          <div style="font-size:13px;font-weight:700;color:var(--branco);">${tipoLabel}</div>
          <div style="font-size:11px;color:var(--texto3);margin-top:2px;">${esc(obraNome)}${p.descricao ? ' · ' + esc(p.descricao) : ''}</div>
          <div style="font-size:10px;color:${isPast ? '#ef4444' : 'var(--texto4)'};margin-top:4px;">${fmtData(p.data_prevista)}${isPast ? ' · ATRASADA' : ''}</div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="font-size:18px;font-weight:800;color:#2ecc71;font-family:'Rajdhani',sans-serif;">${fmtR(p.valor)}</div>
          <div style="display:flex;gap:4px;">
            <button onclick="abrirModalProjecao('${esc(p.id)}')" style="background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.2);border-radius:6px;padding:4px 10px;color:#3b82f6;font-size:11px;cursor:pointer;" title="Editar">✎</button>
            <button onclick="excluirProjecao('${esc(p.id)}')" style="background:rgba(220,38,38,0.1);border:1px solid rgba(220,38,38,0.2);border-radius:6px;padding:4px 10px;color:#ef4444;font-size:11px;cursor:pointer;" title="Excluir">✕</button>
          </div>
        </div>
      </div>`;
    }).join('');
  }

  el.innerHTML = html;
}

// ── GRÁFICO ENTRADAS vs SAÍDAS + SALDO ACUMULADO ──────────

function renderGraficoCaixa() {
  const MESES_LABEL = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const hoje = new Date();
  const anoAtual = hoje.getFullYear();
  const mesAtual = hoje.getMonth(); // 0-based

  // 3 meses passados + mês atual + 3 meses futuros = 7 meses
  const mesesArr = [];
  for (let i = -3; i <= 3; i++) {
    let m = mesAtual + i;
    let a = anoAtual;
    while (m < 0) { m += 12; a--; }
    while (m > 11) { m -= 12; a++; }
    mesesArr.push({ ym: a + '-' + String(m + 1).padStart(2, '0'), futuro: i > 0, atual: i === 0 });
  }

  // Agregar dados
  const dados = mesesArr.map(info => {
    const ym = info.ym;

    // Entradas reais (repasses + adicionais)
    const entRepasses = (typeof repassesCef !== 'undefined' ? repassesCef : [])
      .filter(r => r.data_credito && r.data_credito.startsWith(ym))
      .reduce((s, r) => s + Number(r.valor || 0), 0);
    const entAdicionais = (typeof adicionaisPgtos !== 'undefined' ? adicionaisPgtos : [])
      .filter(p => p.data && p.data.startsWith(ym))
      .reduce((s, p) => s + Number(p.valor || 0), 0);

    // Saídas reais (lançamentos)
    const saidasReais = lancamentos
      .filter(l => l.data && l.data.startsWith(ym))
      .reduce((s, l) => s + Number(l.total || 0), 0);

    // Projeções cadastradas
    const entProjecoes = projecoesCaixa
      .filter(p => p.data_prevista && p.data_prevista.startsWith(ym))
      .reduce((s, p) => s + Number(p.valor || 0), 0);

    let entradas, saidas;
    if (info.futuro) {
      // Meses futuros: projeções + média de saída
      entradas = entProjecoes + entRepasses;
      const mediaMensal = calcMediaSaidaSemanal() * (30 / 7);
      saidas = saidasReais > 0 ? saidasReais : mediaMensal;
    } else {
      entradas = entRepasses + entAdicionais + entProjecoes;
      saidas = saidasReais;
    }

    return { ...info, entradas, saidas };
  });

  // Calcular saldo acumulado
  // Começar do saldo real antes do período
  let saldoBase = calcSaldoHoje();
  // Subtrair o que já aconteceu do mês atual em diante e os 3 meses do gráfico
  // Simplificação: calcular saldo acumulado baseado nas diferenças mês a mês
  // Recalcular: saldo no início do primeiro mês
  const mesesDoGrafico = dados.map(d => d.ym);
  // Saldo acumulado: começa no saldo de hoje e projeta
  // Para os meses passados, reconstruímos
  let saldoInicio = saldoBase;
  // Reverter os meses futuros e atual para chegar no início
  for (let i = dados.length - 1; i >= 0; i--) {
    if (dados[i].futuro || dados[i].atual) {
      // Esses meses ainda não aconteceram completamente
    }
  }
  // Simplificação: saldo acumulado progressivo
  const saldos = [];
  let acum = 0;
  dados.forEach((d, i) => {
    acum += d.entradas - d.saidas;
    saldos.push(acum);
  });
  // Ajustar: saldo do último mês passado deve bater com saldoHoje
  // Offset para alinhar
  const idxAtual = dados.findIndex(d => d.atual);
  const offset = saldoBase - saldos[idxAtual];
  saldos.forEach((s, i) => saldos[i] = s + offset);

  const maxVal = Math.max(...dados.map(d => Math.max(d.entradas, d.saidas)), 1);
  const maxSaldo = Math.max(...saldos.map(Math.abs), 1);

  const colunas = dados.map((d, i) => {
    const [a, m] = d.ym.split('-');
    const hEnt = Math.max((d.entradas / maxVal * 100), d.entradas > 0 ? 4 : 0);
    const hSai = Math.max((d.saidas / maxVal * 100), d.saidas > 0 ? 4 : 0);
    const isAtual = d.atual;
    const isFuturo = d.futuro;
    const bordaAtual = isAtual ? 'border:2px solid rgba(34,197,94,0.4);border-radius:10px;padding:4px;' : '';
    const opacidade = isFuturo ? 'opacity:0.6;' : '';
    const bordaEstilo = isFuturo ? 'border:2px dashed rgba(34,197,94,0.2);border-radius:10px;padding:4px;' : '';
    const estiloCol = isAtual ? bordaAtual : isFuturo ? bordaEstilo : '';

    return `<div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex:1;min-width:55px;${estiloCol}${opacidade}">
      <div style="display:flex;gap:3px;align-items:flex-end;height:90px;width:100%;">
        <div style="flex:1;display:flex;align-items:flex-end;height:100%;">
          <div style="width:100%;height:${hEnt}%;background:linear-gradient(0deg,#16a085,#2ecc71);border-radius:4px 4px 0 0;transition:height .5s;min-height:${d.entradas > 0 ? '4px' : '0'};" title="Entradas: ${fmtR(d.entradas)}"></div>
        </div>
        <div style="flex:1;display:flex;align-items:flex-end;height:100%;">
          <div style="width:100%;height:${hSai}%;background:linear-gradient(0deg,#c0392b,#e74c3c);border-radius:4px 4px 0 0;transition:height .5s;min-height:${d.saidas > 0 ? '4px' : '0'};" title="Saidas: ${fmtR(d.saidas)}"></div>
        </div>
      </div>
      <div style="font-size:10px;color:${isAtual ? 'var(--verde-hl)' : 'var(--texto3)'};font-weight:${isAtual ? '700' : '400'};text-align:center;">${MESES_LABEL[parseInt(m) - 1]}${isFuturo ? '*' : ''}</div>
    </div>`;
  }).join('');

  // Linha de saldo acumulado (representada como indicadores)
  const pontosSaldo = dados.map((d, i) => {
    const cor = saldos[i] >= 0 ? '#2ecc71' : '#ef4444';
    return `<div style="flex:1;text-align:center;">
      <div style="font-size:9px;font-weight:700;color:${cor};">${fmtR(saldos[i], true)}</div>
    </div>`;
  }).join('');

  return `<div style="background:var(--bg2);border:1px solid var(--borda2);border-radius:12px;padding:16px;margin-bottom:16px;">
    <div style="font-size:11px;font-weight:700;color:var(--branco);letter-spacing:1px;margin-bottom:12px;">📊 FLUXO DE CAIXA — 6 MESES</div>
    <div style="display:flex;gap:4px;align-items:center;margin-bottom:12px;">
      <span style="display:inline-block;width:12px;height:12px;background:#2ecc71;border-radius:3px;"></span>
      <span style="font-size:10px;color:var(--texto3);margin-right:12px;">Entradas</span>
      <span style="display:inline-block;width:12px;height:12px;background:#e74c3c;border-radius:3px;"></span>
      <span style="font-size:10px;color:var(--texto3);margin-right:12px;">Saidas</span>
      <span style="font-size:10px;color:var(--texto4);">* Projetado</span>
    </div>
    <div style="display:flex;gap:8px;align-items:flex-end;overflow-x:auto;padding-bottom:4px;">
      ${colunas}
    </div>
    <div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--borda);">
      <div style="font-size:9px;color:var(--texto4);margin-bottom:4px;letter-spacing:1px;">SALDO ACUMULADO</div>
      <div style="display:flex;gap:8px;">${pontosSaldo}</div>
    </div>
  </div>`;
}

// ── MODAL ─────────────────────────────────────────────────

function abrirModalProjecao(id) {
  const titulo = document.getElementById('modal-projecao-titulo');
  const selObra = document.getElementById('proj-obra');
  selObra.innerHTML = '<option value="">— Geral —</option>' +
    obras.map(o => `<option value="${o.id}">${esc(o.nome)}</option>`).join('');

  if (id) {
    const p = projecoesCaixa.find(x => x.id === id);
    if (!p) return;
    titulo.textContent = 'Editar entrada prevista';
    document.getElementById('proj-id').value = p.id;
    document.getElementById('proj-tipo').value = p.tipo || 'repasse_cef';
    document.getElementById('proj-valor').value = p.valor || '';
    document.getElementById('proj-data').value = p.data_prevista || '';
    document.getElementById('proj-obra').value = p.obra_id || '';
    document.getElementById('proj-descricao').value = p.descricao || '';
  } else {
    titulo.textContent = 'Nova entrada prevista';
    document.getElementById('proj-id').value = '';
    document.getElementById('proj-tipo').value = 'repasse_cef';
    document.getElementById('proj-valor').value = '';
    document.getElementById('proj-data').value = '';
    document.getElementById('proj-obra').value = '';
    document.getElementById('proj-descricao').value = '';
  }

  document.getElementById('modal-projecao').classList.remove('hidden');
}

async function salvarProjecao() {
  const id = document.getElementById('proj-id').value;
  const tipo = document.getElementById('proj-tipo').value;
  const valor = parseFloat(document.getElementById('proj-valor').value);
  const data = document.getElementById('proj-data').value;
  const obraId = document.getElementById('proj-obra').value || null;
  const descricao = document.getElementById('proj-descricao').value.trim();

  if (!valor || valor <= 0) { showToast('⚠ Informe o valor.'); return; }
  if (!data) { showToast('⚠ Informe a data prevista.'); return; }

  const body = { tipo, valor, data_prevista: data, obra_id: obraId, descricao };

  try {
    if (id) {
      await sbPatch('projecoes_caixa', `?id=eq.${id}`, body);
      showToast('✅ Projecao atualizada');
    } else {
      await sbPost('projecoes_caixa', body);
      showToast('✅ Entrada prevista salva');
    }
    fecharModal('projecao');
    await loadProjecoes();
    renderCaixa();
  } catch(e) {
    console.error(e);
    showToast('❌ Nao foi possivel salvar a projecao.');
  }
}

async function excluirProjecao(id) {
  if (!confirm('Excluir esta projecao? Esta acao nao pode ser desfeita.')) return;
  try {
    await sbDelete('projecoes_caixa', `?id=eq.${id}`);
    showToast('✅ Projecao excluida');
    await loadProjecoes();
    renderCaixa();
  } catch(e) {
    console.error(e);
    showToast('❌ Nao foi possivel excluir.');
  }
}
