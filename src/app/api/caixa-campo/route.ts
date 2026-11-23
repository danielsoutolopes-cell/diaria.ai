import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getActiveTenantFromRequest, TENANTS } from '@/lib/tenant';
import { normalizarNomeTrabalhadorCanonico } from '@/lib/normalizarObra';
import { GoogleGenerativeAI } from '@google/generative-ai';
import crypto from 'crypto';

import {
  consolidarContasCaixinha,
  deduplicarMovimentosCaixinha,
  type MovimentoCaixaCampo,
  type TipoMovimentoCaixa,
} from '@/lib/caixinhaDeduplicacao';

export const dynamic = 'force-dynamic';

export type { MovimentoCaixaCampo, TipoMovimentoCaixa };

interface CaixinhaDbRow {
  id: string;
  encarregado_canonico: string;
  encarregado_origem: string | null;
  obra_nome: string;
  data_movimentacao: string;
  hora_movimentacao: string;
  tipo: TipoMovimentoCaixa;
  categoria: string;
  descricao: string;
  valor: number | string;
  status: 'PENDENTE' | 'APROVADO';
  is_pre_implantacao: boolean;
  enviado_por: string | null;
  created_at: string;
}

interface AliasDbRow {
  alias_texto: string;
  nome_canonico: string;
}

/**
 * Fallback pré-implantação (usado apenas se tanto SQL quanto JSONB estiverem
 * 100% vazios para o Gil no tenant Jhoston — nunca sobreposto a lançamentos itemizados).
 */
const MOVIMENTOS_PRE_IMPLANTACAO_JHOSTON: MovimentoCaixaCampo[] = [
  {
    id: 'v11-preimp-2026-11-13-gil-entradas-700',
    encarregado: 'Gil',
    encarregadoOrigem: 'Gil / Gilvan / Gil335Revest',
    obra: 'PISCINA PORTO SEGURO',
    data: '2026-11-13',
    hora: '09:00',
    tipo: 'ENTRADA_PIX',
    categoria: 'Suprimento PIX',
    descricao:
      'Entradas PIX consolidadas (Pré-implantação 13/11 — Gil + Gil335Revest)',
    valor: 700.0,
    status: 'APROVADO',
    isPreImplantacao: true,
    enviadoPor: 'Patrícia Grubel',
    criadoEm: '2026-11-13T12:00:00.000Z',
  },
  {
    id: 'v11-preimp-2026-11-13-gil-saidas-54694',
    encarregado: 'Gil',
    encarregadoOrigem: 'Gil / Gilvan / Gil335Revest',
    obra: 'PISCINA PORTO SEGURO',
    data: '2026-11-13',
    hora: '17:30',
    tipo: 'NOTA_DESPESA',
    categoria: 'Material / Despesas de Campo',
    descricao:
      'Saídas e notas comprovadas (Pré-implantação 13/11 — Gil + Gil335Revest)',
    valor: 546.94,
    status: 'APROVADO',
    isPreImplantacao: true,
    enviadoPor: 'Gil',
    criadoEm: '2026-11-13T20:30:00.000Z',
  },
];

async function carregarAliasesTenant(
  tenantId: string
): Promise<Record<string, string>> {
  const mapa: Record<string, string> = {};
  try {
    const { data } = await supabaseAdmin
      .from('trabalhador_aliases')
      .select('alias_texto, nome_canonico')
      .eq('tenant_id', tenantId)
      .eq('ativo', true);
    ((data as AliasDbRow[] | null) || []).forEach((row) => {
      const chave = row.alias_texto
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/\s+/g, ' ')
        .trim();
      mapa[chave] = row.nome_canonico;
    });
  } catch {
    // Tabela trabalhador_aliases opcional até execução da migração V11
  }
  return mapa;
}

