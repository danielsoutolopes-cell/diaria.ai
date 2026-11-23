import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getActiveTenantFromRequest } from '@/lib/tenant';
import {
  extrairEmissoresPixAtivos,
  isEmissorPixPadrao,
  normalizarEmissorPix,
  normalizarListaEmissoresConfig,
  type EmissorPixCaixinhaConfig,
} from '@/lib/caixinhaPixRastreabilidade';

export const dynamic = 'force-dynamic';

interface EmissoresPostBody {
  action: 'adicionar' | 'alternar' | 'remover';
  id?: string;
  nome?: string;
  ativo?: boolean;
}

async function lerConfigEmissoresTenant(tenantId: string): Promise<{
  paramId: string | null;
  configs: Record<string, unknown>;
  emissores: EmissorPixCaixinhaConfig[];
}> {
  const { data: paramRow } = await supabaseAdmin
    .from('parametros_sistema')
    .select('id, configuracoes')
    .eq('tenant_id', tenantId)
    .limit(1)
    .maybeSingle();

  const configs = ((paramRow?.configuracoes as Record<string, unknown> | null) ||
    {}) as Record<string, unknown>;
  const emissores = normalizarListaEmissoresConfig(
    configs.emissores_pix_caixinha
  );

  return {
    paramId: (paramRow?.id as string | undefined) || null,
    configs,
    emissores,
  };
}

async function salvarConfigEmissoresTenant(
  tenantId: string,
  paramId: string | null,
  configs: Record<string, unknown>,
  emissores: EmissorPixCaixinhaConfig[]
): Promise<void> {
  const novasConfigs: Record<string, unknown> = {
    ...configs,
    emissores_pix_caixinha: emissores,
    emissores_pix_caixinha_atualizado_em: new Date().toISOString(),
  };

  if (paramId) {
    await supabaseAdmin
      .from('parametros_sistema')
      .update({ configuracoes: novasConfigs })
      .eq('id', paramId)
      .eq('tenant_id', tenantId);
  } else {
    await supabaseAdmin.from('parametros_sistema').insert({
      tenant_id: tenantId,
      configuracoes: novasConfigs,
    });
  }
}

export async function GET(req: NextRequest) {
  try {
    const activeTenant = getActiveTenantFromRequest(req);
    const { emissores } = await lerConfigEmissoresTenant(activeTenant.id);
    const emissoresAtivos = extrairEmissoresPixAtivos(emissores);

    return NextResponse.json({
      success: true,
      tenant: {
        id: activeTenant.id,
        slug: activeTenant.slug,
        nome: activeTenant.nome,
      },
      emissores,
      emissoresAtivos,
    });
  } catch (err: unknown) {
    const msg =
      err instanceof Error
        ? err.message
        : 'Erro ao listar emissores de PIX da Caixinha de Campo.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const activeTenant = getActiveTenantFromRequest(req);
    const body = (await req.json()) as EmissoresPostBody;

    const { paramId, configs, emissores } = await lerConfigEmissoresTenant(
      activeTenant.id
    );

    if (body.action === 'adicionar') {
      const nomeLimpo = normalizarEmissorPix(body.nome);
      if (!nomeLimpo) {
        return NextResponse.json(
          { error: 'Informe um nome válido para o emissor de PIX.' },
          { status: 400 }
        );
      }

      const chaveNova = nomeLimpo
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();

      const existente = emissores.find(
        (e) =>
          e.nome
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase() === chaveNova
      );

      let atualizados: EmissorPixCaixinhaConfig[];
      if (existente) {
        atualizados = emissores.map((e) =>
          e.id === existente.id ? { ...e, ativo: true } : e
        );
      } else {
        const novo: EmissorPixCaixinhaConfig = {
          id: crypto.randomUUID(),
          nome: nomeLimpo,
          ativo: true,
          padrao: false,
          criadoEm: new Date().toISOString(),
        };
        atualizados = [...emissores, novo];
      }

      await salvarConfigEmissoresTenant(
        activeTenant.id,
        paramId,
        configs,
        atualizados
      );

      return NextResponse.json({
        success: true,
        emissores: atualizados,
        emissoresAtivos: extrairEmissoresPixAtivos(atualizados),
        message: `Emissor "${nomeLimpo}" disponível no seletor da Caixinha de Campo.`,
      });
    }

    if (body.action === 'alternar' && body.id) {
      const alvo = emissores.find((e) => e.id === body.id);
      if (!alvo) {
        return NextResponse.json(
          { error: 'Emissor não encontrado para esta empresa.' },
          { status: 404 }
        );
      }
      if (alvo.padrao || isEmissorPixPadrao(alvo.nome)) {
        return NextResponse.json(
          {
            error:
              'Patrícia e Joabson são emissores padrão obrigatórios e permanecem sempre ativos.',
          },
          { status: 400 }
        );
      }

      const novoAtivo =
        typeof body.ativo === 'boolean' ? body.ativo : !alvo.ativo;
      const atualizados = emissores.map((e) =>
        e.id === alvo.id ? { ...e, ativo: novoAtivo } : e
      );

      await salvarConfigEmissoresTenant(
        activeTenant.id,
        paramId,
        configs,
        atualizados
      );

      return NextResponse.json({
        success: true,
        emissores: atualizados,
        emissoresAtivos: extrairEmissoresPixAtivos(atualizados),
        message: `Emissor "${alvo.nome}" ${novoAtivo ? 'ativado' : 'desativado'}.`,
      });
    }

    if (body.action === 'remover' && body.id) {
      const alvo = emissores.find((e) => e.id === body.id);
      if (!alvo) {
        return NextResponse.json(
          { error: 'Emissor não encontrado para esta empresa.' },
          { status: 404 }
        );
      }
      if (alvo.padrao || isEmissorPixPadrao(alvo.nome)) {
        return NextResponse.json(
          {
            error:
              'Patrícia e Joabson são opções padrão obrigatórias e não podem ser removidos.',
          },
          { status: 400 }
        );
      }

      const atualizados = emissores.filter((e) => e.id !== alvo.id);
      await salvarConfigEmissoresTenant(
        activeTenant.id,
        paramId,
        configs,
        atualizados
      );

      return NextResponse.json({
        success: true,
        emissores: atualizados,
        emissoresAtivos: extrairEmissoresPixAtivos(atualizados),
        message: `Emissor "${alvo.nome}" removido da lista.`,
      });
    }

    return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
  } catch (err: unknown) {
    const msg =
      err instanceof Error
        ? err.message
        : 'Erro ao atualizar emissores de PIX da Caixinha.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
