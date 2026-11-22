import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getActiveTenantFromRequest } from '@/lib/tenant';
import {
  normalizarNomeObraCanonica,
  normalizarNomeTrabalhadorCanonico,
} from '@/lib/normalizarObra';
import { uploadToR2 } from '@/services/r2Storage';
import { analisarImagemPixComGemini } from '@/services/valesNlp';
import {
  deduplicarValesPreservandoMetadados,
  gerarChaveIdempotenciaVale,
} from '@/lib/valeIdempotencia';
import type { ValeEtapa } from '@/types/database';

export const dynamic = 'force-dynamic';

interface ObraRel {
  id: string;
  nome: string | null;
  tipo_obra: string | null;
}

interface ValeDbRow {
  id: string;
  tenant_id?: string;
  nome_trabalhador: string;
  valor_monetario: number | string;
  status: string;
  data_referencia: string;
  observacao: string | null;
  comprovante_url: string | null;
  comprovante_pix_url?: string | null;
  vale_etapa?: ValeEtapa | null;
  solicitado_por?: string | null;
  data_hora_solicitacao?: string | null;
  aprovado_por?: string | null;
  pago_por?: string | null;
  data_hora_envio_efetivo?: string | null;
  horario_origem?: string | null;
  chave_idempotencia?: string | null;
  liquidado_em?: string | null;
  obra_id: string | null;
  created_at: string;
  obras_config: ObraRel | ObraRel[] | null;
}

export interface ValeItemDTO {
  id: string;
  trabalhador: string;
  obraId: string | null;
  obra: string;
  data: string;
  horario: string;
  valor: number;
  status: string;
  etapa: ValeEtapa;
  solicitadoPor: string;
  dataHoraSolicitacao: string;
  aprovadoPor: string | null;
  pagoPor: string | null;
  dataHoraEnvioEfetivo: string | null;
  // Campos canônicos snake_case V15 para integração REST direta
  solicitado_por: string;
  data_hora_solicitacao: string;
  aprovado_por: string | null;
  data_hora_envio_efetivo: string | null;
  comprovantePixUrl: string | null;
  observacao: string;
}

interface ValePostBody {
  action:
    | 'criar-solicitacao'
    | 'confirmar-pix'
    | 'editar-vale'
    | 'ocr-comprovante'
    | 'descartar-vale';
  valeId?: string;
  trabalhador?: string;
  obraId?: string | null;
  obraNome?: string;
  valor?: number;
  data?: string;
  horario?: string;
  solicitadoPor?: string;
  dataHoraSolicitacao?: string;
  aprovadoPor?: string;
  pagoPor?: string;
  dataHoraEnvioEfetivo?: string;
  observacao?: string;
  imagemBase64?: string;
  imagemMimeType?: string;
  legenda?: string;
}

function extrairObraRel(rel: ObraRel | ObraRel[] | null | undefined): ObraRel | null {
  if (!rel) return null;
  return Array.isArray(rel) ? rel[0] || null : rel;
}

function resolverEtapa(row: ValeDbRow): ValeEtapa {
  if (row.vale_etapa) return row.vale_etapa;
  const temComprovante = Boolean(row.comprovante_pix_url || row.comprovante_url);
  if (row.status === 'VALIDADO' || row.status === 'LIQUIDADO' || temComprovante) {
    return 'CONCILIADO';
  }
  return 'SOLICITADO';
}

function getHojeBrasilia(): string {
  return new Date().toLocaleDateString('en-CA', {
    timeZone: 'America/Sao_Paulo',
  });
}

