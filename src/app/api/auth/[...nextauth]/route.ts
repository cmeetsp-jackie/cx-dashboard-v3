import NextAuth from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'

const handler = NextAuth({
  providers: [
    CredentialsProvider({
      name: 'Admin',
      credentials: {
        password: { label: '비밀번호', type: 'password' }
      },
      async authorize(credentials) {
        const adminPassword = process.env.ADMIN_PASSWORD
        
        if (!adminPassword) {
          console.error('ADMIN_PASSWORD not set')
          return null
        }
        
        if (credentials?.password === adminPassword) {
          return { id: '1', name: 'Admin' }
        }
        return null
      }
    })
  ],
  pages: {
    signIn: '/login'
  },
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30일
  },
  secret: process.env.NEXTAUTH_SECRET,
})

export { handler as GET, handler as POST }
