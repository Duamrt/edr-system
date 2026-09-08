// ══════════════════════════════════════════════════════════════════
// EDR System V2 — Modulo: ESTOQUE & MATERIAIS
// Depende: api.js, utils.js, config.js, obras.js (ETAPAS),
//          notas.js (notas), auth.js, menu.js, dashboard.js
// Auditado por: GM (Gemini) — 04/04/2026
// ══════════════════════════════════════════════════════════════════

// ── ESTADO ENCAPSULADO ──────────────────────────────────────────
const EstoqueModule = {
  // Tab ativa
  tab: 'estoque',           // 'estoque' | 'catalogo'

  // Estado do estoque
  ordem: 'az',              // 'az' | 'za' | 'maior' | 'menor'
  filtroObra: '',            // obra selecionada ('' = almoxarifado geral)
  filtroBusca: '',           // texto de busca
  filtroCategoria: null,     // etapa selecionada na sidebar
  filtroEtapas: new Set(),   // etapas selecionadas no dropdown do header (multi)
  filtroNegativos: false,    // chip negativos ativo
  filtroSemCodigo: false,    // chip sem codigo ativo
  page: 0,                  // paginacao (0-indexed)
  pageSize: 50,             // itens por pagina
  viewMode: 'tabela',       // 'cards' | 'tabela' — default TABELA (cards mantido como fallback). Fase 1, ver edr-v2-estoque-tabela.js

  // Estado do catalogo
  catBusca: '',             // busca no catalogo
  catFiltroAuto: false,     // mostrar apenas AUTO pendentes
  catFiltroCats: new Set(), // centros de custo selecionados no filtro (multi)
  catFiltroTipo: 'todos',   // chip de tipo: todos|material|servico|mao_obra|taxa|frete|documento|movimenta|nao_movimenta|saldo_sem_custo|sem_categoria
  catPage: 0,
  catPageSize: 250,         // lote do catalogo (separado do pageSize=50 do estoque; some com "carregar mais" 10x)

  // Dados consolidados (cache local, invalidado a cada render)
  _consolidado: [],          // resultado de consolidarEstoque()
  _valorTotal: 0,            // valor total calculado

  // Catalogo
  catalogoMateriais: [],     // array do catalogo carregado
  _editandoId: null,         // material em edicao

  // Orfaos
  _orfaos: [],

  // Debounce
  _buscaTimer: null,
  _catBuscaTimer: null,
};


// ── REGISTRO NO VIEW REGISTRY ───────────────────────────────────
if (typeof viewRegistry !== 'undefined') {
  viewRegistry.register('estoque', () => {
    if (typeof catalogoMateriais !== 'undefined' && !EstoqueModule.catalogoMateriais.length) {
      EstoqueModule.catalogoMateriais = catalogoMateriais;
    }
    EstoqueModule.tab = 'estoque';
    renderEstoqueView();
  });
  viewRegistry.register('catalogo', () => {
    if (typeof catalogoMateriais !== 'undefined' && !EstoqueModule.catalogoMateriais.length) {
      EstoqueModule.catalogoMateriais = catalogoMateriais;
    }
    EstoqueModule.tab = 'catalogo';
    renderEstoqueView();
  });
  viewRegistry.register('banco', renderBanco);
}


// ══════════════════════════════════════════════════════════════════
// RENDER PRINCIPAL
// ══════════════════════════════════════════════════════════════════
function renderEstoqueView() {
  if (EstoqueModule.tab === 'catalogo') {
    _showTabCatalogo();
  } else {
    _showTabEstoque();
  }
  aplicarPerfil();
}

function _showTabEstoque() {
  renderEstoque();
}

function _showTabCatalogo() {
  renderCatalogo();
}

function _updateTabButtons(active) {
  document.querySelectorAll('.tab-btn').forEach((b, i) => {
    b.classList.toggle('active', (i === 0 && active === 'estoque') || (i === 1 && active === 'catalogo'));
  });
  const h = document.getElementById('header-title');
  if (h) h.textContent = active === 'estoque' ? 'Estoque' : 'Catalogo de Materiais';
}

function switchTab(tab) {
  EstoqueModule.tab = tab;
  EstoqueModule.page = 0;
  EstoqueModule.catPage = 0;
  renderEstoqueView();
}


// ══════════════════════════════════════════════════════════════════
// CONSOLIDACAO DE ESTOQUE
// Matching conservador: 1) codigo catalogo, 2) nome exato
// Sem fuzzy match — itens nao identificados viram orfaos
// ══════════════════════════════════════════════════════════════════

// Retorna o saldo absoluto definido por uma contagem física, ou null quando o
// registro representa apenas um delta. O lote legado de 02/06 foi gravado como
// tipo "ajuste" e compensava saídas importadas; apesar do texto "Zeragem
// manual", ele NÃO é uma contagem física nem pode cortar o histórico.
function _alvoAbsolutoAjuste(a) {
  const motivo = String(a?.motivo || '');
  if (a?.tipo !== 'contagem') return null;

  // Registros antigos formatavam quantidades com fmt() e gravavam "R$" no
  // motivo; outros usavam dois-pontos (ex.: "Real: 21"). Ambos representam
  // uma contagem absoluta e precisam definir o corte do histórico.
  const mReal = motivo.match(/real\s*:?\s*(?:R\$\s*)?([\d](?:[\d.,]*\d)?(?:e[+-]?\d+)?)/i);
  if (!mReal) return null;
  const bruto = mReal[1];
  const normalizado = bruto.includes(',')
    ? bruto.replace(/\./g, '').replace(',', '.')
    : bruto;
  const valor = Number(normalizado);
  return Number.isFinite(valor) && valor >= 0 ? valor : null;
}

// NFs novas persistem data_efetiva_estoque. No legado, a data de recebimento
// é a melhor evidência de quando o material passou a existir no almoxarifado;
// usar a emissão antes dela pode esconder a entrada após uma contagem física.
function _dataMovimentoNotaEstoque(n) {
  return n?.data_efetiva_estoque || n?.data_recebimento || n?.data || null;
}

function _unidadeEstoqueExibicao(unidade) {
  const valor = String(unidade || 'UN').trim();
  const chave = valor.toUpperCase();
  if (chave === 'M3' || chave === 'M³') return 'M³';
  if (chave === 'M2' || chave === 'M²') return 'M²';
  return valor;
}


