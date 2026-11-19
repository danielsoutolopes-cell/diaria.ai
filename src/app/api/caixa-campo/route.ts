import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getActiveTenantFromRequest } from '@/lib/tenant';
import { GoogleGenerativeAI } from '@google/generative-ai';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

export type TipoMovimentoCaixa = 'ENTRADA_PIX' | 'NOTA_DESPESA' | 'DEVOLUCAO_TROCO';

export interface MovimentoCaixaCampo {
  id: string;
  encarregado: string;
  obra: string;
  data: string;
  hora: string;
  tipo: TipoMovimentoCaixa;
  categoria: string;
  descricao: string;
  valor: number;
  status: 'PENDENTE' | 'APROVADO';
  enviadoPor: string;
  criadoEm: string;
}

async function lerCaixaCampo(tenantId: string): Promise<{
  paramId: string | null;
  configs: Record<string, unknown>;
  movimentos: MovimentoCaixaCampo[];
}> {
  const { data: paramData } = await supabaseAdmin
    .from('parametros_sistema')
    .select('id, configuracoes')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  const configs = ((paramData?.configuracoes as Record<string, unknown> | null) ||
    {}) as Record<string, unknown>;
  const movimentos = Array.isArray(configs.caixa_campo_movimentos)
    ? (configs.caixa_campo_movimentos as MovimentoCaixaCampo[])
    : [];

  return {
    paramId: (paramData?.id as string | undefined) || null,
    configs,
    movimentos,
  };
}

async function salvarCaixaCampo(
  tenantId: string,
  paramId: string | null,
  configs: Record<string, unknown>,
  movimentos: MovimentoCaixaCampo[]
) {
  const novasConfigs = { ...configs, caixa_campo_movimentos: movimentos };
  if (paramId) {
    await supabaseAdmin
      .from('parametros_sistema')
      .update({ configuracoes: novasConfigs })
      .eq('id', paramId);
  } else {
    await supabaseAdmin.from('parametros_sistema').insert({
      tenant_id: tenantId,
      configuracoes: novasConfigs,
    });
  }
}

export async function GET(req: NextRequest) {
  try {
    const activeTenant = getActiveTenantFromRequest(req);
    const { movimentos } = await lerCaixaCampo(activeTenant.id);

    // Consolidar Conta Corrente por Encarregado
    const contasMap = new Map<
      string,
      {
        encarregado: string;
        totalRecebido: number;
        totalComprovado: number;
        totalDevolvido: number;
        saldoEmMaos: number;
        movimentos: MovimentoCaixaCampo[];
      }
    >();

    for (const m of movimentos) {
      const chave = m.encarregado.trim().toUpperCase();
      if (!contasMap.has(chave)) {
        contasMap.set(chave, {
          encarregado: m.encarregado,
          totalRecebido: 0,
          totalComprovado: 0,
          totalDevolvido: 0,
          saldoEmMaos: 0,
          movimentos: [],
        });
      }
      const c = contasMap.get(chave)!;
      c.movimentos.push(m);
      if (m.tipo === 'ENTRADA_PIX') c.totalRecebido += Number(m.valor || 0);
      if (m.tipo === 'NOTA_DESPESA') c.totalComprovado += Number(m.valor || 0);
      if (m.tipo === 'DEVOLUCAO_TROCO') c.totalDevolvido += Number(m.valor || 0);
      c.saldoEmMaos = Number(
        (c.totalRecebido - c.totalComprovado - c.totalDevolvido).toFixed(2)
      );
    }

    return NextResponse.json({
      movimentos,
      contas: Array.from(contasMap.values()),
    });
  } catch (error) {
    console.error('Erro em GET /api/caixa-campo:', error);
    return NextResponse.json({ movimentos: [], contas: [] }, { status: 500 });
  }
}

interface CaixaPostBody {
  action: 'registrar' | 'aprovar' | 'excluir' | 'ler-nota-ia';
  id?: string;
  encarregado?: string;
  obra?: string;
  data?: string;
  hora?: string;
  tipo?: TipoMovimentoCaixa;
  categoria?: string;
  descricao?: string;
  valor?: number;
  enviadoPor?: string;
  imagemBase64?: string;
  imagemMimeType?: string;
}

export async function POST(req: NextRequest) {
  try {
    const activeTenant = getActiveTenantFromRequest(req);
    const body = (await req.json()) as CaixaPostBody;

    // 1. Leitura automática de comprovante PIX ou Nota Fiscal via Gemini Vision
    if (body.action === 'ler-nota-ia' && body.imagemBase64) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return NextResponse.json(
          { error: 'GEMINI_API_KEY não configurada.' },
          { status: 400 }
        );
      }
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash-lite' });
      const clean = body.imagemBase64.replace(/^data:[^;]+;base64,/, '');

      const prompt = `Analise esta imagem (comprovante de PIX, cupom fiscal, nota fiscal ou contrato de locação de obra).
Retorne APENAS JSON puro (sem markdown):
{
  "tipo": "ENTRADA_PIX" ou "NOTA_DESPESA",
  "valor": 0.00,
  "categoria": "Material" | "Locação de Equipamento" | "Suprimento PIX" | "Combustível" | "Outros",
  "descricao": "Descrição curta e clara"
}`;

      const res = await model.generateContent([
        prompt,
        {
          inlineData: {
            data: clean,
            mimeType: body.imagemMimeType || 'image/jpeg',
          },
        },
      ]);

      const raw = res.response.text().replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(raw) as {
        tipo?: TipoMovimentoCaixa;
        valor?: number;
        categoria?: string;
        descricao?: string;
      };
      return NextResponse.json({ success: true, leitura: parsed });
    }

    const { paramId, configs, movimentos } = await lerCaixaCampo(activeTenant.id);

    if (body.action === 'registrar') {
      const novo: MovimentoCaixaCampo = {
        id: crypto.randomUUID(),
        encarregado: (body.encarregado || 'Gil (Gilvan)').trim(),
        obra: (body.obra || 'PORTO SEGURO').trim().toUpperCase(),
        data:
          body.data ||
          new Date().toLocaleDateString('en-CA', {
            timeZone: 'America/Sao_Paulo',
          }),
        hora:
          body.hora ||
          new Date().toLocaleTimeString('pt-BR', {
            timeZone: 'America/Sao_Paulo',
            hour: '2-digit',
            minute: '2-digit',
          }),
        tipo: body.tipo || 'NOTA_DESPESA',
        categoria: body.categoria || 'Material',
        descricao: (body.descricao || 'Despesa de Campo').trim(),
        valor: Number(body.valor || 0),
        status: 'PENDENTE',
        enviadoPor: body.enviadoPor || 'Administração',
        criadoEm: new Date().toISOString(),
      };
      const atualizados = [novo, ...movimentos];
      await salvarCaixaCampo(activeTenant.id, paramId, configs, atualizados);
      return NextResponse.json({ success: true, movimento: novo });
    }

    if (body.action === 'aprovar' && body.id) {
      const atualizados = movimentos.map((m) =>
        m.id === body.id ? { ...m, status: 'APROVADO' as const } : m
      );
      await salvarCaixaCampo(activeTenant.id, paramId, configs, atualizados);
      return NextResponse.json({ success: true });
    }

    if (body.action === 'excluir' && body.id) {
      const atualizados = movimentos.filter((m) => m.id !== body.id);
      await salvarCaixaCampo(activeTenant.id, paramId, configs, atualizados);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
  } catch (error) {
    console.error('Erro em POST /api/caixa-campo:', error);
    return NextResponse.json(
      { error: 'Erro ao processar Caixa de Campo.' },
      { status: 500 }
    );
  }
}
