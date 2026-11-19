import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getActiveTenantFromRequest } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

interface ObraConfigRow {
  nome: string | null;
  tipo_obra: string | null;
}

interface PontoDetalheRow {
  id: string;
  nome_trabalhador: string;
  fracao_dia: number | string | null;
  motivo_excecao: string | null;
}

interface LancamentoFinanceiroRow {
  id: string;
  nome_trabalhador: string | null;
  tipo_lancamento?: string | null;
  status?: string | null;
  comprovante_url?: string | null;
  valor_monetario?: number | string | null;
  data_referencia?: string | null;
  observacao?: string | null;
  ponto_lote_id?: string | null;
  created_at?: string | null;
  obras_config?: { nome: string | null } | null;
}

interface PontoLoteRow {
  id: string;
  obra_id: string | null;
  data_referencia: string;
  texto_original: string | null;
  status_validacao: string;
  token_aprovacao: string | null;
  created_at?: string | null;
  obras_config: ObraConfigRow | null;
  ponto_detalhe: PontoDetalheRow[] | null;
  lancamentos_financeiros: LancamentoFinanceiroRow[] | null;
}

interface FuncionarioRow {
  nome_trabalhador: string;
  valor_diaria: number | string | null;
  valor_diaria_obra: number | string | null;
  valor_diaria_piscina: number | string | null;
}

export interface PendenteItemDTO {
  id: string;
  lancamentoId?: string;
  loteId: string;
  obra: string;
  data: string;
  trabalhador: string;
  fracao: number;
  tipo: 'PONTO' | 'VALE';
  motivo: string;
  origem: string;
  timestampOriginal: string | null;
  horarioMensagem: string;
  mensagemOriginal: string | null;
  sha256Hash: string | null;
  valorDiariaBase: number;
  comprovanteUrl: string | null;
}

export interface MensagemPendenteDTO {
  loteId: string;
  obra: string;
  data: string;
  origem: string;
  horarioMensagem: string;
  timestampOriginal: string | null;
  mensagemOriginal: string | null;
  sha256Hash: string | null;
  createdAt: string | null;
  itens: PendenteItemDTO[];
}

