/* ═══════════════════════════════════════════════════════════════════════════
   EDR — Simulador de Financiamento · MOTOR PURO (núcleo determinístico)
   ───────────────────────────────────────────────────────────────────────────
   CONTRATO DO NÚCLEO — não violar sem revisar a spec:

   1. Toda moeda é BigInt em CENTAVOS. Nunca float, nunca reais.
   2. Toda taxa é BigInt em PARTES POR BILHÃO (ppb). 1% a.m. = 10_000_000n.
   3. PROIBIDO no núcleo: Math.round(), Math.pow(), toFixed(), new Date(iso),
      parseFloat(). O motor não conhece taxa anual.
      Number()/inteiro nativo é admitido APENAS como contador de meses:
      prazo, índice de parcela, sequência de evento e aritmética de calendário
      (ver exigirInteiro, que garante o tipo). O limite superior explícito de
      480 meses é aplicado na validação do extrato, em edr-v2-simulador.js.
      JAMAIS para moeda, taxa ou saldo: nesses três o tipo é BigInt e qualquer
      conversão é defeito.
   4. Juros = divisão inteira half-up de (saldo × taxa_ppb) por 1e9.
   5. Price = busca binária do menor pagamento inteiro em centavos que
      quita o saldo em até n parcelas. A fórmula fechada NÃO é usada.
   6. Datas são {ano, mes, dia} inteiros. Nenhum objeto Date no cálculo.

   Conversão de taxa anual→mensal NÃO pertence a este arquivo.
   Ver edr-v2-simulador-taxa.js (adaptador, fora do núcleo determinístico).
   ═══════════════════════════════════════════════════════════════════════════ */

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SimuladorCalc = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const PPB = 1000000000n;
  const MOTOR_VERSAO = 'motor-1.0.0';

  // ── ERROS TIPADOS ─────────────────────────────────────────────────────────
  class ErroSimulador extends Error {
    constructor(codigo, mensagem, detalhe) {
      super(mensagem);
      this.name = 'ErroSimulador';
      this.codigo = codigo;
      this.detalhe = detalhe || null;
    }
  }
  const ERR = {
    SALDO_INVALIDO:      'SALDO_INVALIDO',
    PRAZO_INVALIDO:      'PRAZO_INVALIDO',
    TAXA_INVALIDA:       'TAXA_INVALIDA',
    SISTEMA_INVALIDO:    'SISTEMA_INVALIDO',
    TIPO_INVALIDO:       'TIPO_INVALIDO',
    PARCELA_NAO_COBRE:   'PARCELA_NAO_COBRE_JUROS',
    AMORT_INVALIDA:      'AMORTIZACAO_INVALIDA',
    AMORT_EXCEDE_SALDO:  'AMORTIZACAO_EXCEDE_SALDO',
    AMORT_FORA_PRAZO:    'AMORTIZACAO_FORA_DO_PRAZO',
    MODALIDADE_INVALIDA: 'MODALIDADE_INVALIDA',
    DATA_INVALIDA:       'DATA_INVALIDA',
    NAO_CONVERGIU:       'NAO_CONVERGIU',
    // Auditoria 2026-08-03 — regras temporais e determinismo de eventos.
    SEQUENCIA_INVALIDA:  'SEQUENCIA_INVALIDA',
    SEQUENCIA_DUPLICADA: 'SEQUENCIA_DUPLICADA',
    EVENTO_ANTES_BASE:   'EVENTO_ANTES_DA_BASE'
  };

  // ── GUARDAS DE TIPO ───────────────────────────────────────────────────────
  // O núcleo recusa Number silenciosamente convertido. Entrada errada = erro.
  function exigirBigInt(valor, nome) {
    if (typeof valor !== 'bigint') {
      throw new ErroSimulador(ERR.TIPO_INVALIDO,
        `${nome} deve ser BigInt (centavos ou ppb), recebido ${typeof valor}`,
        { nome, tipo: typeof valor });
    }
    return valor;
  }
  function exigirInteiro(valor, nome) {
    if (typeof valor !== 'number' || !Number.isInteger(valor)) {
      throw new ErroSimulador(ERR.TIPO_INVALIDO,
        `${nome} deve ser inteiro, recebido ${typeof valor}`, { nome });
    }
    return valor;
  }

  // ── JUROS: divisão inteira half-up ────────────────────────────────────────
  // juros = round_half_up(saldo * taxa_ppb / 1e9)
  // Half-up: resto*2 >= divisor arredonda para cima. Determinístico.
  function calcularJuros(saldoCent, taxaPpb) {
    exigirBigInt(saldoCent, 'saldoCent');
    exigirBigInt(taxaPpb, 'taxaPpb');
    if (saldoCent < 0n) throw new ErroSimulador(ERR.SALDO_INVALIDO, 'saldo negativo');
    if (taxaPpb < 0n)   throw new ErroSimulador(ERR.TAXA_INVALIDA, 'taxa negativa');
    if (taxaPpb === 0n || saldoCent === 0n) return 0n;
    const produto = saldoCent * taxaPpb;
    const quociente = produto / PPB;
    const resto = produto % PPB;
    return (resto * 2n >= PPB) ? quociente + 1n : quociente;
  }

  // ── PRICE: busca binária ──────────────────────────────────────────────────
  // Menor pagamento inteiro em centavos que quita saldo em <= n parcelas,
  // simulando com a MESMA rotina de juros do motor.
  function _quitaEmAte(saldo0, taxaPpb, n, pagamento) {
    let sd = saldo0;
    for (let k = 0; k < n; k++) {
      const j = calcularJuros(sd, taxaPpb);
      let a = pagamento - j;
      if (a <= 0n) return false;          // não cobre juros: nunca quita
      if (a > sd) a = sd;
      sd -= a;
      if (sd === 0n) return true;
    }
    return sd === 0n;
  }

  function parcelaPrice(saldo0, taxaPpb, n) {
    exigirBigInt(saldo0, 'saldo0');
    exigirBigInt(taxaPpb, 'taxaPpb');
    exigirInteiro(n, 'n');
    if (saldo0 <= 0n) throw new ErroSimulador(ERR.SALDO_INVALIDO, 'saldo deve ser > 0');
    if (n < 1)        throw new ErroSimulador(ERR.PRAZO_INVALIDO, 'prazo deve ser >= 1');

    if (taxaPpb === 0n) {
      // Sem juros: divisão exata com resto na última parcela.
      const base = saldo0 / BigInt(n);
      return (saldo0 % BigInt(n) === 0n) ? base : base + 1n;
    }

    let lo = 1n;
    let hi = saldo0 + calcularJuros(saldo0, taxaPpb);   // teto: quita em 1 parcela
    if (!_quitaEmAte(saldo0, taxaPpb, n, hi)) {
      throw new ErroSimulador(ERR.NAO_CONVERGIU,
        'nenhum pagamento quita no prazo informado', { n });
    }
    while (lo < hi) {
      const mid = (lo + hi) / 2n;                        // divisão inteira
      if (_quitaEmAte(saldo0, taxaPpb, n, mid)) hi = mid;
      else lo = mid + 1n;
    }
    return lo;
  }

  // ── DATAS: sem timezone, sem objeto Date ──────────────────────────────────
  // Formato interno: {ano, mes, dia} inteiros. mes 1..12.
  function parseDataISO(iso) {
    if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      throw new ErroSimulador(ERR.DATA_INVALIDA, 'data deve ser YYYY-MM-DD', { iso });
    }
    const p = iso.split('-');
    const ano = parseInt(p[0], 10), mes = parseInt(p[1], 10), dia = parseInt(p[2], 10);
    if (mes < 1 || mes > 12) throw new ErroSimulador(ERR.DATA_INVALIDA, 'mês inválido', { iso });
    if (dia < 1 || dia > diasNoMes(ano, mes)) {
      throw new ErroSimulador(ERR.DATA_INVALIDA, 'dia inválido para o mês', { iso });
    }
    return { ano, mes, dia };
  }
  function bissexto(ano) {
    return (ano % 4 === 0 && ano % 100 !== 0) || (ano % 400 === 0);
  }
  function diasNoMes(ano, mes) {
    const t = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return (mes === 2 && bissexto(ano)) ? 29 : t[mes - 1];
  }
  // Soma meses preservando o último dia válido (31/01 + 1 mês = 28 ou 29/02).
  function somarMeses(data, meses) {
    exigirInteiro(meses, 'meses');
    const totalMes = (data.ano * 12 + (data.mes - 1)) + meses;
    const ano = Math.floor(totalMes / 12);
    const mes = (totalMes % 12) + 1;
    const maxDia = diasNoMes(ano, mes);
    return { ano, mes, dia: data.dia > maxDia ? maxDia : data.dia };
  }
  function formatarDataISO(d) {
    const mm = d.mes < 10 ? '0' + d.mes : '' + d.mes;
    const dd = d.dia < 10 ? '0' + d.dia : '' + d.dia;
    return d.ano + '-' + mm + '-' + dd;
  }
  function compararData(a, b) {
    if (a.ano !== b.ano) return a.ano < b.ano ? -1 : 1;
    if (a.mes !== b.mes) return a.mes < b.mes ? -1 : 1;
    if (a.dia !== b.dia) return a.dia < b.dia ? -1 : 1;
    return 0;
  }

  // ── TABELA BASE (sem amortização extraordinária) ──────────────────────────
  // Retorna linhas com valores monetários reais. Última parcela absorve resíduo.
  function gerarTabela(params) {
    const saldo0   = exigirBigInt(params.saldoCent, 'saldoCent');
    const taxaPpb  = exigirBigInt(params.taxaMensalPpb, 'taxaMensalPpb');
    const n        = exigirInteiro(params.prazoMeses, 'prazoMeses');
    const sistema  = params.sistema;
    const dataIni  = parseDataISO(params.dataPrimeiraParcela);

    if (saldo0 <= 0n) throw new ErroSimulador(ERR.SALDO_INVALIDO, 'saldo deve ser > 0');
    if (n < 1)        throw new ErroSimulador(ERR.PRAZO_INVALIDO, 'prazo deve ser >= 1');
    if (sistema !== 'SAC' && sistema !== 'PRICE') {
      throw new ErroSimulador(ERR.SISTEMA_INVALIDO, 'sistema deve ser SAC ou PRICE', { sistema });
    }

    const linhas = [];
    let sd = saldo0;
    let totalPago = 0n, totalJuros = 0n;

    // SAC: amortização constante. PRICE: pagamento constante.
    const amortSac = (sistema === 'SAC') ? saldo0 / BigInt(n) : 0n;
    const pgtoPrice = (sistema === 'PRICE') ? parcelaPrice(saldo0, taxaPpb, n) : 0n;

    for (let k = 1; k <= n; k++) {
      const juros = calcularJuros(sd, taxaPpb);
      let amort, parcela;

      if (k === n) {
        // Última: quita o saldo remanescente. Resíduo absorvido aqui.
        amort = sd;
        parcela = amort + juros;
      } else if (sistema === 'SAC') {
        amort = amortSac;
        if (amort > sd) amort = sd;
        parcela = amort + juros;
      } else {
        parcela = pgtoPrice;
        amort = parcela - juros;
        if (amort <= 0n) {
          throw new ErroSimulador(ERR.PARCELA_NAO_COBRE,
            'parcela não cobre os juros do período', { parcela: k });
        }
        if (amort > sd) { amort = sd; parcela = amort + juros; }
      }

      sd -= amort;
      totalPago += parcela;
      totalJuros += juros;

      linhas.push({
        numero: k,
        vencimento: formatarDataISO(somarMeses(dataIni, k - 1)),
        parcelaCent: parcela,
        jurosCent: juros,
        amortizacaoCent: amort,
        saldoCent: sd,
        eventoAmortizacao: null
      });

      if (sd === 0n && k < n) break;   // quitado antes do prazo
    }

    return {
      motorVersao: MOTOR_VERSAO,
      sistema, taxaMensalPpb: taxaPpb,
      prazoContratado: n,
      prazoEfetivo: linhas.length,
      principalCent: saldo0,
      totalPagoCent: totalPago,
      totalJurosCent: totalJuros,
      saldoFinalCent: sd,
      linhas
    };
  }

  // ── AMORTIZAÇÃO EXTRAORDINÁRIA ────────────────────────────────────────────
  // Ordena eventos por (data_aplicacao, sequencia) e reprocessa a tabela.
  // Cada evento carrega sua própria modalidade: reduzir_prazo | reduzir_prestacao.
  const MODALIDADES = ['reduzir_prazo', 'reduzir_prestacao'];

  // `dataBaseISO` (opcional): piso temporal. Evento anterior a ele é rejeitado,
  // para que um lançamento retroativo nunca seja aplicado em silêncio depois da
  // primeira parcela. Ausente = sem piso (compatibilidade com chamadas antigas).
  function _ordenarEventos(eventos, dataBaseISO) {
    const dataBase = (dataBaseISO != null) ? parseDataISO(dataBaseISO) : null;
    const vistos = new Set();

    return eventos
      .map((e, i) => {
        if (!MODALIDADES.includes(e.modalidade)) {
          throw new ErroSimulador(ERR.MODALIDADE_INVALIDA,
            'modalidade deve ser reduzir_prazo ou reduzir_prestacao',
            { modalidade: e.modalidade, indice: i });
        }
        exigirBigInt(e.valorCent, `evento[${i}].valorCent`);
        if (e.valorCent <= 0n) {
          throw new ErroSimulador(ERR.AMORT_INVALIDA, 'valor deve ser > 0', { indice: i });
        }

        const data = parseDataISO(e.dataAplicacao);
        const sequencia = exigirInteiro(e.sequencia, `evento[${i}].sequencia`);

        if (sequencia < 0) {
          throw new ErroSimulador(ERR.SEQUENCIA_INVALIDA,
            'sequência deve ser inteiro >= 0', { indice: i, sequencia });
        }
        if (dataBase && compararData(data, dataBase) < 0) {
          throw new ErroSimulador(ERR.EVENTO_ANTES_BASE,
            'evento anterior à data-base do cálculo',
            { indice: i, dataAplicacao: e.dataAplicacao, dataBase: dataBaseISO });
        }
        // (data, sequencia) precisa ser único: sem isso, inverter dois eventos
        // ambíguos produziria dois resultados válidos diferentes.
        const chave = e.dataAplicacao + '#' + sequencia;
        if (vistos.has(chave)) {
          throw new ErroSimulador(ERR.SEQUENCIA_DUPLICADA,
            'dois eventos com a mesma data e a mesma sequência',
            { indice: i, dataAplicacao: e.dataAplicacao, sequencia });
        }
        vistos.add(chave);

        return {
          data,
          dataISO: e.dataAplicacao,
          sequencia,
          valorCent: e.valorCent,
          modalidade: e.modalidade,
          id: e.id != null ? e.id : null
        };
      })
      .sort((a, b) => {
        const c = compararData(a.data, b.data);
        return c !== 0 ? c : a.sequencia - b.sequencia;
      });
  }

  /* Aplica UM evento de amortização sobre o estado corrente e devolve o estado
     novo + o snapshot. Extraído para ser usado nas DUAS fases do cálculo:

       fase 'data_base' — evento na data de corte, ANTES de qualquer parcela
       fase 'parcela'   — evento posterior, após a parcela do mês

     Auditoria 2026-08-03: antes desta extração a lógica existia só dentro do
     laço, então TODO evento — inclusive o da data de corte — incidia sobre um
     saldo já reduzido pela prestação do mês. Ver §Regra temporal na spec.

     `st` = { sd, prazoRestante, amortSac, pgtoPrice, totalAmortExtra }. */
  function _aplicarEvento(ev, st, ctx) {
    const { taxaPpb, sistema } = ctx;

    if (st.sd === 0n) {
      throw new ErroSimulador(ERR.AMORT_EXCEDE_SALDO,
        'amortização após quitação do saldo', { evento: ev.id, data: ev.dataISO });
    }
    if (ev.valorCent > st.sd) {
      throw new ErroSimulador(ERR.AMORT_EXCEDE_SALDO,
        'valor da amortização excede o saldo devedor',
        { evento: ev.id, valorCent: ev.valorCent.toString(), saldoCent: st.sd.toString() });
    }

    const saldoAntes = st.sd;
    const prazoAntes = st.prazoRestante;
    const parcelaAntes = (sistema === 'PRICE')
      ? st.pgtoPrice
      : st.amortSac + calcularJuros(st.sd, taxaPpb);

    st.sd -= ev.valorCent;
    st.totalAmortExtra += ev.valorCent;

    let prazoDepois = st.prazoRestante;
    let parcelaDepois = parcelaAntes;

    if (st.sd === 0n) {
      // Quitação integral: encerra, independente da modalidade.
      st.prazoRestante = 0; prazoDepois = 0; parcelaDepois = 0n;
    } else if (ev.modalidade === 'reduzir_prestacao') {
      // Prazo preservado, recalcula pagamento.
      if (st.prazoRestante < 1) {
        throw new ErroSimulador(ERR.AMORT_FORA_PRAZO,
          'sem prazo remanescente para recalcular prestação', { evento: ev.id });
      }
      if (sistema === 'SAC') {
        st.amortSac = st.sd / BigInt(st.prazoRestante);
        if (st.amortSac === 0n) st.amortSac = 1n;
        parcelaDepois = st.amortSac + calcularJuros(st.sd, taxaPpb);
      } else {
        st.pgtoPrice = parcelaPrice(st.sd, taxaPpb, st.prazoRestante);
        parcelaDepois = st.pgtoPrice;
      }
      prazoDepois = st.prazoRestante;
    } else {
      // reduzir_prazo: pagamento preservado, recalcula prazo por simulação.
      // Ramificações obrigatórias antes de qualquer log:
      //   1. saldo == 0  -> tratado acima
      //   2. taxa == 0   -> divisão inteira
      //   3. parcela <= juros -> erro
      let novoPrazo;
      if (sistema === 'SAC') {
        if (st.amortSac <= 0n) {
          throw new ErroSimulador(ERR.PARCELA_NAO_COBRE, 'amortização SAC nula',
            { evento: ev.id });
        }
        novoPrazo = Number(st.sd / st.amortSac) + (st.sd % st.amortSac === 0n ? 0 : 1);
      } else {
        if (taxaPpb === 0n) {
          novoPrazo = Number(st.sd / st.pgtoPrice) + (st.sd % st.pgtoPrice === 0n ? 0 : 1);
        } else {
          const jurosAtual = calcularJuros(st.sd, taxaPpb);
          if (st.pgtoPrice <= jurosAtual) {
            throw new ErroSimulador(ERR.PARCELA_NAO_COBRE,
              'pagamento não cobre os juros após amortização',
              { evento: ev.id, pagamento: st.pgtoPrice.toString(), juros: jurosAtual.toString() });
          }
          // Simulação direta (sem log): conta parcelas até quitar.
          let s = st.sd, cont = 0;
          while (s > 0n && cont < 1000) {
            const j = calcularJuros(s, taxaPpb);
            let a = st.pgtoPrice - j;
            if (a > s) a = s;
            s -= a; cont++;
          }
          if (s > 0n) {
            throw new ErroSimulador(ERR.NAO_CONVERGIU,
              'não quita em 1000 parcelas após amortização', { evento: ev.id });
          }
          novoPrazo = cont;
        }
      }
      st.prazoRestante = novoPrazo;
      prazoDepois = novoPrazo;
      parcelaDepois = parcelaAntes;
    }

    return {
      eventoId: ev.id,
      dataAplicacao: ev.dataISO,
      sequencia: ev.sequencia,
      modalidade: ev.modalidade,
      fase: ctx.fase,
      parcelaReferencia: ctx.parcelaReferencia,
      valorCent: ev.valorCent,
      saldoAntesCent: saldoAntes,
      saldoDepoisCent: st.sd,
      prazoAntes, prazoDepois,
      parcelaAntesCent: parcelaAntes,
      parcelaDepoisCent: parcelaDepois
    };
  }

  function simular(params) {
    const eventos = Array.isArray(params.amortizacoes) ? params.amortizacoes : [];
    if (eventos.length === 0) return gerarTabela(params);

    const saldo0  = exigirBigInt(params.saldoCent, 'saldoCent');
    const taxaPpb = exigirBigInt(params.taxaMensalPpb, 'taxaMensalPpb');
    const nContratado = exigirInteiro(params.prazoMeses, 'prazoMeses');
    const sistema = params.sistema;
    const dataIni = parseDataISO(params.dataPrimeiraParcela);

    if (sistema !== 'SAC' && sistema !== 'PRICE') {
      throw new ErroSimulador(ERR.SISTEMA_INVALIDO, 'sistema deve ser SAC ou PRICE', { sistema });
    }

    const ordenados = _ordenarEventos(eventos, params.dataBase);
    const linhas = [];
    const snapshots = [];

    let sd = saldo0;
    let prazoRestante = nContratado;
    let totalPago = 0n, totalJuros = 0n, totalAmortExtra = 0n;
    let amortSac = (sistema === 'SAC') ? saldo0 / BigInt(nContratado) : 0n;
    let pgtoPrice = (sistema === 'PRICE') ? parcelaPrice(saldo0, taxaPpb, nContratado) : 0n;

    let idxEvento = 0;
    let k = 0;

    // ── FASE 1: eventos NA DATA-BASE, antes de qualquer parcela ─────────────
    // O saldo da data de corte é a posição do extrato. Amortizar nela precisa
    // incidir sobre esse saldo intocado — e os juros da 1ª parcela passam a ser
    // calculados sobre o saldo JÁ amortizado.
    if (params.dataBase != null) {
      const dataBase = parseDataISO(params.dataBase);
      const st = { sd, prazoRestante, amortSac, pgtoPrice, totalAmortExtra };

      while (idxEvento < ordenados.length &&
             compararData(ordenados[idxEvento].data, dataBase) === 0) {
        snapshots.push(_aplicarEvento(ordenados[idxEvento], st,
          { taxaPpb, sistema, fase: 'data_base', parcelaReferencia: 0 }));
        idxEvento++;
      }

      sd = st.sd;
      prazoRestante = st.prazoRestante;
      amortSac = st.amortSac;
      pgtoPrice = st.pgtoPrice;
      totalAmortExtra = st.totalAmortExtra;
    }

    // ── FASE 2: parcelas, com eventos posteriores aplicados após cada uma ───
    while (sd > 0n && prazoRestante > 0) {
      k++;
      if (k > 1000) throw new ErroSimulador(ERR.NAO_CONVERGIU, 'excedeu 1000 parcelas', { k });

      const venc = somarMeses(dataIni, k - 1);
      const juros = calcularJuros(sd, taxaPpb);
      const ehUltima = (prazoRestante === 1);

      let amort, parcela;
      if (ehUltima) {
        amort = sd; parcela = amort + juros;
      } else if (sistema === 'SAC') {
        amort = amortSac > sd ? sd : amortSac;
        parcela = amort + juros;
      } else {
        parcela = pgtoPrice;
        amort = parcela - juros;
        if (amort <= 0n) {
          throw new ErroSimulador(ERR.PARCELA_NAO_COBRE,
            'parcela não cobre os juros do período', { parcela: k });
        }
        if (amort > sd) { amort = sd; parcela = amort + juros; }
      }

      sd -= amort;
      prazoRestante--;
      totalPago += parcela;
      totalJuros += juros;

      const linha = {
        numero: k,
        vencimento: formatarDataISO(venc),
        parcelaCent: parcela,
        jurosCent: juros,
        amortizacaoCent: amort,
        saldoCent: sd,
        eventoAmortizacao: null
      };

      // Eventos POSTERIORES à data-base aplicam-se APÓS a parcela do mês.
      // Os da própria data-base já foram tratados na fase 1, antes do laço.
      const aplicados = [];
      {
        const st = { sd, prazoRestante, amortSac, pgtoPrice, totalAmortExtra };
        while (idxEvento < ordenados.length &&
               compararData(ordenados[idxEvento].data, venc) <= 0) {
          const snap = _aplicarEvento(ordenados[idxEvento], st,
            { taxaPpb, sistema, fase: 'parcela', parcelaReferencia: k });
          snapshots.push(snap);
          aplicados.push(snap);
          idxEvento++;
        }
        sd = st.sd;
        prazoRestante = st.prazoRestante;
        amortSac = st.amortSac;
        pgtoPrice = st.pgtoPrice;
        totalAmortExtra = st.totalAmortExtra;
      }

      if (aplicados.length > 0) linha.eventoAmortizacao = aplicados;
      linhas.push(linha);
    }

    if (idxEvento < ordenados.length) {
      const ev = ordenados[idxEvento];
      throw new ErroSimulador(ERR.AMORT_FORA_PRAZO,
        'amortização com data posterior ao fim do financiamento',
        { evento: ev.id, data: ev.dataISO });
    }

    return {
      motorVersao: MOTOR_VERSAO,
      sistema, taxaMensalPpb: taxaPpb,
      prazoContratado: nContratado,
      prazoEfetivo: linhas.length,
      principalCent: saldo0,
      totalPagoCent: totalPago,
      totalJurosCent: totalJuros,
      totalAmortExtraCent: totalAmortExtra,
      saldoFinalCent: sd,
      linhas,
      snapshots
    };
  }

  // ── FORMATAÇÃO (fronteira de saída — não faz parte do cálculo) ────────────
  function centavosParaTexto(cent) {
    exigirBigInt(cent, 'cent');
    const neg = cent < 0n;
    const abs = neg ? -cent : cent;
    const int = abs / 100n;
    const frac = abs % 100n;
    const fracTxt = frac < 10n ? '0' + frac.toString() : frac.toString();
    let intTxt = int.toString();
    let out = '';
    while (intTxt.length > 3) {
      out = '.' + intTxt.slice(-3) + out;
      intTxt = intTxt.slice(0, -3);
    }
    return (neg ? '-' : '') + intTxt + out + ',' + fracTxt;
  }

  return {
    MOTOR_VERSAO, PPB, ERR, ErroSimulador, MODALIDADES,
    calcularJuros, parcelaPrice, gerarTabela, simular,
    parseDataISO, somarMeses, formatarDataISO, compararData, diasNoMes, bissexto,
    centavosParaTexto
  };
});
