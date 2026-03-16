// ══════════════════════════════════════════
// INTEGRAÇÃO CLICKUP — EDR SYSTEM
// ══════════════════════════════════════════

const CLICKUP_ETAPAS = [
  '01 · LIMPEZA DO TERRENO','02 · GABARITO','03 · LOCAÇÃO',
  '04 · ESCAVAÇÃO DAS SAPATAS E ARRANQUES','05 · CONCRETAGEM DE SAPATAS E ARRANQUES',
  '06 · ESCAVAÇÃO DO BALDRAME','07 · EMBASAMENTO','08 · MONTAGEM DAS FERRAGENS DO BALDRAME',
  '09 · FORMA + ESGOTO (ÁREA DE SERVIÇO / COZINHA E BANHEIRO)',
  '10 · CONCRETAGEM DAS VIGAS BALDRAME','11 · REMOÇÃO DAS FORMAS',
  '12 · REGULARIZAÇÃO DO PISO','13 · AMARRAÇÃO DOS PILARES NOS ARRANQUES',
  '14 · 03 FIADAS DE ALVENARIA IMPERMEABILIZADA','15 · ALVENARIA ATÉ 8 FIADAS',
  '16 · PASSAGEM DE TUBOS E ELETRODUTOS ONDE COINCIDIR PILAR',
  '17 · CONCRETAGEM PRIMEIRO LANCE DE PILAR','18 · VERGAS E CONTRA VERGAS',
  '19 · CONFERIR NÍVEL ANTES DA ÚLTIMA FIADA',
  '20 · CONCRETAGEM 2º LANCE DE PILAR ATÉ FUNDO DE VIGA',
  '21 · MONTAGEM DAS FERRAGENS DAS VIGAS SUPERIORES','22 · FORMA DAS VIGAS SUPERIORES',
  '23 · PASSAGENS NAS VIGAS PARA OS ELETRODUTOS','24 · CONCRETAGEM DAS VIGAS SUPERIORES',
  '25 · CORTE DAS ALVENARIAS PARA ELÉTRICA E HIDRÁULICA',
  '26 · CHUMBAMENTO DOS ELETRODUTOS NAS PAREDES','27 · CHAPISCO ATÉ FUNDO DE VIGA',
  '28 · PISO EM CONCRETO','29 · MESTRAR PARA AJUSTAR AMBIENTE FORA DE ESQUADRO',
  '30 · INSTALAÇÕES HIDRÁULICAS (ÁGUA FRIA, BWC, COZINHA, A.S.)',
  '31 · MONTAGEM DA LAJE','32 · INSTALAÇÃO DAS GRADES DE PORTAS',
  '33 · ESCORAMENTO DA LAJE','34 · REBOCO INTERNO','35 · INSTALAÇÃO DAS CX 4X2',
  '36 · REBOCO EXTERNO','37 · ENQUADRAMENTO DAS JANELAS (CAPEAÇOS)',
  '38 · CONCRETAGEM DA LAJE','39 · ALVENARIA PLATIBANDA',
  '40 · ALVENARIA BASE DA CX D\u2019ÁGUA','41 · LAJE CX D\u2019ÁGUA',
  '42 · ESCORAMENTO DAS TELHAS EM ALVENARIA','43 · INSTALAÇÃO DA CALHA',
  '44 · INSTALAÇÃO DA CX D\u2019ÁGUA + LIGAÇÃO ÁGUA',
  '45 · INSTALAÇÃO DAS TELHAS DE FIBROCIMENTO','46 · APLICAÇÃO DOS RUFOS',
  '47 · REBOCO EXTERNO DA PLATIBANDA',
  '48 · RETIRADA DAS ESCORAS DA LAJE (MÍN 28 DIAS)',
  '49 · AUDALIO \u2014 TUBULAÇÕES DO TETO (1 DIA ANTES DA DESFORMA)',
  '50 · RENATO \u2014 GESSO LISO TETOS E PAREDES',
  '51 · PAGINAÇÃO E APLICAÇÃO DO PISO','52 · REVESTIMENTO PAREDES BANHEIRO',
  '53 · REVESTIMENTO PAREDES COZINHA','54 · REVESTIMENTO PAREDES ÁREA DE SERVIÇO',
  '55 · GRANITO DAS JANELAS','56 · GRANITO DA COZINHA E DOS BANHEIROS',
  '57 · JANELAS E PORTAS DE VIDRO','58 · PORTA SOCIAL E PORTÃO DE GARAGEM',
  '59 · AUDALIO \u2014 TODA PARTE ELÉTRICA','60 · VAGNER \u2014 PINTURA',
  '61 · INSTALAÇÃO DE LOUÇAS E METAIS','62 · LIMPEZA DA OBRA E ENTREGA'
];

