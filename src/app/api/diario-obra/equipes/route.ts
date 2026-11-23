import { NextRequest, NextResponse } from 'next/server';
import { getActiveTenantFromRequest } from '@/lib/tenant';
import {
  atualizarEmpreiteiroDiario,
  atualizarFuncionarioEmpreiteiro,
  criarEmpreiteiroDiario,
  criarFuncionarioEmpreiteiro,
  desativarEmpreiteiroDiario,
  desativarFuncionarioEmpreiteiro,
  listarEquipesDiarioTenant,
} from '@/services/diarioEquipesService';

export const dynamic = 'force-dynamic';

function isTenantIntermack(slug: string): boolean {
  return slug === 'intermack';
}

export async function GET(req: NextRequest) {
  try {
    const activeTenant = getActiveTenantFromRequest(req);
    if (!isTenantIntermack(activeTenant.slug)) {
      return NextResponse.json({
        success: true,
        tenant: activeTenant,
        subempreitaAtiva: false,
        empreiteiros: [],
        funcionarios: [],
        usandoFallback: false,
      });
    }

    const dados = await listarEquipesDiarioTenant(activeTenant.id);
    return NextResponse.json({
      success: true,
      tenant: activeTenant,
      subempreitaAtiva: true,
      ...dados,
    });
  } catch (error) {
    console.error('Erro em GET /api/diario-obra/equipes:', error);
    return NextResponse.json(
      { error: 'Falha ao carregar empreiteiros e funcionários.' },
      { status: 500 }
    );
  }
}

interface EquipesPostBody {
  tipo: 'empreiteiro' | 'funcionario';
  nome?: string;
  nomeOficial?: string;
  empreiteiroId?: string | null;
  apelidos?: string | string[];
  documento?: string | null;
  telefone?: string | null;
  chavePix?: string | null;
  etapaPadrao?: string | null;
  funcao?: string | null;
}

export async function POST(req: NextRequest) {
  try {
    const activeTenant = getActiveTenantFromRequest(req);
    if (!isTenantIntermack(activeTenant.slug)) {
      return NextResponse.json(
        {
          error:
            'Cadastro de subempreita (Empreiteiro × Funcionário) habilitado exclusivamente para o tenant Intermack.',
        },
        { status: 403 }
      );
    }

    const body = (await req.json()) as EquipesPostBody;

    if (body.tipo === 'empreiteiro') {
      const nome = (body.nome || '').trim();
      if (!nome) {
        return NextResponse.json(
          { error: 'Informe o nome do empreiteiro / encarregado.' },
          { status: 400 }
        );
      }
      const empreiteiro = await criarEmpreiteiroDiario(activeTenant.id, {
        nome,
        apelidos: body.apelidos,
        documento: body.documento,
        telefone: body.telefone,
        chavePix: body.chavePix,
        etapaPadrao: body.etapaPadrao,
      });
      const atualizado = await listarEquipesDiarioTenant(activeTenant.id);
      return NextResponse.json({
        success: true,
        empreiteiro,
        ...atualizado,
      });
    }

    if (body.tipo === 'funcionario') {
      const nomeOficial = (body.nomeOficial || body.nome || '').trim();
      if (!nomeOficial) {
        return NextResponse.json(
          { error: 'Informe o nome oficial do funcionário.' },
          { status: 400 }
        );
      }
      const funcionario = await criarFuncionarioEmpreiteiro(activeTenant.id, {
        empreiteiroId: body.empreiteiroId || null,
        nomeOficial,
        apelidos: body.apelidos,
        documento: body.documento,
        funcao: body.funcao,
      });
      const atualizado = await listarEquipesDiarioTenant(activeTenant.id);
      return NextResponse.json({
        success: true,
        funcionario,
        ...atualizado,
      });
    }

    return NextResponse.json({ error: 'Tipo de cadastro inválido.' }, { status: 400 });
  } catch (error) {
    console.error('Erro em POST /api/diario-obra/equipes:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Erro ao salvar cadastro de equipe.',
      },
      { status: 500 }
    );
  }
}

interface EquipesPatchBody {
  tipo: 'empreiteiro' | 'funcionario';
  id: string;
  nome?: string;
  nomeOficial?: string;
  empreiteiroId?: string | null;
  apelidos?: string | string[];
  documento?: string | null;
  telefone?: string | null;
  chavePix?: string | null;
  etapaPadrao?: string | null;
  funcao?: string | null;
}

export async function PATCH(req: NextRequest) {
  try {
    const activeTenant = getActiveTenantFromRequest(req);
    if (!isTenantIntermack(activeTenant.slug)) {
      return NextResponse.json(
        {
          error:
            'Cadastro de subempreita habilitado exclusivamente para o tenant Intermack.',
        },
        { status: 403 }
      );
    }

    const body = (await req.json()) as EquipesPatchBody;
    if (!body.id) {
      return NextResponse.json({ error: 'ID obrigatório.' }, { status: 400 });
    }

    if (body.tipo === 'empreiteiro') {
      await atualizarEmpreiteiroDiario(activeTenant.id, body.id, {
        nome: body.nome,
        apelidos: body.apelidos,
        documento: body.documento,
        telefone: body.telefone,
        chavePix: body.chavePix,
        etapaPadrao: body.etapaPadrao,
      });
    } else if (body.tipo === 'funcionario') {
      await atualizarFuncionarioEmpreiteiro(activeTenant.id, body.id, {
        empreiteiroId: body.empreiteiroId,
        nomeOficial: body.nomeOficial ?? body.nome,
        apelidos: body.apelidos,
        documento: body.documento,
        funcao: body.funcao,
      });
    } else {
      return NextResponse.json({ error: 'Tipo inválido.' }, { status: 400 });
    }

    const atualizado = await listarEquipesDiarioTenant(activeTenant.id);
    return NextResponse.json({ success: true, ...atualizado });
  } catch (error) {
    console.error('Erro em PATCH /api/diario-obra/equipes:', error);
    return NextResponse.json(
      { error: 'Falha ao atualizar cadastro.' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const activeTenant = getActiveTenantFromRequest(req);
    if (!isTenantIntermack(activeTenant.slug)) {
      return NextResponse.json(
        {
          error:
            'Cadastro de subempreita habilitado exclusivamente para o tenant Intermack.',
        },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const tipo = searchParams.get('tipo');
    const id = searchParams.get('id');

    if (!id || (tipo !== 'empreiteiro' && tipo !== 'funcionario')) {
      return NextResponse.json(
        { error: 'Parâmetros tipo e id são obrigatórios.' },
        { status: 400 }
      );
    }

    if (tipo === 'empreiteiro') {
      await desativarEmpreiteiroDiario(activeTenant.id, id);
    } else {
      await desativarFuncionarioEmpreiteiro(activeTenant.id, id);
    }

    const atualizado = await listarEquipesDiarioTenant(activeTenant.id);
    return NextResponse.json({ success: true, ...atualizado });
  } catch (error) {
    console.error('Erro em DELETE /api/diario-obra/equipes:', error);
    return NextResponse.json(
      { error: 'Falha ao remover cadastro.' },
      { status: 500 }
    );
  }
}
