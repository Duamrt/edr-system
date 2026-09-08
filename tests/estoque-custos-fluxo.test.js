const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {ambiente}=require('./fixtures/fluxo-estoque.cjs');
const nf=(itens,extra={})=>({itens:JSON.stringify(itens),...extra});
const simples=(total,qtd=10,extra={})=>({codigo:'000001',desc:'MATERIAL',total,qtd,...extra});
test('custo separa valor fiscal e desconto, frete e outras despesas',()=>{
 const {ctx}=ambiente();const n=nf([simples(400)],{desconto_total:40,frete:40,outras_despesas:10,valor_bruto:410});
 const original=JSON.stringify(n);const r=ctx.custosItensNota(n)[0];
 assert.equal(r.liquido,360);assert.equal(r.total,410);assert.equal(r.qtd,10);assert.equal(JSON.stringify(n),original);
});

test('total mostrado no formulario desconta o cabecalho da NF',()=>{
 const a=ambiente();vm.runInContext('NotasModule.itens=[{total:400}]',a.ctx);
 for(const [id,value] of Object.entries({'f-frete':40,'f-outras':10,'f-desconto-total':40}))a.campos[id]={value};
 a.campos['total-nf-row']={classList:{toggle(){}}};a.campos['total-nf-val']={};
 a.ctx.atualizarTotalComFrete();assert.match(a.campos['total-nf-val'].textContent,/410,00/);
});

