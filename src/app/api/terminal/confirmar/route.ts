import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getActiveTenantFromRequest } from '@/lib/tenant';
import { normalizarNomeObraCanonica } from '@/lib/normalizarObra';
import { calcularValorDiariaCanteiro } from '@/services/calculoDiarias';
import type { NLPExtracaoResponse } from '@/types/database';
import crypto from 'crypto';

interface ConfirmarTerminalBody {
  extracao: NLPExtracaoResponse;
  mensagemOriginal: string;
  usuarioLogado?: string;
}

export async function POST(req: NextRequest) {
  try {
    const activeTenant = getActiveTenantFromRequest(req);
    const tenantId = activeTenant.id;
    const body = (await req.json()) as ConfirmarTerminalBody;
    const { extracao, mensagemOriginal, usuarioLogado = 'Patrícia Grubel' } = body;

    if (!extracao?.obras || extracao.obras.length === 0) {
      return NextResponse.json(
        { error: 'Nenhuma obra encontrada para enviar à validação.' },
        { status: 400 }
      );
    }

    const hojeBR = new Date().toLocaleDateString('en-CA', {
      timeZone: 'America/Sao_Paulo',
    });
    const agoraBR = new Date().toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
    });

    let totalPontos = 0;
    let totalVales = 0;
    const lotesCriados: string[] = [];

    for (const obra of extracao.obras) {
      const nomeObraCanonica = normalizarNomeObraCanonica(obra.nome_obra);
      const dataRef = obra.data_referencia || hojeBR;

      // 1. Localizar ou criar obra no tenant ativo
      let obraId: string | null = null;
      const { data: obraExistente } = await supabaseAdmin
        .from('obras_config')
        .select('id')
        .eq('tenant_id', tenantId)
        .ilike('nome', `%${nomeObraCanonica}%`)
        .limit(1)
        .maybeSingle();

      if (obraExistente?.id) {
        obraId = obraExistente.id;
      } else {
        const { data: novaObra } = await supabaseAdmin
          .from('obras_config')
          .insert({
            tenant_id: tenantId,
            nome: nomeObraCanonica,
            local: activeTenant.slug === 'intermack' ? 'Reforma Interna (Apto)' : 'Canteiro de Obras',
            tipo_obra: activeTenant.slug === 'intermack' ? 'OBRA_CIVIL' : 'PISCINA',
          })
          .select('id')
          .single();
        obraId = novaObra?.id || null;
      }

      // 2. Criar ponto_lote com cabeçalho pericial
      const tokenAprovacao = crypto.randomBytes(24).toString('hex');
      const sha256 = crypto
        .createHash('sha256')
        .update(`${usuarioLogado}|TERMINAL_WEB|${mensagemOriginal}|${agoraBR}`)
        .digest('hex');

      const cabecalho =
        `[ORIGEM_WHATSAPP]\n` +
        `Remetente: Terminal IA (${usuarioLogado})\n` +
        `Grupo/JID: web-terminal-${activeTenant.slug}\n` +
        `Timestamp: ${agoraBR}\n` +
        `SHA256: ${sha256}\n` +
        `[MENSAGEM_ORIGINAL]\n${mensagemOriginal}`;

      const { data: lote } = await supabaseAdmin
        .from('ponto_lote')
        .insert({
          tenant_id: tenantId,
          obra_id: obraId,
          data_referencia: dataRef,
          texto_original: cabecalho,
          status_validacao: 'PENDENTE',
          token_aprovacao: tokenAprovacao,
        })
        .select('id')
        .single();

      const loteId = lote?.id || null;
      if (loteId) lotesCriados.push(loteId);

      // 3. Registrar apontamentos (PONTO)
      if (loteId && obra.apontamentos?.length) {
        for (const ap of obra.apontamentos) {
          const fracao = Number(ap.fracao ?? 1.0);
          if (activeTenant.modo === 'EMPREITA' && fracao <= 0) continue;

          const calculo = await calcularValorDiariaCanteiro({
            tenantId,
            nomeTrabalhador: ap.nome,
            obraId,
            nomeObra: nomeObraCanonica,
            fracao,
            motivo: ap.motivo,
          });

          await supabaseAdmin.from('ponto_detalhe').insert({
            tenant_id: tenantId,
            ponto_lote_id: loteId,
            nome_trabalhador: ap.nome,
            fracao_dia: fracao,
            motivo_excecao: ap.motivo || null,
          });

          await supabaseAdmin.from('lancamentos_financeiros').insert({
            tenant_id: tenantId,
            obra_id: obraId,
            nome_trabalhador: ap.nome,
            tipo_lancamento: 'PONTO',
            fracao_dia: fracao,
            valor_monetario: activeTenant.modo === 'EMPREITA' ? 0 : calculo.valorFinal,
            status: 'PENDENTE',
            data_referencia: dataRef,
            observacao: ap.motivo ? `${ap.motivo} | Terminal IA` : 'Terminal IA (De Acordo)',
            ponto_lote_id: loteId,
          });
          totalPontos++;
        }
      }

      // 4. Registrar vales (VALE)
      if (obra.vales?.length) {
        for (const vale of obra.vales) {
          await supabaseAdmin.from('lancamentos_financeiros').insert({
            tenant_id: tenantId,
            obra_id: obraId,
            nome_trabalhador: vale.nome,
            tipo_lancamento: 'VALE',
            fracao_dia: 0,
            valor_monetario: Number(vale.valor || 0),
            status: 'PENDENTE',
            data_referencia: dataRef,
            observacao: 'Vale lançado via Assistente IA (De Acordo)',
            ponto_lote_id: loteId,
          });
          totalVales++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      lotesCriados,
      totalPontos,
      totalVales,
      message: `Enviado para a fila de Validação (${totalPontos} ponto(s) e ${totalVales} vale(s)).`,
    });
  } catch (error) {
    console.error('Erro em POST /api/terminal/confirmar:', error);
    return NextResponse.json(
      { error: 'Falha ao enviar rascunho para validação.' },
      { status: 500 }
    );
  }
}
