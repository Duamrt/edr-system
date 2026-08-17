// Regressão: uma devolução gera crédito previsto, não entrada de caixa imediata.
const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync('js/edr-v2-financeiro.js', 'utf8') + `
  globalThis.__status = _getStatusConta;
  globalThis.__saldo = _calcSaldoHoje;
  globalThis.__setContas = x => { contasPagar = x; };
`;

const context = {
  console,
  hojeISO: () => '2026-08-14',
  adicionaisPgtos: [],
  lancamentos: [],
  viewRegistry: undefined,
  document: { getElementById: () => null },
  esc: x => String(x), fmt: x => String(x), fmtData: x => String(x),
};

vm.createContext(context);
vm.runInContext(source, context);

let assertions = 0;
function equal(actual, expected, label) {
  assertions++;
  if (actual !== expected) throw new Error(`${label}: esperado ${expected}, recebido ${actual}`);
}

const pendente = { tipo: 'reembolso_fornecedor', status: 'pendente', data_vencimento: '2026-08-20', valor: 396.45 };
const recebido = { ...pendente, status: 'pago', data_recebimento: '2026-08-14' };

equal(context.__status(pendente), 'pendente', 'reembolso pendente nao pode aparecer como concluido');
equal(context.__status(recebido), 'reembolsado', 'reembolso recebido precisa aparecer como concluido');
context.__setContas([pendente]);
equal(context.__saldo(), 0, 'reembolso pendente nao pode aumentar o caixa');
context.__setContas([recebido]);
equal(context.__saldo(), 396.45, 'reembolso recebido precisa entrar no caixa');

console.log(`reembolso-fornecedor: ${assertions} assertions passed`);
