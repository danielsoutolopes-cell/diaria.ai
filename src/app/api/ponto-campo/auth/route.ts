import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { lerFeatureFlagsTenant } from '@/services/featureFlagsStorage';
import {
  assinarSessaoPontoCampo,
  calcularStatusRelatorioSemanal,
  ENCARREGADOS_CAMPO_DEFAULT_JHOSTON,
  JHOSTON_TENANT_ID,
  PONTO_CAMPO_COOKIE_NAME,
  verificarSessaoPontoCampo,
  type EncarregadoCampoConfig,
} from '@/lib/pontoCampo';
import type { DiarioObraRegistro } from '@/lib/diarioObraRelatorio';

export const dynamic = 'force-dynamic';

async function carregarConfigCampoJhoston(): Promise<{
  encarregados: EncarregadoCampoConfig[];
  diarios: DiarioObraRegistro[];
}> {
  const { data } = await supabaseAdmin
    .from('parametros_sistema')
    .select('configuracoes')
    .eq('tenant_id', JHOSTON_TENANT_ID)
    .limit(1)
    .maybeSingle();

  const configs = (data?.configuracoes || {}) as Record<string, unknown>;
  const rawEncarregados = configs.ponto_campo_encarregados;
  const encarregados: EncarregadoCampoConfig[] =
    Array.isArray(rawEncarregados) && rawEncarregados.length > 0
      ? (rawEncarregados as EncarregadoCampoConfig[]).filter(
          (e) => e && e.ativo !== false && e.id && e.nome && e.pin
        )
      : [...ENCARREGADOS_CAMPO_DEFAULT_JHOSTON];

  const diarios = Array.isArray(configs.diarios_obra)
    ? (configs.diarios_obra as DiarioObraRegistro[])
    : [];

  return { encarregados, diarios };
}

export async function GET(req: NextRequest) {
  try {
    const flags = await lerFeatureFlagsTenant(JHOSTON_TENANT_ID);
    if (!flags.FF_PWA_PONTO_CAMPO) {
      return NextResponse.json({
        enabled: false,
        homologacao: true,
        message:
          'App de Campo (PWA /ponto) está em homologação e atualmente desligado em /config-geral.',
      });
    }

    const { encarregados, diarios } = await carregarConfigCampoJhoston();
    const encarregadosPublicos = encarregados.map((e) => ({
      id: e.id,
      nome: e.nome,
    }));

    const token = req.cookies.get(PONTO_CAMPO_COOKIE_NAME)?.value;
    const sessao = verificarSessaoPontoCampo(token);

    if (!sessao || sessao.tenantId !== JHOSTON_TENANT_ID) {
      return NextResponse.json({
        enabled: true,
        homologacao: true,
        autenticado: false,
        encarregados: encarregadosPublicos,
      });
    }

    // Revalida encarregado ativo e suas obras atuais
    const encAtual = encarregados.find((e) => e.id === sessao.encarregadoId);
    const obrasVinculadas = encAtual
      ? encAtual.obrasVinculadas
      : sessao.obrasVinculadas;

    // Lista apenas nomes de colaboradores ativos da Jhoston (zero valores em R$ ou PIX)
    const { data: funcs } = await supabaseAdmin
      .from('funcionarios_obra')
      .select('id, nome')
      .eq('tenant_id', JHOSTON_TENANT_ID)
      .eq('ativo', true)
      .order('nome', { ascending: true });

    const colaboradores = (funcs || []).map((f) => ({
      id: String(f.id),
      nome: String(f.nome),
    }));

    const statusRelatorios = obrasVinculadas.map((obraNome) =>
      calcularStatusRelatorioSemanal(diarios, obraNome)
    );

    return NextResponse.json({
      enabled: true,
      homologacao: true,
      autenticado: true,
      encarregado: {
        id: sessao.encarregadoId,
        nome: encAtual?.nome || sessao.encarregadoNome,
        obrasVinculadas,
      },
      colaboradores,
      statusRelatorios,
    });
  } catch (err) {
    console.error('[ponto-campo/auth GET]', err);
    return NextResponse.json(
      { error: 'Falha ao carregar sessão do App de Campo.' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const flags = await lerFeatureFlagsTenant(JHOSTON_TENANT_ID);
    if (!flags.FF_PWA_PONTO_CAMPO) {
      return NextResponse.json(
        { error: 'App de Campo em homologação (desligado em /config-geral).' },
        { status: 403 }
      );
    }

    const body = (await req.json()) as {
      encarregadoId?: string;
      pin?: string;
    };
    const encarregadoId = String(body.encarregadoId || '').trim();
    const pin = String(body.pin || '').trim();

    if (!encarregadoId || !pin) {
      return NextResponse.json(
        { error: 'Selecione seu nome e informe o PIN de 4 dígitos.' },
        { status: 400 }
      );
    }

    const { encarregados } = await carregarConfigCampoJhoston();
    const enc = encarregados.find(
      (e) => e.id === encarregadoId && e.ativo !== false
    );

    if (!enc || enc.pin !== pin) {
      return NextResponse.json(
        { error: 'PIN incorreto. Confira com a administração.' },
        { status: 401 }
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

    return res;
  } catch (err) {
    console.error('[ponto-campo/auth POST]', err);
    return NextResponse.json(
      { error: 'Erro ao validar PIN.' },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  const res = NextResponse.json({ success: true });
  res.cookies.set(PONTO_CAMPO_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return res;
}
