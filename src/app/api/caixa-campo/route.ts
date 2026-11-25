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
import {
  aplicarFallbackOcrCaixinha,
  extrairEmissoresPixAtivos,
  listarEmissoresPixTenant,
  montarDataHoraEnvioIso,
  normalizarDataIso,
  normalizarEmissorPix,
  normalizarHoraHHMM,
  normalizarListaEmissoresConfig,
  obterDataHoraBrasilia,
  type LeituraBrutaOcrCaixinha,
  type OrigemRastreabilidadeCaixinha,
} from '@/lib/caixinhaPixRastreabilidade';

export const dynamic = 'force-dynamic';

export type { MovimentoCaixaCampo, TipoMovimentoCaixa };

interface CaixinhaDbRow {
  id: string;
  encarregado_canonico: string;
  encarregado_origem: string | null;
  obra_nome: string;
  data_movimentacao: string;
  hora_movimentacao: string;
  data_hora_envio?: string | null;
  tipo: TipoMovimentoCaixa;
  categoria: string;
  descricao: string;
  valor: number | string;
  status: 'PENDENTE' | 'APROVADO';
  is_pre_implantacao: boolean;
  enviado_por: string | null;
  emissor_pix?: string | null;
  origem_emissor?: OrigemRastreabilidadeCaixinha | null;
  origem_data_hora?: OrigemRastreabilidadeCaixinha | null;
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
    encarregadoOrigem: 'Gil',
    obra: 'PISCINA PORTO SEGURO',
    data: '2026-11-13',
    hora: '09:00',
    dataHoraEnvio: '2026-11-13T09:00:00-03:00',
    tipo: 'ENTRADA_PIX',
    categoria: 'Suprimento PIX',
    descricao: 'Entradas PIX consolidadas (Pré-implantação 13/11)',
    valor: 700.0,
    status: 'APROVADO',
    isPreImplantacao: true,
    enviadoPor: 'Patrícia',
    emissorPix: 'Patrícia',
    origemEmissor: 'MANUAL',
    origemDataHora: 'MANUAL',
    criadoEm: '2026-11-13T12:00:00.000Z',
  },
  {
    id: 'v11-preimp-2026-11-13-gil-saidas-54694',
    encarregado: 'Gil',
    encarregadoOrigem: 'Gil',
    obra: 'PISCINA PORTO SEGURO',
    data: '2026-11-13',
    hora: '17:30',
    dataHoraEnvio: '2026-11-13T17:30:00-03:00',
    tipo: 'NOTA_DESPESA',
    categoria: 'Material / Despesas de Campo',
    descricao: 'Saídas e notas comprovadas (Pré-implantação 13/11)',
    valor: 546.94,
    status: 'APROVADO',
    isPreImplantacao: true,
    enviadoPor: 'Gil',
    emissorPix: null,
    origemEmissor: 'MANUAL',
    origemDataHora: 'MANUAL',
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
    let sqlRows: CaixinhaDbRow[] | null = null;
    const resV24 = await supabaseAdmin
      .from('caixinha_movimentacoes')
      .select(
        'id, encarregado_canonico, encarregado_origem, obra_nome, data_movimentacao, hora_movimentacao, data_hora_envio, tipo, categoria, descricao, valor, status, is_pre_implantacao, enviado_por, emissor_pix, origem_emissor, origem_data_hora, created_at'
      )
      .eq('tenant_id', tenantId)
      .order('data_movimentacao', { ascending: true });

    if (!resV24.error && Array.isArray(resV24.data)) {
      sqlRows = resV24.data as unknown as CaixinhaDbRow[];
    } else {
      const resLegacy = await supabaseAdmin
        .from('caixinha_movimentacoes')
        .select(
          'id, encarregado_canonico, encarregado_origem, obra_nome, data_movimentacao, hora_movimentacao, tipo, categoria, descricao, valor, status, is_pre_implantacao, enviado_por, created_at'
        )
        .eq('tenant_id', tenantId)
        .order('data_movimentacao', { ascending: true });
      if (!resLegacy.error && Array.isArray(resLegacy.data)) {
        sqlRows = resLegacy.data as unknown as CaixinhaDbRow[];
      }
    }

    if (sqlRows) {
      tabelaSqlAtiva = true;
      sqlRows.forEach((row) => {
        const horaNorm = normalizarHoraHHMM(row.hora_movimentacao) || '12:00';
        const emissorNorm =
          row.tipo === 'ENTRADA_PIX'
            ? normalizarEmissorPix(row.emissor_pix || row.enviado_por) ||
              row.emissor_pix ||
              row.enviado_por ||
              null
            : row.emissor_pix
              ? normalizarEmissorPix(row.emissor_pix)
              : null;

        movimentosSql.push({
          id: row.id,
          encarregado: row.encarregado_canonico,
          encarregadoOrigem: row.encarregado_origem || row.encarregado_canonico,
          obra: row.obra_nome,
          data: row.data_movimentacao,
          hora: horaNorm,
          dataHoraEnvio:
            row.data_hora_envio ||
            montarDataHoraEnvioIso(row.data_movimentacao, horaNorm),
          tipo: row.tipo,
          categoria: row.categoria,
          descricao: row.descricao,
          valor: Number(row.valor || 0),
          status: row.status,
          isPreImplantacao: Boolean(row.is_pre_implantacao),
          enviadoPor: row.enviado_por || emissorNorm || 'Administração',
          emissorPix: emissorNorm,
          origemEmissor: row.origem_emissor || null,
          origemDataHora: row.origem_data_hora || null,
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
    const { configs, movimentos } = await lerCaixaCampo(
      activeTenant.id,
      aliasesExtras
    );
    const contas = consolidarContasCaixinha(movimentos, aliasesExtras);
    const emissoresConfig = normalizarListaEmissoresConfig(
      configs.emissores_pix_caixinha
    );
    const emissoresHistorico = movimentos
      .filter((m) => m.tipo === 'ENTRADA_PIX')
      .map((m) => m.emissorPix || m.enviadoPor);
    const emissoresPix = extrairEmissoresPixAtivos(
      emissoresConfig,
      emissoresHistorico
    );

    return NextResponse.json({
      tenant: activeTenant.slug,
      emissoresPix,
      movimentos,
      contas,
    });
  } catch (error) {
    console.error('Erro em GET /api/caixa-campo:', error);
    return NextResponse.json(
      { emissoresPix: listarEmissoresPixTenant(), movimentos: [], contas: [] },
      { status: 500 }
    );
  }
}

interface CaixaPostBody {
  action: 'registrar' | 'aprovar' | 'excluir' | 'ler-nota-ia' | 'levar-fechamento';
  id?: string;
  encarregado?: string;
  obra?: string;
  data?: string;
  hora?: string;
  dataHoraEnvio?: string;
  tipo?: TipoMovimentoCaixa;
  categoria?: string;
  descricao?: string;
  valor?: number;
  enviadoPor?: string;
  emissorPix?: string | null;
  origemEmissor?: OrigemRastreabilidadeCaixinha | null;
  origemDataHora?: OrigemRastreabilidadeCaixinha | null;
  isPreImplantacao?: boolean;
  imagemBase64?: string;
  imagemMimeType?: string;
  remetenteNome?: string | null;
  remetenteTelefone?: string | null;
  whatsappTimestamp?: number | string | null;
  arquivoLastModifiedMs?: number | null;
}

export async function POST(req: NextRequest) {
  try {
    const activeTenant = getActiveTenantFromRequest(req);
    const body = (await req.json()) as CaixaPostBody;
    const usuarioCookie = req.cookies.get('diaria_user')?.value
      ? decodeURIComponent(req.cookies.get('diaria_user')?.value || '')
      : null;

    // 1. Leitura automática de comprovante PIX ou Nota Fiscal via Gemini Vision
    //    com extração de emissor_pix, data_hora_envio e fallback inteligente para prints cortados
    if (body.action === 'ler-nota-ia' && body.imagemBase64) {
      const apiKey = (process.env.GEMINI_API_KEY || '').replace(/^"|"$/g, '');
      if (!apiKey) {
        return NextResponse.json(
          { error: 'GEMINI_API_KEY não configurada.' },
          { status: 400 }
        );
      }
      const genAI = new GoogleGenerativeAI(apiKey);
      const rawModel = (process.env.GEMINI_MODEL || '').trim();
      const safeModel =
        !rawModel || rawModel.includes('3.5-flash-lite')
          ? 'gemini-2.5-flash'
          : rawModel;
      const model = genAI.getGenerativeModel({
        model: safeModel,
        generationConfig: { responseMimeType: 'application/json' },
      });
      const clean = body.imagemBase64.replace(/^data:[^;]+;base64,/, '');

      const prompt = `Você é o motor OCR financeiro de alta precisão do sistema diaria.ai.
Analise esta imagem (comprovante de PIX de bancos como Nubank, C6, Itaú, Santander, Inter, Bradesco, tela de confirmação rápida "Sua transferência foi concluída", cupom fiscal, nota fiscal ou recibo de obra).

REGRAS ESTRITAS PARA COMPROVANTES CORTADOS OU TELA RÁPIDA (ex.: foto/print Nubank com "Sua transferência foi concluída", valor, "Para Gilvan Batista dos Santos", "Quando: Agora", sem pagador):
1. Qualquer tela de transferência/PIX concluída ("Sua transferência foi concluída", "PIX enviado", "Comprovante de transferência", "NU PAGAMENTOS") é SEMPRE "tipo": "ENTRADA_PIX" e "categoria": "Suprimento PIX".
2. NÃO INVENTE o pagador ("emissorPix"). Se a seção de pagador/origem estiver cortada ou não aparecer claramente na imagem, retorne "emissorPix": null e "comprovanteCortado": true.
3. Extraia a data ("YYYY-MM-DD") e a hora ("HH:MM") do campo oficial de data/hora da transferência (ex.: "Quando", "Data", "Horário"). Se aparecer "Agora" ou estiver cortado/ausente, retorne null.
4. Se o campo oficial de horário estiver cortado, mas o relógio da barra superior do celular aparecer no print (ex.: "14:32" no canto superior esquerdo), informe esse horário em "horaBarraStatus": "HH:MM" (caso contrário, null).
5. Em "destinatario", informe o nome de quem RECEBEU o PIX (ex.: "Gilvan Batista dos Santos" -> "Gil") ou null.

Retorne APENAS JSON puro (sem markdown):
{
  "tipo": "ENTRADA_PIX" ou "NOTA_DESPESA",
  "valor": 0.00,
  "categoria": "Material" | "Locação de Equipamento" | "Suprimento PIX" | "Combustível" | "Outros",
  "descricao": "Descrição curta e clara",
  "destinatario": "Nome de quem recebeu o PIX ou null",
  "emissorPix": "Nome de quem enviou/pagou o PIX se visível na imagem, ou null",
  "data": "YYYY-MM-DD ou null",
  "hora": "HH:MM ou null",
  "horaBarraStatus": "HH:MM do topo da tela do print se visível, ou null",
  "comprovanteCortado": true ou false
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

      const raw = res.response
        .text()
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/, '')
        .replace(/\s*```$/, '')
        .trim();
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw) as LeituraBrutaOcrCaixinha;

      const leitura = aplicarFallbackOcrCaixinha(parsed, {
        remetenteNome: body.remetenteNome || null,
        remetenteTelefone: body.remetenteTelefone || null,
        whatsappTimestamp: body.whatsappTimestamp ?? null,
        usuarioLogado: usuarioCookie,
        arquivoLastModifiedMs: body.arquivoLastModifiedMs ?? null,
      });

      return NextResponse.json({ success: true, leitura });
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
      const tipoFinal: TipoMovimentoCaixa = body.tipo || 'NOTA_DESPESA';
      const agoraBr = obterDataHoraBrasilia();
      const dataFinal = normalizarDataIso(body.data) || agoraBr.data;
      const horaFinal = normalizarHoraHHMM(body.hora) || agoraBr.hora;
      const dataHoraEnvioFinal =
        body.dataHoraEnvio || montarDataHoraEnvioIso(dataFinal, horaFinal);

      const emissorNormalizado =
        tipoFinal === 'ENTRADA_PIX'
          ? normalizarEmissorPix(
              body.emissorPix || body.enviadoPor || usuarioCookie
            ) || 'Patrícia'
          : body.emissorPix
            ? normalizarEmissorPix(body.emissorPix)
            : null;

      const enviadoPorFinal =
        emissorNormalizado ||
        normalizarEmissorPix(body.enviadoPor || usuarioCookie) ||
        'Administração';

      const novo: MovimentoCaixaCampo = {
        id: crypto.randomUUID(),
        encarregado: encarregadoCanonico,
        encarregadoOrigem: encarregadoBruto,
        obra: (body.obra || 'PISCINA PORTO SEGURO').trim().toUpperCase(),
        data: dataFinal,
        hora: horaFinal,
        dataHoraEnvio: dataHoraEnvioFinal,
        tipo: tipoFinal,
        categoria:
          body.categoria ||
          (tipoFinal === 'ENTRADA_PIX' ? 'Suprimento PIX' : 'Material'),
        descricao: (body.descricao || 'Despesa de Campo').trim(),
        valor: Number(body.valor || 0),
        status: 'PENDENTE',
        isPreImplantacao: Boolean(body.isPreImplantacao),
        enviadoPor: enviadoPorFinal,
        emissorPix: emissorNormalizado,
        origemEmissor: body.origemEmissor || 'MANUAL',
        origemDataHora: body.origemDataHora || 'MANUAL',
        criadoEm: new Date().toISOString(),
      };

      const atualizados = [novo, ...movimentos];
      await salvarCaixaCampo(activeTenant.id, paramId, configs, atualizados);

      if (tabelaSqlAtiva) {
        const { error: errV24 } = await supabaseAdmin
          .from('caixinha_movimentacoes')
          .insert({
            id: novo.id,
            tenant_id: activeTenant.id,
            encarregado_canonico: novo.encarregado,
            encarregado_origem: novo.encarregadoOrigem || novo.encarregado,
            obra_nome: novo.obra,
            data_movimentacao: novo.data,
            hora_movimentacao: novo.hora,
            data_hora_envio: novo.dataHoraEnvio,
            tipo: novo.tipo,
            categoria: novo.categoria,
            descricao: novo.descricao,
            valor: novo.valor,
            status: novo.status,
            is_pre_implantacao: Boolean(novo.isPreImplantacao),
            enviado_por: novo.enviadoPor,
            emissor_pix: novo.emissorPix,
            origem_emissor: novo.origemEmissor,
            origem_data_hora: novo.origemDataHora,
          });

        if (errV24) {
          // Fallback seguro caso ambiente antigo ainda não tenha aplicado Migration V24
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
