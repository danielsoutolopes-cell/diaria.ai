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
  const session = getWhatsAppSession();
  let groups = getDiscoveredGroups();

  // Buscar do banco se já houver grupos salvos
  try {
    const { data: dbGroups } = await supabaseAdmin
      .from('whatsapp_grupos_monitorados')
      .select('*');

    if (dbGroups && dbGroups.length > 0 && groups.length === 0) {
      groups = dbGroups.map((g) => ({
        id: g.id,
        jid: g.group_jid,
        name: g.nome_grupo,
        memberCount: 0,
        monitored: g.monitorar,
      }));
      setDiscoveredGroups(groups);
    }
  } catch (e) {
    console.error('Erro ao buscar grupos do Supabase:', e);
  }

  return NextResponse.json({
    session,
    groups,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, jid, phoneNumber } = body;

    if (action === 'gerar-qrcode') {
      const novaSessao = await gerarNovoQrCode();
      return NextResponse.json({ success: true, session: novaSessao });
    }

    if (action === 'gerar-pairing-code') {
      const cel = phoneNumber || '5511978543369';
      const novaSessao = await gerarPairingCodePorTelefone(cel);
      return NextResponse.json({
        success: true,
        message: 'Código de pareamento gerado com sucesso para o iPhone.',
        session: novaSessao,
      });
    }

    if (action === 'sincronizar') {
      // Re-sincronizar: gera novo QR se desconectado, ou atualiza lista de grupos se conectado
      const session = getWhatsAppSession();
      if (session.status !== 'CONNECTED') {
        const novaSessao = await gerarNovoQrCode();
        return NextResponse.json({
          success: true,
          message: 'Novo QR Code gerado para leitura no celular.',
          session: novaSessao,
        });
      }

      // Se conectado, busca os grupos do WhatsApp
      const groups = getDiscoveredGroups();
      return NextResponse.json({
        success: true,
        message: 'Grupos sincronizados com sucesso.',
        session,
        groups,
      });
    }

    if (action === 'simular-conexao') {
      // Usado para testar emparelhamento do celular
      const session = simularConexaoSucesso(phoneNumber || '5511998765432');
      // Carregar grupos iniciais se a lista estiver vazia
      let groups = getDiscoveredGroups();
      if (groups.length === 0) {
        groups = [
          { id: '1', jid: '1203630281@g.us', name: 'Obra Bahia - Piscina', memberCount: 8, monitored: true, obraNome: 'OBRA BAHIA' },
          { id: '2', jid: '1203630282@g.us', name: 'Canteiro Jabaquara Geral', memberCount: 12, monitored: true, obraNome: 'JABAQUARA' },
          { id: '3', jid: '1203630283@g.us', name: 'Alphaville 02 - Alvenaria', memberCount: 5, monitored: false },
        ];
        setDiscoveredGroups(groups);
      }

      return NextResponse.json({ success: true, session, groups });
    }

    if (action === 'desconectar') {
      const session = desconectarWhatsApp();
      return NextResponse.json({ success: true, session });
    }

    if (action === 'toggle-grupo' && jid) {
      const groups = toggleGroupMonitored(jid);
      const grupoAlterado = groups.find((g) => g.jid === jid);

      // Salvar preferência de monitoramento no Supabase
      if (grupoAlterado) {
        try {
          await supabaseAdmin
            .from('whatsapp_grupos_monitorados')
            .upsert({
              tenant_id: '00000000-0000-0000-0000-000000000001',
              group_jid: grupoAlterado.jid,
              nome_grupo: grupoAlterado.name,
              monitorar: grupoAlterado.monitored,
              ultima_sincronizacao: new Date().toISOString(),
            }, { onConflict: 'tenant_id, group_jid' });
        } catch (err) {
          console.error('Erro ao atualizar grupo no Supabase:', err);
        }
      }

      return NextResponse.json({ success: true, groups });
    }

    return NextResponse.json({ error: 'Ação não reconhecida.' }, { status: 400 });
  } catch (error) {
    console.error('Erro no endpoint WhatsApp:', error);
    return NextResponse.json({ error: 'Falha no serviço WhatsApp.' }, { status: 500 });
  }
}

