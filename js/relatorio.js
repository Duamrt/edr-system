const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const MESES_FULL = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const CAT_CORES = {
  // Keys legadas (compatibilidade com dados existentes)
  alimentacao:'#e67e22',alvenaria:'#95a5a6',cobertura:'#e74c3c',combustivel:'#f39c12',
  doc:'#9b59b6',eletrica:'#f1c40f',epi:'#1abc9c',esgoto:'#7f8c8d',esquadria:'#3498db',
  expediente:'#bdc3c7',ferro:'#7f8c8d',ferramenta:'#e67e22',forma:'#8e44ad',
  gesso:'#ecf0f1',granito:'#95a5a6',hidraulica:'#2980b9',impermeab:'#16a085',
  limpeza:'#27ae60',locacao:'#d35400',loucas:'#2ecc71',mao:'#e74c3c',
  pintura:'#f39c12',rev_cer:'#c0392b',terreno:'#6d4c41',generico:'#7f8c8d',outros:'#546e7a',
  tecnologia:'#6366f1',imobilizado:'#64748b',imposto:'#a855f7',aco:'#7f8c8d',
  // Keys oficiais numeradas (ETAPAS v2)
  '01_acab':'#ff7043','02_aco':'#7f8c8d','03_alimentacao':'#e67e22','04_alven':'#95a5a6',
  '05_externo':'#66bb6a','06_cobr':'#e74c3c','07_combustivel':'#f39c12','08_doc':'#9b59b6',
  '09_elet':'#f1c40f','10_epi':'#1abc9c','11_esquad':'#3498db','12_esgoto':'#7f8c8d',
  '13_estrut':'#546e7a','14_expediente':'#bdc3c7','15_ferramenta':'#e67e22','16_forma':'#8e44ad',
  '17_fund':'#455a64','18_generico':'#7f8c8d','19_gesso':'#ecf0f1','20_granito':'#95a5a6',
  '21_hidro':'#2980b9','22_imobilizado':'#64748b','23_impermeab':'#16a085','24_imposto':'#a855f7',
  '25_limpeza':'#27ae60','26_locacao':'#d35400','27_loucas':'#2ecc71','28_mao':'#e74c3c',
  '29_terra':'#8d6e63','30_pintura':'#f39c12','31_prelim':'#78909c','32_revarg':'#a1887f',
  '33_revestc':'#c0392b','34_tecnologia':'#6366f1','35_terreno':'#6d4c41','36_outros':'#546e7a',
  // Keys numeradas v1 (legado)
  '00_outros':'#546e7a','01_terreno':'#6d4c41','02_doc':'#9b59b6','03_prelim':'#78909c',
  '04_terra':'#8d6e63','05_fund':'#455a64','06_estrut':'#546e7a','07_alven':'#95a5a6',
  '08_cobr':'#e74c3c','10_hidro':'#2980b9','10b_esgoto':'#7f8c8d','12_revestc':'#c0392b',
  '12b_revarg':'#a1887f','13_pintura':'#f39c12','13b_gesso':'#ecf0f1','13c_impermeab':'#16a085',
  '13d_granito':'#95a5a6','13e_loucas':'#2ecc71','14_acab':'#ff7043','15_locacao':'#d35400',
  '16_externo':'#66bb6a','17_limpeza':'#27ae60',
};

