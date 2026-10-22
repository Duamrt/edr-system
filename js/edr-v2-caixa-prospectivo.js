// Caixa prospectivo: abertura declarada + movimentos efetivos persistidos por RPC.
// O estado abaixo é somente cache de leitura; nunca é uma fonte operacional de saldo.
let _cpEstado = null;
let _cpEstadoAtor = null;
let _cpErro = '';
let _cpFormulario = null;
let _cpEnviando = false;
let _cpLeitura = 0;
let _cpConsultaPendente = null;
let _cpPrevisoesAvulsas = null;
let _cpPrevisoesLeitura = 0;
let _cpConferindoPagamento = false;
let _cpPagamentoConsulta = null;
let _cpUltimoRecibo = null;
function _cpInvalidarLeitura() {
  ++_cpLeitura; ++_cpPrevisoesLeitura; _cpPrevisoesAvulsas=null; _cpConsultaPendente=null; _cpEstado=null; _cpEstadoAtor=null;
}
const _cpFuso = 'America/Sao_Paulo';
// Journal de intenção para recuperar respostas incertas após reload.
// Guarda UUID/pedido, nunca saldo; a confirmação continua exclusiva do banco.
function _cpJournalKey() { return 'edr-caixa-pedido:' + _companyId; }
function _cpGuardarPendente(pedido, cancelamento = false) {
  const raw = JSON.stringify({company_id:_companyId,operacao:pedido.operacao,pedido:pedido.pedido,cancelamento,identificacao:pedido.identificacao});
  sessionStorage.setItem(_cpJournalKey(),raw);
  if (sessionStorage.getItem(_cpJournalKey())!==raw) throw new Error('Não foi possível guardar a chave de recuperação. Nenhum pedido enviado.');
}
function _cpLerPendente() {
  try {
    const j=JSON.parse(sessionStorage.getItem(_cpJournalKey())||'null');
    return j?.company_id===_companyId && /^[0-9a-f-]{36}$/i.test(j.operacao) && j.pedido && typeof j.pedido==='object' ? j : null;
  } catch (_) { return null; }
}
function _cpLimparPendente() { try { sessionStorage.removeItem(_cpJournalKey()); } catch (_) {} }

function _cpEhPagamento(f) { return !f?.cancelamento && f?.pedido?.action==='movimento' && f.pedido.tipo==='pagamento'; }
function _cpContextoPagamento(f) {
  return caixaProspectivoPodeOperar() && f.company_id===_companyId && f.ator===usuarioAtual;
}
// JSONB não conserva a ordem das chaves. Compare o pedido inteiro, sem depender dela.
function _cpPedidoCanonico(p) {
  if (Array.isArray(p)) return p.map(_cpPedidoCanonico);
  if (p && typeof p==='object') return Object.fromEntries(Object.keys(p).sort().map(k=>[k,_cpPedidoCanonico(p[k])]));
  return p;
}
function _cpMesmoPedido(a,b) { return JSON.stringify(_cpPedidoCanonico(a))===JSON.stringify(_cpPedidoCanonico(b)); }
function _cpPagamentoAindaPendente(f) {
  const j=_cpLerPendente();
  return _cpContextoPagamento(f) && j?.operacao===f.operacao && _cpMesmoPedido(j.pedido,f.pedido);
}
function _cpPagamentoTelas() {
  if (typeof renderContasPagar==='function') renderContasPagar();
  const el=document.getElementById('caixa-content');
  if (el) _cpDesenhar(el);
}
function caixaProspectivoPagamentoPainel() {
  if (!caixaProspectivoPodeOperar()) return '';
  const j=_cpLerPendente();
  const estilo='display:grid;gap:8px;font-size:13px;line-height:1.45;background:var(--card);border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:12px;width:100%;box-sizing:border-box;';
  if (_cpEhPagamento(j)) {
    const consulta=_cpPagamentoConsulta;
    const atual=consulta?.company_id===_companyId && consulta.ator===usuarioAtual && consulta.operacao===j.operacao;
    const ocupado=_cpEnviando || _cpConferindoPagamento;
    const identificacao=j.identificacao || {};
    return `<section style="${estilo}border-left:3px solid #f59e0b;" role="alert"><strong>Pagamento aguardando confirmação</strong>
      <p>${esc([identificacao.fornecedor,identificacao.nota_ref].filter(Boolean).join(' · ') || 'Conta vinculada à tentativa')} · ${_cpDinheiro(j.pedido.valor_centavos)} · ${esc(fmtData(j.pedido.data_efetiva))}</p>
      <p>${esc(atual ? consulta.mensagem : 'O resultado desta tentativa ainda precisa ser conferido. Consulte antes de registrar novamente.')}</p>
      <small style="overflow-wrap:anywhere;">Operação: ${esc(j.operacao)}</small>
      <button class="btn" onclick="caixaProspectivoConsultarPagamentoPendente()" ${ocupado?'disabled':''}>${ocupado?'Conferindo…':'Consultar resultado'}</button>
      ${atual && consulta.status==='ausente' && !ocupado ? '<p>A operação não foi localizada nesta consulta. Um reenvio mantém o mesmo identificador e os mesmos dados, mesmo que a resposta anterior ainda esteja a caminho.</p><button class="btn" onclick="caixaProspectivoReenviarPagamentoPendente()">Reenviar o mesmo registro</button>' : ''}
      </section>`;
  }
  const r=_cpUltimoRecibo;
  if (!r || !_cpContextoPagamento(r)) return '';
  return `<section style="${estilo}border-left:3px solid ${r.cancelado?'#f59e0b':'#22c55e'};" role="status" aria-label="Recibo do registro de pagamento">
    <strong>${r.cancelado?'Registro localizado — cancelado':'Pagamento registrado no sistema'}</strong>
    <p>${esc(r.fornecedor || 'Fornecedor não informado')}${r.nota_ref ? ' · NF / parcela: '+esc(r.nota_ref) : ''}${r.descricao ? '<br>'+esc(r.descricao) : ''}</p>
    <p>Valor pago: <strong>${_cpDinheiro(r.valor_centavos)}</strong> · Data efetiva: ${esc(fmtData(r.data_efetiva))}${r.hora_efetiva ? ' '+esc(r.hora_efetiva) : ''} (São Paulo)
    ${r.desconto_centavos || r.juros_centavos ? '<br>Desconto: '+_cpDinheiro(r.desconto_centavos)+' · Juros: '+_cpDinheiro(r.juros_centavos) : ''}</p>
    <p>${r.cancelado?'Este movimento foi cancelado. Consulte o histórico antes de registrar outro pagamento.':r.status_conta==='pago'?'Conta quitada na consulta.':'A conta não está quitada na consulta; este recibo identifica apenas o pagamento registrado.'}</p>
    <small style="overflow-wrap:anywhere;">Operação: ${esc(r.operacao)}</small>
    <details style="overflow-wrap:anywhere;"><summary>Identificadores do registro</summary><small>Movimento: ${esc(r.movimento_id)}<br>Conta: ${esc(r.conta_pagar_id)}</small></details>
    <p>Confirma o registro no EDR. Não é comprovante de transferência bancária.</p></section>`;
}

