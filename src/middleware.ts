import { NextResponse, type NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Rotas públicas que não exigem autenticação
  if (
    pathname.startsWith('/login') ||
    pathname === '/ponto' ||
    pathname.startsWith('/ponto/') ||
    pathname.startsWith('/extrato/') ||
    pathname === '/manifest-ponto.json' ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.startsWith('/public')
  ) {
    return NextResponse.next();
  }

  // Verificar se possui cookie de autenticação e tenant_id
  const authCookie = request.cookies.get('diaria_auth')?.value;
  const tenantCookie = request.cookies.get('diaria_tenant')?.value;

  if (!authCookie) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Garantir isolamento do tenant_id injetando nos headers de requisição interna
  const response = NextResponse.next();
  if (tenantCookie) {
    response.headers.set('x-tenant-id', tenantCookie);
  } else {
    response.headers.set('x-tenant-id', '00000000-0000-0000-0000-000000000001');
  }

  return response;
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};

