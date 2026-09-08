const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {randomUUID}=require('node:crypto');
if(!process.env.EDR_PGLITE_PATH){test('regularizacao SQL',{skip:'Defina EDR_PGLITE_PATH; SQL nao executado.'},()=>{});}else{
 const {PGlite}=require(process.env.EDR_PGLITE_PATH);
 const fixture=fs.readFileSync(path.join(__dirname,'fixtures/estoque-transacao-base.sql'),'utf8');
 const migration = require('./fixtures/custo-nota.cjs').sql + fs.readFileSync(path.join(__dirname,'../sql/estoque-saida-atomica-DRAFT.sql'),'utf8').split('-- BEGIN ESTOQUE TX BODY')[1].split('-- END ESTOQUE TX BODY')[0];
 const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
 const company=id(1),other=id(2),admin=id(3),operacional=id(4),material=id(6),obra=id(7);
 async function ambiente(t){
  const db=new PGlite();t.after(()=>db.close());await db.exec(fixture);await db.exec(migration);
  await db.exec(`insert into companies values('${company}'),('${other}');insert into company_users values('${admin}','${company}','admin'),('${operacional}','${company}','operacional'),('${id(5)}','${other}','admin');
   select set_config('request.jwt.claim.sub','${admin}',false);
   insert into materiais(id,company_id,codigo,nome,unidade) values('${material}','${company}','000001','MATERIAL','UN');
   insert into obras(id,company_id,nome) values('${obra}','${company}','OBRA');insert into estoque_transacao_config values('${company}',true);`);
  async function saida(qtd=3){return (await db.query(`select registrar_saida_estoque_atomica($1,$2,$3,$4,clock_timestamp(),'04_alven','fifo','nao_classificado',null,'TESTE',$4,10) r`,[randomUUID(),material,obra,qtd])).rows[0].r;}
  const r=await saida();
  const pendencia=(await db.query('select * from estoque_saida_origens where distribuicao_id=$1',[r.distribuicao_id])).rows[0];
  async function nf(qtd=5,preco=20,extra={}){
   const nfId=randomUUID(),itens=[{codigo:'OUTRO',desc:'OUTRO',qtd:1,preco:1,total:1,unidade:'UN'},
    {codigo:'000001',desc:'MATERIAL',qtd,preco,total:qtd*preco,unidade:'UN',...extra}];
   await db.query("insert into notas_fiscais(id,company_id,numero_nf,fornecedor,cnpj,obra,data,criado_em,itens) values($1,$2,'123','FORNECEDOR','12345678000100','EDR',current_date-1,clock_timestamp()-interval '1 day',$3)",[nfId,company,JSON.stringify(itens)]);return nfId;
  }
  async function ed(qtd=5,preco=20){const edId=randomUUID();await db.query("insert into entradas_diretas(id,company_id,item_desc,codigo_catalogo,qtd,preco,unidade,data,criado_em) values($1,$2,'MATERIAL','000001',$3,$4,'UN',current_date-1,clock_timestamp()-interval '1 day')",[edId,company,qtd,preco]);return edId;}
  async function propor(fonte,tipo='nf',qtd=3,pend=pendencia.id,idx=tipo==='nf'?1:null){return (await db.query('select propor_regularizacao_estoque($1,$2,$3,$4,$5) r',[pend,tipo,fonte,idx,qtd])).rows[0].r;}
  function pedido(p,extra={}){return {op:randomUUID(),pend:p.pendencia_id,tipo:p.origem.tipo,fonte:p.origem.id,idx:p.origem.item_idx,qtd:p.qtd,revisao:p.revisao,evidencia:'Canhoto NF 123 recebido antes da saida',justificativa:'Recebimento conferido com responsavel do almoxarifado',tratamento:'manter_custo_registrado',...extra};}
  async function aplicar(p){return (await db.query('select regularizar_origem_estoque($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) r',[p.op,p.pend,p.tipo,p.fonte,p.idx,p.qtd,p.revisao,p.evidencia,p.justificativa,p.tratamento])).rows[0].r;}
  async function estado(){return (await db.query(`select jsonb_build_object('saldo',(_estoque_tx_lotes(m,clock_timestamp())->>'saldo')::numeric,
   'sem',(select coalesce(sum(qtd),0) from estoque_saida_origens where tipo='sem_origem'),
   'custo',(select sum(total) from lancamentos),'origens',(select count(*) from estoque_saida_origens),
   'auditorias',(select count(*) from estoque_regularizacoes)) r from materiais m where id=$1`,[material])).rows[0].r;}
  return{db,nf,ed,saida,pendencia,propor,pedido,aplicar,estado,r};
 }
 test('REG SQL: proposta somente leitura e NF comprovada preservam saldo/custo com evidencia',async t=>{
  const a=await ambiente(t),nf=await a.nf();const antes=await a.estado();
  await a.db.exec('begin read only');const p=await a.propor(nf);await a.db.exec('commit');
  assert.deepEqual(await a.estado(),antes);assert.equal(p.custo_mantido,30);assert.equal(p.custo_referencia,60);assert.equal(p.diferenca_referencia,30);
  await a.db.exec('set role authenticated');const r=await a.aplicar(a.pedido(p));assert.equal(r.status,'regularizada');await a.db.exec('reset role');
  assert.deepEqual(await a.estado(),{saldo:2,sem:0,custo:30,origens:1,auditorias:1});
  const audit=(await a.db.query('select * from estoque_regularizacoes')).rows[0];assert.equal(audit.ator,admin);assert.equal(audit.origem_anterior.tipo,'sem_origem');assert.equal(audit.origem_nova.nota_id,nf);assert.equal(audit.origem_nova.item_idx,1);
  await assert.rejects(a.db.exec("update estoque_regularizacoes set ator=null"),/imutavel/);
  await assert.rejects(a.db.exec('delete from estoque_regularizacoes'),/imutavel/);
  await assert.rejects(a.db.query('delete from notas_fiscais where id=$1',[nf]),/origem ou movimento usado/);
  await assert.rejects(a.db.query("update notas_fiscais set itens='[]' where id=$1",[nf]),/origem ou movimento usado/);
 });
 test('REG SQL: parcial por duas origens preserva valor total e encerra somente a quantidade conferida',async t=>{
  const a=await ambiente(t),nf=await a.nf(2),ed=await a.ed(2,15);
  await a.aplicar(a.pedido(await a.propor(nf,'nf',2)));
  assert.deepEqual(await a.estado(),{saldo:1,sem:1,custo:30,origens:2,auditorias:1});
  const p=await a.propor(ed,'entrada_direta',1);await a.aplicar(a.pedido(p));
  assert.deepEqual(await a.estado(),{saldo:1,sem:0,custo:30,origens:2,auditorias:2});
  assert.equal((await a.db.query("select nota_id from estoque_saida_origens where tipo='entrada_direta'")).rows[0].nota_id,null);
 });
 test('REG SQL: UUID repetido inclusive apos estorno nao recria vinculos',async t=>{
  const a=await ambiente(t),p=a.pedido(await a.propor(await a.nf()));const r=await a.aplicar(p);
  assert.equal((await a.aplicar(p)).origem_id,r.origem_id);assert.equal((await a.aplicar(p)).repetida,true);
  await assert.rejects(a.aplicar({...p,justificativa:'Outra justificativa documentada'}),/identificador ja usado/);
  await a.db.query('select excluir_distribuicao_estoque($1)',[a.r.distribuicao_id]);
  assert.equal((await a.aplicar(p)).saida_excluida,true);
  assert.equal((await a.estado()).auditorias,1);assert.equal((await a.estado()).origens,0);
 });
 test('REG SQL: origem futura, unidade ausente/incompativel, outro material e indice errado sao rejeitados',async t=>{
  const a=await ambiente(t),nf=await a.nf();
  await a.db.query('update notas_fiscais set data=current_date,criado_em=clock_timestamp() where id=$1',[nf]);
  await assert.rejects(a.propor(nf),/posterior/);
  for(const extra of [{unidade:null},{unidade:'KG'},{codigo:'OUTRO'}])await assert.rejects(a.propor(await a.nf(5,20,extra)),/unidade|outro material/);
  await assert.rejects(a.propor(nf,'nf',3,a.pendencia.id,99),/NF\/item indisponivel/);
  assert.equal((await a.estado()).auditorias,0);
 });
 test('REG SQL: unidade de estoque convertida prevalece sobre unidade fiscal',async t=>{
  const a=await ambiente(t),nf=await a.nf(5,20,{unidade:'CX',unidade_estoque:'UN',qtd_estoque:5});
  await a.aplicar(a.pedido(await a.propor(nf)));assert.equal((await a.estado()).sem,0);
 });
 test('REG SQL: novo movimento invalida proposta sem gravar; nova conferencia pode prosseguir',async t=>{
  const a=await ambiente(t),nf=await a.nf(),p=a.pedido(await a.propor(nf));await a.ed(2);
  await assert.rejects(a.aplicar(p),/historico alterado/);assert.equal((await a.estado()).sem,3);assert.equal((await a.estado()).auditorias,0);
  await a.aplicar(a.pedido(await a.propor(nf)));assert.equal((await a.estado()).sem,0);
 });
 test('REG SQL: origem insuficiente e conflito com saida posterior sao rejeitados no replay',async t=>{
  const a=await ambiente(t),nf=await a.nf(2);await assert.rejects(a.propor(nf),/invalidou uma origem/);
  await a.nf(8);await a.saida(2); // primeiro lote continua fixado na segunda saida; nao pode ser tomado retroativamente.
  await assert.rejects(a.propor(nf,'nf',2),/invalidou uma origem/);assert.equal((await a.estado()).auditorias,0);
 });
 test('REG SQL: contagem posterior mantem saldo absoluto apos regularizacao',async t=>{
  const a=await ambiente(t),nf=await a.nf(5);await a.db.query("insert into ajustes_estoque(company_id,item_desc,codigo_catalogo,qtd,tipo,motivo,criado_em) values($1,'MATERIAL','000001',0,'contagem','real 1',clock_timestamp())",[company]);
  await a.aplicar(a.pedido(await a.propor(nf)));assert.equal((await a.estado()).saldo,1);
 });
 test('REG SQL: falha apos troca de origem reverte vinculo, custo e auditoria juntos',async t=>{
  const a=await ambiente(t),nf=await a.nf(),p=a.pedido(await a.propor(nf)),antes=await a.estado();
  await a.db.exec("create function falha_reg() returns trigger language plpgsql as $$begin raise exception 'falha injetada';end$$;create trigger falha_reg before insert on estoque_regularizacoes for each row execute function falha_reg()");
  await assert.rejects(a.aplicar(p),/falha injetada/);assert.deepEqual(await a.estado(),antes);
 });
 test('REG SQL: empresa, papel, sessao, ACL e helper sao protegidos',async t=>{
  const a=await ambiente(t),nf=await a.nf(),p=a.pedido(await a.propor(nf));
  const estrangeira=randomUUID();await a.db.query("insert into notas_fiscais(id,company_id,fornecedor,cnpj,obra,data,criado_em,itens) select $1,$2,fornecedor,cnpj,obra,data,criado_em,itens from notas_fiscais where id=$3",[estrangeira,other,nf]);
  await assert.rejects(a.propor(estrangeira),/NF\/item indisponivel/);
  for(const user of [operacional,'',id(5)]){
   await a.db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);
   await assert.rejects(a.propor(nf),/administrador|sessao sem empresa|pendencia inexistente/);
   await assert.rejects(a.aplicar(p),/administrador|sessao sem empresa|nao habilitada/);
  }
  await a.db.query("select set_config('request.jwt.claim.sub',$1,false)",[admin]);await a.aplicar(p);await a.db.exec('set role authenticated');
  await assert.rejects(a.db.exec('delete from estoque_regularizacoes'),/permission denied/);
  await assert.rejects(a.db.exec('select _estoque_tx_admin_regularizacao()'),/permission denied/);
  await assert.rejects(a.db.exec('update estoque_saida_origens set qtd=1'),/permission denied/);
  assert.equal((await a.db.query('select * from estoque_regularizacoes')).rows.length,1);
  await a.db.query("select set_config('request.jwt.claim.sub',$1,false)",[id(5)]);assert.equal((await a.db.query('select * from estoque_regularizacoes')).rows.length,0);
 });
 test('REG SQL: comprovante, justificativa e aceite de custo obrigatorios; quantidade invalida rejeitada',async t=>{
  const a=await ambiente(t),nf=await a.nf(),p=a.pedido(await a.propor(nf));
  for(const extra of [{evidencia:''},{justificativa:'x'},{tratamento:'recalcular'}])await assert.rejects(a.aplicar({...p,...extra}),/comprovante/);
  for(const qtd of [0,-1,4,'NaN','Infinity'])await assert.rejects(a.propor(nf,'nf',qtd),/invalida|quantidade alterada/);
  assert.equal((await a.estado()).auditorias,0);
 });
}
