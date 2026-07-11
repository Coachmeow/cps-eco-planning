'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

interface EventRow {
  id: number; type: string; eventDate: string; symptom: string | null; action: string | null
  site: { code: string } | null; vendor: string | null; receiver: string | null; reporter: string | null; notes: string | null
}
interface SiteRow { id: number; code: string }
interface PageData {
  id: number; tag: string; brand: string | null; model: string | null; serialNo: string | null
  parameter: string | null; status: string
  currentSite: { id: number; code: string } | null; homeSite: { id: number; code: string } | null
  sites: SiteRow[]
  events: EventRow[]
}

type Mode = 'ISSUE' | 'MOVE' | 'REPAIR' | 'RETURN' | 'PM'
const ACTIONS: { key: Mode; icon: string; label: string }[] = [
  { key: 'MOVE',   icon: '🚚', label: 'ย้ายที่อยู่' },
  { key: 'REPAIR', icon: '🔧', label: 'ส่งซ่อม' },
  { key: 'RETURN', icon: '✅', label: 'รับคืนจากซ่อม' },
  { key: 'ISSUE',  icon: '⚠️', label: 'แจ้งอาการ' },
  { key: 'PM',     icon: '🛠', label: 'บันทึก PM' },
]
const ACTION_TH: Record<Mode, string> = { ISSUE: 'แจ้งอาการแล้ว', MOVE: 'ย้ายที่อยู่แล้ว', REPAIR: 'บันทึกส่งซ่อมแล้ว', RETURN: 'รับคืนแล้ว', PM: 'บันทึก PM แล้ว' }
const STATUS_TH: Record<string, string> = { READY: 'พร้อมใช้', IN_USE: 'ใช้งานอยู่', REPAIR: 'ส่งซ่อม', RETIRED: 'ปลดระวาง' }
const STATUS_CHIP: Record<string, string> = { READY: 'bg-emerald-100 text-emerald-700', IN_USE: 'bg-sky-100 text-sky-700', REPAIR: 'bg-red-100 text-red-700', RETIRED: 'bg-slate-200 text-slate-500' }
const EVENT_TH: Record<string, string> = { REPAIR: '🔧 ส่งซ่อม', RETURN: '✅ รับคืน', MOVE: '🚚 ย้ายที่', PM: '🛠 เข้า PM', ISSUE: '⚠️ แจ้งอาการ' }
const fmtD = (d: string) => new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })

const inp = 'w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base text-slate-800 focus:border-slate-500 focus:outline-none'
const lbl = 'mb-1 block text-sm font-medium text-slate-600'

const PIN_LEN = 6
const REMEMBER_MS = 7 * 24 * 60 * 60 * 1000 // จำรหัส 7 วัน
const PIN_KEY = 'cemsqr_pin'
function readSavedPin(): string | null {
  try { const o = JSON.parse(localStorage.getItem(PIN_KEY) || 'null'); if (o && o.exp > Date.now()) return o.p } catch {}
  return null
}
function saveSavedPin(p: string) { try { localStorage.setItem(PIN_KEY, JSON.stringify({ p, exp: Date.now() + REMEMBER_MS })) } catch {} }
function clearSavedPin() { try { localStorage.removeItem(PIN_KEY) } catch {} }

