import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'
import Sidebar from '@/components/Sidebar'
import IdleLogout from '@/components/IdleLogout'

const geist = Geist({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'CPS Eco — Planning System',
  description: 'ระบบแผนงานและเครื่องมือ CPS Eco Services',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className="h-full">
      <body className={`${geist.className} h-full bg-slate-100`}>
        <IdleLogout />
        <div className="flex h-screen overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-hidden">{children}</main>
        </div>
      </body>
    </html>
  )
}