async function lerCaixaCampo(
  tenantId: string,
  aliasesExtras?: Record<string, string>
): Promise<{
  paramId: string | null;
  configs: Record<string, unknown>;
  movimentos: MovimentoCaixaCampo[];
  tabelaSqlAtiva: boolean;
}> {
  const { data: paramData } = await supabaseAdmin
    .from('parametros_sistema')
    .select('id, configuracoes')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  const configs = ((paramData?.configuracoes as Record<string, unknown> | null) ||
    {}) as Record<string, unknown>;
  const movimentosJsonb = Array.isArray(configs.caixa_campo_movimentos)
    ? (configs.caixa_campo_movimentos as MovimentoCaixaCampo[])
    : [];

  let tabelaSqlAtiva = false;
  const movimentosSql: MovimentoCaixaCampo[] = [];

  try {
    const { data: sqlRows, error } = await supabaseAdmin
      .from('caixinha_movimentacoes')
      .select(
        'id, encarregado_canonico, encarregado_origem, obra_nome, data_movimentacao, hora_movimentacao, tipo, categoria, descricao, valor, status, is_pre_implantacao, enviado_por, created_at'
      )
      .eq('tenant_id', tenantId)
      .order('data_movimentacao', { ascending: true });

    if (!error && Array.isArray(sqlRows)) {
      tabelaSqlAtiva = true;
      (sqlRows as unknown as CaixinhaDbRow[]).forEach((row) => {
        movimentosSql.push({
          id: row.id,
          encarregado: row.encarregado_canonico,
          encarregadoOrigem: row.encarregado_origem || row.encarregado_canonico,
          obra: row.obra_nome,
          data: row.data_movimentacao,
          hora: row.hora_movimentacao || '12:00',
          tipo: row.tipo,
          categoria: row.categoria,
          descricao: row.descricao,
          valor: Number(row.valor || 0),
          status: row.status,
          isPreImplantacao: Boolean(row.is_pre_implantacao),
          enviadoPor: row.enviado_por || 'Administração',
          criadoEm: row.created_at,
        });
      });
    }
  } catch {
    // Tabela caixinha_movimentacoes ainda não criada no banco remoto — fallback JSONB
  }

  let movimentos = deduplicarMovimentosCaixinha(
    movimentosSql,
    movimentosJsonb,
    aliasesExtras
  );

  // Fallback seguro apenas quando não houver nenhum lançamento do Gil em SQL nem JSONB
  if (tenantId === TENANTS.jhoston.id) {
    const jaTemGil = movimentos.some(
      (m) => normalizarNomeTrabalhadorCanonico(m.encarregado, aliasesExtras) === 'Gil'
    );
    if (!jaTemGil) {
      movimentos = deduplicarMovimentosCaixinha(
        MOVIMENTOS_PRE_IMPLANTACAO_JHOSTON,
        movimentos,
        aliasesExtras
      );
    }
  }

  return {
    paramId: (paramData?.id as string | undefined) || null,
    configs,
    movimentos,
    tabelaSqlAtiva,
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
      .eq('id', paramId)
      .eq('tenant_id', tenantId);
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
    const aliasesExtras = await carregarAliasesTenant(activeTenant.id);
    const { movimentos } = await lerCaixaCampo(activeTenant.id, aliasesExtras);
    const contas = consolidarContasCaixinha(movimentos, aliasesExtras);

    return NextResponse.json({
      tenant: activeTenant.slug,
      movimentos,
      contas,
    });
  } catch (error) {
    console.error('Erro em GET /api/caixa-campo:', error);
    return NextResponse.json({ movimentos: [], contas: [] }, { status: 500 });
  }
}

interface CaixaPostBody {
  action: 'registrar' | 'aprovar' | 'excluir' | 'ler-nota-ia' | 'levar-fechamento';
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
  isPreImplantacao?: boolean;
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

    const [{ paramId, configs, movimentos, tabelaSqlAtiva }, aliasesExtras] =
      await Promise.all([
        lerCaixaCampo(activeTenant.id),
        carregarAliasesTenant(activeTenant.id),
      ]);

    if (body.action === 'registrar') {
      const encarregadoBruto = (body.encarregado || 'Gil').trim();
      const encarregadoCanonico = normalizarNomeTrabalhadorCanonico(
        encarregadoBruto,
        aliasesExtras
      );
      const novo: MovimentoCaixaCampo = {
        id: crypto.randomUUID(),
        encarregado: encarregadoCanonico,
        encarregadoOrigem: encarregadoBruto,
        obra: (body.obra || 'PISCINA PORTO SEGURO').trim().toUpperCase(),
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
        isPreImplantacao: Boolean(body.isPreImplantacao),
        enviadoPor: body.enviadoPor || 'Administração',
        criadoEm: new Date().toISOString(),
      };

      const atualizados = [novo, ...movimentos];
      await salvarCaixaCampo(activeTenant.id, paramId, configs, atualizados);

      if (tabelaSqlAtiva) {
        await supabaseAdmin
          .from('caixinha_movimentacoes')
          .insert({
            id: novo.id,
            tenant_id: activeTenant.id,
            encarregado_canonico: novo.encarregado,
            encarregado_origem: novo.encarregadoOrigem || novo.encarregado,
            obra_nome: novo.obra,
            data_movimentacao: novo.data,
            hora_movimentacao: novo.hora,
            tipo: novo.tipo,
            categoria: novo.categoria,
            descricao: novo.descricao,
            valor: novo.valor,
            status: novo.status,
            is_pre_implantacao: Boolean(novo.isPreImplantacao),
            enviado_por: novo.enviadoPor,
          })
          .then(({ error }) => {
            if (error) console.warn('[CAIXINHA SQL SYNC]:', error.message);
          });
      }

      return NextResponse.json({ success: true, movimento: novo });
    }