// Ordena movimentos pelo dia efetivo, sem converter uma data financeira em UTC.
// Para registros feitos no mesmo dia, criado_em desempata a contagem intradiaria.
// EDR usa o dia civil de Brasilia; retroativos mantem o dia informado.
// Sem horario historico nao e possivel inferir a hora fisica: mantem inicio do dia.
let _formatadorMomentoEstoque = null;
function _momentoMovimentoEstoque(dataEfetiva, criadoEm) {
  function civil(timestamp) {
    if (!timestamp || !String(timestamp).includes('T')) return null;
    const data = new Date(timestamp);
    if (!Number.isFinite(data.getTime())) return null;
    _formatadorMomentoEstoque ||= new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    });
    const partes = _formatadorMomentoEstoque.formatToParts(data);
    const p = Object.fromEntries(partes.map(x => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}.${String(data.getUTCMilliseconds()).padStart(3, '0')}`;
  }
  if (dataEfetiva && String(dataEfetiva).includes('T')) return civil(dataEfetiva);
  const dia = String(dataEfetiva || '').match(/^\d{4}-\d{2}-\d{2}$/)?.[0];
  const criado = civil(criadoEm);
  if (!dia) return criado;
  return criado?.slice(0, 10) === dia ? criado : dia + 'T00:00:00.000';
}

// Reconstroi disponibilidade em ordem efetiva. Os lotes de NF continuam no
// historico; o conjunto operacional inclui entradas sem NF e contagens.
// O saldo e a media de compras continuam calculados pelo contrato existente.
function _recomporLotesEstoque(item, saldo, valorMedio) {
  const eventos = [], disponiveis = [];
  let divida = 0;
  const evento = (tipo, registro, chave) => eventos.push({
    tipo, registro, momento: registro.momento || '9999', chave: String(chave || ''),
  });
  item.lotes.forEach(lote => {
    lote.qtd_disponivel = 0;
    evento('entrada', lote, lote.nota_id + ':' + lote.item_idx);
  });
  item._ediretas.forEach(e => evento('entrada', {
    ...e, entrada_direta_id: e.id, nota_id: null, data: e.date, valor_un: e.preco, qtd_disponivel: 0,
  }, 'ed:' + e.id));
  item._ajustes.forEach(a => evento('ajuste', a, 'aj:' + a.id));
  item._contagens.forEach(a => evento('contagem', a, 'ct:' + a.id));
  item._saidas.forEach(s => evento('saida', s, 'sd:' + s.id));
  item._devolucoes.forEach(d => evento('devolucao', d, 'dv:' + d.id));
  const prioridade = { entrada: 0, ajuste: 1, contagem: 2, saida: 3, devolucao: 4 };
  eventos.sort((a, b) => a.momento.localeCompare(b.momento)
    || prioridade[a.tipo] - prioridade[b.tipo] || a.chave.localeCompare(b.chave));
  function adicionar(lote) {
    const compensar = Math.min(Math.max(0, lote.qtd), divida);
    divida -= compensar;
    lote.qtd_disponivel = Math.max(0, lote.qtd - compensar);
    disponiveis.push(lote);
  }
  function consumir(qtd, predicado = () => true) {
    let restante = qtd;
    for (const lote of disponiveis) {
      if (restante <= 0) break;
      if (!predicado(lote)) continue;
      const usar = Math.min(lote.qtd_disponivel, restante);
      lote.qtd_disponivel -= usar;
      restante -= usar;
    }
    return Math.max(0, restante);
  }
  const total = () => disponiveis.reduce((s, l) => s + l.qtd_disponivel, 0);
  function semNF(qtd, registro) {
    adicionar({ nota_id: null, ajuste_id: registro.id || null, qtd, qtd_disponivel: 0,
      data: registro.date || null, momento: registro.momento, valor_un: valorMedio });
  }
  for (const e of eventos) {
    const r = e.registro;
    if (e.tipo === 'entrada') adicionar(r);
    else if (e.tipo === 'saida') {
      if (r.origens?.length) {
        for (const o of r.origens) {
          if (o.tipo === 'sem_origem') { divida += Number(o.qtd); continue; }
          const falta = consumir(Number(o.qtd), l => o.tipo === 'nf'
            ? l.nota_id === o.nota_id && Number(l.item_idx) === Number(o.item_idx)
            : o.tipo === 'entrada_direta' ? l.entrada_direta_id === o.entrada_direta_id
              : l.ajuste_id === o.ajuste_id);
          if (falta > Math.max(1e-9, Number(o.qtd) * 1e-9)) item.origensInconsistentes = true;
          divida += falta;
        }
      } else divida += consumir(r.qtd);
    }
    else if (e.tipo === 'devolucao') {
      divida += consumir(r.qtd, l => l.nota_id === r.nota_origem_id && l.item_idx === r.item_idx_origem);
    } else if (e.tipo === 'ajuste') {
      if (r.qtd > 0) semNF(r.qtd, r);
      else divida += consumir(-r.qtd);
    } else {
      divida = 0;
      const diferenca = r.real - total();
      if (diferenca < 0) consumir(-diferenca);
      else if (diferenca > 0) semNF(diferenca, r);
    }
  }
  // Legados sem data/origem: nunca oferecer mais lotes do que o saldo fisico.
  const diferenca = Math.max(0, saldo) - total();
  if (diferenca < 0) consumir(-diferenca);
  else if (diferenca > 0) { divida = 0; semNF(diferenca, {}); }
  return disponiveis.filter(l => l.qtd_disponivel > 0);
}

function _planejarOrigemSaidaEstoque(item, qtd, dataSaida) {
  if (item?.origensInconsistentes) return { ok: false, erro: 'As origens registradas não conferem com o histórico. Confira antes de lançar outra saída.' };
  let restante = qtd, valor = 0;
  const tolerancia = Math.max(Number.EPSILON, Math.abs(qtd) * Number.EPSILON * 8);
  const parcelas = [];
  for (const lote of item?._lotesOperacionais || []) {
    if (restante <= tolerancia) break;
    if (lote.data && String(lote.data).slice(0, 10) > dataSaida) continue;
    const usar = Math.min(lote.qtd_disponivel, restante);
    if (usar <= 0) continue;
    parcelas.push({ lote, qtd: usar });
    valor += usar * (Number(lote.valor_un) || 0);
    restante -= usar;
  }
  const nfs = parcelas.filter(p => p.lote.nota_id);
  const origens = new Set(nfs.map(p => p.lote.nota_id + ':' + p.lote.item_idx));
  // O schema atual tem apenas um nota_id/item_idx. Nao atribuir uma saida
  // mista a uma NF dominante: isso liberaria devolucao/exclusao da outra NF.
  if (origens.size > 1 || (nfs.length && (restante > tolerancia || nfs.length !== parcelas.length))) {
    return { ok: false, erro: 'Esta saída usa mais de um lote de origem. Divida a quantidade em saídas menores para preservar o vínculo com cada nota.' };
  }
  if (restante > tolerancia && (item?.saldo || 0) >= qtd) {
    return { ok: false, erro: 'Não foi possível identificar os lotes disponíveis nessa data. Confira o histórico antes de lançar a saída.' };
  }
  valor += Math.max(0, restante) * (item?.valorMedio || 0);
  return { ok: true, valor, origem: nfs[0]?.lote || null };
}

// Compartilhado pelos dois botoes: trava a aba durante recarga e gravacao.
// A transacao/concorrencia entre sessoes continua dependendo do servidor.
async function _executarSaidaEstoque(operacao) {
  if (window._saidaEmAndamento) return;
  window._saidaEmAndamento = true;
  const sessaoInicial = _contextoSaidaEstoque()?.chave;
  const botoes = ['btn-confirmar-saida', 'btn-confirmar-distribuicao']
    .map(id => document.getElementById(id)).filter(Boolean)
    .map(el => ({ el, disabled: el.disabled, texto: el.textContent, html: el.innerHTML }));
  botoes.forEach(({ el }) => { el.disabled = true; el.textContent = 'Conferindo...'; });
  try {
    const cargas = [
      typeof loadNotas === 'function' ? loadNotas : null,
      typeof loadLancamentos === 'function' ? loadLancamentos : null,
      typeof loadDistribuicoes === 'function' ? loadDistribuicoes : null,
      typeof loadEntradasDiretas === 'function' ? loadEntradasDiretas : null,
      typeof loadAjustesEstoque === 'function' ? loadAjustesEstoque : null,
      typeof loadMateriais === 'function' ? loadMateriais : null,
    ].filter(Boolean);
    const resultados = await Promise.all(cargas.map(carregar => carregar()));
    if (resultados.some(ok => ok !== true)
        || (typeof estoqueDadosCompletos === 'function' && !estoqueDadosCompletos())) {
      return showToast('Estoque incompleto. Atualize os dados antes de registrar uma saída.', 6000);
    }
    if (_contextoSaidaEstoque()?.chave !== sessaoInicial) return showToast('A sessão mudou durante a conferência. Tente novamente.', 6000);
    if (typeof catalogoMateriais !== 'undefined') EstoqueModule.catalogoMateriais = catalogoMateriais;
    consolidarEstoque();
    botoes.forEach(({ el }) => { el.textContent = 'Salvando...'; });
    return await operacao();
  } catch (erro) {
    console.error('Falha ao preparar saída de estoque:', erro);
    showToast('Não foi possível concluir a saída. Confira os registros antes de tentar novamente.', 7000);
  } finally {
    window._saidaEmAndamento = false;
    botoes.forEach(({ el, disabled, texto, html }) => {
      el.disabled = disabled;
      el.textContent = texto;
      if (typeof html === 'string') el.innerHTML = html;
    });
  }
}

// Pedido pendente fica separado por empresa/usuario; nunca armazena credenciais.
function _contextoSaidaEstoque() {
  const empresa = typeof _companyId !== 'undefined' ? _companyId : null;
  const usuario = typeof usuarioAtual !== 'undefined' ? usuarioAtual?.id : null;
  return empresa && usuario ? { empresa, usuario, chave: 'edr.estoque.pendente.v2:' + empresa + ':' + usuario } : null;
}
function _pendenciaSaidaEstoque(contexto = _contextoSaidaEstoque()) {
  if (!contexto) return null;
  const raw = localStorage.getItem(contexto.chave);
  if (!raw) return null;
  const p = JSON.parse(raw);
  if (p.versao !== 2 || p.empresa !== contexto.empresa || p.usuario !== contexto.usuario || !p.params?.p_operacao_id) {
    throw new Error('Pedido pendente inválido; conferir antes de registrar outra saída.');
  }
  return p;
}
function _usarSaidaAtomica() {
  return (typeof estoqueModoAtomico === 'function' && estoqueModoAtomico()) || !!_pendenciaSaidaEstoque();
}
async function _enviarSaidaAtomica(p, contexto) {
  const aindaNaSessao = () => _contextoSaidaEstoque()?.chave === contexto.chave;
  if (!aindaNaSessao()) return showToast('A sessão mudou. Confira a empresa antes de continuar.', 6000);
  const jaIncerta = !!p.incerta;
  p.incerta = true; // inclusive fechar/recarregar a página durante o envio
  localStorage.setItem(contexto.chave, JSON.stringify(p));
  const resposta = await sbRpcEstoque('registrar_saida_estoque_atomica', p.params);
  if (!aindaNaSessao()) return showToast('A sessão mudou durante o envio. Confira o pedido na empresa de origem.', 7000);
  const r = resposta.dados;
  const confirmada = resposta.ok && r?.operacao_id === p.params.p_operacao_id
    && ['registrada', 'excluida'].includes(r.status) && r.distribuicao_id && r.lancamento_id;
  if (!confirmada) {
    if (!resposta.ok && !resposta.incerto && !jaIncerta) localStorage.removeItem(contexto.chave);
    showToast(resposta.mensagem || 'Resposta incompleta. Repita o pedido para conferir o resultado.', 8000);
    return;
  }
  localStorage.removeItem(contexto.chave);
  const resultados = await Promise.all([loadNotas(), loadLancamentos(), loadDistribuicoes(), loadEntradasDiretas(), loadAjustesEstoque()]);
  if (!aindaNaSessao()) return;
  renderEstoque();
  if (typeof renderDashboard === 'function') renderDashboard();
  closeModal('dist-modal');
  fecharModal('saida');
  if (r.status === 'excluida') return showToast('Este pedido já foi excluído. Nenhuma nova saída foi criada.', 7000);
  const pendente = Number(r.sem_origem) > 0
    ? ' · ' + Number(r.sem_origem).toLocaleString('pt-BR', { maximumFractionDigits: 20 }) + ' sem origem, para conferência'
    : '';
  showToast((r.repetida ? 'Saída já registrada; confirmação recuperada' : 'Saída registrada') + pendente
    + (resultados.some(ok => ok !== true) ? '. A atualização dos dados falhou; recarregue o estoque.' : '.'), 7000);
}
async function _registrarSaidaAtomica({ item, qtd, obraId, etapa, data, criterio, obs = '', precoManual = null }) {
  const contexto = _contextoSaidaEstoque();
  if (!contexto) return showToast('Entre novamente para registrar a saída.', 6000);
  const contrato = typeof estoqueContratoAtual === 'function' ? estoqueContratoAtual() : null;
  if (!contrato?.habilitado || contrato.contrato !== 2) {
    return showToast('A gravação desta saída está indisponível. O pedido pendente foi preservado.', 7000);
  }
  const material = EstoqueModule.catalogoMateriais.find(m => m.codigo === item.codigo);
  if (!material?.id) return showToast('Vincule o material ao catálogo antes de registrar a saída.', 6000);
  const intencao = JSON.stringify({ material: material.id, qtd, obraId, etapa, data, criterio, obs, precoManual });
  const existente = _pendenciaSaidaEstoque(contexto);
  if (existente) {
    if (existente.intencao !== intencao) {
      const ok = await confirmar('Há uma saída sem confirmação: ' + existente.resumo
        + '. Conferir esse pedido antes de registrar outro?');
      if (!ok) return;
    }
    return _enviarSaidaAtomica(existente, contexto);
  }
  if (data !== contrato.hoje) return showToast('Esta etapa aceita saídas de hoje. Uma data anterior precisa de conferência do histórico.', 7000);
  const semOrigem = Math.max(0, qtd - Math.max(0, Number(item.saldo) || 0));
  if (semOrigem > 0 && criterio === 'fifo' && !(Number(item.valorMedio) > 0) && !(Number(precoManual) > 0)) {
    return showToast('Material sem custo registrado. Use Saída manual para informar o custo unitário e conferir a quantidade sem origem.', 8000);
  }
  if (semOrigem > 0) {
    const fmtQ = n => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 20 });
    const ok = await confirmar('Saldo registrado: ' + fmtQ(item.saldo) + ' ' + item.unidade
      + '. Saída: ' + fmtQ(qtd) + ' ' + item.unidade + '. Saldo após a saída: ' + fmtQ(item.saldo - qtd)
      + ' ' + item.unidade + '. Quantidade sem origem para conferência: ' + fmtQ(semOrigem) + ' ' + item.unidade + '. Confirmar?');
    if (!ok) return;
  }
  const classificacao = custoClassificacaoNovo(obraId);
  const p = {
    versao: 2, empresa: contexto.empresa, usuario: contexto.usuario, intencao,
    resumo: item.desc + ' — ' + qtd + ' ' + item.unidade, incerta: false,
    params: {
      p_operacao_id: crypto.randomUUID(), p_material_id: material.id, p_obra_id: obraId,
      p_qtd: qtd, p_efetivo_em: contrato.agora, p_etapa: etapa, p_criterio: criterio,
      p_destino_custo: classificacao.destino_custo || 'nao_classificado',
      p_adicional_id: classificacao.adicional_id || null, p_obs: obs,
      p_sem_origem_confirmada: semOrigem, p_preco_manual: precoManual,
    },
  };
  return _enviarSaidaAtomica(p, contexto);
}

function consolidarEstoque(obraId) {
  const mapa = {}; // chave → { desc, codigo, un, cat, entradas, saidas, ajustes, lotes, temNF }

  // Helper: chave inteligente (igual V1 — agrupa variacoes do mesmo material)
  function normChave(d) {
    d = norm(d);
    d = d.replace(/^\d{4,6}\s*[·\-]?\s*/, '');
    d = d.replace(/\b(cp\s*-?\s*ii[iz]?|cp\s*-?\s*iv|cp\s*-?\s*v|50\s*kg|25\s*kg|20\s*kg|18\s*l|saco|sc|un|ml|m2|m3|m³|pct|cx|pc|rolo|galao|gl|barra|metro|kg)\b/g, '');
    return d.replace(/\s+/g, ' ').trim();
  }
  function getChave(desc, codigoCat) {
    if (codigoCat) return 'COD:' + codigoCat;
    // Tentar achar no catalogo pelo nome
    const nDesc = norm(desc);
    const catItem = EstoqueModule.catalogoMateriais.find(m => norm(m.nome) === nDesc);
    if (catItem && catItem.codigo) return 'COD:' + catItem.codigo;
    return 'NOME:' + normChave(desc);
  }

  // Helper: garantir entrada no mapa
  function garantir(chave, desc, codigoCat, un) {
    if (!mapa[chave]) {
      // Tentar achar no catalogo pelo codigo
      let catItem = null;
      if (codigoCat) {
        catItem = EstoqueModule.catalogoMateriais.find(m => m.codigo === codigoCat);
      }
      // Tentar achar por nome exato
      if (!catItem && desc) {
        const nDesc = norm(desc);
        catItem = EstoqueModule.catalogoMateriais.find(m => norm(m.nome) === nDesc);
      }

      // Categoria resolvida para key oficial (nunca label/string legada)
      const categoria = _resolverCategoriaEstoque(catItem?.categoria || _categoriaPorEtapas(desc) || '36_outros');

      mapa[chave] = {
        desc: catItem?.nome || desc,
        codigo: catItem?.codigo || codigoCat || null,
        unidade: catItem?.unidade || un || 'UN',
        categoria,
        entradas: 0,
        entradasDiretas: 0,
        saidas: 0,
        ajustes: 0,
        valorTotal: 0,
        lotes: [],         // { nota_id, item_idx, data, qtd, qtd_disponivel, valor_un }
        _devolucoes: [],   // devoluções posteriores à contagem também precisam reduzir o saldo
        _ediretas: [],     // { qtd, date } — entradas diretas com data para filtro pós-contagem
        _saidas: [],       // { qtd, date } — saídas com data para filtro pós-contagem
        _contagens: [],
        _ajustes: [],      // { qtd, date } — ajustes delta com data para filtro pós-contagem
        _ultimaContagem: undefined,      // valor absoluto da última contagem física
        _ultimaContagemData: undefined,  // chave civil ordenavel da ultima contagem
        temNF: false,
        semCodigo: !catItem?.codigo && !codigoCat,
        nfPendente: false,
      };
    }
    return mapa[chave];
  }

  // 1) ENTRADAS VIA NF — só estoque geral (EDR), igual V1
  const notasFiltradas = obraId
    ? notas.filter(n => n.obra === obraId)
    : notas.filter(n => n.obra === 'EDR');

  for (const n of notasFiltradas) {
    const itens = parseItens(n);
    const ehDevolucao = n.natureza === 'DEVOLUCAO';
    const custos = custosItensNota(n, itens);
    for (let itemIdx = 0; itemIdx < itens.length; itemIdx++) {
      const it = itens[itemIdx];
      const desc = it.descricao || it.desc || '';
      const codCat = it.codigo_catalogo || it.codigo || it.cod || null;
      const chave = getChave(desc, codCat);
      const item = garantir(chave, desc, codCat, it.unidade_estoque || it.unidade);
      const qtd = parseFloat(it.qtd_estoque ?? it.quantidade ?? it.qtd) || 0;
      let valorUn = qtd > 0 ? custos[itemIdx].total / qtd : 0;
      // Devolver retira o custo do lote original; o reembolso preserva o valor fiscal.
      if (ehDevolucao && n.nota_origem_id && Number.isInteger(it.item_idx_origem)) {
        const origem = notas.find(x => x.id === n.nota_origem_id);
        const custoOrigem = origem && custosItensNota(origem)[it.item_idx_origem];
        if (custoOrigem?.qtd > 0) valorUn = custoOrigem.total / custoOrigem.qtd;
      }
      item.entradas += ehDevolucao ? -qtd : qtd;
      item.valorTotal += (ehDevolucao ? -1 : 1) * qtd * valorUn;
      item.temNF = true;
      if (ehDevolucao) {
        item._devolucoes.push({
          id: n.id,
          nota_origem_id: n.nota_origem_id || null,
          item_idx_origem: Number.isInteger(it.item_idx_origem) ? it.item_idx_origem : null,
          qtd,
          date: _dataMovimentoNotaEstoque(n),
          momento: _momentoMovimentoEstoque(_dataMovimentoNotaEstoque(n), n.criado_em),
        });
      } else {
        item.lotes.push({
          nota_id: n.id,
          item_idx: itemIdx,
          nf: n.numero_nf,
          fornecedor: n.fornecedor,
          // Legado cai em recebimento; NFs novas usam data_efetiva_estoque.
          data: _dataMovimentoNotaEstoque(n),
          momento: _momentoMovimentoEstoque(_dataMovimentoNotaEstoque(n), n.criado_em),
          qtd,
          qtd_disponivel: qtd, // sera reduzido pelas distribuicoes
          valor_un: valorUn,
        });
      }
    }
  }

  // 2) ENTRADAS DIRETAS (se existir array global)
  if (typeof entradasDiretas !== 'undefined' && Array.isArray(entradasDiretas)) {
    const edFiltradas = obraId
      ? entradasDiretas.filter(e => e.obra_id === obraId)
      : entradasDiretas;

    for (const e of edFiltradas) {
      const chave = getChave(e.item_desc, e.codigo_catalogo);
      const item = garantir(chave, e.item_desc, e.codigo_catalogo, e.unidade);
      const qtd = parseFloat(e.qtd) || 0;
      const preco = parseFloat(e.preco) || 0;
      item.entradasDiretas += qtd;
      item.valorTotal += qtd * preco;
      if (!item.temNF) item.nfPendente = true;
      item._ediretas.push({ id: e.id, qtd, preco, date: e.data || e.criado_em || null,
        momento: _momentoMovimentoEstoque(e.data, e.criado_em) });
    }
  }

  // 3) AJUSTES DE ESTOQUE
  if (typeof ajustesEstoque !== 'undefined' && Array.isArray(ajustesEstoque)) {
    const ajFiltrados = obraId
      ? ajustesEstoque.filter(a => a.obra_id === obraId)
      : ajustesEstoque;

    for (const a of ajFiltrados) {
      const chave = getChave(a.item_desc, a.codigo_catalogo);
      const item = garantir(chave, a.item_desc, a.codigo_catalogo, a.unidade);
      const realAbs = _alvoAbsolutoAjuste(a);
      if (realAbs !== null) {
        const dataA = _momentoMovimentoEstoque(a.criado_em || a.data);
        item._contagens.push({ id: a.id, real: realAbs, date: a.criado_em || a.data, momento: dataA });
        if (item._ultimaContagem === undefined || (dataA && (!item._ultimaContagemData || dataA >= item._ultimaContagemData))) {
          item._ultimaContagem = realAbs;
          item._ultimaContagemData = dataA;
        }
      } else {
        // Contagem antiga sem alvo legível e ajustes comuns continuam como delta.
        const _dq = parseFloat(a.qtd) || 0;
        item.ajustes += _dq;
        item._ajustes.push({ id: a.id, qtd: _dq, date: a.criado_em || a.data || null,
          momento: _momentoMovimentoEstoque(a.criado_em || a.data) });
      }
    }
  }

  // 4) DISTRIBUICOES (SAIDAS)
  if (typeof distribuicoes !== 'undefined' && Array.isArray(distribuicoes)) {
    const distFiltradas = obraId
      ? distribuicoes.filter(d => d.obra_id === obraId)
      : distribuicoes;

    for (const d of distFiltradas) {
      // Estoque geral: NÃO descontar baixas de material que entrou DIRETO na obra
      // (nota com destino != 'EDR'). Simetria com as entradas via NF, que só contam
      // notas destino 'EDR'. Sem isso, material que nunca passou pelo almoxarifado
      // ficava negativo (entrada não soma, mas saída descontava). Na visão da obra
      // (obraId definido) a baixa continua contando normalmente.
      if (!obraId && d.nota_id) {
        const _notaOrigem = notas.find(n => n.id === d.nota_id);
        if (_notaOrigem && _notaOrigem.obra && _notaOrigem.obra !== 'EDR') continue;
      }
      // Estoque geral: também NÃO descontar baixas de COMPRA DIRETA (material aplicado
      // direto na obra, sem passar pelo almoxarifado). Identificadas pelo lançamento
      // vinculado com origem 'compra_direta'. Na visão da obra (obraId) a baixa continua contando.
      if (!obraId && d.lancamento_id && typeof lancamentos !== 'undefined') {
        const _lanc = lancamentos.find(l => l.id === d.lancamento_id);
        if (_lanc && _lanc.origem === 'compra_direta') continue;
      }
      const chave = getChave(d.item_desc, d.codigo_catalogo);
      const item = garantir(chave, d.item_desc, d.codigo_catalogo, d.unidade);
      const qtd = parseFloat(d.qtd) || 0;
      item.saidas += qtd;
      // A contagem física corta pela data em que a saída aconteceu. Uma baixa
      // antiga cadastrada depois da contagem não pode ser descontada de novo.
      item._saidas.push({ id: d.id, qtd, date: d.data || d.criado_em || null,
        momento: _momentoMovimentoEstoque(d.estoque_efetivo_em || d.data, d.criado_em), origens: d.origens });
    }
  }

  // Calcular saldo e montar resultado
  const resultado = [];

  for (const chave in mapa) {
    const it = mapa[chave];
    let saldo;
    if (it._ultimaContagem !== undefined) {
      const cd = it._ultimaContagemData; // chave civil | null
      // Entradas NF posteriores à contagem (lotes com data)
      const postNF = cd
        ? it.lotes.filter(l => !l.momento || l.momento > cd).reduce((s, l) => s + l.qtd, 0)
        : it.entradas;
      const postDevolucoes = cd
        ? it._devolucoes.filter(d => !d.momento || d.momento > cd).reduce((s, d) => s + d.qtd, 0)
        : 0;
      // Entradas diretas posteriores
      const postED = cd
        ? it._ediretas.filter(e => !e.momento || e.momento > cd).reduce((s, e) => s + e.qtd, 0)
        : it.entradasDiretas;
      // Saídas posteriores
      const postS = cd
        ? it._saidas.filter(s => !s.momento || s.momento > cd).reduce((s, x) => s + x.qtd, 0)
        : it.saidas;
      // Ajustes delta posteriores à contagem (mesmo critério das entradas/saídas —
      // não somar delta/zeragem anterior à última contagem absoluta sobre o valor contado)
      const postAjustes = cd
        ? it._ajustes.filter(a => !a.momento || a.momento > cd).reduce((s, a) => s + a.qtd, 0)
        : it.ajustes;
      saldo = it._ultimaContagem + postNF + postED + postAjustes - postS - postDevolucoes;
    } else {
      saldo = it.entradas + it.entradasDiretas + it.ajustes - it.saidas;
    }
    const totalEntradas = it.entradas + it.entradasDiretas; // custo médio sai só das compras — ajustes (inventário/correção) mudam o saldo, não o custo
    const valorMedio = totalEntradas > 0 ? it.valorTotal / totalEntradas : 0;
    const lotesOperacionais = _recomporLotesEstoque(it, saldo, valorMedio);

    resultado.push({
      chave,
      desc: it.desc,
      codigo: it.codigo,
      unidade: it.unidade,
      categoria: it.categoria,
      saldo,
      valorMedio,
      valorEstoque: saldo >= 0
        ? lotesOperacionais.reduce((s, l) => s + l.qtd_disponivel * (Number(l.valor_un) || 0), 0)
        : saldo * valorMedio,
      entradas: it.entradas,
      entradasDiretas: it.entradasDiretas,
      saidas: it.saidas,
      ajustes: it.ajustes,
      lotes: it.lotes,
      _lotesOperacionais: lotesOperacionais,
      origensInconsistentes: !!it.origensInconsistentes,
      temNF: it.temNF,
      semCodigo: it.semCodigo,
      nfPendente: it.nfPendente,
    });

  }

  // Remover itens com movimenta_estoque=false (serviço, taxa, etc.)
  const cat = typeof catalogoMateriais !== 'undefined' ? catalogoMateriais : [];
  const resultadoFiltrado = resultado.filter(item => {
    let catItem = null;
    if (item.codigo) catItem = cat.find(m => m.codigo === item.codigo);
    if (!catItem) catItem = cat.find(m => norm(m.nome) === norm(item.desc));
    return !catItem || catItem.movimenta_estoque !== false;
  });

  // _valorTotal reflete só itens que movimentam estoque (recalculado APÓS o filtro,
  // senão serviço/taxa com saldo positivo contaminava o valor total do estoque)
  EstoqueModule._valorTotal = resultadoFiltrado.reduce((s, it) => s + (it.saldo > 0 ? it.valorEstoque : 0), 0);
  EstoqueModule._consolidado = resultadoFiltrado;
  return resultadoFiltrado;
}


// ══════════════════════════════════════════════════════════════════
// CATEGORIA VIA ETAPAS (fonte unica — CATS_ESTOQUE eliminado)
// ══════════════════════════════════════════════════════════════════

// Resolve qualquer string de categoria (legada, label, key) para a key oficial de ETAPAS.
// Garante que consolidarEstoque sempre produz keys canônicas, nunca labels ou strings legadas.
function _resolverCategoriaEstoque(cat) {
  if (!cat) return '36_outros';
  const s = String(cat);
  // 1. Já é uma key oficial
  if (typeof ETAPAS !== 'undefined' && ETAPAS.find(e => e.key === s)) return s;
  // 2. Alias map (ex: 'aco', 'ferro', 'hidraulica' → key)
  if (typeof resolveEtapaKey === 'function') {
    const r = resolveEtapaKey(s);
    if (r !== s && typeof ETAPAS !== 'undefined' && ETAPAS.find(e => e.key === r)) return r;
  }
  // 3. Match normalizado sem pontuação contra labels (ex: 'Aco/ferro' → norm → 'acoferro' === norm('Aço / Ferro'))
  if (typeof ETAPAS !== 'undefined') {
    const nStrip = norm(s).replace(/[\s\/\-]+/g, '');
    const byLabel = ETAPAS.find(e => norm(e.lb).replace(/[\s\/\-]+/g, '') === nStrip);
    if (byLabel) return byLabel.key;
    // Match contra base da key sem prefixo numérico (ex: 'impermeab' → '23_impermeab')
    const byKeyBase = ETAPAS.find(e => norm(e.key.replace(/^\d+_/, '')) === norm(s).replace(/[\s\/]+/g, ''));
    if (byKeyBase) return byKeyBase.key;
  }
  // 4. Mapa de strings legadas específicas do banco antigo
  const LEGADO = {
    'aco/ferro':              '02_aco',
    'forma/madeira':          '16_forma',
    'loucas/metais':          '27_loucas',
    'granito/pedra':          '20_granito',
    'glp/gas':                '37_glp',
    'revestimento argamassa': '32_revarg',
    'revestimento ceramico':  '33_revestc',
    'servicos preliminares':  '31_prelim',
    'outros':                 '36_outros',
    'nao classificado':       '36_outros',
    'generico':               '18_generico',
    'impermeabilizacao':      '23_impermeab',
    'hidraulica':             '21_hidro',
    'eletrica':               '09_elet',
    'fundacao':               '17_fund',
    'locacao':                '26_locacao',
    'alvenaria':              '04_alven',
    'estrutura':              '13_estrut',
    'cobertura':              '06_cobr',
    'esquadrias':             '11_esquad',
    'esgoto':                 '12_esgoto',
    'pintura':                '30_pintura',
    'ferramentas':            '15_ferramenta',
    'epi':                    '10_epi',
    'limpeza':                '25_limpeza',
    'alimentacao':            '03_alimentacao',
  };
  const n = norm(s);
  if (LEGADO[n]) return LEGADO[n];
  return '36_outros';
}

// Infere categoria por palavras-chave no nome do material.
// Retorna KEY oficial (ex: '02_aco'), nunca label de display.
function _categoriaPorEtapas(desc) {
  if (!desc) return null;
  const n = norm(desc);

  // Mapa: key oficial → palavras-chave no nome do material
  const mapa = {
    '31_prelim':     ['lona', 'tapume', 'placa obra', 'sondagem'],
    '17_fund':       ['estaca', 'broca', 'sapata', 'radier', 'baldrame'],
    '13_estrut':     ['cimento', 'concreto', 'areia', 'brita', 'laje', 'vigota', 'tavela', 'pre-moldado'],
    '02_aco':        ['vergalhao', 'tela soldada', 'arame recozido', 'malha pop', 'aco ca', 'barra aco'],
    '16_forma':      ['madeira', 'caibro', 'viga', 'ripa', 'sarrafo', 'compensado', 'pontalete', 'desmoldante'],
    '04_alven':      ['tijolo', 'bloco', 'cal ', 'chapisco', 'emboco', 'reboco'],
    '09_elet':       ['fio ', 'cabo eletrico', 'eletroduto', 'conduite', 'disjuntor', 'tomada', 'interruptor', 'luminaria', 'lampada'],
    '23_impermeab':  ['impermeabilizante', 'manta asfaltica', 'bianco', 'veda calha', 'vedante', 'selante', 'silicone'],
    '21_hidro':      ['tubo pvc', 'joelho', 'tee ', 'luva pvc', 'registro', 'caixa dagua', 'sifao', 'flange', 'cola pvc'],
    '27_loucas':     ['vaso sanitario', 'lavatorio', 'cuba', 'torneira', 'chuveiro', 'ducha'],
    '12_esgoto':     ['tubo esgoto', 'caixa de gordura', 'caixa sifonada', 'ralo'],
    '06_cobr':       ['telha', 'cumeeira', 'rufo', 'calha', 'parafuso telha'],
    '11_esquad':     ['porta ', 'janela', 'batente', 'marco ', 'caixilho', 'fechadura', 'macaneta', 'trinco', 'puxador'],
    '32_revarg':     ['massa corrida', 'massa acrilica', 'gesso', 'forro gesso'],
    '33_revestc':    ['porcelanato', 'ceramica', 'azulejo', 'rejunte', 'argamassa colante'],
    '20_granito':    ['granito', 'marmore', 'soleira', 'peitoril'],
    '30_pintura':    ['tinta', 'selador', 'primer', 'textura', 'rolo ', 'pincel', 'massa pva'],
    '15_ferramenta': ['disco ', 'serra ', 'trena', 'nivel ', 'espatula', 'desempenadeira', 'colher pedreiro'],
    '10_epi':        ['capacete', 'protetor auricular', 'cinto seguranca', 'mascara epi'],
    '25_limpeza':    ['vassoura', 'saco lixo', 'detergente', 'acido muriatico'],
    '03_alimentacao':['agua mineral', 'cafe ', 'acucar', 'copo descartavel'],
  };

  for (const key in mapa) {
    for (const palavra of mapa[key]) {
      if (n.includes(norm(palavra))) return key;
    }
  }
  return null;
}


// ══════════════════════════════════════════════════════════════════
// RENDER ESTOQUE (tab principal)
// ══════════════════════════════════════════════════════════════════

function _mostrarEstoqueIndisponivel(cargasPendentes) {
  const nomes = {
    notas: 'notas fiscais', lancamentos: 'lançamentos', distribuicoes: 'distribuições',
    entradasDiretas: 'entradas diretas', ajustesEstoque: 'ajustes de estoque', materiais: 'catálogo de materiais',
  };
  const faltando = (cargasPendentes || []).map(chave => nomes[chave] || chave).join(', ');
  const loading = document.getElementById('estoque-loading');
  if (loading) {
    loading.classList.remove('hidden');
    loading.innerHTML = `<strong>Estoque indisponível para conferência.</strong><br>Não foi possível carregar: ${esc(faltando)}. Atualize a página antes de lançar ou distribuir material.`;
  }
  const lista = document.getElementById('estoque-lista');
  if (lista) lista.innerHTML = '';
  const loadMore = document.getElementById('est-load-more');
  if (loadMore) loadMore.style.display = 'none';
  document.getElementById('estoque-empty')?.classList.add('hidden');
}

function renderEstoque() {
  const cargasPendentes = typeof estoqueCargasPendentes === 'function' ? estoqueCargasPendentes() : [];
  if (cargasPendentes.length) {
    _mostrarEstoqueIndisponivel(cargasPendentes);
    return;
  }
  // Esconder spinner de carregamento
  document.getElementById('estoque-loading')?.classList.add('hidden');

  // Consolidar
  const obraId = EstoqueModule.filtroObra || null;
  consolidarEstoque(obraId);

  // Popular filtro de etapas dinamicamente
  _popularFiltroEtapas();

  let itens = [...EstoqueModule._consolidado];

  // Filtrar por categoria (etapa)
  if (EstoqueModule.filtroCategoria) {
    itens = itens.filter(i => norm(i.categoria) === norm(EstoqueModule.filtroCategoria));
  }

  // Filtrar por etapas (centro de custo) — seletor multi; ambos já são keys canônicas
  if (EstoqueModule.filtroEtapas.size > 0) {
    itens = itens.filter(i => EstoqueModule.filtroEtapas.has(i.categoria));
  }

  // Filtrar negativos
  if (EstoqueModule.filtroNegativos) {
    itens = itens.filter(i => i.saldo < 0);
  }

  // Filtrar sem codigo
  if (EstoqueModule.filtroSemCodigo) {
    itens = itens.filter(i => i.semCodigo);
  }

  // Filtrar busca
  if (EstoqueModule.filtroBusca) {
    const b = norm(EstoqueModule.filtroBusca);
    itens = itens.filter(i => norm(i.desc).includes(b) || (i.codigo && i.codigo.includes(b)));
  }

  // Filtrar: so itens com saldo != 0 ou com alertas
  itens = itens.filter(i => i.saldo !== 0 || i.semCodigo || i.nfPendente);

  // Ordenar
  switch (EstoqueModule.ordem) {
    case 'az': itens.sort((a, b) => (a.desc || '').localeCompare(b.desc || '', 'pt-BR')); break;
    case 'za': itens.sort((a, b) => (b.desc || '').localeCompare(a.desc || '', 'pt-BR')); break;
    case 'maior': itens.sort((a, b) => b.saldo - a.saldo); break;
    case 'menor': itens.sort((a, b) => a.saldo - b.saldo); break;
  }

  // Contadores pra summary cards
  const totalItens = itens.length;
  const semCodigo = EstoqueModule._consolidado.filter(i => i.semCodigo).length;
  const negativos = EstoqueModule._consolidado.filter(i => i.saldo < 0).length;

  _renderSummaryCards(EstoqueModule._valorTotal, totalItens, semCodigo, negativos);
  _renderCategoriasSidebar(EstoqueModule._consolidado);

  // Paginacao
  const start = 0;
  const end = (EstoqueModule.page + 1) * EstoqueModule.pageSize;
  const visiveis = itens.slice(start, end);
  const restantes = itens.length - end;

  // ── MODO TABELA (Fase 1) — só apresentação; reaproveita 'itens' já filtrado/ordenado pelo
  // mesmo pipeline. NÃO recalcula saldo (consolidarEstoque na linha 109 fica intocado). A tabela
  // tem scroll próprio, então o load-more dos cards é escondido neste modo.
  if (EstoqueModule.viewMode === 'tabela' && typeof EstoqueTabela !== 'undefined') {
    EstoqueTabela.render(itens, EstoqueModule._consolidado);
    const _lm = document.getElementById('est-load-more');
    if (_lm) _lm.style.display = 'none';
    return;
  }

  // Render cards
  const el = document.getElementById('estoque-lista');
  if (!el) return;

  if (!visiveis.length) {
    el.innerHTML = `<div class="empty-state">
      <span class="material-symbols-outlined icon-3xl">inventory_2</span>
      <p>Nenhum material encontrado.</p>
    </div>`;
    return;
  }

  const isAdmin = usuarioAtual?.perfil === 'admin';

  el.innerHTML = visiveis.map(it => {
    const saldoClass = it.saldo > 0 ? 'positivo' : it.saldo < 0 ? 'negativo' : 'zero';
    const borderLeft = it.saldo < 0 ? 'border-left:3px solid var(--error);' :
                       it.semCodigo ? 'border-left:3px solid var(--warning);' : '';
    const opacidade = it.saldo === 0 ? 'opacity:.7;' : '';

    const _catLabel = (typeof etapaLabel === 'function' && it.categoria) ? etapaLabel(it.categoria) : (it.categoria || '');
    let tags = `<span class="mat-tag mat-tag-cat">${esc(_catLabel)}</span>`;
    if (it.semCodigo) tags += '<span class="mat-tag mat-tag-sem-codigo">SEM CODIGO</span>';
    if (it.nfPendente) tags += '<span class="mat-tag mat-tag-nf-pend">NF PENDENTE</span>';
    if (it.saldo < 0) tags += '<span class="mat-tag mat-tag-sem-codigo">SALDO NEGATIVO</span>';

    // Meta: lotes, entradas, saidas
    const metaParts = [];
    if (it.lotes.length) metaParts.push(`${it.lotes.length} lote${it.lotes.length > 1 ? 's' : ''} NF`);
    if (it.entradasDiretas) metaParts.push(`${it.entradasDiretas} entrada direta`);
    if (it.ajustes) metaParts.push(`${it.ajustes > 0 ? '+' : ''}${it.ajustes} ajuste`);
    if (it.saidas) metaParts.push(`${it.saidas} distribuicao`);
    if (it.saldo === 0 && it.saidas) metaParts.push('100% consumido');

    // Acoes
    let acoes = '';
    if (it.semCodigo) {
      acoes += `<button class="mat-action-btn" style="border-color:var(--warning);color:var(--warning);" onclick="abrirVincularCodigo('${esc(it.chave)}')" title="Vincular codigo">
        <span class="material-symbols-outlined">link</span>Vincular</button>`;
    }
    acoes += `<button class="mat-action-btn distribuir" onclick="abrirDistribuicao('${esc(it.chave)}')">
      <span class="material-symbols-outlined">local_shipping</span>Distribuir</button>`;
    acoes += `<button class="mat-action-btn" style="border-color:var(--error);color:var(--error);" onclick="abrirSaidaMaterial('${esc(it.desc)}','${esc(it.unidade||'UN')}')" title="Baixa Rápida">
      <span class="material-symbols-outlined">remove_circle</span>Baixa</button>`;
    acoes += `<button class="mat-action-btn" onclick="abrirHistoricoMaterial('${esc(it.chave)}')">
      <span class="material-symbols-outlined">history</span>Historico</button>`;
    if (isAdmin) {
      acoes += `<button class="mat-action-btn" onclick="abrirAjusteEstoque('${esc(it.chave)}')">
        <span class="material-symbols-outlined">tune</span>Ajustar</button>`;
    }

    return `<div class="mat-card" style="${borderLeft}${opacidade}">
      <div class="mat-card-top">
        <div class="mat-card-name">
          ${it.codigo ? `<span class="mat-card-code">${esc(it.codigo)}</span>` : `<span class="mat-card-code" style="color:var(--warning);">---</span>`}
          ${esc(it.desc)}
        </div>
        <div class="mat-card-saldo">
          <div class="mat-card-saldo-num ${saldoClass}">${fmtQtd(it.saldo)}</div>
          <div class="mat-card-saldo-un">${esc(it.unidade)}</div>
        </div>
      </div>
      <div class="mat-card-tags">${tags}</div>
      ${isAdmin ? `<div class="mat-card-valor">Valor medio: <strong>${fmtR(it.valorMedio)}/${esc(it.unidade)}</strong> &middot; Total: <strong>${it.saldo < 0 ? `<span style="color:var(--error);">${fmtR(it.valorEstoque)}</span>` : fmtR(it.valorEstoque)}</strong></div>` : ''}
      <div class="mat-card-meta">${metaParts.map(esc).join(' <span>&middot;</span> ')}</div>
      <div class="mat-card-actions">${acoes}</div>
    </div>`;
  }).join('');

  // Botao carregar mais
  const loadMore = document.getElementById('est-load-more');
  if (loadMore) {
    if (restantes > 0) {
      loadMore.style.display = '';
      loadMore.innerHTML = `<button class="btn-secondary" onclick="EstoqueModule.page++;renderEstoque();">
        <span class="material-symbols-outlined icon-md">expand_more</span>
        Carregar mais (${restantes} restantes)</button>`;
    } else {
      loadMore.style.display = 'none';
    }
  }
}


// ── SUMMARY CARDS ───────────────────────────────────────────────
function _renderSummaryCards(valor, totalItens, semCodigo, negativos) {
  const elValor = document.getElementById('est-summary-valor');
  const elItens = document.getElementById('est-summary-itens');
  const elSemCod = document.getElementById('est-summary-semcodigo');
  const elNeg = document.getElementById('est-summary-negativos');

  if (elValor) elValor.textContent = fmtR(valor);
  if (elItens) elItens.textContent = totalItens;
  if (elSemCod) elSemCod.textContent = semCodigo;
  if (elNeg) elNeg.textContent = negativos;
}


// ── SIDEBAR DE CATEGORIAS ───────────────────────────────────────
function _renderCategoriasSidebar(consolidado) {
  const el = document.getElementById('est-cat-sidebar');
  if (!el) return;

  // Contar por categoria
  const contagem = {};
  let total = 0;
  for (const it of consolidado) {
    if (it.saldo === 0 && !it.semCodigo && !it.nfPendente) continue;
    const cat = it.categoria || 'Outros';
    contagem[cat] = (contagem[cat] || 0) + 1;
    total++;
  }

  // Ordenar categorias por contagem
  const cats = Object.entries(contagem).sort((a, b) => b[1] - a[1]);

  let html = `<div class="cat-item ${!EstoqueModule.filtroCategoria ? 'active' : ''}" onclick="EstoqueModule.filtroCategoria=null;EstoqueModule.page=0;renderEstoque();">
    <span>Todas</span><span class="cat-count">${total}</span></div>`;

  for (const [cat, count] of cats) {
    const active = EstoqueModule.filtroCategoria === cat ? 'active' : '';
    html += `<div class="cat-item ${active}" onclick="EstoqueModule.filtroCategoria='${esc(cat)}';EstoqueModule.page=0;renderEstoque();">
      <span>${esc(typeof etapaLabel === 'function' ? etapaLabel(cat) : cat)}</span><span class="cat-count">${count}</span></div>`;
  }

  el.innerHTML = html;
}


// ══════════════════════════════════════════════════════════════════
// HISTORICO DO MATERIAL (Modal)
// ══════════════════════════════════════════════════════════════════

function _rotuloOrigensEstoque(origens) {
  return (origens || []).map(o => {
    const qtd = Number(o.qtd).toLocaleString('pt-BR', { maximumFractionDigits: 20 });
    if (o.tipo === 'nf') {
      const nota = notas.find(n => n.id === o.nota_id);
      return 'NF ' + (nota?.numero_nf || nota?.numero || nota?.nf || '---') + ' / item ' + (Number(o.item_idx) + 1) + ': ' + qtd;
    }
    const nome = { entrada_direta: 'Entrada sem NF', contagem: 'Contagem física',
      ajuste: 'Ajuste', sem_origem: 'Sem origem — conferir' }[o.tipo] || 'Origem a conferir';
    return nome + ': ' + qtd;
  }).join(' · ');
}

// Conferencia por administrador: proposta no servidor antes de qualquer vinculo.
let _regEstoque = null;
let _regEstoqueOcupado = false;
function _regContexto() {
  const c = _contextoSaidaEstoque();
  return c && { ...c, chave: 'edr.estoque.regularizacao.v1:' + c.empresa + ':' + c.usuario };
}
function _regPendente(c) {
  const raw = localStorage.getItem(c.chave);
  if (!raw) return null;
  const p = JSON.parse(raw);
  if (p.empresa !== c.empresa || p.usuario !== c.usuario || !p.params?.p_operacao_id || p.versao !== 1) {
    throw Error('Confirmação pendente inválida. Preserve o registro e solicite conferência.');
  }
  return p;
}
function _regData(valor) {
  const p = String(valor || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return p ? p[3] + '/' + p[2] + '/' + p[1] : 'Data não informada';
}
function _regModal(html) {
  const content = document.getElementById('hist-modal')?.querySelector('.modal');
  if (!content) throw Error('Tela de conferência indisponível.');
  content.innerHTML = `<div class="modal-title-v2"><h3>Conferir origens</h3><button class="modal-close" aria-label="Fechar conferência" onclick="fecharConferenciaEstoque()">×</button></div><div style="line-height:1.5;overflow-wrap:anywhere;">${html}</div>`;
  openModal('hist-modal');
}
function fecharConferenciaEstoque() { _regEstoque = null; closeModal('hist-modal'); }
async function abrirConferenciaEstoque(materialId) {
  if (_regEstoqueOcupado) return;
  const c = _regContexto();
  if (!c || usuarioAtual?.perfil !== 'admin') return showToast('A conferência de origens exige administrador.', 6000);
  const s = { c, materialId, proposta: null };
  _regEstoque = s;
  try {
    const pendente = _regPendente(c);
    if (pendente) {
      s.pendente = pendente;
      _regModal('<p>Uma regularização ficou sem confirmação. Confira o resultado antes de iniciar outra.</p><button class="btn btn-primary" style="margin-top:12px;" id="reg-aplicar" onclick="recuperarRegularizacaoEstoque()">Conferir resultado anterior</button>');
      return;
    }
    _regModal('<p role="status">Carregando saídas e comprovantes cadastrados…</p>');
    const resultados = await Promise.all([loadNotas(), loadLancamentos(), loadDistribuicoes(), loadEntradasDiretas(), loadAjustesEstoque(), loadMateriais()]);
    if (_regEstoque !== s || _regContexto()?.chave !== c.chave) return;
    if (resultados.some(x => x !== true)) throw Error('Os dados não carregaram por completo. Tente novamente.');
    if (estoqueContratoAtual()?.regularizacao !== 1) throw Error('Regularização ainda indisponível neste ambiente.');
    s.material = catalogoMateriais.find(m => m.id === materialId);
    if (!s.material) throw Error('Material indisponível nesta empresa.');
    s.pendencias = distribuicoes.flatMap(d => (d.origens || []).filter(o => o.tipo === 'sem_origem' && o.material_id === materialId).map(o => ({ ...o, saida: d })));
    s.auditoria = await sbGetAll('estoque_regularizacoes', '?material_id=eq.' + encodeURIComponent(materialId) + '&order=criado_em.desc', { throwOnError: true });
    if (_regEstoque !== s || _regContexto()?.chave !== c.chave) return;
    if (s.auditoria.some(a => a.company_id !== c.empresa || a.material_id !== materialId)) throw Error('Conferência recebida não corresponde à empresa/material.');
    _regRenderFila(s);
  } catch (e) {
    if (_regEstoque === s && _regContexto()?.chave === c.chave) _regModal('<p role="alert">' + esc(e.message) + '</p>');
  }
}
function _regRenderFila(s) {
  _regModal(`<p><strong>${esc(s.material.nome)}</strong> · ${esc(s.material.unidade)}</p>
    <p>Vincule somente um recebimento comprovado anterior à saída. Recebimento omitido precisa ser cadastrado e conferido primeiro.</p>
    ${s.pendencias.length ? s.pendencias.map((o, i) => `<div class="hist-item"><div class="hist-content"><strong>${esc(o.saida.obra_nome)}</strong><p>${esc(_regData(o.saida.data))} · ${fmtQtd(o.qtd)} ${esc(s.material.unidade)} sem origem · ${fmtR(o.custo)} estimados</p><button class="btn-secondary" onclick="selecionarPendenciaEstoque(${i})">Conferir esta saída</button></div></div>`).join('') : '<p>Nenhuma quantidade sem origem neste material.</p>'}
    ${s.auditoria.length ? '<h4>Conferências registradas</h4>' + s.auditoria.map(a => `<div class="hist-item"><div class="hist-content"><strong>${fmtQtd(a.proposta.qtd)} ${esc(s.material.unidade)} · ${a.pedido.tipo === 'nf' ? 'NF' : 'Entrada sem NF'}</strong><p>${esc(_regData(a.criado_em))} · responsável ${esc(a.ator)}</p><p>Comprovante: ${esc(a.pedido.evidencia)}</p><p>${esc(a.pedido.justificativa)}</p><p>Custo mantido: ${fmtR(a.proposta.custo_mantido)} · diferença de referência: ${fmtR(a.proposta.diferenca_referencia)}</p></div></div>`).join('') : ''}`);
}
function selecionarPendenciaEstoque(indice) {
  const s = _regEstoque;
  if (!s || _regEstoqueOcupado || _regContexto()?.chave !== s.c.chave) return;
  s.pendencia = s.pendencias[indice];
  if (!s.pendencia) return;
  s.proposta = null; s.fonte = null;
  const m = s.material;
  const confere = (codigo, nome) => codigo ? codigo === m.codigo : norm(nome) === norm(m.nome);
  const limite = new Date(s.pendencia.saida.estoque_efetivo_em).getTime();
  s.fontes = [];
  for (const n of notas.filter(n => n.obra === 'EDR' && n.natureza !== 'DEVOLUCAO')) {
    const momento = _momentoMovimentoEstoque(_dataMovimentoNotaEstoque(n), n.criado_em);
    if (!momento || new Date(momento).getTime() > limite) continue;
    parseItens(n).forEach((it, idx) => {
      if (confere(it.codigo_catalogo || it.codigo || it.cod, it.descricao || it.desc)) s.fontes.push({ tipo: 'nf', id: n.id, idx,
        rotulo: `NF ${n.numero_nf || 'sem número'} · item ${idx + 1} · ${n.fornecedor || 'sem fornecedor'} · ${_regData(_dataMovimentoNotaEstoque(n))}` });
    });
  }
  for (const e of entradasDiretas) {
    const momento = _momentoMovimentoEstoque(e.data, e.criado_em);
    if (e.obra === 'EDR' && !e.nf_vinculada && confere(e.codigo_catalogo, e.item_desc) && momento && new Date(momento).getTime() <= limite) {
      s.fontes.push({ tipo: 'entrada_direta', id: e.id, idx: null, rotulo: `Entrada sem NF · ${e.fornecedor || 'sem fornecedor'} · ${_regData(e.data)} · ${fmtQtd(e.qtd)} ${e.unidade}` });
    }
  }
  _regModal(`<p><strong>${esc(m.nome)}</strong> · saída para ${esc(s.pendencia.saida.obra_nome)} em ${esc(_regData(s.pendencia.saida.data))}</p>
    <p>Sem origem: ${fmtQtd(s.pendencia.qtd)} ${esc(m.unidade)}</p>
    <label for="reg-qtd">Quantidade a regularizar (${esc(m.unidade)})</label><input class="form-input" id="reg-qtd" type="number" min="0" step="any" value="${Number(s.pendencia.qtd)}" oninput="invalidarPropostaEstoque()">
    <label for="reg-busca">Buscar NF ou entrada comprovada</label><input class="form-input" id="reg-busca" type="text" inputmode="search" placeholder="Número, fornecedor ou data" oninput="buscarOrigemRegularizacao()" autocomplete="off">
    <div id="reg-fontes"></div><p id="reg-selecionada" role="status"></p>
    <label for="reg-evidencia">Referência do comprovante</label><input class="form-input" id="reg-evidencia" type="text" maxlength="2000" placeholder="Ex.: canhoto NF 123, recebido em 05/09">
    <label for="reg-motivo">Justificativa da conferência</label><textarea class="form-input" id="reg-motivo" maxlength="2000" rows="2"></textarea>
    <button class="btn-secondary" style="margin:12px 0;" id="reg-propor" onclick="proporRegularizacaoEstoque()">Conferir proposta</button><div id="reg-proposta" aria-live="polite"></div>`);
  buscarOrigemRegularizacao();
}
function invalidarPropostaEstoque() {
  if (_regEstoque) _regEstoque.proposta = null;
  const el = document.getElementById('reg-proposta'); if (el) el.innerHTML = '';
}
function buscarOrigemRegularizacao() {
  const s = _regEstoque, el = document.getElementById('reg-fontes'); if (!s?.fontes || !el) return;
  const termo = norm(document.getElementById('reg-busca')?.value);
  const fontes = s.fontes.map((f, i) => ({ f, i })).filter(({ f }) => norm(f.rotulo).includes(termo));
  el.innerHTML = fontes.length ? fontes.slice(0, 10).map(({ f, i }) => `<button class="btn-secondary" style="display:block;width:100%;white-space:normal;text-align:left;margin:6px 0" onclick="selecionarOrigemRegularizacao(${i})">${esc(f.rotulo)}</button>`).join('') + (fontes.length > 10 ? '<p>Refine a busca para ver as demais origens.</p>' : '') : '<p>Nenhuma origem anterior encontrada. Confira se o recebimento foi cadastrado.</p>';
}
function selecionarOrigemRegularizacao(i) {
  const s = _regEstoque; if (!s || _regEstoqueOcupado) return;
  invalidarPropostaEstoque(); s.fonte = s.fontes[i];
  document.getElementById('reg-selecionada').textContent = s.fonte ? 'Selecionada: ' + s.fonte.rotulo : '';
}
async function proporRegularizacaoEstoque() {
  const s = _regEstoque; if (!s?.fonte || _regEstoqueOcupado) return showToast('Selecione a origem comprovada.', 5000);
  if (_regContexto()?.chave !== s.c.chave) return showToast('A sessão mudou. Reabra a conferência.', 5000);
  const qtd = Number(document.getElementById('reg-qtd').value);
  if (!Number.isFinite(qtd) || qtd <= 0 || qtd > Number(s.pendencia.qtd)) return showToast('Informe uma quantidade positiva dentro da pendência.', 5000);
  invalidarPropostaEstoque();
  const params = { p_pendencia_id: s.pendencia.id, p_tipo: s.fonte.tipo, p_origem_id: s.fonte.id, p_item_idx: s.fonte.idx, p_qtd: qtd };
  _regEstoqueOcupado = true;
  try {
    const r = await sbRpcEstoque('propor_regularizacao_estoque', params);
    if (_regEstoque !== s || _regContexto()?.chave !== s.c.chave) return;
    if (!r.ok) throw Error(r.mensagem || 'Não foi possível conferir a proposta.');
    const p = r.dados;
    if (!p?.revisao || p.company_id !== s.c.empresa || p.pendencia_id !== params.p_pendencia_id || Number(p.qtd) !== qtd) throw Error('Proposta recebida não corresponde à conferência.');
    // Alterar quantidade durante a espera nao pode confirmar uma proposta diferente.
    if (Number(document.getElementById('reg-qtd')?.value) !== qtd) return;
    s.proposta = { params, dados: p };
    document.getElementById('reg-proposta').innerHTML = `<h4>Proposta conferida</h4><p>${fmtQtd(p.qtd)} ${esc(p.unidade)} · ${esc(s.fonte.rotulo)}</p>
      <p>Saldo: ${fmtQtd(p.saldo_antes)} → ${fmtQtd(p.saldo_depois)} ${esc(p.unidade)}. Pendência restante: ${fmtQtd(p.pendencia_restante)} ${esc(p.unidade)}.</p>
      <p>Custo já lançado: <strong>${fmtR(p.custo_mantido)}</strong>. Custo da origem: ${fmtR(p.custo_referencia)}. Diferença de referência: ${fmtR(p.diferenca_referencia)}.</p>
      <label style="display:block;margin:12px 0"><input type="checkbox" id="reg-custo"> Conferi o comprovante e quero manter o custo já lançado. A diferença ficará registrada para análise.</label>
      <button class="btn btn-primary" style="margin-top:12px;" id="reg-aplicar" onclick="aplicarRegularizacaoEstoque()">Confirmar regularização</button>`;
  } catch (e) { if (_regEstoque === s && _regContexto()?.chave === s.c.chave) showToast(e.message, 7000); }
  finally { _regEstoqueOcupado = false; }
}
async function aplicarRegularizacaoEstoque() {
  const s = _regEstoque;
  if (!s?.proposta || _regEstoqueOcupado) return;
  try {
    if (_regContexto()?.chave !== s.c.chave) throw Error('A sessão mudou. Reabra a conferência.');
    if (_regPendente(s.c)) throw Error('Há uma confirmação pendente. Reabra a conferência para recuperá-la.');
    if (!document.getElementById('reg-custo')?.checked) throw Error('Confirme a conferência do comprovante e a manutenção do custo.');
    const evidencia = document.getElementById('reg-evidencia').value.trim(), motivo = document.getElementById('reg-motivo').value.trim();
    if (evidencia.length < 10 || motivo.length < 10) throw Error('Detalhe o comprovante e a justificativa (mínimo de 10 caracteres cada).');
    const p = { versao: 1, empresa: s.c.empresa, usuario: s.c.usuario, params: { ...s.proposta.params, p_operacao_id: crypto.randomUUID(),
      p_revisao: s.proposta.dados.revisao, p_evidencia: evidencia, p_justificativa: motivo, p_tratamento_custo: 'manter_custo_registrado' } };
    await _regEnviar(s, p, false);
  } catch (e) { showToast(e.message, 7000); }
}
async function recuperarRegularizacaoEstoque() {
  const s = _regEstoque; if (!s || _regEstoqueOcupado) return;
  try { const p = _regPendente(s.c); if (p) await _regEnviar(s, p, true); }
  catch (e) { showToast(e.message, 7000); }
}
async function _regEnviar(s, p, jaIncerta) {
  if (_regEstoqueOcupado) return;
  if (_regContexto()?.chave !== s.c.chave) throw Error('A sessão mudou. Reabra a conferência.');
  _regEstoqueOcupado = true;
  const botao = document.getElementById('reg-aplicar'); if (botao) botao.disabled = true;
  try {
    // Persiste antes do envio: recarga/queda reaproveita exatamente a operacao autorizada.
    localStorage.setItem(s.c.chave, JSON.stringify(p));
    const r = await sbRpcEstoque('regularizar_origem_estoque', p.params);
    if (_regContexto()?.chave !== s.c.chave) throw Error('Confira o resultado na empresa de origem.');
    if (!r.ok) {
      if (!r.incerto && !jaIncerta) { localStorage.removeItem(s.c.chave); invalidarPropostaEstoque(); }
      throw Error((r.mensagem || 'Sem confirmação da regularização.') + ((r.incerto || jaIncerta) ? ' Reabra a conferência para recuperar o resultado.' : ' Confira uma nova proposta.'));
    }
    if (r.dados?.status !== 'regularizada' || r.dados.operacao_id !== p.params.p_operacao_id || r.dados.company_id !== s.c.empresa || r.dados.pendencia_id !== p.params.p_pendencia_id) {
      throw Error('Resposta incompleta. Reabra a conferência para recuperar o resultado.');
    }
    localStorage.removeItem(s.c.chave);
    if (_regEstoque === s) fecharConferenciaEstoque();
    let atualizou = false;
    try { atualizou = (await Promise.all([loadNotas(), loadDistribuicoes(), loadEntradasDiretas(), loadAjustesEstoque()])).every(x => x === true); } catch (_) {}
    if (_regContexto()?.chave !== s.c.chave) return;
    if (atualizou) renderEstoque();
    showToast(r.dados.saida_excluida ? 'Regularização já confirmada; a saída foi posteriormente excluída.' : atualizou ? 'Origem regularizada. Custo mantido e conferência registrada.' : 'Regularização confirmada, mas a atualização dos dados falhou. Atualize a página.', 7000);
  } finally { _regEstoqueOcupado = false; if (botao) botao.disabled = false; }
}


function abrirHistoricoMaterial(chave) {
  _regEstoque = null;
  const item = EstoqueModule._consolidado.find(i => i.chave === chave);
  if (!item) return showToast('Material nao encontrado', 5000);
  const unidade = esc(_unidadeEstoqueExibicao(item.unidade));

  // Coletar movimentacoes
  const movs = [];

  // Entradas NF (lotes)
  for (const lote of item.lotes) {
    movs.push({
      tipo: 'entrada',
      desc: `NF ${lote.nf || '---'} — ${lote.fornecedor || 'Fornecedor'}`,
      data: lote.data,
      qtd: lote.qtd,
      meta: `Lote #${item.lotes.indexOf(lote) + 1} · ${fmtR(lote.valor_un)}/${unidade}`,
      nota_id: lote.nota_id,
    });
  }

  // Entradas diretas
  if (typeof entradasDiretas !== 'undefined') {
    const nDesc = norm(item.desc);
    for (const e of entradasDiretas) {
      const match = (item.codigo && e.codigo_catalogo === item.codigo) || norm(e.item_desc) === nDesc;
      if (match) {
        movs.push({
          tipo: 'entrada_direta',
          desc: `Entrada Direta — ${e.fornecedor || 'Compra balcao'}`,
          data: e.data,
          qtd: parseFloat(e.qtd) || 0,
          meta: `Sem NF · ${fmtR(e.preco)}/${unidade}`,
        });
      }
    }
  }

  // Ajustes
  if (typeof ajustesEstoque !== 'undefined') {
    const nDesc = norm(item.desc);
    for (const a of ajustesEstoque) {
      const match = (item.codigo && a.codigo_catalogo === item.codigo) || norm(a.item_desc) === nDesc;
      if (match) {
        const alvoAbsoluto = _alvoAbsolutoAjuste(a);
        const ehZeragem = alvoAbsoluto === 0 && /\bzer(?:agem|ar|ad[oa])\b/i.test(String(a.motivo || ''));
        movs.push({
          tipo: alvoAbsoluto !== null ? 'contagem' : 'ajuste',
          desc: ehZeragem
            ? 'Zeragem — saldo definido em 0'
            : alvoAbsoluto !== null
              ? `Contagem física — saldo definido em ${fmtQtd(alvoAbsoluto)} ${unidade}`
              : `Ajuste — ${a.motivo || 'Correção manual'}`,
          data: String(a.criado_em || a.data || '').slice(0, 10),
          qtd: alvoAbsoluto !== null ? alvoAbsoluto : (parseFloat(a.qtd) || 0),
          meta: alvoAbsoluto !== null ? `Saldo absoluto · ${a.motivo || 'contagem física'}` : (a.tipo || 'ajuste'),
        });
      }
    }
  }

  // Distribuicoes (saidas)
  if (typeof distribuicoes !== 'undefined') {
    const nDesc = norm(item.desc);
    for (const d of distribuicoes) {
      const match = (item.codigo && d.codigo_catalogo === item.codigo) || norm(d.item_desc) === nDesc;
      if (match) {
        const notaOrigem = d.nota_id ? notas.find(n => n.id === d.nota_id) : null;
        const lancamentoOrigem = d.lancamento_id && typeof lancamentos !== 'undefined'
          ? lancamentos.find(l => l.id === d.lancamento_id)
          : null;
        const diretoNaObra = !!(
          (notaOrigem?.obra && notaOrigem.obra !== COMPANY_DEFAULTS.estoqueGeral) ||
          lancamentoOrigem?.origem === 'compra_direta'
        );
        movs.push({
          tipo: diretoNaObra ? 'direto_obra' : 'saida',
          desc: diretoNaObra
            ? `Direto na obra → ${d.obra_nome || notaOrigem?.obra || '---'}`
            : `Saída do almoxarifado → ${d.obra_nome || '---'}`,
          data: d.data,
          qtd: parseFloat(d.qtd) || 0,
          meta: diretoNaObra
            ? `Não passou pelo almoxarifado · Etapa: ${d.etapa || '---'} · ${fmtR(d.valor || 0)}`
            : `Etapa: ${d.etapa || '---'} · ${fmtR(d.valor || 0)}${d.origens?.length ? ' · ' + _rotuloOrigensEstoque(d.origens) : ''}`,
          nota_id: d.nota_id || null,
        });
      }
    }
  }

  // Ordenar por data desc
  movs.sort((a, b) => (b.data || '').localeCompare(a.data || ''));

  // Calcular badges resumo
  const totalNF = item.entradas;
  const totalDireta = item.entradasDiretas;
  const totalAjuste = item.ajustes;
  const totalSaida = item.saidas;
  const totalDiretoObra = movs
    .filter(m => m.tipo === 'direto_obra')
    .reduce((s, m) => s + m.qtd, 0);
  const ultimaContagem = movs.find(m => m.tipo === 'contagem') || null;
  // Render modal
  const modal = document.getElementById('hist-modal');
  if (!modal) return;

  const content = modal.querySelector('.modal');
  if (!content) return;

  content.innerHTML = `
    <div class="modal-title-v2">
      <h3><span class="material-symbols-outlined">history</span> Histórico — ${esc(item.desc)}</h3>
      <button class="modal-close" onclick="closeModal('hist-modal')"><span class="material-symbols-outlined">close</span></button>
    </div>
    <div class="hist-badges">
      <span class="hist-badge hist-badge-nf">+${fmtQtd(totalNF)} ${unidade} por NF</span>
      <span class="hist-badge hist-badge-direta">+${fmtQtd(totalDireta)} ${unidade} entrada manual</span>
      ${totalAjuste !== 0 ? `<span class="hist-badge hist-badge-ajuste">${totalAjuste > 0 ? '+' : ''}${fmtQtd(totalAjuste)} ${unidade} ajuste</span>` : ''}
      ${ultimaContagem ? `<span class="hist-badge hist-badge-ajuste">Saldo definido em ${fmtQtd(ultimaContagem.qtd)} ${unidade} · ${esc(ultimaContagem.data || 'data não informada')}</span>` : ''}
      <span class="hist-badge hist-badge-saida">-${fmtQtd(totalSaida)} ${unidade} saída do almoxarifado</span>
      ${totalDiretoObra > 0 ? `<span class="hist-badge hist-badge-obra">${fmtQtd(totalDiretoObra)} ${unidade} direto à obra · fora do saldo</span>` : ''}
    </div>
    <div class="saldo-final">
      <div class="saldo-final-label">Saldo no almoxarifado</div>
      <div class="saldo-final-value" style="color:${item.saldo < 0 ? 'var(--error)' : item.saldo > 0 ? 'var(--primary)' : 'var(--text-primary)'};">${fmtQtd(item.saldo)} ${unidade}</div>
    </div>
    ${usuarioAtual?.perfil === 'admin' && estoqueContratoAtual()?.regularizacao === 1 && (catalogoMateriais || []).some(m => m.codigo === item.codigo) ? `<button class="btn-secondary" style="margin-top:12px;" onclick="abrirConferenciaEstoque('${esc(catalogoMateriais.find(m => m.codigo === item.codigo).id)}')">Conferir origens e pendências</button>` : ''}
    <div class="hist-timeline" style="margin-top:16px;">
      ${movs.map(m => {
        const isSaida = m.tipo === 'saida';
        const isAjuste = m.tipo === 'ajuste';
        const isContagem = m.tipo === 'contagem';
        const isDiretoObra = m.tipo === 'direto_obra';
        const iconClass = isDiretoObra ? 'direto-obra' : isSaida ? 'saida' : isContagem ? 'contagem' : isAjuste ? 'ajuste' : 'entrada';
        const iconName = isDiretoObra ? 'construction' : isSaida ? 'arrow_upward' : isContagem ? 'restart_alt' : isAjuste ? 'sync_alt' : 'arrow_downward';
        const qtyClass = isDiretoObra ? 'neutral' : isContagem ? 'count' : isSaida ? 'minus' : 'plus';
        const qtyPrefix = (isDiretoObra || isContagem) ? '' : isSaida ? '-' : '+';
        const corDescricao = isDiretoObra ? '#0e7490' : isSaida ? 'var(--error)' : 'var(--primary)';
        const clickNota = m.nota_id ? ` style="cursor:pointer;color:${corDescricao};" onclick="closeModal('hist-modal');abrirNota('${esc(m.nota_id)}')"` : '';
        return `<div class="hist-item">
          <div class="hist-icon ${iconClass}"><span class="material-symbols-outlined">${iconName}</span></div>
          <div class="hist-content">
            <div class="hist-desc"${clickNota}>${esc(m.desc)}</div>
            <div class="hist-meta">${esc(m.data || '---')} · ${esc(m.meta)}</div>
          </div>
          <div class="hist-qty ${qtyClass}">${qtyPrefix}${fmtQtd(m.qtd)} ${unidade}</div>
        </div>`;
      }).join('')}
    </div>
    <div class="btn-row btn-row-mt">
      ${item.saldo > 0 ? `<button class="btn-primary" style="flex:1;justify-content:center;" onclick="closeModal('hist-modal');abrirDistribuicao('${esc(item.chave)}');">
        <span class="material-symbols-outlined icon-md">local_shipping</span> Distribuir</button>` : ''}
      <button class="btn-secondary" style="flex:1;justify-content:center;" onclick="closeModal('hist-modal');abrirAjusteEstoque('${esc(item.chave)}');">
        <span class="material-symbols-outlined icon-md">tune</span> Ajustar Qtd</button>
    </div>`;

  openModal('hist-modal');
}


