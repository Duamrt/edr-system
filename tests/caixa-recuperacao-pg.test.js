'use strict';
// Recuperacao NATIVA, integralmente sintetica. Nao aceita host, URL, senha,
// banco existente ou flags externas. Dump/restaure somente no cluster novo do
// harness; listener 127.0.0.1 e todos os processos Windows ocultos.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { randomUUID, createHash } = require('node:crypto');

if (!process.env.EDR_POSTGRES_BIN) {
  test('caixa: dump/restauracao PostgreSQL 17 LOCAL', {
    skip: 'Defina EDR_POSTGRES_BIN; recuperacao nativa NAO testada.'
  }, () => {});
} else {
  for (const key of Object.keys(process.env)) if (key.startsWith('PG')) delete process.env[key];
  const repo = path.resolve(__dirname, '..');
  const taskRoot = path.dirname(repo);
  const evidenceRoot = path.resolve(process.env.EDR_PG_TEST_ROOT || path.join(taskRoot, 'native-pg-caixa-recuperacao'));
  const inside = (root, value) => {
    const relative = path.relative(root, value);
    return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
  };
  // Dados/dumps ficam fora do checkout e somente na tarefa privada ou TEMP.
  assert.ok((inside(taskRoot, evidenceRoot) || inside(os.tmpdir(), evidenceRoot)) && !inside(repo, evidenceRoot),
    'EDR_PG_TEST_ROOT deve ser privado, fora do checkout, dentro de task-3 ou TEMP');
  process.env.EDR_PG_TEST_ROOT = evidenceRoot;
  const { iniciar } = require('./fixtures/estoque-pg-local.cjs');
  const fixtureFile = path.join(__dirname, 'fixtures/caixa-prospectivo-base.sql');
  const migrationFile = path.join(repo, 'sql/caixa-prospectivo-DRAFT.sql');
  const fixture = fs.readFileSync(fixtureFile, 'utf8').replace(/^create role (anon|authenticated);\r?\n/gm, '');
  const migration = fs.readFileSync(migrationFile, 'utf8');
  const owner = 'edr_caixa_recuperacao_owner';
  const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
  const companyA = id(1), companyB = id(2), adminA = id(3), adminB = id(4);
  const cpPartial = id(10), cpFull = id(11), cpCancelled = id(12), cpPaid = id(13), cpB = id(14);
  const literal = value => value == null ? 'null' : "'" + String(value).replaceAll("'", "''") + "'";
  const digest = value => createHash('sha256').update(value).digest('hex');
  const jsonDigest = value => digest(JSON.stringify(value));
  const executable = name => name + (process.platform === 'win32' ? '.exe' : '');
  const tables = [
    ['public', 'companies', 'id'], ['public', 'company_users', 'user_id'],
    ['public', 'contas_pagar', 'id'], ['public', 'caixa_contas', 'id'],
    ['public', 'caixa_movimentos', 'id'], ['public', 'caixa_operacoes', 'company_id,id'],
    ['public', 'caixa_obrigacoes', 'company_id,conta_pagar_id'],
    ['public', 'lancamentos', 'id'], ['public', 'diarias_quinzenas', 'id'],
    ['public', 'distribuicoes', 'id'], ['qa_recuperacao', 'cp_historico', 'id'],
    ['qa_recuperacao', 'fiscal_sentinela', 'id']
  ];
  const dataSQL = `select jsonb_build_object(${tables.map(([schema, name, order]) =>
    `${literal(schema + '.' + name)},(select coalesce(jsonb_agg(to_jsonb(t) order by ${order}), '[]'::jsonb) from ${schema}.${name} t)`
  ).join(',')},'audit_sequence',(select jsonb_build_object('last_value',last_value,'is_called',is_called)
    from qa_recuperacao.cp_historico_id_seq));`;
  const catalogSQL = `select jsonb_build_object(
    'database',(select jsonb_build_object('owner',pg_get_userbyid(datdba),'acl',datacl::text,
      'encoding',pg_encoding_to_char(encoding),'collate',datcollate,'ctype',datctype) from pg_database where datname=current_database()),
    'schemas',(select jsonb_agg(jsonb_build_object('schema',nspname,'owner',pg_get_userbyid(nspowner),'acl',nspacl::text) order by nspname)
      from pg_namespace where nspname in ('public','auth','qa_recuperacao')),
    'relations',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'kind',c.relkind,
      'owner',pg_get_userbyid(c.relowner),'acl',c.relacl::text,'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity) order by n.nspname,c.relname)
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname in ('public','auth','qa_recuperacao') and c.relkind in ('r','p','S','v','m','f')),
    'columns',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'table',c.relname,'name',a.attname,
      'number',a.attnum,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,
      'identity',a.attidentity,'generated',a.attgenerated,'default',pg_get_expr(d.adbin,d.adrelid)) order by n.nspname,c.relname,a.attnum)
      from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace
      left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum
      where n.nspname in ('public','auth','qa_recuperacao') and c.relkind in ('r','p') and a.attnum>0 and not a.attisdropped),
    'constraints',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'table',c.relname,'name',k.conname,
      'type',k.contype,'definition',pg_get_constraintdef(k.oid)) order by n.nspname,c.relname,k.conname)
      from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace
      where n.nspname in ('public','auth','qa_recuperacao')),
    'indexes',(select jsonb_agg(jsonb_build_object('schema',schemaname,'table',tablename,'name',indexname,'definition',indexdef)
      order by schemaname,tablename,indexname) from pg_indexes where schemaname in ('public','auth','qa_recuperacao')),
    'functions',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,
      'args',pg_get_function_identity_arguments(p.oid),'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,
      'security_definer',p.prosecdef,'config',p.proconfig,'definition',pg_get_functiondef(p.oid))
      order by n.nspname,p.proname,pg_get_function_identity_arguments(p.oid))
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','auth','qa_recuperacao') and p.prokind='f'),
    'policies',(select jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname)
      from pg_policies p where schemaname in ('public','auth','qa_recuperacao')),
    'triggers',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'table',c.relname,'name',t.tgname,
      'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid)) order by n.nspname,c.relname,t.tgname)
      from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
      where n.nspname in ('public','auth','qa_recuperacao') and not t.tgisinternal),
    'default_acl',(select jsonb_agg(jsonb_build_object('role',pg_get_userbyid(d.defaclrole),
      'schema',n.nspname,'type',d.defaclobjtype,'acl',d.defaclacl::text) order by d.defaclrole,n.nspname,d.defaclobjtype)
      from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace));`;
  const rolesSQL = `select jsonb_build_object(
    'roles',(select jsonb_agg(jsonb_build_object('name',rolname,'superuser',rolsuper,'inherit',rolinherit,
      'create_role',rolcreaterole,'create_db',rolcreatedb,'login',rolcanlogin,'replication',rolreplication,
      'bypass_rls',rolbypassrls,'connection_limit',rolconnlimit) order by rolname)
      from pg_roles where rolname in ('edr_test','anon','authenticated','${owner}')),
    'memberships',(select coalesce(jsonb_agg(jsonb_build_object('role',r.rolname,'member',m.rolname,
      'grantor',g.rolname,'admin',a.admin_option,'inherit',a.inherit_option,'set',a.set_option)
      order by r.rolname,m.rolname),'[]'::jsonb) from pg_auth_members a
      join pg_roles r on r.oid=a.roleid join pg_roles m on m.oid=a.member join pg_roles g on g.oid=a.grantor
      where r.rolname in ('edr_test','anon','authenticated','${owner}') or m.rolname in ('edr_test','anon','authenticated','${owner}')));`;

  test('caixa: dump/restauracao PostgreSQL 17 LOCAL auditavel', { timeout: 180000 }, async t => {
    let pg;
    const report = { synthetic_only: true, remote: false, listener: '127.0.0.1', tests: [], recovery_confirmed: false };
    let sequence = 0;
    const knownDatabases = new Set();
    const source = 'edr_caixa_rec_fonte';
    let control, observer, actorA, actorB, baseline, catalog, roles, stateA, stateB, dumpFile, backupManifest, restored;
    const normalizeState = state => ({ ...state, pagamentos: [...state.pagamentos].sort((a, b) => a.conta_pagar_id.localeCompare(b.conta_pagar_id)) });
    const rpcSQL = (pedido, operation) => `select public.caixa_registrar(${literal(operation)}::uuid,${literal(JSON.stringify(pedido))}::jsonb);`;

    try {
      pg = await iniciar();
      report.cluster = pg.pasta;
      report.postgres = pg.versao;
      report.port = pg.porta;
      report.started_at = new Date().toISOString();
      report.fixture_sha256 = digest(fs.readFileSync(fixtureFile));
      report.draft_sha256 = digest(fs.readFileSync(migrationFile));
      report.test_sha256 = digest(fs.readFileSync(__filename));
      report.harness_sha256 = digest(fs.readFileSync(path.join(__dirname, 'fixtures/estoque-pg-local.cjs')));
      report.postgres_pid = Number(fs.readFileSync(path.join(pg.dados, 'postmaster.pid'), 'utf8').split(/\r?\n/)[0]);
      console.log('RECUPERACAO CAIXA ' + pg.versao + '; 127.0.0.1; evidencias ' + pg.pasta);
      const commandLog = path.join(pg.pasta, 'ferramentas.jsonl');
      const saveReport = () => fs.writeFileSync(path.join(pg.pasta, 'RECUPERACAO-RESULTADO.json'), JSON.stringify(report, null, 2));
      const localArgs = database => ['-h', '127.0.0.1', '-p', String(pg.porta), '-U', 'edr_test', '-w', '-d', database];
      function run(name, args, allowFailure = false) {
        const result = spawnSync(path.join(pg.bin, executable(name)), args, { encoding: 'utf8', windowsHide: true,
          timeout: 30000, maxBuffer: 8 * 1024 * 1024,
          env: { ...process.env, PGCONNECT_TIMEOUT: '5', PGCLIENTENCODING: 'UTF8', PGAPPNAME: 'edr_caixa_recuperacao_local' } });
        const evidence = { tool: name, args, status: result.status, error: result.error?.message || null,
          stdout: result.stdout || '', stderr: result.stderr || '' };
        fs.appendFileSync(commandLog, JSON.stringify(evidence) + '\n');
        if (!allowFailure) {
          assert.ifError(result.error);
          assert.equal(result.status, 0, name + ': ' + (result.stderr || 'falha sem mensagem'));
        }
        return result;
      }
      async function subtest(name, fn) {
        await t.test(name, async () => {
          try { await fn(); report.tests.push({ name, passed: true }); }
          catch (error) { report.tests.push({ name, passed: false, error: error.message }); throw error; }
          finally { saveReport(); }
        });
        assert.equal(report.tests.at(-1).passed, true, 'Ensaio interrompido: prerequisito falhou');
      }
      control = pg.conectar('postgres', 'edr_caixa_recuperacao_controle');
      async function createDatabase(name) {
        assert.match(name, /^edr_caixa_rec_[a-z0-9_]+$/);
        assert.equal(knownDatabases.has(name), false, 'Nunca reutilizar/substituir banco existente');
        assert.equal(await control.json(`select to_json(count(*)) from pg_database where datname=${literal(name)};`), 0);
        await control.query(`create database ${name} owner ${owner} template template0;`);
        knownDatabases.add(name);
      }
      async function actor(database, user) {
        assert.ok(knownDatabases.has(database));
        const session = pg.conectar(database, 'edr_caixa_recuperacao_usuario');
        await session.query(`select set_config('request.jwt.claim.sub',${literal(user)},false); set role authenticated;`);
        return session;
      }
      async function sourceUnchanged() {
        assert.deepEqual(await observer.json(dataSQL), baseline, 'Banco fonte deve permanecer byte-a-byte em sua representacao de dados');
        assert.deepEqual(await observer.json(catalogSQL), catalog, 'Schema/permissoes da fonte nao podem mudar');
      }
      async function restore(file, manifest, prepareConflict = false) {
        assert.ok(inside(pg.pasta, file), 'Aceita somente arquivo produzido nesta pasta privada');
        const result = { target: 'edr_caixa_rec_destino_' + (++sequence), complete: false, created: false };
        try {
          assert.equal(digest(fs.readFileSync(file)), manifest.sha256, 'Dump incompleto/alterado: SHA-256 diverge');
          const toc = run('pg_restore', ['--list', file]);
          for (const table of ['caixa_contas', 'caixa_movimentos', 'caixa_operacoes', 'caixa_obrigacoes', 'contas_pagar', 'cp_historico']) {
            assert.match(toc.stdout, new RegExp('TABLE DATA (public|qa_recuperacao) ' + table + ' '), 'Dump deve incluir dados de ' + table);
          }
          assert.match(toc.stdout, /FUNCTION public caixa_registrar/);
          assert.match(toc.stdout, /POLICY public caixa_movimentos/);
          assert.notEqual(result.target, source);
          await createDatabase(result.target);
          result.created = true;
          if (prepareConflict) {
            const s = pg.conectar(result.target, 'edr_caixa_recuperacao_conflito');
            await s.query('create table public.caixa_contas(marcador text); insert into public.caixa_contas values(\'fixture anterior ao restore\');');
            await s.fechar();
          }
          const execution = run('pg_restore', [...localArgs(result.target), '--single-transaction', '--exit-on-error', file], true);
          result.status = execution.status;
          assert.ifError(execution.error);
          assert.equal(execution.status, 0, 'Restauracao abortada: ' + execution.stderr);
          result.loaded = true;
          // Sucesso de pg_restore sozinho nao confirma recuperacao.
          const s = pg.conectar(result.target, 'edr_caixa_recuperacao_validacao');
          assert.deepEqual(await s.json(dataSQL), baseline);
          assert.deepEqual(await s.json(catalogSQL), catalog);
          result.complete = true;
          result.verified_at = new Date().toISOString();
          return result;
        } catch (error) {
          result.error = error.message;
          return result;
        } finally {
          fs.writeFileSync(path.join(pg.pasta, result.target + '-restore.json'), JSON.stringify(result, null, 2));
        }
      }

      await subtest('dataset sintetico cobre ledger, corte, CP e historico auditado', async () => {
        await control.query(`create role anon; create role authenticated; create role ${owner} nologin;`);
        await createDatabase(source);
        observer = pg.conectar(source, 'edr_caixa_recuperacao_fonte');
        await observer.query(`set role ${owner};\n${fixture}\n${migration}\nreset role;`);
        // Trigger e auditoria APENAS na fixture descartavel, sem tocar trigger legado.
        await observer.query(`set role ${owner};
          create schema qa_recuperacao;
          create table qa_recuperacao.cp_historico(id bigint generated always as identity primary key,
            evento text not null, antes jsonb, depois jsonb, usuario_id uuid, registrado_em timestamptz not null default clock_timestamp());
          create function qa_recuperacao.auditar_cp() returns trigger language plpgsql security definer
            set search_path=pg_catalog,public,qa_recuperacao as $$ begin
              insert into qa_recuperacao.cp_historico(evento,antes,depois,usuario_id)
              values(TG_OP,case when TG_OP='INSERT' then null else to_jsonb(OLD) end,
                case when TG_OP='DELETE' then null else to_jsonb(NEW) end,auth.uid());
              if TG_OP='DELETE' then return OLD; else return NEW; end if;
            end $$;
          revoke all on function qa_recuperacao.auditar_cp() from public,anon,authenticated;
          create trigger cp_historico_sintetico after insert or update or delete on public.contas_pagar
            for each row execute function qa_recuperacao.auditar_cp();
          create table qa_recuperacao.fiscal_sentinela(id integer primary key,referencia text,valor numeric);
          insert into qa_recuperacao.fiscal_sentinela values(1,'Fiscal sintetico sem movimento',73.19);
          insert into public.companies(id) values('${companyA}'),('${companyB}');
          insert into public.company_users(user_id,company_id,role,active) values
            ('${adminA}','${companyA}','admin',true),('${adminB}','${companyB}','admin',true);
          insert into public.contas_pagar(id,company_id,valor,descricao,data_vencimento,status,data_pagamento,tipo,nota_ref) values
            ('${cpPartial}','${companyA}',100,'Obrigacao antiga parcial QA','2000-01-01','pendente',null,'despesa','QA-PARCIAL'),
            ('${cpFull}','${companyA}',150,'Obrigacao antiga completa QA','2000-02-01','vencido',null,'despesa','QA-COMPLETA'),
            ('${cpCancelled}','${companyA}',60,'Obrigacao QA cancelamento','2000-03-01','vencido','2000-03-02','despesa','QA-CANCELADA'),
            ('${cpPaid}','${companyA}',80,'Obrigacao ja paga antes do marco QA','2000-04-01','pago','2001-06-04','despesa','QA-JA-PAGA'),
            ('${cpB}','${companyB}',90,'Obrigacao outro tenant QA','2000-05-01','pendente',null,'despesa','QA-B');
          reset role;`);
        actorA = await actor(source, adminA); actorB = await actor(source, adminB);
        const opening = (bank, cash) => ({ action: 'abertura', corte_local: '2001-06-05T18:23', fuso: 'America/Sao_Paulo',
          contas: [{ codigo: 'banco', nome: 'Banco QA recuperacao', saldo_centavos: bank },
            { codigo: 'dinheiro', nome: 'Dinheiro QA recuperacao', saldo_centavos: cash }] });
        await actorA.json(rpcSQL(opening(100000, 20000), randomUUID()));
        await actorB.json(rpcSQL(opening(30000, 5000), randomUUID()));
        const accounts = (await actorA.json('select public.caixa_estado();')).contas;
        const bank = accounts.find(a => a.codigo === 'banco').id, cash = accounts.find(a => a.codigo === 'dinheiro').id;
        const movement = extra => ({ action: 'movimento', tipo: 'saida', conta_id: bank, destino_id: null,
          valor_centavos: 1000, data_efetiva: '2001-06-06', hora_efetiva: null, decisao_corte: null,
          descricao: 'Movimento sintetico recuperacao', conta_pagar_id: null, ...extra });
        for (const pedido of [
          movement({ tipo: 'entrada', valor_centavos: 12500, descricao: 'Entrada QA' }),
          movement({ conta_id: cash, valor_centavos: 1500, descricao: 'Saida QA' }),
          movement({ tipo: 'transferencia', destino_id: cash, valor_centavos: 5000, descricao: 'Transferencia QA' }),
          movement({ valor_centavos: 250, descricao: 'Tarifa separada QA' }),
          movement({ tipo: 'pagamento', conta_pagar_id: cpPartial, valor_centavos: 4000, descricao: 'Parcial QA' }),
          movement({ tipo: 'pagamento', conta_pagar_id: cpFull, valor_centavos: 5000, descricao: 'Primeira parcial quitacao QA' }),
          movement({ tipo: 'pagamento', conta_pagar_id: cpFull, conta_id: cash, valor_centavos: 10000,
            data_efetiva: '2001-06-07', descricao: 'Quitacao QA' })
        ]) await actorA.json(rpcSQL(pedido, randomUUID()));
        const cancelled = await actorA.json(rpcSQL(movement({ tipo: 'pagamento', conta_pagar_id: cpCancelled,
          valor_centavos: 6000, descricao: 'Pagamento integral a cancelar QA' }), randomUUID()));
        await actorA.json(rpcSQL({ action: 'cancelar', movimento_id: cancelled.movimento_id, motivo: 'Cancelamento sintetico QA' }, randomUUID()));
        await actorA.json(rpcSQL(movement({ data_efetiva: '2001-06-05', decisao_corte: 'incluido_abertura',
          descricao: 'Historico incluido no marco QA' }), randomUUID()));
        baseline = await observer.json(dataSQL); catalog = await observer.json(catalogSQL); roles = await observer.json(rolesSQL);
        stateA = normalizeState(await actorA.json('select public.caixa_estado();'));
        stateB = normalizeState(await actorB.json('select public.caixa_estado();'));
        assert.deepEqual(stateA.contas.map(c => c.saldo_centavos), [98250, 13500]);
        assert.equal(stateA.total_centavos, 111750); assert.equal(stateB.total_centavos, 35000);
        assert.equal(baseline['public.caixa_operacoes'].length, 12);
        assert.equal(baseline['public.caixa_movimentos'].length, 9);
        assert.equal(baseline['public.caixa_obrigacoes'].length, 3);
        assert.equal(baseline['qa_recuperacao.cp_historico'].length, 10);
        const cp = value => baseline['public.contas_pagar'].find(c => c.id === value);
        assert.equal(cp(cpPartial).status, 'pendente'); assert.equal(cp(cpPartial).data_pagamento, null);
        assert.equal(cp(cpFull).status, 'pago'); assert.equal(cp(cpFull).data_pagamento, '2001-06-07');
        assert.equal(cp(cpCancelled).status, 'vencido'); assert.equal(cp(cpCancelled).data_pagamento, '2000-03-02');
        assert.equal(cp(cpPaid).status, 'pago'); assert.equal(cp(cpPaid).data_pagamento, '2001-06-04');
        assert.deepEqual(baseline['public.lancamentos'], [{ id: 1, total: 91.23 }]);
        assert.deepEqual(baseline['public.distribuicoes'], [{ id: 1, qtd: 7 }]);
        assert.deepEqual(baseline['public.diarias_quinzenas'], [{ id: 1, status: 'fechada' }]);
        assert.ok(baseline['public.companies'].every(c => c.saldo_manual === 123.45));
        for (const name of ['caixa_contas', 'caixa_movimentos', 'caixa_operacoes', 'caixa_obrigacoes']) {
          const relation = catalog.relations.find(r => r.schema === 'public' && r.name === name);
          assert.equal(relation.owner, owner); assert.equal(relation.rls, true);
        }
        fs.writeFileSync(path.join(pg.pasta, 'snapshot-dados-sinteticos.json'), JSON.stringify(baseline, null, 2));
        fs.writeFileSync(path.join(pg.pasta, 'snapshot-catalogo.json'), JSON.stringify(catalog, null, 2));
        report.expected_counts = { receipts: 12, movements: 9, obligations_snapshots: 3, cp_history: 10 };
      });

      await subtest('pg_dump custom integral, roles sem senhas, TOC e manifesto SHA-256', async () => {
        dumpFile = path.join(pg.pasta, 'caixa-sintetico.dump');
        const versions = {};
        for (const tool of ['pg_dump', 'pg_restore', 'pg_dumpall']) {
          versions[tool] = run(tool, ['--version']).stdout.trim(); assert.match(versions[tool], /\(PostgreSQL\) 17\./);
        }
        const dump = run('pg_dump', [...localArgs(source), '--format=custom', '--file', dumpFile]);
        assert.equal(dump.stderr.trim(), '', 'Dump com warning exige revisao');
        const rolesFile = path.join(pg.pasta, 'roles-sinteticas-sem-senhas.sql');
        run('pg_dumpall', ['-h', '127.0.0.1', '-p', String(pg.porta), '-U', 'edr_test', '-w',
          '-l', 'postgres', '--roles-only', '--no-role-passwords', '--file', rolesFile]);
        const roleDefinitions = fs.readFileSync(rolesFile, 'utf8');
        for (const role of [owner, 'anon', 'authenticated', 'edr_test']) assert.match(roleDefinitions, new RegExp('CREATE ROLE ' + role + ';'));
        assert.doesNotMatch(roleDefinitions, /\bPASSWORD\b/i);
        const toc = run('pg_restore', ['--list', dumpFile]).stdout;
        fs.writeFileSync(path.join(pg.pasta, 'dump-toc.txt'), toc);
        for (const table of tables.map(([, name]) => name)) assert.match(toc, new RegExp('TABLE DATA (public|qa_recuperacao) ' + table + ' '));
        for (const flag of ['POLICY public caixa_movimentos', 'ACL public FUNCTION caixa_registrar', 'TRIGGER public contas_pagar cp_historico_sintetico']) {
          assert.ok(toc.includes(flag), 'TOC deve preservar ' + flag);
        }
        backupManifest = { synthetic_only: true, source, format: 'custom', versions,
          archive: path.basename(dumpFile), bytes: fs.statSync(dumpFile).size, sha256: digest(fs.readFileSync(dumpFile)),
          roles_file: path.basename(rolesFile), roles_sha256: digest(fs.readFileSync(rolesFile)),
          roles_scope: 'globais, capturadas sem senha; ja existentes no mesmo cluster novo',
          fixture_sha256: report.fixture_sha256, draft_sha256: report.draft_sha256,
          test_sha256: report.test_sha256, harness_sha256: report.harness_sha256,
          data_sha256: jsonDigest(baseline), catalog_sha256: jsonDigest(catalog), roles_state_sha256: jsonDigest(roles),
          captured_at: new Date().toISOString(), recovery_confirmed: false };
        fs.writeFileSync(path.join(pg.pasta, 'BACKUP-MANIFESTO.json'), JSON.stringify(backupManifest, null, 2));
        report.backup = backupManifest;
        await sourceUnchanged();
      });

      await subtest('pg_restore atomico em banco NOVO preserva dados, schema e owners', async () => {
        restored = await restore(dumpFile, backupManifest);
        assert.equal(restored.complete, true, restored.error);
        assert.notEqual(restored.target, source);
        report.restored_database = restored.target;
        const s = pg.conectar(restored.target, 'edr_caixa_recuperacao_comparacao');
        const data = await s.json(dataSQL), metadata = await s.json(catalogSQL);
        assert.deepEqual(data, baseline); assert.deepEqual(metadata, catalog);
        assert.deepEqual(await s.json(rolesSQL), roles, 'Roles globais nao mudam durante dump/restore');
        report.restored_data_sha256 = jsonDigest(data); report.restored_catalog_sha256 = jsonDigest(metadata);
        assert.equal(report.restored_data_sha256, backupManifest.data_sha256);
        assert.equal(report.restored_catalog_sha256, backupManifest.catalog_sha256);
        await sourceUnchanged();
      });

      await subtest('estado, snapshots, datas originais e sentinelas coincidem apos restore', async () => {
        const a = await actor(restored.target, adminA), b = await actor(restored.target, adminB);
        assert.deepEqual(normalizeState(await a.json('select public.caixa_estado();')), stateA);
        assert.deepEqual(normalizeState(await b.json('select public.caixa_estado();')), stateB);
        const s = pg.conectar(restored.target, 'edr_caixa_recuperacao_sentinelas');
        const data = await s.json(dataSQL);
        for (const key of ['public.contas_pagar', 'public.caixa_obrigacoes', 'qa_recuperacao.cp_historico',
          'public.lancamentos', 'public.distribuicoes', 'public.diarias_quinzenas', 'public.companies', 'qa_recuperacao.fiscal_sentinela', 'audit_sequence']) {
          assert.deepEqual(data[key], baseline[key], key + ' preservado integralmente');
        }
        const original = data['public.caixa_obrigacoes'].find(o => o.conta_pagar_id === cpCancelled);
        assert.equal(original.status_original, 'vencido'); assert.equal(original.data_pagamento_original, '2000-03-02');
        await a.fechar(); await b.fechar();
      });

      await subtest('reenvio de TODOS os 12 UUIDs apos restore nao duplica saldo/recibo/historico', async () => {
        const a = await actor(restored.target, adminA), b = await actor(restored.target, adminB);
        for (const receipt of baseline['public.caixa_operacoes']) {
          const session = receipt.usuario_id === adminA ? a : b;
          assert.deepEqual(await session.json(rpcSQL(receipt.pedido, receipt.id)), receipt.resultado);
        }
        const s = pg.conectar(restored.target, 'edr_caixa_recuperacao_idempotencia');
        assert.deepEqual(await s.json(dataSQL), baseline, 'Retry nao acrescenta nem atualiza qualquer linha, timestamp ou auditoria');
        assert.deepEqual(normalizeState(await a.json('select public.caixa_estado();')), stateA);
        assert.deepEqual(normalizeState(await b.json('select public.caixa_estado();')), stateB);
        await a.fechar(); await b.fechar(); await sourceUnchanged();
      });

      await subtest('ACL/RLS/functions restauradas mantem isolamento e administrador ativo', async () => {
        const s = pg.conectar(restored.target, 'edr_caixa_recuperacao_permissoes');
        assert.deepEqual(await s.json(catalogSQL), catalog);
        for (const table of ['caixa_contas', 'caixa_movimentos', 'caixa_operacoes', 'caixa_obrigacoes']) {
          const grants = await s.json(`select jsonb_build_object('select',has_table_privilege('authenticated','public.${table}','SELECT'),
            'insert',has_table_privilege('authenticated','public.${table}','INSERT'),'update',has_table_privilege('authenticated','public.${table}','UPDATE'),
            'delete',has_table_privilege('authenticated','public.${table}','DELETE'),'anon',has_table_privilege('anon','public.${table}','SELECT'));`);
          assert.deepEqual(grants, { select: true, insert: false, update: false, delete: false, anon: false });
          const a = await actor(restored.target, adminA), b = await actor(restored.target, adminB);
          assert.equal(await a.json(`select to_json(count(*)) from public.${table};`), baseline['public.' + table].filter(row => row.company_id === companyA).length);
          assert.equal(await b.json(`select to_json(count(*)) from public.${table};`), baseline['public.' + table].filter(row => row.company_id === companyB).length);
          await a.fechar(); await b.fechar();
        }
        for (const fn of ['caixa_estado()', 'caixa_registrar(uuid,jsonb)']) {
          assert.deepEqual(await s.json(`select jsonb_build_object('auth',has_function_privilege('authenticated','public.${fn}','EXECUTE'),
            'anon',has_function_privilege('anon','public.${fn}','EXECUTE'));`), { auth: true, anon: false });
        }
        // Apenas no banco restaurado sintetico; retorna exatamente ao snapshot.
        await s.query(`update public.company_users set active=false where user_id='${adminA}';`);
        const inactive = await actor(restored.target, adminA);
        assert.equal(await inactive.json('select to_json(count(*)) from public.caixa_movimentos;'), 0);
        await assert.rejects(inactive.json('select public.caixa_estado();'), /administrador ativo/);
        const inactiveRetry = await actor(restored.target, adminA);
        const previous = baseline['public.caixa_operacoes'].find(r => r.usuario_id === adminA);
        await assert.rejects(inactiveRetry.json(rpcSQL(previous.pedido, previous.id)), /administrador ativo/);
        await s.query(`update public.company_users set active=true where user_id='${adminA}';`);
        assert.deepEqual(await s.json(dataSQL), baseline); await sourceUnchanged();
      });

      await subtest('dump incompleto falha no hash antes de criar destino; fonte permanece intacta', async () => {
        const truncated = path.join(pg.pasta, 'caixa-truncado.dump');
        const bytes = fs.readFileSync(dumpFile);
        // Preserva o TOC, mas corta a ultima carga de dados: alem do hash,
        // o caso seguinte exige falha real durante a restauracao transacional.
        fs.writeFileSync(truncated, bytes.subarray(0, bytes.length - 64));
        const result = await restore(truncated, backupManifest);
        assert.equal(result.complete, false); assert.equal(result.created, false);
        assert.match(result.error, /Dump incompleto\/alterado/);
        assert.equal(await control.json(`select to_json(count(*)) from pg_database where datname='${result.target}';`), 0);
        report.truncated_hash_failure = result; await sourceUnchanged();
      });

      await subtest('arquivo truncado com TOC legivel falha durante restore e reverte dados parciais', async () => {
        const truncated = path.join(pg.pasta, 'caixa-truncado.dump');
        const result = await restore(truncated, { ...backupManifest, sha256: digest(fs.readFileSync(truncated)) });
        assert.equal(result.complete, false); assert.equal(result.loaded, undefined);
        assert.equal(result.created, true, 'TOC deve ser legivel para testar a falha DURANTE pg_restore');
        assert.notEqual(result.status, 0); assert.match(result.error, /Restauracao abortada/);
        const s = pg.conectar(result.target, 'edr_caixa_recuperacao_truncado');
        assert.equal(await s.json("select to_json(count(*)) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','auth','qa_recuperacao') and c.relkind='r';"), 0,
          'Single transaction nao deixa tabelas/dados parcialmente restaurados');
        report.truncated_restore_failure = result; await sourceUnchanged();
      });

      await subtest('erro SQL em destino novo faz rollback integral e nunca substitui fonte', async () => {
        const result = await restore(dumpFile, backupManifest, true);
        assert.equal(result.complete, false); assert.equal(result.created, true); assert.notEqual(result.status, 0);
        assert.match(result.error, /Restauracao abortada/);
        const s = pg.conectar(result.target, 'edr_caixa_recuperacao_falha_sql');
        assert.deepEqual(await s.json('select jsonb_agg(to_jsonb(c)) from public.caixa_contas c;'), [{ marcador: 'fixture anterior ao restore' }]);
        assert.equal(await s.json("select to_json(count(*)) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','auth','qa_recuperacao') and c.relkind='r';"), 1);
        assert.equal(await s.json("select to_json(count(*)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','auth','qa_recuperacao');"), 0);
        report.sql_restore_failure = result; await sourceUnchanged();
      });
      report.recovery_confirmed = true;
      report.successful_subtests = report.tests.filter(result => result.passed).length;
      report.finished_at = new Date().toISOString();
      saveReport();
    } finally {
      if (pg) {
        try {
          await pg.parar();
          const status = spawnSync(path.join(pg.bin, executable('pg_ctl')), ['-D', pg.dados, 'status'],
            { encoding: 'utf8', windowsHide: true, timeout: 10000 });
          assert.equal(status.status, 3, 'pg_ctl deve confirmar ausencia de servidor');
          assert.equal(fs.existsSync(path.join(pg.dados, 'postmaster.pid')), false, 'Cluster deve estar encerrado');
          report.stopped_at = new Date().toISOString(); report.stop_confirmed = true;
          console.log('RECUPERACAO CAIXA: cluster encerrado e confirmado; ' + report.tests.filter(result => result.passed).length + ' subtestes aprovados; ' + pg.pasta);
        } catch (error) {
          report.stop_confirmed = false; report.stop_error = error.message; throw error;
        } finally {
          fs.writeFileSync(path.join(pg.pasta, 'RECUPERACAO-RESULTADO.json'), JSON.stringify(report, null, 2));
        }
      }
    }
  });
}
