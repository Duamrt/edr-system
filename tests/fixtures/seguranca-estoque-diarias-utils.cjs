// Carrega os helpers reais; a VM não recebe DOM, transporte, require ou dados externos.
const fs = require('node:fs');
const vm = require('node:vm');
const fonte = fs.readFileSync(require.resolve('../../js/edr-v2-utils-extras.js'), 'utf8');
module.exports = vm.runInNewContext(fonte + '\n({ esc, escJsArg });', {});
