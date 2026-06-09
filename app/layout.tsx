import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'
import NavTabs from '@/components/NavTabs'

const geist = Geist({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'CPS Eco — Planning System',
  description: 'ระบบแผนงานและเครื่องมือ CPS Eco Services',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className="h-full">
      <body className={`${geist.className} h-full bg-slate-50`}>
        <NavTabs />
        <main className="h-[calc(100vh-45px)] overflow-hidden">{children}</main>
      </body>
    </html>
  )
}
