import { supabaseAdmin } from '@/lib/supabase';

export interface ObraLogisticaDados {
  obraId?: string;
  obraNome?: string;
  aliasFornecedor: string; // Nome do cliente que identifica o pedido junto ao fornecedor
  enderecoEntrega: string; // Endereço completo para entrega de materiais
  cepEntrega?: string;
  complementoObservacao?: string; // Complemento, portaria de serviço, horário/regras de descarga
  contatoRecebimento?: string; // Nome + WhatsApp de quem recebe o material na obra
  atualizadoEm?: string;
}

export type MapaObrasLogistica = Record<string, ObraLogisticaDados>;

function normalizarChaveNome(nome: string): string {
  return (nome || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Lê os dados logísticos/fornecedor das obras de um tenant específico em parametros_sistema.
 * Funciona imediatamente sem depender de colunas extras no schema SQL.
 */
export async function lerObrasLogisticaTenant(tenantId: string): Promise<{
  paramId: string | null;
  configs: Record<string, unknown>;
  porObraId: MapaObrasLogistica;
}> {
  const { data } = await supabaseAdmin
    .from('parametros_sistema')
    .select('id, configuracoes')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  const configs =
    (data?.configuracoes as Record<string, unknown> | null) || {};
  const rawMap = configs.obras_logistica;
  const porObraId: MapaObrasLogistica =
    rawMap && typeof rawMap === 'object' && !Array.isArray(rawMap)
      ? (rawMap as MapaObrasLogistica)
      : {};

  return {
    paramId: data?.id || null,
    configs,
    porObraId,
  };
}

/**
 * Salva/atualiza os dados logísticos/fornecedor de uma obra isolados por tenant_id.
 */
export async function salvarObraLogisticaTenant(
  tenantId: string,
  obraId: string,
  dados: ObraLogisticaDados
): Promise<void> {
  const { paramId, configs, porObraId } = await lerObrasLogisticaTenant(
    tenantId
  );

  const atualizado: MapaObrasLogistica = {
    ...porObraId,
    [obraId]: {
      ...dados,
      obraId,
      atualizadoEm: new Date().toISOString(),
    },
  };

  const novasConfigs = {
    ...configs,
    obras_logistica: atualizado,
  };

  if (paramId) {
    await supabaseAdmin
      .from('parametros_sistema')
      .update({ configuracoes: novasConfigs })
      .eq('id', paramId)
      .eq('tenant_id', tenantId);
  } else {
    await supabaseAdmin.from('parametros_sistema').insert({
      tenant_id: tenantId,
      configuracoes: novasConfigs,
    });
  }
}

/**
 * Busca os dados logísticos (Alias do Cliente p/ Fornecedor, Endereço, Complemento/Obs, Contato)
 * de uma obra pelo nome ou ID dentro do tenant ativo.
 */
export async function buscarLogisticaPorNomeObra(
  tenantId: string,
  obraNome: string
): Promise<ObraLogisticaDados | null> {
  const alvoNorm = normalizarChaveNome(obraNome);
  if (!alvoNorm) return null;

  const [{ porObraId }, { data: obrasRows }] = await Promise.all([
    lerObrasLogisticaTenant(tenantId),
    supabaseAdmin
      .from('obras_config')
      .select('id, nome, local')
      .eq('tenant_id', tenantId),
  ]);

  const rows =
    (obrasRows as Array<{ id: string; nome: string; local: string | null }> | null) ||
    [];

  // 1. Procura match direto em obras_config
  const obraRow = rows.find((r) => {
    const n = normalizarChaveNome(r.nome);
    return n === alvoNorm || n.includes(alvoNorm) || alvoNorm.includes(n);
  });

  if (obraRow) {
    const salvo = porObraId[obraRow.id];
    if (salvo) {
      return {
        ...salvo,
        obraId: obraRow.id,
        obraNome: obraRow.nome,
        enderecoEntrega:
          salvo.enderecoEntrega ||
          (obraRow.local && obraRow.local !== 'Canteiro Volante'
            ? obraRow.local
            : ''),
      };
    }
    if (obraRow.local && obraRow.local !== 'Canteiro Volante') {
      return {
        obraId: obraRow.id,
        obraNome: obraRow.nome,
        aliasFornecedor: '',
        enderecoEntrega: obraRow.local,
      };
    }
  }

  // 2. Fallback por nome dentro do mapa salvo
  for (const item of Object.values(porObraId)) {
    const n = normalizarChaveNome(item.obraNome || '');
    if (n && (n === alvoNorm || n.includes(alvoNorm) || alvoNorm.includes(n))) {
      return item;
    }
  }

  return null;
}
