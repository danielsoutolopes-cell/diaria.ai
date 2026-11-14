import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET() {
  try {
    const { data: lotes, error } = await supabaseAdmin
      .from('ponto_lote')
      .select(`
        id,
        obra_id,
        data_referencia,
        texto_original,
        status_validacao,
        token_aprovacao,
        obras_config (
          nome,
          tipo_obra
        ),
        ponto_detalhe (
          id,
          nome_trabalhador,
          fracao_dia,
          motivo_excecao
        ),
        lancamentos_financeiros (
          id,
          nome_trabalhador,
          comprovante_url
        )
      `)
      .eq('status_validacao', 'PENDENTE')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Erro ao buscar pendentes:', error);
      return NextResponse.json({ pendentes: [] });
    }

    const itens: any[] = [];
    (lotes || []).forEach((lote) => {
      const obraNome = (lote as any).obras_config?.nome || 'CANTEIRO VOLANTE';
      const detalhes = (lote as any).ponto_detalhe || [];
      const lancamentos = (lote as any).lancamentos_financeiros || [];

      detalhes.forEach((d: any) => {
        const lancCorrespondente = lancamentos.find(
          (l: any) => l.nome_trabalhador?.toLowerCase() === d.nome_trabalhador?.toLowerCase() && l.comprovante_url
        ) || lancamentos.find((l: any) => l.comprovante_url);

        itens.push({
          id: d.id,
          loteId: lote.id,
          obra: obraNome,
          data: lote.data_referencia,
          trabalhador: d.nome_trabalhador,
          fracao: Number(d.fracao_dia) || 1.0,
          motivo: d.motivo_excecao || 'Apontamento via WhatsApp',
          origem: 'WhatsApp Oficial',
          valorDiariaBase: (lote as any).obras_config?.tipo_obra === 'OBRA_CIVIL' ? 180 : 150,
          comprovanteUrl: lancCorrespondente?.comprovante_url || null,
        });
      });
    });

    return NextResponse.json({ pendentes: itens });
  } catch (err) {
    console.error('Erro na rota /api/pendentes:', err);
    return NextResponse.json({ pendentes: [] });
  }
}
