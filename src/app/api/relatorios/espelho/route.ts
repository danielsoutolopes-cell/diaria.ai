import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import {
  normalizarNomeObraCanonica,
  normalizarNomeTrabalhadorCanonico,
} from '@/lib/normalizarObra';
import { getActiveTenantFromRequest } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

interface ObraEspelhoRel {
  id: string;
  nome: string | null;
  tipo_obra: string | null;
}

interface LancamentoEspelhoRow {
  id: string;
  nome_trabalhador: string;
  tipo_lancamento: string;
  fracao_dia: number | string | null;
  valor_monetario: number | string | null;
  data_referencia: string;
  observacao: string | null;
  obra_id: string | null;
  obras_config: ObraEspelhoRel | ObraEspelhoRel[] | null;
}

export interface RateioParteDia {
  obra: string;
  fracao: number;
  valor: number;
  tipo: string;
  obs: string;
}

export interface CelulaDiaEspelho {
  fracao: number;
  tipo: string;
  obs: string;
  valor: number;
  partes: RateioParteDia[];
}

function extrairObraRel(
  rel: ObraEspelhoRel | ObraEspelhoRel[] | null | undefined
): ObraEspelhoRel | null {
  if (!rel) return null;
  return Array.isArray(rel) ? rel[0] || null : rel;
}

export async function GET(req: NextRequest) {
  try {
    const activeTenant = getActiveTenantFromRequest(req);
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
      .eq('tenant_id', activeTenant.id)
      .eq('tipo_lancamento', 'PONTO')
      .neq('status', 'DESCARTADO')
      .gte('data_referencia', dataInicio)
      .lte('data_referencia', dataFim)
      .order('nome_trabalhador', { ascending: true });

    if (obraId && obraId !== 'TODAS') {
      query = query.eq('obra_id', obraId);
    }

    const { data: lancamentosRaw, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const lancamentos =
      (lancamentosRaw as unknown as LancamentoEspelhoRow[] | null) || [];

    // Agrupar por colaborador -> dia (acumulando rateio 0,5d Obra X + 0,5d Obra Y sem sobrescrever!)
    const mapa = new Map<
      string,
      {
        nome: string;
        dias: Record<number, CelulaDiaEspelho>;
        totalDias: number;
        totalValor: number;
      }
    >();

    lancamentos.forEach((l) => {
      const nome = normalizarNomeTrabalhadorCanonico(l.nome_trabalhador);
      const chave = nome.toUpperCase();
      const dia = Number(String(l.data_referencia).split('-')[2]);
      const obsUpper = (l.observacao || '').toUpperCase();
      const obraRel = extrairObraRel(l.obras_config);
      const obraNome = normalizarNomeObraCanonica(
        obraRel?.nome,
        obraRel?.tipo_obra
      );

      let tipoParte = 'NORMAL';
      if (obsUpper.includes('CHUVA')) tipoParte = 'CHUVA';
      else if (obsUpper.includes('VIAGEM')) tipoParte = 'VIAGEM';
      else if (obsUpper.includes('PARADO')) tipoParte = 'PARADO';
      else if (Number(l.fracao_dia) === 0.5) tipoParte = 'MEIO';
      else if (Number(l.fracao_dia) === 0) tipoParte = 'FALTA';

      if (!mapa.has(chave)) {
        mapa.set(chave, { nome, dias: {}, totalDias: 0, totalValor: 0 });
      }
      const reg = mapa.get(chave)!;
      const fracao = Number(l.fracao_dia ?? 1);
      const valor = Number(l.valor_monetario || 0);
      const parteAtual: RateioParteDia = {
        obra: obraNome,
        fracao,
        valor,
        tipo: tipoParte,
        obs: l.observacao || '',
      };

      const existente = reg.dias[dia];
      if (!existente) {
        reg.dias[dia] = {
          fracao,
          tipo: tipoParte,
          obs: l.observacao || obraNome,
          valor,
          partes: [parteAtual],
        };
      } else {
        // Rateio Multi-Obra no mesmo dia (ex.: 0,5d Obra X + 0,5d Obra Y)
        const novasPartes = [...existente.partes, parteAtual];
        const fracaoSomada = Number(
          Math.min(1.0, existente.fracao + fracao).toFixed(2)
        );
        const valorSomado = Number((existente.valor + valor).toFixed(2));
        const resumoRateio = novasPartes
          .map((p) => `${p.fracao.toFixed(1).replace('.', ',')}d ${p.obra}`)
          .join(' + ');

        reg.dias[dia] = {
          fracao: fracaoSomada,
          tipo: novasPartes.length >= 2 ? 'RATEIO' : tipoParte,
          obs: resumoRateio,
          valor: valorSomado,
          partes: novasPartes,
        };
      }

      reg.totalDias = Number((reg.totalDias + fracao).toFixed(2));
      reg.totalValor = Number((reg.totalValor + valor).toFixed(2));
    });

    const { data: obras } = await supabaseAdmin
      .from('obras_config')
      .select('id, nome')
      .eq('tenant_id', activeTenant.id)
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
    return NextResponse.json(
      { error: 'Falha ao gerar espelho do ponto' },
      { status: 500 }
    );
  }
}
