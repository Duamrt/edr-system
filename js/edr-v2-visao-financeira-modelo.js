/*
 * Visao financeira: modelo de leitura puro, sem DOM, rede ou caches.
 *
 * API: normalizarFiltro(filtro), mesesDisponiveis(snapshot),
 *      construir(snapshot, filtro), saldoGeral(ledger, companyId), centavos(valor).
 *
 * snapshot: companyId (ou company_id, obrigatorio), obras, lancamentos, repasses, adicionais,
 * pagamentosAdicionais, obrasInternas (IDs opcionais), fontes e dre.
 * Cada fonte pode declarar "confirmada", "parcial" ou "indisponivel";
 * arrays explicitos sem declaracao sao considerados confirmados pelo chamador.
 * Uma fonte ausente/parcial/indisponivel produz null nos valores dependentes.
 *
 * dre: adapter sincronico previamente preparado, status "confirmada",
 * calcGerencialConsolidado(periodo), calcGerencialPorObra(id, periodo)
 * e calcGerencialOverhead(periodo) opcional. O adapter deve capturar dados
 * confirmados da empresa. Este modelo nao carrega dados nem refaz o engine DRE.
 *
 * ledger: { status: "confirmada" (ou "confirmado"), estado: respostaDeCaixaEstado }.
 * Saldo geral e atual: nao e filtrado/rateado por obra ou competencia.
 * Carteira e recebiveis sao acumulados; recebido/custo usam o periodo.
 * Cada pendencia/excedente e calculado antes da soma: nenhuma compensacao.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FinanceiroVisaoModelo = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const FONTES = ['obras', 'lancamentos', 'repasses', 'adicionais', 'pagamentosAdicionais'];
  const CAMPOS = [
    'contratoPrevistoCentavos', 'contratoRecebidoCentavos',
    'adicionaisPrevistosCentavos', 'adicionaisRecebidosCentavos',
    'carteiraCentavos', 'recebidoAcumuladoCentavos', 'recebidoPeriodoCentavos',
    'custoPeriodoCentavos', 'diferencaRecebidoCustoCentavos',
    'pendenteContratoCentavos', 'excedenteContratoCentavos',
    'pendenteAdicionaisCentavos', 'excedenteAdicionaisCentavos'
  ];

  function normalizarFiltro(filtro) {
    const f = filtro || {};
    const periodo = f.periodo == null ? '' : String(f.periodo);
    const obraId = f.obraId == null ? '' : String(f.obraId);
    const situacao = f.situacao == null ? 'ativas' : String(f.situacao);
    if (periodo && !/^\d{4}-(0[1-9]|1[0-2])$/.test(periodo)) throw new RangeError('Periodo invalido.');
    if (!['ativas', 'arquivadas', 'todas'].includes(situacao)) throw new RangeError('Situacao invalida.');
    return { periodo, obraId, situacao };
  }

  // Arredonda cada valor decimal na origem, sem somar floats monetarios.
  // Null/valor invalido nao representa zero. O terceiro decimal arredonda
  // para fora de zero, de forma deterministica tambem para numeros negativos.
  function centavos(valor) {
    if (valor == null || valor === '' || typeof valor === 'boolean') return null;
    if (typeof valor !== 'number' && typeof valor !== 'string') return null;
    if (typeof valor === 'number' && !Number.isFinite(valor)) return null;
    const s = String(valor).trim();
    if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
    const negativo = s.startsWith('-');
    const partes = (negativo ? s.slice(1) : s).split('.');
    const fracao = partes[1] || '';
    let n = BigInt(partes[0]) * 100n + BigInt((fracao + '00').slice(0, 2));
    if (fracao.length > 2 && fracao[2] >= '5') n += 1n;
    if (negativo) n = -n;
    if (n > BigInt(Number.MAX_SAFE_INTEGER) || n < BigInt(Number.MIN_SAFE_INTEGER)) return null;
    return Number(n);
  }

  function soma(valores) {
    if (!Array.isArray(valores) || valores.some(v => !Number.isSafeInteger(v))) return null;
    let total = 0n;
    for (const v of valores) total += BigInt(v);
    return total > BigInt(Number.MAX_SAFE_INTEGER) || total < BigInt(Number.MIN_SAFE_INTEGER) ? null : Number(total);
  }
  function diferenca(a, b) {
    return Number.isSafeInteger(a) && Number.isSafeInteger(b) ? soma([a, -b]) : null;
  }
  function posicao(previsto, recebido) {
    const delta = diferenca(previsto, recebido);
    return {
      previstoCentavos: previsto, recebidoCentavos: recebido,
      pendenteCentavos: delta == null ? null : Math.max(delta, 0),
      excedenteCentavos: delta == null ? null : Math.max(-delta, 0)
    };
  }
  function dataCivil(valor) {
    if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
    const [ano, mes, dia] = valor.split('-').map(Number);
    const bissexto = ano % 4 === 0 && (ano % 100 !== 0 || ano % 400 === 0);
    const dias = [31, bissexto ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return mes >= 1 && mes <= 12 && dia >= 1 && dia <= dias[mes - 1];
  }
  function empresa(snapshot) {
    const value = snapshot.companyId || snapshot.company_id;
    return typeof value === 'string' && value.trim() ? value : null;
  }
  function fonte(snapshot, nome) {
    const declaracao = snapshot.fontes && snapshot.fontes[nome];
    const declarado = declaracao && typeof declaracao === 'object' ? declaracao.status : declaracao;
    let status = declarado == null ? 'confirmada' : declarado;
    const array = snapshot[nome];
    if (!empresa(snapshot) || !Array.isArray(array) || array.some(r => !r || typeof r !== 'object' || Array.isArray(r))) status = 'indisponivel';
    if (!['confirmada', 'parcial', 'indisponivel'].includes(status)) status = 'indisponivel';
    const rows = status === 'confirmada' ? array.filter(r => !r.company_id || r.company_id === empresa(snapshot)) : null;
    return { status, rows, quantidade: rows ? rows.length : null };
  }
  function fontes(snapshot) {
    return Object.fromEntries(FONTES.map(nome => [nome, fonte(snapshot, nome)]));
  }
  function sumRows(rows, campo, periodo, campoData) {
    if (!rows) return null;
    const valores = [];
    for (const row of rows) {
      if (periodo) {
        if (!dataCivil(row[campoData])) return null;
        if (!row[campoData].startsWith(periodo)) continue;
      }
      valores.push(centavos(row[campo]));
    }
    return soma(valores);
  }
  function mesesDisponiveis(snapshot) {
    const s = snapshot || {};
    const fs = fontes(s);
    const meses = new Set();
    for (const [nome, campo] of [['lancamentos', 'data'], ['repasses', 'data_credito'], ['pagamentosAdicionais', 'data']]) {
      for (const r of fs[nome].rows || []) if (dataCivil(r[campo])) meses.add(r[campo].slice(0, 7));
    }
    return [...meses].sort().reverse();
  }
  function obraReal(obra, internas) {
    const nome = String(obra.nome || '').toUpperCase();
    return !!obra.id && !internas.has(String(obra.id)) &&
      !/^OBRA QA/.test(nome) && !nome.includes('ESCRIT') && !nome.includes('ALMOX');
  }
  function copiar(valor) {
    if (valor == null || typeof valor === 'string' || typeof valor === 'boolean') return valor;
    if (typeof valor === 'number' && Number.isFinite(valor)) return valor;
    if (Array.isArray(valor)) return valor.map(copiar);
    if (typeof valor === 'object' && Object.prototype.toString.call(valor) === '[object Object]') {
      return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, copiar(v)]));
    }
    throw new TypeError('Resultado DRE invalido.');
  }
  function consultaDre(adapter, metodo, args) {
    if (!adapter || adapter.status !== 'confirmada' || typeof adapter[metodo] !== 'function') {
      return { status: 'indisponivel', dados: null };
    }
    try {
      const dados = adapter[metodo](...args);
      if (!dados || typeof dados !== 'object' || typeof dados.then === 'function') throw new TypeError();
      return { status: 'confirmada', dados: copiar(dados) };
    } catch (_) {
      return { status: 'indisponivel', dados: null };
    }
  }

  function saldoGeral(ledger, companyId) {
    const indisponivel = { status: 'indisponivel', escopo: 'empresa', periodo: 'atual', totalCentavos: null, contas: [] };
    if (typeof companyId !== 'string' || !companyId.trim() || !ledger || !['confirmado', 'confirmada'].includes(ledger.status)) return indisponivel;
    const e = ledger.estado;
    if (!e || e.company_id !== companyId || !Array.isArray(e.contas)) return indisponivel;
    if (!e.contas.length) return { ...indisponivel, status: 'sem_abertura' };
    if (!Number.isSafeInteger(e.total_centavos) || e.contas.some(c => !c || !Number.isSafeInteger(c.saldo_centavos))) return indisponivel;
    const total = soma(e.contas.map(c => c.saldo_centavos));
    if (total == null || total !== e.total_centavos) return indisponivel;
    return {
      status: 'confirmada', escopo: 'empresa', periodo: 'atual', totalCentavos: total,
      contas: e.contas.map(c => ({ id: c.id, codigo: c.codigo, nome: c.nome, saldoCentavos: c.saldo_centavos }))
    };
  }

  function construir(snapshot, filtro) {
    const entrada = snapshot || {};
    const s = { ...entrada, companyId: empresa(entrada) };
    const f = normalizarFiltro(filtro);
    const fs = fontes(s);
    const internas = new Set((Array.isArray(s.obrasInternas) ? s.obrasInternas : (Array.isArray(s.OBRAS_INTERNAS) ? s.OBRAS_INTERNAS : [])).map(String));
    const selecionadas = fs.obras.rows && fs.obras.rows.filter(o => obraReal(o, internas) &&
      (!f.obraId || String(o.id) === f.obraId) &&
      (f.situacao === 'todas' || (f.situacao === 'arquivadas' ? !!o.arquivada : !o.arquivada)));
    const obras = (selecionadas || []).map(o => {
      const id = String(o.id);
      const reps = fs.repasses.rows && fs.repasses.rows.filter(r => String(r.obra_id) === id);
      const lancs = fs.lancamentos.rows && fs.lancamentos.rows.filter(l => String(l.obra_id) === id);
      // Mesma elegibilidade do helper global: pendentes/cancelados nao compoem carteira.
      const adds = fs.adicionais.rows && fs.adicionais.rows.filter(a => String(a.obra_id) === id &&
        a.status !== 'pendente' && a.status !== 'cancelado');
      const idsAdds = adds && new Set(adds.map(a => String(a.id)));
      const pgtos = idsAdds && fs.pagamentosAdicionais.rows &&
        fs.pagamentosAdicionais.rows.filter(p => idsAdds.has(String(p.adicional_id)));
      const contrato = posicao(centavos(o.valor_venda), sumRows(reps, 'valor', '', 'data_credito'));
      const adicionais = (adds || []).map(a => ({
        id: a.id,
        ...posicao(centavos(a.valor), sumRows(pgtos && pgtos.filter(p => String(p.adicional_id) === String(a.id)), 'valor', '', 'data'))
      }));
      const adicionaisPrevistos = adds ? soma(adicionais.map(a => a.previstoCentavos)) : null;
      const adicionaisRecebidos = sumRows(pgtos, 'valor', '', 'data');
      const recebidoPeriodo = soma([
        sumRows(reps, 'valor', f.periodo, 'data_credito'),
        sumRows(pgtos, 'valor', f.periodo, 'data')
      ]);
      const custoPeriodo = sumRows(lancs, 'total', f.periodo, 'data');
      const linha = {
        id: o.id, nome: o.nome, arquivada: !!o.arquivada, contrato, adicionais,
        contratoPrevistoCentavos: contrato.previstoCentavos,
        contratoRecebidoCentavos: contrato.recebidoCentavos,
        adicionaisPrevistosCentavos: adicionaisPrevistos,
        adicionaisRecebidosCentavos: adicionaisRecebidos,
        carteiraCentavos: soma([contrato.previstoCentavos, adicionaisPrevistos]),
        recebidoAcumuladoCentavos: soma([contrato.recebidoCentavos, adicionaisRecebidos]),
        recebidoPeriodoCentavos: recebidoPeriodo,
        custoPeriodoCentavos: custoPeriodo,
        diferencaRecebidoCustoCentavos: diferenca(recebidoPeriodo, custoPeriodo),
        pendenteContratoCentavos: contrato.pendenteCentavos,
        excedenteContratoCentavos: contrato.excedenteCentavos,
        pendenteAdicionaisCentavos: adds && pgtos ? soma(adicionais.map(a => a.pendenteCentavos)) : null,
        excedenteAdicionaisCentavos: adds && pgtos ? soma(adicionais.map(a => a.excedenteCentavos)) : null,
        dre: consultaDre(s.dre, 'calcGerencialPorObra', [o.id, f.periodo])
      };
      linha.status = CAMPOS.every(c => linha[c] != null) ? 'confirmada' : 'parcial';
      return linha;
    });
    const totais = Object.fromEntries(CAMPOS.map(c => [c, selecionadas ? soma(obras.map(o => o[c])) : null]));
    // Com selecao vazia, uma fonte ausente continua desconhecida, nao vira zero.
    if (selecionadas && !obras.length) {
      if (fs.repasses.status !== 'confirmada') for (const c of ['contratoRecebidoCentavos', 'recebidoAcumuladoCentavos', 'recebidoPeriodoCentavos', 'diferencaRecebidoCustoCentavos', 'pendenteContratoCentavos', 'excedenteContratoCentavos']) totais[c] = null;
      if (fs.adicionais.status !== 'confirmada' || fs.pagamentosAdicionais.status !== 'confirmada') {
        for (const c of CAMPOS.filter(c => /adicionais|Adicionais|carteira|recebidoAcumulado|recebidoPeriodo|diferenca/.test(c))) totais[c] = null;
      }
      if (fs.lancamentos.status !== 'confirmada') for (const c of ['custoPeriodoCentavos', 'diferencaRecebidoCustoCentavos']) totais[c] = null;
    }
    const publicFontes = Object.fromEntries(FONTES.map(nome => [nome, { status: fs[nome].status, quantidade: fs[nome].quantidade }]));
    const status = !selecionadas ? 'indisponivel' : CAMPOS.every(c => totais[c] != null) ? 'confirmada' : 'parcial';
    return {
      filtro: f, companyId: s.companyId || null, status, fontes: publicFontes,
      escopos: {
        carteira: 'obras_selecionadas_acumulado', recebiveis: 'obras_selecionadas_acumulado',
        movimentos: f.periodo || 'acumulado', dreEmpresa: 'empresa_no_periodo', saldo: 'empresa_atual_sem_rateio'
      },
      meses: mesesDisponiveis(s), obras, totais,
      dre: {
        empresa: consultaDre(s.companyId ? s.dre : null, 'calcGerencialConsolidado', [f.periodo]),
        overhead: consultaDre(s.companyId ? s.dre : null, 'calcGerencialOverhead', [f.periodo])
      },
      saldo: saldoGeral(s.ledger, s.companyId)
    };
  }

  return Object.freeze({ normalizarFiltro, mesesDisponiveis, construir, saldoGeral, centavos });
});
