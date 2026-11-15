import crypto from 'crypto';

export interface TicketPontoData {
  loteId: string;
  obraNome: string;
  dataReferencia: string;
  apontadoPorTelefone: string;
  dataHoraEnvioOriginal: string;
  homologadoPor: string;
  dataHoraHomologacao: string;
  apontamentos: Array<{
    nome: string;
    fracao: number;
    motivo: string;
  }>;
  totalColaboradores: number;
  valesCount?: number;
  sha256Hash?: string;
}

/**
 * Gera o texto formatado do Ticket de Ponto (sem valores em R$)
 * para envio direto ao grupo oficial da obra no WhatsApp após validação.
 */
export function formatarTicketPontoWhatsApp(data: TicketPontoData): string {
  const hashCurto = data.sha256Hash
    ? data.sha256Hash.slice(0, 16) + '...' + data.sha256Hash.slice(-8)
    : crypto.createHash('sha256').update(`${data.loteId}-${data.dataHoraHomologacao}`).digest('hex').slice(0, 20);

  let ticket = `╔══════════════════════════════════════╗\n`;
  ticket += `║     🏢 PONTO PATRÍCIA • DIÁRIA.AI     ║\n`;
  ticket += `║       TICKET DE PONTO HOMOLOGADO     ║\n`;
  ticket += `╚══════════════════════════════════════╝\n\n`;

  ticket += `📋 *LOTE:* #${data.loteId.slice(0, 8).toUpperCase()}\n`;
  ticket += `🏗️ *CANTEIRO:* ${data.obraNome}\n`;
  ticket += `📅 *DATA DA DIÁRIA:* ${data.dataReferencia}\n`;
  ticket += `📱 *APONTADO POR:* ${formatarTelefone(data.apontadoPorTelefone)} (${data.dataHoraEnvioOriginal})\n`;
  ticket += `👤 *HOMOLOGADO POR:* ${data.homologadoPor} em ${data.dataHoraHomologacao}\n\n`;

  ticket += `────────────────────────────────────────\n`;
  ticket += `EQUIPE CONFIRMADA & DIÁRIAS COMPUTADAS:\n`;
  ticket += `────────────────────────────────────────\n`;

  data.apontamentos.forEach((ap) => {
    let rotulo = '[1.0x Integral]';
    const motivoUpper = (ap.motivo || '').toUpperCase();

    if (motivoUpper.includes('VIAGEM_MOTORISTA') || motivoUpper.includes('CONDUTOR')) {
      rotulo = '[🚗 1.0x Condutor / Integral]';
    } else if (motivoUpper.includes('VIAGEM')) {
      rotulo = '[✈️ 1.0x Diária Viagem]';
    } else if (motivoUpper.includes('CHUVA')) {
      rotulo = '[🌧️ 1.0x Diária Chuva]';
    } else if (motivoUpper.includes('PARADO')) {
      rotulo = '[🛑 1.0x Dia Parado]';
    } else if (ap.fracao === 0.5) {
      rotulo = '[⏱️ ½ Meio Período]';
    } else if (ap.fracao === 0.0) {
      rotulo = '[❌ Falta]';
    }

    ticket += `• ${ap.nome.padEnd(26, '.')} ${rotulo}\n`;
  });

  ticket += `────────────────────────────────────────\n`;
  ticket += `RESUMO DO FECHAMENTO:\n`;
  ticket += `• Total Homologado: ${data.totalColaboradores} colaborador(es)\n`;
  ticket += `• Status: VALIDADO E LANÇADO NA FOLHA QUINZENAL\n`;
  if (data.valesCount && data.valesCount > 0) {
    ticket += `• Vales Registrados: ${data.valesCount} recibo(s) em auditoria individual\n`;
  }
  ticket += `────────────────────────────────────────\n\n`;

  ticket += `🔒 *Carimbo Pericial & Hash SHA-256:*\n`;
  ticket += `\`${hashCurto}\`\n\n`;
  ticket += `_Registro autenticado com segurança temporal. Dúvidas devem ser reportadas à Administração até as 18h._`;

  return ticket;
}

function formatarTelefone(tel: string): string {
  const limpo = tel.replace(/\D/g, '');
  if (limpo.length === 13) {
    return `+${limpo.slice(0, 2)} (${limpo.slice(2, 4)}) ${limpo.slice(4, 9)}-${limpo.slice(9)}`;
  }
  if (limpo.length === 11) {
    return `(${limpo.slice(0, 2)}) ${limpo.slice(2, 7)}-${limpo.slice(7)}`;
  }
  return tel || 'WhatsApp Oficial';
}
