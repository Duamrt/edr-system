const SUPABASE_URL = 'https://mepzoxoahpwcvvlymlfh.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Z9E8KLU8ZIMcWjD-bMG5gg_eM585qWq';


const hdrs = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' };


// USUÁRIOS (admin gerencia aqui)
// Usuários carregados do Supabase — fallback mínimo de emergência
// Fallback completo — usado se Supabase não tiver tabela 'usuarios' ainda
// Após rodar o SQL de setup, os usuários ficam no Supabase e este array é substituído
let USUARIOS = [
  { usuario: 'duamrt',   senha: 'duanxdzin20', perfil: 'admin',       nome: 'Duamrt',        ativo: true },
  { usuario: 'elydart',  senha: '1202elyd@',   perfil: 'admin',       nome: 'Elyda',         ativo: true },
  { usuario: 'admin',    senha: 'admin123',    perfil: 'admin',       nome: 'Administrador', ativo: true },
  { usuario: 'operador', senha: 'op123',       perfil: 'operacional', nome: 'Operador',      ativo: true },
  { usuario: 'anderson', senha: 'mestre123',   perfil: 'mestre',      nome: 'Anderson',      ativo: true },
  { usuario: 'visitante',senha: 'edr2024',     perfil: 'visitante',   nome: 'Visitante',     ativo: true },
];

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
alter table notas_fiscais disable row level security;
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
alter table distribuicoes disable row level security;

-- Coluna para identificar materiais auto-cadastrados pela NF
alter table materiais add column if not exists auto boolean default false;

-- Etapa construtiva nos lançamentos e distribuições
alter table lancamentos add column if not exists etapa text default '';
alter table distribuicoes add column if not exists etapa text default '';

-- Arquivamento de obras concluídas
alter table obras add column if not exists arquivada boolean default false;

-- Cidade da obra
alter table obras add column if not exists cidade text default '';

-- Tabela de usuários do sistema
create table if not exists usuarios (
  id uuid default gen_random_uuid() primary key,
  usuario text not null unique,
  senha text not null,
  nome text not null,
  perfil text not null default 'operacional',
  ativo boolean default true,
  criado_em timestamptz default now()
);
alter table usuarios disable row level security;

-- Usuários padrão (inserir apenas se não existirem)
insert into usuarios (usuario, senha, nome, perfil) values
  ('admin',    'admin123',  'Administrador', 'admin'),
  ('operador', 'op123',     'Operador',      'operacional')
on conflict (usuario) do nothing;

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
alter table entradas_diretas disable row level security;

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
alter table diarias_quinzenas disable row level security;

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
alter table diarias disable row level security;

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
alter table diarias_extras disable row level security;

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
create policy "repasses_cef_all" on repasses_cef for all using (true) with check (true);`;

// ══════════════════════════════════════════
// ESTADO
// ══════════════════════════════════════════
let usuarioAtual = null;
let obras = [], notas = [], lancamentos = [], distribuicoes = [], entradasDiretas = [], catalogoMateriais = [], repassesCef = [];
let itensForm = [], distItemAtual = null, currentCredito = null;
let acSelectedIdx = -1, acFornIdx = -1, cachedFornecedores = [], cachedItens = [];
let obraFiltroAtual = null, catFiltroAtual = null, obrasArquivadas = [];
let diarQuinzenas = [];        // lista de quinzenas do Supabase
let diarQuinzenaAtiva = null;  // quinzena selecionada atualmente


