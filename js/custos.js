// ══════════════════════════════════════════
// CUSTOS CEF — REPASSES
// ══════════════════════════════════════════
async function loadRepassesCef() {
  try {
    const r = await sbGet('repasses_cef', '?order=data_credito.desc');
    repassesCef = Array.isArray(r) ? r : [];
  } catch(e) { repassesCef = []; }
}

let custoObraAtual = '';

function renderCustos() {
  // Mostrar cards overview por padrão
  document.getElementById('custos-cards-overview').style.display = '';
  document.getElementById('custos-detalhe-view').style.display = 'none';
  custoObraAtual = '';
  // Resetar filtros
  const buscaEl = document.getElementById('custos-filtro-busca');
  const periodoEl = document.getElementById('custos-filtro-periodo');
  if (buscaEl) buscaEl.value = '';
  if (periodoEl) periodoEl.value = '';
  renderCustosCards();
}

function filtrarCustosCards() { renderCustosCards(); }

function renderCustosCards() {
  const el = document.getElementById('custos-cards-grid');
  if (!el) return;
  const busca = (document.getElementById('custos-filtro-busca')?.value || '').toLowerCase().trim();
  const periodoVal = document.getElementById('custos-filtro-periodo')?.value || '';
  let todasObras = [...obras, ...obrasArquivadas].filter(o => !o.arquivada);

  // Filtro por nome de obra
  if (busca) todasObras = todasObras.filter(o => (o.nome||'').toLowerCase().includes(busca) || (o.cidade||'').toLowerCase().includes(busca));

  // Filtro por período — filtra os repasses por data
  let dataLimite = null;
  if (periodoVal) {
    dataLimite = new Date();
    dataLimite.setDate(dataLimite.getDate() - parseInt(periodoVal));
  }

  if (!todasObras.length) { el.innerHTML = '<div class="empty" style="grid-column:1/-1;">Nenhuma obra encontrada.</div>'; return; }

  el.innerHTML = todasObras.map(o => {
    let reps = repassesCef.filter(r => r.obra_id === o.id);
    if (dataLimite) reps = reps.filter(r => r.data_credito && new Date(r.data_credito + 'T12:00:00') >= dataLimite);
    const totalPls = reps.filter(r => (r.tipo||'pls') === 'pls').reduce((s,r) => s + Number(r.valor||0), 0);
    const totalEntrada = reps.filter(r => (r.tipo||'pls') === 'entrada').reduce((s,r) => s + Number(r.valor||0), 0);
    const totalTerreno = reps.filter(r => (r.tipo||'pls') === 'terreno').reduce((s,r) => s + Number(r.valor||0), 0);
    const totalRecebido = totalPls + totalEntrada + totalTerreno;
    const valorVenda = Number(o.valor_venda || 0);
    const custoTotal = lancamentos.filter(l => l.obra_id === o.id).reduce((s,l) => s + Number(l.total||0), 0);
    const adds = typeof getAdicionaisObra === 'function' ? getAdicionaisObra(o.id) : { qtd:0, valorTotal:0 };
    const receitaObra = valorVenda + adds.valorTotal;
    const lucro = receitaObra > 0 ? receitaObra - custoTotal : 0;
    const pctRecebido = valorVenda > 0 ? Math.min((totalRecebido/valorVenda*100), 100) : 0;
    const corLucro = lucro >= 0 ? 'var(--verde-hl)' : '#ef4444';

    return `<div class="card" style="padding:16px;cursor:pointer;transition:all .2s;border:1px solid var(--borda);"
                 onclick="custosAbrirDetalhe('${o.id}')"
                 onmouseover="this.style.borderColor='rgba(34,197,94,0.3)'"
                 onmouseout="this.style.borderColor='var(--borda)'">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">
        <div>
          <div style="font-size:15px;font-weight:700;color:var(--branco);font-family:'Rajdhani',sans-serif;">${esc(o.nome)}</div>
          <div style="font-size:11px;color:var(--texto3);margin-top:2px;">📍 ${o.cidade || 'Sem cidade'}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:16px;font-weight:800;color:var(--verde-hl);font-family:'JetBrains Mono',monospace;">${valorVenda > 0 ? fmt(valorVenda) : '-'}</div>
          <div style="font-size:9px;color:var(--texto3);">VALOR IMÓVEL</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:6px;margin-bottom:10px;">
        <div style="text-align:center;padding:6px;background:rgba(255,255,255,0.03);border-radius:8px;">
          <div style="font-size:9px;color:var(--texto3);">📄 PLS</div>
          <div style="font-size:11px;font-weight:700;color:var(--verde-hl);">${fmt(totalPls)}</div>
        </div>
        <div style="text-align:center;padding:6px;background:rgba(59,130,246,0.04);border-radius:8px;">
          <div style="font-size:9px;color:var(--texto3);">💵 ENTRADA</div>
          <div style="font-size:11px;font-weight:700;color:#60a5fa;">${fmt(totalEntrada)}</div>
        </div>
        <div style="text-align:center;padding:6px;background:rgba(168,85,247,0.04);border-radius:8px;">
          <div style="font-size:9px;color:var(--texto3);">🏗 TERRENO</div>
          <div style="font-size:11px;font-weight:700;color:#a855f7;">${fmt(totalTerreno)}</div>
        </div>
        <div style="text-align:center;padding:6px;background:rgba(245,158,11,0.04);border-radius:8px;">
          <div style="font-size:9px;color:var(--texto3);">💸 CUSTO</div>
          <div style="font-size:11px;font-weight:700;color:#f59e0b;">${fmt(custoTotal)}</div>
        </div>
      </div>
      ${adds.qtd > 0 ? `<div style="padding:4px 8px;margin-bottom:8px;background:rgba(139,92,246,0.06);border:1px solid rgba(139,92,246,0.15);border-radius:6px;display:flex;justify-content:space-between;align-items:center;">
        <span style="font-size:10px;color:#a78bfa;">📝 ${adds.qtd} adicional(is)</span>
        <span style="font-size:11px;font-weight:700;color:#a78bfa;">${fmt(adds.valorTotal)}</span>
      </div>` : ''}
      ${valorVenda > 0 ? `<div style="margin-bottom:8px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;padding:6px 10px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:8px;">
          <span style="font-size:10px;color:var(--texto3);letter-spacing:.5px;">SALDO A RECEBER</span>
          <span style="font-size:14px;font-weight:800;color:${(valorVenda - totalRecebido) >= 0 ? 'var(--verde-hl)' : '#ef4444'};font-family:'JetBrains Mono',monospace;">${fmt(valorVenda - totalRecebido)}</span>
        </div>
        <div style="height:6px;background:rgba(255,255,255,0.06);border-radius:3px;overflow:hidden;">
          <div style="width:${pctRecebido}%;height:100%;background:var(--verde3);border-radius:3px;"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:9px;color:var(--texto3);margin-top:3px;">
          <span>Recebido: ${pctRecebido.toFixed(0)}%</span>
          <span style="font-weight:700;color:${corLucro};">Lucro: ${fmt(lucro)}</span>
        </div>
      </div>` : ''}
      <div style="display:flex;justify-content:space-between;align-items:center;padding-top:8px;border-top:1px solid rgba(255,255,255,0.04);">
        <span style="font-size:10px;color:var(--texto3);">${reps.length} lançamento(s)</span>
        <span style="font-size:10px;color:var(--verde-hl);font-weight:600;">VER DETALHES →</span>
      </div>
    </div>`;
  }).join('');
}

