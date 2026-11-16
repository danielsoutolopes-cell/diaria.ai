const http = require('http');
const path = require('path');
const fs = require('fs');
const { default: makeWASocket, useMultiFileAuthState, Browsers, DisconnectReason, fetchLatestWaWebVersion } = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');

const AUTH_DIR = path.join(__dirname, '.baileys_service_auth');

let state = {
  status: 'DISCONNECTED',
  qrCodeUrl: null,
  pairingCode: null,
  phoneNumber: null,
  connectedAt: null,
  lastSyncAt: new Date().toISOString(),
  profileType: 'ANDROID',
};

let groups = [];
let sock = null;

// Configurações otimizadas por Sistema Operacional
function getBrowserProfile(targetOs = 'ANDROID') {
  if (targetOs === 'IOS') {
    // Perfil macOS Desktop Oficial: o WhatsApp no iPhone aceita pareamento imediato
    return Browsers.macOS('Desktop');
  }
  // Perfil Chrome Windows/Ubuntu Oficial: aceito instantaneamente no WhatsApp do Android
  return Browsers.windows('Desktop');
}

async function cleanAuthDir() {
  if (fs.existsSync(AUTH_DIR)) {
    fs.rmSync(AUTH_DIR, { recursive: true, force: true });
  }
}

async function startBaileys(pairingPhone = null, targetOs = 'ANDROID', fresh = false) {
  if (sock) {
    try { sock.end(undefined); } catch(e){}
    sock = null;
  }

  if (fresh) {
    await cleanAuthDir();
  }

  const auth = await useMultiFileAuthState(AUTH_DIR);
  const browser = getBrowserProfile(targetOs);
  
  let version = [2, 3000, 1054759074];
  try {
    const waVer = await fetchLatestWaWebVersion();
    if (waVer && waVer.version) {
      version = waVer.version;
    }
  } catch(e) {
    console.log('[BAILEYS-SERVICE] Erro ao buscar versão do WA Web, usando fallback:', version);
  }

  console.log(`[BAILEYS-SERVICE] Iniciando socket [${targetOs}] | WA Version: ${version.join('.')} | Perfil:`, browser);

  sock = makeWASocket({
    version,
    auth: auth.state,
    browser,
    syncFullHistory: false,
    markOnlineOnConnect: true,
  });

  state.status = 'CONNECTING';
  state.qrCodeUrl = null;
  state.phoneNumber = pairingPhone || null;
  state.profileType = targetOs;
  state.lastSyncAt = new Date().toISOString();

  sock.ev.on('creds.update', auth.saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log(`[BAILEYS-SERVICE] QR Code [${targetOs}] gerado com sucesso!`);
      const qrDataUrl = await QRCode.toDataURL(qr, {
        margin: 2,
        width: 320,
        color: { dark: '#022c22', light: '#ffffff' },
      });
      state.qrCodeUrl = qrDataUrl;
      state.lastSyncAt = new Date().toISOString();
    }

    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      console.log(`[BAILEYS-SERVICE] Conexão encerrada (${targetOs}) com código:`, code);
      
      // Código 515 (Stream Errored - restart required) acontece rotineiramente quando o celular
      // conclui a troca inicial de chaves criptográficas de pareamento!
      // É CRÍTICO reconectar imediatamente SEM deletar a pasta de autenticação:
      if (code === 515 || code === DisconnectReason.restartRequired) {
        console.log(`[BAILEYS-SERVICE] Código ${code} detectado! Reconectando imediatamente para consolidar pareamento...`);
        setTimeout(() => startBaileys(null, targetOs, false), 500);
        return;
      }

      if (code === DisconnectReason.loggedOut) {
        state.status = 'DISCONNECTED';
        state.qrCodeUrl = null;
        state.pairingCode = null;
      }
    } else if (connection === 'open') {
      console.log(`[BAILEYS-SERVICE] Conexão CONCLUÍDA com sucesso via ${targetOs}!`);
      state.status = 'CONNECTED';
      state.phoneNumber = sock.user?.id ? sock.user.id.split(':')[0] : 'Conectado';
      state.connectedAt = new Date().toISOString();
      state.qrCodeUrl = null;
      state.pairingCode = null;
      state.lastSyncAt = new Date().toISOString();

      try {
        const resGroups = await sock.groupFetchAllParticipating();
        groups = Object.values(resGroups).map(g => ({
          id: g.id,
          jid: g.id,
          name: g.subject,
          memberCount: g.participants?.length || 0,
          monitored: true,
        }));
      } catch(e) {}
    }
  });

  if (pairingPhone && !sock.authState.creds.registered) {
    const clean = pairingPhone.replace(/\D/g, '');
    setTimeout(async () => {
      try {
        console.log(`[BAILEYS-SERVICE] Solicitando Pairing Code [${targetOs}] para:`, clean);
        const code = await sock.requestPairingCode(clean);
        state.pairingCode = code ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
        state.lastSyncAt = new Date().toISOString();
        console.log(`[BAILEYS-SERVICE] Pairing Code [${targetOs}] emitido:`, state.pairingCode);
      } catch(e) {
        console.error('[BAILEYS-SERVICE] Erro ao requisitar pairing code:', e);
      }
    }, 2000);
  }
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', '*');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', async () => {
    let parsed = {};
    try { parsed = JSON.parse(body || '{}'); } catch(e){}

    if (req.url === '/status' && req.method === 'GET') {
      res.writeHead(200);
      res.end(JSON.stringify({ session: state, groups }));
    } else if (req.url === '/toggle-group' && req.method === 'POST') {
      const jid = parsed.jid;
      if (jid) {
        groups = groups.map(g => g.jid === jid ? { ...g, monitored: !g.monitored } : g);
      }
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, groups }));
    } else if (req.url === '/connect-qr' && req.method === 'POST') {
      const targetOs = parsed.targetOs || 'ANDROID';
      await startBaileys(null, targetOs, true);
      setTimeout(() => {
        res.writeHead(200);
        res.end(JSON.stringify({ session: state, groups }));
      }, 3000);
    } else if (req.url === '/connect-pairing' && req.method === 'POST') {
      const targetOs = parsed.targetOs || 'ANDROID';
      const phone = parsed.phone || '5511988139833';
      await startBaileys(phone, targetOs, true);
      setTimeout(() => {
        res.writeHead(200);
        res.end(JSON.stringify({ session: state, groups }));
      }, 4000);
    } else if (req.url === '/disconnect' && req.method === 'POST') {
      if (sock) {
        try { sock.logout(); } catch(e){}
        sock = null;
      }
      await cleanAuthDir();
      state = {
        status: 'DISCONNECTED',
        qrCodeUrl: null,
        pairingCode: null,
        phoneNumber: null,
        connectedAt: null,
        lastSyncAt: new Date().toISOString(),
        profileType: 'ANDROID',
      };
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, session: state }));
    } else {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  });
});

const PORT = 3001;
server.listen(PORT, async () => {
  console.log(`[BAILEYS-SERVICE] Microserviço Baileys nativo rodando em http://localhost:${PORT}`);
  // Se já houver credenciais salvas de uma sessão conectada, restaura automaticamente
  if (fs.existsSync(AUTH_DIR)) {
    console.log('[BAILEYS-SERVICE] Sessão anterior encontrada, auto-reconectando...');
    startBaileys(null, 'ANDROID', false);
  }
});
