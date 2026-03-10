// ══════════════════════════════════════════
// UTILITÁRIOS
// ══════════════════════════════════════════
function setToday() { const d = new Date().toISOString().split('T')[0]; document.getElementById('f-emissao').value = d; document.getElementById('f-recebimento').value = d; }
function fmt(v) { return Number(v||0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function maskCNPJ(el) { let v = el.value.replace(/\D/g,'').slice(0,14); if(v.length>12)v=v.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2}).*/,'$1.$2.$3/$4-$5'); else if(v.length>8)v=v.replace(/^(\d{2})(\d{3})(\d{3})(\d*)/,'$1.$2.$3/$4'); else if(v.length>5)v=v.replace(/^(\d{2})(\d{3})(\d*)/,'$1.$2.$3'); else if(v.length>2)v=v.replace(/^(\d{2})(\d*)/,'$1.$2'); el.value = v; }
function norm(s) { return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''); }
function parseItens(n) { try { return JSON.parse(n.itens||'[]'); } catch { return []; } }

function populateSelects() {
  const pool = mostandoArquivadas ? obrasArquivadas : obras;
  const opts = pool.map(o => `<option value="${o.id}">${o.nome}</option>`).join('');
  // Obras ativas apenas (arquivadas nunca aparecem no form NF, distrib ou lanç)
  const optsNome = obras.map(o => `<option value="${o.nome}">${o.nome}</option>`).join('');
  document.getElementById('f-obra').innerHTML = `<option value="EDR">📦 EDR ENGENHARIA (ESTOQUE)</option><option value="EDR_ESCRITORIO">🏢 EDR ESCRITÓRIO (CONSUMO DIRETO)</option>${optsNome}`;
  document.getElementById('filtro-obra').innerHTML = `<option value="">TODAS AS OBRAS</option><option value="EDR">EDR ENGENHARIA</option>${optsNome}`;
  document.getElementById('dist-obra').innerHTML = opts;
  document.getElementById('obras-filtro-obra').innerHTML = `<option value="">Todas as obras</option>${opts}`;
}