function custosAbrirDetalhe(obraId) {
  custoObraAtual = obraId;
  document.getElementById('custos-cards-overview').style.display = 'none';
  document.getElementById('custos-detalhe-view').style.display = '';
  document.getElementById('custos-filtro-obra').value = obraId;
  renderCustosResumo();
  renderCustosDetalhes(obraId);
  renderCustosHistoricoMensal(obraId);
}

function custosVoltarCards() {
  custoObraAtual = '';
  document.getElementById('custos-cards-overview').style.display = '';
  document.getElementById('custos-detalhe-view').style.display = 'none';
  renderCustosCards();
}

function renderCustosResumo() {
  const el = document.getElementById('custos-resumo');
  if (!el) return;
  const todasObras = [...obras, ...obrasArquivadas];
  const obraFiltro = custoObraAtual || '';

  let html = '';

  // Painel financeiro por obra quando filtrada
  if (obraFiltro) {
    const obra = todasObras.find(o => o.id === obraFiltro);
    if (obra) {
      const valorVenda = Number(obra.valor_venda || 0);
      const repassesObra = repassesCef.filter(r => r.obra_id === obraFiltro);
      const totalPls = repassesObra.filter(r => (r.tipo || 'pls') === 'pls').reduce((s, r) => s + Number(r.valor || 0), 0);
      const totalEntrada = repassesObra.filter(r => (r.tipo || 'pls') === 'entrada').reduce((s, r) => s + Number(r.valor || 0), 0);
      const totalTerreno = repassesObra.filter(r => (r.tipo || 'pls') === 'terreno').reduce((s, r) => s + Number(r.valor || 0), 0);
      const totalRecebido = totalPls + totalEntrada + totalTerreno;
      const saldoReceber = valorVenda - totalRecebido;
      const custoTotal = lancamentos.filter(l => l.obra_id === obraFiltro).reduce((s, l) => s + Number(l.total || 0), 0);
      const adds = typeof getAdicionaisObra === 'function' ? getAdicionaisObra(obraFiltro) : { qtd:0, valorTotal:0, totalRecebido:0, saldo:0 };
      const receitaObra = valorVenda + adds.valorTotal;
      const lucro = receitaObra - custoTotal;
      const margem = receitaObra > 0 ? (lucro / receitaObra * 100) : 0;
      const pctRecebido = valorVenda > 0 ? Math.min((totalRecebido / valorVenda * 100), 100) : 0;

      const corSaldo = saldoReceber >= 0 ? 'var(--verde-hl)' : '#ef4444';
      const corLucro = lucro >= 0 ? 'var(--verde-hl)' : '#ef4444';
      const corMargem = margem >= 15 ? 'var(--verde-hl)' : margem >= 0 ? '#f59e0b' : '#ef4444';

      html += `
      <div class="card" style="padding:18px;grid-column:1/-1;">
        <div class="section-title" style="font-size:13px;margin-bottom:14px;">📊 RESUMO FINANCEIRO — ${obra.nome}</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:14px;">
          <div style="text-align:center;padding:10px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;">
            <div style="font-size:10px;color:var(--texto3);letter-spacing:1px;margin-bottom:4px;">VALOR DO IMÓVEL</div>
            <div style="font-size:18px;font-weight:700;color:var(--branco);font-family:'Rajdhani',sans-serif;">${valorVenda > 0 ? fmt(valorVenda) : 'Não informado'}</div>
          </div>
          <div style="text-align:center;padding:10px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;">
            <div style="font-size:10px;color:var(--texto3);letter-spacing:1px;margin-bottom:4px;">TOTAL RECEBIDO</div>
            <div style="font-size:18px;font-weight:700;color:var(--verde-hl);font-family:'Rajdhani',sans-serif;">${fmt(totalRecebido)}</div>
            <div style="font-size:10px;color:var(--texto3);margin-top:2px;">📄 PLS: ${fmt(totalPls)} &nbsp;|&nbsp; 💵 Entradas: ${fmt(totalEntrada)} &nbsp;|&nbsp; 🏗 Terreno: ${fmt(totalTerreno)}</div>
          </div>
          <div style="text-align:center;padding:10px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;">
            <div style="font-size:10px;color:var(--texto3);letter-spacing:1px;margin-bottom:4px;">SALDO A RECEBER</div>
            <div style="font-size:18px;font-weight:700;color:${corSaldo};font-family:'Rajdhani',sans-serif;">${valorVenda > 0 ? fmt(saldoReceber) : '-'}</div>
          </div>
          <div style="text-align:center;padding:10px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;">
            <div style="font-size:10px;color:var(--texto3);letter-spacing:1px;margin-bottom:4px;">CUSTO TOTAL</div>
            <div style="font-size:18px;font-weight:700;color:#f59e0b;font-family:'Rajdhani',sans-serif;">${fmt(custoTotal)}</div>
          </div>
          ${adds.qtd > 0 ? `<div style="text-align:center;padding:10px;background:rgba(139,92,246,0.04);border:1px solid rgba(139,92,246,0.15);border-radius:10px;">
            <div style="font-size:10px;color:#a78bfa;letter-spacing:1px;margin-bottom:4px;">📝 ADICIONAIS (${adds.qtd})</div>
            <div style="font-size:18px;font-weight:700;color:#a78bfa;font-family:'Rajdhani',sans-serif;">${fmt(adds.valorTotal)}</div>
            <div style="font-size:10px;color:var(--texto3);margin-top:2px;">Recebido: ${fmt(adds.totalRecebido)} · Saldo: ${fmt(adds.saldo)}</div>
          </div>` : ''}
          <div style="text-align:center;padding:10px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;">
            <div style="font-size:10px;color:var(--texto3);letter-spacing:1px;margin-bottom:4px;">LUCRO ESTIMADO</div>
            <div style="font-size:18px;font-weight:700;color:${corLucro};font-family:'Rajdhani',sans-serif;">${receitaObra > 0 ? fmt(lucro) : '-'}</div>
          </div>
          <div style="text-align:center;padding:10px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;">
            <div style="font-size:10px;color:var(--texto3);letter-spacing:1px;margin-bottom:4px;">MARGEM</div>
            <div style="font-size:18px;font-weight:700;color:${corMargem};font-family:'Rajdhani',sans-serif;">${receitaObra > 0 ? margem.toFixed(1) + '%' : '-'}</div>
          </div>
        </div>
        ${valorVenda > 0 ? `<div style="margin-top:4px;">
          <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--texto3);margin-bottom:4px;">
            <span>RECEBIDO vs VALOR VENDA</span>
            <span style="font-weight:600;color:var(--verde-hl);">${pctRecebido.toFixed(1)}%</span>
          </div>
          <div style="width:100%;height:10px;background:rgba(255,255,255,0.06);border-radius:6px;overflow:hidden;">
            <div style="width:${pctRecebido}%;height:100%;background:linear-gradient(90deg,var(--verde-hl),#27ae60);border-radius:6px;transition:width 0.4s;"></div>
          </div>
        </div>` : ''}
      </div>`;
    }
  }

  el.innerHTML = html;
}

