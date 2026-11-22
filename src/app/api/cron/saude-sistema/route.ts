import { NextRequest, NextResponse } from 'next/server';
import { TENANTS } from '@/lib/tenant';
import {
  obterEstadoSaudeSistema,
  salvarExecucaoLaudoSaude,
  verificarExecucaoCadenciaDevida,
} from '@/services/saudeCadenciaService';
import { executarVarreduraSaudeTenant } from '@/services/saudeSnapshotRunner';

export const dynamic = 'force-dynamic';

/**
 * GET /api/cron/saude-sistema
 * Retorna o status da cadência configurada e próxima execução prevista por tenant.
 */
export async function GET() {
  try {
    const tenantsLista = [TENANTS.jhoston, TENANTS.intermack];
    const statusPorTenant = await Promise.all(
      tenantsLista.map(async (t) => {
        const estado = await obterEstadoSaudeSistema(t.id);
        const ultimaCadencia = estado.historico.find(
          (h) => h.origem === 'CADENCIA'
        );
        const check = verificarExecucaoCadenciaDevida(
          estado.config.cadencia,
          ultimaCadencia?.executadoEmIso || null
        );
        return {
          tenantId: t.id,
          tenantNome: t.nome,
          cadencia: estado.config.cadencia,
          ultimaExecucao: estado.ultimoLaudo?.meta.executadoEmFormatado || null,
          proximaExecucao: estado.proximaExecucaoFormatada,
          execucaoDevidaAgora: check.devida,
          slotAtual: check.slotAtual,
          totalHistorico: estado.historico.length,
        };
      })
    );

    return NextResponse.json({
      success: true,
      fuso: 'America/Sao_Paulo',
      tenants: statusPorTenant,
    });
  } catch (error) {
    console.error('Erro em GET /api/cron/saude-sistema:', error);
    return NextResponse.json(
      { error: 'Falha ao consultar cadência de saúde do sistema.' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/cron/saude-sistema
 * Dispara a varredura agendada de Saúde do Sistema respeitando a cadência configurada
 * individualmente para cada tenant (Jhoston e Intermack), com proteção contra duplicidade no mesmo slot.
 */
export async function POST(req: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const authHeader = req.headers.get('authorization') || '';
      if (authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
      }
    }

    const body = (await req.json().catch(() => ({}))) as {
      forcar?: boolean;
      periodo?: string;
    };
    const forcar = body.forcar === true;
    const periodo = body.periodo || '15d';

    const tenantsLista = [TENANTS.jhoston, TENANTS.intermack];
    const resultados = [];

    for (const t of tenantsLista) {
      const estado = await obterEstadoSaudeSistema(t.id);
      const ultimaCadencia = estado.historico.find(
        (h) => h.origem === 'CADENCIA'
      );
      const check = verificarExecucaoCadenciaDevida(
        estado.config.cadencia,
        ultimaCadencia?.executadoEmIso || null
      );

      if (!forcar && !check.devida) {
        resultados.push({
          tenantId: t.id,
          tenantNome: t.nome,
          executado: false,
          motivo:
            estado.config.cadencia === 'MANUAL'
              ? 'Cadência configurada como Apenas Manual'
              : `Aguardando próximo slot (${estado.proximaExecucaoFormatada || 'N/A'})`,
        });
        continue;
      }

      const { relatorio, totalValesAuditados } =
        await executarVarreduraSaudeTenant(t.id, periodo);

      const salvo = await salvarExecucaoLaudoSaude({
        tenantId: t.id,
        relatorio,
        totalValesAuditados,
        periodo,
        origem: 'CADENCIA',
        executadoPor: `Cadência ${estado.config.cadencia}${check.slotAtual ? ` (${check.slotAtual} BRT)` : ''}`,
      });

      resultados.push({
        tenantId: t.id,
        tenantNome: t.nome,
        executado: true,
        laudoId: salvo.ultimoLaudo.meta.id,
        scoreGeral: salvo.ultimoLaudo.meta.scoreGeral,
        anomaliasAlta: salvo.ultimoLaudo.meta.anomaliasAlta,
        proximaExecucao: salvo.proximaExecucaoFormatada,
      });
    }

    return NextResponse.json({
      success: true,
      executadoEm: new Date().toISOString(),
      resultados,
    });
  } catch (error) {
    console.error('Erro em POST /api/cron/saude-sistema:', error);
    return NextResponse.json(
      { error: 'Falha ao executar cadência agendada de saúde do sistema.' },
      { status: 500 }
    );
  }
}
