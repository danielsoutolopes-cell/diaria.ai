import { NextRequest, NextResponse } from 'next/server';
import {
  isDanielOuPatricia,
  normalizeTenantSlug,
  TENANTS,
  type TenantSlug,
} from '@/lib/tenant';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const MASTER_TENANT_ID = TENANTS.jhoston.id;

export interface GrupoWhatsAppMapeado {
  id: string;
  jid: string;
  nomeGrupo: string;
  empresa: TenantSlug;
  obraNome: string;
  ambiente: 'INTERNO' | 'EXTERNO';
  ativo: boolean;
}

export interface ConfigGeralGlobal {
  telefonePatricia: string;
  telefoneDaniel: string;
  nomeExibicaoJhoston: string;
  nomeExibicaoIntermack: string;
  instanciaWhatsAppUrl: string;
  gruposWhatsApp: GrupoWhatsAppMapeado[];
  atualizadoEm?: string;
  atualizadoPor?: string;
}

interface ConfigGeralLegada
  extends Partial<Omit<ConfigGeralGlobal, 'gruposWhatsApp'>> {
  nomeExibicaoJhonton?: string;
  gruposWhatsApp?: Array<
    Omit<GrupoWhatsAppMapeado, 'empresa'> & { empresa?: string }
  >;
}

const DEFAULT_CONFIG_GERAL: ConfigGeralGlobal = {
  telefonePatricia: '5511978543369',
  telefoneDaniel: '5511988139833',
  nomeExibicaoJhoston: 'Jhoston Construções e Revestimentos',
  nomeExibicaoIntermack: 'Intermack Engenharia e Construção',
  instanciaWhatsAppUrl: 'https://diaria-ai.onrender.com',
  gruposWhatsApp: [],
};

function normalizarConfigGeral(salvo: ConfigGeralLegada): ConfigGeralGlobal {
  const nomeLegado = salvo.nomeExibicaoJhonton;
  const nomeCorrigido =
    salvo.nomeExibicaoJhoston ||
    (nomeLegado
      ? nomeLegado.replace(/jhonton/gi, 'Jhoston')
      : DEFAULT_CONFIG_GERAL.nomeExibicaoJhoston);

  const gruposNormalizados: GrupoWhatsAppMapeado[] = Array.isArray(
    salvo.gruposWhatsApp
  )
    ? salvo.gruposWhatsApp.map((g) => ({
        id: g.id,
        jid: g.jid,
        nomeGrupo: g.nomeGrupo,
        empresa: normalizeTenantSlug(g.empresa),
        obraNome: g.obraNome,
        ambiente: g.ambiente === 'INTERNO' ? 'INTERNO' : 'EXTERNO',
        ativo: Boolean(g.ativo),
      }))
    : [];

  return {
    telefonePatricia:
      salvo.telefonePatricia || DEFAULT_CONFIG_GERAL.telefonePatricia,
    telefoneDaniel: salvo.telefoneDaniel || DEFAULT_CONFIG_GERAL.telefoneDaniel,
    nomeExibicaoJhoston: nomeCorrigido,
    nomeExibicaoIntermack:
      salvo.nomeExibicaoIntermack || DEFAULT_CONFIG_GERAL.nomeExibicaoIntermack,
    instanciaWhatsAppUrl:
      salvo.instanciaWhatsAppUrl || DEFAULT_CONFIG_GERAL.instanciaWhatsAppUrl,
    gruposWhatsApp: gruposNormalizados,
    atualizadoEm: salvo.atualizadoEm,
    atualizadoPor: salvo.atualizadoPor,
  };
}

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
    const salvo = (configs.config_geral_global || {}) as ConfigGeralLegada;
    const configGeral = normalizarConfigGeral(salvo);

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

    const body = (await req.json()) as ConfigGeralLegada;

    const { data: paramData } = await supabaseAdmin
      .from('parametros_sistema')
      .select('id, configuracoes')
      .eq('tenant_id', MASTER_TENANT_ID)
      .maybeSingle();

    const configsAtuais = (paramData?.configuracoes || {}) as Record<string, unknown>;
    const anterior = normalizarConfigGeral(
      (configsAtuais.config_geral_global || {}) as ConfigGeralLegada
    );

    const mesclado = normalizarConfigGeral({
      ...anterior,
      ...body,
      gruposWhatsApp: Array.isArray(body.gruposWhatsApp)
        ? body.gruposWhatsApp
        : anterior.gruposWhatsApp,
      atualizadoEm: new Date().toISOString(),
      atualizadoPor: auth.usuario,
    });

    const novasConfigs = {
      ...configsAtuais,
      config_geral_global: mesclado,
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
      configGeral: mesclado,
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
