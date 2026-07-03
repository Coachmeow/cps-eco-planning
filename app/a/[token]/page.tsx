'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

interface EventRow {
  id: number; type: string; eventDate: string; symptom: string | null; action: string | null
  site: { code: string } | null; reporter: string | null
}
interface PageData {
  id: number; tag: string; brand: string | null; model: string | null; serialNo: string | null
  parameter: string | null; status: string
  currentSite: { code: string } | null; homeSite: { code: string } | null
  events: EventRow[]
}

const STATUS_TH: Record<string, string> = { READY: 'พร้อมใช้', IN_USE: 'ใช้งานอยู่', REPAIR: 'ส่งซ่อม', RETIRED: 'ปลดระวาง' }
const EVENT_TH: Record<string, string> = { REPAIR: '🔧 ส่งซ่อม', RETURN: '✅ รับคืน', MOVE: '🚚 ย้ายที่', PM: '🛠 เข้า PM', ISSUE: '⚠️ แจ้งอาการ' }
const fmtD = (d: string) => new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })

export default function CemsAnalyzerPublicPage() {
  const { token } = useParams<{ token: string }>()
  const [data, setData] = useState<PageData | null>(null)
  const [err, setErr]   = useState('')
  const [mode, setMode] = useState<'ISSUE' | 'PM'>('ISSUE')
  const [done, setDone] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const [symptom, setSymptom]   = useState('')
  const [action, setAction]     = useState('')
  const [reporter, setReporter] = useState('')
  const [notes, setNotes]       = useState('')

  const load = useCallback(() => {
    fetch(`/api/public/cems-analyzer/${token}`).then(async r => {
      if (!r.ok) { setErr('ไม่พบเครื่อง หรือ QR ไม่ถูกต้อง'); return }
      setData(await r.json())
    }).catch(() => setErr('เชื่อมต่อไม่ได้'))
  }, [token])
  useEffect(() => { load() }, [load])

  async function submit() {
    if (mode === 'ISSUE' && !symptom) { setErr('กรอกอาการผิดปกติ'); return }
    if (mode === 'PM' && !action)     { setErr('กรอกสิ่งที่ทำ'); return }
    setSubmitting(true); setErr('')
    const r = await fetch(`/api/public/cems-analyzer/${token}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: mode, symptom: symptom || undefined, action: action || undefined, reporter: reporter || undefined, notes: notes || undefined }),
    })
    setSubmitting(false)
    if (!r.ok) { const d = await r.json().catch(() => ({})); setErr(d.error ?? 'บันทึกไม่สำเร็จ'); return }
    setDone(true)
  }

  if (err && !data) return <Center><p className="text-red-600">{err}</p></Center>
  if (!data) return <Center><p className="text-slate-400">กำลังโหลด...</p></Center>

  if (done) return (
    <Center>
      <div className="text-center">
        <div className="mb-3 text-5xl">✅</div>
        <p className="text-lg font-bold text-slate-800">{mode === 'ISSUE' ? 'แจ้งอาการแล้ว' : 'บันทึก PM แล้ว'}</p>
        <p className="mt-1 text-sm text-slate-500">{data.tag}</p>
        <button onClick={() => { setDone(false); setSymptom(''); setAction(''); setNotes(''); load() }}
          className="mt-5 rounded-lg bg-slate-700 px-5 py-2 text-sm font-medium text-white">เสร็จสิ้น</button>
      </div>
    </Center>
  )

  const inp = 'w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base text-slate-800 focus:border-slate-500 focus:outline-none'
  const lbl = 'mb-1 block text-sm font-medium text-slate-600'

  return (
    <div className="h-full overflow-y-auto bg-slate-100 p-4">
      <div className="mx-auto max-w-md pb-10">
        {/* header */}
        <div className="mb-4 rounded-2xl bg-white p-4 shadow-sm">
          <p className="text-xs font-bold tracking-widest text-sky-600">CPS ECO · CEMS SERVICE</p>
          <p className="mt-1 text-xl font-bold text-slate-800">📟 {data.tag}</p>
          <p className="text-sm text-slate-400">{[data.brand, data.model, data.serialNo].filter(Boolean).join(' · ')}</p>
          <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
            {data.parameter && <>วัด <b>{data.parameter}</b> · </>}
            สถานะ <b>{STATUS_TH[data.status] ?? data.status}</b> · อยู่ที่ <b>{data.currentSite?.code ?? 'หน่วยงาน'}</b>
          </div>
        </div>

        {/* mode toggle */}
        <div className="mb-4 grid grid-cols-2 gap-2">
          <button onClick={() => setMode('ISSUE')} className={`rounded-xl py-3 text-sm font-semibold ${mode === 'ISSUE' ? 'bg-slate-700 text-white' : 'bg-white text-slate-500'}`}>⚠️ แจ้งอาการผิดปกติ</button>
          <button onClick={() => setMode('PM')} className={`rounded-xl py-3 text-sm font-semibold ${mode === 'PM' ? 'bg-slate-700 text-white' : 'bg-white text-slate-500'}`}>🛠 บันทึกเข้า PM</button>
        </div>

        <div className="space-y-4 rounded-2xl bg-white p-4 shadow-sm">
          {mode === 'ISSUE' ? (
            <div><label className={lbl}>อาการผิดปกติ *</label>
              <textarea value={symptom} onChange={e => setSymptom(e.target.value)} rows={3} className={inp} placeholder="เช่น ค่า NOx อ่านสูงผิดปกติ, เครื่อง alarm..." /></div>
          ) : (
            <div><label className={lbl}>สิ่งที่ทำ / ผลการเข้า PM *</label>
              <textarea value={action} onChange={e => setAction(e.target.value)} rows={3} className={inp} placeholder="เช่น เปลี่ยนฟิลเตอร์, สอบเทียบด้วยแก๊สมาตรฐาน..." /></div>
          )}
          <div><label className={lbl}>ชื่อผู้แจ้ง/ผู้ปฏิบัติ</label><input value={reporter} onChange={e => setReporter(e.target.value)} className={inp} /></div>
          <div><label className={lbl}>หมายเหตุ</label><input value={notes} onChange={e => setNotes(e.target.value)} className={inp} placeholder="..." /></div>

          {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{err}</div>}
          <button onClick={submit} disabled={submitting}
            className="w-full rounded-xl bg-sky-600 py-3 text-base font-semibold text-white hover:bg-sky-700 disabled:opacity-50">
            {submitting ? 'กำลังบันทึก...' : mode === 'ISSUE' ? '⚠️ ส่งแจ้งอาการ' : '🛠 บันทึก PM'}
          </button>
        </div>

        {/* ประวัติล่าสุด */}
        <div className="mt-4 rounded-2xl bg-white p-4 shadow-sm">
          <p className="mb-2 text-xs font-semibold text-slate-500">ประวัติล่าสุด</p>
          {data.events.length === 0 ? <p className="py-2 text-center text-xs text-slate-300">ยังไม่มี</p> : (
            <div className="space-y-1.5">
              {data.events.map(ev => (
                <div key={ev.id} className="rounded-lg border border-slate-100 px-3 py-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">{EVENT_TH[ev.type] ?? ev.type}{ev.type === 'MOVE' && ` → ${ev.site?.code ?? 'หน่วยงาน'}`}</span>
                    <span className="text-slate-400">{fmtD(ev.eventDate)}</span>
                  </div>
                  {(ev.symptom || ev.action) && <p className="mt-0.5 text-slate-500">{ev.symptom ?? ev.action}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full items-center justify-center overflow-y-auto bg-slate-100 p-4">{children}</div>
}
