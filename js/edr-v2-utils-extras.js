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
  if (fObra) fObra.innerHTML = `<option value="${COMPANY_DEFAULTS.estoqueGeral}">${COMPANY_DEFAULTS.estoqueLabel} (ESTOQUE)</option><option value="${COMPANY_DEFAULTS.escritorio}">${COMPANY_DEFAULTS.escritorioLabel} (CONSUMO DIRETO)</option>${optsNome}`;
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

// Proximo codigo livre no catalogo de materiais
function _proxCodigoCatalogo() {
  const usados = new Set(catalogoMateriais.map(m => parseInt(m.codigo) || 0));
  for (let i = 1; i <= usados.size + 1; i++) {
    if (!usados.has(i)) return String(i).padStart(6, '0');
  }
  return String(usados.size + 1).padStart(6, '0');
}

// Cadastro rapido de material (modal compartilhado — NF, estoque, importar)
let _crOrigem = null;
function cadastroRapidoMaterial(nomeDigitado, origem) {
  _crOrigem = origem;
  document.querySelectorAll('.autocomplete-list').forEach(l => l.classList.add('hidden'));
  let modal = document.getElementById('modal-cadastro-rapido');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modal-cadastro-rapido';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.75);backdrop-filter:blur(6px);';
    modal.innerHTML = `
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:24px;width:min(420px,94vw);box-shadow:0 20px 60px rgba(0,0,0,.3);">
        <div style="font-size:14px;font-weight:700;color:var(--primary);margin-bottom:4px;">+ CADASTRAR NOVO MATERIAL</div>
        <div style="font-size:12px;color:var(--text-secondary);margin-bottom:16px;">Item não encontrado no catálogo.</div>
        <div id="cr-similares" style="display:none;margin-bottom:12px;border:1px solid rgba(251,191,36,0.3);border-radius:8px;padding:10px 12px;background:rgba(251,191,36,0.06);">
          <div style="font-size:11px;font-weight:700;color:#d97706;margin-bottom:6px;">Itens parecidos já cadastrados:</div>
          <div id="cr-similares-lista"></div>
        </div>
        <div style="margin-bottom:12px;">
          <label style="font-size:11px;color:var(--text-secondary);">NOME DO MATERIAL *</label>
          <input id="cr-nome" type="text" autocomplete="off" class="form-input" style="width:100%;box-sizing:border-box;margin-top:4px;" oninput="this.value=this.value.toUpperCase();crMostrarSimilares(this.value)">
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
          <div>
            <label style="font-size:11px;color:var(--text-secondary);">UNIDADE</label>
            <select id="cr-unidade" class="form-select" style="width:100%;margin-top:4px;">
              <option value="UN">UN</option><option value="m²">m²</option><option value="m³">m³</option><option value="m">m</option><option value="kg">kg</option><option value="saco">saco</option><option value="rolo">rolo</option><option value="barra">barra</option><option value="gl">gl</option><option value="cx">cx</option><option value="par">par</option><option value="ml">ml</option>
            </select>
          </div>
          <div>
            <label style="font-size:11px;color:var(--text-secondary);">CATEGORIA</label>
            <select id="cr-categoria" class="form-select" style="width:100%;margin-top:4px;">
              <option value="">— selecione —</option>
              ${typeof ETAPAS !== 'undefined' ? ETAPAS.map(e => '<option value="'+e.key+'">'+e.lb+'</option>').join('') : ''}
            </select>
          </div>
        </div>
        <div id="cr-aviso" style="display:none;font-size:11px;color:#d97706;margin-bottom:10px;padding:8px;background:rgba(251,191,36,0.08);border-radius:6px;"></div>
        <div style="display:flex;gap:10px;">
          <button onclick="fecharCadastroRapido()" class="btn" style="flex:1;">CANCELAR</button>
          <button id="cr-btn-salvar" onclick="salvarCadastroRapido()" class="btn btn-primary" style="flex:2;">CADASTRAR E USAR</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
  }
  document.getElementById('cr-nome').value = nomeDigitado;
  document.getElementById('cr-unidade').value = 'UN';
  document.getElementById('cr-categoria').value = '';
  document.getElementById('cr-aviso').style.display = 'none';
  document.getElementById('cr-similares').style.display = 'none';
  modal.style.display = 'flex';
  setTimeout(() => { const n = document.getElementById('cr-nome'); n.focus(); n.select(); crMostrarSimilares(nomeDigitado); }, 150);
}

function fecharCadastroRapido() {
  const m = document.getElementById('modal-cadastro-rapido'); if (m) m.style.display = 'none';
}

function crMostrarSimilares(val) {
  const painel = document.getElementById('cr-similares');
  const lista = document.getElementById('cr-similares-lista');
  if (!painel || !lista) return;
  if (!val || val.length < 3) { painel.style.display = 'none'; return; }
  const tokens = norm(val).split(/\s+/).filter(t => t.length >= 3);
  const similares = catalogoMateriais.filter(m => { const nm = norm(m.nome||''); return tokens.some(t => nm.includes(t)); }).slice(0, 4);
  if (!similares.length) { painel.style.display = 'none'; return; }
  lista.innerHTML = similares.map(m =>
    `<div onclick="crUsarExistente('${esc(m.nome)}','${esc(m.codigo)}')"
       style="display:flex;align-items:center;gap:8px;padding:5px 8px;border-radius:6px;cursor:pointer;border:1px solid var(--border);margin-bottom:3px;">
      <span style="font-family:monospace;font-size:10px;color:var(--primary);padding:2px 6px;border-radius:4px;">${m.codigo}</span>
      <span style="font-size:12px;color:var(--text-primary);flex:1;">${esc(m.nome)}</span>
      <span style="font-size:10px;color:var(--primary);font-weight:700;">USAR</span>
    </div>`
  ).join('');
  painel.style.display = 'block';
}

function crUsarExistente(nome, codigo) {
  fecharCadastroRapido();
  if (typeof showToast === 'function') showToast('Usando ' + codigo + ' — ' + nome);
  const m = catalogoMateriais.find(x => x.codigo === codigo);
  if (_crOrigem === 'nf') {
    document.getElementById('i-desc').value = nome;
    if (typeof classificarItemSync === 'function') {
      const res = classificarItemSync(nome, codigo);
      currentCredito = res?.credito ?? null;
      currentCodigo = codigo || null;
    }
    if (m?.unidade) document.getElementById('i-unidade').value = m.unidade;
    setTimeout(() => document.getElementById('i-qtd')?.focus(), 100);
  } else if (_crOrigem === 'estoque') {
    document.getElementById('entrada-desc').value = nome;
    if (m?.unidade) document.getElementById('entrada-unidade').value = m.unidade;
    setTimeout(() => document.getElementById('entrada-qtd')?.focus(), 100);
  }
}

async function salvarCadastroRapido() {
  const nome = (document.getElementById('cr-nome').value||'').trim().toUpperCase();
  const unidade = document.getElementById('cr-unidade').value;
  const categoria = document.getElementById('cr-categoria').value;
  const aviso = document.getElementById('cr-aviso');
  if (!nome || nome.length < 2) { aviso.textContent = 'Informe o nome do material.'; aviso.style.display='block'; return; }
  const existe = catalogoMateriais.find(m => (m.nome||'').toUpperCase() === nome);
  if (existe) { aviso.textContent = 'Já existe: ' + existe.codigo + ' — ' + existe.nome; aviso.style.display='block'; return; }
  const btn = document.getElementById('cr-btn-salvar');
  btn.disabled = true; btn.textContent = 'SALVANDO...';
  try {
    const codigo = _proxCodigoCatalogo();
    const saved = await sbPost('materiais', { codigo, nome, unidade, categoria });
    if (saved) {
      catalogoMateriais.push(saved);
      catalogoMateriais.sort((a,b) => (a.codigo||'').localeCompare(b.codigo||''));
    }
    fecharCadastroRapido();
    if (typeof showToast === 'function') showToast(codigo + ' — ' + nome + ' cadastrado!');
    crUsarExistente(nome, codigo);
  } catch(e) { aviso.textContent = 'Erro ao salvar. Tente novamente.'; aviso.style.display='block'; }
  btn.disabled = false; btn.textContent = 'CADASTRAR E USAR';
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
