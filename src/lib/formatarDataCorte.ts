/**
 * Utilitários estritos para resolução e formatação do ponto de corte de validação
 * com data e hora no fuso America/Sao_Paulo (-03:00).
 */

const TIMEZONE_BR = 'America/Sao_Paulo';

/**
 * Resolve o timestamp completo de corte a partir de `parametros_sistema.configuracoes`
 * do tenant ativo, priorizando timestamps com hora (data_corte_validacao / data_hora_corte_rigido)
 * e mantendo fallback seguro para registros legados somente com data (data_corte_operacional).
 */
export function resolverDataHoraCorteValidacao(
  configs: Record<string, unknown> | null | undefined
): string | null {
  if (!configs) return null;

  const candidatos = [
    configs.data_corte_validacao,
    configs.data_hora_corte_rigido,
    configs.data_corte_operacional,
  ];

  for (const c of candidatos) {
    if (typeof c === 'string' && c.trim().length > 0) {
      return c.trim();
    }
  }
  return null;
}

/**
 * Normaliza uma string de corte (ISO completo, "YYYY-MM-DD HH:mm" ou somente "YYYY-MM-DD")
 * para ISO 8601 com fuso -03:00. Caso venha somente a data, aplica 00:00 com segurança.
 */
export function normalizarDataHoraCorteISO(
  raw: string | null | undefined
): string | null {
  if (!raw) return null;
  const limpo = raw.trim();
  if (!limpo) return null;

  // Apenas data: YYYY-MM-DD -> fallback seguro 00:00 BRT
  if (/^\d{4}-\d{2}-\d{2}$/.test(limpo)) {
    return `${limpo}T00:00:00-03:00`;
  }

  // Formato espaço sem timezone: YYYY-MM-DD HH:mm(:ss)?
  const matchEspaco = limpo.match(
    /^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})(?::(\d{2}))?$/
  );
  if (matchEspaco) {
    const seg = matchEspaco[3] || '00';
    return `${matchEspaco[1]}T${matchEspaco[2]}:${seg}-03:00`;
  }

  // ISO sem timezone explícito: YYYY-MM-DDTHH:mm(:ss)?
  const matchIsoSemTz = limpo.match(
    /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::(\d{2}))?$/
  );
  if (matchIsoSemTz) {
    const seg = matchIsoSemTz[3] || '00';
    return `${matchIsoSemTz[1]}T${matchIsoSemTz[2]}:${seg}-03:00`;
  }

  // Valida se é parseável
  const ms = Date.parse(limpo);
  if (Number.isNaN(ms)) return null;
  return limpo;
}

/**
 * Formata o ponto de corte para exibição legível na UI no fuso America/Sao_Paulo:
 * Ex.: "2026-11-22T11:40:00-03:00" -> "22/11/2026 às 11:40"
 * Ex.: "2026-11-22" (legado sem hora) -> "22/11/2026 às 00:00"
 */
export function formatarDataHoraCorteBR(
  raw: string | null | undefined
): string | null {
  const iso = normalizarDataHoraCorteISO(raw);
  if (!iso) return raw?.trim() || null;

  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return raw?.trim() || null;

  const dataStr = dt.toLocaleDateString('pt-BR', {
    timeZone: TIMEZONE_BR,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const horaStr = dt.toLocaleTimeString('pt-BR', {
    timeZone: TIMEZONE_BR,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  return `${dataStr} às ${horaStr}`;
}
