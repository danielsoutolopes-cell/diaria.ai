import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getActiveTenantFromRequest } from '@/lib/tenant';
import { uploadToR2 } from '@/services/r2Storage';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

export interface EfetivoItem {
  nome: string;
  periodo: 'INTEGRAL' | 'MEIO_DIA';
}

export interface DiarioObraRegistro {
  id: string;
  tenantSlug: string;
  empresaNome: string;
  obraNome: string;
  ambiente: 'INTERNO' | 'EXTERNO';
  data: string;
  clima: string;
  statusCondominio?: string;
  empreiteiro: string;
  efetivo: EfetivoItem[];
  resumo: string;
  ocorrencias: string;
  fotos: string[];
  criadoPor: string;
  criadoEm: string;
}

async function lerDiariosDoTenant(tenantId: string): Promise<{
  paramId: string | null;
  configs: Record<string, unknown>;
  diarios: DiarioObraRegistro[];
}> {
  const { data: paramData } = await supabaseAdmin
    .from('parametros_sistema')
    .select('id, configuracoes')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  const configs = ((paramData?.configuracoes as Record<string, unknown> | null) ||
    {}) as Record<string, unknown>;
  const diarios = Array.isArray(configs.diarios_obra)
    ? (configs.diarios_obra as DiarioObraRegistro[])
    : [];

  return {
    paramId: (paramData?.id as string | undefined) || null,
    configs,
    diarios,
  };
}

export async function GET(req: NextRequest) {
  try {
    const activeTenant = getActiveTenantFromRequest(req);
    const { diarios } = await lerDiariosDoTenant(activeTenant.id);

    const { data: obras } = await supabaseAdmin
      .from('obras_config')
      .select('id, nome')
      .eq('tenant_id', activeTenant.id)
      .order('nome', { ascending: true });

    return NextResponse.json({
      tenant: activeTenant,
      diarios,
      obras: obras || [],
    });
  } catch (error) {
    console.error('Erro em GET /api/diario-obra:', error);
    return NextResponse.json(
      { diarios: [], obras: [], error: 'Erro ao carregar diários de obra.' },
      { status: 500 }
    );
  }
}

interface DiarioPostBody {
  action: 'salvar' | 'excluir' | 'efetivo-dia';
  id?: string;
  obraNome?: string;
  ambiente?: 'INTERNO' | 'EXTERNO';
  data?: string;
  clima?: string;
  statusCondominio?: string;
  empreiteiro?: string;
  efetivo?: EfetivoItem[];
  resumo?: string;
  ocorrencias?: string;
  fotosBase64?: string[];
  usuarioLogado?: string;
}

export async function POST(req: NextRequest) {
  try {
    const activeTenant = getActiveTenantFromRequest(req);
    const body = (await req.json()) as DiarioPostBody;

    // 1. Puxar efetivo validado do dia (sem valores financeiros)
    if (body.action === 'efetivo-dia') {
      const dataRef = body.data || new Date().toISOString().split('T')[0];
      const { data: lancs } = await supabaseAdmin
        .from('lancamentos_financeiros')
        .select('nome_trabalhador, fracao_dia, obras_config ( nome )')
        .eq('tenant_id', activeTenant.id)
        .eq('tipo_lancamento', 'PONTO')
        .eq('data_referencia', dataRef)
        .neq('status', 'DESCARTADO');

      const filtroObra = (body.obraNome || '').trim().toLowerCase();
      const efetivo: EfetivoItem[] = [];

      for (const row of lancs || []) {
        const obraRow = (
          row as unknown as { obras_config?: { nome?: string | null } | null }
        ).obras_config?.nome;
        if (
          filtroObra &&
          obraRow &&
          !obraRow.toLowerCase().includes(filtroObra)
        ) {
          continue;
        }
        const fracao = Number(row.fracao_dia || 0);
        if (fracao <= 0) continue; // Ignora faltas (regra Intermack)
        efetivo.push({
          nome: String(row.nome_trabalhador || 'Profissional'),
          periodo: fracao >= 1 ? 'INTEGRAL' : 'MEIO_DIA',
        });
      }

      return NextResponse.json({ success: true, efetivo });
    }

    const { paramId, configs, diarios } = await lerDiariosDoTenant(activeTenant.id);

    // 2. Excluir um diário
    if (body.action === 'excluir' && body.id) {
      const atualizados = diarios.filter((d) => d.id !== body.id);
      const novasConfigs = { ...configs, diarios_obra: atualizados };
      if (paramId) {
        await supabaseAdmin
          .from('parametros_sistema')
          .update({ configuracoes: novasConfigs })
          .eq('id', paramId);
      }
      return NextResponse.json({ success: true, diarios: atualizados });
    }

    // 3. Salvar novo diário com upload de até 3 fotos no R2 (fallback para dataURL)
    if (body.action === 'salvar') {
      const fotosInput = (body.fotosBase64 || []).slice(0, 3);
      const fotosUrls: string[] = [];

      for (let i = 0; i < fotosInput.length; i++) {
        const raw = fotosInput[i];
        if (!raw) continue;
        if (raw.startsWith('http://') || raw.startsWith('https://')) {
          fotosUrls.push(raw);
          continue;
        }
        try {
          const cleanBase64 = raw.replace(/^data:image\/\w+;base64,/, '');
          const buffer = Buffer.from(cleanBase64, 'base64');
          const safeObra = (body.obraNome || 'obra')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-');
          const fileName = `diario-${activeTenant.slug}-${safeObra}-${Date.now()}-${i + 1}.jpg`;
          const uploadRes = await uploadToR2(buffer, fileName, 'image/jpeg');
          if (uploadRes.success && uploadRes.url) {
            fotosUrls.push(uploadRes.url);
          } else {
            fotosUrls.push(raw);
          }
        } catch {
          fotosUrls.push(raw);
        }
      }

      const novoRegistro: DiarioObraRegistro = {
        id: crypto.randomUUID(),
        tenantSlug: activeTenant.slug,
        empresaNome: activeTenant.nome,
        obraNome: (body.obraNome || 'OBRA SEM NOME').trim().toUpperCase(),
        ambiente:
          body.ambiente ||
          (activeTenant.slug === 'intermack' ? 'INTERNO' : 'EXTERNO'),
        data: body.data || new Date().toISOString().split('T')[0],
        clima: body.clima || 'Ensolarado',
        statusCondominio: body.statusCondominio || 'Acesso Normal',
        empreiteiro: (body.empreiteiro || 'Equipe Empreiteiro').trim(),
        efetivo: (body.efetivo || []).filter((e) => e.nome.trim().length > 0),
        resumo: (body.resumo || '').trim(),
        ocorrencias: (body.ocorrencias || '').trim(),
        fotos: fotosUrls,
        criadoPor: body.usuarioLogado || 'Patrícia Grubel',
        criadoEm: new Date().toISOString(),
      };

      const atualizados = [novoRegistro, ...diarios];
      const novasConfigs = { ...configs, diarios_obra: atualizados };

      if (paramId) {
        await supabaseAdmin
          .from('parametros_sistema')
          .update({ configuracoes: novasConfigs })
          .eq('id', paramId);
      } else {
        await supabaseAdmin.from('parametros_sistema').insert({
          tenant_id: activeTenant.id,
          configuracoes: novasConfigs,
        });
      }

      return NextResponse.json({
        success: true,
        diario: novoRegistro,
        diarios: atualizados,
      });
    }

    return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
  } catch (error) {
    console.error('Erro em POST /api/diario-obra:', error);
    return NextResponse.json(
      { error: 'Erro interno ao processar diário de obra.' },
      { status: 500 }
    );
  }
}
