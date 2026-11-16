import { supabaseAdmin } from '@/lib/supabase';

export interface DestinatarioAviso {
  nome: string;
  telefone: string;
  papel: string;
}

// Telefones oficiais dos Super Administradores
export const ADMINISTRADORES_PADRAO: DestinatarioAviso[] = [
  {
    nome: 'Patrícia Grubel',
    telefone: '5511978543369',
    papel: 'Administradora Central / Master',
  },
  {
    nome: 'Daniel Lopes',
    telefone: '5511988139833',
    papel: 'Super Admin Global',
  },
];

/**
 * Retorna a lista de telefones que devem receber todas as notificações e avisos
 * (Patrícia + Daniel Lopes + outros Masters cadastrados no banco).
 */
export async function obterDestinatariosAvisos(tenantId = '00000000-0000-0000-0000-000000000001'): Promise<DestinatarioAviso[]> {
  try {
    const { data: masters } = await supabaseAdmin
      .from('encarregados_obras')
      .select('nome, telefone_encarregado, nivel_permissao')
      .eq('tenant_id', tenantId)
      .eq('nivel_permissao', 'MASTER')
      .eq('ativo', true);

    if (masters && masters.length > 0) {
      const mapa = new Map<string, DestinatarioAviso>();

      // Injeta os padrões garantidos
      ADMINISTRADORES_PADRAO.forEach((adm) => {
        mapa.set(adm.telefone.replace(/\D/g, ''), adm);
      });

      // Mescla com os masters do banco
      masters.forEach((m) => {
        const telLimpo = m.telefone_encarregado.replace(/\D/g, '');
        if (telLimpo) {
          mapa.set(telLimpo, {
            nome: m.nome || 'Administrador',
            telefone: telLimpo,
            papel: 'Master',
          });
        }
      });

      return Array.from(mapa.values());
    }
  } catch (err) {
    console.error('Erro ao buscar administradores para avisos:', err);
  }

  return ADMINISTRADORES_PADRAO;
}

/**
 * Monta o payload de notificação duplicada para Patrícia e Daniel
 */
/**
 * Monta o payload de notificação duplicada para Patrícia e Daniel
 */
export function formatarMensagemNotificacaoDupla(
  titulo: string,
  detalhes: string,
  linkAcao?: string
): { destinatarios: DestinatarioAviso[]; texto: string } {
  let texto = `🚨 *${titulo}*\n`;
  texto += `*Ponto Patrícia (Diária.AI)*\n`;
  texto += `--------------------------------------\n`;
  texto += `${detalhes}\n`;
  if (linkAcao) {
    texto += `\n🔗 *Link Direto de Validação & Ajuste:* ${linkAcao}\n`;
  }
  texto += `\n_Notificação espelhada enviada para Patrícia Grubel e Daniel Lopes._`;

  return {
    destinatarios: ADMINISTRADORES_PADRAO,
    texto,
  };
}

export interface TicketEncarregado {
  obra: string;
  dataReferencia: string;
  colaboradores: { nome: string; status: string }[];
  valesQtd: number; // Apenas quantidade de comprovantes/pedidos, SEM VALOR
  loteId?: string;
}

export function formatarTicketEncarregado(item: TicketEncarregado): string {
  let texto = `👷‍♂️ *PONTO PATRÍCIA | COMPROVANTE OPERACIONAL*\n`;
  texto += `--------------------------------------\n`;
  texto += `📍 *Canteiro / Obra:* ${item.obra}\n`;
  texto += `📅 *Data de Referência:* ${item.dataReferencia}\n\n`;
  texto += `👥 *Efetivo Registrado (${item.colaboradores.length}):*\n`;
  
  item.colaboradores.forEach((c) => {
    texto += ` • ${c.nome} _(${c.status})_\n`;
  });

  if (item.valesQtd > 0) {
    texto += `\n📑 *Comprovantes / Vales Anexados:* ${item.valesQtd} registro(s) recebido(s)\n`;
  }

  texto += `\n✅ *Seu apontamento foi protocolado com sucesso!*\n`;
  texto += `_Os registros foram encaminhados para validação da Administração._\n`;
  texto += `⚠️ _Se faltou alguém da equipe ou houve engano, avise respondendo aqui._`;

  return texto;
}

