/* ============================================================
   EDR V2 — TermoModule + ManualModule
   Fase 4.3 Lote 3 (fc5 + fc6)
   TermoModule: gera Termo de Entrega via PdfModule
   ManualModule: view estática SPA do manual do sistema
   ============================================================ */

// ── fc5: TERMO DE ENTREGA ──────────────────────────────────
const TermoModule = {

  // Dados de garantia por servico (NBR 15575)
  _GARANTIAS: [
    { servico: 'Fundacoes e estrutura (vigas, pilares, lajes, radier)', prazo: '5 anos', obs: 'Seguranca e estabilidade global. Trincas estruturais ou recalques.' },
    { servico: 'Paredes de vedacao (alvenaria)', prazo: '5 anos', obs: 'Fissuras passantes que comprometam estanqueidade.' },
    { servico: 'Impermeabilizacao (laje, cobertura, banheiros)', prazo: '3 anos', obs: 'Infiltracoes por falha de impermeabilizacao original.' },
    { servico: 'Cobertura (estrutura do telhado, telhas)', prazo: '3 anos', obs: 'Goteiras por defeito de execucao. Exclui vendavais e granizo.' },
    { servico: 'Calhas e rufos (vedacao e emendas)', prazo: '1 ano', obs: 'Vedacao sujeita a desgaste por intemperies. Manutencao periodica recomendada.' },
    { servico: 'Instalacoes hidraulicas (agua fria/quente, esgoto)', prazo: '2 anos', obs: 'Vazamentos em tubulacoes, conexoes e registros embutidos.' },
    { servico: 'Instalacoes eletricas (fiacao, disjuntores, QDC)', prazo: '2 anos', obs: 'Defeitos na fiacao original, mau contato, dimensionamento.' },
    { servico: 'Revestimentos de parede (reboco, massa, ceramica)', prazo: '2 anos', obs: 'Desplacamento, estufamento ou fissuras no revestimento.' },
    { servico: 'Revestimentos de piso (ceramica, porcelanato)', prazo: '2 anos', obs: 'Desplacamento ou quebra por defeito de assentamento.' },
    { servico: 'Pintura interna e externa', prazo: '1 ano', obs: 'Descascamento, bolhas ou manchas por falha de preparo.' },
    { servico: 'Esquadrias (portas, janelas, fechaduras)', prazo: '1 ano', obs: 'Defeitos de funcionamento, vedacao e acabamento.' },
    { servico: 'Rejuntes', prazo: '1 ano', obs: 'Manutencao periodica e de responsabilidade do proprietario.' },
    { servico: 'Loucas e metais sanitarios', prazo: '1 ano', obs: 'Defeitos de instalacao. Garantia do fabricante segue a parte.' },
    { servico: 'Forro de gesso / PVC', prazo: '2 anos', obs: 'Trincas, desplacamento ou abaulamento por falha de execucao.' },
    { servico: 'Contrapiso e regularizacao', prazo: '3 anos', obs: 'Fissuras, desniveis ou destacamento do substrato.' },
    { servico: 'Muro, calcada e piso externo', prazo: '2 anos', obs: 'Exclui danos por raizes de arvores ou trafego de veiculos pesados.' }
  ],

  // Tabela "Pode ou Nao Pode"
  _PERMISSOES: [
    { acao: 'Fixar armarios com buchas e parafusos leves', permitido: 'SIM', obs: 'Evite sobrecarga ou impactos excessivos' },
    { acao: 'Perfurar parede para passagem de tubulacao', permitido: 'NAO', obs: 'Risco de danificar instalacoes embutidas' },
    { acao: 'Trocar piso ceramico', permitido: 'SIM', obs: 'Somente por profissional qualificado' },
    { acao: 'Alterar fiacao eletrica ou acrescentar circuitos', permitido: 'NAO', obs: 'Apenas com responsavel tecnico registrado (CREA/CFT)' },
    { acao: 'Instalar ar-condicionado ou aquecedor', permitido: 'SIM', obs: 'Verificar capacidade do circuito eletrico antes' },
    { acao: 'Ampliar o imovel (comodos, garagem, muro)', permitido: 'RESSALVA', obs: 'Obrigatorio contratar responsavel tecnico (ART/RRT). EDR nao se responsabiliza por ampliacao de terceiros.' },
    { acao: 'Pintar paredes internas', permitido: 'SIM', obs: 'Use tintas compativeis com o acabamento original' },
    { acao: 'Subir na laje / cobertura', permitido: 'RESSALVA', obs: 'Pisar sobre apoios, nunca no vao da telha. Usar tabua para distribuir carga.' }
  ],

  // Manutencao preventiva
  _MANUTENCAO: [
    { item: 'Calhas, rufos e ralos', periodo: 'A cada 3 meses', acao: 'Limpar detritos, folhas e verificar escoamento' },
    { item: 'Caixa de gordura', periodo: 'A cada 6 meses', acao: 'Limpar e remover residuos de gordura acumulados' },
    { item: 'Rejuntes (pisos e paredes)', periodo: 'Anual', acao: 'Verificar integridade; refazer onde houver falhas' },
    { item: 'Pintura externa', periodo: 'A cada 3 anos', acao: 'Repintar fachadas para protecao contra intemperies' },
    { item: 'Instalacao eletrica', periodo: 'Anual', acao: 'Verificar disjuntores, tomadas e fiacoes aparentes' },
    { item: 'Registros e valvulas', periodo: 'Semestral', acao: 'Abrir e fechar completamente para evitar travamento' },
    { item: 'Telhado', periodo: 'Anual', acao: 'Verificar telhas quebradas ou deslocadas (por profissional)' },
    { item: 'Impermeabilizacao', periodo: 'A cada 2 anos', acao: 'Inspecionar lajes e banheiros; refazer se necessario' }
  ],

  // Checklist de entrega
  _CHECKLIST: [
    'Manual do Proprietario, Termo de Garantia e Entrega entregues',
    'Chaves do imovel entregues (porta principal, portao, cadeados)',
    'Instalacao eletrica testada e funcional',
    'Instalacao hidraulica testada e funcional (agua e esgoto)',
    'Vistoria de entrega realizada com o proprietario',
    'Proprietario ciente das obrigacoes de manutencao preventiva',
    'Contatos de assistencia tecnica informados',
    'Proprietario ciente dos prazos de garantia por servico'
  ],

  /**
   * Gera o Termo de Entrega via PdfModule
   * @param {Object} dados — { proprietario, cpf, rua, bairro, numero, cidade, dataEntrega, modelo }
   */
  gerar(dados) {
    if (typeof PdfModule === 'undefined' || !PdfModule.gerarTermo) {
      console.error('PdfModule.gerarTermo nao disponivel');
      return;
    }
    PdfModule.gerarTermo(TermoModule._montarPayload(dados));
  },

  /**
   * Monta payload estruturado pro PdfModule
   */
  _montarPayload(d) {
    const hoje = new Date();
    const meses = ['janeiro','fevereiro','marco','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
    const cidadeLocal = d.cidade ? d.cidade.split('/')[0].trim() : '___________';
    const dataFormatada = d.dataEntrega ? TermoModule._fmtData(d.dataEntrega) : '';
    const endereco = [d.rua, d.bairro].filter(Boolean).join(', ');

    return {
      proprietario: d.proprietario || '',
      cpf: d.cpf || '',
      endereco: endereco,
      numero: d.numero || '',
      cidade: d.cidade || '',
      dataEntrega: dataFormatada,
      modelo: d.modelo || '',
      localData: cidadeLocal + ', ' + hoje.getDate() + ' de ' + meses[hoje.getMonth()] + ' de ' + hoje.getFullYear(),
      garantias: TermoModule._GARANTIAS,
      permissoes: TermoModule._PERMISSOES,
      manutencao: TermoModule._MANUTENCAO,
      checklist: TermoModule._CHECKLIST,
      orientacoes: [
        'Evite sobrecarga em armarios e prateleiras fixadas em paredes de alvenaria.',
        'Nao altere a instalacao eletrica ou hidraulica sem acompanhamento de responsavel tecnico habilitado.',
        'Evite o uso de produtos quimicos agressivos (acido muriatico, soda caustica) em revestimentos ceramicos, metais sanitarios e bancadas.',
        'Realize limpeza e manutencao regular de calhas, rufos, ralos com fecho hidrico e caixas de gordura.',
        'Mantenha as janelas abertas para garantir ventilacao adequada. A circulacao de ar evita mofo e bolor.',
        'Mantenha os rejuntes em bom estado para evitar infiltracoes.',
        'Antes de perfurar paredes, pisos ou lajes, tenha cautela: existem tubulacoes e fiacoes embutidas.',
        'Em caso de ausencia prolongada, feche o registro geral de agua na caixa d\'agua.'
      ],
      perdaGarantia: [
        'Reformas, ampliacoes ou modificacoes estruturais sem responsavel tecnico habilitado (ART/RRT).',
        'Inexistencia de manutencao preventiva conforme orientacoes deste manual.',
        'Utilizacao inadequada dos ambientes, sistemas, instalacoes ou materiais.',
        'Manutencoes ou reparos executados por profissionais nao habilitados.',
        'Danos causados por terceiros, caso fortuito ou forca maior.',
        'Desgaste natural por uso e tempo de vida util dos materiais.',
        'Nao comunicacao formal de defeitos dentro do prazo de garantia.'
      ],
      responsabilidades: [
        'Executar as manutencoes periodicas preventivas descritas neste manual.',
        'Nao realizar intervencoes estruturais, eletricas ou hidraulicas sem orientacao tecnica especializada.',
        'Notificar a construtora formalmente sobre qualquer defeito aparente dentro do prazo de garantia.',
        'Utilizar o imovel de acordo com a finalidade para a qual foi projetado (residencial).',
        'Conservar este documento para eventuais consultas e comprovacao de garantia.'
      ],
      empresa: {
        nome: 'EDR ENGENHARIA',
        cnpj: '49.909.440/0001-55',
        endereco: 'Rua Gerson Ferreira de Almeida, 89 — Centro, Jupi-PE',
        whatsapp: '(87) 9 8171-3987',
        instagram: '@elydaedr',
        responsavel: 'Elyda Rodrigues',
        crea: 'CREA-PE 66902'
      }
    };
  },

  _fmtData(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return d + '/' + m + '/' + y;
  },

  render(container) {
    container.innerHTML = `
      <div style="max-width:700px;margin:0 auto;padding:24px;">
        <h2 style="font-size:20px;font-weight:700;margin-bottom:16px;color:var(--text-primary);">Gerar Termo de Entrega</h2>
        <p style="color:var(--text-secondary);margin-bottom:24px;font-size:13px;">Preencha os dados do proprietário para gerar o PDF do Termo de Entrega + Manual do Proprietário.</p>
        <div style="display:grid;gap:14px;">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
            <div><label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:4px;">Proprietário</label><input id="termo-prop" class="input" placeholder="Nome completo" style="width:100%;"></div>
            <div><label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:4px;">CPF</label><input id="termo-cpf" class="input" placeholder="000.000.000-00" style="width:100%;"></div>
          </div>
          <div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:14px;">
            <div><label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:4px;">Rua</label><input id="termo-rua" class="input" placeholder="Rua / Av." style="width:100%;"></div>
            <div><label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:4px;">Nº</label><input id="termo-num" class="input" placeholder="Nº" style="width:100%;"></div>
            <div><label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:4px;">Bairro</label><input id="termo-bairro" class="input" placeholder="Bairro" style="width:100%;"></div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;">
            <div><label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:4px;">Cidade</label><input id="termo-cidade" class="input" placeholder="Cidade-UF" style="width:100%;"></div>
            <div><label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:4px;">Data Entrega</label><input id="termo-data" type="date" class="input" style="width:100%;"></div>
            <div><label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:4px;">Modelo</label><select id="termo-modelo" class="input" style="width:100%;"><option value="casa">Casa</option><option value="apartamento">Apartamento</option><option value="reforma">Reforma</option></select></div>
          </div>
        </div>
        <button onclick="TermoModule.gerar({
          proprietario: document.getElementById('termo-prop').value,
          cpf: document.getElementById('termo-cpf').value,
          rua: document.getElementById('termo-rua').value,
          bairro: document.getElementById('termo-bairro').value,
          numero: document.getElementById('termo-num').value,
          cidade: document.getElementById('termo-cidade').value,
          dataEntrega: document.getElementById('termo-data').value,
          modelo: document.getElementById('termo-modelo').value
        })" class="btn btn-primary" style="margin-top:20px;">
          <span class="material-symbols-outlined" style="font-size:18px;vertical-align:middle;">picture_as_pdf</span>
          Gerar Termo PDF
        </button>
      </div>`;
  }
};


// ── fc6: MANUAL DO SISTEMA ──────────────────────────────────
const ManualModule = {

  render(container) {
    requestAnimationFrame(() => {
      container.innerHTML = ManualModule._skeleton();
      requestAnimationFrame(() => {
        container.innerHTML = ManualModule._html();
        ManualModule._bindNav();
      });
    });
  },

  _skeleton() {
    return '<div style="max-width:960px;margin:0 auto;padding:32px 24px;">' +
      '<div style="height:40px;width:60%;background:var(--skeleton);border-radius:8px;margin-bottom:24px;animation:pulse 1.5s infinite"></div>' +
      '<div style="height:20px;width:90%;background:var(--skeleton);border-radius:6px;margin-bottom:12px;animation:pulse 1.5s infinite"></div>'.repeat(8) +
    '</div>';
  },

  _bindNav() {
    const links = document.querySelectorAll('.manual-nav-link');
    links.forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const target = document.getElementById(link.dataset.target);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        // Mobile: fechar sidebar
        const sidebar = document.getElementById('manual-sidebar');
        if (sidebar && window.innerWidth < 768) sidebar.classList.remove('open');
      });
    });
    const toggle = document.getElementById('manual-sidebar-toggle');
    if (toggle) {
      toggle.addEventListener('click', () => {
        const sidebar = document.getElementById('manual-sidebar');
        if (sidebar) sidebar.classList.toggle('open');
      });
    }
  },

  _sections() {
    return [
      { id: 'inicio', icon: 'home', titulo: 'Primeiros Passos', conteudo: ManualModule._secInicio() },
      { id: 'obras', icon: 'engineering', titulo: 'Obras', conteudo: ManualModule._secObras() },
      { id: 'notas', icon: 'receipt_long', titulo: 'Notas Fiscais', conteudo: ManualModule._secNotas() },
      { id: 'importar', icon: 'upload_file', titulo: 'Importar NF-e (XML)', conteudo: ManualModule._secImportar() },
      { id: 'estoque', icon: 'inventory_2', titulo: 'Estoque', conteudo: ManualModule._secEstoque() },
      { id: 'custos', icon: 'payments', titulo: 'Custos e Lancamentos', conteudo: ManualModule._secCustos() },
      { id: 'diarias', icon: 'groups', titulo: 'Diarias e Equipe', conteudo: ManualModule._secDiarias() },
      { id: 'relatorio', icon: 'analytics', titulo: 'Relatorio P&L', conteudo: ManualModule._secRelatorio() },
      { id: 'cronograma', icon: 'calendar_month', titulo: 'Cronograma', conteudo: ManualModule._secCronograma() },
      { id: 'orcamento', icon: 'calculate', titulo: 'Orcamento', conteudo: ManualModule._secOrcamento() },
      { id: 'dashboard', icon: 'dashboard', titulo: 'Dashboard', conteudo: ManualModule._secDashboard() },
      { id: 'leads', icon: 'person_search', titulo: 'CRM / Leads', conteudo: ManualModule._secLeads() },
      { id: 'garantias', icon: 'verified', titulo: 'Garantias', conteudo: ManualModule._secGarantias() },
      { id: 'config', icon: 'settings', titulo: 'Configuracoes', conteudo: ManualModule._secConfig() },
      { id: 'perfis', icon: 'manage_accounts', titulo: 'Perfis de Acesso', conteudo: ManualModule._secPerfis() },
      { id: 'atalhos', icon: 'keyboard', titulo: 'Atalhos', conteudo: ManualModule._secAtalhos() }
    ];
  },

  _html() {
    const secs = ManualModule._sections();
    const nav = secs.map(s =>
      '<a href="#" class="manual-nav-link" data-target="manual-sec-' + s.id + '" style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:8px;color:var(--texto2);text-decoration:none;font-size:13px;transition:all .2s;">' +
        '<span class="material-symbols-outlined" style="font-size:18px;">' + s.icon + '</span>' + s.titulo +
      '</a>'
    ).join('');

    const body = secs.map(s =>
      '<section id="manual-sec-' + s.id + '" style="margin-bottom:40px;">' +
        '<h2 style="font-family:\'Plus Jakarta Sans\',sans-serif;font-size:20px;font-weight:700;color:var(--texto);margin-bottom:16px;display:flex;align-items:center;gap:10px;">' +
          '<span class="material-symbols-outlined" style="font-size:24px;color:#2D6A4F;">' + s.icon + '</span>' + s.titulo +
        '</h2>' +
        '<div style="color:var(--texto2);font-size:14px;line-height:1.7;">' + s.conteudo + '</div>' +
      '</section>'
    ).join('');

    return '<div style="display:flex;max-width:1100px;margin:0 auto;min-height:calc(100vh - 60px);">' +
      // Toggle mobile
      '<button id="manual-sidebar-toggle" style="display:none;position:fixed;bottom:20px;right:20px;z-index:100;width:48px;height:48px;border-radius:50%;background:#2D6A4F;color:#fff;border:none;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,0.2);font-size:0;">' +
        '<span class="material-symbols-outlined" style="font-size:24px;">menu</span>' +
      '</button>' +
      // Sidebar
      '<aside id="manual-sidebar" style="width:240px;flex-shrink:0;border-right:1px solid var(--borda);padding:24px 12px;position:sticky;top:60px;height:calc(100vh - 60px);overflow-y:auto;">' +
        '<div style="font-family:\'Plus Jakarta Sans\',sans-serif;font-weight:700;font-size:15px;color:#2D6A4F;margin-bottom:16px;padding:0 12px;">Manual do Sistema</div>' +
        nav +
      '</aside>' +
      // Conteudo
      '<main style="flex:1;padding:32px 40px;max-width:760px;">' +
        '<div style="margin-bottom:32px;">' +
          '<h1 style="font-family:\'Plus Jakarta Sans\',sans-serif;font-size:28px;font-weight:800;color:var(--texto);margin-bottom:8px;">EDR System</h1>' +
          '<p style="color:var(--texto2);font-size:15px;">Sistema de gestao completo para construtoras. Controle obras, notas fiscais, estoque, custos, equipe e muito mais.</p>' +
        '</div>' +
        body +
      '</main>' +
    '</div>' +
    '<style>' +
      '.manual-nav-link:hover{background:rgba(45,106,79,0.08);color:var(--texto)!important}' +
      '@media(max-width:768px){' +
        '#manual-sidebar{position:fixed;left:-260px;top:60px;z-index:99;background:var(--fundo);box-shadow:4px 0 20px rgba(0,0,0,0.1);transition:left .3s}' +
        '#manual-sidebar.open{left:0}' +
        '#manual-sidebar-toggle{display:flex!important;align-items:center;justify-content:center}' +
        'main{padding:24px 16px!important}' +
      '}' +
    '</style>';
  },

  // ── Conteudo das secoes ──
  _secInicio() {
    return '<p><strong>Bem-vindo ao EDR System.</strong> Este e o sistema de gestao da EDR Engenharia, desenvolvido para acompanhar todas as etapas da construcao civil — do orcamento a entrega de chaves.</p>' +
      '<p>Apos o login, voce vera a sidebar a esquerda com todos os modulos disponiveis. A visibilidade dos modulos depende do seu perfil de acesso.</p>' +
      '<h3 style="margin-top:16px;font-weight:600;">Como comecar:</h3>' +
      '<ol style="padding-left:20px;">' +
        '<li>Cadastre suas <strong>obras</strong> com os dados do contrato CEF</li>' +
        '<li>Importe as <strong>notas fiscais</strong> (XML ou manual)</li>' +
        '<li>Acompanhe <strong>custos</strong> e <strong>estoque</strong> em tempo real</li>' +
        '<li>Registre as <strong>diarias</strong> da equipe</li>' +
        '<li>Consulte o <strong>dashboard</strong> para visao geral</li>' +
      '</ol>';
  },

  _secObras() {
    return '<p>O modulo de Obras e o coracao do sistema. Cada obra possui:</p>' +
      '<ul style="padding-left:20px;">' +
        '<li><strong>Dados gerais</strong> — nome, proprietario, endereco, valor do contrato CEF</li>' +
        '<li><strong>Etapas financeiras</strong> — 36 centros de custo com percentual de distribuicao</li>' +
        '<li><strong>Validacao CEF</strong> — banner vermelho se a soma dos percentuais nao bater com o valor do financiamento</li>' +
        '<li><strong>Adicionais</strong> — servicos extras fora do contrato, com controle de pagamento parcial</li>' +
        '<li><strong>Lancamentos</strong> — resumo de todas as entradas e saidas vinculadas</li>' +
      '</ul>' +
      '<p>Use as abas <strong>Ativas</strong> e <strong>Arquivadas</strong> para organizar. O filtro por nome funciona com busca instantanea.</p>';
  },

  _secNotas() {
    return '<p>Controle completo de notas fiscais:</p>' +
      '<ul style="padding-left:20px;">' +
        '<li><strong>Cadastro manual</strong> — fornecedor, data, valor, itens</li>' +
        '<li><strong>Importacao XML</strong> — leitura automatica de NF-e (ver secao Importar)</li>' +
        '<li><strong>Classificacao fiscal</strong> — esteira hibrida IBS/CBS (Catalogo, Historico, Regex, Manual)</li>' +
        '<li><strong>Vinculacao com obra</strong> — cada nota e associada a uma obra e centro de custo</li>' +
        '<li><strong>Historico</strong> — filtro por fornecedor, data, valor</li>' +
      '</ul>';
  },

  _secImportar() {
    return '<p>O modulo de importacao le arquivos <strong>XML de NF-e</strong> e preenche automaticamente:</p>' +
      '<ul style="padding-left:20px;">' +
        '<li>Dados do fornecedor (CNPJ, razao social)</li>' +
        '<li>Itens com descricao, quantidade, unidade e valor</li>' +
        '<li>Totais e impostos</li>' +
      '</ul>' +
      '<p>O motor de matching usa bigramas para sugerir materiais do catalogo. Voce pode aceitar ou ajustar manualmente.</p>';
  },

  _secEstoque() {
    return '<p>Controle de estoque por obra:</p>' +
      '<ul style="padding-left:20px;">' +
        '<li><strong>Entrada</strong> — via importacao de NF ou lancamento manual</li>' +
        '<li><strong>Saida</strong> — distribuicao para obra com preco FIFO</li>' +
        '<li><strong>Saldo</strong> — quantidade e valor medio por material</li>' +
        '<li><strong>Exportacao</strong> — planilha Excel via ExcelJS</li>' +
      '</ul>' +
      '<p>As categorias de material sao derivadas automaticamente das 36 etapas financeiras.</p>';
  },

  _secCustos() {
    return '<p>Visao consolidada de custos por obra:</p>' +
      '<ul style="padding-left:20px;">' +
        '<li><strong>Cards overview</strong> — totais macro (receita, custo, lucro, margem)</li>' +
        '<li><strong>Detalhamento</strong> — clique no card para ver lancamentos individuais</li>' +
        '<li><strong>Repasses CEF</strong> — CRUD de parcelas do financiamento</li>' +
        '<li><strong>Contrato CEF</strong> — modal com auto-calculo do valor de venda</li>' +
        '<li><strong>Relatorio impresso</strong> — HTML formatado para impressao</li>' +
      '</ul>';
  },

  _secDiarias() {
    return '<p>Controle de mao de obra e equipe:</p>' +
      '<ul style="padding-left:20px;">' +
        '<li><strong>Funcionarios</strong> — cadastro com funcao, valor diaria e aliases</li>' +
        '<li><strong>Quinzenas</strong> — periodo de 1-15 e 16-fim do mes</li>' +
        '<li><strong>Lancamento por mensagem</strong> — parser que interpreta texto natural</li>' +
        '<li><strong>Extras</strong> — hora extra, desconto, adiantamento, bonus</li>' +
        '<li><strong>PDF</strong> — resumo quinzenal via jsPDF</li>' +
        '<li><strong>Bloqueio mestre</strong> — quinzena fechada nao aceita novos lancamentos</li>' +
      '</ul>';
  },

  _secRelatorio() {
    return '<p>Relatorio financeiro mensal com 4 secoes:</p>' +
      '<ul style="padding-left:20px;">' +
        '<li><strong>Financeiro</strong> — receitas, custos, lucro, margem</li>' +
        '<li><strong>Categoria</strong> — distribuicao por centro de custo com cores</li>' +
        '<li><strong>Comparativo</strong> — custo por m2 entre obras</li>' +
        '<li><strong>Faltas</strong> — funcionarios com mais ausencias no periodo</li>' +
      '</ul>' +
      '<p>Graficos sao barras CSS nativas — sem dependencia de Chart.js.</p>';
  },

  _secCronograma() {
    return '<p>Acompanhamento visual das etapas construtivas:</p>' +
      '<ul style="padding-left:20px;">' +
        '<li><strong>Gantt</strong> — grafico de barras via Frappe Gantt (com fallback lista)</li>' +
        '<li><strong>17 etapas padrao</strong> — fases construtivas pre-definidas</li>' +
        '<li><strong>Subitens</strong> — checklist detalhado por etapa</li>' +
        '<li><strong>Progresso</strong> — calculado automaticamente pelos subitens</li>' +
        '<li><strong>PDF</strong> — exportacao do cronograma via PdfModule</li>' +
      '</ul>';
  },

  _secOrcamento() {
    return '<p>Orcamento parametrico com correcao monetaria:</p>' +
      '<ul style="padding-left:20px;">' +
        '<li><strong>CUB/INCC</strong> — indice atualizado via API do BCB (serie 192)</li>' +
        '<li><strong>Cache</strong> — dados do BCB com TTL de 15 dias no localStorage</li>' +
        '<li><strong>Etapas</strong> — distribuicao percentual por centro de custo</li>' +
        '<li><strong>Excel</strong> — exportacao real via ExcelJS</li>' +
        '<li><strong>PDF</strong> — exportacao formatada via PdfModule</li>' +
      '</ul>';
  },

  _secDashboard() {
    return '<p>Painel de KPIs e visao geral:</p>' +
      '<ul style="padding-left:20px;">' +
        '<li><strong>8 KPIs</strong> — Receita, Custo, Lucro, Margem, Obras, Contas Vencidas, Estoque Material, MO vs Material</li>' +
        '<li><strong>Acao Necessaria</strong> — alertas de contas a vencer e NFs com tag REVISAR</li>' +
        '<li><strong>Agenda semanal</strong> — CRUD de notas com navegacao por semana</li>' +
        '<li><strong>Resumo financeiro</strong> — filtro Geral/Mensal</li>' +
        '<li><strong>Saude das obras</strong> — barras de progresso por obra</li>' +
      '</ul>';
  },

  _secLeads() {
    return '<p>CRM para captacao de clientes:</p>' +
      '<ul style="padding-left:20px;">' +
        '<li><strong>Kanban</strong> — 5 colunas (Qualificado, Conversa, Contatado, Convertido, Descartado)</li>' +
        '<li><strong>Modal</strong> — 4 abas (Visao Geral, Historico, Notas, Conversa chatbot)</li>' +
        '<li><strong>Origem</strong> — tag automatica quando vem do Telegram</li>' +
        '<li><strong>Vincular obra</strong> — autocomplete para associar lead a uma obra</li>' +
      '</ul>';
  },

  _secGarantias() {
    return '<p>Controle de garantias pos-entrega:</p>' +
      '<ul style="padding-left:20px;">' +
        '<li><strong>9 categorias</strong> — com icone Material Symbols e prazo legal</li>' +
        '<li><strong>Chamados</strong> — CRUD com status e historico</li>' +
        '<li><strong>Obras</strong> — autocomplete de ativas + arquivadas</li>' +
      '</ul>';
  },

  _secConfig() {
    return '<p>Configuracoes do sistema:</p>' +
      '<ul style="padding-left:20px;">' +
        '<li><strong>Empresa</strong> — nome, CNPJ, endereco, logo</li>' +
        '<li><strong>Usuarios</strong> — cadastro, perfis, permissoes, ativo/inativo</li>' +
        '<li><strong>Tema</strong> — light/dark toggle</li>' +
        '<li><strong>Catalogo</strong> — materiais globais e por empresa</li>' +
      '</ul>';
  },

  _secPerfis() {
    return '<p>O sistema tem 4 perfis de acesso:</p>' +
      '<table style="width:100%;border-collapse:collapse;margin-top:12px;font-size:13px;">' +
        '<thead><tr style="border-bottom:2px solid var(--borda);">' +
          '<th style="text-align:left;padding:8px;font-weight:600;">Perfil</th>' +
          '<th style="text-align:left;padding:8px;font-weight:600;">Acesso</th>' +
        '</tr></thead>' +
        '<tbody>' +
          '<tr style="border-bottom:1px solid var(--borda);"><td style="padding:8px;font-weight:600;color:#2D6A4F;">Admin</td><td style="padding:8px;">Acesso total. Gerencia usuarios, configuracoes, dados financeiros.</td></tr>' +
          '<tr style="border-bottom:1px solid var(--borda);"><td style="padding:8px;font-weight:600;color:#2D6A4F;">Operacional</td><td style="padding:8px;">Cadastra NFs, lancamentos, estoque. Nao ve dados financeiros sensiveis.</td></tr>' +
          '<tr style="border-bottom:1px solid var(--borda);"><td style="padding:8px;font-weight:600;color:#2D6A4F;">Mestre</td><td style="padding:8px;">Registra diarias da equipe. Visao limitada ao modulo de diarias.</td></tr>' +
          '<tr><td style="padding:8px;font-weight:600;color:#2D6A4F;">Visitante</td><td style="padding:8px;">Somente leitura. Pode visualizar mas nao editar.</td></tr>' +
        '</tbody>' +
      '</table>';
  },

  _secAtalhos() {
    return '<p>Atalhos disponiveis no sistema:</p>' +
      '<table style="width:100%;border-collapse:collapse;margin-top:12px;font-size:13px;">' +
        '<thead><tr style="border-bottom:2px solid var(--borda);">' +
          '<th style="text-align:left;padding:8px;font-weight:600;">Tecla</th>' +
          '<th style="text-align:left;padding:8px;font-weight:600;">Acao</th>' +
        '</tr></thead>' +
        '<tbody>' +
          '<tr style="border-bottom:1px solid var(--borda);"><td style="padding:8px;font-family:\'Space Grotesk\',monospace;"><kbd style="background:var(--borda);padding:2px 8px;border-radius:4px;">Ctrl+K</kbd></td><td style="padding:8px;">Busca rapida / Command palette</td></tr>' +
          '<tr style="border-bottom:1px solid var(--borda);"><td style="padding:8px;font-family:\'Space Grotesk\',monospace;"><kbd style="background:var(--borda);padding:2px 8px;border-radius:4px;">Esc</kbd></td><td style="padding:8px;">Fechar modal / painel aberto</td></tr>' +
          '<tr style="border-bottom:1px solid var(--borda);"><td style="padding:8px;font-family:\'Space Grotesk\',monospace;"><kbd style="background:var(--borda);padding:2px 8px;border-radius:4px;">Ctrl+S</kbd></td><td style="padding:8px;">Salvar formulario ativo (quando disponivel)</td></tr>' +
        '</tbody>' +
      '</table>';
  }
};

// ── Registro no viewRegistry ──
if (typeof viewRegistry !== 'undefined') {
  viewRegistry.register('termo', (container) => TermoModule.render(container));
  viewRegistry.register('manual', (container) => ManualModule.render(container));
}
