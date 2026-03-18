// ══════════════════════════════════════════
// SISTEMA DE AJUDA — Botão "?" em cada módulo
// ══════════════════════════════════════════

const AJUDA_CONTEUDO = {
  dashboard: {
    titulo: 'Resumo (Dashboard)',
    perfis: ['admin','operacional'],
    secoes: [
      { perfil: 'admin', titulo: 'Visao Admin', itens: [
        'Painel financeiro — receita total, custo total e saldo de todas as obras',
        'Grafico mensal — evolucao de entradas mes a mes',
        'Detalhe por obra — custos separados por etapa (centro de custo)',
        'Comparativo — variacao mes anterior vs atual'
      ]},
      { perfil: 'operacional', titulo: 'Visao Operacional', itens: [
        'Obras ativas — cards com obras em andamento e contagem de lancamentos',
        'Estoque — top 8 materiais disponiveis no almoxarifado',
        'Ultimos lancamentos — os 8 mais recentes',
        'Botoes rapidos — atalho para Lancar NF e Estoque'
      ]}
    ]
  },

  obras: {
    titulo: 'Obras',
    perfis: ['admin','operacional'],
    secoes: [
      { titulo: 'Visualizar obras', passos: [
        'As obras ativas aparecem em cards na tela principal',
        'Clique em um card para abrir o detalhe da obra',
        'Aba Materiais — lancamentos separados por etapa (centro de custo)',
        'Aba Adicionais — servicos extras contratados'
      ]},
      { titulo: 'Criar nova obra', passos: [
        'Clique no botao + NOVA OBRA',
        'Preencha: nome, proprietario e endereco',
        'Clique em SALVAR'
      ]},
      { titulo: 'Arquivar obra concluida', passos: [
        'Abra o detalhe da obra',
        'Clique em CONCLUIR OBRA',
        'O sistema gera o Termo de Entrega automaticamente',
        'A obra vai para a secao de arquivadas'
      ]},
      { titulo: 'Gerar Termo de Entrega', passos: [
        'No detalhe da obra, clique em GERAR TERMO',
        'Uma pagina abre com o termo pronto',
        'Use Ctrl+P para salvar como PDF ou imprimir'
      ]},
      { dica: 'Para ver obras arquivadas, ative o botao Mostrar Arquivadas.' }
    ]
  },

  estoque: {
    titulo: 'Estoque',
    perfis: ['admin','operacional'],
    secoes: [
      { titulo: 'Como funciona o saldo', info: 'Saldo = (Notas Fiscais + Entradas Diretas + Ajustes) - Distribuicoes para obras' },
      { titulo: 'Consultar saldo', passos: [
        'Os materiais aparecem em cards com o saldo atual',
        'Use a barra de busca para filtrar por nome',
        'Cards com saldo zerado ou negativo ficam sinalizados'
      ]},
      { titulo: 'Entrada Direta (material sem NF)', passos: [
        'Clique no botao 📥 ENTRADA na barra superior',
        'Escolha o destino: Estoque ou Direto na Obra',
        'Preencha: material, quantidade, unidade, preco, fornecedor',
        'Clique em SALVAR'
      ]},
      { alerta: 'Estoque = material fica guardado, voce distribui depois. Obra = vai direto pro custo da obra.' },
      { titulo: 'Saida de material (distribuir para obra)', passos: [
        'Clique no botao 📤 do card do material ou no botao SAIDA',
        'Selecione a obra destino',
        'Selecione a etapa (centro de custo)',
        'Informe a quantidade e confirme'
      ]},
      { dica: 'O sistema usa FIFO — primeiro que entrou, primeiro que sai. O custo e calculado automaticamente.' },
      { perfil: 'admin', titulo: 'Ajuste de estoque', passos: [
        'Clique no botao 📋 AJUSTE na barra superior',
        'Busque o material pelo nome',
        'Escolha o tipo: Inventario (material pre-existente), Contagem Fisica (diferenca real) ou Correcao (erro/perda)',
        'Informe a quantidade e o motivo',
        'Clique em SALVAR'
      ]},
      { perfil: 'admin', dica: 'Ajustes nao geram custo em obra. Servem apenas para corrigir o saldo.' }
    ]
  },

  notas: {
    titulo: 'Historico de Notas Fiscais',
    perfis: ['admin','operacional'],
    secoes: [
      { titulo: 'Consultar notas', passos: [
        'As notas aparecem em ordem cronologica (mais recente primeiro)',
        'Clique em uma nota para ver os itens detalhados',
        'Cada nota mostra: numero, data, fornecedor, CNPJ, itens, valores e credito fiscal'
      ]}
    ]
  },

  form: {
    titulo: 'Lancar Nota Fiscal',
    perfis: ['admin','operacional'],
    secoes: [
      { titulo: 'Lancamento manual', passos: [
        'Preencha o cabecalho: data, numero da NF, fornecedor, CNPJ',
        'Selecione a obra destino (EDR = estoque, nome da obra = custo direto)',
        'Adicione os itens: descricao, quantidade, unidade, preco',
        'Marque se cada item gera credito fiscal ou nao',
        'Preencha frete e imposto se houver',
        'Clique em SALVAR NOTA'
      ]},
      { dica: 'O sistema sugere materiais do catalogo conforme voce digita.' },
      { titulo: 'Importacao Rapida (copiar/colar)', passos: [
        'Clique em IMPORTAR',
        'Cole o texto da nota (separado por tab, ponto-e-virgula ou pipe)',
        'O sistema interpreta automaticamente e mostra um preview',
        'Revise, ajuste e clique em CONFIRMAR'
      ]},
      { titulo: 'Importacao XML (NF-e)', passos: [
        'Clique em IMPORTAR XML',
        'Selecione o arquivo .xml da nota fiscal eletronica',
        'O sistema extrai: fornecedor, CNPJ, itens, valores',
        'Revise e confirme'
      ]},
      { alerta: 'Confira sempre a obra destino antes de salvar! EDR = estoque, outra = custo direto na obra.' }
    ]
  },

  creditos: {
    titulo: 'Guia de Creditos NF',
    perfis: ['admin','operacional'],
    secoes: [
      { titulo: 'Como usar', passos: [
        'Consulte a tabela: itens com ✓ geram credito fiscal, itens com ✗ nao geram',
        'Use como referencia ao lancar notas fiscais'
      ]},
      { titulo: 'Exemplos', info: 'Geram credito: cimento, ferro, madeira, argamassa, tinta, piso, telhas, tubos, fios, frete. Nao geram: combustivel, alimentacao, limpeza, ferramentas, mobiliario, EPI.' },
      { dica: 'Ao lancar NF, o sistema classifica automaticamente o credito baseado no catalogo.' }
    ]
  },

  diarias: {
    titulo: 'Diarias',
    perfis: ['admin','operacional','mestre'],
    secoes: [
      { titulo: 'Lancar diarias do dia', passos: [
        'Na aba Registro, digite no campo: nome quantidade',
        'Exemplo: anderson 3 = Anderson trabalhou 3 periodos',
        'Exemplo: nego 2,5 = Nego trabalhou 2,5 periodos',
        'Funciona com apelidos! O sistema interpreta automaticamente',
        'Voce pode lancar varios funcionarios de uma vez, um por linha',
        'Confirme clicando em LANCAR'
      ]},
      { titulo: 'Ver calendario', passos: [
        'Na aba Registro, role para baixo',
        'Os dias aparecem em ordem — clique para expandir e ver quem trabalhou',
        'Para excluir um dia inteiro, clique no botao de excluir'
      ]},
      { titulo: 'Ver folha de pagamento', passos: [
        'Clique na aba Folha',
        'A folha mostra: funcionario, dias trabalhados, valor, total, extras, valor final',
        'Clique em EXPORTAR PDF para salvar ou imprimir'
      ]},
      { titulo: 'Adicionar extras (bonus/desconto)', passos: [
        'Clique na aba Extras',
        'Clique em + EXTRA',
        'Selecione o funcionario, informe valor (positivo = bonus, negativo = desconto)',
        'Clique em SALVAR'
      ]},
      { titulo: 'Gerenciar quinzenas', passos: [
        'No topo, veja a quinzena ativa',
        'Para criar nova: clique em NOVA QUINZENA (datas sugeridas automaticamente)',
        'Para trocar: use o seletor no topo'
      ]},
      { perfil: 'admin', titulo: 'Gerenciar equipe', passos: [
        'Clique em EQUIPE',
        'Para adicionar: preencha nome, cargo, valor da diaria e apelidos',
        'Para desativar: clique no botao ao lado do nome',
        'Para editar: clique no nome e altere'
      ]},
      { perfil: 'admin', titulo: 'Lancar diarias como custo na obra', passos: [
        'Clique em LANCAR EDR',
        'Selecione a obra destino',
        'O sistema calcula o custo total da quinzena',
        'Confirme para gerar o lancamento'
      ]}
    ]
  },

  catalogo: {
    titulo: 'Catalogo de Materiais',
    perfis: ['admin','operacional'],
    secoes: [
      { titulo: 'Consultar materiais', passos: [
        'Use a busca ou filtre por categoria',
        'Cada material mostra: codigo, nome, unidade, categoria'
      ]},
      { titulo: 'Cadastrar novo material', passos: [
        'Clique em + NOVO MATERIAL',
        'Preencha: nome, unidade (UN, m2, kg, etc.) e categoria',
        'O codigo e gerado automaticamente'
      ]},
      { dica: 'Materiais sao cadastrados automaticamente ao lancar NF com itens novos. Aparecem com badge "auto-cadastrado" para revisao.' },
      { perfil: 'admin', titulo: 'Reconciliacao', passos: [
        'Clique em RECONCILIAR para encontrar itens orfaos',
        'Para cada item: vincule a material existente, cadastre como novo ou exclua'
      ]}
    ]
  },

  relatorio: {
    titulo: 'Relatorio Financeiro',
    perfis: ['admin'],
    secoes: [
      { titulo: 'Gerar relatorio', passos: [
        'Selecione o mes/ano desejado',
        'O sistema gera: painel financeiro, grafico mensal, detalhe por obra e comparativo'
      ]},
      { titulo: 'Exportar PDF', passos: [
        'Com o relatorio na tela, clique em EXPORTAR PDF',
        'O PDF e gerado para download ou impressao'
      ]}
    ]
  },

  custos: {
    titulo: 'Custos CEF (Repasses)',
    perfis: ['admin'],
    secoes: [
      { titulo: 'Visualizar custos', passos: [
        'As obras aparecem em cards com resumo de lancamentos, adicionais e repasses',
        'Clique em uma obra para ver o detalhe com tabela mensal'
      ]},
      { titulo: 'Registrar repasse CEF', passos: [
        'No detalhe da obra, clique em + REPASSE',
        'Preencha: numero da medicao, valor, data do credito, tipo (PLS ou outro)',
        'Clique em SALVAR'
      ]},
      { titulo: 'Gerar relatorio de custos', passos: [
        'No detalhe da obra, clique em RELATORIO',
        'O sistema gera um relatorio completo de custos vs repasses'
      ]}
    ]
  },

  banco: {
    titulo: 'Dados (Gestao de Usuarios)',
    perfis: ['admin'],
    secoes: [
      { titulo: 'Criar novo usuario', passos: [
        'Clique em + NOVO USUARIO',
        'Preencha: usuario (login), senha, nome completo',
        'Selecione o perfil: Admin (acesso total), Operacional (F1 a F8) ou Mestre (so diarias)',
        'Clique em SALVAR'
      ]},
      { titulo: 'Editar ou desativar', passos: [
        'Na lista, clique em EDITAR',
        'Altere nome, senha ou perfil',
        'Para desativar: clique em DESATIVAR (o historico e mantido)'
      ]}
    ]
  },

  leads: {
    titulo: 'Leads (CRM)',
    perfis: ['admin'],
    secoes: [
      { titulo: 'Visao geral', info: 'Leads sao contatos captados pelo chatbot Duda no site. Aqui voce acompanha cada lead desde o primeiro contato ate virar cliente.' },
      { titulo: 'Filtrar por status', passos: [
        'Use os chips no topo: Novo, Contatado, Convertido, Descartado',
        'Clique novamente no chip ativo para mostrar todos'
      ]},
      { titulo: 'Atender um lead', passos: [
        'Clique no card do lead para abrir o detalhe',
        'Na aba Visao Geral, veja os dados completos',
        'Clique em Abrir WhatsApp para iniciar a conversa',
        'Apos atender, clique em CONTATADO para atualizar o status'
      ]},
      { titulo: 'Definir proxima acao', passos: [
        'No modal do lead, veja a secao Proxima Acao',
        'Selecione o tipo: Ligar, Visita, Proposta, Reuniao',
        'Defina a data e clique em Salvar',
        'A acao aparece no card do lead como lembrete'
      ]},
      { titulo: 'Adicionar notas', passos: [
        'No modal do lead, clique na aba Notas',
        'Escreva suas observacoes do atendimento',
        'Clique em Salvar nota — fica registrado no historico'
      ]},
      { titulo: 'Converter em cliente', passos: [
        'Quando o lead fechar negocio, clique em CONVERTIDO',
        'Selecione a obra vinculada',
        'O lead fica marcado como convertido com a obra associada'
      ]},
      { titulo: 'Ver conversa da Duda', passos: [
        'No modal do lead, clique em Ver conversa Duda',
        'Mostra o historico completo da conversa no chatbot'
      ]},
      { dica: 'O historico registra automaticamente toda mudanca de status, notas e acoes. Use a aba Historico para ver a timeline completa.' }
    ]
  },

  setup: {
    titulo: 'Setup',
    perfis: ['admin'],
    secoes: [
      { titulo: 'SQL de Setup', passos: [
        'Clique em COPIAR SQL',
        'Abra o Supabase SQL Editor',
        'Cole e execute — cria todas as tabelas necessarias'
      ]},
      { titulo: 'Resetar menu', passos: [
        'Clique em RESETAR MENU para voltar a ordem padrao (F1 a F12)',
      ]},
      { dica: 'O menu lateral pode ser reorganizado arrastando os botoes. O reset desfaz isso.' }
    ]
  }
};

