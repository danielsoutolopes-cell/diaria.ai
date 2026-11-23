import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase';
import { lerFeatureFlagsTenant } from '@/services/featureFlagsStorage';
import {
  assinarSessaoPontoCampo,
  ENCARREGADOS_CAMPO_DEFAULT_JHOSTON,
  JHOSTON_TENANT_ID,
  PONTO_CAMPO_COOKIE_NAME,
  verificarSessaoPontoCampo,
  type EncarregadoCampoConfig,
} from '@/lib/pontoCampo';

export const dynamic = 'force-dynamic';

const CHALLENGE_COOKIE_NAME = 'diaria_ponto_bio_challenge';

interface BiometriaCredencial {
  credentialId: string;
  encarregadoId: string;
  criadoEm: string;
  dispositivo?: string;
}

async function lerConfigsCampoJhoston(): Promise<{
  paramId: string | null;
  configs: Record<string, unknown>;
  encarregados: EncarregadoCampoConfig[];
  credenciais: BiometriaCredencial[];
}> {
  const { data } = await supabaseAdmin
    .from('parametros_sistema')
    .select('id, configuracoes')
    .eq('tenant_id', JHOSTON_TENANT_ID)
    .limit(1)
    .maybeSingle();

  const configs = ((data?.configuracoes as Record<string, unknown> | null) ||
    {}) as Record<string, unknown>;

  const rawEnc = configs.ponto_campo_encarregados;
  const encarregados: EncarregadoCampoConfig[] =
    Array.isArray(rawEnc) && rawEnc.length > 0
      ? (rawEnc as EncarregadoCampoConfig[]).filter(
          (e) => e && e.ativo !== false && e.id && e.nome
        )
      : [...ENCARREGADOS_CAMPO_DEFAULT_JHOSTON];

  const credenciais = Array.isArray(configs.ponto_campo_biometria)
    ? (configs.ponto_campo_biometria as BiometriaCredencial[])
    : [];

  return {
    paramId: (data?.id as string | undefined) || null,
    configs,
    encarregados,
    credenciais,
  };
}

/**
 * GET: gera um challenge criptográfico (base64url) para WebAuthn (cadastro ou login).
 */
export async function GET() {
  const flags = await lerFeatureFlagsTenant(JHOSTON_TENANT_ID);
  if (!flags.FF_PWA_PONTO_CAMPO) {
    return NextResponse.json(
      { error: 'App de Campo em homologação (desligado em /config-geral).' },
      { status: 403 }
    );
  }

  const challenge = crypto.randomBytes(32).toString('base64url');
  const res = NextResponse.json({ challenge });
  res.cookies.set(CHALLENGE_COOKIE_NAME, challenge, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 300, // 5 minutos
  });
  return res;
}

/**
 * PUT: registra a credencial biométrica do dispositivo para o encarregado já autenticado via PIN.
 */
