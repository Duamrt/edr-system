'use strict';
// Dependência real do Caixa nos ensaios isolados, sem simular sua concorrência.
const fs = require('node:fs');
const path = require('node:path');
const fonte = fs.readFileSync(path.join(__dirname, '../../js/edr-v2-financeiro.js'), 'utf8');
const inicio = fonte.indexOf('let _contasLeitura =');
const fim = fonte.indexOf('function _getStatusConta(');
if (inicio < 0 || fim <= inicio) throw new Error('Loader real de contas não localizado');
module.exports = fonte.slice(inicio, fim);
