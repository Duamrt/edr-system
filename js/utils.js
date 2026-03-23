// ══════════════════════════════════════════
// UTILITÁRIOS
// ══════════════════════════════════════════
function setToday() { const d = hojeISO(); document.getElementById('f-emissao').value = d; document.getElementById('f-recebimento').value = d; }
function fmt(v) { return Number(v||0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function maskCNPJ(el) { let v = el.value.replace(/\D/g,'').slice(0,14); if(v.length>12)v=v.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2}).*/,'$1.$2.$3/$4-$5'); else if(v.length>8)v=v.replace(/^(\d{2})(\d{3})(\d{3})(\d*)/,'$1.$2.$3/$4'); else if(v.length>5)v=v.replace(/^(\d{2})(\d{3})(\d*)/,'$1.$2.$3'); else if(v.length>2)v=v.replace(/^(\d{2})(\d*)/,'$1.$2'); el.value = v; }
function norm(s) { return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''); }
// Datas padronizadas — usar em todo o sistema
function hojeISO() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function fmtData(iso) { if (!iso) return '—'; return iso.split('T')[0].split('-').reverse().join('/'); }
function parseItens(n) { try { return JSON.parse(n.itens||'[]'); } catch(e) { console.error('parseItens JSON inválido:', e); return []; } }
// Sanitização XSS — escapar HTML em dados de usuário
function esc(s) { if (!s) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

function populateSelects() {
  const pool = mostandoArquivadas ? obrasArquivadas : obras;
  const opts = pool.map(o => `<option value="${o.id}">${o.nome}</option>`).join('');
  // Obras ativas apenas (arquivadas nunca aparecem no form NF, distrib ou lanç)
  const optsNome = obras.map(o => `<option value="${o.nome}">${o.nome}</option>`).join('');
  document.getElementById('f-obra').innerHTML = `<option value="${COMPANY_DEFAULTS.estoqueGeral}">📦 ${COMPANY_DEFAULTS.estoqueLabel} (ESTOQUE)</option><option value="${COMPANY_DEFAULTS.escritorio}">🏢 ${COMPANY_DEFAULTS.escritorioLabel} (CONSUMO DIRETO)</option>${optsNome}`;
  document.getElementById('filtro-obra').innerHTML = `<option value="">TODAS AS OBRAS</option><option value="${COMPANY_DEFAULTS.estoqueGeral}">${COMPANY_DEFAULTS.estoqueLabel}</option>${optsNome}`;
  document.getElementById('dist-obra').innerHTML = opts;
  document.getElementById('obras-filtro-obra').innerHTML = `<option value="">Todas as obras</option>${opts}`;
}
