import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getActiveTenantFromRequest, TENANTS } from '@/lib/tenant';
import {
  normalizarNomeObraCanonica,
  normalizarNomeTrabalhadorCanonico,
} from '@/lib/normalizarObra';
import type {
  ExcelV6CaixinhaMovimento,
  ExcelV6ControleVale,
  ExcelV6CustoObra,
  ExcelV6DetalhamentoDiaria,
  ExcelV6ResumoTrabalhador,
  ExtratoAnaliticoV6Payload,
} from '@/lib/exportExcel';

export const dynamic = 'force-dynamic';

interface ObraRel {
  nome: string | null;
  tipo_obra: string | null;
}

interface LancamentoExcelRow {
  id: string;
  nome_trabalhador: string;
  tipo_lancamento: string;
  fracao_dia: number | string | null;
  valor_monetario: number | string | null;
  status: string;
  data_referencia: string;
  observacao: string | null;
  comprovante_url?: string | null;
  vale_etapa?: string | null;
  solicitado_por?: string | null;
  data_hora_solicitacao?: string | null;
  aprovado_por?: string | null;
  pago_por?: string | null;
  data_hora_envio_efetivo?: string | null;
  horario_origem?: string | null;
  ciclo_encerrado?: boolean | null;
  created_at?: string | null;
  obras_config: ObraRel | ObraRel[] | null;
}

interface FuncionarioPixRow {
  nome_trabalhador: string;
  chave_pix: string | null;
}

interface CaixinhaSqlRow {
  encarregado_canonico: string;
  encarregado_origem: string | null;
  obra_nome: string;
  data_movimentacao: string;
  hora_movimentacao: string | null;
  tipo: 'ENTRADA_PIX' | 'NOTA_DESPESA' | 'DEVOLUCAO_TROCO';
  categoria: string | null;
  descricao: string | null;
  valor: number | string;
  is_pre_implantacao: boolean | null;
}

interface CaixinhaJsonRow {
  encarregado: string;
  encarregadoOrigem?: string;
  obra?: string;
  data: string;
  hora?: string;
  tipo: 'ENTRADA_PIX' | 'NOTA_DESPESA' | 'DEVOLUCAO_TROCO';
  categoria?: string;
  descricao?: string;
  valor: number;
  isPreImplantacao?: boolean;
}

const PRE_IMPLANTACAO_GIL_13_11: ExcelV6CaixinhaMovimento[] = [
  {
    data: '2026-11-13',
    hora: '09:00',
    encarregado: 'Gil',
    perfisUnificados: 'Gil',
    obra: 'PISCINA PORTO SEGURO',
    tipo: 'ENTRADA_PIX',
    categoria: 'Suprimento PIX',
    descricao: 'Entradas PIX consolidadas (Pré-implantação 13/11)',
    preImplantacao: 'SIM (13/11/2026)',
    entrada: 700.0,
    saida: 0,
  },
  {
    data: '2026-11-13',
    hora: '17:30',
    encarregado: 'Gil',
    perfisUnificados: 'Gil',
    obra: 'PISCINA PORTO SEGURO',
    tipo: 'NOTA_DESPESA',
    categoria: 'Material / Despesas de Campo',
    descricao: 'Saídas e notas comprovadas (Pré-implantação 13/11)',
    preImplantacao: 'SIM (13/11/2026)',
    entrada: 0,
    saida: 546.94,
  },
];

function extrairObra(rel: ObraRel | ObraRel[] | null | undefined): ObraRel {
  if (!rel) return { nome: null, tipo_obra: null };
  return Array.isArray(rel) ? rel[0] || { nome: null, tipo_obra: null } : rel;
}

