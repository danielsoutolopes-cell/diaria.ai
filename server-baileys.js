const http = require('http');
const path = require('path');
const fs = require('fs');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  Browsers,
  DisconnectReason,
  downloadMediaMessage,
} = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');
const { useSupabaseAuthState } = require('./lib/baileys-supabase-auth');

const DATA_DIR = process.env.DATA_DIR || __dirname;
const AUTH_DIR = path.join(DATA_DIR, '.baileys_service_auth');
const GROUPS_CONFIG_FILE = path.join(DATA_DIR, 'monitored_groups.json');
const SESSION_ID = process.env.BAILEYS_SESSION_ID || 'default';
const processedMessageIds = new Set();
let lastActivityAt = Date.now();
let currentAuthClear = null;

function loadSavedGroupsConfig() {
  try {
    if (fs.existsSync(GROUPS_CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(GROUPS_CONFIG_FILE, 'utf8'));
    }
  } catch(e) {}
  return {};
}

function saveGroupsConfig(monitoredMap) {
  try {
    fs.writeFileSync(GROUPS_CONFIG_FILE, JSON.stringify(monitoredMap, null, 2), 'utf8');
  } catch(e) {}
}

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

// Configurações otimizadas por Sistema Operacional com browsers oficiais reconhecidos pelo WhatsApp
function getBrowserProfile(targetOs = 'ANDROID') {
  if (targetOs === 'IOS') {
    return Browsers.macOS('Desktop');
  }
  return Browsers.appropriate('Chrome');
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
    if (typeof currentAuthClear === 'function') {
      try { await currentAuthClear(); } catch (e) {}
    }
  }

  let auth = await useSupabaseAuthState(SESSION_ID);
  if (auth) {
    currentAuthClear = auth.clearSession;
    console.log(`[BAILEYS-SERVICE] Persistência ativa no Supabase (session_id='${SESSION_ID}').`);
  } else {
    currentAuthClear = null;
    auth = await useMultiFileAuthState(AUTH_DIR);
    console.log('[BAILEYS-SERVICE] Fallback: persistência em disco local (.baileys_service_auth).');
  }
  const browser = getBrowserProfile(targetOs);
  
  let version = [2, 3000, 1043857760];
  try {
    const { fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
    const waVer = await fetchLatestBaileysVersion();
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
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 60000,
    keepAliveIntervalMs: 10000,
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
        const savedConfig = loadSavedGroupsConfig();
        groups = Object.values(resGroups).map(g => ({
          id: g.id,
          jid: g.id,
          name: g.subject,
          memberCount: g.participants?.length || 0,
          monitored: savedConfig[g.id] !== undefined ? savedConfig[g.id] : false,
        }));
      } catch(e) {}
    }
  });

  // OUVINTE DE MENSAGENS EM TEMPO REAL:
  // Captura mensagens enviadas em grupos monitorados (incluindo comprovantes PIX com imagem enviados pela Administração),
  // baixa a mídia em alta resolução para OCR Gemini Vision e encaminha ao Webhook com messageTimestamp.
  sock.ev.on('messages.upsert', async (m) => {
    try {
      const msg = m.messages?.[0];
      if (!msg || !msg.message) return;

      const hasImage = Boolean(msg.message.imageMessage);
      // Ignora textos de eco do próprio bot, mas PERMITE comprovantes PIX com imagem enviados pelo número conectado (ex.: Patrícia)
      if (msg.key.fromMe && !hasImage) return;

      const remoteJid = msg.key.remoteJid || '';
      const isGroup = remoteJid.endsWith('@g.us');
      if (!isGroup) return;

      // Verificar se o grupo está marcado como monitorado
      const savedConfig = loadSavedGroupsConfig();
      const isMonitored = savedConfig[remoteJid] !== undefined ? savedConfig[remoteJid] : false;
      if (!isMonitored) return;

      // Extrair texto da mensagem ou legenda da imagem
      const text =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        msg.message.imageMessage?.caption ||
        '';

      // Download em alta resolução para OCR Gemini Vision (comprovantes PIX / notas fiscais)
      let fullBase64 = null;
      if (hasImage) {
        try {
          const mediaBuffer = await downloadMediaMessage(
            msg,
            'buffer',
            {},
            {
              reuploadRequest: sock.updateMediaMessage,
            }
          );
          if (mediaBuffer && Buffer.isBuffer(mediaBuffer)) {
            fullBase64 = mediaBuffer.toString('base64');
          }
        } catch (errMedia) {
          console.warn('[BAILEYS-SERVICE] Falha ao baixar imagem em alta resolução:', errMedia?.message || errMedia);
        }
      }

      console.log(
        `[BAILEYS-SERVICE] Mensagem recebida no grupo monitorado [${remoteJid}] (img=${hasImage}, fromMe=${Boolean(msg.key.fromMe)}):`,
        text
      );

      // Enviar para o endpoint do Webhook do Ponto Patrícia para análise de IA e gravação no banco
      const webhookPayload = {
        data: {
          key: msg.key,
          message: msg.message,
          messageTimestamp: msg.messageTimestamp || Math.floor(Date.now() / 1000),
          fromMe: Boolean(msg.key.fromMe),
          base64: fullBase64,
        },
      };

      const res = await fetch('http://localhost:3000/api/webhook/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(webhookPayload),
      });

      const data = await res.json();
      console.log(`[BAILEYS-SERVICE] Retorno do Webhook:`, data.status);

      // Disparar notificações no PRIVADO (nunca no grupo da obra)
      if (data && data.whatsappNotifications && Array.isArray(data.whatsappNotifications)) {
        for (const notif of data.whatsappNotifications) {
          const rawTel = notif.telefone ? notif.telefone.replace(/\D/g, '') : '';
          if (!rawTel) continue;
          const targetJid = `${rawTel}@s.whatsapp.net`;

          console.log(`[BAILEYS-SERVICE] Enviando Ticket Privado para ${notif.destinatario} (${targetJid}). Contém valores? ${notif.contemValores}`);
          await sock.sendMessage(targetJid, { text: notif.mensagem });
        }
      }
    } catch (err) {
      console.error('[BAILEYS-SERVICE] Erro ao processar mensagem do grupo:', err);
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
        const map = {};
        groups.forEach(g => { map[g.jid] = g.monitored; });
        saveGroupsConfig(map);
        console.log(`[BAILEYS-SERVICE] Grupo ${jid} atualizado. Configuração salva em disco.`);
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
    } else if (req.url === '/send-message' && req.method === 'POST') {
      if (!sock || state.status !== 'CONNECTED') {
        res.writeHead(503);
        res.end(JSON.stringify({ error: 'WhatsApp não conectado' }));
        return;
      }
      const rawTel = String(parsed.phone || '').replace(/\D/g, '');
      const text = String(parsed.message || '');
      if (!rawTel || !text) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'phone e message obrigatórios' }));
        return;
      }
      try {
        await sock.sendMessage(`${rawTel}@s.whatsapp.net`, { text });
        res.writeHead(200);
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: err.message }));
      }
    } else if (req.url === '/send-document' && req.method === 'POST') {
      if (!sock || state.status !== 'CONNECTED') {
        res.writeHead(503);
        res.end(JSON.stringify({ error: 'WhatsApp não conectado' }));
        return;
      }
      const rawTel = String(parsed.phone || '').replace(/\D/g, '');
      const base64 = String(parsed.base64 || '').replace(/^data:[^;]+;base64,/, '');
      const fileName = String(parsed.fileName || 'relatorio.pdf');
      const mimetype = String(parsed.mimetype || 'application/pdf');
      const caption = parsed.caption ? String(parsed.caption) : undefined;
      if (!rawTel || !base64) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'phone e base64 obrigatórios' }));
        return;
      }
      try {
        const buffer = Buffer.from(base64, 'base64');
        await sock.sendMessage(`${rawTel}@s.whatsapp.net`, {
          document: buffer,
          mimetype,
          fileName,
          caption,
        });
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, fileName, bytes: buffer.length }));
      } catch (err) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: err.message }));
      }
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
