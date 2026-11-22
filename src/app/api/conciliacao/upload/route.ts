import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getActiveTenantFromRequest } from '@/lib/tenant';
import {
  normalizarNomeObraCanonica,
  normalizarNomeTrabalhadorCanonico,
} from '@/lib/normalizarObra';
import {
  executarMatchingConciliacaoPix,
  type BancoExtratoSuportado,
  type RegistroSistemaConciliacao,
} from '@/services/conciliacaoBancaria';

export const dynamic = 'force-dynamic';

interface ObraRel {
  nome: string | null;
  tipo_obra: string | null;
}

interface LancamentoConciliacaoRow {
  id: string;
  nome_trabalhador: string;
  tipo_lancamento: string;
  valor_monetario: number | string;
  data_referencia: string;
  status: string;
  obras_config: ObraRel | ObraRel[] | null;
}

interface CaixinhaConciliacaoRow {
  id: string;
  encarregado_canonico: string;
  obra_nome: string;
  data_movimentacao: string;
  tipo: string;
  valor: number | string;
  status: string;
}

interface ConciliacaoJsonBody {
  action?: 'analisar' | 'aprovar-match';
  conteudoArquivo?: string;
  nomeArquivo?: string;
  banco?: BancoExtratoSuportado;
  diasJanela?: number;
  // Para ação aprovar-match (1 clique Human-in-the-Loop)
  lancamentoId?: string;
  aprovadoPor?: string;
  fitId?: string;
  dataTransacao?: string;
  valorTransacao?: number;
  descricaoExtrato?: string;
  bancoExtrato?: BancoExtratoSuportado;
}

function extrairObraNome(rel: ObraRel | ObraRel[] | null | undefined): string {
  if (!rel) return 'GERAL';
  const item = Array.isArray(rel) ? rel[0] : rel;
  return normalizarNomeObraCanonica(item?.nome, item?.tipo_obra);
}

