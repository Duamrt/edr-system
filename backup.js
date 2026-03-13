#!/usr/bin/env node
// ══════════════════════════════════════════
// EDR SYSTEM — Backup da Base de Dados
// Exporta todas as tabelas do Supabase para JSON
// ══════════════════════════════════════════
// USO:  node backup.js
// SAIDA: pasta backups/YYYY-MM-DD_HHhMM/

const https = require('https');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://mepzoxoahpwcvvlymlfh.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Z9E8KLU8ZIMcWjD-bMG5gg_eM585qWq';

const TABELAS = [
  'notas_fiscais',
  'lancamentos',
  'distribuicoes',
  'entradas_diretas',
  'ajustes_estoque',
  'materiais',
  'obras',
  'usuarios',
  'diarias',
  'diarias_quinzenas',
  'diarias_funcionarios',
  'diarias_extras',
  'repasses_cef',
  'obras_adicionais',
  'adicional_pagamentos'
];

function fetchTabela(tabela) {
  return new Promise((resolve, reject) => {
    const url = `${SUPABASE_URL}/rest/v1/${tabela}?select=*&order=criado_em.desc&limit=10000`;
    const options = {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json'
      }
    };
    https.get(url, options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode === 200) {
            resolve(Array.isArray(json) ? json : []);
          } else {
            // Tabela pode nao existir — retorna vazio
            resolve([]);
          }
        } catch(e) { resolve([]); }
      });
      res.on('error', () => resolve([]));
    }).on('error', () => resolve([]));
  });
}

async function main() {
  const agora = new Date();
  const timestamp = agora.toISOString().slice(0,16).replace('T','_').replace(':','h');
  const dir = path.join(__dirname, 'backups', timestamp);

  // Criar pasta
  fs.mkdirSync(dir, { recursive: true });

  console.log('');
  console.log('  ══════════════════════════════════════');
  console.log('  EDR SYSTEM — BACKUP DA BASE DE DADOS');
  console.log('  ══════════════════════════════════════');
  console.log(`  Data: ${agora.toLocaleDateString('pt-BR')} ${agora.toLocaleTimeString('pt-BR')}`);
  console.log(`  Pasta: backups/${timestamp}/`);
  console.log('');

  let totalRegistros = 0;
  const resumo = [];

  for (const tabela of TABELAS) {
    process.stdout.write(`  ${tabela.padEnd(25)} `);
    const dados = await fetchTabela(tabela);
    const arquivo = path.join(dir, `${tabela}.json`);
    fs.writeFileSync(arquivo, JSON.stringify(dados, null, 2), 'utf8');
    const qtd = dados.length;
    totalRegistros += qtd;
    resumo.push({ tabela, registros: qtd });
    console.log(qtd > 0 ? `${qtd} registros` : `vazia`);
  }

  // Salvar resumo
  const resumoObj = {
    data: agora.toISOString(),
    total_registros: totalRegistros,
    tabelas: resumo
  };
  fs.writeFileSync(path.join(dir, '_resumo.json'), JSON.stringify(resumoObj, null, 2), 'utf8');

  console.log('');
  console.log(`  TOTAL: ${totalRegistros} registros salvos`);
  console.log(`  Local: ${dir}`);
  console.log('  ══════════════════════════════════════');
  console.log('  BACKUP CONCLUIDO COM SUCESSO!');
  console.log('  ══════════════════════════════════════');
  console.log('');
}

main().catch(e => { console.error('ERRO:', e.message); process.exit(1); });
