import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import {
  getActiveTenantFromRequest,
  normalizeTenantSlug,
  TENANTS,
} from '@/lib/tenant';
import {
  normalizarNomeObraCanonica,
  normalizarNomeTrabalhadorCanonico,
} from '@/lib/normalizarObra';
import {
  isJanelaDisparoQuinzenal,
  proximaDataDisparoQuinzenal,
} from '@/services/agendadorQuinzenal';
import {
  gerarPdfFinanceiroQuinzenalBase64,
  type LinhaFinanceiroQuinzenal,
} from '@/lib/pdfFinanceiroQuinzenal';
import { uploadToR2 } from '@/services/r2Storage';

export const dynamic = 'force-dynamic';

const DESTINATARIOS_OFICIAIS = [
  { nome: 'Daniel Lopes', telefone: '5511988139833' },
  { nome: 'Patrícia Grubel', telefone: '5511978543369' },
] as const;

interface ObraRel {
  nome: string | null;
  tipo_obra: string | null;
}

interface LancamentoQuinzenalRow {
  id: string;
  nome_trabalhador: string;
  tipo_lancamento: string;
  fracao_dia: number | string | null;
  valor_monetario: number | string | null;
  status: string;
  data_referencia: string;
  obras_config: ObraRel | ObraRel[] | null;
}

interface FuncionarioPixRow {
  nome_trabalhador: string;
  chave_pix: string | null;
}

interface CaixinhaRow {
  encarregado_canonico: string;
  tipo: 'ENTRADA_PIX' | 'NOTA_DESPESA' | 'DEVOLUCAO_TROCO';
  valor: number | string;
}

interface CronDisparoRegistro {
  dataIso: string;
  disparadoEm: string;
  arquivoNome: string;
  reciboR2Url: string | null;
  totalLiquidoAberto: number;
  destinatarios: Array<{
    nome: string;
    telefone: string;
    enviado: boolean;
    modo: string;
    erro?: string;
  }>;
}

interface CronPostBody {
  force?: boolean;
  tenantSlug?: string;
}

function extrairObra(rel: ObraRel | ObraRel[] | null | undefined): ObraRel {
  if (!rel) return { nome: null, tipo_obra: null };
  return Array.isArray(rel) ? rel[0] || { nome: null, tipo_obra: null } : rel;
}

async function obterUltimoDisparo(
  tenantId: string
): Promise<{
  paramId: string | null;
  configs: Record<string, unknown>;
  ultimoDisparo: CronDisparoRegistro | null;
}> {
  const { data } = await supabaseAdmin
    .from('parametros_sistema')
    .select('id, configuracoes')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  const configs =
    (data?.configuracoes as Record<string, unknown> | null) || {};
  const ultimo =
    (configs.ultimo_disparo_quinzenal as CronDisparoRegistro | undefined) ||
    null;

  return {
    paramId: data?.id || null,
    configs,
    ultimoDisparo: ultimo,
  };
}

