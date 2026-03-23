const SUPABASE_URL = 'https://mepzoxoahpwcvvlymlfh.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Z9E8KLU8ZIMcWjD-bMG5gg_eM585qWq';

// Telegram — notificações de novos clientes
const TG_BOT = '8644194982:AAH6-26NFAbYYtq4TM45hOapqqMguid9qpI';
const TG_CHAT_EDR = '-5239426430';

function notificarTelegram(chatId, texto) {
  fetch('https://api.telegram.org/bot' + TG_BOT + '/sendMessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: texto, parse_mode: 'HTML' })
  }).catch(() => {});
}

// Planos e limites
const PLANOS = {
  trial:          { nome: 'Trial',          obras: 1, usuarios: 2,  dias: 14 },
  obra:           { nome: 'Obra',           obras: 1, usuarios: 2  },
  construtora:    { nome: 'Construtora',    obras: 3, usuarios: 5  },
  incorporadora:  { nome: 'Incorporadora',  obras: 999, usuarios: 999 }
};

let _companyPlan = null;

async function loadCompanyPlan() {
  if (MODO_DEMO || !_companyId) return;
  try {
    const r = await sbGet('companies', '?id=eq.' + _companyId + '&select=plan,trial_ends_at');
    if (r && r[0]) _companyPlan = r[0];
  } catch(e) { console.error('Erro:', e); }
}

function getLimites() {
  const plan = _companyPlan?.plan || 'trial';
  return PLANOS[plan] || PLANOS.trial;
}

let _isSuperAdmin = false;

function isPlatformAdmin() {
  return _isSuperAdmin;
}

async function checarLimiteObras() {
  if (isPlatformAdmin()) return true;
  const lim = getLimites();
  const obrasAtivas = obras.filter(o => !o.arquivada);
  if (obrasAtivas.length >= lim.obras) {
    const plano = _companyPlan?.plan || 'trial';
    const nomes = { trial: 'Trial', obra: 'Obra', construtora: 'Construtora' };
    alert('Limite de obras atingido no plano ' + (nomes[plano] || plano) + ' (' + lim.obras + ' obra' + (lim.obras > 1 ? 's' : '') + ').\n\nFaça upgrade para criar mais obras.');
    return false;
  }
  return true;
}

async function checarLimiteUsuarios() {
  if (isPlatformAdmin()) return true;
  const lim = getLimites();
  try {
    const users = await sbGet('company_users', '?company_id=eq.' + _companyId + '&select=id');
    if (users && users.length >= lim.usuarios) {
      const plano = _companyPlan?.plan || 'trial';
      alert('Limite de usuarios atingido no plano ' + (PLANOS[plano]?.nome || plano) + ' (' + lim.usuarios + ').\n\nFaca upgrade para adicionar mais membros.');
      return false;
    }
  } catch(e) { console.error('Erro:', e); }
  return true;
}

