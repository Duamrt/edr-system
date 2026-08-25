const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.resolve(__dirname, '..');
const notas = fs.readFileSync(path.join(raiz, 'js', 'edr-v2-notas.js'), 'utf8');
const financeiro = fs.readFileSync(path.join(raiz, 'js', 'edr-v2-financeiro.js'), 'utf8');
const dre = fs.readFileSync(path.join(raiz, 'js', 'edr-v2-dre.js'), 'utf8');
const sql = fs.readFileSync(path.join(raiz, 'sql', 'notas-integridade-financeira-migration.sql'), 'utf8');

// Toda conta nascida de NF nova carrega o UUID, inclusive despesas e pagamentos.
assert.match(notas, /nota_id: saved\.id, nota_ref: String\(numero\)/);
assert.match(notas, /tipo: 'despesa_operacional_nf'[\s\S]*nota_id: saved\.id/);
assert.match(notas, /nota_id: notaId, nota_ref: numero, status: 'pago'/);
assert.match(notas, /nota_id: notaId, nota_ref: numero, status: 'pendente'/);

// Exclusão usa RPC primeiro e só aceita o caminho legado se a migration faltar.
assert.match(notas, /sbRpc\('excluir_nota_fiscal', \{ p_nota_id: nota\.id \}\)/);
assert.match(notas, /rpc !== 'RPC_AUSENTE'/);

// Financeiro e DRE nunca criam/contam custo duplicado de NF vinculada por UUID.
assert.match(financeiro, /!conta\.nota_id && !conta\.nota_ref/);
assert.match(dre, /c\.tipo === 'despesa_operacional_nf'/);
assert.match(dre, /r\.filter\(_contaAdminEntraDRE\)/);

// A migration protege novas distribuições e executa exclusão no servidor.
assert.match(sql, /foreign key \(lancamento_id\)[\s\S]*references public\.lancamentos\(id\)[\s\S]*not valid/i);
assert.match(sql, /create or replace function public\.excluir_nota_fiscal\(p_nota_id uuid\)/i);
assert.match(sql, /security definer/i);
assert.match(sql, /auth_company_id\(\)/i);
assert.match(sql, /auth_user_role\(\) <> 'admin'/i);
assert.match(sql, /delete from public\.distribuicoes[\s\S]*delete from public\.lancamentos[\s\S]*delete from public\.notas_fiscais/i);
assert.match(sql, /d\.lancamento_id in[\s\S]*select l\.id[\s\S]*from public\.lancamentos/i);

console.log('notas-integridade-financeira: 16 assertions passed');