function renderCustosDetalhes(obraId) {
  const el = document.getElementById('custos-detalhes');
  if (!el) return;
  const todasObras = [...obras, ...obrasArquivadas];
  const getNome = id => todasObras.find(o => o.id === id)?.nome || 'Obra removida';

  let lista = [...repassesCef].sort((a, b) => (b.data_credito || '').localeCompare(a.data_credito || ''));
  if (obraId) lista = lista.filter(r => r.obra_id === obraId);

  if (!lista.length) {
    el.innerHTML = '<div class="card" style="padding:24px;text-align:center;color:var(--texto3);">Nenhum repasse CEF registrado' + (obraId ? ' para esta obra.' : '.') + '</div>';
    return;
  }

  // Agrupar por obra
  const porObra = {};
  lista.forEach(r => {
    if (!porObra[r.obra_id]) porObra[r.obra_id] = [];
    porObra[r.obra_id].push(r);
  });

  let html = '';
  for (const [oid, reps] of Object.entries(porObra)) {
    const total = reps.reduce((s, r) => s + Number(r.valor || 0), 0);
    const nomeObra = getNome(oid);
    html += `<div class="card" style="padding:16px;margin-bottom:12px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
        <div class="section-title" style="margin:0;font-size:13px;">🏗 ${nomeObra}</div>
        <div style="font-size:13px;font-weight:700;color:var(--verde-hl);">${fmt(total)} — ${reps.length} lançamento(s)</div>
      </div>
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead>
            <tr style="border-bottom:1px solid var(--borda);color:var(--texto3);text-align:left;">
              <th style="padding:8px 6px;">TIPO</th>
              <th style="padding:8px 6px;">MED. Nº</th>
              <th style="padding:8px 6px;">VALOR</th>
              <th style="padding:8px 6px;">DATA CRÉDITO</th>
              <th style="padding:8px 6px;">OBS</th>
              <th style="padding:8px 6px;text-align:center;">AÇÃO</th>
            </tr>
          </thead>
          <tbody>`;
    let acum = 0;
    const sorted = [...reps].sort((a, b) => a.medicao_numero - b.medicao_numero);
    sorted.forEach(r => {
      acum += Number(r.valor || 0);
      const dt = fmtData(r.data_credito);
      const tipoR = (r.tipo || 'pls');
      const tipoLabel = tipoR === 'entrada' ? '💵 ENTRADA' : tipoR === 'terreno' ? '🏗 TERRENO' : '📄 PLS';
      const tipoColor = tipoR === 'entrada' ? '#3b82f6' : tipoR === 'terreno' ? '#a855f7' : 'var(--verde-hl)';
      const medLabel = (tipoR === 'entrada' || tipoR === 'terreno') ? '-' : '#' + r.medicao_numero;
      html += `<tr style="border-bottom:1px solid rgba(255,255,255,0.04);">
        <td style="padding:8px 6px;font-size:11px;font-weight:600;color:${tipoColor};">${tipoLabel}</td>
        <td style="padding:8px 6px;font-weight:700;color:var(--branco);">${medLabel}</td>
        <td style="padding:8px 6px;color:${tipoColor};font-weight:600;">${fmt(r.valor)}</td>
        <td style="padding:8px 6px;color:var(--texto);">${dt}</td>
        <td style="padding:8px 6px;color:var(--texto3);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${r.observacao || '-'}${r.criado_por ? `<span class="admin-only" style="display:block;font-size:9px;color:var(--texto4);margin-top:2px;">👤 ${r.criado_por}</span>` : ''}</td>
        <td style="padding:8px 6px;text-align:center;white-space:nowrap;">
          <button onclick="editarRepasse('${r.id}')" style="background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.2);border-radius:6px;padding:4px 10px;color:#3b82f6;font-size:11px;cursor:pointer;margin-right:4px;" title="Editar">✎</button>
          <button onclick="excluirRepasse('${r.id}')" style="background:rgba(220,38,38,0.1);border:1px solid rgba(220,38,38,0.2);border-radius:6px;padding:4px 10px;color:#ef4444;font-size:11px;cursor:pointer;" title="Excluir">✕</button>
        </td>
      </tr>`;
    });
    html += `</tbody></table></div></div>`;
  }
  el.innerHTML = html;
}

