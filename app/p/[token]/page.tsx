'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

interface PageData {
  part: { id: number; code: string; name: string; unit: string | null; location: string | null; stock: number }
  employees: { id: number; nickname: string | null; fullName: string }[]
  sites: { id: number; code: string }[]
  analyzers: { id: number; tag: string; currentSiteId: number | null }[]
}

export default function PartRequestPage() {
  const { token } = useParams<{ token: string }>()
  const [data, setData] = useState<PageData | null>(null)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const [requesterId, setRequesterId] = useState('')
  const [qty, setQty] = useState('1')
  const [siteId, setSiteId] = useState('')
  const [manualSite, setManualSite] = useState('')
  const [analyzerId, setAnalyzerId] = useState('')
  const [quoteNo, setQuoteNo] = useState('')
  const [note, setNote] = useState('')

  useEffect(() => {
    fetch(`/api/public/cems-part/${token}`).then(async r => {
      if (!r.ok) { setErr('ไม่พบอะไหล่ หรือ QR ไม่ถูกต้อง'); return }
      setData(await r.json())
    }).catch(() => setErr('เชื่อมต่อไม่ได้'))
  }, [token])

  async function submit() {
    if (!requesterId) { setErr('เลือกผู้เบิก'); return }
    if (!qty || parseInt(qty) <= 0) { setErr('กรอกจำนวน'); return }
    setSubmitting(true); setErr('')
    const body = {
      requesterId, qty: parseInt(qty),
      siteId: siteId || undefined, manualSite: manualSite || undefined,
      analyzerId: analyzerId || undefined, quoteNo: quoteNo || undefined, note: note || undefined,
    }
    const r = await fetch(`/api/public/cems-part/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    setSubmitting(false)
    if (!r.ok) { const d = await r.json().catch(() => ({})); setErr(d.error ?? 'ส่งคำขอไม่สำเร็จ'); return }
    setDone(true)
  }

  if (err && !data) return <Center><p className="text-red-600">{err}</p></Center>
  if (!data) return <Center><p className="text-slate-400">กำลังโหลด...</p></Center>

  if (done) return (
    <Center>
      <div className="text-center">
        <div className="mb-3 text-5xl">📤</div>
        <p className="text-lg font-bold text-slate-800">ส่งคำขอเบิกแล้ว</p>
        <p className="mt-1 text-sm text-slate-500">{data.part.code} · {parseInt(qty).toLocaleString()} {data.part.unit ?? ''}</p>
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">⏳ รอ CEMS Admin อนุมัติก่อน จึงจะตัด stock</p>
        <button onClick={() => { setDone(false); setQty('1'); setNote(''); setQuoteNo('') }} className="mt-5 rounded-lg bg-slate-700 px-5 py-2 text-sm font-medium text-white">เบิกอีกรายการ</button>
      </div>
    </Center>
  )

  const inp = 'w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base text-slate-800 focus:border-slate-500 focus:outline-none'
  const lbl = 'mb-1 block text-sm font-medium text-slate-600'
  const anOpts = [...data.analyzers].sort((a, b) => {
    const sid = siteId ? parseInt(siteId) : null
    return (a.currentSiteId === sid ? 0 : 1) - (b.currentSiteId === sid ? 0 : 1)
  })

  return (
    <div className="h-full overflow-y-auto bg-slate-100 p-4">
      <div className="mx-auto max-w-md pb-10">
        <div className="mb-4 rounded-2xl bg-white p-4 shadow-sm">
          <p className="text-xs font-bold tracking-widest text-emerald-600">CPS ECO · CEMS เบิกอะไหล่</p>
          <p className="mt-1 text-xl font-bold text-slate-800">🔩 {data.part.code}</p>
          <p className="text-sm text-slate-400">{data.part.name}</p>
          <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
            คงเหลือในสต็อก: <span className="font-bold text-slate-700">{data.part.stock} {data.part.unit ?? ''}</span>
            {data.part.location && <span className="text-slate-400"> · ชั้น {data.part.location}</span>}
          </div>
        </div>

        <div className="space-y-4 rounded-2xl bg-white p-4 shadow-sm">
          <div>
            <label className={lbl}>ผู้เบิก (พนักงาน) *</label>
            <select value={requesterId} onChange={e => setRequesterId(e.target.value)} className={inp}>
              <option value="">— เลือกผู้เบิก —</option>
              {data.employees.map(e => <option key={e.id} value={e.id}>{e.nickname ?? e.fullName}</option>)}
            </select>
          </div>
          <div>
            <label className={lbl}>จำนวนที่เบิก ({data.part.unit ?? 'หน่วย'}) *</label>
            <input type="number" inputMode="numeric" value={qty} onChange={e => setQty(e.target.value)} className={inp} />
          </div>
          <div>
            <label className={lbl}>ไซต์ที่นำไปใช้</label>
            <select value={siteId} onChange={e => { setSiteId(e.target.value); if (e.target.value) setManualSite('') }} className={inp}>
              <option value="">— เลือกไซต์ —</option>
              {data.sites.map(s => <option key={s.id} value={s.id}>{s.code}</option>)}
            </select>
            <input value={manualSite} onChange={e => { setManualSite(e.target.value); if (e.target.value) setSiteId('') }} placeholder="หรือพิมพ์ชื่อไซต์นอกฐานข้อมูล" className={`${inp} mt-1.5`} />
          </div>
          <div>
            <label className={lbl}>ใช้กับเครื่อง (Analyzer)</label>
            <select value={analyzerId} onChange={e => setAnalyzerId(e.target.value)} className={inp}>
              <option value="">— ไม่ระบุ —</option>
              {anOpts.map(a => <option key={a.id} value={a.id}>{a.tag}</option>)}
            </select>
          </div>
          <div><label className={lbl}>เลขใบเสนอราคา</label><input value={quoteNo} onChange={e => setQuoteNo(e.target.value)} className={inp} placeholder="เช่น QT2026-001" /></div>
          <div><label className={lbl}>หมายเหตุ</label><input value={note} onChange={e => setNote(e.target.value)} className={inp} placeholder="..." /></div>

          {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{err}</div>}
          <button onClick={submit} disabled={submitting} className="w-full rounded-xl bg-emerald-600 py-3 text-base font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
            {submitting ? 'กำลังส่ง...' : 'ส่งคำขอเบิก'}
          </button>
          <p className="text-center text-[11px] text-slate-400">คำขอจะรอ CEMS Admin อนุมัติก่อนตัด stock</p>
        </div>
      </div>
    </div>
  )
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full items-center justify-center overflow-y-auto bg-slate-100 p-4">{children}</div>
}
