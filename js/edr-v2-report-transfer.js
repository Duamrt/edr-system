// Relatorios sao entregues uma vez, em memoria, pela aba autenticada.
// Nenhum dado do relatorio ou token de acesso vai para URL/storage.
(function (global) {
  'use strict';
  const pending = new Map();
  const ttl = 60000;
  let epoch = 0;

  function session() {
    try {
      const auth = JSON.parse(localStorage.getItem('edr_auth') || 'null');
      if (!auth?.access_token || !auth.user?.id) return null;
      if (auth.expires_at && Date.now() >= auth.expires_at) return null;
      let sessionId = null;
      try {
        const part = auth.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        const claims = JSON.parse(atob(part));
        if (typeof claims.session_id === 'string') sessionId = claims.session_id;
      } catch (_) { /* Sessoes legadas: revogacao explicita e eventos de storage. */ }
      return { userId: String(auth.user.id), sessionId };
    } catch (_) { return null; }
  }

  function matches(identity) {
    const current = session();
    return !!identity && !!current && current.userId === identity.userId && current.sessionId === identity.sessionId;
  }

  function capture() {
    const identity = session();
    if (!identity || typeof _companyId === 'undefined' || !_companyId ||
        typeof usuarioAtual === 'undefined' || usuarioAtual?.id !== identity.userId) return null;
    previous = identity;
    return { ...identity, companyId: _companyId, epoch };
  }

  function matchesSource(owner) {
    const current = capture();
    return !!current && matches(owner) && current.companyId === owner.companyId && current.epoch === owner.epoch;
  }

  function clear() {
    epoch++;
    pending.clear();
    // Remover apenas o snapshot legado; nunca consumir dados antigos sem dono.
    try { localStorage.removeItem('edr-relatorio-dados'); } catch (_) {}
  }

  function open(data, owner) {
    if (!matchesSource(owner)) return false;
    const id = crypto.randomUUID();
    pending.set(id, { data, owner, until: Date.now() + ttl });
    let child;
    try { child = global.open('relatorio-obra.html#edr-report=' + id, '_blank'); } catch (_) {}
    if (!child) { pending.delete(id); return false; }
    setTimeout(() => pending.delete(id), ttl);
    return true;
  }

  function consume(id) {
    const entry = pending.get(id);
    pending.delete(id); // Consumo unico, inclusive quando a sessao deixou de valer.
    if (!entry || Date.now() >= entry.until || !matchesSource(entry.owner)) return null;
    return { data: entry.data, owner: entry.owner };
  }

  function watch(owner, invalidate, source) {
    let alive = true;
    const valid = () => {
      if (!matches(owner)) return false;
      try {
        return !source || source.closed || source.EdrReportTransfer?.matchesSource(owner) === true;
      } catch (_) { return false; }
    };
    const revoke = () => {
      if (!alive) return;
      alive = false;
      clearInterval(timer);
      invalidate();
    };
    const check = () => { if (!valid()) revoke(); };
    const storage = event => {
      if (event.key === null || (event.key === 'edr_auth' && !event.newValue)) revoke();
      else if (event.key === 'edr_auth') check();
    };
    const timer = setInterval(check, 1000);
    global.addEventListener('storage', storage);
    global.addEventListener('focus', check);
    global.addEventListener('pageshow', check);
    global.addEventListener('beforeprint', check);
    global.addEventListener('pagehide', revoke);
    document.addEventListener('visibilitychange', check);
    check();
    return revoke;
  }

  clear();
  let previous = session();
  global.addEventListener('storage', event => {
    if (event.key !== null && event.key !== 'edr_auth') return;
    const current = session();
    if (!event.newValue || !current || !previous || current.userId !== previous.userId || current.sessionId !== previous.sessionId) clear();
    previous = current;
  });
  global.EdrReportTransfer = Object.freeze({ capture, open, consume, clear, matchesSource, watch });
})(window);
