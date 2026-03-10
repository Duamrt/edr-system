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
    // Etapas de obra — mapa embutido para não depender de etapaLabel
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
  // PRIORIDADE 1: etapa salva no lançamento (centro de custo real)
  if (l.etapa && l.etapa !== '00_outros') return l.etapa;
  // PRIORIDADE 2: match no catálogo — exato, sem código, ou parcial (lançamentos antigos)
  const descLimpa = (l.descricao||'').replace(/^\d{6}\s*·\s*/, '').trim();
  const dn = descLimpa.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const mat = catalogoMateriais.find(m => {
    const mn = norm(m.nome);
    return mn === norm(l.descricao||'') ||  // match exato com código
           mn === norm(descLimpa) ||          // match exato sem código
           mn.includes(dn) ||                 // catálogo contém a desc (ex: "cimento cp-ii" inclui "cimento")
           dn.includes(mn.split(' ')[0]);      // desc começa com primeira palavra do catálogo
  });
  if (mat && mat.categoria) return mat.categoria;
  // PRIORIDADE 3: inferir pela descrição
  const desc = descLimpa || l.descricao || "";
  const dnn = desc.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  const catEstoque = getCatEstoque(desc);
  if (catEstoque && catEstoque !== "outros") return catEstoque;
  if (/mao[\s\-]de[\s\-]obra|armador|eletricista|pintor|pedreiro|servente|mestre de obras|encanador|azulejista/.test(dnn)) return "mao";
  if (/aquisicao de terreno|compra de terreno/.test(dnn)) return "terreno";
  if (/contrato|documento|anotacao|alvara|licenca|vistoria|escritura/.test(dnn)) return "doc";
  return "outros";
}
function getCatFromLanc_UNUSED(l) {
  const desc = l.descricao || '';
  // Checar mao/doc/terreno que não estão no CATS_ESTOQUE
  if (/m[aã]o[\s\-]de[\s\-]obra|armador|eletricista|pintor|pedreiro|servente|mestre de obras|encanador|azulejista/i.test(desc)) return 'mao';
  if (/terreno|aquisicao de terreno|compra de terreno/i.test(desc)) return 'terreno';
  if (/contrato|documento|art |anotac|registro de contrato|orcamento|alvara|licenca|projeto|vistoria|escritura/i.test(desc)) return 'doc';
  // Usar getCatEstoque que cobre todas as demais categorias
  return getCatEstoque(desc) || 'outros';
}


function verCategoriaEmObras(cat) {
  // Carregar obra que estava selecionada no relatório
  const relObraId = document.getElementById('rel-obra')?.value || '';
  catFiltroAtual = cat;
  setView('obras');
  // Aplicar filtro de obra igual ao do relatório
  const selObra = document.getElementById('filtro-obra-lanc') || document.getElementById('sel-obra-lanc');
  if (selObra && relObraId) selObra.value = relObraId;
  // Aplicar filtro de obra — atualiza o select e dispara onChangeObraFiltro
  if (relObraId) {
    const selObraLanc = document.getElementById('obras-filtro-obra');
    if (selObraLanc) { selObraLanc.value = relObraId; onChangeObraFiltro(); }
  }
  // Atualizar select de categoria
  const sel = document.getElementById('filtro-cat');
  if (sel) sel.value = cat;
  filtrarLanc();
  // Highlight nos chips
  document.querySelectorAll('.cat-chip').forEach(el => {
    const k = el.getAttribute('onclick')?.match(/toggleCat\('(.+?)'\)/)?.[1];
    if (k) el.classList.toggle('ativo', k === cat);
  });
  const obraNome = relObraId ? (obras.find(o=>o.id===relObraId)?.nome || '') : '';
  showToast(`📂 ${obraNome ? obraNome+' · ' : ''}${getCatLabel(cat)}`);
}

function initRelatorio() {
  // Preencher filtro de obras
  const selObra = document.getElementById('rel-obra');
  if (selObra) {
    const cur = selObra.value;
    selObra.innerHTML = '<option value="">🏗 Todas as obras</option>' +
      obras.map(o => `<option value="${o.id}" ${o.id===cur?'selected':''}>${o.nome}</option>`).join('');
  }
  // Preencher filtro de anos
  const selAno = document.getElementById('rel-ano');
  if (selAno) {
    const anos = [...new Set(lancamentos.map(l => l.data?.substring(0,4)).filter(Boolean))].sort().reverse();
    const cur = selAno.value;
    selAno.innerHTML = '<option value="">📅 Todos os anos</option>' +
      anos.map(a => `<option value="${a}" ${a===cur?'selected':''}>${a}</option>`).join('');
  }
  renderRelatorio();
}

function filtrarLancamentos() {
  const obraId = document.getElementById('rel-obra')?.value || '';
  const ano    = document.getElementById('rel-ano')?.value  || '';
  return lancamentos.filter(l => {
    if (obraId && l.obra_id !== obraId) return false;
    if (ano && (!l.data || !l.data.startsWith(ano))) return false;
    return true;
  });
}

