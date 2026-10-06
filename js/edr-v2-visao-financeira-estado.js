// Coordena somente leituras e filtros da visao financeira.
// Nao persiste saldos, nao grava dados e nao reutiliza resultados de outra identidade.
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FinanceiroVisaoEstado = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function identidade(valor) {
    if (!valor) return null;
    const companyId = valor.companyId || valor.company_id;
    const atorId = valor.atorId || valor.ator_id;
    const perfil = valor.perfil;
    return companyId && atorId && perfil ? { companyId, atorId, perfil } : null;
  }
  function mesma(a, b) {
    return !!a && !!b && a.companyId === b.companyId && a.atorId === b.atorId && a.perfil === b.perfil;
  }
  function congelar(valor) {
    if (valor && typeof valor === 'object' && !Object.isFrozen(valor)) {
      Object.values(valor).forEach(congelar);
      Object.freeze(valor);
    }
    return valor;
  }
  function criar(deps) {
    if (!deps || typeof deps.obterIdentidade !== 'function' ||
        typeof deps.dados?.carregar !== 'function' || typeof deps.modelo?.construir !== 'function' ||
        typeof deps.modelo?.normalizarFiltro !== 'function') throw new TypeError('Dependencias de leitura obrigatorias.');
    const modelo = deps.modelo;
    const observadores = new Set();
    let geracao = 0, referencia = null, snapshot = null;
    let filtro = modelo.normalizarFiltro(deps.filtroInicial);
    let estado = congelar({ fase: 'inicial', filtro, visao: null, erro: null });
    function publicar(fase, visao, erro) {
      estado = congelar({ fase, filtro: { ...filtro }, visao, erro: erro || null });
      for (const fn of observadores) {
        try { fn(estado); } catch (e) {
          // Uma falha do renderer nao transforma uma leitura confirmada em falha de dados.
          try { if (typeof deps.erroObservador === 'function') deps.erroObservador(e); } catch (_) {}
        }
      }
      return estado;
    }
    function limpar(fase) {
      ++geracao;
      snapshot = null;
      referencia = null;
      filtro = modelo.normalizarFiltro();
      return publicar(fase || 'inicial', null);
    }
    function conferirIdentidade() {
      const atual = identidade(deps.obterIdentidade());
      if (referencia && !mesma(referencia, atual)) limpar('invalidada');
      return atual;
    }
    function ler() { conferirIdentidade(); return estado; }
    function setFiltro(alteracao) {
      conferirIdentidade();
      const novo = modelo.normalizarFiltro({ ...filtro, ...alteracao });
      const visao = snapshot ? modelo.construir(snapshot, novo) : null;
      filtro = novo;
      return publicar(estado.fase, visao, estado.erro);
    }
    async function carregar() {
      const atual = conferirIdentidade();
      if (!atual) return limpar('invalidada');
      referencia = atual;
      const leitura = ++geracao;
      snapshot = null;
      publicar('carregando', null);
      try {
        const dados = await deps.dados.carregar();
        if (leitura !== geracao) return ler();
        if (!mesma(atual, identidade(deps.obterIdentidade()))) return limpar('invalidada');
        if (!dados || dados.companyId !== atual.companyId) throw Object.assign(new Error(), { code: 'EMPRESA_INVALIDA' });
        const visao = modelo.construir(dados, filtro);
        snapshot = dados;
        return publicar('pronta', visao);
      } catch (e) {
        if (leitura !== geracao) return ler();
        if (!mesma(atual, identidade(deps.obterIdentidade()))) return limpar('invalidada');
        snapshot = null;
        return publicar('erro', null, { codigo: e?.code || 'LEITURA_FALHOU' });
      }
    }
    function assinar(fn) {
      if (typeof fn !== 'function') throw new TypeError('Observador invalido.');
      observadores.add(fn);
      try { fn(ler()); } catch (e) { observadores.delete(fn); throw e; }
      return () => observadores.delete(fn);
    }
    return Object.freeze({ ler, setFiltro, carregar, invalidar: () => limpar('invalidada'), assinar });
  }
  return Object.freeze({ criar });
});
