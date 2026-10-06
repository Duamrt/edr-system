'use strict';
// Preparacao da contingencia frontend APENAS em copia local. Nao publica nada.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {createHash}=require('node:crypto'),{execFileSync}=require('node:child_process');
const raiz=path.resolve(__dirname,'../..');
const alvo='js/edr-v2-caixa-prospectivo.js';
const artefatos=path.join(raiz,'docs/recuperacao-caixa');
const arquivoPatch=path.join(artefatos,'caixa-suspender-mutacoes.patch');
const arquivoManifesto=path.join(artefatos,'caixa-suspender-mutacoes.json');
const normalizar=s=>s.replace(/\r\n/g,'\n');
const hash=s=>createHash('sha256').update(s).digest('hex');
function trocarUnico(s,de,para){
  if(s.split(de).length!==2)throw Error('Contexto de contingencia mudou; revisar antes de gerar: '+de.slice(0,90));
  return s.replace(de,para);
}
function prepararFonte(original){
  let s=normalizar(original);
  const mensagem='Registros e reenvios do controle prospectivo estão temporariamente suspensos. Consultas e auditoria continuam disponíveis.';
  for(const assinatura of [
    'async function caixaProspectivoAbrir(tipo, contaPagarId = null) {',
    'async function caixaProspectivoSalvar() {',
    'async function caixaProspectivoCancelarMovimento(id) {',
    'async function caixaProspectivoConferirPendente() {'
  ])s=trocarUnico(s,assinatura,assinatura+'\n  // Contingencia revisada: esta copia suspende mutacoes, sem alterar o banco.\n  showToast('+JSON.stringify(mensagem)+'); return;');
  const marca='  const card = ';
  const inicio=s.indexOf(marca,s.indexOf('function _cpDesenhar('));
  if(inicio<0)throw Error('Card de leitura nao localizado');
  const fim=s.indexOf('\n',inicio);
  const card=s.slice(inicio,fim);
  s=trocarUnico(s,card,card+'\n  const aviso = `<div id="cp-contingencia-aviso" role="status" style="${card}"><strong>Contingência: consultas preservadas</strong><p style="margin:8px 0 0;font-size:12px;">Registros e reenvios do controle prospectivo estão temporariamente suspensos. Os pedidos pendentes serão preservados para conferência antes da retomada.</p></div>`;');
  s=trocarUnico(s,'    el.innerHTML = `<div style="${card}" role="alert">','    el.innerHTML = aviso + `<div style="${card}" role="alert">');
  s=trocarUnico(s,'  el.innerHTML = html;','  el.innerHTML = aviso + html;\n  el.querySelectorAll(\'button[onclick]\').forEach(botao => {\n    if (/^caixaProspectivo(Abrir|CancelarMovimento|ConferirPendente)\\(/.test(botao.getAttribute(\'onclick\') || \'\')) {\n      botao.disabled = true; botao.title = \'Controle prospectivo temporariamente suspenso.\';\n    }\n  });');
  return s;
}
function pastaTemporaria(){return fs.mkdtempSync(path.join(os.tmpdir(),'edr-caixa-contingencia-'));}
function gerar(){
  const base=normalizar(fs.readFileSync(path.join(raiz,alvo),'utf8')),contingencia=prepararFonte(base),tmp=pastaTemporaria();
  for(const [lado,conteudo] of [['a',base],['b',contingencia]]){
    const file=path.join(tmp,lado,alvo);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,conteudo);
  }
  let diff;try{diff=execFileSync('git',['diff','--no-index','--','a/'+alvo,'b/'+alvo],{cwd:tmp,encoding:'utf8',windowsHide:true});}
  catch(e){if(e.status!==1)throw e;diff=e.stdout;}
  diff=normalizar(diff).replace(/^diff --git a\/a\//gm,'diff --git a/').replace(/ b\/b\//g,' b/').replace(/^--- a\/a\//gm,'--- a/').replace(/^\+\+\+ b\/b\//gm,'+++ b/');
  fs.mkdirSync(artefatos,{recursive:true});fs.writeFileSync(arquivoPatch,diff);
  const manifesto={versao:1,alvo,normalizacao:'UTF-8; CRLF normalizado para LF antes dos hashes',base_sha256:hash(base),contingencia_sha256:hash(contingencia),patch_sha256:hash(diff),
    escopo:'Copia frontend separada: recusa novas mutacoes/reenvios do Caixa; conserva leitura, journal, guards de obrigacoes e alertas. Nao e bloqueio de banco ou de clientes antigos.'};
  fs.writeFileSync(arquivoManifesto,JSON.stringify(manifesto,null,2)+'\n');
  return{arquivoPatch,arquivoManifesto,manifesto,tmp};
}
function prepararCopia(){
  const manifesto=JSON.parse(fs.readFileSync(arquivoManifesto,'utf8'));
  const base=normalizar(fs.readFileSync(path.join(raiz,alvo),'utf8')),patch=normalizar(fs.readFileSync(arquivoPatch,'utf8'));
  if(manifesto.alvo!==alvo||hash(base)!==manifesto.base_sha256||hash(patch)!==manifesto.patch_sha256)throw Error('Base/patch de contingencia mudou. Revisar e regenerar; nao aplicar por suposicao.');
  const tmp=pastaTemporaria(),file=path.join(tmp,alvo);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,base);
  // O clone Windows pode converter o artefato para CRLF. Aplicar a mesma
  // representacao LF ja validada pelo manifesto, apenas dentro da copia de teste.
  const patchLocal=path.join(tmp,'caixa-suspender-mutacoes.patch');fs.writeFileSync(patchLocal,patch);
  execFileSync('git',['apply','--check',patchLocal],{cwd:tmp,windowsHide:true,stdio:'pipe'});
  execFileSync('git',['apply',patchLocal],{cwd:tmp,windowsHide:true,stdio:'pipe'});
  const source=normalizar(fs.readFileSync(file,'utf8'));
  if(hash(source)!==manifesto.contingencia_sha256)throw Error('Patch aplicado nao corresponde ao artefato revisado');
  return{tmp,source,manifesto,file,patchLocal};
}
module.exports={prepararCopia,gerar,arquivoPatch,arquivoManifesto};
if(require.main===module){
  if(process.argv[2]!=='--gerar')throw Error('Use --gerar apenas para preparar patch local revisavel. Nao aplica no frontend normal.');
  const r=gerar();console.log(JSON.stringify({patch:r.arquivoPatch,manifesto:r.arquivoManifesto,...r.manifesto},null,2));
}
