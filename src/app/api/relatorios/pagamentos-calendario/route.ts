import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getActiveTenantFromRequest } from '@/lib/tenant';
import { normalizarNomeTrabalhadorCanonico } from '@/lib/normalizarObra';

export const dynamic = 'force-dynamic';

interface CelulaPagamentoDia {
  diariasPagas: number;
  valesPagos: number;
  adiantamentosPagos: number;
  totalDia: number;
  detalhes: string[];
}

function extrairDataBrYmd(iso: string | null | undefined): string | null {
  if (!iso) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'America/Sao_Paulo',
  }).format(d);
  return parts;
}

export async function GET(req: NextRequest) {
  try {
    const activeTenant = getActiveTenantFromRequest(req);
    const { searchParams } = new URL(req.url);
    const mes = searchParams.get('mes') || new Date().toISOString().slice(0, 7);

    const [anoStr, mesStr] = mes.split('-');
    const diasNoMes = new Date(Number(anoStr), Number(mesStr), 0).getDate();

    const [lancRes, adRes, funcsRes] = await Promise.all([
      supabaseAdmin
        .from('lancamentos_financeiros')
        .select('id, nome_trabalhador, tipo_lancamento, status, valor_monetario, data_referencia, updated_at, observacao')
        .eq('tenant_id', activeTenant.id)
        .in('tipo_lancamento', ['PONTO', 'VALE'])
        .neq('status', 'DESCARTADO'),
      supabaseAdmin
        .from('adiantamentos_diarias')
        .select('id, funcionario_id, data_adiantamento, quantidade_diarias, valor_total, status')
        .eq('tenant_id', activeTenant.id)
        .neq('status', 'CANCELADO'),
      supabaseAdmin
        .from('funcionarios_obra')
        .select('id, nome_trabalhador')
        .eq('tenant_id', activeTenant.id),
    ]);

    const funcMap = new Map(
      (funcsRes.data || []).map((f) => [
        String(f.id),
        normalizarNomeTrabalhadorCanonico(String(f.nome_trabalhador || 'Colaborador')),
      ])
    );

    const mapa = new Map<
      string,
      {
        nome: string;
        dias: Record<number, CelulaPagamentoDia>;
        totalDiariasPagas: number;
        totalValesPagos: number;
        totalAdiantamentos: number;
        totalPagoMes: number;
      }
    >();

    const getOrCreate = (nomeRaw: string) => {
      const nome = normalizarNomeTrabalhadorCanonico(nomeRaw);
      const chave = nome.toUpperCase();
      if (!mapa.has(chave)) {
        mapa.set(chave, {
          nome,
          dias: {},
          totalDiariasPagas: 0,
          totalValesPagos: 0,
          totalAdiantamentos: 0,
          totalPagoMes: 0,
        });
      }
      return mapa.get(chave)!;
    };

    const addCelula = (
      reg: ReturnType<typeof getOrCreate>,
      dia: number,
      tipo: 'DIARIA' | 'VALE' | 'ADIANTAMENTO',
      valor: number,
      detalhe: string
    ) => {
      if (!reg.dias[dia]) {
        reg.dias[dia] = {
          diariasPagas: 0,
          valesPagos: 0,
          adiantamentosPagos: 0,
          totalDia: 0,
          detalhes: [],
        };
      }
      const c = reg.dias[dia];
      if (tipo === 'DIARIA') {
        c.diariasPagas = Number((c.diariasPagas + valor).toFixed(2));
        reg.totalDiariasPagas = Number((reg.totalDiariasPagas + valor).toFixed(2));
      } else if (tipo === 'VALE') {
        c.valesPagos = Number((c.valesPagos + valor).toFixed(2));
        reg.totalValesPagos = Number((reg.totalValesPagos + valor).toFixed(2));
      } else {
        c.adiantamentosPagos = Number((c.adiantamentosPagos + valor).toFixed(2));
        reg.totalAdiantamentos = Number((reg.totalAdiantamentos + valor).toFixed(2));
      }
      c.totalDia = Number((c.totalDia + valor).toFixed(2));
      c.detalhes.push(detalhe);
      reg.totalPagoMes = Number((reg.totalPagoMes + valor).toFixed(2));
    }

    // 1. Diárias liquidadas (pela data de pagamento updated_at) e Vales pagos (pela data_referencia)
    for (const l of lancRes.data || []) {
      const valor = Math.abs(Number(l.valor_monetario || 0));
      if (valor <= 0) continue;

      if (l.tipo_lancamento === 'PONTO' && l.status === 'LIQUIDADO') {
        const ymd = extrairDataBrYmd(l.updated_at || l.data_referencia);
        if (!ymd || !ymd.startsWith(mes)) continue;
        const dia = Number(ymd.split('-')[2]);
        const reg = getOrCreate(String(l.nome_trabalhador || 'Colaborador'));
        addCelula(reg, dia, 'DIARIA', valor, `Diária ref. ${l.data_referencia}: R$ ${valor.toFixed(2)}`);
      } else if (l.tipo_lancamento === 'VALE') {
        const ymd = extrairDataBrYmd(l.data_referencia);
        if (!ymd || !ymd.startsWith(mes)) continue;
        const dia = Number(ymd.split('-')[2]);
        const reg = getOrCreate(String(l.nome_trabalhador || 'Colaborador'));
        addCelula(reg, dia, 'VALE', valor, `Vale: R$ ${valor.toFixed(2)}`);
      }
    }

    // 2. Adiantamentos de diárias pagos no mês
    for (const a of adRes.data || []) {
      const ymd = extrairDataBrYmd(String(a.data_adiantamento || ''));
      if (!ymd || !ymd.startsWith(mes)) continue;
      const valor = Math.abs(Number(a.valor_total || 0));
      if (valor <= 0) continue;
      const dia = Number(ymd.split('-')[2]);
      const nome = funcMap.get(String(a.funcionario_id)) || 'Colaborador';
      const reg = getOrCreate(nome);
      addCelula(
        reg,
        dia,
        'ADIANTAMENTO',
        valor,
        `Adiantamento (${a.quantidade_diarias} diárias): R$ ${valor.toFixed(2)}`
      );
    }

    const linhas = Array.from(mapa.values()).sort((a, b) =>
      a.nome.localeCompare(b.nome, 'pt-BR')
    );

    return NextResponse.json({
      mes,
      diasNoMes,
      linhas,
    });
  } catch (err) {
    console.error('[GET /api/relatorios/pagamentos-calendario]', err);
    return NextResponse.json(
      { error: 'Erro ao carregar calendário de pagamentos.' },
      { status: 500 }
    );
  }
}