// ══════════════════════════════════════════════════════════════════
// DISTRIBUICAO / SAIDA (Modal com FIFO)
// ══════════════════════════════════════════════════════════════════

// TODO: Migrar para RPC no Supabase na Fase 5
// A logica FIFO ainda roda no frontend. A protecao entre sessoes exige
// uma chamada atomica via sbPost('rpc/...') com alocacoes por origem.
// A trava abaixo impede apenas cliques simultaneos na mesma aba.
async function confirmarDistribuicaoItem(chave, obraDestino, etapa, quantidade, dataSaida) {
  return _executarSaidaEstoque(() => _gravarDistribuicaoItem(chave, obraDestino, etapa, quantidade, dataSaida));
}

async function _gravarDistribuicaoItem(chave, obraDestino, etapa, quantidade, dataSaida) {
  const item = EstoqueModule._consolidado.find(i => i.chave === chave);
  if (!item) return showToast('Material nao encontrado', 5000);

  const qtd = parseFloat(quantidade) || 0;
  if (!Number.isFinite(qtd) || qtd <= 0) return showToast('Quantidade invalida', 5000);

  if (!obraDestino) return showToast('Selecione a obra destino', 5000);
  if (!etapa) return showToast('Selecione a etapa/centro de custo', 5000);

  if (_usarSaidaAtomica()) return _registrarSaidaAtomica({ item, qtd, obraId: obraDestino, etapa, data: dataSaida || hojeISO(), criterio: 'fifo' });

  // Verificar saldo
  if (qtd > item.saldo) {
    const ok = await confirmar(`Saldo insuficiente (${Number(item.saldo).toLocaleString('pt-BR')} ${item.unidade}). Distribuir ${qtd} vai gerar saldo negativo. Confirmar?`);
    if (!ok) return;
  }

  const plano = _planejarOrigemSaidaEstoque(item, qtd, dataSaida || hojeISO());
  if (!plano.ok) return showToast(plano.erro, 7000);
  const valorProporcional = plano.valor;

  // FIX: lançamento PRIMEIRO (com campos corretos: qtd/preco/total, não valor/tipo)
  // depois distribuicao vinculada ao lancamento e ao unico item de origem

  const descLanc = item.codigo
    ? `${item.codigo} · ${item.desc} (distribuicao estoque)`
    : `${item.desc} (distribuicao estoque)`;

  const precoMedio = qtd > 0 ? (valorProporcional / qtd) : 0;
  const lanc = await sbPost('lancamentos', {
    obra_id: obraDestino,
    descricao: descLanc,
    qtd,
    preco: precoMedio,
    total: valorProporcional,
    etapa,
    data: dataSaida || hojeISO(),
    origem: 'distribuicao_estoque',
    nota_id: plano.origem?.nota_id || null,
    ...custoClassificacaoNovo(obraDestino)
  });
  // Custo primeiro e checado: distribuir do almox SEMPRE gera lancamento (mesmo valor 0).
  // !lanc = falha real de gravacao -> aborta, nao baixa estoque, nao mostra sucesso.
  if (!lanc) return showToast('Erro ao lancar o custo. Nada foi distribuido.', 5000);

  const payload = {
    item_desc: item.desc,
    item_idx: plano.origem?.item_idx ?? 0,
    codigo_catalogo: item.codigo || null,
    obra_id: obraDestino,
    obra_nome: obras.find(o => o.id === obraDestino)?.nome || '',
    etapa,
    qtd,
    valor: valorProporcional,
    data: dataSaida || hojeISO(),
    nota_id: plano.origem?.nota_id || null,
    lancamento_id: lanc.id,
  };

  const resp = await sbPost('distribuicoes', payload);
  if (!resp) {
    // Distribuicao falhou DEPOIS do custo gravado: rollback best-effort do lancamento
    // (criado agora nesta funcao, sem dependentes) — evita custo sem baixa e retry que duplica custo.
    const desfeito = await sbDelete('lancamentos', lanc.id);
    if (desfeito) {
      showToast('Falha ao baixar o estoque. O custo foi revertido — tente novamente.', 8000);
    } else {
      showToast('Falha ao baixar o estoque e o custo NAO pode ser revertido. Verifique antes de redistribuir.', 8000);
    }
    if (typeof loadLancamentos === 'function') await loadLancamentos();
    if (typeof loadDistribuicoes === 'function') await loadDistribuicoes();
    renderEstoque();
    if (typeof renderDashboard === 'function') renderDashboard();
    return;
  }

  showToast(`${fmt(qtd)} ${item.unidade} distribuido(s) com sucesso`);
  closeModal('dist-modal');

  // Recarregar dados (distribuicoes + lancamentos para o P&L/dashboard nao ficar stale)
  if (typeof loadDistribuicoes === 'function') await loadDistribuicoes();
  if (typeof loadLancamentos === 'function') await loadLancamentos();

  renderEstoque();
  if (typeof renderDashboard === 'function') renderDashboard();
}


