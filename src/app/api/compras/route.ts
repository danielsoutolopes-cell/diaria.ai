import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase';
import { getActiveTenantFromRequest } from '@/lib/tenant';
import {
  agruparItensCompraComGemini,
  formatarMensagemPedidoWhatsApp,
  type DadosEntregaPedido,
  type PedidoCompraRecord,
  type StatusPedidoCompra,
} from '@/services/pedidosComprasNlp';
import {
  buscarLogisticaPorNomeObra,
  lerObrasLogisticaTenant,
} from '@/services/obrasLogisticaStorage';

export const dynamic = 'force-dynamic';

const TELEFONE_PATRICIA = '5511978543369';
const TELEFONE_DANIEL = '5511988139833';

interface ComprasPostBody {
  action?: 'gerar' | 'atualizar-status' | 'reenviar-patricia';
  obraNome?: string;
  textoOriginal?: string;
  solicitadoPor?: string;
  enviarWhatsappPatricia?: boolean;
  pedidoId?: string;
  status?: StatusPedidoCompra;
}

interface TenantFlagRow {
  modulo_compras_ativo: boolean | null;
}

interface ObraSimpleRow {
  id: string;
  nome: string;
  local: string | null;
}

async function verificarModuloComprasAtivo(
  tenantId: string,
  fallbackFlag: boolean
): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin
      .from('tenants')
      .select('modulo_compras_ativo')
      .eq('id', tenantId)
      .maybeSingle();

    if (!error && data) {
      const row = data as unknown as TenantFlagRow;
      if (typeof row.modulo_compras_ativo === 'boolean') {
        return row.modulo_compras_ativo;
      }
    }
  } catch {
    // Fallback para configuração local do tenant
  }
  return fallbackFlag;
}

async function lerPedidosComprasTenant(tenantId: string): Promise<{
  paramId: string | null;
  configs: Record<string, unknown>;
  pedidos: PedidoCompraRecord[];
}> {
  const { data } = await supabaseAdmin
    .from('parametros_sistema')
    .select('id, configuracoes')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  const configs =
    (data?.configuracoes as Record<string, unknown> | null) || {};
  const pedidos = Array.isArray(configs.pedidos_compras)
    ? (configs.pedidos_compras as PedidoCompraRecord[])
    : [];

  return {
    paramId: data?.id || null,
    configs,
    pedidos,
  };
}

