import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getActiveTenantFromRequest } from '@/lib/tenant';
import { normalizarNomeTrabalhadorCanonico } from '@/lib/normalizarObra';

import type { TipoQuitacao } from '@/types/database';

interface LiquidarRequestBody {
  lancamentosIds?: string[];
  obraId?: string;
  observacao?: string;
  quitadoPor?: string;
  comprovantePixUrl?: string | null;
  tipoQuitacao?: TipoQuitacao;
}

interface LancamentoLiquidadoRow {
  id: string;
  nome_trabalhador: string;
  tipo_lancamento: string;
  valor_monetario: number | string;
  data_referencia: string;
}

export async function POST(req: NextRequest) {
  try {
    const activeTenant = getActiveTenantFromRequest(req);
    const body = (await req.json()) as LiquidarRequestBody;
    const {
      lancamentosIds,
      observacao = 'Fechamento financeiro encerrado',
      quitadoPor = 'Patrícia Grubel',
      comprovantePixUrl = null,
      tipoQuitacao = 'LIQUIDACAO_BORDERO',
    } = body;

    if (
      !lancamentosIds ||
      !Array.isArray(lancamentosIds) ||
      lancamentosIds.length === 0
    ) {
      return NextResponse.json(
        { error: 'Nenhum lançamento selecionado para liquidação.' },
        { status: 400 }
      );
    }

    const agora = new Date().toISOString();

    // Liquida ESTRITAMENTE os lançamentos selecionados pertencentes ao tenant ativo
    // (marca ciclo_encerrado=true e tipo_quitacao para isolamento absoluto do novo ciclo)
    let resUpdate = await supabaseAdmin
      .from('lancamentos_financeiros')
      .update({
        status: 'LIQUIDADO',
        liquidado_em: agora,
        observacao,
        tipo_quitacao: tipoQuitacao,
        ciclo_encerrado: true,
        aprovado_por: quitadoPor,
        data_hora_envio_efetivo: agora,
        updated_at: agora,
      })
      .eq('tenant_id', activeTenant.id)
      .in('id', lancamentosIds)
      .select('id, nome_trabalhador, tipo_lancamento, valor_monetario, data_referencia');

    if (resUpdate.error) {
      // Fallback caso colunas V15 ainda não tenham sido migradas no banco remoto
      resUpdate = await supabaseAdmin
        .from('lancamentos_financeiros')
        .update({
          status: 'LIQUIDADO',
          liquidado_em: agora,
          observacao,
          updated_at: agora,
        })
        .eq('tenant_id', activeTenant.id)
        .in('id', lancamentosIds)
        .select('id, nome_trabalhador, tipo_lancamento, valor_monetario, data_referencia');
    }

    if (resUpdate.error) {
      throw resUpdate.error;
    }

    const itensLiquidados =
      (resUpdate.data as unknown as LancamentoLiquidadoRow[] | null) || [];

    // Best-effort: registra o corte de ciclo em ciclos_financeiros por trabalhador
    if (itensLiquidados.length > 0) {
      try {
        const porTrabalhador = new Map<
          string,
          { total: number; dataInicio: string; ids: string[] }
        >();
        for (const item of itensLiquidados) {
          const nomeCanonico = normalizarNomeTrabalhadorCanonico(
            item.nome_trabalhador
          );
          const atual = porTrabalhador.get(nomeCanonico) || {
            total: 0,
            dataInicio: item.data_referencia,
            ids: [],
          };
          const valor = Number(item.valor_monetario || 0);
          atual.total += item.tipo_lancamento === 'VALE' ? -valor : valor;
          if (item.data_referencia < atual.dataInicio) {
            atual.dataInicio = item.data_referencia;
          }
          atual.ids.push(item.id);
          porTrabalhador.set(nomeCanonico, atual);
        }

        for (const [nomeCanonico, resumo] of Array.from(
          porTrabalhador.entries()
        )) {
          const { data: cicloCriado } = await supabaseAdmin
            .from('ciclos_financeiros')
            .insert({
              tenant_id: activeTenant.id,
              nome_trabalhador_canonico: nomeCanonico,
              status: 'QUITADO',
              data_inicio: resumo.dataInicio,
              data_corte_quitacao: agora,
              valor_quitado: Math.max(0, Number(resumo.total.toFixed(2))),
              comprovante_pix_url: comprovantePixUrl,
              quitado_por: quitadoPor,
              observacao,
              tipo_quitacao: tipoQuitacao,
              ciclo_encerrado: true,
            })
            .select('id')
            .single();

          if (cicloCriado?.id) {
            await supabaseAdmin
              .from('lancamentos_financeiros')
              .update({ ciclo_id: cicloCriado.id })
              .eq('tenant_id', activeTenant.id)
              .in('id', resumo.ids);
          }
        }
      } catch (cicloErr) {
        console.warn(
          '[LIQUIDAR] Tabela ciclos_financeiros ainda não migrada ou opcional:',
          cicloErr
        );
      }
    }

    return NextResponse.json({
      success: true,
      message: `${itensLiquidados.length} lançamento(s) liquidado(s) com sucesso! Novos apontamentos futuros abrirão ciclo independente.`,
      liquidadoEm: agora,
      quantidadeLiquidada: itensLiquidados.length,
      notificacoesEspelho: [
        {
          destinatario: 'Patrícia Grubel',
          telefone: '5511978543369',
          mensagem: `💰 *Fechamento Financeiro Liquidado (${activeTenant.nome})!*\n${itensLiquidados.length} lançamento(s) baixado(s) com sucesso.`,
        },
        {
          destinatario: 'Daniel Lopes',
          telefone: '5511988139833',
          mensagem: `💰 *Fechamento Financeiro Liquidado (${activeTenant.nome})!*\n${itensLiquidados.length} lançamento(s) baixado(s) com sucesso.`,
        },
      ],
    });
  } catch (error) {
    console.error('Erro ao liquidar lançamentos:', error);
    return NextResponse.json(
      { error: 'Falha ao processar liquidação da semana.' },
      { status: 500 }
    );
  }
}

