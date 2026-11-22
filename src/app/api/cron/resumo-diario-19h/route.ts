import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getActiveTenantFromRequest } from '@/lib/tenant';
import {
  normalizarNomeObraCanonica,
  normalizarNomeTrabalhadorCanonico,
} from '@/lib/normalizarObra';
import { lerFeatureFlagsTenant } from '@/services/featureFlagsStorage';
import {
  formatarResumoDiario19hWhatsApp,
  isJanelaResumoDiario19h,
  type HomologacaoDiaria19hRecord,
  type PresencaResumo19hItem,
} from '@/services/resumoDiario19h';

export const dynamic = 'force-dynamic';

interface ObraRel {
  nome: string | null;
  tipo_obra: string | null;
}

interface PontoHojeRow {
  nome_trabalhador: string;
  fracao_dia: number | string | null;
  observacao: string | null;
  obras_config: ObraRel | ObraRel[] | null;
}

interface GrupoRoteamentoItem {
  grupoJid: string;
  obraNome?: string;
  tenantId?: string;
  ativo?: boolean;
}

function extrairObra(rel: ObraRel | ObraRel[] | null | undefined): string {
  if (!rel) return 'GERAL';
  const item = Array.isArray(rel) ? rel[0] : rel;
  return normalizarNomeObraCanonica(item?.nome, item?.tipo_obra);
}

