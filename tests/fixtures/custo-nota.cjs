const fs=require('node:fs');
const utils=fs.readFileSync(require.resolve('../../js/edr-v2-utils-extras.js'),'utf8');
const draft=fs.readFileSync(require.resolve('../../sql/notas-custo-atomico-DRAFT.sql'),'utf8');
module.exports={
 fonte:utils.match(/function custosItensNota\([\s\S]*?\r?\n\}/)[0]+'\n',
 sql:draft.split('-- BEGIN NOTAS CUSTO BODY')[1].split('-- END NOTAS CUSTO BODY')[0]+'\n'
};
