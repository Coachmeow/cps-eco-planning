import type { Metadata, Viewport } from 'next'
import { IBM_Plex_Sans_Thai } from 'next/font/google'
import './globals.css'
import AppShell from '@/components/AppShell'
import IdleLogout from '@/components/IdleLogout'

// ฟอนต์หลักของทั้งแอป — รองรับไทย+อังกฤษ (คุมหน้าตาให้เหมือนกันทุกเครื่อง)
const plexThai = IBM_Plex_Sans_Thai({
  subsets: ['thai', 'latin'],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-plex-thai',
})

export const metadata: Metadata = {
  title: 'Eco Planning System',
  description: 'ระบบแผนงานและเครื่องมือ — Eco Planning System',
}

// คุมการแสดงผลบนมือถือให้พอดีจอ (device-width) + สีแถบเบราว์เซอร์เป็นเขียวของแบรนด์
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#059669',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className="h-full">
      <body className={`${plexThai.variable} h-full bg-slate-100`}>
        <IdleLogout />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}
