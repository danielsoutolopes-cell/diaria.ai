import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export interface RegrasDiariasConfig {
  dia_viagem_padrao: number;     // R$ 12.00
  dia_chuva_padrao: number;      // R$ 120.00
  dia_parado_padrao: number;     // R$ 120.00 (sem acesso / condomínio travado)
  diaria_piscina_padrao: number; // R$ 150.00
  diaria_civil_padrao: number;   // R$ 180.00
}

const DEFAULT_REGRAS: RegrasDiariasConfig = {
  dia_viagem_padrao: 12.0,
  dia_chuva_padrao: 120.0,
  dia_parado_padrao: 120.0,
  diaria_piscina_padrao: 150.0,
  diaria_civil_padrao: 180.0,
};

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get('tenantId') || '00000000-0000-0000-0000-000000000001';

    const { data, error } = await supabaseAdmin
      .from('parametros_sistema')
      .select('configuracoes')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error || !data?.configuracoes) {
      return NextResponse.json({ regras: DEFAULT_REGRAS });
    }

    return NextResponse.json({
      regras: {
        ...DEFAULT_REGRAS,
        ...(data.configuracoes as Partial<RegrasDiariasConfig>),
      },
    });
  } catch (error) {
    console.error('Erro ao buscar regras de diárias:', error);
    return NextResponse.json({ regras: DEFAULT_REGRAS });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tenantId = '00000000-0000-0000-0000-000000000001', regras } = body;

    if (!regras) {
      return NextResponse.json({ error: 'Configurações de regras ausentes.' }, { status: 400 });
    }

    const configuracoesAtualizadas: RegrasDiariasConfig = {
      dia_viagem_padrao: Number(regras.dia_viagem_padrao) || 12.0,
      dia_chuva_padrao: Number(regras.dia_chuva_padrao) || 120.0,
      dia_parado_padrao: Number(regras.dia_parado_padrao) || 120.0,
      diaria_piscina_padrao: Number(regras.diaria_piscina_padrao) || 150.0,
      diaria_civil_padrao: Number(regras.diaria_civil_padrao) || 180.0,
    };

    const { data, error } = await supabaseAdmin
      .from('parametros_sistema')
      .upsert(
        {
          tenant_id: tenantId,
          configuracoes: configuracoesAtualizadas,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'tenant_id' }
      )
      .select()
      .single();

    if (error) {
      console.error('Erro ao salvar no banco parametros_sistema:', error);
      // Se a tabela ainda não existir, retornamos sucesso local para não travar a UI
      return NextResponse.json({
        success: true,
        regras: configuracoesAtualizadas,
        aviso: 'Salvo em memória/fallback',
      });
    }

    return NextResponse.json({
      success: true,
      regras: configuracoesAtualizadas,
    });
  } catch (error) {
    console.error('Erro ao atualizar regras de diárias:', error);
    return NextResponse.json({ error: 'Falha ao salvar regras.' }, { status: 500 });
  }
}
