import { supabaseAdmin } from '@/lib/supabase';

export interface ApelidosSistema {
  obras: Record<string, string[]>; // { [obraId]: ["Bahia", "Porto Seguro", "Piscina Porto Seguro"] }
  funcionarios: Record<string, string[]>; // { [funcionarioId]: ["Peu", "Pedrinho"] }
}

const CONFIG_PHONE_KEY = 'SYSTEM_ALIASES_CONFIG';

/**
 * Carrega a tabela de apelidos configurada para Obras e Colaboradores.
 */
export async function obterApelidosSistema(tenantId = '00000000-0000-0000-0000-000000000001'): Promise<ApelidosSistema> {
  try {
    const { data } = await supabaseAdmin
      .from('encarregados_obras')
      .select('nome')
      .eq('tenant_id', tenantId)
      .eq('telefone_encarregado', CONFIG_PHONE_KEY)
      .maybeSingle();

    if (data?.nome) {
      const parsed = JSON.parse(data.nome);
      return {
        obras: parsed.obras || {},
        funcionarios: parsed.funcionarios || {},
      };
    }
  } catch (err) {
    console.error('Erro ao ler apelidos do sistema:', err);
  }

  return { obras: {}, funcionarios: {} };
}

/**
 * Salva a tabela de apelidos configurada.
 */
export async function salvarApelidosSistema(
  apelidos: ApelidosSistema,
  tenantId = '00000000-0000-0000-0000-000000000001'
): Promise<boolean> {
  try {
    const payloadJson = JSON.stringify(apelidos);

    const { data: existente } = await supabaseAdmin
      .from('encarregados_obras')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('telefone_encarregado', CONFIG_PHONE_KEY)
      .maybeSingle();

    if (existente?.id) {
      await supabaseAdmin
        .from('encarregados_obras')
        .update({
          nome: payloadJson,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existente.id);
    } else {
      await supabaseAdmin.from('encarregados_obras').insert({
        tenant_id: tenantId,
        telefone_encarregado: CONFIG_PHONE_KEY,
        nome: payloadJson,
        nivel_permissao: 'MASTER',
        ativo: false,
      });
    }

    return true;
  } catch (err) {
    console.error('Erro ao salvar apelidos:', err);
    return false;
  }
}
