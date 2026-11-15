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
    telefone: '5511913192703',
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
    texto += `\n🔗 *Link de Ação Imediata:* ${linkAcao}\n`;
  }
  texto += `\n_Notificação espelhada enviada para Patrícia Grubel e Daniel Lopes._`;

  return {
    destinatarios: ADMINISTRADORES_PADRAO,
    texto,
  };
}