function renderCustosHistoricoMensal(obraId) {
  const el = document.getElementById('custos-historico-mensal');
  if (!el) return;
  const todasObras = [...obras, ...obrasArquivadas];
  const getNome = id => todasObras.find(o => o.id === id)?.nome || 'Obra removida';

  let lista = [...repassesCef];
  if (obraId) lista = lista.filter(r => r.obra_id === obraId);
  if (!lista.length) { el.innerHTML = ''; return; }

  // Agrupar por mês
  const porMes = {};
  lista.forEach(r => {
    const mes = r.data_credito ? r.data_credito.substring(0, 7) : 'sem-data';
    if (!porMes[mes]) porMes[mes] = [];
    porMes[mes].push(r);
  });

  const meses = Object.keys(porMes).sort().reverse();
  let html = `<div class="card" style="padding:16px;">
    <div class="section-title" style="font-size:13px;margin-bottom:12px;">📅 HISTÓRICO MENSAL</div>`;

  meses.forEach(mes => {
    const reps = porMes[mes];
    const totalMes = reps.reduce((s, r) => s + Number(r.valor || 0), 0);
    const label = mes !== 'sem-data' ? new Date(mes + '-15').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) : 'Sem data';
    html += `<div style="margin-bottom:12px;padding:10px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.04);border-radius:10px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <span style="font-size:12px;font-weight:600;color:var(--branco);text-transform:capitalize;">${label}</span>
        <span style="font-size:13px;font-weight:700;color:var(--verde-hl);">${fmt(totalMes)}</span>
      </div>`;
    reps.sort((a, b) => a.medicao_numero - b.medicao_numero).forEach(r => {
      const nomeObra = getNome(r.obra_id);
      const tipoR = (r.tipo || 'pls');
      const tipoTag = tipoR === 'entrada' ? '<span style="color:#3b82f6;font-weight:600;">ENTRADA</span>' : tipoR === 'terreno' ? '<span style="color:#a855f7;font-weight:600;">TERRENO</span>' : '<span style="color:var(--verde-hl);font-weight:600;">PLS</span>';
      const medInfo = (tipoR === 'entrada' || tipoR === 'terreno') ? '' : ` — Med. #${r.medicao_numero}`;
      html += `<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:11px;color:var(--texto3);">
        <span>${tipoTag} ${nomeObra}${medInfo}</span>
        <span style="color:${tipoR === 'entrada' ? '#3b82f6' : tipoR === 'terreno' ? '#a855f7' : 'var(--verde-hl)'};">${fmt(r.valor)}</span>
      </div>`;
    });
    html += `</div>`;
  });

  html += `</div>`;
  el.innerHTML = html;
}