// ── ABRIR MODAL DISTRIBUICAO ────────────────────────────────────
function abrirDistribuicao(chave) {
  const item = EstoqueModule._consolidado.find(i => i.chave === chave);
  if (!item) return;

  const modal = document.getElementById('dist-modal');
  if (!modal) return;

  const content = modal.querySelector('.modal');
  if (!content) return;

  // Lotes FIFO ordenados
  const lotesOrdenados = [...item.lotes]
    .filter(l => l.qtd_disponivel > 0)
    .sort((a, b) => (a.data || '').localeCompare(b.data || ''));

  // Obras disponiveis
  const obrasOpts = (typeof obras !== 'undefined' && Array.isArray(obras))
    ? obras.map(o => `<option value="${esc(o.id)}">${esc(o.nome)}</option>`).join('')
    : '<option value="">Nenhuma obra</option>';

  // Etapas (ETAPAS como fonte unica)
  const etapasOpts = (typeof etapaSelectOpts === 'function')
    ? etapaSelectOpts('', false)
    : '';

  content.innerHTML = `
    <div class="modal-title-v2">
      <h3><span class="material-symbols-outlined">local_shipping</span> Distribuir Material</h3>
      <button class="modal-close" onclick="closeModal('dist-modal')"><span class="material-symbols-outlined">close</span></button>
    </div>
    <div class="info-box">
      <div class="info-box-title">${esc(item.desc)}</div>
      <div class="info-box-sub">
        ${item.codigo ? `Codigo: ${esc(item.codigo)} · ` : ''}Saldo disponivel: <strong style="color:var(--primary);">${fmtQtd(item.saldo)} ${esc(item.unidade)}</strong>
      </div>
    </div>
    <div class="dist-form-grid">
      <div class="dist-form-field">
        <label class="dist-form-label">Obra Destino</label>
        <select class="dist-form-input" id="dist-obra">
          <option value="">Selecione a obra...</option>
          ${obrasOpts}
        </select>
      </div>
      <div class="dist-form-field">
        <label class="dist-form-label">Etapa / Centro de Custo</label>
        <select class="dist-form-input" id="dist-etapa">
          <option value="">Selecione a etapa...</option>
          ${etapasOpts}
        </select>
      </div>
      <div class="dist-form-field">
        <label class="dist-form-label">Quantidade</label>
        <input class="dist-form-input" id="dist-qtd" type="number" value="1" min="1" max="${item.saldo > 0 ? item.saldo : 9999}" oninput="_atualizarValorDistribuicao('${esc(item.chave)}')"/>
      </div>
      <div class="dist-form-field">
        <label class="dist-form-label">Data de Saída</label>
        <input class="dist-form-input" id="dist-data" type="date" value="${hojeISO()}" onchange="_atualizarValorDistribuicao('${esc(item.chave)}')"/>
      </div>
      <div class="dist-form-field">
        <label class="dist-form-label">Valor Estimado</label>
        <input class="dist-form-input" id="dist-valor" type="text" value="${fmtR(_estimarValorSaidaFIFO(item, 1, hojeISO()))}" readonly style="font-weight:700;color:var(--primary);background:var(--primary-surface);"/>
      </div>
    </div>
    ${lotesOrdenados.length ? `
    <div class="dist-fifo-info">
      <div style="font-weight:700;margin-bottom:8px;color:var(--text-primary);">
        <span class="material-symbols-outlined icon-sm icon-inline" style="color:var(--primary);">info</span>
        Consumo FIFO (nota mais antiga primeiro)
      </div>
      ${lotesOrdenados.map((l, i) => `
        <div class="dist-lote">
          <span>Lote #${i + 1} — NF ${esc(l.nf || '---')} (${esc(l.data || '---')})</span>
          <span><strong>${fmtQtd(l.qtd_disponivel)} ${esc(item.unidade)}</strong> disp. · ${fmtR(l.valor_un)}/${esc(item.unidade)}</span>
        </div>`).join('')}
    </div>` : ''}
    <div class="btn-row btn-row-mt" style="margin-top:24px;">
      <button id="btn-confirmar-distribuicao" class="btn-primary" style="flex:1;padding:14px;font-size:15px;justify-content:center;"
        onclick="confirmarDistribuicaoItem('${esc(item.chave)}', document.getElementById('dist-obra').value, document.getElementById('dist-etapa').value, document.getElementById('dist-qtd').value, document.getElementById('dist-data').value)">
        <span class="material-symbols-outlined icon-lg">check_circle</span>
        Confirmar Distribuicao
      </button>
    </div>`;

  openModal('dist-modal');
}

// Previa acompanha os lotes FIFO; a gravacao confere novamente no servidor.
function _estimarValorSaidaFIFO(item, qtd, data) {
  if (!Number.isFinite(qtd) || qtd <= 0) return 0;
  let restante = qtd, valor = 0;
  for (const lote of item?._lotesOperacionais || []) {
    if (lote.data && String(lote.data).slice(0, 10) > data) continue;
    const usar = Math.min(Math.max(0, Number(lote.qtd_disponivel) || 0), restante);
    valor += usar * (Number(lote.valor_un) || 0);
    restante -= usar;
    if (restante <= 0) break;
  }
  return valor + Math.max(0, restante) * (Number(item?.valorMedio) || 0);
}

function _atualizarValorDistribuicao(chave) {
  const item = EstoqueModule._consolidado.find(i => i.chave === chave);
  if (!item) return;
  const qtd = parseFloat(document.getElementById('dist-qtd')?.value) || 0;
  const el = document.getElementById('dist-valor');
  const data = document.getElementById('dist-data')?.value || hojeISO();
  if (el) el.value = fmtR(_estimarValorSaidaFIFO(item, qtd, data));
}


// ══════════════════════════════════════════════════════════════════
// AJUSTE RAPIDO DE ESTOQUE
// ══════════════════════════════════════════════════════════════════

