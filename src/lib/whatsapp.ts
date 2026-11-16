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

// Estado em memória da sessão de WhatsApp
let sessionState: WhatsAppSessionState = {
  status: 'DISCONNECTED',
  qrCodeUrl: null,
  qrCodeRaw: null,
  pairingCode: null,
  phoneNumber: null,
  connectedAt: null,
  lastSyncAt: new Date().toISOString(),
};

// Lista de grupos detectados no aparelho da Patrícia / empresa
let discoveredGroups: WhatsAppGroupItem[] = [];

// Gerador de Pairing Code formatado (ex: 8543-3369 ou ABCD-EFGH)
function formatPairingCode(seed?: string): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export async function gerarNovoQrCode(): Promise<WhatsAppSessionState> {
  const pairingCode = formatPairingCode();
  const rawPayload = `2@diaria-ai-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
  
  const qrDataUrl = await QRCode.toDataURL(rawPayload, {
    margin: 2,
    width: 320,
    color: {
      dark: '#022c22',
      light: '#ffffff',
    },
  });

  sessionState = {
    status: 'CONNECTING',
    qrCodeUrl: qrDataUrl,
    qrCodeRaw: rawPayload,
    pairingCode: pairingCode,
    phoneNumber: null,
    connectedAt: null,
    lastSyncAt: new Date().toISOString(),
  };

  return sessionState;
}

export async function gerarPairingCodePorTelefone(numeroTelefone: string): Promise<WhatsAppSessionState> {
  const cleanPhone = numeroTelefone.replace(/\D/g, '');
  const pairingCode = formatPairingCode(cleanPhone);
  
  const qrDataUrl = await QRCode.toDataURL(`whatsapp://pair?phone=${cleanPhone}&code=${pairingCode}`, {
    margin: 2,
    width: 320,
    color: {
      dark: '#022c22',
      light: '#ffffff',
    },
  });

  sessionState = {
    status: 'CONNECTING',
    qrCodeUrl: qrDataUrl,
    qrCodeRaw: pairingCode,
    pairingCode: pairingCode,
    phoneNumber: cleanPhone,
    connectedAt: null,
    lastSyncAt: new Date().toISOString(),
  };

  return sessionState;
}

export function getWhatsAppSession(): WhatsAppSessionState {
  return sessionState;
}

export function simularConexaoSucesso(numeroTelefone: string = '5511978543369'): WhatsAppSessionState {
  sessionState = {
    status: 'CONNECTED',
    qrCodeUrl: null,
    qrCodeRaw: null,
    pairingCode: null,
    phoneNumber: numeroTelefone,
    connectedAt: new Date().toISOString(),
    lastSyncAt: new Date().toISOString(),
  };
  return sessionState;
}

export function desconectarWhatsApp(): WhatsAppSessionState {
  sessionState = {
    status: 'DISCONNECTED',
    qrCodeUrl: null,
    qrCodeRaw: null,
    pairingCode: null,
    phoneNumber: null,
    connectedAt: null,
    lastSyncAt: new Date().toISOString(),
  };
  return sessionState;
}

export function getDiscoveredGroups(): WhatsAppGroupItem[] {
  return discoveredGroups;
}

export function setDiscoveredGroups(groups: WhatsAppGroupItem[]) {
  discoveredGroups = groups;
}

export function toggleGroupMonitored(jid: string): WhatsAppGroupItem[] {
  discoveredGroups = discoveredGroups.map((g) =>
    g.jid === jid ? { ...g, monitored: !g.monitored } : g
  );
  return discoveredGroups;
}
