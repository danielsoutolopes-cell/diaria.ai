import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getActiveTenantFromRequest } from '@/lib/tenant';
import {
  normalizarNomeObraCanonica,
  normalizarNomeTrabalhadorCanonico,
} from '@/lib/normalizarObra';

export const dynamic = 'force-dynamic';

interface ObraRelacionada {
  nome: string | null;
  tipo_obra: string | null;
}

interface LancamentoRelatorioRow {
  id: string;
  nome_trabalhador: string;
  tipo_lancamento: string;
  fracao_dia: number | string | null;
  valor_monetario: number | string | null;
  status: string;
  data_referencia: string;
  comprovante_url?: string | null;
  liquidado_em?: string | null;
  obra_id: string | null;
  obras_config: ObraRelacionada | ObraRelacionada[] | null;
}

interface FuncionarioContatoRow {
  id: string;
  nome_trabalhador: string;
  chave_pix: string | null;
  telefone: string | null;
}

interface BorderoAgrupado {
  nome: string;
  obra: string;
  chavePix: string;
  telefone: string | null;
  totalDiariasQtd: number;
  totalDiariasValor: number;
  totalValesValor: number;
  liquidoPagar: number;
  totalQuitadoAnterior: number;
  itens: LancamentoRelatorioRow[];
}

function extrairObraInfo(
  rel: ObraRelacionada | ObraRelacionada[] | null | undefined
): ObraRelacionada {
  if (!rel) return { nome: null, tipo_obra: null };
  if (Array.isArray(rel)) return rel[0] || { nome: null, tipo_obra: null };
  return rel;
}