async function abrirAjusteEstoque(chave) {
  if (!chave) { _abrirModalAjusteGeral(); return; }
  const item = EstoqueModule._consolidado.find(i => i.chave === chave);
  if (!item) return;

  // Modal customizado — sem prompt() nativo (causa tela preta)
  const real = await new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay active';
    overlay.id = '_ajuste-rapido-overlay';
    overlay.innerHTML = `
      <div class="modal-box" style="max-width:400px;">
        <div class="modal-header">
          <span class="modal-title">Ajuste de Estoque</span>
          <button class="modal-close" onclick="document.getElementById('_ajuste-rapido-overlay').remove()">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
        <div class="modal-body" style="padding:16px 20px;">
          <p style="font-size:13px;color:var(--text-secondary);margin-bottom:14px;">
            Contagem física de <strong style="color:var(--text-primary);">${esc(item.desc)}</strong><br>
            Saldo sistema: <strong style="color:var(--primary);">${fmt(item.saldo)} ${esc(item.unidade)}</strong>
          </p>
          <label class="dist-form-label">Digite a quantidade real:</label>
          <input id="_ajuste-qtd-input" type="number" step="any" class="dist-form-input" placeholder="0" style="margin-top:6px;width:100%;" />
          <label class="dist-form-label" style="margin-top:12px;">Corrigir valor unitário (opcional):</label>
          <input id="_ajuste-preco-input" type="number" step="0.01" min="0" class="dist-form-input" placeholder="Ex: 45.90" style="margin-top:6px;width:100%;" />
          <div style="font-size:11px;color:var(--text-tertiary);margin-top:4px;">Deixe em branco para manter o preço atual. Atualiza entradas sem preço definido.</div>
        </div>
        <div class="modal-footer">
          <button class="btn" id="_ajuste-cancel-btn">Cancelar</button>
          <button class="btn btn-primary" id="_ajuste-ok-btn">OK</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const inp = overlay.querySelector('#_ajuste-qtd-input');
    const inpPreco = overlay.querySelector('#_ajuste-preco-input');
    inp.focus();
    const fechar = (val) => { overlay.remove(); resolve(val); };
    overlay.querySelector('#_ajuste-ok-btn').onclick = () => fechar({ real: parseFloat(inp.value), preco: parseFloat(inpPreco.value) || null });
    overlay.querySelector('#_ajuste-cancel-btn').onclick = () => fechar(null);
    overlay.querySelector('.modal-close').onclick = () => fechar(null);
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') inpPreco.focus(); if (e.key === 'Escape') fechar(null); });
    inpPreco.addEventListener('keydown', e => { if (e.key === 'Enter') fechar({ real: parseFloat(inp.value), preco: parseFloat(inpPreco.value) || null }); if (e.key === 'Escape') fechar(null); });
  });

  if (real === null) return;
  const { real: realQtd, preco: novoPreco } = real;
  if (!Number.isFinite(realQtd) || realQtd < 0) return showToast('Quantidade inválida', 5000);

  const diferenca = realQtd - item.saldo;
  const formatarContagem = valor => Number(valor).toLocaleString('pt-BR', { maximumFractionDigits: 20 });
  const msgPreco = novoPreco ? `\nNovo preço unitário: ${fmtR(novoPreco)}` : '';
  // Mesmo sem diferenca, registrar a contagem preserva o corte do historico.

  const ok = await confirmar(`Ajustar "${esc(item.desc)}"?\nSaldo sistema: ${formatarContagem(item.saldo)}\nContagem real: ${formatarContagem(realQtd)}\nDiferença: ${diferenca > 0 ? '+' : ''}${formatarContagem(diferenca)}${msgPreco}`);
  if (!ok) return;

  {
    const resp = await sbPost('ajustes_estoque', {
      item_desc: item.desc,
      codigo_catalogo: item.codigo || null,
      qtd: diferenca,
      tipo: 'contagem',
      motivo: `Contagem fisica: sistema ${item.saldo}, real ${realQtd}, dif ${diferenca > 0 ? '+' : ''}${diferenca}`,
    });
    if (!resp) return showToast('Erro ao salvar ajuste', 5000);
  }
  const ajusteFeito = true; // contagem confirmada e gravada, inclusive quando o saldo confere

  // Preco opcional, INDEPENDENTE do ajuste. sbPatch (infra): objeto = atualizou / undefined = 0 linhas
  // (nenhuma entrada com preco=0) / null = erro HTTP. Nao desfaz o ajuste; toast honesto abaixo.
  let precoStatus = null; // null = nao informado | 'ok' | 'semmatch' | 'erro'
  if (novoPreco && novoPreco > 0) {
    const enc = encodeURIComponent(item.desc);
    const filtro = item.codigo
      ? `entradas_diretas?codigo_catalogo=eq.${encodeURIComponent(item.codigo)}&preco=eq.0`
      : `entradas_diretas?item_desc=ilike.${enc}&preco=eq.0`;
    const precoRes = await sbPatch(filtro, { preco: novoPreco });
    precoStatus = precoRes ? 'ok' : (precoRes === null ? 'erro' : 'semmatch');
  }

  // Toast final unico e honesto (consolida ajuste + preco sem misturar a logica de gravacao).
  const partes = [];
  if (ajusteFeito) partes.push(`Contagem registrada: ${formatarContagem(realQtd)} ${item.unidade}`);
  if (precoStatus === 'ok') partes.push(`Preço atualizado: ${fmtR(novoPreco)}/${item.unidade}`);
  else if (precoStatus === 'semmatch') partes.push('Preço não atualizado: nenhuma entrada sem preço compatível');
  else if (precoStatus === 'erro') partes.push('Erro ao atualizar o preço');
  const tipoToast = (precoStatus === 'erro' || precoStatus === 'semmatch') ? 'error' : 'success';
  if (partes.length) showToast(partes.join(' · '), tipoToast === 'error' ? 5000 : 3500);

  if (typeof loadAjustesEstoque === 'function') await loadAjustesEstoque();

  renderEstoque();
}


// ══════════════════════════════════════════════════════════════════
// VINCULAR CODIGO (Modal)
// ══════════════════════════════════════════════════════════════════

function abrirVincularCodigo(chave) {
  const item = EstoqueModule._consolidado.find(i => i.chave === chave);
  if (!item) return;

  const modal = document.getElementById('vincular-modal');
  if (!modal) return;
  const content = modal.querySelector('.modal');
  if (!content) return;

  // Proximo codigo disponivel
  const proximoCodigo = obterProximoCodigoDisponivel(EstoqueModule.catalogoMateriais);

  // Similares iniciais por palavras em comum
  const palavras = norm(item.desc).split(/\s+/).filter(p => p.length > 2);
  const _calcSimilares = (busca) => {
    const b = norm(busca || '');
    if (b.length >= 2) {
      return EstoqueModule.catalogoMateriais
        .filter(m => norm(m.nome).includes(b) || (m.codigo && m.codigo.toLowerCase().includes(b)))
        .slice(0, 12);
    }
    return EstoqueModule.catalogoMateriais
      .filter(m => { const nNome = norm(m.nome); return palavras.some(p => nNome.includes(p)); })
      .slice(0, 8);
  };

  const _renderOpcoes = (lista) => {
    if (!lista.length) return '<p style="color:var(--text-tertiary);text-align:center;padding:12px 0;font-size:13px;">Nenhum item encontrado</p>';
    return lista.map(s => `
      <label class="vincular-option">
        <input type="radio" name="vincular-item" value="${esc(s.id)}"/>
        <div>
          <div class="vincular-option-name">${esc(s.codigo || '—')} — ${esc(s.nome)}</div>
          <div class="vincular-option-sub">${esc(typeof etapaLabel === 'function' ? etapaLabel(s.categoria || '') : (s.categoria || ''))} · ${esc(s.unidade || '')} · Saldo: ${fmt(s.saldo || 0)}</div>
        </div>
      </label>`).join('');
  };

  content.innerHTML = `
    <div class="modal-title-v2">
      <h3><span class="material-symbols-outlined" style="color:var(--warning);">link</span> Vincular — ${esc(item.desc)}</h3>
      <button class="modal-close" onclick="closeModal('vincular-modal')"><span class="material-symbols-outlined">close</span></button>
    </div>
    <div style="margin-bottom:14px;">
      <input id="_vincular-busca" type="text" placeholder="Pesquisar no catálogo..." class="dist-form-input" style="width:100%;margin-bottom:10px;" oninput="_vincularBuscaInput(this.value,'${esc(chave)}')"/>
      <div id="_vincular-lista" style="display:flex;flex-direction:column;gap:4px;max-height:280px;overflow-y:auto;">
        ${_renderOpcoes(_calcSimilares(''))}
      </div>
    </div>
    <div class="vincular-divider">— ou —</div>
    <button class="btn-secondary" style="width:100%;justify-content:center;" onclick="_criarMaterialEVincular('${esc(item.chave)}', '${proximoCodigo}')">
      <span class="material-symbols-outlined icon-md">add_circle</span>
      Criar Novo Material no Catalogo (proximo codigo: ${proximoCodigo})
    </button>
    <div class="btn-row btn-row-mt">
      <button class="btn-primary" style="flex:1;padding:12px;justify-content:center;" onclick="_vincularSelecionado('${esc(item.chave)}')">
        <span class="material-symbols-outlined icon-md">link</span>
        Vincular ao Selecionado
      </button>
    </div>`;

  openModal('vincular-modal');
  setTimeout(() => document.getElementById('_vincular-busca')?.focus(), 80);
}

function _vincularBuscaInput(busca, chave) {
  const b = norm(busca || '');
  let lista;
  if (b.length >= 2) {
    lista = EstoqueModule.catalogoMateriais
      .filter(m => norm(m.nome).includes(b) || (m.codigo && m.codigo.toLowerCase().includes(b)))
      .slice(0, 50);
  } else {
    const item = EstoqueModule._consolidado.find(i => i.chave === chave);
    const palavras = item ? norm(item.desc).split(/\s+/).filter(p => p.length > 2) : [];
    lista = EstoqueModule.catalogoMateriais
      .filter(m => { const nNome = norm(m.nome); return palavras.some(p => nNome.includes(p)); })
      .slice(0, 50);
  }
  const el = document.getElementById('_vincular-lista');
  if (!el) return;
  if (!lista.length) {
    el.innerHTML = '<p style="color:var(--text-tertiary);text-align:center;padding:12px 0;font-size:13px;">Nenhum item encontrado</p>';
    return;
  }
  el.innerHTML = lista.map(s => `
    <label class="vincular-option">
      <input type="radio" name="vincular-item" value="${esc(s.id)}"/>
      <div>
        <div class="vincular-option-name">${esc(s.codigo || '—')} — ${esc(s.nome)}</div>
        <div class="vincular-option-sub">${esc(typeof etapaLabel === 'function' ? etapaLabel(s.categoria || '') : (s.categoria || ''))} · ${esc(s.unidade || '')}</div>
      </div>
    </label>`).join('');
}

async function _vincularSelecionado(chave) {
  const item = EstoqueModule._consolidado.find(i => i.chave === chave);
  if (!item) return;

  const radio = document.querySelector('input[name="vincular-item"]:checked');
  if (!radio) return showToast('Selecione um item do catalogo', 5000);

  const materialId = radio.value;
  const catItem = EstoqueModule.catalogoMateriais.find(m => m.id === materialId);
  if (!catItem) return;

  const desc = item.desc;
  const codigo = catItem.codigo;
  const enc = encodeURIComponent(desc);

  if (!codigo) return showToast('Item do catálogo sem código definido', 5000);


  // 1. entradas_diretas (ilike = case-insensitive)
  const r1 = await sbPatch(`entradas_diretas?item_desc=ilike.${enc}&codigo_catalogo=is.null`, { codigo_catalogo: codigo });

  // 2. ajustes_estoque
  const r2 = await sbPatch(`ajustes_estoque?item_desc=ilike.${enc}&codigo_catalogo=is.null`, { codigo_catalogo: codigo });

  // 3. distribuicoes
  const r3 = await sbPatch(`distribuicoes?item_desc=ilike.${enc}&codigo_catalogo=is.null`, { codigo_catalogo: codigo });

  if (r1 === null && r2 === null && r3 === null) {
    return showToast('Erro ao vincular — veja o console para detalhes', 5000);
  }

  // 4. notas_fiscais — atualiza JSON dos itens (norm para match case-insensitive)
  const nDesc = norm(desc);
  // Vincular cobre TODAS as NFs do tenant (notas já vem filtrado por company_id) — antes só pegava obra='EDR', deixando NF direta pra obra sem código
  const notasEDR = (typeof notas !== 'undefined' ? notas : []);
  for (const n of notasEDR) {
    const itens = parseItens(n);
    let changed = false;
    const updated = itens.map(it => {
      const d = it.descricao || it.desc || '';
      if (norm(d) === nDesc && !it.codigo_catalogo && !it.cod) {
        changed = true;
        return { ...it, codigo_catalogo: codigo };
      }
      return it;
    });
    if (changed) {
      await sbPatch(`notas_fiscais?id=eq.${n.id}`, { itens: JSON.stringify(updated) });
    }
  }

  closeModal('vincular-modal');
  showToast(`Vinculado: "${desc}" → ${codigo} · ${catItem.nome}`);

  // Recarregar dados do banco e re-renderizar
  await Promise.all([
    loadNotas(),
    loadEntradasDiretas(),
    loadDistribuicoes(),
    loadAjustesEstoque(),
  ]);
  renderEstoque();
}

async function _criarMaterialEVincular(chave, proximoCodigo) {
  const item = EstoqueModule._consolidado.find(i => i.chave === chave);
  if (!item) return;

  // Verificar unicidade do codigo antes de inserir
  const cats = EstoqueModule.catalogoMateriais;
  if (cats.find(m => m.codigo === proximoCodigo)) {
    await _carregarCatalogo();
    return showToast('Código já em uso — catálogo recarregado, tente novamente.', 5000);
  }

  const resp = await sbPost('materiais', {
    codigo: proximoCodigo,
    nome: item.desc,
    unidade: item.unidade,
    categoria: item.categoria,
    auto: false,
  });

  if (!resp) return showToast('Erro ao criar material', 5000);

  showToast(`Material criado: ${proximoCodigo} · ${item.desc}`);
  closeModal('vincular-modal');

  // Recarregar catalogo
  await _carregarCatalogo();
  renderEstoque();
}


// ══════════════════════════════════════════════════════════════════
// CATALOGO DE MATERIAIS (tab)
// ══════════════════════════════════════════════════════════════════

async function _carregarCatalogo() {
  // C1: sbGetAll pagina além do teto de 1000 do PostgREST (sbGet cortava a lista silenciosamente).
  // SEM heurística erro-vs-vazio: sbGetAll retorna [] tanto em erro quanto em catálogo vazio real, e o
  // contrato não distingue os dois (só console.warn). Distinguir exige helper de infra com retorno null
  // em erro — fica pro C2. Aqui só garantimos array + o teto de 1000. Flicker em erro segue pendente.
  const dados = await sbGetAll('materiais', '?order=codigo.asc');
  if (Array.isArray(dados)) EstoqueModule.catalogoMateriais = dados;
}

// ── FILTRO MULTI-SELECT DE CENTROS DE CUSTO DO CATÁLOGO ──
function catalogoToggleCatMenu(e) {
  if (e) e.stopPropagation();
  const menu = document.getElementById('catalogo-cat-filtro-menu');
  if (!menu) return;
  menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
}

function _catalogoCatFecharMenu() {
  const menu = document.getElementById('catalogo-cat-filtro-menu');
  if (menu) menu.style.display = 'none';
}

function _catalogoCatClickFora(e) {
  const wrap = document.getElementById('catalogo-cat-filtro-wrap');
  if (wrap && !wrap.contains(e.target)) _catalogoCatFecharMenu();
}
document.addEventListener('click', _catalogoCatClickFora, true);

function catalogoCatToggle(key) {
  if (EstoqueModule.catFiltroCats.has(key)) EstoqueModule.catFiltroCats.delete(key);
  else EstoqueModule.catFiltroCats.add(key);
  EstoqueModule.catPage = 0;
  _catalogoCatAtualizarLabel();
  renderCatalogo();
}

function catalogoCatSelecionarTodos() {
  document.querySelectorAll('#catalogo-cat-filtro-lista input[type=checkbox]').forEach(cb => {
    cb.checked = true;
    EstoqueModule.catFiltroCats.add(cb.value);
  });
  EstoqueModule.catPage = 0;
  _catalogoCatAtualizarLabel();
  renderCatalogo();
}

function catalogoCatLimpar() {
  EstoqueModule.catFiltroCats.clear();
  document.querySelectorAll('#catalogo-cat-filtro-lista input[type=checkbox]').forEach(cb => cb.checked = false);
  EstoqueModule.catPage = 0;
  _catalogoCatAtualizarLabel();
  renderCatalogo();
}

function _catalogoCatAtualizarLabel() {
  const label = document.getElementById('catalogo-cat-filtro-label');
  if (!label) return;
  const n = EstoqueModule.catFiltroCats.size;
  label.textContent = n === 0 ? 'Todos centros de custo' : `${n} selecionado${n > 1 ? 's' : ''}`;
  const btn = document.getElementById('catalogo-cat-filtro-btn');
  if (btn) btn.style.borderColor = n > 0 ? 'var(--primary)' : 'var(--border)';
}

// Chip de tipo do catalogo (todos|material|servico|mao_obra|taxa|frete|documento|movimenta|nao_movimenta|saldo_sem_custo|sem_categoria)
function catalogoFiltroTipo(tipo) {
  EstoqueModule.catFiltroTipo = tipo || 'todos';
  EstoqueModule.catPage = 0; // reset paginacao ao trocar de filtro
  document.querySelectorAll('#catalogo-chips-tipo .cat-chip').forEach(b => {
    b.classList.toggle('ativo', b.dataset.tipo === EstoqueModule.catFiltroTipo);
  });
  renderCatalogo();
}

// Atualiza os contadores dos chips (chamado pela renderCatalogo)
function _catalogoAtualizarChips(cont) {
  for (const k in cont) {
    const el = document.getElementById('catchip-' + k);
    if (el) el.textContent = cont[k];
  }
}

function renderCatalogo() {
  // Sincronizar estado com o DOM
  const buscaInput = document.getElementById('catalogo-busca');
  if (buscaInput) EstoqueModule.catBusca = buscaInput.value;

  // Popular filtro multi de centros de custo se ainda vazio
  const filtroLista = document.getElementById('catalogo-cat-filtro-lista');
  if (filtroLista && !filtroLista.childElementCount && typeof ETAPAS !== 'undefined') {
    filtroLista.innerHTML = ETAPAS.map(e => `
      <label style="display:flex;align-items:center;gap:8px;padding:6px 12px;cursor:pointer;font-size:12px;color:var(--text-primary);transition:background .1s;" onmouseenter="this.style.background='rgba(255,255,255,.04)'" onmouseleave="this.style.background=''">
        <input type="checkbox" value="${esc(e.key)}"${EstoqueModule.catFiltroCats.has(e.key) ? ' checked' : ''} onchange="catalogoCatToggle(this.value)" style="accent-color:var(--primary);width:14px;height:14px;cursor:pointer;">
        ${esc(e.lb)}
      </label>`).join('');
    _catalogoCatAtualizarLabel();
  }

  let itens = [...EstoqueModule.catalogoMateriais];

  // Filtrar AUTO
  if (EstoqueModule.catFiltroAuto) {
    itens = itens.filter(m => m.auto === true);
  }

  // Filtrar por centros de custo selecionados (multi)
  // categoria vazia conta como "36_outros" (Nao classificado) — mesma regra do filtro antigo
  if (EstoqueModule.catFiltroCats.size > 0) {
    itens = itens.filter(m => EstoqueModule.catFiltroCats.has(m.categoria || '36_outros'));
  }

  // Filtrar busca
  if (EstoqueModule.catBusca) {
    const b = norm(EstoqueModule.catBusca);
    itens = itens.filter(m => norm(m.nome).includes(b) || (m.codigo && m.codigo.includes(b)));
  }

  // Mapa de saldo e custo médio calculado. Referência manual é tratada separadamente:
  // ela estima o valor parado no estoque, mas nunca vira custo de obra/DRE.
  const saldoMap = {}, precoMap = {}, valorMap = {};
  for (const c of EstoqueModule._consolidado) {
    if (c.codigo) { saldoMap[c.codigo] = c.saldo; precoMap[c.codigo] = c.valorMedio || 0; valorMap[c.codigo] = c.valorEstoque || 0; }
  }
  // Classificacao por tipo: tipo_item vazio/'material' = material fisico
  const _tipoDe = m => (m.tipo_item && m.tipo_item !== 'material') ? m.tipo_item : 'material';
  const _movEst = m => m.movimenta_estoque !== false;
  const _saldoDe = m => Number(saldoMap[m.codigo] || 0);
  const _custoRealDe = m => Number(precoMap[m.codigo] || 0);
  const _referenciaDe = m => Number(m.valor_referencia_manual || 0);
  const _precoExibidoDe = m => _custoRealDe(m) || _referenciaDe(m);
  const _saldoSemCusto = m => _saldoDe(m) > 0 && !(_precoExibidoDe(m) > 0);

  // Contadores dos chips (sobre a lista ja filtrada por busca/centro/auto, antes do filtro de tipo)
  const catCont = {
    todos: itens.length,
    material: itens.filter(m => _tipoDe(m) === 'material').length,
    servico: itens.filter(m => _tipoDe(m) === 'servico').length,
    mao_obra: itens.filter(m => _tipoDe(m) === 'mao_obra').length,
    taxa: itens.filter(m => _tipoDe(m) === 'taxa').length,
    frete: itens.filter(m => _tipoDe(m) === 'frete').length,
    documento: itens.filter(m => _tipoDe(m) === 'documento').length,
    movimenta: itens.filter(m => _movEst(m)).length,
    nao_movimenta: itens.filter(m => !_movEst(m)).length,
    saldo_sem_custo: itens.filter(_saldoSemCusto).length,
    sem_categoria: itens.filter(m => !m.categoria).length,
  };
  if (typeof _catalogoAtualizarChips === 'function') _catalogoAtualizarChips(catCont);

  // Filtrar por tipo (chip)
  const _ft = EstoqueModule.catFiltroTipo;
  if (_ft && _ft !== 'todos') {
    itens = itens.filter(m => {
      switch (_ft) {
        case 'material': case 'servico': case 'mao_obra': case 'taxa': case 'frete': case 'documento':
          return _tipoDe(m) === _ft;
        case 'movimenta': return _movEst(m);
        case 'nao_movimenta': return !_movEst(m);
        case 'saldo_sem_custo': return _saldoSemCusto(m);
        case 'sem_categoria': return !m.categoria;
        default: return true;
      }
    });
  }

  // Paginacao (catPageSize proprio do catalogo — lote grande, sem clicar 10x)
  const end = (EstoqueModule.catPage + 1) * EstoqueModule.catPageSize;
  const visiveis = itens.slice(0, end);
  const restantes = itens.length - end;

  // Contagem AUTO
  const totalAuto = EstoqueModule.catalogoMateriais.filter(m => m.auto === true).length;

  // Atualizar badge
  const badgeAuto = document.getElementById('cat-badge-auto-count');
  if (badgeAuto) badgeAuto.textContent = totalAuto;

  // Tab badge
  const tabBadge = document.querySelector('.tab-btn:nth-child(2) .tab-badge');
  if (tabBadge) tabBadge.textContent = EstoqueModule.catalogoMateriais.length;

  const el = document.getElementById('catalogo-lista');
  if (!el) return;

  if (!visiveis.length) {
    el.innerHTML = `<tr><td colspan="11" style="text-align:center;padding:48px;color:var(--text-tertiary);">Nenhum material encontrado.</td></tr>`;
    const _lm = document.getElementById('cat-load-more');
    if (_lm) _lm.style.display = 'none';  // evita "Carregar mais" fantasma do estado anterior
    return;
  }

  const isAdmin = usuarioAtual?.perfil === 'admin';

  // saldoMap/precoMap ja computados acima (antes do filtro de tipo)

  // Etapas para select inline
  const etapasOpts = (typeof ETAPAS !== 'undefined' && Array.isArray(ETAPAS))
    ? ETAPAS.map(e => `<option value="${esc(e.key)}">${esc(e.lb)}</option>`).join('')
    : '';

  el.innerHTML = visiveis.map(m => {
    const saldo = _saldoDe(m);
    const saldoColor = saldo > 0 ? 'var(--primary)' : saldo < 0 ? 'var(--error)' : 'var(--text-tertiary)';
    const isAuto = m.auto === true;
    const rowStyle = isAuto ? ' style="background:rgba(217,119,6,.03);"' : '';

    const tipoLabels = { material:'MATERIAL', servico:'SERVIÇO', taxa:'TAXA', mao_obra:'MÃO OBRA', documento:'DOC', frete:'FRETE' };
    const _ti = (m.tipo_item && m.tipo_item !== 'material') ? m.tipo_item : 'material';
    const _naoMov = m.movimenta_estoque === false;
    const _tipoCor = _ti === 'material' ? 'background:rgba(45,106,79,.12);color:#2D6A4F;' : 'background:rgba(234,88,12,.12);color:#ea580c;';
    const custoReal = _custoRealDe(m);
    const referencia = _referenciaDe(m);
    const preco = _precoExibidoDe(m);
    const usaReferencia = !(custoReal > 0) && referencia > 0;
    const valorEstoque = saldo > 0 ? (usaReferencia ? saldo * referencia : Number(valorMap[m.codigo] || 0)) : 0;

    // Coluna TIPO (classificacao — sempre visivel pra TODOS os itens, nao so servico)
    const tipoBadge = `<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:5px;${_tipoCor}font-family:'Space Grotesk',monospace;white-space:nowrap;">${tipoLabels[_ti]}</span>`;

    // Coluna ESTOQUE (regra operacional: movimenta ou nao — separada da classificacao)
    const estBadge = _naoMov
      ? `<span title="nao movimenta estoque" style="font-size:11px;font-weight:600;color:#6b7280;white-space:nowrap;">○ Não</span>`
      : `<span title="movimenta estoque" style="font-size:11px;font-weight:600;color:#2D6A4F;white-space:nowrap;">● Sim</span>`;

    // Coluna STATUS: só cobra ação quando existe saldo físico sem valor.
    // Saldo zero não é dinheiro parado e não deve inflar a fila de "sem custo".
    let statusCol = '';
    if (isAuto) statusCol += '<span class="cat-badge-auto">REVISAR</span> ';
    if (_saldoSemCusto(m)) statusCol += `<span title="Há saldo físico, mas nenhuma compra ou referência disponível" style="font-size:9px;font-weight:700;padding:2px 6px;border-radius:5px;background:rgba(180,83,9,.12);color:#b45309;white-space:nowrap;">sem custo</span> `;
    else if (saldo > 0 && usaReferencia) statusCol += `<span title="Valor estimado para gestão do estoque; não altera custo da obra" style="font-size:9px;font-weight:700;padding:2px 6px;border-radius:5px;background:rgba(45,106,79,.12);color:#2D6A4F;white-space:nowrap;">referência</span> `;
    else if (saldo === 0) statusCol += `<span title="Não há dinheiro parado neste item; o custo exibido é somente histórico" style="font-size:9px;font-weight:700;padding:2px 6px;border-radius:5px;background:rgba(107,114,128,.10);color:#6b7280;white-space:nowrap;">sem saldo</span> `;
    if (!m.categoria) statusCol += `<span style="font-size:9px;font-weight:700;padding:2px 6px;border-radius:5px;background:rgba(180,83,9,.12);color:#b45309;white-space:nowrap;">sem categoria</span>`;
    if (!statusCol.trim()) statusCol = `<span style="font-size:11px;color:var(--success);">OK</span>`;

    let acoesCol = '';
    if (isAdmin) {
      if (isAuto) {
        acoesCol += `<button class="cat-action-btn" style="color:var(--success);" onclick="confirmarAutoMaterial('${esc(m.id)}')"><span class="material-symbols-outlined icon-sm">check_circle</span></button>`;
      }
      acoesCol += `<button class="cat-action-btn" onclick="editarMaterial('${esc(m.id)}')"><span class="material-symbols-outlined icon-sm">edit</span></button>`;
      acoesCol += `<button class="cat-action-btn" onclick="duplicarMaterial('${esc(m.id)}')"><span class="material-symbols-outlined icon-sm">content_copy</span></button>`;
      acoesCol += `<button class="cat-action-btn" onclick="excluirMaterial('${esc(m.id)}')"><span class="material-symbols-outlined icon-sm">delete</span></button>`;
    }

    // Categoria: select inline para todos os itens (admin)
    const _et = typeof ETAPAS !== 'undefined' ? ETAPAS.find(e => e.key === m.categoria) : null;
    let catCol = esc(_et ? _et.lb : (m.categoria || ''));
    if (isAdmin) {
      const borderStyle = isAuto ? 'border:1px solid var(--warning);' : 'border:1px solid var(--border);';
      catCol = `<select style="padding:4px 8px;border-radius:6px;${borderStyle}background:transparent;font-size:12px;color:var(--text-primary);outline:none;max-width:160px;" onchange="_updateCategoriaMaterial('${esc(m.id)}',this.value)">
        <option value="">—</option>${etapasOpts.replace(`value="${esc(m.categoria)}"`, `value="${esc(m.categoria)}" selected`)}
      </select>`;
    }

    return `<tr${rowStyle}>
      <td class="code" ${isAuto ? 'style="color:var(--warning);"' : ''}>${esc(m.codigo || '---')}</td>
      <td>${esc(m.nome)} ${isAuto ? '<span class="cat-badge-auto">AUTO</span>' : ''}</td>
      <td>${tipoBadge}</td>
      <td>${esc(m.unidade || '')}</td>
      <td>${catCol}</td>
      <td style="font-family:'Space Grotesk',monospace;font-size:12px;color:${preco > 0 ? 'var(--text-primary)' : 'var(--text-tertiary)'};" title="${custoReal > 0 ? 'Custo médio calculado pelas entradas' : (usaReferencia ? 'Preço de referência para estimar o valor em estoque' : 'Sem custo conhecido')}">${preco > 0 ? `${fmtR(preco)} <span style="font-family:inherit;font-size:9px;font-weight:700;color:${usaReferencia ? '#2D6A4F' : 'var(--text-tertiary)'};">${usaReferencia ? 'REF.' : 'CUSTO'}</span>` : '—'}</td>
      <td><strong style="color:${saldoColor};">${Number(saldo).toLocaleString('pt-BR', { maximumFractionDigits: 3 })}</strong></td>
      <td style="font-family:'Space Grotesk',monospace;font-size:12px;font-weight:700;color:${valorEstoque > 0 ? 'var(--primary)' : 'var(--text-tertiary)'};" title="${saldo > 0 ? (usaReferencia ? 'Estimativa do dinheiro parado no estoque' : 'Custo conhecido do saldo atual') : 'Sem saldo físico no almoxarifado'}">${valorEstoque > 0 ? fmtR(valorEstoque) : '—'}</td>
      <td>${estBadge}</td>
      <td>${statusCol}</td>
      <td class="cat-actions">${acoesCol}</td>
    </tr>`;
  }).join('');

  // Load more
  const loadMore = document.getElementById('cat-load-more');
  if (loadMore) {
    if (restantes > 0) {
      loadMore.style.display = '';
      loadMore.innerHTML = `<button class="btn-secondary" onclick="EstoqueModule.catPage++;renderCatalogo();">
        <span class="material-symbols-outlined icon-md">expand_more</span>
        Carregar mais (${restantes} restantes)</button>`;
    } else {
      loadMore.style.display = 'none';
    }
  }
}


// ── CRUD CATALOGO ───────────────────────────────────────────────

async function novoMaterial() {
  abrirModalNovoMaterial();
}

async function confirmarAutoMaterial(id) {
  const resp = await sbPatch('materiais', id, { auto: false });
  if (!resp) return showToast('Erro ao confirmar', 5000);
  showToast('Material confirmado');
  await _carregarCatalogo();
  renderCatalogo();
}

async function editarMaterial(id) {
  const cats = EstoqueModule.catalogoMateriais.length ? EstoqueModule.catalogoMateriais : (typeof catalogoMateriais !== 'undefined' ? catalogoMateriais : []);
  const mat = cats.find(m => m.id === id);
  if (!mat) return;
  _editandoMaterialId = id;
  const selCat = document.getElementById('mat-categoria');
  if (selCat && typeof ETAPAS !== 'undefined') {
    selCat.innerHTML = '<option value="">— Selecione —</option>' + ETAPAS.map(e => `<option value="${e.key}">${e.lb}</option>`).join('');
  }
  document.getElementById('mat-nome').value = mat.nome || '';
  document.getElementById('mat-unidade').value = mat.unidade || 'UN';
  if (selCat) selCat.value = mat.categoria || '';
  const selTipo = document.getElementById('mat-tipo-item');
  if (selTipo) selTipo.value = mat.tipo_item || 'material';
  onMatTipoChange();
  const aviso = document.getElementById('modal-material-aviso');
  if (aviso) aviso.style.display = 'none';
  document.getElementById('btn-salvar-mat').textContent = 'SALVAR ALTERAÇÕES';
  document.getElementById('btn-salvar-mat').disabled = false;
  openModal('modal-material');
  setTimeout(() => document.getElementById('mat-nome').focus(), 100);
}

async function duplicarMaterial(id) {
  const mat = EstoqueModule.catalogoMateriais.find(m => m.id === id);
  if (!mat) return;

  await _carregarCatalogo();
  const proximoCodigo = obterProximoCodigoDisponivel(EstoqueModule.catalogoMateriais);

  const resp = await sbPost('materiais', {
    codigo: proximoCodigo,
    nome: mat.nome + ' (copia)',
    unidade: mat.unidade,
    categoria: mat.categoria,
    tipo_item: mat.tipo_item || 'material',
    movimenta_estoque: mat.movimenta_estoque ?? true,
    auto: false,
  });

  if (!resp) return showToast('Erro ao duplicar', 5000);
  showToast(`Duplicado: ${proximoCodigo}`);
  await _carregarCatalogo();
  renderCatalogo();
}

async function excluirMaterial(id) {
  const mat = EstoqueModule.catalogoMateriais.find(m => m.id === id);
  if (!mat) return;

  // B1.5: bloquear exclusão de material com QUALQUER histórico de estoque (NF/entrada direta/ajuste/distribuição).
  // Excluir liberaria o código/nome a virar órfão nos registros históricos. Guard conservador — mesmo helper do B1.
  // (antes usava EstoqueModule._consolidado, que é filtrado por obra → saldo em outra obra escapava do guard)
  if (_materialTemHistoricoEstoque(mat)) {
    return showToast('Não pode excluir: este material tem histórico de estoque. Saneie antes.', 5000);
  }

  const ok = await confirmar(`Excluir "${mat.codigo} · ${mat.nome}" do catalogo?`);
  if (!ok) return;

  const resp = await sbDelete('materiais', id);
  if (!resp) return showToast('Erro ao excluir', 5000);
  showToast('Material excluido');
  await _carregarCatalogo();
  renderCatalogo();
}

