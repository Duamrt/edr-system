const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const MESES_FULL = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const CAT_CORES = {
  alimentacao:'#e67e22',alvenaria:'#95a5a6',cobertura:'#e74c3c',combustivel:'#f39c12',
  doc:'#9b59b6',eletrica:'#f1c40f',epi:'#1abc9c',esgoto:'#7f8c8d',esquadria:'#3498db',
  expediente:'#bdc3c7',ferro:'#7f8c8d',ferramenta:'#e67e22',forma:'#8e44ad',
  gesso:'#ecf0f1',granito:'#95a5a6',hidraulica:'#2980b9',impermeab:'#16a085',
  limpeza:'#27ae60',locacao:'#d35400',loucas:'#2ecc71',mao:'#e74c3c',
  pintura:'#f39c12',rev_cer:'#c0392b',terreno:'#6d4c41',generico:'#7f8c8d',outros:'#546e7a'
};

function getCatLabel(key) {
  const CATS_OPTS = [
    ['alimentacao','🍽 Alimentação'],['alvenaria','🧱 Alvenaria'],['cobertura','🏠 Cobertura'],
    ['combustivel','⛽ Combustível'],['doc','📋 Documentação'],['eletrica','⚡ Elétrica'],
    ['epi','🦺 EPI / Segurança'],['esgoto','🪠 Esgoto'],['esquadria','🪟 Esquadrias'],
    ['expediente','📎 Expediente'],['ferro','⚙ Aço / Ferro'],['aco','⚙ Aço / Ferro'],['ferramenta','🔨 Ferramentas'],
    ['forma','🪵 Forma e Madeira'],['gesso','⬜ Gesso'],['granito','🪨 Granito / Pedra'],
    ['hidraulica','🚿 Hidráulica'],['impermeab','💧 Impermeabilização'],['limpeza','🧹 Limpeza'],
    ['locacao','🏗 Locação de Equip.'],['loucas','🛁 Louças e Metais'],['mao','👷 Mão de Obra'],
    ['imposto','🧾 Impostos / Encargos'],
    ['imobilizado','🖥 Imobilizado'],['pintura','🖌 Pintura'],['rev_cer','🟫 Revest. Cerâmico'],['rev_arg','🟤 Revest. Argamassa'],
    ['terreno','🏡 Terreno'],['generico','❓ Genérico'],['outros','📦 Outros'],
    ['01_terreno','🏛 01 · Terreno'],['02_doc','📋 02 · Documentação'],
    ['03_prelim','⛏ 03 · Serv. Preliminares'],['04_terra','🌍 04 · Mov. de Terra'],
    ['05_fund','🏗 05 · Fundação'],['06_estrut','🔩 06 · Estrutura'],
    ['07_alven','🧱 07 · Alvenaria'],['08_cobr','🏠 08 · Cobertura'],
    ['09_elet','⚡ 09 · Elétrica'],['10_hidro','🚿 10 · Hidráulica'],
    ['11_esquad','🪟 11 · Esquadrias'],['12_revestc','🟫 12 · Rev. Cerâmico'],
    ['13_pintura','🖌 13 · Pintura'],['14_acab','✨ 14 · Acabamento'],
    ['15_locacao','🏗 15 · Locação / Equip.'],['16_externo','🌿 16 · Área Externa'],
    ['17_limpeza','🧹 17 · Limpeza Final'],
    ['00_outros','📦 Não classificado']
  ];
  const found = CATS_OPTS.find(([k]) => k === key);
  return found ? found[1] : '📦 ' + (key||'Outros');
}

