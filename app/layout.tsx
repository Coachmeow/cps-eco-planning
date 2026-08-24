import type { Metadata } from 'next'
import { IBM_Plex_Sans_Thai } from 'next/font/google'
import './globals.css'
import Sidebar from '@/components/Sidebar'
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className="h-full">
      <body className={`${plexThai.variable} h-full bg-slate-100`}>
        <IdleLogout />
        <div className="flex h-screen overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-hidden">{children}</main>
        </div>
      </body>
    </html>
  )
}