// Consulta somente SELECT, pelas permissões e pelo filtro de empresa já existentes em sbGet.
// Ausência nunca prova rollback: somente a mesma chave pode ser reenviada depois da consulta.
async function _cpLerResultadoPagamento(f, resposta = null) {
  if (!_cpPagamentoAindaPendente(f)) return {status:'sessao'};
  const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
  if (!uuid.test(f.operacao) || !uuid.test(f.pedido.conta_pagar_id)) return {status:'divergente'};
  try {
    const ops=await sbGet('caixa_operacoes','?select=id,company_id,pedido,resultado&id=eq.'+encodeURIComponent(f.operacao),{throwOnError:true});
    if (!_cpPagamentoAindaPendente(f)) return {status:'sessao'};
    if (!Array.isArray(ops)) return {status:'indisponivel'};
    if (!ops.length) return {status:'ausente'};
    const op=ops[0], r=op.resultado;
    if (ops.length!==1 || op.company_id!==f.company_id || op.id!==f.operacao || !_cpMesmoPedido(op.pedido,f.pedido) ||
      r?.company_id!==f.company_id || r.operacao_id!==f.operacao || r.acao!=='movimento' || !uuid.test(r.movimento_id) ||
      (resposta && (resposta.movimento_id!==r.movimento_id || resposta.acao!==r.acao))) return {status:'divergente'};
    const [ms,cs]=await Promise.all([
      sbGet('caixa_movimentos','?select=id,company_id,operacao_id,tipo,conta_pagar_id,valor_centavos,desconto_centavos,juros_centavos,data_efetiva,hora_efetiva,origem_codigo,cancelado_em&id=eq.'+encodeURIComponent(r.movimento_id),{throwOnError:true}),
      sbGet('contas_pagar','?id=eq.'+encodeURIComponent(f.pedido.conta_pagar_id),{throwOnError:true})
    ]);
    if (!_cpPagamentoAindaPendente(f)) return {status:'sessao'};
    if (!Array.isArray(ms) || !Array.isArray(cs)) return {status:'indisponivel'};
    const m=ms[0], c=cs[0], p=f.pedido;
    if (ms.length!==1 || cs.length!==1 || m.company_id!==f.company_id || c.company_id!==f.company_id ||
      m.id!==r.movimento_id || m.operacao_id!==f.operacao || m.tipo!=='pagamento' || m.conta_pagar_id!==p.conta_pagar_id || c.id!==p.conta_pagar_id ||
      Number(m.valor_centavos)!==p.valor_centavos || Number(m.desconto_centavos || 0)!==Number(p.desconto_centavos || 0) ||
      Number(m.juros_centavos || 0)!==Number(p.juros_centavos || 0) || m.data_efetiva!==p.data_efetiva ||
      (m.hora_efetiva || '').slice(0,5)!==(p.hora_efetiva || '') || m.origem_codigo!==p.origem_codigo) return {status:'divergente'};
    return {status:'confirmado',conta:c,recibo:{company_id:f.company_id,ator:f.ator,operacao:f.operacao,
      movimento_id:m.id,conta_pagar_id:c.id,fornecedor:c.fornecedor,nota_ref:c.nota_ref,descricao:c.descricao,
      valor_centavos:Number(m.valor_centavos),desconto_centavos:Number(m.desconto_centavos || 0),juros_centavos:Number(m.juros_centavos || 0),
      data_efetiva:m.data_efetiva,hora_efetiva:(m.hora_efetiva || '').slice(0,5),cancelado:!!m.cancelado_em,status_conta:c.status}};
  } catch (_) { return {status:_cpContextoPagamento(f)?'indisponivel':'sessao'}; }
}
function _cpAvisarConsultaPagamento(f,status) {
  const mensagens={ausente:'Nenhum registro com esta operação foi localizado agora. Isso não confirma que a tentativa falhou.',
    divergente:'Os identificadores ou dados retornados não correspondem à tentativa. Não registre novamente; solicite conferência com o número da operação.',
    indisponivel:'Não foi possível confirmar o resultado. A tentativa foi preservada; consulte novamente quando a conexão estiver disponível.'};
  _cpPagamentoConsulta={company_id:f.company_id,ator:f.ator,operacao:f.operacao,status,mensagem:mensagens[status] || mensagens.indisponivel};
  const erro=document.getElementById('cp-erro');
  if (erro) erro.textContent=_cpPagamentoConsulta.mensagem;
  _cpPagamentoTelas();
}
async function _cpConcluirPagamento(f,resultado) {
  if (!_cpPagamentoAindaPendente(f)) return;
  _cpUltimoRecibo=resultado.recibo;
  _cpPagamentoConsulta=null;
  _cpFormulario=null;
  _cpLimparPendente();
  document.getElementById('cp-modal')?.remove();
  if (typeof contasPagar!=='undefined') contasPagar=contasPagar.map(c=>c.id===resultado.conta.id?resultado.conta:c);
  _cpInvalidarLeitura();
  showToast(resultado.recibo.cancelado?'Registro localizado, mas cancelado. Confira o recibo.':'Pagamento registrado no sistema. Confira o recibo.');
  _cpPagamentoTelas();
  await caixaProspectivoCarregar();
  if (_cpContextoPagamento(f)) _cpPagamentoTelas();
}
async function _cpResolverPagamentoPendente(reenviar) {
  if (_cpEnviando || _cpConferindoPagamento || !caixaProspectivoPodeOperar()) return;
  const j=_cpLerPendente();
  if (!_cpEhPagamento(j)) return;
  const f={...j,tipo:'pagamento',contaPagarId:j.pedido.conta_pagar_id,ator:usuarioAtual,incerto:true};
  _cpConferindoPagamento=true;
  _cpPagamentoTelas();
  const resultado=await _cpLerResultadoPagamento(f);
  _cpConferindoPagamento=false;
  if (!_cpPagamentoAindaPendente(f)) return;
  if (resultado.status==='confirmado') { await _cpConcluirPagamento(f,resultado); return; }
  _cpAvisarConsultaPagamento(f,resultado.status);
  if (!reenviar || resultado.status!=='ausente') return;
  // A ação explícita de reenvio consulta novamente e conserva UUID e pedido integral.
  _cpFormulario=f;
  await _cpEnviarFormulario(f);
}
async function caixaProspectivoConsultarPagamentoPendente() { await _cpResolverPagamentoPendente(false); }
async function caixaProspectivoReenviarPagamentoPendente() { await _cpResolverPagamentoPendente(true); }