async function _updateCategoriaMaterial(id, novaCategoria) {
  const ok = await sbPatch('materiais', id, { categoria: novaCategoria });
  if (!ok) { showToast('Erro ao atualizar centro de custo', 5000); return; }
  const mat = EstoqueModule.catalogoMateriais.find(m => m.id === id);
  if (mat) mat.categoria = novaCategoria;
  const etapa = typeof ETAPAS !== 'undefined' ? ETAPAS.find(e => e.key === novaCategoria) : null;
  showToast(`Centro de custo: ${etapa ? etapa.lb : novaCategoria}`);
}


// ── RECONCILIACAO DE ORFAOS ─────────────────────────────────────

async function escanearOrfaos() {

  // Buscar todas as descricoes unicas de movimentacoes
  const descs = new Set();

  // De notas
  for (const n of notas) {
    for (const it of parseItens(n)) {
      if (!(it.codigo_catalogo || it.cod)) descs.add(norm(it.descricao || it.desc || ''));
    }
  }

  // De entradas diretas
  if (typeof entradasDiretas !== 'undefined') {
    for (const e of entradasDiretas) {
      if (!e.codigo_catalogo) descs.add(norm(e.item_desc));
    }
  }

  // De distribuicoes
  if (typeof distribuicoes !== 'undefined') {
    for (const d of distribuicoes) {
      if (!d.codigo_catalogo) descs.add(norm(d.item_desc));
    }
  }

  // Verificar quais nao estao no catalogo
  const catalogoNorms = new Set(EstoqueModule.catalogoMateriais.map(m => norm(m.nome)));
  const orfaos = [...descs].filter(d => !catalogoNorms.has(d));

  EstoqueModule._orfaos = orfaos;
  showToast(`${orfaos.length} orfao(s) encontrado(s)`);

  // Se tiver orfaos, filtrar catalogo pra mostrar
  if (orfaos.length) {
    // TODO: abrir modal de vinculacao em lote
    showToast(`Use "Sem Codigo" no estoque para vincular`);
  }
}

async function recalcularCategorias() {
  const ok = await confirmar('Recalcular categorias de TODOS os materiais baseado nas ETAPAS?');
  if (!ok) return;

  let count = 0, erros = 0;
  for (const mat of EstoqueModule.catalogoMateriais) {
    const novaCat = _categoriaPorEtapas(mat.nome);
    if (novaCat && novaCat !== mat.categoria) {
      // sbPatch (infra): objeto = persistiu / undefined = 0 linhas (id inexistente/RLS) / null = erro HTTP.
      const res = await sbPatch('materiais', mat.id, { categoria: novaCat });
      if (res) {
        mat.categoria = novaCat; // cache local so com persistencia confirmada
        count++;
      } else {
        erros++;
        console.warn('recalcularCategorias falhou:', mat.codigo || mat.id, res === null ? '(erro HTTP/rede)' : '(nao encontrado / 0 linhas / RLS)');
      }
    }
  }

  if (erros > 0) showToast(`${count} reclassificado(s), ${erros} falharam`, 5000);
  else showToast(`${count} material(is) reclassificado(s)`);
  renderCatalogo();
}


// ══════════════════════════════════════════════════════════════════
// EXPORT EXCEL (ExcelJS via CDN com fallback)
// ══════════════════════════════════════════════════════════════════