test('previa de distribuicao usa lotes restantes FIFO inclusive ao cruzar lotes',()=>{
 const a=ambiente();a.ctx.notas.push(a.nf('antiga',10,41),a.nf('nova',10,60,{data:'2026-09-02'}));
 const item=a.ctx.api.consolidarEstoque()[0];
 assert.equal(a.ctx._estimarValorSaidaFIFO(item,3,'2026-09-08'),123);
 assert.equal(a.ctx._estimarValorSaidaFIFO(item,12,'2026-09-08'),530);
 a.campos['dist-qtd']={value:3};a.campos['dist-data']={value:'2026-09-08'};a.campos['dist-valor']={};
 a.ctx.api.EstoqueModule._consolidado=[item];a.ctx._atualizarValorDistribuicao(item.chave);
 assert.match(a.campos['dist-valor'].value,/123,00/);
});
test('desconto especifico do XML fica no item que recebeu o desconto',()=>{
 const {ctx}=ambiente();const r=ctx.custosItensNota(nf([simples(100,1,{desconto_fiscal:20}),simples(100,1)],{desconto_total:20,valor_bruto:180}));
 assert.equal(r[0].liquido,80);assert.equal(r[1].liquido,100);
});
test('adicionarItem preserva o desconto fiscal recebido da importacao',()=>{
 const {ctx}=ambiente();vm.runInContext('renderItensForm=()=>{}; globalThis.itensTeste=NotasModule.itens;',ctx);
 ctx.adicionarItem({codigo:'000001',desc:'MATERIAL',qtd:1,preco:100,total:100,desconto_fiscal:20,credito:false});
 assert.equal(ctx.itensTeste[0].desconto_fiscal,20);assert.equal(ctx.itensTeste[0].total,100);
});
test('NF bloqueia gravacao se a RPC estiver ausente e preserva pedido incerto',async()=>{
 const a=ambiente();a.ctx.sbRpcEstoque=async()=>({ok:false,ausente:true,incerto:false});
 assert.equal(await a.salvarNF(),false);assert.equal(a.gravacoes.length,0);assert.equal(a.ctx.localStorage.dados.size,0);
 a.ctx.sbRpcEstoque=async()=>({ok:false,incerto:true});assert.equal(await a.salvarNF(),false);assert.equal(a.ctx.localStorage.dados.size,1);
});
test('rateio de centavos fecha sem perda e legado liquido nao desconta duas vezes',()=>{
 const {ctx}=ambiente();const r=ctx.custosItensNota(nf([simples(1),simples(1),simples(1)],{desconto_total:0.01,frete:0.02,valor_bruto:3.01}));
 assert.equal(Math.round(r.reduce((s,x)=>s+x.total,0)*100),301);
 assert.equal(ctx.custosItensNota(nf([simples(360)],{desconto_total:40,valor_bruto:360}))[0].total,360);
});
for(const modo of ['distribuir','manual']) test('FIFO '+modo+' usa o lote antigo e depois o seguinte',async()=>{
 const a=ambiente();a.ctx.notas.push(a.nf('antiga',10,10),a.nf('nova',10,20,{data:'2026-09-02'}));
 await a.saida(modo,3);assert.equal(a.custo(),30);assert.equal(a.saldo(),17);
 assert.equal(a.ctx.api.consolidarEstoque()[0].valorEstoque,270);assert.equal(a.ctx.api.EstoqueModule._valorTotal,270);
});
test('NF com desconto e acessorios entra e sai pelo custo completo',async()=>{
 const a=ambiente();a.ctx.notas.push(a.nf('base',10,40,{desconto_total:40,frete:40,outras_despesas:10,valor_bruto:410}));
 await a.saida('manual');assert.equal(a.custo(),123);assert.equal(a.saldo(),7);
});
test('devolucao retira o custo da origem sem contaminar o material restante',()=>{
 const a=ambiente();a.ctx.notas.push(a.nf('base',10,40,{desconto_total:40,frete:40,outras_despesas:10,valor_bruto:410}));
 const d=a.nf('dev',2,40,{natureza:'DEVOLUCAO',nota_origem_id:'base',data:'2026-09-03'});
 const itens=JSON.parse(d.itens);itens[0].item_idx_origem=0;d.itens=JSON.stringify(itens);a.ctx.notas.push(d);
 const r=a.ctx.api.consolidarEstoque()[0];assert.equal(r.saldo,8);assert.equal(r.valorMedio,41);assert.equal(r.valorEstoque,328);
});
test('duplo clique cria uma entrada; falha libera a trava para nova tentativa',async()=>{
 const a=ambiente();a.entradaCampos();await Promise.all([a.ctx.api.salvarEntradaDireta(),a.ctx.api.salvarEntradaDireta()]);
 assert.equal(a.gravacoes.length,1);assert.equal(a.saldo(),10);
 a.ctx.falhaPost='entradas_diretas';await a.ctx.api.salvarEntradaDireta();a.ctx.falhaPost=null;
 await a.ctx.api.salvarEntradaDireta();assert.equal(a.saldo(),20);
});
test('obra invalida e quantidade nao finita nao criam entrada',async()=>{
 const a=ambiente();a.entradaCampos('OBRA');a.campos['entrada-obra-id'].value='inexistente';await a.ctx.api.salvarEntradaDireta();
 a.entradaCampos();a.campos['entrada-qtd'].value='Infinity';await a.ctx.api.salvarEntradaDireta();assert.equal(a.gravacoes.length,0);
});
function exclusao(){
 const a=ambiente();const fonte=fs.readFileSync(require.resolve('../js/edr-v2-obras.js'),'utf8');
 vm.runInContext(fonte.match(/async function excluirLanc\(id\) \{[\s\S]*?\r?\n\}/)[0],a.ctx);
 a.ctx.notas.push(a.nf('base',10,40));a.ctx.lancamentos.push({id:'lc',descricao:'MATERIAL',qtd:3,total:120});
 a.ctx.distribuicoes.push({id:'dist',lancamento_id:'lc',item_desc:'MATERIAL',codigo_catalogo:'000001',qtd:3,data:'2026-09-07'});
 a.ctx.sbDelete=async()=>{throw new Error('nao deve excluir partes isoladas')};return a;
}
test('falha da exclusao atomica conserva saldo e custo',async()=>{
 const a=exclusao();a.ctx.sbRpc=async()=>null;await a.ctx.excluirLanc('lc');assert.equal(a.saldo(),7);assert.equal(a.ctx.lancamentos.length,1);
});
test('exclusao confirmada remove baixa e custo juntos',async()=>{
 const a=exclusao();a.ctx.sbRpc=async(fn,p)=>{assert.equal(fn,'excluir_distribuicao_estoque');assert.equal(p.p_distribuicao_id,'dist');a.ctx.distribuicoes=[];a.ctx.lancamentos=[];return {ok:true}};
 await a.ctx.excluirLanc('lc');assert.equal(a.saldo(),10);assert.equal(a.ctx.lancamentos.length,0);
});
test('vinculo compartilhado ou carga incompleta bloqueia exclusao',async()=>{
 const a=exclusao();a.ctx.sbRpc=async()=>{throw new Error('RPC nao esperada')};a.ctx.distribuicoes.push({...a.ctx.distribuicoes[0],id:'dist2'});
 await a.ctx.excluirLanc('lc');assert.equal(a.ctx.lancamentos.length,1);
 a.ctx.loadDistribuicoes=async()=>false;await a.ctx.excluirLanc('lc');assert.equal(a.ctx.distribuicoes.length,2);
});