export async function POST(req: NextRequest) {
  try {
    const activeTenant = getActiveTenantFromRequest(req);
    const tenantId = activeTenant.id;
    const contentType = req.headers.get('content-type') || '';

    let conteudoArquivo = '';
    let nomeArquivo = 'extrato.csv';
    let banco: BancoExtratoSuportado | undefined = undefined;
    let diasJanela = 30;
    let jsonBody: ConciliacaoJsonBody | null = null;

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file');
      if (file && typeof file !== 'string') {
        nomeArquivo = file.name || 'extrato.csv';
        conteudoArquivo = await file.text();
      }
      const bancoField = formData.get('banco');
      if (typeof bancoField === 'string' && bancoField) {
        banco = bancoField as BancoExtratoSuportado;
      }
    } else {
      jsonBody = (await req.json()) as ConciliacaoJsonBody;

      // Ação 2: Aprovar conciliação em 1 clique (Human-in-the-Loop)
      if (jsonBody.action === 'aprovar-match') {
        if (!jsonBody.lancamentoId) {
          return NextResponse.json(
            { error: 'lancamentoId é obrigatório para aprovar conciliação.' },
            { status: 400 }
          );
        }

        const agoraIso = new Date().toISOString();
        const aprovador = jsonBody.aprovadoPor || 'Patrícia Grubel';

        let resUpd = await supabaseAdmin
          .from('lancamentos_financeiros')
          .update({
            status: 'VALIDADO',
            aprovado_por: aprovador,
            pago_por: aprovador,
            data_hora_envio_efetivo: agoraIso,
            observacao: jsonBody.descricaoExtrato
              ? `Conciliado via Extrato Bancário (${jsonBody.descricaoExtrato})`
              : 'Conciliado via Extrato Bancário OFX/CSV',
            updated_at: agoraIso,
          })
          .eq('tenant_id', tenantId)
          .eq('id', jsonBody.lancamentoId)
          .select('id, nome_trabalhador, valor_monetario, status')
          .single();

        if (resUpd.error) {
          resUpd = await supabaseAdmin
            .from('lancamentos_financeiros')
            .update({
              status: 'VALIDADO',
              observacao: 'Conciliado via Extrato Bancário OFX/CSV',
              updated_at: agoraIso,
            })
            .eq('tenant_id', tenantId)
            .eq('id', jsonBody.lancamentoId)
            .select('id, nome_trabalhador, valor_monetario, status')
            .single();
        }

        if (resUpd.error) {
          return NextResponse.json(
            { error: resUpd.error.message },
            { status: 500 }
          );
        }

        // Best-effort: grava histórico em conciliacao_bancaria_registros se tabela V16 já existir
        try {
          await supabaseAdmin.from('conciliacao_bancaria_registros').insert({
            tenant_id: tenantId,
            banco: jsonBody.bancoExtrato || 'OUTRO',
            arquivo_nome: jsonBody.nomeArquivo || 'extrato',
            fit_id: jsonBody.fitId || null,
            data_transacao:
              jsonBody.dataTransacao || new Date().toISOString().slice(0, 10),
            descricao_extrato:
              jsonBody.descricaoExtrato || 'Saída PIX conciliada',
            valor: Number(jsonBody.valorTransacao || 0),
            status_match: 'APROVADO_MANUAL',
            lancamento_id: jsonBody.lancamentoId,
            aprovado_por: aprovador,
            aprovado_em: agoraIso,
          });
        } catch {
          // Tabela opcional caso migração V16 ainda não tenha sido executada
        }

        return NextResponse.json({
          success: true,
          lancamento: resUpd.data,
          message: 'Conciliação bancária aprovada em 1 clique com sucesso!',
        });
      }

      conteudoArquivo = jsonBody.conteudoArquivo || '';
      nomeArquivo = jsonBody.nomeArquivo || 'extrato.csv';
      banco = jsonBody.banco;
      if (jsonBody.diasJanela && jsonBody.diasJanela > 0) {
        diasJanela = Math.min(90, jsonBody.diasJanela);
      }
    }

    if (!conteudoArquivo.trim()) {
      return NextResponse.json(
        { error: 'Envie um arquivo OFX ou CSV válido do C6 Bank, Itaú ou Santander.' },
        { status: 400 }
      );
    }

    const inicio = new Date();
    inicio.setDate(inicio.getDate() - diasJanela);
    const dataInicioIso = inicio.toLocaleDateString('en-CA', {
      timeZone: 'America/Sao_Paulo',
    });

    // Busca registros financeiros ESTRITAMENTE isolados por tenant_id
    const [{ data: lancs }, { data: cxRows }] = await Promise.all([
      supabaseAdmin
        .from('lancamentos_financeiros')
        .select(
          'id, nome_trabalhador, tipo_lancamento, valor_monetario, data_referencia, status, obras_config ( nome, tipo_obra )'
        )
        .eq('tenant_id', tenantId)
        .neq('status', 'DESCARTADO')
        .gte('data_referencia', dataInicioIso)
        .order('data_referencia', { ascending: false }),
      supabaseAdmin
        .from('caixinha_movimentacoes')
        .select(
          'id, encarregado_canonico, obra_nome, data_movimentacao, tipo, valor, status'
        )
        .eq('tenant_id', tenantId)
        .eq('tipo', 'ENTRADA_PIX')
        .gte('data_movimentacao', dataInicioIso),
    ]);

    const registrosSistema: RegistroSistemaConciliacao[] = [
      ...(((lancs as unknown as LancamentoConciliacaoRow[] | null) || []).map(
        (l) => ({
          id: l.id,
          origem: 'LANCAMENTO_FINANCEIRO' as const,
          tipo: l.tipo_lancamento,
          trabalhador: normalizarNomeTrabalhadorCanonico(l.nome_trabalhador),
          obra: extrairObraNome(l.obras_config),
          data: l.data_referencia,
          valor: Number(l.valor_monetario || 0),
          status: l.status,
        })
      )),
      ...(((cxRows as unknown as CaixinhaConciliacaoRow[] | null) || []).map(
        (c) => ({
          id: c.id,
          origem: 'CAIXINHA' as const,
          tipo: c.tipo,
          trabalhador: normalizarNomeTrabalhadorCanonico(c.encarregado_canonico),
          obra: normalizarNomeObraCanonica(c.obra_nome),
          data: c.data_movimentacao,
          valor: Number(c.valor || 0),
          status: c.status,
        })
      )),
    ];

    const relatorio = executarMatchingConciliacaoPix({
      conteudoArquivo,
      nomeArquivo,
      bancoForcado: banco,
      registrosSistema,
    });

    return NextResponse.json({
      success: true,
      tenant: { id: activeTenant.id, nome: activeTenant.nome },
      relatorio,
    });
  } catch (err: unknown) {
    const msg =
      err instanceof Error ? err.message : 'Erro ao processar conciliação bancária.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
