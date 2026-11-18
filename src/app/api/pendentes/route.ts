import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // 1. Tentar selecionar com comprovante_url
    let lotes: any[] | null = null;
    let queryError: any = null;

    const resComprovante = await supabaseAdmin
      .from('ponto_lote')
      .select(`
        id,
        obra_id,
        data_referencia,
        texto_original,
        status_validacao,
        token_aprovacao,
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
          comprovante_url
        )
      `)
      .eq('status_validacao', 'PENDENTE')
      .order('created_at', { ascending: false });

    if (resComprovante.error) {
      // Fallback defensivo para instâncias de banco que ainda não migraram a coluna comprovante_url
      const resFallback = await supabaseAdmin
        .from('ponto_lote')
        .select(`
          id,
          obra_id,
          data_referencia,
          texto_original,
          status_validacao,
          token_aprovacao,
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
            nome_trabalhador
          )
        `)
        .eq('status_validacao', 'PENDENTE')
        .order('created_at', { ascending: false });

      lotes = resFallback.data;
      queryError = resFallback.error;
    } else {
      lotes = resComprovante.data;
    }

    if (queryError) {
      console.error('Erro ao buscar pendentes:', queryError);
      return NextResponse.json({ pendentes: [] });
    }

    // 2. Buscar regras configuradas
    const { data: paramData } = await supabaseAdmin
      .from('parametros_sistema')
      .select('configuracoes')
      .eq('tenant_id', '00000000-0000-0000-0000-000000000001')
      .maybeSingle();

    const regras = {
      dia_viagem_padrao: 120.0,
      dia_chuva_padrao: 120.0,
      dia_parado_padrao: 120.0,
      diaria_piscina_padrao: 150.0,
      diaria_civil_padrao: 180.0,
      ...(paramData?.configuracoes || {}),
    };

    // 2.5 Buscar valores individuais dos colaboradores (Obra Civil vs Piscina)
    const { data: funcsData } = await supabaseAdmin
      .from('funcionarios_obra')
      .select('nome_trabalhador, valor_diaria, valor_diaria_obra, valor_diaria_piscina');

    const mapaFuncs = new Map<string, any>();
    (funcsData || []).forEach((f) => {
      if (f.nome_trabalhador) {
        mapaFuncs.set(f.nome_trabalhador.trim().toUpperCase(), f);
      }
    });

    const itens: any[] = [];
    (lotes || []).forEach((lote) => {
      const obraNome = (lote as any).obras_config?.nome || 'CANTEIRO VOLANTE';
      const tipoObra = (lote as any).obras_config?.tipo_obra || 'PISCINA';
      const detalhes = (lote as any).ponto_detalhe || [];
      const lancamentos = (lote as any).lancamentos_financeiros || [];

      // Valor padrão da obra
      const valorBasePadrao =
        tipoObra === 'OBRA_CIVIL'
          ? regras.diaria_civil_padrao
          : regras.diaria_piscina_padrao;

      detalhes.forEach((d: any) => {
        const lancCorrespondente = lancamentos.find(
          (l: any) => l.nome_trabalhador?.toLowerCase() === d.nome_trabalhador?.toLowerCase() && l.comprovante_url
        ) || lancamentos.find((l: any) => l.comprovante_url);

        const nomeUpper = (d.nome_trabalhador || '').trim().toUpperCase();
        const funcInfo = mapaFuncs.get(nomeUpper) || Array.from(mapaFuncs.values()).find((f) => f.nome_trabalhador.toUpperCase().includes(nomeUpper));

        let valorIndividual = valorBasePadrao;
        if (funcInfo) {
          if (tipoObra === 'PISCINA') {
            valorIndividual = Number(funcInfo.valor_diaria_piscina ?? funcInfo.valor_diaria ?? valorBasePadrao);
          } else {
            valorIndividual = Number(funcInfo.valor_diaria_obra ?? funcInfo.valor_diaria ?? valorBasePadrao);
          }
        }

        const motivo = (d.motivo_excecao || '').toUpperCase();
        let valorCalculado = valorIndividual;

        // Aplicação das regras de negócio especiais
        if (motivo.includes('VIAGEM_PASSAGEIRO') || (motivo.includes('VIAGEM') && !motivo.includes('MOTORISTA'))) {
          valorCalculado = regras.dia_viagem_padrao; // R$ 120,00
        } else if (motivo.includes('CHUVA')) {
          valorCalculado = regras.dia_chuva_padrao; // R$ 120,00
        } else if (motivo.includes('PARADO') || motivo.includes('SEM ACESSO') || motivo.includes('CONDOMINIO')) {
          valorCalculado = regras.dia_parado_padrao; // R$ 120,00
        } else if (motivo.includes('VIAGEM_MOTORISTA')) {
          valorCalculado = valorIndividual; // Diária integral
        }

        // Extrai metadados periciais do texto_original se existirem
        const textoOriginal = lote.texto_original || '';
        let remetenteInfo = 'WhatsApp Oficial';
        let timestampInfo: string | null = null;
        let hashInfo: string | null = null;

        if (textoOriginal.includes('[ORIGEM_WHATSAPP]')) {
          const matchRem = textoOriginal.match(/Remetente:\s*([^\n]+)/);
          const matchTime = textoOriginal.match(/Timestamp:\s*([^\n]+)/);
          const matchHash = textoOriginal.match(/SHA256:\s*([^\n]+)/);
          if (matchRem) remetenteInfo = `Zap: ${matchRem[1].trim()}`;
          if (matchTime) timestampInfo = matchTime[1].trim();
          if (matchHash) hashInfo = matchHash[1].trim();
        }

        itens.push({
          id: d.id,
          loteId: lote.id,
          obra: obraNome,
          data: lote.data_referencia,
          trabalhador: d.nome_trabalhador,
          fracao: Number(d.fracao_dia) || 1.0,
          motivo: d.motivo_excecao || 'Apontamento via WhatsApp',
          origem: remetenteInfo,
          timestampOriginal: timestampInfo,
          sha256Hash: hashInfo,
          valorDiariaBase: valorCalculado,
          comprovanteUrl: lancCorrespondente?.comprovante_url || null,
        });
      });
    });

    return NextResponse.json({ pendentes: itens });
  } catch (err) {
    console.error('Erro na rota /api/pendentes:', err);
    return NextResponse.json({ pendentes: [] });
  }
}
