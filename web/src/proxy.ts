import { NextRequest, NextResponse } from 'next/server'

const nailPages = new Set(['/', '/login', '/history', '/shop', '/admin'])

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname
  if (nailPages.has(path) || path.startsWith('/styles/') || path === '/images/nail-studio-cover.webp') return NextResponse.next()
  return NextResponse.redirect(new URL('/', request.url))
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)'],
}
