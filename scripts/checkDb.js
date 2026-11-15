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
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      }
    }, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body || '[]') });
        } catch(e) {
          resolve({ status: res.statusCode, body });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function run() {
  const func = await query('funcionarios_obra?select=id,nome_trabalhador');
  const obras = await query('obras_config?select=id,nome');
  console.log('FUNCIONARIOS:', func.status, func.data);
  console.log('OBRAS:', obras.status, obras.data);
}

run();