export async function GET(req: NextRequest) {
  try {
    const activeTenant = getActiveTenantFromRequest(req);
    const { searchParams } = new URL(req.url);
    const periodo = searchParams.get('periodo') || 'semanal'; // 'semanal' | 'quinzenal' | 'mensal'

    const agora = new Date();
    let diasAtras = 7;
    if (periodo === 'quinzenal') diasAtras = 15;
    if (periodo === 'mensal') diasAtras = 30;

    const dataInicio = new Date();
    dataInicio.setDate(agora.getDate() - diasAtras);
    const dataInicioIso = dataInicio.toLocaleDateString('en-CA', {
      timeZone: 'America/Sao_Paulo',
    });

    // 1. Busca lançamentos no período isolados por tenant_id
    let lancamentos: LancamentoRelatorioRow[] = [];
    const resPrincipal = await supabaseAdmin
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
        liquidado_em,
        obra_id,
        obras_config (
          nome,
          tipo_obra
        )
      `)
      .eq('tenant_id', activeTenant.id)
      .neq('status', 'DESCARTADO')
      .gte('data_referencia', dataInicioIso)
      .order('data_referencia', { ascending: false });

    if (
      resPrincipal.error &&
      (resPrincipal.error.code === '42703' ||
        resPrincipal.error.message?.includes('does not exist'))
    ) {
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
        .eq('tenant_id', activeTenant.id)
        .neq('status', 'DESCARTADO')
        .gte('data_referencia', dataInicioIso)
        .order('data_referencia', { ascending: false });

      if (fallback.error) {
        console.error('Erro ao buscar lancamentos para relatorio:', fallback.error);
        return NextResponse.json({ error: fallback.error.message }, { status: 500 });
      }
      lancamentos = (fallback.data as unknown as LancamentoRelatorioRow[]) || [];
    } else if (resPrincipal.error) {
      console.error('Erro ao buscar lancamentos para relatorio:', resPrincipal.error);
      return NextResponse.json({ error: resPrincipal.error.message }, { status: 500 });
    } else {
      lancamentos = (resPrincipal.data as unknown as LancamentoRelatorioRow[]) || [];
    }

    // 2. Busca lista de funcionários ESTRITAMENTE isolada por tenant_id
    const { data: funcs } = await supabaseAdmin
      .from('funcionarios_obra')
      .select('id, nome_trabalhador, chave_pix, telefone')
      .eq('tenant_id', activeTenant.id);

    const mapaFuncs = new Map<string, { chavePix: string; telefone: string | null }>();
    ((funcs as FuncionarioContatoRow[] | null) || []).forEach((f) => {
      const canonico = normalizarNomeTrabalhadorCanonico(f.nome_trabalhador).toLowerCase();
      mapaFuncs.set(canonico, {
        chavePix: f.chave_pix || '',
        telefone: f.telefone || null,
      });
      mapaFuncs.set(f.nome_trabalhador.trim().toLowerCase(), {
        chavePix: f.chave_pix || '',
        telefone: f.telefone || null,
      });
    });

    // 3. Agrupamento por Colaborador (Ciclo Aberto separado de Ciclo Quitado)
    const agrupamentoFunc = new Map<string, BorderoAgrupado>();
    const agrupamentoObras = new Map<
      string,
      {
        nomeObra: string;
        tipoObra: string;
        totalDiarias: number;
        totalVales: number;
        totalGeral: number;
        totalDiariasAbertas: number;
        totalDiariasQuitadas: number;
        trabalhadores: Set<string>;
      }
    >();

    let totalGeralDiarias = 0;
    let totalGeralVales = 0;
    let totalQuitadoCicloAnterior = 0;
    const lancamentosQuitados: LancamentoRelatorioRow[] = [];

    lancamentos.forEach((item) => {
      const nomeLimpo = normalizarNomeTrabalhadorCanonico(item.nome_trabalhador);
      const nomeChave = nomeLimpo.toLowerCase();
      const infoFunc = mapaFuncs.get(nomeChave) || {
        chavePix: 'Não informada',
        telefone: null,
      };
      const obraRel = extrairObraInfo(item.obras_config);
      const obraTipo = obraRel.tipo_obra || 'PISCINA';
      const obraNome = normalizarNomeObraCanonica(obraRel.nome, obraTipo);
      const isQuitado = item.status === 'LIQUIDADO';

      // Acumula na Obra (separando aberto vs quitado, sem somar vale em duplicidade no custo da obra)
      if (!agrupamentoObras.has(obraNome)) {
        agrupamentoObras.set(obraNome, {
          nomeObra: obraNome,
          tipoObra: obraTipo,
          totalDiarias: 0,
          totalVales: 0,
          totalGeral: 0,
          totalDiariasAbertas: 0,
          totalDiariasQuitadas: 0,
          trabalhadores: new Set<string>(),
        });
      }

      const oRegistro = agrupamentoObras.get(obraNome)!;
      oRegistro.trabalhadores.add(nomeLimpo);
      const valorItem = Number(item.valor_monetario || 0);
      if (item.tipo_lancamento === 'PONTO') {
        oRegistro.totalDiarias += valorItem;
        if (isQuitado) {
          oRegistro.totalDiariasQuitadas += valorItem;
        } else {
          oRegistro.totalDiariasAbertas += valorItem;
        }
      } else if (item.tipo_lancamento === 'VALE') {
        oRegistro.totalVales += valorItem;
      }
      // Custo efetivo da obra = total de diárias (vales são adiantamentos abatidos no líquido do colaborador)
      oRegistro.totalGeral = oRegistro.totalDiarias;

      // Separação estrita de Ciclos Pós-Quitação:
      // Itens LIQUIDADO vão para o resumo de ciclo quitado e NÃO inflam nem anulam o saldo em aberto do novo ciclo.
      if (isQuitado) {
        lancamentosQuitados.push(item);
        if (item.tipo_lancamento === 'PONTO') {
          totalQuitadoCicloAnterior += valorItem;
        }
        if (agrupamentoFunc.has(nomeChave)) {
          const existente = agrupamentoFunc.get(nomeChave)!;
          if (item.tipo_lancamento === 'PONTO') {
            existente.totalQuitadoAnterior += valorItem;
          }
        }
        return;
      }

      // Acumula no Colaborador (Ciclo Atual em Aberto: PENDENTE / VALIDADO)
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
          totalQuitadoAnterior: 0,
          itens: [],
        });
      }

      const fRegistro = agrupamentoFunc.get(nomeChave)!;
      if (obraNome && !fRegistro.obra.includes(obraNome)) {
        fRegistro.obra = fRegistro.obra ? `${fRegistro.obra}, ${obraNome}` : obraNome;
      }
      fRegistro.itens.push(item);

      if (item.tipo_lancamento === 'PONTO') {
        const fracao = Number(item.fracao_dia ?? 1);
        fRegistro.totalDiariasQtd += fracao;
        fRegistro.totalDiariasValor += valorItem;
        totalGeralDiarias += valorItem;
      } else if (item.tipo_lancamento === 'VALE') {
        fRegistro.totalValesValor += valorItem;
        totalGeralVales += valorItem;
      }
      fRegistro.liquidoPagar = Math.max(
        0,
        fRegistro.totalDiariasValor - fRegistro.totalValesValor
      );
    });

    // Sincronizar totalQuitadoAnterior para trabalhadores que tiveram itens quitados antes de entrar no mapa aberto
    lancamentosQuitados.forEach((item) => {
      if (item.tipo_lancamento !== 'PONTO') return;
      const nomeChave = normalizarNomeTrabalhadorCanonico(
        item.nome_trabalhador
      ).toLowerCase();
      const fRegistro = agrupamentoFunc.get(nomeChave);
      if (fRegistro) {
        const jaSomado = lancamentosQuitados
          .filter(
            (q) =>
              q.tipo_lancamento === 'PONTO' &&
              normalizarNomeTrabalhadorCanonico(q.nome_trabalhador).toLowerCase() ===
                nomeChave
          )
          .reduce((acc, q) => acc + Number(q.valor_monetario || 0), 0);
        fRegistro.totalQuitadoAnterior = jaSomado;
      }
    });

    const relatorioBordero = Array.from(agrupamentoFunc.values());
    const relatorioObras = Array.from(agrupamentoObras.values()).map((o) => ({
      nomeObra: o.nomeObra,
      tipoObra: o.tipoObra,
      totalDiarias: o.totalDiarias,
      totalDiariasAbertas: o.totalDiariasAbertas,
      totalDiariasQuitadas: o.totalDiariasQuitadas,
      totalVales: o.totalVales,
      totalGeral: o.totalGeral,
      qtdTrabalhadores: o.trabalhadores.size,
    }));

    return NextResponse.json({
      periodo,
      tenant: activeTenant.slug,
      dataInicio: dataInicioIso,
      dataFim: agora.toLocaleDateString('en-CA', {
        timeZone: 'America/Sao_Paulo',
      }),
      totais: {
        totalGeralDiarias,
        totalGeralVales,
        totalLiquido: Math.max(0, totalGeralDiarias - totalGeralVales),
        totalQuitadoCicloAnterior,
        totalTrabalhadores: relatorioBordero.length,
        totalObras: relatorioObras.length,
      },
      resumoCiclos: {
        cicloAtualAberto: Math.max(0, totalGeralDiarias - totalGeralVales),
        cicloAtualBrutoDiarias: totalGeralDiarias,
        cicloAtualVales: totalGeralVales,
        cicloAnteriorQuitado: totalQuitadoCicloAnterior,
        qtdLancamentosQuitados: lancamentosQuitados.length,
      },
      borderoConsolidado: relatorioBordero,
      custoPorObra: relatorioObras,
      lancamentosDetalhados: lancamentos,
    });
  } catch (error) {
    console.error('Erro na rota de relatorios:', error);
    return NextResponse.json(
      { error: 'Erro ao gerar relatórios' },
      { status: 500 }
    );
  }
}

