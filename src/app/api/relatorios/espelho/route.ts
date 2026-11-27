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
  status: string;
  fracao_dia: number | string | null;
  valor_monetario: number | string | null;
  data_referencia: string;
  updated_at: string | null;
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
  pago: boolean;
  dataPagamento: string | null;
}

export interface CelulaDiaEspelho {
  fracao: number;
  tipo: string;
  obs: string;
  valor: number;
  pago: boolean;
  dataPagamento: string | null;
  valeDia: number;
  partes: RateioParteDia[];
}

function extrairObraRel(
  rel: ObraEspelhoRel | ObraEspelhoRel[] | null | undefined
): ObraEspelhoRel | null {
  if (!rel) return null;
  return Array.isArray(rel) ? rel[0] || null : rel;
}

function formatarDiaMesCurto(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const br = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'America/Sao_Paulo',
  }).format(d);
  return br;
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
        status,
        fracao_dia,
        valor_monetario,
        data_referencia,
        updated_at,
        observacao,
        obra_id,
        obras_config ( id, nome, tipo_obra )
      `)
      .eq('tenant_id', activeTenant.id)
      .in('tipo_lancamento', ['PONTO', 'VALE'])
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

    const mapa = new Map<
      string,
      {
        nome: string;
        dias: Record<number, CelulaDiaEspelho>;
        totalDias: number;
        totalValor: number;
        totalPago: number;
        totalVales: number;
        saldoAPagar: number;
        ultimoPagamentoData: string | null;
        ultimoPagamentoTs: number;
      }
    >();

    lancamentos.forEach((l) => {
      const nome = normalizarNomeTrabalhadorCanonico(l.nome_trabalhador);
      const chave = nome.toUpperCase();
      const dia = Number(String(l.data_referencia).split('-')[2]);
      const valor = Math.abs(Number(l.valor_monetario || 0));

      if (!mapa.has(chave)) {
        mapa.set(chave, {
          nome,
          dias: {},
          totalDias: 0,
          totalValor: 0,
          totalPago: 0,
          totalVales: 0,
          saldoAPagar: 0,
          ultimoPagamentoData: null,
          ultimoPagamentoTs: 0,
        });
      }
      const reg = mapa.get(chave)!;

      // Vales descontados no mês
      if (l.tipo_lancamento === 'VALE') {
        reg.totalVales = Number((reg.totalVales + valor).toFixed(2));
        const existente = reg.dias[dia];
        if (existente) {
          existente.valeDia = Number((existente.valeDia + valor).toFixed(2));
        } else {
          reg.dias[dia] = {
            fracao: 0,
            tipo: 'VALE_ONLY',
            obs: l.observacao || 'Vale',
            valor: 0,
            pago: false,
            dataPagamento: null,
            valeDia: valor,
            partes: [],
          };
        }
        return;
      }

      const obsUpper = (l.observacao || '').toUpperCase();
      const obraRel = extrairObraRel(l.obras_config);
      const obraNome = normalizarNomeObraCanonica(
        obraRel?.nome,
        obraRel?.tipo_obra
      );
      const ehPago = l.status === 'LIQUIDADO';
      const dataPgtoCurta = ehPago ? formatarDiaMesCurto(l.updated_at) : null;

      if (ehPago && l.updated_at) {
        const ts = Date.parse(l.updated_at);
        if (!Number.isNaN(ts) && ts >= reg.ultimoPagamentoTs) {
          reg.ultimoPagamentoTs = ts;
          reg.ultimoPagamentoData = dataPgtoCurta;
        }
      }

      let tipoParte = 'NORMAL';
      if (obsUpper.includes('CHUVA')) tipoParte = 'CHUVA';
      else if (obsUpper.includes('VIAGEM')) tipoParte = 'VIAGEM';
      else if (obsUpper.includes('PARADO')) tipoParte = 'PARADO';
      else if (Number(l.fracao_dia) === 0.5) tipoParte = 'MEIO';
      else if (Number(l.fracao_dia) === 0) tipoParte = 'FALTA';

      const fracao = Number(l.fracao_dia ?? 1);
      const parteAtual: RateioParteDia = {
        obra: obraNome,
        fracao,
        valor,
        tipo: tipoParte,
        obs: l.observacao || '',
        pago: ehPago,
        dataPagamento: dataPgtoCurta,
      };

      const existente = reg.dias[dia];
      if (!existente || existente.tipo === 'VALE_ONLY') {
        const valeAnterior = existente?.valeDia || 0;
        reg.dias[dia] = {
          fracao,
          tipo: tipoParte,
          obs: l.observacao || obraNome,
          valor,
          pago: ehPago,
          dataPagamento: dataPgtoCurta,
          valeDia: valeAnterior,
          partes: [parteAtual],
        };
      } else {
        const novasPartes = [...existente.partes, parteAtual];
        const fracaoSomada = Number(
          Math.min(1.0, existente.fracao + fracao).toFixed(2)
        );
        const valorSomado = Number((existente.valor + valor).toFixed(2));
        const resumoRateio = novasPartes
          .map((p) => `${p.fracao.toFixed(1).replace('.', ',')}d ${p.obra}`)
          .join(' + ');
        const todosPagos = novasPartes.every((p) => p.pago);
        const dataPgtoFinal =
          novasPartes.find((p) => p.dataPagamento)?.dataPagamento || null;

        reg.dias[dia] = {
          fracao: fracaoSomada,
          tipo: novasPartes.length >= 2 ? 'RATEIO' : tipoParte,
          obs: resumoRateio,
          valor: valorSomado,
          pago: todosPagos,
          dataPagamento: todosPagos ? dataPgtoFinal : null,
          valeDia: existente.valeDia,
          partes: novasPartes,
        };
      }

      reg.totalDias = Number((reg.totalDias + fracao).toFixed(2));
      reg.totalValor = Number((reg.totalValor + valor).toFixed(2));
      if (ehPago) {
        reg.totalPago = Number((reg.totalPago + valor).toFixed(2));
      }
    });

    const linhas = Array.from(mapa.values()).map((r) => ({
      nome: r.nome,
      dias: r.dias,
      totalDias: r.totalDias,
      totalValor: r.totalValor,
      totalPago: r.totalPago,
      totalVales: r.totalVales,
      saldoAPagar: Number(
        Math.max(0, r.totalValor - r.totalPago - r.totalVales).toFixed(2)
      ),
      ultimoPagamentoData: r.ultimoPagamentoData,
    }));

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
      linhas,
    });
  } catch (err) {
    console.error('Erro no espelho do ponto:', err);
    return NextResponse.json(
      { error: 'Falha ao gerar espelho do ponto' },
      { status: 500 }
    );
  }
}