async function exportarEstoqueExcel() {
  try {
    // Carregar ExcelJS sob demanda se nao disponivel
    if (typeof ExcelJS === 'undefined') {
      showToast('Carregando gerador de planilha...', 'info');
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/exceljs@4.3.0/dist/exceljs.min.js';
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    }

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Inventario');

    // Header EDR Engenharia
    ws.mergeCells('A1:H1');
    ws.getCell('A1').value = 'EDR ENGENHARIA';
    ws.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2D6A4F' } };
    ws.getCell('A1').alignment = { horizontal: 'center' };

    ws.mergeCells('A2:H2');
    ws.getCell('A2').value = 'INVENTARIO DE ESTOQUE';
    ws.getCell('A2').font = { size: 12, bold: true };
    ws.getCell('A2').alignment = { horizontal: 'center' };

    ws.mergeCells('A3:H3');
    ws.getCell('A3').value = `CNPJ: 49.909.440/0001-55 | Data: ${new Date().toLocaleDateString('pt-BR')}`;
    ws.getCell('A3').font = { size: 10 };
    ws.getCell('A3').alignment = { horizontal: 'center' };

    // Colunas
    ws.getRow(5).values = ['#', 'Codigo', 'Material', 'Unidade', 'Categoria', 'Valor Medio', 'Total R$', 'Saldo Sistema', 'Contagem Real', 'Diferenca', 'Preco Corrigido'];
    ws.getRow(5).font = { bold: true };
    ws.getRow(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };

    ws.columns = [
      { width: 6 }, { width: 10 }, { width: 40 }, { width: 8 },
      { width: 22 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 16 },
    ];

    // Dados: catálogo completo + órfãos do consolidado
    const saldoMap = {}, valorMap = {};
    for (const c of EstoqueModule._consolidado) {
      if (c.codigo) { saldoMap[c.codigo] = c.saldo; valorMap[c.codigo] = c.valorMedio || 0; }
      else { saldoMap['NOME:' + (c.desc || '')] = c.saldo; valorMap['NOME:' + (c.desc || '')] = c.valorMedio || 0; }
    }

    // Itens do catálogo (todos, com ou sem saldo)
    const itensCatalogo = EstoqueModule.catalogoMateriais.map(m => ({
      codigo: m.codigo || null,
      desc: m.nome,
      unidade: m.unidade || 'UN',
      categoria: m.categoria || '',
      saldo: saldoMap[m.codigo] ?? 0,
      valorMedio: valorMap[m.codigo] ?? 0,
      semCodigo: !m.codigo,
    }));

    // Órfãos: itens no consolidado sem código e sem correspondência no catálogo
    const nomesNoCatalogo = new Set(itensCatalogo.map(i => norm(i.desc)));
    const orfaos = EstoqueModule._consolidado
      .filter(c => !c.codigo && !nomesNoCatalogo.has(norm(c.desc)));

    const itens = [
      ...itensCatalogo,
      ...orfaos.map(c => ({ codigo: null, desc: c.desc, unidade: c.unidade, categoria: c.categoria, saldo: c.saldo, valorMedio: c.valorMedio || 0, semCodigo: true })),
    ].sort((a, b) => (a.desc || '').localeCompare(b.desc || '', 'pt-BR'));

    itens.forEach((it, idx) => {
      const catLabel = typeof etapaLabel === 'function' ? etapaLabel(it.categoria) : it.categoria;
      const row = ws.addRow([
        idx + 1,
        it.codigo || '',
        it.desc,
        it.unidade,
        catLabel,
        it.valorMedio || 0,
        (it.saldo || 0) * (it.valorMedio || 0),
        it.saldo,
        null, // contagem real (preenchido manualmente)
        null, // diferenca (formula J = I - H)
        null, // preco corrigido (editavel pelo usuario para reimport)
      ]);

      // Formatar valores monetários
      row.getCell(6).numFmt = '#,##0.00';
      row.getCell(7).numFmt = '#,##0.00';
      row.getCell(11).numFmt = '#,##0.00';

      // Formula: Diferenca = Contagem Real - Saldo Sistema
      const rowNum = idx + 6;
      row.getCell(10).value = { formula: `I${rowNum}-H${rowNum}` };

      // Zebra
      if (idx % 2 === 1) {
        row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
      }
    });

    // Destaque coluna "Preço Corrigido" (K) para indicar que é editável
    const precoCabecalho = ws.getCell('K5');
    precoCabecalho.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF9C4' } };
    precoCabecalho.note = 'Preencha aqui o preco correto e reimporte via botao "Importar Precos"';

    // Auto filtro
    ws.autoFilter = { from: 'A5', to: `K${itens.length + 5}` };

    // Rodape
    const lastRow = itens.length + 7;
    ws.getCell(`A${lastRow}`).value = `Total: ${itens.length} itens`;
    ws.getCell(`A${lastRow}`).font = { bold: true };

    ws.getCell(`A${lastRow + 2}`).value = 'Responsavel: ____________________________';
    ws.getCell(`E${lastRow + 2}`).value = 'Data: ____/____/________';

    // Gerar e baixar
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `EDR_Inventario_${hojeISO()}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);

    showToast('Inventario exportado com sucesso');
  } catch (err) {
    console.error('Erro ao exportar Excel:', err);
    showToast('Falha ao gerar planilha. Verifique sua conexao e tente novamente.', 5000);
  }
}


// ══════════════════════════════════════════════════════════════════
// IMPORTAR PRECOS (reimport de planilha exportada com col K preenchida)
// ══════════════════════════════════════════════════════════════════

function importarPrecosEstoque() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.xlsx';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      if (typeof ExcelJS === 'undefined') {
        showToast('Carregando leitor de planilha...', 'info');
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://cdn.jsdelivr.net/npm/exceljs@4.3.0/dist/exceljs.min.js';
          script.onload = resolve; script.onerror = reject;
          document.head.appendChild(script);
        });
      }
      const buffer = await file.arrayBuffer();
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buffer);
      const ws = wb.worksheets[0];

      // Linha 5 = cabeçalho, dados a partir de linha 6
      // Col B = codigo, Col C = material, Col K = preco corrigido
      const atualizacoes = [];
      const descartadas = []; // { linha, motivo }
      ws.eachRow((row, rowNum) => {
        if (rowNum <= 5) return;
        const codigo = (row.getCell(2).value || '').toString().trim();
        const nome   = (row.getCell(3).value || '').toString().trim();
        // parseNumBR pra não cair em parseFloat("1.500")=1.5 quando vier texto formatado pt-BR
        const preco  = parseNumBR(row.getCell(11).value);
        const temIdent = codigo || nome;
        if (!temIdent && !row.getCell(11).value) return; // linha vazia, ignora silenciosamente
        if (preco > 0 && temIdent) {
          atualizacoes.push({ codigo, nome, preco });
        } else if (!temIdent) {
          descartadas.push({ linha: rowNum, motivo: 'sem código nem nome' });
        } else if (preco <= 0) {
          descartadas.push({ linha: rowNum, motivo: `preço inválido (${row.getCell(11).value})` });
        }
      });

      if (descartadas.length) {
        const exemplos = descartadas.slice(0, 5).map(d => `linha ${d.linha}: ${d.motivo}`).join('\n');
        const extra = descartadas.length > 5 ? `\n...e mais ${descartadas.length - 5}` : '';
        console.warn('[importarPrecosEstoque] descartadas:', descartadas);
        showToast(`${descartadas.length} linha(s) descartada(s):\n${exemplos}${extra}`);
      }

      if (!atualizacoes.length) {
        return showToast('Nenhum preço corrigido encontrado na coluna K', 'info');
      }

      let ok = 0, erros = 0;

      for (const a of atualizacoes) {
        // Atualiza entradas_diretas com preco=0 para esse item (não sobrescreve preços corretos)
        let r = null;
        if (a.codigo) {
          r = await sbPatch(`entradas_diretas?codigo_catalogo=eq.${encodeURIComponent(a.codigo)}&preco=eq.0`, { preco: a.preco });
        }
        if (!r && a.nome) {
          r = await sbPatch(`entradas_diretas?item_desc=ilike.${encodeURIComponent(a.nome)}&preco=eq.0`, { preco: a.preco });
        }
        if (r !== null) ok++; else erros++;
      }

      showToast(`Preços atualizados: ${ok} itens${erros ? ` (${erros} sem entradas diretas com preço zero)` : ''}`);

      // Recarregar
      await loadEntradasDiretas();
      renderEstoque();
    } catch (err) {
      console.error('Erro ao importar preços:', err);
      showToast('Erro ao ler planilha', 5000);
    }
  };
  input.click();
}

// ══════════════════════════════════════════════════════════════════
// IMPORTAR CONTAGEM / INVENTÁRIO (reimport da planilha com col I preenchida)
// Aplica a "Contagem Real" como ajuste tipo 'contagem' → o saldo passa a valer
// o que foi contado (zera negativos/órfãos de estoque anterior ao sistema).
// ══════════════════════════════════════════════════════════════════

// Calcula o ajuste de contagem de UM item (puro, sem persistir — testável).
// Retorna o payload do ajuste (tipo 'contagem') ou null se a contagem já bate com o saldo.
function _calcAjusteContagemItem(codigo, nome, unidade, contagem, cons) {
  const m = (cons || []).find(i => (codigo && i.codigo === codigo) || (nome && norm(i.desc) === norm(nome)));
  const saldoAtual = m ? Number(m.saldo) || 0 : 0;
  const diff = contagem - saldoAtual;
  return {
    item_desc: (((m && m.desc) || nome || codigo) || '').toUpperCase(),
    codigo_catalogo: codigo || (m && m.codigo) || null,
    unidade: (m && m.unidade) || unidade || 'UN',
    qtd: diff,
    tipo: 'contagem',
    motivo: `sistema ${saldoAtual}, real ${contagem}, dif ${diff > 0 ? '+' : ''}${diff} · INVENTARIO PLANILHA`,
  };
}

function importarContagemEstoque() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.xlsx';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      if (typeof ExcelJS === 'undefined') {
        showToast('Carregando leitor de planilha...', 'info');
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://cdn.jsdelivr.net/npm/exceljs@4.3.0/dist/exceljs.min.js';
          script.onload = resolve; script.onerror = reject;
          document.head.appendChild(script);
        });
      }
      const buffer = await file.arrayBuffer();
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buffer);
      const ws = wb.worksheets[0];

      // Garante o consolidado pra saber o saldo atual de cada material
      if (!EstoqueModule._consolidado || !EstoqueModule._consolidado.length) consolidarEstoque();
      const cons = EstoqueModule._consolidado || [];

      // Linha 5 = cabeçalho. Col B=codigo, C=material, D=unidade, I(9)=contagem real
      const ajustes = [];      // payloads de ajuste (tipo 'contagem')
      const descartadas = [];
      ws.eachRow((row, rowNum) => {
        if (rowNum <= 5) return;
        const codigo = (row.getCell(2).value || '').toString().trim();
        const nome   = (row.getCell(3).value || '').toString().trim();
        const unidade = (row.getCell(4).value || 'UN').toString().trim().toUpperCase();
        const contagemRaw = row.getCell(9).value; // coluna I — Contagem Real
        // célula vazia = não contou essa linha → ignora silenciosamente
        if (contagemRaw === null || contagemRaw === undefined || contagemRaw === '') return;
        if (!(codigo || nome)) { descartadas.push({ linha: rowNum, motivo: 'sem código nem nome' }); return; }
        const contagem = parseNumBR(contagemRaw);
        if (!Number.isFinite(contagem) || contagem < 0) { descartadas.push({ linha: rowNum, motivo: `contagem inválida (${contagemRaw})` }); return; }
        const aj = _calcAjusteContagemItem(codigo, nome, unidade, contagem, cons);
        if (aj) ajustes.push(aj); // toda contagem preenchida registra o corte, mesmo com diferenca zero
      });

      if (descartadas.length) {
        const exemplos = descartadas.slice(0, 5).map(d => `linha ${d.linha}: ${d.motivo}`).join('\n');
        const extra = descartadas.length > 5 ? `\n...e mais ${descartadas.length - 5}` : '';
        showToast(`${descartadas.length} linha(s) ignorada(s):\n${exemplos}${extra}`);
      }
      if (!ajustes.length) {
        return showToast('Nenhuma contagem nova na coluna "Contagem Real" (col I).', 'info');
      }

      const ok = await confirmar(`Aplicar inventário de ${ajustes.length} item(ns)?\n\nO saldo de cada um passa a valer exatamente o que você contou na planilha. Isso acerta a régua do estoque (zera os negativos de material anterior ao sistema).`);
      if (!ok) return;

      let okc = 0, erros = 0;
      for (const payload of ajustes) {
        const novo = await sbPost('ajustes_estoque', payload);
        if (novo) { if (typeof ajustesEstoque !== 'undefined') ajustesEstoque.unshift(novo); okc++; } else erros++;
      }

      showToast(`Inventário aplicado: ${okc} item(ns)${erros ? ` (${erros} falharam)` : ''}`);
      if (typeof loadAjustesEstoque === 'function') await loadAjustesEstoque();
      renderEstoque();
    } catch (err) {
      console.error('Erro ao importar contagem:', err);
      showToast('Erro ao ler planilha de inventário', 5000);
    }
  };
  input.click();
}


// ══════════════════════════════════════════════════════════════════
// FILTROS E BUSCAS (conecta aos elementos do preview)
// ══════════════════════════════════════════════════════════════════

function toggleLimparBusca() {
  const btn = document.getElementById('btn-limpar-busca');
  const val = document.getElementById('estoque-busca')?.value || '';
  if (btn) btn.style.display = val ? 'flex' : 'none';
}

function estoqueBuscar(valor) {
  clearTimeout(EstoqueModule._buscaTimer);
  EstoqueModule._buscaTimer = setTimeout(() => {
    EstoqueModule.filtroBusca = valor;
    EstoqueModule.page = 0;
    renderEstoque();
  }, 300);
}

function estoqueFiltrarObra(valor) {
  EstoqueModule.filtroObra = valor;
  EstoqueModule.page = 0;
  renderEstoque();
}

// ── FILTRO MULTI-SELECT DE ETAPAS (mesmo padrão do filtro de centros de custo das Obras) ──
function _popularFiltroEtapas() {
  const lista = document.getElementById('estoque-filtro-etapa-lista');
  if (!lista) return;
  const _lbl = c => (typeof etapaLabel === 'function' ? etapaLabel(c) : c);
  const cats = [...new Set(EstoqueModule._consolidado.map(i => i.categoria).filter(Boolean))].sort((a, b) => _lbl(a).localeCompare(_lbl(b), 'pt-BR'));
  lista.innerHTML = cats.map(c => `
    <label style="display:flex;align-items:center;gap:8px;padding:6px 12px;cursor:pointer;font-size:12px;color:var(--text-primary);transition:background .1s;" onmouseenter="this.style.background='rgba(255,255,255,.04)'" onmouseleave="this.style.background=''">
      <input type="checkbox" value="${esc(c)}"${EstoqueModule.filtroEtapas.has(c) ? ' checked' : ''} onchange="estoqueEtapaToggle(this.value)" style="accent-color:var(--primary);width:14px;height:14px;cursor:pointer;">
      ${esc(_lbl(c))}
    </label>`).join('');
  _estoqueEtapaAtualizarLabel();
}

function estoqueToggleEtapaMenu(e) {
  if (e) e.stopPropagation();
  const menu = document.getElementById('estoque-filtro-etapa-menu');
  if (!menu) return;
  menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
}

function _estoqueEtapaFecharMenu() {
  const menu = document.getElementById('estoque-filtro-etapa-menu');
  if (menu) menu.style.display = 'none';
}

function _estoqueEtapaClickFora(e) {
  const wrap = document.getElementById('estoque-filtro-etapa-wrap');
  if (wrap && !wrap.contains(e.target)) _estoqueEtapaFecharMenu();
}
document.addEventListener('click', _estoqueEtapaClickFora, true);

function estoqueEtapaToggle(key) {
  if (EstoqueModule.filtroEtapas.has(key)) EstoqueModule.filtroEtapas.delete(key);
  else EstoqueModule.filtroEtapas.add(key);
  EstoqueModule.page = 0;
  renderEstoque();
}

function estoqueEtapaSelecionarTodos() {
  document.querySelectorAll('#estoque-filtro-etapa-lista input[type=checkbox]').forEach(cb => {
    cb.checked = true;
    EstoqueModule.filtroEtapas.add(cb.value);
  });
  EstoqueModule.page = 0;
  renderEstoque();
}

function estoqueEtapaLimpar() {
  EstoqueModule.filtroEtapas.clear();
  document.querySelectorAll('#estoque-filtro-etapa-lista input[type=checkbox]').forEach(cb => cb.checked = false);
  EstoqueModule.page = 0;
  renderEstoque();
}

function _estoqueEtapaAtualizarLabel() {
  const label = document.getElementById('estoque-filtro-etapa-label');
  if (!label) return;
  const n = EstoqueModule.filtroEtapas.size;
  label.textContent = n === 0 ? 'TODAS ETAPAS' : `${n} ETAPA${n > 1 ? 'S' : ''}`;
  const btn = document.getElementById('estoque-filtro-etapa-btn');
  if (btn) btn.style.borderColor = n > 0 ? 'var(--primary)' : '';
}

function estoqueToggleNegativos() {
  EstoqueModule.filtroNegativos = !EstoqueModule.filtroNegativos;
  EstoqueModule.page = 0;
  renderEstoque();
}

function estoqueToggleSemCodigo() {
  EstoqueModule.filtroSemCodigo = !EstoqueModule.filtroSemCodigo;
  EstoqueModule.page = 0;
  renderEstoque();
}

function estoqueOrdenar(ordem) {
  EstoqueModule.ordem = ordem;
  renderEstoque();
}

// Bridges para botões do HTML
function estoqueAtualizarOrdem(ordem) {
  EstoqueModule.ordem = ordem;
  EstoqueModule.page = 0;
  renderEstoque();
  ['az', 'maior', 'menor'].forEach(o => {
    const btn = document.getElementById('estoque-ord-' + o);
    if (btn) btn.classList.toggle('ativo', o === ordem);
  });
}

function toggleFiltroNegativo() {
  EstoqueModule.filtroNegativos = !EstoqueModule.filtroNegativos;
  EstoqueModule.page = 0;
  renderEstoque();
  const btn = document.getElementById('estoque-filtro-neg');
  if (btn) btn.classList.toggle('ativo', EstoqueModule.filtroNegativos);
}

function catalogoBuscar(valor) {
  clearTimeout(EstoqueModule._catBuscaTimer);
  EstoqueModule._catBuscaTimer = setTimeout(() => {
    EstoqueModule.catBusca = valor;
    EstoqueModule.catPage = 0;
    renderCatalogo();
  }, 300);
}

function catalogoToggleAuto() {
  EstoqueModule.catFiltroAuto = !EstoqueModule.catFiltroAuto;
  EstoqueModule.catPage = 0;
  renderCatalogo();
}


// ══════════════════════════════════════════════════════════════════
// HELPERS (modais — reusa do shell)
// ══════════════════════════════════════════════════════════════════

// openModal / closeModal — definidos no index.html (com fallback modal- prefix)


// ══════════════════════════════════════════════════════════════════
// CALCULO DO VALOR TOTAL DO ESTOQUE (dashboard)
// ══════════════════════════════════════════════════════════════════

let _valorEstoqueAtual = 0;
function calcularValorEstoque() {
  // Sincronizar catalogo da global se disponivel
  if (typeof catalogoMateriais !== 'undefined' && !EstoqueModule.catalogoMateriais.length) {
    EstoqueModule.catalogoMateriais = catalogoMateriais;
  }
  // Sempre reconsolidar sem filtro de obra pra ter o total geral
  consolidarEstoque();
  _valorEstoqueAtual = EstoqueModule._valorTotal;
  return _valorEstoqueAtual;
}


// ══════════════════════════════════════════════════════════════════
// INIT — carrega catalogo ao registrar a view
// ══════════════════════════════════════════════════════════════════

// Init movido pra dentro do viewRegistry — carrega catálogo só quando a view for aberta


// ══════════════════════════════════════════════════════════════════
// FUNCOES PORTADAS DA V1 — Entrada Direta, Saida, Ajuste Modal
// ══════════════════════════════════════════════════════════════════

// fecharModal / closeModalOutside — definidos no index.html inline

// ── ENTRADA DIRETA ──────────────────────────────────────────
function abrirEntradaDireta() {
  const hoje = hojeISO();
  document.getElementById('entrada-desc').value = '';
  document.getElementById('entrada-qtd').value = '';
  document.getElementById('entrada-unidade').value = '';
  document.getElementById('entrada-preco').value = '';
  document.getElementById('entrada-fornecedor').value = '';
  document.getElementById('entrada-data').value = hoje;
  document.getElementById('entrada-obs').value = '';
  const alerta = document.getElementById('entrada-preco-alerta');
  if (alerta) alerta.style.display = 'none';
  const sel = document.getElementById('entrada-obra-id');
  sel.innerHTML = obras.map(o => `<option value="${o.id}">${esc(o.nome)}</option>`).join('');
  const selEt = document.getElementById('entrada-etapa');
  if (selEt) selEt.innerHTML = etapaSelectOpts('', true);
  setDestinoEntrada('estoque');
  openModal('modal-entrada');
  setTimeout(() => document.getElementById('entrada-desc').focus(), 100);
}

function onEntradaPrecoInput() {
  const preco = parseFloat(document.getElementById('entrada-preco').value) || 0;
  const alerta = document.getElementById('entrada-preco-alerta');
  if (!alerta) return;
  alerta.style.display = preco <= 0 ? 'flex' : 'none';
}

function buscarPrecoFC() {
  const desc = document.getElementById('entrada-desc').value.trim();
  const query = encodeURIComponent(desc || 'material construção');
  window.open(`https://www.ferreiracosta.com/busca?q=${query}`, '_blank');
}

function setDestinoEntrada(tipo) {
  const btnEst = document.getElementById('btn-destino-estoque');
  const btnObra = document.getElementById('btn-destino-obra');
  const infoEst = document.getElementById('entrada-estoque-info');
  const wrapObra = document.getElementById('entrada-obra-wrap');
  if (!btnEst || !btnObra) return;
  if (tipo === 'estoque') {
    btnEst.style.background = 'rgba(139,92,246,0.15)'; btnEst.style.color = '#a78bfa'; btnEst.style.borderColor = 'rgba(139,92,246,0.4)';
    btnObra.style.background = 'transparent'; btnObra.style.color = 'var(--texto3)'; btnObra.style.borderColor = 'rgba(255,255,255,0.1)';
    if (infoEst) infoEst.style.display = ''; if (wrapObra) wrapObra.style.display = 'none';
    btnEst.dataset.ativo = '1';
  } else {
    btnObra.style.background = 'rgba(34,197,94,0.1)'; btnObra.style.color = 'var(--verde-hl)'; btnObra.style.borderColor = 'rgba(34,197,94,0.3)';
    btnEst.style.background = 'transparent'; btnEst.style.color = 'var(--texto3)'; btnEst.style.borderColor = 'rgba(139,92,246,0.2)';
    if (infoEst) infoEst.style.display = 'none'; if (wrapObra) wrapObra.style.display = '';
    btnEst.dataset.ativo = '';
  }
}

function onEntradaDescInput() {
  const val = document.getElementById('entrada-desc').value;
  const list = document.getElementById('ac-entrada-list');
  if (!val || val.length < 2) { list.classList.add('hidden'); return; }
  const v = norm(val), seen = new Set(), matches = [];
  const cats = EstoqueModule.catalogoMateriais.length ? EstoqueModule.catalogoMateriais : (typeof catalogoMateriais !== 'undefined' ? catalogoMateriais : []);
  const numVal = val.replace(/\D/g,'');
  cats
    .filter(m => norm(m.nome).includes(v) || (numVal && (m.codigo||'').includes(numVal)))
    .sort((a,b) => {
      const na = norm(a.nome), nb = norm(b.nome);
      const aStart = na.startsWith(v) ? 0 : na.includes(' '+v) ? 1 : 2;
      const bStart = nb.startsWith(v) ? 0 : nb.includes(' '+v) ? 1 : 2;
      return aStart - bStart;
    })
    .forEach(m => {
      if (!seen.has(m.nome)) { seen.add(m.nome); matches.push({ desc: m.nome, unidade: m.unidade||'UN', codigo: m.codigo||'' }); }
    });
  const txtEst = val.trim().toUpperCase();
  matches.push({ desc: txtEst, unidade: 'UN', codigo: '', cadastroRapido: true });
  const top = matches.slice(0,15);
  list.innerHTML = top.map((m,i) => m.cadastroRapido
    ? `<div class="autocomplete-item" data-ed-idx="${i}" style="border-top:1px solid rgba(255,255,255,0.1);margin-top:2px;">
        <span style="color:var(--verde-hl);font-weight:700;font-size:12px;">+ CADASTRAR "${m.desc}" NO CATÁLOGO</span>
       </div>`
    : `<div class="autocomplete-item" data-ed-idx="${i}">${m.codigo?`<span class="ac-codigo">${m.codigo}</span>`:''}<span class="ac-label">${m.desc}</span><span style="font-size:10px;color:var(--texto3);">${m.unidade}</span></div>`
  ).join('');
  list.querySelectorAll('.autocomplete-item').forEach((el, i) => {
    const selectItem = ev => {
      ev.preventDefault();
      if (top[i].cadastroRapido) { abrirModalNovoMaterial(top[i].desc); return; }
      document.getElementById('entrada-desc').value = top[i].desc;
      document.getElementById('entrada-unidade').value = top[i].unidade;
      list.classList.add('hidden');
    };
    el.addEventListener('mousedown', selectItem);
    el.addEventListener('touchstart', selectItem, { passive: false });
  });
  list.classList.remove('hidden');
}

// Data suspeita: ano muito diferente do atual ou futuro além de 7 dias (aviso, não bloqueia)
function _dataSuspeita(dataStr) {
  if (!dataStr || dataStr.length < 10) return false;
  const ano = parseInt(dataStr.slice(0, 4), 10);
  const anoAtual = new Date().getFullYear();
  if (ano < anoAtual - 1 || ano > anoAtual) return true;
  const lim = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  return dataStr > lim;
}

let _entradaDiretaSalvando = false;
async function salvarEntradaDireta() {
  if (_entradaDiretaSalvando) return;
  _entradaDiretaSalvando = true;
  try { return await _gravarEntradaDireta(); }
  finally { _entradaDiretaSalvando = false; }
}
async function _gravarEntradaDireta() {
  const desc = (document.getElementById('entrada-desc').value||'').toUpperCase().trim();
  const qtd = parseFloat(document.getElementById('entrada-qtd').value)||0;
  const unidade = (document.getElementById('entrada-unidade').value||'UN').toUpperCase();
  const preco = parseFloat(document.getElementById('entrada-preco').value)||0;
  const fornecedor = (document.getElementById('entrada-fornecedor').value||'').toUpperCase();
  const data = document.getElementById('entrada-data').value;
  const obs = (document.getElementById('entrada-obs').value||'').toUpperCase();
  const destinoObra = document.getElementById('btn-destino-estoque').dataset.ativo !== '1';
  const obraId = document.getElementById('entrada-obra-id').value;
  const obraObj = obras.find(o => o.id === obraId);
  if (!desc) { showToast('Informe o material.'); return; }
  const cats = EstoqueModule.catalogoMateriais.length ? EstoqueModule.catalogoMateriais : (typeof catalogoMateriais !== 'undefined' ? catalogoMateriais : []);
  const descSemFornecedor = desc.split('·')[0].trim();
  const materialNoCatalogo = cats.find(m => norm(m.nome) === norm(descSemFornecedor));
  if (!materialNoCatalogo) {
    showToast('Material não está no catálogo. Selecione da lista ou use "+ Cadastrar" no campo.');
    document.getElementById('entrada-desc').focus();
    return;
  }
  if (!Number.isFinite(qtd) || qtd <= 0) { showToast('Informe a quantidade.'); return; }
  if (!Number.isFinite(preco) || preco <= 0) { showToast('Informe o custo unitário (não pode ficar zerado).'); document.getElementById('entrada-preco').focus(); return; }
  if (destinoObra && !obraId) { showToast('Selecione a obra.'); return; }
  if (destinoObra && !obraObj) { showToast('Obra não encontrada. Selecione novamente.'); return; }
  const etapaVal = document.getElementById('entrada-etapa')?.value || '';
  if (destinoObra && !etapaVal) { showToast('Selecione o centro de custo (etapa).'); document.getElementById('entrada-etapa')?.focus(); return; }
  // Imposto/despesa NAO vai pro almoxarifado (estoque) — so como custo numa obra (ex: Escritorio).
  const ETAPAS_SEM_ESTOQUE = ['24_imposto', '03_alimentacao', '07_combustivel', '14_expediente', '25_limpeza', '34_tecnologia'];
  if (!destinoObra && ETAPAS_SEM_ESTOQUE.includes(materialNoCatalogo.categoria)) {
    showToast('Imposto/despesa nao entra no estoque. Use "Enviar para obra" e selecione a obra.');
    return;
  }
  // B2: serviço/taxa/documento/frete (movimenta_estoque=false) NÃO entra no estoque geral — só custo em obra.
  // Fonte principal: campo do catálogo (já resolvido); rede de segurança: itemMovimentaEstoque (fallback regex) p/ legado sem o campo.
  if (!destinoObra && (materialNoCatalogo.movimenta_estoque === false
        || (typeof itemMovimentaEstoque === 'function'
            && itemMovimentaEstoque({ codigo: materialNoCatalogo?.codigo, desc: descSemFornecedor, etapa: etapaVal }) === false))) {
    showToast('Serviço/taxa/documento/frete não entra no estoque geral. Use "Enviar para obra" e selecione a obra.');
    return;
  }
  if (!data) { showToast('Informe a data.'); document.getElementById('entrada-data').focus(); return; }
  if (_dataSuspeita(data) && !confirm(`A data ${data} parece fora do normal. Confirmar mesmo assim?`)) { document.getElementById('entrada-data').focus(); return; }
  try {
    if (destinoObra && obraObj) {
      const valor = qtd * preco;
      const etapa = document.getElementById('entrada-etapa')?.value || '';
      const codMat = cats.find(m => norm(m.nome) === norm(desc));
      const descLanc = codMat ? `${codMat.codigo} · ${desc}` : desc;
      const obsLanc = [fornecedor, obs || 'ENTRADA DIRETA SEM NF'].filter(Boolean).join(' · ');
      // Despesa (imposto/encargos, consumo de escritorio) NAO move estoque — so o lancamento de custo.
      // Material de obra cria a distribuicao (movimento de estoque) normalmente. (ETAPAS_SEM_ESTOQUE no escopo da funcao)
      const ehDespesa = ETAPAS_SEM_ESTOQUE.includes(etapa);
      // Escritório = consumo direto/overhead: gera só custo, nunca estoque (igual despesa).
      const ehEscritorio = !!(obraObj && obraObj.nome && obraObj.nome.toUpperCase().includes('ESCRIT'));
      // Serviço/taxa/doc/frete/MO (movimenta_estoque=false) gera SÓ custo (lançamento), nunca baixa de estoque.
      const movimentaEstoque = (typeof itemMovimentaEstoque !== 'function')
        || itemMovimentaEstoque({ codigo: materialNoCatalogo?.codigo, desc: descSemFornecedor, etapa });
      // Custo primeiro e checado. Cache local (unshift) so depois de consistente.
      const lanc = await sbPost('lancamentos', { obra_id: obraId, descricao: descLanc, qtd, preco, total: valor, data, obs: obsLanc, etapa, nota_id: null, origem: ehDespesa ? 'manual' : 'compra_direta', ...custoClassificacaoNovo(obraId) });
      if (!lanc) return showToast('Erro ao lancar o custo. Nada foi registrado.', 5000);
      const criaDist = !ehDespesa && movimentaEstoque && !ehEscritorio;
      if (criaDist) {
        const dist = await sbPost('distribuicoes', {
          item_desc: desc, item_idx: 0, obra_id: obraId,
          obra_nome: obraObj.nome,
          qtd, valor, etapa, data,
          lancamento_id: lanc.id,
          codigo_catalogo: materialNoCatalogo?.codigo || null
        });
        if (!dist) {
          // Distribuicao falhou DEPOIS do custo gravado: rollback best-effort do lancamento
          // (criado agora, sem dependentes) — evita custo sem baixa e retry que duplica custo.
          const desfeito = await sbDelete('lancamentos', lanc.id);
          if (desfeito) showToast('Falha ao baixar o estoque. O custo foi revertido — tente novamente.', 8000);
          else showToast('Falha ao baixar o estoque e o custo NAO pode ser revertido. Verifique antes de redistribuir.', 8000);
          if (typeof loadLancamentos === 'function') await loadLancamentos();
          if (typeof loadDistribuicoes === 'function') await loadDistribuicoes();
          renderEstoque();
          if (typeof renderDashboard === 'function') renderDashboard();
          return;
        }
        distribuicoes.unshift(dist);
      }
      lancamentos.unshift(lanc); // cache local so apos consistente (dist ok, ou ramo sem dist)
      showToast((ehDespesa || !movimentaEstoque || ehEscritorio) ? `Custo lancado → ${obraObj.nome}` : `${qtd} ${unidade} de ${desc} → ${obraObj.nome}!`);
    } else {
      const nova = await sbPost('entradas_diretas', { item_desc: desc, unidade, qtd, preco, fornecedor, data, obs, obra: 'EDR', codigo_catalogo: materialNoCatalogo?.codigo || null });
      if (!nova) return showToast('Erro ao registrar a entrada no estoque.', 5000);
      entradasDiretas.unshift(nova);
      showToast(`${qtd} ${unidade} de ${desc} no estoque!`);
    }
    fecharModal('entrada');
    renderEstoque();
    if (typeof renderDashboard === 'function') renderDashboard();
  } catch(e) { console.error(e); showToast('Não foi possível registrar. Execute o SQL no Setup.'); }
}


// ── SAÍDA / BAIXA DE ESTOQUE ──────────────────────────────
function abrirSaidaMaterial(descPreenchida, unidadePreenchida) {
  const obraSelect = document.getElementById('saida-obra');
  obraSelect.innerHTML = '<option value="">— Selecione a obra —</option>' +
    obras.map(o => `<option value="${o.id}">${esc(o.nome)}</option>`).join('');
  document.getElementById('saida-etapa').innerHTML = etapaSelectOpts('', true);
  document.getElementById('saida-data').value = hojeISO();
  document.getElementById('saida-desc').value = descPreenchida || '';
  document.getElementById('saida-qtd').value = '';
  document.getElementById('saida-obs').value = '';
  if (unidadePreenchida) document.getElementById('saida-unidade').value = unidadePreenchida;
  document.getElementById('ac-saida-list').classList.add('hidden');
  const precoContainer = document.getElementById('saida-preco-container');
  if (precoContainer) precoContainer.innerHTML = '';
  openModal('modal-saida');
  if (descPreenchida) {
    setTimeout(() => document.getElementById('saida-qtd').focus(), 100);
  } else {
    setTimeout(() => document.getElementById('saida-desc').focus(), 100);
  }
}

function onSaidaDescInput() {
  const val = document.getElementById('saida-desc').value.toUpperCase().trim();
  const list = document.getElementById('ac-saida-list');
  if (val.length < 2) { list.classList.add('hidden'); return; }
  const cats = EstoqueModule.catalogoMateriais.length ? EstoqueModule.catalogoMateriais : (typeof catalogoMateriais !== 'undefined' ? catalogoMateriais : []);
  if (!EstoqueModule._consolidado.length) consolidarEstoque();
  const saldoMap = {};
  EstoqueModule._consolidado.forEach(m => { saldoMap[norm(m.desc)] = m.saldo; });
  const matches = cats
    .filter(m => m.codigo && m.nome.toUpperCase().includes(val))
    .slice(0, 8)
    .map(m => ({ ...m, saldo: saldoMap[norm(m.nome)] || 0 }));
  if (!matches.length) { list.classList.add('hidden'); return; }
  list.innerHTML = matches.map(m =>
    `<div class="autocomplete-item" onclick="selecionarSaidaItem('${esc(m.nome)}','${esc(m.unidade||'UN')}')">
      <span class="ac-cod">${m.codigo}</span>
      <span class="ac-label">${m.nome}</span>
      <span style="color:var(--texto3);font-size:10px;margin-left:auto">${m.saldo > 0 ? m.saldo.toFixed(2)+' '+m.unidade : '<span style="color:#f87171">sem saldo</span>'}</span>
    </div>`
  ).join('');
  list.classList.remove('hidden');
}

function selecionarSaidaItem(desc, unidade) {
  document.getElementById('saida-desc').value = desc;
  document.getElementById('saida-unidade').value = unidade;
  document.getElementById('ac-saida-list').classList.add('hidden');
  document.getElementById('saida-qtd').focus();
}

function _mostrarCampoPrecoSaida(desc) {
  const container = document.getElementById('saida-preco-container');
  if (!container) return;
  if (container.querySelector('#saida-preco-manual')) { container.querySelector('#saida-preco-manual').focus(); return; }
  const busca = encodeURIComponent(desc);
  container.innerHTML = `
    <div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.25);border-radius:10px;padding:12px;margin-top:8px;">
      <div style="font-size:10px;font-weight:700;color:var(--warning);letter-spacing:1px;margin-bottom:6px;">ITEM SEM PREÇO REGISTRADO</div>
      <div style="display:flex;gap:8px;align-items:center;">
        <input type="number" id="saida-preco-manual" placeholder="Custo unitário (R$)" step="0.01" min="0.01"
          style="flex:1;background:var(--bg3);border:1px solid rgba(245,158,11,0.3);border-radius:8px;padding:10px 12px;color:var(--branco);font-size:13px;">
        <a href="https://lista.mercadolivre.com.br/${busca}" target="_blank" rel="noopener"
          style="background:rgba(255,214,0,0.12);border:1px solid rgba(255,214,0,0.3);color:#fde047;border-radius:8px;padding:10px 12px;font-size:10px;font-weight:700;text-decoration:none;white-space:nowrap;">CONSULTAR ML</a>
      </div>
    </div>`;
  setTimeout(() => document.getElementById('saida-preco-manual')?.focus(), 100);
}

async function salvarSaidaMaterial() {
  const valores = Object.fromEntries(['saida-desc', 'saida-qtd', 'saida-unidade', 'saida-data',
    'saida-obra', 'saida-etapa', 'saida-obs', 'saida-preco-manual']
    .map(id => [id, document.getElementById(id)?.value || '']));
  return _executarSaidaEstoque(() => _gravarSaidaMaterial(valores));
}

async function _gravarSaidaMaterial(valores) {

  // A trava compartilhada e liberada no finally de _executarSaidaEstoque.
  const desc = (valores['saida-desc']||'').toUpperCase().trim();
  const qtd = parseFloat(valores['saida-qtd'])||0;
  const unidade = valores['saida-unidade']||'UN';
  const data = valores['saida-data'];
  const obraId = valores['saida-obra'];
  const etapa = valores['saida-etapa'];
  const obs = (valores['saida-obs']||'').toUpperCase();
  const obraObj = obras.find(o => o.id === obraId);

  if (!desc) { showToast('Informe o material.'); return; }
  if (!Number.isFinite(qtd) || qtd <= 0) { showToast('Informe a quantidade.'); return; }
  if (!obraId) { showToast('Selecione a obra destino.'); return; }
  if (!etapa) { showToast('Selecione o centro de custo.'); document.getElementById('saida-etapa').focus(); return; }
  if (!data) { showToast('Informe a data.'); document.getElementById('saida-data').focus(); return; }
  if (_dataSuspeita(data) && !confirm(`A data ${data} parece fora do normal. Confirmar mesmo assim?`)) { document.getElementById('saida-data').focus(); return; }

  if (!EstoqueModule._consolidado.length) consolidarEstoque();
  const estoqueItem = EstoqueModule._consolidado.find(m => norm(m.desc) === norm(desc));
  if (!estoqueItem) return showToast('Material não encontrado no estoque. Confira o catálogo e o saldo antes de lançar a saída.', 6000);
  if (_usarSaidaAtomica()) {
    const manual = Number(valores['saida-preco-manual']);
    if (Number(estoqueItem.valorMedio) <= 0 && !_pendenciaSaidaEstoque() && !(Number.isFinite(manual) && manual > 0)) {
      _mostrarCampoPrecoSaida(desc);
      return showToast('Informe o custo unitário.');
    }
    return _registrarSaidaAtomica({ item: estoqueItem, qtd, obraId, etapa, data, criterio: 'fifo', obs,
      precoManual: Number(estoqueItem.valorMedio) <= 0 ? (manual || null) : null });
  }
  const saldo = estoqueItem.saldo || 0;
  if (saldo < qtd) {
    showToast(`Saldo atual: ${saldo} ${unidade} — saída de ${qtd} vai gerar negativo.`);
  }

  const plano = _planejarOrigemSaidaEstoque(estoqueItem, qtd, data);
  if (!plano.ok) return showToast(plano.erro, 7000);

  let valorUnit = qtd > 0 ? plano.valor / qtd : 0;
  if (valorUnit <= 0) {
    const precoInput = document.getElementById('saida-preco-manual');
    if (precoInput) valorUnit = parseFloat(valores['saida-preco-manual']) || 0;
    if (valorUnit <= 0) {
      showToast('Informe o custo unitário.');
      _mostrarCampoPrecoSaida(desc);
      return;
    }
  }

  try {
    const valor = qtd * valorUnit;
    const _catsSaida = EstoqueModule.catalogoMateriais?.length ? EstoqueModule.catalogoMateriais : (typeof catalogoMateriais !== 'undefined' ? catalogoMateriais : []);
    const codSaida = _catsSaida.find(m => norm(m.nome) === norm(desc));
    // Custo primeiro e checado. `lanc` fica null SOMENTE no ramo defensivo valor<=0 abaixo
    // (inatingivel hoje: a validacao acima exige custo > 0). NUNCA null por falha silenciosa — !lanc aborta.
    let lanc = null;
    if (valor > 0) {
      const descSaida = codSaida ? `${codSaida.codigo} · ${desc}` : desc;
      lanc = await sbPost('lancamentos', {
        obra_id: obraId, descricao: descSaida,
        qtd, preco: valorUnit, total: valor, data,
        obs: obs || 'SAÍDA MANUAL DE ESTOQUE', etapa,
        origem: 'saida_manual',
        nota_id: plano.origem?.nota_id || null,
        ...custoClassificacaoNovo(obraId)
      });
      if (!lanc) { showToast('Erro ao lancar o custo. Nada foi registrado.', 5000); return; }
    }
    // Ramo valor<=0: DEFENSIVO / inatingivel hoje (custo obrigatorio na validacao acima). A distribuicao
    // sem lancamento existe so como fallback de seguranca — NAO e regra de negocio "saida sem custo".
    const nova = await sbPost('distribuicoes', {
      item_desc: desc, item_idx: plano.origem?.item_idx ?? 0, obra_id: obraId,
      nota_id: plano.origem?.nota_id || null,
      obra_nome: obraObj?.nome || '',
      qtd, valor, etapa, data,
      lancamento_id: lanc ? lanc.id : null,
      codigo_catalogo: codSaida?.codigo || null
    });
    if (!nova) {
      if (lanc) {
        // Distribuicao falhou DEPOIS do custo gravado: rollback best-effort (evita custo sem baixa e retry que duplica).
        const desfeito = await sbDelete('lancamentos', lanc.id);
        if (desfeito) showToast('Falha ao baixar o estoque. O custo foi revertido — tente novamente.', 8000);
        else showToast('Falha ao baixar o estoque e o custo NAO pode ser revertido. Verifique antes de refazer a saida.', 8000);
        if (typeof loadLancamentos === 'function') await loadLancamentos();
        if (typeof loadDistribuicoes === 'function') await loadDistribuicoes();
        renderEstoque();
        if (typeof renderDashboard === 'function') renderDashboard();
      } else {
        // ramo defensivo valor<=0: nao houve lancamento, nada a reverter
        showToast('Erro ao salvar saída. Verifique o console.');
      }
      return;
    }
    // Cache local so apos consistente (dist ok; lancamento quando houve).
    if (lanc) lancamentos.unshift(lanc);
    distribuicoes.unshift(nova);
    showToast(`Baixa de ${qtd} ${unidade} de ${desc} registrada!`);
    fecharModal('saida');
    renderEstoque();
    if (typeof renderDashboard === 'function') renderDashboard();
  } catch(e) { console.error(e); showToast('Não foi possível registrar a saída.'); }
}


// ── AJUSTE DE ESTOQUE (MODAL GERAL) ────────────────────────
let ajusteTipoAtual = 'inventario';

function _abrirModalAjusteGeral() {
  ajusteTipoAtual = 'inventario';
  document.getElementById('ajuste-desc').value = '';
  document.getElementById('ajuste-qtd').value = '';
  document.getElementById('ajuste-unidade').value = '';
  document.getElementById('ajuste-motivo').value = '';
  document.getElementById('ajuste-saldo-atual').style.display = 'none';
  document.getElementById('ac-ajuste-list').classList.add('hidden');
  setTipoAjuste('inventario');
  openModal('modal-ajuste');
  setTimeout(() => document.getElementById('ajuste-desc').focus(), 100);
}

function setTipoAjuste(tipo) {
  ajusteTipoAtual = tipo;
  const btns = { inventario: 'btn-ajuste-inventario', contagem: 'btn-ajuste-contagem', correcao: 'btn-ajuste-correcao' };
  const cores = { inventario: ['96,165,250', '#60a5fa'], contagem: ['46,204,113', 'var(--verde-hl)'], correcao: ['245,158,11', '#fbbf24'] };
  const infos = {
    inventario: 'Material que ja existia antes do sistema. Entra no saldo sem gerar custo.',
    contagem: 'Contagem fisica real. Informe a QUANTIDADE que voce contou — o sistema calcula a diferenca.',
    correcao: 'Correcao manual por erro de lancamento, perda ou extravio.'
  };
  const labels = { inventario: 'QUANTIDADE A ADICIONAR *', contagem: 'QUANTIDADE CONTADA *', correcao: 'QUANTIDADE A AJUSTAR (+ ou -) *' };
  Object.entries(btns).forEach(([k, id]) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (k === tipo) {
      el.style.background = `rgba(${cores[k][0]},0.15)`;
      el.style.color = cores[k][1];
      el.style.borderColor = `rgba(${cores[k][0]},0.4)`;
    } else {
      el.style.background = 'transparent';
      el.style.color = 'var(--texto3)';
      el.style.borderColor = `rgba(${cores[k][0]},0.2)`;
    }
  });
  const infoEl = document.getElementById('ajuste-tipo-info');
  if (infoEl) infoEl.textContent = infos[tipo];
  const labelEl = document.getElementById('ajuste-qtd-label');
  if (labelEl) labelEl.textContent = labels[tipo];
}

