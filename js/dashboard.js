// Dashboard EDR — gráficos HTML nativos (sem dependência de Chart.js)

// ── DASHBOARD OPERADOR ──────────────────────────────────────
function renderDashboardOperador() {
  const el = document.getElementById('oper-welcome');
  el.classList.remove('hidden');

  const now = new Date();
  const dataStr = now.toLocaleDateString('pt-BR', { weekday:'long', day:'2-digit', month:'long' });
  const horaStr = now.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });

  const obrasAtivas = obras.map(o => {
    const ls = lancamentos.filter(l => l.obra_id === o.id);
    return { ...o, qtd: ls.length };
  }).filter(o => o.qtd > 0).sort((a,b) => b.qtd - a.qtd);

  const estoqueDisp = consolidarEstoque()
    .filter(m => m.saldoTotal > 0.01)
    .sort((a, b) => b.saldoTotal - a.saldoTotal)
    .slice(0, 8)
    .map(m => [m.desc, { qtd: m.saldoTotal, un: m.unidade }]);

  const obraMap = {};
  obras.forEach(o => obraMap[o.id] = o.nome);
  const ultimos = [...lancamentos].sort((a,b) => new Date(b.data||0) - new Date(a.data||0)).slice(0, 8);

  el.innerHTML = `
    <div class="card" style="margin-bottom:12px;padding:18px 20px;">
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <div>
          <div style="font-family:'Rajdhani',sans-serif;font-size:20px;font-weight:700;color:var(--branco);">Olá, ${esc(usuarioAtual.nome)}! 👷</div>
          <div style="font-size:11px;color:var(--texto3);margin-top:4px;font-family:'JetBrains Mono',monospace;text-transform:capitalize;">${dataStr} · ${horaStr}</div>
        </div>
        <div style="display:flex;gap:10px;">
          <button onclick="setView('form')" style="background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.15);color:var(--verde-hl);border-radius:10px;padding:10px 16px;font-family:'Rajdhani',sans-serif;font-weight:700;font-size:12px;letter-spacing:1px;cursor:pointer;">➕ LANÇAR NF</button>
          <button onclick="setView('estoque')" style="background:rgba(139,92,246,0.1);border:1px solid rgba(139,92,246,0.25);color:#a78bfa;border-radius:10px;padding:10px 16px;font-family:'Rajdhani',sans-serif;font-weight:700;font-size:12px;letter-spacing:1px;cursor:pointer;">📦 ESTOQUE</button>
        </div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
      ${dashBuildObrasAtivas(obrasAtivas)}
      ${dashBuildEstoqueDisp(estoqueDisp)}
    </div>
    ${dashBuildUltimosLanc(ultimos, obraMap)}`;
}

