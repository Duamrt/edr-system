/* ═══════════════════════════════════════════════════════════════════════════
   EDR — Markup + handler de acessibilidade dos cards de decisão do simulador
   Rodar:  node tests/simulador-acessibilidade.test.js

   Motivo (auditoria 2026-08-03): `role="radio"`, `aria-checked`, `aria-label`,
   roving tabindex e `_simTeclaEfeito` não tinham cobertura. As 222 asserções das
   outras suítes cobrem motor, guardas e regra temporal — uma regressão na UI
   acessível passaria verde.

   NATUREZA DESTE ARQUIVO — teste de MARKUP + HANDLER, não de DOM.
   Ele NÃO monta nem interpreta HTML: verifica por regex a string produzida por
   `_simCardEfeito` e chama `_simTeclaEfeito` diretamente, com stubs. Vale como
   guarda unitária contra regressão; **não** é prova de árvore de acessibilidade
   nem de foco real no navegador. (Chamá-lo de "DOM mínimo" era impreciso —
   correção apontada pelo Codex, 2026-08-03.)

   Por que não jsdom/Playwright: nenhum dos dois está instalado (`require`
   falha), e acrescentar dependência ao EDR — HTML+JS vanilla sem build —
   sairia do escopo desta janela.

   O QUE ESTE TESTE **NÃO** SUBSTITUI:
   - leitor de tela real (NVDA / VoiceOver) — a locução pode diferir do atributo;
   - teclado físico — o handler é chamado direto, sem foco do sistema operacional;
   - `:focus-visible` renderizado — é CSS, exige navegador;
   - árvore de acessibilidade computada pelo navegador;
   - foco real: aqui `focus()` é contado num objeto espião, não movido de verdade.
   Todas continuam como validação MANUAL, registradas em
   docs/SIMULADOR-VALIDACAO-LOCAL.md.
   ═══════════════════════════════════════════════════════════════════════════ */

globalThis.SimuladorCalc = require('../js/edr-v2-simulador-calc.js');
globalThis.SimuladorTaxa = require('../js/edr-v2-simulador-taxa.js');

// ── Stubs de ambiente: só o que a UI toca ao montar/alternar os cards ───────
globalThis.esc = function (s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
};
globalThis.showToast = function () {};
globalThis.viewRegistry = { register: function () {} };

/* Card espião para `#view-simulador .sim-ef.sel`.

   `_simTeclaEfeito` devolve o foco ao card que passou a valer:
       const alvo = document.querySelector('#view-simulador .sim-ef.sel');
       if (alvo) alvo.focus();
   Com um querySelector que devolve `null` (versão anterior deste arquivo), o
   `if (alvo)` engolia a chamada e a suíte passava SEM nunca exercitar
   `alvo.focus()`. Bug apontado pelo Codex em 2026-08-03. */
const cardEspiao = {
  focosRecebidos: 0,
  focus: function () { this.focosRecebidos++; }
};
const _els = {};
globalThis.document = {
  getElementById: function (id) { return _els[id] || null; },
  querySelector: function (sel) {
    return sel === '#view-simulador .sim-ef.sel' ? cardEspiao : null;
  },
  createElement: function () { return { setAttribute: function () {}, appendChild: function () {} }; },
  head: { appendChild: function () {} }
};

const UI = require('../js/edr-v2-simulador.js');
const SimuladorModule = UI.SimuladorModule;

let ok = 0, fail = 0;
const falhas = [];
function eq(atual, esperado, nome) {
  const a = String(atual), e = String(esperado);
  if (a === e) { ok++; console.log('  OK   ' + nome); }
  else { fail++; falhas.push({ nome, esperado: e, atual: a });
         console.log('  FAIL ' + nome + '\n         esperado: ' + e + '\n         atual:    ' + a); }
}
function grupo(t) { console.log('\n-- ' + t + ' ' + '-'.repeat(Math.max(0, 54 - t.length))); }

// Extrai um atributo do HTML de um card.
function attr(html, nome) {
  const m = html.match(new RegExp(nome + '="([^"]*)"'));
  return m ? m[1] : null;
}

// Efeito de exemplo, com os números da obra DUAM usados nas outras rodadas.
const EF_PRAZO = {
  ok: true, prazoAntes: 416, prazoDepois: 412, parcelasReduzidas: 4,
  parcelaAntesCent: 407823n, parcelaDepoisCent: 407823n,
  jurosEconomizadosCent: 1380119n
};
const EF_PRESTACAO = {
  ok: true, prazoAntes: 416, prazoDepois: 416, parcelasReduzidas: 0,
  parcelaAntesCent: 407823n, parcelaDepoisCent: 403530n,
  jurosEconomizadosCent: 694251n
};

