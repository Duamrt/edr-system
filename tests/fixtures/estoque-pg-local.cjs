// Ensaio nativo isolado. Nao aceita URL, senha ou banco existente.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawn,execFileSync}=require('node:child_process');
const {randomUUID}=require('node:crypto');
const net=require('node:net');
const executavel=n=>n+(process.platform==='win32'?'.exe':'');
class Sessao {
  constructor(bin,porta,banco,nome) {
    this.buffer='';this.erros='';this.pendente=null;this.encerrada=false;
    this.processo=spawn(path.join(bin,executavel('psql')),['-X','-q','-A','-t','-w','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-h','127.0.0.1','-p',String(porta),'-U','edr_test','-d',banco],
      {windowsHide:true,stdio:['pipe','pipe','pipe'],env:{...process.env,PGAPPNAME:nome,PGCONNECT_TIMEOUT:'5'}});
    this.fim=new Promise(resolve=>this.processo.on('close',codigo=>{
      this.encerrada=true;
      if(this.pendente){this.pendente.reject(new Error(this.erros||'Conexao encerrada: '+codigo));this.pendente=null}
      resolve(codigo);
    }));
    this.processo.on('error',e=>{if(this.pendente){this.pendente.reject(e);this.pendente=null}});
    this.processo.stderr.on('data',b=>this.erros+=b.toString('utf8'));
    this.processo.stdout.on('data',b=>{
      this.buffer+=b.toString('utf8');let i;
      while((i=this.buffer.indexOf('\n'))>=0){
        const linha=this.buffer.slice(0,i).replace(/\r$/,'');this.buffer=this.buffer.slice(i+1);
        if(!this.pendente)continue;
        if(linha===this.pendente.marca){const p=this.pendente;this.pendente=null;p.resolve(p.linhas.filter(x=>x!==''))}
        else this.pendente.linhas.push(linha);
      }
    });
  }
  query(sql){
    if(this.encerrada)return Promise.reject(new Error('Conexao encerrada'));
    if(this.pendente)throw Error('Uma consulta por sessao; abrir outra conexao para concorrencia');
    const marca='__EDR_'+randomUUID().replace(/-/g,'')+'__';
    return new Promise((resolve,reject)=>{
      this.pendente={marca,resolve,reject,linhas:[]};this.erros='';
      this.processo.stdin.write(sql+'\n\\echo '+marca+'\n');
    });
  }
  async json(sql){const linhas=await this.query(sql);return JSON.parse(linhas.at(-1))}
  async fechar(){if(!this.encerrada)this.processo.stdin.end('\n\\q\n');await this.fim}
  destruir(){this.processo.kill()}
}
async function iniciar(){
  const bin=path.resolve(process.env.EDR_POSTGRES_BIN||'');
  if(!process.env.EDR_POSTGRES_BIN)throw Error('Defina EDR_POSTGRES_BIN para os binarios nativos de PostgreSQL 17');
  const versao=execFileSync(path.join(bin,executavel('postgres')),['--version'],{encoding:'utf8',windowsHide:true}).trim();
  if(!/PostgreSQL\) 17\./.test(versao))throw Error('Ensaio exige PostgreSQL 17: '+versao);
  const base=process.env.EDR_PG_TEST_ROOT||os.tmpdir();fs.mkdirSync(base,{recursive:true});
  const pasta=fs.mkdtempSync(path.join(path.resolve(base),'edr-estoque-pg-'));
  const dados=path.join(pasta,'data'),log=path.join(pasta,'postgres.log');
  const porta=await new Promise((resolve,reject)=>{const s=net.createServer();s.on('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))})});
  execFileSync(path.join(bin,executavel('initdb')),['-D',dados,'-U','edr_test','--auth=trust','--encoding=UTF8','--no-locale'],{encoding:'utf8',windowsHide:true,stdio:'pipe'});
  // Cluster novo, acesso somente loopback, sem dados ou credenciais reais.
  const opcoes='-h 127.0.0.1 -p '+porta+' -c max_connections=12 -c shared_buffers=16MB';
  const config={bin,porta,pasta,dados,log,versao};
  fs.writeFileSync(path.join(pasta,'ENSAIO-ISOLADO.json'),JSON.stringify(config,null,2));
  try {
    execFileSync(path.join(bin,executavel('pg_ctl')),['-D',dados,'-l',log,'-o',opcoes,'-w','start'],{windowsHide:true,stdio:'ignore',timeout:20000});
  } catch(erro) {
    if(fs.existsSync(path.join(dados,'postmaster.pid'))){
      try { execFileSync(path.join(bin,executavel('pg_ctl')),['-D',dados,'-m','fast','-w','stop'],{windowsHide:true,stdio:'ignore',timeout:20000}); }
      catch(falha) { erro.message+='; conferir encerramento do cluster de ensaio em '+pasta+': '+falha.message; }
    }
    throw erro;
  }
  const conexoes=[];
  function conectar(banco='postgres',nome='edr-ensaio'){const s=new Sessao(bin,porta,banco,nome);conexoes.push(s);return s}
  async function parar(){
    for(const s of conexoes){if(s.pendente)s.destruir();else if(!s.encerrada)await s.fechar()}
    execFileSync(path.join(bin,executavel('pg_ctl')),['-D',dados,'-m','fast','-w','stop'],{windowsHide:true,stdio:'pipe',timeout:20000});
  }
  return{...config,conectar,parar};
}
module.exports={iniciar};