export async function GET(req: NextRequest) {
  try {
    const activeTenant = getActiveTenantFromRequest(req);
    const statusJanela = isJanelaDisparoQuinzenal(new Date());
    const proximaJanela = proximaDataDisparoQuinzenal(new Date());
    const { ultimoDisparo } = await obterUltimoDisparo(activeTenant.id);

    return NextResponse.json({
      success: true,
      tenant: { id: activeTenant.id, nome: activeTenant.nome },
      regraAgendamento: '2ª e última sexta-feira do mês às 18:00 (America/Sao_Paulo)',
      proximaJanela,
      statusJanelaAtual: statusJanela,
      destinatarios: DESTINATARIOS_OFICIAIS,
      ultimoDisparo,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Erro ao consultar cron quinzenal.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    let body: CronPostBody = {};
    try {
      body = (await req.json()) as CronPostBody;
    } catch {
      body = {};
    }

    const activeTenant = body.tenantSlug
      ? TENANTS[normalizeTenantSlug(body.tenantSlug)]
      : getActiveTenantFromRequest(req);
    const force = Boolean(body.force);
    const agora = new Date();
    const janela = isJanelaDisparoQuinzenal(agora);
    const { paramId, configs, ultimoDisparo } = await obterUltimoDisparo(
      activeTenant.id
    );

    if (!force && !janela.deveDisparar) {
      return NextResponse.json({
        success: true,
        disparado: false,
        motivo: janela.motivo,
        proximaJanela: proximaDataDisparoQuinzenal(agora),
      });
    }

    if (!force && ultimoDisparo?.dataIso === janela.partes.isoDate) {
      return NextResponse.json({
        success: true,
        disparado: false,
        motivo: `Disparo quinzenal já realizado hoje (${janela.partes.isoDate}).`,
        ultimoDisparo,
      });
    }

    // 1. Consulta lançamentos do ciclo em aberto (VALIDADO) + histórico recente LIQUIDADO (30d) isolados por tenant_id
    const inicio30d = new Date(agora);
    inicio30d.setDate(agora.getDate() - 30);
    const inicio30dIso = inicio30d.toLocaleDateString('en-CA', {
      timeZone: 'America/Sao_Paulo',
    });

    const { data: lancsData, error: lancsErr } = await supabaseAdmin
      .from('lancamentos_financeiros')
      .select(`
        id,
        nome_trabalhador,
        tipo_lancamento,
        fracao_dia,
        valor_monetario,
        status,
        data_referencia,
        obras_config (
          nome,
          tipo_obra
        )
      `)
      .eq('tenant_id', activeTenant.id)
      .in('status', ['VALIDADO', 'LIQUIDADO'])
      .gte('data_referencia', inicio30dIso)
      .order('data_referencia', { ascending: true });

    if (lancsErr) {
      return NextResponse.json({ error: lancsErr.message }, { status: 500 });
    }

    const lancamentos =
      (lancsData as unknown as LancamentoQuinzenalRow[] | null) || [];

    // 2. Chaves PIX isoladas por tenant_id
    const { data: funcs } = await supabaseAdmin
      .from('funcionarios_obra')
      .select('nome_trabalhador, chave_pix')
      .eq('tenant_id', activeTenant.id);

    const mapaPix = new Map<string, string>();
    ((funcs as FuncionarioPixRow[] | null) || []).forEach((f) => {
      const canon = normalizarNomeTrabalhadorCanonico(f.nome_trabalhador);
      if (f.chave_pix) {
        mapaPix.set(canon.toUpperCase(), f.chave_pix);
      }
    });

    // 3. Caixinha em Mãos por encarregado (coluna informativa própria, sem desconto)
    const mapaCaixinha = new Map<string, number>();
    try {
      const { data: cxRows, error: cxErr } = await supabaseAdmin
        .from('caixinha_movimentacoes')
        .select('encarregado_canonico, tipo, valor')
        .eq('tenant_id', activeTenant.id);

      if (!cxErr && Array.isArray(cxRows) && cxRows.length > 0) {
        (cxRows as unknown as CaixinhaRow[]).forEach((r) => {
          const key = normalizarNomeTrabalhadorCanonico(
            r.encarregado_canonico
          ).toUpperCase();
          const val = Number(r.valor || 0);
          const delta = r.tipo === 'ENTRADA_PIX' ? val : -val;
          mapaCaixinha.set(
            key,
            Number(((mapaCaixinha.get(key) || 0) + delta).toFixed(2))
          );
        });
      } else if (activeTenant.id === TENANTS.jhoston.id) {
        // Fallback pré-implantação oficial 13/11 (Gil: 700 - 546,94 = 153,06)
        mapaCaixinha.set('GIL', 153.06);
      }
    } catch {
      if (activeTenant.id === TENANTS.jhoston.id) {
        mapaCaixinha.set('GIL', 153.06);
      }
    }

    // 4. Agrupa EXCLUSIVAMENTE saldos em aberto (VALIDADO), respeitando liquidação parcial seletiva
    let totalQuitadoAnterior = 0;
    const abertosMap = new Map<
      string,
      LinhaFinanceiroQuinzenal & { obrasSet: Set<string> }
    >();

    lancamentos.forEach((l) => {
      const valor = Number(l.valor_monetario || 0);
      if (l.status === 'LIQUIDADO') {
        totalQuitadoAnterior += l.tipo_lancamento === 'VALE' ? -valor : valor;
        return;
      }

      const nomeCanon = normalizarNomeTrabalhadorCanonico(l.nome_trabalhador);
      const chave = nomeCanon.toUpperCase();
      const obraRel = extrairObra(l.obras_config);
      const obraNome = normalizarNomeObraCanonica(
        obraRel.nome,
        obraRel.tipo_obra
      );

      if (!abertosMap.has(chave)) {
        abertosMap.set(chave, {
          nome: nomeCanon,
          obras: obraNome,
          obrasSet: new Set([obraNome]),
          chavePix: mapaPix.get(chave) || 'Não informada',
          diariasQtd: 0,
          diariasValor: 0,
          valesValor: 0,
          liquidoPagar: 0,
          caixinhaEmMaos: Math.max(0, mapaCaixinha.get(chave) || 0),
        });
      }

      const reg = abertosMap.get(chave)!;
      reg.obrasSet.add(obraNome);

      if (l.tipo_lancamento === 'PONTO') {
        reg.diariasQtd = Number(
          (reg.diariasQtd + Number(l.fracao_dia || 1)).toFixed(2)
        );
        reg.diariasValor = Number((reg.diariasValor + valor).toFixed(2));
      } else {
        reg.valesValor = Number((reg.valesValor + valor).toFixed(2));
      }
    });

    const linhas: LinhaFinanceiroQuinzenal[] = Array.from(abertosMap.values())
      .map((item) => ({
        nome: item.nome,
        obras: Array.from(item.obrasSet).join(' / '),
        chavePix: item.chavePix,
        diariasQtd: item.diariasQtd,
        diariasValor: item.diariasValor,
        valesValor: item.valesValor,
        liquidoPagar: Math.max(
          0,
          Number((item.diariasValor - item.valesValor).toFixed(2))
        ),
        caixinhaEmMaos: item.caixinhaEmMaos,
      }))
      .filter((l) => l.diariasValor > 0 || l.valesValor > 0)
      .sort((a, b) => b.liquidoPagar - a.liquidoPagar);

    const dataRefLabel = agora.toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
    });

    const pdf = gerarPdfFinanceiroQuinzenalBase64({
      empresaRazaoSocial: activeTenant.razaoSocial || activeTenant.nome,
      dataReferenciaLabel: dataRefLabel,
      linhas,
      totalQuitadoAnterior: Math.max(0, Number(totalQuitadoAnterior.toFixed(2))),
    });

    // 5. Arquiva cópia oficial no Cloudflare R2
    let reciboR2Url: string | null = null;
    const uploadRes = await uploadToR2(
      pdf.buffer,
      pdf.fileName,
      'application/pdf'
    );
    if (uploadRes.success && uploadRes.url) {
      reciboR2Url = uploadRes.url;
    }

    const legenda = [
      `📊 *RELATÓRIO FINANCEIRO QUINZENAL — ${activeTenant.nome.toUpperCase()}*`,
      `📅 Referência: ${dataRefLabel}`,
      `👥 Colaboradores em aberto: ${linhas.length}`,
      `💰 Diárias em aberto: R$ ${pdf.totalDiariasAberto.toFixed(2)}`,
      `📉 Vales em aberto: R$ ${pdf.totalValesAberto.toFixed(2)}`,
      `✅ *TOTAL LÍQUIDO PIX EM ABERTO: R$ ${pdf.totalLiquidoAberto.toFixed(2)}*`,
      `ℹ️ _Caixinha de campo informada em coluna própria (sem desconto automático na folha)._`,
      reciboR2Url ? `🔗 Link R2: ${reciboR2Url}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    // 6. Disparo exclusivo via Baileys /send-document (Base64 PDF) para Daniel e Patrícia
    const resultadosDestinatarios: CronDisparoRegistro['destinatarios'] = [];
    for (const dest of DESTINATARIOS_OFICIAIS) {
      let enviado = false;
      let modo = 'INDISPONIVEL';
      let erro: string | undefined;

      try {
        const resDoc = await fetch('http://127.0.0.1:3001/send-document', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: dest.telefone,
            base64: pdf.base64,
            fileName: pdf.fileName,
            mimetype: 'application/pdf',
            caption: legenda,
          }),
        });
        if (resDoc.ok) {
          enviado = true;
          modo = 'PDF_BASE64_NATIVO';
        } else {
          const resTxt = await fetch('http://127.0.0.1:3001/send-message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: dest.telefone, message: legenda }),
          });
          if (resTxt.ok) {
            enviado = true;
            modo = 'TEXTO_COM_LINK_R2';
          } else {
            erro = `WhatsApp status ${resDoc.status}`;
          }
        }
      } catch (err: unknown) {
        erro = err instanceof Error ? err.message : 'Serviço Baileys offline';
      }

      resultadosDestinatarios.push({
        nome: dest.nome,
        telefone: dest.telefone,
        enviado,
        modo,
        erro,
      });
    }

    const registro: CronDisparoRegistro = {
      dataIso: janela.partes.isoDate,
      disparadoEm: agora.toISOString(),
      arquivoNome: pdf.fileName,
      reciboR2Url,
      totalLiquidoAberto: pdf.totalLiquidoAberto,
      destinatarios: resultadosDestinatarios,
    };

    // 7. Registra log de deduplicação em parametros_sistema (isolado por tenant_id)
    const novasConfigs = {
      ...configs,
      ultimo_disparo_quinzenal: registro,
    };
    if (paramId) {
      await supabaseAdmin
        .from('parametros_sistema')
        .update({ configuracoes: novasConfigs })
        .eq('id', paramId)
        .eq('tenant_id', activeTenant.id);
    } else {
      await supabaseAdmin.from('parametros_sistema').insert({
        tenant_id: activeTenant.id,
        configuracoes: novasConfigs,
      });
    }

    return NextResponse.json({
      success: true,
      disparado: true,
      resumo: `${linhas.length} colaborador(es) | Líquido R$ ${pdf.totalLiquidoAberto.toFixed(2)}`,
      fileName: pdf.fileName,
      pdfBase64: pdf.base64,
      reciboR2Url,
      totalDiariasAberto: pdf.totalDiariasAberto,
      totalValesAberto: pdf.totalValesAberto,
      totalLiquidoAberto: pdf.totalLiquidoAberto,
      destinatarios: resultadosDestinatarios,
      proximaJanela: proximaDataDisparoQuinzenal(agora),
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : 'Erro ao executar disparo do relatório quinzenal.';
    console.error('[CRON-QUINZENAL] Erro:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