export default function CemsAnalyzerPublicPage() {
  const { token } = useParams<{ token: string }>()
  const [pin, setPin] = useState('')
  const [needPin, setNeedPin] = useState(false)
  const [pinInput, setPinInput] = useState('')
  const [data, setData] = useState<PageData | null>(null)
  const [err, setErr]   = useState('')
  const [mode, setMode] = useState<Mode | null>(null)
  const [done, setDone] = useState<Mode | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [symptom, setSymptom]   = useState('')
  const [action, setAction]     = useState('')
  const [siteId, setSiteId]     = useState('')
  const [vendor, setVendor]     = useState('')
  const [receiver, setReceiver] = useState('')
  const [reporter, setReporter] = useState('')
  const [notes, setNotes]       = useState('')

  function resetForm() { setSymptom(''); setAction(''); setSiteId(''); setVendor(''); setReceiver(''); setNotes(''); setErr('') }

  // โหลดข้อมูล พร้อมส่งรหัสรวมทาง header (ถ้ามี) — จัดการ error เอง
  const load = useCallback((tryPin?: string) => {
    const headers: Record<string, string> = {}
    if (tryPin) headers['x-cems-pin'] = tryPin
    return fetch(`/api/public/cems-analyzer/${token}`, { headers }).then(async r => {
      if (r.status === 429) { setNeedPin(true); setData(null); setErr('ลองผิดหลายครั้ง กรุณารอสักครู่แล้วลองใหม่'); return false }
      if (r.status === 401) { setNeedPin(true); setData(null); if (tryPin) { setErr('รหัสไม่ถูกต้อง'); clearSavedPin() } return false }
      if (!r.ok) { setErr('ไม่พบเครื่อง หรือ QR ไม่ถูกต้อง'); return false }
      setNeedPin(false); setErr(''); setData(await r.json()); if (tryPin) setPin(tryPin)
      return true
    }).catch(() => { setErr('เชื่อมต่อไม่ได้'); return false })
  }, [token])

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? readSavedPin() : null
    load(saved || undefined)
  }, [load])

  // auto-submit เมื่อครบ 6 หลัก (ไม่ต้องกดปุ่ม)
  async function trySubmitPin(code: string) {
    const ok = await load(code)
    if (ok) { saveSavedPin(code); setPinInput('') }
  }
  function onPinChange(v: string) {
    const digits = v.replace(/\D/g, '').slice(0, PIN_LEN)
    setPinInput(digits); setErr('')
    if (digits.length === PIN_LEN) trySubmitPin(digits)
  }

  async function submit() {
    if (!mode) return
    if (mode === 'ISSUE'  && !symptom) { setErr('กรอกอาการผิดปกติ'); return }
    if (mode === 'PM'     && !action)  { setErr('กรอกสิ่งที่ทำ'); return }
    if (mode === 'REPAIR' && !vendor)  { setErr('กรอกสถานที่ส่งซ่อม'); return }
    setSubmitting(true); setErr('')
    const body: Record<string, unknown> = {
      type: mode,
      symptom: symptom || undefined, action: action || undefined,
      siteId: mode === 'MOVE' && siteId ? siteId : undefined,
      vendor: vendor || undefined, receiver: receiver || undefined,
      reporter: reporter || undefined, notes: notes || undefined,
    }
    const r = await fetch(`/api/public/cems-analyzer/${token}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(pin ? { 'x-cems-pin': pin } : {}) },
      body: JSON.stringify(body),
    })
    setSubmitting(false)
    if (!r.ok) { const d = await r.json().catch(() => ({})); setErr(d.error ?? 'บันทึกไม่สำเร็จ'); return }
    setDone(mode); setMode(null)
  }

  // ── หน้ารหัสรวม ──────────────────────────────
  if (needPin && !data) return (
    <Center>
      <div className="w-full max-w-xs text-center">
        <div className="mb-3 text-5xl">🔒</div>
        <p className="text-lg font-bold text-slate-800">ใส่รหัสเข้าใช้งาน</p>
        <p className="mt-1 mb-4 text-sm text-slate-400">หน้าอัปเดตเครื่อง CEMS · เฉพาะเจ้าหน้าที่</p>
        <input type="password" inputMode="numeric" autoComplete="off" value={pinInput} autoFocus
          maxLength={PIN_LEN}
          onChange={e => onPinChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && pinInput) trySubmitPin(pinInput) }}
          className={`${inp} text-center text-2xl tracking-[0.5em]`} placeholder="••••••" />
        {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
        <button onClick={() => pinInput && trySubmitPin(pinInput)}
          className="mt-4 w-full rounded-xl bg-slate-700 py-3 text-base font-semibold text-white hover:bg-slate-800">เข้าใช้งาน</button>
        <p className="mt-3 text-[11px] text-slate-400">ใส่รหัส {PIN_LEN} หลัก · จำไว้ 7 วันในเครื่องนี้</p>
      </div>
    </Center>
  )

  if (err && !data) return <Center><p className="text-red-600">{err}</p></Center>
  if (!data) return <Center><p className="text-slate-400">กำลังโหลด...</p></Center>

  if (done) return (
    <Center>
      <div className="text-center">
        <div className="mb-3 text-5xl">✅</div>
        <p className="text-lg font-bold text-slate-800">{ACTION_TH[done]}</p>
        <p className="mt-1 text-sm text-slate-500">{data.tag}</p>
        <button onClick={() => { setDone(null); resetForm(); load(pin || undefined) }}
          className="mt-5 rounded-lg bg-slate-700 px-5 py-2 text-sm font-medium text-white">เสร็จสิ้น</button>
      </div>
    </Center>
  )

  const siteOptions = [{ id: 0, code: 'หน่วยงาน (Pool)' }, ...data.sites]

  return (
    <div className="h-full overflow-y-auto bg-slate-100 p-4">
      <div className="mx-auto max-w-md pb-10">
        {/* header */}
        <div className="mb-4 rounded-2xl bg-white p-4 shadow-sm">
          <p className="text-xs font-bold tracking-widest text-sky-600">CPS ECO · CEMS SERVICE</p>
          <p className="mt-1 text-xl font-bold text-slate-800">📟 {data.tag}</p>
          <p className="text-sm text-slate-400">{[data.brand, data.model, data.serialNo].filter(Boolean).join(' · ')}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
            {data.parameter && <span className="rounded-lg bg-slate-50 px-2 py-1">วัด <b>{data.parameter}</b></span>}
            <span className={`rounded-lg px-2 py-1 text-xs font-semibold ${STATUS_CHIP[data.status] ?? 'bg-slate-100 text-slate-600'}`}>{STATUS_TH[data.status] ?? data.status}</span>
            <span className="rounded-lg bg-slate-50 px-2 py-1">อยู่ที่ <b>{data.currentSite?.code ?? 'หน่วยงาน'}</b></span>
          </div>
        </div>

        {/* action menu */}
        <div className="mb-4 grid grid-cols-3 gap-2">
          {ACTIONS.map(a => (
            <button key={a.key} onClick={() => { setMode(m => m === a.key ? null : a.key); resetForm() }}
              className={`flex flex-col items-center gap-1 rounded-xl py-3 text-xs font-semibold ${mode === a.key ? 'bg-sky-600 text-white' : 'bg-white text-slate-600'}`}>
              <span className="text-lg">{a.icon}</span>{a.label}
            </button>
          ))}
        </div>

        {/* ฟอร์มตาม action */}
        {mode && (
          <div className="space-y-4 rounded-2xl bg-white p-4 shadow-sm">
            {mode === 'ISSUE' && (
              <div><label className={lbl}>อาการผิดปกติ *</label>
                <textarea value={symptom} onChange={e => setSymptom(e.target.value)} rows={3} className={inp} placeholder="เช่น ค่า NOx อ่านสูงผิดปกติ, เครื่อง alarm..." /></div>
            )}

            {mode === 'MOVE' && (
              <div><label className={lbl}>ย้ายไปที่ *</label>
                <select value={siteId} onChange={e => setSiteId(e.target.value)} className={inp}>
                  {siteOptions.map(s => <option key={s.id} value={s.id === 0 ? '' : s.id}>{s.code}</option>)}
                </select>
                <p className="mt-1 text-xs text-slate-400">สถานะจะเปลี่ยนอัตโนมัติ: มีไซต์ = ใช้งานอยู่ · หน่วยงาน = พร้อมใช้</p></div>
            )}

            {mode === 'REPAIR' && (<>
              <div><label className={lbl}>สถานที่ส่งซ่อม / บริษัท *</label>
                <input value={vendor} onChange={e => setVendor(e.target.value)} className={inp} placeholder="เช่น บ. เบโค กรุงเทพฯ" /></div>
              <div><label className={lbl}>ชื่อผู้รับเครื่อง (ฝั่งผู้ซ่อม)</label>
                <input value={receiver} onChange={e => setReceiver(e.target.value)} className={inp} placeholder="เช่น คุณสมชาย" /></div>
              <div><label className={lbl}>อาการ / สาเหตุที่ส่งซ่อม</label>
                <textarea value={symptom} onChange={e => setSymptom(e.target.value)} rows={2} className={inp} placeholder="เช่น เซนเซอร์เสีย, ค่าเพี้ยน" /></div>
              <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">สถานะเครื่องจะเปลี่ยนเป็น “ส่งซ่อม”</p>
            </>)}

            {mode === 'RETURN' && (<>
              <div><label className={lbl}>ผลการซ่อม / สิ่งที่ทำ</label>
                <textarea value={action} onChange={e => setAction(e.target.value)} rows={2} className={inp} placeholder="เช่น เปลี่ยนเซลล์แล้ว ใช้งานได้ปกติ" /></div>
              <div><label className={lbl}>ซ่อมโดย (บริษัท/ผู้ซ่อม)</label>
                <input value={vendor} onChange={e => setVendor(e.target.value)} className={inp} placeholder="บ. ..." /></div>
              <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">สถานะเครื่องจะเปลี่ยนเป็น “พร้อมใช้”</p>
            </>)}

            {mode === 'PM' && (
              <div><label className={lbl}>สิ่งที่ทำ / ผลการเข้า PM *</label>
                <textarea value={action} onChange={e => setAction(e.target.value)} rows={3} className={inp} placeholder="เช่น เปลี่ยนฟิลเตอร์, สอบเทียบด้วยแก๊สมาตรฐาน..." /></div>
            )}

            <div><label className={lbl}>ชื่อผู้แจ้ง/ผู้ปฏิบัติ</label><input value={reporter} onChange={e => setReporter(e.target.value)} className={inp} /></div>
            <div><label className={lbl}>หมายเหตุ</label><input value={notes} onChange={e => setNotes(e.target.value)} className={inp} placeholder="..." /></div>

            {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{err}</div>}
            <button onClick={submit} disabled={submitting}
              className="w-full rounded-xl bg-sky-600 py-3 text-base font-semibold text-white hover:bg-sky-700 disabled:opacity-50">
              {submitting ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
          </div>
        )}

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
                  {(ev.vendor || ev.receiver) && <p className="mt-0.5 text-slate-400">{ev.vendor && `ส่งซ่อม: ${ev.vendor}`}{ev.vendor && ev.receiver && ' · '}{ev.receiver && `ผู้รับ: ${ev.receiver}`}</p>}
                  {ev.reporter && <p className="mt-0.5 text-slate-400">โดย {ev.reporter}</p>}
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
