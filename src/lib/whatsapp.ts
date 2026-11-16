import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  Browsers,
  WASocket,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import path from 'path';
import fs from 'fs';
import QRCode from 'qrcode';

export interface WhatsAppSessionState {
  status: 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED';
  qrCodeUrl: string | null;
  qrCodeRaw: string | null;
  pairingCode: string | null;
  phoneNumber: string | null;
  connectedAt: string | null;
  lastSyncAt: string;
}

export interface WhatsAppGroupItem {
  id: string;
  jid: string;
  name: string;
  memberCount: number;
  monitored: boolean;
  obraNome?: string;
}

// Pasta de autenticação do Baileys
const AUTH_FOLDER = path.join(process.cwd(), '.baileys_auth');

// Singleton em memória para a instância do socket
declare global {
  var __baileysSocket: WASocket | null | undefined;
  var __baileysState: WhatsAppSessionState | undefined;
  var __baileysGroups: WhatsAppGroupItem[] | undefined;
}

if (!global.__baileysState) {
  global.__baileysState = {
    status: 'DISCONNECTED',
    qrCodeUrl: null,
    qrCodeRaw: null,
    pairingCode: null,
    phoneNumber: null,
    connectedAt: null,
    lastSyncAt: new Date().toISOString(),
  };
}

if (!global.__baileysGroups) {
  global.__baileysGroups = [];
}

const logger = pino({ level: 'silent' });

export async function iniciarOuObterBaileys(numeroPairing?: string): Promise<WhatsAppSessionState> {
  // Se já está conectado, retorna
  if (global.__baileysSocket && global.__baileysState?.status === 'CONNECTED') {
    return global.__baileysState;
  }

  if (!fs.existsSync(AUTH_FOLDER)) {
    fs.mkdirSync(AUTH_FOLDER, { recursive: true });
  }

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
  const { version } = await fetchLatestBaileysVersion();

  // Fecha socket anterior se houver
  if (global.__baileysSocket) {
    try {
      global.__baileysSocket.end(undefined);
    } catch (e) {
      // ignore
    }
    global.__baileysSocket = null;
  }

  const sock = makeWASocket({
    version,
    logger,
    printQRInTerminal: false,
    auth: state,
    browser: Browsers.macOS('Desktop'),
    syncFullHistory: false,
    markOnlineOnConnect: true,
  });

  global.__baileysSocket = sock;
  global.__baileysState = {
    status: 'CONNECTING',
    qrCodeUrl: null,
    qrCodeRaw: null,
    pairingCode: null,
    phoneNumber: numeroPairing || null,
    connectedAt: null,
    lastSyncAt: new Date().toISOString(),
  };

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      try {
        const qrUrl = await QRCode.toDataURL(qr, {
          margin: 2,
          width: 320,
          color: { dark: '#022c22', light: '#ffffff' },
        });
        if (global.__baileysState) {
          global.__baileysState.qrCodeUrl = qrUrl;
          global.__baileysState.qrCodeRaw = qr;
          global.__baileysState.lastSyncAt = new Date().toISOString();
        }
      } catch (err) {
        console.error('Erro ao renderizar QR Code do Baileys:', err);
      }
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      
      console.log(`[BAILEYS] Conexão encerrada. Motivo: ${statusCode}. Reconectar? ${shouldReconnect}`);

      if (global.__baileysState) {
        global.__baileysState.status = 'DISCONNECTED';
        global.__baileysState.qrCodeUrl = null;
        global.__baileysState.pairingCode = null;
      }

      if (shouldReconnect) {
        setTimeout(() => {
          iniciarOuObterBaileys();
        }, 5000);
      }
    } else if (connection === 'open') {
      console.log('[BAILEYS] Conectado com sucesso ao WhatsApp!');
      const phone = sock.user?.id ? sock.user.id.split(':')[0] : 'Conectado';
      
      if (global.__baileysState) {
        global.__baileysState.status = 'CONNECTED';
        global.__baileysState.phoneNumber = phone;
        global.__baileysState.connectedAt = new Date().toISOString();
        global.__baileysState.qrCodeUrl = null;
        global.__baileysState.pairingCode = null;
        global.__baileysState.lastSyncAt = new Date().toISOString();
      }

      // Atualiza lista de grupos
      try {
        const groups = await sock.groupFetchAllParticipating();
        const listaGrupos: WhatsAppGroupItem[] = Object.values(groups).map((g) => ({
          id: g.id,
          jid: g.id,
          name: g.subject,
          memberCount: g.participants?.length || 0,
          monitored: true,
        }));
        global.__baileysGroups = listaGrupos;
      } catch (err) {
        console.error('Erro ao buscar grupos do WhatsApp:', err);
      }
    }
  });

  // Se solicitou Pairing Code (Código de 8 dígitos) e ainda não está registrado
  if (numeroPairing && !sock.authState.creds.registered) {
    try {
      const cleanPhone = numeroPairing.replace(/\D/g, '');
      // Aguarda 1.5s para o socket estar pronto
      await new Promise((r) => setTimeout(r, 1500));
      const code = await sock.requestPairingCode(cleanPhone);
      
      // Formata código no estilo ABCD-1234
      const formatted = code ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
      
      if (global.__baileysState) {
        global.__baileysState.pairingCode = formatted;
        global.__baileysState.phoneNumber = cleanPhone;
        global.__baileysState.lastSyncAt = new Date().toISOString();
      }
      console.log(`[BAILEYS] Pairing Code real gerado para ${cleanPhone}: ${formatted}`);
    } catch (err) {
      console.error('[BAILEYS] Erro ao solicitar pairing code:', err);
    }
  }

  return global.__baileysState;
}