function abrirModalRepasse(obraId) {
  const todasObras = [...obras, ...obrasArquivadas];
  const sel = document.getElementById('repasse-obra');
  sel.innerHTML = '<option value="" style="background:var(--bg3);color:#fff;">Selecione...</option>' +
    todasObras.map(o => `<option value="${o.id}" style="background:var(--bg3);color:#fff;" ${o.id === obraId ? 'selected' : ''}>${esc(o.nome)}</option>`).join('');
  document.getElementById('repasse-id').value = '';
  document.getElementById('repasse-tipo').value = 'pls';
  document.getElementById('repasse-medicao').value = '';
  document.getElementById('repasse-valor').value = '';
  document.getElementById('repasse-data').value = hojeISO();
  document.getElementById('repasse-obs').value = '';
  document.getElementById('repasse-medicao-wrap').style.display = '';
  // Auto-incrementar medição
  if (obraId) {
    const existentes = repassesCef.filter(r => r.obra_id === obraId && (r.tipo || 'pls') === 'pls');
    const maxMed = existentes.reduce((m, r) => Math.max(m, r.medicao_numero || 0), 0);
    document.getElementById('repasse-medicao').value = maxMed + 1;
  }
  document.getElementById('modal-repasse').classList.remove('hidden');
}

function editarRepasse(id) {
  const r = repassesCef.find(x => x.id === id);
  if (!r) return;
  const todasObras = [...obras, ...obrasArquivadas];
  const sel = document.getElementById('repasse-obra');
  sel.innerHTML = '<option value="" style="background:var(--bg3);color:#fff;">Selecione...</option>' +
    todasObras.map(o => `<option value="${o.id}" style="background:var(--bg3);color:#fff;" ${o.id === r.obra_id ? 'selected' : ''}>${esc(o.nome)}</option>`).join('');
  document.getElementById('repasse-id').value = r.id;
  document.getElementById('repasse-tipo').value = r.tipo || 'pls';
  document.getElementById('repasse-medicao').value = r.medicao_numero || '';
  document.getElementById('repasse-valor').value = r.valor || '';
  document.getElementById('repasse-data').value = r.data_credito || '';
  document.getElementById('repasse-obs').value = r.observacao || '';
  const tipo = r.tipo || 'pls';
  document.getElementById('repasse-medicao-wrap').style.display = (tipo === 'entrada' || tipo === 'terreno') ? 'none' : '';
  document.getElementById('modal-repasse').classList.remove('hidden');
}

