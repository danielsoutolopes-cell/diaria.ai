import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const mes = searchParams.get('mes') || new Date().toISOString().slice(0, 7); // YYYY-MM
    const obraId = searchParams.get('obraId') || 'TODAS';

    const [anoStr, mesStr] = mes.split('-');
    const ano = Number(anoStr);
    const mesNum = Number(mesStr);
    const diasNoMes = new Date(ano, mesNum, 0).getDate();

    const dataInicio = `${mes}-01`;
    const dataFim = `${mes}-${String(diasNoMes).padStart(2, '0')}`;

    let query = supabaseAdmin
      .from('lancamentos_financeiros')
      .select(`
        id,
        nome_trabalhador,
        tipo_lancamento,
        fracao_dia,
        valor_monetario,
        data_referencia,
        observacao,
        obra_id,
        obras_config ( id, nome, tipo_obra )
      `)
      .eq('tipo_lancamento', 'PONTO')
      .gte('data_referencia', dataInicio)
      .lte('data_referencia', dataFim)
      .order('nome_trabalhador', { ascending: true });

    if (obraId && obraId !== 'TODAS') {
      query = query.eq('obra_id', obraId);
    }

    const { data: lancamentos, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Agrupar por colaborador -> dia
    const mapa = new Map<
      string,
      {
        nome: string;
        dias: Record<number, { fracao: number; tipo: string; obs: string; valor: number }>;
        totalDias: number;
        totalValor: number;
      }
    >();

    (lancamentos || []).forEach((l: any) => {
      const nome = (l.nome_trabalhador || 'Trabalhador').trim();
      const dia = Number(String(l.data_referencia).split('-')[2]);
      const obsUpper = (l.observacao || '').toUpperCase();

      let tipo = 'NORMAL';
      if (obsUpper.includes('CHUVA')) tipo = 'CHUVA';
      else if (obsUpper.includes('VIAGEM')) tipo = 'VIAGEM';
      else if (obsUpper.includes('PARADO')) tipo = 'PARADO';
      else if (Number(l.fracao_dia) === 0.5) tipo = 'MEIO';
      else if (Number(l.fracao_dia) === 0) tipo = 'FALTA';

      if (!mapa.has(nome)) {
        mapa.set(nome, { nome, dias: {}, totalDias: 0, totalValor: 0 });
      }
      const reg = mapa.get(nome)!;
      const fracao = Number(l.fracao_dia ?? 1);
      const valor = Number(l.valor_monetario || 0);

      reg.dias[dia] = { fracao, tipo, obs: l.observacao || '', valor };
      reg.totalDias += fracao;
      reg.totalValor += valor;
    });

    const { data: obras } = await supabaseAdmin
      .from('obras_config')
      .select('id, nome')
      .eq('ativo', true)
      .order('nome', { ascending: true });

    return NextResponse.json({
      mes,
      diasNoMes,
      obras: obras || [],
      linhas: Array.from(mapa.values()),
    });
  } catch (err) {
    console.error('Erro no espelho do ponto:', err);
    return NextResponse.json({ error: 'Falha ao gerar espelho do ponto' }, { status: 500 });
  }
}
