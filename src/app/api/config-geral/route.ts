import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { isDanielOuPatricia, TENANTS } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

const MASTER_TENANT_ID = TENANTS.jhonton.id;

export interface GrupoWhatsAppMapeado {
  id: string;
  jid: string;
  nomeGrupo: string;
  empresa: 'jhonton' | 'intermack';
  obraNome: string;
  ambiente: 'INTERNO' | 'EXTERNO';
  ativo: boolean;
}

export interface ConfigGeralGlobal {
  telefonePatricia: string;
  telefoneDaniel: string;
  nomeExibicaoJhonton: string;
  nomeExibicaoIntermack: string;
  instanciaWhatsAppUrl: string;
  gruposWhatsApp: GrupoWhatsAppMapeado[];
  atualizadoEm?: string;
  atualizadoPor?: string;
}

const DEFAULT_CONFIG_GERAL: ConfigGeralGlobal = {
  telefonePatricia: '5511978543369',
  telefoneDaniel: '5511988139833',
  nomeExibicaoJhonton: 'Jhonton Engenharia & Piscinas',
  nomeExibicaoIntermack: 'Intermack Reformas & Obras',
  instanciaWhatsAppUrl: 'https://diaria-ai.onrender.com',
  gruposWhatsApp: [],
};

function verificarAdmin(req: NextRequest): { permitido: boolean; usuario: string } {
  const rawUser = req.cookies.get('diaria_user')?.value
    ? decodeURIComponent(req.cookies.get('diaria_user')?.value || '')
    : 'Patrícia Grubel';
  return {
    permitido: isDanielOuPatricia(rawUser),
    usuario: rawUser,
  };
}

export async function GET(req: NextRequest) {
  try {
    const auth = verificarAdmin(req);
    if (!auth.permitido) {
      return NextResponse.json(
        { error: 'Acesso restrito a Patrícia Grubel e Daniel Lopes.' },
        { status: 403 }
      );
    }

    const { data: paramData } = await supabaseAdmin
      .from('parametros_sistema')
      .select('configuracoes')
      .eq('tenant_id', MASTER_TENANT_ID)
      .maybeSingle();

    const configs = (paramData?.configuracoes || {}) as Record<string, unknown>;
    const salvo = (configs.config_geral_global || {}) as Partial<ConfigGeralGlobal>;

    const configGeral: ConfigGeralGlobal = {
      ...DEFAULT_CONFIG_GERAL,
      ...salvo,
      gruposWhatsApp: Array.isArray(salvo.gruposWhatsApp)
        ? salvo.gruposWhatsApp
        : [],
    };

    return NextResponse.json({ configGeral });
  } catch (error) {
    console.error('Erro em GET /api/config-geral:', error);
    return NextResponse.json(
      { error: 'Erro ao carregar configuração geral.' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = verificarAdmin(req);
    if (!auth.permitido) {
      return NextResponse.json(
        { error: 'Acesso restrito a Patrícia Grubel e Daniel Lopes.' },
        { status: 403 }
      );
    }

    const body = (await req.json()) as Partial<ConfigGeralGlobal>;

    const { data: paramData } = await supabaseAdmin
      .from('parametros_sistema')
      .select('id, configuracoes')
      .eq('tenant_id', MASTER_TENANT_ID)
      .maybeSingle();

    const configsAtuais = (paramData?.configuracoes || {}) as Record<string, unknown>;
    const anterior = (configsAtuais.config_geral_global ||
      {}) as Partial<ConfigGeralGlobal>;

    const novaConfigGeral: ConfigGeralGlobal = {
      ...DEFAULT_CONFIG_GERAL,
      ...anterior,
      ...body,
      gruposWhatsApp: Array.isArray(body.gruposWhatsApp)
        ? body.gruposWhatsApp
        : Array.isArray(anterior.gruposWhatsApp)
          ? anterior.gruposWhatsApp
          : [],
      atualizadoEm: new Date().toISOString(),
      atualizadoPor: auth.usuario,
    };

    const novasConfigs = {
      ...configsAtuais,
      config_geral_global: novaConfigGeral,
    };

    if (paramData?.id) {
      await supabaseAdmin
        .from('parametros_sistema')
        .update({ configuracoes: novasConfigs })
        .eq('id', paramData.id);
    } else {
      await supabaseAdmin.from('parametros_sistema').insert({
        tenant_id: MASTER_TENANT_ID,
        configuracoes: novasConfigs,
      });
    }

    return NextResponse.json({
      success: true,
      configGeral: novaConfigGeral,
      message: 'Configuração Geral salva com sucesso!',
    });
  } catch (error) {
    console.error('Erro em POST /api/config-geral:', error);
    return NextResponse.json(
      { error: 'Erro ao salvar configuração geral.' },
      { status: 500 }
    );
  }
}
