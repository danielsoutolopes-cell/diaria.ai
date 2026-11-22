import { NextRequest, NextResponse } from 'next/server';
import { getActiveTenantFromRequest } from '@/lib/tenant';
import {
  atualizarRegraAprendida,
  excluirRegraAprendida,
  listarMemoriaAprendizado,
  registrarRegraAprendida,
  type TipoRegraAprendizado,
} from '@/services/aprendizadoCampoService';

export const dynamic = 'force-dynamic';

interface CriarRegraBody {
  tipoRegra?: TipoRegraAprendizado;
  origemPadrao?: string;
  destinoCanonico?: string;
  remetenteTelefone?: string | null;
  remetenteNome?: string | null;
  exemploMensagem?: string | null;
  criadoPor?: string | null;
}

interface EditarRegraBody {
  ruleId?: string;
  origemPadrao?: string;
  destinoCanonico?: string;
  ativo?: boolean;
}

const TIPOS_VALIDOS: readonly TipoRegraAprendizado[] = [
  'ALIAS_TRABALHADOR',
  'ALIAS_OBRA',
  'ASSINATURA_ESTRUTURAL',
  'EXPRESSAO_RECORRENTE',
  'FRACAO_PADRAO',
];

export async function GET(req: NextRequest) {
  try {
    const activeTenant = getActiveTenantFromRequest(req);
    const memoria = await listarMemoriaAprendizado(activeTenant.id);

    const totalAliases = memoria.rules.filter(
      (r) =>
        r.ativo &&
        (r.tipo_regra === 'ALIAS_TRABALHADOR' || r.tipo_regra === 'ALIAS_OBRA')
    ).length;
    const totalPadroes = memoria.rules.filter(
      (r) =>
        r.ativo &&
        (r.tipo_regra === 'ASSINATURA_ESTRUTURAL' ||
          r.tipo_regra === 'EXPRESSAO_RECORRENTE' ||
          r.tipo_regra === 'FRACAO_PADRAO')
    ).length;

    return NextResponse.json({
      success: true,
      tenant: {
        id: activeTenant.id,
        slug: activeTenant.slug,
        nome: activeTenant.nome,
      },
      fonte: memoria.fonte,
      resumo: {
        totalRegrasAtivas: memoria.rules.filter((r) => r.ativo).length,
        totalAliases,
        totalPadroes,
        totalRemetentes: memoria.senderProfiles.length,
      },
      rules: memoria.rules,
      senderProfiles: memoria.senderProfiles,
    });
  } catch (error) {
    console.error('Erro em GET /api/aprendizado:', error);
    return NextResponse.json(
      { error: 'Falha ao carregar memória de aprendizado de campo.' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const activeTenant = getActiveTenantFromRequest(req);
    const body = (await req.json()) as CriarRegraBody;

    const tipoRegra: TipoRegraAprendizado =
      body.tipoRegra && TIPOS_VALIDOS.includes(body.tipoRegra)
        ? body.tipoRegra
        : 'ALIAS_TRABALHADOR';

    if (!body.origemPadrao?.trim() || !body.destinoCanonico?.trim()) {
      return NextResponse.json(
        { error: 'Origem e destino são obrigatórios.' },
        { status: 400 }
      );
    }

    const regra = await registrarRegraAprendida({
      tenantId: activeTenant.id,
      tipoRegra,
      origemPadrao: body.origemPadrao.trim(),
      destinoCanonico: body.destinoCanonico.trim(),
      origemAprendizado: 'MANUAL_ADMIN',
      remetenteTelefone: body.remetenteTelefone || null,
      remetenteNome: body.remetenteNome || null,
      exemploMensagem: body.exemploMensagem || null,
      criadoPor: body.criadoPor || 'Administração',
    });

    return NextResponse.json({
      success: true,
      regra,
    });
  } catch (error) {
    console.error('Erro em POST /api/aprendizado:', error);
    return NextResponse.json(
      { error: 'Falha ao salvar regra aprendida.' },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const activeTenant = getActiveTenantFromRequest(req);
    const body = (await req.json()) as EditarRegraBody;

    if (!body.ruleId) {
      return NextResponse.json(
        { error: 'ruleId é obrigatório.' },
        { status: 400 }
      );
    }

    const ok = await atualizarRegraAprendida({
      tenantId: activeTenant.id,
      ruleId: body.ruleId,
      origemPadrao: body.origemPadrao,
      destinoCanonico: body.destinoCanonico,
      ativo: body.ativo,
    });

    if (!ok) {
      return NextResponse.json(
        { error: 'Regra não encontrada para este tenant.' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erro em PATCH /api/aprendizado:', error);
    return NextResponse.json(
      { error: 'Falha ao atualizar regra aprendida.' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const activeTenant = getActiveTenantFromRequest(req);
    const { searchParams } = new URL(req.url);
    const ruleId = searchParams.get('id');

    if (!ruleId) {
      return NextResponse.json(
        { error: 'Parâmetro id é obrigatório.' },
        { status: 400 }
      );
    }

    const ok = await excluirRegraAprendida(activeTenant.id, ruleId);
    if (!ok) {
      return NextResponse.json(
        { error: 'Regra não encontrada para este tenant.' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erro em DELETE /api/aprendizado:', error);
    return NextResponse.json(
      { error: 'Falha ao excluir regra aprendida.' },
      { status: 500 }
    );
  }
}
