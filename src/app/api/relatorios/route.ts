import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const periodo = searchParams.get('periodo') || 'semanal'; // 'semanal' | 'quinzenal' | 'mensal'

    // Determina a data de corte inicial com base no período
    const agora = new Date();
    let diasAtras = 7;
    if (periodo === 'quinzenal') diasAtras = 15;
    if (periodo === 'mensal') diasAtras = 30;

    const dataInicio = new Date();
    dataInicio.setDate(agora.getDate() - diasAtras);
    const dataInicioIso = dataInicio.toISOString().split('T')[0];

    // 1. Busca lançamentos no período (com fallback caso comprovante_url/funcionario_id não existam)
    let { data: lancamentos, error: errLanc } = await supabaseAdmin
      .from('lancamentos_financeiros')
      .select(`
        id,
        nome_trabalhador,
        tipo_lancamento,
        fracao_dia,
        valor_monetario,
        status,
        data_referencia,
        comprovante_url,
        obra_id,
        obras_config (
          nome,
          tipo_obra
        )
      `)
      .gte('data_referencia', dataInicioIso)
      .order('data_referencia', { ascending: false });

    if (errLanc && (errLanc.code === '42703' || errLanc.message?.includes('does not exist'))) {
      const fallback = await supabaseAdmin
        .from('lancamentos_financeiros')
        .select(`
          id,
          nome_trabalhador,
          tipo_lancamento,
          fracao_dia,
          valor_monetario,
          status,
          data_referencia,
          obra_id,
          obras_config (
            nome,
            tipo_obra
          )
        `)
        .gte('data_referencia', dataInicioIso)
        .order('data_referencia', { ascending: false });

      lancamentos = fallback.data as any;
      errLanc = fallback.error;
    }

    if (errLanc) {
      console.error('Erro ao buscar lancamentos para relatorio:', errLanc);
      return NextResponse.json({ error: errLanc.message }, { status: 500 });
    }

    // 2. Busca lista de funcionários para cruzar chaves PIX e telefones
    const { data: funcs } = await supabaseAdmin
      .from('funcionarios_obra')
      .select('id, nome_trabalhador, chave_pix, telefone');

    const mapaFuncs = new Map<string, { chavePix: string; telefone: string | null }>();
    funcs?.forEach((f) => {
      mapaFuncs.set(f.nome_trabalhador.trim().toLowerCase(), {
        chavePix: f.chave_pix || '',
        telefone: f.telefone || null,
      });
    });

    // 3. Agrupamento: Por Colaborador (Borderô Consolidado)
    const agrupamentoFunc = new Map<
      string,
      {
        nome: string;
        obra: string;
        chavePix: string;
        telefone: string | null;
        totalDiariasQtd: number;
        totalDiariasValor: number;
        totalValesValor: number;
        liquidoPagar: number;
        itens: any[];
      }
    >();

    // 4. Agrupamento: Por Obra (Custo de Canteiro)
    const agrupamentoObras = new Map<
      string,
      {
        nomeObra: string;
        tipoObra: string;
        totalDiarias: number;
        totalVales: number;
        totalGeral: number;
        trabalhadores: Set<string>;
      }
    >();

    let totalGeralDiarias = 0;
    let totalGeralVales = 0;

    (lancamentos || []).forEach((item) => {
      const nomeLimpo = item.nome_trabalhador.trim();
      const nomeChave = nomeLimpo.toLowerCase();
      const infoFunc = mapaFuncs.get(nomeChave) || { chavePix: 'Não informada', telefone: null };
      const obraNome = (item.obras_config as any)?.nome || 'Geral / Volante';
      const obraTipo = (item.obras_config as any)?.tipo_obra || 'PISCINA';

      // Acumula no Colaborador
      if (!agrupamentoFunc.has(nomeChave)) {
        agrupamentoFunc.set(nomeChave, {
          nome: nomeLimpo,
          obra: obraNome,
          chavePix: infoFunc.chavePix,
          telefone: infoFunc.telefone,
          totalDiariasQtd: 0,
          totalDiariasValor: 0,
          totalValesValor: 0,
          liquidoPagar: 0,
          itens: [],
        });
      }

      const fRegistro = agrupamentoFunc.get(nomeChave)!;
      fRegistro.itens.push(item);

      if (item.tipo_lancamento === 'PONTO') {
        const fracao = Number(item.fracao_dia || 1);
        const valor = Number(item.valor_monetario || 0);
        fRegistro.totalDiariasQtd += fracao;
        fRegistro.totalDiariasValor += valor;
        totalGeralDiarias += valor;
      } else if (item.tipo_lancamento === 'VALE') {
        const valor = Number(item.valor_monetario || 0);
        fRegistro.totalValesValor += valor;
        totalGeralVales += valor;
      }
      fRegistro.liquidoPagar = Math.max(0, fRegistro.totalDiariasValor - fRegistro.totalValesValor);

      // Acumula na Obra
      if (!agrupamentoObras.has(obraNome)) {
        agrupamentoObras.set(obraNome, {
          nomeObra: obraNome,
          tipoObra: obraTipo,
          totalDiarias: 0,
          totalVales: 0,
          totalGeral: 0,
          trabalhadores: new Set(),
        });
      }

      const oRegistro = agrupamentoObras.get(obraNome)!;
      oRegistro.trabalhadores.add(nomeLimpo);
      if (item.tipo_lancamento === 'PONTO') {
        oRegistro.totalDiarias += Number(item.valor_monetario || 0);
      } else if (item.tipo_lancamento === 'VALE') {
        oRegistro.totalVales += Number(item.valor_monetario || 0);
      }
      oRegistro.totalGeral = oRegistro.totalDiarias + oRegistro.totalVales;
    });

    const relatorioBordero = Array.from(agrupamentoFunc.values());
    const relatorioObras = Array.from(agrupamentoObras.values()).map((o) => ({
      nomeObra: o.nomeObra,
      tipoObra: o.tipoObra,
      totalDiarias: o.totalDiarias,
      totalVales: o.totalVales,
      totalGeral: o.totalGeral,
      qtdTrabalhadores: o.trabalhadores.size,
    }));

    return NextResponse.json({
      periodo,
      dataInicio: dataInicioIso,
      dataFim: agora.toISOString().split('T')[0],
      totais: {
        totalGeralDiarias,
        totalGeralVales,
        totalLiquido: Math.max(0, totalGeralDiarias - totalGeralVales),
        totalTrabalhadores: relatorioBordero.length,
        totalObras: relatorioObras.length,
      },
      borderoConsolidado: relatorioBordero,
      custoPorObra: relatorioObras,
      lancamentosDetalhados: lancamentos || [],
    });
  } catch (error) {
    console.error('Erro na rota de relatorios:', error);
    return NextResponse.json({ error: 'Erro ao gerar relatórios' }, { status: 500 });
  }
}

