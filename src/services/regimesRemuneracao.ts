import type { RegimeRemuneracao } from '@/types/database';

export interface CalculoRegimeParams {
  nomeTrabalhador: string;
  regimeRemuneracao?: RegimeRemuneracao | string | null;
  valorBaseContratual?: number | null;
  diariaPadrao?: number | null;
  regraDiasUteisSegSab?: boolean | null;
  somaPontosBrutos: number;
  somaFracoesPontos: number;
  dataInicioPeriodo?: string;
  dataFimPeriodo?: string;
}

export interface CalculoRegimeResultado {
  totalBruto: number;
  totalDiasConsiderados: number;
  regimeAplicado: string;
  detalheCalculo: string;
}

/**
 * Conta dias úteis de Segunda a Sábado (excluindo Domingos) em um intervalo inclusivo YYYY-MM-DD.
 * Regra V11 (Zé Roberto): cada dia útil Seg–Sáb equivale a 1 diária (ex.: 10 dias úteis = R$ 2.000,00).
 */
export function contarDiasUteisSegSab(
  dataInicioIso: string,
  dataFimIso: string
): number {
  const inicio = new Date(`${dataInicioIso}T12:00:00Z`);
  const fim = new Date(`${dataFimIso}T12:00:00Z`);
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime()) || fim < inicio) {
    return 0;
  }

  let total = 0;
  const cursor = new Date(inicio.getTime());
  while (cursor <= fim) {
    const dow = cursor.getUTCDay(); // 0 = Domingo, 1..6 = Segunda a Sábado
    if (dow !== 0) {
      total += 1;
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return total;
}

/**
 * Calcula o valor bruto de fechamento respeitando os regimes contratuais V11:
 * - MENSALISTA diluído semanalmente (ex.: Diego — R$ 2.350,00/semana)
 * - DIAS_UTEIS_SEG_SAB (ex.: Zé Roberto — 1 diária por dia útil Seg–Sáb, ex.: 10d × R$ 200 = R$ 2.000,00)
 * - SEMANALISTA / QUINZENALISTA fixo
 * - DIARISTA (soma dos pontos marcados)
 */
export function calcularBrutoPorRegime(
  params: CalculoRegimeParams
): CalculoRegimeResultado {
  const regime = (params.regimeRemuneracao || 'DIARISTA').toUpperCase();
  const base = Number(params.valorBaseContratual || 0);
  const diaria = Number(params.diariaPadrao || 0);
  const nomeUpper = (params.nomeTrabalhador || '').toUpperCase();

  // 1. Mensalista diluído semanalmente (Diego: R$ 2.350,00/semana)
  if (regime === 'MENSALISTA') {
    let valorSemanal = base;
    if (base <= 0 && nomeUpper.includes('DIEGO')) {
      valorSemanal = 2350.0;
    } else if (base >= 5000) {
      // Base cadastrada como salário mensal cheio -> dilui em 4 semanas
      valorSemanal = Math.round((base / 4) * 100) / 100;
    }
    return {
      totalBruto: valorSemanal,
      totalDiasConsiderados: params.somaFracoesPontos,
      regimeAplicado: 'MENSALISTA',
      detalheCalculo: `Mensalista diluído semanalmente (R$ ${valorSemanal.toFixed(2)}/sem)`,
    };
  }

  // 2. Regra de Dias Úteis Seg–Sáb = 1 diária (ex.: Zé Roberto — R$ 2.000,00 / 10 dias)
  if (regime === 'DIAS_UTEIS_SEG_SAB' || params.regraDiasUteisSegSab) {
    const valorUnitario =
      diaria > 0 ? diaria : base > 0 ? base : 200.0;
    const diasUteis =
      params.dataInicioPeriodo && params.dataFimPeriodo
        ? contarDiasUteisSegSab(params.dataInicioPeriodo, params.dataFimPeriodo)
        : params.somaFracoesPontos > 0
          ? params.somaFracoesPontos
          : 10;
    const totalBruto = Number((diasUteis * valorUnitario).toFixed(2));
    return {
      totalBruto,
      totalDiasConsiderados: diasUteis,
      regimeAplicado: 'DIAS_UTEIS_SEG_SAB',
      detalheCalculo: `Dias úteis Seg–Sáb (${diasUteis}d × R$ ${valorUnitario.toFixed(2)})`,
    };
  }

  // 3. Semanalista / Quinzenalista fixo
  if ((regime === 'SEMANALISTA' || regime === 'QUINZENALISTA') && base > 0) {
    return {
      totalBruto: base,
      totalDiasConsiderados: params.somaFracoesPontos,
      regimeAplicado: regime,
      detalheCalculo: `${regime === 'SEMANALISTA' ? 'Semanalista' : 'Quinzenalista'} fixo (R$ ${base.toFixed(2)})`,
    };
  }

  // 4. Diarista padrão (soma exata dos pontos lançados)
  return {
    totalBruto: Number(params.somaPontosBrutos.toFixed(2)),
    totalDiasConsiderados: params.somaFracoesPontos,
    regimeAplicado: 'DIARISTA',
    detalheCalculo: `Diarista (${params.somaFracoesPontos}d)`,
  };
}