    if (body.action === 'aprovar' && body.id) {
      const atualizados = movimentos.map((m) =>
        m.id === body.id ? { ...m, status: 'APROVADO' as const } : m
      );
      await salvarCaixaCampo(activeTenant.id, paramId, configs, atualizados);
      if (tabelaSqlAtiva) {
        await supabaseAdmin
          .from('caixinha_movimentacoes')
          .update({ status: 'APROVADO' })
          .eq('tenant_id', activeTenant.id)
          .eq('id', body.id);
      }
      return NextResponse.json({ success: true });
    }

    if (body.action === 'excluir' && body.id) {
      const atualizados = movimentos.filter((m) => m.id !== body.id);
      await salvarCaixaCampo(activeTenant.id, paramId, configs, atualizados);
      if (tabelaSqlAtiva) {
        await supabaseAdmin
          .from('caixinha_movimentacoes')
          .delete()
          .eq('tenant_id', activeTenant.id)
          .eq('id', body.id);
      }
      return NextResponse.json({ success: true });
    }

    // Levar saldo (troco ou reembolso) opcionalmente para o Fechamento & Pagamentos (PIX)
    // Regra de negócio: NUNCA desconta automaticamente da folha — somente sob clique explícito da Administração
    if (body.action === 'levar-fechamento' && body.encarregado && body.valor) {
      const encarregadoCanonico = normalizarNomeTrabalhadorCanonico(
        body.encarregado,
        aliasesExtras
      );
      const valorAbs = Math.abs(Number(body.valor));
      const isTrocoADescontar = Number(body.valor) > 0;
      const hojeBR = new Date().toLocaleDateString('en-CA', {
        timeZone: 'America/Sao_Paulo',
      });

      const { data: obraRow } = await supabaseAdmin
        .from('obras_config')
        .select('id')
        .eq('tenant_id', activeTenant.id)
        .ilike('nome', `%${body.obra || ''}%`)
        .limit(1)
        .maybeSingle();

      await supabaseAdmin.from('lancamentos_financeiros').insert({
        tenant_id: activeTenant.id,
        obra_id: obraRow?.id || null,
        nome_trabalhador: encarregadoCanonico,
        tipo_lancamento: isTrocoADescontar ? 'VALE' : 'PONTO',
        fracao_dia: 0,
        valor_monetario: valorAbs,
        status: 'VALIDADO',
        data_referencia: hojeBR,
        observacao: isTrocoADescontar
          ? `Compensação de Troco de Caixa de Campo (${body.obra || 'Obra'})`
          : `Crédito de Reembolso de Caixa de Campo (${body.obra || 'Obra'})`,
      });

      const fechamentoMov: MovimentoCaixaCampo = {
        id: crypto.randomUUID(),
        encarregado: encarregadoCanonico,
        encarregadoOrigem: body.encarregado,
        obra: (body.obra || 'PISCINA PORTO SEGURO').toUpperCase(),
        data: hojeBR,
        hora: new Date().toLocaleTimeString('pt-BR', {
          timeZone: 'America/Sao_Paulo',
          hour: '2-digit',
          minute: '2-digit',
        }),
        tipo: isTrocoADescontar ? 'DEVOLUCAO_TROCO' : 'ENTRADA_PIX',
        categoria: 'Transferido p/ Fechamento',
        descricao: isTrocoADescontar
          ? 'Saldo de troco transferido manualmente para Fechamento & Pagamentos (PIX)'
          : 'Reembolso transferido manualmente como crédito para Fechamento & Pagamentos (PIX)',
        valor: valorAbs,
        status: 'APROVADO',
        enviadoPor: 'Administração',
        criadoEm: new Date().toISOString(),
      };

      await salvarCaixaCampo(activeTenant.id, paramId, configs, [
        fechamentoMov,
        ...movimentos,
      ]);

      if (tabelaSqlAtiva) {
        await supabaseAdmin.from('caixinha_movimentacoes').insert({
          id: fechamentoMov.id,
          tenant_id: activeTenant.id,
          encarregado_canonico: fechamentoMov.encarregado,
          encarregado_origem: fechamentoMov.encarregadoOrigem || fechamentoMov.encarregado,
          obra_nome: fechamentoMov.obra,
          data_movimentacao: fechamentoMov.data,
          hora_movimentacao: fechamentoMov.hora,
          tipo: fechamentoMov.tipo,
          categoria: fechamentoMov.categoria,
          descricao: fechamentoMov.descricao,
          valor: fechamentoMov.valor,
          status: fechamentoMov.status,
          is_pre_implantacao: false,
          enviado_por: fechamentoMov.enviadoPor,
        });
      }

      return NextResponse.json({
        success: true,
        message:
          'Saldo levado para Fechamento & Pagamentos (PIX) e conta corrente zerada!',
      });
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
