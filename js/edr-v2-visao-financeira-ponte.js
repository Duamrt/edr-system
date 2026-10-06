/*
 * Ponte de leitura entre loader, modelo, estado e avisos de folha.
 * criar({ obterIdentidade, dados, modelo, estado, folha, agora?, filtroInicial? })
 * retorna carregar(), setFiltro(), ler(), assinar() e invalidar().
 * O envelope publica snapshot e visao juntos, sem DOM ou persistencia operacional.
 * obter() cria a instancia de navegador somente no primeiro uso.
 */
(function (root, factory) {
  'use strict';
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FinanceiroVisaoPonte = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const CODIGOS = new Set(['LEITURA_FALHOU', 'LEITURA_OBSOLETA', 'EMPRESA_INVALIDA',
    'IDENTIDADE_SNAPSHOT_INVALIDA', 'SNAPSHOT_INVALIDO', 'MODELO_INVALIDO', 'REFERENCIA_LEITURA_INVALIDA']);
  function erro(codigo) {
    return Object.assign(new Error('Consulta financeira nao publicada.'), { code: codigo });
  }
  function identidade(valor) {
    if (!valor || typeof valor !== 'object') return null;
    if ((valor.companyId != null && valor.company_id != null && valor.companyId !== valor.company_id) ||
        (valor.atorId != null && valor.ator_id != null && valor.atorId !== valor.ator_id)) return null;
    const companyId = valor.companyId == null ? valor.company_id : valor.companyId;
    const atorId = valor.atorId == null ? valor.ator_id : valor.atorId;
    if (typeof companyId !== 'string' || !companyId.trim() || typeof atorId !== 'string' || !atorId.trim() || valor.perfil !== 'admin') return null;
    return { companyId, atorId, perfil: 'admin' };
  }
  function mesma(a, b) {
    return !!a && !!b && a.companyId === b.companyId && a.atorId === b.atorId && a.perfil === b.perfil;
  }
  function objeto(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function copiar(v) {
    if (Array.isArray(v)) return v.map(copiar);
    if (objeto(v)) return Object.fromEntries(Object.entries(v).map(([k, valor]) => [k, copiar(valor)]));
    return v; // Preserva as funcoes do adapter DRE, que ja captura seu contexto privado.
  }
  function congelar(v) {
    if (v && typeof v === 'object' && !Object.isFrozen(v)) {
      Object.values(v).forEach(congelar);
      Object.freeze(v);
    }
    return v;
  }
  function codigoPublico(e) {
    return e && CODIGOS.has(e.codigo) ? e.codigo : 'LEITURA_FALHOU';
  }
  function criar(deps) {
    if (!deps || typeof deps.obterIdentidade !== 'function' || typeof deps.dados?.carregar !== 'function' ||
        typeof deps.estado?.criar !== 'function' || typeof deps.modelo?.construir !== 'function' ||
        typeof deps.modelo?.normalizarFiltro !== 'function' || typeof deps.folha?.avaliar !== 'function') {
      throw new TypeError('Dependencias da ponte financeira incompletas.');
    }
    const agora = deps.agora || (() => new Date());
    if (typeof agora !== 'function') throw new TypeError('Relogio de leitura invalido.');
    const observadores = new Set(), preparados = new WeakMap(), invocacoes = [];
    let geracao = 0, emissao = 0, coordenador;
    let envelope = congelar({ fase: 'inicial', filtro: deps.modelo.normalizarFiltro(deps.filtroInicial),
      visao: null, snapshot: null, folha: null, consultadoEm: null, erro: null });
    function atual() { return identidade(deps.obterIdentidade()); }
    function vigente(pedido) {
      if (!pedido || pedido.geracao !== geracao || !mesma(pedido.identidade, atual())) throw erro('LEITURA_OBSOLETA');
    }
    async function carregarDados() {
      const pedido = invocacoes[invocacoes.length - 1];
      vigente(pedido);
      const base = await deps.dados.carregar();
      vigente(pedido);
      if (!objeto(base)) throw erro('SNAPSHOT_INVALIDO');
      if (!mesma(pedido.identidade, identidade(base))) throw erro('IDENTIDADE_SNAPSHOT_INVALIDA');
      const snapshot = copiar(base);
      try { snapshot.consultadoEm = Date.prototype.toISOString.call(agora()); }
      catch (_) { throw erro('REFERENCIA_LEITURA_INVALIDA'); }
      vigente(pedido);
      return congelar(snapshot);
    }
    function construir(snapshot, filtro) {
      const dono = identidade(snapshot), versao = geracao;
      if (!mesma(dono, atual())) throw erro('LEITURA_OBSOLETA');
      const visao = deps.modelo.construir(snapshot, filtro);
      if (!objeto(visao)) throw erro('MODELO_INVALIDO');
      let folha;
      try {
        folha = deps.folha.avaliar(snapshot, filtro);
        if (!objeto(folha)) throw erro('FOLHA_INDISPONIVEL');
        folha = congelar(copiar(folha));
      } catch (_) { folha = congelar({ estado: 'nao_avaliado', cobertura: 'indisponivel',
        filtro: copiar(filtro), obras: [], comprovaPagamento: false, coberturaDias: 'nao_verificada',
        motivos: [{ codigo: 'FOLHA_INDISPONIVEL', severidade: 'nao_avaliado', texto: 'Avisos de folha nao puderam ser avaliados.' }],
        erro: { codigo: 'FOLHA_INDISPONIVEL' } }); }
      if (versao !== geracao || !mesma(dono, atual())) throw erro('LEITURA_OBSOLETA');
      preparados.set(visao, { snapshot, folha, identidade: dono, geracao: versao });
      return visao;
    }
    function publicar(base) {
      if (base.fase === 'invalidada') ++geracao;
      const preparado = base.fase === 'pronta' && preparados.get(base.visao);
      const dono = preparado ? preparado.identidade : atual();
      if (base.fase === 'pronta' && (!preparado || preparado.geracao !== geracao || !mesma(dono, atual()))) {
        coordenador.invalidar();
        return;
      }
      envelope = congelar({ fase: base.fase, filtro: copiar(base.filtro), visao: base.visao,
        snapshot: preparado ? preparado.snapshot : null, folha: preparado ? preparado.folha : null,
        consultadoEm: preparado ? preparado.snapshot.consultadoEm : null,
        erro: base.erro ? { codigo: codigoPublico(base.erro) } : null });
      const rodada = ++emissao;
      for (const fn of observadores) {
        if (rodada !== emissao) break; // Um observador pode mudar filtros ou invalidar.
        if (dono && !mesma(dono, atual())) { coordenador.invalidar(); break; }
        try { fn(envelope); } catch (_) { /* Renderer nao altera confirmacao de dados. */ }
      }
    }
    coordenador = deps.estado.criar({
      obterIdentidade: atual, dados: { carregar: carregarDados },
      modelo: { normalizarFiltro: f => deps.modelo.normalizarFiltro(f), construir },
      filtroInicial: deps.filtroInicial
    });
    coordenador.assinar(publicar);
    function ler() { coordenador.ler(); return envelope; }
    function carregar() {
      const pedido = { geracao: ++geracao, identidade: atual() };
      invocacoes.push(pedido);
      try { return coordenador.carregar().then(() => ler()); }
      finally { invocacoes.pop(); }
    }
    function setFiltro(alteracao) {
      coordenador.setFiltro(alteracao);
      return ler();
    }
    function invalidar() { ++geracao; coordenador.invalidar(); return ler(); }
    function assinar(fn) {
      if (typeof fn !== 'function') throw new TypeError('Observador da ponte invalido.');
      observadores.add(fn);
      try { fn(ler()); } catch (_) { /* Mesmo isolamento dos demais eventos. */ }
      return () => observadores.delete(fn);
    }
    return Object.freeze({ carregar, setFiltro, ler, assinar, invalidar });
  }

  function identidadeNavegador() {
    // Auth atribui usuarioAtual.id = data.user.id no login e no refresh.
    // A ponte nao decodifica JWT nem le localStorage ou imprime credenciais.
    const company = typeof _companyId !== 'undefined' ? _companyId : null;
    const usuario = typeof usuarioAtual !== 'undefined' ? usuarioAtual : null;
    const autenticado = typeof _supabaseToken !== 'undefined' && !!_supabaseToken;
    return autenticado ? identidade({ companyId: company, atorId: usuario?.id, perfil: usuario?.perfil }) : null;
  }
  let padrao = null;
  function obter() {
    if (padrao) return padrao;
    if (!root?.FinanceiroVisaoDados || !root?.FinanceiroVisaoModelo || !root?.FinanceiroVisaoEstado ||
        !root?.FinanceiroVisaoFolha || typeof root?.DREModule?.criarContextoLeitura !== 'function') {
      throw new TypeError('Modulos da visao financeira ainda indisponiveis.');
    }
    const dados = root.FinanceiroVisaoDados.criar({
      obterIdentidade: identidadeNavegador,
      obterPagina: (t, q) => {
        if (typeof sbGet !== 'function') throw erro('LEITURA_FALHOU');
        return sbGet(t, q, { throwOnError: true });
      },
      carregarLedger: () => {
        if (typeof caixaProspectivoCarregar !== 'function') throw erro('LEITURA_FALHOU');
        return caixaProspectivoCarregar();
      },
      criarDre: snapshot => root.DREModule.criarContextoLeitura(snapshot),
      obrasInternas: Array.isArray(root.OBRAS_INTERNAS) ? root.OBRAS_INTERNAS : []
    });
    padrao = criar({ obterIdentidade: identidadeNavegador, dados, modelo: root.FinanceiroVisaoModelo,
      estado: root.FinanceiroVisaoEstado, folha: root.FinanceiroVisaoFolha });
    return padrao;
  }
  return Object.freeze({ criar, obter, carregar: () => obter().carregar(), setFiltro: f => obter().setFiltro(f),
    ler: () => obter().ler(), assinar: fn => obter().assinar(fn), invalidar: () => obter().invalidar() });
});