// ═══ 1. role e aria-checked ═══
grupo('1. role=radio e aria-checked');
{
  const sel  = UI._simCardEfeito('reduzir_prazo', EF_PRAZO, true);
  const nsel = UI._simCardEfeito('reduzir_prestacao', EF_PRESTACAO, false);

  eq(attr(sel, 'role'), 'radio', 'card selecionado tem role=radio');
  eq(attr(nsel, 'role'), 'radio', 'card nao selecionado tem role=radio');
  eq(attr(sel, 'aria-checked'), 'true', 'selecionado: aria-checked=true');
  eq(attr(nsel, 'aria-checked'), 'false', 'nao selecionado: aria-checked=false');
}

// ═══ 2. Roving tabindex ═══
grupo('2. Roving tabindex (um so ponto de parada no Tab)');
{
  const sel  = UI._simCardEfeito('reduzir_prazo', EF_PRAZO, true);
  const nsel = UI._simCardEfeito('reduzir_prestacao', EF_PRESTACAO, false);

  eq(attr(sel, 'tabindex'), '0', 'selecionado e focavel por Tab');
  eq(attr(nsel, 'tabindex'), '-1', 'nao selecionado sai da ordem de Tab');
  // Invariante: nunca os dois com 0 — o Tab pararia duas vezes no mesmo grupo.
  eq(attr(sel, 'tabindex') === '0' && attr(nsel, 'tabindex') === '-1', true,
     'exatamente um card no Tab');
}

// ═══ 3. Nome acessível ═══
grupo('3. aria-label descreve o card em frase');
{
  const sel = UI._simCardEfeito('reduzir_prazo', EF_PRAZO, true);
  const lbl = attr(sel, 'aria-label');

  eq(lbl !== null && lbl !== '', true, 'aria-label existe');
  eq(/^Reduzir prazo:/.test(lbl), true, 'comeca pelo nome da opcao');
  eq(/412 meses/.test(lbl), true, 'cita o novo prazo');
  eq(/4 parcelas a menos/.test(lbl), true, 'cita as parcelas eliminadas');
  eq(/13\.801,19/.test(lbl), true, 'cita a economia de juros');

  const nsel = UI._simCardEfeito('reduzir_prestacao', EF_PRESTACAO, false);
  const lbl2 = attr(nsel, 'aria-label');
  eq(/^Reduzir prestação:/.test(lbl2), true, 'prestacao: comeca pelo nome');
  eq(/4\.035,30/.test(lbl2), true, 'prestacao: cita a nova parcela');
  eq(/416 meses/.test(lbl2), true, 'prestacao: cita o prazo mantido');

  /* O DEFEITO CORRIGIDO: sem aria-label o nome acessivel cai no textContent e o
     leitor anuncia tudo grudado ("Reduzir prazoNovo prazo412 meses..."). */
  eq(/prazoNovo|prestaçãoNova/.test(lbl), false,
     'nao e o textContent grudado do card');
  eq(lbl.indexOf(' ') > -1 && /\.$/.test(lbl), true,
     'e uma frase, com espacos e ponto final');
}

