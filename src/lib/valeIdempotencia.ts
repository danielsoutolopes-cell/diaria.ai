import crypto from 'crypto';
import { normalizarNomeTrabalhadorCanonico } from '@/lib/normalizarObra';

export interface ChaveIdempotenciaValeParams {
  tenantId: string;
  trabalhador: string;
  dataReferencia: string;
  /** Horário HH:MM ou timestamp ISO 8601 da solicitação */
  janelaSolicitacao?: string | null;
  valor?: number | null;
  /** Identificador opcional da mensagem de origem (WhatsApp messageId / hash) */
  origemHash?: string | null;
}

export interface RegistroValeDeduplicavel {
  id: string;
  tenant_id: string;
  nome_trabalhador: string;
  data_referencia: string;
  valor_monetario: number | string;
  solicitado_por?: string | null;
  data_hora_solicitacao?: string | null;
  aprovado_por?: string | null;
  pago_por?: string | null;
  data_hora_envio_efetivo?: string | null;
  horario_origem?: string | null;
  comprovante_pix_url?: string | null;
  comprovante_url?: string | null;
  chave_idempotencia?: string | null;
  status?: string | null;
  created_at?: string | null;
}

function normalizarSlug(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Normaliza a janela de solicitação em blocos determinísticos de 15 minutos
 * (HHMM) para evitar duplicidade por retries de webhook ou reenvios dentro
 * da mesma janela de solicitação, preservando pedidos legítimos em horários distintos.
 */
export function extrairJanelaSolicitacaoBucket(
  janelaSolicitacao?: string | null
): string {
  if (!janelaSolicitacao) return '0000';
  const trimmed = janelaSolicitacao.trim();

  // Caso 1: HH:MM explícito (ex.: "12:37", "08:35")
  const matchHm = trimmed.match(/^(\d{2}):(\d{2})/);
  if (matchHm) {
    const hh = matchHm[1];
    const mmNum = Number(matchHm[2]);
    const bucketMin = Math.floor(mmNum / 15) * 15;
    return `${hh}${String(bucketMin).padStart(2, '0')}`;
  }

  // Caso 2: ISO 8601 com ou sem timezone (ex.: "2026-11-21T12:37:00-03:00")
  const matchIsoHm = trimmed.match(/T(\d{2}):(\d{2})/);
  if (matchIsoHm) {
    const hh = matchIsoHm[1];
    const mmNum = Number(matchIsoHm[2]);
    const bucketMin = Math.floor(mmNum / 15) * 15;
    return `${hh}${String(bucketMin).padStart(2, '0')}`;
  }

  return '0000';
}

/**
 * Gera chave determinística de idempotência para lançamentos de VALE:
 * tenant_id + trabalhador_canônico + data_referencia + janela_solicitacao + hash SHA-256.
 */
export function gerarChaveIdempotenciaVale(
  params: ChaveIdempotenciaValeParams
): string {
  const tenantLimpo = params.tenantId.trim().toLowerCase();
  const tenantCurto = tenantLimpo.replace(/[^a-z0-9]/g, '').slice(-8) || 'tenant';
  const trabalhadorCanonico = normalizarNomeTrabalhadorCanonico(
    params.trabalhador
  );
  const slugTrabalhador = normalizarSlug(trabalhadorCanonico) || 'trabalhador';
  const dataLimpa = params.dataReferencia.trim().slice(0, 10);
  const janela = extrairJanelaSolicitacaoBucket(params.janelaSolicitacao);
  const valorCentavos = Math.round(
    (params.valor !== undefined && params.valor !== null && Number(params.valor) > 0
      ? Number(params.valor)
      : 100.0) * 100
  );

  const payloadHash = [
    tenantLimpo,
    slugTrabalhador,
    dataLimpa,
    janela,
    String(valorCentavos),
    (params.origemHash || '').trim(),
  ].join('|');

  const digest = crypto
    .createHash('sha256')
    .update(payloadHash)
    .digest('hex')
    .slice(0, 12);

  return `vale:${tenantCurto}:${dataLimpa}:${slugTrabalhador}:${janela}:${digest}`;
}

function pontuarCompletudeMetadados(row: RegistroValeDeduplicavel): number {
  let score = 0;
  if (row.comprovante_pix_url || row.comprovante_url) score += 100;
  if (row.data_hora_envio_efetivo) score += 30;
  if (row.aprovado_por || row.pago_por) score += 20;
  if (row.data_hora_solicitacao) score += 20;
  if (row.solicitado_por && row.solicitado_por.trim().length > 0) score += 15;
  if (row.horario_origem && row.horario_origem.trim().length > 0) score += 10;
  if (row.chave_idempotencia && row.chave_idempotencia.trim().length > 0) {
    score += 10;
  }
  if (row.status === 'LIQUIDADO') score += 25;
  else if (row.status === 'VALIDADO') score += 15;
  return score;
}

/**
 * Deduplica uma coleção de vales agrupando por
 * (tenant_id + trabalhador_canônico + data_referencia + valor_centavos + janela),
 * preservando sempre o registro com metadados mais completos
 * (comprovante_pix_url, data_hora_solicitacao, solicitado_por, aprovado_por).
 */
export function deduplicarValesPreservandoMetadados<
  T extends RegistroValeDeduplicavel,
>(rows: readonly T[]): { unicos: T[]; duplicadosRemovidos: T[] } {
  const grupos = new Map<string, T[]>();

  for (const row of rows) {
    const canonico = normalizarNomeTrabalhadorCanonico(row.nome_trabalhador);
    const slug = normalizarSlug(canonico);
    const valorCentavos = Math.round(Number(row.valor_monetario || 0) * 100);
    const janela = extrairJanelaSolicitacaoBucket(
      row.horario_origem || row.data_hora_solicitacao
    );
    const chaveGrupo = `${row.tenant_id}|${slug}|${row.data_referencia}|${valorCentavos}|${janela}`;
    const lista = grupos.get(chaveGrupo);
    if (lista) {
      lista.push(row);
    } else {
      grupos.set(chaveGrupo, [row]);
    }
  }

  const unicos: T[] = [];
  const duplicadosRemovidos: T[] = [];

  for (const grupo of Array.from(grupos.values())) {
    if (grupo.length === 1) {
      unicos.push(grupo[0]);
      continue;
    }

    const ordenado = [...grupo].sort((a, b) => {
      const diffScore =
        pontuarCompletudeMetadados(b) - pontuarCompletudeMetadados(a);
      if (diffScore !== 0) return diffScore;
      return String(a.created_at || '').localeCompare(String(b.created_at || ''));
    });

    unicos.push(ordenado[0]);
    for (let i = 1; i < ordenado.length; i++) {
      duplicadosRemovidos.push(ordenado[i]);
    }
  }

  return { unicos, duplicadosRemovidos };
}
