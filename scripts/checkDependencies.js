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
  const lotes = await query('ponto_lote?select=id');
  const lancamentos = await query('lancamentos_financeiros?select=id');
  console.log('LOTES:', lotes.status, lotes.data);
  console.log('LANCAMENTOS:', lancamentos.status, lancamentos.data);
}

run();
