// ══════════════════════════════════════════════════════════════
// EDR V2 — Utilitarios compartilhados extras
// Funcoes stateless que podem ser usadas por qualquer modulo
// ══════════════════════════════════════════════════════════════

// Data de hoje no formato ISO (YYYY-MM-DD)
function hojeISO() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }

// Escape HTML (previne XSS)
function esc(s) { if (!s) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

// Normaliza texto (remove acentos, lowercase) — usado em buscas/filtros
function norm(s) { if (!s) return ''; return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''); }

// Parse itens JSON de nota fiscal
function parseItens(n) { try { return JSON.parse(n.itens||'[]'); } catch(e) { console.error('parseItens JSON inválido:', e); return []; } }

// Formata valor como moeda BRL: 1234.5 → "R$ 1.234,50"
function fmt(v) { return Number(v||0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }

// Formata moeda com opção abreviada: 15000 → "R$ 15.0k"
function fmtR(v, abrev = false) {
  const n = Number(v) || 0;
  if (abrev && Math.abs(n) >= 1000) return 'R$ ' + (n/1000).toFixed(1) + 'k';
  return n.toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
}

// Formata data ISO → DD/MM/YYYY
function fmtData(iso) { if (!iso) return '—'; return iso.split('T')[0].split('-').reverse().join('/'); }

// Formata numero como moeda BR: 1234.5 → "1.234,50"
function fmtN(n) {
  return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Mascara CNPJ
function maskCNPJ(el) { let v = el.value.replace(/\D/g,'').slice(0,14); if(v.length>12)v=v.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2}).*/,'$1.$2.$3/$4-$5'); else if(v.length>8)v=v.replace(/^(\d{2})(\d{3})(\d{3})(\d*)/,'$1.$2.$3/$4'); else if(v.length>5)v=v.replace(/^(\d{2})(\d{3})(\d*)/,'$1.$2.$3'); else if(v.length>2)v=v.replace(/^(\d{2})(\d*)/,'$1.$2'); el.value = v; }

// Setar data de hoje nos campos do form NF
function setToday() { const d = hojeISO(); const el1 = document.getElementById('f-emissao'); const el2 = document.getElementById('f-recebimento'); if (el1) el1.value = d; if (el2) el2.value = d; }

// Popular selects de obras
function populateSelects() {
  const opts = obras.map(o => `<option value="${o.id}">${esc(o.nome)}</option>`).join('');
  const optsNome = obras.map(o => `<option value="${esc(o.nome)}">${esc(o.nome)}</option>`).join('');
  const fObra = document.getElementById('f-obra');
  if (fObra) fObra.innerHTML = `<option value="${COMPANY_DEFAULTS.estoqueGeral}">📦 ${COMPANY_DEFAULTS.estoqueLabel} (ESTOQUE)</option><option value="${COMPANY_DEFAULTS.escritorio}">🏢 ${COMPANY_DEFAULTS.escritorioLabel} (CONSUMO DIRETO)</option>${optsNome}`;
  const filtroObra = document.getElementById('filtro-obra');
  if (filtroObra) filtroObra.innerHTML = `<option value="">TODAS AS OBRAS</option><option value="${COMPANY_DEFAULTS.estoqueGeral}">${COMPANY_DEFAULTS.estoqueLabel}</option>${optsNome}`;
  const distObra = document.getElementById('dist-obra');
  if (distObra) distObra.innerHTML = opts;
  const obrasFiltro = document.getElementById('obras-filtro-obra');
  if (obrasFiltro) obrasFiltro.innerHTML = `<option value="">Todas as obras</option>${opts}`;
  const estoqueFiltro = document.getElementById('estoque-filtro-obra');
  if (estoqueFiltro) estoqueFiltro.innerHTML = `<option value="">ALMOXARIFADO</option>${optsNome}`;
}

// Variavel de controle de arquivadas
let mostandoArquivadas = false;

// Converte valor monetario pra texto por extenso
// Ex: 1500.50 → "um mil e quinhentos reais e cinquenta centavos"
function valorPorExtenso(valor) {
  const unidades = ['','um','dois','tr\u00EAs','quatro','cinco','seis','sete','oito','nove'];
  const especiais = ['dez','onze','doze','treze','quatorze','quinze','dezesseis','dezessete','dezoito','dezenove'];
  const dezenas = ['','','vinte','trinta','quarenta','cinquenta','sessenta','setenta','oitenta','noventa'];
  const centenas = ['','cento','duzentos','trezentos','quatrocentos','quinhentos','seiscentos','setecentos','oitocentos','novecentos'];

  function grupoExtenso(n) {
    if (n === 0) return '';
    if (n === 100) return 'cem';
    let r = '';
    const c = Math.floor(n / 100), resto = n % 100;
    if (c > 0) r += centenas[c];
    if (resto > 0) {
      if (r) r += ' e ';
      if (resto < 10) r += unidades[resto];
      else if (resto < 20) r += especiais[resto - 10];
      else { r += dezenas[Math.floor(resto / 10)]; if (resto % 10) r += ' e ' + unidades[resto % 10]; }
    }
    return r;
  }

  const v = Math.abs(Number(valor));
  const inteiro = Math.floor(v);
  const centavos = Math.round((v - inteiro) * 100);
  if (inteiro === 0 && centavos === 0) return 'zero reais';
  let r = '';
  const milhares = Math.floor(inteiro / 1000);
  const resto = inteiro % 1000;
  if (milhares > 0) {
    r += grupoExtenso(milhares) + ' mil';
    if (resto > 0) r += (resto < 100 ? ' e ' : ' ');
  }
  if (resto > 0) r += grupoExtenso(resto);
  if (inteiro > 0) r += inteiro === 1 ? ' real' : ' reais';
  if (centavos > 0) {
    if (inteiro > 0) r += ' e ';
    r += grupoExtenso(centavos) + (centavos === 1 ? ' centavo' : ' centavos');
  }
  return r;
}
