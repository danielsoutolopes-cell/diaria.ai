import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase';
import { uploadToR2 } from '@/services/r2Storage';
import { lerFeatureFlagsTenant } from '@/services/featureFlagsStorage';
import {
  calcularStatusRelatorioSemanal,
  JHOSTON_TENANT_ID,
  normalizarChaveObra,
  obterDataBrasilISO,
  PONTO_CAMPO_COOKIE_NAME,
  verificarSessaoPontoCampo,
} from '@/lib/pontoCampo';
import type { DiarioObraRegistro } from '@/lib/diarioObraRelatorio';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
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
        { error: 'Sessão expirada. Digite seu PIN novamente.' },
        { status: 401 }
      );
    }

    const formData = await req.formData();
    const obraNome = String(formData.get('obraNome') || '').trim();
    const dataIso = String(formData.get('data') || obterDataBrasilISO()).trim();
    const resumo = String(formData.get('resumo') || '').trim();

    if (!obraNome) {
      return NextResponse.json(
        { error: 'Selecione a obra do relatório.' },
        { status: 400 }
      );
    }

    const obraPermitida = sessao.obrasVinculadas.some(
      (o) => normalizarChaveObra(o) === normalizarChaveObra(obraNome)
    );
    if (!obraPermitida) {
      return NextResponse.json(
        { error: 'Obra não vinculada ao seu perfil.' },
        { status: 403 }
      );
    }

    const arquivos = formData
      .getAll('fotos')
      .filter((item): item is File => item instanceof File && item.size > 0)
      .slice(0, 3);

    if (arquivos.length === 0) {
      return NextResponse.json(
        { error: 'Anexe pelo menos 1 foto (recomendado: 3 fotos) da obra.' },
        { status: 400 }
      );
    }

    if (!resumo) {
      return NextResponse.json(
        { error: 'Escreva um breve relato do andamento da obra.' },
        { status: 400 }
      );
    }

    const urlsFotos: string[] = [];
    for (let i = 0; i < arquivos.length; i++) {
      const file = arquivos[i];
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const mime = file.type || 'image/jpeg';
      const ext = mime.includes('png') ? 'png' : 'jpg';
      const key = `diario-obra/jhoston/${dataIso}/${crypto.randomUUID()}_${i + 1}.${ext}`;

      try {
        const uploaded = await uploadToR2(buffer, key, mime);
        urlsFotos.push(uploaded.url);
      } catch {
        // Fallback seguro caso R2 não esteja configurado no ambiente local
        urlsFotos.push(`data:${mime};base64,${buffer.toString('base64')}`);
      }
    }

    const { data: paramData } = await supabaseAdmin
      .from('parametros_sistema')
      .select('id, configuracoes')
      .eq('tenant_id', JHOSTON_TENANT_ID)
      .limit(1)
      .maybeSingle();

    const configs = ((paramData?.configuracoes as Record<string, unknown> | null) ||
      {}) as Record<string, unknown>;
    const diariosAtuais = Array.isArray(configs.diarios_obra)
      ? (configs.diarios_obra as DiarioObraRegistro[])
      : [];

    const novoDiario: DiarioObraRegistro = {
      id: crypto.randomUUID(),
      tenantSlug: 'jhoston',
      empresaNome: 'Jhoston',
      obraNome,
      ambiente: 'EXTERNO',
      data: dataIso,
      clima: 'Ensolarado',
      empreiteiro: sessao.encarregadoNome,
      efetivo: [],
      resumo,
      ocorrencias: '',
      fotos: urlsFotos,
      criadoPor: `${sessao.encarregadoNome} (App Campo)`,
      criadoEm: new Date().toISOString(),
    };

    const diariosAtualizados = [novoDiario, ...diariosAtuais];
    const novasConfigs: Record<string, unknown> = {
      ...configs,
      diarios_obra: diariosAtualizados,
    };

    if (paramData?.id) {
      await supabaseAdmin
        .from('parametros_sistema')
        .update({ configuracoes: novasConfigs })
        .eq('id', paramData.id);
    } else {
      await supabaseAdmin.from('parametros_sistema').insert({
        tenant_id: JHOSTON_TENANT_ID,
        configuracoes: novasConfigs,
      });
    }

    const statusRelatorios = sessao.obrasVinculadas.map((obra) =>
      calcularStatusRelatorioSemanal(diariosAtualizados, obra)
    );

    return NextResponse.json({
      success: true,
      diarioId: novoDiario.id,
      totalFotos: urlsFotos.length,
      statusRelatorios,
      message: `Relatório semanal (${urlsFotos.length} foto(s)) enviado com sucesso!`,
    });
  } catch (err) {
    console.error('[ponto-campo/relatorio POST]', err);
    return NextResponse.json(
      { error: 'Erro ao salvar relatório de obra.' },
      { status: 500 }
    );
  }
}
