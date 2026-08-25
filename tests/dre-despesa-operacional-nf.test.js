const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const raiz = path.resolve(__dirname, '..');
const codigo = fs.readFileSync(path.join(raiz, 'js', 'edr-v2-dre.js'), 'utf8');

const contas = [
  { id: 'avulsa', valor: 100, data_pagamento: '2026-08-01' },
  { id: 'estoque', valor: 500, data_pagamento: '2026-08-01', nota_id: 'nf-estoque', nota_ref: '10' },
  { id: 'legada-escritorio', descricao: 'GASOLINA', valor: 50, data_pagamento: '2026-08-01', nota_id: 'nf-escritorio', nota_ref: '11' },
  { id: 'legada-ja-lancada', descricao: 'AGUA MINERAL', valor: 30, data_pagamento: '2026-08-01', nota_id: 'nf-ja-lancada', nota_ref: '11B' },
  { id: 'pagamento-escritorio', descricao: 'NF 12 - FORNECEDOR', valor: 900, data_pagamento: '2026-08-01', nota_id: 'nf-pagamento', nota_ref: '12' },
  { id: 'marcada', descricao: 'MATERIAL DE LIMPEZA', valor: 25, data_pagamento: '2026-08-01', tipo: 'despesa_operacional_nf', nota_id: 'nf-mista', nota_ref: '13' },
  { id: 'reembolso', valor: 40, data_pagamento: '2026-08-01', tipo: 'reembolso_fornecedor' }
];

const contexto = {
  console,
  window: {},
  obras: [],
  obrasArquivadas: [],
  repassesCef: [],
  adicionaisPgtos: [],
  obrasAdicionais: [],
  lancamentos: [
    { nota_id: 'nf-ja-lancada', descricao: '000123 · AGUA MINERAL', total: 30, etapa: 'material', data: '2026-08-01' }
  ],
  notas: [
    { id: 'nf-estoque', obra: 'EDR' },
    { id: 'nf-escritorio', obra: 'EDR - ESCRITORIO' },
    { id: 'nf-ja-lancada', obra: 'EDR - ESCRITORIO' },
    { id: 'nf-pagamento', obra: 'EDR - ESCRITORIO' },
    { id: 'nf-mista', obra: 'EDR - ESCRITORIO' }
  ],
  sbGet: async () => contas
};

vm.createContext(contexto);
vm.runInContext(codigo, contexto);

(async () => {
  await contexto.window.DREModule.garantirContasAdmin();
  const resultado = contexto.window.DREModule.calcGerencialConsolidado('2026-08');

  assert.equal(resultado.despAdmin, 175);
  assert.equal(resultado.despOper, 175);
  assert.equal(resultado.resultado, -175);
  console.log('dre-despesa-operacional-nf: 3 assertions passed');
})().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