function onRepasseTipoChange() {
  const tipo = document.getElementById('repasse-tipo').value;
  const wrap = document.getElementById('repasse-medicao-wrap');
  if (tipo === 'entrada' || tipo === 'terreno') {
    wrap.style.display = 'none';
    document.getElementById('repasse-medicao').value = '';
  } else {
    wrap.style.display = '';
  }
}

async function salvarRepasse() {
  const obraId = document.getElementById('repasse-obra').value;
  const tipo = document.getElementById('repasse-tipo').value;
  const medicaoRaw = parseInt(document.getElementById('repasse-medicao').value);
  const medicao = (tipo === 'entrada' || tipo === 'terreno') ? (medicaoRaw || 0) : medicaoRaw;
  const valor = parseFloat(document.getElementById('repasse-valor').value);
  const data = document.getElementById('repasse-data').value;
  const obs = document.getElementById('repasse-obs').value.trim();

  if (!obraId) return showToast('Selecione uma obra.');
  if (tipo === 'pls' && (!medicao || medicao < 1)) return showToast('Informe o número da medição.');
  if (!valor || valor <= 0) return showToast('Informe o valor do repasse.');
  if (!data) return showToast('Informe a data do crédito.');

  const body = { obra_id: obraId, medicao_numero: medicao, valor, data_credito: data, observacao: obs, tipo };
  const editId = document.getElementById('repasse-id').value;

  try {
    if (editId) {
      await sbPatch('repasses_cef', `?id=eq.${editId}`, body);
      showToast('Repasse atualizado!');
    } else {
      await sbPost('repasses_cef', body);
      showToast('Repasse CEF salvo!');
    }
    fecharModal('repasse');
    await loadRepassesCef();
    if (custoObraAtual) custosAbrirDetalhe(custoObraAtual); else renderCustos();
  } catch(e) {
    showToast('Erro ao salvar repasse.');
    console.error(e);
  }
}

