import { NextRequest, NextResponse } from 'next/server';
import {
  gerarPinEfemeroAdmin,
  identificarAdminChave,
} from '@/lib/duplaAlcada';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const rawUser = req.cookies.get('diaria_user')?.value;
  if (!rawUser) {
    return NextResponse.json(
      { error: 'Sessão administrativa obrigatória para gerar Chave Autorizante.' },
      { status: 403 }
    );
  }

  const usuario = decodeURIComponent(rawUser).trim();
  const adminId = identificarAdminChave(usuario);
  if (!adminId) {
    return NextResponse.json(
      {
        error:
          'Acesso negado (403): Chaves Autorizantes são exclusivas para Patrícia Grubel e Daniel Lopes.',
      },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(req.url);
  const somentePrefixos = searchParams.get('prefixos') === '1';

  // Modo prefixos: retorna apenas os 4 primeiros dígitos (públicos para exibir abaixo do registro)
  // mantendo os 4 últimos dígitos estritamente ocultos no servidor!
  if (somentePrefixos) {
    const pat = gerarPinEfemeroAdmin('patricia');
    const dan = gerarPinEfemeroAdmin('daniel');
    return NextResponse.json(
      {
        success: true,
        prefixoPatricia: pat.prefixo4,
        prefixoDaniel: dan.prefixo4,
        expiraEmMs: pat.expiraEmMs,
        segundosRestantes: pat.segundosRestantes,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const info = gerarPinEfemeroAdmin(adminId);
  return NextResponse.json(
    {
      success: true,
      adminId: info.adminId,
      adminNome: info.adminNome,
      prefixo4: info.prefixo4,
      sufixo4: info.sufixo4,
      pin: info.pin,
      expiraEmMs: info.expiraEmMs,
      segundosRestantes: info.segundosRestantes,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