// Mapa de aliases: keys legadas/antigas → key oficial do ETAPAS v2
const ETAPA_ALIAS = {
  // Keys legadas sem número
  alvenaria:'04_alven', cobertura:'06_cobr', eletrica:'09_elet',
  esgoto:'12_esgoto', esquadria:'11_esquad', aco:'02_aco', ferro:'02_aco',
  hidraulica:'21_hidro', limpeza:'25_limpeza', locacao:'26_locacao',
  loucas:'27_loucas', pintura:'30_pintura', rev_cer:'33_revestc',
  rev_arg:'32_revarg', gesso:'19_gesso', granito:'20_granito',
  impermeab:'23_impermeab', terreno:'35_terreno', prelim:'31_prelim',
  fundacao:'17_fund', estrutura:'13_estrut', outros:'36_outros',
  combustivel:'07_combustivel', alimentacao:'03_alimentacao',
  mao:'28_mao', imposto:'24_imposto', epi:'10_epi',
  ferramenta:'15_ferramenta', expediente:'14_expediente',
  imobilizado:'22_imobilizado', tecnologia:'34_tecnologia',
  doc:'08_doc', generico:'18_generico', forma:'16_forma',
  // Keys numeradas v1 (versão anterior)
  '01_terreno':'35_terreno', '02_doc':'08_doc', '03_prelim':'31_prelim',
  '04_terra':'29_terra', '05_fund':'17_fund', '06_estrut':'13_estrut',
  '07_alven':'04_alven', '08_cobr':'06_cobr', '10_hidro':'21_hidro',
  '10b_esgoto':'12_esgoto', '12_revestc':'33_revestc', '12b_revarg':'32_revarg',
  '13_pintura':'30_pintura', '13b_gesso':'19_gesso', '13c_impermeab':'23_impermeab',
  '13d_granito':'20_granito', '13e_loucas':'27_loucas', '14_acab':'01_acab',
  '15_locacao':'26_locacao', '16_externo':'05_externo', '17_limpeza':'25_limpeza',
  '00_outros':'36_outros',
};

// Resolve qualquer key legada pra key oficial do ETAPAS v2
function resolveEtapaKey(key) { return ETAPA_ALIAS[key] || key; }

function getCatLabel(key) {
  const resolvedKey = resolveEtapaKey(key);
  if (typeof ETAPAS !== 'undefined') {
    const etapa = ETAPAS.find(e => e.key === resolvedKey);
    if (etapa) return etapa.lb;
    const etapa2 = ETAPAS.find(e => e.key === key);
    if (etapa2) return etapa2.lb;
  }
  return '📦 ' + (key||'Outros');
}