function dashBuildObrasAtivas(obrasAtivas) {
  return `<div class="card" style="padding:16px;">
    <div style="font-family:'Rajdhani',sans-serif;font-size:13px;font-weight:700;color:var(--verde-hl);letter-spacing:2px;margin-bottom:12px;">🏗 Obras em Andamento</div>
    ${obrasAtivas.length ? obrasAtivas.map(o => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
        <span style="font-size:13px;color:var(--branco);font-weight:600;">${esc(o.nome)}</span>
        <span style="font-size:10px;color:var(--texto3);font-family:'JetBrains Mono',monospace;background:rgba(255,255,255,0.04);padding:2px 8px;border-radius:10px;">${o.qtd} lanç.</span>
      </div>`).join('') :
      '<div style="color:var(--texto3);font-size:12px;padding:8px 0;">Nenhuma obra ativa.</div>'}
  </div>`;
}

function dashBuildEstoqueDisp(estoqueDisp) {
  return `<div class="card" style="padding:16px;">
    <div style="font-family:'Rajdhani',sans-serif;font-size:13px;font-weight:700;color:#a78bfa;letter-spacing:2px;margin-bottom:12px;">📦 Estoque Disponível</div>
    ${estoqueDisp.length ? estoqueDisp.map(([nome, v]) => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(139,92,246,0.07);">
        <span style="font-size:12px;color:var(--texto);font-weight:500;">${nome}</span>
        <span style="font-size:11px;font-weight:700;color:#a78bfa;font-family:'JetBrains Mono',monospace;">${v.qtd % 1 === 0 ? v.qtd : v.qtd.toFixed(2)} ${v.un}</span>
      </div>`).join('') :
      '<div style="color:var(--texto3);font-size:12px;padding:8px 0;">Sem estoque disponível.</div>'}
  </div>`;
}

function dashBuildUltimosLanc(ultimos, obraMap) {
  if (!ultimos.length) return '';
  return `<div class="card" style="padding:16px;">
    <div style="font-family:'Rajdhani',sans-serif;font-size:13px;font-weight:700;color:#60a5fa;letter-spacing:2px;margin-bottom:12px;">🕐 Últimos Lançamentos</div>
    ${ultimos.map(l => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:9px 0;border-bottom:1px solid rgba(59,130,246,0.07);">
        <div>
          <div style="font-size:13px;color:var(--branco);font-weight:600;">${esc(l.descricao)}</div>
          <div style="font-size:10px;color:var(--texto3);margin-top:2px;font-family:'JetBrains Mono',monospace;">${obraMap[l.obra_id]||'—'} · ${l.data||''}</div>
        </div>
        <span style="font-size:10px;color:var(--texto3);background:rgba(59,130,246,0.07);padding:2px 8px;border-radius:10px;font-family:'JetBrains Mono',monospace;white-space:nowrap;">${Number(l.qtd||1) % 1 === 0 ? Number(l.qtd||1) : Number(l.qtd||1).toFixed(2)} ${l.unidade||'UN'}</span>
      </div>`).join('')}
  </div>`;
}

// ── CÁLCULOS DO DASHBOARD ADMIN ─────────────────────────────
function calcDashMetricas() {
  const obraAtivaIds = new Set(obras.map(o => o.id));
  const lancAtivos = lancamentos.filter(l => obraAtivaIds.has(l.obra_id));
  const custoTotal = lancAtivos.reduce((s,l) => s + Number(l.total||0), 0);
  const totalPls = repassesCef.filter(r => obraAtivaIds.has(r.obra_id) && (r.tipo||'pls')==='pls').reduce((s,r) => s + Number(r.valor||0), 0);
  const totalEntradas = repassesCef.filter(r => obraAtivaIds.has(r.obra_id) && (r.tipo||'pls')==='entrada').reduce((s,r) => s + Number(r.valor||0), 0);
  const totalTerreno = repassesCef.filter(r => obraAtivaIds.has(r.obra_id) && (r.tipo||'pls')==='terreno').reduce((s,r) => s + Number(r.valor||0), 0);
  const totalRecebido = totalPls + totalEntradas + totalTerreno;
  const valorVendaTotal = obras.reduce((s,o) => s + Number(o.valor_venda||0), 0);
  const addGeral = typeof getAdicionaisGeral === 'function' ? getAdicionaisGeral(obraAtivaIds) : { valorTotal:0, totalRecebido:0, saldo:0 };
  const receitaTotal = valorVendaTotal + addGeral.valorTotal;
  const lucroGeral = receitaTotal - custoTotal;
  const margemGeral = receitaTotal > 0 ? (lucroGeral / receitaTotal * 100) : 0;
  return { obraAtivaIds, lancAtivos, custoTotal, totalRecebido, valorVendaTotal, addGeral, receitaTotal, lucroGeral, margemGeral };
}

function calcDashPorObra(lancAtivos) {
  return obras.map(o => {
    const ls = lancAtivos.filter(l => l.obra_id === o.id);
    const custo = ls.reduce((s,l) => s + Number(l.total||0), 0);
    const vv = Number(o.valor_venda||0);
    const adds = typeof getAdicionaisObra === 'function' ? getAdicionaisObra(o.id) : { qtd:0, valorTotal:0, totalRecebido:0, saldo:0 };
    const receitaObra = vv + adds.valorTotal;
    const reps = repassesCef.filter(r => r.obra_id === o.id);
    const receb = reps.reduce((s,r) => s + Number(r.valor||0), 0);
    const lucro = receitaObra - custo;
    const margem = receitaObra > 0 ? (lucro/receitaObra*100) : 0;
    return { nome: o.nome, id: o.id, custo, vv, receb, lucro, margem, qtd: ls.length, adds };
  }).filter(o => o.qtd > 0 || o.vv > 0).sort((a,b) => b.custo - a.custo);
}

function calcDashEtapas(lancAtivos) {
  const etapaMap = {};
  lancAtivos.forEach(l => {
    const lb = etapaLabel(l.etapa || '36_outros');
    etapaMap[lb] = (etapaMap[lb]||0) + Number(l.total||0);
  });
  return Object.entries(etapaMap).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]).slice(0,8);
}

// ── SEÇÕES HTML DO DASHBOARD ADMIN ──────────────────────────
function dashBuildHeader(dataStr) {
  return `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;padding-top:4px;padding-bottom:16px;border-bottom:1px solid rgba(255,255,255,0.06);">
    <div style="display:flex;align-items:center;gap:14px;">
      <div style="width:42px;height:42px;border-radius:10px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#22c55e,#16a34a);box-shadow:0 4px 16px rgba(34,197,94,0.3);">
        <span style="font-family:'Inter',sans-serif;font-size:14px;font-weight:900;color:#000;letter-spacing:-0.5px;">EDR</span>
      </div>
      <div>
        <div style="font-family:'Inter',sans-serif;font-size:18px;font-weight:700;color:var(--branco);letter-spacing:-0.3px;">Painel de Controle</div>
        <div style="font-size:11px;color:var(--texto3);font-weight:400;">${dataStr}</div>
      </div>
    </div>
  </div>`;
}

function dashBuildCardReceita(receitaTotal, valorVendaTotal, addGeral) {
  return `<div class="stat-card" style="border-top:2px solid #3b82f6;margin-bottom:10px;text-align:center;padding:18px;">
    <div class="stat-label" style="font-size:10px;">RECEITA TOTAL</div>
    <div class="stat-value" style="color:#3b82f6;font-size:clamp(20px,4vw,28px);">${receitaTotal > 0 ? fmt(receitaTotal) : 'Não informado'}</div>
    <div class="stat-sub">${obras.length} imóvel(is)${addGeral.valorTotal > 0 ? ` · Venda: ${fmt(valorVendaTotal)} + Adicionais: ${fmt(addGeral.valorTotal)}` : ' · soma dos valores de venda'}</div>
  </div>`;
}

function dashBuildCardsSecundarios(m, porObra) {
  const { custoTotal, totalRecebido, lucroGeral, margemGeral } = m;
  const corLucro = lucroGeral >= 0 ? 'var(--verde-hl)' : '#ef4444';
  const corMargem = margemGeral >= 15 ? 'var(--verde-hl)' : margemGeral >= 0 ? '#f59e0b' : '#ef4444';
  return `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:18px;">
    <div class="stat-card" style="border-top:2px solid #f59e0b;padding:18px;">
      <div class="stat-label">CUSTO TOTAL</div>
      <div class="stat-value" style="color:#f59e0b;">${fmt(custoTotal)}</div>
      <div class="stat-sub">${porObra.length} obra(s) ativa(s)</div>
    </div>
    <div class="stat-card" style="border-top:2px solid #22c55e;padding:18px;">
      <div class="stat-label">TOTAL RECEBIDO</div>
      <div class="stat-value" style="color:var(--verde-hl);">${fmt(totalRecebido)}</div>
      <div class="stat-sub">PLS + Entradas + Terreno</div>
    </div>
    <div class="stat-card" style="border-top:2px solid ${lucroGeral >= 0 ? '#22c55e' : '#ef4444'};padding:18px;">
      <div class="stat-label">LUCRO GERAL</div>
      <div class="stat-value" style="color:${corLucro};">${fmt(lucroGeral)}</div>
      <div class="stat-sub">venda - custo</div>
    </div>
    <div class="stat-card" style="border-top:2px solid ${margemGeral >= 15 ? '#22c55e' : margemGeral >= 0 ? '#f59e0b' : '#ef4444'};padding:18px;">
      <div class="stat-label">MARGEM GERAL</div>
      <div class="stat-value" style="color:${corMargem};">${m.valorVendaTotal > 0 ? margemGeral.toFixed(1)+'%' : '-'}</div>
      <div class="stat-sub">${margemGeral >= 15 ? 'saudável' : margemGeral >= 0 ? 'atenção' : 'prejuízo'}</div>
    </div>
  </div>`;
}

function dashBuildAlertas(alertas) {
  if (!alertas.length) return '';
  return `<div style="background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.2);border-radius:12px;padding:12px 16px;margin-bottom:14px;">
    <div style="font-family:'Rajdhani',sans-serif;font-size:12px;font-weight:700;color:#ef4444;letter-spacing:2px;margin-bottom:8px;">⚠ OBRAS COM MARGEM NEGATIVA</div>
    ${alertas.map(o => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(239,68,68,0.08);">
        <span style="font-size:12px;color:var(--branco);font-weight:600;cursor:pointer;" onclick="setView('custos');setTimeout(()=>custosAbrirDetalhe('${o.id}'),100)">${esc(o.nome)}</span>
        <div style="display:flex;gap:12px;align-items:center;">
          <span style="font-size:11px;color:#ef4444;font-weight:700;">${o.margem.toFixed(1)}%</span>
          <span style="font-size:11px;color:var(--texto3);">Prejuízo: ${fmt(Math.abs(o.lucro))}</span>
        </div>
      </div>`).join('')}
  </div>`;
}

function dashBuildSaudeObras(porObra) {
  return `<div class="card" style="padding:16px;margin-bottom:14px;">
    <div style="font-size:13px;font-weight:700;color:var(--texto2);letter-spacing:0.5px;margin-bottom:16px;display:flex;align-items:center;gap:8px;"><span style="width:6px;height:6px;border-radius:50%;background:#22c55e;"></span> Saúde das Obras</div>
    ${porObra.map(o => {
      const pctReceb = o.vv > 0 ? Math.min((o.receb/o.vv*100),100) : 0;
      const corM = o.margem >= 15 ? 'var(--verde-hl)' : o.margem >= 0 ? '#f59e0b' : '#ef4444';
      const addInfo = o.adds && o.adds.qtd > 0 ? `<span style="font-size:10px;color:#a78bfa;">📝 +${fmt(o.adds.valorTotal)}</span>` : '';
      return `
      <div style="padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.06);cursor:pointer;transition:padding .15s;" onclick="setView('custos');setTimeout(()=>custosAbrirDetalhe('${o.id}'),100)">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
          <span style="font-size:13px;color:var(--branco);font-weight:600;">${esc(o.nome)}</span>
          <div style="display:flex;gap:14px;align-items:center;">
            <span style="font-size:11px;color:#f59e0b;">Custo: ${fmt(o.custo)}</span>
            ${addInfo}
            ${o.vv > 0 || (o.adds && o.adds.qtd > 0) ? `<span style="font-size:11px;font-weight:700;color:${corM};">Margem: ${o.margem.toFixed(1)}%</span>` : '<span style="font-size:10px;color:var(--texto3);">Sem valor de venda</span>'}
          </div>
        </div>
        ${o.vv > 0 ? `<div style="display:flex;align-items:center;gap:8px;">
          <div style="flex:1;height:4px;background:rgba(255,255,255,0.04);border-radius:2px;overflow:hidden;">
            <div style="width:${pctReceb}%;height:100%;background:var(--verde3);border-radius:2px;"></div>
          </div>
          <span style="font-size:9px;color:var(--texto3);min-width:60px;text-align:right;">Receb. ${pctReceb.toFixed(0)}%</span>
        </div>` : ''}
      </div>`;
    }).join('')}
  </div>`;
}

// ── GRÁFICOS ────────────────────────────────────────────────
function dashRenderFluxoCaixa(lancAtivos, obraAtivaIds) {
  const el = document.getElementById('dash-fluxo-caixa');
  if (!el) return;
  const hoje = new Date();
  const mesesArr = [];
  for (let i = 5; i >= 0; i--) {
    let m = hoje.getMonth() + 1 - i;
    let a = hoje.getFullYear();
    while (m <= 0) { m += 12; a--; }
    mesesArr.push(a + '-' + String(m).padStart(2, '0'));
  }
  const MESES_LBL = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const dados = mesesArr.map(ym => {
    const saidas = lancAtivos.filter(l => l.data && l.data.startsWith(ym)).reduce((s,l) => s + Number(l.total||0), 0);
    const repMes = repassesCef.filter(r => obraAtivaIds.has(r.obra_id) && r.data_credito && r.data_credito.startsWith(ym)).reduce((s,r) => s + Number(r.valor||0), 0);
    const pgtosMes = (typeof adicionaisPgtos !== 'undefined' ? adicionaisPgtos : []).filter(p => p.data && p.data.startsWith(ym)).reduce((s,p) => s + Number(p.valor||0), 0);
    return { ym, entradas: repMes + pgtosMes, saidas };
  });
  const maxVal = Math.max(...dados.map(d => Math.max(d.entradas, d.saidas)), 1);
  const mesAtual = hoje.getFullYear() + '-' + String(hoje.getMonth()+1).padStart(2,'0');

  let html = `<div style="display:flex;gap:16px;margin-bottom:10px;">
    <span style="display:flex;align-items:center;gap:4px;font-size:10px;color:var(--texto3);"><span style="width:10px;height:10px;background:#2ecc71;border-radius:2px;display:inline-block;"></span> Entradas</span>
    <span style="display:flex;align-items:center;gap:4px;font-size:10px;color:var(--texto3);"><span style="width:10px;height:10px;background:#e74c3c;border-radius:2px;display:inline-block;"></span> Saidas</span>
  </div><div style="display:flex;gap:6px;align-items:flex-end;">`;
  dados.forEach(d => {
    const [,m] = d.ym.split('-');
    const hE = Math.max(d.entradas / maxVal * 120, d.entradas > 0 ? 4 : 0);
    const hS = Math.max(d.saidas / maxVal * 120, d.saidas > 0 ? 4 : 0);
    const isAtual = d.ym === mesAtual;
    const saldo = d.entradas - d.saidas;
    const corSaldo = saldo >= 0 ? '#2ecc71' : '#ef4444';
    html += `<div style="flex:1;text-align:center;${isAtual ? 'background:rgba(34,197,94,0.04);border-radius:8px;padding:4px 2px;border:1px solid rgba(34,197,94,0.1);' : ''}">
      <div style="display:flex;gap:2px;justify-content:center;align-items:flex-end;height:120px;">
        <div style="width:40%;height:${hE}px;background:linear-gradient(0deg,#16a085,#2ecc71);border-radius:3px 3px 0 0;" title="Entradas: ${fmtR(d.entradas)}"></div>
        <div style="width:40%;height:${hS}px;background:linear-gradient(0deg,#c0392b,#e74c3c);border-radius:3px 3px 0 0;" title="Saidas: ${fmtR(d.saidas)}"></div>
      </div>
      <div style="font-size:10px;color:${isAtual ? 'var(--verde-hl)' : 'var(--texto3)'};font-weight:${isAtual ? '700' : '400'};margin-top:4px;">${MESES_LBL[parseInt(m)-1]}</div>
      <div style="font-size:9px;color:${corSaldo};font-weight:600;font-family:'JetBrains Mono',monospace;">${saldo >= 0 ? '+' : ''}${fmtR(saldo, true)}</div>
    </div>`;
  });
  html += '</div>';
  el.innerHTML = html;
}

function dashRenderCustoReceita(porObra) {
  const el = document.getElementById('dash-custo-receita');
  if (!el) return;
  const dados = porObra.filter(o => o.vv > 0 || o.custo > 0);
  if (!dados.length) { el.innerHTML = '<div style="color:var(--texto3);font-size:12px;">Nenhuma obra com dados.</div>'; return; }
  const maxVal = Math.max(...dados.map(d => Math.max(d.custo, d.vv + (d.adds?.valorTotal || 0))), 1);
  el.innerHTML = dados.map(o => {
    const receita = o.vv + (o.adds?.valorTotal || 0);
    const pctCusto = o.custo / maxVal * 100;
    const pctReceita = receita / maxVal * 100;
    const corM = o.margem >= 15 ? '#2ecc71' : o.margem >= 0 ? '#f59e0b' : '#ef4444';
    return `<div style="margin-bottom:14px;cursor:pointer;" onclick="setView('custos');setTimeout(()=>custosAbrirDetalhe('${o.id}'),100)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <span style="font-size:12px;color:var(--branco);font-weight:600;">${esc(o.nome)}</span>
        <span style="font-size:11px;font-weight:700;color:${corM};">${receita > 0 ? o.margem.toFixed(0) + '%' : '—'}</span>
      </div>
      <div style="position:relative;height:22px;background:rgba(255,255,255,0.04);border-radius:4px;overflow:hidden;">
        ${receita > 0 ? `<div style="position:absolute;top:0;left:0;height:100%;width:${pctReceita}%;background:rgba(34,197,94,0.1);border-radius:4px;border:1px solid rgba(34,197,94,0.15);"></div>` : ''}
        <div style="position:absolute;top:0;left:0;height:100%;width:${pctCusto}%;background:${o.margem < 0 ? 'rgba(239,68,68,0.5)' : 'rgba(245,158,11,0.5)'};border-radius:4px;"></div>
      </div>
      <div style="display:flex;justify-content:space-between;margin-top:3px;font-size:10px;">
        <span style="color:#f59e0b;">Custo: ${fmt(o.custo)}</span>
        <span style="color:var(--verde-hl);">${receita > 0 ? 'Receita: ' + fmt(receita) : 'Sem valor de venda'}</span>
      </div>
    </div>`;
  }).join('');
}

function dashRenderTopEtapas(etapaEntries) {
  const el = document.getElementById('dash-top-etapas');
  if (!el) return;
  const totalCusto = etapaEntries.reduce((s,[,v]) => s + v, 0);
  const coresEtapa = ['#2ecc71','#3498db','#e67e22','#9b59b6','#e74c3c','#1abc9c','#f39c12','#27ae60'];
  el.innerHTML = etapaEntries.map(([lb, val], i) => {
    const pct = totalCusto > 0 ? (val / totalCusto * 100) : 0;
    return `<div style="margin-bottom:8px;">
      <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:3px;">
        <span style="color:var(--branco);font-weight:600;">${lb}</span>
        <span style="color:var(--texto2);">${fmtR(val)} <span style="color:var(--texto3);">(${pct.toFixed(1)}%)</span></span>
      </div>
      <div style="height:6px;background:rgba(255,255,255,0.06);border-radius:3px;overflow:hidden;">
        <div style="height:100%;width:${pct}%;background:${coresEtapa[i % coresEtapa.length]};border-radius:3px;transition:width .5s;"></div>
      </div>
    </div>`;
  }).join('') || '<div style="color:var(--texto3);font-size:12px;">Sem dados.</div>';
}

// ── RENDER PRINCIPAL ────────────────────────────────────────
function renderDashboard() {
  document.getElementById('dash-loading').classList.add('hidden');
  document.getElementById('dash-content').classList.remove('hidden');

  if (usuarioAtual?.perfil !== 'admin') { renderDashboardOperador(); return; }

  const el = document.getElementById('dash-admin-content');
  if (!el) return;

  // Cálculos
  const m = calcDashMetricas();
  const porObra = calcDashPorObra(m.lancAtivos);
  const alertas = porObra.filter(o => o.vv > 0 && o.margem < 0);
  const etapaEntries = calcDashEtapas(m.lancAtivos);
  const obraMap = {};
  obras.forEach(o => obraMap[o.id] = o.nome);
  const ultimos = [...m.lancAtivos].sort((a,b) => new Date(b.data||0) - new Date(a.data||0)).slice(0, 5);
  const dataStr = new Date().toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'short',year:'numeric'}).toUpperCase();

  // Montar HTML por seções
  el.innerHTML = `
    ${dashBuildHeader(dataStr)}
    ${dashBuildCardReceita(m.receitaTotal, m.valorVendaTotal, m.addGeral)}
    ${dashBuildCardsSecundarios(m, porObra)}
    ${dashBuildAlertas(alertas)}
    ${dashBuildSaudeObras(porObra)}
    <div class="card" style="padding:22px;margin-bottom:16px;">
      <div style="font-size:13px;font-weight:700;color:var(--texto2);letter-spacing:0.5px;margin-bottom:16px;display:flex;align-items:center;gap:8px;"><span style="width:6px;height:6px;border-radius:50%;background:#22c55e;"></span> Fluxo de Caixa — Últimos 6 meses</div>
      <div id="dash-fluxo-caixa"></div>
    </div>
    <div class="card" style="padding:22px;margin-bottom:16px;">
      <div style="font-size:13px;font-weight:700;color:var(--texto2);letter-spacing:0.5px;margin-bottom:16px;display:flex;align-items:center;gap:8px;"><span style="width:6px;height:6px;border-radius:50%;background:#f59e0b;"></span> Custo vs Receita por Obra</div>
      <div id="dash-custo-receita"></div>
    </div>
    <div class="card" style="padding:22px;margin-bottom:16px;">
      <div style="font-size:13px;font-weight:700;color:var(--texto2);letter-spacing:0.5px;margin-bottom:16px;display:flex;align-items:center;gap:8px;"><span style="width:6px;height:6px;border-radius:50%;background:#f59e0b;"></span> Top Centros de Custo</div>
      <div id="dash-top-etapas"></div>
    </div>
    ${ultimos.length ? `<div class="card" style="padding:22px;">
      <div style="font-size:13px;font-weight:700;color:var(--texto2);letter-spacing:0.5px;margin-bottom:16px;display:flex;align-items:center;gap:8px;"><span style="width:6px;height:6px;border-radius:50%;background:#3b82f6;"></span> Últimos Lançamentos</div>
      ${ultimos.map(l => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
          <div>
            <div style="font-size:12px;color:var(--branco);font-weight:600;">${esc(l.descricao)}</div>
            <div style="font-size:10px;color:var(--texto3);margin-top:2px;">${obraMap[l.obra_id]||'—'} · ${l.data||''} ${l.etapa ? '· '+etapaLabel(l.etapa) : ''}</div>
          </div>
          <span style="font-size:12px;font-weight:700;color:#f59e0b;font-family:'JetBrains Mono',monospace;">${fmtR(l.total)}</span>
        </div>`).join('')}
    </div>` : ''}`;

  // Renderizar gráficos
  dashRenderFluxoCaixa(m.lancAtivos, m.obraAtivaIds);
  dashRenderCustoReceita(porObra);
  dashRenderTopEtapas(etapaEntries);
  setTimeout(autoFitStatValues, 50);
}
