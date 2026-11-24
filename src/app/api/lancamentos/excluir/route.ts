import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getActiveTenantFromRequest } from '@/lib/tenant';
import { deleteFromR2ByUrl } from '@/services/r2Storage';
import { validarDuplaAlcada } from '@/lib/duplaAlcada';

interface ExcluirLancamentoBody {
  lancamentoId?: string;
  pinPatricia?: string;
  pinDaniel?: string;
}

interface LancamentoExcluirRow {
  id: string;
  comprovante_url: string | null;
  nome_trabalhador: string;
  created_at?: string | null;
  data_referencia?: string | null;
}

export async function POST(req: NextRequest) {
  try {
    const activeTenant = getActiveTenantFromRequest(req);
    const body = (await req.json()) as ExcluirLancamentoBody;
    const { lancamentoId } = body;

    if (!lancamentoId) {
      return NextResponse.json(
        { error: 'ID do lançamento é obrigatório.' },
        { status: 400 }
      );
    }

    // 1. Buscar o registro isolado por tenant_id
    const { data: lancRaw, error: fetchErr } = await supabaseAdmin
      .from('lancamentos_financeiros')
      .select('id, comprovante_url, nome_trabalhador, created_at, data_referencia')
      .eq('id', lancamentoId)
      .eq('tenant_id', activeTenant.id)
      .single();

    const lancamento = lancRaw as unknown as LancamentoExcluirRow | null;
    if (fetchErr || !lancamento) {
      return NextResponse.json(
        { error: 'Lançamento não encontrado para a empresa ativa.' },
        { status: 404 }
      );
    }

    // 1.5 Trava de Dupla Alçada (>24h exige PIN Patrícia + PIN Daniel válidos por 3 min)
    const checkDupla = validarDuplaAlcada({
      createdAt: lancamento.created_at,
      dataReferencia: lancamento.data_referencia,
      pinPatricia: body.pinPatricia,
      pinDaniel: body.pinDaniel,
    });
    if (!checkDupla.autorizado) {
      return NextResponse.json(
        {
          error: checkDupla.erro,
          exigeDuplaAlcada: true,
        },
        { status: 403 }
      );
    }

    let r2Excluido = false;

    // 2. Se houver comprovante_url, apaga fisicamente do Cloudflare R2
    if (lancamento.comprovante_url) {
      const delResult = await deleteFromR2ByUrl(lancamento.comprovante_url);
      r2Excluido = delResult.success;
      if (!delResult.success) {
        console.warn(`Aviso: falha ao apagar mídia do R2: ${delResult.error}`);
      }
    }

    // 3. Excluir o lançamento no Supabase com trava estrita de tenant_id
    const { error: deleteErr } = await supabaseAdmin
      .from('lancamentos_financeiros')
      .delete()
      .eq('id', lancamentoId)
      .eq('tenant_id', activeTenant.id);

    if (deleteErr) {
      throw deleteErr;
    }

    return NextResponse.json({
      success: true,
      message:
        'Lançamento excluído com sucesso e mídia física limpa do Cloudflare R2.',
      r2Excluido,
    });
  } catch (error: unknown) {
    const msg =
      error instanceof Error
        ? error.message
        : 'Falha ao processar exclusão do lançamento.';
    console.error('Erro ao excluir lançamento e mídia R2:', error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