function getCatFromLanc(l) {
  if (l.etapa && l.etapa !== '00_outros') return l.etapa;
  const descLimpa = (l.descricao||'').replace(/^\d{6}\s*·\s*/, '').trim();
  const dn = descLimpa.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const mat = catalogoMateriais.find(m => {
    const mn = norm(m.nome);
    return mn === norm(l.descricao||'') || mn === norm(descLimpa) || mn.includes(dn) || dn.includes(mn.split(' ')[0]);
  });
  if (mat && mat.categoria) return mat.categoria;
  const desc = descLimpa || l.descricao || "";
  const dnn = desc.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  const catEstoque = getCatEstoque(desc);
  if (catEstoque && catEstoque !== "outros") return catEstoque;
  if (/mao[\s\-]de[\s\-]obra|armador|eletricista|pintor|pedreiro|servente|mestre de obras|encanador|azulejista/.test(dnn)) return "mao";
  if (/aquisicao de terreno|compra de terreno/.test(dnn)) return "terreno";
  if (/contrato|documento|anotacao|alvara|licenca|vistoria|escritura/.test(dnn)) return "doc";
  return "outros";
}

function verCategoriaEmObras(cat) {
  const relObraId = document.getElementById('rel-obra')?.value || '';
  catFiltroAtual = cat;
  setView('obras');
  const selObra = document.getElementById('filtro-obra-lanc') || document.getElementById('sel-obra-lanc');
  if (selObra && relObraId) selObra.value = relObraId;
  if (relObraId) {
    const selObraLanc = document.getElementById('obras-filtro-obra');
    if (selObraLanc) { selObraLanc.value = relObraId; onChangeObraFiltro(); }
  }
  const sel = document.getElementById('filtro-cat');
  if (sel) sel.value = cat;
  filtrarLanc();
  document.querySelectorAll('.cat-chip').forEach(el => {
    const k = el.getAttribute('onclick')?.match(/toggleCat\('(.+?)'\)/)?.[1];
    if (k) el.classList.toggle('ativo', k === cat);
  });
  const obraNome = relObraId ? (obras.find(o=>o.id===relObraId)?.nome || '') : '';
  showToast(`📂 ${obraNome ? obraNome+' · ' : ''}${getCatLabel(cat)}`);
}

function fmtR(v, abrev = false) {
  const n = Number(v) || 0;
  if (abrev && Math.abs(n) >= 1000) return 'R$ ' + (n/1000).toFixed(1) + 'k';
  return n.toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
}

// ============================================================
// PAINEL FINANCEIRO — F9 RELATÓRIO
// ============================================================

let relMesAtual = ''; // formato "YYYY-MM"

function initRelatorio() {
  // Definir mês atual como padrão
  const hoje = new Date();
  relMesAtual = hoje.getFullYear() + '-' + String(hoje.getMonth()+1).padStart(2,'0');

  // Preencher select de meses disponíveis
  const selMes = document.getElementById('rel-mes');
  if (selMes) {
    const mesesDisp = new Set();
    lancamentos.forEach(l => { if (l.data) mesesDisp.add(l.data.substring(0,7)); });
    (typeof repassesCef !== 'undefined' ? repassesCef : []).forEach(r => { if (r.data_credito) mesesDisp.add(r.data_credito.substring(0,7)); });
    adicionaisPgtos.forEach(p => { if (p.data) mesesDisp.add(p.data.substring(0,7)); });
    mesesDisp.add(relMesAtual);
    const arr = [...mesesDisp].sort().reverse();
    selMes.innerHTML = arr.map(ym => {
      const [a, m] = ym.split('-');
      return `<option value="${ym}" ${ym===relMesAtual?'selected':''}>${MESES[parseInt(m)-1]} ${a}</option>`;
    }).join('');
  }

  renderRelatorio();
}

function onChangeMesRel() {
  relMesAtual = document.getElementById('rel-mes')?.value || relMesAtual;
  renderRelatorio();
}

function renderRelatorio() {
  const el = document.getElementById('rel-content');
  if (!el) return;

  const secao = document.getElementById('rel-secao')?.value || 'financeiro';

  let html = '';
  if (secao === 'financeiro') {
    html = buildPainelFinanceiro();
  } else if (secao === 'categoria') {
    const ls = getLancMes(relMesAtual);
    html = ls.length ? buildSecaoCategoria(ls) : msgVazio();
  } else if (secao === 'comparativo') {
    html = buildSecaoComparativo();
  } else if (secao === 'faltas') {
    html = buildSecaoFaltas();
  }
  el.innerHTML = html;
}

