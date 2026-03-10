let chartPizza = null, chartBarras = null;

function renderDashboardOperador() {
  const el = document.getElementById('oper-welcome');
  el.classList.remove('hidden');

  // Data e hora
  const now = new Date();
  const dataStr = now.toLocaleDateString('pt-BR', { weekday:'long', day:'2-digit', month:'long' });
  const horaStr = now.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });

  // Obras ativas com contagem de lançamentos
  const obrasAtivas = obras.map(o => {
    const ls = lancamentos.filter(l => l.obra_id === o.id);
    return { ...o, qtd: ls.length };
  }).filter(o => o.qtd > 0).sort((a,b) => b.qtd - a.qtd);

  // Estoque disponível (saldo > 0)
  // Usar consolidarEstoque() — mesma lógica FIFO do módulo Estoque
  const estoqueDisp = consolidarEstoque()
    .filter(m => m.saldoTotal > 0.01)
    .sort((a, b) => b.saldoTotal - a.saldoTotal)
    .slice(0, 8)
    .map(m => [m.desc, { qtd: m.saldoTotal, un: m.unidade }]);

  // Últimos 8 lançamentos
  const obraMap = {};
  obras.forEach(o => obraMap[o.id] = o.nome);
  const ultimos = [...lancamentos]
    .sort((a,b) => new Date(b.data||0) - new Date(a.data||0))
    .slice(0, 8);

  el.innerHTML = `
    <!-- Saudação -->
    <div class="card" style="margin-bottom:12px;padding:18px 20px;">
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <div>
          <div style="font-family:'Rajdhani',sans-serif;font-size:20px;font-weight:700;color:var(--branco);">Olá, ${usuarioAtual.nome}! 👷</div>
          <div style="font-size:11px;color:var(--texto3);margin-top:4px;font-family:'JetBrains Mono',monospace;text-transform:capitalize;">${dataStr} · ${horaStr}</div>
        </div>
        <div style="display:flex;gap:10px;">
          <button onclick="setView('form')" style="background:rgba(46,204,113,0.1);border:1px solid rgba(46,204,113,0.3);color:var(--verde-hl);border-radius:10px;padding:10px 16px;font-family:'Rajdhani',sans-serif;font-weight:700;font-size:12px;letter-spacing:1px;cursor:pointer;transition:all .2s;" onmouseover="this.style.background='rgba(46,204,113,0.18)'" onmouseout="this.style.background='rgba(46,204,113,0.1)'">➕ LANÇAR NF</button>
          <button onclick="setView('estoque')" style="background:rgba(139,92,246,0.1);border:1px solid rgba(139,92,246,0.25);color:#a78bfa;border-radius:10px;padding:10px 16px;font-family:'Rajdhani',sans-serif;font-weight:700;font-size:12px;letter-spacing:1px;cursor:pointer;transition:all .2s;" onmouseover="this.style.background='rgba(139,92,246,0.18)'" onmouseout="this.style.background='rgba(139,92,246,0.1)'">📦 ESTOQUE</button>
        </div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">

      <!-- Obras em andamento -->
      <div class="card" style="padding:16px;">
        <div style="font-family:'Rajdhani',sans-serif;font-size:13px;font-weight:700;color:var(--verde-hl);letter-spacing:2px;margin-bottom:12px;text-transform:uppercase;">🏗 Obras em Andamento</div>
        ${obrasAtivas.length ? obrasAtivas.map(o => `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(46,204,113,0.07);">
            <span style="font-size:13px;color:var(--branco);font-weight:600;">${o.nome}</span>
            <span style="font-size:10px;color:var(--texto3);font-family:'JetBrains Mono',monospace;background:rgba(46,204,113,0.07);padding:2px 8px;border-radius:10px;">${o.qtd} lanç.</span>
          </div>`).join('') :
          '<div style="color:var(--texto3);font-size:12px;padding:8px 0;">Nenhuma obra ativa.</div>'
        }
      </div>

      <!-- Estoque disponível -->
      <div class="card" style="padding:16px;">
        <div style="font-family:'Rajdhani',sans-serif;font-size:13px;font-weight:700;color:#a78bfa;letter-spacing:2px;margin-bottom:12px;text-transform:uppercase;">📦 Estoque Disponível</div>
        ${estoqueDisp.length ? estoqueDisp.map(([nome, v]) => `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(139,92,246,0.07);">
            <span style="font-size:12px;color:var(--texto);font-weight:500;">${nome}</span>
            <span style="font-size:11px;font-weight:700;color:#a78bfa;font-family:'JetBrains Mono',monospace;">${v.qtd % 1 === 0 ? v.qtd : v.qtd.toFixed(2)} ${v.un}</span>
          </div>`).join('') :
          '<div style="color:var(--texto3);font-size:12px;padding:8px 0;">Sem estoque disponível.</div>'
        }
      </div>
    </div>

    <!-- Últimos lançamentos -->
    <div class="card" style="padding:16px;">
      <div style="font-family:'Rajdhani',sans-serif;font-size:13px;font-weight:700;color:#60a5fa;letter-spacing:2px;margin-bottom:12px;text-transform:uppercase;">🕐 Últimos Lançamentos</div>
      ${ultimos.length ? ultimos.map(l => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:9px 0;border-bottom:1px solid rgba(59,130,246,0.07);">
          <div>
            <div style="font-size:13px;color:var(--branco);font-weight:600;">${l.descricao}</div>
            <div style="font-size:10px;color:var(--texto3);margin-top:2px;font-family:'JetBrains Mono',monospace;">${obraMap[l.obra_id]||'—'} · ${l.data||''}</div>
          </div>
          <span style="font-size:10px;color:var(--texto3);background:rgba(59,130,246,0.07);padding:2px 8px;border-radius:10px;font-family:'JetBrains Mono',monospace;white-space:nowrap;">${Number(l.qtd||1) % 1 === 0 ? Number(l.qtd||1) : Number(l.qtd||1).toFixed(2)} ${l.unidade||'UN'}</span>
        </div>`).join('') :
        '<div style="color:var(--texto3);font-size:12px;padding:8px 0;">Nenhum lançamento registrado.</div>'
      }
    </div>`;
}

function renderDashboard() {
  document.getElementById('dash-loading').classList.add('hidden');
  document.getElementById('dash-content').classList.remove('hidden');

  // Operacional — dashboard próprio
  if (usuarioAtual?.perfil !== 'admin') {
    renderDashboardOperador();
    return;
  }

  const el = document.getElementById('dash-admin-content');
  if (!el) return;

  // IDs de obras ATIVAS
  const obraAtivaIds = new Set(obras.map(o => o.id));
  const lancAtivos = lancamentos.filter(l => obraAtivaIds.has(l.obra_id));

  // ── MÉTRICAS GERAIS ──
  const custoTotal = lancAtivos.reduce((s,l) => s + Number(l.total||0), 0);
  const totalPls = repassesCef.filter(r => obraAtivaIds.has(r.obra_id) && (r.tipo||'pls')==='pls').reduce((s,r) => s + Number(r.valor||0), 0);
  const totalEntradas = repassesCef.filter(r => obraAtivaIds.has(r.obra_id) && (r.tipo||'pls')==='entrada').reduce((s,r) => s + Number(r.valor||0), 0);
  const totalTerreno = repassesCef.filter(r => obraAtivaIds.has(r.obra_id) && (r.tipo||'pls')==='terreno').reduce((s,r) => s + Number(r.valor||0), 0);
  const totalRecebido = totalPls + totalEntradas + totalTerreno;
  const valorVendaTotal = obras.reduce((s,o) => s + Number(o.valor_venda||0), 0);
  const lucroGeral = valorVendaTotal - custoTotal;
  const margemGeral = valorVendaTotal > 0 ? (lucroGeral / valorVendaTotal * 100) : 0;
  const corLucro = lucroGeral >= 0 ? 'var(--verde-hl)' : '#ef4444';
  const corMargem = margemGeral >= 15 ? 'var(--verde-hl)' : margemGeral >= 0 ? '#f59e0b' : '#ef4444';

  // ── DADOS POR OBRA ──
  const porObra = obras.map(o => {
    const ls = lancAtivos.filter(l => l.obra_id === o.id);
    const custo = ls.reduce((s,l) => s + Number(l.total||0), 0);
    const vv = Number(o.valor_venda||0);
    const reps = repassesCef.filter(r => r.obra_id === o.id);
    const receb = reps.reduce((s,r) => s + Number(r.valor||0), 0);
    const lucro = vv - custo;
    const margem = vv > 0 ? (lucro/vv*100) : 0;
    return { nome: o.nome, id: o.id, custo, vv, receb, lucro, margem, qtd: ls.length };
  }).filter(o => o.qtd > 0 || o.vv > 0).sort((a,b) => b.custo - a.custo);

  // Alertas — obras com margem negativa
  const alertas = porObra.filter(o => o.vv > 0 && o.margem < 0);

  // ── DADOS POR ETAPA (Centro de Custo) ──
  const etapaMap = {};
  lancAtivos.forEach(l => {
    const lb = etapaLabel(l.etapa || '00_outros');
    etapaMap[lb] = (etapaMap[lb]||0) + Number(l.total||0);
  });
  const etapaEntries = Object.entries(etapaMap).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]).slice(0,8);

  // Últimos 5 lançamentos
  const obraMap = {};
  obras.forEach(o => obraMap[o.id] = o.nome);
  const ultimos = [...lancAtivos].sort((a,b) => new Date(b.data||0) - new Date(a.data||0)).slice(0, 5);

  // Data
  const now = new Date();
  const dataStr = now.toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'short',year:'numeric'}).toUpperCase();

  el.innerHTML = `
    <!-- HEADER -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;padding-top:4px;">
      <div style="display:flex;align-items:center;gap:14px;">
        <div style="width:44px;height:44px;border:1px solid rgba(46,204,113,0.35);border-radius:12px;display:flex;align-items:center;justify-content:center;background:rgba(46,204,113,0.07);box-shadow:0 0 20px rgba(46,204,113,0.12);">
          <span style="font-family:'Rajdhani',sans-serif;font-size:16px;font-weight:700;color:var(--verde3);">EDR</span>
        </div>
        <div>
          <div style="font-family:'Rajdhani',sans-serif;font-size:18px;font-weight:700;color:var(--branco);letter-spacing:2px;">PAINEL DE CONTROLE</div>
          <div style="font-size:10px;color:var(--texto3);letter-spacing:3px;font-family:'JetBrains Mono',monospace;">${dataStr}</div>
        </div>
      </div>
    </div>

    <!-- CARD DESTAQUE — VALOR TOTAL IMÓVEIS -->
    <div class="stat-card" style="border-top-color:rgba(59,130,246,0.6);margin-bottom:10px;text-align:center;padding:16px;">
      <div class="stat-label" style="font-size:10px;">VALOR TOTAL DOS IMÓVEIS</div>
      <div class="stat-value" style="color:#60a5fa;font-size:clamp(20px,4vw,28px);">${valorVendaTotal > 0 ? fmt(valorVendaTotal) : 'Não informado'}</div>
      <div class="stat-sub">${obras.length} imóvel(is) · soma dos valores de venda</div>
    </div>

    <!-- 4 CARDS SECUNDÁRIOS -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin-bottom:14px;">
      <div class="stat-card" style="border-top-color:rgba(245,158,11,0.6);">
        <div class="stat-label">CUSTO TOTAL</div>
        <div class="stat-value" style="color:#f59e0b;">${fmt(custoTotal)}</div>
        <div class="stat-sub">${porObra.length} obra(s) ativa(s)</div>
      </div>
      <div class="stat-card" style="border-top-color:rgba(46,204,113,0.6);">
        <div class="stat-label">TOTAL RECEBIDO</div>
        <div class="stat-value" style="color:var(--verde-hl);">${fmt(totalRecebido)}</div>
        <div class="stat-sub">PLS + Entradas + Terreno</div>
      </div>
      <div class="stat-card" style="border-top-color:${lucroGeral >= 0 ? 'rgba(46,204,113,0.6)' : 'rgba(239,68,68,0.6)'};">
        <div class="stat-label">LUCRO GERAL</div>
        <div class="stat-value" style="color:${corLucro};">${fmt(lucroGeral)}</div>
        <div class="stat-sub">venda - custo</div>
      </div>
      <div class="stat-card" style="border-top-color:${margemGeral >= 15 ? 'rgba(46,204,113,0.6)' : margemGeral >= 0 ? 'rgba(245,158,11,0.6)' : 'rgba(239,68,68,0.6)'};">
        <div class="stat-label">MARGEM GERAL</div>
        <div class="stat-value" style="color:${corMargem};">${valorVendaTotal > 0 ? margemGeral.toFixed(1)+'%' : '-'}</div>
        <div class="stat-sub">${margemGeral >= 15 ? 'saudável' : margemGeral >= 0 ? 'atenção' : 'prejuízo'}</div>
      </div>
    </div>

    <!-- ALERTAS -->
    ${alertas.length ? `
    <div style="background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.2);border-radius:12px;padding:12px 16px;margin-bottom:14px;">
      <div style="font-family:'Rajdhani',sans-serif;font-size:12px;font-weight:700;color:#ef4444;letter-spacing:2px;margin-bottom:8px;">⚠ OBRAS COM MARGEM NEGATIVA</div>
      ${alertas.map(o => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(239,68,68,0.08);">
          <span style="font-size:12px;color:var(--branco);font-weight:600;cursor:pointer;" onclick="setView('custos');setTimeout(()=>custosAbrirDetalhe('${o.id}'),100)">${o.nome}</span>
          <div style="display:flex;gap:12px;align-items:center;">
            <span style="font-size:11px;color:#ef4444;font-weight:700;">${o.margem.toFixed(1)}%</span>
            <span style="font-size:11px;color:var(--texto3);">Prejuízo: ${fmt(Math.abs(o.lucro))}</span>
          </div>
        </div>`).join('')}
    </div>` : ''}

    <!-- OBRAS ATIVAS — mini cards -->
    <div class="card" style="padding:16px;margin-bottom:14px;">
      <div style="font-family:'Rajdhani',sans-serif;font-size:12px;font-weight:700;color:var(--verde-hl);letter-spacing:2px;margin-bottom:12px;">🏗 SAÚDE DAS OBRAS</div>
      ${porObra.map(o => {
        const pctReceb = o.vv > 0 ? Math.min((o.receb/o.vv*100),100) : 0;
        const corM = o.margem >= 15 ? 'var(--verde-hl)' : o.margem >= 0 ? '#f59e0b' : '#ef4444';
        return `
        <div style="padding:10px 0;border-bottom:1px solid rgba(46,204,113,0.06);cursor:pointer;" onclick="setView('custos');setTimeout(()=>custosAbrirDetalhe('${o.id}'),100)">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
            <span style="font-size:13px;color:var(--branco);font-weight:600;">${o.nome}</span>
            <div style="display:flex;gap:14px;align-items:center;">
              <span style="font-size:11px;color:#f59e0b;">Custo: ${fmt(o.custo)}</span>
              ${o.vv > 0 ? `<span style="font-size:11px;font-weight:700;color:${corM};">Margem: ${o.margem.toFixed(1)}%</span>` : '<span style="font-size:10px;color:var(--texto3);">Sem valor de venda</span>'}
            </div>
          </div>
          ${o.vv > 0 ? `<div style="display:flex;align-items:center;gap:8px;">
            <div style="flex:1;height:4px;background:rgba(46,204,113,0.1);border-radius:2px;overflow:hidden;">
              <div style="width:${pctReceb}%;height:100%;background:var(--verde3);border-radius:2px;"></div>
            </div>
            <span style="font-size:9px;color:var(--texto3);min-width:60px;text-align:right;">Receb. ${pctReceb.toFixed(0)}%</span>
          </div>` : ''}
        </div>`;
      }).join('')}
    </div>

    <!-- GRÁFICOS -->
    <div style="display:grid;grid-template-columns:3fr 2fr;gap:12px;margin-bottom:14px;" id="dash-graficos">
      <div class="card" style="padding:18px 16px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
          <div class="section-title" style="font-size:12px;color:var(--texto2);">CUSTO POR OBRA</div>
          <div style="font-size:9px;color:var(--texto3);font-family:'JetBrains Mono',monospace;">duplo clique → abre obra</div>
        </div>
        <canvas id="chart-barras" height="170"></canvas>
      </div>
      <div class="card" style="padding:18px 16px;">
        <div class="section-title" style="margin-bottom:14px;font-size:12px;color:var(--texto2);">CUSTO POR CENTRO DE CUSTO</div>
        <canvas id="chart-pizza" height="170"></canvas>
      </div>
    </div>

    <!-- ÚLTIMOS LANÇAMENTOS -->
    ${ultimos.length ? `
    <div class="card" style="padding:16px;">
      <div style="font-family:'Rajdhani',sans-serif;font-size:12px;font-weight:700;color:#60a5fa;letter-spacing:2px;margin-bottom:10px;">🕐 ÚLTIMOS LANÇAMENTOS</div>
      ${ultimos.map(l => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:7px 0;border-bottom:1px solid rgba(59,130,246,0.06);">
          <div>
            <div style="font-size:12px;color:var(--branco);font-weight:600;">${l.descricao}</div>
            <div style="font-size:10px;color:var(--texto3);margin-top:1px;">${obraMap[l.obra_id]||'—'} · ${l.data||''} ${l.etapa ? '· '+etapaLabel(l.etapa) : ''}</div>
          </div>
          <span style="font-size:12px;font-weight:700;color:#f59e0b;font-family:'JetBrains Mono',monospace;">${fmtR(l.total)}</span>
        </div>`).join('')}
    </div>` : ''}
  `;

  // ── GRÁFICOS ──
  function renderCharts() {
    const coresPizza = [
      'rgba(46,204,113,0.75)','rgba(100,116,139,0.7)','rgba(59,130,246,0.7)',
      'rgba(245,158,11,0.7)','rgba(139,92,246,0.7)','rgba(6,182,212,0.65)',
      'rgba(239,68,68,0.65)','rgba(156,163,175,0.55)',
    ];
    const maxIdx = porObra.length ? porObra.indexOf(porObra.reduce((a,b)=>a.custo>b.custo?a:b, porObra[0])) : -1;
    const coresBarra = porObra.map((_,i) => i === maxIdx ? 'rgba(46,204,113,0.75)' : 'rgba(100,116,139,0.45)');

    Chart.defaults.color = '#6a8a6a';
    Chart.defaults.font.family = "'Barlow', sans-serif";

    const ctxB = document.getElementById('chart-barras')?.getContext('2d');
    if (ctxB) {
      if (chartBarras) chartBarras.destroy();
      chartBarras = new Chart(ctxB, {
        type: 'bar',
        data: {
          labels: porObra.map(o => o.nome.length > 16 ? o.nome.substring(0,14)+'…' : o.nome),
          datasets: [{ data: porObra.map(o=>o.custo), backgroundColor: coresBarra, borderRadius: 8, borderWidth: 0,
            hoverBackgroundColor: porObra.map((_,i) => i === maxIdx ? 'rgba(74,222,128,0.85)' : 'rgba(148,163,184,0.6)') }]
        },
        options: {
          plugins: { legend: { display: false },
            tooltip: { callbacks: { label: ctx => '  ' + fmt(ctx.raw), footer: () => '  Duplo clique para abrir a obra' },
              backgroundColor: 'rgba(6,12,6,0.9)', borderColor: 'rgba(46,204,113,0.3)', borderWidth: 1, titleColor: '#ddeadd', bodyColor: '#9ab89a', footerColor: '#6a8a6a', footerFont: { size: 9 }, padding: 10 }
          },
          scales: {
            x: { ticks: { color: '#6a8a6a', font: { size: 10 } }, grid: { display: false }, border: { color: 'rgba(46,204,113,0.1)' } },
            y: { ticks: { color: '#6a8a6a', font: { size: 10 }, callback: v => v>=1000?(v/1000).toFixed(0)+'k':''+v }, grid: { color: 'rgba(46,204,113,0.05)' }, border: { display: false } }
          },
          onClick: (evt, elements) => {
            if (!elements.length) return;
            const idx = elements[0].index;
            const obra = porObra[idx];
            if (!obra) return;
            const nowTs = Date.now();
            if (chartBarras._lastClick && (nowTs - chartBarras._lastClick) < 400 && chartBarras._lastClickIdx === idx) {
              setView('custos');
              setTimeout(() => custosAbrirDetalhe(obra.id), 100);
              chartBarras._lastClick = 0;
            } else {
              chartBarras._lastClick = nowTs;
              chartBarras._lastClickIdx = idx;
            }
          }
        }
      });
    }

    const ctxP = document.getElementById('chart-pizza')?.getContext('2d');
    if (ctxP) {
      if (chartPizza) chartPizza.destroy();
      chartPizza = new Chart(ctxP, {
        type: 'doughnut',
        data: {
          labels: etapaEntries.map(([k])=>k),
          datasets: [{ data: etapaEntries.map(([,v])=>v), backgroundColor: coresPizza, borderWidth: 0, hoverOffset: 6 }]
        },
        options: {
          plugins: {
            legend: { position: 'bottom', labels: { color: '#6a8a6a', font: { size: 10 }, boxWidth: 10, padding: 7 } },
            tooltip: { callbacks: { label: ctx => '  ' + fmt(ctx.raw) }, backgroundColor: 'rgba(6,12,6,0.9)', borderColor: 'rgba(46,204,113,0.3)', borderWidth: 1, titleColor: '#ddeadd', bodyColor: '#9ab89a', padding: 10 }
          },
          cutout: '60%'
        }
      });
    }
  }

  if (typeof Chart === 'undefined') {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js';
    s.onload = renderCharts;
    document.head.appendChild(s);
  } else {
    renderCharts();
  }
  setTimeout(autoFitStatValues, 50);
}
