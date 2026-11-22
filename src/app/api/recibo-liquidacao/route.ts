import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getActiveTenantFromRequest } from '@/lib/tenant';
import {
  normalizarNomeObraCanonica,
  normalizarNomeTrabalhadorCanonico,
} from '@/lib/normalizarObra';
import {
  gerarPdfReciboLiquidacao,
  type ItemReciboLiquidacao,
} from '@/lib/pdfReciboLiquidacao';
import { uploadToR2 } from '@/services/r2Storage';

export const dynamic = 'force-dynamic';

interface ObraRel {
  nome: string | null;
  tipo_obra: string | null;
}

interface LancamentoReciboRow {
  id: string;
  nome_trabalhador: string;
  tipo_lancamento: string;
  fracao_dia: number | string | null;
  valor_monetario: number | string | null;
  data_referencia: string;
  observacao: string | null;
  obras_config: ObraRel | ObraRel[] | null;
}

interface FuncionarioReciboRow {
  nome_trabalhador: string;
  chave_pix: string | null;
  telefone: string | null;
}

interface ReciboRequestBody {
  action?: 'gerar' | 'enviar-whatsapp';
  nomeTrabalhador?: string;
  chavePix?: string;
  quitadoPor?: string;
  observacao?: string;
  lancamentosIds?: string[];
  itens?: ItemReciboLiquidacao[];
  // Campos exclusivos da ação opcional enviar-whatsapp
  telefone?: string;
  pdfBase64?: string;
  fileName?: string;
  resumoTextoWhatsApp?: string;
  reciboUrl?: string;
}

function extrairObra(rel: ObraRel | ObraRel[] | null | undefined): ObraRel {
  if (!rel) return { nome: null, tipo_obra: null };
  return Array.isArray(rel) ? rel[0] || { nome: null, tipo_obra: null } : rel;
}

function formatarTelefoneBR(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('55') && digits.length >= 12) return digits;
  return `55${digits}`;
}

