import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getActiveTenantFromRequest } from '@/lib/tenant';
import {
  normalizarNomeObraCanonica,
  normalizarNomeTrabalhadorCanonico,
} from '@/lib/normalizarObra';
import { uploadToR2 } from '@/services/r2Storage';
import { analisarImagemPixComGemini } from '@/services/valesNlp';

interface LiquidarOcrBody {
  imagemBase64?: string;
  imagemMimeType?: string;
  legenda?: string;
}

interface LancamentoCandidatoRow {
  id: string;
  nome_trabalhador: string;
  tipo_lancamento: string;
  fracao_dia: number | string | null;
  valor_monetario: number | string;
  data_referencia: string;
  observacao: string | null;
  obras_config:
    | { nome: string | null; tipo_obra: string | null }
    | Array<{ nome: string | null; tipo_obra: string | null }>
    | null;
}

export async function POST(req: NextRequest) {
  try {
    const activeTenant = getActiveTenantFromRequest(req);
    const body = (await req.json()) as LiquidarOcrBody;

    if (!body.imagemBase64) {
      return NextResponse.json(
        { error: 'Envie a imagem do comprovante PIX para leitura.' },
        { status: 400 }
      );
    }

    // 1. Subir comprovante PIX original para Cloudflare R2
    let comprovantePixUrl: string | null = null;
    try {
      const clean = body.imagemBase64.replace(/^data:[^;]+;base64,/, '');
      const buffer = Buffer.from(clean, 'base64');
      const mimeLower = (body.imagemMimeType || 'image/jpeg').toLowerCase();
      const ext = mimeLower.includes('pdf')
        ? 'pdf'
        : mimeLower.includes('png')
          ? 'png'
          : 'jpg';
      const uploadRes = await uploadToR2(
        buffer,
        `liquidacao-pix-${activeTenant.slug}-${Date.now()}.${ext}`,
        body.imagemMimeType || 'image/jpeg'
      );
      if (uploadRes.success) comprovantePixUrl = uploadRes.url;
    } catch (errUp) {
      console.warn('[LIQUIDAR OCR] Falha ao salvar comprovante no R2:', errUp);
    }

    // 2. Ler favorecido, valor e data via Gemini Vision
    const leitura = await analisarImagemPixComGemini({
      imagemBase64: body.imagemBase64,
      mimeType: body.imagemMimeType,
      legenda: body.legenda,
    });

    // 3. Buscar lançamentos em aberto (VALIDADO) do tenant ativo para o trabalhador identificado
    // (ex.: Manoel R$ 1.150 / 5d, Weslen/Wender R$ 1.275 / 8,5d) — respeitando data de corte do comprovante!
    const { data: abertosRaw } = await supabaseAdmin
      .from('lancamentos_financeiros')
      .select(`
        id,
        nome_trabalhador,
        tipo_lancamento,
        fracao_dia,
        valor_monetario,
        data_referencia,
        observacao,
        obras_config ( nome, tipo_obra )
      `)
      .eq('tenant_id', activeTenant.id)
      .eq('status', 'VALIDADO')
      .order('data_referencia', { ascending: true });

    const abertos =
      (abertosRaw as unknown as LancamentoCandidatoRow[] | null) || [];

    const nomeAlvoCanonico = leitura.nomeTrabalhador
      ? normalizarNomeTrabalhadorCanonico(leitura.nomeTrabalhador)
      : null;

    const candidatos = nomeAlvoCanonico
      ? abertos
          .filter(
            (l) =>
              normalizarNomeTrabalhadorCanonico(l.nome_trabalhador).toUpperCase() ===
              nomeAlvoCanonico.toUpperCase()
          )
          .map((l) => {
            const obraRel = Array.isArray(l.obras_config)
              ? l.obras_config[0]
              : l.obras_config;
            return {
              id: l.id,
              data: l.data_referencia,
              obra: normalizarNomeObraCanonica(obraRel?.nome, obraRel?.tipo_obra),
              tipo: l.tipo_lancamento,
              fracao: Number(l.fracao_dia || 0),
              valor: Number(l.valor_monetario || 0),
              observacao: l.observacao || '',
            };
          })
      : [];

    const totalBrutoCandidatos = candidatos
      .filter((c) => c.tipo === 'PONTO')
      .reduce((acc, c) => acc + c.valor, 0);
    const totalValesCandidatos = candidatos
      .filter((c) => c.tipo === 'VALE')
      .reduce((acc, c) => acc + c.valor, 0);
    const totalLiquidoAberto = Math.max(
      0,
      Number((totalBrutoCandidatos - totalValesCandidatos).toFixed(2))
    );
    const diferenca = Number((leitura.valor - totalLiquidoAberto).toFixed(2));

    return NextResponse.json({
      success: true,
      leitura,
      comprovantePixUrl,
      trabalhadorMatch: nomeAlvoCanonico,
      lancamentosCandidatos: candidatos,
      resumoPreview: {
        valorComprovantePix: leitura.valor,
        totalLiquidoAberto,
        diferenca,
        quantidadeLancamentos: candidatos.length,
        zeraSaldoExato: Math.abs(diferenca) < 0.05 && candidatos.length > 0,
      },
    });
  } catch (error) {
    console.error('Erro em POST /api/liquidar/ocr:', error);
    return NextResponse.json(
      { error: 'Falha ao analisar comprovante PIX de liquidação.' },
      { status: 500 }
    );
  }
}