// ── RENDERIZAR CONTEUDO DA AJUDA ────────────────────────
function renderAjudaConteudo(viewId) {
  const data = AJUDA_CONTEUDO[viewId];
  if (!data) return '';
  const perfil = usuarioAtual?.perfil || 'operacional';

  let html = '';
  data.secoes.forEach(s => {
    // Filtrar por perfil
    if (s.perfil && s.perfil !== perfil && perfil !== 'admin') return;

    if (s.info) {
      html += `<div style="background:rgba(52,152,219,0.1);border:1px solid rgba(52,152,219,0.25);border-radius:8px;padding:10px 12px;margin:10px 0;font-size:12px;color:#3498db;">
        ${s.titulo ? `<div style="font-weight:700;margin-bottom:4px;">${s.titulo}</div>` : ''}${s.info}</div>`;
    }
    if (s.passos) {
      html += `<div style="margin:12px 0;">
        <div style="font-weight:700;color:var(--verde-hl);font-size:12px;margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px;">${s.titulo}${s.perfil === 'admin' ? ' <span style="font-size:9px;background:rgba(231,76,60,0.2);color:#e74c3c;padding:1px 6px;border-radius:3px;margin-left:6px;">ADMIN</span>' : ''}</div>`;
      s.passos.forEach((p, i) => {
        html += `<div style="display:flex;gap:8px;align-items:flex-start;margin-bottom:6px;">
          <span style="min-width:20px;height:20px;background:var(--verde);color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;flex-shrink:0;">${i+1}</span>
          <span style="font-size:12px;color:var(--texto2);line-height:1.5;">${p}</span>
        </div>`;
      });
      html += '</div>';
    }
    if (s.itens) {
      html += `<div style="margin:12px 0;">
        <div style="font-weight:700;color:var(--verde-hl);font-size:12px;margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px;">${s.titulo}</div>
        <ul style="margin:0 0 0 16px;font-size:12px;color:var(--texto2);">`;
      s.itens.forEach(it => { html += `<li style="margin-bottom:4px;line-height:1.5;">${it}</li>`; });
      html += '</ul></div>';
    }
    if (s.dica) {
      html += `<div style="background:rgba(243,156,18,0.1);border:1px solid rgba(243,156,18,0.25);border-radius:8px;padding:8px 12px;margin:8px 0;font-size:11px;color:#f1c40f;">💡 ${s.dica}</div>`;
    }
    if (s.alerta) {
      html += `<div style="background:rgba(231,76,60,0.1);border:1px solid rgba(231,76,60,0.25);border-radius:8px;padding:8px 12px;margin:8px 0;font-size:11px;color:#e74c3c;">⚠ ${s.alerta}</div>`;
    }
  });

  return html;
}

