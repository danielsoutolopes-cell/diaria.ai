export interface PresencaResumo19hItem {
  trabalhador: string;
  fracao: number;
  observacao?: string | null;
}

export interface ResumoDiario19hPayload {
  empresaNome: string;
  obraNome: string;
  dataIso: string; // YYYY-MM-DD
  presencas: PresencaResumo19hItem[];
}

export interface HomologacaoDiaria19hRecord {
  chave: string; // `${dataIso}__${obraNome}`
  dataIso: string;
  obraNome: string;
  grupoJid: string;
  enviadoEm: string;
  status: 'AGUARDANDO_OK' | 'HOMOLOGADO_ENCARREGADO';
  homologadoPor?: string | null;
  homologadoEm?: string | null;
  qtdPresentes: number;
}

/**
 * Verifica se o horário atual em America/Sao_Paulo está na janela de disparo
 * do Resumo Diário às 19:00 (24/7 — todos os 7 dias da semana, inclusive domingos e feriados).
 */
export function isJanelaResumoDiario19h(agora: Date = new Date()): boolean {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(agora);

  const hour = Number(parts.find((p) => p.type === 'hour')?.value || '-1');
  return hour === 19;
}

/**
 * Formata o espelho consolidado do dia às 19h para o grupo da obra (SEM valores em R$),
 * solicitando confirmação rápida "OK" do encarregado.
 */
export function formatarResumoDiario19hWhatsApp(
  payload: ResumoDiario19hPayload
): string {
  const [yyyy, mm, dd] = payload.dataIso.split('-');
  const dataBr = yyyy && mm && dd ? `${dd}/${mm}/${yyyy}` : payload.dataIso;

  const linhas = payload.presencas.map((p, idx) => {
    const fracaoStr =
      p.fracao === 0.5
        ? '½ dia'
        : p.fracao === 0
          ? 'Falta'
          : `${p.fracao.toFixed(1).replace('.0', '')} dia`;
    const obs =
      p.observacao && /chuva|rateio|viagem|parado/i.test(p.observacao)
        ? ` (${p.observacao})`
        : '';
    return `${idx + 1}. *${p.trabalhador}* — ${fracaoStr}${obs}`;
  });

  return [
    `📋 *RESUMO DIÁRIO DE PRESENÇAS — 19h (EM HOMOLOGAÇÃO)*`,
    `🏢 *${payload.empresaNome}* | 🏗️ *${payload.obraNome}*`,
    `📅 Data: *${dataBr}* | 👥 Efetivo: *${payload.presencas.length} registro(s)*`,
    `--------------------------------`,
    ...(linhas.length > 0
      ? linhas
      : ['_Nenhum apontamento registrado hoje nesta obra._']),
    `--------------------------------`,
    `✅ *Encarregado, responda "OK" para homologar o dia* (ou envie a correção aqui no grupo).`,
  ].join('\n');
}

/**
 * Detecta confirmação rápida "OK" enviada pelo encarregado (Gil, Manoel, Joabson)
 * no grupo da obra em resposta ao Resumo Diário das 19h.
 */
export function isConfirmacaoOkEncarregado(texto: string): boolean {
  const limpo = texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

  if (!limpo || limpo.length > 40) return false;

  return /^(ok|ok!|ok\.|tudo ok|tudo ok!|certo|confirmado|confirmo|fechado|fechou|show|blz|beleza|positivo|certinho|👍|✅|👌)[\s.!👍✅👌]*$/i.test(
    limpo
  );
}
