import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getActiveTenantFromRequest } from '@/lib/tenant';
import {
  normalizarNomeObraCanonica,
  normalizarNomeTrabalhadorCanonico,
} from '@/lib/normalizarObra';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const activeTenant = getActiveTenantFromRequest(req);
    let lancamentos: any[] | null = null;
    let queryError: any = null;

    const resComprovante = await supabaseAdmin
      .from('lancamentos_financeiros')
      .select(`
        id,
        nome_trabalhador,
        tipo_lancamento,
        fracao_dia,
        valor_monetario,
        data_referencia,
        observacao,
        status,
        comprovante_url,
        obras_config (
          nome,
          tipo_obra
        ),
        funcionarios_obra (
          chave_pix,
          valor_diaria
        )
      `)
      .eq('tenant_id', activeTenant.id)
      .eq('status', 'VALIDADO')
      .order('data_referencia', { ascending: true });

    if (resComprovante.error) {
      // Fallback defensivo se a coluna comprovante_url não existir na instância remota
      const resFallback = await supabaseAdmin
        .from('lancamentos_financeiros')
        .select(`
          id,
          nome_trabalhador,
          tipo_lancamento,
          fracao_dia,
          valor_monetario,
          data_referencia,
          observacao,
          status,
          obras_config (
            nome,
            tipo_obra
          ),
          funcionarios_obra (
            chave_pix,
            valor_diaria
          )
        `)
        .eq('tenant_id', activeTenant.id)
      .eq('status', 'VALIDADO')
        .order('data_referencia', { ascending: true });

      lancamentos = resFallback.data;
      queryError = resFallback.error;
    } else {
      lancamentos = resComprovante.data;
    }

    if (queryError) {
      console.error('Erro ao buscar borderô:', queryError);
      return NextResponse.json({ funcionarios: [] });
    }

    // Agrupar por funcionário
    const gruposMap = new Map<string, any>();

    (lancamentos || []).forEach((l) => {
      const nome = normalizarNomeTrabalhadorCanonico(l.nome_trabalhador);
      const chave = nome.toUpperCase();
      if (!gruposMap.has(chave)) {
        const obraNome = normalizarNomeObraCanonica((l as any).obras_config?.nome);
        const chavePix = (l as any).funcionarios_obra?.chave_pix || 'Chave não informada';
        const diariaPadrao = Number((l as any).funcionarios_obra?.valor_diaria) || 150;
        const regime = (l as any).funcionarios_obra?.regime_remuneracao || 'DIARISTA';
        const ciclo = (l as any).funcionarios_obra?.ciclo_pagamento || 'QUINZENAL';
        const valorBase = Number((l as any).funcionarios_obra?.valor_base_contratual) || diariaPadrao;

        gruposMap.set(chave, {
          id: `func-${chave.toLowerCase().replace(/\s+/g, '-')}`,
          nome: nome,
          obra: obraNome,
          chavePix: chavePix,
          diariaPadrao: diariaPadrao,
          regimeRemuneracao: regime,
          cicloPagamento: ciclo,
          valorBaseContratual: valorBase,
          lancamentos: [],
        });
      }

      const f = gruposMap.get(chave);
      const pixAtual = (l as any).funcionarios_obra?.chave_pix;
      if (pixAtual && f.chavePix === 'Chave não informada') {
        f.chavePix = pixAtual;
      }
      f.lancamentos.push({
        id: l.id,
        data: l.data_referencia,
        descricao: l.observacao || (l.tipo_lancamento === 'PONTO' ? 'Diária de Campo' : 'Vale Adiantado'),
        tipo: l.tipo_lancamento,
        fracao: Number(l.fracao_dia) || (l.tipo_lancamento === 'PONTO' ? 1.0 : 0),
        valor: Number(l.valor_monetario) || 0,
        comprovanteUrl: l.comprovante_url || null,
        selecionado: true,
      });
    });

    const funcionarios = Array.from(gruposMap.values());
    return NextResponse.json({ funcionarios });
  } catch (err) {
    console.error('Erro na rota /api/bordero:', err);
    return NextResponse.json({ funcionarios: [] });
  }
}

