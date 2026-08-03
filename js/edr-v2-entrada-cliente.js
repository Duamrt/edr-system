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
   - `contrato_entrada` é o valor CONTRATADO. Nunca é decrementado.
   - `recebido`  = soma dos repasses de tipo 'entrada' da obra.
   - `pendente`  = max(contratado − recebido, 0). Nunca negativo.
   - `excedente` = max(recebido − contratado, 0), exibido à parte.
   - `entrada_paga = true` SEM repasse NÃO é quitação: é inconsistência de
     conciliação. O booleano não fabrica dinheiro recebido — o resumo geral já
     conta R$ 0 nesses casos, e divergir disso criaria duas contabilidades.

   NÃO mexer no saldo a receber: ele usa `totalRecebido`, que já inclui os
   repasses de entrada. Descontar de novo contaria a entrada duas vezes.
   ═══════════════════════════════════════════════════════════════════════════ */

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.EntradaCliente = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var STATUS = {
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
     `repasses` — lista completa de repasses_cef (filtra por obra_id aqui) */
  function calcular(obra, repasses) {
    obra = obra || {};
    var contratado = _num(obra.contrato_entrada);
    var marcadaNoCadastro = obra.entrada_paga === true;

    var lista = Array.isArray(repasses) ? repasses : [];
    var doTipo = lista.filter(function (r) {
      return r && String(r.obra_id) === String(obra.id) &&
             (r.tipo || 'pls') === 'entrada';
    });
    var recebido = doTipo.reduce(function (s, r) { return s + _num(r.valor); }, 0);

    var pendente  = Math.max(contratado - recebido, 0);
    var excedente = Math.max(recebido - contratado, 0);

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
      contratado: contratado,
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
    if (pos.status === STATUS.INCONSISTENTE) return 'red';
    return 'yellow';
  }

  return { calcular: calcular, rotulo: rotulo, cor: cor, STATUS: STATUS };
});
