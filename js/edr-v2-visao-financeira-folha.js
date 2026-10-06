/*
 * Avisos de folha somente leitura, sem DOM, rede, recalculo ou soma de custos.
 * API: FinanceiroVisaoFolha.avaliar(snapshot, filtro).
 * snapshot: companyId/company_id, obras, quinzenas, diarias, extras,
 * lancamentos (incluindo obs), fontes e obrasInternas/OBRAS_INTERNAS opcional.
 * Arrays explicitos sem declaracao de fonte sao confirmados pelo chamador.
 * filtro: { periodo: ''|'YYYY-MM', obraId: '', situacao: 'ativas'|'arquivadas'|'todas' }.
 *
 * cobertura refere-se a fontes e vinculos consultados, nunca a todos os dias.
 * estado "sem_pendencia_identificada" nao declara folha completa ou paga.
 * Um motivo nao_avaliado prevalece sobre pendencias: as pendencias conhecidas
 * continuam nos motivos, mas uma leitura incompleta nao recebe conclusao positiva.
 * Quinzenas intersectam o mes; competencia FP permanece data_fim, sem rateio.
 * Extras pertencem ao contexto da quinzena e nao recebem data inventada.
 * FP e evidencia por obra_id + etapa 28_mao + obs canonica exata (trim):
 * Folha quinzenal · UUID. UUID em texto arbitrario nao confirma FP.
 * Nenhum valor de diaria, extra ou FP e somado ou adicionado novamente a DRE.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FinanceiroVisaoFolha = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const FONTES = ['obras', 'quinzenas', 'diarias', 'extras', 'lancamentos'];
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const TEXTOS = {
    identidade_nao_confirmada: 'A empresa da consulta nao esta confirmada.',
    fonte_nao_confirmada: 'Uma fonte necessaria nao foi confirmada.',
    identidade_registro_divergente: 'A identidade dos registros da fonte nao esta confirmada.',
    identificador_duplicado: 'Ha identificadores repetidos na fonte.',
    obra_selecionada_desconhecida: 'A obra selecionada nao foi identificada na consulta.',
    obra_desconhecida: 'O vinculo do registro com uma obra nao foi identificado.',
    obra_legada_ambigua: 'O nome legado da obra possui mais de uma correspondencia.',
    periodos_invalidos: 'Os periodos do apontamento nao puderam ser avaliados.',
    status_diaria_nao_confirmado: 'O estado persistido da diaria nao esta confirmado.',
    periodo_diaria_invalido: 'O turno ou a fracao do apontamento nao esta confirmado.',
    data_diaria_invalida: 'A data do apontamento nao pertence ao intervalo confirmado da quinzena.',
    quinzena_desconhecida: 'A quinzena do registro nao foi identificada na consulta.',
    datas_quinzena_invalidas: 'O intervalo da quinzena nao esta confirmado.',
    quinzena_excluida: 'O periodo foi excluido; seus registros nao comprovam a situacao atual.',
    estado_quinzena_invalido: 'O estado da quinzena nao esta confirmado.',
    identificador_quinzena_invalido: 'A referencia da quinzena nao possui UUID verificavel para o custo FP.',
    periodo_aberto: 'A quinzena vinculada a obra permanece aberta.',
    obs_fp_nao_consultada: 'A observacao do custo FP nao foi disponibilizada na consulta.',
    referencia_fp_ambigua: 'A observacao FP referencia mais de uma quinzena.',
    marcador_fp_nao_confirmado: 'A referencia da quinzena nao possui a observacao canonica exata de custo FP.',
    custo_fp_nao_identificado: 'Nao foi identificado custo FP para esta obra e quinzena fechada com valor positivo registrado.',
    custo_fp_duplicado: 'Ha mais de um custo FP para esta obra e quinzena.',
    competencia_fp_divergente: 'A data registrada no custo FP difere do fim da quinzena.',
    data_fp_nao_confirmada: 'A data do custo FP nao esta confirmada.',
    valor_registro_nao_confirmado: 'O valor historico do registro nao esta confirmado.',
    fp_ausente_sem_conclusao_valor: 'A ausencia de FP nao comprova custo faltante para registros sem valor positivo.',
    cobertura_dias_nao_verificada: 'Consultar registros nao comprova cobertura operacional de todos os dias.',
    pagamento_nao_verificado: 'Quinzena fechada e custo FP nao comprovam pagamento.',
    extras_sem_data_propria: 'Extras possuem contexto de quinzena; nao ha data propria comprovada.',
    valores_historicos_sem_recalculo: 'Valores historicos persistidos sao preservados, sem recalculo por taxa atual.'
  };

  function normalizarFiltro(f) {
    f = f || {};
    const periodo = f.periodo == null ? '' : String(f.periodo);
    const obraId = f.obraId == null ? '' : String(f.obraId);
    const situacao = f.situacao == null ? 'ativas' : String(f.situacao);
    if (periodo && !/^\d{4}-(0[1-9]|1[0-2])$/.test(periodo)) throw new RangeError('Periodo invalido.');
    if (!['ativas', 'arquivadas', 'todas'].includes(situacao)) throw new RangeError('Situacao invalida.');
    return { periodo, obraId, situacao };
  }
  function objeto(r) { return !!r && typeof r === 'object' && !Array.isArray(r); }
  function dataCivil(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const [a, m, d] = s.split('-').map(Number);
    return m >= 1 && m <= 12 && d >= 1 && d <= diasMes(a, m);
  }
  function diasMes(a, m) {
    return [31, a % 4 === 0 && (a % 100 !== 0 || a % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  }
  function intervalo(f) {
    if (!f.periodo) return null;
    const [a, m] = f.periodo.split('-').map(Number);
    return { inicio: f.periodo + '-01', fim: f.periodo + '-' + diasMes(a, m) };
  }
  function id(v) { return v == null ? '' : String(v); }
  // Correspondencia exata normalizada, sem busca aproximada ou substring.
  function nome(v) { return String(v == null ? '' : v).trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR'); }
  function motivo(codigo, severidade, contexto) {
    return Object.assign({ codigo, severidade, texto: TEXTOS[codigo] }, contexto || {});
  }
  function adicionar(lista, m) {
    const chave = JSON.stringify([m.codigo, m.fonte, m.obraId, m.quinzenaId, m.registroId]);
    if (!lista.some(x => JSON.stringify([x.codigo, x.fonte, x.obraId, x.quinzenaId, x.registroId]) === chave)) lista.push(m);
  }
  function concluir(motivos, fonteConfirmada) {
    const desconhecido = motivos.some(m => m.severidade === 'nao_avaliado');
    return {
      cobertura: desconhecido ? (fonteConfirmada ? 'parcial' : 'indisponivel') : 'confirmada',
      estado: desconhecido ? 'nao_avaliado' : motivos.some(m => m.severidade === 'pendencia')
        ? 'pendencia_identificada' : 'sem_pendencia_identificada'
    };
  }
  function positivo(v) {
    if (typeof v !== 'number' && typeof v !== 'string') return null;
    const s = String(v).trim();
    if (!/^-?\d+(\.\d+)?$/.test(s) || (typeof v === 'number' && !Number.isFinite(v))) return null;
    return !s.startsWith('-') && /[1-9]/.test(s);
  }
  function avaliar(snapshot, filtro) {
    const s = objeto(snapshot) ? snapshot : {};
    const f = normalizarFiltro(filtro);
    const mes = intervalo(f);
    const company = s.companyId || s.company_id;
    const companyId = typeof company === 'string' && company.trim() ? company : null;
    const gerais = [];
    const fontes = {};
    const rows = {};
    const limites = ['cobertura_dias_nao_verificada', 'pagamento_nao_verificado', 'valores_historicos_sem_recalculo']
      .map(c => motivo(c, 'limite'));
    const identidadeInvalida = !companyId || (s.companyId && s.company_id && s.companyId !== s.company_id);
    if (identidadeInvalida) {
      gerais.push(motivo('identidade_nao_confirmada', 'nao_avaliado'));
    }
    for (const n of FONTES) {
      const declaracao = s.fontes && s.fontes[n];
      const declarado = objeto(declaracao) ? declaracao.status : declaracao;
      let status = declarado == null ? 'confirmada' : declarado;
      if (!['confirmada', 'parcial', 'indisponivel'].includes(status) ||
          !Array.isArray(s[n]) || s[n].some(r => !objeto(r)) || identidadeInvalida) status = 'indisponivel';
      let data = status === 'confirmada' ? s[n] : null;
      if (data && data.some(r => r.company_id != null && r.company_id !== companyId)) {
        status = 'indisponivel'; data = null;
        gerais.push(motivo('identidade_registro_divergente', 'nao_avaliado', { fonte: n }));
      }
      fontes[n] = { status, quantidade: data ? data.length : null };
      rows[n] = data;
      if (status !== 'confirmada') adicionar(gerais, motivo('fonte_nao_confirmada', 'nao_avaliado', { fonte: n }));
    }
    const fonteConfirmada = FONTES.some(n => fontes[n].status === 'confirmada');
    const conhecidas = new Map();
    const porNome = new Map();
    for (const o of rows.obras || []) {
      if (!id(o.id) || conhecidas.has(id(o.id))) {
        adicionar(gerais, motivo('identificador_duplicado', 'nao_avaliado', { fonte: 'obras' }));
        continue;
      }
      conhecidas.set(id(o.id), o);
      const k = nome(o.nome);
      if (k) porNome.set(k, (porNome.get(k) || []).concat(o));
    }
    const internas = new Set((s.obrasInternas || s.OBRAS_INTERNAS || []).map(v => id(objeto(v) ? v.id : v)));
    const selecionadas = [...conhecidas.values()].filter(o => {
      const n = String(o.nome || '').toUpperCase();
      return !internas.has(id(o.id)) && !/^OBRA QA/.test(n) && !n.includes('ESCRIT') && !n.includes('ALMOX') &&
        (!f.obraId || id(o.id) === f.obraId) &&
        (f.situacao === 'todas' || (f.situacao === 'arquivadas' ? o.arquivada === true : o.arquivada !== true));
    });
    if (f.obraId && rows.obras && !conhecidas.has(f.obraId)) {
      gerais.push(motivo('obra_selecionada_desconhecida', 'nao_avaliado'));
    }
    const saidas = new Map(selecionadas.map(o => [id(o.id), {
      obraId: id(o.id), nome: String(o.nome || ''), arquivada: o.arquivada === true,
      motivos: [], quinzenas: []
    }]));
    const quinzenas = new Map();
    const grupos = new Map();
    const vinculosPorQuinzena = new Map();
    for (const q of rows.quinzenas || []) {
      if (!id(q.id) || quinzenas.has(id(q.id))) {
        adicionar(gerais, motivo('identificador_duplicado', 'nao_avaliado', { fonte: 'quinzenas' }));
        continue;
      }
      quinzenas.set(id(q.id), q);
    }
    function relevante(q) {
      if (!q || !dataCivil(q.data_inicio) || !dataCivil(q.data_fim) || q.data_inicio > q.data_fim) return null;
      return !mes || q.data_inicio <= mes.fim && q.data_fim >= mes.inicio;
    }
    function desconhecido(codigo, fonte, r, obraId) {
      const m = motivo(codigo, 'nao_avaliado', { fonte, registroId: id(r && r.id) || undefined,
        quinzenaId: id(r && r.quinzena_id) || undefined, obraId: obraId || undefined });
      if (obraId && saidas.has(obraId)) adicionar(saidas.get(obraId).motivos, m);
      else adicionar(gerais, m);
    }
    function resolver(p, r, fonte) {
      if (p.obra_id != null && id(p.obra_id)) {
        const oid = id(p.obra_id);
        if (conhecidas.has(oid)) return oid;
        desconhecido('obra_desconhecida', fonte, r); return null;
      }
      const matches = porNome.get(nome(p.obra)) || [];
      if (matches.length === 1) return id(matches[0].id);
      desconhecido(matches.length > 1 ? 'obra_legada_ambigua' : 'obra_desconhecida', fonte, r);
      return null;
    }
    function grupo(oid, q, fonte, r) {
      if (!saidas.has(oid)) return null;
      const k = JSON.stringify([oid, id(q.id)]);
      if (!grupos.has(k)) grupos.set(k, {
        obraId: oid, id: id(q.id), label: String(q.label || ''),
        dataInicio: q.data_inicio, dataFim: q.data_fim, competenciaCusto: q.data_fim,
        competenciaNoPeriodo: !mes || dataCivil(q.data_fim) && q.data_fim.startsWith(f.periodo),
        fontesVinculadas: [], valorPositivoIdentificado: false, motivos: []
      });
      const g = grupos.get(k);
      if (!g.fontesVinculadas.includes(fonte)) g.fontesVinculadas.push(fonte);
      const ctx = { obraId: oid, quinzenaId: id(q.id) };
      if (q.excluida === true) adicionar(g.motivos, motivo('quinzena_excluida', 'nao_avaliado', ctx));
      else if (![true, false, null, undefined].includes(q.fechada) || ![true, false, null, undefined].includes(q.excluida)) {
        adicionar(g.motivos, motivo('estado_quinzena_invalido', 'nao_avaliado', ctx));
      } else if (q.fechada !== true) adicionar(g.motivos, motivo('periodo_aberto', 'pendencia', ctx));
      const v = positivo(r.valor);
      if (v == null) adicionar(g.motivos, motivo('valor_registro_nao_confirmado', 'nao_avaliado',
        Object.assign({ registroId: id(r.id) || undefined, fonte }, ctx)));
      if (v === true) g.valorPositivoIdentificado = true;
      return g;
    }
    function contexto(r, fonte) {
      const q = quinzenas.get(id(r.quinzena_id));
      if (!q) { desconhecido('quinzena_desconhecida', fonte, r); return null; }
      const rel = relevante(q);
      if (rel == null) { desconhecido('datas_quinzena_invalidas', fonte, r); return null; }
      return rel ? q : false;
    }
    for (const r of rows.diarias || []) {
      const q = contexto(r, 'diarias');
      if (!q) continue;
      let ps = r.periodos;
      if (typeof ps === 'string') { try { ps = JSON.parse(ps); } catch (_) { ps = null; } }
      if (!Array.isArray(ps) || ps.some(p => !objeto(p))) { desconhecido('periodos_invalidos', 'diarias', r); continue; }
      if (['falta', 'nao_escalado'].includes(r.status) && !ps.length) continue;
      if (!ps.length) { desconhecido('periodos_invalidos', 'diarias', r); continue; }
      for (const p of ps) {
        const oid = resolver(p, r, 'diarias');
        if (oid) vinculosPorQuinzena.set(id(q.id), true);
        if (!oid || !saidas.has(oid)) continue;
        const g = grupo(oid, q, 'diarias', r);
        const ctx = { fonte: 'diarias', obraId: oid, quinzenaId: id(q.id), registroId: id(r.id) || undefined };
        if (r.status !== 'apontado') adicionar(g.motivos, motivo('status_diaria_nao_confirmado', 'nao_avaliado', ctx));
        const fracaoValida = ['number', 'string'].includes(typeof p.fracao) && /^\d+(\.\d+)?$/.test(String(p.fracao).trim()) && Number(p.fracao) > 0 && Number(p.fracao) <= 1;
        if (!['dia', 'manha', 'tarde'].includes(p.turno) || !fracaoValida) {
          adicionar(g.motivos, motivo('periodo_diaria_invalido', 'nao_avaliado', ctx));
        }
        if (!dataCivil(r.data) || r.data < q.data_inicio || r.data > q.data_fim) {
          adicionar(g.motivos, motivo('data_diaria_invalida', 'nao_avaliado', ctx));
        }
      }
    }
    for (const r of rows.extras || []) {
      const q = contexto(r, 'extras');
      if (!q) continue;
      const oid = resolver({ obra: r.obra }, r, 'extras');
      if (oid) vinculosPorQuinzena.set(id(q.id), true);
      if (!oid || !saidas.has(oid)) continue;
      const g = grupo(oid, q, 'extras', r);
      adicionar(g.motivos, motivo('extras_sem_data_propria', 'limite', { obraId: oid, quinzenaId: id(q.id) }));
    }
    // Mesmo sem apontamentos vinculaveis, exclusao relevante exige cautela.
    for (const q of quinzenas.values()) {
      if (q.excluida === true && relevante(q) !== false &&
          !vinculosPorQuinzena.has(id(q.id))) {
        adicionar(gerais, motivo('quinzena_excluida', 'nao_avaliado', { quinzenaId: id(q.id) }));
      }
    }
    for (const g of grupos.values()) {
      const q = quinzenas.get(g.id);
      const ctx = { obraId: g.obraId, quinzenaId: g.id };
      let candidatos = [];
      if (!UUID.test(g.id)) adicionar(g.motivos, motivo('identificador_quinzena_invalido', 'nao_avaliado', ctx));
      for (const l of rows.lancamentos || []) {
        if (id(l.obra_id) !== g.obraId || l.etapa !== '28_mao') continue;
        if (!Object.prototype.hasOwnProperty.call(l, 'obs')) {
          adicionar(g.motivos, motivo('obs_fp_nao_consultada', 'nao_avaliado', ctx)); continue;
        }
        const tokens = [];
        const texto = typeof l.obs === 'string' ? l.obs : '';
        const uuidToken = /(?:^|[^0-9a-z_-])([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?=$|[^0-9a-z_-])/gi;
        let match;
        while ((match = uuidToken.exec(texto))) tokens.push(match[1].toLowerCase());
        if (!tokens.includes(g.id.toLowerCase())) continue;
        if (new Set(tokens).size !== 1) {
          adicionar(g.motivos, motivo('referencia_fp_ambigua', 'nao_avaliado', ctx)); continue;
        }
        if (texto.trim() !== 'Folha quinzenal · ' + g.id) {
          adicionar(g.motivos, motivo('marcador_fp_nao_confirmado', 'nao_avaliado', ctx)); continue;
        }
        candidatos.push(l);
      }
      const incerta = gerais.some(m => m.severidade === 'nao_avaliado') ||
        saidas.get(g.obraId).motivos.some(m => m.severidade === 'nao_avaliado') ||
        g.motivos.some(m => m.severidade === 'nao_avaliado');
      g.custoFP = { estado: incerta ? 'nao_avaliado' : candidatos.length ? 'identificado' : 'nao_identificado',
        quantidade: incerta ? null : candidatos.length, datasRegistradas: [] };
      if (!incerta) {
        g.custoFP.datasRegistradas = candidatos.map(l => l.data == null ? null : String(l.data));
        if (candidatos.length > 1) {
          g.custoFP.estado = 'duplicado';
          adicionar(g.motivos, motivo('custo_fp_duplicado', 'pendencia', ctx));
        }
        for (const l of candidatos) {
          if (!dataCivil(l.data)) adicionar(g.motivos, motivo('data_fp_nao_confirmada', 'nao_avaliado', ctx));
          else if (l.data !== q.data_fim) adicionar(g.motivos, motivo('competencia_fp_divergente', 'pendencia', ctx));
        }
        if (!candidatos.length && q.fechada === true && g.valorPositivoIdentificado) {
          adicionar(g.motivos, motivo('custo_fp_nao_identificado', 'pendencia', ctx));
        } else if (!candidatos.length && !g.valorPositivoIdentificado) {
          adicionar(g.motivos, motivo('fp_ausente_sem_conclusao_valor', 'limite', ctx));
        }
      }
      const conclusao = concluir(gerais.concat(saidas.get(g.obraId).motivos, g.motivos), fonteConfirmada);
      Object.assign(g, conclusao);
      delete g.valorPositivoIdentificado;
      saidas.get(g.obraId).quinzenas.push(g);
    }
    for (const o of saidas.values()) {
      for (const m of gerais.concat(limites)) adicionar(o.motivos, m);
      for (const g of o.quinzenas) for (const m of g.motivos) adicionar(o.motivos, m);
      Object.assign(o, concluir(o.motivos, fonteConfirmada));
      o.quinzenas.sort((a, b) => String(a.dataInicio).localeCompare(String(b.dataInicio)) || a.id.localeCompare(b.id));
    }
    const motivos = gerais.concat(limites);
    for (const o of saidas.values()) for (const m of o.motivos) adicionar(motivos, m);
    return Object.assign({
      companyId, filtro: f, fontes, escopoCobertura: 'fontes_e_vinculos',
      coberturaDias: 'nao_verificada', comprovaPagamento: false,
      competenciaCusto: 'data_fim_sem_rateio', motivos, obras: [...saidas.values()]
    }, concluir(motivos, fonteConfirmada));
  }
  return Object.freeze({ avaliar });
});
