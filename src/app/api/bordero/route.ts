import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET() {
  try {
    const { data: lancamentos, error } = await supabaseAdmin
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
      .eq('status', 'VALIDADO')
      .order('data_referencia', { ascending: true });

    if (error) {
      console.error('Erro ao buscar borderô:', error);
      return NextResponse.json({ funcionarios: [] });
    }

    // Agrupar por funcionário
    const gruposMap = new Map<string, any>();

    (lancamentos || []).forEach((l) => {
      const nome = l.nome_trabalhador || 'Trabalhador';
      if (!gruposMap.has(nome)) {
        const obraNome = (l as any).obras_config?.nome || 'CANTEIRO VOLANTE';
        const chavePix = (l as any).funcionarios_obra?.chave_pix || 'Chave não informada';
        const diariaPadrao = Number((l as any).funcionarios_obra?.valor_diaria) || 150;

        gruposMap.set(nome, {
          id: `func-${nome.toLowerCase().replace(/\s+/g, '-')}`,
          nome: nome,
          obra: obraNome,
          chavePix: chavePix,
          diariaPadrao: diariaPadrao,
          lancamentos: [],
        });
      }

      const f = gruposMap.get(nome);
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

