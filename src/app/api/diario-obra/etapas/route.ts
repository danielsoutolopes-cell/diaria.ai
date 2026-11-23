import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getActiveTenantFromRequest } from '@/lib/tenant';
import {
  isSubempreitaHabilitada,
  normalizarTextoBusca,
} from '@/lib/diarioObraRelatorio';

export const dynamic = 'force-dynamic';

export type MapaEtapasPorObra = Record<string, string[]>;

interface EscopoMedicaoMin {
  obraNome?: string;
  etapas?: Array<{ nome?: string }>;
}

function sanitizarListaEtapas(etapas: ReadonlyArray<string>): string[] {
  const vistos = new Set<string>();
  const lista: string[] = [];
  for (const raw of etapas) {
    const limpo = String(raw || '').trim();
    const chave = normalizarTextoBusca(limpo);
    if (!chave || vistos.has(chave)) continue;
    vistos.add(chave);
    lista.push(limpo);
  }
  return lista;
}

async function lerEtapasTenant(tenantId: string): Promise<{
  paramId: string | null;
  configs: Record<string, unknown>;
  etapasPorObra: MapaEtapasPorObra;
}> {
  const { data } = await supabaseAdmin
    .from('parametros_sistema')
    .select('id, configuracoes')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  const configs = ((data?.configuracoes as Record<string, unknown> | null) ||
    {}) as Record<string, unknown>;

  const etapasPorObra: MapaEtapasPorObra = {};

  // 1. Etapas vindas de /medicoes (se existirem)
  if (Array.isArray(configs.medicoes_escopo)) {
    for (const escopo of configs.medicoes_escopo as EscopoMedicaoMin[]) {
      const chave = normalizarTextoBusca(escopo.obraNome);
      if (!chave || !Array.isArray(escopo.etapas)) continue;
      etapasPorObra[chave] = sanitizarListaEtapas(
        escopo.etapas.map((e) => e.nome || '')
      );
    }
  }

  // 2. Etapas gerenciadas no /setup (Obras & Etapas Intermack)
  const rawSetup = configs.etapas_por_obra_v22 as
    | Record<string, unknown>
    | undefined;
  if (rawSetup && typeof rawSetup === 'object') {
    for (const [chaveBruta, lista] of Object.entries(rawSetup)) {
      const chave = normalizarTextoBusca(chaveBruta);
      if (!chave || !Array.isArray(lista)) continue;
      etapasPorObra[chave] = sanitizarListaEtapas(lista.map(String));
    }
  }

  return {
    paramId: (data?.id as string | undefined) || null,
    configs,
    etapasPorObra,
  };
}

export async function GET(req: NextRequest) {
  try {
    const activeTenant = getActiveTenantFromRequest(req);
    if (!isSubempreitaHabilitada(activeTenant.slug)) {
      return NextResponse.json({
        success: true,
        subempreitaAtiva: false,
        etapasPorObra: {},
      });
    }

    const { etapasPorObra } = await lerEtapasTenant(activeTenant.id);
    return NextResponse.json({
      success: true,
      subempreitaAtiva: true,
      etapasPorObra,
    });
  } catch (error) {
    console.error('Erro em GET /api/diario-obra/etapas:', error);
    return NextResponse.json(
      { error: 'Falha ao carregar etapas por obra.' },
      { status: 500 }
    );
  }
}

interface EtapasPostBody {
  obraNome: string;
  etapas: string[];
}

export async function POST(req: NextRequest) {
  try {
    const activeTenant = getActiveTenantFromRequest(req);
    if (!isSubempreitaHabilitada(activeTenant.slug)) {
      return NextResponse.json(
        {
          error:
            'Gestão de etapas por obra disponível exclusivamente para o tenant Intermack.',
        },
        { status: 403 }
      );
    }

    const body = (await req.json()) as EtapasPostBody;
    const chaveObra = normalizarTextoBusca(body.obraNome);
    if (!chaveObra) {
      return NextResponse.json(
        { error: 'Informe o nome da obra.' },
        { status: 400 }
      );
    }

    const etapasLimpas = sanitizarListaEtapas(
      Array.isArray(body.etapas) ? body.etapas : []
    );

    const { paramId, configs, etapasPorObra } = await lerEtapasTenant(
      activeTenant.id
    );
    const setupAtual =
      (configs.etapas_por_obra_v22 as Record<string, string[]> | undefined) || {};
    const novoSetup: Record<string, string[]> = {
      ...setupAtual,
      [chaveObra]: etapasLimpas,
    };
    const novasConfigs = { ...configs, etapas_por_obra_v22: novoSetup };

    if (paramId) {
      await supabaseAdmin
        .from('parametros_sistema')
        .update({ configuracoes: novasConfigs })
        .eq('id', paramId)
        .eq('tenant_id', activeTenant.id);
    } else {
      await supabaseAdmin.from('parametros_sistema').insert({
        tenant_id: activeTenant.id,
        configuracoes: novasConfigs,
      });
    }

    return NextResponse.json({
      success: true,
      etapasPorObra: {
        ...etapasPorObra,
        [chaveObra]: etapasLimpas,
      },
    });
  } catch (error) {
    console.error('Erro em POST /api/diario-obra/etapas:', error);
    return NextResponse.json(
      { error: 'Falha ao salvar etapas da obra.' },
      { status: 500 }
    );
  }
}
