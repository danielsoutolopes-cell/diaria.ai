import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getActiveTenantFromRequest, TENANTS } from '@/lib/tenant';
import {
  normalizarNomeObraCanonica,
  normalizarNomeTrabalhadorCanonico,
} from '@/lib/normalizarObra';
import {
  gerarTokenExtratoColaborador,
  verificarTokenExtratoColaborador,
} from '@/lib/extratoToken';
import { lerFeatureFlagsTenant } from '@/services/featureFlagsStorage';

export const dynamic = 'force-dynamic';

interface ObraRel {
  nome: string | null;
  tipo_obra: string | null;
}

interface LancamentoPortalRow {
  id: string;
  nome_trabalhador: string;
  tipo_lancamento: string;
  fracao_dia: number | string | null;
  valor_monetario: number | string | null;
  status: string;
  data_referencia: string;
  observacao: string | null;
  solicitado_por?: string | null;
  ciclo_encerrado?: boolean | null;
  obras_config: ObraRel | ObraRel[] | null;
}

function extrairObra(rel: ObraRel | ObraRel[] | null | undefined): string {
  if (!rel) return 'CANTEIRO';
  const item = Array.isArray(rel) ? rel[0] : rel;
  return normalizarNomeObraCanonica(item?.nome, item?.tipo_obra);
}

/**
 * POST /api/extrato-colaborador: gera link seguro assinado (/extrato/[token])
 * Estritamente condicionado à Feature Flag FF_EXTRATO_COLABORADOR_LINK do tenant ativo.
 */
