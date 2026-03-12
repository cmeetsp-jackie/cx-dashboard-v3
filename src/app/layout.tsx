import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '📊 차란 CX 실시간 대시보드',
  description: '채널톡 고객응대 현황',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  )
}
