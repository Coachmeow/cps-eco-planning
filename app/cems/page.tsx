'use client'

import { useState } from 'react'
import { useMe } from '@/hooks/useMe'
import AnalyzerSection from '@/components/cems/AnalyzerSection'
import CemsSitesSection from '@/components/cems/CemsSitesSection'
import PartsSection from '@/components/cems/PartsSection'
import PartPlanSection from '@/components/cems/PartPlanSection'

type CemsTab = 'analyzers' | 'sites' | 'parts' | 'plan' | 'gas'

export default function CemsPage() {
  const { me, loading } = useMe()
  const [tab, setTab] = useState<CemsTab>('analyzers')

  const allowed = !!me && (me.role === 'ADMIN' || !!me.cemsAccess)

  if (loading) return <div className="flex h-full items-center justify-center text-sm text-slate-400">กำลังโหลด...</div>
  if (!allowed) return (
    <div className="flex h-full flex-col items-center justify-center gap-2 bg-slate-50 p-8">
      <p className="text-3xl">🔒</p>
      <p className="text-sm font-semibold text-slate-600">ไม่มีสิทธิ์เข้าโมดูล CEMS Service</p>
      <p className="text-xs text-slate-400">ติดต่อผู้ดูแลระบบเพื่อขอสิทธิ์ (ติ๊ก CEMS ในหน้าผู้ใช้งาน)</p>
    </div>
  )

  const tabs: { key: CemsTab; label: string; ready: boolean }[] = [
    { key: 'analyzers', label: '📟 Analyzer',        ready: true },
    { key: 'sites',     label: '🏭 ไซต์ CEMS',       ready: true },
    { key: 'parts',     label: '🔩 Stock อะไหล่',    ready: true },
    { key: 'plan',      label: '📅 แผนเปลี่ยนอะไหล่', ready: true },
    { key: 'gas',       label: '🧪 Standard Gas',    ready: false },
  ]

  return (
    <div className="h-full overflow-auto bg-slate-50 p-6">
      <h1 className="mb-5 text-xl font-bold text-slate-800">🖥 CEMS Service</h1>

      <div className="mb-5 flex flex-wrap gap-1 rounded-xl bg-slate-200 p-1 w-fit">
        {tabs.map(t => (
          <button key={t.key} onClick={() => t.ready && setTab(t.key)} disabled={!t.ready}
            title={t.ready ? undefined : 'เร็ว ๆ นี้ (เฟสถัดไป)'}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-white text-slate-800 shadow-sm'
              : t.ready ? 'text-slate-500 hover:text-slate-700' : 'cursor-not-allowed text-slate-300'}`}>
            {t.label}{!t.ready && <span className="ml-1 text-[9px]">🔜</span>}
          </button>
        ))}
      </div>

      <div className="rounded-xl bg-white p-5 shadow-sm border border-slate-200">
        {tab === 'analyzers' && <AnalyzerSection />}
        {tab === 'sites'     && <CemsSitesSection />}
        {tab === 'parts'     && <PartsSection />}
        {tab === 'plan'      && <PartPlanSection />}
      </div>
    </div>
  )
}
