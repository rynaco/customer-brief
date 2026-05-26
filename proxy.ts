import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const REALM = 'Customer Brief';

export function proxy(request: NextRequest) {
  const expected = process.env.DEMO_PASSWORD;
  if (!expected) return NextResponse.next();

  const header = request.headers.get('authorization');
  if (header?.startsWith('Basic ')) {
    const decoded = atob(header.slice(6));
    const idx = decoded.indexOf(':');
    const password = idx === -1 ? decoded : decoded.slice(idx + 1);
    if (password === expected) return NextResponse.next();
  }

  return new NextResponse('Authentication required', {
    status: 401,
    headers: { 'WWW-Authenticate': `Basic realm="${REALM}", charset="UTF-8"` },
  });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
