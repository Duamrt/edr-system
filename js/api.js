// ══════════════════════════════════════════
// API — Camada centralizada Supabase (Multi-Tenant)
// Toda query filtra automaticamente por company_id
// ══════════════════════════════════════════

// Company ID do usuario logado (setado no login)
let _companyId = null;

// Tabelas que NÃO recebem filtro de company_id
const _TABELAS_SEM_TENANT = ['companies', 'company_users', 'usuarios'];
// Tabelas que incluem registros globais (company_id IS NULL) + da empresa
const _TABELAS_COM_GLOBAL = ['materiais'];

function _addCompanyFilter(tabela, query) {
  if (_TABELAS_SEM_TENANT.includes(tabela)) return query;
  if (!_companyId) {
    const sep = query.includes('?') ? '&' : '?';
    return query + sep + 'company_id=eq.00000000-0000-0000-0000-000000000000';
  }
  const sep = query.includes('?') ? '&' : '?';
  // Materiais: trazer globais (NULL) + da empresa
  if (_TABELAS_COM_GLOBAL.includes(tabela)) {
    return query + sep + 'or=(company_id.eq.' + _companyId + ',company_id.is.null)';
  }
  return query + sep + 'company_id=eq.' + _companyId;
}

function _addCompanyToBody(tabela, body) {
  if (_TABELAS_SEM_TENANT.includes(tabela) || !_companyId) return body;
  if (Array.isArray(body)) return body.map(b => ({ company_id: _companyId, ...b }));
  return { company_id: _companyId, ...body };
}

async function sbGet(t, q='') {
  if (MODO_DEMO) return _demoFilter(t, q);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${t}${_addCompanyFilter(t, q)}`, { headers: getHdrs(), signal: ctrl.signal });
    clearTimeout(timer);
    return r.json();
  } catch(e) { clearTimeout(timer); throw e; }
}

const _TABELAS_RASTREIO = ['lancamentos','notas_fiscais','distribuicoes','entradas_diretas','repasses_cef','obra_adicionais','adicional_pagamentos','diarias'];
function _addCriadoPor(t, b) {
  if (_TABELAS_RASTREIO.includes(t) && usuarioAtual?.nome) b.criado_por = usuarioAtual.nome;
  return b;
}

async function sbPost(t, b) {
  _addCriadoPor(t, b);
  b = _addCompanyToBody(t, b);
  if (MODO_DEMO) { const novo = { id:'demo_'+_demoId(), ...b }; if(DEMO_DATA[t]) DEMO_DATA[t].push(novo); return [novo]; }
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${t}`, { method: 'POST', headers: getHdrs(), body: JSON.stringify(b) }); if (!r.ok) throw new Error(await r.text()); return r.json();
}

async function sbPostMinimal(t, b) {
  if (Array.isArray(b)) b.forEach(item => _addCriadoPor(t, item)); else _addCriadoPor(t, b);
  b = _addCompanyToBody(t, b);
  if (MODO_DEMO) { const arr = Array.isArray(b)?b:[b]; arr.forEach(item => { if(DEMO_DATA[t]) DEMO_DATA[t].push({id:'demo_'+_demoId(),...item}); }); return true; }
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${t}`, { method: 'POST', headers: getHdrs('return=minimal'), body: JSON.stringify(b) }); if (!r.ok) throw new Error(await r.text()); return true;
}

async function sbPatch(t, q, b) {
  if (MODO_DEMO) { const eqs=[...(q||'').matchAll(/[?&](\w+)=eq\.([^&]+)/g)]; const arr=DEMO_DATA[t]||[]; for(const[,c,v] of eqs){const i=arr.findIndex(r=>String(r[c])===String(decodeURIComponent(v)));if(i>=0)Object.assign(arr[i],b);} return [b]; }
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${t}${_addCompanyFilter(t, q)}`, { method: 'PATCH', headers: getHdrs(), body: JSON.stringify(b) }); if (!r.ok) throw new Error(await r.text()); return r.json();
}

async function sbDelete(t, q) {
  if (MODO_DEMO) { const eqs=[...(q||'').matchAll(/[?&](\w+)=eq\.([^&]+)/g)]; const arr=DEMO_DATA[t]||[]; for(const[,c,v] of eqs){const i=arr.findIndex(r=>String(r[c])===String(decodeURIComponent(v)));if(i>=0)arr.splice(i,1);} return true; }
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${t}${_addCompanyFilter(t, q)}`, { method: 'DELETE', headers: getHdrs() }); return r.ok;
}

// Carregar company_id do usuario logado
async function loadCompanyId() {
  if (MODO_DEMO) return;
  try {
    const rows = await fetch(`${SUPABASE_URL}/rest/v1/company_users?user_id=eq.${usuarioAtual.id}&select=company_id&limit=1`, { headers: getHdrs() }).then(r => r.json());
    if (rows && rows.length > 0) {
      _companyId = rows[0].company_id;
      // Mostrar nome da empresa no header
      try {
        const cr = await fetch(`${SUPABASE_URL}/rest/v1/companies?id=eq.${_companyId}&select=name`, { headers: getHdrs() }).then(r => r.json());
        const badge = document.getElementById('empresa-badge');
        if (badge && cr && cr[0]) {
          badge.textContent = cr[0].name;
          badge.style.display = 'inline-block';
        }
      } catch(e) {}
    }
  } catch(e) {
    console.warn('Erro ao carregar company_id:', e);
  }
}