async function excluirRepasse(id) {
  if (!confirm('Excluir este repasse CEF?')) return;
  try {
    await sbDelete('repasses_cef', `?id=eq.${id}`);
    showToast('Repasse excluído.');
    await loadRepassesCef();
    if (custoObraAtual) custosAbrirDetalhe(custoObraAtual); else renderCustos();
  } catch(e) {
    showToast('Erro ao excluir.');
    console.error(e);
  }
}

function gerarRelatorioCustos(obraIdParam) {
  const todasObras = [...obras, ...obrasArquivadas];
  const getNome = id => todasObras.find(o => o.id === id)?.nome || 'Obra removida';
  const obraId = obraIdParam || document.getElementById('custos-filtro-obra')?.value || '';
  let lista = [...repassesCef].sort((a, b) => (a.data_credito || '').localeCompare(b.data_credito || ''));
  if (obraId) lista = lista.filter(r => r.obra_id === obraId);

  // Aplicar filtro de período se veio da visão cards (sem obraId fixo)
  if (!obraId) {
    const busca = (document.getElementById('custos-filtro-busca')?.value || '').toLowerCase().trim();
    const periodoVal = document.getElementById('custos-filtro-periodo')?.value || '';
    if (busca) {
      const obrasMatch = todasObras.filter(o => (o.nome||'').toLowerCase().includes(busca) || (o.cidade||'').toLowerCase().includes(busca)).map(o => o.id);
      lista = lista.filter(r => obrasMatch.includes(r.obra_id));
    }
    if (periodoVal) {
      const dataLimite = new Date();
      dataLimite.setDate(dataLimite.getDate() - parseInt(periodoVal));
      lista = lista.filter(r => r.data_credito && new Date(r.data_credito + 'T12:00:00') >= dataLimite);
    }
  }

  const totalGeral = lista.reduce((s, r) => s + Number(r.valor || 0), 0);

  // Agrupar por obra
  const porObra = {};
  lista.forEach(r => {
    if (!porObra[r.obra_id]) porObra[r.obra_id] = { nome: getNome(r.obra_id), reps: [] };
    porObra[r.obra_id].reps.push(r);
  });

  let html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Relatório Custos CEF</title>
    <style>
      body{font-family:Arial,sans-serif;padding:30px;color:#222;font-size:12px;}
      h1{font-size:18px;margin-bottom:4px;}
      h2{font-size:14px;margin-top:20px;border-bottom:2px solid #2ecc71;padding-bottom:4px;}
      table{width:100%;border-collapse:collapse;margin-top:8px;}
      th,td{border:1px solid #ddd;padding:6px 8px;text-align:left;}
      th{background:#f5f5f5;font-weight:700;}
      .total{font-weight:700;color:#2ecc71;}
      .right{text-align:right;}
      @media print{body{padding:10px;}}
    </style></head><body>
    <h1>RELATÓRIO DE REPASSES CEF</h1>
    <p>Gerado em: ${new Date().toLocaleDateString('pt-BR')} — Total geral: <strong class="total">${fmt(totalGeral)}</strong></p>`;

  for (const [oid, data] of Object.entries(porObra)) {
    const totalObra = data.reps.reduce((s, r) => s + Number(r.valor || 0), 0);
    const totalPlsObra = data.reps.filter(r => (r.tipo||'pls')==='pls').reduce((s,r) => s + Number(r.valor||0), 0);
    const totalEntradaObra = data.reps.filter(r => (r.tipo||'pls')==='entrada').reduce((s,r) => s + Number(r.valor||0), 0);
    const totalTerrenoObra = data.reps.filter(r => (r.tipo||'pls')==='terreno').reduce((s,r) => s + Number(r.valor||0), 0);
    const obraObj = todasObras.find(o => o.id === oid);
    const valorVenda = Number(obraObj?.valor_venda || 0);
    const custoObra = lancamentos.filter(l => l.obra_id === oid).reduce((s,l) => s + Number(l.total||0), 0);
    const lucroObra = valorVenda - custoObra;
    const margemObra = valorVenda > 0 ? (lucroObra / valorVenda * 100) : 0;

    html += `<h2>${data.nome} — Total Recebido: ${fmt(totalObra)}</h2>`;
    if (valorVenda > 0) {
      html += `<table style="margin-bottom:8px;"><tbody>
        <tr><td><strong>Valor do Imóvel</strong></td><td class="right">${fmt(valorVenda)}</td></tr>
        <tr><td>PLS CEF</td><td class="right total">${fmt(totalPlsObra)}</td></tr>
        <tr><td>Entradas Cliente</td><td class="right" style="color:#3b82f6;font-weight:700;">${fmt(totalEntradaObra)}</td></tr>
        <tr><td>CEF Terreno</td><td class="right" style="color:#7c3aed;font-weight:700;">${fmt(totalTerrenoObra)}</td></tr>
        <tr><td>Saldo a Receber</td><td class="right">${fmt(valorVenda - totalObra)}</td></tr>
        <tr><td>Custo Total</td><td class="right" style="color:#d97706;font-weight:700;">${fmt(custoObra)}</td></tr>
        <tr><td><strong>Lucro Estimado</strong></td><td class="right total">${fmt(lucroObra)}</td></tr>
        <tr><td><strong>Margem</strong></td><td class="right total">${margemObra.toFixed(1)}%</td></tr>
      </tbody></table>`;
    }
    html += `<table><thead><tr><th>Tipo</th><th>Med. Nº</th><th>Valor</th><th>Data Crédito</th><th>Observação</th></tr></thead><tbody>`;
    data.reps.sort((a, b) => a.medicao_numero - b.medicao_numero).forEach(r => {
      const dt = fmtData(r.data_credito);
      const tipoR = (r.tipo || 'pls');
      const tipoLb = tipoR === 'entrada' ? 'ENTRADA' : tipoR === 'terreno' ? 'CEF TERRENO' : 'PLS CEF';
      const medLb = (tipoR === 'entrada' || tipoR === 'terreno') ? '-' : '#' + r.medicao_numero;
      html += `<tr><td>${tipoLb}</td><td>${medLb}</td><td class="right total">${fmt(r.valor)}</td><td>${dt}</td><td>${r.observacao || '-'}</td></tr>`;
    });
    html += `</tbody></table>`;
  }

  html += `</body></html>`;
  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
  w.print();
}
