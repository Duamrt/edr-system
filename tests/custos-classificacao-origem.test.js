const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const raiz = path.resolve(__dirname, '..');
const ler = arquivo => fs.readFileSync(path.join(raiz, arquivo), 'utf8');
const infra = ler('js/edr-v2-infra.js');
const custos = ler('js/edr-v2-custos.js');
const notas = ler('js/edr-v2-notas.js');
const estoque = ler('js/edr-v2-estoque.js');
const diarias = ler('js/edr-v2-diarias.js');
const financeiro = ler('js/edr-v2-financeiro.js');
const index = ler('index.html');
const sql = ler('sql/custos-classificacao-origem-migration.sql');

const contrato = infra.match(/const CUSTO_DESTINOS[\s\S]*?(?=async function loadCompanyId)/);
assert.ok(contrato, 'contrato central de classificação não encontrado');
const contexto = { obrasAdicionais: [] };
vm.createContext(contexto);
vm.runInContext(`${contrato[0]}; globalThis.testar = (obraId, adicionalId) => custoClassificacaoNovo(obraId, adicionalId); globalThis.normalizar = custoDestinoNormalizar;`, contexto);

assert.deepEqual(
  JSON.parse(JSON.stringify(contexto.testar('obra-1'))),
  { destino_custo: 'padrao', adicional_id: null }
);
contexto.obrasAdicionais.push({ id: 'add-1', obra_id: 'obra-1', status: 'aprovado' });
assert.deepEqual(
  JSON.parse(JSON.stringify(contexto.testar('obra-1'))),
  { destino_custo: 'nao_classificado', adicional_id: null }
);
assert.deepEqual(
  JSON.parse(JSON.stringify(contexto.testar('obra-1', 'add-1'))),
  { destino_custo: 'adicional', adicional_id: 'add-1' }
);
assert.equal(contexto.normalizar({}), 'nao_classificado');
assert.equal(contexto.normalizar({ destino_custo: 'adicional', adicional_id: null }), 'nao_classificado');

assert.match(infra, /select=id,obra_id,descricao,qtd,preco,total,data,obs,etapa,criado_por,nota_id,origem,destino_custo,adicional_id/);
assert.equal((notas.match(/\.\.\.custoClassificacaoNovo\(/g) || []).length, 4);
assert.equal((estoque.match(/\.\.\.custoClassificacaoNovo\(/g) || []).length, 3);
assert.match(diarias, /\.\.\.classificacaoPorChave\.get\(g\.chave\)/);
assert.match(financeiro, /\.\.\.custoClassificacaoNovo\(conta\.obra_id\)/);
assert.match(index, /\.\.\.custoClassificacaoNovo\(obraId\)/);

assert.doesNotMatch(custos, /custosAbrirClassificador/);
assert.doesNotMatch(index, /custos-resultado-origem/);
assert.match(custos, /lancamentos\.filter\(l => l\.obra_id === obraId\)\.reduce\(\(s, l\) => s \+ Number\(l\.total \|\| 0\), 0\)/);
assert.match(custos, /TOTAL RECEBIDO[\s\S]*fmtR\(totalRecebidoGeral\)/);
assert.match(custos, /Contrato: \$\{fmtR\(totalRecebido\)\} \| Adicionais: \$\{fmtR\(adds\.totalRecebido \|\| 0\)\}/);

assert.match(sql, /add column if not exists destino_custo text not null default 'nao_classificado'/i);
assert.match(sql, /foreign key \(adicional_id\)[\s\S]*references public\.obra_adicionais\(id\)/i);
assert.match(sql, /create index lancamentos_adicional_id_idx[\s\S]*on public\.lancamentos\(adicional_id, company_id\)/i);
assert.match(sql, /v_adicional\.company_id is distinct from new\.company_id[\s\S]*v_adicional\.obra_id is distinct from new\.obra_id/i);
assert.match(sql, /auth\.uid\(\) is not null[\s\S]*public\.auth_user_role\(\) is distinct from 'admin'[\s\S]*apenas administrador pode reclassificar custo/i);
assert.match(sql, /v_adicional\.status in \('pendente', 'cancelado'\)/i);
assert.match(sql, /create unique index lancamentos_mao_unico[\s\S]*company_id,[\s\S]*obra_id,[\s\S]*obs[\s\S]*where etapa = '28_mao'[\s\S]*obs is not null[\s\S]*obs <> ''/i);

console.log('custos-classificacao-origem: 24 assertions passed');
