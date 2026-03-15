async function sbGet(t, q='') {
  if (MODO_DEMO) return _demoFilter(t, q);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${t}${q}`, { headers: getHdrs(), signal: ctrl.signal });
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
  if (MODO_DEMO) { const novo = { id:'demo_'+_demoId(), ...b }; if(DEMO_DATA[t]) DEMO_DATA[t].push(novo); return [novo]; }
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${t}`, { method: 'POST', headers: getHdrs(), body: JSON.stringify(b) }); if (!r.ok) throw new Error(await r.text()); return r.json();
}
// POST sem retorno (return=minimal) — pra inserts em massa
async function sbPostMinimal(t, b) {
  if (Array.isArray(b)) b.forEach(item => _addCriadoPor(t, item)); else _addCriadoPor(t, b);
  if (MODO_DEMO) { const arr = Array.isArray(b)?b:[b]; arr.forEach(item => { if(DEMO_DATA[t]) DEMO_DATA[t].push({id:'demo_'+_demoId(),...item}); }); return true; }
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${t}`, { method: 'POST', headers: getHdrs('return=minimal'), body: JSON.stringify(b) }); if (!r.ok) throw new Error(await r.text()); return true;
}
async function sbPatch(t, q, b) {
  if (MODO_DEMO) { const eqs=[...(q||'').matchAll(/[?&](\w+)=eq\.([^&]+)/g)]; const arr=DEMO_DATA[t]||[]; for(const[,c,v] of eqs){const i=arr.findIndex(r=>String(r[c])===String(decodeURIComponent(v)));if(i>=0)Object.assign(arr[i],b);} return [b]; }
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${t}${q}`, { method: 'PATCH', headers: getHdrs(), body: JSON.stringify(b) }); if (!r.ok) throw new Error(await r.text()); return r.json();
}
async function sbDelete(t, q) {
  if (MODO_DEMO) { const eqs=[...(q||'').matchAll(/[?&](\w+)=eq\.([^&]+)/g)]; const arr=DEMO_DATA[t]||[]; for(const[,c,v] of eqs){const i=arr.findIndex(r=>String(r[c])===String(decodeURIComponent(v)));if(i>=0)arr.splice(i,1);} return true; }
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${t}${q}`, { method: 'DELETE', headers: getHdrs() }); return r.ok;
}
