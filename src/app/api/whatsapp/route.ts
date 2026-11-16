import { NextRequest, NextResponse } from 'next/server';
import {
  getWhatsAppSession,
  gerarNovoQrCode,
  gerarPairingCodePorTelefone,
  getDiscoveredGroups,
  setDiscoveredGroups,
  toggleGroupMonitored,
  simularConexaoSucesso,
  desconectarWhatsApp,
  WhatsAppGroupItem,
} from '@/lib/whatsapp';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET() {
  try {
    const res = await fetch('http://localhost:3001/status', { cache: 'no-store' });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    const session = getWhatsAppSession();
    const groups = getDiscoveredGroups();
    return NextResponse.json({ session, groups });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, jid, phoneNumber, targetOs = 'ANDROID' } = body;

    if (action === 'gerar-qrcode') {
      try {
        const res = await fetch('http://localhost:3001/connect-qr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetOs }),
        });
        const data = await res.json();
        return NextResponse.json(data);
      } catch (e) {
        const novaSessao = await gerarNovoQrCode();
        return NextResponse.json({ success: true, session: novaSessao });
      }
    }

    if (action === 'gerar-pairing-code') {
      const cel = phoneNumber || '5511988139833';
      try {
        const res = await fetch('http://localhost:3001/connect-pairing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: cel, targetOs }),
        });
        const data = await res.json();
        return NextResponse.json(data);
      } catch (e) {
        const novaSessao = await gerarPairingCodePorTelefone(cel);
        return NextResponse.json({
          success: true,
          message: 'Código de pareamento gerado com sucesso.',
          session: novaSessao,
        });
      }
    }

    if (action === 'desconectar' || action === 'limpar-sessao') {
      try {
        await fetch('http://localhost:3001/disconnect', { method: 'POST' });
      } catch (e) {}
      const session = desconectarWhatsApp();
      return NextResponse.json({ success: true, session });
    }

    if (action === 'sincronizar') {
      try {
        const res = await fetch('http://localhost:3001/status', { cache: 'no-store' });
        const data = await res.json();
        return NextResponse.json({ success: true, ...data });
      } catch (e) {
        const session = getWhatsAppSession();
        const groups = getDiscoveredGroups();
        return NextResponse.json({ success: true, session, groups });
      }
    }

    if (action === 'simular-conexao') {
      const session = simularConexaoSucesso(phoneNumber || '5511988139833');
      let groups = getDiscoveredGroups();
      return NextResponse.json({ success: true, session, groups });
    }

    if (action === 'toggle-grupo' && jid) {
      try {
        const res = await fetch('http://localhost:3001/toggle-group', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jid }),
        });
        const data = await res.json();
        return NextResponse.json(data);
      } catch (e) {
        const groups = toggleGroupMonitored(jid);
        return NextResponse.json({ success: true, groups });
      }
    }

    return NextResponse.json({ error: 'Ação não reconhecida.' }, { status: 400 });
  } catch (error) {
    console.error('Erro no endpoint WhatsApp:', error);
    return NextResponse.json({ error: 'Falha no serviço WhatsApp.' }, { status: 500 });
  }
}

