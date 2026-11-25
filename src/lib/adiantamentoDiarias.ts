import { supabaseAdmin } from '@/lib/supabase';

export interface AbatimentoResult {
  abatido: boolean;
  diariasAbatidas: number;
  valorAbatido: number;
  valorLiquidoRestante: number;
  etiquetaObservacao: string | null;
}

/**
 * Verifica se o colaborador possui saldo ATIVO em `adiantamentos_diarias`
 * e abate automaticamente a fração trabalhada (em qualquer obra),
 * retornando o valor líquido restante a pagar e a etiqueta de auditoria.
 */
export async function aplicarAbatimentoAdiantamentoDiarias(params: {
  tenantId: string;
  funcionarioId: string;
  fracaoDia: number;
  valorMonetarioOriginal: number;
}): Promise<AbatimentoResult> {
  const { tenantId, funcionarioId, fracaoDia, valorMonetarioOriginal } = params;

  if (fracaoDia <= 0 || valorMonetarioOriginal <= 0) {
    return {
      abatido: false,
      diariasAbatidas: 0,
      valorAbatido: 0,
      valorLiquidoRestante: valorMonetarioOriginal,
      etiquetaObservacao: null,
    };
  }

  const { data: adiantamentos, error } = await supabaseAdmin
    .from('adiantamentos_diarias')
    .select('id, quantidade_diarias, quantidade_restante')
    .eq('tenant_id', tenantId)
    .eq('funcionario_id', funcionarioId)
    .eq('status', 'ATIVO')
    .gt('quantidade_restante', 0)
    .order('data_adiantamento', { ascending: true })
    .order('created_at', { ascending: true });

  if (error || !adiantamentos || adiantamentos.length === 0) {
    return {
      abatido: false,
      diariasAbatidas: 0,
      valorAbatido: 0,
      valorLiquidoRestante: valorMonetarioOriginal,
      etiquetaObservacao: null,
    };
  }

  let faltaAbater = Number(fracaoDia);
  let totalAbatido = 0;
  const etiquetas: string[] = [];

  for (const ad of adiantamentos) {
    if (faltaAbater <= 0) break;
    const restante = Number(ad.quantidade_restante || 0);
    const totalOriginal = Number(ad.quantidade_diarias || 0);
    if (restante <= 0) continue;

    const consumir = Math.min(restante, faltaAbater);
    const novoRestante = Number((restante - consumir).toFixed(2));
    const novoStatus = novoRestante <= 0 ? 'QUITADO' : 'ATIVO';

    await supabaseAdmin
      .from('adiantamentos_diarias')
      .update({
        quantidade_restante: novoRestante,
        status: novoStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', ad.id)
      .eq('tenant_id', tenantId);

    const consumidoAcumulado = Number((totalOriginal - novoRestante).toFixed(2));
    etiquetas.push(`Abatido de Adiantamento (${consumidoAcumulado}/${totalOriginal} diárias)`);

    totalAbatido = Number((totalAbatido + consumir).toFixed(2));
    faltaAbater = Number((faltaAbater - consumir).toFixed(2));
  }

  if (totalAbatido <= 0) {
    return {
      abatido: false,
      diariasAbatidas: 0,
      valorAbatido: 0,
      valorLiquidoRestante: valorMonetarioOriginal,
      etiquetaObservacao: null,
    };
  }

  const proporcaoAbatida = Math.min(1, totalAbatido / fracaoDia);
  const valorAbatido = Number((valorMonetarioOriginal * proporcaoAbatida).toFixed(2));
  const valorLiquidoRestante = Number(
    Math.max(0, valorMonetarioOriginal - valorAbatido).toFixed(2)
  );

  return {
    abatido: true,
    diariasAbatidas: totalAbatido,
    valorAbatido,
    valorLiquidoRestante,
    etiquetaObservacao: etiquetas.join(' | '),
  };
}