export async function PUT(req: NextRequest) {
  try {
    const flags = await lerFeatureFlagsTenant(JHOSTON_TENANT_ID);
    if (!flags.FF_PWA_PONTO_CAMPO) {
      return NextResponse.json(
        { error: 'App de Campo em homologação (desligado em /config-geral).' },
        { status: 403 }
      );
    }

    const token = req.cookies.get(PONTO_CAMPO_COOKIE_NAME)?.value;
    const sessao = verificarSessaoPontoCampo(token);
    if (!sessao || sessao.tenantId !== JHOSTON_TENANT_ID) {
      return NextResponse.json(
        { error: 'Faça login com PIN antes de ativar a biometria.' },
        { status: 401 }
      );
    }

    const body = (await req.json()) as {
      credentialId?: string;
      dispositivo?: string;
    };
    const credentialId = String(body.credentialId || '').trim();
    if (!credentialId || credentialId.length < 10) {
      return NextResponse.json(
        { error: 'Credencial biométrica inválida.' },
        { status: 400 }
      );
    }

    const { paramId, configs, credenciais } = await lerConfigsCampoJhoston();
    const filtradas = credenciais.filter(
      (c) => c.credentialId !== credentialId
    );
    const atualizadas: BiometriaCredencial[] = [
      {
        credentialId,
        encarregadoId: sessao.encarregadoId,
        criadoEm: new Date().toISOString(),
        dispositivo: body.dispositivo?.slice(0, 80) || 'Celular',
      },
      ...filtradas,
    ].slice(0, 30);

    const novasConfigs: Record<string, unknown> = {
      ...configs,
      ponto_campo_biometria: atualizadas,
    };

    if (paramId) {
      await supabaseAdmin
        .from('parametros_sistema')
        .update({ configuracoes: novasConfigs })
        .eq('id', paramId);
    } else {
      await supabaseAdmin.from('parametros_sistema').insert({
        tenant_id: JHOSTON_TENANT_ID,
        configuracoes: novasConfigs,
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Biometria ativada neste celular com sucesso!',
    });
  } catch (err) {
    console.error('[ponto-campo/biometria PUT]', err);
    return NextResponse.json(
      { error: 'Erro ao salvar biometria.' },
      { status: 500 }
    );
  }
}

/**
 * POST: autentica o encarregado via WebAuthn (Digital / Face ID) validando challenge + credentialId.
 */
export async function POST(req: NextRequest) {
  try {
    const flags = await lerFeatureFlagsTenant(JHOSTON_TENANT_ID);
    if (!flags.FF_PWA_PONTO_CAMPO) {
      return NextResponse.json(
        { error: 'App de Campo em homologação (desligado em /config-geral).' },
        { status: 403 }
      );
    }

    const expectedChallenge = req.cookies.get(CHALLENGE_COOKIE_NAME)?.value;
    if (!expectedChallenge) {
      return NextResponse.json(
        { error: 'Desafio biométrico expirado. Tente novamente.' },
        { status: 401 }
      );
    }

    const body = (await req.json()) as {
      credentialId?: string;
      clientDataJSON?: string;
    };
    const credentialId = String(body.credentialId || '').trim();
    const clientDataJSON = String(body.clientDataJSON || '').trim();

    if (!credentialId || !clientDataJSON) {
      return NextResponse.json(
        { error: 'Dados biométricos incompletos.' },
        { status: 400 }
      );
    }

    // Valida challenge dentro do clientDataJSON retornado pelo autenticador do SO
    try {
      const parsed = JSON.parse(
        Buffer.from(clientDataJSON, 'base64url').toString('utf8')
      ) as { challenge?: string; type?: string };
      if (
        parsed.type !== 'webauthn.get' ||
        parsed.challenge !== expectedChallenge
      ) {
        return NextResponse.json(
          { error: 'Validação biométrica inválida.' },
          { status: 401 }
        );
      }
    } catch {
      return NextResponse.json(
        { error: 'Falha ao ler resposta biométrica.' },
        { status: 400 }
      );
    }

    const { encarregados, credenciais } = await lerConfigsCampoJhoston();
    const cred = credenciais.find((c) => c.credentialId === credentialId);
    if (!cred) {
      return NextResponse.json(
        { error: 'Biometria não cadastrada. Entre com seu PIN e ative novamente.' },
        { status: 401 }
      );
    }

    const enc = encarregados.find(
      (e) => e.id === cred.encarregadoId && e.ativo !== false
    );
    if (!enc) {
      return NextResponse.json(
        { error: 'Encarregado inativo.' },
        { status: 403 }
      );
    }

    const trintaDiasMs = 30 * 24 * 60 * 60 * 1000;
    const token = assinarSessaoPontoCampo({
      encarregadoId: enc.id,
      encarregadoNome: enc.nome,
      tenantId: JHOSTON_TENANT_ID,
      obrasVinculadas: enc.obrasVinculadas,
      exp: Date.now() + trintaDiasMs,
    });

    const res = NextResponse.json({
      success: true,
      encarregado: {
        id: enc.id,
        nome: enc.nome,
        obrasVinculadas: enc.obrasVinculadas,
      },
    });

    res.cookies.set(PONTO_CAMPO_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 30 * 24 * 60 * 60,
    });
    res.cookies.set(CHALLENGE_COOKIE_NAME, '', {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });

    return res;
  } catch (err) {
    console.error('[ponto-campo/biometria POST]', err);
    return NextResponse.json(
      { error: 'Erro ao autenticar com biometria.' },
      { status: 500 }
    );
  }
}
