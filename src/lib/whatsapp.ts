import QRCode from 'qrcode';

export interface WhatsAppSessionState {
  status: 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED';
  qrCodeUrl: string | null;
  qrCodeRaw: string | null;
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

// Estado em memória da sessão de WhatsApp (no Render ou Node server)
let sessionState: WhatsAppSessionState = {
  status: 'DISCONNECTED',
  qrCodeUrl: null,
  qrCodeRaw: null,
  phoneNumber: null,
  connectedAt: null,
  lastSyncAt: new Date().toISOString(),
};

// Lista de grupos detectados no aparelho da Patrícia / empresa
let discoveredGroups: WhatsAppGroupItem[] = [];

export async function gerarNovoQrCode(): Promise<WhatsAppSessionState> {
  const pairingCode = `2@diaria-ai-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
  const qrDataUrl = await QRCode.toDataURL(pairingCode, {
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
    phoneNumber: null,
    connectedAt: null,
    lastSyncAt: new Date().toISOString(),
  };

  return sessionState;
}

export function getWhatsAppSession(): WhatsAppSessionState {
  return sessionState;
}

export function simularConexaoSucesso(numeroTelefone: string = '5511998765432'): WhatsAppSessionState {
  sessionState = {
    status: 'CONNECTED',
    qrCodeUrl: null,
    qrCodeRaw: null,
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

