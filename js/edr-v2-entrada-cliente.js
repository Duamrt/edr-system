/* ═══════════════════════════════════════════════════════════════════════════
   EDR — ENTRADA DO CLIENTE · regra única de saldo
   ───────────────────────────────────────────────────────────────────────────
   Fonte de verdade financeira: `repasses_cef` do tipo 'entrada'.

   PROBLEMA CORRIGIDO (auditoria 2026-08-03):
   `edr-v2-custos.js` calculava `totalEntradaPaga` e NÃO usava no selo — exibia
   sempre o valor contratado inteiro. Com contrato de R$ 14.000 e lançamento de
   R$ 5.000, a tela dizia "Entrada: R$ 14.000 pendente", escondendo o recebido.
   `edr-v2-obras.js` era pior: só lia o booleano `entrada_paga`, sem consultar
   repasse nenhum.

   REGRA (decisão do Duam, 2026-08-03 — o ledger vence):
   - `contrato_entrada` é o original preservado. Plano aprovado define o alvo atual
     por leitura confirmada, sem alterar o contrato original.
   - `recebido`  = soma dos repasses de tipo 'entrada' da obra.
   - `pendente`  = max(alvo aprovado ou original confirmado − recebido, 0). Nunca negativo.
   - `excedente` = max(recebido − contratado, 0), exibido à parte.
   - `entrada_paga = true` SEM repasse NÃO é quitação: é inconsistência de
     conciliação. O booleano não fabrica dinheiro recebido — o resumo geral já
     conta R$ 0 nesses casos, e divergir disso criaria duas contabilidades.

   NÃO mexer no saldo a receber: ele usa `totalRecebido`, que já inclui os
   repasses de entrada. Descontar de novo contaria a entrada duas vezes.
   ═══════════════════════════════════════════════════════════════════════════ */

