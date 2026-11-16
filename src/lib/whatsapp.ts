import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  Browsers,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import path from 'path';
import fs from 'fs';
import QRCode from 'qrcode';

type WASocket = ReturnType<typeof makeWASocket>;

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

const AUTH_FOLDER = path.join(process.cwd(), '.baileys_auth');

declare global {
  var __baileysSocket: WASocket | null | undefined;
  var __baileysState: WhatsAppSessionState | undefined;
  var __baileysGroups: WhatsAppGroupItem[] | undefined;
  var __baileysPromise: Promise<WhatsAppSessionState> | undefined;
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

export function limparSessaoLocal(): void {
  console.log('[BAILEYS] Limpando sessão local e encerrando socket...');
  if (global.__baileysSocket) {
    try {
      global.__baileysSocket.end(undefined);
    } catch (e) {}
    global.__baileysSocket = null;
  }

  if (fs.existsSync(AUTH_FOLDER)) {
    try {
      fs.rmSync(AUTH_FOLDER, { recursive: true, force: true });
    } catch (e) {}
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
  global.__baileysPromise = undefined;
}

export async function iniciarOuObterBaileys(numeroPairing?: string, forcarReinicio: boolean = false): Promise<WhatsAppSessionState> {
  if (forcarReinicio) {
    limparSessaoLocal();
  }

  // Se já temos QR Code ativo e válido, retorna imediatamente
  if (global.__baileysSocket && global.__baileysState?.qrCodeUrl && !forcarReinicio && !numeroPairing) {
    return global.__baileysState;
  }

  // Se já está conectado, retorna
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
    } catch (e) {}
    global.__baileysSocket = null;
  }

  console.log(`[BAILEYS] Inicializando socket oficial v${version.join('.')}`);

  const sock = makeWASocket({
    version,
    logger,
    printQRInTerminal: false,
    auth: state,
    browser: Browsers.ubuntu('Chrome'),
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

  // Promise que segura a resposta HTTP até o QR Code ou Pairing Code estar 100% pronto
  return new Promise<WhatsAppSessionState>((resolve) => {
    let finalizado = false;

    // Timeout de segurança de 10s caso a rede demore
    const timeout = setTimeout(() => {
      if (!finalizado) {
        finalizado = true;
        resolve(getWhatsAppSession());
      }
    }, 10000);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          console.log('[BAILEYS] QR Code recebido do WhatsApp! Gerando DataURL...');
          const qrUrl = await QRCode.toDataURL(qr, {
            margin: 2,
            width: 320,
            color: { dark: '#022c22', light: '#ffffff' },
          });

          if (global.__baileysState) {
            global.__baileysState.qrCodeUrl = qrUrl;
            global.__baileysState.qrCodeRaw = qr;
            global.__baileysState.status = 'CONNECTING';
            global.__baileysState.lastSyncAt = new Date().toISOString();
          }

          if (!finalizado && !numeroPairing) {
            finalizado = true;
            clearTimeout(timeout);
            console.log('[BAILEYS] QR Code pronto e entregue para a tela.');
            resolve(global.__baileysState!);
          }
        } catch (err) {
          console.error('[BAILEYS] Erro QRCode:', err);
        }
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        console.log(`[BAILEYS] Conexão encerrada: ${statusCode}`);
        if (global.__baileysState && global.__baileysState.status !== 'CONNECTED') {
          if (!global.__baileysState.qrCodeUrl && !global.__baileysState.pairingCode) {
            global.__baileysState.status = 'DISCONNECTED';
          }
        }
      } else if (connection === 'open') {
        console.log('[BAILEYS] Conectado com sucesso!');
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
        } catch (err) {}

        if (!finalizado) {
          finalizado = true;
          clearTimeout(timeout);
          resolve(global.__baileysState!);
        }
      }
    });

    // Se for Pairing Code
    if (numeroPairing && !sock.authState.creds.registered) {
      const cleanPhone = numeroPairing.replace(/\D/g, '');
      setTimeout(async () => {
        try {
          console.log(`[BAILEYS] Requisitando pairing code para ${cleanPhone}...`);
          const code = await sock.requestPairingCode(cleanPhone);
          const formatted = code ? `${code.slice(0, 4)}-${code.slice(4)}` : code;

          if (global.__baileysState) {
            global.__baileysState.pairingCode = formatted;
            global.__baileysState.phoneNumber = cleanPhone;
            global.__baileysState.status = 'CONNECTING';
            global.__baileysState.lastSyncAt = new Date().toISOString();
          }

          if (!finalizado) {
            finalizado = true;
            clearTimeout(timeout);
            console.log(`[BAILEYS] Pairing code ${formatted} pronto para a tela.`);
            resolve(global.__baileysState!);
          }
        } catch (err) {
          console.error('[BAILEYS] Erro ao obter pairing code:', err);
          if (!finalizado) {
            finalizado = true;
            clearTimeout(timeout);
            resolve(getWhatsAppSession());
          }
        }
      }, 2500);
    }
  });
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

export function simularConexaoSucesso(numeroTelefone: string = '5511988139833'): WhatsAppSessionState {
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