function extrairMetadadosMensagem(
  textoOriginal: string | null,
  createdAt: string | null | undefined
): {
  origem: string;
  timestampOriginal: string | null;
  horarioMensagem: string;
  mensagemOriginal: string | null;
  sha256Hash: string | null;
} {
  const texto = textoOriginal || '';
  let origem = 'WhatsApp Oficial';
  let timestampOriginal: string | null = null;
  let sha256Hash: string | null = null;
  let mensagemOriginal: string | null = null;

  if (texto.includes('[ORIGEM_WHATSAPP]')) {
    const matchRem = texto.match(/Remetente:\s*([^\n]+)/);
    const matchTime = texto.match(/Timestamp:\s*([^\n]+)/);
    const matchHash = texto.match(/SHA256:\s*([^\n]+)/);
    const idxMsg = texto.indexOf('[MENSAGEM_ORIGINAL]');

    if (matchRem) origem = `Zap: ${matchRem[1].trim()}`;
    if (matchTime) timestampOriginal = matchTime[1].trim();
    if (matchHash) sha256Hash = matchHash[1].trim();
    if (idxMsg !== -1) {
      mensagemOriginal = texto
        .slice(idxMsg + '[MENSAGEM_ORIGINAL]'.length)
        .trim();
    }
  } else if (texto.trim().length > 0) {
    mensagemOriginal = texto.trim();
  }

  // Extrai HH:MM do Timestamp de Brasília ou do created_at
  let horarioMensagem = '--:--';
  if (timestampOriginal) {
    const matchHora = timestampOriginal.match(/(\d{2}:\d{2})/);
    if (matchHora) {
      horarioMensagem = matchHora[1];
    }
  }
  if (horarioMensagem === '--:--' && createdAt) {
    const dt = new Date(createdAt);
    if (!Number.isNaN(dt.getTime())) {
      horarioMensagem = dt.toLocaleTimeString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
  }

  return {
    origem,
    timestampOriginal,
    horarioMensagem,
    mensagemOriginal,
    sha256Hash,
  };
}

export async function GET(req: NextRequest) {
  try {
    const activeTenant = getActiveTenantFromRequest(req);
    const tenantId = activeTenant.id;
    // 1. Buscar lotes PENDENTES
    let lotes: PontoLoteRow[] | null = null;
    let queryError: unknown = null;

    const resComprovante = await supabaseAdmin
      .from('ponto_lote')
      .select(`
        id,
        obra_id,
        data_referencia,
        texto_original,
        status_validacao,
        token_aprovacao,
        created_at,
        obras_config (
          nome,
          tipo_obra
        ),
        ponto_detalhe (
          id,
          nome_trabalhador,
          fracao_dia,
          motivo_excecao
        ),
        lancamentos_financeiros (
          id,
          nome_trabalhador,
          tipo_lancamento,
          status,
          comprovante_url
        )
      `)
      .eq('tenant_id', tenantId)
      .eq('status_validacao', 'PENDENTE')
      .order('created_at', { ascending: false });

    if (resComprovante.error) {
      const resFallback = await supabaseAdmin
        .from('ponto_lote')
        .select(`
          id,
          obra_id,
          data_referencia,
          texto_original,
          status_validacao,
          token_aprovacao,
          created_at,
          obras_config (
            nome,
            tipo_obra
          ),
          ponto_detalhe (
            id,
            nome_trabalhador,
            fracao_dia,
            motivo_excecao
          ),
          lancamentos_financeiros (
            id,
            nome_trabalhador,
            tipo_lancamento,
            status
          )
        `)
        .eq('tenant_id', tenantId)
        .eq('status_validacao', 'PENDENTE')
        .order('created_at', { ascending: false });

      lotes = (resFallback.data as unknown as PontoLoteRow[]) || null;
      queryError = resFallback.error;
    } else {
      lotes = (resComprovante.data as unknown as PontoLoteRow[]) || null;
    }

    if (queryError) {
      console.error('Erro ao buscar pendentes:', queryError);
      return NextResponse.json({
        pendentes: [],
        mensagens: [],
        dataCorteOperacional: null,
      });
    }

    // 2. Buscar regras configuradas e data de corte operacional
    const { data: paramData } = await supabaseAdmin
      .from('parametros_sistema')
      .select('configuracoes')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    const configs = (paramData?.configuracoes || {}) as Record<string, unknown>;
    const dataCorteOperacional =
      typeof configs.data_corte_operacional === 'string'
        ? configs.data_corte_operacional
        : null;

    const regras = {
      dia_viagem_padrao: Number(configs.dia_viagem_padrao ?? 120.0),
      dia_chuva_padrao: Number(configs.dia_chuva_padrao ?? 120.0),
      dia_parado_padrao: Number(configs.dia_parado_padrao ?? 120.0),
      diaria_piscina_padrao: Number(configs.diaria_piscina_padrao ?? 150.0),
      diaria_civil_padrao: Number(configs.diaria_civil_padrao ?? 180.0),
    };

    // 3. Buscar valores individuais dos colaboradores (Obra Civil vs Piscina)
    const { data: funcsData } = await supabaseAdmin
      .from('funcionarios_obra')
      .select('nome_trabalhador, valor_diaria, valor_diaria_obra, valor_diaria_piscina')
      .eq('tenant_id', tenantId);

    const mapaFuncs = new Map<string, FuncionarioRow>();
    ((funcsData as unknown as FuncionarioRow[]) || []).forEach((f) => {
      if (f.nome_trabalhador) {
        mapaFuncs.set(f.nome_trabalhador.trim().toUpperCase(), f);
      }
    });

    const itens: PendenteItemDTO[] = [];
    const mensagensMap = new Map<string, MensagemPendenteDTO>();

    (lotes || []).forEach((lote) => {
      const obraNome = lote.obras_config?.nome || 'CANTEIRO VOLANTE';
      const tipoObra = lote.obras_config?.tipo_obra || 'PISCINA';
      const detalhes = lote.ponto_detalhe || [];
      const lancamentos = (lote.lancamentos_financeiros || []).filter(
        (l) => l.status !== 'DESCARTADO'
      );

      const meta = extrairMetadadosMensagem(lote.texto_original, lote.created_at);

      const valorBasePadrao =
        tipoObra === 'OBRA_CIVIL'
          ? regras.diaria_civil_padrao
          : regras.diaria_piscina_padrao;

      const grupoMensagem: MensagemPendenteDTO = {
        loteId: lote.id,
        obra: obraNome,
        data: lote.data_referencia,
        origem: meta.origem,
        horarioMensagem: meta.horarioMensagem,
        timestampOriginal: meta.timestampOriginal,
        mensagemOriginal: meta.mensagemOriginal,
        sha256Hash: meta.sha256Hash,
        createdAt: lote.created_at || null,
        itens: [],
      };

      detalhes.forEach((d) => {
        const lancPonto = lancamentos.find(
          (l) =>
            l.tipo_lancamento === 'PONTO' &&
            l.nome_trabalhador?.trim().toLowerCase() ===
              d.nome_trabalhador?.trim().toLowerCase()
        );
        const lancComprovante =
          lancamentos.find(
            (l) =>
              l.nome_trabalhador?.trim().toLowerCase() ===
                d.nome_trabalhador?.trim().toLowerCase() && l.comprovante_url
          ) || lancamentos.find((l) => l.comprovante_url);

        const nomeUpper = (d.nome_trabalhador || '').trim().toUpperCase();
        const funcInfo =
          mapaFuncs.get(nomeUpper) ||
          Array.from(mapaFuncs.values()).find((f) =>
            f.nome_trabalhador.toUpperCase().includes(nomeUpper)
          );

        let valorIndividual = valorBasePadrao;
        if (funcInfo) {
          if (tipoObra === 'PISCINA') {
            valorIndividual = Number(
              funcInfo.valor_diaria_piscina ??
                funcInfo.valor_diaria ??
                valorBasePadrao
            );
          } else {
            valorIndividual = Number(
              funcInfo.valor_diaria_obra ??
                funcInfo.valor_diaria ??
                valorBasePadrao
            );
          }
        }

        const motivo = (d.motivo_excecao || '').toUpperCase();
        let valorCalculado = valorIndividual;

        if (
          motivo.includes('VIAGEM_PASSAGEIRO') ||
          (motivo.includes('VIAGEM') && !motivo.includes('MOTORISTA'))
        ) {
          valorCalculado = regras.dia_viagem_padrao;
        } else if (motivo.includes('CHUVA')) {
          valorCalculado = regras.dia_chuva_padrao;
        } else if (
          motivo.includes('PARADO') ||
          motivo.includes('SEM ACESSO') ||
          motivo.includes('CONDOMINIO')
        ) {
          valorCalculado = regras.dia_parado_padrao;
        } else if (motivo.includes('VIAGEM_MOTORISTA')) {
          valorCalculado = valorIndividual;
        }

        const itemDTO: PendenteItemDTO = {
          id: d.id,
          lancamentoId: lancPonto?.id,
          loteId: lote.id,
          obra: obraNome,
          data: lote.data_referencia,
          trabalhador: d.nome_trabalhador,
          fracao: Number(d.fracao_dia) || 1.0,
          tipo: 'PONTO',
          motivo: d.motivo_excecao || 'Apontamento via WhatsApp',
          origem: meta.origem,
          timestampOriginal: meta.timestampOriginal,
          horarioMensagem: meta.horarioMensagem,
          mensagemOriginal: meta.mensagemOriginal,
          sha256Hash: meta.sha256Hash,
          valorDiariaBase: valorCalculado,
          comprovanteUrl: lancComprovante?.comprovante_url || null,
        };

        itens.push(itemDTO);
        grupoMensagem.itens.push(itemDTO);
      });

      if (grupoMensagem.itens.length > 0) {
        mensagensMap.set(lote.id, grupoMensagem);
      }
    });

    // 4. Buscar Vales Pendentes em lancamentos_financeiros
    const { data: valesPendentes } = await supabaseAdmin
      .from('lancamentos_financeiros')
      .select(`
        id,
        nome_trabalhador,
        valor_monetario,
        data_referencia,
        observacao,
        ponto_lote_id,
        created_at,
        obras_config ( nome )
      `)
      .eq('tenant_id', tenantId)
      .eq('tipo_lancamento', 'VALE')
      .eq('status', 'PENDENTE')
      .order('created_at', { ascending: false });

    ((valesPendentes as unknown as LancamentoFinanceiroRow[]) || []).forEach((v) => {
      const targetLoteId = v.ponto_lote_id || `vale-${v.id}`;
      const horarioVale = v.created_at
        ? new Date(v.created_at).toLocaleTimeString('pt-BR', {
            timeZone: 'America/Sao_Paulo',
            hour: '2-digit',
            minute: '2-digit',
          })
        : '--:--';

      const existingMsg = mensagensMap.get(targetLoteId);

      const itemVale: PendenteItemDTO = {
        id: `vale-${v.id}`,
        lancamentoId: v.id,
        loteId: targetLoteId,
        obra: existingMsg?.obra || v.obras_config?.nome || 'PORTO SEGURO',
        data: v.data_referencia || new Date().toISOString().split('T')[0],
        trabalhador: v.nome_trabalhador || 'Colaborador',
        fracao: 0,
        tipo: 'VALE',
        motivo: v.observacao || 'Pedido de Vale via WhatsApp',
        origem: existingMsg?.origem || 'WhatsApp Oficial',
        timestampOriginal: existingMsg?.timestampOriginal || null,
        horarioMensagem: existingMsg?.horarioMensagem || horarioVale,
        mensagemOriginal: existingMsg?.mensagemOriginal || null,
        sha256Hash: existingMsg?.sha256Hash || null,
        valorDiariaBase: Number(v.valor_monetario || 0),
        comprovanteUrl: v.comprovante_url || null,
      };

      itens.push(itemVale);

      if (existingMsg) {
        existingMsg.itens.push(itemVale);
      } else {
        mensagensMap.set(targetLoteId, {
          loteId: targetLoteId,
          obra: itemVale.obra,
          data: itemVale.data,
          origem: itemVale.origem,
          horarioMensagem: itemVale.horarioMensagem,
          timestampOriginal: itemVale.timestampOriginal,
          mensagemOriginal: itemVale.mensagemOriginal,
          sha256Hash: itemVale.sha256Hash,
          createdAt: v.created_at || null,
          itens: [itemVale],
        });
      }
    });

    const mensagens = Array.from(mensagensMap.values());

    return NextResponse.json({
      pendentes: itens,
      mensagens,
      dataCorteOperacional,
    });
  } catch (err) {
    console.error('Erro na rota /api/pendentes:', err);
    return NextResponse.json({
      pendentes: [],
      mensagens: [],
      dataCorteOperacional: null,
    });
  }
}
