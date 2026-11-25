import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase';
import { getActiveTenantFromRequest } from '@/lib/tenant';
import { uploadToR2 } from '@/services/r2Storage';
import {
  normalizarNomeObraCanonica,
  normalizarNomeTrabalhadorCanonico,
} from '@/lib/normalizarObra';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const activeTenant = getActiveTenantFromRequest(req);
    const [resObras, resFuncs] = await Promise.all([
      supabaseAdmin
        .from('obras_config')
        .select('id, nome, tipo_obra, valor_diaria_padrao')
        .eq('tenant_id', activeTenant.id)
        .eq('ativo', true)
        .order('nome', { ascending: true }),
      supabaseAdmin
        .from('funcionarios_obra')
        .select(
          'id, nome_trabalhador, valor_diaria, valor_diaria_obra, valor_diaria_piscina'
        )
        .eq('tenant_id', activeTenant.id)
        .eq('ativo', true)
        .order('nome_trabalhador', { ascending: true }),
    ]);

    return NextResponse.json({
      success: true,
      tenant: activeTenant,
      obras: (resObras.data || []).map((o) => ({
        id: String(o.id),
        nome: normalizarNomeObraCanonica(String(o.nome), String(o.tipo_obra || '')),
        tipoObra: String(o.tipo_obra || 'OBRA_CIVIL'),
        valorDiariaPadrao: Number(o.valor_diaria_padrao || 150),
      })),
      funcionarios: (resFuncs.data || []).map((f) => ({
        id: String(f.id),
        nome: normalizarNomeTrabalhadorCanonico(String(f.nome_trabalhador)),
        valorDiaria: Number(f.valor_diaria || 150),
        valorDiariaObra: Number(f.valor_diaria_obra || f.valor_diaria || 150),
        valorDiariaPiscina: Number(
          f.valor_diaria_piscina || f.valor_diaria || 150
        ),
      })),
    });
  } catch (err) {
    console.error('[api/ponto-direto GET]', err);
    return NextResponse.json(
      { error: 'Erro ao carregar obras e colaboradores.' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const activeTenant = getActiveTenantFromRequest(req);
    const formData = await req.formData();

    const obraId = String(formData.get('obraId') || '').trim();
    const obraNomeRaw = String(formData.get('obraNome') || '').trim();
    const funcionarioId = String(formData.get('funcionarioId') || '').trim();
    const nomeRaw = String(formData.get('nomeTrabalhador') || '').trim();
    const dataRef = String(formData.get('dataReferencia') || '').trim();
    const fracaoDia = Number(formData.get('fracaoDia') || 1);
    const valorMonetario = Number(formData.get('valorMonetario') || 0);
    const observacao = String(formData.get('observacao') || '').trim();
    const indicadoPor = String(formData.get('indicadoPor') || 'DANIEL').trim();
    const foto = formData.get('foto');

    if (!obraId || !nomeRaw || !dataRef) {
      return NextResponse.json(
        { error: 'Obra, Colaborador e Data são obrigatórios.' },
        { status: 400 }
      );
    }

    const nomeCanonico = normalizarNomeTrabalhadorCanonico(nomeRaw);
    const obraCanonica = normalizarNomeObraCanonica(obraNomeRaw);

    let comprovanteUrl: string | null = null;
    if (foto instanceof File && foto.size > 0) {
      const buf = Buffer.from(await foto.arrayBuffer());
      const mime = foto.type || 'image/jpeg';
      const ext = mime.includes('png') ? 'png' : 'jpg';
      const key = `ponto-direto/${activeTenant.slug}/${dataRef}/${crypto.randomUUID()}.${ext}`;
      try {
        const up = await uploadToR2(buf, key, mime);
        comprovanteUrl = up.url;
      } catch {
        comprovanteUrl = `data:${mime};base64,${buf.toString('base64')}`;
      }
    }

    const chaveIdemp = `ponto-direto-${activeTenant.slug}-${dataRef}-${obraId}-${nomeCanonico
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')}-${fracaoDia}`;

    const obsFinal = [
      observacao || 'NORMAL',
      `origem=ABA_PONTO_DIRETO`,
      `indicado_por=${indicadoPor}`,
      `obra=${obraCanonica}`,
    ].join(' | ');

    const { data: inserido, error: insErr } = await supabaseAdmin
      .from('lancamentos_financeiros')
      .insert({
        tenant_id: activeTenant.id,
        obra_id: obraId,
        funcionario_id: funcionarioId || null,
        nome_trabalhador: nomeCanonico,
        tipo_lancamento: 'PONTO',
        fracao_dia: fracaoDia,
        valor_monetario: valorMonetario,
        status: 'VALIDADO',
        data_referencia: dataRef,
        comprovante_url: comprovanteUrl,
        aprovado_por: `${indicadoPor} (ABA_PONTO_DIRETO)`,
        observacao: obsFinal,
        chave_idempotencia: chaveIdemp,
      })
      .select('id, nome_trabalhador, data_referencia, fracao_dia, valor_monetario, status, comprovante_url')
      .maybeSingle();

    if (insErr) {
      console.error('[api/ponto-direto INSERT]', insErr);
      return NextResponse.json(
        { error: `Erro ao gravar ponto direto: ${insErr.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      lancamento: inserido,
      message: `Ponto de ${nomeCanonico} (${fracaoDia}x — R$ ${valorMonetario.toFixed(2)}) gravado e validado com sucesso!`,
    });
  } catch (err) {
    console.error('[api/ponto-direto POST]', err);
    return NextResponse.json(
      { error: 'Erro inesperado ao gravar ponto direto.' },
      { status: 500 }
    );
  }
}
