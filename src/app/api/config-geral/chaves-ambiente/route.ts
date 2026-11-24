import { NextRequest, NextResponse } from 'next/server';
import { isDanielOuPatricia } from '@/lib/tenant';
import { supabaseAdmin } from '@/lib/supabase';
import {
  montarListaChavesAmbiente,
  type BaileysSessionResumo,
} from '@/lib/chavesAmbiente';

export const dynamic = 'force-dynamic';

function verificarSuperAdmin(req: NextRequest): {
  autorizado: boolean;
  usuario: string;
} {
  const rawCookie = req.cookies.get('diaria_user')?.value;
  if (!rawCookie) {
    return { autorizado: false, usuario: '' };
  }
  const usuario = decodeURIComponent(rawCookie).trim();
  return {
    autorizado: isDanielOuPatricia(usuario),
    usuario,
  };
}

async function lerResumoBaileysSessionState(): Promise<BaileysSessionResumo> {
  try {
    const { data, error } = await supabaseAdmin
      .from('baileys_session_state')
      .select('session_id, updated_at')
      .order('updated_at', { ascending: false })
      .limit(200);

    if (error || !Array.isArray(data) || data.length === 0) {
      return {
        disponivel: false,
        session_id: null,
        total_chaves: 0,
        updated_at: null,
      };
    }

    const primeira = data[0] as {
      session_id?: string | null;
      updated_at?: string | null;
    };

    return {
      disponivel: true,
      session_id: primeira.session_id ? String(primeira.session_id) : 'default',
      total_chaves: data.length,
      updated_at: primeira.updated_at ? String(primeira.updated_at) : null,
    };
  } catch {
    return {
      disponivel: false,
      session_id: null,
      total_chaves: 0,
      updated_at: null,
    };
  }
}

export async function GET(req: NextRequest) {
  const auth = verificarSuperAdmin(req);
  if (!auth.autorizado) {
    return NextResponse.json(
      {
        error:
          'Acesso negado (403): Chaves de Ambiente & Integrações são exclusivas para Super Admin (Daniel Lopes e Patrícia Grubel).',
      },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(req.url);
  const revelar = searchParams.get('revelar') === '1';

  const chaves = montarListaChavesAmbiente(
    process.env as Record<string, string | undefined>,
    revelar
  );
  const baileysSession = await lerResumoBaileysSessionState();

  return NextResponse.json(
    {
      success: true,
      somenteLeitura: true,
      consultadoPor: auth.usuario,
      chaves,
      baileysSession,
    },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    }
  );
}

function methodNotAllowed() {
  return NextResponse.json(
    {
      error:
        'Operação bloqueada (405): Chaves de Ambiente em /config-geral são estritamente Somente Leitura.',
    },
    {
      status: 405,
      headers: { Allow: 'GET' },
    }
  );
}

export async function POST() {
  return methodNotAllowed();
}

export async function PUT() {
  return methodNotAllowed();
}

export async function PATCH() {
  return methodNotAllowed();
}

export async function DELETE() {
  return methodNotAllowed();
}