function extrairHora(createdAt?: string | null): string {
  if (!createdAt) return '—';
  const dt = new Date(createdAt);
  if (Number.isNaN(dt.getTime())) return '—';
  return dt.toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function classificarRegraDiaria(
  obraNome: string,
  tipoObra: string | null,
  fracao: number,
  valor: number,
  observacao: string | null,
  isRateioMultiObra: boolean
): string {
  const obsUpper = (observacao || '').toUpperCase();
  if (
    (obsUpper.includes('CHUVA') && fracao === 0.5) ||
    (fracao === 0.5 && valor === 60)
  ) {
    return 'CHUVA ½ DIA (R$ 60,00)';
  }
  if (obsUpper.includes('CHUVA') || (fracao === 1 && valor === 120)) {
    return 'CHUVA (R$ 120,00 fixo)';
  }
  if (isRateioMultiObra) {
    return tipoObra === 'PISCINA' || obraNome.includes('PISCINA')
      ? 'RATEIO ½+½ • PISCINA'
      : 'RATEIO ½+½ • OBRA CIVIL';
  }
  if (tipoObra === 'PISCINA' || obraNome.includes('PISCINA')) {
    return 'PISCINA';
  }
  return 'OBRA CIVIL';
}

export async function GET(req: NextRequest) {
  try {
    const activeTenant = getActiveTenantFromRequest(req);
    const { searchParams } = new URL(req.url);
    const periodo = searchParams.get('periodo') || 'mensal';

    let diasAtras = 30;
    if (periodo === 'semanal') diasAtras = 7;
    else if (periodo === 'quinzenal') diasAtras = 15;
    else if (periodo === 'trimestral') diasAtras = 90;

    const agora = new Date();
    const inicio = new Date(agora);
    inicio.setDate(agora.getDate() - diasAtras);
    const dataInicioIso = inicio.toLocaleDateString('en-CA', {
      timeZone: 'America/Sao_Paulo',
    });

    // 1. Lançamentos isolados por tenant_id (com fallback progressivo V15 -> V11 -> básico)
    let lancamentos: LancamentoExcelRow[] = [];
    const resMain = await supabaseAdmin
      .from('lancamentos_financeiros')
      .select(`
        id,
        nome_trabalhador,
        tipo_lancamento,
        fracao_dia,
        valor_monetario,
        status,
        data_referencia,
        observacao,
        comprovante_url,
        vale_etapa,
        solicitado_por,
        data_hora_solicitacao,
        aprovado_por,
        pago_por,
        data_hora_envio_efetivo,
        horario_origem,
        ciclo_encerrado,
        created_at,
        obras_config (
          nome,
          tipo_obra
        )
      `)
      .eq('tenant_id', activeTenant.id)
      .neq('status', 'DESCARTADO')
      .gte('data_referencia', dataInicioIso)
      .order('data_referencia', { ascending: false });

    if (resMain.error) {
      const resFallback = await supabaseAdmin
        .from('lancamentos_financeiros')
        .select(`
          id,
          nome_trabalhador,
          tipo_lancamento,
          fracao_dia,
          valor_monetario,
          status,
          data_referencia,
          observacao,
          comprovante_url,
          created_at,
          obras_config (
            nome,
            tipo_obra
          )
        `)
        .eq('tenant_id', activeTenant.id)
        .neq('status', 'DESCARTADO')
        .gte('data_referencia', dataInicioIso)
        .order('data_referencia', { ascending: false });

      if (resFallback.error) {
        return NextResponse.json(
          { error: resFallback.error.message },
          { status: 500 }
        );
      }
      lancamentos = (resFallback.data as unknown as LancamentoExcelRow[]) || [];
    } else {
      lancamentos = (resMain.data as unknown as LancamentoExcelRow[]) || [];
    }

    // 2. Chaves PIX isoladas por tenant_id
    const { data: funcs } = await supabaseAdmin
      .from('funcionarios_obra')
      .select('nome_trabalhador, chave_pix')
      .eq('tenant_id', activeTenant.id);

    const mapaPix = new Map<string, string>();
    ((funcs as FuncionarioPixRow[] | null) || []).forEach((f) => {
      const canon = normalizarNomeTrabalhadorCanonico(f.nome_trabalhador);
      if (f.chave_pix) {
        mapaPix.set(canon.toUpperCase(), f.chave_pix);
        mapaPix.set(f.nome_trabalhador.trim().toUpperCase(), f.chave_pix);
      }
    });

    // 3. Caixinha de Campo (SQL caixinha_movimentacoes + JSONB fallback)
    const caixinhaCampo: ExcelV6CaixinhaMovimento[] = [];
    const caixinhaSaldoPorEncarregado = new Map<string, number>();

    try {
      const { data: sqlCaixa, error: errCaixa } = await supabaseAdmin
        .from('caixinha_movimentacoes')
        .select(
          'encarregado_canonico, encarregado_origem, obra_nome, data_movimentacao, hora_movimentacao, tipo, categoria, descricao, valor, is_pre_implantacao'
        )
        .eq('tenant_id', activeTenant.id)
        .order('data_movimentacao', { ascending: true });

      if (!errCaixa && Array.isArray(sqlCaixa) && sqlCaixa.length > 0) {
        (sqlCaixa as unknown as CaixinhaSqlRow[]).forEach((row) => {
          const encarregado = normalizarNomeTrabalhadorCanonico(
            row.encarregado_canonico
          );
          const valor = Number(row.valor || 0);
          const isEntrada = row.tipo === 'ENTRADA_PIX';
          caixinhaCampo.push({
            data: row.data_movimentacao,
            hora: row.hora_movimentacao || '12:00',
            encarregado,
            perfisUnificados: encarregado,
            obra: row.obra_nome,
            tipo: row.tipo,
            categoria: row.categoria || 'Geral',
            descricao: row.descricao || '—',
            preImplantacao: row.is_pre_implantacao ? 'SIM (13/11/2026)' : 'Não',
            entrada: isEntrada ? valor : 0,
            saida: isEntrada ? 0 : valor,
          });
        });
      }
    } catch {
      // Fallback para parametros_sistema abaixo
    }

    if (caixinhaCampo.length === 0) {
      const { data: paramData } = await supabaseAdmin
        .from('parametros_sistema')
        .select('configuracoes')
        .eq('tenant_id', activeTenant.id)
        .maybeSingle();

      const configs =
        (paramData?.configuracoes as Record<string, unknown> | null) || {};
      const movsJson = Array.isArray(configs.caixa_campo_movimentos)
        ? (configs.caixa_campo_movimentos as CaixinhaJsonRow[])
        : [];

      movsJson.forEach((m) => {
        const encarregado = normalizarNomeTrabalhadorCanonico(m.encarregado);
        const valor = Number(m.valor || 0);
        const isEntrada = m.tipo === 'ENTRADA_PIX';
        caixinhaCampo.push({
          data: m.data,
          hora: m.hora || '12:00',
          encarregado,
          perfisUnificados: encarregado,
          obra: m.obra || 'Obra Geral',
          tipo: m.tipo,
          categoria: m.categoria || 'Geral',
          descricao: m.descricao || '—',
          preImplantacao: m.isPreImplantacao ? 'SIM (13/11/2026)' : 'Não',
          entrada: isEntrada ? valor : 0,
          saida: isEntrada ? 0 : valor,
        });
      });

      if (caixinhaCampo.length === 0 && activeTenant.id === TENANTS.jhoston.id) {
        caixinhaCampo.push(...PRE_IMPLANTACAO_GIL_13_11);
      }
    }

    caixinhaCampo.forEach((c) => {
      const key = c.encarregado.toUpperCase();
      const atual = caixinhaSaldoPorEncarregado.get(key) || 0;
      caixinhaSaldoPorEncarregado.set(
        key,
        Number((atual + c.entrada - c.saida).toFixed(2))
      );
    });

    // 4. Detectar rateios multi-obra no mesmo dia (mesmo trabalhador + mesma data em >=2 obras)
    const obrasPorTrabalhadorDia = new Map<
      string,
      Array<{ obra: string; fracao: number }>
    >();
    lancamentos.forEach((l) => {
      if (l.tipo_lancamento !== 'PONTO') return;
      const nomeCanon = normalizarNomeTrabalhadorCanonico(l.nome_trabalhador);
      const obraRel = extrairObra(l.obras_config);
      const obraNome = normalizarNomeObraCanonica(
        obraRel.nome,
        obraRel.tipo_obra
      );
      const chave = `${nomeCanon.toUpperCase()}__${l.data_referencia}`;
      const atual = obrasPorTrabalhadorDia.get(chave) || [];
      atual.push({ obra: obraNome, fracao: Number(l.fracao_dia || 1) });
      obrasPorTrabalhadorDia.set(chave, atual);
    });

    // 5. Construir Abas 1, 2, 3 e 5
    const resumoMap = new Map<
      string,
      ExcelV6ResumoTrabalhador & { obrasSet: Set<string> }
    >();
    const obrasMap = new Map<
      string,
      ExcelV6CustoObra & { trabalhadoresSet: Set<string> }
    >();
    const detalhamentoDiarias: ExcelV6DetalhamentoDiaria[] = [];
    const controleVales: ExcelV6ControleVale[] = [];

    lancamentos.forEach((l) => {
      const nomeCanon = normalizarNomeTrabalhadorCanonico(l.nome_trabalhador);
      const chaveFunc = nomeCanon.toUpperCase();
      const obraRel = extrairObra(l.obras_config);
      const obraNome = normalizarNomeObraCanonica(
        obraRel.nome,
        obraRel.tipo_obra
      );
      const tipologia =
        obraRel.tipo_obra === 'PISCINA' || obraNome.includes('PISCINA')
          ? 'PISCINA'
          : 'OBRA_CIVIL';
      const valor = Number(l.valor_monetario || 0);
      const fracao = Number(l.fracao_dia || 1);
      const isQuitado = l.status === 'LIQUIDADO' || l.ciclo_encerrado === true;

      if (!resumoMap.has(chaveFunc)) {
        resumoMap.set(chaveFunc, {
          trabalhador: nomeCanon,
          obras: obraNome,
          obrasSet: new Set([obraNome]),
          chavePix: mapaPix.get(chaveFunc) || 'Não informada',
          qtdDiarias: 0,
          totalDiariasValor: 0,
          totalValesValor: 0,
          liquidoPagar: 0,
          quitadoAnterior: 0,
          caixinhaEmMaos: Math.max(
            0,
            caixinhaSaldoPorEncarregado.get(chaveFunc) || 0
          ),
        });
      }
      const regFunc = resumoMap.get(chaveFunc)!;
      regFunc.obrasSet.add(obraNome);

      if (!obrasMap.has(obraNome)) {
        obrasMap.set(obraNome, {
          obra: obraNome,
          tipologia,
          qtdTrabalhadores: 0,
          diariasAbertas: 0,
          diariasQuitadas: 0,
          totalDiarias: 0,
          valesRelacionados: 0,
          despesasCaixinha: 0,
          custoTotalObra: 0,
          trabalhadoresSet: new Set(),
        });
      }
      const regObra = obrasMap.get(obraNome)!;
      regObra.trabalhadoresSet.add(chaveFunc);

      if (l.tipo_lancamento === 'PONTO') {
        const chaveDia = `${chaveFunc}__${l.data_referencia}`;
        const partesDia = obrasPorTrabalhadorDia.get(chaveDia) || [];
        const obrasDistintasDia = new Set(partesDia.map((p) => p.obra));
        const isRateio = obrasDistintasDia.size > 1;
        const resumoRateio = isRateio
          ? partesDia
              .map(
                (p) =>
                  `${String(p.fracao).replace('.', ',')}d ${p.obra}`
              )
              .join(' + ')
          : '';
        const obsBase = (l.observacao || '').trim();
        const obsFinal = isRateio
          ? obsBase && obsBase.includes('0,5d')
            ? obsBase
            : obsBase
              ? `${resumoRateio} | ${obsBase}`
              : resumoRateio
          : obsBase || '—';

        detalhamentoDiarias.push({
          data: l.data_referencia,
          trabalhador: nomeCanon,
          obra: obraNome,
          tipologiaRegra: classificarRegraDiaria(
            obraNome,
            obraRel.tipo_obra,
            fracao,
            valor,
            l.observacao,
            isRateio
          ),
          fracao,
          valor,
          status: l.status,
          observacao: obsFinal,
        });

        regObra.totalDiarias = Number((regObra.totalDiarias + valor).toFixed(2));
        if (isQuitado) {
          regFunc.quitadoAnterior = Number(
            (regFunc.quitadoAnterior + valor).toFixed(2)
          );
          regObra.diariasQuitadas = Number(
            (regObra.diariasQuitadas + valor).toFixed(2)
          );
        } else {
          regFunc.qtdDiarias = Number((regFunc.qtdDiarias + fracao).toFixed(2));
          regFunc.totalDiariasValor = Number(
            (regFunc.totalDiariasValor + valor).toFixed(2)
          );
          regObra.diariasAbertas = Number(
            (regObra.diariasAbertas + valor).toFixed(2)
          );
        }
      } else if (l.tipo_lancamento === 'VALE') {
        const horaOrigem = l.horario_origem || extrairHora(l.created_at);
        const pagadorFinal =
          l.aprovado_por ||
          l.pago_por ||
          (l.comprovante_url || l.status === 'VALIDADO'
            ? 'Patrícia Grubel'
            : 'Aguardando PIX');
        controleVales.push({
          data: l.data_referencia,
          horario: horaOrigem,
          trabalhador: nomeCanon,
          obra: obraNome,
          etapa:
            l.vale_etapa ||
            (l.comprovante_url ? 'CONCILIADO' : 'SOLICITADO'),
          solicitadoPor: normalizarNomeTrabalhadorCanonico(
            l.solicitado_por || 'Gil'
          ),
          dataHoraSolicitacao:
            l.data_hora_solicitacao ||
            `${l.data_referencia}T${/^\d{2}:\d{2}$/.test(horaOrigem) ? horaOrigem : '12:00'}:00-03:00`,
          aprovadoPor: pagadorFinal,
          pagoPor: pagadorFinal,
          dataHoraEnvioEfetivo:
            l.data_hora_envio_efetivo ||
            (l.status === 'VALIDADO' || l.status === 'LIQUIDADO'
              ? l.created_at || '—'
              : '—'),
          valor,
          status: l.status,
          comprovanteUrl: l.comprovante_url || '—',
        });

        regObra.valesRelacionados = Number(
          (regObra.valesRelacionados + valor).toFixed(2)
        );
        if (isQuitado) {
          regFunc.quitadoAnterior = Math.max(
            0,
            Number((regFunc.quitadoAnterior - valor).toFixed(2))
          );
        } else {
          regFunc.totalValesValor = Number(
            (regFunc.totalValesValor + valor).toFixed(2)
          );
        }
      }
    });

    // Incorpora despesas/notas comprovadas do Caixinha de Campo no Custo por Obra (Centro de Custo)
    caixinhaCampo.forEach((cx) => {
      if (cx.saida <= 0) return;
      const obraCx = normalizarNomeObraCanonica(cx.obra);
      if (!obrasMap.has(obraCx)) {
        obrasMap.set(obraCx, {
          obra: obraCx,
          tipologia: obraCx.includes('PISCINA') ? 'PISCINA' : 'OBRA_CIVIL',
          qtdTrabalhadores: 0,
          diariasAbertas: 0,
          diariasQuitadas: 0,
          totalDiarias: 0,
          valesRelacionados: 0,
          despesasCaixinha: 0,
          custoTotalObra: 0,
          trabalhadoresSet: new Set(),
        });
      }
      const regObra = obrasMap.get(obraCx)!;
      regObra.despesasCaixinha = Number(
        ((regObra.despesasCaixinha || 0) + cx.saida).toFixed(2)
      );
    });

    const resumoTrabalhadores: ExcelV6ResumoTrabalhador[] = Array.from(
      resumoMap.values()
    )
      .map((item) => ({
        trabalhador: item.trabalhador,
        obras: Array.from(item.obrasSet).join(' / '),
        chavePix: item.chavePix,
        qtdDiarias: item.qtdDiarias,
        totalDiariasValor: item.totalDiariasValor,
        totalValesValor: item.totalValesValor,
        liquidoPagar: Math.max(
          0,
          Number((item.totalDiariasValor - item.totalValesValor).toFixed(2))
        ),
        quitadoAnterior: item.quitadoAnterior,
        caixinhaEmMaos: item.caixinhaEmMaos,
      }))
      .sort((a, b) => b.liquidoPagar - a.liquidoPagar);

    const custoPorObra: ExcelV6CustoObra[] = Array.from(obrasMap.values())
      .map((item) => {
        const despesasCx = Number((item.despesasCaixinha || 0).toFixed(2));
        return {
          obra: item.obra,
          tipologia: item.tipologia,
          qtdTrabalhadores: item.trabalhadoresSet.size,
          diariasAbertas: item.diariasAbertas,
          diariasQuitadas: item.diariasQuitadas,
          totalDiarias: item.totalDiarias,
          valesRelacionados: item.valesRelacionados,
          despesasCaixinha: despesasCx,
          custoTotalObra: Number((item.totalDiarias + despesasCx).toFixed(2)),
        };
      })
      .sort((a, b) => (b.custoTotalObra || 0) - (a.custoTotalObra || 0));

    const payload: ExtratoAnaliticoV6Payload = {
      empresaNome: activeTenant.razaoSocial || activeTenant.nome,
      periodoLabel: `${periodo.toUpperCase()} (desde ${dataInicioIso})`,
      resumoTrabalhadores,
      detalhamentoDiarias,
      controleVales,
      caixinhaCampo,
      custoPorObra,
    };

    return NextResponse.json({
      success: true,
      tenant: { id: activeTenant.id, nome: activeTenant.nome },
      payload,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : 'Erro ao montar Extrato Analítico Excel V6.';
    console.error('[EXCEL-V6] Erro:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