export function formatarTicketFinanceiroAdministracao(item: {
  obra: string;
  dataReferencia: string;
  encarregadoNome?: string;
  encarregadoTelefone?: string;
  totalColaboradores: number;
  colaboradoresNomes: string[];
  totalValesMonetario?: number;
  valesDetalhados?: { nome: string; valor: number }[];
  tipoEvento: 'VIAGEM' | 'CHUVA' | 'MEIO_PERIODO' | 'NORMAL';
  linkAcao: string;
}): { destinatarios: DestinatarioAviso[]; texto: string } {
  let titulo = '📊 RESUMO OPERACIONAL & FINANCEIRO';
  if (item.tipoEvento === 'VIAGEM') titulo = '🚗 APONTAMENTO DE VIAGEM';
  if (item.tipoEvento === 'CHUVA') titulo = '🌧️ DIÁRIAS DE CHUVA';
  if (item.tipoEvento === 'MEIO_PERIODO') titulo = '⏱️ MEIO PERÍODO (0.5x)';

  let texto = `🔒 *${titulo} [SIGILOSO]*\n`;
  texto += `*Ponto Patrícia (Diária.AI)*\n`;
  texto += `--------------------------------------\n`;
  texto += `🏗️ *Canteiro / Obra:* ${item.obra}\n`;
  texto += `📅 *Data:* ${item.dataReferencia}\n`;
  if (item.encarregadoTelefone) {
    texto += `👷 *Encarregado Remetente:* ${item.encarregadoNome || 'Encarregado'} (${item.encarregadoTelefone})\n`;
  }
  texto += `👥 *Total de Diárias:* ${item.totalColaboradores} colaboradores\n`;
  texto += `📝 *Equipe:* ${item.colaboradoresNomes.slice(0, 8).join(', ')}${item.colaboradoresNomes.length > 8 ? '...' : ''}\n`;

  // Seção Financeira Específica (Apenas Patrícia e Daniel)
  if (item.valesDetalhados && item.valesDetalhados.length > 0) {
    texto += `\n💵 *VALES SOLICITADOS (TOTAL: R$ ${(item.totalValesMonetario || 0).toFixed(2)}):*\n`;
    item.valesDetalhados.forEach(v => {
      texto += ` • ${v.nome}: R$ ${v.valor.toFixed(2)}\n`;
    });
  } else if (item.totalValesMonetario && item.totalValesMonetario > 0) {
    texto += `\n💵 *Total em Vales Solicitados:* R$ ${item.totalValesMonetario.toFixed(2)}\n`;
  }

  texto += `\n🔗 *Link Exclusivo de Validação & Aprovação:*\n${item.linkAcao}\n`;
  texto += `\n_Mensagem sigilosa enviada exclusivamente para Daniel Lopes e Patrícia Grubel._`;

  return {
    destinatarios: ADMINISTRADORES_PADRAO,
    texto,
  };
}

/**
 * Formata notificação específica de novo lote para WhatsApp (Patrícia e Daniel)
 * com detalhamento de evento (Viagem, Chuva, Meio Dia) e link direto para aprovação
 */