function caixaProspectivoPodeOperar() {
  return typeof _companyId !== 'undefined' && !!_companyId &&
    typeof usuarioAtual !== 'undefined' && usuarioAtual?.perfil === 'admin';
}
function caixaProspectivoEstado() {
  return caixaProspectivoPodeOperar() && _cpEstadoAtor === usuarioAtual && _cpEstado?.company_id === _companyId ? _cpEstado : null;
}
function caixaProspectivoCentavos(valor) {
  if (!/^\d+(\.\d{1,2})?$/.test(String(valor))) throw new Error('Informe um valor com até duas casas decimais.');
  const [inteiro, fracao = ''] = String(valor).split('.');
  const cents = Number(inteiro) * 100 + Number(fracao.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents)) throw new Error('Valor fora do limite.');
  return cents;
}
function _cpDinheiro(cents) { return fmt(Number(cents) / 100); }
function _cpAgora() {
  const p = new Intl.DateTimeFormat('sv-SE', { timeZone: _cpFuso, year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
  const v = tipo => p.find(x => x.type === tipo).value;
  return `${v('year')}-${v('month')}-${v('day')}T${v('hour')}:${v('minute')}`;
}
function _cpMarco(conta) {
  const p = new Intl.DateTimeFormat('pt-BR', { timeZone: conta.fuso, dateStyle: 'short', timeStyle: 'short' });
  return p.format(new Date(conta.corte_em)) + ' · ' + conta.fuso;
}
async function caixaProspectivoCarregar() {
  const tenant = typeof _companyId !== 'undefined' ? _companyId : null;
  if (!caixaProspectivoPodeOperar()) {
    _cpInvalidarLeitura();
    _cpErro='Controle de saldo disponível para administradores da empresa.';
    return null;
  }
  const ator=usuarioAtual;
  if (_cpConsultaPendente?.tenant === tenant && _cpConsultaPendente.ator===ator && _cpConsultaPendente.perfil===ator.perfil) return _cpConsultaPendente.promise;
  const pendente={tenant,ator,perfil:ator.perfil,promise:null};
  pendente.promise=_cpCarregarBanco();
  _cpConsultaPendente=pendente;
  try {return await pendente.promise;}
  finally {if (_cpConsultaPendente===pendente) _cpConsultaPendente=null;}
}
async function _cpCarregarBanco() {
  const leitura = ++_cpLeitura;
  const tenant = typeof _companyId !== 'undefined' ? _companyId : null;
  const ator = typeof usuarioAtual !== 'undefined' ? usuarioAtual : null;
  _cpEstado = null;
  _cpEstadoAtor = null;
  _cpErro = '';
  if (!caixaProspectivoPodeOperar()) { _cpErro = 'Controle de saldo disponível para administradores da empresa.'; return null; }
  try {
    const r = await sbRpcEstoque('caixa_estado', {});
    if (leitura !== _cpLeitura || tenant !== _companyId || ator !== usuarioAtual || !caixaProspectivoPodeOperar()) return null;
    if (!r?.ok || r.dados?.company_id !== tenant || !Array.isArray(r.dados.contas) || !Array.isArray(r.dados.movimentos) || !Array.isArray(r.dados.pagamentos)) {
      _cpErro = r?.ausente ? 'Controle prospectivo ainda não instalado no banco.' : 'Não foi possível consultar o saldo persistido. Recarregue.';
      return null;
    }
    _cpEstado = r.dados;
    _cpEstadoAtor = ator;
    return _cpEstado;
  } catch (_) {
    if (leitura === _cpLeitura) _cpErro = 'Não foi possível consultar o saldo persistido. Recarregue.';
    return null;
  }
}
function caixaProspectivoRestante(conta) {
  const p = caixaProspectivoEstado()?.pagamentos.find(x => x.conta_pagar_id === conta.id);
  return p ? Number(p.restante_centavos) / 100 : Number(conta.valor || 0);
}
function caixaProspectivoVinculada(id) {
  return !!caixaProspectivoEstado()?.movimentos.some(m => m.conta_pagar_id === id);
}
async function caixaProspectivoPodeAlterarConta(id) {
  const e = await caixaProspectivoCarregar();
  if (!e) { showToast('Não foi possível conferir os pagamentos persistidos. Recarregue antes de alterar a obrigação.'); return false; }
  if (e.movimentos.some(m => m.conta_pagar_id === id)) { showToast('Conta vinculada ao controle prospectivo. Preserve a obrigação e consulte os movimentos.'); return false; }
  return true;
}
function _cpCampo(id, label, input) {
  return `<label style="display:grid;gap:5px;font-size:12px;">${label}${input.replace('<input ', `<input id="${id}" `).replace('<select ', `<select id="${id}" `)}</label>`;
}
const _cpEstiloCampo = 'style="width:100%;padding:9px;border:1px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text-primary);font:inherit;box-sizing:border-box;"';
function _cpOrigem(m) { return m.origem_codigo === 'banco' ? 'C6 PJ' : m.origem_codigo === 'dinheiro' ? 'Dinheiro no escritório' : ''; }
function _cpDescricaoMovimento(m) {
  if (m?.descricao || m?.tipo !== 'pagamento') return m?.descricao || '';
  const conta = (typeof contasPagar !== 'undefined' ? contasPagar : []).find(c => c.id === m.conta_pagar_id);
  return [conta?.fornecedor, conta?.nota_ref].filter(Boolean).join(' — ') || conta?.descricao || 'Conta a pagar vinculada';
}
function _cpConciliacaoCampo() {
  return _cpCampo('cp-decisao', 'Este pagamento já está incluído no saldo de abertura?', '<select required '+_cpEstiloCampo+'><option value="">Selecione após conferir o saldo</option><option value="incluido_abertura">Sim, já está incluído — não descontar novamente</option><option value="apos_corte">Não, ocorreu após a abertura — descontar uma vez</option></select>');
}
function _cpFormularioHtml() {
  const f = _cpFormulario;
  if (!f) return '';
  const contas = caixaProspectivoEstado()?.contas || [];
  const options = contas.map(c => `<option value="${esc(c.id)}">${esc(c.nome)}</option>`).join('');
  let campos;
  if (f.tipo === 'conciliar') {
    const m = caixaProspectivoEstado()?.movimentos.find(x => x.id === f.contaPagarId);
    const conta = contas.find(c => c.codigo === m?.origem_codigo);
    campos = '<p>'+esc(_cpDescricaoMovimento(m))+' - '+_cpDinheiro(m?.valor_centavos)+'<br>'+esc(_cpOrigem(m || {}))+' · '+fmtData(m?.data_efetiva)+' '+esc(m?.hora_efetiva || 'sem horário')+'<br>Abertura: '+(conta ? esc(_cpMarco(conta)) : 'indisponível')+'</p>' + _cpConciliacaoCampo() + '<p>Se ainda não souber, cancele e mantenha a conciliação pendente.</p>';
  } else if (f.tipo === 'abertura') {
    campos = _cpCampo('cp-corte', 'Data e horário do saldo informado (São Paulo)', `<input type="datetime-local" required ${_cpEstiloCampo}>`) +
      _cpCampo('cp-banco', 'Saldo informado C6 PJ (R$)', `<input type="number" min="0" step="0.01" required ${_cpEstiloCampo}>`) +
      _cpCampo('cp-dinheiro', 'Saldo informado dinheiro no escritório (R$)', `<input type="number" min="0" step="0.01" required ${_cpEstiloCampo}>`) +
      '<p style="font-size:12px;color:var(--text-secondary);">Informe a foto de saldo no marco. A abertura não é receita nem conciliação. Depois de salva, não pode ser substituída nesta tela. Pagamentos pendentes serão preservados: confira cada um nos movimentos antes de descontar qualquer valor.</p>';
  } else {
    campos = _cpCampo('cp-conta', 'Conta de origem / conta movimentada', `<select ${_cpEstiloCampo}>${options}</select>`);
    if (f.tipo === 'pagamento' && !contas.length) campos = _cpCampo('cp-origem', 'De onde saiu o dinheiro?', '<select required '+_cpEstiloCampo+'><option value="">Selecione a origem</option><option value="banco">C6 PJ</option><option value="dinheiro">Dinheiro no escritório</option></select>') + '<p role="status">Pagamento será registrado com conciliação pendente. O saldo disponível só poderá ser conferido após a abertura.</p>';
    if (f.tipo === 'transferencia') campos += _cpCampo('cp-destino', 'Conta de destino', `<select ${_cpEstiloCampo}>${options}</select>`) +
      '<p style="font-size:12px;">Transferência mantém o total. Registre tarifa como saída separada.</p>';
    if (f.tipo === 'pagamento') {
      const c = (typeof contasPagar !== 'undefined' ? contasPagar : []).find(x => x.id === f.contaPagarId);
      campos += `<p id="cp-obrigacao">${esc(c?.descricao || c?.fornecedor || 'Conta a pagar')} · restante ${_cpDinheiro(Math.round(caixaProspectivoRestante(c || {}) * 100))}</p>`;
      if (c?.obra_id && !c.nota_id && !c.nota_ref) campos += '<label style="font-size:12px;"><input id="cp-custo-confirmado" type="checkbox"> Confirmo que o custo desta conta já foi registrado na obra. Se ainda falta, registre-o em Custos antes de pagar. Este pagamento não lança custo.</label>';
    }
    campos += _cpCampo('cp-valor', 'Valor efetivamente movimentado (R$)', `<input type="number" min="0.01" step="0.01" required ${_cpEstiloCampo}>`) +
      _cpCampo('cp-data', 'Data efetiva (São Paulo)', `<input type="date" required ${_cpEstiloCampo}>`) +
      _cpCampo('cp-hora', 'Horário efetivo, se conhecido (São Paulo)', `<input type="time" ${_cpEstiloCampo}>`) +
      _cpCampo('cp-decisao', 'Sem horário no dia do corte: posição em relação à abertura', `<select ${_cpEstiloCampo}><option value="">Selecione se a data for o dia do corte</option><option value="incluido_abertura">Já incluído no saldo de abertura</option><option value="apos_corte">Ocorreu após o marco de abertura</option></select>`) +
      (f.tipo === 'pagamento'
        ? '<details><summary>Adicionar observação</summary>' + _cpCampo('cp-descricao', 'Observação (opcional)', `<input type="text" maxlength="500" ${_cpEstiloCampo}>`) + '</details>'
        : _cpCampo('cp-descricao', 'Descrição / referência do comprovante', `<input type="text" maxlength="500" required ${_cpEstiloCampo}>`)) +
      '<p style="font-size:12px;color:var(--text-secondary);">Registre cada movimento uma vez. Custo, consumo e fechamento da folha não confirmam pagamento. Movimentos anteriores ou já incluídos na abertura não mudam o saldo.</p>';
  }
  if (f.tipo === 'pagamento') {
    campos += '<details><summary>Houve desconto ou juros?</summary>' +
      _cpCampo('cp-desconto', 'Desconto concedido neste pagamento (R$)', '<input type="number" min="0" step="0.01" value="0" '+_cpEstiloCampo+'>') +
      _cpCampo('cp-juros', 'Juros / multa incluídos no valor pago (R$)', '<input type="number" min="0" step="0.01" value="0" '+_cpEstiloCampo+'>') +
      '<p>Abatimento da conta = valor pago + desconto − juros. O valor original será preservado.</p></details>' +
      '<label><input id="cp-pago-confirmado" type="checkbox" required> Confirmo que este pagamento já ocorreu. Este registro não faz transferência bancária.</label>';
    if (!contas.length) campos = campos.replace(/<label[^>]*>Sem horário no dia do corte:[\s\S]*?<\/label>/, '');
    else campos = campos.replace('Selecione se a data for o dia do corte', 'Não sei ainda — manter pendente no dia do corte');
  }
  return `<div id="cp-modal" class="modal-overlay active" role="dialog" aria-modal="true" aria-labelledby="cp-titulo">
    <div class="modal-box" style="max-width:520px;"><div class="modal-header"><span id="cp-titulo" class="modal-title">${esc({abertura:'Declarar abertura',entrada:'Entrada efetiva',saida:'Saída efetiva',transferencia:'Transferir entre contas',pagamento:'Confirmar pagamento ocorrido',conciliar:'Conferir pagamento com a abertura'}[f.tipo])}</span></div>
    <form onsubmit="event.preventDefault();caixaProspectivoSalvar()"><div class="modal-body" style="display:grid;gap:12px;">${campos}<p id="cp-erro" role="alert" style="color:var(--error);font-size:12px;"></p></div>
    <div class="modal-footer"><button type="button" class="btn" id="cp-cancelar" onclick="caixaProspectivoCancelarFormulario()">Cancelar</button><button class="btn btn-primary" id="cp-salvar" type="submit">Salvar</button></div></form></div></div>`;
}
function _cpDesenhar(el) {
  const e = caixaProspectivoEstado();
  const card = 'background:var(--card);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:14px;';
  if (!e) {
    el.innerHTML = caixaProspectivoPagamentoPainel()+`<div style="${card}" role="alert">${esc(_cpErro || 'Saldo indisponível.')} <button class="btn" onclick="renderCaixa()">Recarregar</button></div>`;
    return;
  }
  let html = `<div style="${card}"><h3 style="margin:0 0 8px;font-size:15px;">Banco e dinheiro · controle prospectivo</h3><p style="font-size:12px;color:var(--text-secondary);">Saldo informado no marco + movimentos efetivos posteriores. Obrigações a pagar ficam separadas do disponível.</p><p style="font-size:12px;color:var(--text-secondary);">O recebimento pelo Plano da entrada já registra o movimento na conta escolhida. Confira os movimentos e preserve esse registro. Para recebimentos fora do plano, informe a conta aqui; cadastros antigos não são importados automaticamente.</p>`;
  html=caixaProspectivoPagamentoPainel()+html;
  if (_cpLerPendente() && !_cpEhPagamento(_cpLerPendente())) html += '<p role="alert">Há um pedido pendente de confirmação. Confira antes de registrar outro movimento.</p><button class="btn" onclick="caixaProspectivoConferirPendente()">Conferir pedido pendente</button>';
  if (!e.contas.length) {
    html += '<p>Declare a abertura para iniciar o controle. O saldo manual antigo será preservado.</p><button class="btn btn-primary" onclick="caixaProspectivoAbrir(\'abertura\')">Declarar abertura</button></div>';
  } else {
    html += `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;">${e.contas.map(c => `<div><div style="font-size:12px;">${esc(c.nome)}</div><strong style="font-size:24px;color:var(--primary);">${_cpDinheiro(c.saldo_centavos)}</strong><div style="font-size:11px;color:var(--text-secondary);">Abertura: ${_cpDinheiro(c.abertura_centavos)}<br>${esc(_cpMarco(c))}</div></div>`).join('')}<div><div>${e.movimentos.some(m => m.decisao_corte==='pendente' && !m.cancelado_em) ? 'SALDO ANTES DA CONCILIAÇÃO' : 'TOTAL DISPONÍVEL'}</div><strong style="font-size:24px;color:var(--primary);">${_cpDinheiro(e.total_centavos)}</strong></div></div>`;
    html += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:16px;">' + ['entrada','saida','transferencia'].map(tipo => `<button class="btn ${tipo==='entrada'?'btn-primary':''}" onclick="caixaProspectivoAbrir('${tipo}')">${{entrada:'Entrada',saida:'Saída',transferencia:'Transferência'}[tipo]}</button>`).join('') + '</div></div>';
  }
  const pendentes = e.movimentos.filter(m => m.decisao_corte === 'pendente' && !m.cancelado_em);
  if (pendentes.length) html += '<p role="status">'+pendentes.length+' pagamento(s) com conciliação pendente. '+(e.contas.length ? 'O saldo exibido ainda não considera esses pagamentos; confira se já estão incluídos na abertura.' : 'Saldo disponível ainda não declarado.')+'</p>';
  const obrigacoes = (typeof contasPagar !== 'undefined' ? contasPagar : []).filter(c => c.tipo !== 'reembolso_fornecedor' && !['pago','cancelado'].includes(c.status) && caixaProspectivoRestante(c) > 0);
  const pagar = obrigacoes.reduce((s,c) => s + Math.round(caixaProspectivoRestante(c)*100),0);
  html += `<div style="${card}"><h3 style="margin:0 0 8px;font-size:14px;">Obrigações a pagar · ${_cpDinheiro(pagar)}</h3><p style="font-size:12px;">Contas cadastradas ainda não quitadas. Folha a pagar e outras obrigações precisam estar cadastradas; lançar custo não altera o disponível.</p>${obrigacoes.map(c => `<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;padding:8px 0;border-top:1px solid var(--border);"><span>${esc(c.fornecedor || c.descricao)} · ${fmtData(c.data_vencimento)}</span><span>${fmt(caixaProspectivoRestante(c))} ${(e.contas.length || e.pagamento_sem_abertura) ? `<button class="btn" onclick="caixaProspectivoAbrir('pagamento','${esc(c.id)}')">Pagar</button>` : ''}</span></div>`).join('') || '<p>Nenhuma obrigação cadastrada pendente.</p>'}</div>`;
  const nomes = new Map(e.contas.map(c => [c.id,c.nome]));
  html += `<div style="${card}"><h3 style="font-size:14px;margin:0 0 8px;">Movimentos efetivos</h3>${e.movimentos.map(m => `<div style="border-top:1px solid var(--border);padding:10px 0;${m.cancelado_em?'opacity:.6;':''}"><div>${esc(_cpDescricaoMovimento(m))} · ${esc(m.tipo)} · ${_cpDinheiro(m.valor_centavos)}${m.desconto_centavos || m.juros_centavos ? ` (desconto ${_cpDinheiro(m.desconto_centavos || 0)}; juros ${_cpDinheiro(m.juros_centavos || 0)})` : ''}</div><div style="font-size:12px;color:var(--text-secondary);">${esc(nomes.get(m.conta_id)||_cpOrigem(m))} ${m.destino_id?' → '+esc(nomes.get(m.destino_id)||''):''} · ${fmtData(m.data_efetiva)} ${esc(m.hora_efetiva||'sem horário')} · ${m.cancelado_em?'Cancelado':m.decisao_corte==='pendente'?'Conciliação pendente':m.afeta_saldo?'Movimenta saldo':'Incluído na abertura'} ${!m.cancelado_em && m.decisao_corte==='pendente' && e.contas.length===2 ? `<button class="btn" onclick="caixaProspectivoAbrir('conciliar','${esc(m.id)}')">Conferir com abertura</button>` : ''} ${!m.cancelado_em ? `<button class="btn" onclick="caixaProspectivoCancelarMovimento('${esc(m.id)}')">Cancelar movimento</button>`:''}</div></div>`).join('') || '<p style="font-size:12px;">Nenhum movimento registrado.</p>'}</div>`;
  html += _cpPrevisoesHtml(card);
  el.innerHTML = html;
}
function _cpPrevisoesHtml(card) {
  const api = typeof EntradaPlanoProjecoes !== 'undefined' ? EntradaPlanoProjecoes : null;
  const previstas = api?.previstas(api.atual(), _companyId, _cpPrevisoesAvulsas);
  let html = `<div style="${card}"><h3 style="font-size:14px;margin:0 0 8px;">Entradas previstas</h3><p style="font-size:12px;">Parcelas aprovadas em aberto. Previsões não integram o saldo disponível. Avisos automáticos aguardam configuração.</p>`;
  if (!previstas || previstas.status !== 'confirmada' || !Array.isArray(_cpPrevisoesAvulsas)) {
    return html + '<p role="alert">Previsões não confirmadas nesta consulta. Recarregue para conferir os planos e as previsões avulsas.</p></div>';
  }
  const nomeObra = oid => typeof obras !== 'undefined' ? (obras.find(o => String(o.id) === String(oid))?.nome || 'Obra vinculada') : 'Obra vinculada';
  html += previstas.parcelas.map(p => `<div style="font-size:12px;padding:7px 0;border-top:1px solid var(--border);">${p.data_prevista ? fmtData(p.data_prevista) : 'Data aguardando definição'} · ${esc(nomeObra(p.obra_id))} · ${esc(p.descricao)} · ${_cpDinheiro(p.valor_centavos)}<br><small>Plano aprovado · revisão ${esc(p.revisao)} · ${esc(p.forma || 'Forma aguardando definição')}</small></div>`).join('');
  html += previstas.avulsas.map(p => `<div style="font-size:12px;padding:5px 0;">${p.data_prevista ? fmtData(p.data_prevista) : 'Data aguardando definição'} · ${esc(p.descricao || p.tipo)} · ${fmt(p.valor)} <small>Previsão avulsa</small></div>`).join('');
  html += previstas.conciliacao.map(p => `<p role="alert" style="font-size:12px;">${esc(nomeObra(p.obra_id))}: há recebimento de entrada aguardando vínculo ao plano. Saldo pela entrada registrada: ${_cpDinheiro(p.saldo_centavos)}. Parcelas previstas e avisos aguardam conciliação.</p>`).join('');
  if (previstas.substituidas.length) html += `<p style="font-size:12px;">${previstas.substituidas.length} previsão(ões) avulsa(s) de entrada preservada(s) no cadastro e substituída(s) aqui pelo plano aprovado da mesma obra.</p>`;
  if (!previstas.parcelas.length && !previstas.avulsas.length && !previstas.conciliacao.length) html += '<p style="font-size:12px;">Nenhuma entrada prevista confirmada em aberto.</p>';
  return html + '<button class="btn" onclick="abrirModalProjecao(null)">Adicionar previsão avulsa</button></div>';
}
async function caixaProspectivoRender(el) {
  const leituraPrevisoes = ++_cpPrevisoesLeitura;
  const tenantPrevisoes = _companyId, atorPrevisoes = usuarioAtual;
  _cpPrevisoesAvulsas = null;
  el.innerHTML = '<p role="status">Consultando saldo persistido…</p>';
  const e = await caixaProspectivoCarregar();
  if (!e) { _cpDesenhar(el); return; }
  await Promise.all([
    (async () => {
      try {
        const ps = await sbGet('projecoes_caixa', '?order=data_prevista', {throwOnError:true});
        if (leituraPrevisoes !== _cpPrevisoesLeitura || tenantPrevisoes !== _companyId || atorPrevisoes !== usuarioAtual) return;
        if (!Array.isArray(ps) || ps.some(p => p.company_id !== tenantPrevisoes)) throw new Error();
        _cpPrevisoesAvulsas = ps;
      } catch (_) { /* Indisponível continua desconhecido; não vira lista vazia. */ }
    })(),
    (async () => {
      if (typeof EntradaPlanoProjecoes !== 'undefined') await EntradaPlanoProjecoes.carregar();
    })()
  ]);
  if (leituraPrevisoes !== _cpPrevisoesLeitura || tenantPrevisoes !== _companyId || atorPrevisoes !== usuarioAtual) return;
  if (e) {
    try {
      const consulta = _loadContasPagar(), leituraContas = _contasLeitura;
      const carregou = await consulta;
      if (leituraContas !== _contasLeitura || e.company_id !== _companyId || leituraPrevisoes !== _cpPrevisoesLeitura || atorPrevisoes !== usuarioAtual) return;
      // Outra leitura assumiu o cache; não a substitua nem invalide seu estado.
      if (carregou === null) return;
      if (carregou !== true) throw new Error();
    } catch (_) {
      if (leituraPrevisoes !== _cpPrevisoesLeitura || tenantPrevisoes !== _companyId || atorPrevisoes !== usuarioAtual) return;
      _cpEstado = null;
      _cpErro = 'Não foi possível consultar as obrigações persistidas. Recarregue.';
    }
  }
  if (leituraPrevisoes !== _cpPrevisoesLeitura || tenantPrevisoes !== _companyId || atorPrevisoes !== usuarioAtual) return;
  _cpDesenhar(el);
}
async function caixaProspectivoAbrir(tipo, contaPagarId = null) {
  if (_cpEnviando || _cpConferindoPagamento || _cpFormulario?.incerto || _cpCancelamento || _cpLerPendente()) { showToast('Confira o pedido pendente antes de iniciar outro.'); return; }
  if (!caixaProspectivoPodeOperar()) { showToast('Ação disponível para administradores.'); return; }
  const ator = usuarioAtual;
  if (!['abertura','entrada','saida','transferencia','pagamento','conciliar'].includes(tipo)) return;
  const e = await caixaProspectivoCarregar();
  if (!caixaProspectivoPodeOperar() || ator !== usuarioAtual) return;
  if (!e) { showToast(_cpErro); return; }
  if (['pagamento','conciliar'].includes(tipo) && !e.pagamento_sem_abertura) { showToast('Atualização de pagamentos ainda não instalada no banco. Solicite a atualização antes de registrar.'); return; }
  if (tipo === 'conciliar' && !e.movimentos.some(m => m.id === contaPagarId && m.decisao_corte === 'pendente' && !m.cancelado_em)) { showToast('Pagamento pendente indisponível. Recarregue.'); return; }
  if (tipo === 'abertura' ? e.contas.length > 0 : tipo === 'pagamento' ? ![0,2].includes(e.contas.length) : e.contas.length !== 2) { showToast(tipo==='abertura'?'Abertura já declarada.':'Declare a abertura primeiro.'); return; }
  if (tipo === 'pagamento') {
    try {
      const consulta = _loadContasPagar(), leituraContas = _contasLeitura;
      const carregou = await consulta;
      if (leituraContas !== _contasLeitura || e.company_id !== _companyId || ator !== usuarioAtual || !caixaProspectivoPodeOperar()) return;
      if (carregou === null) return;
      if (carregou !== true) throw new Error();
    } catch (_) { showToast('Não foi possível consultar a obrigação persistida. Recarregue.'); return; }
    const c = (typeof contasPagar !== 'undefined' ? contasPagar : []).find(x => x.id === contaPagarId);
    if (!c || ['pago','cancelado'].includes(c.status) || c.tipo==='reembolso_fornecedor') { showToast('Conta indisponível para pagamento. Recarregue.'); return; }
  }
  document.getElementById('cp-modal')?.remove();
  _cpFormulario = {tipo,contaPagarId,company_id:_companyId,ator:usuarioAtual,pedido:null,operacao:null,incerto:false};
  if (tipo==='pagamento') {
    const c=contasPagar.find(x=>x.id===contaPagarId);
    _cpFormulario.identificacao={fornecedor:c.fornecedor,nota_ref:c.nota_ref};
  }
  document.body.insertAdjacentHTML('beforeend',_cpFormularioHtml());
  const agora = _cpAgora();
  if (tipo==='abertura') document.getElementById('cp-corte').value = agora;
  else if (tipo !== 'conciliar') {
    document.getElementById('cp-data').value = agora.slice(0,10);
    if (tipo==='transferencia') document.getElementById('cp-destino').value = e.contas[1].id;
  }
  document.getElementById(tipo==='abertura'?'cp-corte':tipo==='conciliar'?'cp-decisao':'cp-valor')?.focus();
}
function caixaProspectivoCancelarFormulario() {
  if (!_cpEnviando && !_cpConferindoPagamento && _cpFormulario?.tipo==='pagamento' && _cpFormulario.incerto) {
    _cpFormulario=null;
    document.getElementById('cp-modal')?.remove();
    _cpPagamentoTelas();
    return;
  }
  if (_cpEnviando || _cpFormulario?.incerto) { showToast('Resultado pendente. Reenvie o mesmo pedido para conferir.'); return; }
  _cpFormulario = null;
  document.getElementById('cp-modal')?.remove();
}
function _cpPedido() {
  const valor = id => document.getElementById(id)?.value || '';
  const e = caixaProspectivoEstado();
  if (_cpFormulario.tipo==='conciliar') {
    if (!['incluido_abertura','apos_corte'].includes(valor('cp-decisao'))) throw new Error('Confira se o pagamento já está incluído na abertura.');
    return {action:'conciliar',movimento_id:_cpFormulario.contaPagarId,decisao_corte:valor('cp-decisao')};
  }
  if (_cpFormulario.tipo==='pagamento') {
    if (!document.getElementById('cp-pago-confirmado')?.checked) throw new Error('Confirme que o pagamento já ocorreu.');
    if (!e.contas.length && !['banco','dinheiro'].includes(valor('cp-origem'))) throw new Error('Informe de onde saiu o dinheiro.');
  }
  if (_cpFormulario.tipo==='abertura') {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(valor('cp-corte'))) throw new Error('Informe data e horário do marco.');
    return {action:'abertura',corte_local:valor('cp-corte'),fuso:_cpFuso,contas:[
      {codigo:'banco',nome:'C6 PJ',saldo_centavos:caixaProspectivoCentavos(valor('cp-banco'))},
      {codigo:'dinheiro',nome:'Dinheiro no escritório',saldo_centavos:caixaProspectivoCentavos(valor('cp-dinheiro'))}]};
  }
  const p = {action:'movimento',tipo:_cpFormulario.tipo,conta_id:valor('cp-conta')||null,
    ...(_cpFormulario.tipo==='pagamento' ? {pagamento_confirmado:true,origem_codigo:e.contas.find(c=>c.id===valor('cp-conta'))?.codigo || valor('cp-origem'),desconto_centavos:caixaProspectivoCentavos(valor('cp-desconto')||'0'),juros_centavos:caixaProspectivoCentavos(valor('cp-juros')||'0')} : {}),destino_id:valor('cp-destino')||null,
    valor_centavos:caixaProspectivoCentavos(valor('cp-valor')),data_efetiva:valor('cp-data'),hora_efetiva:valor('cp-hora')||null,
    decisao_corte:valor('cp-decisao')||null,descricao:valor('cp-descricao').trim(),conta_pagar_id:_cpFormulario.contaPagarId};
  if (p.valor_centavos<=0 || !/^\d{4}-\d{2}-\d{2}$/.test(p.data_efetiva)) throw new Error('Informe valor e data efetiva.');
  if (p.tipo!=='pagamento' && !p.descricao) throw new Error('Informe a descrição.');
  if (p.descricao.length>500) throw new Error('Descrição ou observação deve ter até 500 caracteres.');
  if (document.getElementById('cp-custo-confirmado') && !document.getElementById('cp-custo-confirmado').checked) throw new Error('Registre o custo na obra e confirme antes do pagamento.');
  if (document.getElementById('cp-custo-confirmado')) p.custo_confirmado = true;
  if (p.tipo==='transferencia' && p.conta_id===p.destino_id) throw new Error('Selecione duas contas diferentes.');
  const conta = e?.contas.find(c => c.id===p.conta_id);
  const diaCorte = conta && new Intl.DateTimeFormat('sv-SE',{timeZone:conta.fuso,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(conta.corte_em));
  if (p.tipo!=='pagamento' && !p.hora_efetiva && p.data_efetiva===diaCorte && !p.decisao_corte) throw new Error('No dia do corte sem horário, indique se já estava incluído na abertura.');
  if (p.hora_efetiva || p.data_efetiva !== diaCorte) p.decisao_corte = null;
  return p;
}
function _cpCongelar(congelar) {
  document.querySelectorAll('#cp-modal input,#cp-modal select').forEach(el => {el.disabled=congelar;});
  const cancelar = document.getElementById('cp-cancelar');
  if (cancelar) cancelar.disabled = congelar;
}
async function caixaProspectivoSalvar() {
  if (_cpEnviando || _cpConferindoPagamento || !_cpFormulario) return;
  if (!caixaProspectivoPodeOperar() || _cpFormulario.company_id!==_companyId || _cpFormulario.ator!==usuarioAtual) { showToast('Sessão mudou. Recarregue antes de salvar.'); return; }
  const f = _cpFormulario;
  if (f.tipo==='pagamento' && f.incerto) { await caixaProspectivoConsultarPagamentoPendente(); return; }
  const erro = document.getElementById('cp-erro');
  try {
    if (!f.incerto) { f.pedido=_cpPedido(); f.operacao=crypto.randomUUID(); }
    _cpGuardarPendente(f);
  } catch (e) { if (erro) erro.textContent=e.message; return; }
  if (f.tipo==='pagamento') { _cpUltimoRecibo=null; _cpPagamentoConsulta=null; }
  await _cpEnviarFormulario(f);
}
async function _cpEnviarFormulario(f) {
  if (_cpEnviando || _cpConferindoPagamento || !_cpContextoPagamento(f) || !_cpPagamentoAindaPendente(f)) return;
  const erro = document.getElementById('cp-erro');
  _cpEnviando=true;
  if (f.tipo==='pagamento') { _cpPagamentoConsulta=null; _cpPagamentoTelas(); }
  _cpCongelar(true);
  const botao=document.getElementById('cp-salvar');
  if (botao) botao.disabled=true;
  let r;
  try { r=await sbRpcEstoque('caixa_registrar',{p_operacao:f.operacao,p_pedido:f.pedido}); }
  catch (_) { r={ok:false,incerto:true,mensagem:f.tipo==='pagamento'?'Conexão interrompida. Consulte o resultado antes de reenviar.':'Conexão interrompida. Reenvie o mesmo pedido para conferir.'}; }
  if (r?.ok && f.tipo==='pagamento' && r.dados?.operacao_id===f.operacao && r.dados?.company_id===f.company_id) {
    const resultado=await _cpLerResultadoPagamento(f,r.dados);
    if (resultado.status==='confirmado') {
      _cpEnviando=false;
      await _cpConcluirPagamento(f,resultado);
      return;
    }
    if (_cpContextoPagamento(f)) _cpAvisarConsultaPagamento(f,resultado.status);
    r={ok:false,incerto:true,mensagem:_cpPagamentoConsulta?.mensagem || 'Não foi possível conferir o registro. Consulte o resultado.'};
  }
  _cpEnviando=false;
  if (botao) botao.disabled=false;
  if (f.company_id!==_companyId || f.ator!==usuarioAtual || !caixaProspectivoPodeOperar()) { _cpFormulario=null; _cpEstado=null; document.getElementById('cp-modal')?.remove(); showToast('Sessão mudou. Confira o pedido na empresa de origem.'); return; }
  if (r?.ok && (r.dados?.operacao_id !== f.operacao || r.dados?.company_id !== f.company_id)) r={ok:false,incerto:true,mensagem:f.tipo==='pagamento'?'Resposta incompleta. Consulte o resultado antes de reenviar.':'Resposta incompleta. Reenvie o mesmo pedido para conferir.'};
  if (!r?.ok) {
    f.incerto=f.incerto || !!r?.incerto;
    if (!f.incerto) _cpLimparPendente();
    _cpCongelar(f.incerto);
    if (erro) erro.textContent=r?.ausente?'Controle prospectivo ainda não instalado.':r?.mensagem||'Falha ao persistir. Nenhum sucesso confirmado.';
    if (botao) botao.textContent=f.incerto?(f.tipo==='pagamento'?'Consultar resultado':'Conferir / reenviar mesmo pedido'):'Salvar';
    if (f.incerto && f.tipo==='pagamento') {
      const cancelar=document.getElementById('cp-cancelar');
      if (cancelar) { cancelar.disabled=false; cancelar.textContent='Voltar à lista'; }
      _cpPagamentoTelas();
    }
    return;
  }
  _cpFormulario=null;
  _cpLimparPendente();
  document.getElementById('cp-modal')?.remove();
  _cpInvalidarLeitura();
  showToast('Registro persistido.');
  if (typeof _loadContasPagar==='function') await _loadContasPagar();
  if (typeof renderCaixa==='function') await renderCaixa();
  if (typeof renderContasPagar==='function') renderContasPagar();
}
let _cpCancelamento=null;
async function caixaProspectivoCancelarMovimento(id) {
  if (_cpEnviando || _cpConferindoPagamento || !caixaProspectivoPodeOperar()) return;
  if (_cpFormulario || (_cpCancelamento && _cpCancelamento.id!==id)) { showToast('Confira o pedido pendente antes de cancelar outro movimento.'); return; }
  if (!_cpCancelamento) {
    const m=caixaProspectivoEstado()?.movimentos.find(x=>x.id===id && !x.cancelado_em);
    if (!m) return;
    if (_cpLerPendente()) { showToast('Confira o pedido pendente antes de cancelar.'); return; }
    const motivo=prompt('Motivo do cancelamento (o registro será preservado para auditoria):');
    if (!motivo?.trim()) return;
    _cpCancelamento={id,company_id:_companyId,ator:usuarioAtual,incerto:false,operacao:crypto.randomUUID(),pedido:{action:'cancelar',movimento_id:id,motivo:motivo.trim()}};
  }
  const f=_cpCancelamento;
  if (f.company_id!==_companyId || f.ator!==usuarioAtual) { showToast('Sessão mudou. Recarregue.'); return; }
  try { _cpGuardarPendente(f,true); } catch (_) { _cpCancelamento=null; showToast('Não foi possível guardar a chave de recuperação. Nenhum pedido enviado.'); return; }
  _cpEnviando=true;
  let r;
  try { r=await sbRpcEstoque('caixa_registrar',{p_operacao:f.operacao,p_pedido:f.pedido}); }
  catch (_) { r={ok:false,incerto:true}; }
  _cpEnviando=false;
  if (f.company_id!==_companyId || f.ator!==usuarioAtual || !caixaProspectivoPodeOperar()) { _cpCancelamento=null; _cpEstado=null; showToast('Sessão mudou. Confira o pedido na empresa de origem.'); return; }
  if (r?.ok && (r.dados?.operacao_id !== f.operacao || r.dados?.company_id !== f.company_id)) r={ok:false,incerto:true};
  if (!r?.ok) {
    f.incerto=f.incerto || !!r?.incerto;
    if (!f.incerto) { _cpCancelamento=null; _cpLimparPendente(); }
    showToast(f.incerto?'Resultado incerto. Use o mesmo botão para conferir o cancelamento.':r?.mensagem||'Falha ao cancelar.');
    return;
  }
  _cpCancelamento=null;
  _cpLimparPendente();
  _cpInvalidarLeitura();
  showToast('Cancelamento persistido.');
  if (typeof _loadContasPagar==='function') await _loadContasPagar();
  await renderCaixa();
  if (typeof renderContasPagar==='function') renderContasPagar();
}
async function caixaProspectivoConferirPendente() {
  if (_cpEnviando || _cpConferindoPagamento || !caixaProspectivoPodeOperar()) return;
  const j=_cpLerPendente();
  if (!j) return;
  if (_cpEhPagamento(j)) { await caixaProspectivoConsultarPagamentoPendente(); return; }
  if (j.cancelamento) {
    _cpCancelamento={...j,id:j.pedido.movimento_id,ator:usuarioAtual,incerto:true};
    await caixaProspectivoCancelarMovimento(_cpCancelamento.id);
    return;
  }
  _cpFormulario={...j,tipo:['abertura','conciliar'].includes(j.pedido.action)?j.pedido.action:j.pedido.tipo,contaPagarId:j.pedido.conta_pagar_id || j.pedido.movimento_id,ator:usuarioAtual,incerto:true};
  document.getElementById('cp-modal')?.remove();
  document.body.insertAdjacentHTML('beforeend',_cpFormularioHtml());
  document.getElementById('cp-erro').textContent='Conferindo o pedido anterior com a mesma chave.';
  await caixaProspectivoSalvar();
}