export async function POST(req: NextRequest) {
  try {
    const activeTenant = getActiveTenantFromRequest(req);
    const flags = await lerFeatureFlagsTenant(activeTenant.id);

    if (!flags.FF_EXTRATO_COLABORADOR_LINK) {
      return NextResponse.json(
        {
          error:
            'Recurso em homologação (FF_EXTRATO_COLABORADOR_LINK) está desativado para esta empresa no /config-geral.',
        },
        { status: 403 }
      );
    }

    const body = (await req.json()) as {
      trabalhador?: string;
      periodoDias?: number;
      expiraEmHoras?: number;
    };

    if (!body.trabalhador?.trim()) {
      return NextResponse.json(
        { error: 'Informe o nome do colaborador.' },
        { status: 400 }
      );
    }

    const gerado = gerarTokenExtratoColaborador({
      tenantId: activeTenant.id,
      trabalhador: body.trabalhador,
      periodoDias: body.periodoDias || 15,
      expiraEmHoras: body.expiraEmHoras || 168,
    });

    const origin =
      req.headers.get('origin') ||
      process.env.NEXT_PUBLIC_APP_URL ||
      '';
    const pathUrl = `/extrato/${gerado.token}`;

    return NextResponse.json({
      success: true,
      emHomologacao: true,
      token: gerado.token,
      urlRelativa: pathUrl,
      urlCompleta: origin ? `${origin}${pathUrl}` : pathUrl,
      trabalhador: gerado.payload.trabalhadorCanonico,
      expiraEmIso: gerado.expiraEmIso,
    });
  } catch (err: unknown) {
    const msg =
      err instanceof Error
        ? err.message
        : 'Erro ao gerar link de extrato do colaborador.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * GET /api/extrato-colaborador?token=...: consulta pública sem login via token HMAC assinado.
 * Valida assinatura, expiração, Feature Flag do tenant e isola estritamente o colaborador.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get('token') || '';
    if (!token) {
      return NextResponse.json(
        { error: 'Token de acesso não informado.' },
        { status: 400 }
      );
    }

    const verif = verificarTokenExtratoColaborador(token);
    if (!verif.valido) {
      return NextResponse.json({ error: verif.motivo }, { status: 401 });
    }

    const { tenantId, trabalhadorCanonico, periodoDias, expiraEm } =
      verif.payload;

    // Respeita desligamento instantâneo da Feature Flag
    const flags = await lerFeatureFlagsTenant(tenantId);
    if (!flags.FF_EXTRATO_COLABORADOR_LINK) {
      return NextResponse.json(
        {
          error:
            'O Portal do Colaborador está temporariamente desativado para esta empresa.',
        },
        { status: 403 }
      );
    }

    const empresa =
      tenantId === TENANTS.intermack.id ? TENANTS.intermack : TENANTS.jhoston;

    const inicio = new Date();
    inicio.setDate(inicio.getDate() - Math.min(60, Math.max(7, periodoDias)));
    const dataInicioIso = inicio.toLocaleDateString('en-CA', {
      timeZone: 'America/Sao_Paulo',
    });

    const { data: rows, error } = await supabaseAdmin
      .from('lancamentos_financeiros')
      .select(
        'id, nome_trabalhador, tipo_lancamento, fracao_dia, valor_monetario, status, data_referencia, observacao, solicitado_por, ciclo_encerrado, obras_config ( nome, tipo_obra )'
      )
      .eq('tenant_id', tenantId)
      .neq('status', 'DESCARTADO')
      .gte('data_referencia', dataInicioIso)
      .order('data_referencia', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Filtra ESTRITAMENTE os lançamentos pertencentes ao trabalhador dono do token
    const alvoUpper = trabalhadorCanonico.toUpperCase();
    const meusLancs = (
      (rows as unknown as LancamentoPortalRow[] | null) || []
    ).filter(
      (r) =>
        normalizarNomeTrabalhadorCanonico(r.nome_trabalhador).toUpperCase() ===
        alvoUpper
    );

    // Detecta rateios multi-obra por data
    const obrasPorDia = new Map<string, Set<string>>();
    meusLancs.forEach((r) => {
      if (r.tipo_lancamento !== 'PONTO') return;
      const set = obrasPorDia.get(r.data_referencia) || new Set<string>();
      set.add(extrairObra(r.obras_config));
      obrasPorDia.set(r.data_referencia, set);
    });

    const diarias = meusLancs
      .filter((r) => r.tipo_lancamento === 'PONTO')
      .map((r) => {
        const valor = Number(r.valor_monetario || 0);
        const fracao = Number(r.fracao_dia ?? 1);
        const obs = (r.observacao || '').toLowerCase();
        const isChuva = obs.includes('chuva') || (fracao === 1 && valor === 120);
        const isRateio = (obrasPorDia.get(r.data_referencia)?.size || 0) > 1;
        return {
          id: r.id,
          data: r.data_referencia,
          obra: extrairObra(r.obras_config),
          fracao,
          valor,
          status: r.status,
          isChuva,
          isRateio,
          observacao: r.observacao || (isChuva ? 'Dia de chuva (R$ 120,00)' : 'Diária normal'),
        };
      });

    const vales = meusLancs
      .filter((r) => r.tipo_lancamento === 'VALE')
      .map((r) => ({
        id: r.id,
        data: r.data_referencia,
        obra: extrairObra(r.obras_config),
        valor: Number(r.valor_monetario || 0),
        status: r.status,
        solicitadoPor: normalizarNomeTrabalhadorCanonico(r.solicitado_por || 'Gil'),
        observacao: r.observacao || 'Vale adiantamento',
      }));

    const abertas = diarias.filter((d) => d.status !== 'LIQUIDADO');
    const valesAbertos = vales.filter((v) => v.status !== 'LIQUIDADO');

    const totalDiariasQtd = Number(
      abertas.reduce((acc, d) => acc + d.fracao, 0).toFixed(2)
    );
    const totalDiariasValor = Number(
      abertas.reduce((acc, d) => acc + d.valor, 0).toFixed(2)
    );
    const totalValesValor = Number(
      valesAbertos.reduce((acc, v) => acc + v.valor, 0).toFixed(2)
    );
    const liquidoEstimado = Math.max(
      0,
      Number((totalDiariasValor - totalValesValor).toFixed(2))
    );

    return NextResponse.json({
      success: true,
      emHomologacao: true,
      empresaNome: empresa.razaoSocial || empresa.nome,
      trabalhador: trabalhadorCanonico,
      periodoDias,
      validoAteIso: new Date(expiraEm * 1000).toISOString(),
      resumo: {
        totalDiariasQtd,
        totalDiariasValor,
        totalValesValor,
        liquidoEstimado,
        qtdDiasChuva: diarias.filter((d) => d.isChuva).length,
        qtdRateios: diarias.filter((d) => d.isRateio).length,
      },
      diarias,
      vales,
    });
  } catch (err: unknown) {
    const msg =
      err instanceof Error
        ? err.message
        : 'Erro ao carregar extrato do colaborador.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
