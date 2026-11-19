import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getActiveTenantFromRequest } from '@/lib/tenant';
import { GoogleGenerativeAI } from '@google/generative-ai';
import crypto from 'crypto';
import type { DiarioObraRegistro } from '@/app/api/diario-obra/route';

export const dynamic = 'force-dynamic';

export interface EtapaObra {
  id: string;
  nome: string;
  pesoPercentual: number;
  percentualConcluido: number;
  observacao: string;
}

export interface ObraEscopoMedicao {
  id: string;
  tenantSlug: string;
  obraNome: string;
  cliente: string;
  empreiteiro: string;
  prazoEstimado: string;
  etapas: EtapaObra[];
  parecerIA: string;
  homensDiaAcumulados: number;
  ultimaAvaliacaoEm?: string;
  criadoEm: string;
}

async function lerEscopos(tenantId: string): Promise<{
  paramId: string | null;
  configs: Record<string, unknown>;
  escopos: ObraEscopoMedicao[];
  diarios: DiarioObraRegistro[];
}> {
  const { data: paramData } = await supabaseAdmin
    .from('parametros_sistema')
    .select('id, configuracoes')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  const configs = ((paramData?.configuracoes as Record<string, unknown> | null) ||
    {}) as Record<string, unknown>;

  const escopos = Array.isArray(configs.medicoes_escopo)
    ? (configs.medicoes_escopo as ObraEscopoMedicao[])
    : [];
  const diarios = Array.isArray(configs.diarios_obra)
    ? (configs.diarios_obra as DiarioObraRegistro[])
    : [];

  return {
    paramId: (paramData?.id as string | undefined) || null,
    configs,
    escopos,
    diarios,
  };
}

async function salvarEscopos(
  tenantId: string,
  paramId: string | null,
  configs: Record<string, unknown>,
  escopos: ObraEscopoMedicao[]
) {
  const novasConfigs = { ...configs, medicoes_escopo: escopos };
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
    const { escopos } = await lerEscopos(activeTenant.id);
    return NextResponse.json({ escopos, tenant: activeTenant });
  } catch (error) {
    console.error('Erro em GET /api/medicoes:', error);
    return NextResponse.json({ escopos: [] }, { status: 500 });
  }
}

interface MedicoesPostBody {
  action: 'extrair-proposta' | 'avaliar-ia' | 'atualizar-etapas' | 'excluir';
  escopoId?: string;
  textoProposta?: string;
  arquivoBase64?: string;
  arquivoMimeType?: string;
  etapas?: EtapaObra[];
}

