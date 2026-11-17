import { supabaseAdmin } from '@/lib/supabase';

export interface PrecosDuplos {
  obra: number | null;
  piscina: number | null;
}

export type TabelaPrecosDuplos = Record<string, PrecosDuplos>; // { [funcionarioId]: { obra: 250, piscina: 450 } }

const PRECOS_CONFIG_KEY = 'SYSTEM_DOUBLE_RATES_CONFIG';

// Tabela oficial do Daniel Lopes (Fallback padrão)
export const TABELA_OFICIAL_PADRAO: Record<string, PrecosDuplos> = {
  'EDMILSON - PEU': { obra: 250.0, piscina: 450.0 },
  'GILVAN - GIL': { obra: 250.0, piscina: 400.0 },
  'MATEUS': { obra: 200.0, piscina: 340.0 },
  'MANOEL': { obra: 230.0, piscina: 300.0 },
  'IGOR': { obra: 180.0, piscina: 350.0 },
  'DANIEL': { obra: 180.0, piscina: 280.0 },
  'IAN': { obra: 180.0, piscina: 300.0 },
  'ZÉ BAIANO': { obra: 180.0, piscina: 280.0 },
  'ZÉ NITO': { obra: 250.0, piscina: 400.0 },
  'BETO - JOSE ROBERTO': { obra: 300.0, piscina: null },
  'WENDER': { obra: 180.0, piscina: null },
  'WESLEI': { obra: 150.0, piscina: null },
  'WANDERSON VERISSIMO': { obra: null, piscina: 220.0 },
  'SAMARINO': { obra: 200.0, piscina: 300.0 },
  'ALEX DINHO': { obra: 300.0, piscina: null },
  'DIEGO': { obra: 8700.0, piscina: null },
  'LUCAS J.': { obra: 180.0, piscina: 280.0 },
};

/**
 * Obtém a tabela de preços de Obra vs. Piscina
 */
export async function obterTabelaPrecosDuplos(tenantId = '00000000-0000-0000-0000-000000000001'): Promise<TabelaPrecosDuplos> {
  try {
    const { data } = await supabaseAdmin
      .from('encarregados_obras')
      .select('nome')
      .eq('tenant_id', tenantId)
      .eq('telefone_encarregado', PRECOS_CONFIG_KEY)
      .maybeSingle();

    if (data?.nome) {
      return JSON.parse(data.nome);
    }
  } catch (e) {
    console.error('Erro ao ler tabela de preços duplos:', e);
  }

  return {};
}

/**
 * Salva a tabela de preços de Obra vs. Piscina
 */
export async function salvarTabelaPrecosDuplos(
  tabela: TabelaPrecosDuplos,
  tenantId = '00000000-0000-0000-0000-000000000001'
): Promise<boolean> {
  try {
    const payloadJson = JSON.stringify(tabela);

    const { data: existente } = await supabaseAdmin
      .from('encarregados_obras')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('telefone_encarregado', PRECOS_CONFIG_KEY)
      .maybeSingle();

    if (existente?.id) {
      const { error } = await supabaseAdmin
        .from('encarregados_obras')
        .update({ nome: payloadJson })
        .eq('id', existente.id);
      return !error;
    } else {
      const { error } = await supabaseAdmin.from('encarregados_obras').insert({
        tenant_id: tenantId,
        nome: payloadJson,
        telefone_encarregado: PRECOS_CONFIG_KEY,
        ativo: true,
      });
      return !error;
    }
  } catch (err) {
    console.error('Erro ao salvar tabela de preços duplos:', err);
    return false;
  }
}