export async function POST(req: NextRequest) {
  try {
    const activeTenant = getActiveTenantFromRequest(req);
    const body = (await req.json()) as ReciboRequestBody;
    const action = body.action || 'gerar';

    // AÇÃO OPCIONAL (Human-in-the-Loop): Envio explícito do recibo no WhatsApp do colaborador
    if (action === 'enviar-whatsapp') {
      const telefoneLimpo = formatarTelefoneBR(body.telefone || '');
      if (!telefoneLimpo || telefoneLimpo.length < 12) {
        return NextResponse.json(
          {
            error:
              'Telefone do colaborador não informado ou inválido (informe DDD + número).',
          },
          { status: 400 }
        );
      }
      if (!body.pdfBase64 && !body.resumoTextoWhatsApp) {
        return NextResponse.json(
          { error: 'Conteúdo do recibo não fornecido para envio.' },
          { status: 400 }
        );
      }

      const legenda = [
        body.resumoTextoWhatsApp || 'Segue seu Comprovante Detalhado de Liquidação PIX.',
        body.reciboUrl ? `\n🔗 PDF Oficial (R2): ${body.reciboUrl}` : '',
      ]
        .filter(Boolean)
        .join('\n');

      // 1. Tenta enviar o PDF nativamente via Baileys /send-document
      if (body.pdfBase64) {
        try {
          const docRes = await fetch('http://127.0.0.1:3001/send-document', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              phone: telefoneLimpo,
              base64: body.pdfBase64,
              fileName: body.fileName || 'recibo-liquidacao-pix.pdf',
              mimetype: 'application/pdf',
              caption: legenda,
            }),
          });
          if (docRes.ok) {
            return NextResponse.json({
              success: true,
              modoEnvio: 'DOCUMENTO_PDF',
              telefone: telefoneLimpo,
              message: 'Recibo PDF enviado diretamente no WhatsApp do colaborador.',
            });
          }
        } catch {
          // Fallback para mensagem de texto com link R2 abaixo
        }
      }

      // 2. Fallback para mensagem de texto com link do recibo salvo no R2
      try {
        const txtRes = await fetch('http://127.0.0.1:3001/send-message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: telefoneLimpo,
            message: legenda,
          }),
        });
        if (txtRes.ok) {
          return NextResponse.json({
            success: true,
            modoEnvio: 'TEXTO_LINK_R2',
            telefone: telefoneLimpo,
            message: 'Resumo e link do recibo enviados no WhatsApp do colaborador.',
          });
        }
      } catch {
        // Baileys desconectado
      }

      return NextResponse.json(
        {
          success: false,
          whatsappDesconectado: true,
          error:
            'WhatsApp (Baileys) desconectado no momento. O recibo continua salvo no R2 e disponível para download/impressão ou envio manual.',
        },
        { status: 503 }
      );
    }

    // AÇÃO PRINCIPAL: Gerar Comprovante Detalhado Individual de Liquidação PIX + Salvar no R2
    if (!body.nomeTrabalhador) {
      return NextResponse.json(
        { error: 'nomeTrabalhador é obrigatório para gerar o recibo.' },
        { status: 400 }
      );
    }

    const nomeCanonico = normalizarNomeTrabalhadorCanonico(body.nomeTrabalhador);
    let itensRecibo: ItemReciboLiquidacao[] = Array.isArray(body.itens)
      ? body.itens
      : [];

    // Caso lancamentosIds sejam informados, consulta diretamente no banco isolado por tenant_id
    if (
      itensRecibo.length === 0 &&
      Array.isArray(body.lancamentosIds) &&
      body.lancamentosIds.length > 0
    ) {
      const { data: rows, error } = await supabaseAdmin
        .from('lancamentos_financeiros')
        .select(`
          id,
          nome_trabalhador,
          tipo_lancamento,
          fracao_dia,
          valor_monetario,
          data_referencia,
          observacao,
          obras_config (
            nome,
            tipo_obra
          )
        `)
        .eq('tenant_id', activeTenant.id)
        .in('id', body.lancamentosIds)
        .order('data_referencia', { ascending: true });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      itensRecibo = (
        (rows as unknown as LancamentoReciboRow[] | null) || []
      ).map((r) => {
        const obraRel = extrairObra(r.obras_config);
        return {
          data: r.data_referencia,
          obra: normalizarNomeObraCanonica(obraRel.nome, obraRel.tipo_obra),
          tipo: r.tipo_lancamento === 'VALE' ? 'VALE' : 'PONTO',
          fracao: Number(r.fracao_dia || 1),
          valor: Number(r.valor_monetario || 0),
          descricao: r.observacao || 'Lançamento validado',
        };
      });
    }

    if (itensRecibo.length === 0) {
      return NextResponse.json(
        { error: 'Nenhum lançamento encontrado para compor o recibo PIX.' },
        { status: 400 }
      );
    }

    // Busca chave PIX e telefone cadastrados do trabalhador (isolados por tenant_id)
    const { data: funcs } = await supabaseAdmin
      .from('funcionarios_obra')
      .select('nome_trabalhador, chave_pix, telefone')
      .eq('tenant_id', activeTenant.id);

    const funcMatch = (
      (funcs as FuncionarioReciboRow[] | null) || []
    ).find(
      (f) =>
        normalizarNomeTrabalhadorCanonico(f.nome_trabalhador).toUpperCase() ===
        nomeCanonico.toUpperCase()
    );

    const chavePixFinal =
      body.chavePix && body.chavePix !== 'Chave não informada'
        ? body.chavePix
        : funcMatch?.chave_pix || 'Não informada';

    const dataHoraQuitacao = new Date().toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
    });

    const pdf = gerarPdfReciboLiquidacao({
      empresaRazaoSocial: activeTenant.razaoSocial || activeTenant.nome,
      nomeTrabalhador: nomeCanonico,
      chavePix: chavePixFinal,
      quitadoPor: body.quitadoPor || 'Patrícia Grubel',
      dataHoraQuitacao,
      itens: itensRecibo,
      observacao: body.observacao,
    });

    // Salva cópia pericial no Cloudflare R2 (não bloqueia download local se R2 estiver indisponível)
    let reciboUrl: string | null = null;
    const uploadRes = await uploadToR2(
      pdf.buffer,
      pdf.fileName,
      'application/pdf'
    );
    if (uploadRes.success && uploadRes.url) {
      reciboUrl = uploadRes.url;

      // Atualiza referência do recibo nos lançamentos e no último ciclo financeiro do trabalhador
      if (Array.isArray(body.lancamentosIds) && body.lancamentosIds.length > 0) {
        try {
          await supabaseAdmin
            .from('lancamentos_financeiros')
            .update({ recibo_liquidacao_url: reciboUrl })
            .eq('tenant_id', activeTenant.id)
            .in('id', body.lancamentosIds);
        } catch {
          // Coluna opcional em ambientes pré-migração
        }
      }

      try {
        const { data: ultimoCiclo } = await supabaseAdmin
          .from('ciclos_financeiros')
          .select('id')
          .eq('tenant_id', activeTenant.id)
          .eq('nome_trabalhador_canonico', nomeCanonico)
          .order('data_corte_quitacao', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (ultimoCiclo?.id) {
          await supabaseAdmin
            .from('ciclos_financeiros')
            .update({ recibo_r2_url: reciboUrl })
            .eq('tenant_id', activeTenant.id)
            .eq('id', ultimoCiclo.id);
        }
      } catch {
        // Tabela ciclos_financeiros opcional
      }
    }

    return NextResponse.json({
      success: true,
      nomeTrabalhador: nomeCanonico,
      chavePix: chavePixFinal,
      telefoneTrabalhador: funcMatch?.telefone || null,
      reciboUrl,
      r2Salvo: Boolean(reciboUrl),
      fileName: pdf.fileName,
      pdfBase64: pdf.base64,
      sha256: pdf.sha256,
      totalBruto: pdf.totalBruto,
      totalVales: pdf.totalVales,
      totalLiquido: pdf.totalLiquido,
      resumoTextoWhatsApp: pdf.resumoTextoWhatsApp,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : 'Erro ao gerar comprovante de liquidação PIX.';
    console.error('[RECIBO-LIQUIDACAO] Erro:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
