'use strict';
// Somente preparação de código. Runtime depende de autorização explícita e stack nova LOCAL.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const PROJECT = 'edr-entrada-qa-20261008';
const MARKER = 'EDR_ENTRADA_AUTH_LOCAL_ONLY';
const AUTHORIZED = 'AUTHORIZED_LOCAL_QA';
const REPO = path.resolve(__dirname, '../..');
const EXPECTED_DIR = path.resolve('C:/Users/Duam Rodrigues/.codex/visualizations/2026/10/08/01a11d66-500f-73e1-b511-51e400bfa04c/entrada-auth-local');
const ORIGIN = 'http://127.0.0.1:55421';
const RPCS = ['entrada_plano_estado', 'entrada_plano_operar', 'entrada_plano_resumo', 'entrada_plano_avisos', 'caixa_estado', 'caixa_registrar'];
const TABLES = ['entrada_plano_responsaveis', 'entrada_planos', 'entrada_plano_parcelas', 'entrada_plano_propostas', 'entrada_plano_recebimentos', 'entrada_plano_historico', 'entrada_plano_operacoes', 'repasses_cef', 'obras', 'caixa_movimentos', 'caixa_contas'];
function insist(ok, message) { if (!ok) throw new Error(message); }
function inside(file, dir) { const r = path.relative(path.resolve(dir), path.resolve(file)); return r === '' || (r !== '..' && !r.startsWith('..' + path.sep) && !path.isAbsolute(r)); }
function configFromEnvironment(env = process.env) {
  insist(env.EDR_ENTRADA_AUTH_LOCAL_RUN === AUTHORIZED, 'Auth real LOCAL não autorizado neste runtime. Nenhuma credencial foi lida.');
  insist(env.EDR_ENTRADA_AUTH_LOCAL_DIR && env.EDR_ENTRADA_AUTH_LOCAL_STATUS && env.EDR_POSTGRES_BIN, 'Informe diretório novo autorizado, status JSON privado e binários PostgreSQL existentes.');
  const localDir = path.resolve(env.EDR_ENTRADA_AUTH_LOCAL_DIR), statusFile = path.resolve(env.EDR_ENTRADA_AUTH_LOCAL_STATUS);
  insist(localDir.toLowerCase() === EXPECTED_DIR.toLowerCase(), 'Diretório deve ser exclusivamente entrada-auth-local desta tarefa.');
  insist(!inside(localDir, REPO) && !inside(statusFile, REPO) && inside(statusFile, localDir) && path.extname(statusFile).toLowerCase() === '.json', 'Status JSON privado deve ficar na stack local foraGit.');
  const toml = fs.readFileSync(path.join(localDir, 'supabase/config.toml'), 'utf8');
  insist(/^project_id\s*=\s*"edr-entrada-qa-20261008"\s*$/m.test(toml), 'Identidade da stack LOCAL não confere.');
  insist(!fs.existsSync(path.join(localDir, 'supabase/.temp/project-ref')), 'Projeto vinculado remoto recusado.');
  let values, api, db;
  try { values = JSON.parse(fs.readFileSync(statusFile, 'utf8')); api = new URL(values.API_URL); db = new URL(values.DB_URL); }
  catch (_) { throw new Error('Status privado/URLs inválidos; segredos omitidos.'); }
  insist(api.origin === ORIGIN && api.pathname === '/' && !api.username && !api.password && !api.search && !api.hash, 'API deve ser exclusivamente http://127.0.0.1:55421.');
  insist(['postgres:', 'postgresql:'].includes(db.protocol) && db.hostname === '127.0.0.1' && db.port === '55422' && db.pathname === '/postgres' && db.username === 'postgres' && !db.search && !db.hash, 'Banco deve ser exclusivamente postgres em 127.0.0.1:55422.');
  insist(typeof values.ANON_KEY === 'string' && values.ANON_KEY.length > 20 && typeof values.SERVICE_ROLE_KEY === 'string' && values.SERVICE_ROLE_KEY.length > 20, 'Chaves estritamente locais ausentes; valores omitidos.');
  const psql = path.join(env.EDR_POSTGRES_BIN, process.platform === 'win32' ? 'psql.exe' : 'psql');
  insist(fs.existsSync(psql), 'psql existente não encontrado.');
  return { localDir, api: api.origin, db, anon: values.ANON_KEY, service: values.SERVICE_ROLE_KEY, psql };
}
function bootstrapSql() {
  return fs.readFileSync(path.join(__dirname, 'entrada-plano-auth-local-bootstrap.sql'), 'utf8') + '\n' +
    fs.readFileSync(path.join(REPO, 'sql/caixa-prospectivo-DRAFT.sql'), 'utf8') + '\n' +
    fs.readFileSync(path.join(REPO, 'sql/entrada-plano-DRAFT.sql'), 'utf8') + '\n' +
    fs.readFileSync(path.join(REPO, 'sql/entrada-plano-revalidar-replay.sql'), 'utf8') + '\nnotify pgrst, \'reload schema\';\n';
}
class LocalSupabase {
  constructor(config) {
    insist(process.env.EDR_ENTRADA_AUTH_LOCAL_RUN === AUTHORIZED, 'Execução Auth LOCAL não autorizada.');
    insist(config?.api === ORIGIN && config.db.hostname === '127.0.0.1' && config.db.port === '55422' && path.resolve(config.localDir).toLowerCase() === EXPECTED_DIR.toLowerCase(), 'Runtime aceita somente stack/endpoints locais fixados.');
    this.config = config; this.origin = ORIGIN;
    this.privateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'edr-entrada-auth-private-'));
    this.passfile = path.join(this.privateDir, 'pgpass');
    const pass = decodeURIComponent(config.db.password);
    insist(!/[\r\n]/.test(pass), 'Formato da senha local inválido; valor omitido.');
    const escape = v => v.replaceAll('\\', '\\\\').replaceAll(':', '\\:');
    fs.writeFileSync(this.passfile, `127.0.0.1:55422:postgres:postgres:${escape(pass)}\n`, { mode: 0o600 });
    this.pgEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.toUpperCase().startsWith('PG')));
    Object.assign(this.pgEnv, { PGHOST: '127.0.0.1', PGPORT: '55422', PGDATABASE: 'postgres', PGUSER: 'postgres', PGPASSFILE: this.passfile, PGAPPNAME: PROJECT });
  }
  sql(statement) {
    try { return execFileSync(this.config.psql, ['-X', '-q', '-A', '-t', '-w', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=sqlstate'], { input: statement, encoding: 'utf8', windowsHide: true, timeout: 30000, env: this.pgEnv, stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 4 * 1024 * 1024 }).trim(); }
    catch (e) { const code = String(e.stderr || '').match(/(?:ERROR|FATAL):\s+([A-Z0-9]{5})(?:\s|$)/)?.[1]; throw new Error('SQL_LOCAL_FALHOU' + (code ? ' (' + code + ')' : '') + '; SQL e credenciais omitidos.'); }
  }
  json(statement) { try { return JSON.parse(this.sql(statement).split(/\r?\n/).at(-1)); } catch (e) { if (/SQL_LOCAL_FALHOU/.test(e.message)) throw e; throw new Error('JSON_LOCAL_INVALIDO; resposta omitida.'); } }
  marker() { insist(this.sql('select project_id from edr_entrada_qa.marker where id=1;') === PROJECT, 'Marcador do banco QA local ausente/incorreto.'); }
  async request(route, { token, admin = false, method = 'GET', body, anonymous = false, noKey = false } = {}) {
    let url;
    try { url = new URL(route, this.origin); } catch (_) { throw new Error('Rota local inválida.'); }
    const auth = ['/auth/v1/admin/users', '/auth/v1/token', '/auth/v1/user'].includes(url.pathname);
    const rpc = /^\/rest\/v1\/rpc\/[a-z_]+$/.test(url.pathname);
    const table = /^\/rest\/v1\/([a-z_]+)$/.exec(url.pathname)?.[1];
    insist(route.startsWith('/') && url.origin === this.origin && !url.username && !url.password && !url.hash && (auth || rpc || TABLES.includes(table)), 'Rota fora do ensaio LOCAL recusada.');
    const headers = { 'Content-Type': 'application/json' };
    if (!noKey) headers.apikey = admin ? this.config.service : this.config.anon;
    if (admin) headers.Authorization = 'Bearer ' + this.config.service;
    else if (token) headers.Authorization = 'Bearer ' + token;
    else if (anonymous) headers.Authorization = 'Bearer ' + this.config.anon;
    let response;
    try { response = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(20000) }); }
    catch (_) { throw new Error('HTTP_LOCAL_FALHOU; rota/segredos omitidos.'); }
    let result = null;
    const raw = await response.text(); if (raw) { try { result = JSON.parse(raw); } catch (_) {} }
    return { status: response.status, ok: response.ok, body: result, code: typeof result?.code === 'string' && /^[A-Z0-9_]{1,32}$/.test(result.code) ? result.code : null };
  }
  rpc(name, token, body = {}) { insist(RPCS.includes(name), 'RPC fora do escopo recusada.'); return this.request('/rest/v1/rpc/' + name, { token, method: 'POST', body }); }
  dispose() { insist(inside(this.privateDir, os.tmpdir()) && path.basename(this.privateDir).startsWith('edr-entrada-auth-private-'), 'Temporário privado fora do escopo.'); fs.rmSync(this.privateDir, { recursive: true, force: true }); }
}
module.exports = { LocalSupabase, configFromEnvironment, bootstrapSql, PROJECT, MARKER, AUTHORIZED, REPO, EXPECTED_DIR, ORIGIN, RPCS, TABLES, inside };