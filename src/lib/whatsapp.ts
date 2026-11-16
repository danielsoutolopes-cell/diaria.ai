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
  var __baileysStarting: Promise<WhatsAppSessionState> | undefined;
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

/**
 * Limpa completamente a sessão e reinicia do zero (clean state)
 */
export function limparSessaoLocal(): void {
  console.log('[BAILEYS] Limpando sessão local e encerrando socket...');
  if (global.__baileysSocket) {
    try {
      global.__baileysSocket.end(undefined);
    } catch (e) {
      // ignore
    }
    global.__baileysSocket = null;
  }

  if (fs.existsSync(AUTH_FOLDER)) {
    try {
      fs.rmSync(AUTH_FOLDER, { recursive: true, force: true });
      console.log('[BAILEYS] Pasta .baileys_auth apagada com sucesso.');
    } catch (e) {
      console.error('[BAILEYS] Erro ao apagar .baileys_auth:', e);
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
  global.__baileysStarting = undefined;
}

export async function iniciarOuObterBaileys(numeroPairing?: string, forcarReinicio: boolean = false): Promise<WhatsAppSessionState> {
  if (forcarReinicio) {
    limparSessaoLocal();
  }

  // Se já está conectado, retorna estado
  if (global.__baileysSocket && global.__baileysState?.status === 'CONNECTED') {
    return global.__baileysState;
  }

  if (!fs.existsSync(AUTH_FOLDER)) {
    fs.mkdirSync(AUTH_FOLDER, { recursive: true });
  }

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
  const { version } = await fetchLatestBaileysVersion();

  if (global.__baileysSocket) {
    try {
      global.__baileysSocket.end(undefined);
    } catch (e) {
      // ignore
    }
    global.__baileysSocket = null;
  }

  console.log(`[BAILEYS] Inicializando socket com WhatsApp Web v${version.join('.')}`);

  // Browser id reconhecido oficialmente pelo WhatsApp Web (evita rejeição de conexão)
  const sock = makeWASocket({
    version,
    logger,
    printQRInTerminal: false,
    auth: state,
    browser: Browsers.ubuntu('Chrome'),
    syncFullHistory: false,
    markOnlineOnConnect: true,
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 60000,
    keepAliveIntervalMs: 25000,
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

    // Atualização em tempo real do QR Code
    if (qr) {
      try {
        console.log('[BAILEYS] Novo QR Code dinâmico recebido dos servidores do WhatsApp.');
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
        console.error('[BAILEYS] Erro ao converter QR para base64:', err);
      }
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      
      console.log(`[BAILEYS] Conexão fechada. Motivo: ${statusCode}. Reconectar: ${shouldReconnect}`);

      if (global.__baileysState) {
        global.__baileysState.status = 'DISCONNECTED';
      }

      if (shouldReconnect) {
        setTimeout(() => {
          iniciarOuObterBaileys();
        }, 3000);
      }
    } else if (connection === 'open') {
      console.log('[BAILEYS] Conexão estabelecida com sucesso!');
      const phone = sock.user?.id ? sock.user.id.split(':')[0] : 'Conectado';
      
      if (global.__baileysState) {
        global.__baileysState.status = 'CONNECTED';
        global.__baileysState.phoneNumber = phone;
        global.__baileysState.connectedAt = new Date().toISOString();
        global.__baileysState.qrCodeUrl = null;
        global.__baileysState.pairingCode = null;
        global.__baileysState.lastSyncAt = new Date().toISOString();
      }

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
        console.error('[BAILEYS] Erro ao sincronizar grupos:', err);
      }
    }
  });

  // Pairing Code Oficial do WhatsApp (Código de 8 dígitos)
  if (numeroPairing && !sock.authState.creds.registered) {
    try {
      const cleanPhone = numeroPairing.replace(/\D/g, '');
      // Aguarda 2 segundos para o WebSocket estar aberto com o WhatsApp
      await new Promise((r) => setTimeout(r, 2000));
      
      const code = await sock.requestPairingCode(cleanPhone);
      const formatted = code ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
      
      if (global.__baileysState) {
        global.__baileysState.pairingCode = formatted;
        global.__baileysState.phoneNumber = cleanPhone;
        global.__baileysState.lastSyncAt = new Date().toISOString();
      }
      console.log(`[BAILEYS] Pairing Code emitido para ${cleanPhone}: ${formatted}`);
    } catch (err) {
      console.error('[BAILEYS] Erro ao requisitar pairing code:', err);
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
  return await iniciarOuObterBaileys(undefined, true);
}

export async function gerarPairingCodePorTelefone(numeroTelefone: string): Promise<WhatsAppSessionState> {
  return await iniciarOuObterBaileys(numeroTelefone, true);
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
  limparSessaoLocal();
  return getWhatsAppSession();
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