export async function GET(req: NextRequest) {
  try {
    const activeTenant = getActiveTenantFromRequest(req);
    const flags = await lerFeatureFlagsTenant(activeTenant.id);

    if (!flags.FF_RESUMO_DIARIO_19H) {
      return NextResponse.json({
        success: true,
        habilitado: false,
        flag: 'FF_RESUMO_DIARIO_19H',
        homologacoes: [],
      });
    }

    const { data: paramRow } = await supabaseAdmin
      .from('parametros_sistema')
      .select('configuracoes')
      .eq('tenant_id', activeTenant.id)
      .limit(1)
      .maybeSingle();

    const configs = (paramRow?.configuracoes || {}) as Record<string, unknown>;
    const homologacoes = Array.isArray(configs.homologacoes_diarias_19h)
      ? (configs.homologacoes_diarias_19h as HomologacaoDiaria19hRecord[])
      : [];

    return NextResponse.json({
      success: true,
      habilitado: true,
      emHomologacao: true,
      janelaAtivaAgora: isJanelaResumoDiario19h(),
      homologacoes: homologacoes.slice(0, 20),
    });
  } catch (err: unknown) {
    const msg =
      err instanceof Error ? err.message : 'Erro ao consultar resumo diário 19h.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const activeTenant = getActiveTenantFromRequest(req);
    const tenantId = activeTenant.id;

    // Guarda rígida de Feature Flag por tenant_id
    const flags = await lerFeatureFlagsTenant(tenantId);
    if (!flags.FF_RESUMO_DIARIO_19H) {
      return NextResponse.json(
        {
          success: false,
          skipped: true,
          reason:
            'Feature Flag FF_RESUMO_DIARIO_19H desativada para esta empresa.',
        },
        { status: 403 }
      );
    }

    let force = false;
    try {
      const body = (await req.json()) as { force?: boolean };
      force = body.force === true;
    } catch {
      force = false;
    }

    if (!force && !isJanelaResumoDiario19h()) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: 'Fora da janela das 19:00 (America/Sao_Paulo).',
      });
    }

    const hojeIso = new Date().toLocaleDateString('en-CA', {
      timeZone: 'America/Sao_Paulo',
    });

    const [{ data: lancs }, { data: paramRow }] = await Promise.all([
      supabaseAdmin
        .from('lancamentos_financeiros')
        .select('nome_trabalhador, fracao_dia, observacao, obras_config ( nome, tipo_obra )')
        .eq('tenant_id', tenantId)
        .eq('tipo_lancamento', 'PONTO')
        .neq('status', 'DESCARTADO')
        .eq('data_referencia', hojeIso),
      supabaseAdmin
        .from('parametros_sistema')
        .select('id, configuracoes')
        .eq('tenant_id', tenantId)
        .limit(1)
        .maybeSingle(),
    ]);

    const porObra = new Map<string, PresencaResumo19hItem[]>();
    ((lancs as unknown as PontoHojeRow[] | null) || []).forEach((row) => {
      const obraNome = extrairObra(row.obras_config);
      const lista = porObra.get(obraNome) || [];
      lista.push({
        trabalhador: normalizarNomeTrabalhadorCanonico(row.nome_trabalhador),
        fracao: Number(row.fracao_dia ?? 1),
        observacao: row.observacao,
      });
      porObra.set(obraNome, lista);
    });

    const configs = (paramRow?.configuracoes || {}) as Record<string, unknown>;
    const gruposConfig = Array.isArray(configs.grupos_whatsapp_roteamento)
      ? (configs.grupos_whatsapp_roteamento as GrupoRoteamentoItem[])
      : [];

    const homologacoesAtuais: HomologacaoDiaria19hRecord[] = Array.isArray(
      configs.homologacoes_diarias_19h
    )
      ? (configs.homologacoes_diarias_19h as HomologacaoDiaria19hRecord[])
      : [];

    const baileysUrl =
      process.env.BAILEYS_SERVER_URL || 'http://127.0.0.1:3001';
    const envios: Array<{
      obra: string;
      grupoJid: string | null;
      enviado: boolean;
      mensagem: string;
    }> = [];

    for (const [obraNome, presencas] of Array.from(porObra.entries())) {
      const mensagem = formatarResumoDiario19hWhatsApp({
        empresaNome: activeTenant.nome,
        obraNome,
        dataIso: hojeIso,
        presencas,
      });

      const grupoAlvo = gruposConfig.find(
        (g) =>
          g.ativo !== false &&
          g.obraNome &&
          normalizarNomeObraCanonica(g.obraNome) === obraNome
      );

      let enviado = false;
      if (grupoAlvo?.grupoJid) {
        try {
          const r = await fetch(`${baileysUrl}/send-message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: grupoAlvo.grupoJid,
              message: mensagem,
            }),
          });
          enviado = r.ok;
        } catch {
          enviado = false;
        }
      }

      const chave = `${hojeIso}__${obraNome}`;
      const registro: HomologacaoDiaria19hRecord = {
        chave,
        dataIso: hojeIso,
        obraNome,
        grupoJid: grupoAlvo?.grupoJid || '',
        enviadoEm: new Date().toISOString(),
        status: 'AGUARDANDO_OK',
        homologadoPor: null,
        homologadoEm: null,
        qtdPresentes: presencas.length,
      };

      const idxExist = homologacoesAtuais.findIndex((h) => h.chave === chave);
      if (idxExist >= 0) {
        homologacoesAtuais[idxExist] = registro;
      } else {
        homologacoesAtuais.unshift(registro);
      }

      envios.push({
        obra: obraNome,
        grupoJid: grupoAlvo?.grupoJid || null,
        enviado,
        mensagem,
      });
    }

    const novasConfigs: Record<string, unknown> = {
      ...configs,
      homologacoes_diarias_19h: homologacoesAtuais.slice(0, 60),
    };

    if (paramRow?.id) {
      await supabaseAdmin
        .from('parametros_sistema')
        .update({ configuracoes: novasConfigs })
        .eq('id', paramRow.id);
    } else {
      await supabaseAdmin.from('parametros_sistema').insert({
        tenant_id: tenantId,
        configuracoes: novasConfigs,
      });
    }

    return NextResponse.json({
      success: true,
      emHomologacao: true,
      dataIso: hojeIso,
      obrasProcessadas: envios.length,
      envios,
    });
  } catch (err: unknown) {
    const msg =
      err instanceof Error ? err.message : 'Erro ao executar resumo diário 19h.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