// Cache da config pra não buscar toda hora
let _clickupConfig = null;

async function _getClickupConfig() {
  if (_clickupConfig) return _clickupConfig;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_clickup_config`, {
      method: 'POST', headers: getHdrs(), body: '{}'
    });
    _clickupConfig = await r.json();
    return _clickupConfig;
  } catch(e) { return null; }
}

// ── CRIAR obra no ClickUp ──
async function clickupCriarObra(nomeObra, obraId) {
  if (MODO_DEMO) return;
  try {
    const config = await _getClickupConfig();
    if (!config?.key || !config?.folder) return;

    // Criar List
    const listResp = await fetch(`https://api.clickup.com/api/v2/folder/${config.folder}/list`, {
      method: 'POST',
      headers: { 'Authorization': config.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nomeObra })
    });
    const list = await listResp.json();
    if (!list.id) return;

    // Salvar o clickup_list_id na obra do Supabase
    if (obraId) {
      await sbPatch('obras', `?id=eq.${obraId}`, { clickup_list_id: list.id });
      const obra = obras.find(o => o.id === obraId);
      if (obra) obra.clickup_list_id = list.id;
    }

    // Criar 62 etapas
    let criadas = 0;
    for (const etapa of CLICKUP_ETAPAS) {
      try {
        await fetch(`https://api.clickup.com/api/v2/list/${list.id}/task`, {
          method: 'POST',
          headers: { 'Authorization': config.key, 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: etapa, status: 'pendente' })
        });
        criadas++;
      } catch(e) {}
    }

    console.log(`[ClickUp] Obra "${nomeObra}" criada: ${criadas}/62 etapas (List: ${list.id})`);
    showToast(`📋 Obra criada no ClickUp com ${criadas} etapas!`);
  } catch(e) { console.log('Erro ClickUp criar:', e.message); }
}

// ── RENOMEAR obra no ClickUp ──
async function clickupRenomearObra(clickupListId, novoNome) {
  if (MODO_DEMO || !clickupListId) return;
  try {
    const config = await _getClickupConfig();
    if (!config?.key) return;

    await fetch(`https://api.clickup.com/api/v2/list/${clickupListId}`, {
      method: 'PUT',
      headers: { 'Authorization': config.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: novoNome })
    });
    console.log(`[ClickUp] Obra renomeada: ${novoNome}`);
  } catch(e) { console.log('Erro ClickUp renomear:', e.message); }
}

// ── ARQUIVAR obra no ClickUp ──
async function clickupArquivarObra(clickupListId) {
  if (MODO_DEMO || !clickupListId) return;
  try {
    const config = await _getClickupConfig();
    if (!config?.key) return;

    // ClickUp não tem "arquivar" por API, mas renomear com prefixo funciona
    const listResp = await fetch(`https://api.clickup.com/api/v2/list/${clickupListId}`, {
      headers: { 'Authorization': config.key }
    });
    const list = await listResp.json();
    const nome = list.name || '';
    if (!nome.startsWith('[ARQUIVADA]')) {
      await fetch(`https://api.clickup.com/api/v2/list/${clickupListId}`, {
        method: 'PUT',
        headers: { 'Authorization': config.key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `[ARQUIVADA] ${nome}` })
      });
    }
    console.log(`[ClickUp] Obra arquivada: ${nome}`);
  } catch(e) { console.log('Erro ClickUp arquivar:', e.message); }
}

// ── DELETAR obra no ClickUp ──
async function clickupDeletarObra(clickupListId) {
  if (MODO_DEMO || !clickupListId) return;
  try {
    const config = await _getClickupConfig();
    if (!config?.key) return;

    await fetch(`https://api.clickup.com/api/v2/list/${clickupListId}`, {
      method: 'DELETE',
      headers: { 'Authorization': config.key }
    });
    console.log(`[ClickUp] Obra deletada: ${clickupListId}`);
  } catch(e) { console.log('Erro ClickUp deletar:', e.message); }
}
