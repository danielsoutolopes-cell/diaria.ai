import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { lerFeatureFlagsTenant } from '@/services/featureFlagsStorage';
import {
  JHOSTON_TENANT_ID,
  normalizarChaveObra,
  obterDataBrasilISO,
  OPCOES_TIPO_DIARIA_CAMPO,
  PONTO_CAMPO_COOKIE_NAME,
  verificarSessaoPontoCampo,
  type TipoDiariaCampo,
} from '@/lib/pontoCampo';

export const dynamic = 'force-dynamic';

interface ItemPontoBody {
  colaboradorId?: string;
  nome: string;
  tipo: TipoDiariaCampo;
}

export async function POST(req: NextRequest) {
  try {
    const flags = await lerFeatureFlagsTenant(JHOSTON_TENANT_ID);
    if (!flags.FF_PWA_PONTO_CAMPO) {
      return NextResponse.json(
        { error: 'App de Campo em homologação (desligado em /config-geral).' },
        { status: 403 }
      );
    }

    const token = req.cookies.get(PONTO_CAMPO_COOKIE_NAME)?.value;
    const sessao = verificarSessaoPontoCampo(token);
    if (!sessao || sessao.tenantId !== JHOSTON_TENANT_ID) {
      return NextResponse.json(
        { error: 'Sessão expirada. Digite seu PIN novamente.' },
        { status: 401 }
      );
    }

    const body = (await req.json()) as {
      obraNome?: string;
      data?: string;
      itens?: ItemPontoBody[];
      observacao?: string;
    };

    const obraNome = String(body.obraNome || '').trim();
    const dataIso = String(body.data || obterDataBrasilISO()).trim();
    const itens = Array.isArray(body.itens) ? body.itens : [];
    const observacao = String(body.observacao || '').trim();

    if (!obraNome) {
      return NextResponse.json(
        { error: 'Selecione a obra antes de enviar o ponto.' },
        { status: 400 }
      );
    }

    const obraPermitida = sessao.obrasVinculadas.some(
      (o) => normalizarChaveObra(o) === normalizarChaveObra(obraNome)
    );
    if (!obraPermitida) {
      return NextResponse.json(
        { error: 'Obra não vinculada ao seu perfil de encarregado.' },
        { status: 403 }
      );
    }

    if (itens.length === 0) {
      return NextResponse.json(
        { error: 'Marque pelo menos 1 colaborador presente.' },
        { status: 400 }
      );
    }

    const mapaTipos = new Map(
      OPCOES_TIPO_DIARIA_CAMPO.map((op) => [op.codigo, op])
    );

    const itensEstruturados = itens
      .filter((item) => item && item.nome && item.nome.trim())
      .map((item) => {
        const op = mapaTipos.get(item.tipo) || OPCOES_TIPO_DIARIA_CAMPO[0];
        return {
          nome: item.nome.trim(),
          obra: obraNome,
          data: dataIso,
          fracao: op.fracao,
          tipo: op.tipoRegistro,
          tipo_campo: op.codigo,
          status: 'PENDENTE',
          origem: 'PWA_CAMPO',
        };
      });

    const linhasTexto = itensEstruturados.map(
      (it) => `- ${it.nome} (${it.tipo === 'DIARIA' ? `${it.fracao} dia` : it.tipo})`
    );
    const mensagemOriginal = [
      `[APP CAMPO • ${sessao.encarregadoNome}] Obra: ${obraNome} | Data: ${dataIso}`,
      ...linhasTexto,
      observacao ? `Obs: ${observacao}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    const { data: loteCriado, error: insertError } = await supabaseAdmin
      .from('ponto_lote')
      .insert({
        tenant_id: JHOSTON_TENANT_ID,
        obra_nome: obraNome,
        data_referencia: dataIso,
        remetente_nome: `${sessao.encarregadoNome} (App Campo)`,
        mensagem_original: mensagemOriginal,
        itens_extraidos: itensEstruturados,
        status: 'PENDENTE',
      })
      .select('id')
      .maybeSingle();

    if (insertError) {
      console.error('[ponto-campo/ponto INSERT]', insertError);
      return NextResponse.json(
        { error: 'Erro ao gravar ponto para validação.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      loteId: loteCriado?.id || null,
      totalColaboradores: itensEstruturados.length,
      obraNome,
      data: dataIso,
      message: `Ponto de ${itensEstruturados.length} colaborador(es) enviado para validação da Patrícia!`,
    });
  } catch (err) {
    console.error('[ponto-campo/ponto POST]', err);
    return NextResponse.json(
      { error: 'Erro inesperado ao enviar ponto.' },
      { status: 500 }
    );
  }
}