function onAjusteDescInput() {
  const val = document.getElementById('ajuste-desc').value;
  const list = document.getElementById('ac-ajuste-list');
  if (!val || val.length < 2) { list.classList.add('hidden'); return; }
  const v = norm(val);
  const cats = EstoqueModule.catalogoMateriais.length ? EstoqueModule.catalogoMateriais : (typeof catalogoMateriais !== 'undefined' ? catalogoMateriais : []);
  const matches = cats
    .filter(m => norm(m.nome).includes(v))
    .sort((a, b) => { const na = norm(a.nome), nb = norm(b.nome); return (na.startsWith(v) ? 0 : 1) - (nb.startsWith(v) ? 0 : 1); })
    .slice(0, 10);
  if (!matches.length) { list.classList.add('hidden'); return; }
  list.innerHTML = matches.map(m =>
    `<div class="autocomplete-item" onclick="selecionarAjusteItem('${esc(m.nome)}','${esc(m.unidade || 'UN')}')">
      ${m.codigo ? `<span class="ac-codigo">${m.codigo}</span>` : ''}<span class="ac-label">${m.nome}</span><span style="font-size:10px;color:var(--texto3);">${m.unidade || 'UN'}</span>
    </div>`
  ).join('');
  list.classList.remove('hidden');
}

function selecionarAjusteItem(desc, unidade) {
  document.getElementById('ajuste-desc').value = desc;
  document.getElementById('ajuste-unidade').value = unidade;
  document.getElementById('ac-ajuste-list').classList.add('hidden');
  if (!EstoqueModule._consolidado.length) consolidarEstoque();
  const m = EstoqueModule._consolidado.find(i => norm(i.desc) === norm(desc));
  const saldoEl = document.getElementById('ajuste-saldo-atual');
  if (m) {
    saldoEl.innerHTML = `Saldo atual no sistema: <strong style="color:var(--verde-hl);">${fmt(m.saldo)} ${m.unidade}</strong>`;
    saldoEl.style.display = 'block';
  } else {
    saldoEl.innerHTML = `Material sem saldo no sistema (será criado).`;
    saldoEl.style.display = 'block';
  }
  document.getElementById('ajuste-qtd').focus();
}

async function salvarAjusteModal() {
  const desc = (document.getElementById('ajuste-desc').value || '').toUpperCase().trim();
  const qtdRaw = (document.getElementById('ajuste-qtd').value || '').trim();
  let qtd = Number(qtdRaw);
  if (!qtdRaw || !Number.isFinite(qtd)) { showToast('Informe uma quantidade válida.'); return; }
  const unidade = (document.getElementById('ajuste-unidade').value || 'UN').toUpperCase();
  const motivo = (document.getElementById('ajuste-motivo').value || '').toUpperCase();
  if (!desc) { showToast('Informe o material.'); return; }
  if (ajusteTipoAtual === 'inventario' && qtd <= 0) { showToast('Inventário inicial deve ser positivo.'); return; }
  if (ajusteTipoAtual === 'correcao' && qtd === 0) { showToast('Informe a quantidade.'); return; }

  if (ajusteTipoAtual === 'contagem') {
    if (qtd < 0) { showToast('Contagem física deve ser >= 0.'); return; }
    if (!EstoqueModule._consolidado.length) consolidarEstoque();
    const m = EstoqueModule._consolidado.find(i => norm(i.desc) === norm(desc));
    const saldoAtual = m ? m.saldo : 0;
    const diff = qtd - saldoAtual;
    // Contagem que confere tambem estabelece um corte para futuros retroativos.
    const ok = await confirmar(`Contagem física: ${qtd} ${unidade}\nSaldo sistema: ${saldoAtual} ${unidade}\nDiferença: ${diff > 0 ? '+' : ''}${diff} ${unidade}\n\nConfirma o ajuste?`);
    if (!ok) return;
    // _motivoContagem embute o valor real para que consolidarEstoque use como reset point
    window._motivoContagemOverride = `sistema ${saldoAtual}, real ${qtd}, dif ${diff > 0 ? '+' : ''}${diff}${motivo ? ' · ' + motivo : ''}`;
    qtd = diff;
  } else {
    const label = { inventario: 'Inventário inicial', correcao: 'Correção manual' }[ajusteTipoAtual];
    const ok = await confirmar(`Confirma ${label}: ${qtd > 0 ? '+' : ''}${qtd} ${unidade} de ${desc}?`);
    if (!ok) return;
  }

  const label = { inventario: 'Inventário inicial', contagem: 'Contagem física', correcao: 'Correção manual' }[ajusteTipoAtual];
  // Para contagem: usar motivo com valor real embutido (para reset point no consolidarEstoque)
  const motivoFinal = window._motivoContagemOverride || `${label}${motivo ? ' · ' + motivo : ''}`;
  window._motivoContagemOverride = null;
  const _cats = (EstoqueModule.catalogoMateriais?.length ? EstoqueModule.catalogoMateriais : (typeof catalogoMateriais !== 'undefined' ? catalogoMateriais : []));
  const _matAjuste = _cats.find(m => norm(m.nome) === norm(desc));
  try {
    const novo = await sbPost('ajustes_estoque', {
      item_desc: desc, unidade, qtd,
      tipo: ajusteTipoAtual,
      motivo: motivoFinal,
      codigo_catalogo: _matAjuste?.codigo || null
    });
    if (!novo) { showToast('Erro ao salvar ajuste.'); return; }
    ajustesEstoque.unshift(novo);
    showToast(`Ajuste registrado: ${qtd > 0 ? '+' : ''}${qtd} ${unidade} de ${desc}`);
    fecharModal('ajuste');
    renderEstoque();
    if (typeof renderDashboard === 'function') renderDashboard();
  } catch (e) { console.error(e); showToast('Não foi possível registrar o ajuste. Execute o SQL no Setup.'); }
}


// ── NOVO MATERIAL (CATÁLOGO) ────────────────────────────────

// Retorna o menor código numérico disponível (preenche gaps de exclusões)
function obterProximoCodigoDisponivel(cats) {
  // Sempre ACIMA do maior codigo ja usado — NUNCA reutiliza codigo liberado.
  // Reutilizar buraco (ex: material deletado/duplicado) colidia com lancamentos historicos
  // que ainda referenciam o codigo antigo. Caso real: DAS pegou 000001 do ADITIVO VEDACIT removido.
  const usados = cats.map(m => parseInt(m.codigo)).filter(c => !isNaN(c) && c > 0);
  const max = usados.length ? Math.max(...usados) : 0;
  return String(max + 1).padStart(6, '0');
}

let _editandoMaterialId = null;

function onMatTipoChange() {
  const tipo = document.getElementById('mat-tipo-item')?.value || 'material';
  const aviso = document.getElementById('mat-aviso-servico');
  if (aviso) aviso.style.display = tipo === 'material' ? 'none' : 'block';
}

function abrirModalNovoMaterial(nomeInicial) {
  _editandoMaterialId = null;
  document.getElementById('mat-nome').value = nomeInicial || '';
  document.getElementById('mat-unidade').value = 'UN';
  const selCat = document.getElementById('mat-categoria');
  if (selCat && typeof ETAPAS !== 'undefined') {
    selCat.innerHTML = '<option value="">— Selecione —</option>' + ETAPAS.map(e => `<option value="${e.key}">${e.lb}</option>`).join('');
  }
  if (selCat) selCat.value = '';
  const selTipo = document.getElementById('mat-tipo-item');
  if (selTipo) selTipo.value = 'material';
  const avisoServico = document.getElementById('mat-aviso-servico');
  if (avisoServico) avisoServico.style.display = 'none';
  const aviso = document.getElementById('modal-material-aviso');
  if (aviso) aviso.style.display = 'none';
  document.getElementById('btn-salvar-mat').textContent = 'SALVAR MATERIAL';
  document.getElementById('btn-salvar-mat').disabled = false;
  openModal('modal-material');
  setTimeout(() => document.getElementById('mat-nome').focus(), 100);
}

function onMatNomeInput() {
  const input = document.getElementById('mat-nome');
  input.value = input.value.toUpperCase();
  const nome = input.value.trim();
  const aviso = document.getElementById('modal-material-aviso');
  const cats = EstoqueModule.catalogoMateriais.length ? EstoqueModule.catalogoMateriais : (typeof catalogoMateriais !== 'undefined' ? catalogoMateriais : []);
  if (nome.length >= 3) {
    const similar = cats.find(m => norm(m.nome) === norm(nome) && m.id !== _editandoMaterialId);
    if (similar) {
      aviso.innerHTML = `Material já existe: <b>${esc(similar.codigo)}</b> — ${esc(similar.nome)}`;
      aviso.style.display = 'block';
      document.getElementById('btn-salvar-mat').disabled = true;
    } else {
      aviso.style.display = 'none';
      document.getElementById('btn-salvar-mat').disabled = false;
    }
  } else {
    aviso.style.display = 'none';
    document.getElementById('btn-salvar-mat').disabled = false;
  }
}

// B1: material tem histórico físico de estoque? (entrada por NF no almoxarifado, entrada direta,
// ajuste ou distribuição/saída). Vínculo por codigo_catalogo; fallback nome normalizado p/ registros
// antigos sem código. Usado só para bloquear conversão material→serviço que apagaria esse histórico
// do consolidado sem baixa real. Todas as fontes são carregadas no boot (iniciarApp).
function _materialTemHistoricoEstoque(mat) {
  if (!mat) return false;
  const cod = mat.codigo || null;
  const nomeNorm = norm(mat.nome || '');
  const bate = (regCod, regDesc) =>
    (!!cod && regCod === cod) || (!!nomeNorm && norm(regDesc || '') === nomeNorm);
  const arr = v => (typeof v !== 'undefined' && Array.isArray(v)) ? v : [];

  if (arr(distribuicoes).some(d => bate(d.codigo_catalogo, d.item_desc))) return true;   // saídas
  if (arr(entradasDiretas).some(e => bate(e.codigo_catalogo, e.item_desc))) return true; // entrada direta
  if (arr(ajustesEstoque).some(a => bate(a.codigo_catalogo, a.item_desc))) return true;  // ajuste/contagem
  // entrada por NF (almoxarifado): itens embutidos nas notas
  for (const n of arr(notas)) {
    const itens = (typeof parseItens === 'function') ? parseItens(n) : [];
    if (itens.some(it => bate(it.codigo_catalogo || it.codigo || it.cod, it.descricao || it.desc))) return true;
  }
  return false;
}

async function salvarMaterial() {
  const nome = document.getElementById('mat-nome').value.trim().toUpperCase();
  const unidade = document.getElementById('mat-unidade').value;
  const categoria = document.getElementById('mat-categoria').value;
  const tipo_item = document.getElementById('mat-tipo-item')?.value || 'material';
  const movimenta_estoque = tipo_item === 'material';
  if (!nome) { showToast('Informe o nome do material.'); return; }
  // Centro de custo obrigatorio — impede material novo nascer "Nao classificado" e acumular
  if (!categoria) { showToast('Selecione o centro de custo do material.'); document.getElementById('mat-categoria')?.focus(); return; }
  const btn = document.getElementById('btn-salvar-mat');
  const cats = EstoqueModule.catalogoMateriais.length ? EstoqueModule.catalogoMateriais : (typeof catalogoMateriais !== 'undefined' ? catalogoMateriais : []);

  if (_editandoMaterialId) {
    const atual = cats.find(m => m.id === _editandoMaterialId);
    if (!atual) return;
    const duplicata = cats.find(m => m.id !== _editandoMaterialId && norm(m.nome) === norm(nome));
    if (duplicata) { showToast(`Material já existe: ${duplicata.codigo}`); return; }
    // B1: bloquear conversão material→serviço/taxa quando o material tem histórico de estoque.
    // Sem isso, movimenta_estoque=false esconde o saldo do consolidado sem nenhuma baixa real.
    if (atual.movimenta_estoque !== false && movimenta_estoque === false && _materialTemHistoricoEstoque(atual)) {
      showToast('Este material tem histórico de estoque. Não é seguro mudar para serviço/taxa. Zere ou saneie antes.');
      return;
    }
    btn.disabled = true; btn.textContent = 'SALVANDO...';
    try {
      // sbPatch (infra): objeto = persistiu / undefined = 0 linhas (id inexistente/RLS) / null = erro HTTP.
      const res = await sbPatch('materiais', _editandoMaterialId, { nome, unidade, categoria, tipo_item, movimenta_estoque, auto: false });
      if (!res) {
        // Falha: nao muta cache, nao fecha modal, nao reseta _editandoMaterialId (permite retentar).
        showToast(res === null ? 'Erro ao salvar as alterações.' : 'Material não encontrado no banco — recarregue o catálogo.', 5000);
      } else {
        atual.nome = nome; atual.unidade = unidade; atual.categoria = categoria;
        atual.tipo_item = tipo_item; atual.movimenta_estoque = movimenta_estoque; atual.auto = false;
        _editandoMaterialId = null;
        fecharModal('material');
        renderCatalogo();
        showToast(`Material ${atual.codigo} atualizado!`);
      }
    } catch(e) { showToast('Não foi possível atualizar o material.'); }
    btn.disabled = false; btn.textContent = 'SALVAR ALTERAÇÕES';
    return;
  }

  const existe = cats.find(m => norm(m.nome) === norm(nome));
  if (existe) { showToast(`Material já existe: ${existe.codigo}`); return; }
  // Recarregar catalogo para garantir codigo unico
  await _carregarCatalogo();
  const catsAtualizados = EstoqueModule.catalogoMateriais;
  const existeApos = catsAtualizados.find(m => norm(m.nome) === norm(nome));
  if (existeApos) { showToast(`Material já existe: ${existeApos.codigo}`); return; }
  const codigo = obterProximoCodigoDisponivel(catsAtualizados);
  btn.disabled = true; btn.textContent = 'SALVANDO...';
  try {
    const saved = await sbPost('materiais', { codigo, nome, unidade, categoria, tipo_item, movimenta_estoque });
    if (saved) {
      catsAtualizados.push(saved);
      catsAtualizados.sort((a,b) => (a.codigo||'').localeCompare(b.codigo||''));
      fecharModal('material');
      renderCatalogo();
      showToast(`Material ${codigo} — ${nome} cadastrado!`);
    } else {
      // Falha (erro/0-linhas): NAO esconder com recarga+sucesso. Reconcilia e mantem o modal aberto p/ retentar.
      await _carregarCatalogo();
      renderCatalogo();
      showToast('Não foi possível cadastrar o material. Tente novamente.', 5000);
    }
  } catch(e) { showToast('Não foi possível salvar o material.'); }
  btn.disabled = false; btn.textContent = 'SALVAR MATERIAL';
}


// ── GESTÃO DE CENTROS DE CUSTO (criar / renomear — sem excluir) ──
let _ccEditandoId = null;

function abrirCentrosCusto() {
  _ccResetFormCC();
  renderCentrosCustoLista();
  openModal('modal-centros-custo');
  setTimeout(() => document.getElementById('cc-nome')?.focus(), 100);
}

function _ccResetFormCC() {
  _ccEditandoId = null;
  const n = document.getElementById('cc-nome'); if (n) n.value = '';
  const c = document.getElementById('cc-cor'); if (c) c.value = '#546e7a';
  const av = document.getElementById('cc-aviso'); if (av) av.style.display = 'none';
  const lbl = document.getElementById('cc-btn-label'); if (lbl) lbl.textContent = 'ADICIONAR';
  const cancel = document.getElementById('cc-edit-cancel'); if (cancel) cancel.style.display = 'none';
}

function ccCancelarEdicao() { _ccResetFormCC(); }

function _ccAviso(msg) {
  const av = document.getElementById('cc-aviso');
  if (av) { av.textContent = msg; av.style.display = 'block'; }
}

function _ccNorm(s) { return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim(); }

function _ccGerarKey(nome) {
  const slug = _ccNorm(nome).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24) || 'novo';
  const usadas = new Set([
    ...((typeof ETAPAS !== 'undefined' ? ETAPAS : []).map(e => e.key)),
    ...((typeof centrosCustoCustom !== 'undefined' ? centrosCustoCustom : []).map(c => c.key))
  ]);
  let base = 'cc_' + slug, k = base, i = 2;
  while (usadas.has(k)) { k = base + '_' + i; i++; }
  return k;
}

function renderCentrosCustoLista() {
  const el = document.getElementById('cc-lista');
  if (!el) return;
  const lista = (typeof centrosCustoCustom !== 'undefined' ? centrosCustoCustom : []).slice()
    .sort((a, b) => (a.label || '').localeCompare(b.label || '', 'pt-BR'));
  if (!lista.length) {
    el.innerHTML = '<div style="font-size:12px;color:var(--text-tertiary);padding:10px 0;">Você ainda não criou nenhum. Os centros de custo padrão do sistema continuam disponíveis normalmente.</div>';
    return;
  }
  el.innerHTML = lista.map(c => `
    <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);">
      <span style="width:14px;height:14px;border-radius:4px;flex-shrink:0;background:${esc(c.cor || '#546e7a')};"></span>
      <span style="flex:1;font-size:13px;color:var(--text-primary);">${esc(c.label)}</span>
      <button class="lanc-action-btn" title="Renomear / cor" onclick="editarCentroCusto('${esc(c.id)}')"><span class="material-symbols-outlined" style="font-size:16px;">edit</span></button>
    </div>`).join('');
}

function editarCentroCusto(id) {
  const c = (typeof centrosCustoCustom !== 'undefined' ? centrosCustoCustom : []).find(x => x.id === id);
  if (!c) return;
  _ccEditandoId = id;
  document.getElementById('cc-nome').value = c.label || '';
  document.getElementById('cc-cor').value = c.cor || '#546e7a';
  document.getElementById('cc-btn-label').textContent = 'SALVAR';
  document.getElementById('cc-edit-cancel').style.display = 'block';
  document.getElementById('cc-aviso').style.display = 'none';
}

async function salvarCentroCusto() {
  const nome = (document.getElementById('cc-nome').value || '').trim().toUpperCase();
  const cor = document.getElementById('cc-cor').value || '#546e7a';
  if (!nome) { _ccAviso('Informe o nome do centro de custo.'); return; }
  const base = (typeof _ETAPAS_BASE !== 'undefined' ? _ETAPAS_BASE : []);
  const custom = (typeof centrosCustoCustom !== 'undefined' ? centrosCustoCustom : []);
  if (base.find(e => _ccNorm(e.lb) === _ccNorm(nome))) { _ccAviso('Já existe um centro de custo padrão com esse nome.'); return; }
  if (custom.find(c => _ccNorm(c.label) === _ccNorm(nome) && c.id !== _ccEditandoId)) { _ccAviso('Você já criou um centro de custo com esse nome.'); return; }
  const btn = document.getElementById('cc-btn-salvar'); btn.disabled = true;
  try {
    if (_ccEditandoId) {
      await sbPatch('centros_custo', _ccEditandoId, { label: nome, cor });
    } else {
      await sbPost('centros_custo', { key: _ccGerarKey(nome), label: nome, cor, ordem: 500 });
    }
    const editava = !!_ccEditandoId;
    if (typeof loadCentrosCusto === 'function') await loadCentrosCusto();
    _ccResetFormCC();
    renderCentrosCustoLista();
    if (typeof renderCatalogo === 'function') renderCatalogo();
    showToast(editava ? 'Centro de custo atualizado!' : `Centro de custo "${nome}" criado!`);
  } catch (e) { _ccAviso('Erro ao salvar: ' + (e.message || e)); }
  btn.disabled = false;
}


// ── BANCO / CONFIGURAÇÃO ────────────────────────────────────
function renderBanco() {
  const obrasEl = document.getElementById('banco-obras-lista');
  if (obrasEl) {
    if (!obras.length) { obrasEl.innerHTML = '<div style="text-align:center;padding:20px;color:var(--texto3);">Nenhuma obra cadastrada.</div>'; }
    else {
      obrasEl.innerHTML = obras.map((o, i) => {
        const ls = lancamentos.filter(l => l.obra_id === o.id);
        const total = ls.reduce((s,l) => s + Number(l.total||0), 0);
        const status = o.status === 'concluida' ? '<span style="font-size:9px;padding:2px 8px;border-radius:10px;background:rgba(34,197,94,0.08);color:var(--verde-hl);font-weight:700;margin-left:8px;">CONCLUÍDA</span>' : '';
        const borda = i < obras.length - 1 ? 'border-bottom:1px solid var(--borda2);' : '';
        return `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;${borda}">
          <div style="flex:1;min-width:0;margin-right:12px;">
            <div style="font-weight:700;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(o.nome)}${status}</div>
            <div style="font-size:11px;color:var(--texto3);margin-top:2px;">${ls.length} lançamento${ls.length!==1?'s':''}</div>
          </div>
          <div style="font-weight:700;color:var(--verde-hl);font-size:13px;white-space:nowrap;">${fmtR(total)}</div>
        </div>`;
      }).join('');
    }
  }

  const fornEl = document.getElementById('banco-forn-lista');
  if (fornEl) {
    const fornMap = {};
    notas.forEach(n => {
      if (!n.fornecedor) return;
      if (!fornMap[n.fornecedor]) fornMap[n.fornecedor] = { total: 0, qtd: 0, cnpj: n.cnpj || '' };
      fornMap[n.fornecedor].total += Number(n.valor_bruto||0);
      fornMap[n.fornecedor].qtd++;
    });
    const forns = Object.entries(fornMap).sort((a,b) => b[1].total - a[1].total);
    const countEl = document.getElementById('banco-forn-count');
    if (countEl) countEl.textContent = `(${forns.length})`;
    if (!forns.length) { fornEl.innerHTML = '<div style="text-align:center;padding:20px;color:var(--texto3);">Nenhum fornecedor ainda.</div>'; }
    else {
      fornEl.innerHTML = forns.map(([nome, d], i) => {
        const borda = i < forns.length - 1 ? 'border-bottom:1px solid var(--borda2);' : '';
        return `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;${borda}">
          <div style="flex:1;min-width:0;margin-right:12px;">
            <div style="font-weight:700;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(nome)}</div>
            <div style="font-size:11px;color:var(--texto3);margin-top:2px;">${esc(d.cnpj || 'CNPJ não informado')} · ${d.qtd} nota${d.qtd!==1?'s':''}</div>
          </div>
          <div style="font-weight:700;color:var(--verde-hl);font-size:13px;white-space:nowrap;">${fmtR(d.total)}</div>
        </div>`;
      }).join('');
    }
  }

  const usersEl = document.getElementById('banco-users-lista');
  if (usersEl) {
    const lista = typeof USUARIOS !== 'undefined' ? USUARIOS.filter(u => u.ativo !== false) : [];
    if (!lista.length) { usersEl.innerHTML = '<div style="text-align:center;padding:20px;color:var(--texto3);">Nenhum usuário cadastrado.</div>'; }
    else {
      const iconePerfil = p => p === 'admin' ? '<span class="material-symbols-outlined icon-sm">admin_panel_settings</span>' : p === 'mestre' ? '<span class="material-symbols-outlined icon-sm">engineering</span>' : '<span class="material-symbols-outlined icon-sm">person</span>';
      const labelPerfil = p => p === 'admin' ? 'Admin' : p === 'mestre' ? 'Mestre' : 'Operacional';
      usersEl.innerHTML = lista.map((u, i) => {
        const borda = i < lista.length - 1 ? 'border-bottom:1px solid var(--borda2);' : '';
        return `<div style="display:flex;align-items:center;gap:12px;padding:10px 0;${borda}">
          <div style="width:36px;height:36px;border-radius:50%;background:var(--verde-bg);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;">${iconePerfil(u.perfil)}</div>
          <div>
            <div style="font-weight:700;font-size:13px;">${esc(u.nome)}</div>
            <div style="font-size:11px;color:var(--texto3);">@${esc(u.usuario)} · ${labelPerfil(u.perfil)}</div>
          </div>
        </div>`;
      }).join('');
    }
  }
}

// ── ALIASES E COMPAT ────────────────────────────────────────────
// abrirReconciliacao: botão no HTML chama esta função
function abrirReconciliacao() { escanearOrfaos(); }

// editCentroCusto: alias para editarMaterial (compatibilidade)
window.editCentroCusto = function(id) { editarMaterial(id); };