function getLancMes(ym) {
  return lancamentos.filter(l => l.data && l.data.startsWith(ym));
}

function getRepassesMes(ym) {
  return (typeof repassesCef !== 'undefined' ? repassesCef : []).filter(r => r.data_credito && r.data_credito.startsWith(ym));
}

function msgVazio() {
  return `<div style="text-align:center;padding:60px 20px;color:var(--texto3);font-size:13px;">
    Nenhum lançamento encontrado para o período selecionado.</div>`;
}

// ── PAINEL FINANCEIRO (visão principal) ──────────────────────
function buildPainelFinanceiro() {
  const [anoStr, mesStr] = relMesAtual.split('-');
  const mesLabel = MESES_FULL[parseInt(mesStr)-1] + ' ' + anoStr;

  // SAÍDAS do mês (lançamentos)
  const lancMes = getLancMes(relMesAtual);
  const totalSaidas = lancMes.reduce((s,l) => s + Number(l.total||0), 0);

  // Mão de obra do mês
  const maoObraMes = lancMes.filter(l => getCatFromLanc(l) === 'mao').reduce((s,l) => s + Number(l.total||0), 0);

  // ENTRADAS do mês: pagamentos de adicionais recebidos no mês
  const pgtosMes = adicionaisPgtos.filter(p => p.data && p.data.startsWith(relMesAtual));
  const totalPgtosAdic = pgtosMes.reduce((s,p) => s + Number(p.valor||0), 0);

  // Entradas: repasses CEF no mês (PLs, entrada, terreno)
  const repassesMes = getRepassesMes(relMesAtual);
  const totalRepasses = repassesMes.reduce((s,r) => s + Number(r.valor||0), 0);
  // Detalhe dos tipos de repasse
  const plsMes = repassesMes.filter(r => (r.tipo||'pls') === 'pls').reduce((s,r) => s + Number(r.valor||0), 0);
  const entradaMes = repassesMes.filter(r => r.tipo === 'entrada').reduce((s,r) => s + Number(r.valor||0), 0);
  const terrenoMes = repassesMes.filter(r => r.tipo === 'terreno').reduce((s,r) => s + Number(r.valor||0), 0);

  const totalEntradas = totalPgtosAdic + totalRepasses;
  const saldo = totalEntradas - totalSaidas;
  const corSaldo = saldo >= 0 ? '#2ecc71' : '#ef4444';

  // Montar subtítulo das entradas
  const subParts = [];
  if (plsMes > 0) subParts.push(`PLs: ${fmtR(plsMes)}`);
  if (entradaMes > 0) subParts.push(`Entrada: ${fmtR(entradaMes)}`);
  if (terrenoMes > 0) subParts.push(`Terreno: ${fmtR(terrenoMes)}`);
  if (totalPgtosAdic > 0) subParts.push(`Extras: ${fmtR(totalPgtosAdic)}`);
  const subEntradas = subParts.length ? subParts.join(' · ') : 'Nenhuma entrada no mês';

  // ── CARDS RESUMO ──
  let html = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:20px;">
    ${cardResumo('💰', 'ENTRADAS', totalEntradas, '#2ecc71', subEntradas)}
    ${cardResumo('📤', 'SAÍDAS', totalSaidas, '#ef4444', `${lancMes.length} lançamentos`)}
    ${cardResumo('📊', 'SALDO', saldo, corSaldo, saldo >= 0 ? 'Positivo' : 'Negativo')}
    ${cardResumo('👷', 'MÃO DE OBRA', maoObraMes, '#f39c12', totalSaidas > 0 ? (maoObraMes/totalSaidas*100).toFixed(0)+'% do total' : '—')}
  </div>`;

  // ── GRÁFICO ENTRADAS vs SAÍDAS (últimos 6 meses) ──
  html += buildGraficoMensal();

  // ── DETALHAMENTO POR OBRA ──
  html += buildDetalheObras(relMesAtual);

  return html;
}

function cardResumo(icone, titulo, valor, cor, sub) {
  return `<div style="background:var(--bg2);border:1px solid var(--borda2);border-radius:12px;padding:16px;position:relative;overflow:hidden;">
    <div style="position:absolute;top:12px;right:14px;font-size:22px;opacity:0.3;">${icone}</div>
    <div style="font-size:10px;color:var(--texto3);font-weight:700;letter-spacing:1.5px;margin-bottom:8px;">${titulo}</div>
    <div style="font-size:22px;font-weight:800;color:${cor};font-family:'Rajdhani',sans-serif;line-height:1;">${fmtR(valor)}</div>
    <div style="font-size:10px;color:var(--texto4);margin-top:6px;">${sub}</div>
  </div>`;
}

// ── GRÁFICO DE BARRAS: Entradas vs Saídas por mês ──────────
function buildGraficoMensal() {
  // Últimos 6 meses a partir do mês selecionado
  const [anoBase, mesBase] = relMesAtual.split('-').map(Number);
  const mesesArr = [];
  for (let i = 5; i >= 0; i--) {
    let m = mesBase - i;
    let a = anoBase;
    while (m <= 0) { m += 12; a--; }
    mesesArr.push(a + '-' + String(m).padStart(2,'0'));
  }

  const dados = mesesArr.map(ym => {
    const lanc = getLancMes(ym);
    const saidas = lanc.reduce((s,l) => s + Number(l.total||0), 0);
    const pgtos = adicionaisPgtos.filter(p => p.data && p.data.startsWith(ym));
    const entAdic = pgtos.reduce((s,p) => s + Number(p.valor||0), 0);
    const rep = getRepassesMes(ym);
    const entRep = rep.reduce((s,r) => s + Number(r.valor||0), 0);
    return { ym, entradas: entAdic + entRep, saidas };
  });

  const maxVal = Math.max(...dados.map(d => Math.max(d.entradas, d.saidas)), 1);

  const colunas = dados.map(d => {
    const [a, m] = d.ym.split('-');
    const hEnt = Math.max((d.entradas / maxVal * 100), d.entradas > 0 ? 4 : 0);
    const hSai = Math.max((d.saidas / maxVal * 100), d.saidas > 0 ? 4 : 0);
    const isAtual = d.ym === relMesAtual;
    const bordaAtual = isAtual ? 'border:2px solid rgba(46,204,113,0.5);border-radius:10px;padding:4px;' : '';
    return `<div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex:1;min-width:55px;${bordaAtual}">
      <div style="display:flex;gap:3px;align-items:flex-end;height:90px;width:100%;">
        <div style="flex:1;display:flex;align-items:flex-end;height:100%;">
          <div style="width:100%;height:${hEnt}%;background:linear-gradient(0deg,#16a085,#2ecc71);border-radius:4px 4px 0 0;transition:height .5s;min-height:${d.entradas>0?'4px':'0'};" title="Entradas: ${fmtR(d.entradas)}"></div>
        </div>
        <div style="flex:1;display:flex;align-items:flex-end;height:100%;">
          <div style="width:100%;height:${hSai}%;background:linear-gradient(0deg,#c0392b,#e74c3c);border-radius:4px 4px 0 0;transition:height .5s;min-height:${d.saidas>0?'4px':'0'};" title="Saídas: ${fmtR(d.saidas)}"></div>
        </div>
      </div>
      <div style="font-size:10px;color:${isAtual?'var(--verde-hl)':'var(--texto3)'};font-weight:${isAtual?'700':'400'};text-align:center;">${MESES[parseInt(m)-1]}</div>
    </div>`;
  }).join('');

  return `<div class="rel-card" style="margin-bottom:16px;">
    <div class="rel-card-title">📊 ENTRADAS vs SAÍDAS — últimos 6 meses</div>
    <div style="display:flex;gap:4px;align-items:center;margin-bottom:12px;">
      <span style="display:inline-block;width:12px;height:12px;background:#2ecc71;border-radius:3px;"></span>
      <span style="font-size:10px;color:var(--texto3);margin-right:12px;">Entradas</span>
      <span style="display:inline-block;width:12px;height:12px;background:#e74c3c;border-radius:3px;"></span>
      <span style="font-size:10px;color:var(--texto3);">Saídas</span>
    </div>
    <div style="display:flex;gap:8px;align-items:flex-end;overflow-x:auto;padding-bottom:4px;">
      ${colunas}
    </div>
  </div>`;
}

// ── DETALHAMENTO POR OBRA ────────────────────────────────────
function buildDetalheObras(ym) {
  const obrasAtivas = obras.filter(o => !o.arquivada);
  if (!obrasAtivas.length) return '';

  const dados = obrasAtivas.map(o => {
    // Saídas do mês nessa obra
    const lancObra = lancamentos.filter(l => l.obra_id === o.id && l.data && l.data.startsWith(ym));
    const saidas = lancObra.reduce((s,l) => s + Number(l.total||0), 0);
    // Mão de obra do mês nessa obra
    const mao = lancObra.filter(l => getCatFromLanc(l) === 'mao').reduce((s,l) => s + Number(l.total||0), 0);
    // Entradas do mês: repasses CEF dessa obra + pagamentos de adicionais
    const repObra = getRepassesMes(ym).filter(r => r.obra_id === o.id);
    const entRepasses = repObra.reduce((s,r) => s + Number(r.valor||0), 0);
    const addsObra = obrasAdicionais.filter(a => a.obra_id === o.id);
    const addIds = new Set(addsObra.map(a => a.id));
    const pgtos = adicionaisPgtos.filter(p => addIds.has(p.adicional_id) && p.data && p.data.startsWith(ym));
    const entAdic = pgtos.reduce((s,p) => s + Number(p.valor||0), 0);
    const entradas = entRepasses + entAdic;
    // Totais gerais da obra (acumulado)
    const totalGasto = lancamentos.filter(l => l.obra_id === o.id).reduce((s,l) => s + Number(l.total||0), 0);
    const valorVenda = Number(o.valor_venda||0);
    const addsTotais = getAdicionaisObra(o.id);
    const receitaTotal = valorVenda + addsTotais.valorTotal;
    return { nome: o.nome, id: o.id, entradas, saidas, mao, totalGasto, receitaTotal, valorVenda };
  }).filter(d => d.saidas > 0 || d.entradas > 0 || d.totalGasto > 0);

  if (!dados.length) return '';

  const maxSaida = Math.max(...dados.map(d => d.saidas), 1);

  const linhas = dados.map(d => {
    const saldo = d.entradas - d.saidas;
    const corSaldo = saldo >= 0 ? '#2ecc71' : '#ef4444';
    const pctSaida = d.saidas / maxSaida * 100;
    const pctMao = d.saidas > 0 ? (d.mao / d.saidas * 100) : 0;
    // Progresso geral: quanto já gastou do total da receita
    const pctGasto = d.receitaTotal > 0 ? (d.totalGasto / d.receitaTotal * 100) : 0;
    const corPctGasto = pctGasto > 90 ? '#ef4444' : pctGasto > 70 ? '#f39c12' : '#2ecc71';

    return `<div style="background:var(--bg2);border:1px solid var(--borda2);border-radius:10px;padding:14px;margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <div style="font-size:12px;font-weight:700;color:var(--branco);max-width:55%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${d.nome}</div>
        <div style="font-size:10px;color:var(--texto4);">
          ${d.receitaTotal > 0 ? `<span style="color:${corPctGasto};font-weight:700;">${pctGasto.toFixed(0)}%</span> consumido` : ''}
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px;margin-bottom:10px;">
        <div>
          <div style="font-size:9px;color:var(--texto4);margin-bottom:2px;">ENTRADAS</div>
          <div style="font-size:13px;font-weight:700;color:#2ecc71;">${fmtR(d.entradas, true)}</div>
        </div>
        <div>
          <div style="font-size:9px;color:var(--texto4);margin-bottom:2px;">SAÍDAS</div>
          <div style="font-size:13px;font-weight:700;color:#e74c3c;">${fmtR(d.saidas, true)}</div>
        </div>
        <div>
          <div style="font-size:9px;color:var(--texto4);margin-bottom:2px;">MÃO DE OBRA</div>
          <div style="font-size:13px;font-weight:700;color:#f39c12;">${fmtR(d.mao, true)}</div>
        </div>
        <div>
          <div style="font-size:9px;color:var(--texto4);margin-bottom:2px;">SALDO MÊS</div>
          <div style="font-size:13px;font-weight:700;color:${corSaldo};">${fmtR(saldo, true)}</div>
        </div>
      </div>
      <div style="display:flex;gap:4px;align-items:center;">
        <div style="flex:1;height:6px;background:rgba(255,255,255,0.06);border-radius:3px;overflow:hidden;">
          <div style="height:100%;width:${pctSaida}%;background:linear-gradient(90deg,#e74c3c,#c0392b);border-radius:3px;transition:width .5s;"></div>
        </div>
        ${d.mao > 0 ? `<span style="font-size:9px;color:#f39c12;white-space:nowrap;">👷 ${pctMao.toFixed(0)}%</span>` : ''}
      </div>
    </div>`;
  }).join('');

  const [, ms] = ym.split('-');
  return `<div class="rel-card" style="margin-bottom:16px;">
    <div class="rel-card-title">🏗 DETALHAMENTO POR OBRA — ${MESES_FULL[parseInt(ms)-1]}</div>
    ${linhas}
  </div>`;
}

// ── SEÇÕES ANTIGAS (mantidas) ────────────────────────────────
function buildSecaoCategoria(ls) {
  const map = {};
  ls.forEach(l => {
    const cat = getCatFromLanc(l);
    if (!map[cat]) map[cat] = 0;
    map[cat] += Number(l.total || 0);
  });
  const total = Object.values(map).reduce((s,v) => s+v, 0);
  const itens = Object.entries(map).sort((a,b) => b[1]-a[1]);

  const barras = itens.map(([cat, val]) => {
    const pct = total > 0 ? (val/total*100).toFixed(1) : 0;
    const cor = CAT_CORES[cat] || '#7f8c8d';
    const lb  = getCatLabel(cat);
    return `<div style="margin-bottom:10px;cursor:pointer;" onclick="verCategoriaEmObras('${cat}')" title="Ver lançamentos de ${lb}">
      <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:4px;">
        <span style="color:var(--branco);font-weight:600;">${lb} <span style="color:var(--texto3);font-size:10px;">↗</span></span>
        <span style="color:var(--texto2);">${fmtR(val)} <span style="color:var(--texto3);">(${pct}%)</span></span>
      </div>
      <div style="height:8px;background:rgba(255,255,255,0.07);border-radius:4px;overflow:hidden;">
        <div style="height:100%;width:${pct}%;background:${cor};border-radius:4px;transition:width .5s;"></div>
      </div>
    </div>`;
  }).join('');

  return `<div class="rel-card">
    <div class="rel-card-title">🏷 CUSTO POR CENTRO DE CUSTO</div>
    <div style="margin-bottom:16px;">
      <span style="font-size:24px;font-weight:700;color:var(--verde-hl);">${fmtR(total)}</span>
      <span style="font-size:11px;color:var(--texto3);margin-left:8px;">total lançado</span>
    </div>
    ${barras}
  </div>`;
}

function buildSecaoComparativo() {
  if (obras.length < 2) return '';
  const dados = obras.map(o => {
    const total = lancamentos.filter(l => l.obra_id === o.id).reduce((s,l) => s+Number(l.total||0), 0);
    return { nome: o.nome, total };
  }).filter(d => d.total > 0).sort((a,b) => b.total - a.total);

  if (!dados.length) return '';
  const maxVal = dados[0].total;
  const cores = ['#2ecc71','#3498db','#e67e22','#9b59b6','#e74c3c','#1abc9c','#f39c12','#27ae60'];

  const linhas = dados.map((d, i) => {
    const pct = maxVal > 0 ? (d.total/maxVal*100).toFixed(1) : 0;
    const cor = cores[i % cores.length];
    return `<div style="margin-bottom:12px;">
      <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:4px;">
        <span style="color:var(--branco);font-weight:600;max-width:60%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${d.nome}</span>
        <span style="color:var(--texto2);">${fmtR(d.total)}</span>
      </div>
      <div style="height:10px;background:rgba(255,255,255,0.07);border-radius:5px;overflow:hidden;">
        <div style="height:100%;width:${pct}%;background:${cor};border-radius:5px;transition:width .5s;"></div>
      </div>
    </div>`;
  }).join('');

  return `<div class="rel-card">
    <div class="rel-card-title">⚖ COMPARATIVO ENTRE OBRAS</div>
    ${linhas}
  </div>`;
}

// ── EXPORTAR PDF ─────────────────────────────────────────────
async function exportarRelatorioPDF() {
  const [anoStr, mesStr] = relMesAtual.split('-');
  const mesLabel = MESES_FULL[parseInt(mesStr)-1] + ' ' + anoStr;
  const lancMes = getLancMes(relMesAtual);
  const totalSaidas = lancMes.reduce((s,l) => s + Number(l.total||0), 0);
  const maoTotal = lancMes.filter(l => getCatFromLanc(l) === 'mao').reduce((s,l) => s + Number(l.total||0), 0);

  // Entradas
  const pgtosMes = adicionaisPgtos.filter(p => p.data && p.data.startsWith(relMesAtual));
  const totalPgtosAdic = pgtosMes.reduce((s,p) => s + Number(p.valor||0), 0);
  const repassesMes = getRepassesMes(relMesAtual);
  const totalRepasses = repassesMes.reduce((s,r) => s + Number(r.valor||0), 0);
  const totalEntradas = totalPgtosAdic + totalRepasses;
  const saldo = totalEntradas - totalSaidas;

  // Por categoria
  const mapCat = {};
  lancMes.forEach(l => {
    const cat = getCatFromLanc(l);
    if (!mapCat[cat]) mapCat[cat] = 0;
    mapCat[cat] += Number(l.total || 0);
  });
  const catItens = Object.entries(mapCat).sort((a,b)=>b[1]-a[1]);

  const linhasCat = catItens.map(([cat, val]) => {
    const pct = totalSaidas > 0 ? (val/totalSaidas*100).toFixed(1) : '0.0';
    return `<tr><td>${getCatLabel(cat)}</td><td class="r">${fmtR(val)}</td><td class="r">${pct}%</td></tr>`;
  }).join('');

  // Por obra
  const obrasAtivas = obras.filter(o => !o.arquivada);
  const linhasObra = obrasAtivas.map(o => {
    const lancObra = lancMes.filter(l => l.obra_id === o.id);
    const sai = lancObra.reduce((s,l) => s + Number(l.total||0), 0);
    const mao = lancObra.filter(l => getCatFromLanc(l) === 'mao').reduce((s,l) => s + Number(l.total||0), 0);
    const repObra = repassesMes.filter(r => r.obra_id === o.id).reduce((s,r) => s + Number(r.valor||0), 0);
    const addsObra = obrasAdicionais.filter(a => a.obra_id === o.id);
    const addIds = new Set(addsObra.map(a => a.id));
    const entAdic = adicionaisPgtos.filter(p => addIds.has(p.adicional_id) && p.data && p.data.startsWith(relMesAtual)).reduce((s,p) => s + Number(p.valor||0), 0);
    const ent = repObra + entAdic;
    if (!sai && !ent) return '';
    return `<tr><td>${o.nome}</td><td class="r">${fmtR(ent)}</td><td class="r">${fmtR(sai)}</td><td class="r">${fmtR(mao)}</td><td class="r" style="color:${(ent-sai)>=0?'#16a085':'#c0392b'};font-weight:700;">${fmtR(ent-sai)}</td></tr>`;
  }).filter(Boolean).join('');

  const dataHoje = new Date().toLocaleDateString('pt-BR');

  const htmlPDF = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<style>
  body{font-family:Arial,sans-serif;color:#111;background:#fff;padding:24px;font-size:12px;}
  h1{font-size:18px;margin:0 0 4px 0;color:#1a1a1a;}
  .sub{font-size:11px;color:#555;margin-bottom:20px;}
  .resumo{display:flex;gap:20px;margin-bottom:24px;}
  .resumo-card{border:1px solid #ddd;border-radius:8px;padding:12px 16px;flex:1;text-align:center;}
  .resumo-card .label{font-size:10px;color:#888;text-transform:uppercase;letter-spacing:1px;}
  .resumo-card .valor{font-size:18px;font-weight:700;margin-top:4px;}
  .section{margin-bottom:24px;}
  .section-title{font-size:13px;font-weight:700;color:#1a1a1a;border-bottom:2px solid #2ecc71;padding-bottom:4px;margin-bottom:10px;}
  table{width:100%;border-collapse:collapse;}
  th{background:#f0f0f0;padding:7px 10px;text-align:left;font-size:11px;font-weight:700;}
  td{padding:6px 10px;font-size:11px;}
  .r{text-align:right;}
  tr:nth-child(even){background:#f9f9f9;}
  .total-row td{font-weight:700;border-top:2px solid #2ecc71;background:#f0fff4;}
  .footer{margin-top:30px;font-size:10px;color:#aaa;text-align:center;border-top:1px solid #eee;padding-top:10px;}
</style></head><body>
<h1>RELATÓRIO FINANCEIRO MENSAL — EDR ENGENHARIA</h1>
<div class="sub">Período: <b>${mesLabel}</b> · Emitido em ${dataHoje}</div>

<div class="resumo">
  <div class="resumo-card"><div class="label">Entradas</div><div class="valor" style="color:#16a085;">${fmtR(totalEntradas)}</div></div>
  <div class="resumo-card"><div class="label">Saídas</div><div class="valor" style="color:#c0392b;">${fmtR(totalSaidas)}</div></div>
  <div class="resumo-card"><div class="label">Saldo</div><div class="valor" style="color:${saldo>=0?'#16a085':'#c0392b'};">${fmtR(saldo)}</div></div>
  <div class="resumo-card"><div class="label">Mão de Obra</div><div class="valor" style="color:#e67e22;">${fmtR(maoTotal)}</div></div>
</div>

<div class="section">
  <div class="section-title">SAÍDAS POR CENTRO DE CUSTO</div>
  <table>
    <tr><th>Categoria</th><th class="r">Valor</th><th class="r">%</th></tr>
    ${linhasCat}
    <tr class="total-row"><td>TOTAL</td><td class="r">${fmtR(totalSaidas)}</td><td class="r">100%</td></tr>
  </table>
</div>

<div class="section">
  <div class="section-title">DETALHAMENTO POR OBRA</div>
  <table>
    <tr><th>Obra</th><th class="r">Entradas</th><th class="r">Saídas</th><th class="r">Mão de Obra</th><th class="r">Saldo</th></tr>
    ${linhasObra}
    <tr class="total-row"><td>TOTAL</td><td class="r">${fmtR(totalEntradas)}</td><td class="r">${fmtR(totalSaidas)}</td><td class="r">${fmtR(maoTotal)}</td><td class="r">${fmtR(saldo)}</td></tr>
  </table>
</div>

<div class="footer">EDR System · ${dataHoje}</div>
</body></html>`;

  const w = window.open('', '_blank');
  w.document.write(htmlPDF);
  w.document.close();
  setTimeout(() => { w.print(); }, 400);
}

function autoFitStatValues() {
  document.querySelectorAll('.stat-value').forEach(el => {
    el.style.fontSize = '';
    el.style.whiteSpace = 'nowrap';
    const parent = el.parentElement;
    if (!parent) return;
    const maxW = parent.clientWidth - 20;
    let size = parseInt(getComputedStyle(el).fontSize);
    while (el.scrollWidth > maxW && size > 11) {
      size--;
      el.style.fontSize = size + 'px';
    }
    if (el.scrollWidth > maxW) {
      el.style.whiteSpace = 'normal';
      el.style.wordBreak = 'break-all';
    }
  });
}

window.addEventListener('resize', () => {
  clearTimeout(window._resizeFit);
  window._resizeFit = setTimeout(autoFitStatValues, 100);
});
