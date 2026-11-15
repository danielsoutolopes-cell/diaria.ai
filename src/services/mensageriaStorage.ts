import { supabaseAdmin } from '@/lib/supabase';

export interface MensagemSolicitacao {
  id: string;
  autor: string; // 'Patrícia Grubel'
  titulo: string;
  descricaoOriginal: string;
  conversaChat: Array<{
    remetente: 'USUARIO' | 'ASSISTENTE';
    texto: string;
    dataHora: string;
  }>;
  promptTecnicoGerado: string;
  status: 'ABERTO' | 'CONCLUIDO';
  criadoEm: string;
  fechadoEm?: string | null;
  fechadoPor?: string | null;
}

const SOLICITACOES_PREFIX = 'SOLICITACAO_MENSAGERIA_';

/**
 * Lista todas as solicitações de melhorias/relatórios salvas no sistema.
 */
export async function listarSolicitacoesMensageria(
  tenantId = '00000000-0000-0000-0000-000000000001'
): Promise<MensagemSolicitacao[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from('encarregados_obras')
      .select('id, telefone_encarregado, nome, created_at, updated_at')
      .eq('tenant_id', tenantId)
      .like('telefone_encarregado', `${SOLICITACOES_PREFIX}%`)
      .order('created_at', { ascending: false });

    if (error || !data) return [];

    return data.map((item) => {
      try {
        const parsed = JSON.parse(item.nome || '{}');
        return {
          id: item.id,
          ...parsed,
          criadoEm: parsed.criadoEm || item.created_at,
        };
      } catch (e) {
        return {
          id: item.id,
          autor: 'Patrícia Grubel',
          titulo: 'Solicitação de Melhoria',
          descricaoOriginal: item.nome || '',
          conversaChat: [],
          promptTecnicoGerado: '',
          status: 'ABERTO',
          criadoEm: item.created_at,
        };
      }
    });
  } catch (err) {
    console.error('Erro ao listar solicitações:', err);
    return [];
  }
}

/**
 * Salva ou atualiza uma solicitação com prompt técnico gerado.
 */
export async function salvarSolicitacaoMensageria(
  solicitacao: Omit<MensagemSolicitacao, 'id'> & { id?: string },
  tenantId = '00000000-0000-0000-0000-000000000001'
): Promise<MensagemSolicitacao | null> {
  try {
    const jsonPayload = JSON.stringify(solicitacao);

    if (solicitacao.id) {
      const { data, error } = await supabaseAdmin
        .from('encarregados_obras')
        .update({
          nome: jsonPayload,
          updated_at: new Date().toISOString(),
        })
        .eq('id', solicitacao.id)
        .select()
        .single();

      if (error) throw error;
      return { id: solicitacao.id, ...solicitacao };
    }

    const keyIdentificador = `${SOLICITACOES_PREFIX}${Date.now()}`;
    const { data, error } = await supabaseAdmin
      .from('encarregados_obras')
      .insert({
        tenant_id: tenantId,
        telefone_encarregado: keyIdentificador,
        nome: jsonPayload,
        nivel_permissao: 'CONSULTA',
        ativo: false,
      })
      .select('id')
      .single();

    if (error || !data) throw error;
    return { id: data.id, ...solicitacao };
  } catch (err) {
    console.error('Erro ao salvar solicitação:', err);
    return null;
  }
}
