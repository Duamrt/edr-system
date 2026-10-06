/*
 * Loader financeiro somente leitura. Nenhuma dependencia de DOM, auth global,
 * inicializacao de Diarias ou funcao de escrita.
 *
 * criar({ obterIdentidade, obterPagina, carregarLedger, criarDre, obrasInternas? })
 * identidade: { company_id, ator_id, perfil: 'admin' } (aliases companyId/atorId).
 * obterPagina(tabela, query) deve usar o helper tenant autenticado existente,
 * com throwOnError:true. Este modulo pagina e valida a resposta por conta propria.
 * carregar() devolve arrays confirmados ou null, fontes e dominios separados.
 * Uma carga cuja identidade mudou rejeita LEITURA_OBSOLETA, sem publicar dados.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FinanceiroVisaoDados = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const TAMANHO_PAGINA = 1000;
  const MAX_PAGINAS = 100;
  const FONTES = [
    ['obras', 'obras', 'id,company_id,nome,arquivada,valor_venda,area_m2', 'nome,id'],
    ['lancamentos', 'lancamentos', 'id,company_id,obra_id,data,etapa,total,descricao,nota_id,obs', 'data,id'],
    ['repasses', 'repasses_cef', 'id,company_id,obra_id,tipo,data_credito,valor', 'data_credito,id'],
    ['adicionais', 'obra_adicionais', 'id,company_id,obra_id,status,valor,descricao', 'id'],
    ['pagamentosAdicionais', 'adicional_pagamentos', 'id,company_id,adicional_id,data,valor', 'data,id'],
    ['contasPagar', 'contas_pagar', 'id,company_id,obra_id,fornecedor,descricao,valor,status,data_vencimento,data_pagamento,data_recebimento,tipo,nota_id,nota_ref', 'data_vencimento,id'],
    ['notas', 'notas_fiscais', 'id,company_id,obra', 'id'],
    ['quinzenas', 'diarias_quinzenas', 'id,company_id,label,data_inicio,data_fim,fechada,excluida,excluida_em', 'data_inicio,id'],
    ['diarias', 'diarias', 'id,company_id,quinzena_id,data,funcionario,funcionario_id,status,periodos,total_fracoes,diaria_base,valor,faltas_turno', 'data,id'],
    ['extras', 'diarias_extras', 'id,company_id,quinzena_id,funcionario,descricao,valor,obra', 'id']
  ];
  const DRE_FONTES = ['obras', 'lancamentos', 'repasses', 'adicionais', 'pagamentosAdicionais', 'contasPagar', 'notas'];

  function erro(codigo) {
    const e = new Error(codigo === 'LEITURA_OBSOLETA'
      ? 'A identidade mudou durante a consulta. Recarregue.' : 'Fonte financeira nao confirmada.');
    e.code = codigo;
    return e;
  }
  function identidade(valor) {
    if (!valor || typeof valor !== 'object') return null;
    const company = valor.company_id == null ? valor.companyId : valor.company_id;
    const ator = valor.ator_id == null ? valor.atorId : valor.ator_id;
    if (typeof company !== 'string' || !company.trim() || typeof ator !== 'string' || !ator.trim() || valor.perfil !== 'admin') return null;
    return { company_id: company, ator_id: ator, perfil: valor.perfil };
  }
  function igual(a, b) {
    return !!a && !!b && a.company_id === b.company_id && a.ator_id === b.ator_id && a.perfil === b.perfil;
  }
  function copiar(valor) {
    return JSON.parse(JSON.stringify(valor));
  }
  function registro(r) {
    return !!r && typeof r === 'object' && !Array.isArray(r);
  }
  function idValido(id) {
    return (typeof id === 'string' && !!id.trim()) || (typeof id === 'number' && Number.isSafeInteger(id));
  }
  function dataCivil(data) {
    if (typeof data !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return false;
    const [ano, mes, dia] = data.split('-').map(Number);
    const bi = ano % 4 === 0 && (ano % 100 !== 0 || ano % 400 === 0);
    return mes >= 1 && mes <= 12 && dia >= 1 && dia <= [31, bi ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mes - 1];
  }
  function instante(valor) {
    return typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(valor) && Number.isFinite(Date.parse(valor));
  }
  function congelar(valor) {
    if (valor && typeof valor === 'object' && !Object.isFrozen(valor)) {
      Object.values(valor).forEach(congelar);
      Object.freeze(valor);
    }
    return valor;
  }
  function declaracao(status, quantidade, codigo) {
    return { status, quantidade: quantidade == null ? null : quantidade, codigo: codigo || null };
  }
  function dominio(fontes, nomes) {
    const confirmadas = nomes.filter(n => fontes[n]?.status === 'confirmada').length;
    return { status: confirmadas === nomes.length ? 'confirmada' : confirmadas ? 'parcial' : 'indisponivel' };
  }
  function validarLedger(valor, company) {
    const estado = valor?.estado || valor?.dados || valor;
    if (valor?.status && !['confirmada', 'confirmado'].includes(valor.status)) throw erro('LEDGER_INDISPONIVEL');
    if (valor?.ok === false || !registro(estado) || estado.company_id !== company ||
        !['contas', 'movimentos', 'pagamentos'].every(n => Array.isArray(estado[n]) && estado[n].every(registro)) ||
        !Number.isSafeInteger(estado.total_centavos)) throw erro('LEDGER_INVALIDO');
    const e = copiar(estado);
    const contas = new Set(), codigos = new Set();
    let total = 0n;
    if (e.contas.length !== 0 && e.contas.length !== 2) throw erro('LEDGER_INVALIDO');
    for (const c of e.contas) {
      if (!idValido(c.id) || contas.has(String(c.id)) || !['banco', 'dinheiro'].includes(c.codigo) || codigos.has(c.codigo) ||
          typeof c.nome !== 'string' || !c.nome.trim() || !Number.isSafeInteger(c.abertura_centavos) || c.abertura_centavos < 0 ||
          !Number.isSafeInteger(c.saldo_centavos) || !instante(c.corte_em) || typeof c.fuso !== 'string' || !c.fuso.trim()) throw erro('LEDGER_INVALIDO');
      contas.add(String(c.id)); codigos.add(c.codigo);
      total += BigInt(c.saldo_centavos);
    }
    if (total !== BigInt(e.total_centavos) || (!e.contas.length && e.movimentos.length)) throw erro('LEDGER_INVALIDO');
    const pagamentos = new Set();
    for (const p of e.pagamentos) {
      if (!idValido(p.conta_pagar_id) || pagamentos.has(String(p.conta_pagar_id)) ||
          !Number.isSafeInteger(p.pago_centavos) || p.pago_centavos < 0 ||
          !Number.isSafeInteger(p.restante_centavos) || p.restante_centavos < 0) throw erro('LEDGER_INVALIDO');
      pagamentos.add(String(p.conta_pagar_id));
    }
    const movimentos = new Set(), operacoes = new Set();
    for (const m of e.movimentos) {
      if (!idValido(m.id) || movimentos.has(String(m.id)) || !idValido(m.operacao_id) || operacoes.has(String(m.operacao_id)) ||
          !['entrada', 'saida', 'transferencia', 'pagamento'].includes(m.tipo) || !contas.has(String(m.conta_id)) ||
          !Number.isSafeInteger(m.valor_centavos) || m.valor_centavos <= 0 || !dataCivil(m.data_efetiva) ||
          (m.hora_efetiva != null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(m.hora_efetiva)) ||
          !['incluido_abertura', 'apos_corte'].includes(m.decisao_corte) || typeof m.afeta_saldo !== 'boolean' ||
          (m.cancelado_em != null && (!instante(m.cancelado_em) || m.afeta_saldo)) ||
          (m.decisao_corte === 'incluido_abertura' && m.afeta_saldo) ||
          typeof m.descricao !== 'string' || !m.descricao.trim() ||
          (m.tipo === 'pagamento' ? !idValido(m.conta_pagar_id) : m.conta_pagar_id != null) ||
          (m.tipo === 'transferencia' ? !contas.has(String(m.destino_id)) || m.destino_id === m.conta_id : m.destino_id != null)) throw erro('LEDGER_INVALIDO');
      movimentos.add(String(m.id)); operacoes.add(String(m.operacao_id));
    }
    return e;
  }

  function criar(deps) {
    if (!deps || !['obterIdentidade', 'obterPagina', 'carregarLedger', 'criarDre'].every(n => typeof deps[n] === 'function')) {
      throw new TypeError('Dependencias de leitura financeira incompletas.');
    }
    const internas = deps.obrasInternas == null ? [] : deps.obrasInternas;
    if (!Array.isArray(internas) || internas.some(id => typeof id !== 'string' || !id.trim())) {
      throw new TypeError('IDs de obras internas invalidos.');
    }
    const obrasInternas = copiar(internas);
    let revisao = 0;

    async function carregar() {
      const leitura = ++revisao;
      const inicial = identidade(deps.obterIdentidade());
      function vigente() {
        if (leitura !== revisao || !igual(inicial, identidade(deps.obterIdentidade()))) throw erro('LEITURA_OBSOLETA');
      }
      const snapshot = {
        company_id: inicial?.company_id || null, companyId: inicial?.company_id || null,
        ator_id: inicial?.ator_id || null, perfil: inicial?.perfil || null,
        fontes: {}, dominios: {}, obrasInternas: copiar(obrasInternas), OBRAS_INTERNAS: copiar(obrasInternas),
        coberturaFolha: {
          tipo: 'registros_de_competencia', comprovaPagamento: false, coberturaOperacional: 'nao_verificada',
          avisos: [
            'Consulta completa de registros nao comprova cobertura operacional de todos os dias.',
            'Periodo fechado representa custo lancado; nao comprova pagamento.',
            'Valores historicos persistidos; sem recalculo por taxa atual.',
            'Extras possuem contexto de quinzena e obra textual; nao possuem data efetiva comprovada nesta leitura.'
          ]
        }
      };
      FONTES.forEach(([nome]) => { snapshot[nome] = null; });
      if (!inicial) {
        FONTES.forEach(([nome]) => { snapshot.fontes[nome] = declaracao('indisponivel', null, 'IDENTIDADE_NAO_AUTORIZADA'); });
        snapshot.fontes.ledger = declaracao('indisponivel', null, 'IDENTIDADE_NAO_AUTORIZADA');
        snapshot.fontes.dre = declaracao('indisponivel', null, 'IDENTIDADE_NAO_AUTORIZADA');
        snapshot.ledger = { status: 'indisponivel', estado: null };
        snapshot.dre = { status: 'indisponivel' };
        return concluir(snapshot);
      }

      async function lerFonte([nome, tabela, campos, ordem]) {
        const rows = [], ids = new Set();
        let offset = 0;
        try {
          for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
            vigente();
            const q = '?select=' + campos + '&order=' + ordem + '&limit=' + TAMANHO_PAGINA + '&offset=' + offset;
            const batch = await deps.obterPagina(tabela, q);
            vigente();
            if (!Array.isArray(batch) || batch.length > TAMANHO_PAGINA) throw erro('RESPOSTA_INVALIDA');
            for (const r of batch) {
              if (!registro(r) || r.company_id !== inicial.company_id || !idValido(r.id) || ids.has(String(r.id))) {
                throw erro('REGISTROS_INVALIDOS');
              }
              ids.add(String(r.id));
              const row = copiar(r);
              if (nome === 'diarias') {
                if (typeof row.periodos === 'string') {
                  try { row.periodos = JSON.parse(row.periodos); } catch (_) { throw erro('PERIODOS_INVALIDOS'); }
                }
                if (!Array.isArray(row.periodos) || row.periodos.some(p => !registro(p))) throw erro('PERIODOS_INVALIDOS');
              }
              rows.push(row);
            }
            // O servidor pode limitar a resposta abaixo de 1000. So uma pagina
            // vazia confirma o fim; avancar pelo tamanho real evita pular linhas.
            if (batch.length === 0) {
              return { nome, rows, fonte: declaracao('confirmada', rows.length) };
            }
            offset += batch.length;
          }
          throw erro('LIMITE_PAGINACAO');
        } catch (e) {
          vigente();
          return { nome, rows: null, fonte: declaracao('indisponivel', null,
            ['RESPOSTA_INVALIDA', 'REGISTROS_INVALIDOS', 'PERIODOS_INVALIDOS', 'LIMITE_PAGINACAO'].includes(e?.code) ? e.code : 'LEITURA_FALHOU') };
        }
      }
      async function lerLedger() {
        try {
          vigente();
          const valor = await deps.carregarLedger();
          vigente();
          const estado = validarLedger(valor, inicial.company_id);
          return { ledger: { status: 'confirmada', estado }, fonte: declaracao('confirmada', estado.movimentos.length) };
        } catch (_) {
          vigente();
          return { ledger: { status: 'indisponivel', estado: null }, fonte: declaracao('indisponivel', null, 'LEDGER_INDISPONIVEL') };
        }
      }
      const [resultados, caixa] = await Promise.all([Promise.all(FONTES.map(lerFonte)), lerLedger()]);
      vigente();
      resultados.forEach(r => { snapshot[r.nome] = r.rows; snapshot.fontes[r.nome] = r.fonte; });
      snapshot.ledger = caixa.ledger;
      snapshot.fontes.ledger = caixa.fonte;
      snapshot.dre = { status: 'indisponivel' };
      snapshot.fontes.dre = declaracao('indisponivel', null, 'FONTES_DRE_INCOMPLETAS');
      if (DRE_FONTES.every(nome => snapshot.fontes[nome].status === 'confirmada')) {
        try {
          // Copia congelada: a factory nao pode alterar o snapshot do loader.
          const contexto = congelar(copiar(snapshot));
          const adapter = await deps.criarDre(contexto);
          vigente();
          if (!adapter || typeof adapter.calcGerencialPorObra !== 'function' ||
              typeof adapter.calcGerencialConsolidado !== 'function' ||
              (adapter.status != null && !['confirmada', 'confirmado'].includes(adapter.status))) throw erro('ADAPTER_DRE_INVALIDO');
          snapshot.dre = { ...adapter, status: 'confirmada' };
          snapshot.fontes.dre = declaracao('confirmada', null);
        } catch (_) {
          vigente();
          snapshot.fontes.dre = declaracao('indisponivel', null, 'ADAPTER_DRE_INDISPONIVEL');
        }
      }
      vigente();
      return concluir(snapshot);
    }
    return Object.freeze({ carregar });
  }

  function concluir(snapshot) {
    const f = snapshot.fontes;
    snapshot.dominios = {
      recebiveis: dominio(f, ['obras', 'repasses', 'adicionais', 'pagamentosAdicionais']),
      custos: dominio(f, ['obras', 'lancamentos']),
      dre: dominio(f, DRE_FONTES.concat('dre')),
      folha: { ...dominio(f, ['quinzenas', 'diarias', 'extras']), escopo: 'consulta_registros', coberturaOperacional: 'nao_verificada' },
      obrigacoes: dominio(f, ['contasPagar', 'ledger']),
      caixa: dominio(f, ['ledger'])
    };
    const valores = Object.values(snapshot.dominios);
    snapshot.status = valores.every(d => d.status === 'confirmada') ? 'confirmada'
      : valores.every(d => d.status === 'indisponivel') ? 'indisponivel' : 'parcial';
    return congelar(snapshot);
  }

  return Object.freeze({ criar });
});
