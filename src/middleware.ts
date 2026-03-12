import { NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'
import type { NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const token = await getToken({ 
    req: request, 
    secret: process.env.NEXTAUTH_SECRET 
  })

  const isLoginPage = request.nextUrl.pathname === '/login'
  const isAuthApi = request.nextUrl.pathname.startsWith('/api/auth')

  // 로그인 페이지와 auth API는 통과
  if (isLoginPage || isAuthApi) {
    return NextResponse.next()
  }

  // 토큰 없으면 로그인 페이지로
  if (!token) {
    const loginUrl = new URL('/login', request.url)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|team).*)']
}
