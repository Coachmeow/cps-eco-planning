'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import PartWithdrawForm, { type WithdrawSchedule } from '@/components/cems/PartWithdrawForm'

interface PageData {
  part: { id: number; code: string; name: string; unit: string | null; location: string | null; stock: number }
  employees: { id: number; nickname: string | null; fullName: string }[]
  sites: { id: number; code: string }[]
  analyzers: { id: number; tag: string; currentSiteId: number | null }[]
  schedules: WithdrawSchedule[]
}

export default function PartRequestPage() {
  const { token } = useParams<{ token: string }>()
  const [data, setData] = useState<PageData | null>(null)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(false)
  const [doneQty, setDoneQty] = useState(0)
  const [formKey, setFormKey] = useState(0)

  useEffect(() => {
    fetch(`/api/public/cems-part/${token}`).then(async r => {
      if (!r.ok) { setErr('ไม่พบอะไหล่ หรือ QR ไม่ถูกต้อง'); return }
      setData(await r.json())
    }).catch(() => setErr('เชื่อมต่อไม่ได้'))
  }, [token])

  if (err && !data) return <Center><p className="text-red-600">{err}</p></Center>
  if (!data) return <Center><p className="text-slate-400">กำลังโหลด...</p></Center>

  if (done) return (
    <Center>
      <div className="text-center">
        <div className="mb-3 text-5xl">📤</div>
        <p className="text-lg font-bold text-slate-800">ส่งคำขอเบิกแล้ว</p>
        <p className="mt-1 text-sm text-slate-500">{data.part.code} · {doneQty.toLocaleString()} {data.part.unit ?? ''}</p>
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">⏳ รอ CEMS Admin อนุมัติก่อน จึงจะตัด stock</p>
        <button onClick={() => { setDone(false); setFormKey(k => k + 1) }} className="mt-5 rounded-lg bg-slate-700 px-5 py-2 text-sm font-medium text-white">เบิกอีกรายการ</button>
      </div>
    </Center>
  )

  return (
    <div className="h-full overflow-y-auto bg-slate-100 p-4">
      <div className="mx-auto max-w-md pb-10">
        <div className="mb-4 rounded-2xl bg-white p-4 shadow-sm">
          <p className="text-xs font-bold tracking-widest text-emerald-600">Eco Planning System · CEMS เบิกอะไหล่</p>
          <p className="mt-1 text-xl font-bold text-slate-800">🔩 {data.part.code}</p>
          <p className="text-sm text-slate-400">{data.part.name}</p>
          <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
            คงเหลือในสต็อก: <span className="font-bold text-slate-700">{data.part.stock} {data.part.unit ?? ''}</span>
            {data.part.location && <span className="text-slate-400"> · ชั้น {data.part.location}</span>}
          </div>
        </div>

        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <PartWithdrawForm
            key={formKey}
            part={data.part}
            employees={data.employees}
            sites={data.sites}
            analyzers={data.analyzers}
            schedules={data.schedules}
            submitUrl={`/api/public/cems-part/${token}`}
            onDone={r => { setDoneQty(r.qty); setDone(true) }}
          />
        </div>
      </div>
    </div>
  )
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full items-center justify-center overflow-y-auto bg-slate-100 p-4">{children}</div>
}