// Headers dinâmicos — usa token Auth se logado, senão anon key
let _authToken = null;
function getHdrs(preferOverride) {
  return {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${_authToken || SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': preferOverride || 'return=representation'
  };
}

// USUÁRIOS — carregados do Supabase Auth (sem senhas no código)
let USUARIOS = [];

const SQL_SETUP = `-- EDR System · Setup completo
create table if not exists notas_fiscais (
  id uuid default gen_random_uuid() primary key,
  data date not null, data_recebimento date,
  natureza text default 'VENDA', numero_nf text default '',
  fornecedor text not null, cnpj text default '',
  obra text default 'EDR', valor_bruto numeric default 0,
  frete numeric default 0, imposto numeric default 0,
  gera_credito boolean default false, credito_status text default 'nao',
  itens text default '[]', obs text default '',
  obs_distribuicao text default '', criado_em timestamptz default now()
);
alter table notas_fiscais enable row level security;
alter table notas_fiscais add column if not exists frete numeric default 0;

create table if not exists distribuicoes (
  id uuid default gen_random_uuid() primary key,
  nota_id uuid references notas_fiscais(id) on delete cascade,
  item_desc text not null, item_idx integer not null,
  obra_id uuid, obra_nome text not null,
  qtd numeric not null, valor numeric not null,
  data date default current_date, lancamento_id uuid,
  criado_em timestamptz default now()
);
alter table distribuicoes enable row level security;

-- Coluna para identificar materiais auto-cadastrados pela NF
alter table materiais add column if not exists auto boolean default false;

-- Etapa construtiva nos lançamentos e distribuições
alter table lancamentos add column if not exists etapa text default '';
alter table distribuicoes add column if not exists etapa text default '';

-- Arquivamento de obras concluídas
alter table obras add column if not exists arquivada boolean default false;

-- Cidade da obra
alter table obras add column if not exists cidade text default '';

-- Área construída (m²)
alter table obras add column if not exists area_m2 numeric default 0;

-- Tabela de usuários do sistema (senhas gerenciadas pelo Supabase Auth)
create table if not exists usuarios (
  id uuid default gen_random_uuid() primary key,
  usuario text not null unique,
  nome text not null,
  perfil text not null default 'operacional',
  ativo boolean default true,
  criado_em timestamptz default now()
);
alter table usuarios enable row level security;

-- ENTRADAS DIRETAS (material fiado / sem nota)
create table if not exists entradas_diretas (
  id uuid default gen_random_uuid() primary key,
  item_desc text not null,
  unidade text default 'UN',
  qtd numeric not null,
  preco numeric default 0,
  fornecedor text default '',
  data date default current_date,
  obs text default '',
  criado_em timestamptz default now()
);
alter table entradas_diretas enable row level security;

-- Itens fiscais / encargos no catálogo
insert into materiais (codigo, nome, unidade, preco_medio, categoria) values
  ('000090', 'INSS - Contribuição Previdenciária', 'VB', 0, 'imposto'),
  ('000091', 'DARF - Documento de Arrecadação Federal', 'VB', 0, 'imposto'),
  ('000092', 'ISS - Imposto Sobre Serviços', 'VB', 0, 'imposto'),
  ('000093', 'FGTS - Fundo de Garantia', 'VB', 0, 'imposto'),
  ('000094', 'IRRF - Imposto de Renda Retido na Fonte', 'VB', 0, 'imposto'),
  ('000095', 'DAS - Simples Nacional', 'VB', 0, 'imposto'),
  ('000096', 'CSLL - Contribuição Social sobre Lucro', 'VB', 0, 'imposto'),
  ('000097', 'COFINS - Contribuição para Financiamento', 'VB', 0, 'imposto'),
  ('000098', 'IMOBILIZADO - Equipamento de Escritório', 'UN', 0, 'imobilizado'),
  ('000099', 'IMOBILIZADO - Mobiliário', 'UN', 0, 'imobilizado'),
  ('000100', 'IMOBILIZADO - Equipamento de TI', 'UN', 0, 'imobilizado'),
  ('000101', 'ASSINATURA DE SOFTWARE / SaaS', 'MÊS', 0, 'tecnologia'),
  ('000102', 'ASSINATURA IA / Ferramentas de IA', 'MÊS', 0, 'tecnologia'),
  ('000103', 'CURSO / CAPACITAÇÃO', 'UN', 0, 'tecnologia'),
  ('000104', 'HOSPEDAGEM / DOMÍNIO WEB', 'MÊS', 0, 'tecnologia')
on conflict (codigo) do nothing;

-- Tabela de quinzenas (períodos customizáveis)
create table if not exists diarias_quinzenas (
  id uuid default gen_random_uuid() primary key,
  label text not null,
  data_inicio date not null,
  data_fim date not null,
  fechada boolean default false,
  criado_em timestamptz default now()
);
alter table diarias_quinzenas enable row level security;

-- Tabela de registros de diárias
create table if not exists diarias (
  id uuid default gen_random_uuid() primary key,
  quinzena_id uuid references diarias_quinzenas(id) on delete cascade,
  data date not null,
  funcionario text not null,
  cargo text default '',
  diaria_base numeric default 0,
  periodos jsonb default '[]',
  total_fracoes numeric default 1,
  valor numeric default 0,
  criado_por text default '',
  criado_em timestamptz default now()
);
alter table diarias enable row level security;

-- Tabela de extras/bonificações
create table if not exists diarias_extras (
  id uuid default gen_random_uuid() primary key,
  quinzena_id uuid references diarias_quinzenas(id) on delete cascade,
  funcionario text not null,
  descricao text default '',
  valor numeric default 0,
  obra text default '',
  criado_em timestamptz default now()
);
alter table diarias_extras enable row level security;

-- Repasses CEF (controle de custos)
create table if not exists repasses_cef (
  id uuid default gen_random_uuid() primary key,
  obra_id uuid references obras(id),
  medicao_numero integer not null,
  valor decimal(12,2) not null,
  data_credito date not null,
  observacao text default '',
  tipo text default 'pls',
  criado_em timestamptz default now()
);
alter table repasses_cef enable row level security;
create policy "repasses_cef_all" on repasses_cef for all using (true) with check (true);

-- Rastreamento: quem fez cada lançamento
alter table lancamentos add column if not exists criado_por text default '';
alter table notas_fiscais add column if not exists criado_por text default '';
alter table distribuicoes add column if not exists criado_por text default '';
alter table entradas_diretas add column if not exists criado_por text default '';
alter table repasses_cef add column if not exists criado_por text default '';
alter table obra_adicionais add column if not exists criado_por text default '';
alter table adicional_pagamentos add column if not exists criado_por text default '';

-- Tabela de funcionários para diárias (CRUD dinâmico)
create table if not exists diarias_funcionarios (
  id uuid default gen_random_uuid() primary key,
  nome text not null,
  cargo text not null default 'Servente',
  diaria numeric not null default 80,
  apelidos text[] default '{}',
  ativo boolean default true,
  criado_em timestamptz default now()
);
alter table diarias_funcionarios enable row level security;

-- Seed inicial (apenas se tabela vazia)
insert into diarias_funcionarios (nome, cargo, diaria, apelidos, ativo) values
  ('Anderson', 'Mestre', 170, '{"zezao","zezão"}', true),
  ('Josimar', 'Betoneiro', 90, '{"binlade","binladem","bin laden"}', true),
  ('Nego', 'Pedreiro', 130, '{"seu nego","rochedo"}', true),
  ('Adeilton', 'Pedreiro', 130, '{"adeilto"}', true),
  ('Val', 'Servente', 80, '{}', true),
  ('Rosinaldo', 'Servente', 80, '{"tana"}', true),
  ('Marcone', 'Servente', 80, '{}', true),
  ('Heleno', 'Servente', 80, '{"eleno"}', false)
on conflict do nothing;

-- Slug para Kit de Entrega Digital
alter table obras add column if not exists slug_entrega text default '';
-- Campos extras para entrega (proprietário, endereço)
alter table obras add column if not exists proprietario text default '';
alter table obras add column if not exists endereco_rua text default '';
alter table obras add column if not exists endereco_numero text default '';
alter table obras add column if not exists endereco_bairro text default '';
alter table obras add column if not exists endereco_cep text default '';

-- Ajustes de estoque (inventário inicial, contagem física, correções)
create table if not exists ajustes_estoque (
  id uuid default gen_random_uuid() primary key,
  item_desc text not null,
  unidade text default 'UN',
  qtd numeric not null,
  tipo text not null default 'inventario',
  motivo text default '',
  criado_por text default '',
  criado_em timestamptz default now()
);
alter table ajustes_estoque enable row level security;

-- Contas a pagar (parcelas e contas a prazo)
create table if not exists contas_pagar (
  id uuid default gen_random_uuid() primary key,
  fornecedor text not null,
  descricao text default '',
  valor numeric not null,
  data_vencimento date not null,
  status text default 'pendente',
  data_pagamento date,
  obra_id uuid references obras(id),
  nota_ref text default '',
  criado_em timestamptz default now()
);
alter table contas_pagar enable row level security;
create policy "contas_pagar_all" on contas_pagar for all using (true) with check (true);

-- Projecoes de caixa (fluxo de caixa projetado)
create table if not exists projecoes_caixa (
  id uuid default gen_random_uuid() primary key,
  tipo text not null default 'repasse_cef',
  valor numeric not null,
  data_prevista date not null,
  obra_id uuid references obras(id),
  descricao text default '',
  criado_em timestamptz default now()
);
alter table projecoes_caixa enable row level security;
create policy "projecoes_caixa_all" on projecoes_caixa for all using (true) with check (true);

-- Chamados de garantia pós-entrega
create table if not exists garantia_chamados (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid references obras(id) on delete set null,
  categoria text not null default 'outro',
  descricao_problema text not null,
  solucao text default '',
  status text default 'aberto',
  data_visita date,
  cliente_nome text default '',
  cliente_telefone text default '',
  criado_em timestamptz default now(),
  atualizado_em timestamptz default now()
);
alter table garantia_chamados enable row level security;
create policy "garantia_chamados_all" on garantia_chamados for all using (true) with check (true);`;

// ══════════════════════════════════════════
// ESTADO
// ══════════════════════════════════════════
let usuarioAtual = null;
let obras = [], notas = [], lancamentos = [], distribuicoes = [], entradasDiretas = [], catalogoMateriais = [], repassesCef = [], ajustesEstoque = [];
let itensForm = [], distItemAtual = null, currentCredito = null;
let acSelectedIdx = -1, acFornIdx = -1, cachedFornecedores = [], cachedItens = [];
let obraFiltroAtual = null, catFiltroAtual = null, obrasArquivadas = [];
let diarQuinzenas = [];        // lista de quinzenas do Supabase
let diarQuinzenaAtiva = null;  // quinzena selecionada atualmente