function renderRelatorio() {
  const secao = document.getElementById('rel-secao')?.value || 'tudo';
  const ls = filtrarLancamentos();
  const el = document.getElementById('rel-content');
  if (!el) return;

  if (!ls.length) {
    el.innerHTML = `<div style="text-align:center;padding:60px 20px;color:var(--texto3);font-size:13px;">
      Nenhum lançamento encontrado para os filtros selecionados.</div>`;
    return;
  }

  let html = '';
  if (secao === 'tudo' || secao === 'categoria') html += buildSecaoCategoria(ls);
  if (secao === 'tudo' || secao === 'mensal')    html += buildSecaoMensal(ls);
  if (secao === 'tudo' || secao === 'comparativo') html += buildSecaoComparativo();
  if (secao === 'tudo' || secao === 'faltas')    html += buildSecaoFaltas();
  el.innerHTML = html;
}

function buildSecaoCategoria(ls) {
  // Agrupa por categoria — usa getCatFromLanc para suportar dados históricos sem etapa
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

function buildSecaoMensal(ls) {
  // Agrupa por ano-mês
  const map = {};
  ls.forEach(l => {
    if (!l.data) return;
    const ym = l.data.substring(0,7); // "2024-03"
    if (!map[ym]) map[ym] = 0;
    map[ym] += Number(l.total || 0);
  });
  const chaves = Object.keys(map).sort();
  if (!chaves.length) return '';
  const maxVal = Math.max(...Object.values(map));

  const colunas = chaves.map(ym => {
    const [ano, mes] = ym.split('-');
    const val = map[ym];
    const pct = maxVal > 0 ? (val/maxVal*100) : 0;
    return `<div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex:1;min-width:40px;">
      <div style="font-size:10px;color:var(--verde-hl);font-weight:700;">${fmtR(val,true)}</div>
      <div style="width:100%;background:rgba(255,255,255,0.06);border-radius:4px 4px 0 0;height:100px;display:flex;align-items:flex-end;">
        <div style="width:100%;height:${pct}%;background:linear-gradient(0deg,var(--verde2),var(--verde3));border-radius:4px 4px 0 0;transition:height .5s;min-height:4px;"></div>
      </div>
      <div style="font-size:10px;color:var(--texto3);text-align:center;line-height:1.2;">${MESES[parseInt(mes)-1]}<br><span style="color:var(--texto4);font-size:9px;">${ano}</span></div>
    </div>`;
  }).join('');

  return `<div class="rel-card" style="margin-top:16px;">
    <div class="rel-card-title">📅 EVOLUÇÃO MENSAL</div>
    <div style="display:flex;gap:6px;align-items:flex-end;overflow-x:auto;padding-bottom:4px;">
      ${colunas}
    </div>
  </div>`;
}

function buildSecaoComparativo() {
  if (obras.length < 2) return '';
  // Cada obra → total gasto
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

  return `<div class="rel-card" style="margin-top:16px;">
    <div class="rel-card-title">⚖ COMPARATIVO ENTRE OBRAS</div>
    ${linhas}
  </div>`;
}

function getCatLabel(cat) {
  const CATS_OPTS_MAP = {
    alimentacao:'🍽 Alimentação',alvenaria:'🧱 Alvenaria',cobertura:'🏠 Cobertura',
    combustivel:'⛽ Combustível',doc:'📋 Documentação',eletrica:'⚡ Elétrica',
    epi:'🦺 EPI/Segurança',esgoto:'🪠 Esgoto',esquadria:'🪟 Esquadrias',
    expediente:'📎 Expediente',ferro:'⚙ Aço/Ferro',ferramenta:'🔨 Ferramentas',
    forma:'🪵 Forma/Madeira',gesso:'⬜ Gesso',granito:'🪨 Granito/Pedra',
    hidraulica:'🚿 Hidráulica',impermeab:'💧 Impermeabilização',limpeza:'🧹 Limpeza',
    locacao:'🏗 Locação',loucas:'🛁 Louças',mao:'👷 Mão de Obra',
    imposto:'🧾 Impostos/Encargos',imobilizado:'🖥 Imobilizado',tecnologia:'💻 Tecnologia/Assinaturas',
    pintura:'🖌 Pintura',rev_cer:'🟫 Revest.Cerâmico',terreno:'🏡 Terreno',
    generico:'❓ Genérico',outros:'📦 Outros'
  };
  return CATS_OPTS_MAP[cat] || cat;
}

function fmtR(v, abrev = false) {
  const n = Number(v) || 0;
  if (abrev && n >= 1000) return 'R$' + (n/1000).toFixed(1) + 'k';
  return n.toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
}

async function exportarRelatorioPDF() {
  const obraId = document.getElementById('rel-obra')?.value || '';
  const ano    = document.getElementById('rel-ano')?.value  || '';
  const ls     = filtrarLancamentos();
  const obraNome = obraId ? (obras.find(o=>o.id===obraId)?.nome || 'Todas') : 'Todas as Obras';

  // Monta dados para PDF
  const map = {};
  ls.forEach(l => {
    const cat = getCatFromLanc(l);
    if (!map[cat]) map[cat] = 0;
    map[cat] += Number(l.total || 0);
  });
  const totalGeral = Object.values(map).reduce((s,v)=>s+v,0);
  const catItens = Object.entries(map).sort((a,b)=>b[1]-a[1]);

  // Agrupa por mês
  const mapMes = {};
  ls.forEach(l => {
    if (!l.data) return;
    const ym = l.data.substring(0,7);
    if (!mapMes[ym]) mapMes[ym] = 0;
    mapMes[ym] += Number(l.total || 0);
  });
  const meses = Object.entries(mapMes).sort((a,b)=>a[0].localeCompare(b[0]));

  const dataHoje = new Date().toLocaleDateString('pt-BR');
  const periodoLabel = ano ? `Ano ${ano}` : 'Todo o período';

  const linhasCategoria = catItens.map(([cat, val]) => {
    const pct = totalGeral > 0 ? (val/totalGeral*100).toFixed(1) : '0.0';
    return `<tr>
      <td style="padding:6px 10px;font-size:11px;">${getCatLabel(cat)}</td>
      <td style="padding:6px 10px;text-align:right;font-size:11px;">${fmtR(val)}</td>
      <td style="padding:6px 10px;text-align:right;font-size:11px;">${pct}%</td>
    </tr>`;
  }).join('');

  const linhasMensal = meses.map(([ym, val]) => {
    const [a, m] = ym.split('-');
    return `<tr>
      <td style="padding:6px 10px;font-size:11px;">${MESES[parseInt(m)-1]} ${a}</td>
      <td style="padding:6px 10px;text-align:right;font-size:11px;">${fmtR(val)}</td>
    </tr>`;
  }).join('');

  const comparativo = obras.map(o => {
    const tot = lancamentos.filter(l=>l.obra_id===o.id).reduce((s,l)=>s+Number(l.total||0),0);
    if (!tot) return '';
    return `<tr>
      <td style="padding:6px 10px;font-size:11px;">${o.nome}</td>
      <td style="padding:6px 10px;text-align:right;font-size:11px;">${fmtR(tot)}</td>
    </tr>`;
  }).filter(Boolean).join('');

  const htmlPDF = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8">
<style>
  body{font-family:Arial,sans-serif;color:#111;background:#fff;padding:24px;font-size:12px;}
  h1{font-size:18px;margin:0 0 4px 0;color:#1a1a1a;}
  .sub{font-size:11px;color:#555;margin-bottom:20px;}
  .section{margin-bottom:24px;}
  .section-title{font-size:13px;font-weight:700;color:#1a1a1a;border-bottom:2px solid #2ecc71;padding-bottom:4px;margin-bottom:10px;}
  table{width:100%;border-collapse:collapse;}
  th{background:#f0f0f0;padding:7px 10px;text-align:left;font-size:11px;font-weight:700;}
  th.r{text-align:right;}
  tr:nth-child(even){background:#f9f9f9;}
  .total-row td{font-weight:700;border-top:2px solid #2ecc71;background:#f0fff4;}
  .footer{margin-top:30px;font-size:10px;color:#aaa;text-align:center;border-top:1px solid #eee;padding-top:10px;}
</style>
</head>
<body>
<h1>📈 RELATÓRIO DE OBRAS — EDR</h1>
<div class="sub">Obra: <b>${obraNome}</b> · Período: <b>${periodoLabel}</b> · Emitido em ${dataHoje}</div>

<div class="section">
  <div class="section-title">CUSTO POR CENTRO DE CUSTO</div>
  <table>
    <tr><th>Categoria</th><th class="r">Valor</th><th class="r">%</th></tr>
    ${linhasCategoria}
    <tr class="total-row"><td>TOTAL</td><td style="text-align:right">${fmtR(totalGeral)}</td><td style="text-align:right">100%</td></tr>
  </table>
</div>

${meses.length ? `<div class="section">
  <div class="section-title">EVOLUÇÃO MENSAL</div>
  <table>
    <tr><th>Mês</th><th class="r">Valor</th></tr>
    ${linhasMensal}
    <tr class="total-row"><td>TOTAL</td><td style="text-align:right">${fmtR(totalGeral)}</td></tr>
  </table>
</div>` : ''}

${obras.length > 1 ? `<div class="section">
  <div class="section-title">COMPARATIVO ENTRE OBRAS</div>
  <table>
    <tr><th>Obra</th><th class="r">Total Gasto</th></tr>
    ${comparativo}
  </table>
</div>` : ''}

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
    // Diminui fonte até caber, mínimo 11px
    while (el.scrollWidth > maxW && size > 11) {
      size--;
      el.style.fontSize = size + 'px';
    }
    // Se mesmo no mínimo ainda não cabe, permite quebra de linha
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

