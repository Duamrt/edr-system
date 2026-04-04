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

// Modal de confirmação estilizado — substitui confirm() nativo
function confirmar(titulo, mensagem) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(8px);animation:overlayIn 0.2s ease;';
    const box = document.createElement('div');
    box.style.cssText = 'background:#111113;border:1px solid rgba(255,255,255,0.06);border-radius:16px;padding:28px 26px;width:100%;max-width:420px;box-shadow:0 40px 80px rgba(0,0,0,.7);animation:modalIn 0.25s ease;';
    box.innerHTML = `
      <div style="font-family:'Rajdhani',sans-serif;font-weight:700;font-size:14px;color:#f0f0f0;letter-spacing:2px;text-transform:uppercase;margin-bottom:14px;">${titulo}</div>
      <div style="font-size:13px;color:#8a8a8a;line-height:1.7;margin-bottom:22px;white-space:pre-line;">${mensagem}</div>
      <div style="display:flex;gap:10px;">
        <button id="_confirmar-cancel" style="flex:1;padding:12px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;color:#8a8a8a;font-weight:600;font-size:12px;cursor:pointer;font-family:'Rajdhani',sans-serif;letter-spacing:1px;text-transform:uppercase;transition:all .2s;">CANCELAR</button>
        <button id="_confirmar-ok" style="flex:1;padding:12px;background:linear-gradient(135deg,#22c55e,#16a34a);border:none;border-radius:10px;color:#fff;font-weight:700;font-size:12px;cursor:pointer;font-family:'Rajdhani',sans-serif;letter-spacing:1px;text-transform:uppercase;transition:all .2s;box-shadow:0 4px 16px rgba(34,197,94,0.25);">CONFIRMAR</button>
      </div>`;
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    const fechar = (resultado) => { overlay.remove(); resolve(resultado); };
    box.querySelector('#_confirmar-ok').onclick = () => fechar(true);
    box.querySelector('#_confirmar-cancel').onclick = () => fechar(false);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) fechar(false); });
    document.addEventListener('keydown', function _esc(e) { if (e.key === 'Escape') { document.removeEventListener('keydown', _esc); fechar(false); } });
    box.querySelector('#_confirmar-ok').focus();
  });
}

function populateSelects() {
  const pool = mostandoArquivadas ? obrasArquivadas : obras;
  const opts = pool.map(o => `<option value="${o.id}">${esc(o.nome)}</option>`).join('');
  // Obras ativas apenas (arquivadas nunca aparecem no form NF, distrib ou lanç)
  const optsNome = obras.map(o => `<option value="${esc(o.nome)}">${esc(o.nome)}</option>`).join('');
  document.getElementById('f-obra').innerHTML = `<option value="${COMPANY_DEFAULTS.estoqueGeral}">📦 ${COMPANY_DEFAULTS.estoqueLabel} (ESTOQUE)</option><option value="${COMPANY_DEFAULTS.escritorio}">🏢 ${COMPANY_DEFAULTS.escritorioLabel} (CONSUMO DIRETO)</option>${optsNome}`;
  document.getElementById('filtro-obra').innerHTML = `<option value="">TODAS AS OBRAS</option><option value="${COMPANY_DEFAULTS.estoqueGeral}">${COMPANY_DEFAULTS.estoqueLabel}</option>${optsNome}`;
  document.getElementById('dist-obra').innerHTML = opts;
  document.getElementById('obras-filtro-obra').innerHTML = `<option value="">Todas as obras</option>${opts}`;
}
