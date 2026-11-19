import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getActiveTenantFromRequest } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const activeTenant = getActiveTenantFromRequest(req);
    // Tenta selecionar com as novas colunas; se o banco ainda não rodou a migration, faz fallback seguro
    let { data, error } = await supabaseAdmin
      .from('funcionarios_obra')
      .select(`
        id,
        nome_trabalhador,
        chave_pix,
        telefone,
        obra_id,
        funcao,
        is_encarregado,
        valor_diaria,
        valor_diaria_obra,
        valor_diaria_piscina,
        regime_remuneracao,
        ciclo_pagamento,
        valor_base_contratual,
        ativo,
        obras_config (
          nome
        )
      `)
      .eq('tenant_id', activeTenant.id)
      .eq('ativo', true)
      .order('nome_trabalhador', { ascending: true });

    if (error && (error.code === '42703' || error.message?.includes('is_encarregado') || error.message?.includes('regime_remuneracao'))) {
      // Fallback sem as colunas novas caso a migration ainda não tenha sido executada no Supabase
      const fallback = await supabaseAdmin
        .from('funcionarios_obra')
        .select(`
          id,
          nome_trabalhador,
          chave_pix,
          telefone,
          obra_id,
          funcao,
          valor_diaria,
          ativo,
          obras_config (
            nome
          )
        `)
        .eq('tenant_id', activeTenant.id)
        .order('nome_trabalhador', { ascending: true });
      
      data = fallback.data as any;
      error = fallback.error;
    }

    if (error) {
      console.error('Erro ao listar funcionários:', error);
      return NextResponse.json({ funcionarios: [] }, { status: 500 });
    }

    return NextResponse.json({ funcionarios: data || [] });
  } catch (err) {
    console.error('Erro na rota /api/funcionarios:', err);
    return NextResponse.json({ funcionarios: [] }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const activeTenant = getActiveTenantFromRequest(req);
    const body = await req.json();
    const {
      nome_trabalhador,
      chave_pix,
      telefone,
      obra_id,
      valor_diaria,
      is_encarregado = false,
      regime_remuneracao = 'DIARISTA',
      ciclo_pagamento = 'QUINZENAL',
      valor_base_contratual,
      funcao = 'OPERACIONAL',
      apelidos,
    } = body;
    const tenant_id = activeTenant.id;

    if (!nome_trabalhador || !chave_pix) {
      return NextResponse.json({ error: 'Nome e Chave PIX são obrigatórios' }, { status: 400 });
    }

    const payload: Record<string, any> = {
      tenant_id,
      nome_trabalhador: String(nome_trabalhador).trim(),
      chave_pix: String(chave_pix).trim(),
      telefone: telefone ? String(telefone).trim() : null,
      obra_id: obra_id || null,
      is_encarregado: Boolean(is_encarregado),
      valor_diaria: Number(valor_diaria) || 150,
      regime_remuneracao,
      ciclo_pagamento,
      valor_base_contratual: Number(valor_base_contratual || valor_diaria || 0),
      funcao: funcao || 'OPERACIONAL',
      ativo: true,
    };

    const res = await supabaseAdmin
      .from('funcionarios_obra')
      .insert(payload)
      .select(`
        id,
        nome_trabalhador,
        chave_pix,
        telefone,
        obra_id,
        funcao,
        is_encarregado,
        valor_diaria,
        valor_diaria_obra,
        valor_diaria_piscina,
        regime_remuneracao,
        ciclo_pagamento,
        valor_base_contratual,
        ativo,
        obras_config (
          nome
        )
      `)
      .single();

    if (res.error) {
      console.error('Erro ao inserir funcionário:', res.error);
      return NextResponse.json({ error: res.error.message }, { status: 500 });
    }

    // Se informou apelidos, salva no storage
    if (res.data?.id && Array.isArray(apelidos) && apelidos.length > 0) {
      const { obterApelidosSistema, salvarApelidosSistema } = await import('@/services/apelidosStorage');
      const mapa = await obterApelidosSistema();
      mapa.funcionarios[res.data.id] = apelidos.map((a: string) => String(a).trim()).filter(Boolean);
      await salvarApelidosSistema(mapa);
    }

    return NextResponse.json({ success: true, funcionario: res.data });
  } catch (err) {
    console.error('Erro ao criar funcionário:', err);
    return NextResponse.json({ error: 'Falha interna ao criar funcionário' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      id,
      nome_trabalhador,
      chave_pix,
      telefone,
      obra_id,
      valor_diaria,
      valor_diaria_obra,
      valor_diaria_piscina,
      is_encarregado,
      regime_remuneracao,
      ciclo_pagamento,
      valor_base_contratual,
      funcao,
      ativo,
      apelidos,
    } = body;

    if (!id) {
      return NextResponse.json({ error: 'ID do funcionário é obrigatório' }, { status: 400 });
    }

    const payload: Record<string, any> = {};
    if (nome_trabalhador !== undefined) payload.nome_trabalhador = String(nome_trabalhador).trim();
    if (chave_pix !== undefined) payload.chave_pix = String(chave_pix).trim();
    if (telefone !== undefined) payload.telefone = telefone ? String(telefone).trim() : null;
    if (obra_id !== undefined) payload.obra_id = obra_id || null;
    if (valor_diaria !== undefined) payload.valor_diaria = Number(valor_diaria) || 150;
    if (valor_diaria_obra !== undefined) payload.valor_diaria_obra = valor_diaria_obra !== null ? Number(valor_diaria_obra) : null;
    if (valor_diaria_piscina !== undefined) payload.valor_diaria_piscina = valor_diaria_piscina !== null ? Number(valor_diaria_piscina) : null;
    if (is_encarregado !== undefined) payload.is_encarregado = Boolean(is_encarregado);
    if (regime_remuneracao !== undefined) payload.regime_remuneracao = regime_remuneracao;
    if (ciclo_pagamento !== undefined) payload.ciclo_pagamento = ciclo_pagamento;
    if (valor_base_contratual !== undefined) payload.valor_base_contratual = Number(valor_base_contratual);
    if (funcao !== undefined) payload.funcao = funcao;
    if (ativo !== undefined) payload.ativo = Boolean(ativo);

    const res = await supabaseAdmin
      .from('funcionarios_obra')
      .update(payload)
      .eq('id', id)
      .select(`
        id,
        nome_trabalhador,
        chave_pix,
        telefone,
        obra_id,
        funcao,
        is_encarregado,
        valor_diaria,
        valor_diaria_obra,
        valor_diaria_piscina,
        regime_remuneracao,
        ciclo_pagamento,
        valor_base_contratual,
        ativo,
        obras_config (
          nome
        )
      `)
      .single();

    if (res.error) {
      console.error('Erro ao atualizar funcionário:', res.error);
      return NextResponse.json({ error: res.error.message }, { status: 500 });
    }

    // Se informou apelidos, atualiza no storage
    if (Array.isArray(apelidos)) {
      const { obterApelidosSistema, salvarApelidosSistema } = await import('@/services/apelidosStorage');
      const mapa = await obterApelidosSistema();
      mapa.funcionarios[id] = apelidos.map((a: string) => String(a).trim()).filter(Boolean);
      await salvarApelidosSistema(mapa);
    }

    return NextResponse.json({ success: true, funcionario: res.data });
  } catch (err) {
    console.error('Erro ao atualizar funcionário:', err);
    return NextResponse.json({ error: 'Falha interna ao atualizar funcionário' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const transferirParaId = searchParams.get('transferirParaId');
    const force = searchParams.get('force') === 'true';

    if (!id) {
      return NextResponse.json({ error: 'ID do funcionário é obrigatório' }, { status: 400 });
    }

    // 1. Buscar dados do funcionário a ser excluído
    const { data: funcAlvo, error: errAlvo } = await supabaseAdmin
      .from('funcionarios_obra')
      .select('id, nome_trabalhador')
      .eq('id', id)
      .single();

    if (errAlvo || !funcAlvo) {
      return NextResponse.json({ error: 'Colaborador não encontrado' }, { status: 404 });
    }

    const nomeAlvo = funcAlvo.nome_trabalhador;

    // 2. Verificar se existem apontamentos vinculados (pontos e vales)
    const [resLanc, resDetalhes] = await Promise.all([
      supabaseAdmin
        .from('lancamentos_financeiros')
        .select('id, tipo_lancamento, valor_monetario, status')
        .or(`nome_trabalhador.eq."${nomeAlvo}",nome_trabalhador.ilike."%${nomeAlvo}%"`),
      supabaseAdmin
        .from('ponto_detalhe')
        .select('id')
        .ilike('nome_trabalhador', `%${nomeAlvo}%`),
    ]);

    const totalLancamentos = (resLanc.data || []).length;
    const totalDetalhes = (resDetalhes.data || []).length;
    const totalApontamentos = totalLancamentos + totalDetalhes;

    // 3. Se houver apontamentos e não foi solicitado transferir nem force
    if (totalApontamentos > 0 && !transferirParaId && !force) {
      const pontos = (resLanc.data || []).filter((l) => l.tipo_lancamento === 'PONTO').length;
      const vales = (resLanc.data || []).filter((l) => l.tipo_lancamento === 'VALE').length;

      return NextResponse.json({
        temVinculos: true,
        totalApontamentos,
        pontos,
        vales,
        mensagem: `O colaborador "${nomeAlvo}" possui ${totalApontamentos} registro(s) vinculado(s) (${pontos} diárias e ${vales} vales). Deseja transferir esses registros para outro colaborador antes de excluir?`,
      });
    }

    // 4. Se informou transferirParaId, reatribui todos os apontamentos para o novo colaborador
    if (transferirParaId) {
      const { data: funcDestino } = await supabaseAdmin
        .from('funcionarios_obra')
        .select('id, nome_trabalhador')
        .eq('id', transferirParaId)
        .single();

      if (!funcDestino) {
        return NextResponse.json({ error: 'Colaborador de destino não encontrado' }, { status: 404 });
      }

      const nomeDestino = funcDestino.nome_trabalhador;

      // Atualiza lancamentos_financeiros
      await supabaseAdmin
        .from('lancamentos_financeiros')
        .update({ nome_trabalhador: nomeDestino })
        .or(`nome_trabalhador.eq."${nomeAlvo}",nome_trabalhador.ilike."%${nomeAlvo}%"`);

      // Atualiza ponto_detalhe
      await supabaseAdmin
        .from('ponto_detalhe')
        .update({ nome_trabalhador: nomeDestino })
        .ilike('nome_trabalhador', `%${nomeAlvo}%`);
    }

    // 5. Inativa o colaborador (Soft Delete pericial)
    const { error } = await supabaseAdmin
      .from('funcionarios_obra')
      .update({ ativo: false })
      .eq('id', id);

    if (error) {
      console.error('Erro ao inativar funcionário:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      mensagem: transferirParaId
        ? `Colaborador inativado e registros transferidos com sucesso.`
        : `Colaborador inativado com sucesso.`,
    });
  } catch (err) {
    console.error('Erro ao excluir/inativar funcionário:', err);
    return NextResponse.json({ error: 'Falha interna' }, { status: 500 });
  }
}