// ── ABRIR/FECHAR PAINEL DE AJUDA ────────────────────────
function toggleAjuda(viewId) {
  const existing = document.getElementById('ajuda-painel');
  if (existing) { existing.remove(); return; }

  const data = AJUDA_CONTEUDO[viewId];
  if (!data) return;

  const conteudo = renderAjudaConteudo(viewId);
  const painel = document.createElement('div');
  painel.id = 'ajuda-painel';
  painel.style.cssText = 'position:fixed;top:0;right:0;width:340px;max-width:90vw;height:100vh;background:var(--bg2);border-left:1px solid var(--borda2);z-index:9999;overflow-y:auto;padding:20px;backdrop-filter:blur(12px);animation:ajudaSlideIn .2s ease;';
  painel.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
      <div style="font-weight:700;font-size:14px;color:var(--verde-hl);letter-spacing:1px;">❓ AJUDA</div>
      <button onclick="fecharAjuda()" style="background:none;border:none;color:var(--texto2);font-size:20px;cursor:pointer;padding:4px 8px;">&times;</button>
    </div>
    <div style="font-weight:800;font-size:16px;color:var(--branco,#fff);margin-bottom:16px;padding-bottom:10px;border-bottom:1px solid var(--borda);">${data.titulo}</div>
    ${conteudo}
    <div style="margin-top:20px;padding-top:12px;border-top:1px solid var(--borda);text-align:center;">
      <a href="manual.html" target="_blank" style="color:var(--verde-hl);font-size:11px;text-decoration:none;font-weight:600;letter-spacing:.5px;">📖 VER MANUAL COMPLETO</a>
    </div>
  `;
  document.body.appendChild(painel);

  // Fechar ao clicar fora
  setTimeout(() => {
    document.addEventListener('click', fecharAjudaFora);
  }, 100);
}

function fecharAjuda() {
  const p = document.getElementById('ajuda-painel');
  if (p) p.remove();
  document.removeEventListener('click', fecharAjudaFora);
}

function fecharAjudaFora(e) {
  const painel = document.getElementById('ajuda-painel');
  if (!painel) return;
  if (!painel.contains(e.target) && !e.target.closest('.ajuda-btn')) {
    fecharAjuda();
  }
}

// ── DETECTAR VIEW ATIVA ─────────────────────────────────
function getViewAtiva() {
  const views = ['dashboard','obras','estoque','notas','form','creditos','diarias','catalogo','relatorio','custos','banco','setup'];
  for (const v of views) {
    const el = document.getElementById('view-' + v);
    if (el && !el.classList.contains('hidden')) return v;
  }
  return null;
}

// ── BOTAO FLUTUANTE UNICO ───────────────────────────────
function initAjuda() {
  if (document.getElementById('ajuda-fab')) return;

  // CSS
  if (!document.getElementById('ajuda-css')) {
    const style = document.createElement('style');
    style.id = 'ajuda-css';
    style.textContent = `
      @keyframes ajudaSlideIn { from { transform:translateX(100%);opacity:0; } to { transform:translateX(0);opacity:1; } }
      #ajuda-fab { position:fixed;bottom:80px;right:16px;width:44px;height:44px;border-radius:50%;border:1px solid rgba(255,255,255,0.1);background:rgba(10,16,10,0.9);color:var(--verde-hl);font-size:18px;font-weight:800;cursor:pointer;z-index:900;display:flex;align-items:center;justify-content:center;font-family:'Rajdhani',sans-serif;backdrop-filter:blur(8px);transition:.2s;box-shadow:0 2px 12px rgba(0,0,0,0.4); }
      #ajuda-fab:hover { background:rgba(34,197,94,0.1);border-color:rgba(34,197,94,0.4);transform:scale(1.1); }
      @media(min-width:769px) { #ajuda-fab { bottom:20px;right:20px; } }
      @media(max-width:768px) { #ajuda-painel { width:100vw !important;max-width:100vw !important; } }
    `;
    document.head.appendChild(style);
  }

  const fab = document.createElement('button');
  fab.id = 'ajuda-fab';
  fab.textContent = '?';
  fab.title = 'Ajuda';
  fab.onclick = () => {
    const view = getViewAtiva();
    if (view && AJUDA_CONTEUDO[view]) {
      const perfil = usuarioAtual?.perfil || 'operacional';
      const data = AJUDA_CONTEUDO[view];
      if (perfil === 'admin' || data.perfis.includes(perfil)) {
        toggleAjuda(view);
        return;
      }
    }
    showToast('⚠ Sem ajuda disponível para esta tela.');
  };
  document.body.appendChild(fab);
}

// Fechar ajuda com ESC
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && document.getElementById('ajuda-painel')) {
    fecharAjuda();
    e.stopPropagation();
  }
}, true);
