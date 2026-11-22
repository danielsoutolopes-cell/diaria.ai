import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getActiveTenantFromRequest } from '@/lib/tenant';
import {
  lerObrasLogisticaTenant,
  salvarObraLogisticaTenant,
} from '@/services/obrasLogisticaStorage';

export const dynamic = 'force-dynamic';

interface ObraRowBase {
  id: string;
  nome: string;
  local: string | null;
  tipo_obra: string;
  valor_diaria_padrao?: number | null;
  ativo: boolean;
  alias_fornecedor?: string | null;
  cep_entrega?: string | null;
  complemento_entrega?: string | null;
  contato_recebimento?: string | null;
}

export async function GET(req: NextRequest) {
  try {
    const activeTenant = getActiveTenantFromRequest(req);
    const [{ data, error }, { porObraId }] = await Promise.all([
      supabaseAdmin
        .from('obras_config')
        .select('*')
        .eq('tenant_id', activeTenant.id)
        .order('created_at', { ascending: false }),
      lerObrasLogisticaTenant(activeTenant.id),
    ]);

    if (error) {
      console.error('Erro ao listar obras:', error);
      return NextResponse.json({ obras: [] }, { status: 500 });
    }

    const obrasEnriquecidas = ((data as unknown as ObraRowBase[] | null) || []).map(
      (obra) => {
        const log = porObraId[obra.id];
        return {
          ...obra,
          alias_fornecedor: log?.aliasFornecedor || obra.alias_fornecedor || '',
          cep_entrega: log?.cepEntrega || obra.cep_entrega || '',
          complemento_entrega:
            log?.complementoObservacao || obra.complemento_entrega || '',
          contato_recebimento:
            log?.contatoRecebimento || obra.contato_recebimento || '',
        };
      }
    );

    return NextResponse.json({ obras: obrasEnriquecidas });
  } catch (err) {
    console.error('Erro na rota /api/obras:', err);
    return NextResponse.json({ obras: [] }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const activeTenant = getActiveTenantFromRequest(req);
    const body = await req.json();
    const {
      nome,
      local,
      tipo_obra,
      valor_diaria_padrao,
      apelidos,
      alias_fornecedor,
      cep_entrega,
      complemento_entrega,
      contato_recebimento,
    } = body;
    const tenant_id = activeTenant.id;
    const isIntermack = activeTenant.slug === 'intermack';

    if (!nome || !String(nome).trim()) {
      return NextResponse.json({ error: 'Nome da obra é obrigatório' }, { status: 400 });
    }

    const enderecoLimpo = String(local || '').trim();
    const aliasFornecedorLimpo = String(alias_fornecedor || '').trim();
    const cepLimpo = String(cep_entrega || '').trim();
    const complementoLimpo = String(complemento_entrega || '').trim();
    const contatoLimpo = String(contato_recebimento || '').trim();

    if (isIntermack) {
      if (!enderecoLimpo || enderecoLimpo.toLowerCase() === 'canteiro volante') {
        return NextResponse.json(
          {
            error:
              'Na Intermack, o Endereço de Entrega completo é obrigatório para o envio de materiais.',
          },
          { status: 400 }
        );
      }
      if (!aliasFornecedorLimpo) {
        return NextResponse.json(
          {
            error:
              'Na Intermack, o Alias (Nome do Cliente p/ Fornecedores) é obrigatório para identificação nos pedidos de compra.',
          },
          { status: 400 }
        );
      }
    }

    const payload: Record<string, string | number | boolean> = {
      tenant_id,
      nome: String(nome).trim().toUpperCase(),
      local: enderecoLimpo || 'Canteiro Volante',
      tipo_obra: tipo_obra || (isIntermack ? 'OBRA_CIVIL' : 'PISCINA'),
      ativo: true,
    };
    if (valor_diaria_padrao !== undefined && !Number.isNaN(Number(valor_diaria_padrao))) {
      payload.valor_diaria_padrao = Number(valor_diaria_padrao);
    }

    const res = await supabaseAdmin.from('obras_config').insert(payload).select().single();

    if (res.error) {
      console.error('Erro ao inserir obra:', res.error);
      return NextResponse.json({ error: res.error.message }, { status: 500 });
    }

    // Salva metadados de logística/fornecedor isolados por tenant_id
    if (res.data?.id && (aliasFornecedorLimpo || enderecoLimpo || cepLimpo || complementoLimpo || contatoLimpo)) {
      await salvarObraLogisticaTenant(tenant_id, res.data.id, {
        obraId: res.data.id,
        obraNome: res.data.nome,
        aliasFornecedor: aliasFornecedorLimpo,
        enderecoEntrega: enderecoLimpo,
        cepEntrega: cepLimpo,
        complementoObservacao: complementoLimpo,
        contatoRecebimento: contatoLimpo,
      });
    }

    // Se informou apelidos, salva no storage
    if (res.data?.id && Array.isArray(apelidos) && apelidos.length > 0) {
      const { obterApelidosSistema, salvarApelidosSistema } = await import('@/services/apelidosStorage');
      const mapa = await obterApelidosSistema();
      mapa.obras[res.data.id] = apelidos.map((a: string) => String(a).trim()).filter(Boolean);
      await salvarApelidosSistema(mapa);
    }

    return NextResponse.json({
      success: true,
      obra: {
        ...res.data,
        alias_fornecedor: aliasFornecedorLimpo,
        cep_entrega: cepLimpo,
        complemento_entrega: complementoLimpo,
        contato_recebimento: contatoLimpo,
      },
    });
  } catch (err) {
    console.error('Erro ao criar obra:', err);
    return NextResponse.json({ error: 'Falha interna ao criar obra' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const activeTenant = getActiveTenantFromRequest(req);
    const body = await req.json();
    const {
      id,
      nome,
      local,
      tipo_obra,
      valor_diaria_padrao,
      ativo,
      apelidos,
      alias_fornecedor,
      cep_entrega,
      complemento_entrega,
      contato_recebimento,
    } = body;
    const isIntermack = activeTenant.slug === 'intermack';

    if (!id) {
      return NextResponse.json({ error: 'ID da obra é obrigatório' }, { status: 400 });
    }

    const enderecoLimpo = local !== undefined ? String(local).trim() : undefined;
    const aliasFornecedorLimpo =
      alias_fornecedor !== undefined ? String(alias_fornecedor).trim() : undefined;
    const cepLimpo = cep_entrega !== undefined ? String(cep_entrega).trim() : undefined;
    const complementoLimpo =
      complemento_entrega !== undefined ? String(complemento_entrega).trim() : undefined;
    const contatoLimpo =
      contato_recebimento !== undefined ? String(contato_recebimento).trim() : undefined;

    if (isIntermack) {
      if (enderecoLimpo !== undefined && (!enderecoLimpo || enderecoLimpo.toLowerCase() === 'canteiro volante')) {
        return NextResponse.json(
          {
            error:
              'Na Intermack, o Endereço de Entrega completo é obrigatório para o envio de materiais.',
          },
          { status: 400 }
        );
      }
      if (aliasFornecedorLimpo !== undefined && !aliasFornecedorLimpo) {
        return NextResponse.json(
          {
            error:
              'Na Intermack, o Alias (Nome do Cliente p/ Fornecedores) é obrigatório.',
          },
          { status: 400 }
        );
      }
    }

    const payload: Record<string, string | number | boolean> = {};
    if (nome !== undefined) payload.nome = String(nome).trim().toUpperCase();
    if (enderecoLimpo !== undefined) payload.local = enderecoLimpo;
    if (tipo_obra !== undefined) payload.tipo_obra = tipo_obra;
    if (valor_diaria_padrao !== undefined) payload.valor_diaria_padrao = Number(valor_diaria_padrao);
    if (ativo !== undefined) payload.ativo = Boolean(ativo);

    const res = await supabaseAdmin
      .from('obras_config')
      .update(payload)
      .eq('tenant_id', activeTenant.id)
      .eq('id', id)
      .select()
      .single();

    if (res.error) {
      console.error('Erro ao atualizar obra:', res.error);
      return NextResponse.json({ error: res.error.message }, { status: 500 });
    }

    if (
      aliasFornecedorLimpo !== undefined ||
      enderecoLimpo !== undefined ||
      cepLimpo !== undefined ||
      complementoLimpo !== undefined ||
      contatoLimpo !== undefined
    ) {
      const { porObraId } = await lerObrasLogisticaTenant(activeTenant.id);
      const anterior = porObraId[id];
      await salvarObraLogisticaTenant(activeTenant.id, id, {
        obraId: id,
        obraNome: res.data?.nome || anterior?.obraNome || '',
        aliasFornecedor:
          aliasFornecedorLimpo !== undefined
            ? aliasFornecedorLimpo
            : anterior?.aliasFornecedor || '',
        enderecoEntrega:
          enderecoLimpo !== undefined
            ? enderecoLimpo
            : anterior?.enderecoEntrega || res.data?.local || '',
        cepEntrega:
          cepLimpo !== undefined ? cepLimpo : anterior?.cepEntrega || '',
        complementoObservacao:
          complementoLimpo !== undefined
            ? complementoLimpo
            : anterior?.complementoObservacao || '',
        contatoRecebimento:
          contatoLimpo !== undefined
            ? contatoLimpo
            : anterior?.contatoRecebimento || '',
      });
    }

    // Se informou apelidos, salva no storage
    if (Array.isArray(apelidos)) {
      const { obterApelidosSistema, salvarApelidosSistema } = await import('@/services/apelidosStorage');
      const mapa = await obterApelidosSistema();
      mapa.obras[id] = apelidos.map((a: string) => String(a).trim()).filter(Boolean);
      await salvarApelidosSistema(mapa);
    }

    return NextResponse.json({
      success: true,
      obra: {
        ...res.data,
        alias_fornecedor: aliasFornecedorLimpo ?? '',
        cep_entrega: cepLimpo ?? '',
        complemento_entrega: complementoLimpo ?? '',
        contato_recebimento: contatoLimpo ?? '',
      },
    });
  } catch (err) {
    console.error('Erro ao atualizar obra:', err);
    return NextResponse.json({ error: 'Falha interna ao atualizar obra' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const activeTenant = getActiveTenantFromRequest(req);
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID da obra é obrigatório' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('obras_config')
      .update({ ativo: false })
      .eq('tenant_id', activeTenant.id)
      .eq('id', id);

    if (error) {
      console.error('Erro ao inativar obra:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Erro ao inativar obra:', err);
    return NextResponse.json({ error: 'Falha interna' }, { status: 500 });
  }
}
