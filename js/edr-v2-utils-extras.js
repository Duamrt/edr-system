// ══════════════════════════════════════════════════════════════
// EDR V2 — Utilitarios compartilhados extras
// Funcoes stateless que podem ser usadas por qualquer modulo
// ══════════════════════════════════════════════════════════════

// Data de hoje no formato ISO (YYYY-MM-DD)
function hojeISO() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }

// Escape HTML (previne XSS)
function esc(s) { if (!s) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

// Normaliza texto (remove acentos, lowercase) — usado em buscas/filtros
function norm(s) { return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''); }

// Parse itens JSON de nota fiscal
function parseItens(n) { try { return JSON.parse(n.itens||'[]'); } catch(e) { console.error('parseItens JSON inválido:', e); return []; } }

// Formata numero como moeda BR: 1234.5 → "1.234,50"
function fmtN(n) {
  return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

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
