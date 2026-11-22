import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getActiveTenantFromRequest } from '@/lib/tenant';
import {
  normalizarNomeObraCanonica,
  normalizarNomeTrabalhadorCanonico,
} from '@/lib/normalizarObra';

export const dynamic = 'force-dynamic';

interface ObraBorderoRel {
  nome: string | null;
  tipo_obra: string | null;
}

interface FuncionarioBorderoRel {
  chave_pix: string | null;
  valor_diaria: number | string | null;
  regime_remuneracao?: string | null;
  ciclo_pagamento?: string | null;
  valor_base_contratual?: number | string | null;
  regra_dias_uteis_seg_sab?: boolean | null;
}

interface LancamentoBorderoRow {
  id: string;
  nome_trabalhador: string;
  tipo_lancamento: string;
  fracao_dia: number | string | null;
  valor_monetario: number | string | null;
  data_referencia: string;
  observacao: string | null;
  status: string;
  comprovante_url?: string | null;
  obras_config: ObraBorderoRel | ObraBorderoRel[] | null;
  funcionarios_obra: FuncionarioBorderoRel | FuncionarioBorderoRel[] | null;
}

interface GrupoBorderoDTO {
  id: string;
  nome: string;
  obra: string;
  chavePix: string;
  diariaPadrao: number;
  regimeRemuneracao: string;
  cicloPagamento: string;
  valorBaseContratual: number;
  regraDiasUteisSegSab: boolean;
  lancamentos: Array<{
    id: string;
    data: string;
    descricao: string;
    obra: string;
    tipo: string;
    fracao: number;
    valor: number;
    comprovanteUrl: string | null;
    selecionado: boolean;
  }>;
}

function extrairRel<T>(val: T | T[] | null | undefined): T | null {
  if (!val) return null;
  return Array.isArray(val) ? val[0] || null : val;
}

export async function GET(req: NextRequest) {
  try {
    const activeTenant = getActiveTenantFromRequest(req);
    let lancamentos: LancamentoBorderoRow[] = [];
    let queryError: unknown = null;

    // Borderô exibe exclusivamente o ciclo em aberto (VALIDADO, aguardando liquidação PIX)
    const resComprovante = await supabaseAdmin
      .from('lancamentos_financeiros')
      .select(`
        id,
        nome_trabalhador,
        tipo_lancamento,
        fracao_dia,
        valor_monetario,
        data_referencia,
        observacao,
        status,
        comprovante_url,
        obras_config (
          nome,
          tipo_obra
        ),
        funcionarios_obra (
          chave_pix,
          valor_diaria,
          regime_remuneracao,
          ciclo_pagamento,
          valor_base_contratual,
          regra_dias_uteis_seg_sab
        )
      `)
      .eq('tenant_id', activeTenant.id)
      .eq('status', 'VALIDADO')
      .order('data_referencia', { ascending: true });

    if (resComprovante.error) {
      const resFallback = await supabaseAdmin
        .from('lancamentos_financeiros')
        .select(`
          id,
          nome_trabalhador,
          tipo_lancamento,
          fracao_dia,
          valor_monetario,
          data_referencia,
          observacao,
          status,
          obras_config (
            nome,
            tipo_obra
          ),
          funcionarios_obra (
            chave_pix,
            valor_diaria
          )
        `)
        .eq('tenant_id', activeTenant.id)
        .eq('status', 'VALIDADO')
        .order('data_referencia', { ascending: true });

      lancamentos =
        (resFallback.data as unknown as LancamentoBorderoRow[] | null) || [];
      queryError = resFallback.error;
    } else {
      lancamentos =
        (resComprovante.data as unknown as LancamentoBorderoRow[] | null) || [];
    }

    if (queryError) {
      console.error('Erro ao buscar borderô:', queryError);
      return NextResponse.json({ funcionarios: [] });
    }

    const gruposMap = new Map<string, GrupoBorderoDTO>();

    lancamentos.forEach((l) => {
      const nome = normalizarNomeTrabalhadorCanonico(l.nome_trabalhador);
      const chave = nome.toUpperCase();
      const obraRel = extrairRel(l.obras_config);
      const funcRel = extrairRel(l.funcionarios_obra);
      const obraNome = normalizarNomeObraCanonica(
        obraRel?.nome,
        obraRel?.tipo_obra
      );

      if (!gruposMap.has(chave)) {
        const chavePix = funcRel?.chave_pix || 'Chave não informada';
        const diariaPadrao = Number(funcRel?.valor_diaria) || 150;
        const regime = funcRel?.regime_remuneracao || 'DIARISTA';
        const ciclo = funcRel?.ciclo_pagamento || 'QUINZENAL';
        const valorBase = Number(funcRel?.valor_base_contratual) || diariaPadrao;
        const regraSegSab =
          Boolean(funcRel?.regra_dias_uteis_seg_sab) ||
          regime === 'DIAS_UTEIS_SEG_SAB';

        gruposMap.set(chave, {
          id: `func-${chave.toLowerCase().replace(/\s+/g, '-')}`,
          nome,
          obra: obraNome,
          chavePix,
          diariaPadrao,
          regimeRemuneracao: regime,
          cicloPagamento: ciclo,
          valorBaseContratual: valorBase,
          regraDiasUteisSegSab: regraSegSab,
          lancamentos: [],
        });
      }

      const f = gruposMap.get(chave)!;
      if (obraNome && !f.obra.includes(obraNome)) {
        f.obra = `${f.obra}, ${obraNome}`;
      }
      const pixAtual = funcRel?.chave_pix;
      if (pixAtual && f.chavePix === 'Chave não informada') {
        f.chavePix = pixAtual;
      }
      f.lancamentos.push({
        id: l.id,
        data: l.data_referencia,
        descricao:
          l.observacao ||
          (l.tipo_lancamento === 'PONTO' ? 'Diária de Campo' : 'Vale Adiantado'),
        obra: obraNome,
        tipo: l.tipo_lancamento,
        fracao:
          Number(l.fracao_dia) || (l.tipo_lancamento === 'PONTO' ? 1.0 : 0),
        valor: Number(l.valor_monetario) || 0,
        comprovanteUrl: l.comprovante_url || null,
        selecionado: true,
      });
    });

    const funcionarios = Array.from(gruposMap.values());
    return NextResponse.json({ funcionarios });
  } catch (err) {
    console.error('Erro na rota /api/bordero:', err);
    return NextResponse.json({ funcionarios: [] });
  }
}