export function getWhatsAppSession(): WhatsAppSessionState {
  return global.__baileysState || {
    status: 'DISCONNECTED',
    qrCodeUrl: null,
    qrCodeRaw: null,
    pairingCode: null,
    phoneNumber: null,
    connectedAt: null,
    lastSyncAt: new Date().toISOString(),
  };
}

export async function gerarNovoQrCode(): Promise<WhatsAppSessionState> {
  return await iniciarOuObterBaileys();
}

export async function gerarPairingCodePorTelefone(numeroTelefone: string): Promise<WhatsAppSessionState> {
  return await iniciarOuObterBaileys(numeroTelefone);
}

export function simularConexaoSucesso(numeroTelefone: string = '5511978543369'): WhatsAppSessionState {
  global.__baileysState = {
    status: 'CONNECTED',
    qrCodeUrl: null,
    qrCodeRaw: null,
    pairingCode: null,
    phoneNumber: numeroTelefone,
    connectedAt: new Date().toISOString(),
    lastSyncAt: new Date().toISOString(),
  };
  return global.__baileysState;
}

export function desconectarWhatsApp(): WhatsAppSessionState {
  if (global.__baileysSocket) {
    try {
      global.__baileysSocket.logout();
    } catch (e) {
      // ignore
    }
    global.__baileysSocket = null;
  }

  // Limpa pasta auth
  if (fs.existsSync(AUTH_FOLDER)) {
    try {
      fs.rmSync(AUTH_FOLDER, { recursive: true, force: true });
    } catch (e) {
      // ignore
    }
  }

  global.__baileysState = {
    status: 'DISCONNECTED',
    qrCodeUrl: null,
    qrCodeRaw: null,
    pairingCode: null,
    phoneNumber: null,
    connectedAt: null,
    lastSyncAt: new Date().toISOString(),
  };
  return global.__baileysState;
}

export function getDiscoveredGroups(): WhatsAppGroupItem[] {
  return global.__baileysGroups || [];
}

export function setDiscoveredGroups(groups: WhatsAppGroupItem[]) {
  global.__baileysGroups = groups;
}

export function toggleGroupMonitored(jid: string): WhatsAppGroupItem[] {
  if (!global.__baileysGroups) global.__baileysGroups = [];
  global.__baileysGroups = global.__baileysGroups.map((g) =>
    g.jid === jid ? { ...g, monitored: !g.monitored } : g
  );
  return global.__baileysGroups;
}
