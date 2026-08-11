import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyToken } from './app/lib/session';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/admin')) {
    const sessionCookie = request.cookies.get('session')?.value;
    const session = await verifyToken(sessionCookie);

    if (!session || session.role !== 'admin') {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('role', 'admin');
      return NextResponse.redirect(loginUrl);
    }
  }

  if (pathname.startsWith('/teacher')) {
    const sessionCookie = request.cookies.get('session')?.value;
    const session = await verifyToken(sessionCookie);

    if (!session || session.role !== 'invigilator') {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('role', 'invigilator');
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/teacher/:path*',
  ],
};
