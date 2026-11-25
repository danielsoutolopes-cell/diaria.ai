import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function getBaileysBaseUrl(): string {
  return (process.env.BAILEYS_SERVER_URL || 'http://localhost:3001').replace(/\/+$/, '');
}

const OFFLINE_SESSION = {
  status: 'DISCONNECTED' as const,
  qrCodeUrl: null,
  pairingCode: null,
  phoneNumber: null,
  connectedAt: null,
  lastSyncAt: new Date().toISOString(),
  profileType: 'ANDROID' as const,
};

export async function GET() {
  try {
    const res = await fetch(`${getBaileysBaseUrl()}/status`, { cache: 'no-store' });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error('[GET /api/whatsapp]', err);
    return NextResponse.json({
      session: { ...OFFLINE_SESSION, lastSyncAt: new Date().toISOString() },
      groups: [],
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      action?: string;
      jid?: string;
      phoneNumber?: string;
      targetOs?: string;
    };
    const { action, jid, phoneNumber, targetOs = 'ANDROID' } = body;
    const base = getBaileysBaseUrl();

    if (action === 'gerar-qrcode') {
      const res = await fetch(`${base}/connect-qr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetOs }),
        cache: 'no-store',
      });
      const data = await res.json();
      return NextResponse.json(data, { status: res.ok ? 200 : res.status });
    }

    if (action === 'gerar-pairing-code') {
      const cel = phoneNumber || '5511988139833';
      const res = await fetch(`${base}/connect-pairing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: cel, targetOs }),
        cache: 'no-store',
      });
      const data = await res.json();
      return NextResponse.json(data, { status: res.ok ? 200 : res.status });
    }

    if (action === 'desconectar' || action === 'limpar-sessao') {
      try {
        await fetch(`${base}/disconnect`, { method: 'POST', cache: 'no-store' });
      } catch {
        // Ignora erro de rede ao desconectar
      }
      return NextResponse.json({
        success: true,
        session: { ...OFFLINE_SESSION, lastSyncAt: new Date().toISOString() },
      });
    }

    if (action === 'sincronizar') {
      const res = await fetch(`${base}/status`, { cache: 'no-store' });
      const data = await res.json();
      return NextResponse.json({ success: true, ...data });
    }

    if (action === 'toggle-grupo' && jid) {
      const res = await fetch(`${base}/toggle-group`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jid }),
        cache: 'no-store',
      });
      const data = await res.json();
      return NextResponse.json(data, { status: res.ok ? 200 : res.status });
    }

    return NextResponse.json({ error: 'Ação não reconhecida.' }, { status: 400 });
  } catch (error) {
    console.error('[POST /api/whatsapp]', error);
    return NextResponse.json(
      { error: 'Falha ao comunicar com o servidor Baileys.' },
      { status: 502 }
    );
  }
}