export async function POST(req: NextRequest) {
  try {
    const activeTenant = getActiveTenantFromRequest(req);
    const body = (await req.json()) as MedicoesPostBody;
    const { paramId, configs, escopos, diarios } = await lerEscopos(activeTenant.id);

    // 1. Extrair escopo e etapas de uma Proposta (PDF, Imagem ou Texto) com Gemini
    if (body.action === 'extrair-proposta') {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return NextResponse.json(
          { error: 'GEMINI_API_KEY não configurada no servidor.' },
          { status: 400 }
        );
      }

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash-lite' });

      const prompt = `Você é um assistente de gestão de obras ajudando um gestor que NÃO é engenheiro.
Leia a proposta de obra fornecida e extraia em JSON puro (sem markdown) o seguinte formato:
{
  "obraNome": "NOME DA OBRA",
  "cliente": "Nome do cliente se houver",
  "empreiteiro": "Nome do empreiteiro se houver",
  "prazoEstimado": "Ex: 45 dias",
  "etapas": [
    { "nome": "Demolição e Retirada", "pesoPercentual": 10, "observacao": "Resumo simples" }
  ]
}
Regras:
- A soma de pesoPercentual das etapas deve ser 100.
- Use linguagem simples e direta (3 a 8 etapas principais).`;

      const parts: Array<
        string | { inlineData: { data: string; mimeType: string } }
      > = [prompt];

      if (body.textoProposta?.trim()) {
        parts.push(`\nTexto da proposta:\n${body.textoProposta.trim()}`);
      }
      if (body.arquivoBase64 && body.arquivoMimeType) {
        const clean = body.arquivoBase64.replace(/^data:[^;]+;base64,/, '');
        parts.push({
          inlineData: {
            data: clean,
            mimeType: body.arquivoMimeType,
          },
        });
      }

      const result = await model.generateContent(parts);
      const rawText = result.response
        .text()
        .replace(/```json|```/g, '')
        .trim();

      const parsed = JSON.parse(rawText) as {
        obraNome?: string;
        cliente?: string;
        empreiteiro?: string;
        prazoEstimado?: string;
        etapas?: Array<{
          nome: string;
          pesoPercentual: number;
          observacao?: string;
        }>;
      };

      const novoEscopo: ObraEscopoMedicao = {
        id: crypto.randomUUID(),
        tenantSlug: activeTenant.slug,
        obraNome: (parsed.obraNome || 'NOVA OBRA').toUpperCase(),
        cliente: parsed.cliente || 'A definir',
        empreiteiro: parsed.empreiteiro || 'A definir',
        prazoEstimado: parsed.prazoEstimado || 'A definir',
        etapas: (parsed.etapas || []).map((e) => ({
          id: crypto.randomUUID(),
          nome: e.nome,
          pesoPercentual: Number(e.pesoPercentual) || 10,
          percentualConcluido: 0,
          observacao: e.observacao || '',
        })),
        parecerIA:
          'Proposta lida com sucesso! Conforme os Diários de Obra forem preenchidos, clique em "Estimar Avanço com IA" para acompanhar a medição.',
        homensDiaAcumulados: 0,
        criadoEm: new Date().toISOString(),
      };

      const atualizados = [novoEscopo, ...escopos];
      await salvarEscopos(activeTenant.id, paramId, configs, atualizados);
      return NextResponse.json({ success: true, escopo: novoEscopo, escopos: atualizados });
    }

    // 2. Avaliar avanço e sugerir medição com IA cruzando Diários + Homens-Dia
    if (body.action === 'avaliar-ia' && body.escopoId) {
      const escopo = escopos.find((e) => e.id === body.escopoId);
      if (!escopo) {
        return NextResponse.json({ error: 'Obra não encontrada.' }, { status: 404 });
      }

      // Buscar Diários desta obra
      const diariosObra = diarios.filter((d) =>
        d.obraNome.toLowerCase().includes(escopo.obraNome.toLowerCase()) ||
        escopo.obraNome.toLowerCase().includes(d.obraNome.toLowerCase())
      );

      // Calcular Homens-Dia acumulados via lancamentos_financeiros
      const { data: lancs } = await supabaseAdmin
        .from('lancamentos_financeiros')
        .select('fracao_dia, obras_config ( nome )')
        .eq('tenant_id', activeTenant.id)
        .eq('tipo_lancamento', 'PONTO')
        .neq('status', 'DESCARTADO');

      let homensDia = 0;
      for (const l of lancs || []) {
        const nomeObraLanc = (
          l as unknown as { obras_config?: { nome?: string | null } | null }
        ).obras_config?.nome;
        if (
          nomeObraLanc &&
          (nomeObraLanc.toLowerCase().includes(escopo.obraNome.toLowerCase()) ||
            escopo.obraNome.toLowerCase().includes(nomeObraLanc.toLowerCase()))
        ) {
          homensDia += Number(l.fracao_dia || 0);
        }
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return NextResponse.json({ error: 'GEMINI_API_KEY não configurada.' }, { status: 400 });
      }

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash-lite' });

      const resumoDiarios =
        diariosObra.length > 0
          ? diariosObra
              .map(
                (d) =>
                  `- [${d.data}] Efetivo: ${d.efetivo.length} | Resumo: ${d.resumo} | Ocorrências: ${d.ocorrencias || 'Nenhuma'}`
              )
              .join('\n')
          : 'Nenhum diário de obra registrado ainda.';

      const prompt = `Você é um engenheiro assistente explicando o andamento da obra para um gestor que NÃO é engenheiro.
Obra: ${escopo.obraNome}
Homens-Dia acumulados: ${homensDia.toFixed(1)}
Etapas atuais: ${JSON.stringify(escopo.etapas)}

Diários de Obra registrados:
${resumoDiarios}

Retorne APENAS JSON puro (sem markdown):
{
  "etapas": [
    { "id": "MESMO_ID", "percentualConcluido": 40, "observacao": "Explicação simples do porquê" }
  ],
  "parecerIA": "Resumo claro em 3 a 4 linhas em linguagem simples para quem não é engenheiro, indicando o avanço geral e se o ritmo de Homens-Dia está coerente."
}`;

      const result = await model.generateContent(prompt);
      const rawText = result.response
        .text()
        .replace(/```json|```/g, '')
        .trim();
      const parsed = JSON.parse(rawText) as {
        etapas?: Array<{
          id: string;
          percentualConcluido: number;
          observacao?: string;
        }>;
        parecerIA?: string;
      };

      const escopoAtualizado: ObraEscopoMedicao = {
        ...escopo,
        homensDiaAcumulados: homensDia,
        parecerIA: parsed.parecerIA || escopo.parecerIA,
        ultimaAvaliacaoEm: new Date().toISOString(),
        etapas: escopo.etapas.map((et) => {
          const sug = (parsed.etapas || []).find((s) => s.id === et.id);
          if (!sug) return et;
          return {
            ...et,
            percentualConcluido: Math.min(
              100,
              Math.max(0, Number(sug.percentualConcluido) || 0)
            ),
            observacao: sug.observacao || et.observacao,
          };
        }),
      };

      const atualizados = escopos.map((e) =>
        e.id === escopo.id ? escopoAtualizado : e
      );
      await salvarEscopos(activeTenant.id, paramId, configs, atualizados);
      return NextResponse.json({
        success: true,
        escopo: escopoAtualizado,
        escopos: atualizados,
      });
    }

    // 3. Atualização manual de % (Human-in-the-Loop)
    if (body.action === 'atualizar-etapas' && body.escopoId && body.etapas) {
      const atualizados = escopos.map((e) =>
        e.id === body.escopoId ? { ...e, etapas: body.etapas || e.etapas } : e
      );
      await salvarEscopos(activeTenant.id, paramId, configs, atualizados);
      return NextResponse.json({ success: true, escopos: atualizados });
    }

    // 4. Excluir escopo
    if (body.action === 'excluir' && body.escopoId) {
      const atualizados = escopos.filter((e) => e.id !== body.escopoId);
      await salvarEscopos(activeTenant.id, paramId, configs, atualizados);
      return NextResponse.json({ success: true, escopos: atualizados });
    }

    return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
  } catch (error) {
    console.error('Erro em POST /api/medicoes:', error);
    return NextResponse.json(
      { error: 'Erro ao processar proposta/medição com IA.' },
      { status: 500 }
    );
  }
}