async function salvarPedidosComprasTenant(
  tenantId: string,
  paramId: string | null,
  configs: Record<string, unknown>,
  pedidos: PedidoCompraRecord[]
): Promise<void> {
  const novasConfigs = {
    ...configs,
    pedidos_compras: pedidos.slice(0, 150),
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

async function enviarPedidoParaPatriciaWhatsApp(
  mensagem: string
): Promise<{ enviadoPatricia: boolean; enviadoDaniel: boolean }> {
  let enviadoPatricia = false;
  let enviadoDaniel = false;

  for (const alvo of [
    { tipo: 'patricia', phone: TELEFONE_PATRICIA },
    { tipo: 'daniel', phone: TELEFONE_DANIEL },
  ]) {
    try {
      const res = await fetch('http://127.0.0.1:3001/send-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: alvo.phone, message: mensagem }),
      });
      if (res.ok) {
        if (alvo.tipo === 'patricia') enviadoPatricia = true;
        else enviadoDaniel = true;
      }
    } catch {
      // Baileys desconectado — retorna false sem quebrar a criação do pedido
    }
  }

  return { enviadoPatricia, enviadoDaniel };
}

export async function GET(req: NextRequest) {
  try {
    const activeTenant = getActiveTenantFromRequest(req);
    const moduloComprasAtivo = await verificarModuloComprasAtivo(
      activeTenant.id,
      activeTenant.moduloComprasAtivo
    );

    const [{ pedidos }, { data: obrasData }, { porObraId }] = await Promise.all([
      lerPedidosComprasTenant(activeTenant.id),
      supabaseAdmin
        .from('obras_config')
        .select('id, nome, local')
        .eq('tenant_id', activeTenant.id)
        .eq('ativo', true)
        .order('nome', { ascending: true }),
      lerObrasLogisticaTenant(activeTenant.id),
    ]);

    const obrasRows = (obrasData as ObraSimpleRow[] | null) || [];
    const obras = obrasRows.map((o) => o.nome);
    const obrasDetalhes = obrasRows.map((o) => {
      const log = porObraId[o.id];
      const endereco =
        log?.enderecoEntrega ||
        (o.local && o.local !== 'Canteiro Volante' ? o.local : '');
      const alias = log?.aliasFornecedor || '';
      return {
        id: o.id,
        nome: o.nome,
        aliasFornecedor: alias,
        enderecoEntrega: endereco,
        cepEntrega: log?.cepEntrega || '',
        complementoObservacao: log?.complementoObservacao || '',
        contatoRecebimento: log?.contatoRecebimento || '',
        cadastroCompleto: Boolean(alias && endereco),
      };
    });

    return NextResponse.json({
      success: true,
      tenant: {
        id: activeTenant.id,
        slug: activeTenant.slug,
        nome: activeTenant.nome,
        razaoSocial: activeTenant.razaoSocial,
      },
      moduloComprasAtivo,
      obras,
      obrasDetalhes,
      pedidos: pedidos.sort((a, b) => b.criadoEm.localeCompare(a.criadoEm)),
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Erro ao carregar pedidos de compra.';
    console.error('[COMPRAS][GET] Erro:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const activeTenant = getActiveTenantFromRequest(req);
    const moduloComprasAtivo = await verificarModuloComprasAtivo(
      activeTenant.id,
      activeTenant.moduloComprasAtivo
    );

    if (!moduloComprasAtivo) {
      return NextResponse.json(
        {
          error: `Módulo de Pedidos de Compras está em standby para ${activeTenant.nome} (modulo_compras_ativo = false). Alterne para Intermack para utilizar.`,
          standby: true,
        },
        { status: 403 }
      );
    }

    const body = (await req.json()) as ComprasPostBody;
    const action = body.action || 'gerar';
    const { paramId, configs, pedidos } = await lerPedidosComprasTenant(
      activeTenant.id
    );

    if (action === 'atualizar-status') {
      if (!body.pedidoId || !body.status) {
        return NextResponse.json(
          { error: 'pedidoId e status são obrigatórios.' },
          { status: 400 }
        );
      }

      const agoraIso = new Date().toISOString();
      const atualizados = pedidos.map((p) =>
        p.id === body.pedidoId
          ? { ...p, status: body.status!, atualizadoEm: agoraIso }
          : p
      );

      await salvarPedidosComprasTenant(
        activeTenant.id,
        paramId,
        configs,
        atualizados
      );

      return NextResponse.json({
        success: true,
        pedidos: atualizados.sort((a, b) => b.criadoEm.localeCompare(a.criadoEm)),
      });
    }

    if (action === 'reenviar-patricia') {
      const pedido = pedidos.find((p) => p.id === body.pedidoId);
      if (!pedido) {
        return NextResponse.json(
          { error: 'Pedido não encontrado.' },
          { status: 404 }
        );
      }

      const envio = await enviarPedidoParaPatriciaWhatsApp(
        pedido.mensagemFormatada
      );
      const agoraIso = new Date().toISOString();
      const atualizados: PedidoCompraRecord[] = pedidos.map((p) =>
        p.id === pedido.id
          ? {
              ...p,
              enviadoWhatsAppPatricia:
                p.enviadoWhatsAppPatricia || envio.enviadoPatricia,
              status:
                envio.enviadoPatricia && p.status === 'NOVO'
                  ? 'ENVIADO_PATRICIA'
                  : p.status,
              atualizadoEm: agoraIso,
            }
          : p
      );

      await salvarPedidosComprasTenant(
        activeTenant.id,
        paramId,
        configs,
        atualizados
      );

      return NextResponse.json({
        success: envio.enviadoPatricia,
        enviadoPatricia: envio.enviadoPatricia,
        message: envio.enviadoPatricia
          ? 'Pedido formatado enviado no WhatsApp da Patrícia!'
          : 'WhatsApp (Baileys) desconectado no momento. Use o botão Copiar Mensagem.',
        pedidos: atualizados.sort((a, b) => b.criadoEm.localeCompare(a.criadoEm)),
      });
    }

    // Ação principal: gerar pedido agrupado por categoria via Gemini
    const textoOriginal = (body.textoOriginal || '').trim();
    const obraNome = (body.obraNome || 'Obra Geral').trim();
    const solicitadoPor = (body.solicitadoPor || 'Equipe de Campo').trim();

    if (!textoOriginal) {
      return NextResponse.json(
        { error: 'Informe a lista de materiais solicitada pela obra.' },
        { status: 400 }
      );
    }

    const { itens, motor } = await agruparItensCompraComGemini(
      textoOriginal,
      obraNome
    );

    if (itens.length === 0) {
      return NextResponse.json(
        {
          error:
            'Nenhum item de material pôde ser identificado na mensagem informada.',
        },
        { status: 400 }
      );
    }

    const agora = new Date();
    const dataHoraLabel = agora.toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
    });

    const logisticaObra = await buscarLogisticaPorNomeObra(
      activeTenant.id,
      obraNome
    );
    const dadosEntrega: DadosEntregaPedido | undefined = logisticaObra
      ? {
          aliasFornecedor: logisticaObra.aliasFornecedor,
          enderecoEntrega: logisticaObra.enderecoEntrega,
          cepEntrega: logisticaObra.cepEntrega,
          complementoObservacao: logisticaObra.complementoObservacao,
          contatoRecebimento: logisticaObra.contatoRecebimento,
        }
      : undefined;

    const mensagemFormatada = formatarMensagemPedidoWhatsApp({
      empresaNome: activeTenant.nome,
      obraNome,
      solicitadoPor,
      dataHoraLabel,
      itens,
      dadosEntrega,
    });

    let enviadoPatricia = false;
    if (body.enviarWhatsappPatricia !== false) {
      const envio = await enviarPedidoParaPatriciaWhatsApp(mensagemFormatada);
      enviadoPatricia = envio.enviadoPatricia;
    }

    const novoPedido: PedidoCompraRecord = {
      id: `pc-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
      tenantId: activeTenant.id,
      empresaNome: activeTenant.nome,
      obraNome,
      dadosEntrega,
      grupoJid: null,
      solicitadoPor,
      textoOriginal,
      itens,
      mensagemFormatada,
      status: enviadoPatricia ? 'ENVIADO_PATRICIA' : 'NOVO',
      enviadoWhatsAppPatricia: enviadoPatricia,
      criadoEm: agora.toISOString(),
      atualizadoEm: agora.toISOString(),
    };

    const novosPedidos = [novoPedido, ...pedidos];
    await salvarPedidosComprasTenant(
      activeTenant.id,
      paramId,
      configs,
      novosPedidos
    );

    return NextResponse.json({
      success: true,
      motor,
      pedido: novoPedido,
      enviadoPatricia,
      pedidos: novosPedidos,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Erro ao processar pedido de compra.';
    console.error('[COMPRAS][POST] Erro:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
