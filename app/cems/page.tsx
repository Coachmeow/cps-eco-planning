'use client'

import { useState } from 'react'
import { Gauge, Cpu, Factory, Package, CalendarDays, FlaskConical, Lock, type LucideIcon } from 'lucide-react'
import { useMe } from '@/hooks/useMe'
import AnalyzerSection from '@/components/cems/AnalyzerSection'
import CemsSitesSection from '@/components/cems/CemsSitesSection'
import PartsSection from '@/components/cems/PartsSection'
import PartPlanSection from '@/components/cems/PartPlanSection'
import GasSection from '@/components/cems/GasSection'

type CemsTab = 'analyzers' | 'sites' | 'parts' | 'plan' | 'gas'

export default function CemsPage() {
  const { me, loading, isCemsAdmin } = useMe()
  const [tab, setTab] = useState<CemsTab>('analyzers')

  const allowed = !!me && (me.role === 'ADMIN' || !!me.cemsAccess)

  if (loading) return <div className="flex h-full items-center justify-center text-sm text-slate-400">กำลังโหลด...</div>
  if (!allowed) return (
    <div className="flex h-full flex-col items-center justify-center gap-2 bg-slate-50 p-8">
      <Lock className="h-8 w-8 text-slate-300" />
      <p className="text-sm font-semibold text-slate-600">ไม่มีสิทธิ์เข้าโมดูล CEMS Service</p>
      <p className="text-xs text-slate-400">ติดต่อผู้ดูแลระบบเพื่อขอสิทธิ์ (ติ๊ก CEMS ในหน้าผู้ใช้งาน)</p>
    </div>
  )

  const tabs: { key: CemsTab; label: string; icon: LucideIcon; ready: boolean }[] = [
    { key: 'analyzers', label: 'Analyzer',        icon: Cpu,          ready: true },
    { key: 'sites',     label: 'ไซต์ CEMS',       icon: Factory,      ready: true },
    { key: 'parts',     label: 'Stock อะไหล่',    icon: Package,      ready: true },
    { key: 'plan',      label: 'แผนเปลี่ยนอะไหล่', icon: CalendarDays, ready: true },
    { key: 'gas',       label: 'Standard Gas',    icon: FlaskConical, ready: true },
  ]

  return (
    <div className="h-full overflow-auto bg-slate-50 p-6">
      <div className="mb-5 flex items-center gap-2">
        <h1 className="flex items-center gap-2 text-xl font-bold text-slate-800"><Gauge className="h-5 w-5 text-slate-500" /> CEMS Service</h1>
        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${isCemsAdmin ? 'bg-sky-100 text-sky-700' : 'bg-slate-100 text-slate-500'}`}>
          {isCemsAdmin ? 'CEMS Admin' : 'CEMS User'}
        </span>
        {!isCemsAdmin && <span className="text-[11px] text-slate-400">— ดูข้อมูลและบันทึกงานได้ · อนุมัติ/ลบ/จัดการทะเบียน ต้องเป็น Admin</span>}
      </div>

      <div className="mb-5 flex flex-wrap gap-1 rounded-xl bg-slate-200 p-1 w-fit">
        {tabs.map(t => (
          <button key={t.key} onClick={() => t.ready && setTab(t.key)} disabled={!t.ready}
            title={t.ready ? undefined : 'เร็ว ๆ นี้ (เฟสถัดไป)'}
            className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-white text-slate-800 shadow-sm'
              : t.ready ? 'text-slate-500 hover:text-slate-700' : 'cursor-not-allowed text-slate-300'}`}>
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>

      <div className="rounded-xl bg-white p-5 shadow-sm border border-slate-200">
        {tab === 'analyzers' && <AnalyzerSection canManage={isCemsAdmin} />}
        {tab === 'sites'     && <CemsSitesSection canManage={isCemsAdmin} />}
        {tab === 'parts'     && <PartsSection canManage={isCemsAdmin} />}
        {tab === 'plan'      && <PartPlanSection canManage={isCemsAdmin} />}
        {tab === 'gas'       && <GasSection canManage={isCemsAdmin} />}
      </div>
    </div>
  )
}