// ═══ 4. Teclado: Enter, Espaço e setas ═══
grupo('4. _simTeclaEfeito responde ao teclado');
{
  const ev = (key) => {
    let impedido = false;
    return { key: key, preventDefault: function () { impedido = true; },
             foiImpedido: function () { return impedido; } };
  };

  // Enter escolhe a modalidade recebida
  SimuladorModule.modalidadeEscolhida = 'reduzir_prazo';
  let e = ev('Enter');
  UI._simTeclaEfeito(e, 'reduzir_prestacao');
  eq(SimuladorModule.modalidadeEscolhida, 'reduzir_prestacao', 'Enter escolhe o card');
  eq(e.foiImpedido(), true, 'Enter chama preventDefault (nao rola a pagina)');

  // Espaço idem — nas duas grafias de `key`
  SimuladorModule.modalidadeEscolhida = 'reduzir_prazo';
  UI._simTeclaEfeito(ev(' '), 'reduzir_prestacao');
  eq(SimuladorModule.modalidadeEscolhida, 'reduzir_prestacao', 'Espaco escolhe o card');

  SimuladorModule.modalidadeEscolhida = 'reduzir_prazo';
  UI._simTeclaEfeito(ev('Spacebar'), 'reduzir_prestacao');
  eq(SimuladorModule.modalidadeEscolhida, 'reduzir_prestacao',
     'Spacebar (navegador antigo) tambem escolhe');

  // Setas alternam para o OUTRO card E devolvem o foco ao que passou a valer
  ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].forEach(function (k) {
    SimuladorModule.modalidadeEscolhida = 'reduzir_prazo';
    const antes = cardEspiao.focosRecebidos;
    const evt = ev(k);
    UI._simTeclaEfeito(evt, 'reduzir_prazo');
    eq(SimuladorModule.modalidadeEscolhida, 'reduzir_prestacao', k + ' alterna para o outro');
    eq(evt.foiImpedido(), true, k + ' chama preventDefault');
    eq(cardEspiao.focosRecebidos - antes, 1, k + ' devolve o foco ao card selecionado');
  });

  // Enter e Espaço NÃO movem foco — o card já está focado, quem apertou está nele
  {
    SimuladorModule.modalidadeEscolhida = 'reduzir_prazo';
    const antes = cardEspiao.focosRecebidos;
    UI._simTeclaEfeito(ev('Enter'), 'reduzir_prestacao');
    eq(cardEspiao.focosRecebidos - antes, 0, 'Enter nao remove nem move o foco');
  }
  {
    SimuladorModule.modalidadeEscolhida = 'reduzir_prazo';
    const antes = cardEspiao.focosRecebidos;
    UI._simTeclaEfeito(ev(' '), 'reduzir_prestacao');
    eq(cardEspiao.focosRecebidos - antes, 0, 'Espaco nao remove nem move o foco');
  }
  // Tecla irrelevante tampouco
  {
    const antes = cardEspiao.focosRecebidos;
    UI._simTeclaEfeito(ev('x'), 'reduzir_prestacao');
    eq(cardEspiao.focosRecebidos - antes, 0, 'tecla qualquer nao mexe no foco');
  }

  // Ida e volta: seta a partir do outro card devolve ao primeiro
  SimuladorModule.modalidadeEscolhida = 'reduzir_prestacao';
  UI._simTeclaEfeito(ev('ArrowRight'), 'reduzir_prestacao');
  eq(SimuladorModule.modalidadeEscolhida, 'reduzir_prazo', 'seta volta ao primeiro');

  // Tecla irrelevante nao mexe na escolha nem bloqueia o navegador
  SimuladorModule.modalidadeEscolhida = 'reduzir_prazo';
  const outra = ev('a');
  UI._simTeclaEfeito(outra, 'reduzir_prestacao');
  eq(SimuladorModule.modalidadeEscolhida, 'reduzir_prazo', 'tecla qualquer nao altera');
  eq(outra.foiImpedido(), false, 'tecla qualquer NAO chama preventDefault');

  // Tab precisa continuar saindo do grupo — nunca capturado
  SimuladorModule.modalidadeEscolhida = 'reduzir_prazo';
  const tab = ev('Tab');
  UI._simTeclaEfeito(tab, 'reduzir_prestacao');
  eq(tab.foiImpedido(), false, 'Tab NAO e capturado (sai do radiogroup)');
}

// ═══ 5. Card não aplicável ═══
grupo('5. Efeito nao aplicavel nao vira alvo de teclado');
{
  const html = UI._simCardEfeito('reduzir_prazo', { ok: false, erro: 'saldo insuficiente' }, false);
  eq(/role="radio"/.test(html), false, 'sem role=radio');
  eq(/tabindex/.test(html), false, 'fora da ordem de Tab');
  eq(/onkeydown/.test(html), false, 'sem handler de teclado');
  eq(/saldo insuficiente/.test(html), true, 'mostra o motivo');
}

// ═══ RESUMO ═══
console.log('\n' + '='.repeat(64));
console.log('RESULTADO ACESSIBILIDADE: ' + ok + ' OK · ' + fail + ' FALHA');
if (fail > 0) {
  console.log('\nFALHAS:');
  falhas.forEach(f => console.log('  - ' + f.nome + '\n      esperado: ' + f.esperado +
                                  '\n      atual:    ' + f.atual));
}
console.log('='.repeat(64));
process.exit(fail > 0 ? 1 : 0);