(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.EntradaCliente = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var STATUS = {
    INDISPONIVEL: 'indisponivel',
    SEM_CONTRATO: 'sem_contrato',   // contrato_entrada = 0 → nada a exibir
    PENDENTE:     'pendente',       // nenhum repasse
    PARCIAL:      'parcial',        // recebido > 0 e < contratado
    QUITADA:      'quitada',        // recebido >= contratado
    INCONSISTENTE:'inconsistente'   // entrada_paga=true sem cobertura no ledger
  };

  function _num(v) {
    var n = Number(v || 0);
    return isFinite(n) ? n : 0;
  }

  /* Calcula a posição da entrada de UMA obra.
     `obra`     — objeto com contrato_entrada e entrada_paga
     `repasses` — lista completa de repasses_cef (filtra por obra_id aqui)
     `resumo` — fonte aprovada confirmada; ausente/falha no navegador fica desconhecida.
     Dois argumentos mantêm o contrato puro legado para consumidores sem planos. */
  function calcular(obra, repasses, resumo) {
    obra = obra || {};
    var contratado = _num(obra.contrato_entrada);
    var marcadaNoCadastro = obra.entrada_paga === true;

    var lista = Array.isArray(repasses) ? repasses : [];
    var doTipo = lista.filter(function (r) {
      return r && String(r.obra_id) === String(obra.id) &&
             (r.tipo || 'pls') === 'entrada';
    });
    var recebido = doTipo.reduce(function (s, r) { return s + _num(r.valor); }, 0);
    var original = contratado, ajuste = 0, planoId = null, recebidoCentavos = null, alvoCentavos = null;
    var projecoes = root && root.EntradaPlanoProjecoes;
    if (arguments.length >= 3 || projecoes) {
      var fonte = arguments.length >= 3 ? resumo : projecoes.atual();
      var api = projecoes;
      if (!api && typeof module === 'object' && module.exports) api = require('./edr-v2-entrada-plano-projecoes.js');
      var pos = api && api.projetar(obra, fonte);
      if (!pos || pos.status !== 'confirmada') return { contratado: null, original: original, ajuste: null, recebido: recebido,
        pendente: null, excedente: null, lancamentos: doTipo.length, marcadaNoCadastro: marcadaNoCadastro,
        status: STATUS.INDISPONIVEL, alerta: 'Plano aprovado não confirmado. Recarregue para conferir o saldo da entrada.', quitada: false, planoId: null };
      var somaCentavos = 0n, valoresConfirmados = Array.isArray(repasses);
      doTipo.forEach(function (r) { var c = api.centavos(r.valor); if (c == null) valoresConfirmados = false; else somaCentavos += BigInt(c); });
      if (!valoresConfirmados || somaCentavos > BigInt(Number.MAX_SAFE_INTEGER) || somaCentavos < BigInt(Number.MIN_SAFE_INTEGER) ||
          BigInt(pos.totalCentavos) - somaCentavos > BigInt(Number.MAX_SAFE_INTEGER) || BigInt(pos.totalCentavos) - somaCentavos < BigInt(Number.MIN_SAFE_INTEGER)) {
        return { contratado: pos.totalCentavos / 100, original: pos.originalCentavos / 100, ajuste: pos.ajusteCentavos / 100, recebido: null,
          pendente: null, excedente: null, lancamentos: doTipo.length, marcadaNoCadastro: marcadaNoCadastro, status: STATUS.INDISPONIVEL,
          alerta: 'Recebimentos da entrada não confirmados. Recarregue.', quitada: false, planoId: pos.planoId };
      }
      recebidoCentavos = Number(somaCentavos); alvoCentavos = pos.totalCentavos; recebido = recebidoCentavos / 100;
      contratado = alvoCentavos / 100; original = pos.originalCentavos / 100; ajuste = pos.ajusteCentavos / 100; planoId = pos.planoId;
    }

    var pendente  = recebidoCentavos == null ? Math.max(contratado - recebido, 0) : Math.max(alvoCentavos - recebidoCentavos, 0) / 100;
    var excedente = recebidoCentavos == null ? Math.max(recebido - contratado, 0) : Math.max(recebidoCentavos - alvoCentavos, 0) / 100;

    var status, alerta = null;

    if (contratado <= 0) {
      status = STATUS.SEM_CONTRATO;
    } else if (recebido >= contratado || marcadaNoCadastro) {
      status = STATUS.QUITADA;
    } else if (recebido > 0) {
      status = STATUS.PARCIAL;
    } else {
      status = STATUS.PENDENTE;
    }

    // Booleano do cadastro em conflito com o ledger: sinaliza, não decide.
    if (contratado > 0 && marcadaNoCadastro && recebido < contratado) {
      status = STATUS.INCONSISTENTE;
      alerta = recebido > 0
        ? 'Marcada como paga no cadastro, mas o repasse registrado não cobre o valor contratado.'
        : 'Marcada como paga no cadastro, mas sem repasse registrado.';
    }

    return {
      contratado: contratado, original: original, ajuste: ajuste, planoId: planoId,
      recebido: recebido,
      pendente: pendente,
      excedente: excedente,
      lancamentos: doTipo.length,
      marcadaNoCadastro: marcadaNoCadastro,
      status: status,
      alerta: alerta,
      quitada: status === STATUS.QUITADA
    };
  }

  /* Texto do selo. `fmt` é a função de moeda do módulo chamador (fmtR),
     mantida injetável para o teste rodar sem o DOM do EDR. */
  function rotulo(pos, fmt) {
    var f = fmt || function (v) { return 'R$ ' + Number(v).toFixed(2); };
    if (pos.status === STATUS.INDISPONIVEL) return 'Entrada: saldo não confirmado · recarregar';
    if (pos.status === STATUS.SEM_CONTRATO) return null;

    if (pos.status === STATUS.QUITADA) {
      return pos.excedente > 0
        ? 'Entrada quitada · ' + f(pos.excedente) + ' acima do contratado'
        : 'Entrada quitada: ' + f(pos.contratado);
    }
    if (pos.status === STATUS.INCONSISTENTE) {
      return 'Entrada: ' + f(pos.pendente) + ' pendente · conferir conciliação';
    }
    if (pos.status === STATUS.PARCIAL) {
      return 'Entrada: ' + f(pos.pendente) + ' pendente · ' + f(pos.recebido) + ' recebido';
    }
    return 'Entrada: ' + f(pos.contratado) + ' pendente';
  }

  /* Cor do selo no padrão de tags do EDR. */
  function cor(pos) {
    if (pos.status === STATUS.QUITADA) return 'green';
    if (pos.status === STATUS.INCONSISTENTE || pos.status === STATUS.INDISPONIVEL) return 'red';
    return 'yellow';
  }

  return { calcular: calcular, rotulo: rotulo, cor: cor, STATUS: STATUS };
});
