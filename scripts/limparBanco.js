const fs = require('fs');
const https = require('https');

const env = fs.readFileSync('.env', 'utf-8');
const envMap = {};
env.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    const key = parts[0].trim();
    const val = parts.slice(1).join('=').trim().replace(/^["']|["']$/g, '');
    envMap[key] = val;
  }
});

const baseUrl = envMap['SUPABASE_URL'];
const key = envMap['SUPABASE_SERVICE_ROLE_KEY'];

function query(endpoint, method = 'GET') {
  return new Promise((resolve, reject) => {
    const url = new URL(baseUrl + '/rest/v1/' + endpoint);
    const req = https.request(url, {
      method,
      headers: {
        'apikey': key,
        'Authorization': 'Bearer ' + key,
        'Content-Type': 'application/json'
      }
    }, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => resolve({ status: res.statusCode, data: body }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function run() {
  console.log('1. Apagando funcionarios_obra...');
  const resFunc = await query('funcionarios_obra?id=neq.00000000-0000-0000-0000-000000000000', 'DELETE');
  console.log('Funcionarios apagados:', resFunc.status);

  console.log('2. Apagando obras_config...');
  const resObras = await query('obras_config?id=neq.00000000-0000-0000-0000-000000000000', 'DELETE');
  console.log('Obras apagadas:', resObras.status);

  console.log('3. Limpando apelidos vinculados em encarregados_obras...');
  const resApelidos = await query('encarregados_obras?telefone=eq.SYSTEM_ALIASES_CONFIG', 'DELETE');
  console.log('Apelidos limpos:', resApelidos.status);

  console.log('4. Verificando estado final...');
  const funcFinal = await query('funcionarios_obra?select=id');
  const obrasFinal = await query('obras_config?select=id');
  console.log('Funcionarios restantes:', funcFinal.data);
  console.log('Obras restantes:', obrasFinal.data);
}

run();