function getHoraBrasilia(): string {
  return new Date().toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function montarTimestampBrasiliaISO(dataIso: string, horaHm: string): string {
  const horaLimpa = /^\d{2}:\d{2}$/.test(horaHm) ? horaHm : '12:00';
  return `${dataIso}T${horaLimpa}:00-03:00`;
}

function normalizarOpcaoSolicitante(raw: string): string | null {
  const limpo = raw.trim();
  if (!limpo) return null;
  const lower = limpo
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (lower === 'whatsapp log' || lower === 'registros de origem') return null;
  if (lower === 'gil' || lower === 'gilvan' || lower.includes('gilvan')) {
    return 'Gilvan - Gil';
  }
  if (lower === 'patricia' || lower.startsWith('patricia ')) {
    return 'Patrícia';
  }
  if (lower === 'daniel' || lower.startsWith('daniel ')) {
    return 'Daniel';
  }
  return normalizarNomeTrabalhadorCanonico(limpo);
}

function montarSolicitantesPorTenant(
  tenantSlug: string,
  trabalhadoresTenant: readonly string[],
  solicitantesHistoricos: readonly string[]
): { solicitantes: string[]; solicitantePadrao: string } {
  const basePrioritaria =
    tenantSlug === 'intermack'
      ? ['Daniel', 'Patrícia']
      : ['Gilvan - Gil', 'Patrícia', 'Daniel', 'Joabson', 'Manoel'];

  const vistos = new Set<string>();
  const lista: string[] = [];

  const adicionar = (valor: string | null) => {
    if (!valor) return;
    const chave = valor
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    if (vistos.has(chave)) return;
    vistos.add(chave);
    lista.push(valor);
  };

  for (const item of basePrioritaria) adicionar(item);
  for (const hist of solicitantesHistoricos) {
    adicionar(normalizarOpcaoSolicitante(hist));
  }
  for (const trab of trabalhadoresTenant) {
    adicionar(normalizarOpcaoSolicitante(trab));
  }

  return {
    solicitantes: lista,
    solicitantePadrao:
      tenantSlug === 'intermack' ? lista[0] || 'Daniel' : 'Gilvan - Gil',
  };
}

export async function GET(req: NextRequest) {
  try {
    const activeTenant = getActiveTenantFromRequest(req);
    const tenantId = activeTenant.id;

    let rows: ValeDbRow[] = [];
    const resV15 = await supabaseAdmin
      .from('lancamentos_financeiros')
      .select(`
        id,
        tenant_id,
        nome_trabalhador,
        valor_monetario,
        status,
        data_referencia,
        observacao,
        comprovante_url,
        comprovante_pix_url,
        vale_etapa,
        solicitado_por,
        data_hora_solicitacao,
        aprovado_por,
        pago_por,
        data_hora_envio_efetivo,
        horario_origem,
        chave_idempotencia,
        liquidado_em,
        obra_id,
        created_at,
        obras_config ( id, nome, tipo_obra )
      `)
      .eq('tenant_id', tenantId)
      .eq('tipo_lancamento', 'VALE')
      .neq('status', 'DESCARTADO')
      .order('data_referencia', { ascending: false })
      .order('created_at', { ascending: false });

    if (resV15.error) {
      const resV11 = await supabaseAdmin
        .from('lancamentos_financeiros')
        .select(`
          id,
          tenant_id,
          nome_trabalhador,
          valor_monetario,
          status,
          data_referencia,
          observacao,
          comprovante_url,
          comprovante_pix_url,
          vale_etapa,
          solicitado_por,
          pago_por,
          horario_origem,
          obra_id,
          created_at,
          obras_config ( id, nome, tipo_obra )
        `)
        .eq('tenant_id', tenantId)
        .eq('tipo_lancamento', 'VALE')
        .neq('status', 'DESCARTADO')
        .order('data_referencia', { ascending: false })
        .order('created_at', { ascending: false });

      if (resV11.error) {
        const resBasic = await supabaseAdmin
          .from('lancamentos_financeiros')
          .select(`
            id,
            tenant_id,
            nome_trabalhador,
            valor_monetario,
            status,
            data_referencia,
            observacao,
            comprovante_url,
            obra_id,
            created_at,
            obras_config ( id, nome, tipo_obra )
          `)
          .eq('tenant_id', tenantId)
          .eq('tipo_lancamento', 'VALE')
          .neq('status', 'DESCARTADO')
          .order('data_referencia', { ascending: false })
          .order('created_at', { ascending: false });

        rows = (resBasic.data as unknown as ValeDbRow[] | null) || [];
      } else {
        rows = (resV11.data as unknown as ValeDbRow[] | null) || [];
      }
    } else {
      rows = (resV15.data as unknown as ValeDbRow[] | null) || [];
    }

    // Deduplicação defensiva preservando sempre os metadados mais completos por tenant_id
    const rowsComTenant = rows.map((r) => ({
      ...r,
      tenant_id: r.tenant_id || tenantId,
    }));
    const { unicos: rowsUnicos } =
      deduplicarValesPreservandoMetadados(rowsComTenant);

    const [{ data: funcs }, { data: obras }] = await Promise.all([
      supabaseAdmin
        .from('funcionarios_obra')
        .select('id, nome_trabalhador')
        .eq('tenant_id', tenantId)
        .eq('ativo', true)
        .order('nome_trabalhador', { ascending: true }),
      supabaseAdmin
        .from('obras_config')
        .select('id, nome, tipo_obra')
        .eq('tenant_id', tenantId)
        .eq('ativo', true)
        .order('nome', { ascending: true }),
    ]);

    const vales: ValeItemDTO[] = rowsUnicos.map((row) => {
      const obraRel = extrairObraRel(row.obras_config);
      const etapa = resolverEtapa(row);
      const hora =
        row.horario_origem ||
        new Date(row.created_at).toLocaleTimeString('pt-BR', {
          timeZone: 'America/Sao_Paulo',
          hour: '2-digit',
          minute: '2-digit',
        });

      const solicitadoPor = row.solicitado_por || 'Gilvan - Gil';
      const dataHoraSolicitacao =
        row.data_hora_solicitacao ||
        montarTimestampBrasiliaISO(row.data_referencia, hora);
      const aprovadoPor =
        row.aprovado_por ||
        row.pago_por ||
        (etapa === 'CONCILIADO' ? 'Patrícia Grubel' : null);
      const dataHoraEnvioEfetivo =
        row.data_hora_envio_efetivo ||
        (etapa === 'CONCILIADO'
          ? row.liquidado_em || row.created_at
          : null);

      return {
        id: row.id,
        trabalhador: normalizarNomeTrabalhadorCanonico(row.nome_trabalhador),
        obraId: row.obra_id,
        obra: normalizarNomeObraCanonica(obraRel?.nome, obraRel?.tipo_obra),
        data: row.data_referencia,
        horario: hora,
        valor: Number(row.valor_monetario || 0),
        status: row.status,
        etapa,
        solicitadoPor,
        dataHoraSolicitacao,
        aprovadoPor,
        pagoPor: aprovadoPor,
        dataHoraEnvioEfetivo,
        solicitado_por: solicitadoPor,
        data_hora_solicitacao: dataHoraSolicitacao,
        aprovado_por: aprovadoPor,
        data_hora_envio_efetivo: dataHoraEnvioEfetivo,
        comprovantePixUrl:
          row.comprovante_pix_url || row.comprovante_url || null,
        observacao: row.observacao || 'Vale adiantamento',
      };
    });

    const pendentesEnvio = vales.filter((v) => v.etapa === 'SOLICITADO');
    const confirmados = vales.filter(
      (v) => v.etapa === 'CONCILIADO' || v.etapa === 'PIX_ENVIADO'
    );

    const trabalhadoresUnicos = Array.from(
      new Set(
        ((funcs as Array<{ nome_trabalhador: string }> | null) || []).map((f) =>
          normalizarNomeTrabalhadorCanonico(f.nome_trabalhador)
        )
      )
    ).sort();

    const obrasLista = ((obras as ObraRel[] | null) || []).map((o) => ({
      id: o.id,
      nome: normalizarNomeObraCanonica(o.nome, o.tipo_obra),
    }));

    const { solicitantes, solicitantePadrao } = montarSolicitantesPorTenant(
      activeTenant.slug,
      trabalhadoresUnicos,
      vales.map((v) => v.solicitadoPor)
    );

    return NextResponse.json({
      tenant: activeTenant.slug,
      kpis: {
        aguardandoEnvioPixQtd: pendentesEnvio.length,
        aguardandoEnvioPixValor: Number(
          pendentesEnvio.reduce((acc, v) => acc + v.valor, 0).toFixed(2)
        ),
        confirmadosQtd: confirmados.length,
        confirmadosValor: Number(
          confirmados.reduce((acc, v) => acc + v.valor, 0).toFixed(2)
        ),
        totalQtd: vales.length,
        totalValor: Number(
          vales.reduce((acc, v) => acc + v.valor, 0).toFixed(2)
        ),
      },
      vales,
      trabalhadores: trabalhadoresUnicos,
      obras: obrasLista,
      solicitantes,
      solicitantePadrao,
    });
  } catch (error) {
    console.error('Erro em GET /api/vales:', error);
    return NextResponse.json(
      { error: 'Falha ao carregar controle de vales.' },
      { status: 500 }
    );
  }
}

async function resolverObraId(
  tenantId: string,
  obraId?: string | null,
  obraNome?: string
): Promise<string | null> {
  if (obraId) return obraId;
  if (!obraNome) return null;
  const nomeCanon = normalizarNomeObraCanonica(obraNome);
  const { data } = await supabaseAdmin
    .from('obras_config')
    .select('id')
    .eq('tenant_id', tenantId)
    .ilike('nome', nomeCanon)
    .limit(1)
    .maybeSingle();
  return data?.id || null;
}

export async function POST(req: NextRequest) {
  try {
    const activeTenant = getActiveTenantFromRequest(req);
    const tenantId = activeTenant.id;
    const body = (await req.json()) as ValePostBody;

    // 1. OCR Gemini Vision para Solicitação ou Comprovante PIX (sobe no Cloudflare R2 + sugere pareamento)
    if (body.action === 'ocr-comprovante' && body.imagemBase64) {
      let comprovanteUrl: string | null = null;
      try {
        const clean = body.imagemBase64.replace(/^data:[^;]+;base64,/, '');
        const buffer = Buffer.from(clean, 'base64');
        const ext = (body.imagemMimeType || 'image/jpeg').includes('png')
          ? 'png'
          : 'jpg';
        const uploadRes = await uploadToR2(
          buffer,
          `vale-pix-${activeTenant.slug}-${Date.now()}.${ext}`,
          body.imagemMimeType || 'image/jpeg'
        );
        if (uploadRes.success) comprovanteUrl = uploadRes.url;
      } catch (errUp) {
        console.warn('[VALES OCR] Aviso ao subir comprovante para R2:', errUp);
      }

      const leitura = await analisarImagemPixComGemini({
        imagemBase64: body.imagemBase64,
        mimeType: body.imagemMimeType,
        legenda: body.legenda,
      });

      // Buscar solicitação em aberto compatível para pareamento em 1 clique
      let solicitacaoSugeridaId: string | null = null;
      if (leitura.nomeTrabalhador) {
        const { data: abertos } = await supabaseAdmin
          .from('lancamentos_financeiros')
          .select('id, nome_trabalhador, valor_monetario, vale_etapa, status')
          .eq('tenant_id', tenantId)
          .eq('tipo_lancamento', 'VALE')
          .eq('status', 'PENDENTE')
          .order('created_at', { ascending: false });

        const match = (
          (abertos as Array<{
            id: string;
            nome_trabalhador: string;
            valor_monetario: number | string;
          }> | null) || []
        ).find(
          (a) =>
            normalizarNomeTrabalhadorCanonico(a.nome_trabalhador).toUpperCase() ===
            leitura.nomeTrabalhador?.toUpperCase()
        );
        if (match) solicitacaoSugeridaId = match.id;
      }

      return NextResponse.json({
        success: true,
        leitura,
        comprovanteUrl,
        solicitacaoSugeridaId,
      });
    }

    // 2. Etapa 1: Criar Solicitação de Vale (padrão R$ 100,00 se valor omitido)
    if (body.action === 'criar-solicitacao') {
      if (!body.trabalhador?.trim()) {
        return NextResponse.json(
          { error: 'Selecione o trabalhador no dropdown.' },
          { status: 400 }
        );
      }
      const trabalhadorCanonico = normalizarNomeTrabalhadorCanonico(
        body.trabalhador
      );
      const valorFinal =
        body.valor !== undefined && Number(body.valor) > 0
          ? Number(body.valor)
          : 100.0;
      const obraIdResolvido = await resolverObraId(
        tenantId,
        body.obraId,
        body.obraNome
      );
      const dataRef = body.data || getHojeBrasilia();
      const horaRef = body.horario || getHoraBrasilia();
      const dataHoraSol =
        body.dataHoraSolicitacao || montarTimestampBrasiliaISO(dataRef, horaRef);
      const solicitanteFinal = body.solicitadoPor?.trim() || 'Gilvan - Gil';

      const chaveIdempotencia = gerarChaveIdempotenciaVale({
        tenantId,
        trabalhador: trabalhadorCanonico,
        dataReferencia: dataRef,
        janelaSolicitacao: horaRef,
        valor: valorFinal,
      });

      const { data: valeExistente } = await supabaseAdmin
        .from('lancamentos_financeiros')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('chave_idempotencia', chaveIdempotencia)
        .neq('status', 'DESCARTADO')
        .limit(1)
        .maybeSingle();

      if (valeExistente?.id) {
        return NextResponse.json({
          success: true,
          id: valeExistente.id,
          duplicataEvitada: true,
          chave_idempotencia: chaveIdempotencia,
          solicitado_por: solicitanteFinal,
          data_hora_solicitacao: dataHoraSol,
          message: `Solicitação já registrada anteriormente para ${trabalhadorCanonico} nesta janela (idempotência ativa — duplicata evitada).`,
        });
      }

      let resInsert = await supabaseAdmin
        .from('lancamentos_financeiros')
        .insert({
          tenant_id: tenantId,
          obra_id: obraIdResolvido,
          nome_trabalhador: trabalhadorCanonico,
          tipo_lancamento: 'VALE',
          fracao_dia: 0,
          valor_monetario: valorFinal,
          status: 'PENDENTE',
          data_referencia: dataRef,
          observacao:
            body.observacao?.trim() ||
            `Solicitação de Vale (${solicitanteFinal}) — aguardando envio PIX`,
          vale_etapa: 'SOLICITADO',
          solicitado_por: solicitanteFinal,
          data_hora_solicitacao: dataHoraSol,
          horario_origem: horaRef,
          chave_idempotencia: chaveIdempotencia,
        })
        .select('id')
        .single();

      if (resInsert.error) {
        resInsert = await supabaseAdmin
          .from('lancamentos_financeiros')
          .insert({
            tenant_id: tenantId,
            obra_id: obraIdResolvido,
            nome_trabalhador: trabalhadorCanonico,
            tipo_lancamento: 'VALE',
            fracao_dia: 0,
            valor_monetario: valorFinal,
            status: 'PENDENTE',
            data_referencia: dataRef,
            observacao:
              body.observacao?.trim() ||
              `Solicitação de Vale (${solicitanteFinal}) — aguardando envio PIX`,
            vale_etapa: 'SOLICITADO',
            solicitado_por: solicitanteFinal,
            horario_origem: horaRef,
          })
          .select('id')
          .single();
      }

      if (resInsert.error) {
        return NextResponse.json({ error: resInsert.error.message }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        id: resInsert.data?.id,
        chave_idempotencia: chaveIdempotencia,
        solicitado_por: solicitanteFinal,
        data_hora_solicitacao: dataHoraSol,
        message: `Etapa 1 registrada: Vale de R$ ${valorFinal.toFixed(2)} para ${trabalhadorCanonico} (aguardando PIX).`,
      });
    }

    // 3. Etapa 2: Confirmar Envio / Comprovante PIX (ativa imediatamente no Borderô e Extrato)
    if (body.action === 'confirmar-pix') {
      let comprovantePixUrl: string | null = null;
      if (body.imagemBase64) {
        const clean = body.imagemBase64.replace(/^data:[^;]+;base64,/, '');
        const buffer = Buffer.from(clean, 'base64');
        const ext = (body.imagemMimeType || 'image/jpeg').includes('png')
          ? 'png'
          : 'jpg';
        const uploadRes = await uploadToR2(
          buffer,
          `pix-vale-confirmado-${activeTenant.slug}-${Date.now()}.${ext}`,
          body.imagemMimeType || 'image/jpeg'
        );
        if (uploadRes.success) comprovantePixUrl = uploadRes.url;
      }

      const agoraIso = new Date().toISOString();
      const pagador = body.aprovadoPor || body.pagoPor || 'Patrícia Grubel';
      const dataHoraEnvio = body.dataHoraEnvioEfetivo || agoraIso;

      if (body.valeId) {
        const updatePayload: Record<string, unknown> = {
          status: 'VALIDADO',
          vale_etapa: 'CONCILIADO',
          aprovado_por: pagador,
          pago_por: pagador,
          data_hora_envio_efetivo: dataHoraEnvio,
          updated_at: agoraIso,
        };
        if (comprovantePixUrl) {
          updatePayload.comprovante_url = comprovantePixUrl;
          updatePayload.comprovante_pix_url = comprovantePixUrl;
        }
        if (body.valor !== undefined && Number(body.valor) > 0) {
          updatePayload.valor_monetario = Number(body.valor);
        }
        if (body.trabalhador) {
          updatePayload.nome_trabalhador = normalizarNomeTrabalhadorCanonico(
            body.trabalhador
          );
        }
        if (body.obraId !== undefined || body.obraNome) {
          updatePayload.obra_id = await resolverObraId(
            tenantId,
            body.obraId,
            body.obraNome
          );
        }
        if (body.observacao) {
          updatePayload.observacao = body.observacao;
        }

        let resUpd = await supabaseAdmin
          .from('lancamentos_financeiros')
          .update(updatePayload)
          .eq('tenant_id', tenantId)
          .eq('id', body.valeId);

        if (resUpd.error) {
          const fallbackPayload = { ...updatePayload };
          delete fallbackPayload.aprovado_por;
          delete fallbackPayload.data_hora_envio_efetivo;
          resUpd = await supabaseAdmin
            .from('lancamentos_financeiros')
            .update(fallbackPayload)
            .eq('tenant_id', tenantId)
            .eq('id', body.valeId);
        }

        if (resUpd.error) {
          return NextResponse.json({ error: resUpd.error.message }, { status: 500 });
        }

        return NextResponse.json({
          success: true,
          comprovantePixUrl,
          aprovado_por: pagador,
          data_hora_envio_efetivo: dataHoraEnvio,
          message:
            'Etapa 2 concluída! Comprovante PIX vinculado e vale disponível no Fechamento & Extrato.',
        });
      }

      // Se não havia solicitação prévia, registra direto já conciliado (Etapa 1 + Etapa 2)
      if (!body.trabalhador?.trim()) {
        return NextResponse.json(
          { error: 'Informe o trabalhador para registrar o comprovante PIX.' },
          { status: 400 }
        );
      }
      const trabalhadorCanonico = normalizarNomeTrabalhadorCanonico(
        body.trabalhador
      );
      const valorFinal =
        body.valor !== undefined && Number(body.valor) > 0
          ? Number(body.valor)
          : 100.0;
      const obraIdResolvido = await resolverObraId(
        tenantId,
        body.obraId,
        body.obraNome
      );
      const dataRef = body.data || getHojeBrasilia();
      const horaRef = body.horario || getHoraBrasilia();
      const solicitanteFinal = body.solicitadoPor?.trim() || 'Gilvan - Gil';
      const dataHoraSol =
        body.dataHoraSolicitacao || montarTimestampBrasiliaISO(dataRef, horaRef);
      const chaveIdempotencia = gerarChaveIdempotenciaVale({
        tenantId,
        trabalhador: trabalhadorCanonico,
        dataReferencia: dataRef,
        janelaSolicitacao: horaRef,
        valor: valorFinal,
      });

      const { data: valeExistentePix } = await supabaseAdmin
        .from('lancamentos_financeiros')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('chave_idempotencia', chaveIdempotencia)
        .neq('status', 'DESCARTADO')
        .limit(1)
        .maybeSingle();

      if (valeExistentePix?.id) {
        const enrichPayload: Record<string, unknown> = {
          status: 'VALIDADO',
          vale_etapa: 'CONCILIADO',
          aprovado_por: pagador,
          pago_por: pagador,
          data_hora_envio_efetivo: dataHoraEnvio,
          updated_at: agoraIso,
        };
        if (comprovantePixUrl) {
          enrichPayload.comprovante_url = comprovantePixUrl;
          enrichPayload.comprovante_pix_url = comprovantePixUrl;
        }
        await supabaseAdmin
          .from('lancamentos_financeiros')
          .update(enrichPayload)
          .eq('tenant_id', tenantId)
          .eq('id', valeExistentePix.id);

        return NextResponse.json({
          success: true,
          id: valeExistentePix.id,
          duplicataEvitada: true,
          comprovantePixUrl,
          solicitado_por: solicitanteFinal,
          data_hora_solicitacao: dataHoraSol,
          aprovado_por: pagador,
          data_hora_envio_efetivo: dataHoraEnvio,
          message: `Comprovante PIX vinculado ao vale existente de ${trabalhadorCanonico} (idempotência ativa — sem duplicar).`,
        });
      }

      let resInsert2 = await supabaseAdmin
        .from('lancamentos_financeiros')
        .insert({
          tenant_id: tenantId,
          obra_id: obraIdResolvido,
          nome_trabalhador: trabalhadorCanonico,
          tipo_lancamento: 'VALE',
          fracao_dia: 0,
          valor_monetario: valorFinal,
          status: 'VALIDADO',
          data_referencia: dataRef,
          observacao:
            body.observacao?.trim() || `Vale confirmado via PIX (${pagador})`,
          comprovante_url: comprovantePixUrl,
          comprovante_pix_url: comprovantePixUrl,
          vale_etapa: 'CONCILIADO',
          solicitado_por: solicitanteFinal,
          data_hora_solicitacao: dataHoraSol,
          aprovado_por: pagador,
          pago_por: pagador,
          data_hora_envio_efetivo: dataHoraEnvio,
          horario_origem: horaRef,
          chave_idempotencia: chaveIdempotencia,
        })
        .select('id')
        .single();

      if (resInsert2.error) {
        resInsert2 = await supabaseAdmin
          .from('lancamentos_financeiros')
          .insert({
            tenant_id: tenantId,
            obra_id: obraIdResolvido,
            nome_trabalhador: trabalhadorCanonico,
            tipo_lancamento: 'VALE',
            fracao_dia: 0,
            valor_monetario: valorFinal,
            status: 'VALIDADO',
            data_referencia: dataRef,
            observacao:
              body.observacao?.trim() || `Vale confirmado via PIX (${pagador})`,
            comprovante_url: comprovantePixUrl,
            comprovante_pix_url: comprovantePixUrl,
            vale_etapa: 'CONCILIADO',
            solicitado_por: solicitanteFinal,
            pago_por: pagador,
            horario_origem: horaRef,
          })
          .select('id')
          .single();
      }

      if (resInsert2.error) {
        return NextResponse.json({ error: resInsert2.error.message }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        id: resInsert2.data?.id,
        chave_idempotencia: chaveIdempotencia,
        comprovantePixUrl,
        solicitado_por: solicitanteFinal,
        data_hora_solicitacao: dataHoraSol,
        aprovado_por: pagador,
        data_hora_envio_efetivo: dataHoraEnvio,
        message: `Vale de R$ ${valorFinal.toFixed(2)} para ${trabalhadorCanonico} confirmado via PIX e sincronizado no painel!`,
      });
    }

    // 4. Editar trabalhador, obra, valor ou data via dropdowns
    if (body.action === 'editar-vale' && body.valeId) {
      const updates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (body.trabalhador) {
        updates.nome_trabalhador = normalizarNomeTrabalhadorCanonico(
          body.trabalhador
        );
      }
      if (body.obraId !== undefined || body.obraNome) {
        updates.obra_id = await resolverObraId(
          tenantId,
          body.obraId,
          body.obraNome
        );
      }
      if (body.valor !== undefined && Number(body.valor) >= 0) {
        updates.valor_monetario = Number(body.valor);
      }
      if (body.data) {
        updates.data_referencia = body.data;
      }
      if (body.observacao !== undefined) {
        updates.observacao = body.observacao;
      }

      const { error } = await supabaseAdmin
        .from('lancamentos_financeiros')
        .update(updates)
        .eq('tenant_id', tenantId)
        .eq('id', body.valeId);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({
        success: true,
        message: 'Vale atualizado com sucesso!',
      });
    }

    // 5. Descartar (Soft Delete auditado)
    if (body.action === 'descartar-vale' && body.valeId) {
      const { error } = await supabaseAdmin
        .from('lancamentos_financeiros')
        .update({
          status: 'DESCARTADO',
          updated_at: new Date().toISOString(),
        })
        .eq('tenant_id', tenantId)
        .eq('id', body.valeId);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({
        success: true,
        message: 'Vale descartado (Soft Delete auditado).',
      });
    }

    return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
  } catch (error) {
    console.error('Erro em POST /api/vales:', error);
    return NextResponse.json(
      { error: 'Falha ao processar operação de vale.' },
      { status: 500 }
    );
  }
}