function getCatFromLanc(l) {
  // Se já tem etapa salva, resolver pra key oficial
  if (l.etapa && l.etapa !== '00_outros' && l.etapa !== '36_outros') return resolveEtapaKey(l.etapa);
  const descLimpa = (l.descricao||'').replace(/^\d{6}\s*·\s*/, '').trim();
  const dn = descLimpa.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const mat = catalogoMateriais.find(m => {
    const mn = norm(m.nome);
    return mn === norm(l.descricao||'') || mn === norm(descLimpa) || mn.includes(dn) || dn.includes(mn.split(' ')[0]);
  });
  if (mat && mat.categoria) return resolveEtapaKey(mat.categoria);
  const desc = descLimpa || l.descricao || "";
  const dnn = desc.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  const catEstoque = getCatEstoque(desc);
  if (catEstoque && catEstoque !== "outros") return resolveEtapaKey(catEstoque);
  if (/mao[\s\-]de[\s\-]obra|armador|eletricista|pintor|pedreiro|servente|mestre de obras|encanador|azulejista/.test(dnn)) return "28_mao";
  if (/aquisicao de terreno|compra de terreno/.test(dnn)) return "35_terreno";
  if (/contrato|documento|anotacao|alvara|licenca|vistoria|escritura/.test(dnn)) return "08_doc";
  return "36_outros";
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
  // Renderizar tabela de entradas filtradas (se existir no DOM)
  if (document.getElementById('rel-entradas-tabela')) {
    renderTabelaEntradas();
  }
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
// Toggle: mostrar obras concluídas no relatório (default: não)
if (typeof window._relMostrarConcluidas === 'undefined') window._relMostrarConcluidas = false;

function toggleObrasConcluidas() {
  window._relMostrarConcluidas = !window._relMostrarConcluidas;
  renderRelatorio();
}

function getObrasIdsAtivas() {
  return new Set(obras.filter(o => !o.arquivada).map(o => o.id));
}

function buildPainelFinanceiro() {
  const [anoStr, mesStr] = relMesAtual.split('-');
  const mesLabel = MESES_FULL[parseInt(mesStr)-1] + ' ' + anoStr;
  const mostrarConcluidas = window._relMostrarConcluidas;
  const idsAtivas = getObrasIdsAtivas();

  // SAÍDAS do mês (lançamentos) — filtrar por obras ativas se toggle desligado
  const lancMesTodas = getLancMes(relMesAtual);
  const lancMes = mostrarConcluidas ? lancMesTodas : lancMesTodas.filter(l => !l.obra_id || idsAtivas.has(l.obra_id));
  const totalSaidas = lancMes.reduce((s,l) => s + Number(l.total||0), 0);

  // Mão de obra do mês
  const maoObraMes = lancMes.filter(l => getCatFromLanc(l) === '28_mao').reduce((s,l) => s + Number(l.total||0), 0);

  // ENTRADAS do mês: pagamentos de adicionais recebidos no mês
  const pgtosTodasMes = adicionaisPgtos.filter(p => p.data && p.data.startsWith(relMesAtual));
  const pgtosMes = mostrarConcluidas ? pgtosTodasMes : pgtosTodasMes.filter(p => {
    const adic = (typeof adicionais !== 'undefined' ? adicionais : []).find(a => a.id === p.adicional_id);
    return !adic || !adic.obra_id || idsAtivas.has(adic.obra_id);
  });
  const totalPgtosAdic = pgtosMes.reduce((s,p) => s + Number(p.valor||0), 0);

  // Entradas: repasses CEF no mês (PLs, entrada, terreno)
  const repassesTodasMes = getRepassesMes(relMesAtual);
  const repassesMes = mostrarConcluidas ? repassesTodasMes : repassesTodasMes.filter(r => !r.obra_id || idsAtivas.has(r.obra_id));
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

  // ── TOGGLE OBRAS CONCLUÍDAS ──
  const toggleCor = mostrarConcluidas ? '#2ecc71' : 'var(--texto4)';
  const toggleBg = mostrarConcluidas ? 'rgba(34,197,94,0.1)' : 'transparent';
  const toggleBorda = mostrarConcluidas ? '1.5px solid rgba(34,197,94,0.3)' : '1.5px solid var(--borda2)';
  let html = `<div style="display:flex;justify-content:flex-end;margin-bottom:12px;">
    <span onclick="toggleObrasConcluidas()" style="cursor:pointer;padding:6px 14px;border-radius:20px;font-size:11px;font-weight:600;color:${toggleCor};background:${toggleBg};border:${toggleBorda};transition:all .2s;user-select:none;">
      ${mostrarConcluidas ? '✅ Mostrando concluídas' : '📋 Só obras ativas'}
    </span>
  </div>`;

  // ── CARDS RESUMO ──
  html += `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:20px;">
    ${cardResumo('💰', 'ENTRADAS', totalEntradas, '#2ecc71', subEntradas)}
    ${cardResumo('📤', 'SAÍDAS', totalSaidas, '#ef4444', `${lancMes.length} lançamentos`)}
    ${cardResumo('📊', 'SALDO', saldo, corSaldo, saldo >= 0 ? 'Positivo' : 'Negativo')}
    ${cardResumo('👷', 'MÃO DE OBRA', maoObraMes, '#f39c12', totalSaidas > 0 ? (maoObraMes/totalSaidas*100).toFixed(0)+'% do total' : '—')}
  </div>`;

  // ── DETALHE DAS ENTRADAS COM FILTROS ──
  if (repassesMes.length || pgtosMes.length) {
    // Montar todas as entradas como array unificado
    const todasEntradas = [];
    repassesMes.forEach(r => {
      const tipoKey = r.tipo === 'entrada' ? 'entrada' : r.tipo === 'terreno' ? 'terreno' : 'pls';
      const tipoLabel = tipoKey === 'entrada' ? '💵 Entrada' : tipoKey === 'terreno' ? '🏗 Terreno' : '🏦 PL';
      todasEntradas.push({
        data: r.data_credito || '', obraNome: obras.find(o => o.id === r.obra_id)?.nome || '—',
        tipoKey, tipoLabel, desc: r.descricao || r.tipo || '—', valor: Number(r.valor||0)
      });
    });
    pgtosMes.forEach(p => {
      const adic = (typeof adicionais !== 'undefined' ? adicionais : []).find(a => a.id === p.adicional_id);
      todasEntradas.push({
        data: p.data || '', obraNome: adic ? (obras.find(o => o.id === adic.obra_id)?.nome || '—') : '—',
        tipoKey: 'extra', tipoLabel: '⭐ Extra', desc: adic?.descricao || '—', valor: Number(p.valor||0)
      });
    });
    todasEntradas.sort((a,b) => a.data.localeCompare(b.data));

    // Descobrir quais tipos existem no mês
    const tiposPresentes = [...new Set(todasEntradas.map(e => e.tipoKey))];
    const tipoConfig = { pls: { lb: '🏦 PLs', cor: '#3498db' }, entrada: { lb: '💵 Entrada', cor: '#2ecc71' }, terreno: { lb: '🏗 Terreno', cor: '#e67e22' }, extra: { lb: '⭐ Extras', cor: '#f1c40f' } };

    // Guardar dados no window pra filtro funcionar
    window._relEntradasMes = todasEntradas;
    window._relFiltrosEntrada = new Set(tiposPresentes); // todos ativos inicialmente

    const chipStyle = (key) => `cursor:pointer;padding:5px 12px;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:0.5px;transition:all .2s;user-select:none;`;

    const chips = tiposPresentes.map(key => {
      const c = tipoConfig[key] || { lb: key, cor: '#999' };
      return `<span id="rel-chip-${key}" onclick="toggleFiltroEntrada('${key}')" style="${chipStyle(key)}background:${c.cor};color:#fff;">${c.lb}</span>`;
    }).join('');

    html += `<div class="rel-card" style="margin-bottom:16px;">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:12px;">
        <div class="rel-card-title" style="margin:0;">💰 ENTRADAS DO MÊS</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
          ${chips}
          <span onclick="limparFiltrosEntrada()" style="cursor:pointer;padding:5px 10px;border-radius:20px;font-size:10px;color:var(--texto4);border:1px solid var(--borda2);transition:all .2s;">LIMPAR</span>
        </div>
      </div>
      <div style="margin-bottom:8px;font-size:11px;color:var(--texto3);" id="rel-entradas-total"></div>
      <div id="rel-entradas-tabela"></div>
    </div>`;

    // Renderizar tabela será feito por JS após o HTML ser inserido — via setTimeout
    // A função renderTabelaEntradas precisa existir globalmente
  }

  // ── GRÁFICO ENTRADAS vs SAÍDAS (últimos 6 meses) ──
  html += buildGraficoMensal();

  // ── DETALHAMENTO POR OBRA ──
  html += buildDetalheObras(relMesAtual);

  // ── CUSTO POR M² ──
  html += buildCustoPorM2();

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

  // Pré-agregar por mês numa passagem só (evita filtrar lancamentos 6x)
  const saidasPorMes = {}, entAdicPorMes = {}, entRepPorMes = {};
  mesesArr.forEach(ym => { saidasPorMes[ym] = 0; entAdicPorMes[ym] = 0; entRepPorMes[ym] = 0; });
  const mesesSet = new Set(mesesArr);
  lancamentos.forEach(l => { const ym = l.data?.substring(0,7); if (ym && mesesSet.has(ym)) saidasPorMes[ym] += Number(l.total||0); });
  adicionaisPgtos.forEach(p => { const ym = p.data?.substring(0,7); if (ym && mesesSet.has(ym)) entAdicPorMes[ym] += Number(p.valor||0); });
  (typeof repassesCef !== 'undefined' ? repassesCef : []).forEach(r => { const ym = r.data_credito?.substring(0,7); if (ym && mesesSet.has(ym)) entRepPorMes[ym] += Number(r.valor||0); });

  const dados = mesesArr.map(ym => ({
    ym, entradas: entAdicPorMes[ym] + entRepPorMes[ym], saidas: saidasPorMes[ym]
  }));

  const maxVal = Math.max(...dados.map(d => Math.max(d.entradas, d.saidas)), 1);

  const colunas = dados.map(d => {
    const [a, m] = d.ym.split('-');
    const hEnt = Math.max((d.entradas / maxVal * 100), d.entradas > 0 ? 4 : 0);
    const hSai = Math.max((d.saidas / maxVal * 100), d.saidas > 0 ? 4 : 0);
    const isAtual = d.ym === relMesAtual;
    const bordaAtual = isAtual ? 'border:2px solid rgba(34,197,94,0.4);border-radius:10px;padding:4px;' : '';
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
  const mostrarConcluidas = window._relMostrarConcluidas;
  const obrasAtivas = mostrarConcluidas ? [...obras, ...obrasArquivadas] : obras.filter(o => !o.arquivada);
  if (!obrasAtivas.length) return '';

  const dados = obrasAtivas.map(o => {
    // Saídas do mês nessa obra
    const lancObra = lancamentos.filter(l => l.obra_id === o.id && l.data && l.data.startsWith(ym));
    const saidas = lancObra.reduce((s,l) => s + Number(l.total||0), 0);
    // Mão de obra do mês nessa obra
    const mao = lancObra.filter(l => getCatFromLanc(l) === '28_mao').reduce((s,l) => s + Number(l.total||0), 0);
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
        <div style="font-size:12px;font-weight:700;color:var(--branco);max-width:55%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(d.nome)}</div>
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

// ── CUSTO POR M² ─────────────────────────────────────────────
function buildCustoPorM2() {
  const todasObras = [...obras, ...obrasArquivadas];
  const obrasComArea = todasObras.filter(o => Number(o.area_m2) > 0);
  if (!obrasComArea.length) return '';

  const dados = obrasComArea.map(o => {
    const area = Number(o.area_m2);
    const totalGasto = lancamentos.filter(l => l.obra_id === o.id).reduce((s,l) => s + Number(l.total||0), 0);
    const maoObra = lancamentos.filter(l => l.obra_id === o.id && getCatFromLanc(l) === '28_mao').reduce((s,l) => s + Number(l.total||0), 0);
    const valorVenda = Number(o.valor_venda||0);
    const custoM2 = area > 0 ? totalGasto / area : 0;
    const maoM2 = area > 0 ? maoObra / area : 0;
    const vendaM2 = area > 0 && valorVenda > 0 ? valorVenda / area : 0;
    const lucroM2 = vendaM2 > 0 ? vendaM2 - custoM2 : 0;
    const margemPct = vendaM2 > 0 ? (lucroM2 / vendaM2 * 100) : 0;
    return { nome: o.nome, area, totalGasto, maoObra, custoM2, maoM2, vendaM2, lucroM2, margemPct, arquivada: o.arquivada };
  }).sort((a,b) => a.custoM2 - b.custoM2);

  const linhas = dados.map(d => {
    const corMargem = d.lucroM2 > 0 ? '#2ecc71' : d.vendaM2 > 0 ? '#ef4444' : 'var(--texto4)';
    const badge = d.arquivada ? '<span style="font-size:8px;background:rgba(34,197,94,0.15);color:#2ecc71;padding:2px 6px;border-radius:4px;margin-left:6px;font-weight:700;">CONCLUÍDA</span>' : '';
    return `<div style="background:var(--bg2);border:1px solid var(--borda2);border-radius:10px;padding:14px;margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <div style="font-size:12px;font-weight:700;color:var(--branco);">${esc(d.nome)}${badge}</div>
        <div style="font-size:10px;color:var(--texto4);">${d.area.toFixed(1)} m²</div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:8px;">
        <div>
          <div style="font-size:9px;color:var(--texto4);margin-bottom:2px;">CUSTO / m²</div>
          <div style="font-size:16px;font-weight:800;color:#e74c3c;font-family:'Rajdhani',sans-serif;">${fmtR(d.custoM2)}</div>
        </div>
        <div>
          <div style="font-size:9px;color:var(--texto4);margin-bottom:2px;">MÃO OBRA / m²</div>
          <div style="font-size:16px;font-weight:800;color:#f39c12;font-family:'Rajdhani',sans-serif;">${fmtR(d.maoM2)}</div>
        </div>
        ${d.vendaM2 > 0 ? `<div>
          <div style="font-size:9px;color:var(--texto4);margin-bottom:2px;">VENDA / m²</div>
          <div style="font-size:16px;font-weight:800;color:#2ecc71;font-family:'Rajdhani',sans-serif;">${fmtR(d.vendaM2)}</div>
        </div>
        <div>
          <div style="font-size:9px;color:var(--texto4);margin-bottom:2px;">LUCRO / m²</div>
          <div style="font-size:16px;font-weight:800;color:${corMargem};font-family:'Rajdhani',sans-serif;">${fmtR(d.lucroM2)}</div>
          <div style="font-size:9px;color:${corMargem};margin-top:2px;">Margem ${d.margemPct.toFixed(1)}%</div>
        </div>` : ''}
      </div>
      <div style="margin-top:10px;font-size:10px;color:var(--texto4);">
        Total gasto: ${fmtR(d.totalGasto)} · Mão de obra: ${fmtR(d.maoObra)} (${d.totalGasto > 0 ? (d.maoObra/d.totalGasto*100).toFixed(0) : 0}%)
      </div>
    </div>`;
  }).join('');

  return `<div class="rel-card" style="margin-bottom:16px;">
    <div class="rel-card-title">📐 CUSTO POR m²</div>
    <div style="font-size:11px;color:var(--texto3);margin-bottom:12px;">Comparativo de custo acumulado por área construída</div>
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
        <span style="color:var(--branco);font-weight:600;max-width:60%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(d.nome)}</span>
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
  const maoTotal = lancMes.filter(l => getCatFromLanc(l) === '28_mao').reduce((s,l) => s + Number(l.total||0), 0);

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
    const mao = lancObra.filter(l => getCatFromLanc(l) === '28_mao').reduce((s,l) => s + Number(l.total||0), 0);
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
<div class="no-print" style="position:fixed;bottom:0;left:0;right:0;padding:12px;background:#fff;border-top:2px solid #2ecc71;display:flex;gap:10px;justify-content:center;z-index:9999;">
  <button onclick="window.print()" style="background:#2ecc71;color:#fff;border:none;border-radius:8px;padding:12px 24px;font-size:14px;font-weight:700;cursor:pointer;">🖨 IMPRIMIR</button>
  <button onclick="window.close()" style="background:#e74c3c;color:#fff;border:none;border-radius:8px;padding:12px 24px;font-size:14px;font-weight:700;cursor:pointer;">← VOLTAR AO SISTEMA</button>
</div>
<style>@media print{.no-print{display:none!important;}body{padding-bottom:0!important;}} body{padding-bottom:70px;}</style>
</body></html>`;

  const w = window.open('', '_blank');
  w.document.write(htmlPDF);
  w.document.close();
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

// ── FILTROS DE ENTRADAS NO RELATÓRIO ──
const _tipoConfig = { pls: { lb: '🏦 PLs', cor: '#3498db' }, entrada: { lb: '💵 Entrada', cor: '#2ecc71' }, terreno: { lb: '🏗 Terreno', cor: '#e67e22' }, extra: { lb: '⭐ Extras', cor: '#f1c40f' } };

function toggleFiltroEntrada(key) {
  if (!window._relFiltrosEntrada) return;
  const filtros = window._relFiltrosEntrada;
  if (filtros.has(key)) filtros.delete(key); else filtros.add(key);
  atualizarChipsEntrada();
  renderTabelaEntradas();
}

function limparFiltrosEntrada() {
  if (!window._relEntradasMes) return;
  const todos = [...new Set(window._relEntradasMes.map(e => e.tipoKey))];
  // Se todos ativos, desativa todos. Se algum desativado, ativa todos.
  const filtros = window._relFiltrosEntrada;
  const todosAtivos = todos.every(k => filtros.has(k));
  if (todosAtivos) { filtros.clear(); } else { todos.forEach(k => filtros.add(k)); }
  atualizarChipsEntrada();
  renderTabelaEntradas();
}

function atualizarChipsEntrada() {
  const filtros = window._relFiltrosEntrada || new Set();
  Object.keys(_tipoConfig).forEach(key => {
    const chip = document.getElementById(`rel-chip-${key}`);
    if (!chip) return;
    const c = _tipoConfig[key];
    if (filtros.has(key)) {
      chip.style.background = c.cor; chip.style.color = '#fff'; chip.style.border = 'none'; chip.style.opacity = '1';
    } else {
      chip.style.background = 'transparent'; chip.style.color = c.cor; chip.style.border = `1.5px solid ${c.cor}`; chip.style.opacity = '0.6';
    }
  });
}

function renderTabelaEntradas() {
  const container = document.getElementById('rel-entradas-tabela');
  const totalEl = document.getElementById('rel-entradas-total');
  if (!container || !window._relEntradasMes) return;

  const filtros = window._relFiltrosEntrada || new Set();
  const filtradas = window._relEntradasMes.filter(e => filtros.has(e.tipoKey));
  const totalFiltrado = filtradas.reduce((s, e) => s + e.valor, 0);

  totalEl.innerHTML = filtradas.length
    ? `Mostrando <strong>${filtradas.length}</strong> entrada${filtradas.length > 1 ? 's' : ''} · Total: <strong style="color:#2ecc71;">${fmtR(totalFiltrado)}</strong>`
    : 'Nenhuma entrada com os filtros selecionados.';

  if (!filtradas.length) { container.innerHTML = ''; return; }

  let tbl = `<table style="width:100%;font-size:11px;border-collapse:collapse;">
    <tr style="border-bottom:1px solid var(--borda2);">
      <th style="text-align:left;padding:6px 8px;color:var(--texto3);font-size:10px;">DATA</th>
      <th style="text-align:left;padding:6px 8px;color:var(--texto3);font-size:10px;">OBRA</th>
      <th style="text-align:left;padding:6px 8px;color:var(--texto3);font-size:10px;">TIPO</th>
      <th style="text-align:left;padding:6px 8px;color:var(--texto3);font-size:10px;">DESCRIÇÃO</th>
      <th style="text-align:right;padding:6px 8px;color:var(--texto3);font-size:10px;">VALOR</th>
    </tr>`;
  filtradas.forEach(e => {
    const dataFmt = fmtData(e.data);
    tbl += `<tr style="border-bottom:1px solid rgba(255,255,255,0.04);">
      <td style="padding:6px 8px;color:var(--texto4);">${dataFmt}</td>
      <td style="padding:6px 8px;font-weight:600;">${esc(e.obraNome)}</td>
      <td style="padding:6px 8px;">${e.tipoLabel}</td>
      <td style="padding:6px 8px;color:var(--texto4);">${esc(e.desc)}</td>
      <td style="padding:6px 8px;text-align:right;font-weight:700;color:#2ecc71;">${fmtR(e.valor)}</td>
    </tr>`;
  });
  tbl += '</table>';
  container.innerHTML = tbl;
}