export function formatarAlertaNovoLoteWhatsApp(item: {
  obra: string;
  dataReferencia: string;
  tipoEvento: 'VIAGEM' | 'CHUVA' | 'MEIO_PERIODO' | 'NORMAL';
  colaboradores: string[];
  totalColaboradores: number;
  possuiViagemSemMotorista?: boolean;
  linkAcao: string;
}): { destinatarios: DestinatarioAviso[]; texto: string } {
  let tituloEvento = 'Apontamento de Campo Recebido';
  if (item.tipoEvento === 'VIAGEM') tituloEvento = '🚗 Apontamento de Viagem (Equipe em Trânsito)';
  if (item.tipoEvento === 'CHUVA') tituloEvento = '🌧️ Diárias de Chuva Registradas';
  if (item.tipoEvento === 'MEIO_PERIODO') tituloEvento = '⏱️ Apontamento de Meio Período (0.5x)';

  let detalhes = `🏗️ *Canteiro / Obra:* ${item.obra}\n`;
  detalhes += `📅 *Data de Referência:* ${item.dataReferencia}\n`;
  detalhes += `👥 *Equipe (${item.totalColaboradores}):* ${item.colaboradores.slice(0, 7).join(', ')}${item.colaboradores.length > 7 ? '...' : ''}\n`;

  if (item.possuiViagemSemMotorista) {
    detalhes += `\n⚠️ *Ação Necessária no Link:* Selecione quem foi o motorista para que a diária dele se torne integral (passageiros recebem R$ 120,00).\n`;
  } else if (item.tipoEvento === 'CHUVA') {
    detalhes += `\n💧 *Regra Aplicada:* R$ 120,00 por colaborador para o dia de chuva.\n`;
  } else if (item.tipoEvento === 'MEIO_PERIODO') {
    detalhes += `\n⏱️ *Regra Aplicada:* 0.5x (meia diária calculada automaticamente).\n`;
  }

  return formatarMensagemNotificacaoDupla(tituloEvento, detalhes, item.linkAcao);
}

/**
 * REGRA CRÍTICA INVIOLÁVEL: Notificação Exclusiva & Obrigatória para Patrícia Grubel
 * Sempre que qualquer registro já confirmado ou validado for editado/alterado por qualquer usuário
 * (seja Daniel Lopes ou outro administrador), um alerta direto e prioritário é enviado para Patrícia.
 */
export function formatarAlertaEdicaoPatricia(item: {
  trabalhador: string;
  obra: string;
  dataReferencia: string;
  autorEdicao: string;
  confirmadoAnteriormentePor?: string;
  motivoOuAlteracao: string;
  valorAnterior?: number;
  novoValor?: number;
}): { destinatario: DestinatarioAviso; texto: string } {
  const patricia = ADMINISTRADORES_PADRAO[0]; // Patrícia Grubel (5511978543369)

  let texto = `⚠️ *AVISO DE EDIÇÃO DE APONTAMENTO*\n`;
  texto += `*Ponto Patrícia (Diária.AI)*\n`;
  texto += `--------------------------------------\n`;
  texto += `Olá *Patrícia*, um lançamento registrado no sistema foi alterado.\n\n`;
  texto += `👤 *Colaborador:* ${item.trabalhador}\n`;
  texto += `🏗️ *Obra / Canteiro:* ${item.obra}\n`;
  texto += `📅 *Data da Diária:* ${item.dataReferencia}\n`;
  texto += `✏️ *Editado por:* ${item.autorEdicao}\n`;

  if (item.confirmadoAnteriormentePor) {
    texto += `📌 *Confirmado anteriormente por:* ${item.confirmadoAnteriormentePor}\n`;
  }

  texto += `📝 *Alteração:* ${item.motivoOuAlteracao}\n`;

  if (item.valorAnterior !== undefined && item.novoValor !== undefined) {
    texto += `💵 *Ajuste de Valor:* R$ ${item.valorAnterior.toFixed(2)} ➡️ *R$ ${item.novoValor.toFixed(2)}*\n`;
  }

  texto += `\n⏰ *Data/Hora da Edição:* ${new Date().toLocaleString('pt-BR')}\n`;
  texto += `\n_Este alerta é enviado obrigatoriamente para seu controle gerencial exclusivo._`;

  return {
    destinatario: patricia,
    texto,
  };
}
